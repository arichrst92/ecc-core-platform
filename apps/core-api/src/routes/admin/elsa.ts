/**
 * Elsa (Els Agentic) — AI chat endpoint untuk ECC data.
 *
 * Modul 31. Fulltimer-only. Powered by Anthropic Claude via lib/elsa-client.ts.
 *
 * Endpoint:
 *   POST /admin/elsa/chat  — { messages: ElsaMessage[], lang: 'id'|'en' }
 *                            → { finalText, usage, iterations }
 *   GET  /admin/elsa/health — cek apakah ANTHROPIC_API_KEY set + model ready
 *
 * Tools initial:
 *   - search_jemaat(query)
 *   - count_jemaat_by_cabang(cabangId?)
 *   - list_upcoming_events()
 *   - list_ibadah_today()
 *   - get_homecell_info(query)
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { z } from 'zod';
import { requireFulltimer } from '../../middleware/require-auth.js';
import { BadRequest, ApiError } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { runAgenticLoop, type ElsaMessage, type ElsaTool } from '../../lib/elsa-client.js';

export const elsaRouter = Router();
elsaRouter.use(requireFulltimer);

// ============================================================
//  Health check
// ============================================================
elsaRouter.get('/health', (_req, res) => {
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  const model = process.env.ELSA_MODEL ?? 'claude-sonnet-4-20250514';
  res.json({
    success: true,
    data: {
      ready: hasKey,
      model,
      message: hasKey
        ? 'Elsa siap. Chat via POST /admin/elsa/chat'
        : 'ANTHROPIC_API_KEY belum di-set. Cek .env di server.',
    },
  });
});

// ============================================================
//  Tool definitions
// ============================================================

const TOOLS: ElsaTool[] = [
  {
    name: 'search_jemaat',
    description:
      'Cari jemaat berdasarkan nama, no HP, atau kode. Return max 10 hasil dgn detail dasar (nama, no HP, cabang, role). Pakai untuk pertanyaan "jemaat bernama X ada?", "cari nomor HP Ari", dll.',
    input_schema: {
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
  {
    name: 'count_jemaat_by_cabang',
    description:
      'Hitung jumlah jemaat aktif per cabang. Kalau cabangId dikirim, return count 1 cabang; kalau tidak, return breakdown semua cabang.',
    input_schema: {
      type: 'object',
      properties: {
        cabangId: {
          type: 'string',
          description: 'UUID cabang, optional. Kosongkan untuk breakdown semua.',
        },
      },
    },
  },
  {
    name: 'list_upcoming_events',
    description:
      'List event mendatang (30 hari ke depan) dgn tanggal, judul, cabang, peserta count. Pakai untuk "event minggu depan apa saja?", "acara natal kapan?", dll.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_ibadah_today',
    description:
      'List semua ibadah yg aktif hari ini (semua cabang) dgn jam mulai, kategori, ekspektasi kehadiran.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_homecell_info',
    description:
      'Cari info homecell berdasarkan nama homecell atau nama PIC. Return detail: PIC, member count, area, jadwal pertemuan terakhir.',
    input_schema: {
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
      const cabangMap = new Map(cabangs.map((c) => [c.id, c.nama]));
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
          judul: e.judul,
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
      const dayOfWeek = today.getDay(); // 0=Minggu, 1=Senin, ...
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
//  POST /chat — main agent entrypoint
// ============================================================

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.union([z.string(), z.array(z.any())]),
      }),
    )
    .min(1)
    .max(50),
  lang: z.enum(['id', 'en']).default('id'),
});

function systemPrompt(lang: 'id' | 'en'): string {
  const base = lang === 'id'
    ? `Kamu adalah Elsa (Els Agentic), asisten AI untuk data ECC (Elshaddai Creative Community) — sebuah gereja. Kamu membantu admin fulltimer menjawab pertanyaan tentang data jemaat, ibadah, event, homecell, dan aktivitas gereja lainnya.

INSTRUKSI:
- Jawab dalam Bahasa Indonesia yang natural + ringkas.
- Selalu pakai TOOLS yang tersedia untuk fetch data actual — jangan pernah mengarang angka atau nama.
- Kalau data tidak ditemukan, jujur bilang "tidak ada data yang cocok".
- Untuk pertanyaan agregat (mis. total jemaat), pakai tool count/list yang sesuai.
- Kalau user tanya sesuatu di luar scope ECC (mis. resep masakan), sopan tolak dan arahkan ke topik data gereja.
- Jangan expose data sensitif seperti password, JWT token, atau financial detail.
- Format: gunakan bullet list atau tabel markdown kalau data multi-item.`
    : `You are Elsa (Els Agentic), an AI assistant for ECC (Elshaddai Creative Community) church data. You help fulltimer admins answer questions about members, services, events, homecells, and other church activities.

INSTRUCTIONS:
- Answer in natural, concise English.
- Always use provided TOOLS to fetch actual data — never fabricate numbers or names.
- If data not found, honestly say "no matching data".
- For aggregate questions (e.g. total members), use appropriate count/list tools.
- If user asks something outside ECC scope, politely decline and redirect to church data topics.
- Never expose sensitive data like passwords, JWT tokens, or financial details.
- Format: use bullet lists or markdown tables for multi-item data.`;
  return base;
}

elsaRouter.post('/chat', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ApiError(
      503,
      'ELSA_NOT_CONFIGURED',
      'Elsa belum di-setup. Admin sistem perlu set ANTHROPIC_API_KEY di server .env dan restart core-api.',
    );
  }

  const input = chatSchema.parse(req.body);
  const start = Date.now();

  try {
    const result = await runAgenticLoop({
      system: systemPrompt(input.lang),
      messages: input.messages as ElsaMessage[],
      tools: TOOLS,
      toolExecutor: executeTool,
    });

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
        messageCount: input.messages.length,
      },
    });

    res.json({
      success: true,
      data: {
        finalText: result.finalText,
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
