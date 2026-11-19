/**
 * 2.5.0 — Bagian / tugas petugas pelayanan (Kategori → Tugas).
 *
 * Disimpan sebagai snapshot JSON di baris petugas (IbadahPelayananPetugas.tugas
 * / EventPelayananPetugas.tugas) supaya jadwal lama tetap terbaca walau master
 * kategori/tugas diganti nama atau dinonaktifkan.
 *
 * Aturan pilihan:
 *  - boleh lebih dari satu entri (multi tugas),
 *  - boleh kategori saja (tugasId = null),
 *  - boleh kosong (null) = belum ditentukan.
 */
import { prisma, Prisma } from '@ecc/database';
import { z } from 'zod';
import { BadRequest } from './errors.js';

export type TugasEntry = {
  kategoriId: string;
  kategori: string;
  ikon: string | null;
  tugasId: string | null;
  tugas: string | null;
};

export const MAX_TUGAS = 12;

/** Input dari app / Portal — hanya id; nama diambil dari master. */
export const tugasPilihanInput = z
  .array(z.object({ kategoriId: z.string().uuid(), tugasId: z.string().uuid().nullish() }))
  .max(MAX_TUGAS);
export type TugasPilihan = z.infer<typeof tugasPilihanInput>;

/** Baca kolom JSON → array entri yang valid (data rusak diabaikan). */
export function parseTugas(raw: unknown): TugasEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: TugasEntry[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.kategoriId !== 'string' || typeof o.kategori !== 'string') continue;
    out.push({
      kategoriId: o.kategoriId,
      kategori: o.kategori,
      ikon: typeof o.ikon === 'string' ? o.ikon : null,
      tugasId: typeof o.tugasId === 'string' ? o.tugasId : null,
      tugas: typeof o.tugas === 'string' ? o.tugas : null,
    });
  }
  return out;
}

/** Tanda tangan untuk deteksi perubahan (urutan tidak berpengaruh). */
export function tugasSig(raw: unknown): string {
  return parseTugas(raw)
    // Tugas dikenali dari id-nya saja (tetap sama walau dipindah kategori).
    .map((t) => (t.tugasId ? `t:${t.tugasId}` : `k:${t.kategoriId}`))
    .sort()
    .join('|');
}

/** "Sound › Mixer, Multimedia" — untuk teks notifikasi. */
export function tugasLabel(raw: unknown): string {
  return parseTugas(raw)
    .map((t) => (t.tugas ? `${t.kategori} › ${t.tugas}` : t.kategori))
    .join(', ');
}

/** Nilai untuk kolom Prisma Json? (null → DbNull). */
export function tugasDbValue(list: TugasEntry[] | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return list && list.length ? (list as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
}

/** Daftar pilihan aktif untuk satu pelayanan (dipakai app & Portal). */
export async function listTugasOptions(pelayananId: string, opts: { includeInactive?: boolean } = {}) {
  const active = opts.includeInactive ? {} : { isActive: true };
  const rows = await prisma.pelayananTugasKategori.findMany({
    where: { pelayananId, ...active },
    orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
    select: {
      id: true,
      nama: true,
      ikon: true,
      urutan: true,
      isActive: true,
      tugas: {
        where: active,
        orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
        select: { id: true, nama: true, urutan: true, isActive: true },
      },
    },
  });
  return rows;
}

/**
 * Validasi pilihan (harus milik pelayanan ini & aktif) lalu ubah jadi snapshot.
 * Entri ganda dibuang; kategori-saja + tugas di kategori yang sama tetap boleh,
 * tapi kategori-saja dibuang kalau tugas di kategori itu sudah dipilih.
 * Entri yang sama dengan nilai lama (`keep`) diterima walau master-nya sudah
 * nonaktif, supaya menyimpan ulang jadwal tidak gagal.
 */
export async function resolveTugas(
  pelayananId: string,
  input: TugasPilihan,
  keep: TugasEntry[] = [],
): Promise<TugasEntry[]> {
  if (!input.length) return [];
  // Semua kategori pelayanan ini (jumlahnya kecil) — tugas dicari lintas kategori
  // supaya tugas yang sudah DIPINDAH kategori tetap terbaca dari jadwal lama.
  const kategori = await prisma.pelayananTugasKategori.findMany({
    where: { pelayananId },
    select: { id: true, nama: true, ikon: true, isActive: true, tugas: { select: { id: true, nama: true, isActive: true } } },
  });
  const kMap = new Map(kategori.map((k) => [k.id, k]));
  const tMap = new Map(kategori.flatMap((k) => k.tugas.map((t) => [t.id, { t, k }] as const)));
  // Nilai lama: tugas dikenali dari id tugas; kategori-saja dari id kategori.
  const keepKey = new Set(keep.map((k) => (k.tugasId ? `t:${k.tugasId}` : `k:${k.kategoriId}`)));
  const seen = new Set<string>();
  const out: TugasEntry[] = [];
  for (const i of input) {
    let k: (typeof kategori)[number] | undefined;
    let tugas: { id: string; nama: string; isActive: boolean } | null = null;
    if (i.tugasId) {
      const hit = tMap.get(i.tugasId);
      if (!hit) throw BadRequest('Tugas tidak ditemukan di pelayanan ini.');
      tugas = hit.t;
      k = hit.k;
    } else {
      k = kMap.get(i.kategoriId);
      if (!k) throw BadRequest('Kategori tugas tidak ditemukan di pelayanan ini.');
    }
    const key = tugas ? `t:${tugas.id}` : `k:${k.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const inactive = !k.isActive || (tugas && !tugas.isActive);
    if (inactive && !keepKey.has(key)) throw BadRequest(`Pilihan "${tugas?.nama ?? k.nama}" sudah tidak aktif.`);
    out.push({ kategoriId: k.id, kategori: k.nama, ikon: k.ikon ?? null, tugasId: tugas?.id ?? null, tugas: tugas?.nama ?? null });
  }
  const withTugas = new Set(out.filter((o) => o.tugasId).map((o) => o.kategoriId));
  return out.filter((o) => o.tugasId || !withTugas.has(o.kategoriId));
}

/** Input opsional `tugas` di body Portal (field lain di-parse skema masing-masing). */
export const tugasBodyInput = z.object({ tugas: tugasPilihanInput.nullish() });

/** Notifikasi in-app ke petugas ketika tugasnya diubah (Portal / app). */
export async function notifyTugasUpdated(opts: {
  jemaatId: string;
  ministry: string;
  ministryId: string;
  label: string;
  tugas: unknown;
}) {
  const { createNotification } = await import('./notification.js');
  const lbl = tugasLabel(opts.tugas);
  await createNotification({
    jemaatId: opts.jemaatId,
    type: 'MINISTRY_DUTY_ASSIGNED',
    title: `Tugas pelayanan ${opts.ministry} diperbarui`,
    body: lbl ? `${opts.label} — tugas Anda: ${lbl}.` : `${opts.label} — tugas Anda belum ditentukan.`,
    actionUrl: '/profile/my-service',
    metadata: { ministryId: opts.ministryId, kind: 'tugas' },
  }).catch(() => {});
}

/**
 * Ganti nama di snapshot dengan nama terkini dari master (kalau kategori/tugas
 * di-rename di Portal). Entri yang master-nya sudah dihapus tetap memakai
 * snapshot. Memodifikasi array secara langsung.
 */
export async function refreshTugasNames(lists: TugasEntry[][]): Promise<void> {
  const kIds = new Set<string>();
  const tIds = new Set<string>();
  for (const l of lists)
    for (const e of l) {
      kIds.add(e.kategoriId);
      if (e.tugasId) tIds.add(e.tugasId);
    }
  if (!kIds.size) return;
  const [ks, ts] = await Promise.all([
    prisma.pelayananTugasKategori.findMany({ where: { id: { in: [...kIds] } }, select: { id: true, nama: true, ikon: true } }),
    tIds.size
      ? prisma.pelayananTugas.findMany({
          where: { id: { in: [...tIds] } },
          select: { id: true, nama: true, kategori: { select: { id: true, nama: true, ikon: true } } },
        })
      : [],
  ]);
  const kMap = new Map(ks.map((k) => [k.id, k]));
  const tMap = new Map(ts.map((t) => [t.id, t]));
  for (const l of lists)
    for (const e of l) {
      const t = e.tugasId ? tMap.get(e.tugasId) : undefined;
      // Tugas yang dipindah ke kategori lain → ikut kategori terkininya.
      const k = t ? t.kategori : kMap.get(e.kategoriId);
      if (k) {
        e.kategoriId = k.id;
        e.kategori = k.nama;
        e.ikon = k.ikon ?? null;
      }
      if (t) e.tugas = t.nama;
    }
}

/**
 * Kartu tim di detail ibadah/event (app): tugas hanya terlihat oleh petugas
 * di pelayanan itu (dia & rekannya) dan koordinator pelayanan tsb untuk cabang
 * ibadah/event. Jemaat lain cukup melihat peran. Return: pelayananId yang
 * tugasnya boleh ditampilkan ke viewer.
 */
export async function tugasVisiblePelayanan(
  viewerJemaatId: string | null | undefined,
  links: { pelayananId: string; jemaatIds: string[] }[],
  cabangId: string | null | undefined,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!viewerJemaatId || !links.length) return out;
  for (const l of links) if (l.jemaatIds.includes(viewerJemaatId)) out.add(l.pelayananId);
  const rest = links.map((l) => l.pelayananId).filter((id) => !out.has(id));
  if (rest.length && cabangId) {
    const koord = await prisma.pelayananApprover.findMany({
      where: { jemaatId: viewerJemaatId, cabangId, pelayananId: { in: rest } },
      select: { pelayananId: true },
    });
    for (const k of koord) out.add(k.pelayananId);
  }
  return out;
}
