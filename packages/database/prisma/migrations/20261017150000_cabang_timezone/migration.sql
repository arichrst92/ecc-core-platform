-- Zona waktu per cabang (IANA). Default WIB untuk cabang yang sudah ada.
ALTER TABLE "cabang_gereja" ADD COLUMN "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta';
