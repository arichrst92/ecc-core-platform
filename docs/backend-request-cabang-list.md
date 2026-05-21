# Backend Request: Public Cabang List Endpoint

**Untuk**: Tim Backend ECC (IDEA dev team)
**Dari**: Mobile dev (Ari Christian)
**Tanggal**: 2026-05-20
**Priority**: Medium (M1.9 blocker untuk full feature, ada workaround)
**Status**: ✅ **RESOLVED 2026-05-21** — lihat section "Backend Response" di akhir doc

## Problem statement

Mobile app butuh list cabang ECC untuk ditampilkan saat **sign-up** (user pilih cabang home). Endpoint `GET /admin/cabang` butuh `Authorization: Bearer <JWT>` — tapi saat signup, user **belum** authenticated, jadi tidak bisa pakai.

Workaround saat ini: cabang list di-hardcode di `app/src/constants/branches.ts` dengan 6 cabang (Jakarta, Bandung, Surabaya, Medan, Semarang, Denpasar). Ini bermasalah karena:

1. Cabang baru (mis. ECC Surabaya soft launch Juni 2026 per news mockup) tidak akan muncul sampai mobile app rilis update + user update.
2. UUID cabang harus match dengan database BE — kalau tidak match, register fail dengan `BAD_REQUEST: cabangId tidak valid`.
3. Tidak skalabel kalau ECC ekspansi ke 20+ cabang.

## Permintaan endpoint

```
GET /auth/cabang?isActive=true
```

**Auth**: Public, rate-limited per IP.

**Query params**:
- `isActive` (opsional, default `true`) — filter aktif/nonaktif

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "id": "11111111-1111-1111-1111-111111111111",
      "nama": "ECC Jakarta",
      "kode": "JKT",
      "kota": "Jakarta",
      "alamat": "Jl. Sudirman No.1, Jakarta Pusat",
      "isActive": true
    },
    {
      "id": "22222222-2222-2222-2222-222222222222",
      "nama": "ECC Bandung",
      "kode": "BDG",
      "kota": "Bandung",
      "alamat": "Jl. Asia Afrika No.15, Bandung",
      "isActive": true
    }
  ]
}
```

**Catatan field**:
- Cukup return field yang relevant untuk user-facing picker (id, nama, kode, kota, alamat). **Jangan return** field sensitif (mis. PIC contact, jumlah jemaat detail).
- `kode` (3-letter) opsional untuk display short name di future UI.

## Rate limiting

| Endpoint | Limit |
|---|---|
| `GET /auth/cabang` | **30 per menit per IP** |

Rasional: cabang list jarang berubah (mungkin 1-2 cabang baru per tahun). Mobile cache 24 jam, fetch saat first launch atau pull-to-refresh.

## Mobile implementation plan

Setelah endpoint live:

1. Cache di `expo-secure-store` dengan key `ecc.branches` + timestamp.
2. Saat splash / app launch:
   - Cache hit + age < 24 jam → pakai cache
   - Cache miss / expired → fetch `GET /auth/cabang` → save cache
3. Picker di signup pakai cache (instant load).
4. Background refresh saat user buka Settings (untuk admin yang sering add cabang).

## Acceptance criteria

- [ ] Endpoint `GET /auth/cabang` accessible tanpa auth
- [ ] Response struktur sesuai spec di atas
- [ ] Rate limit 30/menit/IP enforced
- [ ] Hanya return cabang dengan `isActive=true` by default
- [ ] Cabang nonaktif tidak boleh dipilih saat register (BE validate juga di `/auth/register`)
- [ ] Field set: id, nama, kode, kota, alamat, isActive — no sensitive data

## Estimasi effort

Endpoint kecil. Sebagian besar logika sudah ada di `GET /admin/cabang` — tinggal:
- Buat route public di `/auth/*` (tier endpoint berbeda)
- Whitelist field public
- Apply rate limit middleware

Estimasi: **0.5-1 hari kerja** untuk BE.

## Workaround sampai endpoint live

Mobile lanjut pakai hardcoded list di `src/constants/branches.ts`. Saat endpoint tersedia, refactor di **1 file** saja (fetch dari API, ganti import statement). UI tidak perlu berubah.

## Catatan untuk Phase 2+

Kalau nanti ada fitur public lain yang butuh data pre-auth (mis. ibadah list untuk visitor / guest mode), bisa pakai pattern yang sama: tier `/auth/*` untuk public read-only catalog data.

Endpoint potensial future:
- `GET /auth/cabang/:id` — detail cabang publik (alamat, kontak utk visitor)
- `GET /auth/cabang/:id/ibadah` — schedule ibadah cabang (untuk visitor info)
- `GET /auth/renungan/today` — renungan hari ini (untuk public sharing tanpa login)

Tapi tidak urgent untuk M1.

---

# Backend Response — 2026-05-21

**Dari**: Tim Backend ECC (IDEA dev team)
**Untuk**: Mobile dev (Ari Christian)
**Status**: ✅ **DELIVERED**

## Ringkasan implementasi

Endpoint `GET /auth/cabang` sudah live di branch ini, mengikuti spec di atas dengan **3 catatan minor** (lihat di bawah).

| Item | Status | Detail |
|---|---|---|
| Public endpoint (no auth) | ✅ | Di-mount di tier `/auth/*` (bukan `/admin/*`) — konsisten dengan endpoint pre-auth lain |
| Rate limit 30/menit/IP | ✅ | `cabangListLimiter` baru di `apps/core-api/src/middleware/rate-limit.ts` |
| Field whitelist | ✅ | `id, nama, kode, alamat, latitude, longitude, isActive` — tidak expose kontak/sinodeId/counts |
| Default `isActive=true` | ✅ | Override via `?isActive=false` atau `?isActive=all` |
| Validation di `/auth/register` | ✅ | Sudah cek `isActive` (line existing `if (!cabang \|\| !cabang.isActive)` di register handler) |

## Penyesuaian dari spec asli

1. **Field `kota` tidak di-return.** Schema `CabangGereja` saat ini tidak punya kolom `kota` terpisah — hanya `alamat` (free text) dan konvensi naming `nama` = "ECC <Kota>".

   **Workaround mobile**:
   - Strip prefix "ECC " dari `nama` → dapat kota (works untuk semua seed cabang saat ini).
   - Atau parse dari `alamat` (less reliable).
   - Atau pakai `nama` apa adanya untuk display.

   Kalau strict perlu kolom `kota` dedicated (mis. untuk group-by-kota), buka request baru — tambah kolom + backfill 1-2 hari kerja.

2. **Bonus: `latitude` + `longitude` ikut di-return.** Tidak ada di spec mobile request, tapi ditambah karena:
   - Murah (sudah ada di schema dari fitur Globe dashboard).
   - Berguna untuk future map view di mobile (mis. "cabang terdekat dari lokasi saya").
   - Tidak sensitive — alamat kantor cabang memang public.

   Mobile bisa abaikan kalau belum dipakai.

3. **`?isActive=all` option ditambah** (di luar spec): biasanya admin tools butuh lihat semua termasuk yang nonaktif. Tidak harus dipakai mobile, tapi tersedia kalau perlu.

## Endpoint signature final

```
GET /auth/cabang
GET /auth/cabang?isActive=true   # default
GET /auth/cabang?isActive=false  # hanya nonaktif (rare)
GET /auth/cabang?isActive=all    # semua
```

**Response 200** (single envelope):

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "nama": "ECC Jakarta",
      "kode": "JKT",
      "alamat": "Jl. Sudirman No.1, Jakarta Pusat",
      "latitude": -6.2088,
      "longitude": 106.8456,
      "isActive": true
    }
  ]
}
```

Sort order: `isActive DESC, nama ASC` — yang aktif di atas, lalu alfabet.

## Rate limit response

429 mengikuti pola standard di section 16 mobile-api-guide:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Terlalu banyak permintaan. Coba lagi nanti.",
    "details": { "limiter": "cabang-list" }
  }
}
```

Header `RateLimit-*` (draft-7) ada di response sukses untuk monitor sisa quota.

## Acceptance criteria checklist

- [x] Endpoint `GET /auth/cabang` accessible tanpa auth
- [x] Response struktur sesuai spec (minus `kota`, plus `latitude/longitude`)
- [x] Rate limit 30/menit/IP enforced
- [x] Hanya return cabang dengan `isActive=true` by default
- [x] Cabang nonaktif tidak boleh dipilih saat register (BE validate di `/auth/register`)
- [x] Field set: id, nama, kode, alamat, latitude, longitude, isActive — no sensitive data
- [x] Swagger spec ter-update: `{BASE_URL}/docs#/Auth/get_auth_cabang`

## File yang berubah

| File | Perubahan |
|---|---|
| `apps/core-api/src/routes/auth.ts` | Tambah handler `GET /auth/cabang` + import `cabangListLimiter` |
| `apps/core-api/src/middleware/rate-limit.ts` | Tambah `cabangListLimiter` (30/menit) |
| `apps/core-api/src/openapi.ts` | Register path di tag "Auth" |
| `docs/mobile-api-guide.md` | Section baru 12.0 (Public Cabang Catalog) + update Rate Limits + Gap Status table |
| `knowledge-base.md` | Section 26 — patch 2026-05-21b |

## Action item untuk mobile team

- [ ] Replace hardcoded `app/src/constants/branches.ts` dengan fetch + cache logic (24 jam TTL, key `ecc.branches`)
- [ ] Display: pakai `nama` apa adanya, atau strip "ECC " prefix kalau ingin kota saja
- [ ] Optional: pakai `latitude/longitude` untuk feature "cabang terdekat" di future
- [ ] Smoke test: hit endpoint dari device tanpa auth — pastikan dapat 200 + list cabang

## Catatan untuk Phase 2+

Pattern public catalog di `/auth/*` tier sekarang ada precedent. Future endpoint serupa (mis. `GET /auth/sinode`, `GET /auth/renungan/today` untuk public sharing) bisa pakai pola yang sama — public + rate-limited per IP + field whitelist.

---

*Ticket closed 2026-05-21. Saat masuk Swagger UI, endpoint ini ada di tag "Auth" → "GET /auth/cabang".*
