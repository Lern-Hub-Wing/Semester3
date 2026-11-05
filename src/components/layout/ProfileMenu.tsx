import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { PresenceDiv } from '../ui/PresenceDiv';
import { ArrowLeftRight, Settings, UserRoundPen } from 'lucide-react';
import { navigate } from '../../lib/router';
import { useSession } from '../../store/session';
import { useActiveMembers, useCurrentMember } from '../../store/derived';
import { Avatar } from '../ui/Avatar';

/** Profilmenü: aktives Lernprofil, schneller Personenwechsel, Einstellungen. */
export function ProfileMenu() {
  const me = useCurrentMember();
  const members = useActiveMembers();
  const select = useSession((s) => s.select);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!me) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Profilmenü – aktiv: ${me.name}`}
        className="glass flex h-10 items-center gap-2 rounded-full p-[3px] sm:pr-3.5"
      >
        <Avatar name={me.name} color={me.color} size={34} layoutId={`avatar-${me.id}`} flat />
        <span className="hidden max-w-[120px] truncate text-sm font-medium sm:block">{me.name}</span>
      </button>
      <AnimatePresence>
        {open && (
          <PresenceDiv
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="glass glass-strong absolute right-0 top-12 z-50 w-64 origin-top-right rounded-[22px] p-2"
          >
            <div className="flex items-center gap-3 px-2 py-2">
              <Avatar name={me.name} color={me.color} size={40} ring />
              <div className="min-w-0">
                <p className="truncate font-semibold">{me.name}</p>
                <p className="text-xs text-muted">Aktives Lernprofil</p>
              </div>
            </div>
            <div className="my-1 h-px bg-[var(--ss-line)]" />
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Person wechseln</p>
            {members
              .filter((m) => m.id !== me.id)
              .map((m) => (
                <button
                  key={m.id}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    select(m.id);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-surface-2"
                >
                  <Avatar name={m.name} color={m.color} size={26} />
                  <span className="truncate">{m.name}</span>
                </button>
              ))}
            <div className="my-1 h-px bg-[var(--ss-line)]" />
            {[
              { label: 'Zur Personenauswahl', icon: ArrowLeftRight, run: () => select(null) },
              { label: 'Profil bearbeiten', icon: UserRoundPen, run: () => navigate(`/team/${me.id}`) },
              { label: 'Einstellungen', icon: Settings, run: () => navigate('/einstellungen') },
            ].map((item) => (
              <button
                key={item.label}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.run();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-surface-2"
              >
                <item.icon className="size-4 text-muted" aria-hidden />
                {item.label}
              </button>
            ))}
          </PresenceDiv>
        )}
      </AnimatePresence>
    </div>
  );
}
