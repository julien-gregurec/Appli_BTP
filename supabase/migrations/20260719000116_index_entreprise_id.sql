-- Performance : index sur entreprise_id.
--
-- Constat mesure en production : les pages mettaient 1,1 a 6,5 s cote serveur
-- meme a chaud et avec la fonction situee aupres de la base. Cause : la colonne
-- entreprise_id, qui filtre absolument toutes les requetes de cette application
-- multi-entreprises, n'etait indexee que sur 36 des 95 tables concernees.
-- Chaque affichage parcourait donc la table entiere, et les regles de securite
-- RLS (est_membre_actif / a_permission) etaient reevaluees ligne par ligne.
--
-- Aucun changement de code applicatif : uniquement des index.
-- Les tables sont petites a ce stade, la creation est quasi instantanee.

create index if not exists acces_support_log_entreprise_idx on public.acces_support_log(entreprise_id);
create index if not exists affectations_vehicules_entreprise_idx on public.affectations_vehicules(entreprise_id);
create index if not exists appels_contacts_entreprise_idx on public.appels_contacts(entreprise_id);
create index if not exists article_teintes_entreprise_idx on public.article_teintes(entreprise_id);
create index if not exists articles_stock_entreprise_idx on public.articles_stock(entreprise_id);
create index if not exists bons_livraison_entreprise_idx on public.bons_livraison(entreprise_id);
create index if not exists categories_notes_frais_entreprise_idx on public.categories_notes_frais(entreprise_id);
create index if not exists champs_personnalises_entreprise_idx on public.champs_personnalises(entreprise_id);
create index if not exists chantiers_entreprise_idx on public.chantiers(entreprise_id);
create index if not exists charges_recurrentes_entreprise_idx on public.charges_recurrentes(entreprise_id);
create index if not exists cles_api_entreprise_idx on public.cles_api(entreprise_id);
create index if not exists clients_entreprise_idx on public.clients(entreprise_id);
create index if not exists codes_acces_entreprise_idx on public.codes_acces(entreprise_id);
create index if not exists compteurs_reference_entreprise_idx on public.compteurs_reference(entreprise_id);
create index if not exists connexions_bancaires_entreprise_idx on public.connexions_bancaires(entreprise_id);
create index if not exists connexions_email_entreprise_idx on public.connexions_email(entreprise_id);
create index if not exists contrats_entretien_entreprise_idx on public.contrats_entretien(entreprise_id);
create index if not exists devis_entreprise_idx on public.devis(entreprise_id);
create index if not exists doe_generations_entreprise_idx on public.doe_generations(entreprise_id);
create index if not exists elements_export_notes_frais_entreprise_idx on public.elements_export_notes_frais(entreprise_id);
create index if not exists emails_chantier_entreprise_idx on public.emails_chantier(entreprise_id);
create index if not exists entreprise_besoins_entreprise_idx on public.entreprise_besoins(entreprise_id);
create index if not exists exports_notes_frais_entreprise_idx on public.exports_notes_frais(entreprise_id);
create index if not exists factures_entreprise_idx on public.factures(entreprise_id);
create index if not exists habilitations_employe_entreprise_idx on public.habilitations_employe(entreprise_id);
create index if not exists interventions_entreprise_idx on public.interventions(entreprise_id);
create index if not exists inventaires_entreprise_idx on public.inventaires(entreprise_id);
create index if not exists journal_activite_entreprise_idx on public.journal_activite(entreprise_id);
create index if not exists legal_holds_notes_frais_entreprise_idx on public.legal_holds_notes_frais(entreprise_id);
create index if not exists lignes_commande_entreprise_idx on public.lignes_commande(entreprise_id);
create index if not exists lignes_inventaire_entreprise_idx on public.lignes_inventaire(entreprise_id);
create index if not exists lignes_metres_entreprise_idx on public.lignes_metres(entreprise_id);
create index if not exists lignes_modeles_devis_entreprise_idx on public.lignes_modeles_devis(entreprise_id);
create index if not exists lignes_situations_entreprise_idx on public.lignes_situations(entreprise_id);
create index if not exists messages_internes_entreprise_idx on public.messages_internes(entreprise_id);
create index if not exists metres_entreprise_idx on public.metres(entreprise_id);
create index if not exists modeles_devis_entreprise_idx on public.modeles_devis(entreprise_id);
create index if not exists mouvements_outillage_entreprise_idx on public.mouvements_outillage(entreprise_id);
create index if not exists notifications_utilisateurs_entreprise_idx on public.notifications_utilisateurs(entreprise_id);
create index if not exists ordres_virements_entreprise_idx on public.ordres_virements(entreprise_id);
create index if not exists outils_entreprise_idx on public.outils(entreprise_id);
create index if not exists permissions_poste_entreprise_idx on public.permissions_poste(entreprise_id);
create index if not exists politiques_conservation_notes_frais_entreprise_idx on public.politiques_conservation_notes_frais(entreprise_id);
create index if not exists postes_entreprise_idx on public.postes(entreprise_id);
create index if not exists reglements_fournisseurs_entreprise_idx on public.reglements_fournisseurs(entreprise_id);
create index if not exists relances_impayes_entreprise_idx on public.relances_impayes(entreprise_id);
create index if not exists releves_kilometrage_entreprise_idx on public.releves_kilometrage(entreprise_id);
create index if not exists remises_banque_entreprise_idx on public.remises_banque(entreprise_id);
create index if not exists remises_banque_paiements_entreprise_idx on public.remises_banque_paiements(entreprise_id);
create index if not exists situations_travaux_entreprise_idx on public.situations_travaux(entreprise_id);
create index if not exists suggestions_ocr_notes_frais_entreprise_idx on public.suggestions_ocr_notes_frais(entreprise_id);
create index if not exists tarifs_fournisseurs_entreprise_idx on public.tarifs_fournisseurs(entreprise_id);
create index if not exists tentatives_acces_notes_frais_entreprise_idx on public.tentatives_acces_notes_frais(entreprise_id);
create index if not exists types_chantier_entreprise_idx on public.types_chantier(entreprise_id);
create index if not exists utilisateurs_entreprises_entreprise_idx on public.utilisateurs_entreprises(entreprise_id);
create index if not exists valeurs_champs_personnalises_entreprise_idx on public.valeurs_champs_personnalises(entreprise_id);
create index if not exists validations_notes_frais_entreprise_idx on public.validations_notes_frais(entreprise_id);
create index if not exists vehicules_entreprise_idx on public.vehicules(entreprise_id);
create index if not exists zones_depot_entreprise_idx on public.zones_depot(entreprise_id);

analyze;
