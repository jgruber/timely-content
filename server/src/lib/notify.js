import { sendMail, wrapEmail, escapeHtml } from './email.js';
import { issueToken, RESET, VERIFY } from './emailtokens.js';

/**
 * The two transactional messages the app sends. Both links are built only from
 * the configured public URL -- never from a request's Host header, which an
 * attacker can forge to point a recovery link at a server they control.
 */

function linkFor(settings, kind, token) {
  const base = (settings.publicUrl || '').replace(/\/+$/, '');
  return base ? `${base}/${kind}/${token}` : null;
}

const BUTTON = 'background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;'
  + 'text-decoration:none;display:inline-block';
const MUTED = 'font-size:13px;color:#6b7280';

export async function sendResetEmail(settings, user) {
  const token = await issueToken(user.id, RESET, settings.resetTokenMinutes);
  const link = linkFor(settings, 'reset', token);
  const site = settings.siteName;
  const name = escapeHtml(user.displayName || user.email);

  return sendMail(settings.smtp, {
    to: user.email,
    subject: `Reset your ${site} password`,
    html: wrapEmail(
      `<p>Hello ${name},</p>
       <p>Someone asked to reset the password for your <strong>${escapeHtml(site)}</strong>
          account. If that was you, choose a new password here:</p>
       <p style="margin:24px 0"><a href="${link}" style="${BUTTON}">Choose a new password</a></p>
       <p style="${MUTED}">Or paste this into your browser:<br>
          <span style="word-break:break-all">${link}</span></p>
       <p style="${MUTED}">The link works once and expires in
          ${settings.resetTokenMinutes} minutes. If you did not ask for this you can
          ignore the message -- your password has not changed.</p>`,
      site,
    ),
  });
}

export async function sendVerificationEmail(settings, user) {
  // Confirmation links are generous on purpose: an invited colleague may not
  // read their mail for days, and a dead link means asking an admin to start
  // over. The reset window stays short because it grants immediate access.
  const ttl = Math.max(settings.resetTokenMinutes, 7 * 24 * 60);
  const token = await issueToken(user.id, VERIFY, ttl);
  const link = linkFor(settings, 'verify', token);
  const site = settings.siteName;
  const name = escapeHtml(user.displayName || user.email);

  return sendMail(settings.smtp, {
    to: user.email,
    subject: `Confirm your email address for ${site}`,
    html: wrapEmail(
      `<p>Hello ${name},</p>
       <p>An account for <strong>${escapeHtml(site)}</strong> was created with this
          address. Confirm it to activate the account and sign in:</p>
       <p style="margin:24px 0"><a href="${link}" style="${BUTTON}">Confirm my address</a></p>
       <p style="${MUTED}">Or paste this into your browser:<br>
          <span style="word-break:break-all">${link}</span></p>
       <p style="${MUTED}">If you were not expecting this you can ignore the message;
          the account stays inactive until the address is confirmed.</p>`,
      site,
    ),
  });
}
