/**
 * Menu Compliance — SOP kebocoran data & permintaan hak jemaat per negara.
 *
 *   GET    /admin/compliance/docs                      → daftar (tanpa konten)
 *   GET    /admin/compliance/docs/:key/:country        → satu dokumen
 *   PUT    /admin/compliance/docs/:key/:country        → simpan (title, content, version)
 *   GET    /admin/compliance/docs/:key/:country/print  → print view (Save as PDF)
 *
 * RBAC menu 'compliance-sop' (Fulltimer selalu lolos).
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { z } from 'zod';
import { BadRequest, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { requireMenu } from '../../middleware/require-menu.js';
import { markdownToHtml } from '../../lib/markdown-lite.js';
import { esc } from '../../lib/print-report.js';
import { requireFulltimer } from '../../middleware/require-auth.js';
import { encryptionEnabled } from '../../lib/crypto-at-rest.js';
import { getBackupEmailConfig, runBackupEmail } from '../../lib/backup-email.js';
import { apiBase } from '../../lib/worship.js';

export const complianceRouter = Router();

export const SOP_KEYS = ['SOP_BREACH', 'SOP_DSR'] as const;
export const COUNTRIES = ['ID', 'MY', 'AU'] as const;
const COUNTRY_LABEL: Record<string, string> = { ID: 'Indonesia', MY: 'Malaysia', AU: 'Australia' };
const KEY_LABEL: Record<string, string> = { SOP_BREACH: 'Kebocoran Data', SOP_DSR: 'Permintaan Hak atas Data' };

function parseParams(p: { key?: string; country?: string }) {
  const key = String(p.key ?? '').toUpperCase();
  const country = String(p.country ?? '').toUpperCase();
  if (!(SOP_KEYS as readonly string[]).includes(key)) throw BadRequest('Jenis SOP tidak valid.');
  if (!(COUNTRIES as readonly string[]).includes(country)) throw BadRequest('Negara tidak valid (ID | MY | AU).');
  return { key, country };
}

complianceRouter.get('/docs', requireMenu('compliance-sop'), async (_req, res) => {
  const rows = await prisma.complianceDocument.findMany({
    select: { id: true, key: true, country: true, title: true, version: true, updatedAt: true },
    orderBy: [{ key: 'asc' }, { country: 'asc' }],
  });
  res.json({ success: true, data: rows });
});

complianceRouter.get('/docs/:key/:country', requireMenu('compliance-sop'), async (req, res) => {
  const { key, country } = parseParams(req.params);
  const doc = await prisma.complianceDocument.findUnique({ where: { key_country: { key, country } } });
  if (!doc) throw NotFound('Dokumen belum ada.');
  res.json({ success: true, data: doc });
});

const putSchema = z.object({
  title: z.string().trim().min(3).max(255),
  content: z.string().trim().min(10).max(100_000),
  version: z.string().trim().min(1).max(20),
});

complianceRouter.put('/docs/:key/:country', requireMenu('compliance-sop', 'write'), async (req, res) => {
  if (!req.user) throw Unauthorized();
  const { key, country } = parseParams(req.params);
  const input = putSchema.parse(req.body ?? {});
  const saved = await prisma.complianceDocument.upsert({
    where: { key_country: { key, country } },
    create: { key, country, ...input, updatedByUserId: req.user.sub },
    update: { ...input, updatedByUserId: req.user.sub },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'compliance_document',
    resourceId: saved.id,
    resourceLabel: `${KEY_LABEL[key]} — ${COUNTRY_LABEL[country]} (v${saved.version})`,
  });
  res.json({ success: true, data: saved });
});

complianceRouter.get('/docs/:key/:country/print', requireMenu('compliance-sop'), async (req, res) => {
  const { key, country } = parseParams(req.params);
  const doc = await prisma.complianceDocument.findUnique({ where: { key_country: { key, country } } });
  if (!doc) throw NotFound('Dokumen belum ada.');
  const portal = (process.env.PORTAL_URL ?? 'https://portal.eccchurch.global').replace(/\/$/, '');
  const isMobileUa = /mobi|android|iphone|ipad|ipod/.test((req.get('user-agent') ?? '').toLowerCase());
  const updated = doc.updatedAt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>${esc(doc.title)}</title>
<style>
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif; font-size: 11px; color: #1f2937; margin: 0; line-height: 1.55; }
  .page { padding: 6mm; }
  .hero { background: linear-gradient(135deg, #ea580c 0%, #f59e0b 100%); color: #fff; border-radius: 10px; padding: 16px 20px; display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
  .hero img { width: 46px; height: 46px; border-radius: 10px; background: #fff; padding: 4px; }
  .hero .kicker { font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; opacity: .9; }
  .hero h1 { font-size: 20px; margin: 2px 0 0; color: #fff; border: 0; padding: 0; }
  .meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  .pill { background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; font-size: 10px; font-weight: 600; padding: 2px 9px; border-radius: 999px; }
  .doc h1 { display: none; }
  .doc h2 { font-size: 14px; color: #c2410c; margin: 18px 0 6px; padding-bottom: 3px; border-bottom: 1.5px solid #fed7aa; page-break-after: avoid; }
  .doc h3 { font-size: 12px; margin: 12px 0 4px; color: #9a3412; page-break-after: avoid; }
  .doc p { margin: 5px 0; }
  .doc ul, .doc ol { margin: 4px 0 6px 18px; padding: 0; }
  .doc li { margin: 2px 0; }
  .doc blockquote { margin: 8px 0; padding: 8px 12px; background: #fff7ed; border-left: 4px solid #ea580c; border-radius: 6px; }
  .doc blockquote p { margin: 3px 0; }
  .doc table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; font-size: 10.2px; page-break-inside: auto; }
  .doc tr { page-break-inside: avoid; }
  .doc th { background: #ea580c; color: #fff; text-align: left; padding: 5px 7px; font-weight: 700; }
  .doc td { border-bottom: 1px solid #e5e7eb; padding: 5px 7px; vertical-align: top; }
  .doc tbody tr:nth-child(even) td { background: #fafafa; }
  .doc code { background: #f3f4f6; padding: 0 4px; border-radius: 3px; }
  .doc a { color: #c2410c; }
  .footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; color: #9ca3af; font-size: 9px; }
  .footer img { height: 18px; }
  .noprint { padding: 10px 14px; background: #fff7ed; border-bottom: 1px solid #fed7aa; font-size: 12px; }
  .noprint button { margin-left: 8px; padding: 6px 12px; background: #ea580c; color: #fff; border: 0; border-radius: 4px; cursor: pointer; font-weight: 600; }
  @media print { .noprint { display: none !important; } .page { padding: 0; } }
</style></head><body>
${isMobileUa ? '<script>setTimeout(() => window.print(), 600);</script>' : `<div class="noprint"><strong>Print Preview</strong> — ${esc(doc.title)}. Tekan Ctrl/Cmd + P → Save as PDF.<button onclick="window.print()">Print / Save as PDF</button></div>`}
<div class="page">
  <div class="hero">
    <img src="${portal}/logo-ecc.webp" alt="ECC" onerror="this.style.display='none'"/>
    <div><div class="kicker">Compliance · ${esc(COUNTRY_LABEL[country]!)}</div><h1>${esc(doc.title)}</h1></div>
  </div>
  <div class="meta">
    <span class="pill">Versi ${esc(doc.version)}</span>
    <span class="pill">Diperbarui ${esc(updated)}</span>
    <span class="pill">Dokumen internal</span>
  </div>
  <div class="doc">${markdownToHtml(doc.content)}</div>
  <div class="footer">
    <span>© ${new Date().getFullYear()} Elshaddai Creative Community · Dokumen internal — jangan disebarkan di luar tim</span>
    <span>Powered by <img src="${portal}/logo-idea.webp" alt="IDEA" onerror="this.style.display='none'" style="vertical-align:middle"/></span>
  </div>
</div>
</body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
});

// ------------------------------------------------------------------
// Kirim backup bulanan via email — RBAC 'compliance-backup' + Fulltimer
// ------------------------------------------------------------------
const backupGate = [requireFulltimer, requireMenu('compliance-backup', 'write')];

complianceRouter.get('/backup-email', ...backupGate, async (_req, res) => {
  const cfg = await getBackupEmailConfig();
  res.json({ success: true, data: { ...cfg, encryptionEnabled: encryptionEnabled() } });
});

const backupCfgSchema = z.object({
  isEnabled: z.boolean(),
  recipients: z.array(z.string().trim().toLowerCase().email('Email tidak valid')).max(10),
  dayOfMonth: z.coerce.number().int().min(1).max(28),
  hour: z.coerce.number().int().min(0).max(23),
  linkValidDays: z.coerce.number().int().min(1).max(30),
});

complianceRouter.put('/backup-email', ...backupGate, async (req, res) => {
  if (!req.user) throw Unauthorized();
  const input = backupCfgSchema.parse(req.body ?? {});
  if (input.isEnabled && input.recipients.length === 0) throw BadRequest('Isi minimal satu email penerima.');
  const saved = await prisma.backupEmailConfig.upsert({
    where: { id: 'global' },
    create: { id: 'global', ...input, updatedByUserId: req.user.sub },
    update: { ...input, updatedByUserId: req.user.sub },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'backup_email_config',
    resourceId: 'global',
    resourceLabel: `Kirim backup bulanan: ${input.isEnabled ? 'aktif' : 'nonaktif'} · tgl ${input.dayOfMonth} jam ${input.hour}:00`,
    metadata: { recipients: input.recipients.length },
  });
  res.json({ success: true, data: { ...saved, encryptionEnabled: encryptionEnabled() } });
});

complianceRouter.post('/backup-email/send-now', ...backupGate, async (req, res) => {
  if (!req.user) throw Unauthorized();
  const cfg = await getBackupEmailConfig();
  if (!cfg.recipients.length) throw BadRequest('Isi dan simpan email penerima dulu.');
  if (!encryptionEnabled()) throw BadRequest('DATA_ENCRYPTION_KEY belum di-set di server.');
  // Jalan di latar belakang (backup bisa beberapa menit); portal memantau lastStatus.
  void runBackupEmail({ manual: true, apiBase: apiBase(req), byUserId: req.user.sub }).catch(() => {});
  audit(req, { action: 'UPDATE', resource: 'backup_email_config', resourceId: 'global', resourceLabel: 'Kirim uji backup bulanan' });
  res.status(202).json({ success: true, data: { started: true } });
});

// ------------------------------------------------------------------
// Catatan aktivitas pemrosesan (RoPA) + penilaian risiko — RBAC 'compliance-ropa'
// ------------------------------------------------------------------
const nonEmpty = z.string().trim().min(1).max(5000);
const activitySchema = z.object({
  kode: z.string().trim().min(1).max(10),
  nama: z.string().trim().min(3).max(200),
  tujuan: nonEmpty,
  subjekData: nonEmpty,
  kategoriData: nonEmpty,
  dataSensitif: z.boolean(),
  dasarHukum: nonEmpty,
  penerima: nonEmpty,
  transferLuarNegeri: nonEmpty,
  retensi: nonEmpty,
  keamanan: nonEmpty,
  pemilik: z.string().trim().min(1).max(200),
  negara: z.array(z.enum(COUNTRIES)).min(1),
  risikoKemungkinan: z.coerce.number().int().min(1).max(3),
  risikoDampak: z.coerce.number().int().min(1).max(3),
  risiko: nonEmpty,
  mitigasi: nonEmpty,
  risikoSisa: z.enum(['RENDAH', 'SEDANG', 'TINGGI']),
  tinjauBerikutnya: z.union([z.string().date(), z.literal(''), z.null()]).optional(),
  urutan: z.coerce.number().int().min(0).max(999).optional(),
});

const toData = (i: z.infer<typeof activitySchema>) => ({
  ...i,
  tinjauBerikutnya: i.tinjauBerikutnya ? new Date(i.tinjauBerikutnya) : null,
});

export const riskLevel = (l: number, d: number) => {
  const s = l * d;
  return s >= 6 ? 'TINGGI' : s >= 3 ? 'SEDANG' : 'RENDAH';
};

complianceRouter.get('/processing', requireMenu('compliance-ropa'), async (_req, res) => {
  const rows = await prisma.processingActivity.findMany({ orderBy: [{ urutan: 'asc' }, { kode: 'asc' }] });
  res.json({ success: true, data: rows });
});

complianceRouter.post('/processing', requireMenu('compliance-ropa', 'write'), async (req, res) => {
  if (!req.user) throw Unauthorized();
  const input = activitySchema.parse(req.body ?? {});
  const created = await prisma.processingActivity.create({ data: { ...toData(input), updatedByUserId: req.user.sub } });
  audit(req, { action: 'CREATE', resource: 'processing_activity', resourceId: created.id, resourceLabel: `${created.kode} ${created.nama}` });
  res.status(201).json({ success: true, data: created });
});

complianceRouter.put('/processing/:id', requireMenu('compliance-ropa', 'write'), async (req, res) => {
  if (!req.user) throw Unauthorized();
  const input = activitySchema.parse(req.body ?? {});
  const before = await prisma.processingActivity.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Aktivitas tidak ditemukan');
  const updated = await prisma.processingActivity.update({ where: { id: before.id }, data: { ...toData(input), updatedByUserId: req.user.sub } });
  audit(req, { action: 'UPDATE', resource: 'processing_activity', resourceId: updated.id, resourceLabel: `${updated.kode} ${updated.nama}` });
  res.json({ success: true, data: updated });
});

complianceRouter.delete('/processing/:id', requireMenu('compliance-ropa', 'delete'), async (req, res) => {
  const before = await prisma.processingActivity.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Aktivitas tidak ditemukan');
  await prisma.processingActivity.delete({ where: { id: before.id } });
  audit(req, { action: 'DELETE', resource: 'processing_activity', resourceId: before.id, resourceLabel: `${before.kode} ${before.nama}` });
  res.status(204).end();
});

complianceRouter.get('/processing/print', requireMenu('compliance-ropa'), async (req, res) => {
  const rows = await prisma.processingActivity.findMany({ orderBy: [{ urutan: 'asc' }, { kode: 'asc' }] });
  const portal = (process.env.PORTAL_URL ?? 'https://portal.eccchurch.global').replace(/\/$/, '');
  const isMobileUa = /mobi|android|iphone|ipad|ipod/.test((req.get('user-agent') ?? '').toLowerCase());
  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const lvlCls = (v: string) => (v === 'TINGGI' ? 'hi' : v === 'SEDANG' ? 'md' : 'lo');
  const count = (v: string) => rows.filter((r) => r.risikoSisa === v).length;
  const tinjau = (d: Date | null) => (d ? d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const field = (k: string, v: string) => `<tr><th>${esc(k)}</th><td>${esc(v).replace(/\n/g, '<br/>')}</td></tr>`;
  const cards = rows
    .map((r) => {
      const awal = riskLevel(r.risikoKemungkinan, r.risikoDampak);
      return `<section class="act">
      <div class="act-h"><span class="kode">${esc(r.kode)}</span><b>${esc(r.nama)}</b>
        ${r.dataSensitif ? '<span class="tag sens">Data sensitif</span>' : ''}
        <span class="tag">${esc(r.negara.join(' · '))}</span>
        <span class="tag ${lvlCls(r.risikoSisa)}">Risiko sisa: ${esc(r.risikoSisa)}</span></div>
      <table class="kv">
        ${field('Tujuan', r.tujuan)}
        ${field('Subjek data', r.subjekData)}
        ${field('Kategori data', r.kategoriData)}
        ${field('Dasar hukum', r.dasarHukum)}
        ${field('Penerima / pemroses', r.penerima)}
        ${field('Transfer luar negeri', r.transferLuarNegeri)}
        ${field('Lama simpan', r.retensi)}
        ${field('Pengamanan', r.keamanan)}
        ${field('Pemilik proses', r.pemilik)}
      </table>
      <div class="risk">
        <div><div class="lbl">Risiko awal</div><span class="tag ${lvlCls(awal)}">${awal}</span> <span class="muted">(kemungkinan ${r.risikoKemungkinan} × dampak ${r.risikoDampak})</span></div>
        <div><div class="lbl">Tinjau berikutnya</div>${esc(tinjau(r.tinjauBerikutnya))}</div>
      </div>
      <table class="kv">${field('Risiko utama', r.risiko)}${field('Mitigasi', r.mitigasi)}</table>
    </section>`;
    })
    .join('');
  const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Catatan Pemrosesan & Penilaian Risiko</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; font-size: 10.5px; color: #1f2937; margin: 0; line-height: 1.45; }
  .page { padding: 6mm; }
  .hero { background: linear-gradient(135deg, #ea580c, #f59e0b); color: #fff; border-radius: 10px; padding: 14px 18px; display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
  .hero img { width: 42px; height: 42px; border-radius: 9px; background: #fff; padding: 4px; }
  .hero .k { font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; opacity: .9; }
  .hero h1 { margin: 2px 0 0; font-size: 19px; }
  .intro { margin: 0 0 10px; color: #4b5563; }
  .sum { display: flex; gap: 8px; margin-bottom: 12px; }
  .sum div { flex: 1; border: 1px solid #fed7aa; background: #fff7ed; border-radius: 8px; padding: 7px 10px; }
  .sum b { display: block; font-size: 18px; color: #c2410c; }
  .act { border: 1px solid #e5e7eb; border-radius: 9px; padding: 10px 12px; margin-bottom: 10px; page-break-inside: avoid; }
  .act-h { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 6px; font-size: 12px; }
  .kode { background: #ea580c; color: #fff; font-weight: 700; border-radius: 5px; padding: 1px 6px; font-size: 10px; }
  .tag { font-size: 9px; font-weight: 700; padding: 1px 7px; border-radius: 999px; background: #f3f4f6; color: #374151; }
  .tag.sens { background: #fce7f3; color: #9d174d; } .tag.lo { background: #dcfce7; color: #166534; }
  .tag.md { background: #fef3c7; color: #92400e; } .tag.hi { background: #fee2e2; color: #991b1b; }
  table.kv { width: 100%; border-collapse: collapse; margin: 4px 0; }
  table.kv th { width: 26%; text-align: left; vertical-align: top; color: #9a3412; font-weight: 600; padding: 3px 6px 3px 0; }
  table.kv td { padding: 3px 0; border-bottom: 1px solid #f3f4f6; }
  .risk { display: flex; gap: 24px; background: #fafafa; border-radius: 6px; padding: 6px 8px; margin: 6px 0; }
  .lbl { font-size: 8.5px; text-transform: uppercase; letter-spacing: .5px; color: #6b7280; font-weight: 700; }
  .muted { color: #6b7280; }
  .footer { margin-top: 14px; padding-top: 8px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; color: #9ca3af; font-size: 9px; }
  .noprint { padding: 10px 14px; background: #fff7ed; border-bottom: 1px solid #fed7aa; font-size: 12px; }
  .noprint button { margin-left: 8px; padding: 6px 12px; background: #ea580c; color: #fff; border: 0; border-radius: 4px; cursor: pointer; font-weight: 600; }
  @media print { .noprint { display: none !important; } .page { padding: 0; } }
</style></head><body>
${isMobileUa ? '<script>setTimeout(() => window.print(), 600);</script>' : '<div class="noprint"><strong>Print Preview</strong> — Catatan Pemrosesan & Penilaian Risiko. Tekan Ctrl/Cmd + P → Save as PDF.<button onclick="window.print()">Print / Save as PDF</button></div>'}
<div class="page">
  <div class="hero"><img src="${portal}/logo-ecc.webp" alt="" onerror="this.style.display='none'"/>
    <div><div class="k">Compliance · RoPA & DPIA</div><h1>Catatan Aktivitas Pemrosesan & Penilaian Risiko</h1></div></div>
  <p class="intro">Daftar seluruh kegiatan Els App yang memproses data pribadi jemaat, beserta penilaian risikonya (UU PDP Indonesia, PDPA Malaysia, Privacy Act Australia). Per ${esc(today)}. Risiko = kemungkinan (1–3) × dampak (1–3): 1–2 rendah, 3–4 sedang, 6–9 tinggi.</p>
  <div class="sum"><div><b>${rows.length}</b>aktivitas</div><div><b>${rows.filter((r) => r.dataSensitif).length}</b>memuat data sensitif</div><div><b>${count('TINGGI')} / ${count('SEDANG')} / ${count('RENDAH')}</b>risiko sisa tinggi / sedang / rendah</div></div>
  ${cards || '<p class="muted">Belum ada aktivitas.</p>'}
  <div class="footer"><span>© ${new Date().getFullYear()} Elshaddai Creative Community · Dokumen internal</span><span>Powered by IDEA</span></div>
</div></body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
});
