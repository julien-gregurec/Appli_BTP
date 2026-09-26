-- ADMIN-GLOBAL-V1-R7.1 : les colonnes de remise ne sont modifiables que par
-- le finaliseur F4 après consommation d'une preuve Stripe serveur liée.

do $$
begin
  if not exists (select 1 from pg_roles where rolname='elsatia_discount_f4_writer') then
    create role elsatia_discount_f4_writer nologin noinherit nobypassrls;
  end if;
end;
$$;

revoke all on schema public from elsatia_discount_f4_writer;
grant usage on schema public to elsatia_discount_f4_writer;

-- Supprime la capacité structurelle d'écrire les colonnes sensibles via
-- PostgREST, tout en conservant les écritures légitimes sur les autres colonnes.
revoke insert,update on table public.entreprises from authenticated;
do $$
declare v_colonnes text;
begin
  select string_agg(format('%I',column_name),',' order by ordinal_position)
  into v_colonnes
  from information_schema.columns
  where table_schema='public' and table_name='entreprises'
    and column_name not in (
      'remise_stripe_coupon_id','remise_description','remise_motif_interne',
      'remise_duree_mois','remise_type','remise_valeur','remise_cree_par',
      'remise_appliquee_at'
    );
  execute format('grant insert (%s) on public.entreprises to authenticated',v_colonnes);
  execute format('grant update (%s) on public.entreprises to authenticated',v_colonnes);
end;
$$;

create or replace function public.proteger_colonnes_remise()
returns trigger language plpgsql security invoker set search_path=public as $$
declare v_touche boolean;
begin
  v_touche := case when tg_op='INSERT' then
    new.remise_stripe_coupon_id is not null or new.remise_description is not null
    or new.remise_motif_interne is not null or new.remise_duree_mois is not null
    or new.remise_type is not null or new.remise_valeur is not null
    or new.remise_cree_par is not null or new.remise_appliquee_at is not null
  else
    new.remise_stripe_coupon_id is distinct from old.remise_stripe_coupon_id
    or new.remise_description is distinct from old.remise_description
    or new.remise_motif_interne is distinct from old.remise_motif_interne
    or new.remise_duree_mois is distinct from old.remise_duree_mois
    or new.remise_type is distinct from old.remise_type
    or new.remise_valeur is distinct from old.remise_valeur
    or new.remise_cree_par is distinct from old.remise_cree_par
    or new.remise_appliquee_at is distinct from old.remise_appliquee_at
  end;
  if v_touche and current_user <> 'elsatia_discount_f4_writer' then
    raise exception using
      errcode='42501',
      message='Écriture directe des colonnes de remise interdite ; finaliseur F4 requis';
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_colonnes_remise on public.entreprises;
create trigger proteger_colonnes_remise
before insert or update on public.entreprises
for each row execute function public.proteger_colonnes_remise();

revoke all on function public.proteger_colonnes_remise() from public,anon,authenticated,service_role;

-- Accès minimaux du rôle interne. Les policies sont nominatives et le rôle ne
-- peut ni se connecter, ni contourner RLS, ni être assumé par un rôle API.
grant select,update on public.plateforme_operations_remise to elsatia_discount_f4_writer;
grant insert on public.plateforme_operations_remise_historique to elsatia_discount_f4_writer;
grant usage on sequence public.plateforme_operations_remise_historique_id_seq to elsatia_discount_f4_writer;
grant select on public.entreprises to elsatia_discount_f4_writer;
grant update (
  remise_stripe_coupon_id,remise_description,remise_motif_interne,
  remise_duree_mois,remise_type,remise_valeur,remise_cree_par,
  remise_appliquee_at,updated_at
) on public.entreprises to elsatia_discount_f4_writer;
grant insert on public.historique_tarification to elsatia_discount_f4_writer;
grant execute on function public.plateforme_exiger_traitement_remise_serveur() to elsatia_discount_f4_writer;
grant execute on function public.plateforme_verifier_verrou_remise_serveur(text,uuid) to elsatia_discount_f4_writer;
grant execute on function public.plateforme_operation_remise_json(public.plateforme_operations_remise) to elsatia_discount_f4_writer;

create policy discount_f4_operations_select on public.plateforme_operations_remise
for select to elsatia_discount_f4_writer using (true);
create policy discount_f4_operations_update on public.plateforme_operations_remise
for update to elsatia_discount_f4_writer using (true) with check (true);
create policy discount_f4_history_insert on public.plateforme_operations_remise_historique
for insert to elsatia_discount_f4_writer with check (true);
create policy discount_f4_entreprises_select on public.entreprises
for select to elsatia_discount_f4_writer using (true);
create policy discount_f4_entreprises_update on public.entreprises
for update to elsatia_discount_f4_writer using (true) with check (true);
create policy discount_f4_tarification_insert on public.historique_tarification
for insert to elsatia_discount_f4_writer with check (true);

create or replace function public.plateforme_finaliser_operation_remise_serveur(
  p_operation_id uuid,p_verrou_token uuid,p_preuve_serveur_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_operation public.plateforme_operations_remise%rowtype;
  v_ancien public.entreprises%rowtype;
  v_apres public.entreprises%rowtype;
begin
  perform public.plateforme_exiger_traitement_remise_serveur();
  select * into v_operation from public.plateforme_operations_remise where id=p_operation_id for update;
  if not found then raise exception 'Opération introuvable'; end if;
  perform public.plateforme_verifier_verrou_remise_serveur(v_operation.stripe_subscription_id,p_verrou_token);
  if v_operation.statut='completed' and v_operation.preuve_serveur_id=p_preuve_serveur_id then
    return public.plateforme_operation_remise_json(v_operation);
  end if;
  if v_operation.statut<>'database_finalization_pending' then raise exception 'Checkpoint serveur conforme absent'; end if;
  if p_preuve_serveur_id is null or v_operation.preuve_serveur_id<>p_preuve_serveur_id
     or v_operation.preuve_intention_id<>v_operation.intention_id
     or v_operation.preuve_stripe_subscription_id<>v_operation.stripe_subscription_id
     or v_operation.preuve_numero_tentative<>v_operation.nombre_tentatives
     or v_operation.preuve_etat_observe is null then raise exception 'Preuve Stripe serveur invalide'; end if;
  if v_operation.type_operation='application' then
    if v_operation.coupon_stripe_id is null
       or v_operation.preuve_etat_observe->>'coupon_id' is distinct from v_operation.coupon_stripe_id then
      raise exception 'Remise Stripe non prouvée';
    end if;
  elsif v_operation.preuve_etat_observe->>'coupon_id' is not null then
    raise exception 'Retrait Stripe non prouvé';
  end if;

  select * into v_ancien from public.entreprises where id=v_operation.entreprise_id for update;
  if not found or v_ancien.stripe_subscription_id is distinct from v_operation.stripe_subscription_id then
    raise exception 'Cible entreprise/abonnement incohérente';
  end if;
  if v_operation.type_operation='application' then
    update public.entreprises set remise_stripe_coupon_id=v_operation.coupon_stripe_id,
      remise_description=v_operation.etat_souhaite->>'description',remise_motif_interne=v_operation.etat_souhaite->>'motif_interne',
      remise_duree_mois=nullif(v_operation.etat_souhaite->>'duree_mois','')::integer,
      remise_type=v_operation.etat_souhaite->>'type',remise_valeur=(v_operation.etat_souhaite->>'valeur')::numeric,
      remise_cree_par=v_operation.auteur_utilisateur_id,remise_appliquee_at=now(),updated_at=now()
    where id=v_operation.entreprise_id returning * into v_apres;
    if v_apres.remise_stripe_coupon_id is distinct from v_operation.coupon_stripe_id
       or v_apres.remise_description is distinct from v_operation.etat_souhaite->>'description'
       or v_apres.remise_type is distinct from v_operation.etat_souhaite->>'type'
       or v_apres.remise_valeur is distinct from (v_operation.etat_souhaite->>'valeur')::numeric
       or v_apres.remise_cree_par is distinct from v_operation.auteur_utilisateur_id then
      raise exception 'Relecture SQL F4 non conforme';
    end if;
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
    where id=v_operation.entreprise_id returning * into v_apres;
    if v_apres.remise_stripe_coupon_id is not null or v_apres.remise_description is not null
       or v_apres.remise_motif_interne is not null or v_apres.remise_duree_mois is not null
       or v_apres.remise_type is not null or v_apres.remise_valeur is not null
       or v_apres.remise_cree_par is not null or v_apres.remise_appliquee_at is not null then
      raise exception 'Relecture SQL F4 non conforme';
    end if;
    if v_ancien.remise_stripe_coupon_id is not null or v_ancien.remise_description is not null then
      insert into public.historique_tarification(entreprise_id,utilisateur_id,action,ancien,nouveau,motif)
      values(v_operation.entreprise_id,v_operation.auteur_utilisateur_id,
        case when v_operation.etat_souhaite->>'mode'='expiration_stripe' then 'remise_expiree' else 'remise_retiree' end,
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
grant create on schema public to elsatia_discount_f4_writer;
do $$ begin execute format('grant elsatia_discount_f4_writer to %I',current_user); end $$;
alter function public.plateforme_finaliser_operation_remise_serveur(uuid,uuid,uuid) owner to elsatia_discount_f4_writer;
revoke all on function public.plateforme_finaliser_operation_remise_serveur(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.plateforme_finaliser_operation_remise_serveur(uuid,uuid,uuid) to service_role;
revoke create on schema public from elsatia_discount_f4_writer;

-- Le webhook matérialise l'expiration Stripe comme une intention de retrait F4.
-- Cette RPC ne touche jamais aux colonnes de remise.
create function public.plateforme_commencer_expiration_remise_serveur(
  p_entreprise_id uuid,p_stripe_subscription_id text,p_verrou_token uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_entreprise public.entreprises%rowtype;
  v_operation public.plateforme_operations_remise%rowtype;
  v_intention uuid;
  v_abonnement_id uuid;
begin
  perform public.plateforme_exiger_traitement_remise_serveur();
  perform public.plateforme_verifier_verrou_remise_serveur(p_stripe_subscription_id,p_verrou_token);
  select * into v_entreprise from public.entreprises where id=p_entreprise_id for update;
  if not found or v_entreprise.stripe_subscription_id is distinct from p_stripe_subscription_id then
    raise exception 'Cible entreprise/abonnement incohérente';
  end if;
  if v_entreprise.remise_stripe_coupon_id is null then return null; end if;
  if v_entreprise.remise_cree_par is null then raise exception 'Auteur de remise absent ; reprise manuelle requise'; end if;
  v_intention := (
    substr(md5('expiration:'||p_entreprise_id::text||':'||p_stripe_subscription_id||':'||v_entreprise.remise_stripe_coupon_id||':'||coalesce(v_entreprise.remise_appliquee_at::text,'')),1,8)||'-'||
    substr(md5('expiration:'||p_entreprise_id::text||':'||p_stripe_subscription_id||':'||v_entreprise.remise_stripe_coupon_id||':'||coalesce(v_entreprise.remise_appliquee_at::text,'')),9,4)||'-4'||
    substr(md5('expiration:'||p_entreprise_id::text||':'||p_stripe_subscription_id||':'||v_entreprise.remise_stripe_coupon_id||':'||coalesce(v_entreprise.remise_appliquee_at::text,'')),14,3)||'-8'||
    substr(md5('expiration:'||p_entreprise_id::text||':'||p_stripe_subscription_id||':'||v_entreprise.remise_stripe_coupon_id||':'||coalesce(v_entreprise.remise_appliquee_at::text,'')),18,3)||'-'||
    substr(md5('expiration:'||p_entreprise_id::text||':'||p_stripe_subscription_id||':'||v_entreprise.remise_stripe_coupon_id||':'||coalesce(v_entreprise.remise_appliquee_at::text,'')),21,12)
  )::uuid;
  select * into v_operation from public.plateforme_operations_remise where intention_id=v_intention for update;
  if found then return public.plateforme_operation_remise_json(v_operation); end if;
  select * into v_operation from public.plateforme_operations_remise
  where stripe_subscription_id=p_stripe_subscription_id
    and statut not in ('completed','failed_before_stripe','cancelled') for update;
  if found then return public.plateforme_operation_remise_json(v_operation); end if;
  select id into v_abonnement_id from public.abonnements_entreprises
  where entreprise_id=p_entreprise_id and stripe_subscription_id=p_stripe_subscription_id;
  insert into public.plateforme_operations_remise(
    intention_id,entreprise_id,abonnement_entreprise_id,stripe_subscription_id,
    type_operation,etat_souhaite,auteur_utilisateur_id
  ) values (
    v_intention,p_entreprise_id,v_abonnement_id,p_stripe_subscription_id,
    'retrait','{"active":false,"mode":"expiration_stripe"}'::jsonb,v_entreprise.remise_cree_par
  ) returning * into v_operation;
  insert into public.plateforme_operations_remise_historique(operation_id,statut_avant,statut_apres,auteur_utilisateur_id)
  values(v_operation.id,null,'pending',v_operation.auteur_utilisateur_id);
  return public.plateforme_operation_remise_json(v_operation);
end;
$$;
revoke all on function public.plateforme_commencer_expiration_remise_serveur(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.plateforme_commencer_expiration_remise_serveur(uuid,text,uuid) to service_role;

notify pgrst, 'reload schema';
