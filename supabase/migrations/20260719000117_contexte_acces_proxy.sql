-- Performance : un seul aller-retour pour tous les controles d'acces.
--
-- Constat mesure en production : une page publique (qui court-circuite le
-- controle d'acces) repond en 37 ms, alors qu'une page applicative quasi vide
-- met 1074 ms. Ce cout fixe d'environ 1 seconde est paye par CHAQUE page.
--
-- Cause : le proxy enchainait jusqu'a 6 appels reseau sequentiels par requete
-- (compte depot, entreprise active, acces support, appartenance, permission),
-- chacun coutant un aller-retour vers la base.
--
-- Cette fonction rassemble tous ces controles en une seule requete. Le proxy
-- passe ainsi de 6 allers-retours a 2 (verification du jeton, puis ceci).
--
-- La semantique est strictement identique a celle du proxy precedent :
-- aucun controle n'est assoupli, ils sont seulement regroupes.

create or replace function public.contexte_acces_proxy(
  p_droits_acces text[] default '{}',
  p_droits_gestion text[] default '{}'
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_entreprise uuid;
  v_depot boolean := false;
  v_support boolean := false;
  v_acces boolean := false;
  v_gestion boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('connecte', false);
  end if;

  -- Le compte partage du depot reste prioritaire sur tout le reste.
  v_depot := coalesce(public.est_compte_depot_courant(), false);

  select entreprise_active_id into v_entreprise
    from public.utilisateurs where id = v_uid;

  if v_entreprise is not null then
    -- Une session de support ouverte donne acces sans verifier les permissions.
    v_support := coalesce(public.est_acces_support_actif(v_entreprise), false);

    -- Appartenance active ET permission accordee, en une seule jointure.
    -- Les deux controles du proxy (acces au module, droit de modification)
    -- sont evalues ici afin de ne pas payer un second aller-retour.
    if array_length(p_droits_acces, 1) is not null then
      select exists (
        select 1
        from public.utilisateurs_entreprises ue
        join public.permissions_poste pp
          on pp.entreprise_id = ue.entreprise_id
         and pp.poste_id = ue.poste_id
        where ue.utilisateur_id = v_uid
          and ue.entreprise_id = v_entreprise
          and ue.statut = 'actif'
          and pp.cle_permission = any(p_droits_acces)
          and pp.autorise
      ) into v_acces;
    end if;

    if array_length(p_droits_gestion, 1) is not null then
      select exists (
        select 1
        from public.utilisateurs_entreprises ue
        join public.permissions_poste pp
          on pp.entreprise_id = ue.entreprise_id
         and pp.poste_id = ue.poste_id
        where ue.utilisateur_id = v_uid
          and ue.entreprise_id = v_entreprise
          and ue.statut = 'actif'
          and pp.cle_permission = any(p_droits_gestion)
          and pp.autorise
      ) into v_gestion;
    end if;
  end if;

  return jsonb_build_object(
    'connecte', true,
    'compte_depot', v_depot,
    'entreprise_id', v_entreprise,
    'acces_support', v_support,
    'droit_acces', v_acces,
    'droit_gestion', v_gestion
  );
end;
$$;

revoke all on function public.contexte_acces_proxy(text[], text[]) from public, anon;
grant execute on function public.contexte_acces_proxy(text[], text[]) to authenticated;

notify pgrst, 'reload schema';
