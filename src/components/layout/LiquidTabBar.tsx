import { forwardRef, useMemo, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { TabBar } from 'glisse';
import { useLocation } from '../../lib/router';
import { haptic } from '../../lib/haptics';
import { useUI } from '../../store/ui';
import { MOBILE_NAV, isActive } from './nav';

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

  const routeIndex = MOBILE_NAV.findIndex((item) => item.to !== MORE && isActive(path, item.to));
  const value = moreOpen || routeIndex === -1 ? MORE : MOBILE_NAV[routeIndex]!.to;

  const items = useMemo(
    () =>
      MOBILE_NAV.map((item) => ({
        value: item.to,
        label: item.label,
        icon: <item.icon strokeWidth={1.8} />,
        href: item.to === MORE ? MORE : `#${item.to}`,
      })),
    [],
  );

  return (
    <div className="tabbar fixed inset-x-0 bottom-0 z-40 px-3 md:hidden">
      <TabBar aria-label="Hauptnavigation" className="ss-tabbar mx-auto" items={items} value={value} link={TabLink} />
    </div>
  );
}
