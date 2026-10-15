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
        <h2>Certificates & badges</h2>
        <p>Earned by passing each milestone quiz — click an unlocked badge to view its certificate.</p>
      </div>
    </div>
    <div class="badge-grid">
      <template v-for="t in BADGE_TIERS" :key="t.m">
        <RouterLink v-if="passedMilestones.has(t.m)" :to="`/app/certificate/${t.m}`" class="card badge-tile" style="cursor: pointer">
          <div class="badge-medal">{{ t.icon }}</div>
          <div class="bname">{{ t.name }}</div>
        </RouterLink>
        <div v-else class="card badge-tile locked">
          <div class="badge-medal">{{ t.icon }}</div>
          <div class="bname">{{ t.name }}</div>
        </div>
      </template>
      <RouterLink v-if="passedMilestones.has('final')" to="/app/certificate/final" class="card badge-tile" style="cursor: pointer">
        <div class="badge-medal">🏆</div>
        <div class="bname">Captain Master</div>
      </RouterLink>
      <div v-else class="card badge-tile locked">
        <div class="badge-medal">🏆</div>
        <div class="bname">Captain Master</div>
      </div>
    </div>
  </div>
</template>
