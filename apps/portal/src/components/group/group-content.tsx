'use client';

/**
 * Konten group: Pengumuman, Voting, File (nama + deskripsi).
 * PIC / admin bisa membuat & mengelola; anggota melihat & memilih di aplikasi.
 * API: /admin/group/:id/{announcements,polls,files}
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  FileImage,
  FileText,
  Loader2,
  Lock,
  Megaphone,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Trash2,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';

type Person = { id: string; namaLengkap: string } | null;

interface Announcement {
  id: string;
  judul: string;
  isi: string;
  isPinned: boolean;
  createdAt: string;
  createdBy: Person;
}
interface PollOption {
  id: string;
  label: string;
  count: number | null;
  voters?: { id: string; namaLengkap: string }[];
}
interface Poll {
  id: string;
  pertanyaan: string;
  deskripsi: string | null;
  multiple: boolean;
  closesAt: string | null;
  isClosed: boolean;
  isOpen: boolean;
  createdAt: string;
  createdBy: Person;
  totalVoters: number;
  myVotes: string[];
  showResults: boolean;
  options: PollOption[];
}
interface GroupFile {
  id: string;
  nama: string;
  deskripsi: string | null;
  fileUrl: string;
  fileMime: string;
  fileName: string | null;
  fileSize: number | null;
  createdAt: string;
  uploadedBy: Person;
}
type ListResp<T> = { data: T[]; meta?: { canManage?: boolean } };

const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';
const href = (u: string) => (/^https?:\/\//.test(u) ? u : `${apiBase}${u}`);
const size = (b: number | null) =>
  b == null ? '' : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
const fmt = (d: string) => new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const errMsg = (e: any, f = 'Gagal') => e?.response?.data?.error?.message ?? f;
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';

const inputCls =
  'mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm';

type Tab = 'announcements' | 'polls' | 'files';

export function GroupContentSection({ groupId }: { groupId: string }) {
  const [tab, setTab] = useState<Tab>('announcements');
  const tabs: { key: Tab; label: string; icon: typeof Megaphone }[] = [
    { key: 'announcements', label: 'Pengumuman', icon: Megaphone },
    { key: 'polls', label: 'Voting', icon: BarChart3 },
    { key: 'files', label: 'File', icon: Paperclip },
  ];
  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="flex border-b border-neutral-100 px-2">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
              tab === key ? 'border-brand-500 text-brand-600' : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>
      {tab === 'announcements' && <AnnouncementsTab groupId={groupId} />}
      {tab === 'polls' && <PollsTab groupId={groupId} />}
      {tab === 'files' && <FilesTab groupId={groupId} />}
    </div>
  );
}

function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg pointer-events-auto max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900">{title}</h2>
            <button onClick={onClose} className="p-1 hover:bg-neutral-100 rounded">
              <X className="w-4 h-4 text-neutral-500" />
            </button>
          </div>
          <div className="p-6 space-y-4 overflow-y-auto">{children}</div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">{footer}</div>
        </div>
      </div>
    </>
  );
}

function SaveBtn({ onClick, disabled, loading, label = 'Simpan' }: { onClick: () => void; disabled?: boolean; loading?: boolean; label?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {label}
    </button>
  );
}

function Header({ text, onAdd, addLabel, canManage }: { text: string; onAdd: () => void; addLabel: string; canManage: boolean }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 gap-2 flex-wrap">
      <p className="text-xs text-neutral-500">{text}</p>
      {canManage && (
        <button
          onClick={onAdd}
          className="flex items-center gap-2 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg"
        >
          <Plus className="w-4 h-4" /> {addLabel}
        </button>
      )}
    </div>
  );
}

const Loading = () => (
  <div className="flex justify-center py-8">
    <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
  </div>
);
const Empty = ({ text }: { text: string }) => <p className="text-sm text-neutral-400 italic text-center py-8">{text}</p>;

// ============================================================ Pengumuman

function AnnouncementsTab({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const key = ['group', 'announcements', groupId];
  const base = `/admin/group/${groupId}/announcements`;
  const q = useQuery({ queryKey: key, queryFn: async () => (await apiClient.get<ListResp<Announcement>>(base)).data, retry: false });
  const [form, setForm] = useState<{ item: Announcement | null } | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const canManage = !!q.data?.meta?.canManage;
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const pinMut = useMutation({
    mutationFn: async (a: Announcement) => apiClient.patch(`${base}/${a.id}`, { isPinned: !a.isPinned }),
    onSuccess: refresh,
    onError: (e) => toast.error(errMsg(e)),
  });
  const delMut = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`${base}/${id}`),
    onSuccess: () => {
      toast.success('Pengumuman dihapus');
      setDeleting(null);
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (q.isError) return <Empty text={errMsg(q.error, 'Tidak bisa memuat pengumuman.')} />;
  const rows = q.data?.data ?? [];
  return (
    <div>
      <Header
        text="Pengumuman dikirim sebagai notifikasi ke semua anggota group."
        onAdd={() => setForm({ item: null })}
        addLabel="Buat Pengumuman"
        canManage={canManage}
      />
      {q.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty text="Belum ada pengumuman." />
      ) : (
        <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
          {rows.map((a) => (
            <li key={a.id} className={`px-5 py-4 ${a.isPinned ? 'bg-amber-50/60' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {a.isPinned && <Pin className="w-3.5 h-3.5 text-amber-600" />}
                    <h3 className="text-sm font-semibold text-neutral-900">{a.judul}</h3>
                  </div>
                  <p className="text-sm text-neutral-700 mt-1 whitespace-pre-line">{a.isi}</p>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    {[a.createdBy?.namaLengkap, fmt(a.createdAt)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <button onClick={() => pinMut.mutate(a)} className="p-1.5 rounded hover:bg-neutral-100 text-neutral-500" title={a.isPinned ? 'Lepas sematan' : 'Sematkan'}>
                      {a.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => setForm({ item: a })} className="p-1.5 rounded hover:bg-neutral-100 text-neutral-500" title="Ubah">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleting(a)} className="p-1.5 rounded hover:bg-red-50 text-neutral-500 hover:text-red-600" title="Hapus">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {form && <AnnouncementForm base={base} item={form.item} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />}
      <ConfirmDelete
        open={!!deleting}
        loading={delMut.isPending}
        onClose={() => setDeleting(null)}
        title="Hapus pengumuman?"
        itemName={deleting?.judul}
        onConfirm={() => deleting && delMut.mutate(deleting.id)}
      />
    </div>
  );
}

function AnnouncementForm({ base, item, onClose, onSaved }: { base: string; item: Announcement | null; onClose: () => void; onSaved: () => void }) {
  const [judul, setJudul] = useState(item?.judul ?? '');
  const [isi, setIsi] = useState(item?.isi ?? '');
  const [isPinned, setPinned] = useState(item?.isPinned ?? false);
  const [notify, setNotify] = useState(true);
  const mut = useMutation({
    mutationFn: async () =>
      item
        ? apiClient.patch(`${base}/${item.id}`, { judul: judul.trim(), isi: isi.trim(), isPinned })
        : apiClient.post(base, { judul: judul.trim(), isi: isi.trim(), isPinned, notify }),
    onSuccess: () => {
      toast.success(item ? 'Pengumuman diperbarui' : 'Pengumuman dibuat');
      onSaved();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menyimpan')),
  });
  return (
    <Modal
      title={item ? 'Ubah Pengumuman' : 'Buat Pengumuman'}
      onClose={onClose}
      footer={<SaveBtn onClick={() => mut.mutate()} loading={mut.isPending} disabled={judul.trim().length < 2 || !isi.trim()} />}
    >
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Judul</span>
        <input value={judul} onChange={(e) => setJudul(e.target.value)} maxLength={200} className={inputCls} placeholder="Mis. Latihan dipindah ke Sabtu" />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Isi</span>
        <textarea value={isi} onChange={(e) => setIsi(e.target.value)} rows={6} maxLength={5000} className={inputCls} />
      </label>
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" checked={isPinned} onChange={(e) => setPinned(e.target.checked)} /> Sematkan di atas
      </label>
      {!item && (
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Kirim notifikasi ke anggota
        </label>
      )}
    </Modal>
  );
}

// ============================================================ Voting

function PollsTab({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const key = ['group', 'polls', groupId];
  const base = `/admin/group/${groupId}/polls`;
  const q = useQuery({ queryKey: key, queryFn: async () => (await apiClient.get<ListResp<Poll>>(base)).data, retry: false });
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Poll | null>(null);
  const [showVoters, setShowVoters] = useState<Poll | null>(null);
  const canManage = !!q.data?.meta?.canManage;
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const closeMut = useMutation({
    mutationFn: async (p: Poll) => apiClient.patch(`${base}/${p.id}`, { isClosed: !p.isClosed }),
    onSuccess: refresh,
    onError: (e) => toast.error(errMsg(e)),
  });
  const delMut = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`${base}/${id}`),
    onSuccess: () => {
      toast.success('Voting dihapus');
      setDeleting(null);
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (q.isError) return <Empty text={errMsg(q.error, 'Tidak bisa memuat voting.')} />;
  const rows = q.data?.data ?? [];
  return (
    <div>
      <Header
        text="Anggota memilih lewat aplikasi. Hasil terlihat oleh anggota setelah mereka memilih."
        onAdd={() => setCreating(true)}
        addLabel="Buat Voting"
        canManage={canManage}
      />
      {q.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty text="Belum ada voting." />
      ) : (
        <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
          {rows.map((p) => {
            const max = Math.max(1, ...p.options.map((o) => o.count ?? 0));
            return (
              <li key={p.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-neutral-900">{p.pertanyaan}</h3>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${p.isOpen ? 'bg-green-100 text-green-700' : 'bg-neutral-200 text-neutral-600'}`}>
                        {p.isOpen ? 'Terbuka' : 'Ditutup'}
                      </span>
                      {p.multiple && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">Pilihan ganda</span>}
                    </div>
                    {p.deskripsi && <p className="text-xs text-neutral-600 mt-1 whitespace-pre-line">{p.deskripsi}</p>}
                    <div className="mt-3 space-y-2">
                      {p.options.map((o) => (
                        <div key={o.id}>
                          <div className="flex justify-between text-xs text-neutral-700">
                            <span>{o.label}</span>
                            <span className="font-semibold">{o.count ?? '–'}</span>
                          </div>
                          <div className="h-2 bg-neutral-100 rounded-full overflow-hidden mt-1">
                            <div className="h-full bg-brand-500 rounded-full" style={{ width: `${((o.count ?? 0) / max) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-neutral-400 mt-2">
                      {[
                        `${p.totalVoters} pemilih`,
                        p.closesAt ? `batas ${fmt(p.closesAt)}` : null,
                        p.createdBy?.namaLengkap,
                        fmt(p.createdAt),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex gap-1">
                      <button onClick={() => setShowVoters(p)} className="p-1.5 rounded hover:bg-neutral-100 text-neutral-500 text-xs" title="Lihat pemilih">
                        <BarChart3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => closeMut.mutate(p)} className="p-1.5 rounded hover:bg-neutral-100 text-neutral-500" title={p.isClosed ? 'Buka lagi' : 'Tutup voting'}>
                        {p.isClosed ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => setDeleting(p)} className="p-1.5 rounded hover:bg-red-50 text-neutral-500 hover:text-red-600" title="Hapus">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {creating && <PollForm base={base} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); refresh(); }} />}
      {showVoters && (
        <Modal title={`Pemilih — ${showVoters.pertanyaan}`} onClose={() => setShowVoters(null)} footer={null}>
          {showVoters.options.map((o) => (
            <div key={o.id}>
              <div className="text-sm font-semibold text-neutral-900">
                {o.label} <span className="text-neutral-400 font-normal">({o.voters?.length ?? 0})</span>
              </div>
              <p className="text-xs text-neutral-600 mt-0.5">
                {o.voters && o.voters.length ? o.voters.map((v) => v.namaLengkap).join(', ') : '—'}
              </p>
            </div>
          ))}
        </Modal>
      )}
      <ConfirmDelete
        open={!!deleting}
        loading={delMut.isPending}
        onClose={() => setDeleting(null)}
        title="Hapus voting? Semua suara ikut terhapus."
        itemName={deleting?.pertanyaan}
        onConfirm={() => deleting && delMut.mutate(deleting.id)}
      />
    </div>
  );
}

function PollForm({ base, onClose, onSaved }: { base: string; onClose: () => void; onSaved: () => void }) {
  const [pertanyaan, setPertanyaan] = useState('');
  const [deskripsi, setDeskripsi] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [closesAt, setClosesAt] = useState('');
  const [notify, setNotify] = useState(true);
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const mut = useMutation({
    mutationFn: async () =>
      apiClient.post(base, {
        pertanyaan: pertanyaan.trim(),
        deskripsi: deskripsi.trim() || null,
        options: filled,
        multiple,
        closesAt: closesAt ? new Date(closesAt).toISOString() : null,
        notify,
      }),
    onSuccess: () => {
      toast.success('Voting dibuat');
      onSaved();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menyimpan')),
  });
  return (
    <Modal
      title="Buat Voting"
      onClose={onClose}
      footer={<SaveBtn onClick={() => mut.mutate()} loading={mut.isPending} disabled={pertanyaan.trim().length < 3 || filled.length < 2} />}
    >
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Pertanyaan</span>
        <input value={pertanyaan} onChange={(e) => setPertanyaan(e.target.value)} maxLength={300} className={inputCls} placeholder="Mis. Jadwal latihan yang paling cocok?" />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Keterangan (opsional)</span>
        <textarea value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} rows={2} className={inputCls} />
      </label>
      <div>
        <span className="text-sm font-medium text-neutral-700">Opsi (2–10)</span>
        <div className="space-y-2 mt-1">
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={o}
                onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
                maxLength={200}
                placeholder={`Opsi ${i + 1}`}
                className={inputCls.replace('mt-1 ', '')}
              />
              {options.length > 2 && (
                <button onClick={() => setOptions(options.filter((_, j) => j !== i))} className="p-2 text-neutral-400 hover:text-red-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {options.length < 10 && (
          <button onClick={() => setOptions([...options, ''])} className="mt-2 text-sm text-brand-600 hover:underline flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Tambah opsi
          </button>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} /> Boleh memilih lebih dari satu
      </label>
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Batas waktu (opsional)</span>
        <input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className={inputCls} />
      </label>
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Kirim notifikasi ke anggota
      </label>
    </Modal>
  );
}

// ============================================================ File

function FilesTab({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const key = ['group', 'files', groupId];
  const base = `/admin/group/${groupId}/files`;
  const q = useQuery({ queryKey: key, queryFn: async () => (await apiClient.get<ListResp<GroupFile>>(base)).data, retry: false });
  const [form, setForm] = useState<{ item: GroupFile | null } | null>(null);
  const [deleting, setDeleting] = useState<GroupFile | null>(null);
  const canManage = !!q.data?.meta?.canManage;
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const delMut = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`${base}/${id}`),
    onSuccess: () => {
      toast.success('File dihapus');
      setDeleting(null);
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (q.isError) return <Empty text={errMsg(q.error, 'Tidak bisa memuat file.')} />;
  const rows = q.data?.data ?? [];
  return (
    <div>
      <Header
        text="File bisa dilihat & dibuka semua anggota group di aplikasi."
        onAdd={() => setForm({ item: null })}
        addLabel="Upload File"
        canManage={canManage}
      />
      {q.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty text="Belum ada file." />
      ) : (
        <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
          {rows.map((f) => {
            const Icon = f.fileMime.startsWith('image/') ? FileImage : FileText;
            return (
              <li key={f.id} className="flex items-start gap-3 px-5 py-3">
                <Icon className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <a href={href(f.fileUrl)} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-neutral-900 hover:text-brand-600 hover:underline">
                    {f.nama}
                  </a>
                  {f.deskripsi ? <p className="text-xs text-neutral-600 mt-0.5 whitespace-pre-line">{f.deskripsi}</p> : null}
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    {[f.fileName, size(f.fileSize), f.uploadedBy?.namaLengkap, fmt(f.createdAt)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {canManage && (
                  <>
                    <button onClick={() => setForm({ item: f })} className="p-1.5 rounded hover:bg-neutral-100 text-neutral-500" title="Ubah nama / deskripsi">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleting(f)} className="p-1.5 rounded hover:bg-red-50 text-neutral-500 hover:text-red-600" title="Hapus">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {form && <FileForm base={base} item={form.item} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />}
      <ConfirmDelete
        open={!!deleting}
        loading={delMut.isPending}
        onClose={() => setDeleting(null)}
        title="Hapus file?"
        itemName={deleting?.nama}
        onConfirm={() => deleting && delMut.mutate(deleting.id)}
      />
    </div>
  );
}

function FileForm({ base, item, onClose, onSaved }: { base: string; item: GroupFile | null; onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [nama, setNama] = useState(item?.nama ?? '');
  const [deskripsi, setDeskripsi] = useState(item?.deskripsi ?? '');
  const [file, setFile] = useState<File | null>(null);
  const mut = useMutation({
    mutationFn: async () => {
      if (item) return apiClient.patch(`${base}/${item.id}`, { nama: nama.trim(), deskripsi: deskripsi.trim() || null });
      const fd = new FormData();
      fd.append('nama', nama.trim());
      if (deskripsi.trim()) fd.append('deskripsi', deskripsi.trim());
      fd.append('file', file!);
      return apiClient.post(base, fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180_000 });
    },
    onSuccess: () => {
      toast.success(item ? 'File diperbarui' : 'File diupload');
      onSaved();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menyimpan')),
  });
  return (
    <Modal
      title={item ? 'Ubah File' : 'Upload File'}
      onClose={mut.isPending ? () => undefined : onClose}
      footer={<SaveBtn onClick={() => mut.mutate()} loading={mut.isPending} disabled={nama.trim().length < 2 || (!item && !file)} />}
    >
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Nama File</span>
        <input value={nama} onChange={(e) => setNama(e.target.value)} maxLength={200} className={inputCls} placeholder="Mis. Partitur lagu Minggu ini" />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Deskripsi (opsional)</span>
        <textarea value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} rows={3} maxLength={2000} className={inputCls} />
      </label>
      {!item && (
        <div>
          <span className="text-sm font-medium text-neutral-700">File</span>
          <input
            ref={ref}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f && !nama.trim()) setNama(f.name.replace(/\.[^.]+$/, ''));
            }}
          />
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className="mt-1 w-full flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed border-neutral-300 rounded-lg text-sm text-neutral-600 hover:bg-neutral-50"
          >
            <Upload className="w-4 h-4" />
            {file ? file.name : 'PDF, gambar, Word, Excel, PowerPoint (maks 20 MB)'}
          </button>
        </div>
      )}
    </Modal>
  );
}
