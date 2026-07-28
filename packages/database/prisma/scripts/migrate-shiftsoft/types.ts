/**
 * Type Shiftsoft legacy API response shape.
 *
 * Kita hanya declare field yang benar-benar kita consume — response asli
 * punya 73+ field, mayoritas irrelevant (gamification, sales, MLM,
 * subscription, dll). Field yang di-skip listed di bottom untuk audit.
 */

/**
 * Custom fields per-tenant (defined via UserSpecialDef di Shiftsoft admin).
 * Untuk ECC tenants, field-nya sama across cabang (baptism, family, dll).
 *
 * Values selalu string. Empty string = tidak diisi. Untuk date field, format
 * "YYYY-MM-DD". Untuk boolean, "Ya" / "Tidak" / "" (empty).
 */
export interface ShiftsoftSpecialAttrs {
  Alamat_Sekolah_Tempat_Bekerja?: string;
  'Alamat_Sekolah/Tempat_Bekerja'?: string;
  Berjemaat_di_ECC_sejak?: string;
  Jenis_Kelamin_Anak_Pertama?: string;
  Jenis_Kelamin_Anak_Kedua?: string;
  Jenis_Kelamin_Anak_Ketiga?: string;
  Jenis_Kelamin_Anak_Keempat?: string;
  Nama_Anak_Pertama?: string;
  Nama_Anak_Kedua?: string;
  Nama_Anak_Ketiga?: string;
  Nama_Anak_Keempat?: string;
  Tahun_Lahir_Anak_Pertama?: string;
  Tahun_Lahir_Anak_Kedua?: string;
  Tahun_Lahir_Anak_Ketiga?: string;
  Tahun_Lahir_Anak_Keempat?: string;
  Nama_Home_Leader?: string;
  Nama_Homecell?: string;
  Nama_Zone_Leader?: string;
  Nama_Lengkap_Ayah?: string;
  Nama_Lengkap_Ibu?: string;
  Nama_Lengkap_Pasangan?: string;
  Nama_Lengkap_Bapa_Rohani?: string;
  'Nama_Sekolah/Tempat_Bekerja'?: string;
  Nama_Sekolah_Tempat_Bekerja?: string;
  Pendidikan_Terakhir?: string;
  Spiritual_Journey_Terakhir?: string;
  /** Kode marital status: 'S' (Single), 'M' (Menikah), 'D' (Duda), 'J' (Janda) */
  Status?: string;
  Status_Pekerjaan?: string;
  Sudah_Baptis_Air?: string;
  Sudah_Baptis_Roh_Kudus?: string;
  Tanggal_Lahir_Ayah?: string;
  Tanggal_Lahir_Ibu?: string;
  Tanggal_Pernikahan?: string;
  [key: string]: string | undefined;
}

/**
 * Response `/user/list` — array of LegacyUser.
 */
export interface ShiftsoftUserListResponse {
  data: LegacyUser[];
  /** Meta info — pagination, total, dll. Belum tau exact shape. */
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Shape user dari Shiftsoft. Field yang di-skip listed di bottom.
 */
export interface LegacyUser {
  /** Legacy primary key — dipakai untuk idempotent match ke Jemaat.legacyShiftsoftId */
  ID: number;
  Name: string;
  Email?: string | null;
  /** Nomor HP — format campuran (kadang tanpa country code). Normalize saat map. */
  Phone1?: string | null;
  /** 0=unknown, 1=laki-laki, 2=perempuan (kemungkinan besar berdasarkan sample) */
  Gender?: number;
  /** ISO datetime "2023-03-28T00:00:00+07:00". Skip kalau "0001-01-01" (Go zero value). */
  Birthday?: string;
  Address?: string;
  City?: string;
  Nickname?: string;
  /** Field bebas custom per-tenant */
  SpecialAttrs?: ShiftsoftSpecialAttrs;
  /**
   * Circles = ownership/membership user di Circle (Shiftsoft istilah untuk
   * homecell/group). Shape belum ke-confirm — treat as unknown, log saat first run.
   */
  Circles?: unknown;
  CircleIDs?: number[];
  CircleRoles?: unknown;
  /** Company ID di Shiftsoft (bisa beda dari admin tenant). */
  CompanyID?: number;
  RoleID?: number;
  /**
   * Status account — belum ke-decode enum. Kemungkinan:
   *   0 = pending, 1 = active, 2 = verified/admin
   */
  Status?: number;
  /** Guest flag — true = belum jadi member resmi */
  IsGuest?: boolean;

  // ---- Fields yg SENGAJA di-skip (irrelevant untuk ECC) ----
  // Point, PointAppreciation, Balance          → gamification
  // Rank, RankID, RankPoints, EXP              → gamification
  // GamificationLevel, GamificationLevelID
  // IndividualTarget, SalesPlanStreak          → sales/MLM
  // Referral, ReferralID, ReferralChild, IsCommission → MLM
  // TargetCompanyPackagePrice                  → billing
  // Age, AttdPercentage, AttendAt              → derived analytics
  // LastAttendance, LastPurchase, LastSeen     → activity tracking
  // Notifications, Subscriptions, Transactions → nested collections (skip)
  // Events, Gallery, SchoolReports, Skills     → extra data
  // FosterChild, FosterParent, IsFosterChild   → foster (skip untuk sekarang)
  // OneSignalPlayerId, DeviceInformation       → push notif (skip, ECC punya sendiri)
  // Password, LoginVerificationCode            → auth (skip — jangan import hash)
  // NeedCompleteProfile, LastChangePassword    → auth state
  // WhatsappVerificationStatus                 → WA verification (skip, ECC punya sendiri)
  // IDEncrypt, CreatedBy, UpdatedBy, DeletedAt → audit + soft delete
  // Approval, SpecialAttendant, Level, LevelID → misc
  // ExpiredAt, IsExpired                       → subscription
  // Supervisor                                 → MLM upline
  // Role.Company.*                             → nested tenant metadata
}
