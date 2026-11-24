'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Loader2, Plus, Trash2, ShieldCheck } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { todayYmd } from '@/lib/dates';
import { MarkdownEditor } from '@/components/announcement/markdown-editor';

export type EventFormValues = {
  judul: string;
  slug?: string;
  ringkasan?: string;
  deskripsi: string;
  videoUrl?: string;
  tanggalMulai: string;
  tanggalSelesai?: string;
  jamMulai?: string;
  jamSelesai?: string;
  lokasi?: string;
  /** Link Google Maps / "lat, lng" — titik untuk cek radius self check-in. */
  mapsUrl?: string | null;
  sinodeId?: string;
  cabangId?: string;
  tipeBayar: 'GRATIS' | 'NOMINAL_TETAP' | 'NOMINAL_BEBAS';
  nominal?: number | string;
  bankNama?: string;
  bankNomor?: string;
  bankAtasNama?: string;
  quotaPeserta?: number | string;
  /** Grup sesi: kode sama di beberapa event → jemaat hanya bisa ikut satu. */
  grupSesi?: string | null;
  tags?: string[];
  butuhKehadiran?: boolean;
  /** Peserta boleh self check-in dari aplikasi (butuh butuhKehadiran). */
  allowSelfCheckin?: boolean;
  /** Rating & ulasan peserta dari tiket di app. */
  allowReview?: boolean;
  /** Radius self check-in (meter). '' / null = di mana saja. */
  selfCheckinRadiusM?: number | string | null;
  isPublished?: boolean;
  // Syarat role untuk daftar (salah satu cocok) + role yang diberikan ke peserta.
  // Tidak dikirim (undefined) kalau data role event belum termuat — supaya
  // edit dari list tidak menghapus syarat yang sudah ada.
  roleRequirements?: RoleTriple[];
  audiencePelayananIds?: string[];
  audiencePelayanan?: { pelayananId: string; minLevel: number | null; cabangId: string | null }[];
  grantRoleId?: string | null;
  grantSubRoleId?: string | null;
  grantSubRoleStatusId?: string | null;
};

type RoleTriple = { roleId: string; subRoleId: string | null; subRoleStatusId: string | null };

interface RoleOption {
  id: string;
  nama: string;
  subRoles: { id: string; nama: string; statuses: { id: string; nama: string }[] }[];
}

interface EventRoleConfig {
  roleRequirements: { roleId: string; subRoleId: string | null; subRoleStatusId: string | null }[];
  audiencePelayanan?: { minLevel?: number | null; cabangId?: string | null; cabang?: { id: string; nama: string } | null; pelayanan: { id: string; nama: string } }[];
  grantRoleId: string | null;
  grantSubRoleId: string | null;
  grantSubRoleStatusId: string | null;
}

const EMPTY_TRIPLE: RoleTriple = { roleId: '', subRoleId: null, subRoleStatusId: null };

interface Props {
  open: boolean;
  title: string;
  loading?: boolean;
  isEdit?: boolean;
  defaultValues?: Partial<EventFormValues>;
  onClose: () => void;
  onSubmit: (values: EventFormValues) => Promise<unknown>;
}

interface Sinode {
  id: string;
  nama: string;
}

interface CabangGereja {
  id: string;
  nama: string;
  sinodeId: string;
}

const EMPTY: EventFormValues = {
  judul: '',
  deskripsi: '',
  tanggalMulai: todayYmd(),
  tipeBayar: 'GRATIS',
  tags: [],
  butuhKehadiran: false,
  allowSelfCheckin: false,
  allowReview: true,
  isPublished: false,
};

function toDateInput(value?: string): string {
  if (!value) return '';
  // Handles both ISO datetime and YYYY-MM-DD
  return value.slice(0, 10);
}

export function EventFormModal({
  open,
  title,
  loading,
  isEdit,
  defaultValues,
  onClose,
  onSubmit,
}: Props) {
  const [values, setValues] = useState<EventFormValues>(EMPTY);
  const [tagsInput, setTagsInput] = useState('');
  const [reqs, setReqs] = useState<RoleTriple[]>([]);
  // Audiens level pelayanan (kosong = semua jemaat sesuai sinode/cabang).
  // Baris audiens: pelayanan + level minimal + cabang anggota (pelayanan boleh berulang untuk cabang/level lain).
  const [audPel, setAudPel] = useState<{ key: number; id: string; minLevel: number | null; cabangId: string | null }[]>([]);
  const [audPelOpen, setAudPelOpen] = useState(false);
  const [grant, setGrant] = useState<RoleTriple>(EMPTY_TRIPLE);
  const [roleConfigReady, setRoleConfigReady] = useState(false);
  const editId = isEdit ? ((defaultValues as { id?: string } | undefined)?.id ?? null) : null;

  const rolesQ = useQuery({
    queryKey: ['role', 'with-subroles'],
    enabled: open,
    queryFn: async () => (await apiClient.get<{ data: RoleOption[] }>('/admin/role')).data.data,
    staleTime: 5 * 60_000,
  });

  // Edit: data list belum berisi syarat role → ambil dari detail event.
  const roleConfigQ = useQuery({
    queryKey: ['event', 'role-config', editId],
    enabled: open && !!editId,
    queryFn: async () =>
      (await apiClient.get<{ data: EventRoleConfig }>(`/admin/event/${editId}`)).data.data,
  });

  useEffect(() => {
    if (!open) return;
    if (!editId) {
      setReqs([]);
      setAudPel([]);
      setGrant(EMPTY_TRIPLE);
      setRoleConfigReady(true);
      return;
    }
    setRoleConfigReady(false);
    const d = roleConfigQ.data;
    if (!d) return;
    setAudPel((d.audiencePelayanan ?? []).map((a, i) => ({ key: i + 1, id: a.pelayanan.id, minLevel: a.minLevel ?? null, cabangId: a.cabangId ?? null })));
    setReqs(
      (d.roleRequirements ?? []).map((r) => ({
        roleId: r.roleId,
        subRoleId: r.subRoleId,
        subRoleStatusId: r.subRoleStatusId,
      })),
    );
    setGrant({
      roleId: d.grantRoleId ?? '',
      subRoleId: d.grantSubRoleId,
      subRoleStatusId: d.grantSubRoleStatusId,
    });
    setRoleConfigReady(true);
  }, [open, editId, roleConfigQ.data]);

  // Reset state setiap modal dibuka. defaultValues mungkin punya `cabang`/`sinode`
  // object dari list endpoint — kita ekstrak id-nya saja.
  useEffect(() => {
    if (!open) return;
    if (defaultValues) {
      const dv = defaultValues as Record<string, unknown>;
      setValues({
        judul: (dv.judul as string) ?? '',
        slug: (dv.slug as string) ?? '',
        ringkasan: (dv.ringkasan as string) ?? '',
        deskripsi: (dv.deskripsi as string) ?? '',
        videoUrl: (dv.videoUrl as string) ?? '',
        tanggalMulai: toDateInput(dv.tanggalMulai as string),
        tanggalSelesai: toDateInput(dv.tanggalSelesai as string),
        jamMulai: (dv.jamMulai as string) ?? '',
        jamSelesai: (dv.jamSelesai as string) ?? '',
        lokasi: (dv.lokasi as string) ?? '',
        mapsUrl: (dv.mapsUrl as string) ?? '',
        sinodeId:
          (dv.sinodeId as string) ??
          ((dv.sinode as { id?: string } | null | undefined)?.id ?? ''),
        cabangId:
          (dv.cabangId as string) ??
          ((dv.cabang as { id?: string } | null | undefined)?.id ?? ''),
        tipeBayar: (dv.tipeBayar as EventFormValues['tipeBayar']) ?? 'GRATIS',
        nominal: (dv.nominal as number | string | undefined) ?? '',
        bankNama: (dv.bankNama as string) ?? '',
        bankNomor: (dv.bankNomor as string) ?? '',
        bankAtasNama: (dv.bankAtasNama as string) ?? '',
        quotaPeserta: (dv.quotaPeserta as number | string | undefined) ?? '',
        grupSesi: (dv.grupSesi as string | null | undefined) ?? '',
        tags: (dv.tags as string[]) ?? [],
        butuhKehadiran: (dv.butuhKehadiran as boolean) ?? false,
        allowSelfCheckin: (dv.allowSelfCheckin as boolean) ?? false,
        allowReview: (dv.allowReview as boolean) ?? true,
        selfCheckinRadiusM: (dv.selfCheckinRadiusM as number | null | undefined) ?? '',
        isPublished: (dv.isPublished as boolean) ?? false,
      });
      setTagsInput(((dv.tags as string[]) ?? []).join(', '));
    } else {
      setValues(EMPTY);
      setTagsInput('');
    }
  }, [open, defaultValues]);

  const sinodesQ = useQuery({
    queryKey: ['sinode', 'options'],
    enabled: open,
    queryFn: async () => {
      const res = await apiClient.get<{ data: Sinode[] }>('/admin/sinode', {
        params: { limit: 100 },
      });
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });

  const pelayananQ = useQuery({
    queryKey: ['pelayanan', 'options'],
    enabled: open,
    queryFn: async () =>
      (await apiClient.get<{ data: { id: string; nama: string; isActive?: boolean; roles?: { id: string; nama: string; level: number }[] }[] }>('/admin/pelayanan', { params: { limit: 500, isActive: true } })).data.data,
    staleTime: 60_000,
  });

  const allCabangQ = useQuery({
    queryKey: ['cabang', 'options', 'all'],
    enabled: open,
    queryFn: async () =>
      (await apiClient.get<{ data: { id: string; nama: string }[] }>('/admin/cabang', { params: { limit: 200 } })).data.data,
    staleTime: 5 * 60_000,
  });

  const cabangQ = useQuery({
    queryKey: ['cabang', 'options', values.sinodeId],
    enabled: open && !!values.sinodeId,
    queryFn: async () => {
      const res = await apiClient.get<{ data: CabangGereja[] }>('/admin/cabang', {
        params: { sinodeId: values.sinodeId, limit: 200 },
      });
      return res.data.data;
    },
  });

  // Grup sesi yang sedang dipakai (saran isian + daftar event di grup yang sama).
  // Hook HARUS sebelum `if (!open) return null` (urutan hook tetap — React #310).
  const grupQ = useQuery({
    queryKey: ['event', 'grup-sesi'],
    enabled: open,
    queryFn: async () =>
      (
        await apiClient.get<{
          data: { kode: string; events: { id: string; judul: string; jamMulai: string | null; tanggalMulai: string; cabang: string | null }[] }[];
        }>('/admin/event/grup-sesi')
      ).data.data,
  });
  if (!open) return null;

  function patch(p: Partial<EventFormValues>) {
    setValues((v) => ({ ...v, ...p }));
  }

  function handleSubmit() {
    // Parse tags dari CSV input
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const payload: EventFormValues = {
      ...values,
      tags,
      // Empty strings → undefined supaya schema z.union literal('') bisa di-handle
      slug: values.slug || undefined,
      ringkasan: (values.ringkasan ? values.ringkasan : isEdit ? null : undefined) as string | undefined,
      videoUrl: (values.videoUrl ? values.videoUrl : isEdit ? null : undefined) as string | undefined,
      tanggalSelesai: values.tanggalSelesai || undefined,
      jamMulai: values.jamMulai || undefined,
      jamSelesai: values.jamSelesai || undefined,
      lokasi: (values.lokasi ? values.lokasi : isEdit ? null : undefined) as string | undefined,
      // '' → null (hapus titik) saat edit; undefined saat create kosong.
      mapsUrl: (values.mapsUrl ? values.mapsUrl : isEdit ? null : undefined) as string | undefined,
      sinodeId: values.sinodeId || undefined,
      cabangId: values.cabangId || undefined,
      nominal: values.nominal === '' ? undefined : values.nominal,
      bankNama: (values.bankNama ? values.bankNama : isEdit ? null : undefined) as string | undefined,
      bankNomor: (values.bankNomor ? values.bankNomor : isEdit ? null : undefined) as string | undefined,
      bankAtasNama: (values.bankAtasNama ? values.bankAtasNama : isEdit ? null : undefined) as string | undefined,
      quotaPeserta: values.quotaPeserta === '' ? undefined : values.quotaPeserta,
      // '' → null (lepas dari grup) saat edit; undefined saat create kosong.
      grupSesi: values.grupSesi ? values.grupSesi : isEdit ? null : undefined,
    };
    if (roleConfigReady) {
      payload.roleRequirements = reqs.filter((r) => r.roleId);
      payload.audiencePelayanan = audPel.map((a) => ({ pelayananId: a.id, minLevel: a.minLevel, cabangId: a.cabangId }));
      payload.grantRoleId = grant.roleId || null;
      payload.grantSubRoleId = grant.roleId ? grant.subRoleId : null;
      payload.grantSubRoleStatusId = grant.roleId ? grant.subRoleStatusId : null;
    }
    onSubmit(payload).catch(() => {});
  }

  const grupKode = (values.grupSesi ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  const grupLain = grupKode
    ? (grupQ.data?.find((g) => g.kode === grupKode)?.events ?? []).filter((e) => e.id !== editId)
    : [];

  const needNominal = values.tipeBayar === 'NOMINAL_TETAP';
  const showNominalOptional = values.tipeBayar === 'NOMINAL_BEBAS';
  const isPaid = values.tipeBayar !== 'GRATIS';

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={loading ? undefined : onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl pointer-events-auto max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
            <button onClick={onClose} disabled={loading} className="p-1.5 hover:bg-neutral-100 rounded-lg disabled:opacity-50">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto p-6 space-y-6">
            {/* Section: Info dasar */}
            <Section title="Info Dasar">
              <Field label="Judul" required>
                <input
                  value={values.judul}
                  onChange={(e) => patch({ judul: e.target.value })}
                  className={inputCls}
                  placeholder="Mis. Retreat Pemuda 2026"
                />
              </Field>
              <Field label="Slug" helper="Auto kalau dikosongkan. Hanya huruf kecil + angka + tanda hubung.">
                <input
                  value={values.slug ?? ''}
                  onChange={(e) => patch({ slug: e.target.value })}
                  className={inputCls}
                  placeholder="retreat-pemuda-2026"
                />
              </Field>
              <Field label="Ringkasan" helper="Preview pendek di list/card.">
                <input
                  value={values.ringkasan ?? ''}
                  onChange={(e) => patch({ ringkasan: e.target.value })}
                  className={inputCls}
                />
              </Field>
              {/* Bukan <label>: tombol toolbar di dalam label ikut terpicu saat judul diklik. */}
              <div className="block">
                <span className="block text-sm font-medium text-neutral-700">
                  Deskripsi<span className="text-red-500 ml-1">*</span>
                </span>
                <span className="block text-[11px] text-neutral-500 mb-0.5">Isi detail event — tampil sama di Els App &amp; website.</span>
                <div className="mt-1">
                  <MarkdownEditor
                    value={values.deskripsi ?? ''}
                    onChange={(v) => patch({ deskripsi: v })}
                    rows={7}
                    placeholder={'Retreat pemuda 3 hari 2 malam.\n\n**Yang perlu dibawa**\n- Alkitab & alat tulis\n- Pakaian ganti'}
                  />
                </div>
              </div>
              <Field label="Video teaser (URL)" helper="YouTube / Vimeo / link mp4. Opsional.">
                <input
                  value={values.videoUrl ?? ''}
                  onChange={(e) => patch({ videoUrl: e.target.value })}
                  className={inputCls}
                  placeholder="https://youtube.com/..."
                />
              </Field>
            </Section>

            {/* Section: Waktu & Lokasi */}
            <Section title="Waktu & Lokasi">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tanggal Mulai" required>
                  <input
                    type="date"
                    value={toDateInput(values.tanggalMulai)}
                    onChange={(e) => patch({ tanggalMulai: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Tanggal Selesai" helper="Kosongkan kalau acara 1 hari.">
                  <input
                    type="date"
                    value={toDateInput(values.tanggalSelesai)}
                    onChange={(e) => patch({ tanggalSelesai: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Jam Mulai"
                  helper="Format HH:mm 24 jam. Kosongkan kalau acara seharian / festival tanpa jadwal jam spesifik."
                >
                  <input
                    type="time"
                    value={values.jamMulai ?? ''}
                    onChange={(e) => patch({ jamMulai: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field
                  label="Jam Selesai"
                  helper="Kosongkan kalau tidak ada estimasi selesai."
                >
                  <input
                    type="time"
                    value={values.jamSelesai ?? ''}
                    onChange={(e) => patch({ jamSelesai: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
              <Field label="Lokasi">
                <input
                  value={values.lokasi ?? ''}
                  onChange={(e) => patch({ lokasi: e.target.value })}
                  className={inputCls}
                  placeholder="Mis. Bali · Hotel XYZ"
                />
              </Field>
              <Field label="Titik lokasi (link Google Maps)">
                <input
                  value={values.mapsUrl ?? ''}
                  onChange={(e) => patch({ mapsUrl: e.target.value })}
                  className={inputCls}
                  placeholder="https://maps.app.goo.gl/… atau -6.2088, 106.8456"
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  Titik untuk cek radius self check-in. Kosong → memakai titik cabang (kalau ada).
                </p>
              </Field>
            </Section>

            {/* Section: Target Audience */}
            <Section title="Target Audience" helper="Kosongkan keduanya = global. Pilih cabang juga otomatis set sinode.">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sinode">
                  <select
                    value={values.sinodeId ?? ''}
                    onChange={(e) => patch({ sinodeId: e.target.value, cabangId: '' })}
                    className={inputCls}
                  >
                    <option value="">— global —</option>
                    {(sinodesQ.data ?? []).map((s) => (
                      <option key={s.id} value={s.id}>{s.nama}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Cabang">
                  <select
                    value={values.cabangId ?? ''}
                    onChange={(e) => patch({ cabangId: e.target.value })}
                    disabled={!values.sinodeId}
                    className={inputCls + ' disabled:opacity-50'}
                  >
                    <option value="">— semua cabang di sinode —</option>
                    {(cabangQ.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.nama}</option>
                    ))}
                  </select>
                </Field>
              </div>
              {/* Audiens level pelayanan — dibatasi lagi ke anggota pelayanan tertentu */}
              <div className="mt-3">
                <span className="block text-sm font-medium text-neutral-700">Pelayanan (opsional)</span>
                <span className="block text-[11px] text-neutral-500 mb-1">
                  Kosong = semua jemaat di sinode/cabang di atas. Dipilih = event hanya tampil di app & bisa diikuti anggota
                  aktif pelayanan tersebut (tidak tampil di website / mode tamu). Per baris bisa diatur level role minimal
                  (mis. level 5 ke atas) dan cabang anggota; ＋ untuk menambah pelayanan yang sama dengan cabang/level lain.
                </span>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {audPel.map(({ key, id, minLevel, cabangId }) => {
                    const pel = pelayananQ.data?.find((p) => p.id === id);
                    const nama = pel?.nama
                      ?? roleConfigQ.data?.audiencePelayanan?.find((a) => a.pelayanan.id === id)?.pelayanan.nama
                      ?? '…';
                    // Level role pelayanan (makin tinggi makin senior) — unik & urut naik.
                    const levels = [...new Map((pel?.roles ?? []).map((r) => [r.level, r])).values()].sort((a, b) => a.level - b.level);
                    return (
                      <span key={key} className="inline-flex flex-wrap items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-violet-50 border border-violet-200 text-xs font-medium text-violet-800">
                        {nama}
                        <select
                          value={minLevel === null ? '' : String(minLevel)}
                          onChange={(e) =>
                            setAudPel((cur) => cur.map((x) => (x.key === key ? { ...x, minLevel: e.target.value === '' ? null : Number(e.target.value) } : x)))
                          }
                          title="Level role pelayanan minimal yang bisa melihat event"
                          className="ml-1 bg-white border border-violet-200 rounded-full px-1.5 py-0.5 text-[11px] text-violet-800"
                        >
                          <option value="">semua anggota</option>
                          {levels.map((r) => (
                            <option key={r.level} value={r.level}>
                              {r.nama} (level {r.level}) ke atas
                            </option>
                          ))}
                          {minLevel !== null && !levels.some((r) => r.level === minLevel) ? (
                            <option value={minLevel}>level {minLevel} ke atas</option>
                          ) : null}
                        </select>
                        <select
                          value={cabangId ?? ''}
                          onChange={(e) => setAudPel((cur) => cur.map((x) => (x.key === key ? { ...x, cabangId: e.target.value || null } : x)))}
                          title="Cabang anggota pelayanan (Jemaat → cabang)"
                          className="bg-white border border-violet-200 rounded-full px-1.5 py-0.5 text-[11px] text-violet-800 max-w-[150px]"
                        >
                          <option value="">semua cabang</option>
                          {(allCabangQ.data ?? []).map((c) => (
                            <option key={c.id} value={c.id}>{c.nama}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          title="Tambah baris pelayanan ini untuk cabang / level lain"
                          onClick={() =>
                            setAudPel((cur) => [...cur, { key: Math.max(0, ...cur.map((x) => x.key)) + 1, id, minLevel, cabangId: null }])
                          }
                          className="w-4 h-4 rounded-full hover:bg-violet-200 flex items-center justify-center"
                          aria-label={`Tambah ${nama} untuk cabang lain`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setAudPel((cur) => cur.filter((x) => x.key !== key))}
                          className="w-4 h-4 rounded-full hover:bg-violet-200 flex items-center justify-center"
                          aria-label={`Hapus ${nama}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setAudPelOpen((v) => !v)}
                    disabled={!roleConfigReady}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-neutral-300 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    <Plus className="w-3 h-3" /> {audPel.length ? 'Tambah pelayanan' : 'Pilih pelayanan'}
                  </button>
                </div>
                {audPelOpen ? (
                  <div className="mt-2 max-h-48 overflow-y-auto border border-neutral-200 rounded-lg divide-y divide-neutral-100">
                    {(pelayananQ.data ?? [])
                      .filter((p) => p.isActive !== false)
                      .map((p) => {
                        const on = audPel.some((x) => x.id === p.id);
                        return (
                          <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-neutral-50">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() =>
                                setAudPel((cur) =>
                                  on
                                    ? cur.filter((x) => x.id !== p.id)
                                    : [...cur, { key: Math.max(0, ...cur.map((x) => x.key)) + 1, id: p.id, minLevel: null, cabangId: null }],
                                )
                              }
                              className="accent-brand-500"
                            />
                            {p.nama}
                          </label>
                        );
                      })}
                    {pelayananQ.isLoading ? <div className="px-3 py-2 text-xs text-neutral-500">Memuat pelayanan…</div> : null}
                  </div>
                ) : null}
              </div>
            </Section>

            {/* Section: Pembayaran */}
            <Section title="Pembayaran">
              <Field label="Tipe">
                <div className="flex gap-2">
                  <RadioCard
                    selected={values.tipeBayar === 'GRATIS'}
                    title="Gratis"
                    desc="Tidak ada pembayaran"
                    onClick={() => patch({ tipeBayar: 'GRATIS' })}
                  />
                  <RadioCard
                    selected={values.tipeBayar === 'NOMINAL_TETAP'}
                    title="Nominal Tetap"
                    desc="Admin tentukan jumlah wajib"
                    onClick={() => patch({ tipeBayar: 'NOMINAL_TETAP' })}
                  />
                  <RadioCard
                    selected={values.tipeBayar === 'NOMINAL_BEBAS'}
                    title="Sukarela"
                    desc="Jemaat tentukan, min opsional"
                    onClick={() => patch({ tipeBayar: 'NOMINAL_BEBAS' })}
                  />
                </div>
              </Field>
              {isPaid && (
                <>
                  <Field
                    label={needNominal ? 'Nominal (Rp)' : 'Nominal Minimum (opsional)'}
                    required={needNominal}
                  >
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={values.nominal ?? ''}
                      onChange={(e) => patch({ nominal: e.target.value })}
                      placeholder={showNominalOptional ? 'kosongkan kalau bebas' : '100000'}
                      className={inputCls}
                    />
                  </Field>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Nama Bank">
                      <input
                        value={values.bankNama ?? ''}
                        onChange={(e) => patch({ bankNama: e.target.value })}
                        placeholder="Mis. BCA"
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Nomor Rekening">
                      <input
                        value={values.bankNomor ?? ''}
                        onChange={(e) => patch({ bankNomor: e.target.value })}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Atas Nama">
                      <input
                        value={values.bankAtasNama ?? ''}
                        onChange={(e) => patch({ bankAtasNama: e.target.value })}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                  {!isEdit && (
                    <p className="text-xs text-neutral-500">
                      Upload gambar QRIS bisa dilakukan setelah event tersimpan, lewat halaman detail.
                    </p>
                  )}
                </>
              )}
            </Section>

            {/* Section: Quota & Tags */}
            <Section title="Quota & Tags">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quota Peserta" helper="Kosongkan = tanpa batas.">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={values.quotaPeserta ?? ''}
                    onChange={(e) => patch({ quotaPeserta: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Tags (CSV)" helper="Pisahkan dengan koma. Mis. youth, retreat, summer">
                  <input
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="mt-3">
                <Field
                  label="Grup sesi (opsional)"
                  helper="Isi kode yang sama di beberapa event (mis. 3 sesi Natal) → satu jemaat hanya bisa daftar di salah satunya. Kosongkan = tanpa batasan."
                >
                  <input
                    value={values.grupSesi ?? ''}
                    onChange={(e) => patch({ grupSesi: e.target.value })}
                    list="grup-sesi-options"
                    maxLength={80}
                    placeholder="mis. natal-profam-bandung-2026"
                    className={inputCls}
                  />
                  <datalist id="grup-sesi-options">
                    {(grupQ.data ?? []).map((g) => (
                      <option key={g.kode} value={g.kode}>
                        {g.events.map((e) => e.judul).join(' · ')}
                      </option>
                    ))}
                  </datalist>
                </Field>
                {grupKode && (
                  <p className="mt-1.5 text-xs text-neutral-600">
                    {grupLain.length ? (
                      <>
                        Satu grup dengan:{' '}
                        {grupLain.map((e, i) => (
                          <span key={e.id}>
                            {i ? ', ' : ''}
                            <strong>{e.judul}</strong>
                            {e.jamMulai ? ` (${e.jamMulai})` : ''}
                          </span>
                        ))}
                      </>
                    ) : (
                      <>Grup baru — isi kode yang sama persis (<code>{grupKode}</code>) di event sesi lainnya.</>
                    )}
                  </p>
                )}
              </div>
            </Section>

            {/* Kehadiran section */}
            <Section title="Kehadiran" helper="Aktifkan kalau event butuh absensi pada hari H.">
              <label className="flex items-start gap-2 cursor-pointer p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50">
                <input
                  type="checkbox"
                  checked={!!values.butuhKehadiran}
                  onChange={(e) =>
                    patch({ butuhKehadiran: e.target.checked, ...(e.target.checked ? {} : { allowSelfCheckin: false }) })
                  }
                  className="w-4 h-4 accent-brand-500 mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium text-neutral-900">
                    Event ini butuh kehadiran
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    Admin bisa scan QR kode jemaat di hari H untuk mark peserta sebagai HADIR.
                    Kalau tidak diaktifkan, lifecycle berhenti di DAFTAR / BAYAR — tidak ada absensi.
                  </div>
                </div>
              </label>
              <label
                className={`flex items-start gap-2 p-3 border border-neutral-200 rounded-lg mt-2 ${
                  values.butuhKehadiran ? 'cursor-pointer hover:bg-neutral-50' : 'opacity-50 cursor-not-allowed'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!values.allowSelfCheckin}
                  disabled={!values.butuhKehadiran}
                  onChange={(e) => patch({ allowSelfCheckin: e.target.checked })}
                  className="w-4 h-4 accent-brand-500 mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium text-neutral-900">Perbolehkan self check-in</div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    Peserta bisa check-in sendiri dari aplikasi (dirinya + keluarga yang terdaftar di event ini),
                    mulai 15 menit sebelum event sampai 30 menit setelah event selesai. Event berbayar: hanya peserta yang
                    pembayarannya sudah terverifikasi.
                  </div>
                </div>
              </label>
              {values.butuhKehadiran && values.allowSelfCheckin ? (
                <div className="mt-2 p-3 border border-neutral-200 rounded-lg space-y-2">
                  <div className="text-sm font-medium text-neutral-900">Lokasi self check-in</div>
                  <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input
                      type="radio"
                      checked={values.selfCheckinRadiusM === '' || values.selfCheckinRadiusM == null}
                      onChange={() => patch({ selfCheckinRadiusM: '' })}
                      className="accent-brand-500"
                    />
                    Di mana saja (tanpa cek lokasi)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer flex-wrap">
                    <input
                      type="radio"
                      checked={values.selfCheckinRadiusM !== '' && values.selfCheckinRadiusM != null}
                      onChange={() => patch({ selfCheckinRadiusM: 200 })}
                      className="accent-brand-500"
                    />
                    Dalam radius
                    <input
                      type="number"
                      min={10}
                      max={50000}
                      step={10}
                      disabled={values.selfCheckinRadiusM === '' || values.selfCheckinRadiusM == null}
                      value={values.selfCheckinRadiusM ?? ''}
                      onChange={(e) => patch({ selfCheckinRadiusM: e.target.value === '' ? 200 : Number(e.target.value) })}
                      className="w-24 px-2 py-1 border border-neutral-300 rounded text-sm disabled:bg-neutral-100"
                    />
                    meter dari titik lokasi
                  </label>
                  <p className="text-[11px] text-neutral-500">
                    Dengan radius, GPS HP peserta dicek. Di luar radius, peserta diarahkan ke usher untuk scan QR. Butuh
                    titik lokasi event (isi link Google Maps di bagian Lokasi) atau titik cabang.
                  </p>
                </div>
              ) : null}
              <label className="flex items-start gap-2 cursor-pointer p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 mt-2">
                <input
                  type="checkbox"
                  checked={values.allowReview !== false}
                  onChange={(e) => patch({ allowReview: e.target.checked })}
                  className="w-4 h-4 accent-brand-500 mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium text-neutral-900">Rating & ulasan peserta</div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    Aktif = peserta bisa memberi rating & ulasan dari tiket di app (mulai event dimulai sampai 14 hari setelah
                    selesai). Nonaktif = kartu ulasan tidak muncul di app.
                  </div>
                </div>
              </label>
            </Section>

            {/* Syarat & role peserta */}
            <Section
              title="Syarat & Role Peserta"
              helper="Batasi siapa yang boleh mendaftar, dan beri role otomatis ke peserta."
            >
              {!roleConfigReady ? (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat pengaturan role…
                </div>
              ) : (
                <>
                  <div className="p-3 border border-neutral-200 rounded-lg space-y-2">
                    <div className="text-sm font-medium text-neutral-900">Syarat pendaftaran</div>
                    <p className="text-[11px] text-neutral-500">
                      Jemaat harus punya role aktif yang cocok dengan <b>salah satu</b> baris. Sub-role / status
                      kosong = semua. Tanpa baris = terbuka untuk semua jemaat. Berlaku juga saat admin
                      mendaftarkan peserta.
                    </p>
                    {reqs.map((r, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <RoleTripleSelect
                          roles={rolesQ.data ?? []}
                          value={r}
                          optionalSub
                          onChange={(v) => setReqs((arr) => arr.map((x, j) => (j === i ? v : x)))}
                        />
                        <button
                          type="button"
                          onClick={() => setReqs((arr) => arr.filter((_, j) => j !== i))}
                          className="p-2 text-neutral-400 hover:text-red-600"
                          title="Hapus syarat"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setReqs((arr) => [...arr, EMPTY_TRIPLE])}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah syarat
                    </button>
                  </div>

                  <div className="p-3 border border-neutral-200 rounded-lg space-y-2">
                    <div className="text-sm font-medium text-neutral-900 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-brand-500" /> Role yang diberikan ke peserta
                    </div>
                    <p className="text-[11px] text-neutral-500">
                      Diberikan saat peserta {values.butuhKehadiran ? <b>HADIR (di-scan)</b> : <b>mendaftar</b>}
                      {values.butuhKehadiran ? '' : ' (event tanpa absensi)'}. Dicabut otomatis kalau peserta batal.
                      Kosongkan kalau tidak ada.
                    </p>
                    <RoleTripleSelect roles={rolesQ.data ?? []} value={grant} onChange={setGrant} />
                  </div>
                </>
              )}
            </Section>

            {/* Publish toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!values.isPublished}
                onChange={(e) => patch({ isPublished: e.target.checked })}
                className="w-4 h-4 accent-brand-500"
              />
              <span className="text-sm text-neutral-700">Publish event sekarang</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Batal
            </button>
            <button
              onClick={handleSubmit}
              disabled={
                loading ||
                !values.judul ||
                !values.deskripsi ||
                !values.tanggalMulai ||
                (!!grant.roleId && !grant.subRoleId)
              }
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? 'Simpan' : 'Buat Event'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function RoleTripleSelect({
  roles,
  value,
  onChange,
  optionalSub,
}: {
  roles: RoleOption[];
  value: RoleTriple;
  onChange: (v: RoleTriple) => void;
  /** true = sub-role boleh kosong (semua sub-role). */
  optionalSub?: boolean;
}) {
  const role = roles.find((r) => r.id === value.roleId);
  const sub = role?.subRoles.find((s) => s.id === value.subRoleId);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1">
      <select
        value={value.roleId}
        onChange={(e) => onChange({ roleId: e.target.value, subRoleId: null, subRoleStatusId: null })}
        className={inputCls}
      >
        <option value="">— role —</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.nama}
          </option>
        ))}
      </select>
      <select
        value={value.subRoleId ?? ''}
        onChange={(e) => onChange({ ...value, subRoleId: e.target.value || null, subRoleStatusId: null })}
        disabled={!role}
        className={`${inputCls} disabled:opacity-50`}
      >
        <option value="">{optionalSub ? 'Semua sub-role' : '— sub-role —'}</option>
        {(role?.subRoles ?? []).map((s) => (
          <option key={s.id} value={s.id}>
            {s.nama}
          </option>
        ))}
      </select>
      <select
        value={value.subRoleStatusId ?? ''}
        onChange={(e) => onChange({ ...value, subRoleStatusId: e.target.value || null })}
        disabled={!sub || sub.statuses.length === 0}
        className={`${inputCls} disabled:opacity-50`}
      >
        <option value="">{optionalSub ? 'Semua status' : 'Tanpa status'}</option>
        {(sub?.statuses ?? []).map((st) => (
          <option key={st.id} value={st.id}>
            {st.nama}
          </option>
        ))}
      </select>
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 bg-white text-sm';

function Section({
  title,
  helper,
  children,
}: {
  title: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-2">
        {title}
      </div>
      {helper && <p className="text-xs text-neutral-500 mb-2">{helper}</p>}
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  helper,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-neutral-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </span>
      {helper && <span className="block text-[11px] text-neutral-500 mb-0.5">{helper}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function RadioCard({
  selected,
  title,
  desc,
  onClick,
}: {
  selected: boolean;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 text-left p-2.5 rounded-lg border transition ${
        selected ? 'border-brand-500 bg-brand-50 text-brand-900' : 'border-neutral-200 hover:bg-neutral-50'
      }`}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-[11px] text-neutral-500 mt-0.5">{desc}</div>
    </button>
  );
}
