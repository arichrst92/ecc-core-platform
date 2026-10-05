'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  MessageCircle,
  Power,
  PowerOff,
  Save,
  Send,
  ChevronDown,
  ChevronRight,
  Info,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface WaConfig {
  id: string;
  type: string;
  label: string;
  description: string | null;
  category: string;
  isEnabled: boolean;
  template: string;
  placeholders: string[];
  updatedAt: string;
}

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  AUTH: { label: 'Auth / Login', color: 'from-neutral-700 to-neutral-900' },
  IBADAH: { label: 'Ibadah', color: 'from-indigo-500 to-indigo-700' },
  EVENT: { label: 'Event', color: 'from-orange-500 to-amber-500' },
  FAMILY: { label: 'Keluarga', color: 'from-pink-500 to-rose-500' },
  GROUP: { label: 'Group / Komunitas', color: 'from-purple-500 to-fuchsia-600' },
  MINISTRY: { label: 'Pelayanan', color: 'from-emerald-500 to-green-600' },
  BIRTHDAY: { label: 'Ulang Tahun', color: 'from-amber-500 to-yellow-500' },
};

export default function WaConfigPage() {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['wa-config'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: WaConfig[] }>('/admin/wa-config');
      return res.data.data;
    },
  });

  const configs = q.data ?? [];
  const grouped = configs.reduce<Record<string, WaConfig[]>>((acc, c) => {
    (acc[c.category] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
          <MessageCircle className="w-6 h-6 text-emerald-600" />
          Konfigurasi Notifikasi WhatsApp
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Aktifkan/matikan WA notif per jenis event + edit template pesannya. Perubahan langsung berlaku (cache 60s).
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 text-xs text-blue-900 flex items-start gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          Gunakan placeholder <code className="bg-white px-1 rounded">{'{nama}'}</code>, <code className="bg-white px-1 rounded">{'{event_judul}'}</code>, dll. — list placeholder tersedia per config.
          Button <strong>Test</strong> kirim pesan contoh ke nomor Anda (atau nomor yang di-override).
        </div>
      </div>

      {q.isLoading && <p className="text-sm text-neutral-500">Memuat…</p>}

      <div className="space-y-6">
        {Object.entries(grouped).map(([cat, items]) => {
          const meta = CATEGORY_META[cat] ?? { label: cat, color: 'from-neutral-500 to-neutral-700' };
          return (
            <div key={cat}>
              <h2 className={`inline-block text-sm font-semibold text-white bg-gradient-to-r ${meta.color} px-3 py-1 rounded-full mb-3`}>
                {meta.label}
              </h2>
              <div className="space-y-3">
                {items.map((c) => (
                  <ConfigCard key={c.id} config={c} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfigCard({ config }: { config: WaConfig }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState(config.template);
  const [testNoHp, setTestNoHp] = useState('');

  const toggleMut = useMutation({
    mutationFn: async () =>
      apiClient.patch(`/admin/wa-config/${config.type}`, {
        isEnabled: !config.isEnabled,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-config'] });
      toast.success(config.isEnabled ? 'Dinonaktifkan' : 'Diaktifkan');
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal'),
  });

  const saveMut = useMutation({
    mutationFn: async () =>
      apiClient.patch(`/admin/wa-config/${config.type}`, { template }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-config'] });
      toast.success('Template disimpan');
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal simpan'),
  });

  const testMut = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {};
      if (testNoHp.trim()) body.noHp = testNoHp.trim();
      return apiClient.post(`/admin/wa-config/${config.type}/test`, body);
    },
    onSuccess: (res: any) => {
      toast.success(`Test terkirim ke ${res.data.data.noHp}`);
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal test'),
  });

  return (
    <div
      className={`bg-white border rounded-xl overflow-hidden ${
        config.isEnabled ? 'border-emerald-200' : 'border-neutral-200'
      }`}
    >
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 flex-wrap gap-2">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          {open ? (
            <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-neutral-900 text-sm truncate">{config.label}</div>
            <div className="text-xs text-neutral-500 truncate">
              {config.description ?? config.type}
            </div>
          </div>
        </button>
        <button
          onClick={() => toggleMut.mutate()}
          disabled={toggleMut.isPending}
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 ${
            config.isEnabled
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          {config.isEnabled ? (
            <>
              <Power className="w-3.5 h-3.5" />
              Aktif
            </>
          ) : (
            <>
              <PowerOff className="w-3.5 h-3.5" />
              Nonaktif
            </>
          )}
        </button>
      </div>

      {open && (
        <div className="border-t border-neutral-100 p-4 sm:p-5 space-y-4">
          {config.placeholders.length > 0 && (
            <div className="text-xs text-neutral-500">
              Placeholder tersedia:{' '}
              {config.placeholders.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    const pos = (document.getElementById(`tmpl-${config.id}`) as HTMLTextAreaElement)?.selectionStart ?? template.length;
                    const token = `{${p}}`;
                    setTemplate(template.slice(0, pos) + token + template.slice(pos));
                  }}
                  className="inline-block bg-neutral-100 hover:bg-emerald-100 px-1.5 py-0.5 mr-1 mb-1 rounded font-mono text-[11px]"
                  title={`Insert {${p}}`}
                >
                  {`{${p}}`}
                </button>
              ))}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Template</label>
            <textarea
              id={`tmpl-${config.id}`}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2 justify-end">
            <input
              type="text"
              value={testNoHp}
              onChange={(e) => setTestNoHp(e.target.value)}
              placeholder="noHp test (kosong = nomor Anda)"
              className="px-3 py-2 border border-neutral-300 rounded-lg text-sm flex-1 min-w-0"
            />
            <button
              onClick={() => testMut.mutate()}
              disabled={testMut.isPending}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              Test Kirim
            </button>
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || template === config.template}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              Simpan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
