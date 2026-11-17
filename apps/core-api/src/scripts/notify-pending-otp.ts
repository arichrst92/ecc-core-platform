/**
 * Skrip sekali jalan: beri tahu lewat email jemaat yang meminta OTP login
 * (WhatsApp) dalam N jam terakhir tapi belum berhasil login — minta mereka
 * meminta kode lagi (kode baru ikut dikirim ke email, OTP_EMAIL_COPY=always).
 * Email TIDAK berisi kode OTP (kode tersimpan sebagai hash & sudah kedaluwarsa).
 *
 * Sumber nomor:
 *   1. otp_verification (purpose LOGIN, belum dipakai) — OTP "terkirim" tapi
 *      tidak sampai (gateway antre/terblokir diam-diam).
 *   2. Log pm2 "[auth-otp] gagal kirim OTP via WhatsApp" — OTP gagal total
 *      (baris otp_verification-nya sudah dihapus server).
 *
 * Jalankan di VPS (folder apps/core-api), setelah build:
 *   node -r dotenv/config dist/scripts/notify-pending-otp.js dotenv_config_path=../../.env
 *     → DRY RUN: hanya menampilkan daftar penerima
 *   ... --send          → kirim email
 *   ... --hours=12      → rentang waktu (default 6 jam)
 *   ... --log=<file>    → file log pm2 tambahan (default ~/.pm2/logs/ecc-core-api-{out,error}.log)
 * Penerima yang sudah dikirimi dicatat di ~/.ecc-otp-notice-sent.json supaya
 * tidak dobel bila skrip dijalankan lagi.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { prisma } from '@ecc/database';
import { sendOtpRetryNoticeEmail } from '../lib/sendgrid.js';

const args = process.argv.slice(2);
const SEND = args.includes('--send');
const HOURS = Number(args.find((a) => a.startsWith('--hours='))?.split('=')[1] ?? 6);
const extraLogs = args.filter((a) => a.startsWith('--log=')).map((a) => a.slice(6));
const SENT_FILE = join(homedir(), '.ecc-otp-notice-sent.json');

const mask = (s: string) => (s.length > 6 ? `${s.slice(0, 5)}…${s.slice(-3)}` : s);
const maskEmail = (e: string) => {
  const [u, d] = e.split('@');
  return `${(u ?? '').slice(0, 2)}…@${d ?? ''}`;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!Number.isFinite(HOURS) || HOURS <= 0 || HOURS > 72) throw new Error('--hours harus 1–72');
  const since = new Date(Date.now() - HOURS * 3_600_000);

  // noHp → waktu permintaan terakhir
  const lastReq = new Map<string, Date>();
  const note = (noHp: string, at: Date) => {
    const cur = lastReq.get(noHp);
    if (!cur || at > cur) lastReq.set(noHp, at);
  };

  // 1) OTP login yang belum dipakai
  const rows = await prisma.otpVerification.findMany({
    where: { purpose: 'LOGIN', usedAt: null, createdAt: { gte: since } },
    select: { noHp: true, createdAt: true },
  });
  for (const r of rows) if (r.noHp) note(r.noHp, r.createdAt);

  // 2) Log pm2: OTP gagal kirim (JSON pino per baris)
  const logFiles = [
    join(homedir(), '.pm2/logs/ecc-core-api-out.log'),
    join(homedir(), '.pm2/logs/ecc-core-api-error.log'),
    ...extraLogs,
  ].filter((f) => existsSync(f));
  let fromLogs = 0;
  for (const f of logFiles) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (!line.includes('gagal kirim OTP via WhatsApp')) continue;
      try {
        const j = JSON.parse(line.slice(line.indexOf('{'))) as { noHp?: string; purpose?: string; time?: number };
        if (!j.noHp || (j.purpose && j.purpose !== 'LOGIN') || !j.time) continue;
        const at = new Date(j.time);
        if (at < since) continue;
        note(j.noHp, at);
        fromLogs++;
      } catch {
        /* baris bukan JSON — lewati */
      }
    }
  }

  const sent: Record<string, string> = existsSync(SENT_FILE) ? JSON.parse(readFileSync(SENT_FILE, 'utf8')) : {};

  const jemaats = lastReq.size
    ? await prisma.jemaat.findMany({
        where: { noHp: { in: [...lastReq.keys()] }, isTamu: false },
        select: { id: true, noHp: true, namaLengkap: true, email: true, isActive: true, user: { select: { lastLoginAt: true } } },
      })
    : [];

  type Row = { noHp: string; nama: string; email: string; req: Date };
  const targets: Row[] = [];
  const skipped: Record<string, number> = { tanpaEmail: 0, sudahLogin: 0, sudahDikirimi: 0, nonaktif: 0 };
  for (const j of jemaats) {
    const req = lastReq.get(j.noHp!)!;
    if (!j.isActive) skipped.nonaktif!++;
    else if (!j.email) skipped.tanpaEmail!++;
    else if (j.user?.lastLoginAt && j.user.lastLoginAt >= req) skipped.sudahLogin!++;
    else if (sent[j.noHp!]) skipped.sudahDikirimi!++;
    else targets.push({ noHp: j.noHp!, nama: j.namaLengkap, email: j.email, req });
  }

  console.log(`Rentang: ${HOURS} jam terakhir (sejak ${since.toISOString()})`);
  console.log(`Nomor ditemukan: ${lastReq.size} (otp_verification: ${rows.length} baris, log gagal: ${fromLogs} baris dari ${logFiles.length} file)`);
  console.log(`Dilewati: ${JSON.stringify(skipped)} · tidak terdaftar/tamu: ${lastReq.size - jemaats.length}`);
  console.log(`Akan dikirimi email: ${targets.length}`);
  for (const t of targets) console.log(`  ${mask(t.noHp)}  ${maskEmail(t.email)}  ${t.req.toISOString()}  ${t.nama}`);

  if (!SEND) {
    console.log('\nDRY RUN — belum ada email terkirim. Tambahkan --send untuk mengirim.');
    return;
  }

  let ok = 0;
  for (const t of targets) {
    try {
      await sendOtpRetryNoticeEmail({ to: t.email, namaLengkap: t.nama });
      sent[t.noHp] = new Date().toISOString();
      writeFileSync(SENT_FILE, JSON.stringify(sent, null, 2));
      ok++;
    } catch (err) {
      console.error(`  GAGAL ${mask(t.noHp)}: ${(err as Error).message}`);
    }
    await sleep(300);
  }
  console.log(`\nTerkirim: ${ok}/${targets.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
