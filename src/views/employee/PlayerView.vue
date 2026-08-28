<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { loadTrackData, reachedMilestones, hasPassed, milestoneLabel } from '@/lib/quiz'
import { notifyQuizUnlocked } from '@/lib/notifications'
import { loadYouTubeIframeApi, type YTPlayer } from '@/lib/youtube'
import { documentEmbedUrl } from '@/lib/materials'
import type { Module } from '@/lib/database.types'

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

const SEEK_TOLERANCE_SECONDS = 2
const COMPLETE_THRESHOLD = 0.95
const SAVE_INTERVAL_MS = 5000
const POLL_INTERVAL_MS = 500

const route = useRoute()
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

  if (module_.value?.youtube_id) {
    await loadYouTubeIframeApi()
    initPlayer()
  }
})

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
      },
      onStateChange: (e) => {
        isPlaying.value = e.data === 1 // YT.PlayerState.PLAYING
      },
    },
  })
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
  saveTimer = setInterval(() => void saveProgress(), SAVE_INTERVAL_MS)
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

async function saveProgress() {
  if (!module_.value || !auth.profile || completed.value || maxWatched.value <= 0) return
  await supabase.from('video_completions').upsert(
    {
      user_id: auth.profile.id,
      module_id: module_.value.id,
      watched_seconds: Math.floor(maxWatched.value),
      completed: false,
    },
    { onConflict: 'user_id,module_id' },
  )
}

async function markComplete() {
  if (!module_.value || !auth.profile || completed.value) return
  completed.value = true // set first so the poll loop and any re-entry stop immediately
  stopTimers()
  await supabase.from('video_completions').upsert(
    {
      user_id: auth.profile.id,
      module_id: module_.value.id,
      watched_seconds: Math.floor(duration.value || module_.value.duration_seconds),
      completed: true,
      completed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,module_id' },
  )

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
  await supabase.from('video_completions').upsert(
    {
      user_id: auth.profile.id,
      module_id: module_.value.id,
      watched_seconds: module_.value.duration_seconds,
      completed: true,
      completed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,module_id' },
  )
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

watch([ccOn, ccLang], applyCaptions)
</script>

<template>
  <div v-if="module_">
    <div class="topline">
      <div>
        <h2 style="font-size: 20px">{{ module_.title }}</h2>
        <p>{{ module_.department }}</p>
      </div>
    </div>

    <div class="card" style="padding: 16px" :style="{ maxWidth: hasDocument ? '100%' : '640px' }">
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

      <div v-if="hasVideo" style="margin-top: 10px; display: flex; align-items: center; gap: 8px">
        <button class="btn btn-primary btn-sm" @click="togglePlayback">{{ isPlaying ? '⏸ Pause' : '▶ Play' }}</button>
        <button class="btn btn-ghost btn-sm" @click="restartVideo">⟲ Start over</button>
        <button class="btn btn-ghost btn-sm" :class="{ 'btn-primary': ccOn }" title="Toggle captions" @click="ccOn = !ccOn">
          CC {{ ccOn ? 'on' : 'off' }}
        </button>
        <select v-if="ccOn" v-model="ccLang" style="width: auto">
          <option v-for="l in CAPTION_LANGUAGES" :key="l.code" :value="l.code">{{ l.label }}</option>
        </select>
      </div>

      <div v-if="hasVideo && !completed" style="margin-top: 12px">
        <div class="progress"><div class="progress-fill" :style="{ width: watchedPct + '%' }" /></div>
        <p class="hint" style="margin-top: 4px">{{ watchedPct }}% watched — skipping ahead is disabled; completes automatically at 95%.</p>
      </div>

      <div style="margin-top: 16px; display: flex; align-items: center; gap: 12px">
        <button v-if="!hasVideo && !completed" class="btn btn-primary" @click="markCompleteManually">
          {{ hasDocument ? 'Mark as reviewed' : 'Mark as watched' }}
        </button>
        <span v-if="completed" class="pill pill-teal">✓ Completed</span>
        <RouterLink class="btn btn-ghost btn-sm" to="/app/modules">Back to modules</RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.video-box {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 10px;
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
  background: var(--brass);
  color: #17203a;
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
.progress {
  height: 6px;
  border-radius: 999px;
  background: var(--surface-sunken);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: var(--teal);
  transition: width 0.3s ease;
}
</style>
