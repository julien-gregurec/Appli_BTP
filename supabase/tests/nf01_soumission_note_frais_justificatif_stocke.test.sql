-- NF-01 : une note de frais ne peut être soumise que si un justificatif est
-- réellement stocké (20260923000354). Avant : une ligne documents_notes_frais
-- orpheline (upload interrompu, aucun fichier) suffisait à passer `soumis`.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Sans aucun justificatif : refus (comportement conservé).
-- ───────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.transition_note_frais('a6000000-0000-0000-0000-000000000001','soumis')$$,
  'P0001', 'Ajoutez au moins un justificatif', '1. aucune pièce : soumission refusée');
reset role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Ligne document orpheline (upload interrompu avant/pendant le stockage).
-- ───────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '', true);
insert into public.documents_notes_frais (id, entreprise_id, note_frais_id, type_document)
values ('a6010000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000001','ticket_caisse');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.transition_note_frais('a6000000-0000-0000-0000-000000000001','soumis')$$,
  'P0001', 'Ajoutez au moins un justificatif', '2. negative witness : document sans fichier stocké -> refusé (défaut reproduit puis corrigé)');
reset role;
select is((select statut from public.notes_frais where id='a6000000-0000-0000-0000-000000000001'), 'brouillon', '3. la note reste en brouillon');

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Version originale enregistrée (écrite après l'upload Storage réussi).
-- ───────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '', true);
insert into public.versions_documents_notes_frais (entreprise_id, document_id, numero_version, numero_page, role_fichier, storage_path, nom_fichier_original, type_mime_detecte, taille_octets, empreinte_sha256)
values ('a0000000-0000-0000-0000-000000000001','a6010000-0000-0000-0000-000000000001',1,1,'original',
  'companies/a0000000-0000-0000-0000-000000000001/expenses/a6000000-0000-0000-0000-000000000001/original/a6010000-0000-0000-0000-000000000001/p1.jpg',
  'ticket.jpg','image/jpeg',1024, repeat('a',64));

-- Cross-tenant d'abord : l'ouvrier B ne peut pas soumettre la note de A.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.transition_note_frais('a6000000-0000-0000-0000-000000000001','soumis')$$,
  'P0001', 'Dépense inaccessible', '4. cross-tenant : ouvrier B refusé sur la note de A');

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok($$select public.transition_note_frais('a6000000-0000-0000-0000-000000000001','soumis')$$,
  '5. positive witness : justificatif stocké -> soumission acceptée');
reset role;
select is((select statut from public.notes_frais where id='a6000000-0000-0000-0000-000000000001'), 'soumis', '6. note en soumis');

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Session : utilisateur désactivé / entreprise suspendue.
-- ───────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '', true);
insert into public.notes_frais (id, entreprise_id, employe_id, reference, montant_ttc, statut)
values ('a6000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','NDF-NF01-2', 9.90, 'brouillon');
insert into public.documents_notes_frais (id, entreprise_id, note_frais_id, type_document)
values ('a6010000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000002','ticket_caisse');
insert into public.versions_documents_notes_frais (entreprise_id, document_id, numero_version, numero_page, role_fichier, storage_path, nom_fichier_original, type_mime_detecte, taille_octets, empreinte_sha256)
values ('a0000000-0000-0000-0000-000000000001','a6010000-0000-0000-0000-000000000002',1,1,'original','companies/a0000000-0000-0000-0000-000000000001/expenses/a6000000-0000-0000-0000-000000000002/original/x/p1.jpg','t.jpg','image/jpeg',10, repeat('b',64));
update public.entreprises set abonnement_statut = 'suspendu' where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.transition_note_frais('a6000000-0000-0000-0000-000000000002','soumis')$$,
  'P0001', 'Dépense inaccessible', '7. entreprise suspendue : soumission refusée');
reset role;
select set_config('request.jwt.claims', '', true);
update public.entreprises set abonnement_statut = 'actif' where id = 'a0000000-0000-0000-0000-000000000001';
update public.utilisateurs_entreprises set statut = 'desactive'
 where utilisateur_id = '10000000-0000-0000-0000-000000000002' and entreprise_id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.transition_note_frais('a6000000-0000-0000-0000-000000000002','soumis')$$,
  'P0001', 'Dépense inaccessible', '8. utilisateur désactivé : soumission refusée sur un JWT encore valide');
reset role;

select * from finish();
rollback;
