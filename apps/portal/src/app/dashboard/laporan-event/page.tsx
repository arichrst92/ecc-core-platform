'use client';

/**
 * Laporan Event — terdaftar vs hadir per event, cara check-in, tamu.
 * API: /admin/report/event
 */
import { ReviewReportCard, type ReviewItem, type ReviewSummary } from '@/components/reviews/review-panel';

type ReviewReport = { overall: ReviewSummary; perItem: (ReviewSummary & { key: string; label: string })[]; comments: ReviewItem[] };
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Loader2, UserPlus } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import {
  ExportButtons,
  Field,
  FilterCard,
  MethodBar,
  MethodInline,
  PeriodFields,
  StatCard,
  fmtTgl,
  periodParams,
  selectCls,
  useCabangOptions,
  type MethodCount,
  type PeriodState,
} from '@/components/report/report-ui';

interface EventReport {
  period: { from: string; to: string; label: string } | null;
  summary: {
    event: number;
    terdaftar: number;
    hadir: number;
    batal: number;
    persenHadir: number | null;
    tamuTerdaftar: number;
    tamuHadir: number;
    tamuUnik: number;
    methods: MethodCount;
  };
  events: {
    eventId: string;
    judul: string;
    tanggalMulai: string;
    cabang: string | null;
    butuhKehadiran: boolean;
    allowSelfCheckin: boolean;
    quotaPeserta: number | null;
    terdaftar: number;
    batal: number;
    hadir: number;
    persenHadir: number | null;
    tamuTerdaftar: number;
    tamuHadir: number;
    ratingAvg?: number | null;
    ratingCount?: number;
    methods: MethodCount;
  }[];
  reviews?: ReviewReport;
  guests: {
    eventId: string;
    eventJudul: string;
    id: string;
    namaLengkap: string;
    noHp: string | null;
    status: string;
    inviter: string | null;
    walkIn: boolean;
  }[];
}

const STATUS_LABEL: Record<string, string> = {
  DAFTAR: 'Daftar',
  MENUNGGU_VERIFIKASI: 'Menunggu verifikasi',
  BAYAR: 'Bayar',
  HADIR: 'Hadir',
};

export default function LaporanEventPage() {
  const [cabangId, setCabangId] = useState('');
  const [period, setPeriod] = useState<PeriodState>({ periode: 'last_30d', from: '', to: '' });
  const cabangQ = useCabangOptions();
  const params = { cabangId: cabangId || undefined, ...periodParams(period) };
  const q = useQuery({
    queryKey: ['report', 'event', params],
    queryFn: async () => (await apiClient.get<{ data: EventReport }>('/admin/report/event', { params })).data.data,
    placeholderData: (p) => p,
  });
  const d = q.data;
  const maxHadir = Math.max(1, ...(d?.events ?? []).map((e) => e.terdaftar));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-brand-500" /> Laporan Event
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Peserta terdaftar vs hadir, tamu, dan cara check-in.{' '}
            {d?.period ? `${d.period.label ? `${d.period.label} · ` : ''}${fmtTgl(d.period.from)} – ${fmtTgl(d.period.to)}` : ''}
          </p>
        </div>
        <ExportButtons endpoint="/admin/report/event/export" params={params} filename={`laporan-event-${d?.period?.from ?? ''}`} />
      </div>

      <FilterCard>
        <Field label="Cabang">
          <select value={cabangId} onChange={(e) => setCabangId(e.target.value)} className={selectCls}>
            <option value="">Semua cabang</option>
            {(cabangQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nama}
              </option>
            ))}
          </select>
        </Field>
        <PeriodFields value={period} onChange={setPeriod} />
      </FilterCard>

      {q.isLoading || !d ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Event" value={d.summary.event} />
            <StatCard label="Peserta terdaftar" value={d.summary.terdaftar} hint={d.summary.batal ? `${d.summary.batal} batal` : undefined} />
            <StatCard label="Hadir" value={d.summary.hadir} />
            <StatCard label="Tingkat kehadiran" value={d.summary.persenHadir != null ? `${d.summary.persenHadir}%` : '—'} />
            <StatCard label="Tamu hadir" value={d.summary.tamuHadir} hint={`${d.summary.tamuTerdaftar} tamu terdaftar`} accent="tamu" />
            <StatCard label="Tamu unik" value={d.summary.tamuUnik} accent="tamu" />
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl p-4">
            <h2 className="font-semibold text-neutral-900 mb-3">Cara check-in</h2>
            <MethodBar methods={d.summary.methods} />
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-100">
              <h2 className="font-semibold text-neutral-900">Per event ({d.events.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Tanggal</th>
                    <th className="text-left px-4 py-2 font-medium">Event</th>
                    <th className="text-left px-4 py-2 font-medium w-56">Hadir / terdaftar</th>
                    <th className="text-right px-4 py-2 font-medium">%</th>
                    <th className="text-right px-4 py-2 font-medium">Tamu</th>
                    <th className="text-right px-4 py-2 font-medium">Batal</th>
                    <th className="text-right px-4 py-2 font-medium">Rating</th>
                    <th className="text-left px-4 py-2 font-medium">Cara check-in</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {d.events.map((e) => (
                    <tr key={e.eventId}>
                      <td className="px-4 py-2 whitespace-nowrap">{fmtTgl(e.tanggalMulai.slice(0, 10))}</td>
                      <td className="px-4 py-2">
                        <Link href={`/dashboard/event/${e.eventId}`} className="font-medium hover:text-brand-600 hover:underline">
                          {e.judul}
                        </Link>
                        <div className="text-[11px] text-neutral-400">
                          {[e.cabang ?? 'Global', e.butuhKehadiran ? null : 'tanpa absensi', e.allowSelfCheckin ? 'self check-in' : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="h-2.5 bg-neutral-100 rounded-full overflow-hidden" title={`${e.hadir} hadir dari ${e.terdaftar} terdaftar`}>
                          <div className="h-full bg-neutral-300 rounded-full" style={{ width: `${(e.terdaftar / maxHadir) * 100}%` }}>
                            <div className="h-full bg-brand-500 rounded-full" style={{ width: `${e.terdaftar ? (e.hadir / e.terdaftar) * 100 : 0}%` }} />
                          </div>
                        </div>
                        <div className="text-[11px] text-neutral-500 mt-0.5">
                          {e.hadir} / {e.terdaftar}
                          {e.quotaPeserta ? ` · kuota ${e.quotaPeserta}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right font-semibold">{e.persenHadir != null ? `${e.persenHadir}%` : '—'}</td>
                      <td className="px-4 py-2 text-right text-violet-700">
                        {e.tamuHadir}/{e.tamuTerdaftar}
                      </td>
                      <td className="px-4 py-2 text-right text-neutral-500">{e.batal || ''}</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {e.ratingAvg != null ? (
                          <span className="font-semibold text-amber-600">{e.ratingAvg}★ <span className="text-[11px] text-neutral-400 font-normal">({e.ratingCount})</span></span>
                        ) : (
                          <span className="text-neutral-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <MethodInline methods={e.methods} />
                      </td>
                    </tr>
                  ))}
                  {d.events.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center text-neutral-400 py-8">
                        Tidak ada event di periode ini.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {/* Ulasan jemaat */}
          <ReviewReportCard data={d.reviews} itemHeader="Event" />

          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-100">
              <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-violet-600" /> Daftar tamu ({d.guests.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Event</th>
                    <th className="text-left px-4 py-2 font-medium">Nama</th>
                    <th className="text-left px-4 py-2 font-medium">No HP</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                    <th className="text-left px-4 py-2 font-medium">Dibawa oleh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {d.guests.map((g) => (
                    <tr key={`${g.eventId}-${g.id}`}>
                      <td className="px-4 py-2 text-neutral-600">{g.eventJudul}</td>
                      <td className="px-4 py-2">
                        <Link href={`/dashboard/jemaat/${g.id}`} className="font-medium hover:text-brand-600 hover:underline">
                          {g.namaLengkap}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-neutral-600">{g.noHp ?? '—'}</td>
                      <td className="px-4 py-2">{STATUS_LABEL[g.status] ?? g.status}</td>
                      <td className="px-4 py-2 text-neutral-600">{g.walkIn ? 'Walk-in' : (g.inviter ?? '—')}</td>
                    </tr>
                  ))}
                  {d.guests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center text-neutral-400 py-8">
                        Tidak ada tamu.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
