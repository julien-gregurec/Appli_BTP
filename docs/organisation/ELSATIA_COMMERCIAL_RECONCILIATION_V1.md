# ELSATIA — COMMERCIAL RECONCILIATION V1

Réconciliation des sources de vérité commerciales (tarifs, Stripe, annuel, juridique, branche
`main`) avant toute modification du site.
Date : 2026-09-02. **Lecture seule.** Aucun prix modifié, aucun Price Stripe modifié, aucun
déploiement, aucun commit/push, aucune fusion. Aucun secret affiché.

---

## 0. Résumé exécutif

Il existe **deux grilles tarifaires « canoniques » concurrentes**, adoptées à quelques jours
d'écart par des lots différents, jamais réconciliées entre elles :

| Grille | Mini | Pro | Business | Entreprise | Annuel | Où elle vit |
|---|---:|---:|---:|---:|---|---|
| **A — « TARIFS-V2 » (69)** | 69 € | 199 € | 399 € | 599 € | 10× mensuel (« 2 mois offerts ») | **elsatia.fr + app.elsatia.fr (LIVE)**, branche déployée `tarification.ts`, `elsatia-site/tarifs.ts` |
| **B — « SaaS V1 » (79)** | 79 € | 249 € | 449 € | 599 € | ≈12× mensuel, **Entreprise −10 %** (6 468 €/an) | `elsatia-main:main` (non déployée), **Prices Stripe Test câblés au Checkout**, `P15_STRIPE_LIVE_PREPARATION.md`, `ABONNEMENTS_DETAIL_V1/1B/1C`, `RELAIS_TARIFICATION_2026-07-22` |

**Le point de rupture** : les deux sites affichent la grille **A (69 €)**, mais les variables
`STRIPE_PRICE_*` réellement passées au Checkout pointent (d'après la doc P15/V1C, confirmée par
abonnements Test réels) sur les Prices de la grille **B (79 €, annuel 948 €)**. Si
`ABONNEMENTS_PUBLICS_OUVERTS` passait à `true`, un client choisissant « Mini annuel — 690 € ·
2 mois offerts » atterrirait sur un Checkout Stripe à **948 €**.

**Atténuation en vigueur** : `ABONNEMENTS_PUBLICS_OUVERTS=false` partout → aucune souscription
réelle possible aujourd'hui. Le risque est **latent**, pas actif. Mais c'est un bloqueur absolu
à l'ouverture des abonnements et au passage Stripe Live.

**Réconciliable ?** Oui — toutes les pièces sont disponibles. Il manque **une décision humaine
sur LA grille** + un audit/rebuild des Prices Stripe. → verdict : *décisions à arbitrer*.

---

## 1. Matrice des tarifs (toutes occurrences)

Prix mensuels HT. `utilisée` = réellement lue par du code servi en Production.

| Source | Mini | Pro | Business | Entreprise | Sur mesure | Statut | Date / commit | Utilisée ? |
|---|---:|---:|---:|---:|---|---|---|---|
| `elsatia-main` `src/lib/tarification.ts` (branche `feat/elsatia-canonical-final-r73-v1`, **déployée**) | 69 | 199 | 399 | 599 | devis | **grille A** | `e04c2ef` 2026-08-26 « synchroniser TARIFS-V2 en preview » | **OUI** (page `/tarifs`, `/`, recommandation offre) |
| `elsatia-main` `src/lib/tarification.ts` @ **`main`** | 79 | 249 | 449 | 599 | 699 | grille B | `1ca321c` 2026-07-29 « nouvelle tarification SaaS » | NON (`main` non déployée) |
| `elsatia-main` `src/lib/tarification.test.ts` (branche) | 6900/19900/39900/59900 c | | | | | **invariant `annuel === mensuel × 10`** | branche | pin de test |
| `elsatia-main` `src/lib/tarification.test.ts` @ `main` | | | | annuel `646_800` c | | invariant Entreprise −10 % annuel | `main` | pin de test |
| `elsatia-site` `src/lib/tarifs.ts` (`TARIFICATION_VERSION="TARIFS-V2"`) | 69 | 199 | 399 | 599 | devis | **grille A** | `c08c721` « publier la grille TARIFS-V2 » | **OUI** (`/solutions/gestion-pro`, section Tarifs) |
| `docs/organisation/TARIFS_V2_APP_PREVIEW.md` | 69 | 199 | 399 | 599 | devis | grille A — « source canonique appliquée » | 2026-08-26 | doc |
| `elsatia-site/docs/SITE_V2_PREVIEW.md` | 69 | 199 | 399 | 599 | devis | grille A — « source tarifaire validée : TARIFS-V2 » | 2026-08-26 | doc |
| `docs/commercial/SCRIPT_DEMO_ELSATIA.md` | 69 | 199 | 399 | 599 | — | grille A | — | doc démo |
| `docs/commercial/KIT_PROSPECTION_ELSATIA.md` | « à partir de 69 €/mois » | | | | | grille A | — | doc prospection |
| `docs/organisation/P15_STRIPE_LIVE_PREPARATION.md` § 5-6 | 79 | 249 | 449 | 599 | — | **grille B — « confirmés »**, « cohérents entre tarification.ts, Stripe Test et /tarifs » | maj ≤ 2026-08-23 | doc — **affirmation fausse pour la branche déployée** |
| `docs/commercial/ABONNEMENTS_DETAIL_V1.md` | 79 | 249 | 449 | 599 | — | grille B | — | doc |
| `docs/commercial/ABONNEMENTS_DETAIL_V1B.md` | 79 / 948 an | 249 / 2988 | 449 / 5388 | 599 / 6468 | — | grille B, annuel ×12 | — | doc |
| `docs/commercial/ABONNEMENTS_DETAIL_V1C.md` § 6, 10 | 79,00 € (fixture réelle) ; Mini annuel **948 €** (`prixAnnuelCentimes: 94_800` « confirmé dans le code ») | | | | | grille B — **vérifié en Stripe Test réel** | 2026-08 | doc + preuve fixture |
| `docs/organisation/COMPTES_SUPPLEMENTAIRES_V1.md` (Écart 1) | « TARIFS-V2 à 69 € » = **jeu de test obsolète**, Preview repointé sur 79 €/948 € | | | | | grille A **déclarée périmée**, Stripe repointé grille B | 2026-08-23 | doc + preuve fixture |
| `docs/organisation/REGISTRE_CENTRAL.md`, `CHECKLIST_LANCEMENT.md`, `FINAL_AUDIT_PRE_PUBLICATION.md`, `FINAL_FIX_P1_V1.md` | mentions mixtes 69 et 79 | | | | | historique | — | doc |
| `docs/juridique/cgv.md` art. 4.1 | offres « Essentiel, Pro, Premium » (**noms obsolètes**), aucun montant | | | | | incohérent | v1.0 21/08/2026 | **rendu sur `app.elsatia.fr/cgv`** |

Faux positifs écartés (nombres 69/79/199/249/399/449/599 non tarifaires) : `src/lib/security/validation.ts`
et `src/app/actions/multi-app.ts` (quantificateurs regex `{1,79}` / `{1,80}`) ;
`src/lib/comparatif-offres.test.ts`, `src/lib/tva.test.ts` (montants de test arbitraires).

**Constat** : une seule représentation interne dans `elsatia-main` (`OFFRES_TARIFAIRES`,
ré-exportée par `plateforme.ts` sous `OFFRES` — pas de duplication). `elsatia-site/tarifs.ts`
est une **copie manuelle indépendante**. Aucun montant n'est codé en dur ailleurs dans le
produit (vérifié — cf. `ABONNEMENTS_DETAIL_V1C` § 10 : la formule annuelle lit
`prixAnnuelCentimes`, rien n'est figé).

---

## 2. Matrice Stripe (d'après code + docs, sans accès à l'API ni aux secrets)

**Mécanisme** (`src/lib/stripe-abonnement.ts`) : `creerSessionAbonnementStripe` →
`prixStripePour(offre, periodicite)` → lit la variable d'env `STRIPE_PRICE_<OFFRE>_<PERIODICITE>`
→ `line_items[0][price]` du Checkout. **Le montant facturé est celui du Price Stripe référencé,
jamais un nombre issu de `tarification.ts`.** L'essai = `subscription_data[trial_period_days] =
DUREE_ESSAI_JOURS` (30). `allow_promotion_codes: true`. `automatic_tax` activé seulement si
`STRIPE_AUTOMATIC_TAX_ENABLED=true`.

**Prices Test câblés au Checkout Production (mode Test)** — source `P15_STRIPE_LIVE_PREPARATION.md`
§ 4-7, corroborée par abonnements Test réels (`sub_1U7XXN…` Mini annuel = 948 € affiché au
Checkout ; fixtures `ABONNEMENTS_DETAIL_V1C`) :

| Offre | `STRIPE_PRICE_*_MENSUEL` | mensuel | `STRIPE_PRICE_*_ANNUEL` | annuel | annuel / mensuel |
|---|---|---:|---|---:|---|
| Mini | `price_1Tzi6A0…` | **79 €** | `price_1Tzi6O0…` | **948 €** | ×12,0 |
| Pro | `price_1Tzi6j0…` | **249 €** | `price_1Tzi6q0…` | **2 988 €** | ×12,0 |
| Business | `price_1Tzi6u0…` | **449 €** | `price_1Tzi6y0…` | **5 388 €** | ×12,0 |
| Entreprise | `price_1Tzi710…` | **599 €** | `price_1Tzi750…` | **6 468 €** | ×10,8 (**−10 %**) |

Autres objets Stripe Test (P15 § 4) :
- **Grille `elsatia_tarifs_v2_*`** (metadata `environnement=test-preview`, 8 Prices sur les mêmes
  4 produits) : **non référencée par aucune variable d'env** → non branchée. C'est *probablement*
  la grille A (69 €) — `COMPTES_SUPPLEMENTAIRES_V1` mentionne « Prices `TARIFS-V2` à 69 €/57,50 € ».
  **P15 : « à clarifier avec Julien avant Live : grille active ou expérimentation abandonnée. »**
- `STRIPE_PRICE_COMPTE_SUP_{MINI,PRO,BUSINESS,ENTREPRISE}_{MENSUEL,ANNUEL}` : **variables
  absentes en Preview ET Production** ; `reconcilierAbonnementStripe` échoue silencieusement
  (`prix_supplement_absent`) → **aucun compte supplémentaire au-delà du quota n'est facturé
  aujourd'hui, dans aucun environnement** (P15 § 7, lot `COMPTES-SUPPLEMENTAIRES-V1`).
- `STRIPE_PRICE_COMPTE_SUP_{ADMINISTRATIF,CHEF_EQUIPE,TERRAIN}_*` (6 vars, Preview) : lues par
  aucun code — résidu.
- `STRIPE_PRICE_ESSENTIEL_*` / `STRIPE_PRICE_PREMIUM_*` : offres historiques, compat uniquement.
- `STRIPE_PRICE_OPTION_IA_{100,300,ILLIMITE}_*` : options IA, mécanisme distinct.
- **Aucune valeur Live** (`sk_live_`, Prices Live) n'existe (P15 § 8). Mapping Live = « À CRÉER ».
- Aucun garde-fou applicatif Test vs Live : l'isolation repose uniquement sur la séparation des
  variables Vercel par déploiement.

**Conclusion Stripe** : les Prices actifs = **grille B, annuel ×12 (Entreprise −10 %)**. La
grille A n'existe en Stripe que comme jeu `elsatia_tarifs_v2_*` non branché, statut incertain.

---

## 3. Annuel — vérification mathématique

Règle « 2 mois offerts » ⟹ annuel attendu = **10 × mensuel**.

| Grille / source | Mini an | Pro an | Business an | Entreprise an | = 10× mensuel ? | Verdict |
|---|---:|---:|---:|---:|---|---|
| **A — sites LIVE + branche `tarification.ts`** | 690 | 1 990 | 3 990 | 5 990 | **oui** (invariant testé) | **cohérent en interne** — « 2 mois offerts » exact |
| **B — Stripe Test câblé** | 948 | 2 988 | 5 388 | 6 468 | non (×12 ; Entreprise ×10,8) | cohérent en interne (**aucune** remise annoncée, sauf Entreprise −10 %) |
| **B — `elsatia-main:main` code** | 948 | 2 988 | 5 388 | 6 468 (=539 €/mois) | non (×12) | cohérent : page `main` **n'affiche pas** « 2 mois offerts », Entreprise « 539 €/mois en annuel » |
| `docs/juridique/cgv.md` art. 4.3 | — | — | — | — | — | **« remise annuelle indicative −20 % »** : 3ᵉ valeur, incompatible A et B |

**Classement final : INCOHÉRENT entre sources.**
- A (affiché aux clients) **promet une remise de 2 mois** (≈ 16,7 %) que **Stripe n'accorde pas**
  (Stripe = ×12, remise 0 %, sauf Entreprise ≈ 10 %).
- B est cohérent Stripe ↔ `main` mais n'est pas ce qui est affiché.
- Les CGV publiées parlent d'une **3ᵉ règle (−20 %)**.
→ 3 modèles annuels différents en circulation : **2 mois offerts (A)**, **×12 sans remise (B/Stripe)**,
**−20 % (CGV)** — plus l'exception **Entreprise −10 %** (B).

---

## 4. Source de vérité unique — architecture proposée (non implémentée)

Objectif : **un seul catalogue**, consommé sans re-saisie par le site vitrine, l'app et le
mapping Stripe.

```
elsatia-main/src/lib/tarification.ts   ← CATALOGUE CANONIQUE (déjà la seule vraie source de l'app)
        │  OFFRES_TARIFAIRES : { cle, base, prixMensuelCentimes, prixAnnuelCentimes,
        │                        comptesInclus, parCompteSup, stockageGoInclus,
        │                        operationsIAIncluses, stripePriceEnv:{mensuel,annuel} }
        │  + invariant testé : annuelCentimes === f(mensuel)  (10× OU 12× — au choix, mais UN seul)
        │  + TARIFICATION_VERSION (ex. "V3-2026-XX") tamponnée
        │
        ├── app.elsatia.fr : consomme directement (déjà le cas)
        │
        ├── elsatia-site : NE PLUS recopier. Deux options :
        │     (a) package partagé `@elsatia/tarifs` versionné (les deux repos en dépendance) ;
        │     (b) fichier généré : un script CI exporte tarification.ts → elsatia-site/src/lib/tarifs.generated.json,
        │         commit bloqué si divergence (garde-fou `verify:tarifs`).
        │
        └── Stripe : test `verify:stripe-prices` (CI + pré-Live) qui, pour chaque offre×périodicité,
              récupère le Price pointé par STRIPE_PRICE_* et compare unit_amount au catalogue.
              Échec = build rouge. (lecture seule ; clé Test/Live selon l'environnement)
```

Principes :
- **Aucune duplication manuelle** : le site consomme, il ne redéfinit pas.
- **La formule annuelle est une propriété du catalogue**, testée, pas un libellé marketing libre.
- **Stripe est vérifié contre le catalogue**, jamais l'inverse ; les Prices restent créés
  manuellement (opération financière explicite, cf. `DECISIONS_TARIFICATION_NON_RECOMMANDEES.md`).
- `TARIFICATION_VERSION` + `historique_tarification` (déjà en base) tracent chaque grille ;
  les contrats en cours restent figés (CGV art. 4.4 / FAQ `/tarifs`).

**Ne pas implémenter sans feu vert** (touche `tarification.ts` + CI des deux repos).

---

## 5. Branche `elsatia-main:main` fantôme

| Mesure | Valeur |
|---|---|
| `merge-base(main, HEAD déployé)` | `4d92ddb` — 2026-07-29 |
| Divergence `main…HEAD` | **692 fichiers, +61 780 / −1 413 lignes** |
| Contenu manquant sur `main` | rebrand ELSATIA complet (marque, logo, wordmark), app **Colors** entière (`apps/colors/**`), MFA/AAL2, réconciliation ACL, lots R7x, e2e sécurité… |
| Marque sur `main` | `src/app/page.tsx` « **Liria Gestion Pro V3** » + `/liria-gestion-pro-logo-v5.png` ; `src/app/tarifs/page.tsx` « **Liria Gestion Pro** » + `mailto:contact@liria-gestion-pro.fr` ; `PiedLegal.tsx` « © Liria Gestion Pro » |
| Tarifs sur `main` | **grille B (79/249/449/599)** |
| Risque | un `merge main` ou un déploiement pointé sur `main` **régresse tout** (marque, prix, Colors, MFA, ACL) — pas seulement le commercial |

Sur la branche déployée, « Liria » ne subsiste que dans : `src/lib/qr-identification.ts`
(commentaire — préfixe `LGP` sur étiquettes physiques existantes, compat volontaire) et
`src/lib/ai/brand.test.ts` (**garde-fou** qui vérifie l'absence de « Liria ») + clés
`localStorage` de repli `liria-*` (invisibles). Aucune chaîne visible.

**Stratégie sûre recommandée (aucune fusion faite) :**
1. **D + A immédiats** : note « ⚠️ NE PAS DÉPLOYER `main` — branche pré-ELSATIA obsolète, voir
   `docs/organisation/ELSATIA_COMMERCIAL_RECONCILIATION_V1.md` » en tête de `README.md` ;
   **protection de branche GitHub** sur `main` (interdire push direct + exiger PR) ; vérifier
   que le projet Vercel Production est bien épinglé sur `feat/elsatia-canonical-final-r73-v1` et
   **pas** sur « Production Branch = main ».
2. **C plus tard (opération contrôlée, hors de ce lot)** : quand la branche canonique est
   validée pour devenir la référence, faire `main` → fast-forward/`reset --hard` vers le commit
   canonique (ou renommer la branche canonique en `main` et archiver l'ancienne `main` en
   `archive/main-pre-elsatia-2026-07`).
3. **B (archivage logique)** : tag `archive/liria-main-<date>` sur l'actuel `main` avant l'étape C,
   pour conserver l'historique sans branche « vivante » trompeuse.

---

## 6. Juridique — mentions incohérentes

Rendu : `app.elsatia.fr/{mentions-legales,cgv,cgu,confidentialite,cookies}` ← `docs/juridique/*.md` ;
`elsatia.fr/{…}` ← `elsatia-site/src/content/legal.ts`.

| Mention | `docs/juridique` (app) | `elsatia-site/legal.ts` (vitrine) | Classe | Correct attendu |
|---|---|---|---|---|
| Forme juridique | `mentions-legales.md` : « entrepreneur individuel (entreprise individuelle — EI) » ✔ ; `README.md` : « EI … régime micro non confirmé » ✔ | « entreprise individuelle en cours d'immatriculation **(micro-entreprise)** » ✗ (×2) | **A** | **EI** (confirmée) — retirer « micro-entreprise » du site |
| Régime fiscal / social | `mentions-legales.md` : **marqueur INTERNE BLOQUANT** « micro ou réel à arbitrer, ne pas publier » ✔ **MAIS** `cgv.md` art. 4.2 : « **TVA non applicable, article 293 B** … franchise en base » ✗ (assertion d'un régime non arbitré) | « (micro-entreprise) » ✗ | **C** (arbitrage expert-comptable) | non tranché — aucune assertion publique de régime |
| TVA | `mentions-legales.md` : marqueur bloquant ✔ ; `cgv.md` art. 4.2 & 29 : « TVA non applicable 293 B » **publié** ✗ | « n° TVA intracommunautaire, si applicable : à finaliser » ~ | **B/C** | dépend du régime — cohérence stricte devis/factures/CGV/ML |
| SIREN / SIRET / RCS / greffe / APE | `[À COMPLÉTER]` | « à finaliser avant publication commerciale » | **B** | en attente immatriculation INPI/INSEE |
| Adresse siège | 9 rue du Maréchal Leclerc, 67860 Rhinau, France (à revérifier avis SIRENE) | idem | **A→B** | connue, revérif SIRENE à réception |
| Nom exploitant | Julien GREGUREC (à revérifier SIRENE) | idem | **A→B** | connu, revérif SIRENE |
| Noms d'offres (CGV) | `cgv.md` art. 4.1 : « **Essentiel, Pro, Premium** » ✗ | CGV vitrine : « Mini, Pro, Business et Entreprise » ✔ | **A** | Mini/Pro/Business/Entreprise/Sur mesure |
| Remise annuelle (CGV) | `cgv.md` art. 4.3 : « **−20 % indicatif** » ✗ | CGV vitrine : renvoi au « parcours tarifaire … au moment de la souscription » ✔ | **A** (une fois § 3 tranché) | libellé aligné sur la grille + Stripe |
| Essai → paiement auto | `cgv.md` art. 3 : « devient payant, 1er prélèvement automatique » | CGV vitrine : « confirmation du paiement » | **D** | aligner sur le parcours d'acceptation retenu (JURIDIQUE-V2) |
| Délai de paiement B2B / pénalités de retard / escompte | **absents** de `cgv.md` (obligation L441-10 C. com. non satisfaite) | « à finaliser » ; indemnité 40 € présente | **D** | rédaction + validation juridique |
| Réversibilité / export des données | `cgv.md` art. 10 : **complet** (export à tout moment, 30 j post-contrat, puis suppression) ✔ | « seront précisés contractuellement » ✗ | **A** (vitrine) | aligner la vitrine sur la clause app |
| Bandeau « Document de travail » | absent | **présent sur les 5 pages `[slug]`** + intros « projet / à finaliser » | **A** (à retirer quand finalisé) | pages publiables sans mention brouillon |
| Cession EI → société | `cgv.md` art. 14 : prévue | — | OK | conserver |
| Hébergeurs (Vercel Covina / Supabase eu-west-3 / Brevo / Stripe IE) | corrigés (P13/P14) | idem | OK | conserver |

**Deux CGV distinctes** : `cgv.md` (le Service) vs `legal.ts` CGV (le site) — acceptable par
nature, mais **identité + régime + TVA doivent être identiques** dans les deux, ce qui n'est pas
le cas (`legal.ts` = « micro-entreprise » ; `cgv.md` = « 293 B franchise en base » ;
`mentions-legales.md` = « non tranché »). **Trois positions différentes dans le même
écosystème.**

---

## 7. TVA / statut — synthèse

| Question | État réel | Bloquant pour |
|---|---|---|
| Forme juridique | **EI confirmée** (décision centrale, `README.md` juridique 2026-09-01) | — |
| Régime fiscal/social (micro *ou* réel) | **NON arbitré** — arbitrage expert-comptable requis (`GO_LIVE_COMMERCIAL_CHECKLIST.md` : 🔴 préalable bloquant) | mentions TVA, immatriculation, Stripe Live |
| Mention publique de TVA | **Contradictoire** : `cgv.md` publie « TVA non applicable, art. 293 B » ; `mentions-legales.md` dit « ne pas publier tant que non tranché » ; `legal.ts` dit « si applicable » | publication juridique finale |
| `STRIPE_AUTOMATIC_TAX_ENABLED` | `false` (aucune TVA calculée au Checkout) | cohérent avec franchise en base **si** c'est le régime retenu — sinon à activer |
| Tous prix affichés | « HT » partout | neutre — à conserver |

**Ne pas trancher fiscalement ici.** Décision = expert-comptable. Tant qu'elle n'est pas prise :
**retirer de `cgv.md` l'assertion « art. 293 B »** (la ramener à un marqueur interne comme dans
`mentions-legales.md`), pour ne pas publier un régime non arbitré.

---

## 8. Quick wins — préparés, non exécutés

| Item | Repo / fichier | Classe |
|---|---|---|
| `robots.txt` applicatif (`Disallow` routes `(app)` + `/api`) | `elsatia-main/src/app/robots.ts` (à créer) | **rapide** |
| `noindex` + `canonical` vers `elsatia.fr` sur `app.elsatia.fr/` et `/tarifs` (anti-duplication) | `elsatia-main/src/app/{page,tarifs/page}.tsx` metadata | **rapide** |
| Lien « Se connecter » (→ `https://app.elsatia.fr/login`) dans header + footer vitrine | `elsatia-site/src/components/site-{header,footer}.tsx` | **rapide** |
| `alt=""` sur l'image décorative du hero | `elsatia-site/src/app/page.tsx` (`/hero-software-ai.png`) | **rapide** |
| Microcopy « Aperçu — données d'exemple » sous la maquette dashboard | `elsatia-site/src/components/product-preview.tsx` | **rapide** |
| `sitemap.lastModified` dynamique (date de build) au lieu de `2026-08-26` figé | `elsatia-site/src/app/sitemap.ts` | **rapide** |
| Retrait du bandeau « Document de travail » sur `/cookies` seul (contenu déjà conforme) | `elsatia-site/src/app/[slug]/page.tsx` (conditionner par slug) | **rapide** |
| Purge des clés `localStorage` `liria-*` de repli | `elsatia-main/src/components/*` | **post** |
| Retrait bandeau « Document de travail » + intros « projet » sur les 4 autres pages légales | `elsatia-site` | **bloquant** (après finalisation juridique) |

Aucun de ces items ne touche un prix, un Price Stripe, le fond juridique, MFA, ACL, Colors métier
ni le code critique Gestion Pro.

---

## 9. Décisions humaines nécessaires (à arbitrer)

| # | Décision | Qui | Débloque |
|---|---|---|---|
| **D1** | **LA grille tarifaire unique** : A (69/199/399/599) *ou* B (79/249/449/599) *ou* autre. | Julien (pilotage commercial) | tout le reste |
| **D2** | **Modèle annuel** : « 2 mois offerts » (10×) *ou* « ×12 sans remise » *ou* « −X % » — **une seule règle**, + sort de l'exception Entreprise −10 %. | Julien | affichage + Prices Stripe + CGV art. 4.3 |
| **D3** | **Prices Stripe** : recréer/repointer `STRIPE_PRICE_*` (Test **puis** Live) pour coller à D1+D2 ; statuer sur la grille `elsatia_tarifs_v2_*` (activer ou supprimer). | Julien + opération Stripe explicite | ouverture abonnements, Stripe Live |
| **D4** | **Comptes supplémentaires** : créer les 8 Prices `STRIPE_PRICE_COMPTE_SUP_{MINI..ENTREPRISE}_*` (aujourd'hui inexistants → dépassements non facturés). | Julien + Stripe | facturation réelle des comptes sup |
| **D5** | **Régime fiscal/social de l'EI** (micro ou réel) → **mention de TVA** (293 B ou assujettissement). | **Expert-comptable** | `cgv.md`, `mentions-legales.md`, `legal.ts`, factures, `STRIPE_AUTOMATIC_TAX_ENABLED` |
| **D6** | **CGV** : noms d'offres (retirer Essentiel/Premium), remise annuelle (aligner sur D2), essai→paiement auto (aligner sur le parcours d'acceptation), délai de paiement B2B + pénalités + escompte (rédiger). | Julien + **avocat** (relecture) | publication commerciale |
| **D7** | **Réversibilité vitrine** : reprendre la clause `cgv.md` art. 10 dans `legal.ts`. | Julien | cohérence site |
| **D8** | **Branche `main`** : valider la stratégie D→A→(C plus tard) du § 5. | Julien | sécurité opératoire |
| **D9** | **Source de vérité unique** (§ 4) : valider l'architecture (package partagé ou fichier généré + `verify:stripe-prices`). | Julien / technique | fin des divergences futures |
| **D10** | SIREN/SIRET/RCS/APE/adresse définitive : **en attente immatriculation INPI/INSEE** — pas une décision, un jalon. | INPI/INSEE | mentions légales définitives |

---

## 10. Ordre de correction

1. **Sécuriser `main`** (D8) : note « NE PAS DÉPLOYER » + protection de branche + vérifier
   l'épinglage Vercel Production. *(quick, sans risque)*
2. **Quick wins neutres** (§ 8, hors bandeaux légaux) : `robots.txt` app, canonical/noindex
   anti-duplication, « Se connecter », `alt`, microcopy, sitemap. *(sans décision)*
3. **D1 + D2** : arbitrage grille + modèle annuel. *(bloque tout le commercial)*
4. **Aligner l'affichage** sur D1/D2 : `elsatia-main/src/lib/tarification.ts` (+ invariant test),
   `elsatia-site/src/lib/tarifs.ts`, libellés « 2 mois offerts » / annuel. *(1 passe, 2 repos)*
5. **D3 + D4** : audit `verify:stripe-prices` (lecture seule) → recréation/repointage des Prices
   Test pour coller au catalogue ; création des 8 Prices comptes-sup ; décision sur
   `elsatia_tarifs_v2_*`. *(opération Stripe explicite)*
6. **D5** : arbitrage régime/TVA avec l'expert-comptable → mise à jour `mentions-legales.md`,
   `cgv.md` (retrait/whitelist du « 293 B »), `legal.ts` (retrait « micro-entreprise »).
7. **D6 + D7** : réécriture CGV (offres, remise annuelle alignée D2, essai, délais B2B,
   réversibilité vitrine) → **relecture avocat**.
8. **Retrait des bandeaux « Document de travail »** une fois 6+7 finalisés et SIREN/SIRET reçus
   (D10).
9. **D9** : mise en place de la source de vérité unique + garde-fous CI (empêche la récidive).
10. **Stripe Live** : création des Prices Live = copie exacte du catalogue validé ;
    `verify:stripe-prices` en mode Live vert ; puis bascule (lot P15).

---

## 11. Estimation (hors délais externes : INPI, avocat, expert-comptable)

| Bloc | Charge |
|---|---|
| 1 — sécurisation `main` (note + protection branche + check Vercel) | ~0,5 h |
| 2 — quick wins neutres (2 repos) | ~0,5 j |
| 4 — alignement affichage grille + annuel (après D1/D2) | ~0,5 j (dont tests) |
| 5 — `verify:stripe-prices` + repointage Prices Test + 8 Prices comptes-sup | ~1 j (dont recette Checkout Test) |
| 6 — mises à jour juridiques (ML, CGV, legal.ts) après arbitrages | ~1 j de rédaction/intégration + relecture avocat (externe) |
| 7 — retrait bandeaux + cohérence finale | ~0,5 j |
| 9 — source de vérité unique (package/génération + CI 2 repos) | ~1–1,5 j |
| 10 — Prices Live + bascule (lot P15) | ~0,5 j + opération financière |
| **Total interne (hors externes et hors temps de décision)** | **≈ 5–6 jours**, dont ~1 j réalisable immédiatement (blocs 1-2) sans aucun arbitrage |

---

ELSATIA-COMMERCIAL-RECONCILIATION-V1 TERMINÉ — DÉCISIONS TARIFAIRES ET JURIDIQUES À ARBITRER
