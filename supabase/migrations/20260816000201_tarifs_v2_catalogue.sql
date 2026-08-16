-- TARIFS-V2 : nouvelle grille commerciale, sans modification rétroactive des
-- contrats ni suppression des versions historiques.

alter table public.plans_abonnement
  alter column prix_mensuel_ht drop not null,
  alter column prix_annuel_ht drop not null;

do $$
declare
  v_valide_du date := date '2026-08-16';
begin
  update public.plans_abonnement
  set actif = false,
      valide_au = v_valide_du - 1
  where actif
    and code in ('mini', 'pro', 'business', 'entreprise', 'sur_mesure');

  insert into public.plans_abonnement(
    code, version, nom, prix_mensuel_ht, prix_annuel_ht, devise,
    utilisateurs_inclus, administrateurs_inclus, operations_ia_incluses,
    stockage_go_inclus, fonctionnalites, actif, devis_obligatoire, valide_du
  )
  select
    cible.code,
    coalesce((select max(version) from public.plans_abonnement p where p.code = cible.code), 0) + 1,
    cible.nom,
    cible.prix_mensuel_ht,
    cible.prix_annuel_ht,
    'EUR',
    precedent.utilisateurs_inclus,
    precedent.administrateurs_inclus,
    precedent.operations_ia_incluses,
    precedent.stockage_go_inclus,
    precedent.fonctionnalites,
    true,
    cible.devis_obligatoire,
    v_valide_du
  from (values
    ('mini', 'Mini', 69::numeric, 690::numeric, false),
    ('pro', 'Pro', 199::numeric, 1990::numeric, false),
    ('business', 'Business', 399::numeric, 3990::numeric, false),
    ('entreprise', 'Entreprise', 599::numeric, 5990::numeric, false),
    ('sur_mesure', 'Sur mesure', null::numeric, null::numeric, true)
  ) as cible(code, nom, prix_mensuel_ht, prix_annuel_ht, devis_obligatoire)
  join lateral (
    select p.*
    from public.plans_abonnement p
    where p.code = cible.code
      and not p.actif
    order by p.version desc
    limit 1
  ) precedent on true;
end $$;

-- Ajouter la contrainte après la création de la nouvelle grille : l'ancienne
-- version active de Sur mesure porte encore son prix historique et ne doit pas
-- faire échouer la migration avant d'avoir été désactivée.
alter table public.plans_abonnement
  drop constraint if exists plans_abonnement_tarif_public_coherent;
alter table public.plans_abonnement
  add constraint plans_abonnement_tarif_public_coherent check (
    not actif
    or (
      devis_obligatoire
      and prix_mensuel_ht is null
      and prix_annuel_ht is null
    )
    or (
      not devis_obligatoire
      and prix_mensuel_ht is not null
      and prix_annuel_ht is not null
      and prix_mensuel_ht >= 0
      and prix_annuel_ht >= 0
    )
  );

create or replace function public.plateforme_creer_version_tarif(
  p_code text,
  p_nom text,
  p_prix_mensuel_ht numeric,
  p_prix_annuel_ht numeric,
  p_utilisateurs_inclus integer,
  p_administrateurs_inclus integer,
  p_operations_ia_incluses integer,
  p_stockage_go_inclus numeric,
  p_valide_du date,
  p_motif text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_precedent plans_abonnement%rowtype;
  v_id uuid;
  v_version integer;
begin
  if not public.est_plateforme_admin() then raise exception 'Acces reserve a la plateforme'; end if;
  if p_code not in ('mini','pro','business','entreprise','sur_mesure') then raise exception 'Code offre invalide'; end if;
  if p_code = 'sur_mesure' and (p_prix_mensuel_ht is not null or p_prix_annuel_ht is not null) then
    raise exception 'L offre Sur mesure ne doit pas avoir de prix public';
  end if;
  if p_code <> 'sur_mesure' and (
    p_prix_mensuel_ht is null or p_prix_annuel_ht is null
    or p_prix_mensuel_ht < 0 or p_prix_annuel_ht < 0
  ) then
    raise exception 'Prix public invalide';
  end if;
  select * into v_precedent from plans_abonnement where code=p_code and actif order by version desc limit 1 for update;
  select coalesce(max(version),0)+1 into v_version from plans_abonnement where code=p_code;
  update plans_abonnement set actif=false,valide_au=p_valide_du-1 where code=p_code and actif;
  insert into plans_abonnement(
    code,version,nom,prix_mensuel_ht,prix_annuel_ht,utilisateurs_inclus,
    administrateurs_inclus,operations_ia_incluses,stockage_go_inclus,
    fonctionnalites,actif,devis_obligatoire,valide_du,created_by
  ) values (
    p_code,v_version,p_nom,p_prix_mensuel_ht,p_prix_annuel_ht,p_utilisateurs_inclus,
    p_administrateurs_inclus,p_operations_ia_incluses,p_stockage_go_inclus,
    coalesce(v_precedent.fonctionnalites,'[]'::jsonb),true,p_code='sur_mesure',p_valide_du,auth.uid()
  ) returning id into v_id;
  insert into historique_tarification(utilisateur_id,action,ancien,nouveau,motif)
  values(auth.uid(),'nouvelle_version_tarifaire',to_jsonb(v_precedent),jsonb_build_object('plan_id',v_id,'code',p_code,'version',v_version),p_motif);
  return v_id;
end; $$;

revoke all on function public.plateforme_creer_version_tarif(
  text, text, numeric, numeric, integer, integer, integer, numeric, date, text
) from public, anon;
grant execute on function public.plateforme_creer_version_tarif(
  text, text, numeric, numeric, integer, integer, integer, numeric, date, text
) to authenticated;

notify pgrst, 'reload schema';
