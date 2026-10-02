-- Train canonique V9 — données de l'ère V8 pour l'upgrade V8 → V9 (scripts/qualification/upgrade-v8-v9.sh).
-- Chargées APRÈS les jeux volumétriques des lots (finance-aggregates/seed.sql, gp-residual/seed.sql),
-- sur une base au train V8 (371) : ce que les migrations V9 rencontreront sur une base réelle.
--   1. factures BROUILLON de l'ère V8 (avec et sans lignes), rendues non modifiables par B4 en V8 ;
--   2. coordonnées bancaires chiffrées au format historique v1 (sans identifiant de clé), un chiffré
--      de démonstration illisible, et un ordre de virement figé v1 ;
--   3. compteurs de rate limit de l'ancienne politique (`auth:login`, 10 POST / 600 s par IP).
-- Valeurs factices uniquement (aucun IBAN réel : code banque 99999, chiffrés au format, non déchiffrables).
\set ON_ERROR_STOP 1
set session_replication_role = replica;

-- Tenant F1462 (finance-aggregates) : administrateur f1462a…01, client et chantier 1.
insert into public.factures (id, entreprise_id, numero, client_id, chantier_id, type, statut, date_emission, montant_ht, montant_tva, montant_ttc, montant_paye)
values ('f1462b90-0000-0000-0000-000000000001', 'f1462e00-0000-0000-0000-000000000001', null, 'f1462c00-0000-0000-0000-000000000001', null, 'simple', 'brouillon', date '2026-09-15', 1500, 300, 1800, 0),
       ('f1462b90-0000-0000-0000-000000000002', 'f1462e00-0000-0000-0000-000000000001', null, 'f1462c00-0000-0000-0000-000000000001', null, 'simple', 'brouillon', date '2026-09-16', 0, 0, 0, 0);
insert into public.lignes_factures (id, facture_id, entreprise_id, designation, quantite, prix_unitaire_ht, remise_ligne, taux_tva, ordre)
values ('f1462b91-0000-0000-0000-000000000001', 'f1462b90-0000-0000-0000-000000000001', 'f1462e00-0000-0000-0000-000000000001', 'Maçonnerie (ère V8)', 10, 100, 0, 20, 1),
       ('f1462b91-0000-0000-0000-000000000002', 'f1462b90-0000-0000-0000-000000000001', 'f1462e00-0000-0000-0000-000000000001', 'Enduit (ère V8)', 5, 100, 0, 20, 2);

-- Coordonnées bancaires v1 (salariés 1 et 2 du tenant F1462) + un chiffré de démonstration illisible.
insert into public.coordonnees_bancaires (id, entreprise_id, type_beneficiaire, employe_id, titulaire, iban_chiffre, iban_hash, iban_quatre_derniers, bic_chiffre)
values ('f1462b92-0000-0000-0000-000000000001', 'f1462e00-0000-0000-0000-000000000001', 'employe', 'f14627e0-0000-0000-0000-000000000001', 'Salarié V8 un',
        'v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB:Q0lQSEVSVEVYVEVfVjhfVU5fRkFDVElDRQ', repeat('a1', 32), '0189',
        'v1:CCCCCCCCCCCCCCCC:DDDDDDDDDDDDDDDDDDDDDD:QklDX1Y4X1VO'),
       ('f1462b92-0000-0000-0000-000000000002', 'f1462e00-0000-0000-0000-000000000001', 'employe', 'f14627e0-0000-0000-0000-000000000002', 'Salarié V8 deux',
        'DEMO_NON_DECHIFFRABLE_SALARIE_V8_DEUX_0000000000', repeat('b2', 32), '0277', null);

-- Compteurs de l'ancienne politique de connexion (clé IP seule), encore actifs.
insert into public.rate_limits_applicatifs (cle, identifiant_hash, fenetre_debut, expire_at, compteur)
values ('auth:login', repeat('c3', 32), date_trunc('hour', now()), now() + interval '1 hour', 7),
       ('auth:login', repeat('d4', 32), date_trunc('hour', now()) - interval '1 day', now() - interval '23 hours', 10);

set session_replication_role = origin;
