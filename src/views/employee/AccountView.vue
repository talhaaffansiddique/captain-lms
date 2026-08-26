<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import ThemeToggle from '@/components/ThemeToggle.vue'

const auth = useAuthStore()
</script>

<template>
  <div>
    <div class="topline">
      <div><h2>Account</h2></div>
    </div>
    <div class="card" style="padding: 20px; max-width: 420px">
      <div class="field">
        <label>Full name</label>
        <input :value="auth.profile?.full_name" disabled />
      </div>
      <div class="field">
        <label>Department</label>
        <input :value="auth.profile?.department" disabled />
      </div>
      <div class="field">
        <label>Theme</label>
        <ThemeToggle variant="mini" surface />
      </div>
      <p class="hint">Profile editing isn't wired up yet — update the `profiles` row in Supabase directly for now.</p>
    </div>
  </div>
</template>
