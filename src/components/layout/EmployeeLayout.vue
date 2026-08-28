<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { loadTrackData, pendingMilestones } from '@/lib/quiz'
import ThemeToggle from '@/components/ThemeToggle.vue'
import NotificationsBell from '@/components/NotificationsBell.vue'
import VersionTag from '@/components/VersionTag.vue'

const auth = useAuthStore()
const router = useRouter()
const hasPendingQuiz = ref(false)

onMounted(async () => {
  if (!auth.profile) return
  const { track, completions, attempts, grants } = await loadTrackData(auth.profile.id, auth.profile.department)
  hasPendingQuiz.value = pendingMilestones(track, completions, attempts, grants).length > 0
})

async function logout() {
  await auth.signOut()
  router.push('/login')
}

const links = [
  { to: '/app/dashboard', label: 'Dashboard', short: 'Home', icon: '●' },
  { to: '/app/modules', label: 'Modules', short: 'Modules', icon: '▤', dot: true },
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
      <RouterLink v-for="l in links" :key="l.to" :to="l.to" class="navlink" style="position: relative"
        ><span>{{ l.icon }}</span> {{ l.label }}
        <span v-if="l.dot && hasPendingQuiz" class="navlink-dot"></span
      ></RouterLink>
      <NotificationsBell variant="navlink" />
      <div class="rail-foot">
        <div style="display: flex; align-items: center; gap: 6px">
          <ThemeToggle variant="mini" />
        </div>
        <div class="who">
          <div class="avatar">{{ initials() }}</div>
          <div>
            <div class="nm">{{ auth.profile?.full_name }}</div>
            <div class="rl">{{ auth.profile?.department?.toUpperCase() }}</div>
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
          <NotificationsBell variant="icon" />
          <button
            class="theme-cycle-btn"
            style="color: #e08975"
            title="Sign out"
            @click="logout"
          >
            ⏻
          </button>
          <VersionTag />
        </div>
      </div>

      <RouterView />

      <nav class="mobile-tabbar">
        <RouterLink v-for="l in links" :key="l.to" :to="l.to" class="navlink" style="position: relative"
          ><span>{{ l.icon }}</span> {{ l.short }}
          <span v-if="l.dot && hasPendingQuiz" class="navlink-dot"></span
        ></RouterLink>
      </nav>
    </div>
  </div>
</template>
