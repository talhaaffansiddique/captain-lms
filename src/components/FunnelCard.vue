<script setup lang="ts">
import { ref, computed } from 'vue'
import { courseCode } from '@/lib/courses'
import type { FunnelRow } from '@/lib/analytics'

const props = defineProps<{ rows: FunnelRow[] }>()
const view = ref<'cols' | 'rings'>('cols')

const W = 560
const H = 250
const PL = 46
const PB = 40
const PT = 18
const y = (v: number) => PT + (1 - v / 100) * (H - PT - PB)
const shown = computed(() => props.rows.slice(0, 6))
const groupW = computed(() => (W - PL - 10) / Math.max(1, shown.value.length))
const BAR_W = 26
const COLORS = ['var(--blue)', '#0f7f6c', 'var(--teal)']

function pct(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 100) : 0
}
function bars(r: FunnelRow) {
  return [100, pct(r.completed, r.started), pct(r.passed, r.started)]
}
const R1 = 46
const R2 = 34
const C1 = 2 * Math.PI * R1
const C2 = 2 * Math.PI * R2
</script>

<template>
  <div class="card" style="padding: 20px; margin-bottom: 16px">
    <div class="row wrap" style="margin-bottom: 6px">
      <div class="seg" title="Switch view">
        <button :class="{ on: view === 'cols' }" @click="view = 'cols'">▥ Compare</button>
        <button :class="{ on: view === 'rings' }" @click="view = 'rings'">◎ Rates</button>
      </div>
      <h2 style="font-size: 19px">Course funnel & drop-off</h2>
    </div>
    <p class="sub" style="margin-bottom: 8px">
      {{ view === 'cols' ? 'Each course side by side, as % of the people who started it.' : 'Finish rate (outer ring) and quiz pass rate (inner ring) for each course.' }}
    </p>

    <p v-if="!shown.length" class="sub" style="padding: 16px 0">No course activity yet.</p>

    <template v-else-if="view === 'cols'">
      <svg :viewBox="`0 0 ${W} ${H}`" style="width: 100%; display: block">
        <g v-for="v in [0, 50, 100]" :key="v">
          <line :x1="PL" :x2="W - 10" :y1="y(v)" :y2="y(v)" stroke="var(--border)" />
          <text :x="PL - 6" :y="y(v) + 4" text-anchor="end" class="axis">{{ v }}%</text>
        </g>
        <g v-for="(r, i) in shown" :key="r.course.id">
          <g v-for="(v, k) in bars(r)" :key="k">
            <rect
              :x="PL + i * groupW + groupW / 2 + (k - 1) * (BAR_W + 4) - BAR_W / 2"
              :y="y(v)"
              :width="BAR_W"
              :height="y(0) - y(v)"
              rx="6"
              :fill="COLORS[k]"
            >
              <title>{{ r.course.title }} · {{ ['Started', 'Completed', 'Passed a quiz'][k] }}: {{ v }}% of starters</title>
            </rect>
            <text
              v-if="k > 0"
              :x="PL + i * groupW + groupW / 2 + (k - 1) * (BAR_W + 4)"
              :y="y(v) - 5"
              text-anchor="middle"
              class="val"
            >{{ v }}</text>
          </g>
          <text :x="PL + i * groupW + groupW / 2" :y="H - 20" text-anchor="middle" class="lbl">{{ courseCode(r.course.title) }}</text>
        </g>
      </svg>
      <div class="row" style="gap: 16px; justify-content: center; flex-wrap: wrap">
        <span class="sub"><b style="color: var(--blue)">■</b> Started (100%)</span>
        <span class="sub"><b style="color: #0f7f6c">■</b> Completed</span>
        <span class="sub"><b style="color: var(--teal)">■</b> Passed a quiz</span>
      </div>
      <div class="legend">
        <span v-for="r in shown" :key="r.course.id" class="sub"><b>{{ courseCode(r.course.title) }}</b> = {{ r.course.title }} ({{ r.started }} started)</span>
      </div>
    </template>

    <div v-else class="rings">
      <div v-for="r in shown" :key="r.course.id" style="text-align: center">
        <svg viewBox="0 0 110 110" style="width: 100%; max-width: 130px">
          <circle cx="55" cy="55" :r="R1" fill="none" stroke="var(--surface-sunken)" stroke-width="9" />
          <circle cx="55" cy="55" :r="R1" fill="none" stroke="#0f7f6c" stroke-width="9" stroke-linecap="round" :stroke-dasharray="`${(C1 * pct(r.completed, r.started)) / 100} ${C1}`" transform="rotate(-90 55 55)" />
          <circle cx="55" cy="55" :r="R2" fill="none" stroke="var(--surface-sunken)" stroke-width="9" />
          <circle cx="55" cy="55" :r="R2" fill="none" stroke="var(--teal)" stroke-width="9" stroke-linecap="round" :stroke-dasharray="`${(C2 * pct(r.passed, r.started)) / 100} ${C2}`" transform="rotate(-90 55 55)" />
          <text x="55" y="60" text-anchor="middle" class="ring-pct">{{ pct(r.completed, r.started) }}%</text>
        </svg>
        <b style="font-size: 13px; display: block">{{ r.course.title }}</b>
        <div class="sub">{{ r.completed }} of {{ r.started }} finished · {{ r.passed }} passed</div>
        <div v-if="r.stopLesson" class="sub">⚠ drop-off at lesson {{ r.stopLesson.index + 1 }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.axis {
  fill: var(--ink-soft);
  font-size: 11px;
}
.val {
  fill: var(--ink);
  font-weight: 700;
  font-size: 10.5px;
}
.lbl {
  fill: var(--ink);
  font-weight: 700;
  font-size: 13px;
}
.ring-pct {
  fill: var(--ink);
  font-weight: 800;
  font-size: 19px;
}
.rings {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 14px;
  margin-top: 6px;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 8px;
}
</style>
