-- ============================================================
-- Modul 28: CKids Point System + Hadiah Redeem
--
-- 4 tabel baru:
--   - hadiah_katalog: master hadiah per cabang (foto, nama, point cost, stock)
--   - jemaat_point_balance: current balance per (jemaat, cabang)
--   - point_transaction: audit log semua earn/spend/adjust
--   - hadiah_redeem: transaksi redeem di stall (dengan snapshot hadiah info)
-- 2 enum baru: point_tx_type, point_source
--
-- Scope: ibadah anak. Point earn saat check-in kids ibadah, redeem via
-- stall di ckids.eccchurch.global.
-- ============================================================

CREATE TYPE "point_tx_type" AS ENUM ('EARN', 'SPEND', 'ADJUST');
CREATE TYPE "point_source" AS ENUM ('KEHADIRAN_KIDS', 'REDEEM', 'MANUAL_ADJUST', 'STOCK_ADD');

-- ============================================================
-- hadiah_katalog — master hadiah per cabang
-- ============================================================
CREATE TABLE "hadiah_katalog" (
  "id"          UUID          NOT NULL,
  "cabang_id"   UUID          NOT NULL,
  "nama"        VARCHAR(200)  NOT NULL,
  "deskripsi"   TEXT,
  "foto_url"    TEXT,
  "point_cost"  INTEGER       NOT NULL,
  "stock"       INTEGER       NOT NULL DEFAULT 0,
  "is_active"   BOOLEAN       NOT NULL DEFAULT true,
  "created_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "hadiah_katalog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hadiah_katalog_cabang_id_idx" ON "hadiah_katalog"("cabang_id");
CREATE INDEX "hadiah_katalog_is_active_idx" ON "hadiah_katalog"("is_active");

ALTER TABLE "hadiah_katalog"
  ADD CONSTRAINT "hadiah_katalog_cabang_id_fkey"
  FOREIGN KEY ("cabang_id") REFERENCES "cabang_gereja"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- jemaat_point_balance — balance per (jemaat, cabang)
-- Composite PK supaya idempotent upsert.
-- ============================================================
CREATE TABLE "jemaat_point_balance" (
  "jemaat_id"  UUID         NOT NULL,
  "cabang_id"  UUID         NOT NULL,
  "balance"    INTEGER      NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "jemaat_point_balance_pkey" PRIMARY KEY ("jemaat_id", "cabang_id")
);

-- Untuk leaderboard optional per cabang
CREATE INDEX "jemaat_point_balance_cabang_balance_idx"
  ON "jemaat_point_balance"("cabang_id", "balance" DESC);

ALTER TABLE "jemaat_point_balance"
  ADD CONSTRAINT "jemaat_point_balance_jemaat_id_fkey"
  FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "jemaat_point_balance"
  ADD CONSTRAINT "jemaat_point_balance_cabang_id_fkey"
  FOREIGN KEY ("cabang_id") REFERENCES "cabang_gereja"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- point_transaction — audit log semua earn/spend/adjust
-- ============================================================
CREATE TABLE "point_transaction" (
  "id"            UUID           NOT NULL,
  "jemaat_id"     UUID           NOT NULL,
  "cabang_id"     UUID           NOT NULL,
  "type"          "point_tx_type" NOT NULL,
  "amount"        INTEGER        NOT NULL,
  "source"        "point_source"  NOT NULL,
  "reference_id"  UUID,
  "note"          TEXT,
  "created_by_id" UUID           NOT NULL,
  "created_at"    TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "point_transaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "point_transaction_jemaat_id_created_at_idx"
  ON "point_transaction"("jemaat_id", "created_at" DESC);
CREATE INDEX "point_transaction_cabang_id_created_at_idx"
  ON "point_transaction"("cabang_id", "created_at" DESC);
CREATE INDEX "point_transaction_source_reference_id_idx"
  ON "point_transaction"("source", "reference_id");

ALTER TABLE "point_transaction"
  ADD CONSTRAINT "point_transaction_jemaat_id_fkey"
  FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "point_transaction"
  ADD CONSTRAINT "point_transaction_cabang_id_fkey"
  FOREIGN KEY ("cabang_id") REFERENCES "cabang_gereja"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "point_transaction"
  ADD CONSTRAINT "point_transaction_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "jemaat"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- hadiah_redeem — transaksi redeem
-- Snapshot nama+foto+point untuk historical accuracy.
-- ============================================================
CREATE TABLE "hadiah_redeem" (
  "id"              UUID           NOT NULL,
  "jemaat_id"       UUID           NOT NULL,
  "cabang_id"       UUID           NOT NULL,
  "hadiah_id"       UUID           NOT NULL,
  "point_deducted"  INTEGER        NOT NULL,
  "hadiah_nama"     VARCHAR(200)   NOT NULL,
  "hadiah_foto_url" TEXT,
  "processed_by_id" UUID           NOT NULL,
  "processed_at"    TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note"            TEXT,
  CONSTRAINT "hadiah_redeem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hadiah_redeem_jemaat_id_processed_at_idx"
  ON "hadiah_redeem"("jemaat_id", "processed_at" DESC);
CREATE INDEX "hadiah_redeem_cabang_id_processed_at_idx"
  ON "hadiah_redeem"("cabang_id", "processed_at" DESC);
CREATE INDEX "hadiah_redeem_hadiah_id_idx" ON "hadiah_redeem"("hadiah_id");

ALTER TABLE "hadiah_redeem"
  ADD CONSTRAINT "hadiah_redeem_jemaat_id_fkey"
  FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hadiah_redeem"
  ADD CONSTRAINT "hadiah_redeem_cabang_id_fkey"
  FOREIGN KEY ("cabang_id") REFERENCES "cabang_gereja"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hadiah_redeem"
  ADD CONSTRAINT "hadiah_redeem_hadiah_id_fkey"
  FOREIGN KEY ("hadiah_id") REFERENCES "hadiah_katalog"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "hadiah_redeem"
  ADD CONSTRAINT "hadiah_redeem_processed_by_id_fkey"
  FOREIGN KEY ("processed_by_id") REFERENCES "jemaat"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- RBAC backfill — Fulltimer dapat FULL access ke menu 'gift-stall'
-- ============================================================
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", 'gift-stall', true, true, true, CURRENT_TIMESTAMP
FROM "role" r
WHERE LOWER(r."nama") = 'fulltimer'
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_access" rma
    WHERE rma."role_id" = r."id" AND rma."menu_key" = 'gift-stall'
  );

-- Menu 'hadiah' (master katalog) juga
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", 'hadiah', true, true, true, CURRENT_TIMESTAMP
FROM "role" r
WHERE LOWER(r."nama") = 'fulltimer'
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_access" rma
    WHERE rma."role_id" = r."id" AND rma."menu_key" = 'hadiah'
  );
