import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import { ACCENTS, markDesignChosen, useDesignChosen, type Accent, type AccentId } from '../lib/accents';
import { usePrefs } from '../store/prefs';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { haptic } from '../lib/haptics';
import { Button } from './ui/Button';

/**
 * Beim allerersten Start auf einem Gerät: Design wählen (Lila oder Graphit) –
 * mit Live-Vorschau. Später jederzeit unter Einstellungen → Darstellung änderbar.
 */
export function DesignChooser() {
  const open = !useDesignChosen();
  const accent = usePrefs((s) => s.accent);
  const set = usePrefs((s) => s.set);
  const theme = usePrefs((s) => s.theme);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  const reduce = useReducedMotion();

  const pick = (id: AccentId) => {
    haptic('tap');
    set({ accent: id });
  };
  const done = () => {
    haptic('success');
    markDesignChosen();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="design-chooser"
          className="fixed inset-0 z-[85] grid place-items-center overflow-y-auto bg-[var(--scrim)] p-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.35 }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="design-chooser-title"
            data-testid="design-chooser"
            className="card w-full max-w-[440px] rounded-[28px] p-5 sm:p-6"
            initial={reduce ? false : { opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="eyebrow">Willkommen</p>
            <h2 id="design-chooser-title" className="title mt-1 text-[22px] leading-tight">
              Wähle dein Design
            </h2>
            <p className="mt-1 text-[14px] text-muted">Du kannst es jederzeit in den Einstellungen ändern.</p>
            <div role="radiogroup" aria-label="Design" className="mt-5 grid grid-cols-2 gap-3">
              {ACCENTS.map((a) => (
                <DesignCard key={a.id} accent={a} dark={dark} selected={accent === a.id} onSelect={() => pick(a.id)} />
              ))}
            </div>
            <Button variant="primary" size="lg" className="mt-5 w-full" onClick={done} data-testid="design-chooser-done">
              Weiter
            </Button>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function DesignCard({ accent, dark, selected, onSelect }: { accent: Accent; dark: boolean; selected: boolean; onSelect: () => void }) {
  const c = accent.preview[dark ? 1 : 0];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${accent.label} – ${accent.hint}`}
      onClick={onSelect}
      className={`press relative flex flex-col gap-2.5 rounded-[22px] p-2 text-left transition-[box-shadow] duration-300 ${selected ? 'shadow-[0_0_0_2px_var(--ss-accent)]' : 'shadow-[0_0_0_1px_var(--ss-edge)]'}`}
    >
      {/* Mini-Vorschau: Kopfzeile, Karte, Knopf – in den echten Farben des Designs */}
      <span aria-hidden className="flex aspect-[4/5] flex-col gap-1.5 overflow-hidden rounded-[16px] p-2.5" style={{ background: c.bg }}>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: c.accent }} />
          <span className="h-1.5 w-10 rounded-full" style={{ background: c.text, opacity: 0.85 }} />
        </span>
        <span className="mt-1 h-2 w-16 rounded-full" style={{ background: c.text }} />
        <span className="flex flex-1 flex-col gap-1.5 rounded-[10px] p-2" style={{ background: c.card, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
          <span className="h-1.5 w-12 rounded-full" style={{ background: c.text, opacity: 0.8 }} />
          <span className="h-1.5 w-16 rounded-full" style={{ background: c.muted, opacity: 0.6 }} />
          <span className="h-1.5 w-9 rounded-full" style={{ background: c.muted, opacity: 0.6 }} />
          <span className="mt-auto h-1 w-full rounded-full" style={{ background: c.muted, opacity: 0.25 }}>
            <span className="block h-full w-2/3 rounded-full" style={{ background: c.accent }} />
          </span>
        </span>
        <span className="grid h-5 place-items-center rounded-full text-[8px] font-semibold" style={{ background: c.accent, color: c.btnText }}>
          Fokus starten
        </span>
      </span>
      <span className="flex items-center justify-between gap-2 px-1 pb-0.5">
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold leading-tight">{accent.label}</span>
          <span className="block truncate text-[11.5px] text-muted">{accent.hint}</span>
        </span>
        <span className={`grid size-5 shrink-0 place-items-center rounded-full transition-colors ${selected ? 'bg-[var(--ss-accent)] text-[var(--ss-btn-text)]' : 'border border-line'}`} aria-hidden>
          {selected && <Check className="size-3" strokeWidth={3} />}
        </span>
      </span>
    </button>
  );
}
