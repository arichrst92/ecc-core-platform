/**
 * Gambar utuh sesuai aspect ratio aslinya (object-contain) — tidak terpotong.
 * Sisa ruang diisi versi blur dari gambar yang sama supaya tetap rapi.
 */
import Image from 'next/image';

export function FitImage({
  src,
  alt,
  sizes = '400px',
  priority,
  className = '',
  style,
}: {
  src: string;
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    // Tailwind: `.relative` menang atas `.absolute` (urutan CSS) — jadi posisi
    // dipilih eksplisit supaya `absolute inset-0` dari pemanggil tetap berlaku.
    <div
      className={`${/(^|\s)(absolute|fixed)(\s|$)/.test(className) ? '' : 'relative '}overflow-hidden bg-neutral-900 ${className}`}
      style={style}
    >
      <Image src={src} alt="" aria-hidden fill sizes="64px" className="object-cover scale-125 blur-2xl opacity-70" />
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-contain" />
    </div>
  );
}
