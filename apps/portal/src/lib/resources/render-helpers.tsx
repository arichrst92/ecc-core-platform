/**
 * Shared cell renderers untuk DataTable.
 * Karena render function return JSX, file ini harus .tsx.
 */
import type { ReactNode } from 'react';

export function statusBadge(value: unknown): ReactNode {
  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs rounded-full ${
        value ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500'
      }`}
    >
      {value ? 'Aktif' : 'Nonaktif'}
    </span>
  );
}

export function chipText(text: string, color: 'brand' | 'blue' | 'neutral' = 'neutral') {
  const cls =
    color === 'brand'
      ? 'bg-brand-50 text-brand-700'
      : color === 'blue'
        ? 'bg-blue-50 text-blue-700'
        : 'bg-neutral-100 text-neutral-700';
  return <span className={`inline-block px-2 py-0.5 text-xs rounded ${cls}`}>{text}</span>;
}

/** Render relasi obyek (mis. cabang.nama) dengan fallback. */
export function nestedField(path: string) {
  return (_value: unknown, row: Record<string, unknown>) => {
    const parts = path.split('.');
    let cur: unknown = row;
    for (const p of parts) {
      if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[p];
      else return '-';
    }
    return (cur as string) ?? '-';
  };
}

export function dateLocal(value: unknown) {
  if (!value) return '-';
  try {
    return new Date(value as string).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(value);
  }
}

export function timeRange(start: string, end: string) {
  return `${start} – ${end}`;
}

/** Hitung usia dalam tahun dari tanggal lahir (ISO date). */
export function calcAge(tanggalLahir: string | null | undefined): number | null {
  if (!tanggalLahir) return null;
  const dob = new Date(tanggalLahir);
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}
