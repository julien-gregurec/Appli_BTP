-- Complément de jeu de données pour la qualification d'UPGRADE du train canonique V3 -> V4
-- (docs/qualification/ELSATIA_CANONICAL_TRAIN_V4_PREVIEW_CANDIDATE.md §11).
--
-- À charger sur une base au train V3 (340 migrations, dernière 20260926000505), APRÈS le jeu
-- V2 -> V3 (fixtures RGPD, recette Réserves, seed pilote GP, Colors, compléments V1->V2 et
-- V2->V3). Ajoute ce que V4 transforme et qu'aucun de ces jeux ne peuple :
--   * Stripe : entreprises en essai à différents jours (0, 10, 29, expiré), converties, suspendues,
--     annulées (la contrainte V3 borne déjà l'essai à 30 jours), et un journal d'événements
--     d'abonnement (abonnement_evenements) déjà traités ;
--   * commandes fournisseurs ENGAGÉES écrites directement à leur statut (état réel d'une base
--     V3 : aucun verrou avant …506), avec lignes, dépenses et règlements ;
--   * historique d'affectations ;
--   * Storage : objets de plans et de photos (métadonnées) pour Réserves et GP.
-- Données FICTIVES. Réservé aux bases locales jetables : ne jamais exécuter sur Preview ni
-- Production.
\set ON_ERROR_STOP 1
begin;

-- Stripe : états d'essai ---------------------------------------------------------------
insert into public.entreprises (id, nom, code_adhesion, abonnement_statut, abonnement_essai_debut, abonnement_essai_fin, stripe_customer_id, stripe_subscription_id) values
  ('a7400000-0000-4000-8000-000000000000', 'UPG4 jour 0',     'UPG4J000', 'essai',  current_date,      current_date + 30, null, null),
  ('a7400000-0000-4000-8000-000000000010', 'UPG4 jour 10',    'UPG4J010', 'essai',  current_date - 10, current_date + 20, 'cus_upg4_10', null),
  ('a7400000-0000-4000-8000-000000000029', 'UPG4 jour 29',    'UPG4J029', 'essai',  current_date - 29, current_date + 1,  null, null),
  ('a7400000-0000-4000-8000-000000000040', 'UPG4 expiré',     'UPG4EXP1', 'essai',  current_date - 45, current_date - 15, null, null),
  ('a7400000-0000-4000-8000-000000000050', 'UPG4 converti',   'UPG4CNV1', 'actif',  current_date - 40, current_date - 12, 'cus_upg4_50', 'sub_upg4_50'),
  ('a7400000-0000-4000-8000-000000000060', 'UPG4 suspendu',   'UPG4SUS1', 'suspendu', current_date - 70, current_date - 40, 'cus_upg4_60', 'sub_upg4_60'),
  ('a7400000-0000-4000-8000-000000000070', 'UPG4 annulé',     'UPG4ANN1', 'annule', current_date - 60, current_date - 30, 'cus_upg4_70', 'sub_upg4_70');

insert into public.abonnement_evenements (entreprise_id, stripe_event_id, type, statut_resultant, payload, created_at) values
  ('a7400000-0000-4000-8000-000000000050', 'evt_upg4_0001', 'checkout.session.completed', 'actif',
   '{"object":"checkout.session","subscription":"sub_upg4_50"}', now() - interval '12 days'),
  ('a7400000-0000-4000-8000-000000000050', 'evt_upg4_0002', 'customer.subscription.updated', 'actif',
   '{"object":"subscription","id":"sub_upg4_50","status":"active"}', now() - interval '12 days' + interval '1 second'),
  ('a7400000-0000-4000-8000-000000000060', 'evt_upg4_0003', 'invoice.payment_failed', 'suspendu',
   '{"object":"invoice","subscription":"sub_upg4_60"}', now() - interval '40 days'),
  ('a7400000-0000-4000-8000-000000000070', 'evt_upg4_0004', 'customer.subscription.deleted', 'annule',
   '{"object":"subscription","id":"sub_upg4_70","status":"canceled"}', now() - interval '30 days');

-- Commandes fournisseurs engagées (état V3 : écrites directement à leur statut) -------------
do $cmd$
declare
  v_ent uuid := (select id from public.entreprises where reference_interne = 'PILOTE-BTP-V1');
  v_four uuid;
  v_chantier uuid;
  v_cmd uuid;
  v_dep uuid;
  v_statut text;
  i int;
begin
  if v_ent is null then
    raise exception 'Seed pilote absent : charger seed_entreprise_pilote_btp.sql avant ce complément';
  end if;
  select id into v_four from public.fournisseurs where entreprise_id = v_ent order by created_at, id limit 1;
  select id into v_chantier from public.chantiers where entreprise_id = v_ent order by created_at, id limit 1;
  for i in 1..6 loop
    v_statut := (array['envoyee','confirmee','recue_partiel','recue','annulee','recue'])[i];
    insert into public.commandes_fournisseurs (entreprise_id, numero, fournisseur_id, chantier_id, statut, date_commande, date_livraison_prevue, notes)
    values (v_ent, 'CMD-UPG4-' || lpad(i::text, 3, '0'), v_four, v_chantier, v_statut, current_date - 30 + i, current_date - 20 + i,
            '[UPG4] commande engagée avant V4')
    returning id into v_cmd;
    insert into public.lignes_commande (entreprise_id, commande_id, designation, quantite, unite, prix_unitaire_ht, taux_tva, quantite_recue, ordre)
    values (v_ent, v_cmd, 'UPG4 plaques BA13', 40, 'u', 7.5, 20, case v_statut when 'recue' then 40 when 'recue_partiel' then 15 else 0 end, 1),
           (v_ent, v_cmd, 'UPG4 rails 48', 25, 'u', 3.2, 20, case v_statut when 'recue' then 25 when 'recue_partiel' then 10 else 0 end, 2);
    if v_statut in ('recue', 'recue_partiel') then
      insert into public.depenses_fournisseurs (entreprise_id, fournisseur_id, chantier_id, commande_id, numero_piece, categorie, date_piece, date_echeance, montant_ht, montant_tva, notes)
      values (v_ent, v_four, v_chantier, v_cmd, 'ACH-UPG4-' || i, 'materiaux', current_date - 10, current_date + 20, 380, 76, '[UPG4] facture fournisseur')
      returning id into v_dep;
      insert into public.reglements_fournisseurs (entreprise_id, depense_id, montant, date, mode, reference)
      values (v_ent, v_dep, 456, current_date - 5, 'virement', 'RF-UPG4-' || i);
    end if;
  end loop;
end
$cmd$;

-- Storage : plans et photos (métadonnées seulement ; le binaire vit hors base) -------------
insert into storage.objects (id, bucket_id, name, metadata)
select gen_random_uuid(), b, n, jsonb_build_object('size', 20480, 'mimetype', m)
  from (values
    ('reserves-plans',  'upg4/plan-rdc.pdf',        'application/pdf'),
    ('reserves-photos', 'upg4/photo-reserve-1.jpg', 'image/jpeg'),
    ('reserves-photos', 'upg4/photo-reserve-2.jpg', 'image/jpeg')) v(b, n, m)
 where exists (select 1 from storage.buckets where id = v.b);

commit;
