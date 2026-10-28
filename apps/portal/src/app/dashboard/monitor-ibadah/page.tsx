'use client';

/**
 * Monitor Ibadah — untuk layar di command room gereja (menu: monitor-ibadah).
 * Buka dengan ?kiosk=1 untuk langsung layar penuh. Saran: akun khusus
 * "Command Room" yang hanya diberi akses menu ini.
 */
import { useEffect, useState } from 'react';
import { MonitorPlay } from 'lucide-react';
import { IbadahMonitor } from '@/components/analytics/ibadah-monitor';

export default function MonitorIbadahPage() {
  const [kiosk, setKiosk] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('kiosk') === '1') setKiosk(true);
  }, []);

  function toggle() {
    const next = !kiosk;
    setKiosk(next);
    try {
      if (next) void document.documentElement.requestFullscreen?.();
      else if (document.fullscreenElement) void document.exitFullscreen();
    } catch {
      /* browser menolak layar penuh — tampilan tetap menutupi menu */
    }
  }

  return (
    <div className="space-y-4">
      {!kiosk ? (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
            <MonitorPlay className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-neutral-900">Monitor Ibadah</h1>
            <p className="text-sm text-neutral-500">
              Kehadiran, check-in, CKids, tamu, dan kondisi sistem secara langsung — untuk layar command room. Tekan “Layar penuh” di monitor.
            </p>
          </div>
        </div>
      ) : null}
      <IbadahMonitor kiosk={kiosk} onToggleKiosk={toggle} />
    </div>
  );
}
