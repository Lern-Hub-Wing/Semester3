/**
 * Web Push im Browser: Unterstützung erkennen, Abonnement anlegen und mit
 * der Edge Function „push-api“ abgleichen.
 *
 * Es gibt keine Anmeldung. Jedes Gerät erzeugt einmalig einen geheimen
 * Zufallstoken (32 Byte) und speichert ihn nur lokal. Der Server kennt nur
 * dessen Hash. Die Zuordnung „Gerät → Lernprofil“ ist eine Gerätepräferenz,
 * keine verifizierte Identität.
 */
import { config } from './config';
import { isIPhone, isStandalone } from './fullscreen';
import { normalizePrefs, type PushPrefs } from '../../supabase/functions/_shared/prefs.ts';

export type { PushPrefs };
export { DEFAULT_PREFS, normalizePrefs } from '../../supabase/functions/_shared/prefs.ts';

const TOKEN_KEY = 'studyspace.push.token';
const LOCAL_KEY = 'studyspace.push.device';

export const vapidPublicKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim();

export interface PushEnvironment {
  /** Browser kann Web Push (Service Worker + Push API + Notifications API) */
  supported: boolean;
  /** iPhone/iPad */
  ios: boolean;
  /** Als App vom Home-Bildschirm gestartet */
  standalone: boolean;
  /** iOS im Browser: erst zum Home-Bildschirm hinzufügen */
  needsInstall: boolean;
  /** Server-Seite eingerichtet (Publishable Key + VAPID-Schlüssel vorhanden) */
  configured: boolean;
  permission: NotificationPermission | 'unsupported';
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return isIPhone() || /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function pushEnvironment(): PushEnvironment {
  const hasWindow = typeof window !== 'undefined';
  const supported = hasWindow && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const ios = isIOS();
  const standalone = hasWindow && isStandalone();
  return {
    supported,
    ios,
    standalone,
    // iOS/iPadOS unterstützen Web Push nur für Web-Apps auf dem Home-Bildschirm (ab 16.4)
    needsInstall: ios && !standalone,
    configured: config.isConfigured && vapidPublicKey.length > 60,
    permission: supported ? Notification.permission : 'unsupported',
  };
}

export function platformLabel(): string {
  const ua = navigator.userAgent;
  if (isIOS()) return /iPad/.test(ua) || navigator.maxTouchPoints > 1 && !/iPhone/.test(ua) ? 'iPadOS' : 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Web';
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const s = input.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Geheimer Gerätetoken (wird bei Bedarf erzeugt) */
export function deviceToken(): string {
  try {
    const existing = localStorage.getItem(TOKEN_KEY);
    if (existing && /^[A-Za-z0-9_-]{43}$/.test(existing)) return existing;
    const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
    localStorage.setItem(TOKEN_KEY, token);
    return token;
  } catch {
    // Ohne Speicher ist eine dauerhafte Zuordnung nicht möglich
    return b64url(crypto.getRandomValues(new Uint8Array(32)));
  }
}

/** Lokale Kopie des Registrierungsstands (für sofortige Anzeige und Profilwechsel) */
export interface LocalDevice {
  endpoint: string;
  memberId: string;
}

export function loadLocalDevice(): LocalDevice | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const v = raw ? (JSON.parse(raw) as LocalDevice) : null;
    return v && typeof v.endpoint === 'string' && typeof v.memberId === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function saveLocalDevice(v: LocalDevice | null) {
  try {
    if (v) localStorage.setItem(LOCAL_KEY, JSON.stringify(v));
    else localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* egal */
  }
}

export class PushApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

export interface ServerStatus {
  registered: boolean;
  enabled?: boolean;
  memberId?: string | null;
  prefs?: PushPrefs;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  /** Öffentlicher VAPID-Schlüssel des Servers (zum Abgleich mit VITE_VAPID_PUBLIC_KEY) */
  serverKey?: string;
  /** Letzter Lauf der Zeitsteuerung (null = noch nie; fehlt bei älterem Server) */
  schedulerAt?: string | null;
}

/** Prüft, ob der Schlüssel der Webseite zum Schlüssel des Servers passt (Fehlertext oder null). */
export function keyMismatch(serverKey: string | undefined, appKey: string = vapidPublicKey): string | null {
  if (!serverKey || !appKey) return null;
  const norm = (k: string) => k.trim().replace(/=+$/, '');
  if (norm(serverKey) === norm(appKey)) return null;
  return 'Die Schlüssel passen nicht zusammen: VITE_VAPID_PUBLIC_KEY in GitHub ist ein anderer als VAPID_PUBLIC_KEY in Supabase. Beide müssen aus demselben Schlüsselpaar stammen (README 12.3 und 12.6). Danach neu veröffentlichen und Benachrichtigungen aus- und wieder einschalten.';
}

/** Aufruf der Edge Function „push-api“ mit dem öffentlichen Publishable Key. */
export async function pushApi<T = ServerStatus>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: config.supabaseKey };
  // Ältere anon-Keys sind JWTs und dürfen zusätzlich als Bearer mitgehen
  if (config.supabaseKey.split('.').length === 3) headers.Authorization = `Bearer ${config.supabaseKey}`;
  let res: Response;
  try {
    res = await fetch(`${config.supabaseUrl}/functions/v1/push-api`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, token: deviceToken(), ...payload }),
    });
  } catch {
    throw new PushApiError('Keine Verbindung zum Server.', 0, 'offline');
  }
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    /* leer */
  }
  if (!res.ok) {
    const notDeployed = res.status === 404 && !('registered' in body);
    throw new PushApiError(
      notDeployed
        ? 'Die Benachrichtigungsfunktion ist auf dem Server noch nicht bereitgestellt.'
        : `${String(body.error ?? `Fehler ${res.status}`)}${typeof body.detail === 'string' && body.detail ? ` ${body.detail}` : ''}`,
      res.status,
      notDeployed ? 'not_deployed' : (body.code as string | undefined),
      typeof body.retryAfter === 'number' ? body.retryAfter : undefined,
    );
  }
  if (body.prefs) body.prefs = normalizePrefs(body.prefs);
  return body as T;
}

async function registration(timeoutMs = 10_000): Promise<ServiceWorkerRegistration> {
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('sw-timeout')), timeoutMs));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushEnvironment().supported) return null;
  try {
    const reg = await registration(4000);
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Fragt die Systemberechtigung an und legt das Abonnement an.
 * MUSS direkt aus einem Klick/Tipp aufgerufen werden: Die Berechtigung wird
 * als allererstes (ohne vorheriges Warten) angefragt – sonst lehnen Safari
 * und Firefox die Anfrage ab.
 */
export async function subscribeFromGesture(): Promise<{ subscription: PushSubscription } | { error: 'denied' | 'dismissed' | 'unsupported' | 'failed'; detail?: string }> {
  const env = pushEnvironment();
  if (!env.supported) return { error: 'unsupported' };
  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission === 'denied') return { error: 'denied' };
  if (permission !== 'granted') return { error: 'dismissed' };
  try {
    const reg = await registration();
    const key = b64urlToBytes(vapidPublicKey);
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      // Abo mit altem Serverschlüssel (VAPID-Schlüssel wurden gewechselt) → neu anlegen
      const oldKey = existing.options?.applicationServerKey;
      const same = !oldKey || b64url(new Uint8Array(oldKey)) === b64url(key);
      if (same) return { subscription: existing };
      await existing.unsubscribe().catch(() => undefined);
    }
    const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    return { subscription };
  } catch (err) {
    const detail = err instanceof Error ? (err.message === 'sw-timeout' ? 'Der Service Worker ist noch nicht bereit. Bitte die App einmal neu laden.' : err.message) : String(err);
    return { error: 'failed', detail };
  }
}

export async function unsubscribe(): Promise<void> {
  const sub = await currentSubscription();
  await sub?.unsubscribe().catch(() => undefined);
}

/** Zahl am App-Symbol setzen (Badging API, nur mit erteilter Benachrichtigungsberechtigung sinnvoll) */
export function setAppBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (count > 0) void nav.setAppBadge?.(count)?.catch(() => undefined);
    else void nav.clearAppBadge?.()?.catch(() => undefined);
  } catch {
    /* nicht unterstützt */
  }
}
