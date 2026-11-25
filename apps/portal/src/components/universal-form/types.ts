/** Universal Form — tipe & helper bersama Portal (2026-12). */
import type { UfAutofill, UfFieldType, UfInfoStyle, UfValidasi } from '@ecc/shared-types';

export type UfField = {
  id?: string;
  /** Kunci lokal untuk field baru (belum punya id). */
  key: string;
  tipe: UfFieldType;
  label: string;
  petunjuk?: string | null;
  wajib: boolean;
  opsi: string[];
  validasi: UfValidasi;
  autofill?: UfAutofill | null;
  gaya?: UfInfoStyle | null;
  isi?: string | null;
  hidden: boolean;
  hasAnswers?: boolean;
};

export type UfFormDetail = {
  id: string;
  judul: string;
  deskripsi: string | null;
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED';
  anonim: boolean;
  bukaAt: string | null;
  tutupAt: string | null;
  multiResponse: boolean;
  allowEdit: boolean;
  kuota: number | null;
  pesanTerimaKasih: string | null;
  responseCount: number;
  fields: (Omit<UfField, 'key'> & { id: string })[];
  embeds: { id: string; sourceType: string; sourceId: string; batasAt: string | null; autoCancel: boolean; judul: string; responseCount: number }[];
};

export const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-neutral-100 text-neutral-600',
  OPEN: 'bg-emerald-50 text-emerald-700',
  CLOSED: 'bg-amber-50 text-amber-700',
  ARCHIVED: 'bg-neutral-100 text-neutral-500',
};

export const RESP_BADGE: Record<string, string> = {
  SUBMITTED: 'bg-emerald-50 text-emerald-700',
  NEEDS_FIX: 'bg-amber-50 text-amber-700',
  REJECTED: 'bg-red-50 text-red-700',
};

export const SOURCE_BADGE: Record<string, string> = {
  NEWS: 'bg-emerald-50 text-emerald-700',
  EVENT: 'bg-sky-50 text-sky-700',
  ANNOUNCEMENT: 'bg-violet-50 text-violet-700',
};

export const SOURCE_HREF: Record<string, (id: string) => string> = {
  NEWS: () => '/dashboard/news',
  EVENT: (id) => `/dashboard/event/${id}`,
  ANNOUNCEMENT: (id) => `/dashboard/announcement/${id}`,
};

/** ISO → "YYYY-MM-DDTHH:mm" dalam WIB (untuk input datetime-local). */
export function isoToWibInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 7 * 3600_000);
  return d.toISOString().slice(0, 16);
}

/** "YYYY-MM-DDTHH:mm" (WIB) → ISO; kosong → null. */
export function wibInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(`${v}:00+07:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function fmtWib(iso: string | null | undefined): string {
  if (!iso) return '—';
  return (
    new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB'
  );
}

export const newKey = () => Math.random().toString(36).slice(2, 10);

export const errMsg = (e: unknown, fb = 'Gagal') =>
  (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fb;
