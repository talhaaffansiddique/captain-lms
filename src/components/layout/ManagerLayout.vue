<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import ThemeToggle from '@/components/ThemeToggle.vue'
import VersionTag from '@/components/VersionTag.vue'
import { initialsOf } from '@/lib/employees'
import { useWidgetsStore } from '@/stores/widgets'

const auth = useAuthStore()
const router = useRouter()
const widgets = useWidgetsStore()
onMounted(() => void widgets.load())

async function logout() {
  await auth.signOut()
  router.push('/login')
}

const allLinks = [
  { to: '/manager/overview', label: 'Team progress', short: 'Progress', icon: '▦' },
  { to: '/manager/heatmap', label: 'Team heatmap', short: 'Heatmap', icon: '🔥', widget: 'mgr.heatmap' },
  { to: '/manager/team', label: 'My Team', short: 'Team', icon: '👥' },
]
const links = computed(() => allLinks.filter((l) => !('widget' in l) || widgets.isVisible(l.widget as string)))
</script>

<template>
  <div class="shell active">
    <aside class="rail">
      <div class="brandmark"><span class="mark">C</span><span>Captain LMS · Manager</span></div>
      <RouterLink v-for="l in links" :key="l.to" :to="l.to" class="navlink"
        ><span>{{ l.icon }}</span> {{ l.label }}</RouterLink
      >
      <div class="rail-foot">
        <ThemeToggle variant="mini" />
        <div class="who">
          <div class="avatar">{{ initialsOf(auth.profile?.full_name) }}</div>
          <div>
            <div class="nm">{{ auth.profile?.full_name }}</div>
            <div class="rl">{{ auth.profile?.department?.toUpperCase() }} MANAGER</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px">
          <button class="signout" style="width: auto" @click="logout">Sign out</button>
          <VersionTag />
        </div>
      </div>
    </aside>

    <div class="main">
      <div class="mobile-topbar">
        <div class="brandmark"><span class="mark">C</span><span>Captain LMS</span></div>
        <div style="display: flex; align-items: center; gap: 4px">
          <ThemeToggle variant="icon" />
          <button class="theme-cycle-btn" style="color: #e08975" title="Sign out" @click="logout">⏻</button>
          <VersionTag />
        </div>
      </div>

      <RouterView />

      <nav class="mobile-tabbar">
        <RouterLink v-for="l in links" :key="l.to" :to="l.to" class="navlink"
          ><span>{{ l.icon }}</span> {{ l.short }}</RouterLink
        >
      </nav>
    </div>
  </div>
</template>
