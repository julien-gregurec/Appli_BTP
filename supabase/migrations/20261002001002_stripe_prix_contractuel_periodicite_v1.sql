-- ELSATIA — Stripe readiness P1 (train canonique V9) : prix contractuel au
-- changement de périodicité.
--
-- Portage sémantique du lot Stripe readiness (claude/elegant-turing-b4ewbp,
-- docs/qualification/ELSATIA_STRIPE_READINESS_PORT_PLAN_V1.md §4.1 P1, décision
-- propriétaire 5). La migration source 20261002000184 (base main) n'est PAS
-- reprise : elle double 20260928000802 et son numéro ne doit jamais être réutilisé.
--
-- Défaut : depuis 20260927000507, `synchroniser_abonnement_stripe_service` décide
-- « même contrat » sur le seul `code_offre`. Un passage Pro mensuel → Pro annuel
-- gardait donc 249 € comme prix contractuel avec `periodicite = 'annuel'`
-- (prix souscrit / MRR faux, alors que Stripe facture 2 490 €).
--
-- Correctif : corps repris À L'IDENTIQUE de 20260927000507 (dernière définition du
-- train, inchangée de 0801 à 1001), seule la condition « même contrat » compare
-- aussi la périodicité. Signature, propriétaire, SECURITY DEFINER, search_path et
-- grants inchangés. AUCUNE écriture de données : un contrat existant n'est
-- réévalué qu'au prochain changement observé chez Stripe ; à offre et périodicité
-- inchangées, le prix historique reste conservé (contrat 507).
-- Aucune fonction plateforme n'est touchée (comparaison 813 : sans recouvrement).

create or replace function public.synchroniser_abonnement_stripe_service(
  p_entreprise_id uuid,
  p_stripe_subscription_id text,
  p_stripe_customer_id text,
  p_statut text,
  p_offre text,
  p_periodicite text,
  p_echeance date,
  p_essai_fin date,
  p_annulation_prevue_at timestamptz,
  p_debut_periode timestamptz,
  p_fin_periode timestamptz
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub_actuelle text;
  v_essai_debut date;
  v_essai_fin date;
  v_essai_fin_retenue date;
  v_nature_ecart text;
  v_offre_valide boolean := p_offre in ('essentiel','premium','mini','pro','business','entreprise','sur_mesure');
  v_periodicite_valide boolean := p_periodicite in ('mensuel','annuel');
  v_plan_id uuid;
  v_plan_version integer;
  v_plan_mensuel numeric;
  v_plan_annuel numeric;
  v_contrat_offre text;
  v_contrat_prix numeric;
  v_contrat_version integer;
  v_contrat_periodicite text;
  v_meme_offre boolean;
  v_prix numeric;
  v_statut_contrat text;
begin
  -- Garde tenant fail-closed : la subscription doit être celle de l'entreprise
  -- (ou première liaison si l'entreprise n'a pas encore de subscription).
  select stripe_subscription_id, abonnement_essai_debut, abonnement_essai_fin
    into v_sub_actuelle, v_essai_debut, v_essai_fin
  from public.entreprises where id = p_entreprise_id
  for update;
  if not found then
    raise exception 'Entreprise introuvable' using errcode = 'P0002';
  end if;
  if nullif(btrim(p_stripe_subscription_id), '') is null then
    raise exception 'Identifiant de subscription Stripe manquant' using errcode = '22023';
  end if;
  if v_sub_actuelle is not null and v_sub_actuelle is distinct from p_stripe_subscription_id then
    raise exception 'Subscription Stripe non liée à cette entreprise' using errcode = '42501';
  end if;
  if p_statut not in ('essai','actif','suspendu','annule') then
    raise exception 'Statut d''abonnement invalide' using errcode = '22023';
  end if;

  -- Essai : l'essai local fait autorité. Stripe peut seulement le raccourcir.
  v_essai_fin_retenue := public.essai_fin_bornee_stripe(v_essai_debut, v_essai_fin, p_essai_fin);
  v_nature_ecart := case
    when p_essai_fin is null or v_essai_debut is null then null
    when p_essai_fin < v_essai_debut then 'avant_debut_essai'
    when p_essai_fin > v_essai_fin_retenue then 'depasse_fenetre_locale'
    else null
  end;
  if v_nature_ecart is not null then
    insert into public.stripe_essai_ecarts(
      entreprise_id, stripe_subscription_id, nature, trial_end_stripe,
      essai_debut, essai_fin_locale, essai_fin_retenue
    ) values (
      p_entreprise_id, p_stripe_subscription_id, v_nature_ecart, p_essai_fin,
      v_essai_debut, coalesce(v_essai_fin, v_essai_debut + 30), coalesce(v_essai_fin_retenue, v_essai_debut + 30)
    )
    on conflict (entreprise_id, stripe_subscription_id, nature, trial_end_stripe) do update set
      occurrences = public.stripe_essai_ecarts.occurrences + 1,
      essai_fin_retenue = excluded.essai_fin_retenue,
      derniere_observation_at = now();
  end if;

  -- Mise à jour bornée : liste de colonnes fixe, aucune écriture arbitraire.
  update public.entreprises set
    stripe_subscription_id = p_stripe_subscription_id,
    stripe_customer_id = nullif(btrim(p_stripe_customer_id), ''),
    abonnement_statut = p_statut,
    abonnement_echeance = p_echeance,
    abonnement_essai_fin = v_essai_fin_retenue,
    abonnement_annulation_prevue_at = p_annulation_prevue_at,
    abonnement_offre = case when v_offre_valide then p_offre else abonnement_offre end,
    abonnement_periodicite = case when v_periodicite_valide then p_periodicite else abonnement_periodicite end,
    updated_at = now()
  where id = p_entreprise_id;

  -- Contrat tarifaire (comportement identique à l'ancien synchroniserAbonnement JS).
  if v_offre_valide and v_periodicite_valide then
    select id, version, prix_mensuel_ht, prix_annuel_ht
      into v_plan_id, v_plan_version, v_plan_mensuel, v_plan_annuel
    from public.plans_abonnement
    where code = p_offre and actif = true
    limit 1;

    select code_offre, prix_contractuel_ht, version_tarif, periodicite
      into v_contrat_offre, v_contrat_prix, v_contrat_version, v_contrat_periodicite
    from public.abonnements_entreprises
    where entreprise_id = p_entreprise_id;

    if v_plan_id is not null then
      -- P1 (train V9) : « même contrat » = même offre ET même périodicité. Un passage
      -- Pro mensuel → Pro annuel prend le prix annuel canonique de la version active
      -- (Price réellement facturé), au lieu de garder le prix mensuel du contrat.
      v_meme_offre := (v_contrat_offre is not distinct from p_offre)
        and (v_contrat_periodicite is not distinct from p_periodicite);
      v_prix := case
        when v_meme_offre and v_contrat_prix is not null then v_contrat_prix
        when p_periodicite = 'annuel' then v_plan_annuel
        else v_plan_mensuel
      end;
      v_statut_contrat := case p_statut
        when 'actif' then 'actif' when 'suspendu' then 'suspendu' when 'annule' then 'annule' else 'essai'
      end;
      if v_prix is not null then
        insert into public.abonnements_entreprises(
          entreprise_id, plan_id, code_offre, version_tarif, periodicite, prix_contractuel_ht,
          statut, debut_periode, fin_periode, stripe_subscription_id, stripe_customer_id, updated_at
        ) values (
          p_entreprise_id, v_plan_id, p_offre,
          case when v_meme_offre then coalesce(v_contrat_version, v_plan_version) else v_plan_version end,
          p_periodicite, v_prix, v_statut_contrat,
          p_debut_periode, p_fin_periode, p_stripe_subscription_id, nullif(btrim(p_stripe_customer_id), ''), now()
        )
        on conflict (entreprise_id) do update set
          plan_id = excluded.plan_id,
          code_offre = excluded.code_offre,
          version_tarif = excluded.version_tarif,
          periodicite = excluded.periodicite,
          prix_contractuel_ht = excluded.prix_contractuel_ht,
          statut = excluded.statut,
          debut_periode = excluded.debut_periode,
          fin_periode = excluded.fin_periode,
          stripe_subscription_id = excluded.stripe_subscription_id,
          stripe_customer_id = excluded.stripe_customer_id,
          updated_at = excluded.updated_at;
      end if;
    end if;
  end if;

  return p_statut;
end;
$$;

comment on function public.synchroniser_abonnement_stripe_service(uuid, text, text, text, text, text, date, date, timestamptz, timestamptz, timestamptz) is
  'Webhook abonnement : synchronise l''abonnement de base (entreprises + abonnements_entreprises) depuis l''observation Stripe. Garde tenant fail-closed, colonnes bornées, essai local borné (trial_end Stripe ne peut que le raccourcir). Prix contractuel conservé seulement à offre ET périodicité inchangées (P1, train V9). Chemin de service.';

-- `create or replace` conserve l'ACL de 20260904000262 / 20260927000507 ; réaffirmée ici.
revoke all on function public.synchroniser_abonnement_stripe_service(uuid, text, text, text, text, text, date, date, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.synchroniser_abonnement_stripe_service(uuid, text, text, text, text, text, date, date, timestamptz, timestamptz, timestamptz)
  to service_role;
