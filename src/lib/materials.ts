import { supabase } from './supabase'

const BUCKET = 'module-materials'
const ALLOWED_EXTENSIONS = ['pdf', 'pptx', 'ppt', 'docx', 'doc']
const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50MB — Supabase Storage's free-tier default object limit

export function inferDocumentType(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase()
  return ext && ALLOWED_EXTENSIONS.includes(ext) ? ext : null
}

export interface UploadResult {
  url: string | null
  type: string | null
  error: string | null
}

export async function uploadModuleMaterial(moduleId: number, file: File): Promise<UploadResult> {
  const type = inferDocumentType(file.name)
  if (!type) return { url: null, type: null, error: 'Only PDF, PPTX, or DOCX files are supported.' }
  if (file.size > MAX_SIZE_BYTES) return { url: null, type: null, error: 'File is too large (50MB max).' }

  const path = `${moduleId}/${Date.now()}-${file.name}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
  if (error) return { url: null, type: null, error: error.message }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, type, error: null }
}

/** Native browser PDF viewer needs just the file URL; PPTX/DOCX need Microsoft's free Office
 * Online Viewer, since no browser renders those formats natively — it fetches the file itself
 * from the given public URL, so this only works once the module is live on a real internet
 * address (not from a local dev server). */
export function documentEmbedUrl(url: string, type: string): string {
  if (type === 'pdf') return url
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
}

interface MaterialModule {
  youtube_id: string | null
  document_type: string | null
}

/** Plain-text learning-material type, for any list of modules — "Video", a document extension
 * like "PDF", or "None" if nothing's attached yet. */
export function materialType(m: MaterialModule): string {
  if (m.youtube_id) return 'Video'
  if (m.document_type) return m.document_type.toUpperCase()
  return 'None'
}

/** Minutes for a video (the real length once someone's played it at least once — a fresh video
 * shows a 5-minute placeholder until then), "Untimed" for a document, or "—" for neither. */
export function formatDuration(m: MaterialModule & { duration_seconds: number }): string {
  if (!m.youtube_id) return m.document_type ? 'Untimed' : '—'
  const mins = Math.round(m.duration_seconds / 60)
  return mins < 1 ? '<1 min' : `${mins} min`
}

/** Removes an uploaded file from storage given its public URL (no-op for anything not in our bucket). */
export async function deleteMaterialFile(publicUrl: string | null): Promise<void> {
  if (!publicUrl) return
  const marker = `/${BUCKET}/`
  const i = publicUrl.indexOf(marker)
  if (i === -1) return
  const path = decodeURIComponent(publicUrl.slice(i + marker.length))
  await supabase.storage.from(BUCKET).remove([path])
}
