-- Train canonique V8 : numéro d'origine 20260928000702 (A. Billing (claude/busy-darwin-tlpi3p)), renuméroté 20260928000802
-- (bloc V8 strictement après la dernière migration de V7, 20260928000701, projet partagé) ; corps inchangé.
-- ELSATIA — Billing & Subscription Lifecycle Qualification V1
-- (docs/qualification/ELSATIA_BILLING_SUBSCRIPTION_LIFECYCLE_V1.md, finding B-2)
--
-- Constat : après TARIFS-V2 (20260816000201) les versions ACTIVES de
-- `plans_abonnement` portent la grille 69 / 199 / 399 (annuel 690 / 1 990 /
-- 3 990). Cette grille est déclarée obsolète par la décision humaine
-- ELSATIA-TARIFICATION-CANONICAL-ALIGNMENT-V1 (docs/organisation/
-- TARIFICATION_CANONIQUE.md : « Toute divergence code / site / Stripe / doc est
-- un bug à corriger dans le sens de ce tableau »), figée par
-- src/lib/tarification.ts, tarification.canonical.json et verify:stripe-prices
-- (79 / 249 / 449 / 599, annuel = 10 × mensuel). Or le webhook d'abonnement
-- (`synchroniser_abonnement_stripe_service`) fixe `prix_contractuel_ht` d'un
-- NOUVEAU contrat depuis la version active : un client facturé 79 € par
-- Stripe était enregistré à 69 € (prix souscrit, MRR plateforme).
--
-- Correctif : nouvelle version active alignée sur la grille canonique pour
-- mini / pro / business (entreprise 599 / 5 990 déjà conforme ; sur_mesure
-- inchangé). Même méthode que TARIFS-V2 : versions précédentes désactivées,
-- jamais supprimées ; quotas et fonctionnalités recopiés. AUCUN effet
-- rétroactif : `abonnements_entreprises` n'est pas touché (un contrat existant
-- conserve son prix tant que son offre ne change pas — contrat 507). Idempotent :
-- sans effet si la version active porte déjà le prix canonique.

do $$
declare
  v_valide_du date := current_date;
  v_cible record;
  v_precedent public.plans_abonnement%rowtype;
begin
  for v_cible in
    select * from (values
      ('mini', 'Mini', 79::numeric, 790::numeric),
      ('pro', 'Pro', 249::numeric, 2490::numeric),
      ('business', 'Business', 449::numeric, 4490::numeric),
      ('entreprise', 'Entreprise', 599::numeric, 5990::numeric)
    ) as c(code, nom, mensuel, annuel)
  loop
    select * into v_precedent
    from public.plans_abonnement
    where code = v_cible.code and actif
    order by version desc
    limit 1;

    if found and v_precedent.prix_mensuel_ht = v_cible.mensuel
       and v_precedent.prix_annuel_ht = v_cible.annuel then
      continue;
    end if;

    if not found then
      select * into v_precedent
      from public.plans_abonnement
      where code = v_cible.code
      order by version desc
      limit 1;
    end if;

    update public.plans_abonnement
    set actif = false,
        valide_au = greatest(valide_du, v_valide_du - 1)
    where code = v_cible.code and actif;

    insert into public.plans_abonnement(
      code, version, nom, prix_mensuel_ht, prix_annuel_ht, devise,
      utilisateurs_inclus, administrateurs_inclus, operations_ia_incluses,
      stockage_go_inclus, fonctionnalites, actif, devis_obligatoire, valide_du
    ) values (
      v_cible.code,
      coalesce((select max(version) from public.plans_abonnement where code = v_cible.code), 0) + 1,
      v_cible.nom, v_cible.mensuel, v_cible.annuel, 'EUR',
      v_precedent.utilisateurs_inclus, v_precedent.administrateurs_inclus,
      v_precedent.operations_ia_incluses, v_precedent.stockage_go_inclus,
      coalesce(v_precedent.fonctionnalites, '[]'::jsonb), true, false, v_valide_du
    );
  end loop;
end $$;
