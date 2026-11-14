/** Halaman channel YouTube (dipakai /youtube dan /youtube/worship). */
import { PlaySquare } from 'lucide-react';
import { getL } from '@/lib/i18n-server';
import { ScreenPage } from '@/components/screen-page';
import { channelData, playlistVideos, YOUTUBE_PATH, YT_CHANNELS, type YtChannelKey } from '@/lib/youtube';
import { YoutubeBrowser } from './youtube-browser';

export async function ChannelPage({ channel }: { channel: YtChannelKey }) {
  const { L } = getL();
  const c = YT_CHANNELS[channel];
  const data = await channelData(channel);
  const key = process.env.YOUTUBE_API_KEY;
  const latest = data.mode === 'api' && key ? await playlistVideos(c.uploads, key, 100) : null;
  const total = data.categories.reduce((n, x) => n + (x.count ?? 0), 0);
  return (
    <ScreenPage
      Icon={PlaySquare}
      badge="YouTube"
      title={c.handle}
      subtitle={
        channel === 'worship'
          ? L('Lagu, worship session, dan lyric video dari ECC Worship — per kategori.', 'Songs, worship sessions, and lyric videos from ECC Worship — by category.')
          : L(
              'Ibadah, khotbah, pujian, dan cerita jemaat ECC — dikelompokkan per kategori seperti di channel YouTube.',
              'Services, sermons, worship, and stories of the ECC family — grouped by category like on YouTube.',
            )
      }
      aside={
        <a
          href={c.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-white text-neutral-900 px-4 py-2 text-sm font-bold shadow"
        >
          <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden fill="#FF0000">
            <path d={YOUTUBE_PATH} />
          </svg>
          {c.name}
          {total ? <span className="text-neutral-500 font-semibold">· {total}+ video</span> : null}
        </a>
      }
    >
      <YoutubeBrowser channel={c} mode={data.mode} categories={data.categories} latest={latest} />
    </ScreenPage>
  );
}
