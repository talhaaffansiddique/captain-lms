<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { Module } from '@/lib/database.types'

// TODO: port the full Question Bank editor (manual rows + bulk paste + 10-question minimum
// before publishing) from captain-lms-demo.html. This form creates a module as a draft —
// add questions via Supabase directly (quiz_questions table) until that UI exists here.

const DEPARTMENTS = ['General', 'Sales', 'Engineering', 'Finance', 'Operations', 'Marketing', 'Customer Support']

const auth = useAuthStore()
const modules = ref<Module[]>([])
const title = ref('')
const department = ref('General')
const youtubeId = ref('')
const saving = ref(false)

async function loadModules() {
  const { data } = await supabase.from('modules').select('*').order('id', { ascending: false })
  modules.value = data ?? []
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
    <h2 style="font-size: 23px; margin-bottom: 16px">Modules</h2>

    <div class="card" style="padding: 18px; margin-bottom: 20px; max-width: 460px">
      <div style="margin-bottom: 12px">
        <label>Module title</label>
        <input v-model="title" type="text" placeholder="e.g. Handling Refund Requests" />
      </div>
      <div style="margin-bottom: 12px">
        <label>YouTube video ID (optional)</label>
        <input v-model="youtubeId" type="text" placeholder="e.g. dQw4w9WgXcQ" />
      </div>
      <div style="margin-bottom: 14px">
        <label>Audience</label>
        <select v-model="department">
          <option v-for="d in DEPARTMENTS" :key="d" :value="d">{{ d }}</option>
        </select>
      </div>
      <button class="btn btn-primary" :disabled="saving" @click="createDraft">
        {{ saving ? 'Saving…' : 'Save as draft' }}
      </button>
      <p style="font-size: 12px; color: var(--ink-soft); margin-top: 8px">
        Add at least 10 quiz questions (via Supabase for now) before publishing — see the TODO in this file.
      </p>
    </div>

    <div class="card">
      <table style="width: 100%; border-collapse: collapse; font-size: 13.5px">
        <thead>
          <tr>
            <th style="text-align: left; padding: 10px 16px; border-bottom: 1px solid var(--border)">Title</th>
            <th style="text-align: left; padding: 10px 16px; border-bottom: 1px solid var(--border)">Audience</th>
            <th style="text-align: left; padding: 10px 16px; border-bottom: 1px solid var(--border)">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in modules" :key="m.id">
            <td style="padding: 12px 16px; border-bottom: 1px solid var(--border)">{{ m.title }}</td>
            <td style="padding: 12px 16px; border-bottom: 1px solid var(--border)">{{ m.department }}</td>
            <td style="padding: 12px 16px; border-bottom: 1px solid var(--border)">
              {{ m.is_draft ? 'Draft' : 'Published' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
