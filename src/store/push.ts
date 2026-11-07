import { create } from 'zustand';
import {
  DEFAULT_PREFS, PushApiError, currentSubscription, loadLocalDevice, platformLabel, pushApi, pushEnvironment, saveLocalDevice, subscribeFromGesture, unsubscribe,
  type PushPrefs, type ServerStatus,
} from '../lib/push';

/**
 * Zustand der Push-Benachrichtigungen auf DIESEM Gerät.
 *
 *  unsupported    Browser kann kein Web Push
 *  needs-install  iPhone/iPad im Browser → erst zum Home-Bildschirm hinzufügen
 *  not-configured Server noch nicht eingerichtet (VAPID-Schlüssel fehlt)
 *  denied         Systemberechtigung verweigert
 *  off            möglich, aber nicht aktiviert
 *  working        wird gerade eingerichtet/geändert
 *  on             aktiv: Gerät ist registriert
 */
export type PushPhase = 'loading' | 'unsupported' | 'needs-install' | 'not-configured' | 'denied' | 'off' | 'working' | 'on';

export type TestState =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'accepted'; at: number }
  | { state: 'failed'; message: string }
  | { state: 'cooldown'; until: number; message: string };

interface PushStore {
  phase: PushPhase;
  memberId: string | null;
  prefs: PushPrefs;
  error: string | null;
  lastSuccessAt: string | null;
  test: TestState;
  set: (p: Partial<PushStore>) => void;
}

export const usePush = create<PushStore>((set) => ({
  phase: 'loading',
  memberId: loadLocalDevice()?.memberId ?? null,
  prefs: DEFAULT_PREFS,
  error: null,
  lastSuccessAt: null,
  test: { state: 'idle' },
  set: (p) => set(p),
}));

const setState = (p: Partial<PushStore>) => usePush.setState(p);

function messageOf(err: unknown): string {
  if (err instanceof PushApiError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

function applyServer(s: ServerStatus) {
  setState({
    prefs: s.prefs ?? DEFAULT_PREFS,
    memberId: s.memberId ?? null,
    lastSuccessAt: s.lastSuccessAt ?? null,
    error: s.lastError ? `Letzter Versand fehlgeschlagen: ${s.lastError}` : null,
  });
}

function basePhase(): PushPhase | null {
  const env = pushEnvironment();
  if (!env.configured) return 'not-configured';
  if (env.needsInstall) return 'needs-install';
  if (!env.supported) return 'unsupported';
  if (env.permission === 'denied') return 'denied';
  return null;
}

let initPromise: Promise<void> | null = null;

/**
 * Abgleich beim Start: Stimmt das lokale Abonnement noch mit dem Server
 * überein? Browser können Abos erneuern oder (nach Löschen der
 * Websitedaten) verlieren – dann wird neu registriert bzw. als aus markiert.
 */
export function initPush(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const blocked = basePhase();
    if (blocked) {
      setState({ phase: blocked });
      return;
    }
    const local = loadLocalDevice();
    if (!local || Notification.permission !== 'granted') {
      setState({ phase: 'off' });
      return;
    }
    const sub = await currentSubscription();
    if (!sub) {
      saveLocalDevice(null);
      setState({ phase: 'off' });
      void pushApi('unregister').catch(() => undefined);
      return;
    }
    try {
      let status = await pushApi('status');
      if (!status.registered || sub.endpoint !== local.endpoint) {
        status = await pushApi('register', { subscription: sub.toJSON(), memberId: local.memberId, platform: platformLabel() });
        saveLocalDevice({ endpoint: sub.endpoint, memberId: local.memberId });
      }
      applyServer(status);
      setState({ phase: status.enabled === false ? 'off' : 'on' });
    } catch (err) {
      // Offline o. ä.: lokal bekannten Zustand zeigen, Fehler vermerken
      setState({ phase: 'on', error: messageOf(err) });
    }
  })().finally(() => {
    initPromise = null;
  });
  return initPromise;
}

/** Benachrichtigungen aktivieren – direkt aus dem Klick aufrufen. */
export async function enablePush(memberId: string, prefs?: Partial<PushPrefs>): Promise<{ ok: true } | { ok: false; reason: string }> {
  const blocked = basePhase();
  if (blocked && blocked !== 'denied') {
    setState({ phase: blocked });
    return { ok: false, reason: blocked };
  }
  setState({ phase: 'working', error: null });
  const res = await subscribeFromGesture();
  if ('error' in res) {
    if (res.error === 'denied') {
      setState({ phase: 'denied' });
      return { ok: false, reason: 'denied' };
    }
    setState({ phase: 'off', error: res.error === 'dismissed' ? null : res.detail ?? 'Die Einrichtung ist fehlgeschlagen.' });
    return { ok: false, reason: res.error };
  }
  try {
    const status = await pushApi('register', {
      subscription: res.subscription.toJSON(),
      memberId,
      platform: platformLabel(),
      prefs: { ...usePush.getState().prefs, ...prefs },
    });
    saveLocalDevice({ endpoint: res.subscription.endpoint, memberId });
    applyServer(status);
    setState({ phase: 'on', error: null });
    return { ok: true };
  } catch (err) {
    setState({ phase: 'off', error: messageOf(err) });
    return { ok: false, reason: messageOf(err) };
  }
}

export async function disablePush(): Promise<void> {
  setState({ phase: 'working' });
  try {
    await pushApi('unregister');
  } catch {
    /* Server nicht erreichbar: Abo trotzdem lokal beenden */
  }
  await unsubscribe();
  saveLocalDevice(null);
  setState({ phase: basePhase() ?? 'off', error: null, test: { state: 'idle' } });
}

/** Für welches Lernprofil dieses Gerät Erinnerungen erhält */
export async function setPushMember(memberId: string): Promise<boolean> {
  const local = loadLocalDevice();
  try {
    const status = await pushApi('update', { memberId });
    applyServer(status);
    if (local) saveLocalDevice({ ...local, memberId });
    return true;
  } catch (err) {
    setState({ error: messageOf(err) });
    return false;
  }
}

let prefsTimer: ReturnType<typeof setTimeout> | null = null;

/** Einstellungen sofort anzeigen und kurz verzögert speichern (mehrere Klicks = eine Anfrage) */
export function updatePushPrefs(patch: Partial<PushPrefs>): Promise<boolean> {
  const next = { ...usePush.getState().prefs, ...patch };
  setState({ prefs: next });
  if (prefsTimer) clearTimeout(prefsTimer);
  return new Promise((resolve) => {
    prefsTimer = setTimeout(async () => {
      try {
        const status = await pushApi('update', { prefs: usePush.getState().prefs });
        applyServer(status);
        resolve(true);
      } catch (err) {
        setState({ error: `Einstellungen nicht gespeichert: ${messageOf(err)}` });
        resolve(false);
      }
    }, 450);
  });
}

/** Echte Testnachricht über Edge Function → Push-Dienst → Gerät */
export async function sendTestPush(): Promise<void> {
  setState({ test: { state: 'sending' } });
  try {
    await pushApi<{ accepted: boolean }>('test');
    setState({ test: { state: 'accepted', at: Date.now() }, lastSuccessAt: new Date().toISOString(), error: null });
  } catch (err) {
    if (err instanceof PushApiError && err.status === 429) {
      setState({ test: { state: 'cooldown', until: Date.now() + (err.retryAfter ?? 30) * 1000, message: err.message } });
    } else if (err instanceof PushApiError && (err.code === 'expired' || err.code === 'not_registered')) {
      saveLocalDevice(null);
      setState({ phase: 'off', test: { state: 'failed', message: err.message } });
    } else {
      setState({ test: { state: 'failed', message: messageOf(err) } });
    }
  }
}
