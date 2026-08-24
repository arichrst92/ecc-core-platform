/**
 * Elsa (Els Agentic) — AI chat endpoint untuk ECC data.
 *
 * Modul 31. Fulltimer-only. Powered by Groq (Llama 3.3 70B versatile) via
 * lib/elsa-client.ts. Pattern adopted dari ide.asia /agent:
 *   - Language lock double reinforcement (system prompt + repeated per iter)
 *   - [ACTIONS] block sanitizer di response — mobile-style action buttons
 *   - Rate limiter 60 req/min per IP+cookie
 *   - Message + history length limits
 *
 * Endpoints:
 *   POST /admin/elsa/chat   — { messages, lang } → { reply, actions, usage, iterations }
 *   GET  /admin/elsa/health — cek GROQ_API_KEY + model ready
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '@ecc/database';
import { z } from 'zod';
import { requireFulltimer } from '../../middleware/require-auth.js';
import { BadRequest, ApiError } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { runAgenticLoop, type ElsaMessage, type ElsaTool } from '../../lib/elsa-client.js';

export const elsaRouter = Router();
elsaRouter.use(requireFulltimer);

// ============================================================
//  Rate limit — 60 req/min per user (JWT sub) + IP fallback
// ============================================================
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.user?.sub ?? '';
    const ip = ((req.headers['x-forwarded-for'] as string || '').split(',')[0] ?? '').trim() || req.ip || '';
    return `${userId}::${ip}`;
  },
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Elsa sedang sibuk. Coba lagi 1 menit lagi.' } },
});

// ============================================================
//  Health check
// ============================================================
elsaRouter.get('/health', (_req, res) => {
  const hasKey = !!process.env.GROQ_API_KEY;
  const model = process.env.ELSA_MODEL ?? 'llama-3.3-70b-versatile';
  res.json({
    success: true,
    data: {
      ready: hasKey,
      model,
      provider: 'groq',
      message: hasKey
        ? 'Elsa siap. Chat via POST /admin/elsa/chat'
        : 'GROQ_API_KEY belum di-set. Cek .env di server.',
    },
  });
});

// ============================================================
//  Tool definitions — OpenAI-compatible format (Groq)
// ============================================================

const TOOLS: ElsaTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_jemaat',
      description:
        'Cari jemaat berdasarkan nama, no HP, atau kode. Return max 10 hasil dgn detail dasar (nama, no HP, cabang). Pakai untuk pertanyaan "jemaat bernama X ada?", "cari nomor HP Ari", dll.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Kata kunci pencarian — bisa nama, no HP, atau kode jemaat.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'count_jemaat_by_cabang',
      description:
        'Hitung jumlah jemaat aktif per cabang. Kalau cabangId dikirim, return count 1 cabang; kalau tidak, return breakdown semua cabang.',
      parameters: {
        type: 'object',
        properties: {
          cabangId: {
            type: 'string',
            description: 'UUID cabang, optional. Kosongkan untuk breakdown semua.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_upcoming_events',
      description:
        'List event mendatang (30 hari ke depan) dgn tanggal, judul, cabang, peserta count. Pakai untuk "event minggu depan apa saja?", "acara natal kapan?", dll.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_ibadah_today',
      description:
        'List semua ibadah yg aktif hari ini (semua cabang) dgn jam mulai, kategori, lokasi.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_homecell_info',
      description:
        'Cari info homecell berdasarkan nama homecell atau nama PIC. Return detail: PIC, member count, area, jadwal pertemuan terakhir.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Nama homecell atau nama PIC.',
          },
        },
        required: ['query'],
      },
    },
  },
];

// ============================================================
//  Tool executor
// ============================================================

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'search_jemaat': {
      const q = String(input.query ?? '').trim();
      if (!q) return JSON.stringify({ error: 'query kosong' });
      const rows = await prisma.jemaat.findMany({
        where: {
          isActive: true,
          OR: [
            { namaLengkap: { contains: q, mode: 'insensitive' } },
            { noHp: { contains: q } },
            { kode: { equals: q.toUpperCase() } },
          ],
        },
        select: {
          id: true,
          namaLengkap: true,
          noHp: true,
          kode: true,
          cabang: { select: { nama: true } },
        },
        take: 10,
      });
      return JSON.stringify({ count: rows.length, results: rows });
    }

    case 'count_jemaat_by_cabang': {
      const cabangId = typeof input.cabangId === 'string' ? input.cabangId : undefined;
      if (cabangId) {
        const [cabang, count] = await Promise.all([
          prisma.cabangGereja.findUnique({ where: { id: cabangId }, select: { nama: true } }),
          prisma.jemaat.count({ where: { cabangId, isActive: true } }),
        ]);
        return JSON.stringify({ cabang: cabang?.nama ?? '(unknown)', count });
      }
      const groups = await prisma.jemaat.groupBy({
        by: ['cabangId'],
        where: { isActive: true },
        _count: true,
      });
      const cabangs = await prisma.cabangGereja.findMany({
        where: { id: { in: groups.map((g) => g.cabangId).filter((c): c is string => !!c) } },
        select: { id: true, nama: true },
      });
      const cabangMap = new Map(cabangs.map((c: { id: string; nama: string }) => [c.id, c.nama]));
      const breakdown = groups
        .map((g) => ({
          cabang: g.cabangId ? cabangMap.get(g.cabangId) ?? '(unknown)' : '(no cabang)',
          count: g._count,
        }))
        .sort((a, b) => b.count - a.count);
      const total = breakdown.reduce((sum, b) => sum + b.count, 0);
      return JSON.stringify({ total, breakdown });
    }

    case 'list_upcoming_events': {
      const now = new Date();
      const in30d = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
      const events = await prisma.event.findMany({
        where: {
          isPublished: true,
          tanggalMulai: { gte: now, lte: in30d },
        },
        select: {
          id: true,
          judul: true,
          slug: true,
          tanggalMulai: true,
          lokasi: true,
          tipeBayar: true,
          cabang: { select: { nama: true } },
          _count: { select: { partisipasi: { where: { status: { not: 'BATAL' } } } } },
        },
        orderBy: { tanggalMulai: 'asc' },
        take: 20,
      });
      return JSON.stringify({
        count: events.length,
        events: events.map((e) => ({
          id: e.id,
          judul: e.judul,
          slug: e.slug,
          tanggal: e.tanggalMulai.toISOString().slice(0, 10),
          lokasi: e.lokasi,
          cabang: e.cabang?.nama,
          tipeBayar: e.tipeBayar,
          pesertaCount: e._count.partisipasi,
        })),
      });
    }

    case 'list_ibadah_today': {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const dayEnum = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'][dayOfWeek];
      const items = await prisma.ibadah.findMany({
        where: {
          isActive: true,
          OR: [
            { tipeJadwal: 'WEEKLY', hari: dayEnum as never },
            { tipeJadwal: 'BIWEEKLY', hari: dayEnum as never },
            {
              tipeJadwal: 'ONCE',
              tanggalMulai: {
                gte: new Date(today.toISOString().slice(0, 10)),
                lt: new Date(new Date(today.toISOString().slice(0, 10)).getTime() + 24 * 3600 * 1000),
              },
            },
          ],
        },
        select: {
          id: true,
          nama: true,
          jamMulai: true,
          jamSelesai: true,
          lokasi: true,
          isOnline: true,
          cabang: { select: { nama: true } },
          kategoriIbadah: { select: { nama: true } },
        },
        orderBy: { jamMulai: 'asc' },
      });
      return JSON.stringify({
        hari: dayEnum,
        tanggal: today.toISOString().slice(0, 10),
        count: items.length,
        items: items.map((i) => ({
          id: i.id,
          nama: i.nama,
          kategori: i.kategoriIbadah?.nama,
          cabang: i.cabang?.nama,
          jam: `${i.jamMulai}-${i.jamSelesai}`,
          lokasi: i.isOnline ? '(Online)' : i.lokasi,
        })),
      });
    }

    case 'get_homecell_info': {
      const q = String(input.query ?? '').trim();
      if (!q) return JSON.stringify({ error: 'query kosong' });
      const rows = await prisma.homecell.findMany({
        where: {
          isActive: true,
          OR: [
            { nama: { contains: q, mode: 'insensitive' } },
            { picJemaat: { namaLengkap: { contains: q, mode: 'insensitive' } } },
          ],
        },
        select: {
          id: true,
          nama: true,
          picJemaat: { select: { namaLengkap: true, noHp: true } },
          area: { select: { nama: true } },
          _count: { select: { members: { where: { isActive: true } } } },
          schedules: {
            take: 1,
            orderBy: { tanggal: 'desc' },
            select: { tanggal: true, lokasi: true },
          },
        },
        take: 5,
      });
      return JSON.stringify({
        count: rows.length,
        results: rows.map((h) => ({
          id: h.id,
          nama: h.nama,
          pic: h.picJemaat?.namaLengkap,
          picNoHp: h.picJemaat?.noHp,
          area: h.area?.nama,
          memberCount: h._count.members,
          lastMeeting: h.schedules[0]
            ? { tanggal: h.schedules[0].tanggal.toISOString().slice(0, 10), lokasi: h.schedules[0].lokasi }
            : null,
        })),
      });
    }

    default:
      return JSON.stringify({ error: `unknown tool: ${name}` });
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
  const base = lang === 'id'
    ? `Kamu adalah Elsa (Els Agentic), asisten AI untuk data ECC (Elshaddai Creative Community) — sebuah gereja. Kamu membantu admin fulltimer menjawab pertanyaan tentang data jemaat, ibadah, event, homecell, dan aktivitas gereja.

INSTRUKSI UMUM:
- Jawab dalam ${langName} yang natural + ringkas.
- Selalu pakai TOOLS untuk fetch data actual — jangan pernah mengarang angka atau nama.
- Kalau data tidak ditemukan, jujur bilang "tidak ada data yang cocok".
- Jangan expose data sensitif seperti password, JWT token, atau financial detail.
- Format response: pakai bullet list untuk multi-item data.`
    : `You are Elsa (Els Agentic), an AI assistant for ECC (Elshaddai Creative Community) church data. You help fulltimer admins answer questions about members, services, events, homecells, and other church activities.

GENERAL INSTRUCTIONS:
- Answer in natural, concise ${langName}.
- Always use TOOLS to fetch actual data — never fabricate numbers or names.
- If data not found, honestly say "no matching data".
- Never expose sensitive data like passwords, JWT tokens, or financial details.
- Format: use bullet lists for multi-item data.`;

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

  return base + actionsGuide;
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
  if (!process.env.GROQ_API_KEY) {
    throw new ApiError(
      503,
      'ELSA_NOT_CONFIGURED',
      'Elsa belum di-setup. Admin sistem perlu set GROQ_API_KEY di server .env dan restart core-api.',
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
    throw new ApiError(500, 'ELSA_ERROR', `Elsa error: ${msg}`);
  }
});
