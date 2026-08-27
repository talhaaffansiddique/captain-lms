<script setup lang="ts">
import { APP_VERSION } from '@/lib/version'
</script>

<template>
  <div class="version-badge" title="Captain LMS version">{{ APP_VERSION }}</div>
</template>

<style scoped>
.version-badge {
  position: fixed;
  top: 10px;
  right: 12px;
  z-index: 200;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--surface);
  color: var(--ink-soft);
  border: 1px solid var(--border);
  font: 600 11px 'IBM Plex Mono', monospace;
  letter-spacing: 0.02em;
  box-shadow: var(--shadow);
  pointer-events: none;
}
@media (max-width: 760px) {
  .version-badge {
    top: auto;
    bottom: calc(64px + env(safe-area-inset-bottom, 0px));
    right: 10px;
  }
}
</style>
