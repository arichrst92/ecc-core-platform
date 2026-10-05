-- ============================================================
-- WaNotificationConfig table + seed data.
-- Admin bisa toggle enable/disable + edit template per notif type.
-- ============================================================

CREATE TABLE "wa_notification_config" (
  "id" UUID NOT NULL,
  "type" VARCHAR(64) NOT NULL,
  "label" VARCHAR(100) NOT NULL,
  "description" TEXT,
  "category" VARCHAR(32) NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT false,
  "template" TEXT NOT NULL,
  "placeholders" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updated_by_id" UUID,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "wa_notification_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wa_notification_config_type_key" ON "wa_notification_config"("type");
CREATE INDEX "wa_notification_config_category_is_enabled_idx" ON "wa_notification_config"("category", "is_enabled");

-- ============================================================
-- Seed default configs
-- ============================================================
INSERT INTO "wa_notification_config"
  ("id", "type", "label", "description", "category", "is_enabled", "template", "placeholders", "updated_at")
VALUES
  (gen_random_uuid(), 'IBADAH_REMINDER_H1',
   'Reminder Ibadah H-1',
   'Dikirim otomatis H-1 ke jemaat yang punya reservasi ibadah (status RESERVE/JOIN) antara jam {REMINDER_SEND_HOUR_START}-{REMINDER_SEND_HOUR_END}.',
   'IBADAH', true,
   E'🙏 *Reminder Ibadah*\n\nHalo {nama},\n\nMengingatkan ibadah besok:\n*{ibadah_nama}*\n📅 {tanggal}\n⏰ {jam}\n📍 {lokasi}\n\nTunjukkan QR Anda saat check-in. God bless! 🙌',
   ARRAY['nama','ibadah_nama','tanggal','jam','lokasi'],
   CURRENT_TIMESTAMP),

  (gen_random_uuid(), 'EVENT_REMINDER_H1',
   'Reminder Event H-1',
   'Dikirim otomatis H-1 ke jemaat yang terdaftar event (status DAFTAR/MENUNGGU/BAYAR).',
   'EVENT', true,
   E'🎉 *Reminder Event*\n\nHalo {nama},\n\nBesok event:\n*{event_judul}*\n📅 {tanggal}\n📍 {lokasi}\n\nSampai jumpa! God bless 🙏',
   ARRAY['nama','event_judul','tanggal','lokasi'],
   CURRENT_TIMESTAMP),

  (gen_random_uuid(), 'EVENT_REGISTERED',
   'Konfirmasi Daftar Event',
   'Dikirim saat jemaat berhasil daftar event (via mobile atau portal).',
   'EVENT', false,
   E'🎉 *Pendaftaran Event*\n\nHalo {nama},\n\nAnda sudah terdaftar di:\n*{event_judul}*\n📅 {event_tanggal}\n\nStatus: {status}\nSelesaikan pembayaran (kalau ada) dan tunjukkan QR Anda saat hadir. 🙏',
   ARRAY['nama','event_judul','event_tanggal','status'],
   CURRENT_TIMESTAMP),

  (gen_random_uuid(), 'EVENT_APPROVED',
   'Pembayaran Event Disetujui',
   'Dikirim saat admin verify pembayaran event dari jemaat.',
   'EVENT', false,
   E'✅ *Pembayaran Dikonfirmasi*\n\nHalo {nama},\n\nPembayaran Anda untuk:\n*{event_judul}*\nsudah dikonfirmasi. Sampai jumpa di hari H! 🙏',
   ARRAY['nama','event_judul'],
   CURRENT_TIMESTAMP),

  (gen_random_uuid(), 'FAMILY_LINKED',
   'Keluarga Ditambahkan',
   'Dikirim ke jemaat saat ada orang lain menambahkan dia sebagai anggota keluarga.',
   'FAMILY', false,
   E'👪 *Keluarga Terhubung*\n\nHalo {nama},\n\n{by_nama} menambahkan Anda sebagai *{tipe_relasi}* di daftar keluarga mereka.\n\nKalau ini bukan Anda atau tidak benar, hubungi admin untuk menghapus.',
   ARRAY['nama','by_nama','tipe_relasi'],
   CURRENT_TIMESTAMP),

  (gen_random_uuid(), 'GROUP_MEMBER_ADDED',
   'Ditambahkan ke Group',
   'Dikirim saat jemaat ditambahkan sebagai anggota group / komunitas.',
   'GROUP', false,
   E'👥 *Group Baru*\n\nHalo {nama},\n\nAnda sudah bergabung di group:\n*{group_nama}*\n\nSelamat datang! 🎉',
   ARRAY['nama','group_nama','by_nama'],
   CURRENT_TIMESTAMP),

  (gen_random_uuid(), 'GROUP_MEMBER_REMOVED',
   'Dikeluarkan dari Group',
   'Dikirim saat jemaat dikeluarkan dari group.',
   'GROUP', false,
   E'👋 *Group Update*\n\nHalo {nama},\n\nAnda sudah tidak lagi tergabung di group:\n*{group_nama}*\n\nTerima kasih atas kontribusi Anda!',
   ARRAY['nama','group_nama'],
   CURRENT_TIMESTAMP),

  (gen_random_uuid(), 'MINISTRY_SCHEDULE_ASSIGNED',
   'Jadwal Pelayanan',
   'Dikirim saat leader ministry assign jemaat ke schedule pelayanan baru.',
   'MINISTRY', false,
   E'🙏 *Jadwal Pelayanan*\n\nHalo {nama},\n\nAnda dijadwalkan melayani:\n*{ministry_nama}*\n📅 {tanggal}\n👤 Posisi: {posisi}\n{notes}\n\nTuhan memberkati pelayanan Anda! 🙌',
   ARRAY['nama','ministry_nama','tanggal','posisi','notes'],
   CURRENT_TIMESTAMP),

  (gen_random_uuid(), 'BIRTHDAY_GREETING',
   'Ucapan Ulang Tahun',
   'Dikirim pada hari ulang tahun jemaat (cron harian jam 7 pagi).',
   'BIRTHDAY', false,
   E'🎂 *Selamat Ulang Tahun!*\n\nHalo {nama},\n\nSelamat ulang tahun yang ke-{usia}! Kiranya kasih dan berkat Tuhan selalu melimpah di hidup Anda.\n\nSalam dari keluarga besar Elshaddai Creative Community 🎉',
   ARRAY['nama','usia'],
   CURRENT_TIMESTAMP);
