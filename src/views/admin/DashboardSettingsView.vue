<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useWidgetsStore } from '@/stores/widgets'
import { logActivity } from '@/lib/activity'
import { WIDGETS, type WidgetRole } from '@/lib/widgets'

const auth = useAuthStore()
const store = useWidgetsStore()
const error = ref('')
const roles: WidgetRole[] = ['Employee', 'Manager', 'Admin']
const roleColor: Record<WidgetRole, string> = { Employee: 'var(--blue)', Manager: '#0f7f6c', Admin: '#b4530f' }

onMounted(() => {
  if (!store.loaded) void store.load()
})

function widgetsFor(role: WidgetRole) {
  return WIDGETS.filter((w) => w.role === role)
}
function visibleCount(role: WidgetRole) {
  return widgetsFor(role).filter((w) => store.isVisible(w.id)).length
}

async function toggle(id: string, name: string, role: string) {
  error.value = ''
  const visible = !store.isVisible(id)
  const err = await store.setVisible(id, visible)
  if (err) error.value = err
  else await logActivity(auth.profile?.id, `${visible ? 'Showed' : 'Hid'} the "${role} · ${name}" widget`)
}

async function setAll(role: WidgetRole, visible: boolean) {
  error.value = ''
  const err = await store.setRole(role, visible)
  if (err) error.value = err
  else await logActivity(auth.profile?.id, `${visible ? 'Showed' : 'Hid'} all ${role} widgets`)
}

async function reset() {
  error.value = ''
  const err = await store.resetAll()
  if (err) error.value = err
  else await logActivity(auth.profile?.id, 'Reset all dashboard widgets to their defaults')
}
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <h2>Dashboard settings</h2>
        <p>Choose which widgets each role sees. Admin only.</p>
      </div>
    </div>

    <div v-if="store.tableMissing" class="card" style="padding: 20px; max-width: 640px; margin-bottom: 16px">
      <h3 style="font-size: 18px; margin-bottom: 6px">One-time setup needed</h3>
      <p class="hint" style="font-size: 13.5px; margin-top: 0">
        Saving these choices needs a small database table. In Supabase → SQL Editor, run the contents of
        <code>supabase/revamp-v4.sql</code> (safe to run more than once), then refresh this page. Until then every widget stays visible.
      </p>
    </div>

    <div class="note">
      Each widget is named after the role that sees it. Switch one off and it disappears from that role's screens straight away —
      nothing is deleted, and you can switch it back on any time. Changes apply to everyone with that role. This page always stays visible, so you can't lock yourself out.
    </div>

    <div class="row wrap" style="margin: 16px 0; gap: 12px">
      <label class="row" style="gap: 10px; cursor: pointer; margin: 0">
        <button class="sw" :class="{ on: store.labels }" @click="store.labels = !store.labels" />
        <b>Label widgets on screen</b>
        <span class="sub">(shows “Role · Name” on each widget so you can see what to hide)</span>
      </label>
      <button class="btn btn-ghost btn-sm sp" @click="reset">Reset to defaults</button>
    </div>
    <p v-if="error" class="hint" style="color: var(--danger); margin-bottom: 10px">{{ error }}</p>

    <div v-for="role in roles" :key="role" class="card" style="padding: 18px; margin-bottom: 16px">
      <div class="row wrap" style="margin-bottom: 6px">
        <span class="role-chip" :style="{ background: roleColor[role] }">{{ role }}</span>
        <h3 style="font-size: 18px">{{ role }} dashboards</h3>
        <span class="sub">{{ visibleCount(role) }} of {{ widgetsFor(role).length }} visible</span>
        <span class="sp" />
        <button class="btn btn-ghost btn-sm" @click="setAll(role, true)">Show all</button>
        <button class="btn btn-ghost btn-sm" @click="setAll(role, false)">Hide all</button>
      </div>
      <div v-for="w in widgetsFor(role)" :key="w.id" class="wrow">
        <div class="grow">
          <b>{{ role }} · {{ w.name }}</b>
          <div class="sub">{{ w.description }}</div>
        </div>
        <span class="pill pill-muted">{{ w.where }}</span>
        <button
          class="sw"
          :class="{ on: store.isVisible(w.id) }"
          :title="store.isVisible(w.id) ? 'Visible — click to hide' : 'Hidden — click to show'"
          @click="toggle(w.id, w.name, role)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.note {
  background: var(--blue-soft);
  color: var(--blue);
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 12.5px;
  font-weight: 600;
}
.role-chip {
  padding: 3px 11px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 800;
  color: #fff;
}
.wrow {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 12px 0;
  border-top: 1px solid var(--border);
}
.sw {
  width: 46px;
  height: 26px;
  border-radius: 99px;
  background: var(--border);
  position: relative;
  border: 0;
  flex: none;
  cursor: pointer;
}
.sw::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
.sw.on {
  background: var(--teal);
}
.sw.on::after {
  left: 23px;
}
</style>
