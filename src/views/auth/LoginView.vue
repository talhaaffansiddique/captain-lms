<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabaseConfigured } from '@/lib/supabase'

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
  <div
    style="
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    "
  >
    <div class="card" style="width: 100%; max-width: 400px; padding: 32px">
      <h2 style="font-size: 24px; margin-bottom: 4px">
        {{ mode === 'signin' ? 'Sign in' : 'Create account' }}
      </h2>
      <p style="color: var(--ink-soft); font-size: 13.5px; margin-bottom: 20px">Captain LMS</p>

      <div
        v-if="!supabaseConfigured"
        style="
          background: var(--danger-soft);
          color: var(--danger);
          font-size: 12.5px;
          padding: 10px 12px;
          border-radius: 8px;
          margin-bottom: 16px;
        "
      >
        Supabase isn't connected yet — copy <code>.env.example</code> to <code>.env.local</code> and add your
        project URL + anon key. See README.md.
      </div>

      <form @submit.prevent="submit">
        <div v-if="mode === 'signup'" style="margin-bottom: 14px">
          <label>Full name</label>
          <input v-model="fullName" type="text" required />
        </div>
        <div style="margin-bottom: 14px">
          <label>Work email</label>
          <input v-model="email" type="email" required />
        </div>
        <div style="margin-bottom: 14px">
          <label>Password</label>
          <input v-model="password" type="password" required minlength="6" />
        </div>
        <div v-if="mode === 'signup'" style="margin-bottom: 14px">
          <label>Department</label>
          <select v-model="department">
            <option v-for="d in DEPARTMENTS" :key="d" :value="d">{{ d }}</option>
          </select>
        </div>

        <p v-if="error" style="color: var(--danger); font-size: 13px; margin-bottom: 12px">
          {{ error }}
        </p>

        <button class="btn btn-primary" type="submit" :disabled="busy" style="width: 100%; justify-content: center">
          {{ busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up' }}
        </button>
      </form>

      <p style="margin-top: 16px; font-size: 13px; color: var(--ink-soft)">
        <template v-if="mode === 'signin'">
          New here?
          <button
            type="button"
            style="background: none; border: none; color: var(--brass-strong); cursor: pointer; font-weight: 600"
            @click="mode = 'signup'"
          >
            Create an account
          </button>
        </template>
        <template v-else>
          Already have an account?
          <button
            type="button"
            style="background: none; border: none; color: var(--brass-strong); cursor: pointer; font-weight: 600"
            @click="mode = 'signin'"
          >
            Sign in
          </button>
        </template>
      </p>
    </div>
  </div>
</template>
