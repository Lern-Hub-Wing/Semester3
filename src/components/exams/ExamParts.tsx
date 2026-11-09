import { useState } from 'react';
import { MapPin, Pencil, StickyNote, Timer, Trash2 } from 'lucide-react';
import type { Exam } from '../../lib/types';
import { daysUntil, splitDuration } from '../../lib/countdown';
import { formatDuration, formatInstant, formatTime, instantToZoned, isValidISODate, zonedToInstant } from '../../lib/time';
import { LIMITS } from '../../lib/config';
import { useData } from '../../store/data';
import { useModules } from '../../store/derived';
import { createExam, deleteExam, updateExam } from '../../store/actions';
import { Button } from '../ui/Button';
import { Menu } from '../ui/Menu';
import { Modal } from '../ui/Modal';
import { SelectField, TextArea, TextField } from '../ui/Field';

/**
 * Prüfungen leben seit 4.1 bei den Fächern (ein Tab statt zwei):
 * Karte und Bearbeitungsdialog werden dort wiederverwendet.
 */

/** Ein Prüfungstermin (in der Fach-Detailseite): Datum, Zeit, Dauer, Ort, Countdown, Menü. */
export function ExamCard({ exam, now, onEdit }: { exam: Exam; now: number; onEdit: () => void }) {
  const m = useData((s) => s.modules[exam.module_id]);
  const start = Date.parse(exam.starts_at);
  const end = Date.parse(exam.ends_at);
  const running = start <= now && now < end;
  const d = splitDuration(start - now);
  return (
    <article className="relative flex items-center gap-3 rounded-2xl bg-[var(--ss-surface-2)] p-3" data-testid="exam-card">
      <span className="grid w-12 shrink-0 place-items-center rounded-xl py-1.5 text-center" style={{ background: `color-mix(in srgb, ${m?.color} 30%, transparent)` }}>
        <span className="text-[10.5px] font-semibold uppercase">{formatInstant(exam.starts_at, { month: 'short' }, exam.timezone).replace('.', '')}</span>
        <span className="num text-xl font-semibold leading-none">{formatInstant(exam.starts_at, { day: 'numeric' }, exam.timezone)}</span>
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[14px] font-semibold">
          {formatInstant(exam.starts_at, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, exam.timezone)}
        </h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12.5px] text-muted">
          <span>
            {formatTime(exam.starts_at, exam.timezone)}–{formatTime(exam.ends_at, exam.timezone)} Uhr
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
          <span className="num font-semibold text-ink">
            {running ? 'läuft' : now > end ? 'vorbei' : d.days > 0 ? `in ${daysUntil(exam.starts_at, now)} Tagen` : `in ${d.hours}:${String(d.minutes).padStart(2, '0')} h`}
          </span>
        </p>
        {exam.notes && (
          <p className="mt-1 flex items-start gap-1 text-xs text-faint">
            <StickyNote className="mt-0.5 size-3 shrink-0" aria-hidden />
            <span className="line-clamp-2">{exam.notes}</span>
          </p>
        )}
      </div>
      <Menu
        items={[
          { label: 'Bearbeiten', icon: <Pencil />, onSelect: onEdit },
          { label: 'In den Papierkorb', icon: <Trash2 />, danger: true, onSelect: () => void deleteExam(exam.id) },
        ]}
      />
    </article>
  );
}

export function ExamEditor({ value, onClose, moduleId }: { value: Exam | 'new' | null; onClose: () => void; moduleId?: string }) {
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
        setForm({ module_id: moduleId ?? modules[0]?.id ?? '', date: '', start: '14:00', end: '15:30', location: '', notes: '' });
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
