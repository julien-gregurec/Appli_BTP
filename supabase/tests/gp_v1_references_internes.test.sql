-- =====================================================================================================
-- PREUVE pgTAP (intégrée au ledger le 2026-09-12, GP V1 lot 0) — ELSATIA-GP-V1-METIER, A-bis « références internes »
-- =====================================================================================================
-- Se joue sur une base jetable au ledger 280 à laquelle ont été appliquées, dans l'ordre,
-- gp-devis-wysiwyg-catalogue-ouvrages-v1.sql.proposed puis gp-v1-metier-references-internes.sql.proposed.
-- À placer dans supabase/tests (fixture en `fixtures/…`) le jour où la proposition est numérotée.
--
-- Acteurs (fixture isolation_multitenant) :
--   A dirigeant 10000000-…-0006 (tous droits)      A conducteur 10000000-…-0004 (clients, chantiers, devis)
--   A ouvrier   10000000-…-0002 (aucun module)     A comptable  10000000-…-0005 (factures, achats)
--   B dirigeant 20000000-…-0006
-- =====================================================================================================
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

\ir fixtures/isolation_multitenant.inc

create or replace function pg_temp.jwt(p_sub uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_sub::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
end $$;

create or replace function pg_temp.compteur(p_entreprise uuid, p_type text) returns integer language sql as $$
  select coalesce((select dernier_numero from public.compteurs_reference
                    where entreprise_id = p_entreprise and type = p_type), 0)
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- A. Générateurs historiques redéfinis : format conservé, saisie manuelle jamais réattribuée
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
select ok((select bool_and(reference_interne ~ '^CHA-[0-9]{4}-[0-9]{3}$') from public.chantiers
            where entreprise_id in ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001')),
  'générateur : les chantiers créés sans référence reçoivent CHA-AAAA-NNN, comme avant');
select is((select count(distinct reference_interne)::int from public.chantiers
            where entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 2,
  'générateur : deux chantiers, deux références distinctes');

create temp table t_cli as select pg_temp.compteur('a0000000-0000-0000-0000-000000000001', 'client') as n;
insert into public.clients (entreprise_id, nom, type, statut, reference_interne) values
  ('a0000000-0000-0000-0000-000000000001', 'PGTAP manuel', 'particulier', 'actif',
   format('CLI-%s', lpad(((select n from t_cli) + 1)::text, 4, '0')));
insert into public.clients (entreprise_id, nom, type, statut, reference_interne) values
  ('a0000000-0000-0000-0000-000000000001', 'PGTAP auto', 'particulier', 'actif', '   ');
select is((select reference_interne from public.clients where nom = 'PGTAP auto'),
  format('CLI-%s', lpad(((select n from t_cli) + 2)::text, 4, '0')),
  'générateur : la valeur saisie à la main est sautée, jamais réattribuée (défaut A5)');

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- B. Paramètres par entreprise
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.jwt('10000000-0000-0000-0000-000000000006');
select lives_ok($$insert into public.references_parametres (entreprise_id, entite, prefixe, largeur)
  values ('a0000000-0000-0000-0000-000000000001', 'article', 'PRD', 3)$$,
  'paramètres : le dirigeant choisit le préfixe PRD sur 3 chiffres pour les articles');
select lives_ok($$insert into public.prestations_catalogue (entreprise_id, designation, type, unite, prix_unitaire_ht, taux_tva)
  values ('a0000000-0000-0000-0000-000000000001', 'PGTAP auto article', 'fourniture', 'u', 1, 20)$$,
  'paramètres : article créé sans référence');
select matches((select reference_interne from public.prestations_catalogue where designation = 'PGTAP auto article'),
  '^PRD-[0-9]{3}$', 'paramètres : l''article reçoit PRD-NNN');
select throws_ok($$update public.references_parametres set prefixe = 'pr-d'
  where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and entite = 'article'$$,
  '23514', null, 'paramètres : préfixe en majuscules et chiffres seulement');

select pg_temp.jwt('10000000-0000-0000-0000-000000000004');
select throws_ok($$insert into public.references_parametres (entreprise_id, entite, prefixe)
  values ('a0000000-0000-0000-0000-000000000001', 'client', 'CL')$$,
  '42501', null, 'paramètres : le conducteur (sans gerer_parametres) ne les modifie pas');
select throws_ok($$select public.generer_reference_interne('a0000000-0000-0000-0000-000000000001', 'client')$$,
  '42501', null, 'générateur : non appelable depuis le navigateur');

select pg_temp.jwt('20000000-0000-0000-0000-000000000006');
select is((select count(*)::int from public.references_parametres
            where entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 0,
  'paramètres : une autre entreprise ne voit pas ce paramétrage');
select throws_ok($$insert into public.references_parametres (entreprise_id, entite, prefixe)
  values ('a0000000-0000-0000-0000-000000000001', 'client', 'XX')$$,
  '42501', null, 'paramètres : ni ne le modifie');

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- C. Génération désactivée, puis attribution à la demande
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.jwt('10000000-0000-0000-0000-000000000006');
update public.references_parametres set generation_auto = false
 where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and entite = 'article';
insert into public.prestations_catalogue (entreprise_id, designation, type, unite, prix_unitaire_ht, taux_tva) values
  ('a0000000-0000-0000-0000-000000000001', 'PGTAP sans ref 1', 'fourniture', 'u', 1, 20),
  ('a0000000-0000-0000-0000-000000000001', 'PGTAP sans ref 2', 'fourniture', 'u', 1, 20);
select is((select count(*)::int from public.prestations_catalogue
            where designation like 'PGTAP sans ref%' and reference_interne is null), 2,
  'génération désactivée : les articles restent sans référence');

select pg_temp.jwt('10000000-0000-0000-0000-000000000002');
select throws_ok($$select public.attribuer_references_manquantes('a0000000-0000-0000-0000-000000000001', 'article')$$,
  '42501', null, 'attribution : refusée à l''ouvrier');
select pg_temp.jwt('20000000-0000-0000-0000-000000000006');
select throws_ok($$select public.attribuer_references_manquantes('a0000000-0000-0000-0000-000000000001', 'article')$$,
  '42501', null, 'attribution : refusée à une autre entreprise');

select pg_temp.jwt('10000000-0000-0000-0000-000000000006');
select throws_ok($$select public.attribuer_references_manquantes('a0000000-0000-0000-0000-000000000001', 'devis')$$,
  '22023', null, 'attribution : nature d''objet inconnue refusée');
select is(public.attribuer_references_manquantes('a0000000-0000-0000-0000-000000000001', 'article'), 2,
  'attribution : les deux articles sans référence en reçoivent une');
select is((select count(*)::int from public.prestations_catalogue
            where designation like 'PGTAP sans ref%' and reference_interne ~ '^PRD-[0-9]{3}$'), 2,
  'attribution : au format paramétré');
select is((select count(*)::int from public.historique_objets
            where ressource = 'article' and action = 'reference_attribuee'
              and utilisateur_id = '10000000-0000-0000-0000-000000000006'), 2,
  'attribution : chaque attribution est journalisée sous l''identité du demandeur');

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- D. Normalisation et unicité
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
insert into public.prestations_catalogue (entreprise_id, designation, type, unite, prix_unitaire_ht, taux_tva, reference_interne)
  values ('a0000000-0000-0000-0000-000000000001', 'PGTAP espaces', 'fourniture', 'u', 1, 20, '  ESP-1  ');
select is((select reference_interne from public.prestations_catalogue where designation = 'PGTAP espaces'), 'ESP-1',
  'normalisation : espaces de tête et de fin retirés');
update public.prestations_catalogue set reference_interne = '' where designation = 'PGTAP espaces';
select ok((select reference_interne is null from public.prestations_catalogue where designation = 'PGTAP espaces'),
  'normalisation : une référence vidée devient absente, jamais une chaîne vide');
select is((select action from public.historique_objets h join public.prestations_catalogue p on p.id = h.ressource_id
            where p.designation = 'PGTAP espaces' order by h.id desc limit 1), 'reference_retiree',
  'normalisation : le retrait est journalisé');

select lives_ok($$insert into public.prestations_catalogue (entreprise_id, designation, type, unite, prix_unitaire_ht, taux_tva, reference_interne)
  values ('a0000000-0000-0000-0000-000000000001', 'PGTAP unique 1', 'fourniture', 'u', 1, 20, 'UNI-42')$$,
  'unicité : première référence UNI-42');
select throws_ok($$insert into public.prestations_catalogue (entreprise_id, designation, type, unite, prix_unitaire_ht, taux_tva, reference_interne)
  values ('a0000000-0000-0000-0000-000000000001', 'PGTAP unique 2', 'fourniture', 'u', 1, 20, 'uni 42')$$,
  '23505', null, 'unicité : « uni 42 » est refusé comme doublon de « UNI-42 »');
select throws_ok($$insert into public.clients (entreprise_id, nom, type, statut, reference_interne)
  values ('a0000000-0000-0000-0000-000000000001', 'PGTAP doublon client', 'particulier', 'actif', 'test a cli 001')$$,
  '23505', null, 'unicité : client en doublon normalisé refusé');
select throws_ok($$insert into public.fournisseurs (entreprise_id, reference, nom)
  values ('a0000000-0000-0000-0000-000000000001', 'test-a-fou-001', 'PGTAP doublon fournisseur')$$,
  '23505', null, 'unicité : fournisseur en doublon normalisé refusé');

select pg_temp.jwt('20000000-0000-0000-0000-000000000006');
select lives_ok($$insert into public.prestations_catalogue (entreprise_id, designation, type, unite, prix_unitaire_ht, taux_tva, reference_interne)
  values ('b0000000-0000-0000-0000-000000000001', 'PGTAP unique B', 'fourniture', 'u', 1, 20, 'UNI-42')$$,
  'unicité : la même référence est libre dans une autre entreprise');

select pg_temp.jwt('10000000-0000-0000-0000-000000000006');
select throws_ok($$insert into public.prestations_catalogue (entreprise_id, designation, type, unite, prix_unitaire_ht, taux_tva, reference_interne)
  values ('a0000000-0000-0000-0000-000000000001', 'PGTAP séparateurs', 'fourniture', 'u', 1, 20, '--')$$,
  '23514', null, 'une référence faite seulement de séparateurs est refusée (forme normalisée vide)');

reset role;
insert into public.ouvrages (entreprise_id, nom, unite_principale)
  values ('a0000000-0000-0000-0000-000000000001', 'PGTAP ouvrage auto', 'u');
select matches((select reference_interne from public.ouvrages where nom = 'PGTAP ouvrage auto'), '^OUV-[0-9]{4}$',
  'ouvrage créé sans référence : OUV-NNNN');
insert into public.ouvrages (entreprise_id, nom, unite_principale, reference_interne)
  values ('a0000000-0000-0000-0000-000000000001', 'PGTAP ouvrage X', 'u', 'OUV-X');
select throws_ok($$insert into public.ouvrages (entreprise_id, nom, unite_principale, reference_interne)
  values ('a0000000-0000-0000-0000-000000000001', 'PGTAP ouvrage X bis', 'u', 'ouv.x')$$,
  '23505', null, 'unicité : ouvrage en doublon normalisé refusé');

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- E. Stock : la référence interne reprend le code article quand il est libre
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
select is((select reference_interne from public.articles_stock where id = 'ad000000-0000-0000-0000-000000000001'),
  'TEST_A_STK_001', 'stock : référence interne = code article à la création');
insert into public.articles_stock (entreprise_id, reference, designation, quantite_stock)
  values ('a0000000-0000-0000-0000-000000000001', 'ab-12', 'PGTAP stock a', 0);
insert into public.articles_stock (entreprise_id, reference, designation, quantite_stock)
  values ('a0000000-0000-0000-0000-000000000001', 'AB12', 'PGTAP stock b', 0);
select is((select reference_interne from public.articles_stock where designation = 'PGTAP stock a'), 'ab-12',
  'stock : le premier code est repris');
select ok((select reference_interne is null from public.articles_stock where designation = 'PGTAP stock b'),
  'stock : un code qui ne diffère que par la casse ou un tiret n''est PAS repris');
select ok(exists (select 1 from public.doublons_references_catalogue('a0000000-0000-0000-0000-000000000001')
                   where source = 'article' and champ = 'reference_interne' and reference_normalisee = 'ab12'),
  'stock : et le doublon est signalé');

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- F. Codes articles des distributeurs (D3)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.jwt('10000000-0000-0000-0000-000000000006');
insert into public.fournisseurs (id, entreprise_id, nom)
  values ('ab000000-0000-0000-0000-0000000000f2', 'a0000000-0000-0000-0000-000000000001', 'PGTAP distributeur 2');
select matches((select reference from public.fournisseurs where id = 'ab000000-0000-0000-0000-0000000000f2'), '^FRN-[0-9]{4}$',
  'fournisseur créé sans référence : FRN-NNNN');

select lives_ok($$insert into public.catalogue_codes_fournisseurs (entreprise_id, prestation_id, fournisseur_id, code_article, principal)
  values ('a0000000-0000-0000-0000-000000000001',
          (select id from public.prestations_catalogue where designation = 'PGTAP auto article'),
          'ab000000-0000-0000-0000-000000000001', ' DIS-778 ', true)$$,
  'codes : code du distributeur principal ajouté');
select is((select code_article from public.catalogue_codes_fournisseurs where fournisseur_id = 'ab000000-0000-0000-0000-000000000001'),
  'DIS-778', 'codes : espaces retirés');
select throws_ok($$insert into public.catalogue_codes_fournisseurs (entreprise_id, prestation_id, fournisseur_id, code_article)
  values ('a0000000-0000-0000-0000-000000000001',
          (select id from public.prestations_catalogue where designation = 'PGTAP auto article'),
          'ab000000-0000-0000-0000-000000000001', 'AUTRE')$$,
  '23505', null, 'codes : un seul code par article et par distributeur');
select throws_ok($$insert into public.catalogue_codes_fournisseurs (entreprise_id, prestation_id, fournisseur_id, code_article, principal)
  values ('a0000000-0000-0000-0000-000000000001',
          (select id from public.prestations_catalogue where designation = 'PGTAP auto article'),
          'ab000000-0000-0000-0000-0000000000f2', 'D2-1', true)$$,
  '23505', null, 'codes : un seul distributeur principal par article');
select lives_ok($$insert into public.catalogue_codes_fournisseurs (entreprise_id, prestation_id, fournisseur_id, code_article)
  values ('a0000000-0000-0000-0000-000000000001',
          (select id from public.prestations_catalogue where designation = 'PGTAP auto article'),
          'ab000000-0000-0000-0000-0000000000f2', 'D2-1')$$,
  'codes : second distributeur, non principal');
select throws_ok($$insert into public.catalogue_codes_fournisseurs (entreprise_id, prestation_id, fournisseur_id, code_article)
  values ('a0000000-0000-0000-0000-000000000001',
          (select id from public.prestations_catalogue where designation = 'PGTAP auto article'),
          'bb000000-0000-0000-0000-000000000001', 'VOL')$$,
  '23503', null, 'codes : le fournisseur d''une autre entreprise est refusé');
select throws_ok($$insert into public.catalogue_codes_fournisseurs (entreprise_id, prestation_id, article_stock_id, fournisseur_id, code_article)
  values ('a0000000-0000-0000-0000-000000000001',
          (select id from public.prestations_catalogue where designation = 'PGTAP auto article'),
          'ad000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000001', 'X')$$,
  '23514', null, 'codes : rattaché à UN article, catalogue ou stock, jamais les deux');
select is((select count(*)::int from public.historique_objets where ressource = 'article' and action = 'code_fournisseur_ajoute'), 2,
  'codes : chaque ajout est journalisé sur l''historique de l''article');
select ok(not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'catalogue_codes_fournisseurs'
                         and (column_name like '%prix%' or column_name like '%cout%')),
  'codes : aucune colonne de prix ni de coût');

select pg_temp.jwt('10000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.catalogue_codes_fournisseurs), 2, 'codes : le conducteur (accès devis) les voit');
select throws_ok($$insert into public.catalogue_codes_fournisseurs (entreprise_id, article_stock_id, fournisseur_id, code_article)
  values ('a0000000-0000-0000-0000-000000000001', 'ad000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000001', 'S-1')$$,
  '42501', null, 'codes : le conducteur sans gerer_stock ne code pas un article du stock');
select pg_temp.jwt('10000000-0000-0000-0000-000000000005');
select is((select count(*)::int from public.catalogue_codes_fournisseurs), 2, 'codes : le comptable (accès achats) les voit');
select pg_temp.jwt('10000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.catalogue_codes_fournisseurs), 0, 'codes : l''ouvrier ne les voit pas');
select pg_temp.jwt('20000000-0000-0000-0000-000000000006');
select is((select count(*)::int from public.catalogue_codes_fournisseurs
            where entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 0, 'codes : cloisonnés par entreprise');

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- G. Historique : changement de référence, ajout seul, lecture selon le module
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.jwt('10000000-0000-0000-0000-000000000006');
update public.clients set reference_interne = 'CLI-PGTAP-9' where id = 'a3000000-0000-0000-0000-000000000001';
select is((select action from public.historique_objets where ressource = 'client'
            and ressource_id = 'a3000000-0000-0000-0000-000000000001' order by id desc limit 1),
  'reference_modifiee', 'historique : changement de référence client journalisé');
select is((select avant #>> '{}' from public.historique_objets where ressource = 'client'
            and ressource_id = 'a3000000-0000-0000-0000-000000000001' order by id desc limit 1),
  'TEST_A_CLI_001', 'historique : ancienne valeur conservée');
select is((select apres #>> '{}' from public.historique_objets where ressource = 'client'
            and ressource_id = 'a3000000-0000-0000-0000-000000000001' order by id desc limit 1),
  'CLI-PGTAP-9', 'historique : nouvelle valeur conservée');
select is((select utilisateur_id from public.historique_objets where ressource = 'client'
            and ressource_id = 'a3000000-0000-0000-0000-000000000001' order by id desc limit 1),
  '10000000-0000-0000-0000-000000000006'::uuid, 'historique : auteur conservé');

select throws_ok($$insert into public.historique_objets (entreprise_id, ressource, ressource_id, action)
  values ('a0000000-0000-0000-0000-000000000001', 'client', 'a3000000-0000-0000-0000-000000000001', 'faux')$$,
  '42501', null, 'historique : aucune écriture directe, même pour le dirigeant');
select throws_ok($$update public.historique_objets set action = 'efface'$$, '42501', null, 'historique : aucune modification');
select throws_ok($$delete from public.historique_objets$$, '42501', null, 'historique : aucune suppression');
select throws_ok($$select public.journaliser_objet('a0000000-0000-0000-0000-000000000001', 'client',
  'a3000000-0000-0000-0000-000000000001', 'faux')$$, '42501', null, 'historique : fonction d''écriture non appelable');

select pg_temp.jwt('10000000-0000-0000-0000-000000000004');
select ok((select count(*) from public.historique_objets where ressource = 'client') >= 1,
  'historique : le conducteur (accès clients) lit l''historique des clients');
select pg_temp.jwt('10000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.historique_objets where ressource = 'client'), 0,
  'historique : l''ouvrier sans accès clients ne le lit pas');
select pg_temp.jwt('20000000-0000-0000-0000-000000000006');
select is((select count(*)::int from public.historique_objets
            where entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 0,
  'historique : cloisonné par entreprise');

reset role;
select public.journaliser_objet('a0000000-0000-0000-0000-000000000001', 'devis', 'a9000000-0000-0000-0000-000000000001',
  'prix_achat_modifie', 'prix_achat_ht', '10'::jsonb, '12'::jsonb, true);
set local role authenticated;
select pg_temp.jwt('10000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.historique_objets where ressource = 'devis' and sensible), 0,
  'historique : une entrée sensible est invisible sans voir_couts_devis');
select pg_temp.jwt('10000000-0000-0000-0000-000000000006');
select is((select count(*)::int from public.historique_objets where ressource = 'devis' and sensible), 1,
  'historique : et visible avec');

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- H. Références d'affaire, client et fournisseur sur les documents
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
reset role;
insert into public.devis (id, entreprise_id, client_id, reference_client, reference_interne)
  values ('a9000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-000000000001',
          'a3000000-0000-0000-0000-000000000001', '  PO-77  ', '');
select is((select reference_client from public.devis where id = 'a9000000-0000-0000-0000-0000000000f1'), 'PO-77',
  'documents : référence client nettoyée');
select ok((select reference_interne is null from public.devis where id = 'a9000000-0000-0000-0000-0000000000f1'),
  'documents : référence d''affaire vide = absente');
select throws_ok($$insert into public.devis (entreprise_id, client_id, reference_client)
  values ('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', repeat('x', 121))$$,
  '23514', null, 'documents : référence client bornée à 120 caractères');

set local role authenticated;
select pg_temp.jwt('10000000-0000-0000-0000-000000000006');
update public.devis set reference_client = 'PO-78' where id = 'a9000000-0000-0000-0000-0000000000f1';
select is((select action || ':' || champ from public.historique_objets where ressource = 'devis'
            and ressource_id = 'a9000000-0000-0000-0000-0000000000f1' order by id desc limit 1),
  'reference_modifiee:reference_client', 'documents : changement de référence client journalisé');
update public.commandes_fournisseurs set reference_fournisseur = ' OFF-1 ' where id = 'ac000000-0000-0000-0000-000000000001';
select is((select reference_fournisseur from public.commandes_fournisseurs where id = 'ac000000-0000-0000-0000-000000000001'),
  'OFF-1', 'documents : référence d''offre fournisseur nettoyée sur la commande');
-- Depuis le lot E, la création d'une commande est elle aussi journalisée : on compte le changement de référence.
select is((select count(*)::int from public.historique_objets where ressource = 'commande'
            and ressource_id = 'ac000000-0000-0000-0000-000000000001' and action like 'reference_%'), 1,
  'documents : et journalisée');

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- I. Doublons visibles selon les droits
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.jwt('20000000-0000-0000-0000-000000000006');
select is((select count(*)::int from public.doublons_references('a0000000-0000-0000-0000-000000000001')), 0,
  'doublons : une autre entreprise ne voit rien');
select pg_temp.jwt('10000000-0000-0000-0000-000000000006');
select ok((select count(*) from public.doublons_references('a0000000-0000-0000-0000-000000000001')) >= 1,
  'doublons : le dirigeant voit le doublon du stock');

select * from finish();
rollback;
