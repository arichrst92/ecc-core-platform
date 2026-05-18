# ECC Core Platform — Knowledge Base

> Dokumentasi lengkap arsitektur, model data, autentikasi, dan konvensi kerja untuk **ECC Master Data Platform**.
> Generated: 2026-05-14 · Maintained by: IDEA × ECC

---

## 1. Tujuan & Ruang Lingkup

Platform ini adalah portal terpusat untuk mengelola seluruh **master data** organisasi gereja di bawah naungan ECC. Output platform ini terbagi dua:

1. **Portal admin** (`portal.eccchurch.global`) — UI Next.js untuk CRUD oleh staf Fulltimer.
2. **Core API** (`core-api.eccchurch.global`) — REST API berdokumentasi OpenAPI yang dikonsumsi aplikasi lain di ekosistem ECC (mobile app, attendance system, dst).

Master data yang dikelola: **Sinode, Cabang Gereja, Jemaat, Role, Sub-Role, Sub-Role Status, Ibadah, Kategori Ibadah, Tipe Relasi Keluarga**, dan relasi-relasi antar entitas tersebut.

---

## 2. Arsitektur Tingkat Tinggi

```
┌─────────────────────┐         ┌─────────────────────┐
│   portal (Next.js)  │         │  Mobile App / dll.  │
│  portal.eccchurch   │         │  (konsumer publik)  │
└──────────┬──────────┘         └──────────┬──────────┘
           │ JWT (Fulltimer)               │ API Key
           ▼                               ▼
       ┌───────────────────────────────────────┐
       │       Core API (Express + TS)         │
       │  /auth · /admin · /api/v1 · /docs     │
       └────────────┬──────────────────────────┘
                    │  Prisma
                    ▼
       ┌─────────────────────┐    ┌──────────────┐
       │     PostgreSQL      │    │    Redis     │
       │  (13 tabel master)  │    │ (OTP cache)  │
       └─────────────────────┘    └──────────────┘
```

Catatan kunci:

- Portal **read/write** lewat `/admin/*` endpoints, semua di-gate JWT + role check `isFulltimer`.
- Konsumer eksternal **read-only** (default) lewat `/api/v1/*`, autentikasi via **X-API-Key** yang di-scope per sinode.
- Auth ini **universal** — siapa pun jemaat (bukan hanya fulltimer) bisa login. Portal hanya menolak yang bukan fulltimer; aplikasi lain bebas konsumen otentikasi siapa pun.

---

## 3. Struktur Monorepo

```
ecc-platform/
├── apps/
│   ├── portal/                 # Next.js 14 (App Router)
│   │   ├── src/app/
│   │   │   ├── login/          # Halaman login (WA OTP + face shortcut)
│   │   │   └── dashboard/      # Halaman admin (sidebar + 9 master data)
│   │   ├── src/components/     # Sidebar, Topbar, placeholder generik
│   │   ├── src/lib/            # api-client, auth-store, phone helpers
│   │   └── public/             # logo-ecc.webp, logo-idea.webp
│   └── core-api/               # Express + TypeScript
│       ├── src/routes/
│       │   ├── auth.ts         # OTP request/verify, face login
│       │   ├── admin/          # CRUD endpoints (JWT required)
│       │   └── public/         # Read-only consumer endpoints (API key)
│       ├── src/middleware/     # require-auth, require-api-key, error-handler
│       └── src/lib/            # logger, errors
├── packages/
│   ├── database/               # Prisma schema, migrations, seed
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # 13 entity models
│   │   │   └── seed.ts         # Master data global awal
│   │   └── src/index.ts        # Singleton PrismaClient
│   ├── shared-types/           # Zod schemas + inferred types
│   │   └── src/schemas/        # common, auth, sinode, cabang, jemaat, role, ibadah, keluarga
│   └── auth/                   # JWT, OTP, face matching, WhatsApp client
├── images/                     # Brand assets
├── docker-compose.yml          # PostgreSQL + Redis (dev)
├── turbo.json                  # Pipeline orchestration
├── pnpm-workspace.yaml
└── .env.example                # Template environment variables
```

**Kenapa monorepo?** Sharing `@ecc/shared-types` antara FE dan BE memberikan satu sumber kebenaran untuk validation schema. Zod schema di satu tempat → otomatis dipakai untuk validasi request di Express dan validasi form di React Hook Form.

---

## 4. Model Data — 22 Tabel

> Catatan: ERD konseptual awal punya 13 tabel. Saat scaffolding cluster Auth dipecah menjadi 4 tabel (`user`, `otp_verification`, `refresh_token`, `sinode_api_key`); Milestone 2 menambahkan `audit_log`; Milestone 3 menambahkan cluster Pelayanan (`pelayanan`, `pelayanan_role`, `jemaat_pelayanan`, `ibadah_pelayanan`); selanjutnya `ibadah_pelayanan_petugas` untuk roster per ibadah; lalu `reservasi` untuk kehadiran. Total Prisma model sekarang = 22.

### 4.1 Cluster Organisasi

**`sinode`** — Top-level organisasi.
Fields: `id, nama, kode (unique), alamat, kontak, is_active`.

**`cabang_gereja`** — Cabang di bawah sinode. `(sinode_id, kode)` unique.
Fields: `id, sinode_id, nama, kode, alamat, kontak, is_active`.

**`jemaat`** — Anggota individu, terdaftar di satu cabang home.
Fields: `id, cabang_id, nama_lengkap, email, no_hp, tanggal_lahir, jenis_kelamin (L/P), alamat, tanggal_bergabung, foto_url, is_active`. Field `no_hp` unique (jadi identifier untuk login WhatsApp OTP).

### 4.2 Cluster Klasifikasi Peran (Global, lintas sinode)

**`role`** → **`sub_role`** → **`sub_role_status`**: hierarchy tiga level. Status nullable.

**`jemaat_role`** (junction many-to-many dengan riwayat):
- `jemaat_id, role_id, sub_role_id, sub_role_status_id (nullable)`
- `tanggal_mulai, tanggal_selesai (nullable), is_active, catatan`
- Memungkinkan satu jemaat punya banyak penugasan aktif sekaligus, plus history.

Seed default (dari skrip `seed.ts`):
- **Jemaat** → New Comers, Jemaat Tetap (tanpa status)
- **Fulltimer** → Pastoral (Lead/Associate/Children/Teens/Youth Pastor) + Administration (Head of Admin/Staff)

> Catatan: role "Volunteer" yang sebelumnya di cluster ini sekarang dipindah ke cluster **Pelayanan** (section 4.6) karena semantik berbeda — Volunteer adalah operasional ministry, bukan klasifikasi keanggotaan.

### 4.3 Cluster Ibadah

**`kategori_ibadah`** (global): Ibadah Umum, Ibadah Doa, Ibadah Pemuda, Ibadah Anak, Komsel, Persekutuan Kategorial.

**`ibadah`** (per cabang):
- `cabang_id, kategori_ibadah_id, nama`
- `tipe_jadwal` enum: `WEEKLY | BIWEEKLY | MONTHLY | ONCE`
  - **WEEKLY** — setiap minggu di hari `hari` (mis. Ibadah Umum Minggu pagi)
  - **BIWEEKLY** — setiap 2 minggu di hari `hari`
  - **MONTHLY** — setiap bulan di tanggal-of-month dari `tanggal_mulai` (mis. tanggal 1 setiap bulan)
  - **ONCE** — event sekali di `tanggal_mulai` (mis. KKR, ibadah Natal khusus, retret)
- `tanggal_mulai` — kapan ibadah dimulai (untuk recurring = tanggal pertama, untuk ONCE = tanggal event)
- `hari` (Minggu/Senin/dst, **wajib untuk WEEKLY/BIWEEKLY**, di-hide untuk MONTHLY/ONCE)
- `jam_mulai, jam_selesai` (string HH:mm)
- `lokasi`, `is_online` (boolean), `link_stream` (nullable, wajib jika online)
- `deskripsi, is_active`

**Calendar view & occurrence generation:**
- Endpoint `GET /admin/ibadah/calendar?from=&to=` generate semua occurrence di rentang tanggal
- Logic di `apps/core-api/src/lib/ibadah-occurrences.ts`:
  - WEEKLY/BIWEEKLY: iterate by 7/14 days dari `tanggal_mulai`, hanya tanggal yang match `hari`
  - MONTHLY: same day-of-month tiap bulan (skip kalau tanggal invalid mis. 31 Feb)
  - ONCE: 1 date saja
- UI di `/dashboard/ibadah` → toggle **List | Kalender**. Calendar grid 7×N dengan event chips per tanggal, klik tanggal → panel detail bawah dengan link ke detail ibadah & reservasi tanggal tsb.

### 4.4 Cluster Relasi Keluarga

**`tipe_relasi_keluarga`** (global): Suami, Istri, Ayah, Ibu, Anak Laki-Laki, Anak Perempuan, Saudara Kandung, Kakek, Nenek, Cucu, Wali.

**`jemaat_relasi`** (self-referencing, satu arah):
- `jemaat_id` (subjek) → `jemaat_terkait_id` (objek)
- Contoh: A → B `Suami` artinya **B adalah suami dari A**.
- Bisa di-**hard-delete** kapan saja.
- Unique constraint pada `(jemaat_id, jemaat_terkait_id, tipe_relasi_id)`.

### 4.5 Cluster Auth & API

**`user`** — Auth record per jemaat:
- `id, jemaat_id (unique FK), face_descriptor (Json, 128-dim Float32), face_enrolled_at, last_login_at, is_active`
- Tidak menyimpan password. Identitas verified via **OTP WhatsApp** (primary) atau **face descriptor matching** (shortcut).

**`otp_verification`** — Audit trail + active OTP records:
- `no_hp, kode_hash (bcrypt), purpose (LOGIN/ENROLLMENT/RESET_FACE)`
- `attempts, expires_at, used_at, ip_address, user_agent`

**`refresh_token`** — Long-lived refresh tokens (revokable).

**`sinode_api_key`** — API keys untuk konsumer eksternal:
- Scoped per sinode (`sinode_id`)
- Key format: `ecc_<prefix>_<random>` — prefix dipakai untuk lookup cepat, full key di-bcrypt
- Punya `scopes` (array, mis. `["read:jemaat", "read:ibadah"]`) untuk fine-grained access nanti.

### 4.6 Cluster Pelayanan (Ministry — operasional)

Berbeda dengan `role/sub_role` (klasifikasi keanggotaan: Jemaat/Fulltimer), cluster ini menggambarkan **struktur tim ministry aktif** yang melayani di ibadah. Empat tabel:

**`pelayanan`** (global): nama, deskripsi, is_active.
Seed default: Multimedia, Worship, Usher, Children Ministry, Teens Ministry, Prayer Ministry, Hospitality.

**`pelayanan_role`** (per-pelayanan): role spesifik di tim itu. Punya `level` (integer) untuk hierarki.
- Multimedia: Leader (10), Co-Leader (5), Camera Operator (0), Sound Engineer (0), Video Switcher (0), Lighting (0), Streaming (0), Trainee (-5)
- Worship: Worship Leader (10), Co-Worship Leader (5), Vocalist (0), Guitarist (0), Keyboardist (0), Bassist (0), Drummer (0), Trainee (-5)
- Usher: Leader (10), Co-Leader (5), Greeter (0), Seater (0), Offering Counter (0)
- dst.

**`jemaat_pelayanan`** (junction M:N + riwayat):
- `jemaat_id, pelayanan_id, pelayanan_role_id`
- `tanggal_mulai, tanggal_selesai (nullable), is_active, catatan`
- Satu jemaat bisa join beberapa pelayanan dengan role berbeda.
- Validasi backend: `pelayanan_role_id` harus belong ke `pelayanan_id` yang sama.

**`ibadah_pelayanan`** (junction M:N):
- `ibadah_id, pelayanan_id`
- Tracking pelayanan mana yang melayani di ibadah mana.
- Unique constraint pada pair `(ibadah_id, pelayanan_id)`.

**`ibadah_pelayanan_petugas`** (3-way junction — siapa petugas spesifik di ibadah-pelayanan):
- `ibadah_pelayanan_id, jemaat_id, pelayanan_role_id, catatan`
- Contoh: Ibadah Pemuda → Multimedia → Jason (Camera Operator), Rahmat (Sound Engineer).
- Unique pada `(ibadah_pelayanan_id, jemaat_id)` — satu jemaat 1 role per ibadah-pelayanan combo.
- Validasi backend: `pelayanan_role_id` harus belong ke pelayanan dari `ibadah_pelayanan_id`.
- CASCADE delete saat ibadah/pelayanan/link dihapus.
- Assignment persistent untuk semua occurrence ibadah recurring (tidak per-date). Untuk schedule rotation per-date butuh tabel attendance terpisah (out-of-scope MVP).

UI portal:
- `/dashboard/pelayanan` — kartu per pelayanan dengan role chips (level dilambangkan warna: emas=Leader, oranye=Co-Leader, biru=Member, abu=Trainee). Add inline untuk pelayanan baru + role baru per pelayanan. **Klik nama role di chip** untuk edit (nama, level, deskripsi).
- `/dashboard/jemaat/[id]` — detail jemaat dengan section Pelayanan (active + history), form assign baru, tombol "Akhiri" (set tanggalSelesai), hapus permanent.
- `/dashboard/ibadah/[id]` — detail ibadah dengan section "Pelayanan yang Melayani". Tiap pelayanan link bisa di-expand → list petugas (jemaat + role) → tombol **Tambah Petugas** buka modal yang menampilkan **member pelayanan tsb** dengan checkbox + dropdown role per row (default = role mereka di pelayanan, bisa di-override). Submit batch (Promise.allSettled). Hapus link pelayanan auto-CASCADE hapus semua petugas-nya.

Sidebar dikelompokkan jadi 4 grup dengan label header:
- **Entity** — Sinode, Cabang Gereja
- **Service** — Ibadah, Kategori Ibadah, Pelayanan (role di-edit inline di sini)
- **People** — Jemaat, Role Jemaat, Relasi Jemaat
- **Developer Tools** — API Keys, Audit Log

Plus Dashboard di atas grup dan Profil & Keamanan di bawah (separator). Page lama `/dashboard/pelayanan-role` di-deprecate (auto-redirect ke `/pelayanan`).

---

## 5. Autentikasi & Authorization

### 5.1 Flow Utama: WhatsApp OTP

```
[FE]  POST /auth/otp/request  { noHp: "+628..." }
[BE]  → cek jemaat exists
      → generate OTP 6 digit, hash bcrypt, simpan dengan TTL 5 menit
      → kirim via WhatsApp Cloud API (template "ecc_login_otp")
      → response 200

[FE]  POST /auth/otp/verify  { noHp, kode, purpose }
[BE]  → cek OTP record aktif (belum expired, belum used, attempts < 3)
      → bcrypt compare
      → mark used_at = now
      → cari/buat User record
      → load roles aktif → hitung isFulltimer flag
      → sign JWT (7d) + refresh token (30d)
      → response: { accessToken, refreshToken, user }
```

### 5.2 Flow Opsional: Face Recognition Shortcut

Setelah user enroll wajahnya (capture descriptor via face-api.js, kirim via endpoint enrollment yang dilindungi OTP):

```
[FE]  POST /auth/face/login  { noHp, descriptor: [128 float] }
[BE]  → load User.faceDescriptor
      → euclidean distance candidate vs stored
      → jika < FACE_MATCH_THRESHOLD (default 0.5), grant JWT
      → else 401
```

**Catatan keamanan face-api.js:** descriptor 128-dim bersifat one-way (tidak bisa di-reverse ke foto), tapi MUST kombinasikan dengan **liveness detection** sebelum production deploy (mis. blink detection atau head turn challenge). Saat ini scaffolding belum termasuk liveness — TODO sebelum go-live.

### 5.3 Token Rotation & Refresh

Saat user login (OTP/Face), server mengeluarkan **dua token**:

- **Access token** (JWT, default 7d) — dipakai di header `Authorization: Bearer ...` untuk semua request authenticated
- **Refresh token** (JWT terpisah, default 30d) — disimpan di klien, dipakai untuk dapat access token baru saat habis

Refresh token disimpan di DB sebagai **SHA256 hash** (deterministik untuk exact-match lookup, unique index di kolom `token_hash`). Bcrypt tidak dipakai karena token sudah random panjang (bukan password user) dan kita butuh O(1) lookup, bukan iterasi semua row.

#### Flow refresh

```
[FE] Request → 401 (access token expired)
[FE] interceptor: panggil POST /auth/refresh dengan refreshToken
[BE] verify JWT signature → lookup tokenHash di DB
[BE] cek: belum revoked, belum expired → revoke yang lama (rotation)
[BE] sign access + refresh BARU, simpan hash baru
[FE] update store dengan token baru, retry original request
```

Concurrent-safe: jika 5 request bareng kena 401, hanya 1 yang panggil `/refresh`, sisanya antri di queue dan retry setelah refresh selesai. Implementasi di `apps/portal/src/lib/api-client.ts`.

#### Reuse detection (security)

Jika klien (atau attacker yang mencuri token) mengirim refresh token yang **sudah revoked**, server menganggap ini indikasi token bocor dan **revoke seluruh refresh token user tersebut**. User dipaksa login ulang dari semua device. Log warning di-emit untuk audit.

#### Logout

`POST /auth/logout` dengan body `{ refreshToken }` — revoke 1 sesi.
`POST /auth/logout?all=true` (butuh access token valid) — revoke semua sesi user.

### 5.4 Portal Access Gate

Portal hanya menampilkan dashboard jika `user.isFulltimer === true` (dicek di FE setelah login, dan re-validated di setiap `/admin/*` request via middleware `requireFulltimer`).

### 5.5 Konsumer API Eksternal

```
GET /api/v1/cabang
X-API-Key: ecc_<prefix>_<secret>
```

Middleware `requireApiKey`:
1. Parse prefix dari key
2. Lookup `SinodeApiKey` records dengan prefix tersebut
3. Bcrypt compare key full ke setiap candidate
4. Reject jika expired
5. Inject `req.apiKey = { id, sinodeId, scopes }` untuk downstream
6. Endpoint query otomatis filter `sinodeId` agar tidak bocor lintas sinode.

---

## 6. Endpoint API (Singkat)

| Path                                    | Method | Auth        | Deskripsi                                  |
|-----------------------------------------|--------|-------------|--------------------------------------------|
| `/health`                               | GET    | none        | Health check                               |
| `/docs`                                 | GET    | none        | Swagger UI                                 |
| `/auth/otp/request`                     | POST   | none        | Kirim OTP ke WhatsApp                      |
| `/auth/otp/verify`                      | POST   | none        | Verifikasi OTP, dapat JWT                  |
| `/auth/face/login`                      | POST   | none        | Login shortcut via face                    |
| `/auth/face/enroll`                     | POST   | Auth        | Save descriptor wajah user yang login      |
| `/auth/face/reset`                      | POST   | Auth        | Hapus descriptor wajah                     |
| `/auth/refresh`                         | POST   | none        | Rotate access + refresh token              |
| `/auth/logout`                          | POST   | optional    | Revoke refresh token (?all=true)           |
| `/admin/sinode`                         | GET/POST | Fulltimer | List/Create sinode                         |
| `/admin/sinode/:id`                     | GET/PATCH/DELETE | Fulltimer | Detail/Update/Delete                 |
| `/admin/cabang`                         | GET/POST | Fulltimer | List/Create cabang                         |
| `/admin/jemaat`                         | GET/POST | Fulltimer | List/Create jemaat                         |
| `/admin/jemaat/import/template`         | GET    | Fulltimer   | Download template CSV import               |
| `/admin/jemaat/import/preview`          | POST   | Fulltimer   | Preview + validate CSV (dry-run)           |
| `/admin/jemaat/import/commit`           | POST   | Fulltimer   | Commit CSV import (transactional)          |
| `/admin/role`                           | GET/POST | Fulltimer | List role hierarchy                        |
| `/admin/role/sub-role`                  | POST   | Fulltimer   | Create sub-role                            |
| `/admin/role/sub-role-status`           | POST   | Fulltimer   | Create status                              |
| `/admin/role/assign`                    | POST   | Fulltimer   | Assign role ke jemaat                      |
| `/admin/ibadah`                         | GET/POST | Fulltimer | List/Create ibadah                         |
| `/admin/ibadah/kategori`                | GET/POST | Fulltimer | Kategori ibadah                            |
| `/admin/keluarga/tipe`                  | GET/POST | Fulltimer | Tipe relasi master                         |
| `/admin/keluarga/relasi`                | POST/DELETE | Fulltimer | Assign relasi antar jemaat              |
| `/admin/pelayanan`                      | GET/POST | Fulltimer | List/Create pelayanan (ministry)           |
| `/admin/pelayanan/:id`                  | GET/PATCH/DELETE | Fulltimer | Detail/Update/Delete pelayanan       |
| `/admin/pelayanan/role`                 | POST   | Fulltimer   | Tambah role per-pelayanan                  |
| `/admin/pelayanan/role/:id`             | PATCH/DELETE | Fulltimer | Update/Delete role                       |
| `/admin/pelayanan/assign`               | POST   | Fulltimer   | Assign jemaat ke pelayanan + role          |
| `/admin/pelayanan/assign/:id`           | PATCH/DELETE | Fulltimer | Update/akhiri penugasan                 |
| `/admin/pelayanan/ibadah-link`          | POST/DELETE | Fulltimer | Link/unlink pelayanan ↔ ibadah          |
| `/admin/pelayanan/ibadah-link/:id/petugas` | GET | Fulltimer | List petugas di 1 ibadah-pelayanan           |
| `/admin/pelayanan/petugas`              | POST   | Fulltimer   | Assign jemaat sebagai petugas              |
| `/admin/pelayanan/petugas/:id`          | PATCH/DELETE | Fulltimer | Update/Hapus petugas                     |
| `/admin/reservasi`                      | GET/POST | Fulltimer | List reservasi (filter status/ibadah/tgl) + create   |
| `/admin/reservasi/by-kode/:kode`        | GET    | Fulltimer   | Lookup reservasi by kode barcode           |
| `/admin/reservasi/:id`                  | GET/DELETE | Fulltimer | Detail/Hapus                              |
| `/admin/reservasi/:id/status`           | PATCH  | Fulltimer   | Ganti status (Reserve/Join/Cancel)         |
| `/admin/reservasi/bulk`                 | POST   | Fulltimer   | Bulk reservasi (banyak jemaat sekaligus)   |
| `/admin/reservasi/checkin`              | POST   | Fulltimer   | Check-in by kode (admin scanner)           |
| `/api/v1/reservasi/by-kode/:kode`       | GET    | API Key     | Mobile: lookup reservasi                   |
| `/api/v1/reservasi/checkin`             | POST   | API Key     | Mobile: scan QR → check-in (set JOIN)      |
| `/api/v1/reservasi/cancel`              | POST   | API Key     | Mobile: cancel reservasi                   |
| `/admin/audit-log`                      | GET    | Fulltimer   | List audit log dengan filter               |
| `/admin/audit-log/:id`                  | GET    | Fulltimer   | Detail entry                                |
| `/admin/audit-log/resource/:res/:id`    | GET    | Fulltimer   | Timeline log 1 entity                       |
| `/upload/jemaat/:id/foto`               | POST/DELETE | Fulltimer | Upload foto resmi jemaat                 |
| `/upload/user/me/foto`                  | POST/DELETE | Auth      | Upload/hapus avatar diri sendiri         |
| `/uploads/profiles/*`                   | GET    | none        | Static serve foto profil                   |
| `/api/v1/cabang`                        | GET    | API Key     | List cabang (scoped sinode)                |
| `/api/v1/ibadah`                        | GET    | API Key     | List ibadah aktif                          |
| `/api/v1/jemaat/:id`                    | GET    | API Key     | Detail jemaat (scoped sinode)              |

Full spec: lihat `apps/core-api/src/openapi.ts` (di-serve di `/docs`).

---

## 7. Setup Development

### Prasyarat

- Node.js ≥ 20
- pnpm ≥ 9 (`corepack enable && corepack prepare pnpm@9.7.0 --activate`)
- PostgreSQL ≥ 14 (rekomendasi 16, install via Homebrew)
- Akun WhatsApp gateway **Fonnte** (https://fonnte.com) — lihat section 8

> Setup detail step-by-step ada di [BUILD.md](./BUILD.md).

### Quick start

```bash
# 1. Install Postgres + buat user/db
brew install postgresql@16 && brew services start postgresql@16
createuser -s ecc_user -P                # password: ecc_password
createdb -O ecc_user ecc_platform

# 2. Install deps + setup env
pnpm install
cp .env.example .env
# Edit .env: JWT_SECRET (openssl rand -hex 32), FONNTE_TOKEN

# 3. Schema + seed
pnpm db:generate
pnpm db:migrate                          # ketik 'init' saat ditanya
pnpm db:seed

# 4. (Opsional) Download face-api.js models (~12 MB)
./scripts/download-face-models.sh

# 5. Run semua app (dev mode, parallel via Turborepo)
pnpm dev
```

Akses:
- Portal: http://localhost:3100
- Core API: http://localhost:4100
- API Docs: http://localhost:4100/docs
- Prisma Studio (DB GUI): `pnpm db:studio` → http://localhost:5555

### Seed Akun Fulltimer Pertama

Karena auth berdasarkan `noHp` di tabel `jemaat`, fulltimer pertama harus di-insert manual:

```sql
-- via psql atau Prisma Studio
INSERT INTO sinode (id, nama, kode, is_active, created_at, updated_at)
  VALUES (gen_random_uuid(), 'Sinode ECC', 'ECC', true, NOW(), NOW());

INSERT INTO cabang_gereja (id, sinode_id, nama, kode, is_active, created_at, updated_at)
  SELECT gen_random_uuid(), id, 'ECC Jakarta', 'JKT', true, NOW(), NOW()
  FROM sinode WHERE kode = 'ECC';

INSERT INTO jemaat (id, cabang_id, nama_lengkap, no_hp, is_active, created_at, updated_at)
  SELECT gen_random_uuid(), id, 'Admin Pertama', '+628123456789', true, NOW(), NOW()
  FROM cabang_gereja WHERE kode = 'JKT';

INSERT INTO jemaat_role (id, jemaat_id, role_id, sub_role_id, sub_role_status_id, tanggal_mulai, is_active, created_at, updated_at)
  SELECT gen_random_uuid(), j.id, r.id, sr.id, srs.id, CURRENT_DATE, true, NOW(), NOW()
  FROM jemaat j, role r, sub_role sr, sub_role_status srs
  WHERE j.nama_lengkap = 'Admin Pertama'
    AND r.nama = 'Fulltimer'
    AND sr.nama = 'Pastoral' AND sr.role_id = r.id
    AND srs.nama = 'Lead Pastor' AND srs.sub_role_id = sr.id;
```

Setelah itu coba login di portal dengan nomor tersebut → OTP masuk ke WhatsApp → masuk ke dashboard.

### Docker (opsional)

`docker-compose.yml` tetap disertakan untuk yang lebih suka isolasi Docker:

```bash
docker compose up -d postgres
```

Lalu skip step 1 di atas dan lanjut step 2.

---

## 8. WhatsApp Gateway — Fonnte

Pakai [Fonnte](https://fonnte.com) — gateway WhatsApp lokal Indonesia. Pilih ini karena:

- **Setup cepat** — tidak perlu template approval seperti Meta Cloud API
- **Murah** untuk volume rendah-menengah (~Rp 100/pesan)
- **API simpel** — satu POST endpoint untuk kirim text
- **Lokal** — support Indonesia, billing rupiah

### Setup

1. Daftar di https://fonnte.com
2. Beli paket sesuai estimasi volume OTP
3. Di dashboard Fonnte: **Devices** → connect device WhatsApp Anda (scan QR sekali, device tetap online)
4. Copy **Device Token** ke `FONNTE_TOKEN` di `.env`

### Test pengiriman

```bash
curl -X POST https://api.fonnte.com/send \
  -H "Authorization: <FONNTE_TOKEN>" \
  -d "target=628123456789&message=Test dari ECC Platform"
```

Atau langsung dari portal `/login` → input no HP → "Kirim OTP".

### Format pesan

Fungsi `sendOtpViaWhatsApp()` di `packages/auth/src/whatsapp.ts` mengirim format:

```
*ECC Portal*
Kode OTP Anda: *123456*

Berlaku 5 menit. Jangan bagikan kode ini ke siapapun.
```

Bold (`*...*`) di-render WhatsApp sebagai bold text.

### Migrasi ke Meta Cloud API nanti

Saat volume tinggi atau butuh SLA resmi, swap implementasi di `whatsapp.ts` (interface fungsi `sendOtpViaWhatsApp(noHp, otp)` tetap sama). Yang berubah hanya body fungsi + env vars.

---

## 9. Face Recognition (face-api.js)

### Model files

face-api.js butuh 3 net dengan total 8 file (~12 MB):
- `ssd_mobilenetv1_model-*` (3 file) — face detection
- `face_landmark_68_model-*` (2 file) — 68-point landmarks
- `face_recognition_model-*` (3 file) — 128-dim descriptor

Dapatkan dengan menjalankan sekali dari root project:

```bash
./scripts/download-face-models.sh
```

Folder tujuan: `apps/portal/public/face-models/` (di-serve sebagai static asset di path `/face-models/*`). Folder ini sudah di-gitignore (kecuali README), jadi script perlu dijalankan saat clone repo atau di Dockerfile.

### Loader (FE)

`apps/portal/src/lib/face-api-loader.ts` adalah singleton — model di-fetch sekali per page session, lalu cached. Dipakai oleh kedua component capture (login & enrollment).

### Capture Component

`apps/portal/src/components/face/face-capture.tsx` adalah komponen reusable:

```tsx
<FaceCapture
  onCapture={(descriptor) => apiClient.post('/auth/face/enroll', { descriptor })}
  submitting={mutation.isPending}
  submitLabel="Daftarkan Wajah"
/>
```

UX flow:
1. Load models → "Memuat model wajah..."
2. Buka webcam (front camera, 480×360)
3. Loop deteksi tiap 800ms — pakai SSD MobileNet v1 + landmarks + descriptor
4. Saat confidence ≥ 0.7, descriptor tersimpan, frame overlay berubah hijau
5. User klik "Simpan" atau "Capture Ulang"

### Enrollment flow

```
[FE] User di /dashboard/profile klik "Enroll Wajah"
[FE] FaceCapture modal terbuka → user pose, deteksi auto
[FE] POST /auth/face/enroll  { descriptor: [128 numbers] }
[BE] verify auth → save descriptor JSON di user.faceDescriptor, set faceEnrolledAt
[FE] update auth store: hasFaceEnrolled = true
```

### Login flow (shortcut, opsional)

User input no HP → klik "Login dengan Wajah" → capture wajah → POST `/auth/face/login`. Server cari user berdasarkan noHp → bandingkan descriptor (Euclidean distance) → jika `< FACE_MATCH_THRESHOLD`, issue JWT. Fallback ke OTP kalau gagal.

### Reset

`POST /auth/face/reset` (auth required) — hapus descriptor. Untuk re-enroll setelah wajah berubah signifikan (operasi, akumulasi waktu).

### Liveness detection

Sebelum descriptor di-capture (baik enrollment maupun login), user harus lulus **2 random challenge** dari pool berikut:

- **Blink 2x** — track Eye Aspect Ratio (EAR) dari landmark mata. Blink valid = transisi open → closed → open dalam 80–500 ms (filter terlalu cepat = false positive, terlalu lama = bukan blink natural).
- **Tengok kiri** — head yaw ke kiri. Heuristic: posisi nose tip relatif outer eye corners (rasio < 0.35).
- **Tengok kanan** — sama, rasio > 0.65.

Per challenge timeout 15 detik. Butuh 3 frame consecutive head turn untuk lulus (anti false-positive saat head berputar lewat).

UI menampilkan instruksi real-time di overlay video, countdown detik, dan progress bar. Setelah verified, frame berubah biru dan descriptor di-capture otomatis. Bisa retry kalau timeout.

Implementasi:
- `apps/portal/src/lib/liveness.ts` — `BlinkDetector` (state machine open/closed), `detectHeadDirection()`, `computeBothEyesEAR()`, `pickRandomChallenges()`
- `apps/portal/src/lib/use-liveness-challenge.ts` — hook state machine (idle → running → verified | failed)
- Integrated di `FaceCapture` via prop `requireLiveness` (default `true`)

#### Threat model

| Attack | Mitigated? | Notes |
|--------|-----------|-------|
| Foto statik dipegang depan kamera | ✅ | Tidak bisa blink atau tengok |
| Foto cetak hi-res | ✅ | Sama |
| Video pre-recorded yang putar blink/turn random | ⚠️ Partial | Tergantung sequence yang muncul — kalau attacker punya video lengkap semua aksi, bisa lolos |
| Real-time deepfake | ❌ | Butuh anti-spoofing dedicated service |
| 3D mask | ❌ | Butuh depth/IR camera atau ML model khusus |

Kombinasi blink + head turn cukup raises the bar dari serangan trivial (foto statik). Untuk production tinggi-risiko, integrasikan dengan **AWS Rekognition Face Liveness** atau **Azure Face Liveness API** sebagai layer tambahan.

#### Disable liveness

Jika perlu (mis. enrollment kiosk dengan supervisi manusia), pakai `<FaceCapture requireLiveness={false} />`. Default selalu `true`.

### Server-side verification

Lihat `packages/auth/src/face.ts`:
- `matchFace(candidate, stored)` → Euclidean distance < `FACE_MATCH_THRESHOLD`
- Default threshold 0.5 (face-api.js merekomendasikan ≤ 0.6)

Server tidak ikut verifikasi liveness — itu murni client-side. Risiko: attacker bypass FE dan langsung POST descriptor curian ke `/auth/face/login`. Mitigasi: rate-limit endpoint face login per noHp + IP, tambah signed liveness token dari client yang server validate.

### TODO sebelum production (tinggi-risiko)

- [ ] **Server-side liveness gate** — issue signed nonce di start challenge, klien sertakan saat submit. Server validate signature.
- [ ] **Anti-spoofing dedicated** — AWS Rekognition Liveness atau Azure Face untuk mitigasi deepfake/3D mask
- [ ] **Re-enrollment policy** — paksa user update descriptor setiap N bulan
- [ ] **Multi-angle enrollment** — capture wajah dari beberapa sudut untuk robustness

---

## 10. Konvensi Kode

### Bahasa naming

- **Database column / Prisma field**: `snake_case` di DB, `camelCase` di Prisma model (mapping via `@map`)
- **API JSON keys**: `camelCase`
- **File names**: `kebab-case.ts`
- **TypeScript identifiers**: `camelCase` (variable), `PascalCase` (type/interface/class)
- **Domain bahasa Indonesia**: nama tabel dan field domain pakai Indonesia (`jemaat`, `cabang_gereja`, `tanggal_lahir`) supaya konsisten dengan vocabulary tim.

### Error handling

Gunakan `ApiError` classes di `apps/core-api/src/lib/errors.ts`:
- `BadRequest(msg, details)` — 400
- `Unauthorized(msg)` — 401
- `Forbidden(msg)` — 403
- `NotFound(msg)` — 404
- `Conflict(msg, details)` — 409 (mis. unique constraint)
- `TooManyRequests(msg)` — 429

Semua di-throw, ditangani sentral oleh `errorHandler` middleware. Zod errors di-format otomatis.

### Validation

Selalu pakai Zod schema dari `@ecc/shared-types` di setiap endpoint:

```ts
const input = createJemaatSchema.parse(req.body); // throws ZodError → 400 by handler
```

Untuk form di FE, pakai `@hookform/resolvers/zod`:

```ts
const form = useForm({ resolver: zodResolver(createJemaatSchema) });
```

### Database transactions

Untuk operasi multi-tabel (mis. create jemaat + assign role pertama), bungkus dengan `prisma.$transaction`:

```ts
await prisma.$transaction(async (tx) => {
  const jemaat = await tx.jemaat.create({ data: jemaatInput });
  await tx.jemaatRole.create({ data: { jemaatId: jemaat.id, ... } });
});
```

---

## 11. Deployment Plan

### Production environment

Saat siap deploy, target setup:

- **Database**: Managed PostgreSQL (Supabase / Neon / RDS) dengan automated backup
- **Redis**: Upstash atau Redis Cloud
- **Core API**: Container di Fly.io / Railway / VPS, di belakang Cloudflare/Caddy untuk TLS
- **Portal**: Vercel atau self-host Next.js dengan PM2/Docker
- **DNS**:
  - `portal.eccchurch.global` → portal
  - `core-api.eccchurch.global` → core-api
- **Secrets**: Disimpan di provider secrets manager, **jangan** di `.env` server.

### CI/CD (TODO)

Belum di-setup di scaffolding ini. Rekomendasi: GitHub Actions dengan workflow:
1. PR → run `pnpm lint`, `pnpm type-check`, `pnpm test`
2. Merge ke `main` → build Docker images, push ke registry, deploy via webhook

---

## 12. Roadmap Implementasi

### Milestone 1 — Scaffolding ✅ (saat ini)

- [x] Monorepo structure (Turborepo + pnpm)
- [x] Prisma schema 15 tabel
- [x] Shared Zod schemas
- [x] Auth helpers (JWT, OTP, face match, WhatsApp client)
- [x] Core API skeleton dengan CRUD endpoints
- [x] Portal Next.js dengan login flow & sidebar layout
- [x] Docker Compose dev environment
- [x] Seed data master global
- [x] Foto profil upload (multer + sharp, simpan ke VPS filesystem)

### Milestone 2 — Functional MVP (in progress)

- [x] Tabel CRUD UI generic (factory pattern) — wired ke 6 master sederhana + role tree custom
- [x] OpenAPI spec di-generate otomatis dari Zod (via `@asteasolutions/zod-to-openapi`)
- [x] Refresh token endpoint + rotation + reuse detection + concurrent-safe auto-refresh interceptor
- [x] Face enrollment endpoint + webcam capture UI di profile page + login shortcut
- [x] Liveness detection (blink + head turn random challenges) — client-side, integrated default ON di FaceCapture
- [x] Audit log: tabel + helper fire-and-forget + endpoint dengan filter + UI viewer dengan JSON diff drawer

### Milestone 2 — DONE ✅

Semua item Milestone 2 selesai. Platform sekarang functional MVP:
fulltimer bisa login (OTP/Face), kelola semua master data via CRUD UI,
ada audit trail lengkap. API ter-dokumentasi otomatis di Swagger.

### Milestone 3 — Polish & Scale (next)

#### CRUD Factory — Cara Pakai

Generic factory di `apps/portal/src/components/crud/`:

```tsx
// 1. Define resource config (schema + columns + fields)
export const sinodeResource: ResourceConfig<Sinode> = {
  name: 'sinode',
  endpoint: '/admin/sinode',
  columns: [
    { key: 'kode', label: 'Kode', width: '100px' },
    { key: 'nama', label: 'Nama' },
    { key: 'isActive', label: 'Status', render: statusBadge },
  ],
  fields: [
    { name: 'nama', label: 'Nama Sinode', type: 'text', required: true },
    { name: 'kode', label: 'Kode', type: 'text', required: true },
  ],
  createSchema: createSinodeSchema,
  updateSchema: updateSinodeSchema,
};

// 2. Page tinggal mount CrudPage
export default function SinodePage() {
  return <CrudPage config={sinodeResource} />;
}
```

Field types yang didukung: `text | email | tel | number | url | textarea | date | time | select | switch | relation`. Untuk `relation`, factory auto-fetch options dari endpoint terkait dan render sebagai dropdown dengan formatLabel custom.

Untuk resource yang struktur-nya tidak fit dengan tabel flat (mis. `role` yang 3-level tree), buat halaman custom (lihat `dashboard/role/page.tsx` sebagai referensi).

#### Virtual Scroll Mode

Untuk resource yang punya volume tinggi (1000+ rows), aktifkan `virtualScroll: true` di config:

```tsx
export const jemaatResource: ResourceConfig<Jemaat> = {
  // ...
  virtualScroll: true,
  virtualChunkSize: 50,          // fetch 50 row per chunk
  virtualHeight: '70vh',
};
```

Implementasi:
- `useInfiniteList` hook pakai `useInfiniteQuery` dari react-query — fetch progressive
- `VirtualDataTable` pakai `@tanstack/react-virtual` untuk windowing (render hanya row di viewport)
- Auto-fetch next page saat user scroll ke akhir (detected via virtual loader row)
- Search/filter berubah → query baru, semua page reset

Default tetap pagination klasik. Switch ke virtual scroll hanya saat memang butuh — pagination lebih bagus untuk browse manual (user bisa langsung loncat ke halaman tertentu).

- [x] Rate limiting per IP & per user (express-rate-limit dengan kategori per endpoint)
- [x] Virtual scroll untuk tabel besar (10k+ jemaat) — `@tanstack/react-virtual` + `useInfiniteQuery`, opt-in via `virtualScroll: true` di ResourceConfig
- [x] Bulk import jemaat via CSV upload (dry-run preview + commit transactional)
- [ ] Foto jemaat upload ke S3-compatible storage
- [ ] Notifikasi: integrasi balik ke WhatsApp untuk reminder ibadah
- [ ] Multi-language (en) untuk portal
- [ ] CI/CD pipeline + staging environment
- [ ] Audit log retention cron (purge >365 hari)
- [ ] Liveness server-side gate dengan signed nonce

---

## 13. Decision Log (Penting untuk Maintainer Masa Depan)

| Tanggal     | Keputusan                                                                 | Alasan                                                              |
|-------------|---------------------------------------------------------------------------|---------------------------------------------------------------------|
| 2026-05-14  | Multi-tenant sinode tapi **tanpa data isolation**                          | Semua sinode masih satu naungan ECC; akses fulltimer cross-sinode OK |
| 2026-05-14  | Role/SubRole/Status & kategori master **global**                           | Konsistensi struktur; hindari duplikasi data per-sinode             |
| 2026-05-14  | Riwayat penugasan role disimpan (tgl_mulai/selesai)                        | Bisa track perjalanan pelayanan jemaat                              |
| 2026-05-14  | Jemaat–jemaat relasi **satu arah**, hard-delete                            | Lebih bersih; logika dua-arah di app layer kalau perlu              |
| 2026-05-14  | Ibadah only (event terpisah, di luar scope)                                | Avoid scope creep; event = modul masa depan                         |
| 2026-05-14  | Auth via **WA OTP primary** + face opsional                                | UX mudah untuk jemaat awam; face hanya shortcut bagi yang enroll    |
| 2026-05-14  | Auth universal (bukan hanya fulltimer)                                     | Sistem auth akan dipakai aplikasi konsumen lain juga                |
| 2026-05-14  | Stack: Next.js + Express + Prisma + PostgreSQL                             | Mature, well-documented, banyak talent pool                         |
| 2026-05-14  | Monorepo dengan Turborepo + pnpm                                           | Sharing Zod schemas FE↔BE; satu source of truth                     |
| 2026-05-14  | Foto profil di **VPS filesystem** (bukan S3)                               | MVP simpel, no vendor lock-in; migrasi ke object storage saat scale |
| 2026-05-14  | `user.fotoUrl` & `jemaat.fotoUrl` terpisah                                 | Avatar login bisa berbeda dari foto resmi jemaat                    |
| 2026-05-16  | Refresh token: **SHA256 hash**, bukan bcrypt                               | Butuh O(1) lookup; token sudah random panjang (bukan password)      |
| 2026-05-16  | **Token rotation** + reuse detection                                       | Standard OAuth 2.0 BCP — kalau revoked token dipakai, semua sesi user di-logout |
| 2026-05-16  | Liveness: **client-side blink + head turn**, bukan service eksternal       | MVP simpel, gratis, tidak vendor lock-in. Cukup mitigasi serangan foto statis. Service eksternal jadi opsi nanti |
| 2026-05-16  | Liveness default **ON** untuk semua FaceCapture                            | Default secure: lebih baik UX sedikit lebih lambat daripada akun kebobolan |
| 2026-05-16  | Audit log: **fire-and-forget**, tidak block request                        | Latency utama tidak terpengaruh; audit failure non-fatal (di-log warn) |
| 2026-05-16  | Audit: **denormalisasi** userName + resourceLabel                          | Log tetap readable kalau user/entity nanti dihapus                  |
| 2026-05-16  | Audit: **sanitize** field sensitif sebelum simpan                          | Cegah PII (face descriptor, token hash, password hash) bocor di log |
| 2026-05-16  | Rate limit: **per-kategori** (otp/auth/admin/upload/public-api), bukan single global | Aktivitas legit di /admin tidak boleh kena limit OTP yang ketat |
| 2026-05-16  | CSV import: **dry-run + commit** terpisah, bukan single-step                | User lihat preview & error sebelum data nempel — cegah corrupted bulk insert |
| 2026-05-16  | CSV commit: `skipErrors=true` default                                       | Row valid tetap masuk, error di-laporkan — UX lebih helpful dari all-or-nothing |
| 2026-05-16  | Virtual scroll **opt-in**, bukan default semua resource                    | Pagination klasik lebih bagus untuk browse manual; virtual scroll hanya untuk dataset besar (jemaat) |
| 2026-05-16  | Server endpoint **tidak berubah** untuk virtual scroll                     | Reuse pagination existing — FE tinggal fetch progressive page 1, 2, 3... |
| 2026-05-17  | WhatsApp gateway: **Fonnte** (lokal Indonesia), bukan Meta Cloud API       | Setup cepat tanpa template approval, harga murah untuk volume rendah, API simpel |
| 2026-05-17  | Setup dev: **Homebrew Postgres lokal**, bukan Docker                       | Lebih cepat, tidak butuh Docker Desktop, postgres jadi service Mac yang auto-start |
| 2026-05-17  | `dotenv-cli` di setiap workspace script                                    | Monorepo pkg punya cwd masing-masing; load `.env` dari root supaya single source |
| 2026-05-17  | `bcryptjs` (pure JS), bukan `bcrypt` (native)                              | Hindari node-gyp fail di Mac M-series; performance OK untuk volume kita |
| 2026-05-17  | `express-async-errors` di Express 4                                        | Express 4 tidak auto-forward async throws ke errorHandler — request hang tanpa ini |
| 2026-05-18  | **Pelayanan** cluster terpisah dari role/sub_role                          | Semantik beda: role = klasifikasi keanggotaan; pelayanan = struktur tim ministry operasional yang serve di ibadah |
| 2026-05-18  | Pelayanan **global** (bukan per-cabang)                                    | Konsisten + sederhana. Jemaat join langsung ke pelayanan global, tidak perlu duplikasi master per-cabang |
| 2026-05-18  | PelayananRole **per-pelayanan** dengan `level` integer                     | Multimedia butuh "Sound Engineer", Worship butuh "Vocalist" — bukan generic Leader/Member. Level untuk hierarki + display |
| 2026-05-18  | Pelayanan ↔ Ibadah **many-to-many** via junction `ibadah_pelayanan`        | 1 pelayanan bisa serve di banyak ibadah, 1 ibadah dilayani banyak pelayanan. Tidak modelkan jadwal rotasi (out-of-scope MVP) |
| 2026-05-18  | "Volunteer" lama di role/sub_role di-**hapus** + auto-cleanup di seed      | Pindah ke Pelayanan cluster. Seed.ts auto-delete legacy "Volunteer" role kalau masih ada (CASCADE bersihkan sub_roles + jemaat_role) |
| 2026-05-18  | Sidebar dikelompok jadi 4 grup dengan label header                          | Entity / Service / People / Developer Tools. Lebih mudah scan saat jumlah menu bertumbuh; konsisten dengan terminologi domain |
| 2026-05-18  | Detail page untuk Jemaat & Ibadah (bukan modal/drawer)                     | URL routable (`/jemaat/[id]`, `/ibadah/[id]`) — bisa di-bookmark/share. Detail page punya space untuk multi-section (pelayanan, riwayat, dll.) |
| 2026-05-18  | Klik nama di tabel = navigasi ke detail; tombol pencil = edit cepat        | Dua entry-point berbeda use case: detail untuk explore lengkap, pencil untuk update cepat field utama |
| 2026-05-18  | **`ibadah_pelayanan_petugas`** sebagai 3-way junction terpisah              | Cleaner dari modal-only flow — petugas adalah entity dengan role spesifik per ibadah-pelayanan, perlu identitas (id) untuk delete/update |
| 2026-05-18  | Petugas assignment **persistent** untuk semua occurrence ibadah recurring  | Default sederhana. Per-date roster/rotation = future scope dengan tabel attendance terpisah |
| 2026-05-18  | Validasi `pelayananRoleId` belong ke pelayanan dari `ibadahPelayananId`    | Cegah Multimedia role di-assign ke pelayanan Worship. Validasi di backend (BadRequest 400) |
| 2026-05-18  | ~~Add Petugas UI = search jemaat by nama/noHp~~ **Direvisi 2026-05-18**       | Diganti dengan checkbox-list member pelayanan (lihat row di bawah) |
| 2026-05-18  | Add Petugas: **checkbox-list member pelayanan** (bukan free-form search jemaat) | Enforce konsistensi — petugas ibadah-pelayanan harus dari member pelayanan tsb. Kalau jemaat belum jadi member, tambah dulu via halaman detail jemaat. Default role auto-fill dari JemaatPelayanan, bisa override. Submit batch via Promise.allSettled. |
| 2026-05-18  | Edit PelayananRole inline di /pelayanan (modal saat klik nama role)         | Hapus standalone `/pelayanan-role` page yang redundant. Edit langsung di tempat role muncul lebih intuitif daripada navigasi ke halaman flat. |
| 2026-05-18  | Page `/pelayanan-role` auto-redirect ke `/pelayanan`                         | Backward compat untuk bookmark/link lama. Backend endpoint flat tetap ada untuk konsumer OpenAPI. |
| 2026-05-18  | Sinode/Cabang list endpoint return **flattened counts** (cabangCount, jemaatCount, ibadahCount) | Hindari N+1 di FE. Nested include + reduce di backend → satu query untuk semua angka |
| 2026-05-18  | Jemaat list include **active roles** + filter `?cabangId` / `?sinodeId`     | Mendukung navigasi clickable dari sinode/cabang ke jemaat terfilter. Roles ringkas di tabel (max 2 chip + counter) |
| 2026-05-18  | Ibadah page **dikelompokkan per kategori** (custom layout, bukan CrudPage)  | Tabel flat sulit di-scan saat banyak ibadah; grouping = struktur natural domain. Kolom Pelayan = `<petugasCount>/<pelayananCount>` dengan link ke detail |
| 2026-05-18  | CrudPage support `extraParams` + `filterBanner` props                       | Generic factory tetap dipakai untuk konsistensi; URL param dibaca di wrapper page, lalu di-pass ke list endpoint |
| 2026-05-18  | Relasi keluarga = **modal read-only** dari row jemaat                        | Quick peek tanpa pindah halaman. Klik nama jemaat dalam modal navigasi ke detail; tombol "Buka detail lengkap" untuk CRUD relasi (future scope) |
| 2026-05-18  | **`emptyToUndefined()` helper universal** di common.ts                       | HTML `<input>` submit `""` saat kosong; Zod `.email()/.url()/.date().optional()` reject `""`. Preprocess `''→undefined` di setiap optional field dengan format validation cegah bug edit form di SEMUA resource |
| 2026-05-18  | Update schemas **eksplisit** (bukan `.partial()` lagi)                       | `.partial()` inherit field declaration tapi tidak preprocessing. Eksplisit lebih jelas + reliably handle empty string |
| 2026-05-18  | Reservasi: track `tanggal_ibadah` spesifik (bukan `ibadah_id` saja)          | Ibadah recurring (mingguan), perlu tahu reservasi untuk occurrence tanggal mana. Unique constraint `(jemaat, ibadah, tanggal)` cegah double-reserve |
| 2026-05-18  | Kode reservasi: **alphanumeric 8 char** uppercase, generated di server       | 32⁸ = ~1T kombinasi, human-readable (skip ambigu I/O/1/0), gampang di-print sebagai barcode. Generate + unique check di backend, bukan UUID karena UUID terlalu panjang utk QR mobile |
| 2026-05-18  | Mobile app **terpisah** dengan API key auth (bukan JWT user)                 | Mobile scanner = stationary device per cabang, satu device satu API key. Tidak perlu login user; cukup scan kode → POST. Audit log catat `apiKeyId` |
| 2026-05-18  | Tambah `ONCE` ke `TipeJadwal` (bukan modul Event terpisah)                  | Ibadah satu kali (KKR, Natal khusus) cukup ditangani sebagai ibadah non-recurring. Hindari duplikasi cluster Event di awal — kalau nanti butuh field event-spesifik (kapasitas, biaya, registrasi terbuka), bisa di-promote ke modul terpisah |
| 2026-05-18  | Calendar view = **occurrences di-generate server-side per request**         | Tidak materialize semua occurrence ke DB (akan bloat). Generate on-demand per range tanggal yang user lihat. Limit 366 hari per request. Sorting + grouping di FE |
| 2026-05-18  | MONTHLY occurrence pakai **day-of-month dari `tanggal_mulai`**, skip kalau invalid | Mis. tanggalMulai 31 Jan → Feb tidak punya 31, skip. Tidak roll ke 1 Mar (avoid confusion). Untuk first-of-month pattern, user set tanggalMulai = tanggal 1 di bulan apa pun |

---

## 14. Brand Guidelines

- **Primary**: `#F97316` (brand-500, orange "30")
- **Accent**: `#FBBF24` (yellow curly script)
- **Neutral text**: `#0A0A0A`
- **Background**: `#FAFAFA`
- **IDEA mark**: `#0046FF` (footer/watermark)

Logo files: `images/logo-ecc.webp` (utama) dan `images/logo-idea.webp` (Powered By).
Aturan: logo ECC selalu lebih dominan; logo IDEA hanya di footer atau pojok dengan opacity 60%.

---

## 15. Kontak & Kepemilikan

- **Owner**: ECC (**Elshaddai Creative Community**)
- **Vendor / Maintainer**: IDEA (https://ide.asia)
- **Repo**: `git@github.com:arichrst92/ecc-core-platform.git`

Setup git pertama kali:

```bash
cd "ECC Core Platform"
git init -b main
git remote add origin git@github.com:arichrst92/ecc-core-platform.git
git add .
git commit -m "feat: initial scaffolding — monorepo, prisma schema, core-api, portal"
git push -u origin main
```

Untuk pertanyaan teknis, mulai dari section di dokumen ini yang relevan; jika belum terjawab, hubungi tim IDEA.

---

## 16. File Storage — Foto Profil

Foto profil **disimpan di VPS filesystem** (bukan S3/CDN eksternal) untuk MVP.

### Layout direktori

```
{UPLOADS_DIR}/
└── profiles/
    ├── jemaat/
    │   ├── {jemaat-uuid}.webp
    │   └── ...
    └── user/
        ├── {user-uuid}.webp
        └── ...
```

- **Dev**: `apps/core-api/uploads/` (relatif terhadap working dir core-api)
- **Production**: `/var/lib/ecc/uploads` (atau path persisten lain di VPS). Set di `.env` via `UPLOADS_DIR`.

### Pipeline upload

1. Client kirim `multipart/form-data` ke `POST /upload/jemaat/:id/foto` atau `POST /upload/user/me/foto`, field name `foto`.
2. Middleware `multer` parse ke `Buffer` di memory (memory storage, bukan disk temp). Max 5 MB, allowed MIME: `image/jpeg | png | webp`.
3. `sharp` auto-orient (EXIF rotation), resize ke max 1024×1024 `inside` fit (tidak distorsi), convert ke WebP quality 82.
4. Disimpan ke `{UPLOADS_DIR}/profiles/{kind}/{owner-uuid}.webp` (overwrite jika sudah ada).
5. DB field `fotoUrl` di-update ke relative path: `/uploads/profiles/jemaat/{uuid}.webp?v={timestamp}` (cache-busting via query param).

### Otorisasi

- `POST /upload/jemaat/:id/foto` — hanya **Fulltimer** boleh upload foto jemaat lain.
- `POST /upload/user/me/foto` — siapa pun user yang login boleh upload **avatar diri sendiri**.
- Perbedaan semantik: `jemaat.fotoUrl` = foto resmi (kartu jemaat, direktori), `user.fotoUrl` = avatar login (boleh berbeda dari foto resmi). Auth response prefer `user.fotoUrl`, fallback ke `jemaat.fotoUrl`.

### Serving

Express static middleware mount di `/uploads` → `UPLOADS_DIR`. Cache `max-age=7d`.

**Untuk production**, sangat disarankan reverse-proxy (Nginx/Caddy) langsung serve folder ini tanpa lewat Node:

```nginx
location /uploads/ {
    alias /var/lib/ecc/uploads/;
    expires 7d;
    add_header Cache-Control "public, immutable";
}
```

Ini offload bandwidth dari Node dan memberi performa file serving native kernel.

### Backup

Karena foto bukan di S3, backup wajib di-handle manual:
- Rsync folder `{UPLOADS_DIR}` ke storage cadangan harian
- Atau symlink folder ke volume terpisah yang masuk schedule backup VPS provider

### Migration ke object storage (jika nanti perlu)

Saat skala bertumbuh (>10k jemaat dengan foto, >50 GB total), pertimbangkan migrasi ke S3-compatible (MinIO self-hosted atau Cloudflare R2). Path di DB sudah relative, jadi cukup ganti base URL serving + tulis script migrasi `rsync` ke object storage. Endpoint upload juga di-refactor pakai SDK S3 menggantikan filesystem write.

---

## 17. Audit Log

Setiap operasi penting dicatat ke tabel `audit_log` untuk keperluan compliance dan investigasi insiden.

### Apa yang di-log

| Action | Resource yang dicakup |
|--------|----------------------|
| `CREATE` / `UPDATE` / `DELETE` | Semua master data: sinode, cabang, jemaat, role, sub_role, sub_role_status, jemaat_role, ibadah, kategori_ibadah, tipe_relasi_keluarga, jemaat_relasi |
| `LOGIN`                        | Setiap login sukses (OTP atau Face) — metadata berisi method |
| `LOGOUT`                       | Logout single atau all-sessions — metadata berisi flag |
| `ENROLL_FACE` / `RESET_FACE`   | Saat user enroll atau hapus descriptor wajahnya |
| `UPLOAD_PHOTO`                 | Upload/hapus foto jemaat atau avatar user |

Read operations **tidak** di-log (volume terlalu besar untuk MVP). Tambah selektif nanti kalau perlu compliance read-tracking.

### Strategi implementasi

Helper `audit(req, {...})` di `apps/core-api/src/lib/audit.ts` — **fire-and-forget**: insert ke DB tidak di-`await`, sehingga tidak menambah latency request. Error di-catch dan di-log warn (non-fatal), supaya kegagalan audit log tidak menggagalkan operasi utama.

Field penting:
- `userId` + `userName` (denormalized) — tetap readable kalau user nanti dihapus
- `resource` + `resourceId` + `resourceLabel` — same, denormalized untuk display
- `before` + `after` (JSON) — full snapshot untuk diff. Field sensitif (`password`, `kodeHash`, `faceDescriptor`, `tokenHash`, `keyHash`) otomatis di-redact via fungsi `sanitize()`
- `metadata` — flexible JSON untuk konteks tambahan (mis. method login, ukuran file upload)
- `ipAddress` + `userAgent` — untuk investigasi forensik

### Endpoint

| Path | Method | Deskripsi |
|------|--------|-----------|
| `/admin/audit-log` | GET | List dengan filter: `action`, `resource`, `userId`, `from`, `to`, `search` |
| `/admin/audit-log/:id` | GET | Detail entry single |
| `/admin/audit-log/resource/:resource/:resourceId` | GET | Timeline untuk 1 entity (mis. semua perubahan ke jemaat tertentu) |
| `/admin/audit-log/stats/summary` | GET | Quick stats — groupBy action + resource untuk 30 hari terakhir |

### UI

Halaman `/dashboard/audit-log` di portal:
- Tabel timeline dengan kolom Waktu, User (foto + nama), Action (color-coded badge), Resource, Target
- Filter bar: search, action dropdown, resource dropdown, date range
- Klik row → drawer slide-in dari kanan dengan detail full (before/after JSON, metadata, IP/UA)
- Pagination 25 row per page

### Retention

Tidak ada auto-purge by default. Untuk production rekomendasikan cron harian:

```sql
DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '365 days';
```

Atau partition by month untuk performa kalau volume tinggi.

### Sensitif data — yang di-redact

Sebelum disimpan ke `before` / `after`, field-field ini diganti dengan `[REDACTED]`: `password`, `passwordHash`, `kodeHash`, `faceDescriptor`, `tokenHash`, `keyHash`, `accessToken`, `refreshToken` (+ snake_case variants). Tambah ke `SENSITIVE_KEYS` di `lib/audit.ts` kalau ada PII baru.

---

## 18. Rate Limiting

Pakai `express-rate-limit` dengan limit berbeda per kategori endpoint. Default in-memory store; untuk multi-instance ganti ke Redis store via `rate-limit-redis` (snippet di `middleware/rate-limit.ts`).

### Limit per kategori

| Limiter | Endpoint | Window | Limit | Key |
|---------|----------|--------|-------|-----|
| `otp-request` | `POST /auth/otp/request` | 15 menit | 5 | per IP |
| `auth-verify` | `POST /auth/otp/verify`, `POST /auth/face/login` | 15 menit | 10 | per IP |
| `refresh` | `POST /auth/refresh` | 5 menit | 30 | per IP |
| `admin` | `/admin/*` | 1 menit | 300 | per user (fallback IP) |
| `upload` | `/upload/*` | 1 menit | 20 | per user (resource-heavy karena sharp) |
| `public-api` | `/api/v1/*` | 1 menit | 120 | per API key |
| `global` | catch-all | 1 menit | 200 | per IP |

Response headers `RateLimit-*` (draft-7) dikirim otomatis supaya client tahu sisa quota.

### Response 429

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Terlalu banyak permintaan. Coba lagi nanti.",
    "details": { "limiter": "otp-request" }
  }
}
```

### Tuning

Sesuaikan threshold di `apps/core-api/src/middleware/rate-limit.ts`. Kalau threshold terlalu ketat user akan kena 429 saat operasi normal — log Pino akan menunjukkan key yang sering kena 429 (filter `statusCode: 429`).

### Tidak menggantikan OTP cooldown

`otp-request` rate limiter operasi per-IP (cegah spam IP). `OTP_RESEND_COOLDOWN_SECONDS` (di `.env`) tetap aktif per-nomor HP (cegah satu user bombarding WhatsApp-nya sendiri). Keduanya berjalan paralel.

---

## 19. Bulk Import Jemaat (CSV)

Workflow registrasi awal saat onboarding cabang baru (mungkin 100+ jemaat). Endpoint di-design dengan **dry-run + commit** pattern supaya user lihat preview sebelum data nempel di DB.

### Format CSV

Header **wajib persis** (case-sensitive):

```csv
nama_lengkap,no_hp,email,jenis_kelamin,tanggal_lahir,alamat,kode_cabang,tanggal_bergabung
Budi Santoso,+628123456789,budi@example.com,L,1990-05-15,Jl. ABC No. 1,JKT,2024-01-15
Siti Aminah,08129876543,,P,1995-11-20,Jl. XYZ No. 2,BDG,
```

Catatan:
- `no_hp` boleh format apapun (08.../+62.../62...) — di-normalize ke E.164 otomatis
- `kode_cabang` di-lookup ke `cabang_gereja.kode` (di-uppercase saat lookup)
- `email`, `jenis_kelamin`, `tanggal_lahir`, `alamat`, `tanggal_bergabung` opsional (boleh kosong)
- Tanggal harus YYYY-MM-DD

### Endpoint

| Path | Method | Deskripsi |
|------|--------|-----------|
| `/admin/jemaat/import/template` | GET | Download CSV template dengan 2 baris contoh |
| `/admin/jemaat/import/preview` | POST multipart | Parse + validate + cek duplikat — return per-row report (tidak insert) |
| `/admin/jemaat/import/commit` | POST multipart `skipErrors` | Insert dalam transaction. `skipErrors=true` (default) = skip baris error & commit yang valid. |

### Validasi yang dilakukan

1. Header CSV lengkap
2. Per-row Zod validation (format, panjang, regex)
3. Cabang ada di DB (lookup `kode_cabang`)
4. `no_hp` tidak duplikat di DB existing
5. `email` tidak duplikat di DB existing

Per-row report berisi `errors: string[]` — di UI yang error di-highlight merah, dengan pesan inline.

### Atomicity

Commit dibungkus `prisma.$transaction()`. Kalau salah satu insert gagal (mis. constraint violation yang lolos validasi), seluruh batch rollback.

### Audit trail

1 entry audit log per batch import dengan metadata:
```json
{ "totalRows": 100, "insertedCount": 95, "errorCount": 5, "skipErrors": true }
```

Tidak per-row audit supaya log tidak meledak. Detail per-row tersedia dari response endpoint commit.

### UI

`/dashboard/jemaat/import`:
1. Download template (button di header)
2. Upload CSV (button center)
3. Auto-trigger preview → table dengan badge ✓ (hijau) / ⚠ (merah) per row, pesan error inline
4. Summary bar: Total / Valid / Error
5. "Commit X jemaat valid (skip Y error)" → confirm
6. Result page: stats final, link kembali ke daftar atau import lagi

Tombol "Import CSV" ada di top-right halaman `/dashboard/jemaat` (di atas tabel CRUD utama).

---

## 20. Kehadiran / Reservasi Ibadah

Workflow attendance dengan barcode untuk integrasi mobile scanner app.

### Model

Tabel `reservasi` (cluster 8 di section 4):
- `jemaat_id`, `ibadah_id`, `tanggal_ibadah` (track occurrence spesifik karena ibadah recurring)
- `status` enum: `RESERVE` / `JOIN` / `CANCEL`
- `kode` — 8 char alphanumeric uppercase (mis. `R7K2X9P`), unique, untuk barcode/QR
- `reserved_at`, `joined_at`, `cancelled_at` — timestamps perubahan status
- `checked_in_by` — userId yang scan (audit trail)
- Unique constraint: `(jemaat_id, ibadah_id, tanggal_ibadah)` — cegah double-reserve

### Generate kode

`apps/core-api/src/lib/kode-reservasi.ts`:
- Alphabet 32 char tanpa ambigu (skip `1`, `I`, `0`, `O`)
- Default 8 char → 32⁸ = ~1 triliun kombinasi
- `generateUniqueKode()` cek DB collision, retry sampai 5x

### Workflow

```
1. Admin/jemaat reservasi → POST /admin/reservasi
                          → status RESERVE, dapat kode `R7K2X9P`
                          → portal display QR code

2. Saat hadir di lokasi → mobile app scan QR
                       → POST /api/v1/reservasi/checkin (kode)
                       → status JOIN, joined_at = now

3. Kalau batal → mobile POST /api/v1/reservasi/cancel
              → status CANCEL, cancelled_at = now

   Atau admin manual → PATCH /admin/reservasi/:id/status
                    → bisa pindah ke status apa pun (Reserve juga, untuk reset)
```

### UI portal

`/dashboard/kehadiran`:
- Tabel daftar reservasi dengan filter (status, ibadah, tanggal, search nama/kode)
- Kolom Kode = button clickable → modal QR preview (pakai api.qrserver.com untuk render QR image)
- Action per row: tombol Join / Cancel / Reserve (quick status change) + hapus
- Tombol header: **Buat Reservasi** (modal pilih ibadah + tanggal + cari jemaat) dan **Check-in via Kode** (modal input kode → POST checkin)

### Mobile attendance app (terpisah)

Belum di-build di repo ini. Spec endpoint untuk mobile app:

```
Headers: X-API-Key: ecc_xxx_yyy

GET  /api/v1/reservasi/by-kode/:kode    → preview data (jemaat + ibadah)
POST /api/v1/reservasi/checkin          → body { kode }, set JOIN
POST /api/v1/reservasi/cancel           → body { kode }, set CANCEL
```

Sinode scoping otomatis: API key di-scope per sinode, kode reservasi dari ibadah sinode lain return 404 (sembunyikan keberadaannya).

### Audit trail

Setiap perubahan status di-log dengan metadata:
- `method: 'admin-scanner'` atau `'mobile-scan'` atau `'mobile-cancel'`
- `apiKeyId` untuk trace mobile request

---

*This document is the source of truth for ECC Core Platform architecture. Update whenever a major decision is made — append to Decision Log (section 13).*
