-- Email @shiftsoft.org adalah email palsu bawaan migrasi Shiftsoft (bukan
-- milik jemaat). Kosongkan supaya tidak dipakai untuk kirim email / tampil
-- di profil. Termasuk subdomain (mis. x@mail.shiftsoft.org).
UPDATE "jemaat"
SET "email" = NULL, "updated_at" = NOW()
WHERE "email" ILIKE '%@shiftsoft.org' OR "email" ILIKE '%.shiftsoft.org';
