import { describe, expect, it } from 'vitest';
import { backupFileName, isSafeBackupName, pgConnUrl } from './db-backup.js';

describe('db-backup', () => {
  it('nama file berdasarkan waktu WIB', () => {
    expect(backupFileName(new Date('2026-10-17T16:45:12Z'))).toBe('ecc-db_2026-10-17_23-45-12_WIB.dump');
    expect(backupFileName(new Date('2026-10-17T17:00:00Z'), 'pre-restore')).toBe('ecc-db_2026-10-18_00-00-00_WIB_pre-restore.dump');
  });
  it('nama file aman', () => {
    expect(isSafeBackupName('ecc-db_2026-10-17_23-45-12_WIB.dump')).toBe(true);
    expect(isSafeBackupName('../etc/passwd.dump')).toBe(false);
    expect(isSafeBackupName('a/b.dump')).toBe(false);
    expect(isSafeBackupName('x.sql')).toBe(false);
  });
  it('URL Prisma → URL pg_dump', () => {
    expect(pgConnUrl('postgresql://u:p@localhost:5432/ecc?schema=public&connection_limit=5&sslmode=require')).toBe(
      'postgresql://u:p@localhost:5432/ecc?sslmode=require',
    );
  });
});
