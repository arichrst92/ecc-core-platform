'use client';

/**
 * Konfirmasi hapus jadwal pertemuan homecell (portal).
 * Kalau sudah ada kehadiran → peringatan + `?force=true`: kehadiran & file
 * materi pertemuan ikut terhapus permanen.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { parseYmd } from '@/lib/dates';

export interface DeletableSchedule {
  id: string;
  tanggal: string;
  lokasi: string | null;
  attendanceCount: number;
  fileCount?: number;
}

export function DeleteScheduleDialog({
  homecellId,
  schedule,
  onClose,
  onDeleted,
}: {
  homecellId: string;
  schedule: DeletableSchedule | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async (s: DeletableSchedule) =>
      apiClient.delete(`/admin/homecell/${homecellId}/schedule/${s.id}`, {
        params: s.attendanceCount > 0 ? { force: 'true' } : undefined,
      }),
    onSuccess: () => {
      toast.success('Jadwal pertemuan dihapus');
      void qc.invalidateQueries({ queryKey: ['homecell'] });
      onClose();
      onDeleted?.();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal menghapus jadwal'),
  });

  if (!schedule) return null;
  const tgl = parseYmd(schedule.tanggal).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={mut.isPending ? undefined : onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto p-6">
          <div className="w-11 h-11 rounded-full bg-red-50 flex items-center justify-center mb-3">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold text-neutral-900">Hapus jadwal pertemuan?</h2>
          <p className="text-sm text-neutral-600 mt-1">
            {tgl}
            {schedule.lokasi ? ` · ${schedule.lokasi}` : ''}
          </p>
          {schedule.attendanceCount > 0 || (schedule.fileCount ?? 0) > 0 ? (
            <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-amber-50 text-amber-800 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                Ikut terhapus permanen:
                <ul className="list-disc pl-5 mt-1">
                  {schedule.attendanceCount > 0 && <li>{schedule.attendanceCount} data kehadiran anggota</li>}
                  {(schedule.fileCount ?? 0) > 0 && <li>{schedule.fileCount} file materi pertemuan</li>}
                </ul>
                <div className="mt-1 text-xs">Statistik &ldquo;terakhir hadir homecell&rdquo; anggota ikut berubah.</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-500 mt-3">Belum ada kehadiran tercatat di pertemuan ini.</p>
          )}
          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={onClose}
              disabled={mut.isPending}
              className="px-4 py-2 text-sm rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
            >
              Batal
            </button>
            <button
              onClick={() => mut.mutate(schedule)}
              disabled={mut.isPending}
              className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Hapus
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
