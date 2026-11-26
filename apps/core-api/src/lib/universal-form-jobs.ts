/**
 * Universal Form — job berkala (2026-12), dijalankan tiap 15 menit:
 *  1. Pengingat batas pengisian H-3, H-1, 3 jam (app + WhatsApp berisi link
 *     Els App web) untuk peserta event yang belum mengisi; pengingat perbaikan
 *     ≤ 12 jam sebelum batas perbaikan.
 *  2. Pembatalan otomatis pendaftaran event (sematan autoCancel, event TIDAK
 *     wajib bayar) bila formulir belum diisi / perbaikan belum dilengkapi saat
 *     batas lewat. Event wajib bayar → hanya ditandai "Perlu tindak lanjut".
 *  3. Retensi: file lampiran & tanda tangan dihapus 1 tahun setelah form
 *     ditutup; unggahan yang tidak pernah dikirim dihapus setelah 3 hari.
 */
import { prisma } from '@ecc/database';
import { createNotification } from './notification.js';
import { sendWaIfEnabled } from './wa-notif.js';
import { syncEventRoleForStatus } from './event-role.js';
import { paymentStatusOf, requiresPayment } from './event-payment.js';
import { logger } from './logger.js';
import { deleteUfFile, ufDeadline, ufWebUrl, UF_FILE_RETENTION_DAYS } from './universal-form.js';

const HOUR = 3600_000;
const fmt = (d: Date) => d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' WIB';

/**
 * Batalkan pendaftaran event peserta (admin / otomatis). Notifikasi ke pengisi
 * (dan peserta bila beda akun) memakai tipe lama EVENT_CANCELLED_BY_ADMIN.
 */
export async function cancelParticipation(eventId: string, subjekJemaatId: string, notifyJemaatId: string, alasan: string, code: 'FORM_ADMIN' | 'FORM_AUTO') {
  const p = await prisma.eventParticipation.findUnique({
    where: { eventId_jemaatId: { eventId, jemaatId: subjekJemaatId } },
    include: { event: { select: { id: true, judul: true, butuhKehadiran: true } }, jemaat: { select: { namaLengkap: true } } },
  });
  if (!p || p.status === 'BATAL') return false;
  await prisma.eventParticipation.update({ where: { id: p.id }, data: { status: 'BATAL', cancelledAt: new Date(), cancelReason: code } });
  await syncEventRoleForStatus(p.event, subjekJemaatId, 'BATAL');
  const who = new Set([notifyJemaatId, subjekJemaatId]);
  for (const j of who) {
    void createNotification({
      jemaatId: j,
      type: 'EVENT_CANCELLED_BY_ADMIN',
      title: code === 'FORM_AUTO' ? `Pendaftaran dibatalkan otomatis: ${p.event.judul}` : `Pendaftaran dibatalkan: ${p.event.judul}`,
      body:
        code === 'FORM_AUTO'
          ? `Pendaftaran ${p.jemaat.namaLengkap} di "${p.event.judul}" dibatalkan karena ${alasan}.`
          : `Pendaftaran ${p.jemaat.namaLengkap} di "${p.event.judul}" dibatalkan admin: ${alasan}`,
      actionUrl: `/event/${eventId}`,
      metadata: { eventId, participationId: p.id },
    });
  }
  return true;
}


/** Penerima notifikasi untuk seorang peserta: dirinya, wali (anak), dan yang mendaftarkan (tamu). */
async function recipientsFor(subjekJemaatId: string, invitedBy: string | null): Promise<{ id: string; noHp: string | null; namaLengkap: string }[]> {
  const s = await prisma.jemaat.findUnique({ where: { id: subjekJemaatId }, select: { id: true, noHp: true, namaLengkap: true, primaryGuardianId: true } });
  if (!s) return [];
  const ids = new Set([s.id, ...(s.primaryGuardianId ? [s.primaryGuardianId] : []), ...(invitedBy ? [invitedBy] : [])]);
  return prisma.jemaat.findMany({ where: { id: { in: [...ids] } }, select: { id: true, noHp: true, namaLengkap: true } });
}

type Kind = 'H3' | 'H1' | 'J3' | 'FIX';

async function remind(embedId: string, subjekJemaatId: string, kind: Kind) {
  try {
    await prisma.universalFormReminder.create({ data: { embedId, subjekJemaatId, kind } });
    return true;
  } catch {
    return false; // sudah pernah dikirim
  }
}

async function sendReminder(opts: {
  formId: string;
  judul: string;
  sourceType: string;
  sourceId: string;
  konten: string;
  subjekJemaatId: string;
  subjekNama: string;
  invitedBy: string | null;
  batas: Date;
  fix: boolean;
  autoCancel: boolean;
}) {
  const link = ufWebUrl(opts.formId, opts.sourceType, opts.sourceId);
  const sisa = opts.batas.getTime() - Date.now();
  const sisaTxt = sisa > 36 * HOUR ? `${Math.round(sisa / (24 * HOUR))} hari lagi` : sisa > 2 * HOUR ? `${Math.round(sisa / HOUR)} jam lagi` : 'kurang dari 3 jam lagi';
  const catatan = opts.autoCancel ? ' Lewat batas, pendaftaran dibatalkan otomatis.' : '';
  for (const r of await recipientsFor(opts.subjekJemaatId, opts.invitedBy)) {
    void createNotification({
      jemaatId: r.id,
      type: 'FORM_REMINDER',
      title: opts.fix ? `Lengkapi perbaikan formulir (${sisaTxt})` : `Isi formulir ${opts.judul} (${sisaTxt})`,
      body: `${opts.judul} untuk ${opts.subjekNama} (${opts.konten}) belum ${opts.fix ? 'diperbaiki' : 'diisi'}. Batas ${fmt(opts.batas)}.${catatan}`,
      actionUrl: `/form/${opts.formId}?src=${opts.sourceType}:${opts.sourceId}&subjek=${opts.subjekJemaatId}`,
      metadata: { formId: opts.formId, subjekJemaatId: opts.subjekJemaatId },
    });
    void sendWaIfEnabled('FORM_REMINDER', r.noHp, {
      nama: r.namaLengkap,
      form: opts.judul,
      peserta: opts.subjekNama,
      konten: opts.konten,
      aksi: opts.fix ? 'diperbaiki' : 'diisi',
      batas: fmt(opts.batas),
      link,
      catatan,
    });
  }
}

/** Satu putaran job. */
export async function runUniversalFormJob() {
  const now = new Date();
  let reminders = 0;
  let cancelled = 0;
  const embeds = await prisma.universalFormEmbed.findMany({
    where: { sourceType: 'EVENT', form: { status: { in: ['OPEN', 'CLOSED'] } } },
    include: { form: { select: { id: true, judul: true, status: true, bukaAt: true, tutupAt: true } } },
  });
  for (const e of embeds) {
    const dl = ufDeadline(e.form, e);
    if (!dl) continue;
    // Abaikan sematan yang batasnya sudah lama lewat (> 14 hari).
    if (now.getTime() - dl.getTime() > 14 * 24 * HOUR) continue;
    const ev = await prisma.event.findUnique({ where: { id: e.sourceId }, select: { judul: true, tipeBayar: true, nominal: true, isActive: true } });
    if (!ev || !ev.isActive) continue;
    const paidEvent = requiresPayment(ev);
    const parts = await prisma.eventParticipation.findMany({
      where: { eventId: e.sourceId, status: { not: 'BATAL' } },
      select: { id: true, status: true, jemaatId: true, invitedByJemaatId: true, jemaat: { select: { namaLengkap: true } }, donations: { select: { status: true } } },
    });
    const eligible = parts.filter((p) => !paidEvent || paymentStatusOf(ev, p) === 'LUNAS');
    if (!eligible.length) continue;
    const resp = await prisma.universalFormResponse.findMany({
      where: { formId: e.formId, sourceType: 'EVENT', sourceId: e.sourceId, subjekJemaatId: { in: eligible.map((p) => p.jemaatId) } },
      select: { subjekJemaatId: true, jemaatId: true, status: true, perbaikiSebelum: true },
    });
    const byS = new Map(resp.map((r) => [r.subjekJemaatId, r]));
    const toDl = dl.getTime() - now.getTime();
    for (const p of eligible) {
      const r = byS.get(p.jemaatId);
      if (r && (r.status === 'SUBMITTED' || r.status === 'REJECTED')) continue;
      // Sudah hadir (termasuk datang tanpa daftar) → tidak pernah dibatal otomatis.
      const base = {
        formId: e.formId,
        judul: e.form.judul,
        sourceType: 'EVENT',
        sourceId: e.sourceId,
        konten: ev.judul,
        subjekJemaatId: p.jemaatId,
        subjekNama: p.jemaat.namaLengkap,
        invitedBy: p.invitedByJemaatId,
        autoCancel: e.autoCancel && !paidEvent,
      };
      if (!r) {
        // Belum mengisi.
        if (toDl > 0 && e.form.status === 'OPEN' && (!e.form.bukaAt || e.form.bukaAt <= now)) {
          const kind: Kind | null = toDl <= 3 * HOUR ? 'J3' : toDl <= 24 * HOUR ? 'H1' : toDl <= 72 * HOUR ? 'H3' : null;
          if (kind && (await remind(e.id, p.jemaatId, kind))) {
            await sendReminder({ ...base, batas: dl, fix: false });
            reminders++;
          }
        } else if (toDl <= 0 && e.autoCancel && !paidEvent && p.status !== 'HADIR') {
          if (await cancelParticipation(e.sourceId, p.jemaatId, p.invitedByJemaatId ?? p.jemaatId, `formulir "${e.form.judul}" belum diisi sampai batas waktu`, 'FORM_AUTO')) cancelled++;
        }
      } else if (r.status === 'NEEDS_FIX' && r.perbaikiSebelum) {
        const toFix = r.perbaikiSebelum.getTime() - now.getTime();
        if (toFix > 0 && toFix <= 12 * HOUR && (await remind(e.id, p.jemaatId, 'FIX'))) {
          await sendReminder({ ...base, batas: r.perbaikiSebelum, fix: true });
          reminders++;
        } else if (toFix <= 0 && e.autoCancel && !paidEvent && p.status !== 'HADIR') {
          if (await cancelParticipation(e.sourceId, p.jemaatId, r.jemaatId, `perbaikan formulir "${e.form.judul}" belum dilengkapi sampai batas waktu`, 'FORM_AUTO')) cancelled++;
        }
      }
    }
  }
  const purged = await purgeFiles(now);
  if (reminders || cancelled || purged) logger.info({ reminders, cancelled, purged }, '[universal-form] job');
  return { reminders, cancelled, purged };
}

/** Retensi file: form ditutup ≥ 1 tahun; unggahan yatim ≥ 3 hari. */
async function purgeFiles(now: Date) {
  let n = 0;
  const orphans = await prisma.universalFormFile.findMany({
    where: { responseId: null, createdAt: { lt: new Date(now.getTime() - 3 * 24 * HOUR) } },
    select: { id: true, storageName: true },
    take: 500,
  });
  for (const f of orphans) {
    await deleteUfFile(f.storageName);
    await prisma.universalFormFile.delete({ where: { id: f.id } }).catch(() => {});
    n++;
  }
  const cutoff = new Date(now.getTime() - UF_FILE_RETENTION_DAYS * 24 * HOUR);
  const forms = await prisma.universalForm.findMany({
    where: { filesPurgedAt: null, status: { in: ['CLOSED', 'ARCHIVED', 'OPEN'] } },
    select: { id: true, status: true, tutupAt: true, updatedAt: true, embeds: { select: { batasAt: true } } },
  });
  for (const f of forms) {
    const closes = [f.tutupAt, ...f.embeds.map((e) => e.batasAt), f.status !== 'OPEN' ? f.updatedAt : null].filter((d): d is Date => !!d);
    if (!closes.length) continue;
    const closedAt = new Date(Math.max(...closes.map((d) => d.getTime())));
    if (f.status === 'OPEN' && !f.tutupAt) continue; // masih dibuka tanpa tanggal tutup
    if (closedAt > cutoff) continue;
    const files = await prisma.universalFormFile.findMany({ where: { formId: f.id }, select: { id: true, storageName: true } });
    for (const x of files) await deleteUfFile(x.storageName);
    await prisma.universalFormFile.deleteMany({ where: { formId: f.id } });
    await prisma.universalForm.update({ where: { id: f.id }, data: { filesPurgedAt: now } });
    n += files.length;
  }
  return n;
}
