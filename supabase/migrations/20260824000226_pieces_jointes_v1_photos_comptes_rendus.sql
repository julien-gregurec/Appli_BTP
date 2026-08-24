-- PIECES-JOINTES-V1 : les comptes-rendus de chantier (dictée/texte structuré par IA,
-- comptes_rendus_chantier) n'avaient aucune pièce jointe possible — pas de colonne, pas de
-- bucket dédié, alors que documents_chantier (photos, bucket chantier-documents) existe déjà
-- et couvre exactement le même besoin. Plutôt que créer un 4e système de stockage (le lot
-- demande explicitement de réutiliser l'existant), on rattache simplement un document de
-- chantier existant à un compte-rendu via une colonne nullable : un compte-rendu peut ainsi
-- avoir 0..N photos, chacune restant un document de chantier à part entière (mêmes règles
-- de permission, de stockage et de suppression, aucune duplication de logique).

-- FK composite (id, entreprise_id) plutot qu'un simple id : un document_chantier ne doit
-- jamais pouvoir referencer le compte-rendu d'une AUTRE entreprise (meme piege deja corrige
-- ailleurs sur factures.devis_origine_id, cf. 20260806000197_correctif_isolation_factures.sql).
alter table public.comptes_rendus_chantier
  add constraint comptes_rendus_chantier_id_entreprise_id_key unique (id, entreprise_id);

alter table public.documents_chantier
  add column if not exists compte_rendu_id uuid;
-- ON DELETE SET NULL sur une FK composite met a NULL TOUTES ses colonnes par defaut
-- (y compris entreprise_id, non-nullable !) sauf a preciser explicitement la liste des
-- colonnes a annuler : seule compte_rendu_id doit repasser a null, jamais entreprise_id.
alter table public.documents_chantier
  add constraint documents_chantier_compte_rendu_id_fkey
  foreign key (compte_rendu_id, entreprise_id)
  references public.comptes_rendus_chantier(id, entreprise_id)
  on delete set null (compte_rendu_id);

create index if not exists documents_chantier_compte_rendu_idx
  on public.documents_chantier(compte_rendu_id) where compte_rendu_id is not null;

notify pgrst, 'reload schema';
