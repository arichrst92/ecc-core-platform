/**
 * UploadHint — hint kompak untuk area upload image:
 *   - Rekomendasi ukuran + format + max size
 *   - Optional "AI prompt generator" untuk hero image (event/news/renungan)
 *     yang admin bisa copy → paste ke ChatGPT/DALL-E/Midjourney/dll.
 *
 * Cara pakai:
 *   <UploadHint kind="hero-event" context={{ judul, deskripsi, tags }} />
 *   <UploadHint kind="hero-news" context={{ judul, ringkasan }} />
 *   <UploadHint kind="hero-renungan" context={{ judul, ayatAlkitab }} />
 *   <UploadHint kind="qris" />
 *   <UploadHint kind="bukti" />
 *   <UploadHint kind="profile" />
 */
'use client';

import { useState } from 'react';
import { Check, Copy, ImageIcon, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';

export type UploadKind =
  | 'hero-event'
  | 'hero-news'
  | 'hero-renungan'
  | 'qris'
  | 'bukti'
  | 'profile';

export interface UploadHintProps {
  kind: UploadKind;
  /** Konteks opsional yang dipakai untuk generate prompt AI. */
  context?: {
    judul?: string;
    deskripsi?: string;
    ringkasan?: string;
    ayatAlkitab?: string;
    tags?: string[];
  };
  /** Override hint text default kalau perlu. */
  className?: string;
}

// ---------------- Static specs per upload kind ----------------

const SPECS: Record<
  UploadKind,
  {
    label: string;
    dimensions: string;
    aspect: string;
    maxSize: string;
    formats: string;
    notes?: string;
  }
> = {
  'hero-event': {
    label: 'Hero Image Event',
    dimensions: '1600 × 1067 px (atau 1200 × 800 px)',
    aspect: '3:2 landscape',
    maxSize: '5 MB',
    formats: 'JPEG, PNG, WebP, HEIC',
    notes: 'Akan di-resize ke max 1600px sisi panjang. Sisakan ruang untuk teks overlay.',
  },
  'hero-news': {
    label: 'Hero Image News',
    dimensions: '1600 × 1067 px (atau 1200 × 800 px)',
    aspect: '3:2 landscape',
    maxSize: '5 MB',
    formats: 'JPEG, PNG, WebP, HEIC',
    notes: 'Tampil di list + detail news. Mobile crop center.',
  },
  'hero-renungan': {
    label: 'Hero Image Renungan',
    dimensions: '1600 × 1067 px (atau 1200 × 800 px)',
    aspect: '3:2 landscape',
    maxSize: '5 MB',
    formats: 'JPEG, PNG, WebP, HEIC',
    notes: 'Tema reflektif/biblical. Soft tone disarankan.',
  },
  qris: {
    label: 'QRIS Image',
    dimensions: 'Min 600 × 600 px (square)',
    aspect: '1:1 square',
    maxSize: '5 MB',
    formats: 'JPEG, PNG, WebP',
    notes: 'Pastikan QR code jelas terbaca. Background polos.',
  },
  bukti: {
    label: 'Bukti Transfer',
    dimensions: 'Foto / screenshot ukuran apa saja',
    aspect: 'Bebas',
    maxSize: '5 MB',
    formats: 'JPEG, PNG, WebP, HEIC',
    notes: 'Pastikan nominal & timestamp jelas terbaca.',
  },
  profile: {
    label: 'Foto Profil',
    dimensions: 'Min 400 × 400 px (square)',
    aspect: '1:1 square',
    maxSize: '5 MB',
    formats: 'JPEG, PNG, WebP, HEIC',
    notes: 'Akan di-crop center otomatis. Wajah jemaat di tengah.',
  },
};

// ---------------- Prompt templates per hero kind ----------------

function buildPrompt(kind: UploadKind, ctx: UploadHintProps['context']): string {
  const judul = ctx?.judul?.trim() || '(judul belum diisi)';
  const tagsLine =
    ctx?.tags && ctx.tags.length > 0 ? `\nTema/Tag: ${ctx.tags.join(', ')}` : '';
  const ringkasan = (ctx?.ringkasan ?? ctx?.deskripsi ?? '').trim().slice(0, 200);
  const ringkasanLine = ringkasan ? `\nKonteks singkat: ${ringkasan}` : '';

  if (kind === 'hero-event') {
    return [
      `Buatkan ilustrasi hero banner untuk event gereja berjudul "${judul}".`,
      ringkasanLine.trim(),
      tagsLine.trim(),
      '',
      'Style:',
      '- Warna cerah, modern, energetic (kontemporer church-friendly)',
      '- Aspect ratio 3:2 landscape (1600x1067 px)',
      '- Sisakan ruang kosong di bawah/kiri untuk overlay teks judul',
      '- Tidak ada teks tulisan di dalam gambar (judul akan di-overlay terpisah)',
      '- Hindari simbol agama lain selain Christian (kalau memang event Christian event)',
      '',
      'Platform hint:',
      '- DALL-E 3 / ChatGPT: paste prompt apa adanya, set ratio 16:9 atau 3:2 di settings',
      '- Midjourney: tambahkan `--ar 3:2 --v 6 --style raw` di akhir',
      '- Stable Diffusion: pakai sampler DPM++ 2M Karras, steps 30+, ratio 1600x1067',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (kind === 'hero-news') {
    return [
      `Buatkan ilustrasi hero banner untuk artikel news gereja berjudul "${judul}".`,
      ringkasanLine.trim(),
      tagsLine.trim(),
      '',
      'Style:',
      '- Photographic atau illustrative, sesuai topik news (mis. mission trip, baptism event, kegiatan pemuda)',
      '- Mood positif & informatif',
      '- Aspect ratio 3:2 landscape (1600x1067 px)',
      '- Tidak ada teks di dalam gambar',
      '- Komposisi netral (subject di-center atau rule-of-thirds)',
      '',
      'Platform hint:',
      '- DALL-E 3: ratio 16:9 atau 3:2',
      '- Midjourney: `--ar 3:2 --v 6 --style raw`',
      '- Stable Diffusion: ratio 1600x1067, prompt strength 7-9',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (kind === 'hero-renungan') {
    const ayatLine = ctx?.ayatAlkitab?.trim()
      ? `\nAyat utama: "${ctx.ayatAlkitab}"`
      : '';
    return [
      `Buatkan ilustrasi hero banner untuk renungan harian berjudul "${judul}".`,
      ayatLine.trim(),
      ringkasanLine.trim(),
      '',
      'Style:',
      '- Tone hangat, reflektif, kontemplatif (mis. sunrise, open Bible, hands in prayer)',
      '- Soft natural lighting, warna lembut (sepia, gold, soft amber)',
      '- Aspect ratio 3:2 landscape (1600x1067 px)',
      '- Tidak ada teks tulisan di gambar',
      '- Tidak grafik literal "Yesus" atau wajah karakter biblical secara realistis — preferensi ilustrasi simbolik (cross silhouette, light beam, nature scene)',
      '',
      'Platform hint:',
      '- DALL-E 3: ratio 3:2, prompt apa adanya',
      '- Midjourney: `--ar 3:2 --v 6 --style raw --quality 2`',
      '- Stable Diffusion: SDXL preferred, ratio 1600x1067',
    ]
      .filter(Boolean)
      .join('\n');
  }

  // Fallback (qris/bukti/profile tidak ada AI prompt)
  return '';
}

// ---------------- Component ----------------

export function UploadHint({ kind, context, className }: UploadHintProps) {
  const spec = SPECS[kind];
  const isHero = kind.startsWith('hero-');
  const [promptOpen, setPromptOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const prompt = isHero ? buildPrompt(kind, context) : '';

  function copyPrompt() {
    if (!prompt) return;
    navigator.clipboard
      .writeText(prompt)
      .then(() => {
        setCopied(true);
        toast.success('Prompt AI disalin ke clipboard');
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => toast.error('Gagal menyalin'));
  }

  return (
    <div className={`mt-2 ${className ?? ''}`}>
      {/* Size hint card */}
      <div className="flex items-start gap-2 text-xs text-neutral-600 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
        <ImageIcon className="w-3.5 h-3.5 mt-0.5 text-neutral-400 shrink-0" />
        <div className="flex-1 leading-relaxed">
          <div className="text-neutral-700 font-medium">{spec.label}</div>
          <div>
            Rekomendasi: <span className="font-mono">{spec.dimensions}</span> ({spec.aspect})
            · Max {spec.maxSize} · {spec.formats}
          </div>
          {spec.notes ? <div className="text-neutral-500 mt-0.5">{spec.notes}</div> : null}
        </div>
      </div>

      {/* AI prompt generator — hanya untuk hero images */}
      {isHero ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setPromptOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-800 px-2 py-1 -ml-2 rounded hover:bg-brand-50 transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{promptOpen ? 'Tutup' : 'Generate prompt AI'}</span>
            {promptOpen ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {promptOpen ? (
            <div className="mt-2 border border-brand-100 bg-brand-50/50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-brand-900">
                  Prompt siap-pakai (ChatGPT / DALL-E / Midjourney / Stable Diffusion)
                </span>
                <button
                  type="button"
                  onClick={copyPrompt}
                  className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900 bg-white border border-brand-200 hover:border-brand-300 px-2 py-1 rounded"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3" /> Tersalin
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> Copy
                    </>
                  )}
                </button>
              </div>
              <pre className="text-[11px] leading-relaxed text-neutral-700 whitespace-pre-wrap font-mono bg-white p-2.5 rounded border border-brand-100 max-h-64 overflow-auto">
{prompt}
              </pre>
              <div className="mt-2 text-[11px] text-neutral-500 leading-relaxed">
                💡 Tips: edit konteks "judul" / "ringkasan" / "tag" di form di atas, lalu buka kembali prompt ini — akan auto-update sesuai context terbaru. Upload hasilnya pakai tombol di atas.
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
