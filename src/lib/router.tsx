/**
 * Minimaler Hash-Router. Hash-URLs (…/#/lernplan) funktionieren auf
 * GitHub Pages ohne Serverkonfiguration – auch bei direktem Aufruf und
 * nach dem Neuladen.
 */
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

export interface Location {
  path: string;
  query: URLSearchParams;
}

function parse(): Location {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, search = ''] = raw.split('?');
  return { path: path.startsWith('/') ? path : `/${path}`, query: new URLSearchParams(search) };
}

let current = typeof window === 'undefined' ? { path: '/', query: new URLSearchParams() } : parse();
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    current = parse();
    listeners.forEach((l) => l());
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useLocation(): Location {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const hash = `#${to.startsWith('/') ? to : `/${to}`}`;
  if (window.location.hash === hash) return;
  if (opts.replace) {
    history.replaceState(history.state, '', hash);
    current = parse();
    listeners.forEach((l) => l());
  } else {
    window.location.hash = hash;
  }
}

/** Aktualisiert Query-Parameter, ohne einen neuen Verlaufseintrag anzulegen. */
export function setQuery(patch: Record<string, string | null>) {
  const { path, query } = parse();
  const next = new URLSearchParams(query);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === '') next.delete(k);
    else next.set(k, v);
  }
  const qs = next.toString();
  navigate(qs ? `${path}?${qs}` : path, { replace: true });
}

/** Prüft ein Muster wie "/faecher/:id" und liefert Parameter. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a
      href={`#${to}`}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    />
  );
}
