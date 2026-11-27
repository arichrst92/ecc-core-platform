/**
 * "Aturan event ini" — ringkasan konfigurasi event dalam bahasa sederhana untuk
 * Portal (detail event → tab Peserta, bagian buka-tutup). Semua angka & jam
 * dihitung dari aturan server yang sebenarnya (self-checkin, scan-window,
 * auto-cancel, event-time) supaya tidak berbeda dengan yang dialami jemaat.
 */
import { prisma } from '@ecc/database';
import { NotFound } from './errors.js';
import { CHECKIN_CFG_SELECT, checkinBounds, closeRuleText, fmtMenit, hhmmToMin, openRuleText, regCloseRuleText, formatMeters } from './self-checkin.js';
import { SCAN_AFTER_MIN, SCAN_BEFORE_MIN } from './scan-window.js';
import { eventCancelClosesAt, eventRegistrationClosesAt } from './event-time.js';
import { requiresPayment } from './event-payment.js';
import { walkInAllowed } from './event-walkin.js';
import { calendarDateOf, instantInTzLabel, tzOr } from './tz.js';

export type RuleTone = 'info' | 'ok' | 'warn' | 'off';
export type EventRule = { key: string; judul: string; isi: string; tone: RuleTone };

const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;

export async function buildEventRules(eventId: string): Promise<EventRule[]> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) throw NotFound('Event tidak ditemukan');
  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      tanggalMulai: true,
      tanggalSelesai: true,
      jamMulai: true,
      jamSelesai: true,
      tipeBayar: true,
      nominal: true,
      quotaPeserta: true,
      grupSesi: true,
      butuhKehadiran: true,
      allowSelfCheckin: true,
      wajibDaftar: true,
      selfCheckinRadiusM: true,
      latitude: true,
      isPublic: true,
      ...CHECKIN_CFG_SELECT,
      cabang: { select: { nama: true, kota: true, timezone: true, latitude: true } },
    },
  });
  if (!ev) throw NotFound('Event tidak ditemukan');
  const tz = tzOr(ev.cabang?.timezone);
  const cab = ev.cabang ? { nama: ev.cabang.nama, kota: ev.cabang.kota } : undefined;
  const at = (d: Date) => instantInTzLabel(d, tz, true, cab);
  const paid = requiresPayment(ev);
  const walkIn = walkInAllowed(ev);
  const rules: EventRule[] = [];

  // 1. Pendaftaran
  if (walkIn) {
    rules.push({
      key: 'daftar',
      judul: 'Pendaftaran',
      isi: `Tidak wajib daftar. Jemaat boleh langsung datang; kehadirannya tetap tercatat lewat self check-in atau scan petugas. Yang mau daftar dulu tetap bisa lewat Els App sampai ${regCloseRuleText(ev, 'event')} (${at(eventRegistrationClosesAt(ev, tz))}).`,
      tone: 'ok',
    });
  } else {
    rules.push({
      key: 'daftar',
      judul: 'Pendaftaran',
      isi: `Jemaat daftar sendiri lewat Els App${ev.isPublic ? ' atau website' : ''} sampai ${regCloseRuleText(ev, 'event')} (${at(eventRegistrationClosesAt(ev, tz))}). Setelah itu pendaftaran online ditutup — hanya admin di Portal atau petugas di lokasi yang bisa menambahkan peserta.`,
      tone: 'info',
    });
  }

  // 2. Kuota
  rules.push(
    ev.quotaPeserta
      ? {
          key: 'kuota',
          judul: 'Kuota',
          isi: `Maksimal ${ev.quotaPeserta.toLocaleString('id-ID')} peserta. Kalau sudah penuh, jemaat tidak bisa daftar lagi dari app.${walkIn ? ' Yang datang tanpa daftar tetap dicatat walau kuota penuh.' : ''}`,
          tone: 'info',
        }
      : { key: 'kuota', judul: 'Kuota', isi: 'Tidak ada batas jumlah peserta.', tone: 'info' },
  );

  // 3. Biaya
  const nominal = Number(ev.nominal ?? 0);
  rules.push({
    key: 'biaya',
    judul: 'Biaya',
    isi:
      ev.tipeBayar === 'GRATIS'
        ? 'Gratis — tidak ada pembayaran.'
        : ev.tipeBayar === 'NOMINAL_TETAP'
          ? `Wajib bayar ${rupiah(nominal)}. Peserta upload bukti transfer di app, lalu admin memeriksanya di tab Pembayaran. Pendaftaran baru dianggap lunas setelah diverifikasi.`
          : paid
            ? `Sukarela dengan minimal ${rupiah(nominal)}. Bukti transfer diperiksa admin di tab Pembayaran.`
            : 'Sukarela — peserta boleh memberi berapa saja, atau tidak memberi.',
    tone: paid ? 'warn' : 'info',
  });

  // 4. Kehadiran
  if (!ev.butuhKehadiran) {
    rules.push({
      key: 'hadir',
      judul: 'Kehadiran',
      isi: 'Event ini tidak mencatat kehadiran — tidak ada QR, self check-in, maupun scan petugas. Tiket hanya sebagai tanda terdaftar.',
      tone: 'off',
    });
  } else {
    // Self check-in
    const sm = hhmmToMin(ev.jamMulai) ?? 0;
    let em = hhmmToMin(ev.jamSelesai) ?? 24 * 60 - 1;
    const d0 = calendarDateOf(ev.tanggalMulai, tz);
    const d1 = calendarDateOf(ev.tanggalSelesai ?? ev.tanggalMulai, tz);
    if (!ev.tanggalSelesai && em <= sm) em = 24 * 60 - 1;
    const b = checkinBounds(d0, sm, d1, em, tz, ev);
    if (ev.allowSelfCheckin) {
      const radius = ev.selfCheckinRadiusM;
      const hasPoint = ev.latitude != null || ev.cabang?.latitude != null;
      rules.push({
        key: 'self',
        judul: 'Self check-in (dari HP jemaat)',
        isi: `Dibuka ${openRuleText(ev, 'event')} (${at(b.opens)}) dan ditutup ${closeRuleText(ev, 'event')} (${at(b.closes)}). ${
          radius && hasPoint
            ? `Jemaat harus berada dalam jarak ${formatMeters(radius)} dari lokasi event.`
            : 'Bisa dilakukan dari mana saja (tidak dicek lokasinya).'
        }`,
        tone: 'ok',
      });
    } else {
      rules.push({
        key: 'self',
        judul: 'Self check-in (dari HP jemaat)',
        isi: 'Tidak aktif — jemaat tidak bisa check-in sendiri. Kehadiran dicatat lewat scan petugas atau admin di Portal.',
        tone: 'off',
      });
    }
    // Scan petugas
    rules.push({
      key: 'scan',
      judul: 'Scan oleh petugas',
      isi: `Petugas scan QR peserta mulai ${fmtMenit(SCAN_BEFORE_MIN)} sebelum event dimulai sampai akhir hari. Yang discan lebih dari ${fmtMenit(SCAN_AFTER_MIN)} setelah mulai tetap tercatat hadir, dengan tanda "terlambat". Yang bisa scan: petugas pelayanan yang diberi izin scan (tab Pelayanan & Volunteer) dan admin event.`,
      tone: 'info',
    });
    // Tamu / walk-in
    rules.push({
      key: 'walkin',
      judul: 'Tamu & yang datang tanpa daftar',
      isi: walkIn
        ? 'Petugas bisa langsung scan jemaat yang belum daftar, dan mencatat tamu baru lewat tombol Tamu Walk-in. Semuanya langsung tercatat hadir.'
        : `Tamu yang datang tanpa daftar dicatat lewat tombol Tamu Walk-in (di Portal atau app petugas)${paid ? ', termasuk pembayarannya di tempat' : ''}. Jemaat yang belum daftar ditambahkan lewat "Daftarkan Jemaat".`,
      tone: 'info',
    });
    // Batal otomatis
    const autoAt = b.closes > b.end ? b.closes : b.end;
    rules.push({
      key: 'auto',
      judul: 'Batal otomatis kalau tidak datang',
      isi: `Peserta yang belum hadir dibatalkan otomatis pada ${at(autoAt)} (setelah acara selesai dan batas self check-in lewat).${paid ? ' Peserta yang sudah bayar atau menunggu verifikasi tidak ikut dibatalkan.' : ''} Kalau ternyata ia hadir, petugas atau admin tetap bisa check-in dengan "Tetap check-in".`,
      tone: 'warn',
    });
  }

  // 5. Batal sendiri
  rules.push({
    key: 'batal',
    judul: 'Membatalkan pendaftaran',
    isi: `Jemaat bisa membatalkan sendiri di app sampai ${at(eventCancelClosesAt(ev, tz))}${paid ? ', selama belum bayar. Yang sudah bayar / menunggu verifikasi hanya bisa dibatalkan admin (untuk urusan pengembalian dana)' : ''}. Admin bisa membatalkan kapan saja di Portal.`,
    tone: 'info',
  });

  // 6. Grup sesi
  if (ev.grupSesi) {
    rules.push({
      key: 'sesi',
      judul: 'Grup sesi',
      isi: `Event ini termasuk grup sesi "${ev.grupSesi}". Satu orang hanya bisa ikut satu event dari grup sesi yang sama (mis. memilih salah satu kelas).`,
      tone: 'info',
    });
  }

  // 7. Admin Portal
  rules.push({
    key: 'admin',
    judul: 'Admin di Portal',
    isi: 'Admin event bisa menambah dan membatalkan peserta kapan saja, serta check-in peserta tanpa terikat jam di atas (untuk koreksi). Di hari acara, peserta yang ditambahkan admin bisa langsung ditandai hadir.',
    tone: 'info',
  });
  return rules;
}
