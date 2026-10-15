import { supabase } from '@/lib/supabase'

export const WEEKLY_GOAL_HOURS = 5

export interface StudyDay {
  day: string // YYYY-MM-DD
  seconds: number
}

export function isoDay(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

/** Study time per day for one user; empty if the study_log table doesn't exist yet. */
export async function loadStudyLog(userId: string, sinceDays = 90): Promise<StudyDay[]> {
  const since = new Date()
  since.setDate(since.getDate() - sinceDays)
  const { data, error } = await supabase.from('study_log').select('day, seconds').eq('user_id', userId).gte('day', isoDay(since))
  if (error) return []
  return (data ?? []) as StudyDay[]
}

/** Current and best run of consecutive active days. A streak is still alive if today has no activity yet. */
export function streakFromDays(days: Set<string>): { current: number; best: number } {
  const sorted = [...days].sort()
  let best = 0
  let run = 0
  let prev: Date | null = null
  for (const d of sorted) {
    const cur = new Date(`${d}T00:00:00`)
    run = prev && (cur.getTime() - prev.getTime()) / 86400000 === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = cur
  }
  const cursor = new Date()
  if (!days.has(isoDay(cursor))) cursor.setDate(cursor.getDate() - 1)
  let current = 0
  while (days.has(isoDay(cursor))) {
    current++
    cursor.setDate(cursor.getDate() - 1)
  }
  return { current, best }
}

/** Seconds studied Monday–today of the current week. */
export function weekSeconds(rows: StudyDay[]): number {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  const from = isoDay(monday)
  return rows.filter((r) => r.day >= from).reduce((sum, r) => sum + r.seconds, 0)
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function hoursLabel(seconds: number): string {
  const h = seconds / 3600
  return h >= 10 ? `${Math.round(h)}` : h.toFixed(1).replace(/\.0$/, '')
}
