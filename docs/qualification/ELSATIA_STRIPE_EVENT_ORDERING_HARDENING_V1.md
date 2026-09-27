# ELSATIA — Stripe Event Ordering & Replay Hardening V1

| | |
|---|---|
| Date | 2026-09-27 |
| Base | `integration/elsatia-canonical-train-v2` @ `819ebe56` (train canonique le plus récent, 335 migrations) |
| Branche | `claude/amazing-cannon-fc7l3f` |
| Déclencheur | `ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md` §5.5 / §5.6 (branche `claude/trusting-edison-scjrd5`) : « un ancien `invoice.payment_failed` rejoué après `invoice.paid` re-suspend l'entreprise » |
| Migration | `supabase/migrations/20260926000401_stripe_event_ordering_v1.sql` (additive, 336ᵉ) |
| Environnement | PostgreSQL 16.13 natif + pgTAP (apt), `scripts/local-postgres-bootstrap`, Node/Vitest. Aucun appel Stripe, aucun déploiement. |

## Verdict

**STRIPE ORDERING LOCALLY QUALIFIED**

- Le bug du pack Preview est reproduit sur le train V2 (contre-épreuve §12.4), puis fermé : un
  `invoice.payment_failed` plus ancien que le dernier événement appliqué est journalisé `perime` et
  ne modifie ni le statut, ni la trace de facture, ni l'e-mail client.
- Ordre inversé, rejeu, doublons (1 / 10 / 100), livraisons concurrentes (vraies sessions Postgres,
  100 courses) et retard important convergent vers l'état de la chronologie Stripe (`event.created`).
- Décision produit conservée : **suspension immédiate** sur `invoice.payment_failed` applicable, sans
  période de grâce. 3-D Secure en attente ≠ échec définitif (aucune régression).
- pgTAP : 0 régression (mêmes 11 fichiers / 23 assertions hérités qu'avant, §12.1). Vitest 1868/1868.

Restent hors de ce verdict : l'exécution Stripe Test distante (script prêt, aucune clé test
disponible — §11) et un défaut **préexistant** découvert en chemin, sans rapport avec l'ordre mais
bloquant pour un vrai parcours Checkout (finding **F-1**, §13).

---

## 1. Base

`integration/elsatia-canonical-train-v2` est le train canonique le plus récent (rapport
`ELSATIA_CANONICAL_TRAIN_V2_FINAL_CONVERGENCE.md`). Le pack Preview (`claude/trusting-edison-scjrd5`)
ne contient que de la documentation et des scripts par-dessus ce train ; il n'est pas fusionné ici.
La branche de travail a été repositionnée sur `819ebe56`, sans commit propre au préalable.

Baseline mesurée avant tout changement (base neuve, 335 migrations) : pgTAP **2 832 tests,
126 fichiers, 23 assertions en échec dans 11 fichiers**, soit exactement l'état documenté par le
rapport V2 (stub `pgsodium`, fixtures Studio, conflit RGPD ↔ facture émise, privilèges par défaut).

## 2. Inventaire des événements Stripe traités

| Webhook | Événements | Effet métier | Ordre avant V1 | Après V1 |
|---|---|---|---|---|
| `/api/stripe/abonnement/webhook` (GP) | `checkout.session.completed` (mode subscription) | relecture abonnement → statut, offre, contrat | relecture sous verrou remise, **aucun filigrane** | RPC ordonnée, filigrane d'accès |
| | `customer.subscription.created/updated/deleted` | idem | idem | idem |
| | `invoice.created` (hors `subscription_create`) | lignes de dépassement (appareils, stockage) | idempotence Stripe (clé) | inchangé + journal `sans_effet` |
| | `invoice.paid` | `actif`, régularise l'impayé, facture payée | **aucune garde**, UPDATE direct | RPC atomique ordonnée |
| | `invoice.payment_failed` | `suspendu` immédiat + e-mail | **aucune garde**, UPDATE direct | RPC atomique ordonnée ; e-mail seulement si appliqué |
| | `invoice.payment_action_required` | trace facture seulement (3DS) | UPDATE direct | RPC, jamais de changement d'accès |
| | autres types reçus | aucun | réservés/finalisés | + journal `sans_effet` (`type_non_traite`) |
| `/api/stripe/webhook` (Connect, factures clients) | `checkout.session.completed`, `checkout.session.async_payment_succeeded` | encaissement idempotent par session | verrou `for update` facture (déjà) | inchangé ; échec → réservation libérée |
| | `checkout.session.expired` | `stripe_payment_status = expired` | **pouvait écraser `paid`** | ne touche plus une facture `paid` |
| | `account.updated` | `stripe_onboarding_complete` (instantané du payload) | **aucune garde**, erreur non vérifiée | RPC ordonnée (verrou consultatif), erreur → 500 rejouable |
| `/api/stripe/boutique/webhook` | `checkout.session.completed`, `…async_payment_succeeded` | `boutique_finaliser_commande_payee` (verrouillée, …330) | idempotent | inchangé ; échec → réservation libérée |
| | `checkout.session.expired` | expire si `en_attente_paiement` | gardé par statut | inchangé ; échec → réservation libérée |
| `/api/tools/monetization/stripe/webhook` (Tools, Test seulement) | `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded` | droits Tools Pro | **`customer.subscription.*` appliquait le payload tel quel** (instantané possiblement ancien) | relecture Stripe systématique + RPC ordonnée |

`payment_intent.*` : **aucun** webhook du dépôt ne traite ces événements (vérifié par recherche
dans `src/`). Le 3-D Secure est donc vu uniquement via `invoice.payment_action_required`.

## 3. Contrat d'ordre

Horloge unique : **`event.created` Stripe**, jamais l'ordre d'arrivée HTTP ni `now()`. Un événement
sans `created` est refusé (400, avant toute écriture) : on n'ordonne pas à l'aveugle.

Deux tables (RLS activée, lecture administrateur plateforme uniquement, aucun accès direct pour
`anon` / `authenticated` / `service_role`, écriture uniquement par RPC `SECURITY DEFINER`) :

**`stripe_evenements_ordre`**, une ligne par événement décidé (unique `(flux, stripe_event_id)`) :

| Colonne | Contenu |
|---|---|
| `stripe_event_id` | identifiant Stripe |
| `stripe_event_created` | `event.created` |
| `objet_type` / `objet_id` | objet Stripe (`invoice`/`in_…`, `subscription`/`sub_…`, `checkout.session`/`cs_…`, `account`/`acct_…`) |
| `stripe_event_type` | type d'événement |
| `processed_at` | horodatage de traitement |
| `decision` | `applique` / `perime` / `sans_effet` |
| `transition` | transition métier (`actif -> suspendu`, `actif (inchangé)`, `aucune`) |
| `etat_avant` / `etat_apres` / `motif` | ex. `evenement_anterieur_au_dernier_applique`, `facture_deja_payee`, `authentification_3ds_en_attente` |

**`stripe_objets_ordre`** : filigrane par objet (dernier événement appliqué : id, type, created,
état), pour `invoice`, `subscription`, `account` (Connect), `subscription` (Tools), et pour l'état
dérivé **`entreprise_acces`** (statut d'accès d'une entreprise, qui dépend à la fois des factures et
de l'abonnement). `entreprises.abonnement_dernier_evenement_at` (créée par `…333` et jamais écrite
jusqu'ici) suit ce filigrane.

Règles :

1. **Accès entreprise** : un événement de statut s'applique si `created ≥ filigrane`.
2. **Égalités à la seconde** (l'horloge Stripe est à la seconde) :
   - une observation d'abonnement relue chez Stripe gagne sur un événement `invoice.*`, car la
     relecture est au moins aussi fraîche que son événement ;
   - `invoice.payment_failed` ne défait pas un `actif` posé par `invoice.paid`.

   Dans les deux cas, l'état final ne dépend pas de l'ordre de livraison.
3. **Facture** : `paid` est terminal. Un `payment_failed` / `payment_action_required` d'une facture
   déjà payée est périmé quel que soit son horodatage. `factures_abonnement.statut` ne repasse jamais
   de `paid` à autre chose, et `payee_at` reste stable au rejeu. La ligne de facture suit sa propre
   chronologie : le `payment_failed` d'une facture B livré après le `paid` plus récent d'une
   facture A est périmé pour l'accès, mais B reste visible impayée.
4. **Abonnement relu** (`customer.subscription.*`, `checkout.session.completed`) : l'abonnement est
   relu chez Stripe sous le verrou remise existant. Si l'événement déclencheur est antérieur au
   filigrane d'accès, les champs non-statut (offre, périodicité, échéances, annulation programmée)
   sont rafraîchis, mais le statut d'accès est conservé (`perime`,
   `statut_conserve_evenement_anterieur_champs_rafraichis`).
5. **3-D Secure** : `invoice.payment_action_required` ne change jamais le statut d'accès et
   n'avance aucun filigrane (§8).

## 4. Événement périmé

Il ne modifie rien : pas de statut, pas de trace « dernière facture », pas de facture dégradée,
pas d'e-mail. Il est **journalisé** (`decision = perime` + motif) et la route répond **200**, pour
que Stripe ne le re-livre pas en boucle. Un `console.warn` catégorisé (`evenement_perime`, empreinte
de l'id, jamais l'id brut) est émis. `abonnement_evenements.statut_resultant` consigne le statut réel
après décision.

## 5. Idempotence

Trois niveaux :

1. **Réservation existante** (`reserver_evenement_abonnement_service`) : un même `event_id` répond
   `duplicate` sans traitement. Nouveauté : chaque doublon est compté
   (`abonnement_evenements.livraisons_doublons`, `derniere_livraison_doublon_at`).
2. **Idempotence en base** : chaque RPC ordonnée renvoie `deja_traite` si l'`event_id` figure déjà
   dans `stripe_evenements_ordre`. C'est ce qui protège quand la réservation a été libérée après une
   erreur postérieure à la décision : pas de double application, pas de second e-mail.
3. **Replay après échec (D3, Connect/Boutique)** : avant, une réservation `stripe_webhook_events`
   survivait à un 500, et la re-livraison Stripe était avalée comme doublon (événement perdu).
   `liberer_evenement_webhook_stripe_service` la libère désormais sur échec.

Preuves : le même `event_id` livré 1, 10 et 100 fois donne un état identique, une seule décision
journalisée et une seule facture ; 99 re-livraisons comptées (pgTAP §4). 100 livraisons
**concurrentes** donnent 1 `applique` et 99 `deja_traite` (harnais C6).

## 6. Concurrence

Harnais `scripts/qualification/stripe-ordering-concurrency.sh` : vraies connexions `psql`
simultanées, base locale uniquement (URL refusée).

| Scénario | Résultat |
|---|---|
| C1 `paid(t200)` tient le verrou 2 s ; `payment_failed(t100)` concurrent | la 2ᵉ session **attend** (≥ 1 s mesuré), puis `perime` → `actif` |
| C2 `payment_failed(t100)` tient le verrou ; `paid(t200)` concurrent | attend, puis `applique` → `actif` |
| C3a/b `failed(t300)` vs `paid(t200)`, deux ordres | `suspendu` (chronologie) dans les deux ordres |
| C4a/b égalité à la seconde, deux ordres | `actif` dans les deux ordres |
| C5 **100** courses parallèles sans pause, ordres et chronologies alternés | **0 écart** à la chronologie |
| C6 100 livraisons concurrentes du même `event_id` | 1 décision, 1 facture, état identique |

Résultat final : **15/15 PASS** (`ordre_fresh`, 336 migrations, 100 itérations).

## 7. Suspension

Décision produit conservée pour la Preview : un `invoice.payment_failed` **applicable** suspend
**immédiatement** (`abonnement_statut = suspendu`), sans période de grâce. Aucun code ne lit
`STRIPE_DELAI_GRACE_PAIEMENT_JOURS` (inchangé, décision `BILLING-GRACE-PERIOD` toujours ouverte).
`invoice.paid` restaure `actif` et efface `impaye_signale_at` / `suspension_prevue_at`.

## 8. 3-D Secure

- `invoice.payment_action_required` donne une décision `sans_effet` (motif
  `authentification_3ds_en_attente`) : trace de facture mise à jour, **jamais** de changement
  d'accès ni de filigrane d'accès. Cela ferme la régression Billing Security V3 (§3), où le 3DS
  suspendait.
- Il n'avance pas non plus le filigrane de la facture. Sans cela, un `payment_failed` antérieur livré
  après lui serait jugé périmé alors qu'il a bien eu lieu chez Stripe (pgTAP §9 : même état final
  que dans l'ordre Stripe).
- Une 3DS rejouée après `paid` est périmée.

**Limite connue (inchangée, hors ordre)** : sur un renouvellement exigeant une authentification,
Stripe passe l'abonnement en `past_due`. Le train mappe `past_due → suspendu`
(`statutAbonnementDepuisStripe`) via `customer.subscription.updated`, donc l'accès est coupé par le
chemin abonnement, pas par l'événement facture. Selon la documentation Stripe, un
`invoice.payment_failed` peut aussi accompagner cette situation. Les deux relèvent de la décision
ouverte `BILLING-GRACE-PERIOD`. L'étape `--3ds` du script distant (§11) permet de l'observer en
Test.

## 9. Portail / abonnements

pgTAP §8, entreprise dédiée, contrat tarifaire vérifié :

| Parcours | Attendu | Résultat |
|---|---|---|
| création pro/mensuel | essai → `actif` | ✅ |
| upgrade business/annuel | offre + contrat `business` | ✅ |
| downgrade pro | offre `pro` | ✅ |
| cancel at period end | `abonnement_annulation_prevue_at` posée, accès conservé | ✅ |
| reactivate | annulation levée | ✅ |
| payment failure (facture + subscription `past_due`, même seconde) | `suspendu` | ✅ |
| payment success (subscription active **avant** `invoice.paid`, même seconde) | `actif` | ✅ |
| vieux `subscription.updated` (relu `suspendu` par course) livré après | statut **non inversé**, offre rafraîchie, journalisé | ✅ |
| vieux `payment_failed` après succès | `perime` | ✅ |
| `subscription.deleted` puis `invoice.paid` antérieur livré après | reste `annule` | ✅ |
| garde tenant (subscription étrangère) | 42501, aucune trace partielle | ✅ |
| essai relu vs `invoice.paid` 0 € même seconde, deux ordres | `essai` dans les deux ordres | ✅ |

## 10. DB / verrouillage

- Abonnement (factures et relecture) : `SELECT … FOR UPDATE` sur la ligne `entreprises` **avant**
  la lecture des filigranes. Lecture, décision et écriture (statut, trace, facture, filigranes,
  journal) se font dans **une** transaction. Ordre de verrouillage unique (entreprise → filigranes),
  donc pas d'interblocage entre les chemins facture et abonnement.
- Le verrou remise existant (bail par subscription) reste pris autour de la relecture Stripe côté
  application ; le verrou ligne arbitre ensuite l'écriture.
- Connect `account.updated` et Tools : `pg_advisory_xact_lock(hashtextextended(…))` par compte ou
  abonnement.
- L'UPDATE direct de `entreprises` depuis la route abonnement est supprimé : toute transition passe
  par la RPC.

## 11. Préparation Stripe Test distant

`scripts/qualification/stripe-ordering-test-mode.mjs` (autonome, `node` seul) :

- **Sans `--execute`** : plan affiché, aucun appel réseau (exécuté ici).
- **`sk_live_` / `rk_live_` refusées** avant tout réseau, ainsi que clé absente ou inconnue, Price
  « live », absence de `--confirm-test` et entreprise non UUID. Chaque objet renvoyé en `livemode`
  arrête l'exécution.
- **Scénario** : test clock, client, abonnement pro avec essai de 30 j, upgrade, downgrade, cancel at
  period end, reactivate, carte en échec + avance d'horloge (`invoice.payment_failed`), carte valide
  + paiement (`invoice.paid`), option `--3ds`. Le script imprime ensuite les commandes
  `stripe events resend` pour **rejouer l'ancien `payment_failed` après `invoice.paid`** et 3× le
  même événement, ainsi que les requêtes SQL de vérification.
- Tests `node --test` (5/5, sans réseau) branchés en CI (`npm run test:stripe-ordering-script`).
- **Non exécuté** : aucune clé Stripe test n'est disponible dans cette mission.
- Prérequis : une entreprise créée **le même jour UTC** que le lancement (voir F-1).

Résultat attendu en Preview : `abonnement_statut = actif`, l'ancien `payment_failed` journalisé
`perime`, `livraisons_doublons = 3`.

## 12. Tests

### 12.1 pgTAP (base neuve, 336 migrations rejouées sans erreur)

| | Avant (V2) | Après |
|---|---|---|
| Fichiers | 126 | 127 |
| Tests | 2 832 | 2 973 |
| Assertions en échec | 23 (11 fichiers hérités) | **23, mêmes 11 fichiers** |

- Nouvelle suite `stripe_event_ordering_v1.test.sql` : **137/137**. Elle couvre l'ACL, la RLS, l'ordre
  inversé, le rejeu, les doublons 1/10/100, les égalités, le 3DS, le portail, Connect, D3, Tools et
  la validation d'entrée.
- `stripe_subscription_webhook_acl_v1` : une assertion attendait qu'une facture `paid` repasse à
  `open` au rejeu, c'est-à-dire exactement la régression corrigée. Elle a été inversée, avec le
  commentaire et un cas « facture non payée → statut mis à jour » ajouté.
- Suites Stripe / Boutique / capacité / Tools (13 fichiers) : **471/471**.
- Upgrade V2 → migration appliquée deux fois de suite : aucune erreur (idempotente).

### 12.2 Vitest

**158 fichiers, 1 868 tests, 0 échec.** Nouveautés :

- route abonnement : RPC ordonnée avec `event.created` ISO et absence d'UPDATE direct, périmé → 200
  sans e-mail, `deja_traite` → sans e-mail, erreur RPC → réservation annulée + 500, `created`
  absent → 400 ;
- Connect : `account.updated` ordonné, périmé → 200, erreurs → 500 + libération D3 ;
- Boutique : D3 ;
- nouveau `tools/monetization/stripe/webhook/route.test.ts` : relecture systématique, périmé →
  `ignored`, doublon, `created` absent, échec → `failed`.

### 12.3 Autres contrôles

`tsc --noEmit` ✅ · ESLint (fichiers modifiés) ✅ · `verify:migrations` 336 ✅ · `verify:secrets` ✅ ·
`verify:env-manifest` ✅ · `ELSATIA_PREVIEW_DB_VERIFY_V1.sql` aligné sur 336 / `20260926000401`
et rejoué sans ligne bloquante.

### 12.4 Contre-épreuve (train V2, sans la migration)

Écritures exactes de l'ancienne route, `invoice.paid (t200)` puis `payment_failed (t100)` rejoué :

```
AVANT (train V2) : statut final = suspendu, abonnement_dernier_evenement_at = NULL (jamais écrite)
APRÈS (…401)     : applique, perime → statut final = actif
```

## 13. Findings et points ouverts

**F-1 — PRÉEXISTANT, bloquant pour un vrai Checkout, hors périmètre ordre (non corrigé).**
`entreprises_essai_dates_coherentes` impose `abonnement_essai_fin ∈ [essai_debut, essai_debut + 30]`
et non nul. Or `synchroniser_abonnement_stripe_service` écrit `abonnement_essai_fin = trial_end`
Stripe, et Checkout envoie toujours `trial_period_days = 30`. Une entreprise qui s'abonne au jour N>0
de son essai local reçoit donc `trial_end = essai_debut + 30 + N`, et un abonnement sans essai reçoit
`null`. Dans les deux cas, violation de contrainte : **tous** ses `customer.subscription.*` /
`checkout.session.completed` échouent en 500 et sont re-livrés en boucle. Reproduit sur PostgreSQL
réel.

Correctif recommandé (décision produit requise) : passer `subscription_data[trial_end]` = essai
local restant au lieu d'une durée fixe (ou pas d'essai si expiré), et/ou borner `p_essai_fin` dans
la RPC. Non tranché ici, car cela modifie la sémantique de l'essai.

**Autres points :**

1. **Pack Preview** (`claude/trusting-edison-scjrd5`) : ses contrôles attendent 335 migrations. À
   aligner sur 336 / `20260926000401` lors de sa fusion. Ses §5.5 et §5.6 (« aucune garde d'ordre »,
   D3, `account.updated`) sont fermés par ce lot.
2. **Égalité sub-seconde** : une relecture d'abonnement faite dans la même seconde qu'un paiement
   pas encore visible chez Stripe gagnerait l'égalité. La fenêtre est < 1 s, et l'événement suivant
   (toujours émis par Stripe) corrige l'état.
3. `invoice.paid` postérieur à une annulation effective (`annule`) réactive l'accès : comportement
   du train conservé, qui respecte la chronologie mais reste une question produit.
4. Les changements de statut hors Stripe (admin plateforme, cron `appliquer_suspensions_impayes`,
   expiration d'essai) n'avancent pas le filigrane. Un événement Stripe antérieur à la dernière
   transition Stripe reste périmé, mais un événement Stripe postérieur écrase un choix admin, comme
   avant.
5. Tools : la relecture systématique ajoute un GET Stripe par `customer.subscription.*` (Test
   seulement aujourd'hui).
6. Mapping `past_due → suspendu` du chemin abonnement : voir §8.

## 14. Fichiers

- `supabase/migrations/20260926000401_stripe_event_ordering_v1.sql`
- `supabase/tests/stripe_event_ordering_v1.test.sql` (nouveau) ;
  `supabase/tests/stripe_subscription_webhook_acl_v1.test.sql` (assertion inversée, §12.1)
- `src/app/api/stripe/abonnement/webhook/route.ts`, `src/lib/stripe-abonnement-synchronisation.ts`
- `src/app/api/stripe/webhook/route.ts`, `src/app/api/stripe/boutique/webhook/route.ts`,
  `src/app/api/tools/monetization/stripe/webhook/route.ts`
- Tests : `…/abonnement/webhook/route.test.ts`, `…/double-livraison.test.ts`,
  `…/stripe/webhook/route.test.ts`, `…/boutique/webhook/route.test.ts`,
  `…/tools/monetization/stripe/webhook/route.test.ts` (nouveau)
- `scripts/qualification/stripe-ordering-concurrency.sh`,
  `scripts/qualification/stripe-ordering-test-mode.mjs` (+ `.test.mjs`)
- `package.json`, `.github/workflows/ci.yml` (test du script), `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql`,
  `docs/runbooks/ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md` (336)

## 15. Reproduction

```bash
service postgresql start
apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl bc
scripts/local-postgres-bootstrap/rebuild_db.sh ordre_fresh          # 336 migrations
su postgres -c "psql -c 'create database ordre_tap template ordre_fresh'"
su postgres -c "psql -d ordre_tap -c 'create extension pgtap' -c 'alter database ordre_tap set search_path = public, extensions'"
cd supabase/tests && su postgres -c "pg_prove -d ordre_tap *.test.sql"; cd -
scripts/qualification/stripe-ordering-concurrency.sh ordre_fresh 100
npx vitest run && npm run test:stripe-ordering-script
node scripts/qualification/stripe-ordering-test-mode.mjs            # plan seul, aucun réseau
```
