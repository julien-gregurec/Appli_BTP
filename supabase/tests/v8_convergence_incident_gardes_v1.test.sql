-- ELSATIA — Train canonique V8 : convergence mode sûr × lots post-V7.
-- Migration 20260928000811_v8_convergence_incident_gardes_v1.sql.
-- Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V8_CONVERGENCE_V1.md (§4).
--
-- Couvre :
--   1. les 4 tables créées par les Lots 8 et 9 APRÈS la migration Incident portent la garde,
--      avec la portée `tools`, et sont réellement gelées en lecture seule `tools` et globale ;
--   2. les tables de l'état commercial par application (Per-App) relèvent du socle : une
--      lecture seule limitée à Gestion Pro ne les gèle pas, la portée globale si ;
--   3. ordre Per-App → Incident : l'enveloppe `reserves_invitation_accepter` délègue à
--      `__brut`, qui porte la décision Per-App (`est_membre_plateforme_actif`), jamais
--      l'état commercial GP ;
--   4. levée : aucune donnée perdue, écritures rouvertes.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- 1. Couverture et portée des gardes (tables Lots 8 / 9).
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and not public.incident_table_exemptee(c.relname)
      and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'incident_garde_ecriture')),
  0, 'V8 : toute table public non exemptée porte la garde (Lots 8 et 9 compris)');

select is(
  (select string_agg(c.relname || '=' || public.incident_application_table(c.relname), ',' order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('tools_releves_metre_ajustements', 'tools_releves_ouvrages',
                        'tools_releves_ouvrages_bibliotheque', 'tools_releves_quantitatif_ajustements')
      and exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'incident_garde_ecriture')),
  'tools_releves_metre_ajustements=tools,tools_releves_ouvrages=tools,tools_releves_ouvrages_bibliotheque=tools,tools_releves_quantitatif_ajustements=tools',
  'V8 : les 4 tables Lots 8 / 9 sont gardées avec la portée tools');

select is(public.incident_application_table('evenements_commerciaux_applications'), 'socle',
  'V8 : événements commerciaux par application = socle');
select is(public.incident_application_table('rapport_migration_suspension_par_app_v1'), 'socle',
  'V8 : rapport de migration Per-App = socle');
select is(public.incident_application_table('acces_applications_entreprises'), 'socle',
  'inchangé : droits par application = socle');
select is(public.incident_application_table('chantiers'), 'gestion_pro', 'inchangé : table GP = gestion_pro');
select is(public.incident_application_table('tools_releves'), 'tools', 'inchangé : table Tools = tools');
select ok(not has_function_privilege('authenticated', 'public.incident_application_table(text)', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.incident_application_table(text)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.incident_application_table(text)', 'EXECUTE'),
  'classement toujours fermé aux rôles d''API');

-- 2. Lecture seule `tools` : les tables Lots 8 / 9 sont gelées, même pour le propriétaire.
select lives_ok($$select public.incident_basculer_operateur('astreinte-v8','tools','lecture_seule',true,'V8 gel tools convergence','V8-1')$$,
  'opérateur SQL : lecture seule tools');
select throws_ok($$delete from public.tools_releves_metre_ajustements where false$$, 'PT503', null,
  'lecture seule tools : Lot 8 ajustements gelés');
select throws_ok($$delete from public.tools_releves_ouvrages where false$$, 'PT503', null,
  'lecture seule tools : Lot 9 ouvrages gelés');
select throws_ok($$delete from public.tools_releves_ouvrages_bibliotheque where false$$, 'PT503', null,
  'lecture seule tools : Lot 9 bibliothèque gelée');
select throws_ok($$delete from public.tools_releves_quantitatif_ajustements where false$$, 'PT503', null,
  'lecture seule tools : Lot 9 ajustements gelés');
select lives_ok($$delete from public.evenements_commerciaux_applications where false$$,
  'lecture seule tools : état commercial Per-App (socle) non gelé');
select lives_ok($$delete from public.chantiers where false$$, 'lecture seule tools : Gestion Pro non gelée');
select lives_ok($$select public.incident_basculer_operateur('astreinte-v8','tools','lecture_seule',false,'V8 levée gel tools convergence','V8-1')$$,
  'levée tools');
select lives_ok($$delete from public.tools_releves_ouvrages where false$$, 'après levée : Lot 9 rouvert');

-- 3. Lecture seule `gestion_pro` : l'état commercial des AUTRES applications reste écrivable.
select lives_ok($$select public.incident_basculer_operateur('astreinte-v8','gestion_pro','lecture_seule',true,'V8 gel GP convergence per-app','V8-2')$$,
  'opérateur SQL : lecture seule gestion_pro');
select throws_ok($$delete from public.chantiers where false$$, 'PT503', null, 'lecture seule GP : GP gelée');
select lives_ok($$delete from public.evenements_commerciaux_applications where false$$,
  'lecture seule GP : événements commerciaux Per-App NON gelés (règle Per-App)');
select lives_ok($$delete from public.rapport_migration_suspension_par_app_v1 where false$$,
  'lecture seule GP : rapport Per-App NON gelé');
select lives_ok($$delete from public.tools_releves_ouvrages where false$$, 'lecture seule GP : Tools non gelé');
select lives_ok($$select public.incident_basculer_operateur('astreinte-v8','gestion_pro','lecture_seule',false,'V8 levée gel GP convergence','V8-2')$$,
  'levée gestion_pro');

-- 4. Lecture seule globale : socle Per-App et tables Lots 8 / 9 gelés.
select lives_ok($$select public.incident_basculer_operateur('astreinte-v8','global','lecture_seule',true,'V8 gel global convergence','V8-3')$$,
  'opérateur SQL : lecture seule globale');
select throws_ok($$delete from public.evenements_commerciaux_applications where false$$, 'PT503', null,
  'global : événements commerciaux Per-App gelés');
select throws_ok($$delete from public.tools_releves_quantitatif_ajustements where false$$, 'PT503', null,
  'global : Lot 9 gelé');
select lives_ok($$select public.incident_basculer_operateur('astreinte-v8','global','lecture_seule',false,'V8 levée gel global convergence','V8-3')$$,
  'levée globale');
select lives_ok($$delete from public.evenements_commerciaux_applications where false$$, 'après levée globale : socle rouvert');

-- 5. Ordre Per-App (…0804) → Incident (…0807) : décision d'invitation Réserves.
select ok(position('reserves_invitation_accepter__brut' in
          (select prosrc from pg_proc where oid = 'public.reserves_invitation_accepter(text,uuid)'::regprocedure)) > 0,
  'enveloppe incident : reserves_invitation_accepter délègue à __brut');
select ok(position('est_membre_plateforme_actif(' in
          (select prosrc from pg_proc where oid = 'public.reserves_invitation_accepter__brut(text,uuid)'::regprocedure)) > 0
      and position('est_membre_actif(' in
          (select prosrc from pg_proc where oid = 'public.reserves_invitation_accepter__brut(text,uuid)'::regprocedure)) = 0,
  'Per-App conservé sous l''enveloppe : __brut décide par appartenance plateforme, pas par l''état commercial GP');
select ok(not has_function_privilege('authenticated', 'public.reserves_invitation_accepter__brut(text,uuid)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.reserves_invitation_accepter(text,uuid)', 'EXECUTE'),
  'seule l''enveloppe gardée est exposée');

-- 6. Journal : chaque bascule de ce test est tracée (append-only).
select is((select count(*)::int from public.incident_journal where incident_ref in ('V8-1', 'V8-2', 'V8-3')), 6,
  'journal : 6 bascules V8 tracées');

select * from finish();
rollback;
