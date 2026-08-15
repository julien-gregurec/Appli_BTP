# C4 — Démonstration commerciale ELSATIA

## 1. Objectif et fil conducteur

Cette démonstration est conçue pour un rendez-vous BTP de 10 à 15 minutes. Elle ne cherche pas à parcourir tous les modules. Elle raconte une journée de travail et montre comment une même information circule du bureau au chantier.

> **ELSATIA réunit dans un seul environnement les informations aujourd’hui dispersées entre logiciels, fichiers, messages et documents.**

Environnement obligatoire : Preview de démonstration, entreprise fictive **Atelier Bâtiment Lyonnais — DEMO-18M**. Ne jamais utiliser Production.

Fil rouge opérationnel :

- client principal : **Groupe Montchat Immobilier** ;
- chantier principal : **Rénovation du siège — Lyon Part-Dieu** ;
- état : **En cours** ;
- budget : **48 500 €**.

Pour illustrer une chaîne commerciale complète et cohérente, utiliser le client fictif **Emilie Petit**, le devis accepté **DEV-DEMO-202607-097** et la facture payée **FAC-DEMO-202607-097**, tous deux à **4 260 € TTC**. Le chantier principal reste le fil rouge opérationnel ; ses devis visibles sont refusés et ne doivent pas servir à raconter une facturation acceptée.

## 2. Préparation de la session

1. Ouvrir la Preview contrôlée et se connecter au compte DEMO-18M.
2. Vérifier que l’en-tête affiche **Atelier Bâtiment Lyonnais**.
3. Fermer les autres onglets, couper les notifications et régler le zoom à 100 %.
4. Ouvrir le tableau de bord et vérifier la présence du chantier principal.
5. Préparer le planning à la semaine du 10 au 16 août 2026 ; la journée montrée sera le **mardi 11 août 2026**.
6. Vérifier l’assistant avec la question principale, puis rouvrir un panneau vide pour le rendez-vous.
7. Ouvrir localement le PowerPoint/PDF C2-C et les 11 captures C2-B pour le plan B.
8. Ne jamais afficher l’URL technique, Vercel, Supabase, les outils de développement, des secrets ou des données réelles.

### Écrans et chemins répétables

| Séquence | Écran / module | Chemin stable | Sélection / action |
|---|---|---|---|
| Départ | Tableau de bord | `/dashboard` | Montrer la vue d’ensemble sans dérouler toutes les alertes |
| Commercial | Clients | `/clients` | Rechercher **Emilie Petit**, ouvrir le devis puis la facture associés |
| Chantier | Chantiers | `/chantiers` | Rechercher et ouvrir **Rénovation du siège — Lyon Part-Dieu** |
| Comptes rendus | Chantier | Navigation depuis la fiche chantier | Ouvrir **Comptes-rendus** et montrer les deux articles C2 |
| Notes de frais | Équipe & temps | `/notes-frais` | Montrer la liste et l’affectation au chantier, sans créer ni valider |
| Pointage | Support visuel C2-B | Capture `06-pointage-mobile.png` | Expliquer l’usage salarié ; ne pas utiliser le compte présentateur pour pointer |
| Planning | Équipe & temps | `/planning?semaine=2026-08-10` | Montrer le mardi 11 août, 39 h et 5 salariés |
| Rentabilité | Pilotage | `/rentabilite` | Montrer les indicateurs globaux et la lecture par chantier |
| IA | Assistant flottant | Depuis `/dashboard` | Poser la question principale et lire une partie de la réponse |
| Droits | Paramètres | `/parametres/acces` | Faire défiler directement jusqu’à **Rôles prédéfinis BTP** et **Comptes et postes** |

Les fiches individuelles contiennent des identifiants techniques volatils : toujours y accéder par la navigation et la recherche, jamais par un favori contenant un UUID.

## 3. Scénario principal chronométré — 12 minutes

| Temps cumulé | Séquence | Durée |
|---:|---|---:|
| 00:40 | Introduction | 0:40 |
| 02:00 | Tableau de bord | 1:20 |
| 03:35 | Client → devis → facture | 1:35 |
| 05:35 | Chantier principal et comptes rendus | 2:00 |
| 07:00 | Terrain / smartphone | 1:25 |
| 08:10 | Planning bureau ↔ chantier | 1:10 |
| 09:10 | Rentabilité | 1:00 |
| 10:35 | Assistant IA | 1:25 |
| 11:15 | Accès et permissions | 0:40 |
| 12:00 | Conclusion | 0:45 |

La marge jusqu’à 15 minutes sert aux questions du prospect, pas à ajouter des modules.

## 4. Script oral détaillé

### 4.1 Introduction — 40 secondes

**À montrer**

Le tableau de bord déjà ouvert, avec le nom de l’entreprise fictive visible.

**À dire**

« Je vais partir d’une journée classique d’une entreprise du BTP et vous montrer comment l’information circule du bureau au chantier dans ELSATIA. L’objectif n’est pas de passer en revue tous les boutons : c’est de voir comment clients, documents, chantier, équipes et pilotage restent reliés dans un même environnement. »

**Question éventuelle**

« Aujourd’hui, combien d’outils utilisez-vous entre le devis et le compte rendu de chantier ? »

**Transition**

« Commençons par ce que voit le dirigeant en ouvrant sa journée. »

### 4.2 Tableau de bord — 1 minute 20

**À montrer**

- l’entreprise active ;
- les indicateurs clés ;
- l’activité récente ;
- les devis, factures ou chantiers à suivre ;
- les raccourcis vers les modules.

**À dire**

« Le tableau de bord rassemble les informations utiles à la journée : présence, chantiers, activité commerciale et encaissements. Le dirigeant voit où porter son attention sans rechercher l’information dans plusieurs fichiers ou messages. Chaque indicateur renvoie ensuite vers son dossier d’origine. »

**À ne pas détailler**

Ne pas lire toutes les alertes, les 18 modules ni tous les chiffres. Choisir deux signaux maximum.

**Question éventuelle**

« Quelles informations devez-vous aujourd’hui demander à votre équipe avant de pouvoir décider ? »

**Transition**

« Prenons maintenant une information commerciale et suivons-la sans rupture. »

### 4.3 Client → devis → facture — 1 minute 35

**À montrer**

Dans Clients, rechercher **Emilie Petit**. Montrer brièvement sa situation financière, ouvrir **DEV-DEMO-202607-097** puis la facture associée **FAC-DEMO-202607-097**. Faire remarquer le même client, le même chantier et le même montant de 4 260 € TTC.

**À dire**

« Ici je retrouve le client, ses documents et sa situation sans repartir dans plusieurs logiciels. Le devis accepté reste relié à la facture et au chantier. L’équipe administrative garde donc le contexte du dossier, du premier document jusqu’au règlement. »

**Question éventuelle**

« Vos devis et vos factures sont-ils aujourd’hui reliés au suivi du chantier ? »

**Transition**

« Passons maintenant de la relation commerciale à l’exécution sur le terrain. »

### 4.4 Chantier principal et comptes rendus — 2 minutes

**À montrer**

Revenir à Chantiers et ouvrir **Rénovation du siège — Lyon Part-Dieu**. Montrer : état En cours, client Groupe Montchat Immobilier, budget 48 500 €, équipe, heures planifiées/validées et dépenses. Ouvrir ensuite Comptes-rendus et montrer les deux entrées :

- **[C2] Réunion de chantier — avancement semaine** ;
- **[C2] Point livraison et réserves**.

Montrer l’accès aux documents sans ouvrir une série de fichiers.

**À dire**

« Le chantier devient le point central des informations opérationnelles. On y retrouve le client, l’état, le budget, l’équipe, les heures, les dépenses, les documents et les comptes rendus. Le bureau et le terrain travaillent donc sur le même dossier. Ici, les deux comptes rendus conservent l’avancement, les livraisons et les réserves dans le contexte du chantier. »

**À ne pas dire**

Ne pas laisser entendre que ce chantier possède un devis accepté ou une facture : les documents commerciaux visibles sur ce dossier sont refusés. Ne pas présenter la dictée comme disponible dans tous les navigateurs.

**Question éventuelle**

« Où sont stockés vos comptes rendus et photos aujourd’hui ? »

**Transition**

« Regardons maintenant ce que l’équipe peut consulter ou remonter depuis un smartphone. »

### 4.5 Terrain / smartphone — 1 minute 25

**À montrer**

Basculer sur la vue mobile du planning et des notes de frais. Pour le pointage, utiliser la capture C2-B `06-pointage-mobile.png`. La capture `07-note-frais-mobile.png` sert de secours et montre un justificatif marqué **DÉMONSTRATION — AUCUNE VALEUR COMPTABLE**.

**À dire**

« Ce n’est pas une application séparée : c’est le même environnement adapté au téléphone. Le salarié consulte son planning, pointe depuis son espace et transmet une note de frais avec son justificatif. Le bureau récupère ensuite l’information au même endroit pour la contrôler, sans ressaisie. »

**Précaution de répétition**

Le compte présentateur Preview n’est pas rattaché à une fiche salarié active et ne permet pas une démonstration de pointage crédible. Ne jamais créer un pointage pour contourner cette limite pendant un rendez-vous ; utiliser la capture mobile validée.

**Question éventuelle**

« Aujourd’hui, comment vos équipes remontent-elles leurs heures et leurs justificatifs ? »

**Transition**

« La valeur est surtout visible quand on compare la même information au bureau et sur le terrain. »

### 4.6 Planning bureau ↔ chantier — 1 minute 10

**À montrer**

Ouvrir la semaine du 10 au 16 août 2026 puis le **mardi 11 août**. Montrer 39 heures planifiées et cinq salariés : Hugo Petit, Lea Durand, Nathan Robert, Ines Simon et Louis Laurent. Basculer brièvement en vue mobile : les mêmes cinq activités et affectations doivent apparaître.

**À dire**

« Ici, le bureau prépare la journée du mardi 11 août. Sur le téléphone, l’équipe retrouve exactement les mêmes cinq affectations. L’information est saisie une fois et devient disponible partout : c’est ce qui limite les doubles saisies et les versions contradictoires du planning. »

**Question éventuelle**

« Votre planning est-il réellement partagé avec le terrain, ou envoyé sous forme de photo ou de message ? »

**Transition**

« Une fois les informations commerciales et terrain centralisées, elles peuvent aussi alimenter le pilotage. »

### 4.7 Rentabilité — 1 minute

**À montrer**

La vue `/rentabilite` : chiffre d’affaires HT, coût de main-d’œuvre, notes de frais, marge, taux et détail par chantier. Expliquer que la vue s’appuie sur les informations enregistrées et validées.

**À dire**

« Cette vue rapproche le facturé, les heures valorisées et les coûts affectés pour donner une lecture opérationnelle de la rentabilité. Elle aide le dirigeant à repérer les dossiers à examiner. Elle ne remplace ni la comptabilité ni le cabinet comptable : sa qualité dépend des informations saisies et validées dans l’outil. »

**Question éventuelle**

« Comment suivez-vous aujourd’hui la rentabilité d’un chantier en cours ? »

**Transition**

« L’IA peut ensuite accélérer la recherche dans ces informations, sans remplacer la décision humaine. »

### 4.8 Assistant IA — 1 minute 25

**Avant la question**

« L’assistant n’est pas là pour faire de l’IA pour de l’IA. Il sert à retrouver plus vite une information autorisée dans l’environnement de travail. »

**Action**

Ouvrir l’assistant et poser exactement : **« Quels devis sont en attente depuis plus de 7 jours ? »**

**À montrer dans la réponse**

La liste authentique des devis DEMO identifiés avec numéro, client, montant et date. Lire seulement deux exemples, puis résumer le reste.

**À dire**

« La réponse s’appuie ici sur les données de cette entreprise fictive et sur le périmètre autorisé au compte connecté. L’utilisateur vérifie le résultat et garde la maîtrise : une action sensible, comme envoyer un message ou modifier une donnée, ne doit pas être déclenchée sans validation. »

**Questions de secours validées par les fonctions disponibles**

1. « Quelles factures envoyées ou en retard restent impayées ? »
2. « Quels chantiers actifs ont dépassé leur date de fin prévue ? »

Ne pas poser plusieurs questions si la première a répondu correctement.

**Transition**

« Et comme tout le monde n’a pas besoin de voir ou de modifier les mêmes informations, terminons par les droits. »

### 4.9 Accès et permissions — 40 secondes

**À montrer**

Dans `/parametres/acces`, faire défiler immédiatement après la section Code d’entreprise. Cadrer uniquement **Rôles prédéfinis BTP**, **Comptes et postes** et, si utile, l’aperçu par poste.

**À dire**

« Les comptes sont individuels. Les rôles permettent de distinguer ce qu’un ouvrier, un chef de chantier, un conducteur de travaux, un comptable ou un administrateur peut consulter et gérer. Tout le monde ne voit donc pas tout, et les droits restent adaptables à l’organisation. »

**Interdiction**

Ne jamais montrer, lire, copier ni partager le code d’entreprise ou le code d’adhésion.

**Transition**

« C’est cette continuité, avec des droits adaptés, qui permet de travailler dans un environnement commun. »

### 4.10 Conclusion — 45 secondes

**À dire**

« Nous sommes partis du tableau de bord, puis nous avons suivi une information du client au document commercial, du chantier au téléphone, jusqu’au planning et au pilotage. L’intérêt d’ELSATIA n’est pas d’ajouter un outil de plus : c’est de réunir ce qui est aujourd’hui dispersé et de l’adapter à vos rôles. La prochaine étape peut être un échange plus approfondi sur votre organisation, le choix de l’offre adaptée ou un essai de 30 jours avec vos cas d’usage prioritaires. Quel serait, chez vous, le premier flux à simplifier ? »

## 5. Questions de découverte intégrées

En utiliser deux ou trois selon la conversation, jamais toutes mécaniquement :

1. Combien d’outils utilisez-vous entre le devis et le compte rendu de chantier ?
2. Quelles informations devez-vous demander à votre équipe avant de décider ?
3. Vos devis et factures sont-ils reliés au suivi du chantier ?
4. Comment vos équipes remontent-elles leurs heures et justificatifs ?
5. Votre planning est-il réellement partagé avec le terrain ?
6. Comment suivez-vous la rentabilité d’un chantier en cours ?

## 6. Variantes par profil

### Variante A — artisan / petite entreprise — 10 minutes

- Introduction et dashboard : 1 min 30.
- Client → devis → facture : 2 min.
- Chantier : 1 min 30.
- Planning et mobile : 2 min.
- IA : 1 min.
- Offre adaptée et essai 30 jours : 2 min.

Mettre l’accent sur la simplicité, la continuité administrative, les devis/factures et le planning. Réduire la rentabilité et les droits à une phrase. Ne promettre aucun gain chiffré.

### Variante B — PME structurée — 12 à 15 minutes

Utiliser le scénario principal. Consacrer la marge de temps aux équipes, aux chantiers multiples, à la rentabilité et aux droits. Demander comment sont réparties les responsabilités entre administration, conducteurs de travaux et terrain.

### Variante C — dirigeant de 30 à 50 salariés — 15 minutes maximum

- Dashboard et visibilité : 2 min.
- Chantier et délégation : 2 min.
- Planning, pointages et frais : 3 min.
- Rentabilité : 2 min.
- Rôles et permissions : 2 min.
- IA : 1 min 30.
- Conclusion : 1 min 30.

Réduire la séquence devis/facture à la preuve de continuité. Mettre l’accent sur le contrôle, la délégation, les comptes individuels et la séparation consulter/gérer.

## 7. Gestion des interruptions et objections pendant la démo

- **Question liée au fil** : répondre en moins d’une minute, montrer l’écran utile, puis dire : « Je reviens maintenant à notre chantier principal pour terminer le parcours. »
- **Question qui anticipe une séquence** : « Je vous montre juste après ce point, et je reviens ensuite à notre chantier principal. »
- **Fonction hors périmètre** : ne pas improviser. « Je préfère vérifier précisément ce point plutôt que vous promettre une fonction. Je vous confirme la réponse après le rendez-vous. »
- **Prix demandé immédiatement** : donner le principe des offres et proposer d’identifier d’abord le nombre de comptes et les besoins ; ne pas inventer de remise. Revenir ensuite au scénario.
- **Connexion lente ou vue indisponible** : attendre quelques secondes une seule fois, puis basculer vers la capture correspondante.
- **IA lente ou indisponible** : montrer `08-assistant-ia.png`, préciser qu’il s’agit de la réponse authentique obtenue sur DEMO-18M et poursuivre sans relancer plusieurs fois.
- **Interruption longue** : résumer en une phrase le dernier bénéfice démontré avant de reprendre.

## 8. Plan B sans application en direct

Ouvrir `output/c2c-presentation/ELSATIA-Presentation-commerciale.pptx` ou sa version PDF. Les captures C2-B permettent de conserver le même récit :

| Étape | Capture de secours |
|---|---|
| Vue d’ensemble | `01-dashboard-desktop.png` |
| Mobile d’ensemble | `02-dashboard-mobile.png` |
| Rentabilité | `03-rentabilite.png` |
| Chantier principal | `04-chantier.png` |
| Comptes rendus | `05-comptes-rendus.png` |
| Pointage mobile | `06-pointage-mobile.png` |
| Note de frais et justificatif fictif | `07-note-frais-mobile.png` |
| Réponse IA authentique | `08-assistant-ia.png` |
| Planning bureau | `09-planning-desktop.png` |
| Planning mobile | `10-planning-mobile.png` |
| Rôles et permissions sans code | `11-acces-permissions.png` |

Règle : ne pas s’excuser longuement. Dire « Je poursuis sur la version préparée pour garder le fil de notre échange », puis continuer le même script.

## 9. Ce qu’il ne faut pas montrer

- Production ou une entreprise réelle ;
- Vercel, Supabase, variables d’environnement, DevTools, terminal ou logs ;
- URL contenant des identifiants techniques présentée comme un chemin à mémoriser ;
- code d’entreprise, code d’adhésion, token, clé, mot de passe ou adresse réelle ;
- écran d’onboarding « première connexion » ;
- formulaire de création ou bouton de validation pendant le rendez-vous ;
- pointage en direct avec le compte présentateur non rattaché à un salarié ;
- les devis refusés du chantier principal comme s’ils étaient acceptés ;
- dictée de compte rendu si le navigateur l’indique indisponible ;
- données incomplètes, écrans en travaux ou fonctions non finalisées ;
- longue liste de modules, réglages techniques ou administration sans intérêt pour le prospect ;
- promesse de remplacement du cabinet comptable, ROI, gain chiffré, certification ou fonction non démontrée.

## 10. Résultat de la répétition réelle du 15 août 2026

- environnement : projet Vercel **elsatia-preview**, déploiement Preview Ready ;
- entreprise : **Atelier Bâtiment Lyonnais — DEMO-18M** ;
- Production : non utilisée ;
- parcours vérifié : dashboard, clients, devis, facture, chantier, comptes rendus, planning desktop/mobile, pointage, notes de frais, rentabilité, IA et accès ;
- durée du script oral chronométré par séquences : **12 minutes** ;
- écrans/modules parcourus : **12** ;
- planning : mardi 11 août 2026, 39 h, cinq salariés, données desktop/mobile cohérentes ;
- IA : réponse authentique obtenue à la question principale, listant uniquement des devis DEMO en attente ;
- limites intégrées au script : pointage présenté par capture validée ; ne pas utiliser le chantier principal pour illustrer un devis accepté ; masquer la section Code d’entreprise ; ne pas utiliser la dictée dans un navigateur non compatible.

## 11. Validation avant chaque rendez-vous

Utiliser la checklist courte : `docs/commercial/C4_CHECKLIST_DEMO_ELSATIA.md`.
