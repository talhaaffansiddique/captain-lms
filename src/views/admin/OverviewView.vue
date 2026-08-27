<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { logActivity } from '@/lib/activity'
import type { ActivityLogEntry } from '@/lib/database.types'

const auth = useAuthStore()
const employeeCount = ref(0)
const moduleCount = ref(0)
const activity = ref<ActivityLogEntry[]>([])
const announcementText = ref('')
const postingAnnouncement = ref(false)

async function load() {
  const [{ count: ec }, { count: mc }, { data: act }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('modules').select('*', { count: 'exact', head: true }).eq('is_draft', false),
    supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(8),
  ])
  employeeCount.value = ec ?? 0
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
