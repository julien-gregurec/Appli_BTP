-- Tenant réaliste pour la réconciliation RGPD × commandes fournisseurs (V1).
-- Rapport : docs/qualification/ELSATIA_RGPD_PURCHASE_ORDERS_RECONCILIATION_V1.md
-- À inclure APRÈS fixtures/isolation_multitenant.inc (entreprises A/B, admin-a, postes,
-- permissions). Indépendant des fixtures factures / contrats (combinable avec elles).
--
-- Tout le cycle de vie passe par les chemins applicatifs réels, sous l'identité de
-- l'administrateur du tenant A (auth.uid() = admin-a, permission gerer_achats) :
--   fournisseur avec contact, e-mail, téléphone, SIRET, notes ;
--   commande BROUILLON ;
--   commande ENVOYÉE puis CONFIRMÉE (notes internes avec un numéro de téléphone) ;
--   commande REÇUE (réception complète par enregistrer_reception_commande, clé d'idempotence) ;
--   commande REÇUE PARTIELLEMENT ;
--   commande ANNULÉE ;
--   facture fournisseur (depenses_fournisseurs, RETAIN) rattachée à la commande reçue,
--   règlement partiel (reglements_fournisseurs) ;
--   signature interne d'un salarié sur la commande reçue (signatures_documents, RETAIN)
--   et son image dans Storage ;
--   entrée de stock (mouvements_stock) rattachée à une ligne de la commande reçue partiellement.
-- Plus le même fournisseur / une commande confirmée côté tenant B (isolation).
--
-- Identifiants fixes (préfixe d...) pour des diagnostics reproductibles.
set local elsatia.capacite_personnes_bypass = 'on';

insert into storage.objects (id, bucket_id, name, metadata) values
  ('d8000000-0000-0000-0000-000000000001', 'documents-employes',
   'a0000000-0000-0000-0000-000000000001/signatures/commande-d3000000-0003.png', '{"mimetype":"image/png"}')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into public.fournisseurs (id, entreprise_id, reference, nom, contact_nom, email, telephone, adresse, code_postal, ville, siret, notes)
values ('d1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '',
        'Négoce Matériaux Rhin', 'Sophie Keller', 'sophie.keller@negoce-rhin.example.test', '0388112233',
        '5 quai des Bateliers', '67000', 'Strasbourg', '98765432100017',
        'Commerciale : Sophie Keller, portable 0612345678, préfère être appelée le matin.');

insert into public.articles_stock (id, entreprise_id, reference, designation, unite)
values ('d1100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'ART-RAIL', 'Rail R48', 'u');

-- 1. Brouillon.
select set_config('rgpd.cf_brouillon', public.creer_commande_fournisseur('a0000000-0000-0000-0000-000000000001',
  '{"fournisseur_id":"d1000000-0000-0000-0000-000000000001","notes":"Brouillon à compléter"}'::jsonb,
  '[{"designation":"Vis placo","quantite":10,"unite":"boîte","prix_unitaire_ht":8.5,"taux_tva":20,"ordre":1}]'::jsonb)::text, true);

-- 2. Envoyée puis confirmée par le fournisseur.
select set_config('rgpd.cf_confirmee', public.creer_commande_fournisseur('a0000000-0000-0000-0000-000000000001',
  jsonb_build_object('fournisseur_id', 'd1000000-0000-0000-0000-000000000001',
    'date_commande', (current_date - 30)::text, 'date_livraison_prevue', (current_date + 5)::text,
    'notes', 'Livrer chez M. Lefèvre, appeler au 0611223344 avant passage.'),
  '[{"designation":"Enduit de façade","description":"Sac 25 kg, teinte ton pierre","quantite":40,"unite":"sac","prix_unitaire_ht":14.2,"taux_tva":20,"ordre":1},
    {"designation":"Location échafaudage","quantite":1,"unite":"forfait","prix_unitaire_ht":350,"taux_tva":20,"ordre":2}]'::jsonb)::text, true);
select public.changer_statut_commande('a0000000-0000-0000-0000-000000000001', current_setting('rgpd.cf_confirmee')::uuid, 'envoyee');
select public.changer_statut_commande('a0000000-0000-0000-0000-000000000001', current_setting('rgpd.cf_confirmee')::uuid, 'confirmee');

-- 3. Reçue en totalité (réception applicative, clé d'idempotence).
select set_config('rgpd.cf_recue', public.creer_commande_fournisseur('a0000000-0000-0000-0000-000000000001',
  jsonb_build_object('fournisseur_id', 'd1000000-0000-0000-0000-000000000001', 'date_commande', (current_date - 45)::text,
    'notes', 'Suivi par Paul Martin.'),
  '[{"designation":"Plaque BA13","description":"2500 x 1200","quantite":60,"unite":"u","prix_unitaire_ht":7.9,"taux_tva":20,"ordre":1},
    {"designation":"Laine de verre 100 mm","quantite":12,"unite":"rouleau","prix_unitaire_ht":32,"taux_tva":5.5,"ordre":2}]'::jsonb)::text, true);
select public.changer_statut_commande('a0000000-0000-0000-0000-000000000001', current_setting('rgpd.cf_recue')::uuid, 'envoyee');
select public.enregistrer_reception_commande('a0000000-0000-0000-0000-000000000001', current_setting('rgpd.cf_recue')::uuid,
  (select jsonb_agg(jsonb_build_object('ligne_id', l.id, 'quantite_recue', l.quantite))
     from public.lignes_commande l where l.commande_id = current_setting('rgpd.cf_recue')::uuid),
  'd9000000-0000-0000-0000-000000000001');

-- 4. Reçue partiellement.
select set_config('rgpd.cf_partielle', public.creer_commande_fournisseur('a0000000-0000-0000-0000-000000000001',
  jsonb_build_object('fournisseur_id', 'd1000000-0000-0000-0000-000000000001', 'date_commande', (current_date - 10)::text),
  '[{"designation":"Rail R48","quantite":30,"unite":"u","prix_unitaire_ht":3.1,"taux_tva":20,"ordre":1},
    {"designation":"Montant M48","quantite":50,"unite":"u","prix_unitaire_ht":3.4,"taux_tva":20,"ordre":2}]'::jsonb)::text, true);
select public.changer_statut_commande('a0000000-0000-0000-0000-000000000001', current_setting('rgpd.cf_partielle')::uuid, 'envoyee');
select public.enregistrer_reception_commande('a0000000-0000-0000-0000-000000000001', current_setting('rgpd.cf_partielle')::uuid,
  (select jsonb_agg(jsonb_build_object('ligne_id', l.id, 'quantite_recue', case when l.ordre = 1 then 12 else 0 end))
     from public.lignes_commande l where l.commande_id = current_setting('rgpd.cf_partielle')::uuid),
  'd9000000-0000-0000-0000-000000000002');

-- 5. Annulée.
select set_config('rgpd.cf_annulee', public.creer_commande_fournisseur('a0000000-0000-0000-0000-000000000001',
  '{"fournisseur_id":"d1000000-0000-0000-0000-000000000001"}'::jsonb,
  '[{"designation":"Carrelage","quantite":20,"unite":"m2","prix_unitaire_ht":25,"taux_tva":20,"ordre":1}]'::jsonb)::text, true);
select public.changer_statut_commande('a0000000-0000-0000-0000-000000000001', current_setting('rgpd.cf_annulee')::uuid, 'envoyee');
select public.changer_statut_commande('a0000000-0000-0000-0000-000000000001', current_setting('rgpd.cf_annulee')::uuid, 'annulee');

-- Facture fournisseur rattachée à la commande reçue, puis règlement partiel.
insert into public.depenses_fournisseurs (id, entreprise_id, fournisseur_id, commande_id, numero_piece, categorie, date_piece, montant_ht, montant_tva, notes)
select 'd4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
       c.id, 'FAC-NMR-2026-0457', 'materiaux', current_date - 40, c.montant_ht, c.montant_tva, 'Réglée en deux fois'
  from public.commandes_fournisseurs c where c.id = current_setting('rgpd.cf_recue')::uuid;
insert into public.reglements_fournisseurs (id, entreprise_id, depense_id, montant, date, mode, reference)
values ('d4100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001',
        300, current_date - 35, 'virement', 'VIR-NMR-0457-1');

-- Entrée de stock rattachée à la commande reçue partiellement (réception par lot).
select public.enregistrer_reception_lot('a0000000-0000-0000-0000-000000000001',
  '[{"article_id":"d1100000-0000-0000-0000-000000000001","quantite":5}]'::jsonb,
  (select jsonb_agg(jsonb_build_object('ligne_commande_id', l.id, 'quantite', 5))
     from public.lignes_commande l where l.commande_id = current_setting('rgpd.cf_partielle')::uuid and l.ordre = 2),
  'Réception partielle Rail/Montant', 'd9000000-0000-0000-0000-000000000003');

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.email', '', true);
select set_config('request.jwt.claims', '', true);

-- Signature interne d'un salarié sur la commande reçue (écrite par l'API d'administration
-- dans l'application : hors RLS ici, comme la fixture contrats).
insert into public.signatures_documents (id, entreprise_id, employe_id, type_document, document_id, signature_storage_path,
                                         signature_sha256, document_sha256, nom_signataire, fonction_signataire)
values ('d3300000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
        'commande', current_setting('rgpd.cf_recue')::uuid,
        'a0000000-0000-0000-0000-000000000001/signatures/commande-d3000000-0003.png',
        repeat('c', 64), repeat('d', 64), 'Paul Martin', 'Conducteur de travaux');

-- Tenant B : fournisseur et commande confirmée, par son administrateur (doivent rester intacts).
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into public.fournisseurs (id, entreprise_id, reference, nom, email)
values ('d1000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-000000000001', '', 'Fournisseur B', 'contact@fournisseur-b.example.test');
select set_config('rgpd.cf_b', public.creer_commande_fournisseur('b0000000-0000-0000-0000-000000000001',
  '{"fournisseur_id":"d1000000-0000-0000-0000-0000000000b1"}'::jsonb,
  '[{"designation":"Ciment","quantite":10,"unite":"sac","prix_unitaire_ht":9,"taux_tva":20,"ordre":1}]'::jsonb)::text, true);
select public.changer_statut_commande('b0000000-0000-0000-0000-000000000001', current_setting('rgpd.cf_b')::uuid, 'envoyee');
select public.changer_statut_commande('b0000000-0000-0000-0000-000000000001', current_setting('rgpd.cf_b')::uuid, 'confirmee');
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
