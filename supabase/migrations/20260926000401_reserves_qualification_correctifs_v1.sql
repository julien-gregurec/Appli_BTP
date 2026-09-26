-- ELSATIA-RESERVES-QUALIFICATION-CORRECTIFS-V1
--
-- Correctifs issus de la qualification locale complète de Réserves
-- (docs/qualification/ELSATIA_RESERVES_FULL_LOCAL_QUALIFICATION_V1.md, constats R-01 à R-05).
--
-- R-01 — MODIFICATIONS SILENCIEUSES D'UNE RÉSERVE. La policy `reserves_update` (00268)
-- ouvre l'`update` direct des champs descriptifs à tout rôle qui peut créer une réserve,
-- simple émetteur compris. Le trigger de workflow protège le statut et l'attribution,
-- mais rien ne trace ni ne borne le reste. Constaté sur PostgreSQL réel :
--   * un émetteur désactive `photo_obligatoire_levee` d'une réserve acceptée : la levée
--     n'exige plus de preuve, et l'historique ne montre rien ;
--   * une réserve LEVÉE voit son titre, sa description, son échéance et sa priorité
--     réécrits après validation, sans aucune ligne d'historique.
-- Le dossier remis à la réception pouvait donc être altéré a posteriori sans trace.
--
-- Correctif :
--   1. toute modification de titre, description, priorité, échéance ou exigence de
--      photo est HISTORISÉE (action `modification`, champ, avant, après, auteur) dans la
--      même transaction ;
--   2. une réserve CLÔTURÉE (`levee`, `annulee`) ne peut plus voir ces champs modifiés :
--      il faut la rouvrir, geste lui-même tracé et motivé ;
--   3. l'exigence de photo ne peut plus être modifiée pendant qu'une demande de levée
--      est en attente : elle fonde la décision à prendre.
--   Le repositionnement sur plan et le retrait d'un plan (RPC existantes, déjà tracées ou
--   sans effet sur le contenu) ne sont pas concernés.
--
-- R-02 — HISTORIQUE MODIFIABLE HORS DE L'APPLICATION. L'immuabilité de
-- `reserves_historique` reposait sur l'absence de GRANT pour `authenticated`. La clé
-- serveur (`service_role`, qui détient sur une pile Supabase réelle tous les droits sur
-- `public` par privilèges par défaut) et le propriétaire pouvaient réécrire, effacer ou
-- vider la table. Correctif : triggers qui refusent `update` et `truncate` à TOUS les
-- rôles, et `delete` sauf dans les deux cas légitimes :
--   * suppression en CASCADE du dossier parent (réserve, chantier, organisation) ;
--   * purge RGPD d'une organisation dont la suppression programmée est échue — même
--     condition que `purger_table_entreprise()` (20260923000331).
--
-- R-03 — ESCALADE DE PRIVILÈGE PAR LA FILE HORS-LIGNE. Statuer sur une levée (valider,
-- refuser) et rouvrir une réserve levée sont réservés à `reserves_admin_organisation` et
-- `reserves_responsable` : `reserves_statuer_levee` et `reserves_rouvrir` le vérifient.
-- Mais `reserves_transition_differee` (00273), exposée à `authenticated`, appelle le cœur
-- de transition sans ce contrôle : un simple ÉMETTEUR validait une levée ou rouvrait une
-- réserve levée par un appel PostgREST direct (constaté : `issue = appliquee`, statut
-- `levee`). Correctif CENTRAL, indépendant du chemin d'appel : un trigger sur `reserves`
-- exige `valider_levee` pour toute décision de levée ou réouverture, quelle que soit la
-- RPC qui la porte. Les tâches serveur sans utilisateur (`auth.uid()` nul) ne sont pas
-- concernées : aucune n'émet de telles transitions aujourd'hui.
--
-- R-04 — RÉSERVES BLOQUAIT LA SUPPRESSION D'UN CHANTIER GESTION PRO. La clé étrangère
-- `reserves_chantiers.chantier_gp_id` est `on delete set null`, mais la contrainte
-- `(source = 'gestion_pro') = (chantier_gp_id is not null)` refuse précisément cette mise
-- à nul : supprimer un chantier GP importé dans Réserves échouait (constaté, y compris en
-- propriétaire). Une application facultative ne doit jamais bloquer l'autre. Correctif :
-- quand le lien GP disparaît, le chantier Réserves est DÉTACHÉ (`source = 'reserves'`),
-- ses réserves, plans et historique restent intacts ; `synchronise_at` garde la date de
-- la dernière reprise.
--
-- R-05 — CHANGEMENT DE PORTEUR SANS TRACE (défaut connu V6, jusqu'ici NON intégré :
-- docs/reserves/ELSATIA_RESERVES_V6_SQL_PROPOSE_NON_INTEGRE.sql §1, « bloqué par le train
-- global » — le train canonique V2 étant figé, le blocage est levé). `reserves_intervenants`
-- accorde `update` à `authenticated` : un hôte pouvait, par un PATCH direct, rattacher une
-- organisation tierce sans son consentement et dessaisir l'entreprise précédente sans
-- révocation tracée. Correctif : les colonnes de rattachement ne se modifient plus qu'au
-- travers des fonctions du domaine (désignation, invitation, rattachement, révocation,
-- réactivation), qui s'exécutent sous leur propriétaire (`security definer`) et tracent.
-- Une écriture émise directement sous `authenticated`/`anon` est refusée. Aucune des
-- cinq fonctions n'est réécrite. Le nom, le corps d'état et les coordonnées restent
-- modifiables directement.
--
-- Migration strictement ADDITIVE : aucune table, colonne, policy ni fonction existante
-- n'est supprimée ou réécrite.

begin;

-- ── R-01 : traçage et gel des champs descriptifs ─────────────────────────────
create or replace function public.reserves_garde_modification_descriptive()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.titre is not distinct from old.titre
     and new.description is not distinct from old.description
     and new.priorite is not distinct from old.priorite
     and new.echeance is not distinct from old.echeance
     and new.photo_obligatoire_levee is not distinct from old.photo_obligatoire_levee
  then
    return new;
  end if;
  if old.statut in ('levee','annulee') then
    raise exception 'Réserve clôturée : rouvrez-la avant de modifier son contenu'
      using errcode = '42501';
  end if;
  if old.statut = 'levee_demandee'
     and new.photo_obligatoire_levee is distinct from old.photo_obligatoire_levee then
    raise exception 'Exigence de photo figée pendant qu''une demande de levée est en attente'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.reserves_historiser_modification()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_auteur_entreprise uuid;
begin
  -- Seul l'hôte peut modifier une réserve (policy `reserves_update`) : l'auteur agit
  -- donc pour l'organisation propriétaire.
  v_auteur_entreprise := new.entreprise_id;
  insert into public.reserves_historique (
    entreprise_id, reserve_id, action, statut_avant, statut_apres,
    champ, valeur_avant, valeur_apres, auteur_id, auteur_entreprise_id
  )
  select new.entreprise_id, new.id, 'modification', old.statut, new.statut,
         c.champ, left(c.avant, 500), left(c.apres, 500), auth.uid(), v_auteur_entreprise
  from (values
    ('titre', old.titre, new.titre),
    ('description', old.description, new.description),
    ('priorite', old.priorite, new.priorite),
    ('echeance', old.echeance::text, new.echeance::text),
    ('photo_obligatoire_levee', old.photo_obligatoire_levee::text, new.photo_obligatoire_levee::text)
  ) as c(champ, avant, apres)
  where c.avant is distinct from c.apres;
  return null;
end;
$$;

drop trigger if exists reserves_modification_garde on public.reserves;
create trigger reserves_modification_garde before update on public.reserves
  for each row execute function public.reserves_garde_modification_descriptive();

drop trigger if exists reserves_modification_historisee on public.reserves;
create trigger reserves_modification_historisee after update on public.reserves
  for each row execute function public.reserves_historiser_modification();

-- ── R-03 : décision de levée réservée, quel que soit le chemin ───────────────
create or replace function public.reserves_garde_decision_levee()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.statut is not distinct from old.statut or auth.uid() is null then
    return new;
  end if;
  if (old.statut = 'levee_demandee' and new.statut in ('levee','levee_refusee'))
     or (old.statut = 'levee' and new.statut = 'assignee') then
    if not public.reserves_action_autorisee(old.entreprise_id, 'valider_levee') then
      raise exception 'Validation de levée non autorisée' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists reserves_decision_levee_garde on public.reserves;
create trigger reserves_decision_levee_garde before update on public.reserves
  for each row execute function public.reserves_garde_decision_levee();

-- ── R-04 : détachement du chantier quand le chantier GP disparaît ────────────
create or replace function public.reserves_detacher_chantier_gp()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.chantier_gp_id is null and old.chantier_gp_id is not null
     and new.source = 'gestion_pro' then
    new.source := 'reserves';
  end if;
  return new;
end;
$$;

drop trigger if exists reserves_chantiers_detachement_gp on public.reserves_chantiers;
create trigger reserves_chantiers_detachement_gp before update on public.reserves_chantiers
  for each row execute function public.reserves_detacher_chantier_gp();

-- ── R-05 : rattachement d'un intervenant réservé aux fonctions du domaine ─────
create or replace function public.reserves_garde_rattachement()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.entreprise_intervenante_id is distinct from old.entreprise_intervenante_id
     or new.statut is distinct from old.statut
     or new.rejoint_at is distinct from old.rejoint_at
     or new.revoque_at is distinct from old.revoque_at
     or new.entreprise_id is distinct from old.entreprise_id
     or new.chantier_id is distinct from old.chantier_id
  then
    raise exception 'Rattachement d''une entreprise intervenante interdit en écriture directe : '
      'passez par l''invitation, la désignation ou la révocation' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists reserves_intervenants_garde_rattachement on public.reserves_intervenants;
create trigger reserves_intervenants_garde_rattachement before update on public.reserves_intervenants
  for each row execute function public.reserves_garde_rattachement();

-- ── R-02 : historique append-only pour tous les rôles ────────────────────────
create or replace function public.reserves_historique_immuable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    -- Cascade depuis la réserve, le chantier ou l'organisation : le dossier disparaît
    -- en entier, jamais une ligne isolée.
    if pg_trigger_depth() > 1 then return old; end if;
    -- Purge RGPD d'une organisation dont la suppression programmée est échue.
    if exists (
      select 1 from public.entreprises e
      where e.id = old.entreprise_id
        and e.suppression_prevue_at is not null
        and e.suppression_prevue_at <= now()
    ) then
      return old;
    end if;
  end if;
  raise exception 'reserves_historique est append-only : % interdit', tg_op
    using errcode = '42501';
end;
$$;

drop trigger if exists reserves_historique_immuable on public.reserves_historique;
create trigger reserves_historique_immuable
  before update or delete on public.reserves_historique
  for each row execute function public.reserves_historique_immuable();

drop trigger if exists reserves_historique_immuable_truncate on public.reserves_historique;
create trigger reserves_historique_immuable_truncate
  before truncate on public.reserves_historique
  for each statement execute function public.reserves_historique_immuable();

revoke all on function public.reserves_garde_modification_descriptive() from public, anon, authenticated;
revoke all on function public.reserves_historiser_modification() from public, anon, authenticated;
revoke all on function public.reserves_historique_immuable() from public, anon, authenticated;
revoke all on function public.reserves_garde_decision_levee() from public, anon, authenticated;
revoke all on function public.reserves_detacher_chantier_gp() from public, anon, authenticated;
revoke all on function public.reserves_garde_rattachement() from public, anon, authenticated;

commit;
