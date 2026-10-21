'use client';

/**
 * Tambah Tamu dari portal. Langkah 1: pilih Tamu Ibadah atau Tamu Event.
 * - Dewasa: nama + no HP (wajib). No HP milik jemaat → jemaat itu yang dicatat.
 * - Anak: nama (+ tanggal lahir opsional), tanpa no HP. Ibadah CKids hanya untuk anak.
 * Ibadah: reservasi / hadir sekarang. Event: daftarkan / hadir sekarang (+ pembayaran).
 * API: GET /admin/tamu/ibadah-options, GET /admin/tamu/event-options, POST /admin/tamu
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Baby, CalendarDays, CheckCircle2, Church, Loader2, User, UserPlus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { todayYmd } from '@/lib/dates';

type Tujuan = 'IBADAH' | 'EVENT';
type Jenis = 'DEWASA' | 'ANAK';
type Bayar = 'BELUM' | 'TUNAI' | 'TRANSFER' | 'QRIS' | 'GRATIS';

interface IbadahOpt {
  id: string;
  nama: string;
  jamMulai: string;
  isKidsIbadah: boolean;
  cabang: { id: string; nama: string } | null;
}

interface EventOpt {
  id: string;
  judul: string;
  tanggalMulai: string;
  tanggalSelesai: string | null;
  jamMulai: string | null;
  tipeBayar: 'GRATIS' | 'NOMINAL_TETAP' | 'NOMINAL_BEBAS';
  nominal: number | null;
  butuhKehadiran: boolean;
  quotaPeserta: number | null;
  peserta: number;
  isPublished: boolean;
  cabang: { id: string; nama: string } | null;
}

interface Result {
  tujuan: Tujuan;
  tamu: { id: string; namaLengkap: string; kode: string | null };
  status: 'RESERVASI' | 'HADIR' | 'DAFTAR' | 'BAYAR';
  pickupCode: string | null;
  isMember: boolean;
  isReturning: boolean;
  acaraNama: string;
}

const STATUS_TEXT: Record<Result['status'], string> = {
  RESERVASI: 'Reservasi',
  HADIR: 'Hadir',
  DAFTAR: 'Terdaftar',
  BAYAR: 'Terdaftar · Lunas',
};
const BAYAR_LABEL: Record<Bayar, string> = { BELUM: 'Belum bayar', TUNAI: 'Tunai', TRANSFER: 'Transfer', QRIS: 'QRIS', GRATIS: 'Gratis' };
const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
const tglPendek = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export function AddGuestModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [tujuan, setTujuan] = useState<Tujuan | null>(null);
  const [jenis, setJenis] = useState<Jenis>('DEWASA');
  const [nama, setNama] = useState('');
  const [noHp, setNoHp] = useState('');
  const [tanggalLahir, setTanggalLahir] = useState('');
  // Ibadah
  const [ibadahId, setIbadahId] = useState('');
  const [tanggal, setTanggal] = useState(todayYmd());
  const [aksiIbadah, setAksiIbadah] = useState<'RESERVE' | 'CHECKIN'>('RESERVE');
  // Event
  const [eventId, setEventId] = useState('');
  const [aksiEvent, setAksiEvent] = useState<'DAFTAR' | 'CHECKIN'>('DAFTAR');
  const [bayar, setBayar] = useState<Bayar>('BELUM');
  const [nominal, setNominal] = useState('');
  const [quotaFull, setQuotaFull] = useState(false);

  const [result, setResult] = useState<{ data: Result; message: string } | null>(null);

  const ibadahQ = useQuery({
    queryKey: ['tamu', 'ibadah-options'],
    enabled: tujuan === 'IBADAH',
    queryFn: async () => (await apiClient.get<{ data: IbadahOpt[] }>('/admin/tamu/ibadah-options')).data.data,
  });
  const eventQ = useQuery({
    queryKey: ['tamu', 'event-options'],
    enabled: tujuan === 'EVENT',
    queryFn: async () => (await apiClient.get<{ data: EventOpt[] }>('/admin/tamu/event-options')).data.data,
  });

  const groupedIbadah = useMemo(() => groupBy(ibadahQ.data ?? [], (i) => i.cabang?.nama ?? 'Tanpa cabang'), [ibadahQ.data]);
  const groupedEvent = useMemo(() => groupBy(eventQ.data ?? [], (e) => e.cabang?.nama ?? 'Sinode (semua cabang)'), [eventQ.data]);

  const ibadah = (ibadahQ.data ?? []).find((i) => i.id === ibadahId) ?? null;
  const event = (eventQ.data ?? []).find((e) => e.id === eventId) ?? null;
  const kidsMismatch = tujuan === 'IBADAH' && !!ibadah?.isKidsIbadah && jenis !== 'ANAK';
  const isToday = tanggal === todayYmd();
  const paid = !!event && event.tipeBayar !== 'GRATIS';
  const eventCheckin = aksiEvent === 'CHECKIN' && !!event?.butuhKehadiran;
  const bayarOptions: Bayar[] = eventCheckin ? ['TUNAI', 'TRANSFER', 'QRIS', 'GRATIS'] : ['BELUM', 'TUNAI', 'TRANSFER', 'QRIS', 'GRATIS'];
  const effBayar: Bayar = bayarOptions.includes(bayar) ? bayar : bayarOptions[0]!;

  const mut = useMutation({
    mutationFn: async (force: boolean) => {
      const base = {
        tujuan,
        jenis,
        nama: nama.trim(),
        noHp: jenis === 'DEWASA' ? noHp.trim() : null,
        tanggalLahir: jenis === 'ANAK' && tanggalLahir ? tanggalLahir : null,
      };
      const body =
        tujuan === 'IBADAH'
          ? { ...base, ibadahId, tanggalIbadah: tanggal, aksi: isToday ? aksiIbadah : 'RESERVE' }
          : {
              ...base,
              eventId,
              aksi: eventCheckin ? 'CHECKIN' : 'DAFTAR',
              ...(paid ? { pembayaran: effBayar } : {}),
              ...(event?.tipeBayar === 'NOMINAL_BEBAS' && effBayar !== 'BELUM' && effBayar !== 'GRATIS'
                ? { nominal: Number(nominal) || 0 }
                : {}),
              ...(force ? { force: true } : {}),
            };
      return (await apiClient.post<{ data: Result; message: string }>('/admin/tamu', body)).data;
    },
    onSuccess: (r) => {
      toast.success(r.message);
      setResult(r);
      setQuotaFull(false);
      onSuccess();
    },
    onError: (e: any) => {
      if (e?.response?.data?.error?.code === 'QUOTA_FULL') {
        setQuotaFull(true);
        return;
      }
      toast.error(e?.response?.data?.error?.message ?? 'Gagal menyimpan tamu');
    },
  });

  const baseOk = nama.trim().length >= 2 && (jenis === 'ANAK' || noHp.trim().length >= 8);
  const can =
    baseOk &&
    (tujuan === 'IBADAH'
      ? !!ibadahId && !!tanggal && !kidsMismatch
      : !!eventId &&
        !(event?.tipeBayar === 'NOMINAL_BEBAS' && ['TUNAI', 'TRANSFER', 'QRIS'].includes(effBayar) && !(Number(nominal) > 0)));

  const inputCls = 'mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm';
  const seg = (on: boolean) =>
    `flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border ${
      on ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
    }`;

  const resetPerson = () => {
    setResult(null);
    setNama('');
    setNoHp('');
    setTanggalLahir('');
    setQuotaFull(false);
  };

  const submitLabel =
    tujuan === 'IBADAH'
      ? isToday && aksiIbadah === 'CHECKIN'
        ? 'Simpan & catat hadir'
        : 'Simpan reservasi'
      : eventCheckin
        ? 'Simpan & catat hadir'
        : 'Daftarkan';

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              {tujuan && !result ? (
                <button onClick={() => setTujuan(null)} className="p-1 -ml-1 hover:bg-neutral-100 rounded" title="Kembali">
                  <ArrowLeft className="w-4 h-4 text-neutral-500" />
                </button>
              ) : (
                <UserPlus className="w-4 h-4 text-brand-600" />
              )}
              {tujuan === 'IBADAH' ? 'Tambah Tamu Ibadah' : tujuan === 'EVENT' ? 'Tambah Tamu Event' : 'Tambah Tamu'}
            </h2>
            <button onClick={onClose} className="p-1 hover:bg-neutral-100 rounded">
              <X className="w-4 h-4 text-neutral-500" />
            </button>
          </div>

          {!tujuan ? (
            /* Langkah 1 — pilih tujuan */
            <div className="p-6 space-y-3">
              <p className="text-sm text-neutral-600">Tamu ini untuk:</p>
              <ChoiceCard
                icon={<Church className="w-5 h-5" />}
                title="Tamu Ibadah"
                desc="Reservasi atau catat hadir di ibadah (termasuk CKids untuk anak)."
                onClick={() => setTujuan('IBADAH')}
              />
              <ChoiceCard
                icon={<CalendarDays className="w-5 h-5" />}
                title="Tamu Event"
                desc="Daftarkan ke event atau catat hadir di hari H, termasuk pembayaran."
                onClick={() => setTujuan('EVENT')}
              />
            </div>
          ) : result ? (
            <div className="p-6 space-y-3 overflow-y-auto">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
                <div className="text-sm text-neutral-800">{result.message}</div>
              </div>
              <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-4 text-sm space-y-1.5">
                <Row label="Nama" value={result.data.tamu.namaLengkap} />
                <Row label={result.data.tujuan === 'EVENT' ? 'Event' : 'Ibadah'} value={result.data.acaraNama} />
                <Row label="Status" value={STATUS_TEXT[result.data.status]} />
                {result.data.tamu.kode ? <Row label="Kode tamu" value={result.data.tamu.kode} mono /> : null}
                {result.data.isReturning ? <p className="text-xs text-neutral-500">Tamu ini sudah pernah tercatat — data lama dipakai.</p> : null}
              </div>
              {result.data.pickupCode ? (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-center">
                  <div className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Kode jemput anak</div>
                  <div className="text-3xl font-bold tracking-[0.3em] text-amber-900 mt-1 tabular-nums">{result.data.pickupCode}</div>
                  <div className="text-xs text-amber-800 mt-1">Berikan ke pendamping — dipakai saat menjemput anak.</div>
                </div>
              ) : result.data.status !== 'HADIR' && result.data.tamu.kode ? (
                <p className="text-xs text-neutral-500">
                  Saat hari H, usher bisa check-in tamu ini lewat <i>Input Manual</i> dengan kode tamu di atas.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <span className="text-sm font-medium text-neutral-700">Jenis tamu</span>
                <div className="mt-1 flex gap-2">
                  <button type="button" className={seg(jenis === 'DEWASA')} onClick={() => setJenis('DEWASA')}>
                    <User className="w-4 h-4" /> Dewasa
                  </button>
                  <button type="button" className={seg(jenis === 'ANAK')} onClick={() => setJenis('ANAK')}>
                    <Baby className="w-4 h-4" /> Anak
                  </button>
                </div>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-neutral-700">Nama</span>
                <input value={nama} onChange={(e) => setNama(e.target.value)} className={inputCls} placeholder="Nama lengkap tamu" />
              </label>

              {jenis === 'DEWASA' ? (
                <label className="block">
                  <span className="text-sm font-medium text-neutral-700">No HP</span>
                  <input value={noHp} onChange={(e) => setNoHp(e.target.value)} className={inputCls} placeholder="08xx atau +65…" inputMode="tel" />
                  <span className="text-[11px] text-neutral-500">Kalau no HP milik jemaat terdaftar, jemaat itu yang dicatat.</span>
                </label>
              ) : (
                <label className="block">
                  <span className="text-sm font-medium text-neutral-700">
                    Tanggal lahir <span className="font-normal text-neutral-400">(opsional)</span>
                  </span>
                  <input type="date" value={tanggalLahir} max={todayYmd()} onChange={(e) => setTanggalLahir(e.target.value)} className={inputCls} />
                  <span className="text-[11px] text-neutral-500">Tanpa no HP. Membantu mengenali anak yang sama di kunjungan berikutnya.</span>
                </label>
              )}

              {tujuan === 'IBADAH' ? (
                <>
                  <label className="block">
                    <span className="text-sm font-medium text-neutral-700">Ibadah</span>
                    <select value={ibadahId} onChange={(e) => setIbadahId(e.target.value)} className={inputCls}>
                      <option value="">{ibadahQ.isLoading ? 'Memuat…' : '— Pilih ibadah —'}</option>
                      {groupedIbadah.map(([cabang, list]) => (
                        <optgroup key={cabang} label={cabang}>
                          {list.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.nama} · {i.jamMulai}
                              {i.isKidsIbadah ? ' · CKids' : ''}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    {kidsMismatch ? <span className="text-[11px] text-red-600">Ibadah CKids hanya untuk tamu anak.</span> : null}
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-neutral-700">Tanggal ibadah</span>
                    <input type="date" value={tanggal} min={todayYmd()} onChange={(e) => setTanggal(e.target.value)} className={inputCls} />
                  </label>

                  {isToday ? (
                    <div>
                      <span className="text-sm font-medium text-neutral-700">Catat sebagai</span>
                      <div className="mt-1 flex gap-2">
                        <button type="button" className={seg(aksiIbadah === 'RESERVE')} onClick={() => setAksiIbadah('RESERVE')}>
                          Reservasi
                        </button>
                        <button type="button" className={seg(aksiIbadah === 'CHECKIN')} onClick={() => setAksiIbadah('CHECKIN')}>
                          Hadir sekarang
                        </button>
                      </div>
                      {aksiIbadah === 'CHECKIN' && ibadah?.isKidsIbadah ? (
                        <span className="text-[11px] text-neutral-500">Kode jemput anak dibuat otomatis.</span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-[11px] text-neutral-500">Tanggal mendatang → dicatat sebagai reservasi.</p>
                  )}
                </>
              ) : (
                <>
                  <label className="block">
                    <span className="text-sm font-medium text-neutral-700">Event</span>
                    <select
                      value={eventId}
                      onChange={(e) => {
                        setEventId(e.target.value);
                        setQuotaFull(false);
                      }}
                      className={inputCls}
                    >
                      <option value="">{eventQ.isLoading ? 'Memuat…' : '— Pilih event —'}</option>
                      {groupedEvent.map(([cabang, list]) => (
                        <optgroup key={cabang} label={cabang}>
                          {list.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.judul} · {tglPendek(e.tanggalMulai)}
                              {e.isPublished ? '' : ' · draft'}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>

                  {event ? (
                    <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-3 py-2 text-xs text-neutral-600 space-y-0.5">
                      <div>
                        Biaya:{' '}
                        <b className="text-neutral-800">
                          {event.tipeBayar === 'GRATIS'
                            ? 'Gratis'
                            : event.tipeBayar === 'NOMINAL_TETAP'
                              ? rp(event.nominal ?? 0)
                              : `Nominal sukarela${event.nominal ? ` (min. ${rp(event.nominal)})` : ''}`}
                        </b>
                      </div>
                      <div>
                        Peserta: <b className="text-neutral-800">{event.peserta}</b>
                        {event.quotaPeserta != null ? ` / ${event.quotaPeserta} kuota` : ' (tanpa kuota)'}
                      </div>
                      {!event.butuhKehadiran ? <div>Event ini tidak mencatat kehadiran.</div> : null}
                    </div>
                  ) : null}

                  {event?.butuhKehadiran ? (
                    <div>
                      <span className="text-sm font-medium text-neutral-700">Catat sebagai</span>
                      <div className="mt-1 flex gap-2">
                        <button type="button" className={seg(aksiEvent === 'DAFTAR')} onClick={() => setAksiEvent('DAFTAR')}>
                          Daftarkan
                        </button>
                        <button type="button" className={seg(aksiEvent === 'CHECKIN')} onClick={() => setAksiEvent('CHECKIN')}>
                          Hadir sekarang
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {paid ? (
                    <div>
                      <span className="text-sm font-medium text-neutral-700">Pembayaran</span>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {bayarOptions.map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => setBayar(b)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                              effBayar === b ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-neutral-700 border-neutral-300'
                            }`}
                          >
                            {BAYAR_LABEL[b]}
                          </button>
                        ))}
                      </div>
                      {event?.tipeBayar === 'NOMINAL_BEBAS' && ['TUNAI', 'TRANSFER', 'QRIS'].includes(effBayar) ? (
                        <input
                          value={nominal}
                          onChange={(e) => setNominal(e.target.value.replace(/\D/g, ''))}
                          className={inputCls}
                          placeholder="Nominal diterima"
                          inputMode="numeric"
                        />
                      ) : event?.tipeBayar === 'NOMINAL_TETAP' && ['TUNAI', 'TRANSFER', 'QRIS'].includes(effBayar) ? (
                        <p className="text-[11px] text-neutral-500 mt-1">Diterima petugas: {rp(event.nominal ?? 0)} — langsung tercatat lunas.</p>
                      ) : effBayar === 'BELUM' ? (
                        <p className="text-[11px] text-neutral-500 mt-1">Terdaftar dulu; pembayaran diverifikasi kemudian di halaman event.</p>
                      ) : null}
                    </div>
                  ) : null}

                  {quotaFull ? (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                      Kuota peserta sudah penuh. Tetap masukkan tamu ini?
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}

          {tujuan ? (
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
              {result ? (
                <>
                  <button onClick={resetPerson} className="px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 rounded-lg">
                    Tambah tamu lain
                  </button>
                  <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg">
                    Selesai
                  </button>
                </>
              ) : (
                <>
                  <button onClick={onClose} className="px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 rounded-lg">
                    Batal
                  </button>
                  <button
                    onClick={() => mut.mutate(quotaFull)}
                    disabled={!can || mut.isPending}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
                  >
                    {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    {quotaFull ? 'Tetap masukkan' : submitLabel}
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function groupBy<T>(list: T[], key: (x: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of list) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return [...m.entries()];
}

function ChoiceCard({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 p-4 rounded-xl border border-neutral-200 hover:border-brand-400 hover:bg-brand-50/40 text-left transition"
    >
      <span className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">{icon}</span>
      <span>
        <span className="block font-semibold text-neutral-900">{title}</span>
        <span className="block text-xs text-neutral-500 mt-0.5">{desc}</span>
      </span>
    </button>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-neutral-500">{label}</span>
      <span className={`font-medium text-neutral-900 text-right ${mono ? 'font-mono tracking-wider' : ''}`}>{value}</span>
    </div>
  );
}
