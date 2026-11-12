-- Hilfe & Feedback: senden, Tageslimit, nur Admins lesen
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('fb000000-0000-4000-8000-000000000001', 'feedback@example.com');
do $$
declare i int;
begin
  perform ss_test.login('fb000000-0000-4000-8000-000000000001');
  set local role authenticated;
  perform ss_test.expect_error('select public.app_send_feedback(''bug'', ''x'')', 'check');
  perform public.app_send_feedback('bug', 'Der Knopf X reagiert nicht', '#/lernplan', 'Test', true);
  for i in 2..10 loop perform public.app_send_feedback('idea', 'Idee Nummer ' || i); end loop;
  perform ss_test.expect_error('select public.app_send_feedback(''idea'', ''noch eine'')', 'morgen');
  perform ss_test.expect_error('select * from public.feedback', 'permission denied');
  perform ss_test.expect_error('select * from public.admin_feedback(10)', 'Administratoren');
  reset role;
  perform ss_test.login('ad000000-0000-4000-8000-0000000000ad', 'aal2');
  set local role authenticated;
  perform ss_test.assert((select count(*) from public.admin_feedback(50)) = 10, 'Admin sieht Feedback');
  perform ss_test.assert((select email from public.admin_feedback(50) where category = 'bug') = 'feedback@example.com', 'E-Mail nur mit Einverständnis');
  perform ss_test.assert((select count(*) from public.admin_feedback(50) where email is not null) = 1, 'sonst keine E-Mail');
  perform public.admin_feedback_status((select id from public.admin_feedback(50) where category = 'bug'), 'done');
  reset role;
end $$;
