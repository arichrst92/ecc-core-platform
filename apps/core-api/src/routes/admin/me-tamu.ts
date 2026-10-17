/**
 * "Tamu saya" (mobile) — /admin/me/tamu
 *
 * Tamu = teman non-anggota tanpa akun yang saya ajak ke event/ibadah.
 * Setelah ditambahkan, tamu muncul bersama keluarga di pendaftaran event dan
 * self check-in (event & ibadah), dan bisa saya bayarkan / batalkan.
 *
 *   GET    /       → daftar tamu saya + status tindak lanjut & kehadiran
 *   POST   /       → { nama, noHp } tambah (no HP anggota ditolak 409 PHONE_IS_MEMBER)
 *   DELETE /:id    → hapus dari daftar saya (data tamu & riwayat tetap)
 */
import { Router, type Request } from 'express';
import { prisma } from '@ecc/database';
import { NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { memberPhoneError, resolveTamu, tamuInputSchema } from '../../lib/tamu.js';
import { TAMU_STATUS_LABEL, effectiveTamuStatus, tamuAttendance } from '../../lib/tamu-status.js';

export const meTamuRouter = Router();

function me(req: Request) {
  if (!req.user) throw Unauthorized();
  return req.user;
}

const tamuSelect = {
  id: true,
  namaLengkap: true,
  noHp: true,
  kode: true,
  isTamu: true,
  tamuStatus: true,
  tamuFollowupAt: true,
  // Nama petugas follow-up (bukan no HP — privasi petugas).
  tamuFollowupBy: { select: { id: true, namaLengkap: true } },
} as const;

/**
 * Daftar tamu saya + status tindak lanjut (diatur admin ECC, dinaikkan
 * otomatis kalau tamu sudah hadir / sudah daftar Els App) + kehadiran.
 * Tamu yang sudah jadi anggota tetap tampil (status "Sudah terdaftar").
 */
meTamuRouter.get('/', async (req, res) => {
  const u = me(req);
  const rows = await prisma.jemaatTamu.findMany({
    where: { inviterId: u.jemaatId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, tamu: { select: tamuSelect } },
  });
  const att = await tamuAttendance(rows.map((r) => r.tamu.id));
  res.json({
    success: true,
    data: rows.map((r) => {
      const a = att.get(r.tamu.id);
      const status = effectiveTamuStatus({ stored: r.tamu.tamuStatus, isTamu: r.tamu.isTamu, hasAttended: !!a?.kehadiran });
      const { tamuStatus: _s, tamuFollowupBy, tamuFollowupAt, ...tamu } = r.tamu;
      return {
        ...tamu,
        addedAt: r.createdAt,
        status,
        statusLabel: TAMU_STATUS_LABEL[status],
        kehadiran: a?.kehadiran ?? 0,
        terakhirHadir: a?.terakhirHadir ?? null,
        terakhirAcara: a?.terakhirAcara ?? null,
        followupBy: tamuFollowupBy,
        followupSejak: tamuFollowupAt,
      };
    }),
  });
});

meTamuRouter.post('/', async (req, res) => {
  const u = me(req);
  const input = tamuInputSchema.parse(req.body ?? {});
  const self = await prisma.jemaat.findUnique({ where: { id: u.jemaatId }, select: { cabangId: true, noHp: true } });
  if (!self) throw NotFound('Jemaat tidak ditemukan');
  if (self.noHp === input.noHp) throw memberPhoneError();
  const { tamu, created, member } = await resolveTamu(input, self.cabangId);
  if (member) throw memberPhoneError();
  await prisma.jemaatTamu.upsert({
    where: { inviterId_tamuId: { inviterId: u.jemaatId, tamuId: tamu.id } },
    create: { inviterId: u.jemaatId, tamuId: tamu.id },
    update: {},
  });
  audit(req, {
    action: 'CREATE',
    resource: 'jemaat_tamu',
    resourceId: tamu.id,
    resourceLabel: `Tamu ${tamu.namaLengkap}${created ? ' (baru)' : ' (berulang)'}`,
  });
  res.status(created ? 201 : 200).json({
    success: true,
    data: { id: tamu.id, namaLengkap: tamu.namaLengkap, noHp: tamu.noHp, kode: tamu.kode, isReturning: !created },
  });
});

meTamuRouter.delete('/:id', async (req, res) => {
  const u = me(req);
  const r = await prisma.jemaatTamu.deleteMany({ where: { inviterId: u.jemaatId, tamuId: String(req.params.id ?? '') } });
  if (r.count === 0) throw NotFound('Tamu tidak ditemukan di daftar Anda');
  audit(req, { action: 'DELETE', resource: 'jemaat_tamu', resourceId: String(req.params.id), resourceLabel: 'Hapus tamu dari daftar saya' });
  res.json({ success: true, data: { id: req.params.id } });
});
