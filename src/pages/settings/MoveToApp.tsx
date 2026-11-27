import { useState } from 'react';
import { stayThisSession } from '../../components/layout/MovedScreen';
import { ArrowRightLeft, CheckCircle2, Download, ExternalLink, Rocket, ShieldCheck, Smartphone } from 'lucide-react';
import { Row, Section } from '../../components/ui/SettingsCard';
import { Button } from '../../components/ui/Button';
import { Switch } from '../../components/ui/Switch';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { TINT } from '../../lib/tints';
import { describeError } from '../../lib/errors';
import { useData } from '../../store/data';
import { setSetting } from '../../store/actions';
import { downloadJson } from '../../store/backup';
import { createMovePackage, MOVE_LABELS } from '../../store/movePackage';
import { toast } from '../../store/toast';
import { appAddress, movedTarget } from '../../components/layout/MovedScreen';

const BACKUP_KEY = 'studyspace.move.backupAt';

/**
 * Einstellungen → Umzug in die App (nur bisherige Seite):
 * 1. Sicherheitskopie (= Umzugsdatei) herunterladen
 * 2. In der App übernehmen (Admin → Umzug) und Code an die Gruppe schicken
 * 3. Seite auf die App umleiten (jederzeit rückgängig)
 */
export function MoveToAppSection() {
  const moved = useData((s) => movedTarget(s.app_settings.moved_to_app?.value));
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [backupAt, setBackupAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem(BACKUP_KEY);
    } catch {
      return null;
    }
  });
  const [confirm, setConfirm] = useState(false);
  const app = appAddress();

  const backup = async () => {
    setBusy(true);
    try {
      const pkg = await createMovePackage();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJson(pkg, `studyspace-umzug-${stamp}.json`);
      const c: Record<string, number> = {};
      for (const k of Object.keys(MOVE_LABELS)) if (pkg.tables[k]) c[k] = pkg.tables[k].length;
      setCounts(c);
      const at = new Date().toISOString();
      try {
        localStorage.setItem(BACKUP_KEY, at);
      } catch {
        /* egal */
      }
      setBackupAt(at);
      toast.success('Sicherheitskopie heruntergeladen');
    } catch (err) {
      toast.error(`Sicherheitskopie fehlgeschlagen: ${describeError(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const setMoved = async (on: boolean) => {
    // Wer die Umleitung selbst einschaltet, bleibt in dieser Sitzung hier (zum Prüfen oder Ausschalten)
    if (on) stayThisSession();
    const ok = await setSetting('moved_to_app', on ? { url: app, at: new Date().toISOString() } : false);
    if (ok !== false) toast.success(on ? 'Die Seite leitet jetzt auf die App um' : 'Umleitung aufgehoben – die Seite läuft wieder normal');
  };

  return (
    <div className="flex flex-col gap-[var(--gap-grid)]" data-testid="move-section">
      <Section title="1. Sicherheitskopie" icon={<ShieldCheck />} tint={TINT.teal} hint="Enthält alles: Personen, Fächer, Prüfungen, Lernplan, Aufgaben und Haken, Hausaufgaben, Lernzeiten, Musik und „Wer schreibt?“ – auch den Papierkorb. Hochgeladene Dateien bleiben auf der Seite.">
        <Button variant="primary" icon={<Download className="size-4" />} loading={busy} onClick={() => void backup()} data-testid="move-backup">
          Sicherheitskopie herunterladen
        </Button>
        {backupAt && (
          <p className="flex items-center gap-1.5 text-[13px] text-muted" data-testid="move-backup-done">
            <CheckCircle2 className="size-4 text-success" aria-hidden /> Zuletzt gesichert am {new Date(backupAt).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
        {counts && (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-3" data-testid="move-counts">
            {Object.entries(counts).map(([k, n]) => (
              <li key={k} className="flex justify-between gap-2">
                <span className="text-muted">{MOVE_LABELS[k]}</span>
                <span className="num font-semibold">{n}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="2. In der App übernehmen" icon={<Smartphone />} tint={TINT.indigo}>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-[14px] leading-snug">
          <li>
            In der App ein Konto anlegen:{' '}
            <a className="inline-flex items-center gap-1 font-semibold text-accent underline" href={app} target="_blank" rel="noreferrer">
              App öffnen <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </li>
          <li>
            Im Admin-Bereich ({' '}
            <a className="font-semibold text-accent underline" href={`${app}admin/`} target="_blank" rel="noreferrer">
              App-Admin
            </a>
            ) unter <b>Umzug</b> die Sicherheitskopie hochladen und dich als Person wählen.
          </li>
          <li>Den angezeigten Einladungscode an die Gruppe schicken. Wer beitritt, wählt „Wer bist du?“ und bekommt seine Haken und Lernzeiten.</li>
        </ol>
      </Section>

      <Section title="3. Seite auf die App umleiten" icon={<Rocket />} tint={TINT.purple} hint="Wer die Seite öffnet, sieht „Wir sind umgezogen“ und wird zur App geleitet. Die Daten der Seite bleiben unverändert erhalten.">
        <Row inline label="Umleitung zur App" hint={moved ? `Aktiv → ${moved}` : backupAt ? 'Aus' : 'Erst nach der Sicherheitskopie möglich'}>
          <Switch
            label="Umleitung zur App"
            checked={!!moved}
            disabled={!moved && !backupAt}
            onChange={(on) => (on ? setConfirm(true) : void setMoved(false))}
          />
        </Row>
        {moved && (
          <p className="flex items-center gap-1.5 text-[13px] text-muted">
            <ArrowRightLeft className="size-4" aria-hidden /> Rückgängig: Schalter ausschalten (über „Alte Seite trotzdem öffnen“ erreichbar).
          </p>
        )}
      </Section>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Seite auf die App umleiten?"
        confirmLabel="Umleiten"
        tone="primary"
        testId="move-confirm"
        onConfirm={() => {
          setConfirm(false);
          void setMoved(true);
        }}
      >
        Alle, die die Seite öffnen, landen ab jetzt in der App. Bitte erst umleiten, wenn die Gruppe in der App übernommen ist. Jederzeit rückgängig.
      </ConfirmDialog>
    </div>
  );
}
