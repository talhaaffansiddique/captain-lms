// Captain LMS email layout: logo on white, black banner with red edges, bold heading below the
// red line, message, red button. Inline styles and tables only, so it renders in Outlook/Gmail.

export interface EmailParts {
  logoUrl: string
  buttonUrl: string
  heading: string
  paragraphs: string[] // trusted HTML
  acknowledge?: string // trusted HTML shown in the red-edged box
  buttonLabel?: string
  footerNote?: string
}

export function renderEmail(p: EmailParts): string {
  const paras = p.paragraphs.map((t) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#222">${t}</p>`).join('')
  const ack = p.acknowledge
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0"><tr><td style="background:#fdecec;border-left:4px solid #e42226;padding:12px 14px;font-size:14px;line-height:1.5;color:#222;text-align:left">${p.acknowledge}</td></tr></table>`
    : ''
  return `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#dfe3ee;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td align="center" style="padding:26px 30px 18px"><img src="${p.logoUrl}" alt="Captain &amp; Company" width="260" style="display:block;width:260px;max-width:70%;height:auto;border:0;font-size:18px;font-weight:bold;color:#000"></td></tr>
<tr><td align="center" style="background:#0a0a0a;border-top:6px solid #e42226;border-bottom:6px solid #e42226;padding:20px 30px;color:#e42226;font-size:14px;font-weight:bold;letter-spacing:3px">CAPTAIN LMS</td></tr>
<tr><td align="center" style="padding:28px 34px 8px">
<p style="margin:0 0 14px;font-size:22px;font-weight:800;color:#0a0a0a">${p.heading}</p>
${paras}${ack}
<a href="${p.buttonUrl}" style="display:inline-block;background:#e42226;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:4px;font-weight:bold;font-size:14px">${p.buttonLabel ?? 'Open Captain LMS'}</a>
</td></tr>
<tr><td align="center" style="background:#f4f4f6;color:#777;font-size:12px;line-height:1.6;padding:16px 24px;margin-top:24px">Captain &amp; Company · Learning Management System<br>${p.footerNote ?? ''}</td></tr>
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
