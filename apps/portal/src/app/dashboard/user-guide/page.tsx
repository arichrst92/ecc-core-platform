'use client';

import { useState } from 'react';
import {
  BookOpenCheck,
  ChevronRight,
  ChevronDown,
  Search,
  Building2,
  Church,
  Calendar,
  Layers,
  HandHeart,
  Ticket,
  Users,
  Shield,
  Heart,
  MapPin,
  Home as HomeIcon,
  Megaphone,
  Handshake,
  Store,
  Newspaper,
  BookOpen,
  FileText,
  Smartphone,
  Key,
  Activity,
  Wrench,
  Gauge,
  HelpCircle,
  Sparkles,
  Lightbulb,
  AlertCircle,
} from 'lucide-react';

// ===========================================================================
// TYPES
// ===========================================================================
interface Section {
  id: string;
  title: string;
  icon: typeof BookOpenCheck;
  summary: string;
  /** Bagian-bagian dalam section. Bisa step-by-step, bullet, atau description. */
  content: ContentBlock[];
}

type ContentBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'steps'; title?: string; items: string[] }
  | { kind: 'bullet'; title?: string; items: string[] }
  | { kind: 'tip'; text: string }
  | { kind: 'warning'; text: string }
  | { kind: 'menu-card'; href: string; label: string; description: string };

// ===========================================================================
// CONTENT — comprehensive guide
// ===========================================================================
const SECTIONS: Section[] = [
  {
    id: 'getting-started',
    title: 'Memulai',
    icon: Sparkles,
    summary: 'Login pertama kali, navigasi dasar, dan struktur portal.',
    content: [
      {
        kind: 'paragraph',
        text: 'ECC Portal adalah pusat administrasi data gereja untuk tim fulltimer. Semua data master jemaat, ibadah, pelayanan, event, dan konten broadcast dikelola dari sini. Mobile app ECC pakai data yang dikelola di portal ini.',
      },
      {
        kind: 'steps',
        title: 'Login pertama kali',
        items: [
          'Buka portal di browser (Chrome/Safari/Firefox terbaru direkomendasikan).',
          'Masukkan nomor HP Anda dalam format internasional (mis. +6281234567890).',
          'Klik "Kirim OTP" → Anda akan menerima 6 digit kode via WhatsApp dalam beberapa detik.',
          'Masukkan kode OTP dan klik Masuk.',
          'Selesai. Session aktif 7 hari (auto-refresh selama masih aktif chat/klik).',
        ],
      },
      {
        kind: 'tip',
        text: 'Kalau OTP tidak datang dalam 1 menit, pastikan WhatsApp Anda aktif. Bisa request OTP baru setelah cooldown 60 detik. Alternatif backup: magic link email — cek di halaman login → "Login via Email".',
      },
      {
        kind: 'steps',
        title: 'Login backup via magic link email',
        items: [
          'Di halaman login, klik "Login via Email" (link kecil di bawah form OTP).',
          'Masukkan email yang terdaftar di jemaat profile Anda.',
          'Cek inbox — Anda akan terima email dgn tombol "Masuk ke ECC" (link berlaku 15 menit).',
          'Klik tombol → auto login tanpa OTP. Cocok kalau WhatsApp OTP tidak sampai.',
        ],
      },
      {
        kind: 'bullet',
        title: 'Struktur navigasi sidebar',
        items: [
          'Dashboard (Elsa) — AI chat untuk tanya data ECC (jemaat, ibadah, event, homecell, tamu, doa, ulasan, dll)',
          'Map View — peta cabang, Zona, homecell, dan sebaran jemaat',
          'User Guide — panduan ini',
          'Gereja — Gereja, Cabang Gereja',
          'Service — Ibadah, Kategori Ibadah, Pelayanan, Permintaan Volunteer, Kehadiran, Laporan Ibadah',
          'People — Jemaat, Role Jemaat, Relasi Jemaat, Kritik & Saran, Tamu, Prayer Request, Bible 365',
          'Community — Zona, Homecell, Group',
          'Movement — Event, Laporan Event, Visit, Spiritual Journey, Local Market',
          'Broadcast — News, Renungan, ECC Worship',
          'CKids — Katalog Hadiah, Gift Stall',
          'Website — Konten Website',
          'Compliance — SOP Compliance, Catatan Pemrosesan & Risiko, Kirim Backup Bulanan',
          'App Settings — Legal Docs, App Versions, Maintenance Mode, Onboarding Config',
          'Developer Tools — API Keys, Audit Log, Role Access, Maintenance, Server Health, Analitik App, Credential, Diagnostics, Shiftsoft Sync, Technical Documentation, Team IT Minister, WhatsApp Notif Config, Ticketing Tools',
          'Profil & Keamanan (bawah) — edit data sendiri',
        ],
      },
      {
        kind: 'tip',
        text: 'Setiap grup di sidebar bisa di-collapse dengan klik header-nya. State collapse tersimpan otomatis di browser.',
      },
    ],
  },
  {
    id: 'elsa',
    title: 'Elsa (Els Agentic) — AI Chat',
    icon: Sparkles,
    summary: 'AI assistant untuk tanya data ECC via chat natural language.',
    content: [
      {
        kind: 'paragraph',
        text: 'Elsa (Els Agentic) adalah AI assistant di halaman Dashboard yang bisa jawab pertanyaan tentang data ECC secara natural language. Powered by Anthropic Claude + tool calling ke database ECC — jadi jawaban selalu berdasarkan data actual, bukan tebakan.',
      },
      {
        kind: 'paragraph',
        text: 'Elsa punya akses ke 54 entity database ECC via 5 dynamic tools (list_entities / describe_entity / query_entity / count_entity / groupby_entity) — bisa cover hampir semua modul portal.',
      },
      {
        kind: 'bullet',
        title: '54 entity yang bisa di-query',
        items: [
          'Gereja: sinode, cabang (termasuk zona waktu & link Google Maps)',
          'People: jemaat (termasuk tamu & kategori tamu), role, jemaat_role, tipe_relasi, jemaat_relasi, jemaat_sertifikat, feedback (Kritik & Saran)',
          'Tamu: jemaat_tamu (Tamu saya), homecell_tamu, homecell_tamu_attendance, homecell_guest_request',
          'Service: kategori_ibadah, ibadah (urutan, rating on/off), pelayanan, pelayanan_role, jemaat_pelayanan, reservasi, service_review (ulasan)',
          'Doa: prayer_request (tanpa isi doa), prayer_petugas_role, prayer_petugas_pelayanan',
          'Community: homecell_area (zona), homecell_area_pastor (pastor zona), homecell, homecell_member, homecell_schedule, homecell_attendance, homecell_join_request, homecell_announcement, homecell_poll',
          'Group: group, group_member, group_join_request, group_announcement, group_poll',
          'Movement: event, event_participation, visit, local_business, spiritual_journey_step, spiritual_journey_request',
          'Broadcast: konten (news + renungan), worship_album, worship_song',
          'Peta: jemaat_geocode (hasil pemetaan alamat jemaat)',
          'CKids: hadiah_katalog, jemaat_point_balance, point_transaction, hadiah_redeem',
          'Pengaturan & sistem: onboarding_role_rule, notification, branch_change_request',
        ],
      },
      {
        kind: 'tip',
        text: 'Data pribadi jemaat tidak bisa dibaca Elsa: catatan khotbah (Catatan saya), jurnal Bible 365, isi doa & kesaksian prayer request, dan nama pengirim ulasan anonim.',
      },
      {
        kind: 'bullet',
        title: 'Contoh pertanyaan Elsa (kompleks OK)',
        items: [
          '"Berapa jemaat aktif per cabang?" → groupby_entity dgn by cabangId',
          '"Cari jemaat bernama Ari + keluarganya" → query_entity jemaat + jemaat_relasi dgn include',
          '"Event bulan ini + jumlah peserta yang sudah BAYAR" → query_entity event + count peserta filter status=BAYAR',
          '"Homecell paling aktif kehadirannya bulan ini" → groupby_entity homecell_attendance',
          '"History redeem hadiah 7 hari terakhir" → query_entity hadiah_redeem + include hadiah + jemaat',
          '"Ministry Worship Team ada siapa saja + posisi role" → query_entity jemaat_pelayanan filter pelayananId',
          '"Point balance semua anak ECC Bandung urutkan tertinggi" → query_entity jemaat_point_balance filter cabang + orderBy balance desc',
          '"Group yang PIC-nya Sarah + berapa membernya" → query_entity group + include members',
          '"Berapa tamu New Comer bulan ini per cabang?" → groupby_entity jemaat filter isTamu + tamuKategori',
          '"Prayer request yang belum ditugaskan" → count/query prayer_request status BARU',
          '"Rata-rata rating Ibadah Raya 1 bulan ini" → query_entity service_review filter ibadahId + tanggal',
          '"Jemaat yang alamatnya belum dikenali di Map View" → query_entity jemaat_geocode status NOT_FOUND / TERLALU_UMUM',
        ],
      },
      {
        kind: 'bullet',
        title: 'Guardrails Elsa',
        items: [
          'Read-only — tidak bisa create/update/delete data. Semua tool cuma findMany/count/groupBy',
          'Max 50 records per query — untuk data besar Elsa harus filter atau paginate',
          'Field mask — sensitive data (password hash, JWT, refresh token) NEVER di-return',
          'Relation whitelist — hanya relations yang di-approve tiap entity yg bisa di-include (prevent leak via nested)',
          'Rate limit longgar (2000 request per 30 menit per user + IP)',
          'Semua chat + tool call ter-log di audit trail (bisa cek di /dashboard/audit-log filter resource=elsa_chat)',
        ],
      },
      {
        kind: 'steps',
        title: 'Cara pakai Elsa',
        items: [
          'Buka Dashboard (menu paling atas sidebar) — first visit muncul language picker (EN/ID).',
          'Pilih bahasa → Elsa akan konsisten pakai bahasa itu (persisten via browser).',
          'Ketik pertanyaan di input bawah, tekan Enter (Shift+Enter untuk newline).',
          'Elsa akan panggil tool DB yang sesuai + tampilkan hasil dalam beberapa detik.',
          'Toggle voice icon di header untuk aktifkan text-to-speech (Elsa baca response pakai suara browser).',
          'Klik voice dropdown untuk pilih suara (populate dari OS/browser).',
          'Klik Reset untuk mulai percakapan baru.',
        ],
      },
      {
        kind: 'tip',
        text: 'Voice picker populate dari OS/browser Anda — biasanya Chrome dgn Google voice terbaik, Safari pakai Apple voice. Coba klik ▶ preview untuk test suara sebelum digunakan.',
      },
      {
        kind: 'warning',
        text: 'Data yang tidak ada di daftar entity (mis. audit log, analitik, compliance, keuangan) tidak bisa dijawab Elsa — pakai menu portal yang sesuai.',
      },
      {
        kind: 'warning',
        text: 'Elsa bisa membuat kesalahan (halusinasi angka/nama). Untuk keputusan penting, verifikasi manual dgn menu portal yang bersangkutan. Kalau ada jawaban janggal, klik Reset + coba rephrase.',
      },
      {
        kind: 'paragraph',
        text: 'Backend: POST /admin/elsa/chat (Fulltimer-only). Butuh ANTHROPIC_API_KEY di server .env. Model default: Claude Haiku (bisa diganti lewat ELSA_MODEL). Pesan maks 2000 karakter, riwayat maks 10 giliran.',
      },
      {
        kind: 'tip',
        text: 'Elsa bisa suggest action buttons di bawah response — klik untuk navigate langsung ke menu portal (mis. "Buka daftar jemaat" → /dashboard/jemaat). Response otomatis parse [ACTIONS] block dgn sanitize whitelist type (navigate/external/contact_admin) + validasi URL start dgn "/" atau "https://". Max 2 button per response.',
      },
    ],
  },
  {
    id: 'entity',
    title: 'Sinode — Gereja & Cabang',
    icon: Building2,
    summary: 'Kelola struktur organisasi level atas: sinode, cabang gereja, dan rekening bank cabang.',
    content: [
      { kind: 'menu-card', href: '/dashboard/sinode', label: 'Gereja', description: 'Top-level organisasi gereja/sinode (mis. ECC Indonesia) yang menaungi banyak cabang. Di sidebar ada di grup Sinode dengan nama menu "Gereja".' },
      { kind: 'menu-card', href: '/dashboard/cabang', label: 'Cabang Gereja', description: 'Cabang lokal di bawah sinode. Punya alamat, kontak, koordinat untuk peta, dan multi-rekening bank.' },
      {
        kind: 'steps',
        title: 'Tambah cabang baru',
        items: [
          'Buka menu Cabang Gereja → klik Tambah Cabang.',
          'Pilih Sinode, isi nama + kode unik per sinode (mis. JKT, BDG).',
          'Isi alamat + kontak opsional.',
          'Untuk plotting di peta dashboard, isi latitude/longitude (WGS84 — bisa cek di Google Maps right-click → "What\'s here").',
          'Klik Simpan.',
        ],
      },
      {
        kind: 'steps',
        title: 'Setup rekening bank cabang',
        items: [
          'Buka detail cabang (klik nama cabang di list).',
          'Section "Rekening Bank" → klik Tambah.',
          'Isi purpose (mis. Persembahan Umum, Pembangunan, Diakonia), bank, nomor rekening, atas nama.',
          'Upload QRIS image kalau ada — akan auto-resize 1600px webp.',
          'Cabang bisa punya multiple rekening dengan purpose berbeda.',
        ],
      },
      {
        kind: 'tip',
        text: 'Cabang & sinode bisa di-non-aktifkan (toggle status) tanpa hapus — data historis tetap ada untuk audit.',
      },
    ],
  },
  {
    id: 'service',
    title: 'Service — Ibadah & Pelayanan',
    icon: Calendar,
    summary: 'Setup jadwal ibadah, kategori, tim pelayanan, dan tracking kehadiran.',
    content: [
      { kind: 'menu-card', href: '/dashboard/ibadah', label: 'Ibadah', description: 'Jadwal ibadah recurring (mingguan/bulanan) atau one-time event. Toggle List/Kalender view.' },
      { kind: 'menu-card', href: '/dashboard/kategori-ibadah', label: 'Kategori Ibadah', description: 'Master kategori (mis. Ibadah Umum, Pemuda, KKR, Doa).' },
      { kind: 'menu-card', href: '/dashboard/pelayanan', label: 'Pelayanan', description: 'Tim ministry (Worship, Multimedia, Usher, dll) + role per pelayanan.' },
      { kind: 'menu-card', href: '/dashboard/pelayanan/join-requests', label: 'Permintaan Volunteer', description: 'Jemaat yang mengajukan bergabung ke ministry dari Els App. Leader/Fulltimer menyetujui (sambil menentukan peran) atau menolak.' },
      { kind: 'menu-card', href: '/dashboard/kehadiran', label: 'Kehadiran', description: 'Reservasi + check-in jemaat per ibadah per tanggal.' },
      {
        kind: 'steps',
        title: 'Buat ibadah recurring (mingguan)',
        items: [
          'Buka Ibadah → Tambah Ibadah.',
          'Pilih cabang, kategori, beri nama (mis. "Ibadah Umum Pagi").',
          'Tipe Jadwal: Mingguan (WEEKLY) atau Dua Mingguan (BIWEEKLY).',
          'Pilih Hari (Minggu/Senin/...) — wajib untuk recurring.',
          'Set Tanggal Mulai (tanggal pertama jadwal dimulai), Jam Mulai + Jam Selesai (HH:mm).',
          'Lokasi opsional. Kalau online, centang Online + isi link stream.',
          'Klik Simpan. Calendar view otomatis generate occurrence sesuai pattern.',
        ],
      },
      {
        kind: 'steps',
        title: 'Tiadakan satu occurrence (cancel)',
        items: [
          'Buka Ibadah → Kalender view → klik tanggal occurrence yang mau ditiadakan.',
          'Panel detail bawah → klik Tiadakan.',
          'Isi alasan opsional. Konfirmasi.',
          'Otomatis: semua reservasi RESERVE/JOIN pada tanggal itu di-set CANCEL.',
          'Untuk restore: buka detail ibadah → section "Tanggal Ditiadakan" → klik Buka Kembali. Reservasi yang sudah ke-cancel TIDAK auto-restore.',
        ],
      },
      {
        kind: 'steps',
        title: 'Assign petugas pelayanan ke ibadah',
        items: [
          'Buka detail ibadah.',
          'Section "Pelayanan yang Melayani" → klik Tambah Pelayanan (link Worship, Multimedia, dll).',
          'Expand pelayanan yang sudah ditambahkan → Tambah Petugas.',
          'Pilih Mode "Default (tiap minggu)" untuk petugas reguler, atau "Khusus tanggal" untuk override hanya 1 tanggal.',
          'Centang jemaat yang akan bertugas (dari list member pelayanan tsb), pilih role + centang "Bisa Scan" kalau dia authorized scan QR check-in.',
        ],
      },
      {
        kind: 'warning',
        text: 'Petugas harus sudah jadi member Pelayanan tsb dulu (via halaman detail jemaat, atau menyetujui Permintaan Volunteer). Validasi backend: pelayananRole harus belong ke pelayanan yang dipilih.',
      },
      {
        kind: 'paragraph',
        text: 'Sejak Oktober 2026, jemaat yang bergabung ke ministry dari Els App tidak langsung jadi anggota — permintaannya berstatus menunggu sampai disetujui leader. Leader dan Fulltimer mendapat notifikasi saat ada permintaan baru.',
      },
      {
        kind: 'steps',
        title: 'Setujui / tolak permintaan volunteer',
        items: [
          'Buka Service → Permintaan Volunteer (atau tombol "Permintaan Volunteer" di halaman Pelayanan — angka di badge = jumlah yang menunggu).',
          'Chip di atas: "Semua" untuk gabungan semua ministry, atau klik nama ministry untuk melihat satu ministry saja.',
          'Periksa data pemohon: nama (klik untuk buka detail jemaat), cabang, no HP, peran yang diminta, dan motivasi.',
          'Untuk menyetujui: pilih peran di dropdown (default = peran yang diminta, boleh diganti) → klik Setujui. Jemaat langsung jadi anggota aktif dan mendapat notifikasi.',
          'Untuk menolak: klik Tolak → isi alasan (opsional) → Tolak. Pemohon mendapat notifikasi dan boleh mengajukan lagi.',
        ],
      },
      {
        kind: 'tip',
        text: 'Siapa yang bisa memproses: Fulltimer (semua ministry) dan leader ministry — anggota aktif dengan peran level 5 ke atas (mis. Leader, Co-Leader) — hanya untuk ministry yang dia pimpin. Leader juga bisa memproses langsung dari Els App.',
      },
      {
        kind: 'steps',
        title: 'Check-in kehadiran via scan QR',
        items: [
          'Buka detail ibadah → set tanggal di date picker → klik tombol Check-in.',
          'Scanner modal terbuka. Scan QR card jemaat (kode 8-char alphanumeric).',
          'Sistem otomatis create/update reservasi ke status JOIN.',
          'Walk-in (jemaat tanpa reservasi) auto-create reservasi JOIN.',
          'Hanya petugas dengan flag "Bisa Scan" yang boleh scan via mobile — admin bisa selalu lewat portal.',
        ],
      },
      {
        kind: 'paragraph',
        text: 'Walk-in flow — scan QR profile jemaat + pilih ibadah + tanggal → sistem auto-upsert reservasi. Universal untuk SEMUA jenis ibadah (Umum, Pemuda, KKR, Doa, Anak, Retret). Backend endpoint yang sama (POST /admin/reservasi/walk-in) dipakai baik dari portal, ckids web, maupun mobile scanner.',
      },
      {
        kind: 'bullet',
        title: 'Perilaku walk-in per jenis ibadah',
        items: [
          'Ibadah reguler (Umum, Pemuda, Doa) — action "checkin" langsung create/flip reservasi ke JOIN. Response tidak ada pickupCode.',
          'Ibadah Anak (isKidsIbadah=true) — action "checkin" auto-generate 6-digit pickupCode untuk parent tunjukin saat jemput. Response include pickupCode.',
          'Ibadah dengan flag Wajib Checkout (requiresCheckout=true) — action "checkout" set checkedOutAt. Cocok untuk retret, gathering multi-sesi, atau ibadah anak.',
          'Action "pickup" hanya untuk Ibadah Anak — set pickedUpAt post scan QR anak oleh admin ckids stall.',
        ],
      },
      {
        kind: 'tip',
        text: 'Toggle "Ibadah Anak?" dan "Wajib Checkout?" ada di form edit ibadah. Kombinasi keduanya menentukan action apa saja yang enabled untuk ibadah tsb.',
      },
      {
        kind: 'steps',
        title: 'Kids ibadah — flow lengkap (check-in → pickup)',
        items: [
          'Set ibadah anak: buka detail → toggle "Ibadah Anak?" ON + "Wajib Checkout?" ON kalau perlu tracking checkout.',
          'Saat hari H, orang tua antar anak → admin ckids scan QR profile anak di stall.',
          'Sistem generate 6-digit pickupCode → admin sampaikan ke orang tua (atau muncul di app parent via GET /admin/me/reservasi).',
          'Jam pulang: orang tua tunjukin kode di stall (atau scan QR anak dari admin) → admin input kode / scan → sistem set pickedUpAt.',
          'Alternate flow: admin scan QR profile anak langsung → pilih action Pickup → auto-detect reservasi kids yang belum di-pickup hari itu.',
        ],
      },
      {
        kind: 'menu-card',
        href: 'https://ckids.eccchurch.global',
        label: 'CKids Web (subdomain)',
        description: 'Aplikasi dedicated untuk admin stall ibadah anak — scanner QR jemaat, katalog hadiah point, adjust point manual, laporan kehadiran hari ini, dan pickup code verify. Login pakai akun Fulltimer yang sama.',
      },
    ],
  },
  {
    id: 'people',
    title: 'People — Jemaat & Role',
    icon: Users,
    summary: 'Master data jemaat, role/sub-role, dan relasi keluarga.',
    content: [
      { kind: 'menu-card', href: '/dashboard/jemaat', label: 'Jemaat', description: 'Database jemaat per cabang. Detail page punya section role, pelayanan, relasi keluarga.' },
      { kind: 'menu-card', href: '/dashboard/role', label: 'Role Jemaat', description: 'Klasifikasi keanggotaan: Jemaat (Tetap/Tamu), Fulltimer (Pastoral, Worship Leader, dll).' },
      { kind: 'menu-card', href: '/dashboard/tipe-relasi', label: 'Relasi Jemaat', description: 'Master tipe relasi keluarga: Suami, Istri, Ayah, Ibu, Anak, dll.' },
      {
        kind: 'steps',
        title: 'Tambah jemaat baru',
        items: [
          'Buka Jemaat → Tambah Jemaat.',
          'Pilih Cabang, isi nama lengkap, no HP (E.164 +62...).',
          'Tanggal lahir + jenis kelamin opsional.',
          'Klik Simpan. Sistem auto-generate kode QR 8-char unik.',
          'Lanjut ke detail jemaat untuk upload foto, assign role, dan join pelayanan.',
        ],
      },
      {
        kind: 'steps',
        title: 'Assign role + sub-role + status',
        items: [
          'Buka detail jemaat → section "Role" → Tambah Penugasan Role.',
          'Pilih Role (mis. Fulltimer), Sub-Role (Pastoral, Pengabdian, dll), Sub-Role Status opsional (Pemimpin Cabang, Magang, dll).',
          'Set tanggal mulai. Kosongkan tanggal selesai untuk role aktif.',
          'Klik Tambah. Jemaat sekarang punya role itu — auto-recompute access portal.',
        ],
      },
      {
        kind: 'bullet',
        title: 'Fitur halaman Jemaat',
        items: [
          'Filter: cabang, homecell, zona, ministry, status, jenis kelamin, role, umur. Search berdasarkan nama, email, atau no HP.',
          'Export Excel (CSV) dan PDF mengikuti filter yang aktif.',
          'Cek Duplikat: temukan jemaat dengan no HP / email / nama + tanggal lahir yang sama.',
          'Detail jemaat: QR card, tombol kontak WhatsApp/Email, riwayat homecell, event, ibadah, group, visit, local market, indikator keaktifan 3 bulan, dan Export PDF profil.',
        ],
      },
      {
        kind: 'tip',
        text: 'Role "Fulltimer" otomatis dapat akses portal (canAccessPortal=true). Role lain default tidak — admin perlu set per role via menu Role Access kalau perlu kasih akses spesifik.',
      },
      {
        kind: 'steps',
        title: 'Bulk import jemaat via CSV',
        items: [
          'Buka Jemaat → klik Import CSV.',
          'Download template CSV → isi data sesuai format header.',
          'Upload file → klik Dry Run untuk preview.',
          'System validate semua row + tampilkan errors (jika ada). Row valid tetap di-preview untuk konfirmasi.',
          'Kalau OK, klik Commit. Row yang error di-skip + di-laporkan, row valid di-insert atomically.',
        ],
      },
      {
        kind: 'steps',
        title: 'Relasi keluarga',
        items: [
          'Buka detail jemaat → section "Relasi Keluarga" → klik untuk lihat modal.',
          'Add relasi: pilih jemaat lain + tipe relasi (mis. Suami, Anak, Ibu).',
          'Relasi satu-arah: A → B Suami berarti "B adalah suami dari A".',
          'Untuk dua-arah, add reverse pair-nya secara terpisah.',
        ],
      },
    ],
  },
  {
    id: 'community',
    title: 'Community — Homecell',
    icon: HomeIcon,
    summary: 'Struktur penggembalaan: area → homecell → anggota.',
    content: [
      { kind: 'menu-card', href: '/dashboard/homecell-area', label: 'Zona', description: 'Zona = level atas homecell per cabang (mis. Jakarta Pusat, Bandung Utara). PIC = Zone Leader dari Pelayanan Penggembalaan. Pastor zona boleh kosong / lebih dari satu (cari berdasarkan nama); pastor melihat semua zonanya di app.' },
      { kind: 'menu-card', href: '/dashboard/homecell', label: 'Homecell', description: 'Cellgroup individual di bawah area. PIC = Homecell Leader. Punya anggota + jadwal pertemuan.' },
      {
        kind: 'steps',
        title: 'Setup struktur homecell baru',
        items: [
          'Pastikan jemaat yang akan jadi PIC sudah join Pelayanan Penggembalaan dengan role yang sesuai.',
          'Buat Zona dulu (Zona → Tambah). Pilih cabang + PIC Zone Leader, dan (opsional) satu atau beberapa Pastor — ketik nama lalu pilih.',
          'Lalu buat Homecell di Homecell → Tambah → pilih zona + PIC Homecell Leader.',
          'Set jadwal pertemuan (hari + jam), alamat lokasi.',
        ],
      },
      {
        kind: 'steps',
        title: 'Manage anggota homecell',
        items: [
          'Buka detail homecell → section Anggota.',
          'Tambah Anggota → pilih jemaat dari cabang yang sama.',
          'Untuk anggota yang keluar: toggle off (set isActive=false + tanggalKeluar) — bukan hard delete, supaya riwayat keanggotaan tetap.',
          'Untuk re-join: toggle on kembali row yang sama (unique constraint cegah duplikat).',
        ],
      },
      {
        kind: 'warning',
        text: 'PIC area/homecell HARUS jemaat yang sudah masuk pelayanan Penggembalaan. Kalau dia keluar dari pelayanan, PIC field tidak otomatis null — admin perlu manual re-assign.',
      },
    ],
  },
  {
    id: 'movement',
    title: 'Movement — Event, Visit, Local Market',
    icon: Megaphone,
    summary: 'Event satu kali, peer-to-peer visit antar jemaat, dan direktori UMKM jemaat.',
    content: [
      { kind: 'menu-card', href: '/dashboard/event', label: 'Event', description: 'Event satu-kali (KKR, Retret, dll) dengan registrasi, pembayaran (opsional), dan check-in.' },
      { kind: 'menu-card', href: '/dashboard/visit', label: 'Visit', description: 'Pertemuan peer-to-peer antar jemaat via scan QR. Read-only di portal — aktivitas inti di mobile.' },
      { kind: 'menu-card', href: '/dashboard/local-business', label: 'Local Market', description: 'Direktori UMKM jemaat. Read-only di portal — owner CRUD via mobile.' },
      {
        kind: 'steps',
        title: 'Request update Spiritual Journey dari app',
        items: [
          'Jemaat (app 2.4.6) membuka Spiritual Journey → "Ajukan update tahap", memilih tahap terakhir yang sudah dicapai, dan menulis catatan (mis. tanggal & tempat baptis). Satu request menunggu per jemaat; bisa dibatalkan selama belum diproses.',
          'Admin: Spiritual Journey → tombol "Request dari App" (angka merah = menunggu). Filter status & cari nama; klik baris untuk detail.',
          'Detail menampilkan tahap yang tercatat saat ini, catatan jemaat, dan daftar tahap yang AKAN diberikan: tahap diminta + semua tahap sebelumnya yang belum tercatat. Tahap yang tidak menentukan sub role butuh pilihan sub role.',
          'Setujui → Role / Sub role / Status tiap tahap diberikan (role yang sudah ada dengan sub role sama hanya diperbarui status-nya), jemaat mendapat notifikasi. Tolak → isi alasan, dikirim ke jemaat.',
          'Akses: menu Spiritual Journey (baca untuk melihat, tulis untuk memproses).',
        ],
      },
      {
        kind: 'steps',
        title: 'Buat event baru',
        items: [
          'Buka Event → Tambah Event.',
          'Isi judul, slug (auto-generate dari judul), ringkasan, deskripsi (markdown).',
          'Set tanggal mulai + selesai (datetime), lokasi.',
          'Pilih audience: sinode-wide / cabang-specific (kombinasi nullable sinodeId+cabangId).',
          'Tipe Bayar: GRATIS / NOMINAL_TETAP / NOMINAL_BEBAS. Untuk berbayar, isi rekening + upload QRIS image opsional.',
          'Quota peserta opsional, tags opsional.',
          'Toggle "Butuh Kehadiran" kalau pakai scan QR check-in di hari H.',
          'Toggle "Publish" → event muncul di mobile app.',
        ],
      },
      {
        kind: 'steps',
        title: 'Approve donation event (multi-payment)',
        items: [
          'Buka detail event → section Donation Tracker.',
          'List semua donation per participation. Status PENDING menunggu verifikasi bukti transfer.',
          'Klik bukti transfer untuk preview image, verifikasi manual ke statement bank.',
          'Klik Approve → status SUKSES, otomatis update total terkumpul.',
          'Donation di-track per row (bukan akumulasi), supaya audit clear.',
        ],
      },
      {
        kind: 'paragraph',
        text: 'Event berbayar di Els App: untuk Nominal Sukarela (NOMINAL_BEBAS), pendaftaran + nominal + upload bukti transfer dilakukan di halaman web (eccchurch.global/event/…/pembayaran) sesuai aturan App Store. App membuka halaman itu dalam keadaan sudah login (token sekali pakai, sesi 30 menit), jemaat memilih diri sendiri / anggota keluarga, mengisi nominal (min Rp 1.000/orang), lalu upload bukti. Tombol "Kembali ke Els App" menutup browser dan kembali ke app.',
      },
      {
        kind: 'tip',
        text: 'Peserta yang mendaftar dari web muncul di detail event portal sama seperti dari app (status Menunggu Verifikasi setelah upload bukti). Kalau halaman dibuka tanpa dari app (mis. link share), tampil hanya info rekening/QRIS. Pesan "Sesi kedaluwarsa" berarti jemaat perlu membuka ulang dari Els App.',
      },
      {
        kind: 'paragraph',
        text: 'Visit dan Local Market di portal hanya read-only + delete moderation. Aktivitas inti — jemaat scan QR untuk record visit, atau owner CRUD bisnis — dilakukan di mobile app. Portal admin berguna untuk lihat aktivitas + moderasi konten inappropriate.',
      },
    ],
  },
  {
    id: 'broadcast',
    title: 'Broadcast — News & Renungan',
    icon: Newspaper,
    summary: 'Konten broadcast ke mobile app: berita gereja + renungan harian.',
    content: [
      { kind: 'menu-card', href: '/dashboard/news', label: 'News', description: 'Berita / pengumuman gereja. Markdown content + hero image.' },
      { kind: 'menu-card', href: '/dashboard/renungan', label: 'Renungan', description: 'Renungan harian. Mirip News tapi punya field tanggal + ayat Alkitab.' },
      {
        kind: 'steps',
        title: 'Buat konten broadcast',
        items: [
          'Buka News (atau Renungan) → Tambah.',
          'Isi judul, ringkasan, body (markdown — bisa pakai heading ##, bold **, list -).',
          'Set audience: global / sinode-wide / cabang-specific.',
          'Untuk Renungan: isi tanggal publikasi + ayat Alkitab.',
          'Klik Simpan dulu (butuh ID untuk hero image).',
          'Lalu upload hero image via section "Hero Image" — auto-resize 1600px webp.',
          'Toggle Published → konten muncul di mobile.',
        ],
      },
      {
        kind: 'tip',
        text: 'Body pakai markdown supaya portable. Mobile render markdown via library. Untuk preview, copy ke github.com/markdown-preview atau editor.md.',
      },
    ],
  },
  {
    id: 'app-settings',
    title: 'App Settings — Legal & Versions',
    icon: FileText,
    summary: 'Konfigurasi mobile app: legal documents + version check.',
    content: [
      { kind: 'menu-card', href: '/dashboard/legal', label: 'Legal Docs', description: 'Terms & Privacy untuk mobile pre-login screen. Multi-language (id wajib, en opsional).' },
      { kind: 'menu-card', href: '/dashboard/app-version', label: 'App Versions', description: 'Set latest + min supported version per platform (iOS/Android). Mobile auto-check at launch.' },
      {
        kind: 'steps',
        title: 'Update Terms & Privacy',
        items: [
          'Buka Legal Docs → pilih tab TERMS atau PRIVACY → sub-tab Bahasa Indonesia.',
          'Edit title + content (markdown raw).',
          'Update field Version dengan tanggal hari ini (ISO YYYY-MM-DD).',
          'Centang Published → mobile akan refetch otomatis (cache invalidation by version).',
          'Klik Simpan.',
        ],
      },
      {
        kind: 'steps',
        title: 'Publish app version baru',
        items: [
          'Buka App Versions → tab platform (iOS / Android).',
          'Klik "Versi Baru" → pilih platform.',
          'Isi Latest Version (semver mis. 1.2.0), Min Supported (kalau breaking change, naikkan; kalau backward-compat, biarkan sama).',
          'Isi Release Notes (plain text atau markdown).',
          'Download URL: link ke App Store / Play Store.',
          'Centang "Langsung publish" → versi lama auto-unpublish.',
          'Klik Buat. Mobile user akan dapat update prompt di-app launch berikutnya.',
        ],
      },
      {
        kind: 'warning',
        text: 'Min Supported Version bikin user dengan versi lebih lama dapat FORCE UPDATE modal (tidak bisa dismiss). Naikkan hanya kalau ada breaking API change.',
      },
      {
        kind: 'tip',
        text: 'Oktober 2026: Min Supported Version dinaikkan ke 2.2.6 (iOS + Android) untuk mengakhiri face login sekaligus memastikan semua user dapat perbaikan hapus keluarga & pembayaran event sukarela. Download URL App Store jangan pakai /id/ (region-lock) — pakai apps.apple.com/app/els-global-app/id6743088520.',
      },
      {
        kind: 'paragraph',
        text: 'In-App Notifications (Modul 30): backend auto-kirim notifikasi ke bell icon mobile jemaat saat 19 jenis event across kids, family, group, event, homecell, visit, branch-change, dan ministry join flow. Mobile polling per 30 detik pakai endpoint /admin/me/notifications. Portal admin tidak punya UI notif — cuma emit dari 11 route handler.',
      },
      {
        kind: 'bullet',
        title: 'Event yang trigger notif in-app (19 total)',
        items: [
          'CKIDS_CHECKIN: admin check-in anak → parent dapat notif dgn 6-digit kode jemput di metadata',
          'CKIDS_PICKUP: anak dijemput → parent dapat konfirmasi + warning kalau bukan mereka yg jemput',
          'GIFT_REDEEMED: anak redeem hadiah di stall → parent notif transaksi + sisa balance',
          'POINT_EARNED / POINT_ADJUSTED: kehadiran kids auto award atau admin adjust manual → parent notif',
          'FAMILY_LINKED: jemaat di-add sebagai relasi → target notif consent info',
          'GROUP_MEMBER_ADDED / _REMOVED / _DISMISSED: PIC add/remove member atau dismiss group → member dapat notif',
          'EVENT_REGISTERED: user self-register jadi peserta → konfirmasi "registrasi diterima, tunggu bayar / sampai jumpa"',
          'EVENT_APPROVED: admin approve peserta event berbayar → peserta notif "sampai jumpa di hari H"',
          'EVENT_CHECKED_IN: scan QR di hari H → peserta notif "kehadiran tercatat"',
          'HOMECELL_ATTENDED: PIC scan QR member di pertemuan homecell → member dapat konfirmasi',
          'VISIT_RECORDED: jemaat lain scan QR Anda untuk record visit → target dapat notif dgn detail visit',
          'BRANCH_CHANGE_APPROVED / _REJECTED: admin review permohonan pindah cabang → jemaat notif hasil',
          'MINISTRY_JOIN_REQUESTED: jemaat ajukan gabung ministry → leader dapat notif',
          'MINISTRY_JOIN_APPROVED / _REJECTED: leader memproses permintaan → pemohon dapat notif hasil',
        ],
      },
      {
        kind: 'tip',
        text: 'WhatsApp per jenis notif bisa diaktifkan/dimatikan dan template-nya diedit sendiri di Developer Tools → WhatsApp Notif Config. Jenis baru default nonaktif. In-app tetap terkirim terlepas dari setting WA.',
      },
    ],
  },
  {
    id: 'map-view',
    title: 'Map View — Peta Cabang, Homecell & Jemaat',
    icon: MapPin,
    summary: 'Peta interaktif Google Maps: cabang, Zona, homecell, sebaran & pin jemaat, Cek Lokasi Member, Cari Potensial Member.',
    content: [
      {
        kind: 'paragraph',
        text: 'Map View (di samping Dashboard/Elsa) menampilkan semua lokasi di Google Maps. Klik pin atau zona untuk membuka balon informasi berisi detail dan tombol ke halaman terkait.',
      },
      {
        kind: 'bullet',
        title: 'Lapisan yang bisa dicentang',
        items: [
          'Cabang Gereja — pin oranye.',
          'Zona — poligon berwarna yang menghubungkan semua titik homecell di zona itu.',
          'Homecell — pin ungu (abu-abu bila nonaktif).',
          'Jemaat — pin foto profil, perkiraan lokasi rumah dari alamat (butuh akses menu Jemaat). Satu keluarga di titik yang sama disebar melingkar supaya semua terlihat.',
          'Sebaran jemaat — peta kepadatan tanpa nama.',
        ],
      },
      {
        kind: 'bullet',
        title: 'Saringan',
        items: [
          'Cabang, kategori homecell (Single / Couple / Umum), Zona, dan Homecell — untuk melihat satu zona atau satu homecell saja.',
          'Jemaat: semua / sudah homecell / belum homecell (aktif bila lapisan Jemaat dicentang).',
          'Pastor zona — hanya menampilkan zona (dan homecell di dalamnya) yang dilayani pastor terpilih.',
          'Pencarian nama cabang / zona (termasuk nama pastor) / homecell / jemaat → klik hasil untuk memperbesar ke lokasinya.',
          'Mencentang/menghapus centang lapisan tidak mengubah posisi & zoom peta.',
          'Layar penuh: saringan & legenda tetap mengambang di atas peta.',
        ],
      },
      {
        kind: 'steps',
        title: 'Cek Lokasi Member homecell',
        items: [
          'Klik pin homecell → tombol "Cek Lokasi Member".',
          'Peta hanya menampilkan homecell itu, anggota & PIC-nya, dengan garis lurus tebal dari homecell ke tiap rumah dan balon jarak di tengah garis.',
          'Panel di kanan (di HP: lembar di bawah, ketuk untuk membuka) berisi daftar anggota urut terdekat, rata-rata & jarak terjauh, serta anggota yang belum punya lokasi beserta alasannya.',
          'Klik balon/garis/nama → detail anggota, WhatsApp, dan "Rute ke homecell". Tutup dengan ×.',
        ],
      },
      {
        kind: 'steps',
        title: 'Cari Potensial Member homecell',
        items: [
          'Klik pin homecell → tombol "Cari Potensial Member" (homecell harus punya titik lokasi).',
          'Atur radius dengan tombol − / + atau ketik angka (0,5–50 km). Lingkaran hijau menunjukkan radiusnya.',
          'Pin hijau = jemaat aktif yang belum ikut homecell mana pun (bukan anggota & bukan PIC homecell) dan rumahnya — perkiraan dari alamat — dalam radius. Panel berisi daftar urut terdekat (jenis kelamin, usia, cabang).',
          'Klik nama/pin → detail, WhatsApp, dan "Rute ke homecell". Maksimal 300 orang terdekat ditampilkan. Butuh akses menu Jemaat.',
          'Di app (2.4.6) pemimpin homecell, PIC & pastor zona punya tombol "Potensial member" di detail homecell (no HP mengikuti pengaturan privasi jemaat).',
        ],
      },
      {
        kind: 'bullet',
        title: 'Pemetaan alamat jemaat',
        items: [
          'Alamat jemaat dipetakan otomatis lewat Google (kota cabang ditambahkan supaya tidak tertukar), sekitar 1.000 alamat tiap 15 menit. Tombol "Proses sekarang" untuk mempercepat.',
          'Bilah progres: berhasil · tidak dikenali · terlalu umum (hanya nama kota) · menunggu.',
          '"Lihat daftar" → jemaat yang alamatnya perlu dilengkapi + Unduh CSV. Alamat yang diperbaiki otomatis dipetakan ulang; pin lama langsung disembunyikan.',
          'Balon jemaat menampilkan ketelitian titik: tingkat rumah/gedung, jalan, atau kelurahan.',
        ],
      },
      {
        kind: 'tip',
        text: 'Cabang, ibadah, dan homecell memakai link Google Maps (bukan latitude/longitude). Tempel link bagikan dari Google Maps di form — koordinat diambil otomatis (7 angka di belakang koma) dan tombol Petunjuk arah di app membuka titik tersebut.',
      },
      { kind: 'menu-card', href: '/dashboard/map', label: 'Buka Map View', description: 'Peta cabang, homecell & jemaat' },
    ],
  },
  {
    id: 'service-baru',
    title: 'Ibadah & Event — Pengaturan Terbaru',
    icon: Church,
    summary: 'Urutan ibadah, rating on/off, self check-in +30 menit, laporan ibadah & event.',
    content: [
      {
        kind: 'bullet',
        title: 'Ibadah',
        items: [
          'Urutan tampil: geser urutan di daftar Ibadah — tab Ibadah & Beranda di app mengikuti urutan ini.',
          'Kolom Rating (Ya/Tidak) di daftar ibadah: matikan bila ibadah tersebut tidak perlu diulas. Kartu ulasan di tiket app ikut hilang.',
          'Jadwal Bulanan: pilih minggu ke-1 sampai ke-4 lalu harinya. Jam jadwal = jam di zona waktu cabang.',
          'Self check-in dibuka sampai 30 menit setelah ibadah/event selesai; jemaat juga bisa membatalkan self check-in yang salah dari tiket.',
          'Laporan Ibadah: kehadiran, tamu per kategori, ulasan jemaat — bisa diunduh PDF/Excel.',
        ],
      },
      {
        kind: 'bullet',
        title: 'Event',
        items: [
          'Rating & ulasan bisa dinyalakan/dimatikan per event di form event.',
          'Lokasi atau jam yang dikosongkan tampil "-" di app.',
          'Laporan Event: peserta, kehadiran, tamu, ulasan — PDF/Excel.',
        ],
      },
    ],
  },
  {
    id: 'people-baru',
    title: 'People — Tamu, Prayer Request, Kritik & Saran',
    icon: Heart,
    summary: 'Tamu & kategorinya, penugasan petugas doa, masukan jemaat, keluarga otomatis.',
    content: [
      {
        kind: 'bullet',
        title: 'Tamu',
        items: [
          'Tamu = orang yang belum menjadi jemaat (dicatat lewat app: Tamu saya, usher walk-in, homecell, visit dengan tamu, atau mode tamu → minta bergabung homecell).',
          'Kategori tamu: New Comer (berpotensi berjemaat), Visitor (hanya berkunjung), atau Belum ditentukan — bisa diubah admin di Portal → Tamu.',
          'Status follow-up & petugas follow-up diatur di halaman Tamu. Laporan ibadah/event/cabang/area memecah tamu per kategori.',
        ],
      },
      {
        kind: 'steps',
        title: 'Prayer Request — atur petugas doa',
        items: [
          'Buka Prayer Request → Konfigurasi Petugas.',
          'Bagian Role: pilih role (+ sub role atau semua sub role).',
          'Bagian Ministry: pilih ministry (+ peran tertentu atau semua anggota aktif).',
          'Simpan → jemaat yang cocok bisa ditugaskan; tab tugas doa otomatis muncul di app mereka.',
          'Tugaskan doa dari daftar Prayer Request → petugas mendapat notifikasi in-app + WhatsApp.',
        ],
      },
      {
        kind: 'bullet',
        title: 'Lainnya',
        items: [
          'Kritik & Saran: masukan dari app, balas langsung — jemaat menerima notifikasi balasan.',
          'Relasi keluarga: menambahkan anak otomatis menghubungkan pasangan sebagai ayah/ibu; menambahkan pasangan otomatis menghubungkan anak-anaknya.',
          'Catatan khotbah (Catatan saya) & jurnal Bible 365 jemaat bersifat pribadi — tidak terlihat di Portal.',
        ],
      },
    ],
  },
  {
    id: 'app-settings-baru',
    title: 'App Settings — Onboarding Config & Maintenance Mode',
    icon: Smartphone,
    summary: 'Role otomatis saat onboarding, jemaat tanpa role, mode perawatan app.',
    content: [
      {
        kind: 'steps',
        title: 'Onboarding Config',
        items: [
          'Buka App Settings → Onboarding Config.',
          'Atur role yang diberikan otomatis saat jemaat menyelesaikan onboarding di app (Jemaat Tetap / New Comer).',
          'Bagian "Jemaat sudah onboarding tapi belum punya role": atur role-nya lalu klik Terapkan untuk memberi role ke jemaat yang belum punya.',
          'Role tidak pernah dobel dan kegagalan pemberian role tidak memblokir pendaftaran.',
        ],
      },
      {
        kind: 'tip',
        text: 'Audit Log kini punya ringkasan bahasa sederhana di tiap detail, dan mencatat aksi baru dari app (doa, masukan, ulasan, ganti no HP, permintaan bergabung homecell, dll) maupun Portal.',
      },
      { kind: 'menu-card', href: '/dashboard/onboarding-config', label: 'Onboarding Config', description: 'Role otomatis saat onboarding' },
    ],
  },
  {
    id: 'developer-tools',
    title: 'Developer Tools',
    icon: Wrench,
    summary: 'Akses kontrol, API key, audit log, maintenance, dan server health.',
    content: [
      { kind: 'menu-card', href: '/dashboard/role-access', label: 'Role Access', description: 'Set akses portal + akses menu per role/sub-role (canRead/canWrite/canDelete per menu).' },
      { kind: 'menu-card', href: '/dashboard/api-key', label: 'API Keys', description: 'Manage API key untuk konsumer eksternal (mobile attendance system, dll).' },
      { kind: 'menu-card', href: '/dashboard/audit-log', label: 'Audit Log', description: 'Lihat semua aktivitas CUD + auth events. Filter by user/resource/range tanggal/search.' },
      { kind: 'menu-card', href: '/dashboard/maintenance', label: 'Maintenance', description: 'Manual trigger cleanup jobs + WA reminder dispatch + diagnostic counts.' },
      { kind: 'menu-card', href: '/dashboard/server-health', label: 'Server Health', description: 'Real-time CPU/memory/DB/storage stats + troubleshooting guide untuk tim ops.' },
      { kind: 'menu-card', href: '/dashboard/wa-config', label: 'WhatsApp Notif Config', description: 'Aktifkan/matikan notifikasi WhatsApp per jenis (reminder, event, homecell, keluarga, ministry, dll), edit template pesan, dan kirim test ke nomor sendiri.' },
      { kind: 'menu-card', href: '/dashboard/tech-docs', label: 'Technical Documentation', description: 'Dokumentasi teknis untuk tim dev/ops: arsitektur, database, deploy, nginx, PM2, testing.' },
      { kind: 'menu-card', href: '/dashboard/it-minister-team', label: 'Team IT Minister', description: 'Struktur tim IT Minister (divisi + peran). Anggota aktif otomatis dapat akses Ticketing Tools.' },
      { kind: 'menu-card', href: '/planning', label: 'Ticketing Tools', description: 'Aplikasi planning tim IT (Epic → Story → Task, Sprint, Kanban, komentar). Terbuka di tab baru tanpa login ulang; hanya untuk anggota IT Minister Team.' },
      {
        kind: 'steps',
        title: 'Beri akses portal ke role baru',
        items: [
          'Buka Role Access → pilih role yang mau di-set.',
          'Toggle "Can Access Portal" → role ini bisa login portal.',
          'Section Menu Access → centang menu yang boleh dia akses + level (Read / Write / Delete).',
          'Klik Simpan. Sub-role bisa override (kalau tidak override, inherit dari role parent).',
        ],
      },
      {
        kind: 'paragraph',
        text: 'Server Health auto-refresh 5 detik dengan alert otomatis (memory >90%, CPU overload, DB latency >500ms, dll). Termasuk troubleshooting section lengkap untuk 16 case umum di production.',
      },
      {
        kind: 'steps',
        title: 'Atur notifikasi WhatsApp',
        items: [
          'Buka Developer Tools → WhatsApp Notif Config. Notif dikelompokkan per kategori (Ibadah, Event, Homecell, Pelayanan, dll).',
          'Klik satu jenis notif → aktifkan / matikan dengan toggle.',
          'Edit template — gunakan placeholder yang tercantum, mis. {nama}, {event_judul}. Klik Simpan (berlaku maks 60 detik kemudian).',
          'Klik Test untuk mengirim contoh pesan ke nomor Anda sebelum diaktifkan untuk semua jemaat.',
        ],
      },
      {
        kind: 'steps',
        title: 'Pakai Ticketing Tools',
        items: [
          'Pastikan Anda terdaftar aktif di Team IT Minister (kalau tidak, halaman menampilkan "Akses Ditolak").',
          'Klik Developer Tools → Ticketing Tools → terbuka di tab baru (portal.eccchurch.global/planning).',
          'Sprints: buat sprint, lalu Activate (hanya 1 sprint aktif sekaligus) dan Complete saat selesai.',
          'Backlog: buat Epic → tambah Story → tambah Task. Isi owner/assignee dari anggota IT Minister Team, priority P0–P3, sprint, estimasi jam.',
          'Kanban: pilih level Epic/Story/Task, geser kartu antar kolom status (atau pakai dropdown di kartu). Klik kartu untuk detail + komentar.',
          'My Items: daftar epic/story/task yang di-assign ke Anda.',
        ],
      },
      {
        kind: 'tip',
        text: 'Menu Operations Tickets sementara disembunyikan sampai aplikasinya dibangun.',
      },
      {
        kind: 'tip',
        text: 'Maintenance page bisa manual trigger WA reminder kalau cron schedule belum sampai (mis. mau test atau ada reservasi last-minute yang baru di-create).',
      },
    ],
  },
  {
    id: 'profile',
    title: 'Profil & Keamanan',
    icon: Shield,
    summary: 'Manage avatar, metode login, dan sign out semua sesi.',
    content: [
      {
        kind: 'menu-card',
        href: '/dashboard/profile',
        label: 'Profil & Keamanan',
        description: 'Foto avatar + info role + metode login (OTP WA + magic link email) + sign out session.',
      },
      {
        kind: 'steps',
        title: 'Ganti foto avatar',
        items: [
          'Buka Profil & Keamanan via bottom dock (icon user paling kanan).',
          'Klik "Ganti Avatar" di kanan atas header — pilih file (JPG/PNG/WebP).',
          'Foto auto-resize ke 1024px WebP + tampil langsung di header.',
        ],
      },
      {
        kind: 'bullet',
        title: 'Metode login',
        items: [
          'OTP WhatsApp — metode primer, kode 6-digit dikirim ke no HP terdaftar (Fonnte gateway).',
          'Magic link email — backup kalau WA OTP tidak sampai, link 15-menit dikirim via SendGrid.',
        ],
      },
      {
        kind: 'steps',
        title: 'Sign out',
        items: [
          'Sign Out (session ini) — button brand-orange di header profile. Terminate cuma browser/device saat ini.',
          'Logout dari Semua Sesi — button merah di card Sesi Keamanan. Revoke SEMUA refresh token di semua device (mobile + browser lain). Perlu OTP ulang di tiap device.',
          'Kalau Sign Out di 1 device, refresh token device lain TETAP aktif. Untuk terminate all, pakai opsi kedua.',
        ],
      },
      {
        kind: 'tip',
        text: 'Kalau device Anda hilang / dicuri, langsung "Logout dari Semua Sesi" — refresh token di device tsb ter-revoke, aman.',
      },
    ],
  },
  {
    id: 'shortcuts',
    title: 'Tips & Shortcuts',
    icon: Lightbulb,
    summary: 'Tips singkat untuk pengguna power.',
    content: [
      {
        kind: 'bullet',
        items: [
          'Klik nama di tabel = navigasi ke halaman detail. Klik icon pencil = quick edit modal.',
          'Filter tabel: sebagian besar list page punya search bar + filter dropdown. Pencarian debounced 300ms.',
          'Audit log = single source of truth untuk "siapa ngubah apa kapan". Filter by action (CREATE/UPDATE/DELETE/LOGIN), resource, range tanggal.',
          'Server Health page auto-refresh setiap 5 detik. Bisa di-disable kalau preserve quota network.',
          'Setiap grup di sidebar bisa di-collapse. State persistent di localStorage browser.',
          'Tanya Elsa (dashboard Elsa) kalau perlu quick data — dia bisa akses 30 entity DB via dynamic query. Contoh: "berapa jemaat aktif di ECC Bandung?"',
          'Calendar view di Ibadah lebih cocok untuk planning visual. List view lebih cocok untuk bulk edit.',
          'Bulk import CSV punya dry-run mode — selalu preview dulu sebelum commit.',
          'Untuk troubleshooting masalah production, buka Server Health → expand kategori sesuai gejala.',
        ],
      },
    ],
  },
  {
    id: 'faq',
    title: 'FAQ — Pertanyaan Umum',
    icon: HelpCircle,
    summary: 'Jawaban untuk masalah umum.',
    content: [
      {
        kind: 'paragraph',
        text: 'Q: Saya lupa nomor HP / nomor saya ganti. Bagaimana login?',
      },
      {
        kind: 'paragraph',
        text: 'A: Hubungi admin sinode (Fulltimer dengan akses Jemaat menu) untuk update nomor HP Anda di portal. Setelah update, login dengan nomor baru via OTP.',
      },
      {
        kind: 'paragraph',
        text: 'Q: OTP tidak datang ke WhatsApp.',
      },
      {
        kind: 'paragraph',
        text: 'A: Cek (1) WhatsApp aktif & punya internet, (2) nomor Anda di portal sudah benar beserta kode negaranya (mis. +62…, +65…), (3) Fonnte gateway aktif (cek Server Health → Env config → Fonnte). Cooldown OTP 60 detik antar request — tunggu sebelum retry.',
      },
      {
        kind: 'paragraph',
        text: 'Q: Saya tidak bisa lihat menu tertentu di sidebar.',
      },
      {
        kind: 'paragraph',
        text: 'A: Sidebar filter berdasarkan RBAC role Anda. Hubungi admin untuk minta akses ke menu yang dibutuhkan. Admin set akses di Role Access page.',
      },
      {
        kind: 'paragraph',
        text: 'Q: WA OTP tidak sampai — bagaimana login?',
      },
      {
        kind: 'paragraph',
        text: 'A: Pakai backup magic link email di halaman login → klik "Login via Email" → isi email jemaat Anda → cek inbox untuk link 15-menit. Kalau email juga tidak terdaftar, hubungi admin/superadmin ECC.',
      },
      {
        kind: 'paragraph',
        text: 'Q: Jemaat saya keluar dari gereja dan minta data dihapus.',
      },
      {
        kind: 'paragraph',
        text: 'A: Jemaat bisa self-deactivate via mobile app (Menu → Hapus Akun). Akun di-set isActive=false (soft delete) — data historis kehadiran/event/donasi tetap untuk catatan gereja, tapi user tidak bisa login lagi + tidak muncul di lookup mobile. Untuk reaktivasi, admin toggle isActive=true di detail jemaat.',
      },
    ],
  },
];

// ===========================================================================
// PAGE
// ===========================================================================
export default function UserGuidePage() {
  const [search, setSearch] = useState('');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set([SECTIONS[0]!.id]));

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setOpenIds(new Set(SECTIONS.map((s) => s.id)));
  }
  function collapseAll() {
    setOpenIds(new Set());
  }

  // Filter sections berdasar search
  const q = search.trim().toLowerCase();
  const filtered = q
    ? SECTIONS.map((s) => {
        const matchTitle = s.title.toLowerCase().includes(q);
        const matchSummary = s.summary.toLowerCase().includes(q);
        const matchBlocks = s.content.some((b) => {
          if (b.kind === 'paragraph' || b.kind === 'tip' || b.kind === 'warning') {
            return b.text.toLowerCase().includes(q);
          }
          if (b.kind === 'steps' || b.kind === 'bullet') {
            return (
              (b.title ?? '').toLowerCase().includes(q) ||
              b.items.some((i) => i.toLowerCase().includes(q))
            );
          }
          if (b.kind === 'menu-card') {
            return (
              b.label.toLowerCase().includes(q) ||
              b.description.toLowerCase().includes(q)
            );
          }
          return false;
        });
        return { section: s, matched: matchTitle || matchSummary || matchBlocks };
      })
        .filter((x) => x.matched)
        .map((x) => x.section)
    : SECTIONS;

  return (
    <div className="w-full">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <BookOpenCheck className="w-6 h-6" />
            User Guide
          </h1>
          <p className="text-neutral-500 mt-1">
            Panduan lengkap cara menggunakan ECC Portal. Klik section untuk expand
            isinya. Pakai search untuk cari topik spesifik.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={expandAll}
            className="px-3 py-1.5 text-xs text-neutral-700 border border-neutral-300 hover:bg-neutral-50 rounded-lg"
          >
            Expand all
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-1.5 text-xs text-neutral-700 border border-neutral-300 hover:bg-neutral-50 rounded-lg"
          >
            Collapse all
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="flex items-center gap-2 border border-neutral-300 rounded-lg px-3 focus-within:ring-2 focus-within:ring-brand-500 bg-white">
          <Search className="w-4 h-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari di panduan... (mis. 'ibadah', 'login', 'donation')"
            className="flex-1 py-2 outline-none text-sm"
          />
        </div>
        {q && (
          <div className="mt-2 text-xs text-neutral-500">
            {filtered.length} dari {SECTIONS.length} section cocok dengan "{search}".
          </div>
        )}
      </div>

      {/* TOC quick links */}
      {!q && (
        <div className="mb-6 grid grid-cols-2 md:grid-cols-3 gap-2">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  setOpenIds((prev) => new Set(prev).add(s.id));
                  setTimeout(
                    () => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                    50,
                  );
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-brand-50 hover:text-brand-700 rounded-lg border border-neutral-200"
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{s.title}</span>
              </a>
            );
          })}
        </div>
      )}

      {/* Sections */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-10 text-center text-sm text-neutral-400 italic">
            Tidak ada section yang cocok dengan pencarian "{search}".
          </div>
        ) : (
          filtered.map((s) => {
            const open = openIds.has(s.id);
            const Icon = s.icon;
            return (
              <div
                key={s.id}
                id={s.id}
                className="bg-white border border-neutral-200 rounded-xl overflow-hidden scroll-mt-6"
              >
                <button
                  onClick={() => toggle(s.id)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-neutral-50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-neutral-900">{s.title}</div>
                      <div className="text-xs text-neutral-500 mt-0.5 truncate">{s.summary}</div>
                    </div>
                  </div>
                  {open ? (
                    <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
                  )}
                </button>
                {open && (
                  <div className="px-5 pb-5 pt-1 border-t border-neutral-100 space-y-3">
                    {s.content.map((block, idx) => (
                      <ContentBlockRender key={idx} block={block} />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="mt-8 mb-4 text-xs text-neutral-500 text-center border-t border-neutral-100 pt-4">
        Panduan dimaintain oleh tim IDEA. Update terakhir: 2026-05-22. Saran perbaikan?
        Hubungi admin sinode atau buka issue di repo internal.
      </div>
    </div>
  );
}

function ContentBlockRender({ block }: { block: ContentBlock }) {
  switch (block.kind) {
    case 'paragraph':
      return <p className="text-sm text-neutral-700 leading-relaxed">{block.text}</p>;

    case 'steps':
      return (
        <div>
          {block.title && (
            <div className="font-semibold text-sm text-neutral-900 mb-2">{block.title}</div>
          )}
          <ol className="space-y-1.5 text-sm text-neutral-700 list-decimal ml-5">
            {block.items.map((it, i) => (
              <li key={i} className="pl-1">
                {it}
              </li>
            ))}
          </ol>
        </div>
      );

    case 'bullet':
      return (
        <div>
          {block.title && (
            <div className="font-semibold text-sm text-neutral-900 mb-2">{block.title}</div>
          )}
          <ul className="space-y-1 text-sm text-neutral-700 list-disc ml-5">
            {block.items.map((it, i) => (
              <li key={i} className="pl-1">
                {it}
              </li>
            ))}
          </ul>
        </div>
      );

    case 'tip':
      return (
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-900">
          <Lightbulb className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <div><strong>Tip:</strong> {block.text}</div>
        </div>
      );

    case 'warning':
      return (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <div><strong>Perhatian:</strong> {block.text}</div>
        </div>
      );

    case 'menu-card': {
      const isExternal = block.href.startsWith('http');
      return (
        <a
          href={block.href}
          className="block bg-neutral-50 hover:bg-brand-50/40 border border-neutral-200 hover:border-brand-200 rounded-lg px-3 py-2 transition"
          {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-neutral-900">{block.label}</span>
            <span className="text-[10px] font-mono text-neutral-400">{block.href}</span>
          </div>
          <div className="text-xs text-neutral-600">{block.description}</div>
        </a>
      );
    }
  }
}
