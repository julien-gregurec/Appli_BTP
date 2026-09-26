-- Corrige une fuite d'entitlement cross-tenant : module_gestion_pro_actif_entreprise()
-- est appelable directement par "authenticated" (EXECUTE accordé par
-- 20260903000257_modules_a_la_carte_r3_v1.sql, réutilisé intentionnellement en
-- appel direct même tenant par ce même fichier de migration/tests, cf. test
-- "10b" de supabase/tests/modules_a_la_carte_r3_v1.test.sql) mais ne vérifiait
-- aucune appartenance de l'appelant à l'entreprise passée en argument. Un
-- utilisateur authentifié quelconque pouvait donc apprendre l'état
-- d'activation d'un module payant d'une entreprise TIERCE en appelant
-- directement cette RPC avec un p_entreprise_id arbitraire.
--
-- Deux usages légitimes existants doivent rester inchangés :
--   1) appel direct RPC par un membre authentifié sur SA PROPRE entreprise
--      (test 10b ci-dessus) ;
--   2) appel "pur" sans aucun contexte JWT (auth.uid() null), utilisé par les
--      tests unitaires superuser de logique catalogue/forfait
--      (modules_a_la_carte_r3_v1.test.sql, assertions 1-8) et par l'appelant
--      interne a_acces_module_gestion_pro() qui vérifie déjà
--      est_membre_actif() lui-même avant d'invoquer cette fonction.
-- La garde n'est donc appliquée QUE lorsqu'une identité JWT est présente
-- (auth.uid() non nul) — c'est-à-dire précisément le cas d'un vrai appel RPC
-- PostgREST par un utilisateur authentifié, seul chemin par lequel la fuite
-- cross-tenant est exploitable.
create or replace function public.module_gestion_pro_actif_entreprise(p_entreprise_id uuid, p_module_code text)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_offre text;
  v_plan text;
  v_statut text;
  v_plans_inclus text[];
  v_explicite boolean;
begin
  if auth.uid() is not null
     and not (public.est_plateforme_admin() or (p_entreprise_id is not null and public.est_membre_actif(p_entreprise_id)))
  then
    return false;
  end if;

  select statut_catalogue, plans_inclus into v_statut, v_plans_inclus
  from public.modules_gestion_pro where code = p_module_code;
  if not found then
    return false;
  end if;

  select exists (
    select 1 from public.modules_entreprises me
    where me.entreprise_id = p_entreprise_id
      and me.module_code = p_module_code
      and me.actif
      and me.valide_du <= current_date
      and (me.valide_jusqu is null or me.valide_jusqu >= current_date)
  ) into v_explicite;
  if v_explicite then
    return true;
  end if;

  -- Inclusion par forfait (uniquement pour un module au catalogue 'actif').
  if v_statut = 'actif' then
    select nullif(btrim(lower(abonnement_offre)), '') into v_offre
    from public.entreprises where id = p_entreprise_id;
    v_plan := case v_offre
                when 'essentiel' then 'mini'
                when 'premium'   then 'business'
                when null        then 'mini'
                else coalesce(v_offre, 'mini')
              end;
    return v_plan = any(v_plans_inclus);
  end if;

  return false;
end;
$function$;
