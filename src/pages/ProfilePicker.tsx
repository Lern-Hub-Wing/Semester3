import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CloudOff, Plus, RefreshCw } from 'lucide-react';
import { memberRatio } from '../lib/progress';
import { formatISODate } from '../lib/time';
import { suggestColor, alpha } from '../lib/colors';
import { LIMITS } from '../lib/config';
import { useData, useSyncStatus } from '../store/data';
import { useActiveMembers, useAppName, useTaskViews } from '../store/derived';
import { useSession } from '../store/session';
import { createMember } from '../store/actions';
import { resync } from '../store/sync';
import { useToday } from '../hooks/useToday';
import { Avatar } from '../components/ui/Avatar';
import { ProgressBar } from '../components/ui/Progress';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { LogoMark } from '../components/Logo';
import { Ambient } from '../components/layout/AppShell';
import { isDone } from '../lib/progress';

const ease = [0.22, 1, 0.36, 1] as const;

/** „Wer lernt heute?“ – Auswahl des aktiven Lernprofils (keine Anmeldung). */
export function ProfilePicker() {
  const reduce = useReducedMotion();
  const members = useActiveMembers();
  const views = useTaskViews();
  const completions = useData((s) => s.task_completions);
  const phase = useData((s) => s.phase);
  const error = useData((s) => s.error);
  const online = useSyncStatus((s) => s.online);
  const select = useSession((s) => s.select);
  const appName = useAppName();
  const today = useToday();
  const [chosen, setChosen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const todayViews = useMemo(() => views.filter((v) => v.date === today), [views, today]);

  const pick = (id: string) => {
    if (chosen) return;
    setChosen(id);
    setTimeout(() => select(id), reduce ? 0 : 340);
  };

  const d = (n: number) => (reduce ? 0 : n);

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-[max(env(safe-area-inset-top),24px)]">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: d(0.8) }}>
        <Ambient />
      </motion.div>
      <div className="relative z-10 flex w-full max-w-4xl flex-col items-center">
        <motion.div initial={{ opacity: 0, scale: 0.85, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: d(0.6), delay: d(0.1), ease }} className="mb-5 flex items-center gap-2.5">
          <LogoMark size={44} colors={members.length >= 4 ? members.map((m) => m.color) : undefined} />
          <span className="text-xl font-semibold tracking-tight">{appName}</span>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: d(0.6), delay: d(0.25), ease }}
          className="text-center text-[34px] font-semibold leading-tight tracking-tight md:text-[48px]"
        >
          Wer lernt heute?
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: d(0.6), delay: d(0.35), ease }} className="mt-2 text-center text-muted">
          {formatISODate(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </motion.p>

        {phase === 'loading' ? (
          <div className="mt-10 grid w-full grid-cols-2 gap-3 md:grid-cols-4 md:gap-4" aria-busy="true" aria-label="Profile werden geladen">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[188px] rounded-[26px]" />
            ))}
          </div>
        ) : phase === 'error' ? (
          <div className="glass mt-10 flex max-w-md flex-col items-center gap-3 rounded-[26px] p-6 text-center">
            <CloudOff className="size-8 text-warn" aria-hidden />
            <p className="font-semibold">Keine Verbindung zur Datenbank</p>
            <p className="text-sm text-muted">{online ? error : 'Du bist offline und es sind noch keine Daten auf diesem Gerät gespeichert.'}</p>
            <Button variant="primary" icon={<RefreshCw className="size-4" />} onClick={() => void resync()}>
              Erneut versuchen
            </Button>
          </div>
        ) : (
          <>
            <ul className={`mt-10 grid w-full gap-3 md:gap-4 ${members.length <= 2 ? 'max-w-md grid-cols-2' : members.length === 3 ? 'grid-cols-3' : 'grid-cols-2 md:grid-cols-4'}`}>
              {members.map((m, i) => {
                const r = memberRatio(views, m.id, completions);
                const openToday = todayViews.filter((v) => !isDone(completions, v.task.id, m.id)).length;
                const isChosen = chosen === m.id;
                const faded = chosen !== null && !isChosen;
                return (
                  <motion.li
                    key={m.id}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: faded ? 0.35 : 1, y: 0, scale: isChosen ? 1.04 : faded ? 0.97 : 1 }}
                    transition={{ duration: d(0.55), delay: chosen ? 0 : d(0.45 + i * 0.07), ease }}
                  >
                    <button
                      type="button"
                      onClick={() => pick(m.id)}
                      className="glass lift group relative flex w-full flex-col items-center gap-3 overflow-hidden rounded-[26px] px-3 pb-5 pt-6 text-center"
                      aria-label={`Als ${m.name} lernen`}
                    >
                      <span
                        aria-hidden
                        className="pointer-events-none absolute -top-16 left-1/2 size-48 -translate-x-1/2 rounded-full opacity-60 transition-opacity duration-500 group-hover:opacity-100"
                        style={{ background: `radial-gradient(circle, ${alpha(m.color, isChosen ? 0.8 : 0.45)}, transparent 65%)` }}
                      />
                      <Avatar name={m.name} color={m.color} size={68} layoutId={`avatar-${m.id}`} ring={isChosen} />
                      <span className="relative w-full truncate px-1 text-[17px] font-semibold tracking-tight">{m.name}</span>
                      <div className="relative w-full px-3">
                        <ProgressBar ratio={r} color={m.color} height={6} label={`Fortschritt ${m.name}`} />
                        <p className="num mt-2 text-xs text-muted">
                          {r.pct === null ? 'Noch keine Aufgaben' : `${r.pct}% erledigt`}
                          {openToday > 0 && ` · ${openToday} heute offen`}
                        </p>
                      </div>
                    </button>
                  </motion.li>
                );
              })}
            </ul>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: d(0.8) }} className="mt-8 flex flex-col items-center gap-3">
              {members.length === 0 && <p className="text-sm text-muted">Noch keine Personen angelegt. Lege die erste Person an.</p>}
              {adding || members.length === 0 ? (
                <form
                  className="flex w-full max-w-sm items-center gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newName.trim()) return;
                    const id = await createMember(newName, suggestColor(members.map((m) => m.color)));
                    if (id) {
                      setNewName('');
                      setAdding(false);
                    }
                  }}
                >
                  <input className="field" autoFocus placeholder="Name" aria-label="Name der neuen Person" maxLength={LIMITS.memberName} value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <Button type="submit" variant="primary">
                    Anlegen
                  </Button>
                </form>
              ) : (
                <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
                  Person hinzufügen
                </Button>
              )}
              <p className="max-w-sm text-center text-xs text-faint">Die Auswahl legt nur fest, wessen Haken gesetzt werden. Es gibt bewusst keine Anmeldung.</p>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
