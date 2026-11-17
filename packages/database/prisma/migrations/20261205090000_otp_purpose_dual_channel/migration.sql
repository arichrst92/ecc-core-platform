-- Login & daftar dua saluran (WhatsApp / email). Nilai enum baru di file
-- tersendiri: nilai yang baru ditambahkan tidak boleh dipakai di transaksi yang sama.
ALTER TYPE "otp_purpose" ADD VALUE IF NOT EXISTS 'ENROLLMENT_EMAIL';
ALTER TYPE "otp_purpose" ADD VALUE IF NOT EXISTS 'LOGIN_EMAIL';
ALTER TYPE "otp_purpose" ADD VALUE IF NOT EXISTS 'ADD_EMAIL';
ALTER TYPE "otp_purpose" ADD VALUE IF NOT EXISTS 'ADD_NOHP';
ALTER TYPE "otp_purpose" ADD VALUE IF NOT EXISTS 'CLAIM_RECORD';
ALTER TYPE "otp_purpose" ADD VALUE IF NOT EXISTS 'ADMIN_CODE';
