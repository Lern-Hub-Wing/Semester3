/** Übersetzt technische Fehler in verständliche Meldungen. */
import { IS_APP } from './edition';

/** Regeln der App (Plus, Kontingente, Gruppen): die Datenbank liefert schon verständliche Texte. */
const APP_HINTS = new Set([
  'plus_required', 'quota_active', 'quota_daily', 'member_limit', 'group_limit', 'invalid_code', 'owner_cannot_leave',
  'confirm', 'no_group', 'cross_group', 'group_immutable', 'admin_required',
]);

export class ConflictError extends Error {
  constructor(message = 'Der Inhalt wurde inzwischen auf einem anderen Gerät geändert.') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class OfflineError extends Error {
  constructor() {
    super('Keine Internetverbindung – die Änderung wurde nicht gespeichert.');
    this.name = 'OfflineError';
  }
}

interface MaybePgError {
  message?: string;
  code?: string;
  hint?: string;
  details?: string;
  statusCode?: string | number;
  error?: string;
}

export function describeError(err: unknown): string {
  if (err instanceof ConflictError || err instanceof OfflineError) return err.message;
  const e = (err ?? {}) as MaybePgError;
  const msg = e.message ?? (typeof err === 'string' ? err : '');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return new OfflineError().message;
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(msg)) {
    return 'Keine Verbindung zur Datenbank – die Änderung wurde nicht gespeichert.';
  }
  if (IS_APP) {
    if (e.hint && APP_HINTS.has(e.hint) && msg) return msg;
    if (e.code === 'PGRST301' || /JWT expired/i.test(msg)) return 'Deine Anmeldung ist abgelaufen. Bitte neu anmelden.';
    if (/row-level security|permission denied/i.test(msg) || e.code === '42501') return 'Das ist in deiner Lerngruppe nicht erlaubt.';
    if (e.code === 'P0001' && msg) return msg;
  }
  switch (e.hint) {
    case 'rate_limit':
      return 'Zu viele Änderungen in kurzer Zeit. Bitte einen Moment warten.';
    case 'last_active_member':
      return 'Mindestens eine Person muss aktiv bleiben.';
    case 'member_limit':
      return 'Es sind bereits zu viele Personen angelegt.';
    case 'topic_module_mismatch':
      return 'Das gewählte Thema gehört nicht zu diesem Modul.';
    case 'attachment_target_missing':
      return 'Das Ziel für diese Datei existiert nicht mehr.';
    case 'immutable_column':
      return 'Diese Angabe kann nicht verändert werden.';
  }
  if (e.code === '23514') return 'Die Eingabe ist ungültig (zu lang, leer oder falsches Format).';
  if (e.code === '23503') return 'Ein verknüpfter Eintrag fehlt. Bitte Seite neu laden.';
  if (e.code === '23505') return 'Dieser Eintrag existiert bereits.';
  if (e.code === '42501') return 'Diese Aktion ist nicht erlaubt.';
  if (e.code === 'PGRST301' || e.code === '401') return 'Der Supabase-Schlüssel ist ungültig.';
  if (/mime type|invalid_mime_type/i.test(msg)) return 'Dieser Dateityp ist nicht erlaubt. Erlaubt sind PDF, PNG, JPG und WebP.';
  if (/maximum allowed size|Payload too large|exceeded/i.test(msg)) return 'Die Datei ist zu groß.';
  if (/row-level security/i.test(msg)) return 'Der Upload wurde von den Speicherregeln abgelehnt.';
  return msg ? `Fehler: ${msg}` : 'Unbekannter Fehler – die Änderung wurde nicht gespeichert.';
}
