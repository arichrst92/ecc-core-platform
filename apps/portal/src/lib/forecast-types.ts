/** Bentuk data GET /admin/forecast (core-api lib/forecast.ts). */
export type Plat = 'android' | 'ios' | 'web' | 'lainnya';

export interface ForecastSettings {
  trendMinMonths: number;
  seasonMinMonths: number;
  cabangMinMonths: number;
  cabangMinActive: number;
  platformMinMonths: number;
  tamuMinMonths: number;
  occMinMeetings: number;
  homecellMinMonths: number;
  eventMinEvents: number;
  homecellIdeal: number;
  homecellMax: number;
  belowMin: 'label' | 'hide';
}

export interface ForecastData {
  generatedAt: string;
  cabangId: string | null;
  horizon: number;
  settings: ForecastSettings;
  maturity: {
    dataMonths: number;
    trendMin: number;
    seasonMin: number;
    early: boolean;
    akuratMulai: string | null;
    lengkapMulai: string | null;
    liveSince: string | null;
    riwayatSampai: string | null;
    /** Bulan pertama yang dipakai model (sebelumnya = riwayat kurang lengkap, hanya ditampilkan). */
    modelMulai: string | null;
  };
  hidePrediction: boolean;
  months: string[];
  series: number[];
  berjalan: { month: string; aktif: number };
  components: { month: string; aktif: number; baru: number; kembali: number; berhenti: number; bersih: number }[];
  ringkasan: {
    bulan: string | null;
    aktif: number;
    vsBulanLalu: number | null;
    vsTahunLalu: number | null;
    baru: number;
    kembali: number;
    berhenti: number;
    bersih: number;
    tumbuh6: number | null;
    setahunLalu: number | null;
  };
  forecast: { months: string[]; fc: number[]; lo: number[]; hi: number[]; pes: number[]; opt: number[]; seasonal: boolean; eventUplift: number } | null;
  akhir: { month: string; value: number; lo: number; hi: number } | null;
  milestones: { target: number; month: string }[];
  perTahun: { tahun: number; value: number; lo: number; hi: number; pes: number; opt: number; jangkaPanjang: boolean }[];
  backtest: { mape3: number | null; mape12: number | null; points: { month: string; actual: number; pred: number }[] };
  platform: {
    series: ({ month: string } & Record<Plat, number>)[];
    ringkasan: { platform: Plat; aktif: number; tren3: number | null; retensi1: number | null }[];
    multiPlatform: number;
  };
  perCabang: {
    id: string;
    nama: string;
    aktif: number;
    tumbuhPersen: number | null;
    tren: number[];
    baru: number;
    berhenti: number;
    platform: { android: number; ios: number; web: number };
    prediksi12: number | null;
    prediksiLo: number | null;
    prediksiHi: number | null;
    kecil: boolean;
  }[];
  usia: { key: string; label: string; aktif: number; tren3: number | null }[];
  keterlibatan: { key: string; label: string; persen: number | null }[];
  homecell: {
    persenAktif: number | null;
    stopIn: number | null;
    stopOut: number | null;
    curveIn: (number | null)[];
    curveOut: (number | null)[];
    perCabang: { cabangId: string; nama: string; homecell: number; rataAnggota: number; lebihBatas: number; perluDibuka: number }[];
    perluDibuka: number;
    sampaiTahun: number;
    ideal: number;
    batas: number;
    pertumbuhan: {
      months: string[];
      homecell: number[];
      baru: number[];
      anggota: number[];
      pertemuan: number[];
      hadirRata: (number | null)[];
      tamuHadir: number[];
      sekarang: { homecell: number; anggota: number; rataPerHomecell: number | null };
      tumbuh3: { homecell: number | null; anggota: number | null };
      tumbuh12: { homecell: number | null; anggota: number | null };
      baru12: number;
      prediksi: { months: string[]; anggota: number[]; homecellDibutuhkan: number[] };
      butuh12: number | null;
      tambahan12: number | null;
    };
  };
  event: {
    pastEvents: number;
    perEvent: { id: string; judul: string; tanggal: string; cabang: string; peserta: number; tamu: number; jadiJemaat: number; bertahanPersen: number | null }[];
    upliftPerEvent: number;
    eventsPerYear: number;
    dariEvent: { month: string; baru: number; dariEvent: number }[];
    persenDariEvent: number | null;
    upcoming3: number;
    upcomingList: { judul: string; tanggal: string; cabang: string }[];
    ready: boolean;
  };
  tamu: {
    dataMonths: number;
    bulanan: { month: string; newComer: number; visitor: number }[];
    prediksi: number[];
    prediksiMonths: string[];
    bulanIni: { tamu: number; newComer: number; visitor: number; vsBulanLalu: number | null };
    konversi: { total: number | null; newComer: number | null; visitor: number | null };
    perjalanan: { datang: number; datangLagi: number; dihubungi: number; daftar: number; aktif: number };
    belumFollowUp: number;
    perCabang: { nama: string; tamu: number; newComer: number; visitor: number; konversi: number | null; belumFu: number; sumber: { ibadah: number; event: number; homecell: number } }[];
  };
  kapasitas: {
    list: {
      id: string;
      nama: string;
      jam: string;
      cabangId: string;
      cabang: string;
      kursi: number | null;
      pertemuan: number;
      rataHadir: number;
      puncak: number;
      okupansi: number | null;
      okupansi6: number | null;
      okupansi12: number | null;
      penuhMulai: string | null;
      cukupData: boolean;
      riwayat: { tanggal: string; hadir: number }[];
    }[];
    rataOkupansi: number | null;
    pertemuanPenuh: number;
    pertemuanBulanIni: number;
    akanPenuh6: number;
    sisaKursi: number;
    tanpaKapasitas: number;
    minMeetings: number;
  };
  readiness: { key: string; label: string; have: number; min: number; unit: string; extra: string | null; status: 'siap' | 'awal' | 'kurang' }[];
  sim: {
    aktif: number;
    baruPerBulan: number;
    kembaliPerBulan: number;
    retensi1: number | null;
    berhentiPersen: number | null;
    homecellPersen: number | null;
    berhentiHomecell: number | null;
    berhentiNonHomecell: number | null;
    upliftPerEvent: number;
    eventPerTahun: number;
  };
  kumulatif: {
    months: string[];
    akun: number[];
    akunBaru: number[];
    jemaat: number[];
    jemaatBaru: number[];
    aktif: (number | null)[];
    persenAktif: (number | null)[];
    cmgr: { akun3: number | null; akun6: number | null; akun12: number | null; jemaat12: number | null; aktif6: number | null; aktif12: number | null };
    prediksi: { months: string[]; akun: number[] };
    /** Bulan berjalan s/d hari ini (belum lengkap). Opsional: server lama tidak mengirim. */
    berjalan?: {
      month: string;
      sampai: string;
      hari: number;
      hariDalamBulan: number;
      akun: number;
      akunBaru: number;
      jemaat: number;
      jemaatBaru: number;
      aktif: number;
      persenAktif: number | null;
    };
  };
  insights: { tone: 'ok' | 'info' | 'warn' | 'bad'; judul: string; isi: string }[];
  langkah: { no: number; judul: string; isi: string; tone: string }[];
  pernyataan: string;
}

export const mLabel = (k: string, long = false) =>
  new Date(`${k}-01T00:00:00.000Z`).toLocaleDateString('id-ID', { month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit', timeZone: 'UTC' });
export const nf = (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString('id-ID'));
export const pf = (v: number | null | undefined) => (v == null ? '—' : `${v.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`);
