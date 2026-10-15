<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { shuffle } from '@/lib/quiz'
import BaseModal from '@/components/BaseModal.vue'
import type { QuizQuestion } from '@/lib/database.types'

// A low-stakes practice round drawn from the course's question banks. Nothing here is recorded:
// real milestone quizzes keep their time limits, attempt caps and badges.
const props = defineProps<{ courseTitle: string; lessonIds: number[] }>()
const emit = defineEmits<{ close: [] }>()

const questions = ref<{ q: string; options: string[]; correct: number }[]>([])
const loading = ref(true)
const index = ref(0)
const picked = ref<number | null>(null)
const score = ref(0)
const finished = ref(false)

onMounted(async () => {
  const { data } = await supabase.from('quiz_questions').select('*').in('module_id', props.lessonIds)
  const drawn = shuffle((data ?? []) as QuizQuestion[]).slice(0, 5)
  questions.value = drawn.map((row) => {
    // Shuffle the options too, keeping track of where the correct one lands.
    const order = shuffle(row.options.map((_, i) => i))
    return { q: row.question, options: order.map((i) => row.options[i] as string), correct: order.indexOf(row.correct_index) }
  })
  loading.value = false
})

const current = computed(() => questions.value[index.value])

function pick(i: number) {
  if (picked.value !== null || !current.value) return
  picked.value = i
  if (i === current.value.correct) score.value++
}

function next() {
  if (index.value + 1 >= questions.value.length) finished.value = true
  else {
    index.value++
    picked.value = null
  }
}
</script>

<template>
  <BaseModal title="Practice quiz" @close="emit('close')">
    <p v-if="loading" class="hint">Loading questions…</p>
    <p v-else-if="!questions.length" class="hint">
      No questions have been written for {{ courseTitle }} yet. Check back once your admin adds a question bank.
    </p>
    <div v-else-if="finished">
      <div class="kicker">Practice round complete</div>
      <h2 style="font-size: 28px; margin: 6px 0">You scored {{ score }} / {{ questions.length }}</h2>
      <p class="hint" style="margin-bottom: 14px">Practice only — it doesn't affect your badges. Real quizzes keep their time limits and attempt caps.</p>
      <button class="btn btn-primary" @click="emit('close')">Done</button>
    </div>
    <div v-else-if="current">
      <div class="kicker">{{ courseTitle }} · question {{ index + 1 }} of {{ questions.length }}</div>
      <h3 style="font-size: 18px; margin: 8px 0 14px">{{ current.q }}</h3>
      <button
        v-for="(o, i) in current.options"
        :key="i"
        class="opt"
        :class="{ ok: picked !== null && i === current.correct, no: picked === i && i !== current.correct }"
        :disabled="picked !== null"
        @click="pick(i)"
      >
        <b>{{ 'ABCD'[i] }}</b> {{ o }}
      </button>
      <button v-if="picked !== null" class="btn btn-primary" style="margin-top: 6px" @click="next">
        {{ index + 1 >= questions.length ? 'See score' : 'Next question' }}
      </button>
    </div>
  </BaseModal>
</template>

<style scoped>
.opt {
  display: flex;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 12px 14px;
  border: 1.5px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--ink);
  margin-bottom: 9px;
  font: 600 14px 'Plus Jakarta Sans', sans-serif;
  cursor: pointer;
}
.opt:disabled {
  cursor: default;
}
.opt.ok {
  border-color: var(--teal);
  background: var(--teal-soft);
}
.opt.no {
  border-color: var(--danger);
  background: var(--danger-soft);
}
</style>
