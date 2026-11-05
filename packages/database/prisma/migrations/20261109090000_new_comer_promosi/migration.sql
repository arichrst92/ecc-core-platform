-- Onboarding: New Comer → Jemaat Tetap setelah hadir ibadah N kali.
ALTER TABLE "app_config" ADD COLUMN IF NOT EXISTS "new_comer_min_hadir" INTEGER;
