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
</script>

<template>
  <div>
    <h2 style="font-size: 23px; margin-bottom: 4px">Welcome back, {{ auth.profile?.full_name }}</h2>
    <p style="color: var(--ink-soft); font-size: 13.5px; margin-bottom: 22px">
      {{ auth.profile?.department }} track
    </p>

    <div v-if="loading" style="color: var(--ink-soft)">Loading…</div>
    <div v-else class="card" style="padding: 18px">
      <div style="font: 600 13px 'Public Sans'; margin-bottom: 10px">
        {{ completions.filter((c) => c.completed).length }} / {{ modules.length }} modules completed
      </div>
      <RouterLink
        v-for="m in modules"
        :key="m.id"
        :to="`/app/modules/${m.id}`"
        style="
          display: block;
          padding: 10px 0;
          border-top: 1px solid var(--border);
          text-decoration: none;
          color: var(--ink);
          font: 600 13.5px 'Public Sans';
        "
      >
        {{ m.title }}
        <span style="color: var(--ink-soft); font-weight: 500"> — {{ m.department }}</span>
      </RouterLink>
    </div>
  </div>
</template>
