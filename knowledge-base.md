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

## 4. Model Data — 47 Tabel

> **Catatan evolusi**: ERD konseptual awal punya 13 tabel. Saat scaffolding cluster Auth dipecah menjadi 4 tabel (`user`, `otp_verification`, `refresh_token`, `sinode_api_key`); M2 menambahkan `audit_log`; M3 menambahkan cluster Pelayanan, lalu Community (homecell), Event (event + participation + donation + pelayanan + petugas), RBAC menu access, branch change, family relation, Movement (Visit + LocalBusiness), App Settings (LegalDocument + AppVersion), Notification log, ibadah occurrence override, MaintenanceMode singleton, Credential vault, dan Diagnostics cluster (AppConfig singleton + FaceTelemetryEvent + DiagnosticsErrorEvent). Total Prisma model sekarang = **47**.

**Daftar cluster (10 cluster):**

| # | Cluster | Tabel utama |
|---|---|---|
| 1 | **Organisasi** | sinode, cabang_gereja, cabang_rekening, jemaat |
| 2 | **Klasifikasi Peran** | role, sub_role, sub_role_status, jemaat_role |
| 3 | **Ibadah** | kategori_ibadah, ibadah, ibadah_occurrence_status |
| 4 | **Relasi Keluarga** | tipe_relasi_keluarga, jemaat_relasi, family_relation |
| 5 | **Auth & API** | user, otp_verification, refresh_token, sinode_api_key |
| 6 | **Audit** | audit_log |
| 7 | **Pelayanan (Ministry)** | pelayanan, pelayanan_role, jemaat_pelayanan, ibadah_pelayanan, ibadah_pelayanan_petugas, reservasi |
| 8 | **Konten Broadcast** | konten (News + Renungan, tipe enum) |
| 9 | **Community** | homecell_area, homecell, homecell_member |
| 10 | **Event (Movement)** | event, event_participation, event_donation, event_pelayanan, event_pelayanan_petugas |
| 11 | **Movement** | visit, local_business |
| 12 | **App Settings** | legal_document, app_version |
| 13 | **Operasional** | notification_log, branch_change_request, role_menu_access, sub_role_menu_access |

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
- `tanggal_ibadah` (nullable DATE) — **NULL = petugas default tiap minggu; isi = override khusus tanggal itu.**
- Resolve untuk tanggal X (snapshot semantics): kalau ada row dengan `tanggal_ibadah=X` → pakai SEMUA override itu; kalau tidak ada → fallback ke set default (NULL).
- Contoh: Ibadah Pemuda → Multimedia → default Jason (Camera Operator) + Rahmat (Sound Engineer); override 25 Des → Andi (Camera Operator).
- Unique composite `(ibadah_pelayanan_id, jemaat_id, tanggal_ibadah)` + partial unique `(ibadah_pelayanan_id, jemaat_id) WHERE tanggal_ibadah IS NULL` untuk row default (satu jemaat hanya 1 row default per link).
- `can_scan_attendance` (boolean, default false) — flag wewenang scan QR kode jemaat untuk check-in kehadiran (lihat section 20). **Permissive**: jemaat yang punya minimal 1 row petugas dengan flag=true di ibadah tsb → boleh scan tanpa peduli tanggal row-nya.
- Validasi backend: `pelayanan_role_id` harus belong ke pelayanan dari `ibadah_pelayanan_id`.
- CASCADE delete saat ibadah/pelayanan/link dihapus. Override = snapshot (tidak ikut berubah saat template `ibadah_pelayanan` ditambah/dihapus pelayanan).

**`ibadah_occurrence_status`** (sparse exception list untuk recurring):
- `ibadah_id, tanggal_ibadah, status, catatan, created_by` — saat ini status hanya `CANCELLED`.
- Unique `(ibadah_id, tanggal_ibadah)`. Row hanya dibuat saat occurrence di-cancel; default tidak ada row.
- Calendar endpoint skip occurrence yang `CANCELLED`.
- Side effect saat cancel: semua reservasi `RESERVE`/`JOIN` pada `(ibadah_id, tanggal)` auto-set ke `CANCEL` dengan catatan alasan (transaksional). Sistem notifikasi belum ada — admin perlu announce manual.
- Use case: ibadah Minggu Pagi bertepatan dengan Natal → tiadakan minggu itu, ibadah Natal khusus dibuat sebagai `Ibadah` baru tipe `ONCE`.

UI portal:
- `/dashboard/pelayanan` — kartu per pelayanan dengan role chips (level dilambangkan warna: emas=Leader, oranye=Co-Leader, biru=Member, abu=Trainee). Add inline untuk pelayanan baru + role baru per pelayanan. **Klik nama role di chip** untuk edit (nama, level, deskripsi).
- `/dashboard/jemaat/[id]` — detail jemaat dengan section Pelayanan + section Role (active + history), modal Tambah Penugasan / Tambah Role, tombol "Akhiri" (set tanggalSelesai) + hapus permanent. Edit Profile membuka FormModal in-page (PATCH `/admin/jemaat/:id`).
- `/dashboard/ibadah/[id]` — detail ibadah dengan section "Pelayanan yang Melayani". Tiap pelayanan link expandable → list petugas dipisah section **Petugas Default** vs **Override · {tanggal}** (badge jumlah di header). Modal Tambah Petugas punya toggle Default vs Khusus tanggal + date picker. Section terpisah **Tanggal Ditiadakan** untuk restore occurrence yang sebelumnya di-cancel.

Sidebar dikelompokkan jadi 8 grup dengan label header **collapsible** (state persistent di `localStorage.ecc-portal-sidebar-collapsed-groups`):
- **Entity** — Sinode, Cabang Gereja
- **Service** — Ibadah, Kategori Ibadah, Pelayanan (role di-edit inline di sini), Kehadiran
- **People** — Jemaat, Role Jemaat, Relasi Jemaat
- **Community** — Homecell Area, Homecell
- **Movement** — Event, Visit, Local Market
- **Broadcast** — News, Renungan
- **App Settings** — Legal Docs, App Versions
- **Developer Tools** — Role Access, API Keys, Audit Log, Maintenance, Server Health

Plus Dashboard di atas grup dan Profil & Keamanan di bawah (separator). Page lama `/dashboard/pelayanan-role` di-deprecate (auto-redirect ke `/pelayanan`).

Highlight rule: active link match exact-or-prefix dengan trailing `/` untuk menghindari tabrakan (mis. `/dashboard/homecell-area` tidak ikut highlight `/dashboard/homecell`).

### 4.7 Cluster Konten Broadcast

**`konten`** — single table untuk News + Renungan dengan `tipe` enum (`NEWS | RENUNGAN`). Field utama: `judul, slug (unique global), ringkasan, body (markdown), hero_image_url, tipe, sinode_id (nullable), cabang_id (nullable), tanggal_publikasi, ayat_alkitab (renungan-spesifik), view_count, is_published`. Audience targeting via kombinasi sinodeId+cabangId: `(null,null)` global; `(X,null)` sinode-wide; `(X,Y)` cabang-specific. Backend pakai factory pattern `createKontenRouter(tipe)` → routes `/admin/news` dan `/admin/renungan` share controller logic. Hero image upload separate post-create (butuh ID untuk filename).

### 4.8 Cluster Community (Homecell)

**`homecell_area`** → **`homecell`** → **`homecell_member`** — struktur penggembalaan 3-level. Area scoped ke cabang, homecell scoped ke area. PIC area/homecell **divalidasi via Pelayanan Penggembalaan** (`assertPenggembalaanRole`) bukan FK ke role — supaya kalau orang keluar dari pelayanan, PIC field tidak corrupt (`onDelete: SetNull`), tinggal re-assign. HomecellMember lifecycle: `is_active` toggle + `tanggal_keluar` untuk soft-deactivate (riwayat penting untuk discipleship tracking). Unique `(homecell_id, jemaat_id)` mencegah duplikat — re-join = reactivate row yang sama.

### 4.9 Cluster Event (Movement)

**`event`** — event tunggal dengan tipe_bayar (GRATIS, NOMINAL_TETAP, NOMINAL_BEBAS), quota_peserta, butuh_kehadiran (toggle scan QR), is_published, tanggal_mulai/selesai (full datetime). Audience targeting sama dengan konten (sinode + cabang nullable).

**`event_participation`** — 5 status: DAFTAR → MENUNGGU_VERIFIKASI → BAYAR → HADIR → BATAL. Bukti transfer upload terpisah. Pattern check-in mirip ibadah tapi pakai EventParticipation status (bukan Reservasi).

**`event_donation`** — multi-payment per participation (fundraising / cicilan / top-up). Approval admin per donation row, bukan per participation. Pattern diputuskan via patch 2026-05-21l (Opsi B sub-table).

**`event_pelayanan` + `event_pelayanan_petugas`** — mirror pattern `ibadah_pelayanan` + petugas, dengan `can_scan_attendance` flag untuk authorize volunteer scan QR di hari H (per patch 2026-05-19).

### 4.10 Cluster Movement (peer-to-peer + UMKM)

**`visit`** — pertemuan peer-to-peer antar jemaat via scan QR. Initiator scan kode QR target → row tercipta dengan judul shared + lokasi opsional. Each side bisa nulis `note_dari_initiator` / `note_dari_target` untuk lawan bicara. Portal admin read + delete moderasi. Mobile = aktivitas inti.

**`local_business`** — direktori UMKM jemaat. Owner 1:N businesses. Field: nama, deskripsi, hero_image_url (banner), logo_url (square auto-crop 512x512), industri (text bebas), tipe_bisnis enum `B2C | B2B | B2B2C`, is_online + lokasi (text), website_url, whatsapp_url, company_profile_url (PDF max 5 MB passthrough), social_links (Json array of `{platform, url}` max 10), is_active. Mobile = CRUD + browse public filter by cabang. Portal admin = read + delete moderasi.

### 4.11 Cluster App Settings (mobile-driven config)

**`legal_document`** — Terms & Privacy multi-language (id wajib, en opsional). Unique `(key, language)`. Mobile fetch pre-login via `GET /public/legal/:key` (no auth, fallback ke id). Admin CRUD via `/admin/legal/:key/:lang`. Markdown content, `version` field (ISO date) untuk mobile cache invalidation.

**`app_version`** — update prompt per platform IOS/ANDROID. 1 row aktif per platform (auto-unpublish row lama saat publish baru). Field: latest_version (semver), min_supported_version (semver), release_notes, download_url, is_published. Public `GET /public/app-version?platform=&currentVersion=` compute updateAvailable + forceUpdate via semver compare.

### 4.12 Cluster Operasional

**`notification_log`** — outbound WA reminder dedup + audit. Field: jemaat_id, no_hp, type enum (`IBADAH_REMINDER | EVENT_REMINDER`), `dedup_key` UNIQUE (format `"{TYPE}:{sourceId}:{tanggalIso}:{jemaatId}"`), status enum (`PENDING | SENT | FAILED`), message_body, message_id (Fonnte), error_reason, attempt_count, sent_at. Cron dispatch setiap 1 jam dalam window `REMINDER_SEND_HOUR_START`–`END` (default 07–10 WIB).

**`branch_change_request`** — request pindah cabang. Status: PENDING → APPROVED/REJECTED dengan reviewer + reviewedAt + reviewNote. Setelah patch 2026-05-22 direct-branch-change, mobile bisa PATCH cabang langsung tanpa approval; queue admin tetap ada untuk audit.

**`role_menu_access` + `sub_role_menu_access`** — RBAC menu access per Role/SubRole. Tiap menu di `MENU_CATALOG` (di `packages/shared-types/src/schemas/menu-catalog.ts`) bisa di-toggle canRead/canWrite/canDelete per role. Migration baru biasanya backfill `Fulltimer` dapat full access menu baru. `Role.canAccessPortal` (boolean) gate awal — minimal 1 role aktif dengan canAccessPortal=true baru bisa login portal. Subroles override role-level untuk granularity (mis. Magang Fulltimer tidak akses semua menu).

### 4.13 Soft-delete jemaat (delete account compliance)

`jemaat.is_active` sebagai gate utama login + access. Self-deactivate via `DELETE /admin/me` dengan confirmText="HAPUS AKUN SAYA" set `is_active=false` + `deactivated_at` + `deactivation_reason`, plus revoke semua RefreshToken (force logout dari semua device). Reactivation hanya via admin portal toggle. Lookup endpoint user-facing (visit scan, ibadah/event checkin, family link, public profile, /api/v1) auto-filter `is_active=true` — sembunyikan inactive jemaat dari mobile.

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
| `/admin/news`                           | GET/POST | Fulltimer | List/Create news                           |
| `/admin/news/:id`                       | GET/PATCH/DELETE | Fulltimer | Detail/Update/Delete                  |
| `/admin/news/:id/hero`                  | POST/DELETE | Fulltimer | Upload/hapus hero image                  |
| `/admin/renungan`                       | GET/POST | Fulltimer | Sama dengan news (CRUD)                    |
| `/admin/renungan/:id`                   | GET/PATCH/DELETE | Fulltimer | Detail/Update/Delete                  |
| `/admin/renungan/:id/hero`              | POST/DELETE | Fulltimer | Hero image                                |
| `/api/v1/news`                          | GET    | API Key     | Mobile: list published news (sinode-scoped) |
| `/api/v1/news/:slug`                    | GET    | API Key     | Mobile: detail news (increment view)       |
| `/api/v1/renungan`                      | GET    | API Key     | Mobile: list published renungan            |
| `/api/v1/renungan/:slug`                | GET    | API Key     | Mobile: detail renungan (increment view)   |
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
- `matchFace(candidate, stored)` → Cosine similarity ≥ `FACE_MATCH_THRESHOLD` (MobileFaceNet sejak patch 2026-05-21r — sebelumnya Euclidean face-api.js)
- Default threshold 0.5, range cosine 0..1 (normalized descriptors)
- Model version: `mobilefacenet-v1` (128-dim, beda dari legacy `facenet-v1` — di-tolak via `FACE_MODEL_MISMATCH` 409 supaya force re-enroll)

### Server-side liveness gate (patch 2026-05-22b)

Sebelumnya: liveness 100% client-side → attacker bisa stealing descriptor (mis. ekstrak dari foto social media via model lokal) dan langsung POST `/auth/face/login` tanpa pernah ada human-presence verification.

Sekarang: **HMAC signed nonce** dengan TTL 3 menit + one-shot consume. Flow:

1. Mobile request nonce: `POST /auth/face/liveness-nonce` body `{ noHp, purpose: 'ENROLL' | 'LOGIN' }` → response `{ nonce, expiresAt, ttlSeconds: 180 }`.
2. Mobile show liveness UI (existing blink + head turn) — client-side challenges TIDAK berubah.
3. Saat submit `/auth/face/login` atau `/auth/face/enroll`, include field `livenessNonce` di body.
4. Server `consumeLivenessNonce()` verify: signature (HMAC dengan `LIVENESS_NONCE_SECRET` / fallback `JWT_SECRET`), TTL, purpose match (ENROLL vs LOGIN), noHp binding, **one-shot** (JTI tidak boleh re-used).

Implementasi `apps/core-api/src/lib/liveness-nonce.ts`:
- Token = JWT-style (jsonwebtoken sign) — opaque untuk mobile, server-only decode
- One-shot via in-memory `Set<jti>` dengan auto-eviction setelah TTL
- Stateless (tidak butuh DB table) — kompromi: kalau scale >1 pod, butuh Redis SETNX untuk distributed one-shot
- Error codes (HTTP 401): `LIVENESS_NONCE_INVALID`, `LIVENESS_NONCE_EXPIRED`, `LIVENESS_NONCE_PURPOSE_MISMATCH`, `LIVENESS_NONCE_BIND_MISMATCH`, `LIVENESS_NONCE_REUSED`

**V1 backward compat (sampai 2026-06-01)**: `livenessNonce` field OPTIONAL di body. Kalau missing, server log `WARN [liveness] face/* tanpa nonce` tapi tetap accept untuk grace period sampai mobile selesai migrate. Setelah cutoff, flip ke required.

### TODO sebelum production (tinggi-risiko)

- [x] **Server-side liveness gate** — implemented (signed nonce) — flip ke required setelah mobile confirm migrate
- [ ] **Anti-spoofing dedicated** — AWS Rekognition Liveness atau Azure Face untuk mitigasi deepfake/3D mask (cost decision)
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

**Prisma errors di-translate otomatis** oleh middleware (tidak perlu di-handle per-route):
- `P2003` / `P2014` (foreign key) → **409** dengan pesan `"Data {Label} tidak dapat dihapus karena masih berelasi dengan data lain."`
- `P2002` (unique violation) → 409 dengan info field duplikat
- `P2025` (record not found) → 404
- `PrismaClientValidationError` → 400

`{Label}` di-resolve via mapping di `error-handler.ts` (Sinode, Cabang Gereja, Jemaat, Homecell, Pelayanan, dst.). Tambah entry baru di `MODEL_LABEL` saat ada model baru supaya pesannya ramah.

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
- [x] Audit log retention cron (purge >365 hari) — `lib/scheduled-jobs.ts` `cleanupOldAuditLogs`, configurable via `AUDIT_LOG_RETENTION_DAYS`
- [x] Refresh-token cleanup cron — 6-hour interval, manual trigger via `/admin/maintenance/refresh-token-cleanup`
- [x] WhatsApp reminder cron — Ibadah + Event H-1, dedup via NotificationLog `dedup_key`, send window 07–10 WIB
- [x] Liveness server-side gate — HMAC signed nonce dengan TTL 3 menit + one-shot consume (lihat section 9). V1 grace mode (optional) → V2 cutover 2026-06-01.
- [x] CI/CD pipeline — GitHub Actions push-to-main auto-deploy via SSH ke VPS (lihat `docs/cicd-setup.md`)
- [x] Server Health diagnostic — `/admin/server-health` + portal page dengan auto-refresh + 16 troubleshooting cases
- [x] Maintenance ops page — manual trigger refresh-token / audit-log cleanup, notification stats + log viewer
- [x] Movement cluster — Visit (peer-to-peer scan QR) + Local Market (UMKM directory)
- [x] App Settings cluster — Legal docs (Terms/Privacy multi-lang) + App version check (per platform)
- [x] Delete Account (Apple/Google store compliance) — DELETE /admin/me soft-delete + invalidate sessions
- [x] WA outbound signature — IDEA footer di semua message via `appendSignature()` helper
- [x] TZ fix ibadah occurrence — sebelumnya pakai local-time methods, sekarang full UTC supaya server di TZ non-UTC tidak shift hari
- [x] Cascade isActive filter — semua endpoint lookup user-facing tolak jemaat self-deactivated
- [ ] Foto jemaat upload ke S3-compatible storage **— deferred** (per decision 2026-05-22, stay local VPS)
- [ ] Multi-language (en) untuk portal **— deferred**
- [ ] WhatsApp Cloud API migration **— deferred** (Fonnte cukup untuk volume saat ini)
- [ ] Push notification (FCM/APNs) **— deferred** (mobile pakai local notif sementara)
- [ ] Cabang admin role + scoping per cabang
- [ ] GDPR data export endpoint (hard-delete request manual via admin email saat ini)
- [ ] Monitoring/alerting external (Sentry, Grafana)
- [ ] Backup automation cron (pg_dump + uploads tar)

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
| 2026-05-18  | **News + Renungan** = satu tabel `konten` dengan `tipe` enum, bukan 2 tabel | Field overlap 90% (judul, ringkasan, body, hero, target, publish). Field renungan-spesifik (tanggal, ayatAlkitab) di-optional. Backend pakai factory pattern (`createKontenRouter(tipe)`) supaya routes terpisah `/admin/news` vs `/admin/renungan` tapi share controller logic — DRY |
| 2026-05-18  | Audience targeting: **nullable sinodeId + cabangId** kombinasi semantik     | (null, null) = global, (X, null) = sinode-wide, (X, Y) = cabang-specific. Auto-derive sinodeId kalau cabangId set tapi sinodeId null. Mobile public endpoint auto-filter berdasarkan API key sinode |
| 2026-05-18  | Konten body = **markdown** (bukan rich-text HTML)                            | Portable (export/import gampang), aman dari XSS, mobile app pakai markdown renderer (banyak library RN/Flutter). Editor di portal pakai plain textarea + preview future |
| 2026-05-18  | **Slug auto-generate** dari judul, unique global                             | URL-friendly untuk mobile deep-link (`app://news/judul-news-saya`). Update judul tidak regenerate slug (URL stability) — user bisa override manual |
| 2026-05-18  | Hero image upload **setelah save pertama** (butuh ID)                        | Pattern sama dengan foto profil. Modal form display warning "Simpan dulu, lalu upload hero". Trade-off: 2-step flow, tapi konsisten dengan storage scheme yang pakai entity-id sebagai filename |
| 2026-05-18  | `viewCount` increment **fire-and-forget**, hanya dari mobile public          | Tidak block response. Admin endpoint tidak count (avoid skew). Untuk analytics future, bisa pivot ke event log terpisah |
| 2026-05-18  | **Community cluster** = `HomecellArea` → `Homecell` → `HomecellMember`        | Sturktur natural penggembalaan: cabang punya beberapa zone, zone punya beberapa cellgroup, cellgroup punya anggota. 3 tabel lebih clean daripada single-table self-reference |
| 2026-05-18  | PIC HomecellArea/Homecell **divalidasi via Pelayanan Penggembalaan**, bukan FK ke role | PIC harus orang yang sudah resmi di tim Penggembalaan dengan role spesifik (Zone Leader / Homecell Leader). Validasi runtime di backend (`assertPenggembalaanRole`), bukan schema-level FK — supaya kalau jemaat keluar dari pelayanan, PIC field tidak corrupt (`onDelete: SetNull`) dan re-assign cukup ganti orangnya |
| 2026-05-18  | Endpoint `/admin/jemaat/by-pelayanan?pelayanan=&role=` untuk PIC dropdown      | Generic helper, bukan endpoint khusus homecell. Bisa di-reuse untuk dropdown PIC lain di masa depan (mis. Worship Leader dropdown, dst.) |
| 2026-05-18  | `homecellCount` di cabang list **diaggregate via area.cabangId** (bukan _count.homecells) | Homecell tidak punya FK langsung ke cabang. Query terpisah `prisma.homecell.findMany({ where: area.cabangId in [...] })` lalu group by JS. Lebih clean daripada raw SQL, perf OK untuk skala awal |
| 2026-05-18  | HomecellMember: **isActive toggle + tanggalKeluar** untuk lifecycle, bukan hard delete sebagai norm | Riwayat keanggotaan penting untuk discipleship tracking. Hard delete tersedia tapi soft toggle didorong sebagai default UX. Unique `(homecellId, jemaatId)` mencegah duplikat — re-join = reactivate row yang sama |
| 2026-05-19  | Event cluster terpisah dari ibadah (5 tabel)                                | Use case berbeda: ibadah recurring, event one-time dengan tipe_bayar + quota + butuh_kehadiran. Pattern junction mirror ibadah (event_pelayanan + petugas) supaya konsisten |
| 2026-05-19  | **`can_scan_attendance`** flag di petugas (ibadah + event)                  | Permissive scope: jemaat punya minimal 1 row petugas dengan flag=true → boleh scan QR di hari H, tanpa peduli tanggal row override. Authorization separable dari penugasan role |
| 2026-05-19  | RBAC menu access via tabel `role_menu_access` + `sub_role_menu_access`     | Granularity per menuKey × role × (read/write/delete). MENU_CATALOG di shared-types = single source. Migration baru wajib backfill Fulltimer dapat full access menu baru |
| 2026-05-20  | OTP request via WhatsApp number normalize ke **E.164 internasional**       | Sebelumnya hardcode +62. Jemaat diaspora/missionari/international perlu support. Pakai `libphonenumber-js` untuk validate per country |
| 2026-05-21  | Face V2 — **MobileFaceNet** (TFLite native) replace face-api.js TFJS       | WebView TFJS terlalu lambat di production mobile. MobileFaceNet 128-dim cosine similarity (bukan Euclidean) untuk speed + accuracy. Dim correction ke 128 (initial estimate 192 typo). Stored descriptor model lama (facenet-v1) di-tolak via FACE_MODEL_MISMATCH 409 supaya force re-enroll |
| 2026-05-21  | Multi-payment event donation = **sub-table** `event_donation` (Opsi B)     | Lebih flexible dari single nominal_total di participation. Mendukung fundraising, cicilan, top-up. Approval admin per donation row. Bukti transfer per donation. Mobile bisa view "my donations" terpisah |
| 2026-05-21  | Push notification **DEFERRED**, mobile pakai local notif                    | Infra FCM/APNs butuh setup terpisah + per-device token tracking. Reconsider trigger: kalau ada >5k DAU atau event-driven need yang tidak bisa di-local-notif |
| 2026-05-21  | Direct branch change tanpa approval (PATCH `/admin/me cabangId`)           | UX simplification. Old branch-change-request tetap ada untuk audit, tapi mobile bisa langsung PATCH |
| 2026-05-22  | Ibadah occurrence: switch ke **UTC methods** (getUTCDay, setUTCHours, dst) | Bug: server di TZ non-UTC (WIB) compute getDay() local → return hari yang salah saat Prisma @db.Date dilakukan resolve. Sekarang full UTC, konsisten dengan storage. Lihat `apps/core-api/src/lib/ibadah-occurrences.ts` |
| 2026-05-22  | **Visit cluster** (Movement)                                                | Peer-to-peer scan QR antar jemaat untuk record visitasi pastoral. Single shared title di-set initiator, dual notes per side (noteDariInitiator + noteDariTarget). Aktivitas inti di mobile, portal cuma display + moderation delete |
| 2026-05-22  | **Local Business** + Local Market (Movement)                                | UMKM directory. 1 jemaat N businesses. Hero banner + logo square (auto-crop 512x512) + company profile PDF (max 5MB passthrough). Social links Json array. is_active toggle owner-controlled. Browse public mobile filter cabang/industri/tipe |
| 2026-05-22  | **Delete Account** (Apple/Google store compliance)                          | DELETE /admin/me dengan confirmText="HAPUS AKUN SAYA" → soft-delete `isActive=false` + deactivatedAt + revoke semua RefreshToken. Cascade isActive filter di semua endpoint user-facing lookup. Reactivation hanya via admin portal |
| 2026-05-22  | **Legal Docs** configurable per (key, language) — markdown content         | Mobile fetch `GET /public/legal/:key?lang=` no-auth pre-login. Fallback ke `id` kalau lang tidak ada. Version field (ISO date) untuk mobile cache invalidation. Markdown editor portal pakai plain textarea (no preview, minimal deps) |
| 2026-05-22  | **App Version Check** per platform — semver compare server-side             | 1 row aktif per platform (auto-unpublish lama saat publish baru). Public `GET /public/app-version?platform=&currentVersion=` compute updateAvailable + forceUpdate. Semver manual parse (no `semver` npm dep) |
| 2026-05-22  | **Liveness gate signed nonce** (V1 grace, V2 cutover 2026-06-01)            | HMAC JWT-style token, TTL 3 menit, one-shot via in-memory Set. Stateless (no DB). V1 backward compat optional. Multi-pod note: butuh Redis SETNX kalau scale |
| 2026-05-22  | Scheduled cron in-process via **setInterval** (no node-cron dep)            | Refresh-token cleanup (6h), audit-log cleanup (24h), WA reminder dispatch (1h). Multi-pod safe via dedup unique key. Send window 07–10 WIB supaya WA tidak pop tengah malam |
| 2026-05-22  | WA outbound **signature IDEA** di-append via single helper                  | `appendSignature()` idempotent (cek "Powered by IDEA" sudah ada). Single source di `packages/auth/src/whatsapp.ts` — branding change cukup edit 1 tempat |
| 2026-05-22  | CI/CD **GitHub Actions** push-to-main → SSH deploy ke VPS                  | Workflow: validate (lint, type-check, build, prisma format check) → deploy job (SSH appleboy/ssh-action, run `scripts/deploy.sh`). PM2 ecosystem.config.cjs untuk process manager. Docs lengkap di `docs/cicd-setup.md` |
| 2026-05-22  | pnpm hoist `@types/*` ke top-level via `.npmrc`                            | Tanpa ini, TypeScript TS2742 di ~22 router file karena express Router type live di .pnpm subfolder yang tidak portable saat emit declaration |

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

2. Saat hadir di lokasi (DUA mode tersedia):
   a. Admin scan QR KODE JEMAAT (rekomendasi, sejak 2026-05):
      → POST /admin/ibadah/:id/checkin { kode, tanggalIbadah?, force? }
      → Lookup jemaat by kode → upsert Reservasi ke JOIN, joined_at = now
      → Walk-in allowed: kalau jemaat belum reservasi, auto-create reservasi
        dengan status JOIN langsung
      → Authorization: user.jemaatId harus terdaftar di IbadahPelayananPetugas
        ibadah tsb dengan can_scan_attendance=true (lihat sec 4.6)

   b. Mobile/external scan QR KODE RESERVASI (legacy, masih ada):
      → POST /api/v1/reservasi/checkin (kode reservasi)
      → status JOIN, joined_at = now

3. Kalau batal → mobile POST /api/v1/reservasi/cancel
              → status CANCEL, cancelled_at = now

   Atau admin manual → PATCH /admin/reservasi/:id/status
                    → bisa pindah ke status apa pun (Reserve juga, untuk reset)
```

> **Catatan**: kode jemaat = QR statis milik tiap jemaat (8 char alphanumeric,
> field `jemaat.kode`). Sama yang dipakai untuk check-in Event. Satu kartu
> jemaat → dipakai untuk semua kehadiran (ibadah maupun event).

### UI portal

`/dashboard/kehadiran`:
- Tabel daftar reservasi dengan filter (status, ibadah, tanggal, search nama/kode)
- Kolom Kode = button clickable → modal QR preview (pakai api.qrserver.com untuk render QR image)
- Action per row: tombol Join / Cancel / Reserve (quick status change) + hapus
- Tombol header: **Buat Reservasi** (modal pilih ibadah + tanggal + cari jemaat) dan **Check-in via Kode** (modal input kode → POST checkin)

`/dashboard/ibadah/[id]`:
- Header dapat **date picker tanggal** + tombol hijau **Check-in** (scan QR kode jemaat).
- Modal scanner reuse komponen generik `apps/portal/src/components/checkin-modal.tsx` (sama yang dipakai Event):
  - Input auto-focused, scanner hardware tinggal scan + Enter
  - History sesi dengan badge **Walk-in** untuk peserta yang reservasi-nya auto-created
  - Override flow kalau occurrence ditiadakan
- Tiap row petugas di card Pelayanan punya tombol toggle **Bisa Scan / Beri akses** untuk flip `can_scan_attendance` inline. Badge hijau "Scanner" tampil untuk yang aktif. Modal Tambah Petugas juga punya toggle Scan/No-scan per row supaya bisa set langsung saat add.

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

## 21. Broadcast — News & Renungan

Content management untuk konsumsi mobile app jemaat. Satu tabel `konten` dengan enum `tipe` (NEWS / RENUNGAN), berbagi semua infrastructure (CRUD, upload hero, publish flow).

### Model `konten`

- `tipe` — NEWS atau RENUNGAN
- `judul`, `slug` (auto-generated dari judul, unique global, URL-friendly)
- `ringkasan` — short preview untuk list/card view
- `konten` — body markdown (mobile app render markdown)
- `heroImageUrl` — uploaded image, disimpan di `uploads/content/hero/{kind}/{id}.webp`
- **Targeting** (audience scope, nullable kombinasi):
  - `sinodeId=null, cabangId=null` → **Global** (semua sinode + cabang)
  - `sinodeId=X, cabangId=null` → **Sinode-wide** (semua cabang di sinode X)
  - `sinodeId=X, cabangId=Y` → **Cabang-specific**
- `tanggal` & `ayatAlkitab` — renungan-spesifik, opsional
- `tags[]` — untuk kategorisasi/filter
- `isPublished` + `publishedAt` — draft vs published
- `viewCount` — auto-increment saat detail di-akses dari public mobile endpoint
- `authorId` → User yang create (auto dari JWT)

### Hero image upload

Sama pattern dengan foto profil — pakai sharp untuk resize + WebP convert. Hero lebih besar (max 1600px) untuk display utama mobile + tetap tajam. Folder: `uploads/content/hero/{news|renungan}/{kontenId}.webp` dengan cache-bust `?v=timestamp`.

### Slug strategy

- Auto-generate dari judul saat create (kebab-case, alphanumeric)
- Unique global (untuk URL public mobile)
- Update judul **tidak** auto-regenerate slug (URL tidak break)
- User bisa override slug manual

### Audience filter di mobile

Endpoint public `/api/v1/news` & `/api/v1/renungan` auto-filter berdasarkan sinode dari API key:
- Return konten dengan `(sinodeId=null AND cabangId=null)` (global)
- OR `(sinodeId=APIkey.sinodeId AND cabangId=null)` (sinode-wide untuk sinode user)
- OR `(cabangId match)` jika mobile pass `?cabangId=`
- Hanya yang `isPublished=true`, sorted by `publishedAt desc`

### View count

Increment fire-and-forget setiap GET detail di public endpoint. Tidak block response. Hanya count dari mobile (admin endpoint tidak increment).

### UI portal

`/dashboard/news` & `/dashboard/renungan` — pakai shared component `KontenPage` (file: `apps/portal/src/components/broadcast/konten-page.tsx`).
- Grid 2 kolom cards dengan hero thumbnail, badge published/draft, metadata
- Filter: search + dropdown Published/Draft/All
- Modal form: judul, slug (auto), ringkasan, konten markdown, target (sinode → cabang dropdown), tanggal/ayatAlkitab (kalau Renungan), tags (CSV input), publish toggle
- Hero image: upload setelah save pertama (butuh ID), preview di modal, tombol ganti

### Mobile app integration

```bash
# List news yang ter-publish di sinode tersebut
curl https://core-api.eccchurch.global/api/v1/news?page=1 \
  -H "X-API-Key: ecc_xxx_yyy"

# Detail by slug (increment view)
curl https://core-api.eccchurch.global/api/v1/news/ibadah-pemuda-akhir-tahun \
  -H "X-API-Key: ecc_xxx_yyy"
```

---

## 22. Community — Homecell Area & Homecell

Struktur penggembalaan (pastoral care) untuk discipleship via small group meeting.

### Hierarchy

```
CabangGereja
  └── HomecellArea (zone)         — 1 PIC: Zone Leader
        └── Homecell (cellgroup)  — 1 PIC: Homecell Leader
              └── HomecellMember  — junction M:N dengan Jemaat (riwayat)
```

3 model baru: `HomecellArea`, `Homecell`, `HomecellMember`. Schema-level relations:
- `HomecellArea.cabangId` → CabangGereja (`onDelete: Restrict`)
- `HomecellArea.picJemaatId` → Jemaat (`@relation("AreaPic")`, `onDelete: SetNull`)
- `Homecell.areaId` → HomecellArea (`onDelete: Restrict`)
- `Homecell.picJemaatId` → Jemaat (`@relation("HomecellPic")`, `onDelete: SetNull`)
- `HomecellMember.homecellId` → Homecell (`onDelete: Cascade`)
- `HomecellMember.jemaatId` → Jemaat (`@relation("HomecellMembership")`, `onDelete: Cascade`)

Unique constraints:
- `HomecellArea (cabangId, nama)` — nama area unik per cabang
- `HomecellMember (homecellId, jemaatId)` — satu jemaat hanya 1 row per homecell (tidak bisa join 2x; pakai `isActive` toggle untuk riwayat keluar/masuk kembali)

### PIC business rule (validasi backend, bukan FK)

Backend menolak create/update jika `picJemaatId` tidak memenuhi:
- Punya `JemaatPelayanan` aktif dengan `Pelayanan.nama="Penggembalaan"` DAN role spesifik
- Untuk `HomecellArea`: role `"Zone Leader"`
- Untuk `Homecell`: role `"Homecell Leader"`

Validasi di `apps/core-api/src/lib/homecell-pic.ts` via helper `assertPenggembalaanRole(jemaatId, roleNama)`.

Frontend dropdown filter ke endpoint `/admin/jemaat/by-pelayanan?pelayanan=Penggembalaan&role=Zone%20Leader` (atau `Homecell%20Leader`) yang return hanya jemaat eligible.

### Seed — Pelayanan Penggembalaan

Ditambahkan ke `prisma/seed.ts`:
- Pastor (level 15) — Gembala sidang
- Zone Leader (level 10) — PIC HomecellArea
- Homecell Leader (level 5) — PIC Homecell
- Asisten (level 0)

### Endpoint admin

```
GET    /admin/homecell-area              ?cabangId=&sinodeId=&page=&search=
GET    /admin/homecell-area/:id           # detail + nested homecells
POST   /admin/homecell-area              # validate PIC=Zone Leader
PATCH  /admin/homecell-area/:id
DELETE /admin/homecell-area/:id           # block jika punya homecells

GET    /admin/homecell                   ?areaId=&cabangId=&sinodeId=&page=
GET    /admin/homecell/:id                # detail + members
POST   /admin/homecell                   # validate PIC=Homecell Leader
PATCH  /admin/homecell/:id
DELETE /admin/homecell/:id                # CASCADE members

POST   /admin/homecell/:id/members        # tambah member
PATCH  /admin/homecell/:id/members/:memberId   # set status keluar / catatan
DELETE /admin/homecell/:id/members/:memberId   # hard delete dari riwayat
```

### Cabang list — homecellCount clickable

`/admin/cabang` sekarang return `homecellAreaCount` + `homecellCount` per cabang (aggregated lewat `area.cabangId`). Portal column "Homecell" link ke `/dashboard/homecell?cabangId={id}`.

### UI portal

- `/dashboard/homecell-area` — CrudPage. Filter `?cabangId=` (banner reset).
- `/dashboard/homecell` — CrudPage. Filter `?cabangId=` atau `?areaId=` (banner reset).
- `/dashboard/homecell/[id]` — detail page custom (bukan modal):
  - Header dengan back button, badge nonaktif
  - Card PIC saja (Homecell Leader)
  - Members table dengan toggle aktif/keluar (`UserMinus`/`UserCheck`) + hapus permanen
  - Add Member modal dengan jemaat picker (filtered ke cabang area)
- Sidebar group **Community**: `Homecell Area` + `Homecell`

> **Catatan**: kolom `homecell.alamat / hari / jam` masih ada di skema, tapi **tidak diekspos di form/UI**. Realita di lapangan, pertemuan homecell ditentukan per kesepakatan tiap minggu, jadi data statis tersebut menyesatkan. Schema kolom dipertahankan untuk backward-compat (data lama aman); bisa di-drop via migration terpisah kalau diperlukan.

### Member lifecycle

- Tambah → `tanggalBergabung` (default hari ini), `isActive=true`, `tanggalKeluar=null`
- Mark keluar → backend auto-set `tanggalKeluar=now` jika tidak diberikan
- Reactivate → backend clear `tanggalKeluar`
- Hard delete tersedia untuk hapus riwayat penuh (tidak audit-friendly, gunakan dengan hati-hati)

---

## 23. Update Log — 2026-05-19

Patch besar yang menyentuh schema + API + UI sekaligus. Ringkasan supaya mudah dilacak; detail teknis ada di section masing-masing yang sudah di-update.

### Sidebar polish

- Bug fix: `isActive` semula pakai `pathname.startsWith(href)`, jadi `/dashboard/homecell-area` ikut highlight `/dashboard/homecell`. Diganti ke exact match + prefix `href + '/'`.
- Group header sekarang button **expand/collapse** dengan chevron rotate; state di-persist ke `localStorage.ecc-portal-sidebar-collapsed-groups`. Tidak ada auto-force-open — user bebas collapse grup mana saja.

### Petugas ibadah per-tanggal

- Kolom `tanggal_ibadah` (nullable DATE) ditambah ke `ibadah_pelayanan_petugas`. NULL = default tiap minggu; isi = override khusus tanggal.
- Snapshot semantics: kalau ada satu atau lebih override untuk tanggal X, override **menggantikan** default sepenuhnya untuk tanggal itu.
- Unique baru: komposit `(link, jemaat, tanggal_ibadah)` + partial unique untuk row default (`WHERE tanggal_ibadah IS NULL`) supaya Postgres tetap enforce "1 jemaat 1 row default per link" walaupun NULL secara default distinct di unique index.
- API: `POST /admin/pelayanan/petugas` menerima `tanggalIbadah` opsional. `GET /admin/pelayanan/ibadah-link/:id/petugas?tanggal=YYYY-MM-DD` return resolved view (kalau ada override → override only; else fallback default).
- UI: detail ibadah memisahkan section **Petugas Default** vs **Override · {tanggal}**. Modal Tambah Petugas punya toggle Default vs Khusus tanggal + date picker. Klik tanggal di kalender → tombol **Petugas khusus** (link ke detail ibadah dengan `?tanggal=...`).

### Cancel occurrence (skip minggu Natal, dll.)

- Tabel baru `ibadah_occurrence_status` (`ibadah_id, tanggal_ibadah, status, catatan, created_by`). Status saat ini hanya `CANCELLED`. Sparse table — row hanya dibuat saat cancel.
- API:
  - `POST   /admin/ibadah/:id/occurrence/:tanggal/cancel` — idempotent upsert + auto-cancel semua reservasi aktif pada tanggal itu (transaksional, catatan reservasi di-prefix `[Ibadah ditiadakan]`).
  - `DELETE /admin/ibadah/:id/occurrence/:tanggal/cancel` — buka kembali. Reservasi yang sudah di-cancel **tidak** auto-restore (admin handle manual).
  - `GET    /admin/ibadah/:id/occurrence/cancelled` — list.
- Calendar endpoint skip occurrence yang berstatus `CANCELLED`.
- Validasi: backend tolak cancel kalau tanggal bukan jadwal `Ibadah` tsb (cek dengan `generateOccurrences`).
- **Sistem notifikasi belum ada** — admin perlu announce manual. Banner di modal cancel sudah menjelaskan ini.
- UI: tombol **Tiadakan** di calendar detail panel (hanya muncul untuk recurring, ONCE pakai delete Ibadah biasa). Section **Tanggal Ditiadakan** di detail ibadah dengan tombol **Buka kembali**.

### Workflow Natal di hari Minggu

1. Buat ibadah Natal sebagai `Ibadah` baru `tipeJadwal=ONCE` tanggal 25 Des.
2. Buka kalender → klik tanggal Natal yang jatuh di Minggu.
3. Pada baris Ibadah Mingguan, klik **Tiadakan** → backend create row `IbadahOccurrenceStatus(CANCELLED)` → di kalender row mingguan hilang, reservasi-nya otomatis CANCEL.
4. Selesai. Hanya ibadah Natal yang muncul di tanggal itu.

### Friendly Prisma error messages

- `error-handler.ts` translate `PrismaClientKnownRequestError`:
  - `P2003` / `P2014` → 409 `"Data {Label} tidak dapat dihapus karena masih berelasi dengan data lain."`
  - `P2002` → 409 dengan field duplikat
  - `P2025` → 404
  - `PrismaClientValidationError` → 400
- Label resource via mapping `MODEL_LABEL` (Sinode, Cabang Gereja, Jemaat, Homecell, Pelayanan, …). Update mapping saat tambah model baru.

### Homecell form disederhanakan

Field `alamat`, `hari`, `jam` dihapus dari form (create + update schemas), tabel list, dan info cards di detail page. Alasan: pertemuan homecell di lapangan ditentukan per kesepakatan tiap minggu. Kolom DB dipertahankan (data lama aman) — drop via migration kalau perlu.

### Jemaat list: filter, sort, avatar

- Backend `GET /admin/jemaat` menerima query baru:
  - `isActive=true|false`, `jenisKelamin=L|P`, `roleId=<uuid>` (ada active JemaatRole dengan role tsb), `umurMin`, `umurMax` (derive ke `tanggal_lahir` range)
  - `sortBy` di-whitelist: `namaLengkap`, `tanggalLahir`, `tanggalBergabung`, `cabang` (nested → `cabang.nama`), `createdAt`
- Frontend `JemaatFilterBar` (`apps/portal/src/components/jemaat/filter-bar.tsx`) — toolbar dengan dropdown Status / Jenis Kelamin / Role, input rentang usia, pilihan sort + tombol toggle arah Naik/Turun. Reset filter, state encoded ke `extraParams` (CrudPage spread setelah `sortBy/sortOrder` jadi otomatis override default config).
- Avatar bulat 32×32 di kolom Nama. Fallback inisial brand-color, ikon `User` kalau nama kosong. Source: `${NEXT_PUBLIC_CORE_API_URL}${fotoUrl}`.

### Jemaat detail: Edit Profile + Role section

- **Edit Profile** sebelumnya broken (cuma `router.push('?edit=')` yang tidak di-handle list page). Sekarang membuka `FormModal` in-page reuse `updateSchema + fields` dari `jemaat-config`. Submit → `PATCH /admin/jemaat/:id` → invalidate `['jemaat','detail',id]` & `['jemaat']`.
- Section baru **Role** (terpisah dari Pelayanan):
  - List active + history JemaatRole dari `j.jemaatRoles` (sudah di-include di detail endpoint).
  - Modal Tambah Role dengan dropdown berjenjang `Role → Sub-Role → Status (opsional)`. Status disabled kalau sub-role tidak punya tingkatan.
  - Validasi UX duplikat: kalau jemaat sudah punya row aktif `(Role, Sub-Role)` yang sama, tombol Tambah di-disable dengan warning kuning (backend tetap final guard).
  - Tombol **Akhiri** (PATCH `isActive=false, tanggalSelesai=today`) dan **Hapus permanent** (DELETE `/admin/role/assign/:id`).

---

## 24. Movement — Event

Cluster baru di skema: `Event` + `EventParticipation`. Berbeda dengan **Ibadah** (recurring schedule, jadwal tetap), **Event** adalah aktivitas berbatas waktu: penggalangan dana, retreat, puasa 21 hari, KKR khusus, dll.

### Model `event`

- `judul`, `slug` (auto-generated, unique global, URL-friendly), `ringkasan`, `deskripsi` (markdown body)
- `heroImageUrl` — teaser banner (uploaded, `/uploads/content/hero/event/{id}.webp`, max 1600px)
- `videoUrl` — link YouTube/Vimeo/file mp4 (free-form URL), untuk teaser video
- `tanggalMulai`, `tanggalSelesai` (nullable, untuk acara 1 hari), `lokasi`
- **Targeting (sama dengan Konten):**
  - `sinodeId=null & cabangId=null` → **Global**
  - `sinodeId=X & cabangId=null` → **Sinode-wide**
  - `sinodeId=X & cabangId=Y` → **Cabang-specific**
  - `cabangId` set → backend auto-derive `sinodeId`
- **Pembayaran:** `tipeBayar` enum `GRATIS | NOMINAL_TETAP | NOMINAL_BEBAS`
  - `GRATIS` — tidak ada pembayaran
  - `NOMINAL_TETAP` — `nominal` wajib > 0 (admin tentukan)
  - `NOMINAL_BEBAS` — `nominal` opsional sebagai minimum; jemaat tentukan nominal sendiri
  - `qrisImageUrl` — uploaded QRIS image per event (`/uploads/content/event/qris/{id}.webp`)
  - `bankNama`, `bankNomor`, `bankAtasNama` — info transfer manual
- `quotaPeserta` nullable — kalau diisi, registrasi otomatis ditolak saat partisipasi non-BATAL sudah ≥ quota
- `tags[]` (Postgres array) — untuk filter/search
- `butuhKehadiran` (boolean, default false) — kalau true, admin bisa scan QR kode jemaat untuk mark partisipasi sebagai HADIR pada hari H. Kalau false, lifecycle berhenti di DAFTAR / BAYAR — tidak ada absensi.
- `isPublished` + `publishedAt` — draft vs published. Auto-set saat toggle published.
- `viewCount` (untuk public mobile endpoint nanti), `authorId` → User

### Model `event_participation`

Satu jemaat ↔ satu event = satu row (unique `(eventId, jemaatId)`).

- `status` enum `event_participation_status`:
  - `DAFTAR` — baru daftar, belum bayar (atau gratis pending)
  - `MENUNGGU_VERIFIKASI` — bukti transfer ter-upload, menunggu admin approve
  - `BAYAR` — admin approved (set `approvedBy`, `approvedAt`, `paidAt`)
  - `HADIR` — hadir di event (set `attendedAt`)
  - `BATAL` — dibatalkan (set `cancelledAt`)
- `nominalBayar` — untuk berbayar; untuk NOMINAL_TETAP auto-set dari `event.nominal`, untuk NOMINAL_BEBAS jemaat tentukan (≥ `event.nominal` minimum)
- `buktiTransferUrl` — uploaded, `/uploads/content/event/bukti/{participationId}.webp` (max 2000px supaya cukup tajam untuk verifikasi)
- `catatan` — field bebas untuk pertanyaan custom (ukuran kaos, makanan, dst.)
- Lifecycle timestamps: `registeredAt`, `paidAt`, `attendedAt`, `cancelledAt`, `approvedAt`
- Approval audit: `approvedBy` → Jemaat (admin yang verify)

### Endpoint admin

```
GET    /admin/event                         ?cabangId=&sinodeId=&isPublished=&tipeBayar=&search=&page=
GET    /admin/event/:idOrSlug               # detail + pesertaCount
POST   /admin/event                         # create
PATCH  /admin/event/:id                     # update
DELETE /admin/event/:id                     # hapus + cleanup hero & QRIS files

POST   /admin/event/:id/hero                # multipart "foto" — upload hero
DELETE /admin/event/:id/hero
POST   /admin/event/:id/qris                # multipart "foto" — upload QRIS
DELETE /admin/event/:id/qris

GET    /admin/event/:id/peserta             ?status=...
POST   /admin/event/:id/peserta             # register jemaat (admin)
PATCH  /admin/event/:id/peserta/:participationId   # ubah status / nominal / catatan
DELETE /admin/event/:id/peserta/:participationId
POST   /admin/event/:id/peserta/:participationId/bukti      # upload bukti transfer; auto-naik ke MENUNGGU_VERIFIKASI
POST   /admin/event/:id/peserta/:participationId/approve    # shortcut: set BAYAR + approvedBy + approvedAt

POST   /admin/event/:id/checkin             # body { kode, force? } — scan QR kode jemaat, set HADIR

# Ministry & Volunteer (hanya relevan saat butuhKehadiran=true)
GET    /admin/event/:id/pelayanan                              # list link + volunteer
POST   /admin/event/:id/pelayanan                              # body { pelayananId }
DELETE /admin/event/:id/pelayanan/:linkId                      # cascade volunteer
POST   /admin/event/:id/pelayanan/:linkId/petugas              # add volunteer
PATCH  /admin/event/:id/pelayanan/:linkId/petugas/:petugasId   # update role / canScanAttendance
DELETE /admin/event/:id/pelayanan/:linkId/petugas/:petugasId
```

### Ministry & Volunteer (per event)

Untuk event `butuhKehadiran=true`, ada section **Ministry & Volunteer** di detail event. Pattern mirror `IbadahPelayanan` + `IbadahPelayananPetugas`, tapi per-event:

- **EventPelayanan** (junction Event ↔ Pelayanan) — pelayanan apa saja yang bertugas. Unique `(eventId, pelayananId)`.
- **EventPelayananPetugas** (junction EventPelayanan ↔ Jemaat) — siapa volunteer-nya dengan role. Plus field `canScanAttendance` (boolean, default false) — flag wewenang scan QR check-in. Unique `(eventPelayananId, jemaatId)`.

Workflow di UI:

1. Klik **Tambah Pelayanan** → modal pilih pelayanan dari list global.
2. Per pelayanan card, klik **Tambah Volunteer** → modal pilih member pelayanan tsb dengan:
   - Checkbox pilih jemaat
   - Dropdown role (default = role member di pelayanan, bisa di-override)
   - Toggle **Scan/No-scan** untuk set `canScanAttendance` sekaligus saat add
3. List volunteer: tombol toggle **Bisa Scan** / **Beri akses scan** untuk flip `canScanAttendance` per row. Badge hijau "Scanner" muncul untuk yang sudah di-flag.

### Check-in flow (hari H event)

Khusus event dengan `butuhKehadiran=true`:

1. Admin buka halaman detail event → klik tombol **Check-in** (hanya muncul kalau butuhKehadiran=true).
2. Modal scanner buka dengan input field auto-focused — scanner hardware bisa langsung ngirim kode + Enter, atau admin ketik manual.
3. Backend `POST /admin/event/:id/checkin` body `{ kode, force }`:
   - Validate `event.butuhKehadiran=true` (kalau false, reject 400).
   - **Authorization**: cek `req.user.sub` → `user.jemaatId` → ada di list `EventPelayananPetugas(eventId, jemaatId, canScanAttendance=true)`. Kalau tidak → **403 Forbidden** dengan pesan jelas. Artinya bahkan Fulltimer harus ditandai sebagai authorized scanner untuk event tsb (decision: hanya yang di-assign yang boleh).
   - Lookup `jemaat` by `kode` (case-insensitive, di-uppercase).
   - Lookup `EventParticipation(event, jemaat)` — harus ada, status bukan BATAL.
   - Untuk event berbayar: status harus `BAYAR`. Kalau bukan, return 409 dengan hint admin bisa retry dengan `force=true`.
   - Idempotent: kalau status sudah `HADIR`, return data lama + `meta.alreadyCheckedIn=true` (toast info, bukan error).
   - Set `status=HADIR`, `attendedAt=now`. Audit log.
4. Modal tampilkan history sesi (max 20 scan) dengan foto + nama + status, agar admin punya feedback visual cepat.

> **Operasional**: kalau tidak ada volunteer dengan `canScanAttendance=true`, **tidak ada yang bisa scan** — banner kuning muncul di section Ministry sebagai peringatan. Admin harus add minimal satu authorized scanner sebelum hari H.

### Kode Jemaat (QR statis)

Field baru `Jemaat.kode` — 8 char alphanumeric uppercase (sama strategi dgn `kode-reservasi.ts`, skip karakter ambigu 1/I/0/O). Unique + nullable.

- Auto-generate saat `POST /admin/jemaat` dan saat bulk import CSV (pre-generate per row supaya transaction tidak terganggu collision retry).
- Backfill row existing dilakukan di migration SQL (`20260519140000_kode_jemaat_butuh_kehadiran`) pakai PL/pgSQL loop.
- Endpoint `GET /admin/jemaat/by-kode/:kode` untuk lookup cepat (return summary jemaat).
- Halaman detail jemaat menampilkan **Kartu QR Jemaat** dengan QR image (via `api.qrserver.com`) + kode + tombol copy. Bisa di-print untuk kartu fisik.

> Catatan: satu kode = satu jemaat, dipakai untuk SEMUA event/ibadah (global). Tidak ada kode per-partisipasi.

### UI portal

`/dashboard/event` (sidebar grup baru **Movement**):

- Grid 3 kolom kartu event dengan hero thumbnail, badge **Published/Draft** + badge **tipe bayar** (Gratis hijau, Nominal Tetap kuning, Sukarela biru), info tanggal + lokasi + peserta count
- Filter: search, status (all / published / draft), tipe bayar
- Tombol **Tambah Event** → modal form lengkap (info dasar, waktu+lokasi, target audience, pembayaran dengan radio card 3 tipe, quota, tags CSV, publish toggle). Nominal field muncul kondisional sesuai tipe bayar.
- Tombol Detail/Edit/Hapus per kartu.

`/dashboard/event/[id]`:

- Hero banner besar (3:1) dengan tombol Ganti/Hapus
- Info utama (tanggal range, lokasi, peserta/quota, link video teaser kalau ada, tags, deskripsi expandable)
- Section **Info Pembayaran** (hanya muncul untuk event berbayar): tipe, nominal, bank info, QRIS image dengan upload/replace/delete
- Section **Peserta** dengan dua tombol header: **Check-in** (hanya muncul kalau `butuhKehadiran=true`) + **Daftarkan Jemaat**. List peserta dengan filter status, avatar, badge status berwarna sesuai enum. Tombol aksi per row:
  - **Bukti** (upload bukti transfer mewakili jemaat) — auto-naik ke MENUNGGU_VERIFIKASI kalau belum BAYAR/HADIR
  - **Approve** (untuk MENUNGGU_VERIFIKASI) — shortcut set BAYAR
  - **Hadir** — set HADIR
  - **Batal** — set BATAL
  - **Hapus** — delete permanent (file bukti ikut dihapus)
- Modal **Daftarkan Jemaat**: search jemaat (min 2 huruf), set nominal (untuk berbayar), catatan custom

### Aturan & validasi

- Slug unique global. Auto-generate dari judul kalau kosong. Update judul tidak auto-regenerate slug (URL stabil).
- `tanggalSelesai >= tanggalMulai` di-enforce Zod.
- `NOMINAL_TETAP` wajib `nominal > 0` di-enforce Zod.
- `NOMINAL_BEBAS` dengan `nominal` set = minimum yang harus dibayar. Backend reject `nominalBayar < min`.
- Quota guard di backend: hitung partisipasi `status != BATAL`. Daftar baru ditolak (409) kalau ≥ quota.
- Hero/QRIS image upload: max 5 MB, sharp resize → webp (1600px hero, 1600px QRIS), JPEG/PNG/WebP input.
- Bukti transfer per partisipasi: ukuran 2000px (lebih besar supaya cukup detail untuk verifikasi).
- Delete event cascade: `event_participation` ikut terhapus; file hero & QRIS dibersihkan (best-effort). File bukti transfer per partisipasi juga dibersihkan saat partisipasi dihapus.
- Sinode/cabang FK = `onDelete: SetNull` (event tidak ikut hilang kalau target dihapus, tinggal jadi global).
- Author FK ke User = `onDelete: Restrict` (cegah delete user yang masih punya event).

### Notifikasi

Belum ada (sama seperti `IbadahOccurrenceStatus`). Saat ada perubahan status partisipasi (mis. BAYAR di-approve), tidak ada notif WA/push otomatis — admin perlu announce manual. Bisa ditambah saat sistem notif global dibangun.

---

## 25. Update Log — 2026-05-19 (lanjutan)

### Movement / Event

Lihat section 24 untuk dokumentasi lengkap. Patch terbaru menambah:

- Model `Event` + `EventParticipation` + 2 enum baru (`event_tipe_bayar`, `event_participation_status`).
- Endpoint `/admin/event` lengkap (CRUD + hero/QRIS upload + participation lifecycle + bukti transfer + approve shortcut).
- Sidebar grup **Movement** baru dengan menu **Event** (icon Megaphone).
- Halaman list `/dashboard/event` (grid cards + filter) dan detail `/dashboard/event/[id]` (hero + info bank/QRIS + peserta management).
- Form modal Event (`event-form-modal.tsx`) dengan radio card untuk tipe bayar.
- Extend `storage.ts`: `saveEventQris`, `deleteEventQris`, `saveEventBuktiTransfer`, `deleteEventBuktiTransfer`. `ContentKind` ditambah `'event'`.
- Update `MODEL_LABEL` di `error-handler.ts` (Event, EventParticipation).

### Kehadiran event + QR jemaat (lanjutan)

- Field baru `Event.butuhKehadiran` (boolean, default false) — toggle aktif/nonaktifkan absensi pada hari H.
- Field baru `Jemaat.kode` (8 char alphanumeric, unique) — QR statis untuk scan check-in. Auto-generate saat create + bulk import; backfill row existing via PL/pgSQL di migration `20260519140000_kode_jemaat_butuh_kehadiran`.
- Endpoint `POST /admin/event/:id/checkin` `{ kode, force? }` — validate event, jemaat, partisipasi, status. Untuk berbayar wajib BAYAR (kecuali `force=true`). Idempotent.
- Endpoint `GET /admin/jemaat/by-kode/:kode` — lookup cepat untuk scanner mobile/external.
- UI:
  - Toggle **Event butuh kehadiran** di form Event.
  - Tombol **Check-in** (hijau) di detail event header section Peserta — hanya muncul kalau `butuhKehadiran=true`.
  - Modal scanner: input auto-focused untuk hardware scanner (Enter trigger submit), preview history scan dalam sesi, override warning untuk event berbayar yg belum BAYAR.
  - Section **Kartu QR Jemaat** di detail jemaat: QR image (api.qrserver.com) + kode + tombol copy. Cetak untuk kartu fisik.

### Ministry & Volunteer + authorized scanner

- Model baru `EventPelayanan` + `EventPelayananPetugas` (lihat section 24). Pattern mirror IbadahPelayanan tapi per-event + flag `canScanAttendance`.
- Endpoint baru: `GET/POST/DELETE /admin/event/:id/pelayanan` dan `POST/PATCH/DELETE /admin/event/:id/pelayanan/:linkId/petugas`.
- Authorization check di `POST /admin/event/:id/checkin` sekarang strict: hanya user dengan jemaatId ada di list `canScanAttendance=true` boleh scan. Fulltimer yang tidak di-assign → 403.
- UI section **Ministry & Volunteer** di detail event (hanya saat `butuhKehadiran=true`): card per pelayanan, badge hijau "Scanner" untuk volunteer authorized, toggle per row untuk flip `canScanAttendance`. Modal Tambah Volunteer punya toggle Scan/No-scan per row supaya bisa set langsung saat add. Banner kuning muncul kalau belum ada scanner.

### API Keys management

Halaman `/dashboard/api-key` (group Developer Tools) — full CRUD untuk `SinodeApiKey`.

**Lib generator** (`apps/core-api/src/lib/api-key.ts`):
- `generateApiKey()` return `{ key, prefix, hash }`.
- Format: `ecc_<prefix>_<secret>` (prefix 8 char, secret 24 char alphanumeric, total ~144 bits entropy).
- DB simpan: `keyPrefix` plaintext (untuk lookup cepat di `require-api-key.ts`) + `keyHash` bcrypt(seluruh key).

**Scopes catalog** (`API_KEY_SCOPES` di shared-types + lib api-key.ts, harus sinkron):
`read:jemaat, read:ibadah, read:event, read:news, read:renungan, read:reservasi, write:reservasi`.

> **Catatan UI** (sejak 2026-05-20): UI default membuat API key **global** (sinode-id NULL = lintas sinode) dengan scopes **kosong** (full access). Field sinode-id dan scopes tetap di schema untuk backward-compat dan fleksibilitas future — kalau perlu key yang scoped, edit langsung di DB atau pakai PATCH endpoint. Migration `20260520120000_apikey_global` mengubah `sinode_id` jadi nullable.

**Endpoints** (`apps/core-api/src/routes/admin/api-key.ts`):
```
GET    /admin/sinode-api-key                # list (paginated, filter ?sinodeId=)
POST   /admin/sinode-api-key                # body { sinodeId, nama, scopes, expiresAt? }
                                              # → return { ...row, key } SEKALI saja
PATCH  /admin/sinode-api-key/:id            # update nama/scopes/expiresAt/isActive
DELETE /admin/sinode-api-key/:id            # revoke (cascade konsumer langsung 401)
```

`keyHash` di-redact dari semua response. Plaintext `key` HANYA ada di response POST create.

**UI** (`/dashboard/api-key`):
- Banner info di atas (1x reveal warning).
- Table dengan: Nama+createdAt, Sinode, Prefix (mis. `ecc_AB23xy7K_…`), Scopes chips (3+rest), Last used (relative `5 menit lalu` / `2 hari lalu`), Expires (atau "tanpa expire"; merah kalau lewat), Status.
- Aksi inline per row: toggle aktif/nonaktif (Power icon), Edit (Pencil), Revoke (Trash) dengan ConfirmDelete.
- Modal **Form** (create/edit): pilih Sinode (locked saat edit), nama, scopes (checkbox grid 2 kolom), expire date (opsional).
- Modal **RevealedKeyModal** (hanya setelah create): banner kuning warning, dark code block dengan full key, tombol copy big (turn green on success), tutup pakai tombol "Saya sudah copy, tutup".

**Middleware** (`require-api-key.ts`, existing): consumer pakai `X-API-Key: ecc_<prefix>_<secret>`. Lookup by prefix → bcrypt compare → set `req.apiKey = { id, sinodeId, scopes }`. Update `lastUsedAt`. Block kalau expired atau `isActive=false`.

> **Catatan**: API key middleware `requireApiKey` sudah ready, tapi belum di-apply ke `/api/v1/*` endpoints di codebase ini. Saat membangun mobile endpoint, tinggal `publicRouter.use(requireApiKey)` di prefix yang tepat + cek `req.apiKey.scopes.includes('read:...')`.

### Cabang Rekening (multi rekening per cabang + QRIS)

Setiap cabang punya banyak rekening bank dengan **purpose** berbeda (Persembahan Umum, Pembangunan, Diakonia, Misi, dll). Tiap rekening optional punya QR code (QRIS) untuk transfer cepat.

**Schema** (migration `20260520100000_cabang_rekening`):

```
CabangRekening
  cabangId (FK Cascade)
  purpose          VarChar(255)   # text bebas, FE saran preset
  bankNama
  bankNomor
  bankAtasNama
  qrisImageUrl     # /uploads/content/cabang/qris/{rekeningId}.webp
  catatan          # optional
  isActive
```

Preset purpose di `REKENING_PURPOSE_PRESETS` (shared-types/cabang.ts):
`Persembahan Umum, Persepuluhan, Pembangunan, Diakonia, Misi, Operasional, Pelayanan Anak, Pelayanan Pemuda`. FE pakai `<datalist>` supaya admin dapat auto-complete tapi tetap bisa input bebas.

**Endpoints:**
```
GET    /admin/cabang/:id/rekening                  # list
POST   /admin/cabang/:id/rekening                  # tambah
PATCH  /admin/cabang/:id/rekening/:rekeningId
DELETE /admin/cabang/:id/rekening/:rekeningId      # cascade hapus file QRIS
POST   /admin/cabang/:id/rekening/:rekeningId/qris      # multipart 'foto'
DELETE /admin/cabang/:id/rekening/:rekeningId/qris
```

**UI**: Section "Rekening Bank" di `/dashboard/cabang/[id]` (atas, sebelum filter periode). Grid 2 kolom card per rekening dengan:
- Badge purpose (kuning) + status aktif/nonaktif
- Nama bank, nomor (tombol copy), atas nama, catatan
- QRIS image 80×80 (klik → buka full size); upload/ganti/hapus
- Tombol Edit + Hapus di pojok kanan-atas

Modal form punya input bank/nomor/atas nama + datalist preset purpose + textarea catatan + toggle active. Upload QRIS dilakukan setelah save (butuh ID).

### Dashboard Globe + Cabang Detail Analytics

Dashboard utama (`/dashboard`) sekarang menampilkan **Globe interactive 3D** (via `react-globe.gl` + three.js) yang plot semua cabang gereja sebagai marker. Klik marker → navigate ke detail cabang.

**Schema baru di CabangGereja:**
- `latitude: Float?` + `longitude: Float?` (nullable, koordinat WGS84). Migration `20260519220000_cabang_coordinates` backfill 3 cabang seed (JKT/BDG/SBY) dengan koordinat real.

**Endpoint baru:**
- `GET /admin/cabang/locations` — return cabang dengan koordinat saja (id, nama, kode, lat/lng, sinode, jemaat count). Tanpa pagination — total cabang realistis di bawah 1000.
- `GET /admin/cabang/:id/stats?from=&to=` — KPI cards (jemaat/ibadah/event/homecell), top ibadah & event, time-series harian (Reservasi JOIN + EventParticipation HADIR), homecell breakdown, donut Reservasi status. Default periode 30 hari terakhir.

**UI:**
- `/dashboard` (page baru) — full-bleed globe `bg-black`, auto-rotate, atmosphere amber. Marker tinggi proportional ke jumlah jemaat. Hover → tooltip card kiri-bawah dengan info cabang. Click → `router.push(/dashboard/cabang/:id)`. Globe component di-render via `next/dynamic` dengan `ssr: false` karena butuh WebGL.
- `/dashboard/cabang/[id]` (page baru) — header info cabang + filter periode (date range + preset 7/30/90/365 hari) + 4 KPI cards + LineChart trend + BarChart top ibadah + DonutChart status reservasi + table partisipasi event + BarChart homecell.
- `cabang-config.tsx` (list page) — nama cabang sekarang clickable ke detail dengan icon `BarChart3`.

**Chart components** (`apps/portal/src/components/charts/simple-charts.tsx`, baru):
- `BarChart`, `DonutChart`, `LineChart` — semua custom SVG/CSS, **tanpa library eksternal**. Reusable untuk dashboard page lain.

**Dependencies baru** (perlu `pnpm install` di local):
- `react-globe.gl@^2.27.0` (wraps three-globe)
- `three@^0.160.0`
- `@types/three` (dev)

### Ibadah check-in via kode jemaat + wewenang scan

- Field baru `IbadahPelayananPetugas.canScanAttendance` (boolean, default false) — flag wewenang scan, permissive (lihat sec 4.6).
- Endpoint baru `POST /admin/ibadah/:id/checkin` `{ kode, tanggalIbadah?, force? }`:
  - Authorization: cek user.jemaatId di petugas link tied ibadah tsb dengan canScanAttendance=true → 403 kalau tidak.
  - Validasi tanggal harus jadwal valid (`generateOccurrences`).
  - Cek occurrence ditiadakan → 409 dengan opsi `force=true` untuk override.
  - Lookup jemaat by kode → upsert Reservasi:
    - Existing: update status ke JOIN.
    - Tidak ada: auto-create reservasi dengan status JOIN (walk-in attendance, generate `kode` reservasi unik).
  - Idempotent: kalau sudah JOIN, return `meta.alreadyCheckedIn=true`.
  - `checkedInBy` di-set ke userId scanner (audit trail).
- Komponen reusable baru `apps/portal/src/components/checkin-modal.tsx` — generic scanner modal yang dipakai oleh ibadah dan event. Support `extraBody` (mis. tanggalIbadah) dan `forceTrigger` (custom keyword untuk override).
- UI detail ibadah: header dapat date picker + tombol Check-in. Petugas row punya tombol toggle scan + badge "Scanner". Modal Tambah Petugas tambah toggle Scan/No-scan per row.
- Flow lama (mobile scan kode reservasi via `/api/v1/reservasi/checkin`) tetap berfungsi sebagai backward-compat untuk mobile app yang belum di-update.

### RBAC — Role/SubRole Menu Access

Sebelumnya gate portal pakai boolean `isFulltimer`. Sudah diganti dengan RBAC yang lebih fleksibel di migration `20260519200000_rbac_menu_access`.

**Schema baru:**
- `Role.canAccessPortal` boolean default false. Backfill: `role` bernama "Fulltimer" otomatis di-set true.
- `SubRole.canAccessPortal` boolean nullable — `null = inherit dari Role`, `true/false = override`.
- `RoleMenuAccess (roleId, menuKey, canRead, canWrite, canDelete)` — unique `(roleId, menuKey)`.
- `SubRoleMenuAccess (subRoleId, menuKey, ...)` — sama, tapi override Role-level.

**Menu catalog**: static list di `packages/shared-types/src/schemas/menu-catalog.ts`. 17 menu key (sinode, cabang, jemaat, ibadah, event, role-access, dst). Shared dengan FE/BE.

**Resolve algorithm** (di `apps/core-api/src/lib/menu-access.ts → resolveJemaatAccess`):
1. Ambil semua JemaatRole aktif user → list `(role, subRole)`.
2. Untuk setiap pasang, build map menuKey → levels:
   - Mulai dari `RoleMenuAccess` (Role-level default).
   - Override dengan `SubRoleMenuAccess` untuk menuKey yang sama (SubRole snapshot).
3. Union semua role user: OR per level (canRead/canWrite/canDelete).

**canAccessPortal resolve**: kalau **ANY** role/sub user punya effective `true` → boleh login. SubRole non-null override Role; SubRole null inherit Role.

**Endpoints (di `apps/core-api/src/routes/admin/role.ts`)**:
```
GET   /admin/role/access/matrix           # untuk halaman manage
PATCH /admin/role/:id/access/portal       # body { canAccessPortal: bool }
PATCH /admin/role/sub/:id/access/portal   # body { canAccessPortal: bool|null }
PUT   /admin/role/:id/access/menu         # body { menuKey, canRead?, canWrite?, canDelete? }
PUT   /admin/role/sub/:id/access/menu     # sama, untuk SubRole

GET   /auth/me/access                     # resolved access user current (untuk re-fetch)
```

PUT endpoint upsert; kalau ketiga level false → row dihapus (sparse storage).

**Login response** sekarang sertakan `canAccessPortal` + `menuAccess: ResolvedMenuAccess`. Frontend `auth-store` simpan keduanya di state, persisten via zustand/persist.

**Login gate**: di `/login` page, kalau `auth.user.canAccessPortal === false` → tolak dengan pesan minta admin grant akses.

**Sidebar filter**: setiap menu item punya `menuKey?` optional. Sidebar pakai `hasMenuAccess(user.menuAccess, menuKey, 'read')` untuk filter. Item tanpa menuKey (Dashboard, Profile) selalu visible. Grup yang tidak punya item visible setelah filter — header-nya juga di-hide.

**Halaman manage**: `/dashboard/role-access` (menu group Developer Tools). Card per Role dengan:
- Toggle `canAccessPortal` di header (untuk Role-level).
- Pills SubRole untuk switch context (Role-level default vs override per SubRole).
- Tabel grid menu × levels (Read/Write/Delete) dengan checkbox inline. Auto-enable Read kalau user enable Write/Delete.
- Untuk SubRole context: tombol Ya / Tidak / Inherit untuk `canAccessPortal` override.

**Note pada backend protection**: Sesuai keputusan user, RBAC saat ini **hanya filter UI sidebar**, bukan middleware backend. Setiap user yang login (canAccessPortal=true) bisa hit semua endpoint `/admin/*`. Backend protection per-menu bisa ditambah di iterasi berikutnya (`requireMenuAccess('menuKey', 'write')` middleware).

---

## 26. Mobile App Phase 1 — Response Feedback Tim Mobile (2026-05-21)

Tim mobile (Ari) submit dua dokumen feedback `api-gap-analysis.md` + `backend-meeting-brief.md` yang highlight 12 gap antara spec API dan kebutuhan mobile app. Decisions yang sudah di-konfirmasi (lihat opsi yang user pilih saat AskUserQuestion):

- **Scope kerja**: Plan + implement semuanya termasuk notif & face enroll
- **Family confirmation flow**: Auto-verify (no two-way confirm) — trust-based
- **Push notification**: Defer total — tidak masuk scope sekarang

### Schema baru (migration `20260521100000_mobile_app_phase1`)

```
FamilyRelation
  jemaatAId, jemaatBId (Cascade), role (FamilyRole), isVerified, createdBy
  @@unique([jemaatAId, jemaatBId])

BranchChangeRequest
  jemaatId (Cascade), currentCabangId, targetCabangId, reason
  status (BranchChangeStatus: PENDING/APPROVED/REJECTED)
  reviewedBy, reviewedAt, reviewNote

Jemaat extension:
  primaryGuardianId (FK self, SetNull)        # untuk dependent tanpa noHp
  registeredViaJemaatId (FK self, SetNull)    # audit self-onboarding
```

Enum baru: `family_role` (SPOUSE/CHILD/PARENT/SIBLING), `branch_change_status` (PENDING/APPROVED/REJECTED).

`noHp` di Jemaat memang sudah nullable di schema sebelumnya, jadi tidak perlu ALTER COLUMN. Yang ditambah cuma 2 FK kolom self-referencing untuk audit dependent + self-onboarding.

### Endpoint baru — 20 endpoint

**Self-registration (M1):**
- `POST /auth/register` — register jemaat baru pasca-OTP verify (`purpose=ENROLLMENT`). Anti-abuse: rate limit `registerLimiter` 3/jam/IP. Auto-assign role default "Jemaat:Jemaat Tetap" jika seed tersedia. Issue access+refresh token langsung. Optional foto base64 di body.
- `POST /auth/otp/request` di-update: untuk `purpose=ENROLLMENT`, BE tidak require jemaat existing (validate justru nomor BELUM terdaftar).

**Self-service mobile `/admin/me/*`** (router baru `apps/core-api/src/routes/admin/me.ts`):
- `GET /admin/me` — full profile (Jemaat + cabang + roles + homecells + user)
- `PATCH /admin/me` — edit subset (nama/email/tanggalLahir/jenisKelamin/alamat). noHp & cabangId TIDAK boleh — pakai OTP & branch-change.
- `POST /admin/me/foto` — upload foto profile (multipart `foto`, max 5MB, resize ke 1024px)
- `GET /admin/me/stats` — streakWeeks (52w window), attendedThisYear, eventsJoined, homecellsActive, totalAttended. Streak calc: ISO week dengan toleransi 1 minggu kosong di awal.
- `GET /admin/me/scanner-events` — event di mana user `canScanAttendance=true` (filter `butuhKehadiran=true`)
- `GET /admin/me/scanner-ibadah` — ibadah di mana user `canScanAttendance=true` (dedupe by ibadahId)
- `GET /admin/me/homecell-managed` — homecell yang user-nya PIC
- `GET /admin/me/homecell-area-managed` — area yang user-nya PIC

**Family management (M5)** — semua di `/admin/me/family/*`:
- `GET /admin/me/family` — list family dengan `isDependent: bool` (true kalau primaryGuardianId = user current)
- `POST /admin/me/family/link-by-kode` — link via QR scan kode
- `POST /admin/me/family/link-by-phone` — link via no HP
- `POST /admin/me/family/register-new` — register jemaat baru + auto-link. Kalau `noHp=null` → dependent (primaryGuardianId=user).
- `PATCH /admin/me/family/:jemaatId` — update role relasi
- `DELETE /admin/me/family/:jemaatId` — unlink, hapus 2 arah (A→B + B→A)

Reciprocal pair: CHILD ⇄ PARENT, SPOUSE ⇄ SPOUSE, SIBLING ⇄ SIBLING. Helper `upsertFamilyLink()` + `reciprocalRole()` di `me.ts`.

**Branch change request (M6)**:
- `POST /admin/me/branch-change-request` — submit pindah cabang. Max 1 PENDING per jemaat (409 kalau duplicate).
- `GET /admin/me/branch-change-requests` — riwayat user
- `GET /admin/branch-change-request` — admin queue (paginated, filter status/cabangId), router baru `branch-change.ts`
- `GET /admin/branch-change-request/:id` — detail
- `POST /admin/branch-change-request/:id/review` — approve/reject. Saat APPROVED, transaksi update `Jemaat.cabangId` ke targetCabangId.

**Event batch (M3)**:
- `POST /admin/event/:id/peserta/batch` — daftar multi-jemaat (max 20 per request). Partial success: response `{ successful: Participation[], failed: { jemaatId, error: { code, message } }[] }`. Codes: QUOTA_FULL / DUPLICATE / NOT_FOUND / INTERNAL.

**Stats kehadiran (M7)**:
- `GET /admin/event/:id/checkin/stats` — total, hadir, byStatus, quotaPeserta, lastUpdated
- `GET /admin/ibadah/:id/checkin/stats?tanggalIbadah=` — reserved, joined, cancelled, total, lastUpdated (default today)

**Homecell (M9)**:
- `POST /admin/homecell/:id/members/by-kode` — tambah member via QR scan kode (vs endpoint lama by jemaatId)

**Face enrollment (M11)**: `POST /auth/face/enroll` sudah ada sejak iterasi sebelumnya — di section ini diperjelas ke mobile team via api guide.

### Decisions yang masuk doc/changelog

| Item | Decision | Lokasi |
|---|---|---|
| Self-registration | Auto-active, anti-abuse via rate limit | mobile-api-guide section 12.1 |
| Family confirmation | Auto-verify (trust-based) | mobile-api-guide section 13 + me.ts comment |
| Push notification | Defer total — mobile pakai local notif | mobile-app-reference section 18 |
| Bilingual content | UI translated, konten Indonesia | mobile-app-reference section 13 |
| Streak source | Endpoint dedicated `/admin/me/stats` | mobile-api-guide section 12.3 |
| Bookmark | Local AsyncStorage di mobile, no BE | mobile-app-reference section 4 |

### Yang ditunda Phase 2+

- Push notification infrastructure: `DeviceToken` model + `Notification` model + FCM/APNS sender service.
- WA confirmation flow untuk family link (kolom `isVerified` sudah ready di schema).
- Branch change SLA + notifikasi otomatis ke jemaat saat status berubah.
- WebSocket realtime untuk scanner stats (current pakai polling 10-15s).

### Update di docs

- `docs/mobile-api-guide.md` → tambah section 12-15 (Phase 1 endpoints), update section 16 (Rate Limits) untuk include `/auth/register`, tambah section 19 (Gap Status table).
- `docs/mobile-app-reference.md` → update section 18 (Decisions sudah/belum), tambah section 20 (Phase 1 Implementation Status), bump version ke 1.1.
- OpenAPI spec (`apps/core-api/src/openapi.ts`) → register ~20 path baru di tag "Me", "Family", "Admin · Branch Change", + extend existing tags.

### File baru

- `packages/database/prisma/migrations/20260521100000_mobile_app_phase1/migration.sql`
- `packages/shared-types/src/schemas/family.ts`
- `packages/shared-types/src/schemas/branch-change.ts`
- `apps/core-api/src/routes/admin/me.ts` (~640 lines)
- `apps/core-api/src/routes/admin/branch-change.ts` (~145 lines)

### File edit

- `packages/database/prisma/schema.prisma` — tambah `FamilyRelation`, `BranchChangeRequest`, 2 enum, extend Jemaat dengan 2 FK kolom + relations
- `packages/shared-types/src/schemas/auth.ts` — `registerJemaatSchema`, `selfEditJemaatSchema`
- `packages/shared-types/src/schemas/event.ts` — `batchRegisterEventParticipationSchema`
- `packages/shared-types/src/index.ts` — export family + branch-change
- `apps/core-api/src/routes/auth.ts` — `POST /auth/register` + adjust `/otp/request` untuk ENROLLMENT
- `apps/core-api/src/routes/admin/index.ts` — mount `/me` + `/branch-change-request`
- `apps/core-api/src/routes/admin/event.ts` — `/peserta/batch` + `/checkin/stats`
- `apps/core-api/src/routes/admin/ibadah.ts` — `/checkin/stats`
- `apps/core-api/src/routes/admin/homecell.ts` — `/members/by-kode`
- `apps/core-api/src/middleware/rate-limit.ts` — `registerLimiter`
- `apps/core-api/src/openapi.ts` — register paths baru

### Caveat untuk maintainer

1. **Prisma generate diperlukan**: schema baru → user harus run `pnpm db:generate` di local. Sandbox tidak bisa fetch Prisma binary (403). Typecheck errors `Property 'familyRelation' does not exist on PrismaClient` akan resolve setelah generate.

2. **Migration belum di-apply**: file SQL ready, tapi user harus `pnpm db:migrate dev` (atau prod) untuk apply ke DB.

3. **Default role "Jemaat:Jemaat Tetap" assumption**: `/auth/register` cek role+subrole by nama. Kalau seed tidak ada keduanya, jemaat di-create tanpa role assignment (perlu admin assign manual). Pastikan seed punya pasangan ini sebelum mobile go-live.

4. **OTP verify flow untuk ENROLLMENT**: current implementation tidak return user data di response verify ENROLLMENT (karena jemaat belum ada). Mobile harus chain ke `/auth/register` immediately after verify. Marker `pendingRegistration: true` bisa ditambah di response future.

5. **Audit trail dependent**: jemaat dengan `primaryGuardianId` non-null berarti dependent. Portal admin perlu UX untuk lihat / manage list dependent jemaat. Untuk sekarang tampil di jemaat list seperti biasa.

### Decision 2026-05-21 — Alkitab content: Opsi B (bundle JSON) dengan TB + NKJV

**Update**: pengganti entry "Deferred — Alkitab content" sebelumnya. Product owner decide pakai **Opsi B (bundle JSON di mobile asset)** dengan versi **TB (Terjemahan Baru, LAI)** + **NKJV (New King James Version, Thomas Nelson)**. Sumber data dari ekosistem **yukuku/androidbible**.

**Implikasi BE**:
- **Tidak ada content endpoint** — semua content di mobile bundle, tidak di-host BE
- **Tidak butuh seed data Alkitab di Postgres ECC**
- **Mobile fully offline-capable** untuk read

**⚠ Licensing flag yang BE catat** (di response doc):
- **TB**: LAI copyright. Yukuku host di api.alkitab.app — kemungkinan punya arrangement spesifik dengan LAI, tidak otomatis transferable
- **NKJV**: Thomas Nelson copyright, **highly restrictive**. Default lisensi cuma allow personal use + 500 ayat max quote untuk non-commercial publication. Bundle full di app gereja Indonesia tanpa lisensi eksplisit = high risk
- BE rekomendasi: **verify lisensi dengan LAI + Thomas Nelson** sebelum mobile ship bundle, atau switch ke AYT (CC BY-SA) + WEB/KJV (public domain) yang license clean

Status legal: **blocking** sebelum mobile mulai bundle. BE tidak block code, cuma flag risk untuk awareness product/legal team.

**Optional BE work yang tetap useful** (decision delayed, bisa di-add saat mobile launch Alkitab):
- `GET /admin/alkitab/verse-of-day` — server-curated reference (versionCode + bookId + bab + ayat). Mobile lookup teks dari local bundle. Tidak butuh content di BE.
- `/admin/me/bible-bookmarks` (CRUD) — server-side bookmark sync cross-device. Simpan reference saja, bukan teks. No licensing concern.

Total BE effort kalau implement optional: **~1 hari sprint**.

**File berubah**:
- `ecc-mobile-app/docs/backend-request-bible-content.md` — status DECIDED + Decision & Implementation Plan section lengkap (licensing flag, sumber data options, JSON format, mobile loader pattern, action items)
- `knowledge-base.md` — entry ini

**Code BE belum berubah** — entry ini documentation only. Optional verse-of-day + bookmark sync di-implement nanti kalau product approve.

### Deferred 2026-05-21 — Push notification infrastructure (NO CODE)

**Request mobile**: `ecc-mobile-app/docs/backend-request-bible-content.md`.

Mobile saat ini ship dengan **Opsi C** (sample-only, ~17 pasal populer di-bundle). Mau jump ke Opsi A (BE host full TB LAI + API) atau Opsi B (bundle full di asset), tapi **gate utamanya legal/licensing TB LAI** — bukan engineering. BE bisa serve content kapan saja kalau sumber data clear.

**BE analysis ditulis lengkap di response section file mobile docs**. Highlights:

| Opsi | BE verdict |
|---|---|
| A. BE host + 4 endpoint | ~5 hari sprint, butuh seed data + license LAI clear |
| B. Bundle di mobile asset | BE effort ~0, mobile 1-2 hari, license issue tetap ada |
| C. Sample-only (current) | Already shipped, zero risk |

**Alternative versi** (kalau LAI restrict): **AYT** (Alkitab Yang Terbuka, CC BY-SA — paling permissive), BIS, MILT, WBTC.

**BE recommendation — phased**:

1. **Now (Q3 2026 launch)**: tetap Opsi C, tapi interim improvement tanpa licensing risk:
   - Expand sample 17 → 50 pasal populer (mobile, 1 hari)
   - Endpoint `GET /alkitab/verse-of-day` server-curated dari pool sample (BE, 0.5 hari)
   - Endpoint bookmark sync `/admin/me/bible-bookmarks` simpan reference saja, tidak content (BE, 0.5 hari)
2. **Phase 2 (post legal clear)**: implement Opsi A atau B sesuai keputusan

**Questions untuk product owner + legal team** (di response doc):
1. Kontak resmi LAI?
2. ECC OK pakai AYT sebagai alternatif?
3. Alkitab high priority (differentiator) atau secondary?
4. Budget legal admin?
5. Timeline target?

**Triggers un-defer**: legal clear LAI / decide AYT / concrete user feedback frequent / Q4 milestone review.

**Code belum di-implement** — KB di-update lagi setelah product+legal approve direction + actual implementation.

### Deferred 2026-05-21 — Push notification infrastructure (NO CODE)

**Request mobile**: `ecc-mobile-app/docs/backend-request-push-notification.md` (Priority MEDIUM).

Mobile submit spec lengkap push notif (Expo Push API + Device/Notification table + 4 endpoints + 8 scenarios). **BE status: 🔵 DEFERRED** sesuai decision product 2026-05-21 yang sebelumnya di-confirm di response Mobile Phase 1.

**BE analysis ditulis lengkap di response section file mobile docs**. Ringkasan:

- Spec mobile sudah excellent + siap implement kalau go-ahead nanti
- BE setuju dengan: Expo Push API provider awal, Device + Notification table architecture, 4 endpoint shape, 8 scenarios priority
- BE refine beberapa hal:
  - Token format multi-provider (Expo/FCM/APNS) via `provider` column
  - Notification idempotency via composite key `(jemaatId, category, sourceType, sourceId)`
  - Quiet hours default 22:00-06:00 untuk non-urgent
  - Broadcast rate limit 1/hari/cabang
  - Coordination dengan WhatsApp broadcast (jangan duplicate channel)
  - Delivery report defer ke v2

**Triggers untuk reconsider implement** (kapan un-defer):
1. Retention D7 < 30% post-launch
2. Event registration < 20% target
3. Renungan readership < 5%
4. Product owner approve event campaign besar
5. 6 bulan post-launch milestone re-evaluation

**Estimate kalau implement nanti**: ~7 hari BE sprint.

**Code belum di-implement** — masih DEFERRED. KB akan di-update lagi setelah product re-approve + actual implementation.

### Patch 2026-05-22a — Mobile batch #5: jam event, direct branch change, ministry, jemaat-public, profile-edit

5 request paralel dari mobile (24 jam terakhir), di-batch karena scope kecil-medium dan saling independent. Di-implement dengan default rekomendasi BE setelah diskusi.

#### #2 Event time fields — `jamMulai`/`jamSelesai` separate (Option B)

**Request mobile**: `backend-request-event-time-fields.md`. Sebelumnya `Event.tanggalMulai DateTime` sudah include jam (no `@db.Date`) tapi admin portal cuma input `type="date"` → effective T00:00:00. Mobile prefer Option B (separate fields, konsisten dengan `Ibadah`).

Implementasi:
- Migration `20260522010000_event_jam_fields` — ADD COLUMN `jam_mulai`, `jam_selesai` VARCHAR(5) NULL
- `schema.prisma Event` — tambah `jamMulai`/`jamSelesai` `String?` `@db.VarChar(5)`
- `shared-types/event.ts` — `createEventSchema`/`updateEventSchema` accept `jamMulai`/`jamSelesai` regex `HH:mm`
- `routes/admin/event.ts` — POST/PATCH propagate jam fields (default null)
- `portal/event-form-modal.tsx` — 2 time inputs (`type="time"`) di Section "Waktu & Lokasi"

Backward compat: existing events (jam = NULL) → mobile fallback parse ISO dari `tanggalMulai` (helper existing). Kalau jam NULL → date-only event, hide row jam.

#### #5 Direct branch change — extend PATCH /admin/me

**Request mobile**: `backend-request-direct-branch-change.md`. UX simplification: trust-based langsung pindah tanpa approval admin.

Implementasi:
- `selfEditJemaatSchema` — tambah `cabangId: uuidSchema.optional()`
- PATCH /admin/me handler — kalau `cabangId` beda dari before, validate exists+active, update via `cabang.connect`
- Separate audit row `resource: 'jemaat_cabang'` untuk traceability (sisanya bundled di self-edit audit)
- Branch change request flow (`POST /admin/me/branch-change-request`) **tetap** untuk backward compat — mobile bisa hapus tombol "ajukan" tapi BE endpoint tetap supaya tidak break admin portal queue

#### #1 Ministry endpoints — leverage existing Pelayanan schema

**Request mobile**: `backend-request-ministry-endpoints.md`. Mobile asumsi perlu table baru `Ministry` + `MinistryMembership` — **tidak perlu**: schema sudah punya `Pelayanan` + `PelayananRole` + `JemaatPelayanan` junction.

Implementasi:
- `GET /admin/me` — extend dengan `ministries: Array<{ id, pelayananId, nama, deskripsi, posisi, posisiLevel, tanggalMulai }>` derived dari `jemaatPelayanan` where `isActive`
- New route `apps/core-api/src/routes/admin/ministry.ts`:
  - `GET /admin/ministry` — list semua Pelayanan + memberCount + leader proxy (member dengan role level tertinggi)
  - `GET /admin/ministry/:id` — detail + members + myMembership flag
- Wired di admin/index.ts sebagai `/ministry`

Note: Mobile asumsi "ministry biasanya cabang-specific" — schema actually global. Skip `?cabangId` filter untuk MVP. Leader tidak ada di schema explicit — derive dari highest level JemaatPelayanan.

#### #3 Jemaat public profile — tiered visibility

**Request mobile**: `backend-request-jemaat-public-profile.md`. Mobile suggest Opsi (d) tiered. Pakai pendekatan **hybrid**: Public fields (id/nama/foto/cabang/roles/ministries/homecell) selalu visible untuk authenticated user; sensitive fields (noHp full, DOB tahun, alamat, family) hanya untuk "close relation" (same-cabang ATAU family-linked ATAU homecell co-member).

Implementasi:
- New route `apps/core-api/src/routes/admin/jemaat-public.ts` — `GET /admin/jemaat-public/:id`
- Endpoint TIDAK overlap dengan existing `/admin/jemaat/:id` (admin CRUD untuk fulltimer)
- Helper: `maskNoHp()`, `birthMonthDay()` — selalu emit `noHpMasked` + `ulangTahunBulanTgl` even untuk public-only
- Response include `visibility: { isCloseRelation, reason }` untuk mobile UI hint

**Penting untuk mobile**: path baru `/admin/jemaat-public/:id`, **bukan** `/admin/jemaat/:id` (existing admin CRUD route).

#### #4 Profile edit completeness — kode self-heal + dependent edit/foto

**Request mobile**: `backend-request-profile-edit-completeness.md`.

Issue 1 (kode kosong): **self-heal** di `GET /admin/me` handler. Kalau `jemaat.kode === null`, generate via `generateUniqueKode()` + persist. Idempotent, no admin intervention needed. Backfill ad-hoc tidak perlu — endpoint heal saat user pertama buka profile.

Issue 2 (foto dependent): `POST /admin/me/family/:jemaatId/foto` — flexImageUpload + saveProfilePhoto. Auth: target harus dependent (`noHp IS NULL`) DAN `primaryGuardianId === currentJemaatId`.

Issue 3 (PATCH dependent): `PATCH /admin/me/family/:jemaatId/profile` — schema baru `editDependentJemaatSchema` (nama, DOB, JK, alamat). Same auth check. Path explicit `/profile` supaya tidak conflict dengan existing `PATCH /admin/me/family/:jemaatId` (yang update FamilyRelation.role).

Helper `assertDependentGuardian(currentId, targetId)` consolidate auth check (DRY untuk 2 endpoint).

**File berubah** (mostly batch):
- `packages/database/prisma/schema.prisma` — Event.jamMulai/jamSelesai
- `packages/database/prisma/migrations/20260522010000_event_jam_fields/migration.sql`
- `packages/shared-types/src/schemas/event.ts` — jam fields di create/update
- `packages/shared-types/src/schemas/auth.ts` — selfEdit cabangId + editDependentJemaatSchema baru
- `apps/core-api/src/routes/admin/me.ts` — PATCH cabangId, ministries di GET, kode self-heal, dependent foto + profile endpoints
- `apps/core-api/src/routes/admin/event.ts` — jam fields propagate
- `apps/core-api/src/routes/admin/ministry.ts` — NEW
- `apps/core-api/src/routes/admin/jemaat-public.ts` — NEW
- `apps/core-api/src/routes/admin/index.ts` — wire 2 new routers
- `apps/portal/src/components/event/event-form-modal.tsx` — time inputs

**User perlu run**:
- `pnpm db:migrate dev` (apply migration 20260522010000)
- `pnpm db:generate` (regen Prisma client untuk jamMulai/jamSelesai)
- `pnpm dev` restart core-api + portal

**Mobile docs** — Backend Response di-append ke 5 file mobile request (semuanya RESOLVED).

### Patch 2026-05-21s — Face Recognition V2 dim correction: 192 → 128

**Request mobile**: `ecc-mobile-app/docs/backend-request-face-recognition-v2-mobilefacenet-dim-correction.md` (Priority HIGH, blocking M13 face login launch).

**Background**: setelah mobile convert `sirius-ai/MobileFaceNet_TF` `.pb` → `.tflite`, verify actual output dim via flatbuffer inspect — **128**, bukan 192. Source-of-truth:
- `MobileFaceNet_Arch.txt` baris terakhir: `Logits:[None, 128]`
- TFLite tensor `embeddings` shape `[1, 128]` (adjacent in binary to tensor name = strong evidence ini output utama)
- Cross-check dengan model 4.9MB consistent dengan 128-dim variant

Initial estimate 192 di Q2 patch r based on "typical MobileFaceNet" assumption — turn out variant yang dipilih 128-dim.

**Perubahan BE (trivial)**:

1. **`packages/auth/src/face.ts`** — `FACE_DESCRIPTOR_DIM = 128` (was 192). Comments updated.

2. **`packages/shared-types/src/schemas/auth.ts`** — `faceDescriptorSchema.length(128)` + message "harus 128 dimensi". Updated enrollment doc comment + openapi example modelVersion default.

3. **`apps/core-api/src/routes/auth.ts`** — error message "Descriptor tidak valid (harus 128-dim, semua finite)" (3 occurrences). Header comment patch line added.

4. **`docs/mobile-api-guide.md`** section 1.4 — semua mention "192" → "128", note tambahan: dim kebetulan sama dengan legacy face-api.js (128) tapi disambiguate **wajib** via `modelVersion` (descriptor space berbeda total).

**Yang tidak berubah**:
- `mobilefacenet-v1` constant tetap valid — cuma dim assumption yang revised, bukan model identity
- Cosine similarity algorithm sama persis (dim-agnostic)
- Migration `20260521180000` sudah wipe semua legacy data, no new migration needed (Json column flexible length)
- Threshold 0.5 default tetap (cosine dim-independent dalam range yang sama untuk normalized descriptor)

**Coincidence trap**: dim **kebetulan sama** dengan face-api.js legacy (128). **JANGAN** compare langsung antar descriptor — model space berbeda. Gunakan `face_model_version` field untuk gating: tolak `FACE_MODEL_MISMATCH` kalau stored != `mobilefacenet-v1`.

**File berubah**:
- `packages/auth/src/face.ts`
- `packages/shared-types/src/schemas/auth.ts`
- `apps/core-api/src/routes/auth.ts`
- `docs/mobile-api-guide.md`
- `ecc-mobile-app/docs/backend-request-face-recognition-v2-mobilefacenet-dim-correction.md` — RESOLVED

**User perlu run**: `pnpm db:generate` tidak perlu (no schema change). Cuma `pnpm dev` restart.

### Patch 2026-05-21r — Face Recognition V2: switch ke MobileFaceNet (cosine similarity)

**Request mobile**: `ecc-mobile-app/docs/backend-request-face-recognition-v2-mobilefacenet.md` (Priority HIGH, supersedes v1 face-api.js choice).

**Background**: setelah pilot test, face-api.js + TFJS WebGL via WebView di RN ternyata **terlalu lambat** untuk production — detection hang >60s. Mobile pivot ke native TFLite (`react-native-fast-tflite`) + MobileFaceNet model. Konsekuensi: descriptor format berubah dari 128-dim FaceNet ke 192-dim MobileFaceNet, distance metric Euclidean → Cosine.

**Penting**: BE **tidak perlu inference stack** (Q6 di request bisa di-skip). Server cuma compute cosine similarity antar 2 descriptor (pure math, ~10 lines TypeScript). Tidak butuh TFLite/ONNX/Python di BE.

**Perubahan BE**:

1. **`packages/auth/src/face.ts`** — rewrite:
   - `FACE_DESCRIPTOR_DIM = 192` (export)
   - `cosineSimilarity(a, b)` baru (replace `euclideanDistance` sebagai primary)
   - `matchFace()` return `{ match, similarity, threshold }` (was `{ match, distance, threshold }`)
   - `isValidDescriptor()` validate length === 192 (was 128)
   - `euclideanDistance()` masih di-export tapi `@deprecated` (untuk audit historical)
   - `FACE_MATCH_THRESHOLD` env default 0.5 (cosine, higher = stricter)

2. **`packages/shared-types/src/schemas/auth.ts`**:
   - `faceDescriptorSchema` length 192 (was 128)

3. **`apps/core-api/src/routes/auth.ts`** — handlers:
   - `POST /auth/face/login` — confidence = cosine similarity directly. Reject stored modelVersion `!= 'mobilefacenet-v1'` dengan `FACE_MODEL_MISMATCH` (force re-enroll).
   - `POST /auth/face/enroll` + `PUT /auth/me/face-profile` — default modelVersion `mobilefacenet-v1` (was `facenet-v1`)
   - `GET /auth/me/face-profile` — default modelVersion `mobilefacenet-v1` di response

4. **Migration `20260521180000_face_v2_mobilefacenet`**:
   - `UPDATE user SET face_descriptor = NULL, face_enrolled_at = NULL, face_model_version = NULL, face_metadata = NULL WHERE face_model_version IS DISTINCT FROM 'mobilefacenet-v1'`
   - Effective no-op di production (semua enroll attempts hit timeout di pilot, no actual data)
   - Safety untuk dev environment yang mungkin punya test data 128-dim

**Decisions dari 10 technical questions** (di response doc):

| Question | Answer |
|---|---|
| Q1 model identity | MobileFaceNet TFLite dari serengil/deepface atau sirius-ai/MobileFaceNet_TF |
| Q2 embedding dim | **192** *(corrected to 128 di patch 21s setelah mobile flatbuffer inspect — variant ini 128-dim, lihat patch berikutnya)* |
| Q3 distance metric | **Cosine similarity** |
| Q4 migration data | Wipe via migration — no actual user enrolled |
| Q5 modelVersion | `mobilefacenet-v1` (existing `FACE_MODEL_MISMATCH` error code) |
| Q6 BE inference stack | **None** — BE just compute cosine, no model run di server |
| Q7 storage format | JSON column existing (cukup) |
| Q8 pgvector | Defer (linear scan cukup untuk MVP) |
| Q9 threshold | 0.5 default cosine, tune setelah pilot data |
| Q10 liveness | Client-side (sama dengan v1, no BE change) |

**Notable change** vs v1 patch:
- v1 (patch q): confidence = `1 - distance / threshold` (Euclidean inversion)
- v2 (patch r): confidence = cosine similarity directly (already 0..1)

**Threshold logic flip**: Euclidean lower=better → Cosine higher=better. `matchFace.match` sekarang `similarity >= threshold` (was `distance < threshold`).

**File berubah**:
- `packages/auth/src/face.ts` — full rewrite untuk cosine
- `packages/shared-types/src/schemas/auth.ts` — dim 128 → 192
- `apps/core-api/src/routes/auth.ts` — match logic + model version defaults
- `packages/database/prisma/migrations/20260521180000_face_v2_mobilefacenet/migration.sql` — wipe legacy
- `docs/mobile-api-guide.md` — section 1.4 updated
- `ecc-mobile-app/docs/backend-request-face-recognition-v2-mobilefacenet.md` — RESOLVED + Backend Response

**User perlu run**:
- `pnpm db:migrate dev` (apply migration)
- `pnpm db:generate` (Prisma client OK karena tidak ubah schema, cuma data)
- `pnpm dev` restart

### Patch 2026-05-21q — Face Recognition: RESTful endpoints + modelVersion + standardized errors

**Request mobile**: `ecc-mobile-app/docs/backend-request-face-recognition.md` (Priority MEDIUM, M11 + future smart system data prerequisite).

Mobile butuh face recognition system yang lebih lengkap dari basic existing (login/enroll/reset). Plus future-proof untuk smart system (lobby auto check-in, family clustering).

**Existing yang sudah ada** (BE side):
- `POST /auth/face/login` — login via descriptor
- `POST /auth/face/enroll` — enroll
- `POST /auth/face/reset` — clear descriptor
- `User.faceDescriptor` (Json) + `faceEnrolledAt`
- `matchFace()` + `isValidDescriptor()` helper di @ecc/auth
- 128-dim FaceNet-style descriptor (face-api.js compatible)
- Euclidean distance, threshold 0.5

**Yang ditambah/diperbaiki di patch ini**:

**Schema** (migration `20260521170000_face_metadata`):
- `User.faceModelVersion` VARCHAR(32) — untuk future model migration (default `facenet-v1`)
- `User.faceMetadata` JSONB — audit info (platform, deviceModel, appVersion, consentVersion)

**Endpoint baru (RESTful)**:
- `GET /auth/me/face-profile` — status enrollment
- `PUT /auth/me/face-profile` — re-enroll (replace existing)
- `DELETE /auth/me/face-profile` — hapus data wajah (PDP Law right-to-delete)

**Updates ke endpoint existing**:
- `POST /auth/face/enroll` — sekarang tolak 409 `FACE_ALREADY_ENROLLED` kalau sudah ada (force PUT untuk re-enroll). Accept `modelVersion` + `metadata` di body. Response 201 (sebelumnya 200).
- `POST /auth/face/login` — return `confidence` field (0..1, normalized dari `1 - distance/threshold`). Standardized error codes: `FACE_NOT_ENROLLED` (401), `FACE_NO_MATCH` (401), `FACE_MODEL_MISMATCH` (409), `FACE_INVALID_DESCRIPTOR` (422). Accept `modelVersion` di body.
- `POST /auth/face/reset` — legacy, masih jalan (alias ke DELETE /me/face-profile).

**BE design decisions** (didokumentasikan di response doc — 20 technical questions dijawab):

| Decision | Pilihan BE |
|---|---|
| ML library | face-api.js compatible (128-dim FaceNet). Mobile bebas pilih library yang produce 128-dim descriptor compatible |
| Embedding dim | **128** (existing) |
| Distance metric | **Euclidean** (existing) |
| Threshold default | **0.5** (env override `FACE_MATCH_THRESHOLD`) |
| Single profile per user | Yes — 1 jemaat 1 descriptor. Re-enroll via PUT replace |
| Storage format | Json column existing (cukup untuk N < 50k). pgvector defer |
| Encryption at rest | Volume-level cukup MVP, column-level kalau audit Kominfo request |
| Retention | DELETE endpoint untuk PDP right-to-delete. Auto-purge kalau jemaat archive defer |
| Liveness | Server skip — client-side challenge (mobile responsibility). MVP accept risk |
| Twin/family false positive | Tingkatkan threshold ke 0.45 + secondary noHp hint (existing flow sudah pakai noHp) |
| Smart system endpoint | Defer — design saat go-live |
| Re-enrollment | PUT /me/face-profile, replace existing |
| Rate limit | Pakai existing `authVerifyLimiter` (10/15min/IP). Per-phone limit defer |
| PDP compliance | Mobile track `consentVersion` di metadata. Legal: register DPA ke Kominfo (out of BE scope) |

**Helper baru** di auth.ts:
- `resetFaceProfile(req)` — shared function untuk hapus face data + audit. Dipakai oleh POST `/face/reset` + DELETE `/me/face-profile`.

**Confidence calculation**:
```typescript
const confidence = Math.max(0, Math.min(1, 1 - distance / threshold));
// distance < threshold → confidence > 0. distance = 0 → confidence = 1.
```

**File berubah**:
- `packages/database/prisma/schema.prisma` — User extension
- `packages/database/prisma/migrations/20260521170000_face_metadata/migration.sql` — add 2 column
- `packages/shared-types/src/schemas/auth.ts` — faceLoginSchema + faceEnrollmentSchema extended
- `apps/core-api/src/routes/auth.ts` — 3 endpoint baru + 3 endpoint existing diperbaiki + helper
- `apps/core-api/src/openapi.ts` — tag baru "Auth · Face Recognition" + 6 path
- `docs/mobile-api-guide.md` — section 1.4 expanded (5 sub-section) + Gap Status table
- `ecc-mobile-app/docs/backend-request-face-recognition.md` — RESOLVED + Backend Response dengan 20 answers

**User perlu run**:
- `pnpm db:generate` — Prisma client recognize `faceModelVersion` + `faceMetadata`
- `pnpm db:migrate dev` — apply migration

**Smart system future** (out of scope patch ini): saat go-live, BE tambah `POST /api/v1/identify` (atau `/smart/identify`) yang accept descriptor, return nearest neighbor + confidence. Schema sekarang sudah ready (model version + metadata audit).

### Patch 2026-05-21p — Homecell M9: extend detail + soft-remove + list per area

**Request mobile**: `ecc-mobile-app/docs/backend-request-homecell-detail.md` (Priority MEDIUM).

3 endpoint untuk PIC homecell / PIC area flow di mobile. Sebagian existing tapi belum match spec mobile.

**Change 1**: `GET /admin/homecell/:id` (existing) — **extended** select fields di nested `members[].jemaat`. Tambah `kode` + `jenisKelamin`. Plus `area.picJemaatId` di-expose supaya mobile bisa check apakah user adalah PIC area parent (untuk authorization).

**Change 2** (NEW): `DELETE /admin/homecell/:id/members/by-jemaat/:jemaatId` — soft remove via jemaatId. Set `isActive=false` + `tanggalKeluar`. Idempotent (sudah dikeluarkan → 200 + `meta.alreadyRemoved=true`). Berbeda dengan existing `DELETE /:memberId` yang hard delete (untuk admin portal).

**Change 3** (NEW): `GET /admin/homecell-area/:id/homecells` — list semua homecell di area itu (filter `isActive=true`). Shape ringkas: id, nama, alamat, hari, jam, picJemaat, memberCount. Mobile PIC area pakai untuk tampil semua homecell, termasuk yang user-nya bukan PIC homecell-nya (vs `useManagedHomecells` yang filter by user PIC).

**Authorization**: saat ini permissive (semua user lewat `/admin/*` di-allow, sama dengan endpoint admin lain). RBAC strict via menu access middleware bisa di-add nanti.

**Route ordering** di `homecell-area.ts`: `GET /:id/homecells` di-register SEBELUM `GET /:id` (2-segment lebih spesifik). Express matches by segment count, jadi sebenarnya tidak conflict, tapi konvensi codebase tetap di-keep.

**File berubah**:
- `apps/core-api/src/routes/admin/homecell.ts` — extend detail select + DELETE /by-jemaat
- `apps/core-api/src/routes/admin/homecell-area.ts` — GET /:id/homecells
- `apps/core-api/src/openapi.ts` — register 2 path baru + update detail description
- `docs/mobile-api-guide.md` — section 12.6 Homecell Self-Service expanded
- `ecc-mobile-app/docs/backend-request-homecell-detail.md` — RESOLVED

### Patch 2026-05-21o — Bug fix: donation endpoint crash P2023 saat pakai slug

**Bug** (lapor 2026-05-21 dari mobile):

```
POST /admin/event/penggalangan-dana-pembangunan-2026/donations → P2023
"Error creating UUID, invalid character... found 'p' at 1"
```

**Root cause**: 7 donation handler (POST/GET/PATCH/DELETE/bukti/approve list+me) pakai `prisma.event.findUnique({ where: { id: req.params.id } })` — assume `:id` adalah UUID. Mobile pakai slug → Postgres throw P2023 (invalid UUID syntax).

Pattern identical dengan patch 2026-05-21e (event detail by slug crash) — saat itu fix-nya pakai `idOrSlugWhere()` helper. Donation handlers belum di-cover karena baru ditambah di patch 2026-05-21l.

**Fix**: helper baru `resolveEventByIdOrSlug(idOrSlug)` di `event.ts`:

```typescript
async function resolveEventByIdOrSlug(idOrSlug: string) {
  const event = await prisma.event.findFirst({ where: idOrSlugWhere(idOrSlug) });
  if (!event) throw NotFound('Event tidak ditemukan');
  return event;
}
```

Pakai `prisma.event.findFirst` (bukan `findUnique`) supaya bisa pass OR filter ke `idOrSlugWhere()`. Postgres aman karena helper sudah skip `id` predicate kalau key bukan UUID format.

**Apply ke 7 donation handler**:
- `GET    /:id/donations`
- `GET    /:id/donations/me`
- `POST   /:id/donations`
- `GET    /:id/donations/:donationId`
- `PATCH  /:id/donations/:donationId`
- `POST   /:id/donations/:donationId/bukti`
- `POST   /:id/donations/:donationId/approve`
- `DELETE /:id/donations/:donationId`

Untuk handler yang punya nested check `participation.eventId !== req.params.id` (donation detail/patch/bukti/approve/delete), ganti dengan `!== event.id` (UUID dari resolved event) supaya comparison correct kalau user pakai slug.

**Endpoint lain yang belum di-cover** (UUID-only):
- POST/PATCH/DELETE event itself (admin portal)
- Hero/QRIS upload
- Peserta endpoints (POST register, /me, batch, PATCH, approve, bukti)
- Ministry/volunteer
- Check-in

Ini admin operations yang umumnya dipanggil dari portal dengan UUID. Mobile mungkin perlu ini juga di future — bisa di-add per kebutuhan dengan pattern yang sama.

**File berubah**: `apps/core-api/src/routes/admin/event.ts` only.

**Defense-in-depth**: error handler `middleware/error-handler.ts` sudah translate P2023 ke 400 INVALID_INPUT_FORMAT sejak patch 2026-05-21e. Kalau ada code path lain miss helper, mobile dapat 400 informatif, bukan 500.

### Patch 2026-05-21n — Bug fix: approve event peserta P2025 saat JWT stale

**Lanjutan patch 2026-05-21m**. Setelah ganti `req.user.sub` → `req.user.jemaatId`, masih ada error P2025 di approve. Root cause baru: JWT stale — admin login sebelum `prisma migrate reset`, jadi `jemaatId` di JWT tidak ada lagi di tabel `jemaat`. Prisma nested connect ke ID yang tidak ada → P2025.

**Fix defensive**: helper baru `resolveApproverJemaatId(req)` di `event.ts`:
1. Ambil `req.user?.jemaatId`
2. Verify jemaat exists dengan `prisma.jemaat.findUnique`
3. Kalau exists → return jemaatId
4. Kalau tidak → return `undefined` (skip approver field, audit trail tetap jalan tanpa attribution)

Apply ke 4 lokasi yang sama (peserta + donation, PATCH BAYAR + approve):
```typescript
const approverJemaatId = await resolveApproverJemaatId(req);
// ...
data.approver = approverJemaatId ? { connect: { id: approverJemaatId } } : undefined;
```

Kolom `approvedBy` di kedua tabel sudah nullable, jadi skip aman.

**Trade-off**: kalau ini sering terjadi di production (bukan dev), pertimbangkan force logout user yang JWT-nya stale. Untuk dev local, biar tidak block flow.

**Alternative yang dipertimbangkan tapi tidak diambil**:
- Hard fail (throw Unauthorized "session invalid") — terlalu agresif, admin yang baru migrate reset stuck sampai logout/login ulang
- Auto-create jemaat row kalau tidak ada — silly, masking data inconsistency
- Catch P2025 generic — kurang explicit, sulit di-trace

**File berubah**: `apps/core-api/src/routes/admin/event.ts` only (helper + 4 call sites).

### Patch 2026-05-21m — Bug fix: approve event peserta/donation P2025 (User.id vs Jemaat.id)

**Bug** (lapor 2026-05-21 dari portal):

```
POST /admin/event/.../peserta/.../approve → 404 P2025
"No 'Jemaat' record(s) was found for a nested connect on one-to-many relation 'EventApprover'."
```

**Root cause**: 4 handler di `event.ts` (peserta approve, peserta PATCH dengan status=BAYAR, donation approve, donation PATCH dengan status=BAYAR) pakai `req.user?.sub` (yang adalah `User.id`) untuk connect ke `approver` relation. Tapi `EventParticipation.approver` dan `EventDonation.approver` keduanya relasi ke **Jemaat** (`@relation("EventApprover", fields: [approvedBy], references: [id]`). `User.id` jelas tidak ada di tabel Jemaat → Prisma throw P2025.

**Fix**: replace `req.user?.sub` dengan `req.user?.jemaatId` di 4 lokasi:
- `eventRouter.patch('/:id/peserta/:participationId')` — saat status BAYAR
- `eventRouter.post('/:id/peserta/:participationId/approve')`
- `eventRouter.patch('/:id/donations/:donationId')` — saat status BAYAR
- `eventRouter.post('/:id/donations/:donationId/approve')`

Rename variable jadi `approverJemaatId` untuk eksplisit.

**Sebelum**:
```typescript
const userId = req.user?.sub;
// ...
data.approver = userId ? { connect: { id: userId } } : undefined;
```

**Sesudah**:
```typescript
const approverJemaatId = req.user?.jemaatId;
// ...
data.approver = approverJemaatId ? { connect: { id: approverJemaatId } } : undefined;
```

**Kenapa bug baru terlihat sekarang**: handler peserta `/approve` sudah ada sejak Phase 1 Movement implementation tapi mungkin tidak banyak admin pakai (mereka edit status manual via PATCH dropdown). Setelah portal punya DonationsSection dengan tombol Approve eksplisit (patch 2026-05-21l), bug surface karena admin sering klik Approve.

**File berubah**: `apps/core-api/src/routes/admin/event.ts` only.

### Patch 2026-05-21l — Multi-donation untuk fundraising event (Opsi B IMPLEMENTED)

**Request mobile**: `ecc-mobile-app/docs/backend-request-multi-donation-event.md`. Status DISCUSSION sebelumnya → product owner decide **Opsi B** (sub-table `EventDonation`). Now implemented.

**Schema (migration `20260521150000_event_donation`)**:

```
EventDonation
  id, participationId (Cascade), nominalBayar (Decimal 15,2)
  buktiTransferUrl, status (EventDonationStatus), catatan
  paidAt, approvedBy, approvedAt
  createdAt, updatedAt

EventDonationStatus enum:
  MENUNGGU_VERIFIKASI | BAYAR | BATAL

Jemaat extension:
  eventDonationApprovals EventDonation[] @relation("EventDonationApprover")

EventParticipation extension:
  donations EventDonation[]
```

Existing `EventParticipation.nominalBayar/buktiTransferUrl/paidAt/approvedBy/approvedAt` **tetap (deprecated)** untuk backward-compat. Migration backfill: untuk row existing yang punya payment data, INSERT 1 EventDonation row dengan status sesuai EventParticipation.status mapping.

**7 endpoint baru di event router**:
- `GET    /admin/event/:id/donations` — admin list paginated, with `meta.totalAmountConfirmed`
- `GET    /admin/event/:id/donations/me` — mobile list own donations + totalConfirmed
- `POST   /admin/event/:id/donations` — create (auto-resolve participation, validate nominal per tipeBayar)
- `GET    /admin/event/:id/donations/:donationId` — detail
- `PATCH  /admin/event/:id/donations/:donationId` — admin update status/nominal/catatan
- `POST   /admin/event/:id/donations/:donationId/bukti` — upload bukti per donation (multipart, `flexImageUpload`)
- `POST   /admin/event/:id/donations/:donationId/approve` — admin shortcut → BAYAR
- `DELETE /admin/event/:id/donations/:donationId` — soft cancel, idempotent

**Concept shift**:
- `EventParticipation` = registration commitment (DAFTAR / HADIR / BATAL)
- `EventDonation` = giving record (MENUNGGU_VERIFIKASI / BAYAR / BATAL), 1-to-many per participation

**Helper baru**:
- `lib/storage.ts` — `saveEventDonationBukti(donationId, buffer)` + `deleteEventDonationBukti`. Layout `/uploads/content/event/donation-bukti/{donationId}.webp`.
- `routes/admin/event.ts` — `ensureParticipation(eventId, jemaatId)` lazy upsert (kalau user langsung donasi tanpa register dulu, BE auto-create participation status DAFTAR).

**Validation per `event.tipeBayar`**:
- `GRATIS` → tolak 400 ("event gratis tidak menerima donation")
- `NOMINAL_TETAP` → nominal harus tepat == `event.nominal`
- `NOMINAL_BEBAS` → nominal >= `event.nominal` (kalau di-set sebagai minimum)

**Use cases yang sekarang work**:
- Fundraising pembangunan — cicilan bulanan (Jan, Feb, dst.) sebagai donation row terpisah
- Persembahan misi — initial + top-up berkali-kali
- Persembahan tahunan — multiple giving sepanjang tahun
- Event NOMINAL_TETAP — masih 1 donation per participation (backward compat)

**Fundraising progress**: admin list endpoint kasih `meta.totalAmountConfirmed` = SUM(donations.nominalBayar where status=BAYAR). UI mobile/portal pakai untuk progress bar "Rp 12.500.000 dari Rp 50.000.000 target".

**Backward compat existing flow**:
- Endpoint lama `/peserta/:participationId/bukti`, `/peserta/:participationId/approve` masih ada (deprecated)
- `EventParticipation.nominalBayar/buktiTransferUrl` masih di-keep untuk row existing
- New code harus pakai `/donations/*` endpoints

**Portal UI**: section "Donations / Persembahan" di event detail page muncul untuk semua event paid (TETAP + BEBAS). Komponen baru `components/event/donations-section.tsx`:
- Fundraising progress card hijau dengan `totalAmountConfirmed` (dari `meta.totalAmountConfirmed`)
- Filter pills: Semua / Menunggu / Bayar / Batal
- List donations dengan avatar, nama, no HP, nominal, status badge, catatan, paidAt, approver
- Actions per row: upload bukti (flexImageUpload), approve (kalau MENUNGGU), batal
- Pagination

Untuk NOMINAL_BEBAS judul **"Donations / Persembahan"** dengan label "Total terkumpul"; untuk NOMINAL_TETAP judul **"Payment History"** dengan label "Total pembayaran terkonfirmasi". Same UI, beda label context.

**File berubah**:
- `packages/database/prisma/schema.prisma` — model `EventDonation`, enum `EventDonationStatus`, relasi
- `packages/database/prisma/migrations/20260521150000_event_donation/migration.sql` — create table + backfill
- `packages/shared-types/src/schemas/event.ts` — `createEventDonationSchema`, `updateEventDonationSchema`, enum
- `apps/core-api/src/lib/storage.ts` — `saveEventDonationBukti` + delete
- `apps/core-api/src/routes/admin/event.ts` — 7 handler baru + helper `ensureParticipation`
- `apps/core-api/src/openapi.ts` — register 7 path baru
- `apps/portal/src/components/event/donations-section.tsx` — NEW (admin view)
- `apps/portal/src/app/dashboard/event/[id]/page.tsx` — render `DonationsSection` untuk event paid
- `docs/mobile-api-guide.md` — section **5.7 Event Donations** lengkap + Gap Status table
- `ecc-mobile-app/docs/backend-request-multi-donation-event.md` — RESOLVED + impl summary

**User perlu**:
- `pnpm db:generate` — Prisma client regenerate untuk recognize `EventDonation` model
- `pnpm db:migrate dev` — apply migration ke DB

### Patch 2026-05-21k — Support nomor HP internasional E.164

**Request mobile**: `ecc-mobile-app/docs/backend-request-multi-donation-event.md` (Priority MEDIUM, status 🔵 DISCUSSION).

Mobile request: support multi-donation per jemaat per event untuk fundraising (cicilan/top-up). Saat ini `EventParticipation` unique `(eventId, jemaatId)` → user yang sudah BAYAR sekali tidak bisa donasi lagi ke event yang sama → 409 CONFLICT.

**BE analysis tertulis lengkap di response section file mobile docs**. Ringkasan rekomendasi:

| Opsi | BE verdict |
|---|---|
| A. Drop unique constraint, multi row per event-jemaat | ⚠ Tidak rekomendasi — migration mahal, edge case risky |
| B. Sub-table `EventDonation` (1-to-many dari Participation) | ✅ Rekomendasi long-term — clean separation commitment/realisasi |
| C. Extend Persembahan endpoint dengan optional `eventId` | ❌ Tidak feasible — tabel Persembahan generic belum ada |
| D. Status quo, mobile redirect ke Persembahan tab | ✅ OK short-term, ❌ tidak ideal long-term (data tidak ter-link ke event) |

**Phased rollout yang disarankan**:
1. **Now (no BE change)**: opsi D — mobile tampil info card di event NOMINAL_BEBAS arahkan ke rekening cabang.
2. **Phase 2 (kalau ada concrete fundraising plan)**: implement opsi B, BE estimate 2-3 hari sprint + migration.
3. **Long-term**: build separate `Persembahan` table generic untuk all giving.

**Decision yang dibutuhkan product owner** (4 questions di response doc):
- Concrete fundraising plan 1-3 bulan?
- Admin butuh "total per event" report?
- Giving history per jemaat (UX feature)?
- Timeline target?

**Code belum di-implement** — masih DISCUSSION. KB akan di-update lagi setelah product decision + actual implementation.

### Patch 2026-05-21k — Support nomor HP internasional E.164

**Request mobile**: `ecc-mobile-app/docs/backend-request-international-phone.md` (Priority LOW-MEDIUM).

Sebelumnya `noHpSchema` di `packages/shared-types/src/schemas/common.ts` hardcode regex `/^\+62[0-9]{8,13}$/` — hanya accept nomor Indonesia. Block jemaat diaspora, missionari, jemaat cabang luar negeri.

**Fix**: ganti pakai `libphonenumber-js` (port resmi Google libphonenumber) yang validate per-country rules:

```typescript
// SEBELUM
export const noHpSchema = z.string().trim()
  .regex(/^\+62[0-9]{8,13}$/, 'Format no HP harus E.164 (+62...)');

// SESUDAH
import { isValidPhoneNumber } from 'libphonenumber-js';
export const noHpSchema = z.string().trim()
  .refine((v) => { try { return isValidPhoneNumber(v); } catch { return false; } },
    { message: 'Format no HP harus E.164 internasional yang valid...' });
```

Untuk `+62` perilaku identical dengan regex lama; untuk country lain (mis. `+65`, `+1`, `+61`) validasi spesifik per country (panjang digit + mobile prefix valid).

**Tidak butuh migration database**: kolom `Jemaat.noHp` sudah `VARCHAR(20)` (cukup untuk E.164 max 15 digit + `+`). Tidak ada constraint yang assume +62 prefix. Existing data tetap valid (semua +62XXX adalah valid E.164).

**Schema yang inherit `noHpSchema` otomatis ikut**: `requestOtpSchema`, `verifyOtpSchema`, `faceLoginSchema`, `registerJemaatSchema`, `createJemaatSchema`, `updateJemaatSchema`, `linkFamilyByPhoneSchema`, `registerFamilyNewSchema`. Tidak ada perubahan code di-tempat lain.

**Caveat — WhatsApp delivery**: BE side support semua E.164, tapi delivery WhatsApp depends provider (Fonnte/Twilio/Meta direct) dan country reachability.
- Provider perlu check: bisa kirim ke country apa saja? Cost per country?
- Country yang WhatsApp blocked (mis. China) butuh metode auth alternatif yang belum di-build.
- Untuk launch awal, support country populer (ID/SG/MY/HK/AU/UK/US) — verify dengan provider sebelum mass rollout.
- Rate limit per-IP + per-nomor existing tetap berlaku regardless country.

**Mobile-side plan** (di-document di response file):
- Tambah country picker di PhoneInput (default ID +62)
- Pakai `libphonenumber-js` di client juga untuk format/validate real-time
- Persist last-used country di SecureStore

**File berubah**:
- `packages/shared-types/package.json` — tambah `libphonenumber-js ^1.11.0`
- `packages/shared-types/src/schemas/common.ts` — replace regex dengan `isValidPhoneNumber`
- `docs/mobile-api-guide.md` — section "Phone number normalization" updated
- `ecc-mobile-app/docs/backend-request-international-phone.md` — RESOLVED dengan Backend Response

**User perlu run**: `pnpm install` di root untuk install `libphonenumber-js`.

### Patch 2026-05-21j — Image upload hints + AI prompt generator (portal)

Request internal: admin sering bingung ukuran ideal untuk hero image event/news/renungan, dan kekurangan ide visual yang sesuai brand.

**Solusi**: komponen reusable `<UploadHint>` (`apps/portal/src/components/upload/upload-hint.tsx`) dengan 2 fitur:

1. **Size hint card** — tampil spek rekomendasi per upload kind:
   - `hero-event` / `hero-news` / `hero-renungan` → 1600×1067 px (3:2), max 5MB, JPEG/PNG/WebP/HEIC
   - `qris` → min 600×600 (1:1), max 5MB
   - `bukti` → bebas, max 5MB
   - `profile` → min 400×400 (1:1)

2. **AI prompt generator** (hanya untuk hero-*) — collapsible section dengan prompt template yang admin bisa copy:
   - Auto-fill context dari form (judul, ringkasan, ayatAlkitab, tags)
   - Style guidance per kind: event (cerah, energetic), news (photographic, informatif), renungan (reflektif, soft tone)
   - Platform hint: DALL-E 3, Midjourney (`--ar 3:2 --v 6`), Stable Diffusion settings
   - Note "tidak ada teks di gambar" supaya admin tidak generate dengan watermark text

**Apply ke 4 lokasi**:
- `components/broadcast/konten-page.tsx` — form modal news/renungan (di bawah hero image upload, context dari form state)
- `app/dashboard/event/[id]/page.tsx` — detail page event, di bawah hero image card + di QRIS section
- `components/cabang/rekening-section.tsx` — QRIS rekening per cabang
- `app/dashboard/profile/page.tsx` — foto avatar user

**Contoh prompt output (hero-renungan dengan judul + ayat)**:

```
Buatkan ilustrasi hero banner untuk renungan harian berjudul "Tidak Ada Yang Mustahil Bagi Allah".
Ayat utama: "Lukas 1:37"

Style:
- Tone hangat, reflektif, kontemplatif (mis. sunrise, open Bible, hands in prayer)
- Soft natural lighting, warna lembut (sepia, gold, soft amber)
- Aspect ratio 3:2 landscape (1600x1067 px)
- Tidak ada teks tulisan di gambar
- ...
```

**Tidak ada perubahan BE** — purely UI improvement.

### Patch 2026-05-21i — `myParticipation` di event detail + `GET /:idOrSlug/peserta/me`

**Request mobile**: `ecc-mobile-app/docs/backend-request-event-participation-status.md` (Priority MEDIUM).

Mobile rely on local storage untuk track participation status user di event. Edge case: fresh install / device change / storage corruption → local kosong → UI tampil "Daftar Sekarang" padahal user sudah daftar dan belum bayar. Workaround 409 CONFLICT recovery sudah ada tapi tidak ideal (placeholder participationId='unknown' → upload bukti gagal).

**Implementation — keduanya** (BE pilih combine, sesuai rekomendasi mobile):

1. **Field `myParticipation` di response `GET /admin/event/:idOrSlug`** — primary source of truth saat mobile load detail.
   - `null` kalau belum daftar
   - Otherwise: row participation lengkap (id, status, nominalBayar, buktiTransferUrl, registeredAt, paidAt, attendedAt, cancelledAt)
   - Resolve via `req.user.jemaatId` — kalau request anonymous, field tetap `null` (defensive, walaupun endpoint butuh JWT)

2. **Endpoint `GET /admin/event/:idOrSlug/peserta/me`** — standalone refetch, useful setelah mutation (register/cancel/upload bukti) tanpa re-fetch full detail.
   - 200 + data row kalau terdaftar
   - 404 kalau belum daftar
   - Accept id atau slug (sama pola endpoint detail)

**Route ordering**: `GET /:idOrSlug/peserta/me` di-register **SEBELUM** `DELETE /:id/peserta/me` (sebenarnya beda HTTP method jadi Express tidak konflik, tapi konvensi codebase: route `me` di-group sebelum route `:participationId`).

**Mobile pattern (rekomendasi BE):**
- Initial load event detail → pakai `data.myParticipation` dari `GET /:idOrSlug` (1 query, efisien)
- Refresh setelah mutation → pakai `GET /:idOrSlug/peserta/me` (cepat, tidak fetch ulang event)

**Source of truth shift**: mobile harus pakai BE response sebagai authoritative, bukan local storage. Local storage tetap berguna untuk offline UX cache, tapi saat online selalu rekonsiliasi dengan BE.

**File berubah**:
- `apps/core-api/src/routes/admin/event.ts` — detail handler include `myParticipation`, new handler `GET /:idOrSlug/peserta/me`
- `apps/core-api/src/openapi.ts` — register new path
- `docs/mobile-api-guide.md` — section 5.2 (myParticipation field) + section 5.2.1 (standalone endpoint) + Gap Status table
- `ecc-mobile-app/docs/backend-request-event-participation-status.md` — RESOLVED dengan Backend Response

**Tidak ada breaking change**: `myParticipation` adalah field tambahan optional. Client lama yang tidak baca field tsb tetap jalan normal. Single round-trip lebih heavy 1 query Postgres (~ms) — acceptable.

### Patch 2026-05-21h — Dev environment LAN access untuk mobile

**Request mobile**: `docs/backend-request-dev-environment-access.md` (Priority HIGH — blocker QA real device).

Mobile dev pakai Expo Go di HP fisik untuk QA fitur kamera/QR/Bluetooth. HP tidak bisa hit `http://localhost:4100` karena `localhost` di HP = HP itu sendiri, bukan Mac dev. Mobile sudah patch sisi-nya: auto-detect IP Mac dari Expo `hostUri`. Tapi BE perlu listen `0.0.0.0` supaya bisa di-reach via LAN IP.

**Fix BE (3 perubahan)**:

1. **`apps/core-api/src/index.ts`** — eksplisit `app.listen(PORT, HOST, ...)` dengan `HOST = process.env.HOST ?? '0.0.0.0'`. Sebelumnya implicit Node default (yang juga `0.0.0.0`, tapi tidak terlihat di code). Plus log enumerate LAN URLs via `os.networkInterfaces()` saat startup:

   ```
   🚀 ECC Core API listening on 0.0.0.0:4100 (all interfaces)
   📚 API docs: http://localhost:4100/docs
   📱 LAN access untuk HP / device fisik (Expo Go, dll):
      → http://192.168.1.5:4100
   ```

2. **`apps/core-api/src/app.ts`** — CORS allowlist diperluas saat `NODE_ENV !== 'production'`:
   - `http://localhost:<port>` (existing)
   - `http://127.0.0.1:<port>`
   - `http://192.168.x.x:<port>` (LAN class C)
   - `http://10.x.x.x:<port>` (LAN class A)
   - `http://172.16-31.x.x:<port>` (LAN class B / Docker / hotspot)
   - `exp://` / `exps://` (Expo Go dev client)

   Native mobile fetch tanpa Origin header tetap di-allow (logic existing).

3. **Tidak ada migration / breaking change**. Production deployment tidak terimbas (K8s default sudah bind `0.0.0.0`, `CORS_ALLOWED_ORIGINS` env tetap strict).

**Macos firewall — separate concern**. Patch BE tidak otomatis allow port di firewall. Setiap dev tim perlu setup sekali:

```bash
# Cek status
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

# Kalau enabled, allow Node binary
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add $(which node)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp $(which node)
```

Atau matikan firewall di System Settings saat dev (kalau di WiFi trusted).

**Dev workflow setelah patch**:

1. `pnpm dev` di Mac → log tampilkan LAN URL
2. HP & Mac di WiFi sama
3. Expo Go scan QR → app auto-pakai IP Mac via `Constants.expoConfig.hostUri`
4. App call `http://<MAC_LAN_IP>:4100/...` → BE accept via CORS regex

**Override HOST**: bisa via env `HOST=192.168.1.5` kalau ada use case khusus (multi-NIC dev machine). Default `0.0.0.0` cocok 99% kasus.

**File berubah**:
- `apps/core-api/src/index.ts` — explicit HOST bind + LAN URL log
- `apps/core-api/src/app.ts` — CORS regex list
- `docs/backend-request-dev-environment-access.md` — RESOLVED + Backend Response

### Patch 2026-05-21g — Self-cancel event participation

**Request mobile**: `docs/backend-request-cancel-participation.md` (Priority Low-Medium).

Mobile butuh user bisa batalkan registrasi event sendiri tanpa hubungi admin via WhatsApp. Sebelumnya cuma admin yang bisa cancel via `PATCH /:participationId { status: 'BATAL' }`.

**Endpoint baru**: `DELETE /admin/event/:id/peserta/me`
- Resolve current user dari JWT — mobile tidak perlu kirim `participationId` di path
- Soft cancel: status → BATAL + `cancelledAt`, row tetap untuk audit
- Idempotent untuk BATAL (return existing dengan `meta.alreadyCancelled: true`)
- Reject 400 kalau status HADIR (sudah hadir, tidak bisa undo)
- Reject 404 kalau user belum daftar

**Behavior matrix**:

| Status before | Response |
|---|---|
| (no row) | 404 |
| DAFTAR / MENUNGGU_VERIFIKASI / BAYAR | 200, set BATAL |
| HADIR | 400 |
| BATAL | 200 idempotent |

**Route ordering**: handler `/peserta/me` di-register SEBELUM route `:participationId` di `event.ts` — Express match in order, jadi `me` tidak di-treat sebagai UUID param.

**Re-register flow**: setelah cancel, user bisa register ulang via `POST /admin/event/:id/peserta` — BE deteksi existing BATAL row dan reactivate ke DAFTAR (response 201, `meta.reactivated: true`). Logic sudah ada dari patch sebelumnya (Issue 1 fix di session ini).

**Slot kuota**: otomatis available kembali karena quota guard di POST `/peserta` filter `status: { not: 'BATAL' }` (sudah ada sejak awal Phase 1).

**Refund**: out of scope. Cancel hanya update status; kalau user sudah BAYAR, refund manual via admin WhatsApp.

**Admin cancel** (untuk user lain): tetap pakai `PATCH /:participationId { status: 'BATAL' }`. Endpoint baru ini hanya untuk self-cancel mobile.

**File berubah**:
- `apps/core-api/src/routes/admin/event.ts` — handler baru
- `apps/core-api/src/openapi.ts` — register path
- `docs/mobile-api-guide.md` — section 5.6 Batalkan partisipasi sendiri + Gap Status table
- `docs/backend-request-cancel-participation.md` — RESOLVED dengan Backend Response

### Patch 2026-05-21f — Bug fix: upload bukti transfer 400 (field name + MIME strict)

**Bug** (lapor 2026-05-21 dari mobile):

```
POST /admin/event/.../peserta/.../bukti → 400 Bad Request
```

**Root cause**: handler pakai `multer.single('foto')` — strict field name `foto` saja. Mobile dev pakai field name `bukti` (logical untuk endpoint `/bukti`), multer abaikan field tsb, `req.file` undefined → 400 "File bukti transfer wajib (field name: foto)". Plus, MIME filter cuma accept `jpeg/png/webp` — iOS HEIC ditolak.

Pattern serupa ada di **semua endpoint upload** di codebase: event hero/qris/bukti, cabang rekening QRIS, news/renungan hero, profile foto, jemaat foto. Semua pakai `.single('foto')` + MIME strict.

**Fix**: helper baru `apps/core-api/src/lib/image-upload.ts` dengan `flexImageUpload()`:

1. **Field name agnostic** — pakai `multer.any()` lalu populate `req.file` dengan file pertama. Mobile bisa pakai `foto`/`bukti`/`file`/`image` — semua kerja.
2. **MIME lebih luas** — tambah `image/heic`, `image/heif` (iOS Live Photo), `image/gif`, plus toleran `application/octet-stream` (Android camera). Matching case-insensitive.
3. **Multer error translated** — `LIMIT_FILE_SIZE` → 400 dengan pesan size limit. `LIMIT_FILE_COUNT` → 400. File filter rejection → 400 dengan MIME yang di-reject + accepted list.
4. **Error message friendly** — sebut field name yang accepted di error: "...field name 'foto' (atau 'bukti'/'file'/'image')".

**Apply di**:
- `apps/core-api/src/routes/admin/event.ts` — hero, qris, bukti
- `apps/core-api/src/routes/admin/me.ts` — `/foto` (drop `PHOTO_UPLOAD` lokal, drop import multer)
- `apps/core-api/src/routes/admin/cabang.ts` — rekening qris (drop `IMG_UPLOAD` lokal, drop import multer)
- `apps/core-api/src/routes/admin/_konten-factory.ts` — hero news/renungan
- `apps/core-api/src/routes/upload.ts` — legacy jemaat foto + user me foto (drop `upload` lokal, drop import multer)

Total: 6 file backend + 1 file helper baru.

**Docs**: mobile-api-guide section 11 (Practical Patterns) tambah **"File upload (multipart) — universal pattern"** lengkap dengan:
- Tabel MIME types yang diterima
- Tabel endpoint upload yang ada
- Contoh React Native FormData
- Tabel common errors + fix

**Catatan teknis**: helper pakai `multer.any()` (accept all fields) + filter di handler dengan `req.files[0]`. Karena populate `req.file` untuk backward-compat, handler existing tidak perlu di-refactor besar — cuma ganti middleware-nya saja.

**Defensive note**: kalau mobile salah set `Content-Type` (mis. `application/json` instead of let RN auto-set with boundary), multer tidak akan parse body → `req.file` undefined → 400 friendly. Bukan 500 silent.

### Patch 2026-05-21e — Bug fix: detail by slug crash 500 (UUID type column)

**Bug** (lapor 2026-05-21 dari mobile):

```
GET /admin/event/retreat-pemuda-2026 → 500 Internal Server Error
```

**Root cause**: handler detail event pakai `where: { OR: [{ id: key }, { slug: key }] }`. Saat `key` adalah slug (mis. `"retreat-pemuda-2026"`), Prisma kirim predicate ke Postgres yang coba match string ke column `id` bertipe UUID → Postgres throw `invalid input syntax for type uuid: "retreat-pemuda-2026"` → Prisma surface jadi `P2023 Inconsistent column data`. Error handler tidak handle P2023, fallback ke generic 500.

Pattern bug yang sama ditemukan di:
- `apps/core-api/src/routes/admin/event.ts` — `GET /admin/event/:idOrSlug`
- `apps/core-api/src/routes/admin/_konten-factory.ts` — `GET /admin/news/:idOrSlug` + `GET /admin/renungan/:idOrSlug`

**Fix**: helper baru `apps/core-api/src/lib/id-or-slug.ts` dengan fungsi `idOrSlugWhere(key)`:
- Kalau `key` valid UUID format → return `{ OR: [{ id: key }, { slug: key }] }` (Postgres aman karena id memang UUID)
- Kalau bukan UUID → return `{ slug: key }` saja (skip id predicate untuk avoid Postgres error)

Pakai di event.ts + _konten-factory.ts (replace `OR: [{id}, {slug}]` dengan `...idOrSlugWhere(key)`).

**Defense in depth**: error handler `middleware/error-handler.ts` sekarang juga handle P2023 → translate ke 400 `INVALID_INPUT_FORMAT`, supaya kalau ada code path lain miss helper, mobile dapat error message informatif daripada 500 generic.

**File yang berubah**:
- `apps/core-api/src/lib/id-or-slug.ts` (new)
- `apps/core-api/src/routes/admin/event.ts` — pakai helper
- `apps/core-api/src/routes/admin/_konten-factory.ts` — pakai helper
- `apps/core-api/src/middleware/error-handler.ts` — handle P2023

### Patch 2026-05-21d — Optional `tanggalLahir` & `alamat` di `/auth/register`

**Request mobile**: `docs/backend-request-optional-signup-fields.md` (Priority Low).

Tim mobile simplify signup form ke 3 field saja (nama + jenis kelamin + cabang) untuk minimize friction onboarding. `tanggalLahir` & `alamat` user lengkapi nanti via `PATCH /admin/me`.

**Investigasi**: kolom `Jemaat.tanggalLahir` & `Jemaat.alamat` di schema **sudah nullable** sejak awal. Tidak perlu migration. Yang perlu fix: Zod schema `registerJemaatSchema` paksa `tanggalLahir` required walau DB optional → mobile workaround kirim placeholder `"2000-01-01"`.

**Fix**:
1. `packages/shared-types/src/schemas/auth.ts` — `tanggalLahir` di `registerJemaatSchema` jadi `.optional()`. `alamat` sudah optional.
2. `apps/core-api/src/routes/auth.ts` — register handler guard `new Date(input.tanggalLahir)` dengan ternary, pakai `?? null` untuk alamat. Kalau undefined → simpan `null`.

**Spec final** (sudah update di mobile-api-guide section 12.1 Step 3):

| Field | Required |
|---|---|
| noHp, namaLengkap, jenisKelamin, cabangId | ✅ |
| tanggalLahir, alamat, homecellId, fotoBase64 | ⚪ optional |

**Admin portal tidak ter-impact** — `POST /admin/jemaat` pakai `createJemaatSchema` yang terpisah dengan validation berbeda. Admin yang input via portal tetap bisa fill semua field.

Request doc di-tandai RESOLVED dengan section "Backend Response" lengkap. Action item ke mobile: hapus placeholder values di mutationFn + update Profile screen untuk handle null value dengan "Belum diisi" placeholder + tombol edit.

### Patch 2026-05-21c — Bug fix `/auth/otp/verify` untuk ENROLLMENT

**Bug**: saat mobile sign-up, masukin OTP yang benar tetap dapat error "Data tidak ditemukan" (P2025).

**Root cause**: `/auth/otp/verify` setelah verify hash valid, selalu panggil `issueAuthResponse(noHp, ...)` yang internal-nya `prisma.jemaat.findUniqueOrThrow({ where: { noHp } })`. Untuk `purpose=ENROLLMENT` jemaat memang belum ada (baru akan di-create di `/auth/register`), jadi `findUniqueOrThrow` throw P2025 → error handler translate ke "Data tidak ditemukan".

**Fix**: branching di `/auth/otp/verify` berdasarkan `purpose`:
- `LOGIN` / `RESET_FACE` → langsung `issueAuthResponse` (jemaat harus ada, behavior lama).
- `ENROLLMENT` → response cuma marker, **tidak** lookup jemaat:
  ```json
  {
    "success": true,
    "data": {
      "otpVerified": true,
      "purpose": "ENROLLMENT",
      "noHp": "+62...",
      "pendingRegistration": true,
      "nextStep": "POST /auth/register",
      "validForSeconds": 900
    }
  }
  ```

Mobile flow sign-up jadi:
1. `POST /auth/otp/request { noHp, purpose: 'ENROLLMENT' }` → OTP terkirim WhatsApp
2. `POST /auth/otp/verify { noHp, kode, purpose: 'ENROLLMENT' }` → response `pendingRegistration: true`
3. `POST /auth/register { noHp, namaLengkap, ... }` → akun aktif + JWT (issued via `issueAuthResponse`)

Window 15 menit antara step 2 dan step 3 (di-enforce di `/auth/register` via `usedAt > Date.now() - 15min` check, sudah ada sejak implementation awal).

### Patch 2026-05-21b — Public cabang catalog

Setelah Phase 1 deploy, tim mobile submit request tambahan via `docs/backend-request-cabang-list.md`: butuh endpoint cabang list **public** (tanpa JWT/API key) untuk picker di signup screen. Workaround sebelumnya = hardcoded di `app/src/constants/branches.ts`, tidak scalable.

**Endpoint baru:** `GET /auth/cabang?isActive=true|false|all`
- Public (no auth), rate-limited 30/menit/IP via `cabangListLimiter` baru di `rate-limit.ts`
- Default filter `isActive=true`; bisa di-override dengan `?isActive=false` atau `?isActive=all`
- Field di-whitelist: `id, nama, kode, alamat, latitude, longitude, isActive`
- **TIDAK** expose `kontak` (info admin), `sinodeId` internal, atau jumlah jemaat

**Catatan field `kota`:** mobile team request `kota` terpisah, tapi schema saat ini tidak punya kolom itu — konvensi naming "ECC <Kota>" sudah cukup untuk display, atau parse dari `alamat`. Kalau ada kebutuhan strict (mis. group by kota), bisa tambah kolom di iterasi berikutnya.

**Validation cabangId di `/auth/register`** sudah cek `isActive` — kalau mobile pakai cache stale dan kirim cabangId yang sekarang nonaktif, register akan ditolak 400 `Cabang tidak valid atau nonaktif`.

**Caching pattern (recommended ke mobile)**: cache 24 jam di local store (mis. `expo-secure-store` key `ecc.branches`), refresh saat splash launch atau pull-to-refresh.

Request doc `docs/backend-request-cabang-list.md` di-tandai RESOLVED dengan implementation summary di bawah.

---

## 27. Production Deployment — Live State (2026-05-23)

### 27.1 Live URLs

| Service     | URL                                       | Internal Port |
|-------------|-------------------------------------------|---------------|
| Portal      | https://portal.eccchurch.global           | 3100          |
| Core API    | https://api.eccchurch.global              | 4100          |
| API docs    | https://api.eccchurch.global/docs         | —             |
| Static files| https://api.eccchurch.global/uploads/...  | —             |

Domain `eccchurch.global` registered di Namecheap (perhatikan: **3 huruf 'c'** — bukan `echurch` atau `ecchurch`).

### 27.2 Infrastructure

- **VPS**: 187.77.118.85 (Ubuntu 22, deploy user `deploy`)
- **Database**: PostgreSQL 16 (lokal di VPS, user `ecc_user`, db `ecc_platform`)
- **Process manager**: PM2 (`ecc-core-api` + `ecc-portal`, fork mode, autorestart)
- **Reverse proxy**: Nginx 1.24, sites-enabled untuk 2 subdomain
- **SSL**: Let's Encrypt via certbot, auto-renew systemd timer (2x daily)
- **Storage**: Static uploads di `/var/www/ecc-core-platform/uploads/` (Nginx serve langsung)
- **Backup**: pg_dump scheduled — belum di-setup di cron, perlu manual sampai #TODO

### 27.3 Gotchas yang di-temukan saat deploy pertama

5 issue blocking yang fixed selama deploy session 2026-05-23. **Catat di sini supaya tidak terulang di future deploy:**

#### Gotcha #1 — Workspace packages compile to dist/ untuk production

**Symptom**: `SyntaxError: Unexpected identifier 'global'` saat core-api start, di `src/middleware/error-handler.ts:3:1`.

**Cause**: `packages/{database,auth,shared-types}/package.json` semula punya `main: ./src/index.ts`. Di dev pakai `tsx` (strip TS on-the-fly) jadi work. Di prod pakai `node` raw — yang tidak bisa parse `declare global { ... }` atau syntax TS lainnya.

**Fix**: Setiap workspace package punya `tsconfig.json` + `build: tsc` script + `main: ./dist/index.js`. Turbo `dependsOn: ^build` ensure packages compile dulu sebelum apps.

#### Gotcha #2 — Transitive deps tidak ke-hoist di pnpm

**Symptom**: `Cannot find module 'jsonwebtoken'` di production runtime, padahal di-import di `apps/core-api/src/lib/liveness-nonce.ts`.

**Cause**: `jsonwebtoken` adalah dep dari `@ecc/auth`, bukan direct dep `@ecc/core-api`. pnpm tidak auto-hoist transitive deps (beda dari npm). Production runtime resolve module dari `apps/core-api/node_modules/` — tidak ketemu.

**Fix**: Tambah semua module yang di-import langsung sebagai direct deps di app yang consume. Check via `grep -r "from 'jsonwebtoken'" apps/core-api/src` dan pastikan listed di `apps/core-api/package.json`.

**Aturan untuk future**: kalau tambah `import X from 'some-package'` di apps/*/src, package harus listed di `apps/*/package.json` dependencies, even kalau juga ada di workspace dep.

#### Gotcha #3 — `.env` loading di PM2

**Symptom**: `[auth] JWT_SECRET missing or too short` di PM2 logs.

**Cause**: `import 'dotenv/config'` di src/index.ts cari `.env` di `process.cwd()`. PM2 `cwd: ./apps/core-api`, jadi dotenv lihat `apps/core-api/.env` — file tidak ada di sana, hanya di root.

**Fix**: `ecosystem.config.cjs` punya zero-dep .env parser di top file, lalu inject ke `env` field setiap app explicit. Lebih reliable daripada PM2 `env_file` directive (behavior inconsistent antar versi).

**Aturan untuk future**: kalau tambah env var baru, **wajib** tambah ke 2 tempat:
1. `.env.example` (template untuk developer baru)
2. `ecosystem.config.cjs` `sharedEnv` object (supaya ke-inject ke PM2)

#### Gotcha #4 — `NEXT_PUBLIC_*` di-bake build-time

**Symptom**: Portal di production masih hit `http://localhost:4100/auth/otp/request` → `ERR_CONNECTION_REFUSED`.

**Cause**: Next.js inline `NEXT_PUBLIC_*` env vars ke client bundle saat `next build`. Build kemarin di Mac/CI pakai `.env` lokal yang punya `NEXT_PUBLIC_CORE_API_URL=http://localhost:4100` → ke-bake ke bundle.

**Fix**: Di VPS, update `.env` ke production URL, lalu **rebuild** portal (`pnpm --filter @ecc/portal build`). Restart PM2 portal supaya pick up bundle baru. Hard reload browser supaya bypass cache.

**Aturan untuk future**: kalau update `NEXT_PUBLIC_*` di .env, **wajib rebuild portal**. PM2 reload aja tidak cukup karena `.next/` static chunks di-cache.

#### Gotcha #5 — `trust proxy` + `UPLOADS_DIR` absolute path

**Symptoms** (2 issue terpisah):
1. `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` di logs setiap request.
2. Gambar upload sukses tapi `https://api.eccchurch.global/uploads/...` return 404.

**Causes**:
1. Express tidak trust `X-Forwarded-For` dari Nginx → `req.ip = 127.0.0.1` → rate-limit error.
2. `UPLOADS_DIR="./uploads"` relatif → file ke-save ke `apps/core-api/uploads/`, tapi Nginx alias point ke `/var/www/ecc-core-platform/uploads/` (mismatch).

**Fix**:
1. `app.set('trust proxy', 1)` di `apps/core-api/src/app.ts` — trust 1 hop (Nginx).
2. Update `UPLOADS_DIR` di `.env` ke absolute path `/var/www/ecc-core-platform/uploads`. Migrate file existing dengan rsync. Set permission `deploy:www-data` 755.

**Aturan untuk future**:
- Selalu pakai **absolute path** di `.env` production untuk file storage.
- Express harus `trust proxy` di belakang reverse proxy. Sudah ke-set di code, tidak perlu re-do.

### 27.4 Production environment variables (.env di VPS)

Berbeda dari `.env.example` untuk dev. Catat key differences:

```bash
NODE_ENV="production"
DATABASE_URL="postgresql://ecc_user:EccGlobal2026%40@localhost:5432/ecc_platform?schema=public"
# Note: @ di password di-encode jadi %40 (URL-encoding requirement)

PORTAL_URL="https://portal.eccchurch.global"
CORE_API_URL="https://api.eccchurch.global"
NEXT_PUBLIC_CORE_API_URL="https://api.eccchurch.global"
CORS_ALLOWED_ORIGINS="https://portal.eccchurch.global"
UPLOADS_DIR="/var/www/ecc-core-platform/uploads"  # absolute path!

# Sisanya sama dengan .env.example
```

### 27.5 Workflow deploy untuk future changes

**Lihat dokumen `docs/future-changes-deploy-workflow.md`** untuk copy-paste command per skenario:
- Code change saja (no schema, no env, no deps)
- Code change + new dependency
- Code change + new env var
- Code change + database migration
- Emergency rollback

---

## 28. Diagnostics + App Config Cluster (2026-05-23)

Respon untuk 2 mobile request menjelang pilot rollout 2026-06-08:
- `backend-request-face-confidence-threshold-and-telemetry.md`
- `backend-request-diagnostics-error-endpoint.md`

### 28.1 Goals

1. **Tune-able config runtime** — backend bisa adjust face threshold, sampling rate, dan kill switch tanpa app update + tanpa server restart.
2. **Pilot observability face login** — track funnel (attempt → liveness → descriptor → server response), latency p50/p95 per step, confidence distribution, failure breakdown.
3. **Production error reporting** — replace third-party Sentry. Mobile push runtime error fire-and-forget; backend aggregate Sentry-style fingerprint grouping.

### 28.2 Schema — 3 model baru

#### AppConfig (singleton, mirror MaintenanceMode pattern)

`id="global"`, single row. Fields tune-able runtime:
- `faceMatchThreshold` (default 0.5) — mirror env `FACE_MATCH_THRESHOLD`. Backend tetap baca env; field ini cuma read-only mirror untuk mobile.
- `lowConfidenceWarnThreshold` (default 0.7) — mobile-side warning threshold di accepted range `[faceMatchThreshold..1.0]`.
- `telemetrySamplingRate` (default 1.0) — sampling rate client-side. Pilot 1.0; post-pilot reduce ke 0.1-0.2.
- `errorReportingEnabled` (default true) — kill switch saat incident (mis. infinite loop di mobile generate jutaan error/menit).

#### FaceTelemetryEvent

Mobile-pushed event saat face login/enroll flow.
- `sessionId` UUID (mobile-generated) — group multiple events 1 attempt
- `event` (face_login_attempt, face_liveness_pass, face_descriptor_compute, face_nonce_request, face_login_server_response, dll)
- `flow` ('login' | 'enroll') untuk disambiguate shared events
- `outcome` ('success' | 'failure'), `failureReason` (free-form)
- `confidence` (raw cosine 0..1 untuk success login)
- `durationMs` JSONB `{livenessTotal, descriptorCompute, serverRoundtrip}` ms
- `device` JSONB `{platform, model, osVersion, appVersion, modelVersion}`
- Indexes: `(event, timestamp)`, `sessionId`, partial pada `noHp`, `receivedAt` untuk retention
- Retention 90 hari (`FACE_TELEMETRY_RETENTION_DAYS`)

#### DiagnosticsErrorEvent

Mobile-pushed runtime error / warning dari production build.
- `type` ('error' | 'message')
- `release` "X.Y.Z+buildNumber" identifier
- `platform`, `osVersion`, `appVersion`
- `userNoHp` (opsional, untuk debug)
- `message`, `stack`, `errorName`, `context` JSONB, `breadcrumbs` JSONB (max 50)
- **Generated column `fingerprint`** = `md5(error_name + ':' + message)` STORED — Sentry-style grouping.
  ```sql
  fingerprint VARCHAR(32) GENERATED ALWAYS AS (
    md5(COALESCE(error_name, '') || ':' || COALESCE(message, ''))
  ) STORED
  ```
- Indexes: `(fingerprint, release)`, `timestamp DESC`, partial `userNoHp`, `(release, platform)`, `receivedAt`
- Retention 30 hari (`DIAGNOSTICS_ERROR_RETENTION_DAYS`)

### 28.3 Endpoints

#### Public (no auth — mobile fetch / push)

| Endpoint | Purpose | Rate limit |
|----------|---------|------------|
| `GET /public/app-config` | Mobile fetch config saat splash, cache 1 jam | globalLimiter |
| `POST /auth/face/telemetry` | Fire-and-forget face login event | telemetryLimiter 500/menit/IP |
| `POST /diagnostics/error` | Fire-and-forget runtime error | diagnosticsErrorLimiter 100/menit/IP |

Semua endpoint **defensive**: kalau Zod parse fail → return 200 + `{ dropped: true }` (mobile tidak retry). Insert DB async via `.catch()` log warning kalau gagal.

#### Admin (JWT + RBAC menuKey `diagnostics`)

| Endpoint | Purpose |
|----------|---------|
| `GET /admin/diagnostics/app-config` | Read singleton |
| `PATCH /admin/diagnostics/app-config` | Update tune-able fields (audit log entry) |
| `GET /admin/diagnostics/face-telemetry?platform=&flow=&from=&to=` | Funnel + latency + confidence aggregate |
| `GET /admin/diagnostics/error-events?search=&platform=&page=&limit=` | Aggregate by fingerprint |
| `GET /admin/diagnostics/error-events/:fingerprint` | Detail — recent 50 events + breakdown + trend |

Latency aggregate pakai PostgreSQL `percentile_cont(0.5/0.95) WITHIN GROUP` (raw SQL via `prisma.$queryRaw` — Prisma groupBy tidak support percentile).

### 28.4 Right-to-delete + Retention

- `DELETE /admin/me` handler cascade DELETE WHERE `noHp` di:
  - `face_telemetry_event.no_hp = jemaat.noHp`
  - `diagnostics_error_event.user_no_hp = jemaat.noHp`
- 2 cron job baru di `scheduled-jobs.ts`:
  - `cleanup-face-telemetry` (daily, retention `FACE_TELEMETRY_RETENTION_DAYS` default 90)
  - `cleanup-diagnostics-error` (daily, retention `DIAGNOSTICS_ERROR_RETENTION_DAYS` default 30)
- Anonymous events (no `noHp`) tidak ke-affected oleh right-to-delete — tetap retained sampai retention cutoff.

### 28.5 Portal Dashboard

**Menu:** Developer Tools → **Diagnostics** (icon stethoscope, menuKey `diagnostics`, RBAC Fulltimer default).

**3 tab:**
1. **Face Telemetry** — stats card (total events, avg confidence, p50/p95), funnel table (event × outcome), top failure reasons, latency p50/p95 per step. Filter: platform + flow.
2. **Error Events** — aggregate list by fingerprint dengan total count + user count + sample message + platforms/releases affected. Filter: search di message + platform. Click row → detail modal dengan recent 50 events + breadcrumbs expandable + stack trace expandable.
3. **App Config** — edit form 4 field (face thresholds + sampling rate + kill switch toggle). Save trigger PATCH endpoint.

### 28.6 Mobile Acknowledgment

Tim mobile sudah implement client-side (terdokumentasi di file backend-request masing-masing section 8 / 11):

#### M19.3 — Face Telemetry + App Config (terkait `face-confidence-threshold-and-telemetry.md`)
- `src/types/appConfig.ts` — typed `AppConfig` + `APP_CONFIG_DEFAULTS` fallback
- `src/api/appConfig.ts` — `getAppConfig()` GET wrapper
- `src/hooks/useAppConfig.ts` — `useAppConfig()` hook + sync accessor + prefetch helper
- Cache 1 jam, pre-warmed di splash, excluded dari React Query persist (always fresh dari server)
- `welcome.tsx` + `login/index.tsx` — `data.confidence < 0.7` → `data.confidence < appConfig.lowConfidenceWarnThreshold` (dynamic)
- `src/services/telemetry.ts` — module-level `currentSamplingRate` + setter, subscribe dari `_layout.tsx` useEffect
- `trackFaceEvent` call `shouldSample()` sebelum fetch — drop event sebelum network kalau `Math.random() >= rate`
- Fast path: rate=1.0 skip Math.random call

#### M20 → M20.1 — Error Reporting (terkait `diagnostics-error-endpoint.md`)
- `src/services/errorReporting.ts` — payload shape match BE spec section 1
- Ring buffer `BREADCRUMB_BUFFER_SIZE = 20` (under BE zod limit 50), trim via `.slice(-20)`
- No client-side kill switch check — BE handle drop via `app_config.errorReportingEnabled`
- `__DEV__` skip — dev errors tidak pollute pilot dashboard
- Silent fail on 404 / network error / timeout — fire-and-forget, never throws

#### Pending verification (manual oleh Ari di physical device pilot dev build)

5 check:
1. Trigger face login → event muncul di portal Diagnostics → Face Telemetry tab
2. Verify confidence distribution + latency p50/p95 muncul di dashboard
3. Verify sampling: admin set `telemetrySamplingRate = 0.1` → 90% events di-drop sebelum push
4. Verify low_confidence tune: admin set `lowConfidenceWarnThreshold = 0.85` → toast warning lebih sering
5. Verify right-to-delete: trigger telemetry sebagai user A → DELETE /admin/me → confirm row terhapus

Untuk error reporting tambahan 4 check (lihat backend-request-diagnostics-error-endpoint.md section 11).

### 28.7 Decisions yang dicatat di sini

- **Singleton pattern AppConfig** (id='global' TEXT, bukan UUID) — sama dengan MaintenanceMode. Konsisten untuk fitur tune-able runtime tanpa migration tiap toggle.
- **Generated column fingerprint di DiagnosticsErrorEvent** — STORED di Postgres native, lebih efficient untuk grouping query dibanding compute di app layer. Trade-off: tidak bisa set via Prisma create (auto-computed di DB).
- **Fire-and-forget pattern untuk telemetry + error** — mobile tidak retry, BE tidak guarantee delivery. Pilot scale (<100 users) OK; kalau scale > 10K events/day pertimbangkan queue (Bull/BullMQ).
- **Server tetap baca threshold dari env, mobile dari app_config** — backend matching adalah hard contract (perlu restart untuk ubah, audit-safe). Mobile UI hint bisa dynamic (tune live tanpa downtime).
- **Retention berbeda** — telemetry 90 hari (untuk trend analysis), errors 30 hari (volume bisa spike). Sesuaikan via env kalau perlu.
- **Cast `Prisma.InputJsonValue`** di insert untuk JSON fields (context + breadcrumbs + durationMs + device) — Prisma narrow type tidak match dengan Zod `z.record(z.unknown())` / `z.array(...)`. Cast eksplisit + `Prisma.JsonNull` untuk null semantics.

---

## 29. Guest Mode Public Endpoints + Signup Role + Portal UX (2026-05-24)

Response untuk 4 mobile requests + 1 user UX feedback dalam 1 batch deploy.

### 29.1 Goals

1. **Guest mode browse** — mobile user bisa explore aplikasi sebelum signup (improve conversion). Butuh 4 endpoint public + 4 endpoint content (news/renungan).
2. **Signup role assignment** — user pilih `JEMAAT_TETAP` vs `NEW_COMER` saat signup (vs default JEMAAT_TETAP semua). Fulltimer assignment tetap manual admin.
3. **Portal UX** — Cabang form input lat/long support koma decimal (locale Indonesia). Ibadah menu UI redesign per cabang.

### 29.2 Schema additions

Migration `20260524040000_guest_public_endpoints`:

#### `is_public` flag — Ibadah + Event tables

```sql
ALTER TABLE ibadah ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX idx_ibadah_public_browse ON ibadah(cabang_id, tanggal_mulai)
  WHERE is_active = true AND is_public = true;

ALTER TABLE event ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX idx_event_public_browse ON event(cabang_id, tanggal_mulai DESC)
  WHERE is_active = true AND is_public = true AND is_published = true;
```

Gate untuk guest visibility — terpisah dari `isPublished` (Event) yang controls publish/draft. Default `true` = published item auto-public. Admin bisa toggle `false` untuk event internal (training pengurus, retreat panitia) yang cuma untuk member login.

#### Seed sub_roles "New Comer" + "Jemaat Tetap" (idempotent)

INSERT...SELECT...WHERE NOT EXISTS pattern — skip kalau sudah ada di seed.

#### Konten model — no schema change needed

`isPublished` + `slug` + `tipe` (NEWS/RENUNGAN) sudah ada di Konten model existing. News + Renungan public endpoints reuse `isPublished` flag (tidak tambah `isPublic` baru).

### 29.3 Endpoints — 8 public + 1 register extension

#### Guest browse (no auth, rate-limit 60/min/IP via `publicBrowseLimiter`)

| Endpoint | Filter | Notes |
|----------|--------|-------|
| `GET /public/ibadah/calendar?cabangId=&from=&to=` | `isActive AND isPublic` | Max 90 hari range, omit petugas |
| `GET /public/event?cabangId=&limit=&page=` | `isActive AND isPublic AND isPublished AND tanggalMulai>=now` | Omit peserta + capacity |
| `GET /public/local-market?cabangId=&industri=&tipeBisnis=&limit=&page=` | `isActive` | Filter cabang via `owner.cabangId`, omit owner contact |
| `GET /public/cabang/:id/rekening` | `isActive` | Verify cabang exists+active first (anti-enumerate) |
| `GET /public/news?cabangId=&limit=&page=` | `tipe=NEWS AND isPublished` | Sort publishedAt DESC |
| `GET /public/news/:id` | `tipe=NEWS AND isPublished` | Accept UUID atau slug, view counter increment |
| `GET /public/renungan?limit=&page=` | `tipe=RENUNGAN AND isPublished` | cabangId di-ignore (renungan global), sort tanggal DESC |
| `GET /public/renungan/:id` | `tipe=RENUNGAN AND isPublished` | Accept UUID atau slug, view counter increment |

#### Path param flexibility

Detail endpoints (`/public/news/:id` + `/public/renungan/:id`) accept **UUID atau slug** via regex auto-detect `/^[0-9a-f-]{36}$/i`. Mobile bisa pakai URL share-able (`/news/youth-camp-2026`) atau UUID untuk programmatic.

#### `POST /auth/register` extension

Tambah optional field `jenisJemaat: 'JEMAAT_TETAP' | 'NEW_COMER'`. Default `JEMAAT_TETAP` (backwards-compat). Backend route ke sub-role yang sesuai. Case-insensitive lookup defensive.

Fulltimer assignment **tidak handled** di signup — admin assign manual via portal Admin → Jemaat → Edit → Roles (existing UI).

### 29.4 Portal UI improvements

#### Cabang form — lat/long fix

- New FieldType `'decimal'` di crud-types — render text input dengan `inputMode='decimal'` (mobile numeric keypad, browser tidak block koma)
- Zod preprocess: normalize koma → titik sebelum coerce. Accept `"-6,2088"` atau `"-6.2088"` atau number direct
- Label "(opsional)" + helperText eksplisit
- Schema sudah optional sebelumnya (no migration)

#### Ibadah menu — grouping per cabang

- **List view**: ganti grouping primer dari kategori → cabang gereja (icon Church)
  - Section header: "X ibadah · Y kategori" counter
  - Table kolom: Nama, **Kategori** (badge), Jadwal, Jam, Pelayan, Status, Aksi
  - Items sorted: kategori → nama dalam tiap cabang
- **Calendar view**: cabang filter dropdown
  - Server-side filter via API param `cabangId`
  - Header badge "Semua Cabang" / "<Nama Cabang>" sesuai filter
  - Query key include `cabangFilter` (cache per filter)
- **Toolbar**: shared cabang dropdown — apply ke list + calendar

#### Portal build script fix

`apps/portal/package.json` build script: `NODE_ENV=production dotenv -e ../../.env -- next build`. Sebelumnya tanpa `NODE_ENV=production` prefix, dotenv load `NODE_ENV=development` dari root `.env` → Next.js build dengan dev mode → prerender error "useContext null".

### 29.5 Decisions yang dicatat di sini

- **`isPublic` terpisah dari `isPublished`** — Event sudah punya `isPublished` (draft/publish), tapi `isPublic` baru untuk gate guest visibility. Konsep: `isPublished` controls member visibility, `isPublic` controls guest visibility. Untuk simplify, kita default `isPublic=true` = published auto-public, admin opt-out untuk content internal.
- **Konten reuse `isPublished`** — TIDAK tambah `isPublic` di Konten. Reasoning: news + renungan secara natural memang public content (gereja publish untuk dijangkau), tidak ada use case privacy granular saat ini.
- **Path param dual-accept** (UUID OR slug) di news/renungan detail — Mobile flexibility. Auto-detect via regex saat handler runtime.
- **Renungan ignore `cabangId`** — Renungan biasanya pelayan firman publish untuk semua jemaat, bukan scoped per cabang. Kalau future butuh cabang-scoped renungan, tambah behavior di-iterasi terpisah.
- **Local-market filter cabang via owner** — LocalBusiness tidak punya `cabangId` langsung; relasi via `ownerJemaatId → Jemaat.cabangId`. Owner detail di response cuma `namaLengkap + cabang` (no kontak HP/email).
- **Cabang rekening defensive lookup** — `findFirst({ id, isActive })` sebelum return rekening, supaya guest tidak bisa enumerate UUID untuk discovery cabang.
- **View counter increment fire-and-forget** — `.catch(() => {})` di detail endpoint. Tidak block response, tidak rate-limit per user.
- **Decimal field type vs number** — `'number'` HTML5 strict block koma di Indonesia locale. `'decimal'` = text + `inputMode='decimal'`, accept koma + titik, mobile numeric keypad. Schema normalize via Zod preprocess.
- **Build script `NODE_ENV=production` prefix** — wajib karena dotenv-cli load `.env` yang punya `NODE_ENV="development"` (untuk dev). Tanpa prefix, Next.js build dengan dev runtime yang error saat static prerender.

### 29.6 Mobile guest-mode flow (reference)

Setelah deploy, mobile bisa replace `<GuestPlaceholderView>` di tab Ibadah/Event/Persembahan dengan view read-only:

| Tab | Data source | Action saat tap |
|-----|-------------|-----------------|
| Home | `/public/news` (3 latest) + `/public/renungan` (1 latest) | Detail screen |
| Ibadah | `/public/ibadah/calendar` | Show "Daftar untuk check-in" CTA |
| Event | `/public/event` | Show "Daftar untuk RSVP" CTA |
| Persembahan | `/public/cabang/:id/rekening` (per cabang) | QRIS displayable, "Daftar untuk e-bukti" CTA |
| Local Market | `/public/local-market` | Browse listing, WhatsApp/website link work |
| News detail | `/public/news/:id` | View counter ++, share button |
| Renungan detail | `/public/renungan/:id` | View counter ++, save bookmark CTA |

Cache strategy mobile (recommended):
- News + Renungan list: 30 menit
- Ibadah calendar: 5 menit
- Event list: 10 menit
- Cabang rekening: 1 jam
- Local market: 15 menit

### 29.7 Workflow deploy notes

VPS pnpm install gotcha: kalau shell sudah ada `export NODE_ENV=production`, pnpm install **skip devDependencies** (prisma + turbo tidak ke-install). Workflow harus:

```bash
unset NODE_ENV
pnpm install              # devDeps ke-install
export NODE_ENV=production
pnpm build                # production build
pm2 reload ecosystem.config.cjs --update-env
```

Atau 1-liner:
```bash
NODE_ENV=development pnpm install && NODE_ENV=production pnpm build && pm2 reload ecosystem.config.cjs --update-env
```

Sudah documented di `docs/future-changes-deploy-workflow.md` Skenario 4.

---

*This document is the source of truth for ECC Core Platform architecture. Update whenever a major decision is made — append to Decision Log (section 13).*
