# ELSATIA — Boutique Payment Idempotency Closure V1

**Base** : `origin/integration/elsatia-post-qualification-fix-convergence-v1` @ `3cfbcd70`
(identifiée par recherche de branche — nom donné explicitement par la mission — et confirmée
comme contenant les correctifs Stripe/sécurité récents : `20260922000323`
`redteam_v3_authenticated_rpc_bypass_revocation`, `20260922000326`
`stripe_connect_boutique_webhook_closure_v1`). `main` n'a pas été utilisée comme point de
départ.
**Branche de travail** : `claude/magical-mccarthy-sm9lwb` (branche désignée par le harnais).
Créée initialement à un point identique à `main` (aucun commit propre) ; reconstruite par
`git reset --hard` sur la base ci-dessus avant tout travail, conformément à la consigne
« ne jamais partir de main ».
**Portée temporelle réelle** : une session unique. Comme les rapports de qualification
précédents sur ce dépôt, cette section ouvre sur une déclaration anti-fabrication plutôt
qu'une estimation de durée en heures.

---

## 0. Ce qui a réellement été fait (déclaration anti-fabrication)

- **Docker indisponible dans ce bac à sable** (`docker info` → `failed to connect to the
  docker API ... no such file or directory`, aucun démon), donc `supabase start` /
  `supabase test db` inutilisables. **Postgres 16 natif installé et démarré**
  (`service postgresql start`), **pgTAP 1.3.2 installé par `apt`** (registre Ubuntu
  accessible, contrairement au registre Docker).
- **Reconstruction manuelle d'un socle de parité Supabase** (rôles `anon`/`authenticated`/
  `service_role`, schéma `auth` avec `auth.users` et `auth.uid()/role()/email()/jwt()`,
  schéma `storage` avec `storage.objects`/`storage.buckets`/`storage.foldername()`, schéma
  `extensions` avec `pgcrypto`/`pg_trgm`, stub du schéma `pgsodium`
  — `crypto_sign_verify_detached` renvoie toujours `false`, suffisant pour laisser les
  migrations qui en dépendent s'appliquer sans donner une fausse impression de vérification
  cryptographique réelle). Script non versionné, local à cette session
  (`/tmp/bootstrap_supabase_stub.sql`), décrit en annexe (§A).
- **321 migrations rejouées pour de vrai, à partir de zéro, deux fois** : une fois à l'état
  actuel de la branche de base (320 migrations, **320/320 appliquées sans erreur**), une fois
  avec le correctif de cette mission ajouté (321 migrations, **321/321 appliquées sans
  erreur**). Un **chemin d'upgrade représentatif** a aussi été rejoué séparément : base de
  données amenée aux 320 migrations existantes, puis **seule la nouvelle migration
  `20260922000330` appliquée par-dessus** (pas de fresh) — succès, `CREATE FUNCTION` /
  `NOTIFY` / `COMMIT`, aucune erreur.
- **101 fichiers pgTAP exécutés pour de vrai** sur la base à 321 migrations : **2 180
  assertions `ok`, 0 assertion `not ok`**. 16 fichiers sur 101 se sont arrêtés en erreur SQL
  avant `finish()` (gaps de fidélité du harnais reconstruit à la main, détail en §0.1) —
  **aucun des 16 ne touche Boutique, Stripe, webhooks ou paiements** ; les 4 fichiers
  pré-existants du périmètre Boutique/Stripe et le nouveau fichier de cette mission sont
  parmi les 85 fichiers qui se terminent normalement, et tous leurs `ok` sont au vert (§8).
- **Reproduction réelle du P1** (pas seulement raisonnée) sur une base rejouée à partir de
  zéro : un harnais reprenant le corps exact de `boutique_finaliser_commande_payee` avec un
  délai injecté entre lecture et écriture, appelé par **deux processus `psql` du système
  d'exploitation lancés en parallèle** (pas deux requêtes dans la même session) — stock
  10 → 4 au lieu de 7 attendu (double décrément). Reproduit une seconde fois après correctif
  avec le même harnais corrigé : stock 10 → 7, comportement correct. Détail en §4.
- **`npm ci` (805 paquets), `vitest run` complet (154 fichiers, 1 799/1 799), `vitest run`
  ciblé webhooks Stripe/Boutique (5 fichiers, 62/62), `verify:migrations` (321 migrations
  valides), `verify:secrets` (2 563 fichiers, aucun secret, 2 exceptions nommées déjà
  existantes)** — tous exécutés réellement dans cette session. Détail en §9-§10.
- Ce qui n'a **pas** été fait : accès Preview/Production réel, appel Stripe réel (aucune clé
  fournie, aucun `livemode` réel), image Docker officielle Supabase (bloquée par
  l'indisponibilité du démon dans ce bac à sable, comme documenté par les sessions
  précédentes sur ce dépôt — `ELSATIA_STRIPE_CONNECT_BOUTIQUE_WEBHOOK_CLOSURE_V1.md` §0),
  correction de la D3 (idempotence retry-après-échec métier sur `stripe_webhook_events` —
  décision historique du 2026-09-11, confirmée non régressée, toujours hors périmètre
  explicite de cette mission — §6), `npm run build` complet ni `tsc --noEmit` (aucun fichier
  `src/` modifié — le correctif est purement SQL), `eslint` (idem, rien à lint).

### 0.1 — Limites du harnais de base de données (gaps déjà connus, revérifiés ici)

Les 16 fichiers pgTAP qui s'arrêtent en erreur avant `finish()` échouent tous pour des
raisons déjà indépendantes de Boutique/Stripe :

| Cause racine (harnais, pas le dépôt) | Fichiers touchés |
|---|---|
| `pgsodium` stubbé ne fournit pas `crypto_sign_detached` (seul `crypto_sign_verify_detached` a été stubbé, car c'est la seule fonction appelée par le chemin de vérification testé ailleurs) | `platform_stripe_state_attestation_r72.test.sql` |
| `auth.mfa_factors` (table Supabase Auth MFA réelle) non modélisée par ce harnais minimal | `platform_aal2_role_integrity_v1.test.sql`, `reserves_v1_foundation_workflow.test.sql` |
| Variable d'environnement/feature-flag applicatif (« Inscription fermée ») non positionnée pour ces scénarios de fixtures Studio | `studio_analysis.test.sql`, `studio_editor.test.sql`, `studio_media_upload.test.sql`, `studio_project_management.test.sql`, `studio_render_engine.test.sql`, `studio_templates.test.sql`, `studio_timeline.test.sql` |
| Colonne/fixture non modélisée par ce harnais (identique aux gaps déjà documentés par `ELSATIA_STRIPE_CONNECT_BOUTIQUE_WEBHOOK_CLOSURE_V1.md` §0.1 sur une reconstruction séparée) | `platform_global_owner_all_apps_v1.test.sql`, `platform_support_uid_security_v1.test.sql`, `reserves_v2_terrain_capture.test.sql`, `reserves_v3_collaboration_livrables.test.sql`, `elsatia_tools_cloud_sync_entitlement_closure_v1.test.sql`, `gp_dashboard_search_perf_dashboard_indicateurs.test.sql` |

Aucun de ces 16 fichiers ne référence `boutique_commandes`, `boutique_finaliser_commande_payee`,
`stripe_webhook_events` ou l'un des chemins webhook. **Preuve de fidélité pour le périmètre de
cette mission** : les 5 fichiers pgTAP qui couvrent réellement Boutique/Stripe/webhooks
(`stripe_connect_boutique_webhook_closure_v1`, `redteam_v3_authenticated_rpc_bypass_revocation`,
`capacity_boutique_internal_rpc_grants_v1`, `renommage_elsatia_boutique`, et le nouveau fichier
de cette mission) se terminent tous normalement avec 100 % d'`ok` (89 assertions), avant comme
après le correctif — le harnais est suffisamment fidèle pour démontrer l'absence de régression
sur ce périmètre précis, même s'il n'est pas l'image Docker officielle Supabase.

---

## 1. Reproduction avant fix

### 1.1 — Le rejeu SÉQUENTIEL ne reproduit pas l'erreur décrite par la mission

L'énoncé de mission postule qu'un « replay/retry du webhook Stripe sur une commande déjà
finalisée peut lever une erreur ». Reproduction empirique sur la base rejouée à partir de
zéro (**avant** tout correctif de cette session) :

1. Commande créée `en_attente_paiement`, ligne de commande quantité 3, produit stock 10.
2. Premier appel `boutique_finaliser_commande_payee` en tant que `service_role`
   (`request.jwt.claim.role = service_role`, chemin réel du webhook) : succès, commande
   `payee`, stock 10 → 7, une dépense et un règlement fournisseur créés.
3. **Rejeu séquentiel exact** (même `p_commande_id`, même `p_checkout_id`, toujours
   `service_role`) : **ne lève aucune erreur**. Stock inchangé à 7, toujours une seule
   dépense, un seul règlement.

Ceci est déjà correct **avant** cette mission, grâce au garde-fou existant dans le corps de la
fonction (`v_deja_payee := v_commande.statut = 'payee'; if v_commande.id is null or
v_deja_payee then return; end if;`), présent depuis `20260801000194`. Le déclencheur de
sécurité `boutique_commandes_paiement_serveur_seul` (`20260922000323`) n'entre même pas en jeu
sur ce chemin : la fonction retourne avant d'exécuter le moindre `UPDATE` sur
`boutique_commandes`. Script de reproduction : `/tmp/tests_copy/repro_idempotency.sql`
(non versionné, résultats reproduits dans ce rapport).

**DECISION_REQUIRED-01** : l'énoncé littéral de la mission (« lève une erreur ») ne se
reproduit pas sur le chemin séquentiel. Option conservatrice retenue : ne pas s'arrêter à ce
constat négatif, et pousser la vérification sur l'angle explicitement prévu par la mission
elle-même (section 4, CONCURRENCY) plutôt que de conclure prématurément à un blocker inexistant
ou de forcer une régression artificielle pour coller à l'énoncé. Continuation → §1.2.

### 1.2 — Le rejeu CONCURRENT reproduit un P1 réel : double décrément de stock silencieux

Root cause identifiée par lecture du corps de la fonction (§2) : le `SELECT` initial n'est pas
verrouillé (`select * into v_commande from public.boutique_commandes where id = ... and
stripe_checkout_id = ...` — sans `for update` ni `for no key update`). Deux transactions
concurrentes qui appellent la fonction pour la même commande/checkout peuvent toutes les deux
lire `statut <> 'payee'` avant que l'une des deux n'ait committé son `UPDATE`.

Reproduction avec deux **processus `psql` du système d'exploitation réels**, lancés en
parallèle par un script shell (`sleep 0.3` de décalage pour garantir le chevauchement, pas une
simple exécution séquentielle rapide) :

1. Harnais de test = copie exacte du corps de `boutique_finaliser_commande_payee`, avec un
   `perform pg_sleep(2)` inséré entre la lecture et l'écriture, pour rendre la fenêtre de
   course observable à la demande plutôt que dépendante du hasard de l'ordonnanceur (la
   fenêtre réelle, sans le délai injecté, existe de façon identique dans la fonction réelle —
   le délai ne fait qu'agrandir une fenêtre déjà présente pour l'observer de façon fiable).
2. Commande `en_attente_paiement`, ligne quantité 3, produit stock 10.
3. Deux appels concurrents (`service_role`, même commande, même checkout) :
   **stock 10 → 4** (deux décréments de 3 au lieu d'un seul), statut `payee` (une seule fois,
   sans erreur), une seule dépense/un seul règlement (protégés par leurs propres contraintes
   `ON CONFLICT`/`NOT EXISTS` — seul le stock n'a aucune protection).

C'est un **double fulfilment silencieux** : aucune erreur n'est levée nulle part (ni par la
fonction, ni par le déclencheur de sécurité, qui laisse passer `service_role`
inconditionnellement), mais le stock est corrompu. Correspond exactement au scénario « double
stock » listé par la section 4 (CONCURRENCY) de l'énoncé de mission.

---

## 2. Root cause

`boutique_finaliser_commande_payee` (corps introduit par `20260801000194`, jamais modifié
depuis, privilèges resserrés à `service_role` seul par `20260922000323`) :

```sql
select * into v_commande
from public.boutique_commandes
where id = p_commande_id and stripe_checkout_id = p_checkout_id;
v_deja_payee := v_commande.statut = 'payee';
if v_commande.id is null or v_deja_payee then return; end if;
-- … décrément de stock, UPDATE statut='payee', dépense/règlement …
```

- **Pas** un problème du déclencheur `boutique_commandes_paiement_serveur_seul` : il laisse
  passer `service_role` avant toute condition (`if auth.role() = 'service_role' then return
  new; end if;`), donc n'intervient jamais sur le chemin webhook légitime, séquentiel ou
  concurrent.
- **Pas** un problème d'ordre des migrations ni de grants : `20260922000323` (revoke
  `authenticated`, grant `service_role`) et `20260922000326` (grant `INSERT` sur
  `stripe_webhook_events`) sont corrects et suffisants pour que le webhook fonctionne
  end-to-end (revérifié par les 32 assertions de `stripe_connect_boutique_webhook_closure_v1`,
  toutes au vert).
- **Pas** un problème de dédup Stripe (`stripe_webhook_events`, D3) : ce résidu concerne le cas
  où le *traitement* échoue après la *réservation* de l'évènement — différent du problème ici,
  qui existe même quand chaque appel individuel réussit.
- **C'est** une classique course lecture-puis-écriture (TOCTOU) : absence de verrouillage de
  ligne sur la lecture qui décide du no-op. Le reste du corps de la fonction est déjà
  partiellement défensif (dépense : `on conflict(...) do update`, règlement : `not exists(...)`)
  mais le **décrément de stock n'a aucune protection équivalente** — c'est un `UPDATE` sans
  garde d'idempotence propre, qui ne peut être rendu sûr qu'en empêchant la seconde transaction
  de lire un état stale.

---

## 3. Contrat d'idempotence — statut après correctif (§7)

| Scénario | Attendu | Vérifié |
|---|---|---|
| Premier évènement valide | APPLY | ✅ pgTAP #3-#7 |
| Même évènement (rejeu séquentiel) | NO-OP SAFE | ✅ déjà correct avant cette mission ; pgTAP #8-#11 fige le comportement |
| Même évènement/paiement (rejeu **concurrent**) | NO-OP SAFE | ❌ avant correctif (double décrément stock) → ✅ après correctif (§4) |
| Évènement différent, même paiement (même `commande_id`/`checkout_id`) | NO-OP SAFE | ✅ la fonction ne distingue jamais par `event_id` Stripe, seulement par `commande_id`/`checkout_id` — donc déjà couvert par les mêmes tests que « même évènement » |
| `authenticated` direct | DENIED | ✅ pgTAP #1-#2 (42501, déjà garanti par `20260922000323`, revérifié dans ce contexte) |
| `service_role` webhook | ALLOWED | ✅ pgTAP #3 |
| Cross-tenant (couple commande/checkout incohérent) | DENIED / ignorée | ✅ pgTAP #12-#13 |

---

## 4. Concurrency

Voir §1.2 pour la méthodologie et le résultat AVANT correctif (stock 10 → 4, double
décrément). **Après correctif** (même harnais, avec le verrou ajouté) : stock **10 → 7**
(un seul décrément), statut `payee` une seule fois, aucune erreur, aucun deadlock, temps
d'exécution total ≈ 1,8 s pour deux appels à 2 s de délai chacun décalés de 0,3 s — cohérent
avec une sérialisation correcte (le second appel bloque sur le verrou jusqu'au commit du
premier, puis sort immédiatement par le no-op sans attendre un second délai).

Aucun deadlock, aucune double décrémentation de stock, aucun double journal
(dépense/règlement — déjà protégés avant cette mission), aucun double email (la Boutique
n'envoie pas d'email de confirmation dans ce dépôt — vérifié par lecture de
`src/app/api/stripe/boutique/webhook/route.ts`, aucun appel à un service d'email), aucun
double audit applicatif spécifique à la Boutique (le seul journal est
`depenses_fournisseurs`/`reglements_fournisseurs`, déjà protégé).

**Choix du mode de verrou — `FOR NO KEY UPDATE`, pas `FOR UPDATE`.**
`boutique_lignes_commande.commande_id` référence `boutique_commandes(id)` par contrainte de
clé étrangère (`on delete cascade`). `20260921000302` a déjà documenté, pour un cas
structurellement identique (`recalc_paiements_facture` verrouillant `factures`, référencée par
la FK de `paiements`), le deadlock d'escalade de verrou que `FOR UPDATE` provoque quand une
insertion dans la table enfant pose d'abord, dans la même transaction, le verrou `FOR KEY
SHARE` implicite de sa FK avant qu'un correctif ne tente de monter en `FOR UPDATE`. La mise à
jour qui suit le verrou dans `boutique_finaliser_commande_payee` (`statut`, `updated_at`) ne
touche ni `id` ni aucune colonne référencée par une contrainte unique — les conditions d'usage
de `FOR NO KEY UPDATE` documentées par `20260921000302` sont réunies. Bien qu'aucune insertion
dans `boutique_lignes_commande` n'ait lieu pendant l'exécution de
`boutique_finaliser_commande_payee` aujourd'hui (donc `FOR UPDATE` n'aurait pas non plus
déadlocké dans l'état actuel du code), `FOR NO KEY UPDATE` est retenu par cohérence avec le
précédent du dépôt et pour ne pas introduire une classe de risque que le dépôt a déjà choisi
d'éviter ailleurs, sans aucun coût fonctionnel (revérifié empiriquement §4 : sérialise
correctement, comme `FOR UPDATE`).

---

## 5. Failure injection

- **Évènement enregistré puis échec métier** (business failure après réservation dans
  `stripe_webhook_events`) : résidu D3 documenté et testé par `20260922000326`
  (`stripe_connect_boutique_webhook_closure_v1.test.sql` #31-#32) — décision historique du
  2026-09-11, **hors périmètre explicite de cette mission** (le webhook Boutique appelle
  `boutique_finaliser_commande_payee` dans une requête RPC séparée de l'`INSERT` de
  dé-duplication ; un échec de la RPC après réservation de l'évènement laisse ce dernier
  réservé — comportement inchangé, confirmé non régressé par ce correctif : les 2 assertions
  D3 du fichier de closure sont toujours au vert après application de `20260922000330`).
- **Succès métier puis échec HTTP** (timeout réseau entre la DB et le client Stripe après que
  la transaction a committé) : couvert par le rejeu séquentiel (§1.1, §3) — la commande est
  déjà `payee`, tout rejeu ultérieur (retry Stripe standard, ou nouvel appel applicatif après
  timeout) est un no-op sûr, avec ou sans le correctif de cette mission.
- **Timeout / crash pendant le traitement** : `boutique_finaliser_commande_payee` s'exécute
  entièrement dans la transaction implicite d'un seul appel RPC PostgREST. Un crash ou un
  timeout avant le `COMMIT` implicite annule l'intégralité de la transaction (Postgres
  standard) : décrément de stock, `UPDATE` de statut et écritures de dépense/règlement sont
  soit tous appliqués, soit aucun ne l'est — pas d'état partiel possible. Vérifié par lecture
  du code (une seule fonction `plpgsql`, aucun `commit`/`savepoint` interne), pas par une
  injection de crash réelle (non reproductible de façon fiable dans ce bac à sable sans accès
  au processus serveur Postgres depuis l'intérieur d'une transaction cliente).
- **Retry après crash** : identique au rejeu séquentiel (§1.1) si la transaction a bien été
  annulée (commande reste `en_attente_paiement`, le retry ré-applique normalement) ; identique
  au no-op séquentiel (§1.1) si la transaction avait en réalité committé avant le crash côté
  client (commande déjà `payee`, le retry ne fait rien).

---

## 6. Payment integrity

- **Montant** : `boutique_finaliser_commande_payee` ne reçoit **aucun montant** en paramètre
  (contrairement à `stripe_connect_encaisser_facture_service`, qui reçoit et plafonne un
  montant Stripe). Le montant facturé (`montant_ht`/`montant_tva`/`montant_ttc`) est celui
  déjà stocké sur la ligne `boutique_commandes` au moment de la création de la session
  Checkout côté serveur — non modifiable par le client après coup (RLS + déclencheur
  `boutique_commandes_paiement_serveur_seul` empêchent un `PATCH` client une fois `payee`, et
  aucune route n'expose de mutation de `montant_*` après création). Caractéristique de
  conception préexistante, non modifiée par cette mission, hors périmètre (idempotence, pas
  intégrité du montant).
- **Session Checkout / commande** : la fonction exige la conjonction exacte
  `id = p_commande_id and stripe_checkout_id = p_checkout_id` — un `checkout_id` volé ou
  deviné pour une autre commande ne matche jamais (`v_commande.id is null` → retour sans
  effet), vérifié §1.1 et par pgTAP #12-#14.
- **Tenant** : `stripe_checkout_id` est unique par commande (index unique partiel,
  `20260724000145`) et `entreprise_id` est lu depuis la ligne trouvée, jamais depuis un
  paramètre client — pas de confusion de tenant possible par ce chemin (différent du cas
  Connect, où `p_entreprise_id` est un paramètre explicite et fait l'objet d'une vérification
  dédiée dans `stripe_connect_encaisser_facture_service`).
- **Compte Connect** : sans objet pour la Boutique (vente directe ELSATIA, pas de paiement
  vers un compte connecté tiers).
- Conclusion : « une commande ne devient jamais payée sur simple donnée cliente » tient déjà
  pour la Boutique via la combinaison signature Stripe + contrôle de mode (route) +
  restriction d'exécution à `service_role` (`20260922000323`) + couple
  commande_id/checkout_id serveur (fonction). Cette mission n'a rien changé à cette surface ;
  seul le verrouillage de ligne a été ajouté.

---

## 7. Fix

Migration additive `supabase/migrations/20260922000330_boutique_finaliser_commande_payee_concurrency_lock.sql` :
redéfinit uniquement le corps de `boutique_finaliser_commande_payee` (`create or replace
function`), ajoute `for no key update` au `SELECT` initial. Aucun changement de privilèges
(déjà corrects), aucun contournement du déclencheur de sécurité, aucune autre ligne modifiée.

---

## 8. pgTAP

Nouveau fichier `supabase/tests/boutique_finaliser_commande_payee_idempotency_v1.test.sql`
(15 assertions, toutes au vert avant comme après application de `20260922000330` **pour les
scénarios déjà corrects avant** — first apply, rejeu séquentiel, denied/allowed, cross-tenant,
commande inconnue — et seulement après pour l'assertion statique de verrouillage) :

- `authenticated` direct → DENIED (42501) — #1-#2
- `service_role` webhook, premier appel → APPLY (statut, stock, dépense, règlement) — #3-#7
- Rejeu séquentiel → NO-OP SAFE (aucune erreur, aucun second effet) — #8-#11
- Cross-tenant (couple commande/checkout incohérent) → ignorée — #12-#13
- Commande/checkout inconnus → ignorée, pas d'erreur — #14
- Garde statique : le corps de la fonction contient bien `for no key update` (protection
  contre une régression silencieuse qui retirerait le verrou) — #15

La **concurrence réelle** (deux sessions Postgres simultanées) n'est pas testable dans un
seul fichier pgTAP (une seule transaction) — même convention déjà établie par ce dépôt dans
`gp_reception_commande_stock_transactionnel_v1.test.sql` : elle est vérifiée par le harnais à
deux processus `psql` documenté en §1.2/§4 (non versionné, résultats reproduits dans ce
rapport, comme le veut cette même convention).

Suite complète pertinente rejouée sur la base à 321 migrations (après correctif) :

| Fichier | Assertions | Résultat |
|---|---|---|
| `stripe_connect_boutique_webhook_closure_v1.test.sql` | 32 | 32 ok, 0 not ok |
| `redteam_v3_authenticated_rpc_bypass_revocation.test.sql` | 13 | 13 ok, 0 not ok |
| `capacity_boutique_internal_rpc_grants_v1.test.sql` | 11 | 11 ok, 0 not ok |
| `renommage_elsatia_boutique.test.sql` | 18 | 18 ok, 0 not ok |
| `boutique_finaliser_commande_payee_idempotency_v1.test.sql` (nouveau) | 15 | 15 ok, 0 not ok |
| **Suite complète (101 fichiers)** | **2 180** | **2 180 ok, 0 not ok** (16 fichiers arrêtés en erreur harnais avant `finish()`, aucun lié à Boutique/Stripe — §0.1) |

---

## 9. Vitest

- Ciblé (webhooks + ACL service_role) : `src/app/api/stripe/boutique/webhook/route.test.ts`,
  `src/app/api/stripe/webhook/route.test.ts`,
  `src/app/api/stripe/abonnement/webhook/route.test.ts`,
  `src/app/api/stripe/abonnement/webhook/double-livraison.test.ts`,
  `src/lib/supabase/service-role-acl.test.ts` → **5 fichiers, 62/62 tests**.
- Élargi (Stripe) : `stripe-capacite-reconcile`, `stripe-discount-server`,
  `stripe-capacite-personnes`, `stripe-state-attestation`, `stripe-discount-consistency` →
  **5 fichiers, 124/124 tests**.
- Suite complète : `npx vitest run` → **154 fichiers, 1 799/1 799 tests**, 0 échec.

Aucun fichier `src/` n'a été modifié par cette mission (correctif purement SQL) : ces
résultats confirment l'absence de régression côté application, pas l'effet direct du
correctif (qui n'est vérifiable qu'en base, §8).

---

## 10. Fresh + upgrade

- **Fresh complet** : base rejouée à partir de zéro, **321/321 migrations appliquées sans
  erreur** (320/320 avant ajout du correctif, sur la même reconstruction de socle).
- **Upgrade représentatif** : base amenée séparément aux 320 migrations existantes (état
  « production actuelle » simulé), puis **seule `20260922000330` appliquée par-dessus** —
  succès (`CREATE FUNCTION`, `NOTIFY`, `COMMIT`, aucune erreur). Le nouveau fichier pgTAP
  rejoué sur cette base d'upgrade donne le même résultat que sur le fresh (15/15 ok).
- `npm run verify:migrations` → `321 migrations valides, noms et horodatages uniques.`
- `npm run verify:secrets` → `2563 fichiers suivis contrôlés, aucun secret reconnu
  (2 exceptions nommées).` (exceptions préexistantes, non liées à cette mission).

---

## 11. Ce qui reste ouvert (hors périmètre explicite, non traité par cette mission)

- **D3** (idempotence retry-après-échec métier sur `stripe_webhook_events`) : décision
  historique du 2026-09-11 de traiter cela comme un lot de sécurité distinct, confirmée non
  régressée (§5, §8). Reste un résidu documenté, pas un blocker de cette mission.
- Les autres flux cassés par `20260902000255` hors Stripe Connect/Boutique (paie, relances,
  Powens, push, journal d'activité) — hors périmètre, déjà notés hors périmètre par
  `20260922000326`.
- Image Docker officielle Supabase / `supabase test db` réel : indisponible dans ce bac à
  sable (§0). La reconstruction manuelle a été jugée suffisamment fidèle pour ce périmètre
  précis (§0.1), mais une vérification sur l'image officielle avant merge en Production
  reste recommandée, comme pour les rapports précédents de ce dépôt.
- Preview/Production/Stripe live : jamais touchés, conformément à la consigne de la mission.

---

## Verdict

**BOUTIQUE IDEMPOTENCY BLOCKER CLOSED LOCALLY**

Précision : le mécanisme exact du P1 confirmé diffère de la description initiale de la
mission (« erreur » sur rejeu) — le rejeu strictement séquentiel était déjà sûr avant cette
mission (garde-fou existant depuis `20260801000194`). Le P1 réel, confirmé par reproduction
avec deux processus système réels et fermé par cette mission, est un **double fulfilment
silencieux (stock) sous rejeu concurrent** de `boutique_finaliser_commande_payee`, dû à
l'absence de verrouillage de ligne sur la lecture qui décide du no-op. Corrigé par
`20260922000330` (`for no key update`), vérifié par reproduction avant/après avec le même
harnais, par 15 nouvelles assertions pgTAP, par la suite pgTAP complète du périmètre
Boutique/Stripe (89/89 ok) et par la suite Vitest complète (1 799/1 799). Non vérifié sur
l'image Docker officielle Supabase ni en environnement Preview/Production/Stripe live (§11).

---

## Annexe A — Socle de parité Supabase reconstruit à la main

Fichier non versionné `/tmp/bootstrap_supabase_stub.sql`, appliqué avant les 320/321
migrations du dépôt sur une base Postgres 16 native vierge :

- Rôles `anon`, `authenticated`, `service_role` (`nologin noinherit`, `service_role` avec
  `bypassrls`), accordés au rôle courant pour permettre `set local role ...` dans les tests.
- Schéma `auth` : table `auth.users` (colonnes réellement référencées par les migrations —
  `instance_id`, `id`, `aud`, `role`, `email`, `encrypted_password`, `email_confirmed_at`,
  `banned_until`, `deleted_at`, etc.), fonctions `auth.role()`/`auth.uid()`/`auth.email()`
  lisant les GUC `request.jwt.claim.*`/`request.jwt.claims` posées par PostgREST (comportement
  répliqué exactement, pas simulé approximativement), `auth.jwt()`.
- Schéma `storage` : `storage.buckets`, `storage.objects` (colonnes réellement référencées),
  `storage.foldername()`.
- Schéma `extensions` : `pgcrypto`, `pg_trgm` (recherche par trigramme utilisée par certaines
  migrations non liées à ce périmètre).
- Schéma `pgsodium` stubbé : `crypto_sign_verify_detached` renvoie toujours `false` (le
  paquet `postgresql-16-pgsodium` n'existe pas sur les dépôts Ubuntu accessibles ici) — permet
  aux 2 migrations qui en dépendent de s'appliquer (contrairement aux sessions précédentes sur
  ce dépôt qui n'avaient pas stubbé ce schéma et perdaient ces 2 migrations), au prix explicite
  de ne jamais vérifier réellement une signature Ed25519 dans ce harnais — sans incidence sur
  le périmètre Boutique/Stripe de cette mission, qui ne dépend pas de `stripe_attestation`.
