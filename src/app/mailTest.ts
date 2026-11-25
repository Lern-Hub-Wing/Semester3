import type { SupabaseClient } from '@supabase/supabase-js';
import { config } from '../lib/config';

/**
 * Test-E-Mail „Dein Anmeldecode“ über das eigene Gmail-Konto (Edge Function app-mail-test).
 * Admins dürfen an jede Adresse senden, alle anderen nur an die eigene.
 */
export async function sendTestMail(client: SupabaseClient, to: string): Promise<string> {
  const { data } = await client.auth.getSession();
  if (!data.session) throw new Error('Bitte erneut anmelden.');
  let res: Response;
  try {
    res = await fetch(`${config.supabaseUrl}/functions/v1/app-mail-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.supabaseKey, Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ to: to.trim() }),
    });
  } catch {
    throw new Error('Keine Verbindung zum Server.');
  }
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; to?: string; error?: string };
  if (!res.ok || !body.ok) throw new Error(body.error ?? (res.status === 404 ? 'Die Funktion „app-mail-test“ ist noch nicht bereitgestellt.' : `Fehler ${res.status}`));
  return body.to ?? to;
}
