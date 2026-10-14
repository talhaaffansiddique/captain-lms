// Netlify Scheduled Function — runs on a cron schedule, entirely free on Netlify's free tier.
// Docs: https://docs.netlify.com/functions/scheduled-functions/
//
// Sends a weekly summary email to every admin (company-wide) and every manager (their own
// department only): modules completed this week, quizzes passed this week, and who's overdue
// on their compliance deadline.
//
// Requires these environment variables in the Netlify dashboard (Site settings → Environment
// variables) — same SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY already added for CSV import, plus:
//   RESEND_API_KEY   — from resend.com (free tier: 3,000 emails/month)
//   DIGEST_FROM      — sender address, e.g. "Captain LMS <digest@captainandcompany.com>" — the
//                       domain must be verified in Resend first (Resend → Domains → Add Domain,
//                       then add the DNS records it gives you wherever captainandcompany.com's
//                       DNS is managed)
//
// If RESEND_API_KEY isn't set yet, this just logs and exits — safe to deploy before Resend is
// configured.

import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { computeDeptSummaries, renderSummaryHtml } from './_shared/digest'

export default async () => {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendKey = process.env.RESEND_API_KEY
  const fromAddress = process.env.DIGEST_FROM

  if (!supabaseUrl || !serviceRoleKey) {
    console.log('weekly-digest: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set, skipping.')
    return new Response('ok')
  }
  if (!resendKey || !fromAddress) {
    console.log('weekly-digest: RESEND_API_KEY / DIGEST_FROM not set yet — skipping send.')
    return new Response('ok')
  }

  const db = createClient(supabaseUrl, serviceRoleKey)
  const summaries = await computeDeptSummaries(db)
  const { data: allProfiles } = await db.from('profiles').select('*')
  const profiles = (allProfiles ?? []).filter((p) => p.is_active !== false)

  async function sendEmail(to: string, subject: string, html: string) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: fromAddress, to, subject, html }),
    })
    if (!res.ok) console.error(`weekly-digest: failed to send to ${to}:`, await res.text())
  }

  let sentCount = 0
  for (const recipient of (profiles ?? []).filter((p) => p.role === 'admin' || p.role === 'manager')) {
    const { data: userData } = await db.auth.admin.getUserById(recipient.id)
    const email = userData?.user?.email
    if (!email) continue

    const scoped = recipient.role === 'admin' ? summaries : summaries.filter((s) => s.department === recipient.department)
    const subject =
      recipient.role === 'admin' ? 'Captain LMS — Weekly Digest (Company-wide)' : `Captain LMS — Weekly Digest (${recipient.department})`
    const html = `<h2>Hi ${recipient.full_name.split(' ')[0]},</h2><p>Here's this week's training summary:</p>${renderSummaryHtml(scoped)}`

    await sendEmail(email, subject, html)
    sentCount += 1
  }

  console.log(`weekly-digest: sent ${sentCount} digest email(s)`)
  return new Response('ok')
}

// Runs every Monday 8am UTC.
export const config: Config = { schedule: '0 8 * * 1' }
