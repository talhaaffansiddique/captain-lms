// Netlify Function — admin-only "Send test email". Sends the Captain LMS test email to each
// address on its own (one separate message per person), and records every attempt in the
// email_log table: sent or failed, with the error text if it failed. The button in the email
// goes through email-click so a click is logged too.
//
// Body: { to?: string | string[] } — defaults to the signed-in admin's own address. Max 20.
// If the email_log table has not been created yet, emails still send (without click tracking)
// and the response says so.

import { createClient } from '@supabase/supabase-js'
import { mailConfigured, sendMail } from './_shared/mailer'
import { renderTestEmail } from './_shared/emailTemplate'

const SUBJECT = 'Captain LMS — test email'
const MAX_RECIPIENTS = 20
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server is not configured yet.' }, 500)

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Missing auth token' }, 401)

  const db = createClient(supabaseUrl, serviceRoleKey)
  const { data: userData, error: userError } = await db.auth.getUser(token)
  if (userError || !userData.user) return json({ error: 'Invalid session' }, 401)
  const { data: caller } = await db.from('profiles').select('role').eq('id', userData.user.id).single()
  if (caller?.role !== 'admin') return json({ error: 'Admins only' }, 403)

  if (!mailConfigured()) {
    const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'].filter((k) => !process.env[k])
    return json({ error: `Email is not configured. Missing: ${missing.join(', ')}` }, 500)
  }

  let requested: string[] = []
  try {
    const body = (await req.json()) as { to?: string | string[] }
    requested = (Array.isArray(body.to) ? body.to : body.to ? [body.to] : []).map((e) => e.trim()).filter(Boolean)
  } catch {
    requested = []
  }
  if (!requested.length && userData.user.email) requested = [userData.user.email]
  const recipients = [...new Set(requested.map((e) => e.toLowerCase()))]
  if (!recipients.length) return json({ error: 'No recipient given.' }, 400)
  if (recipients.length > MAX_RECIPIENTS) return json({ error: `At most ${MAX_RECIPIENTS} recipients at once.` }, 400)
  const bad = recipients.filter((e) => !EMAIL_RE.test(e))
  if (bad.length) return json({ error: `Not a valid email address: ${bad.join(', ')}` }, 400)

  const site = (process.env.URL ?? 'https://captain-lms.netlify.app').replace(/\/$/, '')
  const logoUrl = `${site}/email/captain-logo.png`
  let loggingOk = true

  const results: { to: string; status: 'sent' | 'failed'; error?: string }[] = []
  for (const to of recipients) {
    // One log row per email, created first so its id can go into the tracked button link.
    let logId: string | null = null
    if (loggingOk) {
      const { data, error } = await db
        .from('email_log')
        .insert({ to_email: to, subject: SUBJECT, kind: 'test', status: 'pending', sent_by: userData.user.id })
        .select('id')
        .single()
      if (error || !data) loggingOk = false
      else logId = data.id as string
    }
    const buttonUrl = logId ? `${site}/.netlify/functions/email-click?id=${logId}` : site

    try {
      await sendMail(to, SUBJECT, renderTestEmail(logoUrl, buttonUrl))
      results.push({ to, status: 'sent' })
      if (logId) await db.from('email_log').update({ status: 'sent' }).eq('id', logId)
    } catch (e) {
      const err = e as { code?: string; responseCode?: number; message?: string }
      const message = `${err.code ?? ''} ${err.responseCode ?? ''} ${err.message ?? 'Unknown error'}`.replace(/\s+/g, ' ').trim()
      results.push({ to, status: 'failed', error: message })
      if (logId) await db.from('email_log').update({ status: 'failed', error: message }).eq('id', logId)
    }
  }

  return json({
    ok: results.every((r) => r.status === 'sent'),
    results,
    logged: loggingOk,
    ...(loggingOk ? {} : { warning: 'Emails were sent but not logged: run supabase/email-log-v4.5.sql in Supabase first.' }),
  })
}
