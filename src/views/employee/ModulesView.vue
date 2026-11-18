<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { materialType, formatDuration } from '@/lib/materials'
import { useSort } from '@/composables/useSort'
import { loadMyModules, dueLabel, daysUntil, type Assignment } from '@/lib/assignments'
import type { Module, VideoCompletion } from '@/lib/database.types'

const auth = useAuthStore()
const router = useRouter()
const modules = ref<Module[]>([])
const completions = ref<VideoCompletion[]>([])
const audienceFilter = ref('All')
const assignments = ref<Assignment[]>([])

onMounted(async () => {
  const dept = auth.profile?.department
  const userId = auth.profile?.id
  if (!dept || !userId) return
  const [mine, { data: compData }] = await Promise.all([loadMyModules(userId, dept), supabase.from('video_completions').select('*').eq('user_id', userId)])
  assignments.value = mine.assignments
  modules.value = mine.modules
  completions.value = compData ?? []
})

function isDone(moduleId: number) {
  return completions.value.some((c) => c.module_id === moduleId && c.completed)
}

function assignmentFor(m: Module): Assignment | undefined {
  return m.course_id ? assignments.value.find((a) => a.course_id === m.course_id) : undefined
}

const filteredModules = computed(() => {
  if (audienceFilter.value === 'Assigned') return modules.value.filter((m) => !!assignmentFor(m))
  return audienceFilter.value === 'All' ? modules.value : modules.value.filter((m) => m.department === audienceFilter.value)
})

const { sorted: sortedModules, toggle, indicator, ariaSort } = useSort(filteredModules, {
  title: (m) => m.title,
  audience: (m) => m.department,
  type: (m) => materialType(m),
  duration: (m) => (m.youtube_id ? m.duration_seconds : null),
  status: (m) => (isDone(m.id) ? 0 : 1),
})
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
      <button class="btn btn-sm" :class="audienceFilter === 'Assigned' ? 'btn-primary' : 'btn-ghost'" @click="audienceFilter = 'Assigned'">
        ★ Assigned to me
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
            <th class="sortable" :aria-sort="ariaSort('title')" @click="toggle('title')">
              Title <span class="sort-ind">{{ indicator('title') }}</span>
            </th>
            <th class="sortable" :aria-sort="ariaSort('audience')" @click="toggle('audience')">
              Audience <span class="sort-ind">{{ indicator('audience') }}</span>
            </th>
            <th class="sortable" :aria-sort="ariaSort('type')" @click="toggle('type')">
              Type <span class="sort-ind">{{ indicator('type') }}</span>
            </th>
            <th class="sortable" :aria-sort="ariaSort('duration')" @click="toggle('duration')">
              Duration <span class="sort-ind">{{ indicator('duration') }}</span>
            </th>
            <th class="sortable" :aria-sort="ariaSort('status')" @click="toggle('status')">
              Status <span class="sort-ind">{{ indicator('status') }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in sortedModules" :key="m.id" style="cursor: pointer" @click="router.push(`/app/modules/${m.id}`)">
            <td style="font-weight: 600">
              <RouterLink :to="`/app/modules/${m.id}`" style="text-decoration: none">{{ m.title }}</RouterLink>
              <template v-if="assignmentFor(m)">
                <span class="pill pill-teal" style="margin-left: 6px">Assigned</span>
                <span class="pill" :class="(daysUntil(assignmentFor(m)!.due_date) ?? 1) < 0 ? 'pill-danger' : 'pill-brass'" style="margin-left: 4px">{{ dueLabel(assignmentFor(m)!.due_date) }}</span>
              </template>
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
