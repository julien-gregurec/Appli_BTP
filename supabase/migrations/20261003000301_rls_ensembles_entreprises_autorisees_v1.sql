-- ELSATIA PERFORMANCE HARDENING V9.1 — P1-C : RLS évaluée une fois par requête.
--
-- Constat (docs/qualification/ELSATIA_SOAK_PERFORMANCE_V1.md § RLS / P1-2, reproduit sur
-- V9.1 : docs/qualification/ELSATIA_PERFORMANCE_HARDENING_V9_1.md § P1-C) : les policies
-- appellent est_membre_actif(entreprise_id) / a_permission(entreprise_id, …) — SECURITY
-- DEFINER, donc jamais inlinées — POUR CHAQUE LIGNE examinée (≈ 1 ms/ligne), y compris
-- les lignes d'un AUTRE tenant qu'une lecture croisée vide doit seulement rejeter.
--
-- Principe : calculer UNE fois par requête l'ensemble des entreprises autorisées
-- (InitPlan : entreprise_id = ANY (ARRAY(SELECT …))) ; la condition devient une condition
-- d'index sur entreprise_id : seules les lignes des entreprises autorisées sont lues,
-- quel que soit le nombre de tenants dans la table.
--
-- Équivalence EXACTE, par construction (aucune règle d'accès n'est réécrite) :
--   entreprises_membre_actif()          = { e ∈ C | est_membre_actif(e) }
--   entreprises_avec_permission(k)      = { e ∈ C | a_permission(e, k) }
--   entreprises_avec_une_permission(K)  = { e ∈ C | ∃ k ∈ K, a_permission(e, k) }
-- où C = entreprises où l'utilisateur courant a une ligne utilisateurs_entreprises ∪
-- entreprises où il a un accès support (plateforme_acces_entreprises). Les deux
-- fonctions d'origine ne peuvent être vraies qu'en dehors de C pour aucune entreprise
-- (branche membre : ligne utilisateurs_entreprises exigée ; branche support : ligne
-- plateforme_acces_entreprises exigée) : filtrer C par la fonction d'origine rend donc
-- exactement l'ensemble où elle est vraie. Toute évolution future de est_membre_actif /
-- a_permission (suspension, entitlement, révocation de session, support) est héritée
-- automatiquement. entreprise_id NULL : faux avant, NULL (rejet) après. Les fonctions ne
-- rendent jamais NULL (colonnes NOT NULL).
--
-- Fonctions par ligne à second argument (peut_consulter_chantier, …) : elles restent
-- l'autorité, précédées d'un chemin rapide dont la vérité IMPLIQUE la leur
-- (F ⇒ P) — P ≡ F ∨ P — et, lorsque P ⇒ membre, d'une garde d'appartenance
-- (P ≡ M ∧ (F ∨ P)) qui rejette sans appel de fonction toute ligne d'un autre tenant :
--   peut_consulter_chantier(e, c)            : F = e a acces_chantiers ou gerer_chantiers ; P ⇒ M
--   peut_voir_document_chantier(id)          : F = e a gerer_chantiers ; P ⇒ M
--   peut_consulter_pointage_employe(e, s)    : F = e a voir_pointages_equipe | gerer_pointage | valider_pointages
--   peut_consulter_affectation_employe(e, s) : F = e a gerer_planning | voir_pointages_equipe | voir_heures_chantiers
-- auth.uid() devient (select auth.uid()) (même valeur, évaluée une fois).
--
-- Périmètre volontairement limité aux 13 tables des chemins chauds mesurés (devis,
-- lignes_devis, factures, lignes_factures, clients, paiements, chantiers, taches,
-- pointages, sessions_pointage, affectations, documents_chantier,
-- notifications_utilisateurs) : 65 policies. Noms, commandes, rôles et caractère
-- permissif/restrictif inchangés (ALTER POLICY ne modifie que les expressions).
-- Garde : la migration échoue sans rien modifier si une policy ne correspond pas à
-- l'expression V9.1 attendue.
--
-- Retour arrière : scripts/perf/hardening/rls/rollback_20261003000301.sql (expressions
-- V9.1 d'origine), puis drop des trois fonctions.

begin;

create or replace function public.entreprises_membre_actif()
returns setof uuid
language sql
stable
security definer
set search_path = public
rows 4
as $$
  select c.entreprise_id
  from (
    select ue.entreprise_id from public.utilisateurs_entreprises ue where ue.utilisateur_id = auth.uid()
    union
    select s.entreprise_id from public.plateforme_acces_entreprises s where s.plateforme_user_id = auth.uid()
  ) c
  where public.est_membre_actif(c.entreprise_id);
$$;

create or replace function public.entreprises_avec_permission(p_permission text)
returns setof uuid
language sql
stable
security definer
set search_path = public
rows 4
as $$
  select c.entreprise_id
  from (
    select ue.entreprise_id from public.utilisateurs_entreprises ue where ue.utilisateur_id = auth.uid()
    union
    select s.entreprise_id from public.plateforme_acces_entreprises s where s.plateforme_user_id = auth.uid()
  ) c
  where public.a_permission(c.entreprise_id, p_permission);
$$;

create or replace function public.entreprises_avec_une_permission(p_permissions text[])
returns setof uuid
language sql
stable
security definer
set search_path = public
rows 4
as $$
  select c.entreprise_id
  from (
    select ue.entreprise_id from public.utilisateurs_entreprises ue where ue.utilisateur_id = auth.uid()
    union
    select s.entreprise_id from public.plateforme_acces_entreprises s where s.plateforme_user_id = auth.uid()
  ) c
  where exists (select 1 from unnest(p_permissions) k where public.a_permission(c.entreprise_id, k));
$$;

comment on function public.entreprises_membre_actif() is
  'RLS : entreprises où est_membre_actif() est vrai pour l''utilisateur courant (calculé une fois par requête).';
comment on function public.entreprises_avec_permission(text) is
  'RLS : entreprises où a_permission(·, p) est vrai pour l''utilisateur courant (calculé une fois par requête).';
comment on function public.entreprises_avec_une_permission(text[]) is
  'RLS : entreprises où a_permission(·, k) est vrai pour au moins une permission k (calculé une fois par requête).';

-- Mêmes droits que est_membre_actif / a_permission.
revoke all on function public.entreprises_membre_actif() from public, anon;
revoke all on function public.entreprises_avec_permission(text) from public, anon;
revoke all on function public.entreprises_avec_une_permission(text[]) from public, anon;
grant execute on function public.entreprises_membre_actif() to authenticated;
grant execute on function public.entreprises_avec_permission(text) to authenticated;
grant execute on function public.entreprises_avec_une_permission(text[]) to authenticated;

-- Garde : expressions V9.1 attendues (comparées sans blancs ni parenthèses).
do $garde$
declare
  r record;
  v_normal text;
begin
  for r in
  select * from (values
    ($q$affectations$q$, $q$membres affectations$q$, $q$est_membre_actif(entreprise_id)$q$, $q$est_membre_actif(entreprise_id)$q$),
    ($q$affectations$q$, $q$role_affectation_select$q$, $q$peut_consulter_affectation_employe(entreprise_id, employe_id)$q$, NULL),
    ($q$affectations$q$, $q$role_gestion_delete$q$, $q$a_permission(entreprise_id, 'gerer_planning'::text)$q$, NULL),
    ($q$affectations$q$, $q$role_gestion_insert$q$, NULL, $q$a_permission(entreprise_id, 'gerer_planning'::text)$q$),
    ($q$affectations$q$, $q$role_gestion_update$q$, $q$a_permission(entreprise_id, 'gerer_planning'::text)$q$, $q$a_permission(entreprise_id, 'gerer_planning'::text)$q$),
    ($q$chantiers$q$, $q$chantiers_lecture_selon_droits$q$, $q$peut_consulter_chantier(entreprise_id, id)$q$, NULL),
    ($q$chantiers$q$, $q$lecture_chantiers_selon_permission$q$, $q$peut_consulter_chantier(entreprise_id, id)$q$, NULL),
    ($q$chantiers$q$, $q$membres modifient les chantiers$q$, $q$est_membre_actif(entreprise_id)$q$, $q$(est_membre_actif(entreprise_id) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = chantiers.client_id) AND (c.entreprise_id = chantiers.entreprise_id)))))$q$),
    ($q$chantiers$q$, $q$membres suppriment les chantiers$q$, $q$est_membre_actif(entreprise_id)$q$, NULL),
    ($q$chantiers$q$, $q$membres écrivent les chantiers$q$, NULL, $q$(est_membre_actif(entreprise_id) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = chantiers.client_id) AND (c.entreprise_id = chantiers.entreprise_id)))))$q$),
    ($q$chantiers$q$, $q$role_gestion_delete$q$, $q$a_permission(entreprise_id, 'gerer_chantiers'::text)$q$, NULL),
    ($q$chantiers$q$, $q$role_gestion_insert$q$, NULL, $q$a_permission(entreprise_id, 'gerer_chantiers'::text)$q$),
    ($q$chantiers$q$, $q$role_gestion_update$q$, $q$a_permission(entreprise_id, 'gerer_chantiers'::text)$q$, $q$a_permission(entreprise_id, 'gerer_chantiers'::text)$q$),
    ($q$clients$q$, $q$lecture_clients_selon_permission$q$, $q$a_permission(entreprise_id, 'acces_clients'::text)$q$, NULL),
    ($q$clients$q$, $q$membres accèdent aux clients$q$, $q$est_membre_actif(entreprise_id)$q$, $q$est_membre_actif(entreprise_id)$q$),
    ($q$clients$q$, $q$role_gestion_delete$q$, $q$a_permission(entreprise_id, 'gerer_clients'::text)$q$, NULL),
    ($q$clients$q$, $q$role_gestion_insert$q$, NULL, $q$a_permission(entreprise_id, 'gerer_clients'::text)$q$),
    ($q$clients$q$, $q$role_gestion_update$q$, $q$a_permission(entreprise_id, 'gerer_clients'::text)$q$, $q$a_permission(entreprise_id, 'gerer_clients'::text)$q$),
    ($q$devis$q$, $q$lecture_devis_selon_permission$q$, $q$a_permission(entreprise_id, 'acces_devis'::text)$q$, NULL),
    ($q$devis$q$, $q$membres devis$q$, $q$est_membre_actif(entreprise_id)$q$, $q$est_membre_actif(entreprise_id)$q$),
    ($q$devis$q$, $q$role_gestion_delete$q$, $q$a_permission(entreprise_id, 'gerer_devis'::text)$q$, NULL),
    ($q$devis$q$, $q$role_gestion_insert$q$, NULL, $q$a_permission(entreprise_id, 'gerer_devis'::text)$q$),
    ($q$devis$q$, $q$role_gestion_update$q$, $q$a_permission(entreprise_id, 'gerer_devis'::text)$q$, $q$a_permission(entreprise_id, 'gerer_devis'::text)$q$),
    ($q$documents_chantier$q$, $q$documents_chantier_ajout$q$, NULL, $q$(est_membre_actif(entreprise_id) AND a_permission(entreprise_id, 'gerer_chantiers'::text))$q$),
    ($q$documents_chantier$q$, $q$documents_chantier_ajout_terrain$q$, NULL, $q$(est_membre_actif(entreprise_id) AND a_permission(entreprise_id, 'ajouter_documents_chantier'::text))$q$),
    ($q$documents_chantier$q$, $q$documents_chantier_lecture$q$, $q$peut_voir_document_chantier(id)$q$, NULL),
    ($q$documents_chantier$q$, $q$documents_chantier_modification$q$, $q$(est_membre_actif(entreprise_id) AND a_permission(entreprise_id, 'gerer_chantiers'::text))$q$, $q$(est_membre_actif(entreprise_id) AND a_permission(entreprise_id, 'gerer_chantiers'::text))$q$),
    ($q$documents_chantier$q$, $q$documents_chantier_suppression$q$, $q$(est_membre_actif(entreprise_id) AND a_permission(entreprise_id, 'gerer_chantiers'::text))$q$, NULL),
    ($q$documents_chantier$q$, $q$role_gestion_delete$q$, $q$a_permission(entreprise_id, 'gerer_chantiers'::text)$q$, NULL),
    ($q$documents_chantier$q$, $q$role_gestion_insert$q$, NULL, $q$(a_permission(entreprise_id, 'gerer_chantiers'::text) OR a_permission(entreprise_id, 'ajouter_documents_chantier'::text))$q$),
    ($q$documents_chantier$q$, $q$role_gestion_update$q$, $q$a_permission(entreprise_id, 'gerer_chantiers'::text)$q$, $q$a_permission(entreprise_id, 'gerer_chantiers'::text)$q$),
    ($q$factures$q$, $q$lecture_factures_selon_permission$q$, $q$a_permission(entreprise_id, 'acces_factures'::text)$q$, NULL),
    ($q$factures$q$, $q$membres factures$q$, $q$est_membre_actif(entreprise_id)$q$, $q$est_membre_actif(entreprise_id)$q$),
    ($q$factures$q$, $q$role_gestion_delete$q$, $q$a_permission(entreprise_id, 'gerer_factures'::text)$q$, NULL),
    ($q$factures$q$, $q$role_gestion_insert$q$, NULL, $q$a_permission(entreprise_id, 'gerer_factures'::text)$q$),
    ($q$factures$q$, $q$role_gestion_update$q$, $q$a_permission(entreprise_id, 'gerer_factures'::text)$q$, $q$a_permission(entreprise_id, 'gerer_factures'::text)$q$),
    ($q$lignes_devis$q$, $q$lecture_lignes_devis_selon_permission$q$, $q$a_permission(entreprise_id, 'acces_devis'::text)$q$, NULL),
    ($q$lignes_devis$q$, $q$membres lignes_devis$q$, $q$est_membre_actif(entreprise_id)$q$, $q$est_membre_actif(entreprise_id)$q$),
    ($q$lignes_devis$q$, $q$role_gestion_delete$q$, $q$a_permission(entreprise_id, 'gerer_devis'::text)$q$, NULL),
    ($q$lignes_devis$q$, $q$role_gestion_insert$q$, NULL, $q$a_permission(entreprise_id, 'gerer_devis'::text)$q$),
    ($q$lignes_devis$q$, $q$role_gestion_update$q$, $q$a_permission(entreprise_id, 'gerer_devis'::text)$q$, $q$a_permission(entreprise_id, 'gerer_devis'::text)$q$),
    ($q$lignes_factures$q$, $q$lecture_lignes_factures_selon_permission$q$, $q$a_permission(entreprise_id, 'acces_factures'::text)$q$, NULL),
    ($q$lignes_factures$q$, $q$membres lignes_factures$q$, $q$est_membre_actif(entreprise_id)$q$, $q$est_membre_actif(entreprise_id)$q$),
    ($q$lignes_factures$q$, $q$role_gestion_delete$q$, $q$a_permission(entreprise_id, 'gerer_factures'::text)$q$, NULL),
    ($q$lignes_factures$q$, $q$role_gestion_insert$q$, NULL, $q$a_permission(entreprise_id, 'gerer_factures'::text)$q$),
    ($q$lignes_factures$q$, $q$role_gestion_update$q$, $q$a_permission(entreprise_id, 'gerer_factures'::text)$q$, $q$a_permission(entreprise_id, 'gerer_factures'::text)$q$),
    ($q$notifications_utilisateurs$q$, $q$notifications_marquer_lue$q$, $q$(utilisateur_id = auth.uid())$q$, $q$(utilisateur_id = auth.uid())$q$),
    ($q$notifications_utilisateurs$q$, $q$notifications_personnelles$q$, $q$((utilisateur_id = auth.uid()) AND est_membre_actif(entreprise_id))$q$, NULL),
    ($q$paiements$q$, $q$lecture_paiements_selon_permission$q$, $q$(EXISTS ( SELECT 1
   FROM factures f
  WHERE ((f.id = paiements.facture_id) AND a_permission(f.entreprise_id, 'acces_factures'::text))))$q$, NULL),
    ($q$paiements$q$, $q$membres paiements$q$, $q$(EXISTS ( SELECT 1
   FROM factures f
  WHERE ((f.id = paiements.facture_id) AND est_membre_actif(f.entreprise_id))))$q$, $q$(EXISTS ( SELECT 1
   FROM factures f
  WHERE ((f.id = paiements.facture_id) AND est_membre_actif(f.entreprise_id))))$q$),
    ($q$paiements$q$, $q$role_gestion_delete$q$, $q$(EXISTS ( SELECT 1
   FROM factures p
  WHERE ((p.id = paiements.facture_id) AND a_permission(p.entreprise_id, 'gerer_factures'::text))))$q$, NULL),
    ($q$paiements$q$, $q$role_gestion_insert$q$, NULL, $q$(EXISTS ( SELECT 1
   FROM factures p
  WHERE ((p.id = paiements.facture_id) AND a_permission(p.entreprise_id, 'gerer_factures'::text))))$q$),
    ($q$paiements$q$, $q$role_gestion_update$q$, $q$(EXISTS ( SELECT 1
   FROM factures p
  WHERE ((p.id = paiements.facture_id) AND a_permission(p.entreprise_id, 'gerer_factures'::text))))$q$, $q$(EXISTS ( SELECT 1
   FROM factures p
  WHERE ((p.id = paiements.facture_id) AND a_permission(p.entreprise_id, 'gerer_factures'::text))))$q$),
    ($q$pointages$q$, $q$membres pointages$q$, $q$est_membre_actif(entreprise_id)$q$, $q$est_membre_actif(entreprise_id)$q$),
    ($q$pointages$q$, $q$role_gestion_delete$q$, $q$a_permission(entreprise_id, 'gerer_pointage'::text)$q$, NULL),
    ($q$pointages$q$, $q$role_gestion_update$q$, $q$a_permission(entreprise_id, 'gerer_pointage'::text)$q$, $q$a_permission(entreprise_id, 'gerer_pointage'::text)$q$),
    ($q$pointages$q$, $q$role_pointage_select$q$, $q$peut_consulter_pointage_employe(entreprise_id, employe_id)$q$, NULL),
    ($q$sessions_pointage$q$, $q$role_gestion_delete$q$, $q$a_permission(entreprise_id, 'gerer_pointage'::text)$q$, NULL),
    ($q$sessions_pointage$q$, $q$role_pointage_select$q$, $q$peut_consulter_pointage_employe(entreprise_id, employe_id)$q$, NULL),
    ($q$sessions_pointage$q$, $q$sessions_pointage_membres$q$, $q$est_membre_actif(entreprise_id)$q$, $q$est_membre_actif(entreprise_id)$q$),
    ($q$taches$q$, $q$lecture_taches_selon_permission$q$, $q$(EXISTS ( SELECT 1
   FROM chantiers c
  WHERE ((c.id = taches.chantier_id) AND peut_consulter_chantier(c.entreprise_id, c.id))))$q$, NULL),
    ($q$taches$q$, $q$membres accèdent aux tâches$q$, $q$(EXISTS ( SELECT 1
   FROM chantiers ch
  WHERE ((ch.id = taches.chantier_id) AND est_membre_actif(ch.entreprise_id))))$q$, $q$(EXISTS ( SELECT 1
   FROM chantiers ch
  WHERE ((ch.id = taches.chantier_id) AND est_membre_actif(ch.entreprise_id))))$q$),
    ($q$taches$q$, $q$role_gestion_delete$q$, $q$(EXISTS ( SELECT 1
   FROM chantiers p
  WHERE ((p.id = taches.chantier_id) AND a_permission(p.entreprise_id, 'gerer_chantiers'::text))))$q$, NULL),
    ($q$taches$q$, $q$role_gestion_insert$q$, NULL, $q$(EXISTS ( SELECT 1
   FROM chantiers p
  WHERE ((p.id = taches.chantier_id) AND a_permission(p.entreprise_id, 'gerer_chantiers'::text))))$q$),
    ($q$taches$q$, $q$role_gestion_update$q$, $q$(EXISTS ( SELECT 1
   FROM chantiers p
  WHERE ((p.id = taches.chantier_id) AND a_permission(p.entreprise_id, 'gerer_chantiers'::text))))$q$, $q$(EXISTS ( SELECT 1
   FROM chantiers p
  WHERE ((p.id = taches.chantier_id) AND a_permission(p.entreprise_id, 'gerer_chantiers'::text))))$q$)
  ) v(t, p, q, w)
  loop
    select coalesce(regexp_replace(p.qual, '[\s()]', '', 'g'), '') || '|' || coalesce(regexp_replace(p.with_check, '[\s()]', '', 'g'), '')
      into v_normal
    from pg_policies p
    where p.schemaname = 'public' and p.tablename = r.t and p.policyname = r.p;
    if v_normal is null then
      raise exception 'RLS P1-C : policy absente %.%', r.t, r.p;
    end if;
    if v_normal <> coalesce(regexp_replace(r.q, '[\s()]', '', 'g'), '') || '|' || coalesce(regexp_replace(r.w, '[\s()]', '', 'g'), '') then
      raise exception 'RLS P1-C : policy %.% différente de V9.1, migration interrompue', r.t, r.p;
    end if;
  end loop;
end
$garde$;

ALTER POLICY "membres affectations" ON public.affectations
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))))
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))));

ALTER POLICY "role_affectation_select" ON public.affectations
  USING (((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_une_permission(ARRAY['gerer_planning', 'voir_pointages_equipe', 'voir_heures_chantiers'])))) OR peut_consulter_affectation_employe(entreprise_id, employe_id)));

ALTER POLICY "role_gestion_delete" ON public.affectations
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_planning'::text)))));

ALTER POLICY "role_gestion_insert" ON public.affectations
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_planning'::text)))));

ALTER POLICY "role_gestion_update" ON public.affectations
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_planning'::text)))))
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_planning'::text)))));

ALTER POLICY "chantiers_lecture_selon_droits" ON public.chantiers
  USING (((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))) AND ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_une_permission(ARRAY['acces_chantiers', 'gerer_chantiers'])))) OR peut_consulter_chantier(entreprise_id, id))));

ALTER POLICY "lecture_chantiers_selon_permission" ON public.chantiers
  USING (((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))) AND ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_une_permission(ARRAY['acces_chantiers', 'gerer_chantiers'])))) OR peut_consulter_chantier(entreprise_id, id))));

ALTER POLICY "membres modifient les chantiers" ON public.chantiers
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))))
  WITH CHECK (((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = chantiers.client_id) AND (c.entreprise_id = chantiers.entreprise_id))))));

ALTER POLICY "membres suppriment les chantiers" ON public.chantiers
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))));

ALTER POLICY "membres écrivent les chantiers" ON public.chantiers
  WITH CHECK (((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = chantiers.client_id) AND (c.entreprise_id = chantiers.entreprise_id))))));

ALTER POLICY "role_gestion_delete" ON public.chantiers
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_chantiers'::text)))));

ALTER POLICY "role_gestion_insert" ON public.chantiers
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_chantiers'::text)))));

ALTER POLICY "role_gestion_update" ON public.chantiers
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_chantiers'::text)))))
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_chantiers'::text)))));

ALTER POLICY "lecture_clients_selon_permission" ON public.clients
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('acces_clients'::text)))));

ALTER POLICY "membres accèdent aux clients" ON public.clients
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))))
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))));

ALTER POLICY "role_gestion_delete" ON public.clients
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_clients'::text)))));

ALTER POLICY "role_gestion_insert" ON public.clients
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_clients'::text)))));

ALTER POLICY "role_gestion_update" ON public.clients
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_clients'::text)))))
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_clients'::text)))));

ALTER POLICY "lecture_devis_selon_permission" ON public.devis
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('acces_devis'::text)))));

ALTER POLICY "membres devis" ON public.devis
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))))
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))));

ALTER POLICY "role_gestion_delete" ON public.devis
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_devis'::text)))));

ALTER POLICY "role_gestion_insert" ON public.devis
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_devis'::text)))));

ALTER POLICY "role_gestion_update" ON public.devis
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_devis'::text)))))
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_devis'::text)))));

ALTER POLICY "documents_chantier_ajout" ON public.documents_chantier
  WITH CHECK (((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))) AND (entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_chantiers'::text))))));

ALTER POLICY "documents_chantier_ajout_terrain" ON public.documents_chantier
  WITH CHECK (((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))) AND (entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('ajouter_documents_chantier'::text))))));

ALTER POLICY "documents_chantier_lecture" ON public.documents_chantier
  USING (((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))) AND ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_chantiers'::text)))) OR peut_voir_document_chantier(id))));

ALTER POLICY "documents_chantier_modification" ON public.documents_chantier
  USING (((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))) AND (entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_chantiers'::text))))))
  WITH CHECK (((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))) AND (entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_chantiers'::text))))));

ALTER POLICY "documents_chantier_suppression" ON public.documents_chantier
  USING (((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))) AND (entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_chantiers'::text))))));

ALTER POLICY "role_gestion_delete" ON public.documents_chantier
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_chantiers'::text)))));

ALTER POLICY "role_gestion_insert" ON public.documents_chantier
  WITH CHECK (((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_chantiers'::text)))) OR (entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('ajouter_documents_chantier'::text))))));

ALTER POLICY "role_gestion_update" ON public.documents_chantier
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_chantiers'::text)))))
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_chantiers'::text)))));

ALTER POLICY "lecture_factures_selon_permission" ON public.factures
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('acces_factures'::text)))));

ALTER POLICY "membres factures" ON public.factures
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))))
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))));

ALTER POLICY "role_gestion_delete" ON public.factures
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_factures'::text)))));

ALTER POLICY "role_gestion_insert" ON public.factures
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_factures'::text)))));

ALTER POLICY "role_gestion_update" ON public.factures
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_factures'::text)))))
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_factures'::text)))));

ALTER POLICY "lecture_lignes_devis_selon_permission" ON public.lignes_devis
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('acces_devis'::text)))));

ALTER POLICY "membres lignes_devis" ON public.lignes_devis
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))))
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))));

ALTER POLICY "role_gestion_delete" ON public.lignes_devis
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_devis'::text)))));

ALTER POLICY "role_gestion_insert" ON public.lignes_devis
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_devis'::text)))));

ALTER POLICY "role_gestion_update" ON public.lignes_devis
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_devis'::text)))))
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_devis'::text)))));

ALTER POLICY "lecture_lignes_factures_selon_permission" ON public.lignes_factures
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('acces_factures'::text)))));

ALTER POLICY "membres lignes_factures" ON public.lignes_factures
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))))
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))));

ALTER POLICY "role_gestion_delete" ON public.lignes_factures
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_factures'::text)))));

ALTER POLICY "role_gestion_insert" ON public.lignes_factures
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_factures'::text)))));

ALTER POLICY "role_gestion_update" ON public.lignes_factures
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_factures'::text)))))
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_factures'::text)))));

ALTER POLICY "notifications_marquer_lue" ON public.notifications_utilisateurs
  USING ((utilisateur_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((utilisateur_id = ( SELECT auth.uid() AS uid)));

ALTER POLICY "notifications_personnelles" ON public.notifications_utilisateurs
  USING (((utilisateur_id = ( SELECT auth.uid() AS uid)) AND (entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif())))));

ALTER POLICY "lecture_paiements_selon_permission" ON public.paiements
  USING ((EXISTS ( SELECT 1
   FROM factures f
  WHERE ((f.id = paiements.facture_id) AND (f.entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('acces_factures'::text))))))));

ALTER POLICY "membres paiements" ON public.paiements
  USING ((EXISTS ( SELECT 1
   FROM factures f
  WHERE ((f.id = paiements.facture_id) AND (f.entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif())))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM factures f
  WHERE ((f.id = paiements.facture_id) AND (f.entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif())))))));

ALTER POLICY "role_gestion_delete" ON public.paiements
  USING ((EXISTS ( SELECT 1
   FROM factures p
  WHERE ((p.id = paiements.facture_id) AND (p.entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_factures'::text))))))));

ALTER POLICY "role_gestion_insert" ON public.paiements
  WITH CHECK ((EXISTS ( SELECT 1
   FROM factures p
  WHERE ((p.id = paiements.facture_id) AND (p.entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_factures'::text))))))));

ALTER POLICY "role_gestion_update" ON public.paiements
  USING ((EXISTS ( SELECT 1
   FROM factures p
  WHERE ((p.id = paiements.facture_id) AND (p.entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_factures'::text))))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM factures p
  WHERE ((p.id = paiements.facture_id) AND (p.entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_factures'::text))))))));

ALTER POLICY "membres pointages" ON public.pointages
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))))
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))));

ALTER POLICY "role_gestion_delete" ON public.pointages
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_pointage'::text)))));

ALTER POLICY "role_gestion_update" ON public.pointages
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_pointage'::text)))))
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_pointage'::text)))));

ALTER POLICY "role_pointage_select" ON public.pointages
  USING (((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_une_permission(ARRAY['voir_pointages_equipe', 'gerer_pointage', 'valider_pointages'])))) OR peut_consulter_pointage_employe(entreprise_id, employe_id)));

ALTER POLICY "role_gestion_delete" ON public.sessions_pointage
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_pointage'::text)))));

ALTER POLICY "role_pointage_select" ON public.sessions_pointage
  USING (((entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_une_permission(ARRAY['voir_pointages_equipe', 'gerer_pointage', 'valider_pointages'])))) OR peut_consulter_pointage_employe(entreprise_id, employe_id)));

ALTER POLICY "sessions_pointage_membres" ON public.sessions_pointage
  USING ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))))
  WITH CHECK ((entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))));

ALTER POLICY "lecture_taches_selon_permission" ON public.taches
  USING ((EXISTS ( SELECT 1
   FROM chantiers c
  WHERE ((c.id = taches.chantier_id) AND ((c.entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif()))) AND ((c.entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_une_permission(ARRAY['acces_chantiers', 'gerer_chantiers'])))) OR peut_consulter_chantier(c.entreprise_id, c.id)))))));

ALTER POLICY "membres accèdent aux tâches" ON public.taches
  USING ((EXISTS ( SELECT 1
   FROM chantiers ch
  WHERE ((ch.id = taches.chantier_id) AND (ch.entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif())))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM chantiers ch
  WHERE ((ch.id = taches.chantier_id) AND (ch.entreprise_id = ANY (ARRAY(SELECT public.entreprises_membre_actif())))))));

ALTER POLICY "role_gestion_delete" ON public.taches
  USING ((EXISTS ( SELECT 1
   FROM chantiers p
  WHERE ((p.id = taches.chantier_id) AND (p.entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_chantiers'::text))))))));

ALTER POLICY "role_gestion_insert" ON public.taches
  WITH CHECK ((EXISTS ( SELECT 1
   FROM chantiers p
  WHERE ((p.id = taches.chantier_id) AND (p.entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_chantiers'::text))))))));

ALTER POLICY "role_gestion_update" ON public.taches
  USING ((EXISTS ( SELECT 1
   FROM chantiers p
  WHERE ((p.id = taches.chantier_id) AND (p.entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_chantiers'::text))))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM chantiers p
  WHERE ((p.id = taches.chantier_id) AND (p.entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('gerer_chantiers'::text))))))));

notify pgrst, 'reload schema';

commit;
