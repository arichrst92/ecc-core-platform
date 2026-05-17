/**
 * React Query hooks untuk CRUD operations terhadap resource API.
 * Dipakai oleh CrudPage factory.
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiClient } from './api-client';
import type { PaginatedResponse, SingleResponse } from './crud-types';

interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function useList<T>(resource: string, endpoint: string, params: ListParams = {}) {
  return useQuery({
    queryKey: [resource, 'list', params],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<T>>(endpoint, { params });
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

/**
 * Infinite scroll variant — fetch progressive pages.
 * Filter/search berubah → query baru (reset semua page).
 */
export function useInfiniteList<T>(
  resource: string,
  endpoint: string,
  params: Omit<ListParams, 'page'> & { limit?: number } = {},
) {
  const limit = params.limit ?? 50;
  return useInfiniteQuery({
    queryKey: [resource, 'infinite', { ...params, limit }],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = await apiClient.get<PaginatedResponse<T>>(endpoint, {
        params: { ...params, limit, page: pageParam },
      });
      return res.data;
    },
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined,
    placeholderData: (prev) => prev,
  });
}

export function useDetail<T>(resource: string, endpoint: string, id: string | null) {
  return useQuery({
    queryKey: [resource, 'detail', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiClient.get<SingleResponse<T>>(`${endpoint}/${id}`);
      return res.data.data;
    },
  });
}

export function useCreate<T>(resource: string, endpoint: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<T>) => {
      const res = await apiClient.post<SingleResponse<T>>(endpoint, input);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [resource] });
      toast.success('Berhasil ditambahkan');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message ?? 'Gagal menambah data');
    },
  });
}

export function useUpdate<T>(resource: string, endpoint: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<T> }) => {
      const res = await apiClient.patch<SingleResponse<T>>(`${endpoint}/${id}`, input);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [resource] });
      toast.success('Perubahan tersimpan');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message ?? 'Gagal menyimpan');
    },
  });
}

export function useDelete(resource: string, endpoint: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`${endpoint}/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [resource] });
      toast.success('Data dihapus');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message ?? 'Gagal menghapus');
    },
  });
}

/** Hook untuk fetch options dari relation endpoint (dipakai relation-field). */
export function useRelationOptions(endpoint: string, enabled = true) {
  return useQuery({
    queryKey: ['relation-options', endpoint],
    enabled,
    queryFn: async () => {
      const res = await apiClient.get(endpoint, { params: { limit: 100 } });
      // Support kedua bentuk: paginated atau direct array
      const data = res.data.data;
      return (Array.isArray(data) ? data : []) as Record<string, unknown>[];
    },
    staleTime: 60_000,
  });
}
