<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { loadTrackData, reachedMilestones, hasPassed } from '@/lib/quiz'
import { notifyQuizUnlocked } from '@/lib/notifications'
import type { Module } from '@/lib/database.types'

// NOTE: this is a functional starting point, not the full spec. The demo (captain-lms-demo.html)
// tracks real watch-time via the YouTube IFrame API and only marks a module complete once watched
// progress hits 95%. Wiring that up here is the next step — for now this embeds the video and lets
// the employee mark it complete manually, which is enough to prove the Supabase read/write path.
// Once quiz-gated completion replaces this (per the quiz engine), this manual button goes away.

const CAPTION_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ur', label: 'Urdu' },
]

const route = useRoute()
const auth = useAuthStore()
const module_ = ref<Module | null>(null)
const completed = ref(false)
const saving = ref(false)
const ccOn = ref(false)
const ccLang = ref('en')

// Uses YouTube's own auto-generated captions via the embed's cc_load_policy param — no separate
// caption files or transcription service needed. Toggling reloads the iframe (YouTube doesn't
// expose a captions-only postMessage toggle without loading their full IFrame Player API).
const embedUrl = computed(() => {
  if (!module_.value?.youtube_id) return null
  const params = new URLSearchParams()
  if (ccOn.value) {
    params.set('cc_load_policy', '1')
    params.set('cc_lang_pref', ccLang.value)
  }
  const query = params.toString()
  return `https://www.youtube.com/embed/${module_.value.youtube_id}${query ? `?${query}` : ''}`
})

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
})

async function markComplete() {
  if (!module_.value || !auth.profile) return
  saving.value = true
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
  completed.value = true
  saving.value = false

  const { track, completions, attempts } = await loadTrackData(auth.profile.id, auth.profile.department)
  for (const m of reachedMilestones(track, completions)) {
    if (!hasPassed(m, attempts)) await notifyQuizUnlocked(auth.profile.id, m)
  }
}
</script>

<template>
  <div v-if="module_">
    <div class="topline">
      <div>
        <h2 style="font-size: 20px">{{ module_.title }}</h2>
        <p>{{ module_.department }}</p>
      </div>
    </div>

    <div class="card" style="padding: 16px; max-width: 640px">
      <div v-if="embedUrl" class="video-box">
        <iframe :src="embedUrl" style="width: 100%; height: 100%; border: 0" allowfullscreen />
      </div>
      <div v-else class="video-box video-placeholder">▶ No video attached yet</div>

      <div v-if="embedUrl" style="margin-top: 10px; display: flex; align-items: center; gap: 8px">
        <button class="btn btn-ghost btn-sm" :class="{ 'btn-primary': ccOn }" title="Toggle captions" @click="ccOn = !ccOn">
          CC {{ ccOn ? 'on' : 'off' }}
        </button>
        <select v-if="ccOn" v-model="ccLang" style="width: auto">
          <option v-for="l in CAPTION_LANGUAGES" :key="l.code" :value="l.code">{{ l.label }}</option>
        </select>
      </div>

      <div style="margin-top: 16px; display: flex; align-items: center; gap: 12px">
        <button v-if="!completed" class="btn btn-primary" :disabled="saving" @click="markComplete">
          {{ saving ? 'Saving…' : 'Mark as watched' }}
        </button>
        <span v-else class="pill pill-teal">✓ Completed</span>
        <RouterLink class="btn btn-ghost btn-sm" to="/app/modules">Back to modules</RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.video-box {
  aspect-ratio: 16 / 9;
  border-radius: 10px;
  overflow: hidden;
  background: linear-gradient(150deg, #1a1d2b, #0d0f18);
}
.video-placeholder {
  display: grid;
  place-items: center;
  color: #cfd3e6;
  font-size: 13px;
}
</style>
