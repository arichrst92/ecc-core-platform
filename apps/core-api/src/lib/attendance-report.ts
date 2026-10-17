/**
 * Agregasi laporan kehadiran (ibadah & event) — fungsi murni (tanpa DB)
 * supaya mudah di-test. Route `routes/admin/report.ts` yang mengambil data.
 */

export const CHECKIN_METHODS = ['SCAN', 'SELF', 'WALK_IN', 'MANUAL', 'UNKNOWN'] as const;
export type CheckinMethod = (typeof CHECKIN_METHODS)[number];

export const METHOD_LABEL: Record<CheckinMethod, string> = {
  SCAN: 'Scan usher',
  SELF: 'Self check-in',
  WALK_IN: 'Walk-in (tamu)',
  MANUAL: 'Manual admin',
  UNKNOWN: 'Tidak tercatat',
};

export type MethodCount = Record<CheckinMethod, number>;
export const emptyMethods = (): MethodCount => ({ SCAN: 0, SELF: 0, WALK_IN: 0, MANUAL: 0, UNKNOWN: 0 });

export function normMethod(m: string | null | undefined): CheckinMethod {
  return (CHECKIN_METHODS as readonly string[]).includes(m ?? '') ? (m as CheckinMethod) : 'UNKNOWN';
}

/** Tamu = data tamu (isTamu) atau datang sebagai tamu (guestSource terisi). */
export const isGuestRow = (r: { guestSource: string | null; jemaat: { isTamu: boolean } }) =>
  r.jemaat.isTamu || !!r.guestSource;

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Senin (YYYY-MM-DD) dari minggu tanggal kalender `d` (UTC midnight). */
export function weekStart(d: Date): string {
  const dow = (d.getUTCDay() + 6) % 7;
  return ymd(new Date(d.getTime() - dow * 86_400_000));
}

// ============================================================
// Ibadah
// ============================================================

export interface IbadahAttendanceRow {
  ibadahId: string;
  tanggalIbadah: Date;
  checkinMethod: string | null;
  guestSource: string | null;
  invitedByJemaatId: string | null;
  jemaat: { id: string; namaLengkap: string; noHp: string | null; isTamu: boolean };
}

export interface OccurrenceKey {
  ibadahId: string;
  tanggal: string; // YYYY-MM-DD
}

export interface IbadahReport {
  summary: {
    totalHadir: number;
    jemaatHadir: number; // kehadiran jemaat (bukan unik)
    tamuHadir: number;
    uniqueJemaat: number;
    uniqueTamu: number;
    tamuBaru: number; // tamu unik yang kunjungan pertamanya ada di periode ini
    pertemuan: number; // pertemuan terjadwal di periode (s.d. hari ini)
    pertemuanAdaKehadiran: number;
    rataRata: number; // rata-rata hadir per pertemuan yang ada kehadirannya
    methods: MethodCount;
  };
  trend: { week: string; jemaat: number; tamu: number }[];
  occurrences: {
    ibadahId: string;
    tanggal: string;
    total: number;
    jemaat: number;
    tamu: number;
    tamuBaru: number;
    methods: MethodCount;
  }[];
  guests: {
    id: string;
    namaLengkap: string;
    noHp: string | null;
    kunjungan: number; // di periode
    kunjunganPertama: string | null; // sepanjang waktu
    kunjunganTerakhir: string; // di periode
    isBaru: boolean;
    ibadahIds: string[];
    inviterIds: string[];
    walkIn: boolean;
  }[];
}

/**
 * @param scheduled  pertemuan terjadwal di periode (sudah dibuang yang dibatalkan & yang di masa depan)
 * @param rows       kehadiran (status JOIN) di periode
 * @param firstVisit kunjungan pertama sepanjang waktu per tamu (jemaatId → Date)
 * @param from       awal periode (untuk menentukan tamu baru)
 */
export function buildIbadahReport(
  scheduled: OccurrenceKey[],
  rows: IbadahAttendanceRow[],
  firstVisit: Map<string, Date>,
  from: Date,
): IbadahReport {
  const key = (ibadahId: string, tanggal: string) => `${ibadahId}|${tanggal}`;
  const occ = new Map<string, IbadahReport['occurrences'][number]>();
  for (const s of scheduled) {
    occ.set(key(s.ibadahId, s.tanggal), { ...s, total: 0, jemaat: 0, tamu: 0, tamuBaru: 0, methods: emptyMethods() });
  }
  const methods = emptyMethods();
  const trend = new Map<string, { jemaat: number; tamu: number }>();
  const uniqueJemaat = new Set<string>();
  const guests = new Map<string, IbadahReport['guests'][number]>();
  let jemaatHadir = 0;
  let tamuHadir = 0;

  const isNew = (jemaatId: string) => {
    const f = firstVisit.get(jemaatId);
    return !f || f.getTime() >= from.getTime();
  };

  // Urut tanggal supaya "kunjungan pertama" tamu dihitung di pertemuan yang benar.
  const sorted = [...rows].sort((a, b) => a.tanggalIbadah.getTime() - b.tanggalIbadah.getTime());
  for (const r of sorted) {
    const tanggal = ymd(r.tanggalIbadah);
    const k = key(r.ibadahId, tanggal);
    let o = occ.get(k);
    if (!o) {
      // Kehadiran di tanggal yang tidak ada di jadwal (mis. jadwal diubah) tetap dihitung.
      o = { ibadahId: r.ibadahId, tanggal, total: 0, jemaat: 0, tamu: 0, tamuBaru: 0, methods: emptyMethods() };
      occ.set(k, o);
    }
    const m = normMethod(r.checkinMethod);
    const guest = isGuestRow(r);
    o.total++;
    o.methods[m]++;
    methods[m]++;
    const w = weekStart(r.tanggalIbadah);
    const t = trend.get(w) ?? { jemaat: 0, tamu: 0 };
    if (guest) {
      o.tamu++;
      tamuHadir++;
      t.tamu++;
      const baru = isNew(r.jemaat.id);
      const g = guests.get(r.jemaat.id) ?? {
        id: r.jemaat.id,
        namaLengkap: r.jemaat.namaLengkap,
        noHp: r.jemaat.noHp,
        kunjungan: 0,
        kunjunganPertama: firstVisit.get(r.jemaat.id) ? ymd(firstVisit.get(r.jemaat.id)!) : tanggal,
        kunjunganTerakhir: tanggal,
        isBaru: baru,
        ibadahIds: [],
        inviterIds: [],
        walkIn: false,
      };
      // Tamu baru dihitung di pertemuan kunjungan pertamanya saja.
      if (baru && g.kunjunganPertama === tanggal && g.kunjungan === 0) o.tamuBaru++;
      g.kunjungan++;
      if (tanggal > g.kunjunganTerakhir) g.kunjunganTerakhir = tanggal;
      if (!g.ibadahIds.includes(r.ibadahId)) g.ibadahIds.push(r.ibadahId);
      if (r.invitedByJemaatId && !g.inviterIds.includes(r.invitedByJemaatId)) g.inviterIds.push(r.invitedByJemaatId);
      if (r.guestSource === 'WALK_IN') g.walkIn = true;
      guests.set(r.jemaat.id, g);
    } else {
      o.jemaat++;
      jemaatHadir++;
      t.jemaat++;
      uniqueJemaat.add(r.jemaat.id);
    }
    trend.set(w, t);
  }

  const occurrences = [...occ.values()].sort((a, b) => b.tanggal.localeCompare(a.tanggal) || a.ibadahId.localeCompare(b.ibadahId));
  const held = occurrences.filter((o) => o.total > 0).length;
  const total = jemaatHadir + tamuHadir;
  const guestList = [...guests.values()].sort(
    (a, b) => Number(b.isBaru) - Number(a.isBaru) || b.kunjunganTerakhir.localeCompare(a.kunjunganTerakhir),
  );
  return {
    summary: {
      totalHadir: total,
      jemaatHadir,
      tamuHadir,
      uniqueJemaat: uniqueJemaat.size,
      uniqueTamu: guests.size,
      tamuBaru: guestList.filter((g) => g.isBaru).length,
      pertemuan: occurrences.length,
      pertemuanAdaKehadiran: held,
      rataRata: held ? Math.round((total / held) * 10) / 10 : 0,
      methods,
    },
    trend: [...trend.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, v]) => ({ week, ...v })),
    occurrences,
    guests: guestList,
  };
}

// ============================================================
// Event
// ============================================================

export interface EventParticipationRow {
  eventId: string;
  status: string; // DAFTAR | MENUNGGU_VERIFIKASI | BAYAR | HADIR | BATAL
  checkinMethod: string | null;
  guestSource: string | null;
  invitedByJemaatId: string | null;
  jemaat: { id: string; namaLengkap: string; noHp: string | null; isTamu: boolean };
}

export interface EventReportRow {
  eventId: string;
  terdaftar: number; // non-BATAL
  batal: number;
  hadir: number;
  persenHadir: number | null;
  tamuTerdaftar: number;
  tamuHadir: number;
  methods: MethodCount;
}

export function buildEventReport(eventIds: string[], rows: EventParticipationRow[]) {
  const per = new Map<string, EventReportRow>();
  for (const id of eventIds) {
    per.set(id, { eventId: id, terdaftar: 0, batal: 0, hadir: 0, persenHadir: null, tamuTerdaftar: 0, tamuHadir: 0, methods: emptyMethods() });
  }
  const methods = emptyMethods();
  const guests: {
    eventId: string;
    id: string;
    namaLengkap: string;
    noHp: string | null;
    status: string;
    inviterId: string | null;
    walkIn: boolean;
  }[] = [];
  for (const r of rows) {
    const e = per.get(r.eventId);
    if (!e) continue;
    if (r.status === 'BATAL') {
      e.batal++;
      continue;
    }
    const guest = isGuestRow(r);
    e.terdaftar++;
    if (guest) e.tamuTerdaftar++;
    if (r.status === 'HADIR') {
      const m = normMethod(r.checkinMethod);
      e.hadir++;
      e.methods[m]++;
      methods[m]++;
      if (guest) e.tamuHadir++;
    }
    if (guest) {
      guests.push({
        eventId: r.eventId,
        id: r.jemaat.id,
        namaLengkap: r.jemaat.namaLengkap,
        noHp: r.jemaat.noHp,
        status: r.status,
        inviterId: r.invitedByJemaatId,
        walkIn: r.guestSource === 'WALK_IN',
      });
    }
  }
  const events = [...per.values()].map((e) => ({
    ...e,
    persenHadir: e.terdaftar ? Math.round((e.hadir / e.terdaftar) * 100) : null,
  }));
  const sum = (f: (e: EventReportRow) => number) => events.reduce((n, e) => n + f(e), 0);
  const terdaftar = sum((e) => e.terdaftar);
  const hadir = sum((e) => e.hadir);
  return {
    summary: {
      event: events.length,
      terdaftar,
      hadir,
      batal: sum((e) => e.batal),
      persenHadir: terdaftar ? Math.round((hadir / terdaftar) * 100) : null,
      tamuTerdaftar: sum((e) => e.tamuTerdaftar),
      tamuHadir: sum((e) => e.tamuHadir),
      tamuUnik: new Set(guests.map((g) => g.id)).size,
      methods,
    },
    events,
    guests,
  };
}

// ============================================================
// Okupansi seat (ibadah) — hanya pendataan, tidak membatasi check-in
// ============================================================

/** % okupansi (1 desimal). null kalau seat tidak diisi. Bisa > 100 (overflow). */
export function occupancyPct(hadir: number, seat: number | null | undefined): number | null {
  if (!seat || seat <= 0) return null;
  return Math.round((hadir / seat) * 1000) / 10;
}

export interface IbadahOccupancy {
  ibadahId: string;
  seat: number | null;
  pertemuan: number; // pertemuan yang ada kehadirannya
  rataHadir: number;
  rataOkupansi: number | null; // %
  puncakHadir: number;
  puncakOkupansi: number | null; // %
  melebihi: number; // jumlah pertemuan dengan hadir > seat
}

/**
 * Ringkasan okupansi per ibadah + keseluruhan. Pertemuan tanpa kehadiran
 * (belum ada data) tidak dihitung supaya rata-rata tidak turun palsu.
 */
export function buildOccupancy(
  occurrences: { ibadahId: string; total: number }[],
  seatById: Map<string, number | null>,
): { perIbadah: IbadahOccupancy[]; overall: { rataOkupansi: number | null; melebihi: number; pertemuanDenganSeat: number } } {
  const agg = new Map<string, { n: number; sum: number; max: number; over: number }>();
  for (const o of occurrences) {
    if (o.total <= 0) continue;
    const a = agg.get(o.ibadahId) ?? { n: 0, sum: 0, max: 0, over: 0 };
    a.n++;
    a.sum += o.total;
    a.max = Math.max(a.max, o.total);
    const seat = seatById.get(o.ibadahId);
    if (seat && o.total > seat) a.over++;
    agg.set(o.ibadahId, a);
  }
  let seatSum = 0;
  let hadirSum = 0;
  let over = 0;
  let withSeat = 0;
  const perIbadah = [...agg.entries()].map(([ibadahId, a]) => {
    const seat = seatById.get(ibadahId) ?? null;
    const rataHadir = Math.round((a.sum / a.n) * 10) / 10;
    if (seat) {
      seatSum += seat * a.n;
      hadirSum += a.sum;
      over += a.over;
      withSeat += a.n;
    }
    return {
      ibadahId,
      seat,
      pertemuan: a.n,
      rataHadir,
      rataOkupansi: occupancyPct(a.sum / a.n, seat),
      puncakHadir: a.max,
      puncakOkupansi: occupancyPct(a.max, seat),
      melebihi: a.over,
    };
  });
  perIbadah.sort((x, y) => (y.rataOkupansi ?? -1) - (x.rataOkupansi ?? -1));
  return {
    perIbadah,
    overall: {
      rataOkupansi: seatSum ? Math.round((hadirSum / seatSum) * 1000) / 10 : null,
      melebihi: over,
      pertemuanDenganSeat: withSeat,
    },
  };
}
