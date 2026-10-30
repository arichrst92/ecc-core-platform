'use client';

/**
 * Compliance → Kirim Backup Bulanan. Setiap bulan server membuat backup
 * database terenkripsi lalu mengirim link unduh ke email penerima, supaya ada
 * salinan di luar server (kepatuhan no. 12).
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CloudUpload, Loader2, Lock, Mail, Plus, Save, Send, X, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

interface Cfg {
  isEnabled: boolean;
  recipients: string[];
  dayOfMonth: number;
  hour: number;
  linkValidDays: number;
  lastSentAt: string | null;
  lastStatus: 'SUCCESS' | 'FAILED' | null;
  lastError: string | null;
  lastFile: string | null;
  lastScheduledMonth: string | null;
  encryptionEnabled: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function BackupEmailPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['backup-email-config'],
    queryFn: async () => (await apiClient.get<{ data: Cfg }>('/admin/compliance/backup-email')).data.data,
    refetchInterval: (query) => (query.state.data && sending ? 5000 : false),
  });
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState<Omit<Cfg, 'lastSentAt' | 'lastStatus' | 'lastError' | 'lastFile' | 'lastScheduledMonth' | 'encryptionEnabled'> | null>(null);
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    if (q.data && !form) {
      const { isEnabled, recipients, dayOfMonth, hour, linkValidDays } = q.data;
      setForm({ isEnabled, recipients, dayOfMonth, hour, linkValidDays });
    }
  }, [q.data, form]);

  // Selesai kirim uji → berhenti memantau saat status berubah.
  const [sentAtBefore, setSentAtBefore] = useState<string | null>(null);
  useEffect(() => {
    if (sending && q.data?.lastSentAt && q.data.lastSentAt !== sentAtBefore) {
      setSending(false);
      if (q.data.lastStatus === 'SUCCESS') toast.success('Backup terkirim ke email penerima');
      else toast.error(q.data.lastError ?? 'Kirim backup gagal');
    }
  }, [q.data, sending, sentAtBefore]);

  const save = useMutation({
    mutationFn: async () => (await apiClient.put<{ data: Cfg }>('/admin/compliance/backup-email', form)).data.data,
    onSuccess: (d) => {
      toast.success('Pengaturan tersimpan');
      qc.setQueryData(['backup-email-config'], d);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal menyimpan'),
  });
  const sendNow = useMutation({
    mutationFn: async () => apiClient.post('/admin/compliance/backup-email/send-now'),
    onSuccess: () => {
      setSentAtBefore(q.data?.lastSentAt ?? null);
      setSending(true);
      toast('Membuat backup & mengirim email… bisa beberapa menit.');
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal memulai'),
  });

  if (q.isLoading || !form) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }
  const cfg = q.data!;
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  const addEmail = () => {
    const e = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) return toast.error('Email tidak valid');
    if (form.recipients.includes(e)) return setNewEmail('');
    set({ recipients: [...form.recipients, e] });
    setNewEmail('');
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
          <CloudUpload className="w-6 h-6" />
          Kirim Backup Bulanan
        </h1>
        <p className="text-neutral-500 mt-1">
          Setiap bulan server membuat backup database <b>terenkripsi</b> lalu mengirim <b>link unduh</b> ke email di bawah.
          Simpan file itu di luar server (Google Drive / harddisk gereja) sebagai cadangan.
        </p>
      </div>

      {!cfg.encryptionEnabled && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3 rounded-lg flex gap-2">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          DATA_ENCRYPTION_KEY belum di-set di server — backup tidak akan dikirim sampai enkripsi aktif.
        </div>
      )}

      <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-5">
        <label className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-neutral-900">Aktifkan kiriman bulanan</div>
            <div className="text-xs text-neutral-500">Bila dimatikan, backup tetap dibuat manual di Maintenance.</div>
          </div>
          <input type="checkbox" className="w-5 h-5 accent-orange-500" checked={form.isEnabled} onChange={(e) => set({ isEnabled: e.target.checked })} />
        </label>

        <div>
          <div className="text-sm font-semibold text-neutral-900 mb-1 flex items-center gap-1.5">
            <Mail className="w-4 h-4" /> Email penerima
          </div>
          <div className="flex flex-wrap gap-2 mb-2">
            {form.recipients.map((r) => (
              <span key={r} className="inline-flex items-center gap-1 text-xs bg-neutral-100 rounded-full pl-3 pr-1 py-1">
                {r}
                <button onClick={() => set({ recipients: form.recipients.filter((x) => x !== r) })} className="p-0.5 hover:bg-neutral-200 rounded-full">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {form.recipients.length === 0 && <span className="text-xs text-neutral-400">Belum ada penerima.</span>}
          </div>
          <div className="flex gap-2">
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEmail())}
              placeholder="nama@eccchurch.global"
              className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm"
            />
            <button onClick={addEmail} className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-neutral-300 rounded-lg hover:bg-neutral-50">
              <Plus className="w-4 h-4" /> Tambah
            </button>
          </div>
          <p className="text-[11px] text-neutral-500 mt-1">Maks. 10 penerima. Gunakan email pengurus yang dipercaya.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs font-medium text-neutral-600">
            Tanggal kirim
            <select value={form.dayOfMonth} onChange={(e) => set({ dayOfMonth: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm">
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>Tanggal {d}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-neutral-600">
            Jam (WIB)
            <select value={form.hour} onChange={(e) => set({ hour: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm">
              {Array.from({ length: 24 }, (_, h) => h).map((h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-neutral-600">
            Link berlaku
            <select value={form.linkValidDays} onChange={(e) => set({ linkValidDays: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm">
              {[1, 3, 7, 14, 30].map((d) => (
                <option key={d} value={d}>{d} hari</option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-neutral-100">
          <button
            onClick={() => sendNow.mutate()}
            disabled={sending || sendNow.isPending || !cfg.encryptionEnabled || cfg.recipients.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-40"
            title="Buat backup sekarang dan kirim ke penerima yang sudah tersimpan"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Kirim uji sekarang
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-40"
          >
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan
          </button>
        </div>
      </div>

      <div className="mt-4 bg-white border border-neutral-200 rounded-xl p-5 text-sm">
        <div className="font-semibold text-neutral-900 mb-2">Kiriman terakhir</div>
        {cfg.lastSentAt ? (
          <div className="space-y-1 text-neutral-700">
            <div className="flex items-center gap-2">
              {cfg.lastStatus === 'SUCCESS' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
              {cfg.lastStatus === 'SUCCESS' ? 'Berhasil' : 'Gagal'} · {new Date(cfg.lastSentAt).toLocaleString('id-ID')}
            </div>
            {cfg.lastFile && <div className="text-xs text-neutral-500">File: <code>{cfg.lastFile}</code></div>}
            {cfg.lastError && <div className="text-xs text-red-700">{cfg.lastError}</div>}
            {cfg.lastScheduledMonth && <div className="text-xs text-neutral-500">Kiriman terjadwal terakhir: {cfg.lastScheduledMonth}</div>}
          </div>
        ) : (
          <div className="text-neutral-500">Belum pernah dikirim.</div>
        )}
        <p className="text-[11px] text-neutral-500 mt-3">
          Bila server mati pada tanggal kirim, backup dikirim otomatis begitu server menyala lagi di bulan yang sama. Bila gagal,
          dicoba lagi tiap 6 jam.
        </p>
      </div>
    </div>
  );
}
