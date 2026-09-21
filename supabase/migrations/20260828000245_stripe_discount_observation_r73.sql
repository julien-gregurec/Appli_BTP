-- ADMIN-GLOBAL-V1-R7.3 : l'attestation porte désormais une observation Stripe
-- non-lossy (présence, cardinalité, identité Discount et identité de source).
-- Les objets R7.2 restent intacts ; cette migration append-only remplace
-- uniquement la canonicalisation et le finaliseur par leur contrat v2.

-- Canonicalisation fixe, versionnée et sans dépendance à l'ordre des clés JSON.
-- Les valeurs libres sont absentes du format ; les identifiants Stripe sont
-- validés avant cet appel. Le caractère '~' représente exclusivement NULL.
create or replace function stripe_attestation.canonical_payload(p_payload jsonb)
returns text language sql immutable strict set search_path=pg_catalog as $$
  select concat_ws(E'\n',
    'elsatia.stripe-state-attestation.v2',
    'key_id='||coalesce(p_payload->>'key_id','~'),
    'environment='||coalesce(p_payload->>'environment','~'),
    'action='||coalesce(p_payload->>'action','~'),
    'operation_id='||coalesce(p_payload->>'operation_id','~'),
    'intention_id='||coalesce(p_payload->>'intention_id','~'),
    'entreprise_id='||coalesce(p_payload->>'entreprise_id','~'),
    'abonnement_entreprise_id='||coalesce(p_payload->>'abonnement_entreprise_id','~'),
    'stripe_subscription_id='||coalesce(p_payload->>'stripe_subscription_id','~'),
    'stripe_customer_id='||coalesce(p_payload->>'stripe_customer_id','~'),
    'tentative='||coalesce(p_payload->>'tentative','~'),
    'generation='||coalesce(p_payload->>'generation','~'),
    'discount_presence='||coalesce(p_payload->>'discount_presence','~'),
    'discount_count='||coalesce(p_payload->>'discount_count','~'),
    'discount_id='||coalesce(p_payload->>'discount_id','~'),
    'discount_source_type='||coalesce(p_payload->>'discount_source_type','~'),
    'discount_source_id='||coalesce(p_payload->>'discount_source_id','~'),
    'coupon_id='||coalesce(p_payload->>'coupon_id','~'),
    'discount_type='||coalesce(p_payload->>'discount_type','~'),
    'discount_value='||coalesce(p_payload->>'discount_value','~'),
    'discount_duration='||coalesce(p_payload->>'discount_duration','~'),
    'discount_duration_months='||coalesce(p_payload->>'discount_duration_months','~'),
    'observed_at='||coalesce(p_payload->>'observed_at','~'),
    'expires_at='||coalesce(p_payload->>'expires_at','~'),
    'jti='||coalesce(p_payload->>'jti','~')
  )
$$;

revoke all on function stripe_attestation.canonical_payload(jsonb) from public,anon,authenticated,service_role;

-- Neutralise définitivement le chemin R7.1 forgeable. Les fonctions restent
-- présentes pour la traçabilité des migrations, mais aucun rôle API ne peut les
-- invoquer via PostgREST.
revoke all on function public.plateforme_enregistrer_preuve_stripe_serveur(uuid,uuid,integer,jsonb)
  from public,anon,authenticated,service_role;
revoke all on function public.plateforme_finaliser_operation_remise_serveur(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;

-- Le schéma pgsodium n'est pas dans db.schemas/exposed_schemas et ne constitue
-- donc aucune surface RPC PostgREST. Supabase réserve par ailleurs ses fonctions
-- de génération de clés à pgsodium_keymaker ; la migration applicative ne change
-- pas les ACL de l'extension, possédée par supabase_admin.
grant usage on schema stripe_attestation,pgsodium to elsatia_discount_f4_writer;
grant select on stripe_attestation.configuration,stripe_attestation.public_keys,
  stripe_attestation.consumed_attestations to elsatia_discount_f4_writer;
grant insert on stripe_attestation.consumed_attestations to elsatia_discount_f4_writer;
grant execute on function stripe_attestation.canonical_payload(jsonb) to elsatia_discount_f4_writer;

create or replace function public.plateforme_finaliser_operation_remise_attestee_serveur(
  p_operation_id uuid,
  p_verrou_token uuid,
  p_attestation jsonb,
  p_signature text
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  v_operation public.plateforme_operations_remise%rowtype;
  v_ancien public.entreprises%rowtype;
  v_apres public.entreprises%rowtype;
  v_key stripe_attestation.public_keys%rowtype;
  v_environment text;
  v_action text;
  v_jti uuid;
  v_observed_at timestamptz;
  v_expires_at timestamptz;
  v_signature bytea;
  v_canonical text;
  v_keys integer;
begin
  perform public.plateforme_exiger_traitement_remise_serveur();
  if p_attestation is null or jsonb_typeof(p_attestation)<>'object' or p_signature is null then
    raise exception 'Attestation Stripe absente';
  end if;
  select count(*) into v_keys from jsonb_object_keys(p_attestation);
  if v_keys<>25 or not (
    p_attestation ?& array[
      'version','key_id','environment','action','operation_id','intention_id',
      'entreprise_id','abonnement_entreprise_id','stripe_subscription_id',
      'stripe_customer_id','tentative','generation','coupon_id','discount_type',
      'discount_presence','discount_count','discount_id','discount_source_type',
      'discount_source_id',
      'discount_value','discount_duration','discount_duration_months','observed_at',
      'expires_at','jti'
    ]
  ) then raise exception 'Payload d''attestation Stripe incomplet'; end if;
  if p_attestation->>'version'<>'2' then raise exception 'Version d''attestation Stripe invalide'; end if;

  begin
    v_jti := (p_attestation->>'jti')::uuid;
    v_observed_at := (p_attestation->>'observed_at')::timestamptz;
    v_expires_at := (p_attestation->>'expires_at')::timestamptz;
    v_signature := decode(p_signature,'base64');
  exception when others then
    raise exception 'Encodage d''attestation Stripe invalide';
  end;
  if octet_length(v_signature)<>64 then raise exception 'Signature Stripe invalide'; end if;

  select * into v_operation from public.plateforme_operations_remise
  where id=p_operation_id for update;
  if not found then raise exception 'Opération introuvable'; end if;
  perform public.plateforme_verifier_verrou_remise_serveur(
    v_operation.stripe_subscription_id,p_verrou_token
  );

  -- Le replay exact d'une réponse HTTP perdue reste strictement idempotent,
  -- même après expiration : aucune seconde écriture ni aucun nouvel historique.
  if v_operation.statut='completed'
     and v_operation.preuve_attestation_jti=v_jti
     and v_operation.preuve_attestation_payload=p_attestation
     and v_operation.preuve_attestation_signature=p_signature then
    return public.plateforme_operation_remise_json(v_operation);
  end if;

  if v_operation.statut not in ('stripe_applied','stripe_removed') then
    raise exception 'État Stripe attestable absent';
  end if;
  select * into v_ancien from public.entreprises
  where id=v_operation.entreprise_id for update;
  if not found or v_ancien.stripe_subscription_id is distinct from v_operation.stripe_subscription_id then
    raise exception 'Cible entreprise/abonnement incohérente';
  end if;

  select environment into v_environment from stripe_attestation.configuration where singleton;
  if not found or p_attestation->>'environment' is distinct from v_environment then
    raise exception 'Environnement d''attestation Stripe invalide';
  end if;
  if v_observed_at>clock_timestamp()+interval '10 seconds'
     or v_expires_at<=clock_timestamp()
     or v_expires_at>v_observed_at+interval '120 seconds'
     or v_expires_at<v_observed_at then
    raise exception 'Attestation Stripe expirée ou datation invalide';
  end if;

  v_action := case
    when v_operation.type_operation='application' then 'APPLY'
    when v_operation.etat_souhaite->>'mode'='expiration_stripe' then 'EXPIRATION_SYNC'
    else 'REMOVE'
  end;
  if p_attestation->>'action' is distinct from v_action then
    raise exception 'Action d''attestation Stripe invalide';
  end if;
  if p_attestation->>'operation_id' is distinct from v_operation.id::text
     or p_attestation->>'intention_id' is distinct from v_operation.intention_id::text
     or p_attestation->>'entreprise_id' is distinct from v_operation.entreprise_id::text
     or p_attestation->>'abonnement_entreprise_id' is distinct from v_operation.abonnement_entreprise_id::text
     or p_attestation->>'stripe_subscription_id' is distinct from v_operation.stripe_subscription_id
     or p_attestation->>'stripe_customer_id' is distinct from v_ancien.stripe_customer_id
     or p_attestation->>'tentative' is distinct from v_operation.nombre_tentatives::text
     or p_attestation->>'generation' is distinct from v_operation.numero_posts_application::text then
    raise exception 'Attestation Stripe liée à une autre saga';
  end if;
  if coalesce(p_attestation->>'key_id','') !~ '^[a-z0-9_.:-]{1,64}$'
     or coalesce(p_attestation->>'stripe_subscription_id','') !~ '^sub_[A-Za-z0-9_]{1,120}$'
     or coalesce(p_attestation->>'stripe_customer_id','') !~ '^cus_[A-Za-z0-9_]{1,120}$'
     or (p_attestation->>'coupon_id' is not null
       and p_attestation->>'coupon_id' !~ '^[A-Za-z0-9_:-]{1,128}$') then
    raise exception 'Identifiant Stripe attesté invalide';
  end if;

  -- Une absence est un état positif et exhaustif, jamais le résultat par défaut
  -- d'un objet Discount impossible à interpréter. Toute présence porte les
  -- identités Stripe brutes utilisées pour décider et finaliser.
  if jsonb_typeof(p_attestation->'discount_count')<>'number' then
    raise exception 'Cardinalité Stripe attestée invalide';
  end if;
  if p_attestation->>'discount_presence'='absent' then
    if p_attestation->>'discount_count'<>'0'
       or p_attestation->>'discount_id' is not null
       or p_attestation->>'discount_source_type' is not null
       or p_attestation->>'discount_source_id' is not null
       or p_attestation->>'coupon_id' is not null then
      raise exception 'Absence Stripe attestée incohérente';
    end if;
  elsif p_attestation->>'discount_presence'='present' then
    if p_attestation->>'discount_count'<>'1'
       or coalesce(p_attestation->>'discount_id','') !~ '^di_[A-Za-z0-9_:-]{1,125}$'
       or p_attestation->>'discount_source_type' not in ('coupon','promotion_code')
       or coalesce(p_attestation->>'discount_source_id','') !~ '^[A-Za-z0-9_:-]{1,128}$'
       or coalesce(p_attestation->>'coupon_id','') !~ '^[A-Za-z0-9_:-]{1,128}$'
       or (p_attestation->>'discount_source_type'='coupon'
         and p_attestation->>'discount_source_id' is distinct from p_attestation->>'coupon_id')
       or (p_attestation->>'discount_source_type'='promotion_code'
         and p_attestation->>'discount_source_id' !~ '^promo_[A-Za-z0-9_:-]{1,122}$') then
      raise exception 'Présence Stripe attestée incohérente';
    end if;
  else
    raise exception 'Présence Stripe attestée invalide';
  end if;

  if v_operation.type_operation='application' then
    if p_attestation->>'discount_presence'<>'present'
       or p_attestation->>'discount_count'<>'1'
       or v_operation.coupon_stripe_id is null
       or p_attestation->>'coupon_id' is distinct from v_operation.coupon_stripe_id
       or p_attestation->>'discount_type' is distinct from v_operation.etat_souhaite->>'type'
       or p_attestation->>'discount_value' is distinct from v_operation.etat_souhaite->>'valeur'
       or p_attestation->>'discount_duration' is distinct from v_operation.etat_souhaite->>'duree'
       or p_attestation->>'discount_duration_months' is distinct from v_operation.etat_souhaite->>'duree_mois' then
      raise exception 'Remise Stripe attestée incohérente';
    end if;
  elsif p_attestation->>'discount_presence'<>'absent'
     or p_attestation->>'discount_count'<>'0'
     or p_attestation->>'discount_id' is not null
     or p_attestation->>'discount_source_type' is not null
     or p_attestation->>'discount_source_id' is not null
     or p_attestation->>'coupon_id' is not null
     or p_attestation->>'discount_type' is not null
     or p_attestation->>'discount_value' is not null
     or p_attestation->>'discount_duration' is not null
     or p_attestation->>'discount_duration_months' is not null then
    raise exception 'Retrait Stripe attesté incohérent';
  end if;

  select * into v_key from stripe_attestation.public_keys
  where key_id=p_attestation->>'key_id'
    and environment=v_environment
    and active_from<=v_observed_at
    and (active_until is null or active_until>v_observed_at)
    and revoked_at is null;
  if not found then raise exception 'Clé publique d''attestation Stripe inconnue'; end if;
  v_canonical := stripe_attestation.canonical_payload(p_attestation);
  if not pgsodium.crypto_sign_verify_detached(
    v_signature,convert_to(v_canonical,'UTF8'),v_key.public_key
  ) then raise exception 'Signature Stripe invalide'; end if;

  if exists(select 1 from stripe_attestation.consumed_attestations where jti=v_jti) then
    raise exception 'Attestation Stripe déjà consommée';
  end if;
  insert into stripe_attestation.consumed_attestations(jti,operation_id,key_id,signature)
  values(v_jti,v_operation.id,v_key.key_id,v_signature);

  update public.plateforme_operations_remise set
    statut='database_finalization_pending',
    etat_observe_apres_stripe=jsonb_build_object(
      'status',p_attestation->>'discount_presence',
      'count',(p_attestation->>'discount_count')::integer,
      'discount_id',p_attestation->>'discount_id',
      'source_type',p_attestation->>'discount_source_type',
      'source_id',p_attestation->>'discount_source_id',
      'coupon_id',p_attestation->>'coupon_id'
    ),
    preuve_serveur_id=v_jti,preuve_intention_id=intention_id,
    preuve_stripe_subscription_id=stripe_subscription_id,
    preuve_numero_tentative=nombre_tentatives,
    preuve_etat_observe=jsonb_build_object(
      'status',p_attestation->>'discount_presence',
      'count',(p_attestation->>'discount_count')::integer,
      'discount_id',p_attestation->>'discount_id',
      'source_type',p_attestation->>'discount_source_type',
      'source_id',p_attestation->>'discount_source_id',
      'coupon_id',p_attestation->>'coupon_id'
    ),
    preuve_observee_at=v_observed_at,
    preuve_attestation_payload=p_attestation,
    preuve_attestation_signature=p_signature,
    preuve_attestation_jti=v_jti,
    preuve_attestation_key_id=v_key.key_id,
    preuve_attestation_environment=v_environment,
    preuve_attestation_action=v_action,
    preuve_attestation_expire_at=v_expires_at,
    empreinte_erreur=null,updated_at=now()
  where id=v_operation.id returning * into v_operation;
  insert into public.plateforme_operations_remise_historique(
    operation_id,statut_avant,statut_apres,auteur_utilisateur_id,etat_observe
  ) values(
    v_operation.id,case when v_action='APPLY' then 'stripe_applied' else 'stripe_removed' end,
    'database_finalization_pending',v_operation.auteur_utilisateur_id,
    v_operation.preuve_etat_observe
  );

  if v_operation.type_operation='application' then
    update public.entreprises set
      remise_stripe_coupon_id=v_operation.coupon_stripe_id,
      remise_description=v_operation.etat_souhaite->>'description',
      remise_motif_interne=v_operation.etat_souhaite->>'motif_interne',
      remise_duree_mois=nullif(v_operation.etat_souhaite->>'duree_mois','')::integer,
      remise_type=v_operation.etat_souhaite->>'type',
      remise_valeur=(v_operation.etat_souhaite->>'valeur')::numeric,
      remise_cree_par=v_operation.auteur_utilisateur_id,
      remise_appliquee_at=now(),updated_at=now()
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
    update public.entreprises set remise_stripe_coupon_id=null,remise_description=null,
      remise_motif_interne=null,remise_duree_mois=null,remise_type=null,
      remise_valeur=null,remise_cree_par=null,remise_appliquee_at=null,updated_at=now()
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
        case when v_action='EXPIRATION_SYNC' then 'remise_expiree' else 'remise_retiree' end,
        jsonb_build_object('remise_stripe_coupon_id',v_ancien.remise_stripe_coupon_id,'remise_description',v_ancien.remise_description),null,null);
    end if;
  end if;

  -- Completed est la toute dernière écriture, après mutation, relecture et audit.
  insert into public.plateforme_operations_remise_historique(
    operation_id,statut_avant,statut_apres,auteur_utilisateur_id,etat_observe
  ) values(v_operation.id,'database_finalization_pending','completed',
    v_operation.auteur_utilisateur_id,v_operation.preuve_etat_observe);
  update public.plateforme_operations_remise set
    statut='completed',finalized_at=now(),updated_at=now(),empreinte_erreur=null
  where id=v_operation.id returning * into v_operation;
  return public.plateforme_operation_remise_json(v_operation);
end;
$$;

revoke all on function public.plateforme_finaliser_operation_remise_attestee_serveur(uuid,uuid,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.plateforme_finaliser_operation_remise_attestee_serveur(uuid,uuid,jsonb,text)
  to service_role;
select set_config(
  'r73.had_f4_membership',
  pg_has_role(current_user,'elsatia_discount_f4_writer','MEMBER')::text,
  true
);
do $$ begin execute format('grant elsatia_discount_f4_writer to %I',current_user); end $$;
grant create on schema public to elsatia_discount_f4_writer;
alter function public.plateforme_finaliser_operation_remise_attestee_serveur(uuid,uuid,jsonb,text)
  owner to elsatia_discount_f4_writer;
revoke create on schema public from elsatia_discount_f4_writer;
do $$
begin
  if current_setting('r73.had_f4_membership')='false' then
    execute format('revoke elsatia_discount_f4_writer from %I',current_user);
  end if;
end;
$$;

-- Le serveur doit pouvoir signer aussi l'identité de l'abonnement SQL.
create or replace function public.plateforme_operation_remise_json(
  p_operation public.plateforme_operations_remise
) returns jsonb language sql stable set search_path=public as $$
  select jsonb_build_object(
    'id',p_operation.id,'intention_id',p_operation.intention_id,
    'entreprise_id',p_operation.entreprise_id,
    'abonnement_entreprise_id',p_operation.abonnement_entreprise_id,
    'stripe_subscription_id',p_operation.stripe_subscription_id,
    'type_operation',p_operation.type_operation,'etat_souhaite',p_operation.etat_souhaite,
    'etat_observe_avant',p_operation.etat_observe_avant,
    'etat_observe_apres_stripe',p_operation.etat_observe_apres_stripe,
    'statut',p_operation.statut,'coupon_stripe_id',p_operation.coupon_stripe_id,
    'cle_idempotence_coupon',p_operation.cle_idempotence_coupon,
    'cle_idempotence_application',p_operation.cle_idempotence_application,
    'numero_posts_application',p_operation.numero_posts_application,
    'nombre_tentatives',p_operation.nombre_tentatives
  )
$$;

revoke all on function public.plateforme_operation_remise_json(public.plateforme_operations_remise)
  from public,anon;
grant execute on function public.plateforme_operation_remise_json(public.plateforme_operations_remise)
  to authenticated,service_role,elsatia_discount_f4_writer;

notify pgrst, 'reload schema';
