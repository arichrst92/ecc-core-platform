'use client';

import { Fragment, useEffect, useMemo } from 'react';
import { useForm, FormProvider, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, Loader2 } from 'lucide-react';
import type { ZodSchema } from 'zod';
import type { FieldConfig } from '@/lib/crud-types';
import { FieldRenderer } from './fields/field-renderer';

interface Props<T> {
  open: boolean;
  onClose: () => void;
  title: string;
  schema: ZodSchema;
  fields: FieldConfig[];
  defaultValues?: Partial<T>;
  onSubmit: (values: T) => void | Promise<void>;
  loading?: boolean;
  /** Untuk edit mode — sembunyikan field createOnly */
  isEdit?: boolean;
}

/**
 * Samakan bentuk data existing dengan input form supaya saat EDIT semua field
 * langsung terisi (admin tidak perlu input ulang):
 *  - date     : ISO "2026-10-17T00:00:00.000Z" → "2026-10-17"
 *  - time     : "08:00:00" → "08:00"
 *  - select   : number/boolean → string (value <option> selalu string); null → ''
 *  - relation : kalau hanya ada objek nested (mis. `cabang: { id }`) → ambil id-nya
 */
export function normalizeFormValues(fields: FieldConfig[], values: Record<string, unknown> | undefined) {
  if (!values) return values;
  const out: Record<string, unknown> = { ...values };
  for (const f of fields) {
    const v = out[f.name];
    switch (f.type) {
      case 'date':
        if (v instanceof Date) out[f.name] = v.toISOString().slice(0, 10);
        else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) out[f.name] = v.slice(0, 10);
        break;
      case 'time':
        if (typeof v === 'string' && /^\d{2}:\d{2}/.test(v)) out[f.name] = v.slice(0, 5);
        break;
      case 'select':
        if (v != null) out[f.name] = String(v);
        break;
      case 'relation': {
        if (v == null || v === '') {
          // Fallback: field "cabangId" ← row.cabang.id
          const base = f.name.endsWith('Id') ? f.name.slice(0, -2) : null;
          const nested = base ? (values[base] as { id?: unknown } | null | undefined) : null;
          if (nested && nested.id != null) out[f.name] = String(nested.id);
        } else out[f.name] = String(v);
        break;
      }
      default:
        break;
    }
  }
  return out;
}

export function FormModal<T extends Record<string, unknown>>({
  open,
  onClose,
  title,
  schema,
  fields,
  defaultValues,
  onSubmit,
  loading,
  isEdit,
}: Props<T>) {
  const initial = useMemo(
    () => normalizeFormValues(fields, defaultValues as Record<string, unknown> | undefined),
    [fields, defaultValues],
  );
  const methods = useForm({
    resolver: zodResolver(schema),
    defaultValues: initial as any,
  });

  // Reset hanya saat modal dibuka / data yang diedit berubah isinya — bukan
  // setiap parent re-render (objek defaultValues baru) supaya ketikan admin
  // tidak terhapus.
  const initialKey = JSON.stringify(initial ?? null);
  useEffect(() => {
    if (open) methods.reset(initial as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialKey]);

  if (!open) return null;

  const visibleFields = fields.filter((f) => {
    if (f.hidden) return false;
    if (isEdit && f.createOnly) return false;
    return true;
  });

  return (
    <Fragment>
      <div
        className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
        onClick={loading ? undefined : onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl pointer-events-auto max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
            <button
              onClick={onClose}
              disabled={loading}
              className="p-1.5 hover:bg-neutral-100 rounded-lg disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <FormProvider {...methods}>
            <form
              onSubmit={methods.handleSubmit((v) => onSubmit(v as T))}
              className="overflow-y-auto"
            >
              <div className="p-6 space-y-4">
                {visibleFields.map((field) => (
                  <ConditionalField key={field.name} field={field} />
                ))}
              </div>
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isEdit ? 'Simpan Perubahan' : 'Tambah'}
                </button>
              </div>
            </form>
          </FormProvider>
        </div>
      </div>
    </Fragment>
  );
}

function ConditionalField({ field }: { field: FieldConfig }) {
  const { watch } = useFormContext();
  const allValues = watch();
  if (field.showIf && !field.showIf(allValues)) return null;
  return <FieldRenderer field={field} />;
}
