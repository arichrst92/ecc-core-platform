/**
 * Generator dokumentasi Developer Tools → Download (Markdown; PDF via md-pdf).
 *
 *   - API Reference      : semua endpoint yang terdaftar di Express (runtime) +
 *                          deskripsi & skema validasi Zod dari source route +
 *                          ringkasan OpenAPI bila ada.
 *   - Data Relations     : model, kolom, relasi & enum dari Prisma (DMMF) +
 *                          komentar dari schema.prisma.
 *   - Agentic AI Guide   : cara autentikasi, konvensi, pola bulk, aturan aman.
 *
 * Source (src/, schema.prisma) dibaca dari repo di server (deploy = git pull +
 * build). Bila tidak ditemukan, dokumen tetap dibuat dari data runtime saja.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import { Prisma } from '@ecc/database';
import { openApiSpec } from '../openapi.js';

const SRC_CANDIDATES = [path.resolve(__dirname, '..'), path.resolve(__dirname, '../../src'), path.resolve(process.cwd(), 'src')];
const SRC_ROOT = SRC_CANDIDATES.find((p) => fs.existsSync(path.join(p, 'routes/admin/index.ts'))) ?? null;
const SCHEMA_CANDIDATES = [
  path.resolve(__dirname, '../../../../packages/database/prisma/schema.prisma'),
  path.resolve(process.cwd(), '../../packages/database/prisma/schema.prisma'),
];
const SCHEMA_PATH = SCHEMA_CANDIDATES.find((p) => fs.existsSync(p)) ?? null;

const read = (p: string) => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
};

// ============================================================
//  Route inventory (runtime)
// ============================================================

export interface RouteInfo {
  method: string;
  path: string;
}

/** Ubah regexp layer Express 4 → path string (":param" dipertahankan). */
function layerPath(layer: { regexp: RegExp & { fast_slash?: boolean }; keys?: { name: string | number }[] }): string {
  if (layer.regexp.fast_slash) return '';
  let src = layer.regexp.source;
  src = src.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/i, '').replace(/\(\?=\\\/\|\$\)$/i, '').replace(/\$$/, '').replace(/\\\/\?$/, '');
  let k = 0;
  // Parameter: "(?:([^\/]+?))" atau "(?:\/([^\/]+?))" → ":nama"
  src = src.replace(/\(\?:(\\\/)?\(\[\^\\?\/\]\+\?\)\)/g, (_m, slash) => `${slash ? '/' : ''}:${layer.keys?.[k++]?.name ?? 'param'}`);
  return src.replace(/\\\//g, '/').replace(/\\\./g, '.').replace(/\\-/g, '-');
}

export function listRoutes(app: Express): RouteInfo[] {
  const out: RouteInfo[] = [];
  const walk = (stack: unknown[], prefix: string) => {
    for (const l of stack as {
      route?: { path: string | string[]; methods: Record<string, boolean> };
      name?: string;
      handle?: { stack?: unknown[] };
      regexp: RegExp;
      keys?: { name: string }[];
    }[]) {
      if (l.route) {
        const paths = Array.isArray(l.route.path) ? l.route.path : [l.route.path];
        for (const p of paths) {
          for (const m of Object.keys(l.route.methods)) {
            if (m === '_all') continue;
            out.push({ method: m.toUpperCase(), path: (prefix + (p === '/' ? '' : p)).replace(/\/+/g, '/') || '/' });
          }
        }
      } else if (l.name === 'router' && l.handle?.stack) {
        walk(l.handle.stack, prefix + layerPath(l as never));
      }
    }
  };
  const router = (app as unknown as { _router?: { stack: unknown[] } })._router;
  if (router) walk(router.stack, '');
  const seen = new Set<string>();
  return out
    .filter((r) => {
      const k = `${r.method} ${r.path}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

// ============================================================
//  Source parsing — deskripsi & skema per route
// ============================================================

interface SourceRoute {
  method: string;
  subpath: string;
  comment: string | null;
  schemas: { name: string; where: string; source: string }[];
  menu: string | null;
}
interface SourceModule {
  file: string;
  header: string | null;
  routes: SourceRoute[];
}

/** Ambil isi kurung yang seimbang mulai `start` (index karakter '(' / '{'). */
function balanced(text: string, start: number): string {
  const open = text[start]!;
  const close = open === '(' ? ')' : open === '{' ? '}' : ']';
  let depth = 0;
  let inStr: string | null = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (inStr) {
      if (c === '\\') i++;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') inStr = c;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start, Math.min(text.length, start + 2000));
}

function cleanComment(block: string): string {
  return block
    .split('\n')
    .map((l) => l.replace(/^\s*(\/\*\*?|\*\/|\*|\/\/)\s?/, '').replace(/\*\/\s*$/, '').trimEnd())
    .join('\n')
    .trim();
}

function parseModule(file: string): SourceModule | null {
  const text = read(file);
  if (!text) return null;
  const headerM = /^\s*\/\*\*([\s\S]*?)\*\//.exec(text);
  const header = headerM ? cleanComment(headerM[0]) : null;
  const routes: SourceRoute[] = [];
  const re = /^(\w+Router)\.(get|post|patch|put|delete)\(\s*['"`]([^'"`]*)['"`]/gm;
  const matches = [...text.matchAll(re)];
  matches.forEach((m, idx) => {
    const start = m.index!;
    const end = idx + 1 < matches.length ? matches[idx + 1]!.index! : text.length;
    const body = text.slice(start, end);
    // Komentar tepat di atas route (// … atau /** … */).
    const before = text.slice(0, start).split('\n');
    const commentLines: string[] = [];
    for (let i = before.length - 2; i >= 0; i--) {
      const l = before[i]!;
      if (/^\s*(\/\/|\*|\/\*\*|\*\/)/.test(l)) commentLines.unshift(l);
      else break;
    }
    const comment = commentLines.length ? cleanComment(commentLines.join('\n')) : null;
    // Skema Zod yang dipakai handler: fooSchema.parse(req.body|req.query)
    const schemas: SourceRoute['schemas'] = [];
    for (const p of body.matchAll(/(\w+)\.(?:safeParse|parse)\(\s*req\.(body|query|params)/g)) {
      const name = p[1]!;
      if (schemas.some((s) => s.name === name)) continue;
      const def = new RegExp(`(?:const|let)\\s+${name}\\s*=\\s*`).exec(text);
      let source = '';
      if (def) {
        const from = def.index + def[0].length;
        const firstParen = text.indexOf('(', from);
        // ambil sampai akhir statement (chain .object(...).refine(...))
        let stmtEnd = text.indexOf(';\n', from);
        if (stmtEnd < 0) stmtEnd = from + 1500;
        source = text.slice(def.index, Math.min(stmtEnd + 1, def.index + 4000));
        if (firstParen > 0 && firstParen < stmtEnd) source = source || balanced(text, firstParen);
      } else source = `(skema diimpor dari modul lain — ${name})`;
      schemas.push({ name, where: p[2]!, source: source.trim() });
    }
    const menuM = /requireMenu\(\s*['"]([\w:-]+)['"](?:\s*,\s*['"](\w+)['"])?/.exec(body) ?? /requireMenuP\(\s*req\s*,\s*['"]([\w:-]+)['"](?:\s*,\s*['"](\w+)['"])?/.exec(body);
    routes.push({
      method: m[2]!.toUpperCase(),
      subpath: m[3]! === '/' ? '' : m[3]!,
      comment,
      schemas,
      menu: menuM ? `${menuM[1]}${menuM[2] ? ` (${menuM[2]})` : ''}` : null,
    });
  });
  return { file, header, routes };
}

/** Peta prefix mount → file router (app.ts → routes/admin/index.ts → sub-router, rekursif). */
function mountMap(): { prefix: string; file: string }[] {
  if (!SRC_ROOT) return [];
  const out: { prefix: string; file: string }[] = [];
  const seen = new Set<string>();
  const scan = (file: string, base: string, depth: number) => {
    const key = `${file}|${base}`;
    if (depth > 4 || seen.has(key)) return;
    seen.add(key);
    const text = read(file);
    if (!text) return;
    const imports = new Map<string, string>();
    for (const m of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
      for (const n of m[1]!.split(',').map((x) => x.trim().split(/\s+as\s+/).pop()!.trim())) {
        imports.set(n, path.resolve(path.dirname(file), m[2]!.replace(/\.js$/, '.ts')));
      }
    }
    for (const m of text.matchAll(/\b\w+\.use\(\s*['"]([^'"]+)['"][^;]*?\b(\w+Router)\b(?:\([^)]*\))?\s*\)/g)) {
      const target = imports.get(m[2]!) ?? (/\b(\w+Router)\s*=\s*Router\(/.test(text) && text.includes(`const ${m[2]} = Router(`) ? file : undefined);
      if (!target || !fs.existsSync(target)) continue;
      const prefix = (base + m[1]!).replace(/\/+/g, '/');
      out.push({ prefix, file: target });
      if (target !== file) scan(target, prefix, depth + 1);
    }
    // create*Router('X') (mis. news/renungan)
    for (const m of text.matchAll(/\b\w+\.use\(\s*['"]([^'"]+)['"]\s*,\s*(create\w+)\(/g)) {
      const target = imports.get(m[2]!);
      if (target && fs.existsSync(target)) out.push({ prefix: (base + m[1]!).replace(/\/+/g, '/'), file: target });
    }
  };
  scan(path.join(SRC_ROOT, 'app.ts'), '', 0);
  const dedup = new Map(out.map((o) => [o.prefix, o]));
  return [...dedup.values()].sort((a, b) => b.prefix.length - a.prefix.length);
}

// ============================================================
//  API Reference
// ============================================================

const SKIP_PREFIXES = ['/docs', '/uploads', '/worship-media', '/telemetry'];

function openApiFor(method: string, p: string): { summary?: string; description?: string } | null {
  const key = p.replace(/:(\w+)/g, '{$1}');
  const op = (openApiSpec.paths?.[key] as Record<string, { summary?: string; description?: string }> | undefined)?.[method.toLowerCase()];
  return op ?? null;
}

export function apiReferenceMarkdown(app: Express, baseUrl: string): string {
  const routes = listRoutes(app).filter((r) => !SKIP_PREFIXES.some((s) => r.path.startsWith(s)));
  const mounts = mountMap();
  const modules = new Map<string, SourceModule | null>();
  const moduleOf = (file: string) => {
    if (!modules.has(file)) modules.set(file, parseModule(file));
    return modules.get(file)!;
  };

  // Kelompok per modul (prefix mount terpanjang).
  const groups = new Map<string, { prefix: string; file: string | null; items: RouteInfo[] }>();
  for (const r of routes) {
    const mnt = mounts.find((m) => r.path === m.prefix || r.path.startsWith(m.prefix + '/'));
    const key = mnt?.prefix ?? `/${r.path.split('/')[1] ?? ''}`;
    const g = groups.get(key) ?? { prefix: key, file: mnt?.file ?? null, items: [] };
    g.items.push(r);
    groups.set(key, g);
  }

  const lines: string[] = [];
  lines.push('# ECC Core API — API Reference');
  lines.push('');
  lines.push(`Dibuat otomatis: ${new Date().toISOString()} · Base URL: \`${baseUrl}\` · Total endpoint: **${routes.length}**`);
  lines.push('');
  lines.push('## Autentikasi');
  lines.push('');
  lines.push('| Prefix | Cara autentikasi |');
  lines.push('|---|---|');
  lines.push('| `/admin/*` | `Authorization: Bearer <token>` — JWT login Portal/app **atau** token API pribadi `ecc_pat_…` (Developer Tools → API Access, khusus Team IT Minister). Akses tiap menu mengikuti Role Access pemilik token. |');
  lines.push('| `/api/v1/*` | `X-API-Key: ecc_<prefix>_<secret>` — API key aplikasi konsumen (Developer Tools → API Keys), read-only per sinode. |');
  lines.push('| `/public/*` | Tanpa autentikasi (data publik website/app), dibatasi rate limit. |');
  lines.push('| `/auth/*` | Login OTP / refresh token — tidak dipakai untuk otomasi. |');
  lines.push('');
  lines.push('## Format respons');
  lines.push('');
  lines.push('```json');
  lines.push('// Sukses');
  lines.push('{ "success": true, "data": { ... }, "meta": { "page": 1, "limit": 20, "total": 125, "totalPages": 7 } }');
  lines.push('// Gagal');
  lines.push('{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "No HP tidak valid …", "details": { "fieldErrors": { "noHp": ["…"] } } } }');
  lines.push('```');
  lines.push('');
  lines.push('Kode HTTP: 200/201 sukses · 400 validasi (lihat `error.details.fieldErrors`) · 401 token salah/kedaluwarsa · 403 tidak punya akses menu · 404 tidak ditemukan · 409 konflik (duplikat / masih berelasi) · 429 rate limit · 500 error server.');
  lines.push('');
  lines.push('Pagination umum: `?page=1&limit=20&search=…` (limit maks 500). Tanggal `YYYY-MM-DD`, waktu ISO-8601 UTC, ID berupa UUID, No HP format E.164 (`+62…`).');
  lines.push('');
  lines.push('## Daftar modul');
  lines.push('');
  const ordered = [...groups.values()].sort((a, b) => a.prefix.localeCompare(b.prefix));
  for (const g of ordered) lines.push(`- \`${g.prefix}\` — ${g.items.length} endpoint`);
  lines.push('');

  for (const g of ordered) {
    const mod = g.file ? moduleOf(g.file) : null;
    lines.push(`## ${g.prefix}`);
    lines.push('');
    if (mod?.header) {
      lines.push(...mod.header.split('\n').map((l) => (l.trim() ? `> ${l}` : '>')));
      lines.push('');
    }
    for (const r of g.items) {
      const sub = r.path.slice(g.prefix.length) || '';
      const src = mod?.routes.find((x) => x.method === r.method && x.subpath === sub);
      const oa = openApiFor(r.method, r.path);
      lines.push(`### ${r.method} \`${r.path}\``);
      lines.push('');
      const desc = [oa?.summary, oa?.description, src?.comment].filter(Boolean).join('\n\n');
      if (desc) {
        lines.push(desc);
        lines.push('');
      }
      if (src?.menu) {
        lines.push(`Akses menu: \`${src.menu}\``);
        lines.push('');
      }
      const params = [...r.path.matchAll(/:(\w+)/g)].map((m) => m[1]);
      if (params.length) {
        lines.push(`Parameter path: ${params.map((p) => `\`${p}\``).join(', ')}`);
        lines.push('');
      }
      for (const s of src?.schemas ?? []) {
        lines.push(`Validasi \`req.${s.where}\` (\`${s.name}\`):`);
        lines.push('');
        lines.push('```ts');
        lines.push(s.source.split('\n').slice(0, 60).join('\n'));
        lines.push('```');
        lines.push('');
      }
    }
  }
  return lines.join('\n');
}

// ============================================================
//  Data Relations (Prisma)
// ============================================================

/** Komentar `//` / `///` di atas model & field dari schema.prisma. */
function schemaComments(): Map<string, string> {
  const map = new Map<string, string>();
  const text = SCHEMA_PATH ? read(SCHEMA_PATH) : null;
  if (!text) return map;
  let model: string | null = null;
  let pending: string[] = [];
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    const mm = /^(model|enum)\s+(\w+)\s*\{/.exec(l);
    if (mm) {
      model = mm[2]!;
      if (pending.length) map.set(model, pending.join(' '));
      pending = [];
      continue;
    }
    if (l === '}') {
      model = null;
      pending = [];
      continue;
    }
    if (l.startsWith('//')) {
      const c = l.replace(/^\/\/\/?\s?/, '').trim();
      if (c && !/^=+$/.test(c)) pending.push(c);
      continue;
    }
    const fm = /^(\w+)\s+\S+/.exec(l);
    if (model && fm && !l.startsWith('@@')) {
      const inlineC = /\/\/\s?(.*)$/.exec(l)?.[1]?.trim();
      const all = [...pending, inlineC].filter(Boolean).join(' ');
      if (all) map.set(`${model}.${fm[1]}`, all);
    }
    if (!l.startsWith('//')) pending = model ? [] : pending;
  }
  return map;
}

export function dataRelationsMarkdown(): string {
  const dm = Prisma.dmmf.datamodel;
  const comments = schemaComments();
  const lines: string[] = [];
  lines.push('# ECC — Context Data Relations');
  lines.push('');
  lines.push(`Dibuat otomatis dari skema database (Prisma) · ${new Date().toISOString()} · ${dm.models.length} model, ${dm.enums.length} enum.`);
  lines.push('');
  lines.push('Kegunaan: konteks untuk agen AI / developer — nama tabel, kolom, tipe, wajib/opsional, relasi antar data, dan nilai enum. API memakai nama field camelCase (kolom "Field"); nama tabel/kolom database ada di kolom "DB".');
  lines.push('');
  lines.push('## Ringkasan relasi');
  lines.push('');
  for (const m of dm.models) {
    const rels = m.fields.filter((f) => f.kind === 'object');
    if (!rels.length) continue;
    lines.push(
      `- **${m.name}** → ${rels
        .map((f) => `${f.name}: ${f.type}${f.isList ? '[]' : f.isRequired ? '' : '?'}`)
        .join(', ')}`,
    );
  }
  lines.push('');
  lines.push('## Model');
  for (const m of dm.models) {
    lines.push('');
    lines.push(`### ${m.name}${m.dbName ? ` (tabel \`${m.dbName}\`)` : ''}`);
    lines.push('');
    const mc = comments.get(m.name);
    if (mc) {
      lines.push(mc);
      lines.push('');
    }
    lines.push('| Field | Tipe | Wajib | Keterangan |');
    lines.push('|---|---|---|---|');
    for (const f of m.fields) {
      const type = `${f.type}${f.isList ? '[]' : ''}`;
      const notes: string[] = [];
      if (f.isId) notes.push('PK');
      if (f.isUnique) notes.push('unik');
      if (f.kind === 'object') {
        notes.push(`relasi → ${f.type}${f.relationFromFields?.length ? ` via ${f.relationFromFields.join(', ')}` : ''}${f.relationOnDelete ? ` (onDelete ${f.relationOnDelete})` : ''}`);
      }
      if (f.kind === 'enum') notes.push('enum');
      if (f.hasDefaultValue) {
        const d = f.default as unknown;
        const ds = typeof d === 'object' && d && 'name' in (d as object) ? `${(d as { name: string }).name}()` : JSON.stringify(d);
        notes.push(`default ${ds}`);
      }
      if (f.dbName) notes.push(`DB \`${f.dbName}\``);
      const c = comments.get(`${m.name}.${f.name}`);
      if (c) notes.push(c.replace(/\|/g, '/'));
      lines.push(`| ${f.name} | ${type} | ${f.isRequired && !f.isList ? 'ya' : '-'} | ${notes.join('; ').slice(0, 400)} |`);
    }
    const uniques = m.uniqueFields?.filter((u) => u.length > 1) ?? [];
    if (uniques.length) {
      lines.push('');
      lines.push(`Unik gabungan: ${uniques.map((u) => `(${u.join(', ')})`).join(', ')}`);
    }
  }
  lines.push('');
  lines.push('## Enum');
  for (const e of dm.enums) {
    lines.push('');
    lines.push(`- **${e.name}**: ${e.values.map((v) => `\`${v.name}\``).join(', ')}`);
  }
  return lines.join('\n');
}

// ============================================================
//  Agentic AI Guide
// ============================================================

export function agentGuideMarkdown(baseUrl: string): string {
  return `# ECC Core API — Panduan Agentic AI

Dokumen ini ditujukan untuk agen AI (dan developer) yang membaca, menambah, mengubah, atau menghapus data ECC melalui API secara massal (bulk) berdasarkan instruksi (prompt) dari anggota Team IT Minister. Baca bersama **API Reference** dan **Context Data Relations**.

Base URL: \`${baseUrl}\`

## 1. Autentikasi

1. Anggota Team IT Minister dengan role yang diizinkan membuat token di **Portal → Developer Tools → API Access → Buat token**. Token hanya ditampilkan sekali.
2. Setiap request ke \`/admin/*\` mengirim header:

\`\`\`http
Authorization: Bearer ecc_pat_xxxxxxxxxxxx_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
Content-Type: application/json
\`\`\`

3. Token bertindak **atas nama pemiliknya**: hak akses = Role Access pemilik (menu read/write/delete). Semua perubahan tercatat di Audit Log dengan nama pemilik + nama token.
4. Token otomatis ditolak (401) bila dicabut, kedaluwarsa, pemilik keluar dari Team IT Minister, atau role-nya tidak lagi diizinkan.
5. Token **tidak bisa**: membuat token baru, mengubah konfigurasi API Access, atau mengubah akun pribadi (\`/admin/me\` selain GET).
6. Simpan token sebagai secret (variabel lingkungan), jangan ditulis di prompt, log, atau repository.

Uji token: \`GET /admin/me\` → profil pemilik token.

## 2. Konvensi

- Respons sukses: \`{ "success": true, "data": …, "meta"?: { page, limit, total, totalPages } }\`.
- Respons gagal: \`{ "success": false, "error": { "code", "message", "details" } }\`. Untuk 400 \`VALIDATION_ERROR\`, \`details.fieldErrors\` berisi field yang salah — perbaiki lalu ulangi baris itu saja.
- Pagination: \`?page=&limit=\` (limit maks 500). Ambil semua halaman sampai \`page >= totalPages\`.
- ID = UUID. Tanggal \`YYYY-MM-DD\`. Waktu ISO-8601 UTC. Jam \`HH:mm\`. No HP E.164 (\`+628…\`; \`08…\` diterima dan dinormalisasi).
- PATCH = ubah sebagian (kirim field yang diubah saja). DELETE di banyak modul = soft delete / nonaktif (\`isActive=false\`) — cek deskripsi endpoint.
- Rate limit \`/admin\`: **300 request / menit per pengguna**. Respons 429 → tunggu lalu ulangi.

## 3. Pola kerja bulk yang aman

1. **Pahami permintaan** → tentukan modul & endpoint dari API Reference, field dari Context Data Relations.
2. **Baca dulu (dry-run)**: ambil data saat ini (GET), cocokkan baris input ke data yang ada (pakai kunci unik: \`kode\` jemaat, No HP, email, \`slug\`, nama + cabang).
3. **Susun rencana** berupa tabel: baris → aksi (CREATE / UPDATE field X→Y / DELETE / SKIP + alasan). Tampilkan ringkasan ke manusia dan **minta konfirmasi eksplisit** sebelum menulis apa pun. Untuk DELETE selalu konfirmasi terpisah.
4. **Eksekusi bertahap**: maks 5 request paralel, batch ±50 baris, jeda bila mendekati rate limit. Gunakan endpoint bulk bila tersedia (mis. \`POST /admin/reservasi/bulk\`, \`POST /admin/event/:id/peserta/batch\`, \`POST /admin/homecell/:homecellId/schedule/:scheduleId/attendance/bulk\`, \`POST /admin/jemaat/import/preview\` → \`/import/commit\`, \`POST /admin/jemaat-consolidation/preview\` → \`/apply\`).
5. **Idempoten**: sebelum CREATE cek apakah data sudah ada; jangan membuat duplikat saat mengulang batch yang gagal.
6. **Laporan akhir**: jumlah berhasil / gagal per aksi + daftar baris gagal beserta \`error.message\`.

## 4. Aturan wajib untuk agen

- Jangan mengubah \`DATA_ENCRYPTION_KEY\`, kredensial, konfigurasi server, atau data di luar permintaan.
- Jangan menghapus massal tanpa konfirmasi manusia per batch. Utamakan nonaktif (soft delete).
- Jangan membuat data uji di production.
- Data pribadi jemaat (No HP, email, alamat, tanggal lahir) hanya dipakai untuk tugas yang diminta; jangan dikirim ke layanan lain.
- Bila ragu tentang pemetaan field / data mana yang dimaksud → tanyakan, jangan menebak.
- Hormati 403: artinya pemilik token tidak punya akses menu itu — jangan mencoba endpoint lain untuk mengakalinya.

## 5. Contoh

\`\`\`bash
# Cari jemaat
curl -s "${baseUrl}/admin/jemaat?search=andi&limit=20" -H "Authorization: Bearer $ECC_TOKEN"

# Ubah sebagian data jemaat
curl -s -X PATCH "${baseUrl}/admin/jemaat/<id>" \\
  -H "Authorization: Bearer $ECC_TOKEN" -H "Content-Type: application/json" \\
  -d '{"alamat":"Jl. Contoh No. 1, Bandung"}'
\`\`\`

\`\`\`python
import os, time, requests
BASE = "${baseUrl}"
H = {"Authorization": f"Bearer {os.environ['ECC_TOKEN']}"}

def get_all(path, **params):
    page, out = 1, []
    while True:
        r = requests.get(f"{BASE}{path}", headers=H, params={**params, "page": page, "limit": 200})
        r.raise_for_status(); body = r.json()
        out += body["data"]
        meta = body.get("meta") or {}
        if page >= meta.get("totalPages", 1): return out
        page += 1

def call(method, path, json=None):
    for attempt in range(5):
        r = requests.request(method, f"{BASE}{path}", headers=H, json=json)
        if r.status_code == 429: time.sleep(2 ** attempt); continue
        return r.status_code, r.json()
\`\`\`

## 6. Prompt contoh untuk agen

> "Gunakan dokumen ECC API Reference & Context Data Relations. Dari file CSV terlampir (kolom: kode, alamat), perbarui alamat jemaat yang cocok berdasarkan \`kode\`. Lakukan dry-run dulu, tampilkan tabel perubahan, tunggu persetujuan saya, lalu eksekusi bertahap dan laporkan hasilnya."
`;
}

export const DEV_DOCS = {
  'agent-guide': { title: 'Panduan Agentic AI', file: 'ecc-agentic-ai-guide' },
  api: { title: 'API Reference', file: 'ecc-api-reference' },
  relations: { title: 'Context Data Relations', file: 'ecc-data-relations' },
} as const;
export type DevDocKey = keyof typeof DEV_DOCS;
