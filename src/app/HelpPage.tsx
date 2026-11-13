import { useState, type FormEvent } from 'react';
import { ChevronDown, MessageSquareHeart, PlayCircle, Send } from 'lucide-react';
import { getSupabase } from '../lib/supabase';
import { config } from '../lib/config';
import { describeError } from '../lib/errors';
import { useLocation } from '../lib/router';
import { toast } from '../store/toast';
import { PageHeader } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Segmented';
import { Switch } from '../components/ui/Switch';
import { ListGroup } from '../components/ui/List';
import { startTour } from './Tour';
import { useAccount } from './account';

/** Häufige Fragen – kurz, in der Sprache der App, ohne Technikbegriffe. */
const FAQ: { q: string; a: string }[] = [
  {
    q: 'Wie lade ich Freunde in meine Lerngruppe ein?',
    a: 'Einstellungen → Lerngruppe: Dort findest du den Einladungslink und den 8-stelligen Code. Bis zu sieben Freunde können kostenlos beitreten – nur du bezahlst den Gruppenpass.',
  },
  {
    q: 'Was passiert nach der 14-tägigen Testphase?',
    a: 'Nichts wird gelöscht. Du siehst weiterhin alle Inhalte, kannst aber keine neuen anlegen oder ändern. Mit StudySpace Solo oder einem Gruppenpass geht es nahtlos weiter.',
  },
  {
    q: 'Warum kann ich gerade nichts bearbeiten?',
    a: 'Dann ist die Testphase beendet oder der Gruppenpass abgelaufen. Inhalte bleiben sichtbar; Haken setzen und Fokuszeiten funktionieren weiter. Unter Tarif & Abo siehst du deinen Stand.',
  },
  {
    q: 'Sehen andere meinen Fortschritt?',
    a: 'In einer Lerngruppe sehen alle den Fortschritt und die Lernzeit der Mitglieder – das motiviert. Haken setzt jede Person nur für sich selbst. In deinem eigenen Lernbereich sieht niemand etwas.',
  },
  {
    q: 'Wie kündige ich?',
    a: 'Tarif & Abo → „Kündigen“. Dein Zugang läuft bis zum Ende des bezahlten Zeitraums weiter. Semesterpässe enden nach sechs Monaten automatisch.',
  },
  {
    q: 'Kann ich Dateien hochladen?',
    a: 'Nein – StudySpace konzentriert sich auf Planung, Aufgaben und Fokus. Links zu deinen Unterlagen kannst du in Beschreibungen eintragen.',
  },
  {
    q: 'Wie exportiere oder lösche ich meine Daten?',
    a: 'Einstellungen → Daten exportieren lädt alle Inhalte als Datei herunter. Unter Einstellungen → Konto kannst du dein Konto endgültig löschen.',
  },
];

const CATEGORIES = [
  { value: 'bug', label: 'Fehler' },
  { value: 'idea', label: 'Idee' },
  { value: 'question', label: 'Frage' },
] as const;

export function HelpPage() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div data-testid="help-page">
      <PageHeader title="Hilfe & Feedback" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <div className="flex flex-col gap-5">
          <ListGroup title="Häufige Fragen">
            {FAQ.map((f, i) => (
              <div key={f.q} className="list-row !items-start !py-0">
                <details className="group w-full" open={open === i} onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && setOpen(i)}>
                  <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 py-3 text-[15px] font-medium marker:hidden">
                    <span className="min-w-0 flex-1">{f.q}</span>
                    <ChevronDown className="size-4 shrink-0 text-faint transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="pb-3.5 text-[14px] leading-relaxed text-muted">{f.a}</p>
                </details>
              </div>
            ))}
          </ListGroup>
          <div className="settings-card flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[14.5px] font-medium">Einführung ansehen</p>
              <p className="text-[12.5px] text-muted">Die kurze Tour durch alle Bereiche.</p>
            </div>
            <Button icon={<PlayCircle className="size-4" />} onClick={() => startTour()} data-testid="help-tour">
              Starten
            </Button>
          </div>
        </div>
        <FeedbackForm />
      </div>
    </div>
  );
}

function FeedbackForm() {
  const { path } = useLocation();
  const email = useAccount((s) => s.session?.user.email);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['value']>('idea');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 3) return;
    setBusy(true);
    try {
      const { error } = await getSupabase().rpc('app_send_feedback', {
        p_category: category,
        p_message: message.trim(),
        p_page: path,
        p_client: `${config.version} · ${navigator.userAgent}`.slice(0, 300),
        p_contact_ok: contact,
      });
      if (error) throw error;
      setSent(true);
      setMessage('');
      toast.success('Danke für dein Feedback!');
    } catch (err) {
      toast.error(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="settings-card flex flex-col gap-3.5" onSubmit={(e) => void submit(e)} data-testid="feedback-form">
      <div className="flex items-center gap-3">
        <span className="icon-badge" aria-hidden>
          <MessageSquareHeart />
        </span>
        <div>
          <p className="text-[15px] font-semibold">Feedback geben</p>
          <p className="text-[12.5px] text-muted">Wir lesen jede Nachricht.</p>
        </div>
      </div>
      <Segmented label="Art" value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} className="w-full" />
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Nachricht</span>
        <textarea
          className="field min-h-32 resize-y"
          value={message}
          maxLength={4000}
          onChange={(e) => (setMessage(e.target.value), setSent(false))}
          placeholder={category === 'bug' ? 'Was ist passiert, und wo?' : category === 'question' ? 'Was möchtest du wissen?' : 'Was würde StudySpace für dich besser machen?'}
          data-testid="feedback-message"
        />
      </label>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="feedback-contact" className="text-[13.5px]">
          Antwort per E-Mail erlaubt{email ? <span className="block text-[12px] text-muted">{email}</span> : null}
        </label>
        <Switch id="feedback-contact" checked={contact} onChange={setContact} label="Antwort per E-Mail erlaubt" />
      </div>
      <Button type="submit" variant="primary" icon={<Send className="size-4" />} loading={busy} disabled={message.trim().length < 3} data-testid="feedback-send">
        Senden
      </Button>
      {sent && (
        <p className="text-center text-[13px] text-[var(--ss-success,#2FA58B)]" role="status" data-testid="feedback-sent">
          Angekommen – danke!
        </p>
      )}
    </form>
  );
}
