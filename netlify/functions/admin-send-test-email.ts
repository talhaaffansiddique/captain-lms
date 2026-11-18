// Netlify Function — admin-only "Send test email". Sends one test message through the SMTP
// settings to the signed-in admin's own address, so the mailbox setup can be checked without
// emailing anyone else. Never returns the password; errors are reported in plain words.

import { createClient } from '@supabase/supabase-js'
import { mailConfigured, sendMail } from './_shared/mailer'

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
  const { data: caller } = await db.from('profiles').select('role, full_name').eq('id', userData.user.id).single()
  if (caller?.role !== 'admin') return json({ error: 'Admins only' }, 403)

  if (!mailConfigured()) {
    const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'].filter((k) => !process.env[k])
    return json({ error: `Email is not configured. Missing: ${missing.join(', ')}` }, 500)
  }

  // Defaults to the admin's own address; an admin may name another single address for the test.
  let requested: string | undefined
  try {
    requested = ((await req.json()) as { to?: string }).to?.trim()
  } catch {
    requested = undefined
  }
  if (requested && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requested)) return json({ error: 'That is not a valid email address.' }, 400)
  const to = requested || userData.user.email
  if (!to) return json({ error: 'Your account has no email address.' }, 400)

  try {
    await sendMail(
      to,
      'Captain LMS — test email',
      `<h2>Hi ${(caller.full_name ?? '').split(' ')[0]},</h2><p>This is a test email from Captain LMS. If you can read this, the email settings work.</p><p style="color:#666;font-size:12px">Sent from ${process.env.MAIL_FROM}</p>`,
    )
    return json({ ok: true, to, from: process.env.MAIL_FROM })
  } catch (e) {
    const err = e as { code?: string; responseCode?: number; message?: string }
    return json({ error: `Could not send: ${err.code ?? ''} ${err.responseCode ?? ''} ${err.message ?? ''}`.trim() }, 502)
  }
}
