<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { MIN_QUESTIONS_TO_PUBLISH } from '@/lib/quiz'
import type { Module } from '@/lib/database.types'

const DEPARTMENTS = ['General', 'Sales', 'Engineering', 'Finance', 'Operations', 'Marketing', 'Customer Support']

const auth = useAuthStore()
const modules = ref<Module[]>([])
const questionCounts = ref<Record<number, number>>({})
const title = ref('')
const department = ref('General')
const youtubeId = ref('')
const saving = ref(false)

async function loadModules() {
  const [{ data: modData }, { data: qData }] = await Promise.all([
    supabase.from('modules').select('*').order('id', { ascending: false }),
    supabase.from('quiz_questions').select('module_id'),
  ])
  modules.value = modData ?? []
  const counts: Record<number, number> = {}
  for (const q of qData ?? []) counts[q.module_id] = (counts[q.module_id] ?? 0) + 1
  questionCounts.value = counts
}

onMounted(loadModules)

async function createDraft() {
  if (!title.value.trim()) return
  saving.value = true
  await supabase.from('modules').insert({
    title: title.value.trim(),
    department: department.value,
    youtube_id: youtubeId.value.trim() || null,
    is_draft: true,
    created_by: auth.profile?.id,
  })
  title.value = ''
  youtubeId.value = ''
  saving.value = false
  await loadModules()
}
</script>

<template>
  <div>
    <div class="topline">
      <div><h2>Modules</h2></div>
    </div>

    <div class="card" style="padding: 18px; margin-bottom: 20px; max-width: 460px">
      <div class="field">
        <label>Module title</label>
        <input v-model="title" type="text" placeholder="e.g. Handling Refund Requests" />
      </div>
      <div class="field">
        <label>YouTube video ID (optional)</label>
        <input v-model="youtubeId" type="text" placeholder="e.g. dQw4w9WgXcQ" />
      </div>
      <div class="field">
        <label>Audience</label>
        <select v-model="department">
          <option v-for="d in DEPARTMENTS" :key="d" :value="d">{{ d }}</option>
        </select>
      </div>
      <button class="btn btn-primary" :disabled="saving" @click="createDraft">
        {{ saving ? 'Saving…' : 'Save as draft' }}
      </button>
      <p class="hint">Open a module below to add its question bank — {{ MIN_QUESTIONS_TO_PUBLISH }} questions are required before it can be published.</p>
    </div>

    <div class="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Audience</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in modules" :key="m.id">
            <td style="font-weight: 600">{{ m.title }}</td>
            <td><span class="pill pill-outline">{{ m.department }}</span></td>
            <td>
              <span :class="['pill', m.is_draft ? 'pill-danger' : 'pill-teal']">
                {{ m.is_draft ? `Draft · ${questionCounts[m.id] ?? 0} of ${MIN_QUESTIONS_TO_PUBLISH}` : 'Published' }}
              </span>
            </td>
            <td><RouterLink class="btn btn-ghost btn-sm" :to="`/admin/modules/${m.id}`">Manage questions</RouterLink></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
