# ELSATIA — Stripe Trial Synchronization Hardening V1

| | |
|---|---|
| Date | 2026-09-27 |
| Base | `integration/elsatia-canonical-train-v3` @ `ef7443c0` (train canonique le plus récent, 340 migrations) + lot Stripe Ordering porté (`claude/amazing-cannon-fc7l3f` @ `7253dfda`, commit de port `af709660`) |
| Branche | `claude/charming-hamilton-wptw13` |
| Déclencheur | Finding **F-1** de `ELSATIA_STRIPE_EVENT_ORDERING_HARDENING_V1.md` §13 |
| Décision produit | Stripe reprend **uniquement le temps restant** de l'essai ELSATIA. Pas de second essai. |
| Migrations | `20260927000506_stripe_event_ordering_v1.sql` (port, contenu inchangé) · `20260927000507_stripe_trial_synchronization_v1.sql` (nouvelle, additive) — **342** au total |
| Environnement | PostgreSQL 16.13 natif + pgTAP 1.3 (`scripts/local-postgres-bootstrap`), Node 22 / Vitest 4. Aucun appel Stripe, aucune Preview, aucune Production, aucun merge. |

## Verdict

**STRIPE TRIAL LOCALLY QUALIFIED**

- Checkout n'envoie plus jamais `trial_period_days = 30`. Il envoie `subscription_data[trial_end]` =
  fin **absolue** de l'essai local (`essai_fin T23:59:59Z`), ou **aucun essai** si l'essai est expiré,
  incohérent, ou si le reliquat est sous le minimum Checkout de 48 h.
- La base ne peut plus recevoir une fin d'essai au-delà de la fenêtre locale : la RPC de
  synchronisation borne le `trial_end` Stripe (il ne peut que **raccourcir** l'essai), un trigger
  interdit toute prolongation par un rôle d'API, la contrainte historique reste l'ultime borne.
- F-1 est fermé et prouvé par contre-épreuve : sans la migration 507, les deux cas (trial legacy au
  jour 15, abonnement sans essai) lèvent `23514` (→ 500 en boucle) ; avec elle, `applique`.
- Contrat d'ordre Stripe intact : pgTAP ordre 137/137, harnais de concurrence réelle 15/15
  (100 courses), aucune régression pgTAP (mêmes 9 fichiers hérités), Vitest 1928/1928.

Hors de ce verdict : l'exécution Stripe Test distante (script prêt, `sk_live` refusée avant réseau,
aucune clé test disponible — §9) et la remédiation des subscriptions éventuellement créées avant ce
lot (F-2, §11).

---

## 1. Base

Le train canonique le plus récent est `integration/elsatia-canonical-train-v3` (rapport
`ELSATIA_CANONICAL_TRAIN_V3_FINAL_CONVERGENCE.md`). Le lot Stripe Ordering qualifié
(`claude/amazing-cannon-fc7l3f`) était bâti sur le train **V2** : il a été porté par cherry-pick.

| Élément | Action |
|---|---|
| Migration d'ordre | renumérotée `20260926000401` → **`20260927000506`** : le numéro 401 avait déjà été réattribué par le train V3 (séquence monotone 501-505), contenu SQL **inchangé** |
| Références `…401` | code (route, module de synchronisation), test pgTAP, harnais de concurrence mis à jour |
| `ci.yml`, `package.json` | conflits résolus par union (étapes V3 + script Stripe ordre) |
| Runbook V3 / DB verify | versions V3 conservées, attendus **régénérés** (`npm run sync:train-expectations`) |

Baseline mesurée après port, avant tout changement d'essai (base neuve, 341 migrations) :
pgTAP **134 fichiers, 3 336 tests**, 9 fichiers en échec, tous hérités et documentés par le rapport V3
(stub `pgsodium` → `platform_stripe_state_attestation_r72` ; fixtures Studio ×7 ;
`elsatia_tools_cloud_sync_entitlement_closure_v1`). Vitest **158 fichiers, 1 869 tests, 0 échec**.

## 2. Diagnostic F-1 (rappel, reproduit)

- `entreprises_essai_dates_coherentes` : `abonnement_essai_fin ∈ [essai_debut, essai_debut + 30]`,
  non nul. `initialiser_essai_entreprise` pose `essai_debut = created_at::date`, `essai_fin = +30`.
- `synchroniser_abonnement_stripe_service` écrivait `abonnement_essai_fin = trial_end` Stripe brut.
- `creerSessionAbonnementStripe` envoyait `trial_period_days = 30`, compté par Stripe **depuis la
  complétion de la session**.

Conséquences : abonnement au jour N>0 → `trial_end = debut + 30 + N` ; abonnement sans essai →
`trial_end = null`. Les deux violent la contrainte : **tous** les `customer.subscription.*` et
`checkout.session.completed` de l'entreprise échouent (500) et sont re-livrés en boucle ; en
parallèle Stripe accorde jusqu'à 30 jours gratuits de plus que l'essai ELSATIA (second essai).

## 3. Calcul

`src/lib/stripe-essai-checkout.ts` (pur, sans I/O) :

```
fin_retenue          = min(essai_fin ?? essai_debut + 30, essai_debut + 30)      -- dates UTC
local_trial_end      = fin_retenue T23:59:59Z                                     -- seconde Unix
remaining_trial_secs = max(0, local_trial_end - now)
```

- `local_trial_end` est aligné sur l'accès applicatif (`essaiEnCours` : ouvert jusqu'à
  `essai_fin T23:59:59.999Z`) et sur l'accès SQL (`current_date <= essai_fin`).
- Sa date UTC (`dateDepuisUnix`, utilisée par le webhook) retombe **exactement** sur `essai_fin` :
  la valeur revient en base sans écart ni violation.
- Tout est calculé en UTC ; ni `TZ` du serveur, ni l'heure d'été n'interviennent.
- Dates absentes, non ISO, impossibles (`2026-02-30`) ou fin < début → **aucun essai** (fail-closed :
  dans le doute, pas de second essai). Une fin au-delà de début + 30 est bornée.

## 4. Checkout

| Reliquat | Paramètres envoyés | Effet Stripe |
|---|---|---|
| ≥ 48 h | `subscription_data[trial_end] = local_trial_end` | essai jusqu'à la fin locale exacte |
| 0 < reliquat < 48 h | aucun paramètre d'essai | facturation immédiate |
| 0 (expiré) | aucun paramètre d'essai | facturation immédiate |
| dates incohérentes | aucun paramètre d'essai | facturation immédiate |

- **Minimum 48 h** : Stripe Checkout refuse un `trial_end` à moins de 48 h de la création de la
  session. Exprimer un reliquat plus court imposerait de dépasser la fenêtre locale (interdit) ; un
  `trial_period_days=1` partirait de la complétion (jusqu'à 24 h plus tard) et pourrait aussi la
  dépasser. Décision retenue : pas d'essai Stripe dans les dernières 48 h. Le client garde son accès
  local jusqu'au bout, et sa période payée commence à la souscription. Ce seuil est sondé côté Stripe
  par le script distant (§9, sonde 47 h).
- **Fin absolue** : une session complétée tard (jusqu'à son expiration, 24 h) ne décale plus l'essai.
- **Idempotence** : la clé inclut l'essai (`…-essai-<trial_end>` / `…-sans-essai`). Un Checkout
  relancé pendant l'essai retrouve la même session ; relancé après le seuil de 48 h, il obtient une
  nouvelle clé (Stripe refuse une clé rejouée avec d'autres paramètres).
- **Entreprise déjà abonnée** : `preparerCheckoutAbonnement` refuse le Checkout
  (`AbonnementStripeDejaRattache`) **avant tout appel Stripe** si `stripe_subscription_id` est déjà
  posé. Avant ce lot, un second Checkout créait et facturait une seconde subscription que le webhook
  refuse de rattacher (`rattachement_stripe_incoherent`, 422). Message : gérer l'abonnement depuis le
  portail.
- Fichiers : `src/lib/stripe-abonnement.ts` (`preparerCheckoutAbonnement`, `essai` obligatoire dans
  `creerSessionAbonnementStripe`), `src/app/actions/abonnement.ts`.

## 5. Contrainte base (migration `20260927000507`)

1. **`synchroniser_abonnement_stripe_service`** (même signature, même ACL, reprise à l'identique sauf
   l'écriture de l'essai, et verrou `for update` de la ligne) écrit
   `essai_fin_bornee_stripe(essai_debut, essai_fin_actuelle, trial_end)` :

   | `trial_end` Stripe | Fin d'essai écrite | Écart journalisé |
   |---|---|---|
   | `null` (sans essai) | inchangée | — |
   | `< essai_debut` | inchangée | `avant_debut_essai` |
   | `> min(fin actuelle, début + 30)` | bornée à cette valeur | `depasse_fenetre_locale` |
   | dans `[début, fin actuelle]` | `trial_end` (raccourcissement) | — |

   La fin d'essai est donc **monotone décroissante** : commutative, elle converge quel que soit
   l'ordre d'arrivée, sans toucher au filigrane d'accès du contrat d'ordre.
2. **`stripe_essai_ecarts`** : journal dédoublonné (`occurrences`), RLS, lecture plateforme
   `gerer_facturation`, aucune écriture directe (`service_role` compris).
3. **Trigger `borner_essai_entreprise`** : pour `anon` / `authenticated` / `service_role`,
   `abonnement_essai_debut` est immuable et `abonnement_essai_fin` ne peut ni augmenter ni être vidée
   (`23514`), sauf administrateur plateforme `gerer_facturation` (dans la fenêtre de la contrainte).
   Les migrations et l'exploitation hors API (rôle `postgres`) restent soumises à la contrainte.
4. **Preview DB verify** : contrôle **18** (journal d'ordre, écarts, trigger, aucun essai hors
   fenêtre), bloquant. Validé : `contrôlé` sur la base 342, `écarts essai ABSENTS, trigger ABSENT`
   sur la base de contre-épreuve.

Migration rejouée deux fois de suite sur la même base : aucune erreur (idempotente).

## 6. Webhooks

| Événement | Traitement | Essai |
|---|---|---|
| `customer.subscription.created` / `updated` / `deleted`, `checkout.session.completed` | relecture Stripe + RPC ordonnée (inchangé) | borné en base, plus d'erreur |
| `customer.subscription.trial_will_end` | **nouvelle branche explicite** : journal `sans_effet`, motif `essai_fin_annoncee` ; ni relecture ni verrou | inchangé |
| `invoice.paid` (y compris 0 € d'essai) | RPC facture ordonnée (inchangé) | inchangé |
| `invoice.payment_failed` | RPC facture ordonnée, suspension immédiate conservée | inchangé |

## 7. Edge cases (preuves)

Fenêtre de référence : début 2026-10-01, fin 2026-10-31 (ouverte jusqu'au 31/10 23:59:59Z).

| Cas | Checkout (Vitest) | Base (pgTAP) |
|---|---|---|
| jour 0 | `trial_end` = 31/10 23:59:59Z | appliqué, fin 31/10, aucun écart |
| jour 1 | idem | — |
| jour 15 | idem | appliqué, fin 31/10 |
| jour 15, subscription legacy (30 j) | — | **plus d'erreur**, fin bornée au 31/10, écart ×1 puis ×2, rejeu `deja_traite` |
| jour 28 (reliquat 2 j 15 h) | `trial_end` accordé | — |
| jour 29 (1 j 15 h) | aucun essai (`restant_inferieur_minimum_stripe`) | `trial_end` null → essai conservé, jamais NULL |
| jour 30 / dernière seconde | aucun essai | idem |
| seuil 48 h exact / −1 s | accordé / refusé | — |
| essai expiré | aucun essai (`essai_expire`) | sans essai accepté ; un trial Stripe tardif **n'ouvre aucun second essai** (écart journalisé) |
| date incohérente (fin < début, date impossible, texte, début absent) | aucun essai | `trial_end < début` → ignoré + écart |
| raccourci Stripe (fin d'essai anticipée) | — | appliqué, puis jamais ré-allongé |
| fuseau (UTC, Paris, Los Angeles, Kiritimati +14, Pago Pago −11, Lord Howe) | résultat identique | borne identique sous `set timezone` |
| DST automne (Paris 25/10) et printemps (29/03) | fin UTC exacte, ni heure gagnée ni perdue | fenêtre 30 jours exacte, J+31 borné |
| minuit Paris ≠ minuit UTC | 00:30 Paris le 01/11 = 23:30Z le 31/10 → 29 min 59 s restantes, pas d'essai Stripe | — |
| invariant horaire J-2 → J+33 (841 instants) | `trial_end ≤ fin locale`, ≥ 48 h, date acceptée par la contrainte, cohérent avec `essaiEnCours` | — |

## 8. Stripe existant

| Situation | Preuve | Résultat |
|---|---|---|
| client Stripe existant, pas de subscription | Vitest simulation + pgTAP | client réutilisé (aucun `customers` créé), première liaison appliquée |
| subscription existante | Vitest simulation + pgTAP | Checkout refusé **avant tout appel Stripe** ; en base une seconde subscription reste refusée (`42501`), essai et statut intacts |
| Checkout échoué puis relancé le même jour | Vitest simulation | même clé → même session, un seul client |
| Checkout relancé après passage sous 48 h | Vitest simulation | nouvelle clé, sans essai, pas d'erreur d'idempotence Stripe |
| ancienne session avec essai complétée tard | Vitest simulation | `trial_end` absolu → toujours dans la fenêtre |

## 9. Script Stripe Test distant (préparé, non exécuté)

`scripts/qualification/stripe-trial-test-mode.mjs` (+ `npm run test:stripe-trial-script`, ajouté à la CI) :

- sans `--execute` : plan + SQL de lecture/contrôle, **aucun appel réseau** ;
- `sk_live_` / `rk_live_` refusées **avant toute autre validation et avant réseau** (sortie 2, clé
  jamais affichée) ; exige aussi `--confirm-test`, `--entreprise`, `--customer cus_…`,
  `--essai-debut/--essai-fin` valides, prix non live ; tout objet `livemode: true` arrête le script ;
- scénario : matrice Checkout jours 0/1/15/28/29/30/expiré (sessions expirées aussitôt), **sonde
  négative 47 h** (Stripe doit refuser), Checkout réel de l'entreprise (URL à compléter avec 4242),
  puis `--subscription sub_…` : `date_utc(trial_end) ≤ essai_fin` locale, SQL de contrôle
  (`stripe_essai_ecarts` vide, webhooks 200) ;
- son calcul est un miroir sans dépendance de la bibliothèque applicative ; la **parité** est
  vérifiée par `src/lib/stripe-essai-checkout-parite.test.ts` (6 fenêtres × ~124 instants).

Node test : 8/8. Aucune clé test n'étant disponible, l'exécution distante reste à faire.

## 10. Tests

### 10.1 pgTAP (base neuve, 342 migrations rejouées sans erreur)

| | Baseline (V3 + ordre) | Après |
|---|---|---|
| Fichiers | 134 | 135 |
| Tests | 3 336 | 3 418 |
| Fichiers en échec | 9 (hérités) | **9, les mêmes** |

- Nouvelle suite `stripe_trial_synchronization_v1.test.sql` : **82/82** (structure/ACL/RLS, borne
  pure, jours, F-1 legacy, sans essai, expiré/second essai, raccourci monotone, date incohérente,
  ordre direct/inversé, fuseaux/DST/UTC, client et subscription existants, `trial_will_end`,
  `invoice.paid`, `invoice.payment_failed`, garde trigger `service_role` / tenant / plateforme,
  contrainte).
- `stripe_event_ordering_v1` : 137/137. Suites Stripe/abonnement : inchangées et vertes.

### 10.2 Contre-épreuve (base 341, sans la migration 507)

```
jour 15 legacy (trial_end 2026-11-15) : ERROR 23514 entreprises_essai_dates_coherentes
sans essai (trial_end NULL)            : ERROR 23514 entreprises_essai_dates_coherentes
avec 507                               : applique / applique
```

### 10.3 Concurrence réelle (ordre)

`scripts/qualification/stripe-ordering-concurrency.sh` sur la base 342, 100 itérations :
**15/15** (C1-C6, 100 courses parallèles, 100 livraisons concurrentes → 1 décision).

### 10.4 Vitest

**161 fichiers, 1 928 tests, 0 échec** (baseline 158 / 1 869). Nouveautés :

- `stripe-essai-checkout.test.ts` : calcul, jours, seuil 48 h, incohérences, fuseaux, DST,
  invariant horaire, idempotence ;
- `stripe-checkout-essai-simulation.test.ts` : faux Stripe fidèle (règle 48 h, `trial_period_days`
  depuis la complétion, idempotence stricte) → subscription → prédicat de contrainte ; contre-épreuve
  de l'ancien Checkout ; client/subscription existants ; checkout échoué/relancé ;
- `stripe-essai-checkout-parite.test.ts` : application ↔ script distant ;
- route abonnement : `trial_will_end` sans effet, `trial_end` hors fenêtre et `null` transmis tels
  quels (la borne est en base).

### 10.5 Autres contrôles

`tsc --noEmit` ✅ · ESLint (fichiers modifiés) ✅ · `verify:migrations` 342 ✅ ·
`verify:train-expectations` ✅ (342, `20260927000507`, 18 contrôles) · `verify:secrets` ✅ ·
`verify:env-manifest` ✅ · `test:preview-pack` 27/27 ✅ · `test:stripe-ordering-script` 5/5 ✅.

## 11. Findings et points ouverts

**F-2 — Subscriptions créées avant ce lot (faible en pré-ouverture).** Une subscription Stripe déjà
créée avec `trial_period_days = 30` après le jour 0 garde, **chez Stripe**, un essai au-delà de la
fenêtre locale. La base est désormais protégée (borne + écart journalisé), mais Stripe ne facturera
qu'à sa propre fin d'essai. Les abonnements publics n'étant pas encore ouverts
(`abonnementsPublicsOuverts`), le nombre attendu est nul. Remédiation, si
`stripe_essai_ecarts` contient des lignes `depasse_fenetre_locale` : aligner la subscription
(`POST /v1/subscriptions/{id}` avec `trial_end = essai_fin T23:59:59Z`,
`proration_behavior = none`) après validation opérationnelle. Non automatisé : une écriture Stripe
depuis le webhook modifierait la date de facturation d'un client sans revue.

**Autres points :**

1. **Ré-abonnement après annulation** : l'entreprise garde `stripe_subscription_id` après
   `customer.subscription.deleted` ; un nouveau Checkout est désormais refusé proprement (au lieu de
   créer une subscription non rattachable et facturée). Le parcours de ré-abonnement reste à définir
   (préexistant, hors périmètre).
2. **Dernières 48 h de l'essai** : pas d'essai Stripe (limite Checkout). Si le produit souhaite
   différer le premier prélèvement à la fin locale exacte, il faudrait un autre mécanisme
   (subscription API + `billing_cycle_anchor`), hors Checkout.
3. **Pack Preview / runbook** : attendus régénérés sur 342 migrations, dernière `20260927000507`,
   18 contrôles DB verify.
4. **Script d'ordre** (`stripe-ordering-test-mode.mjs`) : il crée encore sa subscription de test avec
   `trial_period_days = 30` ; sur une entreprise créée un autre jour, l'essai est désormais borné et
   journalisé au lieu d'échouer (commentaire mis à jour).

## 12. Fichiers

| Fichier | Nature |
|---|---|
| `supabase/migrations/20260927000506_stripe_event_ordering_v1.sql` | port (renommage) |
| `supabase/migrations/20260927000507_stripe_trial_synchronization_v1.sql` | nouveau |
| `supabase/tests/stripe_trial_synchronization_v1.test.sql` | nouveau (82) |
| `src/lib/stripe-essai-checkout.ts` | nouveau (calcul pur) |
| `src/lib/stripe-abonnement.ts` | Checkout : `trial_end` absolu, clé d'idempotence, refus si subscription |
| `src/app/actions/abonnement.ts` | préparation de l'essai, message « déjà abonné » |
| `src/app/api/stripe/abonnement/webhook/route.ts` | branche `trial_will_end` |
| `scripts/qualification/stripe-trial-test-mode.mjs` (+ `.test.mjs`) | script Stripe Test distant |
| `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` | contrôle 18 |
| tests Vitest (4 fichiers), `package.json`, `.github/workflows/ci.yml`, attendus du train | — |
