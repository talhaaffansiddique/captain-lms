<script setup lang="ts">
withDefaults(defineProps<{ title: string; wide?: boolean }>(), { wide: false })
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="emit('close')">
      <div class="modal" :class="{ 'modal-wide': wide }">
        <div class="modal-head">
          <h3 style="font-size: 17px">{{ title }}</h3>
          <button class="modal-close" @click="emit('close')">✕</button>
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>
