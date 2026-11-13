/**
 * Text der Mitteilung „neue Hausaufgabe“ – gemeinsam für die bisherige
 * Seite (push-scheduler) und die App (app-push). Ohne Abhängigkeiten außer
 * den Datumshilfen, damit es in Deno und in Vitest läuft.
 */
import { diffDays, formatDateShort } from './berlin.ts';

export interface NewHomework {
  id: string;
  title: string;
  moduleName: string | null;
  /** YYYY-MM-DD */
  dueDate: string;
  actorName: string | null;
}

/** „heute“, „morgen“ oder „zum Do., 17. Dez.“ */
export function dueLabel(dueDate: string, today: string): string {
  const d = diffDays(today, dueDate);
  if (d === 0) return 'heute';
  if (d === 1) return `morgen (${formatDateShort(dueDate)})`;
  return `zum ${formatDateShort(dueDate)}`;
}

function quote(title: string): string {
  const t = title.trim();
  return `„${t.length > 80 ? `${t.slice(0, 77)}…` : t}“`;
}

/**
 * Eine Mitteilung für eine oder mehrere neue Hausaufgaben.
 *  1 Aufgabe:  „Luk hat eine Hausaufgabe hinzugefügt“ – „Übungsblatt 3“ in Controlling · bis zum Do., 17. Dez.
 *  mehrere:    „Luk hat 3 Hausaufgaben hinzugefügt“ – „A“ bis heute, „B“ bis zum … und 1 weitere
 */
export function homeworkMessage(items: NewHomework[], today: string): { title: string; body: string } {
  const actors = [...new Set(items.map((i) => i.actorName?.trim()).filter((n): n is string => !!n))];
  const who = actors.length === 1 && items.every((i) => i.actorName?.trim() === actors[0]) ? actors[0] : null;
  if (items.length === 1) {
    const h = items[0];
    return {
      title: who ? `${who} hat eine Hausaufgabe hinzugefügt` : 'Neue Hausaufgabe',
      body: `${quote(h.title)}${h.moduleName ? ` in ${h.moduleName}` : ''} – bis ${dueLabel(h.dueDate, today)}`,
    };
  }
  const sorted = [...items].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const shown = sorted.slice(0, 2).map((h) => `${quote(h.title)} bis ${dueLabel(h.dueDate, today)}`);
  const rest = sorted.length - shown.length;
  return {
    title: who ? `${who} hat ${items.length} Hausaufgaben hinzugefügt` : `${items.length} neue Hausaufgaben`,
    body: shown.join(', ') + (rest > 0 ? ` und ${rest} weitere` : ''),
  };
}
