<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { logActivity } from '@/lib/activity'
import { milestoneLabel } from '@/lib/quiz'
import {
  loadAnalyticsData,
  averageCompletion,
  averageQuizScore,
  completionByDepartment,
  courseFunnel,
  activityHeatmap,
  complianceByDepartment,
  overduePeople,
  contentHealth,
  type AnalyticsData,
} from '@/lib/analytics'
import DashWidget from '@/components/DashWidget.vue'
import FunnelCard from '@/components/FunnelCard.vue'
import type { ActivityLogEntry } from '@/lib/database.types'

const auth = useAuthStore()
const data = ref<AnalyticsData | null>(null)
const loading = ref(true)
const activity = ref<ActivityLogEntry[]>([])
const announcementText = ref('')
const postingAnnouncement = ref(false)
const reminderMessage = ref('')
const sendingReminders = ref(false)

interface DeptSummary {
  department: string
  completions: number
  quizPasses: number
  overdue: { name: string; dueDate: string }[]
}
const digestSummaries = ref<DeptSummary[] | null>(null)
const loadingDigest = ref(false)
const digestError = ref('')

async function load() {
  const [analytics, { data: act }] = await Promise.all([
    loadAnalyticsData(),
    supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(8),
  ])
  data.value = analytics
  activity.value = act ?? []
  loading.value = false
}
onMounted(load)

const dept = computed(() => (data.value ? completionByDepartment(data.value) : []))
const funnel = computed(() => (data.value ? courseFunnel(data.value) : []))
const heat = computed(() => (data.value ? activityHeatmap(data.value) : []))
const heatMax = computed(() => Math.max(1, ...heat.value.flat()))
const compliance = computed(() => (data.value ? complianceByDepartment(data.value) : []))
const overdue = computed(() => (data.value ? overduePeople(data.value) : []))
const dueSoonTotal = computed(() => compliance.value.reduce((s, r) => s + r.dueSoon, 0))
const health = computed(() => (data.value ? contentHealth(data.value) : { unused: [], dropoffs: [], hardQuizzes: [] }))
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const hours = Array.from({ length: 12 }, (_, i) => i + 8)
const hourLabel = (h: number) => `${h > 12 ? h - 12 : h}${h < 12 ? 'a' : 'p'}`

const peakText = computed(() => {
  const g = heat.value
  if (!g.length || heatMax.value <= 1) return 'Not enough activity yet to show a pattern.'
  let best = { d: 0, h: 0, v: -1 }
  g.forEach((row, d) => row.forEach((v, h) => { if (v > best.v) best = { d, h, v } }))
  return `Busiest time: ${days[best.d]} around ${hourLabel(best.h)}. A good moment for reminders is just before it.`
})

const stats = computed(() => {
  if (!data.value) return null
  const score = averageQuizScore(data.value.attempts)
  return { learners: data.value.people.length, completion: averageCompletion(data.value), score, overdue: overdue.value.length }
})

function milestoneName(m: string) {
  return milestoneLabel(m, data.value?.modules ?? [])
}

async function remindOverdue() {
  if (!overdue.value.length || !auth.profile) return
  sendingReminders.value = true
  reminderMessage.value = ''
  const { error } = await supabase.from('notifications').insert(
    overdue.value.map((p) => ({
      user_id: p.id,
      text: `Reminder: your training deadline (${p.due_date}) has passed — please complete your remaining lessons.`,
      action: { type: 'goto', view: 'modules' },
    })),
  )
  sendingReminders.value = false
  if (error) {
    reminderMessage.value = error.message
    return
  }
  await logActivity(auth.profile.id, `Sent an overdue reminder to ${overdue.value.length} learner${overdue.value.length === 1 ? '' : 's'}`)
  reminderMessage.value = `Reminder sent to ${overdue.value.length} learner${overdue.value.length === 1 ? '' : 's'}.`
}

async function postAnnouncement() {
  if (!announcementText.value.trim() || !auth.profile) return
  postingAnnouncement.value = true
  await supabase.from('announcements').insert({ text: announcementText.value.trim(), created_by: auth.profile.id })
  await logActivity(auth.profile.id, `Posted an announcement: "${announcementText.value.trim()}"`)
  announcementText.value = ''
  postingAnnouncement.value = false
  await load()
}

async function previewDigest() {
  loadingDigest.value = true
  digestError.value = ''
  digestSummaries.value = null
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  try {
    const res = await fetch('/.netlify/functions/weekly-digest-preview', { headers: { authorization: `Bearer ${token}` } })
    const body = await res.json()
    if (!res.ok) digestError.value = body.error ?? 'Could not load preview'
    else digestSummaries.value = body.summaries
  } catch {
    digestError.value = 'Could not reach the preview service.'
  }
  loadingDigest.value = false
}
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <p>Admin · company overview</p>
        <h2>Analytics</h2>
      </div>
    </div>

    <p v-if="loading" class="sub">Loading…</p>
    <template v-else-if="data">
      <DashWidget v-if="stats" id="adm.stats">
        <div class="stats">
          <div class="card stat"><div class="lbl">Active learners</div><div class="val">{{ stats.learners }}</div><div class="sub">employees with an active account</div></div>
          <div class="card stat"><div class="lbl">Avg. completion</div><div class="val">{{ stats.completion }}%</div><div class="sub">of assigned lessons</div></div>
          <div class="card stat"><div class="lbl">Avg. quiz score</div><div class="val">{{ stats.score == null ? '—' : stats.score + '%' }}</div><div class="sub">across all attempts</div></div>
          <div class="card stat dark"><div class="lbl">Overdue learners</div><div class="val">{{ stats.overdue }}</div><div class="sub">need follow-up</div></div>
        </div>
      </DashWidget>

      <div class="cols">
        <div>
          <DashWidget id="adm.dept">
            <div class="card" style="padding: 20px; margin-bottom: 16px">
              <h2 style="font-size: 19px; margin-bottom: 8px">Completion by department</h2>
              <div v-for="d in dept" :key="d.name" class="hbar"><span>{{ d.name }}</span><div class="bar"><i :style="{ width: d.pct + '%' }" /></div><b>{{ d.pct }}%</b></div>
              <p v-if="!dept.length" class="sub">No learners yet.</p>
            </div>
          </DashWidget>

          <DashWidget id="adm.funnel"><FunnelCard :rows="funnel" /></DashWidget>

          <DashWidget id="adm.heat">
            <div class="card" style="padding: 20px; margin-bottom: 16px">
              <div class="row wrap"><h2 style="font-size: 19px">When people learn</h2><span class="sub sp">Activity, last 30 days</span></div>
              <div class="heat">
                <span />
                <span v-for="h in hours" :key="h" class="sub" style="text-align: center; font-size: 10.5px">{{ hourLabel(h) }}</span>
                <template v-for="(d, di) in days" :key="d">
                  <span class="sub">{{ d }}</span>
                  <div
                    v-for="h in hours"
                    :key="h"
                    class="cell"
                    :title="`${d} ${hourLabel(h)}: ${heat[di]?.[h] ?? 0} actions`"
                    :style="{ opacity: 0.08 + ((heat[di]?.[h] ?? 0) / heatMax) * 0.92 }"
                  />
                </template>
              </div>
              <div class="row" style="margin-top: 12px"><span class="sub">Less</span><div class="legend-bar" /><span class="sub">More</span></div>
              <div class="note">{{ peakText }}</div>
            </div>
          </DashWidget>
        </div>

        <div>
          <DashWidget id="adm.compliance">
            <div class="card" style="padding: 20px; margin-bottom: 16px">
              <h2 style="font-size: 19px; margin-bottom: 10px">Compliance tracker</h2>
              <div class="row" style="gap: 10px; margin-bottom: 12px">
                <div class="due hot grow"><div><div class="sub">Due in 7 days</div><b style="font-size: 24px">{{ dueSoonTotal }}</b></div></div>
                <div class="due grow" style="background: var(--danger-soft)"><div><div class="sub">Overdue</div><b style="font-size: 24px; color: var(--danger)">{{ overdue.length }}</b></div></div>
              </div>
              <table style="font-size: 13px">
                <thead><tr><th style="padding: 6px 4px">Dept</th><th style="padding: 6px 4px">Due soon</th><th style="padding: 6px 4px">Overdue</th></tr></thead>
                <tbody>
                  <tr v-for="r in compliance" :key="r.department">
                    <td style="padding: 8px 4px"><b>{{ r.department }}</b></td>
                    <td style="padding: 8px 4px">{{ r.dueSoon }}</td>
                    <td style="padding: 8px 4px"><span :class="['pill', r.overdue ? 'pill-danger' : 'pill-teal']">{{ r.overdue }}</span></td>
                  </tr>
                </tbody>
              </table>
              <button class="btn btn-sm" style="margin-top: 12px; width: 100%; justify-content: center; background: var(--brass); color: #1a1000" :disabled="!overdue.length || sendingReminders" @click="remindOverdue">
                {{ sendingReminders ? 'Sending…' : `✉ Remind all overdue (${overdue.length})` }}
              </button>
              <p v-if="reminderMessage" class="hint">{{ reminderMessage }}</p>
            </div>
          </DashWidget>

          <DashWidget id="adm.health">
            <div class="card" style="padding: 20px; margin-bottom: 16px">
              <h2 style="font-size: 19px">Content health</h2>
              <div class="sub">What to fix or retire</div>
              <div class="hsec"><div class="sub strong">🕸 Not opened in 30 days</div>
                <div v-for="u in health.unused" :key="u.title" class="hitem"><b>{{ u.title }}</b><div class="sub">{{ u.detail }}</div></div>
                <div v-if="!health.unused.length" class="sub">Every course was used recently.</div>
              </div>
              <div class="hsec"><div class="sub strong">⏭ Lessons people don't finish</div>
                <div v-for="u in health.dropoffs" :key="u.title" class="hitem"><b>{{ u.title }}</b><div class="sub">{{ u.detail }}</div></div>
                <div v-if="!health.dropoffs.length" class="sub">No drop-off pattern yet.</div>
              </div>
              <div class="hsec"><div class="sub strong">📉 Quizzes most people fail</div>
                <div v-for="q in health.hardQuizzes" :key="q.milestone" class="hitem row"><div class="grow"><b>{{ milestoneName(q.milestone) }}</b><div class="sub">{{ q.attempts }} attempts</div></div><b>{{ q.rate }}% pass</b></div>
                <div v-if="!health.hardQuizzes.length" class="sub">Not enough quiz attempts yet.</div>
              </div>
            </div>
          </DashWidget>
        </div>
      </div>
    </template>

    <h2 style="font-size: 19px; margin: 28px 0 12px">Admin tools</h2>
    <div class="tools">
      <div class="card" style="padding: 18px">
        <div class="panel-title" style="padding: 0 0 6px"><h3>Post an announcement</h3></div>
        <p class="hint" style="margin-bottom: 8px">Shows as a dismissible banner on every employee's dashboard.</p>
        <textarea v-model="announcementText" rows="3" style="width: 100%" placeholder="e.g. New compliance training due by end of month." />
        <button class="btn btn-primary btn-sm" style="margin-top: 8px" :disabled="postingAnnouncement || !announcementText.trim()" @click="postAnnouncement">
          {{ postingAnnouncement ? 'Posting…' : 'Post announcement' }}
        </button>
      </div>

      <div class="card" style="padding: 18px">
        <div class="panel-title" style="padding: 0 0 6px"><h3>Weekly digest</h3></div>
        <p class="hint" style="margin-bottom: 8px">A real digest emails automatically every Monday once Resend is configured — preview what it would say right now.</p>
        <button class="btn btn-ghost btn-sm" :disabled="loadingDigest" @click="previewDigest">{{ loadingDigest ? 'Loading…' : 'Preview weekly digest' }}</button>
        <p v-if="digestError" class="hint" style="color: var(--danger); margin-top: 8px">{{ digestError }}</p>
        <div v-if="digestSummaries" style="margin-top: 12px">
          <div v-for="s in digestSummaries" :key="s.department" style="margin-bottom: 12px">
            <div style="font-weight: 700">{{ s.department }}</div>
            <div style="font-size: 13px; color: var(--ink-soft)">✅ {{ s.completions }} lesson completion(s) this week · 🎖️ {{ s.quizPasses }} quiz pass(es) this week</div>
            <div v-if="s.overdue.length" style="font-size: 13px; color: var(--danger)">⚠️ Overdue: {{ s.overdue.map((o) => `${o.name} (since ${o.dueDate})`).join(', ') }}</div>
            <div v-else style="font-size: 13px; color: var(--teal)">No one overdue</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top: 16px">
      <div class="panel-title"><h3>Recent admin activity</h3></div>
      <div v-for="a in activity" :key="a.id" class="row-item" style="cursor: default">
        <div class="row-info">
          <div class="t">{{ a.text }}</div>
          <div class="m">{{ new Date(a.created_at).toLocaleString() }}</div>
        </div>
      </div>
      <p v-if="!activity.length" style="padding: 24px; text-align: center; color: var(--ink-soft)">No activity yet.</p>
    </div>
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
.cols {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 16px;
  align-items: start;
}
@media (max-width: 1100px) {
  .cols {
    grid-template-columns: 1fr;
  }
}
.tools {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
  align-items: start;
}
.hbar {
  display: grid;
  grid-template-columns: 110px 1fr 46px;
  gap: 12px;
  align-items: center;
  margin: 11px 0;
  font-weight: 600;
}
.heat {
  display: grid;
  grid-template-columns: 36px repeat(12, 1fr);
  gap: 4px;
  margin-top: 12px;
  align-items: center;
}
.cell {
  height: 26px;
  border-radius: 6px;
  background: var(--blue);
}
.legend-bar {
  width: 90px;
  height: 8px;
  border-radius: 9px;
  background: linear-gradient(90deg, var(--surface-sunken), var(--blue));
}
.note {
  background: var(--blue-soft);
  color: var(--blue);
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 12.5px;
  font-weight: 600;
  margin-top: 12px;
}
.due {
  display: flex;
  gap: 14px;
  align-items: center;
  background: var(--surface-sunken);
  border-radius: 14px;
  padding: 12px 14px;
}
.due.hot {
  background: var(--brass-soft);
}
.hsec {
  margin-top: 14px;
}
.strong {
  font-weight: 700;
  margin-bottom: 4px;
}
.hitem {
  padding: 6px 0;
}
</style>
