/**
 * GET /admin/pending-counts — jumlah request yang menunggu tindakan admin,
 * untuk badge di menu Portal (grup & menu tujuan). Hanya menu yang boleh
 * dibaca pengguna yang dihitung; selebihnya tidak dikirim.
 *
 *   volunteer       Permintaan Volunteer   PENDING (sesuai otoritas approval)
 *   feedback        Kritik & Saran         BARU (belum dibalas)
 *   prayer          Prayer Request         BARU (belum ditugaskan)
 *   tamu            Tamu                   belum ada petugas follow-up
 *   jemaatDuplicate Jemaat → Cek Duplikat  kandidat akun ganda OPEN
 *   sjRequest       Spiritual Journey      request langkah rohani PENDING
 *   eventPayment    Event                  peserta dengan bukti transfer menunggu verifikasi
 *   groupJoin       Group                  permintaan bergabung group PENDING (Group tulis)
 *   groupApproval   Group                  pengajuan group baru dari app menunggu persetujuan (Group tulis)
 *   homecellLokasi  Homecell               homecell aktif yang titik lokasinya salah di peta
 *
 * Murah: hanya COUNT berindeks; Portal memanggil tiap 60 detik + saat pindah halaman.
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { Unauthorized } from '../../lib/errors.js';
import { resolveJemaatAccess } from '../../lib/menu-access.js';
import { logger } from '../../lib/logger.js';
import { approvalScope, scopeRequestWhere } from './ministry.js';
import { pendingPaymentTotal } from '../../lib/event-payment-pending.js';
import { homecellLokasiIssues } from '../../lib/homecell-location.js';

export const pendingCountsRouter = Router();

pendingCountsRouter.get('/', async (req, res) => {
  if (!req.user) throw Unauthorized();
  // Role Access berlaku penuh (juga untuk Fulltimer).
  const access = (await resolveJemaatAccess(req.user.jemaatId)).menuAccess;
  const can = (menu: string) => !!access[menu]?.canRead;

  const jobs: Record<string, () => Promise<number>> = {};
  if (can('ministry-join-requests')) {
    jobs.volunteer = async () => {
      const scope = await approvalScope(req, { level: 'read' });
      if (scope !== 'ALL' && scope.size === 0) return 0;
      return prisma.pelayananJoinRequest.count({ where: { status: 'PENDING', ...scopeRequestWhere(scope) } });
    };
  }
  if (can('feedback')) jobs.feedback = () => prisma.feedback.count({ where: { status: 'BARU' } });
  if (can('prayer-request')) jobs.prayer = () => prisma.prayerRequest.count({ where: { status: 'BARU', deletedAt: null } });
  if (can('tamu')) {
    jobs.tamu = () =>
      prisma.jemaat.count({
        where: {
          isTamu: true,
          isActive: true,
          dataPurgedAt: null,
          tamuFollowupById: null,
          OR: [{ tamuStatus: null }, { tamuStatus: { in: ['DIUNDANG', 'TERLIBAT'] } }],
        },
      });
  }
  if (can('jemaat')) jobs.jemaatDuplicate = () => prisma.duplicateCandidate.count({ where: { status: 'OPEN' } });
  if (can('spiritual-journey-request')) jobs.sjRequest = () => prisma.spiritualJourneyRequest.count({ where: { status: 'PENDING' } });
  if (can('event') && access['event-payment']?.canWrite) {
    // Sama dengan badge per event di daftar Event (dihitung per peserta).
    jobs.eventPayment = () => pendingPaymentTotal();
  }

  if (can('group') && access['group']?.canWrite) {
    jobs.groupJoin = () => prisma.groupJoinRequest.count({ where: { status: 'PENDING', group: { isActive: true } } });
    jobs.groupApproval = () => prisma.group.count({ where: { approvalStatus: 'PENDING', isActive: true } });
  }
  if (can('homecell')) {
    jobs.homecellLokasi = async () => {
      let n = 0;
      for (const i of (await homecellLokasiIssues({ isActive: true })).values()) if (i.serius) n++;
      return n;
    };
  }

  const entries = await Promise.all(
    Object.entries(jobs).map(async ([k, fn]) => {
      try {
        return [k, await fn()] as const;
      } catch (err) {
        // Satu hitungan gagal tidak boleh membuat badge lain hilang.
        logger.warn({ err, key: k }, '[pending-counts] gagal menghitung');
        return [k, 0] as const;
      }
    }),
  );
  res.json({ success: true, data: Object.fromEntries(entries) });
});
