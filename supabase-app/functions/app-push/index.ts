// =====================================================================
// AUTOMATISCH ERZEUGT aus supabase-app/functions-src/app-push.ts –
// nicht von Hand ändern (npm run app:functions).
// Bereitstellen: GitHub-Workflow „App: Edge Functions bereitstellen“ oder
// im Supabase-Dashboard → Edge Functions → „app-push“ den gesamten Inhalt
// dieser Datei einfügen (JWT-Prüfung AUS – die Funktion prüft selbst).
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
// supabase/functions/_shared/http.ts
/** Kleine Helfer für die Edge Functions (CORS, JSON-Antworten, Rate Limit). */
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
/**
* CORS: Standardmäßig ist jede Herkunft erlaubt (die App ist öffentlich und
* ohne Anmeldung). Mit dem Secret ALLOWED_ORIGINS (z. B.
* "https://lern-hub-wing.github.io") lässt sich das einschränken.
*/
function corsHeaders(req) {
	const origin = req.headers.get("origin") ?? "";
	return {
		"Access-Control-Allow-Origin": ALLOWED_ORIGINS.length === 0 ? "*" : ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
		"Access-Control-Max-Age": "86400",
		Vary: "Origin"
	};
}
function json(req, body, status = 200, extra = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			...corsHeaders(req),
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "no-store",
			...extra
		}
	});
}
/** Einfaches Rate Limit pro IP und Isolate (zusätzlich zu den Grenzen in der Datenbank). */
const hits = /* @__PURE__ */ new Map();
function rateLimited(key, max, windowMs) {
	const now = Date.now();
	const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
	list.push(now);
	hits.set(key, list);
	if (hits.size > 5e3) hits.clear();
	return list.length > max;
}
function clientIp(req) {
	return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}
/** Vergleich in konstanter Zeit (für Secrets) */
function safeEqual(a, b) {
	if (a.length !== b.length) return false;
	let r = 0;
	for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return r === 0;
}
// supabase/functions/_shared/webpush.ts
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
function b64urlEncode(bytes) {
	let s = "";
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(input) {
	const s = input.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
	const bin = atob(s + "===".slice((s.length + 3) % 4));
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}
function concat(...parts) {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}
/** HKDF (Extract + Expand) mit SHA-256 */
async function hkdf(salt, ikm, info, length) {
	const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
	const bits = await crypto.subtle.deriveBits({
		name: "HKDF",
		hash: "SHA-256",
		salt,
		info
	}, key, length * 8);
	return new Uint8Array(bits);
}
function validateVapidKeys(keys) {
	try {
		if (b64urlDecode(keys.publicKey).length !== 65) return "VAPID_PUBLIC_KEY hat nicht die erwartete Länge (65 Byte).";
		if (b64urlDecode(keys.privateKey).length !== 32) return "VAPID_PRIVATE_KEY hat nicht die erwartete Länge (32 Byte).";
	} catch {
		return "VAPID-Schlüssel sind kein gültiges base64url.";
	}
	if (!/^(mailto:|https:\/\/)/.test(keys.subject)) return "VAPID_SUBJECT muss mit „mailto:“ oder „https://“ beginnen.";
	return null;
}
/**
* Prüft, ob VAPID_PRIVATE_KEY wirklich zu VAPID_PUBLIC_KEY gehört:
* mit dem privaten Schlüssel signieren, mit dem öffentlichen prüfen.
* Passen sie nicht zusammen, lehnen Apple/Google jede Nachricht ab.
*/
async function checkVapidPair(keys) {
	const mismatch = "VAPID_PRIVATE_KEY passt nicht zu VAPID_PUBLIC_KEY – beide müssen aus demselben Schlüsselpaar stammen.";
	try {
		const priv = await importVapidPrivateKey(keys);
		const pub = await crypto.subtle.importKey("raw", b64urlDecode(keys.publicKey), {
			name: "ECDSA",
			namedCurve: "P-256"
		}, false, ["verify"]);
		const data = enc.encode("studyspace-vapid-check");
		const sig = await crypto.subtle.sign({
			name: "ECDSA",
			hash: "SHA-256"
		}, priv, data);
		return await crypto.subtle.verify({
			name: "ECDSA",
			hash: "SHA-256"
		}, pub, sig, data) ? null : mismatch;
	} catch {
		return mismatch;
	}
}
/** Grund aus der Antwort des Push-Dienstes, z. B. Apples {"reason":"BadJwtToken"} */
function pushServiceReason(error) {
	if (!error) return null;
	const m = /"reason"\s*:\s*"([^"]+)"/.exec(error);
	if (m) return m[1];
	const rest = error.replace(/^\d+\s*/, "").trim();
	return rest ? rest.slice(0, 120) : null;
}
async function importVapidPrivateKey(keys) {
	const pub = b64urlDecode(keys.publicKey);
	const jwk = {
		kty: "EC",
		crv: "P-256",
		d: keys.privateKey.replace(/=+$/, ""),
		x: b64urlEncode(pub.slice(1, 33)),
		y: b64urlEncode(pub.slice(33, 65)),
		ext: true
	};
	return crypto.subtle.importKey("jwk", jwk, {
		name: "ECDSA",
		namedCurve: "P-256"
	}, false, ["sign"]);
}
/** VAPID-JWT (ES256) für den Ursprung des Push-Dienstes */
async function vapidJwt(endpoint, keys, nowSec = Math.floor(Date.now() / 1e3)) {
	const aud = new URL(endpoint).origin;
	const unsigned = `${b64urlEncode(enc.encode(JSON.stringify({
		typ: "JWT",
		alg: "ES256"
	})))}.${b64urlEncode(enc.encode(JSON.stringify({
		aud,
		exp: nowSec + 43200,
		sub: keys.subject
	})))}`;
	const key = await importVapidPrivateKey(keys);
	return `${unsigned}.${b64urlEncode(new Uint8Array(await crypto.subtle.sign({
		name: "ECDSA",
		hash: "SHA-256"
	}, key, enc.encode(unsigned))))}`;
}
/** Verschlüsselt den Inhalt nach RFC 8291 (aes128gcm, ein Datensatz). */
async function encryptPayload(sub, plaintext, opts = {}) {
	const uaPublic = b64urlDecode(sub.p256dh);
	const authSecret = b64urlDecode(sub.auth);
	if (uaPublic.length !== 65) throw new Error("p256dh ungültig");
	if (authSecret.length !== 16) throw new Error("auth ungültig");
	const serverKeys = opts.serverKeys ?? await crypto.subtle.generateKey({
		name: "ECDH",
		namedCurve: "P-256"
	}, true, ["deriveBits"]);
	const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeys.publicKey));
	const uaKey = await crypto.subtle.importKey("raw", uaPublic, {
		name: "ECDH",
		namedCurve: "P-256"
	}, false, []);
	const ikm = await hkdf(authSecret, new Uint8Array(await crypto.subtle.deriveBits({
		name: "ECDH",
		public: uaKey
	}, serverKeys.privateKey, 256)), concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
	const salt = opts.salt ?? crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(16));
	const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
	const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
	const padded = concat(plaintext, new Uint8Array([2]));
	const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
	const cipher = new Uint8Array(await crypto.subtle.encrypt({
		name: "AES-GCM",
		iv: nonce
	}, aesKey, padded));
	const rs = 4096;
	const header = new Uint8Array(21 + asPublic.length);
	header.set(salt, 0);
	new DataView(header.buffer).setUint32(16, rs);
	header[20] = asPublic.length;
	header.set(asPublic, 21);
	return concat(header, cipher);
}
/** Hosts der großen Push-Dienste – verhindert, dass der Server beliebige URLs aufruft. */
function isAllowedPushEndpoint(endpoint) {
	let url;
	try {
		url = new URL(endpoint);
	} catch {
		return false;
	}
	if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;
	const h = url.hostname.toLowerCase();
	return h === "fcm.googleapis.com" || h === "android.googleapis.com" || h === "updates.push.services.mozilla.com" || h === "push.services.mozilla.com" || h === "web.push.apple.com" || h.endsWith(".push.apple.com") || h.endsWith(".notify.windows.com");
}
async function sendPush(sub, message, keys, opts = {}) {
	if (!isAllowedPushEndpoint(sub.endpoint)) return {
		ok: false,
		status: 0,
		gone: true,
		error: "Unbekannter Push-Dienst"
	};
	const payload = enc.encode(JSON.stringify(message));
	if (payload.length > 3e3) return {
		ok: false,
		status: 0,
		gone: false,
		error: "Nachricht zu groß"
	};
	const body = await encryptPayload(sub, payload);
	const headers = {
		Authorization: `vapid t=${await vapidJwt(sub.endpoint, keys)}, k=${keys.publicKey.replace(/=+$/, "")}`,
		"Content-Encoding": "aes128gcm",
		"Content-Type": "application/octet-stream",
		TTL: String(Math.max(0, Math.round(opts.ttl ?? 21600))),
		Urgency: opts.urgency ?? "normal"
	};
	if (opts.topic) headers.Topic = opts.topic.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
	try {
		const res = await fetch(sub.endpoint, {
			method: "POST",
			headers,
			body
		});
		const ok = res.status >= 200 && res.status < 300;
		const gone = res.status === 404 || res.status === 410;
		let error;
		if (!ok) error = `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`.trim();
		return {
			ok,
			status: res.status,
			gone,
			error
		};
	} catch (err) {
		return {
			ok: false,
			status: 0,
			gone: false,
			error: String(err).slice(0, 200)
		};
	}
}
/** SHA-256 als Hex – für Gerätetokens (nur der Hash wird gespeichert) */
async function sha256Hex(text) {
	return [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// supabase/functions/_shared/prefs.ts
const DEFAULT_PREFS = {
	morning: true,
	morningTime: "08:00",
	evening: true,
	eveningTime: "18:00",
	overdue: true,
	overdueTime: "09:00",
	exams: true,
	planChanges: true,
	groupSuccess: true,
	personalSuccess: false,
	homework: true,
	quietStart: "21:00",
	quietEnd: "08:00",
	badge: true
};
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const BOOL_KEYS = [
	"morning",
	"evening",
	"overdue",
	"exams",
	"planChanges",
	"groupSuccess",
	"personalSuccess",
	"homework",
	"badge"
];
const TIME_KEYS = [
	"morningTime",
	"eveningTime",
	"overdueTime",
	"quietStart",
	"quietEnd"
];
/** Übernimmt nur bekannte, gültige Felder; alles andere wird verworfen. */
function normalizePrefs(input) {
	const src = input && typeof input === "object" ? input : {};
	const out = { ...DEFAULT_PREFS };
	for (const k of BOOL_KEYS) if (typeof src[k] === "boolean") out[k] = src[k];
	for (const k of TIME_KEYS) if (typeof src[k] === "string" && TIME_RE.test(src[k])) out[k] = src[k];
	return out;
}
function timeToMinutes(hhmm) {
	const [h, m] = hhmm.split(":").map(Number);
	return h * 60 + m;
}
/** Liegt die Minute des Tages in der Ruhezeit? (Ruhezeit darf über Mitternacht gehen) */
function inQuietHours(minuteOfDay, prefs) {
	const qs = timeToMinutes(prefs.quietStart);
	const qe = timeToMinutes(prefs.quietEnd);
	if (qs === qe) return false;
	return qs < qe ? minuteOfDay >= qs && minuteOfDay < qe : minuteOfDay >= qs || minuteOfDay < qe;
}
const fmt = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Europe/Berlin",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23"
});
function berlinParts(d) {
	const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
	const hour = Number(p.hour) % 24;
	const minute = Number(p.minute);
	return {
		date: `${p.year}-${p.month}-${p.day}`,
		minutes: hour * 60 + minute,
		time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
	};
}
function diffDays(a, b) {
	return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
}
new Intl.DateTimeFormat("de-DE", {
	weekday: "long",
	timeZone: "UTC"
});
new Intl.DateTimeFormat("de-DE", {
	day: "numeric",
	month: "short",
	timeZone: "UTC"
});
const longDateFmt = new Intl.DateTimeFormat("de-DE", {
	weekday: "short",
	day: "numeric",
	month: "short",
	timeZone: "UTC"
});
function formatDateShort(date) {
	return longDateFmt.format(/* @__PURE__ */ new Date(`${date}T12:00:00Z`));
}
// supabase/functions/_shared/homework.ts
/**
* Text der Mitteilung „neue Hausaufgabe“ – gemeinsam für die bisherige
* Seite (push-scheduler) und die App (app-push). Ohne Abhängigkeiten außer
* den Datumshilfen, damit es in Deno und in Vitest läuft.
*/
/** „heute“, „morgen“ oder „zum Do., 17. Dez.“ */
function dueLabel(dueDate, today) {
	const d = diffDays(today, dueDate);
	if (d === 0) return "heute";
	if (d === 1) return `morgen (${formatDateShort(dueDate)})`;
	return `zum ${formatDateShort(dueDate)}`;
}
function quote(title) {
	const t = title.trim();
	return `„${t.length > 80 ? `${t.slice(0, 77)}…` : t}“`;
}
/**
* Eine Mitteilung für eine oder mehrere neue Hausaufgaben.
*  1 Aufgabe:  „Luk hat eine Hausaufgabe hinzugefügt“ – „Übungsblatt 3“ in Controlling · bis zum Do., 17. Dez.
*  mehrere:    „Luk hat 3 Hausaufgaben hinzugefügt“ – „A“ bis heute, „B“ bis zum … und 1 weitere
*/
function homeworkMessage(items, today) {
	const actors = [...new Set(items.map((i) => i.actorName?.trim()).filter((n) => !!n))];
	const who = actors.length === 1 && items.every((i) => i.actorName?.trim() === actors[0]) ? actors[0] : null;
	if (items.length === 1) {
		const h = items[0];
		return {
			title: who ? `${who} hat eine Hausaufgabe hinzugefügt` : "Neue Hausaufgabe",
			body: `${quote(h.title)}${h.moduleName ? ` in ${h.moduleName}` : ""} – bis ${dueLabel(h.dueDate, today)}`
		};
	}
	const sorted = [...items].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
	const shown = sorted.slice(0, 2).map((h) => `${quote(h.title)} bis ${dueLabel(h.dueDate, today)}`);
	const rest = sorted.length - shown.length;
	return {
		title: who ? `${who} hat ${items.length} Hausaufgaben hinzugefügt` : `${items.length} neue Hausaufgaben`,
		body: shown.join(", ") + (rest > 0 ? ` und ${rest} weitere` : "")
	};
}
// supabase/functions/_shared/appPush.ts
/**
* App (Konten + Lerngruppen): Wer bekommt welche Mitteilung „neue
* Hausaufgabe“? Reine Funktion ohne Datenbank – wird von der Edge Function
* „app-push“ aufgerufen und in Vitest geprüft.
*
* Regeln:
*  – nur Geräte von Konten, die (noch) Mitglied der Gruppe sind
*  – nie an die Person, die die Hausaufgabe eingetragen hat
*  – nur Hausaufgaben, die nach dem Einschalten des Geräts entstanden sind
*  – gelöschte oder bereits fällige Hausaufgaben entfallen
*  – Ruhezeit des Geräts: warten, danach nachliefern (bis 36 Stunden)
*  – jede Hausaufgabe höchstens einmal je Gerät (dedupeKey homework:<id>)
*/
const APP_HOMEWORK_WINDOW_MS = 1296e5;
function planAppHomework(input) {
	const nowMs = input.now.getTime();
	const local = berlinParts(input.now);
	const today = local.date;
	const hwById = new Map(input.homework.map((h) => [h.id, h]));
	const memberOf = /* @__PURE__ */ new Map();
	for (const m of input.memberships) {
		if (!memberOf.has(m.user_id)) memberOf.set(m.user_id, /* @__PURE__ */ new Map());
		memberOf.get(m.user_id).set(m.group_id, m.member_id);
	}
	const events = [...input.activity].sort((a, b) => a.id - b.id);
	const out = [];
	for (const dev of input.devices) {
		if (!dev.prefs.homework) continue;
		if (inQuietHours(local.minutes, dev.prefs)) continue;
		const groups = memberOf.get(dev.user_id);
		if (!groups || groups.size === 0) continue;
		const since = Date.parse(dev.created_at);
		const items = [];
		for (const ev of events) {
			if (!groups.has(ev.group_id)) continue;
			const mine = groups.get(ev.group_id);
			if (mine && ev.actor_member_id === mine) continue;
			const at = Date.parse(ev.occurred_at);
			if (at < since || nowMs - at > 1296e5) continue;
			const hw = hwById.get(ev.entity_id);
			if (!hw || hw.group_id !== ev.group_id || hw.deleted_at || hw.due_date < today) continue;
			if (dev.sent.has(`homework:${hw.id}`) || items.some((i) => i.id === hw.id)) continue;
			items.push({
				id: hw.id,
				groupId: hw.group_id,
				title: hw.title,
				moduleName: input.moduleNames.get(hw.module_id) ?? null,
				dueDate: hw.due_date,
				actorName: ev.actor_member_id ? input.memberNames.get(ev.actor_member_id) ?? null : null
			});
		}
		if (items.length === 0) continue;
		const msg = homeworkMessage(items, today);
		const oneGroup = items.every((i) => i.groupId === items[0].groupId);
		const groupName = groups.size > 1 && oneGroup ? input.groupNames.get(items[0].groupId) : void 0;
		const [first, ...rest] = items;
		out.push({
			deviceId: dev.id,
			dedupeKey: `homework:${first.id}`,
			alsoKeys: rest.map((i) => `homework:${i.id}`),
			title: msg.title,
			body: groupName ? `${msg.body} · ${groupName}` : msg.body,
			url: "#/hausaufgaben",
			homeworkIds: items.map((i) => i.id)
		});
	}
	return out;
}
// supabase-app/functions-src/app-push.ts
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const TEST_COOLDOWN_MS = 3e4;
const TEST_PER_HOUR = 10;
const HEARTBEAT_KEY = "app-push:heartbeat";
const vapid = {
	publicKey: Deno.env.get("VAPID_PUBLIC_KEY") ?? "",
	privateKey: Deno.env.get("VAPID_PRIVATE_KEY") ?? "",
	subject: Deno.env.get("VAPID_SUBJECT") ?? ""
};
const SECRET = Deno.env.get("APP_PUSH_SECRET") ?? "";
const db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: {
	persistSession: false,
	autoRefreshToken: false
} });
function clean(s, max) {
	return typeof s === "string" ? s.replace(/[\u0000-\u001f]/g, "").slice(0, max) : null;
}
const strip = (s) => s.replace(/=+$/, "");
/** Angemeldetes, aktives Konto aus dem Bearer-Token – sonst null */
async function currentUser(req) {
	const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
	if (jwt.split(".").length !== 3) return null;
	const { data, error } = await db.auth.getUser(jwt);
	if (error || !data.user) return null;
	const { data: profile } = await db.from("profiles").select("status").eq("id", data.user.id).maybeSingle();
	if (profile && profile.status !== "active") return null;
	return data.user.id;
}
async function deviceOf(userId, token) {
	const hash = await sha256Hex(token);
	const { data, error } = await db.from("push_devices").select("*").eq("token_hash", hash).maybeSingle();
	if (error) throw error;
	return {
		device: data && data.user_id === userId ? data : null,
		hash
	};
}
async function heartbeatAt() {
	const { data } = await db.from("push_state").select("value").eq("key", HEARTBEAT_KEY).maybeSingle();
	const at = (data?.value)?.at;
	return typeof at === "string" ? at : null;
}
function publicStatus(d) {
	if (!d) return {
		registered: false,
		serverKey: vapid.publicKey
	};
	return {
		registered: true,
		serverKey: vapid.publicKey,
		enabled: d.enabled,
		memberId: null,
		prefs: normalizePrefs(d.prefs),
		lastSuccessAt: d.last_success_at,
		lastError: d.last_error
	};
}
let pairCheck = null;
Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
	if (req.method !== "POST") return json(req, { error: "Nur POST erlaubt." }, 405);
	const vapidProblem = validateVapidKeys(vapid) ?? await (pairCheck ??= checkVapidPair(vapid));
	if (vapidProblem) return json(req, {
		error: "Mitteilungen sind auf dem Server noch nicht eingerichtet.",
		detail: vapidProblem,
		code: "not_configured"
	}, 503);
	let body;
	try {
		const text = await req.text();
		if (text.length > 8e3) return json(req, { error: "Anfrage zu groß." }, 413);
		body = text ? JSON.parse(text) : {};
	} catch {
		return json(req, { error: "Ungültige Anfrage." }, 400);
	}
	if (body.action === "dispatch") {
		const given = req.headers.get("x-dispatch-secret") ?? "";
		if (!SECRET || SECRET.length < 24 || !safeEqual(given, SECRET)) return json(req, { error: "unauthorized" }, 401);
		try {
			return json(req, await dispatch());
		} catch (err) {
			console.error("app-push dispatch", err);
			return json(req, {
				ok: false,
				error: String(err).slice(0, 300)
			}, 500);
		}
	}
	if (rateLimited(`ip:${clientIp(req)}`, 60, 6e4)) return json(req, { error: "Zu viele Anfragen. Bitte kurz warten." }, 429, { "Retry-After": "60" });
	const userId = await currentUser(req);
	if (!userId) return json(req, {
		error: "Bitte erneut anmelden.",
		code: "unauthorized"
	}, 401);
	const token = typeof body.token === "string" ? body.token : "";
	if (!TOKEN_RE.test(token)) return json(req, { error: "Ungültiger Gerätetoken." }, 400);
	try {
		switch (body.action) {
			case "register": {
				const sub = body.subscription;
				const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
				const p256dh = typeof sub?.keys?.p256dh === "string" ? strip(sub.keys.p256dh) : "";
				const auth = typeof sub?.keys?.auth === "string" ? strip(sub.keys.auth) : "";
				if (!isAllowedPushEndpoint(endpoint) || endpoint.length > 2048) return json(req, { error: "Unbekannter Push-Dienst." }, 400);
				if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) return json(req, { error: "Ungültige Schlüssel des Abonnements." }, 400);
				const hash = await sha256Hex(token);
				const { data: byToken } = await db.from("push_devices").select("*").eq("token_hash", hash).maybeSingle();
				const { data: byEndpoint } = await db.from("push_devices").select("id").eq("endpoint", endpoint).maybeSingle();
				const keep = byToken?.user_id === userId ? byToken : null;
				const row = {
					token_hash: hash,
					user_id: userId,
					member_id: null,
					endpoint,
					p256dh,
					auth,
					platform: clean(body.platform, 40),
					user_agent: clean(req.headers.get("user-agent"), 300),
					enabled: true,
					prefs: normalizePrefs(body.prefs ?? keep?.prefs),
					last_seen_at: (/* @__PURE__ */ new Date()).toISOString(),
					last_error: null,
					failure_count: 0
				};
				if (byEndpoint && byEndpoint.id !== byToken?.id) await db.from("push_devices").delete().eq("id", byEndpoint.id);
				if (byToken) {
					const patch = byToken.user_id === userId ? row : {
						...row,
						created_at: (/* @__PURE__ */ new Date()).toISOString()
					};
					const { data, error } = await db.from("push_devices").update(patch).eq("id", byToken.id).select().single();
					if (error) throw error;
					return json(req, publicStatus(data));
				}
				const { data, error } = await db.from("push_devices").insert(row).select().single();
				if (error) {
					if (/Höchstens 10/.test(error.message)) return json(req, { error: "Mitteilungen sind schon auf 10 Geräten dieses Kontos aktiv. Bitte auf einem alten Gerät ausschalten." }, 409);
					throw error;
				}
				return json(req, publicStatus(data), 201);
			}
			case "update": {
				const { device } = await deviceOf(userId, token);
				if (!device) return json(req, { registered: false }, 404);
				const patch = { last_seen_at: (/* @__PURE__ */ new Date()).toISOString() };
				if (body.prefs !== void 0) patch.prefs = normalizePrefs({
					...normalizePrefs(device.prefs),
					...body.prefs
				});
				if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
				const { data, error } = await db.from("push_devices").update(patch).eq("id", device.id).select().single();
				if (error) throw error;
				return json(req, publicStatus(data));
			}
			case "status": {
				const { device } = await deviceOf(userId, token);
				if (device) await db.from("push_devices").update({ last_seen_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", device.id);
				return json(req, {
					...publicStatus(device),
					schedulerAt: await heartbeatAt()
				});
			}
			case "unregister": {
				const { device } = await deviceOf(userId, token);
				if (device) await db.from("push_devices").delete().eq("id", device.id);
				return json(req, { registered: false });
			}
			case "test": {
				const { device } = await deviceOf(userId, token);
				if (!device) return json(req, {
					error: "Dieses Gerät ist nicht registriert.",
					code: "not_registered"
				}, 404);
				const since = (/* @__PURE__ */ new Date(Date.now() - 36e5)).toISOString();
				const { data: recent } = await db.from("push_log").select("created_at").eq("device_id", device.id).eq("kind", "test").gte("created_at", since).order("created_at", { ascending: false });
				const last = recent?.[0] ? Date.parse(recent[0].created_at) : 0;
				if (Date.now() - last < TEST_COOLDOWN_MS) {
					const wait = Math.ceil((TEST_COOLDOWN_MS - (Date.now() - last)) / 1e3);
					return json(req, {
						error: `Bitte noch ${wait} Sekunden warten.`,
						retryAfter: wait
					}, 429, { "Retry-After": String(wait) });
				}
				if ((recent?.length ?? 0) >= TEST_PER_HOUR) return json(req, {
					error: "Maximal 10 Testnachrichten pro Stunde.",
					retryAfter: 600
				}, 429);
				const message = {
					title: "StudySpace funktioniert! 🎉",
					body: "Mitteilungen sind eingerichtet. Du erfährst ab jetzt sofort, wenn jemand aus deiner Gruppe eine Hausaufgabe einträgt.",
					url: "#/einstellungen/benachrichtigungen",
					tag: "test"
				};
				const { data: log } = await db.from("push_log").insert({
					device_id: device.id,
					kind: "test",
					dedupe_key: `test:${(/* @__PURE__ */ new Date()).toISOString()}`,
					title: message.title,
					body: message.body,
					url: message.url,
					status: "pending"
				}).select("id").single();
				const res = await sendPush({
					endpoint: device.endpoint,
					p256dh: device.p256dh,
					auth: device.auth
				}, message, vapid, {
					ttl: 600,
					urgency: "high",
					topic: "test"
				});
				await recordResult(device, log?.id ?? null, res);
				if (res.ok) return json(req, {
					accepted: true,
					status: res.status
				});
				if (res.gone) return json(req, {
					accepted: false,
					code: "expired",
					error: "Das Abonnement ist abgelaufen. Bitte Mitteilungen erneut einschalten."
				}, 410);
				const reason = pushServiceReason(res.error);
				return json(req, {
					accepted: false,
					code: "rejected",
					reason,
					error: `Der Push-Dienst hat die Nachricht abgelehnt (${res.status || "keine Verbindung"}${reason ? `: ${reason}` : ""}).`
				}, 502);
			}
			default: return json(req, { error: "Unbekannte Aktion." }, 400);
		}
	} catch (err) {
		console.error("app-push", err);
		return json(req, { error: "Interner Fehler. Bitte später erneut versuchen." }, 500);
	}
});
async function recordResult(device, logId, res) {
	const status = res.ok ? "sent" : res.gone ? "expired" : "failed";
	if (logId !== null) await db.from("push_log").update({
		status,
		http_status: res.status,
		error: res.error ?? null,
		sent_at: (/* @__PURE__ */ new Date()).toISOString()
	}).eq("id", logId);
	if (res.ok) await db.from("push_devices").update({
		last_success_at: (/* @__PURE__ */ new Date()).toISOString(),
		last_error: null,
		failure_count: 0
	}).eq("id", device.id);
	else if (res.gone) await db.from("push_devices").delete().eq("id", device.id);
	else {
		const count = (device.failure_count ?? 0) + 1;
		device.failure_count = count;
		await db.from("push_devices").update({
			last_error: res.error ?? "Fehler",
			failure_count: count,
			enabled: count < 10
		}).eq("id", device.id);
	}
}
/** Neue Hausaufgaben an die Geräte der anderen Gruppenmitglieder senden */
async function dispatch() {
	const now = /* @__PURE__ */ new Date();
	const since = (/* @__PURE__ */ new Date(now.getTime() - APP_HOMEWORK_WINDOW_MS)).toISOString();
	const beat = (extra) => db.from("push_state").upsert({
		key: HEARTBEAT_KEY,
		value: {
			at: (/* @__PURE__ */ new Date()).toISOString(),
			...extra
		},
		updated_at: (/* @__PURE__ */ new Date()).toISOString()
	});
	const { data: activity, error: aErr } = await db.from("activity_log").select("id, group_id, occurred_at, actor_member_id, entity_id").eq("entity_type", "homework").eq("action", "created").not("group_id", "is", null).gte("occurred_at", since).order("id", { ascending: true }).limit(500);
	if (aErr) throw aErr;
	if (!activity?.length) {
		await beat({ sent: 0 });
		return {
			ok: true,
			events: 0,
			sent: 0
		};
	}
	const groupIds = [...new Set(activity.map((a) => a.group_id))];
	const [hw, memberships] = await Promise.all([db.from("homework").select("id, group_id, module_id, title, due_date, deleted_at").in("id", [...new Set(activity.map((a) => a.entity_id))]), db.from("group_members").select("group_id, user_id, member_id").in("group_id", groupIds).is("left_at", null)]);
	if (hw.error) throw hw.error;
	if (memberships.error) throw memberships.error;
	const userIds = [...new Set((memberships.data ?? []).map((m) => m.user_id))];
	if (userIds.length === 0) {
		await beat({ sent: 0 });
		return {
			ok: true,
			events: activity.length,
			sent: 0
		};
	}
	const [devicesRes, modules, members, groups] = await Promise.all([
		db.from("push_devices").select("id, user_id, endpoint, p256dh, auth, prefs, created_at, failure_count").eq("enabled", true).in("user_id", userIds),
		db.from("modules").select("id, name").in("group_id", groupIds),
		db.from("members").select("id, name").in("group_id", groupIds),
		db.from("groups").select("id, name").in("id", groupIds)
	]);
	if (devicesRes.error) throw devicesRes.error;
	const devices = devicesRes.data ?? [];
	if (devices.length === 0) {
		await beat({ sent: 0 });
		return {
			ok: true,
			events: activity.length,
			devices: 0,
			sent: 0
		};
	}
	const { data: logs } = await db.from("push_log").select("device_id, dedupe_key").in("device_id", devices.map((d) => d.id)).like("dedupe_key", "homework:%").gte("created_at", (/* @__PURE__ */ new Date(now.getTime() - 2592e5)).toISOString());
	const sentBy = /* @__PURE__ */ new Map();
	for (const l of logs ?? []) {
		if (!sentBy.has(l.device_id)) sentBy.set(l.device_id, /* @__PURE__ */ new Set());
		sentBy.get(l.device_id).add(l.dedupe_key);
	}
	const infos = devices.map((d) => ({
		id: d.id,
		user_id: d.user_id,
		prefs: normalizePrefs(d.prefs),
		created_at: d.created_at,
		sent: sentBy.get(d.id) ?? /* @__PURE__ */ new Set()
	}));
	const plan = planAppHomework({
		now,
		activity,
		homework: hw.data ?? [],
		memberships: memberships.data ?? [],
		devices: infos,
		moduleNames: new Map((modules.data ?? []).map((m) => [m.id, m.name])),
		memberNames: new Map((members.data ?? []).map((m) => [m.id, m.name])),
		groupNames: new Map((groups.data ?? []).map((g) => [g.id, g.name]))
	});
	const byId = new Map(devices.map((d) => [d.id, d]));
	let sent = 0;
	let failed = 0;
	for (const n of plan) {
		const { data: reserved, error: resErr } = await db.from("push_log").insert({
			device_id: n.deviceId,
			kind: "homework",
			dedupe_key: n.dedupeKey,
			title: n.title.slice(0, 120),
			body: n.body.slice(0, 400),
			url: n.url,
			status: "pending",
			meta: { homeworkIds: n.homeworkIds }
		}).select("id").single();
		if (resErr || !reserved) continue;
		for (const key of n.alsoKeys) await db.from("push_log").insert({
			device_id: n.deviceId,
			kind: "homework",
			dedupe_key: key,
			title: n.title.slice(0, 120),
			body: n.body.slice(0, 400),
			url: n.url,
			status: "merged"
		});
		const d = byId.get(n.deviceId);
		const res = await sendPush({
			endpoint: d.endpoint,
			p256dh: d.p256dh,
			auth: d.auth
		}, {
			title: n.title,
			body: n.body,
			url: n.url,
			tag: `homework-${n.homeworkIds[0]}`
		}, vapid, {
			ttl: 86400,
			urgency: "normal",
			topic: `hw${n.homeworkIds[0].replace(/-/g, "").slice(0, 30)}`
		});
		if (!res.ok && !res.gone && (res.status === 0 || res.status === 429 || res.status >= 500)) {
			await db.from("push_log").delete().eq("device_id", d.id).in("dedupe_key", [n.dedupeKey, ...n.alsoKeys]);
			failed++;
			continue;
		}
		await recordResult(d, reserved.id, res);
		if (res.ok) sent++;
		else failed++;
	}
	await beat({
		sent,
		failed
	});
	return {
		ok: true,
		events: activity.length,
		devices: devices.length,
		planned: plan.length,
		sent,
		failed
	};
}
