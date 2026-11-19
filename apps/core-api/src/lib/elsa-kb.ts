/**
 * Elsa Knowledge Base — panduan workflow, kasus, tampilan & troubleshooting
 * fitur ECC (app, Portal, CKids) supaya Elsa bisa jadi narasumber admin di
 * lapangan.
 *
 * Sumber: file markdown di `apps/core-api/knowledge/*.md` (ikut repo & deploy;
 * diperbarui tiap rilis). Format tiap file:
 *
 *   ---
 *   id: checkin-scan
 *   title: ...
 *   tags: kata, kunci, ...
 *   summary: ...
 *   ---
 *   # Judul
 *   ## Bagian 1
 *   ...
 *
 * Pencarian: sederhana & tanpa dependensi — skor kata kunci per bagian (##),
 * bobot lebih untuk judul bagian, tag, dan judul file. Dimuat sekali lalu
 * di-cache (cek ulang mtime tiap 60 detik agar perubahan file ikut terbaca).
 */
import fs from 'node:fs';
import path from 'node:path';

export interface KbDoc {
  id: string;
  title: string;
  tags: string[];
  summary: string;
  body: string;
  sections: KbSection[];
}

export interface KbSection {
  docId: string;
  docTitle: string;
  heading: string;
  text: string;
  tokens: Map<string, number>;
  headTokens: Set<string>;
}

const DIR_CANDIDATES = [
  path.resolve(__dirname, '../../knowledge'), // dist/lib → apps/core-api/knowledge ; src/lib → sama
  path.resolve(process.cwd(), 'knowledge'),
  path.resolve(process.cwd(), 'apps/core-api/knowledge'),
];

const STOP = new Set(
  (
    'yang dan di ke dari untuk dengan atau ini itu ada tidak bisa apa saja juga sudah belum akan pada dalam oleh saat ' +
    'agar karena jika kalau bila maka lalu jadi masih hanya lebih sama seperti mau ingin tolong bagaimana gimana kenapa ' +
    'mengapa kok sih dong ya apakah berapa siapa kapan mana dimana tersebut kami kita saya aku anda kamu dia mereka ' +
    'the a an of to in on for and or is are be how why what when where who can not with my our your'
  ).split(' '),
);

/** Normalisasi kata: huruf kecil, buang tanda baca, buang imbuhan umum yang aman. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/check-in|checkin/g, 'checkin')
    .replace(/walk-in|walkin/g, 'walkin')
    .replace(/[^a-z0-9à-ÿ]+/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 2 && !STOP.has(w))
    .map(stem);
}

function stem(w: string): string {
  if (w.length <= 5) return w;
  // Imbuhan akhir yang sering: -nya, -kan, -an (aman untuk pencarian kasar).
  for (const suf of ['nya', 'kan', 'lah']) if (w.endsWith(suf) && w.length - suf.length >= 4) return w.slice(0, -suf.length);
  return w;
}

function parseDoc(raw: string, fallbackId: string): KbDoc {
  let meta: Record<string, string> = {};
  let body = raw;
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  if (m) {
    body = raw.slice(m[0].length);
    meta = Object.fromEntries(
      m[1]!
        .split('\n')
        .map((l) => {
          const i = l.indexOf(':');
          return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : null;
        })
        .filter((x): x is [string, string] => !!x),
    );
  }
  const id = meta.id || fallbackId;
  const title = meta.title || id;
  const tags = (meta.tags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const doc: KbDoc = { id, title, tags, summary: meta.summary ?? '', body: body.trim(), sections: [] };

  // Pecah per "## " (bagian sebelum ## pertama = pengantar).
  const parts = doc.body.split(/\n(?=## )/);
  for (const p of parts) {
    const hm = /^##\s+(.+)$/m.exec(p);
    const heading = hm && p.startsWith('## ') ? hm[1]!.trim() : 'Ringkasan';
    const text = p.replace(/^#\s+.+\n?/, '').trim();
    if (!text) continue;
    const tokens = new Map<string, number>();
    for (const t of tokenize(text)) tokens.set(t, (tokens.get(t) ?? 0) + 1);
    doc.sections.push({ docId: id, docTitle: title, heading, text, tokens, headTokens: new Set(tokenize(heading)) });
  }
  return doc;
}

let cache: { dir: string | null; stamp: string; docs: KbDoc[]; checkedAt: number } | null = null;

function kbDir(): string | null {
  for (const d of DIR_CANDIDATES) {
    try {
      if (fs.statSync(d).isDirectory()) return d;
    } catch {
      /* lanjut */
    }
  }
  return null;
}

export function loadKb(force = false): KbDoc[] {
  const now = Date.now();
  if (!force && cache && now - cache.checkedAt < 60_000) return cache.docs;
  const dir = kbDir();
  if (!dir) {
    cache = { dir: null, stamp: '', docs: [], checkedAt: now };
    return [];
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort();
  const stamp = files.map((f) => `${f}:${fs.statSync(path.join(dir, f)).mtimeMs}`).join('|');
  if (!force && cache && cache.stamp === stamp) {
    cache.checkedAt = now;
    return cache.docs;
  }
  const docs = files.map((f) => parseDoc(fs.readFileSync(path.join(dir, f), 'utf8'), f.replace(/\.md$/, '')));
  cache = { dir, stamp, docs, checkedAt: now };
  return docs;
}

/** Daftar ringkas untuk system prompt: "- id — judul: ringkasan". */
export function kbIndex(): string {
  return loadKb()
    .map((d) => `- ${d.id} — ${d.title}: ${d.summary}`)
    .join('\n');
}

export function listGuides() {
  return loadKb().map((d) => ({ id: d.id, title: d.title, summary: d.summary, sections: d.sections.map((s) => s.heading) }));
}

const MAX_SECTION_CHARS = 3500;
const MAX_DOC_CHARS = 16000;

/** Cari bagian panduan paling relevan. */
export function searchGuides(query: string, limit = 4) {
  const docs = loadKb();
  const q = [...new Set(tokenize(query))];
  if (!q.length) return { query, results: [] as unknown[] };
  const scored: { s: KbSection; score: number }[] = [];
  for (const d of docs) {
    const tagTokens = new Set(tokenize(d.tags.join(' ')));
    const titleTokens = new Set(tokenize(d.title));
    for (const s of d.sections) {
      let score = 0;
      let matched = 0;
      for (const t of q) {
        let tf = s.tokens.get(t) ?? 0;
        // Cocok awalan (mis. "verifikasi" ↔ "verifikasinya").
        if (!tf && t.length >= 5) for (const [k, v] of s.tokens) if (k.length >= 5 && (k.startsWith(t) || t.startsWith(k))) tf += v;
        if (tf) {
          score += Math.min(tf, 3);
          matched++;
        }
        if (s.headTokens.has(t)) score += 3;
        if (tagTokens.has(t)) score += 1.5;
        if (titleTokens.has(t)) score += 1;
      }
      // Utamakan bagian yang memuat lebih banyak kata kunci berbeda.
      const coverage = matched / q.length;
      score *= 0.4 + coverage * coverage * 1.6;
      if (score > 0) scored.push({ s, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, Math.max(1, Math.min(limit, 8))).map(({ s, score }) => ({
    guide: s.docId,
    guideTitle: s.docTitle,
    section: s.heading,
    score: Math.round(score * 10) / 10,
    text: s.text.length > MAX_SECTION_CHARS ? `${s.text.slice(0, MAX_SECTION_CHARS)}…` : s.text,
  }));
  return { query, results };
}

/** Baca satu panduan utuh (dipotong bila sangat panjang). */
export function readGuide(id: string) {
  const docs = loadKb();
  const key = id.trim().toLowerCase();
  const d = docs.find((x) => x.id === key) ?? docs.find((x) => x.id.includes(key) || x.title.toLowerCase().includes(key));
  if (!d) return { error: `Panduan "${id}" tidak ditemukan.`, available: docs.map((x) => x.id) };
  return {
    id: d.id,
    title: d.title,
    content: d.body.length > MAX_DOC_CHARS ? `${d.body.slice(0, MAX_DOC_CHARS)}\n…(dipotong — gunakan cari_panduan untuk bagian lain)` : d.body,
  };
}
