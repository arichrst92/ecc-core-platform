'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ListTree,
  Plus,
  ChevronRight,
  ChevronDown,
  Pencil,
  Trash2,
  Loader2,
} from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { StatusBadge, PriorityBadge, Avatar } from '@/components/badges';
import { ItemFormModal } from '@/components/item-form-modal';
import { ItemDetailModal } from '@/components/item-detail-modal';

interface JemaatLite { id: string; namaLengkap: string; fotoUrl: string | null }
interface SprintLite { id: string; nama: string; status: string }

interface TaskNode {
  id: string;
  nomor: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  estimateHours: number | null;
  assignee: JemaatLite | null;
  sprintId: string | null;
}

interface StoryNode {
  id: string;
  nomor: number;
  title: string;
  description: string | null;
  acceptanceCriteria: string | null;
  status: string;
  priority: string;
  assignee: JemaatLite | null;
  sprintId: string | null;
  tasks: TaskNode[];
  _count: { tasks: number };
}

interface EpicListRow {
  id: string;
  nomor: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  moduleTag: string | null;
  sprintId: string | null;
  owner: JemaatLite | null;
  sprint: SprintLite | null;
  _count: { stories: number; comments: number };
}

interface EpicDetail extends EpicListRow {
  stories: StoryNode[];
}

export default function BacklogPage() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showEpicForm, setShowEpicForm] = useState(false);
  const [editItem, setEditItem] = useState<
    | { kind: 'epic'; data: EpicListRow }
    | { kind: 'story'; data: StoryNode }
    | { kind: 'task'; data: TaskNode }
    | null
  >(null);
  const [detailItem, setDetailItem] = useState<{ kind: 'epic' | 'story' | 'task'; id: string } | null>(null);
  const [addChildFor, setAddChildFor] = useState<
    { kind: 'story'; epicId: string } | { kind: 'task'; storyId: string } | null
  >(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterSprint, setFilterSprint] = useState<string>('');

  const { data: sprints } = useQuery({
    queryKey: ['planning', 'sprints'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: true; data: SprintLite[] }>('/admin/planning/sprints');
      return res.data.data;
    },
  });

  const { data: epics, isLoading } = useQuery({
    queryKey: ['planning', 'epics', filterStatus, filterSprint],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterSprint) params.set('sprintId', filterSprint);
      const res = await apiClient.get<{ success: true; data: EpicListRow[] }>(
        `/admin/planning/epics?${params.toString()}`,
      );
      return res.data.data;
    },
  });

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const KIND_PLURAL = { epic: 'epics', story: 'stories', task: 'tasks' } as const;
  const deleteMut = useMutation({
    mutationFn: async (opts: { kind: 'epic' | 'story' | 'task'; id: string }) => {
      await apiClient.delete(`/admin/planning/${KIND_PLURAL[opts.kind]}/${opts.id}`);
    },
    onSuccess: () => {
      toast.success('Dihapus');
      qc.invalidateQueries({ queryKey: ['planning'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  function askDelete(kind: 'epic' | 'story' | 'task', id: string, label: string) {
    if (!confirm(`Hapus ${kind} "${label}"? Children (${kind === 'epic' ? 'stories+tasks' : kind === 'story' ? 'tasks' : ''}) ikut cascade delete.`)) return;
    deleteMut.mutate({ kind, id });
  }

  return (
    <div className="p-6">
      <header className="mb-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <ListTree className="w-6 h-6" />
            Backlog
          </h1>
          <p className="text-sm text-neutral-500">Epic → Story → Task hierarchy.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white"
          >
            <option value="">Semua status</option>
            <option value="BACKLOG">BACKLOG</option>
            <option value="PLANNED">PLANNED</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="IN_REVIEW">IN_REVIEW</option>
            <option value="DONE">DONE</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
          <select
            value={filterSprint}
            onChange={(e) => setFilterSprint(e.target.value)}
            className="px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white"
          >
            <option value="">Semua sprint</option>
            {sprints?.map((s) => (
              <option key={s.id} value={s.id}>{s.nama} ({s.status})</option>
            ))}
          </select>
          <button
            onClick={() => setShowEpicForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600"
          >
            <Plus className="w-4 h-4" />
            Epic Baru
          </button>
        </div>
      </header>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat...
        </div>
      )}

      {epics && epics.length === 0 && (
        <div className="bg-white border border-dashed border-neutral-300 rounded-xl p-10 text-center text-sm text-neutral-500">
          Belum ada epic. Klik "Epic Baru" untuk mulai.
        </div>
      )}

      <div className="space-y-2">
        {epics?.map((epic) => (
          <EpicRow
            key={epic.id}
            epic={epic}
            expanded={expanded[epic.id] ?? false}
            onToggle={() => toggleExpand(epic.id)}
            onOpenDetail={() => setDetailItem({ kind: 'epic', id: epic.id })}
            onEdit={() => setEditItem({ kind: 'epic', data: epic })}
            onDelete={() => askDelete('epic', epic.id, `EPIC-${epic.nomor}: ${epic.title}`)}
            onAddStory={() => setAddChildFor({ kind: 'story', epicId: epic.id })}
            onOpenStoryDetail={(s) => setDetailItem({ kind: 'story', id: s.id })}
            onEditStory={(s) => setEditItem({ kind: 'story', data: s })}
            onDeleteStory={(s) => askDelete('story', s.id, `STORY-${s.nomor}: ${s.title}`)}
            onAddTask={(storyId) => setAddChildFor({ kind: 'task', storyId })}
            onOpenTaskDetail={(t) => setDetailItem({ kind: 'task', id: t.id })}
            onEditTask={(t) => setEditItem({ kind: 'task', data: t })}
            onDeleteTask={(t) => askDelete('task', t.id, `TASK-${t.nomor}: ${t.title}`)}
          />
        ))}
      </div>

      {showEpicForm && <ItemFormModal kind="epic" onClose={() => setShowEpicForm(false)} />}
      {editItem && (
        <ItemFormModal
          kind={editItem.kind}
          existing={editItem.data as any}
          onClose={() => setEditItem(null)}
        />
      )}
      {detailItem && (
        <ItemDetailModal kind={detailItem.kind} id={detailItem.id} onClose={() => setDetailItem(null)} />
      )}
      {addChildFor?.kind === 'story' && (
        <ItemFormModal kind="story" parentId={addChildFor.epicId} onClose={() => setAddChildFor(null)} />
      )}
      {addChildFor?.kind === 'task' && (
        <ItemFormModal kind="task" parentId={addChildFor.storyId} onClose={() => setAddChildFor(null)} />
      )}
    </div>
  );
}

// ============================================================
//  EpicRow — expandable
// ============================================================

function EpicRow({
  epic,
  expanded,
  onToggle,
  onOpenDetail,
  onEdit,
  onDelete,
  onAddStory,
  onOpenStoryDetail,
  onEditStory,
  onDeleteStory,
  onAddTask,
  onOpenTaskDetail,
  onEditTask,
  onDeleteTask,
}: {
  epic: EpicListRow;
  expanded: boolean;
  onToggle: () => void;
  onOpenDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddStory: () => void;
  onOpenStoryDetail: (s: StoryNode) => void;
  onEditStory: (s: StoryNode) => void;
  onDeleteStory: (s: StoryNode) => void;
  onAddTask: (storyId: string) => void;
  onOpenTaskDetail: (t: TaskNode) => void;
  onEditTask: (t: TaskNode) => void;
  onDeleteTask: (t: TaskNode) => void;
}) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ['planning', 'epic-detail', epic.id],
    queryFn: async () => {
      const res = await apiClient.get<{ success: true; data: EpicDetail }>(
        `/admin/planning/epics/${epic.id}`,
      );
      return res.data.data;
    },
    enabled: expanded,
  });

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <header className="flex items-start gap-3 p-4 hover:bg-neutral-50 transition">
        <button onClick={onToggle} className="mt-0.5 p-0.5 hover:bg-neutral-200 rounded">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpenDetail}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-neutral-400">EPIC-{epic.nomor}</span>
            <h3 className="font-semibold text-neutral-900 text-sm hover:text-brand-600 transition">{epic.title}</h3>
            <StatusBadge status={epic.status} />
            <PriorityBadge priority={epic.priority} />
            {epic.moduleTag && (
              <span className="text-[10px] px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded">
                {epic.moduleTag}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-neutral-500 flex-wrap">
            {epic.sprint && (
              <span>
                in <strong className="text-neutral-700">{epic.sprint.nama}</strong>
              </span>
            )}
            {epic.owner && (
              <span className="flex items-center gap-1">
                <Avatar src={epic.owner.fotoUrl} nama={epic.owner.namaLengkap} size={16} />
                <span>{epic.owner.namaLengkap}</span>
              </span>
            )}
            <span>{epic._count.stories} stories · {epic._count.comments} comments</span>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {expanded && (
        <div className="border-t border-neutral-100 bg-neutral-50/40 p-4 space-y-2">
          {isLoading && <p className="text-xs text-neutral-500">Memuat stories...</p>}
          {detail?.stories.length === 0 && (
            <div className="text-xs text-neutral-500 italic">Belum ada story di epic ini.</div>
          )}
          {detail?.stories.map((story) => (
            <StoryRow
              key={story.id}
              story={story}
              onOpenDetail={() => onOpenStoryDetail(story)}
              onEdit={() => onEditStory(story)}
              onDelete={() => onDeleteStory(story)}
              onAddTask={() => onAddTask(story.id)}
              onOpenTaskDetail={onOpenTaskDetail}
              onEditTask={onEditTask}
              onDeleteTask={onDeleteTask}
            />
          ))}
          <button
            onClick={onAddStory}
            className="w-full text-xs text-brand-600 hover:text-brand-700 py-1.5 border border-dashed border-brand-300 rounded-lg hover:bg-brand-50 transition flex items-center justify-center gap-1"
          >
            <Plus className="w-3 h-3" />
            Tambah Story
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
//  StoryRow — nested; always render tasks inline when expanded
// ============================================================

function StoryRow({
  story,
  onOpenDetail,
  onEdit,
  onDelete,
  onAddTask,
  onOpenTaskDetail,
  onEditTask,
  onDeleteTask,
}: {
  story: StoryNode;
  onOpenDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddTask: () => void;
  onOpenTaskDetail: (t: TaskNode) => void;
  onEditTask: (t: TaskNode) => void;
  onDeleteTask: (t: TaskNode) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white border border-neutral-200 rounded-lg">
      <header className="flex items-start gap-2 p-3">
        <button onClick={() => setOpen(!open)} className="mt-0.5 p-0.5 hover:bg-neutral-200 rounded">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpenDetail}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-neutral-400">STORY-{story.nomor}</span>
            <span className="font-medium text-neutral-900 text-sm hover:text-brand-600 transition">{story.title}</span>
            <StatusBadge status={story.status} />
            <PriorityBadge priority={story.priority} />
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-neutral-500 flex-wrap">
            {story.assignee && (
              <span className="flex items-center gap-1">
                <Avatar src={story.assignee.fotoUrl} nama={story.assignee.namaLengkap} size={14} />
                {story.assignee.namaLengkap}
              </span>
            )}
            <span>{story._count.tasks} tasks</span>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={onEdit} className="p-1 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded">
            <Pencil className="w-3 h-3" />
          </button>
          <button onClick={onDelete} className="p-1 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </header>

      {open && (
        <div className="border-t border-neutral-100 bg-neutral-50/30 p-2.5 space-y-1.5">
          {story.tasks.length === 0 && (
            <div className="text-[11px] text-neutral-500 italic px-2">Belum ada task.</div>
          )}
          {story.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onOpenDetail={() => onOpenTaskDetail(task)}
              onEdit={() => onEditTask(task)}
              onDelete={() => onDeleteTask(task)}
            />
          ))}
          <button
            onClick={onAddTask}
            className="w-full text-[11px] text-brand-600 hover:text-brand-700 py-1 border border-dashed border-brand-200 rounded hover:bg-brand-50 transition flex items-center justify-center gap-1"
          >
            <Plus className="w-2.5 h-2.5" />
            Tambah Task
          </button>
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task,
  onOpenDetail,
  onEdit,
  onDelete,
}: {
  task: TaskNode;
  onOpenDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 bg-white border border-neutral-100 rounded px-2.5 py-1.5 text-sm">
      <span className="text-[10px] font-mono text-neutral-400 shrink-0">TASK-{task.nomor}</span>
      <span className="flex-1 truncate cursor-pointer hover:text-brand-600 transition" onClick={onOpenDetail}>{task.title}</span>
      {task.estimateHours != null && (
        <span className="text-[10px] text-neutral-500 shrink-0">{task.estimateHours}h</span>
      )}
      <PriorityBadge priority={task.priority} className="shrink-0" />
      <StatusBadge status={task.status} className="shrink-0" />
      {task.assignee && (
        <Avatar src={task.assignee.fotoUrl} nama={task.assignee.namaLengkap} size={16} />
      )}
      <div className="flex gap-0.5 shrink-0">
        <button onClick={onEdit} className="p-1 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded">
          <Pencil className="w-3 h-3" />
        </button>
        <button onClick={onDelete} className="p-1 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
