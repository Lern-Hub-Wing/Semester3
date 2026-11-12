import { create } from 'zustand';
import type { AuthChangeEvent, EmailOtpType, Provider, Session } from '@supabase/supabase-js';
import { getSupabase } from '../lib/supabase';
import { config } from '../lib/config';
import { describeError } from '../lib/errors';
import { api, extractInviteCode, type Me } from './api';
import { setRemember } from './authStorage';

/**
 * Anmeldestatus der App.
 *  loading   – Sitzung wird geprüft
 *  signedOut – Anmeldeseite
 *  recovery  – Link „Passwort vergessen“ geöffnet → neues Passwort setzen
 *  ready     – angemeldet; `me` enthält Konto, Gruppen und Plus-Status
 */
type Phase = 'loading' | 'signedOut' | 'recovery' | 'ready';

interface AccountState {
  phase: Phase;
  session: Session | null;
  me: Me | null;
  error: string | null;
  /** Einladungscode aus einem geöffneten Link (bis zum Beitritt gemerkt) */
  pendingInvite: string | null;
}

export const useAccount = create<AccountState>(() => ({
  phase: 'loading',
  session: null,
  me: null,
  error: null,
  pendingInvite: null,
}));

const INVITE_KEY = 'studyspace.app.invite';
const CACHE_PREFIX = 'studyspace.app.cache.';

/** Adresse der App (für Rückleitungen aus E-Mails und Google/Apple). */
export function appUrl(): string {
  const { origin, pathname } = window.location;
  return origin + pathname.replace(/index\.html$/, '');
}

export function inviteLink(code: string): string {
  return `${appUrl()}#/beitreten/${code}`;
}

function rememberInviteFromUrl() {
  const code = extractInviteCode(window.location.hash);
  if (code && window.location.hash.includes('beitreten')) {
    try {
      sessionStorage.setItem(INVITE_KEY, code);
    } catch {
      /* ohne Speicher bleibt der Code nur in diesem Zustand */
    }
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/`);
    useAccount.setState({ pendingInvite: code });
    return;
  }
  try {
    const saved = sessionStorage.getItem(INVITE_KEY);
    if (saved) useAccount.setState({ pendingInvite: saved });
  } catch {
    /* ignorieren */
  }
}

export function clearPendingInvite() {
  try {
    sessionStorage.removeItem(INVITE_KEY);
  } catch {
    /* ignorieren */
  }
  useAccount.setState({ pendingInvite: null });
}

/** Code-Parameter nach der Rückkehr aus E-Mail/OAuth aus der Adresse entfernen. */
function cleanAuthParams() {
  const url = new URL(window.location.href);
  let changed = false;
  for (const k of ['code', 'error', 'error_code', 'error_description']) {
    if (url.searchParams.has(k)) {
      url.searchParams.delete(k);
      changed = true;
    }
  }
  if (changed) window.history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
}

function authErrorFromUrl(): string | null {
  const url = new URL(window.location.href);
  const fromHash = new URLSearchParams(url.hash.replace(/^#\/?/, ''));
  const desc = url.searchParams.get('error_description') ?? fromHash.get('error_description');
  if (!desc) return null;
  if (/expired|invalid/i.test(desc)) return 'Der Link ist abgelaufen oder wurde schon verwendet. Bitte erneut anfordern.';
  return desc.replace(/\+/g, ' ');
}

export async function refreshMe(): Promise<Me | null> {
  try {
    const me = await api.me(getSupabase());
    useAccount.setState({ me, phase: 'ready', error: null });
    return me;
  } catch (err) {
    useAccount.setState({ error: describeError(err), phase: 'ready' });
    return null;
  }
}

let started = false;
/** Ein Link aus einer E-Mail wird gerade geprüft (nicht kurz die Anmeldung zeigen) */
let verifying = false;
/** Der geprüfte Link war „Passwort vergessen“ → danach neues Passwort festlegen */
let recoveryPending = false;

/**
 * Links aus E-Mails (Bestätigen, Passwort vergessen, E-Mail ändern) enthalten
 * `token_hash` und `type`. Anders als der PKCE-Code funktionieren sie auch auf
 * einem anderen Gerät oder Browser als dem, auf dem man sich registriert hat.
 */
async function verifyEmailLink() {
  const url = new URL(window.location.href);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  if (!tokenHash || !type) return;
  url.searchParams.delete('token_hash');
  url.searchParams.delete('type');
  window.history.replaceState(null, '', url.pathname + url.search + (url.hash || '#/'));
  verifying = true;
  recoveryPending = type === 'recovery';
  const { error } = await getSupabase().auth.verifyOtp({ token_hash: tokenHash, type });
  verifying = false;
  if (error) {
    recoveryPending = false;
    useAccount.setState({ error: 'Der Link ist abgelaufen oder wurde schon verwendet. Bitte erneut anfordern.' });
    if (useAccount.getState().phase === 'loading') useAccount.setState({ phase: 'signedOut' });
  }
}

let presence: ReturnType<typeof setInterval> | null = null;

function startPresence() {
  if (presence) return;
  const beat = () => {
    if (document.visibilityState === 'visible') void api.touch(getSupabase()).catch(() => undefined);
  };
  beat();
  presence = setInterval(beat, 60_000);
  document.addEventListener('visibilitychange', beat);
}

/** Einmalig: Sitzung laden und auf Anmelde-Ereignisse hören. */
export function initAccount() {
  if (started || !config.isConfigured) return;
  started = true;
  rememberInviteFromUrl();
  const urlError = authErrorFromUrl();
  if (urlError) useAccount.setState({ error: urlError });
  const sb = getSupabase();
  if (new URLSearchParams(window.location.search).has('token_hash')) verifying = true;

  sb.auth.onAuthStateChange((event: AuthChangeEvent, session) => {
    useAccount.setState({ session });
    if (event === 'PASSWORD_RECOVERY' || (recoveryPending && session)) {
      recoveryPending = false;
      useAccount.setState({ phase: 'recovery' });
      return;
    }
    if (!session) {
      if (verifying) return; // Link wird noch geprüft
      useAccount.setState({ phase: 'signedOut', me: null });
      return;
    }
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
      // Nicht im Callback auf Supabase warten (Sperre in supabase-js) → danach laden
      setTimeout(() => {
        if (useAccount.getState().phase === 'recovery') return;
        cleanAuthParams();
        void refreshMe();
        startPresence();
      }, 0);
    }
  });
  void verifyEmailLink();
}

// ---------------------------------------------------------------------
// Anmelden / Registrieren
// ---------------------------------------------------------------------

export async function signInWithPassword(email: string, password: string, remember: boolean) {
  setRemember(remember);
  const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

/** Registrierung; Supabase schickt eine Bestätigungs-E-Mail (wenn aktiviert). */
export async function signUp(email: string, password: string, displayName: string, remember: boolean): Promise<{ needsConfirmation: boolean }> {
  setRemember(remember);
  const { data, error } = await getSupabase().auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: appUrl(), data: { display_name: displayName.trim() } },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function signInWithProvider(provider: Extract<Provider, 'google' | 'apple'>, remember: boolean) {
  setRemember(remember);
  const { error } = await getSupabase().auth.signInWithOAuth({ provider, options: { redirectTo: appUrl() } });
  if (error) throw error;
}

export async function sendPasswordReset(email: string) {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl() });
  if (error) throw error;
}

export async function resendConfirmation(email: string) {
  const { error } = await getSupabase().auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: appUrl() } });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await getSupabase().auth.updateUser({ password });
  if (error) throw error;
  if (useAccount.getState().phase === 'recovery') {
    useAccount.setState({ phase: 'loading' });
    cleanAuthParams();
    await refreshMe();
    startPresence();
  }
}

/** Abmelden und alle lokal zwischengespeicherten Gruppendaten entfernen. */
export async function signOut(scope: 'local' | 'global' = 'local') {
  try {
    await getSupabase().auth.signOut({ scope });
  } finally {
    clearLocalData();
    window.location.replace(appUrl());
  }
}

export function clearLocalData() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
  } catch {
    /* ignorieren */
  }
}

/** Zwischenspeicher je Konto und Gruppe – nie Daten einer anderen Gruppe anzeigen. */
export function cacheKeyFor(me: Pick<Me, 'user_id' | 'active_group_id'>): string {
  return `${CACHE_PREFIX}${me.user_id}.${me.active_group_id ?? 'none'}`;
}

/** Nach Gruppenwechsel/-beitritt komplett neu laden (Daten, Live-Sync, Cache). */
export function reloadIntoGroup() {
  window.location.hash = '#/';
  window.location.reload();
}

// ---------------------------------------------------------------------
// Welche Anmeldewege sind im Supabase-Projekt eingeschaltet?
// ---------------------------------------------------------------------

export interface AuthProviders {
  google: boolean;
  apple: boolean;
  email: boolean;
  signupDisabled: boolean;
  autoconfirm: boolean;
}

let providersPromise: Promise<AuthProviders | null> | null = null;

export function loadProviders(): Promise<AuthProviders | null> {
  providersPromise ??= fetch(`${config.supabaseUrl}/auth/v1/settings`, { headers: { apikey: config.supabaseKey } })
    .then((r) => (r.ok ? r.json() : null))
    .then((s) =>
      s
        ? {
            google: !!s.external?.google,
            apple: !!s.external?.apple,
            email: s.external?.email !== false,
            signupDisabled: !!s.disable_signup,
            autoconfirm: !!s.mailer_autoconfirm,
          }
        : null,
    )
    .catch(() => null);
  return providersPromise;
}

/** Fehlermeldungen von Supabase Auth auf Deutsch. */
export function describeAuthError(err: unknown): string {
  const e = (err ?? {}) as { message?: string; code?: string; status?: number };
  const msg = e.message ?? '';
  const code = e.code ?? '';
  if (code === 'invalid_credentials' || /Invalid login credentials/i.test(msg)) return 'E-Mail oder Passwort ist falsch.';
  if (code === 'email_not_confirmed' || /Email not confirmed/i.test(msg)) return 'Bitte bestätige zuerst deine E-Mail-Adresse (Link in der E-Mail).';
  if (code === 'user_already_exists' || /already registered/i.test(msg)) return 'Für diese E-Mail gibt es schon ein Konto. Bitte anmelden.';
  if (code === 'weak_password' || /Password should/i.test(msg)) return 'Das Passwort ist zu schwach. Bitte länger und mit Ziffern wählen.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || e.status === 429) return 'Zu viele Versuche. Bitte einige Minuten warten.';
  if (code === 'signup_disabled' || /Signups not allowed/i.test(msg)) return 'Neue Registrierungen sind derzeit geschlossen.';
  if (code === 'provider_disabled' || /provider is not enabled/i.test(msg)) return 'Diese Anmeldeart ist noch nicht eingerichtet.';
  if (code === 'same_password') return 'Das neue Passwort muss sich vom alten unterscheiden.';
  if (/valid email|invalid format/i.test(msg)) return 'Bitte eine gültige E-Mail-Adresse eingeben.';
  return describeError(err);
}
