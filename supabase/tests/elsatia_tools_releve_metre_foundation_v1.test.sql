-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 2 — FOUNDATION V1
--
-- Qualifie la migration 20260926000401_tools_releve_metre_foundation_v1 :
--   A. surface (tables, RLS, droits) ;
--   B. entitlement add-on `releve-metre` et garde-fou de non-commercialisation ;
--   C. hiérarchie chantier → bâtiment → étage → zone → pièce et intégrité composite ;
--   D. matrice view/create/edit/delete/share/export/sync-gp par rôle et propriété ;
--   E. isolation cross-tenant (lecture, écriture, chemin forgé) ;
--   F. suppression douce en cascade, restauration, audit, versions ;
--   G. stockage privé et liens Gestion Pro ;
--   H. non-régression Tools Pro (cloud-sync des projets calculateur).
--
-- Acteurs (fixture isolation_multitenant) :
--   A 10…06 dirigeant   : tools_releve_admin        + releve-metre (toutes permissions GP)
--   A 10…03 chef équipe : tools_releve_metreur      + releve-metre
--   A 10…04 conducteur  : tools_pro (historique)    + releve-metre
--   A 10…05 comptable   : tools_releve_consultation + releve-metre
--   A 10…01 admin       : tools_releve_metreur      + Tools Pro SANS add-on
--   A 10…02 ouvrier     : aucun rôle, aucun entitlement (Tools Free)
--   B 20…06 dirigeant   : tools_releve_admin        + releve-metre

begin;
create extension if not exists pgtap with schema extensions;
select plan(74);
\ir fixtures/isolation_multitenant.inc

insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, source) values
  ('a0000000-0000-0000-0000-000000000001', 'tools', true, 'releve-test'),
  ('b0000000-0000-0000-0000-000000000001', 'tools', true, 'releve-test')
on conflict (entreprise_id, application_code) do update set autorise = true;

insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code, autorise) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006', 'tools', 'tools_releve_admin', true),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'tools', 'tools_releve_metreur', true),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'tools', 'tools_pro', true),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'tools', 'tools_releve_consultation', true),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'tools', 'tools_releve_metreur', true),
  ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000006', 'tools', 'tools_releve_admin', true)
on conflict (entreprise_id, utilisateur_id, application_code) do update set role_code = excluded.role_code, autorise = true;

insert into public.entitlements_utilisateurs_elsatia(utilisateur_id, application_code, niveau, capabilities, source)
select u, 'tools', 'pro', public.tools_capabilities_pro() || array['releve-metre'], 'internal'
from unnest(array[
  '10000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000005',
  '20000000-0000-0000-0000-000000000006'
]::uuid[]) u;
insert into public.entitlements_utilisateurs_elsatia(utilisateur_id, application_code, niveau, capabilities, source)
values ('10000000-0000-0000-0000-000000000001', 'tools', 'pro', public.tools_capabilities_pro(), 'web');

-- ═══ A. Surface ═════════════════════════════════════════════════════════════
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relname in (
     'tools_releves','tools_releves_batiments','tools_releves_etages','tools_releves_zones','tools_releves_pieces',
     'tools_releves_elements','tools_releves_medias','tools_releves_versions','tools_releves_journal','tools_releves_exports_gp')),
  10, 'A1. les 10 tables Relevé existent et ont la RLS active');

select is(
  (select count(*)::int from information_schema.role_table_grants
   where grantee in ('anon','public') and table_schema = 'public' and table_name like 'tools_releves%'),
  0, 'A2. anon n''a aucun privilège sur les tables Relevé');

select is(
  (select count(*)::int from information_schema.role_table_grants
   where grantee = 'authenticated' and table_schema = 'public' and table_name like 'tools_releves%'
     and privilege_type in ('DELETE','TRUNCATE','TRIGGER','REFERENCES')),
  0, 'A3. authenticated n''a ni DELETE ni privilège DDL (suppression douce uniquement)');

select ok(
  not has_table_privilege('authenticated', 'public.tools_releves_versions', 'INSERT,UPDATE')
  and not has_table_privilege('authenticated', 'public.tools_releves_journal', 'INSERT,UPDATE')
  and not has_table_privilege('authenticated', 'public.tools_releves_exports_gp', 'INSERT,UPDATE'),
  'A4. versions, journal et envois GP sont en lecture seule pour l''application');

select is(
  (select count(*)::int from public.roles_applications_elsatia
   where application_code = 'tools' and code in ('tools_releve_admin','tools_releve_metreur','tools_releve_consultation') and actif),
  3, 'A5. trois rôles Tools Relevé sont déclarés');

select ok(
  not has_function_privilege('anon', 'public.tools_releve_peut(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.tools_releve_creer_version(uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.tools_releve_journaliser()', 'EXECUTE'),
  'A6. prédicats fermés à anon ; fonctions de trigger non appelables');

-- ═══ B. Entitlement add-on ══════════════════════════════════════════════════
select ok(
  'releve-metre' = any(public.tools_capabilities_catalogue())
  and not ('releve-metre' = any(public.tools_capabilities_pro()))
  and cardinality(public.tools_capabilities_pro()) = 18,
  'B1. releve-metre est au catalogue, hors du palier Pro (18 capabilities inchangées)');

select throws_ok(
  $$insert into public.entitlements_utilisateurs_elsatia(utilisateur_id, application_code, niveau, capabilities, source)
    values ('10000000-0000-0000-0000-000000000002', 'tools', 'pro', array['releve-metre'], 'web')$$,
  '23514', null, 'B2. un achat web ne peut pas porter releve-metre (aucune activation commerciale)');

select throws_ok(
  $$update public.entitlements_utilisateurs_elsatia set capabilities = capabilities || array['releve-metre']
    where utilisateur_id = '10000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'B3. ajouter releve-metre à un abonnement web existant est refusé');

select ok(
  not exists (select 1 from pg_constraint where conrelid = 'public.tools_monetization_subscriptions'::regclass
              and pg_get_constraintdef(oid) ilike '%releve%'),
  'B4. aucun SKU Relevé n''est accepté par tools_monetization_subscriptions');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select ok(
  public.tools_resoudre_entitlements()->>'tier' = 'pro'
  and not ((public.tools_resoudre_entitlements()->'capabilities') ? 'releve-metre'),
  'B5. un Tools Pro existant reste Pro et n''obtient PAS releve-metre');
select is(public.tools_a_droit_releve_metre(), false, 'B6. Tools Pro sans add-on : droit Relevé refusé côté serveur');
select throws_ok(
  $$insert into public.tools_releves(id, entreprise_id, nom, chantier_nom)
    values ('e1000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-000000000001', 'Sans add-on', 'Chantier')$$,
  '42501', null, 'B7. Tools Pro sans add-on : création de relevé refusée par la RLS');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is(
  public.tools_releve_contexte('a0000000-0000-0000-0000-000000000001') - 'entreprise_id',
  '{"role": null, "tenant_has_tools": false, "gp_gerer_ouvrages": false, "has_releve_capability": false}'::jsonb,
  'B8. Tools Free sans rôle : contexte vide, aucune dimension ouverte');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select ok((public.tools_resoudre_entitlements()->'capabilities') ? 'releve-metre', 'B9. attribution interne : releve-metre résolu');
select is(
  public.tools_releve_contexte('a0000000-0000-0000-0000-000000000001')->>'role', 'tools_releve_metreur',
  'B10. contexte acteur : rôle métreur exposé au client');

-- ═══ C. Hiérarchie ══════════════════════════════════════════════════════════
select lives_ok(
  $$insert into public.tools_releves(id, entreprise_id, proprietaire_id, nom, chantier_nom, chantier_code_postal)
    values ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
            '10000000-0000-0000-0000-000000000006', 'Relevé appartement', 'Rue des Lilas', '67000')$$,
  'C1. un métreur avec add-on crée un relevé');
select is(
  (select proprietaire_id::text || '|' || visibilite || '|' || revision from public.tools_releves where id = 'e1000000-0000-0000-0000-000000000001'),
  '10000000-0000-0000-0000-000000000003|prive|1',
  'C2. propriétaire forcé sur l''appelant, privé par défaut, révision 1');

select lives_ok($$
  insert into public.tools_releves_batiments(id, releve_id, nom) values ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Bâtiment A');
  insert into public.tools_releves_etages(id, releve_id, batiment_id, nom, niveau, hauteur_sous_plafond_mm)
    values ('e3000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'RDC', 0, 2500),
           ('e3000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'R+1', 1, 2500);
  insert into public.tools_releves_zones(id, releve_id, etage_id, nom) values ('e4000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'Logement 1');
  insert into public.tools_releves_pieces(id, releve_id, etage_id, zone_id, nom, usage)
    values ('e5000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001', 'Séjour', 'sejour'),
           ('e5000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', null, 'Palier', 'degagement');
$$, 'C3. bâtiment, étages, zone et pièces créés sans aucun scan');

select is(
  (select string_agg(distinct entreprise_id::text || '/' || created_by::text, ',') from public.tools_releves_pieces where releve_id = 'e1000000-0000-0000-0000-000000000001'),
  'a0000000-0000-0000-0000-000000000001/10000000-0000-0000-0000-000000000003',
  'C4. tenant déduit du relevé et auteur tracé sur chaque enfant');

select lives_ok(
  $$insert into public.tools_releves(id, entreprise_id, nom, chantier_nom)
    values ('e1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Second relevé', 'Autre chantier')$$,
  'C5. un second relevé du même métreur');
select throws_ok(
  $$insert into public.tools_releves_etages(releve_id, batiment_id, nom, niveau)
    values ('e1000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000001', 'Étage greffé', 0)$$,
  '23503', null, 'C6. clé composite : un étage ne peut pas pendre sous le bâtiment d''un autre relevé');
select throws_ok(
  $$insert into public.tools_releves_pieces(releve_id, etage_id, zone_id, nom)
    values ('e1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000002', 'e4000000-0000-0000-0000-000000000001', 'Pièce incohérente')$$,
  '23503', null, 'C7. clé composite : la zone d''une pièce est sur le même étage');

select lives_ok($$
  insert into public.tools_releves_elements(id, releve_id, type, etage_id, piece_id, donnees) values
    ('e6000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'mur', 'e3000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001',
     '{"a":{"x":0,"y":0},"b":{"x":4200,"y":0},"epaisseurMm":200,"hauteurMm":2500,"typeMur":"porteur"}');
  insert into public.tools_releves_elements(id, releve_id, type, etage_id, piece_id, parent_element_id, donnees) values
    ('e6000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'ouverture', 'e3000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000001',
     '{"decalageMm":600,"largeurMm":900,"hauteurMm":2150,"allegeMm":null,"typeOuverture":"porte","sens":"gauche"}');
  insert into public.tools_releves_elements(id, releve_id, type, piece_id, etage_id, donnees) values
    ('e6000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', 'quantite', 'e5000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001',
     '{"cle":"sol","libelle":"Sol","valeur":18.4,"unite":"m2","formule":"longueur*largeur","qualite":"exacte","materiauId":null}');
$$, 'C8. mur, ouverture hébergée et quantité dérivée');
select throws_ok(
  $$insert into public.tools_releves_elements(releve_id, type, etage_id, donnees)
    values ('e1000000-0000-0000-0000-000000000001', 'ouverture', 'e3000000-0000-0000-0000-000000000001',
            '{"decalageMm":0,"largeurMm":900,"hauteurMm":2150,"typeOuverture":"porte","sens":"gauche"}')$$,
  '23514', null, 'C9. une ouverture sans mur hôte est refusée');
select throws_ok(
  $$insert into public.tools_releves_elements(releve_id, type, etage_id, donnees)
    values ('e1000000-0000-0000-0000-000000000001', 'mur', 'e3000000-0000-0000-0000-000000000001', '{"a":{"x":0,"y":0},"typeMur":"porteur"}')$$,
  '23514', null, 'C10. une charge de mur incomplète est refusée');
select throws_ok(
  $$insert into public.tools_releves_elements(releve_id, type, etage_id, parent_element_id, donnees)
    values ('e1000000-0000-0000-0000-000000000001', 'ouverture', 'e3000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000003',
            '{"decalageMm":0,"largeurMm":900,"hauteurMm":2150,"typeOuverture":"porte","sens":"gauche"}')$$,
  'P0001', null, 'C11. une ouverture ne peut être hébergée que par un mur');

-- ═══ D. Matrice de permissions ══════════════════════════════════════════════
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select is((select count(*)::int from public.tools_releves), 0, 'D1. consultation : aucun relevé privé visible');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select is((select count(*)::int from public.tools_releves), 0, 'D2. tools_pro (profil métreur) : relevés privés d''autrui invisibles');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
select is((select count(*)::int from public.tools_releves), 2, 'D3. administrateur Relevé : voit les relevés privés de son entreprise');
select is(public.tools_releve_actions('e1000000-0000-0000-0000-000000000001'),
  array['view','edit','delete','share','export','sync-gp'], 'D4. administrateur avec gerer_ouvrages : toutes les actions');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select lives_ok($$update public.tools_releves set visibilite = 'entreprise' where id = 'e1000000-0000-0000-0000-000000000001'$$,
  'D5. le propriétaire partage son relevé (share)');
select is((select action from public.tools_releves_journal where releve_id = 'e1000000-0000-0000-0000-000000000001' and entite = 'releve' order by id desc limit 1),
  'partage', 'D6. le partage est journalisé');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select is((select count(*)::int from public.tools_releves), 1, 'D7. consultation : le relevé partagé devient visible');
select is(public.tools_releve_actions('e1000000-0000-0000-0000-000000000001'), array['view','export'], 'D8. consultation : view + export uniquement');
select throws_ok($$update public.tools_releves set nom = 'Renommé' where id = 'e1000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'D9. consultation : modification refusée');
select throws_ok(
  $$insert into public.tools_releves_batiments(releve_id, nom) values ('e1000000-0000-0000-0000-000000000001', 'Intrus')$$,
  '42501', null, 'D10. consultation : ajout de structure refusé');
select throws_ok(
  $$insert into public.tools_releves(entreprise_id, nom, chantier_nom) values ('a0000000-0000-0000-0000-000000000001', 'Lecture', 'X')$$,
  '42501', null, 'D11. consultation : création refusée');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$insert into public.tools_releves_pieces(releve_id, etage_id, nom, usage) values ('e1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000002', 'Chambre', 'chambre')$$,
  'D12. tools_pro : édite un relevé partagé');
select throws_ok($$update public.tools_releves set visibilite = 'prive' where id = 'e1000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'D13. non-propriétaire métreur : partage refusé');
select throws_ok($$update public.tools_releves set deleted_at = now() where id = 'e1000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'D14. non-propriétaire métreur : suppression refusée');
select throws_ok($$update public.tools_releves set proprietaire_id = '10000000-0000-0000-0000-000000000004' where id = 'e1000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'D15. transfert de propriété réservé à l''administrateur');
select is(public.tools_releve_peut('e1000000-0000-0000-0000-000000000001', 'sync-gp'), false,
  'D16. sync-gp exige la permission GP gerer_ouvrages (absente pour ce poste)');

-- ═══ E. Cross-tenant ════════════════════════════════════════════════════════
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000006', true);
select is((select count(*)::int from public.tools_releves), 0, 'E1. administrateur de B : aucun relevé de A visible');
select is((select count(*)::int from public.tools_releves_pieces), 0, 'E2. administrateur de B : aucune pièce de A visible');
select is(public.tools_releve_peut('e1000000-0000-0000-0000-000000000001', 'view'), false, 'E3. administrateur de B : view refusé sur un relevé de A');
select throws_ok(
  $$insert into public.tools_releves_batiments(releve_id, nom) values ('e1000000-0000-0000-0000-000000000001', 'Greffe B')$$,
  '42501', null, 'E4. administrateur de B : écriture dans un relevé de A refusée');
select throws_ok(
  $$insert into public.tools_releves(entreprise_id, nom, chantier_nom) values ('a0000000-0000-0000-0000-000000000001', 'Forgé', 'X')$$,
  '42501', null, 'E5. administrateur de B : entreprise A forgée à la création refusée');
select lives_ok(
  $$insert into public.tools_releves(id, entreprise_id, nom, chantier_nom) values ('e1000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-000000000001', 'Relevé B', 'Chantier B')$$,
  'E6. administrateur de B : création dans sa propre entreprise');
select throws_ok(
  $$insert into public.tools_releves_batiments(releve_id, entreprise_id, nom) values ('e1000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-000000000001', 'Tenant forgé')$$,
  '23503', null, 'E7. enfant avec entreprise_id forgé : clé composite (relevé, entreprise) refuse');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$insert into public.tools_releves(entreprise_id, nom, chantier_nom) values ('b0000000-0000-0000-0000-000000000001', 'Forgé vers B', 'X')$$,
  '42501', null, 'E8. métreur de A : création dans l''entreprise B refusée');

-- ═══ F. Suppression douce, audit, versions ══════════════════════════════════
select lives_ok($$update public.tools_releves_batiments set deleted_at = now() where id = 'e2000000-0000-0000-0000-000000000001'$$,
  'F1. suppression douce d''un bâtiment');
select is(
  (select count(*)::int from (
     select deleted_at from public.tools_releves_etages where batiment_id = 'e2000000-0000-0000-0000-000000000001'
     union all select deleted_at from public.tools_releves_pieces where releve_id = 'e1000000-0000-0000-0000-000000000001'
     union all select deleted_at from public.tools_releves_zones where releve_id = 'e1000000-0000-0000-0000-000000000001'
     union all select deleted_at from public.tools_releves_elements where releve_id = 'e1000000-0000-0000-0000-000000000001') t
   where deleted_at is null), 0,
  'F2. cascade : étages, zones, pièces et éléments supprimés avec le bâtiment');
select lives_ok($$update public.tools_releves_batiments set deleted_at = null where id = 'e2000000-0000-0000-0000-000000000001'$$,
  'F3. restauration du bâtiment');
select is(
  (select count(*)::int from public.tools_releves_pieces where releve_id = 'e1000000-0000-0000-0000-000000000001' and deleted_at is null), 3,
  'F4. restauration symétrique : les pièces reviennent');
select throws_ok($$delete from public.tools_releves_pieces where id = 'e5000000-0000-0000-0000-000000000002'$$,
  '42501', null, 'F5. aucune suppression physique depuis l''application');
select throws_ok($$update public.tools_releves_pieces set releve_id = 'e1000000-0000-0000-0000-000000000002' where id = 'e5000000-0000-0000-0000-000000000002'$$,
  '42501', null, 'F6. une pièce ne peut pas changer de relevé');

select is((public.tools_releve_creer_version('e1000000-0000-0000-0000-000000000001', 'Relevé initial')).numero, 1, 'F7. première version numérotée 1');
select ok(
  (select empreinte ~ '^[0-9a-f]{64}$' and jsonb_array_length(contenu->'pieces') = 3 from public.tools_releves_versions where releve_id = 'e1000000-0000-0000-0000-000000000001' and numero = 1),
  'F8. version : empreinte SHA-256 et instantané de la structure');
select throws_ok($$update public.tools_releves_versions set libelle = 'Réécrit'$$, '42501', null, 'F9. une version est immuable');
select ok(
  (select count(*) >= 8 and bool_or(action = 'creation') and bool_or(action = 'suppression') and bool_or(action = 'restauration') and bool_or(action = 'version')
   from public.tools_releves_journal where releve_id = 'e1000000-0000-0000-0000-000000000001'),
  'F10. journal d''audit : création, suppression, restauration, version');

select lives_ok($$update public.tools_releves set deleted_at = now() where id = 'e1000000-0000-0000-0000-000000000002'$$,
  'F11. le propriétaire place son relevé à la corbeille');
select throws_ok($$insert into public.tools_releves_batiments(releve_id, nom) values ('e1000000-0000-0000-0000-000000000002', 'Après suppression')$$,
  '42501', null, 'F12. relevé supprimé : plus aucune écriture');

-- ═══ G. Stockage et Gestion Pro ═════════════════════════════════════════════
select ok(
  public.tools_releve_storage_autorise('a0000000-0000-0000-0000-000000000001/e1000000-0000-0000-0000-000000000001/photos/e7000000-0000-0000-0000-000000000001.jpg', 'ecriture')
  and not public.tools_releve_storage_autorise('b0000000-0000-0000-0000-000000000001/e1000000-0000-0000-0000-000000000001/photos/e7000000-0000-0000-0000-000000000001.jpg', 'lecture')
  and not public.tools_releve_storage_autorise('a0000000-0000-0000-0000-000000000001/e1000000-0000-0000-0000-000000000001/secrets/e7000000-0000-0000-0000-000000000001.jpg', 'lecture')
  and not public.tools_releve_storage_autorise('a0000000-0000-0000-0000-000000000001/e1000000-0000-0000-0000-000000000001/photos/../x.jpg', 'lecture'),
  'G1. chemin de stockage : couple (entreprise, relevé) réel, catégorie connue, pas de traversée');
select lives_ok(
  $$insert into public.tools_releves_medias(id, releve_id, categorie, storage_path, mime_type, taille_octets)
    values ('e7000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'photos',
            'a0000000-0000-0000-0000-000000000001/e1000000-0000-0000-0000-000000000001/photos/e7000000-0000-0000-0000-000000000001.jpg', 'image/jpeg', 120000)$$,
  'G2. enregistrement d''une photo au chemin canonique');
select throws_ok(
  $$insert into public.tools_releves_medias(id, releve_id, categorie, storage_path, mime_type, taille_octets)
    values ('e7000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'photos',
            'b0000000-0000-0000-0000-000000000001/e1000000-0000-0000-0000-000000000001/photos/e7000000-0000-0000-0000-000000000002.jpg', 'image/jpeg', 120000)$$,
  '23514', null, 'G3. un chemin pointant vers une autre entreprise est refusé');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000006', true);
select ok(
  not public.tools_releve_storage_autorise('a0000000-0000-0000-0000-000000000001/e1000000-0000-0000-0000-000000000001/photos/e7000000-0000-0000-0000-000000000001.jpg', 'lecture'),
  'G4. stockage : un utilisateur de B ne lit pas la photo d''un relevé de A');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
select throws_ok(
  $$update public.tools_releves set chantier_gp_id = 'b4000000-0000-0000-0000-000000000001' where id = 'e1000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'G5. lien vers un chantier Gestion Pro d''une autre entreprise refusé');
select lives_ok(
  $$update public.tools_releves set chantier_gp_id = 'a4000000-0000-0000-0000-000000000001', client_gp_id = 'a3000000-0000-0000-0000-000000000001' where id = 'e1000000-0000-0000-0000-000000000001'$$,
  'G6. lien chantier et client Gestion Pro de la même entreprise accepté');

-- ═══ I. Plateforme ══════════════════════════════════════════════════════════
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select ok((public.tools_resoudre_entitlements()->'capabilities') ? 'releve-metre',
  'I1. propriétaire global : releve-metre inclus pour les tests internes (source plateforme)');
select is(public.tools_releve_peut('e1000000-0000-0000-0000-000000000001', 'view'), false,
  'I2. plateforme sans session support ni appartenance : aucune donnée client lisible');
reset role;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.tools_attribuer_entitlement_utilisateur_interne('10000000-0000-0000-0000-000000000002', 'tools', 'pro',
      array['saved-projects','releve-metre'], 'internal')$$,
  'I3. attribution plateforme interne de releve-metre acceptée (liste blanche = catalogue)');
select throws_ok(
  $$select public.tools_attribuer_entitlement_utilisateur_interne('10000000-0000-0000-0000-000000000002', 'tools', 'pro',
      array['releve-metre'], 'google')$$,
  '23514', null, 'I4. même la plateforme ne peut pas attribuer releve-metre sous une source d''achat');
set local role authenticated;

-- ═══ H. Non-régression Tools Pro ════════════════════════════════════════════
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is(
  public.tools_sync_project_entreprise('a0000000-0000-0000-0000-000000000001',
    '{"id":"a1111111-2222-3333-4444-555555555555","schemaVersion":1,"toolId":"fleur-6","name":"Pro inchangé","createdAt":"2026-09-26T08:00:00Z","updatedAt":"2026-09-26T08:00:00Z","inputParameters":{},"options":{}}', 0, 'web')->>'status',
  'applied', 'H1. Tools Pro sans add-on : cloud-sync des projets calculateur inchangé');

reset role;
select * from finish();
rollback;
