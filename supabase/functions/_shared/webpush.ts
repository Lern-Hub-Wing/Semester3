/**
 * Web Push ohne Fremdbibliothek – nur WebCrypto (läuft in Deno/Supabase
 * Edge Functions und in Node ≥ 20 für die Tests).
 *
 *  – Verschlüsselung: RFC 8291 (Message Encryption for Web Push), aes128gcm (RFC 8188)
 *  – Absenderausweis: RFC 8292 (VAPID), JWT mit ES256
 *
 * Der private VAPID-Schlüssel wird ausschließlich serverseitig (Secret der
 * Edge Function) verwendet und verlässt den Server nie.
 */

const enc = new TextEncoder();

export function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(input: string): Uint8Array {
  const s = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** HKDF (Extract + Expand) mit SHA-256 */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource }, key, length * 8);
  return new Uint8Array(bits);
}

export interface VapidKeys {
  /** Öffentlicher Schlüssel, base64url, 65 Byte unkomprimiert (wie von `web-push generate-vapid-keys`) */
  publicKey: string;
  /** Privater Schlüssel, base64url, 32 Byte */
  privateKey: string;
  /** Kontakt, z. B. "mailto:lerngruppe@example.org" */
  subject: string;
}

export function validateVapidKeys(keys: VapidKeys): string | null {
  try {
    if (b64urlDecode(keys.publicKey).length !== 65) return 'VAPID_PUBLIC_KEY hat nicht die erwartete Länge (65 Byte).';
    if (b64urlDecode(keys.privateKey).length !== 32) return 'VAPID_PRIVATE_KEY hat nicht die erwartete Länge (32 Byte).';
  } catch {
    return 'VAPID-Schlüssel sind kein gültiges base64url.';
  }
  if (!/^(mailto:|https:\/\/)/.test(keys.subject)) return 'VAPID_SUBJECT muss mit „mailto:“ oder „https://“ beginnen.';
  return null;
}

async function importVapidPrivateKey(keys: VapidKeys): Promise<CryptoKey> {
  const pub = b64urlDecode(keys.publicKey);
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: keys.privateKey.replace(/=+$/, ''),
    x: b64urlEncode(pub.slice(1, 33)),
    y: b64urlEncode(pub.slice(33, 65)),
    ext: true,
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** VAPID-JWT (ES256) für den Ursprung des Push-Dienstes */
export async function vapidJwt(endpoint: string, keys: VapidKeys, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64urlEncode(enc.encode(JSON.stringify({ aud, exp: nowSec + 12 * 3600, sub: keys.subject })));
  const unsigned = `${header}.${payload}`;
  const key = await importVapidPrivateKey(keys);
  // WebCrypto liefert die Signatur bereits im JWT-Format (r || s, je 32 Byte)
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)));
  return `${unsigned}.${b64urlEncode(sig)}`;
}

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Verschlüsselt den Inhalt nach RFC 8291 (aes128gcm, ein Datensatz). */
export async function encryptPayload(sub: PushSubscriptionKeys, plaintext: Uint8Array, opts: { salt?: Uint8Array; serverKeys?: CryptoKeyPair } = {}): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(sub.p256dh);
  const authSecret = b64urlDecode(sub.auth);
  if (uaPublic.length !== 65) throw new Error('p256dh ungültig');
  if (authSecret.length !== 16) throw new Error('auth ungültig');

  const serverKeys = opts.serverKeys ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, serverKeys.privateKey, 256));

  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  // Ein einziger Datensatz: Inhalt + Trennbyte 0x02 (letzter Datensatz)
  const padded = concat(plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, aesKey, padded as BufferSource));

  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

export interface PushMessage {
  title: string;
  body: string;
  /** Ziel innerhalb der App, z. B. "#/lernplan?ansicht=tag&datum=2026-12-01" */
  url?: string;
  tag?: string;
  /** Zahl für das App-Symbol (Badging API), wenn unterstützt */
  badge?: number | null;
}

export interface SendOptions {
  /** Wie lange der Push-Dienst die Nachricht vorhält (Sekunden) */
  ttl?: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
  /** Ersetzt eine noch nicht zugestellte Nachricht mit demselben Thema */
  topic?: string;
}

export interface SendResult {
  ok: boolean;
  status: number;
  /** Abo ist abgelaufen/abgemeldet → Gerät entfernen */
  gone: boolean;
  error?: string;
}

/** Hosts der großen Push-Dienste – verhindert, dass der Server beliebige URLs aufruft. */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false;
  const h = url.hostname.toLowerCase();
  return (
    h === 'fcm.googleapis.com' ||
    h === 'android.googleapis.com' ||
    h === 'updates.push.services.mozilla.com' ||
    h === 'push.services.mozilla.com' ||
    h === 'web.push.apple.com' ||
    h.endsWith('.push.apple.com') ||
    h.endsWith('.notify.windows.com')
  );
}

export async function sendPush(sub: PushSubscriptionKeys, message: PushMessage, keys: VapidKeys, opts: SendOptions = {}): Promise<SendResult> {
  if (!isAllowedPushEndpoint(sub.endpoint)) return { ok: false, status: 0, gone: true, error: 'Unbekannter Push-Dienst' };
  const payload = enc.encode(JSON.stringify(message));
  if (payload.length > 3000) return { ok: false, status: 0, gone: false, error: 'Nachricht zu groß' };
  const body = await encryptPayload(sub, payload);
  const jwt = await vapidJwt(sub.endpoint, keys);
  const headers: Record<string, string> = {
    Authorization: `vapid t=${jwt}, k=${keys.publicKey.replace(/=+$/, '')}`,
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(Math.max(0, Math.round(opts.ttl ?? 6 * 3600))),
    Urgency: opts.urgency ?? 'normal',
  };
  if (opts.topic) headers.Topic = opts.topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  try {
    const res = await fetch(sub.endpoint, { method: 'POST', headers, body: body as BodyInit });
    const ok = res.status >= 200 && res.status < 300;
    const gone = res.status === 404 || res.status === 410;
    let error: string | undefined;
    if (!ok) error = `${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`.trim();
    return { ok, status: res.status, gone, error };
  } catch (err) {
    return { ok: false, status: 0, gone: false, error: String(err).slice(0, 200) };
  }
}

/** SHA-256 als Hex – für Gerätetokens (nur der Hash wird gespeichert) */
export async function sha256Hex(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}
