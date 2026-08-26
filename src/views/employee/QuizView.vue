<script setup lang="ts">
// TODO — this is a placeholder. Port the full quiz engine from captain-lms-demo.html:
//   - draw 5 random questions from quiz_questions for the modules feeding this milestone
//   - one question at a time, 3-minute per-question timer, immediate correct/incorrect feedback
//   - max 3 attempts (check quiz_attempts + quiz_attempt_grants before allowing a new attempt)
//   - on pass, insert into quiz_attempts and let the badge computation (see BadgesView) pick it up
// The demo file has this fully working in vanilla JS — treat it as the reference implementation.
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="card" style="padding: 24px">
    <h2 style="font-size: 20px; margin-bottom: 8px">Milestone Quiz {{ route.params.milestone }}</h2>
    <p style="color: var(--ink-soft)">
      Quiz engine not wired up yet in this scaffold — see the TODO in
      <code>src/views/employee/QuizView.vue</code> for what to port from the demo.
    </p>
  </div>
</template>
