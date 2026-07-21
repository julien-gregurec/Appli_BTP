-- Les FK composites (col, entreprise_id) de conversations_internes ont été
-- créées sans nom explicite : Postgres a généré des noms auto (dont un
-- tronqué à 63 caractères pour destinataire_employe_id), rendant les hints
-- d'embed PostgREST utilisés par l'application invalides ("relationship not
-- found"). Toute la liste des conversations échouait silencieusement côté
-- app (page.tsx catchait aucune erreur sur cette requête précise).
-- On fixe des noms explicites, stables, lisibles.

alter table public.conversations_internes
  rename constraint conversations_internes_cree_par_employe_id_entreprise_id_fkey
  to conversations_createur_fkey;

alter table public.conversations_internes
  rename constraint conversations_internes_destinataire_employe_id_entreprise__fkey
  to conversations_destinataire_fkey;

notify pgrst, 'reload schema';
