/**
 * Elsa (Els Agentic) — AI chat endpoint untuk ECC data.
 *
 * Modul 31. Fulltimer-only. Powered by Anthropic (Claude 3.5 Haiku) via
 * lib/elsa-client.ts. Pattern adopted dari ide.asia /agent:
 *   - Language lock double reinforcement (system prompt + repeated per iter)
 *   - [ACTIONS] block sanitizer di response — mobile-style action buttons
 *   - Rate limiter 60 req/min per IP+cookie
 *   - Message + history length limits
 *
 * Endpoints:
 *   POST /admin/elsa/chat   — { messages, lang } → { reply, actions, usage, iterations }
 *   GET  /admin/elsa/health — cek ANTHROPIC_API_KEY + model ready
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireFulltimer } from '../../middleware/require-auth.js';
import { BadRequest, ApiError } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { runAgenticLoop, type ElsaMessage, type ElsaTool } from '../../lib/elsa-client.js';
import { logger } from '../../lib/logger.js';
import {
  ENTITY_MAP,
  listEntities,
  describeEntity,
  queryEntity,
  countEntity,
  groupByEntity,
} from '../../lib/elsa-query.js';
import { kbIndex, listGuides, readGuide, searchGuides } from '../../lib/elsa-kb.js';

export const elsaRouter = Router();
elsaRouter.use(requireFulltimer);

// ============================================================
//  Rate limit — longer window (15 menit) supaya user tidak sering hit 429
// ============================================================
// 500 req per 15 menit per user+IP. Rate rata-rata ~33/menit sustained
// tapi allow burst (mis. multi-iteration tool calling). Upstream Anthropic
// tier 1 limit: 50 RPM Haiku — jika hit 429 upstream, message dgn code
// ELSA_UPSTREAM_RATE_LIMIT terpisah.
// Rate limit longgar: 2000 req per 30 menit per user+IP.
// Sustained rate ~66 RPM avg — jauh di bawah Anthropic tier 1 limit (50 RPM Haiku
// spike) tapi user bisa burst ratusan request tanpa hit local limit.
// Upstream Anthropic 429 di-handle terpisah dgn code ELSA_UPSTREAM_RATE_LIMIT.
const chatLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 menit window
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.user?.sub ?? '';
    const ip = ((req.headers['x-forwarded-for'] as string || '').split(',')[0] ?? '').trim() || req.ip || '';
    return `${userId}::${ip}`;
  },
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_LOCAL',
      message: 'Terlalu banyak request Elsa (>2000 dalam 30 menit). Tunggu beberapa menit.',
    },
  },
});

// ============================================================
//  Health check
// ============================================================
elsaRouter.get('/health', (_req, res) => {
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  const model = process.env.ELSA_MODEL ?? 'claude-haiku-4-5-20251001';
  res.json({
    success: true,
    data: {
      ready: hasKey,
      model,
      provider: 'anthropic',
      message: hasKey
        ? 'Elsa siap. Chat via POST /admin/elsa/chat'
        : 'ANTHROPIC_API_KEY belum di-set. Cek .env di server.',
    },
  });
});

// ============================================================
//  Tool definitions — Anthropic format
// ============================================================

const TOOLS: ElsaTool[] = [
  {
    name: 'cari_panduan',
    description:
      'Cari di PANDUAN RESMI ECC (workflow, aturan, tampilan app & Portal, pesan error, troubleshooting lapangan). WAJIB dipakai untuk pertanyaan "bagaimana / kenapa / tidak bisa / error / di mana menunya / aturannya apa". Return bagian panduan paling relevan.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Kata kunci kasus dalam BAHASA INDONESIA (panduan berbahasa Indonesia, terjemahkan bila user memakai bahasa lain), mis. "scan ditolak check-in ditutup", "koordinator tidak bisa atur jadwal".' },
        limit: { type: 'integer', description: 'Jumlah bagian (default 4, max 8).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'baca_panduan',
    description: 'Baca satu panduan utuh berdasarkan id (lihat daftar PANDUAN di system prompt). Pakai bila butuh gambaran lengkap satu fitur.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Id panduan, mis. "checkin-scan", "event", "pelayanan".' } },
      required: ['id'],
    },
  },
  {
    name: 'list_entities',
    description:
      'List semua entity database ECC yang bisa di-query oleh Elsa. Return name + description + keyFields tiap entity. WAJIB dipanggil dulu sebelum query_entity kalau belum tahu entity apa yang tersedia.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'describe_entity',
    description:
      'Deskripsi detail 1 entity: fields, relations yang boleh di-include, fields yang di-exclude, dan example query. Pakai ini SEBELUM query_entity kalau butuh tahu struktur data + relation yang tersedia.',
    input_schema: {
      type: 'object',
      properties: {
        entity: {
          type: 'string',
          description: 'Nama entity dari list_entities (mis. "jemaat", "ibadah", "event").',
        },
      },
      required: ['entity'],
    },
  },
  {
    name: 'query_entity',
    description:
      'Query rows dari 1 entity dgn filter + include relation + orderBy + limit. Return array of rows. Max 50 records per query. Include hanya relations yang whitelisted (cek describe_entity).',
    input_schema: {
      type: 'object',
      properties: {
        entity: {
          type: 'string',
          description: 'Nama entity target query.',
        },
        filter: {
          type: 'object',
          description:
            'Prisma-style where clause. Contoh: { isActive: true, cabangId: "uuid" }, atau { namaLengkap: { contains: "Ari", mode: "insensitive" } }.',
        },
        include: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array nama relation. Cek allowedRelations di describe_entity.',
        },
        orderBy: {
          type: 'object',
          description: 'Prisma orderBy, mis. { createdAt: "desc" } atau { namaLengkap: "asc" }.',
        },
        limit: {
          type: 'integer',
          description: 'Max records return (default 20, max 50).',
        },
      },
      required: ['entity'],
    },
  },
  {
    name: 'count_entity',
    description:
      'Hitung TOTAL rows di 1 entity dgn optional filter. Return { count }. Pakai untuk pertanyaan "berapa jumlah X?" tanpa perlu load semua data.',
    input_schema: {
      type: 'object',
      properties: {
        entity: { type: 'string', description: 'Nama entity.' },
        filter: {
          type: 'object',
          description: 'Prisma where clause. Kosongkan untuk count all.',
        },
      },
      required: ['entity'],
    },
  },
  {
    name: 'groupby_entity',
    description:
      'Aggregate groupBy — count rows di 1 entity di-group by field(s). Contoh: groupBy jemaat by cabangId → count per cabang. Return array of { <field>: value, _count: n }.',
    input_schema: {
      type: 'object',
      properties: {
        entity: { type: 'string', description: 'Nama entity.' },
        by: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array field name untuk grouping. Mis. ["cabangId"] atau ["status", "cabangId"].',
        },
        filter: {
          type: 'object',
          description: 'Prisma where filter sebelum grouping.',
        },
        limit: {
          type: 'integer',
          description: 'Max groups return (default 20, max 50).',
        },
      },
      required: ['entity', 'by'],
    },
  },
];

// ============================================================
//  Tool executor
// ============================================================

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case 'cari_panduan': {
        const query = String(input.query ?? '').trim();
        if (!query) return JSON.stringify({ error: 'query required' });
        return JSON.stringify(searchGuides(query, typeof input.limit === 'number' ? input.limit : 4));
      }

      case 'baca_panduan': {
        const id = String(input.id ?? '').trim();
        if (!id) return JSON.stringify({ error: 'id required', available: listGuides().map((g) => g.id) });
        return JSON.stringify(readGuide(id));
      }

      case 'list_entities':
        return JSON.stringify(listEntities());

      case 'describe_entity': {
        const entity = String(input.entity ?? '').trim();
        if (!entity) return JSON.stringify({ error: 'entity required' });
        return JSON.stringify(describeEntity(entity));
      }

      case 'query_entity': {
        const entity = String(input.entity ?? '').trim();
        if (!entity) return JSON.stringify({ error: 'entity required' });
        const result = await queryEntity({
          entity,
          filter: (input.filter as Record<string, unknown>) ?? undefined,
          include: (input.include as string[]) ?? undefined,
          orderBy: (input.orderBy as Record<string, 'asc' | 'desc'>) ?? undefined,
          limit: typeof input.limit === 'number' ? input.limit : undefined,
        });
        return JSON.stringify(result);
      }

      case 'count_entity': {
        const entity = String(input.entity ?? '').trim();
        if (!entity) return JSON.stringify({ error: 'entity required' });
        const result = await countEntity({
          entity,
          filter: (input.filter as Record<string, unknown>) ?? undefined,
        });
        return JSON.stringify(result);
      }

      case 'groupby_entity': {
        const entity = String(input.entity ?? '').trim();
        const by = input.by as string[];
        if (!entity || !Array.isArray(by) || by.length === 0) {
          return JSON.stringify({ error: 'entity + by (array) required' });
        }
        const result = await groupByEntity({
          entity,
          by,
          filter: (input.filter as Record<string, unknown>) ?? undefined,
          limit: typeof input.limit === 'number' ? input.limit : undefined,
        });
        return JSON.stringify(result);
      }

      default:
        return JSON.stringify({ error: `unknown tool: ${name}` });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return JSON.stringify({ error: msg });
  }
}


// ============================================================
//  [ACTIONS] block sanitizer — adopted dari ide.asia /agent
// ============================================================

interface ElsaAction {
  type: 'navigate' | 'external' | 'contact_admin';
  label: string;
  url?: string;
  message?: string;
}

const ALLOWED_ACTION_TYPES = ['navigate', 'external', 'contact_admin'] as const;

/**
 * Parse [ACTIONS]{"actions":[...]}[/ACTIONS] block dari LLM response.
 * Return { cleanText, actions } — cleanText tanpa block, actions valid saja
 * (max 2, whitelist type, sanitize url/message).
 */
function parseActionsBlock(raw: string): { cleanText: string; actions: ElsaAction[] } {
  const match = raw.match(/\[ACTIONS\]\s*(\{[\s\S]*?\})\s*\[\/ACTIONS\]/);
  if (!match) return { cleanText: raw, actions: [] };

  const cleanText = raw.replace(match[0], '').trim();
  let actions: ElsaAction[] = [];
  try {
    const parsed = JSON.parse(match[1] as string);
    if (Array.isArray(parsed.actions)) {
      actions = parsed.actions
        .slice(0, 2)
        .filter((a: unknown): a is Record<string, unknown> => !!a && typeof a === 'object')
        .map((a: Record<string, unknown>): ElsaAction | null => {
          const type = a.type as string;
          if (!ALLOWED_ACTION_TYPES.includes(type as (typeof ALLOWED_ACTION_TYPES)[number])) return null;
          const label = typeof a.label === 'string' ? a.label.slice(0, 60) : '';
          if (!label) return null;
          const action: ElsaAction = { type: type as ElsaAction['type'], label };
          if (type === 'navigate' || type === 'external') {
            const url = typeof a.url === 'string' ? a.url : '';
            if (type === 'navigate' && !url.startsWith('/')) return null;
            if (type === 'external' && !url.startsWith('https://')) return null;
            if (url.length > 200) return null;
            action.url = url;
          }
          if (typeof a.message === 'string') {
            action.message = a.message.slice(0, 300);
          }
          return action;
        })
        .filter((a: ElsaAction | null): a is ElsaAction => a !== null);
    }
  } catch {
    // Silent — return empty actions
  }
  return { cleanText, actions };
}

// ============================================================
//  System prompts + language lock
// ============================================================

function baseSystemPrompt(lang: 'id' | 'en'): string {
  const langName = lang === 'id' ? 'Bahasa Indonesia' : 'English';
  const entityList = Object.keys(ENTITY_MAP).join(', ');
  const base = lang === 'id'
    ? `Kamu adalah Elsa (Els Agentic), asisten AI untuk data ECC (Elshaddai Creative Community) — sebuah gereja. Kamu membantu admin fulltimer menjawab pertanyaan tentang SEMUA data operasional gereja.

INSTRUKSI UMUM:
- Jawab dalam ${langName} yang natural + ringkas.
- Selalu pakai TOOLS untuk fetch data actual — jangan pernah mengarang angka atau nama.
- Kalau data tidak ditemukan, jujur bilang "tidak ada data yang cocok".
- Jangan expose data sensitif seperti password, JWT token, atau financial detail.
- Format response: pakai bullet list untuk multi-item data.

TOOLS — DYNAMIC ENTITY QUERY:
Kamu punya 5 tools untuk akses SEMUA ${Object.keys(ENTITY_MAP).length} entity di database ECC:

1. **list_entities()** — list semua entity available (name + description + keyFields)
2. **describe_entity(entity)** — detail 1 entity: fields, relations, exclude, example
3. **query_entity({ entity, filter, include, orderBy, limit })** — fetch rows (max 50)
4. **count_entity({ entity, filter })** — hitung total
5. **groupby_entity({ entity, by, filter, limit })** — aggregate group by field

STRATEGI:
- **Kalau tidak tahu entity yang tepat** → call list_entities() dulu
- **Kalau butuh tahu relation atau field spesifik** → call describe_entity() sebelum query
- **Untuk count / berapa jumlah** → pakai count_entity (lebih murah dari query_entity)
- **Untuk breakdown per kategori** (mis. per cabang) → pakai groupby_entity
- **Untuk detail row** → query_entity dgn include relations yg butuh

ENTITY TERSEDIA (${Object.keys(ENTITY_MAP).length}):
${entityList}

CONTOH:
- "berapa jemaat aktif di ECC Bandung?" → describe_entity("cabang") → cari id cabang Bandung via query_entity → count_entity("jemaat", { cabangId: "<uuid>", isActive: true })
- "event apa saja bulan ini?" → query_entity({ entity: "event", filter: { tanggalMulai: { gte: "...", lte: "..." } }, include: ["cabang"], orderBy: { tanggalMulai: "asc" } })
- "keluarga Ari siapa aja?" → query_entity({ entity: "jemaat", filter: { namaLengkap: { contains: "Ari", mode: "insensitive" } } }) → dapat id → query_entity({ entity: "jemaat_relasi", filter: { jemaatId: "<uuid>" }, include: ["jemaatTerkait", "tipeRelasi"] })
- "point balance semua anak" → query_entity({ entity: "jemaat_point_balance", include: ["jemaat", "cabang"], orderBy: { balance: "desc" } })
- "homecell paling aktif" → groupby_entity({ entity: "homecell_attendance", by: ["scheduleId"], limit: 10 })

CATATAN noHp: Field noHp di DB pakai format E.164 internasional (+62..., +65..., +61..., dll). User bisa tulis "08...", "62...", "+62..." atau nomor luar negeri dengan kode negara — backend auto-normalize sebelum query. Contoh filter valid semua: { noHp: "081234567890" }, { noHp: { contains: "0812" } }, { noHp: "+6281234567890" }.

CATATAN FITUR (data terbaru):
- Tamu = jemaat dgn isTamu true. Kategori tamu: jemaat.tamuKategori (NEW_COMER / VISITOR; null pada data lama = VISITOR). "Tamu saya" → jemaat_tamu; tamu homecell → homecell_tamu.
- Prayer request → prayer_request (isi doa pribadi, tidak tersedia). Petugas doa = role (prayer_petugas_role) ATAU anggota ministry (prayer_petugas_pelayanan).
- Ulasan ibadah/event → service_review (rating 1–5). Ibadah/event dgn allowReview false = ulasan dimatikan.
- Urutan tampil ibadah di app = ibadah.urutan (kecil dulu).
- Lokasi: cabang/ibadah/homecell punya mapsUrl (link Google Maps). Peta jemaat → jemaat_geocode.
- Catatan khotbah pribadi jemaat & jurnal Bible 365 TIDAK bisa diakses (privasi) — tolak dengan sopan bila ditanya isinya.

Prisma filter syntax:
- Equality: { field: value }
- Contains: { field: { contains: "text", mode: "insensitive" } }
- Range: { field: { gte: value, lte: value } }
- In list: { field: { in: [...] } }
- Nested relation filter: { relationField: { subField: value } }`
    : `You are Elsa (Els Agentic), an AI assistant for ECC (Elshaddai Creative Community) church data. You help fulltimer admins answer questions about ALL church operational data.

GENERAL INSTRUCTIONS:
- Answer in natural, concise ${langName}.
- Always use TOOLS to fetch actual data — never fabricate numbers or names.
- If data not found, honestly say "no matching data".
- Never expose sensitive data like passwords, JWT tokens, or financial details.
- Format: use bullet lists for multi-item data.

TOOLS — DYNAMIC ENTITY QUERY:
You have 5 tools to access ALL ${Object.keys(ENTITY_MAP).length} entities in ECC database:

1. **list_entities()** — list all available entities
2. **describe_entity(entity)** — details of 1 entity: fields, relations, exclusions
3. **query_entity({ entity, filter, include, orderBy, limit })** — fetch rows (max 50)
4. **count_entity({ entity, filter })** — count total
5. **groupby_entity({ entity, by, filter, limit })** — aggregate group by field

STRATEGY:
- **Unknown entity** → call list_entities() first
- **Need to know relations/fields** → call describe_entity() before query
- **For counts** → use count_entity (cheaper than query)
- **For per-category breakdown** → use groupby_entity
- **For detail rows** → query_entity with include relations

AVAILABLE ENTITIES (${Object.keys(ENTITY_MAP).length}):
${entityList}

EXAMPLES:
- "how many active members in Bandung branch?" → describe_entity("cabang") → find Bandung id via query_entity → count_entity("jemaat", { cabangId: "<uuid>", isActive: true })
- "events this month?" → query_entity({ entity: "event", filter: { tanggalMulai: { gte: "...", lte: "..." } }, include: ["cabang"], orderBy: { tanggalMulai: "asc" } })
- "Ari's family members?" → find Ari via query_entity jemaat → query_entity({ entity: "jemaat_relasi", filter: { jemaatId: "<uuid>" }, include: ["jemaatTerkait", "tipeRelasi"] })
- "all kids point balances" → query_entity({ entity: "jemaat_point_balance", include: ["jemaat", "cabang"], orderBy: { balance: "desc" } })
- "most active homecells" → groupby_entity({ entity: "homecell_attendance", by: ["scheduleId"], limit: 10 })

CATATAN noHp: Field noHp di DB pakai format E.164 internasional (+62..., +65..., +61..., dll). User bisa tulis "08...", "62...", "+62..." atau nomor luar negeri dengan kode negara — backend auto-normalize sebelum query. Contoh filter valid semua: { noHp: "081234567890" }, { noHp: { contains: "0812" } }, { noHp: "+6281234567890" }.

Prisma filter syntax:
- Equality: { field: value }
- Contains: { field: { contains: "text", mode: "insensitive" } }
- Range: { field: { gte: value, lte: value } }
- In list: { field: { in: [...] } }
- Nested relation filter: { relationField: { subField: value } }`;

  const actionsGuide = lang === 'id'
    ? `

CAPABILITIES — ACTION BUTTONS:
Kamu bisa suggest tombol aksi clickable dgn append JSON block di baris TERAKHIR reply.

Format (single line, last line):
[ACTIONS]{"actions":[{"type":"navigate","label":"Buka daftar jemaat","url":"/dashboard/jemaat"}]}[/ACTIONS]

Types tersedia:
- "navigate" — internal portal route. Required: label, url (WAJIB start dgn "/"). Contoh URL: /dashboard/jemaat, /dashboard/jemaat/<uuid>, /dashboard/event, /dashboard/homecell, /dashboard/hadiah?cabangId=<uuid>
- "external" — external URL. Required: label, url (WAJIB start dgn "https://")
- "contact_admin" — trigger contact form ke tim IDEA. Required: label. Optional: message (pre-filled text)

Rules:
- Max 2 actions per reply
- SKIP [ACTIONS] kalau reply cuma informational (tidak butuh follow-up)
- Kalau ada URL dgn UUID dari tool result, PASTIKAN UUID dari tool result tsb (jangan buat sendiri)
- Label ringkas (< 40 chars)
- Place block STRICTLY di baris terakhir reply, sendirian`
    : `

CAPABILITIES — ACTION BUTTONS:
You can suggest clickable action buttons by appending a JSON block on the LAST line of your reply.

Format (single line, last line):
[ACTIONS]{"actions":[{"type":"navigate","label":"Open members list","url":"/dashboard/jemaat"}]}[/ACTIONS]

Available types:
- "navigate" — internal portal route. Required: label, url (MUST start with "/"). Example URLs: /dashboard/jemaat, /dashboard/jemaat/<uuid>, /dashboard/event, /dashboard/homecell, /dashboard/hadiah?cabangId=<uuid>
- "external" — external URL. Required: label, url (MUST start with "https://")
- "contact_admin" — trigger contact form to IDEA team. Required: label. Optional: message (pre-filled text)

Rules:
- Max 2 actions per reply
- SKIP [ACTIONS] if reply is purely informational (no follow-up needed)
- If URL has UUID from tool result, ENSURE UUID is from tool response (never invent)
- Label concise (< 40 chars)
- Place block STRICTLY on the last line, alone`;

  return base + narasumberGuide(lang) + actionsGuide;
}

/** Peran narasumber lapangan: panduan resmi + diagnosis dengan data. */
function narasumberGuide(lang: 'id' | 'en'): string {
  const today = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
  const index = kbIndex() || '(panduan belum tersedia di server)';
  return lang === 'id'
    ? `

PERAN NARASUMBER LAPANGAN:
Selain menjawab data, kamu adalah narasumber operasional untuk admin & fulltimer ECC yang sedang kesulitan di lapangan (hari H ibadah/event, scan, pendaftaran, pelayanan, homecell, dll). Waktu server sekarang: ${today} (WIB). Jam ibadah/event selalu memakai zona waktu cabang.

PANDUAN RESMI (pakai tools cari_panduan / baca_panduan):
${index}

CARA MENJAWAB:
1. Pertanyaan cara / alur / aturan / kenapa / tidak bisa / pesan error / letak menu → WAJIB cari_panduan dulu (atau baca_panduan bila topiknya jelas). Jawab sesuai panduan; JANGAN mengarang aturan, nama menu, atau angka.
2. Kasus nyata (menyebut orang, ibadah/event, tanggal, atau pesan error) → setelah panduan, CEK DATA dengan query_entity/count_entity (hanya baca) mengikuti bagian "Diagnosis" di panduan, untuk memastikan penyebabnya (mis. hak scan petugas, jadwal & jam ibadah, status reservasi/pendaftaran/pembayaran, otoritas koordinator).
3. Bila informasi kurang, tanyakan maksimal 2 hal terpenting (mis. nama/kode jemaat, ibadah/event & tanggal, pesan error persis, versi app).
4. Format jawaban kasus, ringkas: **Penyebab** → **Solusi** (langkah bernomor, sebut menu Portal / layar app persis) → **Siapa yang bisa melakukan**. Tambahkan tombol navigate ke halaman Portal terkait bila berguna.
5. Aturan yang sengaja membatasi (batas usia CKids, batas batal event, jendela check-in) dijelaskan alasannya + jalur resminya; jangan menyarankan cara mengakali.
6. Bila panduan & data tidak cukup, katakan jujur dan sarankan menghubungi tim IT (aksi contact_admin).`
    : `

FIELD SUPPORT ROLE:
Besides data questions, you are the operational go-to for ECC admins & fulltimers facing problems in the field (service/event day, scanning, registration, ministry, homecell, etc.). Current server time: ${today} (WIB). Service/event times always use the branch time zone.

OFFICIAL GUIDES (written in Indonesian; use tools cari_panduan / baca_panduan):
${index}

HOW TO ANSWER:
1. How-to / workflow / rules / why / can't / error message / where-is-the-menu questions → ALWAYS call cari_panduan first (or baca_panduan if the topic is clear). Answer from the guide; NEVER invent rules, menu names, or numbers. Keep Portal/app menu names as written (Indonesian) when referring to them.
2. Real cases (a person, service/event, date, or error message) → after the guide, CHECK DATA with query_entity/count_entity (read-only) following the guide's "Diagnosis" section to confirm the cause.
3. If information is missing, ask at most 2 key things (member name/code, service/event & date, exact error message, app version).
4. Case answer format, concise: **Cause** → **Fix** (numbered steps, exact Portal menu / app screen) → **Who can do it**. Add a navigate button to the relevant Portal page when useful.
5. Intentional limits (CKids age limit, event cancellation limits, check-in window) — explain the reason and the official path; never suggest workarounds.
6. If guides & data aren't enough, say so honestly and suggest contacting the IT team (contact_admin action).`;
}

function languageLockMessage(lang: 'id' | 'en'): string {
  const langName = lang === 'id' ? 'Bahasa Indonesia' : 'English';
  return lang === 'id'
    ? `KUNCI BAHASA — SANGAT PENTING:
User memilih ${langName} sebagai bahasa sesi. Kamu WAJIB merespons HANYA dalam ${langName} sepanjang percakapan, TIDAK PEDULI dalam bahasa apa user mengetik. Jangan pernah ganti bahasa di tengah percakapan.`
    : `LANGUAGE LOCK — VERY IMPORTANT:
The user has selected ${langName} as their session language. You MUST respond ONLY in ${langName} for the entire conversation, REGARDLESS of what language the user types in. Never switch languages mid-conversation.`;
}

// ============================================================
//  POST /chat
// ============================================================

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(2000),
      }),
    )
    .min(1)
    .max(20),
  lang: z.enum(['id', 'en']).default('id'),
});

elsaRouter.post('/chat', chatLimiter, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ApiError(
      503,
      'ELSA_NOT_CONFIGURED',
      'Elsa belum di-setup. Admin sistem perlu set ANTHROPIC_API_KEY di server .env dan restart core-api.',
    );
  }

  const input = chatSchema.parse(req.body);

  // Enforce message length — last user message max 1000 chars (input-side)
  const lastMsg = input.messages[input.messages.length - 1];
  if (lastMsg && lastMsg.role === 'user' && lastMsg.content.length > 1000) {
    throw BadRequest('Pesan terlalu panjang (max 1000 karakter).');
  }

  // Slice history max 10 turns (client mungkin kirim lebih)
  const trimmedMessages = input.messages.slice(-10);

  const start = Date.now();

  try {
    const result = await runAgenticLoop({
      system: baseSystemPrompt(input.lang),
      messages: trimmedMessages as ElsaMessage[],
      tools: TOOLS,
      toolExecutor: executeTool,
      // Panduan + beberapa query data untuk diagnosis kasus lapangan.
      maxIterations: 12,
      langLockMessage: languageLockMessage(input.lang),
    });

    // Parse [ACTIONS] block
    const { cleanText, actions } = parseActionsBlock(result.finalText);

    audit(req, {
      action: 'CREATE',
      resource: 'elsa_chat',
      resourceLabel: `Elsa chat (${input.lang}, ${result.iterations} iter, ${result.usage.inputTokens}+${result.usage.outputTokens} tokens)`,
      metadata: {
        lang: input.lang,
        iterations: result.iterations,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        durationMs: Date.now() - start,
        messageCount: trimmedMessages.length,
        actionsCount: actions.length,
      },
    });

    res.json({
      success: true,
      data: {
        reply: cleanText,
        actions,
        iterations: result.iterations,
        usage: result.usage,
        durationMs: Date.now() - start,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    // Log via pino supaya muncul di pm2 logs JSON
    logger.error({ err: msg, stack, lang: input.lang, msgCount: trimmedMessages.length }, '[elsa] chat error');

    // Classify error → return status + code yg tepat
    if (msg.includes('Anthropic API error 401') || msg.includes('Invalid API Key')) {
      throw new ApiError(503, 'ELSA_INVALID_KEY', 'ANTHROPIC_API_KEY invalid. Cek key di .env server.');
    }
    if (msg.includes('Anthropic API error 429')) {
      // Anthropic tier 1: 50 RPM Haiku, 40K input tokens/min, 8K output tokens/min.
      // Upgrade tier di https://console.anthropic.com/settings/limits kalau butuh higher.
      throw new ApiError(
        429,
        'ELSA_UPSTREAM_RATE_LIMIT',
        'Anthropic API rate limit terlampaui (tier 1: 50 req/menit untuk Haiku). Tunggu 60 detik atau upgrade tier di console.anthropic.com.',
      );
    }
    if (msg.includes('Anthropic API error 400') && msg.includes('model')) {
      throw new ApiError(
        503,
        'ELSA_MODEL_INVALID',
        `Model Anthropic tidak valid: ${process.env.ELSA_MODEL ?? 'default'}. Cek https://docs.anthropic.com/en/docs/about-claude/models`,
      );
    }
    // Anthropic overloaded (tier server sedang penuh)
    if (msg.includes('Anthropic API error 529')) {
      throw new ApiError(
        503,
        'ELSA_UPSTREAM_OVERLOADED',
        'Anthropic server overloaded — bukan issue di kita. Coba lagi 30 detik.',
      );
    }
    if (msg.includes('tidak di-set')) {
      throw new ApiError(503, 'ELSA_NOT_CONFIGURED', msg);
    }
    // Generic 500 dgn message yang expose actual error ke client (untuk dev)
    throw new ApiError(500, 'ELSA_ERROR', `Elsa error: ${msg}`);
  }
});
