<script setup lang="ts">
// Interactive KPI dashboards (Chart.js): completion trends, compliance distribution, quiz
// performance and active-learner trends, with date-range and department filters. Hover for values.
import { ref, computed, onMounted } from 'vue'
import { Line, Doughnut, Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { loadDepartments } from '@/lib/departments'
import { loadKpiRaw, computeKpis, type KpiRaw } from '@/lib/kpi'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend)

const raw = ref<KpiRaw | null>(null)
const range = ref(30)
const dept = ref('All')
const departments = ref<string[]>(['All', 'General'])
const loading = ref(true)

onMounted(async () => {
  const [r, d] = await Promise.all([loadKpiRaw(), loadDepartments()])
  raw.value = r
  departments.value = ['All', ...d.map((x) => x.name)]
  loading.value = false
})

const k = computed(() => (raw.value ? computeKpis(raw.value, range.value, dept.value) : null))

// Colours are read from the theme so the charts follow light/dark mode.
const css = (v: string, fallback: string) => (typeof document === 'undefined' ? fallback : getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fallback)
const base = { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index' as const, intersect: false }, plugins: { legend: { position: 'bottom' as const } } }

const trend = computed(() => ({
  labels: k.value?.labels ?? [],
  datasets: [
    { label: 'Lessons completed', data: k.value?.lessons ?? [], borderColor: '#2f5be8', backgroundColor: '#2f5be822', tension: 0.35, fill: true },
    { label: 'Quizzes passed', data: k.value?.quizzes ?? [], borderColor: '#f08a24', backgroundColor: '#f08a2422', tension: 0.35 },
  ],
}))
const activeTrend = computed(() => ({
  labels: k.value?.labels ?? [],
  datasets: [{ label: 'Active learners', data: k.value?.active ?? [], borderColor: '#15803d', backgroundColor: '#15803d33', tension: 0.35, fill: true }],
}))
const donut = computed(() => {
  const c = k.value?.compliance
  return {
    labels: ['Completed', 'In progress', 'Not started', 'Overdue'],
    datasets: [{ data: c ? [c.completed, c.inProgress, c.notStarted, c.overdue] : [0, 0, 0, 0], backgroundColor: ['#15803d', '#2f5be8', '#9aa6c4', css('--danger', '#c0392b')], borderWidth: 0 }],
  }
})
const quiz = computed(() => ({
  labels: k.value?.quizScores.labels ?? [],
  datasets: [{ label: 'Average score (%)', data: k.value?.quizScores.values ?? [], backgroundColor: '#8e44ad', borderRadius: 8 }],
}))
const quizOptions = { ...base, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } }
const totalAssignments = computed(() => (k.value ? Object.values(k.value.compliance).reduce((a, b) => a + b, 0) : 0))
</script>

<template>
  <div>
    <div class="row wrap" style="margin-bottom: 14px; gap: 8px">
      <button v-for="r in [7, 30, 90]" :key="r" class="chip-btn" :class="{ on: range === r }" @click="range = r">Last {{ r }} days</button>
      <select v-model="dept" style="width: auto">
        <option v-for="d in departments" :key="d" :value="d">{{ d === 'All' ? 'All departments' : d }}</option>
      </select>
    </div>

    <p v-if="loading" class="hint">Loading…</p>
    <template v-else-if="k">
      <div class="tiles">
        <div class="card stat"><div class="lbl">Active learners</div><div class="val">{{ k.tiles.active }}<span class="sub"> / {{ k.tiles.people }}</span></div></div>
        <div class="card stat"><div class="lbl">Assignment completion</div><div class="val" style="color: var(--teal)">{{ k.tiles.completionRate == null ? '—' : k.tiles.completionRate + '%' }}</div></div>
        <div class="card stat"><div class="lbl">Avg. quiz score</div><div class="val">{{ k.tiles.avgScore == null ? '—' : k.tiles.avgScore + '%' }}</div></div>
        <div class="card stat"><div class="lbl">Overdue assignments</div><div class="val" style="color: var(--danger)">{{ k.tiles.overdue }}</div></div>
      </div>

      <div class="grid2">
        <div class="card" style="padding: 18px"><h3>Completion trends</h3><p class="sub">Lessons completed and quizzes passed per period.</p><div class="ch"><Line :data="trend" :options="base" /></div></div>
        <div class="card" style="padding: 18px">
          <h3>Compliance distribution</h3><p class="sub">Status of every assigned course.</p>
          <div class="ch"><Doughnut v-if="totalAssignments" :data="donut" :options="{ ...base, cutout: '62%' }" /><p v-else class="hint" style="text-align: center; padding-top: 80px">No assignments yet.</p></div>
        </div>
        <div class="card" style="padding: 18px"><h3>Quiz performance</h3><p class="sub">Average score per milestone quiz in this period.</p><div class="ch"><Bar :data="quiz" :options="quizOptions" /></div></div>
        <div class="card" style="padding: 18px"><h3>Active learner trend</h3><p class="sub">Learners with any activity in each period.</p><div class="ch"><Line :data="activeTrend" :options="base" /></div></div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 14px;
}
.grid2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}
.ch {
  height: 250px;
  margin-top: 8px;
  position: relative;
}
@media (max-width: 900px) {
  .tiles {
    grid-template-columns: repeat(2, 1fr);
  }
  .grid2 {
    grid-template-columns: 1fr;
  }
}
</style>
