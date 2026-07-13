-- Une commande est toujours attribuée au compte réellement connecté.
-- Aucun identifiant d'un autre salarié n'est accepté dans le formulaire.

alter table public.commandes_fournisseurs
  add column if not exists cree_par_utilisateur_id uuid
    references public.utilisateurs(id) on delete set null,
  add column if not exists cree_par_employe_id uuid
    references public.employes(id) on delete set null;

create index if not exists commandes_auteur_idx
  on public.commandes_fournisseurs(entreprise_id,cree_par_utilisateur_id);

create or replace function public.creer_commande_fournisseur(
  p_entreprise_id uuid,
  p_commande jsonb,
  p_lignes jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_employe_id uuid;
begin
  if auth.role() is distinct from 'anon'
     and not public.a_permission(p_entreprise_id,'gerer_achats') then
    raise exception 'Accès refusé';
  end if;

  v_id := public.creer_commande_fournisseur_interne(
    p_entreprise_id,
    p_commande,
    p_lignes
  );

  if auth.role() is distinct from 'anon' then
    select e.id into v_employe_id
    from public.employes e
    where e.entreprise_id=p_entreprise_id
      and e.utilisateur_id=auth.uid()
      and e.statut not in ('sorti','suspendu')
    limit 1;

    update public.commandes_fournisseurs
    set cree_par_utilisateur_id=auth.uid(),
        cree_par_employe_id=v_employe_id
    where id=v_id and entreprise_id=p_entreprise_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.creer_commande_fournisseur(uuid,jsonb,jsonb) from public;
grant execute on function public.creer_commande_fournisseur(uuid,jsonb,jsonb) to anon,authenticated;

notify pgrst,'reload schema';
