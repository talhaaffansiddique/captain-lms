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
    .sort((a, b) => b.completed - a.completed || a.full_name.localeCompare(b.full_name))
})

// Podium order: 2nd on the left, 1st in the middle (tallest), 3rd on the right.
const podium = computed(() => {
  const [first, second, third] = rows.value
  return [
    second && { r: second, rank: 2, h: 96, color: '#6b7a99' },
    first && { r: first, rank: 1, h: 136, color: 'var(--brass)' },
    third && { r: third, rank: 3, h: 72, color: '#b4530f' },
  ].filter(Boolean) as { r: Row; rank: number; h: number; color: string }[]
})
const rest = computed(() => rows.value.slice(3))
const myRank = computed(() => rows.value.findIndex((r) => r.id === auth.profile?.id) + 1)
const periods: { id: Period; label: string }[] = [
  { id: 'all', label: 'All-time' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
]
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <h2>Leaderboard</h2>
        <p>Ranked by lessons completed.<template v-if="myRank"> You're <b>#{{ myRank }}</b>.</template></p>
      </div>
    </div>

    <div class="row wrap" style="margin-bottom: 16px; gap: 10px">
      <button v-for="p in periods" :key="p.id" class="chip-btn" :class="{ on: period === p.id }" @click="period = p.id">{{ p.label }}</button>
      <select v-model="department" style="width: auto; margin-left: auto">
        <option v-for="d in departmentOptions" :key="d" :value="d">{{ d }}</option>
      </select>
    </div>

    <div v-if="podium.length" class="card" style="padding: 24px 20px 0; margin-bottom: 16px; overflow: hidden">
      <div class="podium">
        <div v-for="p in podium" :key="p.r.id" class="slot">
          <div class="avatar big" :style="{ background: p.color, color: '#fff' }">{{ initialsOf(p.r.full_name) }}</div>
          <b>{{ p.r.full_name }}{{ p.r.id === auth.profile?.id ? ' (you)' : '' }}</b>
          <div class="sub">{{ p.r.department }}</div>
          <div class="step" :style="{ height: p.h + 'px', background: p.color }">
            <div class="rank">{{ p.rank }}</div>
            <div style="font-size: 12px; opacity: 0.9">{{ p.r.completed }} lessons</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="padding: 8px 20px">
      <div v-for="(r, i) in rest" :key="r.id" class="lb-line" :class="{ me: r.id === auth.profile?.id }">
        <div class="num">{{ i + 4 }}</div>
        <div class="avatar" style="width: 34px; height: 34px">{{ initialsOf(r.full_name) }}</div>
        <div class="grow">
          <b>{{ r.full_name }}{{ r.id === auth.profile?.id ? ' (you)' : '' }}</b>
          <div class="sub">{{ r.department }}</div>
        </div>
        <b>{{ r.completed }} <span class="sub">lessons</span></b>
      </div>
      <p v-if="!rows.length" style="padding: 24px; text-align: center; color: var(--ink-soft)">No one matches this filter yet.</p>
      <p v-else-if="!rest.length" class="sub" style="padding: 16px 0; text-align: center">Everyone is on the podium.</p>
    </div>
  </div>
</template>

<style scoped>
.podium {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 18px;
}
.slot {
  text-align: center;
  flex: 1;
  max-width: 200px;
}
.avatar.big {
  width: 54px;
  height: 54px;
  font-size: 18px;
  margin: 0 auto 8px;
}
.step {
  margin-top: 10px;
  border-radius: 14px 14px 0 0;
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 10px;
}
.rank {
  font-size: 28px;
  font-weight: 800;
}
.lb-line {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 0;
  border-top: 1px solid var(--border);
}
.lb-line:first-child {
  border-top: 0;
}
.lb-line.me {
  background: var(--blue-soft);
  margin: 0 -20px;
  padding: 12px 20px;
}
.num {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 13px;
  background: var(--surface-sunken);
  flex: none;
}
</style>
