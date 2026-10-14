<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { isActive, initialsOf } from '@/lib/employees'
import { useAuthStore } from '@/stores/auth'
import { loadDepartments } from '@/lib/departments'

interface Row {
  id: string
  full_name: string
  department: string
  completed: number
}

type Period = 'all' | 'week' | 'month'

const auth = useAuthStore()
const departmentOptions = ref<string[]>(['All', 'General'])
const profiles = ref<{ id: string; full_name: string; department: string }[]>([])
const completions = ref<{ user_id: string; completed_at: string | null }[]>([])
const period = ref<Period>('all')
const department = ref('All')

onMounted(async () => {
  const [{ data: p }, { data: c }, depts] = await Promise.all([
    supabase.from('profiles').select('*'),
    supabase.from('video_completions').select('user_id, completed_at').eq('completed', true),
    loadDepartments(),
  ])
  profiles.value = (p ?? []).filter(isActive)
  completions.value = c ?? []
  departmentOptions.value = ['All', 'General', ...depts.map((d) => d.name)]
})

function periodCutoff(p: Period): Date | null {
  if (p === 'all') return null
  const d = new Date()
  if (p === 'week') d.setDate(d.getDate() - 7)
  else d.setMonth(d.getMonth() - 1)
  return d
}

const rows = computed<Row[]>(() => {
  const cutoff = periodCutoff(period.value)
  const counts: Record<string, number> = {}
  for (const c of completions.value) {
    if (cutoff && (!c.completed_at || new Date(c.completed_at) < cutoff)) continue
    counts[c.user_id] = (counts[c.user_id] ?? 0) + 1
  }
  return profiles.value
    .filter((p) => department.value === 'All' || p.department === department.value)
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

    <div style="display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap">
      <select v-model="period" style="width: auto">
        <option value="all">All-time</option>
        <option value="week">This week</option>
        <option value="month">This month</option>
      </select>
      <select v-model="department" style="width: auto">
        <option v-for="d in departmentOptions" :key="d" :value="d">{{ d }}</option>
      </select>
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
          {{ initialsOf(r.full_name) }}
        </div>
        <div class="lb-name">
          {{ r.full_name }}{{ r.id === auth.profile?.id ? ' (you)' : '' }}
          <span class="pill pill-outline">{{ r.department }}</span>
        </div>
        <div class="lb-score">{{ r.completed }}</div>
      </div>
      <p v-if="!rows.length" style="padding: 24px; text-align: center; color: var(--ink-soft)">No one matches this filter yet.</p>
    </div>
  </div>
</template>
