// Netlify Function — bulk-invites employees from the CSV import UI (src/views/admin/EmployeesView.vue).
// Runs server-side so it can use the Supabase service role key, which must never reach the browser.
//
// Requires these environment variables in the Netlify dashboard (Site settings → Environment variables):
//   SUPABASE_URL               (same value as VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY  (Supabase → Settings → API → "service_role" secret key — NOT the
//                                publishable/anon key already used client-side)
//
// Auth model: the caller must be a signed-in admin. We verify the bearer token they send against
// Supabase Auth, then check their profiles.role — only then do we use the service-role client to
// invite anyone. This keeps the service-role key itself fully server-side while still gating the
// endpoint properly (no open invite-anyone-you-want endpoint).

import { createClient } from '@supabase/supabase-js'

interface InviteRow {
  full_name: string
  email: string
  department: string
}

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Server is not configured for invites yet.' }), { status: 500 })
  }

  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return new Response(JSON.stringify({ error: 'Missing auth token' }), { status: 401 })

  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 })
  }

  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', userData.user.id).single()
  if (callerProfile?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Admins only' }), { status: 403 })
  }

  let rows: InviteRow[]
  try {
    const body = (await req.json()) as { rows?: InviteRow[] }
    rows = body.rows ?? []
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 })
  }
  if (!rows.length) return new Response(JSON.stringify({ error: 'No rows to invite' }), { status: 400 })
  if (rows.length > 100) return new Response(JSON.stringify({ error: 'Max 100 rows per import' }), { status: 400 })

  const results: { email: string; success: boolean; error?: string }[] = []
  for (const row of rows) {
    const { error } = await admin.auth.admin.inviteUserByEmail(row.email, {
      data: { full_name: row.full_name, department: row.department, role: 'employee' },
    })
    results.push({ email: row.email, success: !error, error: error?.message })
    // Small delay between invites — Supabase's free-tier shared SMTP has a send-rate limit.
    await new Promise((resolve) => setTimeout(resolve, 400))
  }

  return new Response(JSON.stringify({ results }), { status: 200, headers: { 'content-type': 'application/json' } })
}
