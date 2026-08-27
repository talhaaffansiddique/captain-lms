import { supabase } from './supabase'
import type { Notification } from './database.types'

/** Inserts a notification unless one with the same text already exists for this user (avoids re-notifying on every reload). */
export async function notifyOnce(userId: string, text: string, action: Notification['action']) {
  const { data } = await supabase.from('notifications').select('id').eq('user_id', userId).eq('text', text).limit(1)
  if (data && data.length > 0) return
  await supabase.from('notifications').insert({ user_id: userId, text, action })
}

export async function notifyQuizUnlocked(userId: string, milestone: string) {
  const label = milestone === 'final' ? 'The Final Assessment' : `Milestone ${milestone} quiz`
  await notifyOnce(userId, `${label} is ready to take.`, { type: 'open-quiz', milestone })
}

export async function notifyBadgeUnlocked(userId: string, milestone: string) {
  const label = milestone === 'final' ? 'Captain Master' : `Milestone ${milestone}`
  await notifyOnce(userId, `You unlocked the ${label} badge!`, { type: 'goto', view: 'badges' })
}
