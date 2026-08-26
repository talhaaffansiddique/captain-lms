<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { Module } from '@/lib/database.types'

const auth = useAuthStore()
const modules = ref<Module[]>([])

onMounted(async () => {
  const dept = auth.profile?.department
  if (!dept) return
  const { data } = await supabase
    .from('modules')
    .select('*')
    .or(`department.eq.General,department.eq.${dept}`)
    .order('id')
  modules.value = data ?? []
})
</script>

<template>
  <div>
    <h2 style="font-size: 23px; margin-bottom: 4px">My Modules</h2>
    <p style="color: var(--ink-soft); font-size: 13.5px; margin-bottom: 22px">
      General training everyone gets, plus your department's track.
    </p>

    <div class="card">
      <RouterLink
        v-for="m in modules"
        :key="m.id"
        :to="`/app/modules/${m.id}`"
        style="
          display: flex;
          justify-content: space-between;
          padding: 13px 16px;
          border-top: 1px solid var(--border);
          text-decoration: none;
          color: var(--ink);
        "
      >
        <span style="font: 600 14px 'Public Sans'">{{ m.title }}</span>
        <span style="font: 500 12px 'IBM Plex Mono'; color: var(--ink-soft)">{{ m.department }}</span>
      </RouterLink>
      <p v-if="!modules.length" style="padding: 24px; text-align: center; color: var(--ink-soft)">
        No modules published yet — check back soon.
      </p>
    </div>
  </div>
</template>
