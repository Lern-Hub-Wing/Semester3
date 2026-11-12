import { forwardRef, useMemo, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { TabBar } from 'glisse';
import { useLocation } from '../../lib/router';
import { haptic } from '../../lib/haptics';
import { useUI } from '../../store/ui';
import { MOBILE_NAV, appMobileNav, isActive } from './nav';
import { IS_APP } from '../../lib/edition';
import { useAccount } from '../../app/account';

const MORE = '#mehr';

/**
 * Link für die Glisse-Tab-Leiste: normale Hash-Links für Seiten,
 * „Mehr“ öffnet stattdessen das Blatt mit weiteren Bereichen.
 * Glisse verhindert Klicks selbst, wenn gerade gezogen wurde.
 */
const TabLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(function TabLink({ href, onClick, ...rest }, ref) {
  const more = href === MORE;
  return (
    <a
      ref={ref}
      href={more ? MORE : href}
      role={more ? 'button' : undefined}
      aria-haspopup={more ? 'dialog' : undefined}
      // Marker für die Einführung (z. B. „nav-lernplan“, „nav-mehr“)
      data-tour={more ? 'nav-mehr' : `nav-${(href ?? '').replace(/^#\/?/, '') || 'home'}`}
      {...rest}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        haptic('tap');
        if (more) {
          e.preventDefault();
          useUI.getState().set({ moreOpen: true });
        } else {
          useUI.getState().set({ moreOpen: false });
        }
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
  const moreOpen = useUI((s) => s.moreOpen);
  // App: im eigenen Lernbereich (alleine) Statistik statt Team
  const solo = useAccount((s) => s.me?.groups.find((g) => g.id === s.me?.active_group_id)?.kind === 'solo');
  const nav = useMemo(() => (IS_APP ? appMobileNav(solo) : MOBILE_NAV), [solo]);

  const routeIndex = nav.findIndex((item) => item.to !== MORE && isActive(path, item.to));
  const value = moreOpen || routeIndex === -1 ? MORE : nav[routeIndex]!.to;

  const items = useMemo(
    () =>
      nav.map((item) => ({
        value: item.to,
        label: item.label,
        icon: <item.icon strokeWidth={1.8} />,
        href: item.to === MORE ? MORE : `#${item.to}`,
      })),
    [nav],
  );

  return (
    <div className="tabbar fixed inset-x-0 bottom-0 z-40 px-3 md:hidden">
      <TabBar aria-label="Hauptnavigation" className="ss-tabbar mx-auto" items={items} value={value} link={TabLink} />
    </div>
  );
}
