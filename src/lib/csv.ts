export interface ParsedEmployeeRow {
  full_name: string
  email: string
  department: string
}

/**
 * Parses a simple CSV with a header row containing Name, Email, Department (any order, case-insensitive).
 * Handles basic quoted fields but not embedded newlines — fine for a standard spreadsheet export.
 */
export function parseEmployeeCsv(text: string): ParsedEmployeeRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) return []

  function splitLine(line: string): string[] {
    return line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''))
  }

  const header = splitLine(lines[0] as string).map((h) => h.toLowerCase())
  const nameIdx = header.findIndex((h) => h.includes('name'))
  const emailIdx = header.findIndex((h) => h.includes('email'))
  const deptIdx = header.findIndex((h) => h.includes('department'))
  if (nameIdx === -1 || emailIdx === -1) return []

  const rows: ParsedEmployeeRow[] = []
  for (const line of lines.slice(1)) {
    const cells = splitLine(line)
    const full_name = cells[nameIdx]?.trim()
    const email = cells[emailIdx]?.trim()
    const department = (deptIdx !== -1 ? cells[deptIdx]?.trim() : '') || 'General'
    if (!full_name || !email || !email.includes('@')) continue
    rows.push({ full_name, email, department })
  }
  return rows
}
