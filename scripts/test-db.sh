#!/usr/bin/env bash
# Testet die SQL-Migrationen gegen eine frische PostgreSQL-Datenbank.
#
#   DATABASE_URL gesetzt  -> nutzt diese (leere!) Datenbank, z. B. in CI
#   sonst                 -> startet einen temporären lokalen Cluster
#                            (benötigt PostgreSQL 15+ Binaries)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
#   --app  -> testet stattdessen das Schema der NEUEN App (supabase-app/)
if [[ "${1:-}" == "--app" ]]; then
  APP_MODE=1
  mapfile -t APP_FILES < <(node "$ROOT/scripts/build-app-schema.mjs" --list)
  FILES=("$ROOT/supabase/tests/00_supabase_stubs.sql" "$ROOT/supabase-app/tests/00_auth_stubs.sql")
  for f in "${APP_FILES[@]}"; do FILES+=("$ROOT/$f"); done
  # zweiter Durchlauf über das erzeugte Gesamtskript: wiederholbar?
  FILES+=("$ROOT/supabase-app/app_schema.sql")
  for f in "$ROOT"/supabase-app/tests/[1-9]*_test.sql; do FILES+=("$f"); done
else
FILES=(
  "$ROOT/supabase/tests/00_supabase_stubs.sql"
  "$ROOT/supabase/migrations/001_schema.sql"
  "$ROOT/supabase/migrations/002_security.sql"
  "$ROOT/supabase/migrations/003_storage.sql"
  "$ROOT/supabase/migrations/004_push_focus.sql"
  "$ROOT/supabase/migrations/005_homework.sql"
  "$ROOT/supabase/migrations/006_server_read_access.sql"
  "$ROOT/supabase/migrations/007_music.sql"
  "$ROOT/supabase/migrations/008_focus_realtime.sql"
  "$ROOT/supabase/seed.sql"
  # Migrationen ein zweites Mal: prüft, dass sie wiederholbar sind
  "$ROOT/supabase/migrations/001_schema.sql"
  "$ROOT/supabase/migrations/002_security.sql"
  "$ROOT/supabase/migrations/003_storage.sql"
  "$ROOT/supabase/migrations/004_push_focus.sql"
  "$ROOT/supabase/migrations/005_homework.sql"
  "$ROOT/supabase/migrations/006_server_read_access.sql"
  "$ROOT/supabase/migrations/007_music.sql"
  "$ROOT/supabase/migrations/008_focus_realtime.sql"
  "$ROOT/supabase/seed.sql"
  "$ROOT/supabase/tests/10_behaviour_test.sql"
  "$ROOT/supabase/tests/20_push_focus_test.sql"
  "$ROOT/supabase/tests/30_homework_test.sql"
  "$ROOT/supabase/tests/40_server_access_test.sql"
  "$ROOT/supabase/tests/50_music_test.sql"
)
fi

run_all() {
  local url="$1"
  for f in "${FILES[@]}"; do
    echo "→ $(basename "$f")"
    psql "$url" -v ON_ERROR_STOP=1 -q -X -f "$f" > /dev/null
  done
  if [[ -n "${APP_MODE:-}" ]]; then
    concurrency_test "$url"
    echo "→ push_setup.sql (mit Nachbau von Vault/pg_net/pg_cron)"
    psql "$url" -v ON_ERROR_STOP=1 -q -X -f "$ROOT/supabase-app/tests/push_setup_stubs.sql" > /dev/null
    sed '/create extension/d' "$ROOT/supabase-app/push_setup.sql" | psql "$url" -v ON_ERROR_STOP=1 -q -X > /dev/null
    sed '/create extension/d' "$ROOT/supabase-app/push_setup.sql" | psql "$url" -v ON_ERROR_STOP=1 -q -X > /dev/null
    psql "$url" -v ON_ERROR_STOP=1 -q -X -f "$ROOT/supabase-app/tests/push_setup_test.sql" > /dev/null
  fi
  psql "$url" -X -q -t -c "select 'ALLE DATENBANKTESTS BESTANDEN'"
}

# 13 Personen treten GLEICHZEITIG einer Gruppe mit 7 von 8 Plätzen bei:
# genau eine darf hinein (Zeilensperre in app_join_group).
concurrency_test() {
  local url="$1" code pids=() i
  TMPOUT="$(mktemp -d)"
  echo "→ Parallel-Beitritte"
  psql "$url" -v ON_ERROR_STOP=1 -q -X -f "$ROOT/supabase-app/tests/concurrency_setup.sql" > /dev/null
  code="$(psql "$url" -X -q -t -A -c "select invite_code from public.groups where name = 'Parallel'")"
  for i in $(seq 8 20); do
    psql "$url" -X -q -t -A -v ON_ERROR_STOP=1 -c "begin; select ss_test.login('f0000000-0000-4000-8000-0000000000$(printf %02d "$i")'); set local role authenticated; select pg_sleep(0.3); select public.app_join_group('$code'); commit;" > "$TMPOUT/join$i.log" 2>&1 &
    pids+=($!)
  done
  local ok=0 full=0
  for p in "${pids[@]}"; do wait "$p" || true; done
  ok=$(grep -L "ERROR" "$TMPOUT"/join*.log | wc -l)
  full=$(grep -l "höchstens 8" "$TMPOUT"/join*.log | wc -l)
  if [[ "$ok" != 1 || "$full" != 12 ]]; then
    echo "Parallel-Test: $ok erfolgreich, $full abgelehnt (erwartet 1 / 12)"; cat "$TMPOUT"/join*.log | sort | uniq -c; exit 1
  fi
  psql "$url" -v ON_ERROR_STOP=1 -X -q -t -c "select ss_test.assert((select count(*) from public.group_members gm join public.groups g on g.id = gm.group_id where g.name = 'Parallel' and gm.left_at is null) = 8, 'Parallel: höchstens 8 Mitglieder')" > /dev/null
}

if [[ -n "${DATABASE_URL:-}" ]]; then
  run_all "$DATABASE_URL"
  exit 0
fi

PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[[ -z "$PGBIN" ]] && PGBIN="$(dirname "$(command -v initdb)")"
TMP="$(mktemp -d)"
PORT="${PGPORT_TEST:-55432}"
AS=()
if [[ "$(id -u)" == "0" ]]; then
  chown postgres "$TMP"
  AS=(su postgres -s /bin/bash -c)
  run() { "${AS[@]}" "$*"; }
else
  run() { bash -c "$*"; }
fi
cleanup() { run "$PGBIN/pg_ctl -D $TMP/data -m immediate stop" > /dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
run "$PGBIN/initdb -D $TMP/data -U postgres --auth=trust -E UTF8 --locale=C.UTF-8" > /dev/null
run "$PGBIN/pg_ctl -D $TMP/data -o '-p $PORT -k $TMP -c listen_addresses=' -l $TMP/log -w start" > /dev/null
run_all "postgresql://postgres@/postgres?host=$TMP&port=$PORT"
