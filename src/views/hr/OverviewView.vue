<script setup lang="ts">
import KpiCharts from '@/components/KpiCharts.vue'
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <p>HR · read-only</p>
        <h2>KPI analytics</h2>
        <p>Completion, compliance, quiz performance and learner activity across the organisation.</p>
      </div>
      <span class="pill pill-outline">👁 Read-only</span>
    </div>
    <KpiCharts />
  </div>
</template>
