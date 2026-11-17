/** Tipe & komponen kecil bersama untuk halaman Announcement (Portal). */

export type AnnouncementStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELLED';
export type AnnouncementChannel = 'IN_APP' | 'WHATSAPP' | 'EMAIL';
export interface AnnouncementLink {
  label: string;
  url: string;
}
export interface ChannelStats {
  sent: number;
  failed: number;
  pending: number;
  skipped: number;
}
export interface AnnouncementItem {
  id: string;
  slug: string;
  judul: string;
  isi: string;
  bannerUrl: string | null;
  links: AnnouncementLink[];
  audienceMode: 'ALL' | 'FILTER';
  combine: 'OR' | 'AND';
  cabangIds: string[];
  areaIds: string[];
  homecellIds: string[];
  jemaatIds: string[];
  channels: AnnouncementChannel[];
  waProvider: 'auto' | 'fonnte';
  status: AnnouncementStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  recipientCount: number;
  publicUrl: string;
  updatedAt: string;
  stats: { inApp: number; read: number; wa: ChannelStats; email: ChannelStats };
}

export const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

export function AnnouncementStatusBadge({ a }: { a: Pick<AnnouncementItem, 'status' | 'scheduledAt' | 'startedAt' | 'stats' | 'channels'> }) {
  const map: Record<AnnouncementStatus, { label: string; cls: string }> = {
    DRAFT: { label: 'Draft', cls: 'bg-neutral-100 text-neutral-700' },
    SCHEDULED: { label: 'Terjadwal', cls: 'bg-amber-50 text-amber-800' },
    SENDING: { label: 'Mengirim', cls: 'bg-blue-50 text-blue-700' },
    SENT: { label: 'Terkirim', cls: 'bg-emerald-50 text-emerald-700' },
    CANCELLED: { label: 'Dibatalkan', cls: 'bg-neutral-100 text-neutral-500' },
  };
  const m = map[a.status] ?? map.DRAFT;
  const waTotal = a.stats.wa.sent + a.stats.wa.failed + a.stats.wa.pending;
  const sub =
    a.status === 'SCHEDULED'
      ? fmtDateTime(a.scheduledAt)
      : a.status === 'SENDING' && a.channels.includes('WHATSAPP') && waTotal
        ? `WA ${Math.round(((a.stats.wa.sent + a.stats.wa.failed) / waTotal) * 100)}%`
        : a.status === 'SENT'
          ? fmtDateTime(a.startedAt)
          : '';
  return (
    <div>
      <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>
      {sub ? <div className="text-[11px] text-neutral-500 mt-0.5">{sub}</div> : null}
    </div>
  );
}
