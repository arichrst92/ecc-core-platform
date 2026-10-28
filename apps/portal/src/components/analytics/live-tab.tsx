'use client';

/** Tab "Aktif sekarang": pengguna yang sedang membuka app & halaman apa (±30–60 dtk). */
import { useLive } from '@/lib/analytics/use-analytics';
import { pageLabel } from '@/lib/analytics/labels';
import { Card, Loading, PlatformBar, Sparkline, fmtNum } from './ui';

export function LiveTab() {
  const q = useLive();
  const s = q.data;
  if (!s) return <Loading text="Menghubungkan data langsung…" />;
  const max = Math.max(1, ...s.pages.map((p) => p.n));
  const time = new Date(s.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <span className="relative flex w-2 h-2">
          <span className="absolute inline-flex w-full h-full rounded-full bg-green-400 opacity-75 animate-ping" />
          <span className="relative inline-flex w-2 h-2 rounded-full bg-green-500" />
        </span>
        Langsung · diperbarui tiap 10 detik · {time}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)] gap-4 items-start">
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs text-neutral-500">Aktif sekarang</div>
          <div className="text-5xl font-bold text-neutral-900 tabular-nums mt-1">{fmtNum(s.total)}</div>
          <div className="text-xs text-neutral-500 mt-1">
            login {fmtNum(s.login)} · tamu {fmtNum(s.tamu)}
          </div>
          <div className="mt-4">
            <PlatformBar {...s.platform} />
          </div>
          <div className="mt-4">
            <Sparkline data={s.last30} />
            <div className="flex justify-between text-[11px] text-neutral-400 mt-1">
              <span>30 menit lalu</span>
              <span>sekarang</span>
            </div>
          </div>
        </div>

        <Card title="Halaman yang sedang dibuka" sub="Jumlah orang di setiap halaman saat ini">
          {s.pages.length === 0 ? (
            <p className="text-sm text-neutral-500 py-6 text-center">Belum ada yang membuka Els App saat ini.</p>
          ) : null}
          <div className="space-y-2.5">
            {s.pages.map((p) => (
              <div key={p.route} className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_44px] gap-3 items-center text-sm">
                <div className="min-w-0">
                  <div className="truncate text-neutral-800">{pageLabel(p.route)}</div>
                  {p.route !== '*' ? <div className="truncate text-[11px] text-neutral-400 font-mono">{p.route}</div> : null}
                </div>
                <div className="h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${p.route === '*' ? 'bg-neutral-400' : 'bg-brand-500'}`}
                    style={{ width: `${(p.n / max) * 100}%` }}
                  />
                </div>
                <div className="text-right tabular-nums font-semibold text-neutral-900">{p.n}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <p className="text-[11px] text-neutral-400">
        Seseorang dihitung aktif bila app/tab-nya terbuka dan mengirim sinyal dalam 75 detik terakhir. App yang ditutup paksa hilang dari hitungan
        setelah ±75 detik. Angka langsung tidak disimpan sebagai riwayat.
      </p>
    </div>
  );
}
