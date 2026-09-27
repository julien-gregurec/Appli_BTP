-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 2 — FOUNDATION V1 — COMPLÉMENTS
--
-- Qualifie la migration 20260927000602_tools_releve_metre_lot2_complements :
--   K. catalogue d'offres : Relevé Pro inclut Tools Pro, sans activation commerciale ;
--   L. niveau Chantier : Projet → Chantier → Bâtiment → Étage → Zone → Pièce ;
--   M. matrice RLS par acteur : owner, org member, unauthorized, other tenant, anon, service role ;
--   N. versions typées initial / corrige / projete / as_built.
--
-- Acteurs (fixture isolation_multitenant) :
--   A 10…03 chef équipe : tools_releve_metreur      + releve-metre       → OWNER
--   A 10…04 conducteur  : tools_pro (historique)    + releve-metre       → ORG MEMBER (métreur)
--   A 10…05 comptable   : tools_releve_consultation + releve-metre       → ORG MEMBER (lecture)
--   A 10…06 dirigeant   : tools_releve_admin        + releve-metre       → ADMIN
--   A 10…01 admin       : tools_releve_metreur      + Tools Pro SANS add-on → UNAUTHORIZED (entitlement)
--   A 10…02 ouvrier     : aucun rôle                + releve-metre seul  → UNAUTHORIZED (organisation)
--   B 20…06 dirigeant   : tools_releve_admin        + releve-metre       → OTHER TENANT
--   B 20…02 ouvrier     : rien                                           → Tools Free

begin;
create extension if not exists pgtap with schema extensions;
select plan(66);
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
insert into public.entitlements_utilisateurs_elsatia(utilisateur_id, application_code, niveau, capabilities, source) values
  ('10000000-0000-0000-0000-000000000001', 'tools', 'pro', public.tools_capabilities_pro(), 'web'),
  -- Offre « Relevé Pro » seule : aucune capability Tools Pro explicitement listée.
  ('10000000-0000-0000-0000-000000000002', 'tools', 'pro', array['releve-metre'], 'internal');

-- ═══ K. Catalogue d'offres ══════════════════════════════════════════════════
select is(
  (select string_agg(code || ':' || commercialement_active || ':' || statut, ',' order by code) from public.tools_offres_catalogue),
  'releve_pro:false:reference,tools_pro:true:active',
  'K1. catalogue : Tools Pro actif, Relevé Pro en prix de référence non commercialisé');
select throws_ok(
  $$update public.tools_offres_catalogue set commercialement_active = true, statut = 'active' where code = 'releve_pro'$$,
  '23514', null, 'K2. Relevé Pro ne peut pas être activé commercialement sans migration (même en superutilisateur)');
select ok(
  public.tools_capabilities_pro() <@ public.tools_capabilities_offre('releve_pro')
  and 'releve-metre' = any(public.tools_capabilities_offre('releve_pro'))
  and cardinality(public.tools_capabilities_offre('releve_pro')) = 19,
  'K3. offre releve_pro = 18 capabilities Tools Pro + releve-metre');
select ok(
  public.tools_capabilities_etendues(public.tools_capabilities_pro()) @> public.tools_capabilities_pro()
  and cardinality(public.tools_capabilities_etendues(public.tools_capabilities_pro())) = 18,
  'K4. Tools Pro sans add-on : aucune extension (18 capabilities, pas de releve-metre)');
select ok(
  not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tools_offres_catalogue'
              and (column_name ilike '%prix%' or column_name ilike '%price%' or column_name ilike '%montant%')),
  'K5. aucun prix stocké en base : prix de référence dans le seul domaine TypeScript');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select throws_ok($$update public.tools_offres_catalogue set libelle = 'Pirate' where code = 'tools_pro'$$,
  '42501', null, 'K6. authenticated ne modifie pas le catalogue d''offres');
select is(
  (select array_agg(c order by c) from jsonb_array_elements_text(public.tools_resoudre_entitlements()->'capabilities') c),
  (select array_agg(c order by c) from unnest(public.tools_capabilities_pro()) c),
  'K7. non-régression : Tools Pro web résout exactement ses 18 capabilities');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select ok(
  public.tools_resoudre_entitlements()->>'tier' = 'pro'
  and (public.tools_resoudre_entitlements()->'capabilities') ? 'releve-metre'
  and (public.tools_resoudre_entitlements()->'capabilities') ? 'export-pdf'
  and jsonb_array_length(public.tools_resoudre_entitlements()->'capabilities') = 19,
  'K8. Relevé Pro inclut Tools Pro : releve-metre seul ouvre aussi les 18 capabilities Pro');
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select is(public.tools_resoudre_entitlements()->>'tier', 'free', 'K9. non-régression : Tools Free reste Free');

-- ═══ L. Niveau Chantier (OWNER = 10…03) ════════════════════════════════════
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select lives_ok($$
  insert into public.tools_releves(id, entreprise_id, nom, chantier_nom, chantier_ville)
    values ('f1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Résidence Les Tilleuls', 'Résidence', 'Strasbourg');
  insert into public.tools_releves_chantiers(id, releve_id, nom, ordre) values
    ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'Chantier Nord', 0),
    ('f2000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001', 'Chantier Sud', 1);
$$, 'L1. owner : projet relevé et deux chantiers créés');
select is(
  (select string_agg(entreprise_id::text || '/' || created_by::text, ',' order by ordre) from public.tools_releves_chantiers where releve_id = 'f1000000-0000-0000-0000-000000000001'),
  'a0000000-0000-0000-0000-000000000001/10000000-0000-0000-0000-000000000003,a0000000-0000-0000-0000-000000000001/10000000-0000-0000-0000-000000000003',
  'L2. chantier : tenant déduit du projet, auteur tracé');
select lives_ok($$
  insert into public.tools_releves_batiments(id, releve_id, chantier_id, nom) values
    ('f3000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'Bâtiment A');
  insert into public.tools_releves_etages(id, releve_id, batiment_id, nom, niveau) values
    ('f4000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'RDC', 0);
  insert into public.tools_releves_zones(id, releve_id, etage_id, nom) values
    ('f5000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000001', 'Logement 1');
  insert into public.tools_releves_pieces(id, releve_id, etage_id, zone_id, nom, usage) values
    ('f6000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000001', 'Séjour', 'sejour');
$$, 'L3. bâtiment rattaché à un chantier, puis étage, zone, pièce');
select is(
  (select r.nom || ' > ' || c.nom || ' > ' || b.nom || ' > ' || e.nom || ' > ' || z.nom || ' > ' || p.nom
   from public.tools_releves_pieces p
   join public.tools_releves_zones z on z.id = p.zone_id
   join public.tools_releves_etages e on e.id = p.etage_id
   join public.tools_releves_batiments b on b.id = e.batiment_id
   join public.tools_releves_chantiers c on c.id = b.chantier_id
   join public.tools_releves r on r.id = c.releve_id
   where p.id = 'f6000000-0000-0000-0000-000000000001'),
  'Résidence Les Tilleuls > Chantier Nord > Bâtiment A > RDC > Logement 1 > Séjour',
  'L4. hiérarchie complète Projet > Chantier > Bâtiment > Étage > Zone > Pièce');
select throws_ok(
  $$insert into public.tools_releves_batiments(releve_id, nom) values ('f1000000-0000-0000-0000-000000000001', 'Sans chantier')$$,
  '23502', null, 'L5. plusieurs chantiers : un bâtiment doit préciser son chantier');

select lives_ok($$
  insert into public.tools_releves(id, entreprise_id, nom, chantier_nom, chantier_code_postal)
    values ('f1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Maison Dupont', 'Maison rue du Moulin', '67200');
  insert into public.tools_releves_batiments(id, releve_id, nom)
    values ('f3000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000002', 'Maison');
$$, 'L6. rétro-compatibilité : bâtiment créé sans chantier sur un projet vierge');
select is(
  (select c.nom || '|' || c.code_postal || '|' || (b.chantier_id = c.id)
   from public.tools_releves_batiments b join public.tools_releves_chantiers c on c.releve_id = b.releve_id
   where b.id = 'f3000000-0000-0000-0000-000000000002'),
  'Maison rue du Moulin|67200|true',
  'L7. chantier par défaut créé depuis le site principal du projet et rattaché');
select lives_ok(
  $$insert into public.tools_releves_batiments(releve_id, nom) values ('f1000000-0000-0000-0000-000000000002', 'Garage')$$,
  'L8. chantier unique : les bâtiments suivants le rejoignent');
select is((select count(*)::int from public.tools_releves_chantiers where releve_id = 'f1000000-0000-0000-0000-000000000002'), 1,
  'L9. aucun chantier en double');
select throws_ok(
  $$insert into public.tools_releves_batiments(releve_id, chantier_id, nom)
    values ('f1000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000001', 'Greffé')$$,
  '23503', null, 'L10. clé composite : un bâtiment ne peut pas pendre sous le chantier d''un autre projet');
select throws_ok(
  $$update public.tools_releves_chantiers set releve_id = 'f1000000-0000-0000-0000-000000000002' where id = 'f2000000-0000-0000-0000-000000000002'$$,
  '42501', null, 'L11. un chantier ne change pas de projet');
select throws_ok(
  $$update public.tools_releves_chantiers set chantier_gp_id = 'a4000000-0000-0000-0000-000000000001' where id = 'f2000000-0000-0000-0000-000000000002'$$,
  '42501', null, 'L12. lier un chantier GP exige la permission Gestion Pro acces_chantiers');

select lives_ok($$update public.tools_releves_chantiers set deleted_at = now() where id = 'f2000000-0000-0000-0000-000000000001'$$,
  'L13. suppression douce d''un chantier');
select is(
  (select count(*)::int from (
     select deleted_at from public.tools_releves_batiments where chantier_id = 'f2000000-0000-0000-0000-000000000001'
     union all select deleted_at from public.tools_releves_etages where releve_id = 'f1000000-0000-0000-0000-000000000001'
     union all select deleted_at from public.tools_releves_pieces where releve_id = 'f1000000-0000-0000-0000-000000000001') t
   where deleted_at is null), 0,
  'L14. cascade chantier → bâtiments → étages → pièces');
select lives_ok($$update public.tools_releves_chantiers set deleted_at = null where id = 'f2000000-0000-0000-0000-000000000001'$$,
  'L15. restauration du chantier');
select is(
  (select count(*)::int from public.tools_releves_pieces where releve_id = 'f1000000-0000-0000-0000-000000000001' and deleted_at is null), 1,
  'L16. restauration symétrique jusqu''à la pièce');
select ok(
  (select bool_or(action = 'creation') and bool_or(action = 'suppression') and bool_or(action = 'restauration')
   from public.tools_releves_journal where entite = 'chantier' and entite_id = 'f2000000-0000-0000-0000-000000000001'),
  'L17. journal : création, suppression et restauration du chantier');

-- ═══ M. Matrice RLS par acteur ══════════════════════════════════════════════
-- Projet privé : seuls owner et admin voient ses chantiers.
select is((select count(*)::int from public.tools_releves_chantiers where releve_id = 'f1000000-0000-0000-0000-000000000001'), 2,
  'M1. owner : voit les chantiers de son projet privé');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select is((select count(*)::int from public.tools_releves_chantiers), 0, 'M2. org member (métreur) : projet privé d''autrui invisible');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
select is((select count(*)::int from public.tools_releves_chantiers where releve_id = 'f1000000-0000-0000-0000-000000000001'), 2,
  'M3. admin Relevé : voit les chantiers des projets privés de son entreprise');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select lives_ok($$update public.tools_releves set visibilite = 'entreprise' where id = 'f1000000-0000-0000-0000-000000000001'$$,
  'M4. owner : partage le projet avec l''entreprise');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select is((select count(*)::int from public.tools_releves_chantiers where releve_id = 'f1000000-0000-0000-0000-000000000001'), 2,
  'M5. org member (métreur) : voit les chantiers du projet partagé');
select lives_ok(
  $$insert into public.tools_releves_chantiers(releve_id, nom) values ('f1000000-0000-0000-0000-000000000001', 'Chantier Est')$$,
  'M6. org member (métreur) : ajoute un chantier au projet partagé');
select throws_ok($$update public.tools_releves set deleted_at = now() where id = 'f1000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'M7. org member (métreur) : ne supprime pas le projet d''autrui');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select is((select count(*)::int from public.tools_releves_chantiers where releve_id = 'f1000000-0000-0000-0000-000000000001'), 3,
  'M8. org member (consultation) : lecture des chantiers partagés');
select throws_ok(
  $$insert into public.tools_releves_chantiers(releve_id, nom) values ('f1000000-0000-0000-0000-000000000001', 'Intrus')$$,
  '42501', null, 'M9. org member (consultation) : création de chantier refusée');
update public.tools_releves_chantiers set nom = 'Renommé en lecture' where id = 'f2000000-0000-0000-0000-000000000001';
select is((select nom from public.tools_releves_chantiers where id = 'f2000000-0000-0000-0000-000000000001'), 'Chantier Nord',
  'M10. org member (consultation) : modification sans effet (RLS USING)');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is((select count(*)::int from public.tools_releves_chantiers), 0,
  'M11. unauthorized (Tools Pro sans add-on, rôle métreur) : aucun chantier visible, même partagé');
select throws_ok(
  $$insert into public.tools_releves_chantiers(releve_id, nom) values ('f1000000-0000-0000-0000-000000000001', 'Sans droit')$$,
  '42501', null, 'M12. unauthorized (Tools Pro sans add-on) : écriture refusée');
select throws_ok(
  $$insert into public.tools_releves_batiments(releve_id, nom) values ('f1000000-0000-0000-0000-000000000002', 'Sans droit')$$,
  '42501', null, 'M13. unauthorized : aucun chantier par défaut créé en effet de bord');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is((select count(*)::int from public.tools_releves), 0,
  'M14. unauthorized (add-on sans rôle Tools dans l''entreprise) : aucun projet visible');
select throws_ok(
  $$insert into public.tools_releves(entreprise_id, nom, chantier_nom) values ('a0000000-0000-0000-0000-000000000001', 'Sans rôle', 'X')$$,
  '42501', null, 'M15. unauthorized (add-on sans rôle) : création refusée — l''entitlement seul ne suffit pas');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000006', true);
select is((select count(*)::int from public.tools_releves_chantiers), 0, 'M16. other tenant : aucun chantier de A visible');
select throws_ok(
  $$insert into public.tools_releves_chantiers(releve_id, nom) values ('f1000000-0000-0000-0000-000000000001', 'Greffe B')$$,
  '42501', null, 'M17. other tenant : écriture dans un projet de A refusée');
select lives_ok($$
  insert into public.tools_releves(id, entreprise_id, nom, chantier_nom)
    values ('f1000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-000000000001', 'Projet B', 'Chantier B');
$$, 'M18. other tenant : crée son propre projet');
select throws_ok(
  $$insert into public.tools_releves_chantiers(releve_id, entreprise_id, nom)
    values ('f1000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-000000000001', 'Tenant forgé')$$,
  '23503', null, 'M19. other tenant : entreprise_id forgé sur un chantier refusé par clé composite');
select throws_ok(
  $$insert into public.tools_releves_chantiers(releve_id, nom, chantier_gp_id)
    values ('f1000000-0000-0000-0000-0000000000b1', 'Lien croisé', 'a4000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'M20. other tenant : lien vers un chantier Gestion Pro de A refusé');
select ok(
  not public.tools_releve_storage_autorise('a0000000-0000-0000-0000-000000000001/f1000000-0000-0000-0000-000000000001/documents/f7000000-0000-0000-0000-000000000001.pdf', 'lecture')
  and not public.tools_releve_storage_autorise('b0000000-0000-0000-0000-000000000001/f1000000-0000-0000-0000-000000000001/exports/f7000000-0000-0000-0000-000000000001.pdf', 'ecriture'),
  'M21. other tenant : ni lecture des documents de A, ni export sous un chemin forgé');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select ok(
  public.tools_releve_storage_autorise('a0000000-0000-0000-0000-000000000001/f1000000-0000-0000-0000-000000000001/photos/f7000000-0000-0000-0000-000000000001.jpg', 'ecriture')
  and public.tools_releve_storage_autorise('a0000000-0000-0000-0000-000000000001/f1000000-0000-0000-0000-000000000001/documents/f7000000-0000-0000-0000-000000000002.pdf', 'ecriture')
  and public.tools_releve_storage_autorise('a0000000-0000-0000-0000-000000000001/f1000000-0000-0000-0000-000000000001/exports/f7000000-0000-0000-0000-000000000003.pdf', 'ecriture'),
  'M22. owner : photos, documents et exports sous {entreprise}/{projet}/{catégorie}');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select count(*) from public.tools_releves_chantiers$$, '42501', null, 'M23. anon : aucun accès aux chantiers');
reset role;

set local role service_role;
select ok(
  (select count(distinct entreprise_id) from public.tools_releves_chantiers where releve_id in
     ('f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000002')) = 1
  and (select count(*) from public.tools_releves_chantiers where releve_id = 'f1000000-0000-0000-0000-000000000001') = 3,
  'M24. service role : lecture serveur sans RLS (usage back-office)');
select throws_ok(
  $$insert into public.tools_releves_chantiers(releve_id, entreprise_id, nom)
    values ('f1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Forgé service')$$,
  '23503', null, 'M25. service role : même lui ne peut pas forger le tenant d''un chantier');
select throws_ok(
  $$update public.tools_releves_chantiers set chantier_gp_id = 'b4000000-0000-0000-0000-000000000001' where id = 'f2000000-0000-0000-0000-000000000002'$$,
  '42501', null, 'M26. service role : lien GP inter-entreprise refusé');
select throws_ok(
  $$insert into public.entitlements_utilisateurs_elsatia(utilisateur_id, application_code, niveau, capabilities, source)
    values ('20000000-0000-0000-0000-000000000002', 'tools', 'pro', array['releve-metre'], 'apple')$$,
  '23514', null, 'M27. service role : aucune activation commerciale de releve-metre (source store)');
select throws_ok($$select public.tools_resoudre_entitlements()$$, '42501', null,
  'M28. service role : le résolveur d''entitlements reste réservé aux utilisateurs');
reset role;
set local role authenticated;

-- ═══ N. Versions typées (OWNER) ═════════════════════════════════════════════
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select is(
  (select type_version || '|' || numero || '|' || (version_base_id is null)
   from public.tools_releve_creer_version('f1000000-0000-0000-0000-000000000001', 'Relevé de l''existant')),
  'initial|1|true', 'N1. première version : initial, sans base');
select throws_ok(
  $$select public.tools_releve_creer_version('f1000000-0000-0000-0000-000000000001', null, 'initial')$$,
  '23505', null, 'N2. la version initiale est unique');
select is(
  (select v.type_version || '|' || b.numero
   from public.tools_releve_creer_version('f1000000-0000-0000-0000-000000000001', 'Cote reprise') v
   join public.tools_releves_versions b on b.id = v.version_base_id),
  'corrige|1', 'N3. version suivante par défaut : corrige, base = dernière version');
select is(
  (select v.type_version || '|' || (v.contenu->>'type_version') || '|' || jsonb_array_length(v.contenu->'chantiers')
   from public.tools_releve_creer_version('f1000000-0000-0000-0000-000000000001', 'Plan rénové', 'projete',
     (select id from public.tools_releves_versions where releve_id = 'f1000000-0000-0000-0000-000000000001' and numero = 1)) v),
  'projete|projete|3', 'N4. version projetée sur base explicite ; instantané typé incluant les chantiers');
select is(
  (select type_version from public.tools_releve_creer_version('f1000000-0000-0000-0000-000000000001', 'DOE', 'as_built')),
  'as_built', 'N5. version as-built');
select throws_ok(
  $$select public.tools_releve_creer_version('f1000000-0000-0000-0000-000000000001', null, 'brouillon')$$,
  '22023', null, 'N6. type de version inconnu refusé');
select throws_ok(
  $$select public.tools_releve_creer_version('f1000000-0000-0000-0000-000000000002', null, 'projete')$$,
  '22023', null, 'N7. une version non initiale exige une version initiale');
select lives_ok($$select public.tools_releve_creer_version('f1000000-0000-0000-0000-000000000002')$$,
  'N8. version initiale du second projet');
select throws_ok(
  $$select public.tools_releve_creer_version('f1000000-0000-0000-0000-000000000002', null, 'corrige',
      (select id from public.tools_releves_versions where releve_id = 'f1000000-0000-0000-0000-000000000001' and numero = 1))$$,
  '42501', null, 'N9. la base doit appartenir au même projet');
select throws_ok($$update public.tools_releves_versions set type_version = 'as_built'$$,
  '42501', null, 'N10. le type d''une version est immuable');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select throws_ok($$select public.tools_releve_creer_version('f1000000-0000-0000-0000-000000000001', null, 'corrige')$$,
  '42501', null, 'N11. consultation : création de version refusée');
select is(
  (select string_agg(type_version, ',' order by numero) from public.tools_releves_versions where releve_id = 'f1000000-0000-0000-0000-000000000001'),
  'initial,corrige,projete,as_built', 'N12. consultation : historique typé lisible, dans l''ordre');

reset role;
select * from finish();
rollback;
