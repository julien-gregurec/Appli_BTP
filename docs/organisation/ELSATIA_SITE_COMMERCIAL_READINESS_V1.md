# ELSATIA — SITE COMMERCIAL READINESS V1

Audit du site `elsatia.fr` et des pages publiques `app.elsatia.fr` avant lancement commercial.
Date : 2026-09-02. **Audit uniquement — aucune modification de site, aucun déploiement, aucun
commit/push, aucune action DNS / Vercel / Stripe / Google Workspace / DB.** Aucun message réel
envoyé via le formulaire de contact.

---

## 0. Périmètre réel et repos identifiés

Deux surfaces publiques distinctes, deux dépôts, deux projets Vercel :

| Surface | Dépôt (local / GitHub) | Vercel | Contenu |
|---|---|---|---|
| **`elsatia.fr`** (site vitrine) | `/Users/juliengregurec/Projects/elsatia-site` — `julien-gregurec/elsatia-site` — `main` @ `a1521e0`, arbre propre | projet `elsatia-site`, région `fra1` | Accueil, `/a-propos`, `/solutions/gestion-pro`, `/contact`, pages légales `/[slug]`, `/api/contact` (Brevo) |
| **`app.elsatia.fr`** (application) | `/Users/juliengregurec/Projects/elsatia-main` — branche **`feat/elsatia-canonical-final-r73-v1`** @ `e65fc05` | projet applicatif | Pages publiques `/`, `/tarifs`, `/login`, `/signup`, `/mentions-legales`, `/cgv`, `/cgu`, `/confidentialite`, `/cookies` + ERP `(app)` authentifié |

**Constat de rattachement de branche (vérifié en direct)** : la Production `app.elsatia.fr` sert le
code de la branche `feat/elsatia-canonical-final-r73-v1` (marque « ELSATIA », grille 69/199/399).
La branche **`main` de `elsatia-main` est périmée** : elle porte encore « Liria Gestion Pro V3 »,
`mailto:contact@liria-gestion-pro.fr` et la grille 79/249/449. Un merge ou un déploiement
accidentel depuis `main` ferait **régresser marque + prix** en Production → voir § 18 (risque
opératoire) et § 2 (blocker B-6).

Méthode : lecture des deux dépôts + navigation en lecture seule sur `elsatia.fr`,
`elsatia.fr/solutions/gestion-pro`, `elsatia.fr/mentions-legales`, `elsatia.fr/robots.txt`,
`app.elsatia.fr/`, `app.elsatia.fr/tarifs`, `app.elsatia.fr/robots.txt`. Aucune donnée saisie.

---

## 1. Inventaire des pages

### 1.1 Site vitrine `elsatia.fr`

| Page | Objectif | État | Cohérente | Manque | Priorité |
|---|---|---|---|---|---|
| `/` | Positionnement marque + Gestion Pro | En ligne | Oui | Colors/Tools absents (§ 4) | RAPIDE |
| `/solutions/gestion-pro` | Fiche produit + grille tarifaire | En ligne | **Partiel** | prix vs app à trancher (§ 7) | **BLOQUANT** |
| `/a-propos` | Vision / marque | En ligne | Oui | — | OK |
| `/contact` | Formulaire de démo/contact (Brevo) | En ligne, validé C1-E | Oui | — | OK |
| `/mentions-legales` (`/[slug]`) | Mentions légales | En ligne | **Non** | bandeau « Document de travail » + « micro-entreprise » + SIREN/SIRET | **BLOQUANT** |
| `/cgv` | CGV | En ligne | **Non** | « Projet de conditions », clauses « à finaliser » | **BLOQUANT** |
| `/cgu` | CGU | En ligne | **Non** | bandeau « Document de travail » | **BLOQUANT** |
| `/confidentialite` | Politique RGPD | En ligne | **Non** | bandeau « Document de travail » ; garanties transfert « à finaliser » | **BLOQUANT** |
| `/cookies` | Politique cookies | En ligne | Oui (sans bandeau, cohérent avec absence de traceurs) | bandeau « Document de travail » à retirer | RAPIDE |
| `/404` | Page non trouvée | En ligne | Oui | — | OK |
| `robots.txt`, `sitemap.xml`, `icon`, `apple-icon`, `/og.png` | SEO/PWA | En ligne | Oui | sitemap `lastModified` figé au 2026-08-26 | RAPIDE |

Pas de `/blog`, pas de `/tarifs` propre (renvoi vers `app.elsatia.fr/tarifs`), pas de pages
Store/App.

### 1.2 Pages publiques `app.elsatia.fr`

| Page | Objectif | État | Cohérente | Priorité |
|---|---|---|---|---|
| `/` | Landing produit (doublon du vitrine) | En ligne, marque ELSATIA | Oui, mais **duplication SEO** avec `elsatia.fr` (§ 17, § 22) | RAPIDE |
| `/tarifs` | Grille détaillée + options + services + FAQ | En ligne, marque ELSATIA, 69/199/399/599 | Cohérente avec le vitrine **en direct** ; incohérente avec `main` + docs P15 (§ 7) | **BLOQUANT** |
| `/login`, `/signup`, `/mot-de-passe-oublié`, `/nouveau-mot-de-passe` | Parcours compte | En ligne | Oui | OK |
| `/mentions-legales`, `/cgv`, `/cgu`, `/confidentialite`, `/cookies` | Légal (rendu depuis `docs/juridique/*.md`) | En ligne, `noindex` | SIREN/SIRET/régime `[À COMPLÉTER]` (marqueurs INTERNES BLOQUANTS présents) | **BLOQUANT** (tracé) |

Éléments obsolètes / à nettoyer :
- **`elsatia-main:main`** (branche non déployée) : `src/app/page.tsx` « Liria Gestion Pro V3 »,
  `src/app/tarifs/page.tsx` `mailto:contact@liria-gestion-pro.fr` + « Aucun numéro de carte
  n'est stocké par **Liria Gestion Pro** », `PiedLegal.tsx` « © Liria Gestion Pro », logo
  `/liria-gestion-pro-logo-v5.png`. **Non visible en Production** mais présent dans le dépôt.
- Clés `localStorage` de repli `liria-*` (`liria-appareil-id`, `liria-dashboard-widgets-v1`,
  `liria-presence-*`, `liria:gps:*`) dans `src/components/*` — internes, invisibles, compat
  ascendante ; non bloquant, à purger lors d'un futur nettoyage.
- `sitemap.ts` (vitrine) : `lastModified` codé en dur `2026-08-26`.
- Liens cassés : **aucun** détecté (le footer vitrine `/mentions-legales…/cookies` résout via
  `legalDocuments` ; `URL_CONTACT_COMMERCIAL = https://elsatia.fr/contact` résout bien sur le
  vitrine).

---

## 2. Incohérences (synthèse blockers)

| # | Incohérence | Où | Gravité |
|---|---|---|---|
| **B-1** | Grille tarifaire non réconciliée : **live = 69/199/399/599** (`elsatia.fr` + `app.elsatia.fr`), mais `elsatia-main:main` = **79/249/449/599** et `docs/organisation/P15_STRIPE_LIVE_PREPARATION.md`, `docs/commercial/ABONNEMENTS_DETAIL_V1.md`, `REMISES_CLIENTS_V1.md` affirment **79/249/449** « cohérents avec Stripe Test/Live ». **Si les Prices Stripe Live sont à 79 €, le premier paiement facturera 79 € à un client qui a vu 69 €.** | site + app + Stripe + docs | **BLOQUANT** |
| **B-2** | Remise annuelle « 2 mois offerts » affichée (annuel = 10× mensuel : 690 = 69×10). À **prouver contre les Price annuels Stripe** ; sur `main` l'annuel était 12× (948 = 79×12) sans remise, avec le même label → fausse remise possible selon la grille retenue. | `/solutions/gestion-pro`, `/tarifs` | **BLOQUANT** |
| **B-3** | Pages légales **publiquement estampillées « Document de travail — À finaliser avant publication commerciale »** ; intros « Projet de conditions », « doit être complété et relu avant toute commercialisation ». | `elsatia.fr/[slug]` (5 pages) | **BLOQUANT juridique** |
| **B-4** | `elsatia-site/src/content/legal.ts` dit encore **« micro-entreprise »** (×3 : mentions légales §1, CGV §2, confidentialité). Contredit la décision **EI, régime micro non arbitré**. | vitrine, pages légales | **BLOQUANT juridique** |
| **B-5** | **SIREN / SIRET / RCS / n° TVA / registre absents** partout (app `[À COMPLÉTER]`, vitrine « à finaliser »). Dépend de l'immatriculation INPI (en attente, revérif post-21-10-2026). | site + app | **BLOQUANT — déjà tracé** dans `GO_LIVE_COMMERCIAL_CHECKLIST.md` |
| **B-6** | Branche `elsatia-main:main` fantôme : marque « Liria », `contact@liria-gestion-pro.fr`, grille 79/249/449. Merge/déploiement accidentel = régression marque + prix en Production. | dépôt `elsatia-main` | **BLOQUANT opératoire** |

---

## 3. Page ELSATIA Gestion Pro

`elsatia.fr/solutions/gestion-pro` — hero clair, 8 modules décrits (Clients & chantiers, Devis &
factures, Planning, Employés & pointage, Notes de frais, Stock & matériel, Rentabilité,
Documents & emails), bloc Sécurité (5 points), bloc Tarifs (grille), bloc Démo.

- **Fonctionnalités annoncées** : toutes correspondent à des modules réellement présents dans
  l'ERP `(app)` (`/chantiers`, `/devis`, `/factures`, `/planning`, `/pointage`, `/notes-frais`,
  `/stock`, `/flotte`, `/rentabilite`, `/exports`). ✔ Pas de survente.
- Modules ERP **non mentionnés** (donc pas de fausse promesse) : CRM, appels d'offres,
  sous-traitants, paiements bancaires, paie complète, connecteurs, boutique, IA — plusieurs sont
  en BETA/DISABLED côté `feature-catalogue.ts`. Cohérent de ne pas les afficher.
- **Sauvegardes non mentionnées** sur cette page (voir § 10).
- `app.elsatia.fr/` (landing app) liste en plus « Borne de scan en atelier », « Trésorerie »,
  « Pointage GPS », « Suivi d'entretien » — tous réels. ✔
- La page app `/tarifs` affiche « Assistant IA » dans les bénéfices Mini **conditionné à
  `iaEstActive()`** (masqué si IA non active en Production). ✔ garde-fou correct.

Manque : aucune capture d'écran réelle de l'app (seulement la maquette CSS `ProductPreview` avec
chiffres fictifs « Bonjour Julien / 12 chantiers / 8 devis » sans mention « aperçu / données
d'exemple » — cf. § 16). À remplacer par des captures UI-V2 au lancement (déjà noté dans
`GO_LIVE_COMMERCIAL_CHECKLIST.md`).

---

## 4. Page ELSATIA Colors

**Inexistante.** Aucune page, aucun lien, aucune mention « Colors » sur le site vitrine ni sur
`app.elsatia.fr`. La homepage vitrine dit « De nouvelles solutions arrivent bientôt » (carte 02,
sans nommer). Colors est en développement métier en parallèle (bucket `colors-seaux` présent,
migrations `20260828000246/247/248`).

- **Non bloquant** : l'absence est honnête (rien de faux annoncé).
- **Décision pilotage requise** : si Colors est commercialisé au lancement → créer
  `/solutions/colors` + carte homepage + tarif (à valider, aucune grille Colors publique
  aujourd'hui, cf. § 8). Sinon, conserver le wording « bientôt ».

---

## 5. Page ELSATIA Tools

**Inexistante.** Idem Colors : aucune page, aucun lien, aucune mention « Tools ». Aucune
référence App Store / Google Play nulle part (conforme : ne rien annoncer avant publication
effective).

- **Non bloquant** (aucune fausse promesse).
- Décision pilotage : `/solutions/tools` (Free/Pro, plateformes réellement disponibles) si
  lancement conjoint, sinon statu quo.

---

## 6. Compte ELSATIA commun

- Le site **n'explique pas** le principe « un compte ELSATIA, mêmes identifiants, accès aux
  applications selon abonnement/habilitation ». La page `/a-propos` parle d'« écosystème » et
  « une marque, plusieurs solutions » mais côté compte utilisateur, rien.
- `docs/architecture/ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md` existe côté app : la V1 doit être
  présentée **sans survendre un SSO complet** si les sessions restent séparées.
- **RAPIDE** : ajouter un court paragraphe honnête (« votre compte ELSATIA donne accès aux
  applications souscrites ; d'autres applications pourront y être ajoutées ») une fois le
  contrat V1 figé. Ne rien affirmer sur un SSO tant que non livré.

---

## 7. Tarifs

**Live (vérifié en direct le 2026-09-02) — identique sur les deux propriétés :**

| Offre | Mensuel HT | Annuel HT | Comptes inclus | Écart vs référence mission (79/249/449) |
|---|---:|---:|---|---|
| Mini | **69 €** | 690 € (« 2 mois offerts ») | 3 | −10 € |
| Pro | **199 €** | 1 990 € | 15 | −50 € |
| Business | **399 €** | 3 990 € | 30 | −50 € |
| Entreprise | **599 €** | 5 990 € | 40 sal. + 10 admin | = |
| Sur mesure | Sur devis | — | Selon contrat | — |

- **Cohérence site vitrine ↔ app : OK en direct** (mêmes montants, même « 2 mois offerts »,
  même essai 30 j, même libellé comptes).
- **Incohérence dépôt/docs/Stripe (B-1, B-2)** : `elsatia-main:main` = 79/249/449 ;
  `P15_STRIPE_LIVE_PREPARATION.md:57` : « Mini 79 €, Pro 249 €, Business 449 €, Entreprise
  599 € — cohérents entre `tarification.ts`, Stripe Test, et la page `/tarifs` » — **faux sur la
  branche déployée**. `SITE_V2_PREVIEW.md` et `COMPTES_SUPPLEMENTAIRES_V1.md` documentent au
  contraire 69/199/399 comme « TARIFS-V2 » volontairement publié. **Deux vérités
  contradictoires dans la documentation.**
- **Action pilotage (hors de ce lot — interdiction de modifier un prix)** : trancher LA grille
  unique et aligner en une passe `{elsatia-site/src/lib/tarifs.ts, elsatia-main
  src/lib/tarification.ts, Prices Stripe Test + Live, page /tarifs, tous les docs commerciaux}`.
  Vérifier explicitement : montant mensuel = Price mensuel Stripe ; montant annuel affiché =
  Price annuel Stripe ; libellé « 2 mois offerts » **uniquement si** annuel = 10× mensuel.
- Mensuel/annuel : présentation claire, colonne annuelle affichée sous le mensuel. ✔
- FAQ `/tarifs` (app) : « Aucun nouveau paiement ne peut être déclenché pendant la fermeture
  temporaire des abonnements », « prix contractuel figé, nouvelle grille sur acceptation
  explicite » — **excellent**. ✔
- Options activables (comptes sup 5/9/15 €, stockage 19 €, packs IA 29/79 €, sync bancaire
  29 €) et « Mise en service accompagnée » (490 → 2 500 €) : affichées « À partir de » / « après
  devis ». ✔ Cohérentes entre `main` et la branche (mêmes valeurs `OPTIONS_TARIFAIRES` /
  `SERVICES_MISE_EN_SERVICE`).

---

## 8. Tarifs Colors / Tools / bundles

- **Aucun prix Colors, aucun prix Tools, aucun bundle** annoncé sur le site. ✔ (rien d'inventé).
- **Manque documenté** : si Colors/Tools sont commercialisés au lancement, il faudra une grille
  publique validée + un principe de bundle (« compte ELSATIA commun » → remise multi-app ?). À
  cadrer par le pilotage ; ne rien publier avant validation.

---

## 9. CTA

| CTA présent | Emplacement | Verdict |
|---|---|---|
| « Demander une démo / démonstration » | header vitrine, hero, bloc démo, `/solutions/gestion-pro` | ✔ adapté avant Stripe Live |
| « Découvrir Gestion Pro / les fonctionnalités » | homepage, `/a-propos` | ✔ |
| « Voir les tarifs » / « Voir les offres en détail » → `app.elsatia.fr/tarifs` | `/solutions/gestion-pro` | ✔ (nouvel onglet, `rel=noreferrer`) |
| « Préparer mon essai de 30 jours » / « Ouverture prochaine » | `app.elsatia.fr/` + `/tarifs` | ✔ honnête, pas de paiement |
| « Demander un devis » (Sur mesure) → `/contact` | `/tarifs`, `/solutions/gestion-pro` | ✔ |
| « Se connecter » | pied de `app.elsatia.fr/tarifs` et header `app.elsatia.fr/` | ⚠ **absent du header/footer du site vitrine** |

- **Aucun CTA « Acheter maintenant » / « S'abonner » prématuré.** ✔
- Garde-fous : `abonnementsPublicsOuverts()` (env `ABONNEMENTS_PUBLICS_OUVERTS`, **fermé par
  défaut**) + `stripeBillingEstConfigure()` → tant que fermé, tous les CTA d'offre pointent vers
  le contact commercial, le bouton dit « Ouverture prochaine ». ✔
- **RAPIDE** : ajouter « Se connecter » (→ `https://app.elsatia.fr/login`) au header et au footer
  du site vitrine.

---

## 10. Sauvegardes

- **Aucune mention « sauvegarde / récupération des données » sur le site** (ni vitrine ni app).
- Le bloc Sécurité de `/solutions/gestion-pro` liste « Infrastructure Production surveillée »,
  « Partage documentaire sécurisé », « RGPD préparé » — **pas** de promesse de backup.
- État réel : DR interne DB + Storage = GO (lots ELSATIA-*-DR), **mais aucune fonction
  d'export/backup client self-service livrée**.
- **Recommandation** : ajouter une phrase honnête et mesurée dans le bloc Sécurité, du type
  « Vos données sont hébergées dans l'Union européenne et font l'objet de sauvegardes
  régulières côté ELSATIA ». **Ne pas** annoncer d'export client automatisé, de backup local ou
  de restauration en autonomie. La réversibilité (export à la résiliation) relève des CGV
  (§ 16, clause « effets de la résiliation sur l'accès et l'export des données » — actuellement
  « à préciser contractuellement »).

---

## 11. Sécurité / confiance

Communication actuelle (vitrine `/solutions/gestion-pro` + `/a-propos`) :
« Séparation des données entre entreprises », « Accès sécurisés », « Infrastructure Production
surveillée », « Partage documentaire sécurisé », « RGPD préparé », hébergement UE.

- **Pas de promesse absolue** type « 100 % sécurisé » — ✔ ; `/a-propos` dit même « sans garantir
  l'absence totale d'erreur », politique confidentialité « aucun système ne pouvant offrir une
  sécurité absolue ». ✔
- **MFA non mentionné** publiquement — cohérent tant que le chemin MFA/AAL2 de Gestion Pro n'est
  pas consolidé (état central). À ajouter au discours confiance **après** consolidation, pas
  avant.
- **Sous-traitants** : listés dans la politique de confidentialité vitrine (Vercel, Brevo) et
  dans `docs/juridique/rgpd-sous-traitants.md` (app : + Supabase, Stripe). « garanties de
  transfert à finaliser » → cf. § 16 blocker.
- **Isolation entreprises** : affirmée ; correspond au RLS multi-tenant réel. ✔

---

## 12. Juridique

Classement (A bloquant / B à finaliser / C post-lancement) :

| Élément | Vitrine | App | Classe |
|---|---|---|---|
| Bandeau « Document de travail » visible sur pages légales | Oui | Non | **A** — retirer avant lancement |
| Mention « micro-entreprise » | Oui (`legal.ts` ×3) | Non (marqueurs INTERNES BLOQUANTS) | **A** — remplacer par « entreprise individuelle (EI) », régime non mentionné tant que non arbitré |
| SIREN / SIRET / RCS / greffe | « à finaliser » | `[À COMPLÉTER]` | **A** — dépend de l'immatriculation INPI |
| N° TVA / mention de TVA | « si applicable, à finaliser » | marqueur INTERNE BLOQUANT | **A** — cf. § 13 |
| Éditeur / directeur publication / adloc / e-mail | Renseignés (J. GREGUREC, 9 rue du Maréchal Leclerc 67860 Rhinau, support@elsatia.fr) | idem | **B** — revérifier contre avis SIRENE à réception |
| Hébergeurs (Vercel Covina, Supabase eu-west-3, Brevo, Stripe IE) | Renseignés, adresses corrigées | idem | **OK** |
| CGV : délai de paiement pro, pénalités de retard, escompte, indemnité 40 € | Indemnité 40 € présente ; délai/pénalités/escompte « à finaliser » | idem | **A** — obligations légales B2B, à compléter |
| CGV : SLA / disponibilité / plafonds de responsabilité / support | « à finaliser » | idem | **B** |
| CGV : durée, renouvellement, résiliation, **réversibilité / export des données** | « à préciser contractuellement » | idem | **A** (réversibilité) / **B** (le reste) |
| CGU | Complètes, cohérentes | idem | **B** — relecture |
| Confidentialité (RGPD) : finalités, base légale, durées (3 ans), droits, CNIL | Présents et corrects | Version app plus détaillée (DPA `docs/juridique/dpa-entreprises-clientes.md`) | **B** — « garanties de transfert prestataires à documenter » = **A** |
| Cookies | « aucun traceur optionnel, pas de bandeau » — cohérent avec le code (aucun analytics) | idem | **OK** — retirer juste le bandeau « Document de travail » |
| DPA entreprises clientes | Renvoi implicite | `docs/juridique/dpa-entreprises-clientes.md` présent | **B** — relecture avocat |
| Relecture avocat | Non faite | Non faite | **A** — `P14_FINALISATION_JURIDIQUE_EI.md` (dossier prêt) |

Ne pas inventer : forme = **EI** (confirmée) ; régime fiscal/social (micro *ou* réel) **non
arbitré** ; TVA **non tranchée** ; SIREN/SIRET **non reçus**. Aucune de ces valeurs ne doit être
« complétée » par ce lot.

---

## 13. TVA

- **Aucune mention `TVA non applicable, article 293 B du CGI` publiée** aujourd'hui (ni site ni
  app). Vitrine : « Numéro de TVA intracommunautaire, si applicable : à finaliser ». App :
  marqueur INTERNE BLOQUANT (« franchise en base art. 293 B *ou* assujettissement selon le
  régime arbitré »).
- **Point à confirmer avant publication juridique finale**, pas à trancher ici. Si le régime
  retenu implique la franchise en base → la mention « TVA non applicable, art. 293 B du CGI »
  devra figurer sur **devis, factures, CGV et mentions légales** de façon cohérente. Si
  assujettissement → n° de TVA intracommunautaire à afficher.
- Tous les prix affichés sont « HT » — neutre vis-à-vis du régime, à conserver.

---

## 14. Entreprise

| Donnée | Valeur affichée | Statut |
|---|---|---|
| Nom commercial | ELSATIA | ✔ (distinct de « ELSATIA Gestion Pro », le produit) |
| Exploitant | Julien GREGUREC, entrepreneur individuel (EI) | ✔ (à revérifier avis SIRENE) |
| Adresse | 9 rue du Maréchal Leclerc, 67860 Rhinau, France | ✔ (retenue pour immatriculation, à revérifier) |
| E-mail support | support@elsatia.fr | ✔ opérationnel (P14B) |
| E-mail contact commercial (réception formulaire) | commercial@elsatia.fr (via expéditeur contact@elsatia.fr) | ✔ validé C1-E |
| Téléphone | aucun (choix assumé) | ✔ |
| SIREN/SIRET/RCS/APE | absents | ⛔ immatriculation en attente |

Aucune information obsolète détectée (adresse Vercel corrigée en P13/P14, prestataire e-mail =
Brevo partout).

---

## 15. Contact

- Formulaire `/contact` (vitrine) → `POST /api/contact` → Brevo. **Validé de bout en bout en
  C1-E le 21-08-2026** : réception réelle confirmée sur `commercial@elsatia.fr`, `Reply-To` =
  adresse saisie.
- Durcissement en place : honeypot `website` sr-only, délai min 2 s / max 24 h entre montage et
  envoi, bornes de longueur, liste fermée de sujets, regex e-mail, **rate-limit 5 tentatives /
  15 min par IP**, échappement HTML de tous les champs libres, **timeout 8 s sur l'appel
  Brevo** (ajout C1-E) avec 502 contrôlé.
- Zone de statut accessible (`role="status" aria-live="polite"`), erreurs par champ
  (`aria-describedby`).
- Limite connue : rate-limit **en mémoire**, non partagé entre instances serverless —
  acceptable au volume actuel, à revoir si abus.
- **Aucun test réel envoyé par ce lot** (conforme § 19 : pas de message réel sans autorisation).
- Champs collectés : prénom, nom, entreprise, e-mail pro, téléphone (fac.), effectif (fac.),
  sujet, message — cohérent avec la politique de confidentialité (finalité, base légale intérêt
  légitime / mesures précontractuelles, durée 3 ans).

---

## 16. Mobile

Audit statique (CSS modules + composants ; rendu non exécuté aux largeurs cibles) :

- **Header vitrine** : bouton menu `.menuButton` + `.mobileNav` avec `aria-expanded` /
  `aria-controls` / `hidden`, fermeture au clic d'un lien. Structure correcte.
- CTA header « Demander une démo » : présent aussi dans le menu mobile (`.mobileCta`). ✔
- Grilles (`solutionGrid`, `benefitGrid`, `moduleGrid`, `planGrid`, `functionGrid`) en
  CSS Grid → à vérifier visuellement à **390 px** et **430 px** qu'aucune carte ne déborde et
  que la grille tarifaire (5 offres) passe en colonne unique.
- `app.elsatia.fr/tarifs` : tableau comparatif dans un conteneur `overflow-x-auto` +
  `min-w-[850px]` → scroll horizontal maîtrisé sur mobile. ✔
- C1-E a vérifié `/contact` « Mobile (390px) sans débordement ».
- **Blockers mobiles** : aucun identifié en statique. **À exécuter** : passe visuelle 390/430 px
  sur `/`, `/solutions/gestion-pro` (grille tarifaire), `/contact`, pages légales — porté à la
  checklist § 18.

---

## 17. Accessibilité (audit léger)

Points positifs :
- `<html lang="fr">` sur les deux surfaces.
- Skip link « Aller au contenu principal » (vitrine) + `id="contenu-principal"` sur chaque
  `main`.
- Nav `aria-label`, menu mobile `aria-expanded`/`aria-controls`, `aria-label` dynamique
  ouvrir/fermer.
- Formulaire contact : `role="status" aria-live="polite"`, erreurs `aria-describedby`.
- Icônes décoratives en `aria-hidden="true"` ; liens externes annoncés « (nouvel onglet) » en
  `sr-only`.
- Favicons générés (`icon.tsx`, `apple-icon.tsx`), OG image `/og.png` 1536×1024.

À corriger / vérifier :
- **`ProductPreview`** (`/solutions/gestion-pro`) : maquette avec données fictives (« Bonjour
  Julien », « 12 chantiers ») **sans libellé visible** indiquant une simulation → ajouter un
  microcopy visible « Aperçu — données d'exemple » (évite toute lecture comme donnée réelle). Le
  `aria-label="Aperçu de l'interface"` ne suffit pas visuellement. **RAPIDE.**
- Image de fond du hero vitrine (`/hero-software-ai.png`) : `alt` descriptif long alors qu'elle
  est décorative → passer `alt=""`. **RAPIDE.**
- Contrastes : **non mesurés** (rendu non exécuté). À vérifier sur les textes gris clair
  (`sectionEyebrow`, `planAnnual`, footer) — porté à la checklist.
- Focus visible : non vérifié en exécution — à contrôler au clavier sur nav + formulaire + CTA.

Pas de refonte demandée ; ces points sont des ajustements ponctuels.

---

## 18. SEO de base

| Élément | `elsatia.fr` | `app.elsatia.fr` |
|---|---|---|
| `robots.txt` | ✔ `Allow: /`, `Disallow: /api/`, `Sitemap:` déclaré (indexation activée en Prod via `NEXT_PUBLIC_SITE_INDEXABLE=true`) | ⛔ **404 — aucun `robots.txt`** |
| `sitemap.xml` | ✔ 4 URLs (`/`, `/solutions/gestion-pro`, `/a-propos`, `/contact`), pages légales exclues (cohérent) ; `lastModified` figé 2026-08-26 | ⛔ **absent** (`elsatia-main` n'a ni `robots.ts` ni `sitemap.ts`) |
| `<title>` / `meta description` | ✔ template `%s — ELSATIA`, descriptions par page | ✔ par page |
| `canonical` | ✔ `alternates.canonical` par page | ⚠ **absent** sur `/` et `/tarifs` |
| OpenGraph / Twitter card | ✔ complet, image `/og.png` | ⚠ OG minimal (layout), pas d'image OG dédiée |
| `robots` par page sensible | ✔ pages légales `index:false` | ✔ pages légales `index:false` ; `(app)` protégées par redirection auth |
| Favicon | ✔ généré | ✔ `icons/` PWA (pas de `<link rel=icon>` explicite dans le layout) |

**Problème SEO principal (RAPIDE/IMPORTANT)** : `app.elsatia.fr/` et `app.elsatia.fr/tarifs`
**dupliquent** le contenu marketing de `elsatia.fr` (mêmes mots-clés « logiciel gestion BTP »,
« tarifs ELSATIA Gestion Pro ») **sans `canonical`** et sans `robots.txt` sur le domaine app →
cannibalisation SEO entre les deux domaines. Options (décision pilotage) :
1. `noindex` sur `app.elsatia.fr/` et `/tarifs` + laisser `elsatia.fr` porter ces mots-clés ; ou
2. rediriger `app.elsatia.fr/` (visiteur anonyme) vers `elsatia.fr` ; ou
3. ajouter `canonical` vers l'URL vitrine correspondante + un `robots.txt` applicatif
   (`Disallow` des pages authentifiées).

Autres : `app.elsatia.fr` devrait exposer un `robots.txt` (au minimum `Disallow: /` sur les
routes `(app)` et l'API). `sitemap.ts` vitrine : rendre `lastModified` dynamique ou l'actualiser
à chaque publication.

---

## 19. Blockers (récapitulatif priorisé)

**BLOQUANT — information fausse / prix / juridique critique**
1. **B-1** Grille tarifaire non réconciliée site/app (69/199/399) ↔ `main` + docs P15 ↔ Stripe
   (79/249/449). Trancher une grille unique et l'aligner partout, **Stripe Live compris**, avant
   tout paiement réel.
2. **B-2** Prouver que l'annuel affiché = Price annuel Stripe et que « 2 mois offerts » n'est
   écrit que si annuel = 10× mensuel.
3. **B-3** Retirer le bandeau « Document de travail » et les intros « projet / à finaliser » des
   pages légales publiées.
4. **B-4** Remplacer « micro-entreprise » par « entreprise individuelle (EI) » dans
   `elsatia-site/src/content/legal.ts` (3 sections) ; ne pas mentionner de régime tant que non
   arbitré.
5. **B-5** Compléter SIREN/SIRET/RCS/greffe/TVA (site + app) — après réception INPI + arbitrage
   régime + relecture avocat. **Déjà tracé** dans `GO_LIVE_COMMERCIAL_CHECKLIST.md`.
6. **B-6** Neutraliser la branche `elsatia-main:main` périmée (fast-forward vers la branche
   canonique, ou protection de branche) pour éviter une régression marque « Liria » + prix
   79/249/449 en Production.
7. CGV : compléter délai de paiement B2B, pénalités de retard, escompte, **clause de
   réversibilité / export des données** à la résiliation (obligations légales + attente client).

**RAPIDE — wording / responsive / SEO / illustrations**
8. Ajouter `robots.txt` (+ éventuel `sitemap`) et/ou `canonical` + stratégie anti-duplication
   sur `app.elsatia.fr` (§ 18).
9. Ajouter « Se connecter » au header/footer du site vitrine.
10. `ProductPreview` : microcopy « Aperçu — données d'exemple ».
11. Hero vitrine : `alt=""` sur l'image décorative.
12. `sitemap.ts` : `lastModified` non figé.
13. Passe visuelle mobile 390/430 px (accueil, grille tarifaire, contact, légal) + contrôle
    contrastes + focus clavier.
14. Retirer le bandeau « Document de travail » de `/cookies` (page par ailleurs correcte).
15. Purger les clés `localStorage` `liria-*` de repli (nettoyage, non urgent).

**POST-COMMERCIALISATION**
16. Pages `/solutions/colors` et `/solutions/tools` **si** lancement conjoint (sinon garder
    « bientôt »).
17. Section « compte ELSATIA commun » (honnête, sans survendre un SSO).
18. Alignement visuel site ↔ app sur la charte **UI-V2** figée (navy/gold) au déploiement R3.
19. Blog, cas clients, landing pages par métier, comparateurs, SEO avancé.
20. Captures d'écran commerciales réelles UI-V2 (site + futurs Stores).

---

## 20. Quick wins (déployables sans décision produit)

- `alt=""` sur `/hero-software-ai.png`.
- Microcopy « Aperçu — données d'exemple » sous `ProductPreview`.
- « Se connecter » (→ `app.elsatia.fr/login`) dans header + footer vitrine.
- `robots.txt` applicatif minimal sur `app.elsatia.fr` (`Disallow` routes privées + `/api`).
- `sitemap.ts` : `lastModified: new Date()` ou date de build.
- Retrait du bandeau « Document de travail » sur `/cookies` uniquement (contenu déjà conforme).
- Purge des clés `liria-*` en repli localStorage.

(Aucun de ces items ne touche prix, juridique de fond, MFA, Stripe, ACL, Colors métier ni le
code critique Gestion Pro.)

---

## 21. Plan de mise à jour du site

**Étape 1 — Décisions pilotage (préalable, hors code)**
- Trancher LA grille tarifaire unique (69 vs 79…) et la porter dans Stripe Test **et** Live.
- Confirmer le modèle annuel (remise réelle ou non) et le libellé associé.
- Statuer sur la présence de Colors / Tools au lancement (pages dédiées ou « bientôt »).
- Arbitrer le régime fiscal/social de l'EI avec l'expert-comptable → débloque TVA + mentions.

**Étape 2 — Juridique (dépôt `elsatia-site` + `elsatia-main/docs/juridique`)**
- Retirer le bandeau « Document de travail » et les intros « projet ».
- `legal.ts` : « micro-entreprise » → « entreprise individuelle (EI) », sans mention de régime.
- Injecter SIREN/SIRET/RCS/greffe + mention de TVA conforme au régime arbitré (site + app,
  cohérence stricte devis/factures/CGV/ML).
- Compléter les clauses CGV B2B (paiement, pénalités, escompte, réversibilité, SLA, support).
- Relecture avocat (dossier `P14_FINALISATION_JURIDIQUE_EI.md`).

**Étape 3 — Cohérence marque & prix**
- Aligner `elsatia-site/src/lib/tarifs.ts` et `elsatia-main/src/lib/tarification.ts` sur la
  grille tranchée ; vérifier l'affichage = Prices Stripe.
- Fast-forward / neutralisation de `elsatia-main:main` (fin de la marque « Liria »).

**Étape 4 — SEO & UX (quick wins § 20)**
- `robots.txt`/`canonical` app, anti-duplication, `sitemap` dynamique, « Se connecter »,
  `alt`, microcopy maquette.

**Étape 5 — Contenu produit (optionnel selon Étape 1)**
- `/solutions/colors`, `/solutions/tools`, section « compte commun », captures UI-V2.

**Étape 6 — Vérifications avant GO public**
- Passe mobile 390/430, contrastes, focus clavier.
- Test réel du formulaire `/contact` (avec autorisation).
- Bascule indexation confirmée (`elsatia.fr` déjà indexable ; vérifier après retrait des
  bandeaux que Google réindexe les pages légales finalisées).
- `GO_LIVE_COMMERCIAL_CHECKLIST.md` : cocher « Site vitrine », « Formulaire Contact »,
  « Documents juridiques finalisés », « Captures UI-V2 », « GO commercial public unique ».

---

## 22. Estimation de temps (indicative, hors délais externes INPI / avocat / expert-comptable)

| Bloc | Charge estimée |
|---|---|
| Étape 1 — décisions pilotage | réunion(s), non chiffrable ici |
| Étape 2 — juridique (rédaction + intégration `legal.ts` + `docs/juridique`) | 0,5–1 j de code + relecture avocat (externe) |
| Étape 3 — alignement marque & prix (site + app + Stripe + docs) | 0,5–1 j (dont recette Stripe Test) |
| Étape 4 — quick wins SEO/UX | 0,5 j |
| Étape 5 — pages Colors/Tools + section compte commun (si retenu) | 1–2 j |
| Étape 6 — vérifications mobile/a11y/contact + checklist | 0,5 j |
| **Total code/site (hors externes)** | **≈ 3–5 jours**, dont ~1 j de quick wins sans décision |

---

## Verdict

- Structure du site vitrine : **saine** (positionnement marque honnête, CTA non prématurés,
  contact durci et validé, SEO de base présent, a11y correcte).
- Cohérence **site ↔ app en direct** : **OK** sur la marque (ELSATIA partout en Production) et
  sur les prix affichés (69/199/399/599 identiques).
- **Mais** incohérences commerciales réelles non résolues : grille tarifaire non réconciliée
  entre le live, la branche `main`, les docs P15 et (à prouver) Stripe ; remise annuelle à
  prouver ; pages légales publiquement estampillées « brouillon » ; mention « micro-entreprise »
  en ligne contraire à la décision EI ; SIREN/SIRET/TVA absents ; branche `main` fantôme
  « Liria » exposant à une régression.

ELSATIA-SITE-COMMERCIAL-READINESS-V1 NO-GO — INCOHÉRENCES COMMERCIALES À TRAITER
