import { BottomDock } from '@/components/bottom-dock';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-neutral-50">
      {/* Padding-bottom untuk clear BottomDock (dock height ~60px + gap 16px) */}
      <main className="flex-1 p-6 pb-28 overflow-auto">{children}</main>
      <BottomDock />
    </div>
  );
}
