# ELSATIA Tools — préflight Internal Testing — Google Play

Base `release/tools-store-preflight-v1`. États : **VALIDÉ** · **AUTOMATIQUE** · **ACTION JULIEN** · **BLOQUÉ**.

## 1. Préalable backend — **BLOQUÉ**

| # | Point | État |
|---|---|---|
| 1.1 | Migrations Tools appliquées en Production (rangs 243→248) | **BLOQUÉ** — Production s'arrête au rang 223 |
| 1.2 | Ledger Production confirmé en direct | **ACTION JULIEN** |
| 1.3 | Cutover Production réalisé | **BLOQUÉ** |
| 1.4 | `TOOLS_STORE_ENVIRONMENT` renseignée | **ACTION JULIEN** |
| 1.5 | `TOOLS_STORE_ALLOW_SANDBOX=true` pendant la phase de test | **ACTION JULIEN** |
| 1.6 | `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` fournie | **ACTION JULIEN** |
| 1.7 | `GOOGLE_PLAY_RTDN_AUDIENCE` et `…SERVICE_ACCOUNT_EMAIL` fournies | **ACTION JULIEN** |
| 1.8 | Prix de Tools Pro arrêté | **BLOQUÉ** — n'existe nulle part |

> Rappel : Google ne signe aucun environnement dans ses charges utiles. C'est
> `TOOLS_STORE_ENVIRONMENT` qui décide de ce qui est inscrit au registre — d'où 1.4.

## 2. Compte Play Console — **ACTION JULIEN**

- [ ] Compte développeur créé (25 $, unique)
- [ ] Type organisation si publication au nom d'ELSATIA
- [ ] Vérification d'identité aboutie — **compter plusieurs jours**
- [ ] D-U-N-S si organisation
- [ ] Accord de distribution accepté
- [ ] Profil de paiement créé — obligatoire pour vendre des abonnements

> La vérification d'identité prend souvent plus longtemps que tout le reste. À lancer en premier.

## 3. Signature — **VALIDÉ** (configuration) / **ACTION JULIEN** (clé)

- [x] Configuration de signature de release en place — **VALIDÉ**
- [x] Sans clé, AAB **non signé**, vérifié — **AUTOMATIQUE**
- [x] `./gradlew :app:signingStatus` dit l'état sans rien divulguer — **VALIDÉ**
- [x] `.gitignore` exclut keystores, `keystore.properties`, `google-services.json` — **VALIDÉ**
- [ ] Play App Signing activé — **ACTION JULIEN**
- [ ] Clé de téléversement générée par Julien, hors dépôt, sauvegardée hors ligne chiffrée
- [ ] `android/keystore.properties` renseigné localement, **jamais commité**
- [ ] Empreinte **SHA-256 de la clé de signature d'application** relevée dans Play Console

> Deux empreintes à ne pas confondre : `assetlinks.json` demande celle de la clé de **signature
> d'application** gérée par Play, pas celle de la clé de téléversement.

Configuration attendue, par fichier ou par variables :

```
android/keystore.properties        ELSATIA_TOOLS_KEYSTORE_FILE
  storeFile=…                      ELSATIA_TOOLS_KEYSTORE_PASSWORD
  storePassword=…                  ELSATIA_TOOLS_KEY_ALIAS
  keyAlias=…                       ELSATIA_TOOLS_KEY_PASSWORD
  keyPassword=…
```

## 4. Fiche Play Console — **ACTION JULIEN**

- [x] Textes rédigés et corrigés — `docs/mobile-stores/tools/TOOLS_GOOGLE_PLAY_METADATA_V1.md`
- [ ] Application créée, langue par défaut français (France)
- [ ] Description courte et longue saisies
- [ ] Catégorie Outils, tags
- [ ] E-mail de contact — **il sera public**
- [ ] URL de politique de confidentialité
- [ ] Questionnaire de classification rempli
- [ ] Publicités : **Non**
- [ ] Data Safety saisie
- [x] URL de suppression de compte — **VALIDÉ**, 200 sans session

## 5. Visuels — **VALIDÉ**

- [x] Icône 512 × 512 produite
- [x] Visuel principal 1024 × 500 produit
- [x] 9 captures téléphone 1080 × 1920, contenu revérifié
- [ ] Choisir les 8 à téléverser (Play en accepte 8 au maximum)
- [ ] Décider de la revendication tablette — **ACTION JULIEN**

## 6. Abonnements — **ACTION JULIEN**, dépend du prix

- [x] Identifiants exacts documentés — **VALIDÉ**
- [ ] Prix arrêté — **BLOQUÉ**
- [ ] `tools_pro_monthly` créé, offre de base mensuelle
- [ ] `tools_pro_annual` créé, offre de base annuelle
- [ ] Les deux activés
- [ ] Compte de service Play Developer API relié
- [ ] Sujet Pub/Sub et URL des RTDN configurés
- [ ] Testeurs de licence déclarés — sans eux, aucun achat de test

## 7. App Links — **P1, facultatif en V1**

- [x] Modèle `assetlinks.json` prêt, non déployé — **VALIDÉ**
- [x] `/.well-known/assetlinks.json` répond 404, conformément à la décision — **VALIDÉ**
- [ ] Empreinte réelle insérée, fichier servi, `autoVerify` ajouté **après** — **ACTION JULIEN**

## 8. AAB

- [x] `build:native`, `cap sync android` — **VALIDÉ**
- [x] `bundleRelease` — **BUILD SUCCESSFUL**, 5 265 910 octets, **non signé** vérifié
- [x] Manifeste fusionné : `INTERNET`, `BILLING`, `ACCESS_NETWORK_STATE`, permission interne AndroidX — **VALIDÉ**
- [ ] `NEXT_PUBLIC_*` de **production** fournies au build
- [ ] `versionCode` incrémenté si `1` déjà téléversé
- [ ] AAB signé avec la clé de téléversement réelle
- [ ] Téléversement — **uniquement sur instruction explicite de Julien**

## 9. Piste de test interne — **ACTION JULIEN**

- [ ] Piste créée (jusqu'à 100 testeurs, disponible en quelques minutes, sans revue)
- [ ] Testeurs ajoutés, lien partagé
- [ ] Installation vérifiée sur appareil réel

## 10. Contrôles manuels sur appareil

- [ ] démarrage à froid, réseau coupé
- [ ] un calcul complet, valeurs attendues
- [ ] un tracé créé, réglé, coté, exporté PDF et SVG
- [ ] achat de test mensuel puis annuel
- [ ] **restauration d'achat** après réinstallation
- [ ] mot de passe oublié, retour par le lien profond
- [ ] **suppression de compte : vérifier l'écran de confirmation** — « Demande de suppression enregistrée » (défaut corrigé dans ce lot, non testable sans session réelle)
- [ ] bouton Retour, rotation, reprise après arrière-plan
- [ ] **rapport de pré-lancement** relu — il révèle des plantages qu'aucun test manuel ne voit

## 11. Verdict

**Google Play Internal Testing : NOT READY.** Le dépôt est prêt ; §1 ne l'est pas.
