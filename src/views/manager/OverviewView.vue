<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { loadAnalyticsData, personProgress, personStatus, lastActive, averageCompletion, type AnalyticsData, type PersonStatus } from '@/lib/analytics'
import { relativeTime } from '@/lib/learning'
import { initialsOf as nameInitials } from '@/lib/employees'
import { useSort } from '@/composables/useSort'
import DashWidget from '@/components/DashWidget.vue'

const auth = useAuthStore()
const data = ref<AnalyticsData | null>(null)
const loading = ref(true)
const filter = ref<'All' | PersonStatus>('All')

onMounted(async () => {
  const dept = auth.profile?.department
  if (!dept) return
  data.value = await loadAnalyticsData(dept)
  loading.value = false
})

interface Row {
  id: string
  name: string
  pct: number
  done: number
  total: number
  status: PersonStatus
  last: string | null
  due: string | null
}

const rows = computed<Row[]>(() => {
  const d = data.value
  if (!d) return []
  return d.people.map((p) => {
    const prog = personProgress(p, d)
    return { id: p.id, name: p.full_name, pct: prog.pct, done: prog.done, total: prog.total, status: personStatus(p, d), last: lastActive(p.id, d), due: p.due_date }
  })
})
const visible = computed(() => rows.value.filter((r) => filter.value === 'All' || r.status === filter.value))
const { sorted, toggle, indicator, ariaSort } = useSort(visible, {
  name: (r) => r.name,
  progress: (r) => r.pct,
  status: (r) => r.status,
  last: (r) => r.last,
})

const stats = computed(() => ({
  size: rows.value.length,
  avg: data.value ? averageCompletion(data.value) : 0,
  atRisk: rows.value.filter((r) => r.status === 'At risk').length,
  overdue: rows.value.filter((r) => r.status === 'Overdue').length,
}))
const barColor = (s: PersonStatus) => (s === 'Overdue' ? 'var(--danger)' : s === 'At risk' ? 'var(--brass)' : s === 'Completed' ? 'var(--teal)' : 'var(--blue)')
const pillClass = (s: PersonStatus) => (s === 'Overdue' ? 'pill-danger' : s === 'At risk' ? 'pill-brass' : s === 'Completed' ? 'pill-teal' : 'pill-teal')
const filters: ('All' | PersonStatus)[] = ['All', 'On track', 'At risk', 'Overdue', 'Completed']
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <p>Manager · {{ auth.profile?.department }} team</p>
        <h2>Team progress</h2>
      </div>
    </div>

    <p v-if="loading" class="sub">Loading…</p>
    <template v-else>
      <DashWidget id="mgr.stats">
        <div class="stats">
          <div class="card stat"><div class="lbl">Team size</div><div class="val">{{ stats.size }}</div><div class="sub">in your department</div></div>
          <div class="card stat"><div class="lbl">Avg. completion</div><div class="val">{{ stats.avg }}%</div><div class="sub">of assigned lessons</div></div>
          <div class="card stat"><div class="lbl">At risk</div><div class="val" style="color: var(--brass)">{{ stats.atRisk }}</div><div class="sub">falling behind</div></div>
          <div class="card stat dark"><div class="lbl">Overdue</div><div class="val">{{ stats.overdue }}</div><div class="sub">past deadline</div></div>
        </div>
      </DashWidget>

      <DashWidget id="mgr.table">
        <div class="row wrap" style="margin-bottom: 14px; gap: 8px">
          <button v-for="f in filters" :key="f" class="chip-btn" :class="{ on: filter === f }" @click="filter = f">{{ f }}</button>
        </div>
        <div class="card table-wrap">
          <table>
            <thead>
              <tr>
                <th class="sortable" :aria-sort="ariaSort('name')" @click="toggle('name')">Person <span class="sort-ind">{{ indicator('name') }}</span></th>
                <th class="sortable" :aria-sort="ariaSort('progress')" @click="toggle('progress')">Progress <span class="sort-ind">{{ indicator('progress') }}</span></th>
                <th class="sortable" :aria-sort="ariaSort('status')" @click="toggle('status')">Status <span class="sort-ind">{{ indicator('status') }}</span></th>
                <th class="sortable" :aria-sort="ariaSort('last')" @click="toggle('last')">Last active <span class="sort-ind">{{ indicator('last') }}</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in sorted" :key="r.id">
                <td><div class="row"><div class="avatar" style="width: 32px; height: 32px">{{ nameInitials(r.name) }}</div><b>{{ r.name }}</b></div></td>
                <td style="min-width: 190px">
                  <div class="row"><div class="bar"><i :style="{ width: r.pct + '%', background: barColor(r.status) }" /></div><b>{{ r.pct }}%</b></div>
                  <div class="sub">{{ r.done }} of {{ r.total }} lessons</div>
                </td>
                <td><span :class="['pill', pillClass(r.status)]">{{ r.status }}</span></td>
                <td class="sub">{{ r.last ? relativeTime(r.last) : 'No activity yet' }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="!sorted.length" style="padding: 24px; text-align: center; color: var(--ink-soft)">No one matches this filter.</p>
        </div>
      </DashWidget>
    </template>
  </div>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 18px;
}
@media (max-width: 900px) {
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
