-- Signature numérique dessinée de l'employé.
--
-- L'image PNG est stockée dans le bucket privé « documents-employes » déjà en
-- place (mêmes règles d'accès : lecture réservée aux membres de l'entreprise,
-- écriture au droit gerer_employes). On n'ajoute donc que les deux repères sur
-- la fiche, sur le modèle exact de la photo.
alter table public.employes
  add column if not exists signature_storage_path text,
  add column if not exists signature_at timestamptz;
