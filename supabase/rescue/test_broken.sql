-- Reparatur-Test, Teil 2: nach dem App-Schema ist die Seite „leer“ (kein Lesezugriff)
do $$
begin
  set local role anon;
  begin
    perform count(*) from public.modules;
    raise exception 'Test falsch: anon kann noch lesen';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;
