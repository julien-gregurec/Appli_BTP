-- Complément de jeu de données pour la qualification d'UPGRADE du train canonique V1 -> V2
-- (docs/qualification/ELSATIA_CANONICAL_TRAIN_V2_FINAL_CONVERGENCE.md §9).
--
-- À charger APRÈS supabase/production/seed_entreprise_pilote_btp.sql et
-- tests/e2e/fixtures/colors-pilote.sql, sur une base locale jetable à l'état V1
-- (328 migrations). Couvre ce que ces deux jeux ne peuplent pas : Boutique
-- (commande payée finalisée par la RPC du webhook + commande en attente),
-- entitlements entreprise/utilisateur et une demande de suppression RGPD en cours
-- (non échue).
--
-- Données FICTIVES. Réservé aux bases locales jetables : ne jamais exécuter sur
-- Preview ni Production.
\set ON_ERROR_STOP 1
begin;

do $seed$
declare
  v_ent uuid := (select id from public.entreprises where reference_interne = 'PILOTE-BTP-V1');
  v_user uuid;
begin
  if v_ent is null then
    raise exception 'Seed pilote absent : charger seed_entreprise_pilote_btp.sql avant ce complément';
  end if;
  select ue.utilisateur_id into v_user
    from public.utilisateurs_entreprises ue where ue.entreprise_id = v_ent order by ue.created_at limit 1;

  -- Boutique ------------------------------------------------------------------
  insert into public.boutique_produits (id, sku, nom, categorie, prix_ht, taux_tva, stock_disponible) values
    ('d0000000-0000-4000-8000-0000000000b1', 'SKU-UPG-1', 'Pochettes plastification A4', 'consommable_plastification', 25, 0.20, 40),
    ('d0000000-0000-4000-8000-0000000000b2', 'SKU-UPG-2', 'Badges chantier', 'consommable_plastification', 12, 0.20, 100);
  insert into public.boutique_commandes (id, entreprise_id, statut, montant_ht, montant_tva, montant_ttc, stripe_checkout_id) values
    ('c0000000-0000-4000-8000-0000000000b1', v_ent, 'en_attente_paiement', 75, 15, 90, 'cs_upgrade_1'),
    ('c0000000-0000-4000-8000-0000000000b2', v_ent, 'en_attente_paiement', 24, 4.8, 28.8, 'cs_upgrade_2');
  insert into public.boutique_lignes_commande (commande_id, produit_id, sku_snapshot, nom_snapshot, prix_unitaire_ht_snapshot, quantite, montant_ht) values
    ('c0000000-0000-4000-8000-0000000000b1', 'd0000000-0000-4000-8000-0000000000b1', 'SKU-UPG-1', 'Pochettes plastification A4', 25, 3, 75),
    ('c0000000-0000-4000-8000-0000000000b2', 'd0000000-0000-4000-8000-0000000000b2', 'SKU-UPG-2', 'Badges chantier', 12, 2, 24);

  -- Entitlements --------------------------------------------------------------
  insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source, valide_du)
  values (v_ent, 'colors', true, 'qualification_upgrade', now() - interval '30 days'),
         (v_ent, 'reserves', true, 'qualification_upgrade', now() - interval '30 days')
  on conflict do nothing;
  if v_user is not null then
    insert into public.entitlements_utilisateurs_elsatia (utilisateur_id, application_code, niveau, source)
    values (v_user, 'tools', 'pro', 'internal')
    on conflict do nothing;
  end if;

  -- FA-08 : pas de facture fabriquée ici. Une facture émise ne peut plus voir sa date
  -- d'échéance modifiée (verrouiller_facture_emise, 20260822000222) ; le seed pilote porte
  -- déjà une facture en_retard et deux envoyee à échéance future : l'upgrade ne doit
  -- changer AUCUN statut (seul le cron quotidien appelle marquer_factures_en_retard).

  -- RGPD : entreprise Colors B en préavis de suppression (échéance future : non purgeable).
  update public.entreprises
     set suppression_demandee_at = now() - interval '2 days',
         suppression_prevue_at = now() + interval '28 days'
   where id = 'e0000000-0000-4000-8000-00000000000b';
end $seed$;

-- Paiement Boutique : chemin réel du webhook (service_role), une seule finalisation.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select public.boutique_finaliser_commande_payee('c0000000-0000-4000-8000-0000000000b1'::uuid, 'cs_upgrade_1');
reset role;

commit;
