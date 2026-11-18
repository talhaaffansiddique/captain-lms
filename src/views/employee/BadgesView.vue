<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import {
  loadTrackData,
  moduleChunkForMilestone,
  attemptsFor,
  maxAttemptsFor,
  hasPassed,
  pendingMilestones,
  milestoneLabel,
  QUESTIONS_PER_QUIZ,
  QUESTION_TIME_SECONDS,
  PASS_THRESHOLD,
  BASE_MAX_ATTEMPTS,
  type TrackData,
} from '@/lib/quiz'
import { supabase } from '@/lib/supabase'
import {
  loadMyMetrics,
  loadRules,
  loadRecognitionBadges,
  loadAwards,
  loadCertificates,
  loadCertificateSettings,
  evaluateRule,
  certificateFields,
  type Metrics,
  type MilestoneRule,
  type RecognitionBadge,
  type BadgeAward,
  type IssuedCertificate,
} from '@/lib/achievements'
import { buildCertificatePdf, pdfBlobUrl, downloadBlobUrl, type CertificateSettings } from '@/lib/certificatePdf'
import CertificatePreview from '@/components/CertificatePreview.vue'

interface Tier {
  m: string
  icon: string
  name: string
  why: string
}

const TIERS: Tier[] = [
  { m: '1', icon: '🥉', name: 'Bronze', why: 'Your first milestone. It shows you have started your department training and understood the basics.' },
  { m: '2', icon: '🥈', name: 'Silver', why: 'Shows you can apply what you learned in your day-to-day work, not just watch the lessons.' },
  { m: '3', icon: '🥇', name: 'Gold', why: 'Marks solid, role-level knowledge. You are now past the halfway point of the milestone track.' },
  { m: '4', icon: '💎', name: 'Diamond', why: 'Advanced topics. Awarded for consistent learning and strong quiz results.' },
  { m: '5', icon: '💎', name: 'Diamond II', why: 'The last milestone block. It shows you have worked through all of your department-specific lessons.' },
  { m: 'final', icon: '🏆', name: 'Captain Master', why: 'The top award. It means you finished every lesson in your track and passed the Final Assessment.' },
]

const auth = useAuthStore()
const data = ref<TrackData | null>(null)
const loading = ref(true)
const selected = ref('1')

// ---- v5: achievements hub ----
const metrics = ref<Metrics>({ hours: 0, courses: 0, certs: 0 })
const rules = ref<MilestoneRule[]>([])
const recog = ref<RecognitionBadge[]>([])
const awards = ref<BadgeAward[]>([])
const certs = ref<IssuedCertificate[]>([])
const courseTitles = ref<Record<number, string>>({})
const certSettings = ref<CertificateSettings | null>(null)
const hubFilter = ref<'all' | 'unlocked' | 'progress'>('all')
const preview = ref<{ url: string; filename: string; title: string } | null>(null)
const pdfError = ref('')

async function loadHub() {
  if (!auth.profile) return
  const uid = auth.profile.id
  const [m, r, rb, a, c, s, { data: cs }] = await Promise.all([
    loadMyMetrics(uid, auth.profile.department),
    loadRules(),
    loadRecognitionBadges(),
    loadAwards(uid),
    loadCertificates(uid),
    loadCertificateSettings(),
    supabase.from('courses').select('id, title'),
  ])
  metrics.value = m
  rules.value = r.rows.filter((x) => x.is_active)
  recog.value = rb
  awards.value = a
  certs.value = c.rows.filter((x) => !x.revoked_at)
  certSettings.value = s
  courseTitles.value = Object.fromEntries(((cs ?? []) as { id: number; title: string }[]).map((x) => [x.id, x.title]))
}

const ruleCards = computed(() => rules.value.map((r) => ({ rule: r, st: evaluateRule(r, metrics.value) })))
const shownRules = computed(() => ruleCards.value.filter((x) => hubFilter.value === 'all' || (hubFilter.value === 'unlocked' ? x.st.unlocked : !x.st.unlocked)))
const recogById = computed(() => new Map(recog.value.map((b) => [b.id, b])))

function certFields(c: IssuedCertificate) {
  return certificateFields(c, auth.profile?.full_name ?? 'Employee', c.course_id ? (courseTitles.value[c.course_id] ?? null) : null)
}
async function previewCert(c: IssuedCertificate) {
  pdfError.value = ''
  try {
    const bytes = await buildCertificatePdf(certSettings.value!, certFields(c))
    preview.value = { url: pdfBlobUrl(bytes), filename: `${c.number}.pdf`, title: c.number }
  } catch (e) {
    pdfError.value = e instanceof Error ? e.message : 'Could not build the PDF.'
  }
}
async function downloadCert(c: IssuedCertificate) {
  pdfError.value = ''
  try {
    const url = pdfBlobUrl(await buildCertificatePdf(certSettings.value!, certFields(c)))
    downloadBlobUrl(url, `${c.number}.pdf`)
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  } catch (e) {
    pdfError.value = e instanceof Error ? e.message : 'Could not build the PDF.'
  }
}
function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

onMounted(async () => {
  if (!auth.profile) return
  void loadHub()
  data.value = await loadTrackData(auth.profile.id, auth.profile.department)
  const earned = TIERS.find((t) => hasPassed(t.m, data.value!.attempts))
  const next = TIERS.find((t) => !hasPassed(t.m, data.value!.attempts))
  selected.value = (next ?? earned ?? TIERS[0]!).m
  loading.value = false
})

const doneIds = computed(() => new Set((data.value?.completions ?? []).filter((c) => c.completed).map((c) => c.module_id)))

function info(t: Tier) {
  const d = data.value
  if (!d) return null
  const chunk = moduleChunkForMilestone(d.track, t.m)
  const done = chunk.filter((mod) => doneIds.value.has(mod.id)).length
  const attempts = attemptsFor(t.m, d.attempts)
  const passedAttempt = attempts.find((a) => a.passed) ?? null
  const max = maxAttemptsFor(t.m, d.grants)
  const lessonsDone = chunk.length > 0 && done === chunk.length
  const pending = pendingMilestones(d.track, d.completions, d.attempts, d.grants).includes(t.m)
  const best = attempts.reduce((b, a) => Math.max(b, a.total ? Math.round((a.score / a.total) * 100) : 0), 0)
  return {
    chunk,
    done,
    total: chunk.length,
    attempts,
    passedAttempt,
    max,
    lessonsDone,
    pending,
    best,
    earned: !!passedAttempt,
    unavailable: chunk.length === 0 || (t.m !== 'final' && chunk.length < QUESTIONS_PER_QUIZ),
    locked: lessonsDone && !passedAttempt && attempts.length >= max,
  }
}

const current = computed(() => {
  const t = TIERS.find((x) => x.m === selected.value)!
  return { tier: t, i: info(t)! }
})
const earnedCount = computed(() => (data.value ? TIERS.filter((t) => hasPassed(t.m, data.value!.attempts)).length : 0))

const passPct = Math.round(PASS_THRESHOLD * 100)

/** Hover / keyboard-focus tooltip for a milestone quiz badge. */
function tip(t: Tier): { title: string; lines: string[] } {
  const i = info(t)
  if (!i) return { title: t.name, lines: [] }
  if (i.earned && i.passedAttempt) {
    const a = i.passedAttempt
    return {
      title: `${t.name} — unlocked`,
      lines: [
        `Unlocked on ${new Date(a.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`,
        `Passing score: ${passPct}%`,
        `Your score: ${a.total ? Math.round((a.score / a.total) * 100) : 0}% (${a.score}/${a.total})`,
        `Passed on attempt ${a.attempt_number} of ${i.max}`,
      ],
    }
  }
  const steps: string[] = []
  steps.push(i.lessonsDone ? '✓ Finish the lessons in this block' : `1. Finish the lessons in this block (${i.done}/${i.total} done)`)
  steps.push(`2. Pass the milestone quiz with ${passPct}% or more`)
  steps.push(`You get ${i.max} attempts`)
  if (i.locked) steps.push('All attempts used — ask your admin for another')
  return { title: `${t.name} — locked`, lines: steps }
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}
function pct(a: { score: number; total: number }) {
  return a.total ? Math.round((a.score / a.total) * 100) : 0
}
function certId(m: string) {
  return `CL-${m.toUpperCase()}-${String(auth.profile?.id ?? '').slice(0, 4).toUpperCase()}`
}
const lessonScope = computed(() => (current.value.tier.m === 'final' ? 'every lesson in your track' : `the ${current.value.i.total || QUESTIONS_PER_QUIZ} lessons in this block`))
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <h2>Certificates & badges</h2>
        <p>Click a badge to see why it exists, how you earned it (or what is left to earn it) and your certificate.</p>
      </div>
    </div>

    <p v-if="loading" class="sub">Loading…</p>
    <template v-else>
      <div class="grid3">
        <div class="card stat"><div class="lbl">⏱ Course hours completed</div><div class="val">{{ metrics.hours }}h</div></div>
        <div class="card stat"><div class="lbl">📘 Courses completed</div><div class="val">{{ metrics.courses }}</div></div>
        <div class="card stat"><div class="lbl">🎓 Certificates earned</div><div class="val">{{ metrics.certs }}</div></div>
      </div>

      <div class="card" style="padding: 18px; margin-bottom: 16px">
        <div class="row wrap" style="margin-bottom: 10px">
          <div class="kicker" style="margin: 0">Achievement badges</div>
          <div class="row wrap" style="margin-left: auto; gap: 6px">
            <button v-for="f in ([['all', 'All'], ['unlocked', 'Unlocked'], ['progress', 'In progress']] as const)" :key="f[0]" class="chip-btn" :class="{ on: hubFilter === f[0] }" @click="hubFilter = f[0]">{{ f[1] }}</button>
          </div>
        </div>
        <div class="ach-grid">
          <div v-for="x in shownRules" :key="x.rule.id" class="ach" :class="{ off: !x.st.unlocked }">
            <div class="row" style="align-items: flex-start">
              <span class="ach-ic">{{ x.rule.icon }}</span>
              <div style="flex: 1"><b>{{ x.rule.name }}</b><div class="sub">{{ x.rule.match_mode === 'all' ? 'Meet ALL criteria' : 'Meet ANY criterion' }}</div></div>
              <span class="pill" :class="x.st.unlocked ? 'pill-teal' : 'pill-outline'">{{ x.st.unlocked ? 'Unlocked' : 'In progress' }}</span>
            </div>
            <div v-for="c in x.st.criteria" :key="c.key" style="margin-top: 9px">
              <div class="row" style="justify-content: space-between; font-size: 12.5px"><span>{{ c.label }}</span><b>{{ Math.min(c.have, c.need) }} / {{ c.need }}</b></div>
              <div class="bar"><i :style="{ width: Math.min(100, c.need ? (c.have / c.need) * 100 : 100) + '%', background: c.ok ? 'var(--teal)' : undefined }" /></div>
            </div>
          </div>
        </div>
        <p v-if="!shownRules.length" class="sub" style="padding: 12px 0">{{ rules.length ? 'Nothing in this filter.' : 'Your admin has not set up milestone badges yet.' }}</p>
      </div>

      <div class="card" style="padding: 18px; margin-bottom: 16px">
        <div class="kicker">Special recognition</div>
        <div v-for="a in awards" :key="a.id" class="row" style="align-items: flex-start; padding: 8px 0; border-bottom: 1px solid var(--border)">
          <span style="font-size: 34px">{{ recogById.get(a.badge_id)?.icon }}</span>
          <div>
            <b>{{ recogById.get(a.badge_id)?.name }}</b> <span class="sub">· awarded {{ fmtShort(a.awarded_at) }}</span>
            <div style="font-style: italic; margin-top: 3px">“{{ a.citation }}”</div>
          </div>
        </div>
        <p v-if="!awards.length" class="sub">No recognition badges yet — admins award these for outstanding work.</p>
      </div>

      <div class="card" style="padding: 18px; margin-bottom: 22px">
        <div class="kicker">My certificates</div>
        <p v-if="pdfError" class="hint" style="color: var(--danger)">{{ pdfError }}</p>
        <div v-for="c in certs" :key="c.id" class="row wrap" style="padding: 9px 0; border-bottom: 1px solid var(--border)">
          <span style="font-size: 26px">🎓</span>
          <div style="flex: 1; min-width: 200px">
            <b>{{ c.course_id ? (courseTitles[c.course_id] ?? 'Course') : 'General certificate' }}</b>
            <div class="sub">{{ c.number }} · {{ Number(c.credit_hours) }} credit hours · {{ fmtShort(c.issued_at) }}</div>
            <div v-if="c.citation" class="sub" style="font-style: italic">{{ c.citation }}</div>
          </div>
          <button class="btn btn-ghost btn-sm" @click="previewCert(c)">Preview</button>
          <button class="btn btn-primary btn-sm" @click="downloadCert(c)">⬇ Download PDF</button>
        </div>
        <p v-if="!certs.length" class="sub">No certificates issued to you yet.</p>
      </div>

      <h3 style="margin: 4px 0 6px; font-size: 18px">Milestone quiz badges</h3>
      <p class="sub" style="margin-bottom: 10px">Hover over a badge, or tab to it with the keyboard, to see how it works.</p>

      <div class="how">
        <div><b>1 · Learn</b>Watch each lesson in the block to the end. Videos cannot be skipped.</div>
        <div><b>2 · Pass the quiz</b>Each block ends with a milestone quiz. Score {{ passPct }}% or more to earn the badge.</div>
        <div><b>3 · Get certified</b>Every badge comes with a certificate you can view and print.</div>
      </div>

      <div class="sub" style="margin-bottom: 10px"><b>{{ earnedCount }}</b> of {{ TIERS.length }} badges earned</div>
      <div class="badge-grid">
        <button v-for="t in TIERS" :key="t.m" class="card badge-tile pick" :class="{ locked: !info(t)?.earned, sel: selected === t.m }" :aria-describedby="`tt-${t.m}`" @click="selected = t.m">
          <div class="badge-medal">{{ t.icon }}</div>
          <div class="bname">{{ t.name }}</div>
          <div class="sub">{{ info(t)?.earned ? '✓ Earned' : '🔒 Locked' }}</div>
          <span :id="`tt-${t.m}`" class="tt" role="tooltip">
            <b>{{ tip(t).title }}</b>
            <span v-for="(l, i) in tip(t).lines" :key="i">{{ l }}</span>
          </span>
        </button>
      </div>

      <div class="detail">
        <div class="card" style="padding: 22px">
          <div class="row" style="gap: 16px; margin-bottom: 8px">
            <div class="big">{{ current.tier.icon }}</div>
            <div>
              <span class="pill" :class="current.i.earned ? 'pill-teal' : 'pill-brass'">
                {{ current.i.earned ? `Earned on ${fmtDate(current.i.passedAttempt!.created_at)}` : 'Not earned yet' }}
              </span>
              <h3>{{ current.tier.name }} {{ current.tier.m === 'final' ? 'award' : 'badge' }}</h3>
              <div class="sub">{{ milestoneLabel(current.tier.m) }}</div>
            </div>
          </div>

          <div class="kicker">Why this badge exists</div>
          <p class="why">{{ current.tier.why }}</p>

          <div class="kicker">{{ current.i.earned ? 'How you earned it' : 'What you need to earn it' }}</div>
          <p v-if="current.i.unavailable && !current.i.earned" class="sub">
            Your department does not have enough published lessons for this block yet. It will unlock once more lessons are added.
          </p>
          <ul v-else class="chk">
            <li>
              <span class="ic" :class="current.i.lessonsDone ? 'ok' : 'no'">{{ current.i.lessonsDone ? '✓' : '1' }}</span>
              <div>
                <b>Complete {{ lessonScope }}</b>
                <div class="sub">{{ current.i.done }} of {{ current.i.total }} lessons done</div>
              </div>
            </li>
            <li>
              <span class="ic" :class="current.i.earned ? 'ok' : 'no'">{{ current.i.earned ? '✓' : '2' }}</span>
              <div>
                <b>Pass the milestone quiz</b>
                <div class="sub">
                  {{ QUESTIONS_PER_QUIZ }} questions · {{ QUESTION_TIME_SECONDS / 60 }} minutes each · pass mark {{ passPct }}% · {{ BASE_MAX_ATTEMPTS }} attempts
                </div>
              </div>
            </li>
            <li>
              <span class="ic" :class="current.i.earned ? 'ok' : 'no'">{{ current.i.earned ? '✓' : '3' }}</span>
              <div>
                <b>Certificate issued</b>
                <div class="sub">Created automatically as soon as you pass</div>
              </div>
            </li>
          </ul>

          <template v-if="!current.i.earned && !current.i.unavailable">
            <div class="kicker">Your progress</div>
            <div class="bar"><i :style="{ width: (current.i.total ? (current.i.done / current.i.total) * 100 : 0) + '%' }" /></div>
            <div class="sub">{{ current.i.done }} of {{ current.i.total }} lessons done</div>
            <p v-if="current.i.locked" class="sub" style="margin-top: 8px">You used all {{ current.i.max }} attempts. Please contact your admin for an extra attempt.</p>
            <RouterLink v-else-if="current.i.pending" :to="`/app/quiz/${current.tier.m}`" class="btn btn-primary" style="margin-top: 12px">Take the quiz →</RouterLink>
            <RouterLink v-else to="/app/catalog" class="btn btn-primary" style="margin-top: 12px">Continue learning →</RouterLink>
          </template>
        </div>

        <div>
          <template v-if="current.i.earned">
            <div class="card" style="padding: 20px; margin-bottom: 16px">
              <div class="kicker">Your result</div>
              <div class="facts">
                <div class="fact"><b>{{ pct(current.i.passedAttempt!) }}%</b><span>Quiz score ({{ current.i.passedAttempt!.score }}/{{ current.i.passedAttempt!.total }})</span></div>
                <div class="fact"><b>{{ current.i.passedAttempt!.attempt_number }} of {{ current.i.max }}</b><span>Attempt that passed</span></div>
                <div class="fact"><b>{{ fmtDate(current.i.passedAttempt!.created_at) }}</b><span>Date earned</span></div>
                <div class="fact"><b>{{ certId(current.tier.m) }}</b><span>Certificate ID</span></div>
              </div>
              <div v-if="current.i.attempts.length > 1" class="sub" style="margin-top: 10px">
                Attempts: {{ current.i.attempts.map((a) => pct(a) + '%').join(' → ') }}
              </div>
            </div>
            <div class="card" style="padding: 20px">
              <div class="cert">
                <small>CERTIFICATE OF ACHIEVEMENT</small>
                <h4>Captain LMS</h4>
                <div class="sub">This certifies that</div>
                <div class="nm">{{ auth.profile?.full_name }}</div>
                <div class="sub">has passed the <b>{{ current.tier.name }}</b> {{ current.tier.m === 'final' ? 'Final Assessment' : 'milestone quiz' }}</div>
                <div style="font-size: 30px; margin: 8px 0">{{ current.tier.icon }}</div>
                <div class="sub">{{ fmtDate(current.i.passedAttempt!.created_at) }}</div>
              </div>
              <RouterLink :to="`/app/certificate/${current.tier.m}`" class="btn btn-primary" style="margin-top: 12px">View full certificate</RouterLink>
            </div>
          </template>
          <template v-else>
            <div class="card" style="padding: 20px; margin-bottom: 16px">
              <div class="kicker">What you will get</div>
              <div class="cert dim">
                <small>CERTIFICATE OF ACHIEVEMENT</small>
                <h4>Captain LMS</h4>
                <div class="nm">{{ auth.profile?.full_name }}</div>
                <div class="sub">{{ current.tier.name }} {{ current.tier.m === 'final' ? 'award' : 'milestone' }}</div>
                <div style="font-size: 30px; margin: 8px 0; filter: grayscale(1)">{{ current.tier.icon }}</div>
              </div>
            </div>
            <div v-if="current.i.attempts.length" class="card" style="padding: 20px">
              <div class="kicker">Your attempts</div>
              <div class="sub">Best score {{ current.i.best }}% · pass mark {{ passPct }}%</div>
              <ul class="chk">
                <li v-for="a in current.i.attempts" :key="a.id">
                  <span class="ic no">{{ a.attempt_number }}</span>
                  <div><b>{{ pct(a) }}%</b> <span class="sub">({{ a.score }}/{{ a.total }}) · {{ fmtDate(a.created_at) }}</span></div>
                </li>
              </ul>
            </div>
          </template>
        </div>
      </div>
    </template>
    <CertificatePreview v-if="preview" :url="preview.url" :filename="preview.filename" :title="preview.title" @close="preview = null" />
  </div>
</template>

<style scoped>
.grid3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 16px;
}
@media (max-width: 640px) {
  .grid3 {
    grid-template-columns: 1fr;
  }
}
.ach-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.ach {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px;
}
.ach-ic {
  font-size: 30px;
}
.ach.off .ach-ic {
  filter: grayscale(1);
  opacity: 0.6;
}
.pick {
  position: relative;
}
.tt {
  display: none;
  position: absolute;
  z-index: 30;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translateX(-50%);
  width: 230px;
  background: #101a33;
  color: #fff;
  border-radius: 12px;
  padding: 11px 13px;
  font-size: 12px;
  line-height: 1.5;
  font-weight: 500;
  text-align: left;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  pointer-events: none;
}
.tt b,
.tt span {
  display: block;
}
.tt b {
  margin-bottom: 4px;
}
.pick:hover .tt,
.pick:focus-visible .tt,
.pick:focus .tt {
  display: block;
}
.how {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 18px;
}
.how div {
  background: var(--blue-soft);
  border-radius: 14px;
  padding: 14px;
  font-size: 13px;
}
.how b {
  display: block;
  margin-bottom: 4px;
  color: var(--blue);
}
.badge-grid {
  grid-template-columns: repeat(6, 1fr);
}
@media (max-width: 640px) {
  .badge-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
.pick {
  border: 2px solid transparent;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.pick.sel {
  border-color: var(--blue);
}
.detail {
  display: grid;
  grid-template-columns: 1.25fr 1fr;
  gap: 16px;
  margin-top: 18px;
}
.big {
  font-size: 60px;
  line-height: 1;
}
h3 {
  margin: 6px 0 2px;
  font-size: 21px;
}
.why {
  font-size: 14px;
  line-height: 1.55;
  margin: 4px 0 8px;
}
.chk {
  list-style: none;
  padding: 0;
  margin: 0;
}
.chk li {
  display: flex;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
}
.chk li:last-child {
  border: 0;
}
.ic {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 800;
  flex: none;
}
.ic.ok {
  background: var(--teal);
  color: #fff;
}
.ic.no {
  background: var(--surface-sunken);
  color: var(--ink-soft);
}
.facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.fact {
  background: var(--surface-sunken);
  border-radius: 12px;
  padding: 10px 12px;
}
.fact b {
  display: block;
  font-size: 16px;
}
.fact span {
  font-size: 11.5px;
  color: var(--ink-soft);
}
.cert {
  border: 3px double var(--brass);
  border-radius: 14px;
  padding: 22px;
  text-align: center;
}
.cert small {
  letter-spacing: 0.2em;
  color: var(--brass);
  font-weight: 800;
  font-size: 11px;
}
.cert h4 {
  margin: 8px 0 2px;
  font-size: 20px;
}
.cert .nm {
  font-size: 22px;
  font-weight: 800;
  color: var(--blue);
  margin: 8px 0;
}
.cert.dim {
  opacity: 0.55;
}
@media (max-width: 900px) {
  .detail,
  .how {
    grid-template-columns: 1fr;
  }
}
</style>
