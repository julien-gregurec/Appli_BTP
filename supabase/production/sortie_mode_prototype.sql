-- PRODUCTION UNIQUEMENT — SCRIPT MANUEL, HORS MIGRATIONS AUTOMATIQUES.
-- NE PAS APPLIQUER tant que DISABLE_EMAIL_LOGIN=true.
-- Retire toutes les policies et permissions anonymes ajoutées pour le prototype.

do $$
declare r record;
begin
  for r in
    select schemaname,tablename,policyname from pg_policies
    where schemaname in ('public','storage') and 'anon'=any(roles)
  loop
    execute format('drop policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  end loop;
end $$;

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
revoke usage on schema public from anon;
revoke all privileges on storage.objects from anon;
revoke all privileges on storage.buckets from anon;

-- Les fonctions SECURITY DEFINER ne doivent jamais hériter du droit EXECUTE de PUBLIC.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public,anon',r.signature);
  end loop;
end $$;

-- Helpers RLS et seules RPC appelées par l'application authentifiée.
grant execute on function public.est_membre_actif(uuid) to authenticated;
grant execute on function public.a_permission(uuid,text) to authenticated;
grant execute on function public.entreprise_sans_membres(uuid) to authenticated;
grant execute on function public.creer_entreprise_bootstrap(text,text,text,text,text) to authenticated;
grant execute on function public.creer_devis_brouillon(uuid,jsonb,jsonb) to authenticated;
grant execute on function public.modifier_devis_brouillon(uuid,jsonb,jsonb) to authenticated;
grant execute on function public.dupliquer_devis(uuid) to authenticated;
grant execute on function public.creer_facture_depuis_devis(uuid,text) to authenticated;
grant execute on function public.modifier_facture_brouillon(uuid,jsonb,jsonb) to authenticated;
grant execute on function public.creer_commande_fournisseur(uuid,jsonb,jsonb) to authenticated;
grant execute on function public.changer_statut_commande(uuid,uuid,text) to authenticated;
grant execute on function public.enregistrer_reception_commande(uuid,uuid,jsonb) to authenticated;
grant execute on function public.enregistrer_mouvement_outillage(uuid,uuid,text,uuid,uuid,text,text) to authenticated;
grant execute on function public.creer_inventaire_stock(uuid,uuid,text) to authenticated;
grant execute on function public.enregistrer_comptage_inventaire(uuid,uuid,jsonb,boolean) to authenticated;
grant execute on function public.materialiser_charge_recurrente(uuid,uuid,text,date) to authenticated;
grant execute on function public.creer_poste_avec_permissions(uuid,text,text[]) to authenticated;
grant execute on function public.enregistrer_permissions_poste(uuid,uuid,text[]) to authenticated;
grant execute on function public.modifier_poste_membre(uuid,uuid,uuid) to authenticated;
grant execute on function public.supprimer_poste_vide(uuid,uuid) to authenticated;
grant execute on function public.importer_articles_stock(uuid,text,jsonb) to authenticated;
grant execute on function public.valider_preuve_pointage(uuid,uuid,text,text) to authenticated;
grant execute on function public.cloturer_session_pointage(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text) to authenticated;
grant execute on function public.peut_pointer_pour_employe(uuid,uuid) to authenticated;
grant execute on function public.peut_consulter_pointage_employe(uuid,uuid) to authenticated;
grant execute on function public.peut_voir_notes_frais_equipe(uuid) to authenticated;
grant execute on function public.affecter_vehicule(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.rejoindre_entreprise_par_code(text) to authenticated;
grant execute on function public.lier_justificatif_depense(uuid,uuid,text,text,text,bigint) to authenticated;
grant execute on function public.est_plateforme_admin() to authenticated;
grant execute on function public.plateforme_entreprises() to authenticated;
grant execute on function public.plateforme_modifier_abonnement(uuid,text,date,text) to authenticated;
grant execute on function public.est_acces_support_actif(uuid) to authenticated;
grant execute on function public.plateforme_entrer_entreprise(uuid,text) to authenticated;
grant execute on function public.plateforme_quitter_entreprise() to authenticated;
grant execute on function public.plateforme_signaler_impaye(uuid,text) to authenticated;
grant execute on function public.plateforme_enregistrer_reglement(uuid,text) to authenticated;
grant execute on function public.contexte_abonnement_courant() to authenticated;
grant execute on function public.marquer_invitation_employe(uuid,uuid,text) to authenticated;
grant execute on function public.enregistrer_presence_application(boolean) to authenticated;
grant execute on function public.plateforme_usage_entreprises() to authenticated;
grant execute on function public.peut_consulter_note_frais(uuid) to authenticated;
grant execute on function public.peut_modifier_note_frais_personnelle(uuid) to authenticated;
grant execute on function public.role_courant_entreprise(uuid) to authenticated;
grant execute on function public.transition_note_frais(uuid,text,text) to authenticated;
grant execute on function public.modifier_reference_comptable_note_frais(uuid,text) to authenticated;
grant execute on function public.ajouter_audit_note_frais(uuid,text,text,uuid,text,text,jsonb,text,text,text) to authenticated;
grant execute on function public.existe_doublon_note_frais(uuid,text,uuid) to authenticated;
grant execute on function public.journaliser_acces_refuse_note_frais(uuid,text,uuid,text,text,text,text) to authenticated;
grant execute on function public.finaliser_export_notes_frais(uuid,text,text,text,bigint,jsonb) to authenticated;
grant execute on function public.transition_demande_conge(uuid,text,text) to authenticated;
grant execute on function public.changer_statut_compte_application(uuid,uuid,text) to authenticated;
grant execute on function public.plateforme_creer_entreprise(text,text,text) to authenticated;
grant execute on function public.plateforme_postes_tarifs() to authenticated;
grant execute on function public.plateforme_modifier_tarif_poste(uuid,text,numeric) to authenticated;
grant execute on function public.plateforme_snapshot_facturation(date) to authenticated;
grant execute on function public.plateforme_releve_facturation(date) to authenticated;
grant execute on function public.mes_devis_chantiers_sans_prix(uuid) to authenticated;
grant execute on function public.mettre_outil_rebut(uuid,uuid,text) to authenticated;
grant execute on function public.creer_code_identification(uuid,text,uuid) to authenticated;
grant execute on function public.definir_mot_de_passe_stock_personnel(uuid,text) to authenticated;
grant execute on function public.reinitialiser_mot_de_passe_stock_employe(uuid,uuid) to authenticated;
grant execute on function public.enregistrer_mouvement_stock_borne_v2(uuid,text,text,text,text,numeric,uuid,text,uuid,text) to authenticated;

revoke execute on function public.dev_contexte_entreprise() from public,anon,authenticated;
drop function public.dev_contexte_entreprise();

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

notify pgrst,'reload schema';
