# Relais Claude Code — Plateforme BTP

## Mise à jour Codex — 12 juillet 2026 (à lire en premier)

- Les migrations hébergées **29 à 37 sont appliquées** (`28` est volontairement hors migrations, sous `supabase/production/`). Les migrations 35 code entreprise et 36 espace propriétaire ne sont plus en attente.
- Migration 36 contrôlée : colonne abonnement, propriétaire, fonctions de liste/modification et grant authentifié = OK. Page `/plateforme` HTTP 200.
- Planning hebdomadaire multi-ouvriers, accès/rôles, email avec CC, logo importable, pointage GPS+photo, stock Excel/PDF+nuanciers+scan, véhicules affectés et factures liées aux véhicules/outils sont livrés.
- La facture fournisseur peut être scannée/importée (PDF/image privée 20 Mo) et reliée à un chantier, un employé et un actif.
- Listes marque/modèle : véhicules via suggestions locales + API officielle vPIC, outillage via suggestions BTP ; saisie libre conservée.
- Lire `SUIVI_BESOINS_METIER.md` pour la matrice complète fait/partiel/externe.
- Validations vertes : lint, TypeScript, build webpack, diff-check.
- Le script de durcissement production a été complété pour les RPC 30–37 et retesté en `BEGIN … ROLLBACK` avec succès ; le prototype est confirmé intact (46 policies anon). Il reste NON APPLIQUÉ.

## Projet

- Dépôt : `/Users/juliengregurec/Documents/btp-platform`
- Next.js `16.2.10`, React 19, Supabase.
- Mode prototype sans connexion actif via `.env.local` (`DISABLE_EMAIL_LOGIN`).
- Base Supabase hébergée : projet `uykukebthgmqtxlmkpnn`.
- Lire `AGENTS.md` et la documentation locale Next.js 16 avant toute modification.

## État Git important

Le dépôt repose encore presque entièrement sur des fichiers non suivis depuis le commit initial. Ne pas lancer de nettoyage, reset ou checkout destructif. Les changements présents appartiennent au projet en cours.

## Modules fonctionnels

- Comptes et entreprises.
- Clients et chantiers, tâches et statuts.
- Employés.
- Planning par affectations : chantier + employé + date + heures + tâche.
- Devis : création, lignes, descriptions, statuts, modification des brouillons, duplication, recherche et filtres.
- Prestations préenregistrées : catalogue, création, modification, activation/désactivation et insertion dans les devis.
- Factures : création depuis devis accepté, statuts, paiements, échéance, recherche et filtres.
- Impression/PDF devis et factures.
- Tableau de bord opérationnel et alertes d’échéance.
- Fiches clients enrichies avec historique financier et documents récents.
- Fiches chantiers enrichies avec devis, factures, encaissements et heures planifiées.
- Paramètres d’entreprise modifiables depuis l’application.
- Recherche et filtres sur clients, chantiers, devis et factures.

## Travail récent détaillé

### Prestations

- Migration `20260710000012_prestations_catalogue.sql`.
- Table `prestations_catalogue`, RLS, accès prototype et cinq prestations BTP seedées.
- Routes `/prestations`, `/prestations/nouveau`, `/prestations/[id]/modifier`.
- Insertion immédiate d’une prestation dans `DevisEditor`.
- Description visible et modifiable dans la ligne du devis.
- Enregistrement rapide d’une ligne manuelle dans le catalogue.

### Devis

- Modification des brouillons via `/devis/[id]/modifier`.
- Migration `13` : modification atomique du devis et de ses lignes.
- Migration `14` : duplication atomique vers un nouveau brouillon.
- Boutons Modifier et Dupliquer sur la fiche.
- Transitions de statut limitées côté UI et serveur.
- Recherche par numéro/client/chantier, filtre de statut et indicateurs.
- Confirmations sur duplication et suppression.

### Factures

- Recherche et filtre par statut.
- Indicateurs total facturé, encaissé et reste dû.
- Date d’échéance modifiable sur la fiche.
- Paiements refusés sur brouillon/annulée/avoir et si le montant dépasse le reste dû.
- Suppression d’un paiement confirmée et vérifiée contre sa facture.
- Transitions de statut limitées ; statuts payés pilotés automatiquement par les paiements.

### Tableau de bord

- Total facturé, encaissé, reste à encaisser, devis acceptés.
- Devis à suivre, chantiers actifs et prochaines affectations.
- Alertes pour factures échues non soldées et devis envoyés expirés.

### Clients

- La fiche client affiche le total facturé, encaissé et le reste dû.
- Les cinq derniers devis et factures sont accessibles depuis la fiche.
- Le bouton « Nouveau devis » présélectionne le client.

### Chantiers

- La fiche chantier affiche devis acceptés, facturé, encaissé et heures planifiées.
- Les documents récents sont accessibles depuis la fiche.
- Le bouton « Nouveau devis » présélectionne maintenant réellement le client et le chantier.
- La liste des chantiers est filtrable par texte et statut.

### Paramètres

- Route `/parametres` active dans le menu.
- Modification de l’identité, adresse, SIRET, assurances, pénalités de retard et textes des documents.
- Les valeurs alimentent les impressions devis/factures existantes.

### Listes

- Clients : recherche par référence, nom ou ville, filtres type/statut.
- Chantiers : recherche par référence, nom, client ou ville, filtre statut.
- Devis et factures : recherches, filtres et indicateurs financiers.

### Sécurité

- Les actions serveur de clients, employés, planning, prestations, chantiers, tâches, devis et factures vérifient explicitement `entreprise_id` en complément de la RLS.
- Composant `ConfirmSubmitButton` pour les actions sensibles.

## Migrations Supabase

Appliquées manuellement sur la base hébergée :

- `20260710000012_prestations_catalogue.sql`
- `20260710000013_modification_devis_atomique.sql`
- `20260710000014_duplication_devis.sql`
- `20260710000015_creation_devis_atomique.sql`
- `20260710000016_delai_paiement_client.sql`
- `20260710000017_modification_facture_atomique.sql`
- `20260710000018_pointages.sql`
- `20260710000019_stock.sql`
- `20260710000020_synchro_statuts.sql`
- `20260710000021_commandes_fournisseurs.sql`
- `20260710000022_documents_chantier.sql`
- `20260710000023_flotte.sql`
- `20260710000024_outillage.sql`
- `20260710000025_depot_inventaires.sql`
- `20260710000026_depenses_fournisseurs.sql`
- `20260710000027_charges_recurrentes.sql`

### État de la création atomique

`20260710000015_creation_devis_atomique.sql` est appliquée. La RPC `creer_devis_brouillon` utilisée par `src/app/actions/devis.ts` est disponible sur la base hébergée.

Attention avec l’éditeur SQL Supabase : un onglet réutilisé a déjà mélangé deux requêtes. Toujours créer un nouveau snippet vierge, coller la migration, vérifier visuellement que la fin du fichier est correcte, puis exécuter.

## Validations effectuées

Après les derniers changements, les commandes suivantes étaient vertes :

```bash
npm run lint
npx tsc --noEmit --incremental false
npx next build --webpack
git diff --check
```

## Reprise recommandée

1. Tester la création réelle d’un devis avec une prestation préenregistrée, puis sa modification et sa duplication.
2. Vérifier visuellement les nouvelles fiches client/chantier et `/parametres`.
3. Prochaine fonctionnalité métier recommandée : édition atomique des factures brouillons ou conditions de paiement/échéance par défaut depuis la fiche client.

## Rebranding LIRIA CONCEPT — 11 juillet 2026

- L’entreprise `ENT-001` a été renommée `LIRIA CONCEPT` dans la base Supabase hébergée.
- Nom commercial confirmé par `LIRIA_CONCEPT_Dossier_Pro.pdf` : LIRIA CONCEPT.
- Positionnement : spécialiste de l’aménagement intérieur, professionnels et particuliers.
- Slogan : `Concevoir • Aménager • Réaliser`.
- Coordonnées reprises du visuel véhicule : `06 50 93 11 87` et `liriaconcept@gmail.com`.
- Charte reprise du dossier de marque : bleu nuit `#0D1B2A`, or `#C9A24A`, anthracite `#1F2328`, blanc `#FFFFFF`.
- Logo intégré dans `public/liria-concept-logo.png` et affiché dans la navigation ainsi que les devis/factures imprimables.
- Métadonnées, pages de connexion et navigation renommées LIRIA CONCEPT.
- Les anciens statuts PDF concernent `JULIEN GREGUREC MULTISERVICES` : leur capital et leur dénomination n’ont volontairement pas été attribués à LIRIA CONCEPT.

### Délais de paiement clients

- La migration `20260710000016_delai_paiement_client.sql` est appliquée sur la base hébergée.
- Chaque client dispose d’un délai de paiement de 0 à 365 jours, 30 jours par défaut.
- La création d’une facture depuis un devis accepté calcule automatiquement `date_echeance` depuis ce délai.
- La fonction vérifie que le devis est accepté, possède un client et que ce client appartient à la même entreprise.
- Test transactionnel réussi sur `DEV-2026-003` : échéance attendue obtenue, puis transaction annulée sans conserver la facture de test.
- Contrôle du schéma réussi : colonne `clients.delai_paiement_jours` et RPC `creer_facture_depuis_devis(uuid,text)` présentes.

### Modification des factures brouillons

- Route active : `/factures/[id]/modifier`, accessible seulement pour une facture au statut brouillon.
- Édition du client, chantier, type, dates d’émission et d’échéance, notes et lignes.
- Insertion de prestations depuis le catalogue et aperçu instantané HT/TVA/TTC.
- Migration `20260710000017_modification_facture_atomique.sql` appliquée sur la base hébergée.
- RPC `modifier_facture_brouillon` : verrouille la facture, refuse les factures émises, valide client/chantier, remplace les lignes et recalcule les totaux dans une transaction unique.
- Test transactionnel réussi : facture temporaire créée, remplacée par une ligne de 200 € HT / 240 € TTC, total contrôlé, puis transaction annulée.
- Le détail d’une facture vérifie maintenant explicitement `entreprise_id` et affiche le bouton Modifier uniquement en brouillon.

### Pointage des heures

- Module `/pointage` actif dans la navigation.
- Migration `20260710000018_pointages.sql` appliquée sur la base hébergée.
- Saisie des heures normales, heures supplémentaires, pause, tâche et commentaire par employé, chantier et date.
- Contrôles base : maximum 24 h, valeurs positives et cohérence entreprise/employé/chantier.
- Filtre mensuel, totaux normaux/supplémentaires, total par employé et détail des saisies.
- Suppression protégée par confirmation et filtrée par `entreprise_id`.
- Test réel réussi : pointage de 7 h créé dans l’application, visible dans les totaux et la liste, puis supprimé sans laisser de donnée de test.

### Rentabilité des chantiers

- Module `/rentabilite` actif dans la navigation.
- Agrège par chantier les devis acceptés, les factures HT et les heures réellement pointées.
- Calcule le coût de main-d’œuvre depuis `employes.cout_horaire`, la marge estimée et le taux de marge.
- Vue synthétique globale et tableau détaillé avec accès direct aux chantiers.
- L’interface indique explicitement que matériaux, sous-traitance, déplacements et frais généraux ne sont pas encore déduits.
- Vérification visuelle réussie sur les données LIRIA : 15 090 € HT facturés affichés pour le chantier existant.

### Stock

- Module `/stock` actif dans la navigation.
- Migration `20260710000019_stock.sql` appliquée sur la base hébergée.
- Catalogue d’articles avec référence unique, unité, emplacement, seuil d’alerte et prix d’achat HT.
- Entrées, sorties chantier et ajustements avec historique des 30 derniers mouvements.
- Le stock disponible est mis à jour sous verrou par un trigger ; une sortie supérieure au disponible est refusée.
- Synthèse du nombre d’articles, alertes de réapprovisionnement et valeur d’achat estimée.
- Test transactionnel réussi : article temporaire, entrée de 10 unités, quantité contrôlée à 10, puis transaction annulée.

### Synchronisation statuts et commandes fournisseurs — 12 juillet 2026

- Migration 20 appliquée après audit de sécurité : factures FAC-2026-001/002/003 payées, chantier CHA-2026-001 facturé.
- Les acomptes, situations et avoirs ne clôturent pas automatiquement un chantier.
- Recalcul paiements sérialisé, liens document/chantier isolés par entreprise et helpers internes retirés aux rôles publics.
- Migration 21 appliquée après réécriture : fournisseurs et commandes strictement isolés par entreprise.
- Création commande+lignes atomique, totaux multi-TVA recalculés en base, transitions et réceptions atomiques.
- Réception partielle et complète disponible depuis la fiche commande.
- Tests SQL et navigateur réussis ; données de test fournisseur/commande supprimées et absence résiduelle vérifiée.
- Le relais de référence le plus récent est désormais `RELAIS_CHATGPT.md` dans le dépôt, synchronisé vers `/Users/juliengregurec/RELAIS_CHATGPT.md`.

### Photos et documents chantier — 12 juillet 2026

- Migration 22 appliquée sur la base hébergée ; bucket privé `chantier-documents` et table `documents_chantier`.
- Route `/chantiers/[id]/documents` : ajout d’images, PDF, Word et Excel (15 Mo maximum), 8 catégories métier et note facultative.
- Galerie avec aperçu des images, libellé de catégorie, taille, téléchargement par URL signée et suppression confirmée.
- Isolation par entreprise dans la table et dans Storage ; le mode prototype est limité à ce bucket.
- La fiche chantier affiche le lien « Photos & documents » et le nombre de pièces.
- Test réel réussi avec une pièce technique temporaire : affichage, lien de téléchargement HTTP 307, suppression via l’interface et compteur revenu à zéro.
- `npm run lint`, TypeScript, build production webpack et `git diff --check` sont verts.
- Prochaine fonctionnalité recommandée : flotte automobile (véhicules, kilométrage, entretiens et échéances).

### Flotte automobile — 12 juillet 2026

- Migration 23 appliquée : `vehicules` et `releves_kilometrage`, isolation entreprise et RLS.
- Module `/flotte` actif dans la navigation : liste, création, fiche véhicule et alertes d’échéance.
- Suivi contrôle technique, assurance, entretien par date/km et historique kilométrique.
- Le kilométrage est mis à jour sous verrou et ne peut pas diminuer.
- Test navigateur réussi : véhicule temporaire à 10 000 km puis relevé à 10 150 km ; données de test supprimées.
- Prochaine fonctionnalité recommandée : outillage.

### Outillage — 12 juillet 2026

- Migration 24 appliquée : registre `outils`, historique `mouvements_outillage`, références automatiques et isolation entreprise.
- Module `/outillage` actif : liste, alertes de vérification, création et fiche individuelle.
- Affectation à un employé et/ou chantier, retour, maintenance, remise en service, mise hors service et perte.
- Transitions atomiques sous verrou ; une double affectation est refusée et chaque mouvement est historisé.
- Test navigateur création → affectation Julien → retour réussi, puis test direct du verrou ; quatre mouvements contrôlés avant suppression de l’outil temporaire.
- Audit des privilèges : les rôles applicatifs ne peuvent ni modifier ni supprimer directement `outils`, mais peuvent appeler la RPC métier.
- Prochaine fonctionnalité recommandée : dépôt et inventaires.

### Dépôt et inventaires — 12 juillet 2026

- Migration 25 appliquée : zones physiques, rattachement des articles/outils, inventaires et lignes de comptage.
- `/depot` gère les zones et le rangement des articles ; zone « Dépôt principal » créée automatiquement.
- `/inventaires` permet un comptage global ou par zone, avec sauvegarde puis validation atomique.
- Les écarts créent automatiquement des mouvements de stock ; une seconde validation est refusée.
- Si le stock change après l’instantané, la validation est bloquée et le brouillon est conservé.
- Test réel 10 unités → 8 comptées → stock ajusté à 8, puis test de concurrence réussi. Données temporaires nettoyées, compteurs à zéro.
- Prochaine fonctionnalité recommandée : centre d’alertes opérationnelles sur le tableau de bord.

### Centre d’alertes opérationnelles — 12 juillet 2026

- Le tableau de bord consolide maintenant les alertes factures, devis, commandes fournisseurs, stock, flotte et outillage.
- Priorités « critique » et « à anticiper », triées par gravité puis échéance.
- Échéances contrôlées : encaissement, validité commerciale, livraison, contrôle technique, assurance, entretien date/km et vérification outillage.
- Chaque alerte mène directement à l’objet concerné ; l’état sans alerte est également prévu.
- Vérification navigateur réussie sur une vraie alerte de vérification Outillage.
- Prochaine fonctionnalité recommandée : exports comptables CSV factures/règlements/TVA.

### Exports comptables CSV — 12 juillet 2026

- Module `/exports` actif dans la navigation, période début/fin configurable.
- Journal des ventes, journal des règlements et détail/synthèse TVA téléchargeables.
- Format Excel français : UTF-8 BOM, séparateur point-virgule et virgule décimale.
- Avoirs négatifs, brouillons sans numéro exclus, synthèse regroupée par facture et taux.
- Protection contre l’injection de formules CSV ; nombres négatifs conservés comme valeurs numériques.
- Tests réels : ventes 4 lignes, règlements 6 lignes, TVA cohérente à 4 160,00 € entre journal et synthèse, en-têtes et noms de fichiers validés.
- Prochaine fonctionnalité recommandée : dépenses/factures fournisseurs reliées aux chantiers et à la rentabilité.

### Dépenses fournisseurs et rentabilité réelle — 12 juillet 2026

- Migration 26 appliquée : factures/dépenses fournisseurs et règlements, avec RLS et isolation entreprise.
- Module `/depenses` actif : fournisseur, chantier, commande, catégorie, HT, TVA, TTC, échéance et paiements.
- Anti-doublon, commande cohérente avec fournisseur/chantier, paiement plafonné sous verrou et statut automatique.
- Les en-têtes sont immuables pour les rôles applicatifs après création ; seuls les flux contrôlés mettent à jour règlement/statut.
- `/rentabilite` déduit désormais les dépenses HT rattachées au chantier en plus de la main-d’œuvre.
- Test réel 120 € TTC : partiel 50 €, surpaiement refusé, solde 70 €, statut payé ; marge chantier réduite de 100 € HT puis restaurée après nettoyage. Compteurs temporaires 0/0.
- Prochaine fonctionnalité recommandée : trésorerie prévisionnelle.

### Trésorerie prévisionnelle — 12 juillet 2026

- Module `/tresorerie` actif dans la navigation.
- Encaissements/décaissements réalisés sur 30 jours, reste total clients/fournisseurs et projection 90 jours.
- Treize semaines avec entrées, sorties, net et variation cumulée, plus graphique en barres.
- Échéances dépassées regroupées dans la première semaine ; flux au-delà de 90 jours ignorés.
- Données réelles vérifiées : 24 960 € encaissés sur 30 jours et aucun reste au moment du test.
- Moteur pur testé : retard 100 € en semaine 1, sortie 40 € en semaine 2, cumul 60 €, hors-fenêtre ignoré.
- Prochaine fonctionnalité recommandée : charges récurrentes et frais généraux.

### Charges récurrentes — 12 juillet 2026

- Migration 27 appliquée : `charges_recurrentes`, lien vers les dépenses et RPC de matérialisation atomique.
- `/charges` gère fournisseur, catégorie, chantier, périodicité, HT/TVA, date de fin et prochaine échéance.
- Les occurrences futures sont incluses dans `/tresorerie` ; la transformation en facture fournisseur avance la date.
- Test réel : 60 € TTC mensuels → 180 € projetés sur 90 jours ; dépense créée, prochaine échéance au mois suivant, projection inchangée donc aucun double comptage.
- Audit SQL table/colonne/RPC/grant réussi ; données temporaires supprimées, compteurs 0/0/0.
- Prochaine étape structurante : préparer le passage en production (auth réelle, retrait du prototype anon, hébergement et secrets).

### Préparation production — 12 juillet 2026

- `PRODUCTION_CHECKLIST.md` créé avec préconditions, ordre de bascule, validations et retour arrière.
- Script manuel `supabase/production/sortie_mode_prototype.sql` créé mais **NON APPLIQUÉ** et volontairement sorti des migrations automatiques.
- Elle supprime les policies/grants anon, verrouille les fonctions SECURITY DEFINER, conserve les RPC authentifiées et retire `dev_contexte_entreprise`.
- Dry-run transactionnel avec rollback réussi : assertions sécurité toutes vertes et prototype encore accessible après annulation.
- Le propriétaire LIRIA est techniquement prêt : membre actif, profil, compte Auth, email confirmé, mot de passe et connexion antérieure vérifiés sans afficher ses données personnelles.
- Blocage volontaire : ne pas appliquer le script manuel de production avant choix de l’hébergement/URL, sauvegarde et confirmation explicite de la coupure du prototype.

### Travail en attente à ne pas oublier

- Une fois le SIRET et la forme juridique définitifs de LIRIA connus, compléter les paramètres légaux sans reprendre automatiquement ceux de l’ancienne SAS.

### Historique de démonstration complet — 12 juillet 2026

- Supabase contient désormais plusieurs mois d'activité fictive mais réaliste, sans suppression des données antérieures.
- Totaux : 8 clients, 9 chantiers, 8 employés, 12 devis, 8 factures, 12 affectations planning, 13 pointages, 10 prestations, 12 articles / 20 mouvements de stock, 3 zones de dépôt, 1 inventaire validé, 7 fournisseurs, 5 commandes, 3 véhicules, 9 outils, 6 dépenses fournisseurs et 3 charges récurrentes.
- Les liens métier sont renseignés : clients/chantiers/documents/paiements, équipes/temps, stock/chantiers, fournisseurs/commandes/dépenses, véhicules et outils/ouvriers.
- Coordonnées fictives sur `example.fr`, marqueur `HISTORIQUE_DEMO_LIRIA_2026`, références `DEMO-*`.
- Script réexécutable sans doublons : `scripts/seed-demo-history.mjs` (double exécution contrôlée avec compteurs identiques).

### Lot terrain, emails et imports — 12 juillet 2026

- Migrations 38/39 appliquées : sessions arrivée/départ GPS+photos et historique atomique des affectations véhicule.
- `/pointage` calcule automatiquement les heures depuis l’arrivée et le départ, pause déduite ; la saisie manuelle reste disponible.
- PDF A4 et envoi email assisté avec CC ajoutés aux commandes fournisseur ; devis/factures conservent le même flux.
- Fiche véhicule enrichie : affectation courante et historique, factures liées avec chantier, résumé des travaux récents de l’ouvrier.
- Matériel hors service explicitement indisponible et toujours bloqué à l’affectation par la RPC.
- Imports XLSX/CSV/PDF ajoutés pour flotte et outillage.
- Photo chantier rapide depuis téléphone, classée avant/pendant/après travaux.
- Lint, TypeScript, build webpack et tests visuels locaux verts.

### Adaptation mobile — 12 juillet 2026

- En-tête compact et menu coulissant sur téléphone ; navigation bureau inchangée.
- Grilles, cartes et formulaires passent en une colonne ; boutons agrandis et modales adaptées à la hauteur disponible.
- Les tableaux défilent dans leur conteneur sans élargir toute la page.
- Tests 390×844 et 360×800 réussis sur dashboard, pointage, devis, stock, flotte et commandes, sans débordement horizontal.

### Permissions Consulter / Gérer — 12 juillet 2026

- Migration 40 appliquée : droits `acces_*` de consultation séparés de 12 nouveaux droits `gerer_*`.
- Postes existants rétrocompatibles : leur gestion a été conservée initialement ; décocher seulement Gérer les rend lecteurs.
- UI des rôles simplifiée avec badges Consulter/Gérer ; Gérer implique automatiquement Consulter côté SQL.
- Mode lecture seule : bandeau explicite, actions de mutation masquées, filtres GET conservés.
- Protection serveur : les POST sont refusés par le proxy si le droit Gérer du module manque.

### Pointage GPS simplifié — 12 juillet 2026

- Migration 41 appliquée : photo facultative en base et RPC compatible GPS seul.
- Nouveau pointage : employé + chantier obligatoire + GPS obligatoire ; date et heure automatiques à l’arrivée et au départ.
- Photos et saisie manuelle retirées de l’interface ; tâche facultative, pause et calcul des heures conservés.
- Historique dédié avec chantier bien visible, arrivée, départ, durée et liens GPS. Anciennes saisies conservées en archives.

### Comptes collaborateurs et carte BTP — 13 juillet 2026

- Parcours collaborateur déjà présent : inscription individuelle, saisie du code entreprise, demande d’adhésion, validation admin et affectation d’un poste avec droits Consulter/Gérer.
- La séparation des comptes nécessite encore l’activation volontaire de l’authentification réelle ; en mode prototype sans connexion, le contexte administrateur reste partagé.
- Migration 42 appliquée : métadonnées de carte BTP sur `employes` et bucket privé `documents-employes` (PDF/PNG/JPEG/WebP, 10 Mo).
- La fiche employé permet d’importer/remplacer, présenter, télécharger et supprimer la carte ; numéro et expiration sont facultatifs.
- La route privée `/api/employes/[id]/carte-btp` contrôle l’entreprise puis génère un lien signé temporaire. Test mobile 360×800 validé.

## Fichiers clés

- `src/components/DevisEditor.tsx`
- `src/app/actions/devis.ts`
- `src/app/actions/factures.ts`
- `src/app/actions/prestations.ts`
- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/devis/[id]/modifier/page.tsx`
- `src/app/(app)/prestations/page.tsx`
- `src/components/ConfirmSubmitButton.tsx`
- `supabase/migrations/20260710000012_prestations_catalogue.sql`
- `supabase/migrations/20260710000013_modification_devis_atomique.sql`
- `supabase/migrations/20260710000014_duplication_devis.sql`
- `supabase/migrations/20260710000015_creation_devis_atomique.sql`
