-- Complément du tenant réaliste pour la réconciliation RGPD × contrats acceptés (V1).
-- À inclure APRÈS fixtures/isolation_multitenant.inc et fixtures/rgpd_tenant_facture_emise.inc.
--
-- Second devis accepté du même client, émis alors que le client a un contact principal
-- (le snapshot figé porte donc nom, e-mail et téléphone du contact), avec des notes
-- internes, l'adresse d'envoi de l'e-mail, une photo (imprimée sur le devis) et une note
-- vocale dans Storage (bucket devis-medias), et une signature interne d'un salarié
-- (signatures_documents, table RETAIN). Tout ce qu'un instantané minimisé doit retirer
-- ou garder est présent au moins une fois.
set local elsatia.capacite_personnes_bypass = 'on';

insert into public.contacts_clients (id, client_id, nom, fonction, telephone, email, principal)
values ('c1100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
        'Julie Lefèvre', 'Conjointe', '0699887766', 'julie.lefevre@example.test', true);

insert into storage.objects (id, bucket_id, name, metadata) values
  ('c8000000-0000-0000-0000-000000000011', 'devis-medias',
   'a0000000-0000-0000-0000-000000000001/c3000000-0000-0000-0000-000000000002/facade.jpg', '{"mimetype":"image/jpeg"}'),
  ('c8000000-0000-0000-0000-000000000012', 'devis-medias',
   'a0000000-0000-0000-0000-000000000001/c3000000-0000-0000-0000-000000000002/memo.webm', '{"mimetype":"audio/webm"}'),
  ('c8000000-0000-0000-0000-000000000013', 'documents-employes',
   'a0000000-0000-0000-0000-000000000001/signatures/devis-c3000000-0002.png', '{"mimetype":"image/png"}')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into public.devis (id, entreprise_id, client_id, chantier_id, statut, date_emission, conditions, notes_client, notes_internes)
values ('c3000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
        'c2000000-0000-0000-0000-000000000001', 'brouillon', current_date - 40,
        'Acompte 30 % à la commande, solde à réception.', 'Accès par le portail côté jardin.',
        'Client pointilleux, rappeler Mme Lefèvre le soir au 0699887766.');
insert into public.lignes_devis (id, devis_id, designation, description, type, quantite, unite, prix_unitaire_ht, taux_tva, ordre) values
  ('c3100000-0000-0000-0000-000000000011', 'c3000000-0000-0000-0000-000000000002', 'Ravalement façade', 'Nettoyage + enduit', 'main_oeuvre', 80, 'm2', 25.00, 10, 1),
  ('c3100000-0000-0000-0000-000000000012', 'c3000000-0000-0000-0000-000000000002', 'Échafaudage', null, 'forfait', 1, 'forfait', 900.00, 20, 2);
update public.devis set statut = 'envoye' where id = 'c3000000-0000-0000-0000-000000000002';
update public.devis set statut = 'accepte' where id = 'c3000000-0000-0000-0000-000000000002';

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.email', '', true);
select set_config('request.jwt.claims', '', true);

-- Écrits par l'API (client d'administration) dans l'application : hors RLS ici.
update public.devis set email_envoye_le = now() - interval '39 days', email_envoye_a = 'julie.lefevre@example.test'
 where id = 'c3000000-0000-0000-0000-000000000002';
insert into public.pieces_jointes_devis (id, entreprise_id, devis_id, storage_path, nom_original, mime_type, type_media, taille_octets, legende) values
  ('c3200000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001/c3000000-0000-0000-0000-000000000002/facade.jpg', 'facade.jpg', 'image/jpeg', 'image', 2048, 'Façade avant travaux'),
  ('c3200000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001/c3000000-0000-0000-0000-000000000002/memo.webm', 'memo.webm', 'audio/webm', 'audio', 4096, 'Note vocale visite');
insert into public.signatures_documents (id, entreprise_id, employe_id, type_document, document_id, signature_storage_path,
                                         signature_sha256, document_sha256, nom_signataire, fonction_signataire)
values ('c3300000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
        'devis', 'c3000000-0000-0000-0000-000000000002',
        'a0000000-0000-0000-0000-000000000001/signatures/devis-c3000000-0002.png',
        repeat('a', 64), repeat('b', 64), 'Paul Martin', 'Conducteur de travaux');
