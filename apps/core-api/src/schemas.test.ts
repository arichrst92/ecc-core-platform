/**
 * Validasi Zod schema untuk fitur baru: bulk homecell attendance + planning.
 * Import langsung dari source shared-types (bukan dist) supaya test tidak
 * bergantung pada build terakhir.
 */
import { describe, it, expect } from 'vitest';
// Side-effect import WAJIB duluan: common.ts memanggil extendZodWithOpenApi(z).
// esbuild (vitest) membuang import yg binding-nya tidak dipakai, jadi tanpa ini
// `.openapi()` belum terpasang saat homecell-schedule.ts dievaluasi.
import '../../../packages/shared-types/src/schemas/common.js';
import { bulkScanHomecellAttendanceSchema } from '../../../packages/shared-types/src/schemas/homecell-schedule.js';
import {
  createSprintSchema,
  createEpicSchema,
  createTaskSchema,
  updateStorySchema,
  createCommentSchema,
} from '../../../packages/shared-types/src/schemas/planning.js';

describe('bulkScanHomecellAttendanceSchema', () => {
  it('menerima 1–50 kode dan trim whitespace', () => {
    const r = bulkScanHomecellAttendanceSchema.parse({ kodes: [' JMT001 ', 'JMT002'] });
    expect(r.kodes).toEqual(['JMT001', 'JMT002']);
  });

  it('menolak array kosong', () => {
    expect(bulkScanHomecellAttendanceSchema.safeParse({ kodes: [] }).success).toBe(false);
  });

  it('menerima tepat 50, menolak 51', () => {
    const k = (n: number) => Array.from({ length: n }, (_, i) => `K${i}`);
    expect(bulkScanHomecellAttendanceSchema.safeParse({ kodes: k(50) }).success).toBe(true);
    expect(bulkScanHomecellAttendanceSchema.safeParse({ kodes: k(51) }).success).toBe(false);
  });

  it('menerima kode null/kosong (anggota tanpa kode) — dilaporkan per baris, bukan 400', () => {
    expect(bulkScanHomecellAttendanceSchema.safeParse({ kodes: ['  ', null, 'JMT001'] }).success).toBe(true);
  });

  it('menerima jemaatIds dan membatasi total 50', () => {
    const id = '0b6f3c1e-8a2d-4a5b-9c7e-1d2f3a4b5c6d';
    expect(bulkScanHomecellAttendanceSchema.safeParse({ jemaatIds: [id] }).success).toBe(true);
    expect(bulkScanHomecellAttendanceSchema.safeParse({ jemaatIds: ['bukan-uuid'] }).success).toBe(false);
    expect(
      bulkScanHomecellAttendanceSchema.safeParse({ jemaatIds: [id], kodes: Array.from({ length: 50 }, (_, i) => `K${i}`) }).success,
    ).toBe(false);
    expect(bulkScanHomecellAttendanceSchema.safeParse({}).success).toBe(false);
  });
});

describe('planning schemas', () => {
  it('sprint: endDate harus >= startDate', () => {
    const ok = createSprintSchema.safeParse({ nama: 'S1', startDate: '2026-10-01', endDate: '2026-10-14' });
    const bad = createSprintSchema.safeParse({ nama: 'S1', startDate: '2026-10-14', endDate: '2026-10-01' });
    expect(ok.success).toBe(true);
    expect(bad.success).toBe(false);
  });

  it('epic: default status BACKLOG + priority P2, goal kosong jadi undefined', () => {
    const r = createEpicSchema.parse({ title: 'Epic A', description: '' });
    expect(r.status).toBe('BACKLOG');
    expect(r.priority).toBe('P2');
    expect(r.description).toBeUndefined();
  });

  it('epic: menolak priority di luar P0–P3', () => {
    expect(createEpicSchema.safeParse({ title: 'x', priority: 'P9' }).success).toBe(false);
  });

  it('task: estimateHours di-coerce dari string', () => {
    const r = createTaskSchema.parse({
      storyId: '550e8400-e29b-41d4-a716-446655440000',
      title: 'T',
      estimateHours: '2.5',
    });
    expect(r.estimateHours).toBe(2.5);
  });

  it('updateStory: epicId tidak bisa diubah (di-strip)', () => {
    const r = updateStorySchema.parse({ epicId: '550e8400-e29b-41d4-a716-446655440000', title: 'baru' });
    expect('epicId' in r).toBe(false);
  });

  it('comment: body wajib dan di-trim', () => {
    expect(createCommentSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(createCommentSchema.parse({ body: ' halo ' }).body).toBe('halo');
  });
});
