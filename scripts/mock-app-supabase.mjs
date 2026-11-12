// Nachbildung von Supabase (Auth + REST + RPC + admin-auth) für Browsertests
// der NEUEN App. Bildet die wichtigsten Regeln der Datenbank nach
// (Daten je Gruppe, Plus zum Erstellen, 8 Mitglieder, Admin nur mit aal2).
// Die echte Sicherheitsprüfung steckt in supabase-app/tests (PostgreSQL).
import { randomUUID } from 'node:crypto';

const now = () => new Date().toISOString();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub, aal = 'aal1') => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, aal, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })}.sig`;
const claims = (auth) => {
  const t = (auth ?? '').replace(/^Bearer\s+/i, '').split('.');
  if (t.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(t[1], 'base64url').toString());
  } catch {
    return null;
  }
};

const CONTENT = ['members', 'modules', 'module_topics', 'exams', 'study_entries', 'tasks', 'task_completions', 'app_settings', 'activity_log', 'focus_sessions', 'homework', 'homework_parts', 'homework_completions', 'music_tracks'];

export function createAppMock() {
  const state = {
    users: [], // { id, email, password, name, plus, status, admin, factors: [] }
    groups: [], // { id, name, owner, code }
    memberships: [], // { group_id, user_id, member_id, role, left_at }
    tables: Object.fromEntries(CONTENT.map((t) => [t, []])),
    profiles: new Map(), // user_id -> { active_group_id }
    refresh: new Map(), // refresh_token -> { sub, aal }
    adminSetupPossible: true,
    betaEnabled: true,
    betaPurchases: [],
    feedback: [],
    requests: [],
    settings: { google: false, apple: false },
  };
  const user = (id) => state.users.find((u) => u.id === id);
  const activeGroup = (uid) => {
    const g = state.profiles.get(uid)?.active_group_id;
    return g && state.memberships.some((m) => m.group_id === g && m.user_id === uid && !m.left_at) ? g : null;
  };
  // Tarife wie in 0003_plans.sql: Lerngruppe braucht Gruppenpass, Lernbereich Solo/Test/Gruppe
  const GROUP_PLANS = ['group_monthly', 'group_semester', 'plus_grant', 'plus_monthly', 'semester_pass'];
  const PRICES = { solo_monthly: 249, solo_semester: 1199, group_monthly: 499, group_semester: 2499 };
  const activeEnts = (u) => (u?.ents ?? []).filter((e) => !e.ends_at || new Date(e.ends_at) > new Date());
  const level = (u) => {
    const a = activeEnts(u);
    if (a.some((e) => GROUP_PLANS.includes(e.plan))) return 'group';
    return a.length ? 'solo' : null;
  };
  const groupHasPlus = (gid) => {
    const g = state.groups.find((x) => x.id === gid);
    if (!g) return false;
    const l = level(user(g.owner));
    return g.kind === 'solo' ? !!l : l === 'group';
  };
  const ensureSolo = (uid) => {
    let g = state.groups.find((x) => x.owner === uid && x.kind === 'solo');
    if (!g) {
      g = { id: randomUUID(), name: 'Mein Lernbereich', owner: uid, code: code(), kind: 'solo' };
      state.groups.push(g);
    }
    attach(g.id, uid, 'owner', null);
    return g.id;
  };
  const code = () => Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  const session = (u, aal = 'aal1') => {
    const refresh_token = randomUUID();
    state.refresh.set(refresh_token, { sub: u.id, aal });
    return { access_token: jwt(u.id, aal), refresh_token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: publicUser(u) };
  };
  const publicUser = (u) => ({
    id: u.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: u.email,
    email_confirmed_at: now(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { display_name: u.name },
    factors: u.factors,
    created_at: u.created_at,
  });
  const attach = (gid, uid, role, name) => {
    let m = state.memberships.find((x) => x.group_id === gid && x.user_id === uid);
    if (!m) {
      const member_id = randomUUID();
      const count = state.tables.members.filter((x) => x.group_id === gid).length;
      state.tables.members.push({ id: member_id, group_id: gid, user_id: uid, name: name || user(uid).name || 'Ich', color: ['#AFC5F5', '#C9B8F5', '#A6DED7', '#F5C9A8'][count % 4], sort_order: count + 1, is_active: true, version: 1, created_at: now(), updated_at: now(), changed_by: null });
      m = { group_id: gid, user_id: uid, member_id, role, left_at: null, joined_at: now() };
      state.memberships.push(m);
    } else m.left_at = null;
    state.profiles.set(uid, { active_group_id: gid });
  };
  const me = (uid) => {
    const u = user(uid);
    const gid = activeGroup(uid);
    const best = activeEnts(u).sort((a, b) => Number(GROUP_PLANS.includes(b.plan)) - Number(GROUP_PLANS.includes(a.plan)) || Number(a.plan === 'trial') - Number(b.plan === 'trial'))[0];
    const trial = (u.ents ?? []).find((e) => e.plan === 'trial');
    return {
      level: level(u),
      plan: best?.plan ?? null,
      plan_source: best?.source ?? null,
      plan_id: best?.id ?? null,
      plan_until: best?.ends_at ?? null,
      plus_until: best?.ends_at ?? null,
      auto_renew: !!best?.auto_renew,
      trial_used: !!trial,
      trial_ends_at: trial?.ends_at ?? null,
      beta_purchases: state.betaEnabled,
      tutorial_done: !!u.tutorial_done,
      user_id: uid,
      status: u.status,
      session_ok: true,
      display_name: u.name,
      active_group_id: gid,
      member_id: state.memberships.find((m) => m.group_id === gid && m.user_id === uid)?.member_id ?? null,
      has_plus: level(u) === 'group',
      plus_until: null,
      is_admin: !!u.admin,
      groups: state.memberships
        .filter((m) => m.user_id === uid && !m.left_at)
        .map((m) => {
          const g = state.groups.find((x) => x.id === m.group_id);
          return { id: g.id, name: g.name, kind: g.kind, role: m.role, is_owner: g.owner === uid, has_plus: groupHasPlus(g.id), plus_until: null, members: state.memberships.filter((x) => x.group_id === g.id && !x.left_at).length, invite_code: m.role === 'owner' && g.kind === 'team' ? g.code : null };
        }),
    };
  };
  const err = (route, status, message, hint, code = 'P0001') => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code, message, hint, details: null }) });
  const ok = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

  const rpc = {
    app_me: (uid) => me(uid),
    app_touch: () => null,
    app_usage: (uid) => {
      const g = activeGroup(uid);
      const n = (t) => state.tables[t].filter((r) => r.group_id === g && !r.deleted_at).length;
      return { homework: n('homework'), homework_max: 50, study_entries: n('study_entries'), study_entries_max: 100, members: state.memberships.filter((m) => m.group_id === g && !m.left_at).length, members_max: 8, documents_max: 0 };
    },
    app_start_trial: (uid) => {
      const u = user(uid);
      u.ents ??= [];
      if (!u.ents.some((e) => e.plan === 'trial')) u.ents.push({ id: randomUUID(), plan: 'trial', source: 'trial', ends_at: new Date(Date.now() + 14 * 864e5).toISOString() });
      return ensureSolo(uid);
    },
    app_open_solo: (uid, _a, route) => {
      if (!level(user(uid)) && !state.groups.some((g) => g.owner === uid && g.kind === 'solo')) return err(route, 400, 'Für einen eigenen Lernbereich die Testphase starten oder Solo wählen.', 'plus_required');
      return ensureSolo(uid);
    },
    app_beta_purchase: (uid, a, route) => {
      if (!state.betaEnabled) return err(route, 400, 'Käufe sind gerade nicht möglich.', 'beta_closed');
      if (!PRICES[a.p_plan]) return err(route, 400, 'Unbekannter Tarif');
      const u = user(uid);
      u.ents ??= [];
      const months = a.p_plan.endsWith('semester') ? 6 : 1;
      const e = { id: randomUUID(), plan: a.p_plan, source: 'beta', auto_renew: months === 1, ends_at: new Date(Date.now() + months * 30 * 864e5).toISOString() };
      u.ents.push(e);
      state.betaPurchases.push({ user: uid, plan: a.p_plan, cents: PRICES[a.p_plan] });
      return { entitlement_id: e.id, ends_at: e.ends_at, group_id: a.p_plan.startsWith('solo') ? ensureSolo(uid) : null };
    },
    app_beta_cancel: (uid, a) => {
      const e = (user(uid).ents ?? []).find((x) => x.id === a.p_entitlement);
      if (e) e.auto_renew = false;
      return null;
    },
    app_remove_member: (uid, a) => {
      const m = state.memberships.find((x) => x.group_id === a.p_group && x.user_id === a.p_user && !x.left_at);
      if (m) m.left_at = now();
      return null;
    },
    app_tutorial_done: (uid) => ((user(uid).tutorial_done = true), null),
    admin_set_config: (uid, a) => ((state.betaEnabled = a.p_value === true), null),
    app_create_group: (uid, a, route) => {
      if (level(user(uid)) !== 'group') return err(route, 400, 'Zum Erstellen einer Lerngruppe wird ein Gruppenpass benötigt.', 'plus_required');
      const g = { id: randomUUID(), name: a.p_name, owner: uid, code: code(), kind: 'team' };
      state.groups.push(g);
      attach(g.id, uid, 'owner', a.p_display_name);
      state.tables.app_settings.push({ group_id: g.id, key: 'app_name', value: a.p_name, version: 1, updated_at: now(), changed_by: null });
      return g.id;
    },
    app_join_group: (uid, a, route) => {
      const g = state.groups.find((x) => x.code === String(a.p_code).toUpperCase() && x.kind === 'team');
      if (!g) return err(route, 400, 'Einladungscode ungültig.', 'invalid_code');
      if (state.memberships.some((m) => m.group_id === g.id && m.user_id === uid && !m.left_at)) return (state.profiles.set(uid, { active_group_id: g.id }), g.id);
      if (!groupHasPlus(g.id)) return err(route, 400, 'Diese Lerngruppe hat derzeit keinen aktiven Gruppenpass.', 'plus_required');
      if (state.memberships.filter((m) => m.group_id === g.id && !m.left_at).length >= 8) return err(route, 400, 'Diese Lerngruppe ist voll (höchstens 8 Mitglieder).', 'member_limit');
      attach(g.id, uid, 'member', a.p_display_name);
      return g.id;
    },
    app_invite_info: (_uid, a) => {
      const g = state.groups.find((x) => x.code === String(a.p_code).toUpperCase());
      return g ? { name: g.name, members: state.memberships.filter((m) => m.group_id === g.id && !m.left_at).length, has_plus: groupHasPlus(g.id) } : null;
    },
    app_switch_group: (uid, a) => (state.profiles.set(uid, { active_group_id: a.p_group }), null),
    app_leave_group: (uid, a) => {
      const m = state.memberships.find((x) => x.group_id === a.p_group && x.user_id === uid);
      if (m) m.left_at = now();
      state.profiles.set(uid, { active_group_id: null });
      return null;
    },
    app_set_display_name: (uid, a) => {
      user(uid).name = a.p_name;
      for (const m of state.tables.members) if (m.user_id === uid) m.name = a.p_name;
      return null;
    },
    app_regenerate_invite: (uid, a) => {
      const g = state.groups.find((x) => x.id === a.p_group && x.owner === uid);
      g.code = code();
      return g.code;
    },
    admin_whoami: (uid, _a, _r, aal) => ({ is_admin: !!user(uid)?.admin, username: user(uid)?.admin ? 'Luke' : null, aal, ok: !!user(uid)?.admin && aal === 'aal2' }),
    admin_stats: (uid, _a, route, aal) => {
      if (!user(uid)?.admin || aal !== 'aal2') return err(route, 403, 'Nur für Administratoren (mit Zwei-Faktor-Anmeldung)', 'admin_required', '42501');
      const users = state.users.filter((u) => !u.admin);
      return {
        users_total: users.length, users_active_7d: users.length, users_online_approx: 1, users_new_7d: users.length, users_new_30d: users.length, users_blocked: 0,
        users_free: users.filter((u) => !level(u)).length, users_plus_member: 0, groups_total: state.groups.filter((g) => g.kind === 'team').length, groups_plus: state.groups.filter((g) => g.kind === 'team' && groupHasPlus(g.id)).length,
        trials_active: users.filter((u) => activeEnts(u).some((e) => e.plan === 'trial')).length, trials_expired: 0, trials_converted: 0,
        solo_spaces: state.groups.filter((g) => g.kind === 'solo').length, group_members_total: state.memberships.filter((m) => !m.left_at && state.groups.find((g) => g.id === m.group_id)?.kind === 'team').length,
        paid_by_plan: { solo_monthly: 0, solo_semester: 0, group_monthly: 0, group_semester: 0 },
        beta_by_plan: Object.fromEntries(Object.keys(PRICES).map((p) => [p, state.betaPurchases.filter((b) => b.plan === p).length])),
        beta_purchases_enabled: state.betaEnabled, beta_active: state.betaPurchases.length, beta_mrr_cents: 0,
        beta_simulated_cents: state.betaPurchases.reduce((a, b) => a + b.cents, 0), beta_cancellations: 0,
        subscriptions_paid_active: 0, semester_passes_active: 0, grants_active: 0, expired_30d: 0, cancellations_30d: 0,
        revenue_cents_total: 0, revenue_cents_30d: 0, mrr_cents: 0, payments_connected: false,
        signups_by_day: Array.from({ length: 30 }, (_, i) => ({ day: new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10), count: i === 29 ? users.length : 0 })),
        db_time: now(),
      };
    },
    admin_users: (uid, _a, route, aal) => {
      if (!user(uid)?.admin || aal !== 'aal2') return err(route, 403, 'Nur für Administratoren', 'admin_required', '42501');
      return state.users.map((u) => ({ id: u.id, email: u.email, display_name: u.name, status: u.status, plan: activeEnts(u)[0]?.plan ?? 'free', created_at: u.created_at, last_sign_in_at: now(), last_seen_at: now(), online: true, groups: [], is_admin: !!u.admin, total: state.users.length }));
    },
    admin_audit_log: () => [],
    app_send_feedback: (uid, a) => (state.feedback.push({ id: state.feedback.length + 1, created_at: now(), category: a.p_category, message: a.p_message, page: a.p_page, client: a.p_client, contact_ok: !!a.p_contact_ok, status: 'new', email: a.p_contact_ok ? user(uid).email : null, group_name: null }), null),
    admin_feedback: () => state.feedback,
    admin_feedback_status: (_u, a) => ((state.feedback.find((f) => f.id === a.p_id).status = a.p_status), null),
  };

  async function handleAuth(route) {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname.replace(/^.*\/auth\/v1/, '');
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    const c = claims(req.headers()['authorization']);
    state.requests.push({ kind: 'auth', path: p, method: req.method() });
    if (p === '/settings') return ok(route, { external: { email: true, google: state.settings.google, apple: state.settings.apple }, disable_signup: false, mailer_autoconfirm: true });
    if (p === '/signup') {
      if (state.users.some((u) => u.email === body.email)) return ok(route, { code: 'user_already_exists', msg: 'User already registered', error_code: 'user_already_exists' }, 422);
      const u = { id: randomUUID(), email: body.email, password: body.password, name: body.data?.display_name ?? null, ents: [], status: 'active', factors: [], created_at: now() };
      state.users.push(u);
      return ok(route, session(u));
    }
    if (p === '/token') {
      const grant = url.searchParams.get('grant_type');
      if (grant === 'password') {
        const u = state.users.find((x) => x.email === body.email && x.password === body.password);
        if (!u) return ok(route, { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
        return ok(route, session(u));
      }
      if (grant === 'refresh_token') {
        const r = state.refresh.get(body.refresh_token);
        if (!r) return ok(route, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }, 400);
        return ok(route, session(user(r.sub), r.aal));
      }
    }
    if (p === '/user' && c) return user(c.sub) ? ok(route, publicUser(user(c.sub))) : ok(route, { msg: 'not found' }, 404);
    if (p === '/logout') return route.fulfill({ status: 204, body: '' });
    if (p === '/recover') return ok(route, {});
    if (p === '/factors' && req.method() === 'POST' && c) {
      const f = { id: randomUUID(), factor_type: 'totp', status: 'unverified', friendly_name: body.friendly_name, created_at: now(), updated_at: now() };
      user(c.sub).factors.push(f);
      return ok(route, { id: f.id, type: 'totp', totp: { qr_code: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' } });
    }
    const fm = /^\/factors\/([^/]+)(?:\/(challenge|verify))?$/.exec(p);
    if (fm && c) {
      const u = user(c.sub);
      if (req.method() === 'DELETE') return (u.factors = u.factors.filter((f) => f.id !== fm[1]), ok(route, { id: fm[1] }));
      if (fm[2] === 'challenge') return ok(route, { id: randomUUID(), type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 });
      if (fm[2] === 'verify') {
        if (body.code !== '123456') return ok(route, { code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' }, 422);
        const f = u.factors.find((x) => x.id === fm[1]);
        f.status = 'verified';
        return ok(route, session(u, 'aal2'));
      }
    }
    return ok(route, { msg: `mock: ${p}` }, 404);
  }

  async function handleRest(route) {
    const req = route.request();
    const url = new URL(req.url());
    const c = claims(req.headers()['authorization']);
    const aal = c?.aal ?? 'aal1';
    const parts = url.pathname.split('/');
    const name = parts.pop();
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    state.requests.push({ kind: 'rest', name, method: req.method(), user: c?.sub ?? null });
    if (!c || !user(c.sub)) return err(route, 401, 'permission denied', null, '42501');
    const uid = c.sub;
    if (parts.at(-1) === 'rpc') {
      const fn = rpc[name];
      if (!fn) return err(route, 404, `mock: unknown rpc ${name}`, null, 'PGRST202');
      const out = await fn(uid, body ?? {}, route, aal);
      if (out === undefined) return; // Fehler bereits beantwortet
      return ok(route, out);
    }
    if (name === 'attachments') return err(route, 403, 'permission denied for table attachments', null, '42501');
    const g = activeGroup(uid);
    if (name === 'group_members') {
      const list = state.memberships
        .filter((m) => m.group_id === url.searchParams.get('group_id')?.replace('eq.', '') && m.group_id === g && !m.left_at)
        .map((m) => {
          const mem = state.tables.members.find((x) => x.id === m.member_id);
          return { user_id: m.user_id, member_id: m.member_id, role: m.role, members: { name: mem.name, color: mem.color } };
        });
      return ok(route, list);
    }
    const rows = state.tables[name];
    if (!rows) return err(route, 404, `Could not find the table 'public.${name}'`, null, 'PGRST205');
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    const reply = (list, status = 200) =>
      single ? route.fulfill({ status, contentType: 'application/vnd.pgrst.object+json', body: JSON.stringify(list[0] ?? null) }) : ok(route, list, status);
    if (req.method() === 'GET') return reply(rows.filter((r) => r.group_id === g));
    if (!g) return err(route, 403, 'Keine aktive Lerngruppe', 'no_group', '42501');
    if (req.method() === 'POST') {
      if (!['task_completions', 'homework_completions', 'focus_sessions'].includes(name) && !groupHasPlus(g)) {
        const solo = state.groups.find((x) => x.id === g)?.kind === 'solo';
        return err(route, 400, solo ? 'Deine 14-tägige Testphase ist beendet. Deine Inhalte bleiben sichtbar – mit StudySpace Solo kannst du wieder bearbeiten.' : 'Der Gruppenpass dieser Lerngruppe ist abgelaufen.', 'plus_required');
      }
      const items = (Array.isArray(body) ? body : [body]).map((it) => ({ version: 1, created_at: now(), updated_at: now(), ...it, group_id: g }));
      const keyOf = (r) => (name === 'app_settings' ? `${r.group_id}:${r.key}` : name === 'task_completions' ? `${r.task_id}:${r.member_id}` : name === 'homework_completions' ? `${r.target_id}:${r.member_id}` : r.id);
      for (const it of items) {
        const i = rows.findIndex((r) => keyOf(r) === keyOf(it));
        if (i >= 0) rows[i] = { ...rows[i], ...it, version: rows[i].version + 1 };
        else rows.push(it);
      }
      return reply(items, 201);
    }
    if (req.method() === 'PATCH') {
      const id = url.searchParams.get('id')?.replace('eq.', '');
      const out = [];
      rows.forEach((r, i) => {
        if (r.group_id === g && r.id === id) {
          rows[i] = { ...r, ...body, version: r.version + 1, updated_at: now() };
          out.push(rows[i]);
        }
      });
      return reply(out);
    }
    return err(route, 405, 'method');
  }

  async function handleFunctions(route) {
    const req = route.request();
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    state.requests.push({ kind: 'fn', action: body.action });
    const admin = state.users.find((u) => u.admin);
    if (body.action === 'status') return ok(route, { setup_done: !!admin, setup_possible: state.adminSetupPossible });
    if (body.action === 'setup') {
      if (admin) return ok(route, { error: 'Der Admin-Zugang ist bereits eingerichtet.' }, 409);
      if (body.token !== 'test-setup-token-0123456789abcdef') return ok(route, { error: 'Einrichtungsschlüssel falsch.' }, 403);
      state.users.push({ id: randomUUID(), email: 'luke.admin@studyspace-admin.invalid', password: body.password, name: 'Luke', admin: true, ents: [], status: 'active', factors: [], created_at: now() });
      return ok(route, { ok: true, username: 'Luke' });
    }
    if (body.action === 'login') {
      if (!admin || body.username.toLowerCase() !== 'luke' || body.password !== admin.password) return ok(route, { error: 'Benutzername oder Passwort falsch.' }, 401);
      const s = session(admin);
      return ok(route, { access_token: s.access_token, refresh_token: s.refresh_token });
    }
    return ok(route, { error: 'Unbekannte Aktion' }, 400);
  }

  return { state, handleAuth, handleRest, handleFunctions };
}
