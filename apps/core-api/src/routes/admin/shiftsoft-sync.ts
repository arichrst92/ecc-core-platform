/**
 * Shiftsoft Sync — trigger + monitor migration script dari portal.
 *
 * Modul 25: eksekusi ulang script `db:migrate-shiftsoft*` dari UI Developer
 * Tools, tanpa harus SSH ke VPS. Semua job async (spawn child_process), status
 * di-track di tabel `shiftsoft_sync_job`, UI polling untuk update.
 *
 * Endpoints (semua wajib Fulltimer):
 *   - GET  /admin/shiftsoft-sync/tenants        → list 8 tenant + last sync per tenant
 *   - GET  /admin/shiftsoft-sync                → list recent 50 jobs
 *   - GET  /admin/shiftsoft-sync/:id            → detail 1 job (polling)
 *   - POST /admin/shiftsoft-sync                → trigger job baru
 *
 * Safety:
 *   - Cegah 2 job dgn phase+tenant sama concurrent → 409 Conflict.
 *   - Log tail dibatasi ~200 baris terakhir (~20KB) supaya row gak balloon.
 *   - Kalau proses core-api mati mid-run, row status tetap RUNNING —
 *     admin bisa manual mark FAILED via /:id/cancel (nanti kalau perlu).
 */
import { Router } from 'express';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { prisma, shiftsoft } from '@ecc/database';
import { requireFulltimer } from '../../middleware/require-auth.js';
import { BadRequest, NotFound, Forbidden } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

export const shiftsoftSyncRouter = Router();

// Guard: semua endpoint di router ini butuh Fulltimer.
shiftsoftSyncRouter.use(requireFulltimer);

// ============================================================
//  Tenant registry — duplikat dari packages/database/prisma/scripts/
//  migrate-shiftsoft/config.ts (tenant list stabil, jarang berubah).
//  Kalau tenant di-update di sana, sync manual di sini juga.
// ============================================================
const TENANTS = [
  { slug: 'eccglobal', label: 'ECC Global (Sinode)', cabangMatch: 'Global' },
  { slug: 'eccbandung', label: 'ECC Bandung', cabangMatch: 'Bandung' },
  { slug: 'eccjakarta', label: 'ECC Jakarta', cabangMatch: 'Jakarta' },
  { slug: 'eccbali', label: 'ECC Bali', cabangMatch: 'Bali' },
  { slug: 'eccmalang', label: 'ECC Malang', cabangMatch: 'Malang' },
  { slug: 'eccsydney', label: 'ECC Sydney', cabangMatch: 'Sydney' },
  { slug: 'ecckualalumpur', label: 'ECC Kuala Lumpur', cabangMatch: 'Kuala Lumpur' },
  { slug: 'eccmakassar', label: 'ECC Makassar', cabangMatch: 'Makassar' },
] as const;
const KNOWN_SLUGS: Set<string> = new Set(TENANTS.map((t) => t.slug));

// ============================================================
//  Zod schemas
// ============================================================
const triggerSchema = z.object({
  phase: z.enum(['JEMAAT', 'GROUP', 'CLEANUP', 'SEED_CABANG']),
  tenantSlug: z.string().min(1), // "all" atau salah satu KNOWN_SLUGS
  options: z
    .object({
      dryRun: z.boolean().optional(),
      limit: z.number().int().positive().max(10_000).optional(),
      excludeSystem: z.boolean().optional(),
      includeEmpty: z.boolean().optional(),
    })
    .default({}),
});

// ============================================================
//  Job runner — spawn tsx script async, pipe stdout ke DB
// ============================================================

const MAX_LOG_LINES = 200;

/**
 * Kalkulasi command tsx untuk phase tertentu. Return script path (absolute)
 * + argv array. Runner (bawah) yg spawn tsx dengan CWD = packages/database.
 */
function resolveCommand(
  phase: 'JEMAAT' | 'GROUP' | 'CLEANUP' | 'SEED_CABANG',
  tenantSlug: string,
  options: { dryRun?: boolean; limit?: number; excludeSystem?: boolean; includeEmpty?: boolean },
): { scriptRelPath: string; argv: string[] } {
  const argv: string[] = [];

  // --slug atau --all
  if (tenantSlug === 'all') {
    argv.push('--all');
  } else {
    argv.push('--slug', tenantSlug);
  }

  // --commit kalau bukan dry-run
  if (!options.dryRun) argv.push('--commit');
  if (options.limit) argv.push('--limit', String(options.limit));

  switch (phase) {
    case 'JEMAAT':
      if (options.excludeSystem) argv.push('--exclude-system');
      return { scriptRelPath: 'src/shiftsoft/run.ts', argv };
    case 'GROUP':
      if (options.includeEmpty) argv.push('--include-empty');
      return { scriptRelPath: 'src/shiftsoft/run-groups.ts', argv };
    case 'CLEANUP':
      // cleanup-system-accounts.ts tidak butuh --slug (global).
      return {
        scriptRelPath: 'src/shiftsoft/cleanup-system-accounts.ts',
        argv: options.dryRun ? [] : ['--commit'],
      };
    case 'SEED_CABANG':
      return { scriptRelPath: 'src/shiftsoft/seed-cabang.ts', argv: [] };
  }
}

/**
 * Spawn tsx script. Non-blocking — return immediately, update DB waktu selesai.
 * Log tail (200 lines terakhir) di-append ke row secara batched setiap 2 detik.
 */
function runJobAsync(jobId: string, scriptRelPath: string, argv: string[]) {
  // packages/database working directory — dari apps/core-api naik 3 level.
  // Path resolve based on repo root env atau fallback ke relative.
  const repoRoot = process.env.REPO_ROOT ?? path.resolve(process.cwd(), '../..');
  const dbPkgDir = path.join(repoRoot, 'packages', 'database');
  const scriptPath = path.join(dbPkgDir, scriptRelPath);
  const envPath = path.join(repoRoot, '.env');

  // Pakai dotenv-cli via pnpm exec supaya SHIFTSOFT_HASH_* + DATABASE_URL loaded.
  // Node 20 + tsx v4 harus available di deps root.
  const cmd = 'pnpm';
  const args = ['--filter', '@ecc/database', 'exec', 'dotenv', '-e', envPath, '--', 'tsx', scriptPath, ...argv];

  const child = spawn(cmd, args, {
    cwd: dbPkgDir,
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV ?? 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logLines: string[] = [];
  let flushTimer: NodeJS.Timeout | null = null;

  function pushLine(line: string) {
    logLines.push(line);
    if (logLines.length > MAX_LOG_LINES) logLines.splice(0, logLines.length - MAX_LOG_LINES);
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      try {
        await prisma.shiftsoftSyncJob.update({
          where: { id: jobId },
          data: { logTail: logLines.join('\n') },
        });
      } catch (e) {
        // Ignore transient DB error — akan retry di next tick.
      }
    }, 2000);
  }

  child.stdout.on('data', (buf: Buffer) => {
    for (const line of buf.toString('utf8').split('\n')) {
      if (line.trim()) pushLine(line);
    }
    scheduleFlush();
  });

  child.stderr.on('data', (buf: Buffer) => {
    for (const line of buf.toString('utf8').split('\n')) {
      if (line.trim()) pushLine(`[stderr] ${line}`);
    }
    scheduleFlush();
  });

  child.on('close', async (code) => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    const finalLog = logLines.join('\n');

    // Parse result dari log kalau ada line summary yg recognizable.
    // Format bebas — mapper Shiftsoft print "TOTAL: imported=X updated=Y errors=Z".
    const summaryLine = logLines.reverse().find((l) => /TOTAL|Summary|Selesai/i.test(l));
    const result: Record<string, unknown> = {};
    if (summaryLine) result.summaryLine = summaryLine.slice(0, 500);
    result.exitCode = code;
    result.logLineCount = logLines.length;

    await prisma.shiftsoftSyncJob.update({
      where: { id: jobId },
      data: {
        status: code === 0 ? 'SUCCESS' : 'FAILED',
        errorMessage: code === 0 ? null : `Exit code ${code}`,
        finishedAt: new Date(),
        logTail: finalLog,
        result: result as any,
      },
    });
  });

  child.on('error', async (err) => {
    await prisma.shiftsoftSyncJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage: `Spawn error: ${err.message}`,
        finishedAt: new Date(),
        logTail: logLines.join('\n'),
      },
    });
  });
}

// ============================================================
//  Endpoints
// ============================================================

/**
 * GET /admin/shiftsoft-sync/tenants — list tenant + last sync per tenant.
 */
shiftsoftSyncRouter.get('/tenants', async (_req, res) => {
  // Per tenant, cari last SUCCESS job by tenantSlug (or "all") for each phase.
  const jobs = await prisma.shiftsoftSyncJob.findMany({
    where: { status: 'SUCCESS' },
    orderBy: { startedAt: 'desc' },
    take: 100,
    select: { tenantSlug: true, phase: true, startedAt: true, finishedAt: true, result: true },
  });

  const lastByTenantPhase = new Map<string, (typeof jobs)[number]>();
  for (const j of jobs) {
    const key = `${j.tenantSlug}:${j.phase}`;
    if (!lastByTenantPhase.has(key)) lastByTenantPhase.set(key, j);
  }

  const tenants = TENANTS.map((t) => ({
    ...t,
    lastJemaatSync: lastByTenantPhase.get(`${t.slug}:JEMAAT`) ?? lastByTenantPhase.get(`all:JEMAAT`) ?? null,
    lastGroupSync: lastByTenantPhase.get(`${t.slug}:GROUP`) ?? lastByTenantPhase.get(`all:GROUP`) ?? null,
  }));

  // Count jemaat + group imported per cabang (from DB, ground truth).
  const cabangs = await prisma.cabangGereja.findMany({
    select: { id: true, nama: true },
  });

  const counts = await Promise.all(
    cabangs.map(async (c) => {
      const [jemaatCount, groupCount] = await Promise.all([
        prisma.jemaat.count({
          where: { cabangId: c.id, legacyShiftsoftId: { not: null } },
        }),
        prisma.group.count({
          where: { cabangId: c.id, legacyShiftsoftCircleId: { not: null } },
        }),
      ]);
      return { cabangNama: c.nama, jemaatCount, groupCount };
    }),
  );

  res.json({
    success: true,
    data: {
      tenants,
      cabangCounts: counts,
      lastCleanup: lastByTenantPhase.get('all:CLEANUP') ?? null,
    },
  });
});

/**
 * GET /admin/shiftsoft-sync — list recent 50 jobs.
 */
shiftsoftSyncRouter.get('/', async (_req, res) => {
  const jobs = await prisma.shiftsoftSyncJob.findMany({
    orderBy: { startedAt: 'desc' },
    take: 50,
    include: {
      triggeredBy: { select: { id: true, namaLengkap: true } },
    },
  });
  res.json({ success: true, data: jobs });
});

/**
 * GET /admin/shiftsoft-sync/:id — detail 1 job untuk polling.
 */
shiftsoftSyncRouter.get('/:id', async (req, res) => {
  const job = await prisma.shiftsoftSyncJob.findUnique({
    where: { id: req.params.id },
    include: {
      triggeredBy: { select: { id: true, namaLengkap: true } },
    },
  });
  if (!job) throw NotFound('Job tidak ditemukan');
  res.json({ success: true, data: job });
});

/**
 * POST /admin/shiftsoft-sync — trigger job baru.
 */
shiftsoftSyncRouter.post('/', async (req, res) => {
  const parsed = triggerSchema.parse(req.body);
  const { phase, tenantSlug, options } = parsed;

  // Validate slug — "all" atau salah satu KNOWN_SLUGS. CLEANUP + SEED_CABANG
  // implicitly global — force "all".
  const effectiveSlug =
    phase === 'CLEANUP' || phase === 'SEED_CABANG' ? 'all' : tenantSlug;
  if (effectiveSlug !== 'all' && !KNOWN_SLUGS.has(effectiveSlug)) {
    throw BadRequest(
      `Unknown tenant slug "${effectiveSlug}". Known: all, ${[...KNOWN_SLUGS].join(', ')}`,
    );
  }

  // Cegah concurrent job untuk (phase, tenantSlug) sama.
  const running = await prisma.shiftsoftSyncJob.findFirst({
    where: { phase, tenantSlug: effectiveSlug, status: 'RUNNING' },
  });
  if (running) {
    throw Forbidden(
      `Job dengan phase ${phase} + tenant ${effectiveSlug} masih RUNNING (id=${running.id}). Tunggu selesai dulu.`,
    );
  }

  const jemaatId = req.user!.jemaatId;
  if (!jemaatId) throw BadRequest('User tidak punya jemaatId — tidak bisa audit trigger');

  const job = await prisma.shiftsoftSyncJob.create({
    data: {
      phase,
      tenantSlug: effectiveSlug,
      options,
      status: 'RUNNING',
      triggeredById: jemaatId,
    },
  });

  audit(req, {
    action: 'CREATE',
    resource: 'shiftsoft_sync_job',
    resourceId: job.id,
    resourceLabel: `${phase} · ${effectiveSlug}${options.dryRun ? ' (dry-run)' : ''}`,
    metadata: { phase, tenantSlug: effectiveSlug, options },
  });

  // Spawn async — bikin response cepat, job jalan background.
  const { scriptRelPath, argv } = resolveCommand(phase, effectiveSlug, options);
  runJobAsync(job.id, scriptRelPath, argv);

  res.status(201).json({ success: true, data: job });
});

// ============================================================
//  PREVIEW + COMMIT flow untuk Jemaat (Sprint 2G)
//
//  Alur user:
//    1. POST /preview-jemaat { tenantSlug } → fetch legacy + diff DB →
//       return counters + record refs. Data legacy di-cache in-memory
//       (15 menit TTL) supaya commit gak re-fetch.
//    2. UI tampil counters + tabel New (preview) + tabel Redundant dengan
//       dropdown action per row (SKIP / NULL_NOHP / NULL_EMAIL / IMPORT_AS_IS).
//    3. POST /commit-jemaat { previewId, actions } → import per action,
//       return summary.
//
//  Cache: Map<previewId, PreviewSnapshot>. Single-process safe (PM2 cluster
//  mode = shared cache invalidation — pakai Redis kalau scale-out).
// ============================================================

type RedundantAction = 'SKIP' | 'NULL_NOHP' | 'NULL_EMAIL' | 'IMPORT_AS_IS';

interface PreviewRecord {
  legacyId: number;
  namaLengkap: string;
  noHp: string | null;
  email: string | null;
}
interface RedundantRecord extends PreviewRecord {
  // Detail collision — supaya user tahu benturan-nya dengan siapa.
  conflicts: Array<{
    field: 'noHp' | 'email';
    value: string;
    withJemaatId: string;
    withJemaatNama: string;
  }>;
}

interface PreviewSnapshot {
  id: string;
  tenantSlug: string;
  cabang: { id: string; nama: string };
  fetched: number;
  fetchedRaw: shiftsoft.LegacyUser[]; // untuk commit (avoid re-fetch)
  exist: PreviewRecord[]; // by legacyShiftsoftId — sudah di-import sebelumnya
  new_: PreviewRecord[]; // fresh import (name intentionally `new_` — `new` reserved)
  redundant: RedundantRecord[];
  createdAt: Date;
  createdById: string;
}

const previewCache = new Map<string, PreviewSnapshot>();
const PREVIEW_TTL_MS = 15 * 60 * 1000; // 15 menit

// Prune expired previews setiap 5 menit (background sweep).
setInterval(() => {
  const now = Date.now();
  for (const [id, snap] of previewCache) {
    if (now - snap.createdAt.getTime() > PREVIEW_TTL_MS) previewCache.delete(id);
  }
}, 5 * 60 * 1000);

/** Resolve cabang untuk tenant slug (via cabangMatch inference). */
async function resolveCabang(slug: string): Promise<{ id: string; nama: string }> {
  const tenant = TENANTS.find((t) => t.slug === slug);
  if (!tenant) throw BadRequest(`Unknown tenant slug: ${slug}`);
  const cabang = await prisma.cabangGereja.findFirst({
    where: {
      isActive: true,
      nama: { contains: tenant.cabangMatch, mode: 'insensitive' },
    },
    select: { id: true, nama: true },
  });
  if (!cabang) {
    throw BadRequest(
      `Cabang untuk tenant "${slug}" (match "${tenant.cabangMatch}") tidak ditemukan di DB. Jalankan seed-cabang dulu.`,
    );
  }
  return cabang;
}

const previewJemaatSchema = z.object({ tenantSlug: z.string().min(1) });

const commitJemaatSchema = z.object({
  previewId: z.string().uuid(),
  actions: z.object({
    /** legacyIds dari records.new_ yg mau di-import as-is */
    newIds: z.array(z.number().int().positive()).default([]),
    /** Per-record action untuk records.redundant */
    redundant: z
      .array(
        z.object({
          legacyId: z.number().int().positive(),
          action: z.enum(['SKIP', 'NULL_NOHP', 'NULL_EMAIL', 'IMPORT_AS_IS']),
        }),
      )
      .default([]),
  }),
});

/**
 * POST /admin/shiftsoft-sync/preview-jemaat
 *
 * Fetch legacy jemaat dari Shiftsoft + kategorisasi vs DB. TIDAK write ke DB.
 * Cache raw legacy record di memory (15 menit) supaya commit lanjut cepat.
 */
shiftsoftSyncRouter.post('/preview-jemaat', async (req, res) => {
  const { tenantSlug } = previewJemaatSchema.parse(req.body);
  const jemaatId = req.user!.jemaatId;
  if (!jemaatId) throw BadRequest('User tidak punya jemaatId');

  const cabang = await resolveCabang(tenantSlug);
  const tenant = shiftsoft.getTenant(tenantSlug);
  const client = new shiftsoft.ShiftsoftClient(tenant);

  const startMs = Date.now();
  const raw = await client.listUsers();
  const users = raw.data ?? [];
  const fetchDurationMs = Date.now() - startMs;

  // Lookup existing legacyIds di cabang ini (bukan cross-cabang collision — record
  // dari legacyShiftsoftId Bandung tidak akan match di Jakarta, karena ID unique
  // per tenant tapi jemaat.legacyShiftsoftId unique per DB row).
  const legacyIds = users.map((u) => u.ID).filter((n): n is number => Number.isFinite(n));
  const existing = await prisma.jemaat.findMany({
    where: { legacyShiftsoftId: { in: legacyIds } },
    select: { legacyShiftsoftId: true, namaLengkap: true, noHp: true, email: true },
  });
  const existingIds = new Set(existing.map((j) => j.legacyShiftsoftId!));

  // Ambil semua noHp + email di DB yg berpotensi collision — cukup satu
  // batched query per field, karena field-nya unique index.
  const candidateNoHps: string[] = [];
  const candidateEmails: string[] = [];
  for (const u of users) {
    if (existingIds.has(u.ID)) continue; // yang sudah exist tidak perlu cek collision
    const noHp = u.Phone1 ? shiftsoft.normalizePhone(u.Phone1) : null;
    if (noHp) candidateNoHps.push(noHp);
    const email = shiftsoft.cleanString(u.Email);
    if (email) candidateEmails.push(email);
  }
  const [collidingByNoHp, collidingByEmail] = await Promise.all([
    candidateNoHps.length > 0
      ? prisma.jemaat.findMany({
          where: { noHp: { in: [...new Set(candidateNoHps)] } },
          select: { id: true, namaLengkap: true, noHp: true },
        })
      : Promise.resolve([]),
    candidateEmails.length > 0
      ? prisma.jemaat.findMany({
          where: { email: { in: [...new Set(candidateEmails)] } },
          select: { id: true, namaLengkap: true, email: true },
        })
      : Promise.resolve([]),
  ]);
  const noHpMap = new Map(collidingByNoHp.map((j) => [j.noHp!, { id: j.id, nama: j.namaLengkap }]));
  const emailMap = new Map(collidingByEmail.map((j) => [j.email!, { id: j.id, nama: j.namaLengkap }]));

  // Kategorisasi user list ke exist / new_ / redundant.
  const exist: PreviewRecord[] = [];
  const new_: PreviewRecord[] = [];
  const redundant: RedundantRecord[] = [];

  for (const u of users) {
    const noHp = u.Phone1 ? shiftsoft.normalizePhone(u.Phone1) : null;
    const email = shiftsoft.cleanString(u.Email);
    const rec: PreviewRecord = {
      legacyId: u.ID,
      namaLengkap: shiftsoft.cleanString(u.Name) ?? '(tanpa nama)',
      noHp,
      email,
    };

    if (existingIds.has(u.ID)) {
      exist.push(rec);
      continue;
    }

    const conflicts: RedundantRecord['conflicts'] = [];
    if (noHp && noHpMap.has(noHp)) {
      const c = noHpMap.get(noHp)!;
      conflicts.push({ field: 'noHp', value: noHp, withJemaatId: c.id, withJemaatNama: c.nama });
    }
    if (email && emailMap.has(email)) {
      const c = emailMap.get(email)!;
      conflicts.push({ field: 'email', value: email, withJemaatId: c.id, withJemaatNama: c.nama });
    }

    if (conflicts.length > 0) {
      redundant.push({ ...rec, conflicts });
    } else {
      new_.push(rec);
    }
  }

  // Simpan snapshot di cache — commit endpoint pakai previewId untuk avoid re-fetch.
  const snapshot: PreviewSnapshot = {
    id: randomUUID(),
    tenantSlug,
    cabang,
    fetched: users.length,
    fetchedRaw: users,
    exist,
    new_,
    redundant,
    createdAt: new Date(),
    createdById: jemaatId,
  };
  previewCache.set(snapshot.id, snapshot);

  audit(req, {
    action: 'CREATE',
    resource: 'shiftsoft_sync_preview',
    resourceLabel: `Preview ${tenantSlug} (fetched=${users.length})`,
    metadata: {
      tenantSlug,
      fetched: users.length,
      exist: exist.length,
      new: new_.length,
      redundant: redundant.length,
      fetchDurationMs,
    },
  });

  // Response: strip fetchedRaw supaya payload kecil (records saja).
  res.json({
    success: true,
    data: {
      previewId: snapshot.id,
      tenantSlug,
      cabang,
      fetched: users.length,
      fetchDurationMs,
      counters: {
        exist: exist.length,
        new: new_.length,
        redundant: redundant.length,
      },
      records: { exist, new: new_, redundant },
      expiresAt: new Date(Date.now() + PREVIEW_TTL_MS).toISOString(),
    },
  });
});

/**
 * POST /admin/shiftsoft-sync/commit-jemaat
 *
 * Consume preview snapshot → upsert per action. Concurrent-safe (upsert
 * atomic per row). Kalau preview expired, return 410 Gone.
 */
shiftsoftSyncRouter.post('/commit-jemaat', async (req, res) => {
  const { previewId, actions } = commitJemaatSchema.parse(req.body);
  const snap = previewCache.get(previewId);
  if (!snap) {
    throw NotFound('Preview expired atau tidak ditemukan. Silakan Fetch ulang.');
  }
  if (Date.now() - snap.createdAt.getTime() > PREVIEW_TTL_MS) {
    previewCache.delete(previewId);
    throw NotFound('Preview kadaluarsa (>15 menit). Silakan Fetch ulang.');
  }

  const jemaatId = req.user!.jemaatId;
  if (!jemaatId) throw BadRequest('User tidak punya jemaatId');

  // Build lookup table LegacyUser by ID.
  const legacyById = new Map(snap.fetchedRaw.map((u) => [u.ID, u]));
  const cabangId = snap.cabang.id;

  const newIdSet = new Set(actions.newIds);
  const redundantActionMap = new Map(actions.redundant.map((r) => [r.legacyId, r.action]));

  const results = {
    imported: 0,
    skipped: 0,
    errors: [] as Array<{ legacyId: number; namaLengkap: string; message: string }>,
  };

  async function tryUpsert(
    u: shiftsoft.LegacyUser,
    override: { nullNoHp?: boolean; nullEmail?: boolean },
  ): Promise<'imported' | 'skipped' | 'error'> {
    const mapped = shiftsoft.mapLegacyUserToJemaat(u, cabangId);
    if (!mapped) return 'skipped'; // nama kosong etc
    const data = { ...mapped.create };
    if (override.nullNoHp) data.noHp = null;
    if (override.nullEmail) data.email = null;
    try {
      await prisma.jemaat.upsert({
        where: { legacyShiftsoftId: mapped.legacyShiftsoftId },
        create: data,
        update: data,
      });
      return 'imported';
    } catch (e: any) {
      results.errors.push({
        legacyId: u.ID,
        namaLengkap: u.Name ?? '(tanpa nama)',
        message: e?.message?.slice(0, 300) ?? String(e).slice(0, 300),
      });
      return 'error';
    }
  }

  // Process NEW records — import as-is.
  for (const rec of snap.new_) {
    if (!newIdSet.has(rec.legacyId)) {
      results.skipped++;
      continue;
    }
    const u = legacyById.get(rec.legacyId);
    if (!u) continue;
    const r = await tryUpsert(u, {});
    if (r === 'imported') results.imported++;
    else if (r === 'skipped') results.skipped++;
  }

  // Process REDUNDANT records — per user's chosen action.
  for (const rec of snap.redundant) {
    const action = redundantActionMap.get(rec.legacyId) ?? 'SKIP';
    if (action === 'SKIP') {
      results.skipped++;
      continue;
    }
    const u = legacyById.get(rec.legacyId);
    if (!u) continue;
    const r = await tryUpsert(u, {
      nullNoHp: action === 'NULL_NOHP',
      nullEmail: action === 'NULL_EMAIL',
    });
    if (r === 'imported') results.imported++;
    else if (r === 'skipped') results.skipped++;
  }

  // Log ke shiftsoft_sync_job untuk history konsistensi.
  await prisma.shiftsoftSyncJob.create({
    data: {
      phase: 'JEMAAT',
      tenantSlug: snap.tenantSlug,
      options: {
        source: 'preview-commit',
        newIdsCount: actions.newIds.length,
        redundantActionsCount: actions.redundant.length,
      } as any,
      status: results.errors.length === 0 ? 'SUCCESS' : 'FAILED',
      result: {
        imported: results.imported,
        skipped: results.skipped,
        errorCount: results.errors.length,
        firstErrors: results.errors.slice(0, 5),
      } as any,
      errorMessage: results.errors.length > 0 ? `${results.errors.length} error saat upsert` : null,
      triggeredById: jemaatId,
      finishedAt: new Date(),
    },
  });

  audit(req, {
    action: 'CREATE',
    resource: 'shiftsoft_sync_commit',
    resourceLabel: `Commit ${snap.tenantSlug} — imported ${results.imported}, skipped ${results.skipped}, errors ${results.errors.length}`,
    metadata: results,
  });

  // Delete preview snapshot — sekali commit selesai, invalidate.
  previewCache.delete(previewId);

  res.json({ success: true, data: results });
});
