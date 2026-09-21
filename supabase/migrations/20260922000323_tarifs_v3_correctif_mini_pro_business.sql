-- TARIFS-V3 : correctif de la grille commerciale cible (Mini 79 / Pro 249 /
-- Business 449, annuel = mensuel x10). La version TARIFS-V2 (migration
-- 20260816000201) avait publie par erreur 69/199/399 pour ces trois offres,
-- avec un annuel qui ne respectait deja plus la regle x10. Ce correctif ne
-- touche ni les contrats existants (abonnements_entreprises garde son
-- prix_contractuel_ht historique) ni les anciennes versions de
-- plans_abonnement : il publie une nouvelle version active, comme le prevoit
-- deja plateforme_creer_version_tarif.
-- 'entreprise' (599/5990) et 'sur_mesure' (devis) sont deja corrects et ne
-- sont pas touches ici.

do $$
declare
  v_valide_du date := date '2026-09-22';
begin
  update public.plans_abonnement
  set actif = false,
      valide_au = v_valide_du - 1
  where actif
    and code in ('mini', 'pro', 'business');

  insert into public.plans_abonnement(
    code, version, nom, prix_mensuel_ht, prix_annuel_ht, devise,
    utilisateurs_inclus, administrateurs_inclus, operations_ia_incluses,
    stockage_go_inclus, fonctionnalites, actif, devis_obligatoire, valide_du
  )
  select
    cible.code,
    coalesce((select max(version) from public.plans_abonnement p where p.code = cible.code), 0) + 1,
    cible.nom,
    cible.prix_mensuel_ht,
    cible.prix_annuel_ht,
    'EUR',
    precedent.utilisateurs_inclus,
    precedent.administrateurs_inclus,
    precedent.operations_ia_incluses,
    precedent.stockage_go_inclus,
    precedent.fonctionnalites,
    true,
    false,
    v_valide_du
  from (values
    ('mini', 'Mini', 79::numeric, 790::numeric),
    ('pro', 'Pro', 249::numeric, 2490::numeric),
    ('business', 'Business', 449::numeric, 4490::numeric)
  ) as cible(code, nom, prix_mensuel_ht, prix_annuel_ht)
  join lateral (
    select p.*
    from public.plans_abonnement p
    where p.code = cible.code
      and not p.actif
    order by p.version desc
    limit 1
  ) precedent on true;
end $$;

notify pgrst, 'reload schema';
