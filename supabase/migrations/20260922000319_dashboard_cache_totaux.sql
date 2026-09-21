-- [CONVERGENCE TRAIN] Porte le lot PERFORMANCE qualifie sur la branche source
-- claude/beautiful-franklin-7hwzq0 (SHA 56aa747958a480d484ddf3d71d25e1efc539d99,
-- verdict source : PERFORMANCE QUALIFIED). Numero source de cette migration :
-- 20260922000317 (branche source, ledger divergent). Renumerotee au prochain identifiant
-- reellement disponible du train (ledger canonique claude/compassionate-euler-5j6avr)
-- pour eviter toute collision avec 20260922000317_correctif_troncature_next_reference.sql
-- (NUMBERING FIX INTEGRATED, deja present dans le train, non touche par ce lot).
-- Contenu fonctionnel identique au commit source ; seuls le numero de fichier et
-- les references croisees vers les migrations voisines de ce meme lot ont ete
-- ajustes pour pointer vers leur nouveau numero dans le train.

-- ELSATIA-GP-DASHBOARD-SEARCH-PERFORMANCE-V1 — Dashboard : cache tenant-safe
-- des 3 totaux qui, par nature, doivent agréger la quasi-totalité de
-- l'historique devis/factures d'une entreprise (montant des devis
-- acceptés, total facturé, total encaissé). Contrairement aux listes
-- bornées de la migration précédente (20260922000318), un SUM sur "tous
-- les devis acceptés" ou "toutes les factures" reste O(n) même écrit en
-- SQL pur : chaque ligne balayée paie le coût RLS par ligne
-- (`a_permission`/`est_membre_actif`, cf. § SQL du rapport de mission) —
-- remplacer le chargement complet côté JS par un SUM() côté SQL réduit le
-- volume transféré mais pas le nombre de lignes évaluées par la RLS.
--
-- Mission §4 autorise explicitement la "materialization légère si
-- justifiée" et le "cache tenant-safe". Ici : une ligne par entreprise,
-- 3 compteurs, maintenue en O(1) par trigger à chaque écriture sur
-- `devis`/`factures` (même motif que les compteurs déjà existants dans ce
-- schéma, ex. `montant_paye`/statut des factures via
-- `recalc_paiements_apres_paiement`) — jamais recalculée par balayage.
--
-- Sécurité : aucun accès direct pour aucun rôle applicatif, dans aucun
-- sens (même motif que `compteurs_reference`, migration 20260710000001 +
-- verrouillage 20260902000255 : RLS activée sans aucune policy — donc deny-
-- all pour tout rôle non propriétaire — cumulée à un REVOKE ALL explicite).
-- Une policy `est_membre_actif` simple exposerait `devis_acceptes_total` à
-- un membre sans la permission `acces_devis` (et `factures_total`/
-- `factures_encaisse_total` sans `acces_factures`) — une régression par
-- rapport à la policy RESTRICTIVE `lecture_devis_selon_permission`/
-- `lecture_factures_selon_permission` que ce cache résume. La seule voie de
-- lecture est donc `public.dashboard_indicateurs()` (migration 20260922000318),
-- qui reproduit exactement cette même vérification par domaine avant de
-- lire ce cache. Écriture : uniquement les triggers SECURITY DEFINER
-- ci-dessous (même convention que `trg_recalc_devis`).

create table public.entreprises_dashboard_cache (
  entreprise_id uuid primary key references public.entreprises(id) on delete cascade,
  devis_acceptes_total numeric not null default 0,
  factures_total numeric not null default 0,
  factures_encaisse_total numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.entreprises_dashboard_cache enable row level security;

revoke all on table public.entreprises_dashboard_cache from public, anon, authenticated, service_role;

-- --------------------------------------------------------------------------
-- Maintenance incrémentale — devis
-- --------------------------------------------------------------------------
create or replace function public.trg_maj_cache_dashboard_devis()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entreprise_id uuid := coalesce(new.entreprise_id, old.entreprise_id);
  v_delta numeric := 0;
begin
  if tg_op = 'INSERT' then
    if new.statut = 'accepte' then
      v_delta := new.montant_ttc;
    end if;
  elsif tg_op = 'DELETE' then
    if old.statut = 'accepte' then
      v_delta := -old.montant_ttc;
    end if;
  else
    if old.statut = 'accepte' then
      v_delta := v_delta - old.montant_ttc;
    end if;
    if new.statut = 'accepte' then
      v_delta := v_delta + new.montant_ttc;
    end if;
  end if;

  if v_delta <> 0 then
    insert into public.entreprises_dashboard_cache (entreprise_id, devis_acceptes_total)
    values (v_entreprise_id, v_delta)
    on conflict (entreprise_id)
    do update set devis_acceptes_total = public.entreprises_dashboard_cache.devis_acceptes_total + excluded.devis_acceptes_total,
                  updated_at = now();
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists maj_cache_dashboard_devis on public.devis;
create trigger maj_cache_dashboard_devis
  after insert or delete or update of statut, montant_ttc on public.devis
  for each row execute function public.trg_maj_cache_dashboard_devis();

-- --------------------------------------------------------------------------
-- Maintenance incrémentale — factures
-- --------------------------------------------------------------------------
create or replace function public.trg_maj_cache_dashboard_factures()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entreprise_id uuid := coalesce(new.entreprise_id, old.entreprise_id);
  v_delta_total numeric := 0;
  v_delta_encaisse numeric := 0;
begin
  if tg_op = 'INSERT' then
    if new.statut <> 'annulee' then
      v_delta_total := new.montant_ttc;
    end if;
    v_delta_encaisse := new.montant_paye;
  elsif tg_op = 'DELETE' then
    if old.statut <> 'annulee' then
      v_delta_total := -old.montant_ttc;
    end if;
    v_delta_encaisse := -old.montant_paye;
  else
    if old.statut <> 'annulee' then
      v_delta_total := v_delta_total - old.montant_ttc;
    end if;
    if new.statut <> 'annulee' then
      v_delta_total := v_delta_total + new.montant_ttc;
    end if;
    v_delta_encaisse := new.montant_paye - old.montant_paye;
  end if;

  if v_delta_total <> 0 or v_delta_encaisse <> 0 then
    insert into public.entreprises_dashboard_cache (entreprise_id, factures_total, factures_encaisse_total)
    values (v_entreprise_id, v_delta_total, v_delta_encaisse)
    on conflict (entreprise_id)
    do update set factures_total = public.entreprises_dashboard_cache.factures_total + excluded.factures_total,
                  factures_encaisse_total = public.entreprises_dashboard_cache.factures_encaisse_total + excluded.factures_encaisse_total,
                  updated_at = now();
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists maj_cache_dashboard_factures on public.factures;
create trigger maj_cache_dashboard_factures
  after insert or delete or update of statut, montant_ttc, montant_paye on public.factures
  for each row execute function public.trg_maj_cache_dashboard_factures();

-- --------------------------------------------------------------------------
-- Backfill (une passe, à la création de la migration) : après ce backfill,
-- plus aucun balayage complet n'est nécessaire, seul le delta incrémental
-- ci-dessus maintient le cache à jour.
-- --------------------------------------------------------------------------
insert into public.entreprises_dashboard_cache (entreprise_id, devis_acceptes_total, factures_total, factures_encaisse_total)
select
  e.id,
  coalesce((select sum(d.montant_ttc) from public.devis d where d.entreprise_id = e.id and d.statut = 'accepte'), 0),
  coalesce((select sum(f.montant_ttc) from public.factures f where f.entreprise_id = e.id and f.statut <> 'annulee'), 0),
  coalesce((select sum(f.montant_paye) from public.factures f where f.entreprise_id = e.id), 0)
from public.entreprises e
on conflict (entreprise_id) do update
  set devis_acceptes_total = excluded.devis_acceptes_total,
      factures_total = excluded.factures_total,
      factures_encaisse_total = excluded.factures_encaisse_total,
      updated_at = now();

notify pgrst, 'reload schema';
