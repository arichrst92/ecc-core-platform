'use client';

/**
 * Portal → WhatsApp Config → "Saluran notifikasi": per jenis notifikasi pilih
 * In-app / WhatsApp / Email / Email bila tanpa WhatsApp. Semua dimatikan = Off.
 * API: GET/PATCH /admin/wa-config/channels
 */
import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Bell, ChevronDown, ChevronUp, Loader2, Mail, MessageCircle, Smartphone } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

type Group = 'reminder' | 'ibadah_event' | 'family' | 'group' | 'homecell' | 'ministry' | 'rohani' | 'kids' | 'other';
interface Row {
  key: string;
  label: string;
  group: Group;
  supports: { inApp: boolean; whatsapp: boolean; email: boolean };
  inApp: boolean;
  whatsapp: boolean;
  waType: string | null;
  email: boolean;
  waFallbackEmail: boolean;
}
type Field = 'inApp' | 'whatsapp' | 'email' | 'waFallbackEmail';

const GROUP_LABEL: Record<Group, string> = {
  reminder: 'Pengingat & ucapan',
  ibadah_event: 'Ibadah, event & cabang',
  family: 'Keluarga',
  group: 'Group',
  homecell: 'Homecell',
  ministry: 'Ministry & pelayanan',
  rohani: 'Doa & perjalanan rohani',
  kids: 'Kids & poin',
  other: 'Lainnya',
};
const KEY = ['wa-config', 'channels'];

function Check({ on, disabled, onChange, title }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void; title: string }) {
  if (disabled) return <span className="text-neutral-300 text-xs" title="Tidak tersedia untuk jenis ini">—</span>;
  return (
    <input
      type="checkbox"
      checked={on}
      onChange={(e) => onChange(e.target.checked)}
      title={title}
      aria-label={title}
      className="w-4 h-4 accent-brand-600 cursor-pointer"
    />
  );
}

export function NotificationChannels() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: KEY,
    queryFn: async () => (await apiClient.get<{ data: Row[]; meta: { emailQueue: number } }>('/admin/wa-config/channels')).data,
  });
  const save = useMutation({
    mutationFn: async ({ key, field, value }: { key: string; field: Field; value: boolean }) =>
      (await apiClient.patch<{ data: Row }>(`/admin/wa-config/channels/${key}`, { [field]: value })).data.data,
    onSuccess: (row) => {
      qc.setQueryData<{ data: Row[]; meta: { emailQueue: number } }>(KEY, (old) =>
        old ? { ...old, data: old.data.map((r) => (r.key === row.key ? row : r)) } : old,
      );
      qc.invalidateQueries({ queryKey: ['wa-config'] });
      toast.success('Saluran notifikasi disimpan');
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal menyimpan'),
  });

  const grouped = useMemo(() => {
    const m = new Map<Group, Row[]>();
    for (const r of q.data?.data ?? []) m.set(r.group, [...(m.get(r.group) ?? []), r]);
    return [...m.entries()];
  }, [q.data]);

  const set = (r: Row, field: Field, value: boolean) => save.mutate({ key: r.key, field, value });

  return (
    <div className="bg-white border border-neutral-200 rounded-xl mb-6 overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full px-3 sm:px-5 py-4 flex items-start gap-3 text-left">
        <span className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
          <Bell className="w-5 h-5" />
        </span>
        <div className="flex-1">
          <h2 className="font-semibold text-neutral-900">Saluran notifikasi</h2>
          <p className="text-xs text-neutral-500">
            Pilih lewat mana tiap jenis notifikasi dikirim: di aplikasi (in-app), WhatsApp, dan/atau email. Tidak dicentang semua = notifikasi
            itu tidak dikirim.
          </p>
        </div>
        {save.isPending ? <Loader2 className="w-4 h-4 animate-spin text-neutral-400" /> : null}
        {open ? <ChevronUp className="w-5 h-5 text-neutral-400" /> : <ChevronDown className="w-5 h-5 text-neutral-400" />}
      </button>

      {open ? (
        <div className="border-t border-neutral-100">
          <div className="px-3 sm:px-5 py-3 bg-neutral-50 text-[11px] text-neutral-600 space-y-1">
            <p>
              <b>Email</b> = selalu kirim email (bila jemaat punya email). <b>Email bila tanpa WA</b> = email hanya untuk jemaat yang tidak punya nomor
              WhatsApp (mis. yang daftar dengan email). Email dikirim bertahap dan mengikuti pilihan pesan jemaat di Profil → Privasi.
            </p>
            <p>WhatsApp memakai template di bawah — template kosong tidak bisa dinyalakan.</p>
            {q.data?.meta.emailQueue ? <p>Antrean email saat ini: {q.data.meta.emailQueue.toLocaleString('id-ID')}</p> : null}
          </div>
          {q.isLoading ? (
            <div className="py-8 text-center">
              <Loader2 className="w-5 h-5 animate-spin mx-auto text-neutral-400" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-[11px] text-neutral-500 bg-white">
                  <tr className="border-b border-neutral-100">
                    <th className="text-left font-medium px-3 sm:px-5 py-2">Jenis</th>
                    <th className="font-medium px-2 py-2 w-20">
                      <span className="inline-flex items-center gap-1">
                        <Smartphone className="w-3.5 h-3.5" /> In-app
                      </span>
                    </th>
                    <th className="font-medium px-2 py-2 w-24">
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                      </span>
                    </th>
                    <th className="font-medium px-2 py-2 w-20">
                      <span className="inline-flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" /> Email
                      </span>
                    </th>
                    <th className="font-medium px-2 py-2 w-28">Email bila tanpa WA</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(([g, rows]) => (
                    <Fragment key={g}>
                      <tr className="bg-neutral-50/70">
                        <td colSpan={5} className="px-3 sm:px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                          {GROUP_LABEL[g]}
                        </td>
                      </tr>
                      {rows.map((r) => {
                        const off = !r.inApp && !r.whatsapp && !r.email && !r.waFallbackEmail;
                        return (
                          <tr key={r.key} className="border-b border-neutral-100 last:border-0">
                            <td className="px-3 sm:px-5 py-2">
                              <span className={off ? 'text-neutral-400' : 'text-neutral-900'}>{r.label}</span>
                              {off ? <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-500">Off</span> : null}
                            </td>
                            <td className="text-center px-2">
                              <Check on={r.inApp} disabled={!r.supports.inApp} onChange={(v) => set(r, 'inApp', v)} title={`In-app: ${r.label}`} />
                            </td>
                            <td className="text-center px-2">
                              <Check on={r.whatsapp} disabled={!r.supports.whatsapp} onChange={(v) => set(r, 'whatsapp', v)} title={`WhatsApp: ${r.label}`} />
                            </td>
                            <td className="text-center px-2">
                              <Check on={r.email} disabled={!r.supports.email} onChange={(v) => set(r, 'email', v)} title={`Email: ${r.label}`} />
                            </td>
                            <td className="text-center px-2">
                              <Check
                                on={r.waFallbackEmail}
                                disabled={!r.supports.email || r.email}
                                onChange={(v) => set(r, 'waFallbackEmail', v)}
                                title={`Email bila tanpa WhatsApp: ${r.label}`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
