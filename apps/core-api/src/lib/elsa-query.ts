/**
 * Elsa dynamic query helpers — Modul 31 v2.
 *
 * Design: expose Prisma DB via generic query tools dgn strict guardrails:
 *   - Entity whitelist (30 entities safe untuk exposure)
 *   - Field exclusion per entity (sensitive: face descriptor, credential secrets)
 *   - Relation include whitelist per entity (prevent leak via nested include)
 *   - Max 50 records per query
 *   - Read-only operations (findMany/findUnique/count/groupBy)
 *   - Include depth 2 (prevent N+1 leak)
 *
 * Public API (dipakai router elsa.ts):
 *   - listEntities() → { entities: [{name, description, keyFields, allowedInclude}] }
 *   - describeEntity(name) → full schema info + example queries
 *   - queryEntity(entity, filter?, include?, orderBy?, limit?) → rows[]
 *   - countEntity(entity, filter?) → { count }
 *   - groupByEntity(entity, by, filter?) → grouped counts
 */
import { prisma } from '@ecc/database';
import { normalizePhoneNumber } from '@ecc/shared-types';

// ============================================================
// ENTITY_MAP — 30 whitelisted entities
// ============================================================

interface EntityConfig {
  /** Prisma client key (mis. 'jemaat' untuk prisma.jemaat) */
  prismaKey: string;
  /** Human-readable description untuk LLM */
  description: string;
  /** Fields to exclude dari response (sensitive data) */
  excludeFields?: string[];
  /** Relations yang boleh di-include (nama sesuai Prisma schema field) */
  allowedInclude: string[];
  /** Filter fields yang commonly digunakan (untuk prompt hint) */
  keyFields: string[];
}

export const ENTITY_MAP: Record<string, EntityConfig> = {
  // ===== Entity =====
  sinode: {
    prismaKey: 'sinode',
    description: 'Sinode (top-level organization, mis. "ECC Indonesia"). Menaungi banyak cabang.',
    allowedInclude: ['cabangs'],
    keyFields: ['id', 'nama', 'kode', 'isActive'],
  },
  cabang: {
    prismaKey: 'cabangGereja',
    description: 'Cabang gereja lokal di bawah sinode. Punya alamat, kontak, koordinat.',
    allowedInclude: ['sinode', 'rekening', 'jemaats'],
    keyFields: ['id', 'nama', 'kode', 'kota', 'sinodeId', 'timezone', 'mapsUrl', 'latitude', 'longitude', 'isActive'],
  },
  // ===== People =====
  jemaat: {
    prismaKey: 'jemaat',
    description:
      'Master data jemaat (church member). Full profile: nama, no HP, cabang, tanggal lahir, alamat. Tamu (belum jemaat) = isTamu true; tamuKategori NEW_COMER | VISITOR | null (belum ditentukan); tamuStatus = status follow-up tamu.',
    excludeFields: [],
    allowedInclude: [
      'cabang',
      'primaryGuardian',
      'jemaatRoles',
      'jemaatPelayanan',
      'relasiAsal',
      'homecellMembership',
    ],
    keyFields: ['id', 'namaLengkap', 'noHp', 'kode', 'cabangId', 'jenisKelamin', 'tanggalLahir', 'alamat', 'isTamu', 'tamuKategori', 'tamuStatus', 'isActive'],
  },
  role: {
    prismaKey: 'role',
    description: 'Master role jemaat (Jemaat Tetap, Fulltimer, dll) + sub-role hierarchy.',
    allowedInclude: ['subRoles', 'parentRole'],
    keyFields: ['id', 'nama', 'kode', 'parentRoleId', 'isActive'],
  },
  jemaat_role: {
    prismaKey: 'jemaatRole',
    description: 'Assignment role ke jemaat. Jemaat bisa punya multiple role.',
    allowedInclude: ['jemaat', 'role'],
    keyFields: ['id', 'jemaatId', 'roleId', 'isActive'],
  },
  tipe_relasi: {
    prismaKey: 'tipeRelasiKeluarga',
    description: 'Master tipe relasi keluarga (Suami/Istri, Ayah/Ibu, Anak L/P, Kakek/Nenek, Wali, dll).',
    allowedInclude: [],
    keyFields: ['id', 'nama', 'isActive'],
  },
  jemaat_relasi: {
    prismaKey: 'jemaatRelasi',
    description: 'Relasi keluarga antar jemaat (2-arah auto-reciprocal). Contoh: Ari→Sarah=Istri, Sarah→Ari=Suami.',
    allowedInclude: ['jemaat', 'jemaatTerkait', 'tipeRelasi'],
    keyFields: ['id', 'jemaatId', 'jemaatTerkaitId', 'tipeRelasiId'],
  },
  // ===== Service =====
  kategori_ibadah: {
    prismaKey: 'kategoriIbadah',
    description: 'Master kategori ibadah (Ibadah Umum, Pemuda, KKR, Doa, Anak, dll).',
    allowedInclude: ['ibadah'],
    keyFields: ['id', 'nama', 'isActive'],
  },
  ibadah: {
    prismaKey: 'ibadah',
    description: 'Jadwal ibadah (weekly/biweekly/monthly/once) per cabang.',
    allowedInclude: ['cabang', 'kategoriIbadah', 'reservasi', 'pelayananLinks'],
    keyFields: ['id', 'nama', 'cabangId', 'kategoriIbadahId', 'tipeJadwal', 'hari', 'jamMulai', 'jamSelesai', 'urutan', 'allowReview', 'mapsUrl', 'isKidsIbadah', 'requiresCheckout', 'isActive'],
  },
  pelayanan: {
    prismaKey: 'pelayanan',
    description: 'Master ministry / pelayanan (Worship Team, Multimedia, Usher, dll).',
    allowedInclude: ['roles', 'jemaatPelayanan'],
    keyFields: ['id', 'nama', 'deskripsi', 'ikon', 'warna', 'isActive'],
  },
  pelayanan_role: {
    prismaKey: 'pelayananRole',
    description: 'Role di pelayanan (mis. Sound Engineer, Vocal, Leader) + level hierarchy.',
    allowedInclude: ['pelayanan', 'jemaatPelayanan'],
    keyFields: ['id', 'pelayananId', 'nama', 'level', 'isActive'],
  },
  jemaat_pelayanan: {
    prismaKey: 'jemaatPelayanan',
    description: 'Membership jemaat di pelayanan + posisi role.',
    allowedInclude: ['jemaat', 'pelayanan', 'pelayananRole'],
    keyFields: ['id', 'jemaatId', 'pelayananId', 'pelayananRoleId', 'tanggalMulai', 'isActive'],
  },
  pelayanan_approver: {
    prismaKey: 'pelayananApprover',
    description: 'Otoritas approval request bergabung pelayanan: anggota mana yang boleh menyetujui request dari cabang mana.',
    allowedInclude: ['pelayanan', 'jemaat', 'cabang'],
    keyFields: ['id', 'pelayananId', 'jemaatId', 'cabangId', 'createdAt'],
  },
  reservasi: {
    prismaKey: 'reservasi',
    description: 'Reservasi/kehadiran ibadah per jemaat per tanggal. Status: RESERVE/JOIN/CANCEL.',
    allowedInclude: ['jemaat', 'ibadah'],
    keyFields: ['id', 'jemaatId', 'ibadahId', 'tanggalIbadah', 'status', 'joinedAt', 'checkedOutAt', 'pickedUpAt', 'pickupCode'],
  },
  // ===== Community =====
  homecell_area: {
    prismaKey: 'homecellArea',
    description: 'Zona (dulu "Homecell Area") — kelompok homecell per wilayah. Punya PIC (Zone Leader) dan pastor (bisa lebih dari satu).',
    allowedInclude: ['homecells', 'cabang', 'picJemaat', 'pastors'],
    keyFields: ['id', 'nama', 'cabangId', 'picJemaatId', 'isActive'],
  },
  homecell_area_pastor: {
    prismaKey: 'homecellAreaPastor',
    description: 'Pastor zona: siapa pastor di zona mana (banyak pastor per zona, satu pastor banyak zona).',
    allowedInclude: ['area', 'jemaat'],
    keyFields: ['id', 'areaId', 'jemaatId'],
  },
  homecell: {
    prismaKey: 'homecell',
    description: 'Homecell (kelompok kecil per area) + PIC.',
    allowedInclude: ['area', 'picJemaat', 'members', 'schedules'],
    keyFields: ['id', 'nama', 'areaId', 'picJemaatId', 'hari', 'jam', 'kategori', 'usiaMin', 'usiaMax', 'mapsUrl', 'latitude', 'longitude', 'isActive'],
  },
  homecell_member: {
    prismaKey: 'homecellMember',
    description: 'Membership jemaat di homecell.',
    allowedInclude: ['homecell', 'jemaat'],
    keyFields: ['id', 'homecellId', 'jemaatId', 'isActive', 'tanggalKeluar'],
  },
  homecell_schedule: {
    prismaKey: 'homecellSchedule',
    description: 'Jadwal pertemuan homecell (per tanggal + lokasi).',
    allowedInclude: ['homecell', 'creator', 'attendances'],
    keyFields: ['id', 'homecellId', 'tanggal', 'lokasi', 'createdBy'],
  },
  homecell_attendance: {
    prismaKey: 'homecellAttendance',
    description: 'Absensi jemaat di pertemuan homecell (via QR scan).',
    allowedInclude: ['schedule', 'jemaat', 'scanner'],
    keyFields: ['id', 'scheduleId', 'jemaatId', 'scannedAt', 'source'],
  },
  // ===== Movement =====
  event: {
    prismaKey: 'event',
    description: 'Event satu-kali (KKR, Retret, dll) dgn registrasi + pembayaran + checkin.',
    allowedInclude: ['cabang', 'sinode', 'author', 'partisipasi'],
    keyFields: ['id', 'judul', 'slug', 'tanggalMulai', 'tanggalSelesai', 'cabangId', 'sinodeId', 'tipeBayar', 'quotaPeserta', 'allowReview', 'isPublished'],
  },
  event_participation: {
    prismaKey: 'eventParticipation',
    description: 'Peserta event + status (DAFTAR/MENUNGGU_VERIFIKASI/BAYAR/HADIR/BATAL).',
    allowedInclude: ['event', 'jemaat', 'approver'],
    keyFields: ['id', 'eventId', 'jemaatId', 'status', 'nominalBayar', 'paidAt', 'attendedAt'],
  },
  visit: {
    prismaKey: 'visit',
    description: 'Visit peer-to-peer antar jemaat (scan QR). Movement module.',
    allowedInclude: ['initiator', 'target'],
    keyFields: ['id', 'initiatorJemaatId', 'targetJemaatId', 'judul', 'lokasi', 'tanggalVisit'],
  },
  local_business: {
    prismaKey: 'localBusiness',
    description: 'UMKM directory / Local Market — bisnis jemaat.',
    allowedInclude: ['owner', 'cabang'],
    keyFields: ['id', 'nama', 'ownerJemaatId', 'cabangId', 'industri', 'tipeBisnis', 'isActive', 'isPublic'],
  },
  // ===== Broadcast =====
  konten: {
    prismaKey: 'konten',
    description: 'Konten broadcast (News atau Renungan) — tipe dibedakan via field type.',
    allowedInclude: ['cabang', 'sinode', 'author'],
    keyFields: ['id', 'type', 'judul', 'slug', 'ringkasan', 'cabangId', 'sinodeId', 'isPublished', 'publishedAt'],
  },
  // ===== Group =====
  group: {
    prismaKey: 'group',
    description: 'Generic group (module 23) — terpisah dari homecell. Support hierarchy + public/private.',
    allowedInclude: ['picJemaat', 'parent', 'children', 'members', 'jenis'],
    keyFields: ['id', 'nama', 'jenis', 'parentId', 'picJemaatId', 'cabangId', 'isPublic', 'isActive'],
  },
  group_member: {
    prismaKey: 'groupMember',
    description: 'Member di group (module 23).',
    allowedInclude: ['group', 'jemaat'],
    keyFields: ['id', 'groupId', 'jemaatId', 'isActive', 'tanggalKeluar'],
  },
  // ===== CKids =====
  hadiah_katalog: {
    prismaKey: 'hadiahKatalog',
    description: 'Katalog hadiah CKids per cabang (untuk redeem point anak).',
    allowedInclude: ['cabang'],
    keyFields: ['id', 'cabangId', 'nama', 'pointCost', 'stock', 'isActive'],
  },
  jemaat_point_balance: {
    prismaKey: 'jemaatPointBalance',
    description: 'Balance point jemaat (biasanya anak) per cabang.',
    allowedInclude: ['jemaat', 'cabang'],
    keyFields: ['id', 'jemaatId', 'cabangId', 'balance', 'updatedAt'],
  },
  point_transaction: {
    prismaKey: 'pointTransaction',
    description: 'Transaksi point (EARN dari kehadiran kids ibadah, REDEEM dari stall, ADJUST manual).',
    allowedInclude: ['jemaat', 'cabang', 'createdBy'],
    keyFields: ['id', 'jemaatId', 'cabangId', 'type', 'amount', 'source', 'referenceId', 'note', 'createdAt'],
  },
  hadiah_redeem: {
    prismaKey: 'hadiahRedeem',
    description: 'History redeem hadiah di gift stall CKids.',
    allowedInclude: ['jemaat', 'hadiah', 'cabang', 'processedBy'],
    keyFields: ['id', 'jemaatId', 'hadiahId', 'cabangId', 'pointDeducted', 'processedAt'],
  },
  // ===== Tamu & follow-up =====
  jemaat_tamu: {
    prismaKey: 'jemaatTamu',
    description: 'Daftar "Tamu saya": jemaat (inviter) yang mengundang/mencatat tamu (tamu = jemaat dgn isTamu true). Kategori & status tamu ada di entity jemaat (tamuKategori, tamuStatus).',
    allowedInclude: ['inviter', 'tamu'],
    keyFields: ['id', 'inviterId', 'tamuId', 'createdAt'],
  },
  homecell_tamu: {
    prismaKey: 'homecellTamu',
    description: 'Tamu yang dicatat di homecell oleh pemimpin/PIC.',
    allowedInclude: ['homecell', 'tamu', 'addedBy'],
    keyFields: ['id', 'homecellId', 'tamuId', 'addedById', 'createdAt'],
  },
  homecell_tamu_attendance: {
    prismaKey: 'homecellTamuAttendance',
    description: 'Kehadiran tamu di pertemuan homecell (per jadwal).',
    allowedInclude: ['schedule', 'tamu', 'markedBy'],
    keyFields: ['id', 'scheduleId', 'tamuId', 'createdAt'],
  },
  homecell_guest_request: {
    prismaKey: 'homecellGuestRequest',
    description: 'Permintaan bergabung homecell dari tamu (mode tamu app, tanpa akun). kategori = pilihan tamu (BELUM/NEW_COMER/VISITOR). Status PENDING/APPROVED/REJECTED.',
    excludeFields: ['tokenHash'],
    allowedInclude: ['homecell', 'tamu', 'reviewedBy'],
    keyFields: ['id', 'homecellId', 'nama', 'noHp', 'jenisKelamin', 'usia', 'kategori', 'status', 'createdAt'],
  },
  homecell_join_request: {
    prismaKey: 'homecellJoinRequest',
    description: 'Permintaan jemaat bergabung ke homecell. Status PENDING/APPROVED/REJECTED.',
    allowedInclude: ['homecell', 'jemaat', 'reviewedBy'],
    keyFields: ['id', 'homecellId', 'jemaatId', 'status', 'reviewedAt', 'createdAt'],
  },
  group_join_request: {
    prismaKey: 'groupJoinRequest',
    description: 'Permintaan jemaat bergabung ke group. Status PENDING/APPROVED/REJECTED.',
    allowedInclude: ['group', 'jemaat', 'reviewedBy'],
    keyFields: ['id', 'groupId', 'jemaatId', 'via', 'status', 'createdAt'],
  },
  // ===== Papan homecell & group =====
  homecell_announcement: {
    prismaKey: 'homecellAnnouncement',
    description: 'Pengumuman di papan homecell.',
    allowedInclude: ['homecell', 'createdBy'],
    keyFields: ['id', 'homecellId', 'judul', 'isPinned', 'createdAt'],
  },
  homecell_poll: {
    prismaKey: 'homecellPoll',
    description: 'Polling di homecell (+ options & votes).',
    allowedInclude: ['homecell', 'createdBy', 'options'],
    keyFields: ['id', 'homecellId', 'pertanyaan', 'isClosed', 'closesAt', 'createdAt'],
  },
  group_announcement: {
    prismaKey: 'groupAnnouncement',
    description: 'Pengumuman di papan group.',
    allowedInclude: ['group', 'createdBy'],
    keyFields: ['id', 'groupId', 'judul', 'isPinned', 'createdAt'],
  },
  group_poll: {
    prismaKey: 'groupPoll',
    description: 'Polling di group (+ options & votes).',
    allowedInclude: ['group', 'createdBy', 'options'],
    keyFields: ['id', 'groupId', 'pertanyaan', 'isClosed', 'closesAt', 'createdAt'],
  },
  // ===== Pelayanan jemaat =====
  prayer_request: {
    prismaKey: 'prayerRequest',
    description:
      'Permohonan doa dari jemaat. status BARU/DITUGASKAN/SUDAH_DIDOAKAN; terjawab = terjawabAt terisi. kategori HEALTH/FAMILY/WORK/FINANCE/STUDY/RELATIONSHIP/RESTORATION/THANKSGIVING/OTHER. Isi doa & kesaksian TIDAK tersedia (pribadi) — lihat di Portal → Prayer Request. Abaikan yang deletedAt terisi.',
    excludeFields: ['isi', 'kesaksian', 'catatanPetugas', 'untukNama'],
    allowedInclude: ['cabang', 'petugas'],
    keyFields: ['id', 'jemaatId', 'cabangId', 'kategori', 'untuk', 'isAnonim', 'status', 'petugasId', 'assignedAt', 'didoakanAt', 'terjawabAt', 'deletedAt', 'createdAt'],
  },
  prayer_petugas_role: {
    prismaKey: 'prayerPetugasRole',
    description: 'Konfigurasi petugas doa berdasarkan role/sub role (subRoleId null = semua sub role).',
    allowedInclude: ['role', 'subRole'],
    keyFields: ['id', 'roleId', 'subRoleId'],
  },
  prayer_petugas_pelayanan: {
    prismaKey: 'prayerPetugasPelayanan',
    description: 'Konfigurasi petugas doa berdasarkan ministry (pelayananRoleId null = semua anggota aktif ministry).',
    allowedInclude: ['pelayanan', 'pelayananRole'],
    keyFields: ['id', 'pelayananId', 'pelayananRoleId'],
  },
  service_review: {
    prismaKey: 'serviceReview',
    description:
      'Ulasan (rating 1–5 + komentar) jemaat untuk ibadah (kind IBADAH, ibadahId + tanggal) atau event (kind EVENT, eventId). Ulasan anonim: jangan sebut nama pengulas.',
    excludeFields: ['jemaatId', 'reservasiId', 'participationId'],
    allowedInclude: [],
    keyFields: ['id', 'kind', 'ibadahId', 'tanggal', 'eventId', 'cabangId', 'rating', 'komentar', 'isAnonim', 'createdAt'],
  },
  feedback: {
    prismaKey: 'feedback',
    description: 'Masukan / laporan dari jemaat lewat app (tipe & kategori) + status penanganan.',
    excludeFields: ['appInfo'],
    allowedInclude: ['jemaat', 'cabang', 'replies'],
    keyFields: ['id', 'jemaatId', 'cabangId', 'tipe', 'kategori', 'status', 'lastActivityAt', 'createdAt'],
  },
  spiritual_journey_step: {
    prismaKey: 'spiritualJourneyStep',
    description: 'Tahapan Spiritual Journey (urutan) — tiap tahap terkait role/sub role yang menandai jemaat sudah melewatinya.',
    allowedInclude: ['role', 'subRole', 'subRoleStatus'],
    keyFields: ['id', 'judul', 'urutan', 'roleId', 'subRoleId', 'isActive'],
  },
  spiritual_journey_request: {
    prismaKey: 'spiritualJourneyRequest',
    description: 'Request update tahap Spiritual Journey dari app (jemaat pilih tahap + catatan; status PENDING/APPROVED/REJECTED/CANCELLED, disetujui admin di Portal).',
    allowedInclude: ['jemaat', 'step', 'reviewedBy'],
    keyFields: ['id', 'jemaatId', 'stepId', 'status', 'catatan', 'alasanTolak', 'reviewedAt', 'createdAt'],
  },
  jemaat_sertifikat: {
    prismaKey: 'jemaatSertifikat',
    description: 'Sertifikat milik jemaat (mis. baptis, kelas) yang diunggah.',
    excludeFields: ['fileUrl'],
    allowedInclude: ['jemaat'],
    keyFields: ['id', 'jemaatId', 'nama', 'tanggal', 'createdAt'],
  },
  onboarding_role_rule: {
    prismaKey: 'onboardingRoleRule',
    description: 'Onboarding Config: role yang otomatis diberikan saat jemaat menyelesaikan onboarding (jenis JEMAAT_TETAP / NEW_COMER / SEMUA, atau TANPA_ROLE untuk jemaat sudah onboarding tanpa role).',
    allowedInclude: ['role', 'subRole', 'subRoleStatus'],
    keyFields: ['id', 'jenis', 'roleId', 'subRoleId', 'urutan'],
  },
  jemaat_geocode: {
    prismaKey: 'jemaatGeocode',
    description:
      'Pemetaan alamat jemaat ke peta (Map View). status OK / NOT_FOUND (alamat tidak dikenali) / TERLALU_UMUM (hanya nama kota). presisi RUMAH/JALAN/KAWASAN. Lokasi = perkiraan dari alamat.',
    excludeFields: ['alamatHash', 'placeId'],
    allowedInclude: ['jemaat'],
    keyFields: ['jemaatId', 'status', 'presisi', 'latitude', 'longitude', 'provider', 'updatedAt'],
  },
  // ===== ECC Worship =====
  worship_album: {
    prismaKey: 'worshipAlbum',
    description: 'Album ECC Worship (tipe, tahun, terbit/tidak).',
    allowedInclude: ['songs'],
    keyFields: ['id', 'tipe', 'judul', 'tahun', 'isPublished'],
  },
  worship_song: {
    prismaKey: 'worshipSong',
    description: 'Lagu ECC Worship + jumlah putar vokal/karaoke.',
    excludeFields: ['lirikSinkron', 'audioFile', 'karaokeFile'],
    allowedInclude: ['album'],
    keyFields: ['id', 'albumId', 'judul', 'ciptaan', 'tahun', 'durasi', 'playsVokal', 'playsKaraoke', 'isPublished'],
  },
  // ===== System =====
  notification: {
    prismaKey: 'notification',
    description: 'In-app notification feed per jemaat (Modul 30). 16 types (kids checkin, redeem, family, dll).',
    allowedInclude: ['jemaat'],
    keyFields: ['id', 'jemaatId', 'type', 'title', 'readAt', 'createdAt'],
  },
  branch_change_request: {
    prismaKey: 'branchChangeRequest',
    description: 'Permohonan pindah cabang jemaat. Status PENDING/APPROVED/REJECTED.',
    allowedInclude: ['jemaat', 'currentCabang', 'targetCabang', 'reviewer'],
    keyFields: ['id', 'jemaatId', 'currentCabangId', 'targetCabangId', 'status', 'submittedAt', 'reviewedAt'],
  },
};

// ============================================================
// Helpers
// ============================================================

function stripExcluded<T extends Record<string, unknown>>(row: T, excludeFields?: string[]): T {
  if (!excludeFields || excludeFields.length === 0) return row;
  const clone = { ...row };
  for (const f of excludeFields) delete (clone as Record<string, unknown>)[f];
  return clone as T;
}

/**
 * Normalize noHp ke format E.164 Indonesia (+62...).
 * Support input format: "08...", "62...", "+62...", "8...".
 */
function normalizeNoHp(s: string): string {
  // Nomor lengkap (semua negara) → E.164. Potongan nomor untuk `contains`
  // (mis. "5678") tidak valid → dibiarkan apa adanya.
  return normalizePhoneNumber(s) ?? s.replace(/[\s\-()]/g, '');
}

/**
 * Walk filter object recursively, normalize semua value untuk field `noHp`
 * ke E.164 format. Handle string, contains operator, OR/AND arrays, nested
 * relation filters.
 *
 * Elsa user boleh tulis "0821...", "621821...", "+621821..." — backend auto
 * translate ke format DB (+62...) sebelum query.
 */
function normalizeFilter(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(normalizeFilter);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key === 'noHp') {
      if (typeof value === 'string') {
        result[key] = normalizeNoHp(value);
      } else if (value && typeof value === 'object') {
        // Prisma operator: { contains: "..." }, { equals: "..." }, { in: [...] }
        const nested: Record<string, unknown> = {};
        for (const [op, v] of Object.entries(value as Record<string, unknown>)) {
          if (typeof v === 'string') {
            nested[op] = normalizeNoHp(v);
          } else if (Array.isArray(v)) {
            nested[op] = v.map((x) => (typeof x === 'string' ? normalizeNoHp(x) : x));
          } else {
            nested[op] = v;
          }
        }
        result[key] = nested;
      } else {
        result[key] = value;
      }
    } else {
      result[key] = normalizeFilter(value);
    }
  }
  return result;
}

function buildIncludeObject(includeList: string[] | undefined, cfg: EntityConfig): Record<string, boolean> | undefined {
  if (!includeList || includeList.length === 0) return undefined;
  const obj: Record<string, boolean> = {};
  for (const rel of includeList) {
    if (!cfg.allowedInclude.includes(rel)) {
      throw new Error(
        `Relation "${rel}" not allowed for entity "${cfg.prismaKey}". Allowed: ${cfg.allowedInclude.join(', ')}`,
      );
    }
    obj[rel] = true;
  }
  return obj;
}

function getPrismaModel(entity: string): {
  cfg: EntityConfig;
  model: {
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
    count: (args: Record<string, unknown>) => Promise<number>;
    groupBy: (args: Record<string, unknown>) => Promise<unknown[]>;
  };
} {
  const cfg = ENTITY_MAP[entity];
  if (!cfg) {
    throw new Error(
      `Unknown entity "${entity}". Available: ${Object.keys(ENTITY_MAP).join(', ')}`,
    );
  }
  const model = (prisma as unknown as Record<string, unknown>)[cfg.prismaKey];
  if (!model) {
    throw new Error(`Prisma model "${cfg.prismaKey}" not found in client.`);
  }
  return { cfg, model: model as never };
}

// ============================================================
// Public API — dipakai router elsa.ts
// ============================================================

/** List semua entity available + brief description. */
export function listEntities(): {
  count: number;
  entities: Array<{ name: string; description: string; keyFields: string[] }>;
} {
  return {
    count: Object.keys(ENTITY_MAP).length,
    entities: Object.entries(ENTITY_MAP).map(([name, cfg]) => ({
      name,
      description: cfg.description,
      keyFields: cfg.keyFields,
    })),
  };
}

/** Deskripsi detail 1 entity — fields + relations + example. */
export function describeEntity(entity: string): {
  entity: string;
  description: string;
  keyFields: string[];
  allowedRelations: string[];
  excludedFields: string[];
  exampleQuery: string;
} {
  const cfg = ENTITY_MAP[entity];
  if (!cfg) throw new Error(`Unknown entity "${entity}". Call list_entities first.`);
  return {
    entity,
    description: cfg.description,
    keyFields: cfg.keyFields,
    allowedRelations: cfg.allowedInclude,
    excludedFields: cfg.excludeFields ?? [],
    exampleQuery: `query_entity({ entity: "${entity}", filter: { isActive: true }, limit: 10 })`,
  };
}

/**
 * Query entity dgn filter + include + orderBy + limit.
 * Guardrails: limit max 50, relation include whitelist, field exclude.
 */
export async function queryEntity(args: {
  entity: string;
  filter?: Record<string, unknown>;
  include?: string[];
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
}): Promise<{ entity: string; count: number; rows: unknown[] }> {
  const { cfg, model } = getPrismaModel(args.entity);
  const take = Math.min(Math.max(args.limit ?? 20, 1), 50);
  const include = buildIncludeObject(args.include, cfg);

  const rows = await model.findMany({
    ...(args.filter ? { where: normalizeFilter(args.filter) as Record<string, unknown> } : {}),
    ...(include ? { include } : {}),
    ...(args.orderBy ? { orderBy: args.orderBy } : {}),
    take,
  });

  const cleaned = rows.map((r) => stripExcluded(r as Record<string, unknown>, cfg.excludeFields));
  return { entity: args.entity, count: cleaned.length, rows: cleaned };
}

/** Count entity dgn optional filter. */
export async function countEntity(args: {
  entity: string;
  filter?: Record<string, unknown>;
}): Promise<{ entity: string; count: number }> {
  const { model } = getPrismaModel(args.entity);
  const count = await model.count({
    ...(args.filter ? { where: normalizeFilter(args.filter) as Record<string, unknown> } : {}),
  });
  return { entity: args.entity, count };
}

/**
 * GroupBy aggregate — mis. count jemaat per cabangId.
 * `by`: array field names untuk grouping.
 */
export async function groupByEntity(args: {
  entity: string;
  by: string[];
  filter?: Record<string, unknown>;
  limit?: number;
}): Promise<{
  entity: string;
  by: string[];
  count: number;
  groups: unknown[];
}> {
  const { model } = getPrismaModel(args.entity);
  const take = Math.min(Math.max(args.limit ?? 20, 1), 50);
  const groups = await model.groupBy({
    by: args.by as never,
    ...(args.filter ? { where: normalizeFilter(args.filter) as Record<string, unknown> } : {}),
    _count: true,
    take,
  });
  return { entity: args.entity, by: args.by, count: groups.length, groups };
}
