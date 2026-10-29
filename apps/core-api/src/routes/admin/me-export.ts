/**
 * Unduh data saya — /admin/me/export (kepatuhan no. 6 · hak portabilitas
 * PDPA Malaysia, hak akses UU PDP Ps. 7 / APP 12).
 *
 *   GET → JSON berisi data pribadi milik jemaat yang login.
 *
 * Hanya data milik sendiri; data orang lain (keluarga, tamu) hanya nama.
 * Dibatasi 3x per jam per jemaat; setiap unduhan dicatat di Audit Log.
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { NotFound, TooManyRequests, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

export const meExportRouter = Router();

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 3;
const hits = new Map<string, number[]>();

function rateLimit(jemaatId: string) {
  const now = Date.now();
  const recent = (hits.get(jemaatId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) throw TooManyRequests('Batas unduh data tercapai. Coba lagi dalam 1 jam.');
  recent.push(now);
  hits.set(jemaatId, recent);
}

const d = (v: Date | null | undefined) => (v ? v.toISOString() : null);
const day = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : null);

export async function buildPersonalDataExport(jemaatId: string) {
  const j = await prisma.jemaat.findUnique({
    where: { id: jemaatId },
    include: {
      cabang: { select: { nama: true } },
      user: { select: { lastLoginAt: true, createdAt: true } },
      privacy: { select: { settings: true, discoverableByPhone: true } },
      consents: { orderBy: { acceptedAt: 'desc' }, select: { termsVersion: true, privacyVersion: true, sensitiveData: true, ageGroup: true, source: true, platform: true, acceptedAt: true } },
      jemaatRoles: { select: { isActive: true, tanggalMulai: true, tanggalSelesai: true, role: { select: { nama: true } }, subRole: { select: { nama: true } } } },
      relasiAsal: { select: { tipeRelasi: { select: { nama: true } }, jemaatTerkait: { select: { namaLengkap: true } } } },
      homecellMembership: { select: { isActive: true, createdAt: true, homecell: { select: { nama: true } } } },
      groupMembership: { select: { isActive: true, tanggalBergabung: true, tanggalKeluar: true, group: { select: { nama: true } } } },
      jemaatPelayanan: { select: { isActive: true, tanggalMulai: true, tanggalSelesai: true, pelayanan: { select: { nama: true } }, pelayananRole: { select: { nama: true } } } },
      reservasi: { orderBy: { tanggalIbadah: 'desc' }, select: { tanggalIbadah: true, status: true, reservedAt: true, joinedAt: true, cancelledAt: true, checkinMethod: true, ibadah: { select: { nama: true } } } },
      eventPartisipasi: { orderBy: { registeredAt: 'desc' }, select: { status: true, registeredAt: true, paidAt: true, attendedAt: true, cancelledAt: true, nominalBayar: true, catatan: true, event: { select: { judul: true, tanggalMulai: true } } } },
      homecellAttendance: { orderBy: { scannedAt: 'desc' }, select: { scannedAt: true, source: true, schedule: { select: { tanggal: true, homecell: { select: { nama: true } } } } } },
      prayerRequests: { orderBy: { createdAt: 'desc' }, select: { kategori: true, untuk: true, untukNama: true, isi: true, isAnonim: true, status: true, kesaksian: true, createdAt: true } },
      bible365Plans: { select: { putaran: true, startDate: true, status: true, completedAt: true, reminderTime: true, notes: { select: { day: true, isi: true, ayat: true, createdAt: true } } } },
      resolusi: { select: { tahun: true, judul: true, catatan: true, kategori: true, isDone: true, doneAt: true } },
      feedbacks: { select: { tipe: true, kategori: true, isi: true, status: true, createdAt: true } },
      sertifikat: { select: { nama: true, tanggal: true } },
      tamuSaya: { select: { createdAt: true, tamu: { select: { namaLengkap: true } } } },
      worshipFavorites: { select: { createdAt: true, song: { select: { judul: true } } } },
    },
  });
  if (!j) throw NotFound('Jemaat tidak ditemukan');

  return {
    _info: {
      dibuat: new Date().toISOString(),
      keterangan:
        'Salinan data pribadi Anda di Els App (Elshaddai Creative Community). Pertanyaan atau permintaan koreksi/penghapusan: privacy@eccchurch.global',
      format: 'JSON',
    },
    profil: {
      kode: j.kode,
      namaLengkap: j.namaLengkap,
      noHp: j.noHp,
      email: j.email,
      jenisKelamin: j.jenisKelamin,
      tanggalLahir: day(j.tanggalLahir),
      alamat: j.alamat,
      cabang: j.cabang?.nama ?? null,
      tanggalBergabung: day(j.tanggalBergabung),
      tanggalBergabungGereja: day(j.tanggalBergabungGereja),
      pendidikanTerakhir: j.pendidikanTerakhir,
      statusPekerjaan: j.statusPekerjaan,
      namaKantor: j.namaKantor,
      alamatKantor: j.alamatKantor,
      statusPernikahan: j.statusPernikahan,
      tanggalPernikahan: day(j.tanggalPernikahan),
      sudahBaptisAir: j.sudahBaptisAir,
      tanggalBaptisAir: day(j.tanggalBaptisAir),
      sudahBaptisRohKudus: j.sudahBaptisRohKudus,
      tanggalBaptisRohKudus: day(j.tanggalBaptisRohKudus),
      fotoUrl: j.fotoUrl,
    },
    akun: {
      dibuat: d(j.user?.createdAt),
      loginTerakhir: d(j.user?.lastLoginAt),
      aktif: j.isActive,
    },
    persetujuan: j.consents.map((c) => ({ ...c, acceptedAt: d(c.acceptedAt) })),
    pengaturanPrivasi: j.privacy,
    peran: j.jemaatRoles.map((r) => ({ role: r.role.nama, subRole: r.subRole.nama, aktif: r.isActive, mulai: day(r.tanggalMulai), selesai: day(r.tanggalSelesai) })),
    keluarga: j.relasiAsal.map((r) => ({ hubungan: r.tipeRelasi.nama, nama: r.jemaatTerkait.namaLengkap })),
    homecell: j.homecellMembership.map((m) => ({ homecell: m.homecell.nama, aktif: m.isActive, sejak: day(m.createdAt) })),
    group: j.groupMembership.map((m) => ({ group: m.group.nama, aktif: m.isActive, bergabung: day(m.tanggalBergabung), keluar: day(m.tanggalKeluar) })),
    pelayanan: j.jemaatPelayanan.map((p) => ({ pelayanan: p.pelayanan.nama, peran: p.pelayananRole.nama, aktif: p.isActive, mulai: day(p.tanggalMulai), selesai: day(p.tanggalSelesai) })),
    reservasiIbadah: j.reservasi.map((r) => ({ ibadah: r.ibadah.nama, tanggal: day(r.tanggalIbadah), status: r.status, dipesan: d(r.reservedAt), hadir: d(r.joinedAt), batal: d(r.cancelledAt), caraCheckin: r.checkinMethod })),
    event: j.eventPartisipasi.map((p) => ({ event: p.event.judul, tanggalEvent: day(p.event.tanggalMulai), status: p.status, daftar: d(p.registeredAt), bayar: d(p.paidAt), hadir: d(p.attendedAt), batal: d(p.cancelledAt), nominal: p.nominalBayar?.toString() ?? null, catatan: p.catatan })),
    kehadiranHomecell: j.homecellAttendance.map((a) => ({ homecell: a.schedule.homecell.nama, tanggal: day(a.schedule.tanggal), dicatat: d(a.scannedAt), sumber: a.source })),
    prayerRequest: j.prayerRequests.map((p) => ({ ...p, createdAt: d(p.createdAt) })),
    bible365: j.bible365Plans.map((p) => ({ putaran: p.putaran, mulai: day(p.startDate), status: p.status, selesai: d(p.completedAt), pengingat: p.reminderTime, catatan: p.notes.map((n) => ({ hari: n.day, ayat: n.ayat, isi: n.isi, dibuat: d(n.createdAt) })) })),
    resolusi: j.resolusi.map((r) => ({ ...r, doneAt: d(r.doneAt) })),
    feedback: j.feedbacks.map((f) => ({ ...f, createdAt: d(f.createdAt) })),
    sertifikat: j.sertifikat.map((s) => ({ nama: s.nama, tanggal: day(s.tanggal) })),
    tamuYangSayaUndang: j.tamuSaya.map((t) => ({ nama: t.tamu.namaLengkap, sejak: day(t.createdAt) })),
    laguFavorit: j.worshipFavorites.map((w) => ({ lagu: w.song.judul, sejak: day(w.createdAt) })),
  };
}

meExportRouter.get('/', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const jemaatId = req.user.jemaatId;
  rateLimit(jemaatId);
  const data = await buildPersonalDataExport(jemaatId);
  audit(req, {
    action: 'UPDATE',
    resource: 'personal_data_export',
    resourceId: jemaatId,
    resourceLabel: 'Unduh data saya',
    metadata: { kind: 'self-export' },
  });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data });
});
