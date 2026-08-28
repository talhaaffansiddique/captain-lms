<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { materialType, formatDuration } from '@/lib/materials'
import type { Module, VideoCompletion } from '@/lib/database.types'

const auth = useAuthStore()
const modules = ref<Module[]>([])
const completions = ref<VideoCompletion[]>([])

onMounted(async () => {
  const dept = auth.profile?.department
  const userId = auth.profile?.id
  if (!dept || !userId) return
  const [{ data: modData }, { data: compData }] = await Promise.all([
    supabase.from('modules').select('*').or(`department.eq.General,department.eq.${dept}`).order('id'),
    supabase.from('video_completions').select('*').eq('user_id', userId),
  ])
  modules.value = modData ?? []
  completions.value = compData ?? []
})

function isDone(moduleId: number) {
  return completions.value.some((c) => c.module_id === moduleId && c.completed)
}
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <h2>My Modules</h2>
        <p>General training everyone gets, plus your department's track.</p>
      </div>
    </div>

    <div class="card">
      <RouterLink
        v-for="m in modules"
        :key="m.id"
        :to="`/app/modules/${m.id}`"
        :class="['row-item', { done: isDone(m.id) }]"
      >
        <div class="row-num">{{ isDone(m.id) ? '✓' : m.id }}</div>
        <div class="row-info">
          <div class="t">{{ m.title }} <span class="pill pill-outline">{{ m.department }}</span></div>
          <div class="m">{{ materialType(m) }} · {{ formatDuration(m) }} · {{ isDone(m.id) ? 'Completed' : 'Not started' }}</div>
        </div>
      </RouterLink>
      <p v-if="!modules.length" style="padding: 24px; text-align: center; color: var(--ink-soft)">
        No modules published yet — check back soon.
      </p>
    </div>
  </div>
</template>
