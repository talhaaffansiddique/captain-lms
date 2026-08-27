// Netlify Function backing the "Preview weekly digest" button on the admin Overview page.
// Computes the same numbers weekly-digest.ts would email out, but just returns them as JSON —
// no email sent. Lets an admin see what the digest looks like without waiting for Monday or
// needing Resend configured yet.

import { createClient } from '@supabase/supabase-js'
import { computeDeptSummaries } from './_shared/digest'

export default async (req: Request) => {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Server is not configured yet.' }), { status: 500 })
  }

  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return new Response(JSON.stringify({ error: 'Missing auth token' }), { status: 401 })

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 })

  const { data: callerProfile } = await admin.from('profiles').select('role, department').eq('id', userData.user.id).single()
  if (!callerProfile || (callerProfile.role !== 'admin' && callerProfile.role !== 'manager')) {
    return new Response(JSON.stringify({ error: 'Admins and managers only' }), { status: 403 })
  }

  const summaries = await computeDeptSummaries(admin)
  const scoped = callerProfile.role === 'admin' ? summaries : summaries.filter((s) => s.department === callerProfile.department)

  return new Response(JSON.stringify({ summaries: scoped }), { status: 200, headers: { 'content-type': 'application/json' } })
}
