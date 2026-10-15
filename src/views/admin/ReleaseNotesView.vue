<script setup lang="ts">
import { RELEASE_NOTES } from '@/lib/releaseNotes'
import { APP_VERSION } from '@/lib/version'

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <h2>Release notes</h2>
        <p>Every version of Captain LMS, newest first. Visible to admins only.</p>
      </div>
      <span class="pill pill-teal">Current: {{ APP_VERSION }}</span>
    </div>

    <div style="max-width: 760px">
      <div v-for="r in RELEASE_NOTES" :key="r.version" class="card" style="padding: 16px 18px; margin-bottom: 12px">
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px">
          <span class="pill" :class="r.version === APP_VERSION ? 'pill-teal' : 'pill-outline'">{{ r.version }}</span>
          <strong>{{ r.title }}</strong>
          <span style="margin-left: auto; color: var(--ink-soft); font-size: 12.5px">{{ formatDate(r.date) }}</span>
        </div>
        <ul style="margin: 0; padding-left: 18px; color: var(--ink-soft); font-size: 13.5px; line-height: 1.6">
          <li v-for="(c, i) in r.changes" :key="i">{{ c }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>
