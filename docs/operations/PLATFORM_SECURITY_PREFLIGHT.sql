-- Préflight ELSATIA plateforme — lecture seule, sans secret.
-- À exécuter avant les migrations multi-app 234 à 238 sur Preview/Production.
-- Toute ligne `bloquant = true` avec `anomalies > 0` interdit la migration distante.

begin transaction read only;

do $$
declare
  v_count bigint;
  v_has_uid boolean;
  v_has_actif boolean;
  v_has_statut boolean;
  v_resultats jsonb := '[]'::jsonb;
  v_ligne jsonb;
begin
  -- Historique dont le code application empêcherait la future FK.
  if to_regclass('public.historique_acces_applications') is not null
     and to_regclass('public.applications_elsatia') is not null then
    execute $q$
      select count(*)
      from public.historique_acces_applications h
      left join public.applications_elsatia a on a.code=h.application_code
      where a.code is null
    $q$ into v_count;
  else
    v_count := 0;
  end if;
  v_resultats := v_resultats || jsonb_build_array(jsonb_build_object(
    'controle','applications_historique_inconnues','anomalies',v_count,'bloquant',true,
    'detail','Codes absents du catalogue; corriger avant la FK de la migration 236.'
  ));

  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='plateforme_admins' and column_name='utilisateur_id'
  ) into v_has_uid;
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='plateforme_admins' and column_name='actif'
  ) into v_has_actif;
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='plateforme_admins' and column_name='statut_identite'
  ) into v_has_statut;

  if v_has_uid and v_has_actif then
    execute 'select count(*) from public.plateforme_admins where actif and utilisateur_id is null'
      into v_count;
    v_resultats := v_resultats || jsonb_build_array(jsonb_build_object(
      'controle','administrateurs_actifs_sans_uid','anomalies',v_count,'bloquant',true,
      'detail','Aucun administrateur actif ne peut rester sans UID canonique.'
    ));

    execute $q$
      select count(*) from (
        select utilisateur_id from public.plateforme_admins
        where utilisateur_id is not null
        group by utilisateur_id having count(*)>1
      ) d
    $q$ into v_count;
    v_resultats := v_resultats || jsonb_build_array(jsonb_build_object(
      'controle','uid_administrateurs_dupliques','anomalies',v_count,'bloquant',true,
      'detail','Un UID Auth ne peut correspondre qu''à une identité plateforme.'
    ));
  else
    v_resultats := v_resultats || jsonb_build_array(
      jsonb_build_object(
        'controle','administrateurs_actifs_sans_uid','anomalies',0,'bloquant',false,
        'detail','Colonnes UID/actif pas encore installées.'
      ),
      jsonb_build_object(
        'controle','uid_administrateurs_dupliques','anomalies',0,'bloquant',false,
        'detail','Colonne UID pas encore installée.'
      )
    );
  end if;

  if v_has_statut then
    execute $q$
      select count(*) from public.plateforme_admins
      where not (
        (statut_identite='en_attente' and utilisateur_id is null and not actif)
        or (statut_identite='rattachee_non_confirmee' and utilisateur_id is not null and not actif)
        or (statut_identite='active' and utilisateur_id is not null and actif and activation_at is not null)
        or (statut_identite='revoquee' and not actif)
      )
    $q$ into v_count;
    v_resultats := v_resultats || jsonb_build_array(jsonb_build_object(
      'controle','administrateurs_etat_incoherent','anomalies',v_count,'bloquant',true,
      'detail','État, UID, actif et dates doivent suivre le cycle administrateur.'
    ));

    execute $q$
      select case when exists(
        select 1 from public.plateforme_admins
        where role='total' and actif and statut_identite='active'
      ) then 0 else 1 end
    $q$ into v_count;
  elsif v_has_actif then
    execute $q$
      select case when exists(
        select 1 from public.plateforme_admins where role='total' and actif
      ) then 0 else 1 end
    $q$ into v_count;
  else
    execute $q$
      select case when exists(
        select 1 from public.plateforme_admins where role='total'
      ) then 0 else 1 end
    $q$ into v_count;
  end if;
  v_resultats := v_resultats || jsonb_build_array(jsonb_build_object(
    'controle','administrateur_total_actif_absent','anomalies',v_count,'bloquant',true,
    'detail','Une procédure de récupération contrôlée est obligatoire avant migration.'
  ));

  if to_regclass('public.plateforme_acces_entreprises') is not null then
    execute $q$
      select count(*)
      from public.plateforme_acces_entreprises s
      left join public.utilisateurs u on u.id=s.plateforme_user_id
      where u.id is null
    $q$ into v_count;
    v_resultats := v_resultats || jsonb_build_array(jsonb_build_object(
      'controle','historique_support_utilisateur_absent','anomalies',v_count,'bloquant',true,
      'detail','Une session support référence un utilisateur absent.'
    ));

    if v_has_uid and v_has_actif then
      if v_has_statut then
        execute $q$
          select count(*)
          from public.plateforme_acces_entreprises s
          left join public.plateforme_admins pa
            on pa.utilisateur_id=s.plateforme_user_id
           and pa.actif and pa.statut_identite='active'
          where s.termine_at is null and pa.utilisateur_id is null
        $q$ into v_count;
      else
        execute $q$
          select count(*)
          from public.plateforme_acces_entreprises s
          left join public.plateforme_admins pa
            on pa.utilisateur_id=s.plateforme_user_id and pa.actif
          where s.termine_at is null and pa.utilisateur_id is null
        $q$ into v_count;
      end if;
      v_resultats := v_resultats || jsonb_build_array(jsonb_build_object(
        'controle','sessions_support_ouvertes_sans_admin_actif','anomalies',v_count,
        'bloquant',true,
        'detail','Fermer toute session ouverte sans identité plateforme active.'
      ));
    end if;
  end if;

  -- R7.1 : intégrité de la frontière d'écriture des remises.
  select case when exists(
    select 1 from pg_roles
    where rolname='elsatia_discount_f4_writer' and not rolcanlogin and not rolbypassrls
  ) and not exists(
    select 1 from pg_auth_members m
    join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member
    where r.rolname='elsatia_discount_f4_writer' and u.rolname<>'postgres'
  ) then 0 else 1 end into v_count;
  v_resultats := v_resultats || jsonb_build_array(jsonb_build_object(
    'controle','role_interne_f4_invalide','anomalies',v_count,'bloquant',true,
    'detail','Le rôle F4 doit être NOLOGIN, NOBYPASSRLS et sans membre applicatif.'
  ));

  if to_regclass('public.entreprises') is not null then
    execute $q$
      select count(*) from public.entreprises
      where (remise_stripe_coupon_id is null) is distinct from
        (remise_description is null and remise_motif_interne is null
         and remise_duree_mois is null and remise_type is null and remise_valeur is null
         and remise_cree_par is null and remise_appliquee_at is null)
    $q$ into v_count;
    v_resultats := v_resultats || jsonb_build_array(jsonb_build_object(
      'controle','remises_etat_partiel','anomalies',v_count,'bloquant',true,
      'detail','Une remise doit être entièrement active ou entièrement absente.'
    ));

    select count(*) into v_count
    from information_schema.role_column_grants
    where table_schema='public' and table_name='entreprises'
      and grantee in ('anon','authenticated','service_role')
      and privilege_type in ('INSERT','UPDATE') and column_name in (
        'remise_stripe_coupon_id','remise_description','remise_motif_interne','remise_duree_mois',
        'remise_type','remise_valeur','remise_cree_par','remise_appliquee_at'
      );
    v_resultats := v_resultats || jsonb_build_array(jsonb_build_object(
      'controle','privileges_directs_colonnes_remise','anomalies',v_count,'bloquant',true,
      'detail','Aucun rôle API ne doit posséder INSERT/UPDATE sur une colonne de remise.'
    ));

    select case when exists(
      select 1 from pg_trigger t
      where t.tgrelid='public.entreprises'::regclass and t.tgname='proteger_colonnes_remise'
        and not t.tgisinternal
    ) then 0 else 1 end into v_count;
    v_resultats := v_resultats || jsonb_build_array(jsonb_build_object(
      'controle','trigger_remise_f4_absent','anomalies',v_count,'bloquant',true,
      'detail','Le trigger structurel R7.1 doit protéger INSERT et UPDATE.'
    ));
  end if;

  if to_regclass('public.plateforme_operations_remise') is not null then
    execute $q$
      select count(*) from public.entreprises e
      where e.remise_stripe_coupon_id is not null and not exists (
        select 1 from public.plateforme_operations_remise o
        where o.entreprise_id=e.id and o.statut='completed'
          and o.type_operation='application'
          and o.coupon_stripe_id=e.remise_stripe_coupon_id
          and o.preuve_serveur_id is not null
          and o.preuve_intention_id=o.intention_id
          and o.preuve_stripe_subscription_id=o.stripe_subscription_id
      )
    $q$ into v_count;
    v_resultats := v_resultats || jsonb_build_array(jsonb_build_object(
      'controle','remises_actives_sans_preuve_f4','anomalies',v_count,'bloquant',true,
      'detail','Toute remise active doit correspondre à une saga F4 completed et prouvée.'
    ));
  end if;

  select case when to_regprocedure('public.plateforme_finaliser_operation_remise_serveur(uuid,uuid,uuid)') is not null
    and (select pg_get_userbyid(proowner)='elsatia_discount_f4_writer'
         from pg_proc where oid='public.plateforme_finaliser_operation_remise_serveur(uuid,uuid,uuid)'::regprocedure)
    then 0 else 1 end into v_count;
  v_resultats := v_resultats || jsonb_build_array(jsonb_build_object(
    'controle','proprietaire_finaliseur_f4_invalide','anomalies',v_count,'bloquant',true,
    'detail','Le seul finaliseur F4 doit être détenu par le rôle interne dédié.'
  ));

  for v_ligne in
    select value
    from jsonb_array_elements(v_resultats)
    order by (value->>'bloquant')::boolean desc,value->>'controle'
  loop
    raise notice 'PREFLIGHT | % | anomalies=% | bloquant=% | %',
      v_ligne->>'controle',v_ligne->>'anomalies',v_ligne->>'bloquant',v_ligne->>'detail';
  end loop;
end;
$$;

rollback;
