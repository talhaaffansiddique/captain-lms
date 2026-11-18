// Monitoring & alerts: finds learners who have gone quiet or have a course deadline close (or missed)
// and emails them, copying HR and the department manager if the admin switched that on.
// Used by admin-send-alerts (the "Send now" button) and monitoring-daily (the scheduled run).

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendMail } from './mailer'
import { renderEmail } from './emailTemplate'

export interface MonitoringSettings {
  enabled: boolean
  inactivity_days: number
  deadline_days: number
  cc_hr: boolean
  hr_email: string
  cc_manager: boolean
}

export interface Alert {
  userId: string
  name: string
  email: string
  department: string
  kind: 'inactivity' | 'deadline' | 'overdue'
  detail: string
}

const DAY = 86400000
const dayStart = () => new Date(new Date().toDateString()).getTime()

/** Same learner + same reason is not emailed again within this many days. */
const REPEAT_AFTER_DAYS = 3

export async function loadSettings(db: SupabaseClient): Promise<MonitoringSettings> {
  const { data } = await db.from('monitoring_settings').select('*').eq('id', 1).maybeSingle()
  return { enabled: false, inactivity_days: 14, deadline_days: 3, cc_hr: true, hr_email: '', cc_manager: true, ...(data ?? {}) }
}

export async function findAlerts(db: SupabaseClient, s: MonitoringSettings): Promise<Alert[]> {
  const [{ data: people }, { data: comps }, { data: study }, { data: attempts }, { data: asg }, { data: mods }, { data: courses }] = await Promise.all([
    db.from('profiles').select('id, full_name, department, is_active, created_at').eq('role', 'employee'),
    db.from('video_completions').select('user_id, module_id, completed, completed_at, last_watched_at'),
    db.from('study_log').select('user_id, day, seconds'),
    db.from('quiz_attempts').select('user_id, created_at'),
    db.from('course_assignments').select('user_id, course_id, due_date'),
    db.from('modules').select('id, course_id').eq('is_draft', false).eq('is_archived', false),
    db.from('courses').select('id, title'),
  ])

  // e-mail addresses live in auth, not profiles
  const emails = new Map<string, string>()
  for (let page = 1; page <= 10; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 200 })
    for (const u of data?.users ?? []) if (u.email) emails.set(u.id, u.email)
    if (!data?.users || data.users.length < 200) break
  }

  const active = (people ?? []).filter((p) => p.is_active !== false)
  const lastActive = new Map<string, number>()
  const bump = (id: string, iso: string | null | undefined) => {
    if (!iso) return
    const t = new Date(iso).getTime()
    if (t > (lastActive.get(id) ?? 0)) lastActive.set(id, t)
  }
  for (const c of comps ?? []) {
    bump(c.user_id, c.completed_at)
    bump(c.user_id, c.last_watched_at)
  }
  for (const a of attempts ?? []) bump(a.user_id, a.created_at)
  for (const l of study ?? []) if (l.seconds > 0) bump(l.user_id, l.day + 'T12:00:00')

  const alerts: Alert[] = []
  const now = Date.now()
  for (const p of active) {
    const email = emails.get(p.id)
    if (!email) continue
    const since = lastActive.get(p.id) ?? new Date(p.created_at).getTime()
    const days = Math.floor((now - since) / DAY)
    if (days >= s.inactivity_days) {
      alerts.push({ userId: p.id, name: p.full_name, email, department: p.department, kind: 'inactivity', detail: `No learning activity for ${days} days` })
    }
  }

  const lessonsOf = new Map<number, number[]>()
  for (const m of mods ?? []) if (m.course_id) lessonsOf.set(m.course_id, [...(lessonsOf.get(m.course_id) ?? []), m.id])
  const done = new Map<string, Set<number>>()
  for (const c of comps ?? []) if (c.completed) done.set(c.user_id, (done.get(c.user_id) ?? new Set()).add(c.module_id))
  const titles = new Map((courses ?? []).map((c) => [c.id, c.title as string]))
  const byId = new Map(active.map((p) => [p.id, p]))
  for (const a of asg ?? []) {
    const p = byId.get(a.user_id)
    const email = emails.get(a.user_id)
    if (!p || !email || !a.due_date) continue
    const ls = lessonsOf.get(a.course_id) ?? []
    if (ls.length && ls.every((l) => done.get(a.user_id)?.has(l))) continue // finished
    const left = Math.round((new Date(a.due_date + 'T00:00:00').getTime() - dayStart()) / DAY)
    const title = titles.get(a.course_id) ?? 'a course'
    if (left < 0) alerts.push({ userId: p.id, name: p.full_name, email, department: p.department, kind: 'overdue', detail: `${title} was due ${a.due_date} (${-left} day${left === -1 ? '' : 's'} overdue)` })
    else if (left <= s.deadline_days) alerts.push({ userId: p.id, name: p.full_name, email, department: p.department, kind: 'deadline', detail: `${title} is due ${left === 0 ? 'today' : `in ${left} day${left === 1 ? '' : 's'} (${a.due_date})`}` })
  }
  return alerts
}

function subjectFor(a: Alert): string {
  return a.kind === 'inactivity' ? 'Captain LMS — we have not seen you in a while' : a.kind === 'deadline' ? 'Captain LMS — a course deadline is coming up' : 'Captain LMS — a course is overdue'
}

function htmlFor(a: Alert, site: string): string {
  const first = a.name.split(' ')[0] || 'there'
  const lead = a.kind === 'inactivity' ? 'You have not been active on Captain LMS recently.' : a.kind === 'deadline' ? 'A course deadline is coming up.' : 'A course deadline has passed.'
  return renderEmail({
    logoUrl: `${site}/email/captain-logo.png`,
    buttonUrl: site,
    heading: lead,
    paragraphs: [`Hi ${first.replace(/[<>&]/g, '')},`, a.detail.replace(/[<>&]/g, '') + '.', 'Please open Captain LMS and continue where you left off.'],
    buttonLabel: 'Open Captain LMS',
    footerNote: 'This is an automated reminder.',
  })
}

export interface SendSummary {
  sent: number
  failed: number
  skipped: number
  errors: string[]
}

export async function sendAlerts(db: SupabaseClient, s: MonitoringSettings, alerts: Alert[], site: string): Promise<SendSummary> {
  const sum: SendSummary = { sent: 0, failed: 0, skipped: 0, errors: [] }
  const since = new Date(Date.now() - REPEAT_AFTER_DAYS * DAY).toISOString()
  const { data: recent } = await db.from('alert_log').select('user_id, kind, detail').eq('status', 'sent').gte('created_at', since)
  const seen = new Set((recent ?? []).map((r) => `${r.user_id}|${r.kind}|${r.detail}`))

  const { data: managers } = s.cc_manager ? await db.from('profiles').select('id, department').eq('role', 'manager').neq('is_active', false) : { data: [] }
  const mgrEmails = new Map<string, string[]>()
  if (s.cc_manager && managers?.length) {
    const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 200 })
    const byId = new Map((data?.users ?? []).map((u) => [u.id, u.email]))
    for (const m of managers) {
      const e = byId.get(m.id)
      if (e) mgrEmails.set(m.department, [...(mgrEmails.get(m.department) ?? []), e])
    }
  }

  for (const a of alerts) {
    if (seen.has(`${a.userId}|${a.kind}|${a.detail}`)) {
      sum.skipped++
      continue
    }
    const cc = [s.cc_hr && s.hr_email ? s.hr_email : '', ...(s.cc_manager ? (mgrEmails.get(a.department) ?? []) : [])].filter(Boolean)
    let status: 'sent' | 'failed' = 'sent'
    let error: string | null = null
    try {
      await sendMail(a.email, subjectFor(a), htmlFor(a, site), cc.length ? cc : undefined)
      sum.sent++
    } catch (e) {
      status = 'failed'
      const err = e as { code?: string; responseCode?: number; message?: string }
      error = `${err.code ?? ''} ${err.responseCode ?? ''} ${err.message ?? 'Unknown error'}`.replace(/\s+/g, ' ').trim()
      sum.failed++
      if (sum.errors.length < 3) sum.errors.push(`${a.email}: ${error}`)
    }
    await db.from('alert_log').insert({ user_id: a.userId, to_email: a.email, cc: cc.join(', ') || null, kind: a.kind, detail: a.detail, status, error })
  }
  return sum
}
