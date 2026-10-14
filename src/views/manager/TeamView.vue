<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { isActive, initialsOf } from '@/lib/employees'
import type { Profile } from '@/lib/database.types'

const auth = useAuthStore()
const team = ref<Profile[]>([])

onMounted(async () => {
  const dept = auth.profile?.department
  if (!dept) return
  const { data } = await supabase.from('profiles').select('*').eq('department', dept).order('full_name')
  team.value = (data ?? []).filter(isActive)
})
</script>

<template>
  <div>
    <div class="topline">
      <div><h2>My Team</h2></div>
    </div>
    <div class="card">
      <div v-for="p in team" :key="p.id" class="row-item" style="cursor: default">
        <div class="avatar">{{ initialsOf(p.full_name) }}</div>
        <div class="row-info">
          <div class="t">{{ p.full_name }}</div>
          <div class="m" style="text-transform: capitalize">{{ p.role }}</div>
        </div>
      </div>
      <p v-if="!team.length" style="padding: 24px; text-align: center; color: var(--ink-soft)">No one on this team yet.</p>
    </div>
  </div>
</template>
