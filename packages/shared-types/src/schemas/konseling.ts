/** Konseling (2026-12) — permintaan konseling dari app, ditugaskan admin Portal. */
import { z } from 'zod';

export const KONSELING_STATUS = ['BARU', 'DITUGASKAN', 'DIJADWALKAN', 'SELESAI', 'DIBATALKAN'] as const;
export type KonselingStatus = (typeof KONSELING_STATUS)[number];
export const KONSELING_STATUS_LABEL: Record<KonselingStatus, string> = {
  BARU: 'Menunggu konselor',
  DITUGASKAN: 'Konselor ditugaskan',
  DIJADWALKAN: 'Terjadwal',
  SELESAI: 'Selesai',
  DIBATALKAN: 'Dibatalkan',
};
export const KONSELING_GENDER_PREF = ['ANY', 'SAME'] as const;

const optDate = z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullish());

/** App: ajukan konseling. Kontak hanya dibagikan bila disetujui. */
export const createKonselingSchema = z.object({
  pokokMasalah: z.string().trim().min(10, 'Ceritakan pokok masalah minimal 10 karakter.').max(5000),
  harapan: z.string().trim().min(5, 'Tulis harapan Anda minimal 5 karakter.').max(3000),
  jadwalUsulan: optDate,
  catatanJadwal: z.string().trim().max(500).nullish(),
  preferensiGender: z.enum(KONSELING_GENDER_PREF).default('ANY'),
  setujuBagikanKontak: z.literal(true, { errorMap: () => ({ message: 'Setujui pembagian kontak ke konselor untuk melanjutkan.' }) }),
});
export type CreateKonselingInput = z.infer<typeof createKonselingSchema>;

export const cancelKonselingSchema = z.object({ alasan: z.string().trim().max(1000).nullish() });

/** Konselor: tetapkan jadwal final. */
export const scheduleKonselingSchema = z.object({
  jadwalFinal: z.coerce.date(),
  catatanKonselor: z.string().trim().max(2000).nullish(),
});

/** Konselor: tandai selesai. */
export const doneKonselingSchema = z.object({ catatanKonselor: z.string().trim().max(2000).nullish() });

/** Portal: tugaskan konselor. */
export const assignKonselingSchema = z.object({ konselorId: z.string().uuid() });

/** Portal: pelayanan sumber konselor. */
export const konselingConfigSchema = z.object({
  ministries: z.array(z.object({ pelayananId: z.string().uuid(), pelayananRoleId: z.string().uuid().nullish() })).max(50),
});
