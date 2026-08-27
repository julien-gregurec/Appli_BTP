-- Ferme les dernières surfaces d'écriture plateforme qui reposaient seulement
-- sur est_plateforme_admin() et impose un rôle explicite à toute identité créée.
--
-- Adapté depuis codex/multi-app-aal2-role-fix-v2 (38c0109) / codex/admin-global-v1-consolidation
-- (2e7849c) lors de l'adaptation sur release/commercialisation-v1 (fcdd4e7). La RPC
-- `plateforme_autoriser_effet_externe(p_action text)` de la version d'origine n'est PAS reprise
-- ici : elle ne préautorisait que l'intention 'remise_abonnement', sans jamais vérifier
-- l'existence de la cible ni retourner l'état nécessaire à l'appel Stripe. Elle est strictement
-- remplacée, pour ce même usage, par `plateforme_preautoriser_effet_externe(entreprise_id, operation)`
-- de la migration 20260826000240_platform_stripe_audit_integrity_v1.sql (entreprise scoping,
-- liste d'opérations fermée, cible retournée). La conserver aurait dupliqué la même intention
-- avec une garantie plus faible. `plateforme_ecriture_autorisee()` reste en revanche un besoin
-- propre, réutilisé par les policies boutique/feature-flags ci-dessous, sans équivalent dans la
-- chaîne 00234-00239 d'origine.

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
