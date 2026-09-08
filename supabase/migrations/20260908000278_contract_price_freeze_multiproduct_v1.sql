-- ELSATIA-CONTRACT-PRICE-FREEZE-MULTIPRODUCT-V1
--
-- FIGEMENT DU PRIX CONTRACTUEL, et socle multiproduit rétrocompatible.
--
-- POURQUOI CETTE MIGRATION EXISTE
--
-- Jusqu'ici, ce qu'une entreprise paie était RECALCULÉ depuis le catalogue
-- courant : `abonnements_entreprises` porte un `code_offre`, une `periodicite`
-- et un `prix_contractuel_ht`, mais rien qui dise sous QUELLE grille le contrat
-- a été souscrit, quels modules y étaient inclus, combien de comptes et de quel
-- rôle, ni quelle remise s'y applique et jusqu'à quand. Conséquence directe :
-- publier une nouvelle grille déplaçait ce que payaient les clients déjà
-- signés, et corriger un ancien seed réécrivait leur prix sans trace.
--
-- Le Train V3 rend cela impossible. Un contrat est désormais un CONSTAT daté :
-- il conserve ses propres montants, sa propre génération tarifaire et son propre
-- Price Stripe. Le catalogue courant ne sert qu'à établir des contrats NOUVEAUX.
--
-- Cette migration doit précéder toute correction d'ancien seed et tout
-- repointage Stripe : sans elle, ces opérations écrasent des prix souscrits.
--
-- SOCLE MULTIPRODUIT (rétrocompatible)
--
-- `abonnements_entreprises.entreprise_id` est UNIQUE : une entreprise ne peut y
-- porter qu'un seul abonnement, ce qui interdit de vendre Tools, Colors ou
-- Réserves à un client de Gestion Pro. Cette contrainte n'est PAS retirée ici :
-- la table reste la source de vérité de l'abonnement Gestion Pro et de sa saga
-- Stripe, et y toucher casserait les abonnements en cours.
--
-- Le multiproduit est ouvert à côté, par la clé (entreprise, produit) de
-- `contrats_abonnement`. Une entreprise peut donc porter autant de contrats que
-- de produits ELSATIA, chacun avec sa génération tarifaire, sa périodicité, ses
-- modules, ses remises et son Price. La bascule complète de la facturation vers
-- ce modèle — Stripe, factures, portail client — reste un lot à part entière,
-- documenté dans le rapport du train : ce fichier n'en pose que le socle.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Générations tarifaires — ce qui est vendable, et ce qui ne l'est plus
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.generations_tarifaires (
  cle text primary key check (cle ~ '^[A-Z0-9][A-Z0-9-]{2,63}$'),
  produit text not null references public.applications_elsatia(code) on delete restrict,
  libelle text not null check (btrim(libelle) <> ''),
  -- Une génération VENDABLE peut fonder un contrat nouveau. Une génération
  -- retirée reste connue, lisible et facturable pour les contrats qui en
  -- relèvent : elle n'est jamais supprimée, seulement fermée à la vente.
  vendable boolean not null default false,
  motif_retrait text,
  ouverte_le date not null default current_date,
  fermee_le date,
  created_at timestamptz not null default now(),
  check (fermee_le is null or fermee_le >= ouverte_le),
  check (vendable or motif_retrait is not null)
);

comment on table public.generations_tarifaires is
  'Générations de grille tarifaire par produit. Une génération retirée reste connue et facturable pour les contrats souscrits sous elle, mais ne peut plus en fonder un nouveau.';

alter table public.generations_tarifaires enable row level security;
alter table public.generations_tarifaires force row level security;

drop policy if exists generations_tarifaires_lecture on public.generations_tarifaires;
create policy generations_tarifaires_lecture on public.generations_tarifaires
  for select to authenticated using (true);

revoke all on table public.generations_tarifaires from anon, authenticated, service_role;
grant select on table public.generations_tarifaires to authenticated;

insert into public.generations_tarifaires (cle, produit, libelle, vendable, motif_retrait)
values
  ('CANONICAL-V4-2026-09', 'gestion_pro', 'Grille Gestion Pro V4 — comptes par rôle, annuel ×10', true, null),
  ('CANONICAL-V3-2026-09', 'gestion_pro', 'Grille Gestion Pro V3 — comptes par forfait', false,
   'Le prix du compte supplémentaire dépendait du forfait souscrit et non du rôle réel du compte.'),
  ('COMPTES-PAR-ROLE-2026-09', 'gestion_pro', 'Comptes supplémentaires — par rôle', true, null),
  ('COMPTES-PAR-FORFAIT-2026-07', 'gestion_pro', 'Comptes supplémentaires — par forfait souscrit', false,
   'Génération remplacée par la tarification au rôle du compte.')
on conflict (cle) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Le contrat : un constat daté, jamais un calcul
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.contrats_abonnement (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  produit text not null references public.applications_elsatia(code) on delete restrict,
  generation text not null references public.generations_tarifaires(cle) on delete restrict,

  forfait text not null check (btrim(forfait) <> ''),
  periodicite text not null check (periodicite in ('mensuel','annuel')),
  devise text not null default 'eur' check (devise = 'eur'),
  quantite integer not null default 1 check (quantite >= 1),

  -- Comptes souscrits, par rôle. Figés : le nombre comme le prix unitaire.
  comptes_par_role jsonb not null default '{}'::jsonb,
  -- Modules INCLUS dans le forfait (jamais facturés) et modules FACTURÉS en sus.
  -- La distinction est portée par le contrat lui-même : c'est elle qui garantit
  -- qu'un module inclus n'est pas facturé une seconde fois.
  modules_inclus text[] not null default '{}',
  modules_factures jsonb not null default '{}'::jsonb,

  -- Prix unitaires HT figés au moment de la souscription, en centimes.
  prix_unitaires_ht jsonb not null default '{}'::jsonb,
  prix_forfait_ht_centimes integer not null check (prix_forfait_ht_centimes >= 0),
  total_avant_remise_ht_centimes integer not null check (total_avant_remise_ht_centimes >= 0),
  total_apres_remise_ht_centimes integer not null check (total_apres_remise_ht_centimes >= 0),

  -- Remise appliquée au contrat.
  remise_type text check (remise_type in ('pourcentage','montant','prix_negocie')),
  remise_valeur numeric(12,2) check (remise_valeur is null or remise_valeur >= 0),
  remise_debut date,
  remise_fin date,
  remise_a_vie boolean not null default false,
  remise_motif text,

  -- Price Stripe RÉELLEMENT souscrit. Le renouvellement le conserve : il n'est
  -- jamais réélu depuis le catalogue courant.
  stripe_price_id text,
  stripe_subscription_id text,

  date_effet date not null default current_date,
  date_fin date,
  provenance text not null default 'plateforme'
    check (provenance in ('plateforme','checkout','reprise','migration','import')),
  auteur uuid references auth.users(id),
  actif boolean not null default true,
  created_at timestamptz not null default now(),

  check (total_apres_remise_ht_centimes <= total_avant_remise_ht_centimes),
  check (remise_fin is null or remise_debut is null or remise_fin >= remise_debut),
  -- Une remise à vie n'a pas de fin : les deux ensemble seraient contradictoires.
  check (not remise_a_vie or remise_fin is null),
  check (date_fin is null or date_fin >= date_effet)
);

-- Le socle multiproduit tient dans cet index : UN contrat actif par produit et
-- par entreprise, et non un seul abonnement par entreprise tous produits confondus.
create unique index if not exists contrats_abonnement_actif_par_produit_idx
  on public.contrats_abonnement (entreprise_id, produit)
  where actif;

create index if not exists contrats_abonnement_entreprise_idx
  on public.contrats_abonnement (entreprise_id, date_effet desc);
create index if not exists contrats_abonnement_generation_idx
  on public.contrats_abonnement (generation);
create index if not exists contrats_abonnement_stripe_price_idx
  on public.contrats_abonnement (stripe_price_id) where stripe_price_id is not null;

comment on table public.contrats_abonnement is
  'Conditions SOUSCRITES par une entreprise pour un produit. Figées : ni le catalogue courant ni une nouvelle grille ne les recalculent.';

alter table public.contrats_abonnement enable row level security;
alter table public.contrats_abonnement force row level security;

-- Une entreprise lit ses propres contrats ; la plateforme les lit tous.
drop policy if exists contrats_abonnement_lecture on public.contrats_abonnement;
create policy contrats_abonnement_lecture on public.contrats_abonnement
  for select to authenticated
  using (public.est_membre_actif(entreprise_id) or public.est_plateforme_admin());

revoke all on table public.contrats_abonnement from anon, authenticated, service_role;
grant select on table public.contrats_abonnement to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Historique append-only : un snapshot n'est jamais réécrit silencieusement
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.historique_contrats_abonnement (
  id uuid primary key default gen_random_uuid(),
  contrat_id uuid not null references public.contrats_abonnement(id) on delete cascade,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  action text not null check (action in ('creation','modification','remise','revocation_remise','renouvellement','resiliation','reprise','migration')),
  snapshot jsonb not null,
  motif text,
  auteur uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists historique_contrats_contrat_idx
  on public.historique_contrats_abonnement (contrat_id, created_at desc);
create index if not exists historique_contrats_entreprise_idx
  on public.historique_contrats_abonnement (entreprise_id, created_at desc);

alter table public.historique_contrats_abonnement enable row level security;
alter table public.historique_contrats_abonnement force row level security;

drop policy if exists historique_contrats_lecture on public.historique_contrats_abonnement;
create policy historique_contrats_lecture on public.historique_contrats_abonnement
  for select to authenticated
  using (public.est_membre_actif(entreprise_id) or public.est_plateforme_admin());

revoke all on table public.historique_contrats_abonnement from anon, authenticated, service_role;
grant select on table public.historique_contrats_abonnement to authenticated;

create or replace function public.historique_contrats_append_only()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Historique de contrat append-only : ni modification ni suppression (%).', tg_op;
end;
$$;

drop trigger if exists historique_contrats_append_only_trg on public.historique_contrats_abonnement;
create trigger historique_contrats_append_only_trg
  before update or delete on public.historique_contrats_abonnement
  for each row execute function public.historique_contrats_append_only();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Garde-fous du figement
-- ─────────────────────────────────────────────────────────────────────────────

-- (a) Un contrat NOUVEAU ne peut relever que d'une génération vendable ; un
--     contrat déjà écrit garde la sienne, même retirée depuis.
create or replace function public.contrat_generation_vendable()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_vendable boolean; v_produit text;
begin
  select vendable, produit into v_vendable, v_produit
  from public.generations_tarifaires where cle = new.generation;

  if v_vendable is null then
    raise exception 'Génération tarifaire inconnue : %.', new.generation;
  end if;
  if v_produit <> new.produit then
    raise exception 'La génération % appartient au produit %, pas à %.', new.generation, v_produit, new.produit;
  end if;
  if not v_vendable and new.provenance in ('plateforme','checkout') then
    raise exception 'La génération % est retirée de la vente : elle ne peut pas fonder un contrat nouveau. Reprise d''un contrat existant : utiliser provenance « reprise » ou « migration ».', new.generation;
  end if;
  return new;
end;
$$;

drop trigger if exists contrat_generation_vendable_trg on public.contrats_abonnement;
create trigger contrat_generation_vendable_trg
  before insert on public.contrats_abonnement
  for each row execute function public.contrat_generation_vendable();

-- (b) Les montants souscrits et la génération ne se modifient pas en place.
--     Changer les conditions, c'est écrire un NOUVEAU contrat — l'ancien reste
--     lisible, daté, et sa trace demeure. Seuls l'état d'activité, la date de
--     fin et la référence d'abonnement Stripe peuvent bouger sur place.
create or replace function public.contrat_montants_figes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.generation is distinct from old.generation
     or new.produit is distinct from old.produit
     or new.forfait is distinct from old.forfait
     or new.periodicite is distinct from old.periodicite
     or new.devise is distinct from old.devise
     or new.quantite is distinct from old.quantite
     or new.comptes_par_role is distinct from old.comptes_par_role
     or new.modules_inclus is distinct from old.modules_inclus
     or new.modules_factures is distinct from old.modules_factures
     or new.prix_unitaires_ht is distinct from old.prix_unitaires_ht
     or new.prix_forfait_ht_centimes is distinct from old.prix_forfait_ht_centimes
     or new.total_avant_remise_ht_centimes is distinct from old.total_avant_remise_ht_centimes
     or new.total_apres_remise_ht_centimes is distinct from old.total_apres_remise_ht_centimes
     or new.stripe_price_id is distinct from old.stripe_price_id
     or new.date_effet is distinct from old.date_effet
  then
    raise exception 'Conditions souscrites figées : elles ne se réécrivent pas en place. Écrire un nouveau contrat et clore celui-ci.';
  end if;
  return new;
end;
$$;

drop trigger if exists contrat_montants_figes_trg on public.contrats_abonnement;
create trigger contrat_montants_figes_trg
  before update on public.contrats_abonnement
  for each row execute function public.contrat_montants_figes();

-- (c) Un contrat ne se supprime pas : il se clôt. Sans quoi l'historique
--     porterait des lignes dont le contrat a disparu.
create or replace function public.contrat_pas_de_suppression()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Un contrat ne se supprime pas : le clore par actif = false et date_fin.';
end;
$$;

drop trigger if exists contrat_pas_de_suppression_trg on public.contrats_abonnement;
create trigger contrat_pas_de_suppression_trg
  before delete on public.contrats_abonnement
  for each row execute function public.contrat_pas_de_suppression();

-- (d) Tout écrit sur un contrat laisse une trace, sans que l'appelant ait à y penser.
create or replace function public.contrat_journaliser()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.historique_contrats_abonnement (contrat_id, entreprise_id, action, snapshot, auteur)
  values (
    new.id, new.entreprise_id,
    case
      when tg_op = 'INSERT' and new.provenance in ('reprise','migration') then new.provenance
      when tg_op = 'INSERT' then 'creation'
      when not new.actif and old.actif then 'resiliation'
      else 'modification'
    end,
    to_jsonb(new), new.auteur
  );
  return new;
end;
$$;

drop trigger if exists contrat_journaliser_trg on public.contrats_abonnement;
create trigger contrat_journaliser_trg
  after insert or update on public.contrats_abonnement
  for each row execute function public.contrat_journaliser();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Lecture du prix contractuel
-- ─────────────────────────────────────────────────────────────────────────────

-- Le prix qu'une entreprise paie pour un produit vient de SON contrat, jamais du
-- catalogue. Si aucun contrat n'existe encore, la fonction renvoie NULL plutôt
-- qu'un prix de catalogue : un prix inventé serait pire qu'une absence de prix.
create or replace function public.prix_contractuel_courant(
  p_entreprise_id uuid,
  p_produit text default 'gestion_pro'
)
returns table (
  contrat_id uuid,
  generation text,
  forfait text,
  periodicite text,
  total_avant_remise_ht_centimes integer,
  total_apres_remise_ht_centimes integer,
  remise_type text,
  remise_fin date,
  remise_a_vie boolean,
  stripe_price_id text,
  date_effet date
)
language sql
security definer
stable
set search_path = public
as $$
  select c.id, c.generation, c.forfait, c.periodicite,
         c.total_avant_remise_ht_centimes, c.total_apres_remise_ht_centimes,
         c.remise_type, c.remise_fin, c.remise_a_vie, c.stripe_price_id, c.date_effet
  from public.contrats_abonnement c
  where c.entreprise_id = p_entreprise_id
    and c.produit = p_produit
    and c.actif
    and (public.est_membre_actif(p_entreprise_id) or public.est_plateforme_admin())
  order by c.date_effet desc
  limit 1;
$$;

revoke all on function public.prix_contractuel_courant(uuid, text) from public, anon;
grant execute on function public.prix_contractuel_courant(uuid, text) to authenticated;

commit;
