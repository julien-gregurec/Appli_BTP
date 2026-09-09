# Coque native ELSATIA Gestion Pro — pilote interne

> **Cette coque n'est pas publiable en l'état.** Elle sert à éprouver Gestion Pro sur un
> appareil réel, en interne. Sa publication sur l'App Store ou Google Play exige un
> arbitrage explicite sur le point de sécurité décrit au § 1.

## 1. Le point à arbitrer avant toute publication

Gestion Pro ne peut pas produire de bundle statique (`output: "export"` impossible : CSP à
nonce par requête, session SSR par cookies, 55 fichiers d'actions serveur, 47 routes d'API).
La coque charge donc l'application **depuis le réseau** (`server.url`).

En mode `server.url`, Capacitor injecte son pont natif dans une page distante. Le code chargé
obtient l'accès aux interfaces natives déclarées. Or `src/lib/security/cookies.ts` pose
délibérément `httpOnly: false` — les clients Supabase navigateur doivent rafraîchir le cookie.

Correct dans un navigateur, où la CSP à nonce est une défense sérieuse. **Dans une coque, la
portée change** : une injection réussie n'atteindrait plus seulement la session, elle
atteindrait le système de fichiers de l'appareil.

Trois atténuations sont déjà en place dans `capacitor.config.ts` :

| Mesure | Effet |
|---|---|
| **Aucun plugin natif déclaré** | La coque présente l'application, elle ne lui donne aucun pouvoir supplémentaire |
| `allowNavigation` limité à l'hôte de l'application | Un lien sortant ne s'ouvre pas dans la coque avec le pont injecté |
| `limitsNavigationsToAppBoundDomains` (iOS), `cleartext: false` | Le contexte natif ne suit pas la navigation hors du domaine |

Elles réduisent le risque, elles ne le suppriment pas. La décision reste à prendre.

**Toute déclaration de plugin doit être arbitrée au regard de ce paragraphe**, jamais ajoutée
par commodité.

## 2. Ce qui n'est pas nécessaire, et pourquoi

La PWA couvre déjà, sans coque : installation sur l'écran d'accueil, plein écran, appareil
photo, GPS, notifications push (iOS ≥ 16.4 une fois installée), stockage local durable,
fonctionnement hors réseau.

**Le seul écart pour le périmètre V1 terrain est la présence sur les magasins.** Ce n'est pas
un besoin technique : c'est un besoin commercial, qui relève du calendrier de commercialisation.

## 3. Permissions — le minimum, et rien de plus

Aucune permission n'est demandée par la coque elle-même. Les capacités utilisées passent par la
WebView, qui demande l'autorisation au système comme le ferait un navigateur.

| Capacité | Demandée par | Déclaration native requise |
|---|---|---|
| Appareil photo | `<input capture>` de la page | iOS : `NSCameraUsageDescription` · Android : `CAMERA` |
| Position | `navigator.geolocation` de la page | iOS : `NSLocationWhenInUseUsageDescription` · Android : `ACCESS_FINE_LOCATION` |
| Notifications | Web Push via le service worker | Android 13+ : `POST_NOTIFICATIONS` |

Rien d'autre. Pas de microphone, pas de contacts, pas de position en arrière-plan, pas de
stockage externe. **Une permission déclarée « au cas où » est une permission que l'évaluateur
du magasin demandera de justifier**, et qu'un utilisateur verra dans la fiche produit.

Les textes d'usage iOS doivent expliquer l'usage réel, pas la fonction technique :

```
NSCameraUsageDescription
  Photographier un justificatif de dépense ou l'avancement d'un chantier.

NSLocationWhenInUseUsageDescription
  Attester le lieu de votre pointage d'arrivée et de départ.
```

## 4. Liens profonds

Deux gabarits sont servis par l'application web :

- `public/.well-known/apple-app-site-association` (iOS)
- `public/.well-known/assetlinks.json` (Android)

Ils sont **volontairement incomplets** : `TEAM_ID` et l'empreinte SHA-256 du certificat de
signature n'existent pas tant que les comptes développeur ne sont pas créés. Les renseigner
demande les gestes humains du § 6.

Tant qu'ils portent leurs valeurs de gabarit, les liens profonds **ne fonctionnent pas** — et
c'est préférable à une association mal formée, qu'iOS met en cache et qui devient pénible à
corriger.

## 5. Build reproductible

Prérequis : Node 24, Xcode 16+ (iOS), Android Studio + JDK 21 (Android).

```bash
# 1. Depuis mobile/capacitor
npm install

# 2. L'origine servie par la coque est OBLIGATOIRE et sans valeur par défaut.
#    Une coque compilée sur la mauvaise origine est indétectable une fois installée.
export ELSATIA_GP_NATIVE_URL="https://preview-xxxxx.vercel.app"   # jamais la Production en pilote

# 3. Création des projets natifs (une seule fois ; ils ne sont pas versés au dépôt)
npx cap add ios
npx cap add android

# 4. Synchronisation de la configuration
npm run native:preparer

# 5. Ouverture dans l'IDE natif
npm run native:ios       # ou : npm run native:android
```

Les projets `ios/` et `android/` ne sont **pas** versés au dépôt : ils sont entièrement
regénérables par `cap add`, et les verser ferait entrer dans Git des chemins absolus de la
machine qui les a créés.

### Icônes et écrans de lancement

Les 12 écrans de lancement iOS et les 4 icônes de l'application web sont réutilisables tels
quels :

```bash
# Depuis la racine de Gestion Pro
node scripts/mobile/generer-ecrans-lancement.mjs
```

Sortie : `public/ecrans-lancement/` et `public/icons/`.

## 6. Gestes humains restants — ce qu'une session de développement ne peut pas faire

| # | Geste | Bloque |
|---|---|---|
| 1 | Compte Apple Developer (99 $/an) | iOS |
| 2 | Compte Google Play Console (25 $ une fois) | Android |
| 3 | Certificat de distribution + profil de provisionnement iOS | iOS |
| 4 | Clé de dépôt Android (`keystore`) et sa conservation | Android |
| 5 | `TEAM_ID` iOS → `apple-app-site-association` | Liens profonds iOS |
| 6 | Empreinte SHA-256 du certificat → `assetlinks.json` | Liens profonds Android |
| 7 | Compte de relecture pour les évaluateurs des magasins | Les deux |
| 8 | Fiches produit, captures, politique de confidentialité, déclarations de collecte | Les deux |
| 9 | **Arbitrage explicite sur le mode `server.url`** (§ 1) | Les deux |

Les points 1 à 4 et 7 ont déjà été défrichés pour ELSATIA Tools par le lot
`ELSATIA-MOBILE-STORES` (`b3b91d8`) : les gestes y sont documentés et sont les mêmes ici.

**Aucun compte, certificat ou secret n'a été créé dans ce lot. Rien n'a été publié.**
