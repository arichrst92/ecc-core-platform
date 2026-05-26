import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import { useAuthStore } from './auth-store';

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
// Concurrency strategy:
// Saat 5 request fire bareng dan semua kena 401, kita hanya panggil /refresh
// SEKALI. Request lain di-queue, lalu setelah refresh sukses semua di-retry
// dengan token baru. Kalau refresh gagal, semua queued request di-reject dan
// user di-redirect ke /login.
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

apiClient.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as AxiosRequestConfig & { _retry?: boolean };

    // Hanya handle 401 yang belum di-retry, dan bukan request refresh itu sendiri.
    // (Catatan: cek /auth/face/login dihilangkan — portal tidak lagi expose
    // face login, fitur tersebut hanya di mobile app.)
    if (
      err.response?.status !== 401 ||
      original?._retry ||
      original?.url?.includes('/auth/refresh') ||
      original?.url?.includes('/auth/otp/')
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
      // Antri sampai refresh selesai
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (newToken: string) => {
            if (original.headers) {
              original.headers.Authorization = `Bearer ${newToken}`;
            }
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

      // Update store (preserve user info yang sudah ada)
      setAuth({
        accessToken,
        refreshToken: newRefresh,
        user: user!,
      });

      processQueue(null, accessToken);

      if (original.headers) {
        original.headers.Authorization = `Bearer ${accessToken}`;
      }
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
