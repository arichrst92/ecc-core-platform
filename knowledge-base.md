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

## 4. Model Data — 16 Tabel

> Catatan: ERD konseptual awal punya 13 tabel. Saat scaffolding cluster Auth dipecah menjadi 4 tabel (`user`, `otp_verification`, `refresh_token`, `sinode_api_key`); Milestone 2 menambahkan `audit_log`. Total Prisma model sekarang = 16.

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
- **Volunteer** → Multimedia/Worship/Usher/Children Ministry (Leader/Member)
- **Fulltimer** → Pastoral (Lead/Associate/Children/Teens/Youth Pastor) + Administration (Head of Admin/Staff)

### 4.3 Cluster Ibadah

**`kategori_ibadah`** (global): Ibadah Umum, Ibadah Doa, Ibadah Pemuda, Ibadah Anak, Komsel, Persekutuan Kategorial.

**`ibadah`** (per cabang):
- `cabang_id, kategori_ibadah_id, nama`
- `tipe_jadwal` enum: `WEEKLY | BIWEEKLY | MONTHLY`
- `tanggal_mulai` (kapan ibadah ini pertama kali diadakan)
- `hari` (Minggu/Senin/dst, wajib untuk weekly/biweekly)
- `jam_mulai, jam_selesai` (string HH:mm)
- `lokasi`, `is_online` (boolean), `link_stream` (nullable, wajib jika online)
- `deskripsi, is_active`

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
- Portal: http://localhost:3000
- Core API: http://localhost:4000
- API Docs: http://localhost:4000/docs
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

*This document is the source of truth for ECC Core Platform architecture. Update whenever a major decision is made — append to Decision Log (section 13).*
