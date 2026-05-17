# Build & Run Guide — Local Mac

Panduan langkah-demi-langkah untuk run platform di Mac (tanpa Docker, pakai PostgreSQL lokal).

## 1. Prasyarat

Verifikasi versi:

```bash
node --version    # harus ≥ 20.0.0
pnpm --version    # harus ≥ 9.0.0
psql --version    # harus ≥ 14 (rekomendasi 16)
```

### Install yang belum ada

**pnpm:**

```bash
corepack enable
corepack prepare pnpm@9.7.0 --activate
# Atau: npm install -g pnpm
```

**PostgreSQL via Homebrew:**

```bash
brew install postgresql@16
brew services start postgresql@16

# Tambah ke PATH (kalau belum)
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Verify Postgres jalan:

```bash
brew services list | grep postgresql
# postgresql@16 started ...
```

## 2. Setup database & user

```bash
# Buat user ecc_user dengan password
createuser -s ecc_user -P
# Saat ditanya password, ketik: ecc_password

# Buat database owned by ecc_user
createdb -O ecc_user ecc_platform
```

Verify:

```bash
psql -U ecc_user -d ecc_platform -c "SELECT current_user, current_database();"
# Output: current_user | current_database
#         ecc_user     | ecc_platform
```

Kalau ada error `psql: error: connection ... authentication failed`, edit `~/.psqlrc` atau set env var:

```bash
export PGPASSWORD=ecc_password
```

## 3. Install dependencies

```bash
cd "/Users/idea/Library/CloudStorage/OneDrive-IDEAsia/ECC Core Platform"
pnpm install
```

Yang akan terjadi:
- Resolve workspace packages (`@ecc/database`, `@ecc/auth`, `@ecc/shared-types`)
- Install ~600 transitive deps (~2-3 menit pertama kali)
- `sharp` & `face-api.js` download prebuilt binaries untuk darwin-arm64

**Kalau gagal:**
- "ERESOLVE" peer dep conflict → `pnpm install --no-strict-peer-dependencies`
- `sharp` install gagal di Mac M-series → `pnpm install --config.platform=darwin --config.arch=arm64`

## 4. Setup environment

```bash
cp .env.example .env
```

Edit `.env`, **minimum** isi:

```bash
# Generate JWT_SECRET (random 64 char)
openssl rand -hex 32
```

Paste hasilnya ke `JWT_SECRET=...`. `DATABASE_URL` default sudah cocok dengan setup di step 2.

Untuk WhatsApp (Fonnte) — bisa di-skip dulu kalau cuma mau test struktur, atau:
1. Daftar di https://fonnte.com
2. Beli paket (mulai ~Rp 100/pesan), connect device WhatsApp
3. Copy device token ke `FONNTE_TOKEN=...` di `.env`

Tanpa token Fonnte, login OTP akan throw error — tapi server log akan menunjukkan OTP yang ter-generate untuk testing manual sementara.

## 5. Setup schema database

```bash
# Generate Prisma client (TypeScript types)
pnpm db:generate

# Create tables & enums sesuai schema.prisma
pnpm db:migrate
# Saat ditanya nama migration, ketik: init

# Seed master data global (role, sub_role, kategori_ibadah, dll.)
pnpm db:seed
```

## 6. Seed akun fulltimer pertama

Karena auth pakai WhatsApp OTP, butuh minimal 1 jemaat dengan no HP valid + role Fulltimer.

**Opsi A — Prisma Studio (UI):**

```bash
pnpm db:studio
```

Buka `http://localhost:5555`, lalu add records di urutan:
1. **sinode** → nama "Sinode ECC", kode "ECC"
2. **cabang_gereja** → sinodeId (pilih), nama "ECC Jakarta", kode "JKT"
3. **jemaat** → cabangId (pilih), nama lengkap Anda, **noHp = +62... (WhatsApp Anda)**
4. **jemaat_role** → jemaatId, roleId "Fulltimer", subRoleId "Pastoral", subRoleStatusId "Lead Pastor"

**Opsi B — SQL langsung:**

```bash
psql -U ecc_user -d ecc_platform
```

```sql
INSERT INTO sinode (id, nama, kode, is_active, created_at, updated_at)
  VALUES (gen_random_uuid(), 'Sinode ECC', 'ECC', true, NOW(), NOW());

INSERT INTO cabang_gereja (id, sinode_id, nama, kode, is_active, created_at, updated_at)
  SELECT gen_random_uuid(), id, 'ECC Jakarta', 'JKT', true, NOW(), NOW()
  FROM sinode WHERE kode = 'ECC';

INSERT INTO jemaat (id, cabang_id, nama_lengkap, no_hp, is_active, created_at, updated_at)
  SELECT gen_random_uuid(), id, 'Ari Christian', '+628xxxxxxxxx', true, NOW(), NOW()
  FROM cabang_gereja WHERE kode = 'JKT';

INSERT INTO jemaat_role (id, jemaat_id, role_id, sub_role_id, sub_role_status_id, tanggal_mulai, is_active, created_at, updated_at)
  SELECT gen_random_uuid(), j.id, r.id, sr.id, srs.id, CURRENT_DATE, true, NOW(), NOW()
  FROM jemaat j, role r, sub_role sr, sub_role_status srs
  WHERE j.nama_lengkap = 'Ari Christian'
    AND r.nama = 'Fulltimer'
    AND sr.nama = 'Pastoral' AND sr.role_id = r.id
    AND srs.nama = 'Lead Pastor' AND srs.sub_role_id = sr.id;
```

**Ganti `+628xxxxxxxxx`** dengan no HP WhatsApp asli Anda.

## 7. (Opsional) Download face-api.js models

Kalau mau test face recognition / liveness:

```bash
./scripts/download-face-models.sh
```

Skip kalau hanya mau test OTP login.

## 8. Run dev server

```bash
pnpm dev
```

Yang berjalan paralel via Turborepo:
- **Portal** (Next.js) di http://localhost:3100
- **Core API** (Express) di http://localhost:4100
- **Swagger docs** di http://localhost:4100/docs

Tunggu sampai keduanya ready (~15-30 detik pertama kali).

## 9. Test login

1. Buka http://localhost:3100 → auto-redirect ke `/login`
2. Input no HP yang Anda seed di step 6 (format `+628...`)
3. Klik "Kirim OTP"

**Kalau Fonnte sudah dikonfigurasi**: OTP masuk ke WhatsApp Anda, copy ke form, masuk dashboard.

**Kalau belum**: cek server log untuk lihat OTP yang ter-generate. Saat ini OTP tidak di-log karena di-hash sebelum simpan — kalau perlu test tanpa Fonnte, sementara comment line `await sendOtpViaWhatsApp(...)` di `apps/core-api/src/routes/auth.ts` dan tambahkan `logger.info({ otp }, 'OTP for testing')` setelah `const otp = generateOtp()`.

## Troubleshooting

### "Cannot find module '@ecc/database'"

Workspace belum di-link. Run ulang `pnpm install`.

### P1010: User denied access on database

Schema permission. Run:

```bash
psql -U ecc_user -d ecc_platform -c "GRANT ALL ON SCHEMA public TO ecc_user; ALTER SCHEMA public OWNER TO ecc_user;"
```

Lalu retry `pnpm db:migrate`.

### "P1001: Can't reach database server"

PostgreSQL belum jalan. Cek:

```bash
brew services list | grep postgresql
brew services start postgresql@16
```

### "EADDRINUSE: port 3100/4100 already in use"

Port konflik dengan proses lain. Kill dulu:

```bash
lsof -ti:3100 | xargs kill -9
lsof -ti:4100 | xargs kill -9
```

Atau pakai port lain — set `PORT=4200` di `.env` untuk core-api, dan ganti `-p 3100` jadi `-p 3200` di `apps/portal/package.json`. Pastikan `NEXT_PUBLIC_CORE_API_URL` dan `CORS_ALLOWED_ORIGINS` di `.env` ikut update.

### Prisma migration error setelah update schema

Reset (DEV ONLY — hapus semua data):

```bash
pnpm --filter @ecc/database db:reset
pnpm db:seed
```

### Sharp install gagal di Mac M-series

```bash
pnpm install sharp --config.platform=darwin --config.arch=arm64
```

### Face-api.js model 404 saat enroll wajah

Belum download models:

```bash
./scripts/download-face-models.sh
```

Restart `pnpm dev`.

## Workflow harian setelah setup

```bash
# Cukup pnpm dev — Postgres sudah otomatis start saat boot Mac
pnpm dev
```

Postgres jalan terus di background (managed Homebrew). Stop kalau perlu:

```bash
brew services stop postgresql@16
```

## Database GUI

```bash
pnpm db:studio          # http://localhost:5555 — UI Prisma resmi
```

Atau pakai TablePlus / DBeaver / pgAdmin dengan connection string dari `DATABASE_URL`.

## (Opsional) Pakai Docker kalau lebih suka

File `docker-compose.yml` tetap ada di root untuk yang lebih suka Docker. Skip step 1-2 di atas dan ganti dengan:

```bash
docker compose up -d postgres
```

Lalu lanjut step 3.
