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
│   └── auth/          # JWT, OTP, WhatsApp & face-api helpers
├── images/            # Brand assets (logo-ecc, logo-idea)
├── docker-compose.yml # PostgreSQL + Redis (dev)
└── knowledge-base.md  # Dokumentasi lengkap arsitektur
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Start database (PostgreSQL + Redis)
pnpm docker:up

# Setup database
cp .env.example .env
pnpm db:migrate
pnpm db:seed

# Run dev (semua app)
pnpm dev
```

Portal: http://localhost:3000  |  Core API: http://localhost:4000  |  Docs: http://localhost:4000/docs

## Dokumentasi

Untuk informasi lengkap tentang arsitektur, ERD, flow autentikasi, konvensi kode, dan deployment, lihat **[knowledge-base.md](./knowledge-base.md)**.

---

Powered by [IDEA](https://ide.asia)
