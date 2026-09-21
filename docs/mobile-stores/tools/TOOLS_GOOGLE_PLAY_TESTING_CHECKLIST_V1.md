# ELSATIA Tools — checklist Google Play Internal Testing — V1

Base : `094bd43`. **Aucune action distante n'a été exécutée.**
Cases cochées = faites par ce lot. Cases vides = à faire par Julien.

---

## 1. Compte Play Console — rien n'existe encore

- [ ] Compte développeur Google Play créé (25 $, frais unique)
- [ ] Type de compte : **organisation** si la publication se fait au nom d'ELSATIA
- [ ] Vérification d'identité aboutie — pièce justificative ; **compter plusieurs jours**
- [ ] Vérification du numéro D-U-N-S si compte organisation
- [ ] Accord de distribution accepté
- [ ] Profil de paiement créé et relié — obligatoire pour vendre des abonnements

> Depuis les durcissements de Google, la vérification d'identité d'un compte organisation prend
> souvent plus longtemps que tout le reste réuni. La lancer en premier.

## 2. Signature de l'application

- [ ] **Play App Signing activé** — Google détient alors la clé de signature de distribution
- [ ] Clé de téléversement (upload key) générée **par Julien seul**, hors du dépôt
- [ ] Clé sauvegardée hors ligne, chiffrée — sa perte est irréversible
- [ ] `keystore.properties` renseigné localement — **jamais committé**
- [ ] Empreinte **SHA-256 de la clé de signature d'application** relevée dans Play Console
      (Configuration → Intégrité de l'application) — elle est nécessaire à `assetlinks.json`

> Ne pas confondre les deux empreintes : `assetlinks.json` demande celle de la clé de
> **signature d'application** gérée par Play, pas celle de la clé de téléversement.

- [x] Le dépôt ne contient aucun keystore — vérifié
- [x] `.gitignore` exclut `*.jks`, `*.keystore`, `keystore.properties`, `google-services.json`

## 3. Fiche Play Console

- [ ] Application créée, langue par défaut français (France)
- [ ] Nom `ELSATIA Tools`
- [ ] Description courte et description longue — **prêtes** dans `TOOLS_GOOGLE_PLAY_METADATA_V1.md`
- [ ] Catégorie : Outils
- [ ] Coordonnées : e-mail de contact (**il sera public**), site web
- [ ] URL de la politique de confidentialité
- [ ] Questionnaire de classification du contenu rempli — réponses attendues dans la fiche de
      métadonnées
- [ ] Déclaration publicités : **Non**
- [ ] Public cible : adultes, usage professionnel
- [ ] Data Safety saisie — `TOOLS_DATA_SAFETY_V1.md`
- [ ] URL de suppression de compte renseignée :
      `https://tools.elsatia.fr/suppression-compte`

## 4. Visuels

- [x] Icône de fiche 512 × 512 — `native-assets/store/play-icon-512.png`
- [x] Visuel principal 1024 × 500 — `native-assets/store/play-feature-graphic-1024x500.png`
- [x] Captures téléphone — 9 fichiers en 1080 × 1920 (Play en demande 2 minimum, 8 maximum)
- [ ] Choisir les 8 captures à téléverser parmi les 9 disponibles
- [ ] Décider si la distribution tablette est revendiquée (réserve P1-7) ; si oui, produire les
      séries 7 et 10 pouces — le script sait le faire, ajouter une entrée `SERIES`
- [ ] Visuels téléversés

Emplacement : `/Volumes/ELSATIA-DEV/ELSATIA-MOBILE-STORES/captures/store-dist-v1/google-phone/`.
Régénération : `scripts/capture-store-screenshots.mjs`.

## 5. Abonnements

- [ ] `tools_pro_monthly` créé, une offre de base, période mensuelle
- [ ] `tools_pro_annual` créé, une offre de base, période annuelle
- [ ] Prix par territoire renseignés
- [ ] Les deux abonnements **activés**
- [ ] Compte de service pour la Play Developer API créé et relié à Play Console
- [ ] Sujet Pub/Sub et URL des notifications RTDN configurés
- [ ] Testeurs de licence déclarés — **sans eux, aucun achat de test n'est possible**
- [x] Identifiants exacts documentés — `TOOLS_STORE_PRODUCTS_V1.md`

## 6. Compte de revue

- [ ] `review@elsatia.fr` créé selon `TOOLS_REVIEW_ACCOUNT_V1.md`
- [ ] Déclaré comme testeur de licence
- [ ] Identifiants saisis dans les notes de test — **jamais dans Git**

## 7. Android App Links — facultatif au premier dépôt

- [x] Modèle prêt — `well-known/assetlinks.template.json`
- [ ] `SHA256_FINGERPRINT_DE_LA_CLE_DE_SIGNATURE_PLAY` remplacé par l'empreinte réelle (§2)
- [ ] Fichier servi sur `https://tools.elsatia.fr/.well-known/assetlinks.json`,
      en `application/json`, HTTPS, sans redirection
- [ ] `android:autoVerify="true"` ajouté à l'`intent-filter` **seulement après** la mise en ligne
- [ ] Vérification contrôlée sur appareil réel

## 8. Build de l'AAB

- [x] `npm run build:native` — PASS
- [x] `npx cap sync android` — PASS
- [x] `./gradlew bundleRelease` — BUILD SUCCESSFUL, `app-release.aab`, 5 266 345 octets
- [x] AAB vérifié **non signé** — aucun `.RSA`, `.DSA` ni `.SF` dans l'archive
- [x] Manifeste fusionné vérifié : `INTERNET`, `BILLING`, `ACCESS_NETWORK_STATE` et la permission
      interne AndroidX ; **aucune permission sensible**
- [ ] `NEXT_PUBLIC_*` de **production** fournies au build (réserve P0-5)
- [ ] `versionCode` incrémenté si `1` a déjà été téléversé
- [ ] AAB **signé avec la clé de téléversement** réelle
- [ ] AAB téléversé

> Un AAB signé avec une clé de debug n'est pas prêt pour le Store, et ne doit jamais être
> présenté comme tel. Celui produit par ce lot est délibérément non signé.

## 9. Piste de test interne

- [ ] Piste « Test interne » créée (jusqu'à 100 testeurs, **disponible en quelques minutes**,
      sans revue)
- [ ] Testeurs ajoutés par adresse Google
- [ ] Lien d'inscription partagé
- [ ] Installation vérifiée sur un appareil réel

### À contrôler sur l'appareil, avant d'élargir

- [ ] démarrage à froid, réseau coupé
- [ ] un calcul complet, valeurs conformes
- [ ] un tracé d'ouvrage créé, réglé, coté
- [ ] export PDF et export SVG, puis partage
- [ ] connexion au compte de revue
- [ ] achat de test mensuel, puis annuel
- [ ] **restauration d'achat** après réinstallation
- [ ] mot de passe oublié, et retour par le lien profond `fr.elsatia.tools://auth/recovery`
- [ ] suppression de compte : demande enregistrée, session fermée
- [ ] bouton Retour Android, rotation, reprise après arrière-plan prolongé
- [ ] **rapport de pré-lancement** de Play Console relu — il révèle des plantages qu'aucun test
      manuel ne verra

## 10. Test fermé — si des testeurs terrain sont souhaités

- [ ] Piste « Test fermé » créée
- [ ] Liste de testeurs ou groupe Google constitué
- [ ] Retours collectés et traités
- [ ] Google impose une phase de test à certains comptes développeurs récents avant toute
      production : **vérifier l'exigence applicable au compte au moment du dépôt**

## 11. Avant la production

- [ ] Toutes les cases ci-dessus cochées
- [ ] Data Safety et politique de confidentialité cohérentes entre elles
- [ ] Classification du contenu obtenue
- [ ] Pays de distribution choisis
- [ ] Déploiement progressif envisagé — 20 % puis élargissement
- [ ] Écran d'abonnement revalidé visuellement : durée, prix, renouvellement, résiliation, CGU,
      confidentialité

---

## Interdits pendant toute cette procédure

- ne jamais committer un keystore, un `keystore.properties`, un `google-services.json`
- ne jamais perdre la clé de téléversement — la sauvegarder hors ligne, chiffrée
- ne pas présenter un AAB signé en debug comme prêt pour le Store
- ne pas fournir `julien@elsatia.fr` aux relecteurs
- ne pas activer `autoVerify` sans `assetlinks.json` en ligne et exact
- ne pas déclarer la prise en charge tablette sans l'avoir constatée
