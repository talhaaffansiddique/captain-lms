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
      <p class="hint">Add at least 10 quiz questions (via Supabase for now) before publishing — see the TODO in this file.</p>
    </div>

    <div class="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Audience</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in modules" :key="m.id">
            <td style="font-weight: 600">{{ m.title }}</td>
            <td><span class="pill pill-outline">{{ m.department }}</span></td>
            <td>
              <span :class="['pill', m.is_draft ? 'pill-danger' : 'pill-teal']">
                {{ m.is_draft ? 'Draft' : 'Published' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
