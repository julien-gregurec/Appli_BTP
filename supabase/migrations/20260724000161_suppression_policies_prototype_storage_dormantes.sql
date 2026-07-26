-- Nettoyage proactif : 5 buckets de stockage (pointage-preuves, factures-fournisseurs,
-- documents-employes, notes-frais, chantier-documents) conservent chacun une policy
-- "prototype" pre-verrouillage accordant l'acces a anon sur storage.objects. Le
-- verrouillage global du 2026-07-14 (revoke all privileges on storage.objects from anon)
-- neutralise deja ces policies en pratique (aucun privilege = jamais evaluees), mais ce
-- privilege est accorde TABLE PAR TABLE, pas bucket par bucket : le prochain
-- "grant ... on storage.objects to anon" copie-colle par erreur (deja arrive 2 fois
-- aujourd'hui pour d'autres objets) reactiverait les 5 buckets d'un coup, dont
-- documents-employes qui contient cartes BTP, signatures et photos.
--
-- Meme nettoyage deja applique a fiches-techniques (20260724000156). On le termine ici
-- pour les 5 buckets restants plutot que d'attendre une regression pour le faire.

drop policy if exists "prototype preuves pointage" on storage.objects;
drop policy if exists "prototype factures fournisseurs" on storage.objects;
drop policy if exists "prototype documents employés" on storage.objects;
drop policy if exists notes_frais_documents_prototype on storage.objects;
drop policy if exists chantier_documents_prototype on storage.objects;

notify pgrst, 'reload schema';
