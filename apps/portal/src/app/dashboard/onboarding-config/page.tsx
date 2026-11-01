'use client';

/**
 * Onboarding Config — role yang otomatis diberikan saat jemaat selesai
 * mendaftar / onboarding di app. Dulu hardcode "Jemaat → Jemaat Tetap / New Comer".
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, Loader2, Play, Plus, Save, Trash2, UserCheck, UserX } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

type Jenis = 'SEMUA' | 'JEMAAT_TETAP' | 'NEW_COMER' | 'TANPA_ROLE';

interface RoleCatalog {
  id: string;
  nama: string;
  subRoles: { id: string; nama: string; statuses: { id: string; nama: string }[] }[];
}
interface RuleRow {
  id: string;
  jenis: Jenis;
  role: { id: string; nama: string; isActive: boolean };
  subRole: { id: string; nama: string; isActive: boolean };
  subRoleStatus: { id: string; nama: string; isActive: boolean } | null;
}
interface Draft {
  key: string;
  jenis: Jenis;
  roleId: string;
  subRoleId: string;
  subRoleStatusId: string;
}

const SECTIONS: { jenis: Jenis; title: string; desc: string }[] = [
  {
    jenis: 'SEMUA',
    title: 'Semua pendaftar',
    desc: 'Diberikan ke setiap jemaat yang selesai mendaftar, apa pun pilihannya.',
  },
  {
    jenis: 'JEMAAT_TETAP',
    title: 'Memilih “Jemaat Tetap”',
    desc: 'Pilihan di layar daftar app. Juga dipakai saat login pertama jemaat yang datanya sudah ada tapi belum punya role.',
  },
  {
    jenis: 'NEW_COMER',
    title: 'Memilih “New Comer”',
    desc: 'Pilihan di layar daftar app untuk orang yang baru mengenal ECC.',
  },
  {
    jenis: 'TANPA_ROLE',
    title: 'Sudah onboard, role masih kosong',
    desc: 'Untuk jemaat yang sudah menyelesaikan onboarding tapi belum punya role aktif. Diterapkan lewat tombol di bawah.',
  },
];

let seq = 0;
const newKey = () => `n${++seq}`;

export default function OnboardingConfigPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['onboarding-config'],
    queryFn: async () =>
      (await apiClient.get<{ data: { rules: RuleRow[]; roles: RoleCatalog[] } }>('/admin/onboarding-config')).data.data,
  });
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const tanpaRole = useQuery({
    queryKey: ['onboarding-config', 'tanpa-role'],
    queryFn: async () =>
      (
        await apiClient.get<{
          data: {
            count: number;
            sample: { id: string; namaLengkap: string; kode: string | null; cabang: { nama: string } }[];
            perCabang: { cabang: string; jumlah: number }[];
          };
        }>('/admin/onboarding-config/tanpa-role')
      ).data.data,
  });
  const apply = useMutation({
    mutationFn: async () =>
      (await apiClient.post<{ data: { jemaat: number; roles: number; gagal: number } }>('/admin/onboarding-config/tanpa-role/apply')).data.data,
    onSuccess: (r) => {
      toast.success(`${r.jemaat.toLocaleString('id-ID')} jemaat diberi role (${r.roles.toLocaleString('id-ID')} role)`);
      if (r.gagal > 0) toast.error(`${r.gagal.toLocaleString('id-ID')} jemaat gagal diproses — coba terapkan lagi.`);
      void qc.invalidateQueries({ queryKey: ['onboarding-config', 'tanpa-role'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Gagal menerapkan'),
  });

  useEffect(() => {
    if (q.data && drafts === null) {
      setDrafts(
        q.data.rules.map((r) => ({
          key: r.id,
          jenis: r.jenis,
          roleId: r.role.id,
          subRoleId: r.subRole.id,
          subRoleStatusId: r.subRoleStatus?.id ?? '',
        })),
      );
    }
  }, [q.data, drafts]);

  const roles = q.data?.roles ?? [];
  const roleMap = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const inactive = (q.data?.rules ?? []).filter((r) => !r.role.isActive || !r.subRole.isActive);

  const dirty = useMemo(() => {
    if (!q.data || !drafts) return false;
    const a = q.data.rules.map((r) => `${r.jenis}|${r.role.id}|${r.subRole.id}|${r.subRoleStatus?.id ?? ''}`).join(',');
    const b = drafts.map((d) => `${d.jenis}|${d.roleId}|${d.subRoleId}|${d.subRoleStatusId}`).join(',');
    return a !== b;
  }, [q.data, drafts]);

  const save = useMutation({
    mutationFn: async () => {
      const incomplete = (drafts ?? []).some((d) => !d.roleId || !d.subRoleId);
      if (incomplete) throw new Error('Lengkapi role & sub role di setiap baris (atau hapus barisnya).');
      return apiClient.put('/admin/onboarding-config', {
        rules: (drafts ?? []).map((d) => ({
          jenis: d.jenis,
          roleId: d.roleId,
          subRoleId: d.subRoleId,
          subRoleStatusId: d.subRoleStatusId || null,
        })),
      });
    },
    onSuccess: () => {
      toast.success('Onboarding Config tersimpan');
      setDrafts(null);
      void qc.invalidateQueries({ queryKey: ['onboarding-config'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Gagal menyimpan'),
  });

  function patch(key: string, p: Partial<Draft>) {
    setDrafts((ds) => (ds ?? []).map((d) => (d.key === key ? { ...d, ...p } : d)));
  }

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <UserCheck className="w-6 h-6" />
            Onboarding Config
          </h1>
          <p className="text-neutral-500 mt-1">
            Role yang otomatis diberikan saat jemaat selesai mendaftar / onboarding di aplikasi.
          </p>
        </div>
        <button
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg font-medium text-sm"
        >
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Simpan
        </button>
      </div>

      <div className="mb-4 flex gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          Berlaku untuk pendaftaran <b>baru</b> setelah disimpan; jemaat yang sudah terdaftar tidak berubah. Kalau tidak ada
          aturan sama sekali, jemaat baru tidak mendapat role apa pun (bisa diberikan manual di menu Jemaat).
        </div>
      </div>

      {inactive.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {inactive.length} aturan memakai role/sub role yang sudah nonaktif dan dilewati saat onboarding. Ganti atau hapus barisnya.
        </div>
      )}

      {q.isLoading || !drafts ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
          <Loader2 className="w-5 h-5 mx-auto animate-spin text-neutral-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {SECTIONS.map((sec) => {
            const rows = drafts.filter((d) => d.jenis === sec.jenis);
            return (
              <div key={sec.jenis} className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-100 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-neutral-900">{sec.title}</div>
                    <div className="text-xs text-neutral-500">{sec.desc}</div>
                  </div>
                  <button
                    onClick={() =>
                      setDrafts((ds) => [...(ds ?? []), { key: newKey(), jenis: sec.jenis, roleId: '', subRoleId: '', subRoleStatusId: '' }])
                    }
                    className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    <Plus className="w-4 h-4" /> Tambah role
                  </button>
                </div>
                {rows.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-neutral-400">Belum ada role untuk pilihan ini.</div>
                ) : (
                  <div className="divide-y divide-neutral-100">
                    {rows.map((d) => {
                      const role = roleMap.get(d.roleId);
                      const sub = role?.subRoles.find((s) => s.id === d.subRoleId);
                      return (
                        <div key={d.key} className="px-5 py-3 grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                          <select
                            value={d.roleId}
                            onChange={(e) => patch(d.key, { roleId: e.target.value, subRoleId: '', subRoleStatusId: '' })}
                            className="px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white"
                          >
                            <option value="">Pilih role…</option>
                            {roles.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.nama}
                              </option>
                            ))}
                          </select>
                          <select
                            value={d.subRoleId}
                            disabled={!role}
                            onChange={(e) => patch(d.key, { subRoleId: e.target.value, subRoleStatusId: '' })}
                            className="px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white disabled:opacity-50"
                          >
                            <option value="">Pilih sub role…</option>
                            {(role?.subRoles ?? []).map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.nama}
                              </option>
                            ))}
                          </select>
                          <select
                            value={d.subRoleStatusId}
                            disabled={!sub || sub.statuses.length === 0}
                            onChange={(e) => patch(d.key, { subRoleStatusId: e.target.value })}
                            className="px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white disabled:opacity-50"
                          >
                            <option value="">{sub && sub.statuses.length === 0 ? 'Tanpa status' : 'Status (opsional)'}</option>
                            {(sub?.statuses ?? []).map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.nama}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => setDrafts((ds) => (ds ?? []).filter((x) => x.key !== d.key))}
                            className="p-2 rounded hover:bg-red-50 text-neutral-500 hover:text-red-600 justify-self-end"
                            title="Hapus"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {sec.jenis === 'TANPA_ROLE' && (
                  <div className="px-5 py-3 border-t border-neutral-100 bg-amber-50/60">
                    {tanpaRole.isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
                    ) : tanpaRole.data && tanpaRole.data.count === 0 ? (
                      <div className="text-sm text-emerald-700">Semua jemaat yang sudah onboard sudah punya role.</div>
                    ) : tanpaRole.data ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm text-amber-900 inline-flex items-center gap-1.5">
                            <UserX className="w-4 h-4" />
                            <b>{tanpaRole.data.count.toLocaleString('id-ID')}</b> jemaat sudah onboard tapi role-nya kosong
                          </div>
                          <button
                            onClick={() => {
                              const n = tanpaRole.data!.count.toLocaleString('id-ID');
                              if (confirm(`Beri role sesuai aturan di atas ke ${n} jemaat? Jemaat yang sudah punya role tidak tersentuh.`)) apply.mutate();
                            }}
                            disabled={apply.isPending || dirty || rows.length === 0}
                            title={dirty ? 'Simpan perubahan aturan dulu' : rows.length === 0 ? 'Tambahkan aturan dulu' : undefined}
                            className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
                          >
                            {apply.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            Terapkan sekarang
                          </button>
                        </div>
                        {tanpaRole.data.perCabang.length > 0 && (
                          <div className="text-xs text-amber-800">
                            Per cabang: {tanpaRole.data.perCabang.map((p) => `${p.cabang} (${p.jumlah.toLocaleString('id-ID')})`).join(' · ')}
                          </div>
                        )}
                        <div className="text-xs text-amber-800">
                          Contoh:{' '}
                          {tanpaRole.data.sample.map((j, i) => (
                            <span key={j.id}>
                              {i > 0 ? ', ' : ''}
                              <a href={`/dashboard/jemaat/${j.id}`} className="underline hover:text-amber-950">
                                {j.namaLengkap}
                              </a>
                            </span>
                          ))}
                          {tanpaRole.data.count > tanpaRole.data.sample.length ? ', …' : ''}
                        </div>
                        {dirty ? <div className="text-xs text-amber-700">Simpan perubahan aturan dulu sebelum menerapkan.</div> : null}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
