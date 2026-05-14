import { redirect } from 'next/navigation';

export default function HomePage() {
  // Untuk MVP, halaman utama langsung redirect ke login.
  // Setelah ada middleware auth, ini akan cek session dulu.
  redirect('/login');
}
