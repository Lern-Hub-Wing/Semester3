import { BookOpen, CalendarDays, ChartLine, Ellipsis, FileText, GraduationCap, House, Music2, NotebookPen, Settings, SquareCheckBig, Timer, Users, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Gruppe in der Seitenleiste */
  group?: 'main' | 'tools';
  /** Kurzform für die schmale Tablet-Leiste */
  short?: string;
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: House, group: 'main' },
  { to: '/fokus', label: 'Fokus', icon: Timer, group: 'main' },
  { to: '/lernplan', label: 'Lernplan', short: 'Plan', icon: CalendarDays, group: 'main' },
  { to: '/hausaufgaben', label: 'Hausaufgaben', short: 'Hausaufg.', icon: NotebookPen, group: 'main' },
  { to: '/pruefungen', label: 'Prüfungen', icon: GraduationCap, group: 'main' },
  { to: '/faecher', label: 'Fächer', icon: BookOpen, group: 'main' },
  { to: '/team', label: 'Team', icon: Users, group: 'main' },
  { to: '/materialien', label: 'Materialien', short: 'Material', icon: FileText, group: 'main' },
  { to: '/analyse', label: 'Statistiken', short: 'Statistik', icon: ChartLine, group: 'main' },
  { to: '/musik', label: 'Musik', icon: Music2, group: 'main' },
  { to: '/einstellungen', label: 'Einstellungen', short: 'Optionen', icon: Settings, group: 'tools' },
];

export const MOBILE_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: House },
  { to: '/fokus', label: 'Fokus', icon: Timer },
  { to: '/hausaufgaben', label: 'Aufgaben', icon: SquareCheckBig },
  { to: '/lernplan', label: 'Kalender', icon: CalendarDays },
  { to: '#mehr', label: 'Mehr', icon: Ellipsis },
];

export function isActive(path: string, to: string) {
  return to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`);
}
