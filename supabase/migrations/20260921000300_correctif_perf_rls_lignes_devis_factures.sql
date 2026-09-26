-- Correctif capacité/performance : coût RLS des lignes de devis/factures.
--
-- Constat (mission perf/gp-capacity-readiness-v1, EXPLAIN ANALYZE sur fixture
-- ~5000 devis / lignes jusqu'à 1000 lignes, authenticated + RLS réelle) :
-- `lignes_devis` et `lignes_factures` n'ont pas de colonne `entreprise_id` —
-- seules tables de ce type dans tout le schéma (leurs tables sœurs plus
-- récentes `devis_ouvrages` et `lignes_devis_couts`, migration 282, ont déjà
-- cette colonne + FK composite + policies simplifiées ; ce correctif aligne
-- `lignes_devis`/`lignes_factures` sur ce même motif déjà établi).
--
-- Chacune des 5 policies RLS de ces deux tables (membres / lecture selon
-- permission / gestion insert / gestion update / gestion delete) vérifie
-- l'appartenance via `EXISTS (SELECT 1 FROM devis WHERE id = lignes_devis.devis_id
-- AND est_membre_actif(...))` : une sous-requête corrélée par LIGNE, exécutée
-- une fois par policy qui s'applique (2 pour un SELECT : la permissive
-- "membres" et la restrictive "lecture ... selon_permission").
--
-- Mesuré : ouverture d'un devis à 1000 lignes — 1,10 s, 70 058 buffers,
-- 1000 lignes x 2 sous-requêtes corrélées vers `devis` (2000 exécutions de
-- `a_permission`/`est_membre_actif`, chacune avec son propre coût). Sur une
-- facture à 51 lignes : 54 ms pour le même motif (≈1 ms/ligne). Ce coût croît
-- linéairement avec le nombre de lignes et s'aggrave avec le nombre de
-- devis/factures d'une PME BTP après plusieurs années d'historique.
--
-- Correctif : dénormaliser `entreprise_id` (valeur identique à celle du
-- devis/facture parent, garantie par un trigger — aucun changement requis
-- côté application/RPC, y compris `enregistrer_devis_brouillon_v2` qui
-- n'insère pas cette colonne). Les 5 policies passent d'une sous-requête
-- corrélée à un appel direct de `est_membre_actif(entreprise_id)` /
-- `a_permission(entreprise_id, ...)`, comme pour `devis_ouvrages`.
--
-- Isolation tenant strictement inchangée : `entreprise_id` est garanti égal
-- à celui du devis/facture parent par le trigger BEFORE INSERT/UPDATE ET par
-- la FK composite `(devis_id, entreprise_id) references devis(id, entreprise_id)`
-- (même verrou que `devis_ouvrages_devis_id_entreprise_id_fkey`) : aucune
-- ligne ne peut porter un entreprise_id différent de celui de son devis/
-- facture, y compris via UPDATE direct sur `entreprise_id` seul.
--
-- CREATE INDEX CONCURRENTLY / stratégie de cutover Production : cette
-- migration utilise CREATE INDEX simple (transactionnelle, comme le reste du
-- ledger) — correct pour Fresh et pour l'état actuel de la RC. Si Production
-- a accumulé un volume de lignes_devis/lignes_factures significativement
-- plus grand au moment du déploiement réel, remplacer l'ADD COLUMN + backfill
-- + CREATE INDEX de cette migration par : ADD COLUMN nullable (rapide) ;
-- backfill par lots (UPDATE ... WHERE entreprise_id IS NULL LIMIT n, en
-- boucle) hors heures ouvrées ; CREATE INDEX CONCURRENTLY (hors transaction) ;
-- puis SET NOT NULL + ADD CONSTRAINT (validation rapide une fois l'index en
-- place). Non nécessaire ici : le volume RC est encore modeste.

-- ---------------------------------------------------------------------
-- lignes_devis
-- ---------------------------------------------------------------------
alter table public.lignes_devis add column if not exists entreprise_id uuid;

update public.lignes_devis ld
set entreprise_id = d.entreprise_id
from public.devis d
where d.id = ld.devis_id and ld.entreprise_id is distinct from d.entreprise_id;

alter table public.lignes_devis alter column entreprise_id set not null;

alter table public.lignes_devis
  drop constraint if exists lignes_devis_devis_id_entreprise_id_fkey,
  add constraint lignes_devis_devis_id_entreprise_id_fkey
    foreign key (devis_id, entreprise_id) references public.devis(id, entreprise_id) on delete cascade;

create index if not exists lignes_devis_entreprise_idx on public.lignes_devis(entreprise_id);

create or replace function public.fixer_entreprise_ligne_devis()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select d.entreprise_id into strict new.entreprise_id
  from public.devis d where d.id = new.devis_id;
  return new;
end;
$$;

drop trigger if exists fixer_entreprise_ligne_devis on public.lignes_devis;
create trigger fixer_entreprise_ligne_devis
  before insert or update of devis_id on public.lignes_devis
  for each row execute function public.fixer_entreprise_ligne_devis();

drop policy if exists "membres lignes_devis" on public.lignes_devis;
create policy "membres lignes_devis" on public.lignes_devis
  for all using (public.est_membre_actif(entreprise_id))
  with check (public.est_membre_actif(entreprise_id));

drop policy if exists lecture_lignes_devis_selon_permission on public.lignes_devis;
create policy lecture_lignes_devis_selon_permission on public.lignes_devis
  as restrictive for select to authenticated
  using (public.a_permission(entreprise_id, 'acces_devis'));

drop policy if exists role_gestion_insert on public.lignes_devis;
create policy role_gestion_insert on public.lignes_devis
  as restrictive for insert to authenticated
  with check (public.a_permission(entreprise_id, 'gerer_devis'));

drop policy if exists role_gestion_update on public.lignes_devis;
create policy role_gestion_update on public.lignes_devis
  as restrictive for update to authenticated
  using (public.a_permission(entreprise_id, 'gerer_devis'))
  with check (public.a_permission(entreprise_id, 'gerer_devis'));

drop policy if exists role_gestion_delete on public.lignes_devis;
create policy role_gestion_delete on public.lignes_devis
  as restrictive for delete to authenticated
  using (public.a_permission(entreprise_id, 'gerer_devis'));

-- ---------------------------------------------------------------------
-- lignes_factures
-- ---------------------------------------------------------------------
alter table public.lignes_factures add column if not exists entreprise_id uuid;

update public.lignes_factures lf
set entreprise_id = f.entreprise_id
from public.factures f
where f.id = lf.facture_id and lf.entreprise_id is distinct from f.entreprise_id;

alter table public.lignes_factures alter column entreprise_id set not null;

alter table public.lignes_factures
  drop constraint if exists lignes_factures_facture_id_entreprise_id_fkey,
  add constraint lignes_factures_facture_id_entreprise_id_fkey
    foreign key (facture_id, entreprise_id) references public.factures(id, entreprise_id) on delete cascade;

create index if not exists lignes_factures_entreprise_idx on public.lignes_factures(entreprise_id);

create or replace function public.fixer_entreprise_ligne_facture()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select f.entreprise_id into strict new.entreprise_id
  from public.factures f where f.id = new.facture_id;
  return new;
end;
$$;

drop trigger if exists fixer_entreprise_ligne_facture on public.lignes_factures;
create trigger fixer_entreprise_ligne_facture
  before insert or update of facture_id on public.lignes_factures
  for each row execute function public.fixer_entreprise_ligne_facture();

drop policy if exists "membres lignes_factures" on public.lignes_factures;
create policy "membres lignes_factures" on public.lignes_factures
  for all using (public.est_membre_actif(entreprise_id))
  with check (public.est_membre_actif(entreprise_id));

drop policy if exists lecture_lignes_factures_selon_permission on public.lignes_factures;
create policy lecture_lignes_factures_selon_permission on public.lignes_factures
  as restrictive for select to authenticated
  using (public.a_permission(entreprise_id, 'acces_factures'));

drop policy if exists role_gestion_insert on public.lignes_factures;
create policy role_gestion_insert on public.lignes_factures
  as restrictive for insert to authenticated
  with check (public.a_permission(entreprise_id, 'gerer_factures'));

drop policy if exists role_gestion_update on public.lignes_factures;
create policy role_gestion_update on public.lignes_factures
  as restrictive for update to authenticated
  using (public.a_permission(entreprise_id, 'gerer_factures'))
  with check (public.a_permission(entreprise_id, 'gerer_factures'));

drop policy if exists role_gestion_delete on public.lignes_factures;
create policy role_gestion_delete on public.lignes_factures
  as restrictive for delete to authenticated
  using (public.a_permission(entreprise_id, 'gerer_factures'));

analyze public.lignes_devis;
analyze public.lignes_factures;
