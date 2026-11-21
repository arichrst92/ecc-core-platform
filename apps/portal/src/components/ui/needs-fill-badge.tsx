'use client';

/**
 * Badge biru "Perlu diisi" (beranimasi) untuk data penting yang masih kosong,
 * mis. tugas petugas, PIC homecell/zona/group, lokasi, gambar event.
 * Bisa diklik (onClick) untuk langsung membuka pengisian.
 * Animasi ada di globals.css (.needs-fill-badge) dan mati bila "kurangi gerakan" aktif.
 */
import { PencilLine } from 'lucide-react';

export function NeedsFillBadge({
  label = 'Perlu diisi',
  hint,
  onClick,
  className = '',
}: {
  label?: string;
  /** Penjelasan (tooltip): apa yang perlu diisi & kenapa. */
  hint?: string;
  onClick?: () => void;
  className?: string;
}) {
  const cls = `needs-fill-badge inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white whitespace-nowrap ${className}`;
  const body = (
    <>
      <PencilLine className="w-3 h-3" />
      {label}
    </>
  );
  return onClick ? (
    <button
      type="button"
      title={hint}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`${cls} hover:brightness-110`}
    >
      {body}
    </button>
  ) : (
    <span title={hint} className={cls}>
      {body}
    </span>
  );
}
