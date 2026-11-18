<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { daysUntil, dueLabel } from '@/lib/assignments'
import { loadKpiRaw } from '@/lib/kpi'
import type { Course, Profile } from '@/lib/database.types'

interface Row {
  name: string
  department: string
  course: string
  due: string | null
  days: number
  done: number
  total: number
}

const rows = ref<Row[]>([])
const missing = ref(false)
const loading = ref(true)
const filter = ref<'all' | 'overdue' | 'soon'>('all')

onMounted(async () => {
  const [raw, { data: profs }, { data: cs }] = await Promise.all([loadKpiRaw(), supabase.from('profiles').select('id, full_name, department'), supabase.from('courses').select('id, title')])
  if (!raw.assignments.length) {
    const probe = await supabase.from('course_assignments').select('id').limit(1)
    missing.value = !!probe.error
  }
  const people = new Map(((profs ?? []) as Pick<Profile, 'id' | 'full_name' | 'department'>[]).map((p) => [p.id, p]))
  const courses = new Map(((cs ?? []) as Pick<Course, 'id' | 'title'>[]).map((c) => [c.id, c.title]))
  const lessonsOf = new Map<number, number[]>()
  for (const m of raw.modules) if (m.course_id) lessonsOf.set(m.course_id, [...(lessonsOf.get(m.course_id) ?? []), m.id])
  const done = new Map<string, Set<number>>()
  for (const c of raw.completions) done.set(c.user_id, (done.get(c.user_id) ?? new Set()).add(c.module_id))
  const out: Row[] = []
  for (const a of raw.assignments) {
    const ls = lessonsOf.get(a.course_id) ?? []
    const d = ls.filter((l) => done.get(a.user_id)?.has(l)).length
    if (ls.length && d >= ls.length) continue
    const days = daysUntil(a.due_date)
    if (days === null || days > 7) continue
    const p = people.get(a.user_id)
    out.push({ name: p?.full_name ?? 'Unknown', department: p?.department ?? '', course: courses.get(a.course_id) ?? 'Course', due: a.due_date, days, done: d, total: ls.length })
  }
  rows.value = out.sort((x, y) => x.days - y.days)
  loading.value = false
})

const shown = computed(() => rows.value.filter((r) => filter.value === 'all' || (filter.value === 'overdue' ? r.days < 0 : r.days >= 0)))
const overdue = computed(() => rows.value.filter((r) => r.days < 0).length)
const soon = computed(() => rows.value.filter((r) => r.days >= 0).length)
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <p>HR · read-only</p>
        <h2>Compliance alerts</h2>
        <p>Overdue courses and deadlines in the next 7 days.</p>
      </div>
      <span class="pill pill-outline">👁 Read-only</span>
    </div>

    <div v-if="missing" class="card" style="padding: 16px; margin-bottom: 16px; border-left: 3px solid var(--brass)">
      <b>One-time setup needed.</b> Run <code>supabase/v5.sql</code> in the Supabase SQL Editor to turn on course assignments.
    </div>

    <div class="tiles">
      <div class="card stat"><div class="lbl">Overdue</div><div class="val" style="color: var(--danger)">{{ overdue }}</div></div>
      <div class="card stat"><div class="lbl">Due within 7 days</div><div class="val" style="color: var(--brass)">{{ soon }}</div></div>
      <div class="card stat"><div class="lbl">Employees affected</div><div class="val">{{ new Set(rows.map((r) => r.name)).size }}</div></div>
    </div>

    <div class="row" style="margin-bottom: 12px; gap: 8px">
      <button v-for="f in ([['all', 'All'], ['overdue', 'Overdue'], ['soon', 'Due soon']] as const)" :key="f[0]" class="chip-btn" :class="{ on: filter === f[0] }" @click="filter = f[0]">{{ f[1] }}</button>
    </div>

    <p v-if="loading" class="hint">Loading…</p>
    <div v-else class="card table-wrap">
      <table>
        <thead><tr><th>Employee</th><th>Department</th><th>Course</th><th>Deadline</th><th>Progress</th></tr></thead>
        <tbody>
          <tr v-for="(r, i) in shown" :key="i">
            <td><b>{{ r.name }}</b></td>
            <td>{{ r.department }}</td>
            <td>{{ r.course }}</td>
            <td><span class="pill" :class="r.days < 0 ? 'pill-danger' : 'pill-brass'">{{ dueLabel(r.due) }}</span></td>
            <td style="width: 150px"><div class="bar"><i :style="{ width: (r.total ? (r.done / r.total) * 100 : 0) + '%' }" /></div></td>
          </tr>
        </tbody>
      </table>
      <p v-if="!shown.length" class="hint" style="padding: 22px; text-align: center">Nothing needs attention right now. 🎉</p>
    </div>
  </div>
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 16px;
}
@media (max-width: 700px) {
  .tiles {
    grid-template-columns: 1fr;
  }
}
</style>
