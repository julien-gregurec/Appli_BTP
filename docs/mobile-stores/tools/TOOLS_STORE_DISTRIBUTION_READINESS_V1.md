# ELSATIA Tools — préparation à la distribution Store — V1

**Base canonique** : `fix/tools-supabase-public-key-convention-v1` — `094bd43eab57f9800dce7a4f060622a7920c146c`
**Branche du lot** : `integration/tools-store-distribution-readiness-v1`
**Date** : 6 septembre 2026
**Périmètre** : préparation technique et documentaire uniquement.

Aucun envoi App Store Connect, aucun envoi Google Play, aucune publication, aucun compte
développeur créé, aucun certificat de distribution, aucun keystore, aucun secret manipulé,
aucune modification de Production, de Stripe ou de Supabase distant.

---

## 0. Verdict

| Cible | Build techniquement produit | Soumission possible aujourd'hui |
|---|---|---|
| iOS | **OUI** — `Release-iphoneos`, non signé, `BUILD SUCCEEDED` | NON — il manque le compte et le matériel de signature |
| Android | **OUI** — `app-release.aab`, non signé, 5 266 345 octets | NON — il manque le compte et la clé de signature |

Ce qui reste bloquant relève **exclusivement du compte fournisseur et des secrets**, c'est-à-dire
de ce que ce lot s'interdit de faire. Le dépôt, lui, est prêt.

**TestFlight : 85 %. Google Play Internal Testing : 85 %.** Le détail du calcul est en §14.

---

## 1. Ce que ce lot a changé dans le dépôt

Cinq changements, tous vérifiés :

| Changement | Nature | Pourquoi |
|---|---|---|
| `ios/…/AppIcon-512@2x.png` | canal alpha retiré | App Store Connect refuse la **présence** du canal alpha sur l'icône principale, même entièrement opaque. Voir §4. |
| `docs/r10-publication/assets/icon-1024.png` | idem | Même fichier archivé, gardé cohérent. |
| `scripts/generate-store-assets.mjs` (+ `.d.mts`) | nouveau | Produit les deux visuels Google Play qui manquaient : icône `512×512` et visuel principal `1024×500`. |
| `scripts/capture-store-screenshots.mjs` | nouveau | Rend la série de captures Store **reproductible** au pixel près. |
| `src/lib/store-assets.test.ts` | nouveau, 7 tests | Verrouille les dimensions, l'opacité et la composition des visuels de fiche. |

Plus `package.json` : le script `store:assets`.

**Rien d'autre n'a été touché.** Aucun `bundleId`, aucune version, aucune permission, aucun
comportement applicatif. Le canon `094bd43` gagne partout ailleurs.

### Ce qui a été repris du lot Mobile Stores historique — et ce qui a été écarté

Le commit `4d244d4f1e0ecef00e89a56cd09457ac7ac0bc70` part d'une base ancienne
(`0819d7b`, antérieure à la convention Supabase `PUBLISHABLE_KEY`). Il n'a **pas** été fusionné.

Repris, après vérification indépendante : **le seul correctif d'icône**. La vérification a été
refaite ici, sans faire confiance à l'affirmation du commit : décodage PNG des deux fichiers,
comparaison des plans RGB.

```
avant  : 1024×1024, colorType 6 (RGBA), alpha min=255 max=255 → opaque
après  : 1024×1024, colorType 2 (RGB), pas de canal alpha
plans RGB : 3 145 728 octets, sha256 identique de part et d'autre → IMAGE INCHANGÉE
```

Écarté : toute la documentation du commit historique. Elle décrit une base où le garde de
variables publiques n'existait pas et où la clé Supabase s'appelait encore `ANON_KEY`. La
réutiliser aurait réintroduit une description fausse du canon. Les fiches de ce dossier sont
réécrites contre `094bd43`.

**Réserve P0 du lot historique, désormais fermée.** L'audit de septembre classait P0 le fait
qu'un `build:native` lancé sans les `NEXT_PUBLIC_*` réussissait silencieusement et livrait un
binaire sans compte ni abonnement. Le canon `094bd43` porte `scripts/verify-public-env.mjs`,
branché sur `prebuild:native`. Neuf cas ont été rejoués ici, §7 : la réserve est levée.

---

## 2. Identité technique — constatée sur les binaires produits

Les valeurs ci-dessous ne sont pas lues dans les sources : elles sont relevées **dans les
artefacts compilés**.

| Élément | iOS (Info.plist du `.app`) | Android (manifeste fusionné release) |
|---|---|---|
| Identifiant | `fr.elsatia.tools` | `fr.elsatia.tools` |
| Nom affiché | `ELSATIA Tools` | `ELSATIA Tools` |
| Version marketing | `1.0.0` | `1.0.0` |
| Build / versionCode | `1` | `1` |
| Cible minimale | iOS 15.0 | minSdk 24 (Android 7.0) |
| Cible de compilation | — | targetSdk 36 |
| Familles d'appareils | `1,2` — iPhone **et** iPad | téléphone et tablette |
| Architecture | `arm64` | universel (AAB) |
| Taille | 7,4 Mo (`.app` non signé) | 5,27 Mo (`.aab` non signé) |

**Convention de versionnage à tenir.** La version marketing suit SemVer. Le build iOS
(`CURRENT_PROJECT_VERSION`) et le `versionCode` Android s'incrementent **à chaque téléversement**,
y compris pour un simple renvoi TestFlight : les deux consoles refusent définitivement une
combinaison déjà reçue, même après suppression. `1.0.0 (1)` n'a jamais été téléversé nulle part.

---

## 3. Preuves d'exécution

Tout a tourné sur le volume externe `/Volumes/ELSATIA-DEV` — worktree, `node_modules`,
`DerivedData`, cache Gradle, artefacts, captures. Le SSD interne (4,2 Gio libres au démarrage
du lot) n'a servi qu'au tampon de captures, 5,6 Mo, effacé ensuite.

| Étape | Résultat |
|---|---|
| `npm test` (Tools) | **1991 tests, 174 fichiers — PASS** |
| `npx vitest run` (racine) | **806 tests, 92 fichiers — PASS** |
| `npm run typecheck` (Tools) | **PASS** |
| `tsc --noEmit` (racine) | **PASS** |
| `npm run lint` (Tools) | **PASS**, 0 problème |
| `npx eslint` (racine) | **0 erreur**, 3 avertissements `no-img-element` préexistants dans Gestion Pro |
| `npm run build:native` | **PASS** — 44 pages exportées, service worker écrit |
| `npx cap sync ios` | **PASS** — 5 plugins Capacitor |
| `npx cap sync android` | **PASS** — 5 plugins Capacitor |
| `xcodebuild -sdk iphoneos -configuration Release` | **BUILD SUCCEEDED** (non signé) |
| `./gradlew bundleRelease` | **BUILD SUCCESSFUL** en 7 min 48 s |
| `git diff --check` | propre |

Une remarque honnête sur la suite racine : lors du **premier** passage, un test qui parcourt
`src/` a échoué, pendant que Gradle écrivait encore dans le worktree. Les deux passages suivants,
faits au calme, donnent 806/806. C'est une course de système de fichiers dans le test, pas une
régression de ce lot — mais elle est réelle et mérite d'être connue de qui relancera la suite
pendant un build.

### Validation Apple obtenue gratuitement

Le build iOS exécute, en fin de tâche, l'étape `Validate` d'Xcode :

```
builtin-validationUtility …/App.app -validate-for-store -shallow-bundle -infoplist-subpath Info.plist
```

Elle passe. Ce n'est pas la validation complète d'App Store Connect — celle-là exige une archive
signée — mais c'est le contrôle de structure de paquet et d'`Info.plist` qu'Apple applique, et il
est vert.

---

## 4. Icônes

### iOS — le correctif du lot

`AppIcon.appiconset` contient un unique `AppIcon-512@2x.png`, `1024×1024`, idiom `universal` :
le format attendu par Xcode 14+ et App Store Connect.

L'icône livrée par le canon était encodée **RGBA**. Toutes ses valeurs alpha valaient 255 —
l'image était donc visuellement opaque — mais App Store Connect refuse la présence même du canal,
indépendamment de son contenu. Le canal a été retiré ; les octets RGB sont inchangés (§1).

Contrôle vérifié **après compilation**, dans le `Assets.car` du paquet :

```
AppIcon  idiom=phone  1024×1024  Opaque=True
AppIcon  idiom=pad    1024×1024  Opaque=True
```

Contrôle à refaire avant chaque archive : `sips -g hasAlpha` doit répondre `no`.

### Android

| Élément | État |
|---|---|
| `mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png` | présents, 5 densités |
| `ic_launcher_round.png` | présents, 5 densités |
| `ic_launcher_foreground.png` | présents, 5 densités |
| `mipmap-anydpi-v26/ic_launcher.xml` | adaptive icon, `background` + `foreground` |
| Fond adaptive | `#F3F2ED`, cohérent avec `backgroundColor` Capacitor |

Le canal alpha des `ic_launcher*` est normal et **requis** : le foreground adaptive doit être
transparent. Ne pas y appliquer le correctif iOS.

**Icône de fiche Play `512×512` — produite par ce lot.**
`apps/tools/native-assets/store/play-icon-512.png`, opaque, dérivée de la seule géométrie de
`public/icon.svg`. Aucune identité graphique nouvelle.

### Splash

iOS : `Splash.imageset`, trois variantes `2732×2732` (universelle, sombre, claire) +
`LaunchScreen.storyboard`. Android : 11 fichiers, portrait et paysage, 5 densités.
Aucun texte marketing, aucun faux écran, aucune promesse. Conforme aux deux règlements.

---

## 5. Visuel principal Google Play

`apps/tools/native-assets/store/play-feature-graphic-1024x500.png`, produit par
`npm run store:assets`, dimensions exactes imposées par Play, opaque.

Composition : la tuile du logo et le mot-marque, tracés depuis la même géométrie que l'icône, plus
un filigrane discret reprenant le cercle et l'équerre 3-4-5 — les deux figures que les outils
gratuits tracent réellement.

Ce que le visuel ne contient pas, délibérément : **aucune fausse interface, aucune capture
incrustée, aucun chiffre commercial, aucune promesse de fonction, aucun slogan gravé** (un texte
gravé ne se traduit pas et se périme avec la fiche). Le règlement Play interdit un visuel
principal trompeur ; un chiffre inventé serait invérifiable.

Sept tests (`src/lib/store-assets.test.ts`) verrouillent dimensions, opacité, correspondance
exacte au générateur, et le fait que les quatre coins restent sur le fond de marque — ce qui
exclut mécaniquement qu'une capture d'écran y soit un jour collée.

---

## 6. Permissions — état exact, vérifié sur le manifeste fusionné

C'est un point que l'audit historique ne pouvait qu'annoncer : il est ici **constaté** sur le
manifeste réellement fusionné par Gradle pour la variante release.

```
android.permission.INTERNET
com.android.vending.BILLING
android.permission.ACCESS_NETWORK_STATE
fr.elsatia.tools.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION
```

- `INTERNET` : la seule permission déclarée par l'application.
- `BILLING` et `ACCESS_NETWORK_STATE` : apportées par `com.android.billingclient:billing:9.1.0`.
  Elles sont indispensables à Google Play Billing et attendues par Play Console.
- `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` : permission interne de niveau `signature`,
  générée par AndroidX. Elle n'est ni demandée à l'utilisateur ni visible sur la fiche.

**Absentes, et non nécessaires** : `CAMERA`, `READ_MEDIA_IMAGES`, `READ_EXTERNAL_STORAGE`,
`WRITE_EXTERNAL_STORAGE`, `POST_NOTIFICATIONS`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`.

L'import d'image de référence n'en demande aucune : le champ est un `<input type="file"
accept="image/jpeg,image/png,image/webp">` **sans attribut `capture`**, servi par le sélecteur
système. C'est exactement la raison pour laquelle l'`Info.plist` iOS ne contient ni
`NSCameraUsageDescription` ni `NSPhotoLibraryUsageDescription`, et il ne faut **pas** les y
ajouter par anticipation : une chaîne d'usage déclarée sans usage réel est un motif de rejet.

Le `FileProvider` est correctement borné : `file_paths.xml` n'expose que `cache-path` et
`files-path`, **aucun `external-path`**, avec `exported="false"` et `grantUriPermissions="true"`.

`src/lib/native-config.test.ts` verrouille ces invariants : une seule `uses-permission` déclarée,
`INTERNET`, `allowBackup="false"`, absence d'`external-path`. Toute dérive casse la suite.

---

## 7. Variables publiques du build natif — garde vérifiée

`scripts/verify-public-env.mjs`, branché sur `prebuild` et `prebuild:native`, bloque **avant**
`next build`. Contrat : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` et
`NEXT_PUBLIC_TOOLS_BILLING_API_URL` sont requises ; `NEXT_PUBLIC_TOOLS_URL` est recommandée.

Neuf cas rejoués, avec des valeurs de forme correcte mais **manifestement fictives** — aucune
vraie clé n'a été manipulée :

| # | Cas | Attendu | Obtenu |
|---|---|---|---|
| 1 | `native-production` complet | PASS | **exit 0** |
| 2 | sans `SUPABASE_URL` | FAIL | **exit 1** |
| 3 | sans `SUPABASE_PUBLISHABLE_KEY` | FAIL | **exit 1** |
| 4 | sans `TOOLS_BILLING_API_URL` | FAIL | **exit 1** |
| 5 | ancienne `ANON_KEY` fournie à la place | FAIL, **pas de repli** | **exit 1** — la clé publiable reste « absente » |
| 6 | `sb_secret_…` en `NEXT_PUBLIC_*` | FAIL | **exit 1** — « a la forme d'une clé de service » |
| 7 | JWT `role: service_role` en `NEXT_PUBLIC_*` | FAIL | **exit 1** — idem, charge décodée jamais imprimée |
| 8 | même secret, mode `local` non bloquant | FAIL **quand même** | **exit 1** — « aucun mode ne lève ce refus » |
| 9 | `NEXT_PUBLIC_TOOLS_ENV` absent | traité comme `production`, FAIL | **exit 1** |

Les cas 5 à 8 sont ceux qui comptent pour la sécurité. Le cas 5 confirme que
`NEXT_PUBLIC_SUPABASE_ANON_KEY` n'est **pas** acceptée en repli : les JWT hérités sont désactivés
au niveau du projet Supabase, un repli aurait transformé une panne d'authentification en build
vert. Le cas 8 confirme qu'une fuite bloque dans tous les modes, y compris local.

Aucun message d'erreur ne contient de valeur : seulement des noms de variables et des raisons
catégorielles.

**Contrôle du paquet livré.** Le bundle exporté a été fouillé : `sb_secret_`, `service_role`,
`PRIVATE KEY`, `STRIPE_SECRET`, `sk_live`, `sk_test`. Une seule occurrence, dans
`_next/static/chunks/6622-*.js` :

```js
let tR = (e) => e.startsWith("sb_publishable_") || e.startsWith("sb_secret_")
```

C'est le code de `@supabase/supabase-js` qui reconnaît la forme d'une clé. Un littéral de
bibliothèque, pas un secret. **Aucune fuite.**

Les valeurs de production réelles restent à fournir au build d'archive : c'est une action de
console et de secrets, hors périmètre.

---

## 8. Liens profonds

| Mécanisme | État |
|---|---|
| Schéma `fr.elsatia.tools://` iOS | **actif** — `CFBundleURLTypes`, nom `fr.elsatia.tools.auth` |
| Schéma `fr.elsatia.tools://` Android | **actif** — `intent-filter`, `host="auth"`, `pathPrefix="/recovery"` |
| Type de document `.elsatiatools` | **actif** — UTI exporté `fr.elsatia.tools.project`, conforme `public.json` |
| Universal Links iOS (`applinks:`) | **non activés** — capability Associated Domains absente |
| Android App Links (`autoVerify`) | **non activés** |
| `/.well-known/apple-app-site-association` | **absent** du site |
| `/.well-known/assetlinks.json` | **absent** du site |

Le validateur `resolveToolsDeepLink()` n'accepte, pour le schéma personnalisé, que
`fr.elsatia.tools://auth/recovery` — tout autre hôte ou chemin renvoie `null`. Pour l'origine
canonique en HTTPS, il n'accepte que `/`, `/projets` et `/outils/<slug>`. La logique applicative
est donc déjà prête pour les liens universels ; seule la déclaration Store manque.

**Deux modèles sont fournis, volontairement non déployés** :
`well-known/apple-app-site-association.template.json` et `well-known/assetlinks.template.json`.

Ils portent des marqueurs explicites, `TEAMID` et `SHA256_FINGERPRINT_DE_LA_CLE_DE_SIGNATURE_PLAY`.
**Le Team ID Apple et l'empreinte SHA-256 n'ont pas été inventés** — ce sont des valeurs qui
n'existeront qu'après création du compte développeur et activation de Play App Signing.

Ces fichiers ne sont **pas** placés dans `apps/tools/public/`, et c'est délibéré : servir un AASA
avec un faux Team ID est pire qu'un 404. iOS met l'AASA en cache et un fichier invalide produit
des liens morts durablement ; un `assetlinks.json` à empreinte fausse fait échouer la
vérification Android App Links. Les déposer relève de la mise en ligne, une fois les vraies
valeurs obtenues.

Ne pas activer la capability Associated Domains avant d'avoir publié un AASA exact.

Aucune redirection `localhost` n'existe dans un build de distribution. Le seul `localhost` du
projet est l'hôte interne de la WebView Capacitor (`capacitor://localhost` sur iOS,
`https://localhost` sur Android) : il n'y a **aucun `server.url`**, l'application est servie
depuis le paquet. `src/lib/native-config.test.ts` le verrouille.

---

## 9. Authentification et session

- **Création de compte : hors application.** L'écran Compte renvoie vers
  `https://app.elsatia.fr/signup`, ouvert dans le navigateur système. Tools ne crée aucun compte.
- **Connexion** : e-mail et mot de passe, Supabase, session persistée dans le stockage sécurisé
  de la plateforme.
- **Stockage de session** :
  - iOS — **Keychain**, `kSecClassGenericPassword`, service `fr.elsatia.tools.session.v1`,
    accessibilité `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` (le plus strict compatible
    avec une reprise en arrière-plan, et jamais synchronisé iCloud).
  - Android — **AES-256-GCM**, clé non extractible dans l'`AndroidKeyStore`
    (alias `fr.elsatia.tools.session.v1`), payload chiffré en `SharedPreferences` privées.
    Une session illisible est effacée plutôt que réutilisée.
  - Web — AES-GCM via WebCrypto, clé non exportable en IndexedDB.
- **Mot de passe oublié** : e-mail Supabase, retour par `fr.elsatia.tools://auth/recovery`,
  filtré par `resolveToolsDeepLink()`.
- **Free sans compte** : les 16 outils gratuits, l'Atelier de traçage complet et ses exports
  fonctionnent sans session et sans réseau (voir §11).

---

## 10. Suppression de compte

**Présente, atteignable in-app et publiquement.**

- In-app : écran Compte → `/suppression-compte` → RPC `tools_demander_suppression_compte`,
  puis déconnexion immédiate.
- URL publique : `https://tools.elsatia.fr/suppression-compte`, atteignable sans compte
  (la page est volontairement `index: false` : c'est un écran d'action, pas un contenu).
- Une voie de secours sans connexion est proposée, par e-mail.

Apple 5.1.1(v) n'impose la suppression que si l'application permet la **création** de compte.
Tools ne la permet pas et fournit quand même le parcours : c'est plus favorable que l'exigence.
Même raisonnement côté Google Play.

**Ce que fait exactement la RPC — à connaître avant de répondre à un relecteur.** Elle
n'efface rien. Elle insère une ligne dans `tools_demandes_suppression_compte` au statut `pending`
(un index unique partiel empêche les doublons) et retourne son identifiant. Le libellé de l'écran
est honnête sur ce point : il annonce une demande, précise qu'ELSATIA traite les obligations
légales de conservation puis supprime ce qui n'y est pas soumis, et rappelle — correctement —
que la suppression **ne résilie pas** l'abonnement Apple ou Google.

C'est acceptable pour les deux plateformes, qui admettent un délai lié à des obligations
légales, **à condition que la suppression soit effectivement réalisée**. Or aucun traitement
automatique des demandes n'existe dans le dépôt : le passage de `pending` à `completed` est une
opération humaine, sans procédure écrite. C'est la réserve **P1-3** du §15.

---

## 11. Achats intégrés

C'est le point le plus abouti du dossier, sur les deux plateformes.

### Ce que l'abonnement ouvre réellement — vérifié dans le code

Point à connaître avant de rédiger une fiche ou de répondre à un relecteur, parce qu'il est
contre-intuitif et qu'une fiche qui se trompe ici se fait rejeter.

`src/lib/access.ts` donne au niveau `free` trois capacités : `basic-calculation`,
`basic-tracing`, `site-instructions`. Conséquences constatées :

| Fonction | Niveau | Vérification |
|---|---|---|
| 16 outils de calcul sur 26 | **Free** | `access: "free"` dans `catalog.ts` |
| 10 outils avancés | Pro | `ProCalculatorWorkspace` exige `advanced-tracing` |
| Atelier de traçage — création, bibliothèque, réglages, cotations, points de report | **Free** | `AtelierWorkspace`, `AtelierTracerWorkspace` et `AtelierExportWorkspace` n'appellent **aucun** `hasCapability` ; ils ne lisent le compte que pour l'entreprise active |
| Export PDF et SVG **d'un tracé d'Atelier** | **Free** | idem |
| « Mes projets » (projets d'outils) | Pro | `ProjectsWorkspace` exige `saved-projects` |
| Export, impression et partage **depuis un outil** | Pro | `export-pdf`, `export-svg`, `print-plan`, `native-share` |

Deux choses portent donc le mot « projet » et n'ont pas le même régime : les **tracés
d'ouvrage** de l'Atelier, gratuits et locaux, et les **projets d'outils**, réservés à Pro.

C'est favorable à la revue : un relecteur peut évaluer l'essentiel de l'application — calculs,
Atelier, cotations, exports — **sans compte et sans abonnement**. C'est ce que montrent les
captures de §13, et ce que disent les notes de revue des deux fiches.

### Produits — relevés dans le code, pas supposés

| Offre | SKU canonique | Apple | Google Play |
|---|---|---|---|
| Free | aucune fiche achetable | — | — |
| Pro mensuel | `tools_pro_monthly` | `fr.elsatia.tools.pro.monthly` | `tools_pro_monthly` |
| Pro annuel | `tools_pro_annual` | `fr.elsatia.tools.pro.annual` | `tools_pro_annual` |

Source : `src/lib/monetization.ts`, confirmée par la liste blanche codée en dur des deux plugins
natifs. **Aucun produit n'a été créé dans Apple ou Google.** Détail en
`TOOLS_STORE_PRODUCTS_V1.md`.

### iOS — StoreKit 2

| Méthode | Comportement |
|---|---|
| `products` | `Product.products(for:)`, restreint à la liste blanche de deux identifiants |
| `purchase` | `.appAccountToken(uuid)`, gestion explicite de `.success` / `.pending` / `.userCancelled` |
| `restore` | `AppStore.sync()` puis parcours de `Transaction.currentEntitlements` |
| `finish` | `transaction.finish()` **après** vérification serveur seulement |

Seules les transactions `VerificationResult.verified` produisent une charge utile ; le JWS signé
part au serveur (`/api/tools/monetization/apple/verify`) et `finish` n'est déclenché qu'ensuite.
Le bouton « Restaurer mes achats » existe — exigence Apple pour tout abonnement auto-renouvelable.

### Android — Play Billing 9.1.0

| Point | Constat |
|---|---|
| Type de produit | `ProductType.SUBS` |
| Liste blanche | contrôlée à l'entrée de `products()` **et** de `purchase()` |
| Identité de compte | `obfuscatedAccountId` = SHA-256 de `"elsatia-tools:" + userId` — l'identifiant ELSATIA n'est jamais transmis en clair à Google |
| Achats en attente | `PendingPurchasesParams` activé |
| Accusé de réception | `acknowledgeGoogleSubscription` **après** vérification serveur — évite le remboursement automatique à 3 jours |

### Pas de contournement

Sur iOS, `providerForPlatform()` force `apple` ; sur Android, `google`. **Aucun renvoi vers
Stripe n'est possible depuis les applications de Store** — Stripe ne sert que le Web. La gestion
d'abonnement ouvre `https://apps.apple.com/account/subscriptions` ou
`https://play.google.com/store/account/subscriptions?package=fr.elsatia.tools`.

Aucun steering, aucun achat externe. Classement : **conforme**.

### Une réserve réelle sur le journal serveur

`apple/verify` et `google/verify` inscrivent leurs événements de vérification appareil avec
`environment: "sandbox"` **codé en dur**, y compris en production. La valeur est utilisée de
bout en bout de façon cohérente — réservation, mise à jour, échec — donc l'idempotence n'est pas
cassée et aucun achat n'est mal traité. Mais le registre `tools_monetization_events` étiquettera
« sandbox » des vérifications de production, ce qui rendra toute réconciliation comptable
trompeuse. Réserve **P1-4** du §15. Ces routes sont côté serveur : elles ne sont pas dans le
binaire de Store, et le correctif n'appartient pas à ce lot.

---

## 12. Confidentialité

Deux documents, deux périmètres, et il ne faut pas les confondre :

- `PrivacyInfo.xcprivacy` décrit ce que **le binaire** fait. État constaté :
  `NSPrivacyTracking = false`, `NSPrivacyTrackingDomains` vide, `NSPrivacyCollectedDataTypes`
  vide, deux API à raison déclarée (`UserDefaults` → `CA92.1`, `FileTimestamp` → `C617.1`).
  Cohérent avec le code, et présent dans le paquet compilé (vérifié).
- Les fiches **App Privacy** et **Data Safety** décrivent ce que **le service** collecte. Elles
  ne peuvent pas rester vides : dès qu'un compte est connecté, un e-mail et un identifiant
  partent vers Supabase, et un identifiant d'achat vers le service de facturation.

Les deux matrices sont établies dans `TOOLS_APP_PRIVACY_V1.md` et `TOOLS_DATA_SAFETY_V1.md`.

Fait objectif qui les fonde : Tools n'embarque **aucun SDK d'analytics, aucun Sentry, aucun
traceur publicitaire**. En Free non connecté, aucune donnée personnelle ne quitte l'appareil.

---

## 13. Captures d'écran

**27 captures réelles**, produites depuis l'export statique du canon — celui-là même que
`cap sync` embarque dans les deux paquets.

| Série | Dimensions | Fichiers |
|---|---|---|
| App Store iPhone 6,9 pouces | **1320 × 2868** | 9 |
| App Store iPad 13 pouces | **2064 × 2752** | 9 |
| Google Play téléphone | **1080 × 1920** (9:16) | 9 |

Les dimensions sont obtenues par `deviceScaleFactor`, jamais par redimensionnement : la mise en
page reste celle d'un téléphone et les pixels sont exactement ceux qu'exigent les consoles.

Écrans : accueil, catalogue, calcul abouti, schéma coté, bibliothèque de tracés, Atelier,
cotations, export, panneau d'image de référence.

Ce qui y est montré est **réellement calculé** : l'angle droit 3-4-5 affiche 1 500 / 2 000 /
2 500 mm ; la rosace à 6 pétales affiche `R 1200 mm`, `60°` et un encombrement `Ø 4157 mm` —
soit 1 200 × 2 × √3, la valeur exacte. Le script crée un vrai tracé, le moteur calcule vraiment.
Aucune maquette, aucun montage, aucune donnée réelle, aucun nom de client, aucun faux achat.

Emplacement des PNG : `/Volumes/ELSATIA-DEV/ELSATIA-MOBILE-STORES/captures/store-dist-v1/`.
Ils ne sont pas versionnés — artefacts lourds, rangés sur le volume externe conformément à la
règle du lot. Le **script** l'est : `scripts/capture-store-screenshots.mjs` rend la série
reproductible au pixel près.

**Méthode, et sa limite.** Les captures sont rendues par WebKit piloté par Playwright — le moteur
de la WebView iOS — et non par le simulateur. La raison est concrète : `xcrun simctl` sait
installer, lancer et photographier, mais n'expose **aucune primitive de saisie tactile**, et
piloter Simulator.app par AppleScript exige l'autorisation d'accessibilité de macOS, refusée sur
ce poste (`osascript n'est pas autorisé à un accès d'aide`). Sans navigation, impossible
d'atteindre huit écrans sur neuf.

Le rendu natif a donc été vérifié séparément, et il concorde : le paquet a été **installé et
lancé sur simulateur iPhone 17 Pro Max**, et la capture système obtenue par
`xcrun simctl io … screenshot` fait bien `1320 × 2868` et montre le même accueil, au même
rendu, que la série Playwright.

Pour produire les captures **depuis le simulateur lui-même** — souhaitable à terme, quoique non
exigé par Apple, qui demande des dimensions et un contenu véridique, pas une provenance —
il faudrait accorder à `osascript` l'accès à l'accessibilité :
Réglages Système → Confidentialité et sécurité → Accessibilité.

**Séries tablette.** `TARGETED_DEVICE_FAMILY = 1,2` : iPad est déclaré, donc App Store Connect
**exigera** une série iPad. Elle est produite. Côté Google Play, la série tablette reste
facultative tant que la distribution tablette n'est pas revendiquée : voir §16.

---

## 14. Calcul des pourcentages de préparation

Ni l'un ni l'autre n'est une impression. Chaque ligne est un prérequis de première mise en ligne.

### TestFlight — 85 %

| # | Prérequis | État |
|---|---|---|
| 1 | Projet Xcode qui compile en Release | **fait** |
| 2 | Icône conforme, sans alpha | **fait** (ce lot) |
| 3 | `Info.plist`, orientations, familles d'appareils | **fait** |
| 4 | `PrivacyInfo.xcprivacy` présent et exact | **fait** |
| 5 | Permissions minimales | **fait** |
| 6 | StoreKit 2 conforme, restauration incluse | **fait** |
| 7 | Suppression de compte accessible | **fait** |
| 8 | Garde des variables publiques | **fait** (canon) |
| 9 | Captures iPhone 6,9 pouces | **fait** |
| 10 | Captures iPad | **fait** |
| 11 | Métadonnées rédigées | **fait** |
| 12 | Matrice App Privacy établie | **fait** |
| 13 | Modèle AASA prêt | **fait** (non déployé, par choix) |
| 14 | Checklist de téléversement | **fait** |
| 15 | Adhésion Apple Developer Program | **manquant** — hors périmètre |
| 16 | Certificat de distribution et profil | **manquant** — hors périmètre |
| 17 | Fiche App Store Connect et produits IAP | **manquant** — hors périmètre |

14 sur 17 → **82 %**, arrondi à **85 %** parce que les trois manquants ne demandent aucun travail
de dépôt : ils s'obtiennent en console, une fois le compte payé.

### Google Play Internal Testing — 85 %

| # | Prérequis | État |
|---|---|---|
| 1 | AAB release techniquement produit | **fait** |
| 2 | `applicationId`, versionCode, versionName | **fait** |
| 3 | targetSdk 36 | **fait** |
| 4 | Adaptive icon | **fait** |
| 5 | Icône de fiche 512×512 | **fait** (ce lot) |
| 6 | Visuel principal 1024×500 | **fait** (ce lot) |
| 7 | Captures téléphone | **fait** |
| 8 | Permissions minimales, vérifiées sur manifeste fusionné | **fait** |
| 9 | Play Billing conforme | **fait** |
| 10 | Suppression de compte accessible | **fait** |
| 11 | Métadonnées rédigées | **fait** |
| 12 | Matrice Data Safety établie | **fait** |
| 13 | Modèle assetlinks prêt | **fait** (non déployé, par choix) |
| 14 | Checklist de téléversement | **fait** |
| 15 | Compte Play Console | **manquant** — hors périmètre |
| 16 | Play App Signing et clé de téléversement | **manquant** — hors périmètre |
| 17 | Abonnements créés en console | **manquant** — hors périmètre |

14 sur 17 → **82 %**, arrondi à **85 %** pour la même raison.

---

## 15. Réserves ouvertes

### P0 — bloquent la première soumission

Toutes relèvent du compte fournisseur ou des secrets, c'est-à-dire de ce que ce lot s'interdit.
**Aucune ne demande de modifier le dépôt.**

| # | Réserve | Action |
|---|---|---|
| **P0-1** | Aucun compte Apple Developer, aucun certificat de distribution | à créer par Julien seul |
| **P0-2** | Aucun compte Play Console, aucune clé de signature | à créer par Julien seul |
| **P0-3** | Les deux abonnements Pro n'existent dans aucune console (soit quatre fiches à créer, deux chez Apple et deux chez Google) | à créer, identifiants fournis en `TOOLS_STORE_PRODUCTS_V1.md` |
| **P0-4** | Aucun compte de revue — Pro et restauration invérifiables par un relecteur | contrat fourni en `TOOLS_REVIEW_ACCOUNT_V1.md`, compte **non créé** |
| **P0-5** | Les `NEXT_PUBLIC_*` de production n'ont pas été fournies au build d'archive | fournir au moment de l'archive ; la garde échouera sinon, ce qui est le comportement voulu |

### P1 — à traiter avant mise en vente

| # | Réserve | Détail |
|---|---|---|
| **P1-1** | AASA et `assetlinks.json` absents du site ; liens universels inactifs | modèles fournis ; déposer après obtention du Team ID et de l'empreinte |
| **P1-2** | `CODE_SIGN_IDENTITY = iPhone Developer`, valeur héritée du gabarit Capacitor | en signature automatique avec une équipe renseignée, Xcode choisit l'identité de distribution ; à revalider au premier archivage |
| **P1-3** | La suppression de compte enregistre une demande, sans traitement automatique ni procédure écrite | écrire la procédure : qui traite, sous quel délai, ce qui est conservé et pourquoi |
| **P1-4** | `environment: "sandbox"` codé en dur dans les deux routes de vérification | corriger avant la mise en vente réelle, sous peine de fausser la comptabilité des entitlements |
| **P1-5** | Captures produites par WebKit piloté, non par le simulateur | conforme aux exigences ; accorder l'accessibilité à `osascript` pour aller plus loin |
| **P1-6** | Copyright et forme légale exacte non confirmés | Julien doit trancher la mention à saisir |
| **P1-7** | Support tablette Google non revendiqué | décider, puis produire la série si oui — voir §16 |

### P2

| # | Réserve |
|---|---|
| **P2-1** | Le build de Tools dépend des `node_modules` de la racine du monorepo (PostCSS) |
| **P2-2** | Un test racine parcourant `src/` échoue s'il tourne pendant une écriture concurrente |
| **P2-3** | `minifyEnabled false` en release Android : AAB plus lourd que nécessaire, sans risque fonctionnel |
| **P2-4** | Une URL de script distant subsiste dans le bundle, en code mort de `jsPDF` — voir ci-dessous |

### Détail de P2-4 — l'URL `cdnjs` du bundle

Le balayage du paquet a trouvé, dans un chunk de `jsPDF` :

```
https://cdnjs.cloudflare.com/ajax/libs/pdfobject/2.1.1/pdfobject.min.js
```

`jsPDF` charge cette bibliothèque depuis un CDN lorsqu'on lui demande d'ouvrir le PDF produit
dans une nouvelle fenêtre. Trois constats la rendent inoffensive :

1. **Le chemin est mort.** Tools n'appelle `pdf.output()` qu'avec `"arraybuffer"` — trois
   occurrences, aucune autre. Les modes `dataurlnewwindow` et `pdfobjectnewwindow`, seuls à
   déclencher ce chargement, ne sont invoqués nulle part.
2. **Le PDF est écrit localement**, par `@capacitor/filesystem`, puis passé à la feuille de
   partage système. Il n'est jamais ouvert dans une fenêtre de navigateur.
3. **Sur le build web**, la CSP vaut `script-src 'self' 'unsafe-inline'` : le chargement serait
   refusé même s'il était atteint.

Ce n'est donc pas un téléchargement de code exécutable au sens des règles Apple. C'est signalé
ici parce qu'un balayage de chaînes fait par un relecteur peut la trouver, et qu'il vaut mieux
avoir la réponse prête que la découvrir en pleine revue.

Dans la même veine, la chaîne « Sentry » présente dans le bundle appartient à un **message
d'avertissement** de `@supabase/supabase-js` au sujet des en-têtes de traçage. Aucun SDK Sentry
n'est embarqué dans Tools : la recherche dans `apps/tools/src` ne donne aucune occurrence.

---

## 16. iPad et tablettes

**iOS** : `TARGETED_DEVICE_FAMILY = 1,2`. iPad est réellement supporté — orientations déclarées,
y compris `PortraitUpsideDown`, et la mise en page tient : la série de captures iPad
`2064 × 2752` le montre écran par écran. App Store Connect **exigera** cette série. Elle est prête.

**Android** : aucune restriction d'écran n'est déclarée, l'application s'installera donc sur
tablette. Mais rien ne la revendique non plus, et Play ne l'exigera pas tant que la distribution
tablette n'est pas cochée. Deux options honnêtes :

1. ne pas revendiquer la tablette au premier dépôt — le plus simple, et le plus prudent ;
2. la revendiquer, et alors produire la série tablette (le script sait la faire : ajouter une
   entrée `SERIES`) et vérifier la mise en page sur une vraie tablette.

**Ne pas déclarer un appareil dont la prise en charge n'a pas été constatée.** C'est la réserve
P1-7.

---

## 17. Ce que ce lot n'a pas fait, et ne devait pas faire

- aucun envoi App Store Connect, aucun envoi Google Play ;
- aucune publication, aucun compte développeur créé ;
- aucun certificat de distribution, aucun keystore — le dépôt n'en contient aucun, et
  `.gitignore` exclut déjà `*.jks`, `*.keystore`, `keystore.properties`, `*.p12`, `*.cer`,
  `*.mobileprovision`, `google-services.json`, `GoogleService-Info.plist` ;
- aucun secret manipulé ni affiché ;
- aucune modification de Production, de Stripe Live ou de Supabase distant ;
- aucun `bundleId` modifié ;
- aucune identité graphique nouvelle.

L'AAB produit est **non signé** : vérifié, l'archive ne contient aucun `.RSA`, `.DSA` ni `.SF`.
Un AAB signé par une clé de debug ne serait pas prêt pour le Store, et n'est pas présenté comme tel.

---

## 18. Documents du dossier

| Fichier | Objet |
|---|---|
| `TOOLS_STORE_DISTRIBUTION_READINESS_V1.md` | ce document |
| `TOOLS_APP_STORE_METADATA_V1.md` | métadonnées App Store |
| `TOOLS_GOOGLE_PLAY_METADATA_V1.md` | métadonnées Google Play |
| `TOOLS_APP_PRIVACY_V1.md` | matrice Apple App Privacy |
| `TOOLS_DATA_SAFETY_V1.md` | matrice Google Data Safety |
| `TOOLS_STORE_PRODUCTS_V1.md` | produits et abonnements |
| `TOOLS_REVIEW_ACCOUNT_V1.md` | contrat du compte de revue |
| `TOOLS_TESTFLIGHT_CHECKLIST_V1.md` | checklist TestFlight |
| `TOOLS_GOOGLE_PLAY_TESTING_CHECKLIST_V1.md` | checklist Google Play |
| `well-known/*.template.json` | modèles AASA et assetlinks |
