// KPI numbers for the dashboards (Admin analytics and the HR overview). Staff roles can read the
// underlying tables; everything is computed in the browser from those rows.
import { supabase } from '@/lib/supabase'
import { daysUntil } from '@/lib/assignments'

export interface KpiRaw {
  people: { id: string; department: string }[]
  completions: { user_id: string; module_id: number; completed_at: string | null; last_watched_at: string | null }[]
  attempts: { user_id: string; milestone: string; score: number; total: number; passed: boolean; created_at: string }[]
  assignments: { user_id: string; course_id: number; due_date: string | null }[]
  modules: { id: number; course_id: number | null }[]
  study: { user_id: string; day: string; seconds: number }[]
}

export async function loadKpiRaw(): Promise<KpiRaw> {
  const [p, c, a, asg, m, s] = await Promise.all([
    supabase.from('profiles').select('id, department, role, is_active').eq('role', 'employee'),
    supabase.from('video_completions').select('user_id, module_id, completed, completed_at, last_watched_at'),
    supabase.from('quiz_attempts').select('user_id, milestone, score, total, passed, created_at'),
    supabase.from('course_assignments').select('user_id, course_id, due_date'),
    supabase.from('modules').select('id, course_id').eq('is_draft', false).eq('is_archived', false),
    supabase.from('study_log').select('user_id, day, seconds'),
  ])
  return {
    people: ((p.data ?? []) as { id: string; department: string; is_active?: boolean }[]).filter((x) => x.is_active !== false),
    completions: ((c.data ?? []) as (KpiRaw['completions'][number] & { completed: boolean })[]).filter((x) => x.completed),
    attempts: (a.data ?? []) as KpiRaw['attempts'],
    assignments: asg.error ? [] : ((asg.data ?? []) as KpiRaw['assignments']),
    modules: (m.data ?? []) as KpiRaw['modules'],
    study: s.error ? [] : ((s.data ?? []) as KpiRaw['study']),
  }
}

export interface KpiResult {
  labels: string[]
  lessons: number[]
  quizzes: number[]
  active: number[]
  compliance: { completed: number; inProgress: number; notStarted: number; overdue: number }
  quizScores: { labels: string[]; values: number[] }
  tiles: { active: number; people: number; completionRate: number | null; avgScore: number | null; overdue: number }
}

const dayStr = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const MILESTONES = [
  ['1', 'Bronze'],
  ['2', 'Silver'],
  ['3', 'Gold'],
  ['4', 'Diamond'],
  ['5', 'Diamond II'],
  ['final', 'Final'],
] as const

export function computeKpis(raw: KpiRaw, rangeDays: number, dept: string): KpiResult {
  const ids = new Set(raw.people.filter((p) => dept === 'All' || p.department === dept).map((p) => p.id))
  const bucket = Math.max(1, Math.round(rangeDays / 7))
  const now = new Date(new Date().toDateString())
  const edges: { from: number; to: number; label: string }[] = []
  for (let b = 6; b >= 0; b--) {
    const hi = b * bucket // days ago (newer edge)
    const lo = hi + bucket
    const d = new Date(now)
    d.setDate(d.getDate() - hi)
    edges.push({ from: lo, to: hi, label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) })
  }
  const ago = (iso: string) => Math.floor((now.getTime() + 86400000 - new Date(iso).getTime()) / 86400000)
  const inBucket = (iso: string | null, e: { from: number; to: number }) => {
    if (!iso) return false
    const a = ago(iso)
    return a >= e.to && a < e.from
  }

  const lessons: number[] = []
  const quizzes: number[] = []
  const active: number[] = []
  for (const e of edges) {
    lessons.push(raw.completions.filter((c) => ids.has(c.user_id) && inBucket(c.completed_at, e)).length)
    quizzes.push(raw.attempts.filter((a) => ids.has(a.user_id) && a.passed && inBucket(a.created_at, e)).length)
    const who = new Set<string>()
    for (const c of raw.completions) if (ids.has(c.user_id) && (inBucket(c.completed_at, e) || inBucket(c.last_watched_at, e))) who.add(c.user_id)
    for (const a of raw.attempts) if (ids.has(a.user_id) && inBucket(a.created_at, e)) who.add(a.user_id)
    for (const s of raw.study) if (ids.has(s.user_id) && s.seconds > 0 && inBucket(s.day + 'T12:00:00', e)) who.add(s.user_id)
    active.push(who.size)
  }

  // compliance: status of every assignment for the people in scope
  const lessonsPerCourse = new Map<number, Set<number>>()
  for (const m of raw.modules) if (m.course_id) lessonsPerCourse.set(m.course_id, (lessonsPerCourse.get(m.course_id) ?? new Set()).add(m.id))
  const doneByUser = new Map<string, Set<number>>()
  for (const c of raw.completions) doneByUser.set(c.user_id, (doneByUser.get(c.user_id) ?? new Set()).add(c.module_id))
  const compliance = { completed: 0, inProgress: 0, notStarted: 0, overdue: 0 }
  for (const a of raw.assignments) {
    if (!ids.has(a.user_id)) continue
    const lessonIds = [...(lessonsPerCourse.get(a.course_id) ?? [])]
    const done = lessonIds.filter((l) => doneByUser.get(a.user_id)?.has(l)).length
    if (lessonIds.length && done >= lessonIds.length) compliance.completed++
    else if ((daysUntil(a.due_date) ?? 1) < 0) compliance.overdue++
    else if (done > 0) compliance.inProgress++
    else compliance.notStarted++
  }
  const totalAsg = compliance.completed + compliance.inProgress + compliance.notStarted + compliance.overdue

  // quiz performance (attempts inside the selected range)
  const cutoff = now.getTime() - rangeDays * 86400000
  const inRange = raw.attempts.filter((a) => ids.has(a.user_id) && new Date(a.created_at).getTime() >= cutoff && a.total > 0)
  const quizScores = {
    labels: MILESTONES.map((m) => m[1]) as string[],
    values: MILESTONES.map(([m]) => {
      const list = inRange.filter((a) => a.milestone === m)
      return list.length ? Math.round(list.reduce((s, a) => s + (a.score / a.total) * 100, 0) / list.length) : 0
    }),
  }
  const avgScore = inRange.length ? Math.round(inRange.reduce((s, a) => s + (a.score / a.total) * 100, 0) / inRange.length) : null

  const activeNow = new Set<string>()
  for (const c of raw.completions) if (ids.has(c.user_id) && (ago(c.completed_at ?? c.last_watched_at ?? '1970-01-01') < rangeDays)) activeNow.add(c.user_id)
  for (const a of inRange) activeNow.add(a.user_id)
  for (const s of raw.study) if (ids.has(s.user_id) && s.seconds > 0 && ago(s.day + 'T12:00:00') < rangeDays) activeNow.add(s.user_id)

  return {
    labels: edges.map((e) => e.label),
    lessons,
    quizzes,
    active,
    compliance,
    quizScores,
    tiles: {
      active: activeNow.size,
      people: ids.size,
      completionRate: totalAsg ? Math.round((compliance.completed / totalAsg) * 100) : null,
      avgScore,
      overdue: compliance.overdue,
    },
  }
}
