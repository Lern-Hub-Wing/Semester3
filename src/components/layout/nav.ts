import { BookOpen, CalendarDays, Ellipsis, FileText, GraduationCap, LayoutDashboard, Settings, Users, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/lernplan', label: 'Lernplan', icon: CalendarDays },
  { to: '/faecher', label: 'Fächer', icon: BookOpen },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/pruefungen', label: 'Prüfungen', icon: GraduationCap },
  { to: '/materialien', label: 'Materialien', icon: FileText },
  { to: '/einstellungen', label: 'Einstellungen', icon: Settings },
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
