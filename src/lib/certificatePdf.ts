// Builds certificate PDFs in the browser with pdf-lib: either the classic Captain design, or the
// admin's own uploaded template (PDF or image) with the fields placed where the alignment tool put them.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

export type FieldKey = 'name' | 'course' | 'date' | 'hours' | 'cit' | 'id'
export type Positions = Record<FieldKey, { x: number; y: number }> // percentages of the page, y from the top

export interface CertificateSettings {
  mode: 'classic' | 'custom'
  org_name: string
  signer_name: string
  signer_title: string
  template_url: string | null
  positions: Positions
}

export interface CertificateFields {
  name: string
  course: string
  date: string
  hours: string
  cit: string
  id: string
}

export const DEFAULT_POSITIONS: Positions = {
  name: { x: 50, y: 44 },
  course: { x: 50, y: 55 },
  date: { x: 26, y: 80 },
  hours: { x: 74, y: 80 },
  cit: { x: 50, y: 66 },
  id: { x: 84, y: 8 },
}

export const DEFAULT_SETTINGS: CertificateSettings = {
  mode: 'classic',
  org_name: 'Captain & Company',
  signer_name: '',
  signer_title: '',
  template_url: null,
  positions: DEFAULT_POSITIONS,
}

export const FIELD_LABELS: Record<FieldKey, string> = {
  name: 'Employee name',
  course: 'Course',
  date: 'Date',
  hours: 'Credit hours',
  cit: 'Citation',
  id: 'Certificate ID',
}

/** Standard PDF fonts only cover Latin-1; anything else would throw, so swap it for "?". */
const safe = (t: string) => t.replace(/[^\x20-\x7E -ÿ]/g, '?')

function centred(page: PDFPage, text: string, font: PDFFont, size: number, xPct: number, yPct: number, color = rgb(0.1, 0.16, 0.33), maxWidth?: number) {
  const { width, height } = page.getSize()
  let t = safe(text)
  let s = size
  const limit = maxWidth ?? width * 0.8
  while (s > 8 && font.widthOfTextAtSize(t, s) > limit) s -= 1
  page.drawText(t, { x: (width * xPct) / 100 - font.widthOfTextAtSize(t, s) / 2, y: height - (height * yPct) / 100 - s / 3, size: s, font, color })
}

async function classic(settings: CertificateSettings, f: CertificateFields): Promise<PDFDocument> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([842, 595])
  const serif = await doc.embedFont(StandardFonts.TimesRoman)
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const sans = await doc.embedFont(StandardFonts.Helvetica)
  const gold = rgb(0.72, 0.57, 0.23)
  page.drawRectangle({ x: 0, y: 0, width: 842, height: 595, color: rgb(1, 0.99, 0.97) })
  page.drawRectangle({ x: 22, y: 22, width: 798, height: 551, borderColor: gold, borderWidth: 4 })
  page.drawRectangle({ x: 32, y: 32, width: 778, height: 531, borderColor: gold, borderWidth: 1 })
  centred(page, settings.org_name.toUpperCase(), bold, 15, 50, 14, gold)
  centred(page, 'Certificate of Achievement', serif, 40, 50, 27, rgb(0.16, 0.16, 0.16))
  centred(page, 'This is proudly presented to', sans, 13, 50, 38, rgb(0.35, 0.35, 0.35))
  centred(page, f.name, italic, 38, 50, 48, rgb(0.1, 0.16, 0.33))
  page.drawLine({ start: { x: 220, y: 595 - 0.52 * 595 }, end: { x: 622, y: 595 - 0.52 * 595 }, thickness: 1, color: gold })
  centred(page, `for completing  ${f.course}`, serif, 18, 50, 59, rgb(0.16, 0.16, 0.16))
  centred(page, f.hours, sans, 12, 50, 66, rgb(0.35, 0.35, 0.35))
  if (f.cit) centred(page, f.cit, italic, 14, 50, 74, rgb(0.3, 0.3, 0.3), 620)
  centred(page, f.date, sans, 12, 26, 86, rgb(0.2, 0.2, 0.2))
  centred(page, 'Date', sans, 9, 26, 90, rgb(0.5, 0.5, 0.5))
  centred(page, settings.signer_name || ' ', serif, 14, 74, 86, rgb(0.2, 0.2, 0.2))
  centred(page, settings.signer_title || ' ', sans, 9, 74, 90, rgb(0.5, 0.5, 0.5))
  page.drawLine({ start: { x: 130, y: 595 - 0.875 * 595 }, end: { x: 290, y: 595 - 0.875 * 595 }, thickness: 0.7, color: rgb(0.3, 0.3, 0.3) })
  page.drawLine({ start: { x: 550, y: 595 - 0.875 * 595 }, end: { x: 710, y: 595 - 0.875 * 595 }, thickness: 0.7, color: rgb(0.3, 0.3, 0.3) })
  page.drawText(safe(f.id), { x: 800 - sans.widthOfTextAtSize(safe(f.id), 9), y: 40, size: 9, font: sans, color: rgb(0.5, 0.5, 0.5) })
  return doc
}

async function custom(settings: CertificateSettings, f: CertificateFields): Promise<PDFDocument> {
  let doc: PDFDocument
  let page: PDFPage
  const url = settings.template_url
  if (!url) throw new Error('No template uploaded yet.')
  const res = await fetch(url)
  if (!res.ok) throw new Error('Could not load the uploaded template.')
  const bytes = new Uint8Array(await res.arrayBuffer())
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 // "%P"
  if (isPdf) {
    doc = await PDFDocument.load(bytes)
    page = doc.getPage(0)
  } else {
    doc = await PDFDocument.create()
    const isPng = bytes[0] === 0x89
    const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
    page = doc.addPage([842, 595])
    page.drawImage(img, { x: 0, y: 0, width: 842, height: 595 })
  }
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const sans = await doc.embedFont(StandardFonts.Helvetica)
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic)
  const P = { ...DEFAULT_POSITIONS, ...settings.positions }
  centred(page, f.name, bold, 28, P.name.x, P.name.y)
  centred(page, f.course, sans, 18, P.course.x, P.course.y)
  centred(page, f.cit, italic, 14, P.cit.x, P.cit.y, rgb(0.25, 0.25, 0.25), page.getSize().width * 0.7)
  centred(page, f.date, sans, 13, P.date.x, P.date.y)
  centred(page, f.hours, sans, 13, P.hours.x, P.hours.y)
  centred(page, f.id, sans, 10, P.id.x, P.id.y, rgb(0.4, 0.4, 0.4))
  return doc
}

export async function buildCertificatePdf(settings: CertificateSettings, fields: CertificateFields): Promise<Uint8Array> {
  const doc = settings.mode === 'custom' && settings.template_url ? await custom(settings, fields) : await classic(settings, fields)
  return doc.save()
}

export function pdfBlobUrl(bytes: Uint8Array): string {
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
}

export function downloadBlobUrl(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}
