-- Phase 1 commercialisation :
-- restaure les privilèges DML nécessaires pour que les politiques RLS des
-- modules clients et chantiers soient effectivement évaluées.
--
-- Les tables avaient des politiques détaillées mais aucun privilège pour le
-- rôle authenticated dans une reconstruction complète. PostgreSQL rejetait
-- donc toute requête avant même d’évaluer la RLS.

grant select, insert, update, delete
  on table public.clients, public.chantiers
  to authenticated;

-- Aucun droit n’est ouvert à anon. Les opérations restent soumises aux
-- politiques permissives et restrictives déjà définies sur chaque table.
revoke all
  on table public.clients, public.chantiers
  from anon;

notify pgrst, 'reload schema';
