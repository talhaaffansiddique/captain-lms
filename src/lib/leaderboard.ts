// One scoring rule for the organisation leaderboard, shared by /admin, /hr, /manager and /app.
// The database function leaderboard_scores (supabase/v5.sql) returns the raw counts; the points
// are worked out here so every route shows exactly the same numbers.
import { supabase } from '@/lib/supabase'

export type Period = 7 | 30 | 'all'

export const POINTS = { badge: 50, course: 30, lesson: 2 }
export const LESSON_CAP = 30 // recent-activity points stop counting after this many lessons

export interface Score {
  id: string
  name: string
  department: string
  badges: number
  courses: number
  lessons: number
  badgePts: number
  coursePts: number
  activityPts: number
  points: number
}

export interface RankedScore extends Score {
  rank: number
}

interface Raw {
  user_id: string
  full_name: string
  department: string
  badges: number
  courses: number
  lessons: number
}

export function toScore(r: Raw): Score {
  const badgePts = r.badges * POINTS.badge
  const coursePts = r.courses * POINTS.course
  const activityPts = Math.min(r.lessons, LESSON_CAP) * POINTS.lesson
  return { id: r.user_id, name: r.full_name, department: r.department, badges: r.badges, courses: r.courses, lessons: r.lessons, badgePts, coursePts, activityPts, points: badgePts + coursePts + activityPts }
}

/** Active learners with at least one point in the window, ranked. `missing` = v5.sql not run yet. */
export async function loadLeaderboard(period: Period): Promise<{ rows: RankedScore[]; missing: boolean }> {
  const { data, error } = await supabase.rpc('leaderboard_scores', { p_days: period === 'all' ? null : period })
  if (error) return { rows: [], missing: true }
  const scored = ((data ?? []) as Raw[])
    .map(toScore)
    .filter((s) => s.points > 0)
    .sort((a, b) => b.points - a.points || b.courses - a.courses || a.name.localeCompare(b.name))
  return { rows: scored.map((s, i) => ({ ...s, rank: i + 1 })), missing: false }
}
