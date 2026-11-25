/**
 * SendGrid email service (module 24 — magic link email login).
 *
 * Setup:
 *   1. Daftar https://sendgrid.com
 *   2. Verify sender email (single sender verification atau domain auth)
 *   3. Generate API key (Settings > API Keys > Full Access)
 *   4. Set env vars: SENDGRID_API_KEY, EMAIL_FROM, EMAIL_FROM_NAME
 *
 * SDK: @sendgrid/mail (official).
 *
 * Non-fatal semantics: kalau send fail (network / API error), log warning +
 * throw. Handler upstream decide apakah rollback DB (mis. delete magic link
 * token) atau expose ke user "coba lagi nanti".
 */
import sgMail from '@sendgrid/mail';
import { logger } from './logger.js';
import { effectiveSender, loadEmailRuntime, markEmailFailed, markEmailSent } from './email-runtime.js';

let initialized = false;
// Muat pengirim dari Portal sejak awal (nama brand dipakai template sebelum sendEmail).
void loadEmailRuntime().catch(() => undefined);

function ensureInitialized(): void {
  if (initialized) return;
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error(
      'SENDGRID_API_KEY not set — check .env. Kalau di dev/test, mock via NODE_ENV=test.',
    );
  }
  sgMail.setApiKey(apiKey);
  initialized = true;
}

interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback untuk client tanpa HTML support */
  text?: string;
}

/**
 * Low-level send helper. Throws on failure.
 * Untuk test mode (NODE_ENV=test): skip real send, cuma log.
 */
export async function sendEmail(args: SendEmailArgs): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    logger.info(
      { to: args.to, subject: args.subject },
      '[sendgrid] TEST MODE — skip real send',
    );
    return;
  }
  ensureInitialized();

  // Pengirim dari Portal (WhatsApp & Email Config) → .env → bawaan.
  await loadEmailRuntime();
  const snd = effectiveSender();
  const from = { email: snd.email, name: snd.name };

  try {
    await sgMail.send({
      to: args.to,
      from,
      ...(snd.replyTo ? { replyTo: snd.replyTo } : {}),
      subject: args.subject,
      html: args.html,
      text: args.text || stripHtml(args.html),
    });
    logger.info({ to: args.to, subject: args.subject }, '[sendgrid] sent');
    markEmailSent(args.to, args.subject);
  } catch (err) {
    const anyErr = err as { response?: { body?: unknown }; message?: string };
    logger.error(
      {
        to: args.to,
        subject: args.subject,
        err: anyErr.message,
        body: anyErr.response?.body,
      },
      '[sendgrid] send FAILED',
    );
    const bodyErr = (anyErr.response?.body as { errors?: { message?: string }[] } | undefined)?.errors?.[0]?.message;
    markEmailFailed(args.to, args.subject, bodyErr ?? anyErr.message ?? 'unknown error');
    throw new Error(`SendGrid send failed: ${bodyErr ?? anyErr.message ?? 'unknown error'}`);
  }
}

/** Simple HTML→text fallback (strip tags + collapse whitespace). */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ============================================================
// Magic link email template
// ============================================================

interface MagicLinkEmailArgs {
  to: string;
  namaLengkap: string;
  /** Full URL yang user klik — bisa mobile deeplink atau web fallback */
  magicLinkUrl: string;
  /** Menit sampai expire (dari env) — untuk display di email body */
  expiresInMinutes: number;
}

/**
 * Send magic link email dengan template branded ECC.
 * Header + logo + CTA button + fallback text URL + expiry note.
 */
export async function sendMagicLinkEmail(args: MagicLinkEmailArgs): Promise<void> {
  const brandName = effectiveSender().name;
  const subject = `Login ke aplikasi ECC — link masuk Anda`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <div style="background:linear-gradient(135deg,#F26522,#F5A623);padding:32px 32px 24px;color:white;">
      <h1 style="margin:0;font-size:24px;font-weight:700;">${brandName}</h1>
      <p style="margin:8px 0 0;font-size:14px;opacity:0.9;">Masuk ke aplikasi ECC</p>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;font-size:16px;">Halo <strong>${escapeHtml(args.namaLengkap)}</strong>,</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
        Anda meminta untuk login ke aplikasi ECC menggunakan email. Klik tombol di bawah
        untuk masuk (link berlaku ${args.expiresInMinutes} menit):
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${args.magicLinkUrl}"
           style="display:inline-block;padding:14px 32px;background:#F26522;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">
          Masuk ke ECC
        </a>
      </div>
      <p style="margin:24px 0 8px;font-size:13px;color:#6b7280;">
        Atau copy URL ini ke browser:
      </p>
      <p style="margin:0 0 24px;font-size:12px;color:#9ca3af;word-break:break-all;">
        <a href="${args.magicLinkUrl}" style="color:#F26522;">${escapeHtml(args.magicLinkUrl)}</a>
      </p>
      <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
        Kalau Anda tidak meminta email ini, abaikan saja — akun Anda aman. Link ini
        hanya berlaku sekali dan akan expired dalam ${args.expiresInMinutes} menit.
      </p>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">
        © ${new Date().getFullYear()} ${brandName}. Email otomatis, jangan reply.
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = `Halo ${args.namaLengkap},

Klik link berikut untuk login ke aplikasi ECC (berlaku ${args.expiresInMinutes} menit):

${args.magicLinkUrl}

Kalau Anda tidak meminta email ini, abaikan saja.

--
${brandName}`;

  await sendEmail({ to: args.to, subject, html, text });
}

/**
 * Kode OTP lewat email.
 *   kind 'wa-fallback' (default) — cadangan saat WhatsApp OTP antre/terganggu.
 *   kind 'login'   — masuk dengan email (Els App web).
 *   kind 'signup'  — daftar dengan email.
 *   kind 'verify'  — tambah / ubah email di profil.
 *   kind 'claim'   — menyambungkan data jemaat lama.
 */
export type OtpEmailKind = 'wa-fallback' | 'login' | 'signup' | 'verify' | 'claim';
const OTP_EMAIL_COPY: Record<OtpEmailKind, { subject: string; header: string; note: string | null }> = {
  'wa-fallback': {
    subject: 'Kode OTP Els App',
    header: 'Kode OTP aplikasi ECC (Els App)',
    note: 'Pengiriman OTP lewat WhatsApp sedang terganggu. Untuk mempercepat proses, kami kirimkan kode OTP Anda lewat email ini.',
  },
  login: { subject: 'Kode masuk Els App', header: 'Kode masuk Els App', note: null },
  signup: { subject: 'Kode pendaftaran Els App', header: 'Kode pendaftaran Els App', note: null },
  verify: { subject: 'Kode verifikasi email Els App', header: 'Verifikasi email Anda', note: null },
  claim: {
    subject: 'Kode menyambungkan data jemaat ECC',
    header: 'Menyambungkan data jemaat Anda',
    note: 'Seseorang mendaftar di Els App dan menyatakan data jemaat ini miliknya. Bila itu Anda, masukkan kode di aplikasi. Bila bukan, abaikan email ini — data Anda aman.',
  },
};

export async function sendOtpEmail(args: {
  to: string;
  namaLengkap: string;
  otp: string;
  expiresInMinutes: number;
  kind?: OtpEmailKind;
}): Promise<void> {
  const brandName = effectiveSender().name;
  const copy = OTP_EMAIL_COPY[args.kind ?? 'wa-fallback'];
  const subject = `${copy.subject}: ${args.otp}`;
  const note = copy.note;
  const spamTip = 'Email ini masuk folder Spam / Promosi? Tandai "Bukan spam" agar email berikutnya masuk ke Inbox.';

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <div style="background:linear-gradient(135deg,#F26522,#F5A623);padding:32px 32px 24px;color:white;">
      <h1 style="margin:0;font-size:24px;font-weight:700;">${brandName}</h1>
      <p style="margin:8px 0 0;font-size:14px;opacity:0.9;">${copy.header}</p>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;font-size:16px;">Halo <strong>${escapeHtml(args.namaLengkap)}</strong>,</p>
      ${
        note
          ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;">${note}</p>`
          : ''
      }
      <p style="margin:0 0 8px;font-size:15px;color:#374151;">Masukkan kode berikut di aplikasi:</p>
      <div style="text-align:center;margin:20px 0 24px;">
        <span style="display:inline-block;padding:14px 28px;background:#FFF7ED;border:2px dashed #F26522;border-radius:10px;font-size:32px;font-weight:800;letter-spacing:8px;color:#C2410C;">${escapeHtml(args.otp)}</span>
      </div>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;">Kode berlaku ${args.expiresInMinutes} menit. Jangan bagikan kode ini ke siapa pun, termasuk yang mengaku petugas gereja.</p>
      <p style="margin:0 0 24px;font-size:12px;color:#6b7280;">${spamTip}</p>
      <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
        Kalau Anda tidak sedang memakai aplikasi ECC, abaikan email ini — akun Anda aman.
      </p>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">
        © ${new Date().getFullYear()} ${brandName}. Email otomatis, jangan reply.
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = `Halo ${args.namaLengkap},
${note ? `\n${note}\n` : ''}
Kode OTP Anda: ${args.otp}
Berlaku ${args.expiresInMinutes} menit. Jangan bagikan kode ini ke siapa pun.

${spamTip}

Kalau Anda tidak sedang memakai aplikasi ECC, abaikan email ini.

--
${brandName}`;

  await sendEmail({ to: args.to, subject, html, text });
}

/**
 * Pemberitahuan sekali kirim: OTP WhatsApp tertunda → minta jemaat meminta
 * kode lagi (kode baru ikut dikirim ke email). TIDAK berisi kode OTP.
 */
export async function sendOtpRetryNoticeEmail(args: { to: string; namaLengkap: string }): Promise<void> {
  const brandName = effectiveSender().name;
  const subject = 'Kode OTP login ECC Anda tertunda — silakan minta kode lagi';
  const note =
    'Pengiriman OTP lewat WhatsApp sedang dalam antrean, sehingga kode yang Anda minta sebelumnya mungkin belum sampai.';
  const steps = [
    'Buka aplikasi ECC (Els App).',
    'Masukkan nomor HP Anda dan minta kode OTP lagi.',
    'Kode baru juga kami kirimkan ke email ini — masukkan kode tersebut di aplikasi.',
  ];

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <div style="background:linear-gradient(135deg,#F26522,#F5A623);padding:32px 32px 24px;color:white;">
      <h1 style="margin:0;font-size:24px;font-weight:700;">${brandName}</h1>
      <p style="margin:8px 0 0;font-size:14px;opacity:0.9;">Login aplikasi ECC</p>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;font-size:16px;">Halo <strong>${escapeHtml(args.namaLengkap)}</strong>,</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;">
        ${note}
      </p>
      <p style="margin:0 0 8px;font-size:15px;color:#374151;">Untuk mempercepat proses:</p>
      <ol style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.7;color:#374151;">
        ${steps.map((s) => `<li>${s}</li>`).join('')}
      </ol>
      <p style="margin:0 0 8px;font-size:14px;color:#374151;">Mohon maaf atas ketidaknyamanannya. Terima kasih atas kesabaran Anda.</p>
      <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
        Email ini tidak berisi kode OTP. Jangan bagikan kode OTP Anda ke siapa pun, termasuk yang mengaku petugas gereja.
      </p>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">
        © ${new Date().getFullYear()} ${brandName}. Email otomatis, jangan reply.
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = `Halo ${args.namaLengkap},

${note}

Untuk mempercepat proses:
${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Mohon maaf atas ketidaknyamanannya.

Email ini tidak berisi kode OTP. Jangan bagikan kode OTP Anda ke siapa pun.

--
${brandName}`;

  await sendEmail({ to: args.to, subject, html, text });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
