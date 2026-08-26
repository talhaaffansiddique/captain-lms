<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import ThemeToggle from '@/components/ThemeToggle.vue'

const auth = useAuthStore()
const router = useRouter()

async function logout() {
  await auth.signOut()
  router.push('/login')
}

const links = [
  { to: '/app/dashboard', label: 'Dashboard', short: 'Home', icon: '●' },
  { to: '/app/modules', label: 'Modules', short: 'Modules', icon: '▤' },
  { to: '/app/badges', label: 'My Badges', short: 'Badges', icon: '★' },
  { to: '/app/leaderboard', label: 'Leaderboard', short: 'Board', icon: '▲' },
  { to: '/app/account', label: 'Account', short: 'Account', icon: '⚙' },
]

const initials = () =>
  (auth.profile?.full_name ?? '')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
</script>

<template>
  <div class="shell active">
    <aside class="rail">
      <div class="brandmark"><span class="mark">C</span><span>Captain LMS</span></div>
      <RouterLink v-for="l in links" :key="l.to" :to="l.to" class="navlink"
        ><span>{{ l.icon }}</span> {{ l.label }}</RouterLink
      >
      <div class="rail-foot">
        <ThemeToggle variant="mini" />
        <div class="who">
          <div class="avatar">{{ initials() }}</div>
          <div>
            <div class="nm">{{ auth.profile?.full_name }}</div>
            <div class="rl">{{ auth.profile?.department?.toUpperCase() }}</div>
          </div>
        </div>
        <button class="signout" @click="logout">Sign out</button>
      </div>
    </aside>

    <div class="main">
      <div class="mobile-topbar">
        <div class="brandmark"><span class="mark">C</span><span>Captain LMS</span></div>
        <div style="display: flex; align-items: center; gap: 4px">
          <ThemeToggle variant="icon" />
          <button
            class="theme-cycle-btn"
            style="color: #e08975"
            title="Sign out"
            @click="logout"
          >
            ⏻
          </button>
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
