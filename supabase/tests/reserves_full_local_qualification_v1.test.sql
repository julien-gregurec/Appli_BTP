-- ELSATIA-RESERVES-FULL-LOCAL-QUALIFICATION-V1
--
-- Recette métier complète d'ELSATIA Réserves, jouée sous l'identité RÉELLE de chaque acteur
-- (rôle `authenticated`, `request.jwt.claim.sub`) sur le vrai train de migrations :
--
--   Entreprise A (hôte, utilise aussi Gestion Pro)
--     admin-a       reserves_admin_organisation   (invite, paramètre)
--     conducteur-a  reserves_responsable          (« Responsable réserves » : valide/refuse)
--     ouvrier-a     reserves_emetteur             (constate, ne valide pas)
--     chef-equipe-a reserves_consultation         (lecture seule)
--     comptable-a   reserves_responsable SANS permission GP `acces_chantiers`
--     dirigeant-a   Gestion Pro seul, aucun rôle Réserves
--   Entreprise B (invitée, compte GRATUIT limité)
--     chef-equipe-b « Intervenant B » : rejoint par lien d'invitation
--     admin-b       administrateur Gestion Pro de B, sans habilitation Réserves
--   Entreprise C (cliente Réserves PAYANTE, sans Gestion Pro, compte ELSATIA partagé :
--     elle a ses propres chantiers ET intervient chez A)
--
-- Sections : 1 décor · 2 invitation · 3 scénario métier (réserve 1, photo obligatoire,
-- refus, réassignation) · 4 photo obligatoire réserve par réserve · 5 cross-tenant ·
-- 6 intervenant gratuit · 7 historique immuable · 8 Storage · 9 export PDF par entreprise ·
-- 10 intégration Gestion Pro · 11 suspension / révocation sans reconnexion · 12 autonomie C.

begin;
create extension if not exists pgtap with schema extensions;
select plan(227);

\ir fixtures/isolation_multitenant.inc

\set A      'a0000000-0000-0000-0000-000000000001'
\set B      'b0000000-0000-0000-0000-000000000001'
\set C      'c7000000-0000-0000-0000-000000000001'
\set ADMIN_A     '10000000-0000-0000-0000-000000000001'
\set EMETTEUR_A  '10000000-0000-0000-0000-000000000002'
\set CONSULT_A   '10000000-0000-0000-0000-000000000003'
\set RESP_A      '10000000-0000-0000-0000-000000000004'
\set RESP_SANS_GP '10000000-0000-0000-0000-000000000005'
\set GP_SEUL_A   '10000000-0000-0000-0000-000000000006'
\set ADMIN_B     '20000000-0000-0000-0000-000000000001'
\set MEMBRE_B    '20000000-0000-0000-0000-000000000002'
\set INTERV_B    '20000000-0000-0000-0000-000000000003'
\set ADMIN_C     'c7000000-0000-0000-0000-0000000000a1'
\set PLATEFORME  '30000000-0000-0000-0000-000000000001'
\set CH_A   'e7100000-0000-0000-0000-000000000001'
\set CH_C   'e7100000-0000-0000-0000-00000000000c'
\set I_B    'e7200000-0000-0000-0000-00000000000b'
\set I_C    'e7200000-0000-0000-0000-00000000000c'

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. DÉCOR
-- ═════════════════════════════════════════════════════════════════════════════
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', :'ADMIN_C', 'authenticated', 'authenticated',
        'admin-c@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now())
on conflict (id) do nothing;
insert into public.utilisateurs (id, prenom, nom) values (:'ADMIN_C', 'Admin', 'C') on conflict (id) do nothing;
insert into public.entreprises (id, nom, raison_sociale, siret, ville, code_adhesion)
values (:'C', 'Plomberie C', 'PLOMBERIE C SAS', '77777777700077', 'Mulhouse', 'ISOC0001')
on conflict (id) do nothing;
insert into public.postes (id, entreprise_id, nom) values ('c7100000-0000-0000-0000-000000000001', :'C', 'Gérant C')
on conflict (id) do nothing;
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
values (:'ADMIN_C', :'C', 'c7100000-0000-0000-0000-000000000001', 'actif') on conflict do nothing;

-- A et C paient Réserves ; B n'a rien : son accès naîtra de l'invitation.
insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source) values
  (:'A', 'reserves', true, 'abonnement'),
  (:'C', 'reserves', true, 'abonnement');
insert into public.habilitations_applications_utilisateurs (entreprise_id, utilisateur_id, application_code, role_code) values
  (:'A', :'ADMIN_A',      'reserves', 'reserves_admin_organisation'),
  (:'A', :'RESP_A',       'reserves', 'reserves_responsable'),
  (:'A', :'EMETTEUR_A',   'reserves', 'reserves_emetteur'),
  (:'A', :'CONSULT_A',    'reserves', 'reserves_consultation'),
  (:'A', :'RESP_SANS_GP', 'reserves', 'reserves_responsable'),
  (:'C', :'ADMIN_C',      'reserves', 'reserves_admin_organisation');

update public.chantiers set adresse = '12 rue des Tanneurs', code_postal = '68000', ville = 'Colmar'
where id = 'a4000000-0000-0000-0000-000000000001';

set local role authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. CHANTIER, PLAN, INTERVENANTS, INVITATIONS
-- ═════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claim.sub', :'RESP_A', true);
select set_config('request.jwt.claim.email', 'conducteur-a@invalid.local', true);

select lives_ok($$insert into public.reserves_chantiers (id, entreprise_id, nom, reference, ville)
  values ('e7100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
          'QUALIF_Résidence Les Tilleuls','TIL-2026','Colmar')$$,
  '2.1 le responsable réserves crée un chantier Réserves autonome (sans Gestion Pro)');

select set_config('q.plan', (select plan_id::text from public.reserves_ajouter_plan(
  'e7100000-0000-0000-0000-000000000001', 'RDC', 'Niveau 0', 'Bâtiment A', 'application/pdf', 2048, 'rdc.pdf')), true);
select set_config('q.plan_path', (select storage_path from public.reserves_plans where id = current_setting('q.plan')::uuid), true);
select is(current_setting('q.plan_path'), '', '2.2 le plan est déclaré, mais aucun fichier n''est confirmé tant qu''il n''est pas déposé');
select set_config('q.plan_path', 'a0000000-0000-0000-0000-000000000001/e7100000-0000-0000-0000-000000000001/'
  || current_setting('q.plan') || '/rdc.pdf', true);
select throws_like($$select public.reserves_confirmer_plan(current_setting('q.plan')::uuid, current_setting('q.plan_path'))$$,
  '%Aucun document%', '2.3 confirmer un plan sans fichier dans le bucket est refusé');
select lives_ok($$insert into storage.objects (bucket_id, name, metadata)
  values ('reserves-plans', current_setting('q.plan_path'), '{"mimetype":"application/pdf"}')$$,
  '2.4 le responsable dépose le PDF du plan dans le bucket privé');
select lives_ok($$select public.reserves_confirmer_plan(current_setting('q.plan')::uuid, current_setting('q.plan_path'))$$,
  '2.5 puis confirme le plan');
select set_config('q.plan2', (select plan_id::text from public.reserves_ajouter_plan(
  'e7100000-0000-0000-0000-000000000001', 'R+1', 'Niveau 1', 'Bâtiment A', 'application/pdf', 2048, 'r1.pdf')), true);
select set_config('q.plan2_path', 'a0000000-0000-0000-0000-000000000001/e7100000-0000-0000-0000-000000000001/'
  || current_setting('q.plan2') || '/r1.pdf', true);
insert into storage.objects (bucket_id, name, metadata)
  values ('reserves-plans', current_setting('q.plan2_path'), '{"mimetype":"application/pdf"}');
select public.reserves_confirmer_plan(current_setting('q.plan2')::uuid, current_setting('q.plan2_path'));

select lives_ok($$insert into public.reserves_intervenants (id, entreprise_id, chantier_id, nom, corps_etat) values
  ('e7200000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-000000000001','e7100000-0000-0000-0000-000000000001','Étanchéité B','Étanchéité'),
  ('e7200000-0000-0000-0000-00000000000c','a0000000-0000-0000-0000-000000000001','e7100000-0000-0000-0000-000000000001','Plomberie C','Plomberie')$$,
  '2.6 le responsable déclare deux entreprises intervenantes sur le chantier');

select throws_like($$select public.reserves_inviter_intervenant('e7200000-0000-0000-0000-00000000000b',
    encode(extensions.digest('qualif-b','sha256'),'hex'), 'chef-equipe-b@invalid.local')$$,
  '%non autorisée%', '2.7 inviter une entreprise est réservé à l''administrateur Réserves (le responsable ne le peut pas)');

select set_config('request.jwt.claim.sub', :'ADMIN_A', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select lives_ok($$select public.reserves_inviter_intervenant('e7200000-0000-0000-0000-00000000000b',
    encode(extensions.digest('qualif-b','sha256'),'hex'), 'chef-equipe-b@invalid.local', 'Chef B')$$,
  '2.8 l''administrateur A invite B par lien (jeton haché, aucun identifiant technique)');
select lives_ok($$select public.reserves_inviter_intervenant('e7200000-0000-0000-0000-00000000000c',
    encode(extensions.digest('qualif-c','sha256'),'hex'), 'admin-c@invalid.local', 'Admin C',
    'c7000000-0000-0000-0000-000000000001')$$,
  '2.9 et invite C nominativement (lien lié à l''organisation C)');

-- B rejoint : Intervenant B (chef d'équipe de B).
select set_config('request.jwt.claim.sub', :'INTERV_B', true);
select set_config('request.jwt.claim.email', 'chef-equipe-b@invalid.local', true);
select ok(not public.a_acces_application(:'B', 'reserves'), '2.10 avant d''accepter, B n''a aucun accès Réserves');
select throws_like($$select public.reserves_invitation_accepter(encode(extensions.digest('qualif-c','sha256'),'hex'),
    'b0000000-0000-0000-0000-000000000001')$$,
  '%autre organisation%', '2.11 B ne peut pas consommer le lien nominatif émis pour C');
select lives_ok($$select public.reserves_invitation_accepter(encode(extensions.digest('qualif-b','sha256'),'hex'),
    'b0000000-0000-0000-0000-000000000001')$$, '2.12 Intervenant B rejoint le chantier par son lien');
select is((select source from public.acces_applications_entreprises where entreprise_id = :'B' and application_code = 'reserves'),
  'reserves_invitation_gratuite', '2.13 B reçoit un accès applicatif GRATUIT, de source explicite');
select is(public.reserves_role_courant(:'B'), 'reserves_intervenant', '2.14 et le seul rôle « intervenant »');

-- C rejoint : compte ELSATIA partagé (client payant, déjà administrateur Réserves chez lui).
select set_config('request.jwt.claim.sub', :'ADMIN_C', true);
select set_config('request.jwt.claim.email', 'admin-c@invalid.local', true);
select lives_ok($$select public.reserves_invitation_accepter(encode(extensions.digest('qualif-c','sha256'),'hex'),
    'c7000000-0000-0000-0000-000000000001')$$, '2.15 C (cliente payante) rejoint avec son compte existant');
select is(public.reserves_role_courant(:'C'), 'reserves_admin_organisation',
  '2.16 son rôle payant n''est PAS rétrogradé par l''invitation');
select is((select source from public.acces_applications_entreprises where entreprise_id = :'C' and application_code = 'reserves'),
  'abonnement', '2.17 son abonnement n''est pas réécrit en accès gratuit');

-- Annuaire : C s'y publie ; les jokers de recherche ne balaient pas le registre publié.
select lives_ok($$select public.reserves_annuaire_publier('c7000000-0000-0000-0000-000000000001', true, 'Plomberie', 'Haut-Rhin')$$,
  '2.17b C se publie à l''annuaire ELSATIA');
select set_config('request.jwt.claim.sub', :'ADMIN_A', true);
select is((select count(*)::int from public.reserves_annuaire_rechercher(:'A', '%%%')), 0,
  '2.18 un terme composé de jokers ne rend pas l''annuaire publié');
select is((select nom from public.reserves_annuaire_rechercher(:'A', 'plomberie')), 'PLOMBERIE C SAS',
  '2.19 une vraie recherche trouve l''organisation publiée');

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. SCÉNARIO MÉTIER
-- ═════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claim.sub', :'EMETTEUR_A', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);

-- R1 : photo obligatoire, localisée sur le plan RDC, créée non assignée.
select set_config('q.r1', public.reserves_creer('e7100000-0000-0000-0000-000000000001',
  'Joint de dilatation fissuré', 'Fissure de 40 cm en pied de façade.', 'haute', null,
  current_setting('q.plan')::uuid, 0.25, 0.75, true, current_date + 15, null, 1)::text, true);
select is((select statut from public.reserves where id = current_setting('q.r1')::uuid), 'emise',
  '3.1 l''émetteur crée la réserve 1 (statut émise)');
select is((select array[position_x, position_y]::text from public.reserves where id = current_setting('q.r1')::uuid),
  '{0.25000,0.75000}', '3.2 la réserve est localisée sur le plan (coordonnées normalisées)');
select ok((select photo_obligatoire_levee from public.reserves where id = current_setting('q.r1')::uuid),
  '3.3 la photo est rendue obligatoire pour CETTE réserve');
select throws_like($$select public.reserves_creer('e7100000-0000-0000-0000-000000000001','Hors plan', null,'normale',null,
  current_setting('q.plan')::uuid, 1.5, 0.2, false, null, null, 1)$$, '%check%',
  '3.4 une position hors du plan est rejetée par la base');

-- Photo de constat (« avant ») par l'émetteur.
select set_config('q.p_avant', (select photo_id::text from public.reserves_ajouter_photo(current_setting('q.r1')::uuid,
  'constat', 'Avant travaux', 'image/jpeg', 1024, 'avant.jpg')), true);
select set_config('q.p_avant_path', (select storage_path from public.reserves_photos where id = current_setting('q.p_avant')::uuid), true);
select ok(current_setting('q.p_avant_path') like 'a0000000-0000-0000-0000-000000000001/e7100000-0000-0000-0000-000000000001/'
  || current_setting('q.r1') || '/%.jpg', '3.5 le chemin de la photo est composé par la base (tenant/chantier/réserve/opaque)');
select lives_ok($$insert into storage.objects (bucket_id, name, metadata)
  values ('reserves-photos', current_setting('q.p_avant_path'), '{"mimetype":"image/jpeg"}')$$,
  '3.6 l''émetteur dépose la photo avant');
select lives_ok($$select public.reserves_confirmer_photo(current_setting('q.p_avant')::uuid)$$, '3.7 et la confirme');

select lives_ok($$select public.reserves_commenter(current_setting('q.r1')::uuid, 'Constaté lors de la visite OPR.')$$,
  '3.8 commentaire de l''hôte');

-- Assignation à B + notification.
select lives_ok($$select public.reserves_assigner(current_setting('q.r1')::uuid, 'e7200000-0000-0000-0000-00000000000b')$$,
  '3.9 l''émetteur assigne la réserve 1 à B');
select is((select statut from public.reserves where id = current_setting('q.r1')::uuid), 'assignee', '3.10 statut assignée');
reset role;
select is((select count(*)::int from public.reserves_evenements_notifications
  where reserve_id = current_setting('q.r1')::uuid and type = 'reserve_assignee' and destinataire_entreprise_id = :'B'),
  1, '3.11 un événement « réserve attribuée » part vers B');
set local role authenticated;

select set_config('request.jwt.claim.sub', :'INTERV_B', true);
select set_config('request.jwt.claim.email', 'chef-equipe-b@invalid.local', true);
select is((select count(*)::int from public.reserves_notifications_in_app(50, false)
  where reserve_id = current_setting('q.r1')::uuid and type = 'reserve_assignee'),
  1, '3.12 Intervenant B voit la notification dans l''application');
select is((select titre from public.reserves where id = current_setting('q.r1')::uuid),
  'Joint de dilatation fissuré', '3.13 B lit la réserve qui lui est attribuée');
select is((select count(*)::int from public.reserves_photos_visibles(current_setting('q.r1')::uuid)), 1,
  '3.14 B voit la photo « avant » de l''hôte');
select lives_ok($$select public.reserves_commenter(current_setting('q.r1')::uuid, 'Bien reçu, intervention jeudi.')$$,
  '3.15 B commente');
select throws_like($$select public.reserves_repondre_responsabilite(current_setting('q.r1')::uuid, false, '  ')$$,
  '%motif est obligatoire%', '3.16 un refus sans justification est rejeté');
select lives_ok($$select public.reserves_repondre_responsabilite(current_setting('q.r1')::uuid, true)$$,
  '3.17 B accepte la réserve 1');
select is((select statut from public.reserves where id = current_setting('q.r1')::uuid), 'acceptee', '3.18 statut acceptée');

-- Travaux terminés → demande de levée : la photo est obligatoire.
select throws_like($$select public.reserves_demander_levee(current_setting('q.r1')::uuid, 'Travaux terminés')$$,
  '%Photo obligatoire%', '3.19 sans photo « après », la demande de levée est refusée');
select set_config('q.p_apres', (select photo_id::text from public.reserves_ajouter_photo(current_setting('q.r1')::uuid,
  'travaux', 'Après reprise', 'image/jpeg', 2048, 'apres.jpg')), true);
select throws_like($$select public.reserves_demander_levee(current_setting('q.r1')::uuid, 'Travaux terminés')$$,
  '%Photo obligatoire%', '3.20 une photo déclarée mais jamais déposée ne suffit pas');
select throws_like($$select public.reserves_confirmer_photo(current_setting('q.p_apres')::uuid)$$,
  '%Aucun fichier%', '3.21 confirmer une photo sans fichier est refusé');
select set_config('q.p_apres_path', (select storage_path from public.reserves_photos where id = current_setting('q.p_apres')::uuid), true);
select lives_ok($$insert into storage.objects (bucket_id, name, metadata)
  values ('reserves-photos', current_setting('q.p_apres_path'), '{"mimetype":"image/jpeg"}')$$,
  '3.22 B dépose la photo « après » dans le dossier de SA réserve');
select lives_ok($$select public.reserves_confirmer_photo(current_setting('q.p_apres')::uuid)$$, '3.23 et la confirme');
select is((select ajoutee_par_entreprise_id from public.reserves_photos where id = current_setting('q.p_apres')::uuid),
  :'B'::uuid, '3.24 la photo « après » est attribuée à l''entreprise B');
select lives_ok($$select public.reserves_demander_levee(current_setting('q.r1')::uuid, 'Travaux terminés')$$,
  '3.25 B demande la levée, preuve jointe');
reset role;
select is((select count(*)::int from public.reserves_evenements_notifications
  where reserve_id = current_setting('q.r1')::uuid and type = 'levee_demandee' and destinataire_entreprise_id = :'A'),
  1, '3.26 l''hôte A est notifié de la demande de levée');
set local role authenticated;

-- Refus de levée puis validation.
select set_config('request.jwt.claim.sub', :'EMETTEUR_A', true);
select throws_like($$select public.reserves_statuer_levee(current_setting('q.r1')::uuid, true)$$,
  '%non autorisée%', '3.27 l''émetteur ne peut PAS valider une levée');
select set_config('request.jwt.claim.sub', :'RESP_A', true);
select throws_like($$select public.reserves_statuer_levee(current_setting('q.r1')::uuid, false, '')$$,
  '%motif est obligatoire%', '3.28 refuser une levée exige un motif');
select lives_ok($$select public.reserves_statuer_levee(current_setting('q.r1')::uuid, false, 'Joint non lissé')$$,
  '3.29 le responsable refuse la levée avec motif');
select is((select statut from public.reserves where id = current_setting('q.r1')::uuid), 'levee_refusee', '3.30 statut levée refusée');
select ok((select verrouillee_at is not null from public.reserves_photos where id = current_setting('q.p_apres')::uuid),
  '3.31 la photo qui a accompagné la décision est verrouillée');

select set_config('request.jwt.claim.sub', :'INTERV_B', true);
select throws_like($$select public.reserves_supprimer_photo(current_setting('q.p_apres')::uuid, 'erreur')$$,
  '%verrouillée%', '3.32 B ne peut plus retirer une photo verrouillée');
select lives_ok($$select public.reserves_demander_levee(current_setting('q.r1')::uuid, 'Joint repris et lissé')$$,
  '3.33 B redemande la levée');
select set_config('request.jwt.claim.sub', :'RESP_A', true);
select lives_ok($$select public.reserves_statuer_levee(current_setting('q.r1')::uuid, true, 'Conforme')$$,
  '3.34 le responsable valide la levée');
select is((select statut from public.reserves where id = current_setting('q.r1')::uuid), 'levee', '3.35 réserve 1 levée');
select ok((select levee_at is not null and cloturee_at is not null from public.reserves where id = current_setting('q.r1')::uuid),
  '3.36 horodatages de levée et de clôture posés');

-- R2 : refus de responsabilité justifié puis réassignation à C.
select set_config('request.jwt.claim.sub', :'EMETTEUR_A', true);
select set_config('q.r2', public.reserves_creer('e7100000-0000-0000-0000-000000000001',
  'Fuite sous évier logement 12', null, 'normale', 'e7200000-0000-0000-0000-00000000000b',
  null, null, null, false, null, null, null)::text, true);
select set_config('request.jwt.claim.sub', :'INTERV_B', true);
select lives_ok($$select public.reserves_repondre_responsabilite(current_setting('q.r2')::uuid, false,
  'Hors de notre lot : relève de la plomberie')$$, '3.37 B refuse la réserve 2 avec justification');
select is((select commentaire from public.reserves_historique where reserve_id = current_setting('q.r2')::uuid
  and action = 'refus_responsabilite'), 'Hors de notre lot : relève de la plomberie', '3.38 la justification est historisée');
select set_config('request.jwt.claim.sub', :'RESP_A', true);
reset role;
select is((select count(*)::int from public.reserves_evenements_notifications where reserve_id = current_setting('q.r2')::uuid
  and type = 'responsabilite_refusee' and destinataire_entreprise_id = :'A'), 1, '3.39 l''hôte est notifié du refus');
set local role authenticated;
select lives_ok($$select public.reserves_assigner(current_setting('q.r2')::uuid, 'e7200000-0000-0000-0000-00000000000c')$$,
  '3.40 le responsable réassigne la réserve 2 à C');
reset role;
select is((select count(*)::int from public.reserves_evenements_notifications where reserve_id = current_setting('q.r2')::uuid
  and type = 'reserve_assignee' and destinataire_entreprise_id = :'C'), 1, '3.41 C est notifiée');
set local role authenticated;
select set_config('request.jwt.claim.sub', :'INTERV_B', true);
select is((select count(*)::int from public.reserves where id = current_setting('q.r2')::uuid), 0,
  '3.42 dès la réassignation, B ne lit plus la réserve 2');
select set_config('request.jwt.claim.sub', :'ADMIN_C', true);
select lives_ok($$select public.reserves_repondre_responsabilite(current_setting('q.r2')::uuid, true)$$, '3.43 C accepte');
select lives_ok($$select public.reserves_demander_levee(current_setting('q.r2')::uuid, 'Siphon remplacé')$$,
  '3.44 C demande la levée SANS photo : cette réserve ne l''exige pas');
select set_config('request.jwt.claim.sub', :'RESP_A', true);
select lives_ok($$select public.reserves_statuer_levee(current_setting('q.r2')::uuid, true)$$, '3.45 le responsable valide');

-- Historique de la réserve 1, dans l'ordre.
-- Une transaction pgTAP unique donne le même now() à toutes les lignes : on compare le
-- multiensemble des actions (l'ordre chronologique est vérifié par la recette e2e).
select is((select array_agg(action order by action) from public.reserves_historique
  where reserve_id = current_setting('q.r1')::uuid and action <> 'photo_ajoutee'),
  array['acceptation','assignation','commentaire','commentaire','creation','demande_levee',
        'demande_levee','levee_refusee','levee_validee'],
  '3.46 l''historique de la réserve 1 retrace tout le parcours (9 actions métier)');
select is((select count(*)::int from public.reserves_historique where reserve_id = current_setting('q.r1')::uuid
  and action = 'photo_ajoutee'), 2, '3.47 les deux photos (avant / après) sont historisées');
select is((select array_agg(distinct auteur_id::text order by auteur_id::text) from public.reserves_historique
  where reserve_id = current_setting('q.r1')::uuid),
  array[:'EMETTEUR_A', :'RESP_A', :'INTERV_B']::text[], '3.48 chaque ligne porte son véritable auteur');

-- R3 (non assignée) et R4 (assignée à C) : témoins pour le cloisonnement.
select set_config('request.jwt.claim.sub', :'EMETTEUR_A', true);
select set_config('q.r3', public.reserves_creer('e7100000-0000-0000-0000-000000000001', 'Réserve interne non attribuée',
  'Note interne confidentielle', 'basse', null, current_setting('q.plan2')::uuid, 0.5, 0.5, false, null, null, 1)::text, true);
select set_config('q.r4', public.reserves_creer('e7100000-0000-0000-0000-000000000001', 'Réserve de C',
  null, 'normale', 'e7200000-0000-0000-0000-00000000000c', current_setting('q.plan2')::uuid, 0.1, 0.1, false, null, null, 1)::text, true);
select set_config('q.p_r4', (select photo_id::text from public.reserves_ajouter_photo(current_setting('q.r4')::uuid,
  'constat', 'Photo R4', 'image/jpeg', 100, 'r4.jpg')), true);
select set_config('q.p_r4_path', (select storage_path from public.reserves_photos where id = current_setting('q.p_r4')::uuid), true);
insert into storage.objects (bucket_id, name, metadata) values ('reserves-photos', current_setting('q.p_r4_path'), '{"mimetype":"image/jpeg"}');
select public.reserves_confirmer_photo(current_setting('q.p_r4')::uuid);
select public.reserves_commenter(current_setting('q.r4')::uuid, 'Message réservé à C');
select public.reserves_commenter(current_setting('q.r3')::uuid, 'Message interne A');

-- R5 : témoin de photo obligatoire encore ouvert, assigné à B.
select set_config('q.r5', public.reserves_creer('e7100000-0000-0000-0000-000000000001', 'Plinthe décollée',
  null, 'basse', 'e7200000-0000-0000-0000-00000000000b', null, null, null, false, null, null, null)::text, true);

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. PHOTO OBLIGATOIRE : RÉSERVE PAR RÉSERVE, JAMAIS GLOBALEMENT
-- ═════════════════════════════════════════════════════════════════════════════
select hasnt_column('public', 'reserves_chantiers', 'photo_obligatoire_levee', '4.1 aucun réglage « photo obligatoire » au niveau chantier');
select is((select count(*)::int from information_schema.columns where table_schema = 'public'
  and column_name like '%photo_obligatoire%' and table_name <> 'reserves'), 0,
  '4.2 ni dans aucune autre table : la décision n''existe qu''au niveau de la réserve');
select is((select array_agg(photo_obligatoire_levee order by numero) from public.reserves
  where chantier_id = :'CH_A' and id in (current_setting('q.r1')::uuid, current_setting('q.r5')::uuid)),
  array[true,false], '4.3 deux réserves du même chantier et de la même entreprise portent deux exigences distinctes');
select set_config('request.jwt.claim.sub', :'INTERV_B', true);
select lives_ok($$select public.reserves_repondre_responsabilite(current_setting('q.r5')::uuid, true)$$, '4.4 B accepte la réserve 5');
select lives_ok($$select public.reserves_demander_levee(current_setting('q.r5')::uuid)$$,
  '4.5 et demande sa levée sans photo : elle ne l''exige pas');
with x as (update public.reserves set photo_obligatoire_levee = false
  where id = current_setting('q.r1')::uuid returning 1) select is(count(*)::int, 0, '4.6 l''intervenant ne peut pas désactiver lui-même l''exigence de photo') from x;
select set_config('request.jwt.claim.sub', :'EMETTEUR_A', true);
select set_config('q.r6', public.reserves_creer('e7100000-0000-0000-0000-000000000001', 'Carrelage fêlé',
  null, 'normale', 'e7200000-0000-0000-0000-00000000000b', null, null, null, false, null, null, null)::text, true);
select lives_ok($$update public.reserves set photo_obligatoire_levee = true where id = current_setting('q.r6')::uuid$$,
  '4.7 l''émetteur peut rendre la photo obligatoire après coup, sur cette seule réserve');
select set_config('request.jwt.claim.sub', :'INTERV_B', true);
select public.reserves_repondre_responsabilite(current_setting('q.r6')::uuid, true);
select throws_like($$select public.reserves_demander_levee(current_setting('q.r6')::uuid)$$, '%Photo obligatoire%',
  '4.8 et l''exigence s''applique aussitôt à cette réserve');
select set_config('q.p_r6', (select photo_id::text from public.reserves_ajouter_photo(current_setting('q.r6')::uuid,
  'constat', 'Mauvais usage', 'image/jpeg', 100, 'x.jpg')), true);
insert into storage.objects (bucket_id, name, metadata)
  values ('reserves-photos', (select storage_path from public.reserves_photos where id = current_setting('q.p_r6')::uuid), '{}');
select public.reserves_confirmer_photo(current_setting('q.p_r6')::uuid);
select throws_like($$select public.reserves_demander_levee(current_setting('q.r6')::uuid)$$, '%Photo obligatoire%',
  '4.9 une photo de CONSTAT ne vaut pas preuve de travaux');

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. CROSS-TENANT : B NE LIT NI NE MODIFIE RIEN DE CE QUI NE LUI EST PAS ASSIGNÉ
-- ═════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claim.sub', :'INTERV_B', true);
select is((select array_agg(titre order by numero) from public.reserves),
  array['Joint de dilatation fissuré','Plinthe décollée','Carrelage fêlé'],
  '5.1 B ne voit QUE ses réserves (ni R2 transférée, ni R3 interne, ni R4 de C)');
select is((select count(*)::int from public.reserves where id in (current_setting('q.r3')::uuid, current_setting('q.r4')::uuid)), 0,
  '5.2 même par identifiant exact');
select is((select count(*)::int from public.reserves_intervenants), 1, '5.3 B ne voit que sa propre ligne d''intervenant');
select is((select count(*)::int from public.reserves_plans), 1, '5.4 B ne voit que le plan porté par une de ses réserves');
select is((select count(*)::int from public.reserves_chantiers), 1, '5.5 B voit l''identité du seul chantier où il intervient');
select is((select count(*)::int from public.reserves_photos where reserve_id in (current_setting('q.r3')::uuid, current_setting('q.r4')::uuid)), 0,
  '5.6 aucune photo des réserves non assignées');
select is((select count(*)::int from public.reserves_historique where reserve_id in
  (current_setting('q.r2')::uuid, current_setting('q.r3')::uuid, current_setting('q.r4')::uuid)), 0,
  '5.7 aucun historique des réserves non assignées (y compris celle qui lui a été retirée)');
select is((select count(*)::int from public.reserves_messages m join public.reserves_conversations c on c.id = m.conversation_id
  where c.reserve_id in (current_setting('q.r3')::uuid, current_setting('q.r4')::uuid)), 0, '5.8 aucun message des autres');
select is((select count(*)::int from public.reserves_conversations_visibles(null)
  where reserve_id in (current_setting('q.r3')::uuid, current_setting('q.r4')::uuid)), 0, '5.9 ni via la RPC des conversations');
select is((select total::int from public.reserves_tableau_de_bord()), 3, '5.10 le tableau de bord compte exactement ses 3 réserves');
select is((select count(*)::int from public.reserves_reperes_plan(current_setting('q.plan2')::uuid, 1)), 0,
  '5.11 les repères d''un plan qui ne le concerne pas restent invisibles');
select throws_like($$select public.reserves_commenter(current_setting('q.r4')::uuid, 'intrusion')$$, '%non autorisé%', '5.12 commenter R4 : refusé');
select throws_like($$select public.reserves_repondre_responsabilite(current_setting('q.r4')::uuid, true)$$, '%non autorisée%', '5.13 accepter R4 : refusé');
select throws_like($$select public.reserves_demander_levee(current_setting('q.r3')::uuid)$$, '%non autorisée%', '5.14 demander la levée de R3 : refusé');
select throws_like($$select public.reserves_ajouter_photo(current_setting('q.r4')::uuid, 'travaux')$$, '%non autorisé%', '5.15 photo sur R4 : refusée');
select throws_like($$select public.reserves_confirmer_photo(current_setting('q.p_r4')::uuid)$$, '%non autorisée%', '5.16 confirmer la photo de R4 : refusé');
select throws_like($$select public.reserves_supprimer_photo(current_setting('q.p_r4')::uuid)$$, '%non autorisée%', '5.17 supprimer la photo de R4 : refusé');
with x as (update public.reserves set titre = 'piraté' where id in
  (current_setting('q.r1')::uuid, current_setting('q.r3')::uuid, current_setting('q.r4')::uuid) returning 1) select is(count(*)::int, 0, '5.18 aucune mise à jour directe, même de ses propres réserves') from x;
select throws_ok($$insert into public.reserves (entreprise_id, chantier_id, numero, titre)
  values ('a0000000-0000-0000-0000-000000000001','e7100000-0000-0000-0000-000000000001', 999, 'intrus')$$,
  '42501', null, '5.19 aucune insertion de réserve chez l''hôte');
select throws_ok($$delete from public.reserves where id = current_setting('q.r1')::uuid$$, '42501', null, '5.20 aucune suppression');
select is((select count(*)::int from public.reserves_export_chantier(:'CH_A'::uuid, :'I_C'::uuid)), 0,
  '5.21 l''export filtré sur l''autre entreprise ne rend rien à B');
select is((select count(*)::int from public.reserves_export_photos(:'CH_A'::uuid)), 3,
  '5.22 l''export photos de B se limite aux photos de SES réserves (R1 avant/après, R6)');
select is((select count(*)::int from public.reserves_export_intervenants(:'CH_A'::uuid)), 0,
  '5.23 la liste des entreprises du chantier n''est pas exposée à B');

-- Autres identités de B et de A.
select set_config('request.jwt.claim.sub', :'ADMIN_B', true);
select is((select count(*)::int from public.reserves), 0, '5.24 l''administrateur GP de B sans habilitation Réserves ne voit rien');
select throws_like($$select public.reserves_rejoindre_intervention('e7200000-0000-0000-0000-00000000000b')$$,
  '%Aucune invitation%', '5.25 et ne peut pas s''ajouter à une intervention déjà rejointe');
select set_config('request.jwt.claim.sub', :'MEMBRE_B', true);
select is((select count(*)::int from public.reserves), 0, '5.26 un autre membre de B ne voit rien');
select set_config('request.jwt.claim.sub', :'ADMIN_C', true);
select is((select array_agg(titre order by numero) from public.reserves where chantier_id = :'CH_A'),
  array['Fuite sous évier logement 12','Réserve de C'], '5.27 C ne voit chez A que ses deux réserves');
select set_config('request.jwt.claim.sub', :'GP_SEUL_A', true);
select is((select count(*)::int from public.reserves), 0,
  '5.28 un dirigeant GP de A sans rôle Réserves ne voit rien : aucun droit déduit de Gestion Pro');
select set_config('request.jwt.claim.sub', :'CONSULT_A', true);
select is((select count(*)::int from public.reserves where chantier_id = :'CH_A'), 6, '5.29 la consultation A voit tout le chantier');
select throws_like($$select public.reserves_creer('e7100000-0000-0000-0000-000000000001','x')$$, '%non autorisée%',
  '5.30 mais ne peut rien créer');
select set_config('request.jwt.claim.sub', :'PLATEFORME', true);
select is((select count(*)::int from public.reserves), 0, '5.31 l''admin plateforme ne lit rien sans session support ouverte');
-- Le rattachement d'une entreprise ne se réécrit pas par l'API de données (défaut V6).
select set_config('request.jwt.claim.sub', :'RESP_A', true);
select throws_like($$update public.reserves_intervenants set entreprise_intervenante_id = 'c7000000-0000-0000-0000-000000000001'
  where id = 'e7200000-0000-0000-0000-00000000000b'$$, '%Rattachement%interdit%',
  '5.32 l''hôte ne peut pas dessaisir B en réécrivant le porteur de l''intervention');
select throws_like($$update public.reserves_intervenants set statut = 'revoquee', revoque_at = now()
  where id = 'e7200000-0000-0000-0000-00000000000b'$$, '%Rattachement%interdit%',
  '5.33 ni révoquer B hors du geste métier tracé');
select throws_like($$insert into public.reserves_intervenants (entreprise_id, chantier_id, nom, entreprise_intervenante_id, statut, rejoint_at)
  values ('a0000000-0000-0000-0000-000000000001','e7100000-0000-0000-0000-000000000001','Rattachée d''office',
          'c7000000-0000-0000-0000-000000000001','active', now())$$, '%invitée%',
  '5.34 ni déclarer une intervention déjà « active » pour une organisation qui n''a rien accepté');
select lives_ok($$update public.reserves_intervenants set telephone_contact = '03 89 00 00 00'
  where id = 'e7200000-0000-0000-0000-00000000000b'$$, '5.35 les champs descriptifs restent modifiables par l''hôte');

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. INTERVENANT GRATUIT : COLLABORE, MAIS AUCUNE FONCTION PAYANTE
-- ═════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claim.sub', :'INTERV_B', true);
select is((select array_agg(a) from unnest(array['voir','exporter','creer_reserve','assigner','commenter','valider_levee',
  'gerer_chantier','gerer_plans','gerer_intervenants','gerer_parametres','inviter_entreprise','gerer_membres']) a
  where public.reserves_action_autorisee(:'B', a)), null, '6.1 aucune action de pilotage sur son propre tenant');
select throws_ok($$insert into public.reserves_chantiers (entreprise_id, nom) values ('b0000000-0000-0000-0000-000000000001','Mon chantier')$$,
  '42501', null, '6.2 B ne peut pas créer ses propres chantiers (fonction payante)');
select throws_ok($$insert into public.reserves_chantiers (entreprise_id, nom) values ('a0000000-0000-0000-0000-000000000001','Chez A')$$,
  '42501', null, '6.3 ni chez l''hôte');
select throws_like($$select public.reserves_ajouter_plan('e7100000-0000-0000-0000-000000000001','Plan pirate')$$, '%non autorisé%',
  '6.4 ni déposer de plan');
select throws_like($$select public.reserves_creer('e7100000-0000-0000-0000-000000000001','Réserve pirate')$$, '%non autorisée%',
  '6.5 ni émettre de réserve');
select throws_like($$select public.reserves_statuer_levee(current_setting('q.r5')::uuid, true)$$, '%non autorisée%',
  '6.6 ni valider sa propre levée');
select throws_like($$select public.reserves_annuler(current_setting('q.r5')::uuid, 'je préfère')$$, '%impossible%',
  '6.7 ni annuler une réserve');
select throws_like($$select public.reserves_assigner(current_setting('q.r6')::uuid, 'e7200000-0000-0000-0000-00000000000c')$$,
  '%impossible%', '6.8 ni se défausser sur une autre entreprise');
select throws_like($$select public.reserves_transferer_responsabilite(current_setting('q.r6')::uuid, 'e7200000-0000-0000-0000-00000000000c', 'x')$$,
  '%non autorisé%', '6.9 ni transférer');
select throws_like($$select public.reserves_attribuer_role('20000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'reserves_admin_organisation')$$,
  '%non autorisée%', '6.10 ni s''auto-promouvoir administrateur Réserves');
select throws_like($$select public.plateforme_habiliter_utilisateur_application('20000000-0000-0000-0000-000000000003',
  'b0000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation')$$, '%', '6.11 ni passer par la RPC plateforme');
select throws_ok($$update public.acces_applications_entreprises set source = 'abonnement'
  where entreprise_id = 'b0000000-0000-0000-0000-000000000001'$$, '42501', null, '6.12 ni transformer l''accès gratuit en abonnement');
select throws_ok($$update public.habilitations_applications_utilisateurs set role_code = 'reserves_admin_organisation'
  where utilisateur_id = '20000000-0000-0000-0000-000000000003'$$, '42501', null, '6.13 ni réécrire son habilitation');
select throws_like($$select public.reserves_inviter_intervenant('e7200000-0000-0000-0000-00000000000b',
  encode(extensions.digest('x','sha256'),'hex'), 'x@invalid.local')$$, '%non autorisée%', '6.14 ni inviter d''autres entreprises');
select throws_like($$select public.reserves_preferences_definir('a0000000-0000-0000-0000-000000000001', 'levee', false)$$,
  '%', '6.15 ni régler les paramètres de l''hôte');
select is((select count(*)::int from public.reserves_lister_membres(:'A')), 0, '6.16 ni lister les membres de l''hôte');
select ok(not public.a_acces_application(:'B', 'colors') and not public.a_acces_application(:'B', 'tools')
  and not public.a_acces_application(:'B', 'gestion_pro'), '6.17 l''invitation n''ouvre aucune autre application ELSATIA');
select is((select count(*)::int from public.reserves_export_chantier(:'CH_A'::uuid)), 3,
  '6.18 mais B exporte la liste de SES réserves (voir / suivre)');

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. HISTORIQUE IMMUABLE
-- ═════════════════════════════════════════════════════════════════════════════
select set_config('q.h_count', (select count(*)::text from public.reserves_historique where reserve_id = current_setting('q.r1')::uuid), true);
select throws_ok($$insert into public.reserves_historique (entreprise_id, reserve_id, action, auteur_id)
  values ('a0000000-0000-0000-0000-000000000001', current_setting('q.r1')::uuid, 'levee_validee', '10000000-0000-0000-0000-000000000004')$$,
  '42501', null, '7.1 l''intervenant ne peut pas insérer de fausse ligne d''historique');
select throws_ok($$update public.reserves_historique set commentaire = 'falsifié' where reserve_id = current_setting('q.r1')::uuid$$,
  '42501', null, '7.2 ni la modifier');
select throws_ok($$delete from public.reserves_historique where reserve_id = current_setting('q.r1')::uuid$$,
  '42501', null, '7.3 ni la supprimer');
select set_config('request.jwt.claim.sub', :'ADMIN_A', true);
select throws_ok($$insert into public.reserves_historique (entreprise_id, reserve_id, action)
  values ('a0000000-0000-0000-0000-000000000001', current_setting('q.r1')::uuid, 'commentaire')$$,
  '42501', null, '7.4 l''administrateur de l''hôte non plus ne peut insérer');
select throws_ok($$update public.reserves_historique set auteur_id = null where reserve_id = current_setting('q.r1')::uuid$$,
  '42501', null, '7.5 ni réécrire un auteur');
select throws_ok($$delete from public.reserves_historique where reserve_id = current_setting('q.r1')::uuid$$,
  '42501', null, '7.6 ni effacer');
select throws_ok($$truncate public.reserves_historique$$, '42501', null, '7.7 ni vider la table');
select throws_ok($$delete from public.reserves where id = current_setting('q.r1')::uuid$$, '42501', null,
  '7.8 ni supprimer la réserve pour emporter son historique en cascade');
select throws_ok($$delete from public.reserves_chantiers where id = 'e7100000-0000-0000-0000-000000000001'$$, '42501', null,
  '7.9 ni supprimer le chantier');
select throws_like($$update public.reserves set statut = 'assignee' where id = current_setting('q.r1')::uuid$$,
  '%Transition de réserve interdite%', '7.10 aucune transition d''état hors action métier (donc hors historique)');
select throws_like($$update public.reserves set levee_at = null where id = current_setting('q.r1')::uuid$$,
  '%Transition de réserve interdite%', '7.11 ni effacement d''horodatage de workflow');
-- Contournement du drapeau transactionnel : un client SQL qui pose lui-même le drapeau
-- des RPC ne doit pas pouvoir franchir un état sans laisser de trace.
select throws_like($$select set_config('elsatia.reserves_transition', 'on', true);
  update public.reserves set statut = 'assignee', levee_at = null where id = current_setting('q.r1')::uuid$$,
  '%Transition de réserve interdite%', '7.12 poser soi-même le drapeau des RPC ne contourne pas la garde');
select set_config('elsatia.reserves_transition', 'off', true);
select throws_ok($$update public.reserves_transitions set commentaire_obligatoire = false$$, '42501', null,
  '7.13 la matrice des transitions n''est pas modifiable');
select throws_ok($$insert into public.reserves_evenements_notifications (entreprise_id, type, destinataire_entreprise_id)
  values ('a0000000-0000-0000-0000-000000000001', 'levee_validee', 'b0000000-0000-0000-0000-000000000001')$$,
  '42501', null, '7.14 aucune fausse notification');
select throws_ok($$update public.reserves_messages set contenu = 'réécrit'$$, '42501', null, '7.15 aucun message réécrit');
select throws_ok($$update public.reserves_photos set usage = 'travaux' where id = current_setting('q.p_avant')::uuid$$,
  '42501', null, '7.16 une photo de constat ne devient pas une preuve de travaux');
select is((select count(*)::text from public.reserves_historique where reserve_id = current_setting('q.r1')::uuid),
  current_setting('q.h_count'), '7.17 après toutes ces tentatives, l''historique est intact');
select is((select statut from public.reserves where id = current_setting('q.r1')::uuid), 'levee', '7.18 et l''état aussi');
select lives_ok($$select public.reserves_rouvrir(current_setting('q.r1')::uuid, 'Fissure réapparue')$$,
  '7.19 une réouverture légitime passe, avec motif');
select is((select count(*)::text from public.reserves_historique where reserve_id = current_setting('q.r1')::uuid),
  (current_setting('q.h_count')::int + 1)::text, '7.20 et s''AJOUTE à l''historique (une ligne de plus, rien d''effacé)');
select is((select count(*)::int from public.reserves_historique where reserve_id = current_setting('q.r1')::uuid
  and action = 'levee_validee'), 1, '7.21 la levée validée précédente reste lisible');

-- ═════════════════════════════════════════════════════════════════════════════
-- 8. STORAGE : PHOTOS AVANT/APRÈS, PROPRIÉTÉ, CROSS-TENANT
-- ═════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claim.sub', :'INTERV_B', true);
select is((select count(*)::int from storage.objects where bucket_id = 'reserves-photos'
  and name in (current_setting('q.p_avant_path'), current_setting('q.p_apres_path'))), 2,
  '8.1 B lit les objets avant ET après de sa réserve (préalable à toute URL signée)');
select is((select count(*)::int from storage.objects where bucket_id = 'reserves-photos' and name = current_setting('q.p_r4_path')), 0,
  '8.2 B ne lit pas l''objet photo d''une réserve de C');
select is((select count(*)::int from storage.objects where bucket_id = 'reserves-plans'), 1,
  '8.3 B ne lit que le plan porté par ses réserves');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('reserves-photos',
  'a0000000-0000-0000-0000-000000000001/e7100000-0000-0000-0000-000000000001/' || current_setting('q.r4') || '/intrus.jpg')$$,
  '42501', null, '8.4 B ne dépose rien dans le dossier d''une réserve qui n''est pas la sienne');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('reserves-photos',
  'b0000000-0000-0000-0000-000000000001/e7100000-0000-0000-0000-000000000001/' || current_setting('q.r5') || '/intrus.jpg')$$,
  '42501', null, '8.5 ni sous un préfixe de tenant forgé');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('reserves-plans',
  'a0000000-0000-0000-0000-000000000001/e7100000-0000-0000-0000-000000000001/' || current_setting('q.plan') || '/pirate.pdf')$$,
  '42501', null, '8.6 ni dans le bucket des plans');
with x as (delete from storage.objects where bucket_id = 'reserves-photos' returning 1) select is(count(*)::int, 0, '8.7 B ne supprime aucune photo') from x;
select set_config('request.jwt.claim.sub', :'ADMIN_A', true);
with x as (delete from storage.objects where bucket_id = 'reserves-photos'
  and name = current_setting('q.p_apres_path') returning 1) select is(count(*)::int, 0, '8.8 l''hôte non plus : une preuve n''est jamais supprimée') from x;
-- Le train retire UPDATE sur storage.objects aux rôles d'API (20260828000247) ; la policy
-- restrictive `reserves_photos_jamais_reecrites` couvre le jour où ce GRANT reviendrait.
select throws_ok($$update storage.objects set metadata = '{}' where bucket_id = 'reserves-photos'
  and name = current_setting('q.p_avant_path')$$, '42501', null, '8.9 ni réécrite');
select set_config('request.jwt.claim.sub', :'ADMIN_C', true);
select is((select count(*)::int from storage.objects where bucket_id = 'reserves-photos'
  and name in (current_setting('q.p_avant_path'), current_setting('q.p_apres_path'))), 0,
  '8.10 C ne lit pas les photos des réserves de B');
select is((select count(*)::int from storage.objects where bucket_id = 'reserves-photos' and name = current_setting('q.p_r4_path')), 1,
  '8.11 mais lit celles de sa réserve');
select set_config('request.jwt.claim.sub', '', true);
reset role;
set local role anon;
-- 20260714000078 retire tout droit anonyme sur storage.objects : refus franc.
select throws_ok($$select 1 from storage.objects where bucket_id like 'reserves-%'$$, '42501', null, '8.12 anonyme : aucun objet');
reset role;
select ok((select not public from storage.buckets where id = 'reserves-photos')
  and (select not public from storage.buckets where id = 'reserves-plans'),
  '8.13 les deux buckets sont privés : lecture uniquement par URL signée');
set local role authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 9. EXPORT PDF : LISTE DES RÉSERVES PAR ENTREPRISE
-- ═════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claim.sub', :'RESP_A', true);
select is((select array_agg(numero order by numero) from public.reserves_export_chantier(:'CH_A'::uuid, :'I_B'::uuid)),
  (select array_agg(numero order by numero) from public.reserves where intervenant_id = :'I_B'),
  '9.1 l''hôte exporte la liste des réserves de B, et seulement elles');
select is((select array_agg(titre order by numero) from public.reserves_export_chantier(:'CH_A'::uuid, :'I_C'::uuid)),
  array['Fuite sous évier logement 12','Réserve de C'], '9.2 puis celle de C');
select is((select count(*)::int from public.reserves_export_chantier(:'CH_A'::uuid, :'I_B'::uuid, null, null, null, false)), 3,
  '9.3 le filtre « sans les levées » retire les réserves closes');
select is((select nb_photos::int from public.reserves_export_chantier(:'CH_A'::uuid, :'I_B'::uuid) where id = current_setting('q.r1')::uuid), 2,
  '9.4 le nombre de photos (avant/après) figure dans l''export');
select is((select array_agg(nom order by nom) from public.reserves_export_intervenants(:'CH_A'::uuid)),
  array['Plomberie C','Étanchéité B'], '9.5 l''hôte obtient le récapitulatif par entreprise');
select is((select total::int from public.reserves_export_entete(:'CH_A'::uuid)), 6, '9.6 l''en-tête hôte compte les 6 réserves');
select set_config('request.jwt.claim.sub', :'INTERV_B', true);
select is((select total::int from public.reserves_export_entete(:'CH_A'::uuid)), 3,
  '9.7 l''en-tête du PDF de B ne compte QUE ses réserves (pas les compteurs de l''hôte)');
select is((select count(*)::int from public.reserves_export_historique(:'CH_A'::uuid)
  where reserve_id not in (current_setting('q.r1')::uuid, current_setting('q.r5')::uuid, current_setting('q.r6')::uuid)), 0,
  '9.8 l''historique exporté par B se limite à ses réserves');
select set_config('request.jwt.claim.sub', :'ADMIN_C', true);
select is((select count(*)::int from public.reserves_export_chantier(:'CH_A'::uuid, :'I_B'::uuid)), 0,
  '9.9 C ne peut pas exporter la liste de B');

-- ═════════════════════════════════════════════════════════════════════════════
-- 10. INTÉGRATION GESTION PRO
-- ═════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claim.sub', :'RESP_A', true);
select set_config('q.ch_gp', public.reserves_importer_chantier_gp('a4000000-0000-0000-0000-000000000001')::text, true);
select is((select array[source, nom, chantier_gp_id::text] from public.reserves_chantiers where id = current_setting('q.ch_gp')::uuid),
  array['gestion_pro','TEST_A_Chantier assigné','a4000000-0000-0000-0000-000000000001'],
  '10.1 un chantier GP est importé avec son lien et son nom');
select is((select array[adresse, code_postal, ville] from public.reserves_chantiers where id = current_setting('q.ch_gp')::uuid),
  array['12 rue des Tanneurs','68000','Colmar'], '10.2 les métadonnées d''adresse suivent');
select is(public.reserves_importer_chantier_gp('a4000000-0000-0000-0000-000000000001')::text, current_setting('q.ch_gp'),
  '10.3 réimporter resynchronise sans créer de doublon');
select set_config('request.jwt.claim.sub', :'EMETTEUR_A', true);
select throws_like($$select public.reserves_importer_chantier_gp('a4000000-0000-0000-0000-000000000001')$$,
  '%côté Réserves%', '10.4 import refusé sans droit de gestion de chantier Réserves');
select set_config('request.jwt.claim.sub', :'RESP_SANS_GP', true);
select throws_like($$select public.reserves_importer_chantier_gp('a4000000-0000-0000-0000-000000000001')$$,
  '%côté Gestion Pro%', '10.5 et sans permission GP : aucun droit déduit d''une application vers l''autre');
select set_config('request.jwt.claim.sub', :'ADMIN_C', true);
select throws_like($$select public.reserves_importer_chantier_gp('a4000000-0000-0000-0000-000000000001')$$,
  '%non autorisé%', '10.6 un autre tenant ne peut pas importer le chantier GP de A');
select set_config('request.jwt.claim.sub', :'EMETTEUR_A', true);
select set_config('q.r_gp', public.reserves_creer(current_setting('q.ch_gp')::uuid, 'Réserve sur chantier GP', null,
  'normale', null, null, null, null, false, current_date - 1, null, null)::text, true);
select set_config('request.jwt.claim.sub', :'RESP_A', true);
select is((select array[total, ouvertes, en_retard]::int[] from public.reserves_resume_chantier_gp('a4000000-0000-0000-0000-000000000001')),
  array[1,1,1], '10.7 résumé pour la fiche GP : total, ouvertes, en retard');
select is((select chantier_reserves_id::text from public.reserves_resume_chantier_gp('a4000000-0000-0000-0000-000000000001')),
  current_setting('q.ch_gp'), '10.8 le résumé porte le lien vers le chantier Réserves');
select set_config('request.jwt.claim.sub', :'GP_SEUL_A', true);
select is((select count(*)::int from public.reserves_resume_chantier_gp('a4000000-0000-0000-0000-000000000001')), 0,
  '10.9 un utilisateur GP sans rôle Réserves n''obtient pas le résumé');
select set_config('request.jwt.claim.sub', :'INTERV_B', true);
select is((select count(*)::int from public.reserves_resume_chantier_gp('a4000000-0000-0000-0000-000000000001')), 0,
  '10.10 B non plus');
select is((select count(*)::int from public.chantiers where entreprise_id = :'A'), 0, '10.11 et B ne lit aucun chantier Gestion Pro de A');
select is((select count(*)::int from public.clients where entreprise_id = :'A'), 0, '10.12 ni ses clients');

-- ═════════════════════════════════════════════════════════════════════════════
-- 11. SUSPENSION / RÉVOCATION SANS RECONNEXION (claims inchangés)
-- ═════════════════════════════════════════════════════════════════════════════
-- 11.a Hôte A suspendu pour impayé.
reset role;
select set_config('request.jwt.claim.sub', '', true);
update public.entreprises set abonnement_statut = 'suspendu' where id = :'A';
set local role authenticated;
select set_config('request.jwt.claim.sub', :'RESP_A', true);
select is((select count(*)::int from public.reserves), 0, '11.1 A suspendue : le responsable ne lit plus rien, même session');
select throws_like($$select public.reserves_creer('e7100000-0000-0000-0000-000000000001','x')$$, '%non autorisée%',
  '11.2 ni ne crée');
select set_config('request.jwt.claim.sub', :'INTERV_B', true);
select is((select count(*)::int from public.reserves), 0,
  '11.3 et l''accès GRATUIT que A offrait à B tombe avec la suspension de A');
select throws_like($$select public.reserves_commenter(current_setting('q.r6')::uuid, 'pendant la suspension')$$,
  '%non autorisé%', '11.4 B ne peut plus agir sur les réserves de A suspendue');
select set_config('request.jwt.claim.sub', :'ADMIN_C', true);
select is((select count(*)::int from public.reserves where chantier_id = :'CH_C'), 0,
  '11.5 (C n''a pas encore de réserve propre)');
select ok(public.reserves_action_autorisee(:'C', 'gerer_chantier'), '11.6 C, cliente payante, garde son propre espace');
reset role;
select set_config('request.jwt.claim.sub', '', true);
update public.entreprises set abonnement_statut = 'actif' where id = :'A';
set local role authenticated;
select set_config('request.jwt.claim.sub', :'INTERV_B', true);
select is((select count(*)::int from public.reserves), 3, '11.7 A réactivée : B retrouve ses réserves sans reconnexion');

-- 11.b Suspension programmée échue, et A ne peut pas l'annuler elle-même.
reset role;
select set_config('request.jwt.claim.sub', '', true);
update public.entreprises set suspension_prevue_at = now() - interval '1 minute' where id = :'A';
set local role authenticated;
select set_config('request.jwt.claim.sub', :'ADMIN_A', true);
select ok(public.reserves_role_courant(:'A') is null, '11.8 suspension programmée échue : plus de rôle');
reset role;
select set_config('request.jwt.claim.sub', '', true);
update public.entreprises set suspension_prevue_at = now() + interval '3 days' where id = :'A';
set local role authenticated;
select set_config('request.jwt.claim.sub', :'ADMIN_A', true);
select throws_ok($$update public.entreprises set suspension_prevue_at = null where id = 'a0000000-0000-0000-0000-000000000001'$$,
  null, null, '11.9 A ne peut pas annuler sa propre suspension programmée');
reset role;
select set_config('request.jwt.claim.sub', '', true);
update public.entreprises set suspension_prevue_at = null where id = :'A';
set local role authenticated;

-- 11.c Entitlement Réserves de A retiré.
reset role;
update public.acces_applications_entreprises set autorise = false where entreprise_id = :'A' and application_code = 'reserves';
set local role authenticated;
select set_config('request.jwt.claim.sub', :'RESP_A', true);
select is((select count(*)::int from public.reserves), 0, '11.10 accès Réserves de A retiré : plus rien pour A');
select set_config('request.jwt.claim.sub', :'INTERV_B', true);
select is((select count(*)::int from public.reserves), 0, '11.11 ni pour B chez A');
reset role;
update public.acces_applications_entreprises set autorise = true where entreprise_id = :'A' and application_code = 'reserves';
set local role authenticated;

-- 11.d Habilitation individuelle de l'intervenant retirée / échue.
reset role;
update public.habilitations_applications_utilisateurs set autorise = false
where utilisateur_id = :'INTERV_B' and application_code = 'reserves';
set local role authenticated;
select set_config('request.jwt.claim.sub', :'INTERV_B', true);
select is((select count(*)::int from public.reserves), 0, '11.12 habilitation de l''intervenant retirée : plus rien');
reset role;
update public.habilitations_applications_utilisateurs set autorise = true, valide_jusqu_au = now() - interval '1 second'
where utilisateur_id = :'INTERV_B' and application_code = 'reserves';
set local role authenticated;
select is((select count(*)::int from public.reserves), 0, '11.13 habilitation échue : plus rien');
reset role;
update public.habilitations_applications_utilisateurs set valide_jusqu_au = null
where utilisateur_id = :'INTERV_B' and application_code = 'reserves';
set local role authenticated;

-- 11.e Appartenance à B désactivée ; B suspendue.
reset role;
update public.utilisateurs_entreprises set statut = 'desactive' where utilisateur_id = :'INTERV_B' and entreprise_id = :'B';
set local role authenticated;
select is((select count(*)::int from public.reserves), 0, '11.14 membre désactivé dans B : plus rien');
reset role;
update public.utilisateurs_entreprises set statut = 'actif' where utilisateur_id = :'INTERV_B' and entreprise_id = :'B';
select set_config('request.jwt.claim.sub', '', true);
update public.entreprises set abonnement_statut = 'suspendu' where id = :'B';
set local role authenticated;
select set_config('request.jwt.claim.sub', :'INTERV_B', true);
select is((select count(*)::int from public.reserves), 0, '11.15 B suspendue : plus rien');
reset role;
select set_config('request.jwt.claim.sub', '', true);
update public.entreprises set abonnement_statut = 'actif' where id = :'B';
set local role authenticated;
select set_config('request.jwt.claim.sub', :'INTERV_B', true);
select is((select count(*)::int from public.reserves), 3, '11.16 tout rétabli : B retrouve ses 3 réserves, même session');

-- 11.f Application Réserves désactivée globalement.
reset role;
update public.applications_elsatia set actif = false where code = 'reserves';
set local role authenticated;
select is((select count(*)::int from public.reserves), 0, '11.17 application désactivée : B ne lit plus rien');
select set_config('request.jwt.claim.sub', :'RESP_A', true);
select is((select count(*)::int from public.reserves), 0, '11.18 A non plus');
reset role;
update public.applications_elsatia set actif = true where code = 'reserves';
set local role authenticated;

-- 11.g Révocation de l'entreprise B par l'hôte.
select set_config('request.jwt.claim.sub', :'RESP_A', true);
select is((select acces_retire from public.reserves_revoquer_intervenant(:'I_B'::uuid, 'Fin de lot')), true,
  '11.19 révoquer B retire son accès gratuit (plus aucune intervention active)');
select set_config('request.jwt.claim.sub', :'INTERV_B', true);
select is((select count(*)::int from public.reserves), 0, '11.20 B révoquée : plus aucune réserve visible, même session');
select ok(not public.a_acces_application(:'B', 'reserves'), '11.21 et plus d''accès applicatif');
select is((select count(*)::int from storage.objects where bucket_id = 'reserves-photos'), 0, '11.22 ni aucun objet Storage');
select set_config('request.jwt.claim.sub', :'RESP_A', true);
select is((select count(*)::int from public.reserves_historique where reserve_id = current_setting('q.r1')::uuid
  and auteur_id = :'INTERV_B'), (select count(*)::int from public.reserves_historique where reserve_id = current_setting('q.r1')::uuid
  and auteur_entreprise_id = :'B'), '11.23 l''historique signé par B reste intact chez l''hôte, et chaque geste de B est attribué à l''organisation B');
select ok((select count(*) from public.reserves_historique where auteur_id = :'INTERV_B') > 0, '11.24 (et non vide)');
select lives_ok($$select public.reserves_reactiver_intervenant('e7200000-0000-0000-0000-00000000000b')$$,
  '11.25 l''hôte réactive B');
select set_config('request.jwt.claim.sub', :'INTERV_B', true);
select is((select count(*)::int from public.reserves), 3, '11.26 B retrouve ses réserves sans reconnexion');

-- 11.h Révoquer C (cliente payante) ne touche pas à son abonnement.
select set_config('request.jwt.claim.sub', :'RESP_A', true);
select is((select acces_retire from public.reserves_revoquer_intervenant(:'I_C'::uuid)), false,
  '11.27 révoquer C chez A ne retire pas son abonnement');
select set_config('request.jwt.claim.sub', :'ADMIN_C', true);
select ok(public.a_acces_application(:'C', 'reserves'), '11.28 C garde Réserves pour ses propres chantiers');
select is((select count(*)::int from public.reserves where chantier_id = :'CH_A'), 0, '11.29 mais ne voit plus les réserves de A');

-- ═════════════════════════════════════════════════════════════════════════════
-- 12. AUTONOMIE : C UTILISE RÉSERVES SEULE, SANS GESTION PRO
-- ═════════════════════════════════════════════════════════════════════════════
select ok(not public.a_permission(:'C', 'acces_chantiers'), '12.1 C n''a aucune permission Gestion Pro');
select lives_ok($$insert into public.reserves_chantiers (id, entreprise_id, nom)
  values ('e7100000-0000-0000-0000-00000000000c','c7000000-0000-0000-0000-000000000001','QUALIF_C_Maison individuelle')$$,
  '12.2 C crée son propre chantier Réserves');
select lives_ok($$insert into public.reserves_intervenants (id, entreprise_id, chantier_id, nom)
  values ('e7200000-0000-0000-0000-0000000000cc','c7000000-0000-0000-0000-000000000001','e7100000-0000-0000-0000-00000000000c','Menuiserie hors ELSATIA')$$,
  '12.3 déclare une entreprise qui n''a pas de compte ELSATIA');
select set_config('q.rc', public.reserves_creer('e7100000-0000-0000-0000-00000000000c', 'Porte qui frotte', null, 'normale',
  'e7200000-0000-0000-0000-0000000000cc', null, null, null, true, null, null, null)::text, true);
select is((select statut from public.reserves where id = current_setting('q.rc')::uuid), 'assignee', '12.4 émet et assigne une réserve');
select is((select numero from public.reserves where id = current_setting('q.rc')::uuid), 1, '12.5 numérotée à partir de 1 dans SON chantier');
select is((select count(*)::int from public.reserves_export_chantier(:'CH_C'::uuid)), 1, '12.6 et l''exporte');
select set_config('request.jwt.claim.sub', :'RESP_A', true);
select is((select count(*)::int from public.reserves where chantier_id = :'CH_C'), 0, '12.7 A ne voit rien des chantiers de C');
select set_config('request.jwt.claim.sub', :'INTERV_B', true);
select is((select count(*)::int from public.reserves where chantier_id = :'CH_C'), 0, '12.8 B non plus');

-- ═════════════════════════════════════════════════════════════════════════════
-- 13. NOTIFICATIONS : FILE → ENVOIS, DESTINATAIRES HABILITÉS SEULEMENT
-- ═════════════════════════════════════════════════════════════════════════════
reset role;
select ok(public.reserves_notifications_preparer(2000) > 0, '13.1 le job prépare les envois de la file');
select ok(exists (select 1 from public.reserves_notifications_envois e join public.reserves_evenements_notifications ev on ev.id = e.evenement_id
  where ev.reserve_id = current_setting('q.r1')::uuid and ev.type = 'reserve_assignee'
    and e.destinataire_utilisateur_id = :'INTERV_B'), '13.2 Intervenant B reçoit l''e-mail d''attribution');
select ok(not exists (select 1 from public.reserves_notifications_envois where destinataire_utilisateur_id in (:'ADMIN_B', :'MEMBRE_B')),
  '13.3 les membres de B sans habilitation Réserves ne reçoivent rien');
select ok(not exists (select 1 from public.reserves_notifications_envois e join public.reserves_evenements_notifications ev on ev.id = e.evenement_id
  where ev.reserve_id in (current_setting('q.r3')::uuid, current_setting('q.r4')::uuid) and e.destinataire_utilisateur_id = :'INTERV_B'),
  '13.4 aucun e-mail à B sur les réserves des autres');
select is(public.reserves_notifications_preparer(2000), 0, '13.5 rejouer le job n''envoie rien deux fois');

select * from finish();
rollback;
