/**
 * Guard test: setiap tipe WA notif yang dipakai di code (sendWaIfEnabled /
 * getConfig) WAJIB punya seed row di migration wa_notification_config.
 * Tanpa row, getConfig() return null → notif diam-diam tidak pernah terkirim
 * dan tidak muncul di halaman portal WhatsApp Notif Config.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('.', import.meta.url));
const MIGRATIONS = join(SRC, '../../../packages/database/prisma/migrations');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

function usedTypes(): Set<string> {
  const re = /(?:sendWaIfEnabled|getConfig)\(\s*'([A-Z0-9_]+)'/g;
  const set = new Set<string>();
  for (const f of walk(SRC)) {
    for (const m of readFileSync(f, 'utf8').matchAll(re)) set.add(m[1]!);
  }
  return set;
}

function seededTypes(): Set<string> {
  const set = new Set<string>();
  for (const dir of readdirSync(MIGRATIONS)) {
    const file = join(MIGRATIONS, dir, 'migration.sql');
    let sql: string;
    try {
      sql = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (!sql.includes('"wa_notification_config"')) continue;
    for (const m of sql.matchAll(/gen_random_uuid\(\),\s*'([A-Z0-9_]+)'/g)) set.add(m[1]!);
  }
  return set;
}

describe('WA notif config seed coverage', () => {
  it('menemukan tipe yang dipakai di code', () => {
    expect(usedTypes().size).toBeGreaterThan(0);
  });

  it('semua tipe yang dipakai di code sudah di-seed di migration', () => {
    const seeded = seededTypes();
    const missing = [...usedTypes()].filter((t) => !seeded.has(t)).sort();
    expect(missing).toEqual([]);
  });
});
