<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { logActivity } from '@/lib/activity'
import { relativeTime } from '@/lib/learning'

interface Settings {
  enabled: boolean
  inactivity_days: number
  deadline_days: number
  cc_hr: boolean
  hr_email: string
  cc_manager: boolean
}
interface AlertPreview {
  userId: string
  name: string
  email: string
  department: string
  kind: 'inactivity' | 'deadline' | 'overdue'
  detail: string
}
interface LogRow {
  id: number
  to_email: string
  cc: string | null
  kind: string
  detail: string
  status: 'sent' | 'failed'
  error: string | null
  created_at: string
}

const auth = useAuthStore()
const s = ref<Settings>({ enabled: false, inactivity_days: 14, deadline_days: 3, cc_hr: true, hr_email: '', cc_manager: true })
const missing = ref(false)
const saving = ref(false)
const msg = ref('')
const error = ref('')
const queue = ref<AlertPreview[]>([])
const queueLoaded = ref(false)
const loadingQueue = ref(false)
const sending = ref(false)
const log = ref<LogRow[]>([])

async function load() {
  const [{ data, error: err }, { data: lg }] = await Promise.all([
    supabase.from('monitoring_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('alert_log').select('*').order('created_at', { ascending: false }).limit(100),
  ])
  if (err) {
    missing.value = true
    return
  }
  if (data) s.value = { enabled: data.enabled, inactivity_days: data.inactivity_days, deadline_days: data.deadline_days, cc_hr: data.cc_hr, hr_email: data.hr_email ?? '', cc_manager: data.cc_manager }
  log.value = (lg ?? []) as LogRow[]
}
onMounted(load)

async function callFn(payload: Record<string, unknown>) {
  const { data: sess } = await supabase.auth.getSession()
  const res = await fetch('/.netlify/functions/admin-send-alerts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${sess.session?.access_token ?? ''}` },
    body: JSON.stringify(payload),
  })
  const out = await res.json()
  if (!res.ok) throw new Error(out.error ?? 'Request failed')
  return out
}

async function save() {
  error.value = ''
  msg.value = ''
  if (s.value.cc_hr && s.value.hr_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.value.hr_email)) {
    error.value = 'The HR CC address does not look like an email address.'
    return
  }
  saving.value = true
  const { error: err } = await supabase.from('monitoring_settings').upsert({ id: 1, ...s.value, inactivity_days: Math.max(1, s.value.inactivity_days), deadline_days: Math.max(0, s.value.deadline_days), updated_at: new Date().toISOString() })
  saving.value = false
  if (err) error.value = err.message
  else {
    msg.value = 'Settings saved. Use "Refresh queue" to see who would be emailed.'
    await logActivity(auth.profile?.id, 'Updated monitoring & alert settings')
  }
}

async function refreshQueue() {
  error.value = ''
  loadingQueue.value = true
  try {
    queue.value = (await callFn({ preview: true })).alerts
    queueLoaded.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not load the queue.'
  }
  loadingQueue.value = false
}

async function sendNow() {
  if (!window.confirm(`Send ${queue.value.length} alert email(s) now?\n\nLearners already emailed about the same thing in the last 3 days are skipped.`)) return
  error.value = ''
  msg.value = ''
  sending.value = true
  try {
    const out = await callFn({})
    msg.value = `${out.sent} sent, ${out.failed} failed, ${out.skipped} skipped (already emailed recently).` + (out.errors?.length ? ` First error: ${out.errors[0]}` : '')
    await logActivity(auth.profile?.id, `Sent ${out.sent} monitoring alert email(s)`)
    await load()
    await refreshQueue()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not send.'
  }
  sending.value = false
}

const KIND: Record<string, { label: string; cls: string }> = {
  inactivity: { label: 'Inactivity', cls: 'pill-outline' },
  deadline: { label: 'Deadline', cls: 'pill-brass' },
  overdue: { label: 'Overdue', cls: 'pill-danger' },
}
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <h2>Monitoring & alerts</h2>
        <p>Email learners who go quiet or have a course deadline close or missed — with HR and the manager copied in.</p>
      </div>
    </div>

    <div v-if="missing" class="card" style="padding: 16px; margin-bottom: 16px; border-left: 3px solid var(--brass)">
      <b>One-time setup needed.</b> Run <code>supabase/v5.sql</code> in the Supabase SQL Editor to turn on monitoring & alerts.
    </div>
    <p v-if="error" class="hint" style="color: var(--danger)">{{ error }}</p>
    <p v-if="msg" class="hint" style="color: var(--teal)">{{ msg }}</p>

    <div class="two">
      <div class="card" style="padding: 18px">
        <div class="panel-title" style="padding: 0 0 8px"><h3>Alert rules</h3></div>
        <label class="row" style="font-weight: 600; gap: 8px; margin-bottom: 12px"><input v-model="s.enabled" type="checkbox" style="width: auto" /> Automatic daily alerts (runs every morning at 09:00 UAE time)</label>
        <div class="field"><label>Learner inactivity — alert after (days without activity)</label><input v-model.number="s.inactivity_days" type="number" min="1" /></div>
        <div class="field"><label>Deadline reminder — alert when a course is due within (days)</label><input v-model.number="s.deadline_days" type="number" min="0" /></div>
        <p class="hint" style="margin: 0 0 10px">Overdue courses are always included.</p>
        <div class="field">
          <label class="row" style="gap: 8px"><input v-model="s.cc_hr" type="checkbox" style="width: auto" /> CC HR</label>
          <input v-model="s.hr_email" type="email" placeholder="hr@yourcompany.com" :disabled="!s.cc_hr" />
        </div>
        <label class="row" style="font-weight: 500; gap: 8px"><input v-model="s.cc_manager" type="checkbox" style="width: auto" /> CC the learner's department manager</label>
        <button class="btn btn-primary" style="margin-top: 14px" :disabled="saving || missing" @click="save">{{ saving ? 'Saving…' : 'Save settings' }}</button>
      </div>

      <div class="card" style="padding: 18px">
        <div class="panel-title" style="padding: 0 0 8px"><h3>What the emails say</h3></div>
        <div class="mail">
          <div class="sub">To: the learner</div>
          <div class="sub">CC: {{ [s.cc_hr && s.hr_email ? s.hr_email : '', s.cc_manager ? 'their department manager' : ''].filter(Boolean).join(', ') || '—' }}</div>
          <div class="sub">Subject: Captain LMS — a course deadline is coming up</div>
          <hr />
          <p>Hi Kyrstlee, a course deadline is coming up. <b>Cyber Security Awareness</b> is due in 3 days. Please open Captain LMS and continue where you left off.</p>
        </div>
        <p class="hint" style="margin-top: 8px">Sent from the company mailbox in the branded Captain design. The same learner is not emailed about the same thing twice within 3 days.</p>
      </div>
    </div>

    <div class="card" style="padding: 18px; margin-top: 18px">
      <div class="panel-title" style="padding: 0 0 8px">
        <h3>Alerts ready to send <span v-if="queueLoaded" class="pill pill-outline">{{ queue.length }}</span></h3>
        <div class="row">
          <button class="btn btn-ghost btn-sm" :disabled="loadingQueue || missing" @click="refreshQueue">{{ loadingQueue ? 'Loading…' : queueLoaded ? 'Refresh queue' : 'Show queue' }}</button>
          <button class="btn btn-primary btn-sm" :disabled="sending || !queue.length" @click="sendNow">{{ sending ? 'Sending…' : `Send ${queue.length} now` }}</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Learner</th><th>Department</th><th>Type</th><th>Reason</th></tr></thead>
          <tbody>
            <tr v-for="(a, i) in queue" :key="i">
              <td><b>{{ a.name }}</b><div class="sub">{{ a.email }}</div></td>
              <td>{{ a.department }}</td>
              <td><span class="pill" :class="KIND[a.kind]!.cls">{{ KIND[a.kind]!.label }}</span></td>
              <td class="sub">{{ a.detail }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="queueLoaded && !queue.length" class="hint" style="padding: 18px; text-align: center">Nobody needs an alert right now. 🎉</p>
        <p v-if="!queueLoaded" class="hint" style="padding: 18px; text-align: center">Press “Show queue” to see who would be emailed.</p>
      </div>
    </div>

    <div class="card table-wrap" style="margin-top: 18px">
      <div class="panel-title"><h3>Sent alerts</h3></div>
      <table>
        <thead><tr><th>When</th><th>To</th><th>CC</th><th>Type</th><th>Status</th></tr></thead>
        <tbody>
          <tr v-for="l in log" :key="l.id">
            <td class="sub">{{ relativeTime(l.created_at) }}</td>
            <td>{{ l.to_email }}<div class="sub">{{ l.detail }}</div></td>
            <td class="sub">{{ l.cc ?? '—' }}</td>
            <td><span class="pill" :class="KIND[l.kind]?.cls">{{ KIND[l.kind]?.label ?? l.kind }}</span></td>
            <td><span class="pill" :class="l.status === 'sent' ? 'pill-teal' : 'pill-danger'">{{ l.status }}</span><div v-if="l.error" class="sub" style="color: var(--danger)">{{ l.error }}</div></td>
          </tr>
        </tbody>
      </table>
      <p v-if="!log.length" class="hint" style="padding: 18px; text-align: center">Nothing sent yet.</p>
    </div>
  </div>
</template>

<style scoped>
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  align-items: start;
}
@media (max-width: 900px) {
  .two {
    grid-template-columns: 1fr;
  }
}
.mail {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  font-size: 13px;
}
.mail hr {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 10px 0;
}
</style>
