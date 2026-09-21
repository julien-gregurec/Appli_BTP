-- Canal de lecture privilégié et strictement borné pour l'administration
-- multi-app. Les RLS métier restent inchangées : seule cette projection minimale
-- est exposée après vérification de l'identité admin plateforme canonique.

create or replace function public.plateforme_lire_entreprise_membres(
  p_entreprise_id uuid
) returns table (
  entreprise_id uuid,
  entreprise_nom text,
  entreprise_reference text,
  utilisateur_id uuid,
  utilisateur_nom text,
  utilisateur_prenom text,
  membre_statut text,
  application_code text,
  role_code text,
  habilitation_autorise boolean,
  habilitation_valide_du timestamptz,
  habilitation_valide_jusqu_au timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.est_plateforme_admin() then
    raise exception 'Accès réservé à la plateforme' using errcode = '42501';
  end if;

  return query
  select
    e.id,
    e.nom,
    e.reference_interne,
    ue.utilisateur_id,
    u.nom,
    u.prenom,
    ue.statut,
    h.application_code,
    h.role_code,
    h.autorise,
    h.valide_du,
    h.valide_jusqu_au
  from public.entreprises e
  left join public.utilisateurs_entreprises ue
    on ue.entreprise_id = e.id
  left join public.utilisateurs u
    on u.id = ue.utilisateur_id
  left join public.habilitations_applications_utilisateurs h
    on h.entreprise_id = e.id
   and h.utilisateur_id = ue.utilisateur_id
  where e.id = p_entreprise_id
  order by u.nom nulls last, u.prenom nulls last, h.application_code nulls last;
end;
$$;

comment on function public.plateforme_lire_entreprise_membres(uuid) is
  'Lecture privilégiée, minimale et sans effet de bord de l’entreprise, de ses membres et de leurs habilitations applicatives.';

revoke all on function public.plateforme_lire_entreprise_membres(uuid) from public, anon, authenticated;
grant execute on function public.plateforme_lire_entreprise_membres(uuid) to authenticated;

notify pgrst, 'reload schema';
