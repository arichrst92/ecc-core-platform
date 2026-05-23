'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  KeyRound,
  Lock,
  Unlock,
  Loader2,
  Plus,
  Search,
  Eye,
  EyeOff,
  Copy,
  Edit2,
  Trash2,
  X,
  ExternalLink,
  Mail,
  User as UserIcon,
  Phone,
  Link2,
  RotateCcw,
  ShieldAlert,
  AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useDebounce } from '@/lib/use-debounce';
import { ConfirmDelete } from '@/components/crud/confirm-delete';

interface CredentialRow {
  id: string;
  nama: string;
  email: string | null;
  username: string | null;
  noHpTerdaftar: string | null;
  linkAkses: string | null;
  recoveryEmail: string | null;
  catatan: string | null;
  createdAt: string;
  updatedAt: string;
}

// =========================================================================
// PAGE
// =========================================================================
export default function CredentialPage() {
  // Master password disimpan in-memory only (lost on refresh).
  // Tidak di localStorage / sessionStorage supaya tidak persist accident.
  const [masterPwd, setMasterPwd] = useState<string | null>(null);

  if (!masterPwd) {
    return <UnlockPrompt onUnlocked={(pwd) => setMasterPwd(pwd)} />;
  }
  return <CredentialList masterPwd={masterPwd} onLock={() => setMasterPwd(null)} />;
}

// =========================================================================
// UNLOCK PROMPT
// =========================================================================
function UnlockPrompt({ onUnlocked }: { onUnlocked: (pwd: string) => void }) {
  const [pwd, setPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  const unlockMut = useMutation({
    mutationFn: async () => {
      await apiClient.post('/admin/credential/unlock', { password: pwd });
    },
    onSuccess: () => {
      toast.success('Akses ke Credential vault dibuka');
      onUnlocked(pwd);
    },
    onError: (err: any) => {
      const code = err?.response?.data?.error?.code;
      if (code === 'MASTER_ACCESS_NOT_CONFIGURED') {
        toast.error('CREDENTIAL_MASTER_PASSWORD belum di-set di server .env');
      } else {
        toast.error('Master password salah');
      }
    },
  });

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-8 text-center border-b border-amber-100">
          <div className="w-14 h-14 rounded-2xl bg-amber-500 text-white flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-neutral-900">Credential Vault Terkunci</h1>
          <p className="text-xs text-neutral-600 mt-2">
            Akses ke menu ini di-gate dengan master password (terpisah dari login portal).
            Hubungi DevOps kalau kamu lupa.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pwd) unlockMut.mutate();
          }}
          className="p-6 space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Master Password
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                placeholder="Masukkan master password"
                autoFocus
                className="w-full px-3 py-2.5 pr-10 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-neutral-700"
                aria-label={showPwd ? 'Sembunyikan' : 'Tampilkan'}
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={!pwd || unlockMut.isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg disabled:opacity-50"
          >
            {unlockMut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Unlock className="w-4 h-4" />
            )}
            Buka Akses
          </button>
          <div className="text-[11px] text-neutral-500 flex items-start gap-1.5">
            <ShieldAlert className="w-3 h-3 mt-0.5 shrink-0" />
            Password tidak disimpan di browser. Refresh halaman = kunci ulang.
          </div>
        </form>
      </div>
    </div>
  );
}

// =========================================================================
// CREDENTIAL LIST + CRUD
// =========================================================================
function CredentialList({
  masterPwd,
  onLock,
}: {
  masterPwd: string;
  onLock: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CredentialRow | null>(null);
  const [deleting, setDeleting] = useState<CredentialRow | null>(null);
  const [detail, setDetail] = useState<CredentialRow | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  // Helper: axios call dengan master password header
  const masterHeader = { 'X-Credential-Master': masterPwd };

  const listQ = useQuery({
    queryKey: ['credential', { page, debouncedSearch }],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 50, sortBy: 'nama', sortOrder: 'asc' };
      if (debouncedSearch) params.search = debouncedSearch;
      const res = await apiClient.get<{
        data: CredentialRow[];
        meta: { page: number; limit: number; total: number; totalPages: number };
      }>('/admin/credential', { params, headers: masterHeader });
      return res.data;
    },
    // Kalau master password berubah tidak refetch otomatis — user lock-out flow handle ini
    retry: (count, err: any) => {
      // Kalau 401 (master expired/wrong), force lock
      if (err?.response?.status === 401) {
        onLock();
        toast.error('Sesi vault kadaluarsa, masukkan password lagi.');
        return false;
      }
      return count < 1;
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) =>
      apiClient.delete(`/admin/credential/${id}`, { headers: masterHeader }),
    onSuccess: () => {
      toast.success('Credential dihapus');
      qc.invalidateQueries({ queryKey: ['credential'] });
      setDeleting(null);
      setDetail(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal hapus'),
  });

  const items = listQ.data?.data ?? [];
  const meta = listQ.data?.meta;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <KeyRound className="w-6 h-6 text-amber-500" />
            Credential Vault
          </h1>
          <p className="text-neutral-500 mt-1">
            Penyimpanan kredensial third-party (Fonnte, hosting panel, social media admin, dll).
            Akses di-gate dengan master password.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onLock}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 border border-neutral-300 hover:bg-neutral-50 rounded-lg"
            title="Kunci ulang vault"
          >
            <Lock className="w-3.5 h-3.5" />
            Kunci Vault
          </button>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            Tambah Credential
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4 flex items-center gap-2 max-w-md">
        <div className="flex-1 flex items-center gap-2 bg-white border border-neutral-300 rounded-lg px-3 focus-within:ring-2 focus-within:ring-brand-500">
          <Search className="w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Cari nama / email / username..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="flex-1 py-2 outline-none text-sm bg-transparent"
          />
        </div>
      </div>

      {/* List */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {listQ.isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-sm text-neutral-400 italic">
            {search ? 'Tidak ada credential cocok dengan pencarian.' : 'Vault kosong. Klik Tambah Credential untuk mulai.'}
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {items.map((c) => (
              <button
                key={c.id}
                onClick={() => setDetail(c)}
                className="w-full text-left px-4 py-3 hover:bg-neutral-50 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-neutral-900 truncate">{c.nama}</div>
                  <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    {c.email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {c.email}
                      </span>
                    )}
                    {c.username && !c.email && (
                      <span className="inline-flex items-center gap-1">
                        <UserIcon className="w-3 h-3" />
                        {c.username}
                      </span>
                    )}
                    {c.linkAkses && (
                      <span className="inline-flex items-center gap-1 text-brand-600">
                        <ExternalLink className="w-3 h-3" />
                        URL
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-neutral-400">
                  {new Date(c.updatedAt).toLocaleDateString('id-ID', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </div>
              </button>
            ))}
          </div>
        )}

        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-100 text-xs text-neutral-500">
            <div>
              Halaman {meta.page} dari {meta.totalPages} · {meta.total} total
            </div>
            <div className="flex gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 border border-neutral-300 rounded disabled:opacity-50 hover:bg-neutral-50"
              >
                ←
              </button>
              <button
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 border border-neutral-300 rounded disabled:opacity-50 hover:bg-neutral-50"
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {detail && (
        <DetailModal
          credential={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing(detail);
            setDetail(null);
          }}
          onDelete={() => {
            setDeleting(detail);
            setDetail(null);
          }}
        />
      )}

      {creating && (
        <CredentialFormModal
          masterPwd={masterPwd}
          onClose={() => setCreating(false)}
          onSuccess={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['credential'] });
          }}
        />
      )}

      {editing && (
        <CredentialFormModal
          masterPwd={masterPwd}
          existing={editing}
          onClose={() => setEditing(null)}
          onSuccess={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ['credential'] });
          }}
        />
      )}

      <ConfirmDelete
        open={!!deleting}
        loading={deleteMut.isPending}
        onClose={() => setDeleting(null)}
        title="Hapus credential?"
        itemName={deleting?.nama}
        onConfirm={() => deleting && deleteMut.mutate(deleting.id)}
      />

      {/* Footer hint */}
      <div className="mt-4 text-[11px] text-neutral-500 flex items-start gap-1.5">
        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
        Master password tidak disimpan — refresh atau klik Kunci Vault = lock kembali.
        Semua aktivitas (unlock, CRUD) di-audit log.
      </div>
    </div>
  );
}

// =========================================================================
// DETAIL MODAL — view + copy
// =========================================================================
function DetailModal({
  credential: c,
  onClose,
  onEdit,
  onDelete,
}: {
  credential: CredentialRow;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [showCatatan, setShowCatatan] = useState(false);

  function copy(value: string, label: string) {
    navigator.clipboard.writeText(value).then(
      () => toast.success(`${label} disalin`),
      () => toast.error('Gagal salin'),
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg pointer-events-auto max-h-[90vh] flex flex-col">
          <div className="flex items-start justify-between px-6 py-4 border-b border-neutral-100">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-neutral-900 truncate">{c.nama}</h2>
              <div className="text-[11px] text-neutral-500 mt-0.5">
                Diupdate {new Date(c.updatedAt).toLocaleString('id-ID')}
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto px-6 py-4 space-y-2.5">
            {c.email && (
              <Field label="Email" icon={Mail} value={c.email} onCopy={() => copy(c.email!, 'Email')} />
            )}
            {c.username && (
              <Field
                label="Username"
                icon={UserIcon}
                value={c.username}
                onCopy={() => copy(c.username!, 'Username')}
              />
            )}
            {c.noHpTerdaftar && (
              <Field
                label="No HP Terdaftar"
                icon={Phone}
                value={c.noHpTerdaftar}
                onCopy={() => copy(c.noHpTerdaftar!, 'No HP')}
              />
            )}
            {c.linkAkses && (
              <Field
                label="Link Akses"
                icon={Link2}
                value={c.linkAkses}
                isLink
                onCopy={() => copy(c.linkAkses!, 'Link')}
              />
            )}
            {c.recoveryEmail && (
              <Field
                label="Recovery Email"
                icon={RotateCcw}
                value={c.recoveryEmail}
                onCopy={() => copy(c.recoveryEmail!, 'Recovery Email')}
              />
            )}
            {c.catatan && (
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-neutral-700">Catatan</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setShowCatatan((v) => !v)}
                      className="text-[10px] text-neutral-500 hover:text-neutral-900 px-1.5 py-0.5 rounded hover:bg-neutral-200 inline-flex items-center gap-1"
                    >
                      {showCatatan ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {showCatatan ? 'Sembunyikan' : 'Tampilkan'}
                    </button>
                    <button
                      onClick={() => copy(c.catatan!, 'Catatan')}
                      className="text-[10px] text-neutral-500 hover:text-neutral-900 px-1.5 py-0.5 rounded hover:bg-neutral-200 inline-flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      Salin
                    </button>
                  </div>
                </div>
                <div
                  className={`text-xs font-mono text-neutral-700 whitespace-pre-wrap break-all ${
                    showCatatan ? '' : 'blur-sm select-none'
                  }`}
                >
                  {c.catatan}
                </div>
              </div>
            )}

            {!c.email &&
              !c.username &&
              !c.noHpTerdaftar &&
              !c.linkAkses &&
              !c.recoveryEmail &&
              !c.catatan && (
                <div className="text-sm text-neutral-400 italic text-center py-6">
                  Belum ada detail. Klik Edit untuk isi.
                </div>
              )}
          </div>

          <div className="flex justify-between gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onDelete}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg"
            >
              <Trash2 className="w-4 h-4" />
              Hapus
            </button>
            <button
              onClick={onEdit}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg"
            >
              <Edit2 className="w-4 h-4" />
              Edit
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  icon: Icon,
  value,
  isLink,
  onCopy,
}: {
  label: string;
  icon: typeof Mail;
  value: string;
  isLink?: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-neutral-700 flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-neutral-500" />
          {label}
        </span>
        <button
          onClick={onCopy}
          className="text-[10px] text-neutral-500 hover:text-neutral-900 px-1.5 py-0.5 rounded hover:bg-neutral-200 inline-flex items-center gap-1"
        >
          <Copy className="w-3 h-3" />
          Salin
        </button>
      </div>
      {isLink ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-brand-600 hover:underline break-all"
        >
          {value}
        </a>
      ) : (
        <div className="text-sm text-neutral-900 break-all font-mono">{value}</div>
      )}
    </div>
  );
}

// =========================================================================
// FORM MODAL — create + edit
// =========================================================================
function CredentialFormModal({
  masterPwd,
  existing,
  onClose,
  onSuccess,
}: {
  masterPwd: string;
  existing?: CredentialRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [nama, setNama] = useState(existing?.nama ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [username, setUsername] = useState(existing?.username ?? '');
  const [noHpTerdaftar, setNoHpTerdaftar] = useState(existing?.noHpTerdaftar ?? '');
  const [linkAkses, setLinkAkses] = useState(existing?.linkAkses ?? '');
  const [recoveryEmail, setRecoveryEmail] = useState(existing?.recoveryEmail ?? '');
  const [catatan, setCatatan] = useState(existing?.catatan ?? '');

  const isEdit = !!existing;

  const submitMut = useMutation({
    mutationFn: async () => {
      const body = {
        nama: nama.trim(),
        email: email.trim() || undefined,
        username: username.trim() || undefined,
        noHpTerdaftar: noHpTerdaftar.trim() || undefined,
        linkAkses: linkAkses.trim() || undefined,
        recoveryEmail: recoveryEmail.trim() || undefined,
        catatan: catatan.trim() || undefined,
      };
      const headers = { 'X-Credential-Master': masterPwd };
      if (isEdit) {
        await apiClient.patch(`/admin/credential/${existing.id}`, body, { headers });
      } else {
        await apiClient.post('/admin/credential', body, { headers });
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Credential diperbarui' : 'Credential ditambahkan');
      onSuccess();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message ?? 'Gagal simpan';
      toast.error(msg);
    },
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg pointer-events-auto max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="text-lg font-semibold text-neutral-900">
              {isEdit ? 'Edit Credential' : 'Tambah Credential'}
            </h2>
            <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (nama.trim()) submitMut.mutate();
            }}
            className="overflow-y-auto p-6 space-y-3"
          >
            <FormField label="Nama Credential" required>
              <input
                type="text"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                placeholder="mis. Fonnte WhatsApp Gateway"
                autoFocus
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              />
            </FormField>
            <FormField label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              />
            </FormField>
            <FormField label="Username">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              />
            </FormField>
            <FormField label="No HP Terdaftar">
              <input
                type="text"
                value={noHpTerdaftar}
                onChange={(e) => setNoHpTerdaftar(e.target.value)}
                placeholder="+62812345678 (WA bisnis)"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              />
            </FormField>
            <FormField label="Link Akses">
              <input
                type="url"
                value={linkAkses}
                onChange={(e) => setLinkAkses(e.target.value)}
                placeholder="https://dashboard.fonnte.com"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              />
            </FormField>
            <FormField label="Recovery Email">
              <input
                type="email"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                placeholder="recovery@example.com"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              />
            </FormField>
            <FormField label="Catatan (password, 2FA codes, tips login, dll)">
              <textarea
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                rows={5}
                placeholder="Sensitive — disimpan sebagai catatan bebas"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm font-mono"
              />
            </FormField>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
              <button
                type="button"
                onClick={onClose}
                disabled={submitMut.isPending}
                className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitMut.isPending || !nama.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
              >
                {submitMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {isEdit ? 'Simpan Perubahan' : 'Tambah'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-neutral-700 mb-1 block">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
