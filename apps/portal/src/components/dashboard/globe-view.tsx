'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { feature } from 'topojson-client';
import { Building2, Loader2, MapPin } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

// ============== Types ==============

interface CabangLocation {
  id: string;
  nama: string;
  kode: string;
  latitude: number;
  longitude: number;
  kontak: string | null;
  jemaatCount: number;
  sinode: { id: string; nama: string };
}

// ============== Component ==============

export default function GlobeView() {
  const router = useRouter();
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [countries, setCountries] = useState<any[]>([]);

  const locationsQ = useQuery({
    queryKey: ['cabang', 'locations'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CabangLocation[] }>('/admin/cabang/locations');
      return res.data.data;
    },
  });

  // Observe container dimensions — globe.gl perlu ukuran eksplisit untuk
  // canvas WebGL-nya.
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setDims({ w: Math.floor(r.width), h: Math.floor(r.height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Material solid putih untuk globe (laut). Di-memo supaya tidak re-create
  // setiap render.
  const globeMaterial = useMemo(
    () =>
      new THREE.MeshPhongMaterial({
        color: '#ffffff',
        // shininess rendah supaya tidak ada hot spot reflection
        shininess: 4,
      }),
    [],
  );

  // Load country polygons dari world-atlas TopoJSON (CDN, ~100KB).
  // 110m resolution cukup detail untuk thumbnail globe.
  useEffect(() => {
    let cancelled = false;
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json')
      .then((r) => r.json())
      .then((topo: any) => {
        if (cancelled) return;
        const fc = feature(topo, topo.objects.countries) as any;
        setCountries(fc.features ?? []);
      })
      .catch(() => {
        // Best-effort — kalau gagal, globe tetap render polos.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Adaptive altitude: globe lebih dekat (zoom in) di layar besar, agak
  // mundur di layar kecil supaya globe penuh visible.
  const altitude = useMemo(() => {
    if (dims.w === 0) return 1.7;
    const ratio = dims.h / dims.w;
    // Wide screens (ratio < 0.6) → zoom in lebih jauh
    // Tall screens / mobile (ratio > 1) → mundur supaya muat
    if (ratio > 1) return 2.2;
    if (ratio > 0.8) return 1.85;
    if (ratio > 0.6) return 1.55;
    return 1.35;
  }, [dims]);

  // Auto-rotate + initial centered position saat globe siap.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const controls = g.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
    controls.enableZoom = true;
    // Fokus awal ke Indonesia, altitude adaptif.
    g.pointOfView({ lat: -2, lng: 118, altitude }, 600);
  }, [dims.w, altitude]);

  const points = useMemo(() => locationsQ.data ?? [], [locationsQ.data]);

  const isLoading = locationsQ.isLoading;
  const isEmpty = !isLoading && points.length === 0;

  return (
    <div ref={containerRef} className="absolute inset-0">
      {/* Welcome overlay top-left — light theme card */}
      <div className="absolute top-4 left-4 z-10 max-w-xs">
        <div className="bg-white shadow-lg border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-brand-500" />
            <h1 className="font-semibold text-neutral-900">ECC Network</h1>
          </div>
          <p className="text-xs text-neutral-500 leading-relaxed">
            {isLoading
              ? 'Memuat cabang gereja...'
              : isEmpty
                ? 'Belum ada cabang dengan koordinat. Tambah lat/lng di halaman Cabang Gereja.'
                : `${points.length} cabang gereja ter-plot. Klik marker untuk lihat detail.`}
          </p>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center text-neutral-400 pointer-events-none">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400 pointer-events-none">
          <MapPin className="w-10 h-10 mb-2" />
          <p>Belum ada cabang dengan koordinat.</p>
        </div>
      )}

      {/* Globe — style minimalis monokrom:
          - globeMaterial putih solid (lautan)
          - polygonsData natural-earth country boundaries → abu untuk daratan
          - Atmosfer abu sangat lembut, menyatu dengan tema putih portal */}
      {dims.w > 0 && (
        <Globe
          ref={globeRef as any}
          width={dims.w}
          height={dims.h}
          backgroundColor="rgba(255,255,255,0)"
          globeMaterial={globeMaterial}
          atmosphereColor="#e5e7eb"
          atmosphereAltitude={0.18}
          showGraticules={false}
          // ===== Countries (land) polygons =====
          polygonsData={countries}
          polygonAltitude={0.005}
          polygonCapColor={() => '#9ca3af'}
          polygonSideColor={() => 'rgba(156,163,175,0.4)'}
          polygonStrokeColor={() => '#ffffff'}
          // ===== Points (cabang markers) =====
          pointsData={points}
          pointLat={(d: any) => d.latitude}
          pointLng={(d: any) => d.longitude}
          pointAltitude={(d: any) => {
            // Tinggi marker proporsional dgn jumlah jemaat (jadi cabang besar lebih jelas)
            return 0.04 + Math.min(0.15, (d.jemaatCount ?? 0) / 500);
          }}
          pointRadius={0.6}
          pointColor={() => '#ff7900'}
          pointResolution={12}
          pointLabel={() => ''}
          onPointClick={(d: any) => {
            if (d?.id) router.push(`/dashboard/cabang/${d.id}`);
          }}
          // ===== HTML labels — popup permanent dengan nama cabang =====
          // Di-render via globe.gl htmlElementsData, sehingga otomatis ikut
          // rotasi globe & posisi marker. Tinggi label = altitude marker
          // ditambah sedikit offset supaya melayang di atas point.
          htmlElementsData={points}
          htmlLat={(d: any) => d.latitude}
          htmlLng={(d: any) => d.longitude}
          htmlAltitude={(d: any) =>
            0.05 + Math.min(0.15, (d.jemaatCount ?? 0) / 500) + 0.02
          }
          htmlElement={(d: any) => {
            const data = d as CabangLocation;
            const el = document.createElement('div');
            el.style.pointerEvents = 'auto';
            el.style.cursor = 'pointer';
            el.style.transform = 'translate(-50%, -100%)';
            el.innerHTML = `
              <div style="
                display: inline-flex;
                align-items: center;
                gap: 6px;
                background: white;
                color: #171717;
                font-size: 11px;
                font-weight: 600;
                padding: 4px 10px;
                border-radius: 999px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.18);
                border: 1px solid rgba(0,0,0,0.06);
                white-space: nowrap;
                transition: transform 0.15s ease, box-shadow 0.15s ease;
              ">
                <span style="
                  width: 6px;
                  height: 6px;
                  border-radius: 999px;
                  background: #ff7900;
                  box-shadow: 0 0 0 3px rgba(255,121,0,0.25);
                  flex: 0 0 auto;
                "></span>
                <span>${data.nama}</span>
                <span style="
                  color: #737373;
                  font-weight: 500;
                  font-size: 10px;
                ">· ${data.jemaatCount}</span>
              </div>
              <div style="
                width: 1px;
                height: 12px;
                background: rgba(0,0,0,0.18);
                margin: 0 auto;
              "></div>
            `;
            el.addEventListener('mouseenter', () => {
              const card = el.firstElementChild as HTMLElement | null;
              if (card) {
                card.style.transform = 'translateY(-2px)';
                card.style.boxShadow = '0 8px 18px rgba(0,0,0,0.22)';
              }
            });
            el.addEventListener('mouseleave', () => {
              const card = el.firstElementChild as HTMLElement | null;
              if (card) {
                card.style.transform = '';
                card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.18)';
              }
            });
            el.addEventListener('click', () => {
              router.push(`/dashboard/cabang/${data.id}`);
            });
            return el;
          }}
          // ===== Rings — efek pulsing untuk marker, supaya kelihatan hidup =====
          ringsData={points}
          ringLat={(d: any) => d.latitude}
          ringLng={(d: any) => d.longitude}
          ringColor={() => (t: number) => `rgba(255,121,0,${1 - t})`}
          ringMaxRadius={2.5}
          ringPropagationSpeed={1.5}
          ringRepeatPeriod={1800}
        />
      )}
    </div>
  );
}
