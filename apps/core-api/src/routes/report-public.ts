/**
 * GET /public/report/:token — laporan Homecell / Homecell Area (print view →
 * "Save as PDF") untuk app mobile. Token = link bertanda tangan berumur 30
 * menit dari POST /admin/me/homecell/report-link (khusus pemimpin / PIC area).
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { Forbidden, NotFound } from '../lib/errors.js';
import { verifyReportToken } from '../lib/report-link.js';
import { resolvePeriod, ymd } from '../lib/last-attendance.js';
import { L, fmtTglL, periodName, setReportLang } from '../lib/report-i18n.js';
import { computeAreaStats } from '../lib/homecell-area-stats.js';
import { renderHomecellAreaReportHtml } from '../lib/homecell-area-report-html.js';
import { renderHomecellReportHtml } from '../lib/homecell-report-html.js';
import { buildHomecellReportRows } from './admin/homecell.js';

export const reportPublicRouter = Router();

reportPublicRouter.get('/:token', async (req, res) => {
  const p = verifyReportToken(req.params.token);
  if (!p) throw Forbidden('Link laporan sudah kedaluwarsa / Report link expired. Buka ulang dari Els App.');
  const lang = p.l === 'en' ? 'en' : 'id';
  setReportLang(lang);
  const period = resolvePeriod(p.p, p.f, p.t);
  const periodLabel = period
    ? `${periodName(p.p)} · ${fmtTglL(ymd(period.from))} – ${fmtTglL(ymd(period.to))}`
    : L('Semua waktu (sampai hari ini)', 'All time (up to today)');
  const ua = (req.get('user-agent') ?? '').toLowerCase();
  const isMobileUa = /mobi|android|iphone|ipad|ipod/.test(ua);

  let html: string;
  if (p.k === 'homecell') {
    const rows = await buildHomecellReportRows({ id: p.id }, period);
    if (!rows[0]) throw NotFound('Homecell tidak ditemukan');
    html = renderHomecellReportHtml(rows, { isMobileUa, title: `Homecell — ${rows[0].nama}`, filterParts: [], periodLabel, lang });
  } else {
    const area = await prisma.homecellArea.findUnique({
      where: { id: p.id },
      select: { id: true, nama: true, deskripsi: true, cabang: { select: { nama: true } }, picJemaat: { select: { namaLengkap: true } } },
    });
    if (!area) throw NotFound('Homecell Area tidak ditemukan');
    const stats = await computeAreaStats([area.id], period);
    html = renderHomecellAreaReportHtml(
      [{ id: area.id, nama: area.nama, deskripsi: area.deskripsi, cabang: area.cabang.nama, pic: area.picJemaat?.namaLengkap ?? null, stat: stats.get(area.id)! }],
      { isMobileUa, filterLabel: `Homecell Area — ${area.nama}`, periodLabel, lang },
    );
  }
  // Halaman cetak: izinkan style/script inline (tombol & auto-print) + gambar https (logo IDEA).
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'",
  );
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});
