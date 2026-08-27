<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { logActivity } from '@/lib/activity'
import { parseEmployeeCsv, type ParsedEmployeeRow } from '@/lib/csv'
import type { Profile } from '@/lib/database.types'

const auth = useAuthStore()
const employees = ref<Profile[]>([])
const today = new Date().toISOString().slice(0, 10)

const csvPreview = ref<ParsedEmployeeRow[]>([])
const importing = ref(false)
const importResults = ref<{ email: string; success: boolean; error?: string }[]>([])

onMounted(async () => {
  const { data } = await supabase.from('profiles').select('*').order('full_name')
  employees.value = data ?? []
})

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

    <div class="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Department</th>
            <th>Role</th>
            <th>Deadline</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in employees" :key="e.id">
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
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
