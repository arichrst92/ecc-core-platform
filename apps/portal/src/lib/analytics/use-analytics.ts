/** Sumber data menu Analitik (core-api /admin/analytics). */
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  AnalyticsFilter,
  ApiPerformance,
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
