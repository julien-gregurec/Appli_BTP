-- Train canonique V9 : numéro d'origine 20260928000813 (GP residual data correctness (claude/optimistic-hopper-0ytout)), renuméroté 20261002001101
-- (bloc V9 strictement après 20261002000901 / 20261002001003, ordre relatif d'origine conservé) ; corps inchangé.
-- ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1 — exports comptables, TVA,
-- trésorerie et totaux des dépenses calculés sur TOUTES les lignes.
--
-- Constat (preuve rouge : docs/qualification/witnesses/finance-aggregates-v1/) :
-- PostgREST plafonne chaque réponse à `max_rows` = 1 000 lignes
-- (supabase/config.toml), sans erreur. Les exports `/api/exports/comptabilite`
-- (journal des ventes, règlements, achats, TVA déductible), la trésorerie et
-- les totaux de /depenses lisaient des tables entières en une requête puis
-- sommaient côté Next : au-delà de 1 000 lignes, export tronqué et totaux faux,
-- en silence. L'export « TVA collectée » échouait en plus systématiquement
-- (PGRST201 : `lignes_factures` porte deux clés étrangères vers `factures`).
-- Paginer ces lectures ne suffit pas : le coût RLS par ligne (`a_permission` /
-- `est_membre_actif`, et pour `paiements` une sous-requête corrélée sans
-- colonne d'entreprise) rend chaque page aussi chère que la lecture entière
-- (journal des règlements à 20 000 lignes : 185 s avant correction).
--
-- Correctif : l'export est produit directement en base, en une valeur `jsonb`
-- (non soumise à `max_rows`), avec exactement les mêmes filtres, colonnes et
-- règles qu'auparavant. Aucune règle fiscale n'est modifiée : la base HT d'une
-- ligne de facture reste `quantite × prix_unitaire_ht × (1 − remise_ligne/100)`
-- et sa TVA `base × taux/100`, sans arrondi intermédiaire, agrégées par
-- facture et par taux comme le faisait la route.
--
-- Sécurité — même motif que `factures_liste_paginee` / `dashboard_indicateurs`
-- (SECURITY DEFINER, `search_path` figé) : chaque bloc de données n'est rempli
-- que si l'appelant satisfait la policy RESTRICTIVE de la table d'origine,
-- reproduite à l'identique et évaluée une fois pour l'entreprise demandée :
--   factures / lignes_factures / paiements → a_permission(e, 'acces_factures')
--   clients (fiche jointe)                 → a_permission(e, 'acces_clients')
--   depenses_fournisseurs / fournisseurs /
--   reglements_fournisseurs                → a_permission(e, 'acces_achats')
--   chantiers (nom joint)                  → peut_consulter_chantier(e, id)
-- `a_permission` inclut `est_membre_actif` (policy PERMISSIVE), la révocation
-- de session et l'accès support : un appelant sans droit reçoit des listes
-- vides, exactement comme les lectures RLS qu'il remplace. La permission
-- `acces_exports` reste contrôlée par la route (inchangé). Exécution réservée
-- à `authenticated` (ni `anon`, ni PUBLIC).
--
-- Volume : au-delà de 250 000 lignes, l'export échoue explicitement
-- (EXPORT_TROP_VOLUMINEUX) au lieu d'être tronqué.

-- ─────────────────────────────────────────────────────────────
-- Journal des ventes
-- ─────────────────────────────────────────────────────────────
create or replace function public.export_comptable_ventes(p_entreprise_id uuid, p_debut date, p_fin date)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_clients boolean;
  v_n bigint;
  v_lignes jsonb;
begin
  if not public.a_permission(p_entreprise_id, 'acces_factures') then
    return '[]'::jsonb;
  end if;
  v_clients := public.a_permission(p_entreprise_id, 'acces_clients');

  select count(*) into v_n
  from public.factures f
  where f.entreprise_id = p_entreprise_id and f.numero is not null
    and f.date_emission >= p_debut and f.date_emission <= p_fin;
  if v_n > 250000 then
    raise exception 'EXPORT_TROP_VOLUMINEUX' using errcode = '54000';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'numero', f.numero, 'date_emission', f.date_emission, 'date_echeance', f.date_echeance,
           'type', f.type, 'statut', f.statut,
           'montant_ht', f.montant_ht, 'montant_tva', f.montant_tva, 'montant_ttc', f.montant_ttc, 'montant_paye', f.montant_paye,
           'client_snapshot', f.client_snapshot,
           'client', case when v_clients and c.id is not null then jsonb_build_object(
             'reference_interne', c.reference_interne, 'nom', c.nom, 'prenom', c.prenom, 'societe', c.societe) end
         ) order by f.date_emission, f.numero), '[]'::jsonb)
    into v_lignes
  from public.factures f
  left join public.clients c on c.id = f.client_id and c.entreprise_id = f.entreprise_id
  where f.entreprise_id = p_entreprise_id and f.numero is not null
    and f.date_emission >= p_debut and f.date_emission <= p_fin;
  return v_lignes;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Règlements clients
-- ─────────────────────────────────────────────────────────────
create or replace function public.export_comptable_reglements(p_entreprise_id uuid, p_debut date, p_fin date)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_clients boolean;
  v_n bigint;
  v_lignes jsonb;
begin
  if not public.a_permission(p_entreprise_id, 'acces_factures') then
    return '[]'::jsonb;
  end if;
  v_clients := public.a_permission(p_entreprise_id, 'acces_clients');

  select count(*) into v_n
  from public.paiements p
  join public.factures f on f.id = p.facture_id
  where f.entreprise_id = p_entreprise_id and p.date >= p_debut and p.date <= p_fin;
  if v_n > 250000 then
    raise exception 'EXPORT_TROP_VOLUMINEUX' using errcode = '54000';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'date', p.date, 'montant', p.montant, 'mode', p.mode, 'reference', p.reference,
           'facture', jsonb_build_object(
             'numero', f.numero, 'entreprise_id', f.entreprise_id, 'type', f.type, 'client_snapshot', f.client_snapshot,
             'client', case when v_clients and c.id is not null then jsonb_build_object(
               'reference_interne', c.reference_interne, 'nom', c.nom, 'prenom', c.prenom, 'societe', c.societe) end)
         ) order by p.date, f.numero, p.id), '[]'::jsonb)
    into v_lignes
  from public.paiements p
  join public.factures f on f.id = p.facture_id
  left join public.clients c on c.id = f.client_id and c.entreprise_id = f.entreprise_id
  where f.entreprise_id = p_entreprise_id and p.date >= p_debut and p.date <= p_fin;
  return v_lignes;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Journal des achats et TVA déductible (pièces non annulées)
-- ─────────────────────────────────────────────────────────────
create or replace function public.export_comptable_achats(p_entreprise_id uuid, p_debut date, p_fin date)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_n bigint;
  v_lignes jsonb;
begin
  if not public.a_permission(p_entreprise_id, 'acces_achats') then
    return '[]'::jsonb;
  end if;

  select count(*) into v_n
  from public.depenses_fournisseurs d
  where d.entreprise_id = p_entreprise_id and d.date_piece >= p_debut and d.date_piece <= p_fin and d.statut <> 'annulee';
  if v_n > 250000 then
    raise exception 'EXPORT_TROP_VOLUMINEUX' using errcode = '54000';
  end if;

  with chantiers_visibles as (
    select ch.id, ch.nom
    from public.chantiers ch
    where ch.entreprise_id = p_entreprise_id
      and ch.id in (select d.chantier_id from public.depenses_fournisseurs d
                    where d.entreprise_id = p_entreprise_id and d.chantier_id is not null
                      and d.date_piece >= p_debut and d.date_piece <= p_fin)
      and public.peut_consulter_chantier(ch.entreprise_id, ch.id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'numero_piece', d.numero_piece, 'date_piece', d.date_piece, 'date_echeance', d.date_echeance,
           'categorie', d.categorie, 'statut', d.statut,
           'montant_ht', d.montant_ht, 'taux_tva', d.taux_tva, 'montant_tva', d.montant_tva,
           'montant_ttc', d.montant_ttc, 'montant_regle', d.montant_regle,
           'fournisseur', case when fo.id is not null then jsonb_build_object('nom', fo.nom) end,
           'chantier', case when cv.id is not null then jsonb_build_object('nom', cv.nom) end
         ) order by d.date_piece, d.numero_piece, d.id), '[]'::jsonb)
    into v_lignes
  from public.depenses_fournisseurs d
  left join public.fournisseurs fo on fo.id = d.fournisseur_id and fo.entreprise_id = d.entreprise_id
  left join chantiers_visibles cv on cv.id = d.chantier_id
  where d.entreprise_id = p_entreprise_id and d.date_piece >= p_debut and d.date_piece <= p_fin and d.statut <> 'annulee';
  return v_lignes;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- TVA collectée : base et TVA par facture et par taux
-- ─────────────────────────────────────────────────────────────
create or replace function public.export_comptable_tva_collectee(p_entreprise_id uuid, p_debut date, p_fin date)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_n bigint;
  v_lignes jsonb;
begin
  if not public.a_permission(p_entreprise_id, 'acces_factures') then
    return jsonb_build_object('details', '[]'::jsonb, 'synthese', '[]'::jsonb);
  end if;

  select count(*) into v_n
  from public.lignes_factures l
  join public.factures f on f.id = l.facture_id and f.entreprise_id = l.entreprise_id
  where f.entreprise_id = p_entreprise_id and f.numero is not null
    and f.date_emission >= p_debut and f.date_emission <= p_fin and f.statut <> 'annulee';
  if v_n > 250000 then
    raise exception 'EXPORT_TROP_VOLUMINEUX' using errcode = '54000';
  end if;

  -- Détail par facture et par taux, puis synthèse par taux calculée ici en
  -- `numeric` exact : un cumul en flottant côté Next peut décaler un total
  -- d'un centime quand la somme exacte tombe sur une demi-unité
  -- (mesuré : 1 474 951,665 rendu 1 474 951,66).
  with groupes as (
    select f.date_emission, f.numero, l.taux_tva,
           sum(l.quantite * l.prix_unitaire_ht * (1 - l.remise_ligne / 100)) as base_ht,
           sum(l.quantite * l.prix_unitaire_ht * (1 - l.remise_ligne / 100) * l.taux_tva / 100) as tva
    from public.lignes_factures l
    join public.factures f on f.id = l.facture_id and f.entreprise_id = l.entreprise_id
    where f.entreprise_id = p_entreprise_id and f.numero is not null
      and f.date_emission >= p_debut and f.date_emission <= p_fin and f.statut <> 'annulee'
    group by f.id, f.date_emission, f.numero, l.taux_tva
  )
  select jsonb_build_object(
           'details', coalesce((select jsonb_agg(jsonb_build_object(
               'date_emission', g.date_emission, 'numero', g.numero, 'taux_tva', g.taux_tva,
               'base_ht', g.base_ht, 'tva', g.tva
             ) order by g.date_emission, g.numero, g.taux_tva) from groupes g), '[]'::jsonb),
           'synthese', coalesce((select jsonb_agg(jsonb_build_object(
               'taux_tva', t.taux_tva, 'base_ht', t.base_ht, 'tva', t.tva, 'ttc', t.base_ht + t.tva
             ) order by t.taux_tva) from (select g.taux_tva, sum(g.base_ht) as base_ht, sum(g.tva) as tva from groupes g group by g.taux_tva) t), '[]'::jsonb))
    into v_lignes;
  return v_lignes;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Trésorerie prévisionnelle : pièces ouvertes et flux réalisés
-- ─────────────────────────────────────────────────────────────
-- Mêmes règles que la page /tresorerie : factures hors payee / annulee /
-- avoir_emis / brouillon, avoirs non annulés rattachés à leur facture
-- d'origine (somme TTC par origine), dépenses hors payee / annulee,
-- encaissements et décaissements depuis `p_depuis`.
create or replace function public.tresorerie_donnees(p_entreprise_id uuid, p_depuis date)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_factures boolean := public.a_permission(p_entreprise_id, 'acces_factures');
  v_achats boolean := public.a_permission(p_entreprise_id, 'acces_achats');
  v_clients boolean := public.a_permission(p_entreprise_id, 'acces_clients');
  v_factures_ouvertes jsonb := '[]'::jsonb;
  v_avoirs jsonb := '[]'::jsonb;
  v_depenses_ouvertes jsonb := '[]'::jsonb;
  v_encaisse numeric := 0;
  v_decaisse numeric := 0;
begin
  if v_factures then
    with ouvertes as (
      select f.id, f.numero, f.date_emission, f.date_echeance, f.montant_ttc, f.montant_paye, f.statut, f.client_id, f.chantier_id, f.entreprise_id
      from public.factures f
      where f.entreprise_id = p_entreprise_id and f.statut not in ('payee', 'annulee', 'avoir_emis', 'brouillon')
    ), chantiers_visibles as (
      select ch.id, ch.nom from public.chantiers ch
      where ch.entreprise_id = p_entreprise_id
        and ch.id in (select o.chantier_id from ouvertes o where o.chantier_id is not null)
        and public.peut_consulter_chantier(ch.entreprise_id, ch.id)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', o.id, 'numero', o.numero, 'date_emission', o.date_emission, 'date_echeance', o.date_echeance,
             'montant_ttc', o.montant_ttc, 'montant_paye', o.montant_paye, 'statut', o.statut,
             'client', case when v_clients and c.id is not null then jsonb_build_object('nom', c.nom, 'prenom', c.prenom, 'societe', c.societe) end,
             'chantier', case when cv.id is not null then jsonb_build_object('nom', cv.nom) end
           ) order by o.id), '[]'::jsonb)
      into v_factures_ouvertes
    from ouvertes o
    left join public.clients c on c.id = o.client_id and c.entreprise_id = o.entreprise_id
    left join chantiers_visibles cv on cv.id = o.chantier_id;

    select coalesce(jsonb_agg(jsonb_build_object('facture_origine_id', a.facture_origine_id, 'montant_ttc', a.montant_ttc) order by a.facture_origine_id), '[]'::jsonb)
      into v_avoirs
    from (
      select f.facture_origine_id, sum(f.montant_ttc) as montant_ttc
      from public.factures f
      where f.entreprise_id = p_entreprise_id and f.type = 'avoir' and f.statut <> 'annulee' and f.facture_origine_id is not null
      group by f.facture_origine_id
    ) a;

    select coalesce(sum(p.montant), 0) into v_encaisse
    from public.paiements p
    join public.factures f on f.id = p.facture_id
    where f.entreprise_id = p_entreprise_id and p.date >= p_depuis;
  end if;

  if v_achats then
    with ouvertes as (
      select d.id, d.numero_piece, d.date_piece, d.date_echeance, d.montant_ttc, d.montant_regle, d.statut, d.fournisseur_id, d.chantier_id, d.entreprise_id
      from public.depenses_fournisseurs d
      where d.entreprise_id = p_entreprise_id and d.statut not in ('payee', 'annulee')
    ), chantiers_visibles as (
      select ch.id, ch.nom from public.chantiers ch
      where ch.entreprise_id = p_entreprise_id
        and ch.id in (select o.chantier_id from ouvertes o where o.chantier_id is not null)
        and public.peut_consulter_chantier(ch.entreprise_id, ch.id)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', o.id, 'numero_piece', o.numero_piece, 'date_piece', o.date_piece, 'date_echeance', o.date_echeance,
             'montant_ttc', o.montant_ttc, 'montant_regle', o.montant_regle, 'statut', o.statut,
             'fournisseur', case when fo.id is not null then jsonb_build_object('nom', fo.nom) end,
             'chantier', case when cv.id is not null then jsonb_build_object('nom', cv.nom) end
           ) order by o.id), '[]'::jsonb)
      into v_depenses_ouvertes
    from ouvertes o
    left join public.fournisseurs fo on fo.id = o.fournisseur_id and fo.entreprise_id = o.entreprise_id
    left join chantiers_visibles cv on cv.id = o.chantier_id;

    select coalesce(sum(r.montant), 0) into v_decaisse
    from public.reglements_fournisseurs r
    join public.depenses_fournisseurs d on d.id = r.depense_id
    where d.entreprise_id = p_entreprise_id and r.date >= p_depuis;
  end if;

  return jsonb_build_object(
    'factures_ouvertes', v_factures_ouvertes,
    'avoirs_par_facture', v_avoirs,
    'depenses_ouvertes', v_depenses_ouvertes,
    'encaisse', v_encaisse,
    'decaisse', v_decaisse
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Totaux de la page /depenses (toutes les pièces de l'entreprise)
-- ─────────────────────────────────────────────────────────────
-- Mêmes règles que la page : « Total TTC » hors pièces annulées, « Réglé »
-- sur toutes les pièces.
create or replace function public.depenses_fournisseurs_totaux(p_entreprise_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_total numeric := 0;
  v_regle numeric := 0;
  v_nombre bigint := 0;
begin
  if public.a_permission(p_entreprise_id, 'acces_achats') then
    select coalesce(sum(d.montant_ttc) filter (where d.statut <> 'annulee'), 0), coalesce(sum(d.montant_regle), 0), count(*)
      into v_total, v_regle, v_nombre
    from public.depenses_fournisseurs d
    where d.entreprise_id = p_entreprise_id;
  end if;
  return jsonb_build_object('total_ttc', v_total, 'regle', v_regle, 'nombre', v_nombre);
end;
$$;

revoke all on function public.export_comptable_ventes(uuid, date, date) from public, anon;
revoke all on function public.export_comptable_reglements(uuid, date, date) from public, anon;
revoke all on function public.export_comptable_achats(uuid, date, date) from public, anon;
revoke all on function public.export_comptable_tva_collectee(uuid, date, date) from public, anon;
revoke all on function public.tresorerie_donnees(uuid, date) from public, anon;
revoke all on function public.depenses_fournisseurs_totaux(uuid) from public, anon;
grant execute on function public.export_comptable_ventes(uuid, date, date) to authenticated;
grant execute on function public.export_comptable_reglements(uuid, date, date) to authenticated;
grant execute on function public.export_comptable_achats(uuid, date, date) to authenticated;
grant execute on function public.export_comptable_tva_collectee(uuid, date, date) to authenticated;
grant execute on function public.tresorerie_donnees(uuid, date) to authenticated;
grant execute on function public.depenses_fournisseurs_totaux(uuid) to authenticated;
