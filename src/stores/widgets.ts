import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { WIDGETS, type WidgetRole } from '@/lib/widgets'

export const useWidgetsStore = defineStore('widgets', () => {
  // Only widgets an admin has switched OFF are stored as `true` here; everything else is visible,
  // so the app works unchanged before the dashboard_widgets table exists.
  const hidden = ref<Record<string, boolean>>({})
  const loaded = ref(false)
  const tableMissing = ref(false)
  const labels = ref(false)

  async function load() {
    const { data, error } = await supabase.from('dashboard_widgets').select('widget_id, visible')
    if (error) {
      tableMissing.value = true
      loaded.value = true
      return
    }
    const next: Record<string, boolean> = {}
    for (const row of (data ?? []) as { widget_id: string; visible: boolean }[]) if (!row.visible) next[row.widget_id] = true
    hidden.value = next
    tableMissing.value = false
    loaded.value = true
  }

  function isVisible(id: string): boolean {
    return !hidden.value[id]
  }

  async function setVisible(id: string, visible: boolean): Promise<string | null> {
    const { error } = await supabase
      .from('dashboard_widgets')
      .upsert({ widget_id: id, visible, updated_at: new Date().toISOString() }, { onConflict: 'widget_id' })
    if (error) return error.message
    if (visible) delete hidden.value[id]
    else hidden.value[id] = true
    hidden.value = { ...hidden.value }
    return null
  }

  async function setRole(role: WidgetRole, visible: boolean): Promise<string | null> {
    const ids = WIDGETS.filter((w) => w.role === role).map((w) => w.id)
    const { error } = await supabase
      .from('dashboard_widgets')
      .upsert(ids.map((id) => ({ widget_id: id, visible, updated_at: new Date().toISOString() })), { onConflict: 'widget_id' })
    if (error) return error.message
    const next = { ...hidden.value }
    for (const id of ids) {
      if (visible) delete next[id]
      else next[id] = true
    }
    hidden.value = next
    return null
  }

  async function resetAll(): Promise<string | null> {
    const { error } = await supabase.from('dashboard_widgets').delete().neq('widget_id', '')
    if (error) return error.message
    hidden.value = {}
    return null
  }

  return { hidden, loaded, tableMissing, labels, load, isVisible, setVisible, setRole, resetAll }
})
