-- Grille canonique Gestion Pro : Mini 79, Pro 249, Business 449, Entreprise 599
-- euros HT par mois ; l'engagement annuel est facturé 10 mois.
--
-- Une nouvelle version de plan est publiée pour chaque offre dont la version
-- active ne respecte pas cette grille. L'ancienne version est seulement retirée
-- du catalogue futur : AUCUN contrat existant (abonnements_entreprises,
-- entreprises.abonnement_prix_contractuel_ht) n'est modifié. Les abonnés
-- historiques restent facturés sur leur Price Stripe d'origine.
--
-- Idempotente : rejouée sur une base déjà alignée, elle ne fait rien.

do $$
declare
  v_grille record;
  v_actif public.plans_abonnement%rowtype;
  v_version integer;
  v_id uuid;
begin
  for v_grille in
    select * from (values
      ('mini', 79::numeric),
      ('pro', 249::numeric),
      ('business', 449::numeric),
      ('entreprise', 599::numeric)
    ) as g(code, prix_mensuel_ht)
  loop
    select * into v_actif
    from public.plans_abonnement
    where code = v_grille.code and actif
    order by version desc
    limit 1
    for update;

    if found
      and v_actif.prix_mensuel_ht = v_grille.prix_mensuel_ht
      and v_actif.prix_annuel_ht = v_grille.prix_mensuel_ht * 10 then
      continue;
    end if;

    select coalesce(max(version), 0) + 1 into v_version
    from public.plans_abonnement where code = v_grille.code;

    update public.plans_abonnement
    set actif = false, valide_au = greatest(valide_du, current_date)
    where code = v_grille.code and actif;

    insert into public.plans_abonnement(
      code, version, nom, prix_mensuel_ht, prix_annuel_ht, devise,
      utilisateurs_inclus, administrateurs_inclus, operations_ia_incluses,
      stockage_go_inclus, fonctionnalites, actif, devis_obligatoire, valide_du
    ) values (
      v_grille.code, v_version,
      coalesce(v_actif.nom, initcap(v_grille.code)),
      v_grille.prix_mensuel_ht, v_grille.prix_mensuel_ht * 10,
      coalesce(v_actif.devise, 'EUR'),
      coalesce(v_actif.utilisateurs_inclus, 0), v_actif.administrateurs_inclus,
      coalesce(v_actif.operations_ia_incluses, 0), coalesce(v_actif.stockage_go_inclus, 0),
      coalesce(v_actif.fonctionnalites, '[]'::jsonb), true, false, current_date
    ) returning id into v_id;

    insert into public.historique_tarification(action, ancien, nouveau, motif)
    values (
      'nouvelle_version_tarifaire',
      case when v_actif.id is null then null else to_jsonb(v_actif) end,
      jsonb_build_object('plan_id', v_id, 'code', v_grille.code, 'version', v_version,
        'prix_mensuel_ht', v_grille.prix_mensuel_ht, 'prix_annuel_ht', v_grille.prix_mensuel_ht * 10),
      'Grille canonique : annuel = 10 mois. Contrats existants inchangés.'
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
