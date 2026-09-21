-- ELSATIA-CAPACITY-STRIPE-R2-D-NET-V1 — fermeture d'une opération déjà convergente
--
-- Constat de recette live : quand le cron reprend une opération « needs_reconcile »
-- mais que l'état Stripe ↔ DB a ENTRE-TEMPS déjà convergé (ex. un webhook a rejoué
-- la même réconciliation avec succès), la réconciliation renvoie « aucune » et
-- n'appelle donc pas synchroniser_capacite_stripe_service : l'opération orpheline
-- reste « needs_reconcile » et est reprise indéfiniment par le cron.
--
-- Cette RPC permet au cron de fermer proprement une opération NON terminale dont
-- la réconciliation confirme la convergence. Aucune écriture d'entitlement, aucun
-- appel Stripe. Idempotent.
--
-- Additif. Aucune migration historique modifiée. ACL : chemin de service.

begin;

create or replace function public.capacite_stripe_finaliser_op_convergente(p_operation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entreprise uuid;
  v_statut text;
begin
  select entreprise_id, statut into v_entreprise, v_statut
  from public.operations_capacite_stripe
  where id = p_operation_id;
  if not found then
    return false;
  end if;

  -- Ne jamais rouvrir/altérer une opération déjà terminale.
  if v_statut in ('completed', 'failed') then
    return false;
  end if;

  perform public.verrou_operation_capacite(v_entreprise);

  update public.operations_capacite_stripe
  set statut = 'completed',
      erreur_courte = null,
      updated_at = now()
  where id = p_operation_id
    and statut not in ('completed', 'failed');

  return true;
end;
$$;

comment on function public.capacite_stripe_finaliser_op_convergente(uuid) is
  'R2-D : ferme (completed) une opération de capacité non terminale dont la réconciliation confirme la convergence Stripe↔DB. Aucun effet sur l''entitlement. Chemin de service (cron).';

revoke all on function public.capacite_stripe_finaliser_op_convergente(uuid) from public, anon;
grant execute on function public.capacite_stripe_finaliser_op_convergente(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Marqueur out-of-order sur no-op de réconciliation
--
-- Quand un webhook `customer.subscription.*` déclenche une réconciliation qui
-- n'aboutit à aucune mutation (Stripe ↔ DB déjà alignés), aucune RPC de service
-- n'était appelée : l'ancien code faisait un UPDATE direct de
-- `capacite_stripe_sync_evenement_at` depuis le client service_role, qui échoue
-- là où les droits sur public.entreprises sont restreints colonne-par-colonne.
-- Cette RPC SECURITY DEFINER avance le marqueur (monotone) sans autre effet.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.capacite_stripe_avancer_marqueur_evenement(
  p_entreprise_id uuid,
  p_evenement_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_evenement_at is null then
    return;
  end if;
  update public.entreprises
  set capacite_stripe_sync_evenement_at = greatest(
    coalesce(capacite_stripe_sync_evenement_at, 'epoch'::timestamptz), p_evenement_at)
  where id = p_entreprise_id;
end;
$$;

comment on function public.capacite_stripe_avancer_marqueur_evenement(uuid, timestamptz) is
  'R2-D : avance (monotone) le marqueur out-of-order capacité après une réconciliation sans mutation. Chemin de service.';

revoke all on function public.capacite_stripe_avancer_marqueur_evenement(uuid, timestamptz) from public, anon;
grant execute on function public.capacite_stripe_avancer_marqueur_evenement(uuid, timestamptz) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
