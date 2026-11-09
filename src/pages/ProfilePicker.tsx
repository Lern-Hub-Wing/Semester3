import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CloudOff, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { isDone, memberRatio } from '../lib/progress';
import { formatISODate } from '../lib/time';
import { suggestColor, alpha } from '../lib/colors';
import { LIMITS } from '../lib/config';
import { EASE_EMPH, EASE_OUT, spring } from '../lib/motion';
import { useData, useSyncStatus } from '../store/data';
import { useActiveMembers, useAppName, useTaskViews } from '../store/derived';
import { useSession } from '../store/session';
import { createMember } from '../store/actions';
import { resync } from '../store/sync';
import { useToday } from '../hooks/useToday';
import { Avatar } from '../components/ui/Avatar';
import { ProgressRing } from '../components/ui/Progress';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { LogoMark } from '../components/Logo';
import { Ambient } from '../components/layout/Ambient';
import { Landscape } from '../components/landscape/Landscape';
import { haptic } from '../lib/haptics';

/** Die ausführliche Startanimation läuft nur beim ersten Öffnen der Seite. */
let introPlayed = false;

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
  const [chosen, setChosen] = useState<{ id: string; color: string; x: number; y: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const intro = useRef(!introPlayed && !reduce).current;
  introPlayed = true;

  const todayViews = useMemo(() => views.filter((v) => v.date === today), [views, today]);

  const pick = (id: string, color: string, el: HTMLElement) => {
    if (chosen) return;
    haptic('select');
    const r = el.getBoundingClientRect();
    setChosen({ id, color, x: r.left + r.width / 2, y: r.top + r.height / 2 });
    setTimeout(() => select(id), reduce ? 0 : 520);
  };

  const d = (n: number) => (reduce ? 0 : n);
  /** Basisverzögerung: bei der Startanimation warten die Inhalte auf das Logo */
  const t0 = intro ? 0.85 : 0.05;

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-[max(env(safe-area-inset-top),28px)]">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: d(1.1) }}>
        <Ambient color={chosen?.color} />
      </motion.div>
      {/* Gleiche Stimmung wie im Dashboard: Berglandschaft läuft weich in den Hintergrund aus */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[62vh] overflow-hidden [mask-image:linear-gradient(180deg,#000_40%,transparent)]"
        initial={{ opacity: 0, scale: 1.06 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: d(1.6), ease: EASE_OUT }}
      >
        <div className="hero-scene absolute inset-0">
          <Landscape />
        </div>
      </motion.div>

      {/* Farbschimmer der gewählten Person breitet sich vom Avatar aus */}
      <AnimatePresence>
        {chosen && !reduce && (
          <motion.span
            aria-hidden
            className="pointer-events-none fixed z-0 size-[40px] rounded-full"
            style={{ left: chosen.x - 20, top: chosen.y - 20, background: `radial-gradient(circle, ${alpha(chosen.color, 0.55)}, transparent 70%)` }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 60, opacity: [0, 1, 0.65] }}
            transition={{ duration: 0.9, ease: EASE_EMPH }}
          />
        )}
      </AnimatePresence>

      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center">
        {/* Logo: entsteht in der Bildmitte und gleitet dann an seinen Platz */}
        <motion.div
          initial={intro ? { y: '22vh', scale: 2.1 } : { opacity: 0, scale: 0.9 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          transition={intro ? { type: 'spring', stiffness: 120, damping: 20, delay: 0.72 } : { duration: d(0.5), ease: EASE_OUT }}
          className="mb-6 flex items-center gap-3"
        >
          <LogoMark size={46} animate={intro} colors={members.length >= 4 ? members.map((m) => m.color) : undefined} />
          <motion.span
            className="title text-[21px]"
            initial={intro ? { opacity: 0, x: -8, filter: 'blur(6px)' } : false}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.6, delay: intro ? 0.55 : 0, ease: EASE_OUT }}
          >
            {appName}
          </motion.span>
        </motion.div>

        <h1 className="display text-center text-[38px] md:text-[60px]">
          {'Wer lernt heute?'.split(' ').map((word, i) => (
            <motion.span
              key={i}
              className="inline-block whitespace-pre"
              initial={reduce ? false : { opacity: 0, y: 26, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.7, delay: t0 + i * 0.08, ease: EASE_EMPH }}
            >
              {word}
              {i < 2 ? ' ' : ''}
            </motion.span>
          ))}
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: d(0.6), delay: d(t0 + 0.2), ease: EASE_OUT }}
          className="mt-3 text-center text-[15px] text-muted"
        >
          {formatISODate(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </motion.p>

        {phase === 'loading' ? (
          <div className="mt-12 grid w-full grid-cols-2 gap-3 md:grid-cols-4 md:gap-5" aria-busy="true" aria-label="Profile werden geladen">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[220px] rounded-[28px]" />
            ))}
          </div>
        ) : phase === 'error' ? (
          <div className="glass mt-12 flex max-w-md flex-col items-center gap-3 rounded-[28px] p-7 text-center">
            <CloudOff className="size-8 text-warn" aria-hidden />
            <p className="title">Keine Verbindung zur Datenbank</p>
            <p className="text-sm text-muted">{online ? error : 'Du bist offline und es sind noch keine Daten auf diesem Gerät gespeichert.'}</p>
            <Button variant="primary" icon={<RefreshCw className="size-4" />} onClick={() => void resync()}>
              Erneut versuchen
            </Button>
          </div>
        ) : (
          <>
            <ul
              className={`mt-12 grid w-full gap-3 [perspective:1200px] md:gap-5 ${
                members.length <= 2 ? 'max-w-md grid-cols-2' : members.length === 3 ? 'max-w-3xl grid-cols-3' : 'grid-cols-2 md:grid-cols-4'
              }`}
            >
              {members.map((m, i) => {
                const r = memberRatio(views, m.id, completions);
                const openToday = todayViews.filter((v) => !isDone(completions, v.task.id, m.id)).length;
                const isChosen = chosen?.id === m.id;
                const faded = chosen !== null && !isChosen;
                return (
                  <motion.li
                    key={m.id}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 70, rotateX: 26, scale: 0.88 }}
                    animate={{
                      opacity: faded ? 0.28 : 1,
                      y: 0,
                      rotateX: 0,
                      scale: isChosen ? 1.06 : faded ? 0.92 : 1,
                      filter: faded ? 'blur(3px)' : 'blur(0px)',
                    }}
                    transition={chosen ? spring.moment : reduce ? { duration: 0 } : { type: 'spring', stiffness: 150, damping: 17, delay: t0 + 0.18 + i * 0.08 }}
                    style={{ zIndex: isChosen ? 2 : 1 }}
                  >
                    <motion.button
                      type="button"
                      onClick={(e) => pick(m.id, m.color, e.currentTarget)}
                      whileTap={reduce ? undefined : { scale: 0.96 }}
                      className="glass picker-card group relative flex w-full flex-col items-center gap-3 overflow-hidden rounded-[30px] px-3 pb-6 pt-7 text-center"
                      aria-label={`Als ${m.name} lernen`}
                    >
                      <span
                        aria-hidden
                        className="pointer-events-none absolute -top-20 left-1/2 size-56 -translate-x-1/2 rounded-full transition-opacity duration-500 group-hover:opacity-100"
                        style={{ opacity: isChosen ? 1 : 0.55, background: `radial-gradient(circle, ${alpha(m.color, isChosen ? 0.85 : 0.5)}, transparent 66%)` }}
                      />
                      <ProgressRing ratio={r} color={m.color} size={96} stroke={5} sublabel={`Fortschritt ${m.name}`} showValue={false}>
                        <motion.span layoutId={`avatar-${m.id}`} className="inline-grid" transition={spring.page}>
                          <Avatar name={m.name} color={m.color} size={72} />
                        </motion.span>
                      </ProgressRing>
                      <span className="title relative w-full truncate px-1 text-[18px]">{m.name}</span>
                      <p className="num relative -mt-1.5 text-[12.5px] text-muted">
                        {r.pct === null ? 'Noch keine Aufgaben' : `${r.pct} % erledigt`}
                        {openToday > 0 && (
                          <>
                            <span aria-hidden> · </span>
                            <span style={{ color: `color-mix(in srgb, ${m.color} 55%, var(--ss-text))` }}>{openToday} heute offen</span>
                          </>
                        )}
                      </p>
                    </motion.button>
                  </motion.li>
                );
              })}
            </ul>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: chosen ? 0 : 1, y: 0 }}
              transition={{ delay: chosen ? 0 : d(t0 + 0.6), duration: d(0.5) }}
              className="mt-9 flex flex-col items-center gap-3"
            >
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
                <Button variant="glass" size="sm" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
                  Person hinzufügen
                </Button>
              )}
              <p className="flex max-w-sm items-center justify-center gap-1.5 text-center text-xs text-faint">
                <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
                Die Auswahl legt nur fest, wessen Haken gesetzt werden. Es gibt bewusst keine Anmeldung.
              </p>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
