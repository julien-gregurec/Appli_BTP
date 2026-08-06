-- Vérifie le correctif de la migration 20260806000196 : restauration du socle PERMISSIVE
-- d'écriture (insert/update/delete) sur public.chantiers, avec vérification de cohérence
-- entreprise/client, sans régression des policies SELECT ni des RESTRICTIVE existantes.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

\ir fixtures/isolation_multitenant.inc

-- Admin B (membre actif, permission gerer_chantiers) peut créer un chantier rattaché à son propre client.
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select lives_ok(
  $$insert into public.chantiers (id, entreprise_id, client_id, nom, statut)
    values ('c4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'CORRECTIF_RLS_Chantier B', 'prospect')$$,
  'admin B peut créer un chantier rattaché à son propre client'
);
select is(
  (select entreprise_id from public.chantiers where id = 'c4000000-0000-0000-0000-000000000001'),
  'b0000000-0000-0000-0000-000000000001'::uuid,
  'le chantier créé appartient bien à B'
);

-- Admin B ne peut pas déclarer un chantier dans l'entreprise A.
select throws_like(
  $$insert into public.chantiers (entreprise_id, client_id, nom, statut)
    values ('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'CORRECTIF_RLS_Intrusion B vers A', 'prospect')$$,
  '%row-level security%', 'admin B ne peut pas créer un chantier déclaré dans A'
);

-- Admin B ne peut pas rattacher un chantier de B à un client de A.
select throws_like(
  $$insert into public.chantiers (entreprise_id, client_id, nom, statut)
    values ('b0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'CORRECTIF_RLS_Client croise', 'prospect')$$,
  '%row-level security%', 'admin B ne peut pas rattacher un chantier B à un client A'
);

-- Ouvrier B, membre actif mais sans la permission gerer_chantiers, ne peut pas créer de chantier.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-b@invalid.local', true);
select throws_like(
  $$insert into public.chantiers (entreprise_id, client_id, nom, statut)
    values ('b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'CORRECTIF_RLS_Sans permission', 'prospect')$$,
  '%row-level security%', 'ouvrier B sans gerer_chantiers ne peut pas créer de chantier'
);

-- Administrateur plateforme, non membre de B, ne peut pas créer de chantier dans B.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'plateforme@invalid.local', true);
select throws_like(
  $$insert into public.chantiers (entreprise_id, client_id, nom, statut)
    values ('b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'CORRECTIF_RLS_Non membre', 'prospect')$$,
  '%row-level security%', 'un non-membre ne peut pas créer de chantier dans B'
);

-- Admin B peut modifier son propre chantier.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select lives_ok(
  $$update public.chantiers set statut = 'en_cours' where id = 'c4000000-0000-0000-0000-000000000001'$$,
  'admin B peut modifier son propre chantier'
);
select is(
  (select statut from public.chantiers where id = 'c4000000-0000-0000-0000-000000000001'),
  'en_cours', 'le statut du chantier B a bien été mis à jour'
);

-- Admin B ne peut pas modifier un chantier de A : aucune ligne visible, pas d'erreur, pas d'effet.
-- Vérification après coup via un rôle privilégié (reset role), car la session B elle-même
-- n'a de toute façon aucune visibilité SELECT sur les données de A : un contrôle fait sous
-- la session B serait aveugle et ne prouverait rien, qu'il y ait eu altération ou non.
select lives_ok(
  $$update public.chantiers set nom = 'CORRECTIF_RLS_Altere' where id = 'a4000000-0000-0000-0000-000000000001'$$,
  'la tentative de modification hors périmètre ne lève pas d''erreur mais ne modifie rien'
);
reset role;
select isnt(
  (select nom from public.chantiers where id = 'a4000000-0000-0000-0000-000000000001'),
  'CORRECTIF_RLS_Altere', 'admin B ne peut pas modifier un chantier de A (vérifié en superuser)'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);

-- Admin B peut supprimer son propre chantier de test.
select lives_ok(
  $$delete from public.chantiers where id = 'c4000000-0000-0000-0000-000000000001'$$,
  'admin B peut supprimer son propre chantier'
);
select is(
  (select count(*) from public.chantiers where id = 'c4000000-0000-0000-0000-000000000001'),
  0::bigint, 'le chantier B supprimé a bien disparu'
);

-- Les policies SELECT existantes ne régressent pas : admin B ne voit toujours que ses chantiers.
select is(
  (select count(*) from public.chantiers), 2::bigint,
  'admin B ne voit toujours que les chantiers B après le correctif (pas de régression SELECT)'
);

-- Admin B ne peut pas supprimer un chantier de A. Vérification après coup en superuser,
-- pour la même raison que la modification ci-dessus : la session B est aveugle à A en SELECT.
select lives_ok(
  $$delete from public.chantiers where id = 'a4000000-0000-0000-0000-000000000001'$$,
  'la tentative de suppression hors périmètre ne lève pas d''erreur mais ne supprime rien'
);
reset role;
select is(
  (select count(*) from public.chantiers where id = 'a4000000-0000-0000-0000-000000000001'),
  1::bigint, 'admin B ne peut pas supprimer un chantier de A (vérifié en superuser)'
);
select * from finish();
rollback;
