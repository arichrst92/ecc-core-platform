/**
 * PM2 ecosystem config — production VPS process manager.
 *
 * Dua process:
 *   1. ecc-core-api   → Node Express server (port 4100 default)
 *   2. ecc-portal     → Next.js production server (port 3100 default)
 *
 * Cara pakai:
 *   pm2 start ecosystem.config.cjs                  # first time
 *   pm2 reload ecosystem.config.cjs --update-env    # zero-downtime restart
 *   pm2 save                                        # persist process list
 *   pm2 startup                                     # generate systemd unit
 *
 * Logs:
 *   pm2 logs ecc-core-api
 *   pm2 logs ecc-portal
 *   pm2 logs --lines 100 ecc-core-api
 *
 * `dotenv -e ../../.env` pre-prepended ke command Vol sudah handle env load
 * untuk dev (lihat scripts di package.json). Untuk PM2 production, kita
 * load env via `env_file` (PM2 v6 native) atau via `dotenv-cli` di start command.
 */
module.exports = {
  apps: [
    {
      name: 'ecc-core-api',
      cwd: './apps/core-api',
      // node binary langsung tanpa ts-node — sudah di-compile via `pnpm build`.
      script: 'dist/index.js',
      // Single instance — kalau scale > 1, harus pindah scheduled-jobs ke
      // external cron (lihat lib/scheduled-jobs.ts comment). Cluster mode
      // bikin tiap pod jalankan cron sendiri (wasted query tapi safe karena
      // dedup unique key).
      instances: 1,
      exec_mode: 'fork',
      // Auto restart kalau crash, max 10 retry per minute.
      autorestart: true,
      max_restarts: 10,
      restart_delay: 4000,
      // Reload kalau memory > 500MB (sharp + tensorflow bisa leak).
      max_memory_restart: '500M',
      // Env file di root repo (shared dgn core-api + portal).
      env_file: '../../.env',
      // Logging — PM2 simpan di ~/.pm2/logs/<name>-{out,error}.log
      out_file: '~/.pm2/logs/ecc-core-api-out.log',
      error_file: '~/.pm2/logs/ecc-core-api-error.log',
      time: true,  // timestamp di log line
    },
    {
      name: 'ecc-portal',
      cwd: './apps/portal',
      // next start = production server (require `pnpm build` done).
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3100',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 4000,
      max_memory_restart: '500M',
      env_file: '../../.env',
      out_file: '~/.pm2/logs/ecc-portal-out.log',
      error_file: '~/.pm2/logs/ecc-portal-error.log',
      time: true,
    },
  ],
};
