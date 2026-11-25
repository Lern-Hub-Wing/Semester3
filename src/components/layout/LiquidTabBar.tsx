import { forwardRef, useMemo, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { TabBar } from 'glisse';
import { useLocation } from '../../lib/router';
import { haptic } from '../../lib/haptics';
import { appMobileNav, isActive } from './nav';
import { IS_APP } from '../../lib/edition';
import { useAccount } from '../../app/account';
import { useMediaQuery } from '../../hooks/useMediaQuery';

const SETTINGS = '/einstellungen';

/**
 * Link für die Glisse-Tab-Leiste: normale Hash-Links.
 * Glisse verhindert Klicks selbst, wenn gerade gezogen wurde.
 */
const TabLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(function TabLink({ href, onClick, ...rest }, ref) {
  return (
    <a
      ref={ref}
      href={href}
      // Marker für die Einführung (z. B. „nav-lernplan“, „nav-einstellungen“)
      data-tour={`nav-${(href ?? '').replace(/^#\/?/, '') || 'home'}`}
      {...rest}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        haptic('tap');
      }}
    />
  );
});

/**
 * Schwebende Tab-Leiste (Smartphone) auf Basis von Glisse.
 * – Antippen wechselt die Seite.
 * – Finger auf der Leiste halten und ziehen: die gläserne Linse folgt dem
 *   Finger, rastet beim Loslassen federnd ein und erst dann wird navigiert.
 * – Vertikales Scrollen bleibt frei (touch-action: pan-y); keine Wischgesten
 *   über dem Seiteninhalt.
 */
export function LiquidTabBar() {
  const { path } = useLocation();
  // App: im eigenen Lernbereich (alleine) Statistik statt Team
  const solo = useAccount((s) => s.me?.groups.find((g) => g.id === s.me?.active_group_id)?.kind === 'solo');
  const nav = useMemo(() => appMobileNav(IS_APP && solo), [solo]);
  // Sehr schmale Handys (unter 360 px): kürzere Beschriftung, damit nichts abgeschnitten wird
  const narrow = useMediaQuery('(max-width: 359px)');

  // Seiten ohne eigenen Tab (Fächer, Statistik, Musik …) erreicht man über die Einstellungen
  const routeIndex = nav.findIndex((item) => isActive(path, item.to));
  const value = routeIndex === -1 ? SETTINGS : nav[routeIndex]!.to;

  const items = useMemo(
    () =>
      nav.map((item) => ({
        value: item.to,
        label: narrow && item.to === SETTINGS ? 'Optionen' : item.label,
        icon: <item.icon strokeWidth={1.8} />,
        href: `#${item.to}`,
      })),
    [nav, narrow],
  );

  return (
    <div className="tabbar fixed inset-x-0 bottom-0 z-40 px-3 md:hidden">
      <TabBar aria-label="Hauptnavigation" className="ss-tabbar mx-auto" items={items} value={value} link={TabLink} />
    </div>
  );
}
