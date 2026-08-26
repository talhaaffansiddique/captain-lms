<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

async function logout() {
  await auth.signOut()
  router.push('/login')
}

const links = [
  { to: '/manager/overview', label: 'Overview' },
  { to: '/manager/team', label: 'My Team' },
]
</script>

<template>
  <div style="display: grid; grid-template-columns: 220px 1fr; min-height: 100vh">
    <aside style="background: #161c30; color: #cfd3e6; padding: 20px 14px; display: flex; flex-direction: column">
      <div style="font: 600 15px 'Public Sans'; color: #fff; margin-bottom: 18px">Captain LMS · Manager</div>
      <RouterLink
        v-for="l in links"
        :key="l.to"
        :to="l.to"
        style="
          display: block;
          padding: 9px 10px;
          border-radius: 8px;
          color: #aab0cb;
          text-decoration: none;
          font: 600 13.5px 'Public Sans';
          margin-bottom: 2px;
        "
        active-class="router-link-active-nav"
      >
        {{ l.label }}
      </RouterLink>
      <div style="margin-top: auto; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.1)">
        <div style="font: 600 12.5px 'Public Sans'; color: #f1f2f6">{{ auth.profile?.full_name }}</div>
        <div style="font: 500 11px 'IBM Plex Mono'; color: #8991b3; margin-bottom: 10px">
          {{ auth.profile?.department }} MANAGER
        </div>
        <button
          style="background: none; border: none; color: #e08975; font: 600 12.5px 'Public Sans'; cursor: pointer; padding: 0"
          @click="logout"
        >
          Sign out
        </button>
      </div>
    </aside>
    <main style="padding: 26px 28px">
      <RouterView />
    </main>
  </div>
</template>
