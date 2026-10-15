<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { loadTrackData, reachedMilestones, hasPassed, milestoneLabel } from '@/lib/quiz'
import { notifyQuizUnlocked } from '@/lib/notifications'
import { loadYouTubeIframeApi, type YTPlayer } from '@/lib/youtube'
import { documentEmbedUrl } from '@/lib/materials'
import { loadCourses, courseProgress, type CourseVM } from '@/lib/courses'
import PracticeQuiz from '@/components/PracticeQuiz.vue'
import type { Module, VideoCompletion } from '@/lib/database.types'

// Real watch-time tracking via the YouTube IFrame Player API: the furthest point actually
// watched (maxWatched) is tracked continuously, progress is checked against it every half
// second, and any attempt to scrub ahead of that point gets snapped straight back — so
// fast-forwarding to the end no longer marks a module complete. Completion fires automatically
// once watched progress crosses 95% of the video's duration.

const CAPTION_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ur', label: 'Urdu' },
]

// Tight enough to catch a skip within well under a second, loose enough that normal playback
// between polls (and the postMessage round-trip to the YouTube iframe) never false-triggers it.
const SEEK_TOLERANCE_SECONDS = 0.75
const COMPLETE_THRESHOLD = 0.95
const SAVE_INTERVAL_MS = 5000
const POLL_INTERVAL_MS = 200

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const module_ = ref<Module | null>(null)
const completed = ref(false)
const ccOn = ref(false)
const ccLang = ref('en')

const playerEl = ref<HTMLDivElement | null>(null)
const player = ref<YTPlayer | null>(null)
const maxWatched = ref(0)
const duration = ref(0)
const isPlaying = ref(false)
let pollTimer: ReturnType<typeof setInterval> | undefined
let saveTimer: ReturnType<typeof setInterval> | undefined

const course = ref<CourseVM | null>(null)
const courseCompletions = ref<VideoCompletion[]>([])
const quizOpen = ref(false)

const lessonIndex = computed(() => (course.value && module_.value ? course.value.lessons.findIndex((l) => l.id === module_.value!.id) : -1))
const prevLesson = computed(() => (course.value && lessonIndex.value > 0 ? course.value.lessons[lessonIndex.value - 1] : null))
const nextLesson = computed(() => (course.value && lessonIndex.value >= 0 ? course.value.lessons[lessonIndex.value + 1] ?? null : null))
const progress = computed(() => (course.value ? courseProgress(course.value, courseCompletions.value) : null))
const doneIds = computed(() => new Set(courseCompletions.value.filter((c) => c.completed).map((c) => c.module_id)))

function lessonKind(l: Module) {
  return l.youtube_id ? `Video · ${Math.max(1, Math.round(l.duration_seconds / 60))} min` : l.document_url ? 'Document' : 'Lesson'
}

const hasVideo = computed(() => !!module_.value?.youtube_id)
const hasDocument = computed(() => !hasVideo.value && !!module_.value?.document_url && !!module_.value.document_type)
const watchedPct = computed(() => (duration.value > 0 ? Math.min(100, Math.round((maxWatched.value / duration.value) * 100)) : 0))

onMounted(async () => {
  const id = Number(route.params.id)
  const [{ data: mod }, { data: comp }] = await Promise.all([
    supabase.from('modules').select('*').eq('id', id).single(),
    supabase
      .from('video_completions')
      .select('*')
      .eq('module_id', id)
      .eq('user_id', auth.profile?.id ?? '')
      .maybeSingle(),
  ])
  module_.value = mod
  completed.value = comp?.completed ?? false
  maxWatched.value = comp?.watched_seconds ?? 0
  void loadCourseContext()

  if (module_.value?.youtube_id) {
    await loadYouTubeIframeApi()
    initPlayer()
  }
})

async function loadCourseContext() {
  const dept = auth.profile?.department
  const userId = auth.profile?.id
  if (!dept || !userId || !module_.value) return
  const [{ data: mods }, { data: comps }] = await Promise.all([
    supabase.from('modules').select('*').or(`department.eq.General,department.eq.${dept}`).order('id'),
    supabase.from('video_completions').select('*').eq('user_id', userId),
  ])
  courseCompletions.value = (comps ?? []) as VideoCompletion[]
  const all = await loadCourses((mods ?? []) as Module[])
  course.value = all.find((c) => c.lessons.some((l) => l.id === module_.value!.id)) ?? null
}

function goLesson(l: Module | null | undefined) {
  if (l) router.push(`/app/modules/${l.id}`)
}

onBeforeUnmount(() => {
  stopTimers()
  void saveProgress()
  player.value?.destroy()
})

function initPlayer() {
  if (!playerEl.value || !module_.value?.youtube_id || !window.YT) return
  player.value = new window.YT.Player(playerEl.value, {
    videoId: module_.value.youtube_id,
    // Privacy-enhanced (youtube-nocookie.com) host — doesn't tie playback to whatever Google
    // account the viewer happens to be signed into, so no personalized related-video suggestions.
    host: 'https://www.youtube-nocookie.com',
    playerVars: {
      enablejsapi: 1,
      rel: 0, // no related videos on pause/end
      modestbranding: 1,
      iv_load_policy: 3, // no video annotations/cards
      disablekb: 1, // no keyboard seeking/speed shortcuts
      fs: 0, // no fullscreen button
      controls: 0, // no native control bar at all — no scrubber, no speed menu, no skip-10s
      playsinline: 1,
    },
    events: {
      onReady: (e) => {
        duration.value = e.target.getDuration()
        if (maxWatched.value > 0) e.target.seekTo(maxWatched.value, true)
        applyCaptions()
        startTimers()
        void cacheRealDuration()
      },
      onStateChange: (e) => {
        isPlaying.value = e.data === 1 // YT.PlayerState.PLAYING
      },
    },
  })
}

// YouTube knows the real video length; the DB only has a 300s placeholder until someone actually
// plays it once. Cache the real value back so it shows correctly anywhere modules are listed.
async function cacheRealDuration() {
  if (!module_.value || duration.value <= 0) return
  const real = Math.round(duration.value)
  if (Math.abs(real - module_.value.duration_seconds) < 3) return
  // A narrow RPC rather than a direct table update — employees have no general write access to
  // modules, and this function only ever touches duration_seconds.
  await supabase.rpc('cache_module_duration', { p_module_id: module_.value.id, p_seconds: real })
  module_.value.duration_seconds = real
}

function togglePlayback() {
  if (!player.value) return
  if (isPlaying.value) player.value.pauseVideo()
  else player.value.playVideo()
}

function restartVideo() {
  if (!player.value) return
  // Rewinding is always allowed — only skipping ahead is blocked — so this just jumps back to 0
  // and resumes play; it doesn't touch maxWatched or the completion state already earned.
  player.value.seekTo(0, true)
  player.value.playVideo()
}

function startTimers() {
  stopTimers()
  pollTimer = setInterval(checkProgress, POLL_INTERVAL_MS)
  saveTimer = setInterval(() => {
    void saveProgress()
    void logStudyTick()
  }, SAVE_INTERVAL_MS)
}

function stopTimers() {
  if (pollTimer) clearInterval(pollTimer)
  if (saveTimer) clearInterval(saveTimer)
  pollTimer = undefined
  saveTimer = undefined
}

function checkProgress() {
  if (!player.value || completed.value) return
  const current = player.value.getCurrentTime()
  if (current > maxWatched.value + SEEK_TOLERANCE_SECONDS) {
    // Tried to skip ahead — snap back to the furthest point actually watched.
    player.value.seekTo(maxWatched.value, true)
    return
  }
  if (current > maxWatched.value) maxWatched.value = current

  if (duration.value > 0 && maxWatched.value >= duration.value * COMPLETE_THRESHOLD) {
    void markComplete()
  }
}

// The revamp adds last_watched_at; until that SQL has been run, fall back to the original columns.
async function upsertCompletion(row: Record<string, unknown>) {
  const withStamp = { ...row, last_watched_at: new Date().toISOString() }
  const { error } = await supabase.from('video_completions').upsert(withStamp, { onConflict: 'user_id,module_id' })
  if (error) await supabase.from('video_completions').upsert(row, { onConflict: 'user_id,module_id' })
}

async function saveProgress() {
  if (!module_.value || !auth.profile || completed.value || maxWatched.value <= 0) return
  await upsertCompletion({
    user_id: auth.profile.id,
    module_id: module_.value.id,
    watched_seconds: Math.floor(maxWatched.value),
    completed: false,
  })
}

async function logStudyTick() {
  if (!isPlaying.value) return
  // Feeds the streak and weekly-goal widgets; silently ignored if the revamp SQL isn't in place yet.
  await supabase.rpc('log_study_seconds', { p_seconds: Math.round(SAVE_INTERVAL_MS / 1000) })
}

async function markComplete() {
  if (!module_.value || !auth.profile || completed.value) return
  completed.value = true // set first so the poll loop and any re-entry stop immediately
  stopTimers()
  await upsertCompletion({
    user_id: auth.profile.id,
    module_id: module_.value.id,
    watched_seconds: Math.floor(duration.value || module_.value.duration_seconds),
    completed: true,
    completed_at: new Date().toISOString(),
  })
  void refreshCompletions()

  const { track, completions, attempts } = await loadTrackData(auth.profile.id, auth.profile.department)
  for (const m of reachedMilestones(track, completions)) {
    if (!hasPassed(m, attempts)) await notifyQuizUnlocked(auth.profile.id, m, milestoneLabel(m, track))
  }
}

// Fallback for modules with no video attached yet — nothing to auto-track, so let the employee
// mark it complete manually.
async function markCompleteManually() {
  if (!module_.value || !auth.profile) return
  completed.value = true
  await upsertCompletion({
    user_id: auth.profile.id,
    module_id: module_.value.id,
    watched_seconds: module_.value.duration_seconds,
    completed: true,
    completed_at: new Date().toISOString(),
  })
  void refreshCompletions()
  const { track, completions, attempts } = await loadTrackData(auth.profile.id, auth.profile.department)
  for (const m of reachedMilestones(track, completions)) {
    if (!hasPassed(m, attempts)) await notifyQuizUnlocked(auth.profile.id, m, milestoneLabel(m, track))
  }
}

function applyCaptions() {
  if (!player.value) return
  if (ccOn.value) {
    player.value.loadModule('captions')
    player.value.setOption('captions', 'track', { languageCode: ccLang.value })
  } else {
    player.value.unloadModule('captions')
  }
}

async function refreshCompletions() {
  if (!auth.profile) return
  const { data } = await supabase.from('video_completions').select('*').eq('user_id', auth.profile.id)
  courseCompletions.value = (data ?? []) as VideoCompletion[]
}

watch([ccOn, ccLang], applyCaptions)
</script>

<template>
  <div v-if="module_">
    <RouterLink class="back-link" to="/app/catalog">← Course catalog</RouterLink>
    <div class="topline" style="margin-top: 6px">
      <div>
        <h2>{{ course?.title ?? module_.title }}</h2>
        <p v-if="course">Lesson {{ lessonIndex + 1 }} of {{ course.lessons.length }} · {{ module_.title }}</p>
        <p v-else>{{ module_.department }}</p>
      </div>
      <div v-if="progress" class="card" style="padding: 10px 16px; min-width: 230px">
        <div class="row"><div class="bar"><i :style="{ width: progress.pct + '%' }" /></div><b style="white-space: nowrap">{{ progress.pct }}% complete</b></div>
      </div>
    </div>

    <div class="player-grid" :class="{ single: !course }">
      <div>
        <div class="card" style="padding: 16px">
          <div v-if="hasVideo" class="video-box">
            <div ref="playerEl" style="width: 100%; height: 100%" />
            <!--
              YouTube shows its own title/channel/share/"Watch on YouTube" overlay whenever the
              embed is paused, and there's no player parameter that turns it off. This cover sits on
              top of the iframe at all times so that overlay is never visible or clickable: fully
              transparent (and still intercepting every click itself, so hover/click never reaches
              YouTube's own chrome at all) while playing, and an opaque "tap to play" surface — our
              own UI, not YouTube's — whenever paused.
            -->
            <div class="video-cover" :class="{ paused: !isPlaying }" @click="togglePlayback">
              <span v-if="!isPlaying" class="video-cover-play">▶</span>
            </div>
          </div>
          <!--
            Documents don't fit a fixed 16:9 box the way video does — a PPTX/PDF page is often closer
            to 4:3 or portrait, and Office Online Viewer / the browser's own PDF viewer both want real
            screen space to be readable. This scales with the viewport instead, so it's not a tiny
            letterboxed rectangle on a large monitor.
          -->
          <div v-else-if="hasDocument" class="document-box">
            <iframe
              :src="documentEmbedUrl(module_.document_url as string, module_.document_type as string)"
              style="width: 100%; height: 100%; border: 0"
            />
          </div>
          <div v-else class="video-box video-placeholder">▶ No learning material attached yet</div>

          <div v-if="hasVideo" class="row wrap" style="margin-top: 12px; gap: 8px">
            <button class="btn btn-primary btn-sm" @click="togglePlayback">{{ isPlaying ? '⏸ Pause' : '▶ Play' }}</button>
            <button class="btn btn-ghost btn-sm" @click="restartVideo">⟲ Start over</button>
            <button class="btn btn-ghost btn-sm" :class="{ 'btn-primary': ccOn }" title="Toggle captions" @click="ccOn = !ccOn">
              CC {{ ccOn ? 'on' : 'off' }}
            </button>
            <select v-if="ccOn" v-model="ccLang" style="width: auto">
              <option v-for="l in CAPTION_LANGUAGES" :key="l.code" :value="l.code">{{ l.label }}</option>
            </select>
            <span class="lock-note">🔒 Play/pause only</span>
          </div>

          <div v-if="hasVideo && !completed" style="margin-top: 12px">
            <div class="row"><div class="bar"><i :style="{ width: watchedPct + '%' }" /></div><b style="font-size: 12.5px">{{ watchedPct }}%</b></div>
            <p class="hint" style="margin-top: 4px">Skipping ahead is disabled — this lesson completes automatically at 95%.</p>
          </div>

          <div class="row wrap" style="margin-top: 16px">
            <button v-if="!hasVideo && !completed" class="btn btn-primary" @click="markCompleteManually">
              {{ hasDocument ? 'Mark as reviewed' : 'Mark as watched' }}
            </button>
            <span v-if="completed" class="pill pill-teal">✓ Completed</span>
            <span class="sp" />
            <button v-if="prevLesson" class="btn btn-ghost" @click="goLesson(prevLesson)">Previous</button>
            <button v-if="nextLesson" class="btn btn-primary" @click="goLesson(nextLesson)">Next lesson</button>
            <RouterLink v-if="!course" class="btn btn-ghost btn-sm" to="/app/modules">Back to modules</RouterLink>
          </div>
        </div>
      </div>

      <aside v-if="course">
        <div class="card" style="padding: 18px">
          <div class="row" style="margin-bottom: 8px"><h3 style="font-size: 19px">Lessons</h3><span class="sub sp">{{ progress?.done }} of {{ progress?.total }} done</span></div>
          <button
            v-for="(l, i) in course.lessons"
            :key="l.id"
            class="lesson"
            :class="{ on: l.id === module_.id }"
            @click="goLesson(l)"
          >
            <span class="num" :class="{ done: doneIds.has(l.id) }">{{ doneIds.has(l.id) ? '✓' : i + 1 }}</span>
            <span style="text-align: left">
              <b>{{ l.title }}</b>
              <span class="sub" style="display: block">Lesson {{ i + 1 }} · {{ lessonKind(l) }}</span>
            </span>
          </button>
        </div>
        <div class="quiz-card">
          <div class="kicker" style="color: var(--brass)">Check your understanding</div>
          <h3>Practice quiz from this course's question banks</h3>
          <button class="btn quiz-btn" @click="quizOpen = true">Start practice quiz</button>
        </div>
      </aside>
    </div>

    <PracticeQuiz v-if="quizOpen && course" :course-title="course.title" :lesson-ids="course.lessons.map((l) => l.id)" @close="quizOpen = false" />
  </div>
</template>

<style scoped>
.video-box {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(150deg, #1a1d2b, #0d0f18);
}
.video-cover {
  position: absolute;
  inset: 0;
  cursor: pointer;
  display: grid;
  place-items: center;
  background: transparent;
  transition: background 0.15s ease;
}
.video-cover.paused {
  background: rgba(13, 15, 24, 0.88);
}
.video-cover-play {
  width: 56px;
  height: 56px;
  border-radius: 999px;
  background: var(--blue);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 20px;
}
.video-placeholder {
  display: grid;
  place-items: center;
  color: #cfd3e6;
  font-size: 13px;
}
.document-box {
  width: 100%;
  height: min(85vh, 1100px);
  min-height: 420px;
  border-radius: 10px;
  overflow: hidden;
  background: linear-gradient(150deg, #1a1d2b, #0d0f18);
}
@media (max-width: 760px) {
  .document-box {
    height: 70vh;
  }
}
.player-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 18px;
  align-items: start;
}
.player-grid.single {
  grid-template-columns: minmax(0, 760px);
}
@media (max-width: 1000px) {
  .player-grid {
    grid-template-columns: 1fr;
  }
}
.back-link {
  color: var(--blue);
  font-weight: 700;
  text-decoration: none;
}
.lock-note {
  margin-left: auto;
  font-size: 12px;
  color: var(--ink-soft);
}
.lesson {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 10px;
  border: 0;
  border-radius: 12px;
  background: none;
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}
.lesson:hover {
  background: var(--surface-sunken);
}
.lesson.on {
  background: var(--blue-soft);
}
.num {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 13px;
  background: var(--surface-sunken);
  flex: none;
}
.num.done {
  background: var(--teal);
  color: #fff;
}
.lesson.on .num {
  background: var(--blue);
  color: #fff;
}
.quiz-card {
  background: #0f1b33;
  color: #fff;
  border-radius: 20px;
  padding: 22px;
  margin-top: 16px;
}
.quiz-card h3 {
  font-size: 19px;
  margin: 6px 0 16px;
}
.quiz-btn {
  width: 100%;
  justify-content: center;
  background: var(--brass);
  color: #1a1000;
}
</style>
