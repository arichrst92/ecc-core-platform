import type { Metadata } from 'next';
import { Church, Smartphone } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { CabangGroup, type IbadahItem } from './cabang-group';

export const metadata: Metadata = {
  title: 'Jadwal Ibadah',
  description: 'Jadwal ibadah Elshaddai Creative Community di semua cabang.',
};

interface CalendarEvent extends IbadahItem {
  cabang: { id: string; nama: string };
  linkOnline: string | null;
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

  // Group nested: cabang → tanggal → items
  const cabangMap = new Map<
    string,
    { nama: string; perTanggal: Map<string, CalendarEvent[]> }
  >();
  for (const e of events) {
    const cabKey = e.cabang.id;
    const bucket =
      cabangMap.get(cabKey) ??
      { nama: e.cabang.nama, perTanggal: new Map<string, CalendarEvent[]>() };
    const arr = bucket.perTanggal.get(e.tanggal) ?? [];
    arr.push(e);
    bucket.perTanggal.set(e.tanggal, arr);
    cabangMap.set(cabKey, bucket);
  }
  const cabangSorted = [...cabangMap.entries()].sort(([, a], [, b]) =>
    a.nama.localeCompare(b.nama),
  );

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
            Jadwal ibadah 30 hari ke depan — klik nama cabang untuk lihat
            jadwalnya.
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="container-page max-w-4xl mx-auto">
          {cabangSorted.length === 0 ? (
            <div className="text-center py-12 text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-xl">
              Belum ada jadwal ibadah dalam 30 hari ke depan.
            </div>
          ) : (
            <div className="space-y-3">
              {cabangSorted.map(([cabId, { nama, perTanggal }], idx) => {
                const tanggalSorted = [...perTanggal.entries()]
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([tanggal, items]) => ({ tanggal, items }));
                const totalIbadah = [...perTanggal.values()].reduce(
                  (sum, arr) => sum + arr.length,
                  0,
                );
                return (
                  <CabangGroup
                    key={cabId}
                    cabangNama={nama}
                    totalCount={totalIbadah}
                    perTanggal={tanggalSorted}
                    defaultOpen={idx === 0}
                  />
                );
              })}
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
