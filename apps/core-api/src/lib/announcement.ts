/**
 * Announcement — penerima, pengiriman (In App, Email, WhatsApp bertahap).
 *
 * Alur:
 *   Portal "Kirim sekarang" / "Jadwalkan" → status SCHEDULED (scheduledAt).
 *   tickAnnouncements() (tiap menit + dipicu langsung saat kirim sekarang):
 *     1. SCHEDULED & jatuh tempo → hitung penerima, buat announcement_recipient,
 *        notifikasi In App (daftar notifikasi + popup app), status SENDING.
 *     2. SENDING → kirim email (batch) & WhatsApp (bertahap, jeda antar pesan
 *        supaya nomor tidak diblokir). Selesai semua → SENT.
 */
import { prisma, Prisma } from '@ecc/database';
import { sendWhatsAppTextVia } from '@ecc/auth';
import { logger } from './logger.js';
import { sendEmail } from './sendgrid.js';
import { mdToHtml, mdToPlain, mdToWhatsApp } from '@ecc/shared-types';

export type AnnouncementChannel = 'IN_APP' | 'WHATSAPP' | 'EMAIL';
export const ANNOUNCEMENT_CHANNELS: AnnouncementChannel[] = ['IN_APP', 'WHATSAPP', 'EMAIL'];
export interface AnnouncementLink {
  label: string;
  url: string;
}
export interface AudienceInput {
  audienceMode: 'ALL' | 'FILTER';
  combine: 'OR' | 'AND';
  cabangIds: string[];
  areaIds: string[];
  homecellIds: string[];
  jemaatIds: string[];
}

/** Jeda antar pesan WA (ms). Default 4 dtk — bisa diatur ANNOUNCEMENT_WA_DELAY_MS. */
export const WA_DELAY_MS = Math.max(1500, Number(process.env.ANNOUNCEMENT_WA_DELAY_MS ?? 4000));
const EMAIL_BATCH = 40;
const TICK_BUDGET_MS = 50_000;

export const siteUrl = () => (process.env.PUBLIC_SITE_URL ?? 'https://eccchurch.global').replace(/\/$/, '');
const apiUrl = () => (process.env.PUBLIC_API_URL ?? 'https://api.eccchurch.global').replace(/\/$/, '');
export const publicPageUrl = (slug: string) => `${siteUrl()}/pengumuman/${slug}`;
export const absUpload = (u: string | null | undefined) => (!u ? null : /^https?:/i.test(u) ? u : `${apiUrl()}${u}`);

export function parseLinks(v: unknown): AnnouncementLink[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => ({ label: String((x as AnnouncementLink)?.label ?? '').trim(), url: String((x as AnnouncementLink)?.url ?? '').trim() }))
    .filter((x) => x.label && /^https?:\/\//i.test(x.url))
    .slice(0, 5);
}

/** Slug unik dari judul (+ akhiran acak pendek). */
export function makeSlug(judul: string): string {
  const base =
    judul
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'pengumuman';
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Where Prisma jemaat penerima. Selalu: aktif & bukan tamu.
 * FILTER: tiap saringan yang terisi jadi satu kondisi; OR = salah satu, AND = semua.
 * Saringan kosong semua (FILTER) → tidak ada penerima.
 */
export function audienceWhere(a: AudienceInput): Prisma.JemaatWhereInput {
  const base: Prisma.JemaatWhereInput = { isActive: true, isTamu: false };
  if (a.audienceMode === 'ALL') return base;
  const conds: Prisma.JemaatWhereInput[] = [];
  if (a.cabangIds.length) conds.push({ cabangId: { in: a.cabangIds } });
  if (a.areaIds.length) conds.push({ homecellMembership: { some: { isActive: true, homecell: { areaId: { in: a.areaIds } } } } });
  if (a.homecellIds.length) conds.push({ homecellMembership: { some: { isActive: true, homecellId: { in: a.homecellIds } } } });
  if (a.jemaatIds.length) conds.push({ id: { in: a.jemaatIds } });
  if (!conds.length) return { id: { in: [] } };
  return { AND: [base, a.combine === 'AND' ? { AND: conds } : { OR: conds }] };
}

export async function previewAudience(a: AudienceInput, sample = 100) {
  const where = audienceWhere(a);
  const [total, withWa, withEmail, rows] = await Promise.all([
    prisma.jemaat.count({ where }),
    prisma.jemaat.count({ where: { AND: [where, { noHp: { not: null } }] } }),
    prisma.jemaat.count({ where: { AND: [where, { email: { not: null } }] } }),
    prisma.jemaat.findMany({
      where,
      take: sample,
      orderBy: { namaLengkap: 'asc' },
      select: { id: true, namaLengkap: true, kode: true, noHp: true, email: true, cabang: { select: { nama: true } } },
    }),
  ]);
  return {
    total,
    withWa,
    withEmail,
    sample: rows.map((r) => ({ id: r.id, nama: r.namaLengkap, kode: r.kode, cabang: r.cabang?.nama ?? null, hasWa: !!r.noHp, hasEmail: !!r.email })),
  };
}

// ------------------------------------------------------------------
// Isi per kanal
// ------------------------------------------------------------------

export function waMessage(a: { judul: string; isi: string; bannerUrl: string | null; slug: string; links: unknown }): string {
  const links = parseLinks(a.links);
  const parts = ['*Pengumuman*', `*${a.judul.trim()}*`];
  // URL pertama dipakai WhatsApp untuk pratinjau → halaman pengumuman (banner = OG image).
  if (a.bannerUrl) parts.push(publicPageUrl(a.slug));
  parts.push('', mdToWhatsApp(a.isi));
  if (links.length) parts.push('', ...links.map((l) => `${l.label}: ${l.url}`));
  return parts.join('\n').replace(/\n{3,}/g, '\n\n');
}

export function emailHtml(a: { judul: string; isi: string; bannerUrl: string | null; links: unknown }, nama: string): string {
  const brand = process.env.EMAIL_FROM_NAME || 'Elshaddai Creative Community';
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const banner = absUpload(a.bannerUrl);
  const head = banner
    ? `<img src="${esc(banner)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0">
       <div style="padding:20px 28px 0"><p style="margin:0;font-size:12px;font-weight:700;color:#C2410C;letter-spacing:.3px">PENGUMUMAN</p>
       <h1 style="margin:4px 0 0;font-size:22px;line-height:1.3;color:#111827">${esc(a.judul)}</h1></div>`
    : `<div style="background:#EA580C;padding:22px 28px;color:#fff"><p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.3px;opacity:.9">PENGUMUMAN</p>
       <h1 style="margin:4px 0 0;font-size:22px;line-height:1.3">${esc(a.judul)}</h1></div>`;
  const buttons = parseLinks(a.links)
    .map(
      (l) =>
        `<a href="${esc(l.url)}" style="display:block;margin:0 0 10px;padding:13px 18px;background:#F97316;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;text-align:center">${esc(l.label)}</a>`,
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(a.judul)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden">
${head}
<div style="padding:18px 28px 8px;font-size:15px;line-height:1.65;color:#374151">
<p style="margin:0 0 12px">Shalom ${esc(nama)},</p>
${mdToHtml(a.isi)}
</div>
${buttons ? `<div style="padding:4px 28px 20px">${buttons}</div>` : ''}
<div style="padding:14px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;font-size:11px;color:#9ca3af">© ${new Date().getFullYear()} ${brand} · eccchurch.global<br>Email otomatis, jangan dibalas.</div>
</div></body></html>`;
}

export function emailText(a: { judul: string; isi: string; links: unknown }, nama: string): string {
  const links = parseLinks(a.links).map((l) => `${l.label}: ${l.url}`);
  return [`Pengumuman: ${a.judul}`, '', `Shalom ${nama},`, '', mdToPlain(a.isi), ...(links.length ? ['', ...links] : [])].join('\n');
}

// ------------------------------------------------------------------
// Pengiriman
// ------------------------------------------------------------------

/** Buat penerima + notifikasi In App untuk announcement yang jatuh tempo. */
async function materialize(id: string): Promise<number> {
  const a = await prisma.announcement.findUnique({ where: { id } });
  if (!a || a.status !== 'SCHEDULED') return 0;
  // Klaim atomik: hanya satu proses yang memindahkan SCHEDULED → SENDING.
  const claim = await prisma.announcement.updateMany({ where: { id, status: 'SCHEDULED' }, data: { status: 'SENDING', startedAt: new Date() } });
  if (claim.count !== 1) return 0;

  const channels = new Set(a.channels as AnnouncementChannel[]);
  const people = await prisma.jemaat.findMany({
    where: audienceWhere({
      audienceMode: a.audienceMode === 'FILTER' ? 'FILTER' : 'ALL',
      combine: a.combine === 'AND' ? 'AND' : 'OR',
      cabangIds: a.cabangIds,
      areaIds: a.areaIds,
      homecellIds: a.homecellIds,
      jemaatIds: a.jemaatIds,
    }),
    select: { id: true, noHp: true, email: true },
  });

  const CHUNK = 1000;
  for (let i = 0; i < people.length; i += CHUNK) {
    const part = people.slice(i, i + CHUNK);
    await prisma.announcementRecipient.createMany({
      data: part.map((p) => ({
        announcementId: a.id,
        jemaatId: p.id,
        inAppStatus: channels.has('IN_APP') ? 'SENT' : null,
        waStatus: channels.has('WHATSAPP') ? (p.noHp ? 'PENDING' : 'SKIPPED') : null,
        emailStatus: channels.has('EMAIL') ? (p.email ? 'PENDING' : 'SKIPPED') : null,
      })),
      skipDuplicates: true,
    });
    if (channels.has('IN_APP')) {
      const body = mdToPlain(a.isi).slice(0, 500);
      await prisma.notification.createMany({
        data: part.map((p) => ({
          jemaatId: p.id,
          type: 'ANNOUNCEMENT' as const,
          title: a.judul.slice(0, 200),
          body,
          actionUrl: `/announcement/${a.id}`,
          metadata: { announcementId: a.id, bannerUrl: a.bannerUrl, slug: a.slug },
        })),
      });
    }
  }
  await prisma.announcement.update({ where: { id: a.id }, data: { recipientCount: people.length } });
  logger.info({ announcementId: a.id, recipients: people.length, channels: [...channels] }, '[announcement] dikirim (materialize)');
  return people.length;
}

async function sendEmails(a: { id: string; judul: string; isi: string; bannerUrl: string | null; links: unknown }, deadline: number) {
  let sent = 0;
  let failed = 0;
  while (Date.now() < deadline) {
    const batch = await prisma.announcementRecipient.findMany({
      where: { announcementId: a.id, emailStatus: 'PENDING' },
      take: EMAIL_BATCH,
      select: { id: true, jemaat: { select: { namaLengkap: true, email: true } } },
    });
    if (!batch.length) break;
    for (const r of batch) {
      if (Date.now() >= deadline) break;
      if (!r.jemaat.email) {
        await prisma.announcementRecipient.update({ where: { id: r.id }, data: { emailStatus: 'SKIPPED' } });
        continue;
      }
      try {
        await sendEmail({ to: r.jemaat.email, subject: `Pengumuman: ${a.judul}`, html: emailHtml(a, r.jemaat.namaLengkap), text: emailText(a, r.jemaat.namaLengkap) });
        await prisma.announcementRecipient.update({ where: { id: r.id }, data: { emailStatus: 'SENT', emailAt: new Date(), emailError: null } });
        sent++;
      } catch (err) {
        await prisma.announcementRecipient.update({
          where: { id: r.id },
          data: { emailStatus: 'FAILED', emailAt: new Date(), emailError: String((err as Error)?.message ?? err).slice(0, 500) },
        });
        failed++;
      }
    }
  }
  return { sent, failed };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendWa(
  a: { id: string; judul: string; isi: string; bannerUrl: string | null; slug: string; links: unknown; waProvider: string },
  deadline: number,
) {
  const provider = a.waProvider === 'fonnte' ? 'fonnte' : 'auto';
  const message = waMessage(a);
  let sent = 0;
  let failed = 0;
  while (Date.now() + WA_DELAY_MS < deadline) {
    const r = await prisma.announcementRecipient.findFirst({
      where: { announcementId: a.id, waStatus: 'PENDING' },
      select: { id: true, jemaat: { select: { noHp: true } } },
    });
    if (!r) break;
    if (!r.jemaat.noHp) {
      await prisma.announcementRecipient.update({ where: { id: r.id }, data: { waStatus: 'SKIPPED' } });
      continue;
    }
    // Klaim baris (cegah kirim dobel bila dua proses berjalan).
    const claim = await prisma.announcementRecipient.updateMany({ where: { id: r.id, waStatus: 'PENDING' }, data: { waStatus: 'SENDING' } });
    if (claim.count !== 1) continue;
    try {
      await sendWhatsAppTextVia(provider, r.jemaat.noHp, message);
      await prisma.announcementRecipient.update({ where: { id: r.id }, data: { waStatus: 'SENT', waAt: new Date(), waError: null } });
      sent++;
    } catch (err) {
      await prisma.announcementRecipient.update({
        where: { id: r.id },
        data: { waStatus: 'FAILED', waAt: new Date(), waError: String((err as Error)?.message ?? err).slice(0, 500) },
      });
      failed++;
    }
    await sleep(WA_DELAY_MS);
  }
  return { sent, failed };
}

let ticking = false;

/** Satu putaran pengiriman. Aman dipanggil berulang (dikunci di memori proses). */
export async function tickAnnouncements() {
  if (ticking) return { alreadyRunning: true };
  ticking = true;
  const deadline = Date.now() + TICK_BUDGET_MS;
  const result = { materialized: 0, email: { sent: 0, failed: 0 }, wa: { sent: 0, failed: 0 }, completed: 0 };
  try {
    // WA tertinggal di SENDING (proses berhenti di tengah kirim) → antre lagi.
    // Aman: hanya satu tick berjalan per proses (ticking), jadi tidak ada kiriman aktif.
    await prisma.announcementRecipient.updateMany({ where: { waStatus: 'SENDING' }, data: { waStatus: 'PENDING' } });

    const due = await prisma.announcement.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
      select: { id: true },
      orderBy: { scheduledAt: 'asc' },
      take: 5,
    });
    for (const d of due) result.materialized += await materialize(d.id);

    const sending = await prisma.announcement.findMany({ where: { status: 'SENDING' }, orderBy: { startedAt: 'asc' }, take: 5 });
    for (const a of sending) {
      if (Date.now() >= deadline) break;
      const channels = new Set(a.channels);
      if (channels.has('EMAIL')) {
        const r = await sendEmails(a, deadline);
        result.email.sent += r.sent;
        result.email.failed += r.failed;
      }
      if (channels.has('WHATSAPP')) {
        const r = await sendWa(a, deadline);
        result.wa.sent += r.sent;
        result.wa.failed += r.failed;
      }
      const left = await prisma.announcementRecipient.count({
        where: { announcementId: a.id, OR: [{ waStatus: { in: ['PENDING', 'SENDING'] } }, { emailStatus: 'PENDING' }] },
      });
      if (left === 0) {
        await prisma.announcement.update({ where: { id: a.id }, data: { status: 'SENT', completedAt: new Date() } });
        result.completed++;
      }
    }
  } finally {
    ticking = false;
  }
  return result;
}

/** Ringkasan laporan per kanal untuk satu / banyak announcement. */
export async function announcementStats(ids: string[]) {
  if (!ids.length) return new Map<string, ReturnType<typeof emptyStats>>();
  const rows = await prisma.$queryRaw<
    {
      announcement_id: string;
      in_app: bigint;
      read: bigint;
      wa_sent: bigint;
      wa_failed: bigint;
      wa_pending: bigint;
      wa_skipped: bigint;
      email_sent: bigint;
      email_failed: bigint;
      email_pending: bigint;
      email_skipped: bigint;
    }[]
  >`SELECT announcement_id,
      COUNT(*) FILTER (WHERE in_app_status = 'SENT') AS in_app,
      COUNT(*) FILTER (WHERE read_at IS NOT NULL) AS read,
      COUNT(*) FILTER (WHERE wa_status = 'SENT') AS wa_sent,
      COUNT(*) FILTER (WHERE wa_status = 'FAILED') AS wa_failed,
      COUNT(*) FILTER (WHERE wa_status IN ('PENDING','SENDING')) AS wa_pending,
      COUNT(*) FILTER (WHERE wa_status = 'SKIPPED') AS wa_skipped,
      COUNT(*) FILTER (WHERE email_status = 'SENT') AS email_sent,
      COUNT(*) FILTER (WHERE email_status = 'FAILED') AS email_failed,
      COUNT(*) FILTER (WHERE email_status = 'PENDING') AS email_pending,
      COUNT(*) FILTER (WHERE email_status = 'SKIPPED') AS email_skipped
    FROM announcement_recipient
    WHERE announcement_id = ANY(${ids}::uuid[])
    GROUP BY announcement_id`;
  const map = new Map<string, ReturnType<typeof emptyStats>>();
  for (const r of rows) {
    map.set(r.announcement_id, {
      inApp: Number(r.in_app),
      read: Number(r.read),
      wa: { sent: Number(r.wa_sent), failed: Number(r.wa_failed), pending: Number(r.wa_pending), skipped: Number(r.wa_skipped) },
      email: { sent: Number(r.email_sent), failed: Number(r.email_failed), pending: Number(r.email_pending), skipped: Number(r.email_skipped) },
    });
  }
  return map;
}

export function emptyStats() {
  return { inApp: 0, read: 0, wa: { sent: 0, failed: 0, pending: 0, skipped: 0 }, email: { sent: 0, failed: 0, pending: 0, skipped: 0 } };
}
