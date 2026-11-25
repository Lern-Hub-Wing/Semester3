import { useEffect, useState, type ReactNode } from 'react';
import { FileText, Landmark, ScrollText, ShieldCheck, Undo2 } from 'lucide-react';
import { getSupabase } from '../lib/supabase';
import { config } from '../lib/config';
import { TINT } from '../lib/tints';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { ListGroup, ListRow } from '../components/ui/List';
import { describeError } from '../lib/errors';
import { api, isMissingFunction, type Imprint } from './api';
import { refreshMe, signOut } from './account';
import { AuthFrame } from './AuthScreen';
import { LEGAL_DATE, LEGAL_TITLES, LEGAL_VERSION, PRIVACY, TERMS, WITHDRAWAL, type LegalDoc, type LegalSectionText } from './legalText';

let imprintCache: Promise<Imprint | null> | null = null;
/** Impressum aus den Angaben des Betreibers (öffentlich, auch ohne Anmeldung) */
export function loadImprint(): Promise<Imprint | null> {
  if (!config.isConfigured) return Promise.resolve(null);
  imprintCache ??= api
    .legalInfo(getSupabase())
    .then((r) => r?.imprint ?? null)
    .catch(() => null);
  return imprintCache;
}

function Sections({ items }: { items: LegalSectionText[] }) {
  return (
    <div className="flex flex-col gap-4 text-[14px] leading-relaxed">
      {items.map((s) => (
        <section key={s.title}>
          <h3 className="mb-1 text-[15px] font-semibold">{s.title}</h3>
          {s.body.map((p, i) => (
            <p key={i} className="mb-1.5 text-muted">
              {p}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}

function ImprintView() {
  const [imprint, setImprint] = useState<Imprint | null | undefined>(undefined);
  useEffect(() => {
    void loadImprint().then(setImprint);
  }, []);
  if (imprint === undefined) return <p className="text-[14px] text-muted">Wird geladen …</p>;
  if (!imprint)
    return (
      <p className="text-[14px] text-muted" data-testid="imprint-missing">
        Die Anbieterangaben werden gerade eingetragen. Bitte versuche es später erneut.
      </p>
    );
  return (
    <div className="flex flex-col gap-4 text-[14px] leading-relaxed" data-testid="imprint">
      <section>
        <h3 className="mb-1 text-[15px] font-semibold">Angaben gemäß § 5 DDG</h3>
        <p className="text-muted">
          {imprint.name}
          <br />
          {imprint.street}
          <br />
          {imprint.city}
          {imprint.country ? (
            <>
              <br />
              {imprint.country}
            </>
          ) : null}
        </p>
      </section>
      <section>
        <h3 className="mb-1 text-[15px] font-semibold">Kontakt</h3>
        <p className="text-muted">
          E-Mail: <a className="underline" href={`mailto:${imprint.email}`}>{imprint.email}</a>
          {imprint.phone ? (
            <>
              <br />
              Telefon: {imprint.phone}
            </>
          ) : null}
        </p>
      </section>
      {imprint.vat_id && (
        <section>
          <h3 className="mb-1 text-[15px] font-semibold">Umsatzsteuer-ID</h3>
          <p className="text-muted">{imprint.vat_id}</p>
        </section>
      )}
      <section>
        <h3 className="mb-1 text-[15px] font-semibold">Verantwortlich für den Inhalt (§ 18 Abs. 2 MStV)</h3>
        <p className="text-muted">{imprint.responsible || imprint.name}, Anschrift wie oben</p>
      </section>
    </div>
  );
}

export function LegalBody({ doc }: { doc: LegalDoc }) {
  if (doc === 'impressum') return <ImprintView />;
  return (
    <>
      <p className="mb-4 text-[12.5px] text-faint">Stand: {LEGAL_DATE}</p>
      <Sections items={doc === 'agb' ? TERMS : doc === 'datenschutz' ? PRIVACY : WITHDRAWAL} />
    </>
  );
}

/** Ein Rechtstext im Dialog (auch vor der Anmeldung nutzbar) */
export function LegalDialog({ doc, onClose }: { doc: LegalDoc | null; onClose: () => void }) {
  return (
    <Modal open={doc !== null} onClose={onClose} title={doc ? LEGAL_TITLES[doc] : ''} wide>
      {doc && (
        <div className="max-h-[62dvh] overflow-y-auto pr-1" data-testid={`legal-${doc}`}>
          <LegalBody doc={doc} />
        </div>
      )}
    </Modal>
  );
}

const ICONS: Record<LegalDoc, ReactNode> = {
  agb: <ScrollText />,
  datenschutz: <ShieldCheck />,
  widerruf: <Undo2 />,
  impressum: <Landmark />,
};

/** Einstellungen → Rechtliches */
export function LegalSection() {
  const [open, setOpen] = useState<LegalDoc | null>(null);
  return (
    <div className="flex flex-col gap-4" data-testid="legal-section">
      <ListGroup footer={`Fassung vom ${LEGAL_DATE}.`}>
        {(Object.keys(LEGAL_TITLES) as LegalDoc[]).map((d) => (
          <ListRow key={d} icon={ICONS[d]} tint={TINT.gray} label={LEGAL_TITLES[d]} onClick={() => setOpen(d)} testId={`legal-open-${d}`} />
        ))}
      </ListGroup>
      <LegalDialog doc={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/** Zustimmung zur aktuellen Fassung (beim ersten Öffnen und nach Änderungen) */
export function ConsentScreen({ again }: { again: boolean }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<LegalDoc | null>(null);
  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.acceptTerms(getSupabase(), LEGAL_VERSION);
      await refreshMe();
    } catch (err) {
      if (isMissingFunction(err)) await refreshMe();
      else setError(describeError(err));
      setBusy(false);
    }
  };
  const link = (d: LegalDoc) => (
    <button type="button" className="font-semibold text-accent underline underline-offset-2" onClick={() => setOpen(d)}>
      {LEGAL_TITLES[d]}
    </button>
  );
  return (
    <AuthFrame title={again ? 'Neue Nutzungsbedingungen' : 'Kurz zustimmen'} subtitle={again ? 'Wir haben unsere Bedingungen aktualisiert.' : 'Bevor es losgeht.'}>
      <div className="flex flex-col gap-4" data-testid="consent-screen">
        <div className="flex items-start gap-3 rounded-2xl bg-[var(--ss-surface-2)] p-3.5 text-[14px] leading-snug">
          <FileText className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
          <p>
            Bitte lies die {link('agb')} und die {link('datenschutz')}. Für bezahlte Tarife gilt die {link('widerruf')}. Den Anbieter findest du im {link('impressum')}.
          </p>
        </div>
        <label className="flex items-start gap-3 text-[14px] leading-snug">
          <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--ss-accent)]" checked={checked} onChange={(e) => setChecked(e.target.checked)} data-testid="consent-check" />
          <span>Ich stimme den Nutzungsbedingungen zu und habe die Datenschutzerklärung zur Kenntnis genommen.</span>
        </label>
        {error && (
          <p className="text-[13px] text-danger" role="alert">
            {error}
          </p>
        )}
        <Button variant="primary" size="lg" disabled={!checked} loading={busy} onClick={() => void accept()} data-testid="consent-accept">
          Zustimmen und weiter
        </Button>
        <Button variant="ghost" onClick={() => void signOut()}>
          Abmelden
        </Button>
      </div>
      <LegalDialog doc={open} onClose={() => setOpen(null)} />
    </AuthFrame>
  );
}
