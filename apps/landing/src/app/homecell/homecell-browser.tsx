'use client';

/**
 * Homecell: pilih cabang → kartu per zona (geser menyamping) berisi PIC zona,
 * pastor, dan daftar homecell → klik homecell → panel detail dari kanan.
 * Pola sama dengan halaman Ibadah (GroupCarousel + panel geser).
 */
import { useEffect, useState } from 'react';
import { CalendarClock, Church, HousePlus, Smartphone, Users, X, Baby, Heart } from 'lucide-react';
import { GroupCarousel } from '@/components/h-carousel';
import { useLang } from '@/components/lang-provider';
import { absoluteUrl } from '@/lib/api';
import { tzLabel } from '@/lib/tz';

export interface HomecellPerson {
  id: string;
  nama: string;
  fotoUrl: string | null;
}
export interface HomecellItem {
  id: string;
  nama: string;
  deskripsi: string | null;
  hari: string | null;
  jam: string | null;
  kategori: 'SINGLE' | 'COUPLE' | null;
  usiaMin: number | null;
  usiaMax: number | null;
  memberCount: number;
  pic: HomecellPerson | null;
}
export interface HomecellZona {
  id: string;
  nama: string;
  cabang: { id: string; nama: string; timezone?: string | null };
  pic: HomecellPerson | null;
  pastors: HomecellPerson[];
  homecells: HomecellItem[];
}

const HARI: Record<string, [string, string]> = {
  MINGGU: ['Minggu', 'Sunday'],
  SENIN: ['Senin', 'Monday'],
  SELASA: ['Selasa', 'Tuesday'],
  RABU: ['Rabu', 'Wednesday'],
  KAMIS: ['Kamis', 'Thursday'],
  JUMAT: ['Jumat', 'Friday'],
  SABTU: ['Sabtu', 'Saturday'],
};

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** Foto bulat; tanpa foto → inisial di lingkaran oranye. */
function Avatar({ p, size = 40, ring = false }: { p: HomecellPerson; size?: number; ring?: boolean }) {
  const src = absoluteUrl(p.fotoUrl);
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-grad text-white font-bold ${
        ring ? 'ring-2 ring-white' : ''
      }`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
      title={p.nama}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={p.nama} className="absolute inset-0 w-full h-full object-cover object-top" loading="lazy" />
      ) : (
        initials(p.nama)
      )}
    </span>
  );
}

export function HomecellBrowser({ zonas }: { zonas: HomecellZona[] }) {
  const { lang, L } = useLang();
  const en = lang === 'en';
  const [sel, setSel] = useState<{ hc: HomecellItem; zona: HomecellZona } | null>(null);
  const [open, setOpen] = useState(false);

  const hariLabel = (h: string | null) => (h ? (HARI[h]?.[en ? 1 : 0] ?? h) : null);
  const jadwal = (h: HomecellItem, z: HomecellZona) =>
    [hariLabel(h.hari), h.jam ? `${h.jam} ${tzLabel(z.cabang.timezone)}` : null].filter(Boolean).join(' · ');
  // Usia & kategori selalu tampil: kosong = semua usia / umum.
  const usia = (h: HomecellItem) =>
    h.usiaMin != null && h.usiaMax != null
      ? `${h.usiaMin}–${h.usiaMax} ${L('th', 'yrs')}`
      : h.usiaMin != null
        ? `${h.usiaMin}+ ${L('th', 'yrs')}`
        : h.usiaMax != null
          ? `≤ ${h.usiaMax} ${L('th', 'yrs')}`
          : L('Semua usia', 'All ages');
  const kategori = (h: HomecellItem) => (h.kategori === 'COUPLE' ? 'Couple' : h.kategori === 'SINGLE' ? 'Single' : L('Umum', 'General'));

  const show = (hc: HomecellItem, zona: HomecellZona) => {
    setSel({ hc, zona });
    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
  };
  const close = () => {
    setOpen(false);
    setTimeout(() => setSel(null), 300);
  };
  useEffect(() => {
    if (!sel) return;
    const k = (ev: KeyboardEvent) => ev.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [sel]);

  // cabang → zona
  const cabangMap = new Map<string, { nama: string; zonas: HomecellZona[] }>();
  for (const z of zonas) {
    if (!z.homecells.length) continue;
    const b = cabangMap.get(z.cabang.id) ?? { nama: z.cabang.nama, zonas: [] };
    b.zonas.push(z);
    cabangMap.set(z.cabang.id, b);
  }
  const groups = [...cabangMap.entries()]
    .sort(([, a], [, b]) => a.nama.localeCompare(b.nama))
    .map(([key, { nama, zonas: list }]) => ({
      key,
      label: nama,
      items: list.map((z) => (
        <div key={z.id} className="s-card">
          {/* Kepala kartu: zona + PIC zona + pastor */}
          <div className="shrink-0 bg-brand-grad text-white px-5 pt-4 pb-4">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-white/80">{L('Zona', 'Zone')} · {nama}</p>
            <p className="text-xl font-extrabold leading-tight line-clamp-2">{z.nama}</p>
            <div className="mt-3 flex items-center gap-3">
              {z.pic ? (
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <Avatar p={z.pic} size={40} ring />
                  <div className="min-w-0 leading-tight">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/75">Zone Leader</p>
                    <p className="text-sm font-bold truncate">{z.pic.nama}</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1" />
              )}
              {z.pastors.length ? (
                <div className="shrink-0 flex items-center gap-2" title={z.pastors.map((p) => p.nama).join(', ')}>
                  <div className="flex -space-x-2">
                    {z.pastors.slice(0, 3).map((p) => (
                      <Avatar key={p.id} p={p} size={30} ring />
                    ))}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/75">Pastor</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Daftar homecell */}
          <div className="s-card-body s-scroll space-y-2 !p-3">
            {z.homecells.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => show(h, z)}
                className="w-full text-left flex items-center gap-3 rounded-2xl border border-neutral-100 p-2.5 hover:border-brand-300 hover:bg-brand-50/60 transition group"
              >
                {h.pic ? (
                  <Avatar p={h.pic} size={42} />
                ) : (
                  <span className="w-[42px] h-[42px] shrink-0 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center">
                    <HousePlus className="w-5 h-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-neutral-900 leading-snug line-clamp-2 group-hover:text-brand-700">{h.nama}</p>
                  <p className="text-xs text-neutral-500 truncate">{h.pic ? h.pic.nama : L('PIC belum ditentukan', 'Leader to be announced')}</p>
                  {jadwal(h, z) ? <p className="mt-0.5 text-[11px] text-brand-700 font-semibold truncate">{jadwal(h, z)}</p> : null}
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                      <Baby className="w-3 h-3" />
                      {usia(h)}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        h.kategori === 'COUPLE'
                          ? 'bg-pink-50 text-pink-700'
                          : h.kategori === 'SINGLE'
                            ? 'bg-sky-50 text-sky-700'
                            : 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      <Heart className="w-3 h-3" />
                      {kategori(h)}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )),
    }));

  const hc = sel?.hc;
  const zona = sel?.zona;

  return (
    <>
      <GroupCarousel itemWidth="min(320px, 84vw)" itemH={480} showAll={false} groups={groups} />

      {hc && zona ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={hc.nama}>
          <div
            onClick={close}
            className={`absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px] transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
          />
          <aside
            className={`absolute right-0 top-0 h-full w-full sm:w-[440px] panel-fabric shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
              open ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="hero-fabric band-shadow text-white px-6 pt-5 pb-5 shrink-0 relative z-[1]">
              <button
                type="button"
                onClick={close}
                aria-label={L('Tutup', 'Close')}
                className="absolute right-4 top-4 w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="page-hero-badge !mb-2">
                <HousePlus className="w-3.5 h-3.5" />
                Homecell
              </div>
              <h2 className="text-2xl font-extrabold leading-tight pr-10 [overflow-wrap:anywhere]">{hc.nama}</h2>
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 border border-white/25 px-2.5 py-1 font-semibold">
                  {L('Zona', 'Zone')} {zona.nama}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 border border-white/25 px-2.5 py-1 font-semibold">
                  <Church className="w-3.5 h-3.5" />
                  {zona.cabang.nama}
                </span>
                {jadwal(hc, zona) ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white text-brand-700 px-2.5 py-1 font-bold">
                    <CalendarClock className="w-3.5 h-3.5" />
                    {jadwal(hc, zona)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
              {/* Pemimpin */}
              <section className="bg-white rounded-3xl border border-orange-100 p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-brand-600 mb-3">{L('Pemimpin', 'Leaders')}</h3>
                <div className="space-y-3">
                  <Leader role={L('PIC Homecell', 'Homecell Leader')} p={hc.pic} empty={L('Belum ditentukan', 'To be announced')} big />
                  <Leader role="Zone Leader" p={zona.pic} empty={L('Belum ditentukan', 'To be announced')} />
                  {zona.pastors.length ? (
                    zona.pastors.map((p) => <Leader key={p.id} role="Pastor" p={p} empty="" />)
                  ) : null}
                </div>
              </section>

              {/* Info */}
              <section className="bg-white rounded-3xl border border-orange-100 p-5 grid grid-cols-2 gap-3 text-sm">
                <Info Icon={CalendarClock} label={L('Jadwal', 'Schedule')} value={jadwal(hc, zona) || L('Menyesuaikan', 'Flexible')} />
                <Info Icon={Users} label={L('Anggota', 'Members')} value={String(hc.memberCount)} />
                <Info Icon={Baby} label={L('Usia', 'Age')} value={usia(hc)} />
                <Info Icon={Heart} label={L('Kategori', 'Category')} value={kategori(hc)} />
              </section>

              {hc.deskripsi ? (
                <section className="bg-white rounded-3xl border border-orange-100 p-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-brand-600 mb-2">{L('Tentang homecell', 'About this homecell')}</h3>
                  <p className="text-sm text-neutral-700 whitespace-pre-line leading-relaxed">{hc.deskripsi}</p>
                </section>
              ) : null}
            </div>

            <div className="shrink-0 p-5 pt-3 border-t border-orange-100 bg-white">
              <a href="https://elsapp.eccchurch.global" target="_blank" rel="noopener noreferrer" className="btn-primary w-full justify-center">
                <Smartphone className="w-4 h-4" />
                {L('Gabung lewat Els App', 'Join via Els App')}
              </a>
              <p className="mt-2 text-center text-xs text-neutral-500">
                {L('Permintaan bergabung & lokasi pertemuan tersedia di Els App.', 'Join requests & meeting locations are available in Els App.')}
              </p>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function Leader({ role, p, empty, big = false }: { role: string; p: HomecellPerson | null; empty: string; big?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {p ? (
        <Avatar p={p} size={big ? 56 : 44} />
      ) : (
        <span
          className="shrink-0 rounded-full bg-brand-50 text-brand-500 flex items-center justify-center"
          style={{ width: big ? 56 : 44, height: big ? 56 : 44 }}
        >
          <Users className="w-5 h-5" />
        </span>
      )}
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{role}</div>
        <div className={`font-bold text-neutral-900 truncate ${big ? 'text-base' : 'text-sm'}`}>{p ? p.nama : empty}</div>
      </div>
    </div>
  );
}

function Info({ Icon, label, value }: { Icon: typeof Users; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <span className="w-8 h-8 rounded-xl bg-brand-grad text-white flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <div className="text-[10.5px] font-bold uppercase tracking-wide text-neutral-500">{label}</div>
        <div className="font-semibold text-neutral-900 truncate">{value}</div>
      </div>
    </div>
  );
}
