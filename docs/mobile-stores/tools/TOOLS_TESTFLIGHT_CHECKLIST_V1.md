# ELSATIA Tools — checklist TestFlight — V1

Base : `094bd43`. **Aucune action distante n'a été exécutée.**
Cases cochées = faites par ce lot. Cases vides = à faire par Julien.

Ordre imposé : chaque section suppose la précédente terminée.

---

## 1. Compte Apple Developer — rien n'existe encore

- [ ] Apple ID professionnel dédié, distinct du compte personnel
- [ ] Adhésion Apple Developer Program payée et **active** (99 $/an ; compter jusqu'à 48 h de
      validation, davantage pour une adhésion Organization)
- [ ] Entité juridique et numéro D-U-N-S si adhésion Organization
- [ ] Team ID relevé — **il est nécessaire à l'AASA** (voir §7)
- [ ] Contrat « Paid Applications » accepté
- [ ] Informations bancaires et fiscales complètes

> Sans le contrat « Paid Applications » et les informations bancaires, les abonnements restent
> invendables, quoi qu'on saisisse par ailleurs. C'est le point qui bloque le plus souvent, et
> le plus longtemps.

## 2. Identifiants et signature

- [ ] App ID `fr.elsatia.tools` enregistré dans le portail développeur
- [ ] Capability In-App Purchase activée sur l'App ID
- [ ] Capability Associated Domains **laissée inactive** tant que l'AASA n'est pas en ligne
- [ ] Certificat de distribution Apple créé — **par Julien seul**
- [ ] Profil de provisionnement App Store créé
- [ ] `DEVELOPMENT_TEAM` renseigné dans le projet, ou passé à `xcodebuild`
- [ ] Revalider `CODE_SIGN_IDENTITY` au premier archivage (réserve P1-2 : la valeur
      `iPhone Developer` est héritée du gabarit Capacitor ; en signature automatique avec une
      équipe renseignée, Xcode doit choisir l'identité de distribution)

## 3. Fiche App Store Connect

- [ ] Application créée, plateforme iOS, langue principale français (France)
- [ ] Bundle ID `fr.elsatia.tools` sélectionné
- [ ] Nom `ELSATIA Tools`, sous-titre `Calculs et tracés chantier`
- [ ] Catégories : Utilitaires (principale), Productivité (secondaire)
- [ ] Description, texte promotionnel, mots-clés — **prêts** dans `TOOLS_APP_STORE_METADATA_V1.md`
- [ ] Support URL, Marketing URL, Privacy Policy URL — contrôler qu'elles répondent 200
- [ ] Copyright — forme légale à trancher (réserve P1-6)
- [ ] Classification d'âge : 4+ attendu

## 4. Confidentialité

- [x] `PrivacyInfo.xcprivacy` présent, exact, et vérifié dans le paquet compilé
- [x] Matrice App Privacy établie — `TOOLS_APP_PRIVACY_V1.md`
- [ ] Matrice saisie dans App Store Connect
- [ ] Politique de confidentialité en ligne cohérente avec la matrice
- [ ] Question « Encryption » du questionnaire d'export tranchée par Julien

## 5. Abonnements

- [ ] Groupe d'abonnements `ELSATIA Tools Pro` créé
- [ ] `fr.elsatia.tools.pro.monthly` créé, prix et localisations renseignés
- [ ] `fr.elsatia.tools.pro.annual` créé, prix et localisations renseignés
- [ ] Capture de revue fournie **pour chaque** produit
- [ ] Les deux produits au statut « Ready to Submit »
- [ ] URL des App Store Server Notifications V2 renseignée (production et sandbox)
- [ ] Testeurs Sandbox créés
- [x] Identifiants exacts documentés — `TOOLS_STORE_PRODUCTS_V1.md`

## 6. Compte de revue

- [ ] `review@elsatia.fr` créé selon le contrat `TOOLS_REVIEW_ACCOUNT_V1.md`
- [ ] Entreprise de démonstration, sans aucune donnée réelle
- [ ] Droit Tools Pro actif
- [ ] Double authentification **désactivée**
- [ ] Connexion testée depuis un appareil neuf
- [ ] Identifiants saisis dans App Review Information — **jamais dans Git**

## 7. Liens universels — facultatif au premier dépôt

- [x] Modèle AASA prêt — `well-known/apple-app-site-association.template.json`
- [ ] `TEAMID` remplacé par le Team ID réel
- [ ] Fichier servi sur `https://tools.elsatia.fr/.well-known/apple-app-site-association`,
      en `application/json`, **sans extension `.json` dans l'URL**, en HTTPS, sans redirection
- [ ] Capability Associated Domains activée **seulement après** la mise en ligne du fichier
- [ ] Liens testés sur appareil réel

> Ne pas activer la capability avant que le fichier ne soit en ligne et exact : iOS met l'AASA
> en cache, et un fichier invalide produit des liens morts durablement.

## 8. Visuels

- [x] Icône 1024×1024 **sans canal alpha** — corrigé et vérifié après compilation
- [x] Captures iPhone 6,9 pouces — 9 fichiers en 1320 × 2868
- [x] Captures iPad 13 pouces — 9 fichiers en 2064 × 2752 (**obligatoires** : `TARGETED_DEVICE_FAMILY = 1,2`)
- [ ] Séries téléversées dans App Store Connect
- [ ] Ordre des captures arrêté — la première est celle qui s'affiche dans les résultats

Emplacement : `/Volumes/ELSATIA-DEV/ELSATIA-MOBILE-STORES/captures/store-dist-v1/`.
Régénération : `scripts/capture-store-screenshots.mjs`.

## 9. Build d'archive

- [x] `npm run build:native` — PASS
- [x] `npx cap sync ios` — PASS
- [x] `xcodebuild -sdk iphoneos -configuration Release` non signé — BUILD SUCCEEDED
- [x] Étape `Validate … -validate-for-store` d'Xcode — PASS
- [ ] `NEXT_PUBLIC_*` de **production** fournies au build (réserve P0-5)
- [ ] Vérifier que `CURRENT_PROJECT_VERSION` n'a jamais été téléversé — `1` pour la première fois
- [ ] `sips -g hasAlpha` sur l'icône → doit répondre `no`
- [ ] Archive produite : Product → Archive, ou `xcodebuild archive`
- [ ] Validation depuis l'Organizer — corriger toute alerte avant de téléverser
- [ ] Téléversement vers App Store Connect

> Rappel : App Store Connect refuse **définitivement** une combinaison version + build déjà
> reçue, même supprimée. Incrémenter `CURRENT_PROJECT_VERSION` à chaque renvoi.

## 10. TestFlight interne

- [ ] Traitement de la build terminé (quelques minutes à quelques heures)
- [ ] Informations de conformité à l'exportation renseignées
- [ ] Groupe interne créé (jusqu'à 100 membres de l'équipe, **aucune revue Beta requise**)
- [ ] Testeurs invités
- [ ] Installation vérifiée sur un appareil réel

### À contrôler sur l'appareil, avant d'élargir

- [ ] démarrage à froid, réseau coupé
- [ ] un calcul complet, valeurs conformes à celles attendues
- [ ] un tracé d'ouvrage créé, réglé, coté
- [ ] export PDF et export SVG, puis partage par la feuille système
- [ ] connexion au compte de revue
- [ ] achat Sandbox mensuel, puis annuel
- [ ] **restauration d'achat** sur un appareil réinitialisé
- [ ] mot de passe oublié, et retour par `fr.elsatia.tools://auth/recovery`
- [ ] suppression de compte : demande enregistrée, session fermée
- [ ] rotation d'écran, iPhone **et** iPad
- [ ] reprise après mise en arrière-plan prolongée

## 11. TestFlight externe — si des testeurs terrain sont souhaités

- [ ] Groupe externe créé (jusqu'à 10 000 testeurs)
- [ ] Description du test et instructions rédigées
- [ ] **Revue Beta Apple** demandée — elle est obligatoire pour l'externe, compter 24 à 48 h
- [ ] Retours collectés et traités

## 12. Avant de soumettre à l'App Review

- [ ] Toutes les cases ci-dessus cochées
- [ ] Notes de revue complétées avec les identifiants du compte de revue
- [ ] Écran d'abonnement revalidé **visuellement** contre Apple 3.1.2
      (durée, prix, renouvellement, CGU, confidentialité, bouton de restauration)
- [ ] Mise en vente réglée sur **manuelle**, pour garder la main sur la date

---

## Interdits pendant toute cette procédure

- ne pas créer de certificat depuis un poste partagé
- ne pas committer un `.p12`, un `.mobileprovision`, un mot de passe — le `.gitignore` les exclut
  déjà, ne pas contourner
- ne pas fournir `julien@elsatia.fr` aux relecteurs
- ne pas activer Associated Domains sans AASA en ligne
- ne pas déclarer une langue sans traduction réelle
