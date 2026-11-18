// Netlify Scheduled Function — once a day, sends the inactivity / deadline / overdue alert emails
// if the admin switched "Automatic daily alerts" on in Admin → Monitoring & alerts. Free on Netlify.

import { createClient } from '@supabase/supabase-js'
import type { Config } from '@netlify/functions'
import { mailConfigured } from './_shared/mailer'
import { findAlerts, loadSettings, sendAlerts } from './_shared/alerts'

export default async () => {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey || !mailConfigured()) {
    console.log('monitoring-daily: server or email not configured — skipping.')
    return
  }
  const db = createClient(supabaseUrl, serviceRoleKey)
  const settings = await loadSettings(db)
  if (!settings.enabled) {
    console.log('monitoring-daily: automatic alerts are switched off — skipping.')
    return
  }
  const alerts = await findAlerts(db, settings)
  const site = (process.env.URL ?? 'https://captain-lms.netlify.app').replace(/\/$/, '')
  const summary = await sendAlerts(db, settings, alerts, site)
  console.log('monitoring-daily:', JSON.stringify({ alerts: alerts.length, ...summary }))
}

// 05:00 UTC every day (09:00 in the UAE).
export const config: Config = { schedule: '0 5 * * *' }
