// DEPRECATED — fungsi dipindah ke /dashboard/pelayanan (edit role inline).
// Halaman ini auto-redirect supaya bookmark lama tetap jalan.
import { redirect } from 'next/navigation';

export default function PelayananRolePageDeprecated() {
  redirect('/dashboard/pelayanan');
}
