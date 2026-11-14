/**
 * Channel YouTube ECC (@ECCChurchChannel) untuk website.
 *
 * Kategori = playlist channel (sama dengan tab Playlists di YouTube).
 * - Dengan env YOUTUBE_API_KEY (YouTube Data API v3): daftar playlist & video
 *   diambil langsung (selalu terbaru, termasuk playlist baru).
 * - Tanpa key: memakai daftar playlist bawaan di bawah, video diputar lewat
 *   pemutar playlist YouTube (daftar video ada di dalam pemutar).
 * (RSS YouTube untuk channel ini mengembalikan 404, jadi tidak dipakai.)
 */
export const YT_CHANNEL_ID = 'UCNdOfqF_of-ry2pw-iVeBpw';
export const YT_CHANNEL_URL = 'https://www.youtube.com/@ECCChurchChannel';
/** Playlist "Uploads" = semua video channel ("UU" + ID channel tanpa "UC"). */
export const YT_UPLOADS = 'UU' + YT_CHANNEL_ID.slice(2);

export interface YtCategory {
  id: string;
  title: string;
  count: number | null;
  thumb: string | null;
}
export interface YtVideo {
  id: string;
  title: string;
  published: string | null;
  thumb: string | null;
}

const T = (v: string) => `https://i.ytimg.com/vi/${v}/hqdefault.jpg`;

/** Snapshot playlist channel (14 Nov 2026) — dipakai bila tanpa API key. */
export const FALLBACK_CATEGORIES: YtCategory[] = [
  ['PLBJ6iS_VyLf991xBF0I2keApEUHM0eLAj', 'ECC Online Service', 'XK1XRtKNwGk', 336],
  ['PLBJ6iS_VyLf9_vm8aCc0zRzeptNSAM-gT', 'Sunday Sermons', 'lCPxlWAphzE', 3],
  ['PLBJ6iS_VyLf8giFTcHvI-uVmlKPzwTPF5', 'CKIDS Online Service', 'gAtXdqZdn58', 55],
  ['PL82ECD984C53E714C', 'Praise and Worship', '0r7piOVLrcw', 22],
  ['PLBJ6iS_VyLf-gTVZHeryEqwMX5GlFHPzX', 'Music Videos', 'PZW64Ncgqvc', 2],
  ['PLBJ6iS_VyLf-9VrLhUp6rzY0cM4NuIayo', '#Meandmybible - Book of Matthew', 'zqMnXVeiVqI', 29],
  ['PLBJ6iS_VyLf8JT7LPE09GHQICQzwG1KTB', 'ECC Bicara Bisnis', 't3Vml7i5RPY', 6],
  ['PL7BEBEDB35A8CD9E0', 'Testimony', 'Gq8eKu-YlmI', 27],
  ['PL02FF0D08C308C87A', 'ECC NEWS', 'LSURdOXqf1k', 185],
  ['PLBJ6iS_VyLf8LA1Ctx-kzdFTE6lsbiaIp', 'ECC Christmas 2020 - Restart', 'f9rIMQduaak', 2],
  ['PLBJ6iS_VyLf-1x__W8yKQfFxa7kk_qOrL', 'Usher Ministry', '5WujVrScnUY', 15],
  ['PLBJ6iS_VyLf_Ebf_7Wur4y9TuAmwIhbEc', 'Hoblers Award', 'tzcDfytFEcw', 22],
  ['PLBJ6iS_VyLf9OEA9U4Nfrt7BfuCO7jVw1', 'The Bridge Pelajar Spotlight', 'HR8quE4Ga_k', 19],
  ['PLFD9A37D6979D3DBF', 'ECC-The Bridge Pelajar Single Out', 'jdqIrvDl8LU', 7],
  ['PLBJ6iS_VyLf9zQb2mEQVodZOwFMaUJiWf', 'Behind The Scene', 'rC82GHb7930', 2],
  ['PLBJ6iS_VyLf-kVp0Vdsc3HdbSnHRwBaCD', 'Video Clip by ELSECC', 'HQ-hohEfjmg', 2],
  ['PLBJ6iS_VyLf_N10B6-VEGhShmxInAj7hB', 'h.o.p', 'piw7vr9d4xc', 1],
  ['PLB45C99797FACA0A7', 'Dance', '5Wc6RfAjDpk', 3],
  ['PLA5A0E81467EE73F9', 'Bumper', '2eNcpkxEQOw', 16],
  ['PL09CA6F9C366178FF', 'ECC Ads', 'DtJoud61hM0', 35],
].map(([id, title, v, count]) => ({ id: id as string, title: title as string, thumb: T(v as string), count: count as number }));
