'use client';

/**
 * Developer Tools → API Access — token API pribadi Team IT Minister
 * (untuk otomasi & agentic AI) + konfigurasi role IT Minister yang boleh
 * memakai API. Backend: /admin/api-token.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Loader2, Plus, ShieldCheck, Trash2, UsersRound, AlertTriangle, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

interface TokenRow {
  id: string;
  nama: string;
  preview: string;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  owner?: { id: string; namaLengkap: string; kode: string | null };
}
interface MeData {
  eligible: boolean;
  allowedRoles: string[];
  myItRoles: { divisi: string; roleTitle: string }[];
  canManage: boolean;
  tokens: TokenRow[];
}
interface ConfigData {
  allowedRoles: string[];
  roles: string[];
  team: { roleTitle: string; divisi: string; jemaat: { id: string; namaLengkap: string } }[];
}

const ROLE_LABEL: Record<string, string> = {
  HEAD_IT_MINISTER: 'Head IT Minister',
  IT_COORDINATOR: 'IT Coordinator',
  HEAD_PRODUCT: 'Head Product',
  SPECIFIC_PRODUCT: 'Product (spesifik)',
  HEAD_DATA: 'Head Data',
  DATA_MEMBER: 'Data Member',
  HEAD_OPERATION: 'Head Operation',
  OPERATION_L0: 'Operation L0',
  OPERATION_L1: 'Operation L1',
  OPERATION_L2: 'Operation L2',
};
const label = (r: string) => ROLE_LABEL[r] ?? r;

const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const STATUS: Record<TokenRow['status'], { text: string; cls: string }> = {
  ACTIVE: { text: 'Aktif', cls: 'bg-green-100 text-green-700' },
  EXPIRED: { text: 'Kedaluwarsa', cls: 'bg-neutral-200 text-neutral-600' },
  REVOKED: { text: 'Dicabut', cls: 'bg-red-100 text-red-700' },
};

export default function ApiAccessPage() {
  const qc = useQueryClient();
  const [nama, setNama] = useState('');
  const [days, setDays] = useState<string>('90');
  const [created, setCreated] = useState<{ token: string; nama: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const meQ = useQuery({
    queryKey: ['api-token', 'me'],
    queryFn: async () => (await apiClient.get<{ data: MeData }>('/admin/api-token/me')).data.data,
  });
  const me = meQ.data;

  const cfgQ = useQuery({
    queryKey: ['api-token', 'config'],
    enabled: !!me?.canManage,
    queryFn: async () => (await apiClient.get<{ data: ConfigData }>('/admin/api-token/config')).data.data,
  });
  const allQ = useQuery({
    queryKey: ['api-token', 'all'],
    enabled: !!me?.canManage,
    queryFn: async () => (await apiClient.get<{ data: TokenRow[] }>('/admin/api-token/all')).data.data,
  });

  const createMut = useMutation({
    mutationFn: async () =>
      (
        await apiClient.post<{ data: TokenRow & { token: string } }>('/admin/api-token', {
          nama,
          expiresInDays: days === 'none' ? null : Number(days),
        })
      ).data.data,
    onSuccess: (t) => {
      setCreated({ token: t.token, nama: t.nama });
      setCopied(false);
      setNama('');
      qc.invalidateQueries({ queryKey: ['api-token'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal membuat token'),
  });

  const revokeMut = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/api-token/${id}`),
    onSuccess: () => {
      toast.success('Token dicabut');
      qc.invalidateQueries({ queryKey: ['api-token'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal mencabut token'),
  });

  const [roles, setRoles] = useState<string[] | null>(null);
  const curRoles = roles ?? cfgQ.data?.allowedRoles ?? [];
  const saveCfg = useMutation({
    mutationFn: async () => apiClient.put('/admin/api-token/config', { allowedRoles: curRoles }),
    onSuccess: () => {
      toast.success('Konfigurasi API Access disimpan');
      setRoles(null);
      qc.invalidateQueries({ queryKey: ['api-token'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal menyimpan'),
  });

  function revoke(t: TokenRow) {
    if (window.confirm(`Cabut token "${t.nama}"? Agen / skrip yang memakainya akan langsung ditolak.`)) revokeMut.mutate(t.id);
  }

  async function copy() {
    if (!created) return;
    await navigator.clipboard.writeText(created.token);
    setCopied(true);
    toast.success('Token disalin');
  }

  if (meQ.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
          <KeyRound className="w-6 h-6 text-brand-500" /> API Access
        </h1>
        <p className="text-neutral-500 mt-1 text-sm">
          Token API pribadi untuk otomasi & agentic AI (bulk insert / update / delete lewat API). Token bertindak atas nama
          Anda: hak aksesnya sama dengan Role Access Anda dan semua perubahan tercatat di Audit Log. Khusus Team IT Minister
          dengan role yang diizinkan. Panduan lengkap ada di{' '}
          <Link href="/dashboard/dev-download" className="text-brand-600 font-medium hover:underline">
            Download
          </Link>
          .
        </p>
      </div>

      {/* Token baru (tampil sekali) */}
      {created && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
          <p className="font-semibold text-green-800 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" /> Token "{created.nama}" dibuat
          </p>
          <p className="text-sm text-green-800 mt-1">
            Salin sekarang — token <b>tidak akan ditampilkan lagi</b>. Simpan sebagai secret (mis. variabel lingkungan
            <code className="mx-1 px-1 bg-white rounded">ECC_TOKEN</code>), jangan ditempel di prompt.
          </p>
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <code className="flex-1 min-w-0 break-all bg-white border border-green-200 rounded-lg px-3 py-2 text-sm font-mono">{created.token}</code>
            <button onClick={copy} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Tersalin' : 'Salin'}
            </button>
          </div>
          <p className="text-xs text-green-700 mt-2">
            Pakai: <code>Authorization: Bearer {'<token>'}</code> ke <code>/admin/*</code>. Uji dengan <code>GET /admin/me</code>.
          </p>
          <button onClick={() => setCreated(null)} className="mt-3 text-xs text-green-800 underline">
            Sudah saya simpan, tutup
          </button>
        </div>
      )}

      {/* Token saya */}
      <section className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-200 font-semibold text-sm">Token saya</div>
        <div className="p-5 space-y-4">
          {!me?.eligible ? (
            <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
              <div>
                Anda belum bisa membuat token API. Syarat: anggota aktif <b>Team IT Minister</b> dengan role yang diizinkan (
                {me?.allowedRoles.map(label).join(', ') || '—'}).
                {me?.myItRoles.length ? ` Role Anda saat ini: ${me.myItRoles.map((r) => label(r.roleTitle)).join(', ')}.` : ' Anda belum terdaftar di Team IT Minister.'}
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMut.mutate();
              }}
              className="flex flex-col sm:flex-row gap-2 sm:items-end"
            >
              <label className="flex-1">
                <span className="block text-xs text-neutral-500 font-medium mb-1">Nama token (untuk apa)</span>
                <input
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  placeholder="mis. Claude — update data jemaat Bandung"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
                />
              </label>
              <label>
                <span className="block text-xs text-neutral-500 font-medium mb-1">Berlaku</span>
                <select value={days} onChange={(e) => setDays(e.target.value)} className="px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white">
                  <option value="7">7 hari</option>
                  <option value="30">30 hari</option>
                  <option value="90">90 hari</option>
                  <option value="180">180 hari</option>
                  <option value="365">1 tahun</option>
                  <option value="none">Tanpa batas (tidak disarankan)</option>
                </select>
              </label>
              <button
                type="submit"
                disabled={nama.trim().length < 3 || createMut.isPending}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Buat token
              </button>
            </form>
          )}

          <TokenTable rows={me?.tokens ?? []} onRevoke={revoke} empty="Belum ada token." />
        </div>
      </section>

      {/* Konfigurasi */}
      {me?.canManage && (
        <section className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-200 font-semibold text-sm flex items-center gap-2">
            <UsersRound className="w-4 h-4" /> Konfigurasi: role Team IT Minister yang boleh memakai API
          </div>
          <div className="p-5">
            {cfgQ.isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {(cfgQ.data?.roles ?? []).map((r) => {
                    const members = (cfgQ.data?.team ?? []).filter((t) => t.roleTitle === r);
                    const on = curRoles.includes(r);
                    return (
                      <label
                        key={r}
                        className={`flex items-start gap-2.5 border rounded-xl p-3 cursor-pointer ${on ? 'border-brand-300 bg-brand-50/50' : 'border-neutral-200'}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-orange-500"
                          checked={on}
                          onChange={() => setRoles(on ? curRoles.filter((x) => x !== r) : [...curRoles, r])}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-neutral-900">{label(r)}</span>
                          <span className="block text-xs text-neutral-500 truncate">
                            {members.length ? members.map((m) => m.jemaat.namaLengkap).join(', ') : 'Belum ada anggota'}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => saveCfg.mutate()}
                    disabled={roles === null || saveCfg.isPending}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                  >
                    {saveCfg.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Simpan konfigurasi
                  </button>
                  <p className="text-xs text-neutral-500">
                    Role yang dicabut → token anggotanya langsung ditolak (maks. 1 menit). Anggota tim diatur di{' '}
                    <Link href="/dashboard/it-minister-team" className="underline">
                      Team IT Minister
                    </Link>
                    .
                  </p>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* Semua token */}
      {me?.canManage && (
        <section className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-200 font-semibold text-sm">Semua token</div>
          <div className="p-5">
            {allQ.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-neutral-400" /> : <TokenTable rows={allQ.data ?? []} onRevoke={revoke} showOwner empty="Belum ada token." />}
          </div>
        </section>
      )}

      <Link href="/dashboard/dev-download" className="inline-flex items-center gap-2 text-sm text-brand-600 font-medium hover:underline">
        <Download className="w-4 h-4" /> Unduh panduan Agentic AI & API Documentation
      </Link>
    </div>
  );
}

function TokenTable({ rows, onRevoke, showOwner, empty }: { rows: TokenRow[]; onRevoke: (t: TokenRow) => void; showOwner?: boolean; empty: string }) {
  if (!rows.length) return <p className="text-sm text-neutral-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-neutral-500 uppercase">
          <tr>
            <th className="py-2 pr-3 text-left">Nama</th>
            {showOwner && <th className="py-2 pr-3 text-left">Pemilik</th>}
            <th className="py-2 pr-3 text-left">Status</th>
            <th className="py-2 pr-3 text-left">Terakhir dipakai</th>
            <th className="py-2 pr-3 text-left">Berlaku sampai</th>
            <th className="py-2 text-right" />
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="py-2 pr-3">
                <div className="font-medium text-neutral-900">{t.nama}</div>
                <div className="text-xs text-neutral-400 font-mono">{t.preview}</div>
              </td>
              {showOwner && <td className="py-2 pr-3">{t.owner?.namaLengkap ?? '—'}</td>}
              <td className="py-2 pr-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS[t.status].cls}`}>{STATUS[t.status].text}</span>
              </td>
              <td className="py-2 pr-3 text-xs text-neutral-600">
                {fmt(t.lastUsedAt)}
                {t.lastUsedIp ? <div className="text-neutral-400">{t.lastUsedIp}</div> : null}
              </td>
              <td className="py-2 pr-3 text-xs text-neutral-600">{t.expiresAt ? fmt(t.expiresAt) : 'Tanpa batas'}</td>
              <td className="py-2 text-right">
                {t.status === 'ACTIVE' && (
                  <button onClick={() => onRevoke(t)} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-red-600 hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" /> Cabut
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
