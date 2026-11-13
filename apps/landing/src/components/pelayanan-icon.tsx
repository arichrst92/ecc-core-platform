/**
 * Ikon + warna aksen pelayanan (dipilih admin di halaman Pelayanan).
 * Disalin dari Portal (components/pelayanan/pelayanan-icon.tsx) — samakan bila daftar ikon berubah.
 * Kosong / tidak dikenal → ikon tangan-hati & warna oranye ECC.
 */
import {
  Baby,
  BookOpen,
  Brush,
  Camera,
  Car,
  Church,
  Clapperboard,
  ClipboardList,
  Coffee,
  Drum,
  Flame,
  Flower2,
  Globe,
  GraduationCap,
  Guitar,
  HandHeart,
  HandHelping,
  Headphones,
  Heart,
  HeartHandshake,
  Lightbulb,
  Megaphone,
  Mic,
  Monitor,
  Music,
  Palette,
  PenTool,
  Piano,
  Radio,
  Shield,
  Smile,
  Sparkles,
  Speaker,
  Star,
  Sun,
  Users,
  Utensils,
  Video,
  type LucideIcon,
} from 'lucide-react';
/** Sama dengan PELAYANAN_WARNA di @ecc/shared-types (landing tidak memakai paket itu). */
const PELAYANAN_WARNA = {
  orange: { solid: '#F97316', bg: '#FFEDD5', fg: '#C2410C' },
  amber: { solid: '#F59E0B', bg: '#FEF3C7', fg: '#B45309' },
  rose: { solid: '#F43F5E', bg: '#FFE4E6', fg: '#BE123C' },
  pink: { solid: '#EC4899', bg: '#FCE7F3', fg: '#BE185D' },
  violet: { solid: '#8B5CF6', bg: '#EDE9FE', fg: '#6D28D9' },
  sky: { solid: '#0EA5E9', bg: '#E0F2FE', fg: '#0369A1' },
  teal: { solid: '#14B8A6', bg: '#CCFBF1', fg: '#0F766E' },
  green: { solid: '#22C55E', bg: '#DCFCE7', fg: '#15803D' },
} as const;
type PelayananWarna = keyof typeof PELAYANAN_WARNA;

export const PELAYANAN_ICON_MAP: Record<string, LucideIcon> = {
  'heart-handshake': HeartHandshake,
  camera: Camera,
  video: Video,
  clapperboard: Clapperboard,
  monitor: Monitor,
  radio: Radio,
  music: Music,
  mic: Mic,
  guitar: Guitar,
  drum: Drum,
  piano: Piano,
  headphones: Headphones,
  speaker: Speaker,
  lightbulb: Lightbulb,
  palette: Palette,
  brush: Brush,
  'pen-tool': PenTool,
  'flower-2': Flower2,
  'hand-helping': HandHelping,
  'hand-heart': HandHeart,
  users: Users,
  baby: Baby,
  smile: Smile,
  heart: Heart,
  'book-open': BookOpen,
  'graduation-cap': GraduationCap,
  church: Church,
  flame: Flame,
  sparkles: Sparkles,
  sun: Sun,
  star: Star,
  coffee: Coffee,
  utensils: Utensils,
  car: Car,
  shield: Shield,
  'clipboard-list': ClipboardList,
  megaphone: Megaphone,
  globe: Globe,
};

export function pelayananWarna(warna?: string | null) {
  return PELAYANAN_WARNA[(warna as PelayananWarna) in PELAYANAN_WARNA ? (warna as PelayananWarna) : 'orange'];
}

/** Kotak ikon berwarna (size = sisi kotak px). */
export function PelayananIcon({
  ikon,
  warna,
  size = 32,
  className = '',
}: {
  ikon?: string | null;
  warna?: string | null;
  size?: number;
  className?: string;
}) {
  const Icon = (ikon && PELAYANAN_ICON_MAP[ikon]) || HeartHandshake;
  const w = pelayananWarna(warna);
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), background: w.bg, color: w.fg }}
    >
      <Icon style={{ width: Math.round(size * 0.55), height: Math.round(size * 0.55) }} />
    </span>
  );
}
