<script setup lang="ts">
import { useTheme } from '@/composables/useTheme'

withDefaults(defineProps<{ variant?: 'mini' | 'icon'; surface?: boolean }>(), {
  variant: 'mini',
  surface: false,
})

const { currentTheme, setTheme, cycleTheme, THEME_ICON } = useTheme()
</script>

<template>
  <div v-if="variant === 'mini'" :class="['theme-mini', { 'on-surface': surface }]">
    <button type="button" :class="{ on: currentTheme === 'light' }" title="Light" @click="setTheme('light')">
      ☀️
    </button>
    <button type="button" :class="{ on: currentTheme === 'dark' }" title="Dark" @click="setTheme('dark')">🌑</button>
    <button type="button" :class="{ on: currentTheme === 'system' }" title="System" @click="setTheme('system')">
      🖥️
    </button>
  </div>
  <button v-else type="button" class="theme-cycle-btn" title="Toggle theme" @click="cycleTheme">
    {{ THEME_ICON[currentTheme] }}
  </button>
</template>
