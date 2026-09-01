-- « Équipe plateforme » : exposer le statut d'identité de chaque administrateur.
--
-- Contexte : plateforme_lister_admins() (migration 20260816000202) renvoie déjà
-- `actif` mais pas `statut_identite`, si bien que l'interface ne peut pas
-- distinguer « actif » / « en attente de confirmation » / « révoqué » ni proposer
-- l'action d'activation. plateforme_admins n'est accessible à `authenticated`
-- par aucun GRANT ni policy : seule une fonction SECURITY DEFINER peut exposer
-- ces états. Deux fonctions strictement en LECTURE, aucune écriture.
--
--   * plateforme_lister_admins()          : + colonne statut_identite ;
--   * plateforme_statut_identite_courant(): statut de l'appelant (ou NULL),
--                                           pour router une identité plateforme
--                                           non active hors de l'onboarding.
--
-- Contraintes respectées : garde `gerer_equipe` conservée sur la liste, aucun
-- droit accordé à public/anon, aucune écriture, aucune migration existante
-- modifiée. Le changement de type de retour impose un DROP préalable (42P13),
-- comme pour d'autres redéfinitions du dépôt ; aucun objet ne dépend de la
-- fonction (appelée uniquement via PostgREST par l'application).

drop function if exists public.plateforme_lister_admins();
create function public.plateforme_lister_admins()
returns table(
  email text, role text, nom text, ajoute_par text,
  actif boolean, statut_identite text, created_at timestamptz
)
language plpgsql security definer stable set search_path = public as $$
begin
  perform public.plateforme_exiger_permission('gerer_equipe');
  return query
  select pa.email, pa.role, pa.nom, pa.ajoute_par, pa.actif, pa.statut_identite, pa.created_at
  from public.plateforme_admins pa
  order by pa.actif desc, pa.created_at;
end;
$$;
revoke all on function public.plateforme_lister_admins() from public, anon, authenticated;
grant execute on function public.plateforme_lister_admins() to authenticated;

-- Statut d'identité plateforme de l'utilisateur courant, résolu par auth.uid()
-- uniquement (jamais l'email). NULL si aucune ligne plateforme_admins n'est
-- rattachée à cet UID. Ne confère aucun droit : sert seulement au routage
-- applicatif (une identité non 'active' ne doit pas voir l'onboarding entreprise).
create or replace function public.plateforme_statut_identite_courant()
returns text
language sql security definer stable set search_path = public as $$
  select pa.statut_identite
  from public.plateforme_admins pa
  where pa.utilisateur_id = auth.uid()
  limit 1;
$$;
revoke all on function public.plateforme_statut_identite_courant() from public, anon, authenticated;
grant execute on function public.plateforme_statut_identite_courant() to authenticated;

notify pgrst, 'reload schema';
