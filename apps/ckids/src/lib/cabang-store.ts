/**
 * Cabang selector state — di-persist di localStorage. Semua request ke
 * /admin/gift-stall/* butuh cabangId parameter yang di-set di header.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CabangState {
  cabangId: string | null;
  cabangNama: string | null;
  setCabang: (c: { cabangId: string; cabangNama: string }) => void;
  clear: () => void;
}

export const useCabangStore = create<CabangState>()(
  persist(
    (set) => ({
      cabangId: null,
      cabangNama: null,
      setCabang: ({ cabangId, cabangNama }) => set({ cabangId, cabangNama }),
      clear: () => set({ cabangId: null, cabangNama: null }),
    }),
    { name: 'ecc-ckids-cabang' },
  ),
);
