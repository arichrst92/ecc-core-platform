/**
 * Axios instance dengan JWT injection + auto-refresh 401.
 * Pattern sama dgn apps/portal — copy minimal.
 */
import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import { useAuthStore } from './auth-store';
import { SessionExpiredError, bearerOf, createTokenRefresher } from './token-refresh';

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_CORE_API_URL ?? 'http://localhost:4100',
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function redirectToLogin() {
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

const refreshTokens = createTokenRefresher(
  useAuthStore,
  process.env.NEXT_PUBLIC_CORE_API_URL ?? 'http://localhost:4100',
  'ecc-ckids-auth-refresh',
);

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

    original._retry = true;
    try {
      const accessToken = await refreshTokens(bearerOf(original.headers));
      original.headers = { ...original.headers, Authorization: `Bearer ${accessToken}` };
      return apiClient(original);
    } catch (refreshErr) {
      // Logout HANYA kalau sesi benar-benar tidak valid. Error jaringan → tetap login.
      if (refreshErr instanceof SessionExpiredError) {
        useAuthStore.getState().clearAuth();
        redirectToLogin();
      }
      return Promise.reject(refreshErr);
    }
  },
);
