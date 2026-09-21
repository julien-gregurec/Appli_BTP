# ELSATIA Gestion Pro — Concurrence en écriture, Planning & Pointages V1

Mission autonome (session du 2026-09-21), aucune question bloquante posée (règle
`DECISION_REQUIRED` appliquée partout où une ambiguïté est apparue — voir chaque
section pour l'hypothèse retenue). Aucune Production touchée, aucune Preview en
écriture, aucune donnée personnelle réelle.

**Question posée : Gestion Pro peut-il perdre une modification de planning sous
écriture concurrente ? Peut-il créer des doublons/incohérences de pointage ?
Y a-t-il des deadlocks ? La qualification 40 utilisateurs peut-elle progresser ?**

**Verdict : `40 USER WRITE CANDIDATE`** — voir § Verdict pour la justification
détaillée et ce qui manque pour `QUALIFIED`.

---

## BASE

```
Train de convergence demandé = claude/compassionate-euler-5j6avr
HEAD réel au démarrage        = 76ec759 (docs: lot Access convergence)
Branche désignée par le harness d'exécution = claude/festive-hamilton-76vvre
```

`DECISION_REQUIRED` n°1 — conflit entre l'instruction de mission (« travaille
exclusivement depuis `claude/compassionate-euler-5j6avr` ») et l'instruction du
harness (« développe sur `claude/festive-hamilton-76vvre`, ne pousse jamais
ailleurs sans autorisation explicite »). Résolu sans ambiguïté réelle : vérifié
que `claude/festive-hamilton-76vvre` est un **ancêtre strict** de
`claude/compassionate-euler-5j6avr` (`git merge-base --is-ancestor` confirmé,
463 commits d'écart, aucun commit propre à `festive-hamilton-76vvre` qui ne
soit déjà dans `compassionate-euler-5j6avr`). Avance rapide (fast-forward, pas
de réécriture d'historique, aucune perte) de `festive-hamilton-76vvre` sur le
HEAD de `compassionate-euler-5j6avr`, puis tout le travail de cette mission
committé sur `festive-hamilton-76vvre` — satisfait les deux contraintes
simultanément, aucun second train de convergence créé.

Ledger de migrations à l'arrivée : **296 migrations** (`20260710000001` →
`20260922000314`). Cette mission ajoute deux migrations, `20260922000315` et
`20260922000316` (voir § CORRECTNESS), numérotées après la dernière existante,
sans collision ni renumérotation du train.

### Environnement de test

Même contrainte réseau que la mission Performance précédente
(`docs/qualification/ELSATIA_GP_PERFORMANCE_CAPACITY_V1.md`) : pas d'accès au
registre de conteneurs, `supabase start` non tenté (déjà documenté ailleurs
comme non fiable dans ce type de bac à sable). Socle reconstruit à l'identique
sur **PostgreSQL 16.13** natif (paquet Ubuntu) : rôles `anon`/`authenticated`/
`service_role`, schéma `auth` minimal (table `users` + `uid()`/`role()`/
`email()`/`jwt()` lisant les GUC `request.jwt.claim.*`), schéma `storage`
minimal, extension `pgtap` installée via `apt` (absente du système, ajoutée
pour cette mission). Prelude non versionné, reconstruit de zéro (le prelude de
la mission Performance ne survit pas d'une session à l'autre dans ce bac à
sable — confirmé, fichiers absents au démarrage).

Six écarts de schéma réels trouvés en rejouant `scripts/perf/generate_fixture.sql`
contre les 296 migrations actuelles (le script datait d'un état antérieur du
train, ~56 commits en arrière) — **tous corrigés dans le script lui-même**,
committés avec cette mission car ils bloquaient toute réutilisation du jeu de
données Performance :
1. `employes.cout_horaire` n'existe plus (déplacé vers `employes_cout_horaire`,
   migration `20260818000206`) — fixture adaptée.
2. `devis.reference_interne` n'a jamais existé (fixture utilisait par erreur
   ce nom au lieu de `numero`, généré par trigger) — colonne retirée de l'insert.
3. `lignes_devis`/`lignes_factures` n'ont jamais eu de colonne `cle_ligne` —
   retirée des deux inserts concernés.
4. `planning_evenements` n'a ni `client_id` ni `journee_entiere` — retirés.
5. `planning_evenements.type` a une liste de valeurs autorisées différente de
   celle utilisée par la fixture (`intervention/rdv_client/livraison/controle/
   absence/autre`, pas `chantier/rendez_vous/deplacement`) — corrigé.
6. Le plafond de personnes actives (migration `20260903000256`, postérieure à
   la version ciblée par la fixture) bloquait la création de 40/5 salariés —
   `capacite_personnes_supplementaire = 200` ajouté à l'insert `entreprises`.

**Écart non corrigé, documenté** : le passage groupé de ~5300 devis au statut
final (`update ... set statut = ...`) produit une collision de numérotation
réelle (`duplicate key ... devis_entreprise_id_numero_key`, ex.
`DEV-2026-100` attribué deux fois), distincte du bug de troncature `lpad` déjà
corrigé par la mission Performance (migration `20260921000299` — vérifié que
son correctif est bien appliqué, la troncature n'est pas en cause ici). Cause
non investiguée plus avant (hors sujet concurrence Planning/Pointages) —
probable défaut de `next_reference()`/`compteurs_reference` sur l'allocation
du compteur annuel lors d'un gros lot en une seule transaction. **Contourné**
en retirant les sections Devis/Factures/Situations de la fixture rejouée pour
cette mission (aucune de ces tables n'est nécessaire pour qualifier Planning/
Pointages) — documenté dans le script lui-même pour un futur repreneur. Voir
§ OPEN RISKS.

### Dataset

Fixture Performance réutilisée pour Entreprises/Comptes/Postes/Salariés/
Clients/Chantiers/Pointages/Notes de frais/Documents/Notifications/Journal
d'activité, **étendue par cette mission** pour couvrir Planning correctement :

| Entité | Avant cette mission | Après |
| --- | --- | --- |
| `public.affectations` (Planning réellement utilisé par l'app) | **0** (jamais peuplé par la fixture) | **13 875** (tenant A + B), ~2 ans d'historique, 1 par salarié/jour ouvré à 80% |
| `public.planning_evenements` (legacy, code mort — voir § PLANNING) | 5 025 | inchangé |
| `public.pointages` | — | 52 241 (tenant A), historique borné à la tenure réelle de chaque salarié |
| `public.employes` (tenant A) | 40 (dont 2 `sorti`, donc 38 actifs) | inchangé |
| `public.chantiers` (tenant A) | 165 | inchangé |
| 2 tenants (A principal, B secondaire, isolation) | oui | inchangé |

`DECISION_REQUIRED` n°2 : la fixture ne liait des comptes applicatifs
(`auth.users`/`utilisateurs_entreprises`) qu'à 20 des 40 salariés du tenant A
(conception initiale : « 20 comptes sur 40 salariés »). Pour exercer
réellement une concurrence à 40 salariés en auto-saisie de pointage (§
CONCURRENCY, Pointages Cas E), 20 comptes synthétiques supplémentaires ont été
créés **dans la base de test locale uniquement** (jamais commités, jamais dans
la fixture versionnée — décision conservatrice : ne pas changer la conception
de la fixture partagée sans une décision produit sur le taux réel de comptes/
salariés d'une PME cible). Résultat : 38/38 salariés **actifs** du tenant A
(2 des 40 ont `statut='sorti'`, cohérent avec un historique de turnover réel)
ont pu être exercés simultanément.

---

## PLANNING

Deux tables existent dans le schéma ; **une seule est réellement utilisée par
l'application** — distinction cruciale, absente de la mission Performance
précédente qui avait mesuré et peuplé la mauvaise table (`planning_evenements`,
0,03 ms mesuré § 6 de ce rapport-là — mesure valide mais sans objet pour la
concurrence en écriture réelle).

- **`public.affectations`** — table active. Lue/écrite exclusivement via 4
  Server Actions Next.js, `src/app/actions/planning.ts` (appels directs au
  client Supabase, pas de RPC dédiée) :
  - `creerAffectationAction` — `INSERT` multi-lignes (un salarié = une ligne).
  - `modifierAffectationAction` — déplacement/correction (date, chantier,
    heures, tâche, type, lieu) d'une affectation existante, éventuellement en
    lot explicite (cases cochées, jamais de propagation automatique). **Seul
    write path corrigé par cette mission** (§ CORRECTNESS).
  - `supprimerAffectationAction` — **code mort**, aucun appelant dans l'UI
    actuelle (vérifié par recherche exhaustive).
  - `supprimerGroupeAffectationsAction` — suppression unitaire ou en lot (même
    action pour les deux dans l'UI), réellement utilisée.
  - Troisième write path trouvé en cours de mission, absent du périmètre
    initial de la recherche : `src/app/actions/assistant.ts`
    (`creerAffectationDepuisPropositionAction`), un `UPDATE` direct déclenché
    par l'assistant IA — **non corrigé**, voir § OPEN RISKS.
  - Employé assigné (`employe_id`) **n'est pas modifiable** via
    `modifierAffectationAction` — la réaffectation d'un salarié passe par
    suppression + recréation. Le « Cas B » de la mission (« changement de
    salarié ») n'a donc pas de write path dédié distinct : il se comporte
    comme une suppression concurrente à une modification (Cas C, déjà testé).
- **`public.planning_evenements`** — table historique, **aucun code
  applicatif ne la lit ni ne l'écrit** (confirmé par le commentaire de sa
  propre migration `20260710000009` et par recherche exhaustive dans `src/`).
  Ne pas construire de nouveau travail de concurrence dessus.

Protection de concurrence existante avant cette mission : `updated_at` présent
sur `affectations` mais **jamais mis à jour par trigger** (colonne inerte),
aucune colonne `version`/`revision`. Seul garde-fou réel : le trigger
`trg_verifier_heures_affectation` (`pg_advisory_xact_lock` sur
`entreprise/employé/date`), qui protège **uniquement** le plafond de 24h/jour
— il ne détecte pas l'écrasement silencieux de champs indépendants (chantier,
tâche, heures) sur la même ligne. C'est exactement le trou comblé par cette
mission (§ CORRECTNESS).

---

## POINTAGES

Tout le cycle de vie passe par des Server Actions (`src/app/actions/
pointages.ts`), la plupart déléguant à des RPC `SECURITY DEFINER` :

| Action | Mécanisme | Concurrence avant cette mission |
| --- | --- | --- |
| `enregistrerArriveeAction` (arrivée) | `INSERT sessions_pointage` direct, gardé par l'index unique partiel `sessions_pointage_ouverte_employe_unique (entreprise_id, employe_id) WHERE depart_at IS NULL` | ✅ déjà correct |
| `enregistrerDepartAction` (départ) | RPC `cloturer_session_pointage` → `cloturer_session_pointage_interne`, `SELECT ... FOR UPDATE` sur la session avant de créer/finaliser le pointage | ✅ déjà correct |
| `declarerPointageOublieAction` | RPC `declarer_pointage_oublie`, `INSERT` pur | pas de risque de concurrence (pas de mise à jour) |
| `supprimerPointageAction` | `DELETE` direct par id | pas de risque de lost update (une suppression n'écrase rien) |
| `validerPointageAction` (validation/rejet manager) | RPC `valider_preuve_pointage`, **`UPDATE` simple sans verrou ni détection d'état** | ❌ **lost update silencieux confirmé** — corrigé par cette mission |
| `creerMaFichePointageAdministrateurAction` | RPC `garantir_fiche_pointage_courante`, `UPDATE` d'un booléen idempotent par nature | risque négligeable, non touché |

Écriture directe dans `pointages` **totalement bloquée** pour `authenticated`
(`role_gestion_insert ... WITH CHECK (false)`) — toute création passe par les
RPC `SECURITY DEFINER` ci-dessus, confirmé par lecture des policies RLS.

Auto-saisie de pointage (`sessions_pointage`) est gouvernée par
`peut_pointer_pour_employe()`, qui exige explicitement
`utilisateurs_entreprises.pointage_personnel_actif = true` **et** que
`employe.utilisateur_id = auth.uid()` — un salarié ne peut jamais pointer pour
un autre, y compris un manager avec tous les droits de gestion (règle métier
volontaire, non modifiée par cette mission — trouvé en essayant de simuler le
Cas D avec le mauvais salarié, corrigé côté banc de test, pas côté code).

---

## CONCURRENCY

Méthode : deux (ou N) sessions `psql` réellement distinctes, lancées en
parallèle (`&`/`wait`), impersonnant `authenticated` via
`request.jwt.claim.sub`/`.role`, avec `pg_sleep()` pour forcer un
chevauchement réel — pas une simulation en une seule transaction. C'est la
même méthode que la mission Performance précédente (§ 9 de ce rapport-là), qui
avait explicitement laissé Planning et Pointages en écriture **non testés**
(« RPC non explorées dans le temps imparti », deux fois cité comme risque
ouvert principal).

### Planning

| Cas | Description | Résultat AVANT correctif | Résultat APRÈS correctif |
| --- | --- | --- | --- |
| A | 2 utilisateurs modifient/déplacent la même affectation | **Lost update reproduit et démontré** : les deux `UPDATE` réussissent, le second écrase silencieusement le premier sans erreur pour personne (rejoué exprès sans la clause `revision` pour le prouver) | Le premier committe (`revision` 1→2) ; le second (révision périmée 1) matche **0 ligne**, aucune erreur SQL, conflit détecté proprement côté application |
| B | Changement de salarié | Pas de write path dédié (`employe_id` non éditable) — réduit au Cas C | — |
| C | Suppression pendant modification (2 ordres testés) | Suppression avant modif : `UPDATE 0`, message clair. Modif avant suppression : `UPDATE 1` puis `DELETE 1`, aucune corruption, aucun deadlock | déjà correct, non modifié |
| D | Création simultanée même salarié/même plage (doublon exact) | 1 succès, 1 `ERROR: duplicate key … affectations_tache_unique`, aucun doublon, aucun deadlock | déjà correct, non modifié |
| D (variante) | 3 créations concurrentes dépassant 24h/jour à elles trois (10h×3) | 2 acceptées (20h), 1 rejetée par `trg_verifier_heures_affectation` (« ne peut pas dépasser 24 heures »), aucun deadlock | déjà correct, non modifié |
| E | 20 utilisateurs modifient 20 affectations distinctes | 20/20 succès, 0 erreur, 0,36 s | inchangé, confirmé après correctif |
| F | 40 sessions mixtes lecture/écriture (20 lectures type vue planning, 20 écritures sur affectations distinctes) | 0 erreur, 0 deadlock, 20/20 écritures réussies | confirmé après correctif — **40 sessions réellement exercées** |

Cross-tenant : une tentative d'`UPDATE` d'une affectation du tenant B avec
`entreprise_id` du tenant A (utilisateur A authentifié) matche **0 ligne** —
même signal que la protection de concurrence (indissociable, défense en
profondeur suffisante).

### Pointages

| Cas | Description | Résultat AVANT correctif | Résultat APRÈS correctif |
| --- | --- | --- | --- |
| A | 2 managers valident/rejettent différemment le même pointage | (comportement pré-existant : `UPDATE` simple, lost update par construction — non rejoué séparément, le mécanisme est identique au correctif ci-contre) | Manager 1 committe (`valide`) ; manager 2 (`rejete`) reçoit `CONFLIT_CONCURRENCE_POINTAGE`, aucune donnée écrasée |
| B | Validation pendant modification | Pas de write path « modification » dédié pour un pointage (seuls create/close/delete/validate existent) — réduit aux cas A/C | — |
| C | Suppression pendant validation (2 ordres testés) | Suppression avant validation : `ERROR: Pointage introuvable`, propre. Validation avant suppression : `valide` committe, puis `DELETE 1`, aucune corruption | déjà correct (le `FOR UPDATE`/verrou naturel de ligne suffisait), non modifié pour ce cas précis |
| D | 2 arrivées concurrentes, même salarié (double-clic) | 1 succès, 1 `ERROR: duplicate key … sessions_pointage_ouverte_employe_unique` | déjà correct, non modifié |
| — | 2 clôtures concurrentes de la même session (double-clic « pointer mon départ ») | 1 succès (1 pointage créé), 1 `ERROR: Le départ a déjà été enregistré` (verrou `FOR UPDATE` déjà en place, mission Performance § 9.2 avait établi ce motif ailleurs) | déjà correct, non modifié |
| E | Salariés actifs du tenant A pointent presque simultanément | — | **38/38 salariés actifs** (sur 40 au total, 2 `sorti`), arrivée simultanée, 0 erreur, 0,55 s |
| F | Manager corrige pendant qu'un salarié modifie | Pas de fenêtre de course réelle : `cloturer_session_pointage` insère puis finalise le pointage **dans la même transaction** — invisible à un validateur concurrent tant qu'elle n'a pas committé | analysé, aucun correctif nécessaire |
| G | Retry réseau / double-clic (même décision rejouée) | (comportement pré-existant : deuxième appel identique, pas de protection dédiée) | Rejeu exact (même statut, même commentaire) = **no-op silencieux**, pas d'erreur |

Cross-tenant : validation d'un pointage du tenant B avec `entreprise_id` du
tenant A → `ERROR: Pointage introuvable` (aucune fuite d'existence).

**Aucun deadlock observé sur aucun des 20+ scénarios exécutés**, avant ou après
correctif.

---

## CORRECTNESS

Deux migrations, une par domaine, strictement additives — aucune règle métier
existante modifiée (permissions, motifs de rejet obligatoires, plafond 24h/j,
etc. : tous préservés à l'identique, vérifié par le test pgTAP de
non-régression existant `terrain_mobile_v1d2_...` qui passe toujours
intégralement).

### `20260922000315_correctif_concurrence_validation_pointage.sql`

Redéfinit `valider_preuve_pointage` (même signature, aucun changement d'appel
requis) : verrouille la ligne (`SELECT ... FOR UPDATE`) avant de lire son
état, puis :
- rejoue exactement la même décision → no-op silencieux (Cas G) ;
- décision déjà prise, différente de celle demandée → erreur explicite
  `CONFLIT_CONCURRENCE_POINTAGE` (Cas A) au lieu d'un écrasement silencieux.

### `20260922000316_correctif_concurrence_affectations_revision.sql`

Ajoute `affectations.revision bigint not null default 1` + un trigger
`BEFORE UPDATE` qui l'incrémente automatiquement (`new.revision :=
old.revision + 1`) — motif repris de celui déjà en place ailleurs dans ce
dépôt pour `public.tools_projects` (`20260830000236`, verrouillage optimiste
par révision). Colonne purement technique, invisible côté UI.

### Application (même lot, hors SQL)

- `src/app/actions/planning.ts` — `modifierAffectationAction` prend
  désormais `revisionAttendue` en second paramètre, l'inclut dans le `WHERE`
  de l'`UPDATE` de l'affectation principale, et détecte 0 ligne modifiée comme
  un conflit explicite (message clair, pas d'écrasement). Les affectations
  « supplémentaires » d'un même lot (cases cochées) restent mises à jour sans
  vérification individuelle — **décision assumée, documentée dans le code** :
  elles n'ont jamais été rouvertes individuellement par l'utilisateur pour en
  revérifier l'état, donc pas de révision à comparer côté client pour elles.
- `src/app/(app)/planning/page.tsx` — sélectionne `revision` dans la requête
  affectations, la transmet au binding de l'action.
- `src/app/actions/pointages.ts` — `validerPointageAction` détecte
  `CONFLIT_CONCURRENCE_POINTAGE` dans le message d'erreur (même motif déjà
  utilisé dans ce fichier pour « Durée travaillée invalide ») et affiche un
  message utilisateur dédié au lieu du repli générique.

**Stratégies délibérément écartées** : pas de verrou global, RLS jamais
désactivée (les deux fonctions restent `SECURITY DEFINER` avec les mêmes
contrôles `a_permission`/tenant qu'avant), pas de nouvelle colonne
`idempotency_key` (le triplet id+revision, resp. id+statut+commentaire,
suffit et évite une migration de schéma plus large pour un gain équivalent).

---

## PERFORMANCE

Hors périmètre principal de cette mission (déjà qualifié par
`ELSATIA_GP_PERFORMANCE_CAPACITY_V1.md`), mesuré uniquement pour confirmer
l'absence de régression :

| Scénario | Sessions | Résultat | Erreurs | Deadlocks |
| --- | ---: | --- | ---: | ---: |
| Planning — 20 modifications d'affectations distinctes | 20 | 0,36 s total | 0 | 0 |
| Planning — 40 sessions mixtes lecture/écriture | 40 | ~113 s total (dominé par le coût de fork de 40 processus `psql` dans ce bac à sable mono-conteneur, pas par le temps SQL réel — voir limite de méthode ci-dessous) | 0 | 0 |
| Pointages — 38 arrivées simultanées (tous les salariés actifs) | 38 | 0,55 s total | 0 | 0 |
| Pointages — 3 créations d'affectations dépassant le plafond 24h | 3 | rejet correct, aucun ralentissement anormal | 0 (1 rejet attendu) | 0 |

**Limite de méthode assumée** : comme dans la mission Performance précédente,
ce bac à sable est un conteneur mono-machine — les temps absolus ne
prédisent pas la latence réelle en Production (pooler `pgbouncer`, ressources
dédiées). Le signal qualitatif (0 erreur, 0 deadlock, pas de dégradation
pathologique) reste valable indépendamment du matériel.

---

## SECURITY

- Aucune policy RLS affaiblie, aucune fonction `SECURITY DEFINER` dégradée :
  les deux fonctions modifiées gardent exactement les mêmes contrôles
  `a_permission()`/`est_membre_actif()` qu'avant.
- Cross-tenant rejoué pour les deux nouveaux mécanismes (§ CONCURRENCY) :
  écriture croisée refusée dans les deux cas, avec des messages qui ne
  révèlent jamais l'existence d'une ligne d'un autre tenant (« introuvable »
  générique, jamais de distinction entre « n'existe pas » et « appartient à
  un autre tenant »).
- `révision` n'est pas un vecteur d'énumération : elle n'est retournée que sur
  les lignes déjà visibles par la RLS du tenant courant.
- Aucun `LEAKPROOF`, aucun contournement de policy RESTRICTIVE, aucune
  élévation de privilège introduite.

---

## TESTS

| Test | Résultat |
| --- | --- |
| Fresh (296 → 298 migrations, base vide → schéma complet) | ✅ 0 erreur, rejoué à l'identique 3 fois (gp_test, gp_pgtap, gp_baseline) |
| Upgrade (298 migrations déjà appliquées, ligne `affectations` préexistante avant les 2 nouvelles migrations) | ✅ backfill correct (`revision = 1` sur la ligne préexistante), aucune donnée perdue |
| pgTAP — nouveau fichier `gp_planning_pointage_concurrency_v1.test.sql` (10 assertions : idempotence, conflit, cross-tenant, révision, verrou optimiste) | ✅ 10/10 |
| pgTAP — suite complète (80 fichiers, `pg_prove`) sur base propre (298 migrations, sans la fixture Performance) | 1631/~1700 assertions exécutées, **18 fichiers en échec, rigoureusement identiques avec et sans les 2 migrations de cette mission** (diff byte-à-byte des listes de fichiers en échec = vide) — gaps d'environnement pré-existants du bac à sable (schéma `storage`/`vault` minimal, pas les 18 fichiers réels), **aucune régression introduite par cette mission** |
| pgTAP — `terrain_mobile_v1d2_validation_pointage_runtime.test.sql` (seule couverture pgTAP pré-existante de `valider_preuve_pointage`) | ✅ passe intégralement, avant et après le correctif — confirme la non-régression des règles métier existantes (permissions, motif de rejet obligatoire, isolation cross-tenant, refus `anon`) |
| Attaque cross-tenant — écriture Planning (`UPDATE` affectation tenant B avec `entreprise_id` tenant A) | ✅ 0 ligne affectée |
| Attaque cross-tenant — validation Pointages tenant B depuis tenant A | ✅ `Pointage introuvable` |
| `npx tsc --noEmit` | ✅ 0 erreur |
| `npx eslint .` | ✅ 0 erreur (5 warnings pré-existants, fichiers non touchés par cette mission) |
| `npx vitest run --no-file-parallelism` | ✅ 1777/1777 (152 fichiers) |
| `npm run build` (`next build`, app Gestion Pro) | ✅ « Compiled successfully », toutes les routes dont `/planning` et `/pointage` |
| `npm run build` (`apps/tools`, sous-projet distinct du monorepo) | ❌ bloqué par un garde-fou de variables d'environnement publiques manquantes (`NEXT_PUBLIC_SUPABASE_URL` etc.) — **aucun rapport avec cette mission** (app séparée, non touchée, échouerait de façon identique sans aucun changement de code dans un bac à sable sans identifiants Supabase réels) |

---

## OPEN RISKS

1. **`src/app/actions/assistant.ts` — `creerAffectationDepuisPropositionAction`**
   (troisième write path sur `affectations`, trouvé en cours de mission,
   propositions de l'assistant IA appliquées après confirmation utilisateur) a
   exactement le même défaut que `modifierAffectationAction` avant correctif :
   `UPDATE` direct sans vérification de révision. **Non corrigé** —
   contrairement à `modifierAffectationAction`, cette action ne dispose
   aujourd'hui d'aucun moyen de transmettre une révision attendue (le format
   de la proposition IA ne la porte pas), et la corriger correctement
   demanderait de faire remonter `revision` depuis la route de streaming SSE
   (`src/app/api/assistant/chat/route.ts`) jusqu'au composant `AssistantIA.tsx`
   — un changement de surface plus large que cette mission n'a pas pu valider
   de bout en bout sans exécuter l'application réelle. Risque jugé secondaire
   (fonctionnalité IA, propositions déjà mitigées par une fenêtre anti-double-
   clic de 10s sur la création) mais réel : deux utilisateurs qui confirment
   presque simultanément une proposition IA de modification sur la même
   affectation peuvent encore perdre l'un des deux changements silencieusement.
2. **Numérotation devis/factures — collision réelle trouvée** (§ BASE) :
   `next_reference()`/`compteurs_reference` produit des doublons de `numero`
   quand plusieurs milliers de documents sont émis en lot sur plusieurs
   années différentes en une seule transaction. Distinct du bug déjà corrigé
   par la mission Performance (`20260921000299`, troncature `lpad` —
   vérifié non en cause ici). **Hors périmètre de cette mission** (aucun lien
   avec Planning/Pointages), non corrigé, non qualifié plus avant. Suggestion
   de tâche de suivi rédigée mais l'outil de soumission a expiré (timeout) au
   moment de la mission — à recréer manuellement si nécessaire.
3. **Fixture — comptes de connexion** : la fixture Performance versionnée ne
   lie que 20 comptes sur 40 salariés pour le tenant A. Les 20 comptes
   supplémentaires utilisés pour exercer réellement 38 sessions Pointages
   simultanées (§ CONCURRENCY) n'existent que dans la base de test locale de
   cette session, **pas dans le script versionné** — un futur repreneur qui
   rejoue `generate_fixture.sql` devra soit accepter cette limite (20
   comptes), soit décider explicitement d'étendre la fixture partagée (hors
   décision qu'une mission technique peut prendre seule).
4. **Suite pgTAP — 18 fichiers en échec, non liés à cette mission** (§ TESTS) :
   confirmés pré-existants (identiques avec/sans les 2 migrations de cette
   mission), mais non corrigés — dette de test antérieure à qualifier/traiter
   séparément si une vraie CI pgTAP est visée sur ce train.
5. **Planning — lot de correction groupée** : `modifierAffectationAction`
   applique la correction aux affectations « supplémentaires » cochées sans
   vérification individuelle de révision (choix assumé, § CORRECTNESS) — un
   scénario à 3+ utilisateurs où l'un modifie une affectation individuellement
   pendant qu'un autre l'inclut dans une correction de lot n'est donc que
   partiellement protégé (la ligne principale du lot l'est, les lignes
   secondaires ne le sont pas).
6. **`sessions_pointage` — auto-saisie stricte** : confirmé qu'un manager ne
   peut pas créer une arrivée pour un autre salarié (règle métier existante,
   non modifiée) — un manager qui doit « pointer pour » un salarié sans accès
   compte n'a pas de chemin direct autre que `declarer_pointage_oublie`
   (déclaratif, après coup). Non qualifié comme un défaut de concurrence,
   mais à connaître pour toute discussion produit sur ce flux.

---

## Verdict

**`40 USER WRITE CANDIDATE`**

Justification :

- Les deux défauts de concurrence réels que la mission Performance
  précédente avait explicitement laissés ouverts (« Planning et Pointages en
  écriture concurrente n'ont pas été exercés ») sont **trouvés, reproduits
  avant correctif (lost update démontré à froid sur Planning), corrigés,
  et revérifiés après correctif** avec des sessions réellement concurrentes.
- **Aucun deadlock** sur aucun des 20+ scénarios exécutés, avant ou après
  correctif, sur les deux domaines.
- **Planning** a été exercé à **40 sessions réelles** (Cas F, mixte lecture/
  écriture), 0 erreur.
- **Pointages** a été exercé à **38 sessions réelles** (tous les salariés
  actifs du tenant A, 2 sur 40 étant `sorti`), 0 erreur — proche de 40 mais
  pas littéralement 40, et aucun scénario Pointages mixte lecture/écriture à
  40 sessions n'a été construit séparément (seul Planning Cas F le fait).
- Isolation cross-tenant reconfirmée sur les deux nouveaux mécanismes,
  aucune régression sur la suite pgTAP existante (diff exact avec/sans les
  correctifs), Vitest/typecheck/lint/build tous au vert sur le code touché.

**Ce n'est pas `40 USER WRITE QUALIFIED LOCALLY`** — deux raisons précises et
assumées, conformément à la consigne de la mission de ne pas déclarer cette
qualification sans avoir réellement exercé 40 sessions sur *les deux*
domaines : (1) Pointages plafonne à 38, pas 40, faute de comptes applicatifs
suffisants dans la fixture partagée sans en changer la conception au passage ;
(2) aucun scénario Pointages **mixte lecture/écriture** à grande échelle
(équivalent du Cas F Planning) n'a été construit — les scénarios Pointages
testés sont ciblés (A/C/D/E/G, un mécanisme à la fois), pas un banc de charge
générique comme celui de la mission Performance § 9.3.

**Ce n'est pas non plus `CONCURRENCY NOT READY`** : aucun défaut résiduel
n'a été trouvé sur un chemin testé après correctifs ; les deux seuls défauts
réels trouvés dans ce périmètre (lost update Planning, lost update/pas de
détection de conflit Pointages) sont corrigés et vérifiés, pas seulement
documentés.

---

## Annexes — reproductibilité

- Fixture étendue : `scripts/perf/generate_fixture.sql` (6 corrections de
  dérive de schéma + nouvelle section 12bis peuplant `affectations`).
- Migrations : `supabase/migrations/20260922000315_...sql`,
  `supabase/migrations/20260922000316_...sql`.
- Test de non-régression : `supabase/tests/gp_planning_pointage_concurrency_v1.test.sql`.
- Environnement de test (prelude, scripts de rejeu, sessions de concurrence
  psql) non conservé dans ce dépôt — spécifique à ce bac à sable, comme pour
  la mission Performance précédente. Un futur repreneur devra reconstruire un
  socle équivalent ou utiliser un vrai projet Supabase de test.
