-- ELSATIA GP BUSINESS HARDENING V9.1 — portage sémantique de la recette métier GP
-- (source : claude/loving-heisenberg-ygkjck, rapport ELSATIA_GP_END_TO_END_BUSINESS_ACCEPTANCE_V1.md).
-- Rapport : docs/qualification/ELSATIA_GP_BUSINESS_HARDENING_V9_1.md — témoin : supabase/tests/gp_business_hardening_v9_1.test.sql
--
-- B28 (P1, confidentialité) — état V9.1 : le coût horaire et le taux de facturation
-- vivent déjà dans employes_cout_horaire / employes_taux_facture, lisibles seulement
-- avec voir_cout_interne_employe / acces_rentabilite / voir_taux_facture_employe
-- (le défaut source « employes.cout_horaire lisible » n'existe plus). Mais le coût
-- horaire FIGÉ à la validation (pointages.cout_horaire_applique, 20260818000206)
-- reste une colonne ordinaire de pointages : tout lecteur d'un pointage le lit par
-- l'API — le chef d'équipe (valider_pointages) celui de ses collègues, le salarié
-- son coût employeur. Reproduit sur V9.1 (témoin pgTAP).
--
-- Modèle déjà utilisé par le projet (prix d'achat du stock, 20260715000108 ;
-- employes, 20260928000806) : privilèges de COLONNE (la RLS ne masque pas une
-- colonne) + RPC SECURITY DEFINER gardée par les permissions existantes.
--   * authenticated perd SELECT/INSERT/UPDATE sur cette seule colonne (toutes les
--     lectures applicatives de pointages sont en colonnes explicites ; seule
--     valider_preuve_pointage, SECURITY DEFINER, écrit la valeur) ;
--   * lecture légitime : pointages_couts_appliques(), mêmes droits que la lecture
--     de employes_cout_horaire (voir_cout_interne_employe OU acces_rentabilite),
--     membre actif de l'entreprise, période bornée.
-- Aucun nouveau droit, aucune règle métier nouvelle.

do $$
declare
  v_colonnes text;
begin
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
    into v_colonnes
  from pg_attribute a
  where a.attrelid = 'public.pointages'::regclass
    and a.attnum > 0 and not a.attisdropped
    and a.attname <> 'cout_horaire_applique';

  execute 'revoke select, insert, update on public.pointages from anon, authenticated';
  execute format('grant select (%s) on public.pointages to authenticated', v_colonnes);
  execute format('grant insert (%s) on public.pointages to authenticated', v_colonnes);
  execute format('grant update (%s) on public.pointages to authenticated', v_colonnes);
end $$;

create or replace function public.pointages_couts_appliques(p_entreprise_id uuid, p_debut date, p_fin date)
returns table (pointage_id uuid, employe_id uuid, chantier_id uuid, date date, cout_horaire_applique numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_entreprise_id is null or p_debut is null or p_fin is null or p_fin < p_debut or p_fin - p_debut > 366 then
    raise exception 'POINTAGES_COUTS_PARAMETRES' using errcode = '22023';
  end if;
  if auth.uid() is null
     or not public.est_membre_actif(p_entreprise_id)
     or not (public.a_permission(p_entreprise_id, 'voir_cout_interne_employe')
             or public.a_permission(p_entreprise_id, 'acces_rentabilite')) then
    raise exception 'POINTAGES_COUTS_REFUSES' using errcode = '42501';
  end if;
  return query
  select p.id, p.employe_id, p.chantier_id, p.date, p.cout_horaire_applique
  from public.pointages p
  where p.entreprise_id = p_entreprise_id
    and p.date between p_debut and p_fin
  order by p.date, p.id;
end;
$$;

revoke all on function public.pointages_couts_appliques(uuid, date, date) from public, anon, service_role;
grant execute on function public.pointages_couts_appliques(uuid, date, date) to authenticated;

notify pgrst, 'reload schema';
