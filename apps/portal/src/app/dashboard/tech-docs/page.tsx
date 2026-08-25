'use client';

/**
 * Technical Documentation — panduan teknis komprehensif ECC Master Data Platform.
 *
 * Untuk dev/ops team (Fulltimer level access). Cover: architecture, stack,
 * apps, database, auth, notification, Elsa AI agent, deploy workflow, env vars,
 * API conventions, mobile integration.
 */
import { useState } from 'react';
import {
  FileText,
  ChevronDown,
  ChevronRight,
  Server,
  Database,
  Smartphone,
  Bell,
  Shield,
  Sparkles,
  Rocket,
  Cloud,
  GitBranch,
  Package,
  Code2,
  Terminal,
  Globe,
  Layers,
} from 'lucide-react';
import clsx from 'clsx';

interface Section {
  id: string;
  title: string;
  icon: typeof FileText;
  summary: string;
  blocks: Block[];
}

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'code'; lang?: string; content: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'callout'; variant: 'info' | 'warning' | 'success'; text: string };

const SECTIONS: Section[] = [
  {
    id: 'overview',
    title: 'Architecture Overview',
    icon: Layers,
    summary: 'High-level struktur monorepo, stack teknologi, dan deployment topology.',
    blocks: [
      {
        kind: 'p',
        text:
          'ECC Master Data Platform adalah monorepo pnpm workspaces + Turborepo. Terdiri dari 4 apps (core-api, portal, ckids, landing) + shared packages (database, shared-types, auth). Semua service running di 1 VPS Hostinger dgn Nginx reverse proxy + PM2 process manager.',
      },
      {
        kind: 'table',
        headers: ['Layer', 'Technology', 'Port', 'Domain'],
        rows: [
          ['Backend API', 'Node.js 20 + Express 4 + TypeScript', '4100', 'api.eccchurch.global'],
          ['Portal (admin)', 'Next.js 14 App Router + Tailwind', '3100', 'portal.eccchurch.global'],
          ['CKids Web', 'Next.js 14 (subdomain)', '3300', 'ckids.eccchurch.global'],
          ['Landing Site', 'Next.js 14 (public)', '3200', 'eccchurch.global'],
          ['Database', 'PostgreSQL 16 + Prisma 5.22', '5432', 'localhost (VPS internal)'],
          ['Reverse Proxy', 'Nginx 1.24 + Certbot SSL', '443', 'all subdomains'],
          ['Process Manager', 'PM2 (cluster mode)', '—', '—'],
        ],
      },
      {
        kind: 'callout',
        variant: 'info',
        text: 'VPS production: Hostinger 187.77.118.85 (Ubuntu 22 LTS). Deploy root: /var/www/ecc-core-platform. Mobile app (React Native Expo) di repo terpisah /Users/idea/Projects/ecc-mobile-app.',
      },
    ],
  },
  {
    id: 'monorepo',
    title: 'Monorepo Structure',
    icon: Package,
    summary: 'Package layout, dependency graph, dan turbo pipeline.',
    blocks: [
      {
        kind: 'code',
        lang: 'text',
        content: `ecc-core-platform/
├── apps/
│   ├── core-api/       Express backend, main API server
│   ├── portal/         Admin portal (Fulltimer)
│   ├── ckids/          Kids gift stall admin (subdomain)
│   └── landing/        Public landing site
├── packages/
│   ├── database/       Prisma schema, migrations, client
│   ├── shared-types/   Zod schemas + TS types shared cross-app
│   ├── auth/           JWT + OTP + WhatsApp gateway (Fonnte)
│   └── (implicit deps: sinode, cabang RBAC helpers)
├── docs/               Internal team docs (deploy runbooks)
└── ecosystem.config.cjs  PM2 config`,
      },
      {
        kind: 'p',
        text: 'Package resolution: pnpm workspace (`"@ecc/database": "workspace:*"` di package.json). Turbo pipeline handle build order — packages built first (database, shared-types, auth), lalu apps (core-api, portal, ckids, landing).',
      },
      {
        kind: 'code',
        lang: 'bash',
        content: `# Install semua deps
pnpm install --frozen-lockfile

# Build sequential (turbo detect deps)
pnpm build

# Or per app
pnpm --filter @ecc/core-api build
pnpm --filter @ecc/portal build

# Dev semua concurrent
pnpm dev`,
      },
    ],
  },
  {
    id: 'database',
    title: 'Database (Prisma + PostgreSQL)',
    icon: Database,
    summary: 'Schema, migrations, key models, dan multi-tenant scope.',
    blocks: [
      {
        kind: 'p',
        text:
          'Prisma 5.22 dgn PostgreSQL 16. Schema di packages/database/prisma/schema.prisma — 40+ model. Multi-tenant via Sinode → CabangGereja hierarchy. Semua data (jemaat, ibadah, event, etc) scoped per cabang.',
      },
      {
        kind: 'list',
        items: [
          'Sinode: top-level org (mis. "ECC Indonesia"). 1 sinode : N cabang.',
          'CabangGereja: cabang lokal per kota. Punya jemaat, ibadah, event, homecell, etc.',
          'Jemaat: church member — root entity untuk semua interaction (kehadiran, family relations, ministry, point, dll).',
          'JemaatRelasi: family network 2-arah dgn auto-reciprocal (add "Suami" A→B otomatis create "Istri" B→A).',
          'Ibadah + Reservasi: jadwal service + kehadiran per jemaat per tanggal (RESERVE/JOIN/CANCEL status).',
          'Event + EventParticipation: event satu-kali dgn quota, bayar, checkin QR.',
          'Homecell + HomecellSchedule + HomecellAttendance: cell group + jadwal pertemuan + absensi.',
          'HadiahKatalog + JemaatPointBalance + PointTransaction + HadiahRedeem: CKids gamification (kids earn point via kehadiran, redeem hadiah).',
          'Notification (Modul 30): in-app notification feed dgn 16 InAppNotifType.',
          'Integration (Modul 29 rollback): third-party API keys runtime editable.',
        ],
      },
      {
        kind: 'code',
        lang: 'bash',
        content: `# Migrations dev (bikin baru + apply)
pnpm --filter @ecc/database prisma migrate dev --name <migration_name>

# Production deploy (apply pending migrations)
pnpm --filter @ecc/database prisma migrate deploy

# Regen Prisma client (setelah edit schema)
pnpm --filter @ecc/database db:generate

# Seed test data
pnpm --filter @ecc/database db:seed
pnpm --filter @ecc/database db:seed-test-onboarding  # 3 jemaat test`,
      },
      {
        kind: 'callout',
        variant: 'warning',
        text: 'CRITICAL: setelah edit schema.prisma, WAJIB rebuild @ecc/shared-types + restart core-api. Prisma client di apps/core-api/node_modules pakai types dari packages/database dist. Kalau tidak rebuild, type stale = runtime error.',
      },
    ],
  },
  {
    id: 'auth',
    title: 'Authentication & Authorization',
    icon: Shield,
    summary: 'OTP WhatsApp, Magic Link Email, JWT, dan RBAC menu access.',
    blocks: [
      {
        kind: 'p',
        text:
          'Login flow: user request OTP (WhatsApp via Fonnte) → verify OTP → issue JWT access token (7d) + refresh token (365d sliding). Backup: magic link via SendGrid (15 menit TTL).',
      },
      {
        kind: 'table',
        headers: ['Endpoint', 'Method', 'Purpose'],
        rows: [
          ['/auth/otp/request', 'POST', 'Request OTP kirim ke noHp'],
          ['/auth/otp/verify', 'POST', 'Verify OTP → issue JWT'],
          ['/auth/refresh', 'POST', 'Rotate refresh token → new access'],
          ['/auth/logout', 'POST', 'Revoke refresh token (single session)'],
          ['/auth/logout-all', 'POST', 'Revoke all refresh tokens (all devices)'],
          ['/auth/email/request-magic-link', 'POST', 'Email magic link (backup)'],
          ['/auth/email/verify', 'POST', 'Verify magic link token'],
          ['/auth/me', 'GET', 'Current user + roles + menuAccess'],
        ],
      },
      {
        kind: 'p',
        text:
          'RBAC: Role → SubRole → Menu Access (canRead/canWrite/canDelete per menuKey). Portal admin filter menu berdasarkan menuAccess. Backend endpoint gate via requireAuth + requireFulltimer + menuKey check middleware.',
      },
      {
        kind: 'code',
        lang: 'typescript',
        content: `// Backend contoh menu access check
import { requireFulltimer } from '../../middleware/require-auth.js';
router.use(requireFulltimer); // semua endpoint di sini fulltimer-only

// Frontend menu filter
import { hasMenuAccess } from '@ecc/shared-types';
const canWrite = hasMenuAccess(user.menuAccess, 'jemaat', 'write');`,
      },
    ],
  },
  {
    id: 'notification',
    title: 'Notification System',
    icon: Bell,
    summary: 'WhatsApp (Fonnte), Email (SendGrid), dan In-App Feed (Modul 30).',
    blocks: [
      {
        kind: 'p',
        text: 'ECC punya 3 notification channels — dipakai bergantian atau bersama tergantung event:',
      },
      {
        kind: 'list',
        items: [
          'WhatsApp via Fonnte gateway: OTP login, reminder ibadah (WIB 7-10 pagi), reminder event, group notification.',
          'Email via SendGrid: magic link login backup, welcome email, notif transaksi (opsional).',
          'In-App Notification (Modul 30): 16 InAppNotifType — kids checkin/pickup, gift redeem, point earn/adjust, family link, group add/remove, event approve/checkin, homecell attend, visit, branch change.',
        ],
      },
      {
        kind: 'code',
        lang: 'typescript',
        content: `// Backend emit in-app notif
import { createNotification, resolveGuardianJemaatIds } from '../lib/notification.js';

// Single recipient
void createNotification({
  jemaatId: parentId,
  type: 'CKIDS_CHECKIN',
  title: 'Budi sudah check-in',
  body: 'Kode jemput: 483920',
  actionUrl: '/ckids/reservasi/<uuid>',
  metadata: { anakId, reservasiId, pickupCode: '483920' },
});

// Batch (mis. semua guardian anak)
const guardians = await resolveGuardianJemaatIds(anakId);
await createNotificationBatch(guardians, {...});`,
      },
      {
        kind: 'p',
        text:
          'Mobile app polling GET /admin/me/notifications/unread-count setiap 30s untuk badge. GET /admin/me/notifications untuk list (cursor pagination). POST :id/read + mark-all-read.',
      },
    ],
  },
  {
    id: 'elsa',
    title: 'Elsa (Els Agentic) — AI Agent',
    icon: Sparkles,
    summary: 'AI chat agent Anthropic Claude dgn dynamic entity query 30 entities.',
    blocks: [
      {
        kind: 'p',
        text:
          'Modul 31. Powered by Anthropic Claude (model default: claude-haiku-4-5-20251001). Fetch-based client (no SDK dep). Fulltimer-only endpoint /admin/elsa/chat.',
      },
      {
        kind: 'p',
        text:
          '5 dynamic tools: list_entities, describe_entity, query_entity, count_entity, groupby_entity. Elsa bisa akses 30 entity di DB Prisma via ENTITY_MAP (whitelist + field exclude + relation whitelist per entity). Guardrails: read-only, max 50 records, timeout 30s, rate limit 2000/30min per user+IP.',
      },
      {
        kind: 'table',
        headers: ['Feature', 'Detail'],
        rows: [
          ['Provider', 'Anthropic Claude'],
          ['Default model', 'claude-haiku-4-5-20251001 ($1/$5 per M tokens)'],
          ['Alternative', 'claude-sonnet-4-5-20250929 (better quality)'],
          ['Language lock', 'Double reinforcement (system prompt + per-iter reminder)'],
          ['Action buttons', '[ACTIONS] block sanitizer (navigate/external/contact_admin)'],
          ['Rate limit local', '2000 req / 30 menit per user+IP'],
          ['Upstream rate', 'Anthropic tier 1: 50 RPM Haiku'],
          ['Max iterations', '8 (prevent infinite tool loop)'],
        ],
      },
      {
        kind: 'p',
        text:
          'Frontend: ElsaAgent component dgn particle canvas animation (audio-reactive TTS). Voice picker Web Speech API (populate browser voices per lang). Language picker EN/ID persist localStorage.',
      },
      {
        kind: 'code',
        lang: 'bash',
        content: `# .env config Elsa
ANTHROPIC_API_KEY="sk-ant-api03-xxx..."
ELSA_MODEL="claude-haiku-4-5-20251001"
ELSA_MAX_TOKENS="2048"

# Health check
curl -H "Authorization: Bearer <JWT>" \\
  https://api.eccchurch.global/admin/elsa/health

# List available Anthropic models untuk akun
curl -H "x-api-key: $ANTHROPIC_KEY" \\
     -H "anthropic-version: 2023-06-01" \\
     https://api.anthropic.com/v1/models`,
      },
    ],
  },
  {
    id: 'deploy',
    title: 'Deploy Workflow',
    icon: Rocket,
    summary: 'Standard git → build → migrate → pm2 restart flow.',
    blocks: [
      {
        kind: 'p',
        text:
          'Deploy standard flow: git commit di Mac → git push → SSH VPS → git pull → build packages → migrate DB (kalau ada) → pm2 restart. Detail runbook di docs/future-changes-deploy-workflow.md dgn 7 skenario template command.',
      },
      {
        kind: 'code',
        lang: 'bash',
        content: `# Mac
cd /Users/idea/Projects/ecc-core-platform
pnpm --filter @ecc/database db:generate  # kalau schema berubah
pnpm --filter @ecc/shared-types build     # WAJIB kalau schema/shared type berubah
pnpm --filter @ecc/core-api build
pnpm --filter @ecc/portal build
git add . && git commit -m "..." && git push origin main

# VPS
ssh root@187.77.118.85
cd /var/www/ecc-core-platform
git pull origin main
pnpm install --frozen-lockfile
pnpm --filter @ecc/database db:generate
pnpm --filter @ecc/database prisma migrate deploy  # apply pending migrations
pnpm --filter @ecc/shared-types build
pnpm --filter @ecc/core-api build
pnpm --filter @ecc/portal build
pm2 restart ecc-core-api --update-env  # --update-env untuk reload .env
pm2 restart ecc-portal --update-env`,
      },
      {
        kind: 'callout',
        variant: 'warning',
        text: '5 deploy gotcha: (1) workspace dist harus di-rebuild kalau shared-types berubah, (2) transitive deps kadang missing di production install, (3) env loading pakai dotenv-cli via -e ../../.env, (4) NEXT_PUBLIC_* baked di build time (tidak runtime), (5) absolute paths untuk file uploads harus /var/www/... (bukan relative ./uploads).',
      },
    ],
  },
  {
    id: 'env',
    title: 'Environment Variables',
    icon: Terminal,
    summary: 'Critical env vars per service — kategorized.',
    blocks: [
      {
        kind: 'table',
        headers: ['Category', 'Variable', 'Purpose'],
        rows: [
          ['DB', 'DATABASE_URL', 'PostgreSQL connection string'],
          ['Auth', 'JWT_SECRET', 'Signing key JWT (min 32 chars)'],
          ['Auth', 'JWT_EXPIRES_IN', 'Access token TTL (default 7d)'],
          ['Auth', 'JWT_REFRESH_EXPIRES_IN', 'Refresh token TTL (default 365d)'],
          ['WA', 'FONNTE_TOKEN', 'Fonnte device token untuk kirim WhatsApp'],
          ['Email', 'SENDGRID_API_KEY', 'SendGrid API key untuk magic link'],
          ['Email', 'EMAIL_FROM', 'Sender email (must verified di SendGrid)'],
          ['Email', 'MAGIC_LINK_TTL_MINUTES', 'Magic link expiry (default 15)'],
          ['OTP', 'OTP_EXPIRES_SECONDS', 'OTP TTL (default 300)'],
          ['OTP', 'OTP_MAX_ATTEMPTS', 'Max wrong attempts before lock (3)'],
          ['Elsa', 'ANTHROPIC_API_KEY', 'Anthropic Claude API key'],
          ['Elsa', 'ELSA_MODEL', 'Model name (default claude-haiku-4-5)'],
          ['Ports', 'PORT', 'core-api port (4100)'],
          ['URLs', 'PORTAL_URL', 'Portal base URL (untuk email link)'],
          ['CORS', 'CORS_ALLOWED_ORIGINS', 'Comma-separated allowed origins'],
        ],
      },
      {
        kind: 'callout',
        variant: 'info',
        text: 'Full daftar env vars di .env.example (root repo). VPS production .env sync manual — jangan commit .env asli. Setelah edit .env, WAJIB pm2 restart <app> --update-env supaya env reload.',
      },
    ],
  },
  {
    id: 'api',
    title: 'API Conventions',
    icon: Globe,
    summary: 'Response shape, error handling, pagination, dan versioning.',
    blocks: [
      {
        kind: 'p',
        text:
          'Semua endpoint /admin/* wajib JWT. Response shape konsisten: { success: boolean, data?: any, error?: { code, message, details? }, meta?: pagination }.',
      },
      {
        kind: 'code',
        lang: 'typescript',
        content: `// Success response
{
  "success": true,
  "data": { ...entity or array },
  "meta": { "page": 1, "limit": 20, "total": 342, "totalPages": 18 }
}

// Error response — status HTTP + code + message
// 400 VALIDATION_ERROR (zod fail)
// 401 UNAUTHORIZED (no JWT / expired)
// 403 FORBIDDEN (RBAC menu access denied)
// 404 NOT_FOUND
// 409 CONSTRAINT_UNIQUE / CONSTRAINT_RELATION
// 500 INTERNAL_ERROR
{
  "success": false,
  "error": {
    "code": "CONSTRAINT_UNIQUE",
    "message": "Data Jemaat sudah ada (duplikat pada: noHp).",
    "details": { "target": "noHp", "prismaCode": "P2002" }
  }
}`,
      },
      {
        kind: 'p',
        text:
          'Pagination via query params: ?page=1&limit=20&sortBy=nama&sortOrder=asc&search=<keyword>. Zod parse di paginationQuerySchema. Response include meta pagination info.',
      },
    ],
  },
  {
    id: 'mobile',
    title: 'Mobile App Integration',
    icon: Smartphone,
    summary: 'React Native Expo — consumes core-api endpoints.',
    blocks: [
      {
        kind: 'p',
        text:
          'Mobile app di repo terpisah /Users/idea/Projects/ecc-mobile-app. React Native Expo + TypeScript. Consumes semua /admin/me/* endpoints (self-service) + subset /admin/* untuk admin scanner (Fulltimer role). Docs internal di ecc-mobile-app/docs/backend-request-*.md dan backend-notice-*.md untuk koordinasi BE↔Mobile.',
      },
      {
        kind: 'list',
        items: [
          'Auth: OTP WhatsApp via /auth/otp/*. Refresh token disimpan di SecureStore (iOS Keychain / Android EncryptedSharedPref).',
          'Family: /admin/me/family/* untuk link jemaat sebagai relasi (2-arah auto-reciprocal).',
          'Kids: /admin/me/reservasi (pickup code display), /children-points (balance), /children-redeem-history (transaksi).',
          'Ibadah: /admin/reservasi/checkin, /checkout, /pickup (admin scanner) + walk-in flow (kode alternate).',
          'Notification: /admin/me/notifications polling 30s (badge + list + mark-read).',
          'Ministry Phase 2: POST /admin/ministry/:id/join simple direct-ACTIVE flow.',
        ],
      },
      {
        kind: 'callout',
        variant: 'info',
        text: 'BE↔Mobile koordinasi lewat file docs di mobile repo. Pattern: mobile team kirim backend-request-*.md ke folder docs → BE tim reply dgn BE Response section di doc yg sama → mark status RESOLVED. Backup: langsung message di ECC repo issue.',
      },
    ],
  },
  {
    id: 'nginx',
    title: 'Nginx + SSL',
    icon: Cloud,
    summary: 'Reverse proxy config + Let\'s Encrypt SSL auto-renew.',
    blocks: [
      {
        kind: 'p',
        text:
          'Nginx 1.24 di VPS handle 4 subdomain: eccchurch.global (landing), portal.eccchurch.global (portal), api.eccchurch.global (core-api), ckids.eccchurch.global (ckids). SSL via Let\'s Encrypt / Certbot dgn auto-renew via cron.',
      },
      {
        kind: 'code',
        lang: 'nginx',
        content: `# /etc/nginx/sites-available/api.eccchurch.global
server {
  listen 443 ssl http2;
  server_name api.eccchurch.global;
  ssl_certificate /etc/letsencrypt/live/api.eccchurch.global/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.eccchurch.global/privkey.pem;

  client_max_body_size 20M;  # untuk upload foto

  location / {
    proxy_pass http://localhost:4100;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}`,
      },
      {
        kind: 'code',
        lang: 'bash',
        content: `# Setup subdomain baru (contoh ckids.eccchurch.global)
# 1. DNS A record di Hostinger panel → point ke 187.77.118.85
# 2. Nginx config
sudo nano /etc/nginx/sites-available/ckids.eccchurch.global
sudo ln -s /etc/nginx/sites-available/ckids.eccchurch.global /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# 3. SSL via certbot
sudo certbot --nginx -d ckids.eccchurch.global`,
      },
    ],
  },
  {
    id: 'pm2',
    title: 'PM2 Process Manager',
    icon: Server,
    summary: 'Cluster mode + auto-restart + log management.',
    blocks: [
      {
        kind: 'p',
        text:
          'PM2 handle 3 process: ecc-core-api (cluster max), ecc-portal (fork), ecc-ckids (fork), ecc-landing (fork). Config di ecosystem.config.cjs. Auto-restart on crash, log rotation via pm2-logrotate module.',
      },
      {
        kind: 'code',
        lang: 'bash',
        content: `# Cek status semua process
pm2 status

# View log real-time
pm2 logs ecc-core-api
pm2 logs ecc-core-api --lines 100 --nostream  # snapshot last 100 lines

# Restart individual dgn env reload
pm2 restart ecc-core-api --update-env
pm2 restart all --update-env

# Delete + start fresh (kalau env cache issue)
pm2 delete ecc-core-api
pm2 start ecosystem.config.cjs --only ecc-core-api

# Metrics + monitoring
pm2 monit`,
      },
    ],
  },
  {
    id: 'git',
    title: 'Git Workflow',
    icon: GitBranch,
    summary: 'Conventional commits + main branch trunk-based.',
    blocks: [
      {
        kind: 'p',
        text:
          'Trunk-based development: main branch = production. Commit dgn conventional pattern (feat/fix/chore/docs/refactor). Push langsung ke main setelah local build + tsc pass. No PR workflow (solo dev). Kalau butuh feature branch untuk experiment, boleh — merge via fast-forward atau squash.',
      },
      {
        kind: 'code',
        lang: 'bash',
        content: `# Common commit patterns
git commit -m "feat(elsa): add dynamic entity query tool"
git commit -m "fix(dock): popover z-index tidak conflict dgn modal"
git commit -m "chore(deps): bump react-native ke 0.75.4"
git commit -m "docs(api): backend-notice in-app notifications spec"
git commit -m "refactor(family): consolidate JemaatRelasi single source"

# Cross-repo (kalau touch mobile juga)
# Terminal 1 (ecc-core-platform)
git add ... && git commit && git push

# Terminal 2 (ecc-mobile-app)
cd /Users/idea/Projects/ecc-mobile-app
git add docs/backend-request-xxx.md && git commit && git push`,
      },
    ],
  },
  {
    id: 'sdk',
    title: 'Code Conventions',
    icon: Code2,
    summary: 'TypeScript strict, Zod validation, error handling patterns.',
    blocks: [
      {
        kind: 'list',
        items: [
          'TypeScript strict mode di tsconfig.json (noUncheckedIndexedAccess, exactOptionalPropertyTypes off, strict: true).',
          'Zod validation di request body wajib — pakai schema shared di packages/shared-types/src/schemas/*.',
          'Error handling: throw ApiError(status, code, message, details?) — middleware error-handler translate ke JSON response envelope.',
          'Prisma error P2002/P2003/P2025 handled otomatis di error-handler dgn friendly message.',
          'Audit log: import { audit } from "../../lib/audit.js" — call di setiap CUD action (CREATE/UPDATE/DELETE).',
          'React Query untuk fetch client-side di portal — caching + optimistic update built-in.',
          'Zustand store untuk auth state (persisted ke localStorage via zustand/middleware).',
          'Tailwind utility-first, no custom CSS classes kecuali animation keyframes.',
        ],
      },
      {
        kind: 'code',
        lang: 'typescript',
        content: `// Contoh backend endpoint pattern
import { z } from 'zod';
import { BadRequest, NotFound, ApiError } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

const createSchema = z.object({
  nama: z.string().min(1).max(100),
  cabangId: z.string().uuid(),
});

router.post('/', async (req, res) => {
  const input = createSchema.parse(req.body);  // throws ZodError → 400
  const created = await prisma.jemaat.create({ data: input });
  audit(req, {
    action: 'CREATE',
    resource: 'jemaat',
    resourceId: created.id,
    resourceLabel: created.nama,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});`,
      },
    ],
  },
];

// ============================================================
// Page
// ============================================================

export default function TechDocsPage() {
  const [openId, setOpenId] = useState<string>('overview');

  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-2">
        <FileText className="w-7 h-7 text-brand-500" />
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Technical Documentation</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Dokumentasi teknis komprehensif ECC Master Data Platform. Untuk dev + ops team.
          </p>
        </div>
      </div>

      {/* Nav pills */}
      <div className="flex flex-wrap gap-2 mb-6 sticky top-0 bg-neutral-50 py-3 z-10">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => {
                setOpenId(s.id);
                document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition',
                openId === s.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-white border border-neutral-200 text-neutral-700 hover:border-brand-300',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {s.title}
            </button>
          );
        })}
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {SECTIONS.map((s) => (
          <SectionCard key={s.id} section={s} open={openId === s.id} onToggle={() => setOpenId(openId === s.id ? '' : s.id)} />
        ))}
      </div>
    </div>
  );
}

function SectionCard({ section, open, onToggle }: { section: Section; open: boolean; onToggle: () => void }) {
  const Icon = section.icon;
  return (
    <section id={`section-${section.id}`} className="bg-white border border-neutral-200 rounded-xl overflow-hidden scroll-mt-20">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-neutral-50 text-left"
      >
        <Icon className="w-5 h-5 text-brand-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-neutral-900">{section.title}</h2>
          <p className="text-xs text-neutral-500 mt-0.5">{section.summary}</p>
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-6 pb-6 border-t border-neutral-100 space-y-4 pt-4">
          {section.blocks.map((b, i) => (
            <BlockRenderer key={i} block={b} />
          ))}
        </div>
      )}
    </section>
  );
}

function BlockRenderer({ block }: { block: Block }) {
  switch (block.kind) {
    case 'p':
      return <p className="text-sm text-neutral-700 leading-relaxed">{block.text}</p>;
    case 'list':
      return (
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-neutral-700 leading-relaxed">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case 'code':
      return (
        <pre className="bg-neutral-900 text-neutral-100 rounded-lg p-4 text-xs overflow-x-auto">
          <code>{block.content}</code>
        </pre>
      );
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200">
                {block.headers.map((h, i) => (
                  <th key={i} className="text-left px-3 py-2 font-semibold text-neutral-700 text-xs uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-b border-neutral-100 hover:bg-neutral-50">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2 text-neutral-700 align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'callout': {
      const variantCls =
        block.variant === 'warning'
          ? 'bg-amber-50 border-amber-200 text-amber-900'
          : block.variant === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-blue-50 border-blue-200 text-blue-900';
      return <div className={`border rounded-lg p-3 text-sm ${variantCls}`}>{block.text}</div>;
    }
    default:
      return null;
  }
}
