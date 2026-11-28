-- Tamu boleh memakai no HP yang sama dengan orang lain (kolom kontak tidak unik).
ALTER TABLE "jemaat" ADD COLUMN "no_hp_kontak" VARCHAR(20);
CREATE INDEX "jemaat_no_hp_kontak_idx" ON "jemaat"("no_hp_kontak");
