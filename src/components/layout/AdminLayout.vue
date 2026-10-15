<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import ThemeToggle from '@/components/ThemeToggle.vue'
import VersionTag from '@/components/VersionTag.vue'
import { initialsOf } from '@/lib/employees'

const auth = useAuthStore()
const router = useRouter()

async function logout() {
  await auth.signOut()
  router.push('/login')
}

const links = [
  { to: '/admin/overview', label: 'Overview', short: 'Overview', icon: '■' },
  { to: '/admin/employees', label: 'Employees', short: 'People', icon: '👥' },
  { to: '/admin/courses', label: 'Courses', short: 'Courses', icon: '🎓' },
  { to: '/admin/modules', label: 'Modules (lessons)', short: 'Lessons', icon: '▤' },
  { to: '/admin/audiences', label: 'Audiences', short: 'Audiences', icon: '🏷️' },
  { to: '/admin/release-notes', label: 'Release notes', short: 'Releases', icon: '📝' },
]
</script>

<template>
  <div class="shell active">
    <aside class="rail">
      <div class="brandmark"><span class="mark">C</span><span>Captain LMS · Admin</span></div>
      <RouterLink v-for="l in links" :key="l.to" :to="l.to" class="navlink"
        ><span>{{ l.icon }}</span> {{ l.label }}</RouterLink
      >
      <div class="rail-foot">
        <ThemeToggle variant="mini" />
        <div class="who">
          <div class="avatar">{{ initialsOf(auth.profile?.full_name) }}</div>
          <div>
            <div class="nm">{{ auth.profile?.full_name }}</div>
            <div class="rl">ADMIN</div>
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
