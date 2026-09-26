-- PIECES-JOINTES-V1 : un compte-rendu de chantier peut désormais être rattaché à des
-- documents_chantier existants (colonne compte_rendu_id) au lieu de rester définitivement
-- sans aucune pièce jointe. Voir migration
-- 20260824000226_pieces_jointes_v1_photos_comptes_rendus.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

\ir fixtures/isolation_multitenant.inc

select has_column(
  'public', 'documents_chantier', 'compte_rendu_id',
  '1. documents_chantier porte désormais compte_rendu_id'
);

insert into public.comptes_rendus_chantier (id, entreprise_id, chantier_id, auteur_id, titre, contenu) values
  ('c5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'CR test', 'Contenu test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

select lives_ok(
  $$insert into public.documents_chantier (entreprise_id, chantier_id, compte_rendu_id, nom, categorie, storage_path, mime_type, taille_octets, audience)
    values ('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'photo.jpg', 'photo_pendant', 'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000001/TEST_photo_cr.jpg', 'image/jpeg', 100, 'tous_affectes')$$,
  '2. Admin A peut ajouter une photo rattachée à un compte-rendu de son chantier'
);

reset role;
select is(
  (select count(*)::int from public.documents_chantier where compte_rendu_id = 'c5000000-0000-0000-0000-000000000001'),
  1,
  '3. La photo est bien rattachée au compte-rendu (vérifié en superuser)'
);

-- Cross-tenant : un membre B ne peut pas rattacher une photo à un compte-rendu de A.
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select throws_like(
  $$insert into public.documents_chantier (entreprise_id, chantier_id, compte_rendu_id, nom, categorie, storage_path, mime_type, taille_octets, audience)
    values ('b0000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'photo.jpg', 'photo_pendant', 'b0000000-0000-0000-0000-000000000001/b4000000-0000-0000-0000-000000000001/TEST_cross.jpg', 'image/jpeg', 100, 'tous_affectes')$$,
  '%violates%',
  '4. Un compte-rendu A ne peut pas être référencé par un document B (FK compte_rendu_id -> comptes_rendus_chantier, entreprises distinctes)'
);

-- Suppression du compte-rendu : la photo n'est pas perdue, seul le lien est retiré (ON DELETE SET NULL).
reset role;
delete from public.comptes_rendus_chantier where id = 'c5000000-0000-0000-0000-000000000001';
select is(
  (select compte_rendu_id from public.documents_chantier where storage_path = 'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000001/TEST_photo_cr.jpg'),
  null,
  '5. La suppression du compte-rendu ne supprime pas le document de chantier : seul compte_rendu_id repasse à null (ON DELETE SET NULL)'
);
select is(
  (select count(*)::int from public.documents_chantier where storage_path = 'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000001/TEST_photo_cr.jpg'),
  1,
  '6. ...la photo elle-même reste un document de chantier normal'
);

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'documents_chantier'),
  8,
  '7. Non-régression : les 8 policies RLS existantes sur documents_chantier sont inchangées (aucune policy dédiée nécessaire pour la nouvelle colonne)'
);

select * from finish();
rollback;
