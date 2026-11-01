/**
 * Ringkasan audit log dalam bahasa sehari-hari (untuk pembaca non-IT).
 * Murni dari data entri (action, resource, before/after, metadata, UA) —
 * tanpa panggilan server. Data teknis (ID, hash, token) disembunyikan.
 */

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'ENROLL_FACE' | 'RESET_FACE' | 'UPLOAD_PHOTO';

export interface AuditLike {
  action: AuditAction;
  resource: string;
  resourceLabel: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  userDisplay: { namaLengkap: string } | null;
}

export interface AuditChange {
  label: string;
  from: string;
  to: string;
}

export interface AuditSummary {
  /** Kalimat utama, mis. "Budi mengubah data jemaat "Andi Wijaya"." */
  sentence: string;
  /** Penjelasan tambahan (cara, alasan, perangkat). */
  notes: string[];
  /** Daftar perubahan (UPDATE) atau isian (CREATE/DELETE). */
  changes: AuditChange[];
  changesTitle: string | null;
  /** Jumlah perubahan yang tidak ditampilkan (teknis / terlalu banyak). */
  hiddenCount: number;
}

// ------------------------------------------------------------------ kamus

const RESOURCE: Record<string, string> = {
  reservasi: 'reservasi / kehadiran ibadah',
  jemaat: 'data jemaat',
  event_participation: 'pendaftaran event',
  event: 'event',
  event_donation: 'pembayaran / donasi event',
  event_pelayanan: 'pelayanan event',
  event_pelayanan_petugas: 'petugas pelayanan event',
  local_business: 'usaha jemaat',
  jemaat_relasi: 'hubungan keluarga',
  jemaat_role: 'peran jemaat',
  jemaat_tamu: 'tamu jemaat',
  jemaat_sertifikat: 'sertifikat jemaat',
  jemaat_pelayanan: 'pelayanan jemaat',
  homecell: 'homecell',
  homecell_area: 'area homecell',
  homecell_member: 'anggota homecell',
  homecell_join_request: 'permintaan bergabung homecell',
  homecell_guest_request: 'permintaan bergabung homecell (tamu)',
  homecell_schedule: 'jadwal homecell',
  homecell_schedule_file: 'berkas jadwal homecell',
  homecell_attendance: 'kehadiran homecell',
  homecell_tamu: 'tamu homecell',
  homecell_tamu_attendance: 'kehadiran tamu homecell',
  group: 'grup',
  group_member: 'anggota grup',
  group_join_request: 'permintaan bergabung grup',
  group_file: 'berkas grup',
  visit: 'visit / kunjungan',
  hadiah_katalog: 'katalog hadiah',
  hadiah_redeem: 'penukaran hadiah',
  auth: 'akses masuk',
  user: 'akun pengguna',
  sinode: 'sinode',
  sinode_api_key: 'kunci API sinode',
  cabang_gereja: 'cabang gereja',
  cabang_rekening: 'rekening cabang',
  role: 'role',
  sub_role: 'sub role',
  sub_role_status: 'status sub role',
  sub_role_menu_access: 'akses menu sub role',
  role_menu_access: 'akses menu role',
  ibadah: 'ibadah',
  kategori_ibadah: 'kategori ibadah',
  ibadah_pelayanan: 'pelayanan ibadah',
  ibadah_pelayanan_petugas: 'petugas pelayanan ibadah',
  ibadah_occurrence_status: 'status pertemuan ibadah',
  tipe_relasi_keluarga: 'jenis hubungan keluarga',
  pelayanan: 'pelayanan / ministry',
  pelayanan_role: 'peran pelayanan',
  pelayanan_schedule: 'jadwal pelayanan',
  pelayanan_join_request: 'permintaan bergabung pelayanan',
  spiritual_journey_step: 'tahap perjalanan rohani',
  worship_song: 'lagu pujian',
  worship_album: 'album pujian',
  worship_sync_job: 'sinkronisasi lagu pujian',
  wa_notification_config: 'pengaturan notifikasi WhatsApp',
  notification_log: 'log notifikasi',
  processing_activity: 'aktivitas pemrosesan data',
  legal_document: 'dokumen legal',
  user_consent: 'persetujuan pengguna',
  it_minister_team: 'tim IT minister',
  db_backup: 'backup database',
  backup_email_config: 'pengaturan email backup',
  credential: 'kredensial / kata sandi tersimpan',
  credential_unlock: 'buka kredensial',
  monitor_unlock: 'buka monitor',
  app_version: 'versi aplikasi',
  feedback: 'masukan jemaat',
  branch_change_request: 'permintaan pindah cabang',
  backlog_epic: 'backlog (epic)',
  backlog_story: 'backlog (story)',
  backlog_task: 'backlog (tugas)',
  backlog_sprint: 'sprint backlog',
  backlog_comment: 'komentar backlog',
  website_section: 'bagian website',
  web_action_token: 'tautan aksi web',
  tamu_status: 'status tamu',
  shiftsoft_sync_preview: 'pratinjau sinkronisasi Shiftsoft',
  shiftsoft_sync_job: 'sinkronisasi Shiftsoft',
  shiftsoft_sync_commit: 'penerapan sinkronisasi Shiftsoft',
};

const VERB: Record<AuditAction, string> = {
  CREATE: 'menambahkan',
  UPDATE: 'mengubah',
  DELETE: 'menghapus',
  LOGIN: 'masuk',
  LOGOUT: 'keluar',
  ENROLL_FACE: 'mendaftarkan wajah',
  RESET_FACE: 'mengatur ulang data wajah',
  UPLOAD_PHOTO: 'mengunggah foto',
};

const FIELD: Record<string, string> = {
  nama: 'Nama',
  namaLengkap: 'Nama lengkap',
  namaPanggilan: 'Nama panggilan',
  judul: 'Judul',
  deskripsi: 'Deskripsi',
  keterangan: 'Keterangan',
  catatan: 'Catatan',
  noHp: 'No HP',
  email: 'Email',
  alamat: 'Alamat',
  kota: 'Kota',
  tanggalLahir: 'Tanggal lahir',
  tempatLahir: 'Tempat lahir',
  jenisKelamin: 'Jenis kelamin',
  statusPernikahan: 'Status pernikahan',
  pekerjaan: 'Pekerjaan',
  golonganDarah: 'Golongan darah',
  isActive: 'Aktif',
  isTamu: 'Tamu',
  isPublic: 'Tampil untuk umum',
  isFulltimer: 'Fulltimer',
  status: 'Status',
  role: 'Peran',
  roleId: 'Role',
  subRoleId: 'Sub role',
  cabangId: 'Cabang',
  cabangGerejaId: 'Cabang',
  homecellId: 'Homecell',
  areaId: 'Area',
  picJemaatId: 'PIC',
  jemaatId: 'Jemaat',
  ibadahId: 'Ibadah',
  eventId: 'Event',
  groupId: 'Grup',
  groupNama: 'Nama grup',
  tanggal: 'Tanggal',
  tanggalIbadah: 'Tanggal ibadah',
  tanggalMulai: 'Tanggal mulai',
  tanggalSelesai: 'Tanggal selesai',
  jamMulai: 'Jam mulai',
  jamSelesai: 'Jam selesai',
  hari: 'Hari',
  tipeJadwal: 'Pola jadwal',
  lokasi: 'Lokasi',
  latitude: 'Titik lokasi (lintang)',
  longitude: 'Titik lokasi (bujur)',
  kapasitas: 'Kapasitas',
  kuota: 'Kuota',
  harga: 'Harga',
  nominal: 'Nominal',
  tipeBayar: 'Jenis pembayaran',
  kategori: 'Kategori',
  tamuKategori: 'Kategori tamu',
  usiaMin: 'Usia minimal',
  usiaMax: 'Usia maksimal',
  fotoUrl: 'Foto',
  posterUrl: 'Poster',
  url: 'Tautan',
  link: 'Tautan',
  versi: 'Versi',
  version: 'Versi',
  message: 'Pesan',
  pesan: 'Pesan',
  reason: 'Alasan',
  alasan: 'Alasan',
  method: 'Cara',
  via: 'Melalui',
  kind: 'Jenis tindakan',
  checkinMethod: 'Cara check-in',
  joinedAt: 'Waktu hadir',
  attendedAt: 'Waktu hadir',
  allowSelfCheckin: 'Boleh self check-in',
  butuhKehadiran: 'Mencatat kehadiran',
  selfCheckinRadiusM: 'Radius self check-in (m)',
  size: 'Ukuran berkas',
  sizeBytes: 'Ukuran berkas',
  durasi: 'Durasi',
  file: 'Berkas',
  kode: 'Kode',
  roleTitle: 'Jabatan',
  divisi: 'Divisi',
  jemaatIds: 'Jumlah jemaat',
  autoReciprocal: 'Hubungan balik otomatis',
};

const VALUE: Record<string, string> = {
  // cara / jenis tindakan (metadata)
  'self-checkin': 'self check-in dari aplikasi',
  'self-reserve': 'reservasi sendiri dari aplikasi',
  'self-reserve-cancel': 'membatalkan reservasi dari aplikasi',
  download: 'unduh',
  pic_direct_add: 'ditambahkan langsung oleh PIC',
  pic_remove: 'dikeluarkan oleh PIC',
  self_leave: 'keluar sendiri',
  'by-kode': 'lewat kode jemaat',
  'homecell-add-by-kode': 'ditambahkan lewat kode jemaat',
  'homecell-member-soft-remove': 'dikeluarkan dari homecell',
  'credential-unlock-failed': 'gagal membuka kredensial',
  'credential-unlock-success': 'berhasil membuka kredensial',
  'credential-create': 'membuat kredensial',
  'credential-delete': 'menghapus kredensial',
  'it-minister-assign': 'menugaskan IT minister',
  'it-minister-update': 'mengubah IT minister',
  'it-minister-delete': 'menghapus IT minister',
  'cabang-rekening-qris': 'mengunggah QRIS rekening',
  // status umum
  RESERVE: 'Terdaftar (reservasi)',
  JOIN: 'Hadir',
  CANCEL: 'Dibatalkan',
  HADIR: 'Hadir',
  BAYAR: 'Sudah bayar',
  PENDING: 'Menunggu',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  ACTIVE: 'Aktif',
  INACTIVE: 'Nonaktif',
  SELF: 'self check-in',
  SCAN: 'scan QR oleh usher',
  MANUAL: 'manual oleh petugas',
  FACE: 'pengenalan wajah',
  L: 'Laki-laki',
  P: 'Perempuan',
  LAKI_LAKI: 'Laki-laki',
  PEREMPUAN: 'Perempuan',
  SINGLE: 'Single',
  COUPLE: 'Couple',
  VISITOR: 'Visitor saja',
  NEW_COMER: 'New Comer',
  GRATIS: 'Gratis',
  BERBAYAR: 'Berbayar',
  WEEKLY: 'Setiap minggu',
  BIWEEKLY: 'Dua minggu sekali',
  MONTHLY: 'Setiap bulan',
  ONCE: 'Sekali',
};

/** Kolom teknis yang tidak berarti bagi pembaca umum. */
const HIDDEN = /^(id|createdAt|updatedAt|deletedAt|version|tokenHash|.*Hash|.*hash|password.*|.*[Tt]oken.*|.*Secret.*|.*secret.*|faceEmbedding|faceModelVersion|_count|kodeHash)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ISO_D = /^\d{4}-\d{2}-\d{2}$/;

function fieldLabel(key: string): string {
  if (FIELD[key]) return FIELD[key];
  // camelCase / snake_case → "Kata kata"
  const words = key
    .replace(/Id$/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function fmtDate(iso: string, withTime: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    ...(withTime ? {} : { timeZone: 'UTC' }),
  });
}

function fmtValue(v: unknown, key = ''): string {
  if (v === null || v === undefined || v === '') return '(kosong)';
  if (typeof v === 'boolean') return v ? 'Ya' : 'Tidak';
  if (typeof v === 'number') {
    if (/size|bytes/i.test(key)) return v >= 1_048_576 ? `${(v / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(v / 1024))} KB`;
    if (/harga|nominal|amount|jumlahBayar/i.test(key)) return `Rp ${v.toLocaleString('id-ID')}`;
    return v.toLocaleString('id-ID');
  }
  if (typeof v === 'string') {
    if (UUID.test(v)) return '(data terkait)';
    if (ISO_D.test(v)) return fmtDate(`${v}T00:00:00Z`, false);
    if (ISO_DT.test(v)) {
      // Tanggal murni tersimpan sebagai tengah malam UTC → tampilkan tanpa jam.
      return /T00:00:00(\.000)?Z$/.test(v) ? fmtDate(v, false) : fmtDate(v, true);
    }
    if (VALUE[v]) return VALUE[v];
    return v.length > 140 ? `${v.slice(0, 140)}…` : v;
  }
  if (Array.isArray(v)) {
    if (/Ids$/.test(key)) return `${v.length} orang/data`;
    if (v.every((x) => typeof x === 'string' && !UUID.test(x))) return v.length ? v.join(', ') : '(kosong)';
    return `${v.length} item`;
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const name = o.namaLengkap ?? o.nama ?? o.judul;
    return typeof name === 'string' ? name : '(data terkait)';
  }
  return String(v);
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// ------------------------------------------------------------------ perangkat

export function describeDevice(ua: string | null | undefined): string | null {
  if (!ua) return null;
  if (/okhttp|Dart|Expo|ElsApp|CFNetwork|Darwin/i.test(ua)) {
    const os = /Android/i.test(ua) || /okhttp/i.test(ua) ? 'Android' : /iPhone|iOS|CFNetwork|Darwin/i.test(ua) ? 'iPhone' : null;
    return `aplikasi Els App${os ? ` (${os})` : ''}`;
  }
  const os = /Windows/i.test(ua)
    ? 'Windows'
    : /Android/i.test(ua)
      ? 'Android'
      : /iPhone|iPad/i.test(ua)
        ? 'iPhone/iPad'
        : /Mac OS X|Macintosh/i.test(ua)
          ? 'Mac'
          : /Linux/i.test(ua)
            ? 'Linux'
            : null;
  const br = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  if (!os && !br) return null;
  return `${br ? `browser ${br}` : 'browser'}${os ? ` di ${os}` : ''}`;
}

// ------------------------------------------------------------------ ringkasan

const MAX_ROWS = 15;

export function summarizeAudit(e: AuditLike): AuditSummary {
  const who = e.userDisplay?.namaLengkap ?? 'Sistem';
  const what = RESOURCE[e.resource] ?? e.resource.replace(/_/g, ' ');
  const target = e.resourceLabel ? ` "${e.resourceLabel}"` : '';
  const notes: string[] = [];
  const device = describeDevice(e.userAgent);

  let sentence: string;
  switch (e.action) {
    case 'LOGIN':
      sentence = `${who} masuk${device ? ` lewat ${device}` : ''}.`;
      break;
    case 'LOGOUT':
      sentence = `${who} keluar dari akunnya${device ? ` (${device})` : ''}.`;
      break;
    case 'ENROLL_FACE':
    case 'RESET_FACE':
      sentence = `${who} ${VERB[e.action]} untuk${target || ' jemaat'}.`;
      break;
    case 'UPLOAD_PHOTO':
      sentence = `${who} mengunggah foto untuk ${what}${target}.`;
      break;
    default:
      sentence = `${who} ${VERB[e.action] ?? 'mengubah'} ${what}${target}.`;
  }

  // Metadata → catatan (cara, alasan, jumlah orang, dll.)
  const meta = isObj(e.metadata) ? e.metadata : {};
  for (const [k, v] of Object.entries(meta)) {
    if (HIDDEN.test(k) || v === null || v === undefined || v === '') continue;
    if (typeof v === 'string' && UUID.test(v)) continue;
    if (/Id$/.test(k)) continue;
    if (k === 'kind' || k === 'method' || k === 'via') {
      notes.push(`Cara: ${fmtValue(v, k)}.`);
      continue;
    }
    if (k === 'reason' || k === 'alasan') {
      notes.push(`Alasan: ${fmtValue(v, k)}.`);
      continue;
    }
    if (Array.isArray(v) && /Ids$/.test(k)) {
      notes.push(`Melibatkan ${v.length} jemaat.`);
      continue;
    }
    if (isObj(v)) continue;
    notes.push(`${fieldLabel(k)}: ${fmtValue(v, k)}.`);
  }
  if (e.action !== 'LOGIN' && e.action !== 'LOGOUT' && device) notes.push(`Dilakukan dari ${device}.`);

  // Perubahan / isian
  const before = isObj(e.before) ? e.before : null;
  const after = isObj(e.after) ? e.after : null;
  const changes: AuditChange[] = [];
  let hidden = 0;
  let changesTitle: string | null = null;

  if (before && after) {
    changesTitle = 'Yang diubah';
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    for (const k of keys) {
      if (!(k in after)) continue; // kolom yang tidak dikirim saat ubah = tidak berubah
      if (same(before[k], after[k])) continue;
      if (HIDDEN.test(k) || isObj(after[k]) || isObj(before[k])) {
        hidden++;
        continue;
      }
      const from = fmtValue(before[k], k);
      const to = fmtValue(after[k], k);
      if (from === to) {
        // mis. dua ID berbeda → "(data terkait)" → tetap informatif sebagai "diganti"
        changes.push({ label: fieldLabel(k), from: '—', to: 'diganti' });
        continue;
      }
      changes.push({ label: fieldLabel(k), from, to });
    }
    if (changes.length === 0 && hidden === 0) notes.push('Tidak ada isian yang benar-benar berubah (disimpan ulang tanpa perubahan).');
  } else if (after || before) {
    const src = (after ?? before)!;
    changesTitle = after ? (e.action === 'CREATE' ? 'Data yang ditambahkan' : 'Data sesudah') : 'Data yang dihapus';
    for (const [k, v] of Object.entries(src)) {
      if (HIDDEN.test(k) || isObj(v) || v === null || v === undefined || v === '') {
        if (HIDDEN.test(k) || isObj(v)) hidden++;
        continue;
      }
      if (typeof v === 'string' && UUID.test(v)) {
        hidden++;
        continue;
      }
      const val = fmtValue(v, k);
      changes.push(after ? { label: fieldLabel(k), from: '', to: val } : { label: fieldLabel(k), from: val, to: '' });
    }
  }

  if (changes.length > MAX_ROWS) {
    hidden += changes.length - MAX_ROWS;
    changes.length = MAX_ROWS;
  }

  if (e.action === 'UPDATE' && changes.length) {
    sentence = sentence.replace(/\.$/, '') + ` — ${changes.length} isian berubah.`;
  }

  return { sentence, notes, changes, changesTitle, hiddenCount: hidden };
}
