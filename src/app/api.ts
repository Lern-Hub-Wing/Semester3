/**
 * Konto-, Gruppen- und Tarif-Logik der App als reine Funktionen über einem
 * Supabase-Client – ohne React/DOM, damit eine spätere Expo-App sie direkt
 * wiederverwenden kann. Alle Regeln (Plus, 8 Mitglieder, Kontingente, Rechte)
 * prüft die Datenbank; hier wird nur aufgerufen und übersetzt.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type PlanId = 'free' | 'plus_monthly' | 'semester_pass';

/** Tarife – Anzeige. Freischaltung erfolgt ausschließlich serverseitig. */
export const PLANS: { id: PlanId; name: string; price: string; period: string; points: string[] }[] = [
  { id: 'free', name: 'Free', price: '0 €', period: 'kostenlos', points: ['Lerngruppen per Einladung beitreten', 'Fokus-Timer und eigene Statistik'] },
  {
    id: 'plus_monthly',
    name: 'Plus',
    price: '4,99 €',
    period: 'pro Monat',
    points: ['Eigene Lerngruppe mit bis zu 8 Personen', 'Gemeinsamer Lernplan, Prüfungen und Hausaufgaben', 'Monatlich kündbar'],
  },
  {
    id: 'semester_pass',
    name: 'Semesterpass',
    price: '19,99 €',
    period: 'für 6 Monate',
    points: ['Alles aus Plus für ein ganzes Semester', 'Einmalzahlung – verlängert sich nicht automatisch'],
  },
];

/** Grenzen pro Plus-Gruppe – identisch mit der Datenbank (0001_tenancy.sql). */
export const GROUP_LIMITS = { members: 8, homework: 50, studyEntries: 100, documents: 0 } as const;

export interface GroupInfo {
  id: string;
  name: string;
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
  has_plus: boolean;
  plus_until: string | null;
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

/** Plus-Zustand einer Gruppe in Worten. */
export function plusLabel(g: Pick<GroupInfo, 'has_plus' | 'plus_until'>, now = new Date()): string {
  if (!g.has_plus) return 'Kein Plus';
  if (!g.plus_until) return 'Plus aktiv';
  const days = Math.ceil((new Date(g.plus_until).getTime() - now.getTime()) / 86_400_000);
  const date = new Date(g.plus_until).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  return days <= 7 ? `Plus endet in ${days} ${days === 1 ? 'Tag' : 'Tagen'}` : `Plus bis ${date}`;
}

/** Mindestanforderung an Passwörter (Supabase prüft zusätzlich serverseitig). */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return 'Mindestens 10 Zeichen.';
  if (!/[A-Za-zÄÖÜäöüß]/.test(pw) || !/[0-9]/.test(pw)) return 'Buchstaben und mindestens eine Ziffer verwenden.';
  return null;
}
