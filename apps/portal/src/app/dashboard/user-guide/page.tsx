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
          'Selesai. Setelah berhasil login pertama kali, Anda bisa enroll wajah di Profil untuk login lebih cepat di kemudian hari.',
        ],
      },
      {
        kind: 'tip',
        text: 'Kalau OTP tidak datang dalam 1 menit, pastikan WhatsApp Anda aktif. Bisa request OTP baru setelah cooldown 60 detik.',
      },
      {
        kind: 'steps',
        title: 'Login dengan wajah (shortcut)',
        items: [
          'Sebelum bisa login wajah, harus enroll dulu: Profil → Keamanan → Daftarkan Wajah.',
          'Saat login, klik "Login dengan Wajah" di halaman login.',
          'Masukkan nomor HP, lalu posisikan wajah di kamera. Ikuti instruksi liveness challenge (kedip, hadapkan ke arah panel).',
          'Kalau wajah cocok, otomatis login tanpa OTP.',
        ],
      },
      {
        kind: 'warning',
        text: 'Login wajah hanya shortcut — Anda tetap perlu OTP backup kalau pakai device baru atau wajah Anda berubah signifikan (kacamata, jenggot baru, dll).',
      },
      {
        kind: 'bullet',
        title: 'Struktur navigasi sidebar',
        items: [
          'Dashboard — ringkasan + shortcut',
          'User Guide — panduan ini',
          'Entity — Sinode, Cabang Gereja',
          'Service — Ibadah, Kategori, Pelayanan, Kehadiran',
          'People — Jemaat, Role, Relasi',
          'Community — Homecell Area, Homecell',
          'Movement — Event, Visit, Local Market',
          'Broadcast — News, Renungan',
          'App Settings — Legal Docs, App Versions',
          'Developer Tools — Role Access, API Keys, Audit Log, Maintenance, Server Health',
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
    id: 'entity',
    title: 'Entity — Sinode & Cabang',
    icon: Building2,
    summary: 'Kelola struktur organisasi level atas: sinode, cabang gereja, dan rekening bank cabang.',
    content: [
      { kind: 'menu-card', href: '/dashboard/sinode', label: 'Sinode', description: 'Top-level organisasi (mis. ECC Indonesia). Sinode menaungi banyak cabang.' },
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
        text: 'Petugas harus sudah jadi member Pelayanan tsb dulu (via halaman detail jemaat). Validasi backend: pelayananRole harus belong ke pelayanan yang dipilih.',
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
      { kind: 'menu-card', href: '/dashboard/homecell-area', label: 'Homecell Area', description: 'Zone level atas per cabang (mis. Jakarta Pusat, Bandung Utara). PIC = Zone Leader dari Pelayanan Penggembalaan.' },
      { kind: 'menu-card', href: '/dashboard/homecell', label: 'Homecell', description: 'Cellgroup individual di bawah area. PIC = Homecell Leader. Punya anggota + jadwal pertemuan.' },
      {
        kind: 'steps',
        title: 'Setup struktur homecell baru',
        items: [
          'Pastikan jemaat yang akan jadi PIC sudah join Pelayanan Penggembalaan dengan role yang sesuai.',
          'Buat Area dulu (Homecell Area → Tambah). Pilih cabang + PIC Zone Leader.',
          'Lalu buat Homecell di Homecell → Tambah → pilih area + PIC Homecell Leader.',
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
        kind: 'tip',
        text: 'Maintenance page bisa manual trigger WA reminder kalau cron schedule belum sampai (mis. mau test atau ada reservasi last-minute yang baru di-create).',
      },
    ],
  },
  {
    id: 'profile',
    title: 'Profil & Keamanan',
    icon: Shield,
    summary: 'Manage profil sendiri, password, dan enrollment wajah.',
    content: [
      {
        kind: 'steps',
        title: 'Update profil sendiri',
        items: [
          'Klik Profil & Keamanan di bagian bawah sidebar.',
          'Tab Profil → edit nama, alamat, dst.',
          'Foto profil: upload image baru → auto-resize 1024px webp.',
          'Klik Simpan.',
        ],
      },
      {
        kind: 'steps',
        title: 'Daftarkan wajah untuk login shortcut',
        items: [
          'Tab Keamanan → section Wajah → klik Daftarkan Wajah.',
          'Posisikan wajah di kamera dalam kondisi pencahayaan baik.',
          'Ikuti liveness challenge (kedip + hadapkan ke arah).',
          'Sistem extract descriptor wajah (128-dim vector) + simpan.',
          'Selesai. Selanjutnya bisa login wajah dari halaman login.',
        ],
      },
      {
        kind: 'warning',
        text: 'Data wajah disimpan sebagai vector matematis, BUKAN foto wajah Anda. Tidak bisa di-reverse menjadi gambar. Untuk hapus, klik "Hapus Wajah" di section yang sama (PDP Law compliance).',
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
          'Untuk login lebih cepat di device sendiri, enroll wajah sekali → next time klik "Login dengan Wajah".',
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
        text: 'A: Cek (1) WhatsApp aktif & punya internet, (2) nomor Anda di portal sudah dalam format E.164 (+62...), (3) Fonnte gateway aktif (cek Server Health → Env config → Fonnte). Cooldown OTP 60 detik antar request — tunggu sebelum retry.',
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
        text: 'Q: Login wajah selalu gagal padahal sudah enroll.',
      },
      {
        kind: 'paragraph',
        text: 'A: Kemungkinan kondisi pencahayaan beda saat enroll vs login, wajah berubah (kacamata baru, jenggot, dll), atau ada model version mismatch (error code FACE_MODEL_MISMATCH). Solusi: reset wajah di Profil → Keamanan → Hapus Wajah, lalu enroll ulang.',
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
    <div className="max-w-4xl">
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
