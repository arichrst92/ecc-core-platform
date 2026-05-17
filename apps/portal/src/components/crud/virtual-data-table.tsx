'use client';

import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Pencil, Trash2, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import type { ColumnConfig } from '@/lib/crud-types';

interface Props<T extends { id: string }> {
  rows: T[];
  columns: ColumnConfig<T>[];
  loading?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
  total?: number;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  /** Row height estimate (px). Default 52. */
  rowHeight?: number;
  /** Container height (px atau CSS string). Default '70vh'. */
  height?: string | number;
}

/**
 * Virtualized table — render hanya row yang visible di viewport.
 * Cocok untuk dataset besar (1000+ baris) supaya DOM tidak meledak.
 *
 * Strategi:
 *   - @tanstack/react-virtual untuk windowing
 *   - Append "loader row" virtual di akhir saat ada nextPage; saat row ini
 *     tervisible (user scroll ke bawah), trigger fetchNextPage()
 *   - Sticky header dengan grid layout supaya kolom alignment konsisten
 */
export function VirtualDataTable<T extends { id: string } & Record<string, unknown>>({
  rows,
  columns,
  loading,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  total,
  onEdit,
  onDelete,
  rowHeight = 52,
  height = '70vh',
}: Props<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const hasActions = !!(onEdit || onDelete);

  // +1 untuk loader row kalau masih ada page berikutnya
  const itemCount = hasNextPage ? rows.length + 1 : rows.length;

  const rowVirtualizer = useVirtualizer({
    count: itemCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // Auto-fetch next page saat loader row tervisible
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || !fetchNextPage) return;
    const last = virtualItems[virtualItems.length - 1];
    if (last && last.index >= rows.length - 1) {
      fetchNextPage();
    }
  }, [virtualItems, hasNextPage, isFetchingNextPage, fetchNextPage, rows.length]);

  // Grid template columns berdasarkan config — pakai width hint atau auto
  const gridTemplate = [
    ...columns.map((c) => c.width ?? 'minmax(120px, 1fr)'),
    ...(hasActions ? ['100px'] : []),
  ].join(' ');

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      {/* Header (sticky di luar scroll container supaya tidak ikut virtualize) */}
      <div
        className="grid bg-neutral-50 border-b border-neutral-200 text-neutral-600 uppercase text-xs font-medium"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {columns.map((col) => (
          <div key={String(col.key)} className={clsx('px-4 py-3 text-left truncate', col.className)}>
            {col.label}
          </div>
        ))}
        {hasActions && <div className="px-4 py-3 text-right">Aksi</div>}
      </div>

      {/* Scroll container */}
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
      >
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-neutral-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-20 text-neutral-400 text-sm">Belum ada data</div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualItems.map((vRow) => {
              const isLoaderRow = vRow.index >= rows.length;
              const row = rows[vRow.index];
              return (
                <div
                  key={vRow.key}
                  data-index={vRow.index}
                  className={clsx(
                    'absolute top-0 left-0 w-full grid border-b border-neutral-100 text-sm',
                    !isLoaderRow && 'hover:bg-neutral-50',
                  )}
                  style={{
                    transform: `translateY(${vRow.start}px)`,
                    height: `${vRow.size}px`,
                    gridTemplateColumns: gridTemplate,
                  }}
                >
                  {isLoaderRow ? (
                    <div
                      className="col-span-full flex items-center justify-center text-neutral-400"
                    >
                      {isFetchingNextPage ? (
                        <span className="flex items-center gap-2 text-xs">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Memuat lebih banyak...
                        </span>
                      ) : (
                        <span className="text-xs">— akhir —</span>
                      )}
                    </div>
                  ) : (
                    <>
                      {columns.map((col) => {
                        const value = (row as Record<string, unknown>)[col.key as string];
                        return (
                          <div
                            key={String(col.key)}
                            className={clsx('px-4 py-3 text-neutral-900 truncate flex items-center', col.className)}
                          >
                            {col.render ? col.render(value, row as T) : (value as string) ?? '-'}
                          </div>
                        );
                      })}
                      {hasActions && (
                        <div className="px-4 py-3 flex items-center justify-end gap-1">
                          {onEdit && (
                            <button
                              onClick={() => onEdit(row as T)}
                              className="p-1.5 rounded hover:bg-brand-50 text-neutral-600 hover:text-brand-600"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {onDelete && (
                            <button
                              onClick={() => onDelete(row as T)}
                              className="p-1.5 rounded hover:bg-red-50 text-neutral-600 hover:text-red-600"
                              title="Hapus"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer status */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-neutral-100 text-xs text-neutral-500">
        <span>
          Menampilkan <strong>{rows.length}</strong>
          {total !== undefined && (
            <> dari <strong>{total}</strong></>
          )}{' '}
          baris
        </span>
        {isFetchingNextPage && (
          <span className="flex items-center gap-1 text-brand-600">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading next...
          </span>
        )}
      </div>
    </div>
  );
}
