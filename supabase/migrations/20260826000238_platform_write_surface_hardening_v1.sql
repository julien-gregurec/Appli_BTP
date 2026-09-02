-- Ferme les dernières surfaces d'écriture plateforme qui reposaient seulement
-- sur est_plateforme_admin(), impose un rôle explicite et préautorise les effets
-- externes avant tout appel Stripe.

-- Prédicat RLS fermé par défaut : l'identité et le rôle proviennent de la table
-- canonique plateforme_admins via auth.uid(), et l'AAL provient du JWT vérifié.
create or replace function public.plateforme_ecriture_autorisee(variadic p_roles text[])
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() is not null
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    and coalesce(public.plateforme_role_courant() = any(p_roles), false);
$$;

revoke all on function public.plateforme_ecriture_autorisee(variadic text[]) from public, anon;
grant execute on function public.plateforme_ecriture_autorisee(variadic text[]) to authenticated;

-- Cette RPC ne produit aucun effet. Elle constitue la barrière SQL obligatoire
-- appelée par une Server Action avant son premier effet externe. Les RPC d'écriture
-- finales conservent leur propre contrôle rôle + AAL2 après l'appel externe.
create or replace function public.plateforme_autoriser_effet_externe(p_action text)
returns void
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_action = 'remise_abonnement' then
    perform public.plateforme_exiger_role('total', 'facturation');
    perform public.plateforme_exiger_session_aal2();
    return;
  end if;

  raise exception 'Action externe plateforme non autorisée';
end;
$$;

revoke all on function public.plateforme_autoriser_effet_externe(text) from public, anon;
grant execute on function public.plateforme_autoriser_effet_externe(text) to authenticated;

-- Catalogue global ELSATIA : consultation inchangée, écriture total + AAL2.
drop policy if exists boutique_produits_gestion on public.boutique_produits;
create policy boutique_produits_gestion on public.boutique_produits
  for all to authenticated
  using (public.plateforme_ecriture_autorisee('total'))
  with check (public.plateforme_ecriture_autorisee('total'));

-- L'ancienne policy prototype autorisait toute écriture anon. Les privilèges anon
-- avaient déjà été révoqués ; on retire aussi la policy pour fermer la surface.
drop policy if exists boutique_produits_prototype on public.boutique_produits;
revoke insert, update, delete on public.boutique_produits from anon;

-- Les gérants d'entreprise conservent leur droit métier local. Le chemin
-- administration globale exige désormais exclusivement total + AAL2.
drop policy if exists feature_flags_manage on public.entreprise_feature_flags;
create policy feature_flags_manage on public.entreprise_feature_flags
  for all to authenticated
  using (
    public.plateforme_ecriture_autorisee('total')
    or (
      public.est_membre_actif(entreprise_id)
      and public.a_permission(entreprise_id, 'gerer_parametres')
    )
  )
  with check (
    public.plateforme_ecriture_autorisee('total')
    or (
      public.est_membre_actif(entreprise_id)
      and public.a_permission(entreprise_id, 'gerer_parametres')
    )
  );

-- Toute création d'identité plateforme doit nommer explicitement son rôle.
alter table public.plateforme_admins
  alter column role drop default;

notify pgrst, 'reload schema';
