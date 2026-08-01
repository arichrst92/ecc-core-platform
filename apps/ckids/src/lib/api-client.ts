/**
 * Axios instance dengan JWT injection + auto-refresh 401.
 * Pattern sama dgn apps/portal — copy minimal.
 */
import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import { useAuthStore } from './auth-store';

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_CORE_API_URL ?? 'http://localhost:4100',
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else if (token) resolve(token);
  });
  pendingQueue = [];
}

function redirectToLogin() {
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

apiClient.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as AxiosRequestConfig & { _retry?: boolean };
    if (
      err.response?.status !== 401 ||
      original?._retry ||
      original?.url?.includes('/auth/refresh') ||
      original?.url?.includes('/auth/otp/')
    ) {
      return Promise.reject(err);
    }

    const { refreshToken, setAuth, clearAuth, user } = useAuthStore.getState();
    if (!refreshToken || !user) {
      clearAuth();
      redirectToLogin();
      return Promise.reject(err);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token) => {
            original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
            resolve(apiClient(original));
          },
          reject,
        });
      });
    }

    original._retry = true;
    isRefreshing = true;
    try {
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_CORE_API_URL ?? 'http://localhost:4100'}/auth/refresh`,
        { refreshToken },
      );
      const { accessToken, refreshToken: newRefresh } = res.data.data;
      setAuth({ accessToken, refreshToken: newRefresh, user });
      processQueue(null, accessToken);
      original.headers = { ...original.headers, Authorization: `Bearer ${accessToken}` };
      return apiClient(original);
    } catch (refreshErr) {
      processQueue(refreshErr, null);
      clearAuth();
      redirectToLogin();
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  },
);
