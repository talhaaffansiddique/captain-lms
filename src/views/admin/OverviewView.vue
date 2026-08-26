<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'

const employeeCount = ref(0)
const moduleCount = ref(0)

onMounted(async () => {
  const [{ count: ec }, { count: mc }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('modules').select('*', { count: 'exact', head: true }).eq('is_draft', false),
  ])
  employeeCount.value = ec ?? 0
  moduleCount.value = mc ?? 0
})
</script>

<template>
  <div>
    <h2 style="font-size: 23px; margin-bottom: 16px">Overview</h2>
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; max-width: 500px">
      <div class="card" style="padding: 16px 18px">
        <div style="font: 600 11.5px 'IBM Plex Mono'; color: var(--ink-soft); text-transform: uppercase">
          Accounts
        </div>
        <div style="font-family: 'Newsreader'; font-size: 28px; font-weight: 600">{{ employeeCount }}</div>
      </div>
      <div class="card" style="padding: 16px 18px">
        <div style="font: 600 11.5px 'IBM Plex Mono'; color: var(--ink-soft); text-transform: uppercase">
          Published modules
        </div>
        <div style="font-family: 'Newsreader'; font-size: 28px; font-weight: 600">{{ moduleCount }}</div>
      </div>
    </div>
  </div>
</template>
