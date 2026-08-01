-- ============================================================
-- Modul 26: Checkout Ibadah
--
-- Extend Ibadah + Reservasi supaya admin bisa scan jemaat saat keluar
-- (mirror flow check-in). Toggle per ibadah — biasanya untuk ibadah anak
-- (security tracking) wajib, ibadah dewasa opsional.
-- ============================================================

-- 1. Ibadah.requiresCheckout — toggle per ibadah
ALTER TABLE "ibadah"
  ADD COLUMN "requires_checkout" BOOLEAN NOT NULL DEFAULT false;

-- 2. Reservasi.checkedOutAt + checkedOutBy — timestamp + admin yg scan
ALTER TABLE "reservasi"
  ADD COLUMN "checked_out_at" TIMESTAMP(3),
  ADD COLUMN "checked_out_by" UUID;

-- Index untuk query "sudah check-in tapi belum check-out" (kids ibadah)
CREATE INDEX "reservasi_checked_out_at_idx" ON "reservasi"("checked_out_at");
