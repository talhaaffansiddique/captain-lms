<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const teamSize = ref(0)

onMounted(async () => {
  const dept = auth.profile?.department
  if (!dept) return
  const { count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('department', dept)
  teamSize.value = count ?? 0
})
</script>

<template>
  <div>
    <h2 style="font-size: 23px; margin-bottom: 4px">Team Overview</h2>
    <p style="color: var(--ink-soft); font-size: 13.5px; margin-bottom: 16px">
      Read-only — {{ auth.profile?.department }}
    </p>
    <div class="card stat" style="padding: 16px 18px; max-width: 200px">
      <div style="font: 600 11.5px 'IBM Plex Mono'; color: var(--ink-soft); text-transform: uppercase">
        Team size
      </div>
      <div style="font-family: 'Newsreader'; font-size: 28px; font-weight: 600">{{ teamSize }}</div>
    </div>
  </div>
</template>
