-- ELSATIA — PRODUCTION INCIDENT RESPONSE & SAFE MODE V1
-- Migration 20260928000701_incident_safe_mode_v1.sql.
--
-- Couvre : structure et ACL, couverture des gardes sur TOUTES les tables,
-- instantané public sans secret, RBAC (admin client, rôles plateforme non
-- `total`, AAL1, service_role, anon), journal append-only, lecture seule
-- globale / par application, coupure d'application (sessions vs chemins
-- serveur), uploads, liens publics, invitations, verrou de réconciliation
-- Stripe, expiration, chemin opérateur SQL, statuts de service, et absence de
-- toute perte de données après levée.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

-- Membres plateforme non `total` (identité canonique complète).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'support-inc@invalid.local', crypt('t', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'lecture-inc@invalid.local', crypt('t', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 'factu-inc@invalid.local', crypt('t', gen_salt('bf')), now(), now(), now())
on conflict (id) do nothing;
insert into public.plateforme_admins (email, role, utilisateur_id, actif, statut_identite, activation_at) values
  ('support-inc@invalid.local', 'support', '30000000-0000-0000-0000-0000000000a1', true, 'active', now()),
  ('lecture-inc@invalid.local', 'lecture', '30000000-0000-0000-0000-0000000000a2', true, 'active', now()),
  ('factu-inc@invalid.local', 'facturation', '30000000-0000-0000-0000-0000000000a3', true, 'active', now())
on conflict (email) do update set role = excluded.role, utilisateur_id = excluded.utilisateur_id,
  actif = true, statut_identite = 'active';

create function pg_temp.jwt(p_sub text, p_role text, p_aal text default 'aal2') returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', p_role, 'aal', p_aal)::text, true);
$$;
create function pg_temp.jwt_vide() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
$$;
grant execute on function pg_temp.jwt(text, text, text) to public;
grant execute on function pg_temp.jwt_vide() to public;

-- Données témoins (aucune ne doit bouger pendant les gels).
select set_config('incident.test_nb_chantiers', (select count(*)::text from public.chantiers), true);
select set_config('incident.test_nb_entreprises', (select count(*)::text from public.entreprises), true);

-- ═════════════ 1. Structure / ACL ═════════════
select has_table('public', 'incident_controles', 'table incident_controles');
select has_table('public', 'incident_statuts_services', 'table incident_statuts_services');
select has_table('public', 'incident_journal', 'table incident_journal');
select ok((select relrowsecurity from pg_class where oid = 'public.incident_controles'::regclass), 'RLS incident_controles');
select ok((select relrowsecurity from pg_class where oid = 'public.incident_journal'::regclass), 'RLS incident_journal');
select ok(not has_table_privilege('authenticated', 'public.incident_controles', 'INSERT,UPDATE,DELETE,SELECT'),
  'authenticated n''a aucun privilège direct sur incident_controles');
select ok(not has_table_privilege('service_role', 'public.incident_controles', 'INSERT,UPDATE,DELETE'),
  'service_role ne peut pas écrire directement incident_controles');
select ok(not has_table_privilege('service_role', 'public.incident_journal', 'INSERT,UPDATE,DELETE,TRUNCATE'),
  'service_role ne peut ni écrire ni effacer le journal');
select ok(not has_function_privilege('authenticated', 'public.incident_basculer_operateur(text,text,text,boolean,text,text,integer)', 'EXECUTE'),
  'chemin opérateur SQL : authenticated exclu');
select ok(not has_function_privilege('service_role', 'public.incident_basculer_operateur(text,text,text,boolean,text,text,integer)', 'EXECUTE'),
  'chemin opérateur SQL : service_role exclu');
select ok(not has_function_privilege('anon', 'public.plateforme_incident_basculer(text,text,boolean,text,text,integer)', 'EXECUTE'),
  'anon ne peut pas appeler la bascule');
select ok(not has_function_privilege('service_role', 'public._incident_basculer(text,text,boolean,text,text,integer,uuid,text,text)', 'EXECUTE'),
  'cœur de bascule interne inaccessible');
select ok(has_function_privilege('anon', 'public.incident_etat_public()', 'EXECUTE'), 'état public lisible par anon');
select ok(not (select prosecdef from pg_proc where oid = 'public.incident_etat_public()'::regprocedure),
  'état public en SECURITY INVOKER (aucune fonction définisseuse de plus exposée à anon)');
select ok(has_column_privilege('anon', 'public.incident_controles', 'controle', 'SELECT'), 'anon lit la colonne controle');
select ok(not has_column_privilege('anon', 'public.incident_controles', 'motif', 'SELECT'), 'anon ne lit JAMAIS le motif');
select ok(not has_column_privilege('anon', 'public.incident_controles', 'incident_ref', 'SELECT'), 'anon ne lit jamais la référence');
select ok(not has_column_privilege('authenticated', 'public.incident_controles', 'maj_par_libelle', 'SELECT'), 'authenticated ne lit jamais l''auteur');
select ok(not has_function_privilege('anon', 'public.incident_upload_ouvert(text)', 'EXECUTE'), 'garde upload non exposée à anon');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'incident\_%'
              and has_function_privilege('anon', p.oid, 'EXECUTE')), 1,
  'une seule fonction incident_* exécutable par anon : incident_etat_public (SECURITY INVOKER)');
select is((select count(*)::int from public.incident_statuts_services), 12, '12 services suivis');
select is((select count(*)::int from public.incident_statuts_services where statut <> 'OPERATIONAL'), 0, 'tous OPERATIONAL au départ');

-- ═════════════ 2. Couverture des gardes ═════════════
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
      and not public.incident_table_exemptee(c.relname)
      and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'incident_garde_ecriture')),
  0,
  'toute table public non exemptée porte la garde (sinon : appeler incident_installer_gardes() dans la migration)');
select is(
  (select count(*)::int from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where t.tgname = 'incident_garde_ecriture' and public.incident_table_exemptee(c.relname)),
  0, 'aucune table d''infrastructure exemptée n''est gardée');
select is(public.incident_application_table('reserves_photos'), 'reserves', 'mapping reserves');
select is(public.incident_application_table('studio_render_jobs'), 'studio', 'mapping studio');
select is(public.incident_application_table('tools_releves'), 'tools', 'mapping tools');
select is(public.incident_application_table('colors_seaux'), 'colors', 'mapping colors');
select is(public.incident_application_table('chantiers'), 'gestion_pro', 'mapping gestion pro');
select is(public.incident_application_table('entreprises'), 'socle', 'entreprises = socle partagé');
select is(public.incident_application_table('plateforme_admins'), 'socle', 'plateforme = socle');
select ok(
  (select bool_and(p.prosrc like '%incident_exiger_ouvert%') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('document_commercial_par_token','document_commercial_public_par_token',
      'document_partage_media_path','reserves_invitation_consulter','reserves_invitation_accepter')),
  'les 5 points d''entrée publics sont enveloppés par la garde');
select ok(not has_function_privilege('anon', 'public.document_commercial_par_token__brut(text)', 'EXECUTE'),
  'fonction brute de lien public inaccessible à anon');
select ok(not has_function_privilege('service_role', 'public.document_commercial_public_par_token__brut(text)', 'EXECUTE'),
  'fonction brute de lien public inaccessible à service_role');
select ok(exists(select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'incident_gel_uploads_insert' and permissive = 'RESTRICTIVE'),
  'politique RESTRICTIVE de gel des uploads présente');

-- ═════════════ 3. État public sans secret ═════════════
set local role anon;
select lives_ok($$select public.incident_etat_public()$$, 'anon lit l''état public');
select is(jsonb_array_length(public.incident_etat_public() -> 'controles'), 0, 'aucun contrôle actif au départ');
select throws_ok($$select motif from public.incident_controles$$, '42501', null, 'lecture directe du motif refusée à anon');
reset role;

-- ═════════════ 4. RBAC : qui peut basculer ═════════════
set local role authenticated;
select pg_temp.jwt('10000000-0000-0000-0000-000000000001', 'authenticated');
select throws_ok($$select public.plateforme_incident_basculer('global','lecture_seule',true,'tentative admin client')$$,
  '42501', null, 'un ADMIN CLIENT (AAL2) ne peut jamais déclencher un kill-switch');
select pg_temp.jwt('30000000-0000-0000-0000-0000000000a1', 'authenticated');
select throws_ok($$select public.plateforme_incident_basculer('global','lecture_seule',true,'tentative support')$$,
  '42501', null, 'rôle plateforme support refusé');
select pg_temp.jwt('30000000-0000-0000-0000-0000000000a2', 'authenticated');
select throws_ok($$select public.plateforme_incident_basculer('global','lecture_seule',true,'tentative lecture')$$,
  '42501', null, 'rôle plateforme lecture refusé');
select pg_temp.jwt('30000000-0000-0000-0000-0000000000a3', 'authenticated');
select throws_ok($$select public.plateforme_incident_basculer('global','lecture_seule',true,'tentative facturation')$$,
  '42501', null, 'rôle plateforme facturation refusé');
select pg_temp.jwt('30000000-0000-0000-0000-000000000001', 'authenticated', 'aal1');
select throws_like($$select public.plateforme_incident_basculer('global','lecture_seule',true,'total sans MFA')$$,
  '%AAL2%', 'rôle total SANS AAL2 refusé');
select pg_temp.jwt('30000000-0000-0000-0000-000000000001', 'authenticated');
select throws_ok($$select public.plateforme_incident_basculer('global','lecture_seule',true,'court')$$,
  '22023', null, 'motif trop court refusé');
select throws_ok($$select public.plateforme_incident_basculer('planete','lecture_seule',true,'portée inconnue test')$$,
  '22023', null, 'portée inconnue refusée');
select throws_ok($$select public.plateforme_incident_basculer('reserves','reconciliation_stripe_requise',true,'verrou non global test')$$,
  '22023', null, 'verrou Stripe uniquement global');
reset role;
set local role service_role;
select pg_temp.jwt_vide();
select throws_ok($$select public.plateforme_incident_basculer('global','lecture_seule',true,'service role tentative')$$,
  '42501', null, 'service_role (aucune identité) refusé');
reset role;
select is((select count(*)::int from public.incident_journal), 0, 'aucune tentative refusée n''a modifié l''état');
select is((select count(*)::int from public.incident_controles), 0, 'aucun contrôle créé par une tentative refusée');

-- ═════════════ 5. Lecture seule Gestion Pro uniquement ═════════════
set local role authenticated;
select pg_temp.jwt('30000000-0000-0000-0000-000000000001', 'authenticated');
select lives_ok($$select public.plateforme_incident_basculer('gestion_pro','lecture_seule',true,'INC-TEST corruption factures','INC-1')$$,
  'total + AAL2 active la lecture seule Gestion Pro');
select is(public.incident_etat_public() -> 'controles', '[{"portee":"gestion_pro","controle":"lecture_seule"}]'::jsonb,
  'l''état public expose le drapeau…');
select ok(public.incident_etat_public()::text not like '%corruption%' and public.incident_etat_public()::text not like '%INC-1%'
          and public.incident_etat_public()::text not like '%plateforme@%',
  '…mais jamais le motif, la référence ni l''auteur');

select pg_temp.jwt('10000000-0000-0000-0000-000000000001', 'authenticated');
select throws_ok($$update public.chantiers set nom = nom where entreprise_id = 'a0000000-0000-0000-0000-000000000001'$$,
  'PT503', null, 'GP en lecture seule : écriture utilisateur refusée (503)');
select lives_ok($$select count(*) from public.chantiers$$, 'GP en lecture seule : lecture conservée');
select lives_ok($$update public.reserves set updated_at = updated_at where false$$,
  'isolation : Réserves reste inscriptible');
select lives_ok($$update public.tools_releves set updated_at = updated_at where false$$,
  'isolation : Tools reste inscriptible');
reset role;
select pg_temp.jwt('00000000-0000-0000-0000-000000000000', 'service_role');
select throws_ok($$update public.chantiers set nom = nom where false$$,
  'PT503', null, 'lecture seule : chemins service_role aussi gelés');
select pg_temp.jwt_vide();
select throws_ok($$update public.chantiers set nom = nom where false$$,
  'PT503', null, 'lecture seule : même un job sans JWT (cron) est gelé');
select lives_ok($$update public.entreprises set nom = nom where false$$,
  'socle partagé non gelé par une portée d''application');
-- Contournement opérateur explicite (console SQL uniquement).
set local elsatia.incident_contournement = 'on';
select lives_ok($$update public.chantiers set nom = nom where false$$,
  'contournement opérateur explicite (hors PostgREST) autorisé');
reset elsatia.incident_contournement;

-- ═════════════ 6. Journal append-only ═════════════
select is((select count(*)::int from public.incident_journal where action = 'controle_active'
            and portee = 'gestion_pro' and controle = 'lecture_seule'
            and acteur_id = '30000000-0000-0000-0000-000000000001' and acteur_role = 'total'), 1,
  'activation journalisée avec l''acteur et son rôle');
select is((select count(*)::int from public.plateforme_journal_actions where action = 'incident_controle_active'), 1,
  'continuité : journal plateforme historique alimenté');
select throws_ok($$update public.incident_journal set motif = 'effacé'$$, '42501', null, 'journal : UPDATE refusé (même superuser)');
select throws_ok($$delete from public.incident_journal$$, '42501', null, 'journal : DELETE refusé');
select throws_ok($$truncate public.incident_journal$$, '42501', null, 'journal : TRUNCATE refusé');

set local role authenticated;
select pg_temp.jwt('10000000-0000-0000-0000-000000000001', 'authenticated');
select throws_ok($$select * from public.plateforme_incident_journal_lister(10)$$, '42501', null,
  'un admin client ne lit pas le journal d''incident');
select pg_temp.jwt('30000000-0000-0000-0000-0000000000a2', 'authenticated');
select is((select count(*)::int from public.plateforme_incident_journal_lister(10)), 1,
  'un membre plateforme (lecture) peut auditer le journal');

-- Levée : les écritures reprennent, aucune donnée touchée.
select pg_temp.jwt('30000000-0000-0000-0000-000000000001', 'authenticated');
select lives_ok($$select public.plateforme_incident_basculer('gestion_pro','lecture_seule',false,'INC-1 résolu, réouverture')$$,
  'levée de la lecture seule GP');
select pg_temp.jwt('10000000-0000-0000-0000-000000000001', 'authenticated');
select lives_ok($$update public.chantiers set nom = nom where false$$, 'après levée : écriture GP rétablie');
reset role;
select is((select count(*)::text from public.chantiers), current_setting('incident.test_nb_chantiers'),
  'aucune donnée supprimée par le gel');
select is((select count(*)::int from public.incident_journal), 2, 'désactivation journalisée');

-- Désactiver un contrôle déjà inactif : idempotent, pas de bruit dans le journal.
set local role authenticated;
select pg_temp.jwt('30000000-0000-0000-0000-000000000001', 'authenticated');
select is((public.plateforme_incident_basculer('gestion_pro','lecture_seule',false,'double levée idempotente') ->> 'change'),
  'false', 'double levée sans effet');
reset role;
select is((select count(*)::int from public.incident_journal), 2, 'double levée non journalisée');
set local role authenticated;
select pg_temp.jwt('30000000-0000-0000-0000-000000000001', 'authenticated');
select is((public.plateforme_incident_basculer('colors','exports',false,'levée d''un contrôle jamais posé') ->> 'change'),
  'false', 'lever un contrôle jamais posé : sans effet');
reset role;
select is((select count(*)::int from public.incident_controles where portee = 'colors'), 0, 'aucune ligne parasite créée');

-- ═════════════ 7. Lecture seule GLOBALE ═════════════
set local role authenticated;
select pg_temp.jwt('30000000-0000-0000-0000-000000000001', 'authenticated');
select lives_ok($$select public.plateforme_incident_basculer('global','lecture_seule',true,'INC-2 fuite suspectée, gel global')$$,
  'lecture seule globale activée');
select pg_temp.jwt('10000000-0000-0000-0000-000000000001', 'authenticated');
select throws_ok($$update public.reserves set updated_at = updated_at where false$$, 'PT503', null, 'global : Réserves gelé');
select throws_ok($$update public.tools_releves set updated_at = updated_at where false$$, 'PT503', null, 'global : Tools gelé');
select throws_ok($$update public.entreprises set nom = nom where false$$, 'PT503', null, 'global : socle gelé');
reset role;
select pg_temp.jwt('00000000-0000-0000-0000-000000000000', 'service_role');
select throws_ok($$select * from public.studio_render_dispatch()$$, 'PT503', null,
  'global : le worker Studio ne peut plus réclamer ni marquer de job (aucun job perdu : rien n''est modifié)');
select lives_ok($$select public.consommer_rate_limit('test:incident', repeat('a', 64), 60, 10)$$,
  'global : la limitation anti-abus continue de fonctionner (table exemptée)');
select lives_ok($$select public.incident_etat_public()$$, 'global : état toujours lisible');
-- Pilotage toujours possible pendant le gel (sinon impasse).
set local role authenticated;
select pg_temp.jwt('30000000-0000-0000-0000-0000000000a1', 'authenticated');
select lives_ok($$select public.plateforme_incident_statut_definir('gestion_pro','READ_ONLY','Maintenance de sécurité en cours.','INC-2 communication clients')$$,
  'support AAL2 peut publier un statut pendant le gel');
select pg_temp.jwt('30000000-0000-0000-0000-0000000000a2', 'authenticated');
select throws_ok($$select public.plateforme_incident_statut_definir('gestion_pro','OUTAGE',null,'lecture tente statut')$$,
  '42501', null, 'rôle lecture ne peut pas publier de statut');
select pg_temp.jwt('30000000-0000-0000-0000-0000000000a1', 'authenticated');
select throws_ok($$select public.plateforme_incident_statut_definir('gestion_pro','PANIQUE',null,'statut invalide test')$$,
  '22023', null, 'statut hors énumération refusé');
select is(public.incident_etat_public() #>> '{statuts,gestion_pro,statut}', 'READ_ONLY', 'statut public READ_ONLY exposé');
select pg_temp.jwt('30000000-0000-0000-0000-000000000001', 'authenticated');
select lives_ok($$select public.plateforme_incident_basculer('global','lecture_seule',false,'INC-2 confiné, levée du gel')$$,
  'levée globale');
reset role;
select is((select count(*)::text from public.entreprises), current_setting('incident.test_nb_entreprises'),
  'aucune entreprise supprimée');

-- ═════════════ 8. Coupure d'application (Studio) ═════════════
set local role authenticated;
select pg_temp.jwt('30000000-0000-0000-0000-000000000001', 'authenticated');
select lives_ok($$select public.plateforme_incident_basculer('reserves','app_coupee',true,'INC-3 Réserves coupée seule')$$,
  'coupure de Réserves seule');
select pg_temp.jwt('10000000-0000-0000-0000-000000000001', 'authenticated');
select throws_ok($$update public.reserves set updated_at = updated_at where false$$, 'PT503', null,
  'Réserves coupée : écriture d''une session utilisateur refusée (même via PostgREST direct)');
select lives_ok($$update public.chantiers set nom = nom where false$$, 'Réserves coupée : Gestion Pro continue');
reset role;
select pg_temp.jwt('00000000-0000-0000-0000-000000000000', 'service_role');
select lives_ok($$update public.reserves set updated_at = updated_at where false$$,
  'Réserves coupée : chemins serveur (webhooks, réconciliation) autorisés');
set local role authenticated;
select pg_temp.jwt('30000000-0000-0000-0000-000000000001', 'authenticated');
select lives_ok($$select public.plateforme_incident_basculer('reserves','app_coupee',false,'INC-3 Réserves rétablie')$$, 'rétablissement Réserves');
reset role;

-- ═════════════ 9. Uploads, liens publics, invitations ═════════════
set local role authenticated;
select pg_temp.jwt('30000000-0000-0000-0000-000000000001', 'authenticated');
select lives_ok($$select public.plateforme_incident_basculer('reserves','uploads',true,'INC-4 uploads malveillants Réserves')$$, 'gel uploads Réserves');
select is(public.incident_upload_ouvert('reserves-photos'), false, 'upload bucket reserves-photos fermé');
select is(public.incident_upload_ouvert('devis-medias'), true, 'upload GP toujours ouvert');
select lives_ok($$select public.plateforme_incident_basculer('reserves','uploads',false,'INC-4 uploads Réserves rouverts')$$, 'réouverture uploads');
select is(public.incident_upload_ouvert('reserves-photos'), true, 'upload Réserves rouvert');

select lives_ok($$select public.plateforme_incident_basculer('gestion_pro','liens_publics',true,'INC-5 liens publics bloqués')$$, 'blocage liens publics');
reset role;
set local role anon;
select pg_temp.jwt_vide();
select throws_ok($$select * from public.document_commercial_par_token('x')$$, 'PT503', null,
  'lien public : résolution refusée par la base');
reset role;
set local role service_role;
select throws_ok($$select public.document_commercial_public_par_token('x')$$, 'PT503', null,
  'lien public : refusé même via le client serveur');
select throws_ok($$select public.document_partage_media_path('x','devis',gen_random_uuid())$$, 'PT503', null,
  'lien public : médias refusés');
reset role;
set local role authenticated;
select pg_temp.jwt('30000000-0000-0000-0000-000000000001', 'authenticated');
select lives_ok($$select public.plateforme_incident_basculer('gestion_pro','liens_publics',false,'INC-5 liens publics rouverts')$$, 'réouverture liens publics');
reset role;
set local role anon;
select pg_temp.jwt_vide();
select lives_ok($$select * from public.document_commercial_par_token('inexistant')$$, 'lien public : délégation rétablie');
reset role;

set local role authenticated;
select pg_temp.jwt('30000000-0000-0000-0000-000000000001', 'authenticated');
select lives_ok($$select public.plateforme_incident_basculer('reserves','invitations',true,'INC-6 abus invitations')$$, 'gel invitations Réserves');
reset role;
set local role anon;
select pg_temp.jwt_vide();
select throws_ok($$select * from public.reserves_invitation_consulter('x')$$, 'PT503', null, 'invitation : consultation refusée');
reset role;
select throws_ok($$insert into public.reserves_invitations default values$$, 'PT503', null,
  'invitation : création refusée (garde de table)');
set local role authenticated;
select pg_temp.jwt('10000000-0000-0000-0000-000000000001', 'authenticated');
select throws_ok($$select public.reserves_invitation_accepter('x', 'a0000000-0000-0000-0000-000000000001')$$, 'PT503', null,
  'invitation : acceptation refusée');
select pg_temp.jwt('30000000-0000-0000-0000-000000000001', 'authenticated');
select lives_ok($$select public.plateforme_incident_basculer('reserves','invitations',false,'INC-6 invitations rouvertes')$$, 'réouverture invitations');
reset role;

-- ═════════════ 10. Verrou de réconciliation Stripe post-restauration ═════════════
select lives_ok($$select public.incident_basculer_operateur('astreinte-julien','global','app_coupee',true,'RESTORE-1 base restaurée, trafic coupé','RESTORE-1')$$,
  'opérateur SQL : coupure globale (Auth potentiellement indisponible)');
select lives_ok($$select public.incident_basculer_operateur('astreinte-julien','global','reconciliation_stripe_requise',true,'RESTORE-1 rejouer Stripe avant réouverture','RESTORE-1')$$,
  'opérateur SQL : verrou de réconciliation Stripe posé');
select is((select acteur_role from public.incident_journal order by id desc limit 1), 'operateur_sql', 'chemin opérateur journalisé comme tel');
select throws_ok($$select public.incident_basculer_operateur('x','global','app_coupee',true,'opérateur anonyme')$$, '22023', null,
  'opérateur non identifié refusé');
-- Pendant la réconciliation : les chemins serveur écrivent (rejeu webhooks), pas les sessions.
select pg_temp.jwt('00000000-0000-0000-0000-000000000000', 'service_role');
select lives_ok($$update public.entreprises set abonnement_statut = abonnement_statut where false$$,
  'réconciliation : le rejeu des webhooks Stripe (service_role) peut écrire');
reset role;
set local role authenticated;
select pg_temp.jwt('10000000-0000-0000-0000-000000000001', 'authenticated');
select throws_ok($$update public.chantiers set nom = nom where false$$, 'PT503', null,
  'réconciliation : les utilisateurs restent dehors');
select pg_temp.jwt('30000000-0000-0000-0000-000000000001', 'authenticated');
select throws_like($$select public.plateforme_incident_basculer('global','app_coupee',false,'tentative réouverture prématurée')$$,
  '%réconciliation Stripe%', 'RÉOUVERTURE REFUSÉE tant que Stripe n''est pas réconcilié');
select lives_ok($$select public.plateforme_incident_basculer('global','reconciliation_stripe_requise',false,'RESTORE-1 rejeu Stripe OK, 0 écart')$$,
  'attestation de réconciliation (levée du verrou)');
select lives_ok($$select public.plateforme_incident_basculer('global','app_coupee',false,'RESTORE-1 réouverture du trafic')$$,
  'réouverture autorisée après réconciliation');
reset role;

-- Statut public posé par l'opérateur SQL (Auth indisponible) : journalisé, jamais par un rôle applicatif.
select ok(not has_function_privilege('authenticated', 'public.incident_statut_operateur(text,text,text,text,text)', 'EXECUTE'),
  'statut opérateur : authenticated exclu');
select ok(not has_function_privilege('service_role', 'public.incident_statut_operateur(text,text,text,text,text)', 'EXECUTE'),
  'statut opérateur : service_role exclu');
select lives_ok($$select public.incident_statut_operateur('astreinte-julien','auth','OUTAGE','Connexion momentanément indisponible.','RESTORE-1 GoTrue en panne')$$,
  'statut posé en SQL par l''opérateur');
select is(public.incident_etat_public() #>> '{statuts,auth,statut}', 'OUTAGE', 'statut opérateur visible publiquement');
select is((select acteur_role from public.incident_journal where action = 'statut_modifie' order by id desc limit 1), 'operateur_sql',
  'statut opérateur journalisé');
select throws_ok($$select public.incident_statut_operateur('astreinte-julien','auth','OUTAGE',null,'court')$$, '22023', null,
  'statut opérateur : motif obligatoire');

-- ═════════════ 11. Expiration automatique ═════════════
set local role authenticated;
select pg_temp.jwt('30000000-0000-0000-0000-000000000001', 'authenticated');
select lives_ok($$select public.plateforme_incident_basculer('studio','exports',true,'INC-7 exports Studio 30 min',null,30)$$, 'contrôle temporisé');
select is(public.incident_controle_actif('studio','exports'), true, 'actif avant échéance');
select throws_ok($$select public.plateforme_incident_basculer('studio','exports',true,'expiration hors bornes',null,99999)$$, '22023', null,
  'expiration > 7 jours refusée');
reset role;
update public.incident_controles set expire_at = now() - interval '1 second' where portee = 'studio' and controle = 'exports';
select is(public.incident_controle_actif('studio','exports'), false, 'expiré : inactif sans action humaine');
select is(jsonb_array_length(public.incident_etat_public() -> 'controles'), 0, 'expiré : absent de l''état public');

-- ═════════════ 12. Bilan journal ═════════════
select is((select count(*)::int from public.incident_journal where action like 'controle_%'), 17, 'chaque bascule effective est tracée (17 bascules effectives dans ce scénario)');
select is((select count(*)::int from public.incident_journal where motif is null or char_length(motif) < 10), 0,
  'aucune entrée de journal sans motif');

select * from finish();
rollback;
