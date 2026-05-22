/**
 * Jemaat Public Profile — mobile tap-to-view endpoint.
 *
 * **Patch 2026-05-22** per request mobile jemaat-public-profile.md.
 *
 * Mobile UX: member homecell / area PIC / scanner result / family member
 * di-tap → buka halaman profil ringkas jemaat lain.
 *
 * **Privacy: tiered visibility** (per BE diskusi):
 *   - PUBLIC fields (semua authenticated user): id, kode, namaLengkap, fotoUrl,
 *     jenisKelamin, cabang, roles, ministries, homecell (id+nama)
 *   - PUBLIC helper: noHpMasked, ulangTahunBulanTgl (untuk badge "ultah bulan ini")
 *   - RESTRICTED fields (close relation only): noHp full, tanggalLahir full,
 *     alamat, family
 *
 * **Close relation** = salah satu:
 *   a. Same cabang dengan requester
 *   b. Ada FamilyRelation antara requester ↔ target (verified)
 *   c. Co-member di Homecell yang sama (active membership)
 *
 * Endpoint TIDAK overlap dengan /admin/jemaat/:id (admin CRUD untuk fulltimer).
 * Mobile call /admin/jemaat-public/:id.
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { NotFound, Unauthorized } from '../../lib/errors.js';

export const jemaatPublicRouter = Router();

/** Mask noHp: "+628123456789" → "+62 81****6789". Always returns string. */
function maskNoHp(noHp: string | null): string | null {
  if (!noHp) return null;
  // Strip non-digit dari middle, keep prefix 4 + suffix 4
  if (noHp.length <= 8) return noHp; // sudah pendek, skip mask
  const prefix = noHp.slice(0, 4);
  const suffix = noHp.slice(-4);
  return `${prefix}****${suffix}`;
}

/** Extract "MM-DD" dari Date untuk badge "ultah bulan ini". */
function birthMonthDay(d: Date | null): string | null {
  if (!d) return null;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}-${day}`;
}

jemaatPublicRouter.get('/:id', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const requesterId = req.user.jemaatId;
  const targetId = req.params.id;

  const target = await prisma.jemaat.findUnique({
    where: { id: targetId },
    include: {
      cabang: { select: { id: true, nama: true } },
      jemaatRoles: {
        where: { isActive: true },
        include: {
          role: { select: { id: true, nama: true } },
          subRole: { select: { id: true, nama: true } },
          subRoleStatus: { select: { id: true, nama: true } },
        },
      },
      jemaatPelayanan: {
        where: { isActive: true },
        include: {
          pelayanan: { select: { id: true, nama: true } },
          pelayananRole: { select: { nama: true, level: true } },
        },
      },
      homecellMembership: {
        where: { isActive: true },
        take: 1,
        select: {
          homecell: { select: { id: true, nama: true } },
        },
      },
      familyAsA: {
        where: { isVerified: true },
        select: {
          role: true,
          jemaatB: { select: { id: true, namaLengkap: true, fotoUrl: true } },
        },
      },
    },
  });
  if (!target) throw NotFound('Jemaat tidak ditemukan.');

  // Resolve requester cabangId + homecellIds untuk close-relation check.
  const requester = await prisma.jemaat.findUnique({
    where: { id: requesterId },
    select: {
      cabangId: true,
      homecellMembership: {
        where: { isActive: true },
        select: { homecellId: true },
      },
    },
  });
  if (!requester) throw Unauthorized();

  // Compute isCloseRelation
  let reason: 'same-cabang' | 'family' | 'homecell-co-member' | 'public-only' =
    'public-only';

  if (requesterId === targetId) {
    // Self-view: tampilkan full (tapi seharusnya mobile call /admin/me)
    reason = 'family';
  } else if (requester.cabangId === target.cabangId) {
    reason = 'same-cabang';
  } else {
    // Cek family link
    const family = await prisma.familyRelation.findFirst({
      where: { jemaatAId: requesterId, jemaatBId: targetId, isVerified: true },
      select: { id: true },
    });
    if (family) {
      reason = 'family';
    } else {
      // Cek homecell co-member
      const requesterHomecellIds = requester.homecellMembership.map((m) => m.homecellId);
      if (requesterHomecellIds.length > 0) {
        const coMember = await prisma.homecellMember.findFirst({
          where: {
            jemaatId: targetId,
            homecellId: { in: requesterHomecellIds },
            isActive: true,
          },
          select: { id: true },
        });
        if (coMember) reason = 'homecell-co-member';
      }
    }
  }

  const isCloseRelation = reason !== 'public-only';

  // Shape response
  const data = {
    id: target.id,
    kode: target.kode,
    namaLengkap: target.namaLengkap,
    fotoUrl: target.fotoUrl,
    jenisKelamin: target.jenisKelamin,
    isActive: target.isActive,
    cabang: target.cabang,
    roles: target.jemaatRoles.map((jr) => ({
      role: jr.role,
      subRole: jr.subRole,
      subRoleStatus: jr.subRoleStatus,
    })),
    ministries: target.jemaatPelayanan.map((jp) => ({
      id: jp.id,
      pelayananId: jp.pelayananId,
      nama: jp.pelayanan.nama,
      posisi: jp.pelayananRole.nama,
      posisiLevel: jp.pelayananRole.level,
    })),
    homecell: target.homecellMembership[0]?.homecell ?? null,
    // Always public helpers
    noHpMasked: maskNoHp(target.noHp),
    ulangTahunBulanTgl: birthMonthDay(target.tanggalLahir),
    // Restricted — null kalau bukan close relation
    noHp: isCloseRelation ? target.noHp : null,
    tanggalLahir: isCloseRelation ? target.tanggalLahir : null,
    alamat: isCloseRelation ? target.alamat : null,
    family: isCloseRelation
      ? target.familyAsA.map((fa) => ({ role: fa.role, jemaat: fa.jemaatB }))
      : null,
    visibility: {
      isCloseRelation,
      reason,
    },
  };

  res.json({ success: true, data });
});
