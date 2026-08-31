import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Church, Landmark, QrCode, ChevronLeft, Info } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { CopyRekeningButton } from '../copy-button';
import { QrisPreview } from '@/components/qris-preview';

const API_BASE =
  process.env.NEXT_PUBLIC_CORE_API_URL ?? 'https://api.eccchurch.global';

function resolveAssetUrl(url: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `${API_BASE}${url}`;
  return url;
}

interface Cabang {
  id: string;
  nama: string;
  kode: string;
  alamat: string | null;
  isActive: boolean;
}

interface Rekening {
  id: string;
  purpose: string;
  bankNama: string;
  bankNomor: string;
  bankAtasNama: string;
  qrisImageUrl: string | null;
  catatan: string | null;
}

interface RekeningResponse {
  cabang: { id: string; nama: string; kode: string };
  rekening: Rekening[];
}

async function findCabangByKode(kode: string): Promise<Cabang | null> {
  const list = (await apiGet<Cabang[]>('/auth/cabang?isActive=true')) ?? [];
  const match = list.find((c) => c.kode.toLowerCase() === kode.toLowerCase());
  return match ?? null;
}

export async function generateMetadata(
  { params }: { params: { kode: string } },
): Promise<Metadata> {
  const cabang = await findCabangByKode(params.kode);
  if (!cabang) {
    return {
      title: 'Cabang tidak ditemukan',
      robots: { index: false, follow: false },
    };
  }
  return {
    title: `Persembahan · ${cabang.nama}`,
    description: `Info rekening persembahan untuk cabang ${cabang.nama} (perpuluhan, ucapan syukur, diakonia, pembangunan, misi).`,
    robots: { index: true, follow: true },
  };
}

export default async function PersembahanCabangPage(
  { params }: { params: { kode: string } },
) {
  const cabang = await findCabangByKode(params.kode);
  if (!cabang) notFound();

  const resp = await apiGet<RekeningResponse>(`/public/cabang/${cabang.id}/rekening`);
  const rekening = resp?.rekening ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50">
      {/* Header */}
      <section className="border-b border-orange-100 bg-white/60 backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <Link
            href="/persembahan"
            className="inline-flex items-center gap-1 text-xs text-orange-700 hover:text-orange-800 mb-4"
          >
            <ChevronLeft className="w-4 h-4" /> Ganti cabang
          </Link>

          <div className="flex items-center gap-3 mb-2">
            <Image src="/logo-ecc.webp" alt="ECC" width={40} height={40} />
            <div>
              <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider">
                Persembahan · {cabang.kode}
              </p>
              <h1 className="text-2xl md:text-3xl font-bold text-neutral-900">
                {cabang.nama}
              </h1>
              {cabang.alamat && (
                <p className="text-xs text-neutral-500 mt-0.5">{cabang.alamat}</p>
              )}
            </div>
          </div>
          <p className="text-sm text-neutral-600 mt-3 leading-relaxed">
            Terima kasih atas kesetiaan Anda dalam memberi. Berikut info rekening
            resmi cabang {cabang.nama}.
          </p>
        </div>
      </section>

      {/* Rekening list */}
      <section className="max-w-3xl mx-auto px-6 py-10">
        {rekening.length === 0 ? (
          <div className="text-center py-16 bg-white border border-orange-100 rounded-2xl">
            <Info className="w-10 h-10 text-orange-400 mx-auto mb-3" />
            <p className="text-sm text-neutral-600">
              Info rekening cabang ini sedang dalam pembaruan. Silakan hubungi
              admin cabang {cabang.nama}.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-orange-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white flex items-center gap-3">
              <Church className="w-5 h-5" />
              <h2 className="font-bold text-lg">{cabang.nama}</h2>
            </div>

            <div className="p-6 grid gap-4">
              {rekening.map((r) => (
                <div
                  key={r.id}
                  className="border border-neutral-200 rounded-xl p-4 hover:border-orange-300 transition"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <span className="inline-block px-2 py-0.5 mb-2 bg-orange-100 text-orange-700 text-[11px] font-semibold rounded-full uppercase tracking-wide">
                        {r.purpose}
                      </span>
                      <p className="text-sm text-neutral-500">{r.bankNama}</p>
                      <p className="text-xl font-bold text-neutral-900 tracking-wide">
                        {r.bankNomor}
                      </p>
                      <p className="text-sm text-neutral-700 mt-1">
                        a.n. {r.bankAtasNama}
                      </p>
                      {r.catatan && (
                        <p className="text-xs text-neutral-500 mt-2 italic">
                          {r.catatan}
                        </p>
                      )}
                    </div>
                    <CopyRekeningButton nomor={r.bankNomor} />
                  </div>

                  {r.qrisImageUrl && (
                    <div className="mt-3 pt-3 border-t border-neutral-100 flex items-start gap-3">
                      <QrisPreview
                        src={resolveAssetUrl(r.qrisImageUrl) ?? ''}
                        alt={`QRIS ${r.purpose} — ${cabang.nama}`}
                        downloadName={`qris-${cabang.kode}-${r.purpose}`.toLowerCase().replace(/\s+/g, '-')}
                      />
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-neutral-700 mb-1 flex items-center gap-1">
                          <QrCode className="w-3.5 h-3.5" /> QRIS
                        </p>
                        <p className="text-xs text-neutral-500 leading-relaxed">
                          Tap gambar untuk preview besar & download. Scan dengan
                          mobile banking atau e-wallet Anda (GoPay, OVO, Dana,
                          ShopeePay, dll).
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Panduan */}
        <div className="mt-10 bg-white border border-orange-100 rounded-2xl p-6">
          <h3 className="font-semibold text-neutral-900 mb-3 flex items-center gap-2">
            <Landmark className="w-4 h-4 text-orange-600" />
            Panduan Persembahan
          </h3>
          <ol className="text-sm text-neutral-700 space-y-2 list-decimal list-inside">
            <li>Pilih peruntukan (perpuluhan, ucapan syukur, dsb).</li>
            <li>Transfer ke rekening di atas atau scan QRIS jika tersedia.</li>
            <li>
              Simpan bukti transfer dan kirim ke bendahara / admin cabang{' '}
              {cabang.nama} via WhatsApp untuk konfirmasi.
            </li>
          </ol>
        </div>

        {/* Legal */}
        <div className="mt-6 text-xs text-neutral-500 space-y-1">
          <p>
            Persembahan bersifat sukarela. Untuk bukti resmi atau keperluan
            administrasi pajak, hubungi bendahara cabang {cabang.nama}.
          </p>
          <p>
            <a href="/privacy" className="text-orange-600 hover:underline">
              Kebijakan Privasi
            </a>
            {' · '}
            <a href="/terms" className="text-orange-600 hover:underline">
              Syarat &amp; Ketentuan
            </a>
          </p>
          <p className="pt-2">
            &copy; {new Date().getFullYear()} Elshaddai Creative Community
          </p>
        </div>
      </section>
    </div>
  );
}
