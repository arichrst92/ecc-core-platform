/**
 * Sumber data menu Analitik. SAAT INI memakai DATA CONTOH (mock.ts) —
 * tampilan dibangun dulu. Setelah backend siap, ganti isi queryFn dengan
 * apiClient (endpoint rencana ada di komentar) tanpa mengubah komponen.
 */
import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { mockApiPerformance, mockLive, mockPageDetail, mockPageSummary, mockPages } from './mock';
import type { AnalyticsFilter } from './types';

/** true = data contoh (tampilkan banner di halaman). */
export const ANALYTICS_IS_MOCK = true;

const delay = <T,>(v: T, ms = 250) => new Promise<T>((r) => setTimeout(() => r(v), ms));

// GET /admin/analytics/pages/summary?periode&platform&mode
export function usePageSummary(f: AnalyticsFilter) {
  return useQuery({ queryKey: ['analytics', 'summary', f], queryFn: () => delay(mockPageSummary(f)) });
}

// GET /admin/analytics/pages?periode&platform&mode
export function usePages(f: AnalyticsFilter) {
  return useQuery({ queryKey: ['analytics', 'pages', f], queryFn: () => delay(mockPages(f)) });
}

// GET /admin/analytics/pages/detail?route&periode&platform&mode
export function usePageDetail(route: string | null, f: AnalyticsFilter) {
  return useQuery({
    queryKey: ['analytics', 'page-detail', route, f],
    queryFn: () => delay(mockPageDetail(route!, f)),
    enabled: !!route,
  });
}

// GET /admin/analytics/live  (diperbarui tiap 10 detik)
export function useLive() {
  const tick = useRef(0);
  return useQuery({
    queryKey: ['analytics', 'live'],
    queryFn: () => delay(mockLive(tick.current++), 120),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}

// GET /admin/analytics/api?periode&platform
export function useApiPerformance(f: AnalyticsFilter) {
  return useQuery({ queryKey: ['analytics', 'api', f], queryFn: () => delay(mockApiPerformance(f)) });
}
