# ELSATIA Gestion Pro — Audit de préparation pilote et commerciale V2

**Référence** : `ELSATIA-GP-COMMERCIAL-OPERATIONS-READINESS-V2`
**Date** : 2026-09-08
**Nature** : audit de lecture + validations sûres. Aucune migration, aucun déploiement,
aucune écriture en Production, aucune activation Stripe Live.

---

## 1. Verdicts

| Verdict | Décision | Motif principal |
|---|---|---|
| **Pilote interne (Julien seul, données fictives)** | **GO sous conditions** | Le socle technique tient : 1846 assertions pgTAP vertes, RLS active sur 198/198 tables, build et typecheck propres. Les conditions sont listées en §9.1. |
| **Pilote client externe (premier vrai client)** | **NO-GO** | P0-1 (prix affiché ≠ prix facturé) et P0-2 (identité légale non publiable) touchent directement la relation commerciale. |
| **Commercialisation** | **NO-GO** | Bloqueurs externes non levables par le code : SIRET/TVA en attente d'immatriculation, Stripe Live jamais configuré, relecture juridique non faite. |

Le verdict pilote interne est **GO** parce qu'aucun des bloqueurs n'empêche
d'éprouver le produit avec des données fictives et un Stripe en mode Test —
à condition d'accepter que les montants affichés pendant le pilote ne sont
pas ceux qui seront facturés (cf. P0-1).

---

## 2. Périmètre audité — branches et SHA

Les trois références fournies forment une **lignée strictement linéaire** :

```
996be15c136f09d9977375e700462b503a1720c3   (ancien canon cutover, 2026-09-05)
        │  +9 commits
        ▼
4266ba6ce347ed3a4f379430442b341b67df516e   (canon post-cutover historique, 2026-09-06)
        │  +15 commits
        ▼
4f1f17044a38beba3b09e6937b2f8f626a8d87e0   (train global intermédiaire, 2026-09-07)
```

`git rev-list --count 4f1f170..4266ba6` = **0** : le train global contient
intégralement le canon post-cutover. Aucun commit n'a été perdu entre les deux.

**Delta `4266ba6` → `4f1f170`** : 165 fichiers, +34 524 lignes. Composition :
Réserves V1–V4 (migrations 268-270), Colors 271, GP Client Document Snapshot 272,
contrats client canoniques. **Le cœur commercial GP n'y bouge presque pas** —
seuls `src/lib/documents-commerciaux.ts` (+48/-…) et `src/lib/relances-moteur.ts`
(+30/-…) sont touchés, plus l'ajout de `client-snapshot*.ts`.

**Conséquence pour le canon V2** : l'audit commercial GP mené ici est valable
pour les trois références. Les constats de §4 à §8 ne dépendent d'aucune d'elles.

**Surface auditée** : audit conduit sur le worktree `4f1f170`
(`/Users/juliengregurec/Projects/.worktrees/ledger-reconciliation-p0`), retenu
comme **sur-ensemble** des trois références et **non comme canon**. Aucun canon
n'est désigné par ce rapport.

**Base de données** : conteneur jetable `elsatia-ledger-p0-dbtest`
(ledger 272, 270 migrations appliquées). La base locale principale
`btp-platform` (port 54322, jeu de test multi-app) **n'a pas été touchée** —
point d'attention : `supabase/config.toml` du worktree porte
`project_id = "btp-platform"`, donc un `supabase test db` lancé depuis ce
worktree viserait la base principale, pas la base jetable.

---

## 3. Correctif appliqué

Un seul correctif, conforme au mandat (aucune migration, démontré, sans conflit) :

| Élément | Valeur |
|---|---|
| Branche | `fix/gp-pgtap-rate-limit-extension-v1` |
| SHA complet | `1fceabca24e0aecb4d64669fabcab65b4aedf3a5` |
| Base | `4f1f17044a38beba3b09e6937b2f8f626a8d87e0` |
| Portée | 1 fichier, 1 ligne ajoutée, fichier de **test uniquement** |
| Poussée | oui (`origin`) — **aucun merge** |

`supabase/tests/rate_limiting_applicatif.test.sql` était le seul des 67 fichiers
pgTAP à ne pas déclarer `create extension if not exists pgtap with schema extensions`.
Sur une base propre il échouait dès `select plan(8)` puis avalait ses 8 assertions
dans une transaction avortée : **les contrôles de sécurité du rate limiting ne
s'exécutaient pas, sans échec visible**.

Mesure avant/après sur la base jetable :

```
avant : 66/67 fichiers,  1838 assertions ok, 1 fichier en erreur
après : 67/67 fichiers,  1846 assertions ok, 0 échec
```

Le blob source est identique sur `996be15`, `4266ba6` et `4f1f170`
(`7456fad7e24412ccab0539d996d1ae16e87d22d6`) : **ce commit se cherry-pick tel
quel sur le futur canon V2**.

---

## 4. Phase A — Cartographie commerciale

### 4.1 Grille tarifaire — code vs Stripe Test vs Stripe Live

Vérification **en lecture seule** contre le compte Stripe **Test**
(`sk_test_…`, `livemode=false` confirmé sur chaque prix). Aucune écriture.

**Forfaits de base :**

| Offre | Code (mensuel) | Stripe Test (mensuel) | Code (annuel) | Stripe Test (annuel) | Verdict |
|---|---|---|---|---|---|
| Mini | **79,00 €** | **69,00 €** | 790,00 € | 790,00 € | ❌ divergence mensuel |
| Pro | **249,00 €** | **199,00 €** | 2 490,00 € | 2 490,00 € | ❌ divergence mensuel |
| Business | **449,00 €** | **399,00 €** | 4 490,00 € | 4 490,00 € | ❌ divergence mensuel |
| Entreprise | 599,00 € | 599,00 € | 5 990,00 € | 5 990,00 € | ✅ conforme |

**Comptes supplémentaires** (Mini 15 € / Pro 12 € / Business 9 € / Entreprise 9 €) :
**conformes** au code sur les 8 prix, mensuel et annuel, règle annuelle respectée.

**Diagnostic.** Les prix **mensuels** de Stripe Test portent la métadonnée
`grille: TARIFS-V2` (ancienne grille), tandis que les prix **annuels** portent
`grille: CANONICAL-V3-2026-09`, cohérente avec le code. La migration de grille
n'a été appliquée qu'à la moitié du catalogue Stripe.

Deux conséquences distinctes :

1. **Prix affiché ≠ prix facturé.** `/tarifs`, `/signup`, `/onboarding` et
   `/abonnement` affichent la grille du code (`OFFRES_TARIFAIRES`), alors que
   `creerSessionAbonnementStripe` facture le Price Stripe. Un client voit 79 €
   et est débité de 69 €.
2. **Incohérence interne du catalogue Stripe.** L'annuel Mini (790 €) ne vaut
   plus 10 × le mensuel Mini (69 €) mais 11,4 mois. L'argument commercial
   « 2 mois offerts » est faux en Test pour Mini, Pro et Business.

Le garde-fou du dépôt **détecte déjà exactement ce défaut** :

```
$ node scripts/verify-stripe-prices.mjs
verify:stripe-prices — catalogue CANONICAL-V3-2026-09 — accès Stripe: api
✗ mini mensuel : montant 6900 ≠ 7900
✗ mini : règle annuelle cassée — annuel 79000 ≠ 10 × mensuel 6900
✗ pro mensuel : montant 19900 ≠ 24900
✗ pro : règle annuelle cassée — annuel 249000 ≠ 10 × mensuel 19900
✗ business mensuel : montant 39900 ≠ 44900
✗ business : règle annuelle cassée — annuel 449000 ≠ 10 × mensuel 39900
✗ 6 divergence(s). Le prix affiché ne correspond pas au prix facturé.
```

**Aucun prix n'a été modifié**, conformément au mandat. La correction est un
geste opérateur dans Stripe (créer les Price mensuels à la grille canonique et
repointer les variables `STRIPE_PRICE_*`), pas un changement de code.

**Stripe Live : non vérifiable et non vérifié.** Aucune clé `sk_live_` n'est
présente dans l'environnement local, et l'activation Live est explicitement hors
mandat. Le tableau « valeur Stripe Live » reste donc **vide** — c'est une action
opérateur (§9.3), pas un constat d'audit.

**Tarif officiellement validé** : le seul artefact de décision présent dans le
dépôt est `src/lib/tarification.canonical.json`
(`CANONICAL-V3-2026-09` / `ELSATIA-TARIFICATION-CANONICAL-ALIGNMENT-V1`),
cohérent avec `tarification.ts` et figé par `tarification.test.ts`.
**La validation commerciale finale de cette grille par Julien n'est pas
tracée dans le dépôt** — à confirmer avant toute création de Price Live.

Point complémentaire : `tax_behavior` vaut `unspecified` sur les 16 Price Test.
Si `STRIPE_AUTOMATIC_TAX_ENABLED=true` est activé, Stripe exige un
`tax_behavior` explicite (`inclusive`/`exclusive`). À traiter en même temps que
la reprise du catalogue.

### 4.2 Cycle de vie de l'abonnement

| Élément | État | Constat |
|---|---|---|
| Création de compte | ✅ | `/signup`, `/onboarding`, rattachement entreprise |
| Entreprise | ✅ | table `entreprises`, référence interne auto (`trg_set_entreprise_reference`) |
| Essai | ✅ | 30 j (`DUREE_ESSAI_JOURS`), aligné migration `20260905000265` |
| Périmètre d'essai | ✅ | SOCLE = périmètre de l'offre d'entrée (Mini), **dérivé de la grille**, jamais codé en dur (`acces-socle-essai.ts`) |
| Préavis fin d'essai | ✅ | paliers J-7 / J-3 / J-1, bandeau continu dès J-7 |
| Expiration | ✅ | `essaiExpireSansOffre` → `/abonnement-suspendu?motif=essai_expire` |
| Sortie d'essai | ✅ | 4 chemins restent ouverts (souscrire, aide, données RGPD, export), en **égalité exacte** — pas de préfixe large |
| Abonnement / formule | ✅ | 4 offres commercialisées + `sur_mesure` (devis) |
| Changement de formule | ✅ | portail Stripe + RPC de synchronisation |
| Résiliation / réactivation | ✅ | `cancel_at_period_end`, statuts mappés par `statutAbonnementDepuisStripe` |
| Quotas (personnes) | ✅ | `capacite_personnes_base`, message d'erreur dédié `CAPACITE_PERSONNES_ATTEINTE` |
| Quotas (stockage) | ✅ | `calculerFacturationStockage`, 0,50 €/Go HT au-delà |
| Propriétaire global | ✅ | `plateforme_admins.proprietaire`, contraint à `role='total'` |
| Administrateur plateforme | ✅ | 4 rôles (`total`/`support`/`facturation`/`lecture`), machine à états en CHECK |
| MFA / AAL2 | ⚠️ | exigé sur `/plateforme` uniquement (cf. §6) |
| Support | ✅ | `/aide`, messagerie support, notifications |
| Export des données | ✅ | `/api/rgpd/export` + `/parametres/donnees` |
| Suppression de compte | ✅ | page dédiée + `anonymiser_employe` |

---

## 5. Phase B — Parcours métier

**Couverture fonctionnelle** : 92 routes applicatives sous `(app)`, 49 routes API.
Le périmètre demandé est couvert de bout en bout : prospect/CRM, clients
(particulier et professionnel, `CLIENT_TYPES`), devis, factures, avoirs
(`avoir_emis`), paiements, relances, PDF, e-mail, chantiers, planning, salariés,
pointage (avec sessions et géolocalisation), notes de frais, fournisseurs,
achats, stock, outillage, flotte, documents, photos, rentabilité, reporting.

### 5.1 Numérotation des documents — conforme

```sql
insert into compteurs_reference (entreprise_id, type, dernier_numero) values (…, 1)
on conflict (entreprise_id, type) do update set dernier_numero = dernier_numero + 1
returning dernier_numero
```

Atomique (verrou de ligne), **sans trou**, cloisonnée par entreprise. Le numéro
n'est attribué que lorsque `statut <> 'brouillon'` — un brouillon ne consomme
donc aucun numéro. Format `FAC-YYYY-001`.

**Observation** (pas un défaut) : le compteur est porté par
`(entreprise_id, type)` sans l'année, alors que l'année figure dans le libellé.
La séquence ne repart donc pas à 001 au 1ᵉʳ janvier (`FAC-2026-047` →
`FAC-2027-048`). C'est une séquence continue et chronologique, acceptable ;
mais c'est un choix à assumer explicitement auprès de l'expert-comptable.

L'immuabilité du numéro après émission est couverte par le test pgTAP
`verrouiller_facture_emise` (vert).

### 5.2 Snapshot destinataire

Conformément au mandat, **aucun type n'a été réimplémenté**. Le pont canonique
`src/lib/client-snapshot-contrat.ts` (introduit en `0bfebd8`) reste la seule
voie entre la forme SQL stockée (migration 272) et le contrat client. Le
correctif de §3 ne touche à rien de cette chaîne.

---

## 6. Phase C — Sécurité

Contrôles menés **contre le schéma réel** de la base jetable, pas seulement
par lecture de code.

### 6.1 Résultats

| Contrôle | Résultat |
|---|---|
| **RLS activée** | **198 / 198 tables `public`** — aucune table sans RLS |
| RLS forcée (`FORCE ROW LEVEL SECURITY`) | 5 tables |
| Tables avec RLS **sans aucune policy** (deny-all sauf `service_role`) | 11, toutes techniques : `plateforme_admins`, `stripe_webhook_events`, `rate_limits_applicatifs`, `journal_abus_securite`, `compteurs_reference`, … — posture correcte |
| Policies ouvertes à `anon` | **1 seule** : `modeles_roles_predefinis` (référentiel de rôles, non sensible) |
| Fonctions `SECURITY DEFINER` | **446**, dont **0** sans `search_path` figé |
| Vues dans `public` | 0 (pas de contournement de RLS par vue) |
| Secrets dans les fichiers suivis | 0 sur 1 483 fichiers (`verify:secrets`) |

Les 446 fonctions `SECURITY DEFINER` avec `search_path` épinglé, sans aucune
exception, est le point le plus solide de l'audit : c'est le vecteur
d'escalade de privilèges le plus classique sur PostgreSQL, et il est fermé
intégralement.

### 6.2 Accès direct (hors interface)

Sur les 49 routes API : 26 appellent `getContexteEntreprise` (qui redirige sur
essai expiré et abonnement suspendu), 10 utilisent le client admin et sont
toutes des points d'entrée machine (webhooks Stripe, crons, callback Powens,
import paie) protégés par signature ou secret. Les 13 restantes sont soit
publiques par conception (partage de document par token), soit du domaine
Tools/monetization.

**Liens publics de documents** — conception saine : token de 32 octets
aléatoires, **jamais stocké en clair** (SHA-256 en base), expiration 60 jours,
révocation de l'ancien token à chaque réémission, résolution par fonction
`SECURITY DEFINER` accordée à `anon` (jamais de lecture directe de la table).

**Webhooks Stripe** — signature HMAC vérifiée en temps constant
(`timingSafeEqual`), fenêtre de 300 s contre le rejeu, garde de mode
`STRIPE_WEBHOOK_EXPECTED_MODE` (test/live) **fail-closed**, idempotence par clé
primaire sur l'`id` d'événement Stripe, et contrôle de cohérence du rattachement
(`customer` et `subscription` doivent correspondre à l'entreprise, sinon
`rattachement_stripe_incoherent`).

**MFA / AAL2** — `decisionGardeMfa` est **fail-closed** (`refuser` si l'état AAL
est inconnu ou en erreur). Le dernier facteur vérifié du dernier administrateur
`total` ne peut pas être retiré.

⚠️ **Portée du MFA** : l'AAL2 n'est exigé que pour `/plateforme`, et seulement
si `est_plateforme_admin()` est vrai. **Un administrateur d'entreprise cliente
n'a aucune obligation de MFA**, alors qu'il accède à la paie, aux données
bancaires et aux données personnelles des salariés. C'est une posture à assumer
ou à durcir (P2, §8).

**Activation d'un administrateur plateforme** — `plateforme_activer_admin` exige
cumulativement : rôle `total`, session AAL2, cible déjà rattachée, e-mail Auth
vérifié, **MFA déjà configuré sur le compte cible**, et rejette explicitement
l'auto-activation (`raise exception 'Auto-activation interdite'`).

C'est un contrôle à quatre yeux volontaire, mais il a une conséquence
opérationnelle directe : **en exploitation solo, Julien ne peut pas activer un
nouvel administrateur plateforme depuis l'application**. Il faut soit un second
administrateur `total` actif préexistant en Production, soit une procédure de
secours documentée en SQL `service_role`. À trancher avant le pilote (§9.1).

---

## 7. Phase D — Exploitation

| Domaine | État | Constat |
|---|---|---|
| Environnements | ✅ | `ELSATIA_APPLICATION_ENV`, `.env.example` / `.env.local.example` / `.env.preview.example` |
| Domaines | ⚠️ | `app.elsatia.fr` (app) et `elsatia.fr` (vitrine) déclarés dans le pack juridique ; DNS **non vérifiable depuis l'audit** |
| E-mails transactionnels | ✅ | Brevo, transport mutualisé `@elsatia/email` — un seul jeu de secrets |
| Délivrabilité (SPF/DKIM/DMARC) | ❌ | **non vérifiable depuis le dépôt** — contrôle opérateur obligatoire |
| Stripe Test | ⚠️ | configuré, mais catalogue incohérent (P0-1) |
| Stripe Live | ❌ | jamais configuré — hors mandat |
| Webhooks | ✅ | 3 endpoints séparés (facture, abonnement, boutique), secrets distincts |
| Idempotence | ✅ | PK sur l'`id` d'événement + `Idempotency-Key` sur les appels sortants |
| Supervision | ✅ | Sentry (client / serveur / edge) + `instrumentation.ts` |
| Journal d'activité | ✅ | table `journal_activite` + vue opérateur « Diagnostic Stripe » |
| Alertes | ⚠️ | détection par **silence** (`abonnementsSilencieux`, seuil 7 j) — pertinent, mais aucune alerte poussée : suppose une consultation manuelle |
| Sauvegardes / PITR / restauration | ❌ | **non vérifiable depuis le dépôt** — dépend de la console Supabase |
| Rollback | ✅ | `docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md` |
| Procédures internes | ✅ | 5 runbooks (cutover, préflight, rollback, gouvernance, attestation Ed25519) |
| Statut de service | ❌ | aucune page de statut |

Aucun secret réel ne figure dans ce rapport : les variables d'environnement
n'ont été inspectées que par **nom** et par **classification**
(`TEST` / `LIVE` / `price_id` / `whsec` / absent).

---

## 8. Phase E — Conformité documentaire

Classement **technique uniquement**. Ce rapport ne porte aucune validation
juridique.

| Document | Classement | Constat |
|---|---|---|
| Mentions légales | **Incomplet** | Présent et rendu, mais SIRET et mention de TVA sont des jetons non résolus |
| CGV (113 l.) | **Incomplet** | Présent, clause de substitution incluse ; pas de médiateur de la consommation |
| CGU (63 l.) | **Techniquement présent** | — |
| Politique de confidentialité (80 l.) | **Techniquement présent** | CNIL et sous-traitants mentionnés |
| Politique de cookies (29 l.) | **Techniquement présent** | — |
| Registre des traitements (art. 30) | **Techniquement présent** | — |
| Registre des sous-traitants (art. 28) | **Techniquement présent** | — |
| DPA entreprises clientes | **Techniquement présent** | Double casquette responsable/sous-traitant correctement posée |
| Gestion des cookies (bandeau) | **Absent** | Assumé : aucun traceur non essentiel |
| Export / suppression / conservation | **Techniquement présent** | `/api/rgpd/export`, suppression de compte, anonymisation salarié |
| Facturation / numérotation / TVA / avoirs | **Techniquement présent** | cf. §5.1 |
| Historique des destinataires / identité émetteur et destinataire | **Techniquement présent** | Snapshot figé (migration 272) |
| **Ensemble du pack** | **À faire valider par avocat** | Le `README.md` du pack le déclare lui-même : *« brouillons solides, à faire relire par un avocat »* |

**Blocage dur.** `NEXT_PUBLIC_LEGAL_SIRET` et `NEXT_PUBLIC_LEGAL_TVA` ne sont pas
définies. Les pages publient donc un repli neutre : SIRET
« *en cours de finalisation* », TVA « *à confirmer* ». Le repli est un bon choix
d'ingénierie (il n'affirme rien de faux), mais **des mentions légales sans SIRET
ne sont pas publiables pour vendre**. La checklist du pack confirme que SIRET,
RCS, code APE/NAF et régime de TVA sont tous en attente de l'immatriculation.

Points à soumettre à l'avocat / l'expert-comptable : absence de médiateur de la
consommation en CGV (nécessaire si un « client particulier » est visé — or ce
type existe dans le produit), absence de RCS et d'hébergeur dans les mentions
légales, absence de DPO désigné, et la séquence de numérotation continue
inter-annuelle (§5.1).

---

## 9. Phase F — Performance et qualité

### 9.1 Test de volume réel

Mesure conduite sur la base jetable, **dans une transaction annulée**
(20 000 dépenses fournisseurs sur une entreprise, `ANALYZE`, puis
`EXPLAIN (ANALYZE, BUFFERS)` sur la requête exacte de la page `/depenses`) :

```
Index Scan using depenses_fournisseurs_entreprise_date_idx  (rows=20000)
Execution Time: 14.879 ms
```

**La base n'est pas le problème** : l'index composite `(entreprise_id, date)`
est utilisé, la jointure fournisseur passe par un `Memoize` (19 999 hits sur
20 000). 15 ms pour 20 000 lignes.

**Le problème est en aval.** La page ne borne pas sa requête : les 20 000 lignes
(width 451 o) sont sérialisées en JSON — **≈ 9 Mo par chargement de page** — puis
rendues en DOM. C'est un défaut de charge réseau et mémoire client, pas un défaut SQL.

### 9.2 Pagination

| Paginé côté serveur (RPC dédiée) | Non borné |
|---|---|
| `clients` (`clients_liste_paginee`, 25/page) | `depenses` — `depenses_fournisseurs` en `select *` |
| `devis` (`devis_liste_paginee`) | `interventions`, `contrats_entretien`, `bons_livraison` |
| `factures` (`factures_liste_paginee`) | `fournisseurs`, `employes` (bornés de fait par le quota de personnes) |
| `chantiers` (`chantiers_liste_paginee`) | `notes-frais` — `.limit(300)` : borné mais **tronque silencieusement** |

`pointage` est borné par plage de dates et `stock` par `.limit(30)` : corrects.

### 9.3 Index

237 clés étrangères sans index dédié, **très majoritairement sur les tables
`reserves_*`** (application Réserves, hors périmètre GP commercial). Les tables
GP chaudes sont correctement indexées, comme le montre §9.1.

### 9.4 Qualité

| Contrôle | Résultat |
|---|---|
| `tsc --noEmit` (GP) | ✅ 0 erreur |
| `eslint` (racine) | ✅ 0 erreur, 3 avertissements (`<img>` au lieu de `next/image`) |
| `vitest run` (GP) | ✅ **1 208 tests / 115 fichiers**, 100 % verts, 2,74 s |
| `next build` (GP) | ✅ succès |
| `verify:migrations` | ✅ 270 migrations valides, noms et horodatages uniques |
| `verify:secrets` | ✅ 1 483 fichiers, aucun secret |
| `verify:stripe-prices` | ❌ **6 divergences** (P0-1) |
| pgTAP (base jetable) | ✅ **67/67 fichiers, 1 846 assertions**, 0 échec *(après le correctif §3)* |

**Non exécuté** : `mobile`, `accessibilité`, `navigateur`, E2E Playwright.
Les 10 spécifications E2E existent (`auth-session`, `isolation-rest`,
`roles-and-direct-access`, `security`, `responsive`, …) mais exigent une pile
applicative servie ; elles relèvent des contrôles humains (§11).
La consommation mémoire côté navigateur et les exports volumineux n'ont pas été
mesurés : ils demandent un vrai navigateur sous charge.

**Limite d'honnêteté sur §9.1** : la mesure a été faite en `postgres`
(superutilisateur), donc **sans le coût d'évaluation des politiques RLS**.
Le temps réel sous rôle `authenticated` sera supérieur ; l'ordre de grandeur et
la conclusion (index correct, payload non borné) restent valides.

---

## 10. Blocages

### 10.1 Blocages externes (non levables par le code)

| # | Blocage | Impact |
|---|---|---|
| E1 | **SIRET / RCS / code APE / régime de TVA** en attente d'immatriculation | Mentions légales et CGV non publiables → pas de vente |
| E2 | **Relecture juridique** du pack non faite (~300–500 € annoncés) | Risque contractuel sur CGV/CGU/DPA |
| E3 | **Stripe Live** jamais configuré (compte, prix, webhooks, vérification d'identité) | Aucun encaissement possible |
| E4 | **SPF / DKIM / DMARC** sur `elsatia.fr` non vérifiés | Devis et factures en spam |
| E5 | **Sauvegardes / PITR / test de restauration** non vérifiables depuis le dépôt | Pas de preuve de réversibilité |
| E6 | **Marque ELSATIA** — calendrier INPI en cours | Communication commerciale contrainte |

### 10.2 Blocages techniques

| # | Blocage | Gravité |
|---|---|---|
| T1 | Prix affiché ≠ prix facturé (Mini, Pro, Business mensuels) | **P0** |
| T2 | Identité légale non résolue dans les pages publiques | **P0** |
| T3 | `verify:stripe-prices` silencieux sans clé Stripe | **P1** |
| T4 | Requêtes de liste non bornées | **P1** |
| T5 | Activation d'un admin plateforme impossible en solo | **P1** |
| T6 | MFA non exigé pour les administrateurs d'entreprise | **P2** |
| T7 | `tax_behavior: unspecified` sur les 16 Price Stripe | **P2** |
| T8 | `project_id = "btp-platform"` dans le worktree du train | **P2** |

---

## 11. Classement P0 / P1 / P2

### P0 — bloque la commercialisation

**P0-1 — Le prix affiché n'est pas le prix facturé.**
Mini 79 € affiché / 69 € facturé ; Pro 249 / 199 ; Business 449 / 399. Les prix
mensuels Stripe Test sont restés sur `TARIFS-V2`. La règle « 2 mois offerts »
est fausse pour ces trois offres. *Correction : geste opérateur dans Stripe
(recréer les Price mensuels à la grille canonique, repointer `STRIPE_PRICE_*`),
puis `verify:stripe-prices` doit sortir 0 divergence. **Aucun prix ne doit être
modifié dans le code** — le code porte déjà la grille validée.*

**P0-2 — Identité légale non publiable.**
SIRET et mention de TVA rendus comme « en cours de finalisation » / « à
confirmer ». *Correction : immatriculation, puis renseigner
`NEXT_PUBLIC_LEGAL_SIRET` et `NEXT_PUBLIC_LEGAL_TVA`.*

### P1 — bloque le pilote client externe

**P1-1 — Le garde-fou tarifaire ne bloque pas par défaut.**
`verify-stripe-prices.mjs` passe en SKIP non bloquant sans `STRIPE_SECRET_KEY`.
En CI sans clé, la divergence P0-1 serait passée inaperçue. *Correction :
`STRIPE_PRICES_VERIFY_STRICT=1` sur le pipeline de release.*

**P1-2 — Requêtes de liste non bornées.**
`/depenses`, `/interventions` et leurs tables satellites chargent l'intégralité
de l'historique. Mesuré : ≈ 9 Mo de JSON à 20 000 lignes. `/notes-frais` tronque
silencieusement à 300. *Correction : étendre le motif `*_liste_paginee` déjà en
place pour clients/devis/factures/chantiers.*

**P1-3 — Bootstrap administrateur plateforme impossible en solo.**
`Auto-activation interdite` + MFA obligatoire sur la cible. *Correction :
vérifier qu'un second administrateur `total` actif existe en Production, ou
documenter la procédure de secours `service_role`.*

### P2 — à traiter avant montée en charge

- **P2-1** MFA non exigé pour les administrateurs d'entreprise cliente (accès paie et données bancaires sans second facteur).
- **P2-2** `tax_behavior: unspecified` incompatible avec `STRIPE_AUTOMATIC_TAX_ENABLED=true`.
- **P2-3** `project_id = "btp-platform"` : un `supabase test db` depuis le worktree du train viserait la base locale principale.
- **P2-4** 237 FK sans index (essentiellement `reserves_*`).
- **P2-5** Aucune alerte poussée : la supervision repose sur une consultation manuelle du diagnostic.
- **P2-6** Aucune page de statut de service.
- **P2-7** Numérotation continue inter-annuelle — à faire confirmer par l'expert-comptable.

---

## 12. Phase G — Protocole de pilote humain

Chaque étape : **action → résultat attendu → preuve à conserver → gravité si échec**.
Prérequis : environnement Preview, Stripe **Test**, données **fictives**, et
acceptation explicite de P0-1 (les montants affichés ne seront pas ceux débités).

### Bloc 0 — Préparation

| # | Action | Résultat attendu | Preuve | Gravité |
|---|---|---|---|---|
| 0.1 | Confirmer l'environnement (bandeau/version) | Preview, jamais Production | Capture `/parametres/version` | **Critique** |
| 0.2 | Vérifier `STRIPE_WEBHOOK_EXPECTED_MODE=test` | `test` | Capture config | **Critique** |
| 0.3 | Confirmer l'existence d'un 2ᵉ admin `total` actif | ≥ 2 admins actifs | Export `plateforme_lister_admins` | Majeure |

### Bloc 1 — Comptes et droits

| # | Action | Résultat attendu | Preuve | Gravité |
|---|---|---|---|---|
| 1.1 | Créer le compte propriétaire + entreprise | Onboarding jusqu'au dashboard | Captures | **Critique** |
| 1.2 | Vérifier le statut d'essai | « essai », J-30 | Capture `/abonnement` | Majeure |
| 1.3 | Ouvrir les 9 écrans du SOCLE | Aucune redirection « module non inclus » | 9 captures | **Critique** |
| 1.4 | Ouvrir un écran hors SOCLE (ex. `/paie`) | Redirection `/abonnement/module-non-inclus` | Capture | Majeure |
| 1.5 | Créer un compte administrateur | Invitation reçue et activée | Capture + e-mail | Majeure |
| 1.6 | Créer un compte salarié | Statut « en attente » puis actif après affectation | Captures | Majeure |
| 1.7 | Activer le MFA sur le compte propriétaire | TOTP vérifié | Capture | Majeure |
| 1.8 | Accéder à `/plateforme` sans AAL2 | Redirection challenge/enrôlement | Capture | **Critique** |

### Bloc 2 — Référentiels

| # | Action | Résultat attendu | Preuve | Gravité |
|---|---|---|---|---|
| 2.1 | Créer un client **particulier** | Fiche créée, référence auto | Capture | Majeure |
| 2.2 | Créer un client **professionnel** | Fiche créée, champs société | Capture | Majeure |
| 2.3 | Créer un fournisseur | Fiche créée | Capture | Mineure |
| 2.4 | Créer un chantier rattaché au client pro | Chantier lié | Capture | Majeure |

### Bloc 3 — Chaîne commerciale

| # | Action | Résultat attendu | Preuve | Gravité |
|---|---|---|---|---|
| 3.1 | Créer un devis en brouillon | **Aucun numéro attribué** | Capture | Majeure |
| 3.2 | Émettre le devis | Numéro `DEV-2026-001` | Capture | **Critique** |
| 3.3 | Générer le PDF | PDF conforme, identité émetteur + destinataire | **PDF conservé** | **Critique** |
| 3.4 | Envoyer le devis par e-mail | Reçu, lien de partage fonctionnel | E-mail + capture | **Critique** |
| 3.5 | Ouvrir le lien de partage **en navigation privée** | Document visible **sans compte** | Capture | **Critique** |
| 3.6 | Accepter le devis | Statut « accepté » | Capture | Majeure |
| 3.7 | Convertir en facture | Facture liée, `FAC-2026-001` | Capture | **Critique** |
| 3.8 | Modifier le nom du client, puis rouvrir la facture | **L'ancien nom reste figé** (snapshot) | 2 captures | **Critique** |
| 3.9 | Émettre un avoir | Avoir lié, numérotation propre | Capture + PDF | **Critique** |
| 3.10 | Enregistrer un paiement partiel | Solde recalculé | Capture | Majeure |
| 3.11 | Déclencher une relance | Relance générée et envoyée | E-mail | Majeure |

### Bloc 4 — Terrain

| # | Action | Résultat attendu | Preuve | Gravité |
|---|---|---|---|---|
| 4.1 | Saisir un pointage salarié | Heures enregistrées | Capture | Majeure |
| 4.2 | Valider le pointage en tant qu'admin | Statut vérifié | Capture | Majeure |
| 4.3 | Saisir une note de frais avec justificatif | Pièce jointe stockée | Capture | Majeure |
| 4.4 | Saisir une dépense fournisseur | Dépense rattachée au chantier | Capture | Mineure |
| 4.5 | Téléverser un document et une photo de chantier | Fichiers visibles | Captures | Majeure |
| 4.6 | Consulter la marge du chantier | Marge cohérente avec 4.4 | Capture | Majeure |

### Bloc 5 — Isolation et incidents *(le bloc le plus important)*

| # | Action | Résultat attendu | Preuve | Gravité |
|---|---|---|---|---|
| 5.1 | Créer une **2ᵉ entreprise** avec un autre compte | Deux tenants distincts | Capture | **Critique** |
| 5.2 | Depuis l'entreprise B, ouvrir une **URL d'un document de A** | **Refus ou 404** | Capture | **Critique** |
| 5.3 | Depuis l'entreprise B, appeler l'**API PDF** de la facture de A | **Refus** | Réponse HTTP | **Critique** |
| 5.4 | Salarié : ouvrir `/paie` et `/rentabilite` | Refus | Captures | **Critique** |
| 5.5 | Révoquer le lien de partage, puis le rouvrir | **Refus** | Capture | **Critique** |
| 5.6 | Forcer une erreur (URL inexistante) | Message propre, **aucune trace technique** | Capture | Majeure |
| 5.7 | Vérifier le journal d'activité | Actions tracées | Capture | Majeure |

### Bloc 6 — Fin de vie

| # | Action | Résultat attendu | Preuve | Gravité |
|---|---|---|---|---|
| 6.1 | Forcer l'expiration de l'essai *(base jetable)* | Redirection `/abonnement-suspendu?motif=essai_expire` | Capture | **Critique** |
| 6.2 | Depuis l'essai expiré : `/aide`, `/parametres/donnees`, `/abonnement` | **Les 3 restent accessibles** | 3 captures | **Critique** |
| 6.3 | Depuis l'essai expiré : `/clients` | Bloqué | Capture | Majeure |
| 6.4 | Lancer l'export RGPD | Archive complète téléchargée | **Archive conservée** | **Critique** |
| 6.5 | Souscrire une offre en Stripe **Test** | ⚠️ **Constater l'écart P0-1** | Capture affichage + reçu Stripe | **Critique** |
| 6.6 | Changer de formule via le portail | Formule et quotas mis à jour | Capture | Majeure |
| 6.7 | Résilier puis réactiver | Statuts cohérents | Captures | Majeure |
| 6.8 | Demander la suppression du compte | Procédure engagée, délai annoncé | Capture | **Critique** |
| 6.9 | Se déconnecter, revenir | Session fermée proprement | Capture | Majeure |

### Bloc 7 — Mobile

| # | Action | Résultat attendu | Preuve | Gravité |
|---|---|---|---|---|
| 7.1 | Refaire 4.1, 4.3, 4.5 sur téléphone réel | Utilisable sans zoom ni scroll horizontal | Captures | Majeure |
| 7.2 | Ouvrir `/depenses` avec ~500 lignes | Temps de chargement acceptable | Chrono + capture | Majeure (P1-2) |

---

## 13. Checklists

### 13.1 Checklist pilote — conditions du GO

- [ ] Environnement Preview confirmé, Production intouchée
- [ ] `STRIPE_WEBHOOK_EXPECTED_MODE=test`
- [ ] Écart P0-1 explicitement accepté et consigné
- [ ] Second administrateur `total` actif vérifié (P1-3)
- [ ] Données strictement fictives
- [ ] Blocs 0 → 7 exécutés, preuves archivées
- [ ] Aucun échec de gravité **Critique**

### 13.2 Checklist production — conditions du GO commercial

- [ ] E1 — SIRET, RCS, APE, régime de TVA obtenus
- [ ] `NEXT_PUBLIC_LEGAL_SIRET` et `NEXT_PUBLIC_LEGAL_TVA` renseignées, pages relues
- [ ] E2 — pack juridique relu par un avocat
- [ ] E3 — compte Stripe Live vérifié et activé
- [ ] Price **Live** créés à la grille canonique (79 / 249 / 449 / 599)
- [ ] `tax_behavior` explicite sur tous les Price (P2-2)
- [ ] `verify:stripe-prices --strict` → **0 divergence**, en Test **et** en Live
- [ ] `STRIPE_PRICES_VERIFY_STRICT=1` dans le pipeline (P1-1)
- [ ] Webhooks Live enregistrés, `STRIPE_WEBHOOK_EXPECTED_MODE=live`
- [ ] E4 — SPF, DKIM, DMARC validés ; envoi réel testé
- [ ] E5 — sauvegarde datée **et restauration testée** (§13.4)
- [ ] Sentry actif, alertes configurées
- [ ] Pagination livrée sur `/depenses` et `/interventions` (P1-2)
- [ ] `npm run verify` intégralement vert
- [ ] pgTAP 67/67 sur le canon V2 (inclut le correctif §3)
- [ ] Runbook de rollback relu, fenêtre et responsable nommés

### 13.3 Checklist rollback

- [ ] SHA de la version précédente noté **avant** déploiement
- [ ] Sauvegarde datée prise **avant** toute migration
- [ ] Suivre `docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md`
- [ ] Revenir au déploiement précédent (Vercel)
- [ ] Vérifier qu'aucune migration du lot n'est destructive avant d'envisager un retour schéma
- [ ] Repointer `STRIPE_PRICE_*` sur les valeurs précédentes si le catalogue a changé
- [ ] Désactiver les webhooks Live pendant la bascule, les réactiver après
- [ ] Rejouer les événements Stripe manqués (l'idempotence par PK rend le rejeu sûr)
- [ ] Vérifier : connexion, `/dashboard`, PDF d'une facture, lien de partage
- [ ] Consigner l'incident et l'heure de rétablissement

### 13.4 Checklist sauvegarde / restauration

- [ ] Confirmer la rétention PITR du plan Supabase Production
- [ ] Déclencher une **sauvegarde datée manuelle** avant tout lot
- [ ] Noter horodatage, taille, ledger (n° de migration max)
- [ ] **Restaurer cette sauvegarde dans un projet jetable** — jamais en Production
- [ ] Vérifier sur la copie : nombre de migrations, RLS 198/198, comptages métier
- [ ] Rejouer la suite pgTAP sur la copie (67/67 attendus)
- [ ] Vérifier la restauration des fichiers Storage, pas seulement de la base
- [ ] Chronométrer la restauration → **RTO réel**
- [ ] Consigner RTO et RPO dans le runbook
- [ ] Détruire la copie jetable

---

## 14. Actions à effectuer au retour de Julien

### Décisions (personne d'autre ne peut les prendre)

1. **Valider formellement la grille canonique** 79 / 249 / 449 / 599 — aucune trace de validation dans le dépôt.
2. **Arbitrer P0-1** : aligner Stripe sur le code (recommandé, le code porte la grille validée) ou l'inverse.
3. **Trancher P1-3** : second administrateur `total`, ou procédure de secours documentée.
4. **Trancher P2-1** : rendre le MFA obligatoire pour les administrateurs d'entreprise ?
5. **Assumer ou corriger** la numérotation continue inter-annuelle (§5.1), après avis de l'expert-comptable.

### Gestes opérateur (accès dont je ne dispose pas)

6. Recréer les Price mensuels Stripe **Test** à la grille canonique, repointer `STRIPE_PRICE_*`, puis relancer `verify:stripe-prices` jusqu'à **0 divergence**.
7. Renseigner `NEXT_PUBLIC_LEGAL_SIRET` / `NEXT_PUBLIC_LEGAL_TVA` dès l'immatriculation reçue.
8. Vérifier SPF / DKIM / DMARC sur `elsatia.fr` et envoyer un e-mail de test réel.
9. Vérifier la rétention PITR et **exécuter le §13.4 de bout en bout** — l'action la plus urgente de cette liste : aucune preuve de réversibilité n'existe aujourd'hui.
10. Configurer les alertes Sentry.

### Contrôles humains — `À FAIRE AU RETOUR DE JULIEN`

11. `À FAIRE AU RETOUR DE JULIEN` — exécuter le protocole §12 (blocs 0 à 7).
12. `À FAIRE AU RETOUR DE JULIEN` — exécuter les 10 spécifications E2E Playwright sur pile servie.
13. `À FAIRE AU RETOUR DE JULIEN` — recette mobile sur téléphone réel.
14. `À FAIRE AU RETOUR DE JULIEN` — recette accessibilité et multi-navigateurs.
15. `À FAIRE AU RETOUR DE JULIEN` — mesurer un export volumineux et la mémoire navigateur.
16. `À FAIRE AU RETOUR DE JULIEN` — faire relire le pack juridique par un avocat.

### Intégration technique

17. Cherry-pick `1fceabca24e0aecb4d64669fabcab65b4aedf3a5` sur le canon V2 (1 ligne, fichier de test, se pose sur les trois références).
18. Planifier P1-2 (pagination `/depenses`, `/interventions`) — extension d'un motif déjà en place, sans migration.
19. Ajouter `STRIPE_PRICES_VERIFY_STRICT=1` au pipeline de release.

---

## 15. Ce que cet audit n'a pas couvert

Par honnêteté sur la portée :

- **Stripe Live** : aucune vérification (hors mandat, aucune clé disponible).
- **Production** : aucune lecture, aucune écriture.
- **Sauvegardes / PITR** : dépendent de la console Supabase.
- **DNS, SPF, DKIM, DMARC** : non vérifiables depuis le dépôt.
- **E2E, mobile, accessibilité, navigateurs, mémoire** : exigent une pile servie et un humain.
- **Coût RLS en performance** : la mesure §9.1 a été faite en superutilisateur.
- **Validation juridique** : hors compétence — classement technique uniquement.
- **Applications Colors, Tools, Réserves** : hors périmètre GP, présentes dans le train mais non auditées ici.

---

*Rapport produit sans aucune migration, aucun déploiement, aucune écriture en
Production et aucune activation Stripe Live. Aucun secret réel n'y figure.
Aucun canon n'est désigné : les constats s'appliquent aux trois références et
sont transposables au futur train V2.*
