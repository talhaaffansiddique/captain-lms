<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { isActive } from '@/lib/employees'
import { useAuthStore } from '@/stores/auth'
import { logActivity } from '@/lib/activity'
import type { ActivityLogEntry } from '@/lib/database.types'

const auth = useAuthStore()
const employeeCount = ref(0)
const moduleCount = ref(0)
const activity = ref<ActivityLogEntry[]>([])
const announcementText = ref('')
const postingAnnouncement = ref(false)

interface DeptSummary {
  department: string
  completions: number
  quizPasses: number
  overdue: { name: string; dueDate: string }[]
}
const digestSummaries = ref<DeptSummary[] | null>(null)
const loadingDigest = ref(false)
const digestError = ref('')

async function load() {
  const [{ data: profs }, { count: mc }, { data: act }] = await Promise.all([
    supabase.from('profiles').select('*'),
    supabase.from('modules').select('*', { count: 'exact', head: true }).eq('is_draft', false),
    supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(8),
  ])
  employeeCount.value = (profs ?? []).filter(isActive).length
  moduleCount.value = mc ?? 0
  activity.value = act ?? []
}

onMounted(load)

async function postAnnouncement() {
  if (!announcementText.value.trim() || !auth.profile) return
  postingAnnouncement.value = true
  await supabase.from('announcements').insert({ text: announcementText.value.trim(), created_by: auth.profile.id })
  await logActivity(auth.profile.id, `Posted an announcement: "${announcementText.value.trim()}"`)
  announcementText.value = ''
  postingAnnouncement.value = false
  await load()
}

async function previewDigest() {
  loadingDigest.value = true
  digestError.value = ''
  digestSummaries.value = null
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  try {
    const res = await fetch('/.netlify/functions/weekly-digest-preview', {
      headers: { authorization: `Bearer ${token}` },
    })
    const body = await res.json()
    if (!res.ok) digestError.value = body.error ?? 'Could not load preview'
    else digestSummaries.value = body.summaries
  } catch {
    digestError.value = 'Could not reach the preview service.'
  }
  loadingDigest.value = false
}
</script>

<template>
  <div>
    <div class="topline">
      <div><h2>Overview</h2></div>
    </div>
    <div class="stat-row" style="max-width: 460px; grid-template-columns: repeat(2, 1fr)">
      <div class="card stat">
        <div class="lbl">Accounts</div>
        <div class="val">{{ employeeCount }}</div>
      </div>
      <div class="card stat">
        <div class="lbl">Published modules</div>
        <div class="val">{{ moduleCount }}</div>
      </div>
    </div>

    <div class="card" style="padding: 18px; margin: 20px 0; max-width: 460px">
      <div class="panel-title"><h3>Post an announcement</h3></div>
      <p class="hint" style="margin-bottom: 8px">Shows as a dismissible banner on every employee's dashboard.</p>
      <textarea v-model="announcementText" rows="3" style="width: 100%" placeholder="e.g. New compliance training due by end of month." />
      <button class="btn btn-primary btn-sm" style="margin-top: 8px" :disabled="postingAnnouncement || !announcementText.trim()" @click="postAnnouncement">
        {{ postingAnnouncement ? 'Posting…' : 'Post announcement' }}
      </button>
    </div>

    <div class="card" style="padding: 18px; margin-bottom: 20px; max-width: 460px">
      <div class="panel-title"><h3>Weekly digest</h3></div>
      <p class="hint" style="margin-bottom: 8px">
        A real digest emails automatically every Monday once Resend is configured — preview what it would say right now.
      </p>
      <button class="btn btn-ghost btn-sm" :disabled="loadingDigest" @click="previewDigest">
        {{ loadingDigest ? 'Loading…' : 'Preview weekly digest' }}
      </button>
      <p v-if="digestError" class="hint" style="color: var(--danger); margin-top: 8px">{{ digestError }}</p>
      <div v-if="digestSummaries" style="margin-top: 12px">
        <div v-for="s in digestSummaries" :key="s.department" style="margin-bottom: 12px">
          <div style="font-weight: 700">{{ s.department }}</div>
          <div style="font-size: 13px; color: var(--ink-soft)">
            ✅ {{ s.completions }} module completion(s) this week · 🎖️ {{ s.quizPasses }} quiz pass(es) this week
          </div>
          <div v-if="s.overdue.length" style="font-size: 13px; color: var(--danger)">
            ⚠️ Overdue: {{ s.overdue.map((o) => `${o.name} (since ${o.dueDate})`).join(', ') }}
          </div>
          <div v-else style="font-size: 13px; color: var(--teal)">No one overdue</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="panel-title"><h3>Recent activity</h3></div>
      <div v-for="a in activity" :key="a.id" class="row-item" style="cursor: default">
        <div class="row-info">
          <div class="t">{{ a.text }}</div>
          <div class="m">{{ new Date(a.created_at).toLocaleString() }}</div>
        </div>
      </div>
      <p v-if="!activity.length" style="padding: 24px; text-align: center; color: var(--ink-soft)">No activity yet.</p>
    </div>
  </div>
</template>
