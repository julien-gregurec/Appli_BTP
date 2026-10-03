-- Décor des sondes PostgREST de GP BUSINESS HARDENING V9.1 (base locale jetable).
-- Jeu d'isolation multitenant + devis remisé accepté, facture émise, pointages.
begin;
\ir ../../../supabase/tests/fixtures/isolation_multitenant.inc
update public.entreprises set horaires_journaliers = '{"1":7,"2":7,"3":7,"4":7,"5":7,"6":7,"7":7}'
 where id = 'a0000000-0000-0000-0000-000000000001';
update public.utilisateurs_entreprises set pointage_personnel_actif = true
 where entreprise_id = 'a0000000-0000-0000-0000-000000000001';
insert into public.employes_cout_horaire (entreprise_id, employe_id, cout_horaire) values
  ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 26.5),
  ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003', 41.5)
on conflict do nothing;
update public.pointages set cout_horaire_applique = 26.5 where id = 'a5000000-0000-0000-0000-000000000001';
update public.pointages set cout_horaire_applique = 60 where id = 'a5000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
-- Identifiants du décor, hors schéma exposé (lus par la sonde en superutilisateur).
create schema if not exists banc;
create table banc.ids (k text primary key, v uuid);
insert into banc.ids select 'd1', public.creer_devis_brouillon('a0000000-0000-0000-0000-000000000001',
  '{"client_id":"a3000000-0000-0000-0000-000000000001","chantier_id":"a4000000-0000-0000-0000-000000000001","remise_globale":3}'::jsonb,
  '[{"designation":"Peinture","type":"main_oeuvre","quantite":12.5,"unite":"m2","prix_unitaire_ht":33.33,"remise_ligne":5,"taux_tva":10,"ordre":1},
    {"designation":"Fourniture","type":"fourniture","quantite":3,"unite":"u","prix_unitaire_ht":1234.56,"remise_ligne":2.5,"taux_tva":20,"ordre":2},
    {"designation":"Isolation","type":"forfait","quantite":1,"unite":"u","prix_unitaire_ht":999.99,"remise_ligne":0,"taux_tva":5.5,"ordre":3}]'::jsonb);
update public.devis set statut = 'envoye' where id = (select v from banc.ids where k = 'd1');
update public.devis set statut = 'accepte' where id = (select v from banc.ids where k = 'd1');
-- Second devis accepté, non facturé : servira à la sonde de facturation (B16) et de refacturation (B34).
insert into banc.ids select 'd2', public.creer_devis_brouillon('a0000000-0000-0000-0000-000000000001',
  '{"client_id":"a3000000-0000-0000-0000-000000000001","chantier_id":"a4000000-0000-0000-0000-000000000002","remise_globale":3}'::jsonb,
  '[{"designation":"A","type":"forfait","quantite":10,"unite":"u","prix_unitaire_ht":1000,"remise_ligne":5,"taux_tva":20,"ordre":1}]'::jsonb);
update public.devis set statut = 'envoye' where id = (select v from banc.ids where k = 'd2');
update public.devis set statut = 'accepte' where id = (select v from banc.ids where k = 'd2');
-- Facture émise depuis D1 (identifiant fixe).
insert into banc.ids select 'f1', public.creer_facture_depuis_devis((select v from banc.ids where k = 'd1'), 'simple');
update public.factures set statut = 'envoyee' where id = (select v from banc.ids where k = 'f1');
commit;
