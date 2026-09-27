# ELSATIA — Stripe Trial Synchronization Hardening V1

| | |
|---|---|
| Date | 2026-09-27 |
| Base | `integration/elsatia-canonical-train-v3` @ `ef7443c0` (train canonique le plus récent, 340 migrations) + lot Stripe Ordering porté (`claude/amazing-cannon-fc7l3f` @ `7253dfda`, commit de port `af709660`) |
| Branche | `claude/zen-goldberg-abwptn` — reprend `claude/charming-hamilton-wptw13` @ `395b7021` (première passe du lot) + seconde passe : re-vérification indépendante et compléments §7 bis, §8 bis, §10.6-§10.9 |
| Déclencheur | Finding **F-1** de `ELSATIA_STRIPE_EVENT_ORDERING_HARDENING_V1.md` §13 |
| Décision produit | Stripe reprend **uniquement le temps restant** de l'essai ELSATIA. Pas de second essai. |
| Migrations | `20260927000506_stripe_event_ordering_v1.sql` (port, contenu inchangé) · `20260927000507_stripe_trial_synchronization_v1.sql` (nouvelle, additive) — **342** au total |
| Environnement | PostgreSQL 16.13 natif + pgTAP (`scripts/local-postgres-bootstrap`), Node 22 / Vitest 4. Aucun appel Stripe, aucune Preview, aucune Production, aucun merge. Seconde passe : conteneur neuf, tout réexécuté de zéro. |

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
  (100 courses), aucune régression pgTAP (mêmes 9 fichiers hérités).
- **Seconde passe** : deux Checkout simultanés ne peuvent plus produire deux subscriptions
  facturées (refus si une subscription vit chez Stripe, balayage des autres sessions ouvertes,
  session morte remplacée — 1 000 entrelacements, mutations détectées, §7 bis) ; preuve exhaustive
  par la vraie RPC (1 140 combinaisons, 0 erreur, 0 prolongation ; 540 erreurs sans 507, §10.6) ;
  upgrade V3 → 342 avec données : 0 écart, schéma identique au fresh (§10.7) ; concurrence réelle
  de l'essai 7/7 (§10.8). pgTAP 136 fichiers / 127 propres (mêmes 9 hérités), Vitest **1 939/1 939**.

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
| `invoice.payment_action_required` | RPC facture ordonnée : `sans_effet`, **aucune suspension** (3-D Secure n'est pas un échec) ; rejeu `deja_traite` (pgTAP §10.6) | inchangé |

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

## 7 bis. Re-Checkout et concurrence Checkout (seconde passe)

**Écart trouvé par la seconde passe.** La première passe refusait le Checkout si la base
connaissait déjà une subscription, mais :

1. deux Checkout lancés en parallèle (deux onglets, deux offres/périodicités, ou de part et d'autre
   du seuil 48 h → clés d'idempotence distinctes) créaient **deux sessions payables** ; les deux
   complétées = deux subscriptions **facturées par Stripe**, la seconde refusée en base (42501 → 422
   en boucle) ;
2. entre la complétion d'une session et l'arrivée de son webhook, la base ne savait pas encore
   qu'une subscription existait : un nouveau Checkout était accepté ;
3. une clé d'idempotence rejouée renvoie la réponse **d'origine** (« open ») même quand la session
   a expiré depuis : l'utilisateur pouvait être renvoyé en boucle vers une page Checkout morte.

**Correction** (`src/lib/stripe-abonnement.ts`, `ouvrirCheckoutAbonnement`, appelée par
`demarrerAbonnementAction`) :

| Étape | Rôle |
|---|---|
| `preparerCheckoutAbonnement` | essai = reliquat local ; refus si subscription connue en base (avant tout appel Stripe) |
| `verifierAucuneSubscriptionStripeVivante` | `GET subscriptions?customer&status=all` : refus si `trialing/active/past_due/unpaid/incomplete/paused` (webhook pas encore arrivé) |
| création de la session | `trial_end` absolu ou aucun essai (inchangé) |
| relecture `GET checkout/sessions/:id` | session rejouée non ouverte → nouvelle clé (`-r<horodatage>`), jamais une URL morte |
| `garantirSessionCheckoutUnique` | **après** création : expire toute AUTRE session d'abonnement ouverte de l'entreprise, puis relit les subscriptions ; si l'une vit, expire la session créée et refuse |

Argument : chaque requête balaie après sa propre création ; la seconde à balayer voit donc la
session de la première et l'expire → au plus une session payable. Une session complétée avant le
balayage ne peut plus être expirée (refus Stripe, ignoré), mais sa subscription existe déjà : la
relecture qui suit la détecte et la session qu'on vient de créer est expirée. Pire cas : les deux
requêtes s'expirent mutuellement → l'utilisateur relance (sûr, aucune facturation).

Preuves (`src/lib/stripe-checkout-exclusivite.test.ts`, faux Stripe à états — expiration 24 h,
idempotence qui rejoue la réponse d'origine, `expire` refusé hors `open` —, 11 tests) :

| Cas | Résultat |
|---|---|
| Checkout abandonné (retour `cancel_url`) puis relancé | même session ouverte, même `trial_end` |
| Checkout expiré (24 h), clé encore rejouée | nouvelle session ouverte ; essai = reliquat, jamais 30 j |
| retour à une offre dont la session a été balayée | nouvelle session, jamais l'URL morte ; une seule ouverte |
| changement d'offre en cours de Checkout | l'ancienne session est expirée, non payable |
| subscription vivante chez Stripe, webhook pas encore reçu | refus, aucune session créée |
| subscription précédente annulée (liée en base) | refus avant tout appel Stripe — jamais de nouvel essai |
| subscription annulée chez Stripe mais non liée en base | Checkout autorisé, essai = reliquat local uniquement |
| essai expiré puis re-Checkout | aucune session ne porte d'essai |
| **2 Checkout simultanés, offres différentes, 500 entrelacements** (graines déterministes, paiement dès réception de l'URL) | **0** cas à 2 subscriptions vivantes, **0** cas à 2 sessions payables |
| **2 Checkout simultanés, même offre (même clé), 500 entrelacements** | idem |
| contre-épreuve sans balayage | 2 subscriptions facturées |

Mutations : balayage retiré → 3 tests échouent ; relecture finale des subscriptions retirée → les
2 fuzz échouent.

Côté base, une seconde subscription reste de toute façon **jamais rattachée** et l'essai jamais
rallongé (pgTAP §10.6, concurrence réelle §10.8).

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

### 10.5 bis Seconde passe — réexécution intégrale

Conteneur neuf, PostgreSQL 16.13 + pgTAP installés, `npm ci`, base neuve `rebuild_db.sh` :
**342/342 migrations, 0 erreur**.

| Contrôle | Résultat |
|---|---|
| pgTAP complet (`pgtap-run-v3.sh`, une base neuve par fichier) | **136 fichiers, 127 propres** ; 9 non propres = **exactement** les 9 hérités (Studio ×7, `platform_stripe_state_attestation_r72` / stub pgsodium, `elsatia_tools_cloud_sync_entitlement_closure_v1`) |
| `stripe_trial_synchronization_v1` / `stripe_trial_checkout_exhaustive_v1` / `stripe_event_ordering_v1` / `stripe_subscription_webhook_acl_v1` | 82 / 24 / 137 / 51 — tous verts |
| Vitest | **162 fichiers, 1 939 tests, 0 échec** (+ 11 : exclusivité Checkout) |
| `stripe-ordering-concurrency.sh` (100 itérations) | **15/15** |
| `test:stripe-trial-script` | **10/10** (+ 2 : exécution simulée complète, variante non conforme) |
| `tsc --noEmit`, ESLint (fichiers modifiés), `verify:migrations`, `verify:train-expectations`, `verify:secrets`, `verify:env-manifest`, `test:preview-pack`, `test:stripe-ordering-script` | ✅ |

### 10.6 Preuve exhaustive « aucun trial_end incompatible » (`stripe_trial_checkout_exhaustive_v1`, 24 tests)

La **vraie** RPC `synchroniser_abonnement_stripe_ordonne_service` est alimentée par
12 débuts d'essai (fins de mois, 29/02/2028, veilles et lendemains de changement d'heure, fin
d'année) × 5 fins locales (début, +1, +15, +29, +30) × 19 `trial_end` Stripe (null, −40 … +365 jours),
dans un ordre mélangé : **1 140 synchronisations**.

| Propriété | Avec 507 | Sans 507 (base 341, contre-épreuve) |
|---|---|---|
| erreurs (→ 500 webhook) | **0** | **540** |
| fin hors `[début, début + 30]` ou nulle | **0** | 540 |
| fin prolongée par rapport à l'état précédent | **0** | 298 |
| fin au-delà de la fin locale initiale | **0** | 264 |
| raccourcissement dans la fenêtre appliqué tel quel | ✅ | — |
| `trial_end` null → essai local conservé | ✅ | — |

Et le flux Checkout → webhook : pour chacun des 1 096 jours de 2026-2028, la date UTC de
`fin locale T23:59:59Z` (valeur envoyée par Checkout) est exactement la fin locale, sous
`timezone = Pacific/Kiritimati` (+14).

Même suite : `invoice.payment_action_required` pendant l'essai → `sans_effet`, **aucune
suspension**, essai inchangé, rejeu `deja_traite`, puis `invoice.paid` appliqué ;
subscription annulée (`customer.subscription.deleted`, essai raccourci au 12/10) puis nouvelle
subscription → **42501, jamais rattachée**, aucun nouvel essai ; `service_role` ne peut ni rouvrir
ni redémarrer l'essai (23514).

### 10.7 Upgrade V3 → 342 avec données (`scripts/qualification/stripe-trial-upgrade.sh`)

Base à l'état V3 (340 migrations, jusqu'à `20260926000505`) + seed pilote GP + 10 entreprises en
essai aux jours 0, 1, 10, 15, 29, 30, expiré, converti (actif + subscription), abonnée en essai,
annulée → instantané (`upgrade_snapshot.py`) → 506 + 507 (+ 507 rejouée) → instantané.

| Contrôle | Résultat |
|---|---|
| application 506, 507, rejeu 507 | ✅ 0 erreur |
| row counts (247 tables) | ✅ 0 écart ; 3 tables nouvelles (`stripe_evenements_ordre`, `stripe_objets_ordre`, `stripe_essai_ecarts`) |
| checksums métier (54 tables) | ✅ 54/54 identiques |
| sonde RLS réelle (28 utilisateurs) | ✅ 0 écart |
| essais (statut, début, fin, subscription) de toutes les entreprises | ✅ inchangés par l'upgrade |
| essais hors fenêtre après upgrade | ✅ 0 |
| schéma `pg_dump -s` (ACL comprises) upgrade vs fresh | ✅ identique (jeton `\restrict` aléatoire exclu) |
| jour 15 + webhook legacy 30 j sur la base upgradée | ✅ `applique`, fenêtre bornée à 30 j |
| abonnée existante, `trial_end` null | ✅ `applique`, essai local conservé |
| pgTAP Stripe (4 suites) sur la base upgradée | ✅ 294/294 |

### 10.8 Concurrence réelle de l'essai (`scripts/qualification/stripe-trial-concurrency.sh`)

60 sessions PostgreSQL parallèles, même entreprise :

| Test | Avec 507 | Sans 507 |
|---|---|---|
| T1 — même subscription, `trial_end` variés (null, avant début, dans la fenêtre, au-delà), horodatages mélangés : aucune erreur | ✅ 0 | ❌ 40 |
| T1 — fenêtre finale dans la contrainte, jamais prolongée | ✅ | ✅ |
| T1 — chaque livraison journalisée une fois (60) | ✅ | ❌ 20 |
| T2 — deux subscriptions concurrentes : une seule rattachée, l'autre refusée (42501) à chaque livraison, aucune autre erreur, fenêtre bornée | ✅ 4/4 | ❌ 12 autres erreurs |

### 10.9 Script Stripe Test (seconde passe)

`stripe-trial-test-mode.mjs` gagne l'étape 2b (exclusivité) : clé rejouée après expiration (réponse
rejouée vs état relu), `expire` sur session expirée, deux sessions créées **simultanément** puis
balayées → une seule ouverte, lecture `subscriptions?status=all`. `executer` accepte un `fetch`
injecté : le scénario complet est exécuté hors réseau contre un faux Stripe (conforme → sortie 0 ;
subscription dont le trial dépasse la fin locale → sortie 1). `sk_live` / `rk_live` restent refusées
avant tout appel réseau. **Aucune clé test disponible : aucun appel Stripe réel.**

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
   (préexistant, hors périmètre). Quel qu'il soit, il ne pourra pas rouvrir d'essai : la base refuse
   toute prolongation (trigger + borne RPC, §10.6) et Checkout n'envoie que le reliquat.
5. **Exclusivité Checkout — limites** : la garantie repose sur la cohérence lecture-après-écriture
   des listes Stripe (`checkout/sessions?status=open`, `subscriptions`), à confirmer par l'étape 2b
   du script distant. Deux requêtes strictement simultanées sur la **même** clé d'idempotence
   peuvent recevoir un 409 Stripe (« requête en cours ») : message « Réessayez », sans effet de bord.
   Coût : 3 à 4 appels Stripe de plus par clic « S'abonner ».
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
| `src/app/actions/abonnement.ts` | `ouvrirCheckoutAbonnement`, message « déjà abonné » |
| `src/lib/stripe-abonnement.ts` (seconde passe) | `ouvrirCheckoutAbonnement`, `verifierAucuneSubscriptionStripeVivante`, `garantirSessionCheckoutUnique`, relecture de session, clé de renouvellement |
| `src/lib/stripe-checkout-exclusivite.test.ts` | nouveau (11) : re-Checkout, concurrence, contre-épreuve |
| `supabase/tests/stripe_trial_checkout_exhaustive_v1.test.sql` | nouveau (24) : preuve exhaustive, `payment_action_required`, annulée puis re-Checkout |
| `scripts/qualification/stripe-trial-upgrade.sh` | nouveau : upgrade V3 → 342 avec données |
| `scripts/qualification/stripe-trial-concurrency.sh` | nouveau : concurrence réelle de l'essai |
| `src/app/api/stripe/abonnement/webhook/route.ts` | branche `trial_will_end` |
| `scripts/qualification/stripe-trial-test-mode.mjs` (+ `.test.mjs`) | script Stripe Test distant |
| `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` | contrôle 18 |
| tests Vitest (4 fichiers), `package.json`, `.github/workflows/ci.yml`, attendus du train | — |

## 13. Reproduire (seconde passe)

```bash
npm ci
pg_ctlcluster 16 main start ; apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl
scripts/local-postgres-bootstrap/rebuild_db.sh trial_fresh                       # 342/342
scripts/qualification/pgtap-run-v3.sh trial_fresh                                 # 136 fichiers, 127 propres (9 hérités)
scripts/qualification/stripe-ordering-concurrency.sh trial_fresh 100              # 15/15
scripts/qualification/stripe-trial-concurrency.sh trial_fresh 60                  # 7/7
scripts/qualification/stripe-trial-upgrade.sh                                     # UPGRADE STRIPE TRIAL : OK
npx vitest run && npm run test:stripe-trial-script                                # 1939/1939, 10/10
# Contre-épreuves : base sans 20260927000507 (déplacer le fichier, rebuild_db.sh trial_no507), puis
#   pg_prove -d trial_no507 supabase/tests/stripe_trial_checkout_exhaustive_v1.test.sql  → 540 erreurs
#   scripts/qualification/stripe-trial-concurrency.sh trial_no507 60                   → 3 FAIL
# Stripe Test distant (clé test requise, sk_live refusée avant réseau) :
STRIPE_SECRET_KEY=sk_test_… STRIPE_PRICE_PRO_MENSUEL=price_… node scripts/qualification/stripe-trial-test-mode.mjs \
  --execute --confirm-test --entreprise <uuid> --customer cus_… --essai-debut AAAA-MM-JJ --essai-fin AAAA-MM-JJ
```
