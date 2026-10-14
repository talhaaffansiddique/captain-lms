import { supabase } from '@/lib/supabase'

export interface GeneratedQuestion {
  question: string
  options: string[]
  correct_index: number
  difficulty: 'easy' | 'medium' | 'hard'
}

export interface GenerateResult {
  questions?: GeneratedQuestion[]
  error?: string
  code?: string
}

export async function generateQuestions(moduleId: number, transcript = ''): Promise<GenerateResult> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  try {
    const res = await fetch('/.netlify/functions/generate-questions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ moduleId, transcript }),
    })
    const body = (await res.json()) as GenerateResult
    if (!res.ok) return { error: body.error ?? 'Could not generate questions.', code: body.code }
    return { questions: body.questions }
  } catch {
    return { error: 'Could not reach the question generator. This only works on the deployed site, not local dev.', code: 'network' }
  }
}
