import { Gift, Package } from 'lucide-react';
import { createHadiahSchema, updateHadiahSchema } from '@ecc/shared-types';
import type { ResourceConfig } from '../crud-types';
import { statusBadge, nestedField } from './render-helpers';
import { resolveMediaUrl } from '../media-url';

interface Hadiah extends Record<string, unknown> {
  id: string;
  cabangId: string;
  nama: string;
  deskripsi: string | null;
  fotoUrl: string | null;
  pointCost: number;
  stock: number;
  isActive: boolean;
  cabang?: { id: string; nama: string; kode: string };
}

export const hadiahResource: ResourceConfig<Hadiah> = {
  name: 'hadiah',
  label: 'Hadiah',
  labelPlural: 'katalog hadiah untuk redeem point anak',
  endpoint: '/admin/hadiah',
  displayField: 'nama',
  defaultSort: { field: 'nama', order: 'asc' },
  columns: [
    {
      key: 'fotoUrl',
      label: 'Foto',
      width: '60px',
      render: (_v, row) =>
        row.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveMediaUrl(row.fotoUrl)}
            alt={row.nama}
            className="w-10 h-10 rounded-lg object-cover border border-neutral-200"
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center">
            <Gift className="w-4 h-4 text-neutral-400" />
          </div>
        ),
    },
    { key: 'nama', label: 'Nama Hadiah' },
    { key: 'cabang', label: 'Cabang', render: nestedField('cabang.nama'), width: '140px' },
    {
      key: 'pointCost',
      label: 'Point Cost',
      width: '110px',
      render: (_v, row) => (
        <span className="font-semibold text-kids-700">
          {row.pointCost.toLocaleString('id-ID')} pts
        </span>
      ),
    },
    {
      key: 'stock',
      label: 'Stock',
      width: '90px',
      render: (_v, row) => (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
            row.stock === 0
              ? 'bg-red-100 text-red-700'
              : row.stock < 5
                ? 'bg-amber-100 text-amber-800'
                : 'bg-green-100 text-green-700'
          }`}
        >
          <Package className="w-3 h-3" />
          {row.stock}
        </span>
      ),
    },
    { key: 'isActive', label: 'Status', width: '90px', render: statusBadge },
  ],
  fields: [
    {
      name: 'cabangId',
      label: 'Cabang',
      type: 'relation',
      required: true,
      relation: { endpoint: '/admin/cabang', labelKey: 'nama' },
      helperText: 'Cabang yg meng-host hadiah ini di stall Gift Stall.',
    },
    {
      name: 'nama',
      label: 'Nama Hadiah',
      type: 'text',
      required: true,
      placeholder: 'mis. Robot LEGO, Buku Alkitab Anak',
    },
    {
      name: 'deskripsi',
      label: 'Deskripsi',
      type: 'textarea',
      placeholder: 'Deskripsi singkat (opsional)',
    },
    {
      name: 'fotoUrl',
      label: 'Foto Hadiah',
      type: 'image',
      imageUpload: {
        uploadEndpoint: '/admin/hadiah/:id/photo',
        deleteEndpoint: '/admin/hadiah/:id/photo',
        fieldName: 'file',
        maxBytes: 5 * 1024 * 1024,
        accept: 'image/*',
      },
      helperText:
        'Upload foto hadiah (JPG/PNG/WebP, max 5MB). Untuk hadiah baru: simpan dulu, baru upload foto.',
    },
    {
      name: 'pointCost',
      label: 'Harga Point',
      type: 'number',
      required: true,
      placeholder: '100',
      helperText: 'Jumlah point yang harus di-spend anak untuk redeem.',
    },
    {
      name: 'stock',
      label: 'Stock Awal',
      type: 'number',
      placeholder: '10',
      helperText:
        'Cuma untuk create. Update stock nanti pakai Gift Stall UI (tombol Add Stock).',
    },
    { name: 'isActive', label: 'Status Aktif', type: 'switch', defaultValue: true },
  ],
  createSchema: createHadiahSchema,
  updateSchema: updateHadiahSchema,
};
