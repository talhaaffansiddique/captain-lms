// Netlify Function — drafts a multiple-choice question bank for a module from its uploaded material
// using Google Gemini's free tier. Runs server-side so the API key never reaches the browser.
//
// Environment variables (Netlify → Site configuration → Environment variables):
//   GEMINI_API_KEY             free key from https://aistudio.google.com/apikey
//   GEMINI_MODEL               optional, defaults to gemini-2.5-flash
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY   (already set for the invite function)
//
// Material handling:
//   PDF            sent to Gemini as-is (it reads text and scanned pages)
//   DOCX / PPTX    text pulled out of the file's XML here, then sent as text
//   YouTube video  sent to Gemini as a video URL; if that fails, the admin pastes a transcript instead

import { createClient } from '@supabase/supabase-js'
import JSZip from 'jszip'

const SYSTEM_PROMPT = `You are an expert instructional designer who writes high-quality multiple-choice quiz questions for an online learning platform.

Rules you must always follow:
1. Use ONLY information found in the provided material. Never add outside facts.
2. Each question has exactly 4 options (A, B, C, D) and exactly ONE correct answer.
3. Wrong options must be plausible but clearly incorrect according to the material.
4. Do not use "All of the above" or "None of the above".
5. Spread correct answers evenly across A, B, C and D. Do not favor one letter.
6. Cover the whole material, not just the beginning.
7. Mix difficulty: 5 easy, 6 medium, 4 hard.
8. Write questions in clear, simple English.
9. Respond with ONLY valid JSON. No markdown, no code fences, no extra text.`

const USER_PROMPT = `Write 15 multiple-choice questions from the material provided. Return a JSON array where each item is {"question": string, "options": [4 strings], "correct_index": 0-3, "difficulty": "easy" | "medium" | "hard"}.`

const MAX_INLINE_BYTES = 18 * 1024 * 1024
const MAX_TEXT_CHARS = 120_000

interface GeneratedQuestion {
  question: string
  options: string[]
  correct_index: number
  difficulty: 'easy' | 'medium' | 'hard'
}

type Part = { text: string } | { inline_data: { mime_type: string; data: string } } | { file_data: { file_uri: string } }

class UserFacingError extends Error {
  code: string
  status: number
  constructor(message: string, code: string, status = 422) {
    super(message)
    this.code = code
    this.status = status
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function decodeXmlText(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, 'g')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) out.push(m[1])
  return out
    .join(' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

async function extractOfficeText(bytes: ArrayBuffer, type: string): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  if (type === 'docx') {
    const xml = await zip.file('word/document.xml')?.async('string')
    if (!xml) return ''
    // Paragraph breaks keep sentences from running together.
    return xml
      .split('</w:p>')
      .map((p) => decodeXmlText(p, 'w:t'))
      .filter(Boolean)
      .join('\n')
  }
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
  const slides: string[] = []
  for (const name of slideNames) {
    const xml = await zip.file(name)!.async('string')
    const text = xml
      .split('</a:p>')
      .map((p) => decodeXmlText(p, 'a:t'))
      .filter(Boolean)
      .join('\n')
    if (text) slides.push(`Slide ${slides.length + 1}:\n${text}`)
  }
  return slides.join('\n\n')
}

async function materialParts(
  mod: { youtube_id: string | null; document_url: string | null; document_type: string | null },
  transcript: string,
): Promise<Part[]> {
  if (transcript.trim()) {
    return [{ text: `MATERIAL (video transcript):\n${transcript.trim().slice(0, MAX_TEXT_CHARS)}` }]
  }

  if (mod.youtube_id) {
    const id = extractYoutubeId(mod.youtube_id)
    if (!id) {
      throw new UserFacingError(
        "This module's YouTube ID doesn't look valid. Re-save the module with the 11-character ID or the full video link.",
        'bad_youtube_id',
      )
    }
    return [{ file_data: { file_uri: `https://www.youtube.com/watch?v=${id}` } }]
  }

  if (mod.document_url && mod.document_type) {
    const res = await fetch(mod.document_url)
    if (!res.ok) throw new UserFacingError('Could not download the uploaded file.', 'fetch_failed', 502)
    const bytes = await res.arrayBuffer()
    const type = mod.document_type

    if (type === 'pdf') {
      if (bytes.byteLength > MAX_INLINE_BYTES) {
        throw new UserFacingError('This PDF is over 18 MB — too large to read. Compress it or split it.', 'too_large')
      }
      return [{ inline_data: { mime_type: 'application/pdf', data: Buffer.from(bytes).toString('base64') } }]
    }

    if (type === 'docx' || type === 'pptx') {
      const text = (await extractOfficeText(bytes, type)).trim()
      if (text.length < 200) {
        throw new UserFacingError('Not enough readable text found in this file (images and charts are not read).', 'no_text')
      }
      return [{ text: `MATERIAL (${type.toUpperCase()} text):\n${text.slice(0, MAX_TEXT_CHARS)}` }]
    }

    throw new UserFacingError(
      `Old ${type.toUpperCase()} files can't be read automatically. Re-save it as ${type === 'doc' ? 'DOCX' : 'PPTX'} or PDF and upload again.`,
      'unsupported_type',
    )
  }

  throw new UserFacingError('This module has no video or document yet.', 'no_material')
}

function extractYoutubeId(raw: string): string | null {
  const v = raw.trim()
  if (/^[\w-]{11}$/.test(v)) return v
  const m = v.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/)
  return m ? m[1] : null
}

function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
  return JSON.parse(cleaned)
}

function validate(raw: unknown): GeneratedQuestion[] {
  if (!Array.isArray(raw)) throw new Error('Reply was not a list')
  const out: GeneratedQuestion[] = []
  for (const item of raw) {
    const q = item as Partial<GeneratedQuestion>
    if (typeof q.question !== 'string' || !q.question.trim()) throw new Error('A question was empty')
    if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some((o) => typeof o !== 'string' || !o.trim())) {
      throw new Error('A question did not have exactly 4 options')
    }
    if (!Number.isInteger(q.correct_index) || q.correct_index! < 0 || q.correct_index! > 3) {
      throw new Error('A question had no valid correct answer')
    }
    const lowered = q.options.map((o) => o.trim().toLowerCase())
    if (lowered.some((o) => o.startsWith('all of the above') || o.startsWith('none of the above'))) {
      throw new Error('Used an "all/none of the above" option')
    }
    out.push({
      question: q.question.trim(),
      options: q.options.map((o) => o.trim()),
      correct_index: q.correct_index!,
      difficulty: q.difficulty === 'easy' || q.difficulty === 'hard' ? q.difficulty : 'medium',
    })
  }
  if (out.length < 10) throw new Error(`Only ${out.length} questions came back`)
  return out
}

// Models drift towards putting the right answer in the same slot; assign target slots round-robin
// (shuffled) and move each correct option there so the spread across A-D is as even as possible.
function balanceAnswers(questions: GeneratedQuestion[]): GeneratedQuestion[] {
  const slots = questions.map((_, i) => i % 4)
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[slots[i], slots[j]] = [slots[j], slots[i]]
  }
  return questions.map((q, i) => {
    const target = slots[i]
    const options = [...q.options]
    ;[options[q.correct_index], options[target]] = [options[target], options[q.correct_index]]
    return { ...q, options, correct_index: target }
  })
}

async function callGemini(parts: Part[], apiKey: string, model: string, timeoutMs: number, level = 0): Promise<string> {
  // level 0: full request; 1: without the speed (thinking) setting; 2: also without the strict output
  // schema. Different Gemini models accept different options, so degrade instead of failing outright.
  const doFetch = () =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [...parts, { text: USER_PROMPT }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
        ...(level < 2 ? { responseSchema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              question: { type: 'STRING' },
              options: { type: 'ARRAY', items: { type: 'STRING' } },
              correct_index: { type: 'INTEGER' },
              difficulty: { type: 'STRING', enum: ['easy', 'medium', 'hard'] },
            },
            required: ['question', 'options', 'correct_index', 'difficulty'],
          },
        } } : {}),
        ...(level === 0 ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    }),
  })
  let res: Response
  try {
    res = await doFetch()
  } catch {
    throw new UserFacingError('Gemini took too long to respond.', 'timeout', 504)
  }

  if (res.status === 429) {
    throw new UserFacingError('Gemini free-tier limit reached. Nothing was lost — wait about a minute and try again.', 'rate_limit', 429)
  }
  if (!res.ok) {
    const detail = await res.text()
    let message = detail.slice(0, 300)
    try {
      message = (JSON.parse(detail) as { error?: { message?: string } }).error?.message ?? message
    } catch {
      // keep raw text
    }
    console.error('Gemini error', res.status, message)
    if (/api key/i.test(message)) throw new UserFacingError('The Gemini API key is invalid or missing.', 'bad_key', 500)
    if (res.status === 400 && level < 2 && /invalid argument|think|schema/i.test(message)) {
      return callGemini(parts, apiKey, model, timeoutMs, level + 1)
    }
    if (res.status === 404) {
      throw new UserFacingError(`Gemini model "${model}" isn't available for this key. Set GEMINI_MODEL in Netlify to another model (e.g. gemini-2.0-flash).`, 'bad_model', 500)
    }
    if (res.status === 400 || res.status === 403) throw new UserFacingError(`Gemini could not read this material: ${message}`, 'unreadable', 422)
    throw new UserFacingError(`Gemini error ${res.status}: ${message}`, 'upstream', 502)
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text) throw new UserFacingError('Gemini returned nothing for this material.', 'empty', 422)
  return text
}

// Google renames/retires models over time. If the configured one is gone for this key, ask the API
// which models exist and pick the newest plain "flash" model that supports generateContent.
async function listFlashModels(apiKey: string): Promise<string[]> {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) return []
  const data = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
  const names = (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
  const rank = (n: string) => parseFloat(n.split('-')[1]) * (n.endsWith('-lite') ? 0.5 : 1)
  return names
    .filter((n) => /^gemini-[\d.]+-flash(-lite)?$/.test(n))
    .sort((a, b) => rank(b) - rank(a))
}

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const geminiKey = process.env.GEMINI_API_KEY
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server is not configured yet.', code: 'not_configured' }, 500)
  if (!geminiKey) {
    return json({ error: 'Question generation isn\'t set up yet — add GEMINI_API_KEY in Netlify.', code: 'not_configured' }, 500)
  }

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Missing auth token' }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) return json({ error: 'Invalid session' }, 401)
  const { data: caller } = await admin.from('profiles').select('role').eq('id', userData.user.id).single()
  if (caller?.role !== 'admin') return json({ error: 'Admins only' }, 403)

  let moduleId: number
  let transcript = ''
  try {
    const body = (await req.json()) as { moduleId?: number; transcript?: string }
    moduleId = Number(body.moduleId)
    transcript = body.transcript ?? ''
  } catch {
    return json({ error: 'Invalid request body' }, 400)
  }
  if (!moduleId) return json({ error: 'moduleId is required' }, 400)

  const { data: mod } = await admin
    .from('modules')
    .select('youtube_id, document_url, document_type')
    .eq('id', moduleId)
    .single()
  if (!mod) return json({ error: 'Module not found' }, 404)

  const started = Date.now()
  const BUDGET_MS = 24_000 // Netlify cuts synchronous functions off at ~26-30s
  const left = () => BUDGET_MS - (Date.now() - started)
  const tried = new Set<string>()
  const attempts: string[] = []
  let queue = [process.env.GEMINI_MODEL || 'gemini-2.5-flash']
  let listed = false

  try {
    const parts = await materialParts(mod, transcript)
    let lastProblem = ''
    let lastError: UserFacingError | null = null

    while (left() > 4000) {
      const model = queue.find((m) => !tried.has(m))
      if (!model) {
        if (listed) break
        listed = true
        queue = [...queue, ...(await listFlashModels(geminiKey).catch(() => []))]
        continue
      }
      tried.add(model)

      let reply: string
      const t0 = Date.now()
      try {
        // Cap each attempt so one slow model can't eat the whole budget.
        reply = await callGemini(parts, geminiKey, model, Math.min(left(), 14_000))
      } catch (e) {
        if (!(e instanceof UserFacingError)) throw e
        lastError = e
        attempts.push(`${model}: ${e.code} (${Math.round((Date.now() - t0) / 1000)}s)`)
        if (e.code === 'unreadable' && mod.youtube_id && !transcript.trim()) {
          throw new UserFacingError(
            "Couldn't read this video automatically (it may be private or have no captions). Paste its transcript below and try again.",
            'need_transcript',
          )
        }
        // Overloaded, missing, slow, or fussy model: move on to the next candidate.
        if (['upstream', 'bad_model', 'timeout', 'empty', 'unreadable'].includes(e.code)) continue
        throw e
      }

      try {
        const questions = balanceAnswers(validate(parseJson(reply)))
        return json({ questions, model })
      } catch (e) {
        lastProblem = e instanceof Error ? e.message : 'Invalid reply'
        tried.delete(model) // the same model may answer properly on a second go
        if (tried.size > 6) break
      }
    }

    if (mod.youtube_id && !transcript.trim()) {
      throw new UserFacingError(
        "Couldn't read this video in time (long videos take a while). Paste its transcript below and try again.",
        'need_transcript',
      )
    }
    if (lastProblem) {
      return json({ error: `The AI's reply wasn't usable (${lastProblem}). Try again.`, code: 'invalid_reply' }, 502)
    }
    console.error('All attempts failed', attempts)
    throw new UserFacingError(`${lastError?.message ?? 'Gemini is busy right now. Try again in a minute.'} [${attempts.join('; ')}]`, lastError?.code ?? 'upstream', lastError?.status ?? 503)
  } catch (e) {
    if (e instanceof UserFacingError) return json({ error: e.message, code: e.code }, e.status)
    return json({ error: 'Something went wrong while generating questions.', code: 'unknown' }, 500)
  }
}
