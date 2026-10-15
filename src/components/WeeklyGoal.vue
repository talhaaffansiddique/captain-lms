<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { loadStudyLog, weekSeconds, streakFromDays, hoursLabel, WEEKLY_GOAL_HOURS } from '@/lib/learning'
import DashWidget from '@/components/DashWidget.vue'

const auth = useAuthStore()
const seconds = ref(0)
const streak = ref(0)

onMounted(async () => {
  if (!auth.profile) return
  const rows = await loadStudyLog(auth.profile.id)
  seconds.value = weekSeconds(rows)
  streak.value = streakFromDays(new Set(rows.filter((r) => r.seconds > 0).map((r) => r.day))).current
})

const pct = computed(() => Math.min(100, Math.round((seconds.value / (WEEKLY_GOAL_HOURS * 3600)) * 100)))
const remaining = computed(() => Math.max(0, WEEKLY_GOAL_HOURS - seconds.value / 3600))
</script>

<template>
  <DashWidget id="emp.goal">
    <div class="goal">
      <b class="top"><span>Weekly goal</span><span>{{ hoursLabel(seconds) }} of {{ WEEKLY_GOAL_HOURS }} hrs</span></b>
      <div class="bar"><i :style="{ width: pct + '%' }" /></div>
      <span v-if="remaining > 0">
        {{ hoursLabel(remaining * 3600) }} more {{ remaining === 1 ? 'hour' : 'hours' }} this week<template v-if="streak > 1"> to keep your {{ streak }}-day streak</template>.
      </span>
      <span v-else>Goal reached this week. 🎉</span>
    </div>
  </DashWidget>
</template>

<style scoped>
.goal {
  margin: auto 0 12px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 14px;
  color: #fff;
  font-size: 12.5px;
}
.top {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}
.bar {
  background: rgba(255, 255, 255, 0.14);
  margin: 8px 0;
}
.bar > i {
  background: var(--brass);
}
</style>
