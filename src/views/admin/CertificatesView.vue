<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { logActivity } from '@/lib/activity'
import { isActive } from '@/lib/employees'
import {
  loadCertificates,
  loadCertificateSettings,
  certificateFields,
  type IssuedCertificate,
} from '@/lib/achievements'
import {
  buildCertificatePdf,
  pdfBlobUrl,
  downloadBlobUrl,
  DEFAULT_SETTINGS,
  FIELD_LABELS,
  type CertificateSettings,
  type FieldKey,
} from '@/lib/certificatePdf'
import CertificatePreview from '@/components/CertificatePreview.vue'
import type { Course, Profile } from '@/lib/database.types'

const auth = useAuthStore()
const tab = ref<'issue' | 'settings'>('issue')
const people = ref<Profile[]>([])
const courses = ref<Course[]>([])
const issued = ref<IssuedCertificate[]>([])
const missing = ref(false)
const settings = ref<CertificateSettings>({ ...DEFAULT_SETTINGS, positions: { ...DEFAULT_SETTINGS.positions } })

const filter = ref('')
const chosen = ref<Set<string>>(new Set())
const courseId = ref<number | ''>('')
const hours = ref(2)
const citation = ref('')
const issuing = ref(false)
const message = ref('')
const error = ref('')

const preview = ref<{ url: string; filename: string; title: string } | null>(null)

async function load() {
  const [{ data: p }, { data: c }, certs, s] = await Promise.all([
    supabase.from('profiles').select('*').eq('role', 'employee').order('full_name'),
    supabase.from('courses').select('*').order('title'),
    loadCertificates(),
    loadCertificateSettings(),
  ])
  people.value = ((p ?? []) as Profile[]).filter(isActive)
  courses.value = (c ?? []) as Course[]
  issued.value = certs.rows
  missing.value = certs.missing
  settings.value = s
}
onMounted(load)

const personById = computed(() => new Map(people.value.map((p) => [p.id, p])))
const courseById = computed(() => new Map(courses.value.map((c) => [c.id, c])))
const shown = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return people.value.filter((p) => !q || p.full_name.toLowerCase().includes(q) || p.department.toLowerCase().includes(q))
})

function toggle(id: string) {
  const next = new Set(chosen.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  chosen.value = next
}
function selectShown() {
  chosen.value = new Set([...chosen.value, ...shown.value.map((p) => p.id)])
}

async function issue() {
  error.value = ''
  message.value = ''
  if (!chosen.value.size) return
  issuing.value = true
  const rows = [...chosen.value].map((user_id) => ({
    user_id,
    course_id: courseId.value || null,
    credit_hours: hours.value || 0,
    citation: citation.value.trim(),
    issued_by: auth.profile?.id,
  }))
  const { error: err } = await supabase.from('issued_certificates').insert(rows)
  if (err) {
    error.value = /issued_certificates|schema cache/i.test(err.message) ? 'Certificates need the v5 database update — run supabase/v5.sql first.' : err.message
    issuing.value = false
    return
  }
  const title = courseId.value ? courseById.value.get(courseId.value)?.title : 'a certificate'
  await supabase.from('notifications').insert(rows.map((r) => ({ user_id: r.user_id, text: `You were issued an official certificate${courseId.value ? ` for ${title}` : ''}.`, action: { type: 'goto', view: 'badges' } })))
  await logActivity(auth.profile?.id, `Issued ${rows.length} certificate(s)${courseId.value ? ` for "${title}"` : ''}`)
  message.value = `${rows.length} certificate${rows.length === 1 ? '' : 's'} issued.`
  chosen.value = new Set()
  citation.value = ''
  issuing.value = false
  await load()
}

function fieldsFor(c: IssuedCertificate) {
  return certificateFields(c, personById.value.get(c.user_id)?.full_name ?? 'Employee', c.course_id ? (courseById.value.get(c.course_id)?.title ?? null) : null)
}

async function openPreview(c: IssuedCertificate) {
  error.value = ''
  try {
    const bytes = await buildCertificatePdf(settings.value, fieldsFor(c))
    preview.value = { url: pdfBlobUrl(bytes), filename: `${c.number}.pdf`, title: `${c.number} · ${personById.value.get(c.user_id)?.full_name ?? ''}` }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not build the PDF.'
  }
}
async function download(c: IssuedCertificate) {
  error.value = ''
  try {
    const url = pdfBlobUrl(await buildCertificatePdf(settings.value, fieldsFor(c)))
    downloadBlobUrl(url, `${c.number}.pdf`)
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not build the PDF.'
  }
}
async function revoke(c: IssuedCertificate) {
  const who = personById.value.get(c.user_id)?.full_name ?? 'this employee'
  if (!window.confirm(`Revoke ${c.number} issued to ${who}?\n\nIt stops counting towards their certificates and they can no longer download it.`)) return
  await supabase.from('issued_certificates').update({ revoked_at: new Date().toISOString() }).eq('id', c.id)
  await logActivity(auth.profile?.id, `Revoked certificate ${c.number} (${who})`)
  await load()
}

async function previewSample() {
  error.value = ''
  try {
    const bytes = await buildCertificatePdf(settings.value, {
      name: personById.value.get([...chosen.value][0] ?? '')?.full_name ?? 'Sample Employee',
      course: courseId.value ? (courseById.value.get(courseId.value)?.title ?? 'Course') : 'Sample Course Title',
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      hours: `${hours.value} credit hours`,
      cit: citation.value || 'Citation note appears here.',
      id: 'CERT-0000',
    })
    preview.value = { url: pdfBlobUrl(bytes), filename: 'certificate-preview.pdf', title: 'Certificate preview' }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not build the PDF.'
  }
}

/* ---------- Template & PDF settings ---------- */
const sel = ref<FieldKey>('name')
const snap = ref(true)
const saving = ref(false)
const saveMsg = ref('')
const uploading = ref(false)
const canvas = ref<HTMLElement | null>(null)
const sampleText: Record<FieldKey, string> = { name: 'Kyrstlee Vm', course: 'Handling Difficult Calls', date: '18 November 2026', hours: '3 credit hours', cit: 'Completed with distinction.', id: 'CERT-0001' }
const fieldKeys = Object.keys(FIELD_LABELS) as FieldKey[]
const isImageTemplate = computed(() => !!settings.value.template_url && /\.(png|jpe?g)(\?|$)/i.test(settings.value.template_url))

function startDrag(key: FieldKey, ev: PointerEvent) {
  ev.preventDefault()
  sel.value = key
  const move = (m: PointerEvent) => {
    const r = canvas.value?.getBoundingClientRect()
    if (!r) return
    let x = ((m.clientX - r.left) / r.width) * 100
    let y = ((m.clientY - r.top) / r.height) * 100
    x = Math.max(0, Math.min(100, x))
    y = Math.max(0, Math.min(100, y))
    settings.value.positions[key] = snap.value ? { x: Math.round(x), y: Math.round(y) } : { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
function nudge(dx: number, dy: number) {
  const p = settings.value.positions[sel.value]
  settings.value.positions[sel.value] = { x: Math.max(0, Math.min(100, p.x + dx)), y: Math.max(0, Math.min(100, p.y + dy)) }
}

async function onTemplate(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0]
  if (!file) return
  saveMsg.value = ''
  if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) {
    saveMsg.value = 'Please choose a PDF, PNG or JPG template.'
    return
  }
  uploading.value = true
  const path = `certificate-templates/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`
  const { error: up } = await supabase.storage.from('module-materials').upload(path, file, { contentType: file.type || undefined })
  if (up) saveMsg.value = `Upload failed: ${up.message}`
  else settings.value.template_url = supabase.storage.from('module-materials').getPublicUrl(path).data.publicUrl
  uploading.value = false
}

async function saveSettings() {
  saving.value = true
  saveMsg.value = ''
  const s = settings.value
  const { error: err } = await supabase.from('certificate_settings').upsert({
    id: 1,
    mode: s.mode,
    org_name: s.org_name,
    signer_name: s.signer_name,
    signer_title: s.signer_title,
    template_url: s.template_url,
    positions: s.positions,
    updated_at: new Date().toISOString(),
  })
  saving.value = false
  if (err) saveMsg.value = /certificate_settings|schema cache/i.test(err.message) ? 'Needs the v5 database update — run supabase/v5.sql first.' : err.message
  else {
    saveMsg.value = 'Saved.'
    await logActivity(auth.profile?.id, 'Updated certificate template settings')
  }
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <h2>Certificates</h2>
        <p>Issue official certificates to employees and control how the PDF looks.</p>
      </div>
    </div>

    <div v-if="missing" class="card" style="padding: 16px; margin-bottom: 16px; border-left: 3px solid var(--brass)">
      <b>One-time setup needed.</b> Run <code>supabase/v5.sql</code> in the Supabase SQL Editor to turn on certificates.
    </div>

    <div class="seg" style="margin-bottom: 16px; display: inline-flex">
      <button :class="{ on: tab === 'issue' }" @click="tab = 'issue'">Create & Issue Certificates</button>
      <button :class="{ on: tab === 'settings' }" @click="tab = 'settings'">Template & PDF Settings</button>
    </div>
    <p v-if="error" class="hint" style="color: var(--danger)">{{ error }}</p>

    <template v-if="tab === 'issue'">
      <div class="card" style="padding: 18px; margin-bottom: 16px">
        <div class="panel-title" style="padding: 0 0 8px"><h3>Issue a certificate</h3></div>
        <div class="two">
          <div>
            <label class="lbl">Employees (one or many)</label>
            <input v-model="filter" type="text" placeholder="Search by name or department" />
            <div class="row" style="margin: 8px 0">
              <button class="btn btn-ghost btn-sm" @click="selectShown">Select all shown</button>
              <button class="btn btn-ghost btn-sm" @click="chosen = new Set()">Clear</button>
              <span class="hint" style="margin-left: auto">{{ chosen.size }} selected</span>
            </div>
            <div class="list">
              <label v-for="p in shown" :key="p.id" class="pick">
                <input type="checkbox" style="width: auto" :checked="chosen.has(p.id)" @change="toggle(p.id)" />
                <span><b>{{ p.full_name }}</b> <span class="sub">· {{ p.department }}</span></span>
              </label>
            </div>
          </div>
          <div>
            <div class="field">
              <label>Link a course (optional)</label>
              <select v-model="courseId">
                <option value="">— none (general certificate) —</option>
                <option v-for="c in courses" :key="c.id" :value="c.id">{{ c.title }}</option>
              </select>
            </div>
            <div class="field"><label>Credit hours</label><input v-model.number="hours" type="number" min="0" step="0.5" /></div>
            <div class="field"><label>Citation note</label><textarea v-model="citation" rows="3" placeholder="Why is this certificate being awarded?" /></div>
            <div class="row">
              <button class="btn btn-primary" :disabled="issuing || !chosen.size || missing" @click="issue">{{ issuing ? 'Issuing…' : `Issue to ${chosen.size || ''} selected` }}</button>
              <button class="btn btn-ghost" @click="previewSample">Preview PDF</button>
            </div>
            <p v-if="message" class="hint" style="color: var(--teal); margin-top: 8px">{{ message }}</p>
          </div>
        </div>
      </div>

      <div class="card table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Employee</th><th>Course</th><th>Hours</th><th>Issued</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr v-for="c in issued" :key="c.id">
              <td class="sub">{{ c.number }}</td>
              <td><b>{{ personById.get(c.user_id)?.full_name ?? 'Unknown' }}</b></td>
              <td>{{ c.course_id ? (courseById.get(c.course_id)?.title ?? 'Course removed') : '—' }}</td>
              <td>{{ Number(c.credit_hours) }}h</td>
              <td>{{ fmt(c.issued_at) }}</td>
              <td><span class="pill" :class="c.revoked_at ? 'pill-danger' : 'pill-teal'">{{ c.revoked_at ? 'Revoked' : 'Valid' }}</span></td>
              <td style="white-space: nowrap; text-align: right">
                <button class="btn btn-ghost btn-sm" @click="openPreview(c)">Preview</button>
                <button class="btn btn-ghost btn-sm" style="margin-left: 4px" @click="download(c)">⬇ PDF</button>
                <button v-if="!c.revoked_at" class="btn btn-ghost btn-sm" style="margin-left: 4px; color: var(--danger)" @click="revoke(c)">Revoke</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!issued.length" class="hint" style="padding: 22px; text-align: center">No certificates issued yet.</p>
      </div>
    </template>

    <template v-else>
      <div class="card" style="padding: 18px; margin-bottom: 16px">
        <div class="row">
          <b>Style</b>
          <button class="chip-btn" :class="{ on: settings.mode === 'classic' }" @click="settings.mode = 'classic'">Classic certificate</button>
          <button class="chip-btn" :class="{ on: settings.mode === 'custom' }" @click="settings.mode = 'custom'">Custom PDF template</button>
        </div>
      </div>

      <div v-if="settings.mode === 'classic'" class="card" style="padding: 18px; max-width: 520px">
        <div class="field"><label>Organisation name</label><input v-model="settings.org_name" type="text" /></div>
        <div class="field"><label>Signatory name</label><input v-model="settings.signer_name" type="text" /></div>
        <div class="field"><label>Signatory title</label><input v-model="settings.signer_title" type="text" /></div>
      </div>

      <div v-else class="two">
        <div class="card" style="padding: 18px">
          <div class="panel-title" style="padding: 0 0 8px"><h3>Alignment tool</h3></div>
          <p class="hint" style="margin: 0 0 10px">Drag each field to where it should print on your template. The page is A4 landscape.</p>
          <div ref="canvas" class="canvas" :style="isImageTemplate ? { backgroundImage: `url(${settings.template_url})` } : {}">
            <span v-if="!isImageTemplate" class="ph">{{ settings.template_url ? 'PDF template uploaded' : 'Upload a template →' }}</span>
            <span
              v-for="k in fieldKeys"
              :key="k"
              class="fld"
              :class="{ sel: sel === k }"
              :style="{ left: settings.positions[k].x + '%', top: settings.positions[k].y + '%' }"
              @pointerdown="startDrag(k, $event)"
            >{{ sampleText[k] }}</span>
          </div>
        </div>
        <div>
          <div class="card" style="padding: 18px; margin-bottom: 14px">
            <div class="panel-title" style="padding: 0 0 8px"><h3>Template file</h3></div>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" :disabled="uploading" @change="onTemplate" />
            <p class="hint" style="margin-top: 6px">{{ uploading ? 'Uploading…' : settings.template_url ? 'A template is uploaded.' : 'Upload your branded PDF, PNG or JPG (A4 landscape works best).' }}</p>
          </div>
          <div class="card" style="padding: 18px">
            <div class="panel-title" style="padding: 0 0 8px"><h3>Fields</h3></div>
            <div v-for="k in fieldKeys" :key="k" class="row" style="padding: 5px 0; border-bottom: 1px solid var(--border)">
              <button class="chip-btn" :class="{ on: sel === k }" @click="sel = k">{{ FIELD_LABELS[k] }}</button>
              <span class="hint" style="margin-left: auto">x {{ settings.positions[k].x }}% · y {{ settings.positions[k].y }}%</span>
            </div>
            <div class="row" style="margin-top: 10px">
              <button class="btn btn-ghost btn-sm" @click="nudge(-1, 0)">◀</button>
              <button class="btn btn-ghost btn-sm" @click="nudge(0, -1)">▲</button>
              <button class="btn btn-ghost btn-sm" @click="nudge(0, 1)">▼</button>
              <button class="btn btn-ghost btn-sm" @click="nudge(1, 0)">▶</button>
              <label class="row" style="margin-left: auto; font-weight: 400; gap: 6px"><input v-model="snap" type="checkbox" style="width: auto" /> Snap to grid</label>
            </div>
          </div>
        </div>
      </div>

      <div class="row" style="margin-top: 16px">
        <button class="btn btn-primary" :disabled="saving" @click="saveSettings">{{ saving ? 'Saving…' : 'Save template settings' }}</button>
        <button class="btn btn-ghost" @click="previewSample">Preview PDF</button>
        <span v-if="saveMsg" class="hint" :style="{ color: saveMsg === 'Saved.' ? 'var(--teal)' : 'var(--danger)' }">{{ saveMsg }}</span>
      </div>
    </template>

    <CertificatePreview v-if="preview" :url="preview.url" :filename="preview.filename" :title="preview.title" @close="preview = null" />
  </div>
</template>

<style scoped>
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  align-items: start;
}
.two:has(.canvas) {
  grid-template-columns: 1.6fr 1fr;
}
@media (max-width: 980px) {
  .two,
  .two:has(.canvas) {
    grid-template-columns: 1fr;
  }
}
.lbl {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  margin-bottom: 6px;
}
.list {
  max-height: 250px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.pick {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  font-weight: 500;
}
.canvas {
  position: relative;
  aspect-ratio: 1.414;
  width: 100%;
  background: linear-gradient(135deg, #eaf0ff, #fff 40%, #fdf0e2) center / 100% 100% no-repeat;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  container-type: inline-size;
}
.ph {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #b9c3dc;
  font-weight: 800;
  font-size: 3.4cqw;
}
.fld {
  position: absolute;
  transform: translate(-50%, -50%);
  white-space: nowrap;
  font-size: 2.3cqw;
  font-weight: 700;
  color: #1a2a55;
  background: rgba(47, 91, 232, 0.14);
  outline: 1px dashed var(--blue);
  padding: 0.3cqw 1cqw;
  border-radius: 0.6cqw;
  cursor: grab;
  user-select: none;
  touch-action: none;
}
.fld.sel {
  background: rgba(240, 138, 36, 0.3);
  outline: 2px solid var(--brass);
}
</style>
