-- [CONVERGENCE TRAIN] Porte le correctif notification qualifie depuis la branche source
-- fix/preview-blockers-reserves-notif-v1 (SHA 8c910fa0eb6d05813993b7e07f892ce593a0f480).
-- Numero source de cette migration : 20260922000318 (ledger de la branche source, divergent
-- du train a partir de e0a83eb). Renumerotee en 20260922000321, le prochain numero
-- reellement disponible du train (claude/compassionate-euler-5j6avr) au moment du portage :
-- 20260922000318/319/320 sont deja pris par le lot PERFORMANCE integre precedemment
-- (dashboard_indicateurs/cache/correctif changement entreprise) et ne doivent pas etre
-- ecrases. Contenu SQL fonctionnel strictement identique au commit source ; seul ce bandeau
-- de provenance a ete ajoute.

-- Correctif du blocker Preview « notification devis accepté » — audit dédié :
-- docs/qualification/ELSATIA_PREVIEW_BLOCKER_NOTIFICATION_DEVIS_ACCEPTE_V1.md.
--
-- Constat : `public.notifier_devis_accepte(uuid)` (migration
-- 20260922000311_gp_pilot_notification_devis_accepte.sql) insère
-- `niveau = 'info'` dans `public.notifications_utilisateurs`, une valeur qui
-- viole systématiquement `notifications_utilisateurs_niveau_check`
-- (`niveau in ('information','attention','critique')`, définie par
-- 20260715000081_securite_terrain_alertes_personnalisation.sql et jamais
-- modifiée depuis). Tout appel réel échoue avec une violation CHECK, avant même
-- que le journal d'audit ne soit inscrit (les deux INSERT partagent la même
-- transaction plpgsql).
--
-- Lequel a divergé : la contrainte, ou la RPC ? Vérifié sur l'ensemble du
-- dépôt, pas supposé — tous les AUTRES émetteurs de `niveau` (`notifier_permission`/
-- `notifier_utilisateur` dans 081, `notifications_planning` dans 135,
-- `alertes_pointage_manquant_et_a_valider` dans 162, `deleguer_alerte_
-- operationnelle` dans 220) utilisent exclusivement `'information'`,
-- `'attention'` ou `'critique'` — jamais `'info'`, sur plus de deux mois de
-- migrations. Le rendu (`src/app/(app)/dashboard/page.tsx`) ne discrimine que
-- `'critique'`/`'attention'`, donc ne masquait pas la divergence. Conclusion :
-- la contrainte représente le contrat canonique actuel ; c'est la RPC de
-- 20260922000311, la plus récente et non alignée avec les autres émetteurs, qui
-- a introduit la valeur incorrecte.
--
-- Correctif minimal : `'info'` → `'information'`, seul caractère du corps de la
-- fonction qui change. Signature, propriétaire, `security definer`,
-- `search_path`, la garde d'autorisation (`a_permission(..., 'gerer_devis')`),
-- le filtre d'entreprise/statut/permission de la requête de diffusion et
-- l'exclusion de l'auteur du changement sont repris à l'identique de 311.
-- `CREATE OR REPLACE FUNCTION` sur une signature inchangée préserve
-- automatiquement les GRANT/REVOKE déjà en place (`revoke all ... from public,
-- anon; grant execute ... to authenticated;`, migration 311) — aucun grant
-- touché ici ; réaffirmés explicitement ci-dessous pour rendre la posture de
-- sécurité vérifiable dans ce même fichier, sans en élargir la portée.
create or replace function public.notifier_devis_accepte(p_devis_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_devis public.devis;
  v_numero text;
begin
  select * into v_devis from public.devis where id = p_devis_id;
  if not found or not public.a_permission(v_devis.entreprise_id, 'gerer_devis') then
    raise exception 'Accès refusé';
  end if;

  v_numero := coalesce(v_devis.numero, 'brouillon');

  insert into public.journal_activite(entreprise_id, utilisateur_id, action, ressource, ressource_id, description, metadata)
  values (
    v_devis.entreprise_id, auth.uid(), 'devis_accepte', 'devis', p_devis_id,
    'Devis ' || v_numero || ' marqué accepté (saisie interne, accord obtenu hors ligne)',
    jsonb_build_object('numero', v_devis.numero, 'montant_ttc', v_devis.montant_ttc)
  );

  -- Un responsable visible = tout membre actif ayant le droit de gérer les
  -- devis pour cette entreprise, hors l'auteur du changement lui-même (il
  -- vient de le faire, inutile de le notifier de sa propre action).
  insert into public.notifications_utilisateurs (entreprise_id, utilisateur_id, type, titre, message, lien, niveau)
  select distinct v_devis.entreprise_id, ue.utilisateur_id, 'devis_accepte',
    'Devis accepté',
    'Le devis ' || v_numero || ' (' || to_char(v_devis.montant_ttc, 'FM999999990.00') || ' €) a été marqué accepté.',
    '/devis/' || p_devis_id, 'information'
  from public.utilisateurs_entreprises ue
  join public.permissions_poste pp
    on pp.entreprise_id = ue.entreprise_id and pp.poste_id = ue.poste_id
   and pp.cle_permission = 'gerer_devis' and pp.autorise
  where ue.entreprise_id = v_devis.entreprise_id
    and ue.statut = 'actif'
    and ue.utilisateur_id is distinct from auth.uid();
end;
$$;

comment on function public.notifier_devis_accepte(uuid) is
  'Journalise et notifie en interne le passage d''un devis à ''accepte'' (saisie administrative, pas une acceptation client en libre-service — ce parcours n''existe pas encore).';

revoke all on function public.notifier_devis_accepte(uuid) from public, anon;
grant execute on function public.notifier_devis_accepte(uuid) to authenticated;

notify pgrst, 'reload schema';
