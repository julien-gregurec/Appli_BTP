-- ELSATIA — harnais d'upgrade Production → V9.x — VALEURS CRITIQUES comparées avant / après.
-- Une requête par bloc « -- @nom ». N'utilise que des colonnes de l'ère source (210) pour rester
-- comparable ; toute différence non déclarée dans attendus.json = P0. Lecture seule.
-- @contrats_abonnement
select entreprise_id||'|'||coalesce(plan_id::text,'∅')||'|'||code_offre||'|'||version_tarif||'|'||periodicite||'|'||prix_contractuel_ht
       ||'|'||devise||'|'||statut||'|'||coalesce(stripe_subscription_id,'∅')||'|'||coalesce(stripe_customer_id,'∅')
  from public.abonnements_entreprises order by 1;
-- @plans_historiques
select code||'|v'||version||'|'||coalesce(prix_mensuel_ht::text,'∅')||'|'||coalesce(prix_annuel_ht::text,'∅')||'|'||id
  from public.plans_abonnement order by 1;
-- @entreprises_abonnement
select id||'|'||nom||'|'||abonnement_statut||'|'||coalesce(abonnement_offre,'∅')||'|'||coalesce(abonnement_version_tarif::text,'∅')
       ||'|'||coalesce(abonnement_prix_contractuel_ht::text,'∅')||'|'||coalesce(abonnement_periodicite,'∅')||'|'||coalesce(abonnement_essai_fin::text,'∅')
       ||'|'||coalesce(stripe_customer_id,'∅')||'|'||coalesce(stripe_subscription_id,'∅')||'|'||coalesce(remise_stripe_coupon_id,'∅')
       ||'|'||coalesce(suppression_prevue_at::text,'∅')||'|'||coalesce(siret,'∅')
  from public.entreprises order by 1;
-- @options_contractuelles
select entreprise_id||'|'||option_id||'|'||quantite||'|'||prix_unitaire_contractuel_ht||'|'||active from public.options_abonnement_entreprises order by 1;
-- @comptes_factures_mensuels
select entreprise_id||'|'||employe_id||'|'||mois||'|'||statut_compte||'|'||coalesce(montant_ht::text,'∅') from public.facturation_comptes_mensuelle order by 1;
-- @membres_et_postes
select ue.utilisateur_id||'|'||ue.entreprise_id||'|'||coalesce(ue.poste_id::text,'∅')||'|'||ue.statut from public.utilisateurs_entreprises ue order by 1;
-- @entreprise_active
select id||'|'||coalesce(entreprise_active_id::text,'∅') from public.utilisateurs order by 1;
-- @permissions_poste
select entreprise_id||'|'||poste_id||'|'||cle_permission||'|'||autorise from public.permissions_poste order by 1;
-- @postes
select id||'|'||entreprise_id||'|'||nom from public.postes order by 1;
-- @factures_montants
select id||'|'||coalesce(numero,'∅')||'|'||statut||'|'||type||'|'||montant_ht||'|'||montant_tva||'|'||montant_ttc||'|'||montant_paye from public.factures order by 1;
-- @devis_montants
select id||'|'||coalesce(numero,'∅')||'|'||statut||'|'||montant_ht||'|'||montant_tva||'|'||montant_ttc from public.devis order by 1;
-- @paiements
select id||'|'||facture_id||'|'||montant||'|'||coalesce(mode,'∅') from public.paiements order by 1;
-- @pointages_heures
select entreprise_id||'|'||count(*)||'|'||sum(heures_normales)||'|'||sum(heures_supplementaires) from public.pointages group by entreprise_id order by 1;
-- @rh_employes
select id||'|'||entreprise_id||'|'||prenom||'|'||nom||'|'||statut||'|'||coalesce(numero_inscription,'∅')||'|'||coalesce(identifiant_interne,'∅')
       ||'|'||coalesce(anonymise_at::text,'∅')||'|'||coalesce(utilisateur_id::text,'∅') from public.employes order by 1;
-- @paie
select entreprise_id||'|'||count(*) from public.dossiers_paie_salaries group by 1 order by 1;
-- @iban_chiffres
select id||'|'||iban_chiffre||'|'||iban_hash||'|'||iban_quatre_derniers||'|'||coalesce(bic_chiffre,'∅')||'|'||actif from public.coordonnees_bancaires order by 1;
-- @documents
select id||'|'||storage_path||'|'||taille_octets from public.documents_chantier order by 1;
-- @storage_objets
select bucket_id||'|'||name||'|'||coalesce(metadata::text,'∅') from storage.objects order by 1;
-- @tokens_non_secrets
select 'partage|'||token_hash||'|'||document_id from public.acces_externes_documents
union all select 'cle_api|'||cle_hash||'|'||statut from public.cles_api
union all select 'code|'||code||'|'||statut from public.codes_acces order by 1;
-- @stripe_synthetique
select 'evt|'||id||'|'||event_type||'|'||livemode from public.stripe_webhook_events
union all select 'jab|'||stripe_event_id||'|'||type||'|'||coalesce(statut_resultant,'∅') from public.abonnement_evenements
union all select 'inv|'||coalesce(stripe_invoice_id,'∅')||'|'||montant_ttc||'|'||coalesce(statut,'∅') from public.factures_abonnement order by 1;
-- @support
select 'acces|'||plateforme_user_id||'|'||entreprise_id||'|'||coalesce(termine_at::text,'ouverte') from public.plateforme_acces_entreprises
union all select 'msg|'||entreprise_id||'|'||cote||'|'||contenu from public.support_messages
union all select 'admin|'||email||'|'||coalesce(role,'∅') from public.plateforme_admins order by 1;
-- @historiques
select 'tarif|'||coalesce(entreprise_id::text,'∅')||'|'||action||'|'||coalesce(ancien::text,'∅')||'|'||coalesce(nouveau::text,'∅') from public.historique_tarification
union all select 'journal|'||entreprise_id||'|'||count(*) from public.journal_activite group by entreprise_id order by 1;
-- @auth_utilisateurs
select id||'|'||coalesce(email,'∅')||'|'||coalesce(encrypted_password,'∅') from auth.users order by 1;
