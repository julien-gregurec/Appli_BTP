# ELSATIA-GP-MOBILE-AUTHENTICATED-PILOT-CLOSURE-V1 — Rapport final

## 1. Identification
| | |
|---|---|
| Branche | `feat/gp-mobile-authenticated-pilot-closure-v1` |
| SHA source | `97e5d5e` |
| SHA du code recetté | `d8b6a6b` — correctifs `03b79d4` (déconnexion, documents) et `d8b6a6b` (Emporter visible, justificatif sur iPhone, vidange unique) |
| Build en service pour la recette finale | reconstruit sur `d8b6a6b`, Supabase servi en HTTPS par la terminaison de recette |
| SHA final poussé | commit de ce rapport, posé sur le code `4e4fc2f` (branche poussée sans force) |
| Base métier Train V3 | `52d3282` |
| Ledger | 278 fichiers — inchangé ; aucune migration créée, modifiée ou numérotée ; `verify:migrations` 0 |

## 2. Verdict
**GO SOUS CONDITIONS — pilote terrain ENCADRÉ, en commençant par Android.**

| Critère du GO | État |
|---|---|
| Six parcours verts sur moteurs mobiles | **Atteint en substance** : chaque parcours vert sur Android et iPhone dans au moins une passe mesurée ; les échecs restants sont des délais de navigation ou de connexion sous saturation, relus un à un, aucun n'est une assertion |
| R3 fermé | **Chromium : oui. iPhone : non démontrable sur ce banc** (artefact WebKit mesuré, 9.3) → condition C1 |
| R4 fermé | **Chromium et Firefox : oui** (passe 6b). WebKit : non vert sur ce banc → condition C1 |
| Isolation démontrée | **Oui** (section 6) |
| Build et tests complets verts sur SHA figé | **Statique vert** (typecheck, lint, builds GP et tools, migrations, secrets, applications) ; vitest GP 1 858/1 859 (un test ExcelJS hors délai sous charge, vert seul, fichier jamais touché) ; **E2E non entièrement verte** à cause de la saturation du poste → conditions C2, C3 |
| Branche poussée | Oui |
| Aucune dépendance Production cachée | Oui — ni Production, ni déploiement, ni Stripe, ni migration |

**Conditions**, dans l'ordre :

- **C1 — Recette terrain sur un VRAI iPhone** (Preview HTTPS, section 10) : note hors ligne avec photo (gestes 7-8), purge à la déconnexion (11), Emporter puis retrait (9-10). Jusque-là, pilote sur Android.
- **C2 — Recette E2E ciblée de `4e4fc2f`** (retrait Emporter, verrou de vidange qui attend) dans une fenêtre sans saturation : ces deux correctifs ne sont couverts que par leurs tests unitaires (101/101).
- **C3 — Poste de recette libéré** : trois `supabase_analytics` d'autres travaux consomment ~3,4 cœurs en continu ; GoTrue y perd sa base (504) une connexion sur huit.
- **C4 — Décision produit** : accès de l'expert-comptable à `/notes-frais` (écart restrictif, correctif prêt, section 9.2).
- **C5 — Audit** du garde de gestion du proxy face aux Server Actions (réserve 9.2-9).

**Ce qui est prouvé de bout en bout sur le code recetté** : parcours des six rôles à trois largeurs ; pointage hors ligne, redémarrage, rejeu sans doublon, refus sous une autre identité ; note et justificatif hors ligne sur Chromium (photo, PDF, limites, session expirée) ; « Emporter » : boutons visibles, téléchargement réel 92 et 70 octets sur les deux moteurs, relecture hors réseau sur iPhone ; document réservé en 404 sous RLS ; purge réelle à la déconnexion sur Chromium et Firefox avec une connexion tenue ouverte dans un second onglet ; déconnexion effective côté serveur.

**Quinze défauts réels ont été trouvés et corrigés** (section 4), dont trois introduits par ce lot et corrigés dans ce lot. Aucun n'a été masqué par un délai allongé ou une relance.

## 3. Réserves du lot précédent
| Réserve | État | Preuve |
|---|---|---|
| R1 — six parcours jamais vus sur téléphone | **Fermée** (délais résiduels sous saturation, classés) | `pilote-mobile-parcours.spec.ts` (écrans à 375/390/430, paysage, cibles ≥ 44 px, champs ≥ 16 px, aucun débordement, retour, refus lisible, session expirée) + `pointage-offline` — Android et iPhone, section 5 |
| R3 — note hors ligne sans justificatif | **Fermée sur Chromium** ; iPhone non démontrable sur banc → C1 | `pilote-mobile-justificatifs.spec.ts` : photo, PDF, coupure pendant le dépôt, réponse perdue, trop lourd, faux type, redémarrage, session expirée, autre identité — vérifié en base (un document par fichier) |
| R4 — purge inopérante sur Firefox | **Fermée sur Firefox et Chromium** ; WebKit → C1 | `@purge` : base tenue ouverte dans un second onglet, déconnexion par le vrai bouton, bases vides, second onglet sur /login — Chromium, WebKit, Firefox |
| Écrans « Emporter » | **Livrés et prouvés** (visibles, téléchargement réel, relecture hors réseau, 404 sous RLS) ; retrait corrigé, E2E → C2 | `@emporter` : aucun téléchargement sans geste, taille annoncée, PDF et image consultables sans réseau, retrait, document réservé ni proposé ni servi (404) |
| Qualification de la suite | **Statique verte** ; E2E non entièrement verte (saturation) → C2, C3 | Phase J sur arbre figé `e3614b1`, section 8 |

## 4. Défauts trouvés et corrigés

Chacun a été trouvé par la recette réelle ou en sondant ses résultats, jamais par lecture seule.

### 4.1 Défauts produits

| # | Défaut | Origine | Conséquence terrain | Correction |
|---|---|---|---|---|
| 1 | **La file hors ligne n'était alimentée par rien** : contrat, base locale, synchronisation, route de rejeu et écran d'état livrés, mais aucun écran ne déposait de mutation | Lot précédent | Pointage impossible sans réseau malgré un rapport qui l'annonçait « livré » | Pointage relié à la file ; chemin en ligne inchangé (heure posée par le serveur, non falsifiable) |
| 2 | **L'application se rechargeait seule au premier lancement** : `controllerchange` se déclenche aussi à la première activation du service worker (`clients.claim()`) | Lot précédent | Écran qui saute pendant qu'on le touche | Rechargement conditionné à un geste explicite |
| 3 | **« Pointage heures » enfermé dans un accordéon replié** « Équipe & temps » | Existant | Quatre gestes pour pointer, d'une main | Groupes ouverts sous huit entrées de menu |
| 4 | **File bloquée à jamais après une expiration de session** : le proxy redirige la requête vers /login, `fetch` reçoit du HTML en 200, l'analyse JSON lève après le passage en `en_cours` — état que rien ne reprenait | Lot précédent | Pointages et notes jamais transmis, sans signal | Détection de perte de session (401, redirection, succès non-JSON) ; retour en file |
| 5 | **File bloquée à jamais après fermeture de l'application pendant un envoi** — même état `en_cours` orphelin | Lot précédent | Idem, sur un geste banal | Envois interrompus rendus à la file à chaque vidange (sûr : serveur idempotent) |
| 6 | **Justificatif marqué déposé puis effacé sur une réponse HTML redirigée** si la session expire entre contrôle de présence et dépôt | Latent, R3 | Perte silencieuse de la pièce comptable — le cas que R3 interdit | Un dépôt ne compte que sur JSON non redirigé disant `success: true` |
| 7 | **La déconnexion coupait la purge IndexedDB** : purge lancée dans `onSubmit`, formulaire parti aussitôt, redirection interrompant la suppression | Introduit par ce lot, corrigé dans ce lot | Données de l'utilisateur précédent restant sur l'appareil | L'envoi est retenu jusqu'à la fin effective de la purge |
| 8 | **La déconnexion était annulée par sa propre purge** : un `BroadcastChannel` n'ignore que l'instance émettrice ; l'écouteur du MÊME onglet recevait l'ordre, partait vers /login avant `logoutAction`, et le proxy renvoyait la session encore valide vers /dashboard | Introduit par ce lot (correction du #7), trouvé par la recette v2 | **L'utilisateur croit s'être déconnecté et reste connecté** sur un téléphone partagé | Message signé de l'onglet émetteur ; les autres onglets ne sont prévenus qu'à l'arrivée sur /login, session fermée ; recette : le second onglet doit finir sur /login |
| 9 | **Impossible de se déconnecter depuis une page consultée en lecture seule** : une Server Action est postée à l'adresse de la page courante ; le proxy refuse toute écriture sans droit de gestion (303 `?lecture=seule`). Depuis `/chantiers/…/documents`, `logoutAction` (identifiée dans le manifeste des actions) était interceptée — trace : 303 vers `?lecture=seule`, console « An unexpected response was received from the server », écran d'erreur | Existant (garde du proxy), rendu critique par ce lot qui met le salarié sur les pages chantier | **Session toujours ouverte** alors que l'utilisateur a demandé à sortir, sur téléphone partagé | Route dédiée `POST /auth/deconnexion` (chemin public, hors garde), comportement identique à `logoutAction` (compte dépôt, connexion e-mail désactivée), origine étrangère refusée ; 5 tests unitaires |
| 10 | **Documents fermés au salarié** : `/api/documents` exigeait `acces_chantiers` sans l'alternative `voir_chantiers_assignes` accordée à `/chantiers`. Trace : `GET /api/documents/<id>` → 307 `/dashboard?acces=refuse` | Existant, révélé par « Emporter » | Liste visible, mais « Télécharger » et « Emporter » impossibles pour le salarié de terrain — la cible même des écrans Emporter | Accès alternatif aligné sur `/chantiers` ; la route lit sous RLS, le document réservé aux gestionnaires doit rester en 404 (exigé par la recette) |
| 11 | **Boutons « Emporter », « Consulter », « Retirer » invisibles pour le salarié** : la règle du mode lecture seule (`mobile.css`, déplacée par le lot 1) masque tout `button[type="button"]` de la zone principale ; `display: none` mesuré sur Chromium et WebKit | Lot 1 (règle) × lot 2 (écrans Emporter) | Les écrans Emporter, livrés pour le salarié, lui étaient inutilisables — le texte s'affichait, pas les boutons | Zone `data-consultation` qui garde ses boutons : ces gestes n'agissent que sur l'appareil |
| 12 | **Stockage des fichiers en octets bruts** — requalifié : le refus d'un `Blob` dans IndexedDB avait été mesuré sous émulation hors ligne, qui empêche WebKit de lire tout fichier (voir 9.3) ; la cause n'est donc PAS établie | Lot 2 | — | Conservé comme mesure de robustesse (`ArrayBuffer`, `Blob` antérieur toujours lu) ; prouvé par « Emporter » sur WebKit (92 et 70 octets relus hors réseau) |
| 13 | **Deux vidanges simultanées déposaient deux fois le justificatif** : la reprise des envois interrompus (correctif 5) remettait en file l'envoi EN COURS d'une autre vidange (page rechargée, second onglet) | Introduit par ce lot (correctif 5) | Doublon de pièce comptable | Une vidange par identité sous verrou Web Locks ; l'autre s'efface ; 4 tests unitaires |
| 14 | **« Retirer de l'appareil » affichait encore « Disponible hors ligne »** : l'état posé par le téléchargement primait sur la copie locale, bien retirée | Lot 2 | L'utilisateur croit garder un plan hors ligne qu'il n'a plus | État effacé au retrait |
| 15 | **Le verrou de vidange (correctif 13) pouvait laisser une note « en attente »** : la première version passait son chemin si le verrou était pris ; au retour du réseau, rien n'était envoyé jusqu'au déclencheur suivant | Introduit par le correctif 13, corrigé aussitôt | Envoi retardé sans signal | La vidange attend son tour : jamais deux à la fois, aucune ne se perd ; tests unitaires réécrits (exécution l'une après l'autre, aucune ne s'efface) |

### 4.2 Défauts du décor de recette Train V3

Constatés en rendant la recette possible, non corrigés dans le décor partagé (qui appartient au Train V3) — contournés par des comptes ajoutés, strictement additifs :

- **aucun compte n'a `pointage_personnel_actif = true`** : le formulaire de pointage n'avait jamais été exercé par aucune recette ;
- **aucun salarié rattaché à un chantier pointable** : l'Ouvrier A l'est à un chantier au statut `facture` ;
- le poste « Comptable A » porte `gerer_factures` (modification de facture) et aucune permission de notes de frais : il ne correspond pas à l'expert-comptable du cahier des charges.

Un défaut de MON décor, corrigé : les trois comptes ajoutés manquaient d'`entreprise_active_id` et tombaient sur l'onboarding. Le test du « témoin sans habilitation » passait alors **pour une mauvaise raison** — il vérifiait que la page n'était pas vide, et une page d'onboarding ne l'est pas.

### 4.3 Obstacles de méthode, levés sans rien affaiblir

| Obstacle | Ce qui aurait été facile | Ce qui a été fait |
|---|---|---|
| `/login` limité à 10 tentatives / 10 min / IP | Assouplir la limite | Une session par rôle, réutilisée — comme un vrai téléphone ; compteur remis à zéro **dans la base de recette** seulement |
| WebKit refuse les cookies `Secure` sur http (Chromium les accepte sur 127.0.0.1) | Rendre le cookie non sécurisé | Terminaison TLS locale : la recette est servie en HTTPS, comme la Production |
| GoTrue injoignable ~13 s au réveil de Docker (`dial tcp …:5432: i/o timeout`) | Allonger les délais | Barrière : trois connexions consécutives sous 3 s avant toute suite |
| Saturation du poste (charge 12–24, jusqu'à 67 conteneurs d'autres travaux) | Monter les délais globaux | Barrière de charge avant chaque suite, une suite et un worker à la fois ; charge journalisée avec chaque résultat |
| `pgrep -f 'next build'` se reconnaissant lui-même dans les boucles d'attente | — | Attente sur un marqueur de sortie |
| Sessions de recette partagées entre moteurs, alors que deux recettes passent par le vrai bouton de déconnexion — qui révoque TOUTES les sessions du compte | Retirer ces deux recettes, ou simuler la déconnexion | Sessions préparées avant chaque moteur : la vraie déconnexion reste testée |
| Deux corrections de ma part défaites : `networkidle` (a triplé les échecs), `domcontentloaded` (a rendu la main trop tôt à WebKit) | — | Signaux bornés et attente de la destination réelle |

### 4.4 Deux constats hors du périmètre mobile, établis par la recette

**Le proxy présente une panne comme un refus d'accès.**
`src/lib/supabase/proxy.ts` appelle `contexte_acces_proxy` et **ignore l'erreur** :
`const { data: acces } = await supabase.rpc(...)`, puis `ctx = (acces ?? {})`. Si la RPC
expire, `droit_acces` est indéfini et l'utilisateur est redirigé vers `/dashboard?acces=refuse`.

Preuve : PostgREST `57014 canceling statement due to statement timeout` (18:37:50), GoTrue en
504 et connexions base perdues entre 18:37 et 18:42 — aux instants exacts où un salarié
autorisé a été renvoyé de `/notes-frais`, et où l'expert-comptable l'a été de `/factures`
lors de la première passe. Rejouée à pile saine, la même navigation passe.

**Ce comportement est sûr** — refuser par défaut, jamais ouvrir. Il n'est donc pas modifié en
ouverture. Mais un salarié de terrain lirait « accès refusé » pendant un simple ralentissement
réseau ou base. Correctif recommandé, hors de ce lot : distinguer l'erreur de la RPC et servir
une page « service momentanément indisponible », en restant fermé.

**La saturation du poste de recette a une cause identifiée.**
Trois conteneurs `supabase_analytics` d'**autres** piles — `elsatia-reserves-v4-dbtest`,
`btp-platform`, `elsatia-capacity-r2-dbtest` — consomment environ **3,7 cœurs en continu**
(143 %, 133 %, 97 %) sur une machine de 10 cœurs, avec 61 conteneurs actifs et ~70 Mo de RAM
libre. La pile de recette de ce lot n'a pas de conteneur d'analyse et reste sous 2 %. Ces
conteneurs appartiennent à d'autres travaux : ils n'ont pas été arrêtés. Arrêter les
`supabase_analytics` inutilisés rendrait les recettes futures nettement plus stables.

## 5. Résultats par navigateur et largeur

`SHA_TESTE=d8b6a6bc1245dee8bfc756e2c59fe67f0dbcaa1b PROPRE=oui`  
`PREPARATION PARTIELLE (pilote-iphone) — sessions absentes : expertComptableA  ; les suites sont lancees, les tests de ces comptes echoueront en le disant`  
`PREPARATION PARTIELLE (pilote-firefox) — sessions absentes : sansDroitA ouvrierB  ; les suites sont lancees, les tests de ces comptes echoueront en le disant`  

| Moteur | Suite | Réussis | Échoués | Autres | Charge | Durée |
|---|---|---:|---:|---:|---:|---:|
| pilote-android | preparation | 8 | 0 | 0 | 15.87 | 120 s |
| pilote-android | parcours | 15 | 2 | 0 | 13.50 | 457 s |
| pilote-android | pointage-offline | 4 | 1 | 0 | 13.72 | 309 s |
| pilote-android | justificatifs | 4 | 5 | 0 | 12.76 | 618 s |
| pilote-android | emporter-purge | 3 | 2 | 0 | 15.61 | 338 s |
| pilote-android | expert-comptable | 7 | 2 | 0 | 14.67 | 170 s |
| pilote-iphone | preparation | 7 | 1 | 0 | 13.48 | 400 s |
| pilote-iphone | parcours | 12 | 5 | 0 | 14.98 | 620 s |
| pilote-iphone | pointage-offline | 3 | 2 | 0 | 15.60 | 113 s |
| pilote-iphone | justificatifs | 1 | 8 | 0 | 14.41 | 308 s |
| pilote-iphone | emporter-purge | 2 | 3 | 0 | 13.91 | 337 s |
| pilote-iphone | expert-comptable | 0 | 9 | 0 | 14.87 | 149 s |
| pilote-firefox | preparation | 6 | 2 | 0 | 12.71 | 399 s |
| pilote-firefox | purge | 1 | 0 | 0 | 13.37 | 542 s |

Passe complète la plus récente sur le code produit `d8b6a6b` (le seul commit suivant, `4e4fc2f`, porte deux correctifs couverts par tests unitaires → C2). « Échoués » mêle les délais de navigation et de connexion sous saturation, les sessions absentes (GoTrue 504) et l'écart expert-comptable attendu ; les défauts réels révélés par ces passes sont ceux de la section 4, tous corrigés. Porte de fumée Emporter sur `d8b6a6b` : verte sur les deux moteurs (9.3).

## 6. Isolation utilisateur et entreprise

Chaque garantie est prouvée par une recette qui tente de la violer, pas par lecture du code.

| Garantie | Preuve | Moteurs |
|---|---|---|
| Aucune donnée de l'entreprise B chez un administrateur de A | `parcours` : aucun marqueur `RECETTE_B_` sur les écrans de A | Android, iPhone |
| Aucune mutation rejouée sous une autre identité | `pointage-offline` : une saisie de A présentée sous la session de B est refusée, motif « autre compte » | Android, iPhone |
| Aucune vérification de justificatif d'un autre compte | `justificatifs` : `justificatif-present` pour une note de A demandé par B → **403** | Android, iPhone |
| Changer d'utilisateur ne laisse rien | `parcours` : ni clé ni base de A chez B, hormis l'identifiant d'APPAREIL (une ligne distincte par utilisateur côté serveur) | Android, iPhone |
| La déconnexion efface réellement les bases | `purge` : bases vides après déconnexion, **même avec une connexion ouverte dans un second onglet**, qui finit lui aussi sur /login | Android, iPhone, **Firefox** |
| Un document réservé n'est ni proposé ni servi | `emporter` : plan « gestionnaires » absent de la liste, `/api/documents/<id>` → **404** | Android, iPhone |
| Aucune donnée métier dans les caches du service worker | `expert-comptable` : inventaire des caches après navigation | Android, iPhone |
| Changement d'entreprise : les bases de l'autre entreprise partent | Tests unitaires `registre-bases` + `GardienDonneesLocales` monté dans le shell | **Unitaire seulement** — voir réserve 9.2 |

La déconnexion est effective IMMÉDIATEMENT côté serveur : le proxy valide chaque requête par
`auth.getUser()` (`src/lib/supabase/proxy.ts:110`), donc auprès de GoTrue, et `signOut`
révoque toutes les sessions du compte. Un jeton copié avant la déconnexion ne sert plus.

Les noms de base portent l'identité (`elsatia:gp:<entreprise>:<utilisateur>`) : une base d'une
autre entreprise n'est jamais LUE par erreur ; la purge garantit en plus qu'elle ne RESTE pas.

## 7. Expert-comptable — non-régression

Ce lot ne construit pas le portail expert-comptable. Il vérifie que le mobile et le hors-ligne
ne contournent aucune de ses limites. Compte de recette dédié, poste portant EXACTEMENT les
permissions du cahier des charges : `acces_factures`, `acces_achats`,
`acces_paiements_bancaires`, `acces_exports`, `comptabiliser_notes_frais`,
`exporter_notes_frais`, `consulter_audit_notes_frais` — ni plus, ni moins.

Le poste « Comptable A » du décor Train V3 n'a pas servi : il porte `gerer_factures`
(modification de facture) et ne correspond pas à l'expert-comptable défini.

| Contrôle | Attendu | Résultat |
|---|---|---|
| Écrans comptables autorisés (factures, dépenses, exports) | Accessibles | Vert — Android (passe 6b) ; iPhone : `/factures` refusé en passe 5 sous délai base (refus par défaut du proxy, 4.4) |
| Notes de frais et justificatifs de l'entreprise mandatée | Accessibles | **Refusé — écart, réserve 9.2-1** (test ROUGE à dessein) |
| Administration, accès, Stripe, chantiers, planning, messagerie, stock, outillage, flotte | Refusés | Vert — Android (passes v2 et 4) ; délai de navigation en 6b |
| Facture définitive (`envoyee`) : modification et suppression, à l'écran **et par l'API** | Impossibles ; statut inchangé | Vert — Android (6b) et iPhone (5) |
| Données de l'entreprise B | Aucune | Vert — Android (6b) et iPhone (5) |
| Tables opérationnelles par PostgREST | Aucune ligne | Vert — Android (6b) et iPhone (5) |
| File hors ligne | Aucun droit nouveau au rejeu | Vert — Android (6b) et iPhone (5) |
| Caches du service worker | Aucune donnée métier | Vert — Android (6b) ; délai de navigation sur iPhone (5) |
| Révocation (compte désactivé) | Accès coupé à la navigation suivante ; compte rétabli en fin de test | Vert — Android (6b) et iPhone (5) ; compte vérifié `actif` après coup |

**Lecture de l'écart.** Il est RESTRICTIF : l'expert-comptable se voit refuser un écran qui
lui revient ; il n'obtient jamais ce qui ne lui revient pas. La recette ne l'a pas masqué en
assouplissant le test, et ne l'a pas corrigé en élargissant un garde d'accès sans décision
produit : modifier qui accède à des pièces justificatives de salariés relève d'un arbitrage.

## 8. Tests complets (phase J, arbre figé)

**Contrôles sur le SHA final `a43763d`** (après les correctifs 9 et 10) : `git diff --check`,
eslint des fichiers modifiés, typecheck GP complet, tests ciblés 17/17 (route de déconnexion,
permissions, proxy), vitest GP 1 854/1 855 (seul `xlsx.test.ts`, cf. ci-dessous), build GP vert
(compilé en 4,5 min), `verify:migrations` 0, `verify:secrets` 0, ledger **278** fichiers — inchangé.
Les applications (tools, reserves, colors) ne sont pas touchées depuis `e3614b1` : leurs mesures
restent valides.

**Couverture des SHA antérieurs.** Volet statique complet (diff-check, migrations, secrets, ledger,
vitest, typecheck, lint, builds) sur `e3614b1`. Le seul commit suivant, `8e02eb2`, ne modifie que
deux recettes E2E : il a été vérifié par `git diff --check`, eslint sur les fichiers modifiés et
le typecheck GP complet avant commit ; la recette E2E complète tourne sur `8e02eb2`.

**Applications (après clone des dépendances, verrous identiques) :** tools 108/108 tests (20 fichiers),
reserves 154/154 (12), colors 264/264 (27) ; typecheck et lint verts pour les trois ; build de
tools réussi (36 pages). Première passe sans dépendances : suites non chargées, AUCUN test
exécuté — non comptée comme mesure.

`SHA_FIGE=e3614b19074989abddeb895ac91d386a0a05b522`  
`ARBRE_FIGE_OK e3614b19074989abddeb895ac91d386a0a05b522`  
`clone apps/tools/node_modules : 382 entrees`  
`clone apps/reserves/node_modules : 345 entrees`  
`clone apps/colors/node_modules : 306 entrees`  
`SHA=e3614b19074989abddeb895ac91d386a0a05b522`  
`ARBRE_FIGE_OK e3614b19074989abddeb895ac91d386a0a05b522`  

| Étape | Code | Charge | Durée | Source |
|---|---:|---:|---:|---|
| diff-check | 0 | 12.10 | 0 s | `phase-j` |
| verify-migrations | 0 | 12.10 | 1 s | `phase-j` |
| verify-secrets | 0 | 12.10 | 2 s | `phase-j` |
| ledger | 0 | 12.33 | 0 s | `phase-j` |
| vitest-gp | 1 | 12.33 | 18 s | `phase-j` |
| test-tools | 1 | 15.06 | 3 s | `phase-j` |
| test-reserves | 1 | 15.30 | 1 s | `phase-j` |
| test-colors | 1 | 15.30 | 2 s | `phase-j` |
| typecheck-gp | 0 | 15.30 | 46 s | `phase-j` |
| typecheck-tools | 2 | 15.87 | 10 s | `phase-j` |
| typecheck-reserves | 2 | 15.93 | 7 s | `phase-j` |
| typecheck-colors | 2 | 16.42 | 3 s | `phase-j` |
| lint-gp | 0 | 16.14 | 47 s | `phase-j` |
| lint-tools | 0 | 15.91 | 21 s | `phase-j` |
| lint-reserves | 0 | 15.10 | 9 s | `phase-j` |
| lint-colors | 0 | 14.41 | 5 s | `phase-j` |
| build-gp | 0 | 14.30 | 411 s | `phase-j` |
| build-tools | 1 | 14.51 | 56 s | `phase-j` |
| test-tools | 0 | 19.21 | 32 s | `phase-j-apps` |
| test-reserves | 0 | 16.44 | 45 s | `phase-j-apps` |
| test-colors | 0 | 16.23 | 50 s | `phase-j-apps` |
| typecheck-tools | 0 | 15.01 | 47 s | `phase-j-apps` |
| typecheck-reserves | 0 | 14.33 | 57 s | `phase-j-apps` |
| typecheck-colors | 0 | 14.84 | 49 s | `phase-j-apps` |
| lint-tools | 0 | 14.21 | 114 s | `phase-j-apps` |
| lint-reserves | 0 | 14.76 | 95 s | `phase-j-apps` |
| lint-colors | 0 | 14.41 | 99 s | `phase-j-apps` |
| build-tools | 0 | 16.19 | 284 s | `phase-j-apps` |
| xlsx-seul | 0 | 16.52 | 16 s | `phase-j-apps` |
| vitest-gp-2 | 1 | 16.67 | 33 s | `phase-j-apps` |


**Tests unitaires GP — deux passes sur le même SHA figé, sous charge 12 à 17 :**

| Passe | Charge | Résultat | Échecs |
|---|---:|---|---|
| 1 | 12,3 | 1 848 / 1 849 | `xlsx.test.ts` : 6,5 s pour un budget de 5 s |
| 2 | 16,7 | 1 846 / 1 849 | `xlsx.test.ts` (8,5 s) ; `stripe/boutique/webhook/route.test.ts` : un test à 11 s, puis le suivant voit le mock `finaliser` appelé — contagion : le gestionnaire du test interrompu s'achève pendant le suivant |
| `xlsx` seul | 16,5 | 2 / 2 | — (4,3 s) |
| 3 (SHA `a43763d`) | 20,3 | 1 854 / 1 855 | `xlsx.test.ts` seul — 6 tests de plus : ceux de la route de déconnexion et des permissions |
| 4 (SHA `d8b6a6b`, final) | 18,8 | 1 858 / 1 859 | `xlsx.test.ts` seul — 4 tests de plus : le verrou de vidange (Web Locks) |

Les deux fichiers sont **inchangés depuis la base Train V3 `52d3282`** — ni ce lot ni le précédent ne
les touchent. Aucun délai n'a été modifié, aucune relance « jusqu'au vert » n'a été faite.
**Mesure sans contention : non obtenue.** La charge du poste n'est jamais descendue sous 12 de la nuit. Le fichier en cause n'est pas touché depuis la base Train V3 et passe seul ; il est à rejouer sur un poste libéré (C3).

## 9. Réserves restantes

### 9.1 Bloquantes pour un déploiement élargi, pas pour le pilote encadré
Aucune — sous réserve du tableau de la section 5.

### 9.2 À lever avant l'ouverture générale

| # | Réserve | Pourquoi elle reste | Levée proposée |
|---|---|---|---|
| 1 | **Expert-comptable exclu de `/notes-frais`** | L'ACCÈS à la route est décidé par `MODULE_PERMISSION_PAR_CHEMIN` (`saisir_ses_notes_frais`) et `PERMISSIONS_ACCES_ALTERNATIVES` n'a pas d'entrée `/notes-frais` — contrairement à `/grands-deplacements` ; le couple `gerer_notes_frais` / `saisir_ses_notes_frais` ne régit que les MUTATIONS. Le poste d'expert-comptable porte `comptabiliser_notes_frais`, `exporter_notes_frais`, `consulter_audit_notes_frais` : aucune n'ouvre la route (`src/lib/module-permissions.ts`). Écart au cahier des charges, **dans le sens restrictif** (refus, jamais fuite) | Entrée `"/notes-frais"` dans `PERMISSIONS_ACCES_ALTERNATIVES` admettant aussi les trois permissions comptables — accès en LECTURE seulement, mutations inchangées — puis vérifier que la page n'expose que ce que la RLS leur ouvre. Décision produit, non prise dans ce lot ; test laissé ROUGE à dessein |
| 2 | Purge au changement d'entreprise non mesurée de bout en bout | Le décor n'a aucun compte rattaché à deux entreprises | Ajouter un tel compte au décor et une recette dédiée |
| 3 | Le proxy présente une panne base comme un refus d'accès | `contexte_acces_proxy` en erreur → `acces=refuse`. Sûr (fermé), trompeur | Page « service momentanément indisponible », en restant fermé (4.4) |
| 4 | Firefox mesuré en moteur de bureau émulé à 390 px | Playwright n'émule pas Firefox mobile | Contrôle sur Firefox Android pendant la recette terrain |
| 5 | WebKit de Playwright n'est pas Safari iOS | Même moteur, pas le même navigateur ni la même PWA installée | Procédure terrain (section 10) sur un iPhone réel |
| 6 | Capacitor préparé, non publiable | `server.url` et cookies de session non sécurisés pour un magasin d'applications | Lot dédié ; le pilote reste en PWA |
| 7 | Origine hors ligne du pointage non tracée en base | Nécessite une colonne : `supabase/proposed/pointage-origine-hors-ligne.sql.proposed` (lot précédent, non numéroté) | Au prochain train de migrations |
| 8 | Phase L — références et sélection multiple dans les devis | Migration nécessaire (section 13) | **Prochain lot obligatoire** |
| 9 | **Le garde de gestion du proxy intercepte TOUTE Server Action postée depuis une page en lecture seule**, pas seulement la déconnexion — dont l'action de présence (`enregistrerPresenceApplicationAction`), qui part seule à chaque page | Une action est identifiée par son identifiant, pas par le chemin : le garde par chemin ne protège rien qu'une action ne puisse contourner en postant ailleurs, et il bloque des actions légitimes | Exempter les requêtes `Next-Action` du garde par chemin APRÈS audit : chaque action doit vérifier ses permissions elle-même. Hors de ce lot (changement de posture de sécurité) ; la déconnexion, seule critique pour le pilote, est corrigée (défaut 9) |

### 9.3 Environnement de recette
- **R3 sur iPhone : NON démontrable sur ce banc — artefact mesuré.** Sous l'émulation hors ligne
  de Playwright, WebKit ne lit AUCUN fichier, même choisi en ligne ; Chromium les lit tous :

  | Moteur | Choisi en ligne, lu en ligne | lu hors ligne | Choisi hors ligne, lu hors ligne | lu au retour du réseau |
  |---|---:|---:|---:|---:|
  | WebKit | 134 o | `NotReadableError` | `NotReadableError` | 134 o |
  | Chromium | 134 o | 134 o | 134 o | 134 o |

  Sur un vrai iPhone en mode avion, lire la photo prise est une lecture locale. La note hors
  ligne avec justificatif doit donc être prouvée **en recette terrain sur iPhone** (gestes 7-8
  de la section 10) — c'est une condition du verdict, pas une formalité. Sur Chromium, R3 est
  prouvé (photo, PDF, trop lourd, faux type, redémarrage, session expirée, refus à B).
- **Passe 6b sur `d8b6a6b` (03:12 → 04:57), premières preuves de bout en bout :** purge R4
  VERTE sur Chromium ET Firefox (connexion tenue ouverte dans un second onglet, déconnexion par
  la nouvelle route depuis la page documents, second onglet renvoyé sur /login) ; « Emporter »
  VERT sur iPhone (PDF et image emportés, relus hors réseau : 92 et 70 octets) ; document
  réservé en 404 sous RLS sur les deux moteurs. Échecs restants : délais de navigation et de
  connexion sous saturation, sessions absentes (GoTrue 504), l'écart expert-comptable attendu,
  et deux défauts réels (14, 15) corrigés ensuite.
- **Porte de fumée Emporter sur le SHA final `d8b6a6b` (03:05) : VERTE sur les deux moteurs.**
  Boutons affichés (`flex`, et non plus `display: none`), téléchargement RÉEL de 92 et 70
  octets sur Chromium ET WebKit, à travers le Storage servi en HTTPS. Premiers
  téléchargements « Emporter » réussis de tout le lot : les défauts 10 et 11 sont levés de
  bout en bout.
- **Préparation de la passe 6 perdue sur une connexion sur huit** (conducteurA, 03:08) :
  GoTrue, sur ces minutes, 16 réponses 504 et 2 réponses 500 « Database error querying
  schema » sur `/token` — la requête l'atteignait (le relais TLS n'est pas en cause), GoTrue
  perdait sa base. Sur six préparations, quatre ont échoué ainsi. Le harnais ne lie plus
  toutes les suites à tous les comptes : les sessions absentes sont consignées, les suites
  tournent, et seuls les tests du compte manquant échouent — en le disant. Aucune connexion
  n'est relancée.
- **Téléchargement en 503 sur ce poste, et pas en Production** : la route refuse — à juste
  titre — toute URL signée non HTTPS (`urlExterneAutorisee`), et le Storage local servait en
  http. Le téléchargement « Emporter » n'avait donc JAMAIS pu être prouvé sur ce poste, dans
  aucune passe. Correction d'environnement seulement : Supabase servi en HTTPS par la
  terminaison de recette (port 60421), comme en Production ; certificat auto-signé accepté par
  le seul processus Next local de recette. Aucune ligne de code produit n'a été assouplie.
- **Recette « Emporter » corrigée, parce qu'elle prenait un refus pour un succès et inversement.**
  Le contrôle du document réservé suivait les redirections : le « 200 » mesuré était celui de
  la page `/dashboard?acces=refuse`, pas le document. Aucune fuite (trace : 307, aucun octet du
  plan servi) ; le test exige désormais le 404 rendu par la route, sans suivre de redirection.
  Les boutons « Emporter » étaient bien dans le DOM (instantanés de trace) : l'échec venait du
  défaut 10, et d'un `isVisible()` qui n'attend pas.
- **Troisième tentative annulée : le poste s'est endormi.** Journal d'alimentation : mise en
  veille à 22:36:32 (« Low Power Sleep », **sur batterie à 1 %**), sortie d'hibernation à
  23:59:38 sur secteur. Un test y a duré 1,4 h pour un plafond de 45 s. Tout ce qui a couru
  après 22:36 est nul ; avant, Android tournait à charge 15. Tentative arrêtée et conservée.
- **Fenêtre « configuration de l'accueil » sur le bouton de pointage : pas un défaut terrain.**
  `DashboardWidgetFirstConnection` n'est rendu que sur `/dashboard` et `/parametres` (présent
  dès la base `52d3282`). Le test n'était donc pas sur `/pointage` : le proxy l'avait renvoyé
  au tableau de bord sous saturation (4.4), où le widget « Pointage rapide » porte le même
  bouton. La recette vérifie désormais l'adresse avant de cliquer.
  Conséquence de la purge, voulue : la clé `elsatia-dashboard-widgets-configured-v1` est
  effacée à la déconnexion ; la configuration d'accueil est donc reproposée au compte suivant
  sur un téléphone partagé — c'est lui, pas le précédent, qui choisit son accueil.
- **Registre des bases** : sa clé survit par construction à la déconnexion (Firefox en a
  besoin pour purger). La recette « changer d'utilisateur » vérifiait son NOM ; elle vérifie
  maintenant son CONTENU — aucune base de A ne doit y figurer chez B —, preuve plus stricte et
  seule valable sur Firefox.
- **Première tentative E2E interrompue à la préparation (21:57)** : 7 connexions sur 8 réussies
  (1,3 à 23 s), `sansDroitA` renvoyé sur « Une erreur est survenue ». GoTrue, au même instant :
  `/token` en 504 (`context deadline exceeded`), « Database error querying schema », échec
  d'authentification SASL vers la base et erreur de résolution DNS Docker du conteneur base.
  Le harnais a refusé de lancer une suite sur des sessions incomplètes. Pile redevenue saine
  (auth 0,62 s, rest 0,17 s) : recette relancée en entier sur le même SHA, tentative conservée
  (`/tmp/phase-j-e2e-tentative1`).
- **Deuxième tentative interrompue de même (22:00)** : 7 sur 8, cette fois `ouvrierA` — le compte
  en échec CHANGE, ce n'est donc pas un compte. GoTrue `/token` sur six minutes : trois 504 et
  trois 500 « Database error querying schema », **aucun 429** — la limite de connexions (30 par
  5 min) n'est pas en cause. Mesure Docker à 22:03 : `supabase_analytics` de
  `elsatia-reserves-v4-dbtest` 124 %, `elsatia-capacity-r2-dbtest` 113 %, `btp-platform` 73 %,
  `supabase_pg_meta_btp-platform` 30 % — environ 3,4 cœurs pour des piles d'autres travaux, 61
  conteneurs actifs ; la pile de ce lot entière sous 7 %. Réponse retenue : aucune relance de
  connexion (ce serait un retry artificiel) mais une **fenêtre de préparation** — charge
  instantanée sous 14 et barrière de pile franchie avant chaque préparation.
- Premier démarrage du serveur de recette : 232 s pour la toute première réponse, pendant le clone APFS des dépendances des applications sur le même disque externe ; ensuite 8 à 10 ms (20 ms via TLS). Démarrage à froid sous contention disque, propre au poste — la E2E n'a commencé qu'une fois le serveur chaud et la barrière de disponibilité franchie.
- Poste saturé en continu par d'autres piles (4.4) : chaque échec a été relu et classé ; seuls
  ceux reproduits à pile saine sont comptés comme défauts.
- Les `node_modules` des applications n'avaient jamais été installés dans ce worktree ; ils
  ont été clonés (APFS) depuis un worktree aux verrous de dépendances identiques avant de
  mesurer leurs suites. Aucun fichier suivi n'est concerné.

## 10. Procédure de recette terrain

À conduire avec un salarié réel, sur **son** téléphone, avant toute ouverture élargie.

**Préalables.** Un environnement de Preview en HTTPS (jamais la Production), un compte
salarié dont l'administrateur a activé le **pointage personnel** et qui est **affecté à un
chantier en cours** — ce sont les deux conditions qui manquaient au décor Train V3 et sans
lesquelles le formulaire ne s'affiche pas.

| # | Geste | Attendu |
|---|---|---|
| 1 | Installer la PWA (Android : invite ; iPhone : Partager → Sur l'écran d'accueil) | Icône présente, écran de lancement sans rectangle blanc |
| 2 | Se connecter, ouvrir le menu | « Pointage heures », « Notes de frais », « Chantiers » visibles **sans déplier de groupe** |
| 3 | En ligne, pointer l'arrivée | Arrivée enregistrée à l'heure du **serveur** |
| 4 | Passer en mode avion, pointer le départ | Bandeau « conservé sur l'appareil » ; saisie visible dans la file |
| 5 | Fermer complètement l'application, la rouvrir, toujours hors réseau | La saisie est toujours là |
| 6 | Réactiver le réseau, ouvrir l'application | Saisie « Envoyé » ; une seule session côté serveur |
| 7 | Hors réseau : note de frais + photo d'un vrai ticket | « Note et justificatif conservés… partiront ensemble » |
| 8 | Réseau revenu | Note **et** photo côté serveur ; jamais la note seule marquée transmise |
| 9 | Sur un chantier : « Emporter » un plan PDF | Taille annoncée avant ; « Disponible hors ligne · synchronisé le … » |
| 10 | Mode avion, consulter le plan | Il s'ouvre |
| 11 | Se déconnecter, se connecter sous un autre salarié | Aucune donnée du premier visible, aucune base locale restante |

Tout écart se consigne avec l'heure, le modèle du téléphone et la version du navigateur.

## 11. Procédure de retour arrière

Le lot est **entièrement réversible** : il n'ajoute aucune migration et ne modifie aucune
donnée de Production.

1. **Code** — la branche `feat/gp-mobile-authenticated-pilot-closure-v1` n'est fusionnée nulle
   part. Revenir en arrière consiste à ne pas la déployer, ou à redéployer le SHA précédent.
2. **Appareils des pilotes** — le schéma local est passé en version 3 (magasins
   `justificatifs` et `documents_emportes`). Un retour à un code en version 1 ou 2 ne peut PAS
   ouvrir une base plus récente : IndexedDB refuse la descente de version. La procédure est
   donc de **faire se déconnecter chaque pilote** avant le retour arrière — la purge supprime
   les bases. À défaut, effacer les données du site dans le navigateur.
3. **Avant de demander la déconnexion**, vérifier que la file de chaque pilote est vide
   (écran « saisies en attente ») : une saisie non transmise serait perdue avec la base.
4. **Base de recette** — le décor ajouté est identifiable (préfixes `40000000…`, libellés
   « (recette mobile) », note `RECETTE_MOBILE`) et n'existe que dans la pile de recette
   locale. Aucune action n'est nécessaire hors de ce poste.

## 12. Confirmations
Aucune Production, aucun déploiement, aucun Stripe (ni Live ni Test), aucune migration appliquée ni numérotée, aucun numéro de ledger réservé, aucun secret versé, aucune fusion, aucun force-push, aucun processus d'une autre conversation arrêté.

## 13. Phase L — référence interne et sélection multiple d'articles dans les devis

Exigence ajoutée en cours de lot. Traitée en phase distincte, commit identifiable `b0df9a7`.

### 13.1 Ce qui existe (audit du schéma réel, ledger 278)

| Élément | État |
|---|---|
| Catalogue utilisé par les devis | `prestations_catalogue` : désignation, description, type, unité, prix de vente HT, TVA, `actif` ; unique par (entreprise, désignation). **Aucune référence, ni fabricant, ni fournisseur.** |
| Catalogue du stock | `articles_stock` : `reference` **unique par entreprise** et requise à l'import, `code_barres` unique par entreprise, `marque`, prix d'achat et de vente, `actif`. **Jamais utilisé par les devis.** |
| Référence fabricant | seulement sur `fiches_techniques_articles` (`fabricant`, `reference_fabricant`), rattachée à un article de stock |
| Éditeur de devis | liste déroulante `prestation-catalogue`, **un article à la fois**, quantité 1 |
| Lignes de devis | aucune origine, **aucun instantané de référence** |
| Prix d'achat | protégé par la permission existante `voir_prix_stock` |
| Recherche tolérante | `pg_trgm` 1.6 et `unaccent` 1.1 installés, inutilisés ici |

### 13.2 Ce qui manque

Deux références distinctes sur les catalogues ; la recherche classée ; la sélection multiple ;
la décision explicite sur un article déjà présent ; l'avertissement sur un article archivé ;
l'instantané sur les lignes ; les colonnes d'import et d'export avec leur rapport (référence
absente, doublon, existant, créé, refusé).

### 13.3 Migration : **oui, nécessaire** — livrée en proposition, non appliquée

`supabase/proposed/devis-references-articles-selection-multiple.sql.proposed` — hors
`supabase/migrations`, **sans numéro**, ledger inchangé (278 fichiers, dernier n° 280).
Aucune migration existante modifiée. Contenu : colonnes distinctes sur les deux catalogues,
fonction de normalisation `IMMUTABLE` indexable, index par entreprise (jamais globaux), index
trigrammes, fonction de détection des doublons (signalés, jamais interdits ni fusionnés),
recherche `SECURITY INVOKER` (mêmes RLS que l'écran, prix d'achat seulement avec
`voir_prix_stock`), colonnes d'instantané sur `lignes_devis` sans clé étrangère.

**Deux arbitrages métier** sont consignés en tête du fichier et bloquent son application :
(A) chercher dans les deux catalogues sans les unifier — proposé — ou les unifier ;
(B) initialiser ou non `reference_interne` depuis l'actuelle `articles_stock.reference`
(ligne fournie, désactivée).

### 13.4 Ce qui est livré sans migration

`src/lib/devis/recherche-articles.ts` — module pur, 31 tests :

| # | Test exigé | Couvert |
|---|---|---|
| 1 | recherche par référence interne exacte | oui |
| 2 | recherche par référence fabricant exacte | oui |
| 3 | plusieurs articles de même référence | oui — tous montrés, doublon signalé, jamais fusionné |
| 4 | priorité du classement | oui — six niveaux, dont interne exacte avant fabricant exacte |
| 5 | casse, espaces, tirets, points, accents | oui — l'original reste affiché |
| 6 | isolation entre deux entreprises | oui en défense en profondeur ; la garantie réelle est la RLS (SQL proposé) |
| 7 | sélection multiple | oui — une ligne par article, en une action |
| 8 | quantités différentes | oui — et quantité nulle ou négative refusée |
| 9 | article déjà présent | oui — rien sans décision : additionner, nouvelle ligne ou annuler |
| 10 | article archivé | oui — refusé sans confirmation explicite, classé après l'actif |
| 11 | droits sur le prix d'achat | oui côté module ; la base le masque (SQL proposé) |
| 12 | mobile | **non** — attend l'écran, donc la migration |
| 13 | clavier | **non** — idem |
| 14 | persistance de l'instantané | oui — les deux références figées, distinctes |
| 15 | modification du catalogue non rétroactive | oui |

### 13.5 Effet sur le verdict pilote : **aucun**

Le pilote terrain porte sur le pointage, les notes de frais, les chantiers et les documents —
pas sur la préparation des devis. La phase L n'entre dans aucun des critères du verdict.

### 13.6 Prochain lot obligatoire

Arbitrer A et B → appliquer la migration (numéro attribué à ce moment, après audit du
ledger) → écran de sélection multiple (recherche, quantités, désélection, ajout groupé,
clavier sur ordinateur, mobile) → import/export à deux colonnes avec rapport → tests 12 et 13
en recette réelle. Estimation : **3 h à 5 h** après arbitrage.

## Addendum — condition C4 (lot ELSATIA-GP-EXPERT-COMPTABLE-NOTES-FRAIS-CLOSURE-V1)

Décision du 2026-09-11 : l'expert-comptable consulte, télécharge, contrôle, comptabilise et
exporte les notes de frais et leurs justificatifs, et consulte les journaux ; il ne modifie
jamais la dépense, ne supprime ni ne remplace un justificatif, ne modifie pas une facture
définitive, n'administre rien et ne voit aucune autre entreprise. Accès gratuit.

Lot `feat/gp-expert-comptable-notes-frais-closure-v1` (départ `bb17c17`) — rapport complet :
`docs/mobile/ELSATIA_GP_EXPERT_COMPTABLE_NOTES_FRAIS_REPORT.md`.

**État de C4 : AVANCÉE, NON LEVÉE.**

- Livré : ouverture de `/notes-frais` et `/api/notes-frais` au circuit comptable, contrôle et
  comptabilisation autorisés au proxy, droits comptables configurables à l'écran ; toutes les
  permissions et tous les refus éprouvés en base sous l'identité réelle de l'expert-comptable.
- Manquant : la recette authentifiée Android et iPhone (deux tentatives sans mesure, saturation
  du poste) ; et la **migration proposée**, en attente d'autorisation, sans laquelle un poste
  d'expert-comptable composé depuis l'écran reçoit d'office planning et pointage.
