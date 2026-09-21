# Validation native réelle — ELSATIA Tools V1-R7

> État final au 30 août 2026 : **GO Android R7**, **GO iOS R7 sur Simulator**, **GO NATIF COMPLET R7** pour le périmètre technique demandé. Aucun commit n’a été créé.

## 1. Périmètre et checkpoint

- checkpoint de départ : `6dd125680b2f293aa3f35f54b4d5bc05de4a217b` ;
- identifiant natif Android/iOS : `fr.elsatia.tools` ;
- validations Pro réalisées avec un build temporaire `NEXT_PUBLIC_TOOLS_INTERNAL_PRO=1` ;
- build Free par défaut reconstruit, synchronisé et réinstallé à la fin ;
- aucune licence acceptée automatiquement, aucun mot de passe saisi ou conservé ;
- aucun commit pendant les installations ou les validations R7.

## 2. Environnements réellement validés

| Élément | État vérifié |
|---|---|
| macOS | 26.5.2 |
| Xcode | 26.6 (17F113) |
| SDK iOS Simulator | iOS 26.5 (23F77) |
| Simulateur iOS | un seul appareil, `ELSATIA Tools R7`, iPhone 17 Pro ARM64, UUID `0F747FB5-A6D3-4B6B-97B7-BB54AF5A59FB` |
| JDK | Temurin 21.0.12.1 LTS |
| Gradle | wrapper 8.14.3 |
| Android SDK | `/Volumes/ELSATIA-DEV/Android/sdk` |
| Android ciblé | Android 16 / API 36 ARM64 |
| AVD Android | un seul téléphone de validation, `sdk_gphone64_arm64` |
| Espace contrôlé | environ 22 Gio interne et 447 Gio sur `ELSATIA-DEV` lors du dernier contrôle |

Les composants Android 35/37 déjà présents n’ont pas été supprimés : leur retrait aurait été une action destructive distincte.

## 3. Correctifs R7 appliqués

- révélation automatique de la section filtrée de l’accueil et second tap pour retirer le filtre ;
- conservation de la navigation client Next sous Capacitor ;
- gestion native du retour et recentrage en haut lors d’un changement de route iOS ;
- champs projet à 16 px sur mobile pour éviter le zoom automatique iOS ;
- exports natifs PDF, SVG et `.elsatiatools` via Capacitor Filesystem ;
- déclaration iOS du type `fr.elsatia.tools.project` et ouverture en place désactivée pour permettre l’import réel ;
- partage natif via Capacitor Share ;
- conservation du service worker pour le Web/PWA, sans enregistrement en runtime natif ;
- mode inspection piloté par le caractère Debug/Release du build natif.

## 4. Tests automatisés et builds finaux

- Vitest : **17 fichiers, 89 tests, PASS** ;
- TypeScript : **PASS** ;
- ESLint : **PASS** ;
- `git diff --check` : **PASS** ;
- build Web Next.js : **PASS**, 34 pages ;
- export natif : **PASS**, 34 pages ;
- `cap sync` Android + iOS : **PASS**, cinq plugins (App, Browser, Filesystem, Preferences, Share) ;
- Android `assembleDebug` : **BUILD SUCCESSFUL**, 244 tâches ;
- iOS Free et Pro Simulator : **BUILD SUCCEEDED**.

## 5. Android R7

Validation réelle sur l’APK installé dans l’émulateur API 36 :

- navigation catégories, recherche, cartes outils et outils complémentaires : PASS ;
- bouton Retour outil → accueil sans fermeture de l’activité : PASS ;
- calculs réels : Angle droit 3-4-5, pente, arc et quantité de peinture : PASS ;
- projet Pro local, réouverture et recalcul : PASS ;
- PDF, SVG, `.elsatiatools` et feuille de partage Android : PASS ;
- kill/relaunch hors ligne avec calcul Free et accès Pro : PASS ;
- absence de crash `AndroidRuntime` ou d’erreur Capacitor critique : PASS ;
- build final Free réinstallé et lancé : PASS.

## 6. iOS R7 — parcours natifs

Validation réelle sur l’unique Simulator iPhone 17 Pro / iOS 26.5 :

- compilation, installation, lancement et identité `fr.elsatia.tools` : PASS ;
- accueil, catégories, recherche, cartes outils et navigation complémentaire : PASS ;
- calculs Free réels : 3-4-5 `3 000 / 4 000 / 5 000`, pente `4 000 mm × 2 % = 80 mm`, arc `1 600 / 400 = rayon 1 000 mm`, peinture `20,24 L` : PASS ;
- projet Pro de référence `Fleur 6 pétalesR7 iOS` conservé après kill/relaunch : PASS ;
- recalcul Pro, plan coté, coordonnées, couches de construction, zoom et mode chantier : PASS ;
- outil Pro Arche avancée `1 600 / 500 / 80 = rayon 890 mm` : PASS ;
- portrait, paysage et zones sûres : PASS ;
- PDF, SVG, export portable et partage iOS réel : PASS ;
- import réel d’un `.elsatiatools` via le sélecteur iOS avec message « Projet importé et validé. » : PASS ;
- stockage Preferences, IndexedDB, LocalStorage et Documents : PASS ;
- manifest de confidentialité et absence d’entitlements sensibles inutiles : PASS.

## 7. Scénario offline iOS atomique

Le test final a été orchestré dans un bloc unique avec restauration `finally` et un garde-fou launchd indépendant à 90 secondes. Seule l’alimentation Wi-Fi de `en0` a été modifiée. DNS, proxy, VPN, routage et réseau mémorisé sont restés inchangés.

Chronologie probante :

| Heure CEST | Événement |
|---|---|
| 18:43:11 | Wi-Fi `en0` coupé ; état `Off` confirmé |
| 18:43:11–13 | application tuée complètement puis relancée ; accueil rendu sans réseau |
| 18:43:13 | `curl https://tools.elsatia.fr` échoue avec `Could not resolve host` |
| 18:43:14 | PDF écrit hors ligne, 6 861 octets |
| 18:43:15 | SVG écrit hors ligne, 4 018 octets |
| 18:43:16–18 | projet ouvert, diamètre modifié de 2 400 à 3 100 mm, rayon recalculé à 775 mm |
| 18:43:51 | restauration explicite dans le bloc `finally`, Wi-Fi `On`, IPv4 revenu |
| 18:44:55 | route par défaut `en0`, réseau IPv4/IPv6 `Reachable`, réponse Apple HTTP 200 |

Preuves de fichiers :

- PDF : SHA-256 `2cbaabf47d69f4d4e4063d211e5a553105ffba323628b0d9cb12d96d77e237c7` ;
- SVG : SHA-256 `85880f5cd31e8673fbc6739f7353c9966416fbc123f86039d2594c670711b719` ;
- les timestamps PDF/SVG sont strictement compris entre la coupure et la restauration ;
- aucun accès à `tools.elsatia.fr` n’est nécessaire au démarrage, aux calculs, aux projets ou aux exports ;
- les garde-fous launchd temporaires ont été retirés après restauration.

Le calcul Free réel hors ligne a également été validé lors du même cycle de validation global, avec kill/relaunch et rendu de résultat local.

## 8. Logs iOS

La fenêtre atomique ne contient aucun crash, aucune exception JavaScript non gérée et aucune erreur Capacitor Filesystem/Share bloquante. Les messages classés `error` proviennent du Simulator : bibliothèque haptique absente, WebKit ResourceLoadStatistics, cache Accessibility et session clavier distante. Ils n’empêchent ni le rendu, ni le calcul, ni les exports.

## 9. Audit des doublons et état Git

- `android/app/src/main/res/xml/config 2.xml` : déjà absent ;
- `android/app/src/main/res/xml/config 7.xml` : copie non suivie identique recréée pendant la synchronisation finale, supprimée ;
- `ios/App/App/config 2.xml` : copie non suivie identique, supprimée ;
- `ios/App/App/config 5.xml` : copie non suivie identique recréée pendant la synchronisation finale, supprimée ;
- `src/components/ProCalculatorWorkspace 2.tsx` : copie non suivie ancienne et sans référence, supprimée ;
- fichiers sans rapport avec ELSATIA Tools : conservés ;
- aucun produit DerivedData ajouté au dépôt ;
- aucun commit créé.

## 10. Limites clairement séparées

- iOS a été validé sur Simulator officiel, pas sur iPhone physique ;
- Android a été validé sur émulateur officiel, pas sur téléphone physique ;
- universal links, signature de distribution, fiches Store et soumissions App Store / Play Store ne sont pas finalisés ;
- le verdict ci-dessous est un GO technique R7, pas un GO Store final.

## 11. Verdicts strictement séparés

- **Android R7 : GO** — émulateur Android 16 / API 36 ARM64.
- **iOS R7 : GO** — Simulator iPhone 17 Pro / iOS 26.5.
- **GO NATIF COMPLET R7** — périmètre technique Android + iOS demandé fermé, y compris offline kill/relaunch, calculs, projet Pro, PDF et SVG.
