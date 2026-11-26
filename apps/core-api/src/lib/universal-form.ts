/**
 * Universal Form (2026-12) — logika bersama Portal & app.
 *
 *  - File lampiran & tanda tangan disimpan PRIVAT di {UF_DIR} (bukan /uploads),
 *    diunduh lewat endpoint ber-auth. Dihapus otomatis 1 tahun setelah form
 *    ditutup (job retensi).
 *  - Autofill diambil ulang di server saat kirim (nilai dari HP diabaikan).
 *  - Event: form diisi per peserta terdaftar (saya + keluarga + tamu yang saya
 *    daftarkan); event berbayar → hanya yang lunas.
 *  - Validasi per jenis field dicek di server (aturan sama dengan app).
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import type { RequestHandler } from 'express';
import { prisma } from '@ecc/database';
import {
  UF_FILE_EXT,
  UF_MAX_FILE_MB,
  noHpSchema,
  type UfAutofill,
  type UfFileAccept,
  type UfValidasi,
} from '@ecc/shared-types';
import { BadRequest } from './errors.js';
import { familyOf } from './family.js';
import { paymentStatusOf, requiresPayment } from './event-payment.js';
import { todayWib } from './last-attendance.js';

export const UF_DIR = path.resolve(process.env.UF_DIR ?? './private/universal-form');
/** Retensi file setelah form ditutup (hari). */
export const UF_FILE_RETENTION_DAYS = 365;

const ELSAPP_WEB = () => (process.env.ELSAPP_WEB_URL || 'https://elsapp.eccchurch.global').replace(/\/$/, '');
/** Link Els App web untuk mengisi form (fallback app lama & WhatsApp). */
export function ufWebUrl(formId: string, sourceType?: string | null, sourceId?: string | null) {
  const src = sourceType && sourceId ? `?src=${sourceType}:${sourceId}` : '';
  return `${ELSAPP_WEB()}/form/${formId}${src}`;
}

// ------------------------------------------------------------------ file

export function ufFilePath(storageName: string) {
  return path.join(UF_DIR, path.basename(storageName));
}

export async function deleteUfFile(storageName: string | null | undefined) {
  if (!storageName) return;
  await fs.unlink(ufFilePath(storageName)).catch(() => {});
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
};

export function ufExt(originalName: string | undefined, mime: string): string | null {
  const ext = path.extname(originalName ?? '').slice(1).toLowerCase();
  if (ext && MIME_BY_EXT[ext]) return ext;
  const byMime = Object.entries(MIME_BY_EXT).find(([, m]) => m === mime.toLowerCase());
  return byMime ? byMime[0] : null;
}

/** Ekstensi yang diterima field (kosong = semua jenis yang dikenal). */
export function ufAcceptedExt(accept?: UfFileAccept[]): string[] {
  const cats = accept?.length ? accept : (Object.keys(UF_FILE_EXT) as UfFileAccept[]);
  return cats.flatMap((c) => UF_FILE_EXT[c] ?? []);
}

/** Multer: 1 file per request (app mengunggah satu per satu supaya ada progres). */
export function ufUpload(): RequestHandler {
  const m = multer({ storage: multer.memoryStorage(), limits: { fileSize: UF_MAX_FILE_MB * 1024 * 1024, files: 1 } }).any();
  return (req, res, next) =>
    m(req, res, (err: unknown) => {
      if (!err) {
        const files = (req as unknown as { files?: Express.Multer.File[] }).files;
        if (files?.[0]) (req as unknown as { file?: Express.Multer.File }).file = files[0];
        return next();
      }
      const e = err as { code?: string; message?: string };
      if (e.code === 'LIMIT_FILE_SIZE') return next(BadRequest(`Ukuran file maksimal ${UF_MAX_FILE_MB} MB.`));
      if (e.code === 'LIMIT_FILE_COUNT') return next(BadRequest('Unggah satu file per kali.'));
      return next(BadRequest(e.message ?? 'Upload file gagal.'));
    });
}

/** Simpan buffer ke folder privat. Foto (JPG/PNG/WEBP) diperkecil (sisi terpanjang 2400 px). */
export async function saveUfBuffer(buf: Buffer, ext: string): Promise<{ storageName: string; size: number; ext: string; mime: string }> {
  await fs.mkdir(UF_DIR, { recursive: true });
  let out = buf;
  let e = ext;
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    try {
      out = await sharp(buf, { failOn: 'error' }).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      e = 'jpg';
    } catch {
      throw BadRequest('Gambar tidak bisa dibaca. Coba foto lain.');
    }
  }
  const storageName = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.${e}`;
  await fs.writeFile(ufFilePath(storageName), out);
  return { storageName, size: out.length, ext: e, mime: MIME_BY_EXT[e] ?? 'application/octet-stream' };
}

// ------------------------------------------------------------------ tanda tangan

export type Stroke = number[]; // [x1, y1, x2, y2, …] dalam koordinat kanvas

/**
 * Goresan jari → PNG (SVG dibangun server dari angka saja — tidak menerima SVG
 * mentah dari klien). Kanvas diperkecil ke lebar 900 px, latar transparan.
 */
export async function signatureToPng(strokes: Stroke[], w: number, h: number): Promise<Buffer> {
  const W = Math.min(Math.max(Math.round(w), 50), 4000);
  const H = Math.min(Math.max(Math.round(h), 30), 4000);
  let total = 0;
  const paths: string[] = [];
  for (const s of strokes.slice(0, 200)) {
    const pts = s.slice(0, 4000).map((n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0));
    if (pts.length < 4) continue;
    let d = `M${pts[0]} ${pts[1]}`;
    for (let i = 2; i + 1 < pts.length; i += 2) {
      d += ` L${pts[i]} ${pts[i + 1]}`;
      total += Math.hypot(pts[i]! - pts[i - 2]!, pts[i + 1]! - pts[i - 1]!);
    }
    paths.push(`<path d="${d}"/>`);
  }
  if (total < 40) throw BadRequest('Tanda tangan terlalu pendek. Tanda tangani di area yang tersedia.');
  const sw = Math.max(2, Math.round(W / 140));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g fill="none" stroke="#111827" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${paths.join('')}</g></svg>`;
  return sharp(Buffer.from(svg)).resize({ width: 900, withoutEnlargement: false }).png().toBuffer();
}

// ------------------------------------------------------------------ autofill

const fmtTgl = (d: Date) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function usia(d: Date | null): number | null {
  if (!d) return null;
  const t = todayWib();
  let a = t.getUTCFullYear() - d.getUTCFullYear();
  if (t.getUTCMonth() < d.getUTCMonth() || (t.getUTCMonth() === d.getUTCMonth() && t.getUTCDate() < d.getUTCDate())) a--;
  return a;
}

const personSelect = {
  id: true,
  namaLengkap: true,
  kode: true,
  noHp: true,
  email: true,
  tanggalLahir: true,
  jenisKelamin: true,
  alamat: true,
  statusPekerjaan: true,
  namaKantor: true,
  alamatKantor: true,
  pendidikanTerakhir: true,
  statusPernikahan: true,
  tanggalPernikahan: true,
  sudahBaptisAir: true,
  tanggalBaptisAir: true,
  sudahBaptisRohKudus: true,
  tanggalBaptisRohKudus: true,
  spiritualJourneyLevel: true,
  tanggalBergabungGereja: true,
  primaryGuardianId: true,
  cabang: { select: { nama: true } },
  bapaRohani: { select: { namaLengkap: true } },
} as const;

type HcInfo = { nama: string; area: { nama: string }; picJemaat: { namaLengkap: string; noHp: string | null } | null } | null;

async function homecellOf(jemaatId: string): Promise<HcInfo> {
  const sel = { nama: true, area: { select: { nama: true } }, picJemaat: { select: { namaLengkap: true, noHp: true } } } as const;
  const m = await prisma.homecellMember.findFirst({
    where: { jemaatId, isActive: true, homecell: { isActive: true } },
    orderBy: { tanggalBergabung: 'desc' },
    select: { homecell: { select: sel } },
  });
  if (m) return m.homecell;
  return prisma.homecell.findFirst({ where: { picJemaatId: jemaatId, isActive: true }, select: sel });
}

const yaBelum = (b: boolean | null | undefined) => (b === true ? 'Sudah' : b === false ? 'Belum' : null);
const pekerjaan = (p: { statusPekerjaan: string | null; namaKantor: string | null } | null) =>
  p ? [p.statusPekerjaan, p.namaKantor].filter(Boolean).join(' · ') || null : null;

/**
 * Nilai autofill untuk satu jemaat (hanya kunci yang diminta), sebagai teks
 * tampilan. Kosong ('') = data belum ada → app membuka field untuk diisi manual.
 * Pasangan / ayah / ibu / wali dibaca relatif terhadap jemaat ini (peserta
 * event bisa anak → wali = orang tuanya).
 */
export async function autofillFor(jemaatId: string, keys: UfAutofill[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!keys.length) return out;
  const j = await prisma.jemaat.findUnique({ where: { id: jemaatId }, select: personSelect });
  if (!j) return out;
  const need = (re: RegExp) => keys.some((k) => re.test(k));

  // Homecell peserta / pasangan
  const hc = need(/^(HOMECELL|ZONA|PIC_HOMECELL)/) ? await homecellOf(jemaatId) : null;

  // Relasi keluarga langsung (dua arah otomatis: A→B "Istri" ⇔ B→A "Suami").
  const rel = need(/^(PSG_|AYAH_|IBU_|WALI_|DARURAT_)/)
    ? await prisma.jemaatRelasi.findMany({
        where: { jemaatId, tipeRelasi: { nama: { in: ['Suami', 'Istri', 'Ayah', 'Ibu'] } } },
        select: { tipeRelasi: { select: { nama: true } }, jemaatTerkait: { select: personSelect } },
      })
    : [];
  const by = (n: string[]) => rel.find((r) => n.includes(r.tipeRelasi.nama) && r.jemaatTerkait)?.jemaatTerkait ?? null;
  const psg = by(['Suami', 'Istri']);
  const ayah = by(['Ayah']);
  const ibu = by(['Ibu']);
  const guardian =
    need(/^(WALI_|DARURAT_)/) && j.primaryGuardianId
      ? await prisma.jemaat.findUnique({ where: { id: j.primaryGuardianId }, select: personSelect })
      : null;
  const wali = guardian ?? ayah ?? ibu;
  const darurat = wali ?? psg;
  const psgHc = keys.includes('PSG_HOMECELL') && psg ? await homecellOf(psg.id) : null;

  const pelayanan = keys.includes('PELAYANAN')
    ? await prisma.jemaatPelayanan.findMany({
        where: { jemaatId, isActive: true },
        select: { pelayanan: { select: { nama: true } }, pelayananRole: { select: { nama: true } } },
        orderBy: { tanggalMulai: 'asc' },
      })
    : [];

  for (const k of keys) {
    let v: string | null | undefined = null;
    switch (k) {
      case 'NAMA': v = j.namaLengkap; break;
      case 'KODE': v = j.kode; break;
      case 'NO_HP': v = j.noHp; break;
      case 'EMAIL': v = j.email; break;
      case 'TANGGAL_LAHIR': v = j.tanggalLahir ? fmtTgl(j.tanggalLahir) : null; break;
      case 'USIA': { const u = usia(j.tanggalLahir); v = u != null ? `${u} tahun` : null; break; }
      case 'JENIS_KELAMIN': v = j.jenisKelamin === 'L' ? 'Laki-laki' : j.jenisKelamin === 'P' ? 'Perempuan' : null; break;
      case 'CABANG': v = j.cabang?.nama; break;
      case 'HOMECELL': v = hc?.nama; break;
      case 'ZONA': v = hc?.area.nama; break;
      case 'PIC_HOMECELL': v = hc?.picJemaat?.namaLengkap; break;
      case 'PIC_HOMECELL_HP': v = hc?.picJemaat?.noHp; break;
      case 'ALAMAT': v = j.alamat; break;
      case 'PEKERJAAN': v = pekerjaan(j); break;
      case 'NAMA_KANTOR': v = j.namaKantor; break;
      case 'ALAMAT_KANTOR': v = j.alamatKantor; break;
      case 'PENDIDIKAN': v = j.pendidikanTerakhir; break;
      case 'STATUS_NIKAH': v = j.statusPernikahan; break;
      case 'TGL_NIKAH': v = j.tanggalPernikahan ? fmtTgl(j.tanggalPernikahan) : null; break;
      case 'BAPTIS_AIR': v = yaBelum(j.sudahBaptisAir); break;
      case 'TGL_BAPTIS_AIR': v = j.tanggalBaptisAir ? fmtTgl(j.tanggalBaptisAir) : null; break;
      case 'BAPTIS_RK': v = yaBelum(j.sudahBaptisRohKudus); break;
      case 'TGL_BAPTIS_RK': v = j.tanggalBaptisRohKudus ? fmtTgl(j.tanggalBaptisRohKudus) : null; break;
      case 'SPIRITUAL_JOURNEY': v = j.spiritualJourneyLevel; break;
      case 'TGL_BERGABUNG': v = j.tanggalBergabungGereja ? fmtTgl(j.tanggalBergabungGereja) : null; break;
      case 'BAPA_ROHANI': v = j.bapaRohani?.namaLengkap; break;
      case 'PELAYANAN': v = pelayanan.map((p) => `${p.pelayanan.nama} (${p.pelayananRole.nama})`).join(', ') || null; break;
      case 'PSG_NAMA': v = psg?.namaLengkap; break;
      case 'PSG_KODE': v = psg?.kode; break;
      case 'PSG_NO_HP': v = psg?.noHp; break;
      case 'PSG_EMAIL': v = psg?.email; break;
      case 'PSG_TGL_LAHIR': v = psg?.tanggalLahir ? fmtTgl(psg.tanggalLahir) : null; break;
      case 'PSG_USIA': { const u = usia(psg?.tanggalLahir ?? null); v = u != null ? `${u} tahun` : null; break; }
      case 'PSG_PEKERJAAN': v = pekerjaan(psg); break;
      case 'PSG_HOMECELL': v = psgHc?.nama; break;
      case 'PSG_BAPTIS_AIR': v = yaBelum(psg?.sudahBaptisAir); break;
      case 'AYAH_NAMA': v = ayah?.namaLengkap; break;
      case 'AYAH_NO_HP': v = ayah?.noHp; break;
      case 'IBU_NAMA': v = ibu?.namaLengkap; break;
      case 'IBU_NO_HP': v = ibu?.noHp; break;
      case 'WALI_NAMA': v = wali?.namaLengkap; break;
      case 'WALI_NO_HP': v = wali?.noHp; break;
      case 'WALI_EMAIL': v = wali?.email; break;
      case 'DARURAT_NAMA': v = darurat?.namaLengkap; break;
      case 'DARURAT_NO_HP': v = darurat?.noHp; break;
    }
    out[k] = v ?? '';
  }
  return out;
}

// ------------------------------------------------------------------ jendela & peserta

type FormWin = { status: string; bukaAt: Date | null; tutupAt: Date | null };
type EmbedWin = { batasAt: Date | null } | null;

/** Batas pengisian efektif: batas sematan → tanggal tutup form. */
export function ufDeadline(form: FormWin, embed: EmbedWin): Date | null {
  return embed?.batasAt ?? form.tutupAt ?? null;
}

export type UfWindowState = 'DRAFT' | 'NOT_OPEN' | 'OPEN' | 'CLOSED';

export function ufWindow(form: FormWin, embed: EmbedWin, now = new Date()): UfWindowState {
  if (form.status === 'DRAFT') return 'DRAFT';
  if (form.status !== 'OPEN') return 'CLOSED';
  if (form.bukaAt && now < form.bukaAt) return 'NOT_OPEN';
  const dl = ufDeadline(form, embed);
  if (dl && now > dl) return 'CLOSED';
  return 'OPEN';
}

export type UfSubject = { jemaatId: string; namaLengkap: string; fotoUrl: string | null; relasi: string; participationId?: string };

/**
 * Peserta event yang boleh saya isikan form: pendaftaran aktif (bukan BATAL)
 * milik saya, keluarga, dan tamu yang saya daftarkan; event berbayar → lunas.
 */
export async function eventSubjects(eventId: string, viewerJemaatId: string): Promise<UfSubject[]> {
  const fam = await familyOf(viewerJemaatId);
  const ids = [viewerJemaatId, ...fam.keys()];
  const ev = await prisma.event.findUnique({ where: { id: eventId }, select: { tipeBayar: true, nominal: true } });
  if (!ev) return [];
  const parts = await prisma.eventParticipation.findMany({
    where: { eventId, jemaatId: { in: ids }, status: { not: 'BATAL' } },
    select: {
      id: true,
      status: true,
      jemaatId: true,
      jemaat: { select: { namaLengkap: true, fotoUrl: true } },
      donations: { select: { status: true } },
    },
  });
  const order = new Map(ids.map((id, i) => [id, i]));
  return parts
    .filter((p) => !requiresPayment(ev) || paymentStatusOf(ev, p) === 'LUNAS')
    .sort((a, b) => (order.get(a.jemaatId) ?? 99) - (order.get(b.jemaatId) ?? 99))
    .map((p) => ({
      jemaatId: p.jemaatId,
      namaLengkap: p.jemaat.namaLengkap,
      fotoUrl: p.jemaat.fotoUrl,
      relasi: p.jemaatId === viewerJemaatId ? 'Saya' : fam.get(p.jemaatId) ?? '',
      participationId: p.id,
    }));
}

/** Konten masih terlihat oleh jemaat ini? (News terbit, Announcement diterima, Event terbit). */
export async function sourceVisible(sourceType: string, sourceId: string, jemaatId: string): Promise<boolean> {
  if (sourceType === 'NEWS') {
    const k = await prisma.konten.findUnique({ where: { id: sourceId }, select: { tipe: true, isPublished: true } });
    return !!k && k.tipe === 'NEWS' && k.isPublished;
  }
  if (sourceType === 'ANNOUNCEMENT') {
    const r = await prisma.announcementRecipient.findUnique({
      where: { announcementId_jemaatId: { announcementId: sourceId, jemaatId } },
      select: { announcement: { select: { status: true } } },
    });
    return !!r && ['SENDING', 'SENT'].includes(r.announcement.status);
  }
  if (sourceType === 'EVENT') {
    const e = await prisma.event.findUnique({ where: { id: sourceId }, select: { isPublished: true, isActive: true } });
    return !!e && e.isPublished && e.isActive;
  }
  return false;
}

/** Judul konten sumber (untuk channel di hasil & notifikasi). */
export async function sourceTitles(items: { sourceType: string | null; sourceId: string | null }[]) {
  const ids = (t: string) => [...new Set(items.filter((i) => i.sourceType === t && i.sourceId).map((i) => i.sourceId!))];
  const [news, ev, ann] = await Promise.all([
    ids('NEWS').length ? prisma.konten.findMany({ where: { id: { in: ids('NEWS') } }, select: { id: true, judul: true } }) : [],
    ids('EVENT').length ? prisma.event.findMany({ where: { id: { in: ids('EVENT') } }, select: { id: true, judul: true } }) : [],
    ids('ANNOUNCEMENT').length ? prisma.announcement.findMany({ where: { id: { in: ids('ANNOUNCEMENT') } }, select: { id: true, judul: true } }) : [],
  ]);
  const m = new Map<string, string>();
  for (const x of [...news, ...ev, ...ann]) m.set(x.id, x.judul);
  return m;
}

// ------------------------------------------------------------------ validasi

export type UfFieldRow = {
  id: string;
  tipe: string;
  label: string;
  wajib: boolean;
  opsi: unknown;
  validasi: unknown;
  autofill: string | null;
  hidden: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isEmpty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
const opsiOf = (f: UfFieldRow) => (Array.isArray(f.opsi) ? (f.opsi as unknown[]).map(String) : []);
const valOf = (f: UfFieldRow) => ((f.validasi ?? {}) as UfValidasi);
const plain = (md: string) => md.replace(/[*_`>#~\[\]()-]/g, '').replace(/\s+/g, ' ').trim();
const validDate = (s: string) => DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const todayStr = () => todayWib().toISOString().slice(0, 10);

function hostOk(url: string, domains?: string[]) {
  if (!domains?.length) return true;
  try {
    const h = new URL(url).hostname.toLowerCase();
    return domains.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function checkDate(s: string, v: UfValidasi): string | null {
  if (!validDate(s)) return 'Tanggal tidak valid.';
  if (v.minDate && s < v.minDate) return `Tanggal paling cepat ${v.minDate}.`;
  if (v.maxDate && s > v.maxDate) return `Tanggal paling lambat ${v.maxDate}.`;
  if (v.notPast && s < todayStr()) return 'Tanggal tidak boleh sebelum hari ini.';
  if (v.notFuture && s > todayStr()) return 'Tanggal tidak boleh setelah hari ini.';
  return null;
}

export type UfFileRef = { id: string; fieldId: string; kind: string; uploaderJemaatId: string; responseId: string | null };

/**
 * Validasi & normalisasi jawaban. `files` = file milik pengisi untuk form ini
 * (dipakai field FILE / SIGNATURE). Return jawaban bersih + error per field.
 */
export function validateAnswers(
  fields: UfFieldRow[],
  raw: Record<string, unknown>,
  files: Map<string, UfFileRef>,
  responseId: string | null,
  /** Nilai autofill peserta — field autofill yang datanya kosong diisi manual (divalidasi). */
  autofill: Record<string, string> = {},
): { jawaban: Record<string, unknown>; errors: Record<string, string> } {
  const jawaban: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (f.tipe === 'INFO' || f.hidden) continue;
    if (f.autofill && autofill[f.autofill]) continue;
    const v = valOf(f);
    let x = raw[f.id];
    if (typeof x === 'string') x = x.trim();
    if (isEmpty(x)) {
      if (f.wajib) errors[f.id] = f.tipe === 'SIGNATURE' ? 'Tanda tangan wajib.' : f.tipe === 'FILE' ? 'File wajib diunggah.' : 'Wajib diisi.';
      continue;
    }
    const fail = (m: string) => (errors[f.id] = m);
    switch (f.tipe) {
      case 'TEXT':
      case 'TEXTAREA':
      case 'RICHTEXT': {
        if (typeof x !== 'string') { fail('Isian tidak valid.'); break; }
        let s = x;
        if (f.tipe === 'RICHTEXT') s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ''); // tanpa gambar
        const len = f.tipe === 'RICHTEXT' ? plain(s).length : s.length;
        const max = v.maxLength ?? (f.tipe === 'TEXT' ? 500 : f.tipe === 'TEXTAREA' ? 5000 : 10000);
        if (v.minLength != null && len < v.minLength) { fail(`Minimal ${v.minLength} karakter.`); break; }
        if (len > max) { fail(`Maksimal ${max} karakter.`); break; }
        jawaban[f.id] = s;
        break;
      }
      case 'EMAIL': {
        const s = String(x).toLowerCase();
        if (!EMAIL_RE.test(s) || s.length > 255) { fail('Format email belum benar.'); break; }
        if (!hostOk(`https://${s.split('@')[1]}`, v.domains)) { fail(`Email harus dari domain ${v.domains!.join(', ')}.`); break; }
        jawaban[f.id] = s;
        break;
      }
      case 'URL': {
        const s = String(x);
        if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(s) || s.length > 2000) { fail('Link harus diawali http:// atau https://.'); break; }
        if (!hostOk(s, v.domains)) { fail(`Link harus dari ${v.domains!.join(', ')}.`); break; }
        jawaban[f.id] = s;
        break;
      }
      case 'PHONE': {
        const r = noHpSchema.safeParse(String(x));
        if (!r.success) { fail(r.error.issues[0]?.message ?? 'Nomor HP tidak valid.'); break; }
        jawaban[f.id] = r.data;
        break;
      }
      case 'NUMBER': {
        const n = typeof x === 'number' ? x : Number(String(x).replace(',', '.'));
        if (!Number.isFinite(n)) { fail('Harus berupa angka.'); break; }
        if (v.integer && !Number.isInteger(n)) { fail('Harus bilangan bulat.'); break; }
        if (v.min != null && n < v.min) { fail(`Minimal ${v.min}.`); break; }
        if (v.max != null && n > v.max) { fail(`Maksimal ${v.max}.`); break; }
        jawaban[f.id] = n;
        break;
      }
      case 'DATE': {
        const e = checkDate(String(x), v);
        if (e) { fail(e); break; }
        jawaban[f.id] = String(x);
        break;
      }
      case 'DATE_RANGE': {
        const o = x as { from?: string; to?: string };
        if (!o || typeof o !== 'object' || !o.from || !o.to) { fail('Isi tanggal mulai dan selesai.'); break; }
        const e = checkDate(o.from, v) ?? checkDate(o.to, v);
        if (e) { fail(e); break; }
        if (o.from > o.to) { fail('Tanggal selesai harus setelah tanggal mulai.'); break; }
        const days = Math.round((Date.parse(o.to) - Date.parse(o.from)) / 86400000) + 1;
        if (v.maxDays != null && days > v.maxDays) { fail(`Rentang maksimal ${v.maxDays} hari.`); break; }
        jawaban[f.id] = { from: o.from, to: o.to };
        break;
      }
      case 'DATETIME': {
        const d = new Date(String(x));
        if (Number.isNaN(d.getTime())) { fail('Tanggal & jam tidak valid.'); break; }
        const ds = new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10);
        const e = checkDate(ds, v);
        if (e) { fail(e); break; }
        if (v.notPast && d < new Date()) { fail('Waktu tidak boleh sudah lewat.'); break; }
        jawaban[f.id] = d.toISOString();
        break;
      }
      case 'SELECT':
      case 'RADIO': {
        if (!opsiOf(f).includes(String(x))) { fail('Pilihan tidak tersedia.'); break; }
        jawaban[f.id] = String(x);
        break;
      }
      case 'CHECKBOX': {
        const arr = Array.isArray(x) ? [...new Set(x.map(String))] : [];
        const ops = opsiOf(f);
        if (arr.some((a) => !ops.includes(a))) { fail('Pilihan tidak tersedia.'); break; }
        if (v.minSelect != null && arr.length < v.minSelect) { fail(`Pilih minimal ${v.minSelect}.`); break; }
        if (v.maxSelect != null && arr.length > v.maxSelect) { fail(`Pilih maksimal ${v.maxSelect}.`); break; }
        jawaban[f.id] = arr;
        break;
      }
      case 'BOOLEAN': {
        if (typeof x !== 'boolean') { fail('Pilih ya atau tidak.'); break; }
        jawaban[f.id] = x;
        break;
      }
      case 'FILE':
      case 'SIGNATURE': {
        const ids = f.tipe === 'SIGNATURE' ? [String(x)] : Array.isArray(x) ? [...new Set(x.map(String))] : [];
        const okFiles = ids.filter((id) => {
          const r = files.get(id);
          return r && r.fieldId === f.id && r.kind === (f.tipe === 'SIGNATURE' ? 'SIGNATURE' : 'FILE') && (r.responseId === null || r.responseId === responseId);
        });
        if (okFiles.length !== ids.length) { fail('File tidak ditemukan. Unggah ulang.'); break; }
        const max = f.tipe === 'SIGNATURE' ? 1 : v.maxFiles ?? 1;
        if (okFiles.length > max) { fail(`Maksimal ${max} file.`); break; }
        jawaban[f.id] = f.tipe === 'SIGNATURE' ? okFiles[0] : okFiles;
        break;
      }
      default:
        break;
    }
  }
  return { jawaban, errors };
}

/** SHA-256 isi jawaban (pengikat tanda tangan; urutan kunci dinormalkan). */
export function hashJawaban(input: { formId: string; subjekJemaatId: string; jawaban: unknown; autofill: unknown }): string {
  const norm = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, norm((v as Record<string, unknown>)[k])])) : v;
  return crypto.createHash('sha256').update(JSON.stringify(norm(input))).digest('hex');
}

/** Teks field autofill: data profil, atau isian manual bila data profil kosong. */
export function autofillOrAnswer(
  f: { tipe: string; autofill?: string | null; id: string },
  af: Record<string, string>,
  jaw: Record<string, unknown>,
  fileNames?: Map<string, string>,
): string {
  return (f.autofill ? af[f.autofill] : '') || answerText(f, jaw[f.id], fileNames);
}

/** Nilai jawaban sebagai teks (hasil & ekspor). */
export function answerText(f: { tipe: string; autofill?: string | null }, v: unknown, fileNames?: Map<string, string>): string {
  if (v == null || v === '') return '';
  switch (f.tipe) {
    case 'BOOLEAN':
      return v ? 'Ya' : 'Tidak';
    case 'CHECKBOX':
      return Array.isArray(v) ? v.join(', ') : String(v);
    case 'DATE_RANGE': {
      const o = v as { from: string; to: string };
      return `${o.from} s.d. ${o.to}`;
    }
    case 'DATETIME':
      return new Date(String(v)).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
    case 'FILE':
      return (Array.isArray(v) ? v : [v]).map((id) => fileNames?.get(String(id)) ?? 'file').join(', ');
    case 'SIGNATURE':
      return 'Ditandatangani';
    case 'RICHTEXT':
      return plain(String(v));
    default:
      return String(v);
  }
}
