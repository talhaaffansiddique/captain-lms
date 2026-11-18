// v5: milestone rules, recognition badges, issued certificates and a learner's progress numbers.
import { supabase } from '@/lib/supabase'
import { loadMyModules } from '@/lib/assignments'
import { loadCourses, courseProgress } from '@/lib/courses'
import { DEFAULT_SETTINGS, type CertificateSettings, type CertificateFields } from '@/lib/certificatePdf'

export interface MilestoneRule {
  id: number
  name: string
  icon: string
  match_mode: 'all' | 'any'
  min_hours: number | null
  min_courses: number | null
  min_certs: number | null
  is_active: boolean
}

export interface RecognitionBadge {
  id: number
  name: string
  icon: string
  description: string
}

export interface BadgeAward {
  id: number
  badge_id: number
  user_id: string
  citation: string
  awarded_at: string
  revoked_at: string | null
}

export interface IssuedCertificate {
  id: number
  number: string
  user_id: string
  course_id: number | null
  credit_hours: number
  citation: string
  issued_at: string
  revoked_at: string | null
}

export interface Metrics {
  hours: number
  courses: number
  certs: number
}

export interface CriterionStatus {
  key: 'hours' | 'courses' | 'certs'
  label: string
  have: number
  need: number
  ok: boolean
}

export interface RuleStatus {
  criteria: CriterionStatus[]
  unlocked: boolean
}

/** Evaluates one rule for one learner. A rule with no criteria set never unlocks. */
export function evaluateRule(rule: MilestoneRule, m: Metrics): RuleStatus {
  const criteria: CriterionStatus[] = []
  if (rule.min_hours != null) criteria.push({ key: 'hours', label: 'Completed course duration (hours)', have: m.hours, need: Number(rule.min_hours), ok: m.hours >= Number(rule.min_hours) })
  if (rule.min_courses != null) criteria.push({ key: 'courses', label: 'Courses completed', have: m.courses, need: rule.min_courses, ok: m.courses >= rule.min_courses })
  if (rule.min_certs != null) criteria.push({ key: 'certs', label: 'Certificates earned', have: m.certs, need: rule.min_certs, ok: m.certs >= rule.min_certs })
  const unlocked = criteria.length > 0 && (rule.match_mode === 'all' ? criteria.every((c) => c.ok) : criteria.some((c) => c.ok))
  return { criteria, unlocked }
}

export async function loadRules(): Promise<{ rows: MilestoneRule[]; missing: boolean }> {
  const { data, error } = await supabase.from('milestone_rules').select('*').order('id')
  if (error) return { rows: [], missing: true }
  return { rows: (data ?? []) as MilestoneRule[], missing: false }
}

export async function loadRecognitionBadges(): Promise<RecognitionBadge[]> {
  const { data } = await supabase.from('recognition_badges').select('*').order('id')
  return (data ?? []) as RecognitionBadge[]
}

export async function loadAwards(userId?: string): Promise<BadgeAward[]> {
  let q = supabase.from('badge_awards').select('*').is('revoked_at', null).order('awarded_at', { ascending: false })
  if (userId) q = q.eq('user_id', userId)
  const { data } = await q
  return (data ?? []) as BadgeAward[]
}

export async function loadCertificates(userId?: string): Promise<{ rows: IssuedCertificate[]; missing: boolean }> {
  let q = supabase.from('issued_certificates').select('*').order('issued_at', { ascending: false })
  if (userId) q = q.eq('user_id', userId)
  const { data, error } = await q
  if (error) return { rows: [], missing: true }
  return { rows: (data ?? []) as IssuedCertificate[], missing: false }
}

export async function loadCertificateSettings(): Promise<CertificateSettings> {
  const { data } = await supabase.from('certificate_settings').select('*').eq('id', 1).maybeSingle()
  if (!data) return DEFAULT_SETTINGS
  return {
    mode: data.mode,
    org_name: data.org_name,
    signer_name: data.signer_name,
    signer_title: data.signer_title,
    template_url: data.template_url,
    positions: { ...DEFAULT_SETTINGS.positions, ...(data.positions ?? {}) },
  }
}

export function certificateFields(c: IssuedCertificate, name: string, courseTitle: string | null): CertificateFields {
  return {
    name,
    course: courseTitle ?? 'Professional development',
    date: new Date(c.issued_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    hours: `${Number(c.credit_hours)} credit hours`,
    cit: c.citation,
    id: c.number,
  }
}

/** Hours, completed courses and certificates for the signed-in learner. */
export async function loadMyMetrics(userId: string, dept: string): Promise<Metrics> {
  const [mine, { data: comps }, certs] = await Promise.all([
    loadMyModules(userId, dept),
    supabase.from('video_completions').select('*').eq('user_id', userId),
    loadCertificates(userId),
  ])
  const courses = (await loadCourses(mine.modules)).filter((c) => c.lessons.length > 0)
  let minutes = 0
  let done = 0
  for (const c of courses) {
    const p = courseProgress(c, (comps ?? []) as never[])
    if (p.status === 'completed') {
      done++
      minutes += p.minutes
    }
  }
  return { hours: Math.round((minutes / 60) * 10) / 10, courses: done, certs: certs.rows.filter((c) => !c.revoked_at).length }
}
