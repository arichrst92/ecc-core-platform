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
 * **Update 2026-10-17:** data pribadi (No HP, email, tanggal lahir, ulang
 *   tahun, alamat, pekerjaan, pernikahan, keluarga) mengikuti pengaturan
 *   privasi target (/admin/me/privacy, lib/privacy.ts).
 *
 * Endpoint TIDAK overlap dengan /admin/jemaat/:id (admin CRUD untuk fulltimer).
 * Mobile call /admin/jemaat-public/:id.
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { NotFound, Unauthorized } from '../../lib/errors.js';
import { phoneSearchTerms } from '../../lib/phone-search.js';
import { canDoCheckin, notDiscoverableByPhone, privacyGate, type PrivacyField } from '../../lib/privacy.js';
import { journeyProgress } from '../../lib/spiritual-journey.js';

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

/**
 * GET /admin/jemaat-public/search?q=&cabangId=&limit=
 *
 * Cari jemaat untuk input manual di layar scan QR (absensi ibadah/event/
 * homecell, tambah anggota group/homecell, keluarga, visit). Cocok dengan
 * KODE jemaat, NAMA, atau NO HP (format lokal / internasional).
 * Field yang dikembalikan minimal; no HP disamarkan.
 * Urutan: kode persis → cabang yang sama → nama diawali kata kunci → nama.
 */
jemaatPublicRouter.get('/search', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const cabangId = typeof req.query.cabangId === 'string' ? req.query.cabangId : null;
  const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 20));
  if (q.length < 2) {
    res.json({ success: true, data: [] });
    return;
  }
  const upper = q.toUpperCase();
  const rows = await prisma.jemaat.findMany({
    where: {
      OR: [
        { kode: { startsWith: upper } },
        { namaLengkap: { contains: q, mode: 'insensitive' } },
        ...phoneSearchTerms(q).map((t) => ({ noHp: { contains: t } })),
      ],
    },
    select: {
      id: true,
      kode: true,
      namaLengkap: true,
      fotoUrl: true,
      noHp: true,
      jenisKelamin: true,
      cabangId: true,
      isTamu: true,
      cabang: { select: { id: true, nama: true } },
    },
    take: 60,
  });
  const lower = q.toLowerCase();
  // Jemaat yang menolak ditemukan lewat no HP: hanya muncul kalau cocok
  // dengan nama / kode, dan no HP-nya tidak ditampilkan (meski disamarkan).
  // Kecuali untuk check-in/absensi oleh petugas (usher/scanner, PIC
  // homecell/area, fulltimer): `purpose=checkin` → tetap bisa dicari via no HP.
  const forCheckin = req.query.purpose === 'checkin' && (await canDoCheckin(req.user.jemaatId, req.user.isFulltimer === true));
  const hidden = forCheckin ? new Set<string>() : await notDiscoverableByPhone(rows.map((r) => r.id));
  const matchesNameOrKode = (r: (typeof rows)[number]) =>
    (r.kode ?? '').startsWith(upper) || r.namaLengkap.toLowerCase().includes(lower);
  const visible = rows.filter((r) => !hidden.has(r.id) || matchesNameOrKode(r));
  const score = (r: (typeof rows)[number]) =>
    (r.kode === upper ? 0 : 10) +
    (cabangId && r.cabangId === cabangId ? 0 : 3) +
    (r.namaLengkap.toLowerCase().startsWith(lower) ? 0 : 1);
  // No HP selalu disamarkan; disembunyikan untuk yang menolak dicari via no HP.
  const maskedHidden = forCheckin ? await notDiscoverableByPhone(rows.map((r) => r.id)) : hidden;
  const data = visible
    .sort((a, b) => score(a) - score(b) || a.namaLengkap.localeCompare(b.namaLengkap))
    .slice(0, limit)
    .map(({ noHp, cabangId: _c, ...r }) => ({ ...r, noHpMasked: maskedHidden.has(r.id) ? null : maskNoHp(noHp) }));
  res.json({ success: true, data });
});

jemaatPublicRouter.get('/:id', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const requesterId = req.user.jemaatId;
  const targetId = req.params.id;

  // Hide inactive (self-deactivated) jemaat dari public lookup — return
  // 404 supaya keberadaannya tidak ke-ekspose. Pakai findFirst supaya bisa
  // composite-where (isActive + id), beda dengan findUnique yg unique-only.
  const target = await prisma.jemaat.findFirst({
    where: { id: targetId, isActive: true },
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
          tanggalBergabung: true,
          homecell: {
            select: {
              id: true,
              nama: true,
              hari: true,
              jam: true,
              area: { select: { id: true, nama: true } },
              picJemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
              _count: { select: { members: { where: { isActive: true } } } },
            },
          },
        },
      },
      // Family via JemaatRelasi (masuk semua tipe granular — Suami/Istri/Ayah/Ibu/dll).
      relasiAsal: {
        include: {
          tipeRelasi: { select: { id: true, nama: true } },
          jemaatTerkait: {
            select: { id: true, namaLengkap: true, fotoUrl: true },
          },
        },
      },
    },
  });
  if (!target) throw NotFound('Jemaat tidak ditemukan.');

  // Spiritual Journey (tahap aktif berurutan, dari role aktif jemaat).
  const steps = await prisma.spiritualJourneyStep.findMany({
    where: { isActive: true },
    orderBy: [{ urutan: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, judul: true, ikon: true, roleId: true, subRoleId: true, subRoleStatusId: true },
  });
  const journey = journeyProgress(
    steps,
    target.jemaatRoles.map((jr) => ({ roleId: jr.roleId, subRoleId: jr.subRoleId, subRoleStatusId: jr.subRoleStatusId })),
  );

  // Privasi: tiap data tampil sesuai pengaturan privasi target
  // (lib/privacy.ts). Diri sendiri & PIC homecell/area selalu lihat semua.
  const gate = await privacyGate(requesterId, [targetId]);
  const can = (f: PrivacyField) => gate.can(targetId, f);
  const rel = [...gate.relations(targetId)];
  const reason = rel.includes('SELF')
    ? 'self'
    : rel.includes('PASTORAL')
      ? 'pastoral'
      : rel.includes('KELUARGA')
        ? 'family'
        : rel.includes('HOMECELL')
          ? 'homecell-co-member'
          : rel.includes('CABANG')
            ? 'same-cabang'
            : 'public-only';
  const isCloseRelation = can('noHp') || can('alamat') || can('tanggalLahir');

  // Shape response
  const data = {
    id: target.id,
    // Kode = isi QR identitas (dipakai check-in) → hanya diri sendiri,
    // keluarga, dan PIC homecell/area.
    kode: rel.includes('SELF') || rel.includes('PASTORAL') || rel.includes('KELUARGA') ? target.kode : null,
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
    homecell: (() => {
      const m = target.homecellMembership[0];
      if (!m) return null;
      const { _count, ...hc } = m.homecell;
      return { ...hc, memberCount: _count.members, tanggalBergabung: m.tanggalBergabung };
    })(),
    spiritualJourney: {
      total: steps.length,
      achievedCount: journey.achievedCount,
      nextIndex: journey.nextIndex,
      steps: journey.steps.map((st, i) => ({
        id: st.id,
        urutan: i + 1,
        judul: st.judul,
        ikon: st.ikon,
        achieved: st.achieved,
        isNext: st.isNext,
      })),
    },
    // Always public helpers
    noHpMasked: can('noHp') ? maskNoHp(target.noHp) : null,
    ulangTahunBulanTgl: can('ulangTahun') || can('tanggalLahir') ? birthMonthDay(target.tanggalLahir) : null,
    // Sesuai pengaturan privasi — null kalau tidak diizinkan.
    noHp: can('noHp') ? target.noHp : null,
    email: can('email') ? target.email : null,
    tanggalLahir: can('tanggalLahir') ? target.tanggalLahir : null,
    alamat: can('alamat') ? target.alamat : null,
    pekerjaan: can('pekerjaan')
      ? { statusPekerjaan: target.statusPekerjaan, namaKantor: target.namaKantor }
      : null,
    pernikahan: can('pernikahan')
      ? { statusPernikahan: target.statusPernikahan, tanggalPernikahan: target.tanggalPernikahan }
      : null,
    family: can('keluarga')
      ? target.relasiAsal.map((r) => ({
          tipeRelasi: r.tipeRelasi,
          jemaat: r.jemaatTerkait,
        }))
      : null,
    visibility: {
      isCloseRelation,
      reason,
      relations: rel,
    },
  };

  res.json({ success: true, data });
});
