'use client';

/**
 * Shiftsoft Sync — 3-step wizard: Fetch → Review → Commit.
 *
 * Flow:
 *   1. Pilih tenant → tekan "Fetch dari Legacy" → backend call Shiftsoft +
 *      kategorisasi vs DB → counters (fetched, exist, new, redundant) +
 *      records refs cached 15 menit di backend.
 *   2. Review: tabel New (default all-checked) + tabel Redundant dengan
 *      dropdown per row (SKIP / NULL_NOHP / NULL_EMAIL / IMPORT_AS_IS).
 *   3. Tekan "Save to ECC" → commit → summary imported/skipped/errors.
 *
 * Group/Cleanup/SEED_CABANG (rare use) tetap async via panel di bawah.
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DatabaseZap,
  Loader2,
  Download,
  Save,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Users,
  UsersRound,
  Sparkles,
  Terminal,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

// ============================================================
//  Types
// ============================================================
type Phase = 'JEMAAT' | 'GROUP' | 'CLEANUP' | 'SEED_CABANG';
type Status = 'RUNNING' | 'SUCCESS' | 'FAILED';
type RedundantAction = 'SKIP' | 'NULL_NOHP' | 'NULL_EMAIL' | 'IMPORT_AS_IS';

interface Tenant {
  slug: string;
  label: string;
  cabangMatch: string;
}
interface CabangCount {
  cabangNama: string;
  jemaatCount: number;
  groupCount: number;
}
interface TenantsResponse {
  tenants: Tenant[];
  cabangCounts: CabangCount[];
}
interface PreviewRecord {
  legacyId: number;
  namaLengkap: string;
  noHp: string | null;
  email: string | null;
}
interface RedundantRecord extends PreviewRecord {
  conflicts: Array<{
    field: 'noHp' | 'email';
    value: string;
    withJemaatId: string;
    withJemaatNama: string;
  }>;
}
interface PreviewResponse {
  previewId: string;
  tenantSlug: string;
  cabang: { id: string; nama: string };
  fetched: number;
  fetchDurationMs: number;
  counters: { exist: number; new: number; redundant: number };
  records: { exist: PreviewRecord[]; new: PreviewRecord[]; redundant: RedundantRecord[] };
  expiresAt: string;
}
interface CommitResponse {
  imported: number;
  skipped: number;
  errors: Array<{ legacyId: number; namaLengkap: string; message: string }>;
}
interface Job {
  id: string;
  phase: Phase;
  tenantSlug: string;
  status: Status;
  options: Record<string, unknown>;
  result: Record<string, unknown> | null;
  logTail: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  triggeredBy: { id: string; namaLengkap: string };
}

const PHASE_LABEL: Record<Phase, string> = {
  JEMAAT: 'Jemaat',
  GROUP: 'Group + Membership',
  CLEANUP: 'Cleanup System Accounts',
  SEED_CABANG: 'Seed CabangGereja',
};
const PHASE_ICON: Record<Phase, typeof Users> = {
  JEMAAT: Users,
  GROUP: UsersRound,
  CLEANUP: Sparkles,
  SEED_CABANG: DatabaseZap,
};
const STATUS_STYLE: Record<Status, string> = {
  RUNNING: 'bg-blue-100 text-blue-700',
  SUCCESS: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
};
const STATUS_ICON: Record<Status, typeof Clock> = {
  RUNNING: Loader2,
  SUCCESS: CheckCircle2,
  FAILED: XCircle,
};
const REDUNDANT_ACTION_LABEL: Record<RedundantAction, string> = {
  SKIP: 'Skip — jangan import',
  NULL_NOHP: 'Import — set noHp = NULL',
  NULL_EMAIL: 'Import — set email = NULL',
  IMPORT_AS_IS: 'Import as-is (akan error jika field masih collide)',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
function durationSec(start: string, end: string | null) {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  return Math.max(0, Math.round((e - s) / 1000));
}

// ============================================================
//  Main page
// ============================================================
export default function ShiftsoftSyncPage() {
  const qc = useQueryClient();
  const [step, setStep] = useState<'select' | 'review' | 'done'>('select');
  const [tenantSlug, setTenantSlug] = useState<string>('eccbandung');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [selectedNewIds, setSelectedNewIds] = useState<Set<number>>(new Set());
  const [redundantActions, setRedundantActions] = useState<Map<number, RedundantAction>>(
    new Map(),
  );
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);
  const [expandedSection, setExpandedSection] = useState<'new' | 'redundant' | null>('new');

  const tenantsQ = useQuery({
    queryKey: ['shiftsoft-sync', 'tenants'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: TenantsResponse }>(
        '/admin/shiftsoft-sync/tenants',
      );
      return res.data.data;
    },
  });

  const previewMut = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ data: PreviewResponse }>(
        '/admin/shiftsoft-sync/preview-jemaat',
        { tenantSlug },
      );
      return res.data.data;
    },
    onSuccess: (data) => {
      setPreview(data);
      // Default: all NEW checked, all REDUNDANT set SKIP.
      setSelectedNewIds(new Set(data.records.new.map((r) => r.legacyId)));
      setRedundantActions(
        new Map(data.records.redundant.map((r) => [r.legacyId, 'SKIP' as RedundantAction])),
      );
      setStep('review');
      toast.success(`Fetched ${data.fetched} record dari ${data.cabang.nama}`);
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.error?.message ?? 'Gagal fetch legacy data'),
  });

  const commitMut = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error('No preview');
      const res = await apiClient.post<{ data: CommitResponse }>(
        '/admin/shiftsoft-sync/commit-jemaat',
        {
          previewId: preview.previewId,
          actions: {
            newIds: [...selectedNewIds],
            redundant: [...redundantActions.entries()].map(([legacyId, action]) => ({
              legacyId,
              action,
            })),
          },
        },
      );
      return res.data.data;
    },
    onSuccess: (data) => {
      setCommitResult(data);
      setStep('done');
      qc.invalidateQueries({ queryKey: ['shiftsoft-sync'] });
      toast.success(
        `Selesai: ${data.imported} imported, ${data.skipped} skipped${data.errors.length > 0 ? `, ${data.errors.length} errors` : ''}`,
      );
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.error?.message ?? 'Gagal commit'),
  });

  const resetWizard = () => {
    setPreview(null);
    setCommitResult(null);
    setSelectedNewIds(new Set());
    setRedundantActions(new Map());
    setStep('select');
  };

  return (
    <div className="space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
          <DatabaseZap className="w-6 h-6 text-brand-500" />
          Shiftsoft Sync — Jemaat
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Preview data legacy Shiftsoft, review kategorisasi (exist / new / redundant), pilih
          action per record redundant, lalu commit. Fulltimer-only.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs">
        <StepBadge active={step === 'select'} done={step !== 'select'} label="1. Pilih Tenant" />
        <ArrowRight className="w-3 h-3 text-neutral-400" />
        <StepBadge active={step === 'review'} done={step === 'done'} label="2. Review + Action" />
        <ArrowRight className="w-3 h-3 text-neutral-400" />
        <StepBadge active={step === 'done'} done={false} label="3. Result" />
      </div>

      {/* STEP 1 — SELECT TENANT + FETCH */}
      {step === 'select' && (
        <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-neutral-900">Pilih tenant untuk preview</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {(tenantsQ.data?.tenants ?? []).map((t) => {
              const count = tenantsQ.data?.cabangCounts?.find((c) =>
                c.cabangNama.toLowerCase().includes(t.cabangMatch.toLowerCase()),
              );
              const active = tenantSlug === t.slug;
              return (
                <button
                  key={t.slug}
                  onClick={() => setTenantSlug(t.slug)}
                  className={`p-3 border rounded-lg text-left transition ${
                    active
                      ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
                      : 'border-neutral-200 hover:border-brand-300'
                  }`}
                >
                  <div className="font-medium text-neutral-900">{t.label}</div>
                  <div className="text-xs text-neutral-500 mt-1 flex items-center gap-3">
                    <span>slug: {t.slug}</span>
                    {count && (
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {count.jemaatCount} jemaat sudah imported
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="pt-3 border-t border-neutral-100 flex items-center justify-between">
            <div className="flex items-start gap-2 text-xs text-neutral-500">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-500" />
              <span>
                Fetch call ke Shiftsoft API — bisa 30-60 detik untuk tenant besar (Bandung 4200
                record). Belum ada write ke DB.
              </span>
            </div>
            <button
              onClick={() => previewMut.mutate()}
              disabled={previewMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50"
            >
              {previewMut.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Fetch dari Legacy
            </button>
          </div>
        </div>
      )}

      {/* STEP 2 — REVIEW */}
      {step === 'review' && preview && (
        <>
          {/* Counters card */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <CounterCard label="Fetched" value={preview.fetched} color="neutral" />
            <CounterCard label="Sudah ada" value={preview.counters.exist} color="blue" />
            <CounterCard
              label="Baru (siap import)"
              value={preview.counters.new}
              color="green"
              selected={selectedNewIds.size}
            />
            <CounterCard
              label="Redundant (collision)"
              value={preview.counters.redundant}
              color="amber"
              selected={
                [...redundantActions.values()].filter((a) => a !== 'SKIP').length
              }
            />
          </div>

          {/* Meta strip */}
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>
              <strong>{preview.cabang.nama}</strong> · fetched {preview.fetchDurationMs}ms · preview
              expires {new Date(preview.expiresAt).toLocaleTimeString('id-ID')}
            </span>
            <button
              onClick={resetWizard}
              className="flex items-center gap-1 hover:text-neutral-700"
            >
              <ArrowLeft className="w-3 h-3" /> Ganti tenant
            </button>
          </div>

          {/* NEW records */}
          <SectionExpander
            open={expandedSection === 'new'}
            onToggle={() => setExpandedSection(expandedSection === 'new' ? null : 'new')}
            title={`Records baru (${preview.records.new.length})`}
            hint="Default semua di-check untuk import. Uncheck kalau ada yang mau di-skip."
          >
            <NewRecordsTable
              records={preview.records.new}
              selected={selectedNewIds}
              onToggle={(id) => {
                const next = new Set(selectedNewIds);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                setSelectedNewIds(next);
              }}
              onToggleAll={(checked) => {
                setSelectedNewIds(
                  checked ? new Set(preview.records.new.map((r) => r.legacyId)) : new Set(),
                );
              }}
            />
          </SectionExpander>

          {/* REDUNDANT records */}
          {preview.records.redundant.length > 0 && (
            <SectionExpander
              open={expandedSection === 'redundant'}
              onToggle={() =>
                setExpandedSection(expandedSection === 'redundant' ? null : 'redundant')
              }
              title={`Redundant records (${preview.records.redundant.length})`}
              hint="Collision noHp/email dengan jemaat yang sudah ada di ECC. Pilih action per row."
            >
              <RedundantRecordsTable
                records={preview.records.redundant}
                actions={redundantActions}
                onChange={(id, action) => {
                  const next = new Map(redundantActions);
                  next.set(id, action);
                  setRedundantActions(next);
                }}
                onSetAll={(action) => {
                  setRedundantActions(
                    new Map(preview.records.redundant.map((r) => [r.legacyId, action])),
                  );
                }}
              />
            </SectionExpander>
          )}

          {/* Commit bar */}
          <div className="sticky bottom-4 bg-white border border-neutral-200 rounded-xl shadow-lg p-4 flex items-center justify-between">
            <div className="text-sm text-neutral-700">
              Siap import:{' '}
              <strong className="text-green-700">
                {selectedNewIds.size + [...redundantActions.values()].filter((a) => a !== 'SKIP').length}
              </strong>{' '}
              record ke <strong>{preview.cabang.nama}</strong>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={resetWizard}
                className="px-4 py-2 text-sm border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50"
              >
                Batal
              </button>
              <button
                onClick={() => commitMut.mutate()}
                disabled={
                  commitMut.isPending ||
                  (selectedNewIds.size === 0 &&
                    [...redundantActions.values()].every((a) => a === 'SKIP'))
                }
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {commitMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save to ECC
              </button>
            </div>
          </div>
        </>
      )}

      {/* STEP 3 — RESULT */}
      {step === 'done' && commitResult && (
        <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            {commitResult.errors.length === 0 ? (
              <CheckCircle2 className="w-12 h-12 text-green-500" />
            ) : (
              <AlertTriangle className="w-12 h-12 text-amber-500" />
            )}
            <div>
              <h2 className="text-lg font-bold text-neutral-900">
                {commitResult.errors.length === 0
                  ? 'Sync selesai — sukses total'
                  : 'Sync selesai dengan errors'}
              </h2>
              <p className="text-sm text-neutral-500">
                {commitResult.imported} imported · {commitResult.skipped} skipped ·{' '}
                {commitResult.errors.length} errors
              </p>
            </div>
          </div>

          {commitResult.errors.length > 0 && (
            <div className="border border-red-200 rounded-lg bg-red-50 p-3">
              <div className="text-sm font-semibold text-red-800 mb-2">
                Error details (max 20 shown):
              </div>
              <ul className="text-xs text-red-700 space-y-1 max-h-64 overflow-y-auto">
                {commitResult.errors.slice(0, 20).map((e) => (
                  <li key={e.legacyId} className="border-b border-red-100 pb-1">
                    <strong>#{e.legacyId} {e.namaLengkap}:</strong> {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={resetWizard}
              className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600"
            >
              Sync tenant lain
            </button>
          </div>
        </div>
      )}

      {/* Cabang counts (always visible) */}
      <CabangCountsCard tenantsQ={tenantsQ} />

      {/* Async jobs panel (Group / Cleanup / SEED_CABANG) */}
      <AsyncJobsPanel />
    </div>
  );
}

// ============================================================
//  Sub-components
// ============================================================

function StepBadge({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <span
      className={`px-2.5 py-1 rounded-full font-medium ${
        active
          ? 'bg-brand-500 text-white'
          : done
            ? 'bg-green-100 text-green-800'
            : 'bg-neutral-100 text-neutral-500'
      }`}
    >
      {done && '✓ '}
      {label}
    </span>
  );
}

function CounterCard({
  label,
  value,
  color,
  selected,
}: {
  label: string;
  value: number;
  color: 'neutral' | 'blue' | 'green' | 'amber';
  selected?: number;
}) {
  const bg = {
    neutral: 'bg-neutral-50 border-neutral-200 text-neutral-900',
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    green: 'bg-green-50 border-green-200 text-green-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
  }[color];
  return (
    <div className={`border rounded-lg p-4 ${bg}`}>
      <div className="text-xs font-medium opacity-70">{label}</div>
      <div className="text-2xl font-bold mt-1">{value.toLocaleString('id-ID')}</div>
      {selected !== undefined && (
        <div className="text-xs mt-0.5 opacity-70">
          {selected.toLocaleString('id-ID')} dipilih
        </div>
      )}
    </div>
  );
}

function SectionExpander({
  open,
  onToggle,
  title,
  hint,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-neutral-50"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-neutral-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-neutral-500" />
        )}
        <div className="flex-1">
          <div className="text-sm font-semibold text-neutral-900">{title}</div>
          <div className="text-xs text-neutral-500">{hint}</div>
        </div>
      </button>
      {open && <div className="border-t border-neutral-100">{children}</div>}
    </div>
  );
}

function NewRecordsTable({
  records,
  selected,
  onToggle,
  onToggleAll,
}: {
  records: PreviewRecord[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: (checked: boolean) => void;
}) {
  const allChecked = records.length > 0 && selected.size === records.length;
  return (
    <div className="max-h-96 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase sticky top-0">
          <tr>
            <th className="px-3 py-2 w-8">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(e) => onToggleAll(e.target.checked)}
              />
            </th>
            <th className="text-left px-3 py-2 font-medium">Legacy ID</th>
            <th className="text-left px-3 py-2 font-medium">Nama</th>
            <th className="text-left px-3 py-2 font-medium">No HP</th>
            <th className="text-left px-3 py-2 font-medium">Email</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {records.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center py-6 text-neutral-500 text-sm">
                Tidak ada record baru.
              </td>
            </tr>
          ) : (
            records.map((r) => (
              <tr key={r.legacyId} className="hover:bg-neutral-50">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(r.legacyId)}
                    onChange={() => onToggle(r.legacyId)}
                  />
                </td>
                <td className="px-3 py-2 text-neutral-500 font-mono text-xs">{r.legacyId}</td>
                <td className="px-3 py-2 text-neutral-900 font-medium">{r.namaLengkap}</td>
                <td className="px-3 py-2 text-neutral-600 text-xs">{r.noHp ?? '—'}</td>
                <td className="px-3 py-2 text-neutral-600 text-xs">{r.email ?? '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function RedundantRecordsTable({
  records,
  actions,
  onChange,
  onSetAll,
}: {
  records: RedundantRecord[];
  actions: Map<number, RedundantAction>;
  onChange: (id: number, action: RedundantAction) => void;
  onSetAll: (action: RedundantAction) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-5 py-2 border-b border-neutral-100 bg-neutral-50">
        <span className="text-xs text-neutral-500">Set all:</span>
        {(['SKIP', 'NULL_NOHP', 'NULL_EMAIL'] as RedundantAction[]).map((a) => (
          <button
            key={a}
            onClick={() => onSetAll(a)}
            className="text-xs px-2 py-1 border border-neutral-300 rounded hover:bg-white"
          >
            {a}
          </button>
        ))}
      </div>
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Nama Legacy</th>
              <th className="text-left px-3 py-2 font-medium">Conflict</th>
              <th className="text-left px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {records.map((r) => (
              <tr key={r.legacyId} className="hover:bg-neutral-50">
                <td className="px-3 py-2">
                  <div className="text-neutral-900 font-medium">{r.namaLengkap}</div>
                  <div className="text-xs text-neutral-500 font-mono">#{r.legacyId}</div>
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.conflicts.map((c) => (
                    <div key={c.field + c.value} className="text-amber-700">
                      <strong>{c.field}:</strong> {c.value}
                      <div className="text-neutral-500">
                        ↳ collide dgn {c.withJemaatNama}
                      </div>
                    </div>
                  ))}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={actions.get(r.legacyId) ?? 'SKIP'}
                    onChange={(e) =>
                      onChange(r.legacyId, e.target.value as RedundantAction)
                    }
                    className="text-xs px-2 py-1 border border-neutral-300 rounded"
                  >
                    {(
                      ['SKIP', 'NULL_NOHP', 'NULL_EMAIL', 'IMPORT_AS_IS'] as RedundantAction[]
                    ).map((a) => (
                      <option key={a} value={a}>
                        {REDUNDANT_ACTION_LABEL[a]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CabangCountsCard({ tenantsQ }: { tenantsQ: any }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5">
      <h2 className="font-semibold text-neutral-900 mb-3">Data ter-import per Cabang</h2>
      {tenantsQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat...
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
          {(tenantsQ.data?.cabangCounts ?? []).map((c: CabangCount) => (
            <div
              key={c.cabangNama}
              className="p-3 border border-neutral-100 rounded-lg bg-neutral-50"
            >
              <div className="text-xs font-semibold text-neutral-700">{c.cabangNama}</div>
              <div className="flex gap-3 text-xs mt-1">
                <span className="flex items-center gap-1 text-neutral-600">
                  <Users className="w-3 h-3" /> {c.jemaatCount}
                </span>
                <span className="flex items-center gap-1 text-neutral-600">
                  <UsersRound className="w-3 h-3" /> {c.groupCount}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-neutral-500 mt-3">
        Angka = jemaat/group dengan <code>legacyShiftsoftId</code> not null. Dari DB langsung.
      </p>
    </div>
  );
}

function AsyncJobsPanel() {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<'GROUP' | 'CLEANUP' | 'SEED_CABANG'>('GROUP');
  const [dryRun, setDryRun] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const jobsQ = useQuery({
    queryKey: ['shiftsoft-sync', 'jobs'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Job[] }>('/admin/shiftsoft-sync');
      return res.data.data;
    },
    refetchInterval: (data: any) =>
      Array.isArray(data) && data.some((j: Job) => j.status === 'RUNNING') ? 3_000 : 20_000,
  });

  const triggerMut = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ data: Job }>('/admin/shiftsoft-sync', {
        phase,
        tenantSlug: 'all',
        options: { dryRun },
      });
      return res.data.data;
    },
    onSuccess: (job) => {
      qc.invalidateQueries({ queryKey: ['shiftsoft-sync'] });
      toast.success(`Job ${PHASE_LABEL[job.phase]} dimulai`);
      setExpandedJobId(job.id);
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.error?.message ?? 'Gagal trigger'),
  });

  return (
    <details className="bg-white border border-neutral-200 rounded-xl">
      <summary className="p-5 cursor-pointer flex items-center gap-2 font-semibold text-neutral-900">
        <Terminal className="w-4 h-4" /> Advanced: Async jobs (Group / Cleanup / Seed Cabang)
      </summary>
      <div className="px-5 pb-5 space-y-4">
        <p className="text-xs text-neutral-500">
          Rare-use jobs — fire-and-forget spawn script tsx. Progress via polling job status.
          Untuk Jemaat, pakai wizard preview di atas.
        </p>
        <div className="flex items-center gap-3">
          <select
            value={phase}
            onChange={(e) => setPhase(e.target.value as any)}
            className="px-3 py-2 border border-neutral-300 rounded-lg text-sm"
          >
            <option value="GROUP">Group + Membership (all tenant)</option>
            <option value="CLEANUP">Cleanup System Accounts</option>
            <option value="SEED_CABANG">Seed CabangGereja</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
            />
            Dry-run
          </label>
          <button
            onClick={() => triggerMut.mutate()}
            disabled={triggerMut.isPending}
            className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 text-white text-sm rounded-lg hover:bg-neutral-900 disabled:opacity-50"
          >
            {triggerMut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Trigger
          </button>
        </div>

        <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-100">
          {(jobsQ.data ?? []).length === 0 ? (
            <div className="p-4 text-sm text-neutral-500 text-center">Belum ada job.</div>
          ) : (
            (jobsQ.data ?? []).map((j) => {
              const StatusIcon = STATUS_ICON[j.status];
              const PhaseIcon = PHASE_ICON[j.phase];
              const expanded = expandedJobId === j.id;
              return (
                <div key={j.id}>
                  <button
                    onClick={() => setExpandedJobId(expanded ? null : j.id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-neutral-50"
                  >
                    {expanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                    )}
                    <PhaseIcon className="w-3.5 h-3.5 text-neutral-500" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-neutral-900 truncate">
                        {PHASE_LABEL[j.phase]}{' '}
                        <span className="text-neutral-500 font-normal">· {j.tenantSlug}</span>
                      </div>
                      <div className="text-xs text-neutral-500">
                        {j.triggeredBy?.namaLengkap ?? '—'} · {formatDate(j.startedAt)} ·{' '}
                        {durationSec(j.startedAt, j.finishedAt)}s
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[j.status]}`}
                    >
                      <StatusIcon
                        className={`w-3 h-3 ${j.status === 'RUNNING' ? 'animate-spin' : ''}`}
                      />
                      {j.status}
                    </span>
                  </button>
                  {expanded && (
                    <div className="px-5 pb-3 bg-neutral-50 text-xs">
                      {j.errorMessage && (
                        <div className="text-red-700 bg-red-50 border border-red-200 rounded p-2 mb-2 mt-2">
                          <strong>Error:</strong> {j.errorMessage}
                        </div>
                      )}
                      {j.logTail && (
                        <pre className="bg-neutral-900 text-neutral-100 rounded p-2 overflow-x-auto text-[10px] leading-4 max-h-64 overflow-y-auto mt-2">
                          {j.logTail}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </details>
  );
}
