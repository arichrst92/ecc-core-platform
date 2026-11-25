'use client';

/**
 * Portal → WhatsApp & Email Config → "Email (SendGrid)".
 * Status koneksi SendGrid (kunci API, pengirim terverifikasi, kredit, statistik 7 hari),
 * pengaturan pengirim (alamat, nama, balasan ke) tanpa ubah .env, dan tes kirim email.
 * Kunci API tetap di .env (SENDGRID_API_KEY).
 * API: GET/PATCH /admin/wa-config/email, POST /admin/wa-config/email/test
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Loader2, Mail, RefreshCw, Save, Send, XCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface SendLog {
  at: string;
  to: string;
  subject: string;
  error?: string;
}
interface EmailView {
  settings: { emailFromAddress: string | null; emailFromName: string | null; emailReplyTo: string | null };
  env: { emailFrom: string | null; emailFromName: string | null };
  status:
    | { configured: boolean; keyValid: false; error: string }
    | {
        configured: true;
        keyValid: true;
        canSend: boolean;
        sender: { email: string; name: string; replyTo: string | null; source: { email: string; name: string } };
        senderCheck: { verified: boolean | null; via: string | null; note?: string };
        credits: { remain: number; total: number; used: number; next_reset?: string; reset_frequency?: string } | null;
        stats7: { requests: number; delivered: number; bounces: number; blocks: number; spamReports: number; invalidEmails: number; deferred: number } | null;
      };
  health: { sent: number; failed: number; lastOk: SendLog | null; lastFail: SendLog | null; since: string };
  queue: number;
}

const KEY = ['wa-config', 'email'];
const errMsg = (e: unknown, f = 'Gagal') => (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? f;
const fmt = (iso: string) => new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
const SRC: Record<string, string> = { portal: 'diatur di Portal', env: 'dari .env', default: 'bawaan' };

export function EmailSettings() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: KEY,
    queryFn: async () => (await apiClient.get<{ data: EmailView }>('/admin/wa-config/email')).data.data,
    refetchInterval: 120_000,
  });
  const d = q.data;
  const [from, setFrom] = useState('');
  const [name, setName] = useState('');
  const [reply, setReply] = useState('');
  const [testTo, setTestTo] = useState('');
  useEffect(() => {
    if (!d) return;
    setFrom(d.settings.emailFromAddress ?? '');
    setName(d.settings.emailFromName ?? '');
    setReply(d.settings.emailReplyTo ?? '');
  }, [d?.settings.emailFromAddress, d?.settings.emailFromName, d?.settings.emailReplyTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async () =>
      (await apiClient.patch<{ data: EmailView }>('/admin/wa-config/email', { emailFromAddress: from, emailFromName: name, emailReplyTo: reply })).data.data,
    onSuccess: (v) => {
      qc.setQueryData(KEY, v);
      toast.success('Pengirim email disimpan — langsung berlaku');
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menyimpan'), { duration: 8000 }),
  });
  const test = useMutation({
    mutationFn: async () =>
      (await apiClient.post<{ data: { ok: boolean; to: string; error?: string; view: EmailView } }>('/admin/wa-config/email/test', testTo.trim() ? { to: testTo.trim() } : {}))
        .data.data,
    onSuccess: (r) => {
      qc.setQueryData(KEY, r.view);
      if (r.ok) toast.success(`Email tes terkirim ke ${r.to} — cek Inbox / Spam`, { duration: 6000 });
      else toast.error(`Tes gagal: ${r.error}`, { duration: 9000 });
    },
    onError: (e) => toast.error(errMsg(e, 'Tes gagal'), { duration: 8000 }),
  });

  const st = d?.status;
  const ok = !!st && st.keyValid && st.canSend && st.senderCheck.verified !== false;
  const dirty = !!d && (from !== (d.settings.emailFromAddress ?? '') || name !== (d.settings.emailFromName ?? '') || reply !== (d.settings.emailReplyTo ?? ''));
  const inputCls = 'w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm';

  return (
    <div className="bg-white border border-neutral-200 rounded-xl mb-6 overflow-hidden">
      <div className="px-3 sm:px-5 py-4 flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
          <Mail className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-neutral-900">Email (SendGrid)</h2>
            {q.isLoading ? (
              <span className="text-xs text-neutral-500">Memeriksa…</span>
            ) : (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {ok ? 'Tersambung' : 'Bermasalah'}
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500">OTP email, link masuk, notifikasi email, pengumuman, dan laporan cadangan dikirim lewat SendGrid.</p>
        </div>
        <button type="button" onClick={() => q.refetch()} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500" title="Cek ulang">
          <RefreshCw className={`w-4 h-4 ${q.isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {d && st ? (
        <div className="border-t border-neutral-100 px-3 sm:px-5 py-4 space-y-4">
          {/* Status koneksi */}
          {!st.keyValid ? (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 flex gap-2">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{st.error}</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <StatusLine ok={st.canSend} label="Kunci API" text={st.canSend ? 'Valid — boleh mengirim email (mail.send)' : 'Valid, tetapi TIDAK punya izin mail.send'} />
              <StatusLine
                ok={st.senderCheck.verified}
                label="Pengirim"
                text={`${st.sender.name} <${st.sender.email}> — ${
                  st.senderCheck.verified ? `terverifikasi (${st.senderCheck.via})` : st.senderCheck.verified === false ? 'BELUM terverifikasi di SendGrid' : st.senderCheck.note ?? 'tidak bisa dicek'
                }`}
              />
              {st.credits ? (
                <StatusLine
                  ok={st.credits.remain > 0}
                  label="Kuota"
                  text={`Sisa ${st.credits.remain.toLocaleString('id-ID')} dari ${st.credits.total.toLocaleString('id-ID')}${st.credits.next_reset ? ` · reset ${st.credits.next_reset}` : ''}`}
                />
              ) : null}
              {st.stats7 ? (
                <StatusLine
                  ok={st.stats7.bounces + st.stats7.blocks + st.stats7.spamReports <= Math.max(5, st.stats7.requests * 0.05)}
                  label="7 hari"
                  text={`${st.stats7.requests.toLocaleString('id-ID')} dikirim · ${st.stats7.delivered.toLocaleString('id-ID')} sampai · ${st.stats7.bounces} pental · ${st.stats7.blocks} diblokir · ${st.stats7.spamReports} lapor spam`}
                />
              ) : null}
            </div>
          )}

          <div className="text-xs text-neutral-600 rounded-lg bg-neutral-50 p-3 space-y-1">
            <div>
              Sejak server dimulai ({fmt(d.health.since)}): <b>{d.health.sent}</b> terkirim · <b className={d.health.failed ? 'text-red-700' : ''}>{d.health.failed}</b> gagal
              {d.queue ? ` · antrean notifikasi email ${d.queue.toLocaleString('id-ID')}` : ''}
            </div>
            {d.health.lastOk ? (
              <div>
                Terakhir berhasil: {fmt(d.health.lastOk.at)} → {d.health.lastOk.to} ({d.health.lastOk.subject})
              </div>
            ) : null}
            {d.health.lastFail ? (
              <div className="text-red-700">
                Terakhir gagal: {fmt(d.health.lastFail.at)} → {d.health.lastFail.to}: {d.health.lastFail.error}
              </div>
            ) : null}
          </div>

          {/* Pengirim */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-neutral-700">Alamat pengirim</span>
              <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder={d.env.emailFrom ?? 'noreply@eccchurch.global'} className={inputCls} />
              <span className="text-[11px] text-neutral-500">
                {st.keyValid ? `Saat ini ${SRC[st.sender.source.email]}. ` : ''}Kosong = ikuti .env. Harus terverifikasi di SendGrid.
              </span>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-neutral-700">Nama pengirim</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={d.env.emailFromName ?? 'Elshaddai Creative Community'} className={inputCls} />
              <span className="text-[11px] text-neutral-500">Tampil di kotak masuk jemaat. Kosong = ikuti .env.</span>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-neutral-700">Balasan ke (opsional)</span>
              <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="mis. info@eccchurch.global" className={inputCls} />
              <span className="text-[11px] text-neutral-500">Bila jemaat menekan Balas. Kosong = ke alamat pengirim.</span>
            </label>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 justify-end">
            <input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="email tes (kosong = email akun Anda)"
              className="px-3 py-2 border border-neutral-300 rounded-lg text-sm flex-1 min-w-0"
            />
            <button
              type="button"
              onClick={() => test.mutate()}
              disabled={test.isPending || !st.keyValid}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              title={dirty ? 'Tes memakai pengirim yang tersimpan — simpan dulu bila ingin mencoba pengirim baru' : undefined}
            >
              {test.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Test Kirim Email
            </button>
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Simpan
            </button>
          </div>
          {dirty ? <p className="text-[11px] text-neutral-500 text-right -mt-2">Simpan dulu bila ingin menguji pengirim yang baru.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function StatusLine({ ok, label, text }: { ok: boolean | null; label: string; text: string }) {
  return (
    <div className="flex items-start gap-2">
      {ok === true ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
      ) : ok === false ? (
        <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
      )}
      <span className="text-neutral-700 min-w-0 break-words">
        <b className="text-neutral-900">{label}:</b> {text}
      </span>
    </div>
  );
}
