<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

interface Row {
  id: string
  full_name: string
  department: string
  completed: number
}

const auth = useAuthStore()
const rows = ref<Row[]>([])

onMounted(async () => {
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, department')
  const { data: completions } = await supabase.from('video_completions').select('user_id').eq('completed', true)

  const counts: Record<string, number> = {}
  for (const c of completions ?? []) counts[c.user_id] = (counts[c.user_id] ?? 0) + 1

  rows.value = (profiles ?? [])
    .map((p) => ({ id: p.id, full_name: p.full_name, department: p.department, completed: counts[p.id] ?? 0 }))
    .sort((a, b) => b.completed - a.completed)
})
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <h2>Top Learners</h2>
        <p>Ranked by modules completed.</p>
      </div>
    </div>
    <div class="card">
      <div
        v-for="(r, i) in rows"
        :key="r.id"
        :class="['lb-row', { top1: i === 0, me: r.id === auth.profile?.id }]"
        :style="r.id === auth.profile?.id ? { background: 'var(--brass-soft)', borderRadius: '8px' } : {}"
      >
        <div class="lb-rank">{{ i + 1 }}</div>
        <div class="avatar" style="width: 26px; height: 26px; font-size: 11px">
          {{ r.full_name.slice(0, 2).toUpperCase() }}
        </div>
        <div class="lb-name">
          {{ r.full_name }}{{ r.id === auth.profile?.id ? ' (you)' : '' }}
          <span class="pill pill-outline">{{ r.department }}</span>
        </div>
        <div class="lb-score">{{ r.completed }}</div>
      </div>
    </div>
  </div>
</template>
