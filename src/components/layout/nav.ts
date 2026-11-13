import { IS_APP } from '../../lib/edition';
import { BookOpen, CalendarDays, ChartLine, Ellipsis, FileText, House, Music2, NotebookPen, Settings, SquareCheckBig, Timer, Users, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Gruppe in der Seitenleiste */
  group?: 'main' | 'tools';
  /** Kurzform für die schmale Tablet-Leiste */
  short?: string;
}

const ALL_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: House, group: 'main' },
  { to: '/fokus', label: 'Fokus', icon: Timer, group: 'main' },
  { to: '/lernplan', label: 'Lernplan', short: 'Plan', icon: CalendarDays, group: 'main' },
  { to: '/hausaufgaben', label: 'Hausaufgaben', short: 'Hausaufg.', icon: NotebookPen, group: 'main' },
  { to: '/faecher', label: 'Fächer', icon: BookOpen, group: 'main' },
  { to: '/team', label: 'Team', icon: Users, group: 'main' },
  { to: '/materialien', label: 'Materialien', short: 'Material', icon: FileText, group: 'main' },
  { to: '/analyse', label: 'Statistiken', short: 'Statistik', icon: ChartLine, group: 'main' },
  { to: '/musik', label: 'Musik', icon: Music2, group: 'main' },
  { to: '/einstellungen', label: 'Einstellungen', short: 'Optionen', icon: Settings, group: 'tools' },
];

/** In der App gibt es keine Dateien (keine Materialien-Seite). */
export const NAV: NavItem[] = IS_APP ? ALL_NAV.filter((n) => n.to !== '/materialien') : ALL_NAV;


/**
 * App: Team bzw. Statistik (alleine lernen) gehört in die Tab-Leiste; der Fokus
 * startet groß im Dashboard und steht ganz oben unter „Mehr“.
 */
export function appMobileNav(solo: boolean): NavItem[] {
  return [
    { to: '/', label: 'Home', icon: House },
    { to: '/lernplan', label: 'Kalender', icon: CalendarDays },
    { to: '/hausaufgaben', label: 'Aufgaben', icon: SquareCheckBig },
    solo ? { to: '/analyse', label: 'Statistik', icon: ChartLine } : { to: '/team', label: 'Team', icon: Users },
    { to: '#mehr', label: 'Mehr', icon: Ellipsis },
  ];
}

/** Tab-Leiste (Smartphone) der bisherigen Seite – gleich wie in der App: Team statt Fokus. */
export const MOBILE_NAV: NavItem[] = appMobileNav(false);

export function isActive(path: string, to: string) {
  return to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`);
}
