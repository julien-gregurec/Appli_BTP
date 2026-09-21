# ELSATIA Réserves — V4 : recette navigateur, listes PDF imprimables, résilience réseau

Lot `ELSATIA-RESERVES-V4-E2E-OFFLINE-PDF-PRINT-V1`.
Base : `feat/reserves-v3-collaboration-livrables` @ `41c1a5f`.
**Aucune migration, aucun déploiement, aucune écriture en Production.**

---

## 1. Ce que ce lot lève

Le lot V3 livrait une spécification de bout en bout (`tests/e2e/reserves-v3-collaboration.spec.ts`)
qui n'avait **jamais été exécutée** : elle était gardée par `test.skip(!E2E_RESERVES_URL)`,
et cette variable n'était définie nulle part. Une spécification jamais jouée n'est pas une
recette — c'est une intention.

En l'exécutant réellement, trois écarts sont apparus, dont un défaut applicatif :

| # | Écart | Nature |
|---|---|---|
| 1 | Le tableau de bord, les chantiers, les réserves, les messages, les notifications et les exports **n'affichaient ni `?message=` ni `?error=`** | **Défaut applicatif (P1)** |
| 2 | La spécification cliquait sur « Accepter » ; le bouton réel s'intitule « J'accepte » | Écart de spécification |
| 3 | La bascule d'identité par le bouton de déconnexion créait une course qui perdait le paramètre `next` | Écart de spécification |

L'écart 1 est le plus grave : `appeler()` redirige vers `?error=` en cas de refus RPC. Sur
une page qui ne lit pas ce paramètre, **un échec de transition était visuellement
indiscernable d'un succès**. Sur un workflow de levée de réserve, c'est la pire issue
possible. Corrigé par une bannière unique portée par la coquille
(`components/BanniereRetour.tsx`), donc valable pour toute page présente et à venir.

---

## 2. Listes de réserves imprimables

### Deux formats, deux usages

| Format | Contenu | Usage |
|---|---|---|
| **Synthétique** (défaut) | une ligne par réserve : n°, titre, zone, entreprise, statut, priorité, date de constat, échéance | pointage en réunion de chantier |
| **Détaillée** | une fiche par réserve : description, photos, miniature du plan avec le repère, décisions et leurs motifs | traitement sur le terrain |

### Cinq vues métier

`toutes`, `ouvertes`, `attente_levee`, `levees`, `retard` — combinables avec un filtre
entreprise, statut précis, priorité et échéance.

Les vues sont appliquées **après** la base, sur des lignes déjà filtrées par
`reserves_export_chantier()` sous la session de l'appelant. Restreindre ne peut pas
élargir : aucune option d'export ne peut faire apparaître une réserve que l'utilisateur
n'a pas le droit de voir. Le cloisonnement par entreprise est vérifié par un test qui
juge sur ce qui est **absent** du document.

### Mise en page

- A4 **portrait et paysage**, l'orientation étant portée par le document lui-même
  (`@page`) afin que l'impression navigateur donne le même format que le PDF serveur ;
- **pagination « Page n / N »** en pied de page. Elle ne peut pas venir de la CSS :
  Chromium n'implémente pas les boîtes de marge des médias paginés, donc `counter(page)`
  y reste vide. Elle passe par le gabarit d'en-tête/pied de puppeteer ;
- une fiche **n'est jamais coupée** entre deux pages (`break-inside: avoid`, vérifié sur
  le style calculé, pas seulement déclaré) ;
- l'en-tête de tableau se **répète** sur chaque page ;
- le retard est signalé par une **trame et un symbole**, jamais par la couleur seule :
  une liste de réserves se photocopie.

### Poids des fichiers

Les photos sont compressées à la capture (≈ 2048 px, JPEG 0,85). Le document détaillé en
imprime **au plus quatre par réserve** et annonce en toutes lettres celles qu'il n'imprime
pas, plutôt que de les omettre en silence. Les options `photos=0` et `plans=0` retirent
réellement la matière lourde (vérifié par comparaison de poids).

### Plans

La miniature avec marqueur n'est produite que pour les plans **image**, le marqueur étant
positionné en pourcentage, donc exactement comme à l'écran. Un plan PDF n'est pas
rastérisé ici : afficher un cadre vide au milieu d'une fiche serait pire que la référence
textuelle (`plan — niveau / zone, page n (repère x ; y)`), qui reste toujours imprimée.

---

## 3. Hors-ligne — état réel, mesuré

**ELSATIA Réserves n'est pas une application hors-ligne, et ce lot ne la rend pas telle.**

Mesuré au navigateur, réseau coupé
(`tests/e2e/reserves-v4-offline-mobile.spec.ts`) :

| Scénario demandé | Résultat mesuré |
|---|---|
| Consultation d'un chantier déjà chargé | **Impossible** — toute navigation échoue (`ERR_INTERNET_DISCONNECTED`) |
| Création d'un brouillon | **Impossible** — l'écran de saisie ne se charge pas |
| Photo en attente | **Impossible** — aucune file locale |
| Commentaire hors ligne | **Impossible** |
| Demande de synchronisation | **Sans objet** — il n'y a rien à synchroniser |

Aucun service worker n'est enregistré, aucun cache d'application, aucun stockage local.
Un vrai mode hors-ligne suppose un service worker, un cache de coquille, une base locale
et un rejeu différé : **c'est un lot à part entière**, non entrepris ici.

Le test qui constate cet état échouera le jour où un cache hors-ligne sera livré. C'est
voulu : il empêche d'annoncer « offline » avant que ce soit vrai, et signale le moment où
ça le devient.

### Ce que le lot livre à la place : la résilience au réseau qui flanche

C'est le problème voisin, et c'est celui qui se pose tous les jours sur un chantier : la
soumission part, la réponse se perd, l'utilisateur réappuie — et la réserve est créée deux
fois.

La base savait déjà s'en prémunir : `reserves.origine_client_id`, index unique
`(entreprise_id, origine_client_id)`, et `reserves_creer()` qui renvoie la réserve
existante au rejeu. **Mais aucun formulaire n'émettait cette clé** : la protection était
du code mort. Le formulaire de création la porte désormais
(`components/CleIdempotence.tsx`), tirée une fois par saisie et stable d'une tentative à
l'autre.

> **Correction d'une affirmation de la V1.** `ELSATIA_RESERVES_ARCHITECTURE_V1.md` §7
> annonçait ce comportement « prouvé par le test pgTAP ». Aucun test du dépôt ne mentionnait
> `origine_client_id` : la preuve n'existait pas. Elle existe maintenant —
> `supabase/tests/reserves_v4_resilience_reseau.test.sql`.

### File de synchronisation et conflits — le vocabulaire, pas l'implémentation

`lib/offline/resilience.ts` fixe les états (`en_attente`, `en_cours`, `synchronise`,
`echec`, reprise explicite sur le seul échec) et la politique de conflit par nature de
donnée :

| Donnée | Politique |
|---|---|
| Statut de réserve | le serveur gagne — la matrice de transitions tranche |
| Historique | le serveur gagne — append-only, rien ne s'y écrase |
| Constat saisi au terrain | le client gagne — le terrain fait foi |
| Photo | le client gagne — deux clichés sont deux faits, on garde les deux |
| **Levée validée** | **conflit manuel — jamais d'écrasement silencieux** |

Le garde-fou `ecrasementAutorise()` refuse toute reprise sur une réserve levée, quelle que
soit la nature de la donnée. La base l'interdit déjà ; c'est redit ici pour qu'une future
file de synchronisation ne puisse pas l'ignorer par omission.

---

## 4. Terrain mobile

Vérifié sur 375, 390 et 430 px, et sur les profils WebKit iPhone, Chromium Android et
iPad : aucun débordement horizontal sur le tableau de bord, la liste des réserves et la
fiche chantier ; toutes les cibles tactiles visibles atteignent 44 px.

L'entreprise invitée, sur mobile, ne voit que ses propres réserves : ni les autres corps
d'état, ni les écrans d'administration du chantier.

---

## 5. Rejouer la recette

La recette exige une **base jetable**. Elle ne doit jamais viser la stack de développement
principale — le script refuse d'ailleurs un conteneur nommé `btp-platform`.

```bash
# 1. Stack Supabase isolée (ports décalés, project_id distinct)
#    cf. supabase/config.toml d'un répertoire dédié : project_id = elsatia-reserves-v4-dbtest

# 2. Décor complet, rejouable et idempotent
RESERVES_DB_CONTAINER=supabase_db_elsatia-reserves-v4-dbtest \
E2E_SUPABASE_URL=http://127.0.0.1:57321 \
E2E_SUPABASE_SERVICE_ROLE_KEY=<clé locale> \
  ./scripts/e2e/recette-reserves-v4.sh

# 3. Application
npm --prefix apps/reserves run build && npm --prefix apps/reserves run start

# 4. Recette navigateur
E2E_RESERVES_URL=http://127.0.0.1:3020 \
E2E_SUPABASE_URL=http://127.0.0.1:57321 \
E2E_SUPABASE_ANON_KEY=<clé locale> \
  npx playwright test tests/e2e/reserves-v3-collaboration.spec.ts \
                      tests/e2e/reserves-v4-listes-pdf.spec.ts \
                      tests/e2e/reserves-v4-offline-mobile.spec.ts
```

### Génération PDF hors Linux

`@sparticuz/chromium` embarque un binaire **Linux**, taillé pour le runtime de
déploiement. Sur macOS il s'extrait sans erreur mais ne s'exécute pas : la route PDF
répond alors 502 et rien du document n'est vérifiable localement. La variable
`PDF_CHROMIUM_EXECUTABLE_PATH` désigne un Chromium déjà présent sur le poste. Elle n'est
lue que si elle est définie : **sur le runtime de déploiement, où elle ne l'est pas, le
chemin de production est strictement inchangé.**

---

## 6. Ce que ce lot ne livre toujours pas

Énoncé sans ambiguïté :

- **le mode hors-ligne** (consultation, brouillons, photos différées, file de rejeu) ;
- la clé d'idempotence sur le **dépôt de photo** : la colonne existe, l'action serveur ne
  la transmet pas encore — un double envoi de photo reste donc possible ;
- la **rastérisation des plans PDF** dans le document imprimé ;
- l'envoi réel des notifications, la signature électronique, le procès-verbal de réception
  (inchangés depuis la V3).
