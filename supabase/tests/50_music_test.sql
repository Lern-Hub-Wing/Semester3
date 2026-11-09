-- =====================================================================
-- Migration 007: Musik-Bibliothek – gemeinsame YouTube-Links
-- =====================================================================
\set ON_ERROR_STOP on

begin;
set local role anon;
insert into public.music_tracks (id, category, title, youtube_id, sort_order, changed_by)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'lofi', 'Lofi 1', 'jfKfPfyJRdk', 0, '11111111-1111-4111-8111-000000000001');
select ss_test.assert((select count(*) from public.music_tracks where category = 'lofi') = 1, 'Link gespeichert und für alle lesbar');
select ss_test.expect_error($$insert into public.music_tracks (category, title, youtube_id) values ('lofi', 'x', 'https://evil.example/x')$$, 'music_tracks_youtube_id_check');
select ss_test.expect_error($$insert into public.music_tracks (category, title, youtube_id) values ('techno', 'x', 'jfKfPfyJRdk')$$, 'music_tracks_category_check');
select ss_test.expect_error($$insert into public.music_tracks (category, title, youtube_id) values ('lofi', '  ', 'jfKfPfyJRdk')$$, 'music_tracks_title_check');
update public.music_tracks set title = 'Lofi Study' where id = 'bbbbbbbb-0000-4000-8000-000000000001';
select ss_test.assert((select version from public.music_tracks where id = 'bbbbbbbb-0000-4000-8000-000000000001') = 2, 'Version erhöht');
select ss_test.expect_error($$delete from public.music_tracks$$, 'permission denied');
update public.music_tracks set deleted_at = now() where id = 'bbbbbbbb-0000-4000-8000-000000000001';
commit;

\echo 'MUSIK-TESTS BESTANDEN'
