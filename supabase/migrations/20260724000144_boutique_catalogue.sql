-- Boutique Liria : catalogue de matériel vendu directement par la plateforme à ses
-- entreprises clientes (imprimantes codes-barres/QR, plastifieuses et consommables,
-- étiquettes aimantées). Catalogue propriété de Liria, pas une donnée par entreprise :
-- la lecture est ouverte à tout compte actif, l'écriture réservée à un admin plateforme.

create table public.boutique_produits (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  nom text not null,
  description text,
  categorie text not null check (categorie in ('imprimante_code_barres','plastifieuse','consommable_plastification','etiquette_aimantee')),
  prix_ht numeric(10,2) not null check (prix_ht >= 0),
  taux_tva numeric(4,3) not null default 0.20,
  image_url text,
  stock_disponible integer not null default 0 check (stock_disponible >= 0),
  seuil_alerte_stock integer not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index boutique_produits_categorie_idx on public.boutique_produits(categorie) where actif;

alter table public.boutique_produits enable row level security;

create policy boutique_produits_lecture on public.boutique_produits
  for select to authenticated
  using (actif or public.est_plateforme_admin());

create policy boutique_produits_gestion on public.boutique_produits
  for all to authenticated
  using (public.est_plateforme_admin())
  with check (public.est_plateforme_admin());

-- Le mode prototype reste utilisable pour les installations qui l'ont conservé.
create policy boutique_produits_prototype on public.boutique_produits
  for all to anon using (true) with check (true);

grant select, insert, update, delete on public.boutique_produits to anon, authenticated;

insert into public.permissions_disponibles(cle,module,description) values
  ('acces_boutique','Boutique','Parcourir la boutique de matériel Liria'),
  ('gerer_boutique','Boutique','Commander du matériel dans la boutique Liria')
on conflict(cle) do update set module=excluded.module,description=excluded.description;

-- Reprend les droits d'achat existants : qui pouvait déjà voir/gérer les achats
-- fournisseurs peut aussi parcourir/commander dans la boutique Liria.
insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select entreprise_id,poste_id,'acces_boutique',true
from public.permissions_poste where cle_permission='acces_achats' and autorise
on conflict(entreprise_id,poste_id,cle_permission) do nothing;

insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select entreprise_id,poste_id,'gerer_boutique',true
from public.permissions_poste where cle_permission='gerer_achats' and autorise
on conflict(entreprise_id,poste_id,cle_permission) do nothing;

notify pgrst, 'reload schema';
