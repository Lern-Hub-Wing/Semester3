import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ArrowLeftRight, CalendarPlus, History, Search, Trash2 } from 'lucide-react';
import { Link, navigate, useLocation } from '../../lib/router';
import { useAppName } from '../../store/derived';
import { useSession } from '../../store/session';
import { useUI } from '../../store/ui';
import { LogoMark } from '../Logo';
import { Modal } from '../ui/Modal';
import { IconButton } from '../ui/Button';
import { NAV, isActive } from './nav';
import { LiquidTabBar } from './LiquidTabBar';
import { ProfileMenu } from './ProfileMenu';
import { OfflineBanner, StatusPill } from './StatusPill';

export function Ambient() {
  return (
    <div className="ambient" aria-hidden>
      <span />
      <span />
      <span />
    </div>
  );
}

/** Rahmen der App: Seitenleiste (Tablet/Desktop), schwebende Navigation (Smartphone). */
export function AppShell({ children }: { children: ReactNode }) {
  const { path } = useLocation();
  const appName = useAppName();
  const setUI = useUI((s) => s.set);
  const openEditor = useUI((s) => s.openEntryEditor);

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Neue Seite beginnt oben (Filter-/Datumswechsel innerhalb einer Seite behalten die Position)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [path]);

  return (
    <div className="relative min-h-dvh">
      <Ambient />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-xl focus:bg-surface focus:px-4 focus:py-2">
        Zum Inhalt springen
      </a>

      {/* Seitenleiste: kompakt auf Tablets, ausführlich auf dem Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[88px] flex-col p-3 md:flex lg:w-[256px]">
        <div className="glass flex h-full flex-col rounded-[28px] p-2.5 lg:p-3">
          <Link to="/" className="mb-4 flex items-center justify-center gap-2.5 rounded-2xl px-2 py-3 lg:justify-start" aria-label={`${appName} – Dashboard`}>
            <LogoMark size={34} />
            <span className="hidden truncate text-[17px] font-semibold tracking-tight lg:block">{appName}</span>
          </Link>
          <nav aria-label="Hauptnavigation" className="flex flex-1 flex-col gap-1">
            {NAV.map((item) => {
              const active = isActive(path, item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={`group relative flex flex-col items-center gap-1 rounded-2xl px-2 py-2.5 text-[11px] font-medium transition-colors lg:flex-row lg:gap-3 lg:px-3.5 lg:py-3 lg:text-sm ${
                    active ? 'text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-2xl bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.05),0_8px_20px_-12px_rgba(0,0,0,0.25)]"
                      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                    />
                  )}
                  <item.icon className="relative size-[21px] lg:size-5" strokeWidth={1.75} aria-hidden />
                  <span className="relative">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="flex flex-col gap-1">
            <SideAction icon={<Search className="size-5" strokeWidth={1.75} />} label="Suche" hint="⌘K" onClick={() => setUI({ searchOpen: true })} />
            <SideAction icon={<Trash2 className="size-5" strokeWidth={1.75} />} label="Papierkorb" onClick={() => navigate('/papierkorb')} />
          </div>
        </div>
      </aside>

      <div className="relative z-10 md:pl-[88px] lg:pl-[256px]">
        <header className="sticky top-0 z-20 flex items-center justify-end gap-2 px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)] md:px-6 md:pt-4 lg:px-8">
          {/* Weich auslaufende Glasfläche hinter den Knöpfen – nur sichtbar, sobald gescrollt wird */}
          <span aria-hidden className={`header-fade pointer-events-none absolute inset-x-0 top-0 -bottom-5 -z-10 transition-opacity duration-300 ${scrolled ? 'opacity-100' : 'opacity-0'}`} />
          <Link to="/" className="mr-auto flex items-center gap-2 md:hidden" aria-label={`${appName} – Dashboard`}>
            <LogoMark size={28} />
          </Link>
          <StatusPill />
          <IconButton label="Neuer Lerntag" variant="glass" size="sm" className="!size-10 !rounded-full" onClick={() => openEditor()}>
            <CalendarPlus className="size-[18px]" />
          </IconButton>
          <IconButton label="Suche öffnen" variant="glass" size="sm" className="!size-10 !rounded-full md:hidden" onClick={() => setUI({ searchOpen: true })}>
            <Search className="size-[18px]" />
          </IconButton>
          <ProfileMenu />
        </header>
        <main id="main" className="mx-auto w-full max-w-[1320px] px-4 pb-[calc(env(safe-area-inset-bottom)+112px)] pt-2 md:px-6 md:pb-12 lg:px-8">
          <OfflineBanner />
          {/* CSS-Übergang statt JS-Animation: läuft zuverlässig auch bei nachgeladenen Seiten */}
          <div key={path.split('/')[1] ?? ''} className="ss-page">
            {children}
          </div>
        </main>
      </div>

      <LiquidTabBar />
      <MoreSheet />
    </div>
  );
}

function SideAction({ icon, label, hint, onClick }: { icon: ReactNode; label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-2xl px-2 py-2.5 text-[11px] font-medium text-muted transition-colors hover:bg-surface-2/70 hover:text-ink lg:flex-row lg:gap-3 lg:px-3.5 lg:text-sm"
    >
      {icon}
      <span>{label}</span>
      {hint && <kbd className="ml-auto hidden rounded-md border border-line px-1.5 text-[10px] lg:inline">{hint}</kbd>}
    </button>
  );
}

function MoreSheet() {
  const open = useUI((s) => s.moreOpen);
  const setUI = useUI((s) => s.set);
  const select = useSession((s) => s.select);
  const close = () => setUI({ moreOpen: false });
  const go = (to: string) => {
    close();
    navigate(to);
  };
  const items = [
    ...NAV.filter((n) => ['/pruefungen', '/materialien', '/einstellungen'].includes(n.to)).map((n) => ({ label: n.label, icon: n.icon, run: () => go(n.to) })),
    { label: 'Suche', icon: Search, run: () => (close(), setUI({ searchOpen: true })) },
    { label: 'Papierkorb', icon: Trash2, run: () => go('/papierkorb') },
    { label: 'Änderungsverlauf', icon: History, run: () => go('/verlauf') },
    { label: 'Person wechseln', icon: ArrowLeftRight, run: () => (close(), select(null)) },
  ];
  return (
    <Modal open={open} onClose={close} title="Mehr">
      <div className="grid grid-cols-3 gap-2 pb-2">
        {items.map((i) => (
          <button
            key={i.label}
            type="button"
            onClick={i.run}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl bg-surface-2/70 p-2 text-center text-[12.5px] font-medium transition-colors active:bg-surface-2"
          >
            <i.icon className="size-6 text-muted" strokeWidth={1.7} aria-hidden />
            {i.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 md:mb-7">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">{eyebrow}</p>}
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight md:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
