'use client';

/**
 * Crop cover 1:1 (ECC Worship) — geser, zoom, putar 90°, pratinjau di Els App.
 * Hasil: JPEG 1000×1000 (server mengonversi ke WebP).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';

const V = 300; // ukuran viewport crop (px)
const OUT = 1000;

interface Props {
  file: File;
  onCancel: () => void;
  onDone: (blob: Blob) => void | Promise<void>;
}

export function CoverCropper({ file, onCancel, onDone }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => setImg(im);
    im.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const dims = useCallback(() => {
    if (!img) return { rw: 1, rh: 1, scale: 1 };
    const swap = rot % 180 !== 0;
    const rw = swap ? img.naturalHeight : img.naturalWidth;
    const rh = swap ? img.naturalWidth : img.naturalHeight;
    return { rw, rh, scale: (V / Math.min(rw, rh)) * zoom };
  }, [img, rot, zoom]);

  const clamp = useCallback(
    (x: number, y: number) => {
      const { rw, rh, scale } = dims();
      const mx = Math.max(0, (rw * scale - V) / 2);
      const my = Math.max(0, (rh * scale - V) / 2);
      return { x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) };
    },
    [dims],
  );

  useEffect(() => setPos((p) => clamp(p.x, p.y)), [zoom, rot, clamp]);

  const render = useCallback(
    (size: number): HTMLCanvasElement | null => {
      if (!img) return null;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d')!;
      const k = size / V;
      const { scale } = dims();
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, size, size);
      ctx.translate(size / 2 + pos.x * k, size / 2 + pos.y * k);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.scale(scale * k, scale * k);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      return c;
    },
    [img, dims, pos, rot],
  );

  useEffect(() => {
    const t = setTimeout(() => setPreview(render(260)?.toDataURL('image/jpeg', 0.8) ?? null), 80);
    return () => clearTimeout(t);
  }, [render]);

  async function save() {
    const c = render(OUT);
    if (!c) return;
    setSaving(true);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.92));
    try {
      if (blob) await onDone(blob);
    } finally {
      setSaving(false);
    }
  }

  const { scale } = dims();
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={saving ? undefined : onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl pointer-events-auto">
          <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900">Atur cover</h2>
            <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-neutral-100" disabled={saving}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-5 p-5">
            <div>
              <div
                className="relative mx-auto overflow-hidden rounded-lg bg-neutral-900 cursor-grab active:cursor-grabbing touch-none select-none"
                style={{ width: V, height: V }}
                onPointerDown={(e) => {
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
                }}
                onPointerMove={(e) => {
                  if (!drag.current) return;
                  setPos(clamp(drag.current.px + e.clientX - drag.current.x, drag.current.py + e.clientY - drag.current.y));
                }}
                onPointerUp={() => (drag.current = null)}
                onWheel={(e) => setZoom((z) => Math.min(4, Math.max(1, z - e.deltaY * 0.001)))}
              >
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={img.src}
                    alt=""
                    draggable={false}
                    className="absolute max-w-none pointer-events-none"
                    style={{
                      left: '50%',
                      top: '50%',
                      width: img.naturalWidth,
                      height: img.naturalHeight,
                      transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px) rotate(${rot}deg) scale(${scale})`,
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                  </div>
                )}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage:
                      'linear-gradient(rgba(255,255,255,.35) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.35) 1px,transparent 1px)',
                    backgroundSize: '33.33% 33.33%',
                  }}
                />
              </div>
              <div className="flex items-center gap-2 mt-3 text-neutral-500">
                <ZoomOut className="w-4 h-4" />
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 accent-brand-500"
                  aria-label="Zoom"
                />
                <ZoomIn className="w-4 h-4" />
                <button
                  onClick={() => setRot((r) => (r + 90) % 360)}
                  className="ml-1 p-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-50"
                  title="Putar 90°"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-neutral-500 mt-1.5">Geser gambar untuk mengatur posisi. Rasio terkunci 1:1.</p>
            </div>
            <div className="space-y-3">
              <div className="text-xs font-semibold text-neutral-600">Pratinjau di Els App</div>
              <div className="flex items-end gap-3">
                <div>
                  <div className="w-[84px] h-[84px] rounded-[10px] bg-neutral-200 bg-cover bg-center" style={{ backgroundImage: preview ? `url(${preview})` : undefined }} />
                  <div className="text-[11px] text-neutral-500 mt-1">Grid album</div>
                </div>
                <div>
                  <div className="w-10 h-10 rounded-lg bg-neutral-200 bg-cover bg-center" style={{ backgroundImage: preview ? `url(${preview})` : undefined }} />
                  <div className="text-[11px] text-neutral-500 mt-1">Mini-player</div>
                </div>
              </div>
              <div>
                <div className="w-[130px] h-[130px] rounded-xl bg-neutral-200 bg-cover bg-center" style={{ backgroundImage: preview ? `url(${preview})` : undefined }} />
                <div className="text-[11px] text-neutral-500 mt-1">Pemutar & lock screen</div>
              </div>
              <div className="text-[11px] text-neutral-500">Disimpan 1000×1000 (WebP).</div>
            </div>
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-neutral-100">
            <button onClick={onCancel} disabled={saving} className="h-9 px-4 text-sm rounded-lg border border-neutral-300 hover:bg-neutral-50">
              Batal
            </button>
            <button
              onClick={save}
              disabled={!img || saving}
              className="flex items-center gap-2 h-9 px-4 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Simpan cover
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/** Tombol pilih file → buka cropper → unggah ke /admin/worship/albums/:id/cover. */
export function CoverPicker({
  coverUrl,
  onUpload,
  size = 120,
}: {
  coverUrl: string | null;
  onUpload: (blob: Blob) => Promise<void>;
  size?: number;
}) {
  const [file, setFile] = useState<File | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="rounded-xl bg-neutral-100 border border-dashed border-neutral-300 bg-cover bg-center flex items-center justify-center text-xs text-neutral-500 hover:border-brand-400 shrink-0"
        style={{ width: size, height: size, backgroundImage: coverUrl ? `url(${coverUrl})` : undefined }}
      >
        {coverUrl ? null : 'Pilih cover'}
      </button>
      <div className="text-xs text-neutral-500">
        <button type="button" onClick={() => ref.current?.click()} className="text-brand-600 font-medium">
          {coverUrl ? 'Ganti cover' : 'Unggah cover'}
        </button>
        <div>JPG/PNG, dipotong 1:1</div>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setFile(f);
          e.target.value = '';
        }}
      />
      {file ? (
        <CoverCropper
          file={file}
          onCancel={() => setFile(null)}
          onDone={async (blob) => {
            await onUpload(blob);
            setFile(null);
          }}
        />
      ) : null}
    </div>
  );
}
