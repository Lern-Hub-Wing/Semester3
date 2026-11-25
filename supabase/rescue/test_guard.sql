-- Reparatur-Test: das komplette App-Schema verweigert die Datenbank der Seite (nichts wird geändert)
\set ON_ERROR_STOP off
\o /dev/null
\i supabase-app/app_schema.sql
\o
\set ON_ERROR_STOP on
do $$ begin
  if to_regclass('public.groups') is not null then raise exception 'Schutz wirkt nicht: App-Schema wurde in der Seite ausgeführt'; end if;
end $$;
