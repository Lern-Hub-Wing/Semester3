/**
 * Zentrale Farben für Symbolhintergründe (Listen, Menüs, Auswahlkarten).
 * Jeder Bereich hat überall dieselbe Farbe – z. B. Fächer immer Violett,
 * Lerngruppe immer Grün. Nicht im Code verstreut Hex-Werte verwenden.
 */
export const TINT = {
  violet: '#7C6FF0',
  indigo: '#6F7BF7',
  blue: '#3D8BE0',
  teal: '#2FA58B',
  pink: '#E0559A',
  orange: '#F08A24',
  purple: '#B57BF0',
  red: '#E5484D',
  slate: '#7A8499',
  gray: '#8E8E93',
} as const;

/** Bereich → Farbe (eine Quelle für Mehr-Menü, Einstellungen und Startauswahl) */
export const AREA_TINT = {
  focus: TINT.indigo,
  studyMode: TINT.slate,
  search: TINT.indigo,
  subjects: TINT.violet,
  plan: TINT.blue,
  homework: TINT.orange,
  team: TINT.teal,
  group: TINT.teal,
  join: TINT.teal,
  solo: TINT.indigo,
  stats: TINT.orange,
  music: TINT.pink,
  account: TINT.indigo,
  plan_billing: TINT.purple,
  appearance: TINT.violet,
  notifications: TINT.red,
  export: TINT.blue,
  trash: TINT.red,
  history: TINT.slate,
  help: TINT.teal,
  info: TINT.gray,
  settings: TINT.gray,
} as const;
