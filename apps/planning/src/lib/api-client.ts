import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import { useAuthStore } from './auth-store';
import { SessionExpiredError, bearerOf, createTokenRefresher } from './token-refresh';

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

// Auto-refresh on 401 — aman lintas tab, berbagi lock + storage dgn portal (satu origin).
const refreshTokens = createTokenRefresher(
  useAuthStore,
  apiClient.defaults.baseURL ?? '',
  'ecc-auth-refresh',
);

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

    original._retry = true;
    try {
      const accessToken = await refreshTokens(bearerOf(original.headers));
      original.headers = { ...original.headers, Authorization: `Bearer ${accessToken}` };
      return apiClient(original);
    } catch (refreshErr) {
      if (refreshErr instanceof SessionExpiredError) {
        useAuthStore.getState().clearAuth();
        redirectToLogin();
      }
      return Promise.reject(refreshErr);
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
