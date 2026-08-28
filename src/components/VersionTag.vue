<script setup lang="ts">
import { APP_VERSION } from '@/lib/version'
</script>

<template>
  <span class="version-tag" title="Captain LMS version">{{ APP_VERSION }}</span>
</template>

<style scoped>
.version-tag {
  flex: none;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--surface-sunken);
  color: var(--ink-soft);
  border: 1px solid var(--border);
  font: 600 10px 'IBM Plex Mono', monospace;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
</style>
