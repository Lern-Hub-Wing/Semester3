-- Nachbau von Vault, pg_net und pg_cron für lokale Tests (NICHT in Supabase ausführen)
create schema if not exists vault;
create table if not exists vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text);
create or replace view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create or replace function vault.create_secret(p_secret text, p_name text) returns uuid language sql as $$
  insert into vault.secrets (name, secret) values (p_name, p_secret) returning id $$;
create or replace function vault.update_secret(p_id uuid, p_secret text) returns void language sql as $$
  update vault.secrets set secret = p_secret where id = p_id $$;
create schema if not exists net;
create table if not exists net.calls (id serial, url text, headers jsonb, body jsonb);
create or replace function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int default 5000) returns bigint language sql as $$
  insert into net.calls (url, headers, body) values (url, headers, body) returning id $$;
create schema if not exists cron;
create table if not exists cron.job (jobid serial, jobname text unique, schedule text, command text);
create or replace function cron.schedule(p_name text, p_schedule text, p_command text) returns int language sql as $$
  insert into cron.job (jobname, schedule, command) values (p_name, p_schedule, p_command) returning jobid $$;
create or replace function cron.unschedule(p_id int) returns boolean language sql as $$
  delete from cron.job where jobid = p_id returning true $$;
