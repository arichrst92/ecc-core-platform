'use client';

/**
 * Pengaturan pelayanan penggembalaan (homecell & zona). Sistem mengenali
 * pelayanan & role dari ID → pelayanan "Penggembalaan" dan role "Zone Leader" /
 * "Homecell Leader" / "Pastor" aman di-rename. Dipakai validasi & dropdown PIC
 * zona / homecell, import struktur homecell, dan tim pastoral di website.
 * API: GET/PATCH /admin/pelayanan/penggembalaan-config
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useMenuAccess } from '@/lib/use-menu-access';

type Cfg = {
  pelayananId: string | null;
  zoneLeaderRoleId: string | null;
  homecellLeaderRoleId: string | null;
  pastorRoleId: string | null;
};
type Pel = { id: string; nama: string; isActive?: boolean; roles?: { id: string; nama: string; level: number }[] };

export function PenggembalaanConfigPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const canWrite = useMenuAccess('pelayanan', 'write');
  const cfgQ = useQuery({
    queryKey: ['pelayanan', 'penggembalaan-config'],
    queryFn: async () => (await apiClient.get<{ data: Cfg }>('/admin/pelayanan/penggembalaan-config')).data.data,
  });
  const pelQ = useQuery({
    queryKey: ['pelayanan', 'options-with-roles-all'],
    queryFn: async () => (await apiClient.get<{ data: Pel[] }>('/admin/pelayanan', { params: { limit: 500 } })).data.data,
  });
  const [v, setV] = useState<Cfg>({ pelayananId: null, zoneLeaderRoleId: null, homecellLeaderRoleId: null, pastorRoleId: null });
  useEffect(() => {
    if (cfgQ.data) setV(cfgQ.data);
  }, [cfgQ.data]);

  const save = useMutation({
    mutationFn: async () => apiClient.patch('/admin/pelayanan/penggembalaan-config', v),
    onSuccess: () => {
      toast.success('Pengaturan penggembalaan disimpan');
      qc.invalidateQueries({ queryKey: ['pelayanan', 'penggembalaan-config'] });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal menyimpan'),
  });

  const pel = pelQ.data?.find((p) => p.id === v.pelayananId);
  const roles = [...(pel?.roles ?? [])].sort((a, b) => b.level - a.level);
  const sel = 'w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white disabled:bg-neutral-50';
  const roleSelect = (key: keyof Cfg, label: string, help: string) => (
    <label className="block">
      <span className="block text-sm font-medium text-neutral-700">{label}</span>
      <span className="block text-[11px] text-neutral-500 mb-1">{help}</span>
      <select
        className={sel}
        disabled={!canWrite || !pel}
        value={v[key] ?? ''}
        onChange={(e) => setV((c) => ({ ...c, [key]: e.target.value || null }))}
      >
        <option value="">— belum dipilih —</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.nama} (level {r.level})
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="bg-white border border-brand-200 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-neutral-900">Pelayanan penggembalaan (homecell &amp; zona)</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Dipakai untuk syarat &amp; pilihan PIC zona / homecell, import struktur homecell, dan tim pastoral di website.
            Dikenali dari pilihan di sini — pelayanan &amp; role-nya boleh di-rename tanpa mengganggu.
          </p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-neutral-100" aria-label="Tutup">
          <X className="w-4 h-4" />
        </button>
      </div>
      {cfgQ.isLoading || pelQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat…
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block sm:col-span-2">
            <span className="block text-sm font-medium text-neutral-700">Pelayanan</span>
            <select
              className={sel}
              disabled={!canWrite}
              value={v.pelayananId ?? ''}
              onChange={(e) => setV({ pelayananId: e.target.value || null, zoneLeaderRoleId: null, homecellLeaderRoleId: null, pastorRoleId: null })}
            >
              <option value="">— belum dipilih —</option>
              {(pelQ.data ?? [])
                .filter((p) => p.isActive !== false || p.id === v.pelayananId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama}
                  </option>
                ))}
            </select>
          </label>
          {roleSelect('zoneLeaderRoleId', 'Role PIC zona', 'Syarat PIC Zona (dulu "Zone Leader").')}
          {roleSelect('homecellLeaderRoleId', 'Role PIC homecell', 'Syarat PIC Homecell (dulu "Homecell Leader").')}
          {roleSelect('pastorRoleId', 'Role pastor', 'Pastor zona yang otomatis ditambahkan saat import struktur homecell.')}
        </div>
      )}
      {canWrite ? (
        <div className="flex justify-end">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !v.pelayananId || !v.zoneLeaderRoleId || !v.homecellLeaderRoleId}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Simpan
          </button>
        </div>
      ) : null}
    </div>
  );
}
