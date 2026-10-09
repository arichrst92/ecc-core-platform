import clsx from 'clsx';

const STATUS_COLORS: Record<string, string> = {
  BACKLOG: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  PLANNED: 'bg-blue-100 text-blue-700 border-blue-200',
  IN_PROGRESS: 'bg-brand-100 text-brand-700 border-brand-200',
  IN_REVIEW: 'bg-purple-100 text-purple-700 border-purple-200',
  DONE: 'bg-green-100 text-green-700 border-green-200',
  ARCHIVED: 'bg-neutral-50 text-neutral-500 border-neutral-200',
};

const PRIORITY_COLORS: Record<string, string> = {
  P0: 'bg-red-100 text-red-700 border-red-200',
  P1: 'bg-orange-100 text-orange-700 border-orange-200',
  P2: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  P3: 'bg-neutral-50 text-neutral-500 border-neutral-200',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border',
        STATUS_COLORS[status] ?? 'bg-neutral-100 text-neutral-700',
        className,
      )}
    >
      {status}
    </span>
  );
}

export function PriorityBadge({ priority, className }: { priority: string; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border',
        PRIORITY_COLORS[priority] ?? 'bg-neutral-100 text-neutral-700',
        className,
      )}
    >
      {priority}
    </span>
  );
}

export function Avatar({
  src,
  nama,
  size = 24,
}: {
  src?: string | null;
  nama: string;
  size?: number;
}) {
  const style = { width: size, height: size, fontSize: Math.max(10, size / 2.5) };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={nama} style={style} className="rounded-full object-cover" />;
  }
  return (
    <div
      style={style}
      className="rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold"
      title={nama}
    >
      {nama.charAt(0).toUpperCase()}
    </div>
  );
}

export const STATUS_OPTIONS = ['BACKLOG', 'PLANNED', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'ARCHIVED'] as const;
export const PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3'] as const;
