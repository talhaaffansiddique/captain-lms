<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import BaseModal from '@/components/BaseModal.vue'
import type { Notification } from '@/lib/database.types'

withDefaults(defineProps<{ variant?: 'navlink' | 'icon' }>(), { variant: 'navlink' })

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

async function openModal() {
  open.value = true
  // Matches the demo: opening the panel marks everything as read.
  const unread = items.value.filter((n) => !n.read)
  if (unread.length) {
    await supabase
      .from('notifications')
      .update({ read: true })
      .in(
        'id',
        unread.map((n) => n.id),
      )
    for (const n of unread) n.read = true
  }
}

function handleClick(n: Notification) {
  open.value = false
  if (n.action?.type === 'open-quiz') router.push(`/app/quiz/${n.action.milestone}`)
  else if (n.action?.type === 'goto') router.push(`/app/${n.action.view}`)
}
</script>

<template>
  <button
    v-if="variant === 'navlink'"
    class="navlink"
    style="justify-content: space-between; width: 100%"
    @click="openModal"
  >
    <span style="display: flex; align-items: center; gap: 10px">
      <span :class="{ shake: unreadCount > 0 }">🔔</span>
      Notifications
    </span>
    <span v-if="unreadCount > 0" class="bell-count">{{ unreadCount }}</span>
  </button>

  <button v-else class="theme-cycle-btn bell-btn-icon" title="Notifications" @click="openModal">
    🔔
    <span v-if="unreadCount > 0" class="bell-count bell-count-icon">{{ unreadCount }}</span>
  </button>

  <BaseModal v-if="open" title="Notifications" @close="open = false">
    <div v-if="!items.length" style="padding: 10px 0; color: var(--ink-soft); font-size: 13.5px">You're all caught up.</div>
    <button
      v-for="n in items"
      :key="n.id"
      class="notif-row"
      :class="{ clickable: !!n.action }"
      :disabled="!n.action"
      @click="n.action && handleClick(n)"
    >
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px">
        <span>{{ n.text }}</span>
        <span v-if="n.action" style="font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--brass-strong); flex: none">
          View →
        </span>
      </div>
      <div style="font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-soft); margin-top: 3px">
        {{ new Date(n.created_at).toLocaleString() }}
      </div>
    </button>
  </BaseModal>
</template>

<style scoped>
.bell-count {
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
  flex: none;
}
.bell-count-icon {
  position: absolute;
  top: 2px;
  right: 2px;
}
.bell-btn-icon {
  position: relative;
}
.shake {
  display: inline-block;
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
.notif-row {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  border-top: 1px solid var(--border);
  padding: 10px 0;
  font-size: 13.5px;
  color: var(--ink);
  font-family: 'Public Sans', sans-serif;
}
.notif-row:first-child {
  border-top: none;
}
.notif-row.clickable {
  cursor: pointer;
  margin: 0 -8px;
  padding: 10px 8px;
  border-radius: 8px;
  width: calc(100% + 16px);
}
.notif-row.clickable:hover {
  background: var(--surface-sunken);
}
</style>
