/**
 * Web Action Token routes — event NOMINAL_BEBAS daftar + upload bukti di web.
 * Per backend-request-event-bebas-web-action-token.md (2026-10-11).
 *
 *   POST /auth/web-action-token                       (JWT app) mint token 10 menit
 *   POST /web-action/exchange                         token → session web 30 menit
 *   GET  /web-action/session                          info session (nama, eventId)
 *   GET  /web-action/me/family                        → /admin/me/family
 *   GET  /web-action/event/:eventId/peserta/mine-and-family
 *   POST /web-action/event/:eventId/peserta/batch     → batch register (guard keluarga di handler)
 *   POST /web-action/event/:eventId/peserta/:participationId/bukti
 *   GET  /web-action/event/:eventId/donations          → riwayat donasi tambahan (saya + keluarga)
 *   POST /web-action/event/:eventId/donations          → donasi tambahan (NOMINAL_BEBAS, berkali-kali)
 *
 * Keamanan: session web BUKAN JWT penuh. Hanya endpoint di file ini yang
 * menerima header X-Web-Session, dan setiap endpoint event dicek eventId-nya
 * sama dengan event yang di-bind ke token. Logic bisnis di-reuse dengan
 * mem-forward request ke router existing (validasi, notif, audit identik).
 */
import { Router, type Request, type RequestHandler } from 'express';
import { prisma } from '@ecc/database';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { webActionLimiter, webActionMintLimiter } from '../middleware/rate-limit.js';
import { ApiError, BadRequest, NotFound, Unauthorized } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { getFamilyJemaatIds } from '../lib/family-relation.js';
import { flexImageUpload } from '../lib/image-upload.js';
import { saveEventDonationBukti } from '../lib/storage.js';
import {
  SESSION_TTL_MS,
  TOKEN_TTL_MS,
  WEB_ACTION_PURPOSES,
  checkExchangeable,
  checkSession,
  generateSecret,
  hashSecret,
} from '../lib/web-action-token.js';
import { eventRouter } from './admin/event.js';
import { meRouter } from './admin/me.js';

interface WebActionContext {
  tokenId: string;
  jemaatId: string;
  namaLengkap: string;
  eventId: string;
  purpose: string;
  sessionExpiresAt: Date;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      webAction?: WebActionContext;
    }
  }
}

// ============================================================
//  Mint (dipanggil app, butuh JWT)
// ============================================================

const mintSchema = z.object({
  purpose: z.enum(WEB_ACTION_PURPOSES),
  eventId: z.string().uuid(),
});

export const webActionMintRouter = Router();

webActionMintRouter.post('/web-action-token', requireAuth, webActionMintLimiter, async (req, res) => {
  if (!req.user) throw Unauthorized();
  const input = mintSchema.parse(req.body);

  const event = await prisma.event.findUnique({
    where: { id: input.eventId },
    select: { id: true, judul: true, isPublished: true, tipeBayar: true },
  });
  if (!event || !event.isPublished) throw NotFound('Event tidak ditemukan');
  if (event.tipeBayar === 'GRATIS') {
    throw BadRequest('Event gratis tidak memerlukan halaman pembayaran web.');
  }

  const token = generateSecret();
  const row = await prisma.webActionToken.create({
    data: {
      jemaatId: req.user.jemaatId,
      eventId: event.id,
      purpose: input.purpose,
      tokenHash: hashSecret(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      requestedIp: req.ip?.slice(0, 64) ?? null,
    },
    select: { id: true },
  });

  audit(req, {
    action: 'CREATE',
    resource: 'web_action_token',
    resourceId: row.id,
    resourceLabel: `${input.purpose} @ ${event.judul}`,
    metadata: { eventId: event.id, purpose: input.purpose },
  });

  res.json({ success: true, data: { token, expiresIn: TOKEN_TTL_MS / 1000 } });
});

// ============================================================
//  Web (session)
// ============================================================

export const webActionRouter = Router();
webActionRouter.use(webActionLimiter);

const exchangeSchema = z.object({ token: z.string().min(16).max(128) });

webActionRouter.post('/exchange', async (req, res) => {
  const { token } = exchangeSchema.parse(req.body);
  const row = await prisma.webActionToken.findUnique({
    where: { tokenHash: hashSecret(token) },
    select: { id: true, eventId: true, purpose: true, usedAt: true, expiresAt: true },
  });

  const check = checkExchangeable(row);
  if (check !== 'ok') {
    const code =
      check === 'used' ? 'WEB_TOKEN_USED' : check === 'expired' ? 'WEB_TOKEN_EXPIRED' : 'WEB_TOKEN_INVALID';
    throw new ApiError(401, code, 'Sesi kedaluwarsa. Buka ulang dari Els App.');
  }

  const session = generateSecret();
  const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);
  // Atomic one-time: hanya update kalau usedAt masih null (cegah race 2 tab).
  const updated = await prisma.webActionToken.updateMany({
    where: { id: row!.id, usedAt: null },
    data: { usedAt: new Date(), sessionHash: hashSecret(session), sessionExpiresAt },
  });
  if (updated.count === 0) {
    throw new ApiError(401, 'WEB_TOKEN_USED', 'Sesi kedaluwarsa. Buka ulang dari Els App.');
  }

  res.json({
    success: true,
    data: {
      session,
      expiresIn: SESSION_TTL_MS / 1000,
      eventId: row!.eventId,
      purpose: row!.purpose,
    },
  });
});

/** Validasi header X-Web-Session → set req.user (scoped) + req.webAction. */
const requireWebSession: RequestHandler = async (req, _res, next) => {
  const raw = req.get('x-web-session');
  if (!raw) throw Unauthorized('Sesi web tidak ditemukan.');

  const row = await prisma.webActionToken.findUnique({
    where: { sessionHash: hashSecret(raw) },
    select: {
      id: true,
      eventId: true,
      purpose: true,
      sessionExpiresAt: true,
      jemaat: { select: { id: true, namaLengkap: true, isActive: true } },
    },
  });

  const check = checkSession(row, req.params.eventId);
  if (check === 'not_found' || check === 'expired') {
    throw new ApiError(401, 'WEB_SESSION_EXPIRED', 'Sesi kedaluwarsa. Buka ulang dari Els App.');
  }
  if (check === 'wrong_event') {
    throw new ApiError(403, 'WEB_SESSION_SCOPE', 'Sesi ini tidak berlaku untuk event tersebut.');
  }
  if (!row!.jemaat.isActive) throw Unauthorized('Akun tidak aktif.');

  const user = await prisma.user.findUnique({
    where: { jemaatId: row!.jemaat.id },
    select: { id: true },
  });
  if (!user) throw Unauthorized('Akun tidak ditemukan.');

  const nowSec = Math.floor(Date.now() / 1000);
  // Scoped identity — sengaja TANPA roles & isFulltimer=false supaya handler
  // existing menerapkan guard level jemaat (keluarga), bukan admin.
  req.user = {
    sub: user.id,
    jemaatId: row!.jemaat.id,
    roles: [],
    isFulltimer: false,
    iat: nowSec,
    exp: Math.floor(row!.sessionExpiresAt!.getTime() / 1000),
  };
  req.webAction = {
    tokenId: row!.id,
    jemaatId: row!.jemaat.id,
    namaLengkap: row!.jemaat.namaLengkap,
    eventId: row!.eventId,
    purpose: row!.purpose,
    sessionExpiresAt: row!.sessionExpiresAt!,
  };
  next();
};

/** Forward ke router existing dengan path yang ditentukan (reuse logic penuh). */
function forwardTo(router: Router, buildPath: (req: Request) => string): RequestHandler {
  return (req, res, next) => {
    req.url = buildPath(req);
    router(req, res, next);
  };
}

webActionRouter.get('/session', requireWebSession, (req, res) => {
  const w = req.webAction!;
  res.json({
    success: true,
    data: {
      jemaat: { id: w.jemaatId, namaLengkap: w.namaLengkap },
      eventId: w.eventId,
      purpose: w.purpose,
      expiresAt: w.sessionExpiresAt,
    },
  });
});

webActionRouter.get('/me/family', requireWebSession, forwardTo(meRouter, () => '/family'));

webActionRouter.get(
  '/event/:eventId/peserta/mine-and-family',
  requireWebSession,
  forwardTo(eventRouter, (req) => `/${req.params.eventId}/peserta/mine-and-family`),
);

webActionRouter.post(
  '/event/:eventId/peserta/batch',
  requireWebSession,
  forwardTo(eventRouter, (req) => `/${req.params.eventId}/peserta/batch`),
);

webActionRouter.post(
  '/event/:eventId/peserta/:participationId/bukti',
  requireWebSession,
  forwardTo(
    eventRouter,
    (req) => `/${req.params.eventId}/peserta/${req.params.participationId}/bukti`,
  ),
);

// ============================================================
//  Donasi tambahan — event NOMINAL_BEBAS (berkali-kali)
// ============================================================
// Pembayaran pertama tetap di partisipasi (daftar + upload bukti). Setelah
// terdaftar, jemaat boleh berdonasi lagi kapan saja: setiap donasi = baris
// EventDonation (tambahan=true) dengan bukti sendiri, diverifikasi admin di
// tab Donasi event.
const MIN_DONASI = 1000;

async function familyParticipations(eventId: string, selfId: string) {
  const ids = await getFamilyJemaatIds(selfId);
  return prisma.eventParticipation.findMany({
    where: { eventId, jemaatId: { in: [...ids] }, status: { not: 'BATAL' } },
    select: { id: true, jemaatId: true, jemaat: { select: { namaLengkap: true } } },
  });
}

webActionRouter.get('/event/:eventId/donations', requireWebSession, async (req, res) => {
  const w = req.webAction!;
  const parts = await familyParticipations(w.eventId, w.jemaatId);
  const rows = await prisma.eventDonation.findMany({
    where: { participationId: { in: parts.map((p) => p.id) }, tambahan: true },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      participationId: true,
      nominalBayar: true,
      buktiTransferUrl: true,
      status: true,
      catatan: true,
      createdAt: true,
      participation: { select: { jemaat: { select: { id: true, namaLengkap: true } } } },
    },
  });
  res.json({
    success: true,
    data: rows.map(({ participation, ...r }) => ({ ...r, jemaat: participation.jemaat })),
  });
});

const donasiSchema = z.object({
  nominal: z.coerce.number().int().min(MIN_DONASI, `Nominal minimal Rp ${MIN_DONASI.toLocaleString('id-ID')}.`).max(1_000_000_000),
  participationId: z.string().uuid().optional(),
  catatan: z.string().trim().max(500).optional(),
});

webActionRouter.post('/event/:eventId/donations', requireWebSession, flexImageUpload(), async (req, res) => {
  const w = req.webAction!;
  const event = await prisma.event.findUnique({
    where: { id: w.eventId },
    select: { id: true, judul: true, tipeBayar: true },
  });
  if (!event) throw NotFound('Event tidak ditemukan');
  if (event.tipeBayar !== 'NOMINAL_BEBAS') {
    throw BadRequest('Donasi tambahan hanya untuk event dengan persembahan sukarela.');
  }
  if (!req.file) throw BadRequest('Upload bukti transfer donasi.');
  const input = donasiSchema.parse(req.body ?? {});

  const parts = await familyParticipations(event.id, w.jemaatId);
  if (parts.length === 0) throw BadRequest('Daftar event ini terlebih dahulu sebelum berdonasi.');
  const part = input.participationId
    ? parts.find((p) => p.id === input.participationId)
    : (parts.find((p) => p.jemaatId === w.jemaatId) ?? parts[0]);
  if (!part) throw BadRequest('Peserta tidak ditemukan.');

  const created = await prisma.eventDonation.create({
    data: {
      participationId: part.id,
      nominalBayar: input.nominal,
      catatan: input.catatan || `Donasi tambahan dari ${w.namaLengkap} (web)`,
      status: 'MENUNGGU_VERIFIKASI',
      tambahan: true,
    },
    select: { id: true },
  });
  const buktiTransferUrl = await saveEventDonationBukti(created.id, req.file.buffer);
  const donation = await prisma.eventDonation.update({
    where: { id: created.id },
    data: { buktiTransferUrl },
  });

  audit(req, {
    action: 'CREATE',
    resource: 'event_donation',
    resourceId: donation.id,
    resourceLabel: `Donasi tambahan ${part.jemaat.namaLengkap} @ ${event.judul}: ${input.nominal}`,
    metadata: { kind: 'event-donation-tambahan-web', eventId: event.id },
  });

  res.status(201).json({
    success: true,
    data: donation,
    message: 'Terima kasih! Donasi Anda menunggu verifikasi admin.',
  });
});
