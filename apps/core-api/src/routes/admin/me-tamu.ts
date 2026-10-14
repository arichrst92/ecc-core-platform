/**
 * "Tamu saya" (mobile) — /admin/me/tamu
 *
 * Tamu = teman non-anggota tanpa akun yang saya ajak ke event/ibadah.
 * Setelah ditambahkan, tamu muncul bersama keluarga di pendaftaran event dan
 * self check-in (event & ibadah), dan bisa saya bayarkan / batalkan.
 *
 *   GET    /       → daftar tamu saya
 *   POST   /       → { nama, noHp } tambah (no HP anggota ditolak 409 PHONE_IS_MEMBER)
 *   DELETE /:id    → hapus dari daftar saya (data tamu & riwayat tetap)
 */
import { Router, type Request } from 'express';
import { prisma } from '@ecc/database';
import { NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { memberPhoneError, resolveTamu, tamuInputSchema } from '../../lib/tamu.js';

export const meTamuRouter = Router();

function me(req: Request) {
  if (!req.user) throw Unauthorized();
  return req.user;
}

const tamuSelect = { id: true, namaLengkap: true, noHp: true, kode: true } as const;

meTamuRouter.get('/', async (req, res) => {
  const u = me(req);
  const rows = await prisma.jemaatTamu.findMany({
    where: { inviterId: u.jemaatId, tamu: { isTamu: true } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, tamu: { select: tamuSelect } },
  });
  res.json({ success: true, data: rows.map((r) => ({ ...r.tamu, addedAt: r.createdAt })) });
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
  res.json({ success: true, data: { id: req.params.id } });
});
