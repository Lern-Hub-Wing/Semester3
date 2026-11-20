// =====================================================================
// AUTOMATISCH ERZEUGT aus supabase-app/functions-src/app-ai-plan.ts –
// nicht von Hand ändern (npm run app:functions).
// Bereitstellen: GitHub-Workflow „App: Edge Functions bereitstellen“ oder
// im Supabase-Dashboard → Edge Functions → „app-ai-plan“ den gesamten Inhalt
// dieser Datei einfügen (JWT-Prüfung AUS – die Funktion prüft selbst).
// =====================================================================
import Anthropic from "npm:@anthropic-ai/sdk";
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
// supabase-app/functions-src/app-ai-plan.ts
const MODEL = "claude-opus-5-5";
const API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: {
	persistSession: false,
	autoRefreshToken: false
} });
const anthropic = API_KEY ? new Anthropic({ apiKey: API_KEY }) : null;
const SYSTEM = `Du bist ein erfahrener Lerncoach für Schülerinnen und Schüler, Abiturientinnen und Abiturienten, Auszubildende und Studierende in Deutschland.
Aus Fächern, Themen, Prüfungsterminen und der verfügbaren Lernzeit je Fach erstellst du Lerneinheiten, mit denen die Person gut vorbereitet in jede Prüfung geht.

So gehst du vor:
- Zerlege jedes Thema in konkrete Teilthemen und formuliere für jede Einheit eine klare, motivierende Aufgabe (z. B. „Kettenregel: 10 Ableitungen rechnen“ statt „Mathe lernen“). Höchstens 80 Zeichen pro Titel, auf Deutsch.
- Reihenfolge: zuerst Grundlagen, dann Vertiefung; auf jede Lern-Einheit folgt bald eine Übungs-Einheit zum selben Thema.
- Plane Wiederholungen (kind „review“) für alle Themen und mindestens eine Probeklausur (kind „mock_exam“) pro Fach; sie stehen am Ende der Liste des Fachs.
- Schwierige Themen und Fächer, in denen sich die Person unsicher fühlt, bekommen mehr Übung.
- Die Summe der Minuten je Fach soll etwa dem angegebenen Budget entsprechen (höchstens 10 % darüber). Jede Einheit dauert zwischen 15 und 120 Minuten; üblich ist die angegebene Einheitenlänge.
- Passe Sprache und Methoden an: Schule/Abitur eher Aufgaben aus dem Unterricht, alte Klausuren, Lernzettel; Ausbildung eher Praxisbezug und Prüfungsfragen der Kammer; Studium eher Vorlesungsfolien, Übungsblätter, Altklausuren. Berücksichtige die bevorzugten Lernmethoden und Hinweise der Person.
- Gib höchstens drei kurze, konkrete Tipps und eine Zusammenfassung in ein bis zwei Sätzen. Duze die Person.
- Verwende genau die übergebenen subject_id-Werte.`;
const SCHEMA = {
	type: "object",
	additionalProperties: false,
	required: [
		"summary",
		"tips",
		"subjects"
	],
	properties: {
		summary: { type: "string" },
		tips: {
			type: "array",
			items: { type: "string" }
		},
		subjects: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				required: ["subject_id", "units"],
				properties: {
					subject_id: { type: "string" },
					units: {
						type: "array",
						items: {
							type: "object",
							additionalProperties: false,
							required: [
								"title",
								"topic",
								"minutes",
								"kind"
							],
							properties: {
								title: { type: "string" },
								topic: { type: "string" },
								minutes: { type: "integer" },
								kind: {
									type: "string",
									enum: [
										"learn",
										"practice",
										"review",
										"mock_exam"
									]
								}
							}
						}
					}
				}
			}
		}
	}
};
const str = (v, max) => typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "";
/** Nur bekannte Felder in begrenzter Größe weitergeben */
function cleanInput(raw, budgets) {
	const subjects = (Array.isArray(raw?.subjects) ? raw.subjects : []).slice(0, 12).map((s) => ({
		subject_id: str(s?.id, 64),
		name: str(s?.name, 80),
		exam_date: str(s?.examDate, 10),
		confidence_1_to_5: Math.min(5, Math.max(1, Math.round(Number(s?.confidence) || 3))),
		budget_minutes: Math.min(2e4, Math.max(0, Math.round(Number(budgets?.[s?.id]) || 0))),
		topics: (Array.isArray(s?.topics) ? s.topics : []).slice(0, 30).map((t) => ({
			title: str(t?.title, 120),
			difficulty: [
				"leicht",
				"mittel",
				"schwer"
			].includes(t?.difficulty) ? t.difficulty : "mittel"
		})).filter((t) => t.title)
	})).filter((s) => s.subject_id && s.name);
	return {
		status: [
			"schule",
			"abitur",
			"ausbildung",
			"studium"
		].includes(raw?.status) ? raw.status : "schule",
		goal: [
			"bestehen",
			"gut",
			"sehr_gut"
		].includes(raw?.goal) ? raw.goal : "gut",
		preferred_time_of_day: [
			"morgens",
			"nachmittags",
			"abends",
			"flexibel"
		].includes(raw?.dayPart) ? raw.dayPart : "flexibel",
		unit_length_minutes: Math.min(120, Math.max(15, Math.round(Number(raw?.sessionMinutes) || 45))),
		start_date: str(raw?.start, 10),
		methods: (Array.isArray(raw?.methods) ? raw.methods : []).slice(0, 8).map((m) => str(m, 40)).filter(Boolean),
		notes: str(raw?.notes, 500),
		subjects
	};
}
async function currentUser(req) {
	const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
	if (jwt.split(".").length !== 3) return null;
	const { data, error } = await db.auth.getUser(jwt);
	return error || !data.user ? null : data.user.id;
}
Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
	if (req.method !== "POST") return json(req, { error: "Nur POST erlaubt." }, 405);
	if (!anthropic) return json(req, {
		error: "Der KI-Lernplan ist auf dem Server noch nicht eingerichtet.",
		code: "not_configured"
	}, 503);
	if (rateLimited(`ip:${clientIp(req)}`, 10, 6e4)) return json(req, { error: "Zu viele Anfragen. Bitte kurz warten." }, 429);
	const userId = await currentUser(req);
	if (!userId) return json(req, {
		error: "Bitte erneut anmelden.",
		code: "unauthorized"
	}, 401);
	let body;
	try {
		const text = await req.text();
		if (text.length > 6e4) return json(req, { error: "Anfrage zu groß." }, 413);
		body = JSON.parse(text);
	} catch {
		return json(req, { error: "Ungültige Anfrage." }, 400);
	}
	const input = cleanInput(body?.input, body?.budgets);
	if (input.subjects.length === 0) return json(req, { error: "Bitte mindestens ein Fach auswählen." }, 400);
	const { data: check, error: checkErr } = await db.rpc("app_ai_plan_check", { p_user: userId });
	if (checkErr) {
		console.error("app-ai-plan check", checkErr);
		return json(req, {
			error: "Der KI-Lernplan ist auf dem Server noch nicht eingerichtet.",
			code: "not_configured"
		}, 503);
	}
	if (!check?.allowed) {
		const reason = check?.reason;
		return json(req, {
			error: reason === "limit" ? `Heute sind schon ${check.limit} KI-Pläne erstellt worden. Morgen geht es weiter – bis dahin kannst du den Plan ohne KI erstellen.` : reason === "no_plan" ? "Der KI-Lernplan gehört zu Solo, Gruppe und der Testphase." : reason === "disabled" ? "Der KI-Lernplan ist gerade abgeschaltet." : "Bitte zuerst einer Lerngruppe beitreten oder alleine lernen.",
			code: reason ?? "forbidden"
		}, 403);
	}
	const log = (ok, usage) => db.from("ai_usage").insert({
		user_id: userId,
		group_id: check.group_id ?? null,
		model: MODEL,
		ok,
		input_tokens: usage?.input_tokens ?? 0,
		output_tokens: usage?.output_tokens ?? 0
	});
	try {
		const response = await anthropic.beta.messages.create({
			model: MODEL,
			max_tokens: 16e3,
			betas: ["server-side-fallback-2026-07-01"],
			fallbacks: "default",
			output_config: {
				effort: "medium",
				format: {
					type: "json_schema",
					schema: SCHEMA
				}
			},
			system: SYSTEM,
			messages: [{
				role: "user",
				content: `Erstelle die Lerneinheiten für diese Angaben (JSON):\n${JSON.stringify(input)}`
			}]
		});
		if (response.stop_reason === "refusal") {
			await log(false, response.usage);
			return json(req, {
				error: "Die KI konnte für diese Angaben keinen Plan erstellen. Bitte Themen prüfen oder ohne KI erstellen.",
				code: "refusal"
			}, 422);
		}
		if (response.stop_reason === "max_tokens") {
			await log(false, response.usage);
			return json(req, {
				error: "Der Plan wurde zu lang. Bitte weniger Themen auf einmal planen.",
				code: "too_long"
			}, 422);
		}
		const text = (response.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
		const plan = JSON.parse(text);
		await log(true, response.usage);
		return json(req, {
			...plan,
			left: Math.max(0, (check.left ?? 1) - 1),
			model: response.model ?? MODEL
		});
	} catch (err) {
		await log(false);
		if (err instanceof Anthropic.RateLimitError) return json(req, {
			error: "Die KI ist gerade ausgelastet. Bitte in einer Minute erneut versuchen.",
			code: "busy"
		}, 503);
		if (err instanceof Anthropic.AuthenticationError) {
			console.error("app-ai-plan: ANTHROPIC_API_KEY ungültig");
			return json(req, {
				error: "Der KI-Lernplan ist auf dem Server noch nicht eingerichtet.",
				code: "not_configured"
			}, 503);
		}
		if (err instanceof Anthropic.APIError) {
			console.error("app-ai-plan API", err.status, err.message);
			return json(req, {
				error: "Die KI ist gerade nicht erreichbar. Bitte später erneut versuchen.",
				code: "upstream"
			}, 502);
		}
		console.error("app-ai-plan", err);
		return json(req, {
			error: "Der Plan konnte nicht erstellt werden. Bitte erneut versuchen.",
			code: "error"
		}, 500);
	}
});
