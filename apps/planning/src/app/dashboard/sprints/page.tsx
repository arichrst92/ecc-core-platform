'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Plus, Play, Check, Trash2 } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

interface Sprint {
  id: string;
  nama: string;
  goal: string | null;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
  startDate: string;
  endDate: string;
  createdBy: { id: string; namaLengkap: string };
  _count: { epics: number; stories: number; tasks: number };
}

export default function SprintsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: sprints, isLoading } = useQuery({
    queryKey: ['planning', 'sprints'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: true; data: Sprint[] }>('/admin/planning/sprints');
      return res.data.data;
    },
  });

  const activateMut = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.post(`/admin/planning/sprints/${id}/activate`);
    },
    onSuccess: () => {
      toast.success('Sprint diaktifkan');
      qc.invalidateQueries({ queryKey: ['planning'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const completeMut = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.post(`/admin/planning/sprints/${id}/complete`);
    },
    onSuccess: () => {
      toast.success('Sprint di-complete');
      qc.invalidateQueries({ queryKey: ['planning'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/planning/sprints/${id}`);
    },
    onSuccess: () => {
      toast.success('Sprint dihapus');
      qc.invalidateQueries({ queryKey: ['planning'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div className="p-6">
      <header className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <CalendarRange className="w-6 h-6" />
            Sprints
          </h1>
          <p className="text-sm text-neutral-500">Grouping backlog item per periode.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600"
        >
          <Plus className="w-4 h-4" />
          Sprint Baru
        </button>
      </header>

      {showForm && <SprintForm onClose={() => setShowForm(false)} />}

      {isLoading && <p className="text-sm text-neutral-500">Memuat...</p>}

      {sprints && sprints.length === 0 && (
        <div className="bg-white border border-dashed border-neutral-300 rounded-xl p-10 text-center text-sm text-neutral-500">
          Belum ada sprint. Klik "Sprint Baru" untuk mulai.
        </div>
      )}

      <div className="space-y-3">
        {sprints?.map((s) => (
          <div key={s.id} className="bg-white border border-neutral-200 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-neutral-900">{s.nama}</h3>
                  <StatusBadge status={s.status} />
                </div>
                {s.goal && <p className="text-sm text-neutral-600 mb-2">{s.goal}</p>}
                <div className="text-xs text-neutral-500">
                  {s.startDate.slice(0, 10)} → {s.endDate.slice(0, 10)} · created by {s.createdBy.namaLengkap}
                </div>
                <div className="flex gap-3 mt-2 text-xs text-neutral-600">
                  <span>Epics: <strong>{s._count.epics}</strong></span>
                  <span>Stories: <strong>{s._count.stories}</strong></span>
                  <span>Tasks: <strong>{s._count.tasks}</strong></span>
                </div>
              </div>
              <div className="flex gap-2">
                {s.status === 'PLANNED' && (
                  <button
                    onClick={() => activateMut.mutate(s.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-brand-50 text-brand-700 rounded-lg text-xs font-medium hover:bg-brand-100"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Activate
                  </button>
                )}
                {s.status === 'ACTIVE' && (
                  <button
                    onClick={() => completeMut.mutate(s.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Complete
                  </button>
                )}
                {s._count.epics + s._count.stories + s._count.tasks === 0 && (
                  <button
                    onClick={() => {
                      if (confirm(`Hapus sprint "${s.nama}"?`)) deleteMut.mutate(s.id);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-xs font-medium hover:bg-red-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Sprint['status'] }) {
  const config = {
    PLANNED: 'bg-neutral-100 text-neutral-700',
    ACTIVE: 'bg-brand-100 text-brand-700',
    COMPLETED: 'bg-green-100 text-green-700',
  }[status];
  return <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${config}`}>{status}</span>;
}

function SprintForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [nama, setNama] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const createMut = useMutation({
    mutationFn: async () => {
      await apiClient.post('/admin/planning/sprints', { nama, goal: goal || undefined, startDate, endDate });
    },
    onSuccess: () => {
      toast.success('Sprint dibuat');
      qc.invalidateQueries({ queryKey: ['planning'] });
      onClose();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5 mb-4">
      <h3 className="font-bold text-neutral-900 mb-3">Sprint Baru</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-neutral-600">Nama *</span>
          <input
            type="text"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
            placeholder="Sprint 1 — Core Features"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-neutral-600">Goal</span>
          <input
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
            placeholder="Scaffold apps + basic CRUD"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-neutral-600">Start Date *</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-neutral-600">End Date *</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
          />
        </label>
      </div>
      <div className="flex gap-2 mt-4 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-200"
        >
          Batal
        </button>
        <button
          onClick={() => createMut.mutate()}
          disabled={!nama || !startDate || !endDate || createMut.isPending}
          className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
        >
          {createMut.isPending ? 'Membuat...' : 'Buat Sprint'}
        </button>
      </div>
    </div>
  );
}
