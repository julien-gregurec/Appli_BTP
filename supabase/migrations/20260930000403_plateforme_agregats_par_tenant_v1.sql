-- ELSATIA-GP-RESIDUAL-DATA-CORRECTNESS-V1 — plateforme : lectures bornées au
-- tenant et compteurs calculés en base.
--
-- Constats (docs/qualification/ELSATIA_GP_RESIDUAL_DATA_CORRECTNESS_V1.md §2) :
--   - la fiche entreprise de la plateforme appelait plateforme_postes_tarifs(),
--     qui renvoie les postes de TOUS les tenants (returns table, donc plafonné à
--     1 000 lignes par PostgREST), puis filtrait le tenant côté Next : au-delà
--     de 1 000 postes sur la plateforme, « Tarifs par poste » (tarif et comptes
--     facturables) était vide ou partiel pour les tenants classés après ;
--   - /plateforme/applications comptait « entreprises autorisées » et
--     « utilisateurs habilités » sur deux lectures plafonnées à 1 000 lignes.

-- 1. Tarifs par poste d'UN tenant. Même contrôle que plateforme_postes_tarifs
--    (permission plateforme `consulter_facturation`), mêmes colonnes.
create or replace function public.plateforme_postes_tarifs_entreprise(p_entreprise_id uuid)
returns table(entreprise_id uuid, poste_id uuid, nom text, code_offre text, tarif_compte_mensuel numeric, nb_comptes_facturables bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.plateforme_exiger_permission('consulter_facturation');
  if p_entreprise_id is null then
    raise exception 'GP_AGREGAT_PARAMETRES' using errcode = '22023';
  end if;
  return query
  select p.entreprise_id, p.id, p.nom, p.code_offre, p.tarif_compte_mensuel,
         (select count(*) from public.employes e where e.poste_id = p.id and e.compte_application_statut in ('actif', 'pause'))
  from public.postes p
  where p.entreprise_id = p_entreprise_id
  order by p.nom, p.id;
end;
$$;

-- 2. Compteurs du catalogue d'applications (accès entreprise et habilitations
--    utilisateur actifs à l'instant), pour un administrateur plateforme : la
--    RLS des deux tables lui ouvre toutes les lignes (est_plateforme_admin()).
create or replace function public.plateforme_applications_compteurs()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.est_plateforme_admin() then
    raise exception 'GP_AGREGAT_REFUSE' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(a.code, jsonb_build_object(
      'entreprises', (select count(*) from public.acces_applications_entreprises x
                      where x.application_code = a.code and x.autorise
                        and (x.valide_du is null or x.valide_du <= now()) and (x.valide_jusqu_au is null or x.valide_jusqu_au > now())),
      'utilisateurs', (select count(*) from public.habilitations_applications_utilisateurs h
                       where h.application_code = a.code and h.autorise
                         and (h.valide_du is null or h.valide_du <= now()) and (h.valide_jusqu_au is null or h.valide_jusqu_au > now()))))
    from public.applications_elsatia a), '{}'::jsonb);
end;
$$;

revoke all on function public.plateforme_postes_tarifs_entreprise(uuid) from public, anon;
revoke all on function public.plateforme_applications_compteurs() from public, anon;
grant execute on function public.plateforme_postes_tarifs_entreprise(uuid) to authenticated;
grant execute on function public.plateforme_applications_compteurs() to authenticated;
