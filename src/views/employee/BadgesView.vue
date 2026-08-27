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
    <div class="topline">
      <div>
        <h2>My Badges</h2>
        <p>Earned by passing each milestone quiz.</p>
      </div>
    </div>
    <div class="badge-grid">
      <div v-for="t in BADGE_TIERS" :key="t.m" :class="['card', 'badge-tile', { locked: !passedMilestones.has(t.m) }]">
        <div class="badge-medal">{{ t.icon }}</div>
        <div class="bname">{{ t.name }}</div>
      </div>
      <div :class="['card', 'badge-tile', { locked: !passedMilestones.has('final') }]">
        <div class="badge-medal">🏆</div>
        <div class="bname">Captain Master</div>
      </div>
    </div>
  </div>
</template>
