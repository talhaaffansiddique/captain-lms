// Captain LMS email layout: logo on white, black banner with red edges, bold heading below the
// red line, message, red button. Inline styles and tables only, so it renders in Outlook/Gmail.
// Dark-mode mail apps (Outlook, Apple Mail, Gmail) try to invert colours, so the colours are
// pinned: color-scheme "light only", plus overrides for Outlook.com's data-ogsb/data-ogsc.

export interface EmailParts {
  logoUrl: string
  buttonUrl: string
  heading: string
  paragraphs: string[] // trusted HTML
  acknowledge?: string // trusted HTML shown in the red-edged box
  buttonLabel?: string
  footerNote?: string
}

const DARK_FIX = `
:root{color-scheme:light only;supported-color-schemes:light only}
@media (prefers-color-scheme:dark){
 .pg{background:#dfe3ee !important}.card,.logo-cell{background:#ffffff !important}
 .banner{background:#0a0a0a !important;color:#e42226 !important}
 .h{color:#0a0a0a !important}.t{color:#222222 !important}
 .ack{background:#fdecec !important;color:#222222 !important}
 .btn{background:#e42226 !important;color:#ffffff !important}
 .foot{background:#f4f4f6 !important;color:#777777 !important}}
[data-ogsb] .pg{background-color:#dfe3ee !important}
[data-ogsb] .card,[data-ogsb] .logo-cell{background-color:#ffffff !important}
[data-ogsb] .banner{background-color:#0a0a0a !important}
[data-ogsb] .ack{background-color:#fdecec !important}
[data-ogsb] .btn{background-color:#e42226 !important}
[data-ogsb] .foot{background-color:#f4f4f6 !important}
[data-ogsc] .banner{color:#e42226 !important}
[data-ogsc] .h{color:#0a0a0a !important}
[data-ogsc] .t,[data-ogsc] .ack{color:#222222 !important}
[data-ogsc] .btn{color:#ffffff !important}
[data-ogsc] .foot{color:#777777 !important}`

export function renderEmail(p: EmailParts): string {
  const paras = p.paragraphs.map((t) => `<p class="t" style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#222222">${t}</p>`).join('')
  const ack = p.acknowledge
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0"><tr><td class="ack" bgcolor="#fdecec" style="background:#fdecec;border-left:4px solid #e42226;padding:12px 14px;font-size:14px;line-height:1.5;color:#222222;text-align:left">${p.acknowledge}</td></tr></table>`
    : ''
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><style>${DARK_FIX}</style></head><body class="pg" bgcolor="#dfe3ee" style="margin:0;padding:24px 12px;background:#dfe3ee;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table class="card" role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td class="logo-cell" align="center" bgcolor="#ffffff" style="background:#ffffff;padding:26px 30px 18px"><img src="${p.logoUrl}" alt="Captain &amp; Company" width="260" style="display:block;width:260px;max-width:70%;height:auto;border:0;background:#ffffff;font-size:18px;font-weight:bold;color:#000000"></td></tr>
<tr><td class="banner" align="center" bgcolor="#0a0a0a" style="background:#0a0a0a;border-top:6px solid #e42226;border-bottom:6px solid #e42226;padding:20px 30px;color:#e42226;font-size:14px;font-weight:bold;letter-spacing:3px">CAPTAIN LMS</td></tr>
<tr><td class="card" align="center" bgcolor="#ffffff" style="background:#ffffff;padding:28px 34px 28px">
<p class="h" style="margin:0 0 14px;font-size:22px;font-weight:800;color:#0a0a0a">${p.heading}</p>
${paras}${ack}
<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td class="btn" bgcolor="#e42226" style="background:#e42226;border-radius:4px"><a class="btn" href="${p.buttonUrl}" style="display:inline-block;background:#e42226;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:4px;font-weight:bold;font-size:14px">${p.buttonLabel ?? 'Open Captain LMS'}</a></td></tr></table>
</td></tr>
<tr><td class="foot" align="center" bgcolor="#f4f4f6" style="background:#f4f4f6;color:#777777;font-size:12px;line-height:1.6;padding:16px 24px">Captain &amp; Company · Learning Management System<br>${p.footerNote ?? ''}</td></tr>
</table></td></tr></table></body></html>`
}

export function renderTestEmail(logoUrl: string, buttonUrl: string): string {
  return renderEmail({
    logoUrl,
    buttonUrl,
    heading: 'This is a test email',
    paragraphs: ['This email has been set up by <b>Talha</b>.', 'It is a test email for the Captain LMS learning platform.'],
    acknowledge: 'Please <b>acknowledge</b> once you receive it by replying to this email.',
    footerNote: 'This is an automated test message.',
  })
}
