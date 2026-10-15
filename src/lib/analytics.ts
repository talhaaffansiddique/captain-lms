import { supabase } from '@/lib/supabase'
import { isActive } from '@/lib/employees'
import { loadCourses, courseProgress, type CourseVM } from '@/lib/courses'
import { isoDay } from '@/lib/learning'
import type { Module, Profile, QuizAttempt, VideoCompletion } from '@/lib/database.types'

export interface AnalyticsData {
  people: Profile[] // active employees
  modules: Module[] // published lessons
  courses: CourseVM[]
  completions: VideoCompletion[]
  attempts: QuizAttempt[]
}

/** Everything the admin/manager analytics screens need, in a few queries. */
export async function loadAnalyticsData(department?: string): Promise<AnalyticsData> {
  const [{ data: profs }, { data: mods }, { data: comps }, { data: atts }] = await Promise.all([
    supabase.from('profiles').select('*'),
    supabase.from('modules').select('*').eq('is_draft', false),
    supabase.from('video_completions').select('*'),
    supabase.from('quiz_attempts').select('*'),
  ])
  const modules = (mods ?? []) as Module[]
  let people = ((profs ?? []) as Profile[]).filter((p) => p.role === 'employee' && isActive(p))
  if (department) people = people.filter((p) => p.department === department)
  const ids = new Set(people.map((p) => p.id))
  return {
    people,
    modules,
    courses: (await loadCourses(modules)).filter((c) => c.lessons.length > 0),
    completions: ((comps ?? []) as VideoCompletion[]).filter((c) => ids.has(c.user_id)),
    attempts: ((atts ?? []) as QuizAttempt[]).filter((a) => ids.has(a.user_id)),
  }
}

export function assignedModules(person: Profile, modules: Module[]): Module[] {
  return modules.filter((m) => m.department === 'General' || m.department === person.department)
}

export function personProgress(person: Profile, data: AnalyticsData) {
  const assigned = assignedModules(person, data.modules)
  const done = new Set(data.completions.filter((c) => c.user_id === person.id && c.completed).map((c) => c.module_id))
  const doneCount = assigned.filter((m) => done.has(m.id)).length
  return { total: assigned.length, done: doneCount, pct: assigned.length ? Math.round((doneCount / assigned.length) * 100) : 0 }
}

export function lastActive(personId: string, data: AnalyticsData): string | null {
  let latest: string | null = null
  const consider = (iso: string | null | undefined) => {
    if (iso && (!latest || iso > latest)) latest = iso
  }
  for (const c of data.completions) if (c.user_id === personId) {
    consider(c.completed_at)
    consider(c.last_watched_at)
  }
  for (const a of data.attempts) if (a.user_id === personId) consider(a.created_at)
  return latest
}

export type PersonStatus = 'Completed' | 'On track' | 'At risk' | 'Overdue'

export function personStatus(person: Profile, data: AnalyticsData): PersonStatus {
  const { pct } = personProgress(person, data)
  const today = isoDay(new Date())
  if (pct >= 100 && assignedModules(person, data.modules).length > 0) return 'Completed'
  if (person.due_date && person.due_date < today) return 'Overdue'
  const active = lastActive(person.id, data)
  const idleDays = active ? (Date.now() - new Date(active).getTime()) / 86400000 : Infinity
  const dueSoon = person.due_date ? (new Date(`${person.due_date}T00:00:00`).getTime() - Date.now()) / 86400000 <= 14 : false
  if (pct < 60 && (dueSoon || idleDays > 7)) return 'At risk'
  return 'On track'
}

export function averageCompletion(data: AnalyticsData): number {
  if (!data.people.length) return 0
  return Math.round(data.people.reduce((s, p) => s + personProgress(p, data).pct, 0) / data.people.length)
}

export function averageQuizScore(attempts: QuizAttempt[]): number | null {
  if (!attempts.length) return null
  return Math.round(attempts.reduce((s, a) => s + (a.total ? (a.score / a.total) * 100 : 0), 0) / attempts.length)
}

export function completionByDepartment(data: AnalyticsData): { name: string; pct: number }[] {
  const groups = new Map<string, Profile[]>()
  for (const p of data.people) groups.set(p.department, [...(groups.get(p.department) ?? []), p])
  return [...groups.entries()]
    .map(([name, list]) => ({ name, pct: Math.round(list.reduce((s, p) => s + personProgress(p, data).pct, 0) / list.length) }))
    .sort((a, b) => b.pct - a.pct)
}

export interface FunnelRow {
  course: CourseVM
  started: number
  completed: number
  passed: number
  stopLesson: { index: number; title: string; dropPct: number } | null
}

/** Per course: people who started, finished every lesson, and finished while also holding a passed quiz. */
export function courseFunnel(data: AnalyticsData): FunnelRow[] {
  const passers = new Set(data.attempts.filter((a) => a.passed).map((a) => a.user_id))
  return data.courses.map((course) => {
    const lessonIds = new Set(course.lessons.map((l) => l.id))
    const byUser = new Map<string, VideoCompletion[]>()
    for (const c of data.completions) if (lessonIds.has(c.module_id)) byUser.set(c.user_id, [...(byUser.get(c.user_id) ?? []), c])
    let started = 0
    let completed = 0
    let passed = 0
    for (const [userId, list] of byUser) {
      if (!list.some((c) => c.watched_seconds > 0 || c.completed)) continue
      started++
      const doneIds = new Set(list.filter((c) => c.completed).map((c) => c.module_id))
      if (course.lessons.every((l) => doneIds.has(l.id))) {
        completed++
        if (passers.has(userId)) passed++
      }
    }
    // The lesson where the largest share of those who reached it did not finish it.
    let stop: FunnelRow['stopLesson'] = null
    course.lessons.forEach((l, i) => {
      const touched = data.completions.filter((c) => c.module_id === l.id && (c.watched_seconds > 0 || c.completed))
      if (touched.length < 2) return
      const drop = Math.round((touched.filter((c) => !c.completed).length / touched.length) * 100)
      if (!stop || drop > stop.dropPct) stop = { index: i, title: l.title, dropPct: drop }
    })
    return { course, started, completed, passed, stopLesson: stop }
  })
}

/** 7 (Mon–Sun) × 24 (hour) activity counts over the last 30 days. */
export function activityHeatmap(data: AnalyticsData): number[][] {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  const since = Date.now() - 30 * 86400000
  const bump = (iso: string | null | undefined) => {
    if (!iso) return
    const d = new Date(iso)
    if (d.getTime() < since) return
    grid[(d.getDay() + 6) % 7]![d.getHours()]!++
  }
  for (const c of data.completions) {
    bump(c.last_watched_at)
    bump(c.completed_at)
  }
  for (const a of data.attempts) bump(a.created_at)
  return grid
}

export function complianceByDepartment(data: AnalyticsData): { department: string; dueSoon: number; overdue: number }[] {
  const today = isoDay(new Date())
  const soon = isoDay(new Date(Date.now() + 7 * 86400000))
  const rows = new Map<string, { dueSoon: number; overdue: number }>()
  for (const p of data.people) {
    const row = rows.get(p.department) ?? { dueSoon: 0, overdue: 0 }
    if (p.due_date && personProgress(p, data).pct < 100) {
      if (p.due_date < today) row.overdue++
      else if (p.due_date <= soon) row.dueSoon++
    }
    rows.set(p.department, row)
  }
  return [...rows.entries()].map(([department, v]) => ({ department, ...v })).sort((a, b) => b.overdue - a.overdue || b.dueSoon - a.dueSoon)
}

export function overduePeople(data: AnalyticsData): Profile[] {
  const today = isoDay(new Date())
  return data.people.filter((p) => !!p.due_date && p.due_date < today && personProgress(p, data).pct < 100)
}

export interface HealthData {
  unused: { title: string; detail: string }[]
  dropoffs: { title: string; detail: string }[]
  hardQuizzes: { milestone: string; rate: number; attempts: number }[]
}

export function contentHealth(data: AnalyticsData): HealthData {
  const since = Date.now() - 30 * 86400000
  const touchedRecently = (lessonIds: Set<number>) =>
    data.completions.filter((c) => lessonIds.has(c.module_id)).some((c) => [c.completed_at, c.last_watched_at].some((t) => t && new Date(t).getTime() >= since))
  const unused = data.courses
    .filter((c) => !touchedRecently(new Set(c.lessons.map((l) => l.id))))
    .map((c) => ({ title: c.title, detail: `${c.lessons.length} lesson${c.lessons.length === 1 ? '' : 's'} · no activity in 30 days` }))
    .slice(0, 3)

  const dropoffs = data.modules
    .map((m) => {
      const touched = data.completions.filter((c) => c.module_id === m.id && (c.watched_seconds > 0 || c.completed))
      const left = touched.filter((c) => !c.completed).length
      return { title: m.title, touched: touched.length, left }
    })
    .filter((x) => x.touched >= 2 && x.left > 0)
    .sort((a, b) => b.left / b.touched - a.left / a.touched)
    .slice(0, 3)
    .map((x) => ({ title: x.title, detail: `${Math.round((x.left / x.touched) * 100)}% of learners who start it don't finish` }))

  const byMilestone = new Map<string, { total: number; passed: number }>()
  for (const a of data.attempts) {
    const row = byMilestone.get(a.milestone) ?? { total: 0, passed: 0 }
    row.total++
    if (a.passed) row.passed++
    byMilestone.set(a.milestone, row)
  }
  const hardQuizzes = [...byMilestone.entries()]
    .filter(([, v]) => v.total >= 2)
    .map(([milestone, v]) => ({ milestone, rate: Math.round((v.passed / v.total) * 100), attempts: v.total }))
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 3)
  return { unused, dropoffs, hardQuizzes }
}

export { courseProgress }
