<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { logActivity } from '@/lib/activity'
import { parseEmployeeCsv, type ParsedEmployeeRow } from '@/lib/csv'
import { loadDepartments } from '@/lib/departments'
import { useSort } from '@/composables/useSort'
import { manageEmployee, isActive, initialsOf } from '@/lib/employees'
import type { Profile, Department } from '@/lib/database.types'

const auth = useAuthStore()
const employees = ref<Profile[]>([])
const today = new Date().toISOString().slice(0, 10)

const csvPreview = ref<ParsedEmployeeRow[]>([])
const importing = ref(false)
interface InviteResult {
  row_number: number
  name: string
  email: string
  status: 'sent' | 'failed'
  error?: string
  attempts: number
}
const importResults = ref<InviteResult[]>([])
const batchId = ref('')
const importMessage = ref('')
const retrying = ref(false)

const departments = ref<Department[]>([])
const showInactive = ref(false)
const showAddForm = ref(false)
const newName = ref('')
const newEmail = ref('')
const newDepartment = ref('General')
const newRole = ref('employee')
const adding = ref(false)
const addMessage = ref<{ ok: boolean; text: string } | null>(null)
const busyId = ref<string | null>(null)
const rowError = ref('')

async function loadEmployees() {
  const { data } = await supabase.from('profiles').select('*').order('full_name')
  employees.value = data ?? []
}

onMounted(async () => {
  await loadEmployees()
  departments.value = await loadDepartments()
})

const visibleEmployees = computed(() => employees.value.filter((e) => showInactive.value || isActive(e)))
const { sorted: sortedEmployees, toggle, indicator, ariaSort } = useSort(visibleEmployees, {
  name: (e) => e.full_name,
  department: (e) => e.department,
  role: (e) => e.role,
  deadline: (e) => e.due_date,
  status: (e) => (isActive(e) ? 'Active' : 'Inactive'),
})
const inactiveCount = computed(() => employees.value.filter((e) => !isActive(e)).length)

async function addEmployee() {
  addMessage.value = null
  adding.value = true
  const result = await manageEmployee({
    action: 'create',
    email: newEmail.value,
    full_name: newName.value,
    department: newDepartment.value,
    role: newRole.value,
  })
  adding.value = false
  if (result.error) {
    addMessage.value = { ok: false, text: result.error }
    return
  }
  await logActivity(auth.profile?.id, `Added ${newName.value.trim()} as ${newRole.value} (${newDepartment.value}) and sent an invite`)
  addMessage.value = { ok: true, text: `Invite sent to ${newEmail.value.trim()} - they will set their own password.` }
  newName.value = ''
  newEmail.value = ''
  newRole.value = 'employee'
  await loadEmployees()
}

async function toggleActive(e: Profile) {
  const deactivating = isActive(e)
  if (
    deactivating &&
    !window.confirm(
      `Deactivate ${e.full_name}?\n\nThey won't be able to sign in and will disappear from the leaderboard and reports. Their history is kept and you can reactivate them any time.`,
    )
  )
    return
  busyId.value = e.id
  rowError.value = ''
  const result = await manageEmployee({ action: deactivating ? 'deactivate' : 'reactivate', id: e.id })
  busyId.value = null
  if (result.error) {
    rowError.value = result.error
    return
  }
  await logActivity(auth.profile?.id, `${deactivating ? 'Deactivated' : 'Reactivated'} ${e.full_name}`)
  await loadEmployees()
}

async function deleteEmployee(e: Profile) {
  if (
    !window.confirm(
      `Delete ${e.full_name} permanently?\n\nThis removes their account and ALL their training history (completions, quiz attempts, badges). This cannot be undone.\n\nIf you only want to stop them signing in, use Deactivate instead.`,
    )
  )
    return
  busyId.value = e.id
  rowError.value = ''
  const result = await manageEmployee({ action: 'delete', id: e.id })
  busyId.value = null
  if (result.error) {
    rowError.value = result.error
    return
  }
  await logActivity(auth.profile?.id, `Deleted ${e.full_name}`)
  await loadEmployees()
}

function isOverdue(e: Profile) {
  return !!e.due_date && e.due_date < today
}

function onCsvSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  importResults.value = []
  file.text().then((text) => {
    csvPreview.value = parseEmployeeCsv(text)
  })
}

async function callInviteFunction(payload: Record<string, unknown>) {
  const { data: sessionData } = await supabase.auth.getSession()
  const res = await fetch('/.netlify/functions/admin-bulk-invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${sessionData.session?.access_token}` },
    body: JSON.stringify(payload),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Import failed')
  return body as { results: { row_number: number; email: string; status: 'sent' | 'failed'; error?: string; attempts: number }[]; failedInBatch: number; processed: number; lastRow: number; chunk: number }
}

/** Sends the CSV rows in small chunks (Resend is rate-limited) and records every row's outcome. */
async function runImport() {
  if (!csvPreview.value.length) return
  importing.value = true
  importResults.value = []
  importMessage.value = ''
  batchId.value = crypto.randomUUID()
  const rows = csvPreview.value
  const names = new Map(rows.map((r) => [r.email.trim().toLowerCase(), r.full_name]))
  try {
    for (let i = 0; i < rows.length; i += 15) {
      const out = await callInviteFunction({ batch_id: batchId.value, rows: rows.slice(i, i + 15) })
      for (const r of out.results) importResults.value.push({ ...r, name: names.get(r.email) ?? '' })
      importMessage.value = `Processed ${Math.min(i + 15, rows.length)} of ${rows.length}…`
    }
    const sent = importResults.value.filter((r) => r.status === 'sent').length
    importMessage.value = `${sent} of ${rows.length} invitations sent.`
    await logActivity(auth.profile?.id, `Bulk-invited ${sent} of ${rows.length} employees via CSV import`)
    await loadEmployees()
  } catch (e) {
    importMessage.value = e instanceof Error ? e.message : 'Could not reach the invite service.'
  }
  csvPreview.value = []
  importing.value = false
}

/** Retries only the rows that failed — sent rows are skipped and no employee is created twice. */
async function retryFailed() {
  if (!batchId.value) return
  retrying.value = true
  importMessage.value = ''
  try {
    let after = 0
    for (;;) {
      const out = await callInviteFunction({ batch_id: batchId.value, retry: true, after_row: after })
      for (const r of out.results) {
        const row = importResults.value.find((x) => x.row_number === r.row_number)
        if (row) Object.assign(row, { status: r.status, error: r.error, attempts: r.attempts })
      }
      after = out.lastRow
      if (out.processed < out.chunk) break
    }
    const failed = importResults.value.filter((r) => r.status === 'failed').length
    importMessage.value = failed ? `Retry finished — ${failed} row(s) still failing (see the reason on each row).` : 'Retry finished — every invitation has now been sent.'
    await loadEmployees()
  } catch (e) {
    importMessage.value = e instanceof Error ? e.message : 'Could not reach the invite service.'
  }
  retrying.value = false
}
const failedCount = computed(() => importResults.value.filter((r) => r.status === 'failed').length)
</script>

<template>
  <div>
    <div class="topline">
      <div><h2>Employees</h2></div>
      <button class="btn btn-primary btn-sm" @click="showAddForm = !showAddForm">{{ showAddForm ? 'Close' : '+ Add employee' }}</button>
    </div>

    <div v-if="showAddForm" class="card" style="padding: 18px; margin-bottom: 20px; max-width: 520px">
      <div class="panel-title"><h3>Add an employee</h3></div>
      <div class="field"><label>Full name</label><input v-model="newName" type="text" /></div>
      <div class="field"><label>Work email</label><input v-model="newEmail" type="email" /></div>
      <div class="field">
        <label>Department</label>
        <select v-model="newDepartment">
          <option value="General">General</option>
          <option v-for="d in departments" :key="d.id" :value="d.name">{{ d.name }}</option>
        </select>
      </div>
      <div class="field">
        <label>Role</label>
        <select v-model="newRole">
          <option value="employee">Employee</option>
          <option value="manager">Manager (sees their department's team, read-only)</option>
          <option value="admin">Admin (full control)</option>
        </select>
      </div>
      <button class="btn btn-primary btn-sm" :disabled="adding || !newName.trim() || !newEmail.trim()" @click="addEmployee">
        {{ adding ? 'Sending invite…' : 'Send invite' }}
      </button>
      <p v-if="addMessage" class="hint" style="margin-top: 8px" :style="{ color: addMessage.ok ? 'var(--teal)' : 'var(--danger)' }">
        {{ addMessage.text }}
      </p>
    </div>

    <div class="card" style="padding: 18px; margin-bottom: 20px; max-width: 900px">
      <div class="panel-title"><h3>Bulk import (CSV)</h3></div>
      <p class="hint" style="margin-bottom: 8px">
        A CSV with <code>Name, Email, Department</code> columns (header row required). Each row gets an invitation email,
        sent through Resend, to set their own password. Every row's result is shown below.
      </p>
      <input type="file" accept=".csv,text/csv" @change="onCsvSelected" />

      <div v-if="csvPreview.length" style="margin-top: 12px">
        <p class="hint">{{ csvPreview.length }} row(s) parsed:</p>
        <div v-for="(r, i) in csvPreview.slice(0, 10)" :key="i" style="font-size: 12.5px; color: var(--ink-soft)">
          {{ r.full_name }} — {{ r.email }} — {{ r.department }}
        </div>
        <p v-if="csvPreview.length > 10" class="hint">…and {{ csvPreview.length - 10 }} more</p>
        <button class="btn btn-primary btn-sm" style="margin-top: 8px" :disabled="importing" @click="runImport">
          {{ importing ? 'Inviting…' : `Invite ${csvPreview.length} employee(s)` }}
        </button>
      </div>

      <p v-if="importMessage" class="hint" style="margin-top: 10px">{{ importMessage }}</p>
      <div v-if="importResults.length" style="margin-top: 12px">
        <div class="row wrap" style="margin-bottom: 8px">
          <span class="pill pill-teal">{{ importResults.filter((r) => r.status === 'sent').length }} sent</span>
          <span class="pill" :class="failedCount ? 'pill-danger' : 'pill-outline'">{{ failedCount }} failed</span>
          <button class="btn btn-sm" :class="failedCount ? 'btn-primary' : 'btn-ghost'" style="margin-left: auto" :disabled="!failedCount || retrying" @click="retryFailed">
            {{ retrying ? 'Retrying…' : '↻ Retry failed invites' }}
          </button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Invitation</th><th>Details</th></tr></thead>
            <tbody>
              <tr v-for="r in importResults" :key="r.row_number">
                <td>{{ r.row_number }}</td>
                <td>{{ r.name }}</td>
                <td class="sub">{{ r.email }}</td>
                <td><span class="pill" :class="r.status === 'sent' ? 'pill-teal' : 'pill-danger'">{{ r.status === 'sent' ? (r.attempts > 1 ? 'Sent (retry)' : 'Sent') : 'Failed' }}</span></td>
                <td class="sub" :style="{ color: r.status === 'failed' ? 'var(--danger)' : undefined }">{{ r.error ?? '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="hint" style="margin-top: 6px">Retry only re-sends failed rows. Rows already sent are skipped and no employee record is created twice.</p>
      </div>
    </div>

    <div v-if="inactiveCount" style="margin-bottom: 10px">
      <label style="display: inline-flex; align-items: center; gap: 6px; font-weight: 400">
        <input v-model="showInactive" type="checkbox" style="width: auto" />
        Show {{ inactiveCount }} inactive
      </label>
    </div>
    <p v-if="rowError" class="hint" style="color: var(--danger); margin-bottom: 8px">{{ rowError }}</p>

    <div class="card table-wrap">
      <table>
        <thead>
          <tr>
            <th class="sortable" :aria-sort="ariaSort('name')" @click="toggle('name')">
              Name <span class="sort-ind">{{ indicator('name') }}</span>
            </th>
            <th class="sortable" :aria-sort="ariaSort('department')" @click="toggle('department')">
              Department <span class="sort-ind">{{ indicator('department') }}</span>
            </th>
            <th class="sortable" :aria-sort="ariaSort('role')" @click="toggle('role')">
              Role <span class="sort-ind">{{ indicator('role') }}</span>
            </th>
            <th class="sortable" :aria-sort="ariaSort('deadline')" @click="toggle('deadline')">
              Deadline <span class="sort-ind">{{ indicator('deadline') }}</span>
            </th>
            <th class="sortable" :aria-sort="ariaSort('status')" @click="toggle('status')">
              Status <span class="sort-ind">{{ indicator('status') }}</span>
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in sortedEmployees" :key="e.id" :style="{ opacity: isActive(e) ? 1 : 0.55 }">
            <td style="font-weight: 600">
              <RouterLink :to="`/admin/employees/${e.id}`" style="display: flex; align-items: center; gap: 10px; text-decoration: none">
                <div class="avatar" style="width: 26px; height: 26px; font-size: 11px">
                  {{ initialsOf(e.full_name) }}
                </div>
                {{ e.full_name }}
              </RouterLink>
            </td>
            <td>{{ e.department }}</td>
            <td><span class="pill pill-outline">{{ e.role }}</span></td>
            <td>
              <span v-if="isOverdue(e)" class="pill pill-danger">Overdue · {{ e.due_date }}</span>
              <span v-else-if="e.due_date" style="color: var(--ink-soft)">{{ e.due_date }}</span>
              <span v-else style="color: var(--ink-soft)">—</span>
            </td>
            <td><span :class="['pill', isActive(e) ? 'pill-teal' : 'pill-muted']">{{ isActive(e) ? 'Active' : 'Inactive' }}</span></td>
            <td style="white-space: nowrap">
              <RouterLink class="btn btn-ghost btn-sm" :to="`/admin/employees/${e.id}`">Edit</RouterLink>
              <button
                v-if="e.id !== auth.profile?.id"
                class="btn btn-ghost btn-sm"
                style="margin-left: 4px"
                :disabled="busyId === e.id"
                @click="toggleActive(e)"
              >
                {{ isActive(e) ? 'Deactivate' : 'Reactivate' }}
              </button>
              <button
                v-if="e.id !== auth.profile?.id"
                class="btn btn-ghost btn-sm"
                style="margin-left: 4px; color: var(--danger)"
                :disabled="busyId === e.id"
                @click="deleteEmployee(e)"
              >
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
