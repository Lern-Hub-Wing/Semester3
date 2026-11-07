// Erzeugt ein VAPID-Schlüsselpaar und ein Scheduler-Secret für StudySpace-Push.
// Aufruf: node scripts/generate-vapid-keys.mjs   (ohne Abhängigkeiten)
// Die Ausgabe NICHT ins Repository übernehmen – siehe README, Schritt 12.
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = await crypto.subtle.exportKey('raw', kp.publicKey);
const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
console.log(`VAPID_PUBLIC_KEY=${b64url(pub)}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
console.log(`SCHEDULER_SECRET=${b64url(crypto.getRandomValues(new Uint8Array(32)))}`);
