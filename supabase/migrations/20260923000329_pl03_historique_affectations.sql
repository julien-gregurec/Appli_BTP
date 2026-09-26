-- PL-03 (recette pilote) : « Modifier une affectation existante →
-- modification appliquée, historique conservé ».
--
-- Reproduit par exécution réelle (identité RLS du conducteur de travaux,
-- a_permission('gerer_planning') = true) : un UPDATE de public.affectations
-- (heures 7 → 4, date décalée) réussit et ne laisse AUCUNE trace — aucune des
-- tables public.*histor*/*journal*/*audit* ne gagne de ligne. Les seuls
-- triggers de la table (verifier_heures_affectation, trg_affectation_employe_actif,
-- notifications_affectations) contrôlent ou notifient, aucun ne conserve
-- l'ancienne valeur ni l'auteur. modifierAffectationAction /
-- supprimerAffectationAction font un UPDATE / DELETE nu.
--
-- Correctif : historique append-only alimenté par trigger côté DB, donc
-- indépendant du chemin d'écriture (server action, PostgREST direct, RPC).
-- Même patron que public.reserves_historique (20260906000268) : qui, quoi,
-- quand, avant/après ; aucune policy d'écriture et droits d'écriture révoqués
-- pour `authenticated` — seul le trigger SECURITY DEFINER insère.
--
-- Périmètre :
--   * UPDATE réellement modifiant (un UPDATE sans changement de valeur, hors
--     updated_at, n'écrit rien) → operation 'modification', avant + après +
--     liste des champs modifiés ;
--   * DELETE direct → operation 'suppression', avant ;
--   * DELETE en cascade (suppression de l'employé, du chantier, de la demande
--     de congé ou de l'entreprise, via les FK ON DELETE CASCADE) : non
--     historisé — le contexte entier disparaît, et historiser une purge RGPD
--     (PE-05) irait à l'encontre de la purge. Détecté dans le trigger AFTER par
--     l'absence du parent (employé, chantier, demande de congé ou entreprise
--     déjà supprimé dans la même instruction). pg_trigger_depth() ne convient
--     pas : les triggers AFTER déclenchés par une cascade FK sont dépilés au
--     niveau 1, comme une suppression directe (vérifié en pgTAP).
-- Lecture : exactement les personnes qui peuvent lire l'affectation elle-même
-- (peut_consulter_affectation_employe, PL-05) — le cloisonnement du planning ne
-- doit pas fuir par son historique.

create table if not exists public.affectations_historique (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  affectation_id uuid not null,
  employe_id uuid not null,
  operation text not null check (operation in ('modification', 'suppression')),
  champs_modifies text[] not null default '{}',
  avant jsonb not null,
  apres jsonb,
  auteur_id uuid,
  created_at timestamptz not null default now(),
  check ((operation = 'modification') = (apres is not null))
);
create index if not exists affectations_historique_affectation_idx
  on public.affectations_historique (affectation_id, created_at desc);
create index if not exists affectations_historique_entreprise_idx
  on public.affectations_historique (entreprise_id, created_at desc);

alter table public.affectations_historique enable row level security;
revoke all on public.affectations_historique from anon;
revoke insert, update, delete, truncate on public.affectations_historique from authenticated;
grant select on public.affectations_historique to authenticated;
grant all on public.affectations_historique to service_role;

drop policy if exists affectations_historique_lecture on public.affectations_historique;
create policy affectations_historique_lecture on public.affectations_historique
  for select to authenticated
  using (
    public.est_membre_actif(entreprise_id)
    and public.peut_consulter_affectation_employe(entreprise_id, employe_id)
  );

create or replace function public.trg_historiser_affectation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avant jsonb := to_jsonb(old) - 'updated_at';
  v_apres jsonb;
  v_champs text[];
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.employes where id = old.employe_id)
       or not exists (select 1 from public.entreprises where id = old.entreprise_id)
       or (old.chantier_id is not null and not exists (select 1 from public.chantiers where id = old.chantier_id))
       or (old.demande_conge_id is not null and not exists (select 1 from public.demandes_conges where id = old.demande_conge_id)) then
      return old;
    end if;
    insert into public.affectations_historique
      (entreprise_id, affectation_id, employe_id, operation, avant, auteur_id)
    values
      (old.entreprise_id, old.id, old.employe_id, 'suppression', v_avant, auth.uid());
    return old;
  end if;

  v_apres := to_jsonb(new) - 'updated_at';
  if v_avant = v_apres then
    return new;
  end if;
  select coalesce(array_agg(k order by k), '{}') into v_champs
    from jsonb_object_keys(v_apres) as k
   where v_apres -> k is distinct from v_avant -> k;

  insert into public.affectations_historique
    (entreprise_id, affectation_id, employe_id, operation, champs_modifies, avant, apres, auteur_id)
  values
    (new.entreprise_id, new.id, new.employe_id, 'modification', v_champs, v_avant, v_apres, auth.uid());
  return new;
end;
$$;

comment on function public.trg_historiser_affectation() is
  'PL-03 : historique append-only des modifications et suppressions directes d''affectations (avant/après, champs modifiés, auteur, horodatage). Les suppressions en cascade (employé, chantier, congé, entreprise) ne sont pas historisées.';

drop trigger if exists trg_historiser_affectation on public.affectations;
create trigger trg_historiser_affectation
  after update or delete on public.affectations
  for each row execute function public.trg_historiser_affectation();

notify pgrst, 'reload schema';
