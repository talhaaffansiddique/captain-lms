import { supabase } from './supabase'
import type { Module, VideoCompletion, QuizAttempt, QuizAttemptGrant } from './database.types'

export const QUESTIONS_PER_QUIZ = 5
export const QUESTION_TIME_SECONDS = 180
export const PASS_THRESHOLD = 0.8 // 4 of 5 correct
export const BASE_MAX_ATTEMPTS = 3
export const RETRY_COOLDOWN_SECONDS = 15
export const MIN_QUESTIONS_TO_PUBLISH = 10

// Department-specific modules still group every 5 into one shared milestone quiz, same as
// before. General modules (company-wide, department === 'General') instead get one quiz each,
// right after that single video/document — since everyone takes them, there's no reason to make
// people wait for 4 more to unlock a check.
export const NUMBERED_MILESTONES = ['1', '2', '3', '4', '5'] as const
export type Milestone = string

const GENERAL_PREFIX = 'general-'

export function isGeneralMilestone(milestone: Milestone): boolean {
  return milestone.startsWith(GENERAL_PREFIX)
}

export function generalMilestoneId(moduleId: number): Milestone {
  return `${GENERAL_PREFIX}${moduleId}`
}

function generalMilestoneModuleId(milestone: Milestone): number {
  return Number(milestone.slice(GENERAL_PREFIX.length))
}

export function orderedTrack(modules: Module[]): Module[] {
  return [...modules].sort((a, b) => a.id - b.id)
}

export function generalModules(track: Module[]): Module[] {
  return track.filter((m) => m.department === 'General')
}

export function departmentModules(track: Module[]): Module[] {
  return track.filter((m) => m.department !== 'General')
}

/** The modules whose completion feeds a given milestone quiz. */
export function moduleChunkForMilestone(track: Module[], milestone: Milestone): Module[] {
  if (milestone === 'final') return track
  if (isGeneralMilestone(milestone)) {
    const mod = track.find((m) => m.id === generalMilestoneModuleId(milestone))
    return mod ? [mod] : []
  }
  const idx = NUMBERED_MILESTONES.indexOf(milestone as (typeof NUMBERED_MILESTONES)[number])
  if (idx === -1) return []
  return departmentModules(track).slice(idx * QUESTIONS_PER_QUIZ, (idx + 1) * QUESTIONS_PER_QUIZ)
}

/** Every milestone that could ever apply to this track, reached or not — one per General
 * module, up to 5 numbered department milestones, plus the Final Assessment. */
export function allMilestonesForTrack(track: Module[]): Milestone[] {
  return [...generalModules(track).map((m) => generalMilestoneId(m.id)), ...NUMBERED_MILESTONES, 'final']
}

/** Milestones whose feeding chunk is fully watched — eligible to attempt, regardless of pass/fail state. */
export function reachedMilestones(track: Module[], completions: VideoCompletion[]): Milestone[] {
  const doneIds = new Set(completions.filter((c) => c.completed).map((c) => c.module_id))
  const reached: Milestone[] = []

  for (const gm of generalModules(track)) {
    if (doneIds.has(gm.id)) reached.push(generalMilestoneId(gm.id))
  }

  for (const m of NUMBERED_MILESTONES) {
    const chunk = moduleChunkForMilestone(track, m)
    if (chunk.length === QUESTIONS_PER_QUIZ && chunk.every((mod) => doneIds.has(mod.id))) {
      reached.push(m)
    }
  }

  if (track.length > 0 && track.every((mod) => doneIds.has(mod.id))) {
    reached.push('final')
  }
  return reached
}

export function maxAttemptsFor(milestone: Milestone, grants: QuizAttemptGrant[]): number {
  const extra = grants.filter((g) => g.milestone === milestone).reduce((sum, g) => sum + g.extra_attempts, 0)
  return BASE_MAX_ATTEMPTS + extra
}

export function attemptsFor(milestone: Milestone, attempts: QuizAttempt[]): QuizAttempt[] {
  return attempts.filter((a) => a.milestone === milestone).sort((a, b) => a.attempt_number - b.attempt_number)
}

export function hasPassed(milestone: Milestone, attempts: QuizAttempt[]): boolean {
  return attempts.some((a) => a.milestone === milestone && a.passed)
}

/** Reached, not yet passed, and with attempts remaining — worth surfacing as "take this quiz". */
export function pendingMilestones(
  track: Module[],
  completions: VideoCompletion[],
  attempts: QuizAttempt[],
  grants: QuizAttemptGrant[],
): Milestone[] {
  return reachedMilestones(track, completions).filter(
    (m) => !hasPassed(m, attempts) && attemptsFor(m, attempts).length < maxAttemptsFor(m, grants),
  )
}

/** `track` is only needed to resolve a General module's title into its quiz label — omit it and
 * a generic fallback is used instead. */
export function milestoneLabel(milestone: Milestone, track?: Module[]): string {
  if (milestone === 'final') return 'Final Assessment'
  if (isGeneralMilestone(milestone)) {
    const mod = track?.find((m) => m.id === generalMilestoneModuleId(milestone))
    return mod ? `${mod.title} Quiz` : 'Module Quiz'
  }
  return `Milestone ${milestone} Quiz`
}

export interface TrackData {
  track: Module[]
  completions: VideoCompletion[]
  attempts: QuizAttempt[]
  grants: QuizAttemptGrant[]
}

export async function loadTrackData(userId: string, department: string): Promise<TrackData> {
  const [{ data: modData }, { data: compData }, { data: attemptData }, { data: grantData }] = await Promise.all([
    supabase
      .from('modules')
      .select('*')
      .or(`department.eq.General,department.eq.${department}`)
      .eq('is_draft', false)
      .eq('is_archived', false)
      .order('id'),
    supabase.from('video_completions').select('*').eq('user_id', userId),
    supabase.from('quiz_attempts').select('*').eq('user_id', userId),
    supabase.from('quiz_attempt_grants').select('*').eq('user_id', userId),
  ])
  return {
    track: orderedTrack(modData ?? []),
    completions: compData ?? [],
    attempts: attemptData ?? [],
    grants: grantData ?? [],
  }
}

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i]
    copy[i] = copy[j] as T
    copy[j] = tmp as T
  }
  return copy
}

export interface BulkQuestion {
  question: string
  options: string[]
  correct_index: number
}

/**
 * Parses a simple pasted-question format:
 *   Q: question text
 *   A) option
 *   B) option
 *   C) option
 *   D) option
 *   Correct: B
 * Blocks are separated by a blank line. Malformed blocks are silently skipped.
 */
export function parseBulkQuestions(text: string): BulkQuestion[] {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
  const parsed: BulkQuestion[] = []
  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const qLine = lines.find((l) => /^Q[:.]/i.test(l))
    const optionLines = ['A', 'B', 'C', 'D'].map((letter) =>
      lines.find((l) => new RegExp(`^${letter}[):.]`, 'i').test(l)),
    )
    const correctLine = lines.find((l) => /^Correct[:.]/i.test(l))
    if (!qLine || optionLines.some((l) => !l) || !correctLine) continue
    const question = qLine.replace(/^Q[:.]\s*/i, '')
    const options = optionLines.map((l) => (l as string).replace(/^[A-D][):.]\s*/i, ''))
    const letter = correctLine
      .replace(/^Correct[:.]\s*/i, '')
      .trim()
      .toUpperCase()[0]
    const correct_index = ['A', 'B', 'C', 'D'].indexOf(letter ?? '')
    if (correct_index === -1) continue
    parsed.push({ question, options, correct_index })
  }
  return parsed
}
