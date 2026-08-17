# C6-A — Audit de préparation au premier client ELSATIA

Date de l’audit : 16 août 2026

Périmètre : parcours d’inscription, essai, abonnement, paramétrage, équipe, premières opérations et support

Nature de l’audit : lecture du code et de la configuration, contrôles locaux isolés, contrôles Vercel Preview en lecture seule, revue des documents existants

Exclusions : aucune correction applicative, aucun paiement réel, aucune écriture Production, aucun contact prospect

## Addendum C6-B — 17 août 2026

Les trois blocants fonctionnels repris par C6-B ont été corrigés et validés en Local, puis la migration dédiée `20260816000204_c6b_corrections_premier_client.sql` a été appliquée isolément au projet Supabase Preview :

- les privilèges SQL manquants sur `lignes_devis` ont été ajoutés sans desserrer les politiques RLS ; le même défaut indépendant sur `lignes_factures`, nécessaire au parcours devis → facture, a été corrigé dans le même périmètre ;
- l’essai possède désormais une date de début serveur et une date de fin autoritaire fixée à 30 jours, indépendamment de la finalisation de Stripe Checkout ; un utilisateur de l’entreprise ne peut modifier ni prolonger ces données ;
- le dirigeant peut choisir explicitement d’activer son propre pointage depuis l’onboarding ; cette action crée ou rattache uniquement sa fiche salarié, sans création silencieuse lors du bootstrap.

Les tests locaux C6-B, devis/factures, abonnement, pointage, isolation multi-tenant, ADMIN-V1 et PROMO-V1 sont réussis. Le déploiement Vercel Preview `dpl_E7GHhbR6vVnkfGt4pJdo8nCW6hj5` est `Ready`. Cet addendum ne vaut pas validation Production : aucune migration, variable, donnée ou ressource Stripe Live n’a été modifiée.

## 1. Verdict exécutif

ELSATIA dispose déjà d’un parcours d’accueil structuré, d’une séparation multi-entreprise robuste, d’un système de rôles, d’imports utiles et d’une base d’abonnement Stripe cohérente. Un dirigeant peut créer un compte, créer son entreprise, choisir une offre, compléter un parcours de démarrage, ajouter des collaborateurs et saisir une partie des premières données.

Le parcours n’est toutefois **pas encore prêt pour accueillir sans risque un premier client réel**. Deux anomalies sont bloquantes :

1. la création du premier devis échoue dans l’environnement local de référence sur un défaut de privilèges de la table `lignes_devis` ;
2. une entreprise créée sans finaliser Stripe reste en statut `essai` sans date de fin, ce qui rend la limite annoncée de 30 jours inopérante.

Avant tout paiement réel, il faut également réaliser une validation Stripe complète en Preview, mettre à niveau le schéma Production, sécuriser les mentions légales et la configuration documentaire, clarifier le périmètre réel de l’IA et compléter les communications d’onboarding.

### Synthèse des constats

| Niveau | Nombre | Décision |
|---|---:|---|
| Blocants premier client | 2 | Aucun onboarding réel tant qu’ils ne sont pas corrigés et retestés |
| Importants avant paiement | 8 | À terminer avant toute souscription payante |
| Améliorations d’onboarding | 5 | Peuvent suivre les blocants, mais doivent être planifiées |
| Lacunes documentaires | 4 | À combler avant ou pendant le pilote encadré |

Verdict : **C6-A AUDITÉ — CORRECTIONS REQUISES AVANT PREMIER CLIENT**.

## 2. Environnements et méthode de contrôle

### Environnements utilisés

- **Local Supabase** : création d’un utilisateur fictif et d’une entreprise fictive, puis simulation du parcours. Toutes les données de test ont été supprimées à la fin du contrôle.
- **Vercel Preview `elsatia-preview`** : contrôle en lecture seule de la présence des noms de variables nécessaires. Aucune valeur de secret n’a été affichée ni consignée.
- **Projet Supabase lié** : lecture seule de l’état des migrations afin de comparer le schéma local et le schéma distant.
- **Production** : aucune écriture, aucun test client, aucun paiement, aucun changement de configuration.

### Limite Stripe

Les variables Stripe de base sont déclarées dans Preview, mais leur valeur et les objets Stripe associés n’ont pas pu être validés de manière indépendante depuis l’environnement d’audit. Aucun paiement test n’a donc été déclenché. La présence d’une variable ne constitue pas une preuve que le prix, le produit, le webhook et le portail sont correctement reliés.

### Contrôles techniques exécutés

- tests applicatifs : **57 fichiers / 289 tests réussis** ;
- tests de base de données locale : **15 fichiers / 241 assertions réussies** ;
- TypeScript : réussi ;
- lint : réussi avec **0 erreur et 3 avertissements** déjà identifiés sur l’usage d’images ;
- audit local d’onboarding fictif : inscription, création d’entreprise, client, chantier, équipe, planning et note de frais réussis ; premier devis et pointage personnel non aboutis pour les raisons détaillées ci-dessous.

## 3. Parcours réel d’un nouveau client

### Chemin nominal observé

1. Le prospect ouvre `/signup`.
2. Il renseigne son identité, son e-mail, son mot de passe et éventuellement une offre ou un code d’entreprise.
3. Supabase Auth crée son compte ; la confirmation d’e-mail dépend de la configuration de l’environnement.
4. Après connexion, un utilisateur sans entreprise est dirigé vers `/onboarding`.
5. Le dirigeant crée son entreprise. Le nom est obligatoire ; le SIRET et l’adresse peuvent être omis.
6. La procédure de bootstrap crée l’entreprise, le poste dirigeant, l’adhésion active et les permissions administrateur.
7. L’entreprise est initialisée en statut `essai`.
8. L’utilisateur passe par `/onboarding/besoins`, obtient une recommandation d’offre et choisit mensuel ou annuel.
9. Si Stripe est configuré, il doit enregistrer une carte dans Stripe Checkout pour démarrer l’essai Stripe de 30 jours.
10. Il revient dans l’application et ouvre `/onboarding/demarrage`.
11. Il complète l’entreprise, prépare l’équipe, crée un client, un devis, un chantier et teste le suivi du temps.
12. Il peut importer des clients, chantiers, salariés, prestations, stocks, tarifs fournisseurs et écritures comptables.
13. Il utilise les modules autorisés par son offre et ses permissions.
14. Les événements Stripe mettent à jour l’abonnement, la période, le statut et la date de fin d’essai.
15. Le dirigeant peut ouvrir le portail Stripe pour la carte, les factures et la résiliation.
16. Il peut demander de l’aide dans le module d’assistance intégré.
17. À l’issue de l’essai, l’abonnement devient actif ou doit être suspendu selon l’état Stripe.

### Ce que le parcours fait correctement

- création atomique de l’entreprise et du rôle dirigeant ;
- rattachement explicite de chaque utilisateur à une entreprise ;
- cloisonnement multi-entreprise couvert par les tests de base de données ;
- liste de démarrage visible avec progression sur six étapes ;
- recommandation d’offre selon la taille et les besoins ;
- délégation par postes, rôles et permissions ;
- cycle de vie des comptes : actif, suspendu, fermé ;
- portail Stripe prévu pour la facturation ;
- imports structurés pour les principaux référentiels ;
- aide intégrée et support opérateur côté plateforme.

### Cartographie détaillée des 17 étapes

| # | Écran / route | Acteur et action | Dépendances et données créées | Intervention ELSATIA | État |
|---:|---|---|---|---|---|
| 1 | `/signup` | Le prospect crée son compte par e-mail et mot de passe | Supabase Auth, profil utilisateur, configuration des e-mails Auth | Aucune en nominal ; aide si e-mail non reçu | Opérationnel sous réserve de la configuration e-mail de l’environnement |
| 2 | `/onboarding` | Le dirigeant saisit le nom et peut compléter SIRET/adresse | Procédure de bootstrap ; ligne `entreprises` | Aucune en self-service | Opérationnel mais profil légal incomplet autorisé |
| 3 | `/onboarding` | Le système rattache l’utilisateur à l’entreprise | `utilisateurs_entreprises`, entreprise active | Aucune | Opérationnel et atomique |
| 4 | `/onboarding` | Le système crée le rôle dirigeant | Poste `Gérant`, permissions, adhésion active | Aucune | Opérationnel |
| 5 | `/onboarding/besoins` | Le dirigeant répond et choisit offre/périodicité | Grille tarifaire, nombre de salariés, besoins enregistrés | Cadrage commercial pour Sur mesure | Opérationnel avec écarts fonctionnels à clarifier |
| 6 | `/onboarding/besoins`, Stripe Checkout | Le dirigeant enregistre sa carte et démarre l’essai | Variables Stripe, prix, customer, subscription, webhook | Assistance en cas d’échec ; validation Stripe préalable | **Partiel : essai contournable sans date de fin** |
| 7 | Tableau de bord et gardes applicatives | Le système ouvre les modules autorisés | Offre, statut abonnement, fonctionnalité, permission du poste | Paramétrage si besoin | Partiel : IA Production désactivée malgré la grille |
| 8 | `/employes` | L’administrateur crée les fiches et transmet les instructions | Fiche salarié, poste, numéro individuel, adhésion après activation | Invitation actuellement manuelle | Opérationnel mais manuel |
| 9 | `/clients/nouveau` | Un utilisateur autorisé crée le premier client | Permission clients, ligne `clients` | Import possible selon le fichier | Opérationnel dans le test local |
| 10 | `/devis/nouveau` | Un utilisateur autorisé crée le devis et ses lignes | Tables `devis`, `lignes_devis`, catalogue et taxes | Aucune prévue | **Bloqué : privilège absent sur les lignes** |
| 11 | `/chantiers/nouveau` | Un utilisateur autorisé ouvre le chantier | Client, éventuellement devis accepté, ligne `chantiers` | Import possible | Opérationnel dans le test local |
| 12 | `/planning` | Le responsable affecte équipe, chantier et dates | Salariés, chantier, permissions, affectations | Aucune prévue | Opérationnel dans le test local |
| 13 | `/pointage` | Le salarié saisit son temps, puis validation | Profil salarié lié, activation pointage personnel, chantier | Configuration initiale nécessaire | Partiel pour le premier dirigeant |
| 14 | `/notes-de-frais` | Le salarié saisit une dépense et un justificatif | Profil lié, stockage privé, circuit de validation | Aucune prévue | Opérationnel dans le test local |
| 15 | `/factures` | L’administratif établit et suit la facture | Client, lignes, mentions légales, numérotation, droits facturation | Contrôle initial des modèles conseillé | Non validé : dépend notamment du correctif des lignes |
| 16 | Assistant ELSATIA | L’utilisateur autorisé interroge l’assistant | Clé OpenAI, activation globale, quota de l’offre, contexte entreprise | Activation et suivi des quotas | Preview démontrée ; **absent en Production actuelle** |
| 17 | Checkout, webhook, portail et réconciliation | Stripe fait évoluer essai, paiement et abonnement | Customer, subscription, statut, dates de période | Support facturation et traitement Sur mesure | Implémenté, mais non validé de bout en bout |

### Répartition self-service / intervention ELSATIA

| Action | Réalité observée |
|---|---|
| Créer son compte | Self-service |
| Créer son entreprise | Self-service |
| Obtenir le rôle administrateur initial | Automatique au bootstrap |
| Choisir une offre standard | Self-service |
| Démarrer 30 jours avec carte | Self-service prévu via Stripe, non validé de bout en bout |
| Démarrer sans carte | Techniquement possible aujourd’hui, mais sans échéance fiable : anomalie |
| Ajouter des salariés | Création self-service par l’administrateur ; transmission de l’invitation manuelle |
| Offre Sur mesure | Intervention commerciale ELSATIA obligatoire |
| Import hors formats natifs | Analyse et accompagnement ELSATIA nécessaires |
| Incident d’accès, paiement ou sécurité | Intervention support ELSATIA nécessaire |

## 4. Essai de 30 jours

### Fonctionnement constaté

Le Checkout Stripe est configuré pour demander une carte et créer une souscription avec `trial_period_days = 30`. Le texte d’interface annonce clairement une carte enregistrée sans débit pendant l’essai. Le webhook sait enregistrer la date de fin d’essai et les périodes de facturation.

### Anomalie bloquante

La création directe d’une entreprise initialise `abonnement_statut = essai`, mais ne fixe pas `abonnement_essai_fin`. Le contrôle d’accès n’expire l’essai que si une date de fin existe. Un utilisateur peut donc créer son espace, éviter le Checkout et conserver un essai sans échéance technique fiable.

### Règle à obtenir

Un seul modèle doit être retenu et testé :

- soit l’essai commence à la création de l’entreprise, avec une date de fin fixée immédiatement et Stripe ajouté ensuite ;
- soit l’accès métier reste limité tant que la carte n’est pas enregistrée, puis les 30 jours commencent au Checkout.

Le produit et les documents commerciaux doivent employer exactement la même règle.

## 5. Offres et cohérence tarifaire

### Matrice commerciale / application

| Offre | Commercial | Application | Écart |
|---|---|---|---|
| Mini | 69 € HT/mois ; 690 € HT/an ; 3 comptes | 3 comptes, 1 administrateur, 10 Go, 100 opérations IA ; socle dashboard, messagerie, clients, chantiers, devis, factures, planning et accès IA ; Checkout prévu | IA indisponible en Production ; planning aligné sur Mini par TARIFS-V2 |
| Pro | 199 € HT/mois ; 1 990 € HT/an ; 15 comptes | 15 comptes, 3 administrateurs, 50 Go, 500 opérations IA ; socle + terrain + gestion ; Checkout prévu | IA indisponible en Production ; supplément de comptes non configuré en Preview |
| Business | 399 € HT/mois ; 3 990 € HT/an ; 30 comptes | 30 comptes, 6 administrateurs, 150 Go, 1 500 opérations IA ; Pro + pilotage ; Checkout prévu | IA indisponible en Production ; supplément de comptes non configuré en Preview |
| Entreprise | 599 € HT/mois ; 5 990 € HT/an ; 40 salariés + 10 administrateurs inclus | 50 comptes inclus au total, dont 10 administrateurs déclarés, 300 Go, 3 000 opérations IA ; tous les paliers ; Checkout prévu | La séparation 40 + 10 reste textuelle : le tarif et le contrôle d'un dépassement par type exigent une décision humaine avant le premier client ; IA indisponible en Production |
| Sur mesure | Sur devis ; selon contrat | Base technique de 50 comptes, administrateurs à cadrer, 500 Go, 3 000 opérations IA ; tous les paliers ; devis obligatoire | Nécessite vente, contrat et configuration manuels ; aucun Checkout autonome |

Les montants correspondent à TARIFS-V2. Le paiement annuel correspond à douze mois d'utilisation facturés au prix de dix mois, soit deux mois offerts.

### Périmètre fonctionnel

Le code organise les fonctionnalités en paliers : socle, terrain, gestion, pilotage et avancé. L’accès dépend de l’offre et des permissions du poste.

Points à corriger ou clarifier :

- l’IA apparaît dans la valeur des offres, alors que la fonctionnalité est désactivée globalement en Production ;
- certaines formulations de recommandation positionnent le planning à un palier différent de la liste publique des fonctions Mini ;
- les dépassements de comptes sont calculés comme suppléments, mais les prix Stripe complémentaires ne sont pas déclarés dans l’environnement Preview contrôlé ;
- la limite d’administrateurs n’est pas clairement bloquée dans l’interface ;
- l’offre Sur mesure exige un traitement commercial et contractuel distinct.

## 6. Stripe, abonnement et facturation

### Éléments déjà présents

- Checkout pour quatre offres standard ;
- périodicité mensuelle ou annuelle ;
- essai Stripe de 30 jours ;
- conservation des identifiants Stripe côté entreprise ;
- webhook de synchronisation ;
- états essai, actif, suspendu et résilié ;
- portail client pour moyens de paiement, factures et résiliation ;
- fonction serveur de changement d’offre ;
- tâche de réconciliation périodique.

### Éléments non validés de bout en bout

- association exacte de chaque variable de prix à son produit Stripe ;
- livraison et signature du webhook sur un cycle complet ;
- passage réel essai → actif ;
- échec de paiement, authentification forte et reprise ;
- résiliation en fin de période ;
- montée ou baisse d’offre depuis un parcours client visible ;
- génération, envoi et contenu de la facture Stripe ;
- tarification des comptes supplémentaires ;
- option IA payante éventuelle.

### Décision

Un scénario Stripe en mode test doit être exécuté de bout en bout avant tout paiement client : création, carte test, essai, webhook, portail, facture, changement d’offre, échec, reprise et résiliation.

### Passage essai → payant observé

- Le client choisit l’offre et la périodicité dans l’onboarding, puis ouvre Checkout.
- Checkout crée une souscription Stripe avec 30 jours d’essai et enregistre la carte ; le code n’ordonne pas de débit pendant l’essai.
- Si la souscription est créée avant la fin des 30 jours, elle reste en état d’essai jusqu’à l’échéance Stripe ; aucun mécanisme distinct de paiement anticipé n’a été identifié.
- À la fin, Stripe doit tenter le premier paiement. Le webhook convertit ensuite le statut applicatif selon l’état reçu.
- Un échec ou une action de paiement requise conduit actuellement au statut suspendu.
- Sans Checkout, l’entreprise reste aujourd’hui en essai sans date de fin : elle n’est ni convertie ni bloquée correctement.
- L’offre Sur mesure requiert une intervention ELSATIA avant souscription.

### Changement d’offre et résiliation

Le serveur contient une action de changement d’offre et le portail Stripe couvre la gestion de l’abonnement. L’audit n’a toutefois pas identifié un parcours autonome complet et vérifié dans l’écran d’abonnement pour la montée ou la baisse d’offre. Les règles de proratisation, la date d’effet d’un downgrade, la résiliation en fin de période et la réactivation doivent être testées.

C3-B reste prudent : il indique que les modalités exactes, dates d’effet et conditions doivent être confirmées avant activation. Il ne promet donc pas davantage que le code actuel. Les réponses C3-B devront être mises à jour uniquement après validation du comportement réel.

## 7. Paramétrage minimal de l’entreprise

### Champs disponibles

- nom commercial ;
- raison sociale et forme juridique ;
- SIRET ;
- adresse, code postal et ville ;
- logo et habillage des documents ;
- assurances ;
- taux de pénalités ;
- horaires de travail ;
- en-têtes, pieds de page et textes documentaires.

### Informations manquantes ou non imposées

- numéro de TVA intracommunautaire ou régime de TVA ;
- téléphone et e-mail officiels de l’entreprise ;
- coordonnées bancaires et règles d’affichage ;
- conditions de règlement par défaut ;
- logique explicite des séquences de numérotation ;
- contrôle bloquant des mentions légales avant le premier devis ou la première facture.

Le système permet d’atteindre la création de documents alors que le profil légal peut être incomplet. Le premier devis et la première facture doivent être précédés d’une validation guidée des mentions obligatoires applicables au client.

## 8. Équipe, rôles et accès

### Parcours observé

1. L’administrateur crée une fiche salarié avec son e-mail et lui attribue un poste.
2. L’application génère un numéro individuel d’inscription.
3. L’administrateur copie ou partage manuellement les instructions d’inscription.
4. Le salarié crée son compte avec le même e-mail et son numéro individuel.
5. La procédure d’activation rattache le compte Auth à la fiche salarié et à l’entreprise.
6. Les droits proviennent du poste et peuvent être adaptés.

Une autre voie existe avec le code général d’entreprise : la demande reste en attente jusqu’à validation par un administrateur.

### Points de vigilance

- l’invitation n’est pas envoyée automatiquement par e-mail ;
- le dirigeant créé au bootstrap n’est pas automatiquement préparé comme utilisateur de pointage ;
- le test local du premier pointage a donc répondu `Accès refusé` ;
- les plafonds de comptes et d’administrateurs doivent être vérifiés au moment de l’ajout ;
- la suspension et la fermeture conservent l’historique, ce qui est adapté à la traçabilité.

## 9. Import et reprise de données

### Imports disponibles

- clients ;
- chantiers ;
- salariés ;
- catalogue et prestations ;
- stock ;
- tarifs fournisseurs ;
- écritures comptables.

Les formats CSV et tableur sont acceptés avec un assistant d’import.

### Imports non identifiés

- devis historiques ;
- factures historiques ;
- planning ;
- pointages ;
- notes de frais ;
- documents libres et pièces jointes ;
- comptes rendus de chantier.

Le discours commercial doit donc promettre un accompagnement à l’import des données structurées compatibles, après examen des fichiers, et non une migration intégrale automatique.

## 10. Première utilisation des modules

### Résultat du scénario local fictif

| Étape | Résultat | Observation |
|---|---|---|
| Inscription | Réussi | Compte Auth local fictif |
| Création entreprise | Réussi | Rôle dirigeant et adhésion active |
| Création client | Réussi | Cloisonné à l’entreprise de test |
| Création chantier | Réussi | Données fictives |
| Création salarié | Réussi | Fiche et poste créés |
| Planning / affectation | Réussi | Affectation créée |
| Note de frais | Réussi | Enregistrement créé |
| Premier devis | **Échec** | Privilège absent sur `lignes_devis` |
| Première facture | Non testable | Dépend du flux de devis ou de lignes facturées |
| Pointage personnel | **Partiel** | Compte dirigeant non activé pour le pointage |

Toutes les données du scénario ont été supprimées après le contrôle.

## 11. Support et communications

### Disponible

- centre d’aide dans l’application ;
- fil de support avec traitement côté plateforme ;
- e-mail commercial `contact@elsatia.fr` déjà exploité dans les lots précédents ;
- modèles Supabase pour confirmation et récupération de compte.

### À compléter

- canal `support@elsatia.fr` non identifié dans la configuration Preview ;
- absence de délai de réponse ou de procédure d’escalade documentée ;
- invitation salarié manuelle ;
- absence d’e-mails applicatifs identifiés pour bienvenue, démarrage d’essai, fin prochaine d’essai et échec de paiement ;
- guides et vidéos annoncés comme étant en cours de mise à jour ;
- configuration des e-mails Stripe à vérifier dans le tableau de bord Stripe.

### Matrice des e-mails d’onboarding

| Événement | Mécanisme observé | Expéditeur / branding / liens | État |
|---|---|---|---|
| Création de compte / confirmation | Modèle Supabase Auth | Dépend de la configuration Supabase de l’environnement | Présent techniquement, délivrabilité externe non validée dans cet audit |
| Invitation salarié | Texte et lien copiés/partagés par l’administrateur | Pas d’envoi applicatif automatique | Manuel |
| Bienvenue | Aucun message applicatif dédié identifié | Non défini | Absent |
| Essai démarré | Aucun message applicatif dédié identifié | Non défini | Absent |
| Mot de passe oublié | Modèle Supabase Auth | Lien de récupération dépendant du domaine et des URL autorisées | Présent techniquement, à retester sur l’environnement client |
| Fin prochaine d’essai | Aucun message applicatif dédié identifié | Non défini | Absent |
| Paiement / facture | E-mails et documents hébergés Stripe selon configuration du compte | Configuration du tableau de bord Stripe non validée | Partiel / non vérifié |
| Échec de paiement | Statut applicatif traité par webhook ; aucun e-mail applicatif dédié identifié | Notification Stripe éventuelle non vérifiée | Partiel |

## 12. Sécurité, isolation et conservation

Les contrôles locaux couvrent l’isolation multi-entreprise, les rôles, les comportements et le stockage privé. Les tests de base de données ont réussi. Les politiques RLS et les buckets privés sont documentés dans les audits de sécurité existants.

Le cycle de vie des utilisateurs permet de suspendre ou fermer un accès sans supprimer l’historique. Cette approche est adaptée à la conservation des données métier. La suppression définitive, l’export de départ et la durée de conservation doivent toutefois être cadrés dans les procédures juridiques et de support.

## 13. Documents requis avant le premier essai

| Élément | État observé | Caractère bloquant |
|---|---|---|
| Guide de démarrage ELSATIA | Absent en version finalisée ; aide interne présente, certains livrables encore marqués Liria | Documentaire avant pilote autonome |
| Présentation commerciale | Existante dans les livrables C2 | Non bloquant |
| FAQ et objections | Existantes dans C3-B | Non bloquant, à aligner après les correctifs |
| Conditions de l’essai | Dispersées entre interface, code et CGV modèle | Important avant paiement et avant essai autonome |
| Politique de confidentialité | Brouillon juridique à finaliser | Important avant ouverture externe |
| Procédure de support | Aide intégrée présente, procédure et engagements absents | Documentaire |
| CGV / convention | Modèle avec placeholders et anciennes offres | Important avant paiement |
| Politique de données et sortie client | À consolider | Documentaire |

### Kit premier client à constituer

- adresse de connexion officielle ;
- invitation ou consignes de création des comptes ;
- fiche de démarrage dirigeant et fiche salarié ;
- nom et canal du contact ELSATIA ;
- offre, périodicité et prix confirmés ;
- date de début et date de fin d’essai ;
- nombre de comptes, administrateurs et modules activés ;
- liste des données à préparer et formats acceptés ;
- procédure support et incident ;
- rendez-vous de contrôle entre J3 et J5 ;
- point intermédiaire et rendez-vous de décision avant la fin de l’essai.

## 14. Registre priorisé des écarts

### Blocants premier client — 2

| ID | Constat | Risque | Preuve / contrôle attendu |
|---|---|---|---|
| B1 | Le premier devis échoue sur `permission denied for table lignes_devis` | Le client ne peut pas réaliser une opération métier centrale | Corriger les privilèges, tester devis avec lignes, conversion et facture |
| B2 | L’entreprise est créée en essai sans `abonnement_essai_fin` tant que Stripe n’est pas finalisé | Essai illimité ou règle commerciale incohérente | Fixer un déclencheur unique et tester l’expiration à 30 jours |

### Importants avant paiement — 8

| ID | Constat | Action attendue |
|---|---|---|
| I1 | Le cycle Stripe Preview n’a pas été validé de bout en bout | Exécuter la matrice de paiement en mode test |
| I2 | Les variables de prix pour comptes supplémentaires et option IA ne sont pas présentes en Preview | Créer ou désactiver explicitement ces mécanismes avant commercialisation |
| I3 | L’IA est présentée dans les offres alors qu’elle est désactivée en Production | Aligner le produit, l’offre et le discours commercial |
| I4 | Les informations légales nécessaires aux documents ne sont pas complètes ni bloquantes | Ajouter la checklist et les validations avant premier document |
| I5 | Changement d’offre et résiliation ne sont pas validés depuis un parcours client visible | Tester montée, baisse et date d’effet de résiliation |
| I6 | La migration locale `20260812000200` n’apparaît pas appliquée au projet distant lié | Identifier l’environnement, revoir et déployer selon la procédure de mise en production |
| I7 | Les communications d’onboarding, d’essai et d’échec de paiement ne sont pas opérationnelles de bout en bout | Définir les messages, déclencheurs, expéditeurs et tests de réception |
| I8 | Les CGV existantes sont un modèle non validé, avec anciennes offres et mention annuelle incohérente | Faire valider et publier les documents juridiques définitifs |

### Améliorations d’onboarding — 5

| ID | Constat | Amélioration proposée |
|---|---|---|
| A1 | Le dirigeant bootstrap n’est pas préparé au pointage | Ajouter une étape explicite de profil de pointage |
| A2 | La progression existe, mais ne bloque pas les prérequis incomplets | Ajouter des statuts précis et des contrôles avant action sensible |
| A3 | La reprise de données ne couvre pas tous les historiques métier | Formaliser les formats pris en charge et le service manuel associé |
| A4 | Les plafonds de comptes et administrateurs ne sont pas lisiblement imposés | Afficher le quota, prévenir et contrôler avant ajout |
| A5 | Le support dédié n’est pas présenté comme canal stable | Configurer l’adresse support et la rendre visible dans l’aide |

### Lacunes documentaires — 4

| ID | Document manquant ou incomplet | Livrable attendu |
|---|---|---|
| D1 | Pas de guide rapide ELSATIA à jour ; certains guides restent marqués Liria | Guide de démarrage ELSATIA dirigeant et salarié |
| D2 | Pas de kit formalisé de lancement du premier client | E-mail de bienvenue, agenda, prérequis et contacts |
| D3 | Pas de procédure de support et d’escalade | Canaux, horaires, gravités, délais cibles et incidents sécurité |
| D4 | Pas de fiche de cadrage de migration | Données acceptées, responsabilités, contrôles et limites |

## 15. Durée d’onboarding estimée

L’application ne contient pas de mesure fiable permettant d’annoncer une durée chiffrée. Il serait imprudent de promettre un délai standard avant un premier pilote.

Trois niveaux de complexité peuvent néanmoins guider la préparation :

- **simple** : petite équipe, création manuelle, peu de données, un administrateur ;
- **standard** : plusieurs postes, imports de clients/chantiers/salariés, configuration documentaire ;
- **accompagné** : historique volumineux, règles d’accès détaillées, plusieurs administrateurs, besoins d’import hors formats natifs.

Les durées commerciales devront être mesurées sur un onboarding pilote et non inventées avant celui-ci.

### Onboarding minimum viable recommandé

1. confirmer l’offre, le nombre de comptes et les objectifs de l’essai ;
2. créer le compte du dirigeant et l’entreprise ;
3. verrouiller la date de fin des 30 jours ;
4. compléter uniquement les paramètres légaux nécessaires aux documents ;
5. créer les postes et un petit groupe pilote ;
6. créer ou importer les clients utiles au pilote ;
7. créer un chantier actif et son planning ;
8. valider un parcours devis/facture sur données de test ;
9. valider pointage et note de frais avec un salarié pilote ;
10. activer ensuite les modules complémentaires pertinents.

L’objectif n’est pas de configurer tous les modules le premier jour, mais de rendre un parcours métier complet fiable avant d’élargir.

## 16. Plan de correction proposé

### Lot C6-B — rendre le cœur du parcours utilisable

1. corriger les privilèges de création des lignes de devis et de facture ;
2. ajouter un test de base de données reproduisant le premier devis d’un dirigeant ;
3. fixer la règle de départ et de fin de l’essai de 30 jours ;
4. tester expiration, blocage et reprise après abonnement ;
5. compléter le profil pointage du premier administrateur ou guider sa configuration.

Critère de sortie : le scénario fictif complet crée client, devis, facture, chantier, planning, pointage et note de frais.

### Lot C6-C — valider abonnement et paiement

1. vérifier les produits et prix Stripe Preview sans exposer leurs identifiants ;
2. compléter ou neutraliser les prix de comptes supplémentaires et d’IA ;
3. tester Checkout, webhook, portail, facture, échec, reprise et résiliation ;
4. valider montée et baisse d’offre ;
5. aligner strictement les offres visibles et les fonctions Production.

Critère de sortie : matrice Stripe en mode test entièrement réussie et documentée.

### Lot C6-D — sécuriser la mise en service client

1. compléter les paramètres légaux et documentaires ;
2. appliquer les migrations après revue et procédure de déploiement ;
3. créer les e-mails d’onboarding et d’alerte ;
4. configurer le support dédié ;
5. produire les guides ELSATIA et le kit de migration ;
6. faire valider les CGV, mentions légales et politique de confidentialité définitives.

Critère de sortie : checklist premier client entièrement au vert, avec preuves datées.

## 17. Décision de lancement

Le produit peut continuer à être démontré sur des données fictives. Il ne faut pas encore :

- ouvrir un essai autonome à une entreprise réelle ;
- accepter un paiement réel ;
- promettre l’IA en Production ;
- émettre un premier document commercial client sans contrôle légal ;
- annoncer une migration complète ou une durée d’onboarding garantie.

La reprise doit commencer par C6-B. Aucun lot commercial suivant ne doit contourner les deux blocants identifiés.
