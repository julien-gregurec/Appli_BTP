-- ELSATIA PERFORMANCE HARDENING V9.1 — P1-C : contre-épreuves de sécurité de la RLS
-- « ensemble d'entreprises autorisées » (migration 20261003001503, ex-20261003000301 du lot perf).
--
-- GÉNÉRÉ par scripts/perf/hardening/rls/generer_test_equivalence.py — ne pas éditer à la main.
--
-- Pour 17 contextes (tenant A, tenant B, rôles restreints, multi-entreprise, support actif /
-- expiré, plateforme sans accès, entreprise suspendue, essai expiré, suspension globale,
-- suspension future, membre en pause, session révoquée, anonyme) et une entreprise C SANS
-- membre :
--   E1  chaque prédicat USING / WITH CHECK des 65 policies réécrites est évalué ligne à ligne
--       contre l'expression V9.1 d'origine (embarquée ci-dessous) : 0 écart exigé ;
--   E2  les lignes réellement visibles sous RLS (rôle authenticated) dans les 13 tables sont
--       IDENTIQUES avant (policies V9.1 restaurées dans la transaction) et après ;
--   E3  témoins non vides : le différentiel n'est pas vacuitaire ;
--   E4  écritures inter-tenant refusées.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(54);

\ir fixtures/isolation_multitenant.inc

-- ── Contextes supplémentaires ──────────────────────────────────────────────────────────
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u::uuid, 'authenticated', 'authenticated', e, 'x', now(), now(), now()
from (values ('40000000-0000-0000-0000-000000000001', 'multi@invalid.local'),
             ('30000000-0000-0000-0000-000000000002', 'support@invalid.local'),
             ('30000000-0000-0000-0000-000000000003', 'support-expire@invalid.local'),
             ('50000000-0000-0000-0000-000000000001', 'membre-d@invalid.local'),
             ('50000000-0000-0000-0000-000000000002', 'membre-e@invalid.local'),
             ('50000000-0000-0000-0000-000000000003', 'membre-f@invalid.local'),
             ('50000000-0000-0000-0000-000000000004', 'membre-g@invalid.local'),
             ('50000000-0000-0000-0000-000000000005', 'pause-a@invalid.local'),
             ('60000000-0000-0000-0000-000000000001', 'sorti-a@invalid.local')) v(u, e)
on conflict (id) do nothing;

-- Entreprises : C sans membre, D suspendue, E essai expiré, F suspension globale passée,
-- G suspension prévue dans le futur (encore active).
insert into public.entreprises (id, nom, code_adhesion, abonnement_statut, abonnement_essai_debut, abonnement_essai_fin, suspension_globale_at, suspension_globale_motif, suspension_prevue_at) values
  ('c0000000-0000-0000-0000-000000000001', 'Sans membre C', 'ISOC0001', 'actif', null, null, null, null, null),
  ('d0000000-0000-0000-0000-000000000001', 'Suspendue D', 'ISOD0001', 'suspendu', null, null, null, null, null),
  ('e0000000-0000-0000-0000-000000000001', 'Essai expiré E', 'ISOE0001', 'essai', current_date - 60, current_date - 30, null, null, null),
  ('f0000000-0000-0000-0000-000000000001', 'Suspension globale F', 'ISOF0001', 'actif', null, null, now() - interval '1 day', 'Contre-épreuve', null),
  ('f1000000-0000-0000-0000-000000000001', 'Suspension future G', 'ISOG0001', 'actif', null, null, null, null, now() + interval '10 days')
on conflict (id) do nothing;

insert into public.postes (id, entreprise_id, nom) values
  ('9c000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Tout'),
  ('9d000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Tout'),
  ('9e000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Tout'),
  ('9f000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Tout'),
  ('9f100000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'Tout');
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select p.entreprise_id, p.id, d.cle, true from public.postes p cross join public.permissions_disponibles d
where p.nom = 'Tout' and p.entreprise_id in ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001');

insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut) values
  ('40000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'actif'),
  ('40000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000005', 'actif'),
  ('50000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '9d000000-0000-0000-0000-000000000001', 'actif'),
  ('50000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', '9e000000-0000-0000-0000-000000000001', 'actif'),
  ('50000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000001', '9f000000-0000-0000-0000-000000000001', 'actif'),
  ('50000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000001', '9f100000-0000-0000-0000-000000000001', 'actif'),
  ('50000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'pause'),
  ('60000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'actif');

-- Support : S1 accès actif à A et accès terminé à C ; S2 accès expiré (non terminé) à B.
insert into public.plateforme_admins (email, role, utilisateur_id, actif, statut_identite, activation_at)
values ('support@invalid.local', 'support', '30000000-0000-0000-0000-000000000002', true, 'active', now())
on conflict (email) do update set role = 'support', utilisateur_id = excluded.utilisateur_id, actif = true,
  statut_identite = 'active', activation_at = excluded.activation_at;
insert into public.plateforme_admins (email, role, utilisateur_id, actif, statut_identite, activation_at)
values ('support-expire@invalid.local', 'support', '30000000-0000-0000-0000-000000000003', true, 'active', now());
insert into public.plateforme_acces_entreprises (plateforme_user_id, entreprise_id, motif, commence_at, expire_at, termine_at) values
  ('30000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Contre-épreuve support actif', now() - interval '1 hour', now() + interval '3 hours', null),
  ('30000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'Contre-épreuve support expiré', now() - interval '6 hours', now() - interval '1 hour', null),
  ('30000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Contre-épreuve support terminé', now() - interval '1 hour', now() + interval '3 hours', now() - interval '5 minutes');

-- Session révoquée de l'admin A.
insert into public.sessions_revoquees (session_id, utilisateur_id, entreprise_id)
values ('5e550000-0000-0000-0000-00000000dead', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');

-- Données dans C..G et lignes des tables enfants pour tous.
insert into public.clients (id, entreprise_id, reference_interne, nom, type, statut)
select md5(e::text || 'client')::uuid, e, 'CTR_' || substr(e::text, 1, 3), 'Client ' || substr(e::text, 1, 2), 'particulier', 'actif'
from unnest(array['c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001',
                  'f0000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001']::uuid[]) e;
insert into public.chantiers (id, entreprise_id, client_id, nom, statut)
select md5(c.entreprise_id::text || 'chantier')::uuid, c.entreprise_id, c.id, 'Chantier ' || substr(c.entreprise_id::text, 1, 2), 'en_cours'
from public.clients c where c.reference_interne like 'CTR_%';
insert into public.devis (id, entreprise_id, numero, client_id, statut, montant_ht, montant_tva, montant_ttc)
select md5(c.entreprise_id::text || 'devis')::uuid, c.entreprise_id, 'CTR_DEV_' || substr(c.entreprise_id::text, 1, 3), c.id, 'brouillon', 0, 0, 0
from public.clients c where c.reference_interne like 'CTR_%';
insert into public.factures (id, entreprise_id, numero, client_id, statut, montant_ht, montant_tva, montant_ttc)
select md5(c.entreprise_id::text || 'facture')::uuid, c.entreprise_id, 'CTR_FAC_' || substr(c.entreprise_id::text, 1, 3), c.id, 'brouillon', 0, 0, 0
from public.clients c where c.reference_interne like 'CTR_%';
insert into public.lignes_devis (devis_id, entreprise_id, designation, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre)
select d.id, d.entreprise_id, 'Ligne', 'fourniture', 1, 'u', 10, 0, 20, 1 from public.devis d where d.statut = 'brouillon' and d.numero like 'CTR_%';
insert into public.lignes_factures (facture_id, entreprise_id, designation, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre)
select f.id, f.entreprise_id, 'Ligne', 'fourniture', 1, 'u', 10, 0, 20, 1 from public.factures f where f.numero like 'CTR_%';
insert into public.paiements (facture_id, montant, date, mode, reference)
select f.id, 1, current_date, 'virement', 'CTR' from public.factures f where f.numero like 'TEST_%';
insert into public.taches (chantier_id, libelle) select c.id, 'Tâche ' || c.nom from public.chantiers c;
insert into public.affectations (entreprise_id, employe_id, chantier_id, date)
select e.entreprise_id, e.id, (select c.id from public.chantiers c where c.entreprise_id = e.entreprise_id order by c.id limit 1), current_date + 1
from public.employes e where e.entreprise_id in ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001');
insert into public.sessions_pointage (entreprise_id, employe_id, chantier_id)
select e.entreprise_id, e.id, (select c.id from public.chantiers c where c.entreprise_id = e.entreprise_id order by c.id limit 1)
from public.employes e where e.id in ('a2000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002');
insert into public.notifications_utilisateurs (entreprise_id, utilisateur_id, type, titre)
select ue.entreprise_id, ue.utilisateur_id, 'contre_epreuve', 'N' from public.utilisateurs_entreprises ue;
-- Branches fines des fonctions par ligne : affectation du JOUR (chantier non assigné en équipe),
-- équipe échue (date_fin passée : candidate mais refusée par la fonction d'origine), document
-- réservé à l'encadrement, fiche salarié sortie.
insert into public.affectations (entreprise_id, employe_id, chantier_id, date) values
  ('b0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'b4000000-0000-0000-0000-000000000002', current_date);
insert into public.equipes_chantiers (entreprise_id, chantier_id, employe_id, role_chantier, date_debut, date_fin) values
  ('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', 'ouvrier', current_date - 30, current_date - 1);
insert into public.documents_chantier (entreprise_id, chantier_id, nom, storage_path, mime_type, taille_octets, audience) values
  ('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'Encadrement A',
   'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000001/encadrement.pdf', 'application/pdf', 10, 'encadrement');
-- Ancien salarié (fiche « sortie ») encore membre actif : ni chantier assigné, ni ses pointages.
insert into public.employes (id, entreprise_id, utilisateur_id, prenom, nom, numero_inscription, identifiant_interne, statut)
values ('a2000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001',
        'Sorti', 'A', 'ISO-A-00F1', 'A00F1', 'actif');
insert into public.equipes_chantiers (entreprise_id, chantier_id, employe_id, role_chantier) values
  ('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-0000000000f1', 'ouvrier');
insert into public.pointages (entreprise_id, employe_id, chantier_id, date, heures_normales, heures_supplementaires, verification_statut) values
  ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-0000000000f1', 'a4000000-0000-0000-0000-000000000001', current_date - 40, 7, 0, 'valide');
insert into public.affectations (entreprise_id, employe_id, chantier_id, date) values
  ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-0000000000f1', 'a4000000-0000-0000-0000-000000000002', current_date);
update public.employes set statut = 'sorti' where id = 'a2000000-0000-0000-0000-0000000000f1';

-- ── Contextes ───────────────────────────────────────────────────────────────────────
create temp table ctx (nom text primary key, sub uuid, session uuid);

insert into ctx values
  ('admin_a', $$10000000-0000-0000-0000-000000000001$$, '5e550000-0000-0000-0000-000000000001'),
  ('ouvrier_a', $$10000000-0000-0000-0000-000000000002$$, '5e550000-0000-0000-0000-000000000001'),
  ('chef_equipe_a', $$10000000-0000-0000-0000-000000000003$$, '5e550000-0000-0000-0000-000000000001'),
  ('conducteur_a', $$10000000-0000-0000-0000-000000000004$$, '5e550000-0000-0000-0000-000000000001'),
  ('comptable_a', $$10000000-0000-0000-0000-000000000005$$, '5e550000-0000-0000-0000-000000000001'),
  ('admin_b', $$20000000-0000-0000-0000-000000000001$$, '5e550000-0000-0000-0000-000000000001'),
  ('ouvrier_b', $$20000000-0000-0000-0000-000000000002$$, '5e550000-0000-0000-0000-000000000001'),
  ('multi_a_ouvrier_b_comptable', $$40000000-0000-0000-0000-000000000001$$, '5e550000-0000-0000-0000-000000000001'),
  ('support_a_actif_c_termine', $$30000000-0000-0000-0000-000000000002$$, '5e550000-0000-0000-0000-000000000001'),
  ('support_b_expire', $$30000000-0000-0000-0000-000000000003$$, '5e550000-0000-0000-0000-000000000001'),
  ('plateforme_sans_acces', $$30000000-0000-0000-0000-000000000001$$, '5e550000-0000-0000-0000-000000000001'),
  ('membre_d_suspendue', $$50000000-0000-0000-0000-000000000001$$, '5e550000-0000-0000-0000-000000000001'),
  ('membre_e_essai_expire', $$50000000-0000-0000-0000-000000000002$$, '5e550000-0000-0000-0000-000000000001'),
  ('membre_f_suspension_globale', $$50000000-0000-0000-0000-000000000003$$, '5e550000-0000-0000-0000-000000000001'),
  ('membre_g_suspension_future', $$50000000-0000-0000-0000-000000000004$$, '5e550000-0000-0000-0000-000000000001'),
  ('membre_a_en_pause', $$50000000-0000-0000-0000-000000000005$$, '5e550000-0000-0000-0000-000000000001'),
  ('ancien_salarie_a', $$60000000-0000-0000-0000-000000000001$$, '5e550000-0000-0000-0000-000000000001'),
  ('admin_a_session_revoquee', $$10000000-0000-0000-0000-000000000001$$, '5e550000-0000-0000-0000-00000000dead'),
  ('anonyme', null, '5e550000-0000-0000-0000-000000000001');

create function pg_temp.endosser(p_sub uuid, p_session uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p_sub is null then '{"role":"anon"}'
         else json_build_object('sub', p_sub, 'role', 'authenticated', 'session_id', p_session)::text end, true) $$;

-- Expressions V9.1 d'origine des policies réécrites.
create temp table pol_v91 (t text, p text, q text, w text);
insert into pol_v91 values
  ('affectations', $v91$membres affectations$v91$, $v91$est_membre_actif(entreprise_id)$v91$, $v91$est_membre_actif(entreprise_id)$v91$),
  ('affectations', $v91$role_affectation_select$v91$, $v91$peut_consulter_affectation_employe(entreprise_id, employe_id)$v91$, NULL),
  ('affectations', $v91$role_gestion_delete$v91$, $v91$a_permission(entreprise_id, 'gerer_planning'::text)$v91$, NULL),
  ('affectations', $v91$role_gestion_insert$v91$, NULL, $v91$a_permission(entreprise_id, 'gerer_planning'::text)$v91$),
  ('affectations', $v91$role_gestion_update$v91$, $v91$a_permission(entreprise_id, 'gerer_planning'::text)$v91$, $v91$a_permission(entreprise_id, 'gerer_planning'::text)$v91$),
  ('chantiers', $v91$chantiers_lecture_selon_droits$v91$, $v91$peut_consulter_chantier(entreprise_id, id)$v91$, NULL),
  ('chantiers', $v91$lecture_chantiers_selon_permission$v91$, $v91$peut_consulter_chantier(entreprise_id, id)$v91$, NULL),
  ('chantiers', $v91$membres modifient les chantiers$v91$, $v91$est_membre_actif(entreprise_id)$v91$, $v91$(est_membre_actif(entreprise_id) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = chantiers.client_id) AND (c.entreprise_id = chantiers.entreprise_id)))))$v91$),
  ('chantiers', $v91$membres suppriment les chantiers$v91$, $v91$est_membre_actif(entreprise_id)$v91$, NULL),
  ('chantiers', $v91$membres écrivent les chantiers$v91$, NULL, $v91$(est_membre_actif(entreprise_id) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = chantiers.client_id) AND (c.entreprise_id = chantiers.entreprise_id)))))$v91$),
  ('chantiers', $v91$role_gestion_delete$v91$, $v91$a_permission(entreprise_id, 'gerer_chantiers'::text)$v91$, NULL),
  ('chantiers', $v91$role_gestion_insert$v91$, NULL, $v91$a_permission(entreprise_id, 'gerer_chantiers'::text)$v91$),
  ('chantiers', $v91$role_gestion_update$v91$, $v91$a_permission(entreprise_id, 'gerer_chantiers'::text)$v91$, $v91$a_permission(entreprise_id, 'gerer_chantiers'::text)$v91$),
  ('clients', $v91$lecture_clients_selon_permission$v91$, $v91$a_permission(entreprise_id, 'acces_clients'::text)$v91$, NULL),
  ('clients', $v91$membres accèdent aux clients$v91$, $v91$est_membre_actif(entreprise_id)$v91$, $v91$est_membre_actif(entreprise_id)$v91$),
  ('clients', $v91$role_gestion_delete$v91$, $v91$a_permission(entreprise_id, 'gerer_clients'::text)$v91$, NULL),
  ('clients', $v91$role_gestion_insert$v91$, NULL, $v91$a_permission(entreprise_id, 'gerer_clients'::text)$v91$),
  ('clients', $v91$role_gestion_update$v91$, $v91$a_permission(entreprise_id, 'gerer_clients'::text)$v91$, $v91$a_permission(entreprise_id, 'gerer_clients'::text)$v91$),
  ('devis', $v91$lecture_devis_selon_permission$v91$, $v91$a_permission(entreprise_id, 'acces_devis'::text)$v91$, NULL),
  ('devis', $v91$membres devis$v91$, $v91$est_membre_actif(entreprise_id)$v91$, $v91$est_membre_actif(entreprise_id)$v91$),
  ('devis', $v91$role_gestion_delete$v91$, $v91$a_permission(entreprise_id, 'gerer_devis'::text)$v91$, NULL),
  ('devis', $v91$role_gestion_insert$v91$, NULL, $v91$a_permission(entreprise_id, 'gerer_devis'::text)$v91$),
  ('devis', $v91$role_gestion_update$v91$, $v91$a_permission(entreprise_id, 'gerer_devis'::text)$v91$, $v91$a_permission(entreprise_id, 'gerer_devis'::text)$v91$),
  ('documents_chantier', $v91$documents_chantier_ajout$v91$, NULL, $v91$(est_membre_actif(entreprise_id) AND a_permission(entreprise_id, 'gerer_chantiers'::text))$v91$),
  ('documents_chantier', $v91$documents_chantier_ajout_terrain$v91$, NULL, $v91$(est_membre_actif(entreprise_id) AND a_permission(entreprise_id, 'ajouter_documents_chantier'::text))$v91$),
  ('documents_chantier', $v91$documents_chantier_lecture$v91$, $v91$peut_voir_document_chantier(id)$v91$, NULL),
  ('documents_chantier', $v91$documents_chantier_modification$v91$, $v91$(est_membre_actif(entreprise_id) AND a_permission(entreprise_id, 'gerer_chantiers'::text))$v91$, $v91$(est_membre_actif(entreprise_id) AND a_permission(entreprise_id, 'gerer_chantiers'::text))$v91$),
  ('documents_chantier', $v91$documents_chantier_suppression$v91$, $v91$(est_membre_actif(entreprise_id) AND a_permission(entreprise_id, 'gerer_chantiers'::text))$v91$, NULL),
  ('documents_chantier', $v91$role_gestion_delete$v91$, $v91$a_permission(entreprise_id, 'gerer_chantiers'::text)$v91$, NULL),
  ('documents_chantier', $v91$role_gestion_insert$v91$, NULL, $v91$(a_permission(entreprise_id, 'gerer_chantiers'::text) OR a_permission(entreprise_id, 'ajouter_documents_chantier'::text))$v91$),
  ('documents_chantier', $v91$role_gestion_update$v91$, $v91$a_permission(entreprise_id, 'gerer_chantiers'::text)$v91$, $v91$a_permission(entreprise_id, 'gerer_chantiers'::text)$v91$),
  ('factures', $v91$lecture_factures_selon_permission$v91$, $v91$a_permission(entreprise_id, 'acces_factures'::text)$v91$, NULL),
  ('factures', $v91$membres factures$v91$, $v91$est_membre_actif(entreprise_id)$v91$, $v91$est_membre_actif(entreprise_id)$v91$),
  ('factures', $v91$role_gestion_delete$v91$, $v91$a_permission(entreprise_id, 'gerer_factures'::text)$v91$, NULL),
  ('factures', $v91$role_gestion_insert$v91$, NULL, $v91$a_permission(entreprise_id, 'gerer_factures'::text)$v91$),
  ('factures', $v91$role_gestion_update$v91$, $v91$a_permission(entreprise_id, 'gerer_factures'::text)$v91$, $v91$a_permission(entreprise_id, 'gerer_factures'::text)$v91$),
  ('lignes_devis', $v91$lecture_lignes_devis_selon_permission$v91$, $v91$a_permission(entreprise_id, 'acces_devis'::text)$v91$, NULL),
  ('lignes_devis', $v91$membres lignes_devis$v91$, $v91$est_membre_actif(entreprise_id)$v91$, $v91$est_membre_actif(entreprise_id)$v91$),
  ('lignes_devis', $v91$role_gestion_delete$v91$, $v91$a_permission(entreprise_id, 'gerer_devis'::text)$v91$, NULL),
  ('lignes_devis', $v91$role_gestion_insert$v91$, NULL, $v91$a_permission(entreprise_id, 'gerer_devis'::text)$v91$),
  ('lignes_devis', $v91$role_gestion_update$v91$, $v91$a_permission(entreprise_id, 'gerer_devis'::text)$v91$, $v91$a_permission(entreprise_id, 'gerer_devis'::text)$v91$),
  ('lignes_factures', $v91$lecture_lignes_factures_selon_permission$v91$, $v91$a_permission(entreprise_id, 'acces_factures'::text)$v91$, NULL),
  ('lignes_factures', $v91$membres lignes_factures$v91$, $v91$est_membre_actif(entreprise_id)$v91$, $v91$est_membre_actif(entreprise_id)$v91$),
  ('lignes_factures', $v91$role_gestion_delete$v91$, $v91$a_permission(entreprise_id, 'gerer_factures'::text)$v91$, NULL),
  ('lignes_factures', $v91$role_gestion_insert$v91$, NULL, $v91$a_permission(entreprise_id, 'gerer_factures'::text)$v91$),
  ('lignes_factures', $v91$role_gestion_update$v91$, $v91$a_permission(entreprise_id, 'gerer_factures'::text)$v91$, $v91$a_permission(entreprise_id, 'gerer_factures'::text)$v91$),
  ('notifications_utilisateurs', $v91$notifications_marquer_lue$v91$, $v91$(utilisateur_id = auth.uid())$v91$, $v91$(utilisateur_id = auth.uid())$v91$),
  ('notifications_utilisateurs', $v91$notifications_personnelles$v91$, $v91$((utilisateur_id = auth.uid()) AND est_membre_actif(entreprise_id))$v91$, NULL),
  ('paiements', $v91$lecture_paiements_selon_permission$v91$, $v91$(EXISTS ( SELECT 1
   FROM factures f
  WHERE ((f.id = paiements.facture_id) AND a_permission(f.entreprise_id, 'acces_factures'::text))))$v91$, NULL),
  ('paiements', $v91$membres paiements$v91$, $v91$(EXISTS ( SELECT 1
   FROM factures f
  WHERE ((f.id = paiements.facture_id) AND est_membre_actif(f.entreprise_id))))$v91$, $v91$(EXISTS ( SELECT 1
   FROM factures f
  WHERE ((f.id = paiements.facture_id) AND est_membre_actif(f.entreprise_id))))$v91$),
  ('paiements', $v91$role_gestion_delete$v91$, $v91$(EXISTS ( SELECT 1
   FROM factures p
  WHERE ((p.id = paiements.facture_id) AND a_permission(p.entreprise_id, 'gerer_factures'::text))))$v91$, NULL),
  ('paiements', $v91$role_gestion_insert$v91$, NULL, $v91$(EXISTS ( SELECT 1
   FROM factures p
  WHERE ((p.id = paiements.facture_id) AND a_permission(p.entreprise_id, 'gerer_factures'::text))))$v91$),
  ('paiements', $v91$role_gestion_update$v91$, $v91$(EXISTS ( SELECT 1
   FROM factures p
  WHERE ((p.id = paiements.facture_id) AND a_permission(p.entreprise_id, 'gerer_factures'::text))))$v91$, $v91$(EXISTS ( SELECT 1
   FROM factures p
  WHERE ((p.id = paiements.facture_id) AND a_permission(p.entreprise_id, 'gerer_factures'::text))))$v91$),
  ('pointages', $v91$membres pointages$v91$, $v91$est_membre_actif(entreprise_id)$v91$, $v91$est_membre_actif(entreprise_id)$v91$),
  ('pointages', $v91$role_gestion_delete$v91$, $v91$a_permission(entreprise_id, 'gerer_pointage'::text)$v91$, NULL),
  ('pointages', $v91$role_gestion_update$v91$, $v91$a_permission(entreprise_id, 'gerer_pointage'::text)$v91$, $v91$a_permission(entreprise_id, 'gerer_pointage'::text)$v91$),
  ('pointages', $v91$role_pointage_select$v91$, $v91$peut_consulter_pointage_employe(entreprise_id, employe_id)$v91$, NULL),
  ('sessions_pointage', $v91$role_gestion_delete$v91$, $v91$a_permission(entreprise_id, 'gerer_pointage'::text)$v91$, NULL),
  ('sessions_pointage', $v91$role_pointage_select$v91$, $v91$peut_consulter_pointage_employe(entreprise_id, employe_id)$v91$, NULL),
  ('sessions_pointage', $v91$sessions_pointage_membres$v91$, $v91$est_membre_actif(entreprise_id)$v91$, $v91$est_membre_actif(entreprise_id)$v91$),
  ('taches', $v91$lecture_taches_selon_permission$v91$, $v91$(EXISTS ( SELECT 1
   FROM chantiers c
  WHERE ((c.id = taches.chantier_id) AND peut_consulter_chantier(c.entreprise_id, c.id))))$v91$, NULL),
  ('taches', $v91$membres accèdent aux tâches$v91$, $v91$(EXISTS ( SELECT 1
   FROM chantiers ch
  WHERE ((ch.id = taches.chantier_id) AND est_membre_actif(ch.entreprise_id))))$v91$, $v91$(EXISTS ( SELECT 1
   FROM chantiers ch
  WHERE ((ch.id = taches.chantier_id) AND est_membre_actif(ch.entreprise_id))))$v91$),
  ('taches', $v91$role_gestion_delete$v91$, $v91$(EXISTS ( SELECT 1
   FROM chantiers p
  WHERE ((p.id = taches.chantier_id) AND a_permission(p.entreprise_id, 'gerer_chantiers'::text))))$v91$, NULL),
  ('taches', $v91$role_gestion_insert$v91$, NULL, $v91$(EXISTS ( SELECT 1
   FROM chantiers p
  WHERE ((p.id = taches.chantier_id) AND a_permission(p.entreprise_id, 'gerer_chantiers'::text))))$v91$),
  ('taches', $v91$role_gestion_update$v91$, $v91$(EXISTS ( SELECT 1
   FROM chantiers p
  WHERE ((p.id = taches.chantier_id) AND a_permission(p.entreprise_id, 'gerer_chantiers'::text))))$v91$, $v91$(EXISTS ( SELECT 1
   FROM chantiers p
  WHERE ((p.id = taches.chantier_id) AND a_permission(p.entreprise_id, 'gerer_chantiers'::text))))$v91$);

select is((select count(*)::int from pol_v91 v join pg_policies pp on pp.schemaname = 'public' and pp.tablename = v.t and pp.policyname = v.p
           where coalesce(pp.qual, '') ~ 'est_membre_actif\(|a_permission\(' or coalesce(pp.with_check, '') ~ 'est_membre_actif\(|a_permission\('),
  0, 'E0 aucune des 65 policies installées n''appelle plus est_membre_actif / a_permission ligne à ligne');

-- E1 : prédicats ligne à ligne, ancienne expression contre expression installée.
create function pg_temp.ecarts(p_sub uuid, p_session uuid) returns table(t text, p text, clause text, n bigint)
language plpgsql as $$
declare r record; v bigint;
begin
  perform pg_temp.endosser(p_sub, p_session);
  for r in select v.t, v.p, v.q, v.w, pp.qual nq, pp.with_check nw from pol_v91 v
           join pg_policies pp on pp.schemaname = 'public' and pp.tablename = v.t and pp.policyname = v.p loop
    if r.q is not null then
      execute format('select count(*) from public.%I where coalesce((%s), false) is distinct from coalesce((%s), false)', r.t, r.q, r.nq) into v;
      t := r.t; p := r.p; clause := 'using'; n := v; return next;
    end if;
    if r.w is not null then
      execute format('select count(*) from public.%I where coalesce((%s), false) is distinct from coalesce((%s), false)', r.t, r.w, r.nw) into v;
      t := r.t; p := r.p; clause := 'with check'; n := v; return next;
    end if;
  end loop;
end $$;

select is((select coalesce(sum(e.n), -1)::int from ctx, pg_temp.ecarts(ctx.sub, ctx.session) e where ctx.nom = 'admin_a'), 0,
  'E1 admin_a : USING / WITH CHECK identiques à V9.1 sur chaque ligne des 13 tables');
select is((select coalesce(sum(e.n), -1)::int from ctx, pg_temp.ecarts(ctx.sub, ctx.session) e where ctx.nom = 'ouvrier_a'), 0,
  'E1 ouvrier_a : USING / WITH CHECK identiques à V9.1 sur chaque ligne des 13 tables');
select is((select coalesce(sum(e.n), -1)::int from ctx, pg_temp.ecarts(ctx.sub, ctx.session) e where ctx.nom = 'chef_equipe_a'), 0,
  'E1 chef_equipe_a : USING / WITH CHECK identiques à V9.1 sur chaque ligne des 13 tables');
select is((select coalesce(sum(e.n), -1)::int from ctx, pg_temp.ecarts(ctx.sub, ctx.session) e where ctx.nom = 'conducteur_a'), 0,
  'E1 conducteur_a : USING / WITH CHECK identiques à V9.1 sur chaque ligne des 13 tables');
select is((select coalesce(sum(e.n), -1)::int from ctx, pg_temp.ecarts(ctx.sub, ctx.session) e where ctx.nom = 'comptable_a'), 0,
  'E1 comptable_a : USING / WITH CHECK identiques à V9.1 sur chaque ligne des 13 tables');
select is((select coalesce(sum(e.n), -1)::int from ctx, pg_temp.ecarts(ctx.sub, ctx.session) e where ctx.nom = 'admin_b'), 0,
  'E1 admin_b : USING / WITH CHECK identiques à V9.1 sur chaque ligne des 13 tables');
select is((select coalesce(sum(e.n), -1)::int from ctx, pg_temp.ecarts(ctx.sub, ctx.session) e where ctx.nom = 'ouvrier_b'), 0,
  'E1 ouvrier_b : USING / WITH CHECK identiques à V9.1 sur chaque ligne des 13 tables');
select is((select coalesce(sum(e.n), -1)::int from ctx, pg_temp.ecarts(ctx.sub, ctx.session) e where ctx.nom = 'multi_a_ouvrier_b_comptable'), 0,
  'E1 multi_a_ouvrier_b_comptable : USING / WITH CHECK identiques à V9.1 sur chaque ligne des 13 tables');
select is((select coalesce(sum(e.n), -1)::int from ctx, pg_temp.ecarts(ctx.sub, ctx.session) e where ctx.nom = 'support_a_actif_c_termine'), 0,
  'E1 support_a_actif_c_termine : USING / WITH CHECK identiques à V9.1 sur chaque ligne des 13 tables');
select is((select coalesce(sum(e.n), -1)::int from ctx, pg_temp.ecarts(ctx.sub, ctx.session) e where ctx.nom = 'support_b_expire'), 0,
  'E1 support_b_expire : USING / WITH CHECK identiques à V9.1 sur chaque ligne des 13 tables');
select is((select coalesce(sum(e.n), -1)::int from ctx, pg_temp.ecarts(ctx.sub, ctx.session) e where ctx.nom = 'plateforme_sans_acces'), 0,
  'E1 plateforme_sans_acces : USING / WITH CHECK identiques à V9.1 sur chaque ligne des 13 tables');
select is((select coalesce(sum(e.n), -1)::int from ctx, pg_temp.ecarts(ctx.sub, ctx.session) e where ctx.nom = 'membre_d_suspendue'), 0,
  'E1 membre_d_suspendue : USING / WITH CHECK identiques à V9.1 sur chaque ligne des 13 tables');
select is((select coalesce(sum(e.n), -1)::int from ctx, pg_temp.ecarts(ctx.sub, ctx.session) e where ctx.nom = 'membre_e_essai_expire'), 0,
  'E1 membre_e_essai_expire : USING / WITH CHECK identiques à V9.1 sur chaque ligne des 13 tables');
select is((select coalesce(sum(e.n), -1)::int from ctx, pg_temp.ecarts(ctx.sub, ctx.session) e where ctx.nom = 'membre_f_suspension_globale'), 0,
  'E1 membre_f_suspension_globale : USING / WITH CHECK identiques à V9.1 sur chaque ligne des 13 tables');
select is((select coalesce(sum(e.n), -1)::int from ctx, pg_temp.ecarts(ctx.sub, ctx.session) e where ctx.nom = 'membre_g_suspension_future'), 0,
  'E1 membre_g_suspension_future : USING / WITH CHECK identiques à V9.1 sur chaque ligne des 13 tables');
select is((select coalesce(sum(e.n), -1)::int from ctx, pg_temp.ecarts(ctx.sub, ctx.session) e where ctx.nom = 'membre_a_en_pause'), 0,
  'E1 membre_a_en_pause : USING / WITH CHECK identiques à V9.1 sur chaque ligne des 13 tables');
select is((select coalesce(sum(e.n), -1)::int from ctx, pg_temp.ecarts(ctx.sub, ctx.session) e where ctx.nom = 'ancien_salarie_a'), 0,
  'E1 ancien_salarie_a : USING / WITH CHECK identiques à V9.1 sur chaque ligne des 13 tables');
select is((select coalesce(sum(e.n), -1)::int from ctx, pg_temp.ecarts(ctx.sub, ctx.session) e where ctx.nom = 'admin_a_session_revoquee'), 0,
  'E1 admin_a_session_revoquee : USING / WITH CHECK identiques à V9.1 sur chaque ligne des 13 tables');
select is((select coalesce(sum(e.n), -1)::int from ctx, pg_temp.ecarts(ctx.sub, ctx.session) e where ctx.nom = 'anonyme'), 0,
  'E1 anonyme : USING / WITH CHECK identiques à V9.1 sur chaque ligne des 13 tables');

-- E2 : lignes réellement visibles sous RLS (rôle authenticated / anon), avant et après.
create temp table vu (phase text, ctx text, t text, nb int, empreinte text);
grant select, insert on vu to authenticated, anon;
create function pg_temp.capturer(p_phase text) returns void language plpgsql as $$
declare c record; tb text; v_role text;
begin
  for c in select * from ctx loop
    v_role := case when c.sub is null then 'anon' else 'authenticated' end;
    foreach tb in array array['devis', 'lignes_devis', 'factures', 'lignes_factures', 'clients', 'paiements', 'chantiers', 'taches', 'pointages', 'sessions_pointage', 'affectations', 'documents_chantier', 'notifications_utilisateurs'] loop
      perform pg_temp.endosser(c.sub, c.session);
      execute format('set local role %I', v_role);
      begin
        execute format('insert into vu select %L, %L, %L, count(*), md5(coalesce(string_agg(x.id::text, '','' order by x.id), '''')) from public.%I x',
                       p_phase, c.nom, tb, tb);
      exception when insufficient_privilege then
        insert into vu values (p_phase, c.nom, tb, -1, 'refus');
      end;
      reset role;
    end loop;
  end loop;
end $$;
select pg_temp.capturer('apres');
create temp table pol_installees as
  select pp.tablename t, pp.policyname p, pp.qual q, pp.with_check w
  from pg_policies pp join pol_v91 v on pp.schemaname = 'public' and pp.tablename = v.t and pp.policyname = v.p;

-- Policies V9.1 restaurées dans la transaction (annulées par le rollback final).
ALTER POLICY "membres affectations" ON public.affectations
  USING (est_membre_actif(entreprise_id))
  WITH CHECK (est_membre_actif(entreprise_id));
ALTER POLICY "role_affectation_select" ON public.affectations
  USING (peut_consulter_affectation_employe(entreprise_id, employe_id));
ALTER POLICY "role_gestion_delete" ON public.affectations
  USING (a_permission(entreprise_id, 'gerer_planning'::text));
ALTER POLICY "role_gestion_insert" ON public.affectations
  WITH CHECK (a_permission(entreprise_id, 'gerer_planning'::text));
ALTER POLICY "role_gestion_update" ON public.affectations
  USING (a_permission(entreprise_id, 'gerer_planning'::text))
  WITH CHECK (a_permission(entreprise_id, 'gerer_planning'::text));
ALTER POLICY "chantiers_lecture_selon_droits" ON public.chantiers
  USING (peut_consulter_chantier(entreprise_id, id));
ALTER POLICY "lecture_chantiers_selon_permission" ON public.chantiers
  USING (peut_consulter_chantier(entreprise_id, id));
ALTER POLICY "membres modifient les chantiers" ON public.chantiers
  USING (est_membre_actif(entreprise_id))
  WITH CHECK ((est_membre_actif(entreprise_id) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = chantiers.client_id) AND (c.entreprise_id = chantiers.entreprise_id))))));
ALTER POLICY "membres suppriment les chantiers" ON public.chantiers
  USING (est_membre_actif(entreprise_id));
ALTER POLICY "membres écrivent les chantiers" ON public.chantiers
  WITH CHECK ((est_membre_actif(entreprise_id) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = chantiers.client_id) AND (c.entreprise_id = chantiers.entreprise_id))))));
ALTER POLICY "role_gestion_delete" ON public.chantiers
  USING (a_permission(entreprise_id, 'gerer_chantiers'::text));
ALTER POLICY "role_gestion_insert" ON public.chantiers
  WITH CHECK (a_permission(entreprise_id, 'gerer_chantiers'::text));
ALTER POLICY "role_gestion_update" ON public.chantiers
  USING (a_permission(entreprise_id, 'gerer_chantiers'::text))
  WITH CHECK (a_permission(entreprise_id, 'gerer_chantiers'::text));
ALTER POLICY "lecture_clients_selon_permission" ON public.clients
  USING (a_permission(entreprise_id, 'acces_clients'::text));
ALTER POLICY "membres accèdent aux clients" ON public.clients
  USING (est_membre_actif(entreprise_id))
  WITH CHECK (est_membre_actif(entreprise_id));
ALTER POLICY "role_gestion_delete" ON public.clients
  USING (a_permission(entreprise_id, 'gerer_clients'::text));
ALTER POLICY "role_gestion_insert" ON public.clients
  WITH CHECK (a_permission(entreprise_id, 'gerer_clients'::text));
ALTER POLICY "role_gestion_update" ON public.clients
  USING (a_permission(entreprise_id, 'gerer_clients'::text))
  WITH CHECK (a_permission(entreprise_id, 'gerer_clients'::text));
ALTER POLICY "lecture_devis_selon_permission" ON public.devis
  USING (a_permission(entreprise_id, 'acces_devis'::text));
ALTER POLICY "membres devis" ON public.devis
  USING (est_membre_actif(entreprise_id))
  WITH CHECK (est_membre_actif(entreprise_id));
ALTER POLICY "role_gestion_delete" ON public.devis
  USING (a_permission(entreprise_id, 'gerer_devis'::text));
ALTER POLICY "role_gestion_insert" ON public.devis
  WITH CHECK (a_permission(entreprise_id, 'gerer_devis'::text));
ALTER POLICY "role_gestion_update" ON public.devis
  USING (a_permission(entreprise_id, 'gerer_devis'::text))
  WITH CHECK (a_permission(entreprise_id, 'gerer_devis'::text));
ALTER POLICY "documents_chantier_ajout" ON public.documents_chantier
  WITH CHECK ((est_membre_actif(entreprise_id) AND a_permission(entreprise_id, 'gerer_chantiers'::text)));
ALTER POLICY "documents_chantier_ajout_terrain" ON public.documents_chantier
  WITH CHECK ((est_membre_actif(entreprise_id) AND a_permission(entreprise_id, 'ajouter_documents_chantier'::text)));
ALTER POLICY "documents_chantier_lecture" ON public.documents_chantier
  USING (peut_voir_document_chantier(id));
ALTER POLICY "documents_chantier_modification" ON public.documents_chantier
  USING ((est_membre_actif(entreprise_id) AND a_permission(entreprise_id, 'gerer_chantiers'::text)))
  WITH CHECK ((est_membre_actif(entreprise_id) AND a_permission(entreprise_id, 'gerer_chantiers'::text)));
ALTER POLICY "documents_chantier_suppression" ON public.documents_chantier
  USING ((est_membre_actif(entreprise_id) AND a_permission(entreprise_id, 'gerer_chantiers'::text)));
ALTER POLICY "role_gestion_delete" ON public.documents_chantier
  USING (a_permission(entreprise_id, 'gerer_chantiers'::text));
ALTER POLICY "role_gestion_insert" ON public.documents_chantier
  WITH CHECK ((a_permission(entreprise_id, 'gerer_chantiers'::text) OR a_permission(entreprise_id, 'ajouter_documents_chantier'::text)));
ALTER POLICY "role_gestion_update" ON public.documents_chantier
  USING (a_permission(entreprise_id, 'gerer_chantiers'::text))
  WITH CHECK (a_permission(entreprise_id, 'gerer_chantiers'::text));
ALTER POLICY "lecture_factures_selon_permission" ON public.factures
  USING (a_permission(entreprise_id, 'acces_factures'::text));
ALTER POLICY "membres factures" ON public.factures
  USING (est_membre_actif(entreprise_id))
  WITH CHECK (est_membre_actif(entreprise_id));
ALTER POLICY "role_gestion_delete" ON public.factures
  USING (a_permission(entreprise_id, 'gerer_factures'::text));
ALTER POLICY "role_gestion_insert" ON public.factures
  WITH CHECK (a_permission(entreprise_id, 'gerer_factures'::text));
ALTER POLICY "role_gestion_update" ON public.factures
  USING (a_permission(entreprise_id, 'gerer_factures'::text))
  WITH CHECK (a_permission(entreprise_id, 'gerer_factures'::text));
ALTER POLICY "lecture_lignes_devis_selon_permission" ON public.lignes_devis
  USING (a_permission(entreprise_id, 'acces_devis'::text));
ALTER POLICY "membres lignes_devis" ON public.lignes_devis
  USING (est_membre_actif(entreprise_id))
  WITH CHECK (est_membre_actif(entreprise_id));
ALTER POLICY "role_gestion_delete" ON public.lignes_devis
  USING (a_permission(entreprise_id, 'gerer_devis'::text));
ALTER POLICY "role_gestion_insert" ON public.lignes_devis
  WITH CHECK (a_permission(entreprise_id, 'gerer_devis'::text));
ALTER POLICY "role_gestion_update" ON public.lignes_devis
  USING (a_permission(entreprise_id, 'gerer_devis'::text))
  WITH CHECK (a_permission(entreprise_id, 'gerer_devis'::text));
ALTER POLICY "lecture_lignes_factures_selon_permission" ON public.lignes_factures
  USING (a_permission(entreprise_id, 'acces_factures'::text));
ALTER POLICY "membres lignes_factures" ON public.lignes_factures
  USING (est_membre_actif(entreprise_id))
  WITH CHECK (est_membre_actif(entreprise_id));
ALTER POLICY "role_gestion_delete" ON public.lignes_factures
  USING (a_permission(entreprise_id, 'gerer_factures'::text));
ALTER POLICY "role_gestion_insert" ON public.lignes_factures
  WITH CHECK (a_permission(entreprise_id, 'gerer_factures'::text));
ALTER POLICY "role_gestion_update" ON public.lignes_factures
  USING (a_permission(entreprise_id, 'gerer_factures'::text))
  WITH CHECK (a_permission(entreprise_id, 'gerer_factures'::text));
ALTER POLICY "notifications_marquer_lue" ON public.notifications_utilisateurs
  USING ((utilisateur_id = auth.uid()))
  WITH CHECK ((utilisateur_id = auth.uid()));
ALTER POLICY "notifications_personnelles" ON public.notifications_utilisateurs
  USING (((utilisateur_id = auth.uid()) AND est_membre_actif(entreprise_id)));
ALTER POLICY "lecture_paiements_selon_permission" ON public.paiements
  USING ((EXISTS ( SELECT 1
   FROM factures f
  WHERE ((f.id = paiements.facture_id) AND a_permission(f.entreprise_id, 'acces_factures'::text)))));
ALTER POLICY "membres paiements" ON public.paiements
  USING ((EXISTS ( SELECT 1
   FROM factures f
  WHERE ((f.id = paiements.facture_id) AND est_membre_actif(f.entreprise_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM factures f
  WHERE ((f.id = paiements.facture_id) AND est_membre_actif(f.entreprise_id)))));
ALTER POLICY "role_gestion_delete" ON public.paiements
  USING ((EXISTS ( SELECT 1
   FROM factures p
  WHERE ((p.id = paiements.facture_id) AND a_permission(p.entreprise_id, 'gerer_factures'::text)))));
ALTER POLICY "role_gestion_insert" ON public.paiements
  WITH CHECK ((EXISTS ( SELECT 1
   FROM factures p
  WHERE ((p.id = paiements.facture_id) AND a_permission(p.entreprise_id, 'gerer_factures'::text)))));
ALTER POLICY "role_gestion_update" ON public.paiements
  USING ((EXISTS ( SELECT 1
   FROM factures p
  WHERE ((p.id = paiements.facture_id) AND a_permission(p.entreprise_id, 'gerer_factures'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM factures p
  WHERE ((p.id = paiements.facture_id) AND a_permission(p.entreprise_id, 'gerer_factures'::text)))));
ALTER POLICY "membres pointages" ON public.pointages
  USING (est_membre_actif(entreprise_id))
  WITH CHECK (est_membre_actif(entreprise_id));
ALTER POLICY "role_gestion_delete" ON public.pointages
  USING (a_permission(entreprise_id, 'gerer_pointage'::text));
ALTER POLICY "role_gestion_update" ON public.pointages
  USING (a_permission(entreprise_id, 'gerer_pointage'::text))
  WITH CHECK (a_permission(entreprise_id, 'gerer_pointage'::text));
ALTER POLICY "role_pointage_select" ON public.pointages
  USING (peut_consulter_pointage_employe(entreprise_id, employe_id));
ALTER POLICY "role_gestion_delete" ON public.sessions_pointage
  USING (a_permission(entreprise_id, 'gerer_pointage'::text));
ALTER POLICY "role_pointage_select" ON public.sessions_pointage
  USING (peut_consulter_pointage_employe(entreprise_id, employe_id));
ALTER POLICY "sessions_pointage_membres" ON public.sessions_pointage
  USING (est_membre_actif(entreprise_id))
  WITH CHECK (est_membre_actif(entreprise_id));
ALTER POLICY "lecture_taches_selon_permission" ON public.taches
  USING ((EXISTS ( SELECT 1
   FROM chantiers c
  WHERE ((c.id = taches.chantier_id) AND peut_consulter_chantier(c.entreprise_id, c.id)))));
ALTER POLICY "membres accèdent aux tâches" ON public.taches
  USING ((EXISTS ( SELECT 1
   FROM chantiers ch
  WHERE ((ch.id = taches.chantier_id) AND est_membre_actif(ch.entreprise_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM chantiers ch
  WHERE ((ch.id = taches.chantier_id) AND est_membre_actif(ch.entreprise_id)))));
ALTER POLICY "role_gestion_delete" ON public.taches
  USING ((EXISTS ( SELECT 1
   FROM chantiers p
  WHERE ((p.id = taches.chantier_id) AND a_permission(p.entreprise_id, 'gerer_chantiers'::text)))));
ALTER POLICY "role_gestion_insert" ON public.taches
  WITH CHECK ((EXISTS ( SELECT 1
   FROM chantiers p
  WHERE ((p.id = taches.chantier_id) AND a_permission(p.entreprise_id, 'gerer_chantiers'::text)))));
ALTER POLICY "role_gestion_update" ON public.taches
  USING ((EXISTS ( SELECT 1
   FROM chantiers p
  WHERE ((p.id = taches.chantier_id) AND a_permission(p.entreprise_id, 'gerer_chantiers'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM chantiers p
  WHERE ((p.id = taches.chantier_id) AND a_permission(p.entreprise_id, 'gerer_chantiers'::text)))));
select pg_temp.capturer('avant');

select is((select count(*)::int from vu a join vu b on b.phase = 'avant' and b.ctx = a.ctx and b.t = a.t
           where a.phase = 'apres' and a.ctx = 'admin_a' and (a.nb, a.empreinte) is distinct from (b.nb, b.empreinte)), 0,
  'E2 admin_a : lignes visibles identiques avant / après dans les 13 tables');
select is((select count(*)::int from vu a join vu b on b.phase = 'avant' and b.ctx = a.ctx and b.t = a.t
           where a.phase = 'apres' and a.ctx = 'ouvrier_a' and (a.nb, a.empreinte) is distinct from (b.nb, b.empreinte)), 0,
  'E2 ouvrier_a : lignes visibles identiques avant / après dans les 13 tables');
select is((select count(*)::int from vu a join vu b on b.phase = 'avant' and b.ctx = a.ctx and b.t = a.t
           where a.phase = 'apres' and a.ctx = 'chef_equipe_a' and (a.nb, a.empreinte) is distinct from (b.nb, b.empreinte)), 0,
  'E2 chef_equipe_a : lignes visibles identiques avant / après dans les 13 tables');
select is((select count(*)::int from vu a join vu b on b.phase = 'avant' and b.ctx = a.ctx and b.t = a.t
           where a.phase = 'apres' and a.ctx = 'conducteur_a' and (a.nb, a.empreinte) is distinct from (b.nb, b.empreinte)), 0,
  'E2 conducteur_a : lignes visibles identiques avant / après dans les 13 tables');
select is((select count(*)::int from vu a join vu b on b.phase = 'avant' and b.ctx = a.ctx and b.t = a.t
           where a.phase = 'apres' and a.ctx = 'comptable_a' and (a.nb, a.empreinte) is distinct from (b.nb, b.empreinte)), 0,
  'E2 comptable_a : lignes visibles identiques avant / après dans les 13 tables');
select is((select count(*)::int from vu a join vu b on b.phase = 'avant' and b.ctx = a.ctx and b.t = a.t
           where a.phase = 'apres' and a.ctx = 'admin_b' and (a.nb, a.empreinte) is distinct from (b.nb, b.empreinte)), 0,
  'E2 admin_b : lignes visibles identiques avant / après dans les 13 tables');
select is((select count(*)::int from vu a join vu b on b.phase = 'avant' and b.ctx = a.ctx and b.t = a.t
           where a.phase = 'apres' and a.ctx = 'ouvrier_b' and (a.nb, a.empreinte) is distinct from (b.nb, b.empreinte)), 0,
  'E2 ouvrier_b : lignes visibles identiques avant / après dans les 13 tables');
select is((select count(*)::int from vu a join vu b on b.phase = 'avant' and b.ctx = a.ctx and b.t = a.t
           where a.phase = 'apres' and a.ctx = 'multi_a_ouvrier_b_comptable' and (a.nb, a.empreinte) is distinct from (b.nb, b.empreinte)), 0,
  'E2 multi_a_ouvrier_b_comptable : lignes visibles identiques avant / après dans les 13 tables');
select is((select count(*)::int from vu a join vu b on b.phase = 'avant' and b.ctx = a.ctx and b.t = a.t
           where a.phase = 'apres' and a.ctx = 'support_a_actif_c_termine' and (a.nb, a.empreinte) is distinct from (b.nb, b.empreinte)), 0,
  'E2 support_a_actif_c_termine : lignes visibles identiques avant / après dans les 13 tables');
select is((select count(*)::int from vu a join vu b on b.phase = 'avant' and b.ctx = a.ctx and b.t = a.t
           where a.phase = 'apres' and a.ctx = 'support_b_expire' and (a.nb, a.empreinte) is distinct from (b.nb, b.empreinte)), 0,
  'E2 support_b_expire : lignes visibles identiques avant / après dans les 13 tables');
select is((select count(*)::int from vu a join vu b on b.phase = 'avant' and b.ctx = a.ctx and b.t = a.t
           where a.phase = 'apres' and a.ctx = 'plateforme_sans_acces' and (a.nb, a.empreinte) is distinct from (b.nb, b.empreinte)), 0,
  'E2 plateforme_sans_acces : lignes visibles identiques avant / après dans les 13 tables');
select is((select count(*)::int from vu a join vu b on b.phase = 'avant' and b.ctx = a.ctx and b.t = a.t
           where a.phase = 'apres' and a.ctx = 'membre_d_suspendue' and (a.nb, a.empreinte) is distinct from (b.nb, b.empreinte)), 0,
  'E2 membre_d_suspendue : lignes visibles identiques avant / après dans les 13 tables');
select is((select count(*)::int from vu a join vu b on b.phase = 'avant' and b.ctx = a.ctx and b.t = a.t
           where a.phase = 'apres' and a.ctx = 'membre_e_essai_expire' and (a.nb, a.empreinte) is distinct from (b.nb, b.empreinte)), 0,
  'E2 membre_e_essai_expire : lignes visibles identiques avant / après dans les 13 tables');
select is((select count(*)::int from vu a join vu b on b.phase = 'avant' and b.ctx = a.ctx and b.t = a.t
           where a.phase = 'apres' and a.ctx = 'membre_f_suspension_globale' and (a.nb, a.empreinte) is distinct from (b.nb, b.empreinte)), 0,
  'E2 membre_f_suspension_globale : lignes visibles identiques avant / après dans les 13 tables');
select is((select count(*)::int from vu a join vu b on b.phase = 'avant' and b.ctx = a.ctx and b.t = a.t
           where a.phase = 'apres' and a.ctx = 'membre_g_suspension_future' and (a.nb, a.empreinte) is distinct from (b.nb, b.empreinte)), 0,
  'E2 membre_g_suspension_future : lignes visibles identiques avant / après dans les 13 tables');
select is((select count(*)::int from vu a join vu b on b.phase = 'avant' and b.ctx = a.ctx and b.t = a.t
           where a.phase = 'apres' and a.ctx = 'membre_a_en_pause' and (a.nb, a.empreinte) is distinct from (b.nb, b.empreinte)), 0,
  'E2 membre_a_en_pause : lignes visibles identiques avant / après dans les 13 tables');
select is((select count(*)::int from vu a join vu b on b.phase = 'avant' and b.ctx = a.ctx and b.t = a.t
           where a.phase = 'apres' and a.ctx = 'ancien_salarie_a' and (a.nb, a.empreinte) is distinct from (b.nb, b.empreinte)), 0,
  'E2 ancien_salarie_a : lignes visibles identiques avant / après dans les 13 tables');
select is((select count(*)::int from vu a join vu b on b.phase = 'avant' and b.ctx = a.ctx and b.t = a.t
           where a.phase = 'apres' and a.ctx = 'admin_a_session_revoquee' and (a.nb, a.empreinte) is distinct from (b.nb, b.empreinte)), 0,
  'E2 admin_a_session_revoquee : lignes visibles identiques avant / après dans les 13 tables');
select is((select count(*)::int from vu a join vu b on b.phase = 'avant' and b.ctx = a.ctx and b.t = a.t
           where a.phase = 'apres' and a.ctx = 'anonyme' and (a.nb, a.empreinte) is distinct from (b.nb, b.empreinte)), 0,
  'E2 anonyme : lignes visibles identiques avant / après dans les 13 tables');

-- E3 : témoins (le différentiel n'est pas vacuitaire).
create function pg_temp.nb(p_ctx text, p_t text) returns int language sql as $$
  select nb from vu where phase = 'apres' and ctx = p_ctx and t = p_t $$;
select ok(pg_temp.nb('admin_a', 'devis') >= 1 and pg_temp.nb('admin_a', 'factures') >= 1 and pg_temp.nb('admin_a', 'pointages') >= 2,
  'E3a admin A voit ses devis, factures et pointages');
select is((select count(*)::int from vu where phase = 'apres' and ctx in ('admin_a', 'admin_b', 'conducteur_a', 'support_a_actif_c_termine')
           and nb > 0 and t = 'clients'), 4, 'E3b clients visibles pour admin A, admin B, conducteur A et support');
select is(pg_temp.nb('multi_a_ouvrier_b_comptable', 'clients'), 0,
  'E3i multi-entreprise : aucun client (ni ouvrier A ni comptable B n''ont acces_clients)');
select ok(pg_temp.nb('multi_a_ouvrier_b_comptable', 'factures') = pg_temp.nb('admin_b', 'factures'),
  'E3c multi-entreprise : factures de B (comptable) seulement, aucune de A (ouvrier sans acces_factures)');
select ok(pg_temp.nb('ouvrier_a', 'chantiers') = 1 and pg_temp.nb('conducteur_a', 'chantiers') >= 2,
  'E3d chemin lent conservé : l''ouvrier A ne voit que son chantier assigné, le conducteur tous');
select is((select coalesce(sum(nb), 0)::int from vu where phase = 'apres' and ctx in ('plateforme_sans_acces', 'membre_d_suspendue',
           'membre_e_essai_expire', 'membre_f_suspension_globale', 'admin_a_session_revoquee', 'membre_a_en_pause', 'support_b_expire') and nb > 0), 0,
  'E3e plateforme sans accès, support expiré, suspendue, essai expiré, suspension globale, session révoquée, membre en pause : aucune ligne');
select ok(pg_temp.nb('membre_g_suspension_future', 'devis') = 1, 'E3f suspension seulement PRÉVUE : l''entreprise reste accessible');
select ok(pg_temp.nb('ouvrier_b', 'chantiers') = 2 and pg_temp.nb('chef_equipe_a', 'documents_chantier') = pg_temp.nb('ouvrier_a', 'documents_chantier') + 1,
  'E3j branches fines : affectation du jour ouvre le chantier (ouvrier B), document d''encadrement réservé au chef d''équipe');
select ok(pg_temp.nb('ancien_salarie_a', 'chantiers') = 0 and pg_temp.nb('ancien_salarie_a', 'pointages') = 0 and pg_temp.nb('ancien_salarie_a', 'affectations') = 0,
  'E3k fiche salarié sortie : aucun chantier, pointage ni affectation malgré équipe et affectation du jour');
select is((select count(*)::int from vu where phase = 'apres' and ctx = 'anonyme' and nb > 0), 0, 'E3g anonyme : aucune ligne');
select ok(pg_temp.nb('support_a_actif_c_termine', 'devis') = (select count(*)::int from devis where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  'E3h support : exactement les devis de A (accès actif), rien de C (accès terminé)');

-- E4 : écritures inter-tenant, sous les policies installées (réappliquées telles quelles).
do $$
declare r record;
begin
  for r in select * from pol_installees loop
    execute format('alter policy %I on public.%I', r.p, r.t)
      || coalesce(' using (' || r.q || ')', '') || coalesce(' with check (' || r.w || ')', '');
  end loop;
end $$;

create function pg_temp.lignes_touchees(p_sql text) returns int language plpgsql as $f$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $f$;
select pg_temp.endosser('20000000-0000-0000-0000-000000000001', '5e550000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$insert into public.devis (entreprise_id, client_id, statut) values ('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'brouillon')$$,
  '42501', null, 'E4a admin B ne peut pas créer un devis dans A');
select is(pg_temp.lignes_touchees($$update public.clients set nom = nom where entreprise_id = 'a0000000-0000-0000-0000-000000000001'$$), 0,
  'E4b admin B ne modifie aucun client de A');
select lives_ok($$insert into public.clients (entreprise_id, reference_interne, nom, type, statut) values ('b0000000-0000-0000-0000-000000000001', 'CTR_B_NEW', 'Nouveau B', 'particulier', 'actif')$$,
  'E4c admin B crée un client dans B');
select is(pg_temp.lignes_touchees($$delete from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001'$$), 0,
  'E4d admin B ne supprime aucune facture de A');
reset role;

select * from finish();
rollback;
