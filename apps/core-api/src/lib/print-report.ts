/**
 * Helper export laporan portal: CSV (Excel) & tampilan cetak HTML (Save as
 * PDF) dengan footer "Powered by IDEA". Dipakai Laporan Ibadah/Event & Visit.
 */
import type { Request, Response } from 'express';

export function esc(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const fmtTgl = (ymdStr: string) =>
  new Date(`${ymdStr}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function csvCell(v: unknown) {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function sendCsv(res: Response, filename: string, lines: unknown[][]) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\n'));
}

export function summaryCards(items: [string, string | number][]) {
  return `<div class="cards">${items
    .map(([k, v]) => `<div class="card"><div class="v">${esc(v)}</div><div class="k">${esc(k)}</div></div>`)
    .join('')}</div>`;
}

export function sendPrintHtml(
  req: Request,
  res: Response,
  title: string,
  period: { from: string; to: string; label: string } | null,
  filters: (string | null)[],
  body: string,
  footerNote = 'Oranye = jemaat, ungu = tamu',
) {
  const timestamp = new Date().toISOString().slice(0, 10);
  const isMobileUa = /mobi|android|iphone|ipad|ipod/.test((req.get('user-agent') ?? '').toLowerCase());
  const ideaLogo = `${(process.env.PORTAL_URL ?? 'https://portal.eccchurch.global').replace(/\/$/, '')}/logo-idea.webp`;
  const meta = [
    period ? `${period.label ? `${period.label} · ` : ''}${fmtTgl(period.from)} – ${fmtTgl(period.to)}` : null,
    ...filters,
  ].filter(Boolean);
  const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>${esc(title)} — ${timestamp}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 10px; color: #0f172a; margin: 0; }
  h1 { font-size: 17px; margin: 0 0 4px; } h2 { font-size: 12.5px; margin: 16px 0 6px; }
  .meta { font-size: 11px; color: #64748b; margin-bottom: 10px; }
  .cards { display: flex; gap: 8px; margin: 8px 0; }
  .card { flex: 1; border: 1px solid #fed7aa; background: #fff7ed; border-radius: 8px; padding: 8px 10px; }
  .card .v { font-size: 18px; font-weight: 700; color: #c2410c; } .card .k { font-size: 10px; color: #9a3412; }
  .meth { font-size: 10.5px; color: #334155; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #e2e8f0; padding: 3px 6px; text-align: left; vertical-align: top; }
  thead { background: #f8fafc; font-weight: 600; } .r { text-align: right; } .b { font-weight: 700; }
  .muted { color: #64748b; } .ok { color: #15803d; font-weight: 600; }
  .trend td { border: none; padding: 2px 6px; } .trend .w { width: 120px; color: #475569; }
  .bar { display: flex; height: 10px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
  .bar .j { background: #f97316; } .bar .t { background: #8b5cf6; }
  .footer-row { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 9.5px; color: #94a3b8; }
  .powered { display: flex; align-items: center; gap: 6px; color: #64748b; }
  @media print { .noprint { display: none !important; } }
  .noprint { padding: 10px; background: #fff7ed; border-bottom: 1px solid #fed7aa; }
  .noprint button { padding: 6px 12px; background: #ea580c; color: white; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; }
</style></head><body>
${isMobileUa ? '' : `<div class="noprint"><strong>Print Preview — ${esc(title)}</strong> · Tekan <kbd>Ctrl/Cmd + P</kbd> untuk simpan PDF. <button onclick="window.print()">Print / Save as PDF</button></div>`}
${isMobileUa ? '<script>setTimeout(() => window.print(), 600);</script>' : ''}
<div style="padding: 8mm;">
<h1>${esc(title)} ECC</h1>
<div class="meta">${meta.map(esc).join(' · ')} · Export ${timestamp}</div>
${body}
<div class="footer-row">
  <div>© ${new Date().getFullYear()} Elshaddai Creative Community${footerNote ? ` · ${esc(footerNote)}` : ''}</div>
  <div class="powered"><span>Powered by</span><img src="${ideaLogo}" alt="IDEA" onerror="this.style.display='none'" style="height:20px;width:auto;"/></div>
</div>
</div></body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}
