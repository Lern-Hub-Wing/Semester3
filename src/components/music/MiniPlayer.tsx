import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Maximize2, Minimize2, Pause, Play, X } from 'lucide-react';
import { AMBIENCE_LABEL } from '../../lib/ambience';
import { attachYouTube, player, usePlayer, type YTPlayer } from '../../store/player';
import { useLocation } from '../../lib/router';

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer; PlayerState: { ENDED: number; PLAYING: number; PAUSED: number } };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error('YouTube nicht erreichbar'));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

/**
 * Sichtbarer Mini-Player (YouTube verlangt einen sichtbaren Player).
 * Bleibt über Seitenwechsel bestehen; verkleinerbar; „∞“ = Endlosschleife.
 */
export function MiniPlayer() {
  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const small = usePlayer((s) => s.small);
  const { path } = useLocation();
  const host = useRef<HTMLDivElement>(null);
  const ytRef = useRef<YTPlayer | null>(null);
  const isYT = current?.kind === 'youtube';
  const track = isYT ? current.track : null;

  // YouTube-Player anlegen, sobald zum ersten Mal ein Titel gewählt wird
  useEffect(() => {
    if (!track || ytRef.current || !host.current) return;
    let cancelled = false;
    void loadYouTubeApi()
      .then(() => {
        if (cancelled || !host.current || !window.YT) return;
        const el = document.createElement('div');
        host.current.appendChild(el);
        const p = new window.YT.Player(el, {
          width: '100%',
          height: '100%',
          videoId: track.youtube_id,
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, start: track.start_seconds ?? 0, modestbranding: 1 },
          events: {
            onReady: () => {
              p.setVolume(usePlayer.getState().volume);
              if (usePlayer.getState().playing) p.playVideo();
            },
            onStateChange: (e: { data: number }) => {
              const S = window.YT!.PlayerState;
              const cur = usePlayer.getState().current;
              // Endlosschleife
              if (e.data === S.ENDED && cur?.kind === 'youtube') {
                p.seekTo(cur.track.start_seconds ?? 0, true);
                p.playVideo();
              }
              if (e.data === S.PLAYING) usePlayer.setState({ playing: true });
              if (e.data === S.PAUSED) usePlayer.setState({ playing: false });
            },
          },
        });
        ytRef.current = p;
        attachYouTube(p);
      })
      .catch(() => usePlayer.setState({ playing: false }));
    return () => {
      cancelled = true;
    };
  }, [track]);

  // Musik beendet → Fenster verschwindet; YouTube-Player mit aufräumen
  useEffect(() => {
    if (current) return;
    ytRef.current?.destroy();
    ytRef.current = null;
    attachYouTube(null);
  }, [current]);

  // Player beim Verlassen der App (Abmelden/Neuladen) aufräumen
  useEffect(
    () => () => {
      ytRef.current?.destroy();
      ytRef.current = null;
      attachYouTube(null);
    },
    [],
  );

  const focus = path.startsWith('/fokus');
  const title = track ? track.title : current?.kind === 'ambience' ? `${AMBIENCE_LABEL[current.ambience]} (erzeugt)` : '';

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.25 }}
          className={`mini-player fixed z-[60] overflow-hidden rounded-[16px] ${focus ? 'mini-player--focus' : ''} ${small ? 'w-[220px]' : 'w-[300px]'}`}
          data-testid="mini-player"
          role="region"
          aria-label="Musik"
        >
          {/* Video bleibt sichtbar (YouTube-Vorgabe); bei erzeugten Klängen gibt es kein Video */}
          <div ref={host} className={`bg-black ${isYT ? (small ? 'aspect-video' : 'aspect-video') : 'hidden'}`} />
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold" title={title}>
                {title}
              </p>
              <p className="text-[11px] text-muted">∞ Endlos</p>
            </div>
            <button type="button" onClick={() => player.toggle()} aria-label={playing ? 'Musik pausieren' : 'Musik abspielen'} className="grid size-8 place-items-center rounded-full bg-[var(--ss-accent-soft)] text-accent">
              {playing ? <Pause className="size-4" fill="currentColor" /> : <Play className="ml-0.5 size-4" fill="currentColor" />}
            </button>
            {isYT && (
              <button type="button" onClick={() => usePlayer.setState({ small: !small })} aria-label={small ? 'Player vergrößern' : 'Player verkleinern'} className="grid size-8 place-items-center rounded-full text-muted hover:text-ink">
                {small ? <Maximize2 className="size-4" /> : <Minimize2 className="size-4" />}
              </button>
            )}
            <button type="button" onClick={() => player.stop()} aria-label="Musik beenden" className="grid size-8 place-items-center rounded-full text-muted hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
