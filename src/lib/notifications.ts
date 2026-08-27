import { supabase } from './supabase'
import { isGeneralMilestone } from './quiz'
import type { Notification } from './database.types'

/** Inserts a notification unless one with the same text already exists for this user (avoids re-notifying on every reload). */
export async function notifyOnce(userId: string, text: string, action: Notification['action']) {
  const { data } = await supabase.from('notifications').select('id').eq('user_id', userId).eq('text', text).limit(1)
  if (data && data.length > 0) return
  await supabase.from('notifications').insert({ user_id: userId, text, action })
}

export async function notifyQuizUnlocked(userId: string, milestone: string, label: string) {
  await notifyOnce(userId, `${label} is ready to take.`, { type: 'open-quiz', milestone })
}

/** General-module quizzes don't have a dedicated badge tile (there could be dozens of them), so
 * those are worded as a plain quiz pass instead of "badge unlocked" and point back at the
 * dashboard rather than My Badges. */
export async function notifyBadgeUnlocked(userId: string, milestone: string, label: string) {
  if (isGeneralMilestone(milestone)) {
    await notifyOnce(userId, `You passed the ${label}!`, { type: 'goto', view: 'dashboard' })
  } else {
    const badgeName = milestone === 'final' ? 'Captain Master' : `Milestone ${milestone}`
    await notifyOnce(userId, `You unlocked the ${badgeName} badge!`, { type: 'goto', view: 'badges' })
  }
}
