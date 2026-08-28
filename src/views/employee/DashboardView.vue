<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { loadTrackData, pendingMilestones, milestoneLabel, type Milestone } from '@/lib/quiz'
import { materialType, formatDuration } from '@/lib/materials'
import type { Module, VideoCompletion, Announcement } from '@/lib/database.types'

const auth = useAuthStore()
const modules = ref<Module[]>([])
const completions = ref<VideoCompletion[]>([])
const loading = ref(true)
const nextQuiz = ref<Milestone | null>(null)
const announcement = ref<Announcement | null>(null)
const dismissedAnnouncementIds = ref<number[]>(JSON.parse(localStorage.getItem('dismissedAnnouncements') ?? '[]'))

onMounted(async () => {
  const dept = auth.profile?.department
  const userId = auth.profile?.id
  if (!dept || !userId) return

  const [{ track, completions: comp, attempts, grants }, { data: latestAnnouncement }] = await Promise.all([
    loadTrackData(userId, dept),
    supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  modules.value = track
  completions.value = comp
  const pending = pendingMilestones(track, comp, attempts, grants)
  nextQuiz.value = pending[0] ?? null
  announcement.value = latestAnnouncement
  loading.value = false
})

function isDone(moduleId: number) {
  return completions.value.some((c) => c.module_id === moduleId && c.completed)
}

const showAnnouncement = computed(() => announcement.value && !dismissedAnnouncementIds.value.includes(announcement.value.id))

function dismissAnnouncement() {
  if (!announcement.value) return
  dismissedAnnouncementIds.value = [...dismissedAnnouncementIds.value, announcement.value.id]
  localStorage.setItem('dismissedAnnouncements', JSON.stringify(dismissedAnnouncementIds.value))
}

const isOverdue = computed(() => {
  const due = auth.profile?.due_date
  if (!due) return false
  const allDone = modules.value.length > 0 && modules.value.every((m) => isDone(m.id))
  return !allDone && due < new Date().toISOString().slice(0, 10)
})
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <h2>Welcome back, {{ auth.profile?.full_name?.split(' ')[0] }}</h2>
        <p>{{ auth.profile?.department }} track</p>
      </div>
      <RouterLink class="btn btn-primary btn-sm" to="/app/modules">Continue training →</RouterLink>
    </div>

    <div v-if="loading" style="color: var(--ink-soft)">Loading…</div>
    <template v-else>
      <div v-if="showAnnouncement" class="card" style="padding: 14px 20px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-left: 3px solid var(--brass)">
        <div style="font-size: 13.5px">📣 {{ announcement?.text }}</div>
        <button class="btn btn-ghost btn-sm" @click="dismissAnnouncement">Dismiss</button>
      </div>

      <div v-if="isOverdue" class="card" style="padding: 14px 20px; margin-bottom: 16px; background: var(--danger-soft); color: var(--danger)">
        <strong>Your training deadline ({{ auth.profile?.due_date }}) has passed.</strong> Please complete your remaining modules as soon as possible.
      </div>

      <div v-if="nextQuiz" class="card" style="padding: 16px 20px; margin-bottom: 20px; background: var(--brass-soft); display: flex; align-items: center; justify-content: space-between; gap: 12px">
        <div>
          <strong>{{ milestoneLabel(nextQuiz, modules) }} is ready.</strong>
          <div style="color: var(--ink-soft); font-size: 13px">You've completed the modules that unlock it.</div>
        </div>
        <RouterLink class="btn btn-primary btn-sm" :to="`/app/quiz/${nextQuiz}`">Take quiz now →</RouterLink>
      </div>
      <div class="stat-row">
        <div class="card stat">
          <div class="lbl">Modules completed</div>
          <div class="val">
            {{ completions.filter((c) => c.completed).length }} <span class="of">/ {{ modules.length }}</span>
          </div>
        </div>
        <div class="card stat">
          <div class="lbl">Department</div>
          <div class="val" style="font-size: 20px">{{ auth.profile?.department }}</div>
        </div>
        <div class="card stat">
          <div class="lbl">Role</div>
          <div class="val" style="font-size: 20px; text-transform: capitalize">{{ auth.profile?.role }}</div>
        </div>
      </div>

      <div class="card">
        <div class="panel-title"><h3>Your modules</h3></div>
        <RouterLink v-for="m in modules" :key="m.id" :to="`/app/modules/${m.id}`" :class="['row-item', { done: isDone(m.id) }]">
          <div class="row-num">{{ isDone(m.id) ? '✓' : m.id }}</div>
          <div class="row-info">
            <div class="t">{{ m.title }}</div>
            <div class="m">
              {{ m.department }} · {{ materialType(m) }} · {{ formatDuration(m) }} · {{ isDone(m.id) ? 'Completed' : 'Not started' }}
            </div>
          </div>
        </RouterLink>
        <p v-if="!modules.length" style="padding: 24px; text-align: center; color: var(--ink-soft)">
          No modules published yet — check back soon.
        </p>
      </div>
    </template>
  </div>
</template>
