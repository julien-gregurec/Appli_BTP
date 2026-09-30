-- ELSATIA Studio — mode sûr du projet DÉDIÉ (migration 20260929180000_studio_incident_control).
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

update studio_guard.control set mode = 'read_write', reason = null, allow_unlinked_writes = false;
select set_config('incident.depart', (select count(*)::text from studio_guard.control_journal), true);

-- Structure / ACL
select ok(not has_function_privilege('authenticated', 'studio_guard.set_mode(text,text,text)', 'EXECUTE'), 'set_mode : authenticated exclu');
select ok(not has_function_privilege('service_role', 'studio_guard.set_mode(text,text,text)', 'EXECUTE'), 'set_mode : service_role exclu');
select ok(has_function_privilege('anon', 'public.incident_etat_public()', 'EXECUTE'), 'état public lisible par anon (proxy)');
select ok(not has_table_privilege('service_role', 'studio_guard.control_journal', 'INSERT,UPDATE,DELETE,TRUNCATE'), 'journal non modifiable par service_role');
select is((public.incident_etat_public() -> 'controles'), '[]'::jsonb, 'read_write : aucun contrôle');
select ok(not has_function_privilege('anon', 'public.incident_worker_sante()', 'EXECUTE'), 'santé worker : anon exclu');
select ok(not has_function_privilege('authenticated', 'public.incident_worker_sante()', 'EXECUTE'), 'santé worker : authenticated exclu');
select is(public.incident_worker_sante() ->> 'rendus_sans_battement', '0', 'santé worker : aucun rendu bloqué au départ');

-- Motif obligatoire, journal automatique même en SQL direct
select throws_ok($$update studio_guard.control set mode = 'read_only', reason = null$$, '22023', null, 'lecture seule sans motif refusée');
select lives_ok($$update studio_guard.control set mode = 'read_only', reason = 'INC-1 test direct'$$, 'bascule SQL directe avec motif');
select is((select nouveau_mode from studio_guard.control_journal order by id desc limit 1), 'read_only', 'bascule SQL directe journalisée');
select is(public.incident_etat_public() -> 'controles', '[{"portee":"studio","controle":"lecture_seule"}]'::jsonb, 'état public : lecture seule');
select ok(public.incident_etat_public()::text not like '%INC-1%', 'le motif n''est jamais public');

-- Écriture utilisateur refusée en lecture seule et en coupure
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000abcd"}', true);
select throws_ok($$select studio_guard.assert_write('public.studio_projects', 'UPDATE')$$, '42501', null, 'lecture seule : écriture utilisateur refusée');
select set_config('request.jwt.claims', '', true);

select lives_ok($$select studio_guard.set_mode('off', 'INC-2 worker compromis, coupure', 'astreinte')$$, 'coupure par l''opérateur');
select is(public.incident_etat_public() -> 'controles',
  '[{"portee":"studio","controle":"app_coupee"},{"portee":"studio","controle":"lecture_seule"}]'::jsonb, 'état public : coupée');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000abcd"}', true);
select throws_ok($$select studio_guard.assert_write('public.studio_projects', 'UPDATE')$$, '42501', null, 'coupée : écriture utilisateur refusée');
select set_config('request.jwt.claims', '', true);
select throws_ok($$select studio_guard.set_mode('off', 'court', 'astreinte')$$, '22023', null, 'set_mode : motif court refusé');
select throws_ok($$select studio_guard.set_mode('off', 'motif suffisant ici', '')$$, '22023', null, 'set_mode : opérateur requis');
select throws_ok($$select studio_guard.set_mode('panique', 'motif suffisant ici', 'astreinte')$$, '23514', null, 'mode inconnu refusé');

-- Journal append-only
select throws_ok($$update studio_guard.control_journal set motif = 'x'$$, '42501', null, 'journal : UPDATE refusé');
select throws_ok($$delete from studio_guard.control_journal$$, '42501', null, 'journal : DELETE refusé');
select throws_ok($$truncate studio_guard.control_journal$$, '42501', null, 'journal : TRUNCATE refusé');

-- Réouverture
select lives_ok($$select studio_guard.set_mode('read_write', 'INC-2 résolu, réouverture', 'astreinte')$$, 'réouverture');
select is(public.incident_etat_public() -> 'controles', '[]'::jsonb, 'état public nominal');
select is((select count(*)::int from studio_guard.control_journal) - current_setting('incident.depart')::int, 3,
  '3 bascules tracées (SQL direct, coupure, réouverture)');
select ok((select bool_and(acteur_session is not null) from studio_guard.control_journal), 'acteur de session toujours tracé');

-- Ligne absente : fail-closed
delete from studio_guard.control;
select is(public.incident_etat_public() -> 'controles', '[{"portee":"studio","controle":"lecture_seule"}]'::jsonb,
  'ligne de contrôle absente : lecture seule annoncée (fail-closed)');
select is((select operation from studio_guard.control_journal order by id desc limit 1), 'DELETE', 'suppression de la ligne tracée');

select * from finish();
rollback;
