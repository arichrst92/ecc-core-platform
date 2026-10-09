'use client';

import { useQuery } from '@tanstack/react-query';
import { UserCircle } from 'lucide-react';
import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { ItemDetailModal } from '@/components/item-detail-modal';

interface MyItemsData {
  epics: Array<{ id: string; nomor: number; title: string; status: string; priority: string }>;
  stories: Array<{ id: string; nomor: number; title: string; status: string; priority: string; epic: { nomor: number; title: string } }>;
  tasks: Array<{ id: string; nomor: number; title: string; status: string; priority: string; story: { nomor: number; title: string; epic: { nomor: number; title: string } } }>;
}

export default function MyItemsPage() {
  const [detailItem, setDetailItem] = useState<{ kind: 'epic' | 'story' | 'task'; id: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['planning', 'my-items'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: true; data: MyItemsData }>('/admin/planning/my-items');
      return res.data.data;
    },
  });

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
          <UserCircle className="w-6 h-6" />
          My Items
        </h1>
        <p className="text-sm text-neutral-500">Item yang di-assign ke kamu (belum DONE / ARCHIVED).</p>
      </header>

      {isLoading && <p className="text-sm text-neutral-500">Memuat...</p>}

      {data && (
        <div className="space-y-6">
          <Section title={`Epics (${data.epics.length})`}>
            {data.epics.length === 0 ? (
              <Empty>Belum ada epic yang kamu own.</Empty>
            ) : (
              data.epics.map((e) => (
                <ItemRow
                  key={e.id}
                  label={`EPIC-${e.nomor}`}
                  title={e.title}
                  status={e.status}
                  priority={e.priority}
                  onClick={() => setDetailItem({ kind: 'epic', id: e.id })}
                />
              ))
            )}
          </Section>

          <Section title={`Stories (${data.stories.length})`}>
            {data.stories.length === 0 ? (
              <Empty>Belum ada story yang di-assign ke kamu.</Empty>
            ) : (
              data.stories.map((s) => (
                <ItemRow
                  key={s.id}
                  label={`STORY-${s.nomor}`}
                  title={s.title}
                  context={`in EPIC-${s.epic.nomor}: ${s.epic.title}`}
                  status={s.status}
                  priority={s.priority}
                  onClick={() => setDetailItem({ kind: 'story', id: s.id })}
                />
              ))
            )}
          </Section>

          <Section title={`Tasks (${data.tasks.length})`}>
            {data.tasks.length === 0 ? (
              <Empty>Belum ada task yang di-assign ke kamu.</Empty>
            ) : (
              data.tasks.map((t) => (
                <ItemRow
                  key={t.id}
                  label={`TASK-${t.nomor}`}
                  title={t.title}
                  context={`in STORY-${t.story.nomor}: ${t.story.title}`}
                  status={t.status}
                  priority={t.priority}
                  onClick={() => setDetailItem({ kind: 'task', id: t.id })}
                />
              ))
            )}
          </Section>
        </div>
      )}

      {detailItem && (
        <ItemDetailModal kind={detailItem.kind} id={detailItem.id} onClose={() => setDetailItem(null)} />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-neutral-700 mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-dashed border-neutral-200 rounded-lg p-4 text-xs text-neutral-500 text-center">
      {children}
    </div>
  );
}

function ItemRow({
  label,
  title,
  context,
  status,
  priority,
  onClick,
}: {
  label: string;
  title: string;
  context?: string;
  status: string;
  priority: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="bg-white border border-neutral-200 rounded-lg p-3 flex items-center justify-between gap-3 cursor-pointer hover:border-brand-300 hover:shadow-sm transition"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-neutral-400">{label}</span>
          <span className="font-medium text-neutral-900 text-sm truncate hover:text-brand-600 transition">{title}</span>
        </div>
        {context && <div className="text-xs text-neutral-500 mt-0.5">{context}</div>}
      </div>
      <div className="flex gap-2">
        <PriorityBadge p={priority} />
        <StatusBadge s={status} />
      </div>
    </div>
  );
}

function PriorityBadge({ p }: { p: string }) {
  const config: Record<string, string> = {
    P0: 'bg-red-100 text-red-700',
    P1: 'bg-orange-100 text-orange-700',
    P2: 'bg-neutral-100 text-neutral-700',
    P3: 'bg-neutral-50 text-neutral-500',
  };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${config[p] ?? ''}`}>{p}</span>;
}

function StatusBadge({ s }: { s: string }) {
  const config: Record<string, string> = {
    BACKLOG: 'bg-neutral-100 text-neutral-700',
    PLANNED: 'bg-blue-100 text-blue-700',
    IN_PROGRESS: 'bg-brand-100 text-brand-700',
    IN_REVIEW: 'bg-purple-100 text-purple-700',
    DONE: 'bg-green-100 text-green-700',
    ARCHIVED: 'bg-neutral-50 text-neutral-500',
  };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${config[s] ?? ''}`}>{s}</span>;
}
