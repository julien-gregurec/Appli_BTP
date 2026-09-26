-- Rend les remises Stripe récupérables après toute interruption entre Stripe et
-- Supabase. Le registre est privé ; seules les RPC plateforme rôle + AAL2 le
-- manipulent. Les transitions importantes sont conservées en append-only.

create table public.plateforme_operations_remise (
  id uuid primary key default gen_random_uuid(),
  intention_id uuid not null unique,
  entreprise_id uuid not null references public.entreprises(id) on delete restrict,
  abonnement_entreprise_id uuid references public.abonnements_entreprises(id) on delete restrict,
  stripe_subscription_id text not null check (btrim(stripe_subscription_id) <> ''),
  type_operation text not null check (type_operation in ('application','retrait')),
  etat_souhaite jsonb not null,
  etat_observe_avant jsonb,
  etat_observe_apres_stripe jsonb,
  statut text not null default 'pending' check (statut in (
    'pending','stripe_in_progress','stripe_applied','stripe_removed',
    'database_finalization_pending','completed','reconciliation_required',
    'failed_before_stripe','cancelled'
  )),
  auteur_utilisateur_id uuid not null references auth.users(id) on delete restrict,
  coupon_stripe_id text,
  cle_idempotence_coupon text,
  cle_idempotence_application text,
  numero_posts_application integer not null default 0 check (numero_posts_application >= 0),
  empreinte_erreur text check (empreinte_erreur is null or empreinte_erreur ~ '^[a-z0-9_.:-]{1,96}$'),
  nombre_tentatives integer not null default 0 check (nombre_tentatives >= 0),
  created_at timestamptz not null default now(),
  derniere_tentative_at timestamptz,
  finalized_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (type_operation = 'application'
      and coalesce((etat_souhaite ->> 'active')::boolean,false)
      and etat_souhaite->>'type' in ('montant','pourcentage')
      and (etat_souhaite->>'valeur')::numeric > 0
      and etat_souhaite->>'duree' in ('once','repeating','forever')
      and btrim(coalesce(etat_souhaite->>'description','')) <> ''
      and btrim(coalesce(etat_souhaite->>'motif_interne','')) <> '')
    or (type_operation = 'retrait' and not coalesce((etat_souhaite ->> 'active')::boolean,true))
  )
);

create unique index plateforme_operations_remise_active_subscription_idx
  on public.plateforme_operations_remise(stripe_subscription_id)
  where statut not in ('completed','failed_before_stripe','cancelled');
create index plateforme_operations_remise_entreprise_idx
  on public.plateforme_operations_remise(entreprise_id, created_at desc);

create table public.plateforme_operations_remise_historique (
  id bigint generated always as identity primary key,
  operation_id uuid not null references public.plateforme_operations_remise(id) on delete restrict,
  statut_avant text,
  statut_apres text not null,
  auteur_utilisateur_id uuid not null references auth.users(id) on delete restrict,
  etat_observe jsonb,
  empreinte_erreur text check (empreinte_erreur is null or empreinte_erreur ~ '^[a-z0-9_.:-]{1,96}$'),
  created_at timestamptz not null default now()
);

create index plateforme_operations_remise_historique_operation_idx
  on public.plateforme_operations_remise_historique(operation_id, id);

alter table public.plateforme_operations_remise enable row level security;
alter table public.plateforme_operations_remise force row level security;
alter table public.plateforme_operations_remise_historique enable row level security;
alter table public.plateforme_operations_remise_historique force row level security;

revoke all on table public.plateforme_operations_remise from public, anon, authenticated;
revoke all on table public.plateforme_operations_remise_historique from public, anon, authenticated;
revoke all on sequence public.plateforme_operations_remise_historique_id_seq from public, anon, authenticated;

create function public.plateforme_operations_remise_historique_append_only()
returns trigger language plpgsql set search_path=public as $$
begin
  raise exception 'Historique des opérations de remise immuable';
end;
$$;

create trigger plateforme_operations_remise_historique_immuable
before update or delete on public.plateforme_operations_remise_historique
for each row execute function public.plateforme_operations_remise_historique_append_only();

-- Retour JSON volontairement borné : aucun secret Stripe ni diagnostic libre.
create function public.plateforme_operation_remise_json(p_operation public.plateforme_operations_remise)
returns jsonb language sql stable set search_path=public as $$
  select jsonb_build_object(
    'id',p_operation.id,'intention_id',p_operation.intention_id,'entreprise_id',p_operation.entreprise_id,
    'stripe_subscription_id',p_operation.stripe_subscription_id,
    'type_operation',p_operation.type_operation,'etat_souhaite',p_operation.etat_souhaite,
    'etat_observe_avant',p_operation.etat_observe_avant,
    'etat_observe_apres_stripe',p_operation.etat_observe_apres_stripe,
    'statut',p_operation.statut,'coupon_stripe_id',p_operation.coupon_stripe_id,
    'cle_idempotence_coupon',p_operation.cle_idempotence_coupon,
    'cle_idempotence_application',p_operation.cle_idempotence_application,
    'numero_posts_application',p_operation.numero_posts_application,
    'nombre_tentatives',p_operation.nombre_tentatives
  );
$$;

create function public.plateforme_commencer_operation_remise(
  p_entreprise_id uuid,
  p_intention_id uuid,
  p_stripe_subscription_id text,
  p_type_operation text,
  p_etat_souhaite jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_operation public.plateforme_operations_remise%rowtype;
  v_abonnement_id uuid;
begin
  perform public.plateforme_exiger_role('total','facturation');
  perform public.plateforme_exiger_session_aal2();
  if p_type_operation not in ('application','retrait') then raise exception 'Type d''opération invalide'; end if;
  if p_intention_id is null then raise exception 'Identifiant d''intention invalide'; end if;
  if p_stripe_subscription_id is null or btrim(p_stripe_subscription_id)='' then raise exception 'Abonnement Stripe invalide'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_stripe_subscription_id, 240));
  if not exists(
    select 1 from public.entreprises
    where id=p_entreprise_id and stripe_subscription_id=p_stripe_subscription_id
  ) then raise exception 'Cible Stripe incohérente'; end if;
  select id into v_abonnement_id from public.abonnements_entreprises
  where entreprise_id=p_entreprise_id and stripe_subscription_id=p_stripe_subscription_id;

  select * into v_operation from public.plateforme_operations_remise
  where intention_id=p_intention_id for update;
  if found then
    if v_operation.entreprise_id<>p_entreprise_id
       or v_operation.stripe_subscription_id<>p_stripe_subscription_id
       or v_operation.type_operation<>p_type_operation
       or v_operation.etat_souhaite<>p_etat_souhaite then
      raise exception 'Identifiant d''intention déjà utilisé pour une autre opération';
    end if;
    return public.plateforme_operation_remise_json(v_operation);
  end if;

  select * into v_operation from public.plateforme_operations_remise
  where stripe_subscription_id=p_stripe_subscription_id
    and statut not in ('completed','failed_before_stripe','cancelled')
  for update;
  if found then
    if v_operation.type_operation<>p_type_operation or v_operation.etat_souhaite<>p_etat_souhaite then
      raise exception 'Une opération de remise incompatible est déjà en cours';
    end if;
    if v_operation.statut='stripe_in_progress'
       and v_operation.derniere_tentative_at < now()-interval '2 minutes' then
      insert into public.plateforme_operations_remise_historique(
        operation_id,statut_avant,statut_apres,auteur_utilisateur_id,empreinte_erreur
      ) values(v_operation.id,'stripe_in_progress','reconciliation_required',auth.uid(),'remise.reprise_apres_lease');
      update public.plateforme_operations_remise set statut='reconciliation_required',
        empreinte_erreur='remise.reprise_apres_lease',updated_at=now()
      where id=v_operation.id returning * into v_operation;
    end if;
    return public.plateforme_operation_remise_json(v_operation);
  end if;

  insert into public.plateforme_operations_remise(
    intention_id,entreprise_id,abonnement_entreprise_id,stripe_subscription_id,type_operation,
    etat_souhaite,auteur_utilisateur_id
  ) values (
    p_intention_id,p_entreprise_id,v_abonnement_id,p_stripe_subscription_id,p_type_operation,
    p_etat_souhaite,auth.uid()
  ) returning * into v_operation;

  if p_type_operation='application' then
    update public.plateforme_operations_remise set
      cle_idempotence_coupon='elsatia-remise-coupon-'||v_operation.id::text
    where id=v_operation.id returning * into v_operation;
  end if;
  insert into public.plateforme_operations_remise_historique(
    operation_id,statut_avant,statut_apres,auteur_utilisateur_id
  ) values(v_operation.id,null,'pending',auth.uid());
  return public.plateforme_operation_remise_json(v_operation);
end;
$$;

create function public.plateforme_enregistrer_coupon_operation_remise(
  p_operation_id uuid,p_coupon_stripe_id text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_operation public.plateforme_operations_remise%rowtype;
begin
  perform public.plateforme_exiger_role('total','facturation');
  perform public.plateforme_exiger_session_aal2();
  if p_coupon_stripe_id is null or btrim(p_coupon_stripe_id)='' then raise exception 'Coupon invalide'; end if;
  select * into v_operation from public.plateforme_operations_remise where id=p_operation_id for update;
  if not found then raise exception 'Opération introuvable'; end if;
  if v_operation.type_operation<>'application' or v_operation.statut<>'stripe_in_progress' then
    raise exception 'Checkpoint coupon impossible dans cet état';
  end if;
  if v_operation.coupon_stripe_id is not null and v_operation.coupon_stripe_id<>p_coupon_stripe_id then
    raise exception 'Coupon immuable pour cette intention';
  end if;
  if v_operation.coupon_stripe_id is null then
    update public.plateforme_operations_remise set coupon_stripe_id=p_coupon_stripe_id,updated_at=now()
    where id=p_operation_id returning * into v_operation;
    insert into public.plateforme_operations_remise_historique(
      operation_id,statut_avant,statut_apres,auteur_utilisateur_id
    ) values(v_operation.id,'stripe_in_progress','stripe_in_progress',auth.uid());
  end if;
  return public.plateforme_operation_remise_json(v_operation);
end;
$$;

-- Prépare et persiste une clé neuve avant chaque POST d'application réellement
-- nécessaire. Le numéro appartient à la même intention ; un timeout peut ainsi
-- être repris après lecture Stripe sans réutiliser aveuglément un résultat caché.
create function public.plateforme_preparer_post_application_remise(
  p_operation_id uuid,
  p_etat_observe jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_operation public.plateforme_operations_remise%rowtype;
begin
  perform public.plateforme_exiger_role('total','facturation');
  perform public.plateforme_exiger_session_aal2();
  select * into v_operation from public.plateforme_operations_remise where id=p_operation_id for update;
  if not found then raise exception 'Opération introuvable'; end if;
  if v_operation.type_operation<>'application' or v_operation.statut<>'stripe_in_progress' then
    raise exception 'POST Stripe impossible dans cet état';
  end if;
  update public.plateforme_operations_remise set
    numero_posts_application=numero_posts_application+1,
    cle_idempotence_application='elsatia-remise-application-'||id::text||'-'||(numero_posts_application+1)::text,
    etat_observe_apres_stripe=coalesce(p_etat_observe,etat_observe_apres_stripe),updated_at=now()
  where id=p_operation_id returning * into v_operation;
  insert into public.plateforme_operations_remise_historique(
    operation_id,statut_avant,statut_apres,auteur_utilisateur_id,etat_observe
  ) values(v_operation.id,'stripe_in_progress','stripe_in_progress',auth.uid(),p_etat_observe);
  return public.plateforme_operation_remise_json(v_operation);
end;
$$;

create function public.plateforme_lire_operation_remise(p_operation_id uuid)
returns jsonb language plpgsql security definer stable set search_path=public as $$
declare v_operation public.plateforme_operations_remise%rowtype;
begin
  perform public.plateforme_exiger_role('total','facturation');
  perform public.plateforme_exiger_session_aal2();
  select * into v_operation from public.plateforme_operations_remise where id=p_operation_id;
  if not found then raise exception 'Opération introuvable'; end if;
  return public.plateforme_operation_remise_json(v_operation);
end;
$$;

create function public.plateforme_transition_operation_remise(
  p_operation_id uuid,
  p_nouveau_statut text,
  p_etat_observe jsonb default null,
  p_coupon_stripe_id text default null,
  p_empreinte_erreur text default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_operation public.plateforme_operations_remise%rowtype;
  v_autorisee boolean;
  v_statut_avant text;
begin
  perform public.plateforme_exiger_role('total','facturation');
  perform public.plateforme_exiger_session_aal2();
  if p_empreinte_erreur is not null and p_empreinte_erreur !~ '^[a-z0-9_.:-]{1,96}$' then
    raise exception 'Empreinte d''erreur invalide';
  end if;
  select * into v_operation from public.plateforme_operations_remise where id=p_operation_id for update;
  if not found then raise exception 'Opération introuvable'; end if;
  if v_operation.statut in ('completed','failed_before_stripe','cancelled') then
    if v_operation.statut=p_nouveau_statut then return public.plateforme_operation_remise_json(v_operation); end if;
    raise exception 'Opération terminée immuable';
  end if;
  v_statut_avant := v_operation.statut;
  v_autorisee := case v_operation.statut
    when 'pending' then p_nouveau_statut in ('stripe_in_progress','failed_before_stripe','cancelled','reconciliation_required')
    when 'stripe_in_progress' then p_nouveau_statut in ('stripe_applied','stripe_removed','reconciliation_required')
    when 'stripe_applied' then p_nouveau_statut in ('database_finalization_pending','reconciliation_required')
    when 'stripe_removed' then p_nouveau_statut in ('database_finalization_pending','reconciliation_required')
    when 'database_finalization_pending' then p_nouveau_statut in ('reconciliation_required','stripe_in_progress')
    when 'reconciliation_required' then p_nouveau_statut in ('stripe_in_progress','database_finalization_pending')
    else false end;
  if not v_autorisee then raise exception 'Transition d''opération interdite'; end if;

  update public.plateforme_operations_remise set
    statut=p_nouveau_statut,
    etat_observe_avant=case when v_operation.etat_observe_avant is null then p_etat_observe else v_operation.etat_observe_avant end,
    etat_observe_apres_stripe=case when p_nouveau_statut in ('stripe_applied','stripe_removed','database_finalization_pending') then coalesce(p_etat_observe,etat_observe_apres_stripe) else etat_observe_apres_stripe end,
    coupon_stripe_id=coalesce(p_coupon_stripe_id,coupon_stripe_id),
    empreinte_erreur=p_empreinte_erreur,
    nombre_tentatives=case when p_nouveau_statut='stripe_in_progress' then nombre_tentatives+1 else nombre_tentatives end,
    derniere_tentative_at=case when p_nouveau_statut='stripe_in_progress' then now() else derniere_tentative_at end,
    updated_at=now()
  where id=p_operation_id returning * into v_operation;
  insert into public.plateforme_operations_remise_historique(
    operation_id,statut_avant,statut_apres,auteur_utilisateur_id,etat_observe,empreinte_erreur
  ) values(p_operation_id,v_statut_avant,p_nouveau_statut,auth.uid(),p_etat_observe,p_empreinte_erreur);
  return public.plateforme_operation_remise_json(v_operation);
end;
$$;

create function public.plateforme_finaliser_operation_remise(
  p_operation_id uuid,
  p_etat_observe_apres jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_operation public.plateforme_operations_remise%rowtype;
  v_ancien public.entreprises%rowtype;
begin
  perform public.plateforme_exiger_role('total','facturation');
  perform public.plateforme_exiger_session_aal2();
  select * into v_operation from public.plateforme_operations_remise where id=p_operation_id for update;
  if not found then raise exception 'Opération introuvable'; end if;
  if v_operation.statut='completed' then return public.plateforme_operation_remise_json(v_operation); end if;
  if v_operation.statut not in ('stripe_applied','stripe_removed','database_finalization_pending','reconciliation_required') then
    raise exception 'État Stripe non confirmé';
  end if;
  if v_operation.type_operation='application' then
    if v_operation.coupon_stripe_id is null or p_etat_observe_apres->>'coupon_id' is distinct from v_operation.coupon_stripe_id then
      raise exception 'Remise Stripe attendue non confirmée';
    end if;
  elsif p_etat_observe_apres->>'coupon_id' is not null then
    raise exception 'Retrait Stripe non confirmé';
  end if;
  select * into v_ancien from public.entreprises where id=v_operation.entreprise_id for update;
  if not found then raise exception 'Entreprise introuvable'; end if;

  if v_operation.type_operation='application' then
    update public.entreprises set
      remise_stripe_coupon_id=v_operation.coupon_stripe_id,
      remise_description=v_operation.etat_souhaite->>'description',
      remise_motif_interne=v_operation.etat_souhaite->>'motif_interne',
      remise_duree_mois=nullif(v_operation.etat_souhaite->>'duree_mois','')::integer,
      remise_type=v_operation.etat_souhaite->>'type',
      remise_valeur=(v_operation.etat_souhaite->>'valeur')::numeric,
      remise_cree_par=auth.uid(),remise_appliquee_at=now(),updated_at=now()
    where id=v_operation.entreprise_id;
    if v_ancien.remise_stripe_coupon_id is distinct from v_operation.coupon_stripe_id then
      insert into public.historique_tarification(entreprise_id,utilisateur_id,action,ancien,nouveau,motif)
      values(v_operation.entreprise_id,auth.uid(),'remise_appliquee',
        jsonb_build_object('remise_stripe_coupon_id',v_ancien.remise_stripe_coupon_id,'remise_description',v_ancien.remise_description),
        jsonb_build_object('remise_stripe_coupon_id',v_operation.coupon_stripe_id,'remise_description',v_operation.etat_souhaite->>'description','duree_mois',v_operation.etat_souhaite->>'duree_mois'),
        v_operation.etat_souhaite->>'motif_interne');
    end if;
  else
    update public.entreprises set remise_stripe_coupon_id=null,remise_description=null,
      remise_motif_interne=null,remise_duree_mois=null,remise_type=null,remise_valeur=null,
      remise_cree_par=null,remise_appliquee_at=null,updated_at=now()
    where id=v_operation.entreprise_id;
    if v_ancien.remise_stripe_coupon_id is not null or v_ancien.remise_description is not null then
      insert into public.historique_tarification(entreprise_id,utilisateur_id,action,ancien,nouveau,motif)
      values(v_operation.entreprise_id,auth.uid(),'remise_retiree',
        jsonb_build_object('remise_stripe_coupon_id',v_ancien.remise_stripe_coupon_id,'remise_description',v_ancien.remise_description),null,null);
    end if;
  end if;

  insert into public.plateforme_operations_remise_historique(
    operation_id,statut_avant,statut_apres,auteur_utilisateur_id,etat_observe
  ) values(v_operation.id,v_operation.statut,'completed',auth.uid(),p_etat_observe_apres);
  update public.plateforme_operations_remise set
    statut='completed',etat_observe_apres_stripe=p_etat_observe_apres,
    finalized_at=now(),updated_at=now(),empreinte_erreur=null
  where id=v_operation.id returning * into v_operation;
  return public.plateforme_operation_remise_json(v_operation);
end;
$$;

revoke all on function public.plateforme_operations_remise_historique_append_only() from public,anon,authenticated;
revoke all on function public.plateforme_operation_remise_json(public.plateforme_operations_remise) from public,anon;
revoke all on function public.plateforme_commencer_operation_remise(uuid,uuid,text,text,jsonb) from public,anon;
revoke all on function public.plateforme_lire_operation_remise(uuid) from public,anon;
revoke all on function public.plateforme_preparer_post_application_remise(uuid,jsonb) from public,anon;
revoke all on function public.plateforme_enregistrer_coupon_operation_remise(uuid,text) from public,anon;
revoke all on function public.plateforme_transition_operation_remise(uuid,text,jsonb,text,text) from public,anon;
revoke all on function public.plateforme_finaliser_operation_remise(uuid,jsonb) from public,anon;
grant execute on function public.plateforme_commencer_operation_remise(uuid,uuid,text,text,jsonb) to authenticated;
grant execute on function public.plateforme_lire_operation_remise(uuid) to authenticated;
grant execute on function public.plateforme_preparer_post_application_remise(uuid,jsonb) to authenticated;
grant execute on function public.plateforme_enregistrer_coupon_operation_remise(uuid,text) to authenticated;
grant execute on function public.plateforme_transition_operation_remise(uuid,text,jsonb,text,text) to authenticated;
grant execute on function public.plateforme_finaliser_operation_remise(uuid,jsonb) to authenticated;

notify pgrst, 'reload schema';
