-- GP-EXTERNAL-PILOT-CLOSURE-V1 — une session support plateforme temporaire ne
-- doit jamais pouvoir se créer une persistance permanente dans l'entreprise
-- qu'elle assiste.
--
-- Constat : `est_membre_actif(entreprise_id)` (20260714000075) fait OU avec
-- `est_acces_support_actif(entreprise_id)` — un opérateur support avec une
-- session ouverte est donc traité comme un membre actif PARTOUT où cette
-- fonction gate une policy. Deux endroits précis créent un état qui SURVIT à
-- la fin de la session support :
--   - `utilisateurs_entreprises` (policy "bootstrap ou invitation par un membre
--     actif", 20260710000001) : INSERT gaté par `est_membre_actif` seul — un
--     support actif peut donc s'ajouter (ou ajouter n'importe quel compte) comme
--     membre PERMANENT de l'entreprise, sans limite de durée ;
--   - `permissions_poste` (policy "membres gèrent les permissions", même
--     migration) : ALL (donc aussi INSERT/UPDATE) gaté par `est_membre_actif`
--     seul — un support actif peut donc s'accorder n'importe quelle permission
--     PERMANENTE sur n'importe quel poste.
-- Une fois la session support terminée (`termine_at` renseigné), la ligne
-- ajoutée reste : la persistance a bien survécu à la session.
--
-- Correctif minimal, sans toucher au reste du modèle de permissions ni à la
-- simplification V1 documentée (« n'importe quel membre RÉEL actif peut
-- inviter » reste inchangé, c'est un choix produit assumé, pas le sujet ici) :
-- une nouvelle fonction `est_membre_actif_reel`, identique à `est_membre_actif`
-- MOINS le OU support, utilisée uniquement pour ces deux policies qui créent de
-- la persistance. Tout le reste de `est_membre_actif` (lecture, actions
-- métier réversibles pendant la session) est inchangé : le support garde son
-- accès d'assistance normal, il perd seulement la capacité de laisser une
-- trace permanente derrière lui.
create or replace function public.est_membre_actif_reel(p_entreprise_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.utilisateurs_entreprises ue
    join public.entreprises e on e.id = ue.entreprise_id
    where ue.entreprise_id = p_entreprise_id
      and ue.utilisateur_id = auth.uid()
      and ue.statut = 'actif'
      and e.abonnement_statut not in ('suspendu', 'annule')
      and (e.suspension_prevue_at is null or e.suspension_prevue_at > now())
  );
$$;

comment on function public.est_membre_actif_reel(uuid) is
  'Comme est_membre_actif, sans le OU support (est_acces_support_actif) : réservé aux policies qui créent un état PERMANENT (appartenance, permissions de poste), pour qu''une session support temporaire ne puisse jamais laisser de trace après sa fin.';

drop policy if exists "bootstrap ou invitation par un membre actif" on public.utilisateurs_entreprises;
create policy "bootstrap ou invitation par un membre actif" on public.utilisateurs_entreprises
  for insert with check (
    (utilisateur_id = auth.uid() and public.entreprise_sans_membres(entreprise_id))
    or public.est_membre_actif_reel(entreprise_id)
  );

drop policy if exists "admins modifient les appartenances" on public.utilisateurs_entreprises;
create policy "admins modifient les appartenances" on public.utilisateurs_entreprises
  for update using (public.est_membre_actif_reel(entreprise_id));

drop policy if exists "membres gèrent les permissions" on public.permissions_poste;
create policy "membres gèrent les permissions" on public.permissions_poste
  for all using (public.est_membre_actif_reel(entreprise_id) or public.entreprise_sans_membres(entreprise_id));

-- ---------------------------------------------------------------------------
-- relance_finaliser : contrôle d'accès manquant sur le chemin manuel
-- ---------------------------------------------------------------------------
--
-- `relance_reclamer` (la réclamation initiale) vérifie bien
-- `a_permission(p_entreprise_id, 'gerer_devis'|'gerer_factures')` pour une
-- relance manuelle. `relance_finaliser` (qui écrit le résultat — envoyée,
-- ignorée, échec, provider_message_id, motif) ne vérifiait que
-- `est_membre_actif`, sans revérifier le droit `gerer_devis`/`gerer_factures` :
-- n'importe quel membre actif de l'entreprise (ex. un ouvrier sans aucun droit
-- de facturation) pouvait donc forger le résultat d'une relance manuelle sur
-- un devis/une facture, y compris marquer 'envoyee' une relance jamais
-- réellement envoyée. Correctif : même permission que relance_reclamer,
-- dérivée de relances_documents.type_document (déjà lu juste avant).
create or replace function public.relance_finaliser(
  p_id uuid,
  p_statut text,
  p_provider_message_id text,
  p_erreur_public_safe text,
  p_motif text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entreprise_id uuid;
  v_automatique boolean;
  v_type_document text;
  v_permission text;
begin
  if p_statut not in ('envoyee', 'ignoree', 'echec') then
    raise exception 'Statut de finalisation invalide';
  end if;
  select entreprise_id, automatique, type_document into v_entreprise_id, v_automatique, v_type_document
  from public.relances_documents where id = p_id;
  if v_entreprise_id is null then
    raise exception 'Relance introuvable';
  end if;
  if not v_automatique then
    if not public.est_membre_actif(v_entreprise_id) then
      raise exception 'Accès refusé';
    end if;
    v_permission := case when v_type_document = 'devis' then 'gerer_devis' else 'gerer_factures' end;
    if not public.a_permission(v_entreprise_id, v_permission) then
      raise exception 'Accès refusé';
    end if;
  end if;

  update public.relances_documents
  set statut = p_statut,
      provider_message_id = p_provider_message_id,
      erreur_public_safe = p_erreur_public_safe,
      motif = p_motif,
      date_envoi = case when p_statut = 'envoyee' then now() else date_envoi end
  where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- relances_documents : SELECT retiré par erreur à `authenticated`
-- ---------------------------------------------------------------------------
--
-- 20260911000297 révoque SELECT/INSERT/UPDATE/DELETE sur `relances_documents`
-- pour `authenticated` ET `service_role`. Le retrait d'INSERT/UPDATE/DELETE
-- pour `authenticated` est correct et volontaire (le commentaire de
-- 20260824000230 le dit explicitement : "Aucune policy insert/update/delete
-- pour authenticated : toute écriture passe exclusivement par les RPC
-- security definer" — relance_reclamer/relance_finaliser, SECURITY DEFINER,
-- n'ont pas besoin de ce GRANT pour écrire). Mais le retrait de SELECT casse
-- l'affichage de l'historique des relances sur les pages devis/facture, qui
-- lit directement la table (protégée par la policy RLS "membres
-- relances_documents", déjà scopée à `est_membre_actif(entreprise_id)`) :
-- rétablir seulement SELECT restaure l'affichage sans reproduire le problème
-- que 297 corrigeait ailleurs (aucun privilège d'écriture n'est redonné).
grant select on table public.relances_documents to authenticated;

notify pgrst, 'reload schema';
