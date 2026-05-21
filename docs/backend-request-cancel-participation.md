# Backend Request: Cancel Event Participation Endpoint

**Untuk**: Tim Backend ECC (IDEA dev team)
**Dari**: Mobile dev (Ari Christian)
**Tanggal**: 2026-05-21
**Priority**: Low-Medium (UX completion, ada workaround manual via admin)
**Status**: ✅ **RESOLVED 2026-05-21** — lihat section "Backend Response" di akhir doc

## Problem statement

Mobile app sekarang persist participation state per event di local storage. Saat user buka event detail dan ada participation aktif → tampil CTA "Lanjut Pembayaran" atau status "Menunggu Verifikasi".

Yang kurang: **user tidak bisa batalkan registrasi sendiri**. Use cases:

1. **Salah pilih event** — user iseng tap Daftar, ternyata tidak jadi
2. **Tidak jadi bayar** — user daftar tapi tidak punya budget
3. **Konflik jadwal** — daftar dulu, ternyata bentrok dengan agenda lain
4. **Belum upload bukti dalam waktu lama** — accumulate "dangling" registrations

Tanpa endpoint cancel: user harus hubungi admin manual via WhatsApp untuk batalkan. Friction tinggi.

## Permintaan endpoint

Mobile prefer **DELETE pattern** dengan auto-handle status BATAL di BE side:

```
DELETE /admin/event/{eventId}/peserta/me
Authorization: Bearer <JWT>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "part-uuid-...",
    "eventId": "evt-uuid-...",
    "jemaatId": "jemaat-uuid-...",
    "status": "BATAL",
    "cancelledAt": "2026-05-21T10:00:00.000Z"
  }
}
```

BE handle:
- Update `EventParticipation.status` → `BATAL`
- Set `cancelledAt` timestamp
- **JANGAN delete row** — keep untuk audit + cegah re-register dengan participationId yang sama
- Decrement `event.pesertaCount` (kalau di-cache) supaya quota slot kembali available

## Batasan & validation

Mobile harapkan BE enforce:

- ✅ Hanya owner participation yang bisa cancel (jemaatId match Bearer token)
- ✅ Tidak bisa cancel kalau status sudah `HADIR` (sudah scan/hadir di event) — return 400
- ❌ Boleh cancel di semua status: `DAFTAR`, `MENUNGGU_VERIFIKASI`, `BAYAR` (refund handling manual)
- ⚠ Edge case: user sudah `BAYAR` tapi cancel → app refund? **Out-of-scope** — refund flow manual via admin via WhatsApp dengan attached bukti tertentu

## Error responses

| Status | Code | Penyebab |
|---|---|---|
| 404 | `NOT_FOUND` | User belum daftar event ini |
| 400 | `BAD_REQUEST` | Status sudah HADIR (sudah hadir di event, tidak bisa di-cancel) |
| 403 | `FORBIDDEN` | Bukan owner participation (defensive — sebenarnya 404 by jemaatId scope sudah cukup) |

## Alternative spec (kalau DELETE tidak preferred)

PATCH dengan body `{ status: "BATAL" }`:

```
PATCH /admin/event/{eventId}/peserta/me
{ "status": "BATAL", "reason": "Optional cancellation reason" }
```

BE prefer mana? DELETE lebih semantic untuk "I want to undo my registration", PATCH lebih explicit untuk state machine + bisa kasih reason.

## Acceptance criteria

- [ ] User bisa cancel registrasi yang status `DAFTAR`, `MENUNGGU_VERIFIKASI`, `BAYAR`
- [ ] Cancel sukses → `EventParticipation.status = BATAL`, `cancelledAt` di-set
- [ ] Event pesertaCount decrement (slot quota tersedia kembali)
- [ ] Status `HADIR` reject 400
- [ ] Audit log: siapa cancel kapan
- [ ] Admin notification (opsional): "Jemaat X cancel dari event Y"
- [ ] OpenAPI spec di Swagger

## Mobile implementation plan (saat endpoint live)

```typescript
// src/api/event.ts
export function cancelMyParticipation(eventId: string) {
  return api.delete<EventParticipation>(`/admin/event/${eventId}/peserta/me`);
}
```

UI di event detail screen (saat ada `participation` di store):
- Tombol secondary di bawah "Lanjut Pembayaran": **"Batalkan Pendaftaran"**
- Tap → confirm modal "Yakin batalkan? Slot Anda akan kembali available"
- Submit → DELETE endpoint → `removeParticipation(eventId)` di store → toast success
- Refetch event detail untuk update pesertaCount

## Catatan

Saat ini mobile sudah punya state machine lengkap di client side
(`useEventFlowStore.participations`), jadi UX-nya tinggal nunggu endpoint.

Workaround sementara: button "Batalkan" disabled atau redirect ke help center.

---

# Backend Response — 2026-05-21

**Dari**: Tim Backend ECC (IDEA dev team)
**Untuk**: Mobile dev (Ari Christian)
**Status**: ✅ **DELIVERED**
**Swagger**: `{BASE_URL}/docs#/Movement-·-Event/delete_admin_event__id__peserta_me`

## Ringkasan

`DELETE /admin/event/{eventId}/peserta/me` sudah live. Mengikuti spec **DELETE pattern** sesuai preference mobile. PATCH alternative tidak di-implement (DELETE sudah cukup ekspresif untuk "undo registration").

## Spec final

```
DELETE /admin/event/{eventId}/peserta/me
Authorization: Bearer <JWT>
```

Resolve current user dari JWT — mobile tidak perlu kirim `participationId` di path. Eliminasi 1 lookup di mobile (tidak perlu fetch detail dulu).

## Behavior matrix

| Status before | Action | Response |
|---|---|---|
| (no row) | reject | **404** `NOT_FOUND` — "Anda belum terdaftar di event ini." |
| `DAFTAR` | cancel | **200** + `data` updated dengan `status: BATAL`, `cancelledAt: <now>` |
| `MENUNGGU_VERIFIKASI` | cancel | **200** + cancelled (sama seperti DAFTAR) |
| `BAYAR` | cancel | **200** + cancelled (refund manual via admin) |
| `HADIR` | reject | **400** `BAD_REQUEST` — "Anda sudah hadir di event ini — tidak bisa membatalkan partisipasi." |
| `BATAL` | no-op | **200** + `data` existing + `meta.alreadyCancelled: true` |

**Idempotent**: cancel BATAL row tidak throw error, return existing. Mobile tidak perlu special-case "sudah dibatalkan".

## Acceptance criteria checklist

- [x] User bisa cancel status `DAFTAR`, `MENUNGGU_VERIFIKASI`, `BAYAR`
- [x] `EventParticipation.status` → `BATAL`, `cancelledAt` di-set
- [x] Slot kuota otomatis available (quota guard di POST `/peserta` filter `status: { not: 'BATAL' }` — sudah ada sejak awal)
- [x] Status `HADIR` reject 400
- [x] Audit log: `kind: event-self-cancel`, `previousStatus`, resourceLabel `Self-cancel: <namaJemaat> @ <namaEvent>`
- [x] OpenAPI di Swagger (tag "Movement · Event")
- [ ] Admin notification — **out of scope** (notification infra di-defer total per decision 2026-05-21)

## Implementasi notes

**Route ordering**: handler `/peserta/me` di-register **SEBELUM** `/peserta/:participationId` di `event.ts`. Express match in order, jadi `me` tidak di-treat sebagai UUID param. Tested manual.

**Soft cancel**: row **tidak** di-hard-delete. Trade-off:
- ✅ Audit history utuh
- ✅ Cegah confusion kalau user re-register (existing BATAL row di-reactivate, bukan create duplicate)
- ✅ Tidak ada race condition saat ada FK reference lain (mis. nanti payment history)

**Re-register setelah cancel**: BE handle otomatis. `POST /admin/event/:id/peserta` deteksi existing row dengan `status=BATAL` dan reactivate ke `DAFTAR` (lihat patch 2026-05-21 di section 12.x mobile-api-guide). Response 201 + `meta.reactivated: true`.

## Bonus catatan

**Refund kalau status BAYAR**: out of scope endpoint ini. Cancel hanya update status. Refund flow manual via admin (WhatsApp dengan bukti).

**Authorization**: tidak perlu cek owner explicit — JWT resolve ke `jemaatId`, lookup by `(eventId, jemaatId)`. Kalau bukan owner → 404 by design (user tidak punya row untuk event tsb).

**Cancel oleh admin**: admin tetap bisa cancel partisipasi user lain via existing endpoint:
```
PATCH /admin/event/{eventId}/peserta/{participationId}
{ "status": "BATAL" }
```
Endpoint ini sudah ada sejak Phase 1; tidak ber-impact.

## File yang berubah

| File | Perubahan |
|---|---|
| `apps/core-api/src/routes/admin/event.ts` | Tambah handler `DELETE /:id/peserta/me` sebelum route `:participationId` |
| `apps/core-api/src/openapi.ts` | Register path baru di tag "Movement · Event" |
| `docs/mobile-api-guide.md` | Section baru **5.6 Batalkan partisipasi sendiri (self-cancel)** + update Gap Status table section 19 |
| `knowledge-base.md` | Section 26 patch **2026-05-21g** |

## Action item untuk mobile team

- [ ] Implement `cancelMyParticipation(eventId)` di `src/api/event.ts`
- [ ] Add button "Batalkan Pendaftaran" di event detail (visible saat status DAFTAR/MENUNGGU_VERIFIKASI/BAYAR)
- [ ] Confirm modal sebelum submit ("Yakin batalkan? Slot Anda akan kembali available")
- [ ] Handle response:
  - 200 + `meta.alreadyCancelled` → "Partisipasi sudah dibatalkan sebelumnya"
  - 200 → "Partisipasi berhasil dibatalkan"
  - 400 → "Sudah hadir, tidak bisa cancel"
  - 404 → "Belum terdaftar"
- [ ] Refetch event detail untuk update pesertaCount (kalau ditampilkan)
- [ ] Update local `useEventFlowStore` — hapus participation entry dari store

---

*Ticket closed 2026-05-21. Live di Swagger `{BASE_URL}/docs#/Movement-·-Event/delete_admin_event__id__peserta_me`.*
