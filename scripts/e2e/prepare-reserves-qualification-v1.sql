-- Décor de la recette navigateur ELSATIA-RESERVES-FULL-LOCAL-QUALIFICATION-V1.
--
-- Prolonge le décor V3/V4/V6 (`recette-reserves-v4.sh` + `prepare-reserves-v6-securite.sql`)
-- avec ce que la qualification exige et qu'aucun décor antérieur ne porte :
--
--   • une organisation intervenante SANS AUCUN accès Réserves (« Carrelage Libre ») : c'est
--     le compte GRATUIT limité, dont l'accès ne naîtra que de l'invitation ;
--   • un chantier dédié de l'hôte A, avec deux intervenants : Carrelage Libre (qui
--     rejoindra) et « Plâtrerie Tierce » (jamais rattachée) ;
--   • l'émetteur A (ouvrier-a) habilité `reserves_emetteur`.
--
-- Rejouable : remet le chantier dédié et l'organisation libre à l'état initial.
-- Strictement local : identités en @invalid.local, mot de passe « test ».

begin;

-- ── Remise à zéro du chantier dédié (rejouable) ─────────────────────────────
-- Les réserves ne se suppriment pas depuis l'API ; la recette, elle, repart de zéro.
set local session_replication_role = replica;
delete from public.reserves_evenements_notifications where chantier_id = 'e8100000-0000-0000-0000-000000000001';
delete from public.reserves_historique where reserve_id in (select id from public.reserves where chantier_id = 'e8100000-0000-0000-0000-000000000001');
delete from public.reserves_photos where reserve_id in (select id from public.reserves where chantier_id = 'e8100000-0000-0000-0000-000000000001');
delete from public.reserves where chantier_id = 'e8100000-0000-0000-0000-000000000001';
delete from public.reserves_invitations where chantier_id = 'e8100000-0000-0000-0000-000000000001';
delete from public.reserves_intervenants where chantier_id = 'e8100000-0000-0000-0000-000000000001';
delete from public.reserves_chantiers where id = 'e8100000-0000-0000-0000-000000000001';
-- Chantier Réserves repris du chantier GP de test (test 13), pour rejouer la reprise.
delete from public.reserves_chantiers where chantier_gp_id = 'a4000000-0000-0000-0000-000000000001';
delete from public.acces_applications_entreprises where entreprise_id = 'c8000000-0000-0000-0000-000000000001';
delete from public.habilitations_applications_utilisateurs where entreprise_id = 'c8000000-0000-0000-0000-000000000001';
set local session_replication_role = origin;

-- ── Organisation intervenante sans accès : « Carrelage Libre » ───────────────
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000', 'c8000000-0000-0000-0000-0000000000a1',
  'authenticated', 'authenticated', 'intervenant-libre@invalid.local',
  crypt('test', gen_salt('bf')), now(), now(), now()
) on conflict (id) do nothing;

insert into public.utilisateurs (id, prenom, nom)
values ('c8000000-0000-0000-0000-0000000000a1', 'Inès', 'Carreleuse') on conflict (id) do nothing;

insert into public.entreprises (id, nom, raison_sociale, siret, ville, code_adhesion, abonnement_statut)
values ('c8000000-0000-0000-0000-000000000001', 'QUALIF_Carrelage Libre', 'CARRELAGE LIBRE SARL',
        '88888888800088', 'Sélestat', 'QUALC001', 'actif')
on conflict (id) do update set abonnement_statut = 'actif', suspension_prevue_at = null;

insert into public.postes (id, entreprise_id, nom)
values ('c8100000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', 'Gérante')
on conflict (id) do nothing;

insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
values ('c8000000-0000-0000-0000-0000000000a1', 'c8000000-0000-0000-0000-000000000001',
        'c8100000-0000-0000-0000-000000000001', 'actif')
on conflict do nothing;
update public.utilisateurs_entreprises set statut = 'actif'
where utilisateur_id = 'c8000000-0000-0000-0000-0000000000a1';

update public.utilisateurs set entreprise_active_id = 'c8000000-0000-0000-0000-000000000001'
where id = 'c8000000-0000-0000-0000-0000000000a1';

-- ── Hôte A : état nominal, trois rôles Réserves ──────────────────────────────
update public.entreprises set abonnement_statut = 'actif', suspension_prevue_at = null
where id = 'a0000000-0000-0000-0000-000000000001';
update public.acces_applications_entreprises set autorise = true, valide_jusqu_au = null
where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'reserves';
update public.applications_elsatia set actif = true where code = 'reserves';

insert into public.habilitations_applications_utilisateurs (
  entreprise_id, utilisateur_id, application_code, role_code, autorise
) values
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','reserves','reserves_responsable', true),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','reserves','reserves_emetteur', true)
on conflict (entreprise_id, utilisateur_id, application_code)
  do update set role_code = excluded.role_code, autorise = true, valide_jusqu_au = null;

-- ── Chantier dédié et ses deux intervenants ─────────────────────────────────
insert into public.reserves_chantiers (id, entreprise_id, nom, reference, adresse, code_postal, ville, created_by)
values ('e8100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
        'QUALIF_Résidence Les Tilleuls', 'TIL-2026', '4 allée des Tilleuls', '67600', 'Sélestat',
        '10000000-0000-0000-0000-000000000004');

insert into public.reserves_intervenants (id, entreprise_id, chantier_id, nom, corps_etat, email_contact, created_by) values
  ('e8200000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'e8100000-0000-0000-0000-000000000001', 'Carrelage Libre', 'Carrelage', 'intervenant-libre@invalid.local',
   '10000000-0000-0000-0000-000000000004'),
  ('e8200000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
   'e8100000-0000-0000-0000-000000000001', 'Plâtrerie Tierce', 'Plâtrerie', null,
   '10000000-0000-0000-0000-000000000004');

commit;
