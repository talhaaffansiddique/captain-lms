<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const BADGE_TIERS = [
  { m: '1', icon: '🥉', name: 'Bronze' },
  { m: '2', icon: '🥈', name: 'Silver' },
  { m: '3', icon: '🥇', name: 'Gold' },
  { m: '4', icon: '💎', name: 'Diamond' },
  { m: '5', icon: '💎', name: 'Diamond II' },
]

const auth = useAuthStore()
const passedMilestones = ref<Set<string>>(new Set())

onMounted(async () => {
  if (!auth.profile) return
  const { data } = await supabase
    .from('quiz_attempts')
    .select('milestone, passed')
    .eq('user_id', auth.profile.id)
    .eq('passed', true)
  passedMilestones.value = new Set((data ?? []).map((r) => r.milestone))
})
</script>

<template>
  <div>
    <h2 style="font-size: 23px; margin-bottom: 16px">My Badges</h2>
    <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px">
      <div
        v-for="t in BADGE_TIERS"
        :key="t.m"
        class="card"
        :style="{ padding: '18px 10px', textAlign: 'center', opacity: passedMilestones.has(t.m) ? 1 : 0.4 }"
      >
        <div style="font-size: 24px; margin-bottom: 6px">{{ t.icon }}</div>
        <div style="font: 600 12.5px 'Public Sans'">{{ t.name }}</div>
      </div>
      <div
        class="card"
        :style="{ padding: '18px 10px', textAlign: 'center', opacity: passedMilestones.has('final') ? 1 : 0.4 }"
      >
        <div style="font-size: 24px; margin-bottom: 6px">🏆</div>
        <div style="font: 600 12.5px 'Public Sans'">Captain Master</div>
      </div>
    </div>
  </div>
</template>
