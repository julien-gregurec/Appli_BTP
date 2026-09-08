-- ELSATIA-RESERVES-V5 — IDEMPOTENCE DES MUTATIONS DIFFÉRÉES
--
-- PROVENANCE ET RENUMÉROTATION
--
-- Ce fichier est la version CANONIQUE, produite par le train d'intégration
-- ELSATIA-ECOSYSTEM-INTEGRATION-TRAIN-V2. Son contenu métier vient sans modification de
-- la migration candidate `20260907000271_reserves_v5_offline_idempotence_v1.sql`, portée
-- par la branche isolée `feat/reserves-v4-e2e-offline-pdf-print` (code V5 :
-- 7c0fc3d158a0f7b6a3de27eaba8b4be47cb60b00).
--
-- Cette candidate ne pouvait pas entrer au train sous son numéro d'origine : le 271 y est
-- déjà occupé par `20260908000271_colors_activity_history_v14.sql`, et le 272 par
-- `20260908000272_client_document_snapshot_v1.sql`. La candidate n'ayant jamais été
-- fusionnée ni appliquée hors d'une base jetable de recette, aucune base existante ne la
-- connaît sous l'ancien identifiant : la renuméroter ne réécrit donc l'histoire d'aucune
-- installation. Ce n'est pas la modification d'une migration canonique — c'est la
-- création de la seule qui l'ait jamais été.
--
-- Numéro retenu : 273, premier libre après 272, vérifié sur l'ensemble des références du
-- dépôt (aucune migration ≥ 273 nulle part).

--
-- Le lot V5 livre une file de mutations hors-ligne : une action saisie sur le chantier
-- est conservée localement, puis rejouée au retour du réseau. Un rejeu n'est pas un cas
-- rare, c'est le fonctionnement NORMAL de la file — une réponse perdue, un onglet fermé
-- pendant l'envoi, un retry explicite. Sans clé d'idempotence, chaque reprise ajoute un
-- commentaire, une photo ou une demande de levée de plus.
--
-- État avant ce lot :
--   • `reserves_creer`         : idempotent (V1, `origine_client_id`) ;
--   • `reserves_ajouter_photo` : idempotent (V2, `origine_client_id`) ;
--   • `reserves_commenter`     : AUCUNE clé — la table n'a même pas la colonne ;
--   • `reserves_appliquer_transition` : aucune clé, et un rejeu lève une exception
--     indiscernable d'un vrai conflit.
--
-- Cette migration comble les deux derniers manques. Elle n'ouvre aucun droit nouveau :
-- toutes les fonctions restent adossées à `reserves_acteur_courant()`.

-- ── 1. Commentaires ─────────────────────────────────────────────────────────

alter table public.reserves_messages
  add column if not exists origine_client_id uuid;

comment on column public.reserves_messages.origine_client_id is
  'Clé d''idempotence émise par le client hors-ligne. Unique par organisation : rejouer '
  'un envoi déjà enregistré renvoie le message existant au lieu d''en créer un second.';

-- Unicité par ORGANISATION, comme pour `reserves.origine_client_id` : deux tenants
-- peuvent tirer la même clé sans se percuter, et la clé d'un tenant ne renseigne rien
-- sur l'autre.
create unique index if not exists reserves_messages_origine_client_unique
  on public.reserves_messages (entreprise_id, origine_client_id)
  where origine_client_id is not null;

create or replace function public.reserves_commenter(
  p_reserve_id uuid, p_contenu text, p_photo_id uuid default null,
  p_origine_client_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_reserve public.reserves; v_acteur text; v_conversation uuid;
  v_entreprise_auteur uuid; v_message uuid;
begin
  if coalesce(btrim(p_contenu), '') = '' then raise exception 'Message vide'; end if;
  select * into v_reserve from public.reserves where id = p_reserve_id;
  if not found then raise exception 'Réserve introuvable'; end if;
  v_acteur := public.reserves_acteur_courant(p_reserve_id);
  if v_acteur is null then raise exception 'Commentaire non autorisé'; end if;

  -- Idempotence hors-ligne. Le contrôle vient APRÈS l'autorisation : un rejeu n'est pas
  -- une porte dérobée, il faut d'abord être en droit de commenter cette réserve.
  --
  -- La valeur rendue reste la CONVERSATION, comme au premier envoi : c'est elle que
  -- l'application utilise pour ouvrir le fil. Rendre l'identifiant du message ferait
  -- diverger le rejeu de l'envoi initial, sans que rien ne le signale.
  if p_origine_client_id is not null then
    select m.conversation_id into v_conversation
    from public.reserves_messages m
    where m.entreprise_id = v_reserve.entreprise_id
      and m.origine_client_id = p_origine_client_id;
    if v_conversation is not null then return v_conversation; end if;
  end if;

  if v_acteur = 'hote' then
    v_entreprise_auteur := v_reserve.entreprise_id;
  else
    select i.entreprise_intervenante_id into v_entreprise_auteur
    from public.reserves_intervenants i where i.id = v_reserve.intervenant_id;
  end if;

  select id into v_conversation from public.reserves_conversations where reserve_id = p_reserve_id;
  if v_conversation is null then
    insert into public.reserves_conversations (
      entreprise_id, chantier_id, reserve_id, intervenant_id, portee, titre
    ) values (
      v_reserve.entreprise_id, v_reserve.chantier_id, p_reserve_id, v_reserve.intervenant_id,
      'reserve', 'Réserve n°' || v_reserve.numero || ' — ' || left(v_reserve.titre, 150)
    ) returning id into v_conversation;
  else
    -- La conversation suit le porteur courant : après un transfert, l'entreprise
    -- dessaisie ne doit plus lire les échanges qui suivent.
    update public.reserves_conversations
    set intervenant_id = v_reserve.intervenant_id, updated_at = now()
    where id = v_conversation and intervenant_id is distinct from v_reserve.intervenant_id;
  end if;

  insert into public.reserves_messages (
    entreprise_id, conversation_id, auteur_entreprise_id, contenu, origine_client_id
  ) values (
    v_reserve.entreprise_id, v_conversation, v_entreprise_auteur, p_contenu, p_origine_client_id
  )
  returning id into v_message;

  if p_photo_id is not null then
    update public.reserves_photos
    set message_id = v_message
    where id = p_photo_id
      and reserve_id = p_reserve_id
      and disponible_at is not null
      and supprimee_at is null
      and message_id is null;
    if not found then raise exception 'Photo introuvable ou déjà rattachée'; end if;
  end if;

  insert into public.reserves_historique (
    entreprise_id, reserve_id, action, statut_avant, statut_apres,
    commentaire, auteur_id, auteur_entreprise_id
  ) values (
    v_reserve.entreprise_id, p_reserve_id, 'commentaire', v_reserve.statut, v_reserve.statut,
    left(p_contenu, 2000), auth.uid(), v_entreprise_auteur
  );

  insert into public.reserves_evenements_notifications (
    entreprise_id, chantier_id, reserve_id, type, destinataire_entreprise_id, payload
  )
  select v_reserve.entreprise_id, v_reserve.chantier_id, p_reserve_id, 'message_recu',
         case when v_acteur = 'hote' then i.entreprise_intervenante_id else v_reserve.entreprise_id end,
         jsonb_build_object('numero', v_reserve.numero, 'titre', v_reserve.titre)
  from public.reserves_intervenants i
  where i.id = v_reserve.intervenant_id
    and (v_acteur <> 'hote' or i.entreprise_intervenante_id is not null);

  -- L'auteur a évidemment lu son propre message : sans cela, son compteur de non-lus
  -- s'incrémenterait à chaque envoi.
  insert into public.reserves_conversations_lectures (conversation_id, utilisateur_id, lu_jusqu_a)
  values (v_conversation, auth.uid(), now())
  on conflict (conversation_id, utilisateur_id) do update set lu_jusqu_a = now();

  return v_conversation;
end;
$$;

revoke all on function public.reserves_commenter(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.reserves_commenter(uuid, text, uuid, uuid) to authenticated;

-- L'ancienne signature à trois arguments disparaît : la laisser en place ferait coexister
-- deux fonctions dont l'une, silencieusement, ne dédoublonne rien.
drop function if exists public.reserves_commenter(uuid, text, uuid);

-- ── 2. Transitions ──────────────────────────────────────────────────────────

-- Registre d'idempotence des mutations différées.
--
-- Volontairement SÉPARÉ de `reserves_historique`, qui est un journal append-only : y
-- ajouter une colonne mutable puis la réécrire après coup reviendrait à percer la seule
-- table dont l'immuabilité est une garantie contractuelle. Le registre est une donnée
-- technique, l'historique est une preuve — deux natures, deux tables.
create table if not exists public.reserves_mutations_appliquees (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  reserve_id uuid not null references public.reserves(id) on delete cascade,
  origine_client_id uuid not null,
  action text not null,
  -- L'auteur est enregistré pour que le rejeu soit traçable : qui a préparé la mutation.
  auteur_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  -- Unicité par ORGANISATION, comme les autres clés d'idempotence du domaine.
  constraint reserves_mutations_appliquees_unique unique (entreprise_id, origine_client_id)
);

comment on table public.reserves_mutations_appliquees is
  'Registre des mutations différées déjà appliquées. Permet de distinguer un REJEU '
  'bénin (même clé) d''un véritable conflit d''état, sans toucher au journal append-only.';

alter table public.reserves_mutations_appliquees enable row level security;

-- Lecture strictement cantonnée à l'organisation : le registre ne doit pas devenir un
-- oracle permettant de deviner l'activité d'un autre tenant.
create policy reserves_mutations_appliquees_select
  on public.reserves_mutations_appliquees for select
  using (public.reserves_lecture_autorisee(reserve_id));

-- Aucune écriture directe : seules les fonctions `security definer` y touchent.
revoke all on table public.reserves_mutations_appliquees from public, anon;
grant select on table public.reserves_mutations_appliquees to authenticated;

/**
 * Transition idempotente, destinée à la file hors-ligne.
 *
 * Distingue trois issues, là où `reserves_appliquer_transition` n'en connaissait qu'une
 * (l'exception). C'est cette distinction qui permet à la file de ne pas présenter un
 * rejeu bénin comme un échec, ni un vrai conflit comme un succès :
 *
 *   'appliquee' — la transition vient d'être appliquée ;
 *   'rejeu'     — cette clé a DÉJÀ été appliquée ; aucun effet, aucune erreur ;
 *   'conflit'   — l'état du serveur a changé entre-temps et ne permet plus l'action.
 *
 * Le conflit n'est JAMAIS résolu ici : la fonction refuse et rend la main. Écraser une
 * levée déjà validée par une action préparée hors ligne ferait disparaître une décision
 * contradictoire prise entre deux entreprises.
 */
create or replace function public.reserves_transition_differee(
  p_reserve_id uuid,
  p_statut_apres text,
  p_commentaire text default null,
  p_intervenant_id uuid default null,
  p_origine_client_id uuid default null
) returns table (issue text, statut_courant text, motif text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_reserve public.reserves;
  v_acteur text;
  v_action text;
begin
  select * into v_reserve from public.reserves where id = p_reserve_id;
  if not found then raise exception 'Réserve introuvable'; end if;

  -- L'autorisation d'abord : une clé d'idempotence ne dispense jamais d'être acteur.
  v_acteur := public.reserves_acteur_courant(p_reserve_id);
  if v_acteur is null then raise exception 'Action non autorisée sur cette réserve'; end if;

  if p_origine_client_id is not null and exists (
    select 1 from public.reserves_mutations_appliquees m
    where m.entreprise_id = v_reserve.entreprise_id
      and m.origine_client_id = p_origine_client_id
  ) then
    issue := 'rejeu'; statut_courant := v_reserve.statut; motif := null;
    return next; return;
  end if;

  -- L'état visé est DÉJÀ atteint : la file avait raison, le serveur aussi. Ce n'est ni
  -- un échec ni un conflit — typiquement, la réponse du premier envoi s'est perdue.
  if v_reserve.statut = p_statut_apres then
    issue := 'rejeu'; statut_courant := v_reserve.statut; motif := null;
    return next; return;
  end if;

  select t.action into v_action from public.reserves_transitions t
  where t.statut_avant = v_reserve.statut
    and t.statut_apres = p_statut_apres
    and t.acteur = v_acteur;

  if v_action is null then
    issue := 'conflit';
    statut_courant := v_reserve.statut;
    motif := format(
      'La réserve est passée à « %s » pendant que l''appareil était hors ligne : '
      'l''action préparée (« %s ») ne s''applique plus.',
      v_reserve.statut, p_statut_apres);
    return next; return;
  end if;

  perform public.reserves_appliquer_transition(
    p_reserve_id, p_statut_apres, p_commentaire, p_intervenant_id);

  if p_origine_client_id is not null then
    insert into public.reserves_mutations_appliquees (
      entreprise_id, reserve_id, origine_client_id, action
    ) values (v_reserve.entreprise_id, p_reserve_id, p_origine_client_id, v_action);
  end if;

  select r.statut into statut_courant from public.reserves r where r.id = p_reserve_id;
  issue := 'appliquee'; motif := null;
  return next;
end;
$$;

revoke all on function public.reserves_transition_differee(uuid, text, text, uuid, uuid)
  from public, anon;
grant execute on function public.reserves_transition_differee(uuid, text, text, uuid, uuid)
  to authenticated;
