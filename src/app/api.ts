/**
 * Konto-, Gruppen- und Tarif-Logik der App als reine Funktionen über einem
 * Supabase-Client – ohne React/DOM, damit eine spätere Expo-App sie direkt
 * wiederverwenden kann. Alle Regeln (Plus, 8 Mitglieder, Kontingente, Rechte)
 * prüft die Datenbank; hier wird nur aufgerufen und übersetzt.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type PaidPlan = 'solo_monthly' | 'solo_semester' | 'group_monthly' | 'group_semester';
export type PlanId = PaidPlan | 'trial' | 'solo_grant' | 'plus_grant' | 'plus_monthly' | 'semester_pass';

export interface PlanOffer {
  id: PaidPlan;
  tier: 'solo' | 'group';
  period: 'monthly' | 'semester';
  price: string;
  cents: number;
  per: string;
  note: string;
}

/** Preise – identisch mit app.plan_price_cents() in der Datenbank. */
export const OFFERS: Record<PaidPlan, PlanOffer> = {
  solo_monthly: { id: 'solo_monthly', tier: 'solo', period: 'monthly', price: '2,49 €', cents: 249, per: '/ Monat', note: 'verlängert sich monatlich, jederzeit kündbar' },
  solo_semester: { id: 'solo_semester', tier: 'solo', period: 'semester', price: '11,99 €', cents: 1199, per: 'für 6 Monate', note: 'endet nach 6 Monaten automatisch' },
  group_monthly: { id: 'group_monthly', tier: 'group', period: 'monthly', price: '4,99 €', cents: 499, per: '/ Monat', note: 'verlängert sich monatlich, jederzeit kündbar' },
  group_semester: { id: 'group_semester', tier: 'group', period: 'semester', price: '24,99 €', cents: 2499, per: 'für 6 Monate', note: 'endet nach 6 Monaten automatisch' },
};

/** Die drei Zugangsmodelle für die Anzeige. */
export const TIERS = [
  {
    id: 'free' as const,
    name: 'Free / Testversion',
    price: '0 €',
    per: '14 Tage',
    points: ['14 Tage voller Solo-Zugriff, ohne Zahlungsdaten', 'Danach bleibt alles sichtbar, nur Bearbeiten ist gesperrt', 'Beitritt zu einer bezahlten Gruppe bleibt kostenlos'],
  },
  {
    id: 'solo' as const,
    name: 'StudySpace Solo',
    price: '2,49 €',
    per: '/ Monat',
    alt: '11,99 € für 6 Monate',
    points: ['Persönlicher Lernplan und Hausaufgaben', 'Prüfungen, Fokusmodus und Statistiken', 'Auf allen Geräten synchron'],
  },
  {
    id: 'group' as const,
    name: 'StudySpace Gruppe',
    price: '4,99 €',
    per: '/ Monat',
    alt: '24,99 € für 6 Monate',
    points: ['Alle Solo-Funktionen', 'Gemeinsamer Lernplan, Gruppenfortschritt, gemeinsame Ziele', 'Bis zu 8 Lernende – nur eine Person bezahlt'],
  },
];

export const PLAN_NAMES: Record<string, string> = {
  trial: 'Testphase',
  solo_monthly: 'Solo monatlich',
  solo_semester: 'Solo · 6 Monate',
  group_monthly: 'Gruppe monatlich',
  group_semester: 'Gruppe · 6 Monate',
  solo_grant: 'Solo (Freischaltung)',
  plus_grant: 'Gruppe (Freischaltung)',
  plus_monthly: 'Gruppe monatlich',
  semester_pass: 'Gruppe · Semesterpass',
};

/** Grenzen pro Plus-Gruppe – identisch mit der Datenbank (0001_tenancy.sql). */
export const GROUP_LIMITS = { members: 8, homework: 50, studyEntries: 100, documents: 0 } as const;

export interface GroupInfo {
  id: string;
  name: string;
  /** 'solo' = eigener Lernbereich, 'team' = Lerngruppe */
  kind: 'solo' | 'team';
  role: 'owner' | 'member';
  is_owner: boolean;
  has_plus: boolean;
  /** null = ohne Ablauf; '-infinity' = kein Plus */
  plus_until: string | null;
  members: number;
  /** nur für Inhaber */
  invite_code: string | null;
}

export interface Me {
  user_id: string;
  status: 'active' | 'blocked';
  session_ok: boolean;
  display_name: string | null;
  active_group_id: string | null;
  member_id: string | null;
  /** 'group' = Gruppenpass, 'solo' = Solo/Testphase, null = kein Tarif */
  level: 'group' | 'solo' | null;
  /** darf Lerngruppen erstellen (Gruppenpass) */
  has_plus: boolean;
  plan: PlanId | null;
  plan_source: string | null;
  plan_id: string | null;
  plan_until: string | null;
  plus_until: string | null;
  auto_renew: boolean;
  trial_used: boolean;
  trial_ends_at: string | null;
  beta_purchases: boolean;
  tutorial_done: boolean;
  is_admin: boolean;
  groups: GroupInfo[];
}

export interface Usage {
  homework: number;
  homework_max: number;
  study_entries: number;
  study_entries_max: number;
  members: number;
  members_max: number;
  documents_max: number;
}

export interface GroupMember {
  user_id: string;
  member_id: string;
  role: 'owner' | 'member';
  name: string;
  color: string;
}

async function rpc<T>(sb: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const api = {
  me: (sb: SupabaseClient) => rpc<Me | null>(sb, 'app_me'),
  touch: (sb: SupabaseClient) => rpc<void>(sb, 'app_touch'),
  usage: (sb: SupabaseClient) => rpc<Usage | null>(sb, 'app_usage'),
  setDisplayName: (sb: SupabaseClient, name: string) => rpc<void>(sb, 'app_set_display_name', { p_name: name }),
  createGroup: (sb: SupabaseClient, name: string, displayName?: string) => rpc<string>(sb, 'app_create_group', { p_name: name, p_display_name: displayName ?? null }),
  joinGroup: (sb: SupabaseClient, code: string, displayName?: string) => rpc<string>(sb, 'app_join_group', { p_code: normalizeCode(code), p_display_name: displayName ?? null }),
  inviteInfo: (sb: SupabaseClient, code: string) => rpc<{ name: string; members: number; has_plus: boolean } | null>(sb, 'app_invite_info', { p_code: normalizeCode(code) }),
  switchGroup: (sb: SupabaseClient, groupId: string) => rpc<void>(sb, 'app_switch_group', { p_group: groupId }),
  leaveGroup: (sb: SupabaseClient, groupId: string) => rpc<void>(sb, 'app_leave_group', { p_group: groupId }),
  removeMember: (sb: SupabaseClient, groupId: string, userId: string) => rpc<void>(sb, 'app_remove_member', { p_group: groupId, p_user: userId }),
  regenerateInvite: (sb: SupabaseClient, groupId: string) => rpc<string>(sb, 'app_regenerate_invite', { p_group: groupId }),
  renameGroup: (sb: SupabaseClient, groupId: string, name: string) => rpc<void>(sb, 'app_rename_group', { p_group: groupId, p_name: name }),
  deleteGroup: (sb: SupabaseClient, groupId: string, confirmName: string) => rpc<void>(sb, 'app_delete_group', { p_group: groupId, p_confirm_name: confirmName }),
  deleteAccount: (sb: SupabaseClient, confirm: string) => rpc<void>(sb, 'app_delete_my_account', { p_confirm: confirm }),
  startTrial: (sb: SupabaseClient) => rpc<string>(sb, 'app_start_trial'),
  openSolo: (sb: SupabaseClient) => rpc<string>(sb, 'app_open_solo'),
  /** Beta: Kauf wird nur simuliert – der Server entscheidet, ob das erlaubt ist */
  betaPurchase: (sb: SupabaseClient, plan: PaidPlan) => rpc<{ entitlement_id: string; ends_at: string; group_id: string | null }>(sb, 'app_beta_purchase', { p_plan: plan }),
  betaCancel: (sb: SupabaseClient, entitlementId: string) => rpc<void>(sb, 'app_beta_cancel', { p_entitlement: entitlementId }),
  tutorialDone: (sb: SupabaseClient) => rpc<void>(sb, 'app_tutorial_done'),
  async groupMembers(sb: SupabaseClient, groupId: string): Promise<GroupMember[]> {
    const { data, error } = await sb
      .from('group_members')
      .select('user_id, member_id, role, members!inner(name, color)')
      .eq('group_id', groupId)
      .is('left_at', null)
      .order('joined_at');
    if (error) throw error;
    return (data ?? []).map((r) => {
      const m = (Array.isArray(r.members) ? r.members[0] : r.members) as { name: string; color: string };
      return { user_id: r.user_id as string, member_id: r.member_id as string, role: r.role as 'owner' | 'member', name: m?.name ?? '', color: m?.color ?? '#AFC5F5' };
    });
  },
};

/** Einladungscodes: 8 Zeichen ohne verwechselbare Zeichen (0/O, 1/I). */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

export function isValidCode(code: string): boolean {
  return /^[A-HJ-NP-Z2-9]{8}$/.test(normalizeCode(code));
}

/** Code aus Text, Link oder „#/beitreten/CODE“ herauslösen. */
export function extractInviteCode(text: string): string | null {
  // Frei im Text nur in Großbuchstaben (sonst würden normale Wörter wie „lernplan“ passen)
  const m = text.match(/beitreten\/([A-Za-z0-9-]{8,10})/) ?? text.match(/\b([A-HJ-NP-Z2-9]{4}-?[A-HJ-NP-Z2-9]{4})\b/);
  if (!m) return null;
  const code = normalizeCode(m[1]);
  return isValidCode(code) ? code : null;
}

export function formatCode(code: string): string {
  const c = normalizeCode(code);
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** Restliche Tage bis zu einem Zeitpunkt (aufgerundet, nie negativ). */
export function daysLeft(until: string | null, now = new Date()): number | null {
  if (!until) return null;
  return Math.max(0, Math.ceil((new Date(until).getTime() - now.getTime()) / 86_400_000));
}

/** Zugang einer Gruppe bzw. des Lernbereichs in Worten. */
export function plusLabel(g: Pick<GroupInfo, 'has_plus' | 'plus_until'> & { kind?: GroupInfo['kind'] }, now = new Date()): string {
  const what = g.kind === 'solo' ? 'Zugang' : 'Gruppenpass';
  if (!g.has_plus) return g.kind === 'solo' ? 'Nur lesen' : 'Kein Gruppenpass';
  if (!g.plus_until) return `${what} aktiv`;
  const days = daysLeft(g.plus_until, now) ?? 0;
  const date = new Date(g.plus_until).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  return days <= 7 ? `${what} endet in ${days} ${days === 1 ? 'Tag' : 'Tagen'}` : `${what} bis ${date}`;
}

/** Eigener Tarif in Worten (für Einstellungen und Profilkarte). */
export function myPlanLabel(me: Pick<Me, 'plan' | 'plan_until' | 'trial_used' | 'level'>, now = new Date()): string {
  if (!me.plan) return me.trial_used ? 'Testphase beendet' : 'Free';
  const name = PLAN_NAMES[me.plan] ?? me.plan;
  if (me.plan === 'trial') {
    const d = daysLeft(me.plan_until, now) ?? 0;
    return `Testphase · noch ${d} ${d === 1 ? 'Tag' : 'Tage'}`;
  }
  return name;
}

/** Mindestanforderung an Passwörter (Supabase prüft zusätzlich serverseitig). */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return 'Mindestens 10 Zeichen.';
  if (!/[A-Za-zÄÖÜäöüß]/.test(pw) || !/[0-9]/.test(pw)) return 'Buchstaben und mindestens eine Ziffer verwenden.';
  return null;
}
