-- PROMO-V1 : administration traçable des conditions commerciales.
-- Cette migration ne modifie ni le catalogue public ni les prix Stripe.

create table if not exists public.promotions_commerciales (
  id uuid primary key default gen_random_uuid(),
  nom_interne text not null,
  type_remise text not null check (type_remise in ('pourcentage','montant')),
  valeur numeric(12,2) not null check (valeur > 0),
  duree text not null check (duree in ('once','repeating','forever')),
  duree_mois integer,
  date_debut date not null,
  date_fin date,
  offres text[] not null,
  entreprise_id uuid references public.entreprises(id) on delete restrict,
  justification text not null,
  statut text not null default 'brouillon' check (statut in ('brouillon','actif','expire','desactive')),
  est_pilote boolean not null default false,
  perimetre_remise text not null default 'abonnement_et_supplements_recurrents'
    check (perimetre_remise = 'abonnement_et_supplements_recurrents'),
  code_promotionnel text,
  limite_utilisations integer,
  stripe_coupon_id text,
  stripe_promotion_code_id text,
  cree_par uuid not null references auth.users(id) on delete restrict,
  modifie_par uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activee_at timestamptz,
  desactivee_at timestamptz,
  constraint promotions_valeur_coherente check (type_remise <> 'pourcentage' or valeur <= 100),
  constraint promotions_duree_coherente check (
    (duree = 'repeating' and duree_mois between 1 and 36)
    or (duree <> 'repeating' and duree_mois is null)
  ),
  constraint promotions_dates_coherentes check (date_fin is null or date_fin >= date_debut),
  constraint promotions_offres_non_vides check (cardinality(offres) > 0),
  constraint promotions_offres_autorisees check (offres <@ array['mini','pro','business','entreprise']::text[]),
  constraint promotions_justification check (length(btrim(justification)) >= 5),
  constraint promotions_code_format check (code_promotionnel is null or code_promotionnel ~ '^[A-Z0-9_-]{3,32}$'),
  constraint promotions_limite_positive check (limite_utilisations is null or limite_utilisations > 0),
  constraint promotions_cible_presente check (entreprise_id is not null or code_promotionnel is not null)
);

create unique index if not exists promotions_code_unique
  on public.promotions_commerciales(lower(code_promotionnel))
  where code_promotionnel is not null;
create index if not exists promotions_entreprise_idx on public.promotions_commerciales(entreprise_id, statut);
create index if not exists promotions_statut_dates_idx on public.promotions_commerciales(statut, date_debut, date_fin);

alter table public.promotions_commerciales enable row level security;
revoke all on table public.promotions_commerciales from public, anon, authenticated;
grant select on table public.promotions_commerciales to authenticated;

drop policy if exists promotions_commerciales_lecture_plateforme on public.promotions_commerciales;
create policy promotions_commerciales_lecture_plateforme on public.promotions_commerciales
  for select to authenticated using(
    public.plateforme_a_permission('consulter_facturation')
    or public.plateforme_a_permission('gerer_remises')
  );

create or replace function public.plateforme_promotions_lister()
returns table(
  id uuid, nom_interne text, type_remise text, valeur numeric, duree text,
  duree_mois integer, date_debut date, date_fin date, offres text[],
  entreprise_id uuid, entreprise_nom text, justification text, statut text,
  est_pilote boolean, perimetre_remise text, code_promotionnel text,
  limite_utilisations integer, stripe_coupon_id text,
  stripe_promotion_code_id text, cree_par_email text, created_at timestamptz,
  updated_at timestamptz
)
language plpgsql security definer stable set search_path=public as $$
begin
  if not public.plateforme_a_permission('consulter_facturation')
     and not public.plateforme_a_permission('gerer_remises') then
    raise exception 'Permission plateforme refusée' using errcode='42501';
  end if;
  return query
  select p.id,p.nom_interne,p.type_remise,p.valeur,p.duree,p.duree_mois,
    p.date_debut,p.date_fin,p.offres,p.entreprise_id,e.nom,p.justification,
    case when p.statut='actif' and p.date_fin is not null and p.date_fin<current_date then 'expire' else p.statut end,
    p.est_pilote,p.perimetre_remise,p.code_promotionnel,p.limite_utilisations,
    p.stripe_coupon_id,p.stripe_promotion_code_id,au.email::text,p.created_at,p.updated_at
  from public.promotions_commerciales p
  left join public.entreprises e on e.id=p.entreprise_id
  left join auth.users au on au.id=p.cree_par
  order by p.created_at desc;
end;
$$;

create or replace function public.plateforme_promotion_creer(
  p_nom_interne text,p_type_remise text,p_valeur numeric,p_duree text,
  p_duree_mois integer,p_date_debut date,p_date_fin date,p_offres text[],
  p_entreprise_id uuid,p_justification text,p_est_pilote boolean,
  p_code_promotionnel text,p_limite_utilisations integer
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_code text:=nullif(upper(btrim(coalesce(p_code_promotionnel,''))), '');
begin
  perform public.plateforme_exiger_permission('gerer_remises');
  insert into public.promotions_commerciales(
    nom_interne,type_remise,valeur,duree,duree_mois,date_debut,date_fin,offres,
    entreprise_id,justification,est_pilote,code_promotionnel,limite_utilisations,
    cree_par,modifie_par
  ) values(
    btrim(p_nom_interne),p_type_remise,p_valeur,p_duree,p_duree_mois,p_date_debut,
    p_date_fin,p_offres,p_entreprise_id,btrim(p_justification),coalesce(p_est_pilote,false),
    v_code,p_limite_utilisations,auth.uid(),auth.uid()
  ) returning id into v_id;
  perform public.plateforme_journaliser('promotion_creee','promotion',v_id::text,
    jsonb_build_object('type',p_type_remise,'valeur',p_valeur,'duree',p_duree,
      'offres',p_offres,'entreprise_id',p_entreprise_id,'est_pilote',coalesce(p_est_pilote,false)));
  return v_id;
end;
$$;

create or replace function public.plateforme_promotion_modifier(
  p_id uuid,p_nom_interne text,p_type_remise text,p_valeur numeric,p_duree text,
  p_duree_mois integer,p_date_debut date,p_date_fin date,p_offres text[],
  p_entreprise_id uuid,p_justification text,p_est_pilote boolean,
  p_code_promotionnel text,p_limite_utilisations integer
) returns void
language plpgsql security definer set search_path=public as $$
declare v_ancien jsonb;v_code text:=nullif(upper(btrim(coalesce(p_code_promotionnel,''))), '');
begin
  perform public.plateforme_exiger_permission('gerer_remises');
  select to_jsonb(p) into v_ancien from public.promotions_commerciales p where p.id=p_id for update;
  if v_ancien is null then raise exception 'Promotion introuvable'; end if;
  if v_ancien->>'statut' <> 'brouillon' then raise exception 'Seul un brouillon peut être modifié'; end if;
  update public.promotions_commerciales set
    nom_interne=btrim(p_nom_interne),type_remise=p_type_remise,valeur=p_valeur,
    duree=p_duree,duree_mois=p_duree_mois,date_debut=p_date_debut,date_fin=p_date_fin,
    offres=p_offres,entreprise_id=p_entreprise_id,justification=btrim(p_justification),
    est_pilote=coalesce(p_est_pilote,false),code_promotionnel=v_code,
    limite_utilisations=p_limite_utilisations,modifie_par=auth.uid(),updated_at=now()
  where id=p_id;
  perform public.plateforme_journaliser('promotion_modifiee','promotion',p_id::text,
    jsonb_build_object('ancien',v_ancien-'stripe_coupon_id'-'stripe_promotion_code_id',
      'nouveau',jsonb_build_object('type',p_type_remise,'valeur',p_valeur,'duree',p_duree,
      'offres',p_offres,'entreprise_id',p_entreprise_id,'est_pilote',coalesce(p_est_pilote,false))));
end;
$$;

create or replace function public.plateforme_promotion_preparer_activation(p_id uuid)
returns table(
  id uuid,nom_interne text,type_remise text,valeur numeric,duree text,duree_mois integer,
  date_debut date,date_fin date,offres text[],entreprise_id uuid,code_promotionnel text,
  limite_utilisations integer,stripe_subscription_id text
)
language plpgsql security definer set search_path=public as $$
begin
  perform public.plateforme_exiger_permission('gerer_remises');
  return query
  select p.id,p.nom_interne,p.type_remise,p.valeur,p.duree,p.duree_mois,p.date_debut,
    p.date_fin,p.offres,p.entreprise_id,p.code_promotionnel,p.limite_utilisations,
    e.stripe_subscription_id
  from public.promotions_commerciales p
  left join public.entreprises e on e.id=p.entreprise_id
  where p.id=p_id and p.statut='brouillon';
end;
$$;

create or replace function public.plateforme_promotion_confirmer_activation(
  p_id uuid,p_stripe_coupon_id text,p_stripe_promotion_code_id text default null
) returns void
language plpgsql security definer set search_path=public as $$
declare v_promotion public.promotions_commerciales%rowtype;
begin
  perform public.plateforme_exiger_permission('gerer_remises');
  select * into v_promotion from public.promotions_commerciales where id=p_id for update;
  if v_promotion.id is null or v_promotion.statut<>'brouillon' then raise exception 'Brouillon introuvable';end if;
  if v_promotion.date_fin is not null and v_promotion.date_fin<current_date then raise exception 'Une promotion expirée ne peut pas être activée';end if;
  if v_promotion.date_debut>current_date then raise exception 'La date de début n’est pas encore atteinte';end if;
  if v_promotion.entreprise_id is not null and exists(
    select 1 from public.promotions_commerciales p where p.entreprise_id=v_promotion.entreprise_id
      and p.statut='actif' and p.id<>p_id and(p.date_fin is null or p.date_fin>=current_date)
  ) then raise exception 'Une autre remise est déjà active pour cette entreprise';end if;
  if nullif(btrim(coalesce(p_stripe_coupon_id,'')),'') is null then raise exception 'Coupon Stripe Test obligatoire';end if;
  update public.promotions_commerciales set statut='actif',stripe_coupon_id=p_stripe_coupon_id,
    stripe_promotion_code_id=p_stripe_promotion_code_id,activee_at=now(),updated_at=now(),modifie_par=auth.uid()
  where id=p_id;
  if v_promotion.entreprise_id is not null then
    update public.entreprises set remise_stripe_coupon_id=p_stripe_coupon_id,
      remise_description=v_promotion.nom_interne,remise_appliquee_at=now(),updated_at=now()
    where id=v_promotion.entreprise_id;
  end if;
  perform public.plateforme_journaliser('promotion_activee','promotion',p_id::text,
    jsonb_build_object('entreprise_id',v_promotion.entreprise_id,'offres',v_promotion.offres,
      'code_promotionnel',v_promotion.code_promotionnel is not null));
end;
$$;

create or replace function public.plateforme_promotion_preparer_desactivation(p_id uuid)
returns table(stripe_subscription_id text,stripe_promotion_code_id text)
language plpgsql security definer stable set search_path=public as $$
begin
  perform public.plateforme_exiger_permission('gerer_remises');
  return query select e.stripe_subscription_id,p.stripe_promotion_code_id
  from public.promotions_commerciales p
  left join public.entreprises e on e.id=p.entreprise_id
  where p.id=p_id and p.statut='actif';
end;
$$;

create or replace function public.plateforme_promotion_confirmer_desactivation(p_id uuid)
returns void
language plpgsql security definer set search_path=public as $$
declare v_promotion public.promotions_commerciales%rowtype;
begin
  perform public.plateforme_exiger_permission('gerer_remises');
  select * into v_promotion from public.promotions_commerciales where id=p_id for update;
  if v_promotion.id is null or v_promotion.statut<>'actif' then raise exception 'Promotion active introuvable';end if;
  if v_promotion.entreprise_id is not null then
    update public.entreprises set remise_stripe_coupon_id=null,remise_description=null,
      remise_appliquee_at=null,updated_at=now() where id=v_promotion.entreprise_id;
  end if;
  update public.promotions_commerciales set statut='desactive',desactivee_at=now(),
    updated_at=now(),modifie_par=auth.uid() where id=p_id;
  perform public.plateforme_journaliser('promotion_desactivee','promotion',p_id::text,
    jsonb_build_object('entreprise_id',v_promotion.entreprise_id));
end;
$$;

revoke all on function public.plateforme_promotions_lister() from public,anon;
revoke all on function public.plateforme_promotion_creer(text,text,numeric,text,integer,date,date,text[],uuid,text,boolean,text,integer) from public,anon;
revoke all on function public.plateforme_promotion_modifier(uuid,text,text,numeric,text,integer,date,date,text[],uuid,text,boolean,text,integer) from public,anon;
revoke all on function public.plateforme_promotion_preparer_activation(uuid) from public,anon;
revoke all on function public.plateforme_promotion_confirmer_activation(uuid,text,text) from public,anon;
revoke all on function public.plateforme_promotion_preparer_desactivation(uuid) from public,anon;
revoke all on function public.plateforme_promotion_confirmer_desactivation(uuid) from public,anon;

grant execute on function public.plateforme_promotions_lister() to authenticated;
grant execute on function public.plateforme_promotion_creer(text,text,numeric,text,integer,date,date,text[],uuid,text,boolean,text,integer) to authenticated;
grant execute on function public.plateforme_promotion_modifier(uuid,text,text,numeric,text,integer,date,date,text[],uuid,text,boolean,text,integer) to authenticated;
grant execute on function public.plateforme_promotion_preparer_activation(uuid) to authenticated;
grant execute on function public.plateforme_promotion_confirmer_activation(uuid,text,text) to authenticated;
grant execute on function public.plateforme_promotion_preparer_desactivation(uuid) to authenticated;
grant execute on function public.plateforme_promotion_confirmer_desactivation(uuid) to authenticated;

notify pgrst,'reload schema';
