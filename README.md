# ECC Core Platform

Portal dan Core API untuk master data gereja & sinode ECC.

## Struktur Monorepo

```
ecc-platform/
├── apps/
│   ├── portal/        # Next.js — portal.eccchurch.global (admin CRUD)
│   └── core-api/      # Express + OpenAPI — core-api.eccchurch.global
├── packages/
│   ├── database/      # Prisma schema, migrations, seed
│   ├── shared-types/  # TypeScript types & Zod schemas (shared FE/BE)
│   └── auth/          # JWT, OTP, WhatsApp (Fonnte) & face-api helpers
├── images/            # Brand assets (logo-ecc, logo-idea)
├── scripts/           # download-face-models.sh
└── knowledge-base.md  # Dokumentasi lengkap arsitektur
```

## Quick Start

```bash
# 1. Pastikan PostgreSQL 16 ter-install & jalan
brew install postgresql@16 && brew services start postgresql@16

# 2. Setup database & user
createuser -s ecc_user -P     # masukkan password: ecc_password
createdb -O ecc_user ecc_platform

# 3. Install deps + env
pnpm install
cp .env.example .env
# Edit .env: set JWT_SECRET (openssl rand -hex 32) dan FONNTE_TOKEN

# 4. Setup schema + seed
pnpm db:generate
pnpm db:migrate                # ketik 'init' saat ditanya nama migration
pnpm db:seed

# 5. Run
pnpm dev
```

Portal: http://localhost:3000  |  Core API: http://localhost:4000  |  Docs: http://localhost:4000/docs

## Dokumentasi

- **[BUILD.md](./BUILD.md)** — panduan setup detail dengan troubleshooting
- **[knowledge-base.md](./knowledge-base.md)** — arsitektur, ERD, flow autentikasi, konvensi, decision log

---

Powered by [IDEA](https://ide.asia)
