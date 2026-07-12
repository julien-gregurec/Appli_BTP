-- Zones de dépôt et inventaires de stock atomiques.
create unique index if not exists articles_stock_id_entreprise_unique
  on public.articles_stock(id, entreprise_id);

create table public.zones_depot (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  code text not null check (btrim(code) <> ''),
  nom text not null check (btrim(nom) <> ''),
  type text not null default 'rayonnage' check (type in ('depot','rayonnage','armoire','vehicule','exterieur','autre')),
  description text,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entreprise_id, code),
  unique (id, entreprise_id)
);

alter table public.articles_stock add column zone_id uuid;
alter table public.articles_stock add constraint articles_stock_zone_entreprise_fk
  foreign key (zone_id, entreprise_id) references public.zones_depot(id, entreprise_id) on delete set null (zone_id);
alter table public.outils add column zone_id uuid;
alter table public.outils add constraint outils_zone_entreprise_fk
  foreign key (zone_id, entreprise_id) references public.zones_depot(id, entreprise_id) on delete set null (zone_id);

insert into public.zones_depot(entreprise_id,code,nom,type,description)
select id,'DEPOT-PRINCIPAL','Dépôt principal','depot','Zone créée automatiquement'
from public.entreprises on conflict (entreprise_id,code) do nothing;

create table public.inventaires (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  numero text not null,
  zone_id uuid,
  date_inventaire date not null default current_date,
  statut text not null default 'brouillon' check (statut in ('brouillon','valide','annule')),
  commentaire text,
  valide_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entreprise_id,numero),
  unique (id,entreprise_id),
  foreign key (zone_id,entreprise_id) references public.zones_depot(id,entreprise_id) on delete restrict
);
create or replace function public.trg_inventaire_numero()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.numero is null or btrim(new.numero)='' then
    new.numero:=public.next_reference(new.entreprise_id,'inventaire-'||to_char(new.date_inventaire,'YYYY'),'INV',3,true);
  end if; return new;
end; $$;
create trigger inventaire_numero before insert on public.inventaires for each row execute function public.trg_inventaire_numero();

create table public.lignes_inventaire (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  inventaire_id uuid not null,
  article_id uuid not null,
  quantite_theorique numeric(12,2) not null check (quantite_theorique>=0),
  quantite_comptee numeric(12,2) check (quantite_comptee is null or quantite_comptee>=0),
  created_at timestamptz not null default now(),
  unique (inventaire_id,article_id),
  foreign key (inventaire_id,entreprise_id) references public.inventaires(id,entreprise_id) on delete cascade,
  foreign key (article_id,entreprise_id) references public.articles_stock(id,entreprise_id) on delete restrict
);
create index lignes_inventaire_liste_idx on public.lignes_inventaire(inventaire_id,created_at);

create or replace function public.creer_inventaire_stock(p_entreprise_id uuid,p_zone_id uuid default null,p_commentaire text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_nb int;
begin
  if auth.role() is distinct from 'anon' and not public.est_membre_actif(p_entreprise_id) then raise exception 'Accès refusé'; end if;
  if p_zone_id is not null and not exists(select 1 from public.zones_depot where id=p_zone_id and entreprise_id=p_entreprise_id and actif) then raise exception 'Zone introuvable'; end if;
  insert into public.inventaires(entreprise_id,numero,zone_id,commentaire) values(p_entreprise_id,'',p_zone_id,nullif(btrim(p_commentaire),'')) returning id into v_id;
  insert into public.lignes_inventaire(entreprise_id,inventaire_id,article_id,quantite_theorique)
  select p_entreprise_id,v_id,id,quantite_stock from public.articles_stock
  where entreprise_id=p_entreprise_id and actif and (p_zone_id is null or zone_id=p_zone_id);
  get diagnostics v_nb=row_count;
  if v_nb=0 then raise exception 'Aucun article à inventorier dans cette zone'; end if;
  return v_id;
end; $$;

create or replace function public.enregistrer_comptage_inventaire(p_entreprise_id uuid,p_inventaire_id uuid,p_comptages jsonb,p_valider boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare v_statut text; v_attendu int; v_trouve int; r record;
begin
  if auth.role() is distinct from 'anon' and not public.est_membre_actif(p_entreprise_id) then raise exception 'Accès refusé'; end if;
  select statut into v_statut from public.inventaires where id=p_inventaire_id and entreprise_id=p_entreprise_id for update;
  if not found then raise exception 'Inventaire introuvable'; end if;
  if v_statut<>'brouillon' then raise exception 'Inventaire déjà clôturé'; end if;
  if jsonb_typeof(p_comptages)<>'array' then raise exception 'Comptages invalides'; end if;
  select count(*) into v_attendu from public.lignes_inventaire where inventaire_id=p_inventaire_id;
  select count(*) into v_trouve from jsonb_to_recordset(p_comptages) c(ligne_id uuid,quantite numeric)
    join public.lignes_inventaire l on l.id=c.ligne_id and l.inventaire_id=p_inventaire_id and l.entreprise_id=p_entreprise_id
    where c.quantite>=0;
  if v_trouve<>v_attendu or jsonb_array_length(p_comptages)<>v_attendu then raise exception 'Tous les articles doivent être comptés une seule fois'; end if;
  update public.lignes_inventaire l set quantite_comptee=c.quantite
  from jsonb_to_recordset(p_comptages) c(ligne_id uuid,quantite numeric)
  where l.id=c.ligne_id and l.inventaire_id=p_inventaire_id and l.entreprise_id=p_entreprise_id;
  update public.inventaires set updated_at=now() where id=p_inventaire_id;
  if not p_valider then return; end if;

  perform 1 from public.articles_stock a join public.lignes_inventaire l on l.article_id=a.id
    where l.inventaire_id=p_inventaire_id order by a.id for update of a;
  if exists(select 1 from public.lignes_inventaire l join public.articles_stock a on a.id=l.article_id and a.entreprise_id=l.entreprise_id
    where l.inventaire_id=p_inventaire_id and a.quantite_stock<>l.quantite_theorique) then
    raise exception 'Le stock a changé depuis le début du comptage. Créez un nouvel inventaire';
  end if;
  for r in select l.article_id,l.quantite_theorique,l.quantite_comptee from public.lignes_inventaire l where l.inventaire_id=p_inventaire_id and l.quantite_comptee<>l.quantite_theorique loop
    insert into public.mouvements_stock(entreprise_id,article_id,type,quantite,date,motif)
    values(p_entreprise_id,r.article_id,case when r.quantite_comptee>r.quantite_theorique then 'ajustement_plus' else 'ajustement_moins' end,
      abs(r.quantite_comptee-r.quantite_theorique),current_date,'Validation inventaire '||(select numero from public.inventaires where id=p_inventaire_id));
  end loop;
  update public.inventaires set statut='valide',valide_at=now(),updated_at=now() where id=p_inventaire_id;
end; $$;

alter table public.zones_depot enable row level security;alter table public.inventaires enable row level security;alter table public.lignes_inventaire enable row level security;
create policy zones_depot_membres on public.zones_depot for all to authenticated using(public.est_membre_actif(entreprise_id)) with check(public.est_membre_actif(entreprise_id));
create policy inventaires_membres on public.inventaires for select to authenticated using(public.est_membre_actif(entreprise_id));
create policy lignes_inventaire_membres on public.lignes_inventaire for select to authenticated using(public.est_membre_actif(entreprise_id));
create policy zones_depot_prototype on public.zones_depot for all to anon using(true) with check(true);
create policy inventaires_prototype on public.inventaires for select to anon using(true);
create policy lignes_inventaire_prototype on public.lignes_inventaire for select to anon using(true);
grant select,insert,update on public.zones_depot to anon,authenticated;grant select on public.inventaires,public.lignes_inventaire to anon,authenticated;
grant execute on function public.creer_inventaire_stock(uuid,uuid,text) to anon,authenticated;
grant execute on function public.enregistrer_comptage_inventaire(uuid,uuid,jsonb,boolean) to anon,authenticated;
revoke all on function public.trg_inventaire_numero() from public,anon,authenticated;
notify pgrst,'reload schema';
