-- Catalogue d'articles et mouvements de stock.
create table public.articles_stock (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  reference text not null,
  designation text not null,
  unite text not null default 'u',
  quantite_stock numeric(12,2) not null default 0,
  seuil_alerte numeric(12,2) not null default 0 check (seuil_alerte >= 0),
  prix_achat_ht numeric(12,2) not null default 0 check (prix_achat_ht >= 0),
  emplacement text,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entreprise_id, reference)
);
create table public.mouvements_stock (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  article_id uuid not null references public.articles_stock(id) on delete restrict,
  chantier_id uuid references public.chantiers(id) on delete set null,
  type text not null check (type in ('entree','sortie','ajustement_plus','ajustement_moins')),
  quantite numeric(12,2) not null check (quantite > 0),
  date date not null default current_date,
  motif text,
  created_at timestamptz not null default now()
);
create index mouvements_stock_article_date_idx on public.mouvements_stock(article_id, date desc);

create or replace function public.appliquer_mouvement_stock()
returns trigger language plpgsql set search_path = public as $$
declare v_stock numeric; v_delta numeric;
begin
  if not exists (select 1 from public.articles_stock where id = new.article_id and entreprise_id = new.entreprise_id) then raise exception 'Article incompatible'; end if;
  if new.chantier_id is not null and not exists (select 1 from public.chantiers where id = new.chantier_id and entreprise_id = new.entreprise_id) then raise exception 'Chantier incompatible'; end if;
  v_delta := case when new.type in ('entree','ajustement_plus') then new.quantite else -new.quantite end;
  select quantite_stock into v_stock from public.articles_stock where id = new.article_id for update;
  if v_stock + v_delta < 0 then raise exception 'Stock insuffisant'; end if;
  update public.articles_stock set quantite_stock = quantite_stock + v_delta, updated_at = now() where id = new.article_id;
  return new;
end; $$;
create trigger appliquer_mouvement_avant_insertion before insert on public.mouvements_stock for each row execute function public.appliquer_mouvement_stock();

alter table public.articles_stock enable row level security;
alter table public.mouvements_stock enable row level security;
create policy "membres articles stock" on public.articles_stock for all using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));
create policy "membres mouvements stock" on public.mouvements_stock for all using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));
create policy "prototype articles stock" on public.articles_stock for all to anon using (true) with check (true);
create policy "prototype mouvements stock" on public.mouvements_stock for all to anon using (true) with check (true);
grant select, insert, update, delete on public.articles_stock to anon, authenticated;
grant select, insert on public.mouvements_stock to anon, authenticated;
notify pgrst, 'reload schema';
