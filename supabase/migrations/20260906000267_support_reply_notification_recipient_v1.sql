-- ELSATIA-GP-SUPPORT-REPLY-EMAIL-P1
--
-- Notifier par e-mail le demandeur quand le support répond suppose de connaître
-- son adresse. Aucune surface existante ne l'expose :
--   * `entreprises` ne porte pas d'adresse e-mail ;
--   * `plateforme_support_messages` ne renvoie ni `auteur_id` ni adresse ;
--   * ELSATIA-ACL-RECONCILIATION-V1 a révoqué `SELECT` à `service_role` sur
--     `support_messages`, `utilisateurs` et `utilisateurs_entreprises` — la
--     clé de service ne peut donc pas résoudre le destinataire.
--
-- D'où cette unique lecture ciblée, sous exactement les mêmes gardes que
-- `plateforme_support_repondre` (rôle plateforme, AAL2, session support
-- explicite sur CETTE entreprise). Elle ne renvoie qu'une ligne, celle du
-- dernier demandeur du fil, et rien d'autre.
create or replace function public.plateforme_support_destinataire_reponse(
  p_entreprise_id uuid
)
returns table(
  email text,
  prenom text,
  nom text,
  entreprise_nom text,
  demande text,
  demande_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform public.plateforme_exiger_role('total', 'support');
  perform public.plateforme_exiger_session_aal2();
  if not public.est_acces_support_actif(p_entreprise_id) then
    raise exception 'Session support explicite requise';
  end if;

  -- Destinataire = auteur du dernier message côté entreprise, et lui seul :
  -- c'est la personne qui attend la réponse. Fail-closed sur trois points —
  -- l'auteur doit être identifié, encore membre actif de CETTE entreprise, et
  -- porter une adresse confirmée. Sinon aucune ligne : l'appelant n'envoie pas.
  return query
  select
    au.email::text,
    nullif(btrim(u.prenom), ''),
    nullif(btrim(u.nom), ''),
    e.nom,
    m.contenu,
    m.created_at
  from public.support_messages m
  join public.entreprises e
    on e.id = m.entreprise_id
  join public.utilisateurs_entreprises ue
    on ue.utilisateur_id = m.auteur_id
   and ue.entreprise_id = m.entreprise_id
   and ue.statut = 'actif'
  join public.utilisateurs u
    on u.id = m.auteur_id
  join auth.users au
    on au.id = m.auteur_id
  where m.entreprise_id = p_entreprise_id
    and m.cote = 'entreprise'
    and m.auteur_id is not null
    and nullif(btrim(coalesce(au.email, '')), '') is not null
    and au.email_confirmed_at is not null
  order by m.created_at desc
  limit 1;
end;
$$;

revoke all on function public.plateforme_support_destinataire_reponse(uuid)
  from public, anon, service_role;
grant execute on function public.plateforme_support_destinataire_reponse(uuid)
  to authenticated;

notify pgrst, 'reload schema';
