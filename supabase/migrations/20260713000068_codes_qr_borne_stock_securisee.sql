-- Codes QR internes et borne de stock attribuant chaque mouvement à l'employé qui saisit son code.
create extension if not exists pgcrypto;

create table if not exists public.codes_identification (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  type_ressource text not null check (type_ressource in ('article','chantier','vehicule','outil','employe')),
  ressource_id uuid not null,
  code text not null,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entreprise_id,type_ressource,ressource_id),
  unique (entreprise_id,code)
);
create index if not exists codes_identification_recherche_idx
  on public.codes_identification(entreprise_id,upper(code)) where actif;

alter table public.employes
  add column if not exists code_stock_hash text,
  add column if not exists code_stock_active boolean not null default false,
  add column if not exists code_stock_modifie_at timestamptz;

alter table public.mouvements_stock
  add column if not exists employe_id uuid references public.employes(id) on delete set null,
  add column if not exists cree_par_utilisateur_id uuid references public.utilisateurs(id) on delete set null,
  add column if not exists saisi_via_borne boolean not null default false,
  add column if not exists code_scan_utilise text;
create index if not exists mouvements_stock_employe_date_idx
  on public.mouvements_stock(entreprise_id,employe_id,date desc);

create table if not exists public.tentatives_borne_stock (
  id bigint generated always as identity primary key,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  utilisateur_id uuid references public.utilisateurs(id) on delete set null,
  reussie boolean not null,
  motif text,
  created_at timestamptz not null default now()
);
create index if not exists tentatives_borne_stock_limite_idx
  on public.tentatives_borne_stock(entreprise_id,utilisateur_id,created_at desc);

create or replace function public.code_identification_existe(
  p_entreprise_id uuid,p_type text,p_ressource_id uuid
) returns boolean language plpgsql security definer stable set search_path=public as $$
begin
  return case p_type
    when 'article' then exists(select 1 from public.articles_stock where id=p_ressource_id and entreprise_id=p_entreprise_id)
    when 'chantier' then exists(select 1 from public.chantiers where id=p_ressource_id and entreprise_id=p_entreprise_id)
    when 'vehicule' then exists(select 1 from public.vehicules where id=p_ressource_id and entreprise_id=p_entreprise_id)
    when 'outil' then exists(select 1 from public.outils where id=p_ressource_id and entreprise_id=p_entreprise_id)
    when 'employe' then exists(select 1 from public.employes where id=p_ressource_id and entreprise_id=p_entreprise_id)
    else false
  end;
end;$$;

create or replace function public.verifier_code_identification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not public.code_identification_existe(new.entreprise_id,new.type_ressource,new.ressource_id) then
    raise exception 'La ressource ne correspond pas à cette entreprise';
  end if;
  new.code:=upper(btrim(new.code));
  if new.code !~ '^LGP-[A-Z]{2,4}-[A-Z0-9]{6,16}$' then raise exception 'Format de code interne invalide'; end if;
  new.updated_at:=now();
  return new;
end;$$;
drop trigger if exists verifier_code_identification on public.codes_identification;
create trigger verifier_code_identification before insert or update on public.codes_identification
for each row execute function public.verifier_code_identification();

create or replace function public.creer_code_identification(
  p_entreprise_id uuid,p_type text,p_ressource_id uuid
) returns public.codes_identification
language plpgsql security definer set search_path=public as $$
declare v_prefix text;v_code text;v_ligne public.codes_identification;
begin
  if auth.uid() is not null and auth.role() is distinct from 'anon' and not (
    public.a_permission(p_entreprise_id,'gerer_stock') or
    (p_type='chantier' and public.a_permission(p_entreprise_id,'gerer_chantiers')) or
    (p_type='vehicule' and public.a_permission(p_entreprise_id,'gerer_flotte')) or
    (p_type='outil' and public.a_permission(p_entreprise_id,'gerer_outillage')) or
    (p_type='employe' and public.a_permission(p_entreprise_id,'gerer_employes'))
  ) then raise exception 'Accès refusé'; end if;
  if not public.code_identification_existe(p_entreprise_id,p_type,p_ressource_id) then raise exception 'Ressource introuvable'; end if;
  v_prefix:=case p_type when 'article' then 'ART' when 'chantier' then 'CH' when 'vehicule' then 'VEH' when 'outil' then 'OUT' else 'EMP' end;
  loop
    v_code:='LGP-'||v_prefix||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    exit when not exists(select 1 from public.codes_identification where entreprise_id=p_entreprise_id and code=v_code);
  end loop;
  insert into public.codes_identification(entreprise_id,type_ressource,ressource_id,code,actif)
  values(p_entreprise_id,p_type,p_ressource_id,v_code,true)
  on conflict(entreprise_id,type_ressource,ressource_id)
  do update set code=excluded.code,actif=true,updated_at=now()
  returning * into v_ligne;
  return v_ligne;
end;$$;

-- Codes générés pour les données déjà présentes. Les futures créations sont complétées par le trigger ci-dessous.
do $$ declare r record;begin
  for r in
    select entreprise_id,'article'::text type_ressource,id from public.articles_stock
    union all select entreprise_id,'chantier',id from public.chantiers
    union all select entreprise_id,'vehicule',id from public.vehicules
    union all select entreprise_id,'outil',id from public.outils
    union all select entreprise_id,'employe',id from public.employes
  loop
    if not exists(select 1 from public.codes_identification c where c.entreprise_id=r.entreprise_id and c.type_ressource=r.type_ressource and c.ressource_id=r.id) then
      perform public.creer_code_identification(r.entreprise_id,r.type_ressource,r.id);
    end if;
  end loop;
end$$;

create or replace function public.trg_creer_code_identification()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_type text:=tg_argv[0];begin
  perform public.creer_code_identification(new.entreprise_id,v_type,new.id);
  return new;
end;$$;
drop trigger if exists code_identification_article on public.articles_stock;
create trigger code_identification_article after insert on public.articles_stock for each row execute function public.trg_creer_code_identification('article');
drop trigger if exists code_identification_chantier on public.chantiers;
create trigger code_identification_chantier after insert on public.chantiers for each row execute function public.trg_creer_code_identification('chantier');
drop trigger if exists code_identification_vehicule on public.vehicules;
create trigger code_identification_vehicule after insert on public.vehicules for each row execute function public.trg_creer_code_identification('vehicule');
drop trigger if exists code_identification_outil on public.outils;
create trigger code_identification_outil after insert on public.outils for each row execute function public.trg_creer_code_identification('outil');
drop trigger if exists code_identification_employe on public.employes;
create trigger code_identification_employe after insert on public.employes for each row execute function public.trg_creer_code_identification('employe');

create or replace function public.definir_code_stock_employe(
  p_entreprise_id uuid,p_employe_id uuid,p_code text,p_actif boolean default true
) returns void language plpgsql security definer set search_path=public,extensions as $$
begin
  if auth.uid() is not null and auth.role() is distinct from 'anon' and not (public.a_permission(p_entreprise_id,'gerer_employes') or public.a_permission(p_entreprise_id,'gerer_stock')) then raise exception 'Accès refusé';end if;
  if p_actif and coalesce(p_code,'') !~ '^[0-9]{4,8}$' then raise exception 'Le code doit contenir de 4 à 8 chiffres';end if;
  update public.employes set
    code_stock_hash=case when p_actif then crypt(p_code,gen_salt('bf',10)) else null end,
    code_stock_active=p_actif,
    code_stock_modifie_at=now(),updated_at=now()
  where id=p_employe_id and entreprise_id=p_entreprise_id;
  if not found then raise exception 'Employé introuvable';end if;
end;$$;

create or replace function public.enregistrer_mouvement_stock_borne(
  p_entreprise_id uuid,p_code_personnel text,p_code_article text,p_type text,p_quantite numeric,
  p_chantier_id uuid default null,p_code_chantier text default null,p_teinte_id uuid default null,p_motif text default null
) returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare v_uid uuid:=auth.uid();v_employe public.employes;v_article public.articles_stock;v_chantier uuid:=p_chantier_id;v_id uuid;v_echecs int;
begin
  if auth.uid() is not null and auth.role() is distinct from 'anon' and not public.est_membre_actif(p_entreprise_id) then raise exception 'Accès refusé';end if;
  if p_type not in ('entree','sortie') or p_quantite is null or p_quantite<=0 then raise exception 'Mouvement invalide';end if;
  select count(*) into v_echecs from public.tentatives_borne_stock
   where entreprise_id=p_entreprise_id and utilisateur_id is not distinct from v_uid and not reussie and created_at>now()-interval '10 minutes';
  if v_echecs>=8 then raise exception 'Trop de codes erronés. Réessayez dans quelques minutes.';end if;
  select * into v_employe from public.employes
   where entreprise_id=p_entreprise_id and code_stock_active and code_stock_hash is not null
     and crypt(coalesce(p_code_personnel,''),code_stock_hash)=code_stock_hash and statut not in ('sorti','suspendu') limit 1;
  if v_employe.id is null then
    insert into public.tentatives_borne_stock(entreprise_id,utilisateur_id,reussie,motif) values(p_entreprise_id,v_uid,false,'code_personnel_invalide');
    raise exception 'Code personnel invalide';
  end if;
  select a.* into v_article from public.articles_stock a
   left join public.codes_identification c on c.entreprise_id=a.entreprise_id and c.type_ressource='article' and c.ressource_id=a.id and c.actif
   where a.entreprise_id=p_entreprise_id and a.actif and (
     upper(a.reference)=upper(btrim(p_code_article)) or upper(coalesce(a.code_barres,''))=upper(btrim(p_code_article)) or upper(c.code)=upper(btrim(p_code_article))
   ) limit 1;
  if v_article.id is null then raise exception 'Article inconnu ou inactif';end if;
  if nullif(btrim(coalesce(p_code_chantier,'')),'') is not null then
    select ressource_id into v_chantier from public.codes_identification where entreprise_id=p_entreprise_id and type_ressource='chantier' and actif and upper(code)=upper(btrim(p_code_chantier));
  end if;
  if p_type='sortie' and v_chantier is null then raise exception 'Le chantier est obligatoire pour une sortie';end if;
  if v_chantier is not null and not exists(select 1 from public.chantiers where id=v_chantier and entreprise_id=p_entreprise_id) then raise exception 'Chantier invalide';end if;
  insert into public.mouvements_stock(entreprise_id,article_id,chantier_id,teinte_id,type,quantite,date,motif,employe_id,cree_par_utilisateur_id,saisi_via_borne,code_scan_utilise)
  values(p_entreprise_id,v_article.id,v_chantier,p_teinte_id,p_type,p_quantite,current_date,nullif(btrim(p_motif),''),v_employe.id,v_uid,true,upper(btrim(p_code_article))) returning id into v_id;
  insert into public.tentatives_borne_stock(entreprise_id,utilisateur_id,reussie,motif) values(p_entreprise_id,v_uid,true,'mouvement_stock');
  return v_id;
end;$$;

insert into public.permissions_disponibles(cle,module,description) values
 ('utiliser_borne_stock','Stock','Scanner les entrées et sorties avec son code personnel'),
 ('gerer_codes_stock','Stock','Créer les codes personnels et les QR codes internes')
on conflict(cle) do update set module=excluded.module,description=excluded.description;
insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select entreprise_id,id,'utiliser_borne_stock',true from public.postes on conflict do nothing;
insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,'gerer_codes_stock',true from public.postes p
where lower(p.nom) like '%admin%' or lower(p.nom) like '%gérant%' or exists(
  select 1 from public.permissions_poste pp where pp.entreprise_id=p.entreprise_id and pp.poste_id=p.id and pp.cle_permission='gerer_utilisateurs' and pp.autorise
) on conflict do nothing;

alter table public.codes_identification enable row level security;
alter table public.tentatives_borne_stock enable row level security;
create policy codes_identification_membres on public.codes_identification for select to authenticated using(public.est_membre_actif(entreprise_id));
create policy codes_identification_prototype on public.codes_identification for all to anon using(true) with check(true);
create policy tentatives_borne_gestion on public.tentatives_borne_stock for select to authenticated using(public.a_permission(entreprise_id,'gerer_stock'));
create policy tentatives_borne_prototype on public.tentatives_borne_stock for select to anon using(true);

revoke all on function public.code_identification_existe(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.creer_code_identification(uuid,text,uuid) from public;
revoke all on function public.definir_code_stock_employe(uuid,uuid,text,boolean) from public;
revoke all on function public.enregistrer_mouvement_stock_borne(uuid,text,text,text,numeric,uuid,text,uuid,text) from public;
grant select on public.codes_identification to anon,authenticated;
grant select on public.tentatives_borne_stock to anon,authenticated;
grant execute on function public.creer_code_identification(uuid,text,uuid) to anon,authenticated;
grant execute on function public.definir_code_stock_employe(uuid,uuid,text,boolean) to anon,authenticated;
grant execute on function public.enregistrer_mouvement_stock_borne(uuid,text,text,text,numeric,uuid,text,uuid,text) to anon,authenticated;
notify pgrst,'reload schema';
