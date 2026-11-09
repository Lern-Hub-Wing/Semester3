import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { AlarmClock, ArrowLeft, CircleCheck, ListTodo, Palette, Plus, Trophy, UserMinus, UserPlus, Users } from 'lucide-react';
import type { Member } from '../lib/types';
import { groupBy, groupRatio, isDone, memberRatio, overdueFor, remainingForGroup } from '../lib/progress';
import { formatISODate, relativeDayLabel } from '../lib/time';
import { alpha, suggestColor } from '../lib/colors';
import { LIMITS } from '../lib/config';
import { Link, navigate } from '../lib/router';
import { useData } from '../store/data';
import { useActiveMembers, useAllMembers, useModules, useTaskViews } from '../store/derived';
import { createMember, setMemberActive, updateMember } from '../store/actions';
import { usePrefs } from '../store/prefs';
import { useToday } from '../hooks/useToday';
import { useDebouncedCallback } from '../hooks/useDebounced';
import { PageHeader } from '../components/layout/AppShell';
import { Card, CardHeader } from '../components/ui/Card';
import { ProgressBar, ProgressRing } from '../components/ui/Progress';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Segmented } from '../components/ui/Segmented';
import { Modal } from '../components/ui/Modal';
import { TextField } from '../components/ui/Field';
import { ColorPicker } from '../components/ui/ColorPicker';
import { Reveal } from '../components/ui/Reveal';
import { EmptyState } from '../components/ui/EmptyState';
import { TaskRow } from '../components/TaskRow';
import { MemberProgress } from '../components/MemberProgress';

export function Team({ me }: { me: Member }) {
  const views = useTaskViews();
  const members = useActiveMembers();
  const all = useAllMembers();
  const modules = useModules();
  const completions = useData((s) => s.task_completions);
  const goalTitle = useData((s) => s.app_settings.group_goal_title?.value);
  const style = usePrefs((s) => s.progressStyle);
  const setPrefs = usePrefs((s) => s.set);
  const [adding, setAdding] = useState(false);

  const group = groupRatio(views, members.map((m) => m.id), completions);
  const remaining = remainingForGroup(group);
  const byModule = useMemo(() => groupBy(views, (v) => v.module.id), [views]);
  const inactive = all.filter((m) => !m.is_active);
  const complete = group.pct === 100;

  const message =
    group.pct === null
      ? 'Sobald Aufgaben geplant sind, seht ihr hier euren gemeinsamen Fortschritt.'
      : complete
        ? 'Alle haben alle Aufgaben erledigt. Gemeinsam 100 % – großartig!'
        : group.pct >= 75
          ? `Nur noch ${remaining} gemeinsame Erledigungen bis zum Ziel.`
          : `${group.done} von ${group.total} gemeinsamen Erledigungen geschafft.`;

  return (
    <div>
      <PageHeader
        title="Team"
        actions={
          <>
            <Segmented
              size="sm"
              label="Darstellung"
              value={style}
              onChange={(v) => setPrefs({ progressStyle: v })}
              options={[
                { value: 'ring', label: 'Kreise' },
                { value: 'bar', label: 'Balken' },
              ]}
            />
            <Button icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>
              Person
            </Button>
          </>
        }
      />

      <motion.section
        aria-label={typeof goalTitle === 'string' ? goalTitle : 'Unser gemeinsames Lernziel'}
        className="glass sheen relative mb-6 overflow-hidden rounded-[30px] p-6 md:p-8"
        animate={complete ? { boxShadow: ['var(--ss-glass-shadow)', `var(--ss-glass-shadow), 0 0 0 2px ${alpha('#AADCCB', 0.8)}, 0 30px 80px -30px ${alpha('#AADCCB', 0.9)}`] } : {}}
        transition={{ duration: 1.2 }}
      >
        <span aria-hidden className="pointer-events-none absolute inset-0 opacity-70" style={{ background: teamGradient(members) }} />
        <div className="relative flex flex-col items-center gap-6 md:flex-row md:gap-10">
          <ProgressRing ratio={group} color={complete ? '#8FD8BD' : 'var(--ss-accent)'} size={168} stroke={14} sublabel="Gruppenfortschritt" />
          <div className="min-w-0 flex-1 text-center md:text-left">
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">{typeof goalTitle === 'string' ? goalTitle : 'Unser gemeinsames Lernziel'}</p>
            <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight md:text-[30px]">
              {complete ? (
                <span className="inline-flex items-center gap-2">
                  <Trophy className="size-7 text-warn" aria-hidden /> Ziel erreicht!
                </span>
              ) : group.pct === null ? (
                'Noch keine Aufgaben'
              ) : (
                `${group.pct} % gemeinsam erledigt`
              )}
            </h2>
            <p className="mt-2 text-[15px] text-muted">{message}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2 md:justify-start">
              {members.map((m) => {
                const r = memberRatio(views, m.id, completions);
                return (
                  <span key={m.id} className="inline-flex items-center gap-2 rounded-full lens py-1 pl-1 pr-3 text-[13px]">
                    <Avatar name={m.name} color={m.color} size={24} />
                    <span className="font-medium">{m.name}</span>
                    <span className="num text-muted">{r.pct === null ? '–' : `${r.pct}%`}</span>
                    {r.pct === 100 && <CircleCheck className="size-4 text-success" aria-label="fertig" />}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </motion.section>

      <ul className={`grid gap-4 ${style === 'ring' ? 'sm:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-2'}`}>
        {members.map((m, i) => {
          const r = memberRatio(views, m.id, completions);
          return (
            <Reveal as="li" key={m.id} delay={i * 0.05}>
              <button type="button" onClick={() => navigate(`/team/${m.id}`)} className="card lift relative flex h-full w-full flex-col gap-4 overflow-hidden rounded-[24px] p-5 text-left">
                <span aria-hidden className="absolute -right-12 -top-12 size-40 rounded-full opacity-50" style={{ background: `radial-gradient(circle, ${m.color}, transparent 70%)` }} />
                <div className="relative flex items-center gap-3">
                  <Avatar name={m.name} color={m.color} size={44} ring={m.id === me.id} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {m.name} {m.id === me.id && <span className="text-xs font-normal text-muted">(du)</span>}
                    </p>
                    <p className="num text-xs text-muted">
                      {r.done} erledigt · {r.total - r.done} offen
                    </p>
                  </div>
                </div>
                <div className="relative">
                  <MemberProgress member={m} ratio={r} ringSize={112} />
                </div>
                <div className="relative flex flex-col gap-2">
                  {modules.map((mod) => {
                    const list = byModule.get(mod.id) ?? [];
                    if (!list.length) return null;
                    const mr = memberRatio(list, m.id, completions);
                    return (
                      <div key={mod.id} className="text-xs">
                        <div className="mb-1 flex justify-between gap-2 text-muted">
                          <span className="truncate">{mod.name}</span>
                          <span className="num shrink-0 font-semibold text-ink">{mr.pct}%</span>
                        </div>
                        <ProgressBar ratio={mr} color={mod.color} height={4} label={`${m.name} – ${mod.name}`} />
                      </div>
                    );
                  })}
                </div>
              </button>
            </Reveal>
          );
        })}
      </ul>

      {inactive.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-[15px] font-semibold text-muted">Deaktivierte Personen</h2>
          <ul className="flex flex-wrap gap-2">
            {inactive.map((m) => (
              <li key={m.id} className="card flex items-center gap-3 rounded-2xl py-2 pl-2 pr-2">
                <Avatar name={m.name} color={m.color} size={30} dimmed />
                <span className="text-sm">{m.name}</span>
                <Button size="sm" variant="ghost" onClick={() => void setMemberActive(m.id, true)}>
                  Wiederherstellen
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <AddMemberDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function teamGradient(members: Member[]) {
  if (!members.length) return 'none';
  const stops = members.map((m, i) => `radial-gradient(60% 80% at ${10 + (i * 80) / Math.max(1, members.length - 1)}% ${i % 2 ? 110 : -10}%, ${alpha(m.color, 0.28)}, transparent 70%)`);
  return stops.join(',');
}

export function AddMemberDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const all = useAllMembers();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#AFC5F5');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName('');
      setError(null);
      setColor(suggestColor(all.map((m) => m.color)));
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Person hinzufügen"
      description="Neue Personen starten mit offenen Aufgaben und zählen ab sofort zum Gruppenfortschritt."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (!name.trim()) return setError('Bitte einen Namen eingeben.');
              setBusy(true);
              const id = await createMember(name, color);
              setBusy(false);
              if (id) onClose();
            }}
          >
            Hinzufügen
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={name || '?'} color={color} size={52} />
          <TextField className="flex-1" label="Name" data-autofocus value={name} maxLength={LIMITS.memberName} onChange={(e) => setName(e.target.value)} error={error} />
        </div>
        <ColorPicker value={color} onChange={setColor} label="Profilfarbe" />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Personendetail
// ---------------------------------------------------------------------

export function MemberDetail({ id, me }: { id: string; me: Member }) {
  const member = useData((s) => s.members[id]);
  const views = useTaskViews();
  const members = useActiveMembers();
  const modules = useModules();
  const completions = useData((s) => s.task_completions);
  const today = useToday();
  const [name, setName] = useState(member?.name ?? '');
  const [colorOpen, setColorOpen] = useState(false);
  const [tab, setTab] = useState<'offen' | 'erledigt' | 'ueberfaellig'>('offen');

  useEffect(() => setName(member?.name ?? ''), [member?.name]);

  const byModule = useMemo(() => groupBy(views, (v) => v.module.id), [views]);
  if (!member) {
    return (
      <Card>
        <EmptyState icon={<Users className="size-6" />} title="Person nicht gefunden" action={<Link to="/team" className="text-sm font-medium text-accent">Zum Team</Link>} />
      </Card>
    );
  }

  const r = memberRatio(views, member.id, completions);
  const open = views.filter((v) => !isDone(completions, v.task.id, member.id));
  const done = views.filter((v) => isDone(completions, v.task.id, member.id));
  const overdue = overdueFor(views, member.id, completions, today);
  const list = tab === 'offen' ? open : tab === 'erledigt' ? done : overdue;
  const viewingOther = member.id !== me.id;

  const saveName = () => {
    const n = name.trim();
    if (n && n !== member.name) void updateMember(member.id, { name: n });
    else setName(member.name);
  };

  return (
    <div>
      <button type="button" onClick={() => navigate('/team')} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Team
      </button>

      <div className="glass relative mb-5 overflow-hidden rounded-[28px] p-5 md:p-7">
        <span aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(70% 120% at 0% 0%, ${alpha(member.color, 0.4)}, transparent 70%)` }} />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center">
          <ProgressRing ratio={r} color={member.color} size={132} stroke={12} sublabel={`Fortschritt ${member.name}`} />
          <div className="min-w-0 flex-1">
            <label className="block">
              <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">Name</span>
              <input
                className="mt-1 w-full rounded-xl bg-transparent text-[28px] font-semibold tracking-tight outline-none focus:bg-surface/60 md:text-[32px]"
                value={name}
                maxLength={LIMITS.memberName}
                onChange={(e) => setName(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                aria-label="Name bearbeiten"
              />
            </label>
            <p className="num mt-1 text-sm text-muted">
              {r.done} erledigt · {open.length} offen · {overdue.length} überfällig
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button icon={<Palette className="size-4" />} onClick={() => setColorOpen(true)}>
                <span className="size-4 rounded-full" style={{ background: member.color }} aria-hidden />
                Farbe ändern
              </Button>
              {member.is_active ? (
                <Button variant="ghost" icon={<UserMinus className="size-4" />} onClick={() => void setMemberActive(member.id, false)}>
                  Deaktivieren
                </Button>
              ) : (
                <Button variant="ghost" icon={<Plus className="size-4" />} onClick={() => void setMemberActive(member.id, true)}>
                  Wiederherstellen
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Card className="p-5 lg:col-span-4">
          <CardHeader title="Fortschritt nach Fach" icon={<ListTodo />} />
          <div className="mt-4 flex flex-col gap-3">
            {modules.map((mod) => {
              const l = byModule.get(mod.id) ?? [];
              const mr = memberRatio(l, member.id, completions);
              return (
                <div key={mod.id}>
                  <div className="mb-1.5 flex justify-between gap-2 text-[13px]">
                    <span className="truncate">{mod.name}</span>
                    <span className="num shrink-0 font-semibold">{mr.pct === null ? '–' : `${mr.pct}%`}</span>
                  </div>
                  <ProgressBar ratio={mr} color={mod.color} height={6} label={mod.name} />
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="p-5 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              label="Aufgaben"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'offen', label: `Offen (${open.length})` },
                { value: 'erledigt', label: `Erledigt (${done.length})` },
                { value: 'ueberfaellig', label: `Überfällig (${overdue.length})` },
              ]}
            />
          </div>
          {viewingOther && (
            <p className="mt-3 rounded-2xl bg-[color-mix(in_srgb,var(--ss-text)_4.5%,transparent)] px-3 py-2 text-xs text-muted">
              Du siehst die Haken von {member.name}. Änderungen hier betreffen {member.name} – nicht dich.
            </p>
          )}
          {list.length === 0 ? (
            <EmptyState compact icon={tab === 'ueberfaellig' ? <AlarmClock className="size-6" /> : <CircleCheck className="size-6" />} title={tab === 'offen' ? 'Keine offenen Aufgaben' : tab === 'erledigt' ? 'Noch nichts erledigt' : 'Nichts überfällig'} />
          ) : (
            <ul className="-mx-2 mt-2 max-h-[560px] overflow-y-auto scroll-thin">
              {list.slice(0, 200).map((v) => (
                <TaskRow
                  key={v.task.id}
                  task={v.task}
                  member={member}
                  members={members}
                  dense
                  subtitle={`${relativeDayLabel(v.date, today)} · ${formatISODate(v.date, { day: 'numeric', month: 'short' })} · ${v.module.name}`}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={colorOpen} onClose={() => setColorOpen(false)} title={`Farbe von ${member.name}`} description="Wird sofort gespeichert und für alle sichtbar.">
        <MemberColorEditor member={member} />
      </Modal>
    </div>
  );
}

/** Farbwahl mit sofortiger Vorschau; gespeichert wird kurz nach der letzten Bewegung. */
export function MemberColorEditor({ member }: { member: Member }) {
  const [color, setColor] = useState(member.color);
  const save = useDebouncedCallback((c: string) => {
    if (c !== useData.getState().members[member.id]?.color) void updateMember(member.id, { color: c });
  }, 350);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar name={member.name} color={color} size={52} />
        <ProgressBar ratio={{ done: 2, total: 3, pct: 66 }} color={color} label="Vorschau" />
      </div>
      <ColorPicker
        value={color}
        onChange={(c) => {
          setColor(c);
          save(c);
        }}
        label="Profilfarbe"
      />
    </div>
  );
}
