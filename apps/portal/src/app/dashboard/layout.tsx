import { BottomDock } from '@/components/bottom-dock';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Ruang bawah = tinggi BottomDock nyata (CSS var --dock-space diisi oleh
          BottomDock via ResizeObserver) + safe-area; fallback 8rem sebelum terukur. */}
      <main
        className="flex-1 min-w-0 p-3 sm:p-6 overflow-auto"
        style={{ paddingBottom: 'calc(var(--dock-space, 8rem) + env(safe-area-inset-bottom, 0px))' }}
      >
        {children}
      </main>
      <BottomDock />
    </div>
  );
}
