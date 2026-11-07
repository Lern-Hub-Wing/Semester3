import { useMemo, useState } from 'react';
import { GraduationCap, MapPin, Pencil, Plus, StickyNote, Timer, Trash2 } from 'lucide-react';
import type { Exam } from '../lib/types';
import { activeExams, daysUntil, splitDuration } from '../lib/countdown';
import { formatDuration, formatInstant, formatTime, instantToZoned, isValidISODate, zonedToInstant } from '../lib/time';
import { LIMITS } from '../lib/config';
import { useData } from '../store/data';
import { useModules } from '../store/derived';
import { createExam, deleteExam, updateExam } from '../store/actions';
import { useNow } from '../hooks/useNow';
import { PageHeader } from '../components/layout/AppShell';
import { Countdown } from '../components/Countdown';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Menu } from '../components/ui/Menu';
import { Modal } from '../components/ui/Modal';
import { SelectField, TextArea, TextField } from '../components/ui/Field';
import { EmptyState } from '../components/ui/EmptyState';
import { Reveal } from '../components/ui/Reveal';

/** Alle Prüfungen chronologisch, mit Bearbeitung. */
export function Exams() {
  const now = useNow(1000);
  const examsMap = useData((s) => s.exams);
  const modules = useData((s) => s.modules);
  const [editing, setEditing] = useState<Exam | 'new' | null>(null);
  const list = useMemo(() => activeExams(Object.values(examsMap)).filter((e) => !modules[e.module_id]?.archived_at), [examsMap, modules]);
  const upcoming = list.filter((e) => Date.parse(e.ends_at) > now);
  const past = list.filter((e) => Date.parse(e.ends_at) <= now);

  return (
    <div>
      <PageHeader
        title="Prüfungen"
        subtitle={`${upcoming.length} bevorstehend · Zeitzone Europe/Berlin`}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Prüfung
          </Button>
        }
      />
      <div className="mb-6">
        <Countdown />
      </div>
      {list.length === 0 ? (
        <Card>
          <EmptyState icon={<GraduationCap className="size-6" />} title="Keine Prüfungen eingetragen" />
        </Card>
      ) : (
        <ol className="relative flex flex-col gap-3 md:pl-6">
          <span aria-hidden className="absolute bottom-4 left-[7px] top-4 hidden w-px bg-[var(--ss-line)] md:block" />
          {upcoming.map((e, i) => (
            <Reveal as="li" key={e.id} delay={Math.min(i * 0.04, 0.2)}>
              <ExamCard exam={e} now={now} onEdit={() => setEditing(e)} />
            </Reveal>
          ))}
          {past.length > 0 && <li className="mt-4 px-1 text-[13px] font-semibold uppercase tracking-wider text-faint">Vergangen</li>}
          {past.map((e) => (
            <li key={e.id} className="opacity-60">
              <ExamCard exam={e} now={now} onEdit={() => setEditing(e)} />
            </li>
          ))}
        </ol>
      )}
      <ExamEditor value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function ExamCard({ exam, now, onEdit }: { exam: Exam; now: number; onEdit: () => void }) {
  const m = useData((s) => s.modules[exam.module_id]);
  const start = Date.parse(exam.starts_at);
  const end = Date.parse(exam.ends_at);
  const running = start <= now && now < end;
  const d = splitDuration(start - now);
  return (
    <article className="card lift relative flex items-center gap-4 overflow-hidden rounded-[22px] p-4 md:p-5">
      <span aria-hidden className="absolute -left-[22px] top-1/2 hidden size-3 -translate-y-1/2 rounded-full ring-4 ring-[var(--ss-bg)] md:block" style={{ background: m?.color }} />
      <span className="grid w-14 shrink-0 place-items-center rounded-2xl py-2 text-center" style={{ background: `color-mix(in srgb, ${m?.color} 30%, transparent)` }}>
        <span className="text-[11px] font-semibold uppercase">{formatInstant(exam.starts_at, { month: 'short' }, exam.timezone)}</span>
        <span className="num text-2xl font-semibold leading-none">{formatInstant(exam.starts_at, { day: 'numeric' }, exam.timezone)}</span>
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold tracking-tight">{m?.name ?? 'Modul'}</h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted">
          <span>
            {formatInstant(exam.starts_at, { weekday: 'long' }, exam.timezone)} · {formatTime(exam.starts_at, exam.timezone)}–{formatTime(exam.ends_at, exam.timezone)} Uhr
          </span>
          <span className="inline-flex items-center gap-1">
            <Timer className="size-3.5" aria-hidden />
            {formatDuration(end - start)}
          </span>
          {exam.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {exam.location}
            </span>
          )}
        </p>
        {exam.notes && (
          <p className="mt-1 flex items-start gap-1 text-xs text-faint">
            <StickyNote className="mt-0.5 size-3 shrink-0" aria-hidden />
            <span className="line-clamp-2">{exam.notes}</span>
          </p>
        )}
      </div>
      <span className="num hidden shrink-0 rounded-full bg-[color-mix(in_srgb,var(--ss-text)_5%,transparent)] px-3 py-1.5 text-xs font-semibold sm:block">
        {running ? 'läuft' : now > end ? 'vorbei' : d.days > 0 ? `${daysUntil(exam.starts_at, now)} Tage` : `${d.hours}:${String(d.minutes).padStart(2, '0')} h`}
      </span>
      <Menu
        items={[
          { label: 'Bearbeiten', icon: <Pencil />, onSelect: onEdit },
          { label: 'In den Papierkorb', icon: <Trash2 />, danger: true, onSelect: () => void deleteExam(exam.id) },
        ]}
      />
    </article>
  );
}

function ExamEditor({ value, onClose }: { value: Exam | 'new' | null; onClose: () => void }) {
  const modules = useModules();
  const exam = value && value !== 'new' ? value : null;
  const [form, setForm] = useState({ module_id: '', date: '', start: '14:00', end: '15:30', location: '', notes: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Beim Öffnen sofort (während des Renderns) befüllen – nie veraltete Werte anzeigen.
  const key = value === null ? null : exam ? `${exam.id}` : 'new';
  const [initKey, setInitKey] = useState<string | null>(null);
  if (key !== initKey) {
    setInitKey(key);
    if (key !== null) {
      setError(null);
      if (exam) {
        const st = instantToZoned(exam.starts_at, exam.timezone);
        const en = instantToZoned(exam.ends_at, exam.timezone);
        setForm({ module_id: exam.module_id, date: st.date, start: st.time, end: en.time, location: exam.location ?? '', notes: exam.notes ?? '' });
      } else {
        setForm({ module_id: modules[0]?.id ?? '', date: '', start: '14:00', end: '15:30', location: '', notes: '' });
      }
    }
  }

  const save = async () => {
    if (!form.module_id) return setError('Bitte ein Modul wählen.');
    if (!isValidISODate(form.date)) return setError('Bitte ein gültiges Datum wählen.');
    if (!/^\d{2}:\d{2}$/.test(form.start) || !/^\d{2}:\d{2}$/.test(form.end)) return setError('Bitte Beginn und Ende angeben.');
    const starts = zonedToInstant(form.date, form.start);
    const ends = zonedToInstant(form.date, form.end);
    if (ends <= starts) return setError('Das Ende muss nach dem Beginn liegen.');
    setBusy(true);
    const payload = {
      module_id: form.module_id,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      location: form.location.trim() || null,
      notes: form.notes.trim() || null,
    };
    const ok = exam ? await updateExam(exam.id, payload, exam.version) : !!(await createExam(payload));
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={value !== null}
      onClose={onClose}
      title={exam ? 'Prüfung bearbeiten' : 'Neue Prüfung'}
      description="Uhrzeiten gelten in der Zeitzone Europe/Berlin (inkl. Sommer-/Winterzeit)."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SelectField label="Prüfungsmodul" value={form.module_id} onChange={(e) => setForm({ ...form, module_id: e.target.value })}>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Datum" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-autofocus />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Beginn" type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          <TextField label="Ende" type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        </div>
        <TextField label="Ort (optional)" value={form.location} maxLength={LIMITS.location} placeholder="z. B. Hörsaal A1" onChange={(e) => setForm({ ...form, location: e.target.value })} />
        <TextArea label="Notizen (optional)" value={form.notes} maxLength={LIMITS.description} rows={2} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
