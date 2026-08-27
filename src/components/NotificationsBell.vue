<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { Notification } from '@/lib/database.types'

const auth = useAuthStore()
const router = useRouter()
const items = ref<Notification[]>([])
const open = ref(false)

const unreadCount = computed(() => items.value.filter((n) => !n.read).length)

async function load() {
  if (!auth.profile) return
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', auth.profile.id)
    .order('created_at', { ascending: false })
    .limit(20)
  items.value = data ?? []
}

onMounted(load)
defineExpose({ load })

function toggle() {
  open.value = !open.value
}

async function handleClick(n: Notification) {
  if (!n.read) {
    await supabase.from('notifications').update({ read: true }).eq('id', n.id)
    n.read = true
  }
  open.value = false
  if (n.action?.type === 'open-quiz') router.push(`/app/quiz/${n.action.milestone}`)
  else if (n.action?.type === 'goto') router.push(`/app/${n.action.view}`)
}
</script>

<template>
  <div class="notif-wrap">
    <button class="theme-cycle-btn" :class="{ shake: unreadCount > 0 }" title="Notifications" @click="toggle">
      🔔
      <span v-if="unreadCount > 0" class="notif-badge">{{ unreadCount }}</span>
    </button>
    <div v-if="open" class="notif-panel">
      <div v-if="!items.length" class="notif-empty">No notifications yet.</div>
      <button v-for="n in items" :key="n.id" class="notif-item" :class="{ unread: !n.read }" @click="handleClick(n)">
        {{ n.text }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.notif-wrap {
  position: relative;
}
.notif-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 15px;
  height: 15px;
  padding: 0 3px;
  border-radius: 999px;
  background: var(--danger);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 15px;
  text-align: center;
  animation: notif-pulse 1.6s ease-in-out infinite;
}
.shake {
  animation: notif-shake 2.4s ease-in-out infinite;
}
@keyframes notif-shake {
  0%,
  92%,
  100% {
    transform: rotate(0);
  }
  93% {
    transform: rotate(-12deg);
  }
  94% {
    transform: rotate(10deg);
  }
  95% {
    transform: rotate(-8deg);
  }
  96% {
    transform: rotate(6deg);
  }
  97% {
    transform: rotate(0);
  }
}
@keyframes notif-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(224, 137, 117, 0.6);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(224, 137, 117, 0);
  }
}
.notif-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 300px;
  max-height: 360px;
  overflow-y: auto;
  background: var(--surface);
  color: var(--ink);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
  z-index: 40;
  padding: 6px;
}
.notif-empty {
  padding: 18px;
  text-align: center;
  color: var(--ink-soft);
  font-size: 13px;
}
.notif-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border-radius: 8px;
  border: 0;
  background: transparent;
  color: var(--ink);
  font-size: 13px;
  line-height: 1.4;
  cursor: pointer;
}
.notif-item:hover {
  background: var(--surface-sunken);
}
.notif-item.unread {
  font-weight: 600;
  position: relative;
  padding-left: 20px;
}
.notif-item.unread::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 15px;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--brass);
}
</style>
