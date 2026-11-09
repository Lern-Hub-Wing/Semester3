import { create } from 'zustand';
import { startAmbience, stopAmbience, setAmbienceVolume, type AmbienceKind } from '../lib/ambience';
import { unlockAudio } from '../lib/chime';
import type { MusicTrack } from './music';

/**
 * Ein Player für die ganze App: entweder ein YouTube-Titel aus der
 * Bibliothek oder ein erzeugter Klang (Lofi, Regen, Rauschen).
 * Läuft weiter, wenn man zwischen Seiten wechselt.
 */

/** Minimaler Ausschnitt der YouTube-IFrame-API */
export interface YTPlayer {
  loadVideoById(o: { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  setVolume(v: number): void;
  destroy(): void;
}

export type Playing = { kind: 'youtube'; track: MusicTrack } | { kind: 'ambience'; ambience: AmbienceKind };

interface PlayerState {
  current: Playing | null;
  playing: boolean;
  /** 0–100 */
  volume: number;
  /** YouTube-Video sichtbar (Standard: versteckt, nur Ton + Steuerleiste) */
  showVideo: boolean;
}

const VOL_KEY = 'studyspace.player.volume';
const initialVolume = (() => {
  try {
    const v = Number(localStorage.getItem(VOL_KEY));
    return Number.isFinite(v) && v > 0 && v <= 100 ? v : 60;
  } catch {
    return 60;
  }
})();

export const usePlayer = create<PlayerState>(() => ({ current: null, playing: false, volume: initialVolume, showVideo: false }));

/** Wird vom Mini-Player gesetzt, sobald der YouTube-Player bereit ist */
let yt: YTPlayer | null = null;
export function attachYouTube(p: YTPlayer | null) {
  yt = p;
}

export const player = {
  /** Synchron aus dem Klick aufrufen (iOS erlaubt Ton nur direkt nach einer Berührung) */
  playTrack(track: MusicTrack) {
    stopAmbience();
    usePlayer.setState({ current: { kind: 'youtube', track }, playing: true });
    if (yt) {
      yt.loadVideoById({ videoId: track.youtube_id, startSeconds: track.start_seconds ?? 0 });
      yt.setVolume(usePlayer.getState().volume);
      yt.playVideo();
    }
  },
  playAmbience(kind: AmbienceKind) {
    yt?.stopVideo();
    unlockAudio();
    setAmbienceVolume(usePlayer.getState().volume / 100);
    startAmbience(kind);
    usePlayer.setState({ current: { kind: 'ambience', ambience: kind }, playing: true });
  },
  toggle() {
    const { current, playing } = usePlayer.getState();
    if (!current) return;
    if (current.kind === 'youtube') {
      if (playing) yt?.pauseVideo();
      else yt?.playVideo();
    } else if (playing) stopAmbience();
    else {
      unlockAudio();
      startAmbience(current.ambience);
    }
    usePlayer.setState({ playing: !playing });
  },
  stop() {
    yt?.stopVideo();
    stopAmbience();
    usePlayer.setState({ current: null, playing: false });
  },
  setVolume(v: number) {
    const volume = Math.min(100, Math.max(0, Math.round(v)));
    usePlayer.setState({ volume });
    yt?.setVolume(volume);
    setAmbienceVolume(volume / 100);
    try {
      localStorage.setItem(VOL_KEY, String(volume));
    } catch {
      /* egal */
    }
  },
};

/** Ist genau dieser Titel / Klang gerade aktiv? */
export function isCurrent(p: Playing | null, id: string): boolean {
  if (!p) return false;
  return p.kind === 'youtube' ? p.track.id === id : `ambience:${p.ambience}` === id;
}
