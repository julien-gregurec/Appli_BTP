# ELSATIA — Stripe Resubscription Flow V1

| | |
|---|---|
| Date | 2026-09-27 |
| Base | `claude/zen-goldberg-abwptn` @ `6ec71eb5` — train le plus récent contenant **Stripe Ordering** (port `af709660`, migration 506) et **Stripe Trial Synchronization** (`395b7021` + seconde passe `6ec71eb5`, migration 507), sur `integration/elsatia-canonical-train-v3` @ `ef7443c0` |
| Branche | `claude/quirky-volta-b64l62` (repartie de la base ci-dessus) |
| Migration | `20260927000508_stripe_resubscription_flow_v1.sql` (nouvelle, additive) — **343** au total |
| Environnement | PostgreSQL 16.13 natif + pgTAP 1.3.2 (`scripts/local-postgres-bootstrap`), Node 22 / Vitest 4, Playwright 1.62 + Chromium local, passerelle Supabase locale du dépôt. Aucun appel Stripe réel, aucune Preview, aucune Production, aucun merge. |

## Verdict

**STRIPE RESUBSCRIPTION LOCALLY QUALIFIED**

- Une entreprise dont l'abonnement Stripe est terminé dispose d'un **vrai parcours de réabonnement** :
  écran « Abonnement annulé », offres re-souscriptibles (« Réactiver avec cette offre »), nouveau
  Checkout sur le **même client Stripe**, **sans aucun essai**, rattachement de la nouvelle
  subscription par le webhook, droits rendus **seulement** quand Stripe confirme un état compatible.
- **Réactivation préférée** : une subscription encore réactivable (`cancel_at_period_end`,
  `past_due`, `unpaid`, `incomplete`) n'ouvre **jamais** de Checkout ; le Portail Stripe porte la
  reprise (« Reprendre l'abonnement ») et le paiement (« Payer la facture », « Mettre à jour le moyen
  de paiement »). Aucune fonction Stripe dupliquée.
- **Garde anti-double abonnement conservée et renforcée** : la base ne remplace la subscription
  rattachée que si l'ancienne est **terminée chez Stripe** (relue par le serveur) et le client
  identique ; 60 rattachements concurrents de subscriptions différentes → une seule gagne.
- **Webhooks** `created / updated / deleted / invoice.paid / invoice.payment_failed` : 120 ordres
  de livraison sur 120 convergent, rejeux sans effet, événements tardifs de l'ancienne subscription
  **sans effet** (ni suspension de la nouvelle, ni réouverture d'accès par une vieille facture).
- **Deux blocages réels trouvés en navigateur et corrigés** (§6) : pour une entreprise suspendue ou
  annulée, la RLS masquait l'entreprise et les permissions de poste à ses propres administrateurs —
  la page Abonnement affichait « Fonctionnalité non disponible » et aucun réabonnement ni
  régularisation n'était possible, **même avant ce lot**.
- Aucune régression : pgTAP 137 fichiers / 128 propres (les **mêmes 9** fichiers hérités qu'à la
  baseline, résultats identiques fichier par fichier), Vitest **1 997/1 997**, Playwright **6/6**,
  concurrence réelle du réabonnement **20/20**, ordre **15/15**, essai **7/7**, `next build` Gestion Pro OK.

Hors de ce verdict (§11) : exécution Stripe Test distante (script prêt, `sk_live` refusée avant
réseau, aucune clé test disponible), dont la vérification en conditions réelles du bouton de reprise
du Portail.

---

## 1. Base

`claude/zen-goldberg-abwptn` est la seule branche contenant à la fois le port Stripe Ordering
(`af709660`) et Stripe Trial Synchronization (`395b7021`, `6ec71eb5`) ; ses rapports concluent
respectivement « Stripe Ordering qualifié » et **STRIPE TRIAL LOCALLY QUALIFIED**. La branche de
travail a été repartie de ce commit (elle ne portait que de l'historique déjà présent dans `main`).

Baseline mesurée sur cette base (base neuve, 342 migrations) : pgTAP **136 fichiers, 127 propres,
3 428 ok** (9 fichiers non propres hérités : `platform_stripe_state_attestation_r72` — stub
`pgsodium` —, 7 suites Studio, `elsatia_tools_cloud_sync_entitlement_closure_v1`) ; Vitest
**162 fichiers, 1 939 tests, 0 échec**.

## 2. Constat : aucun parcours de réabonnement

| Couche | Comportement avant ce lot | Conséquence |
|---|---|---|
| Checkout | `preparerCheckoutAbonnement` refuse (`AbonnementStripeDejaRattache`) dès que `stripe_subscription_id` est posé ; ce champ n'est **jamais** remis à `NULL` | une entreprise annulée ne peut plus jamais souscrire |
| Webhook | `entreprisePour` renvoie 422 si la subscription diffère de la rattachée ; `lier_subscription_entreprise_service` et `synchroniser_abonnement_stripe_service` ne lient qu'au-dessus de `NULL` (42501) | même créée à la main chez Stripe, une nouvelle subscription n'est jamais rattachée ; accès jamais rendu, 422 re-livrés 3 jours |
| `invoice.*` | aucune garde de subscription | après un réabonnement, un `invoice.payment_failed` tardif de l'**ancienne** suspendrait la nouvelle ; un `invoice.paid` d'une vieille facture rouvrirait l'accès d'une entreprise annulée |
| UX | `souscrit = Boolean(stripe_subscription_id)` : une entreprise annulée voit « Gérer mon abonnement », jamais les offres ; `/abonnement-suspendu` affiche un texte générique | aucun écran « annulé », « reprendre », « paiement requis » |
| Droits (RLS) | `est_membre_actif` exclut `abonnement_statut in ('suspendu','annule')` : l'entreprise **et** ses `permissions_poste` deviennent invisibles à ses membres | `/abonnement` → « Fonctionnalité non disponible » ; formulaires en lecture seule ; `ouvrirPortailAbonnementSuspenduAction` lisait `stripe_customer_id` → « Aucun abonnement Stripe n'est associé » (constaté en navigateur, §9) |

## 3. Décisions

| Sujet | Décision |
|---|---|
| Réactivable vs nouveau Checkout | Parcours décidé par l'état Stripe **relu** (jamais l'état local) : `canceled` / `incomplete_expired` → nouveau Checkout ; `active`/`trialing` + `cancel_at_period_end` ou `cancel_at` → **Portail** (reprise) ; `past_due` / `unpaid` / `incomplete` → **Portail** + facture hébergée (paiement requis) ; `active`/`trialing` → déjà actif ; `paused` / inconnu → support |
| Essai | **Aucun essai** dès qu'un essai ELSATIA a été consommé : subscription déjà rattachée (même terminée), ou **toute** subscription passée du client chez Stripe (même non liée en base). Au rattachement d'un réabonnement, la fenêtre d'essai locale est **close** (`current_date - 1`, jamais avant son début) : un `trialing` Stripe ne rouvre aucun accès |
| Customer | Le client Stripe existant est **réutilisé** (aucun `POST customers`) ; supprimé chez Stripe → refus explicite `ClientStripeInvalide` (message support), jamais de nouveau client silencieux ; la base refuse une subscription d'un autre client (42501) |
| Double abonnement | Checkout : refus si une subscription **non terminée** existe chez Stripe (+ balayage des sessions ouvertes, inchangé). Base : remplacement uniquement si l'ancienne est terminée chez Stripe, sous verrou de ligne |
| Portail | Reprise d'une résiliation programmée et paiement : **Portail Stripe** (configuration `subscription_cancel` `at_period_end` déjà versionnée) ; lien direct vers la facture hébergée Stripe quand elle est connue |
| Droits | Rendus uniquement par une transition appliquée par la base depuis un état Stripe compatible (`active`, `trialing` borné, `invoice.paid`) ; l'action de reprise n'écrit **aucun** droit |

## 4. Migration `20260927000508` (additive)

1. **`stripe_subscriptions_remplacees`** : historique (subscription remplacée, remplaçante, statut
   Stripe observé ∈ {`canceled`, `incomplete_expired`}, client). RLS, lecture plateforme
   `gerer_facturation`, aucune écriture directe (service_role compris). Une subscription remplacée
   n'est **jamais** re-rattachable (unicité).
2. **`relier_subscription_reabonnement_service`** (service_role) : seul chemin qui remplace la
   subscription d'une entreprise, sous `FOR UPDATE` :

   | Situation | Issue |
   |---|---|
   | déjà la courante | `deja_lie` |
   | subscription déjà remplacée | `remplacee` (jamais re-rattachée) |
   | nouvelle déjà terminale | `terminale_ignoree` (jamais rattachée) |
   | client différent de celui de l'entreprise | **42501** |
   | aucune courante | `lie` (contrat historique, CAS sur `NULL`) |
   | ancienne ≠ celle annoncée | **42501** |
   | ancienne non terminée chez Stripe | **42501** (anti-double abonnement) |
   | sinon | `relie` : historique, nouvelle courante, annulation programmée effacée, **essai clos**, filigrane d'accès `entreprise_acces` réinitialisé |

   Le filigrane appartenait à l'ancienne subscription (dont les événements sont désormais filtrés) :
   sans réinitialisation, un `created` de la nouvelle refusé tant que l'ancienne vivait puis
   re-livré après son `deleted` (plus récent) serait jugé « périmé » et l'accès ne reviendrait pas
   (cas C10, mutation M3).
3. **`appliquer_evenement_facture_abonnement_v2_service`** (service_role) : garde de subscription
   sous le même verrou, puis contrat 506 inchangé. Facture de la courante / sans subscription /
   entreprise jamais liée → 506 ; d'une **remplacée** → ligne de facture conservée, accès inchangé,
   journal `sans_effet` `subscription_remplacee` ; d'une subscription **inconnue** → `differe` :
   rien n'est écrit ni journalisé, le webhook répond 503 (`Retry-After: 30`) et Stripe re-livre.
4. **`etat_reabonnement_entreprise(uuid)`** (authenticated) : état de reprise pour un **membre
   actif** (ou l'accès support), y compris entreprise suspendue/annulée : statut, subscription
   rattachée (booléen), annulation programmée, statut et URL de la dernière facture, `peut_gerer`
   (`gerer_parametres` ou support). **Aucun identifiant Stripe exposé** ; session révoquée, membre
   désactivé, autre entreprise → aucune ligne.

Rejouée deux fois sur la même base : aucune erreur. Montée 342 → 343 sur une base existante :
données intactes, schéma **identique** au schéma neuf (`pg_dump -s`, seuls les jetons `\restrict`
aléatoires diffèrent). DB verify Preview : contrôle **19** (historique, rattachement, facture v2),
`contrôlé` ; attendus du train régénérés (343 migrations, 19 contrôles). `db-verify` : les deux RPC
de service ajoutées à la liste « service-role only » (vérifié : `f|f|t`).

## 5. Application

| Fichier | Changement |
|---|---|
| `src/lib/stripe-reabonnement.ts` (nouveau, pur) | `parcoursDepuisSubscription`, `subscriptionBloqueCheckout`, `parcoursViaPortail`, écrans (`ecranReabonnement`, `offresSouscriptibles`), messages |
| `src/lib/stripe-abonnement.ts` | `preparerCheckoutAbonnement` relit la subscription rattachée : terminée → réabonnement **sans essai**, sinon refus porteur du parcours ; `verifierClientStripeUtilisable` ; `verifierAucuneSubscriptionStripeVivante` refuse toute subscription non terminale (statut inconnu compris) et signale un essai consommé ; retours Checkout `?reabonnement=1` |
| `src/lib/stripe-essai-checkout.ts` | raison `essai_consomme`, clé d'idempotence `sans-essai-reabonnement` |
| `src/lib/stripe-abonnement-synchronisation.ts` | `rattacherSubscription` : relit l'**ancienne** chez Stripe et délègue à la RPC 508 ; `remplacee` / `terminale_ignoree` → journal sans effet, aucune synchronisation ; 42501 → `RattachementSubscriptionRefuse` |
| `src/app/api/stripe/abonnement/webhook/route.ts` | plus de 422 à la résolution pour une subscription différente (la base décide) ; 422 si refus de rattachement ; `invoice.*` → RPC v2 avec la subscription (`invoice.subscription` ou `parent.subscription_details.subscription`) ; `differe` → 503 rejouable ; `invoice.created` d'une subscription non courante : aucune ligne de dépassement |
| `src/app/actions/abonnement.ts` | messages de refus par parcours ; `reprendreAbonnementAction` (relecture Stripe → Portail / offres / message) ; lectures Stripe par client serveur **après** contrôle du droit |
| `src/lib/permissions.ts` | entreprise masquée par la RLS (suspendue, annulée, suspension échue) : périmètre `acces_parametres` + `gerer_parametres` **si et seulement si** la base l'accorde (`etat_reabonnement_entreprise.peut_gerer`), sinon `[]` comme avant ; entreprise active : inchangé |
| `src/lib/acces-support-abonnement.ts` | source unique via `etat_reabonnement_entreprise` |
| Pages | `/abonnement` (bandeaux annulé / reprise / paiement requis, offres « Réactiver »), `/abonnement-suspendu` (écrans dédiés), `/paiement/abonnement/succes` et `/annule` (variantes réabonnement) |

## 6. UX (écrans et messages)

| Situation | Écran | Action |
|---|---|---|
| **Abonnement annulé** | « Abonnement annulé » — données conservées, paiement dès la souscription, « sans nouvelle période d'essai » | « Réactiver mon abonnement » → offres « Réactiver avec cette offre » (Checkout, même client, sans essai) |
| **Résiliation programmée** | « Résiliation programmée le … » | « **Reprendre l'abonnement** » → Portail Stripe (même subscription, aucun paiement) |
| **Paiement requis** (`suspendu` avec facture impayée connue) | « Paiement requis » | « Payer la facture » (URL `https://` Stripe uniquement) + « Mettre à jour le moyen de paiement » (Portail) |
| Suspension sans facture impayée (administrative) | écran générique inchangé | jamais « Paiement requis » à tort |
| **Échec** (Stripe injoignable / refus, Checkout abandonné) | « Réabonnement non finalisé » | aucun droit rouvert ; retour aux offres |
| Retour Checkout réussi | « Réabonnement en cours de confirmation » (aucune mention d'essai) | l'accès revient avec le webhook |
| Refus Checkout | message selon le parcours imposé (reprendre / payer / déjà actif / support), client Stripe invalide → support | — |

## 7. Webhooks et ordre

| Événement | Réabonnement |
|---|---|
| `customer.subscription.created` / `updated` / `checkout.session.completed` (nouvelle) | relecture Stripe de la nouvelle **et** de l'ancienne → rattachement 508 → synchronisation ordonnée 506 (essai borné 507) |
| `customer.subscription.deleted` / `updated` (ancienne, tardif) | `remplacee` → journal sans effet, aucune écriture d'accès |
| `invoice.paid` / `invoice.payment_failed` (nouvelle, avant rattachement) | `differe` → 503 → re-livré après rattachement, puis contrat 506 |
| `invoice.paid` / `invoice.payment_failed` (ancienne) | sans effet sur l'accès, facture historisée, **aucun e-mail d'échec** |
| subscription parasite (ancienne encore vivante, autre client) | 422, jamais rattachée |

## 8. Cas Stripe (preuves)

| Cas | Checkout (Vitest, faux Stripe à états) | Base (pgTAP, vraie RPC) |
|---|---|---|
| `cancel_at_period_end` (active / trialing) | refus, parcours `reprendre_portail`, lectures seules, 0 session | C1 : accès conservé, remplacement refusé (42501), reprise → annulation effacée, **même** subscription |
| `canceled` | nouveau Checkout, même client, **aucun essai**, retours `reabonnement=1`, subscription `active` | C2 : `deleted` → `annule` ; autre client 42501 ; terminale ignorée ; `relie` ; `incomplete` → `suspendu` (aucun droit) ; `invoice.paid` → `actif` |
| `incomplete_expired` | idem `canceled` | C7 : réabonnement permis |
| `unpaid` | refus, `paiement_requis` | C3 : suspendu, non remplaçable, `invoice.paid` → actif sur la même subscription |
| `past_due` | refus, `paiement_requis` | C4 : suspendu, non remplaçable, `active` relu → actif |
| `incomplete` | refus, `paiement_requis` | C2 (nouvelle incomplete) : suspendu |
| `paused` / statut inconnu | refus, `support` | — |
| subscription deleted, événements tardifs | — | C2 / C5 / C10 : `remplacee`, sans effet ; vieille facture payée → entreprise **reste annulée** |
| customer existant sans abonnement | client réutilisé, essai = reliquat local (inchangé) | C6 : première liaison, essai non clos |
| customer existant, subscription passée non liée | **aucun essai** (essai consommé) | — |
| customer supprimé chez Stripe | `ClientStripeInvalide`, aucun client créé, 0 session | — |
| ancienne annulée mais **autre** subscription vivante (webhook en retard) | refus, 0 session | C9 : second rattachement refusé |
| `trialing` sur un réabonnement (Stripe) | — | C7 : essai **clos**, jamais rouvert, écart journalisé |
| réabonnement enchaîné (3ᵉ subscription) | — | C5 : historique de 2 remplacements, actif |

## 9. Tests

### 9.1 pgTAP

- Nouvelle suite `supabase/tests/stripe_resubscription_flow_v1.test.sql` : **99/99** — structure/ACL,
  C1-C10 ci-dessus, **120 ordres** de livraison (O), rejeu complet (R), lecture bornée
  `etat_reabonnement_entreprise` (L : constat RLS, administrateur, ouvrier, autre entreprise, membre
  désactivé, anon).
- Régression, base neuve **343** migrations : **137 fichiers, 128 propres, 3 527 ok** — baseline 342 :
  136 / 127 / 3 428. Les 136 suites existantes ont des résultats **identiques** fichier par fichier
  (dont `stripe_event_ordering_v1` 137/137, `stripe_trial_synchronization_v1` 82/82,
  `stripe_trial_checkout_exhaustive_v1` 24/24) ; mêmes 9 fichiers non propres hérités.
- **Mutations** (fonction remplacée sur une copie de base, suite rejouée) : **9/9 détectées**.

  | Mutation | Échecs |
  |---|---|
  | M1 ancienne non terminale acceptée | 5 (C1, C3, C4, C9) |
  | M2 facture sans garde de subscription | 12 (C2, C5, O) |
  | M3 filigrane non réinitialisé | 2 (C10) |
  | M4 essai non clos | 4 (C2, C7, O) |
  | M5 client non vérifié | suite interrompue (C2) |
  | M6 subscription remplacée re-rattachable | suite interrompue (C2) |
  | M7 subscription terminale rattachée | suite interrompue (C2) |
  | M8 état de reprise sans cloisonnement | 2 (L) |
  | M9 `peut_gerer` toujours vrai | 1 (L) |

### 9.2 Ordre (120 permutations)

Pour chaque ordre de `{deleted(ancienne) T100, created(nouvelle) T200, payment_failed T250,
paid T300, updated T310}`, chemin applicatif fidèle, factures différées re-livrées : 0 erreur,
**actif** dans les 120 ordres, nouvelle subscription courante, exactement 1 remplacement, aucun
essai rouvert, **aucun droit hors état compatible à aucun pas**, facture payée enregistrée ; rejeu
complet : état inchangé.

### 9.3 Concurrence réelle

`scripts/qualification/stripe-resubscription-concurrency.sh <base> [sessions]` (sessions psql
parallèles) : **20/20** sur 3 exécutions à 40 sessions puis 3 à 60 sessions (version finale) :

| | Attendu |
|---|---|
| R1 N rattachements simultanés de la même nouvelle | 1 `relie`, N-1 `deja_lie`, 1 historique |
| R2 N nouvelles subscriptions différentes | 1 gagnante (= courante), N-1 refus 42501 |
| R3 événements plus récents de l'ancienne ∥ nouvelle | 0 erreur, **actif**, 0 événement de l'ancienne appliqué |
| R4 N re-livraisons du même `invoice.paid` | 1 `applique`, N-1 `deja_traite`, 1 ligne de journal |
| R5 chemin complet nouvelle ∥ rejeux du `deleted` | actif, 1 remplacement, essai clos |

Contre-épreuve (M2 appliquée) : **3 FAIL** (R3 : `suspendu`, 20 événements de l'ancienne
appliqués). Non-régression : `stripe-ordering-concurrency.sh` **15/15**,
`stripe-trial-concurrency.sh` **7/7**.

### 9.4 Vitest

**165 fichiers, 1 997 tests, 0 échec** (baseline 162 / 1 939) :

- `stripe-reabonnement.test.ts` (23) : parcours par statut, garde Checkout, Portail, écrans
  (dont suspension administrative), messages ;
- `stripe-checkout-exclusivite.test.ts` (27, +16) : `canceled` / `incomplete_expired` → Checkout
  même client sans essai ; 7 statuts réactivables/vivants → refus lecture seule ; autre subscription
  vivante ; customer existant ; customer supprimé ; relance ; clé rejouée « complete » ;
  **2 × 500 entrelacements** de réabonnements simultanés : jamais deux subscriptions vivantes, jamais
  deux sessions payables, jamais d'essai ; 2 tests du lot Trial mis à jour (décision §3) ;
- `stripe-checkout-essai-simulation.test.ts` (+1) : subscription rattachée terminée → sans essai ;
- `webhook/reabonnement.test.ts` (13) : contrat d'appel (relecture de l'ancienne, ordre
  rattachement → synchronisation, 422, sans effet, 503 différé, `parent.subscription_details`,
  aucun e-mail pour l'ancienne, dépassements) ;
- `permissions-reprise-abonnement.test.ts` (5) : périmètre sous RLS.
- Mutations : correctif `permissionsUtilisateur` retiré → 4 échecs ; essai consommé (subscription
  non liée) retiré → 1 échec.

### 9.5 Playwright (navigateur réel)

`tests/e2e/stripe-reabonnement.spec.ts` — **6/6** sur les 2 exécutions de la version finale
(et sur 3 exécutions antérieures à l'affinage « suspension administrative » de §6) : PostgreSQL 343
migrations, passerelle Supabase locale du dépôt (`tests/e2e/colors-pile-locale/passerelle.mjs` :
RLS réelle sous le rôle du JWT), Gestion Pro `next dev`, Chromium ; compte administrateur de
recette (`acces_parametres` + `gerer_parametres`) ; l'état Stripe est projeté en base comme par le
webhook, la clé Stripe est factice.

| Test | Vérifié |
|---|---|
| abonnement annulé | métier → `/abonnement-suspendu` « Abonnement annulé » ; `/abonnement` : bandeau, offres « Réactiver avec cette offre », aucun « Démarrer l'essai » |
| résiliation programmée | « Reprendre l'abonnement », aucune offre |
| échec | clic « Reprendre » → Stripe injoignable → « Le réabonnement n'a pas abouti », statut inchangé |
| paiement requis | `/abonnement-suspendu` « Paiement requis », lien de facture exact, portail ; bandeau sur `/abonnement` |
| droits | annulé → bloqué ; nouvelle subscription `suspendu` → bloqué ; `actif` → `/dashboard` rouvert |
| retours Checkout | succès « en cours de confirmation » sans mention d'essai ; abandon « Réabonnement non finalisé » |

**Contre-épreuve** : sans le correctif `permissionsUtilisateur`, le premier test échoue
(« Fonctionnalité non disponible » sur `/abonnement`). Les pages de sortie `/parametres/donnees`
et `/aide` restent affichées pour une entreprise annulée (vérifié).

### 9.6 Autres contrôles

`tsc --noEmit` 0 erreur ; ESLint 0 erreur (15 avertissements, tous dans des fichiers préexistants) ;
`next build` Gestion Pro réussi (le script `build` échoue ensuite sur `apps/tools` faute de
`NEXT_PUBLIC_TOOLS_ENV`, garde d'environnement sans rapport) ; `verify:migrations` (343),
`verify:train-expectations`, `verify:env-manifest`, `test:env-manifest`, `test:smoke-email`,
`test:preview-pack` (27/27), `test:stripe-ordering-script`, `test:stripe-trial-script`,
`test:stripe-resubscription-script` (6/6, ajouté à la CI), `verify:secrets`,
`verify:stripe-prices` : verts.

## 10. Script Stripe Test distant (préparé, non exécuté)

`scripts/qualification/stripe-resubscription-test-mode.mjs` : sans `--execute`, plan + SQL de
contrôle, aucun réseau ; `sk_live_` / `rk_live_` refusées avant toute autre validation (sortie 2,
clé jamais affichée) ; exige `--confirm-test`, `--entreprise`, `--customer cus_…`, prix non live ;
tout objet `livemode: true` arrête le script. Scénario : subscription active → `cancel_at_period_end`
→ session Portail → reprise → annulation → aucune subscription vivante → Checkout **même client
sans essai** → expiration → SQL de contrôle (historique, journal d'ordre, statut).

## 11. Hors verdict, limites et suites

1. **Stripe Test distant non exécuté** (aucune clé test). À exécuter en Preview : le script §10,
   puis le parcours complet depuis l'application (annulation dans le Portail, réabonnement,
   webhooks 200, SQL de contrôle). En particulier, la présence du bouton de **reprise** dans le
   Portail pour une résiliation programmée est une fonctionnalité documentée par Stripe, non
   observée ici.
2. **Verrou de commercialisation** : le réabonnement passe par le même Checkout que la première
   souscription ; tant que `ABONNEMENTS_PUBLICS_OUVERTS` n'est pas `true`, il reste fermé
   (« Ouverture prochaine »), comme toute souscription. Décision produit à confirmer.
3. **Client Stripe supprimé** : refus explicite et support (aucun client créé automatiquement) ;
   un rattachement vers un nouveau client resterait une opération plateforme.
4. **`paused`** : non réactivable en libre-service (support) ; l'application n'en crée pas
   (`payment_method_collection=always`).
5. Les subscriptions éventuellement créées avant les lots Trial / Resubscription (F-2 du rapport
   Trial) sont traitées par les mêmes gardes : une subscription parasite encore vivante reste
   refusée (422), une terminée n'est jamais rattachée.
