-- ELSATIA-CAPACITY-STRIPE-R2-D-V1 — annulation d'une baisse de capacité planifiée
--
-- R2-A/B ont posé la baisse « scheduled » (effet fin de période). Il manquait un
-- chemin borné pour qu'une entreprise revienne sur cette décision AVANT
-- l'échéance. Cette migration ajoute UNE RPC :
--
--   public.annuler_baisse_capacite_planifiee(p_entreprise_id uuid) → boolean
--
-- Contrat :
--   - verrou consultatif entreprise (même espace de clé que R2-A) ;
--   - agit uniquement si une baisse est planifiée ET pas encore échue ;
--   - agit uniquement si l'opération liée est encore « scheduled » ;
--   - la capacité EFFECTIVE R1 ne bouge pas — seule la planification est nettoyée ;
--   - l'opération « scheduled » est fermée proprement (statut terminal « failed »
--     + motif explicite : l'unique état terminal non-succès disponible, cf.
--     `prochaineTransitionSaga` scheduled + abandon → failed) ;
--   - journal append-only dans historique_capacite_personnes ;
--   - idempotent : un second appel renvoie false sans effet ;
--   - tenant-safe : membre habilité aux paramètres, ou plateforme avec AAL2 ;
--   - aucune suppression de personne, aucun appel Stripe (la ligne Stripe n'a
--     jamais été mutée pour une baisse : rien à défaire côté facturation).
--
-- Additif. Aucune migration historique modifiée. Aucun élargissement ACL au-delà
-- de authenticated/service_role (chemin action serveur, comme R2-B).

begin;

create or replace function public.annuler_baisse_capacite_planifiee(p_entreprise_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_planifiee integer;
  v_effet_at  timestamptz;
  v_op        uuid;
  v_op_statut text;
  v_actuel    integer;
begin
  -- Autorisation : self-service entreprise (permission paramètres) OU plateforme.
  -- Le chemin plateforme exige une session AAL2 (défense en profondeur, cohérent
  -- avec plateforme_definir_capacite_personnes_supplementaire).
  if public.est_plateforme_admin() then
    perform public.plateforme_exiger_session_aal2();
  elsif not (public.est_membre_actif(p_entreprise_id)
             and public.a_permission(p_entreprise_id, 'gerer_parametres')) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  perform public.verrou_operation_capacite(p_entreprise_id);

  select capacite_personnes_supplementaire_planifiee,
         capacite_personnes_planifiee_effet_at,
         capacite_personnes_planifiee_operation_id,
         capacite_personnes_supplementaire
    into v_planifiee, v_effet_at, v_op, v_actuel
  from public.entreprises
  where id = p_entreprise_id
  for update;

  if not found then
    raise exception 'Entreprise introuvable' using errcode = 'P0002';
  end if;

  -- Rien à annuler : aucune baisse planifiée (ou déjà appliquée / déjà annulée).
  if v_planifiee is null or v_effet_at is null then
    return false;
  end if;

  -- Échéance atteinte : l'application est du ressort du cron, plus d'annulation.
  if v_effet_at <= now() then
    return false;
  end if;

  -- L'opération liée doit être encore « scheduled » : ne jamais toucher un état
  -- terminal ni une opération repassée en vol.
  if v_op is not null then
    select statut into v_op_statut
    from public.operations_capacite_stripe
    where id = v_op;
    if v_op_statut is distinct from 'scheduled' then
      return false;
    end if;
  end if;

  -- Capacité EFFECTIVE inchangée. Seule la planification est nettoyée.
  update public.entreprises
  set capacite_personnes_supplementaire_planifiee = null,
      capacite_personnes_planifiee_effet_at = null,
      capacite_personnes_planifiee_operation_id = null
  where id = p_entreprise_id;

  -- Fermeture propre de l'opération planifiée.
  if v_op is not null then
    update public.operations_capacite_stripe
    set statut = 'failed',
        erreur_courte = 'Baisse de capacité planifiée annulée avant échéance',
        updated_at = now()
    where id = v_op
      and statut = 'scheduled';
  end if;

  -- Journal append-only : la valeur effective ne change pas ; on trace la levée
  -- de la planification (source « systeme » : chemin action serveur, pas Stripe).
  insert into public.historique_capacite_personnes(
    entreprise_id, action, ancien, nouveau, source, motif
  ) values (
    p_entreprise_id,
    'capacite_supplementaire_definie',
    jsonb_build_object(
      'capacite_personnes_supplementaire', coalesce(v_actuel, 0),
      'capacite_personnes_supplementaire_planifiee', v_planifiee,
      'planifiee_effet_at', v_effet_at
    ),
    jsonb_build_object(
      'capacite_personnes_supplementaire', coalesce(v_actuel, 0),
      'capacite_personnes_supplementaire_planifiee', null
    ),
    'systeme',
    'Annulation d''une baisse de capacité planifiée avant échéance'
  );

  return true;
end;
$$;

comment on function public.annuler_baisse_capacite_planifiee(uuid) is
  'R2-D : annule une baisse de capacité « scheduled » avant échéance. Capacité effective inchangée, opération fermée en « failed », journal append-only. Idempotent, tenant-safe.';

revoke all on function public.annuler_baisse_capacite_planifiee(uuid) from public, anon;
-- Chemin action serveur (authenticated). service_role conservé pour parité avec
-- les RPC de service R2-B ; la validation tenant est faite DANS la fonction.
grant execute on function public.annuler_baisse_capacite_planifiee(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
