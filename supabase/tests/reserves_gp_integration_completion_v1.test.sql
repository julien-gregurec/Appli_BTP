-- ELSATIA-GP-RESERVES-INTEGRATION-COMPLETION-V1
--
-- Flux applicatif Gestion Pro ↔ Réserves (migration 20260927000402), au travers des SEULES
-- portes qu'un client atteint : RPC exposées à `authenticated`, tables sous RLS,
-- `storage.objects` sous policies. Rapport : docs/qualification/
-- ELSATIA_GP_RESERVES_INTEGRATION_COMPLETION_V1.md.
--
--   §1 GP → Réserves : création, champs, entreprises, contacts, plans, copie
--   §2 idempotence (10 synchronisations)       §6 permissions par profil
--   §3 propriété des champs, versions de plan   §7 suppression / archivage GP (R-04)
--   §4 rattachement d'un chantier existant      §8 cross-tenant A / B
--   §5 un contact n'est jamais un accès         §9 scénario complet et retour GP
--
-- Profils (fixture isolation_multitenant + rôles Réserves posés ici) :
--   manager       admin A (toutes permissions GP) + reserves_admin_organisation
--   conducteur    acces_chantiers, acces_clients, SANS acces_sous_traitants + responsable
--   chef chantier voir_chantiers_assignes, affecté au chantier 01 + reserves_responsable
--   salarié       ouvrier, voir_chantiers_assignes, affecté au chantier 01 + reserves_emetteur
--   dirigeant     toutes permissions GP, AUCUN rôle Réserves
--   invité        gérant de C (tenant tiers) rattaché comme entreprise intervenante

begin;
create extension if not exists pgtap with schema extensions;
select plan(106);

\ir fixtures/isolation_multitenant.inc

create function pg_temp.en_tant_que(p uuid) returns text language sql as $$
  select set_config('role','authenticated',true)
      || set_config('request.jwt.claim.sub',p::text,true)
      || set_config('request.jwt.claims', json_build_object('sub',p,'role','authenticated')::text, true)
$$;
create function pg_temp.en_service() returns text language sql as $$
  select set_config('role','postgres',true)
      || set_config('request.jwt.claim.sub','',true)
      || set_config('request.jwt.claims','',true)
$$;
create function pg_temp.r(n text) returns uuid language sql as $$ select current_setting('q.' || n)::uuid $$;
create function pg_temp.j(n text) returns jsonb language sql as $$ select current_setting('q.' || n)::jsonb $$;
-- Ce que fait le serveur Gestion Pro après la synchronisation : dépôt de chaque copie
-- sous le rôle courant (policies Storage de `reserves-plans`), puis confirmation.
create function pg_temp.copier_plans(p_rapport jsonb) returns integer language plpgsql as $$
declare v jsonb; n integer := 0;
begin
  for v in select * from jsonb_array_elements(p_rapport->'plans_a_copier') loop
    insert into storage.objects (bucket_id, name, metadata)
    values ('reserves-plans', v->>'destination_chemin', jsonb_build_object('mimetype', v->>'mime_type'))
    on conflict do nothing;
    perform public.reserves_confirmer_plan_gp((v->>'plan_id')::uuid, v->>'destination_chemin');
    n := n + 1;
  end loop;
  return n;
end $$;
create function pg_temp.sync(p uuid) returns jsonb language sql as $$
  select public.reserves_synchroniser_chantier_gp(p)
$$;

-- ── Décor ────────────────────────────────────────────────────────────────────
grant all on table storage.objects, storage.buckets to anon, authenticated, service_role;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000','c0000000-0000-0000-0000-0000000000a1','authenticated','authenticated','intervenant-c@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now())
on conflict (id) do nothing;
insert into public.utilisateurs (id, prenom, nom) values ('c0000000-0000-0000-0000-0000000000a1','Électricien','C')
on conflict (id) do nothing;
insert into public.entreprises (id, nom, code_adhesion) values ('c0000000-0000-0000-0000-000000000001','Entreprise Électricité C','ISOC0001')
on conflict (id) do nothing;
insert into public.postes (id, entreprise_id, nom) values ('c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','Gérant C')
on conflict (id) do nothing;
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut) values
  ('c0000000-0000-0000-0000-0000000000a1','c0000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','actif')
on conflict do nothing;
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select 'c0000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001', d.cle, true
from public.permissions_disponibles d on conflict do nothing;

insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source) values
  ('a0000000-0000-0000-0000-000000000001','reserves', true, 'test'),
  ('b0000000-0000-0000-0000-000000000001','reserves', true, 'test');
insert into public.habilitations_applications_utilisateurs (entreprise_id, utilisateur_id, application_code, role_code) values
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','reserves','reserves_responsable'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','reserves','reserves_responsable'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','reserves','reserves_emetteur'),
  ('b0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation');

-- Données Gestion Pro du chantier A01 : adresse, client et contacts, sous-traitants,
-- documents de chantier (plans visibles de tous, plan réservé aux gestionnaires, photo,
-- document bureautique classé plan — format non affichable).
update public.chantiers set reference_interne = 'CHA-A-001', adresse = '12 rue des Tanneurs', code_postal = '68000',
  ville = 'Colmar', date_debut_prevue = date '2026-09-01', date_fin_prevue = date '2026-12-15',
  description = 'Réhabilitation d''un immeuble de 12 logements'
where id = 'a4000000-0000-0000-0000-000000000001';
update public.clients set email = 'client-a@invalid.local', telephone = '0389000001' where id = 'a3000000-0000-0000-0000-000000000001';
insert into public.contacts_clients (id, client_id, nom, fonction, telephone, email) values
  ('a3100000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','Mme Syndic','Gestionnaire','0389000002','syndic-a@invalid.local'),
  ('a3100000-0000-0000-0000-000000000002','a3000000-0000-0000-0000-000000000001','M. Gardien',null,'0389000003',null);
insert into public.fournisseurs (id, entreprise_id, reference, nom, type_tiers, specialite, contact_nom, email, telephone) values
  -- L'e-mail du contact est celui d'un compte ELSATIA EXISTANT (gérant de C) : §5.
  ('ab100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','ST-A-001','Électricité Rhin','sous_traitant','Électricité','Paul Volt','intervenant-c@invalid.local','0600000001'),
  ('ab100000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','ST-A-002','Plomberie Ill','sous_traitant',null,null,'pas-un-email','0600000002'),
  ('ab100000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','ST-A-003','Toiture Annulée','sous_traitant','Couverture',null,null,null),
  ('bb100000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','ST-B-001','Secret B Maçonnerie','sous_traitant','Maçonnerie','Contact B','contact-b@invalid.local','0700000001');
insert into public.sous_traitants_chantiers (entreprise_id, fournisseur_id, chantier_id, mission, statut) values
  ('a0000000-0000-0000-0000-000000000001','ab100000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','Courants forts','en_cours'),
  ('a0000000-0000-0000-0000-000000000001','ab100000-0000-0000-0000-000000000002','a4000000-0000-0000-0000-000000000001','Sanitaires','prevue'),
  ('a0000000-0000-0000-0000-000000000001','ab100000-0000-0000-0000-000000000003','a4000000-0000-0000-0000-000000000001','Toiture','annulee'),
  ('b0000000-0000-0000-0000-000000000001','bb100000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','Gros œuvre','en_cours');
insert into public.documents_chantier (id, entreprise_id, chantier_id, nom, categorie, storage_path, mime_type, taille_octets, audience) values
  ('a7100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','Plan RDC','plan',
   'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000001/plan-rdc-v1.pdf','application/pdf',1000,'tous_affectes'),
  ('a7100000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','Plan étage (direction)','plan',
   'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000001/plan-etage-v1.png','image/png',2000,'gestionnaires'),
  ('a7100000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','Photo façade','photo_avant',
   'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000001/facade.jpg','image/jpeg',3000,'tous_affectes'),
  ('a7100000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','Carnet de plans.docx','plan',
   'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000001/carnet.docx',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',4000,'tous_affectes'),
  ('b7100000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','Plan secret B','plan',
   'b0000000-0000-0000-0000-000000000001/b4000000-0000-0000-0000-000000000001/plan-b.pdf','application/pdf',1000,'tous_affectes');
insert into storage.objects (bucket_id, name, metadata)
select 'chantier-documents', storage_path, jsonb_build_object('mimetype', mime_type)
from public.documents_chantier where id::text like 'a71%' or id::text like 'b71%';

-- ═════════════════════════════════════════════════════════════════════════════
-- §1 GP → RÉSERVES : PREMIÈRE SYNCHRONISATION (manager)
-- ═════════════════════════════════════════════════════════════════════════════
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select is(public.reserves_etat_chantier_gp('a4000000-0000-0000-0000-000000000001'),
  '{"lie": false, "chantier_reserves_id": null, "peut_synchroniser": true}'::jsonb,
  '1.01 avant synchronisation : bloc « non suivi », action proposée au manager');
select set_config('q.s1', pg_temp.sync('a4000000-0000-0000-0000-000000000001')::text, true);
select set_config('q.rc', pg_temp.j('s1')->>'chantier_reserves_id', true);
select ok((pg_temp.j('s1')->>'cree')::boolean and not (pg_temp.j('s1')->>'rattache')::boolean, '1.02 chantier Réserves créé');
select results_eq($$select source, chantier_gp_id, nom, reference, adresse, code_postal, ville, client, description,
    date_debut, date_fin_prevue from public.reserves_chantiers where id = pg_temp.r('rc')$$,
  $$values ('gestion_pro'::text, 'a4000000-0000-0000-0000-000000000001'::uuid, 'TEST_A_Chantier assigné'::text, 'CHA-A-001'::text,
    '12 rue des Tanneurs'::text, '68000'::text, 'Colmar'::text, 'TEST_A_Client secret'::text,
    'Réhabilitation d''un immeuble de 12 logements'::text, date '2026-09-01', date '2026-12-15')$$,
  '1.03 adresse, CP, ville, référence, client, description, dates transmis');
select ok((select entreprise_id = 'a0000000-0000-0000-0000-000000000001' and synchronise_at is not null
  from public.reserves_chantiers where id = pg_temp.r('rc')), '1.04 chantier au tenant du chantier GP, horodaté');
select results_eq($$select nom, corps_etat, email_contact, telephone_contact, source, statut, entreprise_intervenante_id
  from public.reserves_intervenants where chantier_id = pg_temp.r('rc') order by nom$$,
  $$values ('Plomberie Ill'::text, 'Sanitaires'::text, null::text, '0600000002'::text, 'gestion_pro'::text, 'invitee'::text, null::uuid),
           ('Électricité Rhin', 'Électricité', 'intervenant-c@invalid.local', '0600000001', 'gestion_pro', 'invitee', null)$$,
  '1.05 entreprises participantes reprises (spécialité, sinon mission ; e-mail invalide écarté), sans rattachement');
select is((select count(*)::int from public.reserves_intervenants where chantier_id = pg_temp.r('rc') and nom like 'Toiture%'), 0,
  '1.06 une affectation GP annulée n''est pas transmise');
select results_eq($$select role, nom, fonction, email, telephone from public.reserves_contacts
  where chantier_id = pg_temp.r('rc') order by role, nom$$,
  $$values ('client'::text, 'M. Gardien'::text, 'Contact client'::text, null::text, '0389000003'::text),
           ('client', 'Mme Syndic', 'Gestionnaire', 'syndic-a@invalid.local', '0389000002'),
           ('client', 'TEST_A_Client secret', 'Client', 'client-a@invalid.local', '0389000001'),
           ('entreprise', 'Paul Volt', 'Électricité Rhin', 'intervenant-c@invalid.local', '0600000001'),
           ('entreprise', 'Plomberie Ill', null, null, '0600000002')$$,
  '1.07 contacts du client et des entreprises transmis');
select ok((select intervenant_id = (select id from public.reserves_intervenants where chantier_id = pg_temp.r('rc') and nom = 'Électricité Rhin')
  from public.reserves_contacts where chantier_id = pg_temp.r('rc') and nom = 'Paul Volt'), '1.08 le contact d''entreprise est rattaché à sa fiche intervenant');
select results_eq($$select nom, mime_type, source, storage_path is null, gp_version from public.reserves_plans
  where chantier_id = pg_temp.r('rc') order by nom$$,
  $$values ('Plan RDC'::text, 'application/pdf'::text, 'gestion_pro'::text, true, null::int),
           ('Plan étage (direction)', 'image/png', 'gestion_pro', true, null)$$,
  '1.09 plans utilisables repris (photo et format bureautique écartés), en attente de copie');
select is(jsonb_array_length(pg_temp.j('s1')->'plans_a_copier'), 2, '1.10 deux copies de plan à effectuer');
select ok((select bool_and(v->>'destination_chemin' like 'a0000000-0000-0000-0000-000000000001/' || pg_temp.r('rc')::text || '/' || (v->>'plan_id') || '/%')
  from jsonb_array_elements(pg_temp.j('s1')->'plans_a_copier') v), '1.11 chemin de copie composé par la base : organisation/chantier/plan');
select throws_like($$select public.reserves_confirmer_plan_gp((pg_temp.j('s1')->'plans_a_copier'->0->>'plan_id')::uuid,
  pg_temp.j('s1')->'plans_a_copier'->0->>'destination_chemin')$$, '%Aucun document déposé%',
  '1.12 confirmation refusée tant que la copie n''est pas déposée');
select throws_like($$select public.reserves_confirmer_plan_gp((pg_temp.j('s1')->'plans_a_copier'->0->>'plan_id')::uuid,
  'a0000000-0000-0000-0000-000000000001/forge.pdf')$$, '%Aucune copie en attente%', '1.13 chemin non préparé par la synchronisation refusé');
select is(pg_temp.copier_plans(pg_temp.j('s1')), 2, '1.14 copies déposées sous RLS Storage et confirmées');
select results_eq($$select nom, gp_version, storage_path is not null, gp_copie_chemin is null, gp_empreinte from public.reserves_plans
  where chantier_id = pg_temp.r('rc') order by nom$$,
  $$values ('Plan RDC'::text, 1, true, true, 'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000001/plan-rdc-v1.pdf'::text),
           ('Plan étage (direction)', 1, true, true, 'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000001/plan-etage-v1.png')$$,
  '1.15 plans actifs : version 1, empreinte de la version GP copiée');
select lives_ok($$select public.reserves_confirmer_plan_gp((pg_temp.j('s1')->'plans_a_copier'->0->>'plan_id')::uuid,
  pg_temp.j('s1')->'plans_a_copier'->0->>'destination_chemin')$$, '1.16 rejeu d''une confirmation : idempotent');
select is((select gp_version from public.reserves_plans where id = (pg_temp.j('s1')->'plans_a_copier'->0->>'plan_id')::uuid), 1,
  '1.17 le rejeu ne crée pas de nouvelle version');

-- ═════════════════════════════════════════════════════════════════════════════
-- §2 IDEMPOTENCE : 10 SYNCHRONISATIONS
-- ═════════════════════════════════════════════════════════════════════════════
select set_config('q.habil_avant', (select count(*) from public.habilitations_applications_utilisateurs)::text, true);
do $$ begin for i in 1..10 loop perform set_config('q.s10', public.reserves_synchroniser_chantier_gp(
  'a4000000-0000-0000-0000-000000000001')::text, true); end loop; end $$;
select is((select count(*)::int from public.reserves_chantiers where chantier_gp_id = 'a4000000-0000-0000-0000-000000000001'), 1, '2.01 10 synchronisations : 1 chantier');
select is((select count(*)::int from public.reserves_intervenants where chantier_id = pg_temp.r('rc')), 2, '2.02 10 synchronisations : 2 entreprises');
select is((select count(*)::int from public.reserves_contacts where chantier_id = pg_temp.r('rc')), 5, '2.03 10 synchronisations : 5 contacts');
select is((select count(*)::int from public.reserves_plans where chantier_id = pg_temp.r('rc')), 2, '2.04 10 synchronisations : 2 plans');
select is((select count(*)::int from storage.objects where bucket_id = 'reserves-plans' and name like 'a0000000-0000-0000-0000-000000000001/' || pg_temp.r('rc')::text || '/%'), 2,
  '2.05 10 synchronisations : 2 fichiers de plan');
select ok(pg_temp.j('s10')->>'chantier_reserves_id' = pg_temp.r('rc')::text and not (pg_temp.j('s10')->>'cree')::boolean,
  '2.06 même chantier Réserves à chaque passe');
select is(pg_temp.j('s10')->'entreprises', '{"creees":0,"autorise":true,"inchangees":2,"rattachees":0,"mises_a_jour":0}'::jsonb,
  '2.07 rapport : entreprises inchangées');
select is(pg_temp.j('s10')->'contacts', '{"crees":0,"autorise":true,"inchanges":5,"mis_a_jour":0}'::jsonb, '2.08 rapport : contacts inchangés');
select is(pg_temp.j('s10')->'plans', '{"crees":0,"a_jour":2,"autorise":true,"conflits":0,"mis_a_jour":0}'::jsonb, '2.09 rapport : plans à jour');
select is(jsonb_array_length(pg_temp.j('s10')->'plans_a_copier'), 0, '2.10 aucune copie refaite');
select is((select count(*) from public.habilitations_applications_utilisateurs)::text, current_setting('q.habil_avant'),
  '2.11 aucune habilitation écrite par les synchronisations');
select is(public.reserves_importer_chantier_gp('a4000000-0000-0000-0000-000000000001'), pg_temp.r('rc'),
  '2.12 l''import historique (00268) retombe sur le même chantier');

-- ═════════════════════════════════════════════════════════════════════════════
-- §3 PROPRIÉTÉ DES CHAMPS ET VERSIONS DE PLAN
-- ═════════════════════════════════════════════════════════════════════════════
-- Réserves modifie l'adresse et l'e-mail d'une entreprise ; GP modifie ville et adresse.
update public.reserves_chantiers set adresse = '12 rue des Tanneurs — entrée B' where id = pg_temp.r('rc');
update public.reserves_intervenants set email_contact = 'chantier@elec-rhin.invalid' where chantier_id = pg_temp.r('rc') and nom = 'Électricité Rhin';
update public.reserves_contacts set telephone = '0611111111' where chantier_id = pg_temp.r('rc') and nom = 'Mme Syndic';
select pg_temp.en_service();
update public.chantiers set ville = 'Colmar Centre', adresse = '14 rue des Tanneurs' where id = 'a4000000-0000-0000-0000-000000000001';
update public.fournisseurs set email = 'nouveau@elec-rhin.invalid', telephone = '0600000009' where id = 'ab100000-0000-0000-0000-000000000001';
update public.contacts_clients set telephone = '0389999999', fonction = 'Syndic' where id = 'a3100000-0000-0000-0000-000000000001';
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select set_config('q.s3', pg_temp.sync('a4000000-0000-0000-0000-000000000001')::text, true);
select results_eq($$select adresse, ville from public.reserves_chantiers where id = pg_temp.r('rc')$$,
  $$values ('12 rue des Tanneurs — entrée B'::text, 'Colmar Centre'::text)$$,
  '3.01 champ modifié dans Réserves conservé ; champ intact mis à jour depuis GP');
select is(pg_temp.j('s3')->'champs_conserves', '["adresse"]'::jsonb, '3.02 le champ conservé est signalé au rapport');
select results_eq($$select email_contact, telephone_contact from public.reserves_intervenants
  where chantier_id = pg_temp.r('rc') and nom = 'Électricité Rhin'$$,
  $$values ('chantier@elec-rhin.invalid'::text, '0600000009'::text)$$, '3.03 entreprise : e-mail local conservé, téléphone GP repris');
select results_eq($$select telephone, fonction from public.reserves_contacts where chantier_id = pg_temp.r('rc') and nom = 'Mme Syndic'$$,
  $$values ('0611111111'::text, 'Syndic'::text)$$, '3.04 contact : téléphone local conservé, fonction GP reprise');
select is((select count(*)::int from public.reserves_contacts where chantier_id = pg_temp.r('rc')), 5, '3.05 aucune duplication après modification');

-- Plan RDC : une réserve y est localisée. Plan étage : intact. GP publie une v2 des deux.
select set_config('q.plan_rdc', (select id::text from public.reserves_plans where chantier_id = pg_temp.r('rc') and nom = 'Plan RDC'), true);
select set_config('q.plan_etage', (select id::text from public.reserves_plans where chantier_id = pg_temp.r('rc') and nom = 'Plan étage (direction)'), true);
select set_config('q.plan_rdc_fichier', (select storage_path from public.reserves_plans where id = pg_temp.r('plan_rdc')), true);
select set_config('q.plan_etage_fichier', (select storage_path from public.reserves_plans where id = pg_temp.r('plan_etage')), true);
select set_config('q.r_plan', public.reserves_creer(pg_temp.r('rc'), 'Prise non fixée', null, 'normale', null,
  pg_temp.r('plan_rdc'), 0.4, 0.6)::text, true);
select pg_temp.en_service();
update public.documents_chantier set storage_path = replace(storage_path, '-v1.', '-v2.') where id in
  ('a7100000-0000-0000-0000-000000000001','a7100000-0000-0000-0000-000000000002');
insert into storage.objects (bucket_id, name, metadata)
select 'chantier-documents', storage_path, '{}'::jsonb from public.documents_chantier
where id in ('a7100000-0000-0000-0000-000000000001','a7100000-0000-0000-0000-000000000002');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select set_config('q.s4', pg_temp.sync('a4000000-0000-0000-0000-000000000001')::text, true);
select is(pg_temp.j('s4')->'plans', '{"crees":0,"a_jour":0,"autorise":true,"conflits":1,"mis_a_jour":1}'::jsonb,
  '3.06 v2 GP : un plan à remplacer, un plan en conflit');
select ok((select gp_maj_disponible and storage_path = current_setting('q.plan_rdc_fichier') and gp_version = 1
  from public.reserves_plans where id = pg_temp.r('plan_rdc')),
  '3.07 plan portant une réserve : jamais remplacé, mise à jour seulement signalée');
select ok((select count(*) = 1 and bool_and((v->>'plan_id')::uuid = pg_temp.r('plan_etage')) from jsonb_array_elements(pg_temp.j('s4')->'plans_a_copier') v),
  '3.08 seule la copie du plan intact est demandée');
select ok((select storage_path = current_setting('q.plan_etage_fichier') and gp_version = 1 from public.reserves_plans where id = pg_temp.r('plan_etage')),
  '3.09 avant dépôt de la v2, l''ancien fichier reste actif (jamais de plan vide)');
select is(pg_temp.copier_plans(pg_temp.j('s4')), 1, '3.10 v2 déposée et confirmée');
select ok((select gp_version = 2 and storage_path <> current_setting('q.plan_etage_fichier') and not gp_maj_disponible
  and gp_empreinte like '%plan-etage-v2.png' from public.reserves_plans where id = pg_temp.r('plan_etage')), '3.11 plan intact : version 2 active');
select is((select count(*)::int from public.reserves where id = pg_temp.r('r_plan') and plan_id = pg_temp.r('plan_rdc')
  and position_x = 0.4), 1, '3.12 le repère de la réserve n''a pas bougé');
-- Modification locale d'un plan, puis nouvelle version GP : pas de remplacement.
update public.reserves_plans set nom = 'Plan étage — annoté' where id = pg_temp.r('plan_etage');
select ok((select modifie_localement_at is not null from public.reserves_plans where id = pg_temp.r('plan_etage')),
  '3.13 la modification locale d''un plan GP est tracée');
select pg_temp.en_service();
update public.documents_chantier set storage_path = replace(storage_path, '-v2.', '-v3.') where id = 'a7100000-0000-0000-0000-000000000002';
insert into storage.objects (bucket_id, name, metadata) select 'chantier-documents', storage_path, '{}'::jsonb
from public.documents_chantier where id = 'a7100000-0000-0000-0000-000000000002';
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select set_config('q.s5', pg_temp.sync('a4000000-0000-0000-0000-000000000001')::text, true);
select ok((select gp_version = 2 and gp_maj_disponible and nom = 'Plan étage — annoté' from public.reserves_plans where id = pg_temp.r('plan_etage'))
  and jsonb_array_length(pg_temp.j('s5')->'plans_a_copier') = 0, '3.14 plan modifié dans Réserves : jamais écrasé, v3 signalée');
select is((public.reserves_etat_chantier_gp('a4000000-0000-0000-0000-000000000001')->>'plans_maj_disponible')::int, 2,
  '3.15 la fiche GP sait que 2 plans ont une version plus récente');
-- Colonnes d'intégration : jamais en écriture directe.
select throws_like($$update public.reserves_plans set gp_version = 9 where id = pg_temp.r('plan_rdc')$$, '%non modifiable%',
  '3.16 PATCH de la version d''un plan refusé');
select throws_like($$update public.reserves_plans set gp_maj_disponible = false where id = pg_temp.r('plan_rdc')$$, '%non modifiable%',
  '3.17 PATCH effaçant le signalement refusé');
select throws_like($$update public.reserves_chantiers set chantier_gp_id = 'b4000000-0000-0000-0000-000000000001' where id = pg_temp.r('rc')$$,
  '%non modifiable%', '3.18 PATCH du lien GP d''un chantier refusé');
select throws_like($$insert into public.reserves_chantiers (entreprise_id, nom, source, chantier_gp_id) values
  ('a0000000-0000-0000-0000-000000000001', 'Forgé', 'gestion_pro', 'a4000000-0000-0000-0000-000000000002')$$, '%synchronisation%',
  '3.19 création directe d''un chantier « lié GP » refusée');
select throws_like($$update public.reserves_intervenants set fournisseur_gp_id = 'bb100000-0000-0000-0000-000000000001'
  where chantier_id = pg_temp.r('rc') and nom = 'Plomberie Ill'$$, '%non modifiable%', '3.20 PATCH de l''origine d''une entreprise refusé');
select throws_like($$update public.reserves_contacts set cle_gp = 'client:x' where chantier_id = pg_temp.r('rc') and nom = 'M. Gardien'$$,
  '%non modifiable%', '3.21 PATCH de l''origine d''un contact refusé');
select throws_like($$insert into public.reserves_plans (entreprise_id, chantier_id, nom, source, document_gp_id) values
  ('a0000000-0000-0000-0000-000000000001', pg_temp.r('rc'), 'Forgé', 'gestion_pro', 'b7100000-0000-0000-0000-000000000001')$$,
  '%synchronisation%', '3.22 création directe d''un plan « repris de GP » refusée');
-- Renommage GP qui heurterait un autre chantier Réserves : nom conservé.
insert into public.reserves_chantiers (entreprise_id, nom) values ('a0000000-0000-0000-0000-000000000001', 'Nom déjà pris');
select pg_temp.en_service();
update public.chantiers set nom = 'Nom déjà pris' where id = 'a4000000-0000-0000-0000-000000000001';
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select set_config('q.s6', pg_temp.sync('a4000000-0000-0000-0000-000000000001')::text, true);
select ok((select nom = 'TEST_A_Chantier assigné' from public.reserves_chantiers where id = pg_temp.r('rc'))
  and pg_temp.j('s6')->'champs_conserves' ? 'nom', '3.23 renommage GP en collision : nom Réserves conservé et signalé');
select pg_temp.en_service();
update public.chantiers set nom = 'TEST_A_Chantier assigné' where id = 'a4000000-0000-0000-0000-000000000001';

-- ═════════════════════════════════════════════════════════════════════════════
-- §4 RATTACHEMENT D'UN CHANTIER RÉSERVES EXISTANT
-- ═════════════════════════════════════════════════════════════════════════════
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
insert into public.reserves_chantiers (id, entreprise_id, nom, adresse) values
  ('e8000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','test_a_chantier NON assigné','Adresse saisie dans Réserves');
select public.reserves_creer('e8000000-0000-0000-0000-000000000002', 'Réserve saisie avant le lien');
select pg_temp.en_service();
update public.chantiers set ville = 'Sélestat' where id = 'a4000000-0000-0000-0000-000000000002';
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select set_config('q.s7', pg_temp.sync('a4000000-0000-0000-0000-000000000002')::text, true);
select ok((pg_temp.j('s7')->>'rattache')::boolean and pg_temp.j('s7')->>'chantier_reserves_id' = 'e8000000-0000-0000-0000-000000000002',
  '4.01 homonyme Réserves libre : rattaché, pas dupliqué');
select results_eq($$select source, chantier_gp_id, adresse, ville, (select count(*)::int from public.reserves r where r.chantier_id = c.id)
  from public.reserves_chantiers c where id = 'e8000000-0000-0000-0000-000000000002'$$,
  $$values ('gestion_pro'::text, 'a4000000-0000-0000-0000-000000000002'::uuid, 'Adresse saisie dans Réserves'::text, 'Sélestat'::text, 1)$$,
  '4.02 rattachement : valeurs Réserves conservées, champs vides complétés, réserves intactes');
select pg_temp.en_service();
insert into public.chantiers (id, entreprise_id, client_id, nom, statut, reference_interne) values
  ('a4000000-0000-0000-0000-0000000000a3','a0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','TEST_A_Chantier assigné','en_cours','CHA-A-003');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select set_config('q.s8', pg_temp.sync('a4000000-0000-0000-0000-0000000000a3')::text, true);
select ok((select nom = 'TEST_A_Chantier assigné (CHA-A-003)' and id <> pg_temp.r('rc') from public.reserves_chantiers
  where id = (pg_temp.j('s8')->>'chantier_reserves_id')::uuid), '4.03 homonyme déjà lié à un autre chantier GP : création distincte, suffixée');

-- ═════════════════════════════════════════════════════════════════════════════
-- §5 UN CONTACT N'EST JAMAIS UN ACCÈS
-- ═════════════════════════════════════════════════════════════════════════════
select is((select count(*)::int from public.reserves_intervenants where chantier_id = pg_temp.r('rc')
  and (entreprise_intervenante_id is not null or statut <> 'invitee')), 0,
  '5.01 aucune entreprise reprise n''est rattachée à un tenant ni activée');
select pg_temp.en_service();
select is((select count(*)::int from public.habilitations_applications_utilisateurs where utilisateur_id = 'c0000000-0000-0000-0000-0000000000a1'), 0,
  '5.02 le compte ELSATIA dont l''e-mail est celui d''un contact n''a reçu aucune habilitation');
select is((select count(*)::int from public.acces_applications_entreprises where entreprise_id = 'c0000000-0000-0000-0000-000000000001'), 0,
  '5.03 son organisation n''a reçu aucun accès applicatif');
select pg_temp.en_tant_que('c0000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.reserves_chantiers) + (select count(*)::int from public.reserves_contacts)
  + (select count(*)::int from public.reserves_intervenants) + (select count(*)::int from public.reserves_plans), 0,
  '5.04 ce compte ne voit rien du chantier');
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'reserves_contacts'
  and column_name in ('utilisateur_id','entreprise_intervenante_id','user_id')), 0, '5.05 un contact n''a aucune colonne d''identité de compte');

-- ═════════════════════════════════════════════════════════════════════════════
-- §6 PERMISSIONS PAR PROFIL
-- ═════════════════════════════════════════════════════════════════════════════
-- Sans entitlement Réserves (organisation) : pas de bloc, pas de synchronisation.
select pg_temp.en_service();
update public.acces_applications_entreprises set autorise = false where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'reserves';
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select is(public.reserves_etat_chantier_gp('a4000000-0000-0000-0000-000000000001'), null, '6.01 sans entitlement Réserves : aucun bloc');
select throws_like($$select public.reserves_synchroniser_chantier_gp('a4000000-0000-0000-0000-000000000001')$$, '%non autorisée côté Réserves%',
  '6.02 sans entitlement Réserves : synchronisation refusée');
select pg_temp.en_service();
update public.acces_applications_entreprises set autorise = true where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'reserves';
-- Manager.
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select ok((public.reserves_etat_chantier_gp('a4000000-0000-0000-0000-000000000001')->>'peut_synchroniser')::boolean, '6.03 manager : bloc et synchronisation');
-- Dirigeant : toutes les permissions GP, aucun rôle Réserves.
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000006');
select is(public.reserves_etat_chantier_gp('a4000000-0000-0000-0000-000000000001'), null, '6.04 dirigeant GP sans rôle Réserves : aucun bloc (aucun droit déduit de GP)');
select throws_like($$select public.reserves_synchroniser_chantier_gp('a4000000-0000-0000-0000-000000000001')$$, '%non autorisée côté Réserves%',
  '6.05 dirigeant GP sans rôle Réserves : synchronisation refusée');
-- Conducteur : accès chantiers et clients, pas aux sous-traitants.
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000004');
select set_config('q.s9', pg_temp.sync('a4000000-0000-0000-0000-000000000001')::text, true);
select ok(not (pg_temp.j('s9')->'entreprises'->>'autorise')::boolean and (pg_temp.j('s9')->'entreprises'->>'creees')::int = 0,
  '6.06 conducteur sans accès sous-traitants : entreprises non transmises par lui');
select is((select count(*)::int from public.reserves_intervenants where chantier_id = pg_temp.r('rc')), 2,
  '6.07 … et celles déjà reprises ne sont pas retirées');
-- Chef de chantier : affecté au chantier 01, pas au 02 ; rôle Réserves responsable.
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000003');
select ok(public.reserves_etat_chantier_gp('a4000000-0000-0000-0000-000000000001') is not null, '6.08 chef de chantier : bloc sur son chantier');
select is(public.reserves_etat_chantier_gp('a4000000-0000-0000-0000-000000000002'), null, '6.09 chef de chantier : aucun bloc sur un chantier GP non consultable');
select lives_ok($$select public.reserves_synchroniser_chantier_gp('a4000000-0000-0000-0000-000000000001')$$, '6.10 chef de chantier : synchronise son chantier');
select throws_like($$select public.reserves_synchroniser_chantier_gp('a4000000-0000-0000-0000-000000000002')$$, '%non autorisée côté Gestion Pro%',
  '6.11 chef de chantier : chantier non affecté refusé côté GP');
select pg_temp.en_service();
insert into public.documents_chantier (id, entreprise_id, chantier_id, nom, categorie, storage_path, mime_type, taille_octets, audience) values
  ('a7100000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','Plan réseaux (direction)','plan',
   'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000001/reseaux.pdf','application/pdf',1000,'gestionnaires');
insert into storage.objects (bucket_id, name, metadata) values
  ('chantier-documents','a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000001/reseaux.pdf','{}');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000003');
select set_config('q.s11', pg_temp.sync('a4000000-0000-0000-0000-000000000001')::text, true);
select ok((pg_temp.j('s11')->'plans'->>'crees')::int = 0 and not exists (select 1 from public.reserves_plans
  where document_gp_id = 'a7100000-0000-0000-0000-000000000005'), '6.12 chef de chantier : un plan GP qu''il ne voit pas n''est pas transmis');
-- Simple salarié : émetteur Réserves, affecté au chantier 01.
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000002');
select ok(public.reserves_etat_chantier_gp('a4000000-0000-0000-0000-000000000001') ? 'total'
  and not (public.reserves_etat_chantier_gp('a4000000-0000-0000-0000-000000000001')->>'peut_synchroniser')::boolean,
  '6.13 salarié : lit les compteurs, sans action de synchronisation');
select throws_like($$select public.reserves_synchroniser_chantier_gp('a4000000-0000-0000-0000-000000000001')$$, '%non autorisée côté Réserves%',
  '6.14 salarié : synchronisation refusée');
select throws_like($$select public.reserves_confirmer_plan_gp(pg_temp.r('plan_etage'), 'x')$$, '%non autorisée%', '6.15 salarié : confirmation de plan refusée');
select is((select count(*)::int from public.reserves_contacts where chantier_id = pg_temp.r('rc')), 5,
  '6.16 salarié (rôle Réserves « voir ») : lit l''annuaire de son organisation');
select throws_like($$insert into public.reserves_contacts (entreprise_id, chantier_id, nom) values
  ('a0000000-0000-0000-0000-000000000001', pg_temp.r('rc'), 'Ajout salarié')$$, '%row-level security%', '6.17 salarié : ne modifie pas l''annuaire');
-- Le manager, lui, le complète à la main (contact propre à Réserves).
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select lives_ok($$insert into public.reserves_contacts (entreprise_id, chantier_id, nom, role) values
  ('a0000000-0000-0000-0000-000000000001', pg_temp.r('rc'), 'Contrôleur technique', 'autre')$$, '6.18 manager : ajoute un contact propre à Réserves');
-- Invité externe : C est désigné puis rejoint sur l'entreprise « Électricité Rhin ».
select set_config('q.int_elec', (select id::text from public.reserves_intervenants where chantier_id = pg_temp.r('rc') and nom = 'Électricité Rhin'), true);
select public.reserves_designer_entreprise_intervenante(pg_temp.r('int_elec'), 'c0000000-0000-0000-0000-000000000001');
select pg_temp.en_tant_que('c0000000-0000-0000-0000-0000000000a1');
select public.reserves_rejoindre_intervention(pg_temp.r('int_elec'));
select is(public.reserves_etat_chantier_gp('a4000000-0000-0000-0000-000000000001'), null, '6.19 invité externe : aucun bloc GP');
select throws_like($$select public.reserves_synchroniser_chantier_gp('a4000000-0000-0000-0000-000000000001')$$, '%non autorisée%',
  '6.20 invité externe : synchronisation refusée');
select is((select count(*)::int from public.reserves_contacts), 0, '6.21 invité externe : ne lit pas l''annuaire du chantier hôte');
select is((select count(*)::int from public.reserves_intervenants), 1, '6.22 invité externe : ne voit que sa propre fiche intervenant');

-- ═════════════════════════════════════════════════════════════════════════════
-- §7 SUPPRESSION / ARCHIVAGE CÔTÉ GESTION PRO (contrat R-04)
-- ═════════════════════════════════════════════════════════════════════════════
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
update public.chantiers set statut = 'archive' where id = 'a4000000-0000-0000-0000-000000000001';
select ok(public.reserves_etat_chantier_gp('a4000000-0000-0000-0000-000000000001') ? 'total', '7.01 chantier GP archivé : le bloc reste lisible');
select lives_ok($$select public.reserves_synchroniser_chantier_gp('a4000000-0000-0000-0000-000000000001')$$, '7.02 chantier GP archivé : synchronisation possible');
delete from public.documents_chantier where id = 'a7100000-0000-0000-0000-000000000002';
delete from public.sous_traitants_chantiers where fournisseur_id = 'ab100000-0000-0000-0000-000000000002';
select lives_ok($$select public.reserves_synchroniser_chantier_gp('a4000000-0000-0000-0000-000000000001')$$,
  '7.03 document et affectation supprimés côté GP : synchronisation sans erreur');
select ok((select storage_path is not null from public.reserves_plans where id = pg_temp.r('plan_etage'))
  and (select count(*) = 2 from public.reserves_intervenants where chantier_id = pg_temp.r('rc'))
  and (select count(*) = 1 from public.reserves_plans where document_gp_id = 'a7100000-0000-0000-0000-000000000005'),
  '7.04 plan et entreprise supprimés côté GP restent dans Réserves ; le plan « direction » est repris par le manager qui le voit');
-- Chantier GP éphémère complet (plan, entreprise, contacts), supprimé par un gestionnaire GP.
select pg_temp.en_service();
insert into public.chantiers (id, entreprise_id, client_id, nom, statut) values
  ('a4000000-0000-0000-0000-0000000000f8','a0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','QUALIF_GP_à_supprimer','en_cours');
insert into public.sous_traitants_chantiers (entreprise_id, fournisseur_id, chantier_id, mission, statut) values
  ('a0000000-0000-0000-0000-000000000001','ab100000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-0000000000f8','Courants faibles','en_cours');
insert into public.documents_chantier (id, entreprise_id, chantier_id, nom, categorie, storage_path, mime_type, taille_octets, audience) values
  ('a7100000-0000-0000-0000-0000000000f8','a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-0000000000f8','Plan éphémère','plan',
   'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-0000000000f8/plan.pdf','application/pdf',1000,'tous_affectes');
insert into storage.objects (bucket_id, name, metadata) values
  ('chantier-documents','a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-0000000000f8/plan.pdf','{}');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select set_config('q.s12', pg_temp.sync('a4000000-0000-0000-0000-0000000000f8')::text, true);
select set_config('q.rc_eph', pg_temp.j('s12')->>'chantier_reserves_id', true);
select pg_temp.copier_plans(pg_temp.j('s12'));
select public.reserves_creer(pg_temp.r('rc_eph'), 'Réserve sur chantier GP supprimé');
select lives_ok($$delete from public.chantiers where id = 'a4000000-0000-0000-0000-0000000000f8'$$,
  '7.05 un gestionnaire GP supprime un chantier synchronisé (Réserves ne bloque pas)');
select results_eq($$select source, chantier_gp_id,
    (select count(*)::int from public.reserves r where r.chantier_id = c.id),
    (select count(*)::int from public.reserves_plans p where p.chantier_id = c.id and p.storage_path is not null),
    (select count(*)::int from public.reserves_intervenants i where i.chantier_id = c.id),
    (select count(*)::int from public.reserves_contacts k where k.chantier_id = c.id)
  from public.reserves_chantiers c where id = pg_temp.r('rc_eph')$$,
  $$values ('reserves'::text, null::uuid, 1, 1, 1, 4)$$,
  '7.06 chantier Réserves détaché (R-04) : réserves, plan, entreprise et contacts intacts');
select is(public.reserves_etat_chantier_gp('a4000000-0000-0000-0000-0000000000f8'), null, '7.07 chantier GP disparu : aucun état');

-- ═════════════════════════════════════════════════════════════════════════════
-- §8 CROSS-TENANT A / B
-- ═════════════════════════════════════════════════════════════════════════════
select pg_temp.en_tant_que('20000000-0000-0000-0000-000000000001');
select throws_like($$select public.reserves_synchroniser_chantier_gp('a4000000-0000-0000-0000-000000000001')$$, '%non autorisée%',
  '8.01 B ne synchronise pas un chantier GP de A');
select is(public.reserves_etat_chantier_gp('a4000000-0000-0000-0000-000000000001'), null, '8.02 B n''obtient aucun état d''un chantier de A');
select set_config('q.sb', pg_temp.sync('b4000000-0000-0000-0000-000000000001')::text, true);
select set_config('q.rcb', pg_temp.j('sb')->>'chantier_reserves_id', true);
select is(pg_temp.copier_plans(pg_temp.j('sb')), 1, '8.03 B synchronise son propre chantier (1 plan)');
select ok((select bool_and(entreprise_id = 'b0000000-0000-0000-0000-000000000001') from (
    select entreprise_id from public.reserves_chantiers where id = pg_temp.r('rcb')
    union all select entreprise_id from public.reserves_intervenants where chantier_id = pg_temp.r('rcb')
    union all select entreprise_id from public.reserves_contacts where chantier_id = pg_temp.r('rcb')
    union all select entreprise_id from public.reserves_plans where chantier_id = pg_temp.r('rcb')) x),
  '8.04 tout ce que B synchronise appartient à B');
select results_eq($$select (select count(*)::int from public.reserves_intervenants), (select count(*)::int from public.reserves_contacts),
  (select count(*)::int from public.reserves_plans)$$, $$values (1, 1, 1)$$,
  '8.05 B ne voit que ses entreprises, contacts et plans');
select is((select count(*)::int from public.reserves_contacts where email like '%-a@%' or nom like 'TEST_A%' or nom = 'Paul Volt'), 0,
  '8.06 aucun contact de A chez B');
select is((select count(*)::int from storage.objects where bucket_id = 'reserves-plans'
  and name like 'a0000000-0000-0000-0000-000000000001/%'), 0, '8.07 B ne lit aucun fichier de plan de A');
select throws_like($$select public.reserves_confirmer_plan_gp(pg_temp.r('plan_etage'), 'x')$$, '%non autorisée%', '8.08 B ne confirme pas un plan de A');
create function pg_temp.patcher_contacts_a() returns integer language plpgsql as $$
declare n integer; begin
  update public.reserves_contacts set telephone = '0000' where chantier_id = pg_temp.r('rc');
  get diagnostics n = row_count; return n; end $$;
select is(pg_temp.patcher_contacts_a(), 0, '8.09 B ne modifie aucun contact de A');
select throws_like($$insert into public.reserves_contacts (entreprise_id, chantier_id, nom) values
  ('b0000000-0000-0000-0000-000000000001', pg_temp.r('rc'), 'Intrus')$$, '%hors de l''organisation%',
  '8.10 B ne rattache pas un contact à un chantier de A');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.reserves_contacts where entreprise_id = 'b0000000-0000-0000-0000-000000000001')
  + (select count(*)::int from public.reserves_plans where entreprise_id = 'b0000000-0000-0000-0000-000000000001')
  + (select count(*)::int from public.reserves_intervenants where entreprise_id = 'b0000000-0000-0000-0000-000000000001'), 0,
  '8.11 A ne voit rien de B');
select is((select count(*)::int from public.reserves_plans where document_gp_id::text like 'b7%')
  + (select count(*)::int from public.reserves_intervenants where fournisseur_gp_id::text like 'bb%'), 0,
  '8.12 aucune origine GP de B chez A');

-- ═════════════════════════════════════════════════════════════════════════════
-- §9 SCÉNARIO COMPLET : GP → SYNCHRO → RÉSERVE → ASSIGNATION → LEVÉE → RETOUR GP
-- ═════════════════════════════════════════════════════════════════════════════
select pg_temp.en_service();
update public.chantiers set statut = 'en_cours' where id = 'a4000000-0000-0000-0000-000000000001';
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
create temp table etats (etape text, total int, ouvertes int, en_cours int, attente int, levees int);
grant all on etats to authenticated;
create function pg_temp.noter(p text) returns void language sql as $$
  insert into etats select p, (e->>'total')::int, (e->>'ouvertes')::int, (e->>'en_cours')::int, (e->>'attente_levee')::int, (e->>'levees')::int
  from (select public.reserves_etat_chantier_gp('a4000000-0000-0000-0000-000000000001') e) x;
$$;
select pg_temp.noter('0 synchronisé');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000002'); -- salarié émetteur
select set_config('q.r9', public.reserves_creer(pg_temp.r('rc'), 'Tableau électrique non étiqueté')::text, true);
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001'); select pg_temp.noter('1 création');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000002');
select public.reserves_assigner(pg_temp.r('r9'), pg_temp.r('int_elec'));
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001'); select pg_temp.noter('2 assignation');
select pg_temp.en_tant_que('c0000000-0000-0000-0000-0000000000a1');
select public.reserves_repondre_responsabilite(pg_temp.r('r9'), true);
select public.reserves_demander_levee(pg_temp.r('r9'), 'Étiquetage fait');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001'); select pg_temp.noter('3 demande de levée');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000004'); -- responsable
select public.reserves_statuer_levee(pg_temp.r('r9'), true, 'Conforme');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001'); select pg_temp.noter('4 levée');
select results_eq($$select etape, total, ouvertes, en_cours, attente, levees from etats order by etape$$,
  $$values ('0 synchronisé'::text, 1, 1, 0, 0, 0), ('1 création', 2, 2, 0, 0, 0), ('2 assignation', 2, 1, 1, 0, 0),
           ('3 demande de levée', 2, 1, 0, 1, 0), ('4 levée', 2, 1, 0, 0, 1)$$,
  '9.01 résumé GP mis à jour à chaque étape (total, ouvertes, en cours, attente levée, levées)');
select ok((select (e->'statuts'->>'levee')::int = 1 and (e->'statuts'->>'emise')::int = 1
  and e->>'chantier_reserves_id' = pg_temp.r('rc')::text and (e->>'lie')::boolean
  from (select public.reserves_etat_chantier_gp('a4000000-0000-0000-0000-000000000001') e) x), '9.02 statuts détaillés et lien vers Réserves');
select ok(not (public.reserves_etat_chantier_gp('a4000000-0000-0000-0000-000000000001')::text ~ 'Tableau électrique|Électricité Rhin|Conforme'),
  '9.03 l''état GP n''expose ni titres, ni entreprises, ni motifs');
select is((select count(*)::int from public.reserves_resume_chantier_gp('a4000000-0000-0000-0000-000000000001')), 1,
  '9.04 le résumé historique (00268) reste servi');
select pg_temp.en_tant_que('c0000000-0000-0000-0000-0000000000a1');
select is((select statut from public.reserves where id = pg_temp.r('r9')), 'levee', '9.05 l''entreprise invitée voit sa réserve levée');

select * from finish();
rollback;
