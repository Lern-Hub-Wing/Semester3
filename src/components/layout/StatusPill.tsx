import { CloudAlert, CloudCheck, CloudOff, LoaderCircle, RefreshCw } from 'lucide-react';
import { useData, useSyncStatus } from '../../store/data';
import { resync } from '../../store/sync';

/** Kleiner Speicher- und Verbindungsstatus. */
/** quiet: im Normalzustand („Gespeichert“, live) unsichtbar – erscheint nur bei Bedarf */
export function StatusPill({ withLabel = true, quiet = false, className = '' }: { withLabel?: boolean; quiet?: boolean; className?: string }) {
  const { inflight, lastError, online, realtime } = useSyncStatus();
  const fromCache = useData((s) => s.fromCache);
  const loadError = useData((s) => s.error);

  let icon = <CloudCheck className="size-4 text-success" aria-hidden />;
  let label = 'Gespeichert';
  let title = 'Alle Änderungen sind gespeichert und werden live synchronisiert.';
  let tone = '';

  if (!online) {
    icon = <CloudOff className="size-4 text-warn" aria-hidden />;
    label = 'Offline';
    title = 'Keine Verbindung. Angezeigt wird der zuletzt geladene Stand; Änderungen werden nicht gespeichert.';
    tone = 'text-warn';
  } else if (inflight > 0) {
    icon = <LoaderCircle className="size-4 animate-spin text-muted" aria-hidden />;
    label = 'Speichert …';
    title = 'Änderungen werden gespeichert.';
  } else if (lastError) {
    icon = <CloudAlert className="size-4 text-danger" aria-hidden />;
    label = 'Nicht gespeichert';
    title = lastError;
    tone = 'text-danger';
  } else if (fromCache || loadError) {
    icon = <RefreshCw className="size-4 text-warn" aria-hidden />;
    label = fromCache ? 'Lädt aktuellen Stand …' : 'Verbindung gestört';
    title = loadError ?? 'Es werden zwischengespeicherte Daten angezeigt.';
    tone = 'text-warn';
  } else if (realtime === 'down') {
    icon = <RefreshCw className="size-4 text-warn" aria-hidden />;
    label = 'Live-Sync unterbrochen';
    title = 'Die Live-Verbindung wird wiederhergestellt. Tippen zum Neuladen.';
    tone = 'text-warn';
  }

  if (quiet && label === 'Gespeichert') return null;
  return (
    <button
      type="button"
      onClick={() => void resync()}
      title={title}
      aria-label={`${label}. ${title} Tippen zum Aktualisieren.`}
      className={`glass mat-interactive inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium ${tone} ${className}`}
    >
      {icon}
      {withLabel && <span className="hidden sm:inline">{label}</span>}
      <span className="sr-only sm:hidden">{label}</span>
    </button>
  );
}

export function OfflineBanner() {
  const online = useSyncStatus((s) => s.online);
  const lastSyncAt = useData((s) => s.lastSyncAt);
  if (online) return null;
  return (
    <div role="status" className="mb-4 flex items-start gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--ss-warn)_35%,transparent)] bg-[color-mix(in_srgb,var(--ss-warn)_12%,transparent)] px-4 py-3 text-sm">
      <CloudOff className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
      <p>
        <strong className="font-semibold">Du bist offline.</strong> Angezeigt wird der zuletzt geladene Stand
        {lastSyncAt ? ` (${new Date(lastSyncAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })})` : ''}. Änderungen
        können erst wieder gespeichert werden, wenn die Verbindung zurück ist.
      </p>
    </div>
  );
}
