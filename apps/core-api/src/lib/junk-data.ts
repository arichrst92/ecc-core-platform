/**
 * Potensial junk data jemaat (Portal → Jemaat). Hanya PENANDA — tidak ada
 * yang dihapus / dinonaktifkan otomatis; admin meninjau lalu memilih
 * "Bukan junk", menonaktifkan, atau menggabungkan dobel.
 *
 * Dicek untuk jemaat AKTIF, bukan tamu, belum ditandai "Bukan junk".
 *
 * Semua sumber:
 *   NAMA_ANGKA      nama berisi angka / simbol
 *   NAMA_PENDEK     nama < 3 huruf
 *   NAMA_BERULANG   huruf sama berulang ≥ 4× ("aaaa")
 *   NAMA_UJI        kata uji coba (test, coba, asdf, dummy, …)
 *   AKUN_SISTEM     pola akun sistem Shiftsoft (Support Dinamigra, ECCBANDUNG-0574, …)
 *   HP_INVALID      no HP tidak lolos validasi nomor
 *   EMAIL_INVALID   email salah format / layanan email sekali pakai / test@
 *   TANGGAL_ANEH    lahir di masa depan, usia > 110 th, bergabung sebelum lahir
 *   DATA_KOSONG     tanpa no HP, email, tanggal lahir, alamat
 *                   (dikecualikan: didaftarkan keluarga / tanggungan)
 * Data app / portal (bukan Shiftsoft, bukan didaftarkan keluarga):
 *   TIDAK_AKTIF          tidak pernah login + tanpa aktivitas, dibuat > 6 bulan lalu
 *   ONBOARDING_MANGKRAK  punya akun tapi onboarding belum selesai > 30 hari
 * Data Shiftsoft (tidak memakai dua aturan di atas — memang belum login/onboard):
 *   SHIFTSOFT_TANPA_AKTIVITAS  tanpa aktivitas apa pun di ECC sejak diimpor (> 6 bulan)
 *
 * Aktivitas = pernah hadir ibadah, anggota homecell, ikut event, pelayanan, atau visit.
 * Hasil di-cache 10 menit (dihitung ulang saat "Bukan junk" ditandai).
 */
import { prisma, Prisma } from '@ecc/database';
import { normalizePhoneNumber } from '@ecc/shared-types';

export const JUNK_LABEL: Record<string, string> = {
  NAMA_ANGKA: 'Nama berisi angka/simbol',
  NAMA_PENDEK: 'Nama terlalu pendek',
  NAMA_BERULANG: 'Nama huruf berulang',
  NAMA_UJI: 'Nama seperti data uji coba',
  AKUN_SISTEM: 'Pola akun sistem Shiftsoft',
  HP_INVALID: 'No HP tidak valid',
  EMAIL_INVALID: 'Email tidak valid / sekali pakai',
  TANGGAL_ANEH: 'Tanggal lahir/bergabung tidak wajar',
  DATA_KOSONG: 'Tanpa no HP, email, tanggal lahir & alamat',
  TIDAK_AKTIF: 'Tidak pernah login & tanpa aktivitas > 6 bulan',
  ONBOARDING_MANGKRAK: 'Onboarding belum selesai > 30 hari',
  SHIFTSOFT_TANPA_AKTIVITAS: 'Data Shiftsoft tanpa aktivitas sejak diimpor',
};

const UJI = /\b(test|testing|tes|coba|cobacoba|asdf|qwerty|dummy|sample|contoh|xxx+|zzz+|abc|lorem)\b/i;
const SISTEM_EXACT = ['support dinamigra', 'support dinamigra admin', 'web registration', 'sup-0001'];
const SISTEM_RE = [/^ECC\s*[A-Z]+\s*-\s*\d{2,}$/i, /^ECC[A-Z]+\d{2,}$/i, /^Admin-\w+$/i, /^Administrator ECC/i];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const DISPOSABLE = [
  'mailinator.com',
  'yopmail.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'trashmail.com',
  'sharklasers.com',
  'example.com',
  'test.com',
  'email.com',
];
const MONTH = 30 * 86_400_000;

interface Row {
  id: string;
  nama_lengkap: string;
  no_hp: string | null;
  email: string | null;
  tanggal_lahir: Date | null;
  tanggal_bergabung: Date | null;
  alamat: string | null;
  created_at: Date;
  onboarded_at: Date | null;
  legacy_shiftsoft_id: number | null;
  dependent: boolean;
  has_user: boolean;
  logged_in: boolean;
  active: boolean;
}

export function junkReasons(r: Row, now = Date.now()): string[] {
  const out: string[] = [];
  const nama = (r.nama_lengkap ?? '').trim();
  const lower = nama.toLowerCase();
  const huruf = nama.replace(/[^\p{L}]/gu, '');
  const sistem = SISTEM_EXACT.includes(lower) || SISTEM_RE.some((re) => re.test(nama));
  if (sistem) out.push('AKUN_SISTEM');
  else {
    if (/[\d@#$%^&*_=+<>{}[\]|\\/~`!?;:"]/.test(nama)) out.push('NAMA_ANGKA');
    if (huruf.length < 3) out.push('NAMA_PENDEK');
    if (/(\p{L})\1{3,}/iu.test(nama)) out.push('NAMA_BERULANG');
    if (UJI.test(nama)) out.push('NAMA_UJI');
  }
  if (r.no_hp && !normalizePhoneNumber(r.no_hp)) out.push('HP_INVALID');
  if (r.email) {
    const e = r.email.trim().toLowerCase();
    const dom = e.split('@')[1] ?? '';
    if (!EMAIL_RE.test(e) || DISPOSABLE.includes(dom) || /^(test|tes|coba|asdf|dummy)\d*@/.test(e)) out.push('EMAIL_INVALID');
  }
  const lahir = r.tanggal_lahir ? new Date(r.tanggal_lahir).getTime() : null;
  if (
    lahir != null &&
    (lahir > now || now - lahir > 110 * 365.25 * 86_400_000 || (r.tanggal_bergabung && new Date(r.tanggal_bergabung).getTime() < lahir))
  )
    out.push('TANGGAL_ANEH');
  if (!r.dependent && !r.no_hp && !r.email && !r.tanggal_lahir && !(r.alamat ?? '').trim()) out.push('DATA_KOSONG');
  const umur = now - new Date(r.created_at).getTime();
  if (r.legacy_shiftsoft_id != null) {
    if (!r.active && !r.logged_in && umur > 6 * MONTH) out.push('SHIFTSOFT_TANPA_AKTIVITAS');
  } else if (!r.dependent) {
    if (!r.logged_in && !r.active && umur > 6 * MONTH) out.push('TIDAK_AKTIF');
    if (r.has_user && !r.onboarded_at && umur > MONTH) out.push('ONBOARDING_MANGKRAK');
  }
  return out;
}

let cache: { at: number; map: Map<string, string[]> } | null = null;
let computing: Promise<Map<string, string[]>> | null = null;
const TTL = 10 * 60_000;

async function compute(): Promise<Map<string, string[]>> {
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT j.id, j.nama_lengkap, j.no_hp, j.email, j.tanggal_lahir, j.tanggal_bergabung, j.alamat,
           j.created_at, j.onboarded_at, j.legacy_shiftsoft_id,
           (j.primary_guardian_id IS NOT NULL OR j.registered_via_jemaat_id IS NOT NULL) AS dependent,
           (u.id IS NOT NULL) AS has_user,
           (u.last_login_at IS NOT NULL) AS logged_in,
           (
             EXISTS (SELECT 1 FROM reservasi r WHERE r.jemaat_id = j.id AND r.status = 'JOIN')
             OR EXISTS (SELECT 1 FROM homecell_member hm WHERE hm.jemaat_id = j.id)
             OR EXISTS (SELECT 1 FROM event_participation ep WHERE ep.jemaat_id = j.id)
             OR EXISTS (SELECT 1 FROM jemaat_pelayanan jp WHERE jp.jemaat_id = j.id)
             OR EXISTS (SELECT 1 FROM visit v WHERE v.initiator_jemaat_id = j.id OR v.target_jemaat_id = j.id)
           ) AS active
    FROM jemaat j
    LEFT JOIN "user" u ON u.jemaat_id = j.id
    WHERE j.is_active = true AND j.is_tamu = false AND j.junk_dismissed_at IS NULL AND j.data_purged_at IS NULL
  `);
  const now = Date.now();
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const reasons = junkReasons(r, now);
    if (reasons.length) map.set(r.id, reasons);
  }
  return map;
}

/** Map jemaatId → kode alasan (hanya yang ditandai). */
export async function junkMap(): Promise<Map<string, string[]>> {
  if (cache && Date.now() - cache.at < TTL) return cache.map;
  if (!computing) {
    computing = compute()
      .then((map) => {
        cache = { at: Date.now(), map };
        return map;
      })
      .finally(() => {
        computing = null;
      });
  }
  return computing;
}

export function invalidateJunkCache() {
  cache = null;
}

/** Jumlah per alasan (ringkasan di Portal). */
export async function junkSummary() {
  const map = await junkMap();
  const perAlasan: Record<string, number> = {};
  for (const rs of map.values()) for (const r of rs) perAlasan[r] = (perAlasan[r] ?? 0) + 1;
  return { total: map.size, perAlasan };
}
