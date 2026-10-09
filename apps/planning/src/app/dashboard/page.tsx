'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, ListTodo, UserCircle, Archive } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface DashboardData {
  activeSprint: {
    id: string;
    nama: string;
    goal: string | null;
    startDate: string;
    endDate: string;
    _count: { epics: number; stories: number; tasks: number };
  } | null;
  activeSprintStatusBreakdown: Record<string, number>;
  me: { epicsOpen: number; storiesOpen: number; tasksOpen: number };
  backlogCount: number;
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['planning', 'dashboard'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: true; data: DashboardData }>(
        '/admin/planning/dashboard',
      );
      return res.data.data;
    },
  });

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-neutral-900">Planning Backlog</h1>
        <p className="text-sm text-neutral-500">Ringkasan sprint aktif & item kamu.</p>
      </header>

      {isLoading && <p className="text-sm text-neutral-500">Memuat...</p>}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
          Gagal memuat: {(error as Error).message}
        </div>
      )}

      {data && (
        <>
          {/* My items counters */}
          <section>
            <h2 className="text-sm font-semibold text-neutral-700 mb-3">Item Kamu</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Stat icon={<UserCircle className="w-5 h-5" />} label="Epic (owner)" value={data.me.epicsOpen} />
              <Stat icon={<ListTodo className="w-5 h-5" />} label="Story (assigned)" value={data.me.storiesOpen} />
              <Stat icon={<CalendarCheck className="w-5 h-5" />} label="Task (assigned)" value={data.me.tasksOpen} />
            </div>
          </section>

          {/* Active sprint */}
          <section>
            <h2 className="text-sm font-semibold text-neutral-700 mb-3">Sprint Aktif</h2>
            {data.activeSprint ? (
              <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-bold text-neutral-900">{data.activeSprint.nama}</div>
                    {data.activeSprint.goal && (
                      <div className="text-sm text-neutral-600 mt-1">{data.activeSprint.goal}</div>
                    )}
                    <div className="text-xs text-neutral-500 mt-2">
                      {data.activeSprint.startDate.slice(0, 10)} → {data.activeSprint.endDate.slice(0, 10)}
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-brand-100 text-brand-700 text-xs font-semibold rounded-full">
                    ACTIVE
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-neutral-100">
                  <MiniStat label="Epics" value={data.activeSprint._count.epics} />
                  <MiniStat label="Stories" value={data.activeSprint._count.stories} />
                  <MiniStat label="Tasks" value={data.activeSprint._count.tasks} />
                </div>
                {Object.keys(data.activeSprintStatusBreakdown).length > 0 && (
                  <div className="pt-3 border-t border-neutral-100">
                    <div className="text-xs text-neutral-500 mb-2">Task breakdown by status:</div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(data.activeSprintStatusBreakdown).map(([status, count]) => (
                        <span
                          key={status}
                          className="px-2 py-1 bg-neutral-100 text-neutral-700 text-xs rounded-md"
                        >
                          {status}: <strong>{count}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white border border-dashed border-neutral-300 rounded-xl p-8 text-center text-sm text-neutral-500">
                Belum ada sprint ACTIVE. Buat sprint baru via menu Sprints.
              </div>
            )}
          </section>

          {/* Backlog count */}
          <section>
            <h2 className="text-sm font-semibold text-neutral-700 mb-3">Backlog</h2>
            <div className="bg-white border border-neutral-200 rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-500">
                <Archive className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl font-bold text-neutral-900">{data.backlogCount}</div>
                <div className="text-xs text-neutral-500">Epic di status BACKLOG (belum di-plan)</div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold text-neutral-900">{value}</div>
        <div className="text-xs text-neutral-500">{label}</div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-xl font-bold text-neutral-900">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
    </div>
  );
}
