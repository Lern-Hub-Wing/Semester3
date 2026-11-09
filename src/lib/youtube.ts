/**
 * YouTube-Links für die Musik-Bibliothek: nur die Video-ID wird
 * gespeichert, abgespielt wird über den offiziellen Player.
 */

export type MusicCategory = 'lofi' | 'regen' | 'gewitter' | 'wind' | 'natur' | 'lagerfeuer' | 'kamin' | 'konzentration' | 'eigene';

export const MUSIC_CATEGORIES: { id: MusicCategory; label: string; slots: number }[] = [
  { id: 'lofi', label: 'Lofi', slots: 10 },
  { id: 'regen', label: 'Regen', slots: 3 },
  { id: 'gewitter', label: 'Gewitter', slots: 3 },
  { id: 'wind', label: 'Starker Wind', slots: 3 },
  { id: 'natur', label: 'Natur', slots: 3 },
  { id: 'lagerfeuer', label: 'Lagerfeuer', slots: 3 },
  { id: 'kamin', label: 'Kamin', slots: 3 },
  { id: 'konzentration', label: 'Konzentration', slots: 5 },
  { id: 'eigene', label: 'Eigene', slots: 0 },
];

export const categoryLabel = (c: MusicCategory) => MUSIC_CATEGORIES.find((x) => x.id === c)?.label ?? c;

export interface ParsedYouTube {
  id: string;
  start: number | null;
}

const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com']);

/** „1h2m3s“, „90s“, „90“ → Sekunden */
function parseTime(t: string | null): number | null {
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** Liest Video-ID und Startzeit aus einem YouTube-Link (oder einer reinen ID). */
export function parseYouTube(input: string): ParsedYouTube | null {
  const raw = input.trim();
  if (ID_RE.test(raw)) return { id: raw, start: null };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;
  let id: string | null = null;
  if (url.hostname.toLowerCase() === 'youtu.be') id = url.pathname.split('/')[1] ?? null;
  else if (url.pathname === '/watch') id = url.searchParams.get('v');
  else {
    const m = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname);
    id = m?.[1] ?? null;
  }
  if (!id || !ID_RE.test(id)) return null;
  const start = parseTime(url.searchParams.get('t') ?? url.searchParams.get('start'));
  return { id, start: start && start > 0 && start <= 86400 ? start : null };
}

export const thumbnailUrl = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
