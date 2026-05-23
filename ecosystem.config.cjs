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
 * Env loading: PM2 v6 punya `env_file` directive tapi behavior tidak konsisten
 * antar versi. Kita load .env via dotenv di config file ini, lalu inject ke
 * masing-masing app via `env` field. Lebih reliable — tidak depend pada
 * cwd resolution PM2 atau versi PM2.
 */
const fs = require('node:fs');
const path = require('node:path');

// Manual .env parser — zero dependency. Mirror behavior dotenv:
//   - skip blank lines + comment (#)
//   - support KEY=value, KEY="quoted value", KEY='quoted value'
//   - trim whitespace
//   - tidak override env yang sudah ke-set (process.env > .env file)
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[ecosystem] Warning: .env file not found at ${filePath}`);
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    // Strip inline comment kalau ada (cuma untuk unquoted values)
    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (isQuoted) {
      value = value.slice(1, -1);
    } else {
      const commentIdx = value.indexOf('#');
      if (commentIdx !== -1) value = value.slice(0, commentIdx).trim();
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(__dirname, '.env'));

// Env vars yang di-passing ke setiap PM2 process. Sengaja eksplisit (bukan
// `...process.env`) supaya tidak bawa PATH/HOME/dll yang seharusnya dari
// PM2 user environment.
const sharedEnv = {
  NODE_ENV: process.env.NODE_ENV || 'production',
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN,
  FONNTE_TOKEN: process.env.FONNTE_TOKEN,
  OTP_LENGTH: process.env.OTP_LENGTH,
  OTP_EXPIRES_SECONDS: process.env.OTP_EXPIRES_SECONDS,
  OTP_MAX_ATTEMPTS: process.env.OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS: process.env.OTP_RESEND_COOLDOWN_SECONDS,
  FACE_MATCH_THRESHOLD: process.env.FACE_MATCH_THRESHOLD,
  FACE_MODELS_PATH: process.env.FACE_MODELS_PATH,
  UPLOADS_DIR: process.env.UPLOADS_DIR,
  UPLOAD_MAX_BYTES: process.env.UPLOAD_MAX_BYTES,
  PORT: process.env.PORT,
  PORTAL_URL: process.env.PORTAL_URL,
  CORE_API_URL: process.env.CORE_API_URL,
  NEXT_PUBLIC_CORE_API_URL: process.env.NEXT_PUBLIC_CORE_API_URL,
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
  LOG_LEVEL: process.env.LOG_LEVEL,
  LIVENESS_NONCE_SECRET: process.env.LIVENESS_NONCE_SECRET,
  CREDENTIAL_MASTER_PASSWORD: process.env.CREDENTIAL_MASTER_PASSWORD,
  AUDIT_LOG_RETENTION_DAYS: process.env.AUDIT_LOG_RETENTION_DAYS,
  REMINDER_SEND_HOUR_START: process.env.REMINDER_SEND_HOUR_START,
  REMINDER_SEND_HOUR_END: process.env.REMINDER_SEND_HOUR_END,
};

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
      // Env inline — di-load dari root .env via dotenv di top file ini.
      env: sharedEnv,
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
      env: sharedEnv,
      out_file: '~/.pm2/logs/ecc-portal-out.log',
      error_file: '~/.pm2/logs/ecc-portal-error.log',
      time: true,
    },
  ],
};
