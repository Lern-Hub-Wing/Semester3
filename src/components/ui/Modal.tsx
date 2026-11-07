import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, useReducedMotion, type DragControls, type PanInfo } from 'motion/react';
import { X } from 'lucide-react';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { IconButton } from './Button';
import { PresenceContainer } from './PresenceDiv';
import { spring } from '../../lib/motion';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/**
 * Dialog: auf dem Smartphone ein Bottom Sheet (nach unten wischen zum
 * Schließen), ab Tablet ein zentriertes Glasfenster.
 */
export function Modal({ open, onClose, title, description, children, footer, wide }: Props) {
  const mobile = useIsMobile();
  const reduce = useReducedMotion();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const dragControls = useDragControls();

  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Anfangsfokus setzen – aber niemals einen Fokus „stehlen“, den die Person
    // schon selbst in ein Feld des Dialogs gesetzt hat (sonst landet Getipptes
    // im falschen Feld).
    const focusInitial = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const active = document.activeElement;
      if (active && active !== panel && panel.contains(active)) return;
      const target = panel.querySelector<HTMLElement>('[data-autofocus]') ?? panel;
      target.focus({ preventScroll: true });
    };
    focusInitial();
    const t = setTimeout(focusInitial, 60);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      restoreFocus.current?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <PresenceContainer className="fixed inset-0 z-[60] flex items-end justify-center md:items-center md:p-6">
          <motion.div
            className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-[10px] backdrop-saturate-150"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={`glass mat-float relative flex max-h-[92dvh] w-full flex-col outline-none ${
              mobile ? 'rounded-t-[32px] pb-[env(safe-area-inset-bottom)]' : `rounded-[32px] ${wide ? 'max-w-3xl' : 'max-w-lg'}`
            }`}
            initial={mobile ? { y: '100%' } : { opacity: 0, scale: 0.9, y: 28 }}
            animate={mobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={mobile ? { y: '100%', transition: { duration: 0.28, ease: [0.4, 0, 1, 1] } } : { opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.2 } }}
            transition={reduce ? { duration: 0 } : mobile ? spring.page : spring.moment}
            drag={mobile ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            dragListener={false}
            dragControls={dragControls}
            onDragEnd={onDragEnd}
          >
            {mobile && <SheetHandle controls={dragControls} />}
            <header className="flex items-start gap-3 px-5 pt-4 md:px-6 md:pt-6">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="title text-[19px]">
                  {title}
                </h2>
                {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
              </div>
              <IconButton label="Schließen" size="sm" onClick={onClose} className="-mr-1 -mt-1">
                <X className="size-5" />
              </IconButton>
            </header>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 md:px-6">{children}</div>
            {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3 md:px-6 md:py-4">{footer}</footer>}
          </motion.div>
        </PresenceContainer>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function SheetHandle({ controls }: { controls: DragControls }) {
  return (
    <div className="flex cursor-grab touch-none justify-center pb-1 pt-2.5" aria-hidden onPointerDown={(e) => controls.start(e)}>
      <span className="h-1.5 w-10 rounded-full bg-[var(--ss-track)]" />
    </div>
  );
}
