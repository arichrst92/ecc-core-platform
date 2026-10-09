'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from './badges';

type Kind = 'epic' | 'story' | 'task';

const KIND_PLURAL: Record<Kind, string> = {
  epic: 'epics',
  story: 'stories',
  task: 'tasks',
};

interface Props {
  kind: Kind;
  /** For story: parentId = epicId; for task: parentId = storyId; for epic: ignored. */
  parentId?: string;
  /** Pre-populate on edit. If omitted, create mode. */
  existing?: {
    id: string;
    title: string;
    description?: string | null;
    acceptanceCriteria?: string | null;
    status: string;
    priority: string;
    moduleTag?: string | null;
    sprintId?: string | null;
    ownerId?: string | null;
    assigneeId?: string | null;
    estimateHours?: number | null;
  };
  onClose: () => void;
}

interface SprintLite { id: string; nama: string; status: string }

interface ItMember {
  id: string;
  jemaatId: string;
  roleTitle: string;
  divisi: string;
  jemaat: { id: string; namaLengkap: string; fotoUrl: string | null };
}

export function ItemFormModal({ kind, parentId, existing, onClose }: Props) {
  const qc = useQueryClient();
  const isEdit = Boolean(existing);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(existing?.acceptanceCriteria ?? '');
  const [status, setStatus] = useState<string>(existing?.status ?? 'BACKLOG');
  const [priority, setPriority] = useState<string>(existing?.priority ?? 'P2');
  const [moduleTag, setModuleTag] = useState(existing?.moduleTag ?? '');
  const [sprintId, setSprintId] = useState<string>(existing?.sprintId ?? '');
  const [estimateHours, setEstimateHours] = useState<string>(
    existing?.estimateHours != null ? String(existing.estimateHours) : '',
  );
  // Untuk epic → ownerId; untuk story/task → assigneeId
  const [personId, setPersonId] = useState<string>(
    (kind === 'epic' ? existing?.ownerId : existing?.assigneeId) ?? '',
  );

  const { data: sprints } = useQuery({
    queryKey: ['planning', 'sprints'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: true; data: SprintLite[] }>('/admin/planning/sprints');
      return res.data.data;
    },
  });

  // IT Minister Team active members — kandidat owner/assignee
  const { data: itMembers } = useQuery({
    queryKey: ['planning', 'it-members'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: true; data: ItMember[] }>(
        '/admin/it-minister-team?isActive=true',
      );
      // Dedupe per jemaat (satu orang bisa punya multiple role)
      const seen = new Set<string>();
      const uniq: ItMember[] = [];
      for (const m of res.data.data) {
        if (seen.has(m.jemaatId)) continue;
        seen.add(m.jemaatId);
        uniq.push(m);
      }
      return uniq;
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        title,
        description: description || undefined,
        status,
        priority,
        sprintId: sprintId || null,
      };
      if (kind === 'epic') {
        body.moduleTag = moduleTag || undefined;
        body.ownerId = personId || null;
      }
      if (kind === 'story') {
        body.acceptanceCriteria = acceptanceCriteria || undefined;
        body.assigneeId = personId || null;
      }
      if (kind === 'task') {
        body.estimateHours = estimateHours ? Number(estimateHours) : null;
        body.assigneeId = personId || null;
      }

      const plural = KIND_PLURAL[kind];
      if (isEdit) {
        await apiClient.patch(`/admin/planning/${plural}/${existing!.id}`, body);
      } else {
        if (kind === 'story') body.epicId = parentId;
        if (kind === 'task') body.storyId = parentId;
        await apiClient.post(`/admin/planning/${plural}`, body);
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? `${kind} di-update` : `${kind} dibuat`);
      qc.invalidateQueries({ queryKey: ['planning'] });
      onClose();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const label = kind === 'epic' ? 'Epic' : kind === 'story' ? 'Story' : 'Task';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-5 border-b border-neutral-100">
          <h2 className="font-bold text-lg">
            {isEdit ? 'Edit' : 'Buat'} {label}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-neutral-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-neutral-600">Title *</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-neutral-600">Description</span>
            <textarea
              rows={4}
              value={description ?? ''}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono"
            />
          </label>

          {kind === 'story' && (
            <label className="block">
              <span className="text-xs font-medium text-neutral-600">Acceptance Criteria</span>
              <textarea
                rows={3}
                value={acceptanceCriteria ?? ''}
                onChange={(e) => setAcceptanceCriteria(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono"
                placeholder="- [ ] Criterion 1&#10;- [ ] Criterion 2"
              />
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-neutral-600">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-neutral-600">Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-neutral-600">
                {kind === 'epic' ? 'Owner (lead)' : 'Assignee'}
              </span>
              <select
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
              >
                <option value="">— (unassigned) —</option>
                {itMembers?.map((m) => (
                  <option key={m.jemaatId} value={m.jemaatId}>
                    {m.jemaat.namaLengkap} ({m.roleTitle.replace(/_/g, ' ')})
                  </option>
                ))}
              </select>
              {itMembers && itMembers.length === 0 && (
                <span className="text-[10px] text-neutral-500 mt-1 block">
                  Belum ada anggota IT Minister Team aktif. Tambah via Portal → Team IT Minister.
                </span>
              )}
            </label>

            <label className="block">
              <span className="text-xs font-medium text-neutral-600">Sprint</span>
              <select
                value={sprintId}
                onChange={(e) => setSprintId(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
              >
                <option value="">— (tidak di sprint apapun) —</option>
                {sprints?.map((s) => (
                  <option key={s.id} value={s.id}>{s.nama} ({s.status})</option>
                ))}
              </select>
            </label>

            {kind === 'epic' && (
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Module Tag</span>
                <input
                  type="text"
                  value={moduleTag ?? ''}
                  onChange={(e) => setModuleTag(e.target.value)}
                  placeholder="jemaat, event, wa-notif..."
                  className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                />
              </label>
            )}

            {kind === 'task' && (
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Estimate (jam)</span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="9999.9"
                  value={estimateHours ?? ''}
                  onChange={(e) => setEstimateHours(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                />
              </label>
            )}
          </div>
        </div>

        <footer className="p-5 border-t border-neutral-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-200"
          >
            Batal
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={!title || mut.isPending}
            className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
          >
            {mut.isPending ? 'Menyimpan...' : isEdit ? 'Update' : 'Buat'}
          </button>
        </footer>
      </div>
    </div>
  );
}
