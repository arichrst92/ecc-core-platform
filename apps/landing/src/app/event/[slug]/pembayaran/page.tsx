import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Calendar, MapPin, Church, QrCode, Info, Landmark, ChevronLeft } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { CopyRekeningButton } from '../../../persembahan/copy-button';
import { cookies } from 'next/headers';
import { BackToAppButton } from './back-to-app-button';
import { WebActionPanel } from './web-action-panel';
import { QrisPreview } from '@/components/qris-preview';
import { WA_COOKIE, WA_ERR_COOKIE } from '@/lib/web-action-cookies';
import {
  waGet,
  type WaFamilyItem,
  type WaParticipation,
  type WaSessionInfo,
} from '@/lib/web-action-server';
import { getL } from '@/lib/i18n-server';
import { EccLogo } from '@/components/ecc-logo';

const API_BASE =
  process.env.NEXT_PUBLIC_CORE_API_URL ?? 'https://api.eccchurch.global';

function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `${API_BASE}${url}`;
  return url;
}

interface EventDetail {
  id: string;
  slug: string | null;
  judul: string;
  ringkasan: string | null;
  deskripsi: string | null;
  heroImageUrl: string | null;
  tanggalMulai: string;
  tanggalSelesai: string | null;
  jamMulai: string | null;
  jamSelesai: string | null;
  lokasi: string | null;
  tipeBayar: 'GRATIS' | 'NOMINAL_TETAP' | 'NOMINAL_BEBAS' | string;
  nominal: number | null;
  qrisImageUrl: string | null;
  bankNama: string | null;
  bankNomor: string | null;
  bankAtasNama: string | null;
  cabang: { id: string; nama: string } | null;
}

function formatIdrDate(iso: string, lang: 'id' | 'en' = 'id'): string {
  try {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatRupiah(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n);
}

export async function generateMetadata(
  { params }: { params: { slug: string } },
): Promise<Metadata> {
  const event = await apiGet<EventDetail>(`/public/event/${params.slug}`);
  const { L } = getL();
  if (!event) {
    return {
      title: L('Event tidak ditemukan', 'Event not found'),
      robots: { index: false, follow: false },
    };
  }
  return {
    title: `${L('Pembayaran', 'Payment')} · ${event.judul}`,
    description: L(
      `Info pembayaran & pendaftaran ${event.judul}. Rekening, QRIS, dan panduan transfer.`,
      `Payment & registration info for ${event.judul}. Bank account, QRIS, and transfer guide.`,
    ),
    robots: { index: false, follow: false },
  };
}

export default async function EventPembayaranPage(
  { params }: { params: { slug: string } },
) {
  const event = await apiGet<EventDetail>(`/public/event/${params.slug}`);
  if (!event) notFound();
  const { lang, L } = getL();

  const isFree = event.tipeBayar === 'GRATIS';
  const isFixed = event.tipeBayar === 'NOMINAL_TETAP';
  const isBebas = event.tipeBayar === 'NOMINAL_BEBAS';

  // Mode ber-session (web action token dari app) — lihat middleware.ts.
  const jar = cookies();
  const waSessionValue = jar.get(WA_COOKIE)?.value;
  const waExpired = jar.get(WA_ERR_COOKIE)?.value === '1';
  let waSession: WaSessionInfo | null = null;
  let waFamily: WaFamilyItem[] = [];
  let waParticipations: WaParticipation[] = [];
  if (waSessionValue && !isFree) {
    const s = await waGet<WaSessionInfo>('session', waSessionValue);
    if (s && s.eventId === event.id) {
      waSession = s;
      const [fam, mine] = await Promise.all([
        waGet<WaFamilyItem[]>('me/family', waSessionValue),
        waGet<{ participations: WaParticipation[] }>(
          `event/${event.id}/peserta/mine-and-family`,
          waSessionValue,
        ),
      ]);
      waFamily = fam ?? [];
      waParticipations = mine?.participations ?? [];
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50">
      {/* Header */}
      <section className="border-b border-orange-100 bg-white/60 backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <Link
            href={`/event/${event.slug ?? event.id}`}
            className="inline-flex items-center gap-1 text-xs text-orange-700 hover:text-orange-800 mb-4"
          >
            <ChevronLeft className="w-4 h-4" /> {L('Detail event', 'Event details')}
          </Link>

          <div className="flex items-center gap-3 mb-1">
            <EccLogo height={40} className="text-brand-600 shrink-0" />
            <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider">
              {L('Pendaftaran & Pembayaran Event', 'Event Registration & Payment')}
            </p>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 mt-2">
            {event.judul}
          </h1>
          {event.ringkasan && (
            <p className="text-sm text-neutral-600 mt-2">{event.ringkasan}</p>
          )}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Awareness banner — WAJIB kembali ke app setelah transfer */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-orange-500 rounded-r-xl p-4 flex items-start gap-3">
          <div className="shrink-0 w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold">
            !
          </div>
          <div className="flex-1 text-sm">
            <p className="font-semibold text-neutral-900 mb-1">
              {L('Setelah transfer, WAJIB kembali ke aplikasi!', 'After transferring, you MUST return to the app!')}
            </p>
            <p className="text-neutral-700 leading-relaxed">
              {L(
                'Upload bukti transfer & konfirmasi pendaftaran hanya bisa dilakukan di Els App. Gunakan tombol ',
                'Uploading the transfer receipt & confirming registration can only be done in Els App. Use the ',
              )}
              <strong>{L('"Kembali ke Els App"', '"Back to Els App"')}</strong>
              {L(' di bawah.', ' button below.')}
            </p>
          </div>
        </div>

        {/* Back-to-app CTA — pindah ke atas supaya lebih visible */}
        <BackToAppButton eventId={event.id} />

        {/* Event info card */}
        <div className="bg-white border border-orange-100 rounded-2xl overflow-hidden">
          {event.heroImageUrl && (
            <div className="relative aspect-[16/9] bg-neutral-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveAssetUrl(event.heroImageUrl) ?? ''}
                alt={event.judul}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="p-5 space-y-3 text-sm">
            <div className="flex items-start gap-2 text-neutral-700">
              <Calendar className="w-4 h-4 mt-0.5 shrink-0 text-orange-500" />
              <div>
                <p className="font-medium">{formatIdrDate(event.tanggalMulai, lang)}</p>
                {(event.jamMulai || event.jamSelesai) && (
                  <p className="text-xs text-neutral-500">
                    {event.jamMulai ?? ''}
                    {event.jamMulai && event.jamSelesai ? ' – ' : ''}
                    {event.jamSelesai ?? ''}
                  </p>
                )}
              </div>
            </div>
            {event.lokasi && (
              <div className="flex items-start gap-2 text-neutral-700">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-orange-500" />
                <p>{event.lokasi}</p>
              </div>
            )}
            {event.cabang && (
              <div className="flex items-start gap-2 text-neutral-700">
                <Church className="w-4 h-4 mt-0.5 shrink-0 text-orange-500" />
                <p>{event.cabang.nama}</p>
              </div>
            )}
          </div>
        </div>

        {/* Fee section */}
        <div className="bg-white border border-orange-100 rounded-2xl p-6">
          <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider mb-2">
            {L('Biaya', 'Fee')}
          </p>
          {isFree && (
            <p className="text-2xl font-bold text-emerald-600">{L('Gratis', 'Free')}</p>
          )}
          {isFixed && event.nominal !== null && (
            <p className="text-2xl font-bold text-neutral-900">
              Rp {formatRupiah(event.nominal)}
            </p>
          )}
          {isBebas && (
            <div>
              <p className="text-lg font-bold text-neutral-900">{L('Nominal Sukarela', 'Voluntary amount')}</p>
              <p className="text-xs text-neutral-500 mt-1">
                {L('Silakan berikan sesuai kerelaan hati Anda.', 'Please give as your heart leads.')}
              </p>
            </div>
          )}
        </div>

        {/* Payment info */}
        {!isFree && event.bankNomor && (
          <div className="bg-white border border-orange-100 rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-brand-grad text-white">
              <h2 className="font-bold text-base sm:text-lg flex items-center gap-2">
                <Landmark className="w-5 h-5" /> {L('Info Pembayaran', 'Payment Info')}
              </h2>
            </div>
            <div className="p-3 sm:p-6 space-y-4">
              <div className="min-w-0 border border-neutral-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-neutral-500">{event.bankNama}</p>
                    <p className="text-lg sm:text-xl font-bold text-neutral-900 tracking-wide break-all">
                      {event.bankNomor}
                    </p>
                    {event.bankAtasNama && (
                      <p className="text-sm text-neutral-700 mt-1">
                        {L('a.n.', 'Name:')} {event.bankAtasNama}
                      </p>
                    )}
                  </div>
                  <CopyRekeningButton nomor={event.bankNomor} />
                </div>

                {event.qrisImageUrl && (
                  <div className="mt-3 pt-3 border-t border-neutral-100 flex items-start gap-3">
                    <QrisPreview
                      src={resolveAssetUrl(event.qrisImageUrl) ?? ''}
                      alt={`QRIS ${event.judul}`}
                      size={112}
                      downloadName={`qris-event-${event.slug ?? event.id}`.toLowerCase().replace(/\s+/g, '-')}
                    />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-neutral-700 mb-1 flex items-center gap-1">
                        <QrCode className="w-3.5 h-3.5" /> QRIS
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
            </div>
          </div>
        )}

        {/* Mode ber-session: daftar + upload bukti langsung di web */}
        {waSession && (
          <WebActionPanel
            eventId={event.id}
            tipeBayar={event.tipeBayar}
            nominalEvent={event.nominal}
            session={waSession}
            family={waFamily}
            initialParticipations={waParticipations}
          />
        )}
        {!waSession && waExpired && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
            <strong>{L('Sesi kedaluwarsa.', 'Session expired.')}</strong>{' '}
            {L(
              'Buka ulang halaman ini dari Els App untuk mendaftar & upload bukti transfer.',
              'Reopen this page from Els App to register & upload your transfer receipt.',
            )}
          </div>
        )}

        {/* Panduan */}
        <div className="bg-white border border-orange-100 rounded-2xl p-6">
          <h3 className="font-semibold text-neutral-900 mb-3">{L('Langkah Pendaftaran', 'Registration Steps')}</h3>
          <ol className="text-sm text-neutral-700 space-y-2 list-decimal list-inside">
            {isFree ? (
              <>
                <li>{L('Kembali ke Els App untuk konfirmasi pendaftaran.', 'Return to Els App to confirm your registration.')}</li>
                <li>{L('Tunjukkan QR code kehadiran Anda saat check-in.', 'Show your attendance QR code at check-in.')}</li>
              </>
            ) : waSession ? (
              <>
                <li>
                  {L('Pilih peserta (diri sendiri / keluarga)', 'Choose participants (yourself / family)')}
                  {isBebas ? L(' dan isi nominal', ' and enter the amount') : ''}
                  {L(', lalu tekan Daftar.', ', then tap Register.')}
                </li>
                <li>{L('Transfer ke rekening yang tercantum, atau scan QRIS.', 'Transfer to the listed account, or scan the QRIS.')}</li>
                <li>{L('Upload bukti transfer untuk tiap peserta di kartu Pendaftaran.', 'Upload the transfer receipt for each participant on the Registration card.')}</li>
                <li>{L('Tekan "Kembali ke Els App" — status akan tampil di detail event.', 'Tap "Back to Els App" — the status will appear on the event details.')}</li>
              </>
            ) : (
              <>
                <li>{L('Lakukan transfer sesuai nominal di atas ke rekening yang tercantum, atau scan QRIS.', 'Transfer the amount above to the listed account, or scan the QRIS.')}</li>
                <li>{L('Simpan bukti transfer (screenshot / foto struk).', 'Keep your transfer receipt (screenshot / photo of the slip).')}</li>
                <li>{L('Kembali ke Els App untuk upload bukti transfer & konfirmasi pendaftaran.', 'Return to Els App to upload the receipt & confirm your registration.')}</li>
              </>
            )}
          </ol>
        </div>

        {/* Legal */}
        <div className="text-xs text-neutral-500 space-y-1">
          <p>
            {L(
              'Pembayaran event bersifat sukarela. Untuk konfirmasi & bukti resmi, hubungi panitia / admin cabang penyelenggara.',
              'Event payments are voluntary. For confirmation & an official receipt, contact the organizing committee / branch admin.',
            )}
          </p>
          <p>
            <a href="/privacy" className="text-orange-600 hover:underline">
              {L('Kebijakan Privasi', 'Privacy Policy')}
            </a>
            {' · '}
            <a href="/terms" className="text-orange-600 hover:underline">
              {L('Syarat & Ketentuan', 'Terms & Conditions')}
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
