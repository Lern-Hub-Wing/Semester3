import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../lib/config';

/**
 * Eigener Supabase-Client für den Admin-Bereich: Sitzung nur in diesem Tab
 * (sessionStorage), getrennt von einer normalen App-Anmeldung im selben Browser.
 */
let client: SupabaseClient | null = null;
export function adminDb(): SupabaseClient {
  client ??= createClient(config.supabaseUrl, config.supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'studyspace-admin-auth',
      storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
    },
  });
  return client;
}

/** Aufruf der Edge Function admin-auth (Benutzername statt E-Mail, Ersteinrichtung). */
export async function adminAuth<T>(body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.supabaseUrl}/functions/v1/admin-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.supabaseKey, Authorization: `Bearer ${config.supabaseKey}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Der Anmeldedienst ist nicht erreichbar (Edge Function „admin-auth“ bereitgestellt?).');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? (res.status === 404 ? 'Edge Function „admin-auth“ ist noch nicht bereitgestellt.' : `Fehler ${res.status}`));
  return data as T;
}

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await adminDb().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export interface Stats {
  users_total: number;
  users_active_7d: number;
  users_online_approx: number;
  users_new_7d: number;
  users_new_30d: number;
  users_blocked: number;
  users_free: number;
  users_plus_member: number;
  groups_total: number;
  groups_plus: number;
  trials_active: number;
  subscriptions_paid_active: number;
  semester_passes_active: number;
  grants_active: number;
  expired_30d: number;
  cancellations_30d: number;
  revenue_cents_total: number;
  revenue_cents_30d: number;
  mrr_cents: number;
  payments_connected: boolean;
  signups_by_day: { day: string; count: number }[];
  db_time: string;
}

export interface AdminUser {
  id: string;
  email: string | null;
  display_name: string | null;
  status: 'active' | 'blocked';
  plan: string;
  created_at: string;
  last_sign_in_at: string | null;
  last_seen_at: string | null;
  online: boolean;
  groups: { id: string; name: string; role: string }[];
  is_admin: boolean;
  total: number;
}

export interface AdminGroup {
  id: string;
  name: string;
  owner_id: string | null;
  owner_email: string | null;
  members: number;
  has_plus: boolean;
  plus_until: string | null;
  homework: number;
  study_entries: number;
  created_at: string;
  total: number;
}

export interface Entitlement {
  id: string;
  plan: string;
  source: string;
  starts_at: string;
  ends_at: string | null;
  revoked_at: string | null;
  note: string | null;
  active: boolean;
}

export const PLAN_LABEL: Record<string, string> = {
  free: 'Free',
  plus_member: 'Plus über Gruppe',
  plus_grant: 'Plus (Freischaltung)',
  plus_monthly: 'Plus monatlich',
  semester_pass: 'Semesterpass',
};

export const SOURCE_LABEL: Record<string, string> = { admin: 'Admin (kostenlos)', stripe: 'Stripe', app_store: 'App Store', play_store: 'Google Play' };

export function fmtDate(v: string | null | undefined, time = false): string {
  if (!v) return '–';
  const d = new Date(v);
  return d.toLocaleString('de-DE', time ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function euro(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
