-- Train canonique V9 FINAL : numéro d'origine 20260930000101, renuméroté 20261002001105
-- (après 20261002000813 hotfix, 20261002000901 Legal Consent et 20261002001001-1003 Security / Stripe :
--  postérieure au ledger de la Preview hébergée). Corps inchangé.
--
-- ELSATIA-GP-POINTAGES-FACTURE-FIX-V1 — B1 : totaux mensuels des pointages
-- calculés en base.
--
-- Constat (rapport Performance, B2 « troncature silencieuse à 1 000 lignes ») :
-- /pointage/gestion lisait TOUS les pointages du mois par PostgREST
-- (`select ... from pointages where entreprise_id = ... and date between ...`)
-- sans pagination, puis additionnait les heures par salarié dans le serveur
-- Next. PostgREST plafonne toute réponse à `max_rows` (1 000 dans
-- supabase/config.toml comme sur le projet hébergé) sans erreur ni en-tête
-- d'alerte côté supabase-js : au-delà de 1 000 pointages dans le mois, les
-- totaux « Total par employé » étaient faux, sans avertissement.
--
-- Correctif : l'agrégat est calculé par PostgreSQL et la page ne reçoit plus
-- qu'une ligne par salarié (au plus quelques centaines), jamais les pointages
-- eux-mêmes. La liste détaillée, elle, est désormais paginée côté page.
--
-- Visibilité : strictement celle de la RLS de `pointages` pour la lecture
-- (policy permissive `membres pointages` = est_membre_actif(entreprise_id),
-- policy restrictive `role_pointage_select` =
-- peut_consulter_pointage_employe(entreprise_id, employe_id)). Les deux
-- prédicats ne dépendent que de (entreprise_id, employe_id) : la fonction les
-- évalue une fois pour l'entreprise et une fois par salarié au lieu d'une fois
-- par ligne, ce qui donne le même résultat pour un coût indépendant du volume.
-- La parité avec la RLS réelle (même agrégat calculé en SECURITY INVOKER,
-- sous `authenticated`) est vérifiée par
-- supabase/tests/gp_pointages_totaux_mois_v1.test.sql pour chaque profil ; si
-- une de ces deux policies change, ce test échoue.
--
-- Le salarié est joint dans l'entreprise demandée : le trigger
-- verifier_pointage_coherence garantit déjà qu'un pointage ne référence
-- jamais un salarié d'une autre entreprise.

create or replace function public.pointages_gestion_totaux_mois(
  p_entreprise_id uuid,
  p_debut date,
  p_fin date
)
returns table (
  employe_id uuid,
  prenom text,
  nom text,
  nb_pointages bigint,
  heures_normales numeric,
  heures_supplementaires numeric,
  heures_total numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_entreprise_id is null or p_debut is null or p_fin is null then
    raise exception 'POINTAGES_TOTAUX_PARAMETRES' using errcode = '22023';
  end if;
  if p_fin < p_debut or p_fin - p_debut > 366 then
    raise exception 'POINTAGES_TOTAUX_PERIODE' using errcode = '22023';
  end if;
  if auth.uid() is null or not public.est_membre_actif(p_entreprise_id) then
    raise exception 'POINTAGES_TOTAUX_REFUSES' using errcode = '42501';
  end if;

  -- MATERIALIZED : sans lui, le planner pousse le filtre de visibilité (qui ne
  -- porte que sur la colonne de regroupement) dans le parcours des pointages,
  -- et l'évalue de nouveau ligne à ligne (mesuré : 21 s à 20 000 pointages).
  return query
  with agregat as materialized (
    select p.employe_id,
           count(*) as nb,
           sum(p.heures_normales) as hn,
           sum(p.heures_supplementaires) as hs
    from public.pointages p
    where p.entreprise_id = p_entreprise_id
      and p.date between p_debut and p_fin
    group by p.employe_id
  )
  select a.employe_id, e.prenom, e.nom, a.nb, a.hn, a.hs, a.hn + a.hs
  from agregat a
  join public.employes e on e.id = a.employe_id and e.entreprise_id = p_entreprise_id
  where public.peut_consulter_pointage_employe(p_entreprise_id, a.employe_id)
  order by e.nom, e.prenom, a.employe_id;
end;
$$;

revoke all on function public.pointages_gestion_totaux_mois(uuid, date, date) from public;
revoke all on function public.pointages_gestion_totaux_mois(uuid, date, date) from anon;
grant execute on function public.pointages_gestion_totaux_mois(uuid, date, date) to authenticated;

comment on function public.pointages_gestion_totaux_mois(uuid, date, date) is
  'Totaux d''heures par salarié sur une période (vue gestion des pointages). Visibilité identique à la RLS SELECT de pointages, évaluée par salarié. ELSATIA-GP-POINTAGES-FACTURE-FIX-V1.';

-- ---------------------------------------------------------------------------
-- Compteurs de la page (pagination et en-tête), même principe.
--
-- Mesuré sur 20 000 pointages dans le mois (14 000 sessions, 28 000
-- contrôles) : un `count=exact` PostgREST sous RLS coûte 15,8 s (sessions),
-- 39,6 s (anciennes saisies) et 29,0 s (contrôles de zone), les fonctions
-- d'aide RLS étant évaluées ligne à ligne. Ici la visibilité est évaluée une
-- fois par salarié, avec les mêmes prédicats que les policies :
--   * sessions_pointage : est_membre_actif + peut_consulter_pointage_employe
--     (policies `sessions_pointage_membres` et `role_pointage_select`) ;
--   * anciennes saisies : pointages visibles (voir plus haut) sans session
--     GPS liée. Une session n'est liée qu'au pointage créé à sa clôture, pour
--     le même salarié et la même entreprise (cloturer_session_pointage) : sa
--     visibilité est donc celle du pointage, comme dans l'anti-jointure
--     PostgREST de la liste ;
--   * verifications_zone_pointage : est_membre_actif et (salarié du compte ou
--     gerer_pointage ou valider_pointages) — policy
--     `verifications_zone_autorisees`.
-- Fenêtre temporelle des sessions et contrôles passée telle que la page
-- l'utilise pour ses listes (bornes timestamptz), pour que liste et compteur
-- portent exactement sur les mêmes lignes.
-- ---------------------------------------------------------------------------
create or replace function public.pointages_gestion_compteurs_mois(
  p_entreprise_id uuid,
  p_debut date,
  p_fin date,
  p_debut_at timestamptz,
  p_fin_at timestamptz
)
returns table (
  nb_sessions bigint,
  nb_anciennes_saisies bigint,
  nb_controles bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_voit_tous_controles boolean;
begin
  if p_entreprise_id is null or p_debut is null or p_fin is null or p_debut_at is null or p_fin_at is null then
    raise exception 'POINTAGES_TOTAUX_PARAMETRES' using errcode = '22023';
  end if;
  if p_fin < p_debut or p_fin - p_debut > 366 or p_fin_at < p_debut_at or p_fin_at - p_debut_at > interval '367 days' then
    raise exception 'POINTAGES_TOTAUX_PERIODE' using errcode = '22023';
  end if;
  if auth.uid() is null or not public.est_membre_actif(p_entreprise_id) then
    raise exception 'POINTAGES_TOTAUX_REFUSES' using errcode = '42501';
  end if;

  v_voit_tous_controles := public.a_permission(p_entreprise_id, 'gerer_pointage')
    or public.a_permission(p_entreprise_id, 'valider_pointages');

  -- Agrégats MATERIALIZED par salarié, filtre de visibilité appliqué ensuite
  -- (voir pointages_gestion_totaux_mois).
  return query
  with sessions_par_salarie as materialized (
    select sp.employe_id, count(*) as nb
    from public.sessions_pointage sp
    where sp.entreprise_id = p_entreprise_id
      and sp.arrivee_at between p_debut_at and p_fin_at
    group by sp.employe_id
  ), anciennes_par_salarie as materialized (
    select p.employe_id, count(*) as nb
    from public.pointages p
    where p.entreprise_id = p_entreprise_id
      and p.date between p_debut and p_fin
      and not exists (select 1 from public.sessions_pointage sp where sp.pointage_id = p.id)
    group by p.employe_id
  ), controles_par_salarie as materialized (
    select vz.employe_id, count(*) as nb
    from public.verifications_zone_pointage vz
    where vz.entreprise_id = p_entreprise_id
      and vz.created_at between p_debut_at and p_fin_at
    group by vz.employe_id
  ), salaries as materialized (
    select x.employe_id,
           public.peut_consulter_pointage_employe(p_entreprise_id, x.employe_id) as voit_pointages,
           v_voit_tous_controles or public.est_employe_du_compte(p_entreprise_id, x.employe_id) as voit_controles
    from (select employe_id from sessions_par_salarie
          union select employe_id from anciennes_par_salarie
          union select employe_id from controles_par_salarie) x
  )
  select
    (select coalesce(sum(s.nb), 0)::bigint from sessions_par_salarie s join salaries v using (employe_id) where v.voit_pointages),
    (select coalesce(sum(a.nb), 0)::bigint from anciennes_par_salarie a join salaries v using (employe_id) where v.voit_pointages),
    (select coalesce(sum(c.nb), 0)::bigint from controles_par_salarie c join salaries v using (employe_id) where v.voit_controles);
end;
$$;

revoke all on function public.pointages_gestion_compteurs_mois(uuid, date, date, timestamptz, timestamptz) from public;
revoke all on function public.pointages_gestion_compteurs_mois(uuid, date, date, timestamptz, timestamptz) from anon;
grant execute on function public.pointages_gestion_compteurs_mois(uuid, date, date, timestamptz, timestamptz) to authenticated;

comment on function public.pointages_gestion_compteurs_mois(uuid, date, date, timestamptz, timestamptz) is
  'Compteurs exacts de la vue gestion des pointages (sessions, anciennes saisies, contrôles de zone). Visibilité identique à la RLS, évaluée par salarié. ELSATIA-GP-POINTAGES-FACTURE-FIX-V1.';

-- ---------------------------------------------------------------------------
-- Page des « anciennes saisies » (pointages du mois sans session GPS).
--
-- L'anti-jointure PostgREST équivalente (`sessions_pointage=is.null`) laisse
-- le planner lire, trier et filtrer sous RLS tout le mois avant d'appliquer
-- la limite : 37 s à 20 000 pointages. Cette fonction ne renvoie que les
-- identifiants de la page demandée (au plus 200), parmi les pointages
-- visibles (même règle par salarié que ci-dessus) ; la page relit ensuite ces
-- quelques lignes par PostgREST, sous la RLS normale, avec leurs relations.
-- ---------------------------------------------------------------------------
create or replace function public.pointages_gestion_anciennes_saisies_ids(
  p_entreprise_id uuid,
  p_debut date,
  p_fin date,
  p_limite integer,
  p_decalage integer
)
returns table (id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_entreprise_id is null or p_debut is null or p_fin is null or p_limite is null or p_decalage is null then
    raise exception 'POINTAGES_TOTAUX_PARAMETRES' using errcode = '22023';
  end if;
  if p_fin < p_debut or p_fin - p_debut > 366 or p_limite < 1 or p_limite > 200 or p_decalage < 0 then
    raise exception 'POINTAGES_TOTAUX_PERIODE' using errcode = '22023';
  end if;
  if auth.uid() is null or not public.est_membre_actif(p_entreprise_id) then
    raise exception 'POINTAGES_TOTAUX_REFUSES' using errcode = '42501';
  end if;

  return query
  with salaries_du_mois as materialized (
    select distinct p.employe_id
    from public.pointages p
    where p.entreprise_id = p_entreprise_id
      and p.date between p_debut and p_fin
  ), salaries as materialized (
    select m.employe_id
    from salaries_du_mois m
    where public.peut_consulter_pointage_employe(p_entreprise_id, m.employe_id)
  )
  select p.id
  from public.pointages p
  where p.entreprise_id = p_entreprise_id
    and p.date between p_debut and p_fin
    and p.employe_id in (select s.employe_id from salaries s)
    and not exists (select 1 from public.sessions_pointage sp where sp.pointage_id = p.id)
  order by p.date desc, p.id desc
  limit p_limite offset p_decalage;
end;
$$;

revoke all on function public.pointages_gestion_anciennes_saisies_ids(uuid, date, date, integer, integer) from public;
revoke all on function public.pointages_gestion_anciennes_saisies_ids(uuid, date, date, integer, integer) from anon;
grant execute on function public.pointages_gestion_anciennes_saisies_ids(uuid, date, date, integer, integer) to authenticated;

comment on function public.pointages_gestion_anciennes_saisies_ids(uuid, date, date, integer, integer) is
  'Identifiants d''une page de pointages sans session GPS (vue gestion des pointages), parmi les pointages visibles. ELSATIA-GP-POINTAGES-FACTURE-FIX-V1.';

-- Index manquants révélés par la mesure :
--   * l'anti-jointure « pointage sans session » (liste des anciennes saisies,
--     et suppression d'un pointage : FK ON DELETE SET NULL) parcourait toutes
--     les sessions faute d'index sur pointage_id (1,6 s à 20 000 pointages) ;
--   * les contrôles de zone du mois étaient lus par entreprise et date sans
--     index adapté (parcours complet de la table, tous tenants confondus).
create index if not exists sessions_pointage_pointage_idx
  on public.sessions_pointage (pointage_id) where pointage_id is not null;
create index if not exists verifications_zone_pointage_entreprise_date_idx
  on public.verifications_zone_pointage (entreprise_id, created_at desc);

notify pgrst, 'reload schema';
