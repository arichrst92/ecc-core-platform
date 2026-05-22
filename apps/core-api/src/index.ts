import 'dotenv/config';
// PENTING: patch Express 4 supaya async handler yang throw error otomatis
// di-forward ke errorHandler middleware. Tanpa ini, request akan hang.
import 'express-async-errors';
import os from 'node:os';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';
import { startScheduledJobs } from './lib/scheduled-jobs.js';

const PORT = Number(process.env.PORT ?? 4100);
// Default bind ke `0.0.0.0` (semua interfaces) supaya:
//   - Localhost akses lokal dev tetap jalan.
//   - LAN device (HP Expo Go, tablet QA) bisa hit via IP Mac.
//   - K8s/Docker container default behavior (sudah bind all interfaces).
// Override via env `HOST` kalau perlu bind ke interface tertentu (rare).
// Lihat docs/backend-request-dev-environment-access.md.
const HOST = process.env.HOST ?? '0.0.0.0';

/**
 * Enumerate LAN IPv4 addresses (skip loopback) untuk log. Mobile dev pakai
 * IP ini di Expo Go saat HP & Mac di WiFi yang sama.
 */
function listLanIps(): string[] {
  const ips: string[] = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      // IPv4, non-internal (skip loopback/Docker bridge bisa di-blacklist kalau perlu)
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

async function main() {
  const app = createApp();
  // Kick off background maintenance (refresh-token cleanup, dst).
  // Aman dijalankan sebelum listen — pakai setTimeout internal untuk delay.
  startScheduledJobs();
  app.listen(PORT, HOST, () => {
    const bind = HOST === '0.0.0.0' ? 'all interfaces' : HOST;
    logger.info(`🚀 ECC Core API listening on ${HOST}:${PORT} (${bind})`);
    logger.info(`📚 API docs: http://localhost:${PORT}/docs`);

    // Banner untuk dev: tampilkan LAN URL supaya HP Expo Go tahu mana yang
    // dipakai. Tidak di-tampilkan kalau bind hanya ke localhost (HOST !== 0.0.0.0).
    if (HOST === '0.0.0.0') {
      const lanIps = listLanIps();
      if (lanIps.length > 0) {
        logger.info(`📱 LAN access untuk HP / device fisik (Expo Go, dll):`);
        for (const ip of lanIps) {
          logger.info(`   → http://${ip}:${PORT}`);
        }
      }
    }
  });
}

main().catch((err) => {
  logger.error(err, 'Fatal startup error');
  process.exit(1);
});
