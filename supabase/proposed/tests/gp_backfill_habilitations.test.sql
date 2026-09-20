-- pgTAP — D1 étape 2 : backfill des habilitations gestion_pro (supabase/proposed/gp_backfill_habilitations_v1.sql.proposed).
--
-- PRÉREQUIS (base JETABLE, jamais Production/Preview), dans cet ordre :
--   1. migrations 1…279 + pgtap ;
--   2. supabase/proposed/per_application_status_and_platform_suspension_v1.sql.proposed ;
--   3. packages/application-access/sql/decision_acces_application.sql.proposed ;
--   4. supabase/proposed/gp_backfill_habilitations_v1.sql.proposed.
-- Le test tourne dans une transaction annulée (rollback) : aucune fixture ne subsiste.
--
-- Fixtures = données HISTORIQUES réalistes : membres avec poste admin / simple / sans poste, compte dépôt,
-- organisation suspendue / annulée / sans abonnement prouvé / sans admin, invité, en attente, désactivé,
-- « pause », employé sorti, administrateur plateforme, entreprise_active_id incohérente, gestes plateforme
-- préexistants (droit d'usage désactivé, habilitation désactivée, habilitation à rôle différent).
begin;
create extension if not exists pgtap with schema extensions;
select plan(73);

-- Les fixtures ne sont pas soumises au plafond de personnes actives (comme fixtures/isolation_multitenant.inc).
set local elsatia.capacite_personnes_bypass = 'on';

-- ── Fixtures ─────────────────────────────────────────────────────────────────────────────────
create function pg_temp.uid(n int) returns uuid language sql immutable as
  $$ select ('c0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.eid(n int) returns uuid language sql immutable as
  $$ select ('d1000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.pid(n int) returns uuid language sql immutable as
  $$ select ('f1000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', pg_temp.uid(n), 'authenticated', 'authenticated',
       'u' || n || '@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()
  from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,20,30,40,50,60,70,80,90]) n;
-- Compte d'authentification SANS profil (cas « comptes sans profil »).
delete from public.utilisateurs where id = pg_temp.uid(90);

insert into public.entreprises(id, nom) values
  (pg_temp.eid(1), 'E1 GP nominale'), (pg_temp.eid(2), 'E2 suspendue'), (pg_temp.eid(3), 'E3 essai termine'),
  (pg_temp.eid(4), 'E4 annulee'), (pg_temp.eid(5), 'E5 sans admin'), (pg_temp.eid(6), 'E6 droit desactive'),
  (pg_temp.eid(7), 'E7 droit plateforme'), (pg_temp.eid(8), 'E8 abonnement non prouve');
update public.entreprises set abonnement_statut = 'suspendu' where id = pg_temp.eid(2);
update public.entreprises set abonnement_essai_debut = current_date - 60, abonnement_essai_fin = current_date - 30 where id = pg_temp.eid(3);
update public.entreprises set abonnement_statut = 'annule' where id = pg_temp.eid(4);
update public.entreprises set abonnement_statut = 'actif' where id = pg_temp.eid(7);
-- Donnée historique : ni offre, ni essai daté, ni statut actif. La contrainte actuelle interdit des dates d'essai
-- nulles (donc le critère « abonnement prouvé » est aujourd'hui toujours vrai) : on la lève, dans cette transaction
-- annulée seulement, pour simuler une ligne antérieure à la contrainte.
alter table public.entreprises drop constraint entreprises_essai_dates_coherentes;
update public.entreprises set abonnement_essai_debut = null, abonnement_essai_fin = null where id = pg_temp.eid(8);

insert into public.postes(id, entreprise_id, nom) values
  (pg_temp.pid(1), pg_temp.eid(1), 'Gerant'), (pg_temp.pid(2), pg_temp.eid(1), 'Conducteur'),
  (pg_temp.pid(3), pg_temp.eid(1), 'Poste vide'), (pg_temp.pid(4), pg_temp.eid(1), 'Depot'),
  (pg_temp.pid(5), pg_temp.eid(1), 'Admin'),
  (pg_temp.pid(20), pg_temp.eid(2), 'Gerant'), (pg_temp.pid(30), pg_temp.eid(3), 'Gerant'),
  (pg_temp.pid(40), pg_temp.eid(4), 'Gerant'), (pg_temp.pid(50), pg_temp.eid(5), 'Conducteur'),
  (pg_temp.pid(60), pg_temp.eid(6), 'Gerant'), (pg_temp.pid(70), pg_temp.eid(7), 'Gerant'),
  (pg_temp.pid(80), pg_temp.eid(8), 'Gerant');
insert into public.permissions_poste(entreprise_id, poste_id, cle_permission, autorise) values
  (pg_temp.eid(1), pg_temp.pid(1), 'gerer_utilisateurs', true), (pg_temp.eid(1), pg_temp.pid(1), 'acces_devis', true),
  (pg_temp.eid(1), pg_temp.pid(2), 'acces_devis', true),
  (pg_temp.eid(1), pg_temp.pid(3), 'acces_devis', false),
  (pg_temp.eid(1), pg_temp.pid(4), 'mode_compte_depot', true), (pg_temp.eid(1), pg_temp.pid(4), 'acces_stock', true),
  (pg_temp.eid(1), pg_temp.pid(5), 'acces_devis', true), -- poste NOMMÉ « Admin » mais sans gerer_utilisateurs
  (pg_temp.eid(2), pg_temp.pid(20), 'gerer_utilisateurs', true), (pg_temp.eid(3), pg_temp.pid(30), 'gerer_utilisateurs', true),
  (pg_temp.eid(4), pg_temp.pid(40), 'gerer_utilisateurs', true), (pg_temp.eid(5), pg_temp.pid(50), 'acces_devis', true),
  (pg_temp.eid(6), pg_temp.pid(60), 'gerer_utilisateurs', true), (pg_temp.eid(7), pg_temp.pid(70), 'gerer_utilisateurs', true),
  (pg_temp.eid(8), pg_temp.pid(80), 'gerer_utilisateurs', true);

insert into public.utilisateurs_entreprises(utilisateur_id, entreprise_id, poste_id, statut) values
  (pg_temp.uid(1),  pg_temp.eid(1), pg_temp.pid(1), 'actif'),                 -- admin prouvé
  (pg_temp.uid(2),  pg_temp.eid(1), pg_temp.pid(2), 'actif'),                 -- poste simple
  (pg_temp.uid(3),  pg_temp.eid(1), null,           'actif'),                 -- sans poste
  (pg_temp.uid(4),  pg_temp.eid(1), pg_temp.pid(3), 'actif'),                 -- poste sans permission
  (pg_temp.uid(5),  pg_temp.eid(1), pg_temp.pid(4), 'actif'),                 -- compte dépôt
  (pg_temp.uid(6),  pg_temp.eid(1), null,           'invite'),
  (pg_temp.uid(7),  pg_temp.eid(1), pg_temp.pid(2), 'desactive'),
  (pg_temp.uid(8),  pg_temp.eid(1), null,           'en_attente_validation'),
  (pg_temp.uid(9),  pg_temp.eid(1), pg_temp.pid(2), 'actif'),                 -- employé sorti
  (pg_temp.uid(10), pg_temp.eid(1), pg_temp.pid(2), 'actif'),                 -- administrateur plateforme
  (pg_temp.uid(11), pg_temp.eid(1), pg_temp.pid(2), 'actif'),                 -- entreprise_active_id incohérente
  (pg_temp.uid(12), pg_temp.eid(1), pg_temp.pid(5), 'actif'),                 -- « Admin » par le nom seulement
  (pg_temp.uid(13), pg_temp.eid(1), pg_temp.pid(2), 'actif'),                 -- habilitation plateforme préexistante (rôle admin)
  (pg_temp.uid(14), pg_temp.eid(1), pg_temp.pid(2), 'actif'),                 -- habilitation désactivée par la plateforme
  (pg_temp.uid(15), pg_temp.eid(1), pg_temp.pid(2), 'pause'),
  (pg_temp.uid(20), pg_temp.eid(2), pg_temp.pid(20), 'actif'),
  (pg_temp.uid(30), pg_temp.eid(3), pg_temp.pid(30), 'actif'),
  (pg_temp.uid(40), pg_temp.eid(4), pg_temp.pid(40), 'actif'),
  (pg_temp.uid(50), pg_temp.eid(5), pg_temp.pid(50), 'actif'),
  (pg_temp.uid(60), pg_temp.eid(6), pg_temp.pid(60), 'actif'),
  (pg_temp.uid(70), pg_temp.eid(7), pg_temp.pid(70), 'actif'),
  (pg_temp.uid(80), pg_temp.eid(8), pg_temp.pid(80), 'actif');

-- Entreprise active : cohérente partout, sauf u11 (nulle).
update public.utilisateurs u set entreprise_active_id = ue.entreprise_id
  from public.utilisateurs_entreprises ue
 where ue.utilisateur_id = u.id and ue.statut = 'actif' and u.id <> pg_temp.uid(11);
update public.utilisateurs set entreprise_active_id = null where id = pg_temp.uid(11);

insert into public.employes(entreprise_id, prenom, nom, identifiant_interne, numero_inscription, utilisateur_id, statut)
values (pg_temp.eid(1), 'Sorti', 'Historique', 'EMP-SORTI', 'INS-SORTI', pg_temp.uid(9), 'sorti');
insert into public.plateforme_admins(email, role, nom, utilisateur_id, actif, statut_identite, activation_at)
values ('u10@invalid.local', 'total', 'Plateforme', pg_temp.uid(10), true, 'active', now());

-- Gestes plateforme PRÉEXISTANTS que le backfill ne doit jamais écraser.
insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, source)
values (pg_temp.eid(6), 'gestion_pro', false, 'plateforme_test_desactive'),
       (pg_temp.eid(7), 'gestion_pro', true,  'plateforme_test');
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code, autorise, attribue_par)
values (pg_temp.eid(1), pg_temp.uid(13), 'gestion_pro', 'gestion_pro_admin', true,  pg_temp.uid(1)),
       (pg_temp.eid(1), pg_temp.uid(14), 'gestion_pro', 'gestion_pro_utilisateur', false, pg_temp.uid(1));

create function pg_temp.cl(p_user int, p_ent int) returns text language sql as
  $$ select classe || ':' || raison_code from public.gp_backfill_rapport() where utilisateur_id = pg_temp.uid(p_user) and entreprise_id = pg_temp.eid(p_ent) $$;
create function pg_temp.couv(p_categorie text) returns bigint language sql as
  $$ select coalesce(sum(nombre_paires), 0)::bigint from public.gp_backfill_couverture() where categorie = p_categorie and raison_code <> 'paires_legitimes' $$;
-- Empreinte de tables entières : tout changement d'une ligne, d'une colonne de prix ou d'offre la modifie.
create function pg_temp.empreinte(p_table regclass) returns text language plpgsql as
  $$ declare v text; begin
       execute format('select md5(coalesce(string_agg(t::text, ''|'' order by t::text), '''')) from %s t', p_table) into v;
       return v; end $$;
create temp table _empreintes_avant as
  select t::text as nom, pg_temp.empreinte(t) as h
    from unnest(array['public.entreprises','public.modules_entreprises','public.plans_abonnement','public.postes',
                      'public.permissions_poste','public.utilisateurs_entreprises','public.employes','public.utilisateurs',
                      'public.generations_tarifaires','public.modules_gestion_pro','public.modules_gestion_pro_tarifs',
                      'public.historique_tarification','public.historique_capacite_personnes']::regclass[]) t;
create temp table _decisions(cle text, decision text);
grant all on _decisions to public;
create function pg_temp.decision_de(p_user int, p_ent int) returns text language plpgsql as
  $$ declare v text; begin
       perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p_user), 'role', 'authenticated')::text, true);
       perform set_config('request.jwt.claim.sub', pg_temp.uid(p_user)::text, true);
       set local role authenticated;
       v := public.decision_acces_application('gestion_pro', pg_temp.eid(p_ent))->>'decision';
       reset role;
       perform set_config('request.jwt.claims', '', true);
       perform set_config('request.jwt.claim.sub', '', true);
       return v; end $$;
grant execute on function pg_temp.uid(int), pg_temp.eid(int) to public;

-- ── A. Objets et ACL ─────────────────────────────────────────────────────────────────────────
select has_function('public', 'gp_backfill_rapport', array['uuid'], 'gp_backfill_rapport() existe');
select has_function('public', 'gp_backfill_couverture', array['uuid'], 'gp_backfill_couverture() existe');
select has_function('public', 'gp_backfill_appliquer', array['boolean', 'uuid'], 'gp_backfill_appliquer() existe');
select has_function('public', 'gp_backfill_retour_arriere', array['boolean', 'uuid'], 'gp_backfill_retour_arriere() existe');
select is((select count(*) from unnest(array['authenticated', 'anon', 'service_role']) r
            where has_function_privilege(r, 'public.gp_backfill_rapport(uuid)', 'execute')
               or has_function_privilege(r, 'public.gp_backfill_couverture(uuid)', 'execute')
               or has_function_privilege(r, 'public.gp_backfill_appliquer(boolean,uuid)', 'execute')
               or has_function_privilege(r, 'public.gp_backfill_retour_arriere(boolean,uuid)', 'execute')),
          0::bigint, 'ni authenticated, ni anon, ni service_role ne peuvent exécuter les fonctions de backfill');
select is((select proargnames::text from pg_proc where oid = 'public.gp_backfill_rapport(uuid)'::regprocedure),
          '{p_entreprise_id,entreprise_id,entreprise_nom,utilisateur_id,statut_membre,poste_id,poste_nom,classe,raison_code,raison,role_propose,action_recommandee,couvert_effectif}',
          'colonnes du rapport stables et exportables (entreprise, utilisateur, statut, poste, raison, action recommandée)');

-- Un membre authentifié ne peut pas lister les autres organisations.
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(1), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', pg_temp.uid(1)::text, true);
set local role authenticated;
select throws_ok($$ select * from public.gp_backfill_rapport() $$, '42501', null, 'un membre authentifié ne peut pas exécuter le rapport');
select throws_ok($$ select * from public.gp_backfill_appliquer(true) $$, '42501', null, 'un membre authentifié ne peut pas appliquer le backfill');
reset role;
-- Défense en profondeur : même avec un GRANT accidentel, la garde interne refuse un JWT applicatif.
grant execute on function public.gp_backfill_rapport(uuid) to authenticated;
set local role authenticated;
select throws_ok($$ select * from public.gp_backfill_rapport() $$, '42501', null, 'garde interne : un JWT applicatif est refusé même si EXECUTE est accordé');
reset role;
revoke execute on function public.gp_backfill_rapport(uuid) from authenticated;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);

-- ── B. Classification attendue sur données historiques ───────────────────────────────────────
select is(pg_temp.cl(1, 1),  'certain:certain_admin',                         'admin prouvé (gerer_utilisateurs) → certain, rôle admin');
select is((select role_propose from public.gp_backfill_rapport() where utilisateur_id = pg_temp.uid(1) and entreprise_id = pg_temp.eid(1)),
          'gestion_pro_admin', 'rôle proposé de l''admin = gestion_pro_admin');
select is(pg_temp.cl(2, 1),  'certain:certain_utilisateur',                   'poste simple avec permissions → certain, rôle utilisateur');
select is((select role_propose from public.gp_backfill_rapport() where utilisateur_id = pg_temp.uid(2) and entreprise_id = pg_temp.eid(1)),
          'gestion_pro_utilisateur', 'rôle proposé du poste simple = gestion_pro_utilisateur');
select is(pg_temp.cl(3, 1),  'ambigu:sans_poste',                             'membre actif sans poste → ambigu');
select is(pg_temp.cl(4, 1),  'ambigu:poste_sans_permission',                  'poste sans aucune permission autorisée → ambigu');
select is(pg_temp.cl(5, 1),  'ambigu:compte_depot',                           'compte dépôt/borne → ambigu');
select is(pg_temp.cl(6, 1),  'exclu:statut_invite',                           'invité → exclu');
select is(pg_temp.cl(7, 1),  'exclu:statut_desactive',                        'désactivé → exclu');
select is(pg_temp.cl(8, 1),  'exclu:statut_en_attente_validation',            'en attente de validation → exclu');
select is(pg_temp.cl(9, 1),  'ambigu:employe_ecarte',                         'utilisateur lié à un employé sorti → ambigu');
select is(pg_temp.cl(10, 1), 'exclu:admin_plateforme',                        'administrateur plateforme → exclu');
select is(pg_temp.cl(11, 1), 'ambigu:entreprise_active_incoherente',          'entreprise_active_id incohérente → ambigu');
select is(pg_temp.cl(12, 1), 'ambigu:poste_admin_par_nom_seulement',          'poste « Admin » sans gerer_utilisateurs : administrateur non prouvé → ambigu');
select is(pg_temp.cl(13, 1), 'certain:certain_utilisateur',                   'habilitation plateforme préexistante active → reste certain (couvert, jamais réécrit)');
select is(pg_temp.cl(14, 1), 'ambigu:habilitation_desactivee_par_plateforme', 'habilitation désactivée par la plateforme → ambigu (jamais réactivée)');
select is(pg_temp.cl(15, 1), 'exclu:statut_pause',                            'statut « pause » → exclu');
select is(pg_temp.cl(20, 2), 'ambigu:organisation_suspendue',                 'organisation suspendue → ambigu (DECISION_REQUIRED)');
select is(pg_temp.cl(30, 3), 'certain:certain_admin',                         'essai terminé (daté) = abonnement GP prouvé → certain');
select is(pg_temp.cl(40, 4), 'ambigu:organisation_annulee',                   'organisation annulée → ambigu (DECISION_REQUIRED)');
select is(pg_temp.cl(50, 5), 'ambigu:organisation_sans_admin',                'organisation sans administrateur identifiable → ambigu');
select is(pg_temp.cl(60, 6), 'ambigu:droit_org_desactive_par_plateforme',     'droit d''usage désactivé par la plateforme → ambigu (jamais réactivé)');
select is(pg_temp.cl(70, 7), 'certain:certain_admin',                         'organisation au droit plateforme existant, admin sans habilitation → certain');
select is(pg_temp.cl(80, 8), 'ambigu:abonnement_gp_non_prouve',               'organisation sans offre/essai/actif → ambigu');
select is((select classe || ':' || raison_code from public.gp_backfill_rapport() where utilisateur_id = pg_temp.uid(90)),
          'exclu:sans_profil', 'compte sans profil → exclu');
select is((select array_agg(distinct classe order by classe) from public.gp_backfill_rapport()), array['ambigu', 'certain', 'exclu'],
          'trois classes seulement');
select is((select count(*) from public.gp_backfill_rapport() where classe = 'certain'), 5::bigint, '5 certains (u01, u02, u13, u30, u70)');

-- ── C. Couverture AVANT ──────────────────────────────────────────────────────────────────────
select is((select nombre_paires from public.gp_backfill_couverture() where categorie = 'total'), 17::bigint,
          '17 paires (organisation, membre actif légitime) : administrateur plateforme et non-actifs exclus');
select is(pg_temp.couv('couvert'), 0::bigint, 'avant backfill : aucune paire couverte (aucune habilitation effective)');
select is(pg_temp.couv('non_couvert'), 5::bigint, 'avant backfill : les 5 certains sont non couverts');
select is(pg_temp.couv('ambigu_non_tranche'), 12::bigint, 'avant backfill : 12 ambigus non tranchés, chacun avec sa raison');

-- Décisions AVANT (contrat figé) : pas encore autorisé.
insert into _decisions values
  ('avant:u02@E1', pg_temp.decision_de(2, 1)), ('avant:u70@E7', pg_temp.decision_de(70, 7)),
  ('avant:u30@E3', pg_temp.decision_de(30, 3)), ('avant:u01@E1', pg_temp.decision_de(1, 1));
select is((select decision from _decisions where cle = 'avant:u02@E1'), 'application_non_incluse', 'avant : u02 → application_non_incluse (aucun droit d''usage GP)');
select is((select decision from _decisions where cle = 'avant:u70@E7'), 'sans_habilitation', 'avant : u70 → sans_habilitation (droit d''usage présent, aucune habilitation)');

-- ── D. Simulation : compte, n'écrit rien ─────────────────────────────────────────────────────
select is((select array_agg(etape || '=' || nombre order by etape) from public.gp_backfill_appliquer(false)),
          array['simulation:entreprises_a_creer=2', 'simulation:habilitations_a_creer=4'],
          'simulation : 2 droits d''usage (E1, E3 ; E7 existe) et 4 habilitations (u13 existe)');
select is((select count(*) from public.habilitations_applications_utilisateurs where application_code = 'gestion_pro'), 2::bigint,
          'la simulation n''a écrit aucune habilitation');
select is((select count(*) from public.acces_applications_entreprises where application_code = 'gestion_pro'), 2::bigint,
          'la simulation n''a écrit aucun droit d''usage');

-- ── E. Application ───────────────────────────────────────────────────────────────────────────
select is((select array_agg(etape || '=' || nombre order by etape) from public.gp_backfill_appliquer(true)),
          array['entreprises_creees=2', 'habilitations_creees=4', 'lignes_historique=6'],
          'application : 2 droits d''usage, 4 habilitations, 6 lignes d''historique');
select is((select array_agg(utilisateur_id::text order by utilisateur_id::text) from public.habilitations_applications_utilisateurs where application_code = 'gestion_pro'),
          (select array_agg(pg_temp.uid(n)::text order by pg_temp.uid(n)::text) from unnest(array[1, 2, 13, 14, 30, 70]) n),
          'habilitations = les 4 nouveaux certains + les 2 gestes plateforme préexistants, aucun ambigu/exclu');
select is((select array_agg(entreprise_id::text order by entreprise_id::text) from public.acces_applications_entreprises where application_code = 'gestion_pro'),
          (select array_agg(pg_temp.eid(n)::text order by pg_temp.eid(n)::text) from unnest(array[1, 3, 6, 7]) n),
          'droits d''usage = E1 et E3 créés, E6/E7 préexistants ; jamais E2/E4/E5/E8 (usage non prouvé ou ambigu)');
select is((select role_code from public.habilitations_applications_utilisateurs where utilisateur_id = pg_temp.uid(1) and application_code = 'gestion_pro'),
          'gestion_pro_admin', 'admin prouvé → gestion_pro_admin');
select is((select role_code from public.habilitations_applications_utilisateurs where utilisateur_id = pg_temp.uid(2) and application_code = 'gestion_pro'),
          'gestion_pro_utilisateur', 'poste simple → gestion_pro_utilisateur');
select is((select source || ':' || autorise from public.acces_applications_entreprises where entreprise_id = pg_temp.eid(1) and application_code = 'gestion_pro'),
          'backfill_gp_habilitation_v1:true', 'droit d''usage créé par le backfill porte le marqueur de retour arrière');
select is((select source || ':' || autorise from public.acces_applications_entreprises where entreprise_id = pg_temp.eid(7) and application_code = 'gestion_pro'),
          'plateforme_test:true', 'jamais d''écrasement : le droit d''usage plateforme (E7) est intact');
select is((select source || ':' || autorise from public.acces_applications_entreprises where entreprise_id = pg_temp.eid(6) and application_code = 'gestion_pro'),
          'plateforme_test_desactive:false', 'jamais d''écrasement : la désactivation explicite (E6) est intacte');
select is((select role_code || ':' || autorise from public.habilitations_applications_utilisateurs where utilisateur_id = pg_temp.uid(13) and application_code = 'gestion_pro'),
          'gestion_pro_admin:true', 'jamais d''écrasement : le rôle plateforme de u13 n''est pas réécrit en utilisateur');
select is((select autorise from public.habilitations_applications_utilisateurs where utilisateur_id = pg_temp.uid(14) and application_code = 'gestion_pro'),
          false, 'jamais d''écrasement : l''habilitation désactivée de u14 n''est pas réactivée');
select is((select count(*) from public.historique_acces_applications where auteur_email = 'backfill_gp_habilitation_v1'), 6::bigint,
          'historisé : 6 lignes marquées (2 organisations, 4 utilisateurs)');

-- ── F. Idempotence ───────────────────────────────────────────────────────────────────────────
select is((select array_agg(etape || '=' || nombre order by etape) from public.gp_backfill_appliquer(true)),
          array['entreprises_creees=0', 'habilitations_creees=0', 'lignes_historique=0'],
          'idempotent : la 2e exécution n''écrit aucune ligne');
select is((select count(*) from public.historique_acces_applications where auteur_email = 'backfill_gp_habilitation_v1'), 6::bigint,
          'idempotent : aucune ligne d''historique en plus');

-- ── G. Aucune donnée commerciale touchée ─────────────────────────────────────────────────────
select is((select count(*) from _empreintes_avant a where a.h <> pg_temp.empreinte(a.nom::regclass)), 0::bigint,
          'hash avant/après identique : entreprises, modules_entreprises, plans_abonnement, postes, permissions, membres, employés, utilisateurs, tarifs, capacité');
select is((select count(*) from pg_proc where proname in ('gp_backfill_appliquer', 'gp_backfill_retour_arriere')
            and prosrc ~* '(modules_entreprises|plans_abonnement|prix|tarif|capacite|abonnement_offre|abonnement_statut|offre)'), 0::bigint,
          'le code des fonctions qui ÉCRIVENT ne référence aucune table/colonne de prix, plan, offre, module ou capacité');

-- Témoin négatif : la même empreinte DÉTECTE la modification d'une ligne d'entreprise (le test G n'est pas trivial).
-- (Le prix contractuel lui-même est déjà protégé par le trigger proteger_facturation_entreprise : on ne peut pas le
-- modifier ici sans être la plateforme, ce qui est précisément le comportement attendu.)
update public.entreprises set abonnement_note = 'temoin' where id = pg_temp.eid(1);
select is((select count(*) from _empreintes_avant a where a.nom = 'entreprises' and a.h <> pg_temp.empreinte(a.nom::regclass)), 1::bigint,
          'témoin : l''empreinte détecte la modification d''une ligne d''entreprise (contrôle du contrôle)');
update public.entreprises set abonnement_note = null where id = pg_temp.eid(1);

-- ── H. Couverture APRÈS = critère de sortie ──────────────────────────────────────────────────
select is(pg_temp.couv('couvert'), 5::bigint, 'après backfill : les 5 certains sont couverts');
select is(pg_temp.couv('non_couvert'), 0::bigint, 'après backfill : 0 non couvert non expliqué (critère de sortie de l''étape 3)');
select is(pg_temp.couv('ambigu_non_tranche'), 12::bigint, 'après backfill : les 12 ambigus restent non tranchés (revue humaine requise avant enforcement)');

-- ── I. Décision du contrat AVANT/APRÈS ───────────────────────────────────────────────────────
select is(pg_temp.decision_de(2, 1), 'autorise', 'après : u02 → autorise (était application_non_incluse)');
select is(pg_temp.decision_de(70, 7), 'autorise', 'après : u70 → autorise (était sans_habilitation)');
select is(pg_temp.decision_de(30, 3), 'autorise', 'après : u30 → autorise (essai terminé mais usage prouvé ; le blocage éventuel reste porté par l''abonnement)');
select is(pg_temp.decision_de(3, 1), 'sans_habilitation', 'après : un AMBIGU (u03 sans poste) n''est pas couvert → sans_habilitation : il serait bloqué par un enforcement (revue humaine obligatoire)');

-- ── J. Retour arrière ────────────────────────────────────────────────────────────────────────
-- Une habilitation retouchée depuis le backfill (u02) doit être CONSERVÉE : `updated_at` est décalé
-- (dans une seule transaction now() est constant, on neutralise donc le trigger pour simuler un geste ultérieur).
alter table public.habilitations_applications_utilisateurs disable trigger habilitations_applications_utilisateurs_updated;
update public.habilitations_applications_utilisateurs
   set role_code = 'gestion_pro_admin', updated_at = created_at + interval '1 minute'
 where utilisateur_id = pg_temp.uid(2) and application_code = 'gestion_pro';
alter table public.habilitations_applications_utilisateurs enable trigger habilitations_applications_utilisateurs_updated;
select is((select array_agg(etape || '=' || nombre order by etape) from public.gp_backfill_retour_arriere(false)),
          array['simulation:droits_usage_a_retirer=1', 'simulation:habilitations_a_retirer=3'],
          'simulation du retour arrière : 3 habilitations (u02 retouchée exclue), 1 droit d''usage (E3 ; E1 garde des habilitations plateforme)');
select is((select array_agg(etape || '=' || nombre order by etape) from public.gp_backfill_retour_arriere(true)),
          array['droits_usage_retires=1', 'habilitations_retirees=3'], 'retour arrière appliqué');
select is((select array_agg(utilisateur_id::text order by utilisateur_id::text) from public.habilitations_applications_utilisateurs where application_code = 'gestion_pro'),
          (select array_agg(pg_temp.uid(n)::text order by pg_temp.uid(n)::text) from unnest(array[2, 13, 14]) n),
          'il ne reste que la ligne retouchée (u02) et les gestes plateforme préexistants (u13, u14)');
select is((select array_agg(entreprise_id::text order by entreprise_id::text) from public.acces_applications_entreprises where application_code = 'gestion_pro'),
          (select array_agg(pg_temp.eid(n)::text order by pg_temp.eid(n)::text) from unnest(array[1, 6, 7]) n),
          'droits d''usage : E3 retiré ; E1 conservé (habilitations restantes), E6/E7 plateforme intacts');
select is((select count(*) from public.historique_acces_applications where action = 'retour_arriere_backfill'), 4::bigint,
          'le retour arrière est lui aussi historisé (3 habilitations + 1 droit d''usage)');

select * from finish();
rollback;
