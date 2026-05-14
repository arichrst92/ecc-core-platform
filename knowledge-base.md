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

## 4. Model Data — 15 Tabel

> Catatan: ERD konseptual awal punya 13 tabel. Saat scaffolding, cluster Auth dipecah menjadi 4 tabel (`user`, `otp_verification`, `refresh_token`, `sinode_api_key`) untuk normalisasi yang lebih bersih, sehingga total Prisma model = 15.

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

### 5.3 Portal Access Gate

Portal hanya menampilkan dashboard jika `user.isFulltimer === true` (dicek di FE setelah login, dan re-validated di setiap `/admin/*` request via middleware `requireFulltimer`).

### 5.4 Konsumer API Eksternal

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
| `/admin/sinode`                         | GET/POST | Fulltimer | List/Create sinode                         |
| `/admin/sinode/:id`                     | GET/PATCH/DELETE | Fulltimer | Detail/Update/Delete                 |
| `/admin/cabang`                         | GET/POST | Fulltimer | List/Create cabang                         |
| `/admin/jemaat`                         | GET/POST | Fulltimer | List/Create jemaat                         |
| `/admin/role`                           | GET/POST | Fulltimer | List role hierarchy                        |
| `/admin/role/sub-role`                  | POST   | Fulltimer   | Create sub-role                            |
| `/admin/role/sub-role-status`           | POST   | Fulltimer   | Create status                              |
| `/admin/role/assign`                    | POST   | Fulltimer   | Assign role ke jemaat                      |
| `/admin/ibadah`                         | GET/POST | Fulltimer | List/Create ibadah                         |
| `/admin/ibadah/kategori`                | GET/POST | Fulltimer | Kategori ibadah                            |
| `/admin/keluarga/tipe`                  | GET/POST | Fulltimer | Tipe relasi master                         |
| `/admin/keluarga/relasi`                | POST/DELETE | Fulltimer | Assign relasi antar jemaat              |
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
- pnpm ≥ 9 (`npm install -g pnpm`)
- Docker Desktop (untuk PostgreSQL & Redis)
- Akun WhatsApp Cloud API (Meta) — lihat section 8

### Langkah

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env template
cp .env.example .env
# Edit .env, isi minimal: DATABASE_URL, JWT_SECRET, WA_CLOUD_API_TOKEN, WA_PHONE_NUMBER_ID

# 3. Start database
pnpm docker:up

# 4. Generate Prisma client + run migration + seed master data
pnpm db:generate
pnpm db:migrate
pnpm db:seed

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
INSERT INTO sinode (id, nama, kode) VALUES (gen_random_uuid(), 'Sinode ECC', 'ECC');
INSERT INTO cabang_gereja (id, sinode_id, nama, kode) VALUES (gen_random_uuid(), '<sinode-uuid>', 'ECC Jakarta', 'JKT');
INSERT INTO jemaat (id, cabang_id, nama_lengkap, no_hp) VALUES (gen_random_uuid(), '<cabang-uuid>', 'Admin Pertama', '+628123456789');
INSERT INTO jemaat_role (id, jemaat_id, role_id, sub_role_id, sub_role_status_id, is_active)
  SELECT gen_random_uuid(), '<jemaat-uuid>',
         r.id, sr.id, srs.id, true
  FROM role r JOIN sub_role sr ON sr.role_id = r.id JOIN sub_role_status srs ON srs.sub_role_id = sr.id
  WHERE r.nama = 'Fulltimer' AND sr.nama = 'Pastoral' AND srs.nama = 'Lead Pastor';
```

Setelah itu coba login di portal dengan nomor tersebut → OTP masuk ke WhatsApp → masuk ke dashboard.

---

## 8. WhatsApp Cloud API Setup

1. Daftar di https://developers.facebook.com/apps/, buat app dengan produk **WhatsApp**.
2. Catat:
   - **Phone Number ID** → `WA_PHONE_NUMBER_ID`
   - **Permanent access token** → `WA_CLOUD_API_TOKEN` (generate via System User, jangan pakai temporary 24-jam token untuk production)
3. Buat **Message Template** dengan:
   - **Name**: `ecc_login_otp`
   - **Category**: AUTHENTICATION
   - **Language**: Indonesian (id)
   - **Body**: `Kode OTP ECC Anda: {{1}}. Berlaku 5 menit.`
   - **Button**: Copy code (`{{1}}` ke-2)
4. Submit template untuk approval Meta (biasanya 1-24 jam).
5. Setelah approved, isi `WA_OTP_TEMPLATE_NAME=ecc_login_otp` di `.env`.

Test pengiriman: pakai endpoint `/auth/otp/request` dengan no HP yang sudah verified di WhatsApp Business.

---

## 9. Face Recognition (face-api.js)

### Model files

face-api.js butuh 4 model weights:
- `ssd_mobilenetv1_model-weights_manifest.json` (+ shards)
- `face_landmark_68_model-weights_manifest.json`
- `face_recognition_model-weights_manifest.json`
- `face_expression_model-weights_manifest.json` (opsional)

Download dari https://github.com/justadudewhohacks/face-api.js/tree/master/weights ke:
- **Client**: `apps/portal/public/face-models/`
- **Server**: `packages/auth/face-models/`

### Client-side enrollment flow

```ts
// Pseudo-code di apps/portal
const video = await navigator.mediaDevices.getUserMedia({ video: true });
const detection = await faceapi
  .detectSingleFace(video, new faceapi.SsdMobilenetv1Options())
  .withFaceLandmarks()
  .withFaceDescriptor();

// detection.descriptor: Float32Array(128)
const descriptor = Array.from(detection.descriptor);
await apiClient.post('/auth/face/enroll', { descriptor }); // protected by OTP
```

### Server-side verification

Lihat `packages/auth/src/face.ts`:
- `matchFace(candidate, stored)` → Euclidean distance < `FACE_MATCH_THRESHOLD`
- Default threshold 0.5 (face-api.js merekomendasikan ≤ 0.6)

### TODO sebelum production

- [ ] **Liveness detection** (blink, head turn) — descriptor saja vulnerable terhadap foto/video replay attack
- [ ] **Anti-spoofing** via cek brightness/depth atau pakai 3rd-party (mis. AWS Rekognition Liveness)
- [ ] **Re-enrollment policy** — paksa user update descriptor setiap N bulan

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

### Milestone 2 — Functional MVP (next)

- [ ] Implement face enrollment endpoint + UI capture flow di portal
- [ ] Tabel CRUD UI yang real (table + form modal generic) untuk semua master data
- [ ] OpenAPI spec di-generate otomatis dari Zod (via `zod-to-openapi`)
- [ ] Refresh token endpoint + auto-refresh interceptor di FE
- [ ] Liveness detection untuk face login
- [ ] Audit log table (siapa mengubah apa kapan)

### Milestone 3 — Polish & Scale

- [ ] Rate limiting per IP & per user
- [ ] Pagination + virtual scroll di tabel besar (10k+ jemaat)
- [ ] Bulk import jemaat via CSV upload
- [ ] Foto jemaat upload ke S3-compatible storage
- [ ] Notifikasi: integrasi balik ke WhatsApp untuk reminder ibadah
- [ ] Multi-language (en) untuk portal
- [ ] CI/CD pipeline + staging environment

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

*This document is the source of truth for ECC Core Platform architecture. Update whenever a major decision is made — append to Decision Log (section 13).*
