<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { loadTrackData, pendingMilestones } from '@/lib/quiz'
import ThemeToggle from '@/components/ThemeToggle.vue'
import NotificationsBell from '@/components/NotificationsBell.vue'
import VersionTag from '@/components/VersionTag.vue'
import WeeklyGoal from '@/components/WeeklyGoal.vue'
import { useWidgetsStore } from '@/stores/widgets'
import { initialsOf } from '@/lib/employees'

const auth = useAuthStore()
const router = useRouter()
const hasPendingQuiz = ref(false)
const widgets = useWidgetsStore()

onMounted(async () => {
  void widgets.load()
  if (!auth.profile) return
  const { track, completions, attempts, grants } = await loadTrackData(auth.profile.id, auth.profile.department)
  hasPendingQuiz.value = pendingMilestones(track, completions, attempts, grants).length > 0
})

async function logout() {
  await auth.signOut()
  router.push('/login')
}

const allLinks = [
  { to: '/app/dashboard', label: 'Dashboard', short: 'Home', icon: '▦' },
  { to: '/app/catalog', label: 'Course catalog', short: 'Courses', icon: '▤' },
  { to: '/app/modules', label: 'My learning', short: 'Learning', icon: '▶', dot: true },
  { to: '/app/badges', label: 'Certificates & badges', short: 'Badges', icon: '🏆', widget: 'emp.certs' },
  { to: '/app/leaderboard', label: 'Leaderboard', short: 'Board', icon: '🏅', widget: 'emp.leaderboard' },
  { to: '/app/calendar', label: 'Deadlines', short: 'Dates', icon: '📅', widget: 'emp.calendar' },
  { to: '/app/account', label: 'Account', short: 'Account', icon: '⚙' },
]

const links = computed(() => allLinks.filter((l) => !('widget' in l) || widgets.isVisible(l.widget as string)))

const initials = () => initialsOf(auth.profile?.full_name)
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
      <WeeklyGoal />
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
