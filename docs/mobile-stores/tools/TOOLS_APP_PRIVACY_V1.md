# ELSATIA Tools — Apple App Privacy — V1

Base : `094bd43`. Établi à partir du comportement réel du code, jamais d'une intention.
Aucune déclaration fictive.

## Deux documents, deux périmètres

Il faut les distinguer, sous peine de remplir l'un à la place de l'autre :

- **`PrivacyInfo.xcprivacy`** décrit ce que **le binaire** fait — les API sensibles qu'il appelle
  et les domaines de suivi qu'il contacte. Il est dans le paquet, et Apple le lit à la validation.
- **La fiche App Privacy**, dans App Store Connect, décrit ce que **le service** collecte.

Un manifeste à `NSPrivacyCollectedDataTypes` vide est exact pour Tools — le binaire lui-même ne
collecte rien — mais il ne dispense pas de remplir la fiche : dès qu'un compte ELSATIA est
connecté, un e-mail et un identifiant partent vers Supabase.

## `PrivacyInfo.xcprivacy` — état constaté et validé

```
NSPrivacyTracking            = false
NSPrivacyTrackingDomains     = []      (vide)
NSPrivacyCollectedDataTypes  = []      (vide)
NSPrivacyAccessedAPITypes    :
  NSPrivacyAccessedAPICategoryUserDefaults   → CA92.1
  NSPrivacyAccessedAPICategoryFileTimestamp  → C617.1
```

Justification de chaque ligne, vérifiée dans le code :

| Déclaration | Pourquoi elle est exacte |
|---|---|
| `NSPrivacyTracking = false` | aucun SDK publicitaire, aucun identifiant partagé entre applications d'éditeurs différents, aucun appel à l'ATT |
| `NSPrivacyTrackingDomains` vide | conséquence directe de la ligne précédente |
| `NSPrivacyCollectedDataTypes` vide | le binaire ne collecte rien pour son propre compte ; ce qui part vers Supabase relève du service, décrit dans la fiche ci-dessous |
| `UserDefaults` → `CA92.1` | `@capacitor/preferences`, réglages de l'application |
| `FileTimestamp` → `C617.1` | `@capacitor/filesystem`, écriture des exports PDF et SVG |

Le Keychain n'a pas à figurer ici : ce n'est pas une API à raison déclarée. La session y est
stockée avec `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` — donc jamais synchronisée
vers iCloud, ce qui est le comportement souhaitable et facilite l'exposé.

Le fichier a été vérifié **présent dans le paquet compilé** (`App.app/PrivacyInfo.xcprivacy`).

## Fiche App Privacy à saisir

Lecture de la colonne « Collected » : *collecté par le service quand la fonction est utilisée*.
En Free non connecté, **aucune ligne ne s'active** : rien ne quitte l'appareil.

| Data Type | Collected | Linked to user | Used for tracking | Purpose |
|---|---|---|---|---|
| Contact Info → **Email Address** | Oui, si compte connecté | Oui | Non | App Functionality |
| Identifiers → **User ID** | Oui, si compte connecté | Oui | Non | App Functionality |
| Purchases → **Purchase History** | Oui, si abonnement Pro | Oui | Non | App Functionality |
| User Content → **Other User Content** (tracés, projets) | Oui, si synchronisation activée | Oui | Non | App Functionality |
| Usage Data | **Non** | — | Non | — |
| Diagnostics (crash, performance) | **Non** | — | Non | — |
| Location | **Non** | — | Non | — |
| Photos or Videos | **Non** | — | Non | — |
| Contacts | **Non** | — | Non | — |
| Health & Fitness | **Non** | — | Non | — |
| Financial Info | **Non** | — | Non | — |
| Browsing History | **Non** | — | Non | — |
| Search History | **Non** | — | Non | — |
| Sensitive Info | **Non** | — | Non | — |
| Other Data | **Non** | — | Non | — |

### Ce qui fonde les « Non »

- **Aucun SDK d'analytics, aucun Sentry, aucun traceur publicitaire dans Tools.** Sentry est
  présent à la racine du monorepo pour Gestion Pro ; il n'est pas embarqué dans le paquet Tools.
- **Photos : non collectées.** L'image de référence importée dans l'Atelier est lue par le
  sélecteur système, traitée dans la WebView et rattachée au tracé local. Elle ne part pas vers
  un serveur. C'est cohérent avec l'absence de `NSPhotoLibraryUsageDescription`.
- **Diagnostics : non.** Aucun rapport de plantage n'est envoyé par l'application elle-même.
  Les rapports que l'utilisateur choisit de partager avec Apple relèvent d'iOS, pas de Tools, et
  ne se déclarent pas ici.

### Points d'attention à la saisie

1. **Ne pas cocher « Data is not collected ».** Ce serait faux dès qu'un compte est connecté, et
   c'est un motif de rejet ou de retrait. Le mode Free sans compte ne collecte rien, mais la
   fiche décrit l'application entière.
2. **`Purchase History` doit être coché.** L'identifiant de transaction est envoyé au service de
   facturation pour vérifier l'abonnement — c'est bien une collecte, même si elle est purement
   fonctionnelle.
3. **Ne rien cocher en « Used for Tracking ».** Aucune donnée n'est croisée avec des données
   d'autres sociétés à des fins publicitaires. Cocher une seule case ici imposerait l'ATT.
4. Les tracés ne sont « User Content » que **si la synchronisation est activée**. Sans compte,
   ils ne quittent pas l'appareil. Le libellé de la fiche doit rester conditionnel.

## Chiffrement et transport

| Point | État |
|---|---|
| Transport | HTTPS uniquement — toutes les URL de `src/lib/site.ts` sont en `https` |
| `NSAllowsArbitraryLoads` | **absent** de l'`Info.plist` |
| `NSAllowsLocalNetworking` | présent — nécessaire à la WebView locale de Capacitor, ne relâche pas l'ATS pour les domaines distants |
| Session au repos | Keychain, `AfterFirstUnlockThisDeviceOnly`, non synchronisé iCloud |
| Sauvegarde | données locales de tracés incluses dans la sauvegarde iOS chiffrée de l'appareil |

## Réponse à la question « Encryption » d'App Store Connect

Tools utilise HTTPS et les API de chiffrement du système (Keychain, WebCrypto). Aucune
implémentation cryptographique propriétaire. Cela relève de l'exemption standard, mais **la
réponse exacte au questionnaire d'export doit être validée juridiquement par Julien** avant le
premier téléversement : ce n'est pas une décision technique.

## À faire avant la soumission

- [ ] saisir la matrice ci-dessus dans App Store Connect
- [ ] vérifier que `https://elsatia.fr/confidentialite` décrit bien ces mêmes traitements —
      une politique en contradiction avec la fiche est un motif de rejet
- [ ] faire trancher la réponse « Encryption » par Julien
- [ ] revérifier la matrice à chaque ajout de fonction touchant à une donnée
