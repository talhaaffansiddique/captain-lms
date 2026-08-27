<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { logActivity } from '@/lib/activity'
import { NUMBERED_MILESTONES, milestoneLabel, attemptsFor, maxAttemptsFor, hasPassed, loadTrackData, type Milestone } from '@/lib/quiz'
import type { Profile, QuizAttempt, QuizAttemptGrant } from '@/lib/database.types'

const MILESTONES: Milestone[] = [...NUMBERED_MILESTONES, 'final']

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const employeeId = route.params.id as string

const employee = ref<Profile | null>(null)
const attempts = ref<QuizAttempt[]>([])
const grants = ref<QuizAttemptGrant[]>([])
const loading = ref(true)
const granting = ref<string | null>(null)
const allModulesDone = ref(false)
const dueDate = ref('')
const savingDueDate = ref(false)
const escalating = ref(false)

async function load() {
  loading.value = true
  const [{ data: emp }, { data: att }, { data: grt }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', employeeId).single(),
    supabase.from('quiz_attempts').select('*').eq('user_id', employeeId),
    supabase.from('quiz_attempt_grants').select('*').eq('user_id', employeeId),
  ])
  employee.value = emp
  attempts.value = att ?? []
  grants.value = grt ?? []
  dueDate.value = emp?.due_date ?? ''

  if (emp) {
    const { track, completions } = await loadTrackData(employeeId, emp.department)
    const doneIds = new Set(completions.filter((c) => c.completed).map((c) => c.module_id))
    allModulesDone.value = track.length > 0 && track.every((m) => doneIds.has(m.id))
  }
  loading.value = false
}

onMounted(load)

const isOverdue = computed(() => !!dueDate.value && !allModulesDone.value && dueDate.value < new Date().toISOString().slice(0, 10))

async function saveDueDate() {
  savingDueDate.value = true
  await supabase.from('profiles').update({ due_date: dueDate.value || null }).eq('id', employeeId)
  await logActivity(auth.profile?.id, `Set a training deadline of ${dueDate.value} for ${employee.value?.full_name}`)
  savingDueDate.value = false
  await load()
}

async function sendEscalation() {
  escalating.value = true
  await supabase.from('notifications').insert({
    user_id: employeeId,
    text: `Reminder: your training deadline (${dueDate.value}) has passed — please complete your remaining modules.`,
    action: null,
  })
  await logActivity(auth.profile?.id, `Sent a compliance escalation notice to ${employee.value?.full_name}`)
  escalating.value = false
}

const rows = computed(() =>
  MILESTONES.map((m) => {
    const used = attemptsFor(m, attempts.value)
    return {
      milestone: m,
      label: milestoneLabel(m),
      used: used.length,
      max: maxAttemptsFor(m, grants.value),
      passed: hasPassed(m, attempts.value),
    }
  }),
)

async function grantExtra(milestone: string) {
  if (!auth.profile) return
  granting.value = milestone
  await supabase.from('quiz_attempt_grants').insert({
    user_id: employeeId,
    milestone,
    extra_attempts: 1,
    granted_by: auth.profile.id,
  })
  await logActivity(auth.profile.id, `Granted ${employee.value?.full_name} an extra attempt on ${milestoneLabel(milestone as Milestone)}`)
  granting.value = null
  await load()
}
</script>

<template>
  <div v-if="loading" style="color: var(--ink-soft)">Loading…</div>
  <div v-else-if="employee">
    <div class="topline">
      <div>
        <h2 style="font-size: 20px">{{ employee.full_name }}</h2>
        <p>{{ employee.department }} · {{ employee.role }}</p>
      </div>
      <button class="btn btn-ghost btn-sm" @click="router.push('/admin/employees')">Back to employees</button>
    </div>

    <div class="card" style="padding: 18px; margin-bottom: 20px; max-width: 420px">
      <div class="panel-title"><h3>Compliance deadline</h3></div>
      <div class="field">
        <label>Due date</label>
        <input v-model="dueDate" type="date" />
      </div>
      <div style="display: flex; gap: 8px; align-items: center">
        <button class="btn btn-ghost btn-sm" :disabled="savingDueDate" @click="saveDueDate">
          {{ savingDueDate ? 'Saving…' : 'Save deadline' }}
        </button>
        <span v-if="isOverdue" class="pill pill-danger">Overdue</span>
      </div>
      <button v-if="isOverdue" class="btn btn-primary btn-sm" style="margin-top: 10px" :disabled="escalating" @click="sendEscalation">
        {{ escalating ? 'Sending…' : 'Send escalation notice' }}
      </button>
    </div>

    <div class="card">
      <div class="panel-title"><h3>Quiz attempts</h3></div>
      <div v-for="r in rows" :key="r.milestone" class="row-item" style="cursor: default">
        <div class="row-info">
          <div class="t">{{ r.label }}</div>
          <div class="m">
            {{ r.used }} of {{ r.max }} attempts used
            <span v-if="r.passed" class="pill pill-teal" style="margin-left: 6px">Passed</span>
            <span v-else-if="r.used >= r.max" class="pill pill-danger" style="margin-left: 6px">Locked</span>
          </div>
        </div>
        <button
          v-if="!r.passed && r.used >= r.max"
          class="btn btn-ghost btn-sm"
          :disabled="granting === r.milestone"
          @click="grantExtra(r.milestone)"
        >
          {{ granting === r.milestone ? 'Granting…' : 'Grant extra attempt' }}
        </button>
      </div>
    </div>
  </div>
</template>
