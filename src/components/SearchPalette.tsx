import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IS_APP } from '../lib/edition';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, CalendarDays, FileText, Layers, ListChecks, Search } from 'lucide-react';
import { navigate } from '../lib/router';
import { formatISODate } from '../lib/time';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import { useHotkey } from '../hooks/useHotkey';
import { PresenceContainer } from './ui/PresenceDiv';

interface Result {
  id: string;
  kind: 'Modul' | 'Thema' | 'Lerntag' | 'Aufgabe' | 'Material';
  title: string;
  meta: string;
  color?: string;
  go: () => void;
}

const norm = (s: string) => s.toLocaleLowerCase('de').normalize('NFD').replace(/[̀-ͯ]/g, '');

const ICONS = { Modul: BookOpen, Thema: Layers, Lerntag: CalendarDays, Aufgabe: ListChecks, Material: FileText };

/** Globale Suche (⌘K / Strg+K) über Module, Themen, Lerntage, Aufgaben und Materialien. */
export function SearchPalette() {
  const open = useUI((s) => s.searchOpen);
  const setUI = useUI((s) => s.set);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const data = useData();

  const toggle = useCallback(() => setUI({ searchOpen: !useUI.getState().searchOpen }), [setUI]);
  useHotkey('mod+k', toggle);
  useHotkey('/', () => setUI({ searchOpen: true }));

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const close = () => setUI({ searchOpen: false });

  const results = useMemo<Result[]>(() => {
    const term = norm(q.trim());
    if (term.length < 2) return [];
    const hit = (...fields: (string | null | undefined)[]) => fields.some((f) => f && norm(f).includes(term));
    const out: Result[] = [];
    const modules = data.modules;
    for (const m of Object.values(modules)) {
      if (m.archived_at || !hit(m.name, m.description)) continue;
      out.push({ id: m.id, kind: 'Modul', title: m.name, meta: 'Prüfungsmodul', color: m.color, go: () => navigate(`/faecher/${m.id}`) });
    }
    for (const t of Object.values(data.module_topics)) {
      const m = modules[t.module_id];
      if (t.archived_at || !m || m.archived_at || !hit(t.title, t.description)) continue;
      out.push({ id: t.id, kind: 'Thema', title: t.title, meta: m.name, color: m.color, go: () => navigate(`/faecher/${m.id}`) });
    }
    for (const e of Object.values(data.study_entries)) {
      const m = modules[e.module_id];
      if (e.deleted_at || !m || m.archived_at || !hit(e.title, e.description)) continue;
      out.push({
        id: e.id,
        kind: 'Lerntag',
        title: e.title,
        meta: `${m.name} · ${formatISODate(e.study_date, { day: 'numeric', month: 'short' })}`,
        color: m.color,
        go: () => navigate(`/lernplan?ansicht=tag&datum=${e.study_date}`),
      });
    }
    for (const t of Object.values(data.tasks)) {
      const e = data.study_entries[t.study_entry_id];
      const m = e && modules[e.module_id];
      if (t.deleted_at || !e || e.deleted_at || !m || m.archived_at || !hit(t.title, t.description)) continue;
      out.push({
        id: t.id,
        kind: 'Aufgabe',
        title: t.title,
        meta: `${e.title} · ${formatISODate(e.study_date, { day: 'numeric', month: 'short' })}`,
        color: m.color,
        go: () => navigate(`/lernplan?ansicht=tag&datum=${e.study_date}`),
      });
    }
    for (const a of Object.values(data.attachments)) {
      if (a.deleted_at || !hit(a.original_filename)) continue;
      const m = a.module_id ? modules[a.module_id] : undefined;
      out.push({ id: a.id, kind: 'Material', title: a.original_filename, meta: m?.name ?? 'Material', color: m?.color, go: () => setUI({ previewId: a.id }) });
    }
    return out.slice(0, 40);
  }, [q, data, setUI]);

  const choose = (r: Result) => {
    close();
    r.go();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <PresenceContainer className="fixed inset-0 z-[70] flex items-start justify-center px-3 pt-[max(env(safe-area-inset-top),12px)] md:pt-[12vh]">
          <motion.div className="absolute inset-0 bg-[rgba(8,12,20,0.35)] backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Suche"
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="glass glass-strong relative w-full max-w-xl overflow-hidden rounded-[24px]"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-5 shrink-0 text-muted" aria-hidden />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') close();
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActive((a) => Math.min(a + 1, results.length - 1));
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActive((a) => Math.max(a - 1, 0));
                  }
                  if (e.key === 'Enter' && results[active]) choose(results[active]);
                }}
                placeholder={IS_APP ? 'Fächer, Themen, Aufgaben, Hausaufgaben …' : 'Module, Themen, Aufgaben, Materialien …'}
                aria-label="Suchbegriff"
                aria-controls="ss-search-results"
                aria-activedescendant={results[active] ? `ss-r-${results[active].id}` : undefined}
                className="h-14 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint"
              />
              <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 text-[11px] text-muted md:block">Esc</kbd>
            </div>
            <ul id="ss-search-results" role="listbox" className="scroll-thin max-h-[60dvh] overflow-y-auto p-2">
              {q.trim().length < 2 ? (
                <li className="px-3 py-6 text-center text-sm text-muted">Mindestens zwei Zeichen eingeben.</li>
              ) : results.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted">Keine Treffer für „{q}“.</li>
              ) : (
                results.map((r, i) => {
                  const Icon = ICONS[r.kind];
                  return (
                    <li key={`${r.kind}-${r.id}`} id={`ss-r-${r.id}`} role="option" aria-selected={i === active}>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(i)}
                        onClick={() => choose(r)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${i === active ? 'lens' : ''}`}
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: r.color ? `color-mix(in srgb, ${r.color} 30%, transparent)` : 'var(--ss-track)' }}>
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{r.title}</span>
                          <span className="block truncate text-xs text-muted">
                            {r.kind} · {r.meta}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </motion.div>
        </PresenceContainer>
      )}
    </AnimatePresence>,
    document.body,
  );
}
