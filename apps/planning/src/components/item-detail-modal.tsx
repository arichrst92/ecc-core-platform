'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Send, Clock, Trash2, Pencil } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { StatusBadge, PriorityBadge, Avatar } from './badges';
import { ItemFormModal } from './item-form-modal';

type Kind = 'epic' | 'story' | 'task';

const KIND_PLURAL: Record<Kind, string> = {
  epic: 'epics',
  story: 'stories',
  task: 'tasks',
};
const KIND_PREFIX: Record<Kind, string> = {
  epic: 'EPIC',
  story: 'STORY',
  task: 'TASK',
};

interface Props {
  kind: Kind;
  id: string;
  onClose: () => void;
}

interface JemaatLite { id: string; namaLengkap: string; fotoUrl: string | null }
interface SprintLite { id: string; nama: string; status: string }

interface Detail {
  id: string;
  nomor: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  createdBy: { id: string; namaLengkap: string };
  sprint: SprintLite | null;
  // level-specific
  moduleTag?: string | null;
  owner?: JemaatLite | null;
  assignee?: JemaatLite | null;
  acceptanceCriteria?: string | null;
  estimateHours?: number | null;
  epic?: { id: string; nomor: number; title: string };
  story?: { id: string; nomor: number; title: string; epic: { id: string; nomor: number; title: string } };
  _count?: { comments: number; stories?: number; tasks?: number };
}

interface Comment {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  author: JemaatLite;
}

export function ItemDetailModal({ kind, id, onClose }: Props) {
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const plural = KIND_PLURAL[kind];
  const [editing, setEditing] = useState(false);
  const [commentBody, setCommentBody] = useState('');

  const { data: detail, isLoading } = useQuery({
    queryKey: ['planning', kind, id],
    queryFn: async () => {
      const res = await apiClient.get<{ success: true; data: Detail }>(
        `/admin/planning/${plural}/${id}`,
      );
      return res.data.data;
    },
  });

  const { data: comments } = useQuery({
    queryKey: ['planning', kind, id, 'comments'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: true; data: Comment[] }>(
        `/admin/planning/${plural}/${id}/comments`,
      );
      return res.data.data;
    },
  });

  const statusMut = useMutation({
    mutationFn: async (newStatus: string) => {
      await apiClient.patch(`/admin/planning/${plural}/${id}`, { status: newStatus });
    },
    onSuccess: () => {
      toast.success('Status di-update');
      qc.invalidateQueries({ queryKey: ['planning'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const commentMut = useMutation({
    mutationFn: async () => {
      await apiClient.post(`/admin/planning/${plural}/${id}/comments`, { body: commentBody.trim() });
    },
    onSuccess: () => {
      setCommentBody('');
      qc.invalidateQueries({ queryKey: ['planning', kind, id, 'comments'] });
      qc.invalidateQueries({ queryKey: ['planning', kind, id] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteCommentMut = useMutation({
    mutationFn: async (commentId: string) => {
      await apiClient.delete(`/admin/planning/comments/${commentId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planning', kind, id, 'comments'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  if (editing && detail) {
    return (
      <ItemFormModal
        kind={kind}
        existing={{
          id: detail.id,
          title: detail.title,
          description: detail.description,
          acceptanceCriteria: detail.acceptanceCriteria,
          status: detail.status,
          priority: detail.priority,
          moduleTag: detail.moduleTag,
          sprintId: detail.sprint?.id ?? null,
          ownerId: detail.owner?.id ?? null,
          assigneeId: detail.assignee?.id ?? null,
          estimateHours: detail.estimateHours,
        }}
        onClose={() => setEditing(false)}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 pt-10 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl max-w-3xl w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading && <div className="p-8 text-sm text-neutral-500">Memuat detail...</div>}
        {detail && (
          <>
            <header className="flex items-start gap-3 p-5 border-b border-neutral-100">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-xs font-mono text-neutral-400">
                    {KIND_PREFIX[kind]}-{detail.nomor}
                  </span>
                  <StatusBadge status={detail.status} />
                  <PriorityBadge priority={detail.priority} />
                  {detail.moduleTag && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded">
                      #{detail.moduleTag}
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-neutral-900">{detail.title}</h2>
                {/* Parent breadcrumb */}
                {kind === 'story' && detail.epic && (
                  <div className="text-xs text-neutral-500 mt-1">
                    in <strong>EPIC-{detail.epic.nomor}:</strong> {detail.epic.title}
                  </div>
                )}
                {kind === 'task' && detail.story && (
                  <div className="text-xs text-neutral-500 mt-1">
                    in <strong>EPIC-{detail.story.epic.nomor}</strong> → <strong>STORY-{detail.story.nomor}:</strong> {detail.story.title}
                  </div>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => setEditing(true)}
                  className="p-2 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg"
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
              {/* Main column */}
              <div className="md:col-span-2 p-5 space-y-5 border-r border-neutral-100">
                {detail.description && (
                  <section>
                    <h3 className="text-xs font-semibold text-neutral-500 uppercase mb-2">Description</h3>
                    <p className="text-sm text-neutral-800 whitespace-pre-wrap">{detail.description}</p>
                  </section>
                )}

                {kind === 'story' && detail.acceptanceCriteria && (
                  <section>
                    <h3 className="text-xs font-semibold text-neutral-500 uppercase mb-2">Acceptance Criteria</h3>
                    <p className="text-sm text-neutral-800 whitespace-pre-wrap font-mono">
                      {detail.acceptanceCriteria}
                    </p>
                  </section>
                )}

                {/* Comments */}
                <section>
                  <h3 className="text-xs font-semibold text-neutral-500 uppercase mb-3">
                    Comments ({comments?.length ?? 0})
                  </h3>
                  <div className="space-y-3 mb-3">
                    {comments?.length === 0 && (
                      <div className="text-xs text-neutral-500 italic">Belum ada comment.</div>
                    )}
                    {comments?.map((c) => (
                      <div key={c.id} className="flex gap-2.5 group">
                        <Avatar src={c.author.fotoUrl} nama={c.author.namaLengkap} size={28} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-semibold text-neutral-800">{c.author.namaLengkap}</span>
                            <span className="text-[10px] text-neutral-400">
                              {new Date(c.createdAt).toLocaleString('id-ID', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </span>
                            {currentUser?.jemaatId === c.authorId && (
                              <button
                                onClick={() => {
                                  if (confirm('Hapus comment?')) deleteCommentMut.mutate(c.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-600 transition"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          <p className="text-sm text-neutral-700 whitespace-pre-wrap">{c.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 items-start">
                    <textarea
                      rows={2}
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      placeholder="Tulis komentar..."
                      className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm resize-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && commentBody.trim()) {
                          commentMut.mutate();
                        }
                      }}
                    />
                    <button
                      onClick={() => commentMut.mutate()}
                      disabled={!commentBody.trim() || commentMut.isPending}
                      className="p-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
                      title="Kirim (Cmd+Enter)"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </section>
              </div>

              {/* Sidebar — metadata */}
              <aside className="p-5 space-y-4 bg-neutral-50/50">
                <MetaField label="Status">
                  <select
                    value={detail.status}
                    onChange={(e) => statusMut.mutate(e.target.value)}
                    className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-xs bg-white"
                  >
                    {['BACKLOG', 'PLANNED', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'ARCHIVED'].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </MetaField>

                <MetaField label={kind === 'epic' ? 'Owner' : 'Assignee'}>
                  {kind === 'epic' ? (
                    detail.owner ? (
                      <div className="flex items-center gap-2">
                        <Avatar src={detail.owner.fotoUrl} nama={detail.owner.namaLengkap} size={20} />
                        <span className="text-xs text-neutral-800">{detail.owner.namaLengkap}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-400 italic">no owner</span>
                    )
                  ) : detail.assignee ? (
                    <div className="flex items-center gap-2">
                      <Avatar src={detail.assignee.fotoUrl} nama={detail.assignee.namaLengkap} size={20} />
                      <span className="text-xs text-neutral-800">{detail.assignee.namaLengkap}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-neutral-400 italic">unassigned</span>
                  )}
                </MetaField>

                <MetaField label="Sprint">
                  {detail.sprint ? (
                    <span className="text-xs text-neutral-800">
                      {detail.sprint.nama}{' '}
                      <span className="text-neutral-400">({detail.sprint.status})</span>
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-400 italic">— no sprint —</span>
                  )}
                </MetaField>

                {kind === 'task' && detail.estimateHours != null && (
                  <MetaField label="Estimate">
                    <span className="text-xs text-neutral-800 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {detail.estimateHours} jam
                    </span>
                  </MetaField>
                )}

                {kind !== 'task' && detail._count && (
                  <MetaField label={kind === 'epic' ? 'Stories' : 'Tasks'}>
                    <span className="text-xs text-neutral-800">
                      {kind === 'epic' ? detail._count.stories ?? 0 : detail._count.tasks ?? 0}
                    </span>
                  </MetaField>
                )}

                <MetaField label="Created by">
                  <span className="text-xs text-neutral-800">{detail.createdBy.namaLengkap}</span>
                </MetaField>

                <MetaField label="Created">
                  <span className="text-xs text-neutral-800">
                    {new Date(detail.createdAt).toLocaleString('id-ID', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </MetaField>

                {detail.closedAt && (
                  <MetaField label="Closed">
                    <span className="text-xs text-neutral-800">
                      {new Date(detail.closedAt).toLocaleString('id-ID', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  </MetaField>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}
