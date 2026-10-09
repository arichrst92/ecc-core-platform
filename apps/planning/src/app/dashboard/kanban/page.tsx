'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Columns3, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { StatusBadge, PriorityBadge, Avatar } from '@/components/badges';
import { ItemDetailModal } from '@/components/item-detail-modal';

interface JemaatLite { id: string; namaLengkap: string; fotoUrl: string | null }
interface SprintLite { id: string; nama: string; status: string }

type Level = 'epic' | 'story' | 'task';

interface CardItem {
  id: string;
  nomor: number;
  title: string;
  status: string;
  priority: string;
  estimateHours?: number | null;
  assignee: JemaatLite | null;
  sprint?: SprintLite | null;
  parentLabel?: string; // "STORY-12" atau "EPIC-5" untuk context
}

const COLUMNS = ['BACKLOG', 'PLANNED', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const;

const LEVEL_LABEL: Record<Level, string> = {
  epic: 'Epic',
  story: 'Story',
  task: 'Task',
};
const LEVEL_PREFIX: Record<Level, string> = {
  epic: 'EPIC',
  story: 'STORY',
  task: 'TASK',
};

const COLUMN_COLORS: Record<string, string> = {
  BACKLOG: 'border-neutral-300',
  PLANNED: 'border-blue-400',
  IN_PROGRESS: 'border-brand-500',
  IN_REVIEW: 'border-purple-400',
  DONE: 'border-green-500',
};

export default function KanbanPage() {
  const qc = useQueryClient();
  const [level, setLevel] = useState<Level>('task');
  const [detailId, setDetailId] = useState<string | null>(null);
  // '' = semua sprint (default), 'ACTIVE' = sentinel buat auto active sprint, uuid = specific sprint
  const [filterSprint, setFilterSprint] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [filterAssignee, setFilterAssignee] = useState<string>('');

  const { data: sprints } = useQuery({
    queryKey: ['planning', 'sprints'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: true; data: SprintLite[] }>('/admin/planning/sprints');
      return res.data.data;
    },
  });

  // Resolve sprint filter: 'ACTIVE' sentinel → id sprint ACTIVE saat ini; '' → tidak difilter.
  const effectiveSprintFilter = useMemo(() => {
    if (filterSprint === 'ACTIVE') {
      const active = sprints?.find((s) => s.status === 'ACTIVE');
      return active?.id ?? '';
    }
    return filterSprint;
  }, [filterSprint, sprints]);

  const { data: items, isLoading } = useQuery({
    queryKey: ['planning', 'kanban', level, effectiveSprintFilter, filterPriority, filterAssignee],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (effectiveSprintFilter) params.set('sprintId', effectiveSprintFilter);
      if (filterPriority) params.set('priority', filterPriority);
      if (filterAssignee && level !== 'epic') params.set('assigneeId', filterAssignee);
      if (filterAssignee && level === 'epic') params.set('ownerId', filterAssignee);
      params.set('limit', '500');

      const endpoint =
        level === 'epic' ? '/admin/planning/epics'
        : level === 'story' ? '/admin/planning/stories'
        : '/admin/planning/tasks';

      const res = await apiClient.get<{ success: true; data: any[] }>(`${endpoint}?${params.toString()}`);

      // Normalize ke CardItem agar sama shape
      return res.data.data.map((row: any): CardItem => {
        if (level === 'epic') {
          return {
            id: row.id,
            nomor: row.nomor,
            title: row.title,
            status: row.status,
            priority: row.priority,
            assignee: row.owner ?? null, // epic punya owner, bukan assignee
            sprint: row.sprint ?? null,
            parentLabel: row.moduleTag ? `#${row.moduleTag}` : undefined,
          };
        }
        if (level === 'story') {
          return {
            id: row.id,
            nomor: row.nomor,
            title: row.title,
            status: row.status,
            priority: row.priority,
            assignee: row.assignee ?? null,
            sprint: row.sprint ?? null,
            parentLabel: row.epic ? `EPIC-${row.epic.nomor}` : undefined,
          };
        }
        // task
        return {
          id: row.id,
          nomor: row.nomor,
          title: row.title,
          status: row.status,
          priority: row.priority,
          estimateHours: row.estimateHours,
          assignee: row.assignee ?? null,
          sprint: row.sprint ?? null,
          parentLabel: row.story ? `STORY-${row.story.nomor}` : undefined,
        };
      });
    },
  });

  const grouped = useMemo(() => {
    const g: Record<string, CardItem[]> = { BACKLOG: [], PLANNED: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] };
    items?.forEach((t) => {
      const bucket = g[t.status];
      if (bucket) bucket.push(t);
    });
    return g;
  }, [items]);

  const updateStatusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const endpoint =
        level === 'epic' ? `/admin/planning/epics/${id}`
        : level === 'story' ? `/admin/planning/stories/${id}`
        : `/admin/planning/tasks/${id}`;
      await apiClient.patch(endpoint, { status });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planning'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  // Unique assignees/owners untuk filter dropdown
  const assignees = useMemo(() => {
    const map = new Map<string, JemaatLite>();
    items?.forEach((t) => {
      if (t.assignee) map.set(t.assignee.id, t.assignee);
    });
    return Array.from(map.values());
  }, [items]);

  return (
    <div className="p-6 flex flex-col h-full">
      <header className="mb-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Columns3 className="w-6 h-6" />
            Kanban Board
          </h1>
          <p className="text-sm text-neutral-500">
            {effectiveSprintFilter
              ? `Sprint: ${sprints?.find((s) => s.id === effectiveSprintFilter)?.nama ?? '—'} · ${items?.length ?? 0} ${LEVEL_LABEL[level].toLowerCase()}`
              : `Semua ${LEVEL_LABEL[level].toLowerCase()} (${items?.length ?? 0}). Pilih sprint di filter untuk fokus.`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Level toggle */}
          <div className="inline-flex rounded-lg border border-neutral-300 bg-white overflow-hidden text-sm">
            {(['epic', 'story', 'task'] as Level[]).map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`px-3 py-2 font-medium transition ${
                  level === l
                    ? 'bg-brand-500 text-white'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                {LEVEL_LABEL[l]}
              </button>
            ))}
          </div>
          <select
            value={filterSprint}
            onChange={(e) => setFilterSprint(e.target.value)}
            className="px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white"
          >
            <option value="">Semua sprint</option>
            <option value="ACTIVE">Sprint ACTIVE saja</option>
            {sprints?.map((s) => (
              <option key={s.id} value={s.id}>{s.nama} ({s.status})</option>
            ))}
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white"
          >
            <option value="">Semua priority</option>
            <option value="P0">P0</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
          </select>
          <select
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            className="px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white"
          >
            <option value="">Semua assignee</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>{a.namaLengkap}</option>
            ))}
          </select>
        </div>
      </header>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat {LEVEL_LABEL[level].toLowerCase()}...
        </div>
      )}

      {items && (
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-3 min-w-max pb-4">
            {COLUMNS.map((col) => (
              <KanbanColumn
                key={col}
                title={col}
                items={grouped[col]}
                level={level}
                onMoveItem={(id, newStatus) =>
                  updateStatusMut.mutate({ id, status: newStatus })
                }
                onOpenDetail={(id) => setDetailId(id)}
              />
            ))}
          </div>
        </div>
      )}

      {detailId && (
        <ItemDetailModal kind={level} id={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}

function KanbanColumn({
  title,
  items,
  level,
  onMoveItem,
  onOpenDetail,
}: {
  title: string;
  items: CardItem[];
  level: Level;
  onMoveItem: (id: string, newStatus: string) => void;
  onOpenDetail: (id: string) => void;
}) {
  return (
    <div
      className={`w-72 shrink-0 bg-neutral-100/60 border-t-2 ${COLUMN_COLORS[title]} rounded-lg flex flex-col`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/item-id');
        const fromStatus = e.dataTransfer.getData('text/item-status');
        if (id && fromStatus !== title) onMoveItem(id, title);
      }}
    >
      <header className="p-3 flex items-center justify-between border-b border-neutral-200">
        <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700">{title}</h3>
        <span className="text-xs text-neutral-500 bg-white px-1.5 py-0.5 rounded">{items.length}</span>
      </header>
      <div className="p-2 space-y-2 flex-1 min-h-[200px] overflow-y-auto">
        {items.length === 0 && (
          <div className="text-[11px] text-neutral-400 text-center py-4 italic">kosong</div>
        )}
        {items.map((item) => (
          <KanbanCard
            key={item.id}
            item={item}
            level={level}
            onMoveItem={onMoveItem}
            onOpenDetail={() => onOpenDetail(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

function KanbanCard({
  item,
  level,
  onMoveItem,
  onOpenDetail,
}: {
  item: CardItem;
  level: Level;
  onMoveItem: (id: string, newStatus: string) => void;
  onOpenDetail: () => void;
}) {
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/item-id', item.id);
        e.dataTransfer.setData('text/item-status', item.status);
      }}
      onClick={onOpenDetail}
      className="bg-white border border-neutral-200 rounded-lg p-3 cursor-pointer hover:shadow-md hover:border-brand-300 transition"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-[10px] font-mono text-neutral-400">
          {LEVEL_PREFIX[level]}-{item.nomor}
        </span>
        <PriorityBadge priority={item.priority} />
      </div>
      <div className="text-sm font-medium text-neutral-900 mb-2">{item.title}</div>
      {item.parentLabel && (
        <div className="text-[11px] text-neutral-500 mb-2">
          {level === 'epic' ? '' : 'in '}
          <strong className="text-neutral-700">{item.parentLabel}</strong>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          {item.assignee ? (
            <>
              <Avatar src={item.assignee.fotoUrl} nama={item.assignee.namaLengkap} size={18} />
              <span className="text-[11px] text-neutral-600 truncate">{item.assignee.namaLengkap}</span>
            </>
          ) : (
            <span className="text-[11px] text-neutral-400 italic">
              {level === 'epic' ? 'no owner' : 'unassigned'}
            </span>
          )}
        </div>
        {item.estimateHours != null && (
          <span className="text-[10px] text-neutral-500 shrink-0 bg-neutral-50 px-1.5 py-0.5 rounded">
            {item.estimateHours}h
          </span>
        )}
      </div>
      {/* Status transition fallback via dropdown (buat mobile/non-drag) */}
      <select
        value={item.status}
        onChange={(e) => onMoveItem(item.id, e.target.value)}
        className="mt-2 w-full px-2 py-1 border border-neutral-200 rounded text-[11px] bg-neutral-50"
        onClick={(e) => e.stopPropagation()}
      >
        {['BACKLOG', 'PLANNED', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'ARCHIVED'].map((s) => (
          <option key={s} value={s}>→ {s}</option>
        ))}
      </select>
    </article>
  );
}
