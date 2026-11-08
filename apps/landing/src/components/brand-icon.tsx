/** Ikon sosial media / marketplace (2.4.7) sebagai link — lingkaran = sosmed, kotak = toko. */
import type { BrandGlyph } from '@/lib/brand-icons-data';

export function BrandIconLink({
  glyph,
  url,
  label,
  shape = 'circle',
  size = 40,
}: {
  glyph: BrandGlyph;
  url: string;
  label: string;
  shape?: 'circle' | 'square';
  size?: number;
}) {
  const inner = Math.round(size * (glyph.mode === 'stroke' ? 0.62 : 0.5));
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      className="inline-flex items-center justify-center transition hover:opacity-80 hover:-translate-y-0.5"
      style={{
        width: size,
        height: size,
        borderRadius: shape === 'circle' ? size / 2 : size * 0.28,
        backgroundColor: glyph.color,
      }}
    >
      <svg width={inner} height={inner} viewBox={`0 0 ${glyph.viewBox} ${glyph.viewBox}`} aria-hidden>
        {glyph.paths.map((d, i) =>
          glyph.mode === 'fill' ? (
            <path key={i} d={d} fill="#fff" />
          ) : (
            <path key={i} d={d} fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          ),
        )}
        {(glyph.circles ?? []).map((c, i) => (
          <circle key={`c${i}`} cx={c.cx} cy={c.cy} r={c.r} fill="none" stroke="#fff" strokeWidth={3} />
        ))}
      </svg>
    </a>
  );
}
