-- Fermeture append-only de Migration Canonicalization V2.
-- 1. finalise la compatibilité TARIFS-V2 sans supprimer de ligne ;
-- 2. restaure les messages historiques de plateforme_exiger_role(), sans
--    modifier la décision d'autorisation ni l'exigence AAL2 des RPC appelantes.

do $$
declare
  v_has_tariff_markers boolean := false;
begin
  if to_regclass('public.migration_tarifs_v2_reconciliation_v2') is not null then
    execute 'select exists (select 1 from public.migration_tarifs_v2_reconciliation_v2)'
      into v_has_tariff_markers;
  end if;

  if v_has_tariff_markers then
    update public.plans_abonnement p
    set actif = false,
        valide_du = m.original_valide_du,
        valide_au = greatest(
          m.original_valide_du,
          coalesce(m.original_valide_au, current_date)
        )
    from public.migration_tarifs_v2_reconciliation_v2 m
    where p.id = m.plan_id;

    update public.plans_abonnement p
    set valide_du = current_date
    where p.actif
      and p.code in (
        select m.code from public.migration_tarifs_v2_reconciliation_v2 m
      )
      and p.valide_du = date '2026-08-16';

    insert into public.historique_tarification (
      utilisateur_id, action, ancien, nouveau, motif
    )
    select
      null,
      'reconciliation_tarifs_v2_canonicalization',
      jsonb_build_object(
        'plan_id', m.plan_id,
        'code', m.code,
        'version', m.version,
        'actif', m.original_actif,
        'valide_du', m.original_valide_du,
        'valide_au', m.original_valide_au,
        'prix_mensuel_ht', m.original_prix_mensuel_ht,
        'prix_annuel_ht', m.original_prix_annuel_ht,
        'devis_obligatoire', m.original_devis_obligatoire
      ),
      to_jsonb(p),
      'Compatibilité append-only TARIFS-V2 201 ; aucune ligne supprimée'
    from public.migration_tarifs_v2_reconciliation_v2 m
    join public.plans_abonnement p on p.id = m.plan_id;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.plans_abonnement'::regclass
      and conname = 'plans_abonnement_check'
  ) then
    alter table public.plans_abonnement
      add constraint plans_abonnement_check
      check (valide_au is null or valide_au >= valide_du);
  end if;
end $$;

drop table if exists public.migration_tarifs_v2_reconciliation_v2;

-- Production 210 possède déjà les correctifs 219 et 223. Lorsque les
-- migrations historiques manquantes 202 puis 206 y sont appliquées ensuite,
-- elles réintroduisent respectivement la surcharge legacy de remise et le
-- corps de validation contenant la branche anon. Réaffirmer ici le net-effect
-- des correctifs postérieurs rend fresh, Preview et Production équivalents.
drop function if exists public.plateforme_appliquer_remise(uuid, text, text);

create or replace function public.valider_preuve_pointage(
  p_entreprise_id uuid,
  p_pointage_id uuid,
  p_statut text,
  p_commentaire text default null::text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_statut not in ('valide', 'rejete') then
    raise exception 'Statut invalide';
  end if;
  if not public.a_permission(p_entreprise_id, 'valider_pointages') then
    raise exception 'Accès refusé';
  end if;
  if p_statut = 'rejete' and nullif(btrim(p_commentaire), '') is null then
    raise exception 'Le motif du rejet est obligatoire';
  end if;
  update public.pointages
  set verification_statut = p_statut,
      verification_at = now(),
      verification_par = auth.uid(),
      commentaire_verification = nullif(btrim(p_commentaire), '')
  where id = p_pointage_id
    and entreprise_id = p_entreprise_id;
  if not found then
    raise exception 'Pointage introuvable';
  end if;
end;
$function$;

revoke all on function public.valider_preuve_pointage(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.valider_preuve_pointage(uuid, uuid, text, text)
  to authenticated;

create or replace function public.plateforme_exiger_role(variadic p_roles text[])
returns void
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text := public.plateforme_role_courant();
begin
  if v_role is null then
    raise exception 'Accès réservé à la plateforme' using errcode = '42501';
  end if;
  if not (v_role = any(p_roles)) then
    raise exception 'Action réservée aux rôles % (votre rôle : %)',
      array_to_string(p_roles, ', '), v_role using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.plateforme_exiger_role(text[])
  from public, anon, authenticated;

notify pgrst, 'reload schema';
