<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { loadAnalyticsData, type AnalyticsData } from '@/lib/analytics'
import { courseProgress, courseCode } from '@/lib/courses'
import { initialsOf } from '@/lib/employees'

const auth = useAuthStore()
const data = ref<AnalyticsData | null>(null)
const loading = ref(true)

onMounted(async () => {
  const dept = auth.profile?.department
  if (!dept) return
  data.value = await loadAnalyticsData(dept)
  loading.value = false
})

// Only courses with at least one lesson this team is assigned.
const courses = computed(() => (data.value?.courses ?? []).filter((c) => data.value!.people.some((p) => c.lessons.some((l) => l.department === 'General' || l.department === p.department))))
const grid = computed(() => {
  const d = data.value
  if (!d) return []
  return d.people.map((p) => ({
    person: p,
    cells: courses.value.map((c) => {
      const mine = { ...c, lessons: c.lessons.filter((l) => l.department === 'General' || l.department === p.department) }
      const prog = courseProgress(mine, d.completions.filter((x) => x.user_id === p.id))
      return { course: c, pct: prog.total ? prog.pct : null }
    }),
  }))
})

function cellStyle(pct: number | null) {
  if (pct === null) return { background: 'var(--surface-sunken)', color: 'var(--ink-soft)' }
  if (pct >= 100) return { background: 'var(--teal)', color: '#fff' }
  if (pct >= 70) return { background: '#4f86f0', color: '#fff' }
  if (pct >= 40) return { background: 'var(--brass)', color: '#1a1000' }
  if (pct > 0) return { background: 'var(--danger-soft)', color: 'var(--danger)' }
  return { background: 'var(--surface-sunken)', color: 'var(--ink-soft)' }
}
function cellText(pct: number | null) {
  return pct === null ? '–' : pct >= 100 ? '✓' : `${pct}%`
}
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <p>Manager · {{ auth.profile?.department }} team</p>
        <h2>Team heatmap</h2>
      </div>
    </div>

    <p v-if="loading" class="sub">Loading…</p>
    <template v-else>
      <div class="note">Spot gaps at a glance: each cell is that person's progress in that course.</div>
      <div class="card" style="padding: 20px; overflow: auto; margin-top: 14px">
        <div class="grid" :style="{ gridTemplateColumns: `160px repeat(${courses.length}, minmax(80px, 1fr))` }">
          <span />
          <span v-for="c in courses" :key="c.id" class="sub" style="text-align: center; font-weight: 700" :title="c.title">{{ courseCode(c.title) }}</span>
          <template v-for="row in grid" :key="row.person.id">
            <div class="row"><div class="avatar" style="width: 28px; height: 28px; font-size: 11px">{{ initialsOf(row.person.full_name) }}</div><b>{{ row.person.full_name }}</b></div>
            <div
              v-for="cell in row.cells"
              :key="cell.course.id"
              class="hcell"
              :style="cellStyle(cell.pct)"
              :title="`${row.person.full_name} · ${cell.course.title}: ${cell.pct ?? 'not assigned'}${cell.pct === null ? '' : '%'}`"
            >{{ cellText(cell.pct) }}</div>
          </template>
        </div>
        <p v-if="!grid.length" class="sub" style="padding: 16px 0">No one in your team yet.</p>
        <div class="row wrap" style="margin-top: 16px; gap: 14px">
          <span class="sub"><b style="color: var(--teal)">■</b> Complete</span>
          <span class="sub"><b style="color: #4f86f0">■</b> 70%+</span>
          <span class="sub"><b style="color: var(--brass)">■</b> 40–69%</span>
          <span class="sub"><b style="color: var(--danger)">■</b> Under 40%</span>
          <span class="sub"><b style="color: var(--ink-soft)">■</b> Not started / not assigned</span>
        </div>
        <div class="sub" style="margin-top: 10px">
          <span v-for="c in courses" :key="c.id" style="margin-right: 12px"><b>{{ courseCode(c.title) }}</b> = {{ c.title }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.note {
  background: var(--blue-soft);
  color: var(--blue);
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 12.5px;
  font-weight: 600;
}
.grid {
  display: grid;
  gap: 6px;
  align-items: center;
  min-width: 560px;
}
.hcell {
  height: 44px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-weight: 800;
}
</style>
