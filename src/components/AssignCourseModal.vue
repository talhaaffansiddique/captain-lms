<script setup lang="ts">
// "Assign" pop-up: pick any employees (every department) for a course and set one deadline.
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { logActivity } from '@/lib/activity'
import { isActive } from '@/lib/employees'
import { assignCourseToUsers, loadAssignments } from '@/lib/assignments'
import type { Profile } from '@/lib/database.types'

const props = defineProps<{ courseId: number; courseTitle: string }>()
const emit = defineEmits<{ close: []; done: [] }>()

const auth = useAuthStore()
const people = ref<Profile[]>([])
const already = ref<Set<string>>(new Set())
const chosen = ref<Set<string>>(new Set())
const filter = ref('')
const due = ref('')
const saving = ref(false)
const error = ref('')
const missing = ref(false)

onMounted(async () => {
  const [{ data }, existing] = await Promise.all([
    supabase.from('profiles').select('*').eq('role', 'employee').order('full_name'),
    loadAssignments({ courseId: props.courseId }),
  ])
  people.value = ((data ?? []) as Profile[]).filter(isActive)
  already.value = new Set(existing.rows.map((r) => r.user_id))
  missing.value = existing.missing
})

const shown = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return people.value.filter((p) => !q || p.full_name.toLowerCase().includes(q) || p.department.toLowerCase().includes(q))
})

function toggle(id: string) {
  const next = new Set(chosen.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  chosen.value = next
}

function selectAllShown() {
  const next = new Set(chosen.value)
  for (const p of shown.value) if (!already.value.has(p.id)) next.add(p.id)
  chosen.value = next
}

async function submit() {
  error.value = ''
  saving.value = true
  const { error: err, added } = await assignCourseToUsers(props.courseId, [...chosen.value], due.value || null, auth.profile?.id, props.courseTitle)
  saving.value = false
  if (err) {
    error.value = err
    return
  }
  await logActivity(auth.profile?.id, `Assigned "${props.courseTitle}" to ${added} employee(s)`)
  emit('done')
  emit('close')
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="card dialog">
      <div class="panel-title" style="padding: 0 0 6px"><h3>Assign “{{ courseTitle }}”</h3></div>
      <p class="hint" style="margin: 0 0 10px">Pick anyone — including people in other departments. They'll see it in their catalog and My learning.</p>
      <p v-if="missing" class="hint" style="color: var(--danger)">Assignments need the v5 database update — run <code>supabase/v5.sql</code> first.</p>
      <input v-model="filter" type="text" placeholder="Search by name or department" />
      <div class="row" style="margin: 8px 0">
        <button class="btn btn-ghost btn-sm" @click="selectAllShown">Select all shown</button>
        <button class="btn btn-ghost btn-sm" @click="chosen = new Set()">Clear</button>
        <span class="hint" style="margin-left: auto">{{ chosen.size }} selected</span>
      </div>
      <div class="list">
        <label v-for="p in shown" :key="p.id" class="pick" :class="{ off: already.has(p.id) }">
          <input type="checkbox" style="width: auto" :checked="chosen.has(p.id) || already.has(p.id)" :disabled="already.has(p.id)" @change="toggle(p.id)" />
          <span><b>{{ p.full_name }}</b> <span class="sub">· {{ p.department }}{{ already.has(p.id) ? ' · already assigned' : '' }}</span></span>
        </label>
        <p v-if="!shown.length" class="hint" style="padding: 14px">No one matches.</p>
      </div>
      <div class="field" style="margin-top: 12px"><label>Deadline (optional)</label><input v-model="due" type="date" /></div>
      <p v-if="error" class="hint" style="color: var(--danger)">{{ error }}</p>
      <div class="row" style="margin-top: 12px">
        <button class="btn btn-primary" :disabled="saving || !chosen.size || missing" @click="submit">{{ saving ? 'Assigning…' : `Assign to ${chosen.size || ''} selected` }}</button>
        <button class="btn btn-ghost" @click="emit('close')">Cancel</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 16, 32, 0.55);
  z-index: 90;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 40px 14px;
  overflow: auto;
}
.dialog {
  max-width: 560px;
  width: 100%;
  padding: 22px;
}
.list {
  max-height: 260px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.pick {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  font-weight: 500;
}
.pick:last-child {
  border-bottom: 0;
}
.pick.off {
  opacity: 0.55;
  cursor: default;
}
</style>
