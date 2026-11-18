// Netlify Function — click tracking for emails. The "Open Captain LMS" button in an email points
// here with the email's log id; we record the click in email_log, then redirect to the site.
// The redirect target is fixed (never taken from the request), so this can't be used as an open
// redirect. Always redirects, even if logging fails, so the recipient is never stuck.

import { createClient } from '@supabase/supabase-js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async (req: Request) => {
  const site = (process.env.URL ?? 'https://captain-lms.netlify.app').replace(/\/$/, '')
  const id = new URL(req.url).searchParams.get('id') ?? ''

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (UUID_RE.test(id) && supabaseUrl && serviceRoleKey) {
    try {
      const db = createClient(supabaseUrl, serviceRoleKey)
      const { data } = await db.from('email_log').select('click_count, clicked_at').eq('id', id).maybeSingle()
      if (data) {
        await db
          .from('email_log')
          .update({ click_count: (data.click_count ?? 0) + 1, clicked_at: data.clicked_at ?? new Date().toISOString() })
          .eq('id', id)
      }
    } catch (e) {
      console.error('email-click: could not record click', e)
    }
  }
  return new Response(null, { status: 302, headers: { location: site, 'cache-control': 'no-store' } })
}
