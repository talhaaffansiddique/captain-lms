<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { loadTrackData, pendingMilestones, milestoneLabel, type Milestone } from '@/lib/quiz'
import { loadCourses, courseProgress, courseCode, type CourseVM } from '@/lib/courses'
import { loadStudyLog, streakFromDays, isoDay, relativeTime } from '@/lib/learning'
import DashWidget from '@/components/DashWidget.vue'
import PracticeQuiz from '@/components/PracticeQuiz.vue'
import type { Module, VideoCompletion, QuizAttempt, Announcement } from '@/lib/database.types'

const auth = useAuthStore()
const track = ref<Module[]>([])
const completions = ref<VideoCompletion[]>([])
const attempts = ref<QuizAttempt[]>([])
const courses = ref<CourseVM[]>([])
const studyDays = ref<Set<string>>(new Set())
const loading = ref(true)
const nextQuiz = ref<Milestone | null>(null)
const announcement = ref<Announcement | null>(null)
const dismissedAnnouncementIds = ref<number[]>(JSON.parse(localStorage.getItem('dismissedAnnouncements') ?? '[]'))
const tab = ref<'In progress' | 'Completed'>('In progress')
const quizCourse = ref<CourseVM | null>(null)

onMounted(async () => {
  const dept = auth.profile?.department
  const userId = auth.profile?.id
  if (!dept || !userId) return

  const [{ track: t, completions: comp, attempts: att, grants }, { data: latestAnnouncement }, study] = await Promise.all([
    loadTrackData(userId, dept),
    supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    loadStudyLog(userId),
  ])
  track.value = t
  completions.value = comp
  attempts.value = att
  courses.value = (await loadCourses(t)).filter((c) => c.lessons.length > 0)
  nextQuiz.value = pendingMilestones(t, comp, att, grants)[0] ?? null
  announcement.value = latestAnnouncement

  // Streak counts any day with study time, a finished lesson or a quiz attempt.
  const days = new Set<string>(study.filter((s) => s.seconds > 0).map((s) => s.day))
  for (const c of comp) {
    if (c.completed_at) days.add(isoDay(new Date(c.completed_at)))
    if (c.last_watched_at) days.add(isoDay(new Date(c.last_watched_at)))
  }
  for (const a of att) days.add(isoDay(new Date(a.created_at)))
  studyDays.value = days
  loading.value = false
})

const showAnnouncement = computed(() => announcement.value && !dismissedAnnouncementIds.value.includes(announcement.value.id))
function dismissAnnouncement() {
  if (!announcement.value) return
  dismissedAnnouncementIds.value = [...dismissedAnnouncementIds.value, announcement.value.id]
  localStorage.setItem('dismissedAnnouncements', JSON.stringify(dismissedAnnouncementIds.value))
}

const doneIds = computed(() => new Set(completions.value.filter((c) => c.completed).map((c) => c.module_id)))
const isOverdue = computed(() => {
  const due = auth.profile?.due_date
  if (!due) return false
  const allDone = track.value.length > 0 && track.value.every((m) => doneIds.value.has(m.id))
  return !allDone && due < isoDay(new Date())
})

const withProgress = computed(() => courses.value.map((c) => ({ course: c, p: courseProgress(c, completions.value) })))
const inProgress = computed(() => withProgress.value.filter((x) => x.p.status === 'in-progress'))
const completedCourses = computed(() => withProgress.value.filter((x) => x.p.status === 'completed'))
const listed = computed(() => (tab.value === 'In progress' ? [...inProgress.value, ...withProgress.value.filter((x) => x.p.status === 'not-started')] : completedCourses.value))

// Hero: the lesson most recently started and not finished; otherwise the next lesson of the first unfinished course.
const hero = computed(() => {
  const lessonById = new Map<number, { lesson: Module; course: CourseVM }>()
  for (const c of courses.value) for (const l of c.lessons) lessonById.set(l.id, { lesson: l, course: c })
  const started = completions.value
    .filter((c) => !c.completed && c.watched_seconds > 0 && lessonById.has(c.module_id))
    .sort((a, b) => (b.last_watched_at ?? '').localeCompare(a.last_watched_at ?? ''))
  let pick = started[0] ? lessonById.get(started[0].module_id)! : null
  if (!pick) {
    const next = withProgress.value.find((x) => x.p.status !== 'completed' && x.p.nextLesson)
    if (next) pick = { lesson: next.p.nextLesson!, course: next.course }
  }
  if (!pick) return null
  const p = courseProgress(pick.course, completions.value)
  const index = pick.course.lessons.findIndex((l) => l.id === pick!.lesson.id)
  const watched = completions.value.find((c) => c.module_id === pick!.lesson.id)?.watched_seconds ?? 0
  const left = pick.lesson.youtube_id ? Math.max(1, Math.round((pick.lesson.duration_seconds - watched) / 60)) : null
  return { ...pick, p, index, left }
})

const avgScore = computed(() => {
  if (!attempts.value.length) return null
  const pct = (a: QuizAttempt) => (a.total ? (a.score / a.total) * 100 : 0)
  const mean = (list: QuizAttempt[]) => list.reduce((s, a) => s + pct(a), 0) / list.length
  const now = Date.now()
  const recent = attempts.value.filter((a) => now - new Date(a.created_at).getTime() < 30 * 86400000)
  const earlier = attempts.value.filter((a) => {
    const age = now - new Date(a.created_at).getTime()
    return age >= 30 * 86400000 && age < 60 * 86400000
  })
  const delta = recent.length && earlier.length ? Math.round(mean(recent) - mean(earlier)) : null
  return { value: Math.round(mean(attempts.value)), delta }
})

const streak = computed(() => streakFromDays(studyDays.value))

const dueItems = computed(() => {
  const items: { key: string; tile: string; sub: string; title: string; detail: string; hot: boolean; to?: string }[] = []
  const due = auth.profile?.due_date
  if (due) {
    const days = Math.round((new Date(`${due}T00:00:00`).getTime() - new Date(`${isoDay(new Date())}T00:00:00`).getTime()) / 86400000)
    if (days <= 7) {
      const d = new Date(`${due}T00:00:00`)
      items.push({
        key: 'deadline',
        tile: String(d.getDate()),
        sub: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
        title: 'Training deadline',
        detail: days < 0 ? `${-days} day${days === -1 ? '' : 's'} overdue` : days === 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`,
        hot: true,
      })
    }
  }
  if (nextQuiz.value) {
    items.push({ key: 'quiz', tile: '📝', sub: 'READY', title: milestoneLabel(nextQuiz.value, track.value), detail: 'Quiz ready to take', hot: true, to: `/app/quiz/${nextQuiz.value}` })
  }
  return items
})

const activity = computed(() => {
  const list: { color: string; text: string; when: string; at: string }[] = []
  const titleOf = new Map(track.value.map((m) => [m.id, m.title]))
  for (const c of completions.value) {
    if (c.completed && c.completed_at) list.push({ color: 'var(--blue)', text: `Completed ${titleOf.get(c.module_id) ?? 'a lesson'}`, when: relativeTime(c.completed_at), at: c.completed_at })
  }
  for (const a of attempts.value) {
    const pct = a.total ? Math.round((a.score / a.total) * 100) : 0
    list.push({
      color: a.passed ? 'var(--teal)' : 'var(--brass)',
      text: `${a.passed ? 'Passed' : 'Scored'} ${pct}% on ${milestoneLabel(a.milestone, track.value)}`,
      when: relativeTime(a.created_at),
      at: a.created_at,
    })
  }
  return list.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5)
})

const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
const greeting = (() => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
})()
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <p>{{ today }}</p>
        <h2>{{ greeting }}, {{ auth.profile?.full_name?.split(' ')[0] }}</h2>
      </div>
    </div>

    <div v-if="loading" style="color: var(--ink-soft)">Loading…</div>
    <template v-else>
      <div v-if="showAnnouncement" class="card banner" style="border-left: 3px solid var(--brass)">
        <div style="font-size: 13.5px">📣 {{ announcement?.text }}</div>
        <button class="btn btn-ghost btn-sm" @click="dismissAnnouncement">Dismiss</button>
      </div>
      <div v-if="isOverdue" class="card banner" style="background: var(--danger-soft); color: var(--danger)">
        <span><strong>Your training deadline ({{ auth.profile?.due_date }}) has passed.</strong> Please complete your remaining lessons as soon as possible.</span>
      </div>
      <div v-if="nextQuiz" class="card banner" style="background: var(--brass-soft)">
        <div>
          <strong>{{ milestoneLabel(nextQuiz, track) }} is ready.</strong>
          <div style="color: var(--ink-soft); font-size: 13px">You've completed the lessons that unlock it.</div>
        </div>
        <RouterLink class="btn btn-primary btn-sm" :to="`/app/quiz/${nextQuiz}`">Take quiz now →</RouterLink>
      </div>

      <DashWidget v-if="hero" id="emp.hero">
        <div class="card hero">
          <div class="cover" :style="{ background: hero.course.color }">
            <div class="orb" />
            <span class="chip">{{ hero.lesson.youtube_id ? `▶ Video${hero.left ? ` · ${hero.left} min left` : ''}` : '📄 Document' }}</span>
          </div>
          <div style="padding: 22px">
            <div class="kicker">Continue where you left off</div>
            <h2 style="font-size: 27px; margin: 6px 0">{{ hero.course.title }}</h2>
            <div class="sub" style="margin-bottom: 14px">Lesson {{ hero.index + 1 }} of {{ hero.course.lessons.length }} · {{ hero.lesson.title }}</div>
            <div class="row"><div class="bar"><i :style="{ width: hero.p.pct + '%' }" /></div><b>{{ hero.p.pct }}%</b></div>
            <div class="row wrap" style="margin-top: 16px">
              <RouterLink class="btn btn-primary" :to="`/app/modules/${hero.lesson.id}`">Resume lesson →</RouterLink>
              <button class="btn btn-ghost" @click="quizCourse = hero.course">Practice quiz</button>
            </div>
          </div>
        </div>
      </DashWidget>

      <DashWidget id="emp.stats">
        <div class="stats">
          <div class="card stat">
            <div class="lbl">In progress</div>
            <div class="val">{{ inProgress.length }}</div>
            <div class="sub">courses</div>
          </div>
          <div class="card stat">
            <div class="lbl">Completed</div>
            <div class="val">{{ completedCourses.length }}</div>
            <div class="sub">{{ doneIds.size }} lessons finished</div>
          </div>
          <div class="card stat">
            <div class="lbl">Avg. quiz score</div>
            <div class="val">{{ avgScore ? avgScore.value + '%' : '—' }}</div>
            <div v-if="avgScore?.delta != null" class="sub" :class="{ up: avgScore.delta >= 0 }">{{ avgScore.delta >= 0 ? '+' : '' }}{{ avgScore.delta }}% vs last month</div>
            <div v-else class="sub">{{ avgScore ? 'across all attempts' : 'No quizzes yet' }}</div>
          </div>
          <div class="card stat dark">
            <div class="lbl">Learning streak</div>
            <div class="val">{{ streak.current }} {{ streak.current === 1 ? 'day' : 'days' }}</div>
            <div class="sub">Best: {{ streak.best }} {{ streak.best === 1 ? 'day' : 'days' }}</div>
          </div>
        </div>
      </DashWidget>

      <div class="cols">
        <div>
          <DashWidget id="emp.courses">
            <div class="card" style="padding: 20px">
              <div class="row" style="margin-bottom: 8px">
                <h2 style="font-size: 20px">My courses</h2>
                <div class="seg sp">
                  <button v-for="t in ['In progress', 'Completed'] as const" :key="t" :class="{ on: tab === t }" @click="tab = t">{{ t }}</button>
                </div>
              </div>
              <RouterLink
                v-for="x in listed"
                :key="x.course.id"
                :to="`/app/modules/${(x.p.nextLesson ?? x.course.lessons[0])?.id}`"
                class="course-row"
              >
                <span class="tile" :style="{ background: x.course.color }">{{ courseCode(x.course.title) }}</span>
                <span class="grow">
                  <span class="row"><b>{{ x.course.title }}</b><b class="sp">{{ x.p.pct }}%</b></span>
                  <span class="row" style="margin-top: 4px"><span class="bar"><i :style="{ width: x.p.pct + '%', background: x.course.color }" /></span></span>
                  <span class="sub" style="display: block; margin-top: 3px">{{ x.course.category }} · Lesson {{ Math.min(x.p.done + 1, x.p.total) }} of {{ x.p.total }}</span>
                </span>
              </RouterLink>
              <p v-if="!listed.length" class="sub" style="padding: 16px 0; text-align: center">
                {{ tab === 'Completed' ? 'No completed courses yet.' : 'Nothing in progress — pick a course from the catalog.' }}
              </p>
            </div>
          </DashWidget>
        </div>

        <div>
          <DashWidget id="emp.due">
            <div class="card" style="padding: 20px; margin-bottom: 16px">
              <h2 style="font-size: 19px; margin-bottom: 12px">Due this week</h2>
              <component
                :is="d.to ? 'RouterLink' : 'div'"
                v-for="d in dueItems"
                :key="d.key"
                :to="d.to"
                class="due"
                :class="{ hot: d.hot }"
              >
                <span class="date"><small>{{ d.sub }}</small>{{ d.tile }}</span>
                <span><b>{{ d.title }}</b><span class="sub" style="display: block">{{ d.detail }}</span></span>
              </component>
              <p v-if="!dueItems.length" class="sub">Nothing due this week. 🎉</p>
            </div>
          </DashWidget>
          <DashWidget id="emp.activity">
            <div class="card" style="padding: 20px">
              <h2 style="font-size: 19px; margin-bottom: 6px">Recent activity</h2>
              <div v-for="(a, i) in activity" :key="i" class="act">
                <i :style="{ background: a.color }" />
                <div>{{ a.text }}<div class="sub">{{ a.when }}</div></div>
              </div>
              <p v-if="!activity.length" class="sub">Your activity will appear here.</p>
            </div>
          </DashWidget>
        </div>
      </div>
    </template>

    <PracticeQuiz v-if="quizCourse" :course-title="quizCourse.title" :lesson-ids="quizCourse.lessons.map((l) => l.id)" @close="quizCourse = null" />
  </div>
</template>

<style scoped>
.banner {
  padding: 14px 20px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.hero {
  display: grid;
  grid-template-columns: 300px 1fr;
  overflow: hidden;
  margin-bottom: 18px;
}
@media (max-width: 760px) {
  .hero {
    grid-template-columns: 1fr;
  }
}
.cover {
  position: relative;
  min-height: 190px;
  overflow: hidden;
}
.cover::before,
.cover::after {
  content: '';
  position: absolute;
  border: 2px solid rgba(255, 255, 255, 0.22);
  border-radius: 50%;
}
.cover::before {
  width: 260px;
  height: 260px;
  right: -90px;
  top: -40px;
}
.cover::after {
  width: 170px;
  height: 170px;
  right: -40px;
  top: 5px;
}
.orb {
  position: absolute;
  right: 36px;
  top: 60px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--brass);
}
.chip {
  position: absolute;
  left: 16px;
  bottom: 16px;
  background: #0f1b33;
  color: #fff;
  border-radius: 99px;
  padding: 6px 13px;
  font-size: 12px;
  font-weight: 700;
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 18px;
}
@media (max-width: 900px) {
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
.cols {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 16px;
  align-items: start;
}
@media (max-width: 980px) {
  .cols {
    grid-template-columns: 1fr;
  }
}
.course-row {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 12px 0;
  text-decoration: none;
  color: inherit;
  border-radius: 12px;
}
.course-row:hover {
  background: var(--surface-sunken);
  margin: 0 -10px;
  padding: 12px 10px;
}
.due {
  display: flex;
  gap: 14px;
  align-items: center;
  background: var(--surface-sunken);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 10px;
  text-decoration: none;
  color: inherit;
}
.due.hot {
  background: var(--brass-soft);
}
.date {
  text-align: center;
  line-height: 1.15;
  font-weight: 800;
  min-width: 38px;
}
.date small {
  display: block;
  font-size: 10.5px;
  color: var(--brass-strong);
  letter-spacing: 0.05em;
}
.act {
  display: flex;
  gap: 10px;
  padding: 9px 0;
}
.act i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  margin-top: 6px;
  flex: none;
}
</style>
