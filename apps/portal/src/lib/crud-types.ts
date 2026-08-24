/**
 * Type definitions untuk generic CRUD factory.
 *
 * Setiap master data didefinisikan via `ResourceConfig`:
 *   - columns: apa yang ditampilkan di tabel
 *   - fields: form fields (driven by Zod schema)
 *   - schemas: Zod create + update untuk validation
 *   - endpoint: base path API (mis. "/admin/sinode")
 */
import type { ZodSchema } from 'zod';
import type { ReactNode } from 'react';

export type FieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  // 'decimal' = text input dengan inputMode='decimal'. Beda dari 'number':
  // - Accept koma ',' DAN titik '.' sebagai decimal separator (locale-friendly)
  // - Mobile keyboard tetap show numeric keypad (inputMode='decimal')
  // - Tidak strict block character non-digit di browser
  // - Validation + normalization (koma → titik) di Zod schema preprocess
  // Cocok untuk koordinat (lat/long), harga, persentase yang butuh input bebas.
  | 'decimal'
  | 'textarea'
  | 'date'
  | 'time'
  | 'select'
  | 'switch'
  | 'relation'
  | 'url'
  // 'image' = file uploader dgn preview + delete button.
  // Butuh `imageUpload.uploadEndpoint` (interpolate :id kalau edit),
  // upload multipart POST → response `{ data: { fotoUrl } }`.
  // Untuk create mode: field disabled dgn helper text (harus create dulu baru upload).
  | 'image';

export interface SelectOption {
  value: string;
  label: string;
}

export interface RelationConfig {
  /** Endpoint untuk fetch options, mis. "/admin/sinode" */
  endpoint: string;
  /** Field di response yang dipakai sebagai value (default: "id") */
  valueKey?: string;
  /** Field di response yang dipakai sebagai label (mis. "nama") */
  labelKey: string;
  /** Optional: format custom label, mis. (item) => `${item.nama} (${item.kode})` */
  formatLabel?: (item: Record<string, unknown>) => string;
}

export interface ImageUploadConfig {
  /**
   * Endpoint upload multipart, contoh: "/admin/hadiah/:id/photo"
   * `:id` akan di-replace dgn ID row saat edit. Kalau tidak ada `:id`
   * (mis. endpoint global), akan dipakai apa adanya.
   */
  uploadEndpoint: string;
  /**
   * Endpoint delete foto, contoh: "/admin/hadiah/:id/photo" (DELETE method).
   * Optional — kalau tidak ada, tombol delete di-hide.
   */
  deleteEndpoint?: string;
  /** Field name di multipart form (default: "file"). */
  fieldName?: string;
  /** Max file size in bytes (default: 5MB). */
  maxBytes?: number;
  /** Accept mime types (default: "image/*"). */
  accept?: string;
}

export interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  helperText?: string;
  options?: SelectOption[];        // untuk type=select
  relation?: RelationConfig;       // untuk type=relation
  imageUpload?: ImageUploadConfig; // untuk type=image
  /** Hanya tampil saat create (false = juga di edit) */
  createOnly?: boolean;
  /** Hidden di form, biasanya untuk field yang di-set otomatis */
  hidden?: boolean;
  /** Conditional render: function yang return true jika field harus tampil */
  showIf?: (values: Record<string, unknown>) => boolean;
  /** Default value saat create */
  defaultValue?: unknown;
}

export interface ColumnConfig<T = Record<string, unknown>> {
  key: keyof T | string;
  label: string;
  /** Custom render cell content */
  render?: (value: unknown, row: T) => ReactNode;
  /** Bisa di-sort */
  sortable?: boolean;
  /** Width hint, mis. "120px", "20%" */
  width?: string;
  /** Class tambahan untuk td */
  className?: string;
}

export interface ResourceConfig<T = Record<string, unknown>> {
  /** Nama resource (untuk react-query key, dst.) */
  name: string;
  /** Label untuk header & button */
  label: string;
  labelPlural?: string;
  /** Base endpoint API, mis. "/admin/sinode" */
  endpoint: string;
  /** Kolom tabel */
  columns: ColumnConfig<T>[];
  /** Field form */
  fields: FieldConfig[];
  /** Zod schema untuk create (validasi form) */
  createSchema: ZodSchema;
  /** Zod schema untuk update */
  updateSchema: ZodSchema;
  /** Field yang dipakai sebagai display name di delete confirmation */
  displayField?: string;
  /** Default sort */
  defaultSort?: { field: string; order: 'asc' | 'desc' };
  /** Apakah tabel mendukung search (default: true) */
  searchable?: boolean;
  /**
   * Virtual scroll mode (infinite). Cocok untuk dataset besar (1000+ rows).
   * Default false → pagination klasik per halaman.
   */
  virtualScroll?: boolean;
  /** Page size untuk virtual scroll fetch chunks (default: 50). */
  virtualChunkSize?: number;
  /** Tinggi container virtual scroll (default '70vh'). */
  virtualHeight?: string | number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface SingleResponse<T> {
  success: boolean;
  data: T;
}
