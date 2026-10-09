import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import { useAuthStore } from './auth-store';

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_CORE_API_URL ?? 'http://localhost:4100',
  headers: { 'Content-Type': 'application/json' },
});

// Inject Bearer token on each request.
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401.
let isRefreshing = false;
let pendingQueue: Array<{ resolve: (t: string) => void; reject: (err: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null) {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else if (token) resolve(token);
  });
  pendingQueue = [];
}

apiClient.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as AxiosRequestConfig & { _retry?: boolean };

    // 403 di /planning/* → user bukan IT Minister Team. Redirect ke /no-access.
    if (
      err.response?.status === 403 &&
      typeof window !== 'undefined' &&
      !window.location.pathname.startsWith('/planning/no-access')
    ) {
      window.location.href = '/planning/no-access';
      return Promise.reject(err);
    }

    if (
      err.response?.status !== 401 ||
      original?._retry ||
      original?.url?.includes('/auth/refresh')
    ) {
      return Promise.reject(err);
    }

    const { refreshToken, setAuth, clearAuth, user } = useAuthStore.getState();
    if (!refreshToken) {
      clearAuth();
      redirectToLogin();
      return Promise.reject(err);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (newToken: string) => {
            if (original.headers) original.headers.Authorization = `Bearer ${newToken}`;
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
        `${apiClient.defaults.baseURL}/auth/refresh`,
        { refreshToken },
        { headers: { 'Content-Type': 'application/json' } },
      );
      const { accessToken, refreshToken: newRefresh } = res.data.data;
      setAuth({ accessToken, refreshToken: newRefresh, user: user! });
      processQueue(null, accessToken);
      if (original.headers) original.headers.Authorization = `Bearer ${accessToken}`;
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

/**
 * Redirect ke portal /login dgn ?next=/planning/... biar balik ke tempat semula
 * setelah login. Portal + planning sekarang same-origin.
 */
function redirectToLogin() {
  if (typeof window !== 'undefined') {
    const currentPath = window.location.pathname + window.location.search;
    window.location.href = `/login?next=${encodeURIComponent(currentPath)}`;
  }
}

export { redirectToLogin };
