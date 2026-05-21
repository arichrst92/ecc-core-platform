'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  HandHeart,
  Plus,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronRight,
  User as UserIcon,
  ScanLine,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';

// ============== Types ==============

interface PelayananLite {
  id: string;
  nama: string;
  deskripsi: string | null;
}

interface Volunteer {
  id: string;
  canScanAttendance: boolean;
  catatan: string | null;
  jemaat: { id: string; namaLengkap: string; fotoUrl: string | null; noHp: string | null };
  pelayananRole: { id: string; nama: string; level: number };
}

interface EventPelayananLink {
  id: string;
  pelayanan: PelayananLite;
  petugas: Volunteer[];
}

interface PelayananMember {
  id: string;
  isActive: boolean;
  jemaat: { id: string; namaLengkap: string; fotoUrl: string | null; noHp: string | null };
  pelayananRole: { id: string; nama: string; level: number };
}

interface PelayananDetail {
  id: string;
  nama: string;
  roles: { id: string; nama: string; level: number }[];
  jemaatPelayanan: PelayananMember[];
}

// ============== Main section ==============

export function EventMinistrySection({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [deletingLink, setDeletingLink] = useState<EventPelayananLink | null>(null);

  const linksQ = useQuery({
    queryKey: ['event', eventId, 'pelayanan'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: EventPelayananLink[] }>(
        `/admin/event/${eventId}/pelayanan`,
      );
      return res.data.data;
    },
  });

  const pelayananOptionsQ = useQuery({
    queryKey: ['pelayanan', 'options'],
    enabled: addLinkOpen,
    queryFn: async () => {
      const res = await apiClient.get<{ data: PelayananLite[] }>('/admin/pelayanan', {
        params: { limit: 100 },
      });
      return res.data.data;
    },
    staleTime: 60_000,
  });

  const linkMut = useMutation({
    mutationFn: async (pelayananId: string) =>
      apiClient.post(`/admin/event/${eventId}/pelayanan`, { pelayananId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', eventId, 'pelayanan'] });
      toast.success('Pelayanan ditautkan');
      setAddLinkOpen(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const unlinkMut = useMutation({
    mutationFn: async (linkId: string) =>
      apiClient.delete(`/admin/event/${eventId}/pelayanan/${linkId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', eventId, 'pelayanan'] });
      toast.success('Pelayanan dihapus dari event');
      setDeletingLink(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const links = linksQ.data ?? [];
  const linkedIds = new Set(links.map((l) => l.pelayanan.id));
  const availablePelayanan = (pelayananOptionsQ.data ?? []).filter(
    (p) => !linkedIds.has(p.id),
  );

  // Hitung jumlah authorized scanner total (untuk header info)
  const totalScanners = links.reduce(
    (sum, l) => sum + l.petugas.filter((p) => p.canScanAttendance).length,
    0,
  );
  const totalVolunteers = links.reduce((sum, l) => sum + l.petugas.length, 0);

  return (
    <section className="mt-6 bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
        <div>
          <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
            <HandHeart className="w-4 h-4 text-brand-500" />
            Ministry & Volunteer
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Pelayanan yang bertugas + volunteer-nya.
            {totalVolunteers > 0 && (
              <>
                {' '}
                <strong>{totalVolunteers}</strong> volunteer,{' '}
                <strong>{totalScanners}</strong> di antaranya berwenang scan.
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => setAddLinkOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg"
        >
          <Plus className="w-4 h-4" />
          Tambah Pelayanan
        </button>
      </div>

      <div className="p-6">
        {linksQ.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
          </div>
        ) : links.length === 0 ? (
          <div className="text-center py-6 text-sm">
            <p className="text-neutral-400 italic">
              Belum ada pelayanan ditautkan ke event ini.
            </p>
            <p className="text-xs text-amber-700 mt-3 bg-amber-50 border border-amber-200 rounded p-2 inline-block">
              ⚠ Event butuh kehadiran tapi tidak ada volunteer berwenang scan —
              <strong> tidak ada admin yang bisa melakukan check-in.</strong>
            </p>
          </div>
        ) : totalScanners === 0 ? (
          <>
            <div className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              ⚠ Belum ada volunteer yang ditandai sebagai authorized scanner. Tandai
              minimal satu volunteer dengan toggle <ShieldCheck className="inline w-3 h-3" />
              untuk mengaktifkan tombol Check-in.
            </div>
            <PelayananList links={links} eventId={eventId} onUnlink={setDeletingLink} />
          </>
        ) : (
          <PelayananList links={links} eventId={eventId} onUnlink={setDeletingLink} />
        )}
      </div>

      {addLinkOpen && (
        <AddLinkModal
          available={availablePelayanan}
          loading={pelayananOptionsQ.isLoading}
          submitting={linkMut.isPending}
          onClose={() => setAddLinkOpen(false)}
          onAdd={(id) => linkMut.mutate(id)}
        />
      )}

      <ConfirmDelete
        open={!!deletingLink}
        loading={unlinkMut.isPending}
        onClose={() => setDeletingLink(null)}
        title="Hapus pelayanan dari event?"
        itemName={
          deletingLink
            ? `${deletingLink.pelayanan.nama} (semua volunteer-nya juga akan dihapus)`
            : undefined
        }
        onConfirm={() => deletingLink && unlinkMut.mutate(deletingLink.id)}
      />
    </section>
  );
}

// ============== Pelayanan list ==============

function PelayananList({
  links,
  eventId,
  onUnlink,
}: {
  links: EventPelayananLink[];
  eventId: string;
  onUnlink: (l: EventPelayananLink) => void;
}) {
  return (
    <div className="space-y-3">
      {links.map((l) => (
        <PelayananCard
          key={l.id}
          link={l}
          eventId={eventId}
          onUnlink={() => onUnlink(l)}
        />
      ))}
    </div>
  );
}

function PelayananCard({
  link,
  eventId,
  onUnlink,
}: {
  link: EventPelayananLink;
  eventId: string;
  onUnlink: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [addVolunteerOpen, setAddVolunteerOpen] = useState(false);
  const [deletingVolunteer, setDeletingVolunteer] = useState<Volunteer | null>(null);
  const qc = useQueryClient();
  const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';

  const toggleScannerMut = useMutation({
    mutationFn: async ({
      petugasId,
      canScanAttendance,
    }: {
      petugasId: string;
      canScanAttendance: boolean;
    }) =>
      apiClient.patch(
        `/admin/event/${eventId}/pelayanan/${link.id}/petugas/${petugasId}`,
        { canScanAttendance },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', eventId, 'pelayanan'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const deleteVolunteerMut = useMutation({
    mutationFn: async (id: string) =>
      apiClient.delete(`/admin/event/${eventId}/pelayanan/${link.id}/petugas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', eventId, 'pelayanan'] });
      toast.success('Volunteer dihapus');
      setDeletingVolunteer(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const scannerCount = link.petugas.filter((p) => p.canScanAttendance).length;

  return (
    <div className="border border-neutral-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-3 bg-neutral-50">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-white/50 rounded-md px-1 py-0.5"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-neutral-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-neutral-400" />
          )}
          <HandHeart className="w-4 h-4 text-brand-500 shrink-0" />
          <span className="font-medium text-neutral-900 truncate">{link.pelayanan.nama}</span>
          {link.petugas.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
              <Users className="w-3 h-3" />
              {link.petugas.length}
            </span>
          )}
          {scannerCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
              <ScanLine className="w-3 h-3" />
              {scannerCount} scanner
            </span>
          )}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => {
              setExpanded(true);
              setAddVolunteerOpen(true);
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 rounded"
          >
            <Plus className="w-3 h-3" />
            Tambah Volunteer
          </button>
          <button
            onClick={onUnlink}
            className="p-1.5 hover:bg-red-50 rounded text-neutral-500 hover:text-red-600"
            title="Hapus link pelayanan (semua volunteer ikut terhapus)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-4">
          {link.petugas.length === 0 ? (
            <p className="text-sm text-neutral-400 italic text-center py-3">
              Belum ada volunteer di pelayanan ini.
            </p>
          ) : (
            <div className="space-y-2">
              {link.petugas.map((p) => (
                <VolunteerRow
                  key={p.id}
                  v={p}
                  apiBase={apiBase}
                  onToggleScanner={() =>
                    toggleScannerMut.mutate({
                      petugasId: p.id,
                      canScanAttendance: !p.canScanAttendance,
                    })
                  }
                  togglePending={toggleScannerMut.isPending}
                  onDelete={() => setDeletingVolunteer(p)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {addVolunteerOpen && (
        <AddVolunteerModal
          eventId={eventId}
          linkId={link.id}
          pelayanan={link.pelayanan}
          existingJemaatIds={new Set(link.petugas.map((p) => p.jemaat.id))}
          onClose={() => setAddVolunteerOpen(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['event', eventId, 'pelayanan'] });
            setAddVolunteerOpen(false);
          }}
        />
      )}

      <ConfirmDelete
        open={!!deletingVolunteer}
        loading={deleteVolunteerMut.isPending}
        onClose={() => setDeletingVolunteer(null)}
        title="Hapus volunteer?"
        itemName={deletingVolunteer?.jemaat.namaLengkap}
        onConfirm={() =>
          deletingVolunteer && deleteVolunteerMut.mutate(deletingVolunteer.id)
        }
      />
    </div>
  );
}

function VolunteerRow({
  v,
  apiBase,
  onToggleScanner,
  togglePending,
  onDelete,
}: {
  v: Volunteer;
  apiBase: string;
  onToggleScanner: () => void;
  togglePending: boolean;
  onDelete: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 border rounded-lg ${
        v.canScanAttendance
          ? 'border-green-200 bg-green-50/30'
          : 'border-neutral-100 hover:bg-neutral-50'
      }`}
    >
      {v.jemaat.fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${apiBase}${v.jemaat.fotoUrl}`}
          alt={v.jemaat.namaLengkap}
          className="w-9 h-9 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
          <UserIcon className="w-4 h-4" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/dashboard/jemaat/${v.jemaat.id}`}
            className="font-medium text-neutral-900 hover:text-brand-600 hover:underline text-sm truncate"
          >
            {v.jemaat.namaLengkap}
          </Link>
          <span className="inline-block px-1.5 py-0.5 text-[10px] bg-blue-50 text-blue-700 rounded">
            {v.pelayananRole.nama}
          </span>
          {v.canScanAttendance && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase bg-green-600 text-white px-1.5 py-0.5 rounded">
              <ShieldCheck className="w-3 h-3" />
              Scanner
            </span>
          )}
        </div>
        {v.catatan && (
          <div className="text-xs text-neutral-500 italic mt-0.5">{v.catatan}</div>
        )}
      </div>
      <button
        onClick={onToggleScanner}
        disabled={togglePending}
        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded disabled:opacity-50 ${
          v.canScanAttendance
            ? 'text-green-700 bg-green-100 hover:bg-green-200'
            : 'text-neutral-600 hover:bg-neutral-100 border border-neutral-300'
        }`}
        title={
          v.canScanAttendance
            ? 'Cabut wewenang scan'
            : 'Beri wewenang scan check-in'
        }
      >
        <ShieldCheck className="w-3 h-3" />
        {v.canScanAttendance ? 'Bisa Scan' : 'Beri akses scan'}
      </button>
      <button
        onClick={onDelete}
        className="p-1.5 hover:bg-red-50 rounded text-neutral-500 hover:text-red-600 shrink-0"
        title="Hapus volunteer"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ============== Modals ==============

function AddLinkModal({
  available,
  loading,
  submitting,
  onClose,
  onAdd,
}: {
  available: PelayananLite[];
  loading: boolean;
  submitting: boolean;
  onClose: () => void;
  onAdd: (pelayananId: string) => void;
}) {
  const [pelayananId, setPelayananId] = useState('');
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900">Tambah Pelayanan ke Event</h2>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Pelayanan</span>
              <select
                value={pelayananId}
                onChange={(e) => setPelayananId(e.target.value)}
                disabled={loading}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 bg-white disabled:opacity-50"
              >
                <option value="">{loading ? 'Memuat...' : '— pilih pelayanan —'}</option>
                {available.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama}
                  </option>
                ))}
              </select>
              {!loading && available.length === 0 && (
                <span className="block mt-1 text-xs text-neutral-500">
                  Semua pelayanan sudah ter-link ke event ini.
                </span>
              )}
            </label>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Batal
            </button>
            <button
              onClick={() => onAdd(pelayananId)}
              disabled={!pelayananId || submitting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Tautkan
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function AddVolunteerModal({
  eventId,
  linkId,
  pelayanan,
  existingJemaatIds,
  onClose,
  onSuccess,
}: {
  eventId: string;
  linkId: string;
  pelayanan: PelayananLite;
  existingJemaatIds: Set<string>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [search, setSearch] = useState('');
  // Map jemaatId → { roleId, canScan }
  const [selected, setSelected] = useState<
    Record<string, { roleId: string; canScan: boolean }>
  >({});
  const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';

  const pelayananQ = useQuery({
    queryKey: ['pelayanan', 'detail', pelayanan.id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PelayananDetail }>(
        `/admin/pelayanan/${pelayanan.id}`,
      );
      return res.data.data;
    },
  });

  const roles = pelayananQ.data?.roles ?? [];
  const allMembers = pelayananQ.data?.jemaatPelayanan ?? [];
  const candidates = allMembers.filter(
    (m) => m.isActive && !existingJemaatIds.has(m.jemaat.id),
  );
  const filtered = search.trim()
    ? candidates.filter((m) =>
        m.jemaat.namaLengkap.toLowerCase().includes(search.toLowerCase()),
      )
    : candidates;

  const selectedIds = Object.keys(selected);

  function toggleJemaat(m: PelayananMember) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[m.jemaat.id]) {
        delete next[m.jemaat.id];
      } else {
        next[m.jemaat.id] = { roleId: m.pelayananRole.id, canScan: false };
      }
      return next;
    });
  }

  function changeRole(jemaatId: string, roleId: string) {
    setSelected((prev) => ({
      ...prev,
      [jemaatId]: { ...prev[jemaatId]!, roleId },
    }));
  }

  function toggleCanScan(jemaatId: string) {
    setSelected((prev) => ({
      ...prev,
      [jemaatId]: { ...prev[jemaatId]!, canScan: !prev[jemaatId]!.canScan },
    }));
  }

  const batchMut = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(
        selectedIds.map((jemaatId) =>
          apiClient.post(`/admin/event/${eventId}/pelayanan/${linkId}/petugas`, {
            jemaatId,
            pelayananRoleId: selected[jemaatId]!.roleId,
            canScanAttendance: selected[jemaatId]!.canScan,
          }),
        ),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      return { succeeded: results.length - failed, failed };
    },
    onSuccess: ({ succeeded, failed }) => {
      if (failed === 0) toast.success(`${succeeded} volunteer ditambah`);
      else toast.error(`${succeeded} sukses, ${failed} gagal`);
      onSuccess();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl pointer-events-auto max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <div>
              <h2 className="font-semibold text-neutral-900">Tambah Volunteer</h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Pilih member <strong>{pelayanan.nama}</strong>. Toggle{' '}
                <ShieldCheck className="inline w-3 h-3 text-green-600" /> untuk
                memberi wewenang scan check-in.
              </p>
            </div>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-6 pt-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter nama..."
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
            />
            {selectedIds.length > 0 && (
              <div className="mt-2 text-xs text-brand-600 font-medium">
                {selectedIds.length} dipilih ·{' '}
                {selectedIds.filter((id) => selected[id]!.canScan).length} jadi scanner
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {pelayananQ.isLoading ? (
              <div className="text-center py-8">
                <Loader2 className="w-5 h-5 mx-auto animate-spin text-neutral-400" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-sm text-neutral-400">
                {candidates.length === 0
                  ? `Tidak ada member ${pelayanan.nama} yang tersedia. Tambah member dari halaman jemaat.`
                  : 'Tidak ada yang cocok dengan filter.'}
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map((m) => {
                  const isSelected = !!selected[m.jemaat.id];
                  const sel = selected[m.jemaat.id];
                  return (
                    <div
                      key={m.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border transition ${
                        isSelected
                          ? 'border-brand-300 bg-brand-50/50'
                          : 'border-neutral-100 hover:bg-neutral-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleJemaat(m)}
                        className="w-4 h-4 accent-brand-500 shrink-0 cursor-pointer"
                      />
                      {m.jemaat.fotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`${apiBase}${m.jemaat.fotoUrl}`}
                          alt={m.jemaat.namaLengkap}
                          className="w-8 h-8 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center shrink-0 text-xs font-semibold">
                          {m.jemaat.namaLengkap.charAt(0)}
                        </div>
                      )}
                      <div
                        onClick={() => toggleJemaat(m)}
                        className="flex-1 min-w-0 cursor-pointer"
                      >
                        <div className="text-sm font-medium text-neutral-900 truncate">
                          {m.jemaat.namaLengkap}
                        </div>
                        <div className="text-xs text-neutral-500">
                          Default: {m.pelayananRole.nama}
                        </div>
                      </div>
                      {isSelected && sel && (
                        <>
                          <select
                            value={sel.roleId}
                            onChange={(e) => changeRole(m.jemaat.id, e.target.value)}
                            className="text-xs px-2 py-1 border border-neutral-300 rounded bg-white shrink-0"
                          >
                            {roles.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.nama}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => toggleCanScan(m.jemaat.id)}
                            className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded shrink-0 ${
                              sel.canScan
                                ? 'text-green-700 bg-green-100'
                                : 'text-neutral-500 border border-neutral-300'
                            }`}
                            title={sel.canScan ? 'Bisa scan' : 'Tidak bisa scan'}
                          >
                            <ShieldCheck className="w-3 h-3" />
                            {sel.canScan ? 'Scan' : 'No-scan'}
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onClose}
              disabled={batchMut.isPending}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Batal
            </button>
            <button
              onClick={() => batchMut.mutate()}
              disabled={selectedIds.length === 0 || batchMut.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {batchMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Tambah {selectedIds.length > 0 && `(${selectedIds.length})`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
