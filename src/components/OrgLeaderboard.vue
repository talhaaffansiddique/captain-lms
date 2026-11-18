<script setup lang="ts">
// The organisation leaderboard. The same component serves /admin, /hr, /manager and /app/leaderboard,
// so scoring and filters are identical; only the wording and the "you / your team" highlights differ.
import { ref, computed, onMounted, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { loadDepartments } from '@/lib/departments'
import { loadLeaderboard, POINTS, LESSON_CAP, type Period, type RankedScore } from '@/lib/leaderboard'
import { initialsOf } from '@/lib/employees'

const props = defineProps<{ mode: 'admin' | 'hr' | 'manager' | 'employee' }>()

const auth = useAuthStore()
const rows = ref<RankedScore[]>([])
const missing = ref(false)
const loading = ref(true)
const period = ref<Period>('all')
const department = ref('All')
const search = ref('')
const open = ref<Set<string>>(new Set())
const departments = ref<string[]>(['All', 'General'])

const periods: { id: Period; label: string }[] = [
  { id: 7, label: '7 days' },
  { id: 30, label: '30 days' },
  { id: 'all', label: 'All time' },
]

async function load() {
  loading.value = true
  const r = await loadLeaderboard(period.value)
  rows.value = r.rows
  missing.value = r.missing
  loading.value = false
}
onMounted(async () => {
  departments.value = ['All', 'General', ...(await loadDepartments()).map((d) => d.name)]
  await load()
})
watch(period, load)

// Filtering keeps each learner's overall rank, so "#3" always means #3 in the whole organisation.
const shown = computed(() => {
  const q = search.value.trim().toLowerCase()
  return rows.value.filter((r) => (department.value === 'All' || r.department === department.value) && (!q || r.name.toLowerCase().includes(q)))
})
const me = computed(() => rows.value.find((r) => r.id === auth.profile?.id))

function toggle(id: string) {
  const next = new Set(open.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  open.value = next
}
const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`)

const intro = computed(
  () =>
    ({
      admin: 'Active learners ranked by badges earned, course completions and recent activity.',
      hr: 'Active learners ranked by badges earned, course completions and recent activity. Read-only.',
      manager: 'Active learners across the organisation. People from your department are highlighted.',
      employee: 'See how you compare with other active learners.',
    })[props.mode],
)
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <h2>Organization leaderboard</h2>
        <p>{{ intro }}</p>
      </div>
      <span v-if="mode === 'hr' || mode === 'manager'" class="pill pill-outline">👁 Read-only</span>
    </div>

    <div v-if="missing" class="card" style="padding: 16px; margin-bottom: 16px; border-left: 3px solid var(--brass)">
      <b>One-time setup needed.</b> Run <code>supabase/v5.sql</code> in the Supabase SQL Editor to turn on the leaderboard.
    </div>

    <div v-if="mode === 'employee'" class="card standing">
      <div class="medal">🏁</div>
      <div>
        <div class="kick">Your standing</div>
        <div class="big">{{ me ? `#${me.rank} of ${rows.length}` : 'Not ranked yet' }}</div>
        <div class="sub2">{{ me ? `${me.points} points · ${me.badges} badges · ${me.courses} courses · ${me.lessons} recent lessons` : 'Finish a lesson in this period to appear on the board.' }}</div>
      </div>
    </div>

    <div class="cols">
      <div class="card" style="padding: 18px">
        <div class="row wrap" style="margin-bottom: 12px; gap: 8px">
          <button v-for="p in periods" :key="String(p.id)" class="chip-btn" :class="{ on: period === p.id }" @click="period = p.id">{{ p.label }}</button>
          <select v-model="department" style="width: auto; margin-left: auto">
            <option v-for="d in departments" :key="d" :value="d">{{ d }}</option>
          </select>
          <input v-model="search" type="text" placeholder="🔍 Search learner" style="width: 180px" />
        </div>

        <p v-if="loading" class="hint">Loading…</p>
        <div v-else>
          <div v-for="r in shown" :key="r.id" class="lb" :class="{ me: mode === 'employee' && r.id === auth.profile?.id }">
            <button class="line" :aria-expanded="open.has(r.id)" @click="toggle(r.id)">
              <span class="rank">{{ medal(r.rank) }}</span>
              <span class="av">{{ initialsOf(r.name) }}</span>
              <span class="who">
                <b>{{ r.name }}</b>
                <span v-if="mode === 'employee' && r.id === auth.profile?.id" class="pill pill-teal">You</span>
                <span v-if="mode === 'manager' && r.department === auth.profile?.department" class="pill pill-brass">Your team</span>
                <span class="sub">{{ r.department }}</span>
              </span>
              <span class="pts">{{ r.points }} <small>pts</small></span>
              <span class="chev">{{ open.has(r.id) ? '▲' : '▼' }}</span>
            </button>
            <div v-if="open.has(r.id)" class="break">
              <div><b>{{ r.badgePts }} pts</b><span>🏅 {{ r.badges }} badges × {{ POINTS.badge }}</span></div>
              <div><b>{{ r.coursePts }} pts</b><span>✅ {{ r.courses }} courses × {{ POINTS.course }}</span></div>
              <div><b>{{ r.activityPts }} pts</b><span>⚡ {{ Math.min(r.lessons, LESSON_CAP) }} lessons × {{ POINTS.lesson }}</span></div>
            </div>
          </div>
          <p v-if="!shown.length" class="hint" style="padding: 22px; text-align: center">No active learners match.</p>
        </div>
        <p class="hint" style="margin-top: 10px">Select a learner to see their score breakdown.</p>
      </div>

      <div class="card guide" style="padding: 18px; align-self: start">
        <div class="kicker">Scoring guide</div>
        <h3 style="font-size: 16px; margin-bottom: 10px">How points are earned</h3>
        <div class="g"><b>🏅 Badge earned — {{ POINTS.badge }} pts</b><span>Each milestone quiz passed in the selected period.</span></div>
        <div class="g"><b>✅ Course completed — {{ POINTS.course }} pts</b><span>Each course whose lessons you finished in the period.</span></div>
        <div class="g"><b>⚡ Recent activity — {{ POINTS.lesson }} pts</b><span>Each lesson completed in the period, up to {{ LESSON_CAP }} lessons ({{ LESSON_CAP * POINTS.lesson }} pts).</span></div>
        <p class="hint" style="border-top: 1px solid var(--border); padding-top: 8px; margin-top: 10px">
          Only learners with points in the period are ranked. Ties are broken by courses completed, then name. The same
          rules apply on every portal.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cols {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
  align-items: start;
}
@media (max-width: 900px) {
  .cols {
    grid-template-columns: 1fr;
  }
}
.standing {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 20px;
  margin-bottom: 16px;
  background: linear-gradient(135deg, #2f5be8, #5b3fd1);
  color: #fff;
}
.standing .medal {
  font-size: 42px;
}
.standing .kick {
  font-size: 12px;
  opacity: 0.85;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.standing .big {
  font-size: 28px;
  font-weight: 800;
}
.standing .sub2 {
  opacity: 0.9;
}
.lb {
  border-bottom: 1px solid var(--border);
}
.lb.me {
  background: var(--blue-soft);
  border-radius: 10px;
}
.line {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: none;
  border: 0;
  padding: 11px 6px;
  cursor: pointer;
  font: inherit;
  color: inherit;
  text-align: left;
}
.line:hover {
  background: var(--surface-sunken);
}
.rank {
  width: 40px;
  font-weight: 800;
  font-size: 16px;
}
.av {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--blue-soft);
  color: var(--blue);
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 12px;
  flex: none;
}
.who {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.pts {
  font-weight: 800;
  font-size: 16px;
}
.pts small {
  font-weight: 500;
  color: var(--ink-soft);
}
.chev {
  color: var(--ink-soft);
  font-size: 11px;
}
.break {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 10px 14px 14px 58px;
  background: var(--surface-sunken);
  border-radius: 10px;
  margin: 0 6px 8px;
}
.break div b {
  display: block;
}
.break div span {
  font-size: 12.5px;
  color: var(--ink-soft);
}
@media (max-width: 640px) {
  .break {
    grid-template-columns: 1fr;
    padding-left: 14px;
  }
}
.guide .g {
  margin: 10px 0;
}
.guide .g b {
  display: block;
}
.guide .g span {
  font-size: 12.5px;
  color: var(--ink-soft);
}
</style>
