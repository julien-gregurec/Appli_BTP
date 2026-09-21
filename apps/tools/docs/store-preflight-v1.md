# ELSATIA Tools — préflight Store et TestFlight — V1

**Base** : `integration/tools-store-distribution-readiness-v1` — `fe8794f`
**Branche** : `release/tools-store-preflight-v1`
**Date** : 7 septembre 2026

Ce lot fait passer Tools de « techniquement préparé » à « prêt pour un vrai test TestFlight et
Google Play Internal Testing ». Aucune soumission publique, aucun upload, aucun compte
développeur, aucun certificat, aucun keystore, aucun secret, aucune modification de Production.

Légende des états : **VALIDÉ** (fait et vérifié ici) · **AUTOMATIQUE** (le dépôt s'en charge
désormais) · **ACTION JULIEN** (hors de portée d'une machine : compte, secret, décision) ·
**BLOQUÉ** (empêche l'étape suivante).

---

## 0. Verdict

| Cible | Verdict |
|---|---|
| TestFlight | **NOT READY** — bloqué par le backend Production, pas par le dépôt |
| Google Play Internal Testing | **NOT READY** — même blocage |

Le code, lui, est prêt. Ce qui manque est en §6 et §7 : les migrations Tools ne sont pas en
Production, et le prix de Tools Pro n'existe nulle part.

---

## 1. Correction d'un rapport précédent

Le rapport `ELSATIA-TOOLS-STORE-DISTRIBUTION-READINESS-V1` classait `environment: "sandbox"` en
**P1 de comptabilité**, en écrivant que « l'idempotence n'est pas cassée et aucun achat n'est mal
traité ». **C'était faux, et la sous-estimation était sérieuse.** Ce rapport-là n'avait regardé
que les quatre routes ; le verrou décisif était dans `src/lib/tools-native-monetization.ts`, qui
n'avait pas été lu.

Ce que le code faisait réellement, en trois endroits structurants :

```ts
// 1. le vérificateur n'était construit QUE pour le bac à sable
return new SignedDataVerifier(roots, true, Environment.SANDBOX, APP_ID);

// 2. toute transaction hors bac à sable était rejetée
if (transaction.environment !== Environment.SANDBOX || …) throw new Error("Transaction Apple hors sandbox…");

// 3. et toute notification aussi
if (notification.data?.environment !== Environment.SANDBOX) throw new Error("Notification Apple hors sandbox");
```

Conséquence : **un abonnement App Store réellement acheté n'aurait jamais ouvert Tools Pro.**
Une transaction de production arrive avec `environment = Production` ; elle était refusée. Les
App Store Server Notifications V2 de production tombaient sur le même verrou. Ce n'était pas une
étiquette de registre inexacte : c'était une panne de monétisation complète en vente réelle.

Le type `ToolsEventReservation.environment` valait `"test" | "sandbox"` — `"production"` n'était
pas même exprimable, alors que le schéma SQL l'accepte depuis l'origine
(`check (environment in ('test','sandbox','production'))`). C'est ce trou de typage qui rendait le
défaut invisible à la relecture.

---

## 2. Sélection d'environnement Store — **VALIDÉ**

Nouveau module `src/lib/tools-store-environment.ts`. Trois règles :

| Règle | Comportement |
|---|---|
| Déclaration | `TOOLS_STORE_ENVIRONMENT` = `sandbox` \| `production` |
| Valeur inconnue | **erreur, dans tous les modes** — une faute de frappe se découvre en local, pas en vente |
| Valeur absente | `sandbox` hors production ; **erreur en runtime de production**. Aucun repli silencieux |
| Environnement inscrit | celui que le fournisseur a **signé**, pas celui qu'espère le déploiement |
| Transaction bac à sable sur déploiement production | refusée, sauf `TOOLS_STORE_ALLOW_SANDBOX=true` |
| Transaction production sur déploiement bac à sable | **toujours refusée** |

La dérogation `TOOLS_STORE_ALLOW_SANDBOX` n'est pas une facilité : une build **TestFlight branchée
sur le backend de production achète en bac à sable**. Sans cette porte, la phase de test d'achat
serait impossible. Elle est fermée par défaut et doit se refermer à la mise en vente.

Côté Apple, l'environnement se lit désormais sur la transaction **vérifiée**. Le choix du
vérificateur passe par une lecture non vérifiée du JWS — commentée comme telle — dont la seule
fonction est d'instancier le bon `SignedDataVerifier` ; c'est ensuite lui qui fait foi, et un JWS
qui mentirait échouerait à la vérification.

Côté Google, aucun environnement n'est signé : un achat de testeur de licence et un achat réel
sont indiscernables. C'est donc le déploiement qui tranche, résolu **une seule fois par requête**
pour que la réservation, la mise à jour et l'échec visent la même ligne de registre.

Comme toutes les clés d'unicité du schéma portent `environment`, une phase TestFlight et une vente
réelle cohabitent sans collision.

### Stripe — pas touché, et pour une bonne raison

Le webhook Stripe de Tools inscrit `"test"` en dur. Ce n'est **pas** le même défaut : la route
refuse `livemode` et Connect, et exige `config.testMode`. Elle ne peut traiter que des événements
d'essai, et le registre doit le dire. Le comportement est inchangé ; seul un commentaire a été
ajouté pour que la prochaine relecture ne « corrige » pas une intention.

### Tests — 21 cas, **VALIDÉ**

`src/lib/tools-store-environment.test.ts` (17 cas) et les cas ajoutés à
`tools-native-monetization.test.ts` couvrent : valeur déclarée, espaces, défaut hors production,
**refus de deviner en production**, valeur inconnue dans les quatre modes, absence de fuite de la
valeur dans le message d'erreur, les quatre combinaisons de la politique d'acceptation, la
tolérance exacte de `TOOLS_STORE_ALLOW_SANDBOX`, la lecture d'environnement Apple (transaction et
notification), et le refus d'un environnement inconnu plutôt qu'un choix par défaut.

---

## 3. Suppression de compte — contrat

### Ce que le code fait réellement — **VALIDÉ**

`tools_demander_suppression_compte()` insère une ligne `pending` dans
`tools_demandes_suppression_compte` (index unique partiel contre les doublons) et retourne son
identifiant. **Elle n'efface rien**, et l'écran le dit sans détour.

### Défaut d'UX corrigé — **VALIDÉ**

`requestAccountDeletion()` déconnecte l'utilisateur dès la demande enregistrée — ce qui est
correct. Mais l'écran suivait `account.user`, qui repassait à `null` : l'utilisateur cliquait
« Demander la suppression » et voyait apparaître **« Connectez-vous d'abord »**. Aucune
confirmation, et un message suggérant l'échec exact de ce qui venait de réussir. Un relecteur
Apple ou Google testant ce parcours en aurait conclu que la suppression ne fonctionne pas — motif
de rejet direct.

L'écran tient désormais un état `submitted` local qui l'emporte sur l'état de session, et affiche
une confirmation `role="status"` : demande enregistrée, déconnexion expliquée, rappel que
l'abonnement Store reste actif, lien vers l'assistance.

### Contrat de suppression — à arrêter par Julien

| | Donnée | Traitement proposé | État |
|---|---|---|---|
| **A** | Projets et tracés Tools cloud, cache d'entitlement, préférences | suppression | **ACTION JULIEN** — à confirmer |
| **B** | Journal `tools_monetization_events` (`user_id` est déjà `on delete set null`) | anonymisation, l'événement survit sans son porteur | **ACTION JULIEN** |
| **C** | Pièces comptables liées à un abonnement payé (factures, preuves d'achat) | conservation | **ACTION JULIEN / EXPERT-COMPTABLE** |
| **D** | Durée de conservation de C | **non déterminée** — dépend d'obligations légales françaises que ce lot ne peut pas inventer | **ACTION JULIEN / AVOCAT** |
| **E** | Suppression `auth.users` | déclenche la cascade sur `tools_monetization_customers`, `tools_monetization_subscriptions`, `tools_demandes_suppression_compte` et les tables r8 | **ACTION JULIEN** |
| **F** | Révocation des sessions | `signOut({ scope: "local" })` ferme l'appareil courant ; une révocation globale reste à décider | **ACTION JULIEN** |
| **G** | Données Gestion Pro du même compte | le compte ELSATIA est **commun** : la suppression déborde de Tools | **ACTION JULIEN** |
| **H** | Abonnement Store en cours | ni Apple ni Google ne le résilient ; l'écran le dit déjà correctement | **VALIDÉ** |

**Aucun traitement automatique n'existe** : le passage de `pending` à `completed` est une opération
humaine, sans procédure écrite. C'est la réserve qui reste ouverte.

### URL publique — **VALIDÉ**

`https://tools.elsatia.fr/suppression-compte` répond **200** sans session (vérifié). Le texte ne
promet aucune suppression instantanée.

---

## 4. Signature

### Apple — **ACTION JULIEN**

| Élément | Constat |
|---|---|
| `CODE_SIGN_STYLE` | `Automatic` |
| `CODE_SIGN_IDENTITY` | `iPhone Developer` — valeur héritée du gabarit Capacitor |
| `DEVELOPMENT_TEAM` | **absent** |
| Fichier `.entitlements` | **aucun** — normal : l'achat intégré est une capacité d'App ID, pas un entitlement |
| Build Release non signé | **BUILD SUCCEEDED**, étape `Validate … -validate-for-store` verte |

Rien n'a été inventé : aucun Team ID, aucun certificat, aucun profil.

### Android — **VALIDÉ** (configuration) / **ACTION JULIEN** (clé)

`android/app/build.gradle` porte désormais une configuration de signature de release qui lit,
dans l'ordre : `android/keystore.properties`, puis les variables
`ELSATIA_TOOLS_KEYSTORE_FILE`, `ELSATIA_TOOLS_KEYSTORE_PASSWORD`, `ELSATIA_TOOLS_KEY_ALIAS`,
`ELSATIA_TOOLS_KEY_PASSWORD`.

Sans clé, `signingConfig` reste **nul** et l'AAB sort **non signé** — vérifié : aucun `.RSA`,
`.DSA` ni `.SF` dans l'archive. Le build ne doit jamais échouer faute de clé, mais il ne doit
jamais non plus prétendre en avoir une.

Une tâche de diagnostic a été ajoutée, qui n'imprime jamais un chemin, un alias ou un mot de passe :

```
./gradlew :app:signingStatus
```

Les deux états ont été éprouvés : `NON SIGNEE` sans clé, `SIGNEE` avec des variables factices.
**Aucun keystore n'a été créé.** `.gitignore` exclut déjà `*.jks`, `*.keystore`,
`keystore.properties`, `*.p12`, `*.mobileprovision`, `google-services.json`.

### `xcode-select` — **ACTION JULIEN**

L'intégration simulateur de Claude Code reste refusée. Diagnostic précis :

```
xcode-select -p                   → /Applications/Xcode.app/Contents/Developer   (correct)
readlink /var/db/xcode_select_link → (vide)                                       ← la cause
```

Le lien système n'existe pas. Commande exacte, qui exige le mot de passe de Julien :

```
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

En attendant, le simulateur a été piloté par `xcrun simctl`, qui fonctionne : création, démarrage,
installation, lancement et capture. Seule l'injection tactile manque.

---

## 5. Produits Store

Identifiants relevés dans le code, inchangés : `tools_pro_monthly` /
`fr.elsatia.tools.pro.monthly` et `tools_pro_annual` / `fr.elsatia.tools.pro.annual`.
La liste blanche est répétée en dur dans les deux plugins natifs : un produit créé en console qui
n'y figurerait pas ne serait jamais proposé à l'achat.

### Prix — **BLOQUÉ**

Le canon tarifaire du dépôt est `src/lib/tarification.canonical.json`, version
`CANONICAL-V3-2026-09` : **79 / 249 / 449 / 599 €** par mois, annuel = 10 × mensuel. La divergence
69 contre 79 est bien éteinte : le canon dit 79.

**Mais cette grille est celle d'ELSATIA Gestion Pro** — offres Mini, Pro, Business, Entreprise,
avec comptes inclus et prix par compte supplémentaire. Elle ne mentionne pas Tools, et le fichier
ne contient pas une seule occurrence du mot.

Recherche exhaustive : **le prix de Tools Pro n'existe nulle part** — ni dans le code (aucun prix
n'y est codé, ce qui est correct), ni dans le canon tarifaire, ni dans la documentation. On ne
peut pas créer un abonnement App Store ou Google Play sans prix. **ACTION JULIEN : arrêter le prix
mensuel et annuel de Tools Pro.**

---

## 6. Backend Production — **BLOQUÉ**

C'est le blocage décisif, et il ne se contourne pas.

| | Valeur |
|---|---|
| Migrations du dépôt | **263** |
| Dernière migration réputée appliquée en Production | `20260824000231_…` — **rang 223** |
| Écart documenté | **53 migrations** |

Or les migrations dont dépend tout le parcours d'achat et de suppression sont **après** cette
limite :

| Rang | Migration | Ce qu'elle apporte |
|---|---|---|
| 243 | `20260830000236_elsatia_tools_r8_comptes_entitlements_sync` | entitlements et synchronisation |
| **244** | `20260830000237_elsatia_tools_r9_monetisation` | `tools_monetization_events`, `_subscriptions`, `_customers`, RPC `tools_server_appliquer_abonnement` |
| 245 | `20260831000238_elsatia_tools_r10_publication_multientreprise` | multi-entreprise |
| **246** | `20260831000239_elsatia_tools_r10_suppression_compte` | RPC `tools_demander_suppression_compte` |
| 248 | `20260901000240_security_reconciliation_tools_entitlements_aal2_v1` | durcissement ACL |

Conséquences si une build était déposée aujourd'hui :

- la vérification d'achat échouerait — les tables n'existent pas ;
- la suppression de compte échouerait — la RPC n'existe pas ;
- un relecteur Apple ou Google testerait précisément ces deux parcours.

**STOP STORE UPLOAD.**

Réserve d'honnêteté : cette conclusion s'appuie sur la baseline **documentée** par
`docs/runbooks/ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md`, qui précise elle-même qu'elle
est « à reconfirmer en direct, jamais supposée ». Aucun accès Supabase distant n'existe sur ce
poste — pas de CLI `supabase`, aucune variable d'environnement — donc **le ledger live n'a pas été
lu**. ACTION JULIEN : confirmer le ledger réel avant toute décision contraire.

## 7. Cutover — **BLOCKER STORE**

Non réalisé, et ce lot ne l'exécute pas : il appartient à la conversation Production/Cutover.
Tant qu'il n'a pas eu lieu, TestFlight et Google Internal Testing avec achats sont impossibles.

---

## 8. Variables d'environnement — **VALIDÉ**

Aucune des variables de monétisation Tools n'était documentée. `.env.example` les porte désormais
toutes, avec leur criticité et leur format : `TOOLS_STORE_ENVIRONMENT`,
`TOOLS_STORE_ALLOW_SANDBOX`, `APPLE_ROOT_CA_BASE64`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`,
`GOOGLE_PLAY_RTDN_AUDIENCE`, `GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL`, `TOOLS_ALLOWED_ORIGINS`,
les quatre `STRIPE_TOOLS_*` et `TOOLS_APP_URL`.

Le garde de build public (`scripts/verify-public-env.mjs`, hérité du canon) reste en place : neuf
cas avaient été rejoués au lot précédent, dont le refus des clés de service et l'absence de repli
sur `ANON_KEY`. Il n'a pas été modifié ici.

Aucun `localhost` ne subsiste dans un build de distribution : le seul est l'hôte interne de la
WebView Capacitor, sans `server.url`, verrouillé par `native-config.test.ts`.

---

## 9. Achats — cloisonnement et entitlement — **VALIDÉ**

`providerForPlatform()` force `apple` sur iOS et `google` sur Android : **aucun renvoi vers Stripe
n'est possible depuis les applications de Store**. Stripe ne sert que le Web, et son webhook Tools
refuse `livemode`.

L'octroi de Tools Pro passe par `entitlementToAccess()`, qui n'accorde le niveau `pro` que depuis
un `ServerEntitlement` issu de la RPC `tools_resoudre_entitlements_entreprise`. Le cache local est
scellé par HMAC avec une clé du stockage sécurisé. **Aucun booléen frontend n'ouvre Pro.**

La restauration d'achat existe sur les deux plateformes (`AppStore.sync()` puis
`Transaction.currentEntitlements` côté Apple) et repasse par la vérification serveur. Elle n'est
pas testable de bout en bout sans compte Store réel : **test manuel**, listé dans les checklists.

---

## 10. Confidentialité et permissions — revalidés sur les artefacts

| Contrôle | Résultat |
|---|---|
| `PrivacyInfo.xcprivacy` **dans le paquet compilé** | présent ; `NSPrivacyTracking=false`, collecte vide, `UserDefaults`→CA92.1, `FileTimestamp`→C617.1 |
| Icône **dans `Assets.car`** | 1024×1024, `Opaque=True`, idioms phone et pad |
| Manifeste Android **fusionné release** | `INTERNET`, `BILLING`, `ACCESS_NETWORK_STATE`, permission interne AndroidX — aucune permission sensible |
| `Info.plist` | aucune chaîne d'usage caméra, photos, localisation, micro, contacts |

Les matrices App Privacy et Data Safety du lot précédent restent exactes : rien de ce qui est
collecté n'a changé.

---

## 11. Liens universels — **P1, non requis pour la V1**

Le parcours d'authentification n'en dépend pas : le retour de réinitialisation de mot de passe
passe par le schéma personnalisé `fr.elsatia.tools://auth/recovery`, déclaré sur les deux
plateformes et filtré par `resolveToolsDeepLink()`. Les liens universels n'apportent qu'un confort
d'ouverture depuis un lien web.

Vérifié : `/.well-known/apple-app-site-association` et `/.well-known/assetlinks.json` répondent
**404**, conformément à la décision de ne pas déployer de fichier à valeurs fictives. Les modèles
restent dans `docs/mobile-stores/tools/well-known/`.

**ACTION JULIEN** connexe : l'URL de redirection `fr.elsatia.tools://auth/recovery` doit figurer
dans les URL de redirection autorisées du projet Supabase, sinon l'e-mail de récupération refusera
le retour natif.

---

## 12. Captures d'écran — **VALIDÉ**

Les 27 captures du lot précédent restent valides : aucun des neuf écrans photographiés n'a changé
(la seule modification d'interface de ce lot est l'écran de suppression, qui n'y figure pas).

Contenu revérifié : interfaces réelles, valeurs réellement calculées, aucune donnée personnelle,
aucun nom de client, aucun faux achat. Le partage Free/Pro est respecté — les captures montrent
l'Atelier et ses exports, **qui sont gratuits**, et l'outil photographié porte la mention
« GRATUIT ».

### Conformité du rendu WebKit, mesurée

Le paquet a été installé et lancé sur simulateur iPhone 17 Pro Max, puis photographié par
`xcrun simctl io … screenshot`. Comparaison avec la capture WebKit correspondante, après
alignement automatique sur le décalage de la barre d'état :

```
décalage vertical optimal        : 186 px (barre d'état iOS)
différence moyenne absolue       : 3,29 / 255 par pixel — 1,29 %
```

Les deux rendus sont équivalents. **La série existante n'a pas à être refaite.**

Réserve technique : le cache Playwright (`~/Library/Caches/ms-playwright`) a disparu du poste
entre les deux lots ; `scripts/capture-store-screenshots.mjs` exige donc un
`npx playwright install webkit chromium` avant toute régénération. Préférer
`PLAYWRIGHT_BROWSERS_PATH` sur le volume externe.

---

## 13. Métadonnées, copyright, URL

| Élément | État |
|---|---|
| Textes Apple et Google | **VALIDÉ** — corrigés au lot précédent (Atelier et exports annoncés comme gratuits) |
| Support / Marketing / Privacy / Suppression / CGU / Mentions légales / Inscription | **VALIDÉ** — 7 URL contrôlées, **200** |
| Copyright | **ACTION JULIEN** — la forme légale exacte n'est pas tranchée. Ne pas écrire « © ELSATIA SAS » si cette société n'existe pas |
| Compte de revue `review@elsatia.fr` | **ACTION JULIEN** — contrat écrit, compte non créé ; sa création n'a de sens qu'une fois le backend au niveau (§6) |

---

## 14. Tests de ce lot

| Contrôle | Résultat |
|---|---|
| Tests Tools | **1991 PASS** |
| Tests racine | **828 PASS** (dont 22 nouveaux) |
| Typecheck Tools + racine | **PASS** |
| Lint Tools | **PASS** |
| Lint racine | 0 erreur, 3 avertissements `no-img-element` préexistants (Gestion Pro) |
| Build web Tools | **PASS** |
| `build:native` | **PASS** |
| `cap sync` iOS + Android | **PASS** |
| iOS Release non signé | **BUILD SUCCEEDED** + `Validate -validate-for-store` |
| Android `bundleRelease` | **BUILD SUCCESSFUL** — 5 265 910 octets, **non signé** vérifié |
| Scan de secrets | aucun |

### Un intermittent, identifié mais non corrigé

Deux passages de la suite racine, sur une quinzaine, ont signalé un ou deux échecs. Onze passages
consécutifs ensuite — dont plusieurs sous charge concurrente délibérée — donnent 828/828, et la
reproduction a échoué.

Le coupable est néanmoins identifié, par la trace relevée au lot précédent :
`src/lib/stripe-discount-legacy-surface.test.ts`. Ce test parcourt récursivement `src/` en
`readdirSync` + `statSync` + `readFileSync`. Entre l'énumération d'un répertoire et la lecture d'un
fichier, toute modification concurrente de l'arborescence — une écriture d'éditeur, un outil qui
remplace un fichier — le fait lever `ENOENT`. Sur un worktree hébergé sur volume externe, la
fenêtre est plus large qu'en interne.

**Ce test n'a délibérément pas été modifié.** Il appartient à la surface de sécurité Stripe de
Gestion Pro, sans rapport avec ce lot, et le durcir au passage — même d'une ligne — reviendrait à
toucher un garde de sécurité dans un lot Store, sans revue de son domaine. Il est signalé pour
qu'un lot compétent le rende robuste à la modification concurrente.

Conséquence pratique : **ne pas lancer la suite racine pendant qu'un build ou un éditeur écrit dans
`src/`.** Une exécution au calme est verte.

---

## 15. Ce qui reste

### BLOQUÉ

| # | Sujet | Levée |
|---|---|---|
| B-1 | Migrations Tools absentes de Production (rangs 244 et 246 contre baseline 223) | cutover Production, conversation dédiée |
| B-2 | Prix de Tools Pro inexistant | décision commerciale |

### ACTION JULIEN

| # | Sujet |
|---|---|
| J-1 | `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` |
| J-2 | Compte Apple Developer, Team ID, certificat de distribution, profil |
| J-3 | Compte Play Console, Play App Signing, clé de téléversement |
| J-4 | Confirmer le ledger Production réel |
| J-5 | Arrêter le contrat de suppression A→G, et écrire la procédure de traitement |
| J-6 | Créer `review@elsatia.fr` et son entreprise de démonstration |
| J-7 | Trancher le copyright et la forme légale |
| J-8 | Déclarer `fr.elsatia.tools://auth/recovery` dans les redirections Supabase |
| J-9 | Décider de la revendication tablette Google |
| J-10 | Créer les quatre fiches d'abonnement, une fois le prix arrêté |

### P2

| # | Sujet |
|---|---|
| P2-1 | `src/lib/stripe-discount-legacy-surface.test.ts` parcourt `src/` sans tolérer une modification concurrente — intermittent identifié, volontairement non corrigé ici |
| P2-2 | Cache Playwright absent du poste |
| P2-3 | `minifyEnabled false` en release Android |
| P2-4 | URL `cdnjs` en code mort de `jsPDF` (documentée au lot précédent, inatteignable) |
