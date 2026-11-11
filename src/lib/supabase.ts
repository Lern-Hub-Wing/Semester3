import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';
import { IS_APP } from './edition';
import { authStorage } from '../app/authStorage';

let client: SupabaseClient | null = null;

/**
 * Supabase-Client mit dem öffentlichen Publishable Key.
 * Bisherige Seite: keine Anmeldung – Sitzungen werden weder angelegt noch gespeichert.
 * Neue App: echte Konten (Supabase Auth, PKCE), Sitzung wird automatisch erneuert.
 */
export function getSupabase(): SupabaseClient {
  if (!config.isConfigured) throw new Error('Supabase ist nicht konfiguriert.');
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseKey, {
      auth: IS_APP
        ? { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storage: authStorage, storageKey: 'studyspace-app-auth' }
        : { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 20 } },
      global: { headers: { 'x-application-name': 'studyspace' } },
    });
  }
  return client;
}

export function publicFileUrl(storagePath: string): string {
  return getSupabase().storage.from(config.storageBucket).getPublicUrl(storagePath).data.publicUrl;
}
