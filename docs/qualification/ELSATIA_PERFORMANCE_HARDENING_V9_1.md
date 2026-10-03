PUSH_LOSS_BEFORE=9800/10000 (contrat A7 : 2 passages quotidiens, N=10 000) ; 4844/10000 en charge 4 workers (+ 5145 notifications poussées plusieurs fois)
PUSH_LOSS_AFTER=0 (contrat 50→10 000, charge 10 000 × 4 workers, endurance 30 min)

REMINDER_STARVATION_BEFORE=1800/2000 factures dues jamais relancées (90 %, cron réel, 10 000 factures, 5 tenants, 3 passages)
REMINDER_STARVATION_AFTER=0/2000 (toutes atteintes en 2 passages)

RLS_OWN_TENANT_BEFORE=@@RLS_OWN_BEFORE@@
RLS_OWN_TENANT_AFTER=@@RLS_OWN_AFTER@@

RLS_CROSS_TENANT_BEFORE=@@RLS_CROSS_BEFORE@@
RLS_CROSS_TENANT_AFTER=@@RLS_CROSS_AFTER@@

VERDICT=@@VERDICT@@

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

@@VERDICT_TEXTE@@

| P1 | RED_BEFORE (V9.1) | GREEN_AFTER | LOAD | RLS_SECURITY | ROLLBACK |
|---|---|---|---|---|---|
| **A — push** | contrat 12/19 rouges ; 9 800 / 10 000 perdues ; 4 workers : 4 844 perdues, 5 145 doubles push | contrat 19/19 ; pgTAP CI 19/19 ; Vitest 13 | 10 000 × 4 workers : 0 perte, 0 doublon ; 30 min : 35 690 notifications, 0 perte, 0 doublon | aucune policy touchée ; fonctions `service_role` seul | script testé (schéma = V9.1) |
| **B — relances** | contrat 10/16 rouges ; cron réel : 1 800 / 2 000 dues jamais relancées | contrat 16/16 ; propriété moteur réel : 0 éligible écarté ; pgTAP CI 8/8 | cron réel 10 000 factures : 2 000 / 2 000 atteintes, 0 doublon, 0 dépassement | sélection SECURITY INVOKER (RLS de la session) | script testé (schéma = V9.1) |
| **C — RLS** | @@C_RED@@ | équivalence 54/54 (17+1 contextes), 6 mutations détectées | @@C_LOAD@@ | 0 écart ligne à ligne, 0 fuite en charge | script testé (policies = V9.1 à l'octet) |

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

1. Revenir au code applicatif précédent (route, `push.ts`) **avant** de toucher la base.
2. ```sql
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
Sélection SQL sur le tenant de 100 000 factures : @@RELANCES_SELECTION_100K@@.

Capacité (documentée, inchangée) : 200 candidats par type, par entreprise et par passage quotidien. Au-delà de
200 documents **réellement dus** le même jour, le reste part aux passages suivants, les plus dus d'abord.

### RLS_SECURITY

`relances_auto_candidats_selection` est `SECURITY INVOKER` (toutes ses lectures sont soumises à la RLS de
l'appelant) ; EXECUTE refusé à anon. pgTAP : une session de B n'obtient **aucun** candidat de A ; la session de A
obtient la même sélection que le cron. Le chemin de service reste `service_role` seul.

### ROLLBACK

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
`entreprise_id` (la RLS est le seul filtre). Mesures V9.1 (rôle `authenticated`, `EXPLAIN ANALYZE`) au § 3.4.

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

Fonctions à second argument (`peut_consulter_chantier(e, c)`, `peut_voir_document_chantier(id)`,
`peut_consulter_pointage_employe(e, s)`, `peut_consulter_affectation_employe(e, s)`) : elles **restent l'autorité**,
précédées d'un chemin rapide `F` dont la vérité implique la leur (`F ⇒ P`, donc `P ≡ F ∨ P`) et, quand `P ⇒ membre`,
d'une garde d'appartenance (`P ≡ M ∧ (F ∨ P)`) qui rejette **sans appel de fonction** toute ligne d'un autre tenant :

| Fonction | Chemin rapide F | Garde M |
|---|---|---|
| `peut_consulter_chantier` | `acces_chantiers` ou `gerer_chantiers` | oui |
| `peut_voir_document_chantier` | `gerer_chantiers` | oui |
| `peut_consulter_pointage_employe` | `voir_pointages_equipe`, `gerer_pointage` ou `valider_pointages` | non (la policy permissive `membres` l'impose déjà) |
| `peut_consulter_affectation_employe` | `gerer_planning`, `voir_pointages_equipe` ou `voir_heures_chantiers` | idem |

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
* fonctions : mêmes droits que `est_membre_actif` / `a_permission` (EXECUTE `authenticated` ; ni PUBLIC, ni anon).

### RLS_SECURITY — contre-épreuves

`supabase/tests/rls_ensembles_entreprises_equivalence_v1.test.sql` (généré, **50/50**) — 17 contextes : admin A,
ouvrier A (`voir_chantiers_assignes`), chef d'équipe A, conducteur A, comptable A, admin B, ouvrier B,
**multi-entreprise** (ouvrier dans A + comptable dans B), **support** actif sur A + accès terminé sur C, **support
expiré** sur B, **plateforme** (rôle total) sans accès, membre d'entreprise **suspendue**, d'entreprise en **essai
expiré**, en **suspension globale**, en **suspension seulement prévue**, membre **en pause**, **session révoquée**,
**anonyme** ; entreprise C **sans aucun membre** ; données dans les 13 tables pour A, B, C, D, E, F, G.

* **E1** — pour chaque contexte, chacune des 65 policies : prédicat `USING` et `WITH CHECK` V9.1 (embarqué) contre le
  prédicat installé, **ligne à ligne** sur toutes les lignes des 13 tables : **0 écart** (17/17).
* **E2** — lignes **réellement visibles** sous RLS (rôle `authenticated` / `anon`) dans les 13 tables, empreinte md5
  des ids, **avant** (policies V9.1 restaurées dans la transaction) et **après** : **identiques** (17/17). Couvre les
  sous-requêtes de policies elles-mêmes soumises à la RLS (taches → chantiers, paiements → factures).
* **E3** — témoins non vacuitaires : admin A voit ses données, multi-entreprise voit les factures de B et aucune de A,
  l'ouvrier ne voit que son chantier assigné (chemin lent conservé), aucune ligne pour suspendue / essai expiré /
  suspension globale / session révoquée / membre en pause / plateforme sans accès / support expiré / anonyme,
  suspension future encore accessible, support = exactement A.
* **E4** — écritures inter-tenant : B ne crée pas de devis dans A (42501), ne modifie aucun client de A, ne supprime
  aucune facture de A ; crée bien dans B.
* **Mutations** (la suite doit échouer) : policy restrictive affaiblie (permission retirée) → **10 échecs** ; chemin
  rapide avec la mauvaise permission (`acces_planning`) → **1 échec** (E1 chef d'équipe) ; fonction d'ensemble sans
  accès support ni contrôle de suspension → **15 échecs** (`perf-hardening-v9-1/rls_mutations.txt`).
* Charge multi-tenant PostgREST (§ 3.5) : contrôle de **chaque** ligne de **chaque** réponse.

### ROLLBACK

`scripts/perf/hardening/rls/rollback_20261003000301.sql` : rétablit les 65 expressions V9.1 exactes puis supprime les
3 fonctions. Aucune donnée touchée ; aucun changement applicatif associé.

@@RLS_MESURES@@

## 4. Index `taches(chantier_id, created_at)`

Migration `20261003000401_taches_chantier_created_idx_v1.sql` — **reproduit et confirmé sur V9.1** (base volumétrique,
106 241 tâches, chantier de 18 tâches, `scripts/perf/hardening/index/taches_chantier.sh`, transactions annulées,
`perf-hardening-v9-1/index_taches_chantier_k14.txt`) :

| Mesure | Sans index | Avec index |
|---|---:|---:|
| Requête de la page chantier, sans RLS (effet de l'index seul) | 24,4 ms — `Seq Scan` | **0,1 ms** — `Bitmap Heap Scan` |
| Même requête sous RLS V9.1 (rôle authenticated) | 394 ms — `Seq Scan` | 192 ms — `Index Scan` (le reste = RLS ligne à ligne V9.1) |
| Même requête, RLS P1-C + index (base « après ») | — | **@@TACHES_CHANTIER_APRES@@** |
| 5 000 insertions de tâches (médiane de 3) | 74 ms | 70 ms (bruit : coût d'écriture non mesurable) |
| Taille | — | **1 032 kB** (table 17 Mo) |

Le soak mesurait 570 → 63 ms sous charge ; l'ordre de grandeur est confirmé (le seq scan parcourt les tâches de
**tous** les tenants). Index aussi utile à la clé étrangère `taches.chantier_id` (suppression d'un chantier) et à
la policy de `taches`. Création non `CONCURRENTLY` (migration transactionnelle) : verrou `SHARE` bref, lectures non
bloquées. Retour arrière : `drop index if exists public.taches_chantier_created_idx;`.

## 5. Tests de charge — synthèse

| Exigence | Banc | Résultat |
|---|---|---|
| Push ≥ 10 000 | 10 000 notifications, 4 workers parallèles, 1 % poisons | **0 perte, 0 doublon**, 100 % des poisons sortis explicitement |
| Relances ≥ 10 000 | cron réel, 10 000 factures, 5 tenants | **2 000 / 2 000** dues atteintes, 0 dépassement, 0 doublon |
| RLS 100 000 lignes | tenant de 100 000 devis / factures (+ 1k, 5k, 20k, 50k) | § 3.4 |
| Long run ≥ 30 min | push : 30 min producteur + webhook + 3 crons ; PostgREST : 30 min, 10 clients, 4 tenants | @@LONG_RUN@@ |
| Multi-tenant ≥ 1 500 requêtes entrelacées | 3 000 requêtes, 10 clients, 4 tenants, listes / filtres / pages / comptages / lectures croisées | **0 fuite**, 0 lecture croisée non vide, 0 erreur ; @@MULTI_RPS@@ |
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

