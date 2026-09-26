-- ELSATIA Colors — cœur métier V1.
-- Migration strictement métier : aucune table/fonction du socle multi-app n'est modifiée.

create table public.colors_emplacements (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  parent_id uuid references public.colors_emplacements(id) on delete restrict,
  nom text not null check (btrim(nom) <> '' and length(nom) <= 120),
  type text not null check (type in ('depot','vehicule','chantier','atelier','zone','rack','etagere','autre')),
  description text check (description is null or length(description) <= 1000),
  reference_externe text check (reference_externe is null or length(reference_externe) <= 120),
  actif boolean not null default true,
  ordre integer not null default 0,
  archived_at timestamptz,
  created_by uuid not null default auth.uid() references public.utilisateurs(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entreprise_id, nom),
  check ((actif and archived_at is null) or (not actif and archived_at is not null))
);

create table public.colors_seaux (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  emplacement_id uuid references public.colors_emplacements(id) on delete restrict,
  marque text not null check (btrim(marque) <> '' and length(marque) <= 120),
  produit text not null check (btrim(produit) <> '' and length(produit) <= 180),
  reference_produit text check (reference_produit is null or length(reference_produit) <= 120),
  teinte_nom text check (teinte_nom is null or length(teinte_nom) <= 180),
  teinte_reference text check (teinte_reference is null or length(teinte_reference) <= 120),
  couleur_hex text check (couleur_hex is null or couleur_hex ~ '^#[0-9A-F]{6}$'),
  ral_approxime text check (ral_approxime is null or ral_approxime ~ '^RAL [0-9]{4}$'),
  ral_distance numeric(10,4) check (ral_distance is null or ral_distance >= 0),
  ral_confirme boolean not null default false,
  mode_quantite text not null check (mode_quantite in ('pourcentage','volume','poids')),
  quantite_nominale numeric(12,3),
  quantite_restante numeric(12,3),
  unite text not null,
  pourcentage_saisi numeric(5,2),
  densite_kg_l numeric(10,4) check (densite_kg_l is null or densite_kg_l > 0),
  pourcentage_restant numeric(5,2) generated always as (
    case
      when mode_quantite = 'pourcentage' then pourcentage_saisi
      when quantite_nominale > 0 then round((quantite_restante / quantite_nominale) * 100, 2)
      else null
    end
  ) stored,
  etat text not null default 'ferme' check (etat in ('ferme','ouvert','vide','archive')),
  date_ouverture date,
  photo_principale_path text check (photo_principale_path is null or length(photo_principale_path) <= 500),
  notes text check (notes is null or length(notes) <= 4000),
  created_by uuid not null default auth.uid() references public.utilisateurs(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (
    (mode_quantite = 'pourcentage' and pourcentage_saisi is not null and pourcentage_saisi between 0 and 100
      and quantite_nominale is null and quantite_restante is null and unite = 'pourcent')
    or
    (mode_quantite = 'volume' and unite in ('l','ml') and quantite_nominale is not null and quantite_nominale > 0
      and quantite_restante is not null and quantite_restante between 0 and quantite_nominale and pourcentage_saisi is null)
    or
    (mode_quantite = 'poids' and unite in ('kg','g') and quantite_nominale is not null and quantite_nominale > 0
      and quantite_restante is not null and quantite_restante between 0 and quantite_nominale and pourcentage_saisi is null)
  ),
  check ((etat = 'archive' and archived_at is not null) or (etat <> 'archive' and archived_at is null)),
  check (etat <> 'vide' or (
    (mode_quantite = 'pourcentage' and pourcentage_saisi = 0)
    or (mode_quantite <> 'pourcentage' and quantite_restante = 0)
  )),
  check (ral_confirme = false or ral_approxime is not null)
);

create table public.colors_mouvements (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  seau_id uuid not null references public.colors_seaux(id) on delete restrict,
  type text not null check (type in (
    'entree','sortie','consommation','retour_chantier','deplacement','ajustement',
    'ouverture','fermeture','passage_vide','archivage','restauration'
  )),
  quantite_avant numeric(12,3),
  quantite_apres numeric(12,3),
  pourcentage_avant numeric(5,2),
  pourcentage_apres numeric(5,2),
  unite text,
  emplacement_avant_id uuid references public.colors_emplacements(id) on delete restrict,
  emplacement_apres_id uuid references public.colors_emplacements(id) on delete restrict,
  etat_avant text,
  etat_apres text,
  auteur_id uuid not null default auth.uid() references public.utilisateurs(id) on delete restrict,
  motif text check (motif is null or length(motif) <= 500),
  note text check (note is null or length(note) <= 2000),
  reference text check (reference is null or length(reference) <= 120),
  created_at timestamptz not null default now(),
  check (quantite_avant is null or quantite_avant >= 0),
  check (quantite_apres is null or quantite_apres >= 0),
  check (pourcentage_avant is null or pourcentage_avant between 0 and 100),
  check (pourcentage_apres is null or pourcentage_apres between 0 and 100)
);

create table public.colors_analyses_ocr (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  seau_id uuid references public.colors_seaux(id) on delete cascade,
  photo_path text not null check (btrim(photo_path) <> '' and length(photo_path) <= 500),
  statut text not null default 'a_confirmer' check (statut in ('a_confirmer','confirmee','rejetee','erreur')),
  fournisseur text not null default 'elsatia_ai' check (length(fournisseur) <= 80),
  resultat jsonb not null default '{}'::jsonb check (jsonb_typeof(resultat) = 'object'),
  confiance numeric(5,2) check (confiance is null or confiance between 0 and 100),
  erreur_code text check (erreur_code is null or length(erreur_code) <= 80),
  confirme_par uuid references public.utilisateurs(id) on delete restrict,
  confirme_at timestamptz,
  created_by uuid not null default auth.uid() references public.utilisateurs(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((statut = 'confirmee' and confirme_par is not null and confirme_at is not null) or statut <> 'confirmee')
);

create table public.colors_parametres (
  entreprise_id uuid primary key references public.entreprises(id) on delete cascade,
  seuil_stock_faible_pourcent numeric(5,2) not null default 20 check (seuil_stock_faible_pourcent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index colors_emplacements_entreprise_actif_idx on public.colors_emplacements(entreprise_id, actif, ordre, nom);
create index colors_seaux_inventaire_idx on public.colors_seaux(entreprise_id, etat, emplacement_id, updated_at desc);
create index colors_seaux_stock_faible_idx on public.colors_seaux(entreprise_id, pourcentage_restant) where etat not in ('archive','vide');
create index colors_seaux_recherche_idx on public.colors_seaux using gin (
  to_tsvector('simple', coalesce(marque,'') || ' ' || coalesce(produit,'') || ' ' ||
    coalesce(reference_produit,'') || ' ' || coalesce(teinte_nom,'') || ' ' ||
    coalesce(teinte_reference,'') || ' ' || coalesce(couleur_hex,'') || ' ' || coalesce(ral_approxime,''))
);
create index colors_mouvements_seau_chrono_idx on public.colors_mouvements(entreprise_id, seau_id, created_at desc);
create index colors_ocr_entreprise_statut_idx on public.colors_analyses_ocr(entreprise_id, statut, created_at desc);

create or replace function public.colors_role_courant(p_entreprise_id uuid)
returns text language sql security definer stable set search_path = public as $$
  select h.role_code
  from public.habilitations_applications_utilisateurs h
  join public.roles_applications_elsatia r
    on r.application_code = h.application_code and r.code = h.role_code and r.actif
  where h.entreprise_id = p_entreprise_id
    and h.utilisateur_id = auth.uid()
    and h.application_code = 'colors'
    and h.autorise
    and (h.valide_du is null or h.valide_du <= now())
    and (h.valide_jusqu_au is null or h.valide_jusqu_au > now())
    and not public.est_plateforme_admin()
    and public.a_acces_application(p_entreprise_id, 'colors')
  limit 1;
$$;

create or replace function public.colors_action_autorisee(p_entreprise_id uuid, p_action text)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare v_role text;
begin
  if auth.uid() is null then return false; end if;
  if public.est_plateforme_admin() then
    return p_action = 'voir' and public.est_acces_support_actif(p_entreprise_id);
  end if;
  v_role := public.colors_role_courant(p_entreprise_id);
  if v_role is null then return false; end if;
  if p_action in ('voir','voir_fiche') then return true; end if;
  if p_action in ('ajouter_seau','mouvement','ocr') then
    return v_role in ('colors_admin_organisation','colors_gestionnaire_stock','colors_utilisateur_depot');
  end if;
  if p_action in ('modifier_seau','archiver','restaurer','gerer_emplacements') then
    return v_role in ('colors_admin_organisation','colors_gestionnaire_stock');
  end if;
  if p_action = 'exporter' then
    return v_role in ('colors_admin_organisation','colors_gestionnaire_stock','colors_consultation');
  end if;
  if p_action = 'gerer_parametres' then return v_role = 'colors_admin_organisation'; end if;
  return false;
end;
$$;

create or replace function public.colors_set_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;

create or replace function public.colors_valider_emplacement()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_parent_entreprise uuid;
begin
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
  if new.couleur_hex is not null then new.couleur_hex := upper(new.couleur_hex); end if;
  if new.emplacement_id is not null then
    select entreprise_id into v_emplacement_entreprise from public.colors_emplacements where id = new.emplacement_id and actif;
    if v_emplacement_entreprise is distinct from new.entreprise_id then raise exception 'Emplacement Colors invalide'; end if;
  end if;
  if new.etat = 'ouvert' and new.date_ouverture is null then new.date_ouverture := current_date; end if;
  if new.etat = 'archive' and new.archived_at is null then new.archived_at := now(); end if;
  if new.etat <> 'archive' then new.archived_at := null; end if;
  if tg_op = 'UPDATE' and current_user <> 'postgres' then
    if new.entreprise_id is distinct from old.entreprise_id
      or new.mode_quantite is distinct from old.mode_quantite
      or new.quantite_nominale is distinct from old.quantite_nominale
      or new.quantite_restante is distinct from old.quantite_restante
      or new.unite is distinct from old.unite
      or new.pourcentage_saisi is distinct from old.pourcentage_saisi
      or new.emplacement_id is distinct from old.emplacement_id
      or new.etat is distinct from old.etat
      or new.date_ouverture is distinct from old.date_ouverture
      or new.archived_at is distinct from old.archived_at
    then raise exception 'Utilisez une action métier Colors pour cette modification'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.colors_historiser_creation_seau()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.colors_mouvements(
    entreprise_id, seau_id, type, quantite_apres, pourcentage_apres, unite,
    emplacement_apres_id, etat_apres, auteur_id, motif
  ) values (
    new.entreprise_id, new.id, 'entree', new.quantite_restante, new.pourcentage_restant,
    new.unite, new.emplacement_id, new.etat, new.created_by, 'Création du seau'
  );
  return new;
end;
$$;

create or replace function public.colors_valider_analyse_ocr()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_seau_entreprise uuid;
begin
  if new.photo_path not like new.entreprise_id::text || '/%' then
    raise exception 'Chemin OCR Colors invalide';
  end if;
  if new.seau_id is not null then
    select entreprise_id into v_seau_entreprise from public.colors_seaux where id = new.seau_id;
    if v_seau_entreprise is distinct from new.entreprise_id then
      raise exception 'Seau OCR Colors invalide';
    end if;
  end if;
  return new;
end;
$$;

create trigger colors_emplacements_parent_guard before insert or update on public.colors_emplacements
for each row execute function public.colors_valider_emplacement();
create trigger colors_emplacements_updated before update on public.colors_emplacements
for each row execute function public.colors_set_updated_at();
create trigger colors_seaux_guard before insert or update on public.colors_seaux
for each row execute function public.colors_valider_seau();
create trigger colors_seaux_updated before update on public.colors_seaux
for each row execute function public.colors_set_updated_at();
create trigger colors_seaux_creation_history after insert on public.colors_seaux
for each row execute function public.colors_historiser_creation_seau();
create trigger colors_ocr_updated before update on public.colors_analyses_ocr
for each row execute function public.colors_set_updated_at();
create trigger colors_ocr_tenant_guard before insert or update on public.colors_analyses_ocr
for each row execute function public.colors_valider_analyse_ocr();
create trigger colors_parametres_updated before update on public.colors_parametres
for each row execute function public.colors_set_updated_at();

create or replace function public.colors_ajuster_quantite(
  p_seau_id uuid, p_valeur numeric, p_type text default 'ajustement', p_motif text default null
) returns public.colors_seaux
language plpgsql security definer set search_path = public as $$
declare v public.colors_seaux; v_avant numeric; v_pct numeric; v_type text;
begin
  select * into v from public.colors_seaux where id = p_seau_id for update;
  if v.id is null or not public.colors_action_autorisee(v.entreprise_id,'mouvement') then raise exception 'Accès Colors refusé'; end if;
  if v.etat = 'archive' then raise exception 'Un seau archivé ne peut pas être ajusté'; end if;
  if p_type not in ('sortie','consommation','retour_chantier','ajustement','passage_vide') then raise exception 'Type de mouvement invalide'; end if;
  if p_valeur < 0 then raise exception 'La quantité restante ne peut pas être négative'; end if;
  v_avant := case when v.mode_quantite = 'pourcentage' then v.pourcentage_saisi else v.quantite_restante end;
  if v.mode_quantite = 'pourcentage' then
    if p_valeur > 100 then raise exception 'Pourcentage supérieur à 100'; end if;
    update public.colors_seaux set pourcentage_saisi = p_valeur, etat = case when p_valeur = 0 then 'vide' else etat end where id = v.id returning * into v;
  else
    if p_valeur > v.quantite_nominale then raise exception 'Quantité supérieure au nominal'; end if;
    update public.colors_seaux set quantite_restante = p_valeur, etat = case when p_valeur = 0 then 'vide' else etat end where id = v.id returning * into v;
  end if;
  v_type := case when v.pourcentage_restant = 0 then 'passage_vide' else p_type end;
  insert into public.colors_mouvements(entreprise_id,seau_id,type,quantite_avant,quantite_apres,pourcentage_avant,pourcentage_apres,unite,emplacement_avant_id,emplacement_apres_id,etat_avant,etat_apres,auteur_id,motif)
  values(v.entreprise_id,v.id,v_type,case when v.mode_quantite='pourcentage' then null else v_avant end,v.quantite_restante,
    case when v.mode_quantite='pourcentage' then v_avant else round((v_avant/v.quantite_nominale)*100,2) end,v.pourcentage_restant,v.unite,v.emplacement_id,v.emplacement_id,
    case when v_type='passage_vide' then 'ouvert' else v.etat end,v.etat,auth.uid(),p_motif);
  return v;
end;
$$;

create or replace function public.colors_deplacer_seau(p_seau_id uuid, p_emplacement_id uuid, p_motif text default null)
returns public.colors_seaux language plpgsql security definer set search_path = public as $$
declare v public.colors_seaux; v_avant uuid; v_ent uuid;
begin
  select * into v from public.colors_seaux where id=p_seau_id for update;
  if v.id is null or not public.colors_action_autorisee(v.entreprise_id,'mouvement') then raise exception 'Accès Colors refusé'; end if;
  if v.etat='archive' then raise exception 'Un seau archivé ne peut pas être déplacé'; end if;
  select entreprise_id into v_ent from public.colors_emplacements where id=p_emplacement_id and actif;
  if v_ent is distinct from v.entreprise_id then raise exception 'Emplacement Colors invalide'; end if;
  v_avant := v.emplacement_id;
  update public.colors_seaux set emplacement_id=p_emplacement_id where id=v.id returning * into v;
  insert into public.colors_mouvements(entreprise_id,seau_id,type,quantite_avant,quantite_apres,pourcentage_avant,pourcentage_apres,unite,emplacement_avant_id,emplacement_apres_id,etat_avant,etat_apres,auteur_id,motif)
  values(v.entreprise_id,v.id,'deplacement',v.quantite_restante,v.quantite_restante,v.pourcentage_restant,v.pourcentage_restant,v.unite,v_avant,v.emplacement_id,v.etat,v.etat,auth.uid(),p_motif);
  return v;
end;
$$;

create or replace function public.colors_changer_etat(p_seau_id uuid, p_etat text, p_motif text default null)
returns public.colors_seaux language plpgsql security definer set search_path = public as $$
declare v public.colors_seaux; v_avant text; v_type text;
begin
  select * into v from public.colors_seaux where id=p_seau_id for update;
  if v.id is null or not public.colors_action_autorisee(v.entreprise_id,'mouvement') then raise exception 'Accès Colors refusé'; end if;
  if v.etat='archive' or p_etat not in ('ferme','ouvert','vide') then raise exception 'Transition d’état invalide'; end if;
  if p_etat='vide' then perform public.colors_ajuster_quantite(v.id,0,'passage_vide',p_motif); select * into v from public.colors_seaux where id=v.id; return v; end if;
  v_avant:=v.etat; v_type:=case when p_etat='ouvert' then 'ouverture' else 'fermeture' end;
  update public.colors_seaux set etat=p_etat, date_ouverture=case when p_etat='ouvert' then coalesce(date_ouverture,current_date) else date_ouverture end where id=v.id returning * into v;
  insert into public.colors_mouvements(entreprise_id,seau_id,type,quantite_avant,quantite_apres,pourcentage_avant,pourcentage_apres,unite,emplacement_avant_id,emplacement_apres_id,etat_avant,etat_apres,auteur_id,motif)
  values(v.entreprise_id,v.id,v_type,v.quantite_restante,v.quantite_restante,v.pourcentage_restant,v.pourcentage_restant,v.unite,v.emplacement_id,v.emplacement_id,v_avant,v.etat,auth.uid(),p_motif);
  return v;
end;
$$;

create or replace function public.colors_archiver_seau(p_seau_id uuid, p_archiver boolean default true, p_motif text default null)
returns public.colors_seaux language plpgsql security definer set search_path = public as $$
declare v public.colors_seaux; v_avant text; v_action text; v_type text;
begin
  select * into v from public.colors_seaux where id=p_seau_id for update;
  v_action:=case when p_archiver then 'archiver' else 'restaurer' end;
  if v.id is null or not public.colors_action_autorisee(v.entreprise_id,v_action) then raise exception 'Accès Colors refusé'; end if;
  v_avant:=v.etat; v_type:=case when p_archiver then 'archivage' else 'restauration' end;
  update public.colors_seaux set etat=case when p_archiver then 'archive' else case when pourcentage_restant=0 then 'vide' else 'ferme' end end,
    archived_at=case when p_archiver then now() else null end where id=v.id returning * into v;
  insert into public.colors_mouvements(entreprise_id,seau_id,type,quantite_avant,quantite_apres,pourcentage_avant,pourcentage_apres,unite,emplacement_avant_id,emplacement_apres_id,etat_avant,etat_apres,auteur_id,motif)
  values(v.entreprise_id,v.id,v_type,v.quantite_restante,v.quantite_restante,v.pourcentage_restant,v.pourcentage_restant,v.unite,v.emplacement_id,v.emplacement_id,v_avant,v.etat,auth.uid(),p_motif);
  return v;
end;
$$;

create or replace function public.colors_definir_photo(p_seau_id uuid, p_photo_path text)
returns public.colors_seaux language plpgsql security definer set search_path = public, storage as $$
declare v public.colors_seaux; v_prefix text;
begin
  select * into v from public.colors_seaux where id=p_seau_id for update;
  if v.id is null or not public.colors_action_autorisee(v.entreprise_id,'ocr') then raise exception 'Accès Colors refusé'; end if;
  v_prefix := v.entreprise_id::text || '/' || v.id::text || '/';
  if p_photo_path is not null and (p_photo_path not like v_prefix || '%' or not exists(
    select 1 from storage.objects where bucket_id='colors-seaux' and name=p_photo_path
  )) then raise exception 'Photo Colors invalide'; end if;
  update public.colors_seaux set photo_principale_path=p_photo_path where id=v.id returning * into v;
  return v;
end;
$$;

alter table public.colors_emplacements enable row level security;
alter table public.colors_seaux enable row level security;
alter table public.colors_mouvements enable row level security;
alter table public.colors_analyses_ocr enable row level security;
alter table public.colors_parametres enable row level security;

create policy colors_emplacements_select on public.colors_emplacements for select to authenticated using(public.colors_action_autorisee(entreprise_id,'voir'));
create policy colors_emplacements_insert on public.colors_emplacements for insert to authenticated with check(public.colors_action_autorisee(entreprise_id,'gerer_emplacements'));
create policy colors_emplacements_update on public.colors_emplacements for update to authenticated using(public.colors_action_autorisee(entreprise_id,'gerer_emplacements')) with check(public.colors_action_autorisee(entreprise_id,'gerer_emplacements'));
create policy colors_seaux_select on public.colors_seaux for select to authenticated using(public.colors_action_autorisee(entreprise_id,'voir'));
create policy colors_seaux_insert on public.colors_seaux for insert to authenticated with check(public.colors_action_autorisee(entreprise_id,'ajouter_seau'));
create policy colors_seaux_update on public.colors_seaux for update to authenticated using(public.colors_action_autorisee(entreprise_id,'modifier_seau')) with check(public.colors_action_autorisee(entreprise_id,'modifier_seau'));
create policy colors_mouvements_select on public.colors_mouvements for select to authenticated using(public.colors_action_autorisee(entreprise_id,'voir'));
create policy colors_ocr_select on public.colors_analyses_ocr for select to authenticated using(public.colors_action_autorisee(entreprise_id,'voir'));
create policy colors_ocr_insert on public.colors_analyses_ocr for insert to authenticated with check(public.colors_action_autorisee(entreprise_id,'ocr'));
create policy colors_ocr_update on public.colors_analyses_ocr for update to authenticated using(public.colors_action_autorisee(entreprise_id,'ocr')) with check(public.colors_action_autorisee(entreprise_id,'ocr'));
create policy colors_parametres_select on public.colors_parametres for select to authenticated using(public.colors_action_autorisee(entreprise_id,'voir'));
create policy colors_parametres_insert on public.colors_parametres for insert to authenticated with check(public.colors_action_autorisee(entreprise_id,'gerer_parametres'));
create policy colors_parametres_update on public.colors_parametres for update to authenticated using(public.colors_action_autorisee(entreprise_id,'gerer_parametres')) with check(public.colors_action_autorisee(entreprise_id,'gerer_parametres'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('colors-seaux','colors-seaux',false,10485760,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy colors_photos_select on storage.objects for select to authenticated using(
  bucket_id='colors-seaux' and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    then public.colors_action_autorisee(((storage.foldername(name))[1])::uuid,'voir') else false end
);
create policy colors_photos_insert on storage.objects for insert to authenticated with check(
  bucket_id='colors-seaux' and array_length(storage.foldername(name),1) >= 2
  and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$' then
    public.colors_action_autorisee(((storage.foldername(name))[1])::uuid,'ocr')
    and exists(select 1 from public.colors_seaux s where s.id=((storage.foldername(name))[2])::uuid and s.entreprise_id=((storage.foldername(name))[1])::uuid)
  else false end
);
create policy colors_photos_update on storage.objects for update to authenticated using(
  bucket_id='colors-seaux' and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    then public.colors_action_autorisee(((storage.foldername(name))[1])::uuid,'ocr') else false end
) with check(
  bucket_id='colors-seaux' and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    then public.colors_action_autorisee(((storage.foldername(name))[1])::uuid,'ocr') else false end
);
create policy colors_photos_delete on storage.objects for delete to authenticated using(
  bucket_id='colors-seaux' and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    then public.colors_action_autorisee(((storage.foldername(name))[1])::uuid,'modifier_seau') else false end
);

grant select,insert,update on public.colors_emplacements,public.colors_seaux,public.colors_analyses_ocr,public.colors_parametres to authenticated;
grant select on public.colors_mouvements to authenticated;
revoke delete on public.colors_emplacements,public.colors_seaux,public.colors_mouvements,public.colors_analyses_ocr,public.colors_parametres from authenticated;
grant select,insert,update,delete on storage.objects to authenticated;

revoke all on function public.colors_role_courant(uuid) from public,anon;
revoke all on function public.colors_action_autorisee(uuid,text) from public,anon;
revoke all on function public.colors_ajuster_quantite(uuid,numeric,text,text) from public,anon;
revoke all on function public.colors_deplacer_seau(uuid,uuid,text) from public,anon;
revoke all on function public.colors_changer_etat(uuid,text,text) from public,anon;
revoke all on function public.colors_archiver_seau(uuid,boolean,text) from public,anon;
revoke all on function public.colors_definir_photo(uuid,text) from public,anon;
grant execute on function public.colors_role_courant(uuid) to authenticated;
grant execute on function public.colors_action_autorisee(uuid,text) to authenticated;
grant execute on function public.colors_ajuster_quantite(uuid,numeric,text,text) to authenticated;
grant execute on function public.colors_deplacer_seau(uuid,uuid,text) to authenticated;
grant execute on function public.colors_changer_etat(uuid,text,text) to authenticated;
grant execute on function public.colors_archiver_seau(uuid,boolean,text) to authenticated;
grant execute on function public.colors_definir_photo(uuid,text) to authenticated;

revoke all on function public.colors_set_updated_at() from public,anon,authenticated;
revoke all on function public.colors_valider_emplacement() from public,anon,authenticated;
revoke all on function public.colors_valider_seau() from public,anon,authenticated;
revoke all on function public.colors_historiser_creation_seau() from public,anon,authenticated;
revoke all on function public.colors_valider_analyse_ocr() from public,anon,authenticated;

notify pgrst,'reload schema';
