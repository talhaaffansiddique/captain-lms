// Shared between weekly-digest.ts (the scheduled sender) and weekly-digest-preview.ts (the
// admin-facing "preview this email" button) so both compute the exact same numbers.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface DeptSummary {
  department: string
  completions: number
  quizPasses: number
  overdue: { name: string; dueDate: string }[]
}

export async function computeDeptSummaries(db: SupabaseClient): Promise<DeptSummary[]> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const today = new Date().toISOString().slice(0, 10)

  const [{ data: profiles }, { data: completions }, { data: attempts }] = await Promise.all([
    db.from('profiles').select('id, full_name, department, role, due_date'),
    db.from('video_completions').select('user_id, completed_at').eq('completed', true).gte('completed_at', weekAgo),
    db.from('quiz_attempts').select('user_id, passed, created_at').eq('passed', true).gte('created_at', weekAgo),
  ])

  const allProfiles = profiles ?? []
  const departments = [...new Set(allProfiles.map((p) => p.department))]

  return departments.map((department) => {
    const deptUserIds = new Set(allProfiles.filter((p) => p.department === department).map((p) => p.id))
    return {
      department,
      completions: (completions ?? []).filter((c) => deptUserIds.has(c.user_id)).length,
      quizPasses: (attempts ?? []).filter((a) => deptUserIds.has(a.user_id)).length,
      overdue: allProfiles
        .filter((p) => p.department === department && p.role === 'employee' && p.due_date && p.due_date < today)
        .map((p) => ({ name: p.full_name as string, dueDate: p.due_date as string })),
    }
  })
}

export function renderSummaryHtml(scoped: DeptSummary[]): string {
  return scoped
    .map(
      (s) => `
        <h3 style="margin:16px 0 4px">${s.department}</h3>
        <p style="margin:0 0 4px">✅ ${s.completions} module completion(s) this week</p>
        <p style="margin:0 0 4px">🎖️ ${s.quizPasses} quiz pass(es) this week</p>
        ${
          s.overdue.length
            ? `<p style="margin:0 0 4px;color:#a8412f">⚠️ Overdue: ${s.overdue.map((o) => `${o.name} (since ${o.dueDate})`).join(', ')}</p>`
            : '<p style="margin:0 0 4px;color:#1f6f63">No one overdue</p>'
        }`,
    )
    .join('')
}
