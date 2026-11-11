import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { spring } from '../../lib/motion';
import { PresenceDiv } from '../ui/PresenceDiv';
import { ArrowLeftRight, LogOut, Settings, UserRound, UserRoundPen, UsersRound } from 'lucide-react';
import { IS_APP } from '../../lib/edition';
import { signOut } from '../../app/account';
import { navigate } from '../../lib/router';
import { useSession } from '../../store/session';
import { useActiveMembers, useCurrentMember } from '../../store/derived';
import { Avatar } from '../ui/Avatar';
import { haptic } from '../../lib/haptics';

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
        onClick={() => {
          haptic('tap');
          setOpen((o) => !o);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Profilmenü – aktiv: ${me.name}`}
        data-testid="profile-button"
        // Mobil: exakt runder Knopf, Avatar per Grid zentriert (40 px außen, 1 px Rand, 32 px Avatar → rundum 3 px).
        // Ab sm: gleiche Höhe, Name daneben; linker Abstand = oberer/unterer Abstand.
        className="glass mat-interactive grid size-10 shrink-0 place-items-center rounded-full sm:flex sm:w-auto sm:items-center sm:gap-2 sm:pl-[3px] sm:pr-3.5"
      >
        <motion.span layoutId={`avatar-${me.id}`} className="inline-grid size-8 shrink-0 place-items-center" transition={spring.page}>
          <Avatar name={me.name} color={me.color} size={32} flat />
        </motion.span>
        <span className="hidden max-w-[120px] truncate text-sm font-medium sm:block">{me.name}</span>
      </button>
      <AnimatePresence>
        {open && (
          <PresenceDiv
            role="menu"
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95, transition: { duration: 0.16 } }}
            transition={spring.comp}
            className="glass mat-float absolute right-0 top-12 z-50 w-68 origin-top-right rounded-[26px] p-2"
          >
            <div className="flex items-center gap-3 px-2 py-2">
              <Avatar name={me.name} color={me.color} size={40} ring />
              <div className="min-w-0">
                <p className="truncate font-semibold">{me.name}</p>
                <p className="text-xs text-muted">{IS_APP ? 'Angemeldet' : 'Aktives Lernprofil'}</p>
              </div>
            </div>
            <div className="my-1 h-px bg-[var(--ss-line)]" />
            {!IS_APP && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Person wechseln</p>}
            {!IS_APP && members
              .filter((m) => m.id !== me.id)
              .map((m) => (
                <button
                  key={m.id}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    haptic('select');
                    setOpen(false);
                    select(m.id);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-[14px] px-2.5 py-2 text-left text-sm transition-colors hover:bg-[color-mix(in_srgb,var(--ss-text)_6%,transparent)]"
                >
                  <Avatar name={m.name} color={m.color} size={26} />
                  <span className="truncate">{m.name}</span>
                </button>
              ))}
            {!IS_APP && <div className="my-1 h-px bg-[var(--ss-line)]" />}
            {(IS_APP
              ? [
                  { label: 'Konto', icon: UserRound, run: () => navigate('/einstellungen/konto') },
                  { label: 'Lerngruppe', icon: UsersRound, run: () => navigate('/einstellungen/gruppe') },
                  { label: 'Einstellungen', icon: Settings, run: () => navigate('/einstellungen') },
                  { label: 'Abmelden', icon: LogOut, run: () => void signOut() },
                ]
              : [
                  { label: 'Zur Personenauswahl', icon: ArrowLeftRight, run: () => select(null) },
                  { label: 'Profil bearbeiten', icon: UserRoundPen, run: () => navigate(`/team/${me.id}`) },
                  { label: 'Einstellungen', icon: Settings, run: () => navigate('/einstellungen') },
                ]
            ).map((item) => (
              <button
                key={item.label}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.run();
                }}
                className="flex w-full items-center gap-2.5 rounded-[14px] px-2.5 py-2 text-left text-sm transition-colors hover:bg-[color-mix(in_srgb,var(--ss-text)_6%,transparent)]"
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
