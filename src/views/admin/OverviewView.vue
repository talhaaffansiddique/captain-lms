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
    <div class="topline">
      <div><h2>Overview</h2></div>
    </div>
    <div class="stat-row" style="max-width: 460px; grid-template-columns: repeat(2, 1fr)">
      <div class="card stat">
        <div class="lbl">Accounts</div>
        <div class="val">{{ employeeCount }}</div>
      </div>
      <div class="card stat">
        <div class="lbl">Published modules</div>
        <div class="val">{{ moduleCount }}</div>
      </div>
    </div>
  </div>
</template>
