-- Correctif concurrence — verrouillage optimiste sur les affectations de planning
-- (lot Planning/Pointage concurrency v1)
--
-- Constat (lecture de code, `src/app/actions/planning.ts`) : `modifierAffectationAction`
-- (déplacement, changement de chantier/tâche/heures/type d'une affectation existante) fait
-- un `UPDATE ... WHERE entreprise_id = ... AND id IN (...)` sans aucune vérification que la
-- ligne n'a pas déjà été modifiée depuis que l'utilisateur l'a chargée à l'écran. Deux
-- utilisateurs qui modifient (cas A) ou suppriment pendant qu'un troisième modifie (cas C)
-- la même affectation en même temps : le dernier `UPDATE` à committer écrase silencieusement
-- le précédent (lost update), sans erreur pour personne. Le seul garde-fou de concurrence
-- existant sur cette table (`trg_verifier_heures_affectation`, verrou consultatif sur
-- entreprise/employé/date) protège uniquement le plafond de 24 h/jour — pas l'écrasement de
-- champs indépendants (chantier, tâche, type, lieu) sur la même ligne.
--
-- Correctif : ajoute une colonne `revision` (compteur entier, incrémenté automatiquement à
-- chaque UPDATE par trigger — le client ne la fixe jamais lui-même, il la lit et la renvoie
-- comme valeur attendue). Reprend le motif déjà en place ailleurs dans ce dépôt pour
-- `public.tools_projects` (`20260830000236_elsatia_tools_r8_...sql`). Aucune règle métier
-- changée : la colonne est purement technique, invisible dans l'UI, et son absence de
-- vérification pour un appelant qui ne la fournit pas encore ne bloque rien (voir
-- l'application applicative de ce correctif, hors SQL, dans le même lot).
alter table public.affectations
  add column if not exists revision bigint not null default 1;

comment on column public.affectations.revision is
  'Compteur de version incrémenté automatiquement à chaque UPDATE (trigger '
  'trg_affectations_bump_revision) — sert de verrou optimiste pour détecter une modification '
  'concurrente (lost update) côté application.';

create or replace function public.trg_affectations_bump_revision()
returns trigger
language plpgsql
as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;

drop trigger if exists trg_affectations_bump_revision on public.affectations;
create trigger trg_affectations_bump_revision
  before update on public.affectations
  for each row execute function public.trg_affectations_bump_revision();

revoke all on function public.trg_affectations_bump_revision() from public, anon, authenticated;

notify pgrst, 'reload schema';
