<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { logActivity } from '@/lib/activity'
import { loadDepartments } from '@/lib/departments'
import { COURSE_COLORS, sortedLessons } from '@/lib/courses'
import { materialType, formatDuration } from '@/lib/materials'
import type { Course, Module } from '@/lib/database.types'

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
const color = ref(COURSE_COLORS[0]!)
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
    color.value = course.value.color
    published.value = course.value.is_published
  }
  loading.value = false
}

onMounted(load)

async function saveDetails() {
  if (!title.value.trim()) return
  saving.value = true
  saved.value = false
  await supabase
    .from('courses')
    .update({ title: title.value.trim(), category: category.value, description: description.value.trim() || null, color: color.value, is_published: published.value })
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
        <div class="field">
          <label>Colour</label>
          <div class="row wrap" style="gap: 8px">
            <button v-for="c in COURSE_COLORS" :key="c" class="swatch" :class="{ on: color === c }" :style="{ background: c }" :aria-label="c" @click="color = c" />
          </div>
        </div>
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
  </div>
  <div v-else class="hint">Course not found.</div>
</template>

<style scoped>
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
