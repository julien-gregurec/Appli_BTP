-- ELSATIA GP BUSINESS HARDENING V9.1 — portage sémantique de la recette métier GP
-- (source : claude/loving-heisenberg-ygkjck, rapport ELSATIA_GP_END_TO_END_BUSINESS_ACCEPTANCE_V1.md).
-- Rapport : docs/qualification/ELSATIA_GP_BUSINESS_HARDENING_V9_1.md — témoin : supabase/tests/gp_business_hardening_v9_1.test.sql
--
-- B25 : la rentabilité, le « Total facturé » du tableau de bord, l'historique
-- mensuel et les alertes « à encaisser » comptaient les factures brouillon
-- (et les avoirs dans les alertes). Calcul exclusivement arithmétique :
-- CA émis net = factures émises + avoirs émis. Le cache du tableau de bord est
-- recalculé une fois depuis les factures (idempotent).

CREATE OR REPLACE FUNCTION public.rentabilite_chantiers_calcul(p_entreprise_id uuid, p_chantier_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(chantier_id uuid, chantier_created_at timestamp with time zone, budget_ht numeric, facture_ht numeric, facture_ht_avoirs numeric, heures numeric, cout_main_oeuvre numeric, cout_horaire_manquant boolean, cout_achats numeric, cout_sous_traitance numeric, cout_stock numeric, cout_notes_frais numeric, cout_indemnites_paie numeric, marge numeric, taux numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_factures boolean;
  v_devis boolean;
  v_achats boolean;
  v_pointages_equipe boolean;
  v_cout_horaire boolean;
  v_rentabilite boolean;
  v_notes_toutes boolean;
  v_notes_virements boolean;
  v_tous_chantiers boolean;
  v_chantiers_assignes boolean;
begin
  if v_uid is null then
    raise exception 'RENTABILITE_ACCES_REFUSE' using errcode = '42501';
  end if;
  if p_entreprise_id is null or not public.est_membre_actif(p_entreprise_id) then
    raise exception 'RENTABILITE_ACCES_REFUSE' using errcode = '42501';
  end if;

  -- Permissions évaluées UNE fois (les policies les évaluent par ligne).
  -- peut_consulter_chantier = est_membre_actif ∧ (acces_chantiers ∨ gerer_chantiers
  -- ∨ (voir_chantiers_assignes ∧ salarié du compte affecté au chantier aujourd'hui)) :
  -- mêmes branches ci-dessous, sans l'appeler une fois par chantier (~2 ms chacun).
  v_tous_chantiers := public.a_permission(p_entreprise_id, 'acces_chantiers')
    or public.a_permission(p_entreprise_id, 'gerer_chantiers');
  v_chantiers_assignes := not v_tous_chantiers and public.a_permission(p_entreprise_id, 'voir_chantiers_assignes');
  v_factures := public.a_permission(p_entreprise_id, 'acces_factures');
  v_devis := public.a_permission(p_entreprise_id, 'acces_devis');
  v_achats := public.a_permission(p_entreprise_id, 'acces_achats');
  v_pointages_equipe := public.a_permission(p_entreprise_id, 'voir_pointages_equipe')
    or public.a_permission(p_entreprise_id, 'gerer_pointage')
    or public.a_permission(p_entreprise_id, 'valider_pointages');
  v_rentabilite := public.a_permission(p_entreprise_id, 'acces_rentabilite');
  v_cout_horaire := public.a_permission(p_entreprise_id, 'voir_cout_interne_employe') or v_rentabilite;
  v_notes_toutes := public.a_permission(p_entreprise_id, 'verifier_notes_frais')
    or public.a_permission(p_entreprise_id, 'gerer_notes_frais')
    or public.a_permission(p_entreprise_id, 'comptabiliser_notes_frais')
    or public.a_permission(p_entreprise_id, 'administrer_archivage_notes_frais');
  v_notes_virements := public.a_permission(p_entreprise_id, 'preparer_virements');

  return query
  with
  -- Salariés actifs rattachés au compte (est_employe_du_compte,
  -- peut_consulter_pointage_employe et peut_consulter_chantier, branche
  -- « ses propres lignes / ses chantiers »).
  mes_employes as materialized (
    select e.id
    from public.employes e
    where e.entreprise_id = p_entreprise_id
      and e.utilisateur_id = v_uid
      and e.statut not in ('sorti', 'suspendu')
  ),
  -- Chantiers où un salarié du compte est affecté aujourd'hui (branche
  -- voir_chantiers_assignes de peut_consulter_chantier).
  chantiers_assignes as materialized (
    select ec.chantier_id as id_chantier
    from public.equipes_chantiers ec
    where v_chantiers_assignes and ec.entreprise_id = p_entreprise_id
      and ec.employe_id in (select id from mes_employes)
      and ec.date_debut <= current_date and (ec.date_fin is null or ec.date_fin >= current_date)
    union
    select a.chantier_id
    from public.affectations a
    where v_chantiers_assignes and a.entreprise_id = p_entreprise_id
      and a.employe_id in (select id from mes_employes)
      and a.date = current_date
  ),
  -- Chantiers visibles (policy chantiers : peut_consulter_chantier).
  -- MATERIALIZED : le filtre ne doit pas être redescendu dans les parcours
  -- des tables filles.
  ch as materialized (
    select c.id, c.created_at
    from public.chantiers c
    where c.entreprise_id = p_entreprise_id
      and (p_chantier_id is null or c.id = p_chantier_id)
      and (v_tous_chantiers or c.id in (select ca.id_chantier from chantiers_assignes ca))
  ),
  couts as materialized (
    select ech.employe_id, ech.cout_horaire
    from public.employes_cout_horaire ech
    where v_cout_horaire and ech.entreprise_id = p_entreprise_id
  ),
  -- Règle /rentabilite : devis acceptés.
  dv as (
    select d.chantier_id, sum(d.montant_ht) as budget_ht
    from public.devis d
    where v_devis and d.entreprise_id = p_entreprise_id and d.statut = 'accepte'
      and d.chantier_id in (select id from ch)
    group by d.chantier_id
  ),
  -- B25 : CA émis = factures émises (brouillons et annulées exclus), y compris
  -- celles partiellement ou totalement créditées (statut avoir_emis), plus les
  -- avoirs émis (montants négatifs). Avant : brouillons comptés, et facture
  -- créditée exclue alors que son avoir restait déduit (déduction double).
  fa as (
    select f.chantier_id,
           sum(f.montant_ht) as facture_ht,
           coalesce(sum(f.montant_ht) filter (where f.type = 'avoir'), 0) as facture_ht_avoirs
    from public.factures f
    where v_factures and f.entreprise_id = p_entreprise_id
      and f.statut not in ('brouillon', 'annulee')
      and f.chantier_id in (select id from ch)
    group by f.chantier_id
  ),
  -- Règle /rentabilite (14f1112) : pointages validés uniquement, coût =
  -- heures × coût horaire actuel du salarié (0 si non renseigné ou non visible).
  pt as (
    select p.chantier_id,
           sum(p.heures_normales + p.heures_supplementaires) as heures,
           sum((p.heures_normales + p.heures_supplementaires) * coalesce(co.cout_horaire, 0)) as cout_main_oeuvre,
           bool_or(coalesce(co.cout_horaire, 0) = 0 and (p.heures_normales + p.heures_supplementaires) > 0) as cout_horaire_manquant
    from public.pointages p
    left join couts co on co.employe_id = p.employe_id
    where p.entreprise_id = p_entreprise_id
      and p.verification_statut = 'valide'
      and p.chantier_id in (select id from ch)
      and (v_pointages_equipe or p.employe_id in (select id from mes_employes))
    group by p.chantier_id
  ),
  -- Règle /rentabilite : dépenses non annulées ; sous-traitance à part.
  de as (
    select d.chantier_id,
           coalesce(sum(d.montant_ht) filter (where d.categorie = 'sous_traitance'), 0) as cout_sous_traitance,
           coalesce(sum(d.montant_ht) filter (where d.categorie is distinct from 'sous_traitance'), 0) as cout_achats
    from public.depenses_fournisseurs d
    where v_achats and d.entreprise_id = p_entreprise_id
      and d.statut is distinct from 'annulee'
      and d.chantier_id in (select id from ch)
    group by d.chantier_id
  ),
  -- Règle /rentabilite : sorties de stock × prix d'achat HT de l'article.
  st as (
    select m.chantier_id,
           sum(m.quantite * coalesce(a.prix_achat_ht, 0)) as cout_stock
    from public.mouvements_stock m
    left join public.articles_stock a
      on a.id = m.article_id
     and (a.entreprise_id = p_entreprise_id or public.est_membre_actif(a.entreprise_id))
    where m.entreprise_id = p_entreprise_id
      and m.type = 'sortie'
      and m.chantier_id in (select id from ch)
    group by m.chantier_id
  ),
  -- Règle /rentabilite : notes de frais validées (TTC).
  nf as (
    select n.chantier_id, sum(n.montant_ttc) as cout_notes_frais
    from public.notes_frais n
    where n.entreprise_id = p_entreprise_id
      and n.statut in ('valide', 'exporte_comptabilite', 'verrouille', 'archive', 'validee', 'remboursee')
      and n.chantier_id in (select id from ch)
      and (
        v_notes_toutes
        or n.employe_id in (select id from mes_employes)
        or (v_notes_virements and n.statut in ('valide', 'validee', 'exporte_comptabilite'))
      )
    group by n.chantier_id
  ),
  -- Règle couts_indemnites_paie_par_chantier.
  ip as (
    select i.chantier_id, sum(i.montant_total)::numeric as cout_indemnites_paie
    from public.indemnites_deplacement_paie i
    where v_rentabilite and i.entreprise_id = p_entreprise_id
      and i.chantier_id in (select id from ch)
    group by i.chantier_id
  ),
  lignes as (
    select ch.id, ch.created_at,
           coalesce(dv.budget_ht, 0) as budget_ht,
           coalesce(fa.facture_ht, 0) as facture_ht,
           coalesce(fa.facture_ht_avoirs, 0) as facture_ht_avoirs,
           coalesce(pt.heures, 0) as heures,
           coalesce(pt.cout_main_oeuvre, 0) as cout_main_oeuvre,
           coalesce(pt.cout_horaire_manquant, false) as cout_horaire_manquant,
           coalesce(de.cout_achats, 0) as cout_achats,
           coalesce(de.cout_sous_traitance, 0) as cout_sous_traitance,
           coalesce(st.cout_stock, 0) as cout_stock,
           coalesce(nf.cout_notes_frais, 0) as cout_notes_frais,
           coalesce(ip.cout_indemnites_paie, 0) as cout_indemnites_paie
    from ch
    left join dv on dv.chantier_id = ch.id
    left join fa on fa.chantier_id = ch.id
    left join pt on pt.chantier_id = ch.id
    left join de on de.chantier_id = ch.id
    left join st on st.chantier_id = ch.id
    left join nf on nf.chantier_id = ch.id
    left join ip on ip.chantier_id = ch.id
  )
  select l.id, l.created_at, l.budget_ht, l.facture_ht, l.facture_ht_avoirs, l.heures,
         l.cout_main_oeuvre, l.cout_horaire_manquant, l.cout_achats, l.cout_sous_traitance,
         l.cout_stock, l.cout_notes_frais, l.cout_indemnites_paie,
         l.facture_ht - l.cout_main_oeuvre - l.cout_achats - l.cout_sous_traitance
           - l.cout_indemnites_paie - l.cout_stock - l.cout_notes_frais as marge,
         case when l.facture_ht > 0 then
           (l.facture_ht - l.cout_main_oeuvre - l.cout_achats - l.cout_sous_traitance
             - l.cout_indemnites_paie - l.cout_stock - l.cout_notes_frais) / l.facture_ht * 100
         end as taux
  from lignes l;
end;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_indicateurs(p_entreprise_id uuid, p_aujourdhui date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_devis_acceptes_total numeric;
  v_devis_a_suivre jsonb;
  v_devis_alertes jsonb;
  v_devis_mois jsonb;
  v_factures_total numeric;
  v_factures_encaisse_total numeric;
  v_factures_alertes jsonb;
  v_factures_mois jsonb;
begin
  if public.a_permission(p_entreprise_id, 'acces_devis') then
    select c.devis_acceptes_total into v_devis_acceptes_total
    from public.entreprises_dashboard_cache c
    where c.entreprise_id = p_entreprise_id;

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id, 'numero', d.numero, 'statut', d.statut, 'montant_ttc', d.montant_ttc,
             'client', jsonb_build_object('nom', cl.nom, 'prenom', cl.prenom, 'societe', cl.societe)
           ) order by d.created_at desc), '[]'::jsonb)
      into v_devis_a_suivre
    from (
      select id, numero, statut, montant_ttc, client_id, created_at
      from public.devis
      where entreprise_id = p_entreprise_id
        and statut in ('brouillon', 'envoye')
      order by created_at desc
      limit 5
    ) d
    left join public.clients cl on cl.id = d.client_id;

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id, 'numero', d.numero, 'montant_ttc', d.montant_ttc, 'date_validite', d.date_validite
           ) order by d.date_validite), '[]'::jsonb)
      into v_devis_alertes
    from public.devis d
    where d.entreprise_id = p_entreprise_id
      and d.statut = 'envoye'
      and d.date_validite is not null
      and d.date_validite <= p_aujourdhui + 7;

    select coalesce(jsonb_agg(jsonb_build_object('cle', m.cle, 'total', m.total) order by m.cle), '[]'::jsonb)
      into v_devis_mois
    from (
      select to_char(date_emission, 'YYYY-MM') as cle, sum(montant_ttc) as total
      from public.devis
      where entreprise_id = p_entreprise_id
        and statut <> 'annule'
        and date_emission >= (date_trunc('month', p_aujourdhui) - interval '5 months')::date
      group by 1
    ) m;
  end if;

  if public.a_permission(p_entreprise_id, 'acces_factures') then
    select c.factures_total, c.factures_encaisse_total
      into v_factures_total, v_factures_encaisse_total
    from public.entreprises_dashboard_cache c
    where c.entreprise_id = p_entreprise_id;

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', f.id, 'numero', f.numero, 'montant_ttc', f.montant_ttc, 'montant_paye', f.montant_paye,
             'date_echeance', f.date_echeance,
             'client', jsonb_build_object('nom', cl.nom, 'prenom', cl.prenom, 'societe', cl.societe)
           ) order by f.date_echeance), '[]'::jsonb)
      into v_factures_alertes
    from public.factures f
    left join public.clients cl on cl.id = f.client_id
    where f.entreprise_id = p_entreprise_id
      and f.date_echeance is not null
      and f.statut not in ('brouillon', 'payee', 'annulee', 'avoir_emis')
      and f.montant_ttc > 0
      and f.date_echeance <= p_aujourdhui + 7;

    select coalesce(jsonb_agg(jsonb_build_object('cle', m.cle, 'total', m.total) order by m.cle), '[]'::jsonb)
      into v_factures_mois
    from (
      select to_char(date_emission, 'YYYY-MM') as cle, sum(montant_ttc) as total
      from public.factures
      where entreprise_id = p_entreprise_id
        and statut not in ('annulee', 'brouillon')
        and date_emission >= (date_trunc('month', p_aujourdhui) - interval '5 months')::date
      group by 1
    ) m;
  end if;

  return jsonb_build_object(
    'devis_acceptes_total', v_devis_acceptes_total,
    'devis_a_suivre', v_devis_a_suivre,
    'devis_alertes', v_devis_alertes,
    'devis_mois', v_devis_mois,
    'factures_total', v_factures_total,
    'factures_encaisse_total', v_factures_encaisse_total,
    'factures_alertes', v_factures_alertes,
    'factures_mois', v_factures_mois
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_maj_cache_dashboard_factures()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_delta_total numeric;
  v_delta_encaisse numeric;
begin
  if tg_op = 'INSERT' then
    v_delta_total := case when new.statut not in ('annulee', 'brouillon') then new.montant_ttc else 0 end;
    v_delta_encaisse := new.montant_paye;
    if v_delta_total <> 0 or v_delta_encaisse <> 0 then
      insert into public.entreprises_dashboard_cache (entreprise_id, factures_total, factures_encaisse_total)
      values (new.entreprise_id, v_delta_total, v_delta_encaisse)
      on conflict (entreprise_id)
      do update set factures_total = public.entreprises_dashboard_cache.factures_total + excluded.factures_total,
                    factures_encaisse_total = public.entreprises_dashboard_cache.factures_encaisse_total + excluded.factures_encaisse_total,
                    updated_at = now();
    end if;

  elsif tg_op = 'DELETE' then
    v_delta_total := case when old.statut not in ('annulee', 'brouillon') then -old.montant_ttc else 0 end;
    v_delta_encaisse := -old.montant_paye;
    if v_delta_total <> 0 or v_delta_encaisse <> 0 then
      insert into public.entreprises_dashboard_cache (entreprise_id, factures_total, factures_encaisse_total)
      values (old.entreprise_id, v_delta_total, v_delta_encaisse)
      on conflict (entreprise_id)
      do update set factures_total = public.entreprises_dashboard_cache.factures_total + excluded.factures_total,
                    factures_encaisse_total = public.entreprises_dashboard_cache.factures_encaisse_total + excluded.factures_encaisse_total,
                    updated_at = now();
    end if;

  elsif new.entreprise_id is distinct from old.entreprise_id then
    -- Changement de tenant : deux mises à jour distinctes, une par
    -- entreprise, au lieu d'un seul delta scalaire mal attribué.
    v_delta_total := case when old.statut not in ('annulee', 'brouillon') then -old.montant_ttc else 0 end;
    v_delta_encaisse := -old.montant_paye;
    if v_delta_total <> 0 or v_delta_encaisse <> 0 then
      insert into public.entreprises_dashboard_cache (entreprise_id, factures_total, factures_encaisse_total)
      values (old.entreprise_id, v_delta_total, v_delta_encaisse)
      on conflict (entreprise_id)
      do update set factures_total = public.entreprises_dashboard_cache.factures_total + excluded.factures_total,
                    factures_encaisse_total = public.entreprises_dashboard_cache.factures_encaisse_total + excluded.factures_encaisse_total,
                    updated_at = now();
    end if;

    v_delta_total := case when new.statut not in ('annulee', 'brouillon') then new.montant_ttc else 0 end;
    v_delta_encaisse := new.montant_paye;
    if v_delta_total <> 0 or v_delta_encaisse <> 0 then
      insert into public.entreprises_dashboard_cache (entreprise_id, factures_total, factures_encaisse_total)
      values (new.entreprise_id, v_delta_total, v_delta_encaisse)
      on conflict (entreprise_id)
      do update set factures_total = public.entreprises_dashboard_cache.factures_total + excluded.factures_total,
                    factures_encaisse_total = public.entreprises_dashboard_cache.factures_encaisse_total + excluded.factures_encaisse_total,
                    updated_at = now();
    end if;

  else
    -- Chemin inchangé (100 % du trafic applicatif réel aujourd'hui) :
    -- même entreprise avant/après, un seul delta scalaire, exactement le
    -- corps de fonction précédent (20260922000319).
    v_delta_total := 0;
    if old.statut not in ('annulee', 'brouillon') then
      v_delta_total := v_delta_total - old.montant_ttc;
    end if;
    if new.statut not in ('annulee', 'brouillon') then
      v_delta_total := v_delta_total + new.montant_ttc;
    end if;
    v_delta_encaisse := new.montant_paye - old.montant_paye;

    if v_delta_total <> 0 or v_delta_encaisse <> 0 then
      insert into public.entreprises_dashboard_cache (entreprise_id, factures_total, factures_encaisse_total)
      values (new.entreprise_id, v_delta_total, v_delta_encaisse)
      on conflict (entreprise_id)
      do update set factures_total = public.entreprises_dashboard_cache.factures_total + excluded.factures_total,
                    factures_encaisse_total = public.entreprises_dashboard_cache.factures_encaisse_total + excluded.factures_encaisse_total,
                    updated_at = now();
    end if;
  end if;

  return coalesce(new, old);
end;
$function$;

update public.entreprises_dashboard_cache c
   set factures_total = coalesce((select sum(f.montant_ttc) from public.factures f
                                   where f.entreprise_id = c.entreprise_id
                                     and f.statut not in ('annulee', 'brouillon')), 0),
       updated_at = now();
