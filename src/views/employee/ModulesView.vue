<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { materialType, formatDuration } from '@/lib/materials'
import type { Module, VideoCompletion } from '@/lib/database.types'

const auth = useAuthStore()
const router = useRouter()
const modules = ref<Module[]>([])
const completions = ref<VideoCompletion[]>([])
const audienceFilter = ref('All')

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

const filteredModules = computed(() =>
  audienceFilter.value === 'All' ? modules.value : modules.value.filter((m) => m.department === audienceFilter.value),
)
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <h2>My Modules</h2>
        <p>General training everyone gets, plus your department's track.</p>
      </div>
    </div>

    <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap">
      <button
        class="btn btn-sm"
        :class="audienceFilter === 'All' ? 'btn-primary' : 'btn-ghost'"
        @click="audienceFilter = 'All'"
      >
        All
      </button>
      <button
        class="btn btn-sm"
        :class="audienceFilter === 'General' ? 'btn-primary' : 'btn-ghost'"
        @click="audienceFilter = 'General'"
      >
        General
      </button>
      <button
        v-if="auth.profile?.department"
        class="btn btn-sm"
        :class="audienceFilter === auth.profile.department ? 'btn-primary' : 'btn-ghost'"
        @click="audienceFilter = auth.profile!.department"
      >
        {{ auth.profile.department }}
      </button>
    </div>

    <div class="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Audience</th>
            <th>Type</th>
            <th>Duration</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in filteredModules" :key="m.id" style="cursor: pointer" @click="router.push(`/app/modules/${m.id}`)">
            <td style="font-weight: 600">
              <RouterLink :to="`/app/modules/${m.id}`" style="text-decoration: none">{{ m.title }}</RouterLink>
            </td>
            <td><span class="pill pill-outline">{{ m.department }}</span></td>
            <td style="color: var(--ink-soft)">{{ materialType(m) }}</td>
            <td style="color: var(--ink-soft)">{{ formatDuration(m) }}</td>
            <td>
              <span :class="['pill', isDone(m.id) ? 'pill-teal' : 'pill-outline']">
                {{ isDone(m.id) ? '✓ Completed' : 'Not started' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!filteredModules.length" style="padding: 24px; text-align: center; color: var(--ink-soft)">
        No modules match this filter.
      </p>
    </div>
  </div>
</template>
