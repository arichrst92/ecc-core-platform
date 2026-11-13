import type { Metadata } from 'next';
import { AppReturnBar, AppReturnFooter } from '@/components/app-return-bar';
import { notFound } from 'next/navigation';
import { HandCoins, Landmark, QrCode, Info, MapPin, Sparkles } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { getL } from '@/lib/i18n-server';
import { CopyRekeningButton } from '../copy-button';
import { QrisPreview } from '@/components/qris-preview';
import { EccLogo } from '@/components/ecc-logo';

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
  const { L } = getL();
  if (!cabang) {
    return {
      title: L('Cabang tidak ditemukan', 'Branch not found'),
      robots: { index: false, follow: false },
    };
  }
  return {
    title: `${L('Persembahan', 'Giving')} · ${cabang.nama}`,
    description: L(
      `Info rekening persembahan untuk cabang ${cabang.nama} (perpuluhan, ucapan syukur, diakonia, pembangunan, misi).`,
      `Giving account info for the ${cabang.nama} branch (tithes, thanksgiving, diakonia, building, missions).`,
    ),
    robots: { index: true, follow: true },
  };
}

export default async function PersembahanCabangPage(
  { params }: { params: { kode: string } },
) {
  const cabang = await findCabangByKode(params.kode);
  if (!cabang) notFound();
  const { L } = getL();

  const resp = await apiGet<RekeningResponse>(`/public/cabang/${cabang.id}/rekening`);
  const rekening = resp?.rekening ?? [];

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#FFFBF7]">
      <AppReturnBar />

      {/* Hero oranye gradient — judul cabang (persona ECC) */}
      <section className="relative overflow-hidden bg-brand-grad text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_320px_at_85%_0%,rgba(255,255,255,.22),transparent_60%),radial-gradient(500px_300px_at_0%_100%,rgba(124,45,18,.35),transparent_60%)]"
        />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-7 pb-16 sm:pt-9 sm:pb-20">
          <div className="flex items-start gap-4">
            <EccLogo height={60} className="text-white shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-white/80">
                {L('Persembahan', 'Giving')} · {cabang.kode}
              </p>
              <h1 className="mt-1 text-2xl sm:text-3xl md:text-4xl font-extrabold leading-tight break-words">
                {cabang.nama}
              </h1>
              {cabang.alamat && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs sm:text-sm text-white/85 leading-relaxed break-words">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{cabang.alamat}</span>
                </p>
              )}
            </div>
          </div>
          <p className="mt-5 text-sm sm:text-base text-white/90 leading-relaxed max-w-2xl">
            {L(
              'Terima kasih atas kesetiaan Anda dalam memberi. Berikut info rekening resmi cabang ini.',
              'Thank you for your faithfulness in giving. Here is the official account info for this branch.',
            )}
          </p>
        </div>
      </section>

      {/* Daftar rekening — kartu menumpang di bawah pita oranye */}
      <section className="relative max-w-3xl mx-auto px-4 sm:px-6 -mt-10 sm:-mt-12 pb-8">
        {rekening.length === 0 ? (
          <div className="text-center py-14 px-6 bg-white border border-orange-100 rounded-3xl shadow-[0_24px_48px_-32px_rgba(124,45,18,.55)]">
            <Info className="w-10 h-10 text-brand-400 mx-auto mb-3" />
            <p className="text-sm text-neutral-600">
              {L(
                `Info rekening cabang ini sedang dalam pembaruan. Silakan hubungi admin cabang ${cabang.nama}.`,
                `This branch's account info is being updated. Please contact the ${cabang.nama} branch admin.`,
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {rekening.map((r) => (
              <article
                key={r.id}
                className="min-w-0 flex flex-col bg-white rounded-3xl border border-orange-100 shadow-[0_20px_40px_-30px_rgba(124,45,18,.55)] hover:border-brand-300 transition overflow-hidden"
              >
                <div className="flex items-center gap-3 px-5 pt-5">
                  <span className="w-10 h-10 rounded-2xl bg-brand-grad text-white flex items-center justify-center shrink-0 shadow-[0_10px_20px_-10px_rgba(234,88,12,.8)]">
                    <HandCoins className="w-5 h-5" />
                  </span>
                  <h2 className="min-w-0 flex-1 text-[13px] font-extrabold uppercase tracking-[0.12em] text-brand-700 break-words">
                    {r.purpose}
                  </h2>
                </div>

                <div className="px-5 pt-4 pb-5 flex-1">
                  <div className="rounded-2xl bg-brand-50/70 border border-orange-100 px-4 py-3.5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
                      <Landmark className="w-3.5 h-3.5" /> {r.bankNama}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="min-w-0 text-xl sm:text-2xl font-extrabold text-neutral-900 tracking-wide tabular-nums break-all">
                        {r.bankNomor}
                      </p>
                      <CopyRekeningButton nomor={r.bankNomor} />
                    </div>
                    <p className="mt-1 text-sm text-neutral-700 break-words">
                      <span className="text-neutral-500">{L('a.n.', 'Name:')}</span> {r.bankAtasNama}
                    </p>
                  </div>
                  {r.catatan && <p className="mt-3 text-xs text-neutral-500 italic">{r.catatan}</p>}

                  {r.qrisImageUrl && (
                    <div className="mt-4 flex items-start gap-3">
                      <QrisPreview
                        src={resolveAssetUrl(r.qrisImageUrl) ?? ''}
                        alt={`QRIS ${r.purpose} — ${cabang.nama}`}
                        downloadName={`qris-${cabang.kode}-${r.purpose}`.toLowerCase().replace(/\s+/g, '-')}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-neutral-800 mb-1 flex items-center gap-1">
                          <QrCode className="w-3.5 h-3.5 text-brand-600" /> QRIS
                        </p>
                        <p className="text-xs text-neutral-500 leading-relaxed">
                          {L(
                            'Tap gambar untuk preview besar & download. Scan dengan mobile banking atau e-wallet Anda (GoPay, OVO, Dana, ShopeePay, dll).',
                            'Tap the image to enlarge & download. Scan with your mobile banking or e-wallet app (GoPay, OVO, Dana, ShopeePay, etc.).',
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Panduan */}
        <div className="mt-6 sm:mt-8 bg-white border border-orange-100 rounded-3xl p-5 sm:p-6 shadow-[0_20px_40px_-30px_rgba(124,45,18,.45)]">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            {L('Panduan Persembahan', 'Giving Guide')}
          </h3>
          <ol className="mt-4 space-y-3">
            {[
              L('Pilih peruntukan (perpuluhan, ucapan syukur, dsb).', 'Choose the purpose (tithe, thanksgiving, etc.).'),
              L('Transfer ke rekening di atas atau scan QRIS jika tersedia.', 'Transfer to the account above or scan the QRIS if available.'),
              L(
                `Simpan bukti transfer dan kirim ke bendahara / admin cabang ${cabang.nama} via WhatsApp untuk konfirmasi.`,
                `Keep the transfer receipt and send it to the ${cabang.nama} treasurer / branch admin via WhatsApp for confirmation.`,
              ),
            ].map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-neutral-700 leading-relaxed">
                <span className="w-6 h-6 rounded-full bg-brand-grad text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Legal */}
        <div className="mt-6 text-xs text-neutral-500 space-y-1 text-center">
          <p>
            {L(
              `Persembahan bersifat sukarela. Untuk bukti resmi atau keperluan administrasi pajak, hubungi bendahara cabang ${cabang.nama}.`,
              `Giving is voluntary. For an official receipt or tax purposes, contact the ${cabang.nama} branch treasurer.`,
            )}
          </p>
          <p>
            <a href="/privacy" className="text-brand-600 hover:underline">
              {L('Kebijakan Privasi', 'Privacy Policy')}
            </a>
            {' · '}
            <a href="/terms" className="text-brand-600 hover:underline">
              {L('Syarat & Ketentuan', 'Terms & Conditions')}
            </a>
          </p>
          <p className="pt-2">&copy; {new Date().getFullYear()} El Shaddai Creative Community</p>
        </div>
      </section>
      <AppReturnFooter />
    </div>
  );
}
