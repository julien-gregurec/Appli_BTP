PUSH_LOSS_BEFORE=9800/10000 (contrat A7 : 2 passages quotidiens, N=10 000) ; 4844/10000 en charge 4 workers (+ 5145 notifications poussées plusieurs fois)
PUSH_LOSS_AFTER=0 (contrat 50→10 000, charge 10 000 × 4 workers, endurance 30 min)

REMINDER_STARVATION_BEFORE=1800/2000 factures dues jamais relancées (90 %, cron réel, 10 000 factures, 5 tenants, 3 passages)
REMINDER_STARVATION_AFTER=0/2000 (toutes atteintes en 2 passages)

RLS_OWN_TENANT_BEFORE=1 000 devis propres 1 074 ms (1k) … 2 344 ms (100k) ; liste/comptage sans filtre 61 s (1k) … > 120 s timeout (100k)
RLS_OWN_TENANT_AFTER=1 000 devis propres 6,6–7,0 ms (1k … 100k) ; liste/comptage sans filtre 6,7–172 ms (100k : 110–172 ms)

RLS_CROSS_TENANT_BEFORE=lecture croisée vide (devis) 826 ms (1k), 3,8 s (5k), 15,4 s (20k), 37,3 s (50k), 77,4 s (100k)
RLS_CROSS_TENANT_AFTER=5,9–7,0 ms constant (1k … 100k), 0 ligne lue ; 0 fuite (54/54 contre-épreuves, 6 mutations détectées, ~955 000 requêtes contrôlées)

VERDICT=PERFORMANCE_HARDENING_V9_1_LOCALLY_QUALIFIED

# ELSATIA — PERFORMANCE HARDENING V9.1 (remédiation des P1 du soak)

| | |
|---|---|
| Base | `integration/elsatia-canonical-train-v9.1` @ `24a0c2e993ec0836b492ea72f27ed7dc347a20fa` (391 migrations) |
| Source | `docs/qualification/ELSATIA_SOAK_PERFORMANCE_V1.md`, branche `qualification/elsatia-soak-performance-v1` (construite depuis `877a4b9f`) — **port sémantique**, aucun merge en bloc |
| Branche | `integration/elsatia-performance-hardening-v9-1` (miroir : `claude/wizardly-volta-gl03rv`) |
| Migrations | **4 ajoutées après V9.1** (`20261003000101`, `…0201`, `…0301`, `…0401`) ; les 391 existantes **inchangées** (`git diff` vide sur elles ; `npm run verify:migrations` : 395 valides) |
| Déploiement | **Aucun.** Ni Preview, ni Production, ni Supabase hébergé, ni merge. Bases PostgreSQL 16 locales jetables, PostgREST v12.2.3 local, secrets de banc générés localement. |
| Machine | conteneur 4 vCPU partagé (génération de données, suites pgTAP et bancs concurrents : les durées absolues sont pessimistes ; les rapports avant/après sont mesurés dans les mêmes conditions) |

## 0. Verdict

**`PERFORMANCE_HARDENING_V9_1_LOCALLY_QUALIFIED`**

Les trois P1 du soak sont reproduits sur V9.1 (rouge), corrigés par 4 migrations ajoutées après les 391 de V9.1
(aucune modifiée) et le code applicatif strictement nécessaire, puis prouvés en vert, en charge (≥ 10 000 push,
≥ 10 000 factures, tenants 1k → 100k, 30 min d'endurance, 3 000 + 3 000 requêtes multi-tenant entrelacées) et en
sécurité (équivalence ligne à ligne des 65 policies dans 18 contextes, mutations détectées, 0 fuite sur ≈ 955 000
requêtes contrôlées). Chaque correctif a un retour arrière **testé** (schéma identique à V9.1). Qualification
**locale uniquement** : aucun déploiement, aucune Preview, aucune Production. Limites assumées au § 9.

| P1 | RED_BEFORE (V9.1) | GREEN_AFTER | LOAD | RLS_SECURITY | ROLLBACK |
|---|---|---|---|---|---|
| **A — push** | contrat 12/19 rouges ; 9 800 / 10 000 perdues ; 4 workers : 4 844 perdues, 5 145 doubles push | contrat 19/19 ; pgTAP CI 19/19 ; Vitest 13 | 10 000 × 4 workers : 0 perte, 0 doublon ; 30 min : 35 690 notifications, 0 perte, 0 doublon | aucune policy touchée ; fonctions `service_role` seul | script testé (schéma = V9.1) |
| **B — relances** | contrat 10/16 rouges ; cron réel : 1 800 / 2 000 dues jamais relancées | contrat 16/16 ; propriété moteur réel : 0 éligible écarté ; pgTAP CI 8/8 | cron réel 10 000 factures : 2 000 / 2 000 atteintes, 0 doublon, 0 dépassement | sélection SECURITY INVOKER (RLS de la session) | script testé (schéma = V9.1) |
| **C — RLS** | 1 000 lignes propres 1,0–2,3 s ; lecture croisée vide 0,8 s (1k) → 77 s (100k) ; liste / comptage sans filtre 61 s → > 120 s ; 20 lecteurs : 90 % d'échecs | équivalence 54/54 (18 contextes), 6 mutations détectées | 3 000 + 3 000 requêtes multi-tenant (dont 100k), endurance 30 min 949 546 requêtes : 0 erreur, 0 fuite ; lecture croisée 5,9 ms constante | 0 écart ligne à ligne, 0 fuite en charge | script testé (policies = V9.1 à l'octet) |

Non-régression : **pgTAP 176 suites existantes identiques avant / après** (167 propres ; les 9 non propres le sont
déjà sur V9.1 : 7 suites Studio — projet Supabase dédié —, `platform_stripe_state_attestation_r72`,
`elsatia_tools_cloud_sync_entitlement_closure_v1`) + 3 nouvelles suites propres ; Vitest 2 904 verts ; `tsc` 0 erreur ;
ESLint propre sur les fichiers touchés ; 395 migrations rejouées de zéro sans erreur ; migrations appliquées sur une
base peuplée (V9.1 + 180 000 devis) en < 0,2 s chacune.

## 1. P1-A — Notifications push : file durable

### RED_BEFORE (V9.1 @ 24a0c2e9, reproduit)

Route `/api/cron/notifications-push` (cron quotidien `45 3 * * *`) : `push_notifications_en_attente_service(now − 25 h, 200)` —
`LIMIT 200` **sans `ORDER BY`**, fenêtre glissante de 25 h, un seul lot ; `traiterNotificationPush` sans réservation
(le webhook temps réel et le cron peuvent traiter la même notification) ; une préparation en échec laisse la
notification en tête de file.

Contrat `scripts/perf/hardening/tests/push_file_contract.test.sql` (même fichier avant / après ; le temps est simulé en
vieillissant les données) — **V9.1 : 12/19 rouges** (`perf-hardening-v9-1/push_contract_RED_before_v91.txt`) :

| Cas | V9.1 | Attendu |
|---|---:|---:|
| A1–A3 N = 50 / 199 / 200, deux passages quotidiens | 0 perdue | 0 |
| A4 N = 201 | **1 perdue** | 0 |
| A5 N = 300 | **100 perdues** | 0 |
| A6 N = 1 000 | **800 perdues** | 0 |
| A7 N = 10 000 | **9 800 perdues** | 0 |
| A9 ordre (budget 1 lot, anciennes écrites en dernier) | ordre physique | plus anciennes d'abord |
| A10 un jour sans cron (20 notifications) | **20 perdues** | 0 |
| A11 équité (A = 1 000, B = 1, C = 1 ; un lot) | 1 tenant servi | 3 |
| A12/A13 deux workers simultanés | **30/30 ids en commun** ; 60 traitements pour 50 | 0 commun ; 50 |
| A15 200 poisons | **200 en attente perpétuelle** | sortie explicite |
| A17/A19 10 000 à budget borné, jour sauté | **9 800 perdues sans état** | 0 |

(A14 « 200 poisons devant 50 saines » passe par hasard sur V9.1 : l'issue dépend de l'ordre physique.)

Charge réelle, **4 workers PostgreSQL parallèles**, 10 000 notifications créées sur 48 h dont 1 % de poisons
(`scripts/perf/hardening/push/charge_file_push.sh … avant`, `perf-hardening-v9-1/push_charge_10k_4w_avant.json`) :
**4 844 perdues ou bloquées**, **5 145 notifications saines traitées plus d'une fois** (10 627 traitements en double
— autant de doubles push sur les téléphones), poisons jamais sortis de la file.

### FIX — migration `20261003000101_push_file_durable_v1.sql` + route + `src/lib/push.ts`

Solution minimale, **sans Redis** : la table `notifications_utilisateurs` devient la file.

* 5 colonnes : `push_tentatives`, `push_reservee_jusqua` (bail), `push_reessai_apres`, `push_abandonnee_at`,
  `push_abandon_motif` (`tentatives_epuisees` | `expiree` | `expiree_avant_migration`) ; index partiel
  `notifications_push_file_idx (entreprise_id, created_at, id) where push_envoyee_at is null and push_abandonnee_at is null`.
* `push_reserver_lot_service(p_limite 100, p_par_entreprise 25, p_bail 300 s, p_max_tentatives 5, p_expiration 168 h)` :
  1. expiration **explicite** (> 7 jours → `expiree`, comptée) ; 2. poisons (tentatives épuisées) → `tentatives_epuisees` ;
  3. réservation : pour chaque tenant en attente, les `p_par_entreprise` plus anciennes **`FOR UPDATE SKIP LOCKED`**,
  puis rang 1 de chaque tenant d'abord (`row_number() over (partition by entreprise_id)`), `LIMIT p_limite`, bail
  `now() + 300 s`, `tentatives + 1` — dans **une** instruction.
* `push_reserver_notification_service(id)` : réservation unitaire du webhook (exclut cron et second webhook).
* `push_echec_notification_service(id)` : libère avec backoff 2, 4, 8, 16 min (plafond 6 h) ou abandon explicite.
* `push_preparer_notification_service` / `push_marquer_notification_envoyee_service` : mêmes signatures et droits ; ignorent
  les abandonnées / libèrent le bail. `push_file_etat_service()` : compteurs d'observabilité (aucune donnée personnelle).
* Arriéré : les notifications déjà hors de l'ancienne fenêtre (> 25 h, perdues pour l'ancien cron) sont marquées
  `expiree_avant_migration` au lieu d'être poussées en rafale au premier passage.
* Route : `maxDuration = 60`, boucle sur des lots de 100 (25 par tenant) jusqu'à file vide ou **budget de 45 s**
  (borne 500 lots), traitement par tranches de 8 en parallèle ; réponse = bilan (`traitees`, `envoyees`, `echecs`,
  `ignorees`, `lots`, `budget_epuise`).
* `traiterNotificationPush(admin, id, { dejaReservee })` : réserve d'abord (webhook) ; échec de lecture / exception /
  **tous** les appareils en échec transitoire → `push_echec_notification_service` (réessai) ; au moins un appareil servi
  → marquée (jamais de double push au réessai). Comportement inchangé pour préférence désactivée, aucun abonnement,
  VAPID absent (P2-14 non traité ici, voir § 6).
* Droits : EXECUTE à `service_role` seul (ni PUBLIC, ni anon, ni authenticated).

Choix écartés : Redis / file externe (inutile : PostgreSQL suffit au débit mesuré, ~1 900 notifications/s avec
4 workers) ; table de file séparée (duplication de la donnée et du cycle de vie) ; statut `processing` sans bail (un
worker mort bloquerait indéfiniment).

### GREEN_AFTER

* Contrat **19/19** (`push_contract_GREEN_after.txt`) : 50 → 10 000 sans perte, chaque notification traitée une fois,
  ordre, jour sans cron, équité (3 tenants dans un lot), deux workers disjoints (30 + 20), 200 poisons ne bloquent
  pas les 50 saines puis sortent explicitement, retry après échec transitoire, 10 000 à budget borné sur 12 jours
  (dont 1 sauté) sans perte ni doublon, aucune notification non envoyée sans état explicite.
* pgTAP CI `supabase/tests/push_file_durable_v1.test.sql` **19/19** (V9.1 : fonctions absentes → rouge) : droits,
  lot borné et équitable, ordre, non-re-réservation, webhook exclu, bail échu repris, marquage, backoff, poison,
  expiration tracée.
* Vitest : `src/lib/push.test.ts` (9) et `route.test.ts` (4) — boucle sur lots sans plafond de 200, comptage
  échecs / ignorées, 500 si la file est illisible, réservation webhook, réessai si tous les envois échouent, pas de
  réessai si un appareil a été servi.

### LOAD

| Banc | Résultat |
|---|---|
| 10 000 notifications, 4 workers parallèles, 1 % poisons (`push_charge_10k_4w_apres.json`) | **0 perdue, 0 doublon**, 100/100 poisons abandonnés après 5 tentatives (10 400 traitements = 9 900 + 5 × 100), 5,6 s, ~1 870 notifications/s |
| Endurance **30 min** : producteur ~20/s (1 % poisons), 1 worker webhook (réservation unitaire) en course avec 3 workers cron (`push_endurance_30min.json`) | 35 690 produites, 35 334 envoyées, **0 perdue ou bloquée, 0 notification saine traitée deux fois**, 356 / 356 poisons abandonnés ; 31 174 par le webhook, 5 940 rattrapées par le cron |

Note de banc : une première version du banc joignait le résultat de la réservation à la table **dans la même
instruction** ; l'instantané de lecture de la jointure, antérieur aux lignes tout juste réservées, les faisait
disparaître du lot (elles restaient réservées jusqu'à l'expiration du bail, puis étaient reprises : retard, pas de
perte). La route n'utilise que les ids rendus par la réservation : non concernée. Le banc a été corrigé de même.

### RLS_SECURITY

Aucune policy modifiée par P1-A. Les nouvelles fonctions sont `SECURITY DEFINER`, `search_path` figé,
`service_role` seul (vérifié par pgTAP). Observation hors périmètre : `authenticated` dispose d'un `UPDATE` de table
sur `notifications_utilisateurs` (policy `notifications_marquer_lue`, ses propres lignes) — un utilisateur peut
donc modifier les colonnes push de **ses** notifications (n'affecte que lui) ; c'était déjà le cas de
`push_envoyee_at`. À restreindre par grant de colonne dans un lot ACL.

### ROLLBACK

Script testé : `scripts/perf/hardening/rollback/rollback_20261003000101.sql`.

1. Revenir au code applicatif précédent (route, `push.ts`) **avant** de toucher la base.
2. Contenu :
   ```sql
   begin;
   drop function if exists public.push_reserver_lot_service(integer, integer, integer, integer, integer);
   drop function if exists public.push_reserver_notification_service(uuid, integer, integer);
   drop function if exists public.push_echec_notification_service(uuid, integer);
   drop function if exists public.push_file_etat_service();
   -- corps V9.1 de push_preparer_notification_service / push_marquer_notification_envoyee_service :
   -- rejouer la section A3 de 20261002001301_post_v9_service_role_fonctions_manquantes_v1.sql
   drop index if exists public.notifications_push_file_idx;
   alter table public.notifications_utilisateurs drop constraint if exists notifications_push_abandon_motif_check,
     drop column if exists push_tentatives, drop column if exists push_reservee_jusqua,
     drop column if exists push_reessai_apres, drop column if exists push_abandonnee_at,
     drop column if exists push_abandon_motif;
   commit;
   ```
   Les notifications abandonnées redeviennent « en attente » pour l'ancien cron, qui ne les sélectionnera de toute
   façon pas (hors fenêtre de 25 h).

## 2. P1-B — Relances automatiques : famine

### RED_BEFORE (V9.1, reproduit)

`relances_auto_candidats_service` : `LIMIT 200` **sans `ORDER BY` ni filtre d'éligibilité** ; l'éligibilité (nombre
max, délais, échéance, solde, e-mail, exclusions client) n'est évaluée qu'ensuite en TypeScript. La simulation
(session) faisait la même requête PostgREST.

Contrat `scripts/perf/hardening/tests/relances_auto_contract.test.sql` — **V9.1 : 10/16 rouges**
(`relances_contract_RED_before_v91.txt`) : 200 factures au maximum de relances évincent la facture saine (R1/R2),
idem 200 factures en attente de délai (R3), clients sans e-mail / exclus (R4), première relance due non atteinte
(R6), pas d'ordre (R8), 200 échecs fournisseur bloquent une facture jamais tentée (R9), 10 000 factures : candidats
au maximum dans le lot (R13), passages successifs : **1 003 factures dues jamais atteintes**, 1 400 resélections (R15/R16).

Charge par le **cron réel** (`traiterRelancesAutomatiques`, chemin de service, PostgREST + JWT `service_role`, Brevo
simulé) — 5 tenants × 2 000 factures = **10 000** : 60 % au maximum de relances, 20 % relancées la veille, 20 % dues
(`perf-hardening-v9-1/relances_charge_avant.json`) : passage 1 = 200 relances, passages 2 et 3 = **0** ;
**1 800 / 2 000 factures dues jamais relancées (90 %)**.

### FIX — migration `20261003000201_relances_auto_candidats_eligibles_v1.sql` + `src/lib/relances-moteur.ts`

* `relances_auto_candidats_selection(entreprise, type, limite)` — **SECURITY INVOKER** : pré-filtre SQL de tout ce que
  le moteur rejette de façon certaine aujourd'hui (statut, exclusions document/client, e-mail vide, échéance non
  dépassée, facture soldée, **nombre maximum de relances atteint**, **délai non écoulé** avec une marge d'1 h en
  faveur de l'éligibilité), puis **tri** : relance la plus due d'abord, une tentative récente (échec fournisseur,
  ignorée) repoussant le document derrière ceux jamais tentés → pas de famine par échecs répétés ; `LIMIT 200`
  appliqué **après** ce filtrage.
* `relances_auto_candidats_service` (signature et droits inchangés, `service_role` seul) l'enveloppe ; la simulation
  (session utilisateur, RLS) appelle la même sélection : **une seule règle de sélection** pour le cron et la simulation.
* Index `relances_documents_document_statut_idx (type_document, document_id, statut, date_envoi)`.
* Le moteur TypeScript reste **l'autorité** (pause, week-end, revalidation avant envoi, verrou `relance_reclamer`).
* Boucle infinie impossible : un passage = une liste bornée, évaluée une fois ; un document relancé sort de la
  sélection par le délai ; un document au maximum n'y revient jamais.

### GREEN_AFTER

* Contrat **16/16** (`relances_contract_GREEN_after.txt`) : famine (max, délai, e-mail, exclusion), dates (échéance
  future / du jour / première relance non due / due), soldée, ordre, fournisseur indisponible (rotation), replay le
  même jour, cloisonnement, 10 000 factures (lot plein de dues), passages successifs sans resélection.
* **Propriété « jamais un éligible écarté »** — `src/lib/relances-preselection.pg.test.ts` : population aléatoire
  (700 factures, 300 devis ; statuts, échéances, paiements, exclusions, e-mails vides / blancs, historiques 0–5,
  échecs fournisseur), **vrai moteur TypeScript** sur chaque document vs sélection SQL :
  factures **68 éligibles = 68 sélectionnées**, devis **38 = 38**, 0 manquant, 0 faux positif.
* pgTAP CI `supabase/tests/relances_auto_candidats_eligibles_v1.test.sql` **8/8** (V9.1 : rouge) ; témoin
  `post_v9_service_role_fonctions_v1` adapté (sa facture « candidate » n'avait pas d'échéance : jamais relançable par
  le moteur) — **57/57** avant comme après.

### LOAD

Cron réel, 10 000 factures, 5 tenants (`relances_charge_apres.json`) : passage 1 = **1 000** relances (200 par tenant),
passage 2 = 1 000, passage 3 = 0 → **2 000 / 2 000 dues atteintes**, 0 relance au-delà du maximum, 0 doublon le même
jour ; 15,7 s puis 12,1 s par passage (dominés par l'envoi simulé et les RPC par candidat).
Coût de la sélection SQL (une fois par entreprise et par type, au passage quotidien) :

| Tenant | Factures ouvertes | V9.1 (LIMIT sans filtre) | Après (filtre + tri) |
|---|---:|---:|---:|
| 50 000 factures | 18 869 | 5–7 ms | 90–100 ms (devis : 81 ms) |
| 100 000 factures | 37 492 | 5–11 ms | 234–243 ms (devis : 126 ms) |

Capacité (documentée, inchangée) : 200 candidats par type, par entreprise et par passage quotidien. Au-delà de
200 documents **réellement dus** le même jour, le reste part aux passages suivants, les plus dus d'abord.

### RLS_SECURITY

`relances_auto_candidats_selection` est `SECURITY INVOKER` (toutes ses lectures sont soumises à la RLS de
l'appelant) ; EXECUTE refusé à anon. pgTAP : une session de B n'obtient **aucun** candidat de A ; la session de A
obtient la même sélection que le cron. Le chemin de service reste `service_role` seul.

### ROLLBACK

Script testé : `scripts/perf/hardening/rollback/rollback_20261003000201.sql` :

```sql
begin;
-- corps V9.1 : rejouer la définition de relances_auto_candidats_service de la section A2 de
-- 20261002001301_post_v9_service_role_fonctions_manquantes_v1.sql, puis :
drop function if exists public.relances_auto_candidats_selection(uuid, text, integer);
drop index if exists public.relances_documents_document_statut_idx;
commit;
```
Revenir **avant** au code applicatif précédent (la simulation appelle `relances_auto_candidats_selection`).

## 3. P1-C — RLS évaluée ligne à ligne

### RED_BEFORE (V9.1, reproduit)

Les policies des tables métier appellent `est_membre_actif(entreprise_id)` et `a_permission(entreprise_id, '…')`
— `SECURITY DEFINER`, jamais inlinées — **pour chaque ligne examinée**, y compris les lignes qu'une lecture croisée
doit seulement rejeter, et y compris toutes les lignes **des autres tenants** pour une requête sans filtre
`entreprise_id` (la RLS est le seul filtre). Mesures V9.1 (rôle `authenticated`, `EXPLAIN ANALYZE`, 1k → 100k) dans le
tableau GREEN_AFTER ci-dessous (colonne « Avant ») : lecture croisée **vide** de 0,8 s (1k) à **77 s** (100k),
1 000 lignes propres 1,0–2,3 s, comptage / liste sans filtre 61 s puis > 120 s, 20 lecteurs PostgREST : 90 % d'échecs.

Inventaire : **157 tables** ont au moins une policy appelant `est_membre_actif` / `a_permission` / `peut_*`.
Tables retenues (chemins chauds mesurés : listes, comptages, lectures PostgREST directes, pages chantier, planning,
pointages, documents) : `devis`, `lignes_devis`, `factures`, `lignes_factures`, `clients`, `paiements`, `chantiers`,
`taches`, `pointages`, `sessions_pointage`, `affectations`, `documents_chantier`, `notifications_utilisateurs` —
**65 policies**. Les 144 autres tables ne sont **pas** modifiées (phase 2 éventuelle, table par table, avec le même
générateur et la même suite d'équivalence).

### FIX — migration `20261003000301_rls_ensembles_entreprises_autorisees_v1.sql`

Principe (celui du prototype du soak, durci) : calculer **une fois par requête** l'ensemble des entreprises
autorisées, puis tester l'appartenance de la ligne :

```sql
entreprise_id = ANY (ARRAY(SELECT public.entreprises_avec_permission('acces_devis')))   -- InitPlan, condition d'index
```

**Équivalence exacte par construction — aucune règle d'accès n'est réécrite** :

```
entreprises_membre_actif()          = { e ∈ C | est_membre_actif(e) }
entreprises_avec_permission(k)      = { e ∈ C | a_permission(e, k) }
entreprises_avec_une_permission(K)  = { e ∈ C | ∃ k ∈ K : a_permission(e, k) }
C = { entreprises où l'utilisateur a une ligne utilisateurs_entreprises } ∪ { entreprises où il a un accès support }
```

`est_membre_actif(e)` / `a_permission(e, k)` ne peuvent être vrais que pour `e ∈ C` (branche membre : ligne
`utilisateurs_entreprises` exigée ; branche support : ligne `plateforme_acces_entreprises` exigée). Filtrer `C` par la
fonction d'origine rend donc **exactement** l'ensemble où elle est vraie : session révoquée, accès support (actif,
expiré, terminé, rôle), suspension, essai expiré, suspension globale, statut du membre, permissions du poste — tout
reste évalué par les fonctions V9.1, et toute évolution future de ces fonctions est héritée automatiquement.

Fonctions par ligne à second argument (`peut_consulter_chantier(e, c)`, `peut_voir_document_chantier(id)`,
`peut_consulter_pointage_employe(e, s)`, `peut_consulter_affectation_employe(e, s)`) : même principe. Chacune est
décomposée en un **chemin rapide F** (permissions d'entreprise, ensemble ci-dessus) et un **petit ensemble de couples
candidats tirés des seules lignes de l'utilisateur** (ses fiches salarié, ses équipes, ses affectations), **filtré par
la fonction d'origine** — exact, et plus aucun appel ligne à ligne :

| Fonction d'origine P | Réécriture équivalente | Pourquoi exact |
|---|---|---|
| `peut_consulter_chantier(e, c)` | `M(e) ∧ (e a acces_chantiers ∨ gerer_chantiers ∨ (e, c) ∈ chantiers_assignes_consultables())` | P ⇒ M ; sa 3e branche exige une ligne `equipes_chantiers` ou `affectations` (e, c, fiche de l'utilisateur) : (e, c) est candidat, et le candidat n'est retenu que si P(e, c) |
| `peut_consulter_pointage_employe(e, s)` | `e a voir_pointages_equipe ∨ gerer_pointage ∨ valider_pointages ∨ (e, s) ∈ employes_du_compte_pointage_consultables()` | la branche personnelle exige une fiche salarié s de l'utilisateur dans e : candidate, retenue si P(e, s) |
| `peut_consulter_affectation_employe(e, s)` | idem avec gerer_planning ∨ voir_pointages_equipe ∨ voir_heures_chantiers | idem |
| `peut_voir_document_chantier(d)` | `M(e) ∧ (e a gerer_chantiers ∨ (d.chantier_id ∈ chantiers_equipes_du_compte() ∧ P(d)))` | la branche équipe exige une ligne `equipes_chantiers` sur ce chantier : repli d'origine **limité** aux documents des chantiers de ses équipes |

Une version intermédiaire (chemin rapide puis repli ligne à ligne sur la fonction d'origine) laissait un salarié sans
droit d'équipe à **31 s** pour un mois de pointages de son entreprise ; la version finale : **20 ms**.

`auth.uid()` → `(select auth.uid())` (même valeur, évaluée une fois). Noms, commandes, rôles et caractère
permissif / restrictif des policies **inchangés** (`ALTER POLICY` ne touche que les expressions).

Forme retenue : `= ANY (ARRAY(SELECT …))` plutôt que `IN (SELECT …)` du prototype : les deux sont calculés une fois
(InitPlan / SubPlan haché), mais seule la forme `ANY` devient une **condition d'index** sur `entreprise_id` — le coût
d'une requête ne dépend plus du nombre total de lignes de **tous** les tenants (mesuré sur la fixture : comptage
13,2 → 8,2 ms ; lecture croisée : 0 ligne lue).

Garde-fous de la migration :
* **garde V9.1** : avant toute modification, chaque policy est comparée (à blancs et parenthèses près) à son
  expression V9.1 attendue ; au moindre écart la migration échoue **sans rien modifier** (vérifié : rejouer la
  migration sur une base déjà migrée est refusé) ;
* SQL généré et relisible (`scripts/perf/hardening/rls/generer_policies.py` à partir du catalogue V9.1
  `policies_v91.json`), retour arrière généré en même temps (`rollback_20261003000301.sql`) ;
* **7 fonctions** `SECURITY DEFINER`, `search_path` figé, `STABLE` : mêmes droits que `est_membre_actif` /
  `a_permission` (EXECUTE `authenticated` ; ni PUBLIC, ni anon). Elles ne rendent que des identifiants d'entreprises
  / de fiches / de chantiers **de l'utilisateur courant** ;
* verrous des 13 tables pris d'un coup avec `lock_timeout` (voir « Déploiement »).

### GREEN_AFTER — performance (`EXPLAIN ANALYZE`, rôle `authenticated`, 1k → 100k)

Correction fonctionnelle : suite d'équivalence 54/54 (voir RLS_SECURITY). Performance :

Bases : V9.1 + `generate_fixture.sql` + 5 tenants volumétriques `volume_tenant.sql` (k = 11…15 : 1 000, 5 000,
20 000, 50 000, 100 000 devis **et** factures, autant de documents et tâches ; ~181 000 devis au total). Le tenant de
100 000 a été produit par `scripts/perf/hardening/volume_tenant_rapide.sql` : la génération standard a dépassé 3 h
(maintenance des totaux par trigger superlinéaire en volume : 107 Go lus pour les seules lignes de factures) ; la
variante insère les lignes sans les triggers de recalcul et fixe les totaux en une instruction — données
équivalentes pour la RLS. Mesures : `scripts/perf/hardening/rls/bench_explain.sh` (chauffe + médiane de 3 sous 5 s ;
`statement_timeout` 120 s), CSV bruts `perf-hardening-v9-1/rls_explain_avant.csv` / `rls_explain_apres.csv`.
Utilisateur = admin du tenant mesuré ; lecture croisée = admin du tenant 1k lisant le tenant mesuré.
Scénarios : `own_read_1000` = `?entreprise_id=eq.<propre>&limit=1000` ; `own_list_rls_only_50` = liste triée sans
filtre (la RLS seule borne le résultat) ; `own_count` = `count(*)` sans filtre ; `own_page_milieu_50` = page de 50 à
l'offset N/2 ; `cross_tenant_empty` = `?entreprise_id=eq.<autre>&limit=1000` (attendu : 0 ligne).

Conditions : les mesures « avant » 1k–50k ont été prises pendant la génération des volumes (CPU partagé) et sur une
base sans le tenant 100k ; les mesures « après » l'ont été sur la base complète (plus de lignes) : l'écart réel est
plutôt sous-estimé.

| Table | Scénario | Tenant | Avant (ms) | Après (ms) | Gain |
|---|---|---|---:|---:|---:|
| chantiers | own_count | 1k | 3 941 | 6.5 | ×606 |
| chantiers | own_count | 5k | 4 364 | 6.4 | ×682 |
| chantiers | own_count | 20k | 5 966 | 6.5 | ×918 |
| chantiers | own_count | 50k | 12 397 | 7.2 | ×1 722 |
| chantiers | own_count | 100k | 19 497 | 13.6 | ×1 434 |
| clients | cross_tenant_empty | 1k | 41.7 | 6.1 | ×7 |
| clients | cross_tenant_empty | 5k | 203 | 6.4 | ×32 |
| clients | cross_tenant_empty | 20k | 755 | 8.8 | ×86 |
| clients | cross_tenant_empty | 50k | 1 885 | 6.1 | ×309 |
| clients | cross_tenant_empty | 100k | 3 799 | 5.9 | ×644 |
| clients | own_count | 1k | 3 247 | 6.3 | ×515 |
| clients | own_count | 5k | 3 142 | 7.6 | ×413 |
| clients | own_count | 20k | 3 352 | 6.5 | ×516 |
| clients | own_count | 50k | 3 865 | 6.8 | ×568 |
| clients | own_count | 100k | 8 304 | 6.9 | ×1 204 |
| devis | cross_tenant_empty | 1k | 826 | 7.0 | ×118 |
| devis | cross_tenant_empty | 5k | 3 794 | 6.5 | ×584 |
| devis | cross_tenant_empty | 20k | 15 434 | 5.9 | ×2 616 |
| devis | cross_tenant_empty | 50k | 37 310 | 5.9 | ×6 324 |
| devis | cross_tenant_empty | 100k | 77 422 | 5.9 | ×13 122 |
| devis | own_count | 1k | 61 568 | 10.4 | ×5 920 |
| devis | own_count | 5k | 61 926 | 9.4 | ×6 588 |
| devis | own_count | 20k | 66 021 | 16.3 | ×4 050 |
| devis | own_count | 50k | 75 335 | 26.1 | ×2 886 |
| devis | own_count | 100k | > 120 000 (timeout) | 110 | > ×1 091 |
| devis | own_list_rls_only_50 | 1k | 61 709 | 10.5 | ×5 877 |
| devis | own_list_rls_only_50 | 5k | 62 162 | 9.5 | ×6 543 |
| devis | own_list_rls_only_50 | 20k | 66 638 | 21.8 | ×3 057 |
| devis | own_list_rls_only_50 | 50k | 75 287 | 37.2 | ×2 024 |
| devis | own_list_rls_only_50 | 100k | > 120 000 (timeout) | 124 | > ×970 |
| devis | own_page_milieu_50 | 1k | 1 117 | 7.4 | ×151 |
| devis | own_page_milieu_50 | 5k | 5 724 | 10.3 | ×556 |
| devis | own_page_milieu_50 | 20k | 23 104 | 23.8 | ×971 |
| devis | own_page_milieu_50 | 50k | 56 760 | 52.8 | ×1 075 |
| devis | own_page_milieu_50 | 100k | 112 222 | 164 | ×685 |
| devis | own_read_1000 | 1k | 1 074 | 6.6 | ×163 |
| devis | own_read_1000 | 5k | 1 076 | 6.9 | ×156 |
| devis | own_read_1000 | 20k | 1 187 | 7.0 | ×170 |
| devis | own_read_1000 | 50k | 1 096 | 6.8 | ×161 |
| devis | own_read_1000 | 100k | 2 344 | 6.8 | ×345 |
| documents_chantier | cross_tenant_empty | 1k | 522 | 4.8 | ×109 |
| documents_chantier | cross_tenant_empty | 5k | 2 572 | 5.0 | ×514 |
| documents_chantier | cross_tenant_empty | 20k | 10 586 | 4.3 | ×2 462 |
| documents_chantier | cross_tenant_empty | 50k | 28 298 | 4.1 | ×6 902 |
| documents_chantier | cross_tenant_empty | 100k | 55 116 | 4.2 | ×13 123 |
| documents_chantier | own_count | 1k | 41 972 | 7.5 | ×5 596 |
| documents_chantier | own_count | 5k | 46 564 | 8.4 | ×5 543 |
| documents_chantier | own_count | 20k | 58 523 | 14.0 | ×4 180 |
| documents_chantier | own_count | 50k | 91 227 | 20.3 | ×4 494 |
| documents_chantier | own_count | 100k | > 120 000 (timeout) | 34.6 | > ×3 468 |
| factures | cross_tenant_empty | 1k | 752 | 6.9 | ×109 |
| factures | cross_tenant_empty | 5k | 3 789 | 6.0 | ×631 |
| factures | cross_tenant_empty | 20k | 15 050 | 6.2 | ×2 427 |
| factures | cross_tenant_empty | 50k | 38 270 | 8.8 | ×4 349 |
| factures | cross_tenant_empty | 100k | 78 170 | 6.0 | ×13 028 |
| factures | own_count | 1k | 62 049 | 8.0 | ×7 756 |
| factures | own_count | 5k | 60 536 | 9.2 | ×6 580 |
| factures | own_count | 20k | 64 304 | 20.6 | ×3 122 |
| factures | own_count | 50k | 74 566 | 26.6 | ×2 803 |
| factures | own_count | 100k | > 120 000 (timeout) | 144 | > ×835 |
| factures | own_list_rls_only_50 | 1k | 58 800 | 6.8 | ×8 647 |
| factures | own_list_rls_only_50 | 5k | 59 391 | 9.6 | ×6 187 |
| factures | own_list_rls_only_50 | 20k | 64 334 | 20.1 | ×3 201 |
| factures | own_list_rls_only_50 | 50k | 73 646 | 46.5 | ×1 584 |
| factures | own_list_rls_only_50 | 100k | > 120 000 (timeout) | 172 | > ×697 |
| factures | own_page_milieu_50 | 1k | 1 137 | 6.7 | ×170 |
| factures | own_page_milieu_50 | 5k | 5 466 | 10.5 | ×521 |
| factures | own_page_milieu_50 | 20k | 22 826 | 23.1 | ×988 |
| factures | own_page_milieu_50 | 50k | 56 913 | 51.2 | ×1 112 |
| factures | own_page_milieu_50 | 100k | 114 412 | 177 | ×646 |
| factures | own_read_1000 | 1k | 1 025 | 6.5 | ×158 |
| factures | own_read_1000 | 5k | 1 002 | 8.3 | ×121 |
| factures | own_read_1000 | 20k | 1 098 | 6.6 | ×166 |
| factures | own_read_1000 | 50k | 1 056 | 6.9 | ×153 |
| factures | own_read_1000 | 100k | 1 082 | 7.8 | ×139 |
| notifications_utilisateurs | own_count | 1k | 68.2 | 4.4 | ×16 |
| notifications_utilisateurs | own_count | 5k | 268 | 4.7 | ×57 |
| notifications_utilisateurs | own_count | 20k | 1 100 | 5.5 | ×200 |
| notifications_utilisateurs | own_count | 50k | 2 787 | 7.5 | ×372 |
| notifications_utilisateurs | own_count | 100k | 5 953 | 12.4 | ×480 |
| taches | own_count | 1k | 8 265 | 349 | ×24 |
| taches | own_count | 5k | 9 747 | 332 | ×29 |
| taches | own_count | 20k | 14 835 | 343 | ×43 |
| taches | own_count | 50k | 58 250 | 335 | ×174 |
| taches | own_count | 100k | 56 321 | 376 | ×150 |
| taches | taches_d_un_chantier | 1k | 228 | 12.4 | ×18 |
| taches | taches_d_un_chantier | 5k | 255 | 12.6 | ×20 |
| taches | taches_d_un_chantier | 20k | 217 | 12.2 | ×18 |
| taches | taches_d_un_chantier | 50k | 976 | 11.7 | ×83 |
| taches | taches_d_un_chantier | 100k | 246 | 12.1 | ×20 |

Lecture :
* **Avant**, le coût suit le nombre de lignes **examinées**, de **tous** les tenants pour une requête sans filtre :
  1 000 devis propres ≈ 1,1–2,3 s ; lecture croisée **vide** 0,8 s (1k) → **77 s (100k)** ; liste / comptage sans
  filtre 61 s dès 1k (la table entière est parcourue) puis > 120 s ; 20 lecteurs PostgREST → files 504.
* **Après**, l'ensemble autorisé est calculé une fois (InitPlan ≈ 5–6 ms, plancher de toutes les requêtes) puis sert
  de condition d'index : lecture croisée **constante ≈ 6 ms et 0 ligne lue** quel que soit le volume ; 1 000 lignes
  propres ≈ 7 ms ; comptage / liste / page au milieu proportionnels aux seules lignes **du tenant** (110–177 ms à 100k).
* Résidu `taches` (`own_count` ≈ 0,3–0,4 s) : la table n'a pas d'`entreprise_id` ; un comptage sans filtre parcourt
  les tâches de tous les tenants (≈ 3 µs/ligne au lieu de ≈ 0,5 ms). L'application lit les tâches par `chantier_id`
  (index, § 4) : 12 ms. Dénormaliser `entreprise_id` sur `taches` relève d'un lot ultérieur.

#### Pointages / planning (rôles restreints)

`scripts/perf/hardening/rls/bench_pointages.sh` — tenant A de la fixture (~52 000 pointages), CSV
`perf-hardening-v9-1/bench_pointages_*.csv` :

| Scénario | Profil | Avant (ms) | Après (ms) |
|---|---|---:|---:|
| `count(*)` pointages | gestionnaire | > 120 000 (timeout) | 15,7 |
| mois filtré (500 lignes) | gestionnaire | 7 383 | 4,5 |
| liste sans filtre (50) | gestionnaire | > 120 000 | 49,1 |
| `count(*)` pointages | **salarié** (sans droit d'équipe : branche « ses propres pointages ») | > 120 000 | 42,3 |
| mois filtré (37 lignes visibles) | salarié | 15 860 | 19,8 |
| liste sans filtre (50) | salarié | > 120 000 | 42,1 |
| mois filtré | lecture croisée (autre tenant) | 12 733 | 2,4 |
| liste sans filtre | lecture croisée | > 120 000 | 12,1 |

Le profil salarié est celui qui justifie les ensembles candidats exacts (FIX) : avec un simple chemin rapide + repli,
il restait à 31 s (mesuré sur une version intermédiaire) car `peut_consulter_pointage_employe` était appelée pour
chaque pointage de ses collègues.

### LOAD — charge PostgREST réelle (JWT signés, RLS, contrôle de fuite sur chaque ligne)

`scripts/perf/hardening/rls/charge_postgrest.mjs`, PostgREST v12.2.3 (`db-pool = 10`, `max-rows = 1000`),
JSON bruts dans `perf-hardening-v9-1/`.

| Banc | Avant (V9.1) | Après |
|---|---|---|
| Lecteurs concurrents, tenant 50k — 1 / 5 / 10 / 20 VU (débit ; p50 / p95) | 0,8 / 1,6 / 1,2 / 1,9 req/s ; p50 1,2 s → 10 s ; **52 / 58 requêtes en échec** à 20 VU (délai 60 s) | 139 / 275 / 346 / 180 req/s ; p50 6 / 11 / 16 / 95 ms ; p95 ≤ 250 ms ; **0 erreur** |
| Lecteurs concurrents, tenant 100k — 1 / 5 / 10 / 20 VU | — (pas mesurable utilement) | 127 / 289 / 319 / 131 req/s ; p50 7 / 11 / 16 / 148 ms ; 0 erreur (20 VU : pool de 10 + 4 vCPU partagés avec le banc V9.1) |
| Multi-tenant entrelacé (listes, filtres, pages, comptages, lectures croisées) | 300 requêtes, 10 clients, 4 tenants : 898 s, 0,3 req/s, p50 20 s, **147 / 300 en échec** (55 × 504, 92 délais), 0 fuite | **3 000** requêtes, 4 tenants : 402 req/s, p50 20 ms, p95 58 ms ; **3 000** requêtes, 5 tenants dont 100k : 221 req/s, p95 193 ms — **0 erreur, 0 fuite, 0 lecture croisée non vide** |
| Endurance 30 min, 10 clients, 4 tenants | — | **949 546** requêtes, 527 req/s, p50 15 ms / p95 46 ms **stables minute par minute** (30 fenêtres : p95 45–49 ms), 0 erreur, **0 fuite** |

Observation (V9.1) : une requête abandonnée par le client continue côté serveur (aucun `statement_timeout` versionné) ;
pendant le banc « avant », des requêtes PostgREST tournaient encore plusieurs minutes après l'abandon et dégradaient
toute la base — c'est l'amplification P1-2 du soak.

#### Déploiement (application sous trafic)

Appliquer la migration table par table **sous trafic** a provoqué en banc un **interblocage** (lecture PostgREST en
cours ↔ `ALTER POLICY`) : transaction annulée en entier, aucun effet, mais migration en échec. Version finale : les
13 verrous `ACCESS EXCLUSIVE` sont pris d'un coup, dans un ordre fixe, avec `lock_timeout = 10 s` ; appliquée sous
charge PostgREST : 0,14 s. Sous la RLS V9.1, des lectures de plusieurs secondes peuvent faire expirer ce délai : la
migration échoue alors proprement et se rejoue (constaté en banc tant que des requêtes lentes V9.1 étaient en cours).
Recommandation : appliquer en heure creuse, rejouer en cas de `lock timeout`. Durées mesurées sur la base complète :
`…0101` 0,26 s, `…0201` 0,07 s, `…0301` 0,12 s, `…0401` 0,22 s.


### RLS_SECURITY — contre-épreuves

`supabase/tests/rls_ensembles_entreprises_equivalence_v1.test.sql` (généré par
`scripts/perf/hardening/rls/generer_test_equivalence.py`, **54/54**) — **18 contextes** : admin A, ouvrier A
(`voir_chantiers_assignes`), chef d'équipe A, conducteur A, comptable A, admin B, ouvrier B, **multi-entreprise**
(ouvrier dans A + comptable dans B), **support** actif sur A + accès terminé sur C, **support expiré** sur B,
**plateforme** (rôle total) sans accès, membre d'entreprise **suspendue**, d'entreprise en **essai expiré**
(entitlement d'abonnement), en **suspension globale**, en **suspension seulement prévue**, membre **en pause**,
**ancien salarié** (fiche « sortie », encore membre, avec équipe et affectation du jour), **session révoquée**,
**anonyme** ; entreprise C **sans aucun membre** ; données dans les 13 tables pour A…G, affectation du jour sur un
chantier non assigné, équipe échue, document réservé à l'encadrement. (Les 13 tables ne dépendent d'aucune
fonction d'entitlement par application ; l'entitlement d'abonnement passe par `est_membre_actif`, couvert.)

* **E0** — plus aucune des 65 policies n'appelle `est_membre_actif` / `a_permission` ligne à ligne.
* **E1** — pour chaque contexte, chacune des 65 policies : prédicat `USING` et `WITH CHECK` V9.1 (embarqué) contre le
  prédicat installé, **ligne à ligne** sur toutes les lignes des 13 tables : **0 écart** (18/18).
* **E2** — lignes **réellement visibles** sous RLS (rôle `authenticated` / `anon`) dans les 13 tables, empreinte md5
  des ids, **avant** (policies V9.1 restaurées dans la transaction) et **après** : **identiques** (18/18). Couvre les
  sous-requêtes de policies elles-mêmes soumises à la RLS (taches → chantiers, paiements → factures).
* **E3** — témoins non vacuitaires : admin A voit ses données ; multi-entreprise voit les factures de B et aucune de A,
  aucun client ; l'ouvrier ne voit que son chantier assigné ; l'affectation du jour ouvre le chantier ; le document
  d'encadrement est réservé au chef d'équipe ; l'ancien salarié ne voit ni chantier, ni pointage, ni affectation ;
  aucune ligne pour suspendue / essai expiré / suspension globale / session révoquée / membre en pause / plateforme
  sans accès / support expiré / anonyme ; suspension future encore accessible ; support = exactement A.
* **E4** — écritures inter-tenant : B ne crée pas de devis dans A (42501), ne modifie aucun client de A, ne supprime
  aucune facture de A ; crée bien dans B.
* **Mutations** (la suite doit échouer — `perf-hardening-v9-1/rls_mutations.txt`) :

  | Mutant | Échecs |
  |---|---:|
  | policy restrictive `devis` affaiblie (permission retirée) | 10 |
  | chemin rapide `chantiers` avec la mauvaise permission (`acces_planning`) | 1 |
  | `entreprises_membre_actif` sans support ni contrôle de suspension | 17 |
  | `chantiers_assignes_consultables` sans filtre par la fonction d'origine | 6 |
  | `employes_du_compte_pointage_consultables` sans filtre | 1 |
  | documents : repli d'origine supprimé | 3 |

* Charge PostgREST : contrôle de **chaque** ligne de **chaque** réponse (≈ 955 000 requêtes) : **0 fuite**.

### ROLLBACK

`scripts/perf/hardening/rollback/rollback_20261003000301.sql` (généré) : mêmes verrous groupés, rétablit les 65
expressions V9.1 exactes puis supprime les 7 fonctions. **Testé** : après retour arrière des 4 migrations, le
catalogue (6 088 objets : fonctions et leurs droits, policies, index, colonnes) est **identique** à V9.1. Aucune
donnée touchée ; aucun changement applicatif associé.

## 4. Index `taches(chantier_id, created_at)`

Migration `20261003000401_taches_chantier_created_idx_v1.sql` — **reproduit et confirmé sur V9.1** (bases volumétriques,
106 241 et 231 231 tâches, chantier de 18 tâches, `scripts/perf/hardening/index/taches_chantier.sh`, transactions annulées,
`perf-hardening-v9-1/index_taches_chantier_k14.txt`, `…_k15.txt`) :

| Mesure | Sans index | Avec index |
|---|---:|---:|
| Requête de la page chantier, sans RLS (effet de l'index seul) — 106 241 tâches | 24,4 ms — `Seq Scan` | **0,1 ms** — `Bitmap Heap Scan` |
| idem — 231 231 tâches (base avec le tenant 100k) | 13,4 ms | **0,1 ms** |
| Même requête sous RLS V9.1 (rôle authenticated), 106k / 231k | 394 / 260 ms — `Seq Scan` | 192 / 92 ms (le reste = RLS ligne à ligne V9.1) |
| Même requête, RLS P1-C + index (base « après »), 1k → 100k | 228–976 ms (V9.1) | **11,9–16,7 ms** |
| 5 000 insertions de tâches (médiane de 3), 106k / 231k | 74 / 74 ms | 70 / 74 ms (coût d'écriture non mesurable) |
| Taille | — | **1 032 kB** (table 17 Mo) ; **2 280 kB** (table 31 Mo) |

Le soak mesurait 570 → 63 ms sous charge ; l'ordre de grandeur est confirmé (le seq scan parcourt les tâches de
**tous** les tenants). Index aussi utile à la clé étrangère `taches.chantier_id` (suppression d'un chantier) et à
la policy de `taches`. Création non `CONCURRENTLY` (migration transactionnelle) : verrou `SHARE` bref, lectures non
bloquées. Retour arrière : `drop index if exists public.taches_chantier_created_idx;`.

## 5. Tests de charge — synthèse

| Exigence | Banc | Résultat |
|---|---|---|
| Push ≥ 10 000 | 10 000 notifications, 4 workers parallèles, 1 % poisons | **0 perte, 0 doublon**, 100 % des poisons sortis explicitement |
| Relances ≥ 10 000 | cron réel, 10 000 factures, 5 tenants | **2 000 / 2 000** dues atteintes, 0 dépassement, 0 doublon |
| RLS 100 000 lignes | tenant de 100 000 devis / factures (+ 1k, 5k, 20k, 50k) | § 3 GREEN_AFTER : lecture croisée 77 s → 5,9 ms ; 1 000 lignes propres 2,3 s → 6,8 ms ; comptage > 120 s → 110 ms |
| Long run ≥ 30 min | push : 30 min producteur + webhook + 3 crons ; PostgREST : 30 min, 10 clients, 4 tenants | push : 35 690 notifications, 0 perte, 0 doublon ; PostgREST : 949 546 requêtes, p95 stable 45–49 ms, 0 erreur, 0 fuite |
| Multi-tenant ≥ 1 500 requêtes entrelacées | 3 000 requêtes, 10 clients, 4 tenants, listes / filtres / pages / comptages / lectures croisées | **0 fuite**, 0 lecture croisée non vide, 0 erreur ; 402 req/s (4 tenants), 221 req/s (5 tenants dont 100k) |
| Aucune fuite | contrôle de chaque ligne de chaque réponse (charge, endurance) + suite d'équivalence 54/54 | **0** |

## 6. P2 documentés (non traités — autres lots)

Aucun correctif P1 ne les modifie directement ; constats du soak (`ELSATIA_SOAK_PERFORMANCE_V1.md`) rappelés pour
traçabilité :

| Sujet | Constat soak | Effet de ce lot |
|---|---|---|
| `/employes` | 32 Mo de HTML à 500 salariés (droits rendus inline), RSS serveur 2,7 Go | aucun (rendu applicatif) |
| `/planning` | 8 Mo de HTML à 500 salariés, 504 à 20 lecteurs | indirect : les lectures `affectations` / `pointages` sous RLS deviennent ensemblistes (§ 3) ; la taille de page reste |
| Pointages 56 h | régularisation sans contrôle de chevauchement ni plafond journalier (56 h/jour acceptées) | aucun |
| PDF 502 après quota | le PDF authentifié consomme le quota `/imprimer` (30/min) → 502 au lieu de 429, Chromium lancé pour rien | aucun |
| Double paiement | pas de clé d'idempotence (double clic = 2 paiements, borné au reste dû) | aucun |
| Création d'entreprise sérialisée | compteur global `next_reference(null, 'entreprise')` tenu jusqu'au commit | aucun |
| Push sans VAPID | notifications consommées sans envoi (P2-14) | comportement **inchangé** (marquée envoyée) — volontairement hors lot |
| `statement_timeout` non versionné | amplification RLS bornée seulement par la plateforme | la cause (coût par ligne) est corrigée sur les 13 tables ; la borne reste à versionner (observé en banc : requêtes PostgREST V9.1 poursuivies côté serveur après abandon du client) |

## 7. Résumé des livrables

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20261003000101_push_file_durable_v1.sql` | P1-A file durable |
| `supabase/migrations/20261003000201_relances_auto_candidats_eligibles_v1.sql` | P1-B sélection |
| `supabase/migrations/20261003000301_rls_ensembles_entreprises_autorisees_v1.sql` | P1-C RLS (65 policies, 7 fonctions, garde, verrous groupés) |
| `supabase/migrations/20261003000401_taches_chantier_created_idx_v1.sql` | index |
| `src/app/api/cron/notifications-push/route.ts`, `src/lib/push.ts` (+ tests) | boucle de lots, réservation, réessai |
| `src/lib/relances-moteur.ts`, `src/lib/relances-preselection.pg.test.ts` | sélection unique cron / simulation, propriété |
| `supabase/tests/push_file_durable_v1.test.sql`, `relances_auto_candidats_eligibles_v1.test.sql`, `rls_ensembles_entreprises_equivalence_v1.test.sql` | pgTAP CI |
| `scripts/perf/hardening/` | contrats avant/après, bancs (push, relances, RLS EXPLAIN, PostgREST, pointages, index), générateurs, retours arrière |
| `docs/qualification/perf-hardening-v9-1/` | preuves brutes |

## 8. Rejouer

```bash
service postgresql start; apt-get install -y postgresql-16-pgtap bc; npm ci
scripts/local-postgres-bootstrap/rebuild_db.sh v91              # 395 migrations (391 V9.1 + 4)
su postgres -c "psql -d <base_v91> -f scripts/perf/generate_fixture.sql"
su postgres -c "pg_prove -d <base> scripts/perf/hardening/tests/push_file_contract.test.sql"      # rouge V9.1 / vert après
su postgres -c "pg_prove -d <base> scripts/perf/hardening/tests/relances_auto_contract.test.sql"
scripts/qualification/pgtap-run-v3.sh <base_migrée> "rls_ensembles*" "push_file*" "relances_auto_cand*"
scripts/perf/hardening/push/charge_file_push.sh <base> 10000 4 apres
scripts/perf/hardening/push/endurance_file_push.sh <base> 1800 3
su postgres -c "psql -d <base> -v k=15 -v n=100000 -v e=20 -v jours=0 -f scripts/perf/hardening/volume_tenant.sql"
scripts/perf/hardening/rls/bench_explain.sh <base> apres 11 12 13 14 15
POSTGREST_BUILD_DIR=/tmp/pgrst scripts/perf/postgrest_local.sh <base> 3201
node scripts/perf/hardening/rls/charge_postgrest.mjs http://localhost:3201 <secret> multitenant 3000 10 11,12,13,14,15
HARDENING_PG_DB=<base> npx vitest run src/lib/relances-preselection.pg.test.ts
CHARGE_URL=<proxy supabase local> CHARGE_DB=<base> npx vitest run --config scripts/perf/hardening/relances/vitest.config.ts
```

## 9. Limites, risques résiduels et suites

* **RLS — périmètre** : 13 tables / 65 policies sur 157 tables concernées. Les autres gardent l'évaluation ligne à
  ligne (correcte, plus lente) ; même générateur + même suite d'équivalence pour une phase 2 table par table.
* **RLS — `taches`** : pas d'`entreprise_id` → comptage sans filtre ≈ 0,3–0,4 s (toutes les tâches de tous les
  tenants parcourues, à ≈ 3 µs/ligne). Dénormalisation à décider dans un lot de schéma.
* **RLS — documents** : repli `peut_voir_document_chantier` conservé pour les seuls documents des chantiers des
  équipes de l'utilisateur (non mesurable au volume testé, borné par ce périmètre).
* **Déploiement de `…0301`** : verrou `ACCESS EXCLUSIVE` des 13 tables le temps de la transaction (≈ 0,1 s) ; sous la
  RLS V9.1, une lecture lente en cours peut faire expirer `lock_timeout` (10 s) → échec propre, à rejouer ; appliquer
  en heure creuse.
* **Push** : un appareil servi puis un marquage en échec (base indisponible à cet instant précis) ⇒ notification
  retentée à l'expiration du bail (double push possible dans ce seul cas). Sans VAPID : comportement V9.1 conservé
  (P2-14). Débit de la route : ~45 s de budget par passage quotidien (≈ 20 000+ notifications au débit mesuré) ; le
  surplus reste en file, rien n'expire avant 7 jours.
* **Relances** : plafond de 200 documents dus par type, par entreprise et par passage quotidien (inchangé, documenté) ;
  la sélection coûte ≈ 0,2 s pour 37 000 factures ouvertes.
* **Mesures** : conteneur 4 vCPU partagé (génération, pgTAP, bancs) ; PostgreSQL 16 (production : 17) ; PostgREST
  `db-pool = 10` ; pas de `statement_timeout` local (Supabase hébergé en applique un par rôle) ; tenant 100k produit
  par la variante rapide du générateur.
* **Observation hors lot** : `authenticated` a un `UPDATE` de table sur `notifications_utilisateurs` (ses lignes) : il
  peut modifier les colonnes push de ses propres notifications. À restreindre par grant de colonne (lot ACL).
