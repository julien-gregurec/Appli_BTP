-- F4 : sépare définitivement la demande utilisateur de la preuve Stripe.
-- Les opérations internes exigent service_role et un verrou serveur commun à la
-- saga et au webhook. La finalisation consomme uniquement un checkpoint persisté.

alter table public.plateforme_operations_remise
  add column preuve_serveur_id uuid,
  add column preuve_intention_id uuid,
  add column preuve_stripe_subscription_id text,
  add column preuve_numero_tentative integer,
  add column preuve_etat_observe jsonb,
  add column preuve_observee_at timestamptz;

create unique index plateforme_operations_remise_preuve_serveur_idx
  on public.plateforme_operations_remise(preuve_serveur_id)
  where preuve_serveur_id is not null;

create table public.plateforme_verrous_remise_stripe (
  stripe_subscription_id text primary key check (btrim(stripe_subscription_id) <> ''),
  verrou_token uuid not null unique,
  proprietaire text not null check (proprietaire ~ '^[a-z0-9_.:-]{1,96}$'),
  acquis_at timestamptz not null default now(),
  expire_at timestamptz not null,
  check (expire_at > acquis_at)
);

alter table public.plateforme_verrous_remise_stripe enable row level security;
alter table public.plateforme_verrous_remise_stripe force row level security;

revoke all on table public.plateforme_operations_remise from service_role;
revoke all on table public.plateforme_operations_remise_historique from service_role;
revoke all on table public.plateforme_verrous_remise_stripe from public,anon,authenticated,service_role;

-- Les anciennes RPC F3 ne constituent plus une frontière serveur.
revoke all on function public.plateforme_enregistrer_coupon_operation_remise(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.plateforme_preparer_post_application_remise(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.plateforme_transition_operation_remise(uuid,text,jsonb,text,text) from public,anon,authenticated,service_role;
revoke all on function public.plateforme_finaliser_operation_remise(uuid,jsonb) from public,anon,authenticated,service_role;

create function public.plateforme_exiger_traitement_remise_serveur()
returns void language plpgsql stable security definer set search_path=public as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Traitement serveur de remise requis';
  end if;
end;
$$;

create function public.plateforme_verifier_verrou_remise_serveur(
  p_stripe_subscription_id text,
  p_verrou_token uuid
) returns void language plpgsql stable security definer set search_path=public as $$
begin
  perform public.plateforme_exiger_traitement_remise_serveur();
  if not exists (
    select 1 from public.plateforme_verrous_remise_stripe
    where stripe_subscription_id=p_stripe_subscription_id
      and verrou_token=p_verrou_token and expire_at>now()
  ) then raise exception 'Verrou serveur de remise absent ou expiré'; end if;
end;
$$;

create function public.plateforme_acquerir_verrou_remise_serveur(
  p_stripe_subscription_id text,
  p_proprietaire text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_token uuid := gen_random_uuid();
begin
  perform public.plateforme_exiger_traitement_remise_serveur();
  if p_stripe_subscription_id is null or btrim(p_stripe_subscription_id)='' then raise exception 'Abonnement Stripe invalide'; end if;
  if p_proprietaire is null or p_proprietaire !~ '^[a-z0-9_.:-]{1,96}$' then raise exception 'Propriétaire de verrou invalide'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_stripe_subscription_id,241));
  delete from public.plateforme_verrous_remise_stripe
  where stripe_subscription_id=p_stripe_subscription_id and expire_at<=now();
  insert into public.plateforme_verrous_remise_stripe(stripe_subscription_id,verrou_token,proprietaire,expire_at)
  values(p_stripe_subscription_id,v_token,p_proprietaire,now()+interval '2 minutes')
  on conflict(stripe_subscription_id) do nothing;
  if not found then return null; end if;
  return v_token;
end;
$$;

create function public.plateforme_relacher_verrou_remise_serveur(
  p_stripe_subscription_id text,
  p_verrou_token uuid
) returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform public.plateforme_exiger_traitement_remise_serveur();
  delete from public.plateforme_verrous_remise_stripe
  where stripe_subscription_id=p_stripe_subscription_id and verrou_token=p_verrou_token;
  return found;
end;
$$;

-- Vue complète exclusivement serveur. La RPC utilisateur est réduite plus bas.
create function public.plateforme_lire_operation_remise_serveur(
  p_operation_id uuid,
  p_verrou_token uuid
) returns jsonb language plpgsql security definer stable set search_path=public as $$
declare v_operation public.plateforme_operations_remise%rowtype;
begin
  perform public.plateforme_exiger_traitement_remise_serveur();
  select * into v_operation from public.plateforme_operations_remise where id=p_operation_id;
  if not found then raise exception 'Opération introuvable'; end if;
  perform public.plateforme_verifier_verrou_remise_serveur(v_operation.stripe_subscription_id,p_verrou_token);
  return public.plateforme_operation_remise_json(v_operation) || jsonb_build_object(
    'preuve_serveur_id',v_operation.preuve_serveur_id,
    'preuve_numero_tentative',v_operation.preuve_numero_tentative
  );
end;
$$;

create function public.plateforme_resoudre_abonnement_operation_remise_serveur(p_operation_id uuid)
returns text language plpgsql security definer stable set search_path=public as $$
declare v_subscription text;
begin
  perform public.plateforme_exiger_traitement_remise_serveur();
  select stripe_subscription_id into v_subscription from public.plateforme_operations_remise where id=p_operation_id;
  if not found then raise exception 'Opération introuvable'; end if;
  return v_subscription;
end;
$$;

create function public.plateforme_lire_operation_active_remise_serveur(
  p_stripe_subscription_id text,
  p_verrou_token uuid
) returns jsonb language plpgsql security definer stable set search_path=public as $$
declare v_operation public.plateforme_operations_remise%rowtype;
begin
  perform public.plateforme_verifier_verrou_remise_serveur(p_stripe_subscription_id,p_verrou_token);
  select * into v_operation from public.plateforme_operations_remise
  where stripe_subscription_id=p_stripe_subscription_id
    and statut not in ('completed','failed_before_stripe','cancelled')
  order by created_at desc limit 1;
  if not found then return null; end if;
  return public.plateforme_operation_remise_json(v_operation);
end;
$$;

create function public.plateforme_transition_operation_remise_serveur(
  p_operation_id uuid,
  p_verrou_token uuid,
  p_nouveau_statut text,
  p_empreinte_erreur text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_operation public.plateforme_operations_remise%rowtype; v_avant text; v_ok boolean;
begin
  perform public.plateforme_exiger_traitement_remise_serveur();
  if p_empreinte_erreur is not null and p_empreinte_erreur !~ '^[a-z0-9_.:-]{1,96}$' then raise exception 'Empreinte invalide'; end if;
  select * into v_operation from public.plateforme_operations_remise where id=p_operation_id for update;
  if not found then raise exception 'Opération introuvable'; end if;
  perform public.plateforme_verifier_verrou_remise_serveur(v_operation.stripe_subscription_id,p_verrou_token);
  if v_operation.statut in ('completed','failed_before_stripe','cancelled') then
    if v_operation.statut=p_nouveau_statut then return public.plateforme_operation_remise_json(v_operation); end if;
    raise exception 'Opération terminée immuable';
  end if;
  v_avant:=v_operation.statut;
  v_ok:=case v_avant
    when 'pending' then p_nouveau_statut in ('stripe_in_progress','failed_before_stripe','cancelled','reconciliation_required')
    when 'stripe_in_progress' then p_nouveau_statut in ('stripe_applied','stripe_removed','reconciliation_required')
    when 'stripe_applied' then p_nouveau_statut='reconciliation_required'
    when 'stripe_removed' then p_nouveau_statut='reconciliation_required'
    when 'database_finalization_pending' then p_nouveau_statut in ('reconciliation_required','stripe_in_progress')
    when 'reconciliation_required' then p_nouveau_statut='stripe_in_progress'
    else false end;
  if not v_ok then raise exception 'Transition serveur interdite'; end if;
  update public.plateforme_operations_remise set statut=p_nouveau_statut,
    empreinte_erreur=p_empreinte_erreur,
    nombre_tentatives=nombre_tentatives+(p_nouveau_statut='stripe_in_progress')::integer,
    derniere_tentative_at=case when p_nouveau_statut='stripe_in_progress' then now() else derniere_tentative_at end,
    preuve_serveur_id=case when p_nouveau_statut='stripe_in_progress' then null else preuve_serveur_id end,
    preuve_intention_id=case when p_nouveau_statut='stripe_in_progress' then null else preuve_intention_id end,
    preuve_stripe_subscription_id=case when p_nouveau_statut='stripe_in_progress' then null else preuve_stripe_subscription_id end,
    preuve_numero_tentative=case when p_nouveau_statut='stripe_in_progress' then null else preuve_numero_tentative end,
    preuve_etat_observe=case when p_nouveau_statut='stripe_in_progress' then null else preuve_etat_observe end,
    preuve_observee_at=case when p_nouveau_statut='stripe_in_progress' then null else preuve_observee_at end,
    updated_at=now() where id=p_operation_id returning * into v_operation;
  insert into public.plateforme_operations_remise_historique(operation_id,statut_avant,statut_apres,auteur_utilisateur_id,empreinte_erreur)
  values(v_operation.id,v_avant,p_nouveau_statut,v_operation.auteur_utilisateur_id,p_empreinte_erreur);
  return public.plateforme_operation_remise_json(v_operation);
end;
$$;

create function public.plateforme_enregistrer_coupon_operation_remise_serveur(
  p_operation_id uuid,p_verrou_token uuid,p_coupon_stripe_id text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_operation public.plateforme_operations_remise%rowtype;
begin
  perform public.plateforme_exiger_traitement_remise_serveur();
  select * into v_operation from public.plateforme_operations_remise where id=p_operation_id for update;
  if not found then raise exception 'Opération introuvable'; end if;
  perform public.plateforme_verifier_verrou_remise_serveur(v_operation.stripe_subscription_id,p_verrou_token);
  if p_coupon_stripe_id is null or btrim(p_coupon_stripe_id)='' or v_operation.type_operation<>'application' or v_operation.statut<>'stripe_in_progress' then raise exception 'Checkpoint coupon invalide'; end if;
  if v_operation.coupon_stripe_id is not null and v_operation.coupon_stripe_id<>p_coupon_stripe_id then raise exception 'Coupon immuable'; end if;
  if v_operation.coupon_stripe_id is null then
    update public.plateforme_operations_remise set coupon_stripe_id=p_coupon_stripe_id,updated_at=now() where id=p_operation_id returning * into v_operation;
    insert into public.plateforme_operations_remise_historique(operation_id,statut_avant,statut_apres,auteur_utilisateur_id)
    values(v_operation.id,'stripe_in_progress','stripe_in_progress',v_operation.auteur_utilisateur_id);
  end if;
  return public.plateforme_operation_remise_json(v_operation);
end;
$$;

create function public.plateforme_preparer_post_application_remise_serveur(
  p_operation_id uuid,p_verrou_token uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_operation public.plateforme_operations_remise%rowtype;
begin
  perform public.plateforme_exiger_traitement_remise_serveur();
  select * into v_operation from public.plateforme_operations_remise where id=p_operation_id for update;
  if not found then raise exception 'Opération introuvable'; end if;
  perform public.plateforme_verifier_verrou_remise_serveur(v_operation.stripe_subscription_id,p_verrou_token);
  if v_operation.type_operation<>'application' or v_operation.statut<>'stripe_in_progress' then raise exception 'POST Stripe impossible'; end if;
  update public.plateforme_operations_remise set numero_posts_application=numero_posts_application+1,
    cle_idempotence_application='elsatia-remise-application-'||id::text||'-'||(numero_posts_application+1)::text,
    updated_at=now() where id=p_operation_id returning * into v_operation;
  insert into public.plateforme_operations_remise_historique(operation_id,statut_avant,statut_apres,auteur_utilisateur_id)
  values(v_operation.id,'stripe_in_progress','stripe_in_progress',v_operation.auteur_utilisateur_id);
  return public.plateforme_operation_remise_json(v_operation);
end;
$$;

-- Seul ce checkpoint service_role peut produire database_finalization_pending.
create function public.plateforme_enregistrer_preuve_stripe_serveur(
  p_operation_id uuid,p_verrou_token uuid,p_numero_tentative integer,p_etat_observe jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_operation public.plateforme_operations_remise%rowtype; v_preuve uuid; v_conforme boolean; v_avant text; v_apres text;
begin
  perform public.plateforme_exiger_traitement_remise_serveur();
  select * into v_operation from public.plateforme_operations_remise where id=p_operation_id for update;
  if not found then raise exception 'Opération introuvable'; end if;
  perform public.plateforme_verifier_verrou_remise_serveur(v_operation.stripe_subscription_id,p_verrou_token);
  if v_operation.statut in ('completed','failed_before_stripe','cancelled') then raise exception 'Opération terminée immuable'; end if;
  if p_numero_tentative is null or p_numero_tentative<>v_operation.nombre_tentatives or p_numero_tentative<1 then raise exception 'Tentative obsolète'; end if;
  if p_etat_observe is null or not (p_etat_observe ? 'coupon_id')
     or jsonb_typeof(p_etat_observe->'coupon_id') not in ('string','null') then raise exception 'État Stripe inconnu'; end if;
  if v_operation.preuve_serveur_id is not null
     and v_operation.preuve_numero_tentative=p_numero_tentative
     and v_operation.preuve_etat_observe=p_etat_observe then
    return public.plateforme_operation_remise_json(v_operation)||jsonb_build_object('preuve_serveur_id',v_operation.preuve_serveur_id);
  end if;
  v_conforme:=case when v_operation.type_operation='application'
    then v_operation.coupon_stripe_id is not null and p_etat_observe->>'coupon_id'=v_operation.coupon_stripe_id
    else p_etat_observe->>'coupon_id' is null end;
  v_preuve:=gen_random_uuid(); v_avant:=v_operation.statut;
  v_apres:=case when v_conforme then 'database_finalization_pending' else 'reconciliation_required' end;
  update public.plateforme_operations_remise set statut=v_apres,
    etat_observe_apres_stripe=p_etat_observe,preuve_serveur_id=v_preuve,
    preuve_intention_id=intention_id,preuve_stripe_subscription_id=stripe_subscription_id,
    preuve_numero_tentative=p_numero_tentative,preuve_etat_observe=p_etat_observe,
    preuve_observee_at=now(),empreinte_erreur=case when v_conforme then null else 'remise.etat_stripe_non_conforme' end,
    updated_at=now() where id=p_operation_id returning * into v_operation;
  insert into public.plateforme_operations_remise_historique(operation_id,statut_avant,statut_apres,auteur_utilisateur_id,etat_observe,empreinte_erreur)
  values(v_operation.id,v_avant,v_apres,v_operation.auteur_utilisateur_id,p_etat_observe,v_operation.empreinte_erreur);
  return public.plateforme_operation_remise_json(v_operation)||jsonb_build_object('preuve_serveur_id',v_preuve);
end;
$$;

create function public.plateforme_finaliser_operation_remise_serveur(
  p_operation_id uuid,p_verrou_token uuid,p_preuve_serveur_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_operation public.plateforme_operations_remise%rowtype; v_ancien public.entreprises%rowtype;
begin
  perform public.plateforme_exiger_traitement_remise_serveur();
  select * into v_operation from public.plateforme_operations_remise where id=p_operation_id for update;
  if not found then raise exception 'Opération introuvable'; end if;
  perform public.plateforme_verifier_verrou_remise_serveur(v_operation.stripe_subscription_id,p_verrou_token);
  if v_operation.statut='completed' and v_operation.preuve_serveur_id=p_preuve_serveur_id then return public.plateforme_operation_remise_json(v_operation); end if;
  if v_operation.statut<>'database_finalization_pending' then raise exception 'Checkpoint serveur conforme absent'; end if;
  if p_preuve_serveur_id is null or v_operation.preuve_serveur_id<>p_preuve_serveur_id
     or v_operation.preuve_intention_id<>v_operation.intention_id
     or v_operation.preuve_stripe_subscription_id<>v_operation.stripe_subscription_id
     or v_operation.preuve_numero_tentative<>v_operation.nombre_tentatives
     or v_operation.preuve_etat_observe is null then raise exception 'Preuve Stripe serveur invalide'; end if;
  if v_operation.type_operation='application' then
    if v_operation.coupon_stripe_id is null or v_operation.preuve_etat_observe->>'coupon_id' is distinct from v_operation.coupon_stripe_id then raise exception 'Remise Stripe non prouvée'; end if;
  elsif v_operation.preuve_etat_observe->>'coupon_id' is not null then raise exception 'Retrait Stripe non prouvé'; end if;
  select * into v_ancien from public.entreprises where id=v_operation.entreprise_id for update;
  if not found then raise exception 'Entreprise introuvable'; end if;
  if v_operation.type_operation='application' then
    update public.entreprises set remise_stripe_coupon_id=v_operation.coupon_stripe_id,
      remise_description=v_operation.etat_souhaite->>'description',remise_motif_interne=v_operation.etat_souhaite->>'motif_interne',
      remise_duree_mois=nullif(v_operation.etat_souhaite->>'duree_mois','')::integer,
      remise_type=v_operation.etat_souhaite->>'type',remise_valeur=(v_operation.etat_souhaite->>'valeur')::numeric,
      remise_cree_par=v_operation.auteur_utilisateur_id,remise_appliquee_at=now(),updated_at=now()
    where id=v_operation.entreprise_id;
    if v_ancien.remise_stripe_coupon_id is distinct from v_operation.coupon_stripe_id then
      insert into public.historique_tarification(entreprise_id,utilisateur_id,action,ancien,nouveau,motif)
      values(v_operation.entreprise_id,v_operation.auteur_utilisateur_id,'remise_appliquee',
        jsonb_build_object('remise_stripe_coupon_id',v_ancien.remise_stripe_coupon_id,'remise_description',v_ancien.remise_description),
        jsonb_build_object('remise_stripe_coupon_id',v_operation.coupon_stripe_id,'remise_description',v_operation.etat_souhaite->>'description','duree_mois',v_operation.etat_souhaite->>'duree_mois'),
        v_operation.etat_souhaite->>'motif_interne');
    end if;
  else
    update public.entreprises set remise_stripe_coupon_id=null,remise_description=null,remise_motif_interne=null,
      remise_duree_mois=null,remise_type=null,remise_valeur=null,remise_cree_par=null,remise_appliquee_at=null,updated_at=now()
    where id=v_operation.entreprise_id;
    if v_ancien.remise_stripe_coupon_id is not null or v_ancien.remise_description is not null then
      insert into public.historique_tarification(entreprise_id,utilisateur_id,action,ancien,nouveau,motif)
      values(v_operation.entreprise_id,v_operation.auteur_utilisateur_id,'remise_retiree',
        jsonb_build_object('remise_stripe_coupon_id',v_ancien.remise_stripe_coupon_id,'remise_description',v_ancien.remise_description),null,null);
    end if;
  end if;
  insert into public.plateforme_operations_remise_historique(operation_id,statut_avant,statut_apres,auteur_utilisateur_id,etat_observe)
  values(v_operation.id,v_operation.statut,'completed',v_operation.auteur_utilisateur_id,v_operation.preuve_etat_observe);
  update public.plateforme_operations_remise set statut='completed',finalized_at=now(),updated_at=now(),empreinte_erreur=null
  where id=v_operation.id returning * into v_operation;
  return public.plateforme_operation_remise_json(v_operation);
end;
$$;

-- Lecture et demande de reprise utilisateur : aucun état Stripe ni checkpoint fourni.
create or replace function public.plateforme_lire_operation_remise(p_operation_id uuid)
returns jsonb language plpgsql security definer stable set search_path=public as $$
declare v_operation public.plateforme_operations_remise%rowtype;
begin
  perform public.plateforme_exiger_role('total','facturation'); perform public.plateforme_exiger_session_aal2();
  select * into v_operation from public.plateforme_operations_remise where id=p_operation_id;
  if not found then raise exception 'Opération introuvable'; end if;
  return jsonb_build_object('id',v_operation.id,'type_operation',v_operation.type_operation,'statut',v_operation.statut,'created_at',v_operation.created_at,'updated_at',v_operation.updated_at);
end;
$$;

create function public.plateforme_demander_reprise_operation_remise(p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_operation public.plateforme_operations_remise%rowtype;
begin
  perform public.plateforme_exiger_role('total','facturation'); perform public.plateforme_exiger_session_aal2();
  select * into v_operation from public.plateforme_operations_remise where id=p_operation_id;
  if not found then raise exception 'Opération introuvable'; end if;
  return jsonb_build_object('id',v_operation.id,'statut',v_operation.statut);
end;
$$;

revoke all on function public.plateforme_exiger_traitement_remise_serveur() from public,anon,authenticated;
revoke all on function public.plateforme_verifier_verrou_remise_serveur(text,uuid) from public,anon,authenticated;
revoke all on function public.plateforme_acquerir_verrou_remise_serveur(text,text) from public,anon,authenticated;
revoke all on function public.plateforme_relacher_verrou_remise_serveur(text,uuid) from public,anon,authenticated;
revoke all on function public.plateforme_lire_operation_remise_serveur(uuid,uuid) from public,anon,authenticated;
revoke all on function public.plateforme_resoudre_abonnement_operation_remise_serveur(uuid) from public,anon,authenticated;
revoke all on function public.plateforme_lire_operation_active_remise_serveur(text,uuid) from public,anon,authenticated;
revoke all on function public.plateforme_transition_operation_remise_serveur(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.plateforme_enregistrer_coupon_operation_remise_serveur(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.plateforme_preparer_post_application_remise_serveur(uuid,uuid) from public,anon,authenticated;
revoke all on function public.plateforme_enregistrer_preuve_stripe_serveur(uuid,uuid,integer,jsonb) from public,anon,authenticated;
revoke all on function public.plateforme_finaliser_operation_remise_serveur(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.plateforme_demander_reprise_operation_remise(uuid) from public,anon;

grant execute on function public.plateforme_exiger_traitement_remise_serveur() to service_role;
grant execute on function public.plateforme_verifier_verrou_remise_serveur(text,uuid) to service_role;
grant execute on function public.plateforme_acquerir_verrou_remise_serveur(text,text) to service_role;
grant execute on function public.plateforme_relacher_verrou_remise_serveur(text,uuid) to service_role;
grant execute on function public.plateforme_lire_operation_remise_serveur(uuid,uuid) to service_role;
grant execute on function public.plateforme_resoudre_abonnement_operation_remise_serveur(uuid) to service_role;
grant execute on function public.plateforme_lire_operation_active_remise_serveur(text,uuid) to service_role;
grant execute on function public.plateforme_transition_operation_remise_serveur(uuid,uuid,text,text) to service_role;
grant execute on function public.plateforme_enregistrer_coupon_operation_remise_serveur(uuid,uuid,text) to service_role;
grant execute on function public.plateforme_preparer_post_application_remise_serveur(uuid,uuid) to service_role;
grant execute on function public.plateforme_enregistrer_preuve_stripe_serveur(uuid,uuid,integer,jsonb) to service_role;
grant execute on function public.plateforme_finaliser_operation_remise_serveur(uuid,uuid,uuid) to service_role;
grant execute on function public.plateforme_demander_reprise_operation_remise(uuid) to authenticated;

notify pgrst, 'reload schema';
