#!/usr/bin/env node
/**
 * Dashboard uji beban Els App — dijalankan di Mac (bukan di server).
 *
 *   node scripts/loadtest/dashboard/server.mjs
 *   → buka http://localhost:5050
 *
 * Yang dilakukan:
 *   1. Menjalankan k6 (scripts/loadtest/k6-jemaat.js) dengan parameter dari GUI,
 *      membaca hasilnya detik per detik (request/detik, waktu respons, gagal).
 *   2. Memantau VPS lewat SSH (HANYA MEMBACA): CPU total, CPU core-api &
 *      PostgreSQL, RAM, load, koneksi database, koneksi HTTPS, lalu lintas jaringan.
 *      Tidak ada yang diinstal / diubah di server.
 *
 * Syarat: Node 18+, k6 (brew install k6), login SSH ke VPS tanpa password
 * (ssh-copy-id deploy@<IP-VPS>). Tanpa SSH, uji tetap jalan — panel server kosong.
 *
 * Opsi (env): PORT=5050  SSH_HOST=deploy@<IP>  APP_DIR=/var/www/ecc-core-platform
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, openSync, readSync, closeSync, statSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, '../k6-jemaat.js');
const RUNS_DIR = resolve(HERE, '../runs');
const CONF_FILE = resolve(HERE, '../runs/config.json');
const PORT = Number(process.env.PORT || 5050);
mkdirSync(RUNS_DIR, { recursive: true });

let conf = { sshHost: process.env.SSH_HOST || '', appDir: process.env.APP_DIR || '/var/www/ecc-core-platform', baseUrl: process.env.BASE_URL || 'https://api.eccchurch.global' };
try {
  conf = { ...conf, ...JSON.parse(readFileSync(CONF_FILE, 'utf8')) };
} catch {}
const saveConf = () => writeFileSync(CONF_FILE, JSON.stringify(conf, null, 2));

// ------------------------------------------------------------------ SSE
const clients = new Set();
function push(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

// ------------------------------------------------------------------ k6 run state
const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

let run = null; // { id, params, proc, startedAt, state, seconds: Map, endpoints, totals, log, durations }

function classify(status) {
  const s = Number(status);
  if (!s) return 'net';
  if (s === 429) return 'r429';
  if (s >= 500) return 's5xx';
  if (s >= 400) return 'c4xx';
  return 'ok';
}

function newBucket() {
  return { reqs: 0, ok: 0, r429: 0, s5xx: 0, c4xx: 0, net: 0, durs: [], vus: 0 };
}

function ingestPoint(p) {
  if (p.type !== 'Point') return;
  const sec = Math.floor(Date.parse(p.data.time) / 1000);
  const tags = p.data.tags || {};
  if (p.metric === 'vus') {
    const b = run.seconds.get(sec) || newBucket();
    b.vus = p.data.value;
    run.seconds.set(sec, b);
    run.vus = p.data.value;
    return;
  }
  if (p.metric === 'http_reqs') {
    if (tags.name === 'setup-cabang') return;
    const b = run.seconds.get(sec) || newBucket();
    const cls = classify(tags.status);
    b.reqs++;
    b[cls]++;
    run.seconds.set(sec, b);
    const e = run.endpoints[tags.name || '?'] || (run.endpoints[tags.name || '?'] = { reqs: 0, ok: 0, r429: 0, s5xx: 0, c4xx: 0, net: 0, durs: [] });
    e.reqs++;
    e[cls]++;
    run.totals.reqs++;
    run.totals[cls]++;
    return;
  }
  if (p.metric === 'http_req_duration') {
    if (tags.name === 'setup-cabang') return;
    const b = run.seconds.get(sec) || newBucket();
    b.durs.push(p.data.value);
    run.seconds.set(sec, b);
    const e = run.endpoints[tags.name || '?'];
    if (e && e.durs.length < 200000) e.durs.push(p.data.value);
    if (run.durations.length < 2000000) run.durations.push(p.data.value);
    if (!(run.maxDur >= p.data.value)) run.maxDur = p.data.value;
  }
}

function tailFile() {
  if (!run?.jsonFile || !existsSync(run.jsonFile)) return;
  const size = statSync(run.jsonFile).size;
  if (size <= run.offset) return;
  const fd = openSync(run.jsonFile, 'r');
  const len = Math.min(size - run.offset, 32 * 1024 * 1024);
  const buf = Buffer.alloc(len);
  readSync(fd, buf, 0, len, run.offset);
  closeSync(fd);
  run.offset += len;
  const text = run.partial + buf.toString('utf8');
  const lines = text.split('\n');
  run.partial = lines.pop() ?? '';
  for (const l of lines) {
    if (!l) continue;
    try {
      ingestPoint(JSON.parse(l));
    } catch {}
  }
}

function secondRow(sec, b) {
  return {
    t: sec * 1000,
    rps: b.reqs,
    ok: b.ok,
    r429: b.r429,
    s5xx: b.s5xx,
    c4xx: b.c4xx,
    net: b.net,
    p50: pct(b.durs, 0.5),
    p95: pct(b.durs, 0.95),
    vus: b.vus,
  };
}

function endpointsSummary() {
  return Object.entries(run.endpoints)
    .map(([name, e]) => ({
      name,
      reqs: e.reqs,
      okPct: e.reqs ? Math.round((e.ok / e.reqs) * 10000) / 100 : null,
      r429: e.r429,
      s5xx: e.s5xx,
      net: e.net,
      p50: pct(e.durs, 0.5),
      p95: pct(e.durs, 0.95),
    }))
    .sort((a, b) => b.reqs - a.reqs);
}

function runSnapshot(full = false) {
  if (!run) return null;
  const secs = [...run.seconds.keys()].sort((a, b) => a - b);
  const now = Math.floor(Date.now() / 1000);
  // Detik terakhir yang sudah "lengkap" (k6 menulis berkas sedikit terlambat).
  const done = secs.filter((s) => s < now - 2 || run.state !== 'running');
  const rows = (full ? done : done.filter((s) => s > (run.sentUntil ?? 0))).map((s) => secondRow(s, run.seconds.get(s)));
  if (!full && done.length) run.sentUntil = done[done.length - 1];
  const t = run.totals;
  return {
    id: run.id,
    params: run.params,
    state: run.state,
    startedAt: run.startedAt,
    endedAt: run.endedAt ?? null,
    vus: run.vus ?? 0,
    rows,
    totals: {
      ...t,
      failPct: t.reqs ? Math.round(((t.r429 + t.s5xx + t.net + t.c4xx) / t.reqs) * 10000) / 100 : 0,
      p50: pct(run.durations, 0.5),
      p95: pct(run.durations, 0.95),
      p99: pct(run.durations, 0.99),
      max: run.maxDur ?? null,
    },
    endpoints: endpointsSummary(),
    log: run.log.slice(-60),
    summary: run.summary ?? null,
  };
}

function startRun(params) {
  if (run?.state === 'running') throw new Error('Uji masih berjalan.');
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonFile = join(tmpdir(), `k6-elsapp-${id}.json`);
  const summaryFile = join(RUNS_DIR, `${id}-summary.json`);
  const env = [];
  const p = {
    USERS: String(Math.max(10, Math.min(20000, Number(params.users) || 500))),
    RAMP: /^\d+[smh]$/.test(params.ramp || '') ? params.ramp : '1m',
    HOLD: /^\d+[smh]$/.test(params.hold || '') ? params.hold : '2m',
    SCENARIO: params.scenario === 'spike' ? 'spike' : 'normal',
    BASE_URL: conf.baseUrl,
  };
  for (const [k, v] of Object.entries(p)) env.push('-e', `${k}=${v}`);
  const args = ['run', '--out', `json=${jsonFile}`, '--summary-export', summaryFile, ...env, SCRIPT];
  const proc = spawn('k6', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  run = {
    id,
    params: p,
    proc,
    startedAt: Date.now(),
    state: 'running',
    seconds: new Map(),
    endpoints: {},
    totals: { reqs: 0, ok: 0, r429: 0, s5xx: 0, c4xx: 0, net: 0 },
    durations: [],
    log: [`$ k6 ${args.join(' ')}`],
    jsonFile,
    summaryFile,
    offset: 0,
    partial: '',
  };
  const onOut = (d) => {
    for (const line of d.toString().split(/\r?\n/)) {
      const l = line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trimEnd();
      if (l && !/^\s*(running|[a-zA-Z]+\s+\[)/.test(l)) run.log.push(l);
    }
    if (run.log.length > 400) run.log.splice(0, run.log.length - 400);
  };
  proc.stdout.on('data', onOut);
  proc.stderr.on('data', onOut);
  proc.on('error', (e) => {
    run.log.push(`✘ ${e.message} — apakah k6 sudah terpasang? (brew install k6)`);
    run.state = 'error';
    push('run', runSnapshot(true));
  });
  proc.on('close', (code) => {
    tailFile();
    run.state = run.stopped ? 'stopped' : code === 0 ? 'done' : 'failed-threshold';
    run.endedAt = Date.now();
    run.log.push(`k6 selesai (kode ${code})`);
    try {
      run.summary = JSON.parse(readFileSync(summaryFile, 'utf8'));
    } catch {}
    const snap = runSnapshot(true);
    snap.server = serverHistory.filter((s) => s.t >= run.startedAt - 5000);
    writeFileSync(join(RUNS_DIR, `${id}.json`), JSON.stringify(snap));
    push('run', snap);
  });
  return run;
}

// ------------------------------------------------------------------ SSH monitor (read-only)
const REMOTE = (appDir) => String.raw`
set +e
cd ${appDir} 2>/dev/null
DB="$(grep -m1 '^DATABASE_URL=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' | cut -d'?' -f1)"
HZ=$(getconf CLK_TCK); NCPU=$(nproc)
API=""; n=0
while true; do
  if [ $((n % 15)) -eq 0 ]; then
    API=$(pm2 pid ecc-core-api 2>/dev/null | tail -1)
    case "$API" in ''|0|*[!0-9]*) API=$(pgrep -f "core-api/dist/index.js" | head -1) ;; esac
  fi
  n=$((n+1))
  CPU=$(head -1 /proc/stat | cut -d' ' -f3-)
  MT=$(awk '/^MemTotal/{print $2}' /proc/meminfo); MA=$(awk '/^MemAvailable/{print $2}' /proc/meminfo)
  LOAD=$(cut -d' ' -f1-3 /proc/loadavg)
  NET=$(awk 'NR>2 && $1!~/^lo:/{rx+=$2;tx+=$10} END{print rx+0, tx+0}' /proc/net/dev)
  AJ=0; ARSS=0
  if [ -n "$API" ] && [ -r /proc/$API/stat ]; then AJ=$(awk '{print $14+$15}' /proc/$API/stat); ARSS=$(awk '/^VmRSS/{print $2}' /proc/$API/status); fi
  [ -z "$ARSS" ] && ARSS=0
  PJ=0; for p in $(pgrep -x postgres); do v=$(awk '{print $14+$15}' /proc/$p/stat 2>/dev/null); [ -z "$v" ] && v=0; PJ=$((PJ + v)); done
  PC=-1; [ -n "$DB" ] && PC=$(psql "$DB" -Atc "select count(*) from pg_stat_activity" 2>/dev/null); [ -z "$PC" ] && PC=-1
  HC=$(ss -Htn state established '( sport = :443 )' 2>/dev/null | wc -l)
  echo "{\"t\":$(date +%s%3N),\"cpu\":\"$CPU\",\"mt\":$MT,\"ma\":$MA,\"load\":\"$LOAD\",\"net\":\"$NET\",\"aj\":$AJ,\"arss\":$ARSS,\"pj\":$PJ,\"pc\":$PC,\"hc\":$HC,\"hz\":$HZ,\"ncpu\":$NCPU,\"api\":\"$API\"}"
  sleep 2
done
`;

let mon = null; // { proc, last, state, error }
const serverHistory = [];

function startMonitor() {
  stopMonitor();
  if (!conf.sshHost) {
    mon = { state: 'off', error: 'SSH_HOST belum diisi.' };
    push('mon', { state: mon.state, error: mon.error });
    return;
  }
  const proc = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=10', conf.sshHost, 'bash -s'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  mon = { proc, state: 'connecting', last: null, error: null, buf: '' };
  push('mon', { state: mon.state });
  proc.stdin.end(REMOTE(conf.appDir));
  proc.stdout.on('data', (d) => {
    mon.buf += d.toString();
    const lines = mon.buf.split('\n');
    mon.buf = lines.pop() ?? '';
    for (const l of lines) {
      let s;
      try {
        s = JSON.parse(l);
      } catch {
        continue;
      }
      const cpu = s.cpu.split(' ').map(Number);
      const idle = cpu[3] + (cpu[4] || 0);
      const total = cpu.slice(0, 8).reduce((a, b) => a + b, 0);
      const [rx, tx] = s.net.split(' ').map(Number);
      const prev = mon.last;
      mon.last = { t: Date.now(), idle, total, aj: s.aj, pj: s.pj, rx, tx };
      if (!prev) continue;
      const dt = (mon.last.t - prev.t) / 1000;
      const sample = {
        t: mon.last.t,
        cpu: Math.round((1 - (idle - prev.idle) / Math.max(1, total - prev.total)) * 1000) / 10,
        api: Math.round(((s.aj - prev.aj) / s.hz / dt) * 1000) / 10, // % dari 1 inti
        pg: Math.round(((s.pj - prev.pj) / s.hz / dt) * 1000) / 10,
        memUsed: Math.round(((s.mt - s.ma) / s.mt) * 1000) / 10,
        memUsedMb: Math.round((s.mt - s.ma) / 1024),
        memTotalMb: Math.round(s.mt / 1024),
        apiRssMb: Math.round((s.arss || 0) / 1024),
        load1: Number(s.load.split(' ')[0]),
        pgConn: s.pc,
        https: s.hc,
        rxMbps: Math.round((((rx - prev.rx) * 8) / dt / 1e6) * 10) / 10,
        txMbps: Math.round((((tx - prev.tx) * 8) / dt / 1e6) * 10) / 10,
        ncpu: s.ncpu,
        apiPid: s.api,
      };
      serverHistory.push(sample);
      if (serverHistory.length > 4000) serverHistory.splice(0, serverHistory.length - 4000);
      mon.state = 'live';
      push('srv', sample);
    }
  });
  let errText = '';
  proc.stderr.on('data', (d) => (errText += d.toString()));
  proc.on('close', (code) => {
    if (mon?.proc !== proc) return;
    mon.state = 'off';
    mon.error = code === 0 ? null : (errText.trim().split('\n').pop() || `ssh keluar (kode ${code})`);
    push('mon', { state: mon.state, error: mon.error });
  });
}

function stopMonitor() {
  if (mon?.proc) {
    const p = mon.proc;
    mon.proc = null;
    p.kill('SIGTERM');
  }
  mon = { state: 'off' };
}

// ------------------------------------------------------------------ HTTP
const body = (req) =>
  new Promise((ok) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      try {
        ok(JSON.parse(b || '{}'));
      } catch {
        ok({});
      }
    });
  });
const json = (res, code, data) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(readFileSync(join(HERE, 'index.html')));
    }
    if (url.pathname === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write(`event: hello\ndata: ${JSON.stringify({ conf, mon: { state: mon?.state ?? 'off', error: mon?.error ?? null }, server: serverHistory.slice(-900), run: runSnapshot(true) })}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/config') {
      const b = await body(req);
      if (typeof b.sshHost === 'string') conf.sshHost = b.sshHost.trim();
      if (typeof b.appDir === 'string' && b.appDir.trim()) conf.appDir = b.appDir.trim();
      if (typeof b.baseUrl === 'string' && /^https?:\/\//.test(b.baseUrl)) conf.baseUrl = b.baseUrl.trim().replace(/\/$/, '');
      saveConf();
      return json(res, 200, conf);
    }
    if (req.method === 'POST' && url.pathname === '/monitor/start') {
      startMonitor();
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/monitor/stop') {
      stopMonitor();
      push('mon', { state: 'off' });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/run') {
      const b = await body(req);
      if (b.autoMonitor && conf.sshHost && mon?.state !== 'live') startMonitor();
      startRun(b);
      push('run', runSnapshot(true));
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/stop') {
      if (run?.state === 'running') {
        run.stopped = true;
        run.proc.kill('SIGINT'); // k6 berhenti rapi & menulis ringkasan
      }
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/runs') {
      const list = readdirSync(RUNS_DIR)
        .filter((f) => /^\d{4}-.*Z\.json$/.test(f))
        .sort()
        .reverse()
        .slice(0, 30)
        .map((f) => {
          try {
            const r = JSON.parse(readFileSync(join(RUNS_DIR, f), 'utf8'));
            return { id: r.id, params: r.params, state: r.state, startedAt: r.startedAt, totals: r.totals };
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      return json(res, 200, list);
    }
    if (req.method === 'GET' && url.pathname.startsWith('/runs/')) {
      const id = url.pathname.slice(6).replace(/[^\w-]/g, '');
      const f = join(RUNS_DIR, `${id}.json`);
      if (!existsSync(f)) return json(res, 404, { error: 'tidak ada' });
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(readFileSync(f));
    }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, 400, { error: e.message });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Dashboard uji beban: http://localhost:${PORT}`);
  if (conf.sshHost) startMonitor();
});

// Kirim data k6 per detik.
setInterval(() => {
  if (!run) return;
  tailFile();
  if (run.state === 'running') push('tick', runSnapshot(false));
}, 1000);

process.on('SIGINT', () => {
  stopMonitor();
  if (run?.state === 'running') run.proc.kill('SIGINT');
  setTimeout(() => process.exit(0), 300);
});
