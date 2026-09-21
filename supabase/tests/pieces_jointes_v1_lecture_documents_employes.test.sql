-- PIECES-JOINTES-V1 : la lecture directe (Storage SELECT, donc aussi createSignedUrl)
-- de documents-employes ne dependait que de est_membre_actif() — n'importe quel membre
-- actif pouvait lire la carte BTP ou la signature dessinee de n'importe quel autre salarie
-- sans la permission gerer_employes. La photo reste volontairement ouverte a tout membre
-- actif (annuaire). Voir migration 20260824000224_pieces_jointes_v1_rls_lecture_sensible.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir fixtures/isolation_multitenant.inc

-- Fixture : Ouvrier A (a2...0002, sans gerer_employes) et Admin A (a2...0001, avec
-- gerer_employes) ont chacun une carte BTP, une signature et une photo.
update public.employes set
  carte_btp_storage_path = 'a0000000-0000-0000-0000-000000000001/a2000000-0000-0000-0000-000000000002/carte-btp.pdf',
  signature_storage_path = 'a0000000-0000-0000-0000-000000000001/a2000000-0000-0000-0000-000000000002/signature.png',
  photo_storage_path = 'a0000000-0000-0000-0000-000000000001/a2000000-0000-0000-0000-000000000002/photo.jpg'
where id = 'a2000000-0000-0000-0000-000000000002';

update public.employes set
  carte_btp_storage_path = 'a0000000-0000-0000-0000-000000000001/a2000000-0000-0000-0000-000000000001/carte-btp.pdf',
  signature_storage_path = 'a0000000-0000-0000-0000-000000000001/a2000000-0000-0000-0000-000000000001/signature.png',
  photo_storage_path = 'a0000000-0000-0000-0000-000000000001/a2000000-0000-0000-0000-000000000001/photo.jpg'
where id = 'a2000000-0000-0000-0000-000000000001';

insert into storage.objects (bucket_id, name, owner) values
  ('documents-employes', 'a0000000-0000-0000-0000-000000000001/a2000000-0000-0000-0000-000000000002/carte-btp.pdf', '10000000-0000-0000-0000-000000000002'),
  ('documents-employes', 'a0000000-0000-0000-0000-000000000001/a2000000-0000-0000-0000-000000000002/signature.png', '10000000-0000-0000-0000-000000000002'),
  ('documents-employes', 'a0000000-0000-0000-0000-000000000001/a2000000-0000-0000-0000-000000000002/photo.jpg', '10000000-0000-0000-0000-000000000002'),
  ('documents-employes', 'a0000000-0000-0000-0000-000000000001/a2000000-0000-0000-0000-000000000001/carte-btp.pdf', '10000000-0000-0000-0000-000000000001'),
  ('documents-employes', 'a0000000-0000-0000-0000-000000000001/a2000000-0000-0000-0000-000000000001/signature.png', '10000000-0000-0000-0000-000000000001')
on conflict do nothing;

-- ===== Ouvrier A : sans gerer_employes =====
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);

select is(
  (select count(*)::int from storage.objects where name = 'a0000000-0000-0000-0000-000000000001/a2000000-0000-0000-0000-000000000002/carte-btp.pdf'),
  1,
  '1. Ouvrier A peut lire SA PROPRE carte BTP (self)'
);
select is(
  (select count(*)::int from storage.objects where name = 'a0000000-0000-0000-0000-000000000001/a2000000-0000-0000-0000-000000000002/signature.png'),
  1,
  '2. Ouvrier A peut lire SA PROPRE signature (self)'
);
select is(
  (select count(*)::int from storage.objects where name = 'a0000000-0000-0000-0000-000000000001/a2000000-0000-0000-0000-000000000001/carte-btp.pdf'),
  0,
  '3. Ouvrier A NE PEUT PAS lire la carte BTP de l''Admin A (sans gerer_employes, pas self) -- correctif de ce lot'
);
select is(
  (select count(*)::int from storage.objects where name = 'a0000000-0000-0000-0000-000000000001/a2000000-0000-0000-0000-000000000001/signature.png'),
  0,
  '4. Ouvrier A NE PEUT PAS lire la signature de l''Admin A -- correctif de ce lot'
);
select is(
  (select count(*)::int from storage.objects where name = 'a0000000-0000-0000-0000-000000000001/a2000000-0000-0000-0000-000000000001/photo.jpg'),
  0,
  '5. La photo de l''Admin A n''a pas de ligne storage.objects insérée dans cette fixture (contrôle négatif de comptage, pas de policy) '
);

-- La photo reste volontairement ouverte à tout membre actif (annuaire) : on vérifie
-- directement la fonction plutôt que d'ajouter une ligne storage.objects supplémentaire.
select is(
  public.peut_lire_document_employe_sensible('a0000000-0000-0000-0000-000000000001/a2000000-0000-0000-0000-000000000001/photo.jpg'),
  true,
  '6. La photo d''un autre salarié reste lisible par tout membre actif (annuaire, comportement volontairement inchangé)'
);

-- ===== Admin A : avec gerer_employes =====
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

select is(
  (select count(*)::int from storage.objects where name = 'a0000000-0000-0000-0000-000000000001/a2000000-0000-0000-0000-000000000002/carte-btp.pdf'),
  1,
  '7. Admin A (gerer_employes) peut lire la carte BTP de l''ouvrier A'
);
select is(
  (select count(*)::int from storage.objects where name = 'a0000000-0000-0000-0000-000000000001/a2000000-0000-0000-0000-000000000002/signature.png'),
  1,
  '8. Admin A (gerer_employes) peut lire la signature de l''ouvrier A'
);

-- Cross-tenant : Admin B ne doit rien voir des documents de l'entreprise A.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'documents-employes' and name like 'a0000000-0000-0000-0000-000000000001/%'),
  0,
  '9. Admin B (autre entreprise) ne voit aucun document-employe de l''entreprise A (isolation cross-tenant, inchangée)'
);

select * from finish();
rollback;
