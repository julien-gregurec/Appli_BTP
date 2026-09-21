# R8 — compte, droits Pro et synchronisation

## Périmètre et décisions

R8 ajoute un compte ELSATIA facultatif sans modifier les calculateurs locaux et sans intégrer de paiement. Le modèle est centré sur `auth.users` : chaque projet appartient à un utilisateur, avec un `organization_id` nullable pour permettre une extension multi-organisation ultérieure sans changer le contrat de synchronisation.

L’audit du socle existant a retenu l’authentification Supabase commune, la fonction canonique `est_plateforme_admin()` et le catalogue d’applications/rôles de la plateforme. Aucun e-mail administrateur n’est codé en dur.

## Entitlements

`entitlements_utilisateurs_elsatia` stocke l’application, le niveau Free/Pro, les capacités, la source, la priorité, les dates de validité, l’expiration et la révocation. Les sources prévues sont `web`, `apple`, `google`, `elsatia` et `internal`, avec la priorité `internal > elsatia > apple > google > web`.

`tools_resoudre_entitlements()` est l’unique résolveur client. Un droit Pro actif suffit à activer Pro ; les capacités actives sont fusionnées. Les RPC d’attribution et révocation sont réservées aux administrateurs canoniques et écrivent un historique d’audit. La migration n’accorde aucun accès à un utilisateur de production.

Le client met en cache la réponse serveur pour sept jours au maximum. Le cache est lié à l’UUID utilisateur et protégé par HMAC ; une altération, un changement d’utilisateur ou une expiration force Free. Une révocation devient effective à la prochaine validation serveur réussie. Ce HMAC protège contre la modification locale accidentelle ou opportuniste ; il ne remplace pas une signature serveur asymétrique.

## Sessions

- iOS : Keychain, accessibilité `AfterFirstUnlockThisDeviceOnly` ;
- Android : clé AES-GCM non exportable dans Android Keystore ;
- Web/PWA : valeur AES-GCM et clé Web Crypto non exportable conservée dans IndexedDB.

Le stockage Web protège les données au repos, mais un script exécuté dans la même origine conserve naturellement les privilèges de l’application. Les politiques CSP/XSS restent donc une barrière indispensable.

## Projets et synchronisation

`tools_projects` conserve le payload validé, la révision, l’appareil source, les horodatages et un tombstone. Les RLS limitent lecture et écriture au propriétaire authentifié ; le client ne peut ni choisir un autre `user_id`, ni supprimer physiquement une ligne.

`tools_sync_project()` applique une révision attendue. En cas de divergence, le serveur renvoie la version distante. Le client conserve alors les deux versions : la version distante redevient canonique et la version locale est dupliquée avec un suffixe de conflit. Les modifications offline restent dans IndexedDB jusqu’au retour réseau. Les suppressions utilisent des tombstones pour éviter les résurrections multi-appareils.

La première connexion fusionne les projets locaux existants. Un import `.elsatiatools` est validé localement mais n’est jamais téléversé automatiquement ; l’utilisateur doit choisir « Autoriser la synchronisation ».

Le contrat `CloudProjectStore` isole Supabase du moteur de synchronisation. R9 pourra brancher les adaptateurs Stripe, StoreKit et Google Billing sur la table d’entitlements sans modifier les calculateurs ni l’interface de synchronisation.

## Sécurité vérifiée

Le test SQL R8 couvre notamment : fallback Free, grâce de sept jours, anti-auto-attribution, attribution/révocation administrateur, capacités et sources invalides, audit, multi-source, isolation A/B, usurpation de `user_id`, conflits de révision, tombstones et payloads malformés.

Les tests TypeScript couvrent le cache signé, l’expiration, l’altération, le changement d’utilisateur, push/pull, file offline, fusion initiale, tombstones et préservation des conflits. Les imports utilisent le parseur strict du modèle versionné.

## Environnement de validation

Toutes les validations R8 sont locales : Supabase local, compte éphémère `@invalid.local`, Android Emulator API 36 et iOS Simulator 26.5. Aucun environnement de production ou de prévisualisation n’est modifié.

Le verdict final doit distinguer les tests automatisés, les builds et les scénarios runtime. Un GO global n’est permis qu’après login, persistance, Pro, synchronisation, offline/retour réseau et conflit sans perte sur Web, Android et iOS.

## Validation finale du 30 août 2026

La validation runtime a été exécutée exclusivement contre Supabase local et `http://localhost:3021`, avec une fixture éphémère `@invalid.local`.

- iOS vers Android : le projet sentinelle `R8-IOS-TO-ANDROID-260830` a été retrouvé avec les valeurs exactes `2468 / 864 / -30` ;
- conflit Android hors ligne vers Web : la version Android `2468 / 864 / -30` a été conservée dans une copie de conflit et la version Web `3001 / 864 / -30` est restée canonique ;
- Web et Android ont ensuite affiché les deux versions, sans perte de données ;
- les sessions temporaires ont été fermées sur Web, Android et iOS ;
- la fixture a été supprimée de Supabase local : utilisateur, deux projets, entitlement et entrée d’audit sont absents.

Matrice finale :

- tests TypeScript : 97/97 ;
- tests SQL/RLS : 26/26 ;
- lint : PASS ;
- typecheck : PASS ;
- build Tools : PASS ;
- `git diff --check` : PASS ;
- builds natifs Android et iOS : PASS sur le code partagé R8 validé, sans modification ultérieure du code partagé pendant les scénarios runtime.

Verdict : Web R8 GO, Android R8 GO, iOS R8 GO, synchronisation bidirectionnelle GO, conflit réel Android offline vers Web GO, R8 GLOBAL GO.
