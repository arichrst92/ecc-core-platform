'use client';

/**
 * Hero image group. Hanya PIC group yang boleh ganti/hapus
 * (kalau group belum punya PIC: admin fulltimer).
 * API: POST/DELETE /admin/group/:id/hero
 */
import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, Trash2, UsersRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';
const href = (u: string) => (/^https?:\/\//.test(u) ? u : `${apiBase}${u}`);

export function GroupHero({
  groupId,
  nama,
  heroImageUrl,
  picJemaatId,
}: {
  groupId: string;
  nama: string;
  heroImageUrl: string | null;
  picJemaatId: string | null;
}) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canEdit = !!user && (picJemaatId ? picJemaatId === user.jemaatId : user.isFulltimer);
  const ref = useRef<HTMLInputElement>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['group', 'detail', groupId] });

  const uploadMut = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData();
      fd.append('file', f);
      return apiClient.post(`/admin/group/${groupId}/hero`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120_000,
      });
    },
    onSuccess: () => {
      toast.success('Gambar group diperbarui');
      refresh();
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal upload gambar'),
  });
  const deleteMut = useMutation({
    mutationFn: async () => apiClient.delete(`/admin/group/${groupId}/hero`),
    onSuccess: () => {
      toast.success('Gambar group dihapus');
      refresh();
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal menghapus'),
  });
  const busy = uploadMut.isPending || deleteMut.isPending;

  if (!heroImageUrl && !canEdit) return null;

  return (
    <div className="relative w-full h-48 md:h-64 rounded-2xl overflow-hidden bg-gradient-to-br from-brand-400 to-brand-600">
      {heroImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={href(heroImageUrl)} alt={nama} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-white/90 gap-2">
          <UsersRound className="w-10 h-10" />
          <span className="text-sm">Belum ada gambar group</span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
      <h2 className="absolute bottom-3 left-4 right-40 text-white text-xl font-bold drop-shadow truncate">{nama}</h2>
      {canEdit && (
        <div className="absolute bottom-3 right-3 flex gap-2">
          <input
            ref={ref}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadMut.mutate(f);
              e.target.value = '';
            }}
          />
          {heroImageUrl && (
            <button
              onClick={() => deleteMut.mutate()}
              disabled={busy}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white/90 hover:bg-white text-red-600 rounded-lg disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Hapus
            </button>
          )}
          <button
            onClick={() => ref.current?.click()}
            disabled={busy}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white/90 hover:bg-white text-neutral-800 rounded-lg disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
            {heroImageUrl ? 'Ganti gambar' : 'Tambah gambar'}
          </button>
        </div>
      )}
    </div>
  );
}
