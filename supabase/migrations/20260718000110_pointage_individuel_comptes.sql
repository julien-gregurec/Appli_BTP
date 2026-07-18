-- Le pointage personnel est activé compte par compte par un administrateur.

alter table public.utilisateurs_entreprises
  add column if not exists pointage_personnel_actif boolean not null default false;

comment on column public.utilisateurs_entreprises.pointage_personnel_actif is
  'Autorise ce compte précis à pointer en son nom, indépendamment des autres comptes du même poste.';

-- Préserver le fonctionnement des comptes terrain existants lors de la migration.
update public.utilisateurs_entreprises ue
set pointage_personnel_actif = exists (
  select 1
  from public.permissions_poste pp
  where pp.entreprise_id = ue.entreprise_id
    and pp.poste_id = ue.poste_id
    and pp.cle_permission = 'saisir_son_pointage'
    and pp.autorise
);

create or replace function public.modifier_compte_poste_pointage(
  p_entreprise_id uuid,
  p_utilisateur_id uuid,
  p_poste_id uuid,
  p_pointage_personnel_actif boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.peut_gerer_acces(p_entreprise_id) then
    raise exception 'Accès refusé';
  end if;
  if not exists (
    select 1 from public.postes
    where id = p_poste_id and entreprise_id = p_entreprise_id
  ) then
    raise exception 'Poste invalide';
  end if;

  update public.utilisateurs_entreprises
  set poste_id = p_poste_id,
      statut = 'actif',
      pointage_personnel_actif = coalesce(p_pointage_personnel_actif, false)
  where entreprise_id = p_entreprise_id
    and utilisateur_id = p_utilisateur_id
    and statut in ('actif', 'en_attente_validation', 'desactive');
  if not found then raise exception 'Membre introuvable'; end if;

  update public.employes
  set poste_id = p_poste_id, updated_at = now()
  where entreprise_id = p_entreprise_id
    and utilisateur_id = p_utilisateur_id;
end;
$$;

-- Pour la saisie personnelle, le choix individuel de l'administrateur prévaut.
-- Les autres droits (voir l'équipe, gérer, valider) restent pilotés par le poste.
create or replace function public.a_permission(p_entreprise_id uuid, p_permission text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.est_acces_support_actif(p_entreprise_id) or exists (
    select 1
    from public.utilisateurs_entreprises ue
    where ue.utilisateur_id = auth.uid()
      and ue.entreprise_id = p_entreprise_id
      and ue.statut = 'actif'
      and public.est_membre_actif(p_entreprise_id)
      and (
        (p_permission = 'saisir_son_pointage' and ue.pointage_personnel_actif)
        or
        (p_permission <> 'saisir_son_pointage' and exists (
          select 1
          from public.permissions_poste pp
          where pp.entreprise_id = ue.entreprise_id
            and pp.poste_id = ue.poste_id
            and pp.cle_permission = p_permission
            and pp.autorise
        ))
      )
  );
$$;

revoke all on function public.modifier_compte_poste_pointage(uuid, uuid, uuid, boolean) from public;
grant execute on function public.modifier_compte_poste_pointage(uuid, uuid, uuid, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
