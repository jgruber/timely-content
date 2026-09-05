import nodemailer from 'nodemailer';

/**
 * SMTP delivery.
 *
 * The transport is rebuilt whenever the settings change, so an administrator
 * editing SMTP details in the browser does not have to restart the container.
 * With no host configured, mail is written to the log instead of thrown away,
 * which keeps the reset flow testable on an instance running without a relay.
 */

let transporter = null;
let signature = '';

function signatureOf(smtp) {
  return [smtp.host, smtp.port, smtp.secure, smtp.user, smtp.pass ? 'set' : ''].join('|');
}

function transportFor(smtp) {
  const next = signatureOf(smtp);
  if (transporter && next === signature) return transporter;

  transporter?.close?.();
  signature = next;
  transporter = smtp.host
    ? nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    })
    : null;

  return transporter;
}

export function emailConfigured(smtp) {
  return Boolean(smtp?.host && smtp?.from);
}

/** Confirm the relay accepts our credentials. Never throws. */
export async function verifyTransport(smtp) {
  const t = transportFor(smtp);
  if (!t) return { ok: false, error: 'No SMTP host configured.' };
  try {
    await t.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function sendMail(smtp, { to, subject, html, text }) {
  const t = transportFor(smtp);
  const body = text || stripHtml(html);

  if (!t) {
    console.log('\n=== EMAIL (no SMTP configured -- printed instead of sent) ===');
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(body);
    console.log('=============================================================\n');
    return { sent: false, fallback: true };
  }

  const from = smtp.fromName ? `"${smtp.fromName}" <${smtp.from}>` : smtp.from;
  await t.sendMail({ from, to, subject, html, text: body });
  return { sent: true };
}

function stripHtml(html = '') {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape interpolated values -- a username ends up inside this HTML. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Wrap body HTML in a plain, client-safe email shell. */
export function wrapEmail(bodyHtml, siteName) {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#fff;border-radius:14px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
      <h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(siteName)}</h1>
      ${bodyHtml}
    </div>
    <p style="margin:16px 4px 0;font-size:12px;color:#6b7280">
      Sent by ${escapeHtml(siteName)}.
    </p>
  </div>
</body></html>`;
}
