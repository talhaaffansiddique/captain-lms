<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { NUMBERED_MILESTONES, milestoneLabel, attemptsFor, maxAttemptsFor, hasPassed, type Milestone } from '@/lib/quiz'
import type { Profile, QuizAttempt, QuizAttemptGrant } from '@/lib/database.types'

const MILESTONES: Milestone[] = [...NUMBERED_MILESTONES, 'final']

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const employeeId = route.params.id as string

const employee = ref<Profile | null>(null)
const attempts = ref<QuizAttempt[]>([])
const grants = ref<QuizAttemptGrant[]>([])
const loading = ref(true)
const granting = ref<string | null>(null)

async function load() {
  loading.value = true
  const [{ data: emp }, { data: att }, { data: grt }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', employeeId).single(),
    supabase.from('quiz_attempts').select('*').eq('user_id', employeeId),
    supabase.from('quiz_attempt_grants').select('*').eq('user_id', employeeId),
  ])
  employee.value = emp
  attempts.value = att ?? []
  grants.value = grt ?? []
  loading.value = false
}

onMounted(load)

const rows = computed(() =>
  MILESTONES.map((m) => {
    const used = attemptsFor(m, attempts.value)
    return {
      milestone: m,
      label: milestoneLabel(m),
      used: used.length,
      max: maxAttemptsFor(m, grants.value),
      passed: hasPassed(m, attempts.value),
    }
  }),
)

async function grantExtra(milestone: string) {
  if (!auth.profile) return
  granting.value = milestone
  await supabase.from('quiz_attempt_grants').insert({
    user_id: employeeId,
    milestone,
    extra_attempts: 1,
    granted_by: auth.profile.id,
  })
  granting.value = null
  await load()
}
</script>

<template>
  <div v-if="loading" style="color: var(--ink-soft)">Loading…</div>
  <div v-else-if="employee">
    <div class="topline">
      <div>
        <h2 style="font-size: 20px">{{ employee.full_name }}</h2>
        <p>{{ employee.department }} · {{ employee.role }}</p>
      </div>
      <button class="btn btn-ghost btn-sm" @click="router.push('/admin/employees')">Back to employees</button>
    </div>

    <div class="card">
      <div class="panel-title"><h3>Quiz attempts</h3></div>
      <div v-for="r in rows" :key="r.milestone" class="row-item" style="cursor: default">
        <div class="row-info">
          <div class="t">{{ r.label }}</div>
          <div class="m">
            {{ r.used }} of {{ r.max }} attempts used
            <span v-if="r.passed" class="pill pill-teal" style="margin-left: 6px">Passed</span>
            <span v-else-if="r.used >= r.max" class="pill pill-danger" style="margin-left: 6px">Locked</span>
          </div>
        </div>
        <button
          v-if="!r.passed && r.used >= r.max"
          class="btn btn-ghost btn-sm"
          :disabled="granting === r.milestone"
          @click="grantExtra(r.milestone)"
        >
          {{ granting === r.milestone ? 'Granting…' : 'Grant extra attempt' }}
        </button>
      </div>
    </div>
  </div>
</template>
