-- Seed 5 WA notif types yang sudah di-trigger di code tapi belum ada row config.
-- Tanpa row ini getConfig() return null → WA tidak pernah terkirim & type
-- tidak muncul di halaman Developer Tools → WhatsApp Notif Config.
-- Default is_enabled=false (admin aktifkan manual dari portal).

INSERT INTO "wa_notification_config"
  ("id", "type", "label", "description", "category", "is_enabled", "template", "placeholders", "updated_at")
VALUES
  (gen_random_uuid(), 'HOMECELL_ATTENDED',
   'Kehadiran Homecell Tercatat',
   'Dikirim ke jemaat saat PIC mencatat kehadiran di pertemuan homecell (scan QR atau bulk checklist).',
   'HOMECELL', false,
   E'🏠 *Kehadiran Tercatat*\n\nHalo {nama},\n\nKehadiran Anda di *{homecellNama}* tanggal {tanggal} sudah tercatat. Terima kasih sudah hadir!',
   ARRAY['nama','homecellNama','tanggal'],
   CURRENT_TIMESTAMP),

  (gen_random_uuid(), 'EVENT_CHECKED_IN',
   'Check-in Event',
   'Dikirim ke jemaat saat berhasil check-in di event.',
   'EVENT', false,
   E'✅ *Check-in Berhasil*\n\nHalo {nama},\n\nAnda sudah check-in di *{judul}*. Selamat mengikuti!',
   ARRAY['nama','judul'],
   CURRENT_TIMESTAMP),

  (gen_random_uuid(), 'BRANCH_CHANGE_APPROVED',
   'Pindah Cabang Disetujui',
   'Dikirim ke jemaat saat permohonan pindah cabang di-approve admin.',
   'CABANG', false,
   E'⛪ *Pindah Cabang Disetujui*\n\nHalo {nama},\n\nPermohonan pindah cabang Anda sudah disetujui. Cabang aktif Anda sekarang: *{cabangBaru}*.',
   ARRAY['nama','cabangBaru'],
   CURRENT_TIMESTAMP),

  (gen_random_uuid(), 'BRANCH_CHANGE_REJECTED',
   'Pindah Cabang Ditolak',
   'Dikirim ke jemaat saat permohonan pindah cabang ditolak admin.',
   'CABANG', false,
   E'⛪ *Pindah Cabang Ditolak*\n\nHalo {nama},\n\nPermohonan pindah cabang Anda belum dapat disetujui.\nAlasan: {alasan}\n\nHubungi admin cabang untuk info lebih lanjut.',
   ARRAY['nama','alasan'],
   CURRENT_TIMESTAMP),

  (gen_random_uuid(), 'GROUP_DISMISSED',
   'Group Dibubarkan',
   'Dikirim ke anggota saat group dibubarkan/dinonaktifkan.',
   'GROUP', false,
   E'👥 *Group Dibubarkan*\n\nHalo {nama},\n\nGroup *{groupNama}* sudah dibubarkan. Terima kasih atas partisipasinya.',
   ARRAY['nama','groupNama'],
   CURRENT_TIMESTAMP)
ON CONFLICT ("type") DO NOTHING;
