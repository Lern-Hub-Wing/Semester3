import { create } from 'zustand';

/**
 * Übergang Profilwahl → Dashboard: das Berg-Panorama bleibt stehen, wird
 * kleiner und gleitet in das Countdown-Fenster.
 */
export interface FlightStart {
  /** Rahmen des Panoramas in der Profilwahl (Bildschirmkoordinaten) */
  x: number;
  y: number;
  w: number;
  h: number;
}

interface FlightState {
  /** läuft gerade */
  start: FlightStart | null;
  /** Zeitpunkt der Ankunft (für das Einblenden von Text und Gipfel) */
  arrivedAt: number;
}

export const useFlight = create<FlightState>(() => ({ start: null, arrivedAt: 0 }));

export function beginFlight(start: FlightStart) {
  useFlight.setState({ start });
}

export function endFlight(arrived: boolean) {
  useFlight.setState({ start: null, arrivedAt: arrived ? Date.now() : 0 });
}
