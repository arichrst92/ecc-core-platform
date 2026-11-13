'use client';

/**
 * Panel daftar + upload bukti di web (mode ber-session).
 * Aktif hanya kalau app membuka halaman dengan ?wt= dan exchange sukses.
 * Semua call lewat proxy /api/web-action/* (session di cookie httpOnly).
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, HandHeart, Loader2, Upload, UserCheck, AlertTriangle } from 'lucide-react';
import { useLang } from '@/components/lang-provider';
import type { WaDonation, WaFamilyItem, WaParticipation, WaSessionInfo } from '@/lib/web-action-server';

const MIN_BEBAS = 1000;

const STATUS_LABEL: Record<string, { label: string; en: string; cls: string }> = {
  DAFTAR: { label: 'Menunggu bukti transfer', en: 'Awaiting receipt', cls: 'bg-amber-100 text-amber-800' },
  MENUNGGU_VERIFIKASI: { label: 'Menunggu verifikasi', en: 'Awaiting verification', cls: 'bg-blue-100 text-blue-800' },
  BAYAR: { label: 'Lunas', en: 'Paid', cls: 'bg-emerald-100 text-emerald-800' },
  BATAL: { label: 'Dibatalkan', en: 'Cancelled', cls: 'bg-neutral-100 text-neutral-600' },
  HADIR: { label: 'Hadir', en: 'Attended', cls: 'bg-emerald-100 text-emerald-800' },
};

function rupiah(n: number) {
  return new Intl.NumberFormat('id-ID').format(n);
}

interface Props {
  eventId: string;
  tipeBayar: string;
  nominalEvent: number | null;
  session: WaSessionInfo;
  family: WaFamilyItem[];
  initialParticipations: WaParticipation[];
}

export function WebActionPanel({
  eventId,
  tipeBayar,
  nominalEvent,
  session,
  family,
  initialParticipations,
}: Props) {
  const { lang, L } = useLang();
  const statusOf = (status: string) => {
    const st = STATUS_LABEL[status];
    if (!st) return { label: status, cls: 'bg-neutral-100 text-neutral-700' };
    return { label: lang === 'en' ? st.en : st.label, cls: st.cls };
  };
  const isBebas = tipeBayar === 'NOMINAL_BEBAS';
  const minNominal = Math.max(MIN_BEBAS, nominalEvent ?? 0);

  const [participations, setParticipations] = useState(initialParticipations);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nominal, setNominal] = useState<string>(String(minNominal));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [expired, setExpired] = useState(false);
  // Donasi tambahan (sukarela — boleh berkali-kali setelah terdaftar).
  const [donations, setDonations] = useState<WaDonation[]>([]);
  const [donasiNominal, setDonasiNominal] = useState('');
  const [donasiFor, setDonasiFor] = useState('');
  const [donasiFile, setDonasiFile] = useState<File | null>(null);
  const [donasiBusy, setDonasiBusy] = useState(false);

  const candidates = [
    { id: session.jemaat.id, namaLengkap: session.jemaat.namaLengkap, label: L('Diri sendiri', 'Myself') },
    ...family.map((f) => ({ id: f.jemaat.id, namaLengkap: f.jemaat.namaLengkap, label: f.tipeRelasi.nama })),
  ].filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);

  const registeredIds = new Set(participations.map((p) => p.jemaatId));

  async function call(path: string, init?: RequestInit) {
    const r = await fetch(`/api/web-action/${path}`, init);
    const json = await r.json().catch(() => ({}));
    if (r.status === 401) setExpired(true);
    return { ok: r.ok, status: r.status, json };
  }

  async function refresh() {
    const r = await call(`event/${eventId}/peserta/mine-and-family`);
    if (r.ok) setParticipations(r.json.data.participations);
  }

  async function refreshDonations() {
    const r = await call(`event/${eventId}/donations`);
    if (r.ok) setDonations(r.json.data ?? []);
  }

  useEffect(() => {
    if (isBebas) void refreshDonations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBebas, eventId]);

  async function donate() {
    setMessage(null);
    const amount = Number(donasiNominal);
    if (!Number.isFinite(amount) || amount < MIN_BEBAS) {
      setMessage({ type: 'err', text: L(`Nominal donasi minimal Rp ${rupiah(MIN_BEBAS)}.`, `Minimum donation is Rp ${rupiah(MIN_BEBAS)}.`) });
      return;
    }
    if (!donasiFile) {
      setMessage({ type: 'err', text: L('Pilih foto bukti transfer donasi.', 'Choose a photo of the donation transfer receipt.') });
      return;
    }
    setDonasiBusy(true);
    const fd = new FormData();
    fd.append('nominal', String(Math.round(amount)));
    if (donasiFor) fd.append('participationId', donasiFor);
    fd.append('bukti', donasiFile);
    const r = await call(`event/${eventId}/donations`, { method: 'POST', body: fd });
    setDonasiBusy(false);
    if (!r.ok) {
      setMessage({ type: 'err', text: r.json?.error?.message ?? L('Donasi gagal dikirim.', 'Failed to send donation.') });
      return;
    }
    setDonasiNominal('');
    setDonasiFile(null);
    await refreshDonations();
    setMessage({ type: 'ok', text: L('Terima kasih! Donasi Anda terkirim dan menunggu verifikasi admin.', 'Thank you! Your donation was sent and is awaiting admin verification.') });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function register() {
    setMessage(null);
    const amount = Number(nominal);
    if (isBebas && (!Number.isFinite(amount) || amount < minNominal)) {
      setMessage({ type: 'err', text: L(`Nominal minimal Rp ${rupiah(minNominal)} per orang.`, `Minimum amount is Rp ${rupiah(minNominal)} per person.`) });
      return;
    }
    setBusy(true);
    const body: Record<string, unknown> = { jemaatIds: [...selected] };
    if (isBebas) body.nominalBayarPerOrang = amount;
    const r = await call(`event/${eventId}/peserta/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!r.ok) {
      setMessage({ type: 'err', text: r.json?.error?.message ?? L('Pendaftaran gagal.', 'Registration failed.') });
      return;
    }
    const failed = (r.json.data?.failed ?? []) as { error: { message: string } }[];
    setSelected(new Set());
    await refresh();
    setMessage(
      failed.length
        ? { type: 'err', text: `${L('Sebagian gagal', 'Some failed')}: ${failed.map((f) => f.error.message).join('; ')}` }
        : { type: 'ok', text: L('Pendaftaran berhasil. Silakan transfer lalu upload bukti di bawah.', 'Registration successful. Please transfer, then upload the receipt below.') },
    );
  }

  async function upload(participationId: string, file: File) {
    setMessage(null);
    setUploading(participationId);
    const fd = new FormData();
    fd.append('bukti', file);
    const r = await call(`event/${eventId}/peserta/${participationId}/bukti`, { method: 'POST', body: fd });
    setUploading(null);
    if (!r.ok) {
      setMessage({ type: 'err', text: r.json?.error?.message ?? L('Upload bukti gagal.', 'Failed to upload receipt.') });
      return;
    }
    await refresh();
    setMessage({ type: 'ok', text: L('Bukti transfer terkirim. Menunggu verifikasi admin.', 'Receipt sent. Awaiting admin verification.') });
  }

  if (expired) {
    return (
      <div className="bg-white border-2 border-red-200 rounded-2xl p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="font-semibold text-neutral-900">{L('Sesi kedaluwarsa', 'Session expired')}</p>
        <p className="text-sm text-neutral-600 mt-1">{L('Buka ulang halaman ini dari Els App.', 'Reopen this page from Els App.')}</p>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-orange-200 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 bg-brand-grad text-white">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <UserCheck className="w-5 h-5" /> {L('Pendaftaran', 'Registration')}
        </h2>
        <p className="text-xs text-white/90 mt-0.5">{L('Masuk sebagai', 'Signed in as')} {session.jemaat.namaLengkap}</p>
      </div>

      <div className="p-6 space-y-6">
        {message && (
          <div
            className={`text-sm rounded-lg p-3 ${
              message.type === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* 1. Pilih peserta */}
        <section>
          <h3 className="text-sm font-semibold text-neutral-900 mb-2">1. {L('Pilih peserta', 'Choose participants')}</h3>
          <div className="space-y-2">
            {candidates.map((c) => {
              const done = registeredIds.has(c.id);
              return (
                <label
                  key={c.id}
                  className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 ${
                    done ? 'bg-neutral-50 border-neutral-200' : 'border-neutral-200 cursor-pointer hover:border-orange-300'
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  ) : (
                    <input
                      type="checkbox"
                      className="w-5 h-5 accent-orange-500 shrink-0"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">{c.namaLengkap}</p>
                    <p className="text-xs text-neutral-500">{c.label}</p>
                  </div>
                  {done && <span className="text-[11px] text-emerald-700">{L('Sudah terdaftar', 'Registered')}</span>}
                </label>
              );
            })}
          </div>

          {isBebas && (
            <label className="block mt-4">
              <span className="text-xs font-medium text-neutral-600">
                {L('Nominal per orang', 'Amount per person')} (min Rp {rupiah(minNominal)})
              </span>
              <div className="mt-1 flex items-center border border-neutral-300 rounded-lg overflow-hidden">
                <span className="px-3 text-sm text-neutral-500 bg-neutral-50 py-2">Rp</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={minNominal}
                  step={1000}
                  value={nominal}
                  onChange={(e) => setNominal(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm outline-none"
                />
              </div>
            </label>
          )}

          <button
            type="button"
            disabled={selected.size === 0 || busy}
            onClick={register}
            className="mt-4 w-full py-3 rounded-xl bg-brand-grad text-white font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {L('Daftar', 'Register')}{' '}
            {selected.size > 0 ? `${selected.size} ${L('orang', selected.size === 1 ? 'person' : 'people')}` : ''}
          </button>
        </section>

        {/* 2. Upload bukti */}
        {participations.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-neutral-900 mb-2">2. {L('Upload bukti transfer', 'Upload transfer receipt')}</h3>
            <div className="space-y-2">
              {participations.map((p) => {
                const st = statusOf(p.status);
                const canUpload = p.status === 'DAFTAR' || p.status === 'MENUNGGU_VERIFIKASI';
                return (
                  <div key={p.id} className="border border-neutral-200 rounded-xl px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-neutral-900 truncate">{p.jemaat.namaLengkap}</p>
                        <p className="text-xs text-neutral-500">
                          {p.relationLabel}
                          {p.nominalBayar != null ? ` · Rp ${rupiah(Number(p.nominalBayar))}` : ''}
                        </p>
                      </div>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${st.cls}`}>
                        {st.label}
                      </span>
                    </div>
                    {canUpload && (
                      <label className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-orange-600 cursor-pointer">
                        {uploading === p.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        {p.buktiTransferUrl ? L('Ganti bukti transfer', 'Replace receipt') : L('Upload bukti transfer', 'Upload receipt')}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploading !== null}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void upload(p.id, f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-neutral-500 mt-2">
              {L('Pembatalan pendaftaran dilakukan dari Els App.', 'Registrations can be cancelled from Els App.')}
            </p>
          </section>
        )}

        {/* 3. Donasi lagi — event sukarela, boleh berkali-kali */}
        {isBebas && participations.length > 0 && (
          <section className="border-t border-neutral-100 pt-5">
            <h3 className="text-sm font-semibold text-neutral-900 mb-1 flex items-center gap-1.5">
              <HandHeart className="w-4 h-4 text-orange-500" /> 3. {L('Donasi lagi', 'Give again')}
            </h3>
            <p className="text-xs text-neutral-500 mb-3">
              {L(
                'Ingin memberi lagi untuk event ini? Transfer ke rekening di atas, lalu kirim bukti di sini. Bisa berkali-kali.',
                'Want to give again for this event? Transfer to the account above, then send the receipt here. You can do this multiple times.',
              )}
            </p>
            {participations.length > 1 && (
              <label className="block mb-3">
                <span className="text-xs font-medium text-neutral-600">{L('Atas nama', 'On behalf of')}</span>
                <select
                  value={donasiFor}
                  onChange={(e) => setDonasiFor(e.target.value)}
                  className="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white outline-none"
                >
                  <option value="">{session.jemaat.namaLengkap} ({L('saya', 'me')})</option>
                  {participations
                    .filter((p) => !p.isSelf)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.jemaat.namaLengkap} ({p.relationLabel})
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label className="block">
              <span className="text-xs font-medium text-neutral-600">{L('Nominal donasi', 'Donation amount')} (min Rp {rupiah(MIN_BEBAS)})</span>
              <div className="mt-1 flex items-center border border-neutral-300 rounded-lg overflow-hidden">
                <span className="px-3 text-sm text-neutral-500 bg-neutral-50 py-2">Rp</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={MIN_BEBAS}
                  step={1000}
                  value={donasiNominal}
                  placeholder="100000"
                  onChange={(e) => setDonasiNominal(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm outline-none"
                />
              </div>
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm border border-dashed border-neutral-300 rounded-lg px-3 py-2.5 cursor-pointer hover:border-orange-300">
              <Upload className="w-4 h-4 text-orange-500 shrink-0" />
              <span className={`truncate ${donasiFile ? 'text-neutral-900' : 'text-neutral-500'}`}>
                {donasiFile ? donasiFile.name : L('Pilih foto bukti transfer', 'Choose receipt photo')}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  setDonasiFile(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
            </label>
            <button
              type="button"
              disabled={donasiBusy || !donasiNominal || !donasiFile}
              onClick={donate}
              className="mt-3 w-full py-3 rounded-xl bg-brand-grad text-white font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              {donasiBusy && <Loader2 className="w-4 h-4 animate-spin" />}
              {L('Kirim donasi', 'Send donation')}
            </button>

            {donations.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold text-neutral-700">{L('Riwayat donasi tambahan', 'Additional donation history')}</p>
                {donations.map((d) => {
                  const st = statusOf(d.status);
                  return (
                    <div key={d.id} className="flex items-center justify-between gap-2 border border-neutral-200 rounded-xl px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-neutral-900">Rp {rupiah(Number(d.nominalBayar))}</p>
                        <p className="text-[11px] text-neutral-500 truncate">
                          {d.jemaat.namaLengkap} ·{' '}
                          {new Date(d.createdAt).toLocaleDateString(lang === 'en' ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${st.cls}`}>{st.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
