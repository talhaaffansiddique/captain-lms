<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { loadCourses, courseProgress, courseCode, formatCourseTime, type CourseVM } from '@/lib/courses'
import type { Module, VideoCompletion } from '@/lib/database.types'

const auth = useAuthStore()
const router = useRouter()
const courses = ref<CourseVM[]>([])
const completions = ref<VideoCompletion[]>([])
const loading = ref(true)
const search = ref('')
const category = ref('All')

onMounted(async () => {
  const dept = auth.profile?.department
  const userId = auth.profile?.id
  if (!dept || !userId) return
  const [{ data: mods }, { data: comps }] = await Promise.all([
    supabase.from('modules').select('*').or(`department.eq.General,department.eq.${dept}`).order('id'),
    supabase.from('video_completions').select('*').eq('user_id', userId),
  ])
  completions.value = (comps ?? []) as VideoCompletion[]
  courses.value = (await loadCourses((mods ?? []) as Module[])).filter((c) => c.lessons.length > 0)
  loading.value = false
})

const categories = computed(() => ['All', ...new Set(courses.value.map((c) => c.category))])

const shown = computed(() => {
  const q = search.value.trim().toLowerCase()
  return courses.value.filter(
    (c) => (category.value === 'All' || c.category === category.value) && (!q || `${c.title} ${c.category}`.toLowerCase().includes(q)),
  )
})

function open(c: CourseVM) {
  const p = courseProgress(c, completions.value)
  const lesson = p.nextLesson ?? c.lessons[0]
  if (lesson) router.push(`/app/modules/${lesson.id}`)
}

function statusText(pct: number, status: string) {
  return status === 'completed' ? 'Completed' : status === 'not-started' ? 'Not started' : `${pct}%`
}
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <h2>Course catalog</h2>
        <p>Every course, document and video published for you.</p>
      </div>
    </div>

    <div class="row wrap" style="margin-bottom: 14px">
      <input v-model="search" type="text" placeholder="Search by course name… try “ERP”" style="flex: 1; min-width: 220px" />
      <div class="row wrap" style="gap: 8px">
        <button v-for="c in categories" :key="c" class="chip-btn" :class="{ on: category === c }" @click="category = c">{{ c }}</button>
      </div>
    </div>

    <p class="sub" style="margin-bottom: 12px">{{ loading ? 'Loading…' : `${shown.length} course${shown.length === 1 ? '' : 's'}` }}</p>

    <div class="course-grid">
      <button v-for="c in shown" :key="c.id" class="card course-card" @click="open(c)">
        <div class="cover" :style="{ background: c.color }">
          <span class="cat">{{ c.category }}</span>
          <b>{{ courseCode(c.title) }}</b>
        </div>
        <div class="body">
          <h3>{{ c.title }}</h3>
          <div class="meta">
            <span>▶ {{ courseProgress(c, completions).videos }} videos</span>
            <span>📄 {{ courseProgress(c, completions).docs }} docs</span>
            <span>{{ formatCourseTime(courseProgress(c, completions).minutes) }}</span>
          </div>
          <div class="row">
            <div class="bar"><i :style="{ width: courseProgress(c, completions).pct + '%', background: c.color }" /></div>
            <b style="font-size: 12.5px; white-space: nowrap">{{ statusText(courseProgress(c, completions).pct, courseProgress(c, completions).status) }}</b>
          </div>
        </div>
      </button>
    </div>
    <div v-if="!loading && !shown.length" class="card" style="padding: 24px; text-align: center; color: var(--ink-soft)">
      No courses match. Try another word or category.
    </div>
  </div>
</template>

<style scoped>
.course-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 18px;
}
.course-card {
  text-align: left;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition: transform 0.15s;
}
.course-card:hover {
  transform: translateY(-3px);
}
.cover {
  height: 120px;
  position: relative;
  color: #fff;
  padding: 14px;
  overflow: hidden;
}
.cover::before {
  content: '';
  position: absolute;
  width: 190px;
  height: 190px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  right: -60px;
  top: -30px;
}
.cat {
  position: relative;
  background: #fff;
  color: #0f1a2e;
  border-radius: 99px;
  padding: 3px 11px;
  font-size: 11.5px;
  font-weight: 700;
}
.cover b {
  position: absolute;
  left: 14px;
  bottom: 10px;
  font-size: 34px;
  font-weight: 800;
}
.body {
  padding: 14px 16px 16px;
}
.body h3 {
  font-size: 16px;
  margin-bottom: 6px;
}
.meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  color: var(--ink-soft);
  font-size: 12.5px;
  margin-bottom: 10px;
}
</style>
