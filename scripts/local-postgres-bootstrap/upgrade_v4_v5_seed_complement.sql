-- Train canonique V5 — complément du jeu d'upgrade V4 → V5 (scripts/qualification/upgrade-v4-v5.sh).
-- Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V5_CONVERGENCE_V1.md §10.
--
-- Chargé sur une base au train V4 (352 migrations, dernière 20260927100000) APRÈS le jeu V4
-- (fixtures, Réserves, pilote GP, Colors, compléments V1→V2, V2→V3, V3→V4, décor GP ↔ Réserves,
-- décor D-01 hôte H / intervenant S). Il pose l'état réel d'une base V4 sur les trois
-- domaines que V5 modifie :
--
--   1. Relevé & Métré Lots 2-4 : relevé partagé, chantier, bâtiment, 2 étages, zone, 2 pièces,
--      murs + équipement, 3 photos (lignes + objets Storage `tools-releves`), version figée —
--      c'est ce que la migration plan 2D (…0928 101) étend (colonne plan des éléments,
--      contrainte du journal, `tools_releve_creer_version` redéfinie).
--   2. Réserves : l'hôte H a émis 2 réserves attribuées à l'intervenant externe S ; S a déjà
--      agi (commentaire hors-ligne à clé d'origine), puis H a été SUSPENDU — sur V4, S pouvait
--      encore écrire (défaut corrigé par D-01, …0928 301). La réserve R2 est acceptée par S.
--   3. Stripe : l'entreprise « UPG4 annulé » (complément V3 → V4) porte 2 anciennes factures
--      d'abonnement de sa subscription terminée — isolement vérifié après réabonnement (…0928 201).
--
-- Base jetable uniquement ; jamais Preview ni Production.
\set ON_ERROR_STOP 1
begin;

-- ── 1. Relevé & Métré (tenant A de isolation_multitenant.inc, métreur 10…03) ────────────
insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source)
values ('a0000000-0000-0000-0000-000000000001', 'tools', true, 'upgrade-v4-v5')
on conflict (entreprise_id, application_code) do update set autorise = true;
insert into public.habilitations_applications_utilisateurs (entreprise_id, utilisateur_id, application_code, role_code, autorise)
values ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'tools', 'tools_releve_metreur', true)
on conflict (entreprise_id, utilisateur_id, application_code) do update set role_code = excluded.role_code, autorise = true;
insert into public.entitlements_utilisateurs_elsatia (utilisateur_id, application_code, niveau, capabilities, source)
select '10000000-0000-0000-0000-000000000003', 'tools', 'pro', array['releve-metre'], 'internal'
where not exists (select 1 from public.entitlements_utilisateurs_elsatia
                  where utilisateur_id = '10000000-0000-0000-0000-000000000003' and application_code = 'tools');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;

insert into public.tools_releves (id, entreprise_id, nom, chantier_nom) values
  ('f5000000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'UPG5 Relevé maison', 'Maison Kientzheim');
update public.tools_releves set visibilite = 'entreprise' where id = 'f5000000-0000-4000-8000-000000000001';
insert into public.tools_releves_chantiers (id, releve_id, nom) values
  ('f5100000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', 'Chantier Kientzheim');
insert into public.tools_releves_batiments (id, releve_id, chantier_id, nom) values
  ('f5200000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', 'f5100000-0000-4000-8000-000000000001', 'Maison');
insert into public.tools_releves_etages (id, releve_id, batiment_id, nom, niveau, type_niveau) values
  ('f5300000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', 'f5200000-0000-4000-8000-000000000001', 'RDC', 0, 'rdc'),
  ('f5300000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000001', 'f5200000-0000-4000-8000-000000000001', 'R+1', 1, 'etage');
insert into public.tools_releves_zones (id, releve_id, etage_id, nom, type) values
  ('f5400000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', 'f5300000-0000-4000-8000-000000000001', 'Logement', 'appartement');
insert into public.tools_releves_pieces (id, releve_id, etage_id, zone_id, nom, usage) values
  ('f5500000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', 'f5300000-0000-4000-8000-000000000001', 'f5400000-0000-4000-8000-000000000001', 'Séjour', 'sejour'),
  ('f5500000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000001', 'f5300000-0000-4000-8000-000000000001', null, 'Cuisine', 'cuisine');
insert into public.tools_releves_elements (id, releve_id, type, etage_id, piece_id, donnees) values
  ('f5600000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', 'mur', 'f5300000-0000-4000-8000-000000000001', 'f5500000-0000-4000-8000-000000000001',
   '{"a":{"x":0,"y":0},"b":{"x":5200,"y":0},"epaisseurMm":200,"hauteurMm":2500,"typeMur":"porteur"}'),
  ('f5600000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000001', 'mur', 'f5300000-0000-4000-8000-000000000001', 'f5500000-0000-4000-8000-000000000001',
   '{"a":{"x":5200,"y":0},"b":{"x":5200,"y":3800},"epaisseurMm":200,"hauteurMm":2500,"typeMur":"cloison"}'),
  ('f5600000-0000-4000-8000-000000000003', 'f5000000-0000-4000-8000-000000000001', 'equipement', 'f5300000-0000-4000-8000-000000000001', 'f5500000-0000-4000-8000-000000000001',
   '{"categorie":"electricite","position":{"x":150,"y":120},"libelle":"Tableau électrique"}');

insert into public.tools_releves_medias (id, releve_id, categorie, storage_path, miniature_storage_path, mime_type, taille_octets, metadata)
select ('f5700000-0000-4000-8000-00000000000' || n)::uuid, 'f5000000-0000-4000-8000-000000000001', 'photos',
       'a0000000-0000-0000-0000-000000000001/f5000000-0000-4000-8000-000000000001/photos/f5700000-0000-4000-8000-00000000000' || n || '.jpg',
       'a0000000-0000-0000-0000-000000000001/f5000000-0000-4000-8000-000000000001/photos/f5710000-0000-4000-8000-00000000000' || n || '.jpg',
       'image/jpeg', 850000,
       jsonb_build_object('source', 'import', 'priseLe', '2026-09-26T10:00:00+02:00', 'priseLeSource', 'exif',
         'orientation', 'paysage', 'orientationExif', 1, 'largeurPx', 3072, 'hauteurPx', 2304,
         'largeurOriginePx', 4032, 'hauteurOriginePx', 3024, 'tailleOrigineOctets', 4100000,
         'compressionQualite', 0.85, 'compressionCoteMaxPx', 3072,
         'empreinteSha256', repeat(lpad(to_hex(200 + n), 2, '0'), 32), 'gpsRetire', false, 'remplaceMediaId', null)
  from generate_series(1, 3) n;
insert into storage.objects (bucket_id, name, owner, metadata)
select 'tools-releves', p, auth.uid(), '{"size":850000}'
  from (select storage_path p from public.tools_releves_medias where releve_id = 'f5000000-0000-4000-8000-000000000001'
        union all
        select miniature_storage_path from public.tools_releves_medias where releve_id = 'f5000000-0000-4000-8000-000000000001') s;

select public.tools_releve_creer_version('f5000000-0000-4000-8000-000000000001', 'Relevé initial', 'initial');
reset role;

-- ── 2. Réserves : hôte H (décor prepare-reserves-suspension-hote.sql), intervenant S ───────
create temporary table _upg5_reserves (cle text primary key, id uuid) on commit drop;
grant all on _upg5_reserves to authenticated;
select set_config('request.jwt.claims', '{"sub":"a9000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'a9000000-0000-0000-0000-0000000000a1', true);
set local role authenticated;
insert into _upg5_reserves values
  ('R1', public.reserves_creer('e9000000-0000-0000-0000-000000000001', 'UPG5 R1 — Tuiles cassées', 'Constat de réception',
                               'haute', 'e9200000-0000-0000-0000-00000000005a'::uuid, null, null, null, false, null,
                               'f5a00000-0000-4000-8000-0000000000a1')),
  ('R2', public.reserves_creer('e9000000-0000-0000-0000-000000000001', 'UPG5 R2 — Gouttière désaxée', 'Constat de réception',
                               'normale', 'e9200000-0000-0000-0000-00000000005a'::uuid, null, null, null, false, null,
                               'f5a00000-0000-4000-8000-0000000000a2'));
reset role;

select set_config('request.jwt.claims', '{"sub":"c9000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'c9000000-0000-0000-0000-0000000000a1', true);
set local role authenticated;
select public.reserves_repondre_responsabilite((select id from _upg5_reserves where cle = 'R2'), true);
-- Mutation hors-ligne appliquée AVANT la suspension (clé d'origine f5b…01).
select public.reserves_commenter((select id from _upg5_reserves where cle = 'R1'), 'UPG5 : intervention prévue jeudi',
                                 null, 'f5b00000-0000-4000-8000-000000000001');
reset role;

-- H perd son abonnement (écriture serveur : aucune identité applicative). Sur V4, S pouvait
-- encore écrire : c'est l'état réel d'une base V4.
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
update public.entreprises set abonnement_statut = 'suspendu' where id = 'a9000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claims', '{"sub":"c9000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'c9000000-0000-0000-0000-0000000000a1', true);
set local role authenticated;
select public.reserves_commenter((select id from _upg5_reserves where cle = 'R1'), 'UPG5 : écrit après la suspension (permis sur V4)',
                                 null, 'f5b00000-0000-4000-8000-000000000002');
reset role;
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);

-- ── 3. Stripe : anciennes factures de la subscription terminée de « UPG4 annulé » ─────────
insert into public.factures_abonnement (entreprise_id, stripe_invoice_id, numero, periode_debut, periode_fin,
                                        montant_ht, montant_tva, montant_ttc, devise, statut, url_facture, payee_at, created_at) values
  ('a7400000-0000-4000-8000-000000000070', 'in_upg5_old_1', 'ELS-UPG5-0001', now() - interval '90 days', now() - interval '60 days',
   249, 49.8, 298.8, 'eur', 'paid', 'https://invoice.stripe.com/i/in_upg5_old_1', now() - interval '89 days', now() - interval '90 days'),
  ('a7400000-0000-4000-8000-000000000070', 'in_upg5_old_2', 'ELS-UPG5-0002', now() - interval '60 days', now() - interval '30 days',
   249, 49.8, 298.8, 'eur', 'open', 'https://invoice.stripe.com/i/in_upg5_old_2', null, now() - interval '60 days');

commit;
