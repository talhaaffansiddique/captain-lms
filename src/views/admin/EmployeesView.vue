<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { logActivity } from '@/lib/activity'
import { parseEmployeeCsv, type ParsedEmployeeRow } from '@/lib/csv'
import { loadDepartments } from '@/lib/departments'
import { manageEmployee, isActive } from '@/lib/employees'
import type { Profile, Department } from '@/lib/database.types'

const auth = useAuthStore()
const employees = ref<Profile[]>([])
const today = new Date().toISOString().slice(0, 10)

const csvPreview = ref<ParsedEmployeeRow[]>([])
const importing = ref(false)
const importResults = ref<{ email: string; success: boolean; error?: string }[]>([])

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

async function runImport() {
  if (!csvPreview.value.length) return
  importing.value = true
  importResults.value = []
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  try {
    const res = await fetch('/.netlify/functions/admin-invite-employees', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ rows: csvPreview.value }),
    })
    const body = await res.json()
    if (!res.ok) {
      importResults.value = [{ email: '', success: false, error: body.error ?? 'Import failed' }]
    } else {
      importResults.value = body.results
      const successCount = body.results.filter((r: { success: boolean }) => r.success).length
      await logActivity(auth.profile?.id, `Bulk-invited ${successCount} of ${csvPreview.value.length} employees via CSV import`)
    }
  } catch {
    importResults.value = [{ email: '', success: false, error: 'Could not reach the invite service.' }]
  }
  csvPreview.value = []
  importing.value = false
}
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

    <div class="card" style="padding: 18px; margin-bottom: 20px; max-width: 520px">
      <div class="panel-title"><h3>Bulk import (CSV)</h3></div>
      <p class="hint" style="margin-bottom: 8px">
        A CSV with <code>Name, Email, Department</code> columns (header row required). Each row gets a Supabase invite
        email to set their own password.
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

      <div v-if="importResults.length" style="margin-top: 12px">
        <div v-for="(r, i) in importResults" :key="i" style="font-size: 12.5px" :style="{ color: r.success ? 'var(--teal)' : 'var(--danger)' }">
          {{ r.email || 'Import' }} — {{ r.success ? 'Invited' : r.error }}
        </div>
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
            <th>Name</th>
            <th>Department</th>
            <th>Role</th>
            <th>Deadline</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in visibleEmployees" :key="e.id" :style="{ opacity: isActive(e) ? 1 : 0.55 }">
            <td style="font-weight: 600">
              <RouterLink :to="`/admin/employees/${e.id}`" style="display: flex; align-items: center; gap: 10px; text-decoration: none">
                <div class="avatar" style="width: 26px; height: 26px; font-size: 11px">
                  {{ e.full_name.slice(0, 2).toUpperCase() }}
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
