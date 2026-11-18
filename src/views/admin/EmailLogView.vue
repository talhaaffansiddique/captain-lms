<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useSort } from '@/composables/useSort'
import { relativeTime } from '@/lib/learning'

interface LogRow {
  id: string
  to_email: string
  subject: string
  kind: string
  status: 'pending' | 'sent' | 'failed'
  error: string | null
  created_at: string
  clicked_at: string | null
  click_count: number
}

const rows = ref<LogRow[]>([])
const loading = ref(true)
const tableMissing = ref(false)
const loadError = ref('')

const recipients = ref('')
const sending = ref(false)
const sendMsg = ref('')
const sendError = ref('')

async function load() {
  loading.value = true
  const { data, error } = await supabase.from('email_log').select('*').order('created_at', { ascending: false }).limit(500)
  if (error) {
    if (/email_log|schema cache|does not exist/i.test(error.message)) tableMissing.value = true
    else loadError.value = error.message
  } else {
    tableMissing.value = false
    rows.value = (data ?? []) as LogRow[]
  }
  loading.value = false
}
onMounted(load)

const { sorted, toggle, indicator, ariaSort } = useSort(rows, {
  when: (r) => r.created_at,
  to: (r) => r.to_email.toLowerCase(),
  status: (r) => r.status,
  clicked: (r) => r.clicked_at,
})

const stats = computed(() => ({
  total: rows.value.length,
  sent: rows.value.filter((r) => r.status === 'sent').length,
  failed: rows.value.filter((r) => r.status === 'failed').length,
  clicked: rows.value.filter((r) => r.click_count > 0).length,
}))

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function sendTest() {
  sendMsg.value = ''
  sendError.value = ''
  const list = recipients.value
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean)
  if (!list.length) {
    sendError.value = 'Enter at least one email address.'
    return
  }
  sending.value = true
  try {
    const { data: sess } = await supabase.auth.getSession()
    const res = await fetch('/.netlify/functions/admin-send-test-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${sess.session?.access_token ?? ''}` },
      body: JSON.stringify({ to: list }),
    })
    const out = (await res.json()) as { error?: string; warning?: string; results?: { to: string; status: string; error?: string }[] }
    if (!res.ok) sendError.value = out.error ?? 'Could not send.'
    else {
      const ok = (out.results ?? []).filter((r) => r.status === 'sent').length
      const failed = (out.results ?? []).filter((r) => r.status === 'failed')
      sendMsg.value = `${ok} sent` + (failed.length ? `, ${failed.length} failed (${failed.map((f) => f.to).join(', ')})` : '') + (out.warning ? `. ${out.warning}` : '.')
      if (!failed.length) recipients.value = ''
    }
  } catch {
    sendError.value = 'Could not reach the email service.'
  }
  sending.value = false
  void load()
}
</script>

<template>
  <div>
    <div class="topline">
      <div>
        <h2>Email log</h2>
        <p>Every email the app sends: whether it was delivered to the mail server, any error, and whether the person clicked "Open Captain LMS". Admins only.</p>
      </div>
      <button class="btn btn-ghost btn-sm" @click="load">Refresh</button>
    </div>

    <div v-if="tableMissing" class="card" style="padding: 18px; margin-bottom: 16px">
      <b>One-time setup needed.</b>
      <p class="sub" style="margin-top: 6px">
        Run <code>supabase/email-log-v4.5.sql</code> in the Supabase SQL Editor to create the email log table. Emails can still be sent before that, but they won't be listed here and clicks won't be tracked.
      </p>
    </div>
    <p v-if="loadError" style="color: var(--danger)">{{ loadError }}</p>

    <div class="stats">
      <div class="card stat"><div class="lbl">Emails</div><div class="val">{{ stats.total }}</div></div>
      <div class="card stat"><div class="lbl">Sent</div><div class="val" style="color: var(--teal)">{{ stats.sent }}</div></div>
      <div class="card stat"><div class="lbl">Failed</div><div class="val" style="color: var(--danger)">{{ stats.failed }}</div></div>
      <div class="card stat dark"><div class="lbl">Clicked the button</div><div class="val">{{ stats.clicked }}</div></div>
    </div>

    <div class="card" style="padding: 18px; margin-bottom: 16px">
      <div class="kicker">Send a test email</div>
      <p class="sub" style="margin-bottom: 8px">Each address gets its own separate email. Separate addresses with commas, spaces or new lines (up to 20).</p>
      <textarea v-model="recipients" rows="3" placeholder="name@company.com, other@company.com" style="width: 100%" />
      <div class="row" style="margin-top: 10px; gap: 12px">
        <button class="btn btn-primary" :disabled="sending" @click="sendTest">{{ sending ? 'Sending…' : 'Send test email' }}</button>
        <span v-if="sendMsg" class="sub" style="color: var(--teal)">{{ sendMsg }}</span>
        <span v-if="sendError" class="sub" style="color: var(--danger)">{{ sendError }}</span>
      </div>
    </div>

    <p v-if="loading" class="sub">Loading…</p>
    <div v-else class="card table-wrap">
      <table>
        <thead>
          <tr>
            <th class="sortable" :aria-sort="ariaSort('when')" @click="toggle('when')">Sent <span class="sort-ind">{{ indicator('when') }}</span></th>
            <th class="sortable" :aria-sort="ariaSort('to')" @click="toggle('to')">To <span class="sort-ind">{{ indicator('to') }}</span></th>
            <th>Subject</th>
            <th class="sortable" :aria-sort="ariaSort('status')" @click="toggle('status')">Status <span class="sort-ind">{{ indicator('status') }}</span></th>
            <th class="sortable" :aria-sort="ariaSort('clicked')" @click="toggle('clicked')">Clicked button <span class="sort-ind">{{ indicator('clicked') }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in sorted" :key="r.id">
            <td class="sub" style="white-space: nowrap">{{ fmt(r.created_at) }}</td>
            <td><b>{{ r.to_email }}</b></td>
            <td class="sub">{{ r.subject }}</td>
            <td>
              <span class="pill" :class="r.status === 'sent' ? 'pill-teal' : r.status === 'failed' ? 'pill-danger' : 'pill-brass'">{{ r.status }}</span>
              <div v-if="r.error" class="sub" style="color: var(--danger); max-width: 320px; margin-top: 4px">{{ r.error }}</div>
            </td>
            <td>
              <template v-if="r.click_count > 0">
                <span class="pill pill-teal">✓ Clicked</span>
                <div class="sub">{{ relativeTime(r.clicked_at!) }} · {{ r.click_count }}×</div>
              </template>
              <span v-else class="sub">Not yet</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!sorted.length && !tableMissing" style="padding: 24px; text-align: center; color: var(--ink-soft)">No emails sent yet.</p>
    </div>
    <p class="sub" style="margin-top: 10px">
      "Sent" means the mail server accepted the email. Some companies' security scanners open links automatically, so a click can occasionally be a scanner rather than the person.
    </p>
  </div>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 16px;
}
@media (max-width: 900px) {
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
