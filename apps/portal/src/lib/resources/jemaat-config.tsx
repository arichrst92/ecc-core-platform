import Link from 'next/link';
import { Eye, Heart } from 'lucide-react';
import { createJemaatSchema, updateJemaatSchema } from '@ecc/shared-types';
import type { ResourceConfig } from '../crud-types';
import { statusBadge, nestedField, calcAge } from './render-helpers';

interface JemaatRoleLite {
  role: { nama: string };
  subRole: { nama: string };
  subRoleStatus: { nama: string } | null;
}

interface Jemaat extends Record<string, unknown> {
  id: string;
  cabangId: string;
  namaLengkap: string;
  email: string | null;
  noHp: string | null;
  tanggalLahir: string | null;
  jenisKelamin: 'L' | 'P' | null;
  alamat: string | null;
  tanggalBergabung: string | null;
  fotoUrl: string | null;
  isActive: boolean;
  cabang?: { id: string; nama: string };
  jemaatRoles?: JemaatRoleLite[];
}

/**
 * Buat config jemaat dengan callback untuk membuka modal Relasi.
 * Callback ditanam ke kolom "Relasi" sehingga klik tombol di row bisa
 * trigger state di parent page.
 */
export function buildJemaatResource(
  onShowRelasi: (jemaat: { id: string; namaLengkap: string }) => void,
): ResourceConfig<Jemaat> {
  return {
    name: 'jemaat',
    label: 'Jemaat',
    labelPlural: 'data anggota jemaat lintas cabang',
    endpoint: '/admin/jemaat',
    displayField: 'namaLengkap',
    defaultSort: { field: 'namaLengkap', order: 'asc' },
    virtualScroll: true,
    virtualChunkSize: 50,
    virtualHeight: '70vh',
    columns: [
      {
        key: 'namaLengkap',
        label: 'Nama Lengkap',
        render: (_v, row) => (
          <Link
            href={`/dashboard/jemaat/${row.id}`}
            className="flex items-center gap-1.5 text-brand-600 hover:underline font-medium"
          >
            <Eye className="w-3.5 h-3.5 shrink-0" />
            {row.namaLengkap}
          </Link>
        ),
      },
      { key: 'cabang', label: 'Cabang', render: nestedField('cabang.nama'), width: '140px' },
      {
        key: 'jemaatRoles',
        label: 'Role',
        width: '180px',
        render: (_v, row) => {
          const roles = row.jemaatRoles ?? [];
          if (roles.length === 0) return <span className="text-neutral-400">-</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {roles.slice(0, 2).map((jr, i) => (
                <span
                  key={i}
                  className="inline-block px-1.5 py-0.5 bg-neutral-100 text-neutral-700 text-[10px] rounded"
                  title={
                    jr.subRoleStatus
                      ? `${jr.role.nama} → ${jr.subRole.nama} → ${jr.subRoleStatus.nama}`
                      : `${jr.role.nama} → ${jr.subRole.nama}`
                  }
                >
                  {jr.subRoleStatus?.nama ?? jr.subRole.nama}
                </span>
              ))}
              {roles.length > 2 && (
                <span className="text-[10px] text-neutral-400">+{roles.length - 2}</span>
              )}
            </div>
          );
        },
      },
      { key: 'noHp', label: 'No HP', width: '130px' },
      {
        key: 'tanggalLahir',
        label: 'Usia',
        width: '60px',
        render: (v) => {
          const age = calcAge(v as string | null);
          return age !== null ? <span>{age} th</span> : <span className="text-neutral-400">-</span>;
        },
      },
      {
        key: 'jenisKelamin',
        label: 'L/P',
        width: '55px',
        render: (v) => (v === 'L' ? 'L' : v === 'P' ? 'P' : '-'),
      },
      {
        key: '_relasi',
        label: 'Relasi',
        width: '90px',
        render: (_v, row) => (
          <button
            onClick={() => onShowRelasi({ id: row.id, namaLengkap: row.namaLengkap })}
            className="flex items-center gap-1 px-2 py-1 text-xs text-pink-700 hover:bg-pink-50 rounded border border-pink-200"
            title="Lihat relasi keluarga"
          >
            <Heart className="w-3 h-3" />
            Lihat
          </button>
        ),
      },
      { key: 'isActive', label: 'Status', width: '80px', render: statusBadge },
    ],
    fields: [
      {
        name: 'cabangId',
        label: 'Cabang Home',
        type: 'relation',
        required: true,
        relation: { endpoint: '/admin/cabang', labelKey: 'nama', formatLabel: (i) => `${i.nama} (${i.kode})` },
        helperText: 'Cabang tempat jemaat terdaftar resmi.',
      },
      { name: 'namaLengkap', label: 'Nama Lengkap', type: 'text', required: true },
      {
        name: 'noHp',
        label: 'No HP (WhatsApp)',
        type: 'tel',
        required: true,
        placeholder: '+628123456789',
        helperText: 'Format E.164 (+62...). Dipakai untuk login OTP.',
      },
      { name: 'email', label: 'Email', type: 'email' },
      {
        name: 'jenisKelamin',
        label: 'Jenis Kelamin',
        type: 'select',
        options: [
          { value: 'L', label: 'Laki-laki' },
          { value: 'P', label: 'Perempuan' },
        ],
      },
      { name: 'tanggalLahir', label: 'Tanggal Lahir', type: 'date' },
      { name: 'tanggalBergabung', label: 'Tanggal Bergabung', type: 'date' },
      { name: 'alamat', label: 'Alamat', type: 'textarea' },
      { name: 'isActive', label: 'Status Aktif', type: 'switch', defaultValue: true },
    ],
    createSchema: createJemaatSchema,
    updateSchema: updateJemaatSchema,
  };
}

// Default export tanpa callback (untuk backward compat — Relasi button no-op).
export const jemaatResource = buildJemaatResource(() => {});
