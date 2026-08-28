<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { logActivity } from '@/lib/activity'
import { loadDepartments } from '@/lib/departments'
import { uploadModuleMaterial, documentEmbedUrl } from '@/lib/materials'
import { MIN_QUESTIONS_TO_PUBLISH, parseBulkQuestions } from '@/lib/quiz'
import type { Module, QuizQuestion, Department } from '@/lib/database.types'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const moduleId = Number(route.params.id)

const module_ = ref<Module | null>(null)
const questions = ref<QuizQuestion[]>([])
const loading = ref(true)

const departments = ref<Department[]>([])
const detailTitle = ref('')
const detailDepartment = ref('')
const detailYoutubeId = ref('')
const detailQuizRequired = ref(true)
const savingDetails = ref(false)

const newQuestion = ref('')
const newOptions = ref(['', '', '', ''])
const newCorrect = ref(0)
const savingQuestion = ref(false)

const bulkText = ref('')
const bulkPreview = ref<ReturnType<typeof parseBulkQuestions>>([])
const savingBulk = ref(false)

const publishBusy = ref(false)
const scheduledDate = ref('')
const savingSchedule = ref(false)

const uploadingMaterial = ref(false)
const materialError = ref('')

const editingId = ref<number | null>(null)
const editQuestion = ref('')
const editOptions = ref(['', '', '', ''])
const editCorrect = ref(0)
const savingEdit = ref(false)

async function load() {
  loading.value = true
  const [{ data: mod }, { data: qs }, depts] = await Promise.all([
    supabase.from('modules').select('*').eq('id', moduleId).single(),
    supabase.from('quiz_questions').select('*').eq('module_id', moduleId).order('id'),
    loadDepartments(),
  ])
  module_.value = mod
  questions.value = qs ?? []
  scheduledDate.value = mod?.scheduled_date ?? ''
  departments.value = depts
  detailTitle.value = mod?.title ?? ''
  detailDepartment.value = mod?.department ?? 'General'
  detailYoutubeId.value = mod?.youtube_id ?? ''
  detailQuizRequired.value = mod?.quiz_required ?? true
  loading.value = false
}

onMounted(load)

async function saveDetails() {
  if (!detailTitle.value.trim()) return
  savingDetails.value = true
  const youtubeId = detailYoutubeId.value.trim() || null
  await supabase
    .from('modules')
    .update({
      title: detailTitle.value.trim(),
      department: detailDepartment.value,
      youtube_id: youtubeId,
      // Only meaningful for General modules — department modules always have a quiz via the
      // 5-module grouping, so this is ignored for them either way.
      quiz_required: detailDepartment.value === 'General' ? detailQuizRequired.value : true,
      // A module has a video OR a document, not both — saving a YouTube ID clears any uploaded file.
      ...(youtubeId ? { document_url: null, document_type: null } : {}),
    })
    .eq('id', moduleId)
  await logActivity(auth.profile?.id, `Updated details for "${detailTitle.value.trim()}"`)
  savingDetails.value = false
  await load()
}

async function onMaterialSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  materialError.value = ''
  uploadingMaterial.value = true
  const { url, type, error } = await uploadModuleMaterial(moduleId, file)
  if (error || !url || !type) {
    materialError.value = error ?? 'Upload failed.'
  } else {
    // A module has a video OR a document, not both — uploading a file clears any YouTube ID.
    await supabase.from('modules').update({ document_url: url, document_type: type, youtube_id: null }).eq('id', moduleId)
    await logActivity(auth.profile?.id, `Uploaded a ${type.toUpperCase()} document to "${module_.value?.title}"`)
    await load()
  }
  uploadingMaterial.value = false
}

async function removeMaterial() {
  await supabase.from('modules').update({ document_url: null, document_type: null }).eq('id', moduleId)
  await logActivity(auth.profile?.id, `Removed the uploaded document from "${module_.value?.title}"`)
  await load()
}

const quizExempt = computed(() => module_.value?.department === 'General' && !module_.value.quiz_required)
const canPublish = computed(() => quizExempt.value || questions.value.length >= MIN_QUESTIONS_TO_PUBLISH)
const isScheduledFuture = computed(
  () => !!module_.value?.scheduled_date && module_.value.scheduled_date > new Date().toISOString().slice(0, 10),
)

async function addQuestion() {
  if (!newQuestion.value.trim() || newOptions.value.some((o) => !o.trim())) return
  savingQuestion.value = true
  await supabase.from('quiz_questions').insert({
    module_id: moduleId,
    question: newQuestion.value.trim(),
    options: newOptions.value.map((o) => o.trim()),
    correct_index: newCorrect.value,
  })
  newQuestion.value = ''
  newOptions.value = ['', '', '', '']
  newCorrect.value = 0
  savingQuestion.value = false
  await load()
}

async function removeQuestion(id: number) {
  await supabase.from('quiz_questions').delete().eq('id', id)
  await load()
}

function startEdit(q: QuizQuestion) {
  editingId.value = q.id
  editQuestion.value = q.question
  editOptions.value = [...q.options]
  editCorrect.value = q.correct_index
}

function cancelEdit() {
  editingId.value = null
}

async function saveEdit() {
  if (!editingId.value || !editQuestion.value.trim() || editOptions.value.some((o) => !o.trim())) return
  savingEdit.value = true
  await supabase
    .from('quiz_questions')
    .update({
      question: editQuestion.value.trim(),
      options: editOptions.value.map((o) => o.trim()),
      correct_index: editCorrect.value,
    })
    .eq('id', editingId.value)
  savingEdit.value = false
  editingId.value = null
  await load()
}

function previewBulk() {
  bulkPreview.value = parseBulkQuestions(bulkText.value)
}

async function saveBulk() {
  if (!bulkPreview.value.length) return
  savingBulk.value = true
  await supabase.from('quiz_questions').insert(
    bulkPreview.value.map((q) => ({
      module_id: moduleId,
      question: q.question,
      options: q.options,
      correct_index: q.correct_index,
    })),
  )
  await logActivity(auth.profile?.id, `Added ${bulkPreview.value.length} questions to "${module_.value?.title}"`)
  bulkText.value = ''
  bulkPreview.value = []
  savingBulk.value = false
  await load()
}

async function togglePublish() {
  if (!module_.value) return
  if (module_.value.is_draft && !canPublish.value) return
  publishBusy.value = true
  const nowPublishing = module_.value.is_draft
  await supabase
    .from('modules')
    .update({ is_draft: !module_.value.is_draft })
    .eq('id', moduleId)
  await logActivity(
    auth.profile?.id,
    `${nowPublishing ? 'Published' : 'Unpublished'} "${module_.value.title}"`,
  )
  publishBusy.value = false
  await load()
}

async function saveSchedule() {
  savingSchedule.value = true
  await supabase
    .from('modules')
    .update({ scheduled_date: scheduledDate.value || null })
    .eq('id', moduleId)
  await logActivity(
    auth.profile?.id,
    scheduledDate.value
      ? `Scheduled "${module_.value?.title}" to appear on ${scheduledDate.value}`
      : `Cleared the publish schedule for "${module_.value?.title}"`,
  )
  savingSchedule.value = false
  await load()
}
</script>

<template>
  <div v-if="loading" style="color: var(--ink-soft)">Loading…</div>
  <div v-else-if="module_">
    <div class="topline">
      <div>
        <h2 style="font-size: 20px">{{ module_.title }}</h2>
        <p>{{ module_.department }} · {{ quizExempt ? 'no quiz required' : `${questions.length} of ${MIN_QUESTIONS_TO_PUBLISH} questions` }}</p>
      </div>
      <div style="display: flex; gap: 8px">
        <button class="btn btn-ghost btn-sm" @click="router.push('/admin/modules')">Back to modules</button>
        <button
          class="btn btn-primary btn-sm"
          :disabled="publishBusy || (module_.is_draft && !canPublish)"
          :title="module_.is_draft && !canPublish ? `Needs at least ${MIN_QUESTIONS_TO_PUBLISH} questions` : quizExempt ? 'No quiz required for this module' : ''"
          @click="togglePublish"
        >
          {{ module_.is_draft ? 'Publish' : 'Unpublish' }}
        </button>
      </div>
    </div>

    <span :class="['pill', module_.is_draft ? 'pill-danger' : isScheduledFuture ? 'pill-outline' : 'pill-teal']" style="margin-bottom: 16px; display: inline-block">
      {{
        module_.is_draft
          ? quizExempt
            ? 'Draft · no quiz required'
            : `Draft · ${questions.length} of ${MIN_QUESTIONS_TO_PUBLISH}`
          : isScheduledFuture
            ? `Scheduled for ${module_.scheduled_date}`
            : 'Published'
      }}
    </span>

    <div class="card" style="padding: 16px; margin-bottom: 20px" :style="{ maxWidth: module_.document_url ? '100%' : '640px' }">
      <div v-if="module_.youtube_id" class="video-box">
        <iframe
          :src="`https://www.youtube-nocookie.com/embed/${module_.youtube_id}?rel=0&modestbranding=1&iv_load_policy=3`"
          style="width: 100%; height: 100%; border: 0"
          allowfullscreen
        />
      </div>
      <!-- Documents get a viewport-scaled box instead of a fixed 16:9 one — a PPTX/PDF page reads
           poorly letterboxed into a small video-shaped rectangle, especially on a large screen. -->
      <div v-else-if="module_.document_url && module_.document_type" class="document-box">
        <iframe
          :src="documentEmbedUrl(module_.document_url, module_.document_type)"
          style="width: 100%; height: 100%; border: 0"
        />
      </div>
      <div v-else class="video-box video-placeholder">▶ No learning material attached yet</div>
    </div>

    <div class="card" style="padding: 18px; margin-bottom: 20px; max-width: 420px">
      <div class="panel-title"><h3>Document (alternative to a video)</h3></div>
      <p class="hint" style="margin-bottom: 8px">
        Upload a PDF, PPTX, or DOCX instead of a video — it shows in the same space, above. Uploading one clears any
        YouTube ID, and vice versa; a module can only have one or the other.
      </p>
      <input type="file" accept=".pdf,.pptx,.ppt,.docx,.doc" :disabled="uploadingMaterial" @change="onMaterialSelected" />
      <p v-if="uploadingMaterial" class="hint" style="margin-top: 6px">Uploading…</p>
      <p v-if="materialError" class="hint" style="color: var(--danger); margin-top: 6px">{{ materialError }}</p>
      <div v-if="module_.document_url" style="margin-top: 8px; display: flex; align-items: center; gap: 8px">
        <span class="pill pill-outline">{{ module_.document_type?.toUpperCase() }} attached</span>
        <button class="btn btn-ghost btn-sm" @click="removeMaterial">Remove</button>
      </div>
      <p v-if="module_.document_type === 'pptx' || module_.document_type === 'ppt' || module_.document_type === 'docx' || module_.document_type === 'doc'" class="hint" style="margin-top: 6px">
        PPTX/DOCX preview uses Microsoft's free Office Online Viewer, which needs the file reachable at a public URL —
        it won't preview from a local dev server, only once deployed.
      </p>
    </div>

    <div class="card" style="padding: 18px; margin-bottom: 20px; max-width: 420px">
      <div class="panel-title"><h3>Module details</h3></div>
      <div class="field">
        <label>Title</label>
        <input v-model="detailTitle" type="text" />
      </div>
      <div class="field">
        <label>YouTube video ID</label>
        <input v-model="detailYoutubeId" type="text" placeholder="e.g. dQw4w9WgXcQ" />
      </div>
      <div class="field">
        <label>Audience</label>
        <select v-model="detailDepartment">
          <option value="General">General</option>
          <option v-for="d in departments" :key="d.id" :value="d.name">{{ d.name }}</option>
        </select>
      </div>
      <div v-if="detailDepartment === 'General'" class="field">
        <label style="display: flex; align-items: center; gap: 6px; font-weight: 400">
          <input v-model="detailQuizRequired" type="checkbox" style="width: auto" />
          Quiz required for this module
        </label>
        <p class="hint" style="margin-top: 4px">
          Department modules always have a quiz (grouped every 5 into a milestone). For General modules only, you can
          turn this off for something purely informational — it publishes without needing any questions.
        </p>
      </div>
      <button class="btn btn-ghost btn-sm" :disabled="savingDetails" @click="saveDetails">
        {{ savingDetails ? 'Saving…' : 'Save details' }}
      </button>
      <p class="hint" style="margin-top: 10px">
        Created {{ new Date(module_.created_at).toLocaleDateString() }} · {{ questions.length }} question(s) in bank
      </p>
    </div>

    <div class="card" style="padding: 18px; margin-bottom: 20px; max-width: 360px">
      <div class="panel-title"><h3>Publish schedule</h3></div>
      <p class="hint" style="margin-bottom: 8px">
        Leave blank to show immediately once published. Set a future date to keep it hidden from employees until then.
      </p>
      <div class="field">
        <label>Publish on</label>
        <input v-model="scheduledDate" type="date" />
      </div>
      <button class="btn btn-ghost btn-sm" :disabled="savingSchedule" @click="saveSchedule">
        {{ savingSchedule ? 'Saving…' : 'Save schedule' }}
      </button>
    </div>

    <div class="card" style="padding: 18px; margin-bottom: 20px">
      <div class="panel-title"><h3>Add a question</h3></div>
      <div class="field">
        <label>Question</label>
        <input v-model="newQuestion" type="text" placeholder="What should you do first when…?" />
      </div>
      <div class="field" v-for="(_, i) in newOptions" :key="i">
        <label>
          <input type="radio" :checked="newCorrect === i" @change="newCorrect = i" style="margin-right: 6px" />
          Option {{ ['A', 'B', 'C', 'D'][i] }} {{ newCorrect === i ? '(correct)' : '' }}
        </label>
        <input v-model="newOptions[i]" type="text" />
      </div>
      <button class="btn btn-primary btn-sm" :disabled="savingQuestion" @click="addQuestion">
        {{ savingQuestion ? 'Adding…' : 'Add question' }}
      </button>
    </div>

    <div class="card" style="padding: 18px; margin-bottom: 20px">
      <div class="panel-title"><h3>Bulk paste questions</h3></div>
      <p class="hint" style="margin-bottom: 8px">
        One block per question, separated by a blank line:<br />
        <code>Q: question text</code><br />
        <code>A) option&nbsp;&nbsp;B) option&nbsp;&nbsp;C) option&nbsp;&nbsp;D) option</code> (one per line)<br />
        <code>Correct: B</code>
      </p>
      <textarea v-model="bulkText" rows="8" style="width: 100%; font-family: 'IBM Plex Mono', monospace; font-size: 12px" />
      <div style="display: flex; gap: 8px; margin-top: 8px">
        <button class="btn btn-ghost btn-sm" @click="previewBulk">Preview</button>
        <button class="btn btn-primary btn-sm" :disabled="!bulkPreview.length || savingBulk" @click="saveBulk">
          {{ savingBulk ? 'Saving…' : `Add ${bulkPreview.length} question(s)` }}
        </button>
      </div>
      <p v-if="bulkText && !bulkPreview.length" class="hint" style="color: var(--danger); margin-top: 6px">
        No valid question blocks found — check the format above.
      </p>
    </div>

    <div class="card">
      <div class="panel-title"><h3>Question bank ({{ questions.length }})</h3></div>
      <div v-for="(q, i) in questions" :key="q.id" class="row-item" style="cursor: default; align-items: flex-start">
        <div class="row-num">{{ i + 1 }}</div>

        <div v-if="editingId === q.id" class="row-info">
          <input v-model="editQuestion" type="text" style="margin-bottom: 8px" />
          <div v-for="(_, oi) in editOptions" :key="oi" style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px">
            <input type="radio" :checked="editCorrect === oi" @change="editCorrect = oi" />
            <input v-model="editOptions[oi]" type="text" style="flex: 1" />
          </div>
          <div style="display: flex; gap: 8px; margin-top: 6px">
            <button class="btn btn-primary btn-sm" :disabled="savingEdit" @click="saveEdit">
              {{ savingEdit ? 'Saving…' : 'Save' }}
            </button>
            <button class="btn btn-ghost btn-sm" @click="cancelEdit">Cancel</button>
          </div>
        </div>

        <template v-else>
          <div class="row-info">
            <div class="t">{{ q.question }}</div>
            <div class="m">
              <span v-for="(opt, oi) in q.options" :key="oi" :style="{ fontWeight: oi === q.correct_index ? 700 : 400 }">
                {{ ['A', 'B', 'C', 'D'][oi] }}) {{ opt }}{{ oi < q.options.length - 1 ? ' · ' : '' }}
              </span>
            </div>
          </div>
          <div style="display: flex; gap: 6px">
            <button class="btn btn-ghost btn-sm" @click="startEdit(q)">Edit</button>
            <button class="btn btn-ghost btn-sm" @click="removeQuestion(q.id)">Delete</button>
          </div>
        </template>
      </div>
      <p v-if="!questions.length" style="padding: 24px; text-align: center; color: var(--ink-soft)">
        No questions yet — add some above.
      </p>
    </div>
  </div>
</template>

<style scoped>
.video-box {
  aspect-ratio: 16 / 9;
  border-radius: 10px;
  overflow: hidden;
  background: linear-gradient(150deg, #1a1d2b, #0d0f18);
}
.video-placeholder {
  display: grid;
  place-items: center;
  color: #cfd3e6;
  font-size: 13px;
}
.document-box {
  width: 100%;
  height: min(85vh, 1100px);
  min-height: 420px;
  border-radius: 10px;
  overflow: hidden;
  background: linear-gradient(150deg, #1a1d2b, #0d0f18);
}
@media (max-width: 760px) {
  .document-box {
    height: 70vh;
  }
}
</style>
