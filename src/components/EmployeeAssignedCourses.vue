<script setup lang="ts">
// "Assigned courses" panel on Employee detail: add an assignment, change a deadline, remove one.
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { logActivity } from '@/lib/activity'
import { loadAudienceColors } from '@/lib/departments'
import { loadAssignments, assignCourseToUsers, setAssignmentDue, removeAssignment, daysUntil, type Assignment } from '@/lib/assignments'
import type { Course, Module, VideoCompletion } from '@/lib/database.types'

const props = defineProps<{ userId: string; name: string }>()

const auth = useAuthStore()
const courses = ref<Course[]>([])
const rows = ref<Assignment[]>([])
const lessonCounts = ref<Record<number, number>>({})
const doneCounts = ref<Record<number, number>>({})
const colors = ref<Record<string, string>>({})
const missing = ref(false)
const addId = ref<number | ''>('')
const addDue = ref('')
const busy = ref(false)

async function load() {
  const [{ data: cs }, asg, { data: mods }, { data: comps }, cols] = await Promise.all([
    supabase.from('courses').select('*').order('title'),
    loadAssignments({ userId: props.userId }),
    supabase.from('modules').select('id, course_id'),
    supabase.from('video_completions').select('module_id, completed').eq('user_id', props.userId).eq('completed', true),
    loadAudienceColors(),
  ])
  courses.value = (cs ?? []) as Course[]
  rows.value = asg.rows
  missing.value = asg.missing
  colors.value = cols
  const lc: Record<number, number> = {}
  const byModule = new Map<number, number | null | undefined>()
  for (const m of (mods ?? []) as Pick<Module, 'id' | 'course_id'>[]) {
    byModule.set(m.id, m.course_id)
    if (m.course_id) lc[m.course_id] = (lc[m.course_id] ?? 0) + 1
  }
  const dc: Record<number, number> = {}
  for (const c of (comps ?? []) as Pick<VideoCompletion, 'module_id'>[]) {
    const cid = byModule.get(c.module_id)
    if (cid) dc[cid] = (dc[cid] ?? 0) + 1
  }
  lessonCounts.value = lc
  doneCounts.value = dc
}
onMounted(load)

const courseById = computed(() => new Map(courses.value.map((c) => [c.id, c])))
const assignable = computed(() => courses.value.filter((c) => !rows.value.some((r) => r.course_id === c.id)))

function status(a: Assignment): { text: string; cls: string } {
  const total = lessonCounts.value[a.course_id] ?? 0
  const d = doneCounts.value[a.course_id] ?? 0
  if (total && d >= total) return { text: 'Completed', cls: 'pill-teal' }
  const left = daysUntil(a.due_date)
  if (left !== null && left < 0) return { text: 'Overdue', cls: 'pill-danger' }
  return d > 0 ? { text: `In progress · ${d}/${total}`, cls: 'pill-outline' } : { text: 'Not started', cls: 'pill-muted' }
}

async function add() {
  if (!addId.value) return
  busy.value = true
  const c = courseById.value.get(addId.value)
  await assignCourseToUsers(addId.value, [props.userId], addDue.value || null, auth.profile?.id, c?.title ?? 'a course')
  await logActivity(auth.profile?.id, `Assigned "${c?.title}" to ${props.name}`)
  addId.value = ''
  addDue.value = ''
  busy.value = false
  await load()
}
async function changeDue(a: Assignment, v: string) {
  await setAssignmentDue(a.id, v || null)
  await load()
}
async function remove(a: Assignment) {
  const c = courseById.value.get(a.course_id)
  if (!window.confirm(`Remove "${c?.title}" from ${props.name}?\n\nTheir progress is kept.`)) return
  await removeAssignment(a.id)
  await logActivity(auth.profile?.id, `Unassigned "${c?.title}" from ${props.name}`)
  await load()
}
</script>

<template>
  <div class="card" style="padding: 18px; margin-bottom: 20px">
    <div class="panel-title"><h3>Assigned courses</h3></div>
    <p v-if="missing" class="hint" style="color: var(--danger)">Run <code>supabase/v5.sql</code> in Supabase to turn on course assignments.</p>
    <template v-else>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Course</th><th>Audience</th><th>Deadline</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr v-for="a in rows" :key="a.id">
              <td>
                <span class="dot" :style="{ background: colors[courseById.get(a.course_id)?.category ?? ''] ?? '#888' }" />
                <b>{{ courseById.get(a.course_id)?.title ?? 'Course removed' }}</b>
              </td>
              <td>{{ courseById.get(a.course_id)?.category }}</td>
              <td><input type="date" style="width: 160px" :value="a.due_date ?? ''" @change="changeDue(a, ($event.target as HTMLInputElement).value)" /></td>
              <td><span :class="['pill', status(a).cls]">{{ status(a).text }}</span></td>
              <td style="text-align: right"><button class="btn btn-ghost btn-sm" style="color: var(--danger)" @click="remove(a)">Remove</button></td>
            </tr>
          </tbody>
        </table>
        <p v-if="!rows.length" class="hint" style="padding: 14px; text-align: center">No assigned courses.</p>
      </div>
      <div class="row" style="margin-top: 12px; flex-wrap: wrap">
        <select v-model="addId" style="flex: 1; min-width: 220px">
          <option value="">Assign a course (any department)…</option>
          <option v-for="c in assignable" :key="c.id" :value="c.id">{{ c.title }} · {{ c.category }}</option>
        </select>
        <input v-model="addDue" type="date" style="width: 160px" />
        <button class="btn btn-primary btn-sm" :disabled="!addId || busy" @click="add">Assign</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: -1px;
}
</style>
