<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
</script>

<template>
  <div>
    <h2 style="font-size: 23px; margin-bottom: 16px">Account</h2>
    <div class="card" style="padding: 20px; max-width: 420px">
      <div style="margin-bottom: 14px">
        <label>Full name</label>
        <input :value="auth.profile?.full_name" disabled />
      </div>
      <div style="margin-bottom: 14px">
        <label>Department</label>
        <input :value="auth.profile?.department" disabled />
      </div>
      <p style="font-size: 12px; color: var(--ink-soft)">
        Profile editing isn't wired up yet — update the `profiles` row in Supabase directly for now.
      </p>
    </div>
  </div>
</template>
