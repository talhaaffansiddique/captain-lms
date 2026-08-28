<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { logActivity } from '@/lib/activity'
import { loadDepartments, addDepartment, deleteDepartment } from '@/lib/departments'
import type { Department } from '@/lib/database.types'

const auth = useAuthStore()
const departments = ref<Department[]>([])
const newDepartment = ref('')
const savingDepartment = ref(false)
const departmentError = ref('')

async function refreshDepartments() {
  departments.value = await loadDepartments()
}

onMounted(refreshDepartments)

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
      <div><h2>Audiences</h2></div>
    </div>

    <div class="card" style="padding: 18px; max-width: 460px">
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
  </div>
</template>
