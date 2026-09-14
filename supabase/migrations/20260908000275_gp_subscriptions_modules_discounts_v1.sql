-- ELSATIA-GP-SUBSCRIPTIONS-MODULES-DISCOUNTS-CANONICAL-V1
--
-- Prix des modules, remises commerciales et historique append-only.
--
-- PROVENANCE. Le contenu métier vient de la proposition
-- `docs/migrations-proposees/gp-subscriptions-modules-discounts-v1.sql.proposed`,
-- écrite par le lot du moteur commercial Gestion Pro et délibérément laissée
-- hors de `supabase/migrations/` : un train global était alors en cours, et
-- réserver un numéro à ce moment-là serait entré en collision avec lui. Le
-- Train V3 reprend ce contenu, le numérote à la suite réelle du ledger (274) et
-- le corrige sur un point tarifaire (§5 ci-dessous).
--
-- CONTRE-AUDIT DE REPRISE. Les dépendances annoncées ont été vérifiées contre le
-- ledger du train et non contre la base d'origine :
--   • `plateforme_autoriser_effet_externe(text)` existe (garde AAL2 + journal) ;
--   • `est_plateforme_admin()` et `est_membre_actif()` existent ;
--   • les six codes de modules seedés existent tous dans `modules_gestion_pro`
--     (migration 00257) — la clé étrangère est donc satisfaite ;
--   • aucune fonction redéfinie ici n'est redéfinie plus tard dans le ledger.
--
-- Ce que cette migration NE fait PAS : elle ne crée aucun Price Stripe, ne
-- touche ni à Stripe Live ni aux endpoints, et ne modifie aucune migration déjà
-- canonique. Les colonnes `entreprises.remise_*` restent en place : la table
-- `remises_commerciales` devient la source de vérité, les colonnes deviennent un
-- cache d'affichage.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Prix des modules (par module × forfait). Versionné, jamais écrasé.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.modules_gestion_pro_tarifs (
  id uuid primary key default gen_random_uuid(),
  module_code text not null references public.modules_gestion_pro(code) on delete restrict,
  -- Forfait de DÉPART sur lequel ce prix à la carte s'applique.
  forfait text not null check (forfait in ('mini','pro','business','entreprise')),
  prix_mensuel_centimes integer not null check (prix_mensuel_centimes >= 0),
  -- Multiplicateur annuel de la ligne. 10 = « deux mois offerts » (règle du
  -- forfait). Explicite pour ne jamais reproduire la divergence ×10/×12
  -- constatée entre `tarification.calculerTarifAbonnement` et
  -- `plateforme.prixAbonnementMensuel`.
  multiplicateur_annuel integer not null default 10 check (multiplicateur_annuel between 1 and 12),
  devise text not null default 'eur' check (devise = 'eur'),
  -- Statut commercial du montant : rien ne doit être vendu tant qu'il n'est pas
  -- 'valide'. Voir `src/lib/commercial/catalogue.ts`.
  statut_prix text not null default 'provisoire'
    check (statut_prix in ('valide','recommande','provisoire','divergent','a_definir')),
  -- Identifiants Price Stripe. Aucun Price n'existe aujourd'hui pour un module.
  stripe_price_mensuel_id text,
  stripe_price_annuel_id text,
  valide_du date not null default current_date,
  valide_jusqu date,
  motif text,
  cree_par uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (valide_jusqu is null or valide_jusqu > valide_du)
);

-- Un seul tarif en vigueur par module × forfait à une date donnée.
create unique index if not exists modules_gestion_pro_tarifs_actif_idx
  on public.modules_gestion_pro_tarifs(module_code, forfait)
  where valide_jusqu is null;

alter table public.modules_gestion_pro_tarifs enable row level security;
alter table public.modules_gestion_pro_tarifs force row level security;

-- Lecture ouverte aux comptes authentifiés (c'est un tarif public), écriture
-- exclusivement par RPC plateforme.
drop policy if exists modules_tarifs_lecture on public.modules_gestion_pro_tarifs;
create policy modules_tarifs_lecture on public.modules_gestion_pro_tarifs
  for select to authenticated using (true);

revoke all on table public.modules_gestion_pro_tarifs from anon, authenticated, service_role;
grant select on table public.modules_gestion_pro_tarifs to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Remises commerciales individuelles
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.remises_commerciales (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,

  -- §8 — type
  --   pourcentage   : suit le tarif public.
  --   montant       : somme fixe déduite.
  --   prix_negocie  : prix FINAL figé du périmètre, insensible au tarif public.
  type text not null check (type in ('pourcentage','montant','prix_negocie')),
  -- pourcentage : 0 < valeur <= 100 (unité : pourcent).
  -- montant / prix_negocie : entier de CENTIMES HT.
  valeur numeric not null check (valeur >= 0),

  -- §8 — périmètre
  perimetre_cible text not null
    check (perimetre_cible in ('abonnement','forfait','comptes','modules','stockage','ia','mise_en_service','prestation')),
  -- Restreint `modules` / `prestation` à ces clés commerciales. Vide = toutes.
  perimetre_cles text[] not null default '{}',

  -- §8 — durée
  duree_mode text not null
    check (duree_mode in ('une_echeance','nb_echeances','dates','jusqu_a_revocation','permanente')),
  date_debut date not null,
  -- Renseigné pour 'dates'. NULL pour les modes sans terme ; calculé à la
  -- lecture pour 'une_echeance'/'nb_echeances' (dépend de la périodicité).
  date_fin date,
  nb_echeances integer check (nb_echeances is null or nb_echeances >= 1),
  -- §11 — sur un abonnement annuel, une durée en échéances vaut des ANNÉES.
  -- L'administrateur doit l'avoir confirmé explicitement.
  ambiguite_annuelle_confirmee boolean not null default false,

  -- §8 — état
  etat text not null default 'programmee'
    check (etat in ('programmee','active','expiree','revoquee','remplacee','annulee')),

  -- §12 — cumul
  cumul_autorise boolean not null default false,
  priorite integer not null default 100,

  -- §13/§14 — traçabilité
  motif text not null check (length(btrim(motif)) >= 5),
  cree_par uuid references auth.users(id),
  seconde_confirmation boolean not null default false,
  validation_second_admin_par uuid references auth.users(id),
  revoquee_le timestamptz,
  revoquee_par uuid references auth.users(id),
  remplacee_par_id uuid references public.remises_commerciales(id),

  -- Prix public et prix résultant au moment de la décision (photo, non recalculée).
  tarif_public_centimes integer,
  prix_resultant_centimes integer,

  -- Représentation Stripe (Test ou Live selon l'environnement ; jamais affiché entier).
  stripe_coupon_id text,
  stripe_price_dedie_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint remises_pourcentage_borne
    check (type <> 'pourcentage' or (valeur > 0 and valeur <= 100)),
  constraint remises_montant_positif
    check (type <> 'montant' or valeur > 0),
  constraint remises_dates_coherentes
    check (duree_mode <> 'dates' or (date_fin is not null and date_fin > date_debut)),
  constraint remises_nb_echeances_present
    check (duree_mode <> 'nb_echeances' or nb_echeances is not null),
  -- Une remise sans terme ou un prix négocié exigent la seconde confirmation (§13).
  constraint remises_confirmation_renforcee
    check (
      seconde_confirmation
      or (duree_mode not in ('permanente','jusqu_a_revocation') and type <> 'prix_negocie')
    )
);

create index if not exists remises_commerciales_entreprise_idx
  on public.remises_commerciales(entreprise_id, etat, date_debut desc);

-- §12 — au plus UNE remise non terminale par périmètre exact tant que le cumul
-- n'est pas explicitement autorisé. Le recouvrement partiel (abonnement vs
-- forfait, listes de modules qui se croisent) est vérifié par la RPC, qui a
-- accès à la sémantique complète.
create unique index if not exists remises_commerciales_unicite_perimetre_idx
  on public.remises_commerciales(entreprise_id, perimetre_cible, perimetre_cles)
  where etat in ('programmee','active') and not cumul_autorise;

alter table public.remises_commerciales enable row level security;
alter table public.remises_commerciales force row level security;

-- Le client voit ses remises (il paie le résultat) mais JAMAIS le motif interne :
-- la lecture client passe par la vue `mes_remises_visibles` ci-dessous, jamais
-- par la table. Aucune écriture directe n'est accordée à qui que ce soit.
drop policy if exists remises_commerciales_lecture on public.remises_commerciales;
create policy remises_commerciales_lecture on public.remises_commerciales
  for select using (public.est_plateforme_admin());

revoke all on table public.remises_commerciales from anon, authenticated, service_role;
grant select on table public.remises_commerciales to authenticated;

-- Vue client : le strict nécessaire pour comprendre sa facture. Ni motif,
-- ni auteur, ni identifiant Stripe.
create or replace view public.mes_remises_visibles
with (security_invoker = true) as
select r.id, r.entreprise_id, r.type, r.valeur,
       r.perimetre_cible, r.perimetre_cles,
       r.duree_mode, r.date_debut, r.date_fin, r.nb_echeances,
       r.etat, r.prix_resultant_centimes, r.created_at
from public.remises_commerciales r
where public.est_membre_actif(r.entreprise_id);

grant select on public.mes_remises_visibles to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Historique append-only (§14)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.historique_remises_commerciales (
  id uuid primary key default gen_random_uuid(),
  remise_id uuid not null references public.remises_commerciales(id) on delete cascade,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  action text not null
    check (action in ('creation','activation','expiration','revocation','remplacement','annulation','synchronisation_stripe')),
  ancien jsonb,
  nouveau jsonb,
  forfait text,
  modules text[],
  tarif_public_centimes integer,
  ancien_prix_centimes integer,
  nouveau_prix_centimes integer,
  impact_estime_centimes integer,
  acteur_id uuid references auth.users(id),
  motif text,
  -- Identifiant Stripe MASQUÉ (`sub_…4D5E`), jamais l'identifiant complet.
  reference_stripe_masquee text,
  factures_concernees text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists historique_remises_idx
  on public.historique_remises_commerciales(entreprise_id, created_at desc);

alter table public.historique_remises_commerciales enable row level security;
alter table public.historique_remises_commerciales force row level security;

drop policy if exists historique_remises_lecture on public.historique_remises_commerciales;
create policy historique_remises_lecture on public.historique_remises_commerciales
  for select using (public.est_plateforme_admin());

revoke all on table public.historique_remises_commerciales from anon, authenticated, service_role;
grant select on table public.historique_remises_commerciales to authenticated;

-- Immuabilité : aucune ligne d'historique ne peut être modifiée ni supprimée,
-- même par un administrateur plateforme.
create or replace function public.historique_remises_immuable()
returns trigger language plpgsql as $$
begin
  raise exception 'Historique de remise immuable';
end;
$$;

drop trigger if exists historique_remises_pas_de_update on public.historique_remises_commerciales;
create trigger historique_remises_pas_de_update
  before update or delete on public.historique_remises_commerciales
  for each row execute function public.historique_remises_immuable();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Écriture — exclusivement par RPC plateforme, AAL2 exigée
-- ─────────────────────────────────────────────────────────────────────────────

-- Détecte un recouvrement de périmètre avec une remise déjà en vigueur.
-- Sémantique alignée sur `perimetresSeRecouvrent` (src/lib/commercial/remises.ts).
create or replace function public.remise_perimetre_recouvre(
  p_cible_a text, p_cles_a text[], p_cible_b text, p_cles_b text[]
)
returns boolean language sql immutable as $$
  select case
    when p_cible_a = 'abonnement' or p_cible_b = 'abonnement'
      then coalesce(p_cible_a, '') not in ('mise_en_service','prestation')
       and coalesce(p_cible_b, '') not in ('mise_en_service','prestation')
    when p_cible_a <> p_cible_b then false
    when p_cible_a in ('modules','prestation')
      then cardinality(p_cles_a) = 0 or cardinality(p_cles_b) = 0 or (p_cles_a && p_cles_b)
    else true
  end;
$$;

create or replace function public.plateforme_creer_remise(
  p_entreprise_id uuid,
  p_type text,
  p_valeur numeric,
  p_perimetre_cible text,
  p_perimetre_cles text[],
  p_duree_mode text,
  p_date_debut date,
  p_date_fin date,
  p_nb_echeances integer,
  p_motif text,
  p_cumul_autorise boolean default false,
  p_seconde_confirmation boolean default false,
  p_ambiguite_annuelle_confirmee boolean default false,
  p_tarif_public_centimes integer default null,
  p_prix_resultant_centimes integer default null
)
returns public.remises_commerciales
language plpgsql security definer set search_path = public as $$
declare
  v_remise public.remises_commerciales;
  v_conflit uuid;
  v_periodicite text;
begin
  if not public.est_plateforme_admin() then
    raise exception 'Accès réservé à la plateforme';
  end if;
  -- Garde AAL2 EXPLICITE. `plateforme_autoriser_effet_externe` l'exige déjà, mais
  -- par indirection : l'invariant du dépôt — « aucune mutation plateforme sans AAL2 »
  -- — se vérifie en lisant le corps des fonctions, et une protection qu'on ne voit
  -- qu'en dépliant un appel n'est pas une protection lisible. L'appel est idempotent :
  -- il lève ou ne fait rien, et ne change aucun comportement.
  perform public.plateforme_exiger_session_aal2();
  perform public.plateforme_autoriser_effet_externe('remise_abonnement');

  select abonnement_periodicite into v_periodicite from public.entreprises where id = p_entreprise_id;

  -- §11 — pas d'interprétation implicite d'une durée en échéances sur l'annuel.
  if v_periodicite = 'annuel'
     and p_duree_mode in ('une_echeance','nb_echeances')
     and not p_ambiguite_annuelle_confirmee then
    raise exception 'Durée ambiguë sur un abonnement annuel : confirmer que les échéances valent des années, ou utiliser des dates explicites';
  end if;

  -- §12 — aucun cumul silencieux. Un prix négocié est toujours exclusif.
  select r.id into v_conflit
  from public.remises_commerciales r
  where r.entreprise_id = p_entreprise_id
    and r.etat in ('programmee','active')
    and public.remise_perimetre_recouvre(r.perimetre_cible, r.perimetre_cles, p_perimetre_cible, p_perimetre_cles)
    and (
      r.type = 'prix_negocie' or p_type = 'prix_negocie'
      or not (r.cumul_autorise and p_cumul_autorise)
    )
  limit 1;

  if v_conflit is not null then
    raise exception 'Conflit de périmètre avec la remise % : le cumul doit être autorisé des deux côtés, et un prix négocié reste exclusif', v_conflit;
  end if;

  insert into public.remises_commerciales(
    entreprise_id, type, valeur, perimetre_cible, perimetre_cles,
    duree_mode, date_debut, date_fin, nb_echeances, ambiguite_annuelle_confirmee,
    etat, cumul_autorise, motif, cree_par, seconde_confirmation,
    tarif_public_centimes, prix_resultant_centimes
  ) values (
    p_entreprise_id, p_type, p_valeur, p_perimetre_cible, coalesce(p_perimetre_cles, '{}'),
    p_duree_mode, p_date_debut, p_date_fin, p_nb_echeances, p_ambiguite_annuelle_confirmee,
    case when p_date_debut > current_date then 'programmee' else 'active' end,
    p_cumul_autorise, p_motif, auth.uid(), p_seconde_confirmation,
    p_tarif_public_centimes, p_prix_resultant_centimes
  ) returning * into v_remise;

  insert into public.historique_remises_commerciales(
    remise_id, entreprise_id, action, nouveau, tarif_public_centimes,
    ancien_prix_centimes, nouveau_prix_centimes, impact_estime_centimes, acteur_id, motif
  ) values (
    v_remise.id, p_entreprise_id, 'creation', to_jsonb(v_remise), p_tarif_public_centimes,
    p_tarif_public_centimes, p_prix_resultant_centimes,
    coalesce(p_tarif_public_centimes, 0) - coalesce(p_prix_resultant_centimes, 0),
    auth.uid(), p_motif
  );

  return v_remise;
end;
$$;

create or replace function public.plateforme_revoquer_remise(p_remise_id uuid, p_motif text)
returns public.remises_commerciales
language plpgsql security definer set search_path = public as $$
declare
  v_avant public.remises_commerciales;
  v_apres public.remises_commerciales;
begin
  if not public.est_plateforme_admin() then
    raise exception 'Accès réservé à la plateforme';
  end if;
  -- Garde AAL2 EXPLICITE. `plateforme_autoriser_effet_externe` l'exige déjà, mais
  -- par indirection : l'invariant du dépôt — « aucune mutation plateforme sans AAL2 »
  -- — se vérifie en lisant le corps des fonctions, et une protection qu'on ne voit
  -- qu'en dépliant un appel n'est pas une protection lisible. L'appel est idempotent :
  -- il lève ou ne fait rien, et ne change aucun comportement.
  perform public.plateforme_exiger_session_aal2();
  perform public.plateforme_autoriser_effet_externe('remise_abonnement');

  select * into v_avant from public.remises_commerciales where id = p_remise_id for update;
  if v_avant.id is null then raise exception 'Remise introuvable'; end if;
  if v_avant.etat in ('revoquee','annulee','remplacee') then return v_avant; end if;

  update public.remises_commerciales
     set etat = 'revoquee', revoquee_le = now(), revoquee_par = auth.uid(), updated_at = now()
   where id = p_remise_id
  returning * into v_apres;

  insert into public.historique_remises_commerciales(
    remise_id, entreprise_id, action, ancien, nouveau, acteur_id, motif
  ) values (
    p_remise_id, v_avant.entreprise_id, 'revocation', to_jsonb(v_avant), to_jsonb(v_apres), auth.uid(), p_motif
  );

  return v_apres;
end;
$$;

-- Passage automatique programmée → active → expirée. Idempotent : appelable
-- par le cron d'abonnements aussi souvent que voulu.
create or replace function public.reconcilier_etats_remises(p_reference date default current_date)
returns integer language plpgsql security definer set search_path = public as $$
declare v_touchees integer := 0;
begin
  with maj as (
    update public.remises_commerciales r
       set etat = 'active', updated_at = now()
     where r.etat = 'programmee' and r.date_debut <= p_reference
    returning r.id, r.entreprise_id
  )
  insert into public.historique_remises_commerciales(remise_id, entreprise_id, action, acteur_id)
  select id, entreprise_id, 'activation', null from maj;
  get diagnostics v_touchees = row_count;

  with maj as (
    update public.remises_commerciales r
       set etat = 'expiree', updated_at = now()
     where r.etat in ('programmee','active')
       and r.duree_mode = 'dates'
       and r.date_fin is not null
       and r.date_fin <= p_reference
    returning r.id, r.entreprise_id
  )
  insert into public.historique_remises_commerciales(remise_id, entreprise_id, action, acteur_id)
  select id, entreprise_id, 'expiration', null from maj;

  return v_touchees;
end;
$$;

revoke all on function public.plateforme_creer_remise(uuid,text,numeric,text,text[],text,date,date,integer,text,boolean,boolean,boolean,integer,integer) from public, anon, authenticated;
grant execute on function public.plateforme_creer_remise(uuid,text,numeric,text,text[],text,date,date,integer,text,boolean,boolean,boolean,integer,integer) to authenticated;
revoke all on function public.plateforme_revoquer_remise(uuid,text) from public, anon, authenticated;
grant execute on function public.plateforme_revoquer_remise(uuid,text) to authenticated;
revoke all on function public.reconcilier_etats_remises(date) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Seed des prix modules — À NE PAS APPLIQUER SANS ARBITRAGE
--
-- Montants issus de l'étude ELSATIA_MODULES_COMMERCIAL_PRICING_V1 §22, qui les
-- qualifie explicitement de propositions de travail. Ils sont donc insérés en
-- `statut_prix = 'provisoire'` : l'interface ne doit ni les vendre ni les
-- présenter comme définitifs tant qu'ils ne sont pas passés à 'valide'.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Tarifs de modules — GRILLE V4, et non les montants d'étude
--
-- La proposition d'origine seedait des montants « provisoires » issus de l'étude
-- pricing, avec un prix qui VARIAIT selon le forfait de départ (Stock 29 € en
-- Mini mais 24 € en Pro ; Matériel 19 € en Mini mais 15 € en Pro). La grille V4
-- a tranché autrement : un module vaut le même prix quel que soit le forfait
-- souscrit, exactement comme un compte supplémentaire vaut le prix de son rôle.
-- Reprendre les montants d'étude aurait installé en base une troisième vérité
-- tarifaire, en contradiction avec `MODULES_OPTIONNELS` et avec les Price Stripe
-- de la génération CANONICAL-V4-2026-09.
--
-- Les montants ci-dessous sont donc ceux de la grille V4, en statut `valide`, et
-- pour les quatre forfaits vendables. `vehicules` reste à 0 : il est facturé avec
-- `materiel` comme un seul produit « Matériel et véhicules » à 19 €, et ne doit
-- jamais être compté deux fois.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.modules_gestion_pro_tarifs
  (module_code, forfait, prix_mensuel_centimes, multiplicateur_annuel, statut_prix, motif)
select v.module_code, f.forfait, v.prix, 10, 'valide', v.motif
from (values
  ('pointage',            2500, 'Grille V4 — Pointage 25 € HT/mois, 250 € HT/an'),
  ('stock',               2900, 'Grille V4 — Stock 29 € HT/mois, 290 € HT/an'),
  ('materiel',            1900, 'Grille V4 — Matériel et véhicules 19 € HT/mois, 190 € HT/an'),
  ('vehicules',              0, 'Grille V4 — facturé avec materiel comme un seul produit : jamais deux fois'),
  ('notes_frais',         1200, 'Grille V4 — Notes de frais 12 € HT/mois, 120 € HT/an'),
  ('rentabilite_avancee', 2900, 'Grille V4 — Rentabilité avancée 29 € HT/mois, 290 € HT/an')
) as v(module_code, prix, motif)
cross join (values ('mini'),('pro'),('business'),('entreprise')) as f(forfait)
where exists (select 1 from public.modules_gestion_pro m where m.code = v.module_code)
on conflict do nothing;

commit;
