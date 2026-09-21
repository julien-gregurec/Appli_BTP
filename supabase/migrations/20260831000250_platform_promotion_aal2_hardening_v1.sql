-- Durcissement AAL2 des RPC d'administration commerciale (promotions).
--
-- La migration 20260826000237 a imposé plateforme_exiger_session_aal2() à toutes
-- les mutations plateforme sensibles, mais les quatre RPC plateforme_promotion_*
-- de la migration 20260816000203 (déjà appliquée, non modifiée ici) étaient
-- restées sur le seul contrôle plateforme_exiger_permission('gerer_remises').
-- L'invariant testé par platform_aal2_role_integrity_v1 (« aucune mutation
-- plateforme exposée sans AAL2 ») les signalait donc encore.
--
-- Cette migration se contente de REDÉFINIR ces quatre fonctions à l'identique
-- (mêmes signatures, mêmes types de retour, même logique métier, mêmes effets)
-- en insérant l'appel à plateforme_exiger_session_aal2() immédiatement après le
-- contrôle de permission, à l'endroit cohérent avec les autres RPC plateforme.
-- Les RPC de lecture / préparation (plateforme_promotion_preparer_*) ne mutent
-- rien et restent volontairement inchangées.
--
-- Contraintes respectées :
--   * signatures, résultats et comportement métier strictement conservés ;
--   * seul ajout : perform public.plateforme_exiger_session_aal2() ;
--   * contrôle gerer_remises conservé ;
--   * aucun droit supplémentaire à public / anon (revoke réaffirmé) ;
--   * exécution réservée à authenticated, comme en 20260816000203.

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
  perform public.plateforme_exiger_session_aal2();
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
  perform public.plateforme_exiger_session_aal2();
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
create or replace function public.plateforme_promotion_confirmer_activation(
  p_id uuid,p_stripe_coupon_id text,p_stripe_promotion_code_id text default null
) returns void
language plpgsql security definer set search_path=public as $$
declare v_promotion public.promotions_commerciales%rowtype;
begin
  perform public.plateforme_exiger_permission('gerer_remises');
  perform public.plateforme_exiger_session_aal2();
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
create or replace function public.plateforme_promotion_confirmer_desactivation(p_id uuid)
returns void
language plpgsql security definer set search_path=public as $$
declare v_promotion public.promotions_commerciales%rowtype;
begin
  perform public.plateforme_exiger_permission('gerer_remises');
  perform public.plateforme_exiger_session_aal2();
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
-- Privilèges réaffirmés à l'identique de 20260816000203 : aucun droit nouveau,
-- public / anon explicitement exclus, exécution réservée à authenticated.
revoke all on function public.plateforme_promotion_creer(text,text,numeric,text,integer,date,date,text[],uuid,text,boolean,text,integer) from public,anon;
revoke all on function public.plateforme_promotion_modifier(uuid,text,text,numeric,text,integer,date,date,text[],uuid,text,boolean,text,integer) from public,anon;
revoke all on function public.plateforme_promotion_confirmer_activation(uuid,text,text) from public,anon;
revoke all on function public.plateforme_promotion_confirmer_desactivation(uuid) from public,anon;
grant execute on function public.plateforme_promotion_creer(text,text,numeric,text,integer,date,date,text[],uuid,text,boolean,text,integer) to authenticated;
grant execute on function public.plateforme_promotion_modifier(uuid,text,text,numeric,text,integer,date,date,text[],uuid,text,boolean,text,integer) to authenticated;
grant execute on function public.plateforme_promotion_confirmer_activation(uuid,text,text) to authenticated;
grant execute on function public.plateforme_promotion_confirmer_desactivation(uuid) to authenticated;
notify pgrst,'reload schema';
