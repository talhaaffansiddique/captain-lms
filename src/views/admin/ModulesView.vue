<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { logActivity } from '@/lib/activity'
import { loadDepartments, addDepartment, deleteDepartment } from '@/lib/departments'
import { MIN_QUESTIONS_TO_PUBLISH } from '@/lib/quiz'
import type { Module, Department } from '@/lib/database.types'

const auth = useAuthStore()
const modules = ref<Module[]>([])
const questionCounts = ref<Record<number, number>>({})
const title = ref('')
const department = ref('')
const youtubeId = ref('')
const saving = ref(false)

const departments = ref<Department[]>([])
const newDepartment = ref('')
const savingDepartment = ref(false)
const departmentError = ref('')

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

async function refreshDepartments() {
  departments.value = await loadDepartments()
  if (!department.value) department.value = 'General'
}

onMounted(async () => {
  await Promise.all([loadModules(), refreshDepartments()])
})

const today = new Date().toISOString().slice(0, 10)
function isScheduledFuture(m: Module) {
  return !!m.scheduled_date && m.scheduled_date > today
}

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

async function createAudience() {
  departmentError.value = ''
  savingDepartment.value = true
  const { error } = await addDepartment(newDepartment.value)
  if (error) {
    departmentError.value = error
  } else {
    await logActivity(auth.profile?.id, `Added "${newDepartment.value.trim()}" as a company audience`)
    newDepartment.value = ''
    await refreshDepartments()
  }
  savingDepartment.value = false
}

async function removeAudience(d: Department) {
  const { error } = await deleteDepartment(d.id)
  if (error) {
    departmentError.value = error
    return
  }
  await logActivity(auth.profile?.id, `Removed "${d.name}" from company audiences`)
  await refreshDepartments()
}
</script>

<template>
  <div>
    <div class="topline">
      <div><h2>Modules</h2></div>
    </div>

    <div class="card" style="padding: 18px; margin-bottom: 20px; max-width: 460px">
      <div class="panel-title"><h3>Audiences</h3></div>
      <p class="hint" style="margin-bottom: 8px">
        Departments employees can belong to and modules can target. "General" is always available and means everyone.
      </p>
      <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px">
        <span class="pill pill-outline">General</span>
        <span v-for="d in departments" :key="d.id" class="pill pill-outline" style="display: inline-flex; align-items: center; gap: 6px">
          {{ d.name }}
          <button
            style="background: none; border: none; cursor: pointer; color: var(--danger); font-weight: 700; line-height: 1; padding: 0"
            title="Remove"
            @click="removeAudience(d)"
          >
            ×
          </button>
        </span>
      </div>
      <div style="display: flex; gap: 8px">
        <input v-model="newDepartment" type="text" placeholder="e.g. Legal" style="flex: 1" />
        <button class="btn btn-ghost btn-sm" :disabled="savingDepartment || !newDepartment.trim()" @click="createAudience">
          {{ savingDepartment ? 'Adding…' : 'Add' }}
        </button>
      </div>
      <p v-if="departmentError" class="hint" style="color: var(--danger); margin-top: 6px">{{ departmentError }}</p>
      <p class="hint" style="margin-top: 6px">
        Removing an audience only stops it appearing in future dropdowns — anyone already assigned to it, or any module
        already targeting it, is unaffected.
      </p>
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
          <option value="General">General</option>
          <option v-for="d in departments" :key="d.id" :value="d.name">{{ d.name }}</option>
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
            <td style="font-weight: 600">
              <RouterLink :to="`/admin/modules/${m.id}`" style="text-decoration: none">{{ m.title }}</RouterLink>
            </td>
            <td><span class="pill pill-outline">{{ m.department }}</span></td>
            <td>
              <span :class="['pill', m.is_draft ? 'pill-danger' : isScheduledFuture(m) ? 'pill-outline' : 'pill-teal']">
                {{
                  m.is_draft
                    ? `Draft · ${questionCounts[m.id] ?? 0} of ${MIN_QUESTIONS_TO_PUBLISH}`
                    : isScheduledFuture(m)
                      ? `Scheduled for ${m.scheduled_date}`
                      : 'Published'
                }}
              </span>
            </td>
            <td><RouterLink class="btn btn-ghost btn-sm" :to="`/admin/modules/${m.id}`">Open</RouterLink></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
