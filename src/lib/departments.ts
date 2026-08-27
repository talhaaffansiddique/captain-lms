import { supabase } from './supabase'
import type { Department } from './database.types'

// Fallback used only if the departments table can't be reached (e.g. schema not migrated yet) —
// keeps the app usable rather than showing empty dropdowns everywhere.
const FALLBACK = ['Sales', 'Engineering', 'Finance', 'Operations', 'Marketing', 'Customer Support']

/** Real, assignable company departments — does NOT include "General", which is a reserved
 * built-in audience for company-wide modules, not a department anyone belongs to. */
export async function loadDepartments(): Promise<Department[]> {
  const { data, error } = await supabase.from('departments').select('*').order('name')
  if (error || !data || data.length === 0) {
    return FALLBACK.map((name, i) => ({ id: -(i + 1), name, created_at: '' }))
  }
  return data
}

export async function addDepartment(name: string): Promise<{ error: string | null }> {
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Name is required.' }
  const { error } = await supabase.from('departments').insert({ name: trimmed })
  if (error) return { error: error.message.includes('duplicate') ? 'That department already exists.' : error.message }
  return { error: null }
}

export async function deleteDepartment(id: number): Promise<{ error: string | null }> {
  const { error } = await supabase.from('departments').delete().eq('id', id)
  return { error: error?.message ?? null }
}
