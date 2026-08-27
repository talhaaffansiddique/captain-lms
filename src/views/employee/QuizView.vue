<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { notifyBadgeUnlocked } from '@/lib/notifications'
import {
  QUESTION_TIME_SECONDS,
  QUESTIONS_PER_QUIZ,
  PASS_THRESHOLD,
  RETRY_COOLDOWN_SECONDS,
  loadTrackData,
  moduleChunkForMilestone,
  reachedMilestones,
  attemptsFor,
  maxAttemptsFor,
  hasPassed,
  milestoneLabel,
  shuffle,
  type Milestone,
} from '@/lib/quiz'
import type { QuizQuestion } from '@/lib/database.types'

const route = useRoute()
const auth = useAuthStore()
const milestone = route.params.milestone as Milestone

type Phase = 'loading' | 'not-ready' | 'already-passed' | 'exhausted' | 'cooldown' | 'rules' | 'question' | 'feedback' | 'results'
const phase = ref<Phase>('loading')

const attemptNumber = ref(1)
const maxAttempts = ref(3)
const isFinalAttempt = ref(false)
const cooldownRemaining = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | undefined

interface RunQuestion extends QuizQuestion {
  shuffledOptions: string[]
  correctShuffledIndex: number
}
const quizQuestions = ref<RunQuestion[]>([])
const currentIndex = ref(0)
const selectedIndex = ref<number | null>(null)
const timeLeft = ref(QUESTION_TIME_SECONDS)
let questionTimer: ReturnType<typeof setInterval> | undefined
const score = ref(0)
const unanswered = ref<number[]>([])
const passed = ref(false)
const alreadyPassed = ref(false)

const currentQuestion = computed(() => quizQuestions.value[currentIndex.value])

function stopQuestionTimer() {
  if (questionTimer) clearInterval(questionTimer)
  questionTimer = undefined
}
function stopCooldownTimer() {
  if (cooldownTimer) clearInterval(cooldownTimer)
  cooldownTimer = undefined
}
onBeforeUnmount(() => {
  stopQuestionTimer()
  stopCooldownTimer()
})

onMounted(async () => {
  if (!auth.profile) return
  const { track, completions, attempts, grants } = await loadTrackData(auth.profile.id, auth.profile.department)

  if (hasPassed(milestone, attempts)) {
    alreadyPassed.value = true
    phase.value = 'already-passed'
    return
  }

  const reached = reachedMilestones(track, completions)
  if (!reached.includes(milestone)) {
    phase.value = 'not-ready'
    return
  }

  const used = attemptsFor(milestone, attempts)
  maxAttempts.value = maxAttemptsFor(milestone, grants)
  attemptNumber.value = used.length + 1

  if (used.length >= maxAttempts.value) {
    phase.value = 'exhausted'
    return
  }

  isFinalAttempt.value = attemptNumber.value === maxAttempts.value

  const lastAttempt = used[used.length - 1]
  if (lastAttempt && !lastAttempt.passed) {
    const elapsed = (Date.now() - new Date(lastAttempt.created_at).getTime()) / 1000
    const remaining = Math.ceil(RETRY_COOLDOWN_SECONDS - elapsed)
    if (remaining > 0) {
      cooldownRemaining.value = remaining
      phase.value = 'cooldown'
      cooldownTimer = setInterval(() => {
        cooldownRemaining.value -= 1
        if (cooldownRemaining.value <= 0) {
          stopCooldownTimer()
          phase.value = 'rules'
        }
      }, 1000)
      return
    }
  }

  const chunk = moduleChunkForMilestone(track, milestone)
  const chunkIds = chunk.map((m) => m.id)
  const { data: bank } = await supabase.from('quiz_questions').select('*').in('module_id', chunkIds)
  const drawn = shuffle((bank ?? []) as QuizQuestion[]).slice(0, QUESTIONS_PER_QUIZ)
  quizQuestions.value = drawn.map((q) => {
    const order = shuffle(q.options.map((_, i) => i))
    return {
      ...q,
      shuffledOptions: order.map((i) => q.options[i] as string),
      correctShuffledIndex: order.indexOf(q.correct_index),
    }
  })

  phase.value = 'rules'
})

function startQuiz() {
  currentIndex.value = 0
  score.value = 0
  unanswered.value = []
  selectedIndex.value = null
  startQuestionTimer()
  phase.value = 'question'
}

function startQuestionTimer() {
  timeLeft.value = QUESTION_TIME_SECONDS
  stopQuestionTimer()
  questionTimer = setInterval(() => {
    timeLeft.value -= 1
    if (timeLeft.value <= 0) {
      stopQuestionTimer()
      unanswered.value.push(currentIndex.value + 1)
      selectedIndex.value = -1
      phase.value = 'feedback'
    }
  }, 1000)
}

function selectAnswer(i: number) {
  if (phase.value !== 'question') return
  stopQuestionTimer()
  selectedIndex.value = i
  if (i === currentQuestion.value?.correctShuffledIndex) score.value += 1
  phase.value = 'feedback'
}

async function nextQuestion() {
  if (currentIndex.value + 1 < quizQuestions.value.length) {
    currentIndex.value += 1
    selectedIndex.value = null
    startQuestionTimer()
    phase.value = 'question'
  } else {
    await finishQuiz()
  }
}

async function finishQuiz() {
  const total = quizQuestions.value.length
  passed.value = score.value / total >= PASS_THRESHOLD
  await supabase.from('quiz_attempts').insert({
    user_id: auth.profile!.id,
    milestone,
    attempt_number: attemptNumber.value,
    score: score.value,
    total,
    passed: passed.value,
    questions_snapshot: quizQuestions.value.map((q) => ({ question: q.question, options: q.shuffledOptions })),
  })
  if (passed.value) {
    await notifyBadgeUnlocked(auth.profile!.id, milestone)
  }
  phase.value = 'results'
}
</script>

<template>
  <div class="card" style="padding: 24px; max-width: 640px">
    <div v-if="phase === 'loading'" style="color: var(--ink-soft)">Loading…</div>

    <div v-else-if="phase === 'not-ready'">
      <h2 style="font-size: 20px; margin-bottom: 8px">{{ milestoneLabel(milestone) }}</h2>
      <p style="color: var(--ink-soft)">Finish the modules feeding this quiz before you can take it.</p>
      <RouterLink class="btn btn-primary btn-sm" to="/app/modules" style="margin-top: 16px; display: inline-block">Back to modules</RouterLink>
    </div>

    <div v-else-if="phase === 'already-passed'">
      <h2 style="font-size: 20px; margin-bottom: 8px">{{ milestoneLabel(milestone) }}</h2>
      <p style="color: var(--teal)">You've already passed this quiz.</p>
      <RouterLink class="btn btn-primary btn-sm" to="/app/badges" style="margin-top: 16px; display: inline-block">View badges</RouterLink>
    </div>

    <div v-else-if="phase === 'exhausted'">
      <h2 style="font-size: 20px; margin-bottom: 8px">{{ milestoneLabel(milestone) }}</h2>
      <p style="color: var(--danger)">You've used all {{ maxAttempts }} attempts without passing. Contact your admin for an extra attempt.</p>
      <RouterLink class="btn btn-ghost btn-sm" to="/app/dashboard" style="margin-top: 16px; display: inline-block">Back to dashboard</RouterLink>
    </div>

    <div v-else-if="phase === 'cooldown'">
      <h2 style="font-size: 20px; margin-bottom: 8px">{{ milestoneLabel(milestone) }}</h2>
      <p style="color: var(--ink-soft)">You can retry in {{ cooldownRemaining }}s.</p>
    </div>

    <div v-else-if="phase === 'rules'">
      <h2 style="font-size: 20px; margin-bottom: 12px">{{ milestoneLabel(milestone) }} — Rules</h2>
      <ul style="padding-left: 20px; color: var(--ink-soft); line-height: 1.9">
        <li>{{ quizQuestions.length }} questions, drawn at random</li>
        <li>{{ QUESTION_TIME_SECONDS / 60 }} minutes per question — unanswered counts as wrong</li>
        <li>Pass threshold: {{ Math.round(PASS_THRESHOLD * 100) }}%</li>
        <li>This is attempt {{ attemptNumber }} of {{ maxAttempts }}<span v-if="isFinalAttempt"> — your final attempt</span></li>
      </ul>
      <button class="btn btn-primary" style="margin-top: 20px" @click="startQuiz">Start quiz</button>
    </div>

    <div v-else-if="phase === 'question' || phase === 'feedback'">
      <div class="topline" style="margin-bottom: 12px">
        <div>Question {{ currentIndex + 1 }} of {{ quizQuestions.length }}</div>
        <div :style="{ color: timeLeft <= 20 ? 'var(--danger)' : 'var(--ink-soft)', fontWeight: 700 }">{{ timeLeft }}s</div>
      </div>
      <h3 style="font-size: 17px; margin-bottom: 16px">{{ currentQuestion?.question }}</h3>
      <div style="display: flex; flex-direction: column; gap: 8px">
        <button
          v-for="(opt, i) in currentQuestion?.shuffledOptions"
          :key="i"
          class="btn btn-ghost"
          style="justify-content: flex-start; text-align: left"
          :style="
            phase === 'feedback'
              ? i === currentQuestion?.correctShuffledIndex
                ? 'border-color: var(--teal); background: var(--teal-soft)'
                : i === selectedIndex
                  ? 'border-color: var(--danger); background: var(--danger-soft)'
                  : ''
              : ''
          "
          :disabled="phase === 'feedback'"
          @click="selectAnswer(i)"
        >
          {{ opt }}
        </button>
      </div>
      <button v-if="phase === 'feedback'" class="btn btn-primary" style="margin-top: 16px" @click="nextQuestion">
        {{ currentIndex + 1 < quizQuestions.length ? 'Next question' : 'See results' }}
      </button>
    </div>

    <div v-else-if="phase === 'results'">
      <h2 style="font-size: 20px; margin-bottom: 8px">{{ passed ? 'Passed! 🎉' : 'Not quite' }}</h2>
      <p style="color: var(--ink-soft); margin-bottom: 8px">You scored {{ score }} of {{ quizQuestions.length }}.</p>
      <p v-if="unanswered.length" style="color: var(--ink-soft); margin-bottom: 8px">
        Unanswered: question{{ unanswered.length > 1 ? 's' : '' }} {{ unanswered.join(', ') }}
      </p>
      <p v-if="passed" style="color: var(--teal)">You unlocked a new badge — check My Badges.</p>
      <p v-else-if="isFinalAttempt" style="color: var(--danger)">That was your final attempt. Contact your admin for an extra try.</p>
      <p v-else style="color: var(--ink-soft)">You can retry in {{ RETRY_COOLDOWN_SECONDS }}s.</p>
      <div style="display: flex; gap: 8px; margin-top: 16px">
        <RouterLink v-if="passed" class="btn btn-primary btn-sm" to="/app/badges">View badges</RouterLink>
        <RouterLink class="btn btn-ghost btn-sm" to="/app/dashboard">Back to dashboard</RouterLink>
      </div>
    </div>
  </div>
</template>
