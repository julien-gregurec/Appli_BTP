-- ELSATIA-CAPACITY-STRIPE-R2-B-V1 — chemin de service (webhook / cron)
--
-- R2-A a posé le modèle durable (operations_capacite_stripe, capacité planifiée,
-- verrou, idempotence) et la logique pure. R2-B ajoute les RPC exécutées SANS
-- session utilisateur (webhook Stripe, cron) qui écrivent l'entitlement effectif
-- R1 après observation Stripe cohérente.
--
-- Contrat : autorité métier = DB ELSATIA. Ces RPC ne « croient » jamais une
-- quantité/metadata Stripe non sollicitée : elles reçoivent une intention
-- calculée serveur et vérifient le lien subscription ↔ entreprise avant toute
-- écriture. Hausse → effet immédiat. Baisse → planifiée (effet fin de période).
-- Aucune suppression de personne. Stripe Live INTERDIT.
--
-- Additif. Aucune migration historique modifiée.

begin;

-- Marqueur out-of-order : dernier événement Stripe capacité réellement appliqué.
alter table public.entreprises
  add column if not exists capacite_stripe_sync_evenement_at timestamptz;

comment on column public.entreprises.capacite_stripe_sync_evenement_at is
  'R2-B : horodatage du dernier événement Stripe de capacité appliqué (garde out-of-order).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Synchronisation de service : enregistre/avance l'opération durable et,
--    seulement si l'état Stripe est confirmé (statut final fourni par la couche
--    serveur APRÈS re-lecture Stripe), applique l'entitlement.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.synchroniser_capacite_stripe_service(
  p_entreprise_id uuid,
  p_type_operation text,
  p_ancienne_capacite integer,
  p_nouvelle_capacite integer,
  p_plan_code text,
  p_periodicite text,
  p_price_id text,
  p_stripe_subscription_id text,
  p_stripe_item_id text,
  p_idempotency_key text,
  p_statut_final text,
  p_stripe_etat_observe jsonb default null,
  p_date_effet_souhaitee timestamptz default null,
  p_erreur_courte text default null,
  p_evenement_at timestamptz default null,
  p_source text default 'webhook'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub_attendue text;
  v_op uuid;
  v_statut_courant text;
begin
  -- Lien tenant vérifié serveur : la subscription DOIT être celle de l'entreprise.
  select stripe_subscription_id into v_sub_attendue
  from public.entreprises where id = p_entreprise_id;
  if not found then
    raise exception 'Entreprise introuvable' using errcode = 'P0002';
  end if;
  if nullif(btrim(p_stripe_subscription_id), '') is distinct from v_sub_attendue then
    raise exception 'Subscription Stripe non liée à cette entreprise' using errcode = '42501';
  end if;
  if p_type_operation not in ('hausse','baisse','swap_prix','synchronisation','suppression') then
    raise exception 'Type d''opération invalide' using errcode = '22023';
  end if;
  if p_statut_final not in ('stripe_applied','db_applied','completed','failed','needs_reconcile','scheduled') then
    raise exception 'Statut final invalide' using errcode = '22023';
  end if;
  if p_source not in ('webhook','cron','systeme') then
    raise exception 'Source de service invalide' using errcode = '22023';
  end if;
  -- La table (migration 258) contraint source ∈ {client,plateforme,stripe,systeme,cron} :
  -- un événement webhook est une synchronisation d'origine Stripe.
  p_source := case when p_source = 'webhook' then 'stripe' else p_source end;
  if coalesce(p_nouvelle_capacite, -1) < 0 or coalesce(p_nouvelle_capacite, 0) > 100000 then
    raise exception 'Capacité invalide' using errcode = '22023';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'Clé d''idempotence obligatoire' using errcode = '22023';
  end if;

  perform public.verrou_operation_capacite(p_entreprise_id);

  -- Idempotence : trouver ou créer l'opération.
  select id, statut into v_op, v_statut_courant
  from public.operations_capacite_stripe
  where idempotency_key = p_idempotency_key;

  if not found then
    insert into public.operations_capacite_stripe(
      entreprise_id, type_operation, ancienne_capacite, nouvelle_capacite,
      plan_code, periodicite, price_id, stripe_subscription_id, stripe_item_id,
      statut, date_effet_souhaitee, source, idempotency_key,
      erreur_courte, stripe_etat_observe
    ) values (
      p_entreprise_id, p_type_operation, coalesce(p_ancienne_capacite, 0), p_nouvelle_capacite,
      nullif(btrim(p_plan_code), ''), p_periodicite, nullif(btrim(p_price_id), ''),
      p_stripe_subscription_id, nullif(btrim(p_stripe_item_id), ''),
      p_statut_final, p_date_effet_souhaitee, p_source, p_idempotency_key,
      left(nullif(btrim(p_erreur_courte), ''), 500), p_stripe_etat_observe
    )
    returning id into v_op;
    v_statut_courant := p_statut_final;
  else
    -- Ne jamais ré-ouvrir une opération terminale.
    if v_statut_courant in ('completed','failed') then
      return v_op;  -- rejeu idempotent : rien à faire
    end if;
    update public.operations_capacite_stripe
    set statut = p_statut_final,
        stripe_item_id = coalesce(nullif(btrim(p_stripe_item_id), ''), stripe_item_id),
        stripe_etat_observe = coalesce(p_stripe_etat_observe, stripe_etat_observe),
        erreur_courte = left(nullif(btrim(p_erreur_courte), ''), 500),
        updated_at = now()
    where id = v_op;
    v_statut_courant := p_statut_final;
  end if;

  -- Application de l'entitlement seulement sur un état terminal cohérent.
  if v_statut_courant = 'completed' then
    if p_type_operation = 'baisse' and p_date_effet_souhaitee is not null and p_date_effet_souhaitee > now() then
      -- Baisse planifiée : la valeur effective R1 NE bouge pas ; on enregistre la cible.
      update public.entreprises
      set capacite_personnes_supplementaire_planifiee = p_nouvelle_capacite,
          capacite_personnes_planifiee_effet_at = p_date_effet_souhaitee,
          capacite_personnes_planifiee_operation_id = v_op
      where id = p_entreprise_id;
      -- l'opération reste « scheduled » côté métier : on corrige le statut.
      update public.operations_capacite_stripe set statut = 'scheduled', updated_at = now() where id = v_op;
    else
      -- Hausse / update / swap / suppression : entitlement effectif immédiat.
      update public.entreprises
      set capacite_personnes_supplementaire = p_nouvelle_capacite,
          capacite_personnes_source = 'stripe',
          capacite_personnes_reference_externe = nullif(btrim(p_stripe_item_id), ''),
          capacite_personnes_maj_at = now(),
          -- toute baisse planifiée antérieure est absorbée par cette écriture directe
          capacite_personnes_supplementaire_planifiee = null,
          capacite_personnes_planifiee_effet_at = null,
          capacite_personnes_planifiee_operation_id = null
      where id = p_entreprise_id;

      insert into public.historique_capacite_personnes(
        entreprise_id, action, ancien, nouveau, source, reference_externe, motif
      ) values (
        p_entreprise_id,
        case when p_nouvelle_capacite >= coalesce(p_ancienne_capacite, 0)
             then 'capacite_supplementaire_definie' else 'capacite_supplementaire_reduite' end,
        jsonb_build_object('capacite_personnes_supplementaire', coalesce(p_ancienne_capacite, 0)),
        jsonb_build_object('capacite_personnes_supplementaire', p_nouvelle_capacite),
        'stripe', nullif(btrim(p_stripe_item_id), ''),
        'Synchronisation capacité Stripe (' || p_source || ')'
      );
    end if;
  end if;

  if p_evenement_at is not null then
    update public.entreprises
    set capacite_stripe_sync_evenement_at = greatest(
      coalesce(capacite_stripe_sync_evenement_at, 'epoch'::timestamptz), p_evenement_at)
    where id = p_entreprise_id;
  end if;

  return v_op;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Application d'une baisse planifiée arrivée à échéance (cron)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.appliquer_baisse_capacite_planifiee_service(p_entreprise_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_planifiee integer;
  v_effet_at timestamptz;
  v_op uuid;
  v_actuel integer;
begin
  perform public.verrou_operation_capacite(p_entreprise_id);

  select capacite_personnes_supplementaire_planifiee, capacite_personnes_planifiee_effet_at,
         capacite_personnes_planifiee_operation_id, capacite_personnes_supplementaire
    into v_planifiee, v_effet_at, v_op, v_actuel
  from public.entreprises where id = p_entreprise_id for update;

  if v_planifiee is null or v_effet_at is null or v_effet_at > now() then
    return false;  -- rien à appliquer / pas encore à échéance
  end if;

  update public.entreprises
  set capacite_personnes_supplementaire = v_planifiee,
      capacite_personnes_source = 'stripe',
      capacite_personnes_maj_at = now(),
      capacite_personnes_supplementaire_planifiee = null,
      capacite_personnes_planifiee_effet_at = null,
      capacite_personnes_planifiee_operation_id = null
  where id = p_entreprise_id;

  insert into public.historique_capacite_personnes(
    entreprise_id, action, ancien, nouveau, source, motif
  ) values (
    p_entreprise_id, 'capacite_supplementaire_reduite',
    jsonb_build_object('capacite_personnes_supplementaire', coalesce(v_actuel, 0)),
    jsonb_build_object('capacite_personnes_supplementaire', v_planifiee),
    'stripe', 'Baisse de capacité programmée appliquée à échéance'
  );

  if v_op is not null then
    update public.operations_capacite_stripe
    set statut = 'completed', updated_at = now()
    where id = v_op and statut not in ('completed','failed');
  end if;

  return true;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. File d'opérations à reprendre (cron)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.capacite_stripe_operations_a_reprendre(p_limite integer default 50)
returns table(
  operation_id uuid,
  entreprise_id uuid,
  type_operation text,
  statut text,
  date_effet_souhaitee timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.entreprise_id, o.type_operation, o.statut, o.date_effet_souhaitee, o.updated_at
  from public.operations_capacite_stripe o
  where o.statut = 'needs_reconcile'
     or (o.statut = 'scheduled' and o.date_effet_souhaitee is not null and o.date_effet_souhaitee <= now())
  order by o.updated_at asc
  limit greatest(1, least(coalesce(p_limite, 50), 500));
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ACL — chemin de service (webhook/cron sans session)
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.synchroniser_capacite_stripe_service(uuid, text, integer, integer, text, text, text, text, text, text, text, jsonb, timestamptz, text, timestamptz, text)
  from public, anon;
revoke all on function public.appliquer_baisse_capacite_planifiee_service(uuid) from public, anon;
revoke all on function public.capacite_stripe_operations_a_reprendre(integer)   from public, anon;

-- Le webhook et le cron s'exécutent avec le client admin (service_role). La
-- validation du lien subscription ↔ entreprise est faite DANS la fonction, donc
-- l'exposition à service_role est bornée. `authenticated` conserve l'accès pour
-- le chemin action serveur (R2-C).
grant execute on function public.synchroniser_capacite_stripe_service(uuid, text, integer, integer, text, text, text, text, text, text, text, jsonb, timestamptz, text, timestamptz, text)
  to authenticated, service_role;
grant execute on function public.appliquer_baisse_capacite_planifiee_service(uuid) to authenticated, service_role;
grant execute on function public.capacite_stripe_operations_a_reprendre(integer)   to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
