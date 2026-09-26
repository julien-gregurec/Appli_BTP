-- ELSATIA-STRIPE-SUBSCRIPTION-LIFECYCLE-CLOSURE-V1
--
-- Ferme 3 défauts préexistants du cycle abonnement Stripe révélés par la recette :
--
--   B3 — première liaison : quand `entreprises.stripe_subscription_id` est NULL,
--        la passerelle remise (`plateforme_commencer_expiration_remise_serveur`,
--        appelée AVANT `synchroniserAbonnement` dans `synchroniserAbonnementCoordonne`)
--        lève « Cible entreprise/abonnement incohérente ». On lie la subscription
--        à l'entreprise, de façon transactionnelle et fail-closed, AVANT la chaîne
--        remise.
--
--   B2 — dépassements facture (`invoice.created`) : après la migration 255,
--        `service_role` n'a plus SELECT sur `appareils_comptes`, `employes`,
--        `postes` ni SELECT/INSERT/UPDATE sur `abonnement_stockage_releves`.
--        Le calcul + l'écriture des relevés passent par des RPC de service.
--
--   B1 — concurrence : géré côté application (retry borné du verrou remise + code
--        HTTP « rejouable » au lieu d'un 500). Aucune migration requise pour B1 ;
--        seule une non-régression est vérifiée.
--
-- Contraintes communes : SECURITY DEFINER, `search_path` fixe, EXECUTE réservé à
-- `service_role` (jamais anon/authenticated), garde tenant, valeurs bornées,
-- idempotence, aucun grant large de table réaccordé. Migration 255 non modifiée.
-- Aucune capacité personne gérée ici. Aucune suppression de données métier.
--
-- Additif. Aucune migration historique modifiée.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- B3 — Liaison sûre subscription ↔ entreprise (première liaison)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.lier_subscription_entreprise_service(
  p_entreprise_id uuid,
  p_stripe_subscription_id text,
  p_stripe_customer_id text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub_actuelle text;
begin
  if nullif(btrim(p_stripe_subscription_id), '') is null then
    raise exception 'Identifiant de subscription Stripe manquant' using errcode = '22023';
  end if;

  select stripe_subscription_id into v_sub_actuelle
  from public.entreprises where id = p_entreprise_id
  for update;
  if not found then
    raise exception 'Entreprise introuvable' using errcode = 'P0002';
  end if;

  -- Déjà liée à cette subscription : idempotent.
  if v_sub_actuelle = p_stripe_subscription_id then
    return 'deja_lie';
  end if;

  -- Liée à une AUTRE subscription : jamais réécrite → fail-closed.
  if v_sub_actuelle is not null and v_sub_actuelle is distinct from p_stripe_subscription_id then
    raise exception 'Subscription Stripe non liée à cette entreprise' using errcode = '42501';
  end if;

  -- Première liaison : compare-and-swap sur NULL uniquement.
  update public.entreprises
  set stripe_subscription_id = p_stripe_subscription_id,
      stripe_customer_id = coalesce(nullif(btrim(p_stripe_customer_id), ''), stripe_customer_id),
      updated_at = now()
  where id = p_entreprise_id
    and stripe_subscription_id is null;
  if not found then
    -- Course perdue : une autre transaction a lié une valeur entre-temps.
    select stripe_subscription_id into v_sub_actuelle from public.entreprises where id = p_entreprise_id;
    if v_sub_actuelle is distinct from p_stripe_subscription_id then
      raise exception 'Subscription Stripe non liée à cette entreprise' using errcode = '42501';
    end if;
    return 'deja_lie';
  end if;
  return 'lie';
end;
$$;

comment on function public.lier_subscription_entreprise_service(uuid, text, text) is
  'Webhook abonnement : lie une subscription Stripe à une entreprise (première liaison uniquement, CAS sur NULL). Fail-closed si déjà liée à une autre valeur. Chemin de service.';

-- ─────────────────────────────────────────────────────────────────────────────
-- B2 — Dépassement appareils : calcul serveur (lecture des tables verrouillées)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.calculer_depassement_appareils_service(p_entreprise_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  -- Somme des tarifs mensuels de poste pour chaque salarié facturable dont le
  -- nombre d'appareils actifs dépasse 2 (mêmes règles que
  -- calculerDepassementsAppareilsFacturables). Un seul tarif par utilisateur.
  select coalesce(sum(t.tarif), 0)::numeric
  from (
    select greatest(0, coalesce((
             select po.tarif_compte_mensuel
             from public.employes e
             left join public.postes po
               on po.id = e.poste_id and po.entreprise_id = p_entreprise_id
             where e.utilisateur_id = sur.utilisateur_id
               and e.entreprise_id = p_entreprise_id
               and e.compte_application_statut in ('actif', 'pause')
             limit 1
           ), 0)) as tarif
    from (
      select ac.utilisateur_id
      from public.appareils_comptes ac
      where ac.entreprise_id = p_entreprise_id
        and ac.revoque_at is null
        and ac.utilisateur_id is not null
      group by ac.utilisateur_id
      having count(*) > 2
    ) sur
    where exists (
      select 1 from public.employes e2
      where e2.utilisateur_id = sur.utilisateur_id
        and e2.entreprise_id = p_entreprise_id
        and e2.compte_application_statut in ('actif', 'pause')
    )
  ) t;
$$;

comment on function public.calculer_depassement_appareils_service(uuid) is
  'Webhook abonnement : dépassement mensuel HT d''appareils (>2 par salarié facturable). Lecture seule. Chemin de service.';

-- ─────────────────────────────────────────────────────────────────────────────
-- B2 — Relevé de dépassement stockage : enregistrement + finalisation
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.enregistrer_releve_stockage_service(
  p_entreprise_id uuid,
  p_stripe_invoice_id text,
  p_offre text,
  p_periodicite text,
  p_octets bigint,
  p_fichiers bigint,
  p_quota_go numeric,
  p_depassement_go numeric,
  p_tarif_go_ht numeric,
  p_nombre_mois integer,
  p_montant_ht numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existant public.abonnement_stockage_releves%rowtype;
begin
  if nullif(btrim(p_stripe_invoice_id), '') is null then
    raise exception 'stripe_invoice_id obligatoire' using errcode = '22023';
  end if;
  if not exists (select 1 from public.entreprises where id = p_entreprise_id) then
    raise exception 'Entreprise introuvable' using errcode = 'P0002';
  end if;
  if coalesce(p_montant_ht, 0) < 0 or coalesce(p_montant_ht, 0) > 1000000 then
    raise exception 'Montant de dépassement invalide' using errcode = '22023';
  end if;

  select * into v_existant
  from public.abonnement_stockage_releves
  where stripe_invoice_id = p_stripe_invoice_id;

  -- Déjà facturé (item Stripe posé) ou dépassement nul déjà enregistré : no-op,
  -- pas de re-facturation sur un invoice.created rejoué.
  if found and (v_existant.stripe_invoice_item_id is not null
                or coalesce(v_existant.montant_ht, 0) = 0) then
    return jsonb_build_object('deja_traite', true, 'montant_ht', coalesce(v_existant.montant_ht, 0));
  end if;

  insert into public.abonnement_stockage_releves(
    entreprise_id, stripe_invoice_id, offre, periodicite, octets_utilises, fichiers,
    quota_go, depassement_go, tarif_go_ht, nombre_mois, montant_ht, updated_at
  ) values (
    p_entreprise_id, p_stripe_invoice_id, nullif(btrim(p_offre), ''), nullif(btrim(p_periodicite), ''),
    coalesce(p_octets, 0), coalesce(p_fichiers, 0), coalesce(p_quota_go, 0),
    coalesce(p_depassement_go, 0), coalesce(p_tarif_go_ht, 0), coalesce(p_nombre_mois, 1),
    coalesce(p_montant_ht, 0), now()
  )
  on conflict (stripe_invoice_id) do update set
    entreprise_id = excluded.entreprise_id,
    offre = excluded.offre,
    periodicite = excluded.periodicite,
    octets_utilises = excluded.octets_utilises,
    fichiers = excluded.fichiers,
    quota_go = excluded.quota_go,
    depassement_go = excluded.depassement_go,
    tarif_go_ht = excluded.tarif_go_ht,
    nombre_mois = excluded.nombre_mois,
    montant_ht = excluded.montant_ht,
    updated_at = excluded.updated_at;

  return jsonb_build_object('deja_traite', false, 'montant_ht', coalesce(p_montant_ht, 0));
end;
$$;

comment on function public.enregistrer_releve_stockage_service(uuid, text, text, text, bigint, bigint, numeric, numeric, numeric, integer, numeric) is
  'Webhook abonnement : upsert d''un relevé de dépassement stockage. Renvoie deja_traite=true si l''invoice a déjà été facturé (anti double-facturation). Chemin de service.';

create or replace function public.finaliser_releve_stockage_service(
  p_stripe_invoice_id text,
  p_stripe_invoice_item_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.abonnement_stockage_releves
  set stripe_invoice_item_id = nullif(btrim(p_stripe_invoice_item_id), ''),
      updated_at = now()
  where stripe_invoice_id = p_stripe_invoice_id;
end;
$$;

comment on function public.finaliser_releve_stockage_service(text, text) is
  'Webhook abonnement : consigne l''identifiant d''invoice item Stripe du dépassement stockage facturé. Chemin de service.';

-- ─────────────────────────────────────────────────────────────────────────────
-- ACL — chemin de service uniquement
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.lier_subscription_entreprise_service(uuid, text, text)         from public, anon, authenticated;
revoke all on function public.calculer_depassement_appareils_service(uuid)                    from public, anon, authenticated;
revoke all on function public.enregistrer_releve_stockage_service(uuid, text, text, text, bigint, bigint, numeric, numeric, numeric, integer, numeric)
  from public, anon, authenticated;
revoke all on function public.finaliser_releve_stockage_service(text, text)                   from public, anon, authenticated;

grant execute on function public.lier_subscription_entreprise_service(uuid, text, text)         to service_role;
grant execute on function public.calculer_depassement_appareils_service(uuid)                    to service_role;
grant execute on function public.enregistrer_releve_stockage_service(uuid, text, text, text, bigint, bigint, numeric, numeric, numeric, integer, numeric)
  to service_role;
grant execute on function public.finaliser_releve_stockage_service(text, text)                   to service_role;

notify pgrst, 'reload schema';

commit;
