import { describe, expect, it } from 'vitest';
import { b64urlDecode, b64urlEncode, encryptPayload, isAllowedPushEndpoint, vapidJwt, validateVapidKeys, sha256Hex } from '../../supabase/functions/_shared/webpush.ts';

const enc = new TextEncoder();

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource }, key, len * 8));
}

/** Empfängerseite (Browser) nach RFC 8291 – zum Prüfen der Verschlüsselung */
async function decrypt(body: Uint8Array, ua: CryptoKeyPair, uaPublic: Uint8Array, auth: Uint8Array) {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPublic, ...asPublic]);
  const ikm = await hkdf(auth, ecdh, info, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, key, cipher));
  return { rs, idlen, plain };
}

async function makeSubscription() {
  const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { ua, uaPublic, auth, sub: { endpoint: 'https://web.push.apple.com/QGuQyavXut', p256dh: b64urlEncode(uaPublic), auth: b64urlEncode(auth) } };
}

async function makeVapid() {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  return { kp, keys: { publicKey: b64urlEncode(pub), privateKey: jwk.d!, subject: 'mailto:test@example.org' } };
}

describe('Web Push (RFC 8291 / 8292)', () => {
  it('base64url ist umkehrbar', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(65));
    expect([...b64urlDecode(b64urlEncode(bytes))]).toEqual([...bytes]);
    expect(b64urlEncode(bytes)).not.toMatch(/[+/=]/);
  });

  it('verschlüsselt so, dass der Browser die Nachricht entschlüsseln kann', async () => {
    const { ua, uaPublic, auth, sub } = await makeSubscription();
    const message = JSON.stringify({ title: 'StudySpace funktioniert! 🎉', body: 'Test', url: '#/einstellungen' });
    const body = await encryptPayload(sub, enc.encode(message));
    const { rs, idlen, plain } = await decrypt(body, ua, uaPublic, auth);
    expect(rs).toBe(4096);
    expect(idlen).toBe(65);
    expect(plain[plain.length - 1]).toBe(2); // Trennbyte „letzter Datensatz“
    expect(new TextDecoder().decode(plain.slice(0, -1))).toBe(message);
  });

  it('entspricht exakt dem Beispiel aus RFC 8291, Abschnitt 5', async () => {
    const asPub = b64urlDecode('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
    const jwk = { kty: 'EC', crv: 'P-256', d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', x: b64urlEncode(asPub.slice(1, 33)), y: b64urlEncode(asPub.slice(33)), ext: true };
    const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const publicKey = await crypto.subtle.importKey('raw', asPub as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
    const out = await encryptPayload(
      { endpoint: 'https://fcm.googleapis.com/x', p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
      enc.encode('When I grow up, I want to be a watermelon'),
      { salt: b64urlDecode('DGv6ra1nlYgDCS1FRnbzlw'), serverKeys: { privateKey, publicKey } },
    );
    expect(b64urlEncode(out)).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );
  });

  it('nutzt für jede Nachricht neues Salz und neue Schlüssel', async () => {
    const { sub } = await makeSubscription();
    const a = await encryptPayload(sub, enc.encode('x'));
    const b = await encryptPayload(sub, enc.encode('x'));
    expect(b64urlEncode(a.slice(0, 16))).not.toBe(b64urlEncode(b.slice(0, 16)));
    expect(b64urlEncode(a.slice(21, 86))).not.toBe(b64urlEncode(b.slice(21, 86)));
  });

  it('erzeugt ein gültig signiertes VAPID-JWT für den Push-Dienst', async () => {
    const { kp, keys } = await makeVapid();
    expect(validateVapidKeys(keys)).toBeNull();
    const now = 1_800_000_000;
    const jwt = await vapidJwt('https://fcm.googleapis.com/fcm/send/abc', keys, now);
    const [h, p, s] = jwt.split('.');
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
    expect(payload).toEqual({ aud: 'https://fcm.googleapis.com', exp: now + 12 * 3600, sub: 'mailto:test@example.org' });
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, b64urlDecode(s) as BufferSource, enc.encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });

  it('meldet ungültige VAPID-Schlüssel verständlich', () => {
    expect(validateVapidKeys({ publicKey: 'abc', privateKey: 'def', subject: 'mailto:x@y.de' })).toMatch(/VAPID_PUBLIC_KEY/);
    expect(validateVapidKeys({ publicKey: b64urlEncode(new Uint8Array(65)), privateKey: b64urlEncode(new Uint8Array(32)), subject: 'x@y.de' })).toMatch(/VAPID_SUBJECT/);
  });

  it('akzeptiert nur echte Push-Dienste (kein Aufruf beliebiger URLs)', () => {
    expect(isAllowedPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://db5p.notify.windows.com/w/?token=abc')).toBe(true);
    expect(isAllowedPushEndpoint('http://web.push.apple.com/abc')).toBe(false);
    expect(isAllowedPushEndpoint('https://evil.example.com/abc')).toBe(false);
    expect(isAllowedPushEndpoint('https://web.push.apple.com.evil.com/abc')).toBe(false);
    expect(isAllowedPushEndpoint('https://localhost:8080/')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false);
  });

  it('speichert Gerätetokens nur als SHA-256-Hash', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('VAPID-Selbstprüfung', () => {
  it('erkennt passende und vertauschte Schlüsselpaare', async () => {
    const { checkVapidPair, pushServiceReason } = await import('../../supabase/functions/_shared/webpush.ts');
    const make = async () => {
      const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
      const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
      const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64url');
      return { publicKey: b64(raw), privateKey: jwk.d!, subject: 'mailto:test@example.com' };
    };
    const a = await make();
    const b = await make();
    expect(await checkVapidPair(a)).toBeNull();
    expect(await checkVapidPair({ ...a, privateKey: b.privateKey })).toMatch(/passt nicht/);
    expect(pushServiceReason('403 {"reason":"BadJwtToken"}')).toBe('BadJwtToken');
    expect(pushServiceReason('400 bad request')).toBe('bad request');
  });

  it('meldet abweichende Schlüssel zwischen Webseite und Server', async () => {
    const { keyMismatch } = await import('../lib/push');
    expect(keyMismatch('ABC=', 'ABC')).toBeNull();
    expect(keyMismatch('ABC', 'XYZ')).toMatch(/passen nicht zusammen/);
    expect(keyMismatch(undefined, 'XYZ')).toBeNull();
  });
});
