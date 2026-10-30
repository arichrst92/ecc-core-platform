-- Jadwal Bulanan: minggu ke-1..4 dalam bulan + hari (mis. Sabtu minggu ke-2).
-- NULL = perilaku lama (tanggal yang sama dengan tanggal_mulai tiap bulan).
ALTER TABLE "ibadah" ADD COLUMN "minggu_ke" SMALLINT;
