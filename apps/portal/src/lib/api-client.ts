import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import { useAuthStore } from './auth-store';
import { SessionExpiredError, bearerOf, createTokenRefresher } from './token-refresh';

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_CORE_API_URL ?? 'http://localhost:4000',
  headers: { 'Content-Type': 'application/json' },
});

// ===== Request interceptor: inject Bearer token =====
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ===== Response interceptor: auto-refresh on 401 =====
//
// Refresh aman lintas tab (lihat lib/token-refresh.ts). Planning (/planning)
// berbagi localStorage 'ecc-auth' + lock yang sama karena satu origin.
const refreshTokens = createTokenRefresher(
  useAuthStore,
  apiClient.defaults.baseURL ?? '',
  'ecc-auth-refresh',
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

function redirectToLogin() {
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

// ===== Logout helper — beri tahu server untuk revoke refresh token =====
export async function logout(allSessions = false) {
  const { refreshToken, accessToken, clearAuth } = useAuthStore.getState();
  try {
    await apiClient.post(
      `/auth/logout${allSessions ? '?all=true' : ''}`,
      { refreshToken },
      { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
    );
  } catch {
    // ignore — tetap clear auth client-side
  } finally {
    clearAuth();
    redirectToLogin();
  }
}
