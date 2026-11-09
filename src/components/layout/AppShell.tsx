import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ArrowLeftRight, Bell, BellRing, Clock3, History, Search, Trash2 } from 'lucide-react';
import { Link, navigate, useLocation } from '../../lib/router';
import { useAppName, useCurrentMember, useTaskViews } from '../../store/derived';
import { useData } from '../../store/data';
import { usePush } from '../../store/push';
import { isDone } from '../../lib/progress';
import { useToday } from '../../hooks/useToday';
import { useSession } from '../../store/session';
import { useUI } from '../../store/ui';
import { Logo, LogoMark } from '../Logo';
import { greetingFor } from '../../lib/time';
import { Modal } from '../ui/Modal';
import { IconButton } from '../ui/Button';
import { NAV, isActive } from './nav';
import { LiquidTabBar } from './LiquidTabBar';
import { haptic } from '../../lib/haptics';
import { spring } from '../../lib/motion';
import { startStudyMode } from '../../lib/studyModeStart';
import { ProfileMenu } from './ProfileMenu';
import { OfflineBanner, StatusPill } from './StatusPill';
import { Ambient } from './Ambient';

export { Ambient };

/** Rahmen der App: Glas-Seitenleiste (Tablet/Desktop), schwebende Tab-Leiste (Smartphone). */
export function AppShell({ children }: { children: ReactNode }) {
  const { path } = useLocation();
  const appName = useAppName();
  const me = useCurrentMember();
  const setUI = useUI((s) => s.set);

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

  const mainNav = NAV.filter((n) => n.group === 'main');
  const toolNav = NAV.filter((n) => n.group === 'tools');

  return (
    <div className="relative min-h-dvh">
      <Ambient color={me?.color} />
      <div aria-hidden className="top-fade" />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-xl focus:bg-surface focus:px-4 focus:py-2">
        Zum Inhalt springen
      </a>

      {/* Seitenleiste: flach, mit Trennlinie; kompakt auf Tablets, ausführlich auf dem Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[92px] flex-col md:flex lg:w-[248px]">
        <div className="ss-sidebar flex h-full flex-col px-2.5 pb-4 pt-5 lg:px-4">
          <Link to="/" className="mb-7 flex items-center justify-center px-2 lg:justify-start lg:px-3" aria-label={`${appName} – Dashboard`}>
            <span className="lg:hidden">
              <LogoMark size={34} />
            </span>
            <span className="hidden lg:inline-flex">
              <Logo name={appName} size={30} />
            </span>
          </Link>
          <nav aria-label="Hauptnavigation" className="scroll-thin flex flex-1 flex-col gap-1 overflow-y-auto">
            {mainNav.map((item) => (
              <SideLink key={item.to} item={item} active={isActive(path, item.to)} />
            ))}
            <span className="mx-2 my-3 h-px bg-[var(--ss-edge)]" aria-hidden />
            {toolNav.map((item) => (
              <SideLink key={item.to} item={item} active={isActive(path, item.to)} />
            ))}
          </nav>
          <div className="mt-2 flex flex-col gap-0.5">
            <SideAction icon={<Clock3 className="size-[18px]" strokeWidth={1.75} />} label="Lernmodus" onClick={startStudyMode} />
            <SideAction icon={<Trash2 className="size-[18px]" strokeWidth={1.75} />} label="Papierkorb" onClick={() => navigate('/papierkorb')} />
          </div>
        </div>
      </aside>

      <div className="relative z-10 md:pl-[92px] lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex items-center justify-end gap-2 px-4 pb-2 pt-[max(calc(env(safe-area-inset-top)+6px),16px)] md:px-6 md:pt-4 lg:px-8">
          {/* Weich auslaufende Glasfläche hinter den Knöpfen – nur sichtbar, sobald gescrollt wird */}
          <span aria-hidden className={`header-fade pointer-events-none absolute inset-x-0 top-0 -bottom-6 -z-10 transition-opacity duration-300 ${scrolled ? 'opacity-100' : 'opacity-0'}`} />
          {/* Links: Handy – Logo; Desktop-Dashboard – Begrüßung */}
          <div className="min-w-0 flex-1">
            <span className="md:hidden" data-testid="mobile-logo">
              <Logo name={appName} size={28} />
            </span>
            {path === '/' && <HeaderGreeting />}
          </div>
          <span className="hidden md:contents">
            <StatusPill quiet />
          </span>
          <IconButton label="Suche öffnen" variant="glass" size="sm" className="!size-10 !rounded-full" onClick={() => setUI({ searchOpen: true })}>
            <Search className="size-[18px]" />
          </IconButton>
          <BellButton />
          <ProfileMenu />
        </header>
        <main id="main" className="pb-tabbar mx-auto w-full max-w-[1360px] px-4 pt-2 md:px-6 lg:px-8">
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

/** Begrüßung in der Kopfzeile des Dashboards (Tablet/Desktop) */
function HeaderGreeting() {
  return (
    <div className="hidden md:block" data-testid="header-greeting">
      <p className="text-[13px] font-medium text-muted">{greetingFor()}</p>
      <p className="title text-[22px] leading-tight lg:text-[26px]">Bereit für eine produktive Session?</p>
    </div>
  );
}

/** Glocke: führt zu den Benachrichtigungen; leuchtet, wenn sie auf diesem Gerät aktiv sind */
function BellButton() {
  const on = usePush((s) => s.phase === 'on');
  return (
    <IconButton label={on ? 'Benachrichtigungen (aktiv)' : 'Benachrichtigungen'} variant="glass" size="sm" className="relative !size-10 !rounded-full" onClick={() => navigate('/einstellungen/benachrichtigungen')}>
      {on ? <BellRing className="size-[18px]" /> : <Bell className="size-[18px]" />}
      {on && <span aria-hidden className="absolute right-[9px] top-[9px] size-2 rounded-full bg-[var(--ss-accent)] shadow-[0_0_0_2px_var(--ss-bg)]" />}
    </IconButton>
  );
}

/** Offene Aufgaben heute + überfällig für das aktive Profil (Badge in der Seitenleiste) */
function useOpenBadge(): number {
  const me = useCurrentMember();
  const views = useTaskViews();
  const completions = useData((s) => s.task_completions);
  const today = useToday();
  return useMemo(() => (me ? views.filter((v) => v.date <= today && !isDone(completions, v.task.id, me.id)).length : 0), [me, views, completions, today]);
}

function SideLink({ item, active }: { item: (typeof NAV)[number]; active: boolean }) {
  const open = useOpenBadge();
  const badge = item.to === '/lernplan' && open > 0 ? open : null;
  return (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      onClick={() => haptic('tap')}
      title={item.label}
      className={`nav-item group relative flex flex-col items-center gap-1 rounded-[12px] px-1 py-2.5 text-[10.5px] font-medium lg:flex-row lg:gap-3 lg:px-3 lg:py-[9px] lg:text-[14.5px] ${
        active ? 'text-ink' : 'text-muted hover:text-ink'
      }`}
    >
      {active && <motion.span layoutId="nav-active" className="side-lens absolute inset-0 rounded-[12px]" transition={spring.tab} />}
      <item.icon className={`nav-item-icon relative size-[21px] lg:size-[19px] ${active ? 'text-accent' : ''}`} strokeWidth={active ? 2.1 : 1.75} aria-hidden />
      <span className="relative max-w-full truncate lg:hidden">{item.short ?? item.label}</span>
      <span className="relative hidden lg:inline">{item.label}</span>
      {badge !== null && (
        <span className="num relative ml-auto hidden min-w-[22px] rounded-full bg-[color-mix(in_srgb,var(--ss-accent)_18%,transparent)] px-1.5 py-0.5 text-center text-[11px] font-semibold text-accent lg:inline-block" aria-label={`${badge} offen`}>
          {badge}
        </span>
      )}
    </Link>
  );
}

function SideAction({ icon, label, hint, onClick }: { icon: ReactNode; label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="nav-item flex flex-col items-center gap-1 rounded-[12px] px-1 py-2 text-[10.5px] font-medium text-muted hover:text-ink lg:flex-row lg:gap-3 lg:px-3 lg:text-[13.5px]"
    >
      <span className="nav-item-icon">{icon}</span>
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
    ...NAV.filter((n) => ['/pruefungen', '/faecher', '/team', '/materialien', '/analyse', '/musik', '/einstellungen'].includes(n.to)).map((n) => ({ label: n.label, icon: n.icon, run: () => go(n.to) })),
    { label: 'Suche', icon: Search, run: () => (close(), setUI({ searchOpen: true })) },
    { label: 'Lernmodus', icon: Clock3, run: () => (close(), startStudyMode()) },
    { label: 'Papierkorb', icon: Trash2, run: () => go('/papierkorb') },
    { label: 'Verlauf', icon: History, run: () => go('/verlauf') },
    { label: 'Person wechseln', icon: ArrowLeftRight, run: () => (close(), select(null)) },
  ];
  return (
    <Modal open={open} onClose={close} title="Mehr">
      <div className="grid grid-cols-3 gap-2.5 pb-2">
        {items.map((i, idx) => (
          <motion.button
            key={i.label}
            type="button"
            initial={{ opacity: 0, y: 14, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...spring.comp, delay: 0.04 + idx * 0.025 }}
            onClick={() => {
              haptic('tap');
              i.run();
            }}
            className="glass mat-interactive flex aspect-square flex-col items-center justify-center gap-2 rounded-[22px] p-2 text-center text-[12.5px] font-medium"
          >
            <i.icon className="size-6 text-accent" strokeWidth={1.7} aria-hidden />
            {i.label}
          </motion.button>
        ))}
      </div>
    </Modal>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 md:mb-8">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="display text-[32px] md:text-[44px]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-[15px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
