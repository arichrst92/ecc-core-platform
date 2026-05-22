# ECC Core API — Mobile App Integration Guide

> Panduan integrasi untuk mobile app developer. Mencakup auth flow, common patterns, dan endpoint-endpoint yang paling sering dipakai dari sisi mobile.
> Spec lengkap auto-generated tersedia di `GET /docs` (Swagger UI).

## Base URL

| Environment | URL |
|---|---|
| Development | `http://localhost:4100` |
| Production | `https://core-api.eccchurch.global` |

## Tier Endpoint

Core API punya dua tier endpoint dengan auth model berbeda:

| Prefix | Auth | Untuk |
|---|---|---|
| `/auth/*` | Public (rate-limited) | Login flow (OTP, face), refresh token |
| `/admin/*` | `Authorization: Bearer <JWT>` | Aplikasi yang sudah login user-spesifik (read+write data per jemaat) |
| `/api/v1/*` | `X-API-Key: ecc_xxx_yyy` | Konsumer eksternal stateless (mobile read-only / scanner) |
| `/uploads/*` | Public | Static file serving (foto, QRIS, dll) |

Mobile app biasanya memakai kombinasi: **API key untuk read public data + OTP login JWT untuk action user-spesifik**.

## Common Response Envelope

Semua response JSON mengikuti envelope ini.

### Success

```json
{
  "success": true,
  "data": { /* atau [...] */ },
  "meta": { /* opsional, untuk pagination atau extra info */ }
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input tidak valid",
    "details": { /* opsional */ }
  }
}
```

Error code yang umum:

| Code | HTTP | Arti |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Body/query gagal validasi Zod. `details.fieldErrors` berisi map field → message. |
| `UNAUTHORIZED` | 401 | Token tidak ada / kedaluwarsa / tidak valid. |
| `FORBIDDEN` | 403 | Auth OK tapi tidak punya wewenang (mis. scan tanpa role scanner). |
| `NOT_FOUND` | 404 | Resource tidak ada. |
| `CONFLICT` / `CONSTRAINT_UNIQUE` / `CONSTRAINT_RELATION` | 409 | Duplikat, FK violation, atau resource sedang tertaut data lain. |
| `TOO_MANY_REQUESTS` | 429 | Rate limit hit. Lihat header `Retry-After`. |
| `INTERNAL_ERROR` | 500 | Error tak terduga. Log server punya stack trace. |

### Validation error detail

Response body untuk 400 Zod error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input tidak valid",
    "details": {
      "formErrors": [],
      "fieldErrors": {
        "noHp": ["Format no HP harus E.164 (+62...)"],
        "nama": ["Minimal 2 karakter"]
      }
    }
  }
}
```

Mobile app bisa pakai `details.fieldErrors[field]` untuk highlight input yang salah.

## Pagination

Endpoint list yang paginated menerima query:

```
?page=1&limit=20&search=keyword&sortBy=namaLengkap&sortOrder=asc
```

Response:

```json
{
  "success": true,
  "data": [ /* ... */ ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 137,
    "totalPages": 7
  }
}
```

Default: `page=1`, `limit=20`. Max `limit` per endpoint biasanya 100.

## Phone number normalization (E.164 internasional)

Backend simpan `noHp` dalam **format E.164 internasional** — country code apa saja yang valid, bukan hanya `+62`. Update per **patch 2026-05-21k** untuk support jemaat diaspora / missionari / cabang luar negeri.

**BE validation**: pakai `libphonenumber-js` (port resmi Google libphonenumber). Validate per country: panjang digit, prefix mobile valid, dll. Untuk `+62` perilaku identical dengan regex lama; untuk country lain (mis. `+65`, `+1`, `+61`), validasi spesifik per country rules.

**Contoh format valid:**

| Country | Format E.164 |
|---|---|
| Indonesia | `+6281234567890` |
| Singapore | `+6591234567` |
| US / Canada | `+14155551234` |
| Australia | `+61412345678` |
| Malaysia | `+60123456789` |
| Hong Kong | `+85291234567` |

**Mobile normalize (rekomendasi pakai libphonenumber-js juga):**

```typescript
import { parsePhoneNumber } from 'libphonenumber-js';

function normalizePhone(input: string, defaultCountry = 'ID'): string | null {
  try {
    const parsed = parsePhoneNumber(input, defaultCountry);
    if (!parsed?.isValid()) return null;
    return parsed.format('E.164');  // → "+62..." or "+65..." dll
  } catch {
    return null;
  }
}

// Contoh:
normalizePhone('082115678446');           // → "+6282115678446" (default ID)
normalizePhone('+6582115678446');         // → "+6582115678446" (parsed Singapore)
normalizePhone('+1 (415) 555-1234');      // → "+14155551234"
normalizePhone('087xx');                  // → null (terlalu pendek)
```

**Country picker di mobile UI**: rekomendasi default `+62` (95% jemaat Indonesia), tapi user bisa pilih country lain dari list. Persist last-used country di SecureStore. Validasi real-time per country yang dipilih.

**BE error response (format invalid):**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input tidak valid",
    "details": {
      "fieldErrors": {
        "noHp": ["Format no HP harus E.164 internasional yang valid (contoh: +6281234567890, +6512345678, +14155551234)"]
      }
    }
  }
}
```

> **WhatsApp delivery caveat**: BE side support semua E.164, tapi delivery WhatsApp depends pada provider (Fonnte / Twilio / Meta direct) dan country reachability. Untuk country yang WhatsApp tidak available (mis. China — blocked), user perlu metode auth alternatif yang belum di-build. Untuk launch awal, support country populer (ID/SG/MY/HK/AU/UK/US) — verify dengan provider sebelum mass rollout.

---

# 1. Authentication

## 1.1 Request OTP

Trigger pengiriman OTP ke WhatsApp.

```
POST /auth/otp/request
Content-Type: application/json
```

**Request:**

```json
{
  "noHp": "+6282115678446",
  "purpose": "LOGIN"
}
```

`purpose` enum: `LOGIN`, `ENROLLMENT`, `RESET_FACE`. Default `LOGIN`.

**Response 200:**

```json
{
  "success": true,
  "data": {
    "message": "OTP terkirim ke +6282115678446"
  }
}
```

**Response 404:**

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Nomor HP belum terdaftar sebagai jemaat"
  }
}
```

**Response 429** (rate limited, terlalu banyak request dalam waktu singkat):

```json
{
  "success": false,
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Tunggu beberapa saat sebelum request OTP lagi"
  }
}
```

## 1.2 Verify OTP

Verifikasi OTP yang diterima user → dapat access + refresh token.

```
POST /auth/otp/verify
Content-Type: application/json
```

**Request:**

```json
{
  "noHp": "+6282115678446",
  "kode": "123456",
  "purpose": "LOGIN"
}
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOi...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOi...",
    "expiresIn": 900,
    "user": {
      "id": "8f3c8e22-…",
      "jemaatId": "ab12cd34-…",
      "namaLengkap": "Ari Christian",
      "noHp": "+6282115678446",
      "isFulltimer": true,
      "canAccessPortal": true,
      "menuAccess": {
        "dashboard": { "canRead": true, "canWrite": true, "canDelete": true },
        "jemaat":    { "canRead": true, "canWrite": true, "canDelete": true },
        "event":     { "canRead": true, "canWrite": true, "canDelete": true }
      },
      "hasFaceEnrolled": false,
      "fotoUrl": "/uploads/profiles/jemaat/ab12cd34.webp?v=1716185234567"
    }
  }
}
```

**Notes:**

- `accessToken` valid `expiresIn` detik (default 900 = 15 menit).
- `refreshToken` valid 30 hari (default). Simpan secure di mobile (Keychain/Keystore).
- `menuAccess` = resolved RBAC permission. Mobile app pakai ini untuk hide UI yang user tidak boleh akses (mis. tombol Delete kalau `canDelete=false`).
- `fotoUrl` prefix dengan base URL untuk dapat full URL gambar.

**Response 401:**

```json
{
  "success": false,
  "error": { "code": "UNAUTHORIZED", "message": "OTP salah atau kadaluarsa" }
}
```

## 1.3 Refresh Access Token

Sebelum `accessToken` expired, refresh untuk dapat yang baru.

```
POST /auth/refresh
Content-Type: application/json
```

**Request:**

```json
{ "refreshToken": "eyJ..." }
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...new...",
    "refreshToken": "eyJ...rotated...",
    "expiresIn": 900
  }
}
```

`refreshToken` di-rotate (lama di-revoke, baru di-issue). Simpan yang baru.

**Response 401:** refresh token tidak valid / kedaluwarsa → user harus login ulang.

## 1.4 Face Recognition (opsional)

> **Patch 2026-05-21r** — **switch ke MobileFaceNet (cosine similarity)** dari face-api.js (Euclidean). Mobile pakai native TFLite via `react-native-fast-tflite` + `@react-native-ml-kit/face-detection`. BE compute cosine similarity (pure math, no ML library di server).
>
> **Patch 2026-05-21s** — dim correction: actual `sirius-ai/MobileFaceNet_TF` variant ini output **128-dim**, bukan 192 (initial estimate revised setelah mobile flatbuffer inspect: tensor `embeddings` shape `[1, 128]`, arch file `Logits:[None, 128]`).
>
> **Breaking**: descriptor space berubah total dari face-api.js (descriptor numerik tidak comparable). Stored data lama (`facenet-v1`) di-wipe via migration. Mobile harus pakai `modelVersion: 'mobilefacenet-v1'` saat enroll/login. Dim kebetulan sama (128) — disambiguate **wajib** via `modelVersion`.

### Background

- **Descriptor**: 128-dim Float32 array dari **MobileFaceNet** (native TFLite di mobile, ~100ms inference)
- **Distance metric**: **Cosine similarity** (range ~0..1, higher = better match)
- **Match threshold**: 0.5 default (override via `FACE_MATCH_THRESHOLD` env)
- **Model version**: `mobilefacenet-v1` (stored data dengan model lain ditolak `FACE_MODEL_MISMATCH`)
- **Storage**: `User.faceDescriptor` (Json column 128 float) + `faceModelVersion` + `faceMetadata` audit

### Mobile stack rekomendasi

```
Camera capture → ML Kit detect bounding box → crop face region
              → resize ke 112x112 → MobileFaceNet TFLite → 128-dim descriptor
              → POST /auth/face/enroll atau /auth/face/login
```

Deps:
- `react-native-fast-tflite` — native TFLite inference (NNAPI Android / CoreML iOS)
- `@react-native-ml-kit/face-detection` — Google ML Kit native, fast detection
- Bundle `MobileFaceNet` TFLite model di asset (~4MB)

Sources model: [serengil/deepface](https://github.com/serengil/deepface) atau [sirius-ai/MobileFaceNet_TF](https://github.com/sirius-ai/MobileFaceNet_TF).

### 1.4.1 Face Login

```
POST /auth/face/login
Content-Type: application/json
```

**Request:**

```json
{
  "noHp": "+6282115678446",
  "descriptor": [0.123, -0.456, ...],
  "modelVersion": "mobilefacenet-v1"
}
```

`descriptor` = 128 float array dari MobileFaceNet. `modelVersion` optional tapi rekomendasi kirim — server reject 409 kalau mismatch dengan stored (force re-enroll).

**Response 200:**

```json
{
  "success": true,
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresIn": 900,
    "user": { ... },
    "confidence": 0.82
  }
}
```

`confidence` = cosine similarity directly (0..1 untuk normalized descriptors, higher = better match). Mobile UI bisa pakai untuk tampil "logged in as X (high confidence)".

**Error codes:**

| Status | Code | Penyebab |
|---|---|---|
| 401 | `FACE_NOT_ENROLLED` | Wajah belum terdaftar untuk nomor ini |
| 401 | `FACE_NO_MATCH` | Wajah tidak dikenali (distance > threshold) |
| 409 | `FACE_MODEL_MISMATCH` | client modelVersion beda dengan server |
| 422 | `FACE_INVALID_DESCRIPTOR` | Bukan 128-dim atau ada NaN |
| 429 | rate limit (10/15min/IP) | terlalu banyak attempt |

### 1.4.2 Enrollment status (mobile RESTful)

```
GET /auth/me/face-profile
Authorization: Bearer <JWT>
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "enrolled": true,
    "enrolledAt": "2026-05-21T...",
    "modelVersion": "facenet-v1"
  }
}
```

Untuk yang belum enroll: `{ enrolled: false, enrolledAt: null, modelVersion: null }`.

### 1.4.3 First-time enrollment

```
POST /auth/face/enroll
Authorization: Bearer <JWT>
Content-Type: application/json
```

**Request:**

```json
{
  "descriptor": [0.123, -0.456, ...],
  "modelVersion": "mobilefacenet-v1",
  "metadata": {
    "platform": "ios",
    "deviceModel": "iPhone 15 Pro",
    "appVersion": "0.1.0",
    "consentVersion": "v1-2026-05-21"
  }
}
```

`descriptor` = 128 float dari MobileFaceNet. `modelVersion` default `mobilefacenet-v1`.

`metadata` optional — audit only. `consentVersion` track versi consent screen yang user accept (untuk PDP Law audit trail).

**Response 201:**

```json
{
  "success": true,
  "data": {
    "faceEnrolledAt": "2026-05-21T...",
    "modelVersion": "facenet-v1",
    "hasFaceEnrolled": true
  }
}
```

**Response 409 (sudah enrolled):**

```json
{
  "success": false,
  "error": {
    "code": "FACE_ALREADY_ENROLLED",
    "message": "Wajah sudah terdaftar. Pakai PUT /auth/me/face-profile untuk update."
  }
}
```

### 1.4.4 Re-enrollment (replace existing)

```
PUT /auth/me/face-profile
Authorization: Bearer <JWT>
```

Body sama dengan POST enroll. **Eksplisit replace** existing descriptor — untuk kasus jemaat update wajah (jenggot baru, operasi, dll).

**Response 200:** updated face profile.

### 1.4.5 Delete face profile (PDP Law compliance)

```
DELETE /auth/me/face-profile
Authorization: Bearer <JWT>
```

Hapus face descriptor + metadata. Audit log catat aksi (`RESET_FACE`).

**Response 200:**

```json
{
  "success": true,
  "data": { "hasFaceEnrolled": false }
}
```

Legacy endpoint `POST /auth/face/reset` masih jalan (sama behavior).

### Best practices mobile

- **Consent screen explicit** sebelum first enrollment — link ke privacy policy section "Data Biometrik"
- **Persist `consentVersion`** di metadata setiap enroll (untuk audit trail PDP Law)
- **Client-side liveness check** (blink, head turn) sebelum compute descriptor — server tidak validate liveness, mobile responsibility
- **Threshold**: server pakai 0.5 cosine similarity (range 0..1, higher = better). Confidence = cosine similarity directly (clamp [0,1])
- **Re-enroll trigger**: kalau login fail 3x berturut-turut dengan FACE_NO_MATCH, prompt user "Update wajah?" → PUT /me/face-profile
- **Hapus data**: button "Hapus Data Wajah Saya" di Profile → Privacy section, untuk PDP Law right-to-delete

## 1.5 Get Resolved Access (re-fetch)

Setelah login, untuk re-fetch menu access (mis. admin baru saja ubah RBAC) tanpa logout.

```
GET /auth/me/access
Authorization: Bearer <accessToken>
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "canAccessPortal": true,
    "menuAccess": {
      "jemaat": { "canRead": true, "canWrite": false, "canDelete": false }
    }
  }
}
```

## 1.6 Logout

```
POST /auth/logout
Content-Type: application/json
```

**Request:**

```json
{ "refreshToken": "eyJ..." }
```

**Response 200:** refresh token di-invalidate di server. Hapus token lokal di app.

---

# 2. API Key Authentication (Konsumer Eksternal)

Untuk endpoint `/api/v1/*` yang stateless (tidak butuh user login).

## Header

```
X-API-Key: ecc_AB23xy7K_pQ8wRx2nT4mK6vL9yZ3bF7d
```

Admin generate key di portal `/dashboard/api-key`. Format: `ecc_<prefix>_<secret>`. Mobile app harus simpan secure (Keychain/Keystore — TIDAK di shared preferences plain).

## Response saat key invalid

**401:**

```json
{
  "success": false,
  "error": { "code": "UNAUTHORIZED", "message": "API key tidak dikenali" }
}
```

Atau saat header tidak ada:

```json
{
  "success": false,
  "error": { "code": "UNAUTHORIZED", "message": "X-API-Key header tidak ada" }
}
```

---

# 3. Jemaat — Lookup by Kode

Setiap jemaat punya QR code unik 8 char (alphanumeric uppercase) di field `kode`. Dipakai untuk scan check-in event / ibadah.

```
GET /admin/jemaat/by-kode/{kode}
Authorization: Bearer <accessToken>
```

**Example:**

```
GET /admin/jemaat/by-kode/ABC23XYZ
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "id": "ab12cd34-…",
    "kode": "ABC23XYZ",
    "namaLengkap": "Ari Christian",
    "noHp": "+6282115678446",
    "fotoUrl": "/uploads/profiles/jemaat/ab12cd34.webp?v=1716185234567",
    "isActive": true,
    "cabang": {
      "id": "11111-…",
      "nama": "ECC Jakarta"
    }
  }
}
```

**Response 404:**

```json
{
  "success": false,
  "error": { "code": "NOT_FOUND", "message": "Kode jemaat tidak ditemukan" }
}
```

---

# 4. Ibadah — Calendar & Check-in

## 4.1 List ibadah

```
GET /admin/ibadah?cabangId={uuid}&page=1&limit=20
Authorization: Bearer <accessToken>
```

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "id": "33333-…",
      "nama": "Ibadah Minggu Pagi",
      "tipeJadwal": "WEEKLY",
      "hari": "MINGGU",
      "tanggalMulai": "2026-01-04",
      "jamMulai": "08:00",
      "jamSelesai": "10:00",
      "lokasi": "Aula Utama, ECC Jakarta",
      "isOnline": false,
      "isActive": true,
      "cabang": { "id": "11111-…", "nama": "ECC Jakarta" },
      "kategoriIbadah": { "id": "22222-…", "nama": "Ibadah Umum" },
      "pelayananCount": 3,
      "petugasCount": 12
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 4, "totalPages": 1 }
}
```

## 4.2 Calendar occurrences

Generate semua occurrence (recurring + ONCE) di rentang tanggal, skip yang di-cancel.

```
GET /admin/ibadah/calendar?from=2026-05-01&to=2026-05-31&cabangId={uuid}
Authorization: Bearer <accessToken>
```

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "ibadahId": "33333-…",
      "tanggal": "2026-05-03",
      "nama": "Ibadah Minggu Pagi",
      "jamMulai": "08:00",
      "jamSelesai": "10:00",
      "tipeJadwal": "WEEKLY",
      "lokasi": "Aula Utama, ECC Jakarta",
      "isOnline": false,
      "cabang": { "id": "11111-…", "nama": "ECC Jakarta" },
      "kategoriIbadah": { "id": "22222-…", "nama": "Ibadah Umum" }
    },
    {
      "ibadahId": "33333-…",
      "tanggal": "2026-05-10",
      "nama": "Ibadah Minggu Pagi",
      "jamMulai": "08:00",
      "jamSelesai": "10:00",
      "tipeJadwal": "WEEKLY",
      "lokasi": "Aula Utama, ECC Jakarta",
      "isOnline": false,
      "cabang": { "id": "11111-…", "nama": "ECC Jakarta" },
      "kategoriIbadah": { "id": "22222-…", "nama": "Ibadah Umum" }
    }
  ],
  "meta": { "from": "2026-05-01", "to": "2026-05-31", "count": 12 }
}
```

Rentang maksimal 366 hari.

## 4.3 Check-in via scan QR jemaat

User volunteer di lokasi ibadah scan QR di kartu jemaat → record kehadiran.

```
POST /admin/ibadah/{ibadahId}/checkin
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request:**

```json
{
  "kode": "ABC23XYZ",
  "tanggalIbadah": "2026-05-19",
  "force": false
}
```

- `kode` — kode QR yang di-scan.
- `tanggalIbadah` — opsional. Kalau tidak diisi, default = hari ini.
- `force` — set `true` untuk override warning (occurrence yang ditiadakan).

**Response 200 (sukses):**

```json
{
  "success": true,
  "data": {
    "id": "ee44ff55-…",
    "ibadahId": "33333-…",
    "jemaatId": "ab12cd34-…",
    "tanggalIbadah": "2026-05-19",
    "status": "JOIN",
    "kode": "R7K2X9P3",
    "joinedAt": "2026-05-19T08:05:23.123Z",
    "jemaat": {
      "id": "ab12cd34-…",
      "namaLengkap": "Ari Christian",
      "fotoUrl": "/uploads/profiles/jemaat/ab12cd34.webp?v=1716185234567",
      "noHp": "+6282115678446"
    }
  },
  "meta": {
    "alreadyCheckedIn": false,
    "walkIn": true
  }
}
```

`walkIn=true` artinya jemaat belum reservasi sebelumnya; sistem auto-create reservasi dengan status JOIN.

**Response 200 (sudah check-in sebelumnya, idempotent):**

```json
{
  "success": true,
  "data": { /* row reservasi */ },
  "meta": {
    "alreadyCheckedIn": true,
    "walkIn": false
  }
}
```

Mobile app harus tampilkan toast info, bukan error.

**Response 403 (tidak berwenang scan):**

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Ari Christian tidak berwenang scan check-in ibadah \"Ibadah Minggu Pagi\". Hubungi admin untuk minta akses sebagai authorized scanner."
  }
}
```

**Response 404 (kode jemaat tidak ada):**

```json
{
  "success": false,
  "error": { "code": "NOT_FOUND", "message": "Kode jemaat \"ABC23XYZ\" tidak ditemukan." }
}
```

**Response 409 (occurrence ditiadakan, perlu force):**

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Ibadah \"Ibadah Minggu Pagi\" pada 2026-12-25 sudah ditiadakan. Kirim ulang dengan force=true untuk tetap check-in."
  }
}
```

---

# 5. Event — List, Detail, Check-in

## 5.1 List event published

```
GET /admin/event?isPublished=true&page=1&limit=20
Authorization: Bearer <accessToken>
```

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "id": "evt-111-…",
      "judul": "Retreat Pemuda 2026",
      "slug": "retreat-pemuda-2026",
      "ringkasan": "Retreat 3 hari di Puncak untuk pemuda.",
      "heroImageUrl": "/uploads/content/hero/event/evt-111.webp?v=1716185234567",
      "videoUrl": "https://youtube.com/watch?v=abc123",
      "tanggalMulai": "2026-08-15T00:00:00.000Z",
      "tanggalSelesai": "2026-08-17T00:00:00.000Z",
      "lokasi": "Wisma Cibubur, Puncak",
      "tipeBayar": "NOMINAL_TETAP",
      "nominal": "750000",
      "quotaPeserta": 50,
      "butuhKehadiran": true,
      "isPublished": true,
      "publishedAt": "2026-05-01T10:00:00.000Z",
      "sinode": { "id": "…", "nama": "ECC Indonesia" },
      "cabang": { "id": "…", "nama": "ECC Jakarta" },
      "pesertaCount": 23
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 3, "totalPages": 1 }
}
```

**Notes:**

- `tipeBayar` enum: `GRATIS`, `NOMINAL_TETAP`, `NOMINAL_BEBAS`.
- `nominal` adalah Decimal string (untuk presisi finansial). Parse dengan `Number(nominal)` atau library decimal.
- `butuhKehadiran=true` → event punya scan check-in di hari H.

## 5.2 Detail event

```
GET /admin/event/{idOrSlug}
Authorization: Bearer <accessToken>
```

Bisa pakai ID UUID atau slug.

**Response 200:**

```json
{
  "success": true,
  "data": {
    "id": "evt-111-…",
    "judul": "Retreat Pemuda 2026",
    "slug": "retreat-pemuda-2026",
    "deskripsi": "## Tentang Retreat\n\nDetail lengkap...",
    "heroImageUrl": "/uploads/content/hero/event/evt-111.webp?v=…",
    "videoUrl": "https://youtube.com/watch?v=abc123",
    "tanggalMulai": "2026-08-15T00:00:00.000Z",
    "tanggalSelesai": "2026-08-17T00:00:00.000Z",
    "jamMulai": "09:00",
    "jamSelesai": "12:00",
    "lokasi": "Wisma Cibubur, Puncak",
    "tipeBayar": "NOMINAL_TETAP",
    "nominal": "750000",
    "qrisImageUrl": "/uploads/content/event/qris/evt-111.webp?v=…",
    "bankNama": "BCA",
    "bankNomor": "1234567890",
    "bankAtasNama": "Yayasan ECC",
    "quotaPeserta": 50,
    "butuhKehadiran": true,
    "tags": ["youth", "retreat", "summer"],
    "isPublished": true,
    "author": { "id": "…", "jemaat": { "id": "…", "namaLengkap": "Ari Christian" } },
    "pesertaCount": 23,
    "myParticipation": {
      "id": "part-uuid-...",
      "eventId": "evt-111-...",
      "jemaatId": "ab12cd34-...",
      "status": "DAFTAR",
      "nominalBayar": "750000",
      "catatan": "Ukuran kaos L",
      "buktiTransferUrl": null,
      "registeredAt": "2026-05-15T10:30:00.000Z",
      "paidAt": null,
      "attendedAt": null,
      "cancelledAt": null
    }
  }
}
```

**`myParticipation`** field — partisipasi user current di event ini. **Source of truth untuk render CTA** ("Daftar Sekarang" vs "Lanjut Pembayaran" vs "Menunggu Verifikasi" dll). Lebih reliable daripada local storage yang fragile saat fresh install/device change.

- `null` → user belum daftar → tampil **"Daftar Sekarang"**
- `status: 'DAFTAR'` + paid event → tampil **"Lanjut Pembayaran"**
- `status: 'MENUNGGU_VERIFIKASI'` → tampil **"Menunggu Verifikasi Admin"**
- `status: 'BAYAR'` → tampil **"Sudah Terdaftar — sampai jumpa di event!"**
- `status: 'HADIR'` → tampil **"Sudah Hadir"**
- `status: 'BATAL'` → treat seperti `null` (boleh re-register, BE akan reactivate ke DAFTAR)

> **Patch 2026-05-21i**: field `myParticipation` ditambah ke response detail per request mobile. Sebelumnya hanya `pesertaCount`, dan mobile rely on local storage untuk track status user — fragile di edge case.

> **Patch 2026-05-22**: field `jamMulai` / `jamSelesai` ditambah (string `HH:mm`, 24-hour WIB, nullable). Konsisten dengan `Ibadah`. Kalau null → date-only event (festival tanpa jadwal jam spesifik). Existing events di-set null secara default, admin bisa edit untuk add jam. Mobile fallback: kalau `jamMulai` null, parse jam dari ISO `tanggalMulai` (existing helper); kalau ISO jam = T00:00:00 → hide row jam.

## 5.2.1 Get my participation status (standalone)

Alternative ke `myParticipation` field di detail — endpoint terpisah untuk refetch hanya status partisipasi user, tanpa fetch full event detail. Berguna untuk refresh setelah register/cancel/upload bukti.

```
GET /admin/event/{idOrSlug}/peserta/me
Authorization: Bearer <accessToken>
```

Bisa pakai ID UUID atau slug (sama pola dengan endpoint detail).

**Response 200 (terdaftar):**

```json
{
  "success": true,
  "data": {
    "id": "part-uuid-...",
    "eventId": "evt-uuid-...",
    "jemaatId": "jemaat-uuid-...",
    "status": "DAFTAR",
    "nominalBayar": "750000",
    "catatan": "Ukuran kaos L",
    "buktiTransferUrl": null,
    "registeredAt": "2026-05-15T10:30:00.000Z",
    "paidAt": null,
    "attendedAt": null,
    "cancelledAt": null
  }
}
```

**Response 404 (belum daftar):**

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Anda belum terdaftar di event ini."
  }
}
```

**Pattern recommendation:**

- **Initial load event detail** — pakai `GET /:idOrSlug` saja, baca `data.myParticipation` (1 query, efisien)
- **After mutation** (register/cancel/upload bukti) — pakai `GET /:idOrSlug/peserta/me` untuk refetch participation cepat tanpa re-fetch full detail

## 5.3 Daftar peserta

User mobile daftarkan diri sebagai peserta event. (Catatan: endpoint admin sekarang yang dipakai — kalau mobile app dipakai untuk self-register, perlu endpoint public `/api/v1/event/*` yang belum di-build).

```
POST /admin/event/{eventId}/peserta
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request:**

```json
{
  "jemaatId": "ab12cd34-…",
  "nominalBayar": 750000,
  "catatan": "Ukuran kaos L"
}
```

**Response 201:**

```json
{
  "success": true,
  "data": {
    "id": "part-222-…",
    "eventId": "evt-111-…",
    "jemaatId": "ab12cd34-…",
    "status": "DAFTAR",
    "nominalBayar": "750000",
    "registeredAt": "2026-05-19T10:30:00.000Z"
  }
}
```

**Response 409 (quota penuh):**

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Quota peserta 50 sudah penuh untuk event \"Retreat Pemuda 2026\"."
  }
}
```

## 5.4 Upload bukti transfer

Setelah transfer manual ke rekening event, jemaat upload bukti.

```
POST /admin/event/{eventId}/peserta/{participationId}/bukti
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data

foto: <file>
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "id": "part-222-…",
    "status": "MENUNGGU_VERIFIKASI",
    "buktiTransferUrl": "/uploads/content/event/bukti/part-222.webp?v=…",
    "paidAt": null
  }
}
```

Status auto-naik ke `MENUNGGU_VERIFIKASI`. Admin verify di portal → naik ke `BAYAR`.

## 5.5 Check-in event via scan QR jemaat

Sama pola dengan ibadah check-in. Volunteer event scan QR jemaat di hari H.

```
POST /admin/event/{eventId}/checkin
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request:**

```json
{
  "kode": "ABC23XYZ",
  "force": false
}
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "id": "part-222-…",
    "status": "HADIR",
    "attendedAt": "2026-08-15T07:30:00.000Z",
    "jemaat": {
      "id": "…",
      "namaLengkap": "Ari Christian",
      "fotoUrl": "/uploads/profiles/jemaat/….webp?v=…"
    }
  },
  "meta": { "alreadyCheckedIn": false }
}
```

**Response 409 (belum bayar, paid event):**

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Ari Christian belum melakukan pembayaran (status: DAFTAR). Approve bukti transfer dulu, atau kirim ulang dengan force=true untuk override."
  }
}
```

Admin bisa retry dengan `force=true` untuk override (mis. jemaat bayar cash on-the-spot).

## 5.6 Batalkan partisipasi sendiri (self-cancel)

User batalkan registrasi event-nya sendiri tanpa hubungi admin. Endpoint resolve current user dari JWT — mobile **tidak perlu kirim `participationId`** di path.

```
DELETE /admin/event/{eventId}/peserta/me
Authorization: Bearer <accessToken>
```

**Response 200 (cancel sukses):**

```json
{
  "success": true,
  "data": {
    "id": "part-222-...",
    "eventId": "evt-111-...",
    "jemaatId": "ab12cd34-...",
    "status": "BATAL",
    "cancelledAt": "2026-05-21T10:00:00.000Z",
    "registeredAt": "2026-05-20T15:30:00.000Z"
  }
}
```

**Response 200 (idempotent — sudah BATAL):**

```json
{
  "success": true,
  "data": { /* existing row */ },
  "meta": { "alreadyCancelled": true }
}
```

**Response 404 (belum terdaftar):**

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Anda belum terdaftar di event ini."
  }
}
```

**Response 400 (sudah HADIR — tidak bisa cancel):**

```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Anda sudah hadir di event ini — tidak bisa membatalkan partisipasi. Kalau ada kekeliruan, hubungi admin event."
  }
}
```

**Behavior matrix:**

| Status before | Action | Status after | Response |
|---|---|---|---|
| (no row) | reject | — | 404 |
| `DAFTAR` | cancel | `BATAL` | 200 |
| `MENUNGGU_VERIFIKASI` | cancel | `BATAL` | 200 |
| `BAYAR` | cancel | `BATAL` | 200 (refund manual via admin) |
| `HADIR` | reject | `HADIR` | 400 |
| `BATAL` | no-op | `BATAL` | 200 + `meta.alreadyCancelled: true` |

**Soft cancel**: row tidak di-hard-delete. Audit log catat `kind: event-self-cancel` + previous status. Slot kuota otomatis kembali available untuk user lain (quota guard filter `status: { not: 'BATAL' }`).

**Mobile UX rekomendasi:**

```typescript
async function cancelMyParticipation(eventId: string) {
  const res = await api.delete(`/admin/event/${eventId}/peserta/me`);
  if (res.success) {
    if (res.meta?.alreadyCancelled) {
      toast.info('Partisipasi sudah dibatalkan sebelumnya');
    } else {
      toast.success('Partisipasi berhasil dibatalkan. Slot Anda kembali available.');
    }
    // Hapus dari local store / refetch event detail
    removeParticipation(eventId);
    refetchEventDetail(eventId);
  }
}
```

UI flow:
- Tombol "Batalkan Pendaftaran" muncul kalau user punya participation dengan status `DAFTAR` / `MENUNGGU_VERIFIKASI` / `BAYAR`
- Tap → confirm modal "Yakin batalkan? Slot Anda akan kembali available"
- Submit → DELETE endpoint → toast + refetch

**Setelah cancel, user boleh re-register** lewat `POST /admin/event/:id/peserta` — backend deteksi existing row dengan status BATAL dan **reactivate** ke DAFTAR (response 201, `meta.reactivated: true`).

> **Catatan refund**: kalau user cancel setelah status BAYAR, refund di-handle **manual via admin WhatsApp**. Endpoint cancel hanya update status; tidak ada flow refund otomatis (out of scope).

## 5.7 Event Donations — multi-payment (fundraising / cicilan / top-up)

> **Patch 2026-05-21l**: untuk event fundraising (`NOMINAL_BEBAS`) yang butuh multi-donation per jemaat (cicilan bulanan, top-up persembahan misi, dll), backend punya sub-table `EventDonation` baru. Setiap "memberi" = 1 donation row terpisah dengan bukti & approval sendiri.

**Konsep:**

- **`EventParticipation`** = "saya terdaftar/akan hadir" (registration commitment, 1 row per jemaat per event)
- **`EventDonation`** = "saya memberi <nominal> ke event ini" (giving record, **multi-row** per participation)

**Use cases:**

- **Fundraising pembangunan** — jemaat memberi cicilan Rp 500k Jan, Rp 500k Feb (2 donation row)
- **Persembahan misi** — initial Rp 1jt + top-up Rp 500k (2 donation row)
- **Persembahan tahunan** — multiple giving sepanjang tahun (n donation row)
- **Event regular paid** (NOMINAL_TETAP retreat) — biasanya 1 donation row per participation

### 5.7.1 List my donations (mobile)

```
GET /admin/event/{eventId}/donations/me
Authorization: Bearer <accessToken>
```

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "id": "don-uuid-1",
      "participationId": "part-uuid",
      "nominalBayar": "500000",
      "buktiTransferUrl": "/uploads/content/event/donation-bukti/don-uuid-1.webp?v=…",
      "status": "BAYAR",
      "catatan": "Cicilan Januari 2026",
      "paidAt": "2026-01-15T10:00:00.000Z",
      "approvedAt": "2026-01-15T14:30:00.000Z",
      "createdAt": "2026-01-15T09:30:00.000Z"
    },
    {
      "id": "don-uuid-2",
      "nominalBayar": "500000",
      "buktiTransferUrl": null,
      "status": "MENUNGGU_VERIFIKASI",
      "catatan": "Cicilan Februari 2026",
      "createdAt": "2026-02-10T08:00:00.000Z"
    }
  ],
  "meta": {
    "count": 2,
    "totalConfirmed": 500000
  }
}
```

`meta.totalConfirmed` = sum nominalBayar yang status BAYAR (untuk display di mobile "Anda sudah memberi Rp 500.000").

### 5.7.2 Create donation (mobile / admin)

```
POST /admin/event/{eventId}/donations
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request:**

```json
{
  "nominalBayar": 500000,
  "catatan": "Cicilan Januari 2026 untuk pembangunan gedung"
}
```

**Behavior:**

- Auto-resolve / create `EventParticipation` untuk user current. Tidak perlu register dulu untuk fundraising — donation langsung create participation status DAFTAR kalau belum ada.
- Nominal divalidasi per event.tipeBayar:
  - `GRATIS` → **rejected 400** ("event gratis tidak menerima donation")
  - `NOMINAL_TETAP` → nominal harus tepat sama dengan `event.nominal`
  - `NOMINAL_BEBAS` → nominal >= `event.nominal` (kalau di-set sebagai minimum)

**Response 201:**

```json
{
  "success": true,
  "data": {
    "id": "don-uuid",
    "participationId": "part-uuid",
    "nominalBayar": "500000",
    "buktiTransferUrl": null,
    "status": "MENUNGGU_VERIFIKASI",
    "catatan": "...",
    "createdAt": "..."
  }
}
```

### 5.7.3 Upload bukti transfer per donation

```
POST /admin/event/{eventId}/donations/{donationId}/bukti
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data

bukti: <binary>
```

Field name fleksibel (foto/bukti/file/image — sama pola dengan endpoint upload lain). Max 5MB. Accept JPEG/PNG/WebP/HEIC.

**Response 200:** updated donation dengan `buktiTransferUrl` field terisi.

### 5.7.4 Admin: list all donations + fundraising progress

```
GET /admin/event/{eventId}/donations?status=BAYAR&page=1&limit=50
Authorization: Bearer <accessToken>
```

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "id": "don-uuid",
      "nominalBayar": "500000",
      "status": "BAYAR",
      "paidAt": "...",
      "participation": {
        "id": "part-uuid",
        "jemaat": { "id": "...", "namaLengkap": "Ari Christian", "fotoUrl": "..." }
      },
      "approver": { "id": "...", "namaLengkap": "Admin Cabang" }
    }
  ],
  "meta": {
    "page": 1, "limit": 50, "total": 23, "totalPages": 1,
    "totalAmountConfirmed": 12500000
  }
}
```

`meta.totalAmountConfirmed` = total fundraising progress (sum nominalBayar where status=BAYAR) — admin pakai untuk display progress bar event detail.

### 5.7.5 Admin: approve donation

```
POST /admin/event/{eventId}/donations/{donationId}/approve
Authorization: Bearer <accessToken>
```

Shortcut admin: set status BAYAR + paidAt + approvedBy + approvedAt. Equivalent dengan `PATCH /donations/{donationId} { status: 'BAYAR' }`.

**Response 200:** updated donation.

### 5.7.6 Cancel donation

```
DELETE /admin/event/{eventId}/donations/{donationId}
Authorization: Bearer <accessToken>
```

Soft cancel — status → BATAL. Idempotent (BATAL → `meta.alreadyCancelled: true`). File bukti di-hapus best-effort.

### Behavior flow per use case

**Fundraising event NOMINAL_BEBAS — multi-donation:**

```
User open event "Pembangunan Gedung 2026" (NOMINAL_BEBAS, no min)
  │
  ├─ Tap "Beri Donasi" → POST /donations { nominalBayar: 500000 }
  │   ↓ BE create participation (status DAFTAR) + donation (status MENUNGGU_VERIFIKASI)
  │
  ├─ Upload bukti → POST /donations/:donationId/bukti
  │   ↓ status tetap MENUNGGU_VERIFIKASI
  │
  ├─ Admin approve → POST /donations/:donationId/approve
  │   ↓ status BAYAR, paidAt set
  │
  ├─ User open event lagi 1 bulan kemudian → tap "Beri Donasi" lagi
  │   ↓ POST /donations { nominalBayar: 500000 } (donation row baru — no 409!)
  │
  └─ History GET /donations/me → tampil 2 donation, totalConfirmed = 500000+500000
```

**Paid event NOMINAL_TETAP (retreat) — single donation:**

```
User register retreat (Rp 750.000)
  │
  ├─ Tap "Daftar" → POST /peserta { jemaatId } (existing flow, EventParticipation)
  │
  ├─ Tap "Bayar Sekarang" → POST /donations { nominalBayar: 750000 }
  │   ↓ donation row created
  │
  ├─ Upload bukti → POST /donations/:donationId/bukti
  │
  └─ Admin approve → status BAYAR
```

**Free event — no donation:**

```
User register → POST /peserta. EventDonation tidak dibuat.
```

### Mobile UI rekomendasi

- **Tab/section "Donations history"** di event detail kalau `tipeBayar == NOMINAL_BEBAS`:
  - List donation cards dengan tanggal + nominal + status (Menunggu/Sudah Diverifikasi/Batal)
  - Total di atas: "Anda sudah memberi Rp 500.000 untuk event ini"
  - Tombol "Beri Donasi Lagi" → buka form input nominal + catatan
- **Untuk NOMINAL_TETAP**: gabungkan dengan registration flow — setelah register, langsung create donation (atau prompt "lanjut bayar")
- **Untuk GRATIS**: hide donation UI sama sekali

### Field reference EventDonation

| Field | Tipe | Catatan |
|---|---|---|
| `id` | UUID | donationId untuk upload bukti / approve |
| `participationId` | UUID | parent EventParticipation |
| `nominalBayar` | string (Decimal) | required, > 0 |
| `buktiTransferUrl` | string \| null | URL bukti, null kalau belum upload |
| `status` | enum | `MENUNGGU_VERIFIKASI` \| `BAYAR` \| `BATAL` |
| `catatan` | string \| null | mis. "Cicilan Januari" |
| `paidAt` | ISO timestamp \| null | set saat admin approve |
| `approvedBy` | UUID \| null | adminJemaatId yang approve |
| `approvedAt` | ISO timestamp \| null | timestamp approval |
| `createdAt` | ISO timestamp | saat donation row dibuat |

> **Catatan backward-compat**: endpoint lama `POST /admin/event/:id/peserta/:participationId/bukti` masih ada (deprecated). Field `EventParticipation.nominalBayar` & `buktiTransferUrl` tetap untuk row existing — tidak ber-impact ke donations. New code harus pakai EventDonation. Existing data sebelum patch sudah di-backfill 1 donation row per participation yang punya payment data.

---

# 6. Reservasi Ibadah (Mobile Scanner)

Endpoint `/api/v1/*` untuk mobile scanner app yang **tanpa login JWT** — pakai API key.

## 6.1 Lookup reservasi by kode

```
GET /api/v1/reservasi/by-kode/{kode}
X-API-Key: ecc_AB23xy7K_pQ8wRx2nT4mK6vL9yZ3bF7d
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "id": "res-333-…",
    "kode": "R7K2X9P",
    "status": "RESERVE",
    "tanggalIbadah": "2026-05-19",
    "jemaat": {
      "id": "…",
      "namaLengkap": "Ari Christian",
      "fotoUrl": "/uploads/profiles/jemaat/….webp?v=…",
      "noHp": "+6282115678446"
    },
    "ibadah": {
      "id": "…",
      "nama": "Ibadah Minggu Pagi",
      "jamMulai": "08:00",
      "jamSelesai": "10:00"
    }
  }
}
```

## 6.2 Check-in via kode reservasi (legacy)

```
POST /api/v1/reservasi/checkin
X-API-Key: ecc_AB23xy7K_…
Content-Type: application/json
```

**Request:**

```json
{ "kode": "R7K2X9P" }
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "id": "res-333-…",
    "status": "JOIN",
    "joinedAt": "2026-05-19T08:05:23.123Z"
  }
}
```

## 6.3 Cancel reservasi

```
POST /api/v1/reservasi/cancel
X-API-Key: ecc_AB23xy7K_…
Content-Type: application/json
```

**Request:**

```json
{ "kode": "R7K2X9P" }
```

**Response 200:**

```json
{
  "success": true,
  "data": { "status": "CANCEL", "cancelledAt": "…" }
}
```

> **Catatan deprecation**: Flow ini pakai **kode reservasi** (unique per (jemaat, ibadah, tanggal)). Flow yang **direkomendasikan** sekarang adalah `POST /admin/ibadah/:id/checkin` dengan **kode jemaat** global (lihat section 4.3). Kode reservasi tetap support untuk backward-compat mobile app yang belum di-update.

---

# 7. News & Renungan (Content)

## 7.1 List news

```
GET /admin/news?isPublished=true&page=1&limit=10
Authorization: Bearer <accessToken>
```

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "id": "news-444-…",
      "tipe": "NEWS",
      "judul": "Jadwal Ibadah Natal 2026",
      "slug": "jadwal-ibadah-natal-2026",
      "ringkasan": "Ibadah Natal dan Tahun Baru di seluruh cabang ECC.",
      "konten": "# Jadwal Ibadah Natal\n\n…",
      "heroImageUrl": "/uploads/content/hero/news/news-444.webp?v=…",
      "tags": ["natal", "jadwal"],
      "isPublished": true,
      "publishedAt": "2026-12-01T10:00:00.000Z",
      "viewCount": 423,
      "sinode": null,
      "cabang": null,
      "author": { "jemaat": { "namaLengkap": "Ari Christian", "fotoUrl": null } }
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 5, "totalPages": 1 }
}
```

## 7.2 Detail news/renungan (by ID atau slug)

```
GET /admin/news/{idOrSlug}
GET /admin/renungan/{idOrSlug}
```

Untuk renungan, response punya field tambahan: `tanggal` (tanggal renungan ditujukan) dan `ayatAlkitab`.

```json
{
  "success": true,
  "data": {
    "tipe": "RENUNGAN",
    "judul": "Pengharapan Baru",
    "tanggal": "2026-05-19",
    "ayatAlkitab": "Yeremia 29:11",
    "konten": "## Pengharapan Baru\n\nFirman Tuhan dalam Yeremia 29:11..."
  }
}
```

---

# 8. Cabang Info (untuk Mobile Profile / About)

## 8.1 Cabang detail dengan rekening

```
GET /admin/cabang/{id}
GET /admin/cabang/{id}/rekening
Authorization: Bearer <accessToken>
```

**Response (rekening):**

```json
{
  "success": true,
  "data": [
    {
      "id": "rek-555-…",
      "purpose": "Persembahan Umum",
      "bankNama": "BCA",
      "bankNomor": "1234567890",
      "bankAtasNama": "Yayasan ECC Jakarta",
      "qrisImageUrl": "/uploads/content/cabang/qris/rek-555.webp?v=…",
      "catatan": null,
      "isActive": true
    },
    {
      "id": "rek-556-…",
      "purpose": "Pembangunan",
      "bankNama": "Mandiri",
      "bankNomor": "9876543210",
      "bankAtasNama": "Yayasan ECC Jakarta",
      "qrisImageUrl": "/uploads/content/cabang/qris/rek-556.webp?v=…",
      "catatan": "Khusus pembangunan gedung baru",
      "isActive": true
    }
  ]
}
```

Mobile app bisa render screen "Persembahan" dengan multiple rekening + tampilkan QRIS yang sesuai.

---

# 9. File / Image URLs

Semua URL gambar relatif terhadap base URL backend. Contoh:

```
fotoUrl: "/uploads/profiles/jemaat/ab12cd34.webp?v=1716185234567"
```

Full URL = `${BASE_URL}${fotoUrl}` = `http://localhost:4100/uploads/profiles/jemaat/ab12cd34.webp?v=…`

| Pattern | Path |
|---|---|
| Foto jemaat | `/uploads/profiles/jemaat/{jemaatId}.webp?v=…` |
| Foto user (auth avatar) | `/uploads/profiles/user/{userId}.webp?v=…` |
| Hero news/renungan | `/uploads/content/hero/{news\|renungan}/{kontenId}.webp?v=…` |
| Hero event | `/uploads/content/hero/event/{eventId}.webp?v=…` |
| QRIS event | `/uploads/content/event/qris/{eventId}.webp?v=…` |
| Bukti transfer event | `/uploads/content/event/bukti/{participationId}.webp?v=…` |
| QRIS rekening cabang | `/uploads/content/cabang/qris/{rekeningId}.webp?v=…` |

`?v=<timestamp>` adalah cache buster — saat file di-update, query string berubah, browser/app auto-reload.

Semua file di-serve sebagai WebP (lossy quality 82, max dimension 1024/1600/2000 tergantung jenis).

---

# 10. QR Code Format (untuk Scanner)

Mobile scanner app perlu decode QR code. Format yang dipakai:

| QR Source | Content | Endpoint check-in |
|---|---|---|
| **Kartu QR Jemaat** (statis, satu kartu untuk semua acara) | 8 char alphanumeric upper (mis. `ABC23XYZ`) | `/admin/ibadah/{id}/checkin` atau `/admin/event/{id}/checkin` |
| **QR Reservasi** (per reservasi, legacy) | 8 char alphanumeric upper (mis. `R7K2X9P`) | `/api/v1/reservasi/checkin` |

**Distinction**: keduanya 8 char alphanumeric. Mobile app harus tahu konteks (sedang di mode check-in ibadah dengan kode jemaat, atau scan kode reservasi mobile-only).

QR image untuk kartu jemaat di-generate via `api.qrserver.com` di portal — mobile app bisa pakai pattern sama:

```
https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=ABC23XYZ
```

Atau generate offline di mobile dengan library lokal (mis. `qrcode_flutter`, `react-native-qrcode-svg`).

---

# 11. Practical Patterns

## Token refresh interceptor

Pattern untuk mobile app (Dart/Kotlin/Swift):

```typescript
// Pseudocode
async function apiCall(path, options) {
  let res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${accessToken}` },
  });

  // Token expired? Try refresh once.
  if (res.status === 401) {
    const refreshed = await refreshAccessToken(refreshToken);
    if (refreshed) {
      accessToken = refreshed.accessToken;
      refreshToken = refreshed.refreshToken;
      saveTokensSecure({ accessToken, refreshToken });
      // Retry original request
      res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${accessToken}` },
      });
    } else {
      // Refresh failed → user harus login ulang
      redirectToLogin();
    }
  }

  return res;
}
```

## Idempotent check-in handling

Saat scan QR berhasil tapi `meta.alreadyCheckedIn=true`, mobile app tampilkan **info biru** (bukan error), supaya UX tidak terlihat seperti gagal:

```typescript
if (response.success) {
  if (response.meta?.alreadyCheckedIn) {
    showToast(`${name} sudah check-in sebelumnya`, 'info');
  } else if (response.meta?.walkIn) {
    showToast(`${name} berhasil check-in (walk-in)`, 'success');
  } else {
    showToast(`${name} berhasil check-in`, 'success');
  }
}
```

## Offline scanner queue

Untuk lokasi event yang signal jelek, mobile app bisa antri scan offline:

1. Scan QR → simpan `{ kode, eventId/ibadahId, tanggalIbadah, scannedAt }` di local DB.
2. Background worker retry kirim ke server saat online.
3. Backend idempotent — duplicate scan tidak harm (mengembalikan `alreadyCheckedIn=true`).

## Polling new events

Untuk dashboard mobile yang refresh data:

- Cache list response dengan key `[endpoint, params]` di local DB.
- Pull-to-refresh → re-fetch dan invalidate cache.
- Tampilkan timestamp last-refresh: "Diperbarui 2 menit lalu".

## Image loading

```typescript
// Cache busting otomatis lewat ?v=… di URL, tidak perlu manual.
<img src={`${BASE_URL}${fotoUrl}`} />
```

Untuk caching, biarkan browser/OS-level cache handle. Karena `?v=` berbeda saat foto di-update, cache otomatis refresh.

## File upload (multipart) — universal pattern

Semua endpoint upload image di backend pakai helper `flexImageUpload` yang lenient:

### Field name fleksibel

Backend accept semua nama field umum: **`foto`, `bukti`, `file`, `image`** — pilih yang paling readable di mobile codebase. Field pertama yang berisi image akan dipakai (kalau kirim multiple, sisanya di-ignore).

```typescript
// React Native FormData — semua works:
const formData = new FormData();

formData.append('foto', { uri, type: 'image/jpeg', name: 'foto.jpg' });   // ✓
formData.append('bukti', { uri, type: 'image/jpeg', name: 'bukti.jpg' }); // ✓
formData.append('file', { uri, type: 'image/jpeg', name: 'file.jpg' });   // ✓
formData.append('image', { uri, type: 'image/jpeg', name: 'image.jpg' }); // ✓
```

> **Konvensi rekomendasi**: pakai field name sesuai konteks — `foto` untuk profile, `bukti` untuk bukti transfer, `hero` untuk hero image. BE tidak peduli, ini cuma untuk readability mobile codebase.

### MIME types yang diterima

| Format | MIME | Catatan |
|---|---|---|
| JPEG | `image/jpeg`, `image/jpg` | ✓ Standard |
| PNG | `image/png` | ✓ Standard |
| WebP | `image/webp` | ✓ Standard |
| HEIC | `image/heic` | ✓ iOS Live Photo, auto-convert ke WebP |
| HEIF | `image/heif` | ✓ iOS Live Photo, auto-convert ke WebP |
| GIF | `image/gif` | ✓ Frame pertama ja yang disimpan |
| Octet-stream | `application/octet-stream` | ✓ Toleran (Android camera kadang tidak set MIME) |

### Size limit

Default **5 MB**. Backend resize otomatis (max 1024/1600/2000px depend jenis). Mobile **tidak perlu** kompres dulu, tapi disarankan untuk bandwidth.

### Endpoint upload yang ada

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /admin/me/foto` | JWT | Foto profile diri (Phase 1) |
| `POST /admin/event/:id/peserta/:participationId/bukti` | JWT | Bukti transfer event berbayar |
| `POST /admin/event/:id/hero` | JWT | Hero image event |
| `POST /admin/event/:id/qris` | JWT | QRIS image event |
| `POST /admin/cabang/:id/rekening/:rekeningId/qris` | JWT | QRIS per rekening cabang |
| `POST /admin/news/:id/hero` / `/admin/renungan/:id/hero` | JWT | Hero image news/renungan |
| `POST /upload/jemaat/:jemaatId/foto` | JWT | Foto jemaat (legacy) |
| `POST /upload/user/me/foto` | JWT | Foto user/avatar (legacy) |

### Contoh React Native — upload bukti transfer

```typescript
async function uploadBukti(eventId: string, participationId: string, photoUri: string) {
  const formData = new FormData();
  // @ts-ignore — RN FormData accept this shape
  formData.append('bukti', {
    uri: photoUri,
    type: 'image/jpeg',
    name: 'bukti-transfer.jpg',
  });

  const res = await fetch(
    `${BASE_URL}/admin/event/${eventId}/peserta/${participationId}/bukti`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // JANGAN set Content-Type — RN auto-set dengan boundary
      },
      body: formData,
    }
  );

  const data = await res.json();
  if (!data.success) {
    // data.error.message akan kasih clue:
    // - "File bukti transfer wajib..." → field name salah / body kosong
    // - "Tipe file tidak didukung (image/xxx)..." → MIME unexpected
    // - "File terlalu besar..." → > 5MB
    throw new Error(data.error.message);
  }
  return data.data; // updated EventParticipation
}
```

### Common errors

| Status | Code | Penyebab | Fix |
|---|---|---|---|
| 400 | `BAD_REQUEST` | "File bukti transfer wajib..." | Body kosong / field name tidak terkirim. Cek FormData append + JANGAN set Content-Type manual |
| 400 | `BAD_REQUEST` | "Tipe file tidak didukung..." | MIME bukan image — cek mimeType yang di-set di FormData |
| 400 | `BAD_REQUEST` | "File terlalu besar. Maksimum 5 MB..." | Kompres dulu (resize ke 1600px width / quality 80) |
| 400 | `BAD_REQUEST` | "Hanya boleh upload 1 file." | Multiple files di-append, BE batasi 1 |
| 404 | `NOT_FOUND` | Partisipasi tidak ditemukan | Cek path param `eventId` dan `participationId` |

> **Bug fix 2026-05-21f**: sebelumnya BE hanya accept field name `foto` + MIME jpeg/png/webp. iOS HEIC ditolak, dan mobile dev yang pakai field name `bukti` (logical untuk endpoint /bukti) dapat 400 misterius. Sudah di-fix dengan helper baru `flexImageUpload` yang lenient.

---

# 12. Mobile App Phase 1 — Self-Service, Family, Branch Change

> **Status:** All endpoints di section ini ditambahkan pada **2026-05-21** sebagai respons feedback tim mobile app (`api-gap-analysis.md` + `backend-meeting-brief.md`). Mereka melengkapi cakupan M1–M9 di mobile dev plan.

## 12.0 Public Cabang Catalog (Pre-Auth)

Untuk picker cabang di signup screen, mobile butuh list cabang **sebelum** user authenticated. Endpoint ini public (no auth), rate-limited per IP.

> **Background:** request asli di `docs/backend-request-cabang-list.md` (mobile 2026-05-20).

```
GET /auth/cabang
GET /auth/cabang?isActive=false   # hanya yang nonaktif (rare)
GET /auth/cabang?isActive=all     # semua, termasuk nonaktif
```

Default = `isActive=true` (hanya cabang aktif).

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "id": "11111111-1111-1111-1111-111111111111",
      "nama": "ECC Jakarta",
      "kode": "JKT",
      "alamat": "Jl. Sudirman No.1, Jakarta Pusat",
      "latitude": -6.2088,
      "longitude": 106.8456,
      "isActive": true
    },
    {
      "id": "22222222-2222-2222-2222-222222222222",
      "nama": "ECC Bandung",
      "kode": "BDG",
      "alamat": "Jl. Asia Afrika No.15, Bandung",
      "latitude": -6.9175,
      "longitude": 107.6191,
      "isActive": true
    }
  ]
}
```

**Field whitelist (BE-side):** `id, nama, kode, alamat, latitude, longitude, isActive`. **Tidak ada**: kontak admin, sinodeId, jumlah jemaat. Untuk display kota gunakan `nama` (konvensi naming = "ECC <Kota>") atau parse `alamat`. Kolom `kota` terpisah tidak ada di schema saat ini.

**Rate limit:** 30 request/menit/IP. Lihat header `RateLimit-Remaining` untuk monitor sisa quota.

**Caching guide (mobile):**

- Cache full response di local store (mis. `expo-secure-store` key `ecc.branches`) + timestamp
- Cache age < 24 jam → pakai cache
- Pull-to-refresh atau cache expired → fetch ulang
- Cabang nonaktif jangan ditampilkan di picker (tapi data tetap ada di-cache buat backward-compat — kalau user terlanjur pilih cabang yang sekarang nonaktif, signup akan ditolak BE dengan 400 di `/auth/register`)

**Validation di `/auth/register`:** BE tetap re-validate `cabangId` (must exist + `isActive=true`). Mobile tidak perlu enforce di sisi client — kalau stale cache kasih cabang nonaktif, error message dari server cukup informatif.

---

## 12.1 Self-Registration (M1)

Flow: request OTP `purpose=ENROLLMENT` → verify OTP → submit form data → akun langsung aktif.

### Step 1: Request OTP enrollment

```
POST /auth/otp/request
Content-Type: application/json

{
  "noHp": "+6281234567890",
  "purpose": "ENROLLMENT"
}
```

Beda dengan `purpose=LOGIN`: BE tidak require nomor sudah terdaftar — yang penting nomor belum dipakai jemaat lain. Kalau sudah, response 409.

### Step 2: Verify OTP

```
POST /auth/otp/verify
{ "noHp": "+6281234567890", "kode": "123456", "purpose": "ENROLLMENT" }
```

**Response untuk `purpose=ENROLLMENT` BERBEDA dari LOGIN** — karena jemaat belum ada, BE tidak return JWT. Cuma marker bahwa OTP sudah ter-verify dan mobile boleh lanjut ke `/auth/register`.

**Response 200:**

```json
{
  "success": true,
  "data": {
    "otpVerified": true,
    "purpose": "ENROLLMENT",
    "noHp": "+6281234567890",
    "pendingRegistration": true,
    "nextStep": "POST /auth/register",
    "validForSeconds": 900
  },
  "message": "OTP terverifikasi. Lanjutkan ke /auth/register untuk menyelesaikan registrasi."
}
```

Mobile harus segera lanjut ke `POST /auth/register` dalam 15 menit (sesuai `validForSeconds`). Setelah itu, OTP verify expired dan user harus request ulang.

> **Bug fix 2026-05-21c**: sebelumnya endpoint ini selalu coba lookup jemaat by noHp setelah verify → untuk ENROLLMENT throw "Data tidak ditemukan" karena jemaat memang belum ada. Sudah di-fix — verify ENROLLMENT sekarang skip lookup.

### Step 3: Submit data diri

**Minimal payload (3 field wajib):**

```
POST /auth/register
Content-Type: application/json

{
  "noHp": "+6281234567890",
  "namaLengkap": "Budi Santoso",
  "jenisKelamin": "L",
  "cabangId": "11111111-1111-1111-1111-111111111111"
}
```

**Full payload (semua field optional):**

```json
{
  "noHp": "+6281234567890",
  "namaLengkap": "Budi Santoso",
  "jenisKelamin": "L",
  "cabangId": "11111111-1111-1111-1111-111111111111",

  "tanggalLahir": "1995-03-15",
  "alamat": "Jl. Sudirman No. 123, Jakarta",
  "homecellId": null,
  "fotoBase64": "data:image/jpeg;base64,/9j/4AAQSk..."
}
```

**Field requirements:**

| Field | Required | Catatan |
|---|---|---|
| `noHp` | ✅ | Format E.164 (`+62...`), harus match dengan OTP verified |
| `namaLengkap` | ✅ | Min 2 karakter |
| `jenisKelamin` | ✅ | `"L"` atau `"P"` |
| `cabangId` | ✅ | UUID cabang aktif (dari `GET /auth/cabang`) |
| `tanggalLahir` | ⚪ optional | ISO date `YYYY-MM-DD`. Kalau tidak diisi → DB simpan `null` |
| `alamat` | ⚪ optional | Max 500 char. Kalau tidak diisi → DB simpan `null` |
| `homecellId` | ⚪ optional | UUID, kalau ada langsung jadi member homecell |
| `fotoBase64` | ⚪ optional | Bisa upload terpisah via `POST /admin/me/foto` |

> **Decision (2026-05-21d)**: signup form mobile cuma butuh nama + jenis kelamin + cabang. `tanggalLahir` dan `alamat` bisa user lengkapi via `PATCH /admin/me` setelah login. Tujuan: minimize friction onboarding.

**Response 201:**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresIn": 900,
    "user": {
      "id": "8f3c8e22-…",
      "jemaatId": "ab12cd34-…",
      "namaLengkap": "Budi Santoso",
      "noHp": "+6281234567890",
      "isFulltimer": false,
      "canAccessPortal": false,
      "menuAccess": { /* sesuai role default Jemaat:Jemaat Tetap */ },
      "hasFaceEnrolled": false,
      "fotoUrl": "/uploads/profiles/jemaat/ab12cd34.webp?v=…"
    }
  },
  "meta": {
    "kind": "register",
    "jemaatCreatedId": "ab12cd34-…",
    "userCreatedId": "8f3c8e22-…"
  }
}
```

**Error responses:**

| Status | Code | Penyebab |
|---|---|---|
| 401 | `UNAUTHORIZED` | OTP enrollment belum diverify atau sudah > 15 menit |
| 409 | `CONFLICT` | Nomor sudah terdaftar |
| 400 | `BAD_REQUEST` | Cabang tidak valid / nonaktif |
| 429 | `TOO_MANY_REQUESTS` | > 3 register/jam dari IP yang sama |

Auto-assign role: kalau seed punya role "Jemaat" dengan subrole "Jemaat Tetap", jemaat baru langsung dapat assignment ini. Kalau tidak, jemaat tetap dibuat tanpa role (admin perlu assign manual).

## 12.2 Profile Self-Service (M6)

### GET /admin/me — profil diri

```
GET /admin/me
Authorization: Bearer <JWT>
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "id": "ab12cd34-…",
    "namaLengkap": "Ari Christian",
    "kode": "A3K7P9XQ",
    "noHp": "+6282115678446",
    "tanggalLahir": "1992-05-15",
    "jenisKelamin": "L",
    "alamat": "Jl. ...",
    "fotoUrl": "/uploads/profiles/jemaat/ab12cd34.webp?v=…",
    "cabang": { "id": "11111-…", "nama": "ECC Jakarta", "kode": "JKT" },
    "jemaatRoles": [
      { "role": { "nama": "Fulltimer" }, "subRole": { "nama": "Administration" }, "subRoleStatus": { "nama": "Staff" } }
    ],
    "homecellMembership": [
      { "homecell": { "id": "…", "nama": "Sudirman 1", "area": { "id": "…", "nama": "Jakarta Pusat" } } }
    ],
    "ministries": [
      { "id": "<jemaat-pelayanan-id>", "pelayananId": "<pelayanan-id>", "nama": "Tim Multimedia", "posisi": "Sound", "posisiLevel": 0, "tanggalMulai": "2026-01-15" }
    ],
    "user": { "id": "…", "fotoUrl": null, "faceEnrolledAt": null }
  }
}
```

> **Patch 2026-05-22** — `ministries` field baru (flat dari `jemaatPelayanan` active). Plus `kode` self-heal: kalau legacy user belum punya kode, BE auto-generate saat first fetch. Mobile tidak perlu special handling.

### PATCH /admin/me — edit field tertentu

Field yang boleh self-edit: `namaLengkap`, `email`, `tanggalLahir`, `jenisKelamin`, `alamat`, `cabangId`.

**Tidak boleh:** `noHp` (perlu OTP), `kode` (immutable, auto-generated).

> **Patch 2026-05-22** — `cabangId` sekarang boleh langsung diubah (direct branch change, no admin approval). Lebih simple. Endpoint legacy `/branch-change-request` masih ada untuk backward compat tapi mobile boleh skip.

```
PATCH /admin/me
Authorization: Bearer <JWT>

{
  "alamat": "Jl. Baru No. 99, Jakarta",
  "cabangId": "<uuid-cabang-baru>"
}
```

**Response 200:** updated Jemaat object. Cabang tidak valid / nonaktif → 400 `Cabang tujuan tidak ditemukan/nonaktif`.

### POST /admin/me/foto — upload foto profil

Multipart, field `foto`, max 5MB, JPEG/PNG/WebP. Resize otomatis ke 1024px max.

```
POST /admin/me/foto
Authorization: Bearer <JWT>
Content-Type: multipart/form-data

foto: <binary>
```

**Response 200:**

```json
{ "success": true, "data": { "id": "ab12cd34-…", "fotoUrl": "/uploads/profiles/jemaat/ab12cd34.webp?v=1716190000000" } }
```

`?v=…` cache buster otomatis ter-update setiap upload.

## 12.3 Stats — Streak & Summary (M2)

```
GET /admin/me/stats
Authorization: Bearer <JWT>
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "streakWeeks": 4,
    "attendedThisYear": 18,
    "eventsJoined": 3,
    "homecellsActive": 1,
    "totalAttended": 32
  }
}
```

**Definisi:**

- `streakWeeks` — jumlah minggu berturut-turut user punya ≥ 1 reservasi `status=JOIN`. Toleran 1 minggu (kalau minggu ini belum sempat hadir tapi minggu lalu hadir, streak tidak break). Max 52.
- `attendedThisYear` — total reservasi `status=JOIN` tahun berjalan (Jan 1 → hari ini).
- `eventsJoined` — total `EventParticipation` `status != BATAL`.
- `homecellsActive` — jumlah membership homecell yang `isActive=true`.
- `totalAttended` — total reservasi JOIN dalam 52 minggu terakhir (untuk grafik).

## 12.4 Scanner List (M7)

User yang ditandai `canScanAttendance=true` di salah satu petugas event/ibadah dapat scan QR di endpoint `/checkin`. Mobile app pakai list ini untuk show tombol "Scanner Mode" hanya kalau user authorized.

### GET /admin/me/scanner-events

```
GET /admin/me/scanner-events
Authorization: Bearer <JWT>
```

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "eventId": "ev-uuid",
      "judul": "Retreat Pemuda 2026",
      "slug": "retreat-pemuda-2026",
      "tanggalMulai": "2026-06-12T09:00:00.000Z",
      "tanggalSelesai": "2026-06-14T18:00:00.000Z",
      "lokasi": "Wisma Anugrah, Puncak",
      "pelayananNama": "Usher",
      "role": "Leader",
      "level": 10
    }
  ]
}
```

Hanya event dengan `butuhKehadiran=true` yang muncul.

### GET /admin/me/scanner-ibadah

```
GET /admin/me/scanner-ibadah
Authorization: Bearer <JWT>
```

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "ibadahId": "ib-uuid",
      "nama": "Ibadah Minggu Pagi",
      "cabangId": "cb-uuid",
      "tipeJadwal": "WEEKLY",
      "hari": "MINGGU",
      "jamMulai": "08:00",
      "jamSelesai": "10:00",
      "lokasi": "Aula Utama",
      "kategori": "Ibadah Umum",
      "pelayananNama": "Usher",
      "role": "Member",
      "level": 0
    }
  ]
}
```

De-duped by ibadahId (kalau user di banyak pelayanan untuk 1 ibadah, hanya muncul 1x).

## 12.5 Stats Kehadiran (Scanner Live Counts) (M7)

Polling-friendly. Disarankan poll interval 10-15 detik saat scanner mode active.

### Event

```
GET /admin/event/{id}/checkin/stats
Authorization: Bearer <JWT>
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "eventId": "ev-uuid",
    "quotaPeserta": 200,
    "total": 187,
    "hadir": 142,
    "byStatus": {
      "DAFTAR": 12,
      "MENUNGGU_VERIFIKASI": 5,
      "BAYAR": 28,
      "HADIR": 142,
      "BATAL": 3
    },
    "lastUpdated": "2026-06-12T10:23:45.123Z"
  }
}
```

`total` = jumlah peserta non-BATAL. `hadir` = sudah check-in. Quota progress = `total / quotaPeserta`.

### Ibadah (per tanggal)

```
GET /admin/ibadah/{id}/checkin/stats?tanggalIbadah=2026-05-19
Authorization: Bearer <JWT>
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "ibadahId": "ib-uuid",
    "tanggalIbadah": "2026-05-19",
    "reserved": 23,
    "joined": 487,
    "cancelled": 4,
    "total": 510,
    "lastUpdated": "2026-05-19T09:45:01.000Z"
  }
}
```

`tanggalIbadah` opsional — default hari ini.

## 12.6 Homecell Self-Service (M9)

Endpoint untuk user yang PIC homecell atau PIC area di mobile app.

### GET /admin/me/homecell-managed

Homecell yang user-nya PIC (`Homecell.picJemaatId = user.jemaatId`).

```
GET /admin/me/homecell-managed
Authorization: Bearer <JWT>
```

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "id": "hc-uuid",
      "nama": "Sudirman 1",
      "alamat": null,
      "hari": null,
      "jam": null,
      "area": { "id": "ar-uuid", "nama": "Jakarta Pusat", "cabang": { "id": "cb-uuid", "nama": "ECC Jakarta" } },
      "memberCount": 7
    }
  ]
}
```

### GET /admin/me/homecell-area-managed

Area yang user-nya PIC.

```
GET /admin/me/homecell-area-managed
Authorization: Bearer <JWT>
```

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "id": "ar-uuid",
      "nama": "Jakarta Pusat",
      "cabang": { "id": "cb-uuid", "nama": "ECC Jakarta" },
      "homecellCount": 4
    }
  ]
}
```

### POST /admin/homecell/{id}/members/by-kode

Tambah member homecell via scan QR kode jemaat.

```
POST /admin/homecell/hc-uuid/members/by-kode
Authorization: Bearer <JWT>

{ "kode": "A3K7P9XQ" }
```

**Response 201:**

```json
{
  "success": true,
  "data": {
    "id": "hm-uuid",
    "homecellId": "hc-uuid",
    "jemaatId": "ab12cd34-…",
    "isActive": true,
    "tanggalBergabung": "2026-05-21",
    "jemaat": { "namaLengkap": "Budi", "kode": "A3K7P9XQ", "fotoUrl": "…" }
  }
}
```

**Errors:** 404 kode tidak ditemukan, 400 jemaat sudah jadi member.

> **Catatan:** endpoint POST /admin/homecell/{id}/members (lama, by jemaatId) tetap ada — pakai itu untuk admin portal yang udah pilih jemaat dari dropdown.

### GET /admin/homecell/{id} — detail dengan members lengkap

Mobile PIC homecell buka detail homecell-nya. Includes nested `members[]` dengan info jemaat lengkap (id, nama, kode, fotoUrl, noHp, jenisKelamin) untuk render list di mobile.

```
GET /admin/homecell/hc-uuid
Authorization: Bearer <JWT>
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "id": "hc-uuid",
    "nama": "Sudirman 1",
    "alamat": "Jl. Sudirman No.12",
    "hari": "Rabu",
    "jam": "19:00",
    "isActive": true,
    "picJemaatId": "j-uuid-pic",
    "area": {
      "id": "ar-uuid",
      "nama": "Jakarta Pusat",
      "picJemaatId": "j-uuid-area-pic",
      "cabang": { "id": "cb-uuid", "nama": "ECC Jakarta", "kode": "JKT" }
    },
    "picJemaat": { "id": "...", "namaLengkap": "Maria", "fotoUrl": "...", "noHp": "..." },
    "members": [
      {
        "id": "hm-uuid",
        "jemaatId": "j-uuid-1",
        "isActive": true,
        "tanggalBergabung": "2026-01-15",
        "tanggalKeluar": null,
        "jemaat": {
          "id": "j-uuid-1",
          "namaLengkap": "Budi Santoso",
          "kode": "ABC23XYZ",
          "fotoUrl": "/uploads/profiles/jemaat/...",
          "noHp": "+6281234567890",
          "jenisKelamin": "L"
        }
      }
    ]
  }
}
```

`area.picJemaatId` ada di response — mobile bisa cek apakah current user adalah PIC area parent (untuk authorization area-level view).

### DELETE /admin/homecell/{id}/members/by-jemaat/{jemaatId} — soft remove

Mobile PIC homecell hapus member (jemaat pindah/drop). **Soft delete** — set `isActive=false` + `tanggalKeluar`. Audit trail tetap (row tidak hard-delete).

```
DELETE /admin/homecell/hc-uuid/members/by-jemaat/j-uuid-1
Authorization: Bearer <JWT>
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "id": "hm-uuid",
    "isActive": false,
    "tanggalKeluar": "2026-05-20",
    ...
  }
}
```

**Response 200 (idempotent — sudah dikeluarkan):**

```json
{
  "success": true,
  "data": { /* existing row */ },
  "meta": { "alreadyRemoved": true }
}
```

> **Beda dengan `DELETE /:id/members/:memberId`**: yang lama lookup by member row ID + hard delete (admin portal). Yang baru ini lookup by jemaatId + soft delete (mobile PIC flow).

### GET /admin/homecell-area/{id}/homecells — list per area

Mobile PIC area buka detail area → tampil semua homecell di area itu, **termasuk yang user-nya bukan PIC homecell-nya**. Shape ringkas untuk mobile.

```
GET /admin/homecell-area/ar-uuid/homecells
Authorization: Bearer <JWT>
```

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "id": "hc-uuid",
      "nama": "Sudirman 1",
      "alamat": "...",
      "hari": "Rabu",
      "jam": "19:00",
      "isActive": true,
      "picJemaat": { "id": "...", "namaLengkap": "Maria", "fotoUrl": "...", "noHp": "..." },
      "memberCount": 7
    }
  ]
}
```

Filter `isActive=true` di-apply otomatis — kalau perlu lihat archived homecell, pakai `GET /admin/homecell-area/:id` (full detail dengan semua homecell, untuk admin).

---

# 13. Mobile App Phase 1 — Family Management (M5)

Endpoint family-relasi self-managed di mobile. Berbeda dengan `JemaatRelasi` (master data admin), `FamilyRelation` adalah jaringan yang user bangun sendiri di app.

**Decision (2026-05-19): auto-verify** — link langsung verified, tanpa flow konfirmasi 2 arah. Trust-based. Kolom `isVerified` tetap ada di schema untuk future kalau mau switch ke confirmation flow.

## 13.1 Roles

| Role | Arti (dari perspektif "current user" A) |
|---|---|
| `SPOUSE` | A pasangan B (reciprocal: B juga SPOUSE A) |
| `CHILD` | A adalah anak dari B → reciprocal: B adalah PARENT A |
| `PARENT` | A adalah orang tua dari B → reciprocal: B adalah CHILD A |
| `SIBLING` | A saudara kandung B (reciprocal: B SIBLING A) |

Saat user link A→B sebagai `CHILD`, backend auto-create reciprocal row B→A sebagai `PARENT`. User unlink → kedua arah ke-hapus.

## 13.2 List Family

```
GET /admin/me/family
Authorization: Bearer <JWT>
```

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "id": "fr-uuid",
      "role": "SPOUSE",
      "isVerified": true,
      "createdAt": "2026-05-21T...",
      "jemaat": {
        "id": "j2-uuid",
        "namaLengkap": "Maria Christian",
        "noHp": "+6281111111111",
        "kode": "B7X2Y9PQ",
        "fotoUrl": "/uploads/profiles/jemaat/j2-uuid.webp?v=…",
        "tanggalLahir": "1995-08-21",
        "jenisKelamin": "P",
        "cabang": { "id": "cb-uuid", "nama": "ECC Jakarta" },
        "isDependent": false
      }
    },
    {
      "id": "fr-uuid-2",
      "role": "PARENT",
      "isVerified": true,
      "createdAt": "2026-05-21T...",
      "jemaat": {
        "id": "j3-uuid",
        "namaLengkap": "Yosua Christian",
        "noHp": null,
        "kode": "C8M3N1OP",
        "fotoUrl": null,
        "tanggalLahir": "2022-03-10",
        "jenisKelamin": "L",
        "cabang": { "id": "cb-uuid", "nama": "ECC Jakarta" },
        "isDependent": true
      }
    }
  ]
}
```

`isDependent=true` artinya jemaat tsb tidak punya noHp dan user current adalah `primaryGuardian` — biasanya anak balita yang di-register-new via parent.

## 13.3 Link via Scan QR

```
POST /admin/me/family/link-by-kode
Authorization: Bearer <JWT>

{
  "kode": "B7X2Y9PQ",
  "role": "SPOUSE"
}
```

**Response 201:**

```json
{
  "success": true,
  "data": {
    "id": "fr-uuid",
    "jemaatAId": "current-user-jemaatId",
    "jemaatBId": "j2-uuid",
    "role": "SPOUSE",
    "isVerified": true,
    "target": { "id": "j2-uuid", "namaLengkap": "Maria", "kode": "B7X2Y9PQ" }
  }
}
```

Errors: 404 kode tidak ditemukan, 400 link diri sendiri.

## 13.4 Link via No HP

```
POST /admin/me/family/link-by-phone
Authorization: Bearer <JWT>

{
  "noHp": "+6281111111111",
  "role": "SIBLING"
}
```

**Response 201:** sama struktur dengan link-by-kode.

## 13.5 Register-new + Auto-link (anak balita / dependent)

Untuk register jemaat yang belum punya akun (anak balita / lansia tanpa HP), lalu langsung jadi family member current user.

```
POST /admin/me/family/register-new
Authorization: Bearer <JWT>

{
  "namaLengkap": "Yosua Christian",
  "role": "CHILD",
  "tanggalLahir": "2022-03-10",
  "jenisKelamin": "L",
  "alamat": null,
  "noHp": null,
  "cabangId": null
}
```

- `cabangId` default = cabang user current.
- `noHp` opsional. Kalau tidak diisi → jemaat baru di-mark sebagai **dependent** (`primaryGuardianId = current user jemaatId`). Tidak bisa login mandiri.

**Response 201:**

```json
{
  "success": true,
  "data": {
    "jemaat": {
      "id": "j-new-uuid",
      "namaLengkap": "Yosua Christian",
      "kode": "C8M3N1OP",
      "noHp": null
    },
    "family": {
      "id": "fr-uuid",
      "role": "CHILD",
      "isVerified": true
    }
  }
}
```

## 13.6 Update Role

```
PATCH /admin/me/family/{jemaatId}
Authorization: Bearer <JWT>

{ "role": "SIBLING" }
```

`{jemaatId}` di path = jemaat target (jemaatB di row family relation).

**Response 200:** updated FamilyRelation row.

## 13.7 Unlink

```
DELETE /admin/me/family/{jemaatId}
Authorization: Bearer <JWT>
```

Hapus kedua arah (A→B + B→A). 204 No Content. Tidak menghapus akun Jemaat target — hanya hubungan.

## 13.8 Edit Profile Dependent (Patch 2026-05-22)

Parent (primaryGuardian) bisa edit basic profile + foto dependent (anak balita / lansia tanpa HP). Auth: target.primaryGuardianId === current jemaatId DAN target.noHp IS NULL.

### PATCH /admin/me/family/{jemaatId}/profile

```json
{
  "namaLengkap": "Nama Baru",
  "tanggalLahir": "2018-03-12",
  "jenisKelamin": "P",
  "alamat": "Jl. Baru No. 1"
}
```

Allowed fields: `namaLengkap`, `tanggalLahir`, `jenisKelamin`, `alamat`. Disallowed: `noHp`, `email`, `cabangId`, `kode`, `primaryGuardianId` (admin-only).

**Response 200**: updated Jemaat.

**Errors**:
| Status | Penyebab |
|---|---|
| 401 | bukan primaryGuardian dari target |
| 400 | target punya `noHp` (bukan dependent — harus self-edit via PATCH /admin/me) |
| 404 | target tidak ditemukan |

### POST /admin/me/family/{jemaatId}/foto

Multipart, field `foto` (atau `file`/`image`/`bukti`). Same auth check + behavior dengan POST /admin/me/foto.

```
POST /admin/me/family/abc-123/foto
Content-Type: multipart/form-data
```

**Response 200**: `{ id, fotoUrl }`.

---

# 14. Mobile App Phase 1 — Branch Change Request (M6) — LEGACY

> **Patch 2026-05-22** — endpoint ini sekarang **opsional**. Mobile bisa pakai langsung `PATCH /admin/me { cabangId }` untuk direct branch change tanpa approval. Branch change request flow tetap ada untuk backward compat (admin portal queue). Lihat section 12.2.

User submit permohonan pindah cabang. Admin approve di portal → `Jemaat.cabangId` di-update.

## 14.1 Submit Request (User)

```
POST /admin/me/branch-change-request
Authorization: Bearer <JWT>

{
  "targetCabangId": "cb-bandung-uuid",
  "reason": "Saya pindah domisili ke Bandung mulai Juni 2026"
}
```

**Response 201:**

```json
{
  "success": true,
  "data": {
    "id": "bcr-uuid",
    "jemaatId": "ab12cd34-…",
    "currentCabangId": "cb-jakarta-uuid",
    "targetCabangId": "cb-bandung-uuid",
    "reason": "…",
    "status": "PENDING",
    "reviewedBy": null,
    "reviewedAt": null,
    "reviewNote": null,
    "createdAt": "…",
    "updatedAt": "…"
  }
}
```

**Errors:**

| Status | Code | Penyebab |
|---|---|---|
| 400 | `BAD_REQUEST` | Cabang tujuan sama dengan cabang saat ini |
| 400 | `BAD_REQUEST` | Cabang tidak valid / nonaktif |
| 409 | `CONFLICT` | Sudah ada permohonan PENDING (1 PENDING per jemaat) |

## 14.2 List Riwayat Request (User)

```
GET /admin/me/branch-change-requests
Authorization: Bearer <JWT>
```

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "id": "bcr-uuid",
      "currentCabangId": "cb-jakarta-uuid",
      "targetCabangId": "cb-bandung-uuid",
      "reason": "…",
      "status": "APPROVED",
      "reviewedBy": "admin-jemaatId",
      "reviewedAt": "…",
      "reviewNote": "Welcome ke ECC Bandung!",
      "createdAt": "…"
    }
  ]
}
```

Mobile poll endpoint ini saat ada perubahan status (atau saat user open Settings page).

## 14.3 Admin Queue (Portal)

```
GET /admin/branch-change-request?status=PENDING&page=1&limit=20
Authorization: Bearer <JWT>
```

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "id": "bcr-uuid",
      "jemaat": { "id": "…", "namaLengkap": "Budi", "noHp": "+62…", "fotoUrl": "…" },
      "currentCabang": { "id": "…", "nama": "ECC Jakarta", "kode": "JKT" },
      "targetCabang": { "id": "…", "nama": "ECC Bandung", "kode": "BDG" },
      "reason": "…",
      "status": "PENDING",
      "reviewer": null,
      "createdAt": "…"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

## 14.4 Approve / Reject

```
POST /admin/branch-change-request/{id}/review
Authorization: Bearer <JWT>

{
  "decision": "APPROVED",
  "reviewNote": "OK, welcome ke ECC Bandung!"
}
```

Saat APPROVED, BE transaksi:
1. Update `BranchChangeRequest.status` → `APPROVED`, set `reviewedBy/reviewedAt`.
2. Update `Jemaat.cabangId` → `targetCabangId`.

**Response 200:** updated request row.

---

# 15. Mobile App Phase 1 — Batch Event Registration (M3)

Daftarkan multiple anggota keluarga sekaligus ke 1 event.

## 15.1 Endpoint

```
POST /admin/event/{eventId}/peserta/batch
Authorization: Bearer <JWT>

{
  "jemaatIds": [
    "ab12cd34-…",
    "ab12cd35-…",
    "ab12cd36-…"
  ],
  "nominalBayarPerOrang": 250000,
  "catatan": "Keluarga Christian — 3 orang"
}
```

- Max 20 jemaat per request.
- `nominalBayarPerOrang` ignored kalau event GRATIS. Untuk `NOMINAL_TETAP`, auto-set ke `event.nominal`. Untuk `NOMINAL_BEBAS`, dipakai dengan batas minimum.

## 15.2 Response — partial success pattern

```json
{
  "success": true,
  "data": {
    "successful": [
      { "id": "ep1-uuid", "jemaatId": "ab12cd34-…", "status": "DAFTAR", "nominalBayar": "250000", "jemaat": { "namaLengkap": "Ari" } },
      { "id": "ep2-uuid", "jemaatId": "ab12cd35-…", "status": "DAFTAR", "nominalBayar": "250000", "jemaat": { "namaLengkap": "Maria" } }
    ],
    "failed": [
      {
        "jemaatId": "ab12cd36-…",
        "error": { "code": "DUPLICATE", "message": "Jemaat sudah terdaftar di event ini." }
      }
    ]
  }
}
```

**Failure codes per jemaatId:**

| Code | Arti |
|---|---|
| `QUOTA_FULL` | Slot event sudah penuh (per-row check) |
| `DUPLICATE` | Jemaat sudah terdaftar di event ini |
| `NOT_FOUND` | Jemaat ID tidak ada |
| `INTERNAL` | Error tak terduga (unlikely) |

Mobile app handle: tampilkan summary "✓ 2 berhasil, ✗ 1 gagal" + tap untuk lihat detail.

> Untuk register **single jemaat** (mis. user daftar diri sendiri), tetap pakai endpoint lama `POST /admin/event/{eventId}/peserta` — lebih ringkas dan validation lebih ketat.

---

# 16. Rate Limits

Endpoint punya rate limit untuk cegah abuse:

| Endpoint | Limit |
|---|---|
| `/auth/otp/request` | 5 request per 15 menit per IP |
| `/auth/otp/verify`, `/auth/face/login` | 10 attempt per 15 menit per IP |
| `/auth/register` | 3 register per jam per IP |
| `/auth/cabang` | 30 per menit per IP |
| `/auth/refresh` | 30 per 5 menit per IP |
| `/admin/*` (after auth) | 300 per menit per user |
| `/api/v1/*` | 120 per menit per API key |
| Upload endpoints | 20 per menit per user |

Response 429:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Terlalu banyak permintaan. Coba lagi nanti."
  }
}
```

Header `RateLimit-*` (draft-7) ada di response sukses untuk monitor sisa quota. Header `Retry-After` ada di response 429.

---

# 17. Environment URLs

| Variable | Development | Production |
|---|---|---|
| `BASE_URL` | `http://localhost:4100` | `https://core-api.eccchurch.global` |
| `WEB_URL` (portal) | `http://localhost:3100` | `https://portal.eccchurch.global` |
| Swagger spec UI | `{BASE_URL}/docs` | `{BASE_URL}/docs` |

Untuk staging atau preview, biasanya `https://staging-core-api.eccchurch.global`. Konfirmasi dengan DevOps.

---

# 18. Spec Lengkap

OpenAPI 3.0 spec auto-generated tersedia di:

```
{BASE_URL}/docs
```

Browser-based Swagger UI dengan "Try it out" untuk live test. Bisa export ke JSON / import ke Postman / Insomnia / Bruno.

Setiap endpoint admin punya gembok di Swagger UI — klik untuk paste JWT, lalu Try it out akan otomatis kirim dengan auth.

---

# 19. Gap Status (Per 2026-05-21)

Re-evaluasi dari `api-gap-analysis.md` mobile team setelah Phase 1 deploy.

| Mobile Milestone | Status Sebelum | Status Sekarang | Endpoint Baru |
|---|---|---|---|
| M1 Public cabang picker | 🔴 missing (hardcoded di mobile) | 🟢 ready | `GET /auth/cabang` |
| M1 Auth + Self-register | 🟡 sign-up missing | 🟢 ready | `POST /auth/register` |
| M2 Streak hadir | 🔴 missing | 🟢 ready | `GET /admin/me/stats` |
| M3 Batch event register | 🔴 missing | 🟢 ready | `POST /admin/event/:id/peserta/batch` |
| M3 Self-cancel event participation | 🔴 missing (manual via admin) | 🟢 ready | `DELETE /admin/event/:id/peserta/me` |
| M3 Get own participation status | 🔴 missing (rely on local storage) | 🟢 ready | `myParticipation` field di detail + `GET /:idOrSlug/peserta/me` |
| M3 Multi-donation event (fundraising) | 🔴 missing (1 row only per jemaat) | 🟢 ready | 7 endpoint `/donations/*` di event scope |
| M4 Bilingual content | 🟡 partial | 🟡 unchanged (mobile UI only, konten Indo) | — |
| M5 Family management | 🔴 missing | 🟢 ready (auto-verify) | 6 endpoint `/admin/me/family/*` |
| M6 Profile self-edit | 🟡 partial | 🟢 ready | `PATCH /admin/me`, `POST /admin/me/foto` |
| M6 Branch change | 🔴 missing | 🟢 ready | `POST /admin/me/branch-change-request` + admin queue |
| M6 Push notifications | 🔴 missing | 🔴 defer total | — |
| M7 Scanner list | 🔴 missing | 🟢 ready | `GET /admin/me/scanner-events`, `/scanner-ibadah` |
| M7 Live attendance count | 🔴 missing | 🟢 ready (polling) | `GET /admin/{event,ibadah}/:id/checkin/stats` |
| M9 Homecell PIC self-service | 🟡 partial | 🟢 ready | `/admin/me/homecell-managed`, `/admin/me/homecell-area-managed`, `POST /admin/homecell/:id/members/by-kode` |
| M9 Homecell detail + remove member + list per area | 🔴 missing | 🟢 ready | `GET /admin/homecell/:id` (extended), `DELETE /:id/members/by-jemaat/:jemaatId`, `GET /admin/homecell-area/:id/homecells` |
| M11 Face enrollment | 🟡 partial | 🟢 ready | `POST /auth/face/enroll` (already existed) |
| M11 Face recognition full (RESTful + modelVersion + audit) | 🟡 partial | 🟢 ready | `GET/PUT/DELETE /auth/me/face-profile` + standardized error codes + confidence + metadata |
| M5 Dependent profile + foto edit | 🔴 missing | 🟢 ready | `PATCH/POST /admin/me/family/:id/profile|/foto` |
| M6 Direct branch change | 🟡 via request flow | 🟢 ready (langsung) | `PATCH /admin/me { cabangId }` |
| M8 Event jam fields | 🔴 jam selalu T00:00 | 🟢 ready | `Event.jamMulai`/`jamSelesai` HH:mm |
| M16 Ministry list & detail | 🔴 missing | 🟢 ready | `GET /admin/ministry`, `/admin/ministry/:id`, `me.ministries` |
| M16 Jemaat public profile (tap-to-view) | 🔴 missing | 🟢 ready (tiered visibility) | `GET /admin/jemaat-public/:id` |

**Yang masih ditunda (Phase 2+):**

- Push notification infrastructure (FCM/APNS sender, device token registry, notification model).
- WA confirmation flow untuk family link (current = auto-verify; bisa di-switch ke 2-way confirm di future).
- WebSocket realtime (current scanner stats pakai polling, cukup untuk MVP).
- Bilingual content (konten news/renungan tetap Indonesia, UI label di mobile yang diterjemahkan).

---

# 16. Ministry (Pelayanan) — Patch 2026-05-22

> Mobile request: `backend-request-ministry-endpoints.md`. Pelayanan model di BE = master global (Multimedia, Worship, Usher), bukan cabang-specific.

## 16.1 List semua ministry

```
GET /admin/ministry
Authorization: Bearer <JWT>
```

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "id": "<pelayanan-id>",
      "nama": "Tim Multimedia",
      "deskripsi": "Sound, Camera, Streaming...",
      "memberCount": 12,
      "isOpen": true,
      "leader": {
        "jemaat": { "id": "...", "namaLengkap": "Andi", "fotoUrl": "..." },
        "role": "Leader"
      },
      "roles": [
        { "id": "...", "nama": "Leader", "level": 10 },
        { "id": "...", "nama": "Camera", "level": 0 }
      ]
    }
  ]
}
```

`leader` = member dengan role level tertinggi (highest seniority). Bisa null kalau pelayanan kosong. `roles` = preview role-role yang ada di ministry ini (mobile bisa show options sebelum apply).

## 16.2 Detail ministry

```
GET /admin/ministry/:id
Authorization: Bearer <JWT>
```

**Response 200:**

```json
{
  "id": "...",
  "nama": "Tim Multimedia",
  "deskripsi": "...",
  "isOpen": true,
  "memberCount": 12,
  "roles": [...],
  "leader": {...},
  "members": [
    {
      "id": "<jemaat-pelayanan-id>",
      "jemaat": { "id": "...", "namaLengkap": "...", "fotoUrl": "...", "cabang": { "id": "...", "nama": "..." } },
      "posisi": "Sound",
      "sinceDate": "2026-01-15"
    }
  ],
  "myMembership": {
    "id": "<jemaat-pelayanan-id>",
    "posisi": "Sound",
    "sinceDate": "2026-01-15"
  } | null
}
```

`myMembership` populated kalau current user adalah member (untuk mobile UI tampil "Anda terlibat sebagai ...").

## 16.3 Future (DEFERRED)

`POST /admin/ministry/:id/join` — apply membership dengan approval leader. Not implemented di patch ini, scope creep. Mobile bisa add nanti kalau perlu.

---

# 17. Jemaat Public Profile — Patch 2026-05-22

> Mobile request: `backend-request-jemaat-public-profile.md`. Mobile tap nama jemaat lain (dari scanner result, homecell member, family, area PIC, dll) → buka halaman profil ringkas.

> **Penting**: endpoint baru `/admin/jemaat-public/:id`. **Bukan** `/admin/jemaat/:id` (yang itu admin CRUD untuk fulltimer, return full data tanpa privacy filter).

## 17.1 Tiered Visibility

| Field | Public (semua user) | Close Relation (extra) |
|---|---|---|
| id, kode, namaLengkap, fotoUrl, jenisKelamin, isActive | ✅ | ✅ |
| cabang.id, cabang.nama | ✅ | ✅ |
| roles, ministries, homecell | ✅ | ✅ |
| noHpMasked, ulangTahunBulanTgl | ✅ | ✅ |
| noHp (full) | ❌ null | ✅ |
| tanggalLahir (full ISO) | ❌ null | ✅ |
| alamat | ❌ null | ✅ |
| family[] | ❌ null | ✅ |

**Close Relation** = salah satu dari:
1. Same cabang dengan requester
2. Ada FamilyRelation antara requester ↔ target (verified)
3. Co-member di Homecell yang sama (active membership)

## 17.2 Endpoint

```
GET /admin/jemaat-public/:id
Authorization: Bearer <JWT>
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "id": "...",
    "kode": "A3K7P9XQ",
    "namaLengkap": "Andi Pratama",
    "fotoUrl": "/uploads/profiles/jemaat/...",
    "jenisKelamin": "L",
    "isActive": true,
    "cabang": { "id": "...", "nama": "ECC Jakarta" },
    "roles": [...],
    "ministries": [...],
    "homecell": { "id": "...", "nama": "Sudirman 1" } | null,
    "noHpMasked": "+628****8446",
    "ulangTahunBulanTgl": "05-15",
    "noHp": "+6282115678446" | null,
    "tanggalLahir": "1992-05-15" | null,
    "alamat": "Jl. ..." | null,
    "family": [
      { "role": "SPOUSE", "jemaat": { "id": "...", "namaLengkap": "...", "fotoUrl": "..." } }
    ] | null,
    "visibility": {
      "isCloseRelation": true,
      "reason": "same-cabang"  // | "family" | "homecell-co-member" | "public-only"
    }
  }
}
```

**Errors:**
- 404 jemaat tidak ditemukan
- 401 not authenticated (JWT missing/invalid)

## 17.3 Mobile UI hints

- `noHpMasked` selalu tersedia — tampil sebagai badge ringan ("+628****8446"). Kalau `noHp` non-null (close relation), tap → buka WA.
- `ulangTahunBulanTgl` selalu tersedia — bisa pakai untuk badge "🎂 Ulang tahun bulan ini" tanpa expose tahun.
- `visibility.reason` bisa dipakai untuk tooltip ("Anda satu cabang dengan ini, jadi noHp visible").

---

# 20. Support

- Dokumen ini ada di repo: `docs/mobile-api-guide.md`
- Spec lengkap auto-update saat backend deploy.
- Pertanyaan: contact IDEA dev team atau buka issue di repo.
