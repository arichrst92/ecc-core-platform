/**
 * Server-side helper untuk memanggil BE /web-action/* dengan session cookie.
 * Dipakai di server component (page pembayaran) + route handler proxy.
 */
const API_BASE = process.env.NEXT_PUBLIC_CORE_API_URL ?? 'https://api.eccchurch.global';

export interface WaSessionInfo {
  jemaat: { id: string; namaLengkap: string };
  eventId: string;
  purpose: string;
  expiresAt: string;
}

export interface WaFamilyItem {
  id: string;
  tipeRelasi: { nama: string };
  jemaat: { id: string; namaLengkap: string; fotoUrl: string | null };
}

export interface WaParticipation {
  id: string;
  jemaatId: string;
  status: string;
  nominalBayar: string | number | null;
  buktiTransferUrl: string | null;
  isSelf: boolean;
  relationLabel: string;
  jemaat: { id: string; namaLengkap: string; fotoUrl: string | null };
}

export async function waGet<T>(path: string, session: string): Promise<T | null> {
  try {
    const r = await fetch(`${API_BASE}/web-action/${path}`, {
      headers: { 'x-web-session': session },
      cache: 'no-store',
    });
    if (!r.ok) return null;
    const json = (await r.json()) as { data: T };
    return json.data;
  } catch {
    return null;
  }
}

export { API_BASE as WA_API_BASE };
