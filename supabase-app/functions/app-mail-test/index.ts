// =====================================================================
// AUTOMATISCH ERZEUGT aus supabase-app/functions-src/app-mail-test.ts –
// nicht von Hand ändern (npm run app:functions).
// Bereitstellen: GitHub-Workflow „App: Edge Functions bereitstellen“ oder
// im Supabase-Dashboard → Edge Functions → „app-mail-test“ den gesamten Inhalt
// dieser Datei einfügen (JWT-Prüfung AUS – die Funktion prüft selbst).
// =====================================================================
import nodemailer from "npm:nodemailer@6.9.16";
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
// supabase-app/functions-src/app-mail-test.ts
const GMAIL_USER = (Deno.env.get("GMAIL_USER") ?? "").trim();
const GMAIL_PASS = (Deno.env.get("GMAIL_APP_PASSWORD") ?? "").replace(/\s+/g, "");
const FROM_NAME = (Deno.env.get("MAIL_FROM_NAME") ?? "StudySpace").trim() || "StudySpace";
const APP_URL = (Deno.env.get("APP_URL") ?? "https://lern-hub-wing.github.io/Semester3/app/").trim();
const LOGO = "https://lern-hub-wing.github.io/Semester3/app/icons/icon-192.png";
const db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: {
	persistSession: false,
	autoRefreshToken: false
} });
const EMAIL_RE = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/i;
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&#39;"
})[c]);
/** Gestaltete E-Mail im StudySpace-Look (Tabellen-Layout, damit sie in jedem Mailprogramm gleich aussieht) */
function codeMail(to, code) {
	const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
	const subject = `${spaced} ist dein Anmeldecode für StudySpace`;
	const text = `Hallo,\n\nwillkommen bei StudySpace! Dein Anmeldecode für ${to}:\n\n${spaced}\n\nDer Code ist 10 Minuten gültig. Du hast ihn nicht angefordert? Dann ignoriere diese E-Mail.\n\n(Dies ist eine Test-E-Mail – der Code funktioniert nicht.)\n\nStudySpace · Gemeinsam lernen. Gemeinsam Fortschritte machen.`;
	return {
		subject,
		html: `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F1EFFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1C1A33;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Dein Anmeldecode: ${spaced}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F1EFFA;"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;">
    <tr><td align="center" style="padding:0 0 20px;">
      <table role="presentation" cellspacing="0" cellpadding="0"><tr>
        <td style="padding-right:10px;"><img src="${LOGO}" width="44" height="44" alt="StudySpace" style="display:block;border:0;border-radius:12px;"></td>
        <td style="font-size:21px;font-weight:700;letter-spacing:-0.3px;color:#1C1A33;">StudySpace</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#FFFFFF;border-radius:24px;overflow:hidden;box-shadow:0 8px 30px rgba(60,40,140,0.08);">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr><td style="height:6px;background:#7C6FF0;background-image:linear-gradient(90deg,#8B7BFF,#5E5CE6,#B57BF0);font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:30px 32px 6px;">
          <p style="margin:0 0 14px;"><span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#FFF4E5;color:#9A5B00;font-size:12px;font-weight:600;">Test-E-Mail</span></p>
          <h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.4px;color:#1C1A33;">Willkommen bei StudySpace</h1>
          <p style="margin:0 0 8px;font-size:15.5px;line-height:1.6;color:#4A4766;">Hallo,</p>
          <p style="margin:0 0 22px;font-size:15.5px;line-height:1.6;color:#4A4766;">hier ist dein Anmeldecode für <strong style="color:#1C1A33;">${esc(to)}</strong>. Gib ihn in der App ein – ganz ohne Passwort.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:20px 12px;border-radius:18px;background:#F4F2FD;">
            <div style="font-size:12px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:#7A76A0;margin-bottom:8px;">Dein Code</div>
            <div style="font-size:38px;line-height:1;font-weight:700;letter-spacing:8px;color:#1C1A33;font-family:'SF Mono',ui-monospace,Menlo,Consolas,monospace;">${spaced}</div>
          </td></tr></table>
          <p style="margin:22px 0 0;font-size:13.5px;line-height:1.6;color:#6E6A8A;">Der Code ist 10 Minuten gültig und funktioniert nur einmal. Du hast ihn nicht angefordert? Dann ignoriere diese E-Mail – dein Konto bleibt sicher.</p>
          <p style="margin:10px 0 0;font-size:13px;line-height:1.6;color:#9A5B00;">Dies ist eine Test-E-Mail – der Code oben funktioniert nicht.</p>
        </td></tr>
        <tr><td style="padding:22px 32px 30px;">
          <table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="border-radius:999px;background:#6C5CE7;background-image:linear-gradient(135deg,#8B7BFF,#5E5CE6);">
            <a href="${esc(APP_URL)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px;">StudySpace öffnen</a>
          </td></tr></table>
        </td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:22px 12px 0;font-size:12px;line-height:1.6;color:#9894B3;">
      StudySpace · Gemeinsam lernen. Gemeinsam Fortschritte machen.<br>Du bekommst diese E-Mail, weil sie für dein StudySpace-Konto angefordert wurde.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`,
		text
	};
}
async function caller(req) {
	const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
	if (!jwt) return null;
	const { data, error } = await db.auth.getUser(jwt);
	if (error || !data.user) return null;
	return {
		id: data.user.id,
		email: data.user.email ?? null
	};
}
Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
	if (req.method !== "POST") return json(req, { error: "Nur POST." }, 405);
	if (rateLimited(`ip:${clientIp(req)}`, 10, 6e4)) return json(req, { error: "Zu viele Anfragen. Bitte kurz warten." }, 429);
	const user = await caller(req);
	if (!user) return json(req, {
		error: "Bitte erneut anmelden.",
		code: "unauthorized"
	}, 401);
	if (!GMAIL_USER || !GMAIL_PASS) return json(req, {
		error: "Der E-Mail-Versand ist noch nicht eingerichtet (Secrets GMAIL_USER und GMAIL_APP_PASSWORD fehlen).",
		code: "not_configured"
	}, 503);
	const body = await req.json().catch(() => ({}));
	const { data: adminRow } = await db.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
	const admin = !!adminRow;
	const wanted = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
	const to = admin ? wanted : (user.email ?? "").toLowerCase();
	if (!to || !EMAIL_RE.test(to) || to.length > 254) return json(req, {
		error: "Bitte eine gültige E-Mail-Adresse eingeben.",
		code: "invalid_email"
	}, 400);
	if (!admin && wanted && wanted !== to) return json(req, {
		error: "Test-E-Mails gehen nur an deine eigene Adresse.",
		code: "forbidden"
	}, 403);
	if (rateLimited(`user:${user.id}`, admin ? 20 : 3, 36e5)) return json(req, {
		error: "Für diese Stunde sind genug Test-E-Mails verschickt.",
		code: "rate_limited"
	}, 429);
	const mail = codeMail(to, String(crypto.getRandomValues(/* @__PURE__ */ new Uint32Array(1))[0] % 1e6).padStart(6, "0"));
	try {
		await nodemailer.createTransport({
			host: "smtp.gmail.com",
			port: 465,
			secure: true,
			auth: {
				user: GMAIL_USER,
				pass: GMAIL_PASS
			}
		}).sendMail({
			from: {
				name: FROM_NAME,
				address: GMAIL_USER
			},
			to,
			subject: `[Test] ${mail.subject}`,
			html: mail.html,
			text: mail.text
		});
	} catch (err) {
		const msg = String(err?.message ?? err);
		const auth = /535|auth|credentials|Username and Password/i.test(msg);
		console.error("app-mail-test", msg.slice(0, 300));
		return json(req, {
			error: auth ? "Gmail hat die Anmeldung abgelehnt – bitte GMAIL_USER und App-Passwort prüfen." : "Die E-Mail konnte nicht verschickt werden. Bitte später erneut versuchen.",
			code: auth ? "smtp_auth" : "smtp_failed"
		}, 502);
	}
	return json(req, {
		ok: true,
		to
	});
});
export { codeMail };
