// Sends email through the company mailbox over SMTP (cPanel). Configured entirely by Netlify
// environment variables so no password lives in the code:
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE ("true" for SSL/TLS on 465), SMTP_USER, SMTP_PASS, MAIL_FROM

import nodemailer from 'nodemailer'

export function mailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM)
}

export async function sendMail(to: string, subject: string, html: string, cc?: string[]): Promise<void> {
  const port = Number(process.env.SMTP_PORT ?? 465)
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000,
    socketTimeout: 15000,
  })
  await transport.sendMail({ from: process.env.MAIL_FROM, to, ...(cc?.length ? { cc } : {}), subject, html })
}
