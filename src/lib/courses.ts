import { supabase } from '@/lib/supabase'
import type { Course, Module, VideoCompletion } from '@/lib/database.types'

export const COURSE_COLORS = ['#2f5be8', '#0f7f6c', '#6d3fc0', '#b4530f', '#a3306b', '#1d8348', '#1f4e8c', '#0f1b33']

/** A course as the screens use it: the course row (or a virtual one) plus its ordered lessons. */
export interface CourseVM {
  id: string // the course id, or `dept-<audience>` for the automatic fallback groups
  dbId: number | null // null for virtual courses (before the revamp SQL has been run)
  title: string
  category: string
  color: string
  description: string | null
  isPublished: boolean
  lessons: Module[]
}

export function courseCode(title: string): string {
  const words = title.replace(/&/g, ' ').split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : words[0]!.slice(0, 2)).toUpperCase()
}

export function sortedLessons(lessons: Module[]): Module[] {
  return [...lessons].sort((a, b) => (a.lesson_order ?? 0) - (b.lesson_order ?? 0) || a.id - b.id)
}

/**
 * Loads courses and their lessons. If the courses table doesn't exist yet (revamp SQL not run),
 * falls back to one virtual course per audience so the catalog still works.
 */
export async function loadCourses(modules: Module[], options: { includeUnpublished?: boolean } = {}): Promise<CourseVM[]> {
  const { data, error } = await supabase.from('courses').select('*').order('id')
  if (error || !data) return virtualCourses(modules)

  const courses = (data as Course[]).filter((c) => options.includeUnpublished || c.is_published)
  const byCourse = new Map<number, Module[]>()
  const unassigned: Module[] = []
  for (const m of modules) {
    if (m.course_id) byCourse.set(m.course_id, [...(byCourse.get(m.course_id) ?? []), m])
    else unassigned.push(m)
  }
  const result: CourseVM[] = courses.map((c) => ({
    id: String(c.id),
    dbId: c.id,
    title: c.title,
    category: c.category,
    color: c.color,
    description: c.description,
    isPublished: c.is_published,
    lessons: sortedLessons(byCourse.get(c.id) ?? []),
  }))
  // Lessons not yet placed in a course still need a home so nothing is invisible.
  if (unassigned.length) {
    for (const v of virtualCourses(unassigned)) result.push({ ...v, title: `${v.title} (not in a course yet)` })
  }
  return result
}

function virtualCourses(modules: Module[]): CourseVM[] {
  const groups = new Map<string, Module[]>()
  for (const m of modules) groups.set(m.department, [...(groups.get(m.department) ?? []), m])
  return [...groups.entries()].map(([dept, lessons], i) => ({
    id: `dept-${dept}`,
    dbId: null,
    title: dept === 'General' ? 'Company-wide training' : `${dept} training`,
    category: dept,
    color: COURSE_COLORS[i % COURSE_COLORS.length]!,
    description: null,
    isPublished: true,
    lessons: sortedLessons(lessons),
  }))
}

export interface CourseProgress {
  done: number
  total: number
  pct: number
  status: 'not-started' | 'in-progress' | 'completed'
  nextLesson: Module | null
  minutes: number
  videos: number
  docs: number
}

export function courseProgress(course: CourseVM, completions: VideoCompletion[]): CourseProgress {
  const doneIds = new Set(completions.filter((c) => c.completed).map((c) => c.module_id))
  const startedIds = new Set(completions.filter((c) => c.watched_seconds > 0 || c.completed).map((c) => c.module_id))
  const total = course.lessons.length
  const done = course.lessons.filter((l) => doneIds.has(l.id)).length
  const started = course.lessons.some((l) => startedIds.has(l.id))
  return {
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
    status: total > 0 && done === total ? 'completed' : done > 0 || started ? 'in-progress' : 'not-started',
    nextLesson: course.lessons.find((l) => !doneIds.has(l.id)) ?? null,
    minutes: Math.round(course.lessons.reduce((sum, l) => sum + (l.youtube_id ? l.duration_seconds : 0), 0) / 60),
    videos: course.lessons.filter((l) => !!l.youtube_id).length,
    docs: course.lessons.filter((l) => !l.youtube_id && !!l.document_url).length,
  }
}

export function formatCourseTime(minutes: number): string {
  if (minutes < 1) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}
