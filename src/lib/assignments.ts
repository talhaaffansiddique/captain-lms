import { supabase } from '@/lib/supabase'

export interface Assignment {
  id: number
  user_id: string
  course_id: number
  due_date: string | null
  created_at: string
}

/** Assignments, optionally narrowed to one learner or one course. `missing` = v5.sql not run yet. */
export async function loadAssignments(filter: { userId?: string; courseId?: number } = {}): Promise<{ rows: Assignment[]; missing: boolean }> {
  let q = supabase.from('course_assignments').select('*')
  if (filter.userId) q = q.eq('user_id', filter.userId)
  if (filter.courseId) q = q.eq('course_id', filter.courseId)
  const { data, error } = await q
  if (error) return { rows: [], missing: true }
  return { rows: (data ?? []) as Assignment[], missing: false }
}

/** Assigns one course to many learners (any department). Already-assigned learners are left alone. */
export async function assignCourseToUsers(courseId: number, userIds: string[], due: string | null, byId: string | undefined, courseTitle: string) {
  if (!userIds.length) return { error: null as string | null, added: 0 }
  const rows = userIds.map((user_id) => ({ user_id, course_id: courseId, due_date: due || null, assigned_by: byId ?? null }))
  const { error } = await supabase.from('course_assignments').upsert(rows, { onConflict: 'user_id,course_id', ignoreDuplicates: true })
  if (error) return { error: error.message, added: 0 }
  const text = `A course was assigned to you: ${courseTitle}${due ? ` (due ${new Date(due + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })})` : ''}.`
  await supabase.from('notifications').insert(userIds.map((user_id) => ({ user_id, text, action: { type: 'goto', view: 'modules' } })))
  return { error: null, added: userIds.length }
}

export async function setAssignmentDue(id: number, due: string | null) {
  const { error } = await supabase.from('course_assignments').update({ due_date: due || null }).eq('id', id)
  return error?.message ?? null
}

export async function removeAssignment(id: number) {
  const { error } = await supabase.from('course_assignments').delete().eq('id', id)
  return error?.message ?? null
}

/** Days from today to the due date (negative = overdue); null when there is no deadline. */
export function daysUntil(due: string | null): number | null {
  if (!due) return null
  const today = new Date(new Date().toDateString()).getTime()
  return Math.round((new Date(`${due}T00:00:00`).getTime() - today) / 86400000)
}

export function dueLabel(due: string | null): string {
  const d = daysUntil(due)
  if (d === null) return 'No deadline'
  const when = new Date(`${due}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  if (d < 0) return `Overdue · was due ${when}`
  if (d === 0) return 'Due today'
  return `Due ${when}`
}
