-- ELSATIA-CAPACITY-STRIPE-R2-V1
-- Opérations durables et synchronisation bornée de la capacité de personnes.
begin;

alter table public.entreprises
  add column if not exists capacite_personnes_future integer check (capacite_personnes_future between 0 and 100000),
  add column if not exists capacite_personnes_future_at timestamptz;

create table public.operations_capacite_stripe (
  id uuid primary key,
  entreprise_id uuid not null references public.entreprises(id) on delete restrict,
  ancienne_quantite integer not null check (ancienne_quantite between 0 and 100000),
  nouvelle_quantite integer not null check (nouvelle_quantite between 0 and 100000),
  stripe_subscription_id text not null check (btrim(stripe_subscription_id) <> ''),
  stripe_item_id text,
  stripe_price_id text not null check (btrim(stripe_price_id) <> ''),
  statut text not null check (statut in (
    'en_attente','planifiee','paiement_en_attente','appliquee',
    'reconciliation_requise','echec','annulee'
  )),
  source text not null check (source in ('utilisateur','webhook','cron','systeme')),
  acteur_id uuid references auth.users(id) on delete set null,
  effective_at timestamptz,
  erreur_code text check (erreur_code is null or erreur_code ~ '^[a-z0-9_.:-]{1,96}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  check ((nouvelle_quantite < ancienne_quantite) = (effective_at is not null))
);

create unique index operations_capacite_stripe_active_entreprise_idx
  on public.operations_capacite_stripe(entreprise_id)
  where statut not in ('appliquee','echec','annulee');
create index operations_capacite_stripe_echeance_idx
  on public.operations_capacite_stripe(effective_at)
  where statut = 'planifiee';

alter table public.operations_capacite_stripe enable row level security;
alter table public.operations_capacite_stripe force row level security;
revoke all on table public.operations_capacite_stripe from public, anon, authenticated, service_role;

-- R2 autorise le rôle serveur du webhook à emprunter la RPC R1. Les utilisateurs
-- humains restent plateforme + AAL2 ; le service_role n'obtient aucun accès table.
create or replace function public.plateforme_definir_capacite_personnes_supplementaire(
  p_entreprise_id uuid,
  p_capacite integer,
  p_motif text default null,
  p_source text default 'admin_plateforme',
  p_reference_externe text default null
)
returns integer language plpgsql security definer set search_path = public as $$
declare v_ancien integer; v_acteur uuid;
begin
  if auth.role() <> 'service_role' then
    if not public.est_plateforme_admin() then
      raise exception 'Accès réservé à la plateforme' using errcode = '42501';
    end if;
    perform public.plateforme_exiger_session_aal2();
  end if;
  if p_capacite is null or p_capacite < 0 or p_capacite > 100000 then
    raise exception 'Capacité supplémentaire invalide' using errcode = '22023';
  end if;
  if p_source not in ('admin_plateforme','stripe','systeme') then
    raise exception 'Source invalide' using errcode = '22023';
  end if;
  select capacite_personnes_supplementaire into v_ancien
  from public.entreprises where id=p_entreprise_id for update;
  if not found then raise exception 'Entreprise introuvable' using errcode='P0002'; end if;
  begin v_acteur := nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
  exception when others then v_acteur := null; end;
  update public.entreprises set
    capacite_personnes_supplementaire=p_capacite,
    capacite_personnes_source=p_source,
    capacite_personnes_reference_externe=nullif(btrim(p_reference_externe),''),
    capacite_personnes_maj_at=now()
  where id=p_entreprise_id;
  if p_capacite is distinct from v_ancien then
    insert into public.historique_capacite_personnes(
      entreprise_id,action,ancien,nouveau,source,reference_externe,acteur_id,motif
    ) values (
      p_entreprise_id,
      case when p_capacite >= coalesce(v_ancien,0) then 'capacite_supplementaire_definie' else 'capacite_supplementaire_reduite' end,
      jsonb_build_object('capacite_personnes_supplementaire',coalesce(v_ancien,0)),
      jsonb_build_object('capacite_personnes_supplementaire',p_capacite),
      p_source,nullif(btrim(p_reference_externe),''),v_acteur,nullif(btrim(p_motif),'')
    );
  end if;
  return p_capacite;
end; $$;

grant execute on function public.plateforme_definir_capacite_personnes_supplementaire(uuid,integer,text,text,text)
  to service_role;

create function public.plateforme_commencer_operation_capacite_stripe_serveur(
  p_operation_id uuid,
  p_entreprise_id uuid,
  p_nouvelle_quantite integer,
  p_stripe_subscription_id text,
  p_stripe_price_id text,
  p_source text,
  p_acteur_id uuid,
  p_effective_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_ancienne integer; v_operation public.operations_capacite_stripe%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Rôle serveur requis' using errcode='42501'; end if;
  if p_operation_id is null or p_nouvelle_quantite not between 0 and 100000 then raise exception 'Opération invalide'; end if;
  if p_source not in ('utilisateur','cron','systeme') then raise exception 'Source invalide'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_entreprise_id::text,257));
  select capacite_personnes_supplementaire into v_ancienne from public.entreprises
  where id=p_entreprise_id and stripe_subscription_id=p_stripe_subscription_id for update;
  if not found then raise exception 'Cible Stripe incohérente'; end if;
  if (p_nouvelle_quantite < v_ancienne) is distinct from (p_effective_at is not null) then raise exception 'Date d''effet incohérente'; end if;
  insert into public.operations_capacite_stripe(
    id,entreprise_id,ancienne_quantite,nouvelle_quantite,stripe_subscription_id,
    stripe_price_id,statut,source,acteur_id,effective_at
  ) values (
    p_operation_id,p_entreprise_id,v_ancienne,p_nouvelle_quantite,p_stripe_subscription_id,
    p_stripe_price_id,case when p_effective_at is null then 'en_attente' else 'planifiee' end,
    p_source,p_acteur_id,p_effective_at
  ) returning * into v_operation;
  if p_effective_at is not null then
    update public.entreprises set capacite_personnes_future=p_nouvelle_quantite,
      capacite_personnes_future_at=p_effective_at where id=p_entreprise_id;
  end if;
  return jsonb_build_object('id',v_operation.id,'statut',v_operation.statut,'effective_at',v_operation.effective_at);
exception when unique_violation then
  raise exception 'Une opération de capacité est déjà active' using errcode='55P03';
end; $$;

create function public.plateforme_transition_operation_capacite_stripe_serveur(
  p_operation_id uuid,p_statut text,p_stripe_item_id text default null
) returns boolean language plpgsql security definer set search_path=public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Rôle serveur requis' using errcode='42501'; end if;
  if p_statut not in ('paiement_en_attente','reconciliation_requise','echec','annulee') then raise exception 'Transition invalide'; end if;
  update public.operations_capacite_stripe set statut=p_statut,
    stripe_item_id=coalesce(p_stripe_item_id,stripe_item_id),updated_at=now(),
    finalized_at=case when p_statut in ('echec','annulee') then now() else finalized_at end
  where id=p_operation_id and statut not in ('appliquee','echec','annulee');
  return found;
end; $$;

create function public.plateforme_synchroniser_capacite_personnes_stripe_serveur(
  p_entreprise_id uuid,p_stripe_subscription_id text,p_stripe_item_id text,
  p_stripe_price_id text,p_quantite integer,p_reference_evenement text,p_subscription_status text
) returns integer language plpgsql security definer set search_path=public as $$
declare v_operation public.operations_capacite_stripe%rowtype; v_subscription text; v_operation_trouvee boolean := false;
begin
  if auth.role() <> 'service_role' then raise exception 'Rôle serveur requis' using errcode='42501'; end if;
  if p_quantite not between 0 and 100000 then raise exception 'Quantité invalide'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_entreprise_id::text,257));
  select stripe_subscription_id into v_subscription from public.entreprises where id=p_entreprise_id for update;
  if v_subscription is distinct from p_stripe_subscription_id then raise exception 'Cible Stripe incohérente'; end if;
  select * into v_operation from public.operations_capacite_stripe
  where entreprise_id=p_entreprise_id and statut not in ('appliquee','echec','annulee')
  order by created_at desc limit 1 for update;
  v_operation_trouvee := found;
  if p_subscription_status in ('canceled','incomplete_expired') then
    if v_operation_trouvee then
      update public.operations_capacite_stripe set statut='annulee',updated_at=now(),finalized_at=now()
      where id=v_operation.id;
      v_operation_trouvee := false;
    end if;
    p_quantite := 0;
    p_stripe_item_id := null;
  elsif v_operation_trouvee and v_operation.statut='planifiee' and v_operation.effective_at>now() then
    if p_quantite <> v_operation.ancienne_quantite then
      raise exception 'Dérive Stripe pendant une baisse planifiée' using errcode='40001';
    end if;
    return p_quantite;
  end if;
  if v_operation_trouvee and v_operation.nouvelle_quantite <> p_quantite then
    raise exception 'Observation Stripe différente de l''intention active' using errcode='40001';
  end if;
  perform public.plateforme_definir_capacite_personnes_supplementaire(
    p_entreprise_id,p_quantite,'Synchronisation Stripe R2','stripe',coalesce(p_stripe_item_id,p_reference_evenement)
  );
  if v_operation_trouvee then
    update public.operations_capacite_stripe set statut='appliquee',stripe_item_id=p_stripe_item_id,
      updated_at=now(),finalized_at=now() where id=v_operation.id;
  end if;
  update public.entreprises set capacite_personnes_future=null,capacite_personnes_future_at=null
  where id=p_entreprise_id and capacite_personnes_future=p_quantite;
  return p_quantite;
end; $$;

create function public.plateforme_lister_operations_capacite_stripe_echues_serveur()
returns table(id uuid,entreprise_id uuid,stripe_subscription_id text,nouvelle_quantite integer,stripe_price_id text)
language plpgsql security definer set search_path=public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Rôle serveur requis' using errcode='42501'; end if;
  return query select o.id,o.entreprise_id,o.stripe_subscription_id,o.nouvelle_quantite,o.stripe_price_id
  from public.operations_capacite_stripe o where o.statut='planifiee' and o.effective_at<=now()
  order by o.effective_at for update skip locked;
end; $$;

revoke all on function public.plateforme_commencer_operation_capacite_stripe_serveur(uuid,uuid,integer,text,text,text,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.plateforme_transition_operation_capacite_stripe_serveur(uuid,text,text) from public,anon,authenticated;
revoke all on function public.plateforme_synchroniser_capacite_personnes_stripe_serveur(uuid,text,text,text,integer,text,text) from public,anon,authenticated;
revoke all on function public.plateforme_lister_operations_capacite_stripe_echues_serveur() from public,anon,authenticated;
grant execute on function public.plateforme_commencer_operation_capacite_stripe_serveur(uuid,uuid,integer,text,text,text,uuid,timestamptz) to service_role;
grant execute on function public.plateforme_transition_operation_capacite_stripe_serveur(uuid,text,text) to service_role;
grant execute on function public.plateforme_synchroniser_capacite_personnes_stripe_serveur(uuid,text,text,text,integer,text,text) to service_role;
grant execute on function public.plateforme_lister_operations_capacite_stripe_echues_serveur() to service_role;

commit;
