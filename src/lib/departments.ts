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

/** Palette new audiences draw from; each new one gets the first colour nobody is using yet. */
export const AUDIENCE_PALETTE = ['#f08a24', '#15803d', '#8e44ad', '#e42226', '#0891b2', '#d4a017', '#db2777', '#4b5563', '#65a30d', '#2f5be8']
/** "General" is a built-in audience (not stored in the table), so its colour is fixed. */
export const GENERAL_COLOR = '#2f5be8'

export function pickUnusedColor(used: (string | null | undefined)[]): string {
  const taken = new Set([GENERAL_COLOR, ...used.filter(Boolean)] as string[])
  return AUDIENCE_PALETTE.find((c) => !taken.has(c)) ?? AUDIENCE_PALETTE[taken.size % AUDIENCE_PALETTE.length]!
}

/** audience name -> colour. Courses inherit their audience's colour from this. */
export async function loadAudienceColors(): Promise<Record<string, string>> {
  const map: Record<string, string> = { General: GENERAL_COLOR }
  const depts = await loadDepartments()
  const used: string[] = [GENERAL_COLOR]
  for (const d of depts) {
    const c = d.color ?? pickUnusedColor(used)
    map[d.name] = c
    used.push(c)
  }
  return map
}

export async function addDepartment(name: string): Promise<{ error: string | null }> {
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Name is required.' }
  const existing = await loadDepartments()
  const color = pickUnusedColor(existing.map((d) => d.color))
  let { error } = await supabase.from('departments').insert({ name: trimmed, color })
  // The colour column only exists once supabase/v5.sql has been run — fall back to a plain insert.
  if (error && /color/i.test(error.message)) ({ error } = await supabase.from('departments').insert({ name: trimmed }))
  if (error) return { error: error.message.includes('duplicate') ? 'That department already exists.' : error.message }
  return { error: null }
}

export async function deleteDepartment(id: number): Promise<{ error: string | null }> {
  const { error } = await supabase.from('departments').delete().eq('id', id)
  return { error: error?.message ?? null }
}

export async function setDepartmentColor(id: number, color: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('departments').update({ color }).eq('id', id)
  return { error: error?.message ?? null }
}
