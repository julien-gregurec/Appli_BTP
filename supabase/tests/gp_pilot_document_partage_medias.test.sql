-- GP-EXTERNAL-PILOT-CLOSURE-V1 — document_partage_media_path() ne résout un
-- média que s'il appartient au document ouvert par CE jeton précis, jamais un
-- média d'un autre document/une autre entreprise, jamais pour un brouillon.
-- Voir 20260916000308_gp_pilot_document_partage_medias.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir fixtures/isolation_multitenant.inc

insert into public.devis (
  id, entreprise_id, numero, client_id, statut, montant_ht, montant_tva, montant_ttc
) values
  ('d8000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'PART-MEDIA-DEV-A', 'a3000000-0000-0000-0000-000000000001', 'envoye', 100, 20, 120),
  ('d8000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'PART-MEDIA-DEV-A-BROUILLON', 'a3000000-0000-0000-0000-000000000001', 'brouillon', 100, 20, 120),
  ('d8000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'PART-MEDIA-DEV-B', 'b3000000-0000-0000-0000-000000000001', 'envoye', 50, 10, 60);

insert into public.pieces_jointes_devis (
  id, entreprise_id, devis_id, storage_path, nom_original, mime_type, type_media, taille_octets
) values
  ('e8000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001/d8000000-0000-0000-0000-000000000001/photo.jpg', 'photo.jpg', 'image/jpeg', 'image', 1000),
  ('e8000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000003',
   'b0000000-0000-0000-0000-000000000001/d8000000-0000-0000-0000-000000000003/photo.jpg', 'photo.jpg', 'image/jpeg', 'image', 1000);

insert into public.acces_externes_documents (entreprise_id, type_document, document_id, token_hash, expire_le, revoque_le) values
  ('a0000000-0000-0000-0000-000000000001', 'devis', 'd8000000-0000-0000-0000-000000000001',
   encode(sha256(convert_to('jeton-media-devis-a-valide-0000000000000000000', 'UTF8')), 'hex'), now() + interval '60 days', null),
  ('a0000000-0000-0000-0000-000000000001', 'devis', 'd8000000-0000-0000-0000-000000000002',
   encode(sha256(convert_to('jeton-media-devis-a-brouillon-000000000000000', 'UTF8')), 'hex'), now() + interval '60 days', null);

set local role service_role;
select set_config('request.jwt.claim.sub', '', true);

select is(
  public.document_partage_media_path('jeton-media-devis-a-valide-0000000000000000000', 'photo', 'e8000000-0000-0000-0000-000000000001') ->> 'storage_path',
  'a0000000-0000-0000-0000-000000000001/d8000000-0000-0000-0000-000000000001/photo.jpg',
  'résout la photo qui appartient réellement au devis ouvert par ce jeton'
);
select is(
  public.document_partage_media_path('jeton-media-devis-a-valide-0000000000000000000', 'photo', 'e8000000-0000-0000-0000-000000000001') ->> 'bucket',
  'devis-medias',
  'renvoie le bon bucket'
);
select ok(
  public.document_partage_media_path('jeton-media-devis-a-valide-0000000000000000000', 'photo', 'e8000000-0000-0000-0000-000000000002') is null,
  'refuse une photo appartenant à un AUTRE devis (même via un jeton par ailleurs valide)'
);
select ok(
  public.document_partage_media_path('jeton-media-devis-a-brouillon-000000000000000', 'photo', 'e8000000-0000-0000-0000-000000000001') is null,
  'refuse toute résolution pour un devis encore brouillon, même avec un jeton valide'
);
select ok(
  public.document_partage_media_path('jeton-inconnu-00000000000000000000000000000000', 'photo', 'e8000000-0000-0000-0000-000000000001') is null,
  'jeton inconnu : rien'
);
select ok(
  public.document_partage_media_path('jeton-media-devis-a-valide-0000000000000000000', 'autre', 'e8000000-0000-0000-0000-000000000001') is null,
  'type de média invalide : rien'
);
select ok(
  not has_function_privilege('authenticated', 'public.document_partage_media_path(text,text,uuid)', 'EXECUTE'),
  'authenticated ne peut pas appeler la fonction directement'
);
select ok(
  not has_function_privilege('anon', 'public.document_partage_media_path(text,text,uuid)', 'EXECUTE'),
  'anon ne peut pas appeler la fonction directement'
);
select ok(
  not has_table_privilege('service_role', 'public.pieces_jointes_devis', 'SELECT'),
  'service_role ne lit toujours pas pieces_jointes_devis directement (20260911000297 intacte)'
);

reset role;
select * from finish();
rollback;
