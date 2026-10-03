-- Retour arrière de 20261003000301_rls_ensembles_entreprises_autorisees_v1 : expressions V9.1 d'origine.
begin;
ALTER POLICY "membres affectations" ON public.affectations
  USING (est_membre_actif(entreprise_id))
  WITH CHECK (est_membre_actif(entreprise_id));

ALTER POLICY "role_affectation_select" ON public.affectations
  USING (peut_consulter_affectation_employe(entreprise_id, employe_id));

ALTER POLICY "role_gestion_delete" ON public.affectations
  USING (a_permission(entreprise_id, 'gerer_planning'::text));

ALTER POLICY "role_gestion_insert" ON public.affectations
  WITH CHECK (a_permission(entreprise_id, 'gerer_planning'::text));

ALTER POLICY "role_gestion_update" ON public.affectations
  USING (a_permission(entreprise_id, 'gerer_planning'::text))
  WITH CHECK (a_permission(entreprise_id, 'gerer_planning'::text));

ALTER POLICY "chantiers_lecture_selon_droits" ON public.chantiers
  USING (peut_consulter_chantier(entreprise_id, id));

ALTER POLICY "lecture_chantiers_selon_permission" ON public.chantiers
  USING (peut_consulter_chantier(entreprise_id, id));

ALTER POLICY "membres modifient les chantiers" ON public.chantiers
  USING (est_membre_actif(entreprise_id))
  WITH CHECK ((est_membre_actif(entreprise_id) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = chantiers.client_id) AND (c.entreprise_id = chantiers.entreprise_id))))));

ALTER POLICY "membres suppriment les chantiers" ON public.chantiers
  USING (est_membre_actif(entreprise_id));

ALTER POLICY "membres écrivent les chantiers" ON public.chantiers
  WITH CHECK ((est_membre_actif(entreprise_id) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = chantiers.client_id) AND (c.entreprise_id = chantiers.entreprise_id))))));

ALTER POLICY "role_gestion_delete" ON public.chantiers
  USING (a_permission(entreprise_id, 'gerer_chantiers'::text));

ALTER POLICY "role_gestion_insert" ON public.chantiers
  WITH CHECK (a_permission(entreprise_id, 'gerer_chantiers'::text));

ALTER POLICY "role_gestion_update" ON public.chantiers
  USING (a_permission(entreprise_id, 'gerer_chantiers'::text))
  WITH CHECK (a_permission(entreprise_id, 'gerer_chantiers'::text));

ALTER POLICY "lecture_clients_selon_permission" ON public.clients
  USING (a_permission(entreprise_id, 'acces_clients'::text));

ALTER POLICY "membres accèdent aux clients" ON public.clients
  USING (est_membre_actif(entreprise_id))
  WITH CHECK (est_membre_actif(entreprise_id));

ALTER POLICY "role_gestion_delete" ON public.clients
  USING (a_permission(entreprise_id, 'gerer_clients'::text));

ALTER POLICY "role_gestion_insert" ON public.clients
  WITH CHECK (a_permission(entreprise_id, 'gerer_clients'::text));

ALTER POLICY "role_gestion_update" ON public.clients
  USING (a_permission(entreprise_id, 'gerer_clients'::text))
  WITH CHECK (a_permission(entreprise_id, 'gerer_clients'::text));

ALTER POLICY "lecture_devis_selon_permission" ON public.devis
  USING (a_permission(entreprise_id, 'acces_devis'::text));

ALTER POLICY "membres devis" ON public.devis
  USING (est_membre_actif(entreprise_id))
  WITH CHECK (est_membre_actif(entreprise_id));

ALTER POLICY "role_gestion_delete" ON public.devis
  USING (a_permission(entreprise_id, 'gerer_devis'::text));

ALTER POLICY "role_gestion_insert" ON public.devis
  WITH CHECK (a_permission(entreprise_id, 'gerer_devis'::text));

ALTER POLICY "role_gestion_update" ON public.devis
  USING (a_permission(entreprise_id, 'gerer_devis'::text))
  WITH CHECK (a_permission(entreprise_id, 'gerer_devis'::text));

ALTER POLICY "documents_chantier_ajout" ON public.documents_chantier
  WITH CHECK ((est_membre_actif(entreprise_id) AND a_permission(entreprise_id, 'gerer_chantiers'::text)));

ALTER POLICY "documents_chantier_ajout_terrain" ON public.documents_chantier
  WITH CHECK ((est_membre_actif(entreprise_id) AND a_permission(entreprise_id, 'ajouter_documents_chantier'::text)));

ALTER POLICY "documents_chantier_lecture" ON public.documents_chantier
  USING (peut_voir_document_chantier(id));

ALTER POLICY "documents_chantier_modification" ON public.documents_chantier
  USING ((est_membre_actif(entreprise_id) AND a_permission(entreprise_id, 'gerer_chantiers'::text)))
  WITH CHECK ((est_membre_actif(entreprise_id) AND a_permission(entreprise_id, 'gerer_chantiers'::text)));

ALTER POLICY "documents_chantier_suppression" ON public.documents_chantier
  USING ((est_membre_actif(entreprise_id) AND a_permission(entreprise_id, 'gerer_chantiers'::text)));

ALTER POLICY "role_gestion_delete" ON public.documents_chantier
  USING (a_permission(entreprise_id, 'gerer_chantiers'::text));

ALTER POLICY "role_gestion_insert" ON public.documents_chantier
  WITH CHECK ((a_permission(entreprise_id, 'gerer_chantiers'::text) OR a_permission(entreprise_id, 'ajouter_documents_chantier'::text)));

ALTER POLICY "role_gestion_update" ON public.documents_chantier
  USING (a_permission(entreprise_id, 'gerer_chantiers'::text))
  WITH CHECK (a_permission(entreprise_id, 'gerer_chantiers'::text));

ALTER POLICY "lecture_factures_selon_permission" ON public.factures
  USING (a_permission(entreprise_id, 'acces_factures'::text));

ALTER POLICY "membres factures" ON public.factures
  USING (est_membre_actif(entreprise_id))
  WITH CHECK (est_membre_actif(entreprise_id));

ALTER POLICY "role_gestion_delete" ON public.factures
  USING (a_permission(entreprise_id, 'gerer_factures'::text));

ALTER POLICY "role_gestion_insert" ON public.factures
  WITH CHECK (a_permission(entreprise_id, 'gerer_factures'::text));

ALTER POLICY "role_gestion_update" ON public.factures
  USING (a_permission(entreprise_id, 'gerer_factures'::text))
  WITH CHECK (a_permission(entreprise_id, 'gerer_factures'::text));

ALTER POLICY "lecture_lignes_devis_selon_permission" ON public.lignes_devis
  USING (a_permission(entreprise_id, 'acces_devis'::text));

ALTER POLICY "membres lignes_devis" ON public.lignes_devis
  USING (est_membre_actif(entreprise_id))
  WITH CHECK (est_membre_actif(entreprise_id));

ALTER POLICY "role_gestion_delete" ON public.lignes_devis
  USING (a_permission(entreprise_id, 'gerer_devis'::text));

ALTER POLICY "role_gestion_insert" ON public.lignes_devis
  WITH CHECK (a_permission(entreprise_id, 'gerer_devis'::text));

ALTER POLICY "role_gestion_update" ON public.lignes_devis
  USING (a_permission(entreprise_id, 'gerer_devis'::text))
  WITH CHECK (a_permission(entreprise_id, 'gerer_devis'::text));

ALTER POLICY "lecture_lignes_factures_selon_permission" ON public.lignes_factures
  USING (a_permission(entreprise_id, 'acces_factures'::text));

ALTER POLICY "membres lignes_factures" ON public.lignes_factures
  USING (est_membre_actif(entreprise_id))
  WITH CHECK (est_membre_actif(entreprise_id));

ALTER POLICY "role_gestion_delete" ON public.lignes_factures
  USING (a_permission(entreprise_id, 'gerer_factures'::text));

ALTER POLICY "role_gestion_insert" ON public.lignes_factures
  WITH CHECK (a_permission(entreprise_id, 'gerer_factures'::text));

ALTER POLICY "role_gestion_update" ON public.lignes_factures
  USING (a_permission(entreprise_id, 'gerer_factures'::text))
  WITH CHECK (a_permission(entreprise_id, 'gerer_factures'::text));

ALTER POLICY "notifications_marquer_lue" ON public.notifications_utilisateurs
  USING ((utilisateur_id = auth.uid()))
  WITH CHECK ((utilisateur_id = auth.uid()));

ALTER POLICY "notifications_personnelles" ON public.notifications_utilisateurs
  USING (((utilisateur_id = auth.uid()) AND est_membre_actif(entreprise_id)));

ALTER POLICY "lecture_paiements_selon_permission" ON public.paiements
  USING ((EXISTS ( SELECT 1
   FROM factures f
  WHERE ((f.id = paiements.facture_id) AND a_permission(f.entreprise_id, 'acces_factures'::text)))));

ALTER POLICY "membres paiements" ON public.paiements
  USING ((EXISTS ( SELECT 1
   FROM factures f
  WHERE ((f.id = paiements.facture_id) AND est_membre_actif(f.entreprise_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM factures f
  WHERE ((f.id = paiements.facture_id) AND est_membre_actif(f.entreprise_id)))));

ALTER POLICY "role_gestion_delete" ON public.paiements
  USING ((EXISTS ( SELECT 1
   FROM factures p
  WHERE ((p.id = paiements.facture_id) AND a_permission(p.entreprise_id, 'gerer_factures'::text)))));

ALTER POLICY "role_gestion_insert" ON public.paiements
  WITH CHECK ((EXISTS ( SELECT 1
   FROM factures p
  WHERE ((p.id = paiements.facture_id) AND a_permission(p.entreprise_id, 'gerer_factures'::text)))));

ALTER POLICY "role_gestion_update" ON public.paiements
  USING ((EXISTS ( SELECT 1
   FROM factures p
  WHERE ((p.id = paiements.facture_id) AND a_permission(p.entreprise_id, 'gerer_factures'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM factures p
  WHERE ((p.id = paiements.facture_id) AND a_permission(p.entreprise_id, 'gerer_factures'::text)))));

ALTER POLICY "membres pointages" ON public.pointages
  USING (est_membre_actif(entreprise_id))
  WITH CHECK (est_membre_actif(entreprise_id));

ALTER POLICY "role_gestion_delete" ON public.pointages
  USING (a_permission(entreprise_id, 'gerer_pointage'::text));

ALTER POLICY "role_gestion_update" ON public.pointages
  USING (a_permission(entreprise_id, 'gerer_pointage'::text))
  WITH CHECK (a_permission(entreprise_id, 'gerer_pointage'::text));

ALTER POLICY "role_pointage_select" ON public.pointages
  USING (peut_consulter_pointage_employe(entreprise_id, employe_id));

ALTER POLICY "role_gestion_delete" ON public.sessions_pointage
  USING (a_permission(entreprise_id, 'gerer_pointage'::text));

ALTER POLICY "role_pointage_select" ON public.sessions_pointage
  USING (peut_consulter_pointage_employe(entreprise_id, employe_id));

ALTER POLICY "sessions_pointage_membres" ON public.sessions_pointage
  USING (est_membre_actif(entreprise_id))
  WITH CHECK (est_membre_actif(entreprise_id));

ALTER POLICY "lecture_taches_selon_permission" ON public.taches
  USING ((EXISTS ( SELECT 1
   FROM chantiers c
  WHERE ((c.id = taches.chantier_id) AND peut_consulter_chantier(c.entreprise_id, c.id)))));

ALTER POLICY "membres accèdent aux tâches" ON public.taches
  USING ((EXISTS ( SELECT 1
   FROM chantiers ch
  WHERE ((ch.id = taches.chantier_id) AND est_membre_actif(ch.entreprise_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM chantiers ch
  WHERE ((ch.id = taches.chantier_id) AND est_membre_actif(ch.entreprise_id)))));

ALTER POLICY "role_gestion_delete" ON public.taches
  USING ((EXISTS ( SELECT 1
   FROM chantiers p
  WHERE ((p.id = taches.chantier_id) AND a_permission(p.entreprise_id, 'gerer_chantiers'::text)))));

ALTER POLICY "role_gestion_insert" ON public.taches
  WITH CHECK ((EXISTS ( SELECT 1
   FROM chantiers p
  WHERE ((p.id = taches.chantier_id) AND a_permission(p.entreprise_id, 'gerer_chantiers'::text)))));

ALTER POLICY "role_gestion_update" ON public.taches
  USING ((EXISTS ( SELECT 1
   FROM chantiers p
  WHERE ((p.id = taches.chantier_id) AND a_permission(p.entreprise_id, 'gerer_chantiers'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM chantiers p
  WHERE ((p.id = taches.chantier_id) AND a_permission(p.entreprise_id, 'gerer_chantiers'::text)))));

drop function if exists public.entreprises_membre_actif();
drop function if exists public.entreprises_avec_permission(text);
drop function if exists public.entreprises_avec_une_permission(text[]);
notify pgrst, 'reload schema';
commit;
