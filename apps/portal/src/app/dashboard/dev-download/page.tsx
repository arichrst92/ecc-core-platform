'use client';

/**
 * Developer Tools → Download — dokumentasi untuk developer & agentic AI.
 *
 * Semua dokumen dibuat otomatis dari kode saat diunduh:
 *   - Panduan Agentic AI, API Reference, Context Data Relations → core-api /admin/dev-docs
 *   - Workflow & Technical Documentation, User Guide → isi halaman Portal (lib/docs)
 *   - Paket lengkap (.md) → gabungan semuanya dalam satu file untuk dipelajari agen AI
 * PDF dibuat server (POST /admin/dev-docs/pdf untuk dokumen dari Portal).
 */
import { useState } from 'react';
import Link from 'next/link';
import { Bot, BookOpen, Database, Download, FileCode2, FileText, GitBranch, KeyRound, Loader2, Package, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { techDocsMarkdown, userGuideMarkdown } from '@/lib/docs/to-markdown';

type ServerDoc = 'agent-guide' | 'api' | 'relations';
interface DocDef {
  key: string;
  title: string;
  desc: string;
  icon: typeof FileText;
  file: string;
  server?: ServerDoc;
  local?: () => string;
}

const DOCS: DocDef[] = [
  {
    key: 'agent-guide',
    title: 'Panduan Agentic AI',
    desc: 'Cara autentikasi dengan token API pribadi, konvensi request/response, pola bulk insert/update/delete yang aman (dry-run → konfirmasi → eksekusi), aturan wajib untuk agen, dan contoh prompt.',
    icon: Bot,
    file: 'ecc-agentic-ai-guide',
    server: 'agent-guide',
  },
  {
    key: 'api',
    title: 'API Documentation',
    desc: 'Seluruh endpoint core-api (dibaca langsung dari server yang berjalan): metode, path, deskripsi, akses menu, parameter, dan skema validasi body/query.',
    icon: FileCode2,
    file: 'ecc-api-reference',
    server: 'api',
  },
  {
    key: 'relations',
    title: 'Context Data Relations',
    desc: 'Semua model database: kolom, tipe, wajib/opsional, default, relasi antar data, unik gabungan, dan nilai enum — konteks pemetaan data untuk agen AI.',
    icon: Database,
    file: 'ecc-data-relations',
    server: 'relations',
  },
  {
    key: 'workflow',
    title: 'Workflow & Technical Documentation',
    desc: 'Arsitektur, alur auth & notifikasi, deploy workflow, konvensi API, integrasi mobile, dan diagram alur (Mermaid).',
    icon: GitBranch,
    file: 'ecc-workflow-technical',
    local: techDocsMarkdown,
  },
  {
    key: 'user-guide',
    title: 'User Guide',
    desc: 'Panduan pemakaian Portal per menu: langkah-langkah, tips, dan peringatan untuk admin & fulltimer.',
    icon: BookOpen,
    file: 'ecc-user-guide',
    local: userGuideMarkdown,
  },
];

const stamp = () => new Date().toISOString().slice(0, 10);

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function markdownOf(d: DocDef): Promise<string> {
  if (d.local) return d.local();
  const res = await apiClient.get<string>(`/admin/dev-docs/${d.server}.md`, { responseType: 'text', timeout: 120_000 });
  return res.data;
}

async function errMsg(err: any, fallback: string): Promise<string> {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text())?.error?.message ?? fallback;
    } catch {
      return fallback;
    }
  }
  return data?.error?.message ?? fallback;
}

export default function DevDownloadPage() {
  const [busy, setBusy] = useState<string | null>(null);

  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id);
    try {
      await fn();
    } catch (e) {
      toast.error(await errMsg(e, 'Gagal mengunduh dokumen'));
    } finally {
      setBusy(null);
    }
  }

  const downloadMd = (d: DocDef) =>
    run(`${d.key}:md`, async () => {
      const md = await markdownOf(d);
      saveBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${d.file}-${stamp()}.md`);
    });

  const downloadPdf = (d: DocDef) =>
    run(`${d.key}:pdf`, async () => {
      const res = d.server
        ? await apiClient.get(`/admin/dev-docs/${d.server}.pdf`, { responseType: 'blob', timeout: 180_000 })
        : await apiClient.post(
            '/admin/dev-docs/pdf',
            { title: d.title, fileName: d.file, markdown: d.local!() },
            { responseType: 'blob', timeout: 180_000 },
          );
      saveBlob(res.data as Blob, `${d.file}-${stamp()}.pdf`);
    });

  const bundle = () =>
    run('bundle', async () => {
      const parts: string[] = [];
      for (const d of DOCS) parts.push(await markdownOf(d));
      const head = [
        '# ECC — Paket Konteks Agentic AI',
        '',
        `Dibuat ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB. Berisi: ${DOCS.map((d) => d.title).join(', ')}.`,
        '',
        'Instruksi untuk agen: baca "Panduan Agentic AI" lebih dulu dan patuhi aturannya (dry-run, konfirmasi manusia sebelum menulis/menghapus, rate limit). Gunakan "API Documentation" untuk endpoint & validasi, "Context Data Relations" untuk struktur data & relasi.',
        '',
        '---',
        '',
      ].join('\n');
      const md = head + parts.join('\n\n---\n\n');
      saveBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `ecc-agentic-ai-context-${stamp()}.md`);
    });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
          <Download className="w-6 h-6 text-brand-500" /> Download
        </h1>
        <p className="text-neutral-500 mt-1 text-sm">
          Dokumentasi lengkap dalam Markdown & PDF — dibuat otomatis dari kode yang sedang berjalan, jadi selalu sesuai versi
          terbaru. Markdown siap dipelajari agentic AI untuk bulk insert / update / delete lewat API.
        </p>
      </div>

      {/* Paket gabungan */}
      <div className="bg-gradient-to-br from-brand-500 to-brand-700 text-white rounded-2xl p-5 mb-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
          <Package className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg flex items-center gap-2">
            Paket Konteks Agentic AI <Sparkles className="w-4 h-4" />
          </h2>
          <p className="text-sm text-white/90">
            Satu file .md berisi semua dokumen di bawah — unggah ke agen AI (Claude, dll.) sebagai konteks, lalu beri
            perintah. Agen memakai token dari{' '}
            <Link href="/dashboard/api-access" className="underline font-semibold">
              API Access
            </Link>
            .
          </p>
        </div>
        <button
          onClick={bundle}
          disabled={!!busy}
          className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-brand-700 font-semibold rounded-xl text-sm disabled:opacity-60"
        >
          {busy === 'bundle' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Unduh paket (.md)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {DOCS.map((d) => (
          <div key={d.key} className="bg-white border border-neutral-200 rounded-2xl p-5 flex flex-col">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                <d.icon className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold text-neutral-900">{d.title}</h3>
                <p className="text-sm text-neutral-600 mt-0.5">{d.desc}</p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-neutral-100 flex gap-2">
              <button
                onClick={() => downloadMd(d)}
                disabled={!!busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
              >
                {busy === `${d.key}:md` ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode2 className="w-4 h-4" />}
                Markdown
              </button>
              <button
                onClick={() => downloadPdf(d)}
                disabled={!!busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium disabled:opacity-50"
              >
                {busy === `${d.key}:pdf` ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                PDF
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 flex gap-3">
        <KeyRound className="w-5 h-5 shrink-0 text-amber-600" />
        <p>
          Dokumen tidak berisi token, password, atau data jemaat. Untuk memakai API, agen butuh token pribadi dari menu{' '}
          <Link href="/dashboard/api-access" className="font-semibold underline">
            API Access
          </Link>{' '}
          (khusus Team IT Minister dengan role yang diizinkan). Jangan menempelkan token di dalam prompt atau dokumen.
        </p>
      </div>
    </div>
  );
}
