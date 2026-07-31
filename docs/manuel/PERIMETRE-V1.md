# Périmètre du manuel — Version commerciale V1

**Version documentaire basée sur `main` au commit `4d92ddb`. Validation finale requise avec la branche de commercialisation (`release/commercialisation-v1`) avant publication.**

Ce document fixe ce que le manuel utilisateur V1 documente en détail, ce qu'il présente uniquement comme limité/en préparation, et ce qu'il exclut. Il découle de `docs/developpement/inventaire-fonctionnalites.md` (31 juillet 2026) et des décisions explicites de Julien Gregurec du 31 juillet 2026.

## Matrice des modules

| Domaine | Module | Statut manuel | Détail |
|---|---|---|---|
| Prise en main | Connexion, tableau de bord | **Inclus V1** | Chapitres 1–2 |
| Ventes | Clients | **Inclus V1** | Chapitre dédié |
| Ventes | Devis et prestations | **Inclus V1** | Chapitre dédié |
| Ventes | Factures standard | **Inclus V1** | Chapitre dédié — la facturation *avancée* (situations, acomptes, avoirs, DGD) n'est pas couverte en V1 |
| Chantiers | Fiche chantier | **Inclus V1** | Chapitre dédié |
| Chantiers | Planning | **Inclus V1** | Chapitre dédié |
| Chantiers | Pointage (+ suivi de zone) | **Inclus V1** | Chapitre dédié — suivi de zone présenté avec sa limite connue (fonctionne app ouverte uniquement) |
| RH | Employés | **Inclus V1** | Chapitre dédié |
| RH | Congés | **Inclus V1** | Chapitre dédié |
| RH | Notes de frais | **Inclus V1** | Chapitre dédié |
| Achats | Fournisseurs | **Inclus V1** | Chapitre dédié |
| Achats | Commandes et réceptions | **Inclus V1** | Chapitre dédié |
| Stock | Stock et inventaires | **Inclus V1** | Chapitre dédié |
| Matériel | Outillage et flotte | **Inclus V1** | Chapitre dédié |
| Pilotage | Rentabilité et exports | **Inclus V1** | Chapitre dédié |
| Communication | Messagerie et notifications | **Inclus V1** | Chapitre dédié |
| IA | Assistant IA (usages validés) | **Inclus V1** | Uniquement les usages confirmés fonctionnels dans l'inventaire ; l'Option IA à paliers renvoie à la section bêta pour son volet facturation |
| SaaS | Abonnement | **Inclus V1** | Chapitre dédié — hors volet facturation Option IA |
| Compte | Paramètres et permissions utiles au client | **Inclus V1** | Chapitre dédié — hors `/parametres/version` (page technique support, non destinée au manuel client) |

## Fonctions en bêta, limitées ou en préparation

Ces fonctions existent dans le code et sont visibles dans l'application, mais ne doivent **pas** faire l'objet d'une procédure détaillée dans le manuel V1 tant qu'elles n'ont pas été validées spécifiquement.

| Module | Statut | Justification |
|---|---|---|
| CRM | Non incluse dans la version commerciale actuelle | Hors périmètre V1 défini par Julien Gregurec le 31/07/2026 |
| Facturation avancée | Non incluse dans la version commerciale actuelle | Hors périmètre V1 |
| Ouvrages et métrés | Non incluse dans la version commerciale actuelle | Hors périmètre V1 |
| Interventions | Non incluse dans la version commerciale actuelle | Hors périmètre V1 |
| Sous-traitants | Non incluse dans la version commerciale actuelle | Hors périmètre V1 |
| Appels d'offres | Non incluse dans la version commerciale actuelle | Hors périmètre V1 |
| Connecteurs fournisseurs | Non incluse dans la version commerciale actuelle | Hors périmètre V1 ; dépend en plus d'accords fournisseurs externes |
| Paie | Non incluse dans la version commerciale actuelle | Hors périmètre V1 ; le calcul existe mais le virement des salaires dépend d'un prestataire externe |
| Grands déplacements | Non incluse dans la version commerciale actuelle | Hors périmètre V1 |
| Petits déplacements | Non incluse dans la version commerciale actuelle | Hors périmètre V1 |
| Boutique | Disponible sous conditions | Paiement Stripe présent dans le code, vérification manuelle de bout en bout non encore réalisée |
| Banque Powens | Dépendante d'un prestataire externe | Contrat Powens non souscrit (`POWENS_CLIENT_ID`/`POWENS_CLIENT_SECRET` vides) |
| Virements fournisseurs | Dépendante d'un prestataire externe | Même dépendance Powens |
| Virements de salaires | Dépendante d'un prestataire externe | Même dépendance Powens |
| Facturation automatique de l'Option IA | Disponible sous conditions | Mécanique complète (essai, paliers, coupure d'accès) ; facturation réelle bloquée tant que les 6 prix Stripe (`STRIPE_PRICE_OPTION_IA_*`) ne sont pas créés |

Ces modules seront regroupés dans une section unique du manuel intitulée **« Fonctions en bêta, limitées ou en préparation »**, sans procédure pas-à-pas, avec pour chacun : nom, statut (une des six valeurs ci-dessus), et une phrase expliquant la condition manquante — jamais de date de disponibilité promise.

## Exclus du manuel client (aucune mention prévue)

- `/plateforme/*` (back-office interne Liria — documentation opérationnelle séparée si besoin, hors périmètre manuel client)
- `/parametres/version` (page technique de support)
- CGU / CGV / confidentialité / cookies / mentions légales (pages légales autonomes, pas du contenu de manuel)
- `docs/audits/*` (travail de sécurité Codex sur `release/commercialisation-v1`, non consulté et non recopié)

## Rappel méthodologique

Aucun élément de cette matrice n'affirme qu'une fonction listée « Inclus V1 » a été testée en exécution réelle. Le statut « Inclus V1 » signifie uniquement : dans le périmètre commercial défini par Julien Gregurec, à documenter en priorité. Chaque chapitre correspondant doit préciser sa propre source de validation (voir `MODELE-CHAPITRE.md`).
