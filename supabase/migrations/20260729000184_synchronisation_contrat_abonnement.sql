-- Ferme une divergence reelle constatee entre public.entreprises (source de
-- verite pour l'acces, lue par est_membre_actif) et public.abonnements_entreprises
-- (table de facturation/plan introduite en 20260723000142, alimentee uniquement
-- par le backfill initial et par le webhook Stripe).
--
-- Aucun des chemins d'ecriture manuels ne maintenait le contrat a jour :
--   - creer_entreprise_bootstrap et plateforme_creer_entreprise (20260710000003,
--     20260716000086, 20260718000104) creent une entreprise sans jamais inserer
--     de ligne dans abonnements_entreprises : toute entreprise creee apres le
--     23/07 n'a donc aucun contrat.
--   - plateforme_modifier_abonnement, plateforme_signaler_impaye,
--     plateforme_enregistrer_reglement et appliquer_suspensions_impayes
--     (20260714000075, 20260719000115) ne modifient que entreprises.abonnement_statut :
--     une suspension ou une reactivation manuelle (hors Stripe) laisse
--     abonnements_entreprises.statut perime.
-- L'acces (est_membre_actif, donc toutes les RLS qui en dependent) n'est pas
-- affecte car il ne lit que entreprises. Le risque porte sur toute lecture
-- future de abonnements_entreprises (facturation, reporting, tableau de bord
-- plateforme) qui afficherait un statut incorrect ou une entreprise absente.
--
-- Correctif a la racine plutot que par point d'ecriture : un trigger cree le
-- contrat par defaut a l'insertion, un second reflete tout changement de
-- abonnement_statut, et un backfill ponctuel corrige l'existant.

create or replace function public.contrat_abonnement_par_defaut(p_entreprise_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entreprise public.entreprises%rowtype;
  v_plan public.plans_abonnement%rowtype;
  v_prix numeric(12,2);
begin
  select * into v_entreprise from public.entreprises where id = p_entreprise_id;
  if not found then
    return;
  end if;

  select p.* into v_plan
  from public.plans_abonnement p
  where p.code = coalesce(v_entreprise.abonnement_offre, 'essentiel')
  order by case
      when coalesce(v_entreprise.abonnement_offre, 'essentiel') = 'pro'
        and v_entreprise.abonnement_prix_contractuel_ht is null
      then (p.version = 1)::integer
      else p.actif::integer
    end desc, p.version desc
  limit 1;

  v_prix := coalesce(
    v_entreprise.abonnement_prix_contractuel_ht,
    v_plan.prix_mensuel_ht,
    case coalesce(v_entreprise.abonnement_offre, 'essentiel')
      when 'premium' then 249 when 'pro' then 129 when 'essentiel' then 59
      when 'mini' then 79 when 'business' then 449 when 'entreprise' then 599
      when 'sur_mesure' then 699 else 59
    end
  );

  insert into public.abonnements_entreprises(
    entreprise_id, plan_id, code_offre, version_tarif, periodicite,
    prix_contractuel_ht, statut, stripe_subscription_id, stripe_customer_id
  ) values (
    v_entreprise.id, v_plan.id, coalesce(v_entreprise.abonnement_offre, 'essentiel'),
    coalesce(v_plan.version, 1), coalesce(v_entreprise.abonnement_periodicite, 'mensuel'),
    v_prix, v_entreprise.abonnement_statut,
    v_entreprise.stripe_subscription_id, v_entreprise.stripe_customer_id
  )
  on conflict (entreprise_id) do update
    set statut = excluded.statut,
        updated_at = now();
end;
$$;

revoke all on function public.contrat_abonnement_par_defaut(uuid) from public, anon, authenticated;

create or replace function public.creer_contrat_abonnement_a_la_creation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.contrat_abonnement_par_defaut(new.id);
  return new;
end;
$$;

drop trigger if exists entreprises_creer_contrat_abonnement on public.entreprises;
create trigger entreprises_creer_contrat_abonnement
  after insert on public.entreprises
  for each row execute function public.creer_contrat_abonnement_a_la_creation();

create or replace function public.synchroniser_statut_contrat_abonnement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.abonnement_statut is distinct from old.abonnement_statut then
    update public.abonnements_entreprises
    set statut = new.abonnement_statut, updated_at = now()
    where entreprise_id = new.id;
    if not found then
      perform public.contrat_abonnement_par_defaut(new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists entreprises_synchroniser_statut_contrat on public.entreprises;
create trigger entreprises_synchroniser_statut_contrat
  after update of abonnement_statut on public.entreprises
  for each row execute function public.synchroniser_statut_contrat_abonnement();

-- Backfill : entreprises sans contrat du tout (creees apres le 23/07 par un
-- chemin qui ne l'inserait pas).
do $$
declare v_entreprise record;
begin
  for v_entreprise in
    select e.id
    from public.entreprises e
    left join public.abonnements_entreprises c on c.entreprise_id = e.id
    where c.entreprise_id is null
  loop
    perform public.contrat_abonnement_par_defaut(v_entreprise.id);
  end loop;
end;
$$;

-- Reconciliation ponctuelle : contrats existants dont le statut a diverge par
-- une action manuelle plateforme non repercutee jusqu'ici.
update public.abonnements_entreprises c
set statut = e.abonnement_statut, updated_at = now()
from public.entreprises e
where c.entreprise_id = e.id
  and c.statut is distinct from e.abonnement_statut;

notify pgrst, 'reload schema';
