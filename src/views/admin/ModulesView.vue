<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { logActivity } from '@/lib/activity'
import { loadDepartments, addDepartment, deleteDepartment } from '@/lib/departments'
import { uploadModuleMaterial, formatDuration } from '@/lib/materials'
import { MIN_QUESTIONS_TO_PUBLISH } from '@/lib/quiz'
import type { Module, Department } from '@/lib/database.types'

const auth = useAuthStore()
const modules = ref<Module[]>([])
const questionCounts = ref<Record<number, number>>({})
const title = ref('')
const department = ref('')
const youtubeId = ref('')
const materialType = ref<'video' | 'document'>('video')
const documentFile = ref<File | null>(null)
const quizRequired = ref(true)
const saving = ref(false)
const createError = ref('')

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

function materialTypeLabel(m: Module) {
  if (m.youtube_id) return '▶ Video'
  if (m.document_url && m.document_type) return `📄 ${m.document_type.toUpperCase()}`
  return '—'
}

function onDocumentSelected(e: Event) {
  documentFile.value = (e.target as HTMLInputElement).files?.[0] ?? null
}

async function createDraft() {
  if (!title.value.trim()) return
  if (materialType.value === 'document' && !documentFile.value) {
    createError.value = 'Choose a file to upload, or switch to Video.'
    return
  }
  createError.value = ''
  saving.value = true

  const { data: inserted, error: insertError } = await supabase
    .from('modules')
    .insert({
      title: title.value.trim(),
      department: department.value,
      youtube_id: materialType.value === 'video' ? youtubeId.value.trim() || null : null,
      quiz_required: department.value === 'General' ? quizRequired.value : true,
      is_draft: true,
      created_by: auth.profile?.id,
    })
    .select()
    .single()

  if (insertError || !inserted) {
    createError.value = insertError?.message ?? 'Could not create the module.'
    saving.value = false
    return
  }

  if (materialType.value === 'document' && documentFile.value) {
    const { url, type, error } = await uploadModuleMaterial(inserted.id, documentFile.value)
    if (error || !url || !type) {
      createError.value = error ?? 'Module created, but the document upload failed — try uploading it from the module page.'
    } else {
      await supabase.from('modules').update({ document_url: url, document_type: type }).eq('id', inserted.id)
    }
  }

  title.value = ''
  youtubeId.value = ''
  documentFile.value = null
  quizRequired.value = true
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

    <div class="card" style="padding: 18px; margin-bottom: 20px; max-width: 620px">
      <div class="field">
        <label>Module title</label>
        <input v-model="title" type="text" placeholder="e.g. Handling Refund Requests" />
      </div>

      <label style="display: block; font-size: 12.5px; font-weight: 600; margin-bottom: 6px">Learning material</label>
      <div style="display: flex; gap: 16px; margin-bottom: 14px; flex-wrap: wrap">
        <div style="flex: 1; min-width: 220px">
          <label style="display: flex; align-items: center; gap: 6px; font-weight: 400; margin-bottom: 6px">
            <input v-model="materialType" type="radio" value="video" style="margin: 0" />
            Video (YouTube)
          </label>
          <input
            v-model="youtubeId"
            type="text"
            placeholder="YouTube video ID — e.g. dQw4w9WgXcQ"
            :disabled="materialType !== 'video'"
          />
        </div>
        <div style="flex: 1; min-width: 220px">
          <label style="display: flex; align-items: center; gap: 6px; font-weight: 400; margin-bottom: 6px">
            <input v-model="materialType" type="radio" value="document" style="margin: 0" />
            Document (PDF/PPTX/DOCX)
          </label>
          <input type="file" accept=".pdf,.pptx,.ppt,.docx,.doc" :disabled="materialType !== 'document'" @change="onDocumentSelected" />
        </div>
      </div>

      <div class="field">
        <label>Audience</label>
        <select v-model="department">
          <option value="General">General</option>
          <option v-for="d in departments" :key="d.id" :value="d.name">{{ d.name }}</option>
        </select>
      </div>
      <div v-if="department === 'General'" class="field">
        <label style="display: flex; align-items: center; gap: 6px; font-weight: 400">
          <input v-model="quizRequired" type="checkbox" style="width: auto" />
          Quiz required for this module
        </label>
      </div>
      <button class="btn btn-primary" :disabled="saving" @click="createDraft">
        {{ saving ? 'Saving…' : 'Save as draft' }}
      </button>
      <p v-if="createError" class="hint" style="color: var(--danger); margin-top: 8px">{{ createError }}</p>
      <p class="hint">Open a module below to add its question bank — {{ MIN_QUESTIONS_TO_PUBLISH }} questions are required before it can be published.</p>
    </div>

    <div class="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Duration</th>
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
            <td style="color: var(--ink-soft)">{{ materialTypeLabel(m) }}</td>
            <td style="color: var(--ink-soft)">{{ formatDuration(m) }}</td>
            <td><span class="pill pill-outline">{{ m.department }}</span></td>
            <td>
              <span :class="['pill', m.is_draft ? 'pill-danger' : isScheduledFuture(m) ? 'pill-outline' : 'pill-teal']">
                {{
                  m.is_draft
                    ? m.department === 'General' && !m.quiz_required
                      ? 'Draft · no quiz required'
                      : `Draft · ${questionCounts[m.id] ?? 0} of ${MIN_QUESTIONS_TO_PUBLISH}`
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
