'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Globe,
  CalendarX,
  X,
  Eye,
  Users,
  Ticket,
  Calendar as CalendarIcon,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

interface CalendarEvent {
  ibadahId: string;
  tanggal: string;
  nama: string;
  jamMulai: string;
  jamSelesai: string;
  cabang: { id: string; nama: string };
  kategoriIbadah: { id: string; nama: string };
  tipeJadwal: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'ONCE';
  lokasi: string | null;
  isOnline: boolean;
}

const HARI_HEADER = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BULAN_NAMA = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export function CalendarView() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Popup state — set saat user klik chip ibadah di kalender. Popup show
  // detail singkat + action buttons (Lihat Detail / Tiadakan).
  const [popup, setPopup] = useState<{ event: CalendarEvent; tanggal: string } | null>(null);

  // Range: tampilkan hari pertama grid (Minggu sebelum tanggal 1) sampai hari terakhir grid (Sabtu setelah tanggal terakhir)
  const { gridStart, gridEnd, fromStr, toStr } = useMemo(() => {
    const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const lastOfMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(gridStart.getDate() - firstOfMonth.getDay()); // mundur ke Minggu
    const gridEnd = new Date(lastOfMonth);
    gridEnd.setDate(gridEnd.getDate() + (6 - lastOfMonth.getDay())); // maju ke Sabtu
    return {
      gridStart,
      gridEnd,
      fromStr: gridStart.toISOString().slice(0, 10),
      toStr: gridEnd.toISOString().slice(0, 10),
    };
  }, [cursor]);

  const eventsQ = useQuery({
    queryKey: ['ibadah-calendar', fromStr, toStr],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CalendarEvent[] }>('/admin/ibadah/calendar', {
        params: { from: fromStr, to: toStr },
      });
      return res.data.data;
    },
    staleTime: 60_000,
  });

  // Group events by tanggal
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of eventsQ.data ?? []) {
      const arr = map.get(e.tanggal) ?? [];
      arr.push(e);
      map.set(e.tanggal, arr);
    }
    return map;
  }, [eventsQ.data]);

  // Build grid cells
  const cells: { date: Date; iso: string; inMonth: boolean; isToday: boolean }[] = [];
  const cur = new Date(gridStart);
  const todayIso = today.toISOString().slice(0, 10);
  while (cur.getTime() <= gridEnd.getTime()) {
    const iso = cur.toISOString().slice(0, 10);
    cells.push({
      date: new Date(cur),
      iso,
      inMonth: cur.getMonth() === cursor.getMonth(),
      isToday: iso === todayIso,
    });
    cur.setDate(cur.getDate() + 1);
  }

  function goPrev() {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  }
  function goNext() {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
  }
  function goToday() {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(null);
  }

  const selectedEvents = selectedDate ? eventsByDate.get(selectedDate) ?? [] : [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={goPrev}
            className="p-1.5 hover:bg-neutral-100 rounded-lg border border-neutral-200"
            title="Bulan sebelumnya"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-lg font-semibold text-neutral-900 min-w-[180px] text-center">
            {BULAN_NAMA[cursor.getMonth()]} {cursor.getFullYear()}
          </h2>
          <button
            onClick={goNext}
            className="p-1.5 hover:bg-neutral-100 rounded-lg border border-neutral-200"
            title="Bulan berikutnya"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={goToday}
          className="px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg border border-neutral-200"
        >
          Hari ini
        </button>
      </div>

      {eventsQ.isLoading && (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
          <Loader2 className="w-5 h-5 mx-auto animate-spin text-neutral-400" />
        </div>
      )}

      {!eventsQ.isLoading && (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50">
            {HARI_HEADER.map((h, i) => (
              <div
                key={h}
                className={`px-2 py-2 text-xs font-semibold uppercase text-center ${
                  i === 0 ? 'text-red-600' : 'text-neutral-600'
                }`}
              >
                {h}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 auto-rows-[110px]">
            {cells.map((cell) => {
              const events = eventsByDate.get(cell.iso) ?? [];
              const isSelected = selectedDate === cell.iso;
              return (
                <button
                  key={cell.iso}
                  onClick={() => setSelectedDate(isSelected ? null : cell.iso)}
                  className={`text-left p-1.5 border-b border-r border-neutral-100 overflow-hidden transition ${
                    !cell.inMonth ? 'bg-neutral-50/50' : 'bg-white hover:bg-brand-50/30'
                  } ${isSelected ? 'ring-2 ring-brand-500 ring-inset bg-brand-50/50' : ''}`}
                >
                  <div
                    className={`flex items-center justify-between text-xs font-semibold ${
                      cell.isToday
                        ? 'text-white bg-brand-500 rounded-full w-6 h-6 flex items-center justify-center'
                        : !cell.inMonth
                          ? 'text-neutral-300'
                          : cell.date.getDay() === 0
                            ? 'text-red-600'
                            : 'text-neutral-700'
                    }`}
                  >
                    {cell.date.getDate()}
                  </div>
                  <div className="mt-1 space-y-0.5 overflow-hidden">
                    {events.slice(0, 3).map((e, i) => (
                      <EventChip
                        key={`${e.ibadahId}-${i}`}
                        event={e}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setPopup({ event: e, tanggal: cell.iso });
                        }}
                      />
                    ))}
                    {events.length > 3 && (
                      <div className="text-[10px] text-neutral-500 font-medium px-1">
                        +{events.length - 3} lagi
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Popup saat klik chip event langsung */}
      {popup && (
        <EventActionPopup
          event={popup.event}
          tanggal={popup.tanggal}
          onClose={() => setPopup(null)}
          onAfterCancel={() => {
            setPopup(null);
            eventsQ.refetch();
          }}
        />
      )}

      {/* Selected date detail panel */}
      {selectedDate && selectedEvents.length > 0 && (
        <div className="mt-4 bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-neutral-900">
              {new Date(selectedDate).toLocaleDateString('id-ID', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </h3>
            <button
              onClick={() => setSelectedDate(null)}
              className="text-xs text-neutral-500 hover:text-neutral-900"
            >
              Tutup
            </button>
          </div>
          <div className="space-y-2">
            {selectedEvents.map((e, i) => (
              <EventDetailRow
                key={`${e.ibadahId}-${i}`}
                event={e}
                tanggal={selectedDate}
                onAfterCancel={() => {
                  // Refetch calendar agar occurrence yang baru dibatalkan hilang.
                  eventsQ.refetch();
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EventChip({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick: (ev: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left block px-1 py-0.5 text-[10px] font-medium rounded bg-brand-100 text-brand-800 hover:bg-brand-200 truncate"
      title={`${event.nama} · ${event.cabang.nama} · ${event.jamMulai}`}
    >
      {event.jamMulai} {event.nama}
    </button>
  );
}

// ============== Popup saat klik chip ibadah ==============
// Tampilkan info singkat + action buttons. Tiadakan flow nested confirm.
function EventActionPopup({
  event,
  tanggal,
  onClose,
  onAfterCancel,
}: {
  event: CalendarEvent;
  tanggal: string;
  onClose: () => void;
  onAfterCancel: () => void;
}) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const tanggalLabel = new Date(tanggal).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
          {/* Header */}
          <div className="flex items-start justify-between px-6 py-4 border-b border-neutral-100">
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-neutral-900 truncate">{event.nama}</h2>
              <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <CalendarIcon className="w-3 h-3" />
                  {tanggalLabel}
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {event.jamMulai}–{event.jamSelesai}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-neutral-100 rounded shrink-0 ml-3"
              aria-label="Tutup"
            >
              <X className="w-4 h-4 text-neutral-500" />
            </button>
          </div>

          {/* Info badges */}
          <div className="px-6 pt-4 pb-1 flex items-center gap-2 flex-wrap text-xs text-neutral-600">
            <span className="inline-block px-1.5 py-0.5 bg-neutral-100 rounded font-medium">
              {event.kategoriIbadah.nama}
            </span>
            <span className="inline-block px-1.5 py-0.5 bg-neutral-100 rounded">
              {event.cabang.nama}
            </span>
            {event.lokasi && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {event.lokasi}
              </span>
            )}
            {event.isOnline && (
              <span className="inline-flex items-center gap-1 text-blue-700">
                <Globe className="w-3 h-3" />
                Online
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="p-6 space-y-2">
            <Link
              href={`/dashboard/ibadah/${event.ibadahId}?tanggal=${tanggal}`}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition"
            >
              <Eye className="w-4 h-4" />
              Lihat Detail Ibadah
            </Link>
            <Link
              href={`/dashboard/ibadah/${event.ibadahId}?tanggal=${tanggal}#petugas`}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-neutral-700 bg-neutral-50 hover:bg-neutral-100 rounded-lg transition"
            >
              <Users className="w-4 h-4" />
              Atur Petugas Khusus Tanggal Ini
            </Link>
            <Link
              href={`/dashboard/kehadiran?ibadahId=${event.ibadahId}&tanggal=${tanggal}`}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-neutral-700 bg-neutral-50 hover:bg-neutral-100 rounded-lg transition"
            >
              <Ticket className="w-4 h-4" />
              Lihat Reservasi
            </Link>

            {/* Separator + destructive action */}
            {event.tipeJadwal !== 'ONCE' && (
              <>
                <div className="border-t border-neutral-100 my-3" />
                <button
                  onClick={() => setCancelOpen(true)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition"
                >
                  <CalendarX className="w-4 h-4" />
                  Tiadakan Ibadah Tanggal Ini
                </button>
              </>
            )}
            {event.tipeJadwal === 'ONCE' && (
              <div className="text-[11px] text-neutral-500 text-center pt-2">
                Ibadah tipe Sekali (ONCE) — untuk membatalkan, hapus ibadah-nya dari menu Ibadah.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation nested modal */}
      {cancelOpen && (
        <CancelOccurrenceModal
          ibadahId={event.ibadahId}
          ibadahNama={event.nama}
          tanggal={tanggal}
          tanggalLabel={tanggalLabel}
          onClose={() => setCancelOpen(false)}
          onSuccess={() => {
            setCancelOpen(false);
            onAfterCancel();
          }}
        />
      )}
    </>
  );
}

function EventDetailRow({
  event,
  tanggal,
  onAfterCancel,
}: {
  event: CalendarEvent;
  tanggal: string;
  onAfterCancel: () => void;
}) {
  const [cancelOpen, setCancelOpen] = useState(false);
  return (
    <>
      <div className="flex items-start gap-3 p-3 border border-neutral-100 rounded-lg hover:bg-neutral-50">
        <div className="text-xs font-mono tabular-nums text-neutral-700 mt-0.5 shrink-0">
          {event.jamMulai}
          <br />
          <span className="text-neutral-400">{event.jamSelesai}</span>
        </div>
        <div className="flex-1 min-w-0">
          <Link
            href={`/dashboard/ibadah/${event.ibadahId}`}
            className="font-medium text-neutral-900 hover:text-brand-600 hover:underline"
          >
            {event.nama}
          </Link>
          <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-2 flex-wrap">
            <span className="inline-block px-1.5 py-0.5 bg-neutral-100 rounded">
              {event.kategoriIbadah.nama}
            </span>
            <span>·</span>
            <span>{event.cabang.nama}</span>
            {event.lokasi && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {event.lokasi}
                </span>
              </>
            )}
            {event.isOnline && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1 text-blue-700">
                  <Globe className="w-3 h-3" />
                  Online
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/dashboard/kehadiran?ibadahId=${event.ibadahId}&tanggal=${tanggal}`}
            className="text-xs text-brand-600 hover:text-brand-700 font-medium px-2 py-1 hover:bg-brand-50 rounded"
            title="Lihat reservasi tanggal ini"
          >
            Lihat reservasi
          </Link>
          <Link
            href={`/dashboard/ibadah/${event.ibadahId}?tanggal=${tanggal}#petugas`}
            className="text-xs text-neutral-600 hover:text-neutral-900 font-medium px-2 py-1 hover:bg-neutral-100 rounded"
            title="Atur petugas khusus tanggal ini"
          >
            Petugas khusus
          </Link>
          {/* Cancel hanya untuk ibadah recurring; ONCE → hapus saja Ibadah-nya */}
          {event.tipeJadwal !== 'ONCE' && (
            <button
              onClick={() => setCancelOpen(true)}
              className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 hover:bg-red-50 rounded inline-flex items-center gap-1"
              title="Tiadakan ibadah ini hanya untuk tanggal ini"
            >
              <CalendarX className="w-3 h-3" />
              Tiadakan
            </button>
          )}
        </div>
      </div>

      {cancelOpen && (
        <CancelOccurrenceModal
          ibadahId={event.ibadahId}
          ibadahNama={event.nama}
          tanggal={tanggal}
          onClose={() => setCancelOpen(false)}
          onSuccess={() => {
            setCancelOpen(false);
            onAfterCancel();
          }}
        />
      )}
    </>
  );
}

// ============== Cancel Occurrence Modal ==============

function CancelOccurrenceModal({
  ibadahId,
  ibadahNama,
  tanggal,
  tanggalLabel: tanggalLabelProp,
  onClose,
  onSuccess,
}: {
  ibadahId: string;
  ibadahNama: string;
  tanggal: string;
  /** Format readable, kalau tidak di-pass otomatis derived dari tanggal. */
  tanggalLabel?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [catatan, setCatatan] = useState('');
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{
        data: { id: string };
        meta: { cancelledReservations: number };
      }>(`/admin/ibadah/${ibadahId}/occurrence/${tanggal}/cancel`, {
        catatan: catatan.trim() || undefined,
      });
      return res.data;
    },
    onSuccess: (res) => {
      const n = res.meta?.cancelledReservations ?? 0;
      toast.success(
        n > 0
          ? `Ibadah ditiadakan. ${n} reservasi otomatis dibatalkan.`
          : 'Ibadah ditiadakan.',
      );
      qc.invalidateQueries({ queryKey: ['ibadah-calendar'] });
      qc.invalidateQueries({ queryKey: ['ibadah-cancelled', ibadahId] });
      onSuccess();
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message ?? 'Gagal meniadakan'),
  });

  const tanggalLabel =
    tanggalLabelProp ??
    new Date(tanggal).toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Konfirmasi tiadakan ibadah
            </h2>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-6 space-y-3 text-sm">
            {/* Prompt eksplisit "Apakah Anda yakin?" sesuai request user */}
            <div className="text-base font-medium text-neutral-900">
              Apakah Anda yakin akan meniadakan ibadah ini?
            </div>
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3">
              <div className="font-semibold text-neutral-900">{ibadahNama}</div>
              <div className="text-xs text-neutral-500 mt-0.5">{tanggalLabel}</div>
            </div>
            <p className="text-neutral-600 text-xs">
              Hanya tanggal ini yang akan ditiadakan; jadwal mingguan tetap berjalan
              di tanggal-tanggal lain. Semua reservasi aktif di tanggal ini akan
              <strong> otomatis dibatalkan</strong>.
            </p>
            <label className="block">
              <span className="text-xs text-neutral-700 font-medium">Catatan (opsional)</span>
              <textarea
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                rows={3}
                placeholder="Mis. Diganti dengan Ibadah Natal jam 10.00"
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onClose}
              disabled={mut.isPending}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Tidak, batalkan
            </button>
            <button
              onClick={() => mut.mutate()}
              disabled={mut.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
            >
              {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Ya, tiadakan
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
