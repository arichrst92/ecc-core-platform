'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, MapPin, Globe } from 'lucide-react';
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
                      <EventChip key={`${e.ibadahId}-${i}`} event={e} />
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
              <EventDetailRow key={`${e.ibadahId}-${i}`} event={e} tanggal={selectedDate} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EventChip({ event }: { event: CalendarEvent }) {
  return (
    <Link
      href={`/dashboard/ibadah/${event.ibadahId}`}
      className="block px-1 py-0.5 text-[10px] font-medium rounded bg-brand-100 text-brand-800 hover:bg-brand-200 truncate"
      title={`${event.nama} · ${event.cabang.nama} · ${event.jamMulai}`}
      onClick={(ev) => ev.stopPropagation()}
    >
      {event.jamMulai} {event.nama}
    </Link>
  );
}

function EventDetailRow({ event, tanggal }: { event: CalendarEvent; tanggal: string }) {
  return (
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
      <Link
        href={`/dashboard/kehadiran?ibadahId=${event.ibadahId}&tanggal=${tanggal}`}
        className="text-xs text-brand-600 hover:text-brand-700 font-medium shrink-0 px-2 py-1 hover:bg-brand-50 rounded"
        title="Lihat reservasi tanggal ini"
      >
        Lihat reservasi
      </Link>
    </div>
  );
}
