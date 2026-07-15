-- Classement sécurisé des factures fournisseurs dans les chantiers.
create or replace function public.classer_facture_fournisseur(
  p_entreprise_id uuid,
  p_depense_id uuid,
  p_chantier_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.est_membre_actif(p_entreprise_id)
     or not public.a_permission(p_entreprise_id, 'gerer_achats') then
    raise exception 'Permission de gestion des achats requise';
  end if;

  if p_chantier_id is not null and not exists (
    select 1 from public.chantiers
    where id = p_chantier_id and entreprise_id = p_entreprise_id
  ) then
    raise exception 'Chantier inaccessible';
  end if;

  update public.depenses_fournisseurs
  set chantier_id = p_chantier_id,
      updated_at = now()
  where id = p_depense_id
    and entreprise_id = p_entreprise_id;

  if not found then
    raise exception 'Facture fournisseur introuvable';
  end if;
end;
$$;

revoke all on function public.classer_facture_fournisseur(uuid, uuid, uuid) from public, anon;
grant execute on function public.classer_facture_fournisseur(uuid, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
