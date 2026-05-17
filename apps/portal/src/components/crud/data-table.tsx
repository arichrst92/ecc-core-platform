'use client';

import { ChevronLeft, ChevronRight, Pencil, Trash2, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import type { ColumnConfig } from '@/lib/crud-types';

interface Props<T extends { id: string }> {
  data: T[];
  columns: ColumnConfig<T>[];
  loading?: boolean;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  loading,
  onEdit,
  onDelete,
  page,
  totalPages,
  total,
  limit,
  onPageChange,
}: Props<T>) {
  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 uppercase text-xs">
            <tr>
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className={clsx('px-4 py-3 text-left font-medium', col.className)}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.label}
                </th>
              ))}
              {(onEdit || onDelete) && (
                <th className="px-4 py-3 text-right font-medium" style={{ width: '120px' }}>
                  Aksi
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading && data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-neutral-400">
                  <Loader2 className="w-5 h-5 mx-auto animate-spin" />
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-neutral-400">
                  Belum ada data
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={row.id} className="hover:bg-neutral-50">
                  {columns.map((col) => {
                    const value = (row as Record<string, unknown>)[col.key as string];
                    return (
                      <td
                        key={String(col.key)}
                        className={clsx('px-4 py-3 text-neutral-900', col.className)}
                      >
                        {col.render ? col.render(value, row) : (value as string) ?? '-'}
                      </td>
                    );
                  })}
                  {(onEdit || onDelete) && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {onEdit && (
                          <button
                            onClick={() => onEdit(row)}
                            className="p-1.5 rounded hover:bg-brand-50 text-neutral-600 hover:text-brand-600"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => onDelete(row)}
                            className="p-1.5 rounded hover:bg-red-50 text-neutral-600 hover:text-red-600"
                            title="Hapus"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-100 text-sm">
          <div className="text-neutral-500">
            Menampilkan <strong>{startItem}-{endItem}</strong> dari <strong>{total}</strong>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded hover:bg-neutral-100 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-neutral-700">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded hover:bg-neutral-100 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
