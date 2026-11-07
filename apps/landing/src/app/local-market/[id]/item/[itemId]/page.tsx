/**
 * Halaman satu item katalog Local Market (2.4.7) — link yang dibagikan dari
 * app. Pratinjau WhatsApp / media sosial memakai foto item (OG image).
 */
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail, MessageCircle, Smartphone, Store } from 'lucide-react';
import { apiGet, absoluteUrl } from '@/lib/api';
import { hargaText, type KatalogItem } from '@/lib/katalog';

interface ItemDetail extends KatalogItem {
  hargaLabel: string;
  business: {
    id: string;
    nama: string;
    logoUrl: string | null;
    heroImageUrl: string | null;
    waAdmin: string | null;
    email: string | null;
    industri: string | null;
    owner: { cabang: { nama: string } | null } | null;
  };
}

interface PageProps {
  params: { id: string; itemId: string };
}

const SITE = 'https://eccchurch.global';

async function load(p: PageProps['params']) {
  return apiGet<ItemDetail>(`/public/local-market/${p.id}/item/${p.itemId}`, { revalidate: 120 });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const it = await load(params);
  if (!it) return { title: 'Item tidak ditemukan' };
  const img = absoluteUrl(it.fotoUrls[0] ?? it.business.heroImageUrl ?? it.business.logoUrl);
  const title = `${it.nama} — ${it.business.nama}`;
  const description = `${hargaText(it)} · ${it.deskripsi?.slice(0, 140) ?? `${it.jenis === 'JASA' ? 'Jasa' : 'Produk'} di ECC Local Market`}`;
  const url = `${SITE}/local-market/${params.id}/item/${params.itemId}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', images: img ? [{ url: img, width: 1200, height: 800, alt: it.nama }] : undefined },
    twitter: { card: img ? 'summary_large_image' : 'summary', title, description, images: img ? [img] : undefined },
  };
}

export default async function LocalMarketItemPage({ params }: PageProps) {
  const it = await load(params);
  if (!it) notFound();
  const b = it.business;
  const url = `${SITE}/local-market/${params.id}/item/${params.itemId}`;
  const pesan = `Halo ${b.nama}, saya tertarik dengan ${it.nama} (${hargaText(it)}). ${url}`;
  const wa = b.waAdmin ? `https://wa.me/${b.waAdmin.replace(/\D/g, '')}?text=${encodeURIComponent(pesan)}` : null;
  const mail = b.email ? `mailto:${b.email}?subject=${encodeURIComponent(`Tanya: ${it.nama}`)}&body=${encodeURIComponent(pesan)}` : null;

  return (
    <article className="py-8 lg:py-12">
      <div className="container-page max-w-3xl mx-auto">
        <Link href={`/local-market/${b.id}`} className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-brand-600 mb-6">
          <ArrowLeft className="w-4 h-4" />
          {b.nama}
        </Link>

        <div className="grid gap-2 mb-6">
          {(it.fotoUrls.length ? it.fotoUrls : [null]).map((f, i) => (
            <div key={i} className="relative bg-neutral-100 rounded-2xl overflow-hidden" style={{ aspectRatio: '3 / 2' }}>
              {f ? (
                <Image src={absoluteUrl(f) ?? ''} alt={it.nama} fill className="object-cover" sizes="(max-width: 768px) 100vw, 768px" priority={i === 0} />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-brand-300">
                  <Store className="w-12 h-12" />
                </div>
              )}
            </div>
          ))}
        </div>

        <span className="inline-block text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
          {it.jenis === 'JASA' ? 'Jasa' : 'Produk'}
        </span>
        <h1 className="text-3xl font-bold text-neutral-900 leading-tight mt-2">{it.nama}</h1>
        <p className={`text-xl font-semibold mt-1 ${it.hargaTipe === 'NEGO' ? 'text-neutral-500' : 'text-brand-700'}`}>{hargaText(it)}</p>
        {it.deskripsi ? <p className="text-neutral-700 whitespace-pre-line leading-relaxed mt-4">{it.deskripsi}</p> : null}

        <Link href={`/local-market/${b.id}`} className="flex items-center gap-3 mt-6 p-3 border border-neutral-200 rounded-xl hover:border-brand-300">
          {b.logoUrl ? (
            <div className="w-10 h-10 relative rounded-lg overflow-hidden bg-neutral-100">
              <Image src={absoluteUrl(b.logoUrl) ?? ''} alt={b.nama} fill className="object-cover" sizes="40px" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-lg bg-brand-100 text-brand-600 flex items-center justify-center">
              <Store className="w-5 h-5" />
            </div>
          )}
          <div className="min-w-0">
            <div className="font-semibold text-neutral-900 truncate">{b.nama}</div>
            <div className="text-xs text-neutral-500">{[b.industri, b.owner?.cabang?.nama].filter(Boolean).join(' · ')}</div>
          </div>
        </Link>

        <div className="grid sm:grid-cols-2 gap-2 mt-6">
          {wa ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
              <MessageCircle className="w-4 h-4" /> Tanya via WhatsApp
            </a>
          ) : null}
          {mail ? (
            <a href={mail} className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-neutral-300 hover:border-brand-300 text-neutral-800 font-semibold">
              <Mail className="w-4 h-4" /> Kirim email
            </a>
          ) : null}
          <a href={`ecc://local-market/${b.id}/item/${it.id}`} className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-neutral-300 hover:border-brand-300 text-neutral-800 font-semibold sm:col-span-2">
            <Smartphone className="w-4 h-4" /> Buka di Els App
          </a>
        </div>
      </div>
    </article>
  );
}
