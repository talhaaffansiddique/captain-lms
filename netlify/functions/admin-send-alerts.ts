// Netlify Function — admin-only "Send alerts now" / "Preview" for Monitoring & Alerts.
// Body: { preview?: boolean }. With preview, nothing is sent; the list of alerts is returned.

import { createClient } from '@supabase/supabase-js'
import { mailConfigured } from './_shared/mailer'
import { findAlerts, loadSettings, sendAlerts } from './_shared/alerts'

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

  let preview = false
  try {
    preview = !!((await req.json()) as { preview?: boolean }).preview
  } catch {
    /* no body */
  }

  const probe = await db.from('monitoring_settings').select('id').limit(1)
  if (probe.error) return json({ error: 'Monitoring needs the v5 database update — run supabase/v5.sql in Supabase first.' }, 500)

  const settings = await loadSettings(db)
  const alerts = await findAlerts(db, settings)
  if (preview) return json({ alerts })

  if (!mailConfigured()) return json({ error: 'Email is not configured (SMTP settings are missing in Netlify).' }, 500)
  const site = (process.env.URL ?? 'https://captain-lms.netlify.app').replace(/\/$/, '')
  const summary = await sendAlerts(db, settings, alerts, site)
  return json({ alerts: alerts.length, ...summary })
}
