/**
 * Bagian "Ulasan Jemaat" untuk export PDF laporan ibadah & event.
 */
import { esc, fmtTgl } from './print-report.js';
import type { ReviewItem, ReviewSummary } from './service-review.js';

export interface ReviewReportData {
  overall: ReviewSummary;
  perItem: (ReviewSummary & { label: string })[];
  comments: (ReviewItem & { label: string })[];
}

const stars = (v: number | null) => {
  if (v == null) return '';
  const full = Math.round(v);
  return `<span style="color:#f59e0b;letter-spacing:1px">${'★'.repeat(full)}</span><span style="color:#e5e7eb;letter-spacing:1px">${'★'.repeat(5 - full)}</span>`;
};

export function reviewSectionHtml(rv: ReviewReportData, itemHeader: string): string {
  const o = rv.overall;
  if (!o.count) return '<p class="muted">Belum ada ulasan jemaat di periode ini.</p>';
  const max = Math.max(1, ...o.dist);
  const dist = [5, 4, 3, 2, 1]
    .map((k) => {
      const c = o.dist[k - 1] ?? 0;
      return `<div style="display:flex;align-items:center;gap:6px;margin:2px 0;font-size:9.5px"><span style="width:22px">${k}★</span><div style="flex:1;height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden"><div style="width:${(c / max) * 100}%;height:100%;background:#f59e0b"></div></div><span style="width:26px;text-align:right">${c}</span></div>`;
    })
    .join('');
  const per = rv.perItem.length > 1
    ? `<table style="margin-top:8px"><thead><tr><th>${esc(itemHeader)}</th><th class="r">Ulasan</th><th class="r">Rata-rata</th><th></th></tr></thead><tbody>${rv.perItem
        .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))
        .map((p) => `<tr><td>${esc(p.label)}</td><td class="r">${p.count}</td><td class="r b">${p.avg ?? '—'}</td><td>${stars(p.avg)}</td></tr>`)
        .join('')}</tbody></table>`
    : '';
  const comments = rv.comments.length
    ? `<div style="margin-top:8px">${rv.comments
        .slice(0, 30)
        .map(
          (c) =>
            `<div style="border-left:3px solid #fed7aa;padding:3px 8px;margin:5px 0;page-break-inside:avoid"><div style="font-size:9px;color:#64748b">${stars(c.rating)} · ${esc(c.nama)} · ${esc(c.label)}${c.tanggal ? ` · ${fmtTgl(c.tanggal)}` : ''}</div><div style="font-size:10px">${esc(c.komentar ?? '')}</div></div>`,
        )
        .join('')}${rv.comments.length > 30 ? `<p class="muted small">+${rv.comments.length - 30} komentar lainnya — lihat portal / export Excel.</p>` : ''}</div>`
    : '<p class="muted small">Belum ada komentar tertulis.</p>';
  return `<div style="display:flex;gap:18px;align-items:center">
    <div style="text-align:center;min-width:110px"><div style="font-size:30px;font-weight:800;color:#c2410c;line-height:1">${o.avg}</div><div>${stars(o.avg)}</div><div class="muted small">${o.count} ulasan · ${o.withComment} komentar</div></div>
    <div style="flex:1">${dist}</div>
  </div>${per}<div class="sub-t" style="margin-top:10px;font-weight:700">Komentar terbaru</div>${comments}`;
}
