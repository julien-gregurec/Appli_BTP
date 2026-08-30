# Architecture native ELSATIA Tools

## Décision R4

ELSATIA Tools utilise **Capacitor 8.5** autour de la base Next.js 16 existante. Cette solution conserve un seul catalogue, un seul moteur de calcul et les mêmes composants pour le Web, iOS et Android. Une réécriture Swift/Kotlin ou deux applications indépendantes dupliqueraient inutilement la logique métier.

La distribution repose sur deux sorties distinctes :

- Web/PWA : build Next.js habituel, SEO et service worker `sw-tools.js` ;
- iOS/Android : export statique Next.js dans `out/`, copié par Capacitor dans le paquet natif.

Le fichier Capacitor ne contient volontairement aucun `server.url`. L’application native démarre donc sur ses ressources locales et ne dépend pas de `tools.elsatia.fr` pour les 16 outils essentiels.

## Arborescence

```text
apps/tools/
├── src/                    base Web et métier partagée
├── public/                 PWA et ressources Web
├── native-assets/          sources graphiques validables
├── capacitor.config.ts     configuration commune
├── android/                projet Android Studio
└── ios/                    projet Xcode / Swift Package Manager
```

Les fichiers `calculations`, `geometry`, `units`, `catalog`, `access`, `tool-engine`, `diagram-model` et `promotions` ne sont pas dupliqués dans les projets natifs.

## Identité et versions

- bundle identifier iOS : `fr.elsatia.tools` ;
- applicationId Android : `fr.elsatia.tools` ;
- nom affiché : `ELSATIA Tools` ;
- version de lancement préparée : `1.0.0` ;
- build iOS initial : `1`, à incrémenter à chaque archive distribuée ;
- Android `versionCode` initial : `1`, à incrémenter à chaque AAB distribué.

Le domaine `elsatia.fr` correspond à l’identité existante. La disponibilité définitive de l’identifiant devra néanmoins être vérifiée dans Apple Developer et Play Console avant création des fiches Store.

## Prérequis

- Node.js 22 ou supérieur ;
- Android Studio 2025.2.1 ou supérieur, SDK Android et JDK fourni par Android Studio ;
- macOS + Xcode 26 ou supérieur pour iOS ;
- aucun certificat ou compte Store n’est nécessaire pour synchroniser le projet.

Capacitor 8 cible iOS 15+ et Android API 24+. Le projet généré compile/targete actuellement Android API 36.

## Commandes

```bash
# Web
npm run dev --prefix apps/tools
npm run build --prefix apps/tools

# Export local et synchronisation des deux wrappers
npm run native:sync --prefix apps/tools

# Ouverture dans les IDE
npm run native:android --prefix apps/tools
npm run native:ios --prefix apps/tools

# Builds de développement quand les SDK sont installés
npm run build:android:debug --prefix apps/tools
npm run build:ios:debug --prefix apps/tools
```

Après toute modification Web destinée aux apps, relancer `native:sync`. Les répertoires Web copiés dans les projets natifs sont générés et ignorés par Git.

## Environnements et URLs

`NEXT_PUBLIC_TOOLS_URL` reste l’origine canonique Web utilisée par les metadata et le sitemap. `NEXT_PUBLIC_TOOLS_ENV` accepte `local`, `preview`, `production`, `native-dev` ou `native-production`. Le script `build:native` positionne `NEXT_PUBLIC_TOOLS_RUNTIME=native` et `ELSATIA_TOOLS_NATIVE=1`.

Les URLs ELSATIA externes sont centralisées dans `src/lib/site.ts`. Dans les apps natives, Gestion Pro, Colors et les futurs liens support/légaux s’ouvrent explicitement dans le navigateur système avec Capacitor Browser. Les routes d’outils restent internes.

## Offline et service worker

| Plateforme | Ressources essentielles | Cache secondaire |
|---|---|---|
| Web/PWA | hébergement Web | `sw-tools.js`, cache `elsatia-tools-v6` |
| Android | bundle sous `android/app/src/main/assets/public` | aucun service worker requis |
| iOS | bundle sous `ios/App/App/public` | aucun service worker requis |

Le composant d’enregistrement du service worker le désactive dans Capacitor. Les calculs, SVG, routes, CSS et polices système sont locaux. Une coupure réseau ne doit affecter que l’ouverture volontaire d’un lien externe.

## Stockage

L’interface `PersistentStorageAdapter` isole les composants du support réel :

- Web : `localStorage` ;
- iOS/Android : plugin Capacitor Preferences, stocké via les mécanismes key/value natifs.

Les clés restent `elsatia.tools.*`. Au premier démarrage natif, les données déjà disponibles dans le stockage Web de la WebView sont importées sans écraser une valeur native existante. Preferences convient aux favoris et récents. Les projets Tools Pro, plus structurés et potentiellement au nombre de plusieurs centaines, résident dans IndexedDB au sein de la WebView. Seules les données source versionnées sont conservées : plans, PDF et SVG sont reconstruits à la demande. Une migration future vers SQLite peut conserver le contrat `ProjectRepository` sans modifier les composants.

## Navigation, safe areas et clavier

- le bouton retour Android remonte l’historique ; depuis une vue secondaire sans historique, il revient à l’accueil ; il ne quitte l’app qu’à la racine ;
- `viewport-fit=cover` et les variables CSS `safe-area-inset-*` protègent encoche, Dynamic Island et zone de geste ;
- `adjustResize` évite que le clavier Android recouvre le champ actif ;
- les champs utilisent `inputMode="decimal"`, acceptent virgule ou point dans le moteur, et exposent `Next`/`Done` au clavier lorsque disponible ;
- iPhone et iPad restent supportés, en portrait et paysage.

## Deep links

Le listener Capacitor est prêt et n’accepte que `/`, `/projets` et `/outils/<slug>` sur `https://tools.elsatia.fr`. L’activation Store est différée car elle exige :

- iOS : capability Associated Domains `applinks:tools.elsatia.fr` et fichier `https://tools.elsatia.fr/.well-known/apple-app-site-association` contenant le Team ID + bundle ID ;
- Android : intent filter HTTPS `android:autoVerify="true"` et fichier `https://tools.elsatia.fr/.well-known/assetlinks.json` contenant l’applicationId et l’empreinte SHA-256 du certificat de signature.

Ces fichiers ne doivent être finalisés qu’avec les identifiants Apple et certificats de signature réels.

## Free/Pro et futurs achats

La résolution d’accès consomme des grants abstraits provenant de `web`, `apple`, `google`, `elsatia` ou `internal`. Elle ne connaît ni Stripe, ni StoreKit, ni Play Billing.

Un futur adaptateur de monétisation devra normaliser :

- Apple : transactions StoreKit, restauration, expiration, révocation/remboursement et éventuellement Family Sharing ;
- Google : purchase token, acknowledgement, état d’abonnement, expiration et révocation/remboursement ;
- Web/ELSATIA : droits issus du compte facultatif et du paiement Web.

La vérification serveur deviendra nécessaire pour synchroniser durablement des droits entre appareils. R4 n’implémente aucun achat ni bouton « Restaurer mes achats » puisqu’aucun produit n’existe encore.

## Exports et partage natif

Les PDF et SVG sont calculés localement à partir du modèle géométrique partagé. Sur le Web, Web Share est utilisé uniquement lorsqu’il accepte les fichiers ; sinon l’export est téléchargé. Sur iOS et Android, `@capacitor/filesystem` écrit une copie temporaire dans le cache puis `@capacitor/share` ouvre la feuille système. Cette action reste déclenchée par un geste utilisateur et ne demande aucun accès général aux documents.

Le fichier portable `.elsatiatools` contient uniquement la source métier validée. Il permet un transfert manuel entre appareils sans créer de compte ni ajouter une synchronisation implicite.

## Capacités natives futures

Les capacités seront exposées derrière de petits ports TypeScript avec un adaptateur Web et un adaptateur Capacitor : caméra, haptique, orientation, notifications et capteurs. Le moteur métier ne devra jamais importer directement un plugin natif.

Pour niveau/inclinomètre, prévoir un adaptateur Motion/Core Motion côté iOS et SensorManager côté Android, avec disponibilité du capteur, permission éventuelle, fréquence, calibration et message de repli. La précision devra être qualifiée : il ne s’agira pas d’un instrument certifié.

## Icônes, splash et confidentialité

L’icône 1024 × 1024 et le splash 2732 × 2732 sont dérivés du SVG ELSATIA existant, sans nouveau logo. Android possède les densités classiques et l’adaptive icon. Une validation graphique finale sur appareils et les captures Store restent nécessaires.

iOS contient `PrivacyInfo.xcprivacy` pour l’usage de UserDefaults par Capacitor Preferences (`CA92.1`) et des horodatages de fichiers temporaires par Capacitor Filesystem (`C617.1`). Aucune permission caméra, localisation, microphone ou notification n’est déclarée. Toute future capacité devra ajouter sa permission et mettre à jour les déclarations de confidentialité au même moment.

## Sécurité

Les certificats, profils, keystores, mots de passe, fichiers Firebase et configurations locales sont ignorés. Ne jamais renseigner de mot de passe de signature dans `capacitor.config.ts` ou dans un fichier suivi.
