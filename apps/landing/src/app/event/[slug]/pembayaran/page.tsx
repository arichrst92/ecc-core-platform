import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Calendar, MapPin, Church, QrCode, Info, Landmark, HandCoins, Sparkles } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { CopyRekeningButton } from '../../../persembahan/copy-button';
import { cookies } from 'next/headers';
import { EventReturnBar, EventReturnFooter } from './back-to-app-button';
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
import { DEFAULT_TZ, tzLabel } from '@/lib/tz';

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
  cabang: { id: string; nama: string; timezone?: string | null } | null;
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
  // Info pembayaran: rekening dan/atau QRIS (salah satu cukup).
  const hasBank = !!event.bankNomor;
  const hasQris = !!event.qrisImageUrl;
  const hasPayInfo = hasBank || hasQris;

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

  // Langkah transfer mengikuti tipe event & info pembayaran yang tersedia.
  const payTarget = hasBank && hasQris
    ? L('ke rekening di atas, atau scan QRIS', 'to the account above, or scan the QRIS')
    : hasBank
      ? L('ke rekening di atas', 'to the account above')
      : L('dengan scan QRIS di atas', 'by scanning the QRIS above');
  const payStep = !hasPayInfo
    ? L('Hubungi panitia / admin cabang untuk info rekening atau QRIS, lalu lakukan transfer.', 'Contact the committee / branch admin for the account or QRIS details, then transfer.')
    : isBebas
      ? L(`Berikan sesuai kerelaan hati ${payTarget}.`, `Give as your heart leads ${payTarget}.`)
      : L(`Transfer sesuai nominal ${payTarget}.`, `Transfer the amount ${payTarget}.`);
  const steps: string[] = isFree
    ? [
        L('Kembali ke Els App untuk konfirmasi pendaftaran.', 'Return to Els App to confirm your registration.'),
        L('Tunjukkan QR code kehadiran Anda saat check-in.', 'Show your attendance QR code at check-in.'),
      ]
    : waSession
      ? [
          L('Pilih peserta (diri sendiri / keluarga)', 'Choose participants (yourself / family)') +
            (isBebas ? L(' dan isi nominal', ' and enter the amount') : '') +
            L(', lalu tekan Daftar.', ', then tap Register.'),
          payStep,
          L('Upload bukti transfer untuk tiap peserta di kartu Pendaftaran.', 'Upload the transfer receipt for each participant on the Registration card.'),
          L('Tekan "Kembali ke Els App" — status akan tampil di detail event.', 'Tap "Back to Els App" — the status will appear on the event details.'),
        ]
      : [
          payStep,
          L('Simpan bukti transfer (screenshot / foto struk).', 'Keep your transfer receipt (screenshot / photo of the slip).'),
          L('Kembali ke Els App untuk upload bukti transfer & konfirmasi pendaftaran.', 'Return to Els App to upload the receipt & confirm your registration.'),
        ];
  const cardCls = 'bg-white border border-orange-100 rounded-3xl shadow-[0_20px_40px_-30px_rgba(124,45,18,.55)]';
  const eyebrowCls = 'text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600 flex items-center gap-2';

  return (
    <div className="min-h-screen overflow-x-hidden page-fabric">
      <EventReturnBar />

      {/* Hero oranye — sama dengan halaman Persembahan */}
      <section className="relative overflow-hidden hero-fabric band-shadow text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_320px_at_85%_0%,rgba(255,255,255,.22),transparent_60%),radial-gradient(500px_300px_at_0%_100%,rgba(124,45,18,.35),transparent_60%)]"
        />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-7 pb-16 sm:pt-9 sm:pb-20">
          <div className="flex items-start gap-4">
            <EccLogo height={60} className="text-white shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-white/80">
                {L('Pendaftaran & Pembayaran Event', 'Event Registration & Payment')}
              </p>
              <h1 className="mt-1 text-2xl sm:text-3xl md:text-4xl font-extrabold leading-tight break-words">{event.judul}</h1>
              {event.ringkasan && <p className="mt-1 text-sm text-white/90 leading-relaxed break-words">{event.ringkasan}</p>}
            </div>
          </div>
          <div className="mt-4 space-y-1.5 text-xs sm:text-sm text-white/90">
            <p className="flex items-start gap-1.5">
              <Calendar className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                {formatIdrDate(event.tanggalMulai, lang)}
                {event.jamMulai || event.jamSelesai
                  ? ` · ${event.jamMulai ?? ''}${event.jamMulai && event.jamSelesai ? ' – ' : ''}${event.jamSelesai ?? ''}`
                  : ''}{' '}
                {tzLabel(event.cabang?.timezone)}
              </span>
            </p>
            {event.lokasi && (
              <p className="flex items-start gap-1.5 break-words">
                <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{event.lokasi}</span>
              </p>
            )}
            {event.cabang && (
              <p className="flex items-start gap-1.5">
                <Church className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{event.cabang.nama}</span>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Kartu menumpang di bawah pita oranye */}
      <section className="relative max-w-3xl mx-auto px-4 sm:px-6 -mt-10 sm:-mt-12 pb-8 space-y-4 sm:space-y-5">
        {/* Pembayaran — satu kartu: biaya + rekening / QRIS (gaya kartu rekening Persembahan) */}
        <article className={cardCls}>
          <div className="flex items-center gap-3 px-5 pt-5 pb-4">
            <span className="w-10 h-10 rounded-2xl bg-brand-grad text-white flex items-center justify-center shrink-0 shadow-[0_10px_20px_-10px_rgba(234,88,12,.8)]">
              <HandCoins className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-brand-700">{L('Biaya', 'Fee')}</p>
              {isFree && <p className="text-xl font-extrabold text-emerald-600">{L('Gratis', 'Free')}</p>}
              {isFixed && event.nominal !== null && (
                <p className="text-xl sm:text-2xl font-extrabold text-neutral-900 tabular-nums">Rp {formatRupiah(event.nominal)}</p>
              )}
              {isBebas && <p className="text-xl font-extrabold text-neutral-900">{L('Sukarela', 'Voluntary')}</p>}
            </div>
          </div>

          {!isFree && hasPayInfo && (
            <div className="px-5 pb-5">
              {hasBank && (
                <div className="rounded-2xl bg-brand-50/70 border border-orange-100 px-4 py-3.5">
                  {event.bankNama && (
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
                      <Landmark className="w-3.5 h-3.5" /> {event.bankNama}
                    </p>
                  )}
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="min-w-0 text-xl sm:text-2xl font-extrabold text-neutral-900 tracking-wide tabular-nums break-all">{event.bankNomor}</p>
                    <CopyRekeningButton nomor={event.bankNomor ?? ''} />
                  </div>
                  {event.bankAtasNama && (
                    <p className="mt-1 text-sm text-neutral-700 break-words">
                      <span className="text-neutral-500">{L('a.n.', 'Name:')}</span> {event.bankAtasNama}
                    </p>
                  )}
                </div>
              )}
              {hasQris && (
                <div className={`flex items-center gap-3 ${hasBank ? 'mt-4' : ''}`}>
                  <QrisPreview
                    src={resolveAssetUrl(event.qrisImageUrl) ?? ''}
                    alt={`QRIS ${event.judul}`}
                    downloadName={`qris-event-${event.slug ?? event.id}`.toLowerCase().replace(/\s+/g, '-')}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-neutral-800 flex items-center gap-1">
                      <QrCode className="w-3.5 h-3.5 text-brand-600" /> QRIS
                    </p>
                    <p className="text-xs text-neutral-500">{L('Tap untuk perbesar & simpan.', 'Tap to enlarge & save.')}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Rekening & QRIS belum diisi panitia */}
          {!isFree && !hasPayInfo && (
            <div className="mx-5 mb-5 rounded-2xl bg-brand-50/70 border border-orange-100 px-4 py-3.5 flex items-start gap-2.5 text-sm text-neutral-700">
              <Info className="w-4 h-4 mt-0.5 shrink-0 text-brand-600" />
              <p>
                {L(
                  `Rekening / QRIS belum tersedia. Hubungi panitia atau admin ${event.cabang?.nama ?? 'cabang'}.`,
                  `Bank account / QRIS not available yet. Contact the committee or ${event.cabang?.nama ?? 'branch'} admin.`,
                )}
              </p>
            </div>
          )}
        </article>

        {/* Mode ber-session: daftar + upload bukti langsung di web (alur tidak berubah) */}
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

        {/* Panduan — hanya tanpa sesi (dengan sesi, panel Pendaftaran sudah bernomor) */}
        {!waSession && (
        <div className={`${cardCls} p-5 sm:p-6`}>
          <h3 className={eyebrowCls}>
            <Sparkles className="w-4 h-4" />
            {L('Langkah Pendaftaran', 'Registration Steps')}
          </h3>
          <ol className="mt-4 space-y-3">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-neutral-700 leading-relaxed">
                <span className="w-6 h-6 rounded-full bg-brand-grad text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
        )}

        {/* Legal */}
        <div className="pt-2 text-xs text-neutral-500 space-y-1 text-center">
          <p>
            {isBebas
              ? L(
                  'Pemberian untuk event ini bersifat sukarela. Untuk konfirmasi & bukti resmi, hubungi panitia / admin cabang penyelenggara.',
                  'Giving for this event is voluntary. For confirmation & an official receipt, contact the organizing committee / branch admin.',
                )
              : L(
                  'Untuk konfirmasi & bukti resmi pembayaran, hubungi panitia / admin cabang penyelenggara.',
                  'For payment confirmation & an official receipt, contact the organizing committee / branch admin.',
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
      <EventReturnFooter withSession={!!waSession} />
    </div>
  );
}
