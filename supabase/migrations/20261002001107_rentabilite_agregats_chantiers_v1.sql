-- Train canonique V9 : numéro d'origine 20260930000301 (GP residual data correctness (claude/optimistic-hopper-0ytout)), renuméroté 20261002001107
-- (bloc V9 strictement après 20261002000901 / 20261002001003, ordre relatif d'origine conservé) ; corps inchangé.
-- ELSATIA-RENTABILITE-DATA-CORRECTNESS-V1 — rentabilité et heures chantier
-- calculées par PostgreSQL.
--
-- Avant : /rentabilite, l'analyse IA de rentabilité, le copilote
-- (src/lib/rentabilite.ts) et la fiche chantier lisaient pointages, factures,
-- devis, dépenses, sorties de stock, notes de frais, affectations… en une
-- requête PostgREST chacune, SANS pagination, puis additionnaient côté Next.
-- PostgREST plafonne toute réponse à max_rows = 1 000 lignes sans erreur :
-- heures, coût main-d'œuvre, CA, coûts et marges faux dès 1 001 lignes.
--
-- Ici : les totaux sont calculés en base, avec les MÊMES règles de calcul que
-- les écrans (aucune règle comptable nouvelle) et les MÊMES règles de
-- visibilité que la RLS, évaluées une fois par appel (permissions) ou par
-- salarié (pointages), et non une fois par ligne :
--
--   chantiers              peut_consulter_chantier(entreprise, chantier)
--   factures               est_membre_actif ∧ a_permission(acces_factures)
--   devis                  est_membre_actif ∧ a_permission(acces_devis)
--   depenses_fournisseurs  est_membre_actif ∧ a_permission(acces_achats)
--   pointages              est_membre_actif ∧ peut_consulter_pointage_employe
--                          (voir_pointages_equipe ∨ gerer_pointage ∨ valider_pointages
--                           ∨ salarié actif rattaché au compte)
--   employes_cout_horaire  est_membre_actif ∧ (voir_cout_interne_employe ∨ acces_rentabilite)
--   mouvements_stock       est_membre_actif (article : est_membre_actif de son entreprise)
--   notes_frais            policies notes_frais_createur_lecture ∨
--                          notes_frais_select_authenticated (peut_consulter_note_frais) ∨
--                          notes_frais_sources_bancaires
--   indemnités de paie     règle de couts_indemnites_paie_par_chantier
--                          (est_membre_actif ∧ acces_rentabilite)
--   affectations           est_membre_actif ∧ peut_consulter_affectation_employe
--
-- La parité avec la RLS réelle est vérifiée profil par profil par pgTAP
-- (supabase/tests/gp_rentabilite_agregats_v1.test.sql) : toute dérive d'une
-- policy fait échouer ces tests.
--
-- Toutes les fonctions exposées : SECURITY DEFINER, search_path = public,
-- EXECUTE pour authenticated seul ; refus 42501 sans identité ou si
-- l'appelant n'est pas membre actif de l'entreprise. Le calcul interne
-- (rentabilite_chantiers_calcul) n'est exécutable par aucun rôle applicatif.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Calcul interne : une ligne par chantier visible.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.rentabilite_chantiers_calcul(p_entreprise_id uuid, p_chantier_id uuid default null)
returns table (
  chantier_id uuid,
  chantier_created_at timestamptz,
  budget_ht numeric,
  facture_ht numeric,
  facture_ht_avoirs numeric,
  heures numeric,
  cout_main_oeuvre numeric,
  cout_horaire_manquant boolean,
  cout_achats numeric,
  cout_sous_traitance numeric,
  cout_stock numeric,
  cout_notes_frais numeric,
  cout_indemnites_paie numeric,
  marge numeric,
  taux numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
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
  -- Règle /rentabilite : factures hors annulées / avoir émis.
  fa as (
    select f.chantier_id,
           sum(f.montant_ht) as facture_ht,
           coalesce(sum(f.montant_ht) filter (where f.type = 'avoir'), 0) as facture_ht_avoirs
    from public.factures f
    where v_factures and f.entreprise_id = p_entreprise_id
      and f.statut not in ('annulee', 'avoir_emis')
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
$$;

revoke all on function public.rentabilite_chantiers_calcul(uuid, uuid) from public, anon, authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Totaux de l'entreprise (une ligne) — bandeau de /rentabilite.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.rentabilite_chantiers_totaux(p_entreprise_id uuid)
returns table (
  nb_chantiers integer,
  nb_chantiers_avec_activite integer,
  nb_chantiers_cout_horaire_manquant integer,
  heures numeric,
  facture_ht numeric,
  cout_main_oeuvre numeric,
  cout_achats numeric,
  cout_sous_traitance numeric,
  cout_stock numeric,
  cout_notes_frais numeric,
  cout_indemnites_paie numeric,
  marge numeric,
  taux numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer,
         (count(*) filter (where r.facture_ht > 0 or r.heures > 0 or r.budget_ht > 0))::integer,
         (count(*) filter (where r.cout_horaire_manquant))::integer,
         coalesce(sum(r.heures), 0),
         coalesce(sum(r.facture_ht), 0),
         coalesce(sum(r.cout_main_oeuvre), 0),
         coalesce(sum(r.cout_achats), 0),
         coalesce(sum(r.cout_sous_traitance), 0),
         coalesce(sum(r.cout_stock), 0),
         coalesce(sum(r.cout_notes_frais), 0),
         coalesce(sum(r.cout_indemnites_paie), 0),
         coalesce(sum(r.marge), 0),
         case when coalesce(sum(r.facture_ht), 0) > 0 then sum(r.marge) / sum(r.facture_ht) * 100 else 0 end
  from public.rentabilite_chantiers_calcul(p_entreprise_id, null) r;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Une page de chantiers (liste détaillée, « meilleurs chantiers », copilote).
--    p_tri : 'recent' (created_at desc, ordre historique de la page),
--            'marge_desc' (plus forte marge), 'marge_asc' (plus faible marge).
--    p_limite ≤ 500 : le résultat reste sous max_rows = 1 000.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.rentabilite_chantiers_page(
  p_entreprise_id uuid,
  p_tri text default 'recent',
  p_limite integer default 50,
  p_decalage integer default 0,
  p_avec_activite boolean default false
)
returns table (
  chantier_id uuid,
  budget_ht numeric,
  facture_ht numeric,
  facture_ht_avoirs numeric,
  heures numeric,
  cout_main_oeuvre numeric,
  cout_horaire_manquant boolean,
  cout_achats numeric,
  cout_sous_traitance numeric,
  cout_stock numeric,
  cout_notes_frais numeric,
  cout_indemnites_paie numeric,
  marge numeric,
  taux numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_tri is null or p_tri not in ('recent', 'marge_desc', 'marge_asc') then
    raise exception 'RENTABILITE_PARAMETRES_INVALIDES' using errcode = '22023';
  end if;
  if p_limite is null or p_limite < 1 or p_limite > 500 or p_decalage is null or p_decalage < 0 then
    raise exception 'RENTABILITE_PARAMETRES_INVALIDES' using errcode = '22023';
  end if;
  return query
  select r.chantier_id, r.budget_ht, r.facture_ht, r.facture_ht_avoirs, r.heures, r.cout_main_oeuvre,
         r.cout_horaire_manquant, r.cout_achats, r.cout_sous_traitance, r.cout_stock,
         r.cout_notes_frais, r.cout_indemnites_paie, r.marge, r.taux
  from public.rentabilite_chantiers_calcul(p_entreprise_id, null) r
  where not p_avec_activite or r.facture_ht > 0 or r.heures > 0 or r.budget_ht > 0
  order by
    case when p_tri = 'marge_desc' then r.marge end desc nulls last,
    case when p_tri = 'marge_asc' then r.marge end asc nulls last,
    r.chantier_created_at desc,
    r.chantier_id
  limit p_limite offset p_decalage;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Un chantier (analyse IA de rentabilité).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.rentabilite_chantier(p_entreprise_id uuid, p_chantier_id uuid)
returns table (
  chantier_id uuid,
  budget_ht numeric,
  facture_ht numeric,
  facture_ht_avoirs numeric,
  heures numeric,
  cout_main_oeuvre numeric,
  cout_horaire_manquant boolean,
  cout_achats numeric,
  cout_sous_traitance numeric,
  cout_stock numeric,
  cout_notes_frais numeric,
  cout_indemnites_paie numeric,
  marge numeric,
  taux numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_chantier_id is null then
    raise exception 'RENTABILITE_PARAMETRES_INVALIDES' using errcode = '22023';
  end if;
  return query
  select r.chantier_id, r.budget_ht, r.facture_ht, r.facture_ht_avoirs, r.heures, r.cout_main_oeuvre,
         r.cout_horaire_manquant, r.cout_achats, r.cout_sous_traitance, r.cout_stock,
         r.cout_notes_frais, r.cout_indemnites_paie, r.marge, r.taux
  from public.rentabilite_chantiers_calcul(p_entreprise_id, p_chantier_id) r;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Fiche chantier : heures planifiées et heures validées.
--    Règles de la fiche : planifiées = somme des affectations du chantier ;
--    validées = pointages « valide » du chantier.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.chantier_heures_synthese(p_entreprise_id uuid, p_chantier_id uuid)
returns table (
  heures_planifiees numeric,
  nb_affectations integer,
  heures_validees numeric,
  nb_pointages_valides integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_affectations_equipe boolean;
  v_pointages_equipe boolean;
begin
  if v_uid is null then
    raise exception 'RENTABILITE_ACCES_REFUSE' using errcode = '42501';
  end if;
  if p_entreprise_id is null or not public.est_membre_actif(p_entreprise_id) then
    raise exception 'RENTABILITE_ACCES_REFUSE' using errcode = '42501';
  end if;
  -- peut_consulter_chantier ne vérifie pas que le chantier appartient à
  -- l'entreprise (un poste « acces_chantiers » répond vrai pour tout id) :
  -- l'appartenance est contrôlée ici, explicitement.
  if p_chantier_id is null
     or not exists (select 1 from public.chantiers c where c.id = p_chantier_id and c.entreprise_id = p_entreprise_id)
     or not public.peut_consulter_chantier(p_entreprise_id, p_chantier_id) then
    raise exception 'RENTABILITE_ACCES_REFUSE' using errcode = '42501';
  end if;

  v_affectations_equipe := public.a_permission(p_entreprise_id, 'gerer_planning')
    or public.a_permission(p_entreprise_id, 'voir_pointages_equipe')
    or public.a_permission(p_entreprise_id, 'voir_heures_chantiers');
  v_pointages_equipe := public.a_permission(p_entreprise_id, 'voir_pointages_equipe')
    or public.a_permission(p_entreprise_id, 'gerer_pointage')
    or public.a_permission(p_entreprise_id, 'valider_pointages');

  return query
  with mes_employes as materialized (
    select e.id
    from public.employes e
    where e.entreprise_id = p_entreprise_id
      and e.utilisateur_id = v_uid
      and e.statut not in ('sorti', 'suspendu')
  )
  select
    (select coalesce(sum(a.heures), 0) from public.affectations a
      where a.entreprise_id = p_entreprise_id and a.chantier_id = p_chantier_id
        and (v_affectations_equipe or a.employe_id in (select id from mes_employes))),
    (select count(*)::integer from public.affectations a
      where a.entreprise_id = p_entreprise_id and a.chantier_id = p_chantier_id
        and (v_affectations_equipe or a.employe_id in (select id from mes_employes))),
    (select coalesce(sum(p.heures_normales + p.heures_supplementaires), 0) from public.pointages p
      where p.entreprise_id = p_entreprise_id and p.chantier_id = p_chantier_id and p.verification_statut = 'valide'
        and (v_pointages_equipe or p.employe_id in (select id from mes_employes))),
    (select count(*)::integer from public.pointages p
      where p.entreprise_id = p_entreprise_id and p.chantier_id = p_chantier_id and p.verification_statut = 'valide'
        and (v_pointages_equipe or p.employe_id in (select id from mes_employes)));
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Fiche chantier : identifiants d'une page de pointages validés (plus
--    récents d'abord). La page relit ensuite ces lignes sous la RLS normale :
--    une page profonde sous RLS coûtait ~1,5 ms par ligne parcourue (15,6 s
--    pour la dernière page d'un chantier à 10 000 pointages).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.chantier_pointages_valides_page(
  p_entreprise_id uuid,
  p_chantier_id uuid,
  p_limite integer default 50,
  p_decalage integer default 0
)
returns table (pointage_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pointages_equipe boolean;
begin
  if p_limite is null or p_limite < 1 or p_limite > 200 or p_decalage is null or p_decalage < 0 then
    raise exception 'RENTABILITE_PARAMETRES_INVALIDES' using errcode = '22023';
  end if;
  if v_uid is null then
    raise exception 'RENTABILITE_ACCES_REFUSE' using errcode = '42501';
  end if;
  if p_entreprise_id is null or not public.est_membre_actif(p_entreprise_id) then
    raise exception 'RENTABILITE_ACCES_REFUSE' using errcode = '42501';
  end if;
  if p_chantier_id is null
     or not exists (select 1 from public.chantiers c where c.id = p_chantier_id and c.entreprise_id = p_entreprise_id)
     or not public.peut_consulter_chantier(p_entreprise_id, p_chantier_id) then
    raise exception 'RENTABILITE_ACCES_REFUSE' using errcode = '42501';
  end if;
  v_pointages_equipe := public.a_permission(p_entreprise_id, 'voir_pointages_equipe')
    or public.a_permission(p_entreprise_id, 'gerer_pointage')
    or public.a_permission(p_entreprise_id, 'valider_pointages');

  return query
  select p.id
  from public.pointages p
  where p.entreprise_id = p_entreprise_id and p.chantier_id = p_chantier_id and p.verification_statut = 'valide'
    and (v_pointages_equipe or p.employe_id in (
      select e.id from public.employes e
      where e.entreprise_id = p_entreprise_id and e.utilisateur_id = v_uid and e.statut not in ('sorti', 'suspendu')))
  order by p.date desc, p.id
  limit p_limite offset p_decalage;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Droits : authenticated seul.
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function public.rentabilite_chantiers_totaux(uuid) from public, anon, service_role;
revoke all on function public.rentabilite_chantiers_page(uuid, text, integer, integer, boolean) from public, anon, service_role;
revoke all on function public.rentabilite_chantier(uuid, uuid) from public, anon, service_role;
revoke all on function public.chantier_heures_synthese(uuid, uuid) from public, anon, service_role;
revoke all on function public.chantier_pointages_valides_page(uuid, uuid, integer, integer) from public, anon, service_role;
grant execute on function public.rentabilite_chantiers_totaux(uuid) to authenticated;
grant execute on function public.rentabilite_chantiers_page(uuid, text, integer, integer, boolean) to authenticated;
grant execute on function public.rentabilite_chantier(uuid, uuid) to authenticated;
grant execute on function public.chantier_heures_synthese(uuid, uuid) to authenticated;
grant execute on function public.chantier_pointages_valides_page(uuid, uuid, integer, integer) to authenticated;

comment on function public.rentabilite_chantiers_totaux(uuid) is
  'ELSATIA-RENTABILITE-DATA-CORRECTNESS-V1 : totaux /rentabilite calculés en base (exact au-delà de 1 000 lignes), visibilité = RLS.';
comment on function public.rentabilite_chantiers_page(uuid, text, integer, integer, boolean) is
  'ELSATIA-RENTABILITE-DATA-CORRECTNESS-V1 : page de rentabilité par chantier (≤ 500 lignes), visibilité = RLS.';
comment on function public.rentabilite_chantier(uuid, uuid) is
  'ELSATIA-RENTABILITE-DATA-CORRECTNESS-V1 : rentabilité d''un chantier (analyse IA), visibilité = RLS.';
comment on function public.chantier_heures_synthese(uuid, uuid) is
  'ELSATIA-RENTABILITE-DATA-CORRECTNESS-V1 : heures planifiées / validées de la fiche chantier, visibilité = RLS.';
comment on function public.chantier_pointages_valides_page(uuid, uuid, integer, integer) is
  'ELSATIA-RENTABILITE-DATA-CORRECTNESS-V1 : identifiants d''une page (≤ 200) de pointages validés d''un chantier, visibilité = RLS.';
