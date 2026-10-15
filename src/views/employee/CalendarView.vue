<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { loadTrackData, pendingMilestones, milestoneLabel } from '@/lib/quiz'
import { isoDay } from '@/lib/learning'
import type { Module, QuizAttempt, VideoCompletion } from '@/lib/database.types'

interface CalEvent {
  title: string
  kind: 'done' | 'due' | 'quiz' | 'overdue'
  to?: string
}

const auth = useAuthStore()
const track = ref<Module[]>([])
const completions = ref<VideoCompletion[]>([])
const attempts = ref<QuizAttempt[]>([])
const pendingQuizzes = ref<string[]>([])
const loading = ref(true)
const cursor = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))

onMounted(async () => {
  if (!auth.profile) return
  const t = await loadTrackData(auth.profile.id, auth.profile.department)
  track.value = t.track
  completions.value = t.completions
  attempts.value = t.attempts
  pendingQuizzes.value = pendingMilestones(t.track, t.completions, t.attempts, t.grants)
  loading.value = false
})

const today = isoDay(new Date())
const titleOf = computed(() => new Map(track.value.map((m) => [m.id, m.title])))

const events = computed(() => {
  const map = new Map<string, CalEvent[]>()
  const add = (day: string, e: CalEvent) => map.set(day, [...(map.get(day) ?? []), e])
  const due = auth.profile?.due_date
  const allDone = track.value.length > 0 && track.value.every((m) => completions.value.some((c) => c.module_id === m.id && c.completed))
  if (due) add(due, { title: 'Training deadline', kind: due < today && !allDone ? 'overdue' : 'due' })
  for (const c of completions.value) {
    if (c.completed && c.completed_at) add(isoDay(new Date(c.completed_at)), { title: `Completed ${titleOf.value.get(c.module_id) ?? 'a lesson'}`, kind: 'done' })
  }
  for (const a of attempts.value) {
    if (a.passed) add(isoDay(new Date(a.created_at)), { title: `Passed ${milestoneLabel(a.milestone, track.value)}`, kind: 'done' })
  }
  for (const m of pendingQuizzes.value) add(today, { title: `${milestoneLabel(m, track.value)} ready`, kind: 'quiz', to: `/app/quiz/${m}` })
  return map
})

const monthTitle = computed(() => cursor.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))
const cells = computed(() => {
  const y = cursor.value.getFullYear()
  const m = cursor.value.getMonth()
  const lead = (new Date(y, m, 1).getDay() + 6) % 7
  const days = new Date(y, m + 1, 0).getDate()
  const out: ({ day: number; iso: string } | null)[] = Array.from({ length: lead }, () => null)
  for (let d = 1; d <= days; d++) out.push({ day: d, iso: isoDay(new Date(y, m, d)) })
  return out
})

function shift(delta: number) {
  cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + delta, 1)
}
function goToday() {
  const n = new Date()
  cursor.value = new Date(n.getFullYear(), n.getMonth(), 1)
}

const overdue = computed(() => [...events.value.entries()].flatMap(([day, list]) => list.filter((e) => e.kind === 'overdue').map((e) => ({ day, ...e }))))
const upcoming = computed(() =>
  [...events.value.entries()]
    .flatMap(([day, list]) => list.filter((e) => (e.kind === 'due' || e.kind === 'quiz') && day >= today).map((e) => ({ day, ...e })))
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(0, 6),
)
const colorFor = { done: 'var(--teal)', due: 'var(--blue)', quiz: 'var(--brass)', overdue: 'var(--danger)' }
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <h2>Deadlines</h2>
        <p>Never miss a due date or a quiz.</p>
      </div>
    </div>

    <div v-if="loading" class="sub">Loading…</div>
    <div v-else class="cols">
      <div class="card" style="padding: 20px">
        <div class="row" style="margin-bottom: 12px">
          <button class="btn btn-ghost btn-sm" @click="shift(-1)">←</button>
          <h2 style="font-size: 20px; min-width: 170px; text-align: center">{{ monthTitle }}</h2>
          <button class="btn btn-ghost btn-sm" @click="shift(1)">→</button>
          <button class="btn btn-ghost btn-sm sp" @click="goToday">Today</button>
        </div>
        <div class="grid">
          <div v-for="d in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']" :key="d" class="sub" style="text-align: center">{{ d }}</div>
          <template v-for="(c, i) in cells" :key="i">
            <div v-if="!c" />
            <div v-else class="cell" :class="{ today: c.iso === today }">
              <b :style="c.iso === today ? 'color: var(--blue)' : ''">{{ c.day }}</b>
              <component
                :is="e.to ? 'RouterLink' : 'div'"
                v-for="(e, k) in (events.get(c.iso) ?? []).slice(0, 2)"
                :key="k"
                :to="e.to"
                class="ev"
                :style="{ borderLeftColor: colorFor[e.kind] }"
              >{{ e.title }}</component>
              <span v-if="(events.get(c.iso) ?? []).length > 2" class="sub">+{{ (events.get(c.iso) ?? []).length - 2 }} more</span>
            </div>
          </template>
        </div>
      </div>

      <div>
        <div v-if="overdue.length" class="card" style="padding: 20px; margin-bottom: 16px">
          <h2 style="font-size: 19px; margin-bottom: 10px">Overdue</h2>
          <div v-for="(o, i) in overdue" :key="i" class="item" style="background: var(--danger-soft)">
            <span class="date" style="color: var(--danger)">{{ o.day.slice(8) }}</span>
            <span><b>{{ o.title }}</b><span class="sub" style="display: block">Was due {{ o.day }}</span></span>
          </div>
        </div>
        <div class="card" style="padding: 20px">
          <h2 style="font-size: 19px; margin-bottom: 10px">Upcoming</h2>
          <component :is="u.to ? 'RouterLink' : 'div'" v-for="(u, i) in upcoming" :key="i" :to="u.to" class="item" :class="{ hot: u.kind === 'quiz' }">
            <span class="date">{{ u.day.slice(8) }}</span>
            <span><b>{{ u.title }}</b><span class="sub" style="display: block">{{ u.day === today ? 'Today' : u.day }}</span></span>
          </component>
          <p v-if="!upcoming.length" class="sub">Nothing coming up.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cols {
  display: grid;
  grid-template-columns: 1.7fr 1fr;
  gap: 16px;
  align-items: start;
}
@media (max-width: 980px) {
  .cols {
    grid-template-columns: 1fr;
  }
}
.grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}
.cell {
  min-height: 78px;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 7px;
}
.cell.today {
  background: var(--blue-soft);
  border-color: var(--blue);
}
.ev {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  font-weight: 700;
  border-left: 3px solid;
  padding-left: 6px;
  line-height: 1.25;
  text-decoration: none;
  color: inherit;
}
.item {
  display: flex;
  gap: 14px;
  align-items: center;
  background: var(--surface-sunken);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 10px;
  text-decoration: none;
  color: inherit;
}
.item.hot {
  background: var(--brass-soft);
}
.date {
  font-weight: 800;
  font-size: 20px;
  min-width: 34px;
  text-align: center;
}
</style>
