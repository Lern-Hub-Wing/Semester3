import { AnimatePresence, motion } from 'motion/react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useToasts } from '../../store/toast';
import { spring } from '../../lib/motion';

/** Rückmeldungen am unteren Rand (über der mobilen Navigation). */
export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-height)+var(--tabbar-gap)+12px)] z-[80] flex flex-col items-center gap-2 px-4 md:bottom-6"
      aria-live="polite"
      role="status"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 28, scale: 0.86 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.94, transition: { duration: 0.2 } }}
            transition={spring.moment}
            className="glass mat-float pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[22px] px-4 py-3 text-sm"
          >
            {t.kind === 'success' ? (
              <CircleCheck className="size-5 shrink-0 text-success" aria-hidden />
            ) : t.kind === 'error' ? (
              <CircleAlert className="size-5 shrink-0 text-danger" aria-hidden />
            ) : (
              <Info className="size-5 shrink-0 text-accent" aria-hidden />
            )}
            <span className="min-w-0 flex-1">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="shrink-0 rounded-lg px-2 py-1 font-semibold text-accent hover:bg-[color-mix(in_srgb,var(--ss-text)_6%,transparent)]"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" aria-label="Meldung schließen" onClick={() => dismiss(t.id)} className="-mr-1 shrink-0 rounded-lg p-1 text-muted hover:text-ink">
              <X className="size-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
