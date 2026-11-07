// Nachbildung der Supabase-REST-API für Browsertests und Bildschirmfotos.
// Gleiche Regeln wie die SQL-Trigger (Versionen, Zeitstempel, Haken).
// Wird von scripts/e2e.mjs und scripts/screens.mjs genutzt.

// ---------------------------------------------------------------------
// In-Memory-Datenbank mit denselben Regeln wie die SQL-Trigger
// ---------------------------------------------------------------------
export const now = () => new Date().toISOString();
const t0 = '2026-11-01T10:00:00.000Z';
export const base = (extra) => ({ version: 1, created_at: t0, updated_at: t0, changed_by: null, ...extra });
export const berlin = (date, time) => new Date(`${date}T${time}:00+01:00`).toISOString(); // Januar = MEZ

export function seed() {
  const members = [
    ['11111111-1111-4111-8111-000000000001', 'Person 1', '#AFC5F5'],
    ['11111111-1111-4111-8111-000000000002', 'Person 2', '#CBB8F5'],
    ['11111111-1111-4111-8111-000000000003', 'Person 3', '#AADCCB'],
    ['11111111-1111-4111-8111-000000000004', 'Person 4', '#F5C6A5'],
  ].map(([id, name, color], i) => base({ id, name, color, sort_order: i + 1, is_active: true }));
  const mods = [
    ['Werkstoffkunde', '#F4B9B6', '2027-01-06', '14:00', '15:30'],
    ['Operations Research und Beschaffung und Produktion', '#E8CB9D', '2027-01-08', '08:30', '10:00'],
    ['Thermodynamik und Strömungslehre', '#A6DED7', '2027-01-11', '14:00', '15:30'],
    ['Angewandte Mathematik', '#C9B7F2', '2027-01-14', '14:00', '15:30'],
    ['Controlling', '#B4D3F2', '2027-01-18', '14:00', '15:30'],
    ['Konstruktion', '#C3D7AD', '2027-01-20', '11:00', '12:30'],
  ];
  const modules = mods.map(([name, color], i) => base({ id: `22222222-2222-4222-8222-00000000000${i + 1}`, name, color, description: null, sort_order: i + 1, archived_at: null }));
  const exams = mods.map(([, , d, s, e], i) =>
    base({ id: `44444444-4444-4444-8444-00000000000${i + 1}`, module_id: modules[i].id, starts_at: berlin(d, s), ends_at: berlin(d, e), timezone: 'Europe/Berlin', location: null, notes: null, deleted_at: null }),
  );
  const module_topics = [
    ['21', 1, 'Operations Research'],
    ['22', 1, 'Beschaffung und Produktion'],
    ['31', 2, 'Thermodynamik'],
    ['32', 2, 'Strömungslehre'],
    ['61', 5, 'Technisches Zeichnen'],
  ].map(([n, m, title], i) => base({ id: `33333333-3333-4333-8333-0000000000${n}`, module_id: modules[m].id, title, description: null, sort_order: i + 1, archived_at: null }));
  return {
    members, modules, module_topics, exams,
    study_entries: [], tasks: [], task_completions: [], attachments: [],
    app_settings: [{ key: 'app_name', value: 'StudySpace', version: 1, updated_at: t0, changed_by: null }],
    activity_log: [],
  };
}

export const db = seed();
export const requests = [];
const pk = (table, row) => (table === 'task_completions' ? `${row.task_id}:${row.member_id}` : table === 'app_settings' ? row.key : row.id);

function parseFilters(url) {
  const f = [];
  for (const [k, v] of url.searchParams) {
    if (['select', 'order', 'offset', 'limit', 'on_conflict', 'columns'].includes(k)) continue;
    const m = /^(eq|lt|gt)\.(.*)$/.exec(v);
    if (m) f.push([k, m[1], m[2]]);
  }
  return f;
}
const match = (row, filters) => filters.every(([k, op, v]) => (op === 'eq' ? String(row[k]) === v : op === 'lt' ? row[k] < Number(v) : row[k] > Number(v)));

function touch(table, row, old) {
  const t = now();
  const next = { ...old, ...row, updated_at: t, version: old ? old.version + 1 : 1 };
  if (!old && table !== 'app_settings') next.created_at = t;
  if (table === 'attachments' && !old) next.uploaded_at = t;
  if (table === 'task_completions') next.completed_at = next.is_completed ? (old?.is_completed ? old.completed_at : t) : null;
  return next;
}

export async function handle(route) {
  const req = route.request();
  const url = new URL(req.url());
  const table = url.pathname.split('/').pop();
  const method = req.method();
  const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  requests.push({ method, table, body, url: url.search });
  if (process.env.FAIL_WRITES && method !== 'GET') return route.fulfill({ status: 503, body: JSON.stringify({ message: 'Service unavailable' }) });
  const rows = db[table];
  if (!rows) return route.fulfill({ status: 404, body: '{}' });
  const reply = (list, status = 200) => {
    if (single) {
      if (list.length !== 1) return route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: 'no rows' }) });
      return route.fulfill({ status, contentType: 'application/vnd.pgrst.object+json', body: JSON.stringify(list[0]) });
    }
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(list) });
  };
  const filters = parseFilters(url);
  if (method === 'GET') {
    let list = rows.filter((r) => match(r, filters));
    const order = url.searchParams.get('order');
    if (order?.includes('id.desc')) list = [...list].reverse();
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 1000);
    return reply(list.slice(offset, offset + limit));
  }
  if (method === 'POST') {
    const items = Array.isArray(body) ? body : [body];
    const upsert = url.searchParams.has('on_conflict');
    const out = [];
    for (const item of items) {
      const idx = rows.findIndex((r) => pk(table, r) === pk(table, item));
      if (idx >= 0 && !upsert) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: '23505', message: 'duplicate' }) });
      const next = touch(table, item, idx >= 0 ? rows[idx] : undefined);
      if (idx >= 0) rows[idx] = next;
      else rows.push(next);
      out.push(next);
    }
    return reply(out, 201);
  }
  if (method === 'PATCH') {
    const out = [];
    rows.forEach((r, i) => {
      if (match(r, filters)) {
        rows[i] = touch(table, body, r);
        out.push(rows[i]);
      }
    });
    if (!single && out.length === 0) return reply([]);
    return reply(out);
  }
  return route.fulfill({ status: 405, body: '{}' });
}

