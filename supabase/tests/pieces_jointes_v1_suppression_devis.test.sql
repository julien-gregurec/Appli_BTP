-- PIECES-JOINTES-V1 : retirer_piece_jointe_devis() permet enfin de retirer une pièce jointe
-- déjà enregistrée (aucun chemin n'existait avant ce lot). Voir migration
-- 20260824000225_pieces_jointes_v1_suppression_devis.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

\ir fixtures/isolation_multitenant.inc

insert into public.devis (id, entreprise_id, client_id) values
  ('d5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001'),
  ('d5000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001');

insert into public.pieces_jointes_devis (id, entreprise_id, devis_id, storage_path, nom_original, mime_type, type_media, taille_octets) values
  ('e5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001/d5000000-0000-0000-0000-000000000001/photo.jpg', 'photo.jpg', 'image/jpeg', 'image', 1000),
  ('e5000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001/d5000000-0000-0000-0000-000000000002/photo.jpg', 'photo.jpg', 'image/jpeg', 'image', 1000);

-- Ouvrier A (voir_chantiers_assignes/saisir_ses_notes_frais/pointage — sans gerer_devis) ne peut pas retirer.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select throws_like(
  $$select public.retirer_piece_jointe_devis('e5000000-0000-0000-0000-000000000001')$$,
  '%Accès refusé%',
  '1. Un membre sans gerer_devis ne peut pas retirer une pièce jointe de devis'
);
reset role;
select ok(
  exists(select 1 from public.pieces_jointes_devis where id = 'e5000000-0000-0000-0000-000000000001'),
  '2. ...et la pièce jointe existe toujours (vérifié en superuser)'
);

-- Admin A (gerer_devis) peut retirer la sienne.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select is(
  public.retirer_piece_jointe_devis('e5000000-0000-0000-0000-000000000001'),
  'a0000000-0000-0000-0000-000000000001/d5000000-0000-0000-0000-000000000001/photo.jpg',
  '3. Admin A (gerer_devis) retire sa pièce jointe et récupère le storage_path pour le nettoyage Storage'
);
reset role;
select ok(
  not exists(select 1 from public.pieces_jointes_devis where id = 'e5000000-0000-0000-0000-000000000001'),
  '4. ...et la ligne est bien supprimée (vérifié en superuser)'
);

-- Cross-tenant : Admin A ne peut pas retirer une pièce jointe de l'entreprise B.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select throws_like(
  $$select public.retirer_piece_jointe_devis('e5000000-0000-0000-0000-000000000002')$$,
  '%Accès refusé%',
  '5. Admin A ne peut pas retirer une pièce jointe du devis B (isolation cross-tenant)'
);
reset role;
select ok(
  exists(select 1 from public.pieces_jointes_devis where id = 'e5000000-0000-0000-0000-000000000002'),
  '6. ...et la pièce jointe B existe toujours (vérifié en superuser)'
);

select * from finish();
rollback;
