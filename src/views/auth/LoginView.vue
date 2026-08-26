<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabaseConfigured } from '@/lib/supabase'
import ThemeToggle from '@/components/ThemeToggle.vue'

const DEPARTMENTS = ['Sales', 'Engineering', 'Finance', 'Operations', 'Marketing', 'Customer Support']

const router = useRouter()
const auth = useAuthStore()

const mode = ref<'signin' | 'signup'>('signin')
const email = ref('')
const password = ref('')
const fullName = ref('')
const department = ref(DEPARTMENTS[0] ?? 'Sales')
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    if (mode.value === 'signin') {
      await auth.signIn(email.value, password.value)
      if (auth.role === 'admin') router.push('/admin')
      else if (auth.role === 'manager') router.push('/manager')
      else router.push('/app')
    } else {
      await auth.signUp(email.value, password.value, fullName.value, department.value)
      error.value = 'Check your inbox to confirm your email, then sign in.'
      mode.value = 'signin'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="theme-cycle-btn auth-theme-toggle">
      <ThemeToggle variant="icon" />
    </div>

    <div class="auth-card">
      <div class="auth-visual">
        <div class="brandmark"><span class="mark">C</span><span style="color: #fff">Captain LMS</span></div>
        <blockquote>
          &ldquo;Everyone used to sit through the same videos, whether it applied to them or not. Now each team
          sees their own training, and nothing else.&rdquo;
        </blockquote>
        <div class="badge-strip">
          <span class="badge-chip">🥉</span><span class="badge-chip">🥈</span><span class="badge-chip">🥇</span
          ><span class="badge-chip">💎</span><span class="badge-chip">🏆</span>
        </div>
      </div>

      <div class="auth-form">
        <h2>{{ mode === 'signin' ? 'Sign in' : 'Create account' }}</h2>
        <p class="sub">Captain LMS</p>

        <div v-if="!supabaseConfigured" class="banner banner-danger">
          Supabase isn't connected yet — copy <code>.env.example</code> to <code>.env.local</code>. See README.md.
        </div>

        <form @submit.prevent="submit">
          <div v-if="mode === 'signup'" class="field">
            <label>Full name</label>
            <input v-model="fullName" type="text" required />
          </div>
          <div class="field">
            <label>Work email</label>
            <input v-model="email" type="email" required />
          </div>
          <div class="field">
            <label>Password</label>
            <input v-model="password" type="password" required minlength="6" />
          </div>
          <div v-if="mode === 'signup'" class="field">
            <label>Department</label>
            <select v-model="department">
              <option v-for="d in DEPARTMENTS" :key="d" :value="d">{{ d }}</option>
            </select>
          </div>

          <p v-if="error" class="auth-error">{{ error }}</p>

          <button class="btn btn-primary" type="submit" :disabled="busy" style="width: 100%; justify-content: center">
            {{ busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up' }}
          </button>
        </form>

        <p class="auth-switch">
          <template v-if="mode === 'signin'">
            New here? <button type="button" @click="mode = 'signup'">Create an account</button>
          </template>
          <template v-else>
            Already have an account? <button type="button" @click="mode = 'signin'">Sign in</button>
          </template>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  position: relative;
}
.auth-theme-toggle {
  position: fixed;
  top: 16px;
  right: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow);
}
.auth-card {
  width: 100%;
  max-width: 860px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}
@media (max-width: 720px) {
  .auth-card {
    grid-template-columns: 1fr;
  }
  .auth-visual {
    display: none;
  }
}
.auth-visual {
  background:
    radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--brass) 20%, transparent), transparent 55%),
    linear-gradient(160deg, #161c30, #232c4d 60%, #161c30);
  color: #f1f2f6;
  padding: 40px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.auth-visual blockquote {
  font-family: 'Newsreader';
  font-style: italic;
  font-weight: 500;
  font-size: 19px;
  line-height: 1.45;
  color: #f6f0e2;
}
.badge-strip {
  display: flex;
  gap: 10px;
}
.badge-chip {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--brass) 35%, #1a1400);
  border: 1px solid rgba(238, 194, 106, 0.5);
  display: grid;
  place-items: center;
  font-size: 16px;
}
.auth-form {
  background: var(--surface);
  padding: 36px 38px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.auth-form h2 {
  font-size: 23px;
  margin-bottom: 2px;
}
.auth-form .sub {
  color: var(--ink-soft);
  font-size: 13.5px;
  margin-bottom: 18px;
}
.banner {
  font-size: 12.5px;
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 16px;
}
.banner-danger {
  background: var(--danger-soft);
  color: var(--danger);
}
.auth-error {
  color: var(--danger);
  font-size: 13px;
  margin-bottom: 12px;
}
.auth-switch {
  margin-top: 16px;
  font-size: 13px;
  color: var(--ink-soft);
}
.auth-switch button {
  background: none;
  border: none;
  color: var(--brass-strong);
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
}
</style>
