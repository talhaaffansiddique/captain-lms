<script setup lang="ts">
import { computed } from 'vue'
import { useWidgetsStore } from '@/stores/widgets'
import { WIDGET_BY_ID } from '@/lib/widgets'

// Wraps one dashboard widget: renders nothing when an admin has hidden it, and (when "Label
// widgets" is on in Dashboard settings) shows a "Role · Name" tag so admins can see what to hide.
const props = defineProps<{ id: string }>()
const store = useWidgetsStore()
const def = computed(() => WIDGET_BY_ID[props.id])
</script>

<template>
  <div v-if="store.isVisible(id)" class="dash-widget">
    <span v-if="store.labels && def" class="widget-tag">{{ def.role }} · {{ def.name }}</span>
    <slot />
  </div>
</template>

<style scoped>
.dash-widget {
  position: relative;
}
.widget-tag {
  position: absolute;
  top: -9px;
  left: 14px;
  z-index: 5;
  background: var(--ink);
  color: var(--paper);
  font-size: 10.5px;
  font-weight: 800;
  padding: 2px 9px;
  border-radius: 99px;
}
</style>
