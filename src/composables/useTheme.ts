import { ref } from 'vue'

type ThemeChoice = 'light' | 'dark' | 'system'

const THEME_ICON: Record<ThemeChoice, string> = { light: '☀️', dark: '🌑', system: '🖥️' }

const currentTheme = ref<ThemeChoice>((localStorage.getItem('theme') as ThemeChoice) || 'system')

function apply(theme: ThemeChoice) {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}
apply(currentTheme.value)

function setTheme(theme: ThemeChoice) {
  currentTheme.value = theme
  localStorage.setItem('theme', theme)
  apply(theme)
}

function cycleTheme() {
  const order: ThemeChoice[] = ['light', 'dark', 'system']
  const next = order[(order.indexOf(currentTheme.value) + 1) % order.length] ?? 'system'
  setTheme(next)
}

export function useTheme() {
  return { currentTheme, setTheme, cycleTheme, THEME_ICON }
}
