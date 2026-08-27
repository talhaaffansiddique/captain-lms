import { supabase } from './supabase'

export async function logActivity(actorId: string | undefined, text: string) {
  await supabase.from('activity_log').insert({ actor_id: actorId ?? null, text })
}
