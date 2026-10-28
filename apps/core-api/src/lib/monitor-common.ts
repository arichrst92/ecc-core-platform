/** Bagian bersama Monitor Ibadah & Monitor Event: pengguna Els App aktif + kondisi sistem 15 menit. */
import { prisma } from '@ecc/database';
import { activePresence } from './telemetry.js';
import { LATENCY_EDGES, pendingRows, percentileFromHist } from './api-metrics.js';

export function appActivity() {
  const act = activePresence();
  const on = (re: RegExp) => act.filter((p) => p.route && re.test(p.route)).length;
  return {
    aktif: act.length,
    tiket: on(/^\/(reservasi|tiket|my-reservasi)/),
    alkitab: on(/^\/(bible|bible365)/),
    worship: on(/^\/worship/),
    event: on(/^\/event/),
  };
}

/** checkinRe = endpoint check-in yang dipantau (ibadah / event). */
export async function systemHealth(checkinRe = /checkin/) {
  const since = new Date(Date.now() - 15 * 60_000);
  const recent = [
    ...pendingRows().map((r) => ({ ...r, bucket: new Date(r.bucket) })),
    ...(await prisma.apiMetric.findMany({
      where: { bucket: { gte: since }, source: 'server' },
      select: { bucket: true, source: true, method: true, route: true, count: true, c5xx: true, hist: true },
    })),
  ].filter((r) => r.source === 'server');
  const hist = new Array(LATENCY_EDGES.length + 1).fill(0) as number[];
  let tot = 0;
  let c5 = 0;
  let ckTot = 0;
  let ckBad = 0;
  for (const r of recent) {
    tot += r.count;
    c5 += r.c5xx;
    r.hist.forEach((v, i) => (hist[i] = (hist[i] ?? 0) + (v ?? 0)));
    if (checkinRe.test(r.route) && r.method === 'POST') {
      ckTot += r.count;
      ckBad += r.c5xx;
    }
  }
  return {
    requests15m: tot,
    successPct: tot ? Math.round(((tot - c5) / tot) * 1000) / 10 : null,
    p95Ms: percentileFromHist(hist, 0.95),
    checkinSuccessPct: ckTot ? Math.round(((ckTot - ckBad) / ckTot) * 1000) / 10 : null,
    checkinRequests: ckTot,
  };
}

/** Kurva kedatangan per 5 menit dari `from` sampai `to` (cumulative mulai `before`). */
export function arrivalCurve(times: (Date | null | undefined)[], from: number, to: number, tz: string) {
  const binMs = 5 * 60_000;
  const nb = Math.max(1, Math.ceil((to - from) / binMs));
  const bins = new Array(nb).fill(0) as number[];
  let before = 0;
  for (const d of times) {
    const t = d?.getTime();
    if (t == null) continue;
    if (t < from) before++;
    else if (t <= to + binMs) bins[Math.min(nb - 1, Math.floor((t - from) / binMs))]!++;
  }
  let cum = before;
  return bins.map((c, i) => {
    cum += c;
    return { t: new Date(from + i * binMs).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: tz }), n: c, cum };
  });
}
