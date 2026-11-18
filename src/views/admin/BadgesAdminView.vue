<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { logActivity } from '@/lib/activity'
import { isActive } from '@/lib/employees'
import { loadRules, loadRecognitionBadges, loadAwards, type MilestoneRule, type RecognitionBadge, type BadgeAward } from '@/lib/achievements'
import type { Profile } from '@/lib/database.types'

const auth = useAuthStore()
const rules = ref<MilestoneRule[]>([])
const badges = ref<RecognitionBadge[]>([])
const awards = ref<BadgeAward[]>([])
const people = ref<Profile[]>([])
const missing = ref(false)
const error = ref('')
const msg = ref('')

// one editable draft per rule so typing doesn't save on every keystroke
interface Draft {
  id: number | null
  name: string
  icon: string
  match_mode: 'all' | 'any'
  useHours: boolean
  hours: number
  useCourses: boolean
  courses: number
  useCerts: boolean
  certs: number
  active: boolean
}
const drafts = ref<Draft[]>([])

function toDraft(r: MilestoneRule): Draft {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon,
    match_mode: r.match_mode,
    useHours: r.min_hours != null,
    hours: Number(r.min_hours ?? 5),
    useCourses: r.min_courses != null,
    courses: r.min_courses ?? 3,
    useCerts: r.min_certs != null,
    certs: r.min_certs ?? 1,
    active: r.is_active,
  }
}

async function load() {
  const [r, b, a, { data: p }] = await Promise.all([
    loadRules(),
    loadRecognitionBadges(),
    loadAwards(),
    supabase.from('profiles').select('*').eq('role', 'employee').order('full_name'),
  ])
  rules.value = r.rows
  missing.value = r.missing
  drafts.value = r.rows.map(toDraft)
  badges.value = b
  awards.value = a
  people.value = ((p ?? []) as Profile[]).filter(isActive)
}
onMounted(load)

function addRule() {
  drafts.value.push({ id: null, name: 'New milestone', icon: '⭐', match_mode: 'all', useHours: true, hours: 5, useCourses: false, courses: 3, useCerts: false, certs: 1, active: true })
}

async function saveRule(d: Draft) {
  error.value = ''
  msg.value = ''
  if (!d.name.trim()) return
  if (!d.useHours && !d.useCourses && !d.useCerts) {
    error.value = 'Choose at least one criterion for the milestone.'
    return
  }
  const row = {
    name: d.name.trim(),
    icon: d.icon || '🏅',
    match_mode: d.match_mode,
    min_hours: d.useHours ? d.hours : null,
    min_courses: d.useCourses ? d.courses : null,
    min_certs: d.useCerts ? d.certs : null,
    is_active: d.active,
  }
  const { error: err } = d.id ? await supabase.from('milestone_rules').update(row).eq('id', d.id) : await supabase.from('milestone_rules').insert(row)
  if (err) {
    error.value = err.message
    return
  }
  await logActivity(auth.profile?.id, `Saved milestone rule "${row.name}"`)
  msg.value = 'Milestone saved.'
  await load()
}

async function deleteRule(d: Draft) {
  if (!d.id) {
    drafts.value = drafts.value.filter((x) => x !== d)
    return
  }
  if (!window.confirm(`Delete the milestone "${d.name}"?`)) return
  await supabase.from('milestone_rules').delete().eq('id', d.id)
  await logActivity(auth.profile?.id, `Deleted milestone rule "${d.name}"`)
  await load()
}

/* ---------- recognition badges ---------- */
const newName = ref('')
const newIcon = ref('🌟')
const newDesc = ref('')

async function createBadge() {
  error.value = ''
  if (!newName.value.trim()) return
  const { error: err } = await supabase.from('recognition_badges').insert({ name: newName.value.trim(), icon: newIcon.value || '⭐', description: newDesc.value.trim() })
  if (err) {
    error.value = err.message
    return
  }
  await logActivity(auth.profile?.id, `Created recognition badge "${newName.value.trim()}"`)
  newName.value = ''
  newDesc.value = ''
  await load()
}

async function deleteBadge(b: RecognitionBadge) {
  if (!window.confirm(`Delete the badge "${b.name}"?\n\nAll awards of it are removed too.`)) return
  await supabase.from('recognition_badges').delete().eq('id', b.id)
  await logActivity(auth.profile?.id, `Deleted recognition badge "${b.name}"`)
  await load()
}

/* ---------- awards ---------- */
const awardUser = ref('')
const awardBadge = ref<number | ''>('')
const awardNote = ref('')
const badgeById = computed(() => new Map(badges.value.map((b) => [b.id, b])))
const personById = computed(() => new Map(people.value.map((p) => [p.id, p])))

async function award() {
  error.value = ''
  msg.value = ''
  if (!awardUser.value || !awardBadge.value || !awardNote.value.trim()) {
    error.value = 'Choose an employee and a badge, and write a citation note.'
    return
  }
  const { error: err } = await supabase.from('badge_awards').insert({ user_id: awardUser.value, badge_id: awardBadge.value, citation: awardNote.value.trim(), awarded_by: auth.profile?.id })
  if (err) {
    error.value = err.message
    return
  }
  const b = badgeById.value.get(awardBadge.value)
  await supabase.from('notifications').insert({ user_id: awardUser.value, text: `You received a special recognition: ${b?.icon ?? ''} ${b?.name ?? 'badge'}.`, action: { type: 'goto', view: 'badges' } })
  await logActivity(auth.profile?.id, `Awarded "${b?.name}" to ${personById.value.get(awardUser.value)?.full_name}`)
  msg.value = 'Badge awarded.'
  awardNote.value = ''
  await load()
}

async function revokeAward(a: BadgeAward) {
  const who = personById.value.get(a.user_id)?.full_name ?? 'this employee'
  if (!window.confirm(`Revoke "${badgeById.value.get(a.badge_id)?.name}" from ${who}?`)) return
  await supabase.from('badge_awards').update({ revoked_at: new Date().toISOString() }).eq('id', a.id)
  await logActivity(auth.profile?.id, `Revoked "${badgeById.value.get(a.badge_id)?.name}" from ${who}`)
  await load()
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <h2>Badges & milestones</h2>
        <p>Decide when milestone badges unlock, create recognition badges and award them with a citation.</p>
      </div>
    </div>

    <div v-if="missing" class="card" style="padding: 16px; margin-bottom: 16px; border-left: 3px solid var(--brass)">
      <b>One-time setup needed.</b> Run <code>supabase/v5.sql</code> in the Supabase SQL Editor to turn on milestone rules and recognition badges.
    </div>
    <p v-if="error" class="hint" style="color: var(--danger)">{{ error }}</p>
    <p v-if="msg" class="hint" style="color: var(--teal)">{{ msg }}</p>

    <div class="card" style="padding: 18px; margin-bottom: 18px">
      <div class="panel-title" style="padding: 0 0 8px"><h3>Milestone eligibility rules</h3><button class="btn btn-ghost btn-sm" :disabled="missing" @click="addRule">+ New rule</button></div>
      <p class="hint" style="margin: 0 0 12px">
        A learner unlocks a milestone from completed course duration, courses completed and certificates earned. Choose
        <b>All</b> (every ticked criterion) or <b>Any</b> (at least one).
      </p>
      <div class="rules">
        <div v-for="(d, i) in drafts" :key="d.id ?? 'new' + i" class="rule">
          <div class="row"><input v-model="d.icon" type="text" style="width: 56px; text-align: center" /><input v-model="d.name" type="text" style="flex: 1" /></div>
          <div class="row" style="margin: 10px 0">
            <button class="chip-btn" :class="{ on: d.match_mode === 'all' }" @click="d.match_mode = 'all'">Match ALL</button>
            <button class="chip-btn" :class="{ on: d.match_mode === 'any' }" @click="d.match_mode = 'any'">Match ANY</button>
          </div>
          <label class="crit"><input v-model="d.useHours" type="checkbox" style="width: auto" /><span>Completed course duration (hours) ≥</span><input v-model.number="d.hours" type="number" min="0" step="0.5" :disabled="!d.useHours" /></label>
          <label class="crit"><input v-model="d.useCourses" type="checkbox" style="width: auto" /><span>Courses completed ≥</span><input v-model.number="d.courses" type="number" min="0" :disabled="!d.useCourses" /></label>
          <label class="crit"><input v-model="d.useCerts" type="checkbox" style="width: auto" /><span>Certificates earned ≥</span><input v-model.number="d.certs" type="number" min="0" :disabled="!d.useCerts" /></label>
          <label class="row" style="font-weight: 400; gap: 6px; margin-top: 6px"><input v-model="d.active" type="checkbox" style="width: auto" /> Active</label>
          <div class="row" style="margin-top: 10px">
            <button class="btn btn-primary btn-sm" @click="saveRule(d)">Save</button>
            <button class="btn btn-ghost btn-sm" style="color: var(--danger)" @click="deleteRule(d)">Delete</button>
          </div>
        </div>
      </div>
      <p v-if="!drafts.length" class="hint" style="padding: 14px 0">No milestone rules yet.</p>
    </div>

    <div class="two">
      <div class="card" style="padding: 18px">
        <div class="panel-title" style="padding: 0 0 8px"><h3>Custom recognition badges</h3></div>
        <div v-for="b in badges" :key="b.id" class="row" style="padding: 8px 0; border-bottom: 1px solid var(--border)">
          <span style="font-size: 26px">{{ b.icon }}</span>
          <div style="flex: 1"><b>{{ b.name }}</b><div class="sub">{{ b.description }}</div></div>
          <button class="btn btn-ghost btn-sm" style="color: var(--danger)" @click="deleteBadge(b)">Delete</button>
        </div>
        <p v-if="!badges.length" class="hint">No badges yet.</p>
        <div class="field" style="margin-top: 12px"><label>New badge</label>
          <div class="row"><input v-model="newIcon" type="text" style="width: 56px; text-align: center" /><input v-model="newName" type="text" placeholder="Badge name" style="flex: 1" /></div>
        </div>
        <input v-model="newDesc" type="text" placeholder="Short description" />
        <button class="btn btn-primary btn-sm" style="margin-top: 10px" :disabled="!newName.trim() || missing" @click="createBadge">Create badge</button>
      </div>

      <div class="card" style="padding: 18px">
        <div class="panel-title" style="padding: 0 0 8px"><h3>Award a badge</h3></div>
        <div class="field"><label>Employee</label>
          <select v-model="awardUser"><option value="">Choose…</option><option v-for="p in people" :key="p.id" :value="p.id">{{ p.full_name }} · {{ p.department }}</option></select>
        </div>
        <div class="field"><label>Badge</label>
          <select v-model="awardBadge"><option value="">Choose…</option><option v-for="b in badges" :key="b.id" :value="b.id">{{ b.icon }} {{ b.name }}</option></select>
        </div>
        <div class="field"><label>Citation note (shown to the employee)</label><textarea v-model="awardNote" rows="3" placeholder="Why does this person deserve it?" /></div>
        <button class="btn btn-primary" :disabled="missing" @click="award">Award badge</button>
      </div>
    </div>

    <div class="card table-wrap" style="margin-top: 18px">
      <div class="panel-title"><h3>Awards given</h3></div>
      <table>
        <thead><tr><th>Employee</th><th>Badge</th><th>Citation</th><th>Date</th><th></th></tr></thead>
        <tbody>
          <tr v-for="a in awards" :key="a.id">
            <td><b>{{ personById.get(a.user_id)?.full_name ?? 'Unknown' }}</b></td>
            <td>{{ badgeById.get(a.badge_id)?.icon }} {{ badgeById.get(a.badge_id)?.name }}</td>
            <td class="sub" style="max-width: 360px">{{ a.citation }}</td>
            <td>{{ fmt(a.awarded_at) }}</td>
            <td style="text-align: right"><button class="btn btn-ghost btn-sm" style="color: var(--danger)" @click="revokeAward(a)">Revoke</button></td>
          </tr>
        </tbody>
      </table>
      <p v-if="!awards.length" class="hint" style="padding: 18px; text-align: center">No awards given yet.</p>
    </div>
  </div>
</template>

<style scoped>
.rules {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 14px;
}
.rule {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px;
}
.crit {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  font-size: 13px;
  margin: 6px 0;
}
.crit span {
  flex: 1;
}
.crit input[type='number'] {
  width: 72px;
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  align-items: start;
}
@media (max-width: 900px) {
  .two {
    grid-template-columns: 1fr;
  }
}
</style>
