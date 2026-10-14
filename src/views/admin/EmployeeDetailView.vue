<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { logActivity } from '@/lib/activity'
import { loadDepartments } from '@/lib/departments'
import { manageEmployee, isActive } from '@/lib/employees'
import { allMilestonesForTrack, milestoneLabel, attemptsFor, maxAttemptsFor, hasPassed, loadTrackData } from '@/lib/quiz'
import type { Profile, QuizAttempt, QuizAttemptGrant, Department, Module } from '@/lib/database.types'

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

const departments = ref<Department[]>([])
const selectedDepartment = ref('')
const savingDepartment = ref(false)
const track = ref<Module[]>([])

const accountEmail = ref<string | null>(null)
const lastSignIn = ref<string | null>(null)
const editName = ref('')
const editRole = ref('employee')
const savingAccount = ref(false)
const accountMessage = ref<{ ok: boolean; text: string } | null>(null)
const accountBusy = ref(false)

async function loadAccountInfo() {
  const info = await manageEmployee({ action: 'get', id: employeeId })
  accountEmail.value = info.email ?? null
  lastSignIn.value = info.last_sign_in_at ?? null
}

async function saveAccount() {
  if (!employee.value) return
  accountMessage.value = null
  savingAccount.value = true
  const result = await manageEmployee({ action: 'update', id: employeeId, full_name: editName.value, role: editRole.value })
  savingAccount.value = false
  if (result.error) {
    accountMessage.value = { ok: false, text: result.error }
    return
  }
  await logActivity(auth.profile?.id, `Updated ${editName.value.trim()}'s account (name/role: ${editRole.value})`)
  accountMessage.value = { ok: true, text: 'Saved.' }
  if (employeeId === auth.profile?.id) await auth.fetchProfile()
  await load()
}

async function toggleActive() {
  if (!employee.value) return
  const deactivating = isActive(employee.value)
  if (
    deactivating &&
    !window.confirm(
      `Deactivate ${employee.value.full_name}?\n\nThey won't be able to sign in and will disappear from the leaderboard and reports. Their history is kept and you can reactivate them any time.`,
    )
  )
    return
  accountMessage.value = null
  accountBusy.value = true
  const result = await manageEmployee({ action: deactivating ? 'deactivate' : 'reactivate', id: employeeId })
  accountBusy.value = false
  if (result.error) {
    accountMessage.value = { ok: false, text: result.error }
    return
  }
  await logActivity(auth.profile?.id, `${deactivating ? 'Deactivated' : 'Reactivated'} ${employee.value.full_name}`)
  await load()
}

async function deleteAccount() {
  if (!employee.value) return
  if (
    !window.confirm(
      `Delete ${employee.value.full_name} permanently?\n\nThis removes their account and ALL their training history (completions, quiz attempts, badges). This cannot be undone.\n\nIf you only want to stop them signing in, use Deactivate instead.`,
    )
  )
    return
  accountMessage.value = null
  accountBusy.value = true
  const name = employee.value.full_name
  const result = await manageEmployee({ action: 'delete', id: employeeId })
  accountBusy.value = false
  if (result.error) {
    accountMessage.value = { ok: false, text: result.error }
    return
  }
  await logActivity(auth.profile?.id, `Deleted ${name}`)
  router.push('/admin/employees')
}

async function load() {
  loading.value = true
  const [{ data: emp }, { data: att }, { data: grt }, depts] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', employeeId).single(),
    supabase.from('quiz_attempts').select('*').eq('user_id', employeeId),
    supabase.from('quiz_attempt_grants').select('*').eq('user_id', employeeId),
    loadDepartments(),
  ])
  employee.value = emp
  attempts.value = att ?? []
  grants.value = grt ?? []
  dueDate.value = emp?.due_date ?? ''
  departments.value = depts
  selectedDepartment.value = emp?.department ?? 'General'
  editName.value = emp?.full_name ?? ''
  editRole.value = emp?.role ?? 'employee'

  if (emp) {
    const trackData = await loadTrackData(employeeId, emp.department)
    track.value = trackData.track
    const doneIds = new Set(trackData.completions.filter((c) => c.completed).map((c) => c.module_id))
    allModulesDone.value = trackData.track.length > 0 && trackData.track.every((m) => doneIds.has(m.id))
  }
  loading.value = false
}

onMounted(async () => {
  await load()
  await loadAccountInfo()
})

async function saveDepartment() {
  if (!employee.value || selectedDepartment.value === employee.value.department) return
  const fromDept = employee.value.department
  const toDept = selectedDepartment.value
  const confirmed = window.confirm(
    `Move ${employee.value.full_name} from ${fromDept} to ${toDept}?\n\nThis permanently clears their training history — every module completion, quiz attempt, badge, and granted extra attempt — since it no longer applies to the new department's track. This cannot be undone.`,
  )
  if (!confirmed) return

  savingDepartment.value = true
  await supabase.from('profiles').update({ department: toDept }).eq('id', employeeId)
  await Promise.all([
    supabase.from('video_completions').delete().eq('user_id', employeeId),
    supabase.from('quiz_attempts').delete().eq('user_id', employeeId),
    supabase.from('quiz_attempt_grants').delete().eq('user_id', employeeId),
  ])
  await logActivity(
    auth.profile?.id,
    `Moved ${employee.value.full_name} from ${fromDept} to ${toDept} and cleared their training history`,
  )
  savingDepartment.value = false
  await load()
}

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
  allMilestonesForTrack(track.value).map((m) => {
    const used = attemptsFor(m, attempts.value)
    return {
      milestone: m,
      label: milestoneLabel(m, track.value),
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
  await logActivity(auth.profile.id, `Granted ${employee.value?.full_name} an extra attempt on ${milestoneLabel(milestone, track.value)}`)
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
      <div class="panel-title">
        <h3>Account</h3>
        <span :class="['pill', isActive(employee) ? 'pill-teal' : 'pill-muted']">{{ isActive(employee) ? 'Active' : 'Inactive' }}</span>
      </div>
      <p class="hint" style="margin-bottom: 10px">
        {{ accountEmail ?? '…' }}
        <template v-if="lastSignIn"> · last sign-in {{ new Date(lastSignIn).toLocaleDateString() }}</template>
        <template v-else-if="accountEmail"> · hasn't signed in yet</template>
      </p>
      <div class="field"><label>Full name</label><input v-model="editName" type="text" /></div>
      <div class="field">
        <label>Role</label>
        <select v-model="editRole">
          <option value="employee">Employee</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap">
        <button
          class="btn btn-ghost btn-sm"
          :disabled="savingAccount || (editName.trim() === employee.full_name && editRole === employee.role)"
          @click="saveAccount"
        >
          {{ savingAccount ? 'Saving…' : 'Save' }}
        </button>
        <template v-if="employee.id !== auth.profile?.id">
          <button class="btn btn-ghost btn-sm" :disabled="accountBusy" @click="toggleActive">
            {{ isActive(employee) ? 'Deactivate' : 'Reactivate' }}
          </button>
          <button class="btn btn-ghost btn-sm" style="color: var(--danger)" :disabled="accountBusy" @click="deleteAccount">Delete</button>
        </template>
      </div>
      <p v-if="accountMessage" class="hint" style="margin-top: 8px" :style="{ color: accountMessage.ok ? 'var(--teal)' : 'var(--danger)' }">
        {{ accountMessage.text }}
      </p>
      <p class="hint" style="margin-top: 8px">
        Deactivate stops them signing in and hides them from the leaderboard and reports, keeping their history.
        Delete removes the account and all their progress permanently.
      </p>
    </div>

    <div class="card" style="padding: 18px; margin-bottom: 20px; max-width: 420px">
      <div class="panel-title"><h3>Department</h3></div>
      <div class="field">
        <label>Department</label>
        <select v-model="selectedDepartment">
          <option value="General">General</option>
          <option v-for="d in departments" :key="d.id" :value="d.name">{{ d.name }}</option>
        </select>
      </div>
      <button class="btn btn-ghost btn-sm" :disabled="savingDepartment || selectedDepartment === employee.department" @click="saveDepartment">
        {{ savingDepartment ? 'Saving…' : 'Save department' }}
      </button>
      <p class="hint" style="margin-top: 8px">
        Changing this clears their training history — module completions, quiz attempts, badges, and any granted
        extra attempts — since none of it applies to the new department's track. You'll be asked to confirm.
      </p>
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
