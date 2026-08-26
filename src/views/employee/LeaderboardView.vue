<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'

interface Row {
  full_name: string
  department: string
  completed: number
}

const rows = ref<Row[]>([])

onMounted(async () => {
  // Simple version: count completed video_completions per user via a Postgres view would be
  // cleaner (create one in Supabase called `leaderboard`); this does it client-side for now.
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, department')
  const { data: completions } = await supabase.from('video_completions').select('user_id').eq('completed', true)

  const counts: Record<string, number> = {}
  for (const c of completions ?? []) counts[c.user_id] = (counts[c.user_id] ?? 0) + 1

  rows.value = (profiles ?? [])
    .map((p) => ({ full_name: p.full_name, department: p.department, completed: counts[p.id] ?? 0 }))
    .sort((a, b) => b.completed - a.completed)
})
</script>

<template>
  <div>
    <h2 style="font-size: 23px; margin-bottom: 16px">Top Learners</h2>
    <div class="card">
      <div
        v-for="(r, i) in rows"
        :key="r.full_name"
        style="
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 18px;
          border-top: 1px solid var(--border);
        "
      >
        <div style="width: 22px; font: 700 13px 'IBM Plex Mono'; color: var(--ink-soft)">{{ i + 1 }}</div>
        <div style="flex: 1; font: 600 13.5px 'Public Sans'">{{ r.full_name }} — {{ r.department }}</div>
        <div style="font: 600 12.5px 'IBM Plex Mono'; color: var(--ink-soft)">{{ r.completed }}</div>
      </div>
    </div>
  </div>
</template>
