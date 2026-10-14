import { supabase } from '@/lib/supabase'

export interface ManageResult {
  ok?: boolean
  error?: string
  email?: string | null
  last_sign_in_at?: string | null
  confirmed?: boolean
}

export async function manageEmployee(body: {
  action: 'create' | 'update' | 'deactivate' | 'reactivate' | 'delete' | 'get'
  id?: string
  email?: string
  full_name?: string
  department?: string
  role?: string
}): Promise<ManageResult> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  try {
    const res = await fetch('/.netlify/functions/admin-manage-employee', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    const out = (await res.json()) as ManageResult
    if (!res.ok) return { error: out.error ?? 'Something went wrong.' }
    return out
  } catch {
    return { error: 'Could not reach the employee service. This only works on the deployed site, not local dev.' }
  }
}

/** Rows where is_active is missing (column not added yet) count as active. */
export function isActive(p: { is_active?: boolean }): boolean {
  return p.is_active !== false
}
