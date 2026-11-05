/** Laufzeitkonfiguration aus den Vite-Umgebungsvariablen. */

declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
const maxUploadMb = Number(import.meta.env.VITE_MAX_UPLOAD_MB ?? 10);

export const config = {
  supabaseUrl: url,
  supabaseKey: key,
  isConfigured: /^https?:\/\//.test(url) && key.length > 20 && !url.includes('DEIN-PROJEKT'),
  /** Ein Secret-/Service-Key im Frontend wäre ein schwerer Fehler – wir verweigern dann den Start. */
  usesForbiddenKey: key.startsWith('sb_secret_') || looksLikeServiceRoleJwt(key),
  maxUploadBytes: (Number.isFinite(maxUploadMb) && maxUploadMb > 0 ? maxUploadMb : 10) * 1024 * 1024,
  storageBucket: 'materials',
  version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',
  buildTime: typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '',
};

function looksLikeServiceRoleJwt(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'] as const;
export const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp'] as const;

/** Textgrenzen – identisch mit den Check-Constraints der Datenbank. */
export const LIMITS = {
  memberName: 40,
  moduleName: 80,
  topicTitle: 120,
  entryTitle: 160,
  taskTitle: 200,
  description: 2000,
  entryDescription: 4000,
  location: 200,
  appName: 40,
} as const;
