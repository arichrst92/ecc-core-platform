/**
 * Ibadah + tanggal context untuk scanner page — persist supaya admin gak
 * perlu re-pick tiap masuk halaman.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface IbadahContextState {
  ibadahId: string | null;
  ibadahNama: string | null;
  isKidsIbadah: boolean;
  requiresCheckout: boolean;
  tanggalIbadah: string | null; // YYYY-MM-DD
  setContext: (c: {
    ibadahId: string;
    ibadahNama: string;
    isKidsIbadah: boolean;
    requiresCheckout: boolean;
    tanggalIbadah: string;
  }) => void;
  clear: () => void;
}

export const useIbadahContextStore = create<IbadahContextState>()(
  persist(
    (set) => ({
      ibadahId: null,
      ibadahNama: null,
      isKidsIbadah: false,
      requiresCheckout: false,
      tanggalIbadah: null,
      setContext: (c) => set(c),
      clear: () =>
        set({
          ibadahId: null,
          ibadahNama: null,
          isKidsIbadah: false,
          requiresCheckout: false,
          tanggalIbadah: null,
        }),
    }),
    { name: 'ecc-ckids-ibadah-ctx' },
  ),
);
