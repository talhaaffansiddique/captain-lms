// Netlify Function — admin-only employee management that needs the Supabase service-role key:
// create (invite), update name/role, deactivate, reactivate, delete, and look up an email address.
// Runs server-side so the service-role key never reaches the browser.
//
// Environment variables (already set for the invite function):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Deactivating bans the auth user (so they genuinely can't sign in or refresh a session) and sets
// profiles.is_active = false so reports and leaderboards can hide them. Their history is kept.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type Action = 'create' | 'update' | 'deactivate' | 'reactivate' | 'delete' | 'get'
const ROLES = ['employee', 'manager', 'admin']
const BAN_FOREVER = '876000h' // ~100 years

interface Body {
  action?: Action
  id?: string
  email?: string
  full_name?: string
  department?: string
  role?: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

// Never leave the company without an active admin.
async function otherActiveAdmins(db: SupabaseClient, excludeId: string): Promise<number> {
  const { count } = await db
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('is_active', true)
    .neq('id', excludeId)
  return count ?? 0
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
  const callerId = userData.user.id
  const { data: caller } = await db.from('profiles').select('role').eq('id', callerId).single()
  if (caller?.role !== 'admin') return json({ error: 'Admins only' }, 403)

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return json({ error: 'Invalid request body' }, 400)
  }
  const { action, id } = body

  if (action === 'create') {
    const email = body.email?.trim().toLowerCase()
    const fullName = body.full_name?.trim()
    const role = body.role ?? 'employee'
    const department = body.department?.trim() || 'General'
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400)
    if (!fullName) return json({ error: 'Enter the employee’s name.' }, 400)
    if (!ROLES.includes(role)) return json({ error: 'Invalid role.' }, 400)

    const { data, error } = await db.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, department, role: 'employee' },
    })
    if (error || !data.user) return json({ error: error?.message ?? 'Could not send the invite.' }, 400)
    // The role is applied here, server-side, rather than trusted from sign-up metadata.
    await db.from('profiles').update({ role, full_name: fullName, department }).eq('id', data.user.id)
    return json({ ok: true, id: data.user.id })
  }

  if (!id) return json({ error: 'id is required' }, 400)
  const { data: target } = await db.from('profiles').select('id, role, full_name').eq('id', id).single()
  if (!target) return json({ error: 'Employee not found' }, 404)

  if (action === 'get') {
    const { data } = await db.auth.admin.getUserById(id)
    return json({
      email: data.user?.email ?? null,
      last_sign_in_at: data.user?.last_sign_in_at ?? null,
      confirmed: !!data.user?.email_confirmed_at,
    })
  }

  if (action === 'update') {
    const patch: Record<string, string> = {}
    if (body.full_name !== undefined) {
      if (!body.full_name.trim()) return json({ error: 'Name can’t be empty.' }, 400)
      patch.full_name = body.full_name.trim()
    }
    if (body.role !== undefined) {
      if (!ROLES.includes(body.role)) return json({ error: 'Invalid role.' }, 400)
      if (target.role === 'admin' && body.role !== 'admin' && (await otherActiveAdmins(db, id)) === 0) {
        return json({ error: 'This is the only active admin — make someone else an admin first.' }, 400)
      }
      patch.role = body.role
    }
    if (!Object.keys(patch).length) return json({ error: 'Nothing to update.' }, 400)
    const { error } = await db.from('profiles').update(patch).eq('id', id)
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  if (action === 'deactivate' || action === 'delete') {
    if (id === callerId) return json({ error: `You can't ${action} your own account.` }, 400)
    if (target.role === 'admin' && (await otherActiveAdmins(db, id)) === 0) {
      return json({ error: 'This is the only active admin — make someone else an admin first.' }, 400)
    }
  }

  if (action === 'deactivate') {
    const { error: profileError } = await db.from('profiles').update({ is_active: false }).eq('id', id)
    if (profileError) {
      return json({ error: `${profileError.message} — has the is_active column been added? (see supabase/schema.sql)` }, 500)
    }
    const { error } = await db.auth.admin.updateUserById(id, { ban_duration: BAN_FOREVER })
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  if (action === 'reactivate') {
    const { error: profileError } = await db.from('profiles').update({ is_active: true }).eq('id', id)
    if (profileError) return json({ error: profileError.message }, 500)
    const { error } = await db.auth.admin.updateUserById(id, { ban_duration: 'none' })
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  if (action === 'delete') {
    // Deleting the auth user cascades to profiles and, through it, completions, attempts and grants.
    const { error } = await db.auth.admin.deleteUser(id)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  return json({ error: 'Unknown action' }, 400)
}
