'use client';

/**
 * Nama jemaat yang bisa diklik → detail jemaat. Dipakai untuk PIC zona,
 * PIC homecell, dan pastor zona di halaman Zona / Homecell.
 * stopPropagation supaya klik di baris tabel tidak ikut membuka aksi baris.
 */
import Link from 'next/link';

export function JemaatLink({
  jemaat,
  className = '',
  empty = '—',
}: {
  jemaat: { id: string; namaLengkap: string } | null | undefined;
  className?: string;
  empty?: string;
}) {
  if (!jemaat) return <span className="text-neutral-400">{empty}</span>;
  return (
    <Link
      href={`/dashboard/jemaat/${jemaat.id}`}
      onClick={(e) => e.stopPropagation()}
      className={`text-brand-600 hover:underline ${className}`}
    >
      {jemaat.namaLengkap}
    </Link>
  );
}

/** Daftar jemaat (mis. beberapa pastor) dipisah koma, masing-masing bisa diklik. */
export function JemaatLinks({
  list,
  className = '',
  empty = '—',
}: {
  list: { id: string; namaLengkap: string }[] | null | undefined;
  className?: string;
  empty?: string;
}) {
  if (!list || list.length === 0) return <span className="text-neutral-400">{empty}</span>;
  return (
    <span className={className}>
      {list.map((j, i) => (
        <span key={j.id}>
          {i > 0 ? ', ' : ''}
          <JemaatLink jemaat={j} />
        </span>
      ))}
    </span>
  );
}
