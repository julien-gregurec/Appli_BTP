-- Recette E2E post-migrations 185-190 : les tables du socle comptes avaient
-- leurs policies RLS, mais aucun privilège SQL pour authenticated après une
-- reconstruction complète. PostgreSQL rejetait donc les lectures du profil
-- avant même d'évaluer la RLS et tous les comptes étaient renvoyés vers
-- l'onboarding.

grant select, insert, update
  on table
    public.entreprises,
    public.utilisateurs,
    public.utilisateurs_entreprises
  to authenticated;

-- Le rôle anonyme ne participe jamais au bootstrap authentifié. Chaque accès
-- accordé ci-dessus reste filtré par les policies RLS déjà en place.
revoke all
  on table
    public.entreprises,
    public.utilisateurs,
    public.utilisateurs_entreprises
  from anon;

notify pgrst, 'reload schema';
