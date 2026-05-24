'use client';

import { useFormContext } from 'react-hook-form';
import type { FieldConfig } from '@/lib/crud-types';
import { useRelationOptions } from '@/lib/use-crud';

interface Props {
  field: FieldConfig;
}

/**
 * Single FieldRenderer yang switch berdasarkan field.type.
 * Disengaja kept di satu file supaya gampang scan & extend.
 */
export function FieldRenderer({ field }: Props) {
  const {
    register,
    formState: { errors },
  } = useFormContext();
  const error = errors[field.name];

  return (
    <div>
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </span>

        {field.type === 'textarea' ? (
          <textarea
            {...register(field.name)}
            placeholder={field.placeholder}
            rows={3}
            className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          />
        ) : field.type === 'select' ? (
          <select
            {...register(field.name)}
            className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
          >
            <option value="">— pilih —</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : field.type === 'relation' ? (
          <RelationSelect field={field} />
        ) : field.type === 'switch' ? (
          <div className="mt-1 flex items-center gap-2">
            <input
              type="checkbox"
              {...register(field.name)}
              className="w-4 h-4 accent-brand-500"
            />
            <span className="text-sm text-neutral-600">{field.helperText ?? 'Aktif'}</span>
          </div>
        ) : (
          <input
            {...register(
              field.name,
              // 'number' → valueAsNumber (RHF parse ke number).
              // 'decimal' → biarkan string, normalize + coerce di Zod (accept koma).
              field.type === 'number' ? { valueAsNumber: true } : undefined,
            )}
            type={
              field.type === 'number'
                ? 'number'
                : field.type === 'date'
                  ? 'date'
                  : field.type === 'time'
                    ? 'time'
                    : field.type === 'email'
                      ? 'email'
                      : field.type === 'tel'
                        ? 'tel'
                        : field.type === 'url'
                          ? 'url'
                          : 'text'
            }
            // 'decimal' = text input dengan numeric keypad di mobile.
            // Tidak pakai type='number' supaya browser tidak block koma.
            inputMode={field.type === 'decimal' ? 'decimal' : undefined}
            placeholder={field.placeholder}
            className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          />
        )}

        {field.helperText && field.type !== 'switch' && (
          <span className="block mt-1 text-xs text-neutral-500">{field.helperText}</span>
        )}
        {error && (
          <span className="block mt-1 text-xs text-red-600">{String(error.message)}</span>
        )}
      </label>
    </div>
  );
}

function RelationSelect({ field }: { field: FieldConfig }) {
  const { register } = useFormContext();
  const { data, isLoading } = useRelationOptions(field.relation!.endpoint);

  const valueKey = field.relation?.valueKey ?? 'id';
  const labelKey = field.relation?.labelKey ?? 'nama';

  return (
    <select
      {...register(field.name)}
      disabled={isLoading}
      className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white disabled:opacity-50"
    >
      <option value="">{isLoading ? 'Memuat...' : '— pilih —'}</option>
      {data?.map((item) => (
        <option key={String(item[valueKey])} value={String(item[valueKey])}>
          {field.relation?.formatLabel ? field.relation.formatLabel(item) : String(item[labelKey])}
        </option>
      ))}
    </select>
  );
}
