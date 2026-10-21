'use client';

/**
 * Tambah Tamu dari portal → langsung direservasikan / dicatat hadir di ibadah.
 * - Dewasa: nama + no HP (wajib). No HP milik jemaat → jemaat itu yang dicatat.
 * - Anak: nama (+ tanggal lahir opsional), tanpa no HP. Ibadah CKids hanya untuk anak.
 * API: GET /admin/tamu/ibadah-options, POST /admin/tamu
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Baby, CheckCircle2, Loader2, User, UserPlus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { todayYmd } from '@/lib/dates';

type Jenis = 'DEWASA' | 'ANAK';
type Aksi = 'RESERVE' | 'CHECKIN';

interface IbadahOpt {
  id: string;
  nama: string;
  jamMulai: string;
  jamSelesai: string;
  isKidsIbadah: boolean;
  cabang: { id: string; nama: string } | null;
}

interface Result {
  tamu: { id: string; namaLengkap: string; kode: string | null };
  reservasi: { id: string; kode: string; status: string; pickupCode: string | null };
  isMember: boolean;
  isReturning: boolean;
  ibadahNama: string;
}

export function AddGuestModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [jenis, setJenis] = useState<Jenis>('DEWASA');
  const [nama, setNama] = useState('');
  const [noHp, setNoHp] = useState('');
  const [tanggalLahir, setTanggalLahir] = useState('');
  const [ibadahId, setIbadahId] = useState('');
  const [tanggal, setTanggal] = useState(todayYmd());
  const [aksi, setAksi] = useState<Aksi>('RESERVE');
  const [result, setResult] = useState<{ data: Result; message: string } | null>(null);

  const ibadahQ = useQuery({
    queryKey: ['tamu', 'ibadah-options'],
    queryFn: async () => (await apiClient.get<{ data: IbadahOpt[] }>('/admin/tamu/ibadah-options')).data.data,
  });

  // Dikelompokkan per cabang untuk <optgroup>.
  const grouped = useMemo(() => {
    const m = new Map<string, IbadahOpt[]>();
    for (const i of ibadahQ.data ?? []) {
      const k = i.cabang?.nama ?? 'Tanpa cabang';
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    return [...m.entries()];
  }, [ibadahQ.data]);
  const selected = (ibadahQ.data ?? []).find((i) => i.id === ibadahId) ?? null;
  const kidsMismatch = !!selected?.isKidsIbadah && jenis !== 'ANAK';
  const isToday = tanggal === todayYmd();

  const mut = useMutation({
    mutationFn: async () =>
      (
        await apiClient.post<{ data: Result; message: string }>('/admin/tamu', {
          jenis,
          nama: nama.trim(),
          noHp: jenis === 'DEWASA' ? noHp.trim() : null,
          tanggalLahir: jenis === 'ANAK' && tanggalLahir ? tanggalLahir : null,
          ibadahId,
          tanggalIbadah: tanggal,
          aksi: isToday ? aksi : 'RESERVE',
        })
      ).data,
    onSuccess: (r) => {
      toast.success(r.message);
      setResult(r);
      onSuccess();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Gagal menyimpan tamu'),
  });

  const can =
    nama.trim().length >= 2 &&
    (jenis === 'ANAK' || noHp.trim().length >= 8) &&
    !!ibadahId &&
    !!tanggal &&
    !kidsMismatch;
  const inputCls = 'mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm';
  const seg = (on: boolean) =>
    `flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border ${
      on ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
    }`;

  const reset = () => {
    setResult(null);
    setNama('');
    setNoHp('');
    setTanggalLahir('');
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-brand-600" /> Tambah Tamu
            </h2>
            <button onClick={onClose} className="p-1 hover:bg-neutral-100 rounded">
              <X className="w-4 h-4 text-neutral-500" />
            </button>
          </div>

          {result ? (
            <div className="p-6 space-y-3 overflow-y-auto">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
                <div className="text-sm text-neutral-800">{result.message}</div>
              </div>
              <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-4 text-sm space-y-1.5">
                <Row label="Nama" value={result.data.tamu.namaLengkap} />
                <Row label="Ibadah" value={result.data.ibadahNama} />
                <Row label="Status" value={result.data.reservasi.status === 'JOIN' ? 'Hadir' : 'Reservasi'} />
                {result.data.tamu.kode ? <Row label="Kode tamu" value={result.data.tamu.kode} mono /> : null}
                {result.data.isReturning ? <p className="text-xs text-neutral-500">Tamu ini sudah pernah tercatat — data lama dipakai.</p> : null}
              </div>
              {result.data.reservasi.pickupCode ? (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-center">
                  <div className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Kode jemput anak</div>
                  <div className="text-3xl font-bold tracking-[0.3em] text-amber-900 mt-1 tabular-nums">{result.data.reservasi.pickupCode}</div>
                  <div className="text-xs text-amber-800 mt-1">Berikan ke pendamping — dipakai saat menjemput anak.</div>
                </div>
              ) : result.data.reservasi.status !== 'JOIN' && result.data.tamu.kode ? (
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

              <label className="block">
                <span className="text-sm font-medium text-neutral-700">Ibadah</span>
                <select value={ibadahId} onChange={(e) => setIbadahId(e.target.value)} className={inputCls}>
                  <option value="">{ibadahQ.isLoading ? 'Memuat…' : '— Pilih ibadah —'}</option>
                  {grouped.map(([cabang, list]) => (
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
                    <button type="button" className={seg(aksi === 'RESERVE')} onClick={() => setAksi('RESERVE')}>
                      Reservasi
                    </button>
                    <button type="button" className={seg(aksi === 'CHECKIN')} onClick={() => setAksi('CHECKIN')}>
                      Hadir sekarang
                    </button>
                  </div>
                  {aksi === 'CHECKIN' && selected?.isKidsIbadah ? (
                    <span className="text-[11px] text-neutral-500">Kode jemput anak dibuat otomatis.</span>
                  ) : null}
                </div>
              ) : (
                <p className="text-[11px] text-neutral-500">Tanggal mendatang → dicatat sebagai reservasi.</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            {result ? (
              <>
                <button onClick={reset} className="px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 rounded-lg">
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
                  onClick={() => mut.mutate()}
                  disabled={!can || mut.isPending}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
                >
                  {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isToday && aksi === 'CHECKIN' ? 'Simpan & catat hadir' : 'Simpan reservasi'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
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
