import { redirect } from 'next/navigation';

/**
 * /support — Support URL di App Store Connect. Arahkan ke halaman Kontak.
 */
export default function SupportPage() {
  redirect('/contact');
}
