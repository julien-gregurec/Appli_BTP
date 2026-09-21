# ELSATIA Tools — préflight TestFlight — Apple

Base `release/tools-store-preflight-v1`. États : **VALIDÉ** · **AUTOMATIQUE** · **ACTION JULIEN** · **BLOQUÉ**.

Ordre imposé : une section suppose la précédente terminée. Le §1 est un bloqueur dur — inutile de
créer quoi que ce soit chez Apple tant qu'il n'est pas levé.

## 1. Préalable backend — **BLOQUÉ**

| # | Point | État |
|---|---|---|
| 1.1 | Migrations Tools appliquées en Production (rangs 243→248, dont `…r9_monetisation` et `…r10_suppression_compte`) | **BLOQUÉ** — Production s'arrête au rang 223 |
| 1.2 | Ledger Production confirmé en direct | **ACTION JULIEN** |
| 1.3 | Cutover Production réalisé | **BLOQUÉ** — conversation dédiée |
| 1.4 | `TOOLS_STORE_ENVIRONMENT` renseignée sur le déploiement qui sert l'API | **ACTION JULIEN** |
| 1.5 | `TOOLS_STORE_ALLOW_SANDBOX=true` pendant la phase TestFlight | **ACTION JULIEN** |
| 1.6 | `APPLE_ROOT_CA_BASE64` fournie | **ACTION JULIEN** |
| 1.7 | Prix de Tools Pro arrêté | **BLOQUÉ** — n'existe nulle part |

> Sans 1.1, un relecteur ou un testeur qui achète obtient une erreur : les tables de monétisation
> n'existent pas en Production. Sans 1.6, la vérification Apple lève « Certificats racine Apple
> non configurés ».

## 2. Compte Apple Developer — **ACTION JULIEN**

- [ ] Apple ID professionnel dédié
- [ ] Adhésion Apple Developer Program active
- [ ] Entité juridique et D-U-N-S si Organization
- [ ] Team ID relevé
- [ ] Contrat « Paid Applications » accepté
- [ ] Informations bancaires et fiscales complètes

> Sans le contrat et les informations bancaires, les abonnements restent invendables.

## 3. Identifiants et signature — **ACTION JULIEN**

- [ ] App ID `fr.elsatia.tools` enregistré
- [ ] Capability In-App Purchase activée sur l'App ID
- [ ] Capability Associated Domains **laissée inactive** (voir §8)
- [ ] Certificat de distribution créé
- [ ] Profil de provisionnement App Store
- [ ] `DEVELOPMENT_TEAM` renseigné dans le projet ou passé à `xcodebuild`
- [ ] `CODE_SIGN_IDENTITY` revalidé au premier archivage — la valeur `iPhone Developer` est héritée du gabarit Capacitor
- [x] Build Release non signé — **VALIDÉ**, `BUILD SUCCEEDED` + `Validate -validate-for-store`

## 4. Poste de travail — **ACTION JULIEN**

- [ ] `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`

> Diagnostic : `xcode-select -p` répond correctement mais `readlink /var/db/xcode_select_link` est
> vide. Sans ce lien, l'intégration simulateur de Claude Code refuse de démarrer. `xcrun simctl`
> fonctionne malgré tout, sans injection tactile.

## 5. Fiche App Store Connect — **ACTION JULIEN**

- [x] Textes rédigés et corrigés — `docs/mobile-stores/tools/TOOLS_APP_STORE_METADATA_V1.md`
- [ ] Application créée, langue principale français (France)
- [ ] Nom, sous-titre, catégories, description, mots-clés saisis
- [x] Support / Marketing / Privacy URL — **VALIDÉ**, 200 vérifié
- [ ] Copyright — **ACTION JULIEN**, forme légale non tranchée
- [ ] Classification d'âge : 4+ attendu

## 6. Confidentialité

- [x] `PrivacyInfo.xcprivacy` présent et exact **dans le paquet compilé** — **VALIDÉ**
- [x] Matrice App Privacy établie — **VALIDÉ**
- [ ] Matrice saisie dans App Store Connect — **ACTION JULIEN**
- [ ] Politique en ligne cohérente avec la matrice — **ACTION JULIEN**
- [ ] Question « Encryption » tranchée — **ACTION JULIEN**

## 7. Abonnements — **ACTION JULIEN**, dépend du prix

- [x] Identifiants exacts documentés — **VALIDÉ**
- [ ] Prix mensuel et annuel de Tools Pro arrêtés — **BLOQUÉ**
- [ ] Groupe d'abonnements `ELSATIA Tools Pro` créé
- [ ] `fr.elsatia.tools.pro.monthly` créé, prix et localisations
- [ ] `fr.elsatia.tools.pro.annual` créé, prix et localisations
- [ ] Capture de revue par produit
- [ ] Les deux au statut « Ready to Submit »
- [ ] URL des App Store Server Notifications V2 (production **et** sandbox)
- [ ] Testeurs Sandbox créés

## 8. Liens universels — **P1, facultatif en V1**

- [x] Le parcours d'authentification n'en dépend pas — schéma `fr.elsatia.tools://auth/recovery` — **VALIDÉ**
- [x] Modèle AASA prêt, non déployé — **VALIDÉ**
- [ ] `TEAMID` remplacé, fichier servi, capability activée **après** — **ACTION JULIEN**
- [ ] `fr.elsatia.tools://auth/recovery` déclarée dans les redirections Supabase — **ACTION JULIEN**

## 9. Compte de revue — **ACTION JULIEN**

- [x] Contrat écrit — **VALIDÉ**
- [ ] `review@elsatia.fr` créé, entreprise de démonstration sans donnée réelle
- [ ] Droit Tools Pro actif, double authentification désactivée
- [ ] Identifiants saisis dans App Review Information — **jamais dans Git**

## 10. Archive et téléversement

- [x] `build:native`, `cap sync ios` — **VALIDÉ**
- [ ] `NEXT_PUBLIC_*` de **production** fournies au build
- [ ] `sips -g hasAlpha` sur l'icône → `no` (contrôle avant chaque archive)
- [ ] `CURRENT_PROJECT_VERSION` inédit
- [ ] Archive signée produite
- [ ] Validation depuis l'Organizer
- [ ] Téléversement — **uniquement sur instruction explicite de Julien**

## 11. Contrôles manuels sur appareil — impossibles sans compte réel

À faire dès la première build TestFlight interne :

- [ ] démarrage à froid, réseau coupé
- [ ] un calcul complet, valeurs attendues
- [ ] un tracé d'ouvrage créé, réglé, coté, exporté PDF et SVG
- [ ] achat Sandbox mensuel puis annuel
- [ ] **restauration d'achat** sur appareil réinitialisé
- [ ] mot de passe oublié, retour par `fr.elsatia.tools://auth/recovery`
- [ ] **suppression de compte : vérifier l'écran de confirmation** — « Demande de suppression enregistrée », et non un retour à « Connectez-vous d'abord » (défaut corrigé dans ce lot, non testable sans session réelle)
- [ ] rotation, iPhone **et** iPad
- [ ] reprise après arrière-plan prolongé

## 12. Verdict

**TestFlight : NOT READY.** Le dépôt est prêt ; §1 ne l'est pas.
