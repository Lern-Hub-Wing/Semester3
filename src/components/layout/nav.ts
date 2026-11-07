import { BarChart3, BookOpen, CalendarDays, Ellipsis, FileText, GraduationCap, LayoutDashboard, Settings, Timer, Users, type LucideIcon } from 'lucide-react';

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
  { to: '/', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, group: 'main' },
  { to: '/lernplan', label: 'Lernplan', icon: CalendarDays, group: 'main' },
  { to: '/faecher', label: 'Fächer', icon: BookOpen, group: 'main' },
  { to: '/team', label: 'Team', icon: Users, group: 'main' },
  { to: '/pruefungen', label: 'Prüfungen', icon: GraduationCap, group: 'main' },
  { to: '/materialien', label: 'Materialien', short: 'Material', icon: FileText, group: 'main' },
  { to: '/fokus', label: 'Fokus', icon: Timer, group: 'tools' },
  { to: '/analyse', label: 'Analyse', icon: BarChart3, group: 'tools' },
  { to: '/einstellungen', label: 'Einstellungen', short: 'Optionen', icon: Settings, group: 'tools' },
];

export const MOBILE_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/lernplan', label: 'Lernplan', icon: CalendarDays },
  { to: '/faecher', label: 'Fächer', icon: BookOpen },
  { to: '/team', label: 'Team', icon: Users },
  { to: '#mehr', label: 'Mehr', icon: Ellipsis },
];

export function isActive(path: string, to: string) {
  return to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`);
}
