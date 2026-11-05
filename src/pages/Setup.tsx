import { Database, ShieldAlert } from 'lucide-react';
import { config } from '../lib/config';
import { LogoMark } from '../components/Logo';
import { Ambient } from '../components/layout/AppShell';

/** Wird angezeigt, wenn die Supabase-Verbindung fehlt oder ein unsicherer Schlüssel eingetragen wurde. */
export function Setup() {
  const forbidden = config.usesForbiddenKey;
  return (
    <div className="relative grid min-h-dvh place-items-center px-4 py-10">
      <Ambient />
      <div className="glass relative z-10 w-full max-w-xl rounded-[28px] p-6 md:p-8">
        <div className="mb-5 flex items-center gap-3">
          <LogoMark size={40} />
          <h1 className="text-2xl font-semibold tracking-tight">StudySpace einrichten</h1>
        </div>
        {forbidden ? (
          <div className="flex gap-3 rounded-2xl bg-[color-mix(in_srgb,var(--ss-danger)_12%,transparent)] p-4 text-sm">
            <ShieldAlert className="size-5 shrink-0 text-danger" aria-hidden />
            <p>
              <strong>Unsicherer Schlüssel erkannt.</strong> Es wurde ein Secret- bzw. service_role-Key eingetragen. Dieser darf niemals im Frontend
              oder auf GitHub Pages landen. Bitte sofort in Supabase rotieren und stattdessen den <em>Publishable Key</em> verwenden.
            </p>
          </div>
        ) : (
          <div className="flex gap-3 text-sm text-muted">
            <Database className="size-5 shrink-0" aria-hidden />
            <div className="flex flex-col gap-2">
              <p>Es ist noch keine Datenbank verbunden. StudySpace speichert alle Daten zentral in Supabase.</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>Supabase-Projekt anlegen und die SQL-Dateien aus <code>supabase/</code> ausführen.</li>
                <li>
                  <code>VITE_SUPABASE_URL</code> und <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> setzen (lokal in <code>.env.local</code>, für GitHub Pages als
                  Repository-Variablen).
                </li>
                <li>Neu bauen bzw. das Deployment erneut starten.</li>
              </ol>
              <p>Die ausführliche Schritt-für-Schritt-Anleitung steht in der README des Repositorys.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
