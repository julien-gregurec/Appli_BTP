# ELSATIA — Boutique : audit d'architecture de l'existant (V1)

| | |
|---|---|
| Lot | `ELSATIA-BOUTIQUE-COMMERCE-ARCHITECTURE-READINESS-V1` |
| Nature | Documentaire. Aucun code métier, aucune migration, aucun objet Stripe, aucun déploiement. |
| Branche | `audit/elsatia-boutique-commerce-architecture-v1` |
| SHA de base | `1fc1331` — `integration/elsatia-ecosystem-train-v2-reserves-gp-v1` |
| Worktree | `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/boutique-commerce-architecture-v1` |
| Date | 2026-09-08 |

## 0. Méthode et périmètre de preuve

Tout ce qui suit a été lu dans le code présent au SHA `1fc1331`. Le constat historique
transmis dans la commande (« panier et Stripe existaient, `FEATURE_BOUTIQUE_ENABLED=false`,
catalogue vide, CGV/livraison/retours/e-mails incomplets ») n'a **pas** été repris : il a été
revérifié ligne à ligne. Deux de ses quatre points sont exacts, un est partiellement exact,
**un est faux**.

Choix de la base : `main` est à `4d92ddb` et se trouve **strictement en retard** de 324 commits
sur le train (`git rev-list --left-right --count main...train` → `0 324`). `main` n'apporte
aucun commit propre. Auditer `main` aurait décrit un état mort. Le train `1fc1331` est donc la
seule base honnête.

Ce qui **n'a pas** été audité, et pourquoi :

- le dépôt du site vitrine `elsatia-site` — dépôt distinct, hors de ce dépôt, et la commande
  interdit d'y toucher ;
- les branches non fusionnées ont été consultées **en lecture seule** pour situer l'antériorité,
  mais ne comptent pas comme existant : ce qui n'est pas dans le train n'est pas livré.

---

## 1. Verdict de l'audit

**La Boutique ELSATIA n'est pas un projet vierge. C'est un prototype B2B fonctionnel, complet
de bout en bout sur un seul cas d'usage (vente de matériel à une entreprise cliente déjà
abonnée), masqué par un interrupteur — et il lui manque la totalité de la couche commerciale
légale.**

Le chemin technique commande → paiement → confirmation → stock → trésorerie existe et
fonctionne. Ce qui manque n'est pas de la plomberie, c'est du droit et de la logistique :
aucune facture n'est émise au client, aucune CGV ne couvre une vente de bien, aucun retour
n'est modélisé, aucun e-mail n'est envoyé, aucun colis n'est suivi.

Un deuxième constat pèse davantage que le premier : **le modèle de données est verrouillé sur
le B2B mono-tenant**. `boutique_commandes.entreprise_id` est `not null` avec clé étrangère vers
`entreprises`. Il n'existe aucun client particulier, aucune commande sans entreprise. Vendre une
carte NFC à un artisan qui n'est pas déjà client de Gestion Pro est, en l'état,
**structurellement impossible** — pas difficile : impossible.

---

## 2. Ce qui existe réellement, fichier par fichier

### 2.1 Base de données — 6 migrations dans le train

| Migration | Objet |
|---|---|
| `20260724000144_boutique_catalogue.sql` | Table `boutique_produits`, RLS, permissions `acces_boutique` / `gerer_boutique` |
| `20260724000145_boutique_commandes.sql` | Tables `boutique_commandes` + `boutique_lignes_commande`, RLS, RPC `boutique_finaliser_commande_payee` |
| `20260724000146_fermeture_acces_anonyme_boutique.sql` | Correctif : suppression des policies « prototype » `to anon` ouvertes par 144/145 |
| `20260724000175_liaison_boutique_tresorerie.sql` | Rattachement de la commande payée à `depenses_fournisseurs` du client |
| `20260724000176_correction_reglement_boutique_tresorerie.sql` | Correctif : ajout de la ligne `reglements_fournisseurs` manquante |
| `20260801000194_renommer_identite_elsatia_boutique.sql` | Renommage Liria → ELSATIA dans les données actives |

Le catalogue est contraint par un `check` fermé à **4 catégories matériel** :
`imprimante_code_barres`, `plastifieuse`, `consommable_plastification`, `etiquette_aimantee`.

### 2.2 Application

| Fichier | Rôle | Lignes |
|---|---|---:|
| `src/app/(app)/boutique/page.tsx` | Catalogue client, groupé par catégorie | 53 |
| `src/app/(app)/boutique/[produitId]/page.tsx` | Fiche produit | 31 |
| `src/app/(app)/boutique/panier/page.tsx` | Panier + saisie d'adresse | 64 |
| `src/app/(app)/boutique/commande/[id]/page.tsx` | Suivi de commande | — |
| `src/app/(app)/boutique/layout.tsx` | Garde d'environnement (`notFound()`) | 7 |
| `src/app/(app)/plateforme/boutique/page.tsx` | Administration catalogue (admin plateforme) | 69 |
| `src/app/actions/boutique.ts` | 4 actions serveur | 174 |
| `src/lib/stripe-boutique.ts` | Session Checkout `mode: payment` | 46 |
| `src/app/api/stripe/boutique/webhook/route.ts` | Webhook dédié, secret distinct | 46 |
| `src/components/boutique/panier.ts` | Panier `localStorage` | 40 |
| `src/components/boutique/AjouterAuPanierBouton.tsx` | Ajout au panier | — |

### 2.3 Ce que le code fait déjà bien, et qu'il faut conserver

Ces points sont acquis. Les réécrire serait une régression.

1. **Les prix ne sont jamais lus du navigateur.** `passerCommandeAction` ne récupère du client
   que des couples `{produitId, quantite}`, puis relit prix, TVA, stock et `actif` en base.
   Le commentaire du code le dit explicitement.
2. **Les lignes de commande sont snapshotées** : `sku_snapshot`, `nom_snapshot`,
   `prix_unitaire_ht_snapshot`. Un changement de prix ultérieur ne réécrit pas l'historique.
3. **L'accès anonyme a été explicitement refermé** (migration 146), avec un commentaire qui
   explique la faute d'origine. `revoke all privileges ... from anon` sur les trois tables.
4. **La finalisation de paiement est idempotente et `security definer`**, non exécutable par
   `anon`, protégée par un test `v_deja_payee` avant toute écriture. Un webhook rejoué
   n'insère pas deux fois la dépense.
5. **Idempotence côté Stripe** : clé `boutique-checkout-<commandeId>` sur la création de session.
6. **Déduplication des webhooks** par `event.id` en clé primaire de `stripe_webhook_events` :
   un `23505` renvoie `{received:true, duplicate:true}` sans retraiter.
7. **Secret de webhook distinct** (`STRIPE_WEBHOOK_BOUTIQUE_SECRET`), séparé de l'abonnement
   et de Connect.
8. **`on delete restrict`** sur `boutique_lignes_commande.produit_id` : un produit commandé ne
   peut pas être supprimé.

---

## 3. Vérification du constat historique

| Affirmation historique | Verdict | Preuve |
|---|---|---|
| « Le panier et Stripe existaient » | **Exact** | `src/components/boutique/panier.ts`, `src/lib/stripe-boutique.ts`, webhook dédié. |
| « `FEATURE_BOUTIQUE_ENABLED=false` » | **Faux au SHA `1fc1331`** | Voir §3.1 ci-dessous. |
| « Catalogue vide » | **Exact** | Aucun `insert into public.boutique_produits` hors fixtures pgTAP. Aucun fichier de seed. |
| « CGV, livraison, retours et e-mails incomplets ou absents » | **Exact, et plus grave que décrit** | Voir §3.2. |

### 3.1 Le point faux : la Boutique n'est pas coupée par la variable d'environnement

`src/lib/preview-features.ts` :

```ts
function estActive(valeur: string | undefined): boolean {
  return valeur?.trim().toLowerCase() !== "false";
}
export function boutiqueEstActive(environnement = serverEnvironment): boolean {
  return estActive(environnement.FEATURE_BOUTIQUE_ENABLED);
}
```

Trois faits mesurés :

1. `boutiqueEstActive()` est **fail-open** : variable absente ⇒ `undefined !== "false"` ⇒ **`true`**.
2. `FEATURE_BOUTIQUE_ENABLED` **n'apparaît ni dans `.env.example` ni dans `vercel.json`**
   (`grep -n "FEATURE_" .env.example vercel.json` → aucun résultat).
3. Le **même fichier** applique la convention inverse, fail-closed, aux trois autres drapeaux
   commerciaux (`iaEstActive`, `iaDevisEstActive`, `relancesAutoEstActive`), avec un commentaire
   qui justifie explicitement ce choix : *« une fonctionnalité commerciale désactivable ne doit
   jamais s'activer par défaut si la variable est absente »*. La Boutique est la seule
   exception, et rien ne la justifie dans le code.

**Ce qui masque réellement la Boutique aujourd'hui** est ailleurs : `src/lib/feature-catalogue.ts`
déclare `store: DISABLED`, et `/boutique` est mappé sur la feature `store`. Trois couches
l'appliquent : `activeFeaturesForCompany()`, `ModuleAccessBoundary` et le filtre de `Sidebar`.

**Conséquence — et elle survit à la fermeture de Q1.** `activeFeaturesForCompany` lit une table
d'exceptions par entreprise :

```ts
const active = override ? override.active && override.statut !== "disabled"
                        : definition.visibleByDefault;
```

Une seule ligne `entreprise_feature_flags(entreprise_id, feature_key='store', active=true,
statut≠'disabled')` **rouvre la Boutique** à une entreprise — sans CGV de vente, sans facture,
sans logistique, sans retours. Le garde-fou d'environnement, lui, ne se déclenchera pas
puisqu'il est fail-open. Le seul rempart restant est que le catalogue soit vide.

Ce n'est pas une faille exploitable à distance : écrire dans `entreprise_feature_flags` demande
un accès privilégié. C'est un garde-fou commercial qui n'en est pas un.

### 3.2 Le point exact, mesuré

**CGV.** `docs/juridique/cgv.md`, 113 lignes, 16 articles — ce sont les CGV **de l'abonnement
SaaS**. Décompte des occurrences dans le fichier :

| Terme | Occurrences |
|---|---:|
| `boutique` | 0 |
| `livraison` | 0 |
| `retour` | 0 |
| `remboursement` | 0 |
| `garantie légale` | 0 |
| `médiateur` | 0 |
| `matériel` | 0 |
| `transporteur` / `colis` | 0 |
| `rétractation` | 1 |

Aucun article ne couvre la vente d'un bien. Vendre en l'état, c'est vendre sans conditions de vente.

**Livraison.** Cinq colonnes de texte libre sur `boutique_commandes` : `nom_destinataire`,
`adresse_livraison`, `code_postal`, `ville`, `telephone`. Aucune validation, aucune
normalisation, aucun pays. Aucun transporteur, aucun numéro de suivi, aucun frais de port
(le montant TTC est strictement la somme des lignes), aucun état d'expédition.

**Retours et remboursement.** Inexistants. `statut` n'accepte que cinq valeurs :
`brouillon`, `en_attente_paiement`, `payee`, `annulee`, `expiree`. Aucun état postérieur au
paiement. Une commande payée est un état **terminal**.

**E-mails.** `packages/email/src/index.ts` : **0 occurrence** de « boutique ». Aucune
confirmation de commande, aucun accusé d'expédition, aucun e-mail de retour. Le client ne
reçoit strictement rien d'ELSATIA après avoir payé.

---

## 4. Trous structurels au-delà du constat historique

### T1 — ELSATIA encaisse sans émettre de facture *(bloquant légal)*

Une commande payée déclenche, via `boutique_finaliser_commande_payee` :
décrément de stock, passage à `payee`, création d'une **dépense fournisseur dans la comptabilité
du client** (`depenses_fournisseurs`, pièce `BTQ-<uuid>`, catégorie `outillage`) et d'un
**règlement** `reglements_fournisseurs` en mode `cb`.

Il n'existe **aucun document de vente émis par ELSATIA**. Le client obtient une écriture qu'il
s'est auto-générée dans son propre outil — ce n'est pas une facture d'ELSATIA, ça n'en a ni la
numérotation, ni la valeur probante, ni les mentions obligatoires. Sur une vente B2B de matériel,
c'est un manquement de facturation.

Nuance à porter au crédit du code : ce rattachement trésorerie est une bonne idée produit, et il
a été corrigé deux fois (175 puis 176, cette dernière parce que « Décaissé 30 jours » lit
`reglements_fournisseurs` et non `depenses_fournisseurs.montant_regle`). Le problème n'est pas
qu'il existe, c'est qu'il tient lieu de facture.

### T2 — Le B2C est structurellement impossible

`entreprise_id uuid not null references public.entreprises(id)`. Toutes les policies RLS
reposent sur `est_membre_actif(entreprise_id)` ou `a_permission(entreprise_id, 'gerer_boutique')`.
Les permissions Boutique ont été **dérivées des droits d'achat fournisseurs** existants
(migration 144). L'ensemble du parcours suppose : un compte, une entreprise, un poste, une
permission.

Vendre une carte NFC à un particulier, ou à un professionnel non abonné, demande un modèle
client distinct. Ce n'est pas un ajout de colonne, c'est un axe d'architecture (traité en phase 4).

### T3 — Le catalogue ne sait représenter que du matériel

Le `check` sur `categorie` est fermé sur 4 valeurs matériel. Aucune des natures demandées —
produit numérique, licence, abonnement, prestation, formation, personnalisation, lot,
précommande — n'est représentable. Il n'existe ni variante, ni option, ni poids, ni dimension,
ni document produit, ni délai indicatif, ni statut commercial, ni archivage (seulement
`actif` booléen).

Ajouter la carte NFC ELSATIA impose donc de refondre le modèle, pas de l'étendre.

### T4 — Le stock n'est jamais réservé

Le stock n'est décrémenté qu'à la réception du webhook de paiement. Entre la création de la
session Checkout et le paiement, rien n'est retenu. Deux acheteurs peuvent payer le dernier
exemplaire. Pire, la décrémentation est écrite `greatest(0, stock - quantite)` : la survente est
**silencieusement absorbée** au lieu d'être signalée. Aucune alerte, aucune trace.

### T5 — `livemode` est journalisé mais jamais vérifié

Le webhook enregistre `livemode: evenement.livemode` dans `stripe_webhook_events`, puis traite
l'événement sans jamais comparer cette valeur à l'environnement courant. Un événement Test reçu
par un déploiement Live (ou l'inverse) est traité normalement. C'est exactement le risque
« confusion Test/Live » listé en phase 7 — il est déjà là.

### T6 — Aucune traçabilité des changements de prix et de stock

`modifierProduitBoutiqueAction` écrase `prix_ht`, `stock_disponible`, `seuil_alerte_stock` et
`actif` sans auteur, sans motif, sans version antérieure. L'exigence de phase 8 (« toute remise
doit avoir un auteur, un motif, une durée et un historique ») n'est pas seulement non couverte
pour les remises : elle ne l'est pas non plus pour le prix lui-même.

### T7 — Les images sont des URL externes arbitraires

`image_url text` est saisi en texte libre dans le formulaire d'administration et rendu
directement en `<img src>`. Aucun bucket, aucun upload, aucun contrôle de format, de taille ou
de provenance. Les 15 buckets Storage existants (`entreprise-assets`, `reserves-photos`,
`colors-seaux`, …) n'en comportent **aucun** pour la Boutique.

### T8 — TVA figée à un taux par produit

`taux_tva numeric(4,3) default 0.20`, sans pays, sans règle, sans exonération.
`STRIPE_AUTOMATIC_TAX_ENABLED` existe mais n'est branché que sur l'abonnement
(`stripe-abonnement.ts:269`), **pas** sur la Boutique. Toute vente hors France, ou toute vente à
un assujetti intracommunautaire, produit un montant faux.

### T9 — Le panier n'existe que dans le navigateur

`localStorage`, clé `boutique_panier`, non lié au compte. Il ne survit ni au changement
d'appareil ni au vidage du navigateur, et n'est pas récupérable côté ELSATIA (aucune analyse de
panier abandonné possible). Ce n'est **pas** une faille de prix — le serveur recalcule tout —
mais c'est l'absence d'un panier serveur.

### T10 — Aucun coupon, aucune remise, aucun avoir côté Boutique

Rien dans le modèle. Le checkout utilise `price_data` **inline** : il n'existe aucun objet
Price Stripe pour la Boutique, et donc aucun point d'accroche pour les coupons Stripe.

---

## 5. Périmètres connexes : ce qui n'existe pas dans le train

| Sujet | État réel au SHA `1fc1331` |
|---|---|
| **Contact/Card, NFC** | **Absent**. `grep -ril "nfc\|contact-card\|contact_card"` → **0 fichier**. L'architecture est close ailleurs, en documentaire seul : `audit/elsatia-contact-card-architecture-v1` @ `0e644d5`, **non fusionnée**. Zéro code produit. |
| **Moteur commercial V4** | **Absent** du train. `src/lib/commercial` n'existe pas ici. Le train ne contient que `tarification.ts` + `tarification.canonical.json`, `commercialisation-abonnements.ts`, `comparatif-offres.ts`, `modules-gestion-pro.ts`. Le moteur est sur une branche non fusionnée. |
| **Market** | **Absent** du train. Architecture close en documentaire (`feat/market-architecture-legal-business-v1` @ `e0d45c9`), non fusionnée. |
| **Annuaire plateforme / support transversal** | Non fusionnés (`339195d`, `9fcf128`). |
| **Site public** | Dépôt distinct `elsatia-site`. Non audité, non touché — conformément à la commande. |

### Antériorité documentaire à réconcilier

`docs/architecture/ELSATIA_HARDWARE_SHOP_LABELS_READINESS_V1.md` — **653 lignes, 32 sections**,
sur la branche `docs/elsatia-hardware-shop-labels-readiness-v1`, **non fusionnée dans le train**.

Sections qui recoupent directement la présente commande : §14 modèle produit Boutique,
§15 numéros de série, §16 packs métier, §21 garantie/SAV, §22 stock/immobilisation,
§27 Boutique ↔ billing, §28 réapprovisionnement consommables, §29 modèle de marge,
§32 roadmap Boutique.

Ce document est une antériorité sérieuse. Il sera **réconcilié** dans les phases suivantes — ni
ignoré, ni recopié. Il n'a jamais atteint le train : à ce jour, il ne fait foi sur rien.

---

## 6. Matrice de l'existant

Lecture des états : **développé** = présent et fonctionnel dans le train ·
**partiel** = présent mais incomplet pour un usage commercial ·
**désactivé** = code présent, coupé par un drapeau ·
**documenté** = spécifié hors du train, aucun code ·
**absent** = rien.

La colonne « Réutilisable » estime la part du travail existant récupérable pour la Boutique cible.

| Besoin | Existant | État | Réutilisable | Travail futur |
|---|---|---|---:|---|
| Module Boutique dans Gestion Pro | 5 pages + layout gardé | désactivé (`store: DISABLED`) | 60 % | Décider : module GP ou surface autonome multi-audience |
| Panier | `localStorage`, 40 lignes | partiel | 30 % | Panier serveur, rattaché à une identité, expirable |
| Commandes | 2 tables + 5 statuts | partiel | 55 % | Passer de 5 à 16 états, transitions, preuves, notifications |
| Produits / catalogue | `boutique_produits`, 4 catégories matériel | partiel | 35 % | Modèle multi-nature, variantes, personnalisation, archivage |
| Permissions | `acces_boutique`, `gerer_boutique` | développé | 85 % | Étendre aux rôles logistique / SAV / remboursement |
| Feature flags | `store: DISABLED` + env fail-open | partiel (incohérent) | 50 % | Rendre `boutiqueEstActive()` fail-closed ; documenter la variable |
| Stripe | Checkout `payment`, `price_data` inline, idempotence | développé | 70 % | Acompte, remboursement, avoir, coupon, contrôle `livemode` |
| Factures (ELSATIA → client) | — | **absent** | 0 % | Facturation de vente complète : numérotation, mentions, PDF, archivage |
| Avoirs | — | absent | 0 % | Modèle d'avoir lié à la commande et au remboursement |
| Remises / coupons | — | absent | 0 % | Remises tracées : auteur, motif, durée, historique |
| Clients | `entreprises` uniquement | partiel | 40 % | Modèle client Boutique distinct (particulier / pro non abonné) |
| Adresses | 5 champs texte libre | partiel | 20 % | Adresses structurées, pays, facturation ≠ livraison, carnet |
| E-mails | `packages/email` (Brevo, gabarit ELSATIA) | partiel | 65 % | Tous les gabarits Boutique : 0 aujourd'hui |
| Documents | Génération PDF côté GP | partiel | 45 % | Facture de vente, bon de livraison, bordereau de retour |
| Stockage | 15 buckets, aucun Boutique | absent | 0 % | Bucket produits + bucket personnalisations, avec politique |
| Images | `image_url` texte libre, rendu direct | partiel | 10 % | Upload contrôlé : formats, taille, dimensions, expiration |
| Taxes | `taux_tva` par produit, défaut 0,20 | partiel | 25 % | Règles par pays, intracommunautaire, `automatic_tax` à arbitrer |
| Livraison | 5 champs adresse | partiel | 15 % | Transporteur, suivi, frais de port, échecs, réexpédition |
| CGV | CGV SaaS, 16 articles, 0 mot de vente | absent (pour la vente) | 0 % | CGV de vente B2C + B2B, à faire valider par un juriste |
| Retours | — | absent | 0 % | Demande, autorisation, bordereau, réception, contrôle |
| Remboursement | — | absent | 0 % | Total, partiel, avoir, remboursement Stripe idempotent |
| Site public | Dépôt distinct, non audité | hors périmètre | — | Bloc « À venir » uniquement (phase 12) |
| Contact/Card | 0 occurrence dans le train | documenté (`0e644d5`) | 0 % | Tout : produit, fabrication, activation, révocation |
| Moteur commercial V4 | absent du train | documenté / branche | 0 % | Réconciliation lors du Train V3 |
| Stock | `stock_disponible`, `seuil_alerte_stock`, décrément au paiement | partiel | 30 % | Réservation, lots, séries, fournisseur, coût d'achat |
| Journal / audit | `stripe_webhook_events` (dédup) | partiel | 50 % | Journal append-only des commandes, prix, remises, remboursements |
| RGPD | `parametres/donnees` côté GP | partiel | 40 % | Export et effacement d'un client Boutique sans compte |

---

## 7. Ce que l'audit change pour la suite

1. **Il n'y a pas de socle à écrire à partir de zéro, mais un socle à requalifier.** Le prototype
   est propre sur la partie qu'il couvre ; il est étroit.
2. **Le point de rupture est le modèle client**, pas le paiement. Tant que la commande est
   attachée à `entreprises`, la Boutique ne peut vendre qu'à des clients Gestion Pro existants.
   **La décision D-Q2 rend ce point bloquant et non plus hypothétique** : le B2C étant accepté,
   `entreprise_id not null` doit disparaître de la clé d'entrée, et un faux tenant professionnel
   est explicitement écarté comme contournement.
3. **La facturation de vente est le premier bloquant légal**, avant même les CGV : on ne peut pas
   encaisser sans facturer.
4. **Deux corrections sont mûres et indépendantes de tout le reste** : rendre
   `boutiqueEstActive()` fail-closed, et vérifier `livemode` dans le webhook. Elles ne sont pas
   faites ici — cette conversation est documentaire — mais elles sont consignées comme lot P0.

---

## 8. Questions à trancher, ouvertes à ce stade

| # | Question | Pourquoi elle bloque |
|---|---|---|
| ~~Q1~~ | ~~Module **dans** Gestion Pro, ou surface **autonome** ?~~ | **TRANCHÉE (R3) — application commerciale autonome de l'écosystème.** Compte ELSATIA partagé, lien facultatif à Gestion Pro, achat possible sans entreprise ni abonnement. |
| ~~Q2~~ | ~~Vend-on à des **particuliers** ?~~ | **TRANCHÉE — oui.** Cf. `ELSATIA-BOUTIQUE-DECISIONS-R2-V1.md` § D-Q2. |
| Q3 | Qui **fabrique** les cartes NFC — sous-traitant ou interne ? | Détermine s'il faut un état « envoyée en fabrication » et un échange fournisseur. |
| Q4 | Le drapeau `FEATURE_BOUTIQUE_ENABLED` doit-il devenir fail-closed **avant** le Train V3 ? | Aujourd'hui, seul le catalogue vide protège la Boutique. |
| Q5 | Le rattachement automatique à la trésorerie du client est-il **conservé** ? | Bonne idée produit, mais il ne doit plus tenir lieu de facture. |

Aucune de ces questions n'est tranchée ici. Elles remontent au rapport final.
