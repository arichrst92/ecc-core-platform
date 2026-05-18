'use client';

import Link from 'next/link';
import { Building2, Church, Users, Shield, Calendar, Layers, HandHeart } from 'lucide-react';

const masterDataLinks = [
  { href: '/dashboard/sinode', label: 'Sinode', icon: Building2, desc: 'Kelola data sinode' },
  { href: '/dashboard/cabang', label: 'Cabang Gereja', icon: Church, desc: 'Cabang-cabang di tiap sinode' },
  { href: '/dashboard/jemaat', label: 'Jemaat', icon: Users, desc: 'Data anggota jemaat' },
  { href: '/dashboard/role', label: 'Role & Sub-Role', icon: Shield, desc: 'Klasifikasi keanggotaan' },
  { href: '/dashboard/pelayanan', label: 'Pelayanan', icon: HandHeart, desc: 'Tim ministry & roles' },
  { href: '/dashboard/ibadah', label: 'Ibadah', icon: Calendar, desc: 'Jadwal ibadah per cabang' },
  { href: '/dashboard/kategori-ibadah', label: 'Kategori Ibadah', icon: Layers, desc: 'Kategori master ibadah' },
];

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900">Selamat Datang</h1>
      <p className="text-neutral-500 mt-1">Pilih master data yang ingin Anda kelola.</p>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {masterDataLinks.map(({ href, label, icon: Icon, desc }) => (
          <Link
            key={href}
            href={href}
            className="group bg-white border border-neutral-200 rounded-xl p-5 hover:border-brand-400 hover:shadow-md transition"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600 group-hover:bg-brand-500 group-hover:text-white transition">
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-neutral-900">{label}</div>
                <div className="text-xs text-neutral-500">{desc}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
