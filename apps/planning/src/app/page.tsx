import { redirect } from 'next/navigation';

export default function HomePage() {
  // Entry — langsung ke dashboard; dashboard layout handle auth check.
  redirect('/dashboard');
}
