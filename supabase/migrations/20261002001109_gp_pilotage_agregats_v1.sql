-- Train canonique V9 : numéro d'origine 20260930000402 (GP residual data correctness (claude/optimistic-hopper-0ytout)), renuméroté 20261002001109
-- (bloc V9 strictement après 20261002000901 / 20261002001003, ordre relatif d'origine conservé) ; corps inchangé.
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
  -- est_employe_du_compte exige utilisateur_id = auth.uid() : pré-filtre exact.
  select coalesce(array_agg(e.id) filter (where public.est_employe_du_compte(p_entreprise_id, e.id)), '{}')
    into v_emp_compte
  from public.employes e
  where e.entreprise_id = p_entreprise_id and e.utilisateur_id = auth.uid();
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
    'actifs', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nom', nom, 'statut', statut, 'date_fin_prevue', date_fin_prevue) order by updated_at desc, id)
                        from (select * from visibles where statut = any(v_actifs) order by updated_at desc, id limit v_limite) a), '[]'::jsonb),
    'nb_en_retard', (select count(*) from visibles where statut = any(v_actifs) and date_fin_prevue < p_aujourdhui),
    'en_retard', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nom', nom, 'statut', statut, 'date_fin_prevue', date_fin_prevue) order by updated_at desc, id)
                           from (select * from visibles where statut = any(v_actifs) and date_fin_prevue < p_aujourdhui order by updated_at desc, id limit v_limite) r), '[]'::jsonb))
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

-- 6. Paie : page de dossiers et contenu d'export, visibilité évaluée une fois.
--    La liste de /paie/[id] (count exact + tri par nom sous RLS) et l'export
--    (dossiers puis pièces lus page à page sous RLS) évaluaient les policies de
--    chaque ligne : ~4 ms par dossier (peut_gerer_paie = trois a_permission),
--    soit des minutes à 20 000 lignes. Mêmes règles que paie_periode_synthese
--    pour les dossiers ; pièces : est_employe_paie_courant(e, employe) ∨
--    a_permission(e, 'voir_paie_confidentielle') (policy paie_pieces_select).
create or replace function public.paie_periode_dossiers_page(
  p_entreprise_id uuid,
  p_periode_id uuid,
  p_statut text default null,
  p_recherche text default null,
  p_dossier_id uuid default null,
  p_limite integer default 25,
  p_decalage integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tous boolean;
  v_miens uuid[];
  v_motif text := nullif(btrim(coalesce(p_recherche, '')), '');
  v_limite integer := least(greatest(coalesce(p_limite, 25), 1), 500);
  v_decalage integer := greatest(coalesce(p_decalage, 0), 0);
  v jsonb;
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  if p_periode_id is null then
    raise exception 'GP_AGREGAT_PARAMETRES' using errcode = '22023';
  end if;
  v_tous := public.peut_gerer_paie(p_entreprise_id) or public.a_permission(p_entreprise_id, 'exporter_paie');
  select coalesce(array_agg(e.id), '{}') into v_miens
  from public.employes e
  where e.entreprise_id = p_entreprise_id and e.utilisateur_id = auth.uid();

  with dossiers as materialized (
    select d.*, e.prenom, e.nom, e.reference_interne, e.poste, e.statut as employe_statut
    from public.dossiers_paie_salaries d
    join public.employes e on e.id = d.employe_id and e.entreprise_id = d.entreprise_id
    where d.entreprise_id = p_entreprise_id and d.periode_id = p_periode_id
      and (v_tous or d.employe_id = any(v_miens))
      and (p_dossier_id is null or d.id = p_dossier_id)
      and (p_statut is null or p_statut = '' or d.statut = p_statut)
      and (v_motif is null or e.nom ilike '%' || v_motif || '%' or e.prenom ilike '%' || v_motif || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from dossiers),
    'lignes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'employe_id', x.employe_id, 'statut', x.statut, 'heures_normales', x.heures_normales, 'heures_sup_25', x.heures_sup_25,
        'heures_sup_50', x.heures_sup_50, 'heures_absence', x.heures_absence, 'jours_conges', x.jours_conges, 'total_paniers', x.total_paniers,
        'total_trajets', x.total_trajets, 'total_transports', x.total_transports, 'total_grands_deplacements', x.total_grands_deplacements,
        'total_kilometres', x.total_kilometres, 'total_primes', x.total_primes, 'total_acomptes', x.total_acomptes, 'total_notes_frais', x.total_notes_frais,
        'employe', jsonb_build_object('prenom', x.prenom, 'nom', x.nom, 'reference_interne', x.reference_interne, 'poste', x.poste, 'statut', x.employe_statut))
      order by x.nom, x.prenom, x.id)
      from (select * from dossiers order by nom, prenom, id limit v_limite offset v_decalage) x), '[]'::jsonb))
    into v;
  return v;
end;
$$;

create or replace function public.paie_export_contenu(p_entreprise_id uuid, p_periode_id uuid, p_avec_pieces boolean default true)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tous boolean;
  v_confidentiel boolean;
  v_miens uuid[];
  v_dossiers jsonb;
  v_pieces jsonb := '[]'::jsonb;
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  if p_periode_id is null then
    raise exception 'GP_AGREGAT_PARAMETRES' using errcode = '22023';
  end if;
  v_tous := public.peut_gerer_paie(p_entreprise_id) or public.a_permission(p_entreprise_id, 'exporter_paie');
  v_confidentiel := public.a_permission(p_entreprise_id, 'voir_paie_confidentielle');
  select coalesce(array_agg(e.id), '{}') into v_miens
  from public.employes e
  where e.entreprise_id = p_entreprise_id and e.utilisateur_id = auth.uid();

  -- Jointure employé externe, comme `employe:employes(...)` dans l'export
  -- historique (embarquement non filtrant) ; ordre employe_id, id.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'employe_id', d.employe_id, 'statut', d.statut, 'heures_normales', d.heures_normales, 'heures_sup_25', d.heures_sup_25,
           'heures_sup_50', d.heures_sup_50, 'heures_absence', d.heures_absence, 'jours_conges', d.jours_conges, 'total_paniers', d.total_paniers,
           'total_trajets', d.total_trajets, 'total_transports', d.total_transports, 'total_grands_deplacements', d.total_grands_deplacements,
           'total_kilometres', d.total_kilometres, 'total_primes', d.total_primes, 'total_acomptes', d.total_acomptes, 'total_notes_frais', d.total_notes_frais,
           'commentaire_comptable', d.commentaire_comptable,
           'employe', case when e.id is not null then jsonb_build_object('prenom', e.prenom, 'nom', e.nom, 'reference_interne', e.reference_interne, 'poste', e.poste) end)
         order by d.employe_id, d.id), '[]'::jsonb)
    into v_dossiers
  from public.dossiers_paie_salaries d
  left join public.employes e on e.id = d.employe_id and e.entreprise_id = d.entreprise_id
  where d.entreprise_id = p_entreprise_id and d.periode_id = p_periode_id
    and (v_tous or d.employe_id = any(v_miens));

  if p_avec_pieces then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id, 'dossier_id', p.dossier_id, 'type_document', p.type_document, 'nom_original', p.nom_original, 'storage_path', p.storage_path,
             'mime_type', p.mime_type, 'taille_octets', p.taille_octets, 'empreinte_sha256', p.empreinte_sha256) order by p.id), '[]'::jsonb)
      into v_pieces
    from public.pieces_jointes_paie p
    join public.dossiers_paie_salaries d on d.id = p.dossier_id
    where d.entreprise_id = p_entreprise_id and d.periode_id = p_periode_id
      and p.entreprise_id = p_entreprise_id
      and (v_tous or d.employe_id = any(v_miens))
      and ((p.employe_id is not null and p.employe_id = any(v_miens)) or v_confidentiel);
  end if;

  return jsonb_build_object('dossiers', v_dossiers, 'pieces', v_pieces);
end;
$$;

revoke all on function public.paie_periode_dossiers_page(uuid, uuid, text, text, uuid, integer, integer) from public, anon;
revoke all on function public.paie_export_contenu(uuid, uuid, boolean) from public, anon;
grant execute on function public.paie_periode_dossiers_page(uuid, uuid, text, text, uuid, integer, integer) to authenticated;
grant execute on function public.paie_export_contenu(uuid, uuid, boolean) to authenticated;

-- 7. Notes de frais : page de la liste (curseur date_frais desc, id desc),
--    visibilité évaluée une fois. Sous RLS, peut_consulter_note_frais(id) est
--    évaluée pour chaque note parcourue : pour un salarié qui ne voit que ses
--    notes, la première page parcourait toute l'entreprise (219 s mesurées à
--    20 000 notes).
create or replace function public.notes_frais_page(
  p_entreprise_id uuid,
  p_statut text default null,
  p_categorie text default null,
  p_chantier_id uuid default null,
  p_employe_id uuid default null,
  p_limite integer default 300,
  p_avant_date date default null,
  p_avant_id uuid default null
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
  v_limite integer := least(greatest(coalesce(p_limite, 300), 1), 500);
  v_lignes jsonb;
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  select coalesce(array_agg(e.id) filter (where public.est_employe_du_compte(p_entreprise_id, e.id)), '{}')
    into v_emp_compte
  from public.employes e
  where e.entreprise_id = p_entreprise_id and e.utilisateur_id = auth.uid();
  v_nf_gestion := public.a_permission(p_entreprise_id, 'verifier_notes_frais')
               or public.a_permission(p_entreprise_id, 'gerer_notes_frais')
               or public.a_permission(p_entreprise_id, 'comptabiliser_notes_frais')
               or public.a_permission(p_entreprise_id, 'administrer_archivage_notes_frais');
  v_nf_virements := public.a_permission(p_entreprise_id, 'preparer_virements');
  v_nf_saisie := public.a_permission(p_entreprise_id, 'saisir_ses_notes_frais');

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id, 'reference', n.reference, 'date_frais', n.date_frais, 'montant_ttc', n.montant_ttc, 'devise', n.devise,
           'categorie', n.categorie, 'fournisseur', n.fournisseur, 'statut', n.statut, 'statut_export', n.statut_export,
           'verrouille_at', n.verrouille_at, 'lieu_hors_chantier', n.lieu_hors_chantier,
           'employe', case when em.id is not null then jsonb_build_object('id', em.id, 'prenom', em.prenom, 'nom', em.nom) end,
           'chantier', case when ch.id is not null then jsonb_build_object('nom', ch.nom) end)
         order by n.date_frais desc, n.id desc), '[]'::jsonb)
    into v_lignes
  from (
    select n.*
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
      and (p_avant_id is null
           or (p_avant_date is not null and (n.date_frais < p_avant_date or (n.date_frais = p_avant_date and n.id < p_avant_id)))
           or (p_avant_date is null and ((n.date_frais is null and n.id < p_avant_id) or n.date_frais is not null)))
    order by n.date_frais desc, n.id desc
    limit v_limite + 1
  ) n
  left join public.employes em on em.id = n.employe_id and em.entreprise_id = n.entreprise_id
  left join public.chantiers ch on ch.id = n.chantier_id and ch.entreprise_id = n.entreprise_id;

  return jsonb_build_object(
    'lignes', coalesce((select jsonb_agg(t.x order by t.k) from jsonb_array_elements(v_lignes) with ordinality t(x, k) where t.k <= v_limite), '[]'::jsonb),
    'suite', jsonb_array_length(v_lignes) > v_limite);
end;
$$;

revoke all on function public.notes_frais_page(uuid, text, text, uuid, uuid, integer, date, uuid) from public, anon;
grant execute on function public.notes_frais_page(uuid, text, text, uuid, uuid, integer, date, uuid) to authenticated;
