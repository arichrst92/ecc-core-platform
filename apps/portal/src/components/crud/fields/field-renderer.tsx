'use client';

import { useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Upload, Trash2, Loader2, ImageOff } from 'lucide-react';
import toast from 'react-hot-toast';
import type { FieldConfig } from '@/lib/crud-types';
import { useRelationOptions } from '@/lib/use-crud';
import { resolveMediaUrl } from '@/lib/media-url';
import { apiClient } from '@/lib/api-client';

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
        ) : field.type === 'image' ? (
          <ImageUploader field={field} />
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

/**
 * ImageUploader — file picker + preview + upload/delete.
 *
 * Behavior:
 * - Kalau row belum ada `id` (create mode): field disabled dgn helper text
 *   "Simpan dulu, baru upload foto". Alasan: upload endpoint biasanya butuh
 *   `:id` row → belum ada sampai row ter-create.
 * - Kalau row punya `id` (edit mode): tampil preview foto existing + tombol
 *   Upload (pilih file) + Delete (kalau ada value).
 * - Value di-store di RHF state pakai `fotoUrl` (string) — sama seperti `url`.
 * - Upload success → set value via setValue, refresh preview.
 */
function ImageUploader({ field }: { field: FieldConfig }) {
  const { setValue, watch, getValues } = useFormContext();
  const currentValue = watch(field.name) as string | null | undefined;
  const rowId = getValues('id') as string | undefined;
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const config = field.imageUpload;
  const maxBytes = config?.maxBytes ?? 5 * 1024 * 1024;
  const accept = config?.accept ?? 'image/*';
  const fieldName = config?.fieldName ?? 'file';

  const disabled = !rowId;

  const resolveEndpoint = (tpl: string): string => tpl.replace(':id', rowId ?? '');

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!config?.uploadEndpoint) {
      toast.error('Upload endpoint tidak dikonfigurasi');
      return;
    }
    if (!rowId) {
      toast.error('Simpan row dulu sebelum upload foto');
      return;
    }
    if (file.size > maxBytes) {
      toast.error(`File terlalu besar (max ${Math.round(maxBytes / 1024 / 1024)}MB)`);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append(fieldName, file);
      const res = await apiClient.post<{ data: { fotoUrl: string } }>(
        resolveEndpoint(config.uploadEndpoint),
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      const newUrl = res.data?.data?.fotoUrl;
      if (newUrl) {
        setValue(field.name, newUrl, { shouldDirty: true, shouldValidate: true });
        toast.success('Foto ter-upload');
      } else {
        toast.error('Response upload tidak mengandung fotoUrl');
      }
    } catch (err) {
      const anyErr = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(anyErr.response?.data?.error?.message ?? 'Upload gagal');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDelete() {
    if (!config?.deleteEndpoint || !rowId) return;
    if (!window.confirm('Hapus foto ini?')) return;
    setDeleting(true);
    try {
      await apiClient.delete(resolveEndpoint(config.deleteEndpoint));
      setValue(field.name, null, { shouldDirty: true, shouldValidate: true });
      toast.success('Foto dihapus');
    } catch (err) {
      const anyErr = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(anyErr.response?.data?.error?.message ?? 'Delete gagal');
    } finally {
      setDeleting(false);
    }
  }

  const previewUrl = resolveMediaUrl(currentValue);

  return (
    <div className="mt-1">
      <div className="flex items-start gap-3">
        {/* Preview */}
        <div className="w-24 h-24 rounded-lg border border-neutral-300 bg-neutral-50 flex items-center justify-center overflow-hidden shrink-0">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
          ) : (
            <ImageOff className="w-6 h-6 text-neutral-400" />
          )}
        </div>

        {/* Actions */}
        <div className="flex-1 flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={handleFile}
            disabled={disabled || uploading}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
            className="flex items-center justify-center gap-2 px-3 py-2 border border-brand-300 text-brand-700 text-sm font-medium rounded-lg hover:bg-brand-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Mengupload...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" /> {currentValue ? 'Ganti Foto' : 'Upload Foto'}
              </>
            )}
          </button>
          {currentValue && config?.deleteEndpoint && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={disabled || deleting}
              className="flex items-center justify-center gap-2 px-3 py-2 border border-red-300 text-red-700 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Hapus
            </button>
          )}
          {disabled && (
            <span className="text-xs text-neutral-500 italic">
              Simpan {field.label.toLowerCase().includes('foto') ? 'data' : 'row'} dulu, baru bisa upload foto.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
