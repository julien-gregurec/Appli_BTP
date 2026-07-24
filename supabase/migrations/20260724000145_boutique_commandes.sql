-- Commandes boutique : une entreprise cliente achète du matériel Liria (paiement en
-- ligne one-off, hors Stripe Connect qui sert au flux inverse facture->client final).

create table public.boutique_commandes (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  utilisateur_id uuid references auth.users(id) on delete set null,
  statut text not null default 'brouillon'
    check (statut in ('brouillon','en_attente_paiement','payee','annulee','expiree')),
  montant_ht numeric(10,2) not null default 0,
  montant_tva numeric(10,2) not null default 0,
  montant_ttc numeric(10,2) not null default 0,
  nom_destinataire text,
  adresse_livraison text,
  code_postal text,
  ville text,
  telephone text,
  stripe_checkout_id text,
  stripe_checkout_url text,
  stripe_payment_intent_id text,
  lien_paiement_expire_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index boutique_commandes_entreprise_idx on public.boutique_commandes(entreprise_id, created_at desc);
create unique index boutique_commandes_stripe_checkout_idx on public.boutique_commandes(stripe_checkout_id) where stripe_checkout_id is not null;

create table public.boutique_lignes_commande (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.boutique_commandes(id) on delete cascade,
  produit_id uuid not null references public.boutique_produits(id) on delete restrict,
  sku_snapshot text not null,
  nom_snapshot text not null,
  prix_unitaire_ht_snapshot numeric(10,2) not null,
  quantite integer not null check (quantite > 0),
  montant_ht numeric(10,2) not null
);

create index boutique_lignes_commande_commande_idx on public.boutique_lignes_commande(commande_id);

alter table public.boutique_commandes enable row level security;
alter table public.boutique_lignes_commande enable row level security;

create policy boutique_commandes_lecture on public.boutique_commandes
  for select to authenticated
  using (public.est_membre_actif(entreprise_id) or public.est_plateforme_admin());
create policy boutique_commandes_creation on public.boutique_commandes
  for insert to authenticated
  with check (public.a_permission(entreprise_id,'gerer_boutique'));
create policy boutique_commandes_maj on public.boutique_commandes
  for update to authenticated
  using (public.a_permission(entreprise_id,'gerer_boutique'))
  with check (public.a_permission(entreprise_id,'gerer_boutique'));

create policy boutique_lignes_lecture on public.boutique_lignes_commande
  for select to authenticated
  using (exists (
    select 1 from public.boutique_commandes c
    where c.id = commande_id and (public.est_membre_actif(c.entreprise_id) or public.est_plateforme_admin())
  ));
create policy boutique_lignes_creation on public.boutique_lignes_commande
  for insert to authenticated
  with check (exists (
    select 1 from public.boutique_commandes c
    where c.id = commande_id and public.a_permission(c.entreprise_id,'gerer_boutique')
  ));

-- Le mode prototype reste utilisable pour les installations qui l'ont conservé.
create policy boutique_commandes_prototype on public.boutique_commandes
  for all to anon using (true) with check (true);
create policy boutique_lignes_prototype on public.boutique_lignes_commande
  for all to anon using (true) with check (true);

grant select, insert, update on public.boutique_commandes to anon, authenticated;
grant select, insert on public.boutique_lignes_commande to anon, authenticated;

-- Appelée uniquement depuis le webhook Stripe (client admin) après confirmation du
-- paiement : décrémente le stock et clôture la commande. Idempotente si rejouée.
create or replace function public.boutique_finaliser_commande_payee(p_commande_id uuid, p_checkout_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_deja_payee boolean;
begin
  select statut = 'payee' into v_deja_payee
  from public.boutique_commandes
  where id = p_commande_id and stripe_checkout_id = p_checkout_id;
  if v_deja_payee is null or v_deja_payee then return; end if;

  update public.boutique_produits p
  set stock_disponible = greatest(0, p.stock_disponible - l.quantite), updated_at = now()
  from public.boutique_lignes_commande l
  where l.produit_id = p.id and l.commande_id = p_commande_id;

  update public.boutique_commandes set statut = 'payee', updated_at = now() where id = p_commande_id;
end;
$$;

revoke all on function public.boutique_finaliser_commande_payee(uuid,text) from public, anon;
grant execute on function public.boutique_finaliser_commande_payee(uuid,text) to authenticated;

notify pgrst, 'reload schema';
