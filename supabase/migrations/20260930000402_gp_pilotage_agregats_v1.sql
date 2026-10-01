-- ELSATIA-GP-RESIDUAL-DATA-CORRECTNESS-V1 — paie, notes de frais, CRM et
-- tableau de bord : indicateurs calculés en base.
--
-- Constats (docs/qualification/ELSATIA_GP_RESIDUAL_DATA_CORRECTNESS_V1.md §2) :
--   /paie/[id]       les cartes « Indemnités déplacements », « Primes »,
--                    « Notes de frais / acomptes » additionnaient les 25
--                    dossiers de la page affichée ; « Contrôles (N) » comptait
--                    une liste plafonnée à 1 000 ;
--   /notes-frais     les groupes par salarié (total, nombre, « à contrôler »)
--                    ne portaient que sur les 300 notes les plus récentes de
--                    toute l'entreprise : une note en attente plus ancienne
--                    disparaissait de la validation ;
--   /crm             « Factures à relancer » et « Reste à encaisser » sur une
--                    liste plafonnée à 1 000, « Rappels ouverts » sur les 100
--                    dernières communications ;
--   /dashboard       répartition des chantiers par statut, chantiers actifs et
--                    en retard calculés sur 1 000 chantiers, alertes de stock
--                    sur 1 000 articles pris dans un ordre arbitraire ; la
--                    lecture RLS de tous les chantiers coûtait en outre ~3 ms
--                    par chantier.
--
-- Même principe que 20260930000401 : SECURITY DEFINER, visibilité RLS de
-- chaque table reproduite et évaluée une fois, résultat jsonb (non plafonné),
-- parité RLS vérifiée par supabase/tests/gp_residuel_agregats_v1.test.sql.
--   dossiers_paie_salaries → est_employe_paie_courant(e, employe) ∨ peut_gerer_paie(e)
--                            ∨ a_permission(e, 'exporter_paie') ; employes (jointure
--                            !inner de la page) → est_membre_actif(e)
--   anomalies_paie         → dossier visible par est_employe_paie_courant ∨ peut_gerer_paie
--   notes_frais            → peut_consulter_note_frais ∨ policy virements ∨ policy créateur
--   factures               → est_membre_actif ∧ acces_factures
--   appels_contacts        → est_membre_actif ∧ acces_crm
--   chantiers              → peut_consulter_chantier
--   articles_stock         → est_membre_actif

-- 1. Paie : indicateurs d'une période sur TOUS les dossiers visibles et
--    filtrés comme la liste (statut, recherche nom / prénom, dossier propre).
create or replace function public.paie_periode_synthese(
  p_entreprise_id uuid,
  p_periode_id uuid,
  p_statut text default null,
  p_recherche text default null,
  p_dossier_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tous boolean;
  v_gestion boolean;
  v_miens uuid[];
  v_dossiers jsonb;
  v_anomalies bigint;
  v_motif text := nullif(btrim(coalesce(p_recherche, '')), '');
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  if p_periode_id is null then
    raise exception 'GP_AGREGAT_PARAMETRES' using errcode = '22023';
  end if;
  v_gestion := public.peut_gerer_paie(p_entreprise_id);
  v_tous := v_gestion or public.a_permission(p_entreprise_id, 'exporter_paie');
  select coalesce(array_agg(e.id), '{}') into v_miens
  from public.employes e
  where e.entreprise_id = p_entreprise_id and e.utilisateur_id = auth.uid();

  with dossiers as materialized (
    select d.*
    from public.dossiers_paie_salaries d
    join public.employes e on e.id = d.employe_id and e.entreprise_id = d.entreprise_id
    where d.entreprise_id = p_entreprise_id and d.periode_id = p_periode_id
      and (v_tous or d.employe_id = any(v_miens))
      and (p_dossier_id is null or d.id = p_dossier_id)
      and (p_statut is null or p_statut = '' or d.statut = p_statut)
      and (v_motif is null or e.nom ilike '%' || v_motif || '%' or e.prenom ilike '%' || v_motif || '%')
  )
  select jsonb_build_object(
           'nb', count(*),
           'total_paniers', coalesce(sum(total_paniers), 0),
           'total_trajets', coalesce(sum(total_trajets), 0),
           'total_transports', coalesce(sum(total_transports), 0),
           'total_grands_deplacements', coalesce(sum(total_grands_deplacements), 0),
           'total_primes', coalesce(sum(total_primes), 0),
           'total_acomptes', coalesce(sum(total_acomptes), 0),
           'total_notes_frais', coalesce(sum(total_notes_frais), 0))
    into v_dossiers
  from dossiers;

  select count(*) into v_anomalies
  from public.anomalies_paie a
  join public.dossiers_paie_salaries d on d.id = a.dossier_id
  where a.periode_id = p_periode_id and a.corrigee_at is null
    and d.entreprise_id = p_entreprise_id
    and (v_gestion or d.employe_id = any(v_miens))
    and (p_dossier_id is null or a.dossier_id = p_dossier_id);

  return v_dossiers || jsonb_build_object('nb_anomalies', v_anomalies);
end;
$$;

-- 2. Notes de frais : synthèse par salarié (nombre, total TTC, à contrôler)
--    sur TOUTES les notes visibles et filtrées comme la liste.
create or replace function public.notes_frais_synthese_employes(
  p_entreprise_id uuid,
  p_statut text default null,
  p_categorie text default null,
  p_chantier_id uuid default null,
  p_employe_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_emp_compte uuid[];
  v_nf_gestion boolean;
  v_nf_virements boolean;
  v_nf_saisie boolean;
  v jsonb;
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  select coalesce(array_agg(e.id) filter (where public.est_employe_du_compte(p_entreprise_id, e.id)), '{}')
    into v_emp_compte
  from public.employes e
  where e.entreprise_id = p_entreprise_id;
  v_nf_gestion := public.a_permission(p_entreprise_id, 'verifier_notes_frais')
               or public.a_permission(p_entreprise_id, 'gerer_notes_frais')
               or public.a_permission(p_entreprise_id, 'comptabiliser_notes_frais')
               or public.a_permission(p_entreprise_id, 'administrer_archivage_notes_frais');
  v_nf_virements := public.a_permission(p_entreprise_id, 'preparer_virements');
  v_nf_saisie := public.a_permission(p_entreprise_id, 'saisir_ses_notes_frais');

  with visibles as materialized (
    select n.employe_id, n.montant_ttc, n.statut
    from public.notes_frais n
    where n.entreprise_id = p_entreprise_id
      and (p_statut is null or p_statut = '' or n.statut = p_statut)
      and (p_categorie is null or p_categorie = '' or n.categorie = p_categorie)
      and (p_chantier_id is null or n.chantier_id = p_chantier_id)
      and (p_employe_id is null or n.employe_id = p_employe_id)
      and (
        v_nf_gestion or n.employe_id = any(v_emp_compte)
        or (v_nf_virements and n.statut in ('valide', 'validee', 'exporte_comptabilite'))
        or (v_nf_saisie and n.cree_par_utilisateur_id = auth.uid() and n.employe_id = any(v_emp_compte))
      )
  ), groupes as (
    select employe_id, count(*) as nb, coalesce(sum(montant_ttc), 0) as total,
           count(*) filter (where statut in ('soumis', 'en_verification', 'correction_demandee')) as a_verifier
    from visibles
    group by employe_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'employe_id', g.employe_id,
           'nom', case when em.id is not null then btrim(coalesce(em.prenom, '') || ' ' || coalesce(em.nom, '')) end,
           'nb', g.nb, 'total', g.total, 'a_verifier', g.a_verifier)
         order by g.a_verifier desc, em.nom nulls last, em.prenom, g.employe_id), '[]'::jsonb)
    into v
  from groupes g
  left join public.employes em on em.id = g.employe_id and em.entreprise_id = p_entreprise_id;
  return v;
end;
$$;

-- 3. CRM : indicateurs d'impayés et de rappels.
create or replace function public.gp_crm_synthese(p_entreprise_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_factures jsonb := jsonb_build_object('nb_a_relancer', 0, 'reste_a_encaisser', 0);
  v_rappels bigint := 0;
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  if public.a_permission(p_entreprise_id, 'acces_factures') then
    select jsonb_build_object('nb_a_relancer', count(*), 'reste_a_encaisser', coalesce(sum(f.montant_ttc - f.montant_paye), 0))
      into v_factures
    from public.factures f
    where f.entreprise_id = p_entreprise_id and f.statut in ('envoyee', 'payee_partiel', 'en_retard')
      and f.montant_ttc > f.montant_paye;
  end if;
  if public.a_permission(p_entreprise_id, 'acces_crm') then
    select count(*) into v_rappels
    from public.appels_contacts a
    where a.entreprise_id = p_entreprise_id and not coalesce(a.termine, false) and a.a_rappeler_at is not null;
  end if;
  return v_factures || jsonb_build_object('rappels_ouverts', v_rappels);
end;
$$;

-- 4. Tableau de bord : chantiers (répartition par statut, actifs, en retard).
create or replace function public.gp_dashboard_chantiers(p_entreprise_id uuid, p_aujourdhui date, p_limite integer default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tous boolean;
  v_ids uuid[] := '{}';
  v_actifs text[] := array['accepte', 'a_preparer', 'en_attente_validation', 'en_commande_materiel', 'en_cours', 'en_pause'];
  v_limite integer := least(greatest(coalesce(p_limite, 6), 1), 50);
  v jsonb;
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  v_tous := public.a_permission(p_entreprise_id, 'acces_chantiers') or public.a_permission(p_entreprise_id, 'gerer_chantiers');
  if not v_tous then
    if not public.a_permission(p_entreprise_id, 'voir_chantiers_assignes') then
      return jsonb_build_object('par_statut', '[]'::jsonb, 'nb_actifs', 0, 'actifs', '[]'::jsonb, 'nb_en_retard', 0, 'en_retard', '[]'::jsonb);
    end if;
    select coalesce(array_agg(distinct x.chantier_id), '{}') into v_ids
    from (
      select ec.chantier_id
      from public.employes e
      join public.equipes_chantiers ec on ec.entreprise_id = p_entreprise_id and ec.employe_id = e.id
      where e.entreprise_id = p_entreprise_id and e.utilisateur_id = auth.uid() and e.statut not in ('sorti', 'suspendu')
        and ec.date_debut <= current_date and (ec.date_fin is null or ec.date_fin >= current_date)
      union all
      select a.chantier_id
      from public.employes e
      join public.affectations a on a.entreprise_id = p_entreprise_id and a.employe_id = e.id
      where e.entreprise_id = p_entreprise_id and e.utilisateur_id = auth.uid() and e.statut not in ('sorti', 'suspendu')
        and a.date = current_date
    ) x;
  end if;

  with visibles as materialized (
    select c.id, c.nom, c.statut, c.date_fin_prevue, c.updated_at
    from public.chantiers c
    where c.entreprise_id = p_entreprise_id and (v_tous or c.id = any(v_ids))
  )
  select jsonb_build_object(
    'par_statut', coalesce((select jsonb_agg(jsonb_build_object('statut', statut, 'nb', nb) order by statut)
                            from (select statut, count(*) as nb from visibles group by statut) s), '[]'::jsonb),
    'nb_actifs', (select count(*) from visibles where statut = any(v_actifs)),
    'actifs', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nom', nom, 'statut', statut, 'date_fin_prevue', date_fin_prevue) order by updated_at desc nulls last, id)
                        from (select * from visibles where statut = any(v_actifs) order by updated_at desc nulls last, id limit v_limite) a), '[]'::jsonb),
    'nb_en_retard', (select count(*) from visibles where statut = any(v_actifs) and date_fin_prevue < p_aujourdhui),
    'en_retard', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nom', nom, 'statut', statut, 'date_fin_prevue', date_fin_prevue) order by updated_at desc nulls last, id)
                           from (select * from visibles where statut = any(v_actifs) and date_fin_prevue < p_aujourdhui order by updated_at desc nulls last, id limit v_limite) r), '[]'::jsonb))
    into v;
  return v;
end;
$$;

-- 5. Alertes de stock : articles actifs sous le seuil, les plus critiques en
--    tête, nombre exact. (/stock lit déjà tout ; le tableau de bord n'a besoin
--    que des alertes.)
create or replace function public.gp_alertes_stock(p_entreprise_id uuid, p_limite integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 50), 0), 500);
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  return (
    with alertes as materialized (
      select a.id, a.reference, a.designation, a.quantite_stock, a.seuil_alerte, a.unite
      from public.articles_stock a
      where a.entreprise_id = p_entreprise_id and a.actif and a.quantite_stock <= a.seuil_alerte
    )
    select jsonb_build_object(
      'nb', (select count(*) from alertes),
      'nb_ruptures', (select count(*) from alertes where quantite_stock <= 0),
      'articles', coalesce((select jsonb_agg(to_jsonb(x) order by x.quantite_stock <= 0 desc, x.quantite_stock - x.seuil_alerte, x.designation, x.id)
                            from (select * from alertes order by quantite_stock <= 0 desc, quantite_stock - seuil_alerte, designation, id limit v_limite) x), '[]'::jsonb))
  );
end;
$$;

revoke all on function public.paie_periode_synthese(uuid, uuid, text, text, uuid) from public, anon;
revoke all on function public.notes_frais_synthese_employes(uuid, text, text, uuid, uuid) from public, anon;
revoke all on function public.gp_crm_synthese(uuid) from public, anon;
revoke all on function public.gp_dashboard_chantiers(uuid, date, integer) from public, anon;
revoke all on function public.gp_alertes_stock(uuid, integer) from public, anon;
grant execute on function public.paie_periode_synthese(uuid, uuid, text, text, uuid) to authenticated;
grant execute on function public.notes_frais_synthese_employes(uuid, text, text, uuid, uuid) to authenticated;
grant execute on function public.gp_crm_synthese(uuid) to authenticated;
grant execute on function public.gp_dashboard_chantiers(uuid, date, integer) to authenticated;
grant execute on function public.gp_alertes_stock(uuid, integer) to authenticated;
