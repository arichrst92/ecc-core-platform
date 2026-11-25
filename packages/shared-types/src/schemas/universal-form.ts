/**
 * Universal Form (2026-12) — form isian yang disematkan di News / Event /
 * Announcement. Dipakai Portal (builder & hasil) dan core-api (validasi).
 */
import { z } from 'zod';

export const UF_FIELD_TYPES = [
  'TEXT',
  'TEXTAREA',
  'RICHTEXT',
  'FILE',
  'EMAIL',
  'URL',
  'PHONE',
  'DATE',
  'DATE_RANGE',
  'DATETIME',
  'SELECT',
  'RADIO',
  'CHECKBOX',
  'NUMBER',
  'BOOLEAN',
  'SIGNATURE',
  'INFO',
] as const;
export type UfFieldType = (typeof UF_FIELD_TYPES)[number];

export const UF_FIELD_LABEL: Record<UfFieldType, string> = {
  TEXT: 'Teks pendek',
  TEXTAREA: 'Teks panjang',
  RICHTEXT: 'Rich text',
  FILE: 'Upload file',
  EMAIL: 'Email',
  URL: 'Link',
  PHONE: 'Nomor HP',
  DATE: 'Tanggal',
  DATE_RANGE: 'Rentang tanggal',
  DATETIME: 'Tanggal + jam',
  SELECT: 'Dropdown',
  RADIO: 'Pilihan ganda',
  CHECKBOX: 'Centang (banyak pilihan)',
  NUMBER: 'Angka',
  BOOLEAN: 'Ya / tidak',
  SIGNATURE: 'Tanda tangan digital',
  INFO: 'Informasi (bukan isian)',
};

/** Jenis yang punya pilihan. */
export const UF_OPTION_TYPES: readonly UfFieldType[] = ['SELECT', 'RADIO', 'CHECKBOX'];
/** Jenis yang tidak menyimpan jawaban. */
export const ufIsInput = (t: string) => t !== 'INFO';

export const UF_INFO_STYLES = ['HEADING', 'TEXT', 'INFO', 'WARNING'] as const;
export type UfInfoStyle = (typeof UF_INFO_STYLES)[number];
export const UF_INFO_STYLE_LABEL: Record<UfInfoStyle, string> = {
  HEADING: 'Judul bagian',
  TEXT: 'Teks biasa',
  INFO: 'Info (biru)',
  WARNING: 'Penting (kuning)',
};

/** Sumber autofill dari data jemaat (read-only di app). */
export const UF_AUTOFILL = [
  'NAMA',
  'KODE',
  'NO_HP',
  'EMAIL',
  'TANGGAL_LAHIR',
  'USIA',
  'JENIS_KELAMIN',
  'CABANG',
  'HOMECELL',
  'ZONA',
  'ALAMAT',
  'PEKERJAAN',
  'STATUS_NIKAH',
] as const;
export type UfAutofill = (typeof UF_AUTOFILL)[number];
export const UF_AUTOFILL_LABEL: Record<UfAutofill, string> = {
  NAMA: 'Nama lengkap',
  KODE: 'Kode jemaat',
  NO_HP: 'Nomor HP',
  EMAIL: 'Email',
  TANGGAL_LAHIR: 'Tanggal lahir',
  USIA: 'Usia',
  JENIS_KELAMIN: 'Jenis kelamin',
  CABANG: 'Cabang',
  HOMECELL: 'Homecell',
  ZONA: 'Zona',
  ALAMAT: 'Alamat',
  PEKERJAAN: 'Pekerjaan',
  STATUS_NIKAH: 'Status pernikahan',
};

/** Kategori jenis file untuk field FILE. */
export const UF_FILE_ACCEPT = ['image', 'pdf', 'doc', 'sheet', 'slide', 'text'] as const;
export type UfFileAccept = (typeof UF_FILE_ACCEPT)[number];
export const UF_FILE_ACCEPT_LABEL: Record<UfFileAccept, string> = {
  image: 'Gambar (JPG, PNG, WEBP, HEIC)',
  pdf: 'PDF',
  doc: 'Word',
  sheet: 'Excel',
  slide: 'PowerPoint',
  text: 'Teks (.txt)',
};
export const UF_FILE_EXT: Record<UfFileAccept, string[]> = {
  image: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
  pdf: ['pdf'],
  doc: ['doc', 'docx'],
  sheet: ['xls', 'xlsx', 'csv'],
  slide: ['ppt', 'pptx'],
  text: ['txt'],
};
export const UF_MAX_FILES = 10;
export const UF_MAX_FILE_MB = 20;

export const UF_SOURCE_TYPES = ['NEWS', 'EVENT', 'ANNOUNCEMENT'] as const;
export type UfSourceType = (typeof UF_SOURCE_TYPES)[number];
export const UF_SOURCE_LABEL: Record<UfSourceType, string> = { NEWS: 'News', EVENT: 'Event', ANNOUNCEMENT: 'Announcement' };

export const UF_FORM_STATUS = ['DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED'] as const;
export type UfFormStatus = (typeof UF_FORM_STATUS)[number];
export const UF_FORM_STATUS_LABEL: Record<UfFormStatus, string> = {
  DRAFT: 'Draf',
  OPEN: 'Dibuka',
  CLOSED: 'Ditutup',
  ARCHIVED: 'Arsip',
};

export const UF_RESPONSE_STATUS = ['SUBMITTED', 'NEEDS_FIX', 'REJECTED'] as const;
export type UfResponseStatus = (typeof UF_RESPONSE_STATUS)[number];
export const UF_RESPONSE_STATUS_LABEL: Record<UfResponseStatus, string> = {
  SUBMITTED: 'Terkirim',
  NEEDS_FIX: 'Perlu diperbaiki',
  REJECTED: 'Ditolak',
};

/** Batas perbaikan bawaan saat admin meminta perbaikan (jam). */
export const UF_FIX_DEFAULT_HOURS = 48;

// ------------------------------------------------------------------ schema Portal

const optNum = z.preprocess(
  (v) => (v === '' || v === null || (typeof v === 'number' && Number.isNaN(v)) ? undefined : typeof v === 'string' ? Number(v) : v),
  z.number().finite().optional(),
);
const optDate = z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD').optional());

export const ufValidasiSchema = z
  .object({
    minLength: optNum,
    maxLength: optNum,
    min: optNum,
    max: optNum,
    integer: z.boolean().optional(),
    minDate: optDate,
    maxDate: optDate,
    notPast: z.boolean().optional(),
    notFuture: z.boolean().optional(),
    maxDays: optNum,
    maxFiles: optNum,
    maxSizeMb: optNum,
    accept: z.array(z.enum(UF_FILE_ACCEPT)).optional(),
    domains: z.array(z.string().trim().toLowerCase().max(100)).max(20).optional(),
    minSelect: optNum,
    maxSelect: optNum,
  })
  .strip();
export type UfValidasi = z.infer<typeof ufValidasiSchema>;

export const ufFieldInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    tipe: z.enum(UF_FIELD_TYPES),
    label: z.string().trim().max(300).default(''),
    petunjuk: z.string().trim().max(1000).nullish(),
    wajib: z.boolean().default(false),
    opsi: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
    validasi: ufValidasiSchema.default({}),
    autofill: z.enum(UF_AUTOFILL).nullish(),
    gaya: z.enum(UF_INFO_STYLES).nullish(),
    isi: z.string().max(5000).nullish(),
    hidden: z.boolean().default(false),
  })
  .superRefine((f, ctx) => {
    if (f.tipe !== 'INFO' && !f.label) ctx.addIssue({ code: 'custom', path: ['label'], message: 'Label wajib diisi.' });
    if (f.tipe === 'INFO' && !f.label && !f.isi) ctx.addIssue({ code: 'custom', path: ['isi'], message: 'Isi blok informasi masih kosong.' });
    if (UF_OPTION_TYPES.includes(f.tipe) && f.opsi.length < 1)
      ctx.addIssue({ code: 'custom', path: ['opsi'], message: 'Tambahkan minimal 1 pilihan.' });
    if (f.autofill && f.tipe !== 'TEXT')
      ctx.addIssue({ code: 'custom', path: ['autofill'], message: 'Autofill hanya untuk field Teks pendek.' });
    const v = f.validasi;
    if (v.minLength != null && v.maxLength != null && v.minLength > v.maxLength)
      ctx.addIssue({ code: 'custom', path: ['validasi', 'maxLength'], message: 'Panjang minimal melebihi maksimal.' });
    if (v.min != null && v.max != null && v.min > v.max)
      ctx.addIssue({ code: 'custom', path: ['validasi', 'max'], message: 'Nilai minimal melebihi maksimal.' });
    if (v.maxFiles != null && (v.maxFiles < 1 || v.maxFiles > UF_MAX_FILES))
      ctx.addIssue({ code: 'custom', path: ['validasi', 'maxFiles'], message: `Jumlah file 1–${UF_MAX_FILES}.` });
    if (v.maxSizeMb != null && (v.maxSizeMb <= 0 || v.maxSizeMb > UF_MAX_FILE_MB))
      ctx.addIssue({ code: 'custom', path: ['validasi', 'maxSizeMb'], message: `Ukuran per file maks ${UF_MAX_FILE_MB} MB.` });
  });
export type UfFieldInput = z.infer<typeof ufFieldInputSchema>;

const optDateTime = z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullish());

export const ufFormInputSchema = z
  .object({
    judul: z.string().trim().min(3, 'Judul minimal 3 karakter.').max(200),
    deskripsi: z.string().trim().max(5000).nullish(),
    status: z.enum(UF_FORM_STATUS).default('DRAFT'),
    anonim: z.boolean().default(false),
    bukaAt: optDateTime,
    tutupAt: optDateTime,
    multiResponse: z.boolean().default(false),
    allowEdit: z.boolean().default(true),
    kuota: z.preprocess((v) => (v === '' || v === null ? null : v), z.coerce.number().int().min(1).nullish()),
    pesanTerimaKasih: z.string().trim().max(1000).nullish(),
    fields: z.array(ufFieldInputSchema).max(100).default([]),
  })
  .superRefine((f, ctx) => {
    if (f.bukaAt && f.tutupAt && f.bukaAt >= f.tutupAt)
      ctx.addIssue({ code: 'custom', path: ['tutupAt'], message: 'Tanggal tutup harus setelah tanggal buka.' });
    if (f.anonim) {
      f.fields.forEach((x, i) => {
        if (x.autofill) ctx.addIssue({ code: 'custom', path: ['fields', i, 'autofill'], message: 'Form anonim tidak boleh memakai autofill data jemaat.' });
        if (x.tipe === 'SIGNATURE') ctx.addIssue({ code: 'custom', path: ['fields', i, 'tipe'], message: 'Form anonim tidak boleh memakai tanda tangan.' });
      });
    }
    if (f.status === 'OPEN' && !f.fields.some((x) => x.tipe !== 'INFO' && !x.hidden))
      ctx.addIssue({ code: 'custom', path: ['fields'], message: 'Form yang dibuka harus punya minimal 1 field isian.' });
  });
export type UfFormInput = z.infer<typeof ufFormInputSchema>;

/** Sematan form di sebuah konten (diset dari form News / Event / Announcement). */
export const ufEmbedListSchema = z.object({
  forms: z
    .array(
      z.object({
        formId: z.string().uuid(),
        batasAt: optDateTime,
        autoCancel: z.boolean().default(false),
      }),
    )
    .max(10),
});
export type UfEmbedList = z.infer<typeof ufEmbedListSchema>;

/** Aksi admin atas satu respons. */
export const ufReviewSchema = z
  .object({
    action: z.enum(['NEEDS_FIX', 'REJECT', 'CANCEL_REGISTRATION', 'RESTORE']),
    alasan: z.string().trim().max(1000).nullish(),
    perbaikiSebelum: optDateTime,
  })
  .superRefine((v, ctx) => {
    if (v.action !== 'RESTORE' && (!v.alasan || v.alasan.length < 3))
      ctx.addIssue({ code: 'custom', path: ['alasan'], message: 'Tulis alasan (min. 3 karakter).' });
  });
export type UfReview = z.infer<typeof ufReviewSchema>;
