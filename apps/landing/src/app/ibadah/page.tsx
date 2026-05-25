import type { Metadata } from 'next';
import { Calendar, MapPin, Globe, Church, Smartphone } from 'lucide-react';
import { apiGet } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Jadwal Ibadah',
  description: 'Jadwal ibadah Elshaddai Creative Community di semua cabang.',
};

interface CalendarEvent {
  id: string;
  tanggal: string;
  jam: string;
  jamSelesai: string;
  judul: string;
  cabang: { id: string; nama: string };
  kategori: { id: string; nama: string };
  lokasi: string | null;
  isOnline: boolean;
  linkOnline: string | null;
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export default async function IbadahPage() {
  // Default: 30 hari ke depan dari hari ini
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const future = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const futureIso = future.toISOString().slice(0, 10);

  const events =
    (await apiGet<CalendarEvent[]>(
      `/public/ibadah/calendar?from=${todayIso}&to=${futureIso}`,
    )) ?? [];

  // Group by tanggal
  const grouped = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const arr = grouped.get(e.tanggal) ?? [];
    arr.push(e);
    grouped.set(e.tanggal, arr);
  }
  const groupedSorted = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      <section className="bg-gradient-to-br from-brand-50 to-white py-12 lg:py-16">
        <div className="container-page text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-3 bg-brand-100 text-brand-700 rounded-full text-xs font-semibold uppercase tracking-wider">
            <Church className="w-3.5 h-3.5" />
            Ibadah
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-3">Jadwal Ibadah</h1>
          <p className="text-neutral-600">
            Jadwal ibadah 30 hari ke depan di semua cabang ECC.
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="container-page max-w-4xl mx-auto">
          {groupedSorted.length === 0 ? (
            <div className="text-center py-12 text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-xl">
              Belum ada jadwal ibadah dalam 30 hari ke depan.
            </div>
          ) : (
            <div className="space-y-6">
              {groupedSorted.map(([tanggal, items]) => (
                <div key={tanggal}>
                  <h2 className="font-bold text-neutral-900 mb-3 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-brand-500" />
                    {formatDate(tanggal)}
                  </h2>
                  <div className="space-y-2">
                    {items.map((e) => (
                      <div
                        key={`${e.id}-${e.tanggal}`}
                        className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                      >
                        <div className="sm:w-24 shrink-0 text-center sm:text-left">
                          <div className="font-mono text-lg font-bold text-brand-600">
                            {e.jam}
                          </div>
                          <div className="text-xs text-neutral-400">{e.jamSelesai}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-neutral-900">{e.judul}</h3>
                            <span className="px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded text-xs">
                              {e.kategori.nama}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-neutral-500 mt-1">
                            <span className="flex items-center gap-1">
                              <Church className="w-3.5 h-3.5" />
                              {e.cabang.nama}
                            </span>
                            {e.isOnline ? (
                              <span className="flex items-center gap-1 text-brand-600">
                                <Globe className="w-3.5 h-3.5" />
                                Online streaming
                              </span>
                            ) : e.lokasi ? (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5" />
                                {e.lokasi}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CTA download aplikasi */}
          <div className="mt-12 p-6 bg-brand-50 border border-brand-200 rounded-2xl text-center">
            <Smartphone className="w-10 h-10 mx-auto mb-3 text-brand-500" />
            <p className="text-sm text-brand-800 mb-3 font-medium">
              Ingin check-in ibadah dan dapat reminder otomatis di HP?
            </p>
            <a
              href="https://apps.apple.com/app/ecc-church"
              className="btn-primary text-sm"
            >
              Download Aplikasi ECC
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
