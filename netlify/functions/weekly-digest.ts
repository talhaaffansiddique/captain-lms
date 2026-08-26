// Netlify Scheduled Function — runs on a cron schedule, entirely free on Netlify's free tier.
// Docs: https://docs.netlify.com/functions/scheduled-functions/
//
// To enable: uncomment the `schedule` export below and set these environment variables in the
// Netlify dashboard (Site settings → Environment variables):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (service role, not the anon key — this runs server-side)
//   RESEND_API_KEY                            (from resend.com, free tier)
//
// This is a stub — wire up the actual query + email send once Supabase + Resend are connected.
// See src/views/employee/... for the equivalent logic already proven out in captain-lms-demo.html
// (openDigestPreview in that file is the reference for what the email should contain).

import type { Config } from '@netlify/functions'

export default async () => {
  // TODO:
  // 1. Query Supabase for employees behind schedule / this week's completions
  // 2. Build the digest email HTML
  // 3. Send via Resend (https://resend.com/docs/send-with-nodejs), from an address on
  //    captainandcompany.com once that domain is verified in Resend
  console.log('weekly-digest function ran (stub — not yet sending real emails)')
  return new Response('ok')
}

// Uncomment to actually run this on a schedule (every Monday 8am UTC, as an example):
// export const config: Config = { schedule: '0 8 * * 1' }
