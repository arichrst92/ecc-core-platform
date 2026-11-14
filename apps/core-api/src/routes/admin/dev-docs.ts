/**
 * Developer Tools → Download — dokumentasi yang digenerate dari kode.
 *
 *   GET  /admin/dev-docs/:doc.md   → Markdown  (doc: agent-guide | api | relations)
 *   GET  /admin/dev-docs/:doc.pdf  → PDF
 *   POST /admin/dev-docs/pdf       → PDF dari Markdown kiriman Portal
 *                                    (Workflow & User Guide, paket gabungan)
 *
 * Akses: menu `dev-download` (read).
 */
import { Router, type Express } from 'express';
import { z } from 'zod';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { requireMenu } from '../../middleware/require-menu.js';
import { markdownToPdf } from '../../lib/md-pdf.js';
import { DEV_DOCS, agentGuideMarkdown, apiReferenceMarkdown, dataRelationsMarkdown, type DevDocKey } from '../../lib/dev-docs.js';

export const devDocsRouter = Router();
devDocsRouter.use(requireMenu('dev-download'));

const baseUrlOf = (req: { protocol: string; get(h: string): string | undefined }) =>
  process.env.PUBLIC_API_URL ?? `${req.get('x-forwarded-proto') ?? req.protocol}://${req.get('host')}`;

// Cache singkat — API Reference membaca source & introspeksi router (mahal).
const cache = new Map<string, { at: number; md: string }>();
function build(doc: DevDocKey, app: Express, baseUrl: string): string {
  const key = `${doc}|${baseUrl}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.md;
  const md = doc === 'api' ? apiReferenceMarkdown(app, baseUrl) : doc === 'relations' ? dataRelationsMarkdown() : agentGuideMarkdown(baseUrl);
  cache.set(key, { at: Date.now(), md });
  return md;
}

const stamp = () => new Date().toISOString().slice(0, 10);

devDocsRouter.get('/:file', (req, res) => {
  const m = /^([\w-]+)\.(md|pdf)$/.exec(req.params.file);
  if (!m || !(m[1]! in DEV_DOCS)) throw NotFound('Dokumen tidak ditemukan.');
  const doc = m[1] as DevDocKey;
  const meta = DEV_DOCS[doc];
  const md = build(doc, req.app as Express, baseUrlOf(req));
  const name = `${meta.file}-${stamp()}`;
  if (m[2] === 'md') {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.md"`);
    return res.send(md);
  }
  const pdf = markdownToPdf(md, { title: `ECC — ${meta.title}`, subtitle: `Dibuat otomatis ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB` });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`);
  res.send(pdf);
});

const pdfSchema = z.object({
  title: z.string().trim().min(1).max(150),
  fileName: z.string().trim().regex(/^[\w.-]{1,100}$/).optional(),
  markdown: z.string().min(1).max(1_800_000),
});

devDocsRouter.post('/pdf', (req, res) => {
  const input = pdfSchema.parse(req.body);
  if (!input.markdown.trim()) throw BadRequest('Markdown kosong.');
  const pdf = markdownToPdf(input.markdown, {
    title: `ECC — ${input.title}`,
    subtitle: `Dibuat ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${input.fileName ?? 'ecc-dokumen'}-${stamp()}.pdf"`);
  res.send(pdf);
});
