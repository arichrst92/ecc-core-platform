'use client';

/**
 * Panel daftar + upload bukti di web (mode ber-session).
 * Aktif hanya kalau app membuka halaman dengan ?wt= dan exchange sukses.
 * Semua call lewat proxy /api/web-action/* (session di cookie httpOnly).
 */
import { useState } from 'react';
import { CheckCircle2, Loader2, Upload, UserCheck, AlertTriangle } from 'lucide-react';
import type { WaFamilyItem, WaParticipation, WaSessionInfo } from '@/lib/web-action-server';

const MIN_BEBAS = 1000;

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  DAFTAR: { label: 'Menunggu bukti transfer', cls: 'bg-amber-100 text-amber-800' },
  MENUNGGU_VERIFIKASI: { label: 'Menunggu verifikasi', cls: 'bg-blue-100 text-blue-800' },
  BAYAR: { label: 'Lunas', cls: 'bg-emerald-100 text-emerald-800' },
  HADIR: { label: 'Hadir', cls: 'bg-emerald-100 text-emerald-800' },
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
  const isBebas = tipeBayar === 'NOMINAL_BEBAS';
  const minNominal = Math.max(MIN_BEBAS, nominalEvent ?? 0);

  const [participations, setParticipations] = useState(initialParticipations);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nominal, setNominal] = useState<string>(String(minNominal));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [expired, setExpired] = useState(false);

  const candidates = [
    { id: session.jemaat.id, namaLengkap: session.jemaat.namaLengkap, label: 'Diri sendiri' },
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
      setMessage({ type: 'err', text: `Nominal minimal Rp ${rupiah(minNominal)} per orang.` });
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
      setMessage({ type: 'err', text: r.json?.error?.message ?? 'Pendaftaran gagal.' });
      return;
    }
    const failed = (r.json.data?.failed ?? []) as { error: { message: string } }[];
    setSelected(new Set());
    await refresh();
    setMessage(
      failed.length
        ? { type: 'err', text: `Sebagian gagal: ${failed.map((f) => f.error.message).join('; ')}` }
        : { type: 'ok', text: 'Pendaftaran berhasil. Silakan transfer lalu upload bukti di bawah.' },
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
      setMessage({ type: 'err', text: r.json?.error?.message ?? 'Upload bukti gagal.' });
      return;
    }
    await refresh();
    setMessage({ type: 'ok', text: 'Bukti transfer terkirim. Menunggu verifikasi admin.' });
  }

  if (expired) {
    return (
      <div className="bg-white border-2 border-red-200 rounded-2xl p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="font-semibold text-neutral-900">Sesi kedaluwarsa</p>
        <p className="text-sm text-neutral-600 mt-1">Buka ulang halaman ini dari Els App.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-orange-200 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <UserCheck className="w-5 h-5" /> Pendaftaran
        </h2>
        <p className="text-xs text-white/90 mt-0.5">Masuk sebagai {session.jemaat.namaLengkap}</p>
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
          <h3 className="text-sm font-semibold text-neutral-900 mb-2">1. Pilih peserta</h3>
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
                  {done && <span className="text-[11px] text-emerald-700">Sudah terdaftar</span>}
                </label>
              );
            })}
          </div>

          {isBebas && (
            <label className="block mt-4">
              <span className="text-xs font-medium text-neutral-600">
                Nominal per orang (min Rp {rupiah(minNominal)})
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
            className="mt-4 w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Daftar {selected.size > 0 ? `${selected.size} orang` : ''}
          </button>
        </section>

        {/* 2. Upload bukti */}
        {participations.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-neutral-900 mb-2">2. Upload bukti transfer</h3>
            <div className="space-y-2">
              {participations.map((p) => {
                const st = STATUS_LABEL[p.status] ?? { label: p.status, cls: 'bg-neutral-100 text-neutral-700' };
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
                        {p.buktiTransferUrl ? 'Ganti bukti transfer' : 'Upload bukti transfer'}
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
              Pembatalan pendaftaran dilakukan dari Els App.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
