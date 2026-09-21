# ELSATIA-RESERVES-V5-REAL-OFFLINE-SYNC-IDEMPOTENCE-V1 — RAPPORT

## Verdict

**VALIDÉ.**

Le hors-ligne n'est plus constaté absent : il est **démontré en navigateur**, réseau
réellement coupé. Douze scénarios hors-ligne s'exécutent sous Chromium, plus deux sous
WebKit/iPhone et Chromium/Android — coupure, consultation, saisie, persistance au
rechargement, synchronisation au retour du réseau, conflit non écrasant, cloisonnement
des identités. Les preuves sont listées en §11.

Une limite est explicitement conservée et documentée (§6) : sur WebKit, la *navigation*
hors-ligne n'a pas pu être éprouvée — limitation de l'émulation Playwright, pas de
l'application, mesurée et distinguée comme telle.

---

## 1. Base et branche

| | |
|---|---|
| Branche de base | `feat/reserves-v4-e2e-offline-pdf-print` |
| SHA de base (complet) | `cb9df18946b4a2d4ff04a55fe78de3d3a2ca7055` |
| Branche de travail | `feat/reserves-v4-e2e-offline-pdf-print` (poursuivie) |
| SHA du code V5 (complet) | `7c0fc3d158a0f7b6a3de27eaba8b4be47cb60b00` |

Le SHA final poussé est la tête de la branche : les commits documentaires viennent au-dessus
du code, sans le modifier. Il est relevé par `git rev-parse origin/feat/reserves-v4-e2e-offline-pdf-print`.

> **Le SHA de base n'était pas poussé.** Vérifié au démarrage : aucune branche distante
> ne contenait `cb9df18`. Les deux commits sont désormais sur
> `origin/feat/reserves-v4-e2e-offline-pdf-print`. Aucune pull request n'a été ouverte,
> aucune fusion effectuée.

Aucune fusion. Aucun déploiement. Aucune écriture en Production.

---

## 2. Architecture

Trois couches, séparées pour que chacune soit vérifiable isolément.

```
  Coquille applicative (rendu serveur, en ligne)
        │  <SemeurCache> recopie ce qui est DÉJÀ affiché
        ▼
  IndexedDB — une base PAR (organisation, utilisateur)
    ├── chantiers / reserves   cache de consultation
    ├── mutations              file d'envoi (7 états)
    ├── photos                 Blob, tel quel
    └── meta
        │  <AtelierOffline> + moteur de synchronisation
        ▼
  /api/offline/mutations (JSON)   /api/offline/photo (multipart)
        │  RPC idempotentes, sous la session de l'appelant
        ▼
  PostgreSQL — clés d'idempotence et registre des mutations appliquées
```

Le **service worker** (`public/sw-reserves.js`) ne sert qu'à une chose : que
l'application **s'ouvre** sans réseau. Il met en cache la *coquille* — `/hors-ligne`, une
page sans aucune donnée — et les ressources statiques. Les navigations sont *réseau
d'abord*, avec repli sur cette coquille ; les routes `/api/` et `/imprimer/` ne sont
jamais mises en cache.

> **Pourquoi aucune page de données n'est mise en cache HTTP.** Le cache HTTP ignore qui
> est connecté. Y placer une page rendue reviendrait à pouvoir la resservir après la
> connexion d'une autre organisation. Les données transitent donc exclusivement par
> IndexedDB, dont le *nom de base* porte l'identité.

**Piège corrigé en cours de route** : mettre en cache le seul document HTML ne suffit pas,
et l'échec est silencieux — la page s'affiche hors ligne, ses scripts manquent, React
n'hydrate jamais, et l'utilisateur voit l'état initial du rendu serveur (« chargement… »,
zéro chantier) alors que l'appareil a les données. Le service worker extrait donc du HTML
de la coquille les ressources `/_next/static/` qu'elle référence, et les précache.

---

## 3. Stockage choisi

**IndexedDB**, pour tout : cache de consultation, file de mutations, photos.

`localStorage` a été écarté délibérément :

- il est **synchrone** — chaque écriture bloque le fil principal, ce qui se voit sur un
  téléphone de chantier ;
- il ne stocke que des chaînes : une photo devrait y être encodée en base64, soit **+33 %**
  sur le poste déjà le plus lourd ;
- son quota tourne autour de **5 Mo** par origine — deux photos le saturent, et le
  dépassement lève une exception *au moment de l'écriture*, c'est-à-dire après que
  l'utilisateur a cru enregistrer.

`localStorage` n'est utilisé qu'à **deux fins minuscules et documentées** :

1. le **pointeur d'identité** (`{entrepriseId}:{utilisateurId}`, ~80 octets) — la coquille
   hors-ligne doit savoir quelle base ouvrir, synchronement, au premier rendu, et ne peut
   interroger personne ; aucun jeton, aucun secret, aucune donnée de chantier ;
2. le **verrou de synchronisation** inter-onglets (un horodatage).

---

## 4. Données mises en cache

| Donnée | Hors ligne | Remarque |
|---|---|---|
| Chantiers déjà ouverts | ✅ | nom, référence, ville |
| Réserves déjà chargées | ✅ | n°, titre, description, statut, priorité, échéance, plan/page |
| File de mutations | ✅ | avec photos (`Blob`) |
| Photos déjà envoyées | ❌ | annoncé à l'écran |
| Plans, documents PDF | ❌ | annoncé à l'écran |
| Annuaire, invitations | ❌ | annoncé à l'écran |

La coquille hors-ligne **dit ce qui n'est pas disponible**. Sans cela, une liste partielle
se lirait comme l'état complet du chantier — un conducteur de travaux conclurait d'une
liste vide qu'il n'y a rien à traiter.

---

## 5. Mutations réellement prises en charge

Liste **fermée**, limitée à ce qui est éprouvé par la recette :

| Type | Éprouvé hors ligne | Idempotence serveur |
|---|---|---|
| `reserve_creer` | ✅ E2E | `reserves_creer` / `origine_client_id` (V1) |
| `commentaire_ajouter` | ✅ E2E | `reserves_commenter` / `origine_client_id` (**V5**) |
| `photo_ajouter` | ✅ E2E | `reserves_ajouter_photo` / `origine_client_id` (V2, **enfin transmise**) |
| `levee_demander` | ✅ E2E | `reserves_transition_differee` (**V5**) |

Chaque mutation porte : identifiant client stable (qui **est** la clé d'idempotence),
type, organisation, utilisateur initiateur, réserve/chantier visés, date locale, version
de charge utile, nombre de tentatives, dernière erreur, état.

**États** : `brouillon`, `en_attente`, `en_cours`, `synchronise`, `echec`, `conflit`,
`annule`. La machine à états interdit explicitement deux chemins : rien ne mène de
`synchronise` vers `en_attente` (une mutation acquittée ne peut pas être renvoyée par une
boucle de reprise), et rien ne mène de `conflit` vers `en_attente` (un conflit exige une
décision, il ne se « réessaie » pas).

---

## 6. Limites explicites

1. **WebKit / iPhone — navigation hors ligne non éprouvée.** Mesuré : le service worker
   s'y enregistre, devient contrôleur, et les caches se remplissent ; IndexedDB est semé
   et cloisonné. Seule la navigation sous `context.setOffline(true)` échoue, avec une
   erreur interne WebKit — limitation de l'émulation Playwright. Les tests `@responsive`
   éprouvent donc sur WebKit tout le reste (socle, file, saisie, synchronisation).
   **À vérifier à la main sur un iPhone réel** avant commercialisation (§13).
2. **Aucune consultation d'un chantier jamais ouvert.** Le cache est semé par les écrans
   visités ; il n'y a pas de pré-chargement de chantier.
3. **Photos déjà envoyées, plans et PDF non consultables hors ligne.**
4. **Modification d'un brouillon** : un brouillon peut être enregistré, soumis ou annulé,
   mais pas ré-édité champ à champ. La demande initiale l'évoquait ; ce n'est pas livré,
   et ce n'est donc pas annoncé dans l'écran.
5. **Pas de résolution de conflit assistée.** Un conflit est conservé, expliqué et
   annulable ; l'arbitrage se fait en rouvrant la réserve, à la main.
6. **Purge : la file survit à la déconnexion** (voir §7) — choix délibéré.

---

## 7. Sécurité multi-utilisateur et multi-tenant

**Cloisonnement structurel, pas filtré.** Chaque couple (organisation, utilisateur) a sa
propre base IndexedDB, nommée `elsatia-reserves::v1::{entrepriseId}::{utilisateurId}`.
Deux identités ouvrent deux bases : il n'y a pas de requête à filtrer, donc pas de filtre
à oublier. *Vérifié en E2E* : après connexion de B, une seconde base apparaît, et le
format du nom est contrôlé.

**Double vérification à l'envoi.** Chaque mutation transporte l'organisation et
l'utilisateur qui l'ont préparée. `/api/offline/mutations` compare ces valeurs à la
session **avant toute action** et refuse si elles diffèrent. *Vérifié en E2E* : la
mutation d'A, rejouée sous la session de B, est refusée avec un motif explicite, et rien
n'est créé chez B.

**Aucun droit nouveau.** Les routes n'appellent que les RPC du domaine, avec le client
normal, donc sous les mêmes RLS que l'écran. Une permission révoquée entre-temps fait
échouer le rejeu. *Prouvé en pgTAP* : une clé d'idempotence ne dispense jamais d'être
acteur de la réserve.

**Déconnexion.** Le cache de consultation est effacé et le pointeur d'identité oublié :
la coquille hors-ligne n'ouvre alors plus aucune base. *Vérifié en E2E* : après
déconnexion, hors ligne, l'écran annonce qu'aucune session n'est ouverte et n'affiche
aucun chantier.

**Le cache du service worker n'est pas vidé**, délibérément : il ne contient que la
coquille sans données et des ressources statiques. Le purger ne retirerait rien de
confidentiel et priverait la session suivante d'un démarrage hors ligne.

**La file n'est pas détruite à la déconnexion**, délibérément : supprimer un travail non
transmis parce que la session s'est fermée — ce qui arrive tout seul quand un jeton expire
sur un chantier — ferait perdre des constats que leur auteur croit enregistrés. Elle reste
dans la base de son identité, que personne d'autre ne peut ouvrir, et le serveur
revérifie l'identité de chaque mutation.

**Jetons d'invitation** : aucun n'est stocké localement. **URLs signées** : aucune n'est
mise en cache (les photos déjà envoyées ne sont pas consultables hors ligne).

---

## 8. Stratégie d'idempotence

L'identifiant de la mutation **est** la clé. Il est tiré une fois, à la saisie, et ne
change pas d'une tentative à l'autre.

| Action | Mécanisme | Rejeu |
|---|---|---|
| Création | index unique `(entreprise_id, origine_client_id)` | rend la réserve existante |
| Commentaire | idem sur `reserves_messages` (**nouveau**) | rend la conversation d'origine |
| Photo | idem sur `reserves_photos` | rend la même photo, même chemin |
| Demande de levée | registre `reserves_mutations_appliquees` (**nouveau**) | issue `rejeu`, sans effet |

**Correction du P1 V4.** `reserves_ajouter_photo()` acceptait déjà une clé et savait
renvoyer la photo existante — mais **aucun appelant ne la transmettait**. La protection
était du code mort : un double clic créait deux photos. Elle est désormais transmise, en
ligne comme hors ligne. Le téléversement passe en `upsert: true` — non par laxisme : le
chemin étant composé *par la base* à partir de la clé, réécrire signifie forcément « même
photo, même envoi », et sans cela une reprise après coupure échouerait sur « objet déjà
présent ». Le dépôt de **plan**, qui n'a pas de clé, conserve `upsert: false`.

**Trois issues distinctes**, là où il n'y en avait qu'une (l'exception) :
`appliquee`, `rejeu` (bénin, présenté comme un succès), `conflit`. Traiter un rejeu comme
un échec pousserait l'utilisateur à ressaisir une action déjà enregistrée.

**Verrou inter-onglets.** Un rechargement ou un second onglet crée un nouveau contexte
JavaScript : plusieurs envois de la même mutation peuvent se chevaucher. Ils ne produisent
pas de doublon — les clés l'interdisent — mais se disputent la même ligne et finissent en
« statement timeout », que l'utilisateur lit comme un échec. Un verrou horodaté dans
`localStorage` les sérialise, avec un bail de 12 s pour qu'un onglet tué ne bloque rien.

---

## 9. Stratégie de conflit

**Règle ferme : jamais d'écrasement silencieux d'une réserve ou d'une levée validée.**

| Donnée | Politique |
|---|---|
| Statut de réserve | serveur gagne — la matrice de transitions tranche |
| Historique | serveur gagne — append-only |
| Constat saisi au terrain | client gagne |
| Photo | client gagne — deux clichés sont deux faits |
| **Levée validée** | **conflit manuel — aucun écrasement** |

Quand l'état du serveur ne permet plus l'action, `reserves_transition_differee` **refuse
et rend la main** avec un motif en clair. La saisie locale n'est ni perdue ni appliquée :
elle passe en `conflit`, reste visible, et l'écran explique que la réserve a changé d'état
et que rien n'a été écrasé.

*Vérifié en E2E* : B prépare une demande de levée hors ligne ; pendant la coupure, la
levée est demandée puis **validée** ailleurs ; au retour du réseau la réserve reste
`levee`, et la saisie de B est conservée en conflit.

**Scénarios couverts** : levée validée pendant la coupure (E2E), rejeu du même
commentaire / de la même photo / de la même demande de levée (E2E + pgTAP), file rouverte
sous un autre compte (E2E), état déjà atteint (pgTAP), transition devenue impossible
(pgTAP). **Non couverts par un test dédié** : transfert d'entreprise, révocation
d'invitation et désactivation d'utilisateur pendant la coupure — ils reposent sur les RLS
existantes, qui font échouer le rejeu, mais aucun test ne l'exerce spécifiquement (P2).

---

## 10. Migrations et ledger

**Une migration ajoutée** : `20260907000271_reserves_v5_offline_idempotence_v1.sql`.
Ledger local : **269 fichiers**, dernière version `20260907000271`.

Contenu : `origine_client_id` sur `reserves_messages` (+ index unique par organisation) ;
`reserves_commenter` doté de la clé ; table `reserves_mutations_appliquees` (registre
d'idempotence, RLS en lecture seule, aucune écriture applicative) ;
`reserves_transition_differee` (trois issues).

> Le registre est **séparé de `reserves_historique`** à dessein. Ma première version
> ajoutait une colonne mutable à l'historique et la réécrivait après coup : cela aurait
> percé la seule table dont l'immuabilité est une garantie contractuelle. Le registre est
> une donnée technique, l'historique est une preuve.

**Aucune migration appliquée en Production.** Elle n'a été jouée que sur la pile jetable
`elsatia-reserves-v4-dbtest` (ports 5732x).

---

## 11. Tests et preuves

### Preuves E2E hors-ligne (navigateur, réseau réellement coupé)

`tests/e2e/reserves-v5-offline.spec.ts` — **12 scénarios, Chromium** :

1. chargée en ligne, l'application **s'ouvre et se consulte sans réseau** (HTTP 200 servi
   par le service worker ; chantier et réserves lisibles ; limites annoncées) ;
2. **rechargement hors ligne** : ni le cache ni la file ne sont perdus ;
3. une réserve **saisie hors ligne arrive en base** au retour du réseau (absente du
   serveur avant, présente après) ;
4. **commentaire** saisi hors ligne, transmis et retrouvé dans l'historique ;
5. **photo** saisie hors ligne : aperçu local, conservée, déposée — **une seule** photo ;
6. **file rejouée cinq fois** : aucune duplication ;
7. mutation **interrompue en plein envoi** : repart au démarrage suivant ;
8. **levée validée pendant la coupure : jamais écrasée** ; saisie conservée en conflit ;
9. file préparée par A **jamais envoyée sous l'identité de B** ;
10. après **déconnexion**, rien de l'organisation précédente n'est consultable ;
11. deux identités **ne partagent pas la même base locale** ;
12. le bandeau annonce le travail non transmis, **y compris en ligne**.

**Mobile** — `@responsive`, sur WebKit/iPhone, Chromium/Android et iPad : le socle
hors-ligne s'installe (service worker contrôlant, caches, base nommée par l'identité), et
une saisie faite sans réseau est conservée puis transmise, sans débordement horizontal.

### Totaux

| Suite | Résultat |
|---|---|
| pgTAP | **1 635 tests, 62 fichiers — PASS** |
| Unitaires (vitest) | **106 tests, 8 fichiers — PASS** |
| E2E Playwright | **47 tests, 4 fichiers, 4 profils navigateur — PASS** |
| Lint | **0 erreur, 0 avertissement** |
| Typecheck | **PASS** |
| Build | **PASS** |
| `git diff --check` | **propre** |

Profils E2E : `desktop-chromium`, `iphone-webkit`, `android-chromium`, `tablet-webkit`.

### Défauts trouvés et corrigés pendant le lot

1. **La coquille hors-ligne ne réparait pas la file** — servie par le service worker, elle
   est hors de `<AtelierOffline>` : une mutation interrompue restait affichée « Envoi en
   cours » indéfiniment. C'est exactement le mensonge que ce lot doit rendre impossible.
2. **Le bouton de déconnexion ne déconnectait pas** — `requestSubmit()` relançait le
   gestionnaire intercepté, dont le `preventDefault` empêchait l'envoi : la purge avait
   lieu, jamais la déconnexion.
3. **« Identifiants incorrects » sur un serveur indisponible** — toute erreur
   d'authentification était présentée comme un mauvais mot de passe, y compris un 504.
   Sur un chantier mal couvert, c'est le pire message possible : il envoie chercher une
   faute de frappe qui n'existe pas. Distingué depuis.
4. **Régression introduite puis corrigée** : ma réécriture de `reserves_commenter` avait
   changé sa valeur de retour (message au lieu de conversation), omis l'insertion
   « l'auteur a lu son propre message » et modifié la garde de notification — 4 tests V3
   sont tombés, la fonction a été reconstruite à l'identique depuis la migration 270.
5. **`navigator.onLine` ment sous service worker** : il vaut `true` alors que rien n'est
   joignable. La coquille annonçait « le réseau est revenu » à un utilisateur sans
   couverture. Une sonde `/api/offline/ping` tranche désormais.

### Test V4 retiré

`reserves-v4-offline-mobile.spec.ts` contenait un test qui *mesurait l'absence* de
hors-ligne. Il est devenu faux et échouait — exactement comme il avait été écrit pour le
faire. Il est retiré et remplacé par un renvoi vers la recette V5.
Le test V4 « une levée validée ne peut pas être réécrite » a également été corrigé : il
visait `reserves_appliquer_transition`, fonction **interne** non accordée au rôle
`authenticated`. Il recevait donc un 403 de permission et ne prouvait que ceci — jamais la
règle métier. Il interroge désormais la fonction publique `reserves_statuer_levee`.

---

## 12. Interface

Un bandeau, présent sur **toutes** les pages de la coquille, dès qu'il reste quelque chose
en suspens — **y compris en ligne**, car « en ligne » ne veut pas dire « déjà transmis ».
Il affiche l'état du réseau, le nombre d'actions non transmises, les conflits, les échecs,
et la synchronisation en cours.

La coquille `/hors-ligne` détaille chaque action : type, contenu, date de saisie, nombre
de tentatives, **cause en clair**, et le geste qui débloque (réessayer, annuler). Un
brouillon est signalé « non transmis ». Un conflit est expliqué : la réserve a changé
d'état, la saisie est conservée, rien n'a été écrasé.

---

## 13. Recette humaine

Prérequis : pile jetable + décor (`scripts/e2e/recette-reserves-v4.sh`), application
construite et démarrée.

1. Se connecter, ouvrir le tableau de bord, attendre quelques secondes.
2. **Couper le Wi-Fi** (ou passer en mode avion).
3. Naviguer vers *Réserves* : la coquille hors-ligne doit s'ouvrir et lister le chantier
   et ses réserves. Vérifier la mention de ce qui n'est **pas** disponible.
4. Saisir une réserve, un commentaire, joindre une photo (l'aperçu doit s'afficher).
   Chaque saisie doit apparaître « en attente d'envoi ».
5. **Recharger la page** hors ligne : la file et le cache doivent être intacts.
6. **Fermer complètement le navigateur**, le rouvrir hors ligne : idem.
7. **Rétablir le réseau.** La file doit se vider seule ; vérifier en base que la réserve,
   le commentaire et la photo sont bien arrivés, **en un seul exemplaire**.
8. Se déconnecter, couper le réseau, ouvrir `/hors-ligne` : plus aucun chantier.
9. **Sur un iPhone réel** (limite §6-1) : refaire les étapes 1 à 7.

---

## 14. Reste à faire

**P0 — aucun.**

**P1**
- Vérification manuelle sur **iPhone physique** de la navigation hors ligne (§6-1).
- **Modification d'un brouillon** champ à champ (§6-4).

**P2**
- Tests dédiés : transfert d'entreprise, révocation d'invitation, désactivation
  d'utilisateur *pendant* la coupure (§9).
- Pré-chargement explicite d'un chantier pour consultation hors ligne (§6-2).
- Plans et photos déjà envoyées consultables hors ligne (§6-3).
- Résolution de conflit assistée depuis la fiche de réserve (§6-5).

**Environnement** — le poste de recette hébergeait jusqu'à **7 piles Supabase simultanées**
(charge moyenne 43). L'authentification locale y répondait par des 504. Les budgets de
temps de la recette sont calibrés sur cette contention, et les aides E2E réessaient sur
*indisponibilité* uniquement — jamais sur un refus métier.

---

## 15. Production

**Aucun déploiement. Aucune fusion. Aucun `supabase link`. Aucune migration appliquée en
Production.** Tout s'est déroulé sur la pile jetable `elsatia-reserves-v4-dbtest`
(ports 5732x) ; la pile de développement `btp-platform` n'a jamais été touchée.
