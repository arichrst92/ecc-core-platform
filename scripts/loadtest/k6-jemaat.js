/**
 * Uji beban Els App — HANYA memanggil API yang sudah ada, TANPA login dan
 * TANPA membuat / mengubah data apa pun di production (semua GET publik).
 *
 *   k6 run scripts/loadtest/k6-jemaat.js                          # beban normal 2000 jemaat
 *   k6 run -e SCENARIO=spike scripts/loadtest/k6-jemaat.js        # lonjakan (mis. check-in dibuka 07.15)
 *   k6 run -e USERS=500 -e HOLD=2m scripts/loadtest/k6-jemaat.js  # mulai kecil dulu
 *
 * Variabel:
 *   BASE_URL   default https://api.eccchurch.global
 *   USERS      jumlah jemaat yang disimulasikan (default 2000)
 *   RAMP       waktu naik ke puncak (default 2m)
 *   HOLD       lama di puncak (default 5m)
 *   SCENARIO   normal | spike
 *   CABANG_ID  opsional; default cabang aktif pertama dari /auth/cabang
 *
 * Model beban per jemaat aktif (≈ 205 request/detik untuk 2000 jemaat):
 *   - cek maintenance 1x/menit                       → /public/maintenance
 *   - lonceng notifikasi 2x/menit (butuh login)      → diganti /public/app-config (query ringan setara)
 *   - telemetry 2x/menit (tidak dikirim, agar Analitik bersih) → diganti /public/app-version
 *   - buka app ±1x/5 menit                           → versi app + konfigurasi
 *   - jadwal ibadah / event / berita / renungan / homecell → versi publik (mode tamu)
 * Endpoint login (/admin/...) tidak dipakai karena butuh akun/token; query
 * database versi publiknya setara.
 *
 * Batas server per IP: endpoint jadwal/event/berita (mode tamu) maks. 1500
 * request/menit per IP, jadi dari SATU komputer bagian itu dibatasi ±22/detik
 * (k6 menjaga di bawah batas). Endpoint maintenance, versi app, konfigurasi,
 * dan dokumen legal tidak dibatasi → dipakai untuk mendorong total beban.
 *
 * Catatan: setiap request tetap tercatat sebagai metrik di Portal → Analitik
 * (tabel Endpoint) — itu angka statistik, bukan data jemaat.
 */
import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'https://api.eccchurch.global';
const USERS = Number(__ENV.USERS || 2000);
const RAMP = __ENV.RAMP || '2m';
const HOLD = __ENV.HOLD || '5m';
const SCENARIO = __ENV.SCENARIO || 'normal';
const failed = new Rate('gagal');

// Request per detik untuk USERS jemaat aktif (lihat model beban di atas).
const MAINT_RPS = Math.ceil(USERS / 60); //  maintenance tiap 60 dtk
const BELL_RPS = Math.ceil(USERS / 30); //   pengganti lonceng (tiap 30 dtk)
const TELE_RPS = Math.ceil(USERS / 30); //   pengganti telemetry (±2x/menit)
const OPEN_RPS = Math.ceil(USERS / 300); // app dibuka ±1x / 5 menit per jemaat → versi + config
const LEGAL_RPS = Math.max(1, Math.ceil(USERS / 2000)); // sesekali buka S&K
const BROWSE_RPS = Math.min(22, Math.ceil(USERS / 60)); // batas per IP 1500/menit
const SPIKE = SCENARIO === 'spike' ? 3 : 1; // lonjakan: 3x beban normal dalam 30 detik

const stages = (rps) =>
  SCENARIO === 'spike'
    ? [
        { duration: '30s', target: rps * SPIKE },
        { duration: '2m', target: rps * SPIKE },
        { duration: '30s', target: 0 },
      ]
    : [
        { duration: RAMP, target: rps },
        { duration: HOLD, target: rps },
        { duration: '1m', target: 0 },
      ];

const flow = (exec, rps, vus) => ({
  executor: 'ramping-arrival-rate',
  exec,
  startRate: 0,
  timeUnit: '1s',
  preAllocatedVUs: vus,
  maxVUs: vus * 4,
  stages: stages(rps),
});

export const options = {
  scenarios: {
    maintenance: flow('maintenance', MAINT_RPS, 50),
    lonceng: flow('lonceng', BELL_RPS, 80),
    telemetry: flow('telemetry', TELE_RPS, 80),
    bukaApp: flow('bukaApp', OPEN_RPS, 30),
    legal: flow('legal', LEGAL_RPS, 5),
    // Jadwal/event/berita: tidak ikut dikali lonjakan supaya tetap di bawah batas per IP.
    jelajah: { ...flow('jelajah', BROWSE_RPS, 30), stages: stages(BROWSE_RPS).map((s) => ({ ...s, target: Math.min(22, s.target) })) },
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '30s' }],
    'http_req_failed{tujuan:uji}': ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
    'http_req_duration{name:ibadah-calendar}': ['p(95)<1000'],
    dropped_iterations: ['count<100'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  userAgent: 'ElsApp-Loadtest/1.0 (k6, read-only)',
};

const wib = (days = 0) => new Date(Date.now() + 7 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);

function get(path, name) {
  const res = http.get(`${BASE}${path}`, { tags: { name, tujuan: 'uji' }, timeout: '20s' });
  const ok = check(res, {
    [`${name} 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${name} bukan 429`]: (r) => r.status !== 429,
  });
  failed.add(!ok);
  return res;
}

export function setup() {
  if (__ENV.CABANG_ID) return { cabangId: __ENV.CABANG_ID };
  const res = http.get(`${BASE}/auth/cabang`, { tags: { name: 'setup-cabang' } });
  const list = res.json('data') || [];
  if (!list.length) throw new Error('Tidak bisa membaca daftar cabang dari /auth/cabang');
  console.log(`Cabang uji: ${list[0].nama}`);
  return { cabangId: list[0].id };
}

export function maintenance() {
  get('/public/maintenance', 'maintenance');
}

export function lonceng() {
  get('/public/app-config', 'pengganti-lonceng');
}

export function telemetry() {
  get(`/public/app-version?platform=${Math.random() < 0.5 ? 'ios' : 'android'}&currentVersion=2.4.4`, 'pengganti-telemetry');
}

export function bukaApp() {
  const p = Math.random() < 0.5 ? 'ios' : 'android';
  get(`/public/app-version?platform=${p}&currentVersion=2.4.4`, 'app-version');
  get('/public/app-config', 'app-config');
}

export function legal() {
  get(`/public/legal/${Math.random() < 0.5 ? 'TERMS' : 'PRIVACY'}?lang=id`, 'legal');
}

export function jelajah(data) {
  const c = data.cabangId;
  const r = Math.random();
  if (r < 0.35) get(`/public/ibadah/calendar?cabangId=${c}&from=${wib()}&to=${wib()}`, 'ibadah-calendar');
  else if (r < 0.55) get(`/public/ibadah/calendar?cabangId=${c}&from=${wib()}&to=${wib(7)}`, 'ibadah-calendar');
  else if (r < 0.75) get(`/public/event?cabangId=${c}&limit=10`, 'event');
  else if (r < 0.85) get(`/public/news?limit=3`, 'news');
  else if (r < 0.92) get(`/public/renungan?limit=1`, 'renungan');
  else get(`/public/homecell/browse?cabangId=${c}`, 'homecell-browse');
}
