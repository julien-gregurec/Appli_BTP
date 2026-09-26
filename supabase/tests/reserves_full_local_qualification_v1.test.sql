-- ELSATIA-RESERVES-FULL-LOCAL-QUALIFICATION-V1
--
-- Qualification complète d'ELSATIA Réserves sur PostgreSQL réel, rôle par rôle, au travers
-- des SEULES portes qu'un client atteint (RPC exposées à `authenticated`, tables sous RLS,
-- `storage.objects` sous policies). Rapport : docs/qualification/
-- ELSATIA_RESERVES_FULL_LOCAL_QUALIFICATION_V1.md.
--
--   §1 parcours fonctionnel complet      §6 stockage (photos, plans, avant/après)
--   §2 photo obligatoire PAR réserve     §7 historique non falsifiable (R-01, R-02)
--   §3 intervenant gratuit limité        §8 auth : révocation, rôle, entitlement,
--   §4 cross-tenant A / B / C / D (R-05)    suspension, session déjà ouverte
--   §5 intégration Gestion Pro (R-04)    §9 escalade par la file hors-ligne (R-03)
--
-- Décor : A = organisation hôte (admin, responsable, émetteur, consultation, dirigeant GP
-- sans rôle Réserves) ; B = tenant témoin sans lien ; C et D = entreprises intervenantes,
-- tenants à part entière, comptes gratuits.

begin;
create extension if not exists pgtap with schema extensions;
select plan(181);

\ir fixtures/isolation_multitenant.inc

create function pg_temp.en_tant_que(p uuid) returns text language sql as $$
  select set_config('role','authenticated',true)
      || set_config('request.jwt.claim.sub',p::text,true)
      || set_config('request.jwt.claims', json_build_object('sub',p,'role','authenticated')::text, true)
$$;
create function pg_temp.en_session(p uuid, s uuid) returns text language sql as $$
  select set_config('role','authenticated',true)
      || set_config('request.jwt.claim.sub',p::text,true)
      || set_config('request.jwt.claims', json_build_object('sub',p,'role','authenticated','session_id',s)::text, true)
$$;
create function pg_temp.en_service() returns text language sql as $$
  select set_config('role','postgres',true)
      || set_config('request.jwt.claim.sub','',true)
      || set_config('request.jwt.claims','',true)
$$;
-- Dépôt réel d'une photo : réservation de l'emplacement par la RPC, écriture de l'objet
-- sous le rôle courant (policies Storage), confirmation par la RPC.
create function pg_temp.deposer(p_reserve uuid, p_usage text) returns uuid language plpgsql as $$
declare v_id uuid; v_chemin text;
begin
  select photo_id, storage_path into v_id, v_chemin from public.reserves_ajouter_photo(p_reserve, p_usage);
  insert into storage.objects (bucket_id, name, metadata)
  values ('reserves-photos', v_chemin, '{"mimetype":"image/jpeg"}');
  perform public.reserves_confirmer_photo(v_id);
  return v_id;
end $$;
create function pg_temp.r(n text) returns uuid language sql as $$ select current_setting('q.' || n)::uuid $$;

-- ── Décor ────────────────────────────────────────────────────────────────────
-- Parité avec le service Storage hébergé : les rôles d'API y détiennent tous les droits de
-- table sur storage.objects ; seules les policies (dont les restrictives de 00279) jugent.
grant all on table storage.objects, storage.buckets to anon, authenticated, service_role;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000','c0000000-0000-0000-0000-0000000000a1','authenticated','authenticated','intervenant-c@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000','d0000000-0000-0000-0000-0000000000a1','authenticated','authenticated','intervenant-d@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now())
on conflict (id) do nothing;
insert into public.utilisateurs (id, prenom, nom) values
  ('c0000000-0000-0000-0000-0000000000a1','Peintre','C'), ('d0000000-0000-0000-0000-0000000000a1','Plaquiste','D')
on conflict (id) do nothing;
insert into public.entreprises (id, nom, code_adhesion) values
  ('c0000000-0000-0000-0000-000000000001','Entreprise Peinture C','ISOC0001'),
  ('d0000000-0000-0000-0000-000000000001','Entreprise Plâtrerie D','ISOD0001')
on conflict (id) do nothing;
insert into public.postes (id, entreprise_id, nom) values
  ('c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','Gérant C'),
  ('d1000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','Gérant D')
on conflict (id) do nothing;
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut) values
  ('c0000000-0000-0000-0000-0000000000a1','c0000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','actif'),
  ('d0000000-0000-0000-0000-0000000000a1','d0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','actif')
on conflict do nothing;
-- Le gérant de C a TOUTES les permissions Gestion Pro de son propre tenant : c'est le
-- cas le plus défavorable pour vérifier qu'il n'obtient rien de payant dans Réserves.
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select 'c0000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001', d.cle, true
from public.permissions_disponibles d on conflict do nothing;

insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source) values
  ('a0000000-0000-0000-0000-000000000001','reserves', true, 'test'),
  ('b0000000-0000-0000-0000-000000000001','reserves', true, 'test');
insert into public.habilitations_applications_utilisateurs (entreprise_id, utilisateur_id, application_code, role_code) values
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','reserves','reserves_responsable'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','reserves','reserves_emetteur'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','reserves','reserves_consultation'),
  ('b0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation');

-- Chantier, plans et intervenants de A ; chantier et réserve de B.
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
insert into public.reserves_chantiers (id, entreprise_id, nom) values
  ('e7000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','QUALIF_A_Résidence');
insert into public.reserves_plans (id, entreprise_id, chantier_id, nom, niveau, zone) values
  ('e7100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','e7000000-0000-0000-0000-000000000001','RDC','R0','Hall'),
  ('e7100000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','e7000000-0000-0000-0000-000000000001','Toiture','R+3','Combles');
insert into public.reserves_intervenants (id, entreprise_id, chantier_id, nom, corps_etat) values
  ('e7200000-0000-0000-0000-00000000000c','a0000000-0000-0000-0000-000000000001','e7000000-0000-0000-0000-000000000001','Peinture C','Peinture'),
  ('e7200000-0000-0000-0000-00000000000d','a0000000-0000-0000-0000-000000000001','e7000000-0000-0000-0000-000000000001','Plâtrerie D','Plâtrerie');
select public.reserves_designer_entreprise_intervenante('e7200000-0000-0000-0000-00000000000c','c0000000-0000-0000-0000-000000000001');
select public.reserves_designer_entreprise_intervenante('e7200000-0000-0000-0000-00000000000d','d0000000-0000-0000-0000-000000000001');
select pg_temp.en_tant_que('c0000000-0000-0000-0000-0000000000a1');
select public.reserves_rejoindre_intervention('e7200000-0000-0000-0000-00000000000c');
select pg_temp.en_tant_que('d0000000-0000-0000-0000-0000000000a1');
select public.reserves_rejoindre_intervention('e7200000-0000-0000-0000-00000000000d');

select pg_temp.en_tant_que('20000000-0000-0000-0000-000000000001');
insert into public.reserves_chantiers (id, entreprise_id, nom) values
  ('e7000000-0000-0000-0000-00000000000b','b0000000-0000-0000-0000-000000000001','QUALIF_B_Secret');
select set_config('q.rb', public.reserves_creer('e7000000-0000-0000-0000-00000000000b','MARQUEUR_B secret',
  'ne doit jamais fuiter')::text, true);

-- ═════════════════════════════════════════════════════════════════════════════
-- §1 PARCOURS FONCTIONNEL
-- ═════════════════════════════════════════════════════════════════════════════
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000002'); -- émetteur
select set_config('q.r1', public.reserves_creer('e7000000-0000-0000-0000-000000000001',
  'Fissure enduit hall', 'Reprise enduit + peinture', 'haute', 'e7200000-0000-0000-0000-00000000000c',
  'e7100000-0000-0000-0000-000000000001', 0.25, 0.50, true, current_date + 10)::text, true);
select set_config('q.r2', public.reserves_creer('e7000000-0000-0000-0000-000000000001',
  'Retouche plinthe', null, 'basse', 'e7200000-0000-0000-0000-00000000000c', null, null, null, false)::text, true);
select set_config('q.r3', public.reserves_creer('e7000000-0000-0000-0000-000000000001',
  'Joint placo', null, 'normale', 'e7200000-0000-0000-0000-00000000000d')::text, true);
select set_config('q.r4', public.reserves_creer('e7000000-0000-0000-0000-000000000001',
  'Tache plafond (contestée)', null, 'normale', 'e7200000-0000-0000-0000-00000000000c')::text, true);
select set_config('q.r5', public.reserves_creer('e7000000-0000-0000-0000-000000000001',
  'Constat non attribué')::text, true);

select is((select statut from public.reserves where id = pg_temp.r('r1')), 'assignee', '1.01 création attribuée : statut assignee');
select is((select statut from public.reserves where id = pg_temp.r('r5')), 'emise', '1.02 création sans entreprise : statut emise');
select is((select array_agg(numero order by numero) from public.reserves where chantier_id = 'e7000000-0000-0000-0000-000000000001'),
  array[1,2,3,4,5], '1.03 numérotation séquentielle par chantier');
select ok((select plan_id = 'e7100000-0000-0000-0000-000000000001' and position_x = 0.25 and position_y = 0.5 and plan_page = 1
  from public.reserves where id = pg_temp.r('r1')), '1.04 localisation plan : plan, x, y, page 1 mémorisés');
select is((select count(*)::int from public.reserves_reperes_plan('e7100000-0000-0000-0000-000000000001', 1)), 1,
  '1.05 le repère apparaît sur la page du plan');
select throws_like($$select public.reserves_creer('e7000000-0000-0000-0000-000000000001','Hors plan',null,'normale',null,
  'e7100000-0000-0000-0000-000000000001', 1.5, 0.5)$$, '%', '1.06 une position hors [0,1] est refusée');

-- Photo de constat (avant) par l'hôte, commentaire.
select set_config('q.ph_avant', pg_temp.deposer(pg_temp.r('r1'), 'constat')::text, true);
select ok((select disponible_at is not null from public.reserves_photos where id = pg_temp.r('ph_avant')),
  '1.07 photo de constat déposée et confirmée (fichier présent dans le bucket)');
select lives_ok($$select public.reserves_commenter(pg_temp.r('r1'), 'Merci d''intervenir avant la réception')$$,
  '1.08 l''hôte commente la réserve');
select throws_like($$select public.reserves_commenter(pg_temp.r('r1'), '   ')$$, '%Message vide%', '1.09 commentaire vide refusé');

-- Entreprise C : acceptation, refus motivé avec preuve.
select pg_temp.en_tant_que('c0000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.reserves_messages m join public.reserves_conversations c on c.id = m.conversation_id
  where c.reserve_id = pg_temp.r('r1')), 1, '1.10 l''intervenant lit le commentaire de l''hôte');
select lives_ok($$select public.reserves_commenter(pg_temp.r('r1'), 'Intervention prévue jeudi')$$, '1.11 l''intervenant répond');
select lives_ok($$select public.reserves_repondre_responsabilite(pg_temp.r('r1'), true)$$, '1.12 acceptation par l''intervenant');
select is((select statut from public.reserves where id = pg_temp.r('r1')), 'acceptee', '1.13 statut acceptee');
select throws_like($$select public.reserves_repondre_responsabilite(pg_temp.r('r4'), false, '')$$, '%motif est obligatoire%',
  '1.14 refus sans motif refusé');
select set_config('q.ph_refus', pg_temp.deposer(pg_temp.r('r4'), 'preuve_refus')::text, true);
select lives_ok($$select public.reserves_repondre_responsabilite(pg_temp.r('r4'), false, 'Infiltration toiture : lot couverture')$$,
  '1.15 refus motivé, preuve photographique jointe');
select is((select statut from public.reserves where id = pg_temp.r('r4')), 'refusee_responsabilite', '1.16 statut refusee_responsabilite');
select is((select commentaire from public.reserves_historique where reserve_id = pg_temp.r('r4') and action = 'refus_responsabilite'),
  'Infiltration toiture : lot couverture', '1.17 le motif est conservé à l''historique');
select is((select usage from public.reserves_photos where id = pg_temp.r('ph_refus')), 'preuve_refus', '1.18 la preuve est classée preuve_refus');

-- Réassignation par l'hôte vers D.
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000002');
select lives_ok($$select public.reserves_assigner(pg_temp.r('r4'), 'e7200000-0000-0000-0000-00000000000d')$$,
  '1.19 réassignation vers une autre entreprise après refus');
select ok((select statut = 'assignee' and intervenant_id = 'e7200000-0000-0000-0000-00000000000d' from public.reserves where id = pg_temp.r('r4')),
  '1.20 la réserve est assignée à D');
select ok((select valeur_avant = 'e7200000-0000-0000-0000-00000000000c' and valeur_apres = 'e7200000-0000-0000-0000-00000000000d'
  from public.reserves_historique where reserve_id = pg_temp.r('r4') and action = 'reassignation'),
  '1.21 l''historique conserve l''entreprise avant / après');
select lives_ok($$select public.reserves_assigner(pg_temp.r('r5'), 'e7200000-0000-0000-0000-00000000000c')$$,
  '1.22 assignation d''une réserve émise');
select pg_temp.en_tant_que('c0000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.reserves where id = pg_temp.r('r4')), 0, '1.23 C ne voit plus la réserve transférée');
select pg_temp.en_tant_que('d0000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.reserves where id = pg_temp.r('r4')), 1, '1.24 D voit la réserve qui lui est transférée');

-- Demande de levée, refus de levée, nouvelle demande, validation.
select pg_temp.en_tant_que('c0000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.reserves_repondre_responsabilite(pg_temp.r('r2'), true)$$, '1.25 acceptation de R2');
select set_config('q.ph_apres', pg_temp.deposer(pg_temp.r('r1'), 'travaux')::text, true);
select lives_ok($$select public.reserves_demander_levee(pg_temp.r('r1'), 'Enduit repris')$$, '1.26 demande de levée avec photo après travaux');
select is((select statut from public.reserves where id = pg_temp.r('r1')), 'levee_demandee', '1.27 statut levee_demandee');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000004'); -- responsable
select throws_like($$select public.reserves_statuer_levee(pg_temp.r('r1'), false, null)$$, '%motif est obligatoire%',
  '1.28 refus de levée sans motif refusé');
select lives_ok($$select public.reserves_statuer_levee(pg_temp.r('r1'), false, 'Traces de rouleau visibles')$$, '1.29 refus de levée motivé');
select is((select statut from public.reserves where id = pg_temp.r('r1')), 'levee_refusee', '1.30 statut levee_refusee');
select pg_temp.en_tant_que('c0000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.reserves_demander_levee(pg_temp.r('r1'), 'Seconde passe réalisée')$$, '1.31 nouvelle demande après refus');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000004');
select lives_ok($$select public.reserves_statuer_levee(pg_temp.r('r1'), true, 'Conforme')$$, '1.32 validation de la levée');
select ok((select statut = 'levee' and levee_at is not null and cloturee_at is not null from public.reserves where id = pg_temp.r('r1')),
  '1.33 statut levee, dates de levée et de clôture posées');

-- Avant / après et historique.
select is((select array_agg(usage || ':' || deposee_par_hote order by created_at) from public.reserves_photos_visibles(pg_temp.r('r1'))),
  array['constat:true','travaux:false'], '1.34 avant (constat hôte) / après (travaux intervenant) distingués');
select is((select string_agg(action, ',' order by created_at, ctid) from public.reserves_historique where reserve_id = pg_temp.r('r1')),
  'creation,photo_ajoutee,commentaire,commentaire,acceptation,photo_ajoutee,demande_levee,levee_refusee,demande_levee,levee_validee',
  '1.35 historique complet et ordonné du parcours');
select ok((select bool_and(auteur_id is not null) from public.reserves_historique where reserve_id = pg_temp.r('r1')),
  '1.36 chaque ligne d''historique porte son auteur');

-- ═════════════════════════════════════════════════════════════════════════════
-- §2 PHOTO OBLIGATOIRE — INDIVIDUELLEMENT PAR RÉSERVE
-- ═════════════════════════════════════════════════════════════════════════════
select pg_temp.en_service();
select ok(not exists (select 1 from information_schema.columns where table_schema = 'public'
  and table_name in ('reserves_chantiers','entreprises','reserves_preferences_notifications') and column_name like '%photo_obligatoire%'),
  '2.01 aucune exigence de photo globale (chantier, organisation, préférences)');
select pg_temp.en_tant_que('c0000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.reserves_demander_levee(pg_temp.r('r2'))$$, '2.02 R2 (sans exigence) : levée demandée sans photo');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000002');
select set_config('q.r6', public.reserves_creer('e7000000-0000-0000-0000-000000000001', 'Garde-corps',
  null, 'bloquante', 'e7200000-0000-0000-0000-00000000000c', null, null, null, true)::text, true);
select pg_temp.en_tant_que('c0000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.reserves_repondre_responsabilite(pg_temp.r('r6'), true)$$, '2.03 R6 (exigence) acceptée');
select throws_like($$select public.reserves_demander_levee(pg_temp.r('r6'))$$, '%Photo obligatoire%', '2.04 R6 sans photo : levée refusée');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000002');
select pg_temp.deposer(pg_temp.r('r6'), 'constat');
select pg_temp.en_tant_que('c0000000-0000-0000-0000-0000000000a1');
select throws_like($$select public.reserves_demander_levee(pg_temp.r('r6'))$$, '%Photo obligatoire%', '2.05 une photo de constat ne vaut pas preuve de levée');
select pg_temp.deposer(pg_temp.r('r6'), 'echange');
select throws_like($$select public.reserves_demander_levee(pg_temp.r('r6'))$$, '%Photo obligatoire%', '2.06 une photo d''échange ne vaut pas preuve');
select set_config('q.ph_fantome', (select photo_id from public.reserves_ajouter_photo(pg_temp.r('r6'), 'travaux'))::text, true);
select throws_like($$select public.reserves_demander_levee(pg_temp.r('r6'))$$, '%Photo obligatoire%', '2.07 un emplacement réservé sans fichier ne vaut pas preuve');
select throws_like($$select public.reserves_confirmer_photo(pg_temp.r('ph_fantome'))$$, '%Aucun fichier%', '2.08 confirmation impossible sans fichier');
select set_config('q.ph_r6', pg_temp.deposer(pg_temp.r('r6'), 'levee')::text, true);
select lives_ok($$select public.reserves_supprimer_photo(pg_temp.r('ph_r6'), 'mauvais cadrage')$$, '2.09 l''auteur retire sa photo avant décision');
select throws_like($$select public.reserves_demander_levee(pg_temp.r('r6'))$$, '%Photo obligatoire%', '2.10 une photo retirée ne vaut plus preuve');
select pg_temp.deposer(pg_temp.r('r6'), 'levee');
select lives_ok($$select public.reserves_demander_levee(pg_temp.r('r6'))$$, '2.11 photo de levée réelle : demande acceptée');
-- R-01 : l'exigence ne se retire plus en silence.
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000002');
select throws_ok($$update public.reserves set photo_obligatoire_levee = false where id = pg_temp.r('r6')$$, '42501', null,
  '2.12 (R-01) exigence figée pendant une demande de levée');
select lives_ok($$update public.reserves set photo_obligatoire_levee = true where id = pg_temp.r('r5')$$,
  '2.13 l''hôte peut poser l''exigence sur une réserve ouverte');
select is((select valeur_avant || '→' || valeur_apres from public.reserves_historique
  where reserve_id = pg_temp.r('r5') and champ = 'photo_obligatoire_levee'), 'false→true', '2.14 (R-01) le changement d''exigence est historisé');
select pg_temp.en_tant_que('c0000000-0000-0000-0000-0000000000a1');
with x as (update public.reserves set photo_obligatoire_levee = false where id = pg_temp.r('r6') returning 1) select is((select count(*)::int from x), 0,
  '2.15 l''intervenant ne peut pas modifier l''exigence');

-- ═════════════════════════════════════════════════════════════════════════════
-- §3 INTERVENANT GRATUIT LIMITÉ
-- ═════════════════════════════════════════════════════════════════════════════
select pg_temp.en_tant_que('c0000000-0000-0000-0000-0000000000a1');
select is((select source from public.acces_applications_entreprises where entreprise_id = 'c0000000-0000-0000-0000-000000000001'
  and application_code = 'reserves'), 'reserves_invitation_gratuite', '3.01 l''accès de C vient de l''invitation gratuite');
select is((select role_code from public.habilitations_applications_utilisateurs where utilisateur_id = 'c0000000-0000-0000-0000-0000000000a1'
  and application_code = 'reserves'), 'reserves_intervenant', '3.02 rôle limité reserves_intervenant');
select set_eq($$select id from public.reserves$$,
  $$values (pg_temp.r('r1')), (pg_temp.r('r2')), (pg_temp.r('r5')), (pg_temp.r('r6'))$$,
  '3.03 C voit exactement ses réserves (pas celles de D, ni celles transférées)');
select is((select count(*)::int from public.reserves_intervenants), 1, '3.04 C ne voit que sa propre ligne d''intervenant');
select is((select total::int from public.reserves_tableau_de_bord()), 4, '3.05 tableau de bord limité à ses réserves');
select is((select count(*)::int from public.reserves_export_chantier('e7000000-0000-0000-0000-000000000001')), 4,
  '3.06 export limité à ses réserves');
select is((select count(*)::int from public.reserves_plans), 1, '3.07 C ne voit que le plan portant une de ses réserves');
select throws_like($$select public.reserves_creer('e7000000-0000-0000-0000-000000000001','Réserve par C')$$, '%non autorisée%',
  '3.08 C ne crée pas de réserve chez l''hôte');
select throws_like($$select public.reserves_assigner(pg_temp.r('r2'), 'e7200000-0000-0000-0000-00000000000d')$$, '%', '3.09 C ne réassigne pas');
select throws_like($$select public.reserves_statuer_levee(pg_temp.r('r2'), true)$$, '%non autorisée%', '3.10 C ne valide pas sa propre levée');
select throws_like($$select public.reserves_annuler(pg_temp.r('r5'), 'x')$$, '%', '3.11 C n''annule pas');
select is((select issue from public.reserves_transition_differee(pg_temp.r('r2'), 'levee')), 'conflit',
  '3.12 C ne valide pas par la file hors-ligne (aucune arête intervenant → levée)');
-- Fonctions payantes : rien sur son propre tenant, même gérant avec toutes permissions GP.
select ok(not (select bool_or(public.reserves_action_autorisee('c0000000-0000-0000-0000-000000000001', a))
  from unnest(array['voir','exporter','creer_reserve','assigner','commenter','valider_levee','gerer_chantier','gerer_plans',
  'gerer_intervenants','gerer_parametres','inviter_entreprise','gerer_membres']) a), '3.13 aucune action Réserves sur son propre tenant');
select throws_ok($$insert into public.reserves_chantiers (entreprise_id, nom) values ('c0000000-0000-0000-0000-000000000001','Chantier gratuit')$$,
  '42501', null, '3.14 C ne crée pas de chantier (fonction payante)');
select throws_like($$select * from public.reserves_ajouter_plan('e7000000-0000-0000-0000-000000000001','Plan C')$$, '%non autorisé%', '3.15 C ne dépose pas de plan');
select throws_like($$select public.reserves_attribuer_role('c0000000-0000-0000-0000-0000000000a1','c0000000-0000-0000-0000-000000000001','reserves_admin_organisation')$$,
  '%non autorisée%', '3.16 C ne s''auto-promeut pas par la RPC');
select throws_ok($$insert into public.habilitations_applications_utilisateurs (entreprise_id, utilisateur_id, application_code, role_code)
  values ('c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-0000000000a1','colors','colors_admin_organisation')$$,
  '42501', null, '3.17 C ne s''écrit aucune habilitation');
select throws_ok($$update public.acces_applications_entreprises set source = 'abonnement' where entreprise_id = 'c0000000-0000-0000-0000-000000000001'$$,
  '42501', null, '3.18 C ne convertit pas son accès gratuit en accès payant');
select ok(not public.a_acces_application('c0000000-0000-0000-0000-000000000001', 'colors')
  and not public.a_acces_application('c0000000-0000-0000-0000-000000000001', 'tools'), '3.19 l''invitation n''ouvre aucune autre application');
select is((select count(*)::int from public.reserves_lister_membres('c0000000-0000-0000-0000-000000000001')), 0, '3.20 pas d''administration des membres');
select throws_like($$select public.reserves_inviter_intervenant('e7200000-0000-0000-0000-00000000000c', repeat('a',64), 'x@invalid.local')$$,
  '%', '3.21 C n''invite personne');
select is((select count(*)::int from public.reserves_conversations_visibles(null) v where v.reserve_id = pg_temp.r('r3')), 0,
  '3.22 C ne voit pas les échanges de D');

-- ═════════════════════════════════════════════════════════════════════════════
-- §4 CROSS-TENANT
-- ═════════════════════════════════════════════════════════════════════════════
select pg_temp.en_tant_que('20000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.reserves where entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 0, '4.01 B : 0 réserve de A');
select is((select count(*)::int from public.reserves_chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 0, '4.02 B : 0 chantier de A');
select is((select count(*)::int from public.reserves_photos where entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 0, '4.03 B : 0 photo de A');
select is((select count(*)::int from public.reserves_historique where entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 0, '4.04 B : 0 historique de A');
select is((select count(*)::int from public.reserves_messages where entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 0, '4.05 B : 0 message de A');
select is((select count(*)::int from public.reserves_plans where entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 0, '4.06 B : 0 plan de A');
select is((select count(*)::int from public.reserves_intervenants where entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 0, '4.07 B : 0 intervenant de A');
select is((select count(*)::int from public.reserves_evenements_notifications where entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 0, '4.08 B : 0 notification de A');
select is((select count(*)::int from storage.objects where bucket_id = 'reserves-photos' and name like 'a0000000%'), 0, '4.09 B : 0 objet Storage de A');
with x as (update public.reserves set titre = 'piraté' where id = pg_temp.r('r2') returning 1) select is((select count(*)::int from x), 0, '4.10 B : update direct sans effet');
select throws_like($$select public.reserves_commenter(pg_temp.r('r2'), 'intrusion')$$, '%non autorisé%', '4.11 B : commentaire refusé');
select throws_like($$select * from public.reserves_ajouter_photo(pg_temp.r('r2'), 'constat')$$, '%non autorisé%', '4.12 B : photo refusée');
select throws_like($$select public.reserves_statuer_levee(pg_temp.r('r2'), true)$$, '%non autorisée%', '4.13 B : validation refusée');
select throws_like($$select public.reserves_assigner(pg_temp.r('r5'), 'e7200000-0000-0000-0000-00000000000d')$$, '%non autorisée%', '4.14 B : assignation refusée');
select throws_like($$select public.reserves_annuler(pg_temp.r('r5'), 'intrusion')$$, '%non autorisée%', '4.15 B : annulation refusée');
select throws_like($$select * from public.reserves_transition_differee(pg_temp.r('r2'), 'levee')$$, '%non autorisée%', '4.16 B : file hors-ligne refusée');
select throws_like($$select public.reserves_repositionner(pg_temp.r('r2'), null, null, null, null)$$, '%non autorisé%', '4.17 B : repositionnement refusé');
select throws_like($$select public.reserves_transferer_responsabilite(pg_temp.r('r5'), 'e7200000-0000-0000-0000-00000000000d', 'x')$$, '%non autorisé%', '4.18 B : transfert refusé');
select throws_like($$select public.reserves_supprimer_photo(pg_temp.r('ph_avant'), 'x')$$, '%non autorisée%', '4.19 B : suppression de photo refusée');
select throws_like($$select public.reserves_revoquer_intervenant('e7200000-0000-0000-0000-00000000000c')$$, '%non autorisée%', '4.20 B : révocation refusée');
select is((select count(*)::int from public.reserves_export_chantier('e7000000-0000-0000-0000-000000000001'))
  + (select count(*)::int from public.reserves_export_historique('e7000000-0000-0000-0000-000000000001'))
  + (select count(*)::int from public.reserves_export_photos('e7000000-0000-0000-0000-000000000001'))
  + (select count(*)::int from public.reserves_export_intervenants('e7000000-0000-0000-0000-000000000001'))
  + (select count(*)::int from public.reserves_export_entete('e7000000-0000-0000-0000-000000000001'))
  + (select count(*)::int from public.reserves_photos_visibles(pg_temp.r('r1'))), 0, '4.21 B : tous les exports de A sont vides');
select is((select total::int from public.reserves_tableau_de_bord('a0000000-0000-0000-0000-000000000001')), 0, '4.22 B : tableau de bord de A vide');
select throws_like($$select public.reserves_creer('e7000000-0000-0000-0000-000000000001','Réserve de B chez A')$$, '%non autorisée%', '4.23 B : création chez A refusée');
select throws_like($$select public.reserves_creer('e7000000-0000-0000-0000-00000000000b','Vol d''intervenant',null,'normale','e7200000-0000-0000-0000-00000000000c')$$,
  '%Intervenant invalide%', '4.24 B ne peut pas attribuer sa réserve à l''intervenant de A');
select throws_like($$select public.reserves_creer('e7000000-0000-0000-0000-00000000000b','Vol de plan',null,'normale',null,'e7100000-0000-0000-0000-000000000001',0.1,0.1)$$,
  '%Plan invalide%', '4.25 B ne peut pas pointer sa réserve sur un plan de A');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.reserves where id = pg_temp.r('rb')), 0, '4.26 A : 0 réserve de B');
select pg_temp.en_tant_que('c0000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.reserves where id = pg_temp.r('rb')), 0, '4.27 C (intervenant de A) : 0 réserve de B');
select throws_like($$select public.reserves_commenter(pg_temp.r('r3'), 'chez D')$$, '%non autorisé%', '4.28 C : commentaire sur la réserve de D refusé');
select throws_like($$select public.reserves_demander_levee(pg_temp.r('r3'))$$, '%non autorisée%', '4.29 C : levée sur la réserve de D refusée');
select throws_like($$select public.reserves_repondre_responsabilite(pg_temp.r('r3'), true)$$, '%non autorisée%', '4.30 C : acceptation à la place de D refusée');

-- R-05 : le porteur d'une réserve ne change pas par écriture directe.
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select throws_ok($$update public.reserves_intervenants set entreprise_intervenante_id = 'b0000000-0000-0000-0000-000000000001'
  where id = 'e7200000-0000-0000-0000-00000000000c'$$, '42501', null,
  '4.31 (R-05) l''hôte ne rattache pas une organisation tierce par écriture directe');
select throws_ok($$update public.reserves_intervenants set statut = 'revoquee', revoque_at = now()
  where id = 'e7200000-0000-0000-0000-00000000000d'$$, '42501', null,
  '4.32 (R-05) une révocation hors du geste métier tracé est refusée');
select lives_ok($$update public.reserves_intervenants set corps_etat = 'Peinture et revêtements'
  where id = 'e7200000-0000-0000-0000-00000000000c'$$, '4.33 (R-05) les champs descriptifs restent modifiables');
select pg_temp.en_tant_que('c0000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.reserves where id = pg_temp.r('r2')), 1, '4.34 (R-05) C garde l''accès à ses réserves');

-- ═════════════════════════════════════════════════════════════════════════════
-- §5 INTÉGRATION GESTION PRO
-- ═════════════════════════════════════════════════════════════════════════════
select pg_temp.en_service();
update public.chantiers set ville = 'Colmar', adresse = '1 rue du Test' where id = 'a4000000-0000-0000-0000-000000000001';
insert into public.chantiers (id, entreprise_id, client_id, nom, statut) values
  ('a4000000-0000-0000-0000-0000000000f9','a0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','QUALIF_GP_éphémère','en_cours');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select set_config('q.gp', public.reserves_importer_chantier_gp('a4000000-0000-0000-0000-000000000001')::text, true);
select ok((select source = 'gestion_pro' and chantier_gp_id = 'a4000000-0000-0000-0000-000000000001' and nom = 'TEST_A_Chantier assigné'
  and synchronise_at is not null from public.reserves_chantiers where id = pg_temp.r('gp')), '5.01 import GP → Réserves : lien, nom, horodatage');
select is(public.reserves_importer_chantier_gp('a4000000-0000-0000-0000-000000000001'), pg_temp.r('gp'), '5.02 réimport idempotent (même chantier)');
select ok((select ville is null and adresse is null from public.reserves_chantiers where id = pg_temp.r('gp')),
  '5.03 constat : seul le nom est repris — adresse et ville GP ne sont pas importées (écart documenté)');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000002');
select throws_like($$select public.reserves_importer_chantier_gp('a4000000-0000-0000-0000-000000000002')$$, '%non autorisé côté Réserves%',
  '5.04 émetteur (sans gestion de chantier) : import refusé');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000005');
select throws_like($$select public.reserves_importer_chantier_gp('a4000000-0000-0000-0000-000000000002')$$, '%non autorisé%',
  '5.05 consultation : import refusé');
select pg_temp.en_tant_que('20000000-0000-0000-0000-000000000001');
select throws_like($$select public.reserves_importer_chantier_gp('a4000000-0000-0000-0000-000000000002')$$, '%non autorisé%',
  '5.06 B : import d''un chantier GP de A refusé');
select is((select count(*)::int from public.reserves_resume_chantier_gp('a4000000-0000-0000-0000-000000000001')), 0, '5.07 B : aucun résumé');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select public.reserves_creer(pg_temp.r('gp'), 'Réserve GP en retard', null, 'normale', null, null, null, null, false, current_date - 2);
select public.reserves_creer(pg_temp.r('gp'), 'Réserve GP annulée');
select public.reserves_annuler((select id from public.reserves where chantier_id = pg_temp.r('gp') and titre = 'Réserve GP annulée'), 'doublon');
select results_eq($$select total::int, ouvertes::int, demandes_levee::int, levees::int, en_retard::int
  from public.reserves_resume_chantier_gp('a4000000-0000-0000-0000-000000000001')$$,
  $$values (2, 1, 0, 0, 1)$$, '5.08 résumé Réserves → GP : compteurs exacts');
select ok((select count(*) = 0 from public.reserves_resume_chantier_gp('a4000000-0000-0000-0000-000000000001') r
  where r.chantier_reserves_id <> pg_temp.r('gp')), '5.09 le résumé ne pointe que le chantier Réserves lié (lien de statut)');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000006');
select is((select count(*)::int from public.reserves_resume_chantier_gp('a4000000-0000-0000-0000-000000000001')), 0,
  '5.10 utilisateur GP sans rôle Réserves : aucun résumé (aucun droit déduit de GP)');
select throws_like($$select public.reserves_importer_chantier_gp('a4000000-0000-0000-0000-000000000002')$$, '%non autorisé côté Réserves%',
  '5.11 permission GP seule insuffisante pour importer');
select pg_temp.en_service();
update public.chantiers set nom = 'TEST_A_Chantier renommé' where id = 'a4000000-0000-0000-0000-000000000001';
select is((select nom from public.reserves_chantiers where id = pg_temp.r('gp')), 'TEST_A_Chantier assigné',
  '5.12 sens unique à la demande : un renommage GP n''est pas propagé sans réimport');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select public.reserves_importer_chantier_gp('a4000000-0000-0000-0000-000000000001');
select is((select nom from public.reserves_chantiers where id = pg_temp.r('gp')), 'TEST_A_Chantier renommé', '5.13 le réimport resynchronise le nom');
select set_config('q.gp_eph', public.reserves_importer_chantier_gp('a4000000-0000-0000-0000-0000000000f9')::text, true);
select public.reserves_creer(pg_temp.r('gp_eph'), 'Réserve sur chantier GP éphémère');
select pg_temp.en_service();
select lives_ok($$delete from public.chantiers where id = 'a4000000-0000-0000-0000-0000000000f9'$$,
  '5.14 (R-04) un chantier GP lié peut être supprimé côté GP');
select ok((select source = 'reserves' and chantier_gp_id is null from public.reserves_chantiers where id = pg_temp.r('gp_eph')),
  '5.15 (R-04) le chantier Réserves est détaché, pas perdu');
select is((select count(*)::int from public.reserves where chantier_id = pg_temp.r('gp_eph')), 1, '5.16 (R-04) ses réserves sont intactes');

-- ═════════════════════════════════════════════════════════════════════════════
-- §6 STOCKAGE
-- ═════════════════════════════════════════════════════════════════════════════
select pg_temp.en_service();
select ok((select not public from storage.buckets where id = 'reserves-photos')
  and (select not public from storage.buckets where id = 'reserves-plans'), '6.01 buckets privés : aucune URL publique');
select ok((select storage_path like 'a0000000-0000-0000-0000-000000000001/e7000000-0000-0000-0000-000000000001/' || pg_temp.r('r1') || '/%'
  from public.reserves_photos where id = pg_temp.r('ph_apres')), '6.02 chemin composé par la base : organisation / chantier / réserve');
select is((select ajoutee_par_entreprise_id from public.reserves_photos where id = pg_temp.r('ph_apres')),
  'c0000000-0000-0000-0000-000000000001'::uuid, '6.03 propriété : la photo de C est attribuée à C');
select pg_temp.en_tant_que('c0000000-0000-0000-0000-0000000000a1');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('reserves-photos',
  'a0000000-0000-0000-0000-000000000001/e7000000-0000-0000-0000-000000000001/' || pg_temp.r('r3') || '/forge.jpg')$$,
  '42501', null, '6.04 C ne dépose pas sous la réserve de D');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('reserves-photos',
  'a0000000-0000-0000-0000-000000000001/e7000000-0000-0000-0000-00000000000b/' || pg_temp.r('r1') || '/forge.jpg')$$,
  '42501', null, '6.05 chemin forgé (chantier incohérent) refusé');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('reserves-photos', '../../etc/passwd')$$,
  '42501', null, '6.06 chemin arbitraire refusé');
select ok((select count(*) from storage.objects where bucket_id = 'reserves-photos' and name like '%/' || pg_temp.r('r3') || '/%') = 0
  and (select count(*) from storage.objects where bucket_id = 'reserves-photos' and name like '%/' || pg_temp.r('r1') || '/%') >= 2,
  '6.07 C lit les photos (avant/après) de ses réserves, aucune de celles de D');
with x as (delete from storage.objects where bucket_id = 'reserves-photos' returning 1) select is((select count(*)::int from x), 0, '6.08 C n''efface aucun objet');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
with x as (delete from storage.objects where bucket_id = 'reserves-photos' returning 1) select is((select count(*)::int from x), 0,
  '6.09 l''administrateur hôte n''efface aucune photo (immuables)');
with x as (update storage.objects set name = name || '.bak' where bucket_id = 'reserves-photos' returning 1) select is((select count(*)::int from x), 0,
  '6.10 aucune photo réécrite');
select throws_like($$select public.reserves_supprimer_photo(pg_temp.r('ph_apres'), 'gênante')$$, '%', '6.11 une photo ayant fondé une décision est indélébile');
-- Plans : lien de signature d'un plan non attribué.
select set_config('q.plan_chemin', 'a0000000-0000-0000-0000-000000000001/e7000000-0000-0000-0000-000000000001/e7100000-0000-0000-0000-000000000002/p.pdf', true);
insert into storage.objects (bucket_id, name) values ('reserves-plans', current_setting('q.plan_chemin'));
select pg_temp.en_tant_que('c0000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from storage.objects where bucket_id = 'reserves-plans' and name = current_setting('q.plan_chemin')), 0,
  '6.12 C ne peut pas signer l''URL d''un plan qui ne porte aucune de ses réserves');
select pg_temp.en_tant_que('20000000-0000-0000-0000-000000000001');
select is((select count(*)::int from storage.objects where bucket_id in ('reserves-photos','reserves-plans') and name like 'a0000000%'), 0,
  '6.13 B : aucun objet de A signable (photos et plans)');

-- ═════════════════════════════════════════════════════════════════════════════
-- §7 HISTORIQUE NON FALSIFIABLE
-- ═════════════════════════════════════════════════════════════════════════════
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select throws_ok($$insert into public.reserves_historique (entreprise_id, reserve_id, action) values
  ('a0000000-0000-0000-0000-000000000001', pg_temp.r('r1'), 'levee_validee')$$, '42501', null, '7.01 insertion directe refusée');
select throws_ok($$update public.reserves_historique set commentaire = 'réécrit' where reserve_id = pg_temp.r('r1')$$, '42501', null, '7.02 réécriture refusée');
select throws_ok($$delete from public.reserves_historique where reserve_id = pg_temp.r('r1')$$, '42501', null, '7.03 effacement refusé');
select throws_ok($$update public.reserves set statut = 'assignee' where id = pg_temp.r('r1')$$, 'P0001', null, '7.04 statut non réécrivable hors action métier');
-- R-01 : le dossier clôturé est figé ; toute modification de contenu est tracée.
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000002');
select throws_ok($$update public.reserves set titre = 'Réécrit après levée' where id = pg_temp.r('r1')$$, '42501', null,
  '7.05 (R-01) le contenu d''une réserve levée ne se réécrit pas');
select lives_ok($$update public.reserves set titre = 'Joint placo (cage B)', echeance = current_date + 5 where id = pg_temp.r('r3')$$,
  '7.06 une réserve ouverte reste modifiable');
select set_eq($$select champ || ':' || coalesce(valeur_avant,'∅') || '→' || valeur_apres from public.reserves_historique
  where reserve_id = pg_temp.r('r3') and action = 'modification'$$,
  $$values ('titre:Joint placo→Joint placo (cage B)'), ('echeance:∅→' || (current_date + 5)::text)$$,
  '7.07 (R-01) chaque champ modifié est historisé avec avant / après');
select is((select auteur_id from public.reserves_historique where reserve_id = pg_temp.r('r3') and champ = 'titre'),
  '10000000-0000-0000-0000-000000000002'::uuid, '7.08 l''auteur de la modification est tracé');
-- R-02 : même la clé serveur et le propriétaire ne réécrivent pas l'historique.
select pg_temp.en_service();
select throws_ok($$update public.reserves_historique set commentaire = 'réécrit' where reserve_id = pg_temp.r('r1')$$, '42501', null,
  '7.09 (R-02) propriétaire / service : réécriture refusée');
select throws_ok($$delete from public.reserves_historique where reserve_id = pg_temp.r('r1')$$, '42501', null,
  '7.10 (R-02) propriétaire / service : effacement ligne à ligne refusé');
select throws_ok($$truncate public.reserves_historique$$, '42501', null, '7.11 (R-02) truncate refusé');
savepoint cascade_ok;
select lives_ok($$delete from public.reserves_chantiers where id = pg_temp.r('gp_eph')$$,
  '7.12 (R-02) la suppression d''un dossier entier (cascade) reste possible');
rollback to savepoint cascade_ok;
savepoint purge_ok;
update public.entreprises set suppression_prevue_at = now() - interval '1 day' where id = 'b0000000-0000-0000-0000-000000000001';
select lives_ok($$delete from public.reserves_historique where entreprise_id = 'b0000000-0000-0000-0000-000000000001'$$,
  '7.13 (R-02) la purge RGPD d''une organisation à suppression échue reste possible');
rollback to savepoint purge_ok;
select is((select count(*)::int from public.reserves_historique where reserve_id = pg_temp.r('r1')), 10, '7.14 l''historique de R1 est intact');

-- ═════════════════════════════════════════════════════════════════════════════
-- §8 AUTH : RÉVOCATION, RÔLE, ENTITLEMENT, SUSPENSION, SESSION DÉJÀ OUVERTE
-- ═════════════════════════════════════════════════════════════════════════════
-- Chaque cas garde le MÊME jeton (session déjà ouverte) : la décision est reprise à chaque
-- requête par les prédicats de la base, sans reconnexion.
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000004');
select ok((select count(*) from public.reserves) > 0, '8.01 responsable : accès nominal');
select pg_temp.en_service();
update public.habilitations_applications_utilisateurs set role_code = 'reserves_consultation'
where utilisateur_id = '10000000-0000-0000-0000-000000000004' and application_code = 'reserves';
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000004');
select throws_like($$select public.reserves_statuer_levee(pg_temp.r('r6'), true)$$, '%non autorisée%', '8.02 rétrogradation : validation refusée aussitôt');
select ok((select count(*) from public.reserves) > 0, '8.03 rétrogradation : lecture conservée (consultation)');
select pg_temp.en_service();
update public.habilitations_applications_utilisateurs set autorise = false
where utilisateur_id = '10000000-0000-0000-0000-000000000004' and application_code = 'reserves';
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.reserves), 0, '8.04 habilitation révoquée : 0 réserve');
select is((select count(*)::int from storage.objects where bucket_id = 'reserves-photos'), 0, '8.05 habilitation révoquée : 0 photo');
select pg_temp.en_service();
update public.habilitations_applications_utilisateurs set autorise = true, role_code = 'reserves_responsable', valide_jusqu_au = now() - interval '1 minute'
where utilisateur_id = '10000000-0000-0000-0000-000000000004' and application_code = 'reserves';
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.reserves), 0, '8.06 habilitation échue : 0 réserve');
select pg_temp.en_service();
update public.habilitations_applications_utilisateurs set valide_jusqu_au = null
where utilisateur_id = '10000000-0000-0000-0000-000000000004' and application_code = 'reserves';
-- Membre désactivé dans l'organisation.
update public.utilisateurs_entreprises set statut = 'desactive' where utilisateur_id = '10000000-0000-0000-0000-000000000004';
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.reserves), 0, '8.07 membre désactivé : 0 réserve');
select pg_temp.en_service();
update public.utilisateurs_entreprises set statut = 'actif' where utilisateur_id = '10000000-0000-0000-0000-000000000004';
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000004');
select ok((select count(*) from public.reserves) > 0, '8.08 réactivation : accès rétabli sans reconnexion');
-- Entitlement applicatif de l'organisation.
select pg_temp.en_service();
update public.acces_applications_entreprises set autorise = false where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'reserves';
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.reserves), 0, '8.09 entitlement retiré : l''administrateur ne voit plus rien');
select throws_like($$select public.reserves_creer('e7000000-0000-0000-0000-000000000001','Après retrait')$$, '%non autorisée%', '8.10 entitlement retiré : écriture refusée');
select pg_temp.en_service();
update public.acces_applications_entreprises set autorise = true, valide_jusqu_au = now() - interval '1 second'
where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'reserves';
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.reserves), 0, '8.11 entitlement échu : 0 réserve');
select pg_temp.en_service();
update public.acces_applications_entreprises set valide_jusqu_au = null
where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'reserves';
-- Suspension du tenant (abonnement suspendu, puis suspension programmée échue).
update public.entreprises set abonnement_statut = 'suspendu' where id = 'a0000000-0000-0000-0000-000000000001';
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.reserves), 0, '8.12 tenant suspendu : 0 réserve');
select is((select count(*)::int from storage.objects where bucket_id = 'reserves-photos'), 0, '8.13 tenant suspendu : 0 photo');
select throws_like($$select public.reserves_commenter(pg_temp.r('r3'), 'pendant suspension')$$, '%non autorisé%', '8.14 tenant suspendu : écriture refusée');
select throws_ok($$update public.entreprises set abonnement_statut = 'actif' where id = 'a0000000-0000-0000-0000-000000000001'$$,
  '42501', null, '8.15 le tenant suspendu ne lève pas sa propre suspension');
select pg_temp.en_service();
update public.entreprises set abonnement_statut = 'actif', suspension_prevue_at = now() - interval '1 minute' where id = 'a0000000-0000-0000-0000-000000000001';
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.reserves), 0, '8.16 suspension programmée échue : 0 réserve');
select pg_temp.en_service();
update public.entreprises set suspension_prevue_at = null where id = 'a0000000-0000-0000-0000-000000000001';
-- Session révoquée (déconnexion forcée d'un appareil) : le jeton encore valide ne sert plus.
insert into public.sessions_revoquees (session_id, utilisateur_id, entreprise_id)
values ('5e550000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');
select pg_temp.en_session('10000000-0000-0000-0000-000000000001', '5e550000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.reserves), 0, '8.17 session révoquée : jeton encore valide mais 0 réserve');
select pg_temp.en_session('10000000-0000-0000-0000-000000000001', '5e550000-0000-0000-0000-000000000002');
select ok((select count(*) from public.reserves) > 0, '8.18 une autre session du même utilisateur n''est pas touchée');
-- Entreprise intervenante : suspension, puis révocation de l'intervention.
select pg_temp.en_service();
update public.entreprises set abonnement_statut = 'suspendu' where id = 'c0000000-0000-0000-0000-000000000001';
select pg_temp.en_tant_que('c0000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.reserves), 0, '8.19 intervenant dont le tenant est suspendu : 0 réserve');
select pg_temp.en_service();
update public.entreprises set abonnement_statut = 'actif' where id = 'c0000000-0000-0000-0000-000000000001';
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select lives_ok($$select * from public.reserves_revoquer_intervenant('e7200000-0000-0000-0000-00000000000c', 'fin de mission')$$, '8.20 l''hôte révoque C');
select pg_temp.en_tant_que('c0000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.reserves), 0, '8.21 intervenant révoqué : 0 réserve, session ouverte comprise');
select is((select count(*)::int from storage.objects where bucket_id = 'reserves-photos'), 0, '8.22 intervenant révoqué : 0 photo');
select throws_like($$select public.reserves_commenter(pg_temp.r('r2'), 'après révocation')$$, '%non autorisé%', '8.23 intervenant révoqué : écriture refusée');
select pg_temp.en_service();
select is((select count(*)::int from public.acces_applications_entreprises where entreprise_id = 'c0000000-0000-0000-0000-000000000001'
  and application_code = 'reserves'), 0, '8.24 l''accès gratuit né de l''invitation est retiré');

-- ═════════════════════════════════════════════════════════════════════════════
-- §9 ESCALADE PAR LA FILE HORS-LIGNE (R-03)
-- ═════════════════════════════════════════════════════════════════════════════
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000002'); -- émetteur
select throws_like($$select public.reserves_statuer_levee(pg_temp.r('r6'), true)$$, '%non autorisée%', '9.01 émetteur : statuer_levee refusé');
select throws_like($$select * from public.reserves_transition_differee(pg_temp.r('r6'), 'levee')$$, '%Validation de levée non autorisée%',
  '9.02 (R-03) émetteur : validation par la file hors-ligne refusée');
select throws_like($$select * from public.reserves_transition_differee(pg_temp.r('r6'), 'levee_refusee', 'non')$$, '%Validation de levée non autorisée%',
  '9.03 (R-03) émetteur : refus de levée par la file hors-ligne refusé');
select throws_like($$select * from public.reserves_transition_differee(pg_temp.r('r1'), 'assignee', 'rouvre', 'e7200000-0000-0000-0000-00000000000d')$$, '%',
  '9.04 (R-03) émetteur : réouverture d''une réserve levée refusée');
select is((select statut from public.reserves where id = pg_temp.r('r6')), 'levee_demandee', '9.05 R6 reste en attente de décision');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001'); -- administrateur
select is((select issue from public.reserves_transition_differee(pg_temp.r('r6'), 'levee', null, null,
  'abababab-0000-4000-8000-000000000001')), 'appliquee', '9.06 l''administrateur valide légitimement par la file hors-ligne');
select is((select issue from public.reserves_transition_differee(pg_temp.r('r6'), 'levee', null, null,
  'abababab-0000-4000-8000-000000000001')), 'rejeu', '9.07 le rejeu de la même mutation est idempotent');

select * from finish();
rollback;
