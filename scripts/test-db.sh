#!/usr/bin/env bash
# Testet die SQL-Migrationen gegen eine frische PostgreSQL-Datenbank.
#
#   DATABASE_URL gesetzt  -> nutzt diese (leere!) Datenbank, z. B. in CI
#   sonst                 -> startet einen temporären lokalen Cluster
#                            (benötigt PostgreSQL 15+ Binaries)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILES=(
  "$ROOT/supabase/tests/00_supabase_stubs.sql"
  "$ROOT/supabase/migrations/001_schema.sql"
  "$ROOT/supabase/migrations/002_security.sql"
  "$ROOT/supabase/migrations/003_storage.sql"
  "$ROOT/supabase/migrations/004_push_focus.sql"
  "$ROOT/supabase/migrations/005_homework.sql"
  "$ROOT/supabase/seed.sql"
  # Migrationen ein zweites Mal: prüft, dass sie wiederholbar sind
  "$ROOT/supabase/migrations/001_schema.sql"
  "$ROOT/supabase/migrations/002_security.sql"
  "$ROOT/supabase/migrations/003_storage.sql"
  "$ROOT/supabase/migrations/004_push_focus.sql"
  "$ROOT/supabase/migrations/005_homework.sql"
  "$ROOT/supabase/seed.sql"
  "$ROOT/supabase/tests/10_behaviour_test.sql"
  "$ROOT/supabase/tests/20_push_focus_test.sql"
  "$ROOT/supabase/tests/30_homework_test.sql"
)

run_all() {
  local url="$1"
  for f in "${FILES[@]}"; do
    echo "→ $(basename "$f")"
    psql "$url" -v ON_ERROR_STOP=1 -q -X -f "$f" > /dev/null
  done
  psql "$url" -X -q -t -c "select 'ALLE DATENBANKTESTS BESTANDEN'"
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
