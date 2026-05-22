'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Smartphone,
  Loader2,
  Save,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Apple,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';

type Platform = 'IOS' | 'ANDROID';

interface AppVersionItem {
  id: string;
  platform: Platform;
  latestVersion: string;
  minSupportedVersion: string;
  releaseNotes: string | null;
  downloadUrl: string;
  isPublished: boolean;
  publishedAt: string | null;
  publishedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

const PLATFORM_LABEL: Record<Platform, string> = {
  IOS: 'iOS (App Store)',
  ANDROID: 'Android (Play Store)',
};

const PLATFORM_DEFAULT_URL: Record<Platform, string> = {
  IOS: 'https://apps.apple.com/id/app/ecc-global/',
  ANDROID: 'https://play.google.com/store/apps/details?id=asia.ide.ecc',
};

export default function AppVersionPage() {
  const qc = useQueryClient();
  const [activePlatform, setActivePlatform] = useState<Platform>('IOS');
  const [creating, setCreating] = useState(false);

  const listQ = useQuery({
    queryKey: ['app-version', 'list'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: AppVersionItem[] }>('/admin/app-version');
      return res.data.data;
    },
  });

  const rows = listQ.data ?? [];
  const platformRows = rows.filter((r) => r.platform === activePlatform);
  const publishedRow = platformRows.find((r) => r.isPublished);
  const draftRows = platformRows.filter((r) => !r.isPublished);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Smartphone className="w-6 h-6" />
            App Versions
          </h1>
          <p className="text-neutral-500 mt-1">
            Update prompt untuk mobile app. Cuma 1 row aktif per platform —
            saat publish baru, row lama auto-unpublish. Mobile cek via
            <code className="text-xs bg-neutral-100 px-1 rounded mx-1">
              GET /public/app-version
            </code>
            (no auth).
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          Versi Baru
        </button>
      </div>

      {/* Platform tabs */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="flex border-b border-neutral-200">
          {(['IOS', 'ANDROID'] as Platform[]).map((p) => (
            <button
              key={p}
              onClick={() => setActivePlatform(p)}
              className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition flex items-center justify-center gap-2 ${
                activePlatform === p
                  ? 'border-brand-500 text-brand-700 bg-brand-50/30'
                  : 'border-transparent text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {p === 'IOS' ? <Apple className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
              {PLATFORM_LABEL[p]}
            </button>
          ))}
        </div>

        {listQ.isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {publishedRow ? (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wider text-green-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Published (aktif untuk mobile)
                </div>
                <VersionRow
                  row={publishedRow}
                  onChanged={() => qc.invalidateQueries({ queryKey: ['app-version', 'list'] })}
                />
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  Belum ada versi published untuk {PLATFORM_LABEL[activePlatform]}.
                  Mobile akan return null tanpa prompt update. Klik "Versi Baru" untuk publish pertama.
                </span>
              </div>
            )}

            {draftRows.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">
                  History / Draft ({draftRows.length})
                </div>
                {draftRows.map((r) => (
                  <VersionRow
                    key={r.id}
                    row={r}
                    onChanged={() =>
                      qc.invalidateQueries({ queryKey: ['app-version', 'list'] })
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {creating && (
        <CreateModal
          defaultPlatform={activePlatform}
          onClose={() => setCreating(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['app-version', 'list'] });
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function VersionRow({
  row,
  onChanged,
}: {
  row: AppVersionItem;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(row.isPublished);
  const [deleting, setDeleting] = useState(false);

  const [latestVersion, setLatestVersion] = useState(row.latestVersion);
  const [minSupportedVersion, setMinSupportedVersion] = useState(row.minSupportedVersion);
  const [releaseNotes, setReleaseNotes] = useState(row.releaseNotes ?? '');
  const [downloadUrl, setDownloadUrl] = useState(row.downloadUrl);
  const [isPublished, setIsPublished] = useState(row.isPublished);

  useEffect(() => {
    setLatestVersion(row.latestVersion);
    setMinSupportedVersion(row.minSupportedVersion);
    setReleaseNotes(row.releaseNotes ?? '');
    setDownloadUrl(row.downloadUrl);
    setIsPublished(row.isPublished);
  }, [row]);

  const saveMut = useMutation({
    mutationFn: async () =>
      apiClient.patch(`/admin/app-version/${row.id}`, {
        latestVersion,
        minSupportedVersion,
        releaseNotes,
        downloadUrl,
        isPublished,
      }),
    onSuccess: () => {
      toast.success('Tersimpan');
      onChanged();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const deleteMut = useMutation({
    mutationFn: async () => apiClient.delete(`/admin/app-version/${row.id}`),
    onSuccess: () => {
      toast.success('Row dihapus');
      setDeleting(false);
      onChanged();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  return (
    <div
      className={`border rounded-lg ${
        row.isPublished ? 'border-green-200 bg-green-50/30' : 'border-neutral-200 bg-white'
      }`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          {row.isPublished ? (
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          ) : (
            <XCircle className="w-4 h-4 text-neutral-400" />
          )}
          <div>
            <div className="font-semibold text-sm text-neutral-900">
              v{row.latestVersion}
              <span className="text-xs text-neutral-500 font-normal ml-2">
                (min {row.minSupportedVersion})
              </span>
            </div>
            <div className="text-[11px] text-neutral-500">
              {row.publishedAt
                ? `Published ${new Date(row.publishedAt).toLocaleString('id-ID')}`
                : `Draft (created ${new Date(row.createdAt).toLocaleDateString('id-ID')})`}
            </div>
          </div>
        </div>
      </button>

      {open && (
        <div className="p-4 border-t border-neutral-100 space-y-3 bg-white rounded-b-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field
              label="Latest version"
              value={latestVersion}
              onChange={setLatestVersion}
              placeholder="1.2.0"
              mono
            />
            <Field
              label="Min supported"
              value={minSupportedVersion}
              onChange={setMinSupportedVersion}
              placeholder="1.0.0"
              mono
            />
          </div>
          <Field
            label="Download URL"
            value={downloadUrl}
            onChange={setDownloadUrl}
            placeholder="https://apps.apple.com/..."
          />
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">
              Release notes <span className="text-neutral-400">(plain text atau markdown)</span>
            </label>
            <textarea
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              rows={5}
              placeholder={'- Fix bug X\n- New feature Y'}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm font-mono"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="w-4 h-4 accent-brand-500"
            />
            <span className="text-neutral-700">
              Published{' '}
              <span className="text-xs text-neutral-500">
                (saat di-check, versi lain di platform yang sama auto-unpublish)
              </span>
            </span>
          </label>
          <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
            <button
              onClick={() => setDeleting(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Hapus
            </button>
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Simpan
            </button>
          </div>
        </div>
      )}

      <ConfirmDelete
        open={deleting}
        loading={deleteMut.isPending}
        onClose={() => setDeleting(false)}
        title="Hapus version row?"
        itemName={`${row.platform} v${row.latestVersion}`}
        onConfirm={() => deleteMut.mutate()}
      />
    </div>
  );
}

function CreateModal({
  defaultPlatform,
  onClose,
  onCreated,
}: {
  defaultPlatform: Platform;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [platform, setPlatform] = useState<Platform>(defaultPlatform);
  const [latestVersion, setLatestVersion] = useState('1.0.0');
  const [minSupportedVersion, setMinSupportedVersion] = useState('1.0.0');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [downloadUrl, setDownloadUrl] = useState(PLATFORM_DEFAULT_URL[defaultPlatform]);
  const [isPublished, setIsPublished] = useState(true);

  useEffect(() => {
    setDownloadUrl(PLATFORM_DEFAULT_URL[platform]);
  }, [platform]);

  const createMut = useMutation({
    mutationFn: async () =>
      apiClient.post('/admin/app-version', {
        platform,
        latestVersion,
        minSupportedVersion,
        releaseNotes,
        downloadUrl,
        isPublished,
      }),
    onSuccess: () => {
      toast.success(`Versi ${latestVersion} dibuat`);
      onCreated();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl pointer-events-auto max-h-[90vh] flex flex-col">
          <div className="px-6 py-4 border-b border-neutral-100">
            <h2 className="text-lg font-semibold text-neutral-900">Versi Aplikasi Baru</h2>
          </div>
          <div className="overflow-y-auto p-6 space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Platform</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 bg-white text-sm"
              >
                <option value="IOS">iOS (App Store)</option>
                <option value="ANDROID">Android (Play Store)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Latest version"
                value={latestVersion}
                onChange={setLatestVersion}
                placeholder="1.2.0"
                mono
              />
              <Field
                label="Min supported"
                value={minSupportedVersion}
                onChange={setMinSupportedVersion}
                placeholder="1.0.0"
                mono
              />
            </div>
            <Field label="Download URL" value={downloadUrl} onChange={setDownloadUrl} />
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                Release notes
              </label>
              <textarea
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
                rows={5}
                placeholder={'- Fix bug X\n- New feature Y'}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm font-mono"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="w-4 h-4 accent-brand-500"
              />
              <span className="text-neutral-700">Langsung publish (auto-unpublish versi lama)</span>
            </label>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onClose}
              disabled={createMut.isPending}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Batal
            </button>
            <button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {createMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Buat
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-600 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm ${
          mono ? 'font-mono' : ''
        }`}
      />
    </div>
  );
}
