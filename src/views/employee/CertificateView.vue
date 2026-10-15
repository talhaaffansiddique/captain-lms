<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { milestoneLabel, type Milestone } from '@/lib/quiz'

const BADGE_NAMES: Record<string, string> = {
  '1': 'Bronze',
  '2': 'Silver',
  '3': 'Gold',
  '4': 'Diamond',
  '5': 'Diamond II',
  final: 'Captain Master',
}

const route = useRoute()
const auth = useAuthStore()
const milestone = route.params.milestone as Milestone
const earnedAt = ref<string | null>(null)
const found = ref(false)

onMounted(async () => {
  if (!auth.profile) return
  const { data } = await supabase
    .from('quiz_attempts')
    .select('created_at')
    .eq('user_id', auth.profile.id)
    .eq('milestone', milestone)
    .eq('passed', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (data) {
    earnedAt.value = data.created_at
    found.value = true
  }
})

function formattedDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}
</script>

<template>
  <div>
    <div class="topline">
      <div><h2 style="font-size: 20px">Certificate</h2></div>
      <RouterLink class="btn btn-ghost btn-sm" to="/app/badges">Back to badges</RouterLink>
    </div>

    <div v-if="!found" class="card" style="padding: 24px; color: var(--ink-soft)">Certificate not found for this milestone.</div>

    <div v-else class="certificate">
      <div class="cert-inner">
        <div class="cert-medal">{{ milestone === 'final' ? '🏆' : '🎖️' }}</div>
        <div class="cert-kicker">Certificate of Completion</div>
        <h1 class="cert-name">{{ auth.profile?.full_name }}</h1>
        <p class="cert-body">has successfully passed the</p>
        <h2 class="cert-milestone">{{ milestoneLabel(milestone) }}</h2>
        <p class="cert-body">and earned the</p>
        <div class="cert-badge-name">{{ BADGE_NAMES[milestone] }} Badge</div>
        <div class="cert-date">{{ earnedAt ? formattedDate(earnedAt) : '' }}</div>
        <div class="cert-brand">CAPTAIN LMS</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.certificate {
  max-width: 640px;
  margin: 0 auto;
}
.cert-inner {
  background: var(--surface);
  border: 3px double var(--brass);
  border-radius: 14px;
  padding: 48px 32px;
  text-align: center;
  box-shadow: var(--shadow);
}
.cert-medal {
  font-size: 44px;
  margin-bottom: 8px;
}
.cert-kicker {
  font: 600 12px 'Plus Jakarta Sans';
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-soft);
  margin-bottom: 16px;
}
.cert-name {
  font-size: 32px;
  margin-bottom: 12px;
}
.cert-body {
  color: var(--ink-soft);
  font-size: 14px;
  margin-bottom: 4px;
}
.cert-milestone {
  font-size: 22px;
  margin: 8px 0;
  color: var(--brass-strong);
}
.cert-badge-name {
  display: inline-block;
  margin: 12px 0 20px;
  padding: 6px 18px;
  border-radius: 999px;
  background: var(--brass-soft);
  color: var(--brass-strong);
  font-weight: 700;
  font-size: 14px;
}
.cert-date {
  color: var(--ink-soft);
  font-size: 13px;
  margin-bottom: 24px;
}
.cert-brand {
  font: 700 13px 'IBM Plex Mono', monospace;
  letter-spacing: 0.1em;
  color: var(--ink-soft);
}
</style>
