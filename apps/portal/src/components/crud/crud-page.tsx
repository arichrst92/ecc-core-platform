'use client';

import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { DataTable } from './data-table';
import { VirtualDataTable } from './virtual-data-table';
import { FormModal } from './form-modal';
import { ConfirmDelete } from './confirm-delete';
import { useList, useInfiniteList, useCreate, useUpdate, useDelete } from '@/lib/use-crud';
import type { ResourceConfig } from '@/lib/crud-types';
import { useDebounce } from '@/lib/use-debounce';

interface Props<T extends { id: string }> {
  config: ResourceConfig<T>;
}

/**
 * Generic CRUD page yang handle semua master data sederhana.
 * Dua mode: pagination klasik (default) atau virtual scroll (config.virtualScroll = true).
 */
export function CrudPage<T extends { id: string } & Record<string, unknown>>({ config }: Props<T>) {
  const isVirtual = !!config.virtualScroll;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  // Paginated mode — disabled saat virtual scroll aktif
  const list = useList<T>(
    config.name,
    config.endpoint,
    {
      page,
      limit: 20,
      search: debouncedSearch || undefined,
      sortBy: config.defaultSort?.field,
      sortOrder: config.defaultSort?.order,
    },
    !isVirtual,
  );

  // Virtual / infinite mode — disabled saat pagination klasik
  const infinite = useInfiniteList<T>(
    config.name,
    config.endpoint,
    {
      limit: config.virtualChunkSize ?? 50,
      search: debouncedSearch || undefined,
      sortBy: config.defaultSort?.field,
      sortOrder: config.defaultSort?.order,
    },
    isVirtual,
  );

  const createMut = useCreate<T>(config.name, config.endpoint);
  const updateMut = useUpdate<T>(config.name, config.endpoint);
  const deleteMut = useDelete(config.name, config.endpoint);

  const virtualRows = infinite.data?.pages.flatMap((p) => p.data) ?? [];
  const virtualTotal = infinite.data?.pages[0]?.meta?.total ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">{config.label}</h1>
          {config.labelPlural && (
            <p className="text-neutral-500 mt-1">Kelola {config.labelPlural}</p>
          )}
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          Tambah {config.label}
        </button>
      </div>

      {config.searchable !== false && (
        <div className="mb-4 flex items-center gap-2 max-w-md">
          <div className="flex-1 flex items-center gap-2 bg-white border border-neutral-300 rounded-lg px-3 focus-within:ring-2 focus-within:ring-brand-500">
            <Search className="w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Cari..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="flex-1 py-2 outline-none text-sm"
            />
          </div>
        </div>
      )}

      {isVirtual ? (
        <VirtualDataTable<T>
          rows={virtualRows}
          columns={config.columns}
          loading={infinite.isLoading}
          hasNextPage={infinite.hasNextPage}
          isFetchingNextPage={infinite.isFetchingNextPage}
          fetchNextPage={infinite.fetchNextPage}
          total={virtualTotal}
          height={config.virtualHeight ?? '70vh'}
          onEdit={(row) => setEditing(row)}
          onDelete={(row) => setDeleting(row)}
        />
      ) : (
        <DataTable<T>
          data={list.data?.data ?? []}
          columns={config.columns}
          loading={list.isLoading}
          onEdit={(row) => setEditing(row)}
          onDelete={(row) => setDeleting(row)}
          page={list.data?.meta.page ?? 1}
          totalPages={list.data?.meta.totalPages ?? 1}
          total={list.data?.meta.total ?? 0}
          limit={list.data?.meta.limit ?? 20}
          onPageChange={setPage}
        />
      )}

      <FormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={`Tambah ${config.label}`}
        schema={config.createSchema}
        fields={config.fields}
        defaultValues={Object.fromEntries(
          config.fields.filter((f) => f.defaultValue !== undefined).map((f) => [f.name, f.defaultValue]),
        )}
        loading={createMut.isPending}
        onSubmit={async (values) => {
          await createMut.mutateAsync(values as Partial<T>);
          setCreateOpen(false);
        }}
      />

      <FormModal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Edit ${config.label}`}
        schema={config.updateSchema}
        fields={config.fields}
        defaultValues={editing ?? undefined}
        isEdit
        loading={updateMut.isPending}
        onSubmit={async (values) => {
          if (!editing) return;
          await updateMut.mutateAsync({ id: editing.id, input: values as Partial<T> });
          setEditing(null);
        }}
      />

      <ConfirmDelete
        open={!!deleting}
        onClose={() => setDeleting(null)}
        loading={deleteMut.isPending}
        itemName={deleting ? String(deleting[config.displayField ?? 'nama'] ?? deleting.id) : undefined}
        onConfirm={async () => {
          if (!deleting) return;
          await deleteMut.mutateAsync(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}
