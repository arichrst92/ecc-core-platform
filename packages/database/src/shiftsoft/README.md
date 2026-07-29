# Shiftsoft Legacy Migration

One-time (repeatable) migration data jemaat dari `shiftsoft.org` (church management SaaS lama) ke ECC platform. Idempotent — safe untuk run periodic sebagai sync.

## Setup

### 1. Isi hash env

Copy 8 hash Shiftsoft (dari owner sistem lama) ke root `.env`:

```env
SHIFTSOFT_HASH_ECCGLOBAL=RGxNjtMZ2532cnMFoccDX4y1T3raK4jcQZ0=
SHIFTSOFT_HASH_ECCBANDUNG=aSENJM8r2pp7vgUIGacTM64Mm7x3I-Zwf5U=
SHIFTSOFT_HASH_ECCJAKARTA=...
SHIFTSOFT_HASH_ECCBALI=...
SHIFTSOFT_HASH_ECCMALANG=...
SHIFTSOFT_HASH_ECCSYDNEY=...
SHIFTSOFT_HASH_ECCKUALALUMPUR=...
SHIFTSOFT_HASH_ECCMAKASSAR=...
```

### 2. Pastikan cabang ECC sudah ada

Script inference cabang lewat slug substring match:
- `eccbandung` → cabang dengan nama LIKE `%Bandung%`
- `eccglobal` → cabang dengan nama LIKE `%Global%`
- dll (lihat `config.ts` `cabangMatch`)

Kalau cabang belum ada, script akan fatal per-tenant. Bikin dulu di portal `/dashboard/cabang`.

### 3. Pastikan migration schema applied

Field baru di Jemaat (`legacyShiftsoftId`, `tanggalBaptisAir`, dst) datang dari migration `20260731000000_legacy_shiftsoft_fields`. Verify:

```bash
cd packages/database
npx dotenv-cli -e ../../.env -- npx prisma migrate status
```

Harus include migration tsb di applied list.

## Usage

Semua command jalan dari root repo:

```bash
# Dry-run 1 tenant (default — NO write ke DB, cuma preview)
pnpm --filter @ecc/database db:migrate-shiftsoft -- --slug=eccbandung

# Dry-run + limit 10 records untuk fast preview
pnpm --filter @ecc/database db:migrate-shiftsoft -- --slug=eccbandung --limit=10

# Actual write (upsert) — WAJIB --commit
pnpm --filter @ecc/database db:migrate-shiftsoft -- --slug=eccbandung --commit

# Semua 8 tenant
pnpm --filter @ecc/database db:migrate-shiftsoft -- --all --commit
```

## Behavior

- **Match key**: `Jemaat.legacyShiftsoftId` (unique). Kalau ada → UPDATE (overwrite). Kalau tidak → CREATE.
- **Overwrite policy**: legacy wins. Semua field profile di-overwrite (kecuali `cabangId` — kalau jemaat sudah pindah cabang manual, tidak di-force back).
- **Skip criteria**: `Name` kosong → skip. Malformed `Phone1` / `Birthday` → warn + skip field itu saja (record tetap di-create).
- **Cabang mapping**: substring match slug → nama cabang. Adjustable di `config.ts`.
- **Rate limit**: 250ms delay antar API request, retry exponential backoff untuk 429/5xx.
- **Report**: JSON detail di `/tmp/shiftsoft-migration-<timestamp>.json` (fetched/created/updated/skipped/errors/warnings per tenant + record-level detail).

## Field mapping

### Top-level LegacyUser → Jemaat

| Legacy | ECC Jemaat | Note |
|---|---|---|
| `ID` | `legacyShiftsoftId` | idempotent match key |
| `Name` | `namaLengkap` | wajib — skip record kalau kosong |
| `Email` | `email` | trimmed, null kalau empty |
| `Phone1` | `noHp` | normalized ke E.164 (+62...) |
| `Gender` (0/1/2) | `jenisKelamin` (L/P/null) | 0 → null |
| `Birthday` | `tanggalLahir` | skip Go zero-time "0001-01-01" |
| `Address` + `City` | `alamat` | merged string |

### SpecialAttrs → Jemaat (kolom baru)

| Legacy SpecialAttrs | ECC Jemaat | Converter |
|---|---|---|
| `Berjemaat_di_ECC_sejak` | `tanggalBergabungGereja` | parseLegacyDate |
| `Pendidikan_Terakhir` | `pendidikanTerakhir` | cleanString |
| `Status_Pekerjaan` | `statusPekerjaan` | cleanString |
| `Nama_Sekolah/Tempat_Bekerja` | `namaKantor` | cleanString |
| `Alamat_Sekolah/Tempat_Bekerja` | `alamatKantor` | cleanString |
| `Status` (S/SM/JD/0/'') | `statusPernikahan` (Single/Menikah/Janda\|Duda) | mapStatusPernikahan + gender disambig |
| `Tanggal_Pernikahan` | `tanggalPernikahan` | parseLegacyDate |
| `Sudah_Baptis_Air` (Sudah/Belum/True/'') | `sudahBaptisAir` (bool) | parseYesNo |
| `Sudah_Baptis_Roh_Kudus` | `sudahBaptisRohKudus` | parseYesNo |
| `Spiritual_Journey_Terakhir` | `spiritualJourneyLevel` | cleanString |

## What's NOT migrated (yet)

Deferred ke Phase 3 (script terpisah) karena data legacy dirty + perlu review manual:

- **Family relations** (`FamilyRelation`) — `Nama_Lengkap_Ayah/Ibu/Pasangan/Anak_[1-4]` — perlu match ke Jemaat existing by nama+cabang, banyak edge case
- **Homecell auto-create** — `Nama_Homecell` (581 unique di Bandung, banyak typo/case duplicate), `Nama_Home_Leader`, `Nama_Zone_Leader` — perlu de-dup + review sebelum bulk create
- **Role mapping** — `RoleID` Shiftsoft ke ECC Role (belum ada mapping table)
- **Foto** — `PicPath` di-skip per keputusan user (mobile handle sendiri)
- **Field gamification** — Point, Balance, Rank, dll — irrelevant ECC

## Scheduling (opsional)

Untuk sync periodic via PM2 scheduled task, tambah di `ecosystem.config.cjs`:

```js
{
  name: 'shiftsoft-sync',
  script: 'pnpm',
  args: '--filter @ecc/database db:migrate-shiftsoft -- --all --commit',
  cron_restart: '0 3 * * *',  // 03:00 daily
  autorestart: false,
  cwd: '/var/www/ecc-core-platform',
  env: { NODE_ENV: 'production' },
}
```

## Development notes

- Script pakai native `fetch` (Node 20+) — no axios/undici deps.
- Prisma client di-import dari `@prisma/client` (bukan `@ecc/database` untuk lightweight startup).
- Semua field mapper defensive — return null untuk invalid, jangan throw. Failure isolated per-record supaya 1 bad row tidak halt entire migration.
- Report JSON detail untuk audit trail + retry investigation.
