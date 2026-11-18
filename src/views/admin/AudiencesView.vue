<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { logActivity } from '@/lib/activity'
import { loadDepartments, addDepartment, deleteDepartment, setDepartmentColor, loadAudienceColors, AUDIENCE_PALETTE, GENERAL_COLOR } from '@/lib/departments'
import type { Department } from '@/lib/database.types'

const auth = useAuthStore()
const departments = ref<Department[]>([])
const newDepartment = ref('')
const savingDepartment = ref(false)
const departmentError = ref('')
const colors = ref<Record<string, string>>({})
const colorsMissing = ref(false)

async function refreshDepartments() {
  departments.value = await loadDepartments()
  colors.value = await loadAudienceColors()
  colorsMissing.value = departments.value.length > 0 && departments.value.every((d) => d.color === undefined)
}

async function pickColor(d: Department, c: string) {
  departmentError.value = ''
  const { error } = await setDepartmentColor(d.id, c)
  if (error) departmentError.value = /color/i.test(error) ? 'Colours need the v5 database update — run supabase/v5.sql first.' : error
  else await refreshDepartments()
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

    <div class="card" style="padding: 18px; max-width: 640px">
      <p class="hint" style="margin-bottom: 10px">
        Departments employees can belong to and modules can target. "General" is always available and means everyone.
        Each audience has a colour — every new audience gets an unused one automatically, and its courses inherit it.
      </p>
      <div class="aud">
        <span class="dot" :style="{ background: GENERAL_COLOR }" /> <b>General</b> <span class="hint">built-in · fixed colour</span>
      </div>
      <div v-for="d in departments" :key="d.id" class="aud">
        <span class="dot" :style="{ background: colors[d.name] }" />
        <b>{{ d.name }}</b>
        <span class="sw">
          <button
            v-for="c in AUDIENCE_PALETTE"
            :key="c"
            class="swatch"
            :class="{ on: colors[d.name] === c }"
            :style="{ background: c, opacity: Object.entries(colors).some(([n, col]) => col === c && n !== d.name) ? 0.3 : 1 }"
            :title="c"
            @click="pickColor(d, c)"
          />
        </span>
        <button class="rm" title="Remove" @click="removeAudience(d)">×</button>
      </div>
      <p class="hint" style="margin-top: 6px">Faded swatches are already used by another audience.</p>
      <div style="display: flex; gap: 8px; margin-top: 12px">
        <input v-model="newDepartment" type="text" placeholder="e.g. Legal" style="flex: 1" />
        <button class="btn btn-ghost btn-sm" :disabled="savingDepartment || !newDepartment.trim()" @click="createAudience">
          {{ savingDepartment ? 'Adding…' : 'Add audience' }}
        </button>
      </div>
      <p v-if="colorsMissing" class="hint" style="color: var(--danger); margin-top: 6px">Colour saving needs the v5 database update — run <code>supabase/v5.sql</code>.</p>
      <p v-if="departmentError" class="hint" style="color: var(--danger); margin-top: 6px">{{ departmentError }}</p>
      <p class="hint" style="margin-top: 6px">
        Removing an audience only stops it appearing in future dropdowns — anyone already assigned to it, or any module
        already targeting it, is unaffected.
      </p>
    </div>
  </div>
</template>

<style scoped>
.aud {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border);
}
.dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex: none;
}
.sw {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-left: auto;
}
.swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 3px solid transparent;
  cursor: pointer;
}
.swatch.on {
  border-color: var(--ink);
}
.rm {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--danger);
  font-weight: 700;
  font-size: 18px;
}
</style>
