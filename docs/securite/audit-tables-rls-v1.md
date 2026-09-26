# Audit des 143 tables et politiques RLS — V1

Généré depuis la reconstruction Supabase locale le 29 juillet 2026.

## Conclusion

- 143 tables publiques inspectées.
- 143 tables avec RLS actif.
- 0 table sans RLS.
- Le rôle `service_role` contourne la RLS par conception Supabase : son usage est limité à la préparation des fixtures et aux opérations serveur explicitement auditées.
- Les relations indirectes nécessitent une policy fondée sur la ressource parente ; elles sont couvertes par les tests A/B lorsqu’elles sont exposées.

## Inventaire exhaustif

| Table | RLS | SELECT | INSERT | UPDATE | DELETE | anon | authenticated | service-role | Lien entreprise | Données | Observation |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| `abonnement_evenements` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `abonnement_stockage_releves` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, financières, documents/médias | Policies présentes + tests selon criticité |
| `abonnements_entreprises` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `absences_paie` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | financières, documents/médias | Policies présentes + tests selon criticité |
| `acces_support_log` | Oui | 1 | 0 | 0 | 0 | Non | Non | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `affectations` | Oui | 1 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `affectations_vehicules` | Oui | 1 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `alertes_operationnelles_ignorees` | Oui | 1 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | documents/médias | Policies présentes + tests selon criticité |
| `anomalies_paie` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `appareils_comptes` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles | Policies présentes + tests selon criticité |
| `appels_contacts` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `appels_offres` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `article_teintes` | Oui | 1 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles | Policies présentes + tests selon criticité |
| `articles_stock` | Oui | 1 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `bons_livraison` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | documents/médias | Policies présentes + tests selon criticité |
| `boutique_commandes` | Oui | 1 | 1 | 1 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, financières | Policies présentes + tests selon criticité |
| `boutique_lignes_commande` | Oui | 1 | 1 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Indirecte/technique à confirmer | personnelles, financières | Policies présentes + tests selon criticité |
| `boutique_produits` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Indirecte/technique à confirmer | personnelles, financières | Policies présentes + tests selon criticité |
| `bulletins_paie` | Oui | 1 | 1 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, financières, documents/médias | Policies présentes + tests selon criticité |
| `catalogue_options_abonnement` | Oui | 1 | 0 | 0 | 0 | **Oui** | Oui | Oui (bypass contrôlé) | Indirecte/technique à confirmer | personnelles, financières | Policies présentes + tests selon criticité |
| `catalogue_services_mise_en_service` | Oui | 1 | 0 | 0 | 0 | **Oui** | Oui | Oui (bypass contrôlé) | Indirecte/technique à confirmer | personnelles, financières | Policies présentes + tests selon criticité |
| `categories_notes_frais` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `champs_personnalises` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `chantier_transferts` | Oui | 1 | 2 | 2 | 2 | Non | Non | Oui (bypass contrôlé) | Indirecte/technique à confirmer | techniques/métier | Policies présentes + tests selon criticité |
| `chantiers` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles | Policies présentes + tests selon criticité |
| `charges_recurrentes` | Oui | 2 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `cles_api` | Oui | 2 | 2 | 2 | 2 | Non | Non | Oui (bypass contrôlé) | Directe | personnelles | Policies présentes + tests selon criticité |
| `clients` | Oui | 2 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, financières | Policies présentes + tests selon criticité |
| `codes_acces` | Oui | 2 | 2 | 2 | 2 | Non | Non | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `codes_identification` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `commandes_fournisseurs` | Oui | 2 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `comptes_rendus_chantier` | Oui | 1 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `compteurs_reference` | Oui | 0 | 0 | 0 | 0 | Non | Non | Oui (bypass contrôlé) | Directe | techniques/métier | Surface sans policy : interne/service uniquement |
| `connecteurs_externes` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles | Policies présentes + tests selon criticité |
| `connexions_bancaires` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `connexions_email` | Oui | 1 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles | Policies présentes + tests selon criticité |
| `contacts_clients` | Oui | 2 | 2 | 2 | 2 | Non | Non | Oui (bypass contrôlé) | Indirecte/technique à confirmer | personnelles | Policies présentes + tests selon criticité |
| `contrats_entretien` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `conversations_internes` | Oui | 2 | 1 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `coordonnees_bancaires` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `deductions_paie` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `demandes_conges` | Oui | 1 | 1 | 1 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `depenses_fournisseurs` | Oui | 2 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, financières, documents/médias | Policies présentes + tests selon criticité |
| `devis` | Oui | 2 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `documents_chantier` | Oui | 1 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, documents/médias | Policies présentes + tests selon criticité |
| `documents_notes_frais` | Oui | 1 | 1 | 1 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, financières, documents/médias | Policies présentes + tests selon criticité |
| `doe_generations` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `dossiers_paie_salaries` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `ecritures_comptables_importees` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `elements_export_notes_frais` | Oui | 1 | 1 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | documents/médias | Policies présentes + tests selon criticité |
| `emails_chantier` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `employes` | Oui | 1 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, financières, documents/médias | Policies présentes + tests selon criticité |
| `entreprise_besoins` | Oui | 1 | 1 | 1 | 0 | Non | Non | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `entreprise_feature_flags` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `entreprises` | Oui | 1 | 2 | 2 | 1 | Non | Non | Oui (bypass contrôlé) | Indirecte/technique à confirmer | personnelles, financières, documents/médias | Policies présentes + tests selon criticité |
| `equipes_chantiers` | Oui | 1 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `exports_notes_frais` | Oui | 1 | 1 | 1 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, documents/médias | Policies présentes + tests selon criticité |
| `facturation_comptes_mensuelle` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `factures` | Oui | 2 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `factures_abonnement` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `fiches_techniques_articles` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, documents/médias | Policies présentes + tests selon criticité |
| `fournisseurs` | Oui | 2 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, financières | Policies présentes + tests selon criticité |
| `grands_deplacements` | Oui | 1 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, financières | Policies présentes + tests selon criticité |
| `habilitations_employe` | Oui | 1 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `historique_tarification` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `indemnites_deplacement_paie` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | financières, documents/médias | Policies présentes + tests selon criticité |
| `interventions` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, financières, documents/médias | Policies présentes + tests selon criticité |
| `inventaires` | Oui | 1 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `journal_activite` | Oui | 2 | 1 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `journal_audit_notes_frais` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, documents/médias | Policies présentes + tests selon criticité |
| `journal_audit_paie` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `journal_ia` | Oui | 1 | 1 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `journal_paiements_bancaires` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `legal_holds_notes_frais` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `lignes_commande` | Oui | 2 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `lignes_devis` | Oui | 2 | 2 | 2 | 2 | Non | Non | Oui (bypass contrôlé) | Indirecte/technique à confirmer | financières | Policies présentes + tests selon criticité |
| `lignes_factures` | Oui | 2 | 2 | 2 | 2 | Non | Non | Oui (bypass contrôlé) | Indirecte/technique à confirmer | financières | Policies présentes + tests selon criticité |
| `lignes_inventaire` | Oui | 1 | 1 | 1 | 1 | Non | Non | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `lignes_metres` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles | Policies présentes + tests selon criticité |
| `lignes_modeles_devis` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `lignes_situations` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `lots_virements` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, financières | Policies présentes + tests selon criticité |
| `messages_internes` | Oui | 1 | 1 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `metres` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles | Policies présentes + tests selon criticité |
| `modeles_devis` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles | Policies présentes + tests selon criticité |
| `modeles_roles_predefinis` | Oui | 1 | 0 | 0 | 0 | **Oui** | Oui | Oui (bypass contrôlé) | Indirecte/technique à confirmer | personnelles | Policies présentes + tests selon criticité |
| `mouvements_outillage` | Oui | 1 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `mouvements_stock` | Oui | 1 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `notes_frais` | Oui | 3 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, financières, documents/médias | Policies présentes + tests selon criticité |
| `notifications_utilisateurs` | Oui | 1 | 0 | 1 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `options_abonnement_entreprises` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `ordres_virements` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `outils` | Oui | 1 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `paiements` | Oui | 2 | 2 | 2 | 2 | Non | Non | Oui (bypass contrôlé) | Indirecte/technique à confirmer | financières | Policies présentes + tests selon criticité |
| `parametres_paie_entreprise` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles | Policies présentes + tests selon criticité |
| `periodes_paie` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `permissions_disponibles` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Indirecte/technique à confirmer | techniques/métier | Policies présentes + tests selon criticité |
| `permissions_poste` | Oui | 2 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `pieces_jointes_devis` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, documents/médias | Policies présentes + tests selon criticité |
| `pieces_jointes_messages` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, documents/médias | Policies présentes + tests selon criticité |
| `pieces_jointes_paie` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, documents/médias | Policies présentes + tests selon criticité |
| `planning_evenements` | Oui | 1 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `plans_abonnement` | Oui | 1 | 0 | 0 | 0 | **Oui** | Oui | Oui (bypass contrôlé) | Indirecte/technique à confirmer | personnelles, financières | Policies présentes + tests selon criticité |
| `plateforme_acces_entreprises` | Oui | 0 | 0 | 0 | 0 | Non | Non | Oui (bypass contrôlé) | Directe | techniques/métier | Surface sans policy : interne/service uniquement |
| `plateforme_admins` | Oui | 0 | 0 | 0 | 0 | Non | Non | Oui (bypass contrôlé) | Indirecte/technique à confirmer | personnelles | Surface sans policy : interne/service uniquement |
| `plateforme_reinitialisations_mot_de_passe` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles | Policies présentes + tests selon criticité |
| `pointages` | Oui | 2 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, documents/médias | Policies présentes + tests selon criticité |
| `politiques_conservation_notes_frais` | Oui | 1 | 0 | 1 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `postes` | Oui | 2 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles | Policies présentes + tests selon criticité |
| `preferences_notifications_push` | Oui | 1 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `prestations_catalogue` | Oui | 2 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `primes_paie` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `profils_paie_employes` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, financières | Policies présentes + tests selon criticité |
| `push_abonnements` | Oui | 1 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `reglements_fournisseurs` | Oui | 2 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `regularisations_paie` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `relances_impayes` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `releves_kilometrage` | Oui | 1 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `remises_banque` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `remises_banque_paiements` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `sessions_pointage` | Oui | 2 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, documents/médias | Policies présentes + tests selon criticité |
| `signatures_documents` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, documents/médias | Policies présentes + tests selon criticité |
| `situations_travaux` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `sous_traitants_chantiers` | Oui | 2 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `stripe_webhook_events` | Oui | 0 | 0 | 0 | 0 | Non | Non | Oui (bypass contrôlé) | Indirecte/technique à confirmer | financières | Surface sans policy : interne/service uniquement |
| `suggestions_ocr_notes_frais` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | documents/médias | Policies présentes + tests selon criticité |
| `support_messages` | Oui | 1 | 1 | 0 | 0 | Non | Non | Oui (bypass contrôlé) | Directe | personnelles | Policies présentes + tests selon criticité |
| `taches` | Oui | 2 | 2 | 2 | 2 | Non | Non | Oui (bypass contrôlé) | Indirecte/technique à confirmer | techniques/métier | Policies présentes + tests selon criticité |
| `tarifs_fournisseurs` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | financières | Policies présentes + tests selon criticité |
| `temps_travail_paie` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `tentatives_acces_notes_frais` | Oui | 0 | 0 | 0 | 0 | Non | Non | Oui (bypass contrôlé) | Directe | personnelles | Surface sans policy : interne/service uniquement |
| `tentatives_borne_stock` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `types_chantier` | Oui | 1 | 2 | 2 | 2 | Non | Non | Oui (bypass contrôlé) | Directe | personnelles | Policies présentes + tests selon criticité |
| `utilisateurs` | Oui | 2 | 1 | 1 | 0 | Non | Non | Oui (bypass contrôlé) | Indirecte/technique à confirmer | personnelles | Policies présentes + tests selon criticité |
| `utilisateurs_entreprises` | Oui | 1 | 2 | 2 | 1 | Non | Non | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `valeurs_champs_personnalises` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `validations_notes_frais` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `validations_paie` | Oui | 1 | 1 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `vehicules` | Oui | 1 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | techniques/métier | Policies présentes + tests selon criticité |
| `verifications_zone_pointage` | Oui | 1 | 0 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles | Policies présentes + tests selon criticité |
| `versions_documents_notes_frais` | Oui | 1 | 1 | 0 | 0 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles, documents/médias | Policies présentes + tests selon criticité |
| `zones_deplacement_paie` | Oui | 2 | 1 | 1 | 1 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles | Policies présentes + tests selon criticité |
| `zones_depot` | Oui | 1 | 2 | 2 | 2 | Non | Oui | Oui (bypass contrôlé) | Directe | personnelles | Policies présentes + tests selon criticité |

## Méthode et limite

La présence d’une policy ne prouve pas seule sa correction. La preuve comportementale est apportée par les tests pgTAP `isolation_multitenant_*.test.sql`. L’analyse « données » est une classification conservatrice fondée sur les colonnes ; les tables techniques restent à requalifier à chaque évolution.
