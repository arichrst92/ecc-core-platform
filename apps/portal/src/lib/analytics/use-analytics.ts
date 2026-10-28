/** Sumber data menu Analitik & Monitor Ibadah (core-api /admin/analytics, /admin/ibadah-monitor). */
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  AnalyticsFilter,
  ApiPerformance,
  IbadahMonitor,
  IbadahMonitorOptions,
  LiveSnapshot,
  PageDetail,
  PageRow,
  PageSummary,
} from './types';

async function get<T>(path: string, params?: Record<string, string | undefined>) {
  return (await apiClient.get<{ data: T }>(path, { params })).data.data;
}

const fp = (f: AnalyticsFilter) => ({ periode: f.periode, platform: f.platform, mode: f.mode });

export function usePageSummary(f: AnalyticsFilter) {
  return useQuery({ queryKey: ['analytics', 'summary', f], queryFn: () => get<PageSummary>('/admin/analytics/pages/summary', fp(f)) });
}

export function usePages(f: AnalyticsFilter) {
  return useQuery({ queryKey: ['analytics', 'pages', f], queryFn: () => get<PageRow[]>('/admin/analytics/pages', fp(f)) });
}

export function usePageDetail(route: string | null, f: AnalyticsFilter) {
  return useQuery({
    queryKey: ['analytics', 'page-detail', route, f],
    queryFn: () => get<PageDetail>('/admin/analytics/pages/detail', { ...fp(f), route: route! }),
    enabled: !!route,
  });
}

/** Diperbarui tiap 10 detik selama tab terlihat. */
export function useLive() {
  return useQuery({
    queryKey: ['analytics', 'live'],
    queryFn: () => get<LiveSnapshot>('/admin/analytics/live'),
    refetchInterval: 10_000,
  });
}

export function useApiPerformance(f: AnalyticsFilter) {
  return useQuery({
    queryKey: ['analytics', 'api', f.periode, f.platform],
    queryFn: () => get<ApiPerformance>('/admin/analytics/api', { periode: f.periode, platform: f.platform }),
    refetchInterval: 60_000,
  });
}

export function useIbadahMonitorOptions(cabangId: string) {
  return useQuery({
    queryKey: ['ibadah-monitor', 'options', cabangId],
    queryFn: () => get<IbadahMonitorOptions>('/admin/ibadah-monitor/options', { cabangId }),
    enabled: !!cabangId,
    refetchInterval: 5 * 60_000,
  });
}

/** Diperbarui tiap 15 detik; data terakhir tetap tampil bila koneksi putus. */
export function useIbadahMonitor(p: { cabangId: string; ibadahId?: string }) {
  return useQuery({
    queryKey: ['ibadah-monitor', p.cabangId, p.ibadahId ?? 'auto'],
    queryFn: () => get<IbadahMonitor>('/admin/ibadah-monitor', { cabangId: p.cabangId, ibadahId: p.ibadahId || undefined }),
    enabled: !!p.cabangId || !!p.ibadahId,
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    retry: 2,
  });
}
