// Netlify Function — bulk employee invitations for CSV imports, delivered through Resend so a big
// import no longer hits Supabase's built-in email limit.
//
// How it works: Supabase creates the account and hands back a one-time sign-in link WITHOUT emailing
// it (auth.admin.generateLink); we then send that link ourselves with Resend, and record the outcome
// of every CSV row in the invite_rows table.
//
// Two modes (admin only):
//   { rows: [{ full_name, email, department }], batch_id }   – first send for these rows
//   { batch_id, retry: true, after_row }                     – retry ONLY the failed rows of a batch
//                                                              (after_row lets the page walk through them chunk by chunk)
// Each call handles at most CHUNK rows (the page calls again for the next chunk) so it stays inside
// Netlify's function time limit. Rows already sent are never sent again, and an existing account is
// reused, so a retry can't create duplicate employees.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, RESEND_FROM (e.g. "Captain Training <training@yourdomain.com>")

import { createClient } from '@supabase/supabase-js'
import { renderEmail } from './_shared/emailTemplate'

const CHUNK = 15
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface InviteIn {
  full_name: string
  email: string
  department: string
}

interface Row {
  id: number
  batch_id: string
  row_number: number
  full_name: string
  email: string
  department: string
  user_id: string | null
  status: 'pending' | 'sent' | 'failed'
  error: string | null
  attempts: number
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** Turns a Resend failure into something an admin can act on. */
function resendDiagnosis(status: number, message: string): string {
  const m = message.toLowerCase()
  if (status === 401 || status === 403 && m.includes('api key')) return `Resend ${status} · the API key is wrong or revoked. Check RESEND_API_KEY in Netlify.`
  if (m.includes('domain') && (m.includes('verif') || m.includes('not found'))) return `Resend ${status} · the sending domain is not verified in Resend. Verify it (DNS records) or change RESEND_FROM. (${message})`
  if (status === 403 && m.includes('testing')) return `Resend ${status} · the Resend account is in testing mode and can only send to its own address. Verify a domain. (${message})`
  if (status === 422) return `Resend ${status} · the address or message was rejected. Check the email address for typos. (${message})`
  if (status === 429) return `Resend ${status} · sending too fast or daily limit reached. Wait a few minutes and use Retry failed invites. (${message})`
  return `Resend ${status} · ${message}`
}

async function sendWithResend(apiKey: string, from: string, to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    })
    if (res.ok) return { ok: true }
    let message = res.statusText
    try {
      const b = (await res.json()) as { message?: string; error?: string }
      message = b.message ?? b.error ?? message
    } catch {
      /* keep statusText */
    }
    return { ok: false, error: resendDiagnosis(res.status, message) }
  } catch (e) {
    return { ok: false, error: `Could not reach Resend · ${e instanceof Error ? e.message : 'network error'}` }
  }
}

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM || process.env.DIGEST_FROM
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server is not configured for invites yet.' }, 500)
  if (!resendKey || !from) return json({ error: 'Email sending is not configured: add RESEND_API_KEY and RESEND_FROM in Netlify → Environment variables, then redeploy.' }, 500)

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Missing auth token' }, 401)
  const db = createClient(supabaseUrl, serviceRoleKey)
  const { data: userData, error: userError } = await db.auth.getUser(token)
  if (userError || !userData.user) return json({ error: 'Invalid session' }, 401)
  const { data: caller } = await db.from('profiles').select('role').eq('id', userData.user.id).single()
  if (caller?.role !== 'admin') return json({ error: 'Admins only' }, 403)

  let body: { rows?: InviteIn[]; batch_id?: string; retry?: boolean; after_row?: number }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request body' }, 400)
  }
  const batchId = body.batch_id
  if (!batchId) return json({ error: 'batch_id is required' }, 400)

  const probe = await db.from('invite_rows').select('id').limit(1)
  if (probe.error) return json({ error: 'The invite log table is missing — run supabase/v5.sql in Supabase first.' }, 500)

  const site = (process.env.URL ?? 'https://captain-lms.netlify.app').replace(/\/$/, '')
  const logo = `${site}/email/captain-logo.png`

  // ---- work out which rows to process in this call
  let work: Row[] = []
  if (body.retry) {
    const { data } = await db.from('invite_rows').select('*').eq('batch_id', batchId).eq('status', 'failed').gt('row_number', body.after_row ?? 0).order('row_number').limit(CHUNK)
    work = (data ?? []) as Row[]
  } else {
    const rows = (body.rows ?? []).slice(0, CHUNK)
    if (!rows.length) return json({ error: 'No rows to invite' }, 400)
    const { count } = await db.from('invite_rows').select('id', { count: 'exact', head: true }).eq('batch_id', batchId)
    const base = count ?? 0
    const insert = rows.map((r, i) => ({
      batch_id: batchId,
      row_number: base + i + 1,
      full_name: (r.full_name ?? '').trim(),
      email: (r.email ?? '').trim().toLowerCase(),
      department: (r.department ?? '').trim() || 'General',
      status: 'pending',
    }))
    const { data, error } = await db.from('invite_rows').insert(insert).select('*')
    if (error) return json({ error: error.message }, 500)
    work = (data ?? []) as Row[]
  }

  const results: { id: number; row_number: number; email: string; status: 'sent' | 'failed'; error?: string; attempts: number }[] = []

  for (const row of work) {
    let status: 'sent' | 'failed' = 'failed'
    let err: string | null = null
    let userId = row.user_id

    if (!EMAIL_RE.test(row.email)) {
      err = 'Invalid email address — fix it in the CSV and import that row again.'
    } else {
      // 1. make sure the account exists (created once; reused on retry — never duplicated)
      let link: string | null = null
      const meta = { full_name: row.full_name, department: row.department, role: 'employee' }
      const first = await db.auth.admin.generateLink({ type: 'invite', email: row.email, options: { data: meta, redirectTo: site } })
      if (!first.error && first.data?.properties?.action_link) {
        link = first.data.properties.action_link
        userId = first.data.user?.id ?? userId
      } else if (first.error && /already|registered|exists/i.test(first.error.message)) {
        // The account exists. If this row created it (retry), send a fresh set-up link; otherwise it belongs to someone already on the platform.
        if (row.user_id) {
          const again = await db.auth.admin.generateLink({ type: 'recovery', email: row.email, options: { redirectTo: site } })
          if (!again.error && again.data?.properties?.action_link) link = again.data.properties.action_link
          else err = `Could not create a new set-up link: ${again.error?.message ?? 'unknown error'}`
        } else {
          err = 'This email already has an account on the platform — nothing to invite.'
        }
      } else {
        err = `Could not create the account: ${first.error?.message ?? 'unknown error'}`
      }

      // 2. send the link with Resend
      if (link) {
        const html = renderEmail({
          logoUrl: logo,
          buttonUrl: link,
          heading: 'Welcome to Captain LMS',
          paragraphs: [`Hi ${escapeHtml(row.full_name || 'there')},`, 'An account has been created for you on the Captain & Company learning platform.', 'Use the button below to set your password and start learning.'],
          buttonLabel: 'Set up my account',
          footerNote: 'If you were not expecting this email you can ignore it.',
        })
        const sent = await sendWithResend(resendKey, from, row.email, 'Welcome to Captain LMS — set up your account', html)
        if (sent.ok) status = 'sent'
        else err = sent.error ?? 'Unknown Resend error'
        // Resend's free plan allows 2 requests per second.
        await new Promise((r) => setTimeout(r, 600))
      }
    }

    const attempts = row.attempts + 1
    await db.from('invite_rows').update({ status, error: status === 'sent' ? null : err, user_id: userId, attempts, updated_at: new Date().toISOString() }).eq('id', row.id)
    results.push({ id: row.id, row_number: row.row_number, email: row.email, status, error: status === 'failed' ? (err ?? undefined) : undefined, attempts })
  }

  const { count: remaining } = await db.from('invite_rows').select('id', { count: 'exact', head: true }).eq('batch_id', batchId).eq('status', 'failed')
  return json({ results, failedInBatch: remaining ?? 0, processed: work.length, lastRow: results.length ? Math.max(...results.map((r) => r.row_number)) : (body.after_row ?? 0), chunk: CHUNK })
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
