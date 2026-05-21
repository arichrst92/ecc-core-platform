# Backend Request: Make `tanggalLahir` & `alamat` Optional di `/auth/register`

**Untuk**: Tim Backend ECC (IDEA dev team)
**Dari**: Mobile dev (Ari Christian)
**Tanggal**: 2026-05-21
**Priority**: Low (mobile sudah workaround dengan placeholder values, tidak blocking)
**Status**: ✅ **RESOLVED 2026-05-21** — lihat section "Backend Response" di akhir doc

## Konteks

Mobile signup form di-simplify ke **3 field saja** untuk minimize friction onboarding jemaat baru:
- Nama lengkap
- Jenis kelamin (L/P)
- Cabang gereja

Field yang dihapus dari UI mobile:
- ❌ Tanggal lahir — native date picker bermasalah, plus jemaat sering tidak hafal/tidak nyaman input saat signup
- ❌ Alamat — text bebas, jemaat sering skip atau isi asal saat signup

Decision (per user feedback 2026-05-21): user bisa lengkapi data tersebut **nanti** di Profile → Edit, setelah login. Lebih bagus user onboard cepat dan kembali kemudian, daripada drop di tengah signup karena friction form.

## Workaround mobile saat ini

Mobile kirim **placeholder values** ke `POST /auth/register`:

```typescript
{
  noHp: "+62...",
  namaLengkap: "...",
  jenisKelamin: "L" | "P",
  cabangId: "...",
  tanggalLahir: "2000-01-01",      // PLACEHOLDER
  alamat: "Belum diisi",            // PLACEHOLDER
}
```

Ini supaya BE validation tidak reject. User akan edit kedua field via `PATCH /admin/me` setelah login.

## Permintaan ke BE

**Make `tanggalLahir` & `alamat` optional** di endpoint `POST /auth/register` (mobile-api-guide section 12.1 Step 3).

### Spec yang diharapkan

```typescript
POST /auth/register
{
  noHp: string,           // required
  namaLengkap: string,    // required (min 2)
  jenisKelamin: 'L' | 'P', // required
  cabangId: string,       // required (UUID valid + active)
  tanggalLahir?: string,  // optional, ISO date — kalau tidak ada, BE simpan null
  alamat?: string,        // optional, kalau tidak ada, BE simpan null
  homecellId?: string | null,
  fotoBase64?: string,
}
```

### Schema database

Cek apakah column `Jemaat.tanggalLahir` dan `Jemaat.alamat` di Prisma schema sudah nullable. Kalau belum:
```prisma
model Jemaat {
  ...
  tanggalLahir DateTime?  // ← jadikan optional
  alamat       String?    // ← jadikan optional
  ...
}
```

Backfill jemaat existing yang punya placeholder dari mobile (rare case di awal): biarkan saja, atau set ke NULL via migration.

### Acceptance criteria

- [ ] `POST /auth/register` tidak reject kalau `tanggalLahir` atau `alamat` tidak dikirim
- [ ] Default value di DB: `NULL` untuk kedua field
- [ ] `PATCH /admin/me` tetap bisa update kedua field (sudah ada di section 12.2)
- [ ] `GET /admin/me` return `null` untuk field yang belum diisi (frontend handle dengan placeholder UI "Belum diisi")
- [ ] No breaking change untuk admin portal — bisa tetap input full data di `POST /admin/jemaat` admin endpoint

## Estimasi effort

Kecil. Zod schema update + Prisma migration kalau perlu. **~30 menit-1 jam BE**.

## Setelah endpoint optional

Mobile akan:
1. Hapus placeholder values di mutationFn `register()` call
2. Tetap kirim `namaLengkap`, `jenisKelamin`, `cabangId` saja
3. Profile screen (M6) tampil "Belum diisi" badge untuk field yang null + tombol "Edit Profil"
4. User isi via `PATCH /admin/me` kapan saja

---

# Backend Response — 2026-05-21

**Dari**: Tim Backend ECC (IDEA dev team)
**Untuk**: Mobile dev (Ari Christian)
**Status**: ✅ **DELIVERED**

## Ringkasan

`tanggalLahir` & `alamat` di `POST /auth/register` sekarang **opsional**. Mobile bisa langsung hapus placeholder values dan kirim payload minimal 3-field saja.

## Investigasi schema DB

Cek dulu schema sebelum implement — ternyata kedua kolom **sudah nullable** di `Jemaat`:

```prisma
model Jemaat {
  ...
  tanggalLahir DateTime? @map("tanggal_lahir") @db.Date  // ✓ already optional
  alamat       String?   @db.Text                         // ✓ already optional
  ...
}
```

Jadi **tidak perlu migration**. Yang perlu di-update cuma:
1. Zod schema validation (Zod paksa required walau DB optional)
2. Register handler agar tidak crash saat field undefined

## Perubahan code

### 1. `packages/shared-types/src/schemas/auth.ts`

```typescript
// SEBELUM
export const registerJemaatSchema = z.object({
  noHp: noHpSchema,
  namaLengkap: z.string().trim().min(2).max(255),
  tanggalLahir: z.string().date(),  // ❌ required
  jenisKelamin: z.enum(['L', 'P']),
  alamat: z.string().trim().max(500).optional(),
  cabangId: uuidSchema,
  homecellId: uuidSchema.optional(),
  fotoBase64: z.string().max(5*1024*1024).optional(),
});

// SESUDAH
export const registerJemaatSchema = z.object({
  noHp: noHpSchema,
  namaLengkap: z.string().trim().min(2).max(255),
  jenisKelamin: z.enum(['L', 'P']),
  cabangId: uuidSchema,
  // ↓ semua optional
  tanggalLahir: z.string().date().optional(),
  alamat: z.string().trim().max(500).optional(),
  homecellId: uuidSchema.optional(),
  fotoBase64: z.string().max(5*1024*1024).optional(),
});
```

### 2. `apps/core-api/src/routes/auth.ts` — register handler

```typescript
// SEBELUM (crash kalau input.tanggalLahir undefined)
tanggalLahir: new Date(input.tanggalLahir),
alamat: input.alamat,

// SESUDAH
tanggalLahir: input.tanggalLahir ? new Date(input.tanggalLahir) : null,
alamat: input.alamat ?? null,
```

## Spec final endpoint

**Minimal payload (3 field wajib + noHp):**

```json
POST /auth/register
{
  "noHp": "+6281234567890",
  "namaLengkap": "Budi Santoso",
  "jenisKelamin": "L",
  "cabangId": "11111111-1111-1111-1111-111111111111"
}
```

**Full payload (semua optional):**

```json
{
  "noHp": "+6281234567890",
  "namaLengkap": "Budi Santoso",
  "jenisKelamin": "L",
  "cabangId": "11111111-1111-1111-1111-111111111111",
  "tanggalLahir": "1995-03-15",
  "alamat": "Jl. Sudirman No. 123, Jakarta",
  "homecellId": null,
  "fotoBase64": "data:image/jpeg;base64,..."
}
```

| Field | Required | Catatan |
|---|---|---|
| `noHp` | ✅ | Format E.164, match OTP verified |
| `namaLengkap` | ✅ | Min 2 karakter |
| `jenisKelamin` | ✅ | `"L"` atau `"P"` |
| `cabangId` | ✅ | UUID cabang aktif |
| `tanggalLahir` | ⚪ | ISO date — tidak ada → DB `null` |
| `alamat` | ⚪ | Max 500 char — tidak ada → DB `null` |
| `homecellId` | ⚪ | UUID — kalau ada langsung jadi member |
| `fotoBase64` | ⚪ | Bisa upload terpisah via /admin/me/foto |

Response tetap sama dengan implementasi awal (accessToken + refreshToken + user object).

## Acceptance criteria checklist

- [x] `POST /auth/register` tidak reject kalau `tanggalLahir` atau `alamat` tidak dikirim
- [x] Default value di DB: `NULL` untuk kedua field (schema sudah nullable, handler pakai `?? null`)
- [x] `PATCH /admin/me` tetap bisa update kedua field (existing, no change)
- [x] `GET /admin/me` return `null` untuk field yang belum diisi
- [x] No breaking change untuk admin portal — `POST /admin/jemaat` pakai `createJemaatSchema` yang terpisah, tidak ter-impact
- [x] OpenAPI spec auto-update via Zod `.openapi()` annotation

## Bonus catatan validation

`tanggalLahir` masih validate format ISO date kalau diisi (regex `YYYY-MM-DD`). Kalau mobile kirim string aneh (mis. `"invalid"`), tetap dapat 400 `VALIDATION_ERROR` dengan `tanggalLahir: ["Invalid date"]`.

`alamat` masih validate max 500 char + trim whitespace. Untuk consistent UI, kalau user input cuma spasi, BE trim ke empty string lalu jadi `null` (atau empty string — depends pada Zod transform).

## Action item untuk mobile team

- [ ] Hapus placeholder `tanggalLahir: "2000-01-01"` dan `alamat: "Belum diisi"` di `mutationFn register()`
- [ ] Update signup form: cukup 3 field (nama + jenis kelamin + cabang)
- [ ] Profile screen: handle `null` value untuk `tanggalLahir` & `alamat`:
  - Display "Belum diisi" placeholder dengan icon edit
  - Tap → buka edit modal → `PATCH /admin/me { tanggalLahir, alamat }`
- [ ] Update form validation di mobile — jangan force required di form ini

## File yang berubah

| File | Perubahan |
|---|---|
| `packages/shared-types/src/schemas/auth.ts` | `registerJemaatSchema` — `tanggalLahir` jadi optional, reorder field untuk grouping (required di atas, optional di bawah) |
| `apps/core-api/src/routes/auth.ts` | Register handler — guard `new Date(input.tanggalLahir)` dengan ternary, pakai `?? null` untuk alamat |
| `docs/mobile-api-guide.md` | Section 12.1 Step 3 — tambah tabel field requirements + minimal vs full payload |
| `knowledge-base.md` | Section 26 patch **2026-05-21d** |

## Untouched

- `docs/mobile-app-reference.md` — tidak ada field-level spec di sini, jadi tidak perlu update.
- DB schema — tidak ada migration karena kolom sudah nullable.
- `POST /admin/jemaat` (admin portal) — tetap pakai `createJemaatSchema` yang terpisah, validasi-nya independen.

---

*Ticket closed 2026-05-21. Live di Swagger `{BASE_URL}/docs#/Auth/post_auth_register`.*
