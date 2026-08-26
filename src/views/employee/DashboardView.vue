<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { Module, VideoCompletion } from '@/lib/database.types'

const auth = useAuthStore()
const modules = ref<Module[]>([])
const completions = ref<VideoCompletion[]>([])
const loading = ref(true)

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
  loading.value = false
})

function isDone(moduleId: number) {
  return completions.value.some((c) => c.module_id === moduleId && c.completed)
}
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
              {{ m.department }} · {{ isDone(m.id) ? 'Completed' : 'Not started' }}
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
