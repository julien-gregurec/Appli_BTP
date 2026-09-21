-- ELSATIA Colors V1.1 — intégrité, traçabilité et durcissement des flux métier.
-- Migration append-only : complète 00246 sans modifier le socle multi-applications.

create extension if not exists pg_trgm with schema extensions;

alter table public.colors_parametres
  add column if not exists updated_by uuid references public.utilisateurs(id) on delete restrict;

alter table public.colors_seaux
  add column if not exists recherche_text text generated always as (
    lower(coalesce(marque,'') || ' ' || coalesce(produit,'') || ' ' ||
      coalesce(reference_produit,'') || ' ' || coalesce(teinte_nom,'') || ' ' ||
      coalesce(teinte_reference,'') || ' ' || coalesce(couleur_hex,'') || ' ' || coalesce(ral_approxime,''))
  ) stored;

drop index if exists public.colors_seaux_recherche_idx;
create index if not exists colors_seaux_recherche_trgm_idx
  on public.colors_seaux using gin (recherche_text extensions.gin_trgm_ops);

create or replace function public.colors_valider_emplacement()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_parent_entreprise uuid;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null and current_user <> 'postgres' then raise exception 'Utilisateur Colors requis'; end if;
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  elsif new.created_by is distinct from old.created_by or new.entreprise_id is distinct from old.entreprise_id then
    raise exception 'Auteur et entreprise immuables';
  end if;
  if new.parent_id is not null then
    select entreprise_id into v_parent_entreprise from public.colors_emplacements where id = new.parent_id;
    if v_parent_entreprise is distinct from new.entreprise_id then raise exception 'Emplacement parent invalide'; end if;
    if new.parent_id = new.id then raise exception 'Un emplacement ne peut pas être son propre parent'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.colors_valider_seau()
returns trigger language plpgsql set search_path = public as $$
declare v_emplacement_entreprise uuid;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null and current_user <> 'postgres' then raise exception 'Utilisateur Colors requis'; end if;
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  elsif new.created_by is distinct from old.created_by or new.entreprise_id is distinct from old.entreprise_id then
    raise exception 'Auteur et entreprise immuables';
  end if;
  if new.couleur_hex is not null then new.couleur_hex := upper(new.couleur_hex); end if;
  if new.emplacement_id is not null then
    select entreprise_id into v_emplacement_entreprise from public.colors_emplacements where id = new.emplacement_id and actif;
    if v_emplacement_entreprise is distinct from new.entreprise_id then raise exception 'Emplacement Colors invalide'; end if;
  end if;
  if new.etat = 'ouvert' and new.date_ouverture is null then new.date_ouverture := current_date; end if;
  if new.etat = 'archive' and new.archived_at is null then new.archived_at := now(); end if;
  if new.etat <> 'archive' then new.archived_at := null; end if;
  if tg_op = 'UPDATE' and current_user <> 'postgres' then
    raise exception 'Utilisez une action métier Colors pour cette modification';
  end if;
  return new;
end;
$$;

create or replace function public.colors_valider_analyse_ocr()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_seau_entreprise uuid;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null and current_user <> 'postgres' then raise exception 'Utilisateur Colors requis'; end if;
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    new.statut := 'a_confirmer'; new.confirme_par := null; new.confirme_at := null;
  elsif new.created_by is distinct from old.created_by or new.entreprise_id is distinct from old.entreprise_id then
    raise exception 'Auteur et entreprise immuables';
  end if;
  if tg_op = 'UPDATE' and current_user <> 'postgres' then raise exception 'Utilisez une action métier OCR Colors'; end if;
  if new.photo_path not like new.entreprise_id::text || '/%' then raise exception 'Chemin OCR Colors invalide'; end if;
  if new.seau_id is not null then
    select entreprise_id into v_seau_entreprise from public.colors_seaux where id = new.seau_id;
    if v_seau_entreprise is distinct from new.entreprise_id then raise exception 'Seau OCR Colors invalide'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.colors_valider_mouvement()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if current_user <> 'postgres' then raise exception 'Le journal Colors est réservé aux actions métier'; end if;
  if tg_op='INSERT' and auth.uid() is not null then new.auteur_id:=auth.uid(); end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;

create or replace function public.colors_valider_parametres()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if current_user <> 'postgres' then raise exception 'Utilisez une action métier Colors pour les paramètres'; end if;
  return new;
end; $$;

drop trigger if exists colors_mouvements_write_guard_v11 on public.colors_mouvements;
create trigger colors_mouvements_write_guard_v11 before insert or update or delete on public.colors_mouvements
for each row execute function public.colors_valider_mouvement();
drop trigger if exists colors_parametres_write_guard_v11 on public.colors_parametres;
create trigger colors_parametres_write_guard_v11 before insert or update on public.colors_parametres
for each row execute function public.colors_valider_parametres();

create or replace function public.colors_modifier_seau(
  p_seau_id uuid,p_marque text,p_produit text,p_reference_produit text,p_teinte_nom text,
  p_teinte_reference text,p_couleur_hex text,p_notes text
) returns public.colors_seaux language plpgsql security definer set search_path=public as $$
declare v public.colors_seaux;
begin
  select * into v from public.colors_seaux where id=p_seau_id for update;
  if v.id is null or not public.colors_action_autorisee(v.entreprise_id,'modifier_seau') then raise exception 'Accès Colors refusé'; end if;
  if btrim(coalesce(p_marque,''))='' or btrim(coalesce(p_produit,''))='' then raise exception 'Marque et produit requis'; end if;
  update public.colors_seaux set marque=left(btrim(p_marque),120),produit=left(btrim(p_produit),180),
    reference_produit=nullif(left(btrim(p_reference_produit),120),''),teinte_nom=nullif(left(btrim(p_teinte_nom),180),''),
    teinte_reference=nullif(left(btrim(p_teinte_reference),120),''),couleur_hex=nullif(upper(left(btrim(p_couleur_hex),7)),''),
    notes=nullif(left(btrim(p_notes),4000),'') where id=v.id returning * into v;
  return v;
end; $$;

create or replace function public.colors_enregistrer_parametres(p_entreprise_id uuid,p_seuil numeric)
returns public.colors_parametres language plpgsql security definer set search_path=public as $$
declare v public.colors_parametres;
begin
  if not public.colors_action_autorisee(p_entreprise_id,'gerer_parametres') then raise exception 'Accès Colors refusé'; end if;
  if p_seuil is null or p_seuil < 0 or p_seuil > 100 then raise exception 'Seuil invalide'; end if;
  insert into public.colors_parametres(entreprise_id,seuil_stock_faible_pourcent,updated_by)
  values(p_entreprise_id,p_seuil,auth.uid()) on conflict(entreprise_id) do update
  set seuil_stock_faible_pourcent=excluded.seuil_stock_faible_pourcent,updated_by=auth.uid()
  returning * into v; return v;
end; $$;

create or replace function public.colors_statistiques(p_entreprise_id uuid)
returns table(actifs bigint,ouverts bigint,faibles bigint,vides bigint,seuil_stock_faible_pourcent numeric)
language plpgsql security definer stable set search_path=public as $$
begin
  if not public.colors_action_autorisee(p_entreprise_id,'voir') then raise exception 'Accès Colors refusé'; end if;
  return query select count(s.id) filter(where s.etat<>'archive'),count(s.id) filter(where s.etat='ouvert'),
    count(*) filter(where s.etat not in ('archive','vide') and s.pourcentage_restant<=p.seuil),
    count(s.id) filter(where s.etat='vide'),p.seuil
  from (select coalesce((select cp.seuil_stock_faible_pourcent from public.colors_parametres cp where cp.entreprise_id=p_entreprise_id),20) seuil)p
  left join public.colors_seaux s on s.entreprise_id=p_entreprise_id
  group by p.seuil;
end; $$;

create or replace function public.colors_ajuster_quantite(p_seau_id uuid,p_valeur numeric,p_type text default 'ajustement',p_motif text default null)
returns public.colors_seaux language plpgsql security definer set search_path=public as $$
declare avant public.colors_seaux; apres public.colors_seaux; valeur_avant numeric; mouvement text;
begin
  select * into avant from public.colors_seaux where id=p_seau_id for update;
  if avant.id is null or not public.colors_action_autorisee(avant.entreprise_id,'mouvement') then raise exception 'Accès Colors refusé'; end if;
  if avant.etat='archive' then raise exception 'Un seau archivé ne peut pas être ajusté'; end if;
  if p_type not in ('sortie','consommation','retour_chantier','ajustement','passage_vide') then raise exception 'Type de mouvement invalide'; end if;
  if p_valeur is null or p_valeur<0 then raise exception 'La quantité restante ne peut pas être négative'; end if;
  valeur_avant:=case when avant.mode_quantite='pourcentage' then avant.pourcentage_saisi else avant.quantite_restante end;
  if avant.mode_quantite='pourcentage' and p_valeur>100 then raise exception 'Pourcentage supérieur à 100'; end if;
  if avant.mode_quantite<>'pourcentage' and p_valeur>avant.quantite_nominale then raise exception 'Quantité supérieure au nominal'; end if;
  if p_type in ('sortie','consommation') and p_valeur>=valeur_avant then raise exception 'Une sortie ou consommation doit réduire le stock'; end if;
  if p_type='retour_chantier' and p_valeur<=valeur_avant then raise exception 'Un retour chantier doit augmenter le stock'; end if;
  if p_type='ajustement' and btrim(coalesce(p_motif,''))='' then raise exception 'Un motif est requis pour un ajustement'; end if;
  if p_type='passage_vide' and p_valeur<>0 then raise exception 'Un passage vide doit fixer le stock à zéro'; end if;
  if p_valeur=valeur_avant then raise exception 'La valeur doit être modifiée'; end if;
  mouvement:=case when p_valeur=0 then 'passage_vide' else p_type end;
  if avant.mode_quantite='pourcentage' then update public.colors_seaux set pourcentage_saisi=p_valeur,etat=case when p_valeur=0 then 'vide' else etat end where id=avant.id returning * into apres;
  else update public.colors_seaux set quantite_restante=p_valeur,etat=case when p_valeur=0 then 'vide' else etat end where id=avant.id returning * into apres; end if;
  insert into public.colors_mouvements(entreprise_id,seau_id,type,quantite_avant,quantite_apres,pourcentage_avant,pourcentage_apres,unite,emplacement_avant_id,emplacement_apres_id,etat_avant,etat_apres,auteur_id,motif)
  values(apres.entreprise_id,apres.id,mouvement,case when apres.mode_quantite='pourcentage' then null else avant.quantite_restante end,case when apres.mode_quantite='pourcentage' then null else apres.quantite_restante end,
    avant.pourcentage_restant,apres.pourcentage_restant,apres.unite,avant.emplacement_id,apres.emplacement_id,avant.etat,apres.etat,auth.uid(),nullif(btrim(p_motif),''));
  return apres;
end; $$;

create or replace function public.colors_deplacer_seau(p_seau_id uuid,p_emplacement_id uuid,p_motif text default null)
returns public.colors_seaux language plpgsql security definer set search_path=public as $$
declare avant public.colors_seaux; apres public.colors_seaux; v_ent uuid;
begin
  select * into avant from public.colors_seaux where id=p_seau_id for update;
  if avant.id is null or not public.colors_action_autorisee(avant.entreprise_id,'mouvement') then raise exception 'Accès Colors refusé'; end if;
  if avant.etat='archive' then raise exception 'Un seau archivé ne peut pas être déplacé'; end if;
  if p_emplacement_id is not distinct from avant.emplacement_id then raise exception 'Le nouvel emplacement doit être différent'; end if;
  select entreprise_id into v_ent from public.colors_emplacements where id=p_emplacement_id and actif;
  if v_ent is distinct from avant.entreprise_id then raise exception 'Emplacement Colors invalide'; end if;
  update public.colors_seaux set emplacement_id=p_emplacement_id where id=avant.id returning * into apres;
  insert into public.colors_mouvements(entreprise_id,seau_id,type,quantite_avant,quantite_apres,pourcentage_avant,pourcentage_apres,unite,emplacement_avant_id,emplacement_apres_id,etat_avant,etat_apres,auteur_id,motif)
  values(apres.entreprise_id,apres.id,'deplacement',apres.quantite_restante,apres.quantite_restante,apres.pourcentage_restant,apres.pourcentage_restant,apres.unite,avant.emplacement_id,apres.emplacement_id,avant.etat,apres.etat,auth.uid(),p_motif); return apres;
end; $$;

create or replace function public.colors_changer_etat(p_seau_id uuid,p_etat text,p_motif text default null)
returns public.colors_seaux language plpgsql security definer set search_path=public as $$
declare avant public.colors_seaux; apres public.colors_seaux; mouvement text;
begin
  select * into avant from public.colors_seaux where id=p_seau_id for update;
  if avant.id is null or not public.colors_action_autorisee(avant.entreprise_id,'mouvement') then raise exception 'Accès Colors refusé'; end if;
  if p_etat='vide' then return public.colors_ajuster_quantite(avant.id,0,'passage_vide',p_motif); end if;
  if not ((avant.etat='ferme' and p_etat='ouvert') or (avant.etat='ouvert' and p_etat='ferme')) then raise exception 'Transition d’état invalide'; end if;
  mouvement:=case when p_etat='ouvert' then 'ouverture' else 'fermeture' end;
  update public.colors_seaux set etat=p_etat,date_ouverture=case when p_etat='ouvert' then coalesce(date_ouverture,current_date) else date_ouverture end where id=avant.id returning * into apres;
  insert into public.colors_mouvements(entreprise_id,seau_id,type,quantite_avant,quantite_apres,pourcentage_avant,pourcentage_apres,unite,emplacement_avant_id,emplacement_apres_id,etat_avant,etat_apres,auteur_id,motif)
  values(apres.entreprise_id,apres.id,mouvement,apres.quantite_restante,apres.quantite_restante,apres.pourcentage_restant,apres.pourcentage_restant,apres.unite,apres.emplacement_id,apres.emplacement_id,avant.etat,apres.etat,auth.uid(),p_motif); return apres;
end; $$;

create or replace function public.colors_definir_photo(p_seau_id uuid,p_photo_path text)
returns public.colors_seaux language plpgsql security definer set search_path=public,storage as $$
declare v public.colors_seaux; objet storage.objects; parties text[];
begin
  select * into v from public.colors_seaux where id=p_seau_id for update;
  if v.id is null or not public.colors_action_autorisee(v.entreprise_id,'ocr') then raise exception 'Accès Colors refusé'; end if;
  if p_photo_path is not null then
    parties:=storage.foldername(p_photo_path);
    if array_length(parties,1)<>2 or parties[1]<>v.entreprise_id::text or parties[2]<>v.id::text or p_photo_path like '%..%' then raise exception 'Photo Colors invalide'; end if;
    select * into objet from storage.objects where bucket_id='colors-seaux' and name=p_photo_path;
    if objet.id is null or coalesce(objet.metadata->>'mimetype','') not in ('image/jpeg','image/png','image/webp','image/heic','image/heif')
      or coalesce(objet.metadata->>'size','') !~ '^[0-9]+$' or (objet.metadata->>'size')::bigint not between 1 and 10485760 then raise exception 'Photo Colors invalide'; end if;
  end if;
  update public.colors_seaux set photo_principale_path=p_photo_path where id=v.id returning * into v; return v;
end; $$;

create or replace function public.colors_creer_analyse_ocr(p_entreprise_id uuid,p_seau_id uuid,p_photo_path text,p_resultat jsonb default '{}'::jsonb,p_confiance numeric default null)
returns public.colors_analyses_ocr language plpgsql security definer set search_path=public as $$
declare v public.colors_analyses_ocr;
begin
  if not public.colors_action_autorisee(p_entreprise_id,'ocr') then raise exception 'Accès Colors refusé'; end if;
  insert into public.colors_analyses_ocr(entreprise_id,seau_id,photo_path,statut,resultat,confiance,created_by)
  values(p_entreprise_id,p_seau_id,p_photo_path,'a_confirmer',coalesce(p_resultat,'{}'::jsonb),p_confiance,auth.uid()) returning * into v; return v;
end; $$;

create or replace function public.colors_confirmer_analyse_ocr(p_analyse_id uuid,p_resultat jsonb)
returns public.colors_analyses_ocr language plpgsql security definer set search_path=public as $$
declare v public.colors_analyses_ocr;
begin
  select * into v from public.colors_analyses_ocr where id=p_analyse_id for update;
  if v.id is null or not public.colors_action_autorisee(v.entreprise_id,'ocr') then raise exception 'Accès Colors refusé'; end if;
  if v.statut<>'a_confirmer' then raise exception 'Analyse OCR déjà traitée'; end if;
  if p_resultat is null or jsonb_typeof(p_resultat)<>'object' or p_resultat='{}'::jsonb then raise exception 'Résultat OCR confirmé requis'; end if;
  update public.colors_analyses_ocr set statut='confirmee',resultat=p_resultat,confirme_par=auth.uid(),confirme_at=now() where id=v.id returning * into v; return v;
end; $$;

create or replace function public.colors_rejeter_analyse_ocr(p_analyse_id uuid,p_motif text default null)
returns public.colors_analyses_ocr language plpgsql security definer set search_path=public as $$
declare v public.colors_analyses_ocr;
begin
  select * into v from public.colors_analyses_ocr where id=p_analyse_id for update;
  if v.id is null or not public.colors_action_autorisee(v.entreprise_id,'ocr') then raise exception 'Accès Colors refusé'; end if;
  if v.statut<>'a_confirmer' then raise exception 'Analyse OCR déjà traitée'; end if;
  update public.colors_analyses_ocr set statut='rejetee',erreur_code=nullif(left(btrim(p_motif),80),'') where id=v.id returning * into v; return v;
end; $$;

alter table public.colors_mouvements add constraint colors_mouvements_ajustement_motif_v11 check(type<>'ajustement' or btrim(coalesce(motif,''))<>'') not valid;
alter table public.colors_mouvements add constraint colors_mouvements_deplacement_v11 check(type<>'deplacement' or emplacement_avant_id is distinct from emplacement_apres_id) not valid;
alter table public.colors_mouvements add constraint colors_mouvements_passage_vide_v11 check(type<>'passage_vide' or coalesce(quantite_apres,pourcentage_apres)=0) not valid;
alter table public.colors_mouvements add constraint colors_mouvements_sortie_sens_v11 check(type not in ('sortie','consommation') or coalesce(quantite_apres,pourcentage_apres)<coalesce(quantite_avant,pourcentage_avant)) not valid;
alter table public.colors_mouvements add constraint colors_mouvements_retour_sens_v11 check(type<>'retour_chantier' or coalesce(quantite_apres,pourcentage_apres)>coalesce(quantite_avant,pourcentage_avant)) not valid;

drop policy if exists colors_seaux_update on public.colors_seaux;
drop policy if exists colors_ocr_insert on public.colors_analyses_ocr;
drop policy if exists colors_ocr_update on public.colors_analyses_ocr;
drop policy if exists colors_parametres_insert on public.colors_parametres;
drop policy if exists colors_parametres_update on public.colors_parametres;
drop policy if exists colors_photos_insert on storage.objects;
drop policy if exists colors_photos_update on storage.objects;
drop policy if exists colors_photos_delete on storage.objects;

create policy colors_photos_insert on storage.objects for insert to authenticated with check(
  bucket_id='colors-seaux' and array_length(storage.foldername(name),1)=2 and name not like '%..%'
  and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp','image/heic','image/heif')
  and coalesce(metadata->>'size','') ~ '^[0-9]+$' and (metadata->>'size')::bigint between 1 and 10485760
  and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$' then
    public.colors_action_autorisee(((storage.foldername(name))[1])::uuid,'ocr') and exists(select 1 from public.colors_seaux s where s.id=((storage.foldername(name))[2])::uuid and s.entreprise_id=((storage.foldername(name))[1])::uuid)
  else false end
);
create policy colors_photos_delete on storage.objects for delete to authenticated using(
  bucket_id='colors-seaux' and array_length(storage.foldername(name),1)=2 and
  case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then public.colors_action_autorisee(((storage.foldername(name))[1])::uuid,'ocr') else false end
  and not exists(select 1 from public.colors_seaux s where s.photo_principale_path=name)
);

revoke update on public.colors_seaux from authenticated;
revoke insert,update on public.colors_analyses_ocr from authenticated;
revoke insert,update on public.colors_parametres from authenticated;
revoke update on storage.objects from authenticated;

revoke all on function public.colors_modifier_seau(uuid,text,text,text,text,text,text,text) from public,anon;
revoke all on function public.colors_enregistrer_parametres(uuid,numeric) from public,anon;
revoke all on function public.colors_statistiques(uuid) from public,anon;
revoke all on function public.colors_creer_analyse_ocr(uuid,uuid,text,jsonb,numeric) from public,anon;
revoke all on function public.colors_confirmer_analyse_ocr(uuid,jsonb) from public,anon;
revoke all on function public.colors_rejeter_analyse_ocr(uuid,text) from public,anon;
grant execute on function public.colors_modifier_seau(uuid,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.colors_enregistrer_parametres(uuid,numeric) to authenticated;
grant execute on function public.colors_statistiques(uuid) to authenticated;
grant execute on function public.colors_creer_analyse_ocr(uuid,uuid,text,jsonb,numeric) to authenticated;
grant execute on function public.colors_confirmer_analyse_ocr(uuid,jsonb) to authenticated;
grant execute on function public.colors_rejeter_analyse_ocr(uuid,text) to authenticated;
revoke all on function public.colors_valider_mouvement() from public,anon,authenticated;
revoke all on function public.colors_valider_parametres() from public,anon,authenticated;

notify pgrst,'reload schema';
