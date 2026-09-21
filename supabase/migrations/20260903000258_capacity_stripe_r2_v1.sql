-- ELSATIA-CAPACITY-STRIPE-R2-V1 — socle DB (slice 1 : données + verrou + saga)
--
-- Périmètre de cette migration : le modèle de données durable qui permettra à R2
-- de synchroniser `entreprises.capacite_personnes_supplementaire` (R1, autorité
-- métier) vers Stripe TEST, avec verrou déterministe, opération durable (saga) et
-- capacité planifiée (baisse à effet fin de période). Le branchement Stripe réel
-- (module lib, action serveur, webhook, cron, UI) est un lot séparé.
--
-- Contrat commercial figé : capacité supplémentaire = PERSONNE ACTIVE
-- supplémentaire ; UN Price unitaire par plan × quantity ; hausse = effet
-- immédiat + prorata ; baisse = effet fin de période ; downgrade sans suppression
-- de personne ; impayé sans suppression de personne. Stripe Live INTERDIT.
--
-- Additif : aucune migration historique modifiée, aucun élargissement ACL,
-- functions SECURITY DEFINER bornées. Ne duplique pas `historique_capacite_personnes`
-- (R1) : les opérations Stripe le référencent et journalisent via la RPC R1.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Capacité planifiée (baisse à effet fin de période)
--    La valeur R1 `capacite_personnes_supplementaire` reste l'entitlement
--    effectif jusqu'à `capacite_personnes_planifiee_effet_at`. Aucune baisse
--    n'est appliquée immédiatement en base.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.entreprises
  add column if not exists capacite_personnes_supplementaire_planifiee integer
    check (capacite_personnes_supplementaire_planifiee is null
           or (capacite_personnes_supplementaire_planifiee >= 0
               and capacite_personnes_supplementaire_planifiee <= 100000)),
  add column if not exists capacite_personnes_planifiee_effet_at timestamptz,
  add column if not exists capacite_personnes_planifiee_operation_id uuid;

comment on column public.entreprises.capacite_personnes_supplementaire_planifiee is
  'R2 : capacité supplémentaire cible après une baisse, appliquée à effet fin de période. NULL = aucune baisse en attente.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Opérations de capacité Stripe — saga durable
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.operations_capacite_stripe (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  type_operation text not null check (type_operation in (
    'hausse','baisse','swap_prix','synchronisation','suppression'
  )),
  ancienne_capacite integer not null check (ancienne_capacite >= 0),
  nouvelle_capacite integer not null check (nouvelle_capacite >= 0),
  plan_code text not null,
  periodicite text not null check (periodicite in ('mensuel','annuel')),
  price_id text,                         -- Price Stripe attendu (allowlist serveur)
  stripe_subscription_id text,
  stripe_item_id text,                   -- rempli après création de la ligne Stripe
  statut text not null default 'pending' check (statut in (
    'pending','stripe_applied','db_applied','completed','failed','needs_reconcile','scheduled'
  )),
  date_effet_souhaitee timestamptz,      -- baisse : fin de période courante
  source text not null default 'client' check (source in (
    'client','plateforme','stripe','cron','systeme'
  )),
  acteur_id uuid references auth.users(id),
  motif text,
  idempotency_key text not null,
  erreur_courte text,                    -- jamais de payload Stripe complet
  stripe_etat_observe jsonb,             -- résumé minimal (id item, quantity, price, status) — aucun secret
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists operations_capacite_stripe_idem_idx
  on public.operations_capacite_stripe(idempotency_key);
create index if not exists operations_capacite_stripe_entreprise_idx
  on public.operations_capacite_stripe(entreprise_id, created_at desc);
-- File de reprise du cron : opérations non finalisées.
create index if not exists operations_capacite_stripe_reprise_idx
  on public.operations_capacite_stripe(statut, updated_at)
  where statut in ('pending','stripe_applied','db_applied','needs_reconcile','scheduled');
-- Garde de concurrence : au plus UNE opération active par entreprise à la fois.
-- Une seconde demande pendant qu'une opération est en vol est refusée proprement
-- (OPERATION_CAPACITE_EN_COURS), en complément du verrou consultatif transactionnel.
create unique index if not exists operations_capacite_stripe_active_unique_idx
  on public.operations_capacite_stripe(entreprise_id)
  where statut in ('pending','stripe_applied','db_applied','needs_reconcile','scheduled');

alter table public.entreprises
  add constraint entreprises_capacite_planifiee_operation_fk
  foreign key (capacite_personnes_planifiee_operation_id)
  references public.operations_capacite_stripe(id) on delete set null
  not valid;
-- `not valid` : aucune ligne existante à revalider ; la contrainte s'applique aux écritures futures.

alter table public.operations_capacite_stripe enable row level security;
alter table public.operations_capacite_stripe force row level security;

-- Lecture : membre habilité aux paramètres, ou plateforme. AUCUNE écriture directe :
-- seules les RPC SECURITY DEFINER ci-dessous alimentent la table.
drop policy if exists operations_capacite_stripe_lecture on public.operations_capacite_stripe;
create policy operations_capacite_stripe_lecture on public.operations_capacite_stripe
  for select using (
    public.est_plateforme_admin()
    or (public.est_membre_actif(entreprise_id) and public.a_permission(entreprise_id, 'gerer_parametres'))
  );

revoke all on table public.operations_capacite_stripe from anon, authenticated, service_role;
grant select on table public.operations_capacite_stripe to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Verrou déterministe par entreprise (concurrence hausse/baisse simultanées)
--    Verrou transactionnel Postgres (pas un verrou mémoire process-only).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.verrou_operation_capacite(p_entreprise_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Un espace de clé dédié (première clé) + le hash de l'entreprise (deuxième clé)
  -- pour éviter toute collision avec d'autres verrous consultatifs du produit.
  perform pg_advisory_xact_lock(hashtext('elsatia:capacite_stripe'), hashtext(p_entreprise_id::text));
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Enregistrement d'une opération durable (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.enregistrer_operation_capacite_stripe(
  p_entreprise_id uuid,
  p_type_operation text,
  p_ancienne_capacite integer,
  p_nouvelle_capacite integer,
  p_plan_code text,
  p_periodicite text,
  p_price_id text,
  p_stripe_subscription_id text,
  p_idempotency_key text,
  p_date_effet_souhaitee timestamptz default null,
  p_source text default 'client',
  p_motif text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existante uuid;
  v_acteur uuid;
  v_id uuid;
begin
  if not (public.est_membre_actif(p_entreprise_id) or public.est_plateforme_admin()) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_type_operation not in ('hausse','baisse','swap_prix','synchronisation','suppression') then
    raise exception 'Type d''opération invalide' using errcode = '22023';
  end if;
  if p_source not in ('client','plateforme','stripe','cron','systeme') then
    raise exception 'Source invalide' using errcode = '22023';
  end if;
  if p_periodicite not in ('mensuel','annuel') then
    raise exception 'Périodicité invalide' using errcode = '22023';
  end if;
  if coalesce(p_nouvelle_capacite, -1) < 0 or coalesce(p_ancienne_capacite, -1) < 0
     or p_nouvelle_capacite > 100000 then
    raise exception 'Capacité invalide' using errcode = '22023';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'Clé d''idempotence obligatoire' using errcode = '22023';
  end if;

  perform public.verrou_operation_capacite(p_entreprise_id);

  -- Idempotence : la même opération logique rejouée renvoie l'opération existante.
  select id into v_existante
  from public.operations_capacite_stripe
  where idempotency_key = p_idempotency_key;
  if found then
    return v_existante;
  end if;

  begin
    v_acteur := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  exception when others then v_acteur := null;
  end;

  begin
    insert into public.operations_capacite_stripe(
      entreprise_id, type_operation, ancienne_capacite, nouvelle_capacite,
      plan_code, periodicite, price_id, stripe_subscription_id,
      statut, date_effet_souhaitee, source, acteur_id, motif, idempotency_key
    ) values (
      p_entreprise_id, p_type_operation, p_ancienne_capacite, p_nouvelle_capacite,
      nullif(btrim(p_plan_code), ''), p_periodicite, nullif(btrim(p_price_id), ''),
      nullif(btrim(p_stripe_subscription_id), ''),
      case when p_type_operation = 'baisse' and p_date_effet_souhaitee is not null
           then 'scheduled' else 'pending' end,
      p_date_effet_souhaitee, p_source, v_acteur, nullif(btrim(p_motif), ''),
      p_idempotency_key
    )
    returning id into v_id;
  exception when unique_violation then
    -- Course perdue face à une opération déjà active pour cette entreprise
    -- (index partiel operations_capacite_stripe_active_unique_idx).
    raise exception 'OPERATION_CAPACITE_EN_COURS'
      using errcode = 'P0001',
            hint = 'Une opération de capacité est déjà en cours pour cette entreprise.';
  end;

  return v_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Avancement de la saga (plateforme / couche serveur uniquement)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.finaliser_operation_capacite_stripe(
  p_operation_id uuid,
  p_statut text,
  p_stripe_item_id text default null,
  p_erreur_courte text default null,
  p_stripe_etat_observe jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entreprise uuid;
  v_statut_actuel text;
begin
  if not public.est_plateforme_admin() then
    raise exception 'Accès réservé à la plateforme' using errcode = '42501';
  end if;
  perform public.plateforme_exiger_session_aal2();

  if p_statut not in ('pending','stripe_applied','db_applied','completed','failed','needs_reconcile','scheduled') then
    raise exception 'Statut de saga invalide' using errcode = '22023';
  end if;

  select entreprise_id, statut into v_entreprise, v_statut_actuel
  from public.operations_capacite_stripe where id = p_operation_id for update;
  if not found then
    raise exception 'Opération introuvable' using errcode = 'P0002';
  end if;

  -- Transitions terminales figées : ne jamais « ré-ouvrir » une opération finalisée.
  if v_statut_actuel in ('completed','failed') and p_statut <> v_statut_actuel then
    raise exception 'Opération déjà finalisée (%)', v_statut_actuel using errcode = 'P0001';
  end if;

  update public.operations_capacite_stripe
  set statut = p_statut,
      stripe_item_id = coalesce(nullif(btrim(p_stripe_item_id), ''), stripe_item_id),
      erreur_courte = left(nullif(btrim(p_erreur_courte), ''), 500),
      stripe_etat_observe = coalesce(p_stripe_etat_observe, stripe_etat_observe),
      updated_at = now()
  where id = p_operation_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Lecture consolidée pour l'UI (capacité effective + planifiée + dernière opération)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.capacite_stripe_etat_entreprise(p_entreprise_id uuid)
returns table(
  capacite_supplementaire integer,
  capacite_supplementaire_planifiee integer,
  planifiee_effet_at timestamptz,
  operation_en_cours text,
  operation_en_cours_type text,
  operation_en_cours_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.est_membre_actif(p_entreprise_id) or public.est_plateforme_admin()) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return query
    select e.capacite_personnes_supplementaire,
           e.capacite_personnes_supplementaire_planifiee,
           e.capacite_personnes_planifiee_effet_at,
           op.statut, op.type_operation, op.updated_at
    from public.entreprises e
    left join lateral (
      select o.statut, o.type_operation, o.updated_at
      from public.operations_capacite_stripe o
      where o.entreprise_id = e.id
        and o.statut in ('pending','stripe_applied','db_applied','needs_reconcile','scheduled')
      order by o.updated_at desc
      limit 1
    ) op on true
    where e.id = p_entreprise_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ACL (cohérent avec la réconciliation ACL canonique + R1)
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.verrou_operation_capacite(uuid)                    from public, anon, authenticated;
revoke all on function public.enregistrer_operation_capacite_stripe(uuid, text, integer, integer, text, text, text, text, text, timestamptz, text, text)
  from public, anon;
revoke all on function public.finaliser_operation_capacite_stripe(uuid, text, text, text, jsonb)
  from public, anon, service_role;
revoke all on function public.capacite_stripe_etat_entreprise(uuid)              from public, anon, service_role;

grant execute on function public.enregistrer_operation_capacite_stripe(uuid, text, integer, integer, text, text, text, text, text, timestamptz, text, text)
  to authenticated;
grant execute on function public.finaliser_operation_capacite_stripe(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.capacite_stripe_etat_entreprise(uuid)           to authenticated;

notify pgrst, 'reload schema';

commit;
