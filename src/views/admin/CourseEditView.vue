<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { logActivity } from '@/lib/activity'
import { loadDepartments, loadAudienceColors } from '@/lib/departments'
import { sortedLessons } from '@/lib/courses'
import { loadAssignments, setAssignmentDue, removeAssignment, daysUntil, type Assignment } from '@/lib/assignments'
import { isActive } from '@/lib/employees'
import AssignCourseModal from '@/components/AssignCourseModal.vue'
import { materialType, formatDuration } from '@/lib/materials'
import type { Course, Module, Profile, VideoCompletion } from '@/lib/database.types'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const courseId = Number(route.params.id)

const course = ref<Course | null>(null)
const lessons = ref<Module[]>([])
const available = ref<Module[]>([])
const categories = ref<string[]>(['General'])
const loading = ref(true)

const title = ref('')
const category = ref('General')
const description = ref('')
const audienceColors = ref<Record<string, string>>({})
const assigned = ref<Assignment[]>([])
const people = ref<Profile[]>([])
const doneByUser = ref<Record<string, number>>({})
const assignMissing = ref(false)
const showAssign = ref(false)
const published = ref(true)
const saving = ref(false)
const saved = ref(false)
const addId = ref<number | ''>('')

async function load() {
  const [{ data: c }, { data: mods }, depts] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).single(),
    supabase.from('modules').select('*').order('id'),
    loadDepartments(),
  ])
  course.value = (c as Course | null) ?? null
  const all = (mods ?? []) as Module[]
  lessons.value = sortedLessons(all.filter((m) => m.course_id === courseId))
  available.value = all.filter((m) => m.course_id !== courseId)
  categories.value = ['General', ...depts.map((d) => d.name)]
  if (course.value) {
    title.value = course.value.title
    category.value = course.value.category
    description.value = course.value.description ?? ''
    published.value = course.value.is_published
  }
  audienceColors.value = await loadAudienceColors()
  await loadAssigned()
  loading.value = false
}

async function loadAssigned() {
  const [asg, { data: profs }] = await Promise.all([loadAssignments({ courseId }), supabase.from('profiles').select('*')])
  assignMissing.value = asg.missing
  assigned.value = asg.rows
  people.value = ((profs ?? []) as Profile[]).filter(isActive)
  const lessonIds = lessons.value.map((l) => l.id)
  const done: Record<string, number> = {}
  if (asg.rows.length && lessonIds.length) {
    const { data: comps } = await supabase
      .from('video_completions')
      .select('user_id, module_id, completed')
      .in('module_id', lessonIds)
      .eq('completed', true)
      .in('user_id', asg.rows.map((r) => r.user_id))
    for (const c of (comps ?? []) as Pick<VideoCompletion, 'user_id'>[]) done[c.user_id] = (done[c.user_id] ?? 0) + 1
  }
  doneByUser.value = done
}

const personById = computed(() => new Map(people.value.map((p) => [p.id, p])))
function statusOf(a: Assignment): { text: string; cls: string } {
  const total = lessons.value.length
  const d = doneByUser.value[a.user_id] ?? 0
  if (total && d >= total) return { text: 'Completed', cls: 'pill-teal' }
  const left = daysUntil(a.due_date)
  if (left !== null && left < 0) return { text: 'Overdue', cls: 'pill-danger' }
  return d > 0 ? { text: `In progress · ${d}/${total}`, cls: 'pill-outline' } : { text: 'Not started', cls: 'pill-muted' }
}
async function changeDue(a: Assignment, value: string) {
  await setAssignmentDue(a.id, value || null)
  await loadAssigned()
}
async function unassign(a: Assignment) {
  const who = personById.value.get(a.user_id)?.full_name ?? 'this employee'
  if (!window.confirm(`Remove ${who} from this course?\n\nTheir progress is kept; the course just stops being assigned to them.`)) return
  await removeAssignment(a.id)
  await logActivity(auth.profile?.id, `Unassigned "${course.value?.title}" from ${who}`)
  await loadAssigned()
}

onMounted(load)

async function saveDetails() {
  if (!title.value.trim()) return
  saving.value = true
  saved.value = false
  await supabase
    .from('courses')
    .update({ title: title.value.trim(), category: category.value, description: description.value.trim() || null, is_published: published.value })
    .eq('id', courseId)
  await logActivity(auth.profile?.id, `Updated course "${title.value.trim()}"`)
  saving.value = false
  saved.value = true
  await load()
}

async function addLesson() {
  if (!addId.value) return
  const nextOrder = (lessons.value[lessons.value.length - 1]?.lesson_order ?? 0) + 1
  await supabase.from('modules').update({ course_id: courseId, lesson_order: nextOrder }).eq('id', addId.value)
  addId.value = ''
  await load()
}

async function removeLesson(m: Module) {
  await supabase.from('modules').update({ course_id: null }).eq('id', m.id)
  await load()
}

// Renumber 1..n after a swap so ordering stays unambiguous even if some lessons shared a value.
async function move(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= lessons.value.length) return
  const order = [...lessons.value]
  const [item] = order.splice(index, 1)
  order.splice(target, 0, item!)
  await Promise.all(order.map((m, i) => supabase.from('modules').update({ lesson_order: i + 1 }).eq('id', m.id)))
  await load()
}

const assignable = computed(() => available.value)

async function deleteCourse() {
  if (!course.value) return
  if (!window.confirm(`Delete the course "${course.value.title}"?\n\nIts lessons are kept (they just stop belonging to a course).`)) return
  await supabase.from('courses').delete().eq('id', courseId)
  await logActivity(auth.profile?.id, `Deleted course "${course.value.title}"`)
  router.push('/admin/courses')
}
</script>

<template>
  <div v-if="loading" style="color: var(--ink-soft)">Loading…</div>
  <div v-else-if="course">
    <div class="topline">
      <div>
        <h2>{{ course.title }}</h2>
        <p>{{ course.category }} · {{ lessons.length }} lesson{{ lessons.length === 1 ? '' : 's' }}</p>
      </div>
      <div class="row">
        <button class="btn btn-ghost btn-sm" @click="router.push('/admin/courses')">Back to courses</button>
        <button class="btn btn-ghost btn-sm" style="color: var(--danger)" @click="deleteCourse">Delete</button>
      </div>
    </div>

    <div class="cols">
      <div class="card" style="padding: 18px">
        <div class="panel-title" style="padding: 0 0 8px"><h3>Details</h3></div>
        <div class="field"><label>Title</label><input v-model="title" type="text" /></div>
        <div class="field">
          <label>Category</label>
          <select v-model="category">
            <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <div class="field"><label>Description (optional)</label><textarea v-model="description" rows="3" /></div>
        <p class="hint" style="margin: 0 0 10px">
          <span class="dot" :style="{ background: audienceColors[category] ?? '#888' }" />
          Colour is inherited from the <b>{{ category }}</b> audience — change it in <RouterLink to="/admin/audiences">Audiences</RouterLink>.
        </p>
        <label class="row" style="gap: 8px; font-weight: 400"><input v-model="published" type="checkbox" style="width: auto" /> Published (visible in the catalog)</label>
        <div class="row" style="margin-top: 12px">
          <button class="btn btn-primary btn-sm" :disabled="saving" @click="saveDetails">{{ saving ? 'Saving…' : 'Save details' }}</button>
          <span v-if="saved" class="hint" style="color: var(--teal)">Saved.</span>
        </div>
      </div>

      <div class="card" style="padding: 18px">
        <div class="panel-title" style="padding: 0 0 8px"><h3>Lessons</h3></div>
        <p class="hint" style="margin: 0 0 10px">Learners see these in this order. Use the arrows to reorder.</p>
        <div v-for="(m, i) in lessons" :key="m.id" class="lesson-row">
          <span class="num">{{ i + 1 }}</span>
          <div class="grow">
            <RouterLink :to="`/admin/modules/${m.id}`" style="font-weight: 700; text-decoration: none">{{ m.title }}</RouterLink>
            <div class="sub">{{ materialType(m) }} · {{ formatDuration(m) }}{{ m.is_draft ? ' · Draft' : '' }}</div>
          </div>
          <button class="btn btn-ghost btn-sm" :disabled="i === 0" @click="move(i, -1)">↑</button>
          <button class="btn btn-ghost btn-sm" :disabled="i === lessons.length - 1" @click="move(i, 1)">↓</button>
          <button class="btn btn-ghost btn-sm" @click="removeLesson(m)">Remove</button>
        </div>
        <p v-if="!lessons.length" class="hint">No lessons yet — add one below.</p>
        <div class="row" style="margin-top: 14px">
          <select v-model="addId" style="flex: 1">
            <option value="">Add a lesson (module)…</option>
            <option v-for="m in assignable" :key="m.id" :value="m.id">{{ m.title }} · {{ m.department }}{{ m.course_id ? ' (in another course)' : '' }}</option>
          </select>
          <button class="btn btn-primary btn-sm" :disabled="!addId" @click="addLesson">Add</button>
        </div>
      </div>
    </div>

    <div class="card" style="padding: 18px; margin-top: 18px">
      <div class="panel-title" style="padding: 0 0 8px">
        <h3>Assigned employees</h3>
        <button class="btn btn-primary btn-sm" :disabled="assignMissing" @click="showAssign = true">+ Assign employees</button>
      </div>
      <p v-if="assignMissing" class="hint" style="color: var(--danger)">Run <code>supabase/v5.sql</code> in Supabase to turn on course assignments.</p>
      <div v-else class="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Department</th><th>Deadline</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr v-for="a in assigned" :key="a.id">
              <td><b>{{ personById.get(a.user_id)?.full_name ?? 'Unknown' }}</b></td>
              <td>
                {{ personById.get(a.user_id)?.department }}
                <span v-if="personById.get(a.user_id)?.department !== course.category && course.category !== 'General'" class="pill pill-brass" style="margin-left: 4px">other department</span>
              </td>
              <td><input type="date" style="width: 160px" :value="a.due_date ?? ''" @change="changeDue(a, ($event.target as HTMLInputElement).value)" /></td>
              <td><span :class="['pill', statusOf(a).cls]">{{ statusOf(a).text }}</span></td>
              <td style="text-align: right"><button class="btn btn-ghost btn-sm" style="color: var(--danger)" @click="unassign(a)">Remove</button></td>
            </tr>
          </tbody>
        </table>
        <p v-if="!assigned.length" class="hint" style="padding: 16px; text-align: center">Nobody is assigned yet.</p>
      </div>
    </div>
    <AssignCourseModal v-if="showAssign" :course-id="courseId" :course-title="course.title" @close="showAssign = false" @done="loadAssigned" />
  </div>
  <div v-else class="hint">Course not found.</div>
</template>

<style scoped>
.dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  vertical-align: -1px;
}
.cols {
  display: grid;
  grid-template-columns: 1fr 1.3fr;
  gap: 18px;
  align-items: start;
}
@media (max-width: 980px) {
  .cols {
    grid-template-columns: 1fr;
  }
}
.swatch {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 3px solid transparent;
  cursor: pointer;
}
.swatch.on {
  border-color: var(--ink);
}
.lesson-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid var(--border);
}
.num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 12.5px;
  background: var(--surface-sunken);
  flex: none;
}
</style>
