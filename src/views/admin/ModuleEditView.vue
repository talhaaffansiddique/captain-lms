<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { logActivity } from '@/lib/activity'
import { MIN_QUESTIONS_TO_PUBLISH, parseBulkQuestions } from '@/lib/quiz'
import type { Module, QuizQuestion } from '@/lib/database.types'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const moduleId = Number(route.params.id)

const module_ = ref<Module | null>(null)
const questions = ref<QuizQuestion[]>([])
const loading = ref(true)

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

const editingId = ref<number | null>(null)
const editQuestion = ref('')
const editOptions = ref(['', '', '', ''])
const editCorrect = ref(0)
const savingEdit = ref(false)

async function load() {
  loading.value = true
  const [{ data: mod }, { data: qs }] = await Promise.all([
    supabase.from('modules').select('*').eq('id', moduleId).single(),
    supabase.from('quiz_questions').select('*').eq('module_id', moduleId).order('id'),
  ])
  module_.value = mod
  questions.value = qs ?? []
  scheduledDate.value = mod?.scheduled_date ?? ''
  loading.value = false
}

onMounted(load)

const canPublish = computed(() => questions.value.length >= MIN_QUESTIONS_TO_PUBLISH)
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
        <p>{{ module_.department }} · {{ questions.length }} of {{ MIN_QUESTIONS_TO_PUBLISH }} questions</p>
      </div>
      <div style="display: flex; gap: 8px">
        <button class="btn btn-ghost btn-sm" @click="router.push('/admin/modules')">Back to modules</button>
        <button
          class="btn btn-primary btn-sm"
          :disabled="publishBusy || (module_.is_draft && !canPublish)"
          :title="module_.is_draft && !canPublish ? `Needs at least ${MIN_QUESTIONS_TO_PUBLISH} questions` : ''"
          @click="togglePublish"
        >
          {{ module_.is_draft ? 'Publish' : 'Unpublish' }}
        </button>
      </div>
    </div>

    <span :class="['pill', module_.is_draft ? 'pill-danger' : isScheduledFuture ? 'pill-outline' : 'pill-teal']" style="margin-bottom: 16px; display: inline-block">
      {{
        module_.is_draft
          ? `Draft · ${questions.length} of ${MIN_QUESTIONS_TO_PUBLISH}`
          : isScheduledFuture
            ? `Scheduled for ${module_.scheduled_date}`
            : 'Published'
      }}
    </span>

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
