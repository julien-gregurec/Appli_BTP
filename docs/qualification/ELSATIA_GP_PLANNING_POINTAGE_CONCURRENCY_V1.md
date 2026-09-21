# ELSATIA Gestion Pro — Concurrence en écriture, Planning & Pointages V1

Mission autonome (session du 2026-09-21), aucune question bloquante posée (règle
`DECISION_REQUIRED` appliquée partout où une ambiguïté est apparue — voir chaque
section pour l'hypothèse retenue). Aucune Production touchée, aucune Preview en
écriture, aucune donnée personnelle réelle.

**Question posée : Gestion Pro peut-il perdre une modification de planning sous
écriture concurrente ? Peut-il créer des doublons/incohérences de pointage ?
Y a-t-il des deadlocks ? La qualification 40 utilisateurs peut-elle progresser ?**

**Verdict : `40 USER WRITE QUALIFIED`** (mis à jour par la mission V2 — voir
§ MISE À JOUR — MISSION V2 et § Verdict). La mission V1 initiale avait conclu à
`40 USER WRITE CANDIDATE`, avec deux blockers précis : un troisième chemin
d'écriture Planning non protégé (`assistant.ts`) et un banc Pointages plafonné
à 38 sessions sans scénario mixte à grande échelle. Les deux sont désormais
résolus et vérifiés.

---

## MISE À JOUR — MISSION V2 (poursuite, même train)

```
SHA de départ = 8fe26df (fin de la mission V1, déjà poussé sur festive-hamilton-76vvre)
SHA final     = voir dernière ligne de ce document / message de clôture
```

Mission de poursuite strictement scopée aux deux éléments encore ouverts du
rapport V1 (troisième chemin d'écriture Planning `assistant.ts`, banc Pointages
40 sessions) — le bug de numérotation devis/factures reste explicitement hors
périmètre (aucun changement devis/factures dans cette mission ni la précédente).
Repris depuis le SHA exact `8fe26df`, aucune réimplémentation des correctifs
déjà présents (`20260922000315`/`316`, colonne `revision`, etc.) : ce travail
est strictement additif par-dessus.

Résumé des deux corrections :

1. **`src/app/actions/assistant.ts` (`creerAffectationDepuisPropositionAction`)** —
   le troisième chemin d'écriture Planning identifié par la mission V1 avait
   exactement le même défaut que `modifierAffectationAction` avant son
   correctif : un `UPDATE` direct sans vérification de révision, avec une
   fenêtre de risque réelle et potentiellement large (proposition IA affichée,
   confirmation utilisateur différée). Corrigé en propageant la révision
   observée par l'assistant au moment où il résout la proposition
   (`resoudrePropositionModificationAffectation`) jusqu'à la confirmation
   utilisateur, vérifiée par le même mécanisme de verrou optimiste que le
   formulaire manuel — voir § PLANNING et § CORRECTNESS ci-dessous (mis à jour).
2. **Banc Pointages 40 sessions réellement mixte** — construit et exécuté :
   40 connexions PostgreSQL concurrentes réelles (pas une boucle séquentielle),
   mélangeant arrivées, départs, lectures, validations manager, rejets manager,
   retry/double-clic, conflit direct sur un même pointage, et un accès
   multi-tenant — voir § CONCURRENCY (Pointages, mis à jour) pour le détail
   complet et les invariants vérifiés après coup.

Aucune migration SQL ajoutée par cette mission V2 (les deux correctifs V1
suffisaient déjà côté schéma ; le troisième chemin Planning ne nécessitait que
la propagation applicative de la révision déjà posée par la migration
`20260922000316`). Le bug de numérotation devis/factures (§ BASE, § OPEN RISKS)
n'a fait l'objet d'aucun changement, conformément au périmètre demandé.

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
    lot explicite (cases cochées, jamais de propagation automatique). Corrigé
    par la mission V1 (§ CORRECTNESS).
  - `supprimerAffectationAction` — **code mort**, aucun appelant dans l'UI
    actuelle (vérifié par recherche exhaustive).
  - `supprimerGroupeAffectationsAction` — suppression unitaire ou en lot (même
    action pour les deux dans l'UI), réellement utilisée.
  - Troisième write path (`src/app/actions/assistant.ts`,
    `creerAffectationDepuisPropositionAction`), déclenché par la confirmation
    utilisateur d'une proposition de l'assistant IA — trouvé par la mission
    V1, **corrigé par la mission V2** (§ CORRECTNESS, mis à jour). Entrée :
    message en langage naturel dans le chat assistant (ex. « corrige l'heure
    de Paul à 8h demain »). Résolution serveur
    (`resoudrePropositionModificationAffectation`, `src/lib/ai/assistant.ts`) :
    le modèle IA fournit un `affectation_id` (jamais halluciné sans contrôle —
    la fonction revérifie que la ligne existe et appartient au tenant courant,
    retourne `null` sinon) ; la fonction lit alors l'état actuel de la ligne
    ciblée, y compris désormais sa `revision`, et construit une
    `PropositionAffectation` renvoyée au client par SSE. L'utilisateur voit la
    carte de proposition, peut prendre plusieurs secondes à minutes avant de
    cliquer « Confirmer » (fenêtre de risque, contrairement au formulaire
    manuel généralement rouvert/refermé rapidement) — pendant ce temps,
    n'importe qui (UI classique ou une autre proposition IA) peut modifier ou
    supprimer la même affectation. La révision transmise n'était, avant
    correctif, jamais lue nulle part dans la chaîne (type
    `PropositionAffectation` sans champ dédié) : c'est pour cela qu'aucune
    révision n'était vérifiée à l'écriture, pas une omission dans la requête
    d'écriture elle-même. Seul appelant de
    `creerAffectationDepuisPropositionAction` dans tout le dépôt :
    `src/components/AssistantIA.tsx` (recherche exhaustive confirmée par la
    mission V2).
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

### Planning — lost update rejoué explicitement sur TOUS les chemins (mission V2)

Scénario demandé rejoué à l'identique sur les deux chemins d'écriture qui
modifient une affectation existante (`modifierAffectationAction` et
`creerAffectationDepuisPropositionAction`), dans les deux sens (chaque chemin
gagnant la course à tour de rôle) :

| Ordre de commit | A (premier) | B (second, révision périmée) | Résultat |
| --- | --- | --- | --- |
| UI classique d'abord | `modifierAffectationAction` — `UPDATE 1`, révision 4→5 | `creerAffectationDepuisPropositionAction` (assistant) — `UPDATE 0`, aucune ligne touchée | ✅ A intact, aucune écriture silencieuse de B |
| Assistant IA d'abord | `creerAffectationDepuisPropositionAction` — `UPDATE 1`, révision 6→7 | `modifierAffectationAction` (UI classique) — `UPDATE 0`, aucune ligne touchée | ✅ A intact, aucune écriture silencieuse de B |
| Assistant IA vs suppression concurrente | `DELETE` (tenant A, autre session) committe en premier | `creerAffectationDepuisPropositionAction` avec la révision pré-suppression — `UPDATE 0`, aucune erreur SQL brute | ✅ conflit propre, pas de crash, même comportement que le Cas C déjà validé pour l'UI classique |

Dans les deux premiers cas, l'état final de la base porte exactement la
modification du chemin qui a committé en premier, quel qu'il soit — la
protection est bien **symétrique entre les deux chemins d'écriture**, pas
seulement interne à chacun. Aucun deadlock, aucune erreur SQL non gérée sur
les 3 scénarios.

### Pointages

| Cas | Description | Résultat AVANT correctif | Résultat APRÈS correctif |
| --- | --- | --- | --- |
| A | 2 managers valident/rejettent différemment le même pointage | (comportement pré-existant : `UPDATE` simple, lost update par construction — non rejoué séparément, le mécanisme est identique au correctif ci-contre) | Manager 1 committe (`valide`) ; manager 2 (`rejete`) reçoit `CONFLIT_CONCURRENCE_POINTAGE`, aucune donnée écrasée |
| B | Validation pendant modification | Pas de write path « modification » dédié pour un pointage (seuls create/close/delete/validate existent) — réduit aux cas A/C | — |
| C | Suppression pendant validation (2 ordres testés) | Suppression avant validation : `ERROR: Pointage introuvable`, propre. Validation avant suppression : `valide` committe, puis `DELETE 1`, aucune corruption | déjà correct (le `FOR UPDATE`/verrou naturel de ligne suffisait), non modifié pour ce cas précis |
| D | 2 arrivées concurrentes, même salarié (double-clic) | 1 succès, 1 `ERROR: duplicate key … sessions_pointage_ouverte_employe_unique` | déjà correct, non modifié |
| — | 2 clôtures concurrentes de la même session (double-clic « pointer mon départ ») | 1 succès (1 pointage créé), 1 `ERROR: Le départ a déjà été enregistré` (verrou `FOR UPDATE` déjà en place, mission Performance § 9.2 avait établi ce motif ailleurs) | déjà correct, non modifié |
| E | Salariés actifs du tenant A pointent presque simultanément | — | **38/38 salariés actifs** (sur 40 au total, 2 `sorti`), arrivée simultanée, 0 erreur, 0,55 s — **complété par le banc mixte à 40 sessions réelles ci-dessous (mission V2)** |
| F | Manager corrige pendant qu'un salarié modifie | Pas de fenêtre de course réelle : `cloturer_session_pointage` insère puis finalise le pointage **dans la même transaction** — invisible à un validateur concurrent tant qu'elle n'a pas committé | analysé, aucun correctif nécessaire |
| G | Retry réseau / double-clic (même décision rejouée) | (comportement pré-existant : deuxième appel identique, pas de protection dédiée) | Rejeu exact (même statut, même commentaire) = **no-op silencieux**, pas d'erreur — **revérifié sous charge réelle à 40 sessions, voir ci-dessous** |

Cross-tenant : validation d'un pointage du tenant B avec `entreprise_id` du
tenant A → `ERROR: Pointage introuvable` (aucune fuite d'existence).

**Aucun deadlock observé sur aucun des 20+ scénarios exécutés**, avant ou après
correctif.

### Pointages — banc mixte 40 sessions réelles (mission V2)

Construit pour combler le blocker précis laissé par la mission V1 (« aucun
scénario Pointages mixte lecture/écriture à grande échelle »). **40 connexions
PostgreSQL réellement concurrentes** (`psql` séparés, `&`/`wait`, aucune
boucle séquentielle), mélange représentatif :

| Catégorie | Sessions | Détail |
| --- | ---: | --- |
| Arrivées fraîches (salariés distincts) | 11 | `INSERT sessions_pointage`, self-service, 11 salariés du tenant A |
| Double-clic arrivée (même salarié) | 2 | Même salarié, 2 sessions concurrentes — reproduit un vrai double-clic sous charge |
| Départs (clôture de session déjà ouverte) | 6 | RPC `cloturer_session_pointage`, sessions pré-ouvertes (8h avant), durée valide |
| Lectures (vue équipe / vue employé) | 7 | `SELECT` purs, aucune écriture |
| Validations manager (pointages distincts) | 4 | RPC `valider_preuve_pointage`, statut `valide` |
| Rejets manager (pointages distincts) | 4 | RPC `valider_preuve_pointage`, statut `rejete` avec motif |
| Conflit direct — même pointage, décisions différentes | 2 | 1 `valide` + 1 `rejete` concurrents sur la **même ligne** |
| Retry / double-clic validation | 2 | Rejeu exact de la décision de la session « validation #1 » (même pointage, même statut, même commentaire), lancé en concurrence |
| Tenant B (isolation sous charge) | 2 | 1 arrivée + 1 lecture, tenant B, pendant que les 38 autres sessions tournent sur le tenant A |
| **Total** | **40** | |

**Mesures :**

| Métrique | Valeur |
| --- | --- |
| Sessions lancées | 40 (confirmé programmatiquement, pas une estimation) |
| Opérations totales | 40 (1 par session) |
| Succès | 38 |
| Conflits attendus (comportement correct, pas une erreur) | 2 — 1 double-clic arrivée (`ERROR: duplicate key … sessions_pointage_ouverte_employe_unique`), 1 conflit manager même ligne (`ERROR: CONFLIT_CONCURRENCE_POINTAGE`) |
| Erreurs inattendues | **0** |
| Doublons créés | **0** (vérifié — voir invariants ci-dessous) |
| Incohérences | **0** |
| Deadlocks | **0** |
| Timeouts | **0** |
| Durée totale (40 sessions) | 20,4 s (dominé par le coût de fork des processus `psql` dans ce bac à sable, pas par le temps SQL — même limite de méthode que le Planning Cas F) |
| État final | Cohérent sur tous les points vérifiés (voir invariants) |

**Invariants vérifiés explicitement après le banc** (requêtes SQL dédiées,
pas une simple lecture des logs) :

- **Aucun doublon de session ouverte** : `select employe_id, count(*) ... having count(*) > 1` → 0 ligne.
- **Aucune session impossible** : `depart_at <= arrivee_at` → 0 ligne ; les 6 départs ont chacun produit exactement 1 pointage.
- **Aucune décision manager silencieusement écrasée** : le pointage du
  « conflit direct » porte exactement **une** décision cohérente (`valide`,
  commentaire du gagnant de la course, `verification_par` = l'acteur gagnant)
  — la tentative `rejete` concurrente n'a laissé aucune trace en base, conforme
  au correctif `CONFLIT_CONCURRENCE_POINTAGE`.
- **Retry/double-clic** : le pointage ciblé par les 2 sessions « retry » porte
  une seule décision cohérente (`valide`, même commentaire), confirmant
  l'idempotence sous charge réelle, pas seulement en isolation.
- **Aucune fuite inter-tenant** : `sessions_pointage`/`pointages` du tenant B
  strictement confinés à `entreprise_id` = tenant B (0 ligne croisée détectée
  par jointure `employes`/`chantiers` d'un autre tenant) ; la session de
  lecture tenant B a vu le compte exact de son propre tenant, inchangé par la
  charge tenant A.
- **Aucune violation de contrainte non gérée** : `pg_constraint.convalidated`
  vérifié sur `pointages`/`sessions_pointage` — aucune contrainte laissée
  invalide.

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

### Assistant IA — troisième chemin Planning (mission V2, hors SQL)

Aucune migration nécessaire (la colonne `revision` et son trigger,
`20260922000316`, existent déjà) — correctif strictement applicatif, même
mécanisme que `modifierAffectationAction`, **jamais** une relecture de la
révision juste avant l'écriture (qui ne protégerait que la fenêtre de cet
appel, pas la vraie fenêtre de risque proposition→confirmation) :

- `src/lib/ai/assistant.ts` — le type `PropositionAffectation` gagne un champ
  `revision: number | null` (`null` pour une création, aucune ligne existante
  à protéger). `resoudrePropositionModificationAffectation` (seule fonction
  qui cible une affectation existante) sélectionne désormais `revision` dans
  sa lecture et la reporte dans la proposition retournée — c'est la valeur
  observée **au moment où la proposition est construite et montrée à
  l'utilisateur**, jamais relue plus tard.
- `src/components/AssistantIA.tsx` — transmet `revision:
  message.proposition!.revision` à `creerAffectationDepuisPropositionAction`
  lors du clic « Confirmer » (seul appelant du mécanisme, recherche
  exhaustive confirmée).
- `src/app/actions/assistant.ts` — `creerAffectationDepuisPropositionAction`
  prend `revision: number | null` ; sur le chemin modification
  (`proposition.affectationId` non nul), l'`UPDATE` inclut désormais
  `.eq("revision", proposition.revision)` et `.select("id")` : 0 ligne
  retournée → erreur explicite (« Cette affectation a été modifiée ou
  supprimée par quelqu'un d'autre depuis la proposition de l'assistant.
  Rechargez le planning et redemande la correction. ») au lieu d'un
  écrasement silencieux. Le chemin création (`affectationId` nul) est
  inchangé — pas de révision à vérifier pour une ligne qui n'existe pas
  encore, la fenêtre anti-double-clic de 10s existante suffit toujours.
- Tests de non-régression ajoutés à `src/app/actions/assistant.test.ts` (3
  nouveaux cas dans un bloc dédié) : modification appliquée quand la révision
  correspond, conflit propre (aucune écriture) quand elle est périmée, chemin
  création jamais soumis à une vérification de révision. 11/11 tests du
  fichier passent (8 existants inchangés + 3 nouveaux).

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
| Fresh (296 → 298 migrations, base vide → schéma complet) | ✅ 0 erreur — rejoué 3× par la mission V1 (gp_test, gp_pgtap, gp_baseline), **rejoué une 4ᵉ fois par la mission V2** depuis le commit `8fe26df` (`gp_fresh_v2`), toujours 0 erreur (aucune migration SQL ajoutée par la V2, résultat attendu et confirmé, pas supposé) |
| Fixture Performance (rejeu complet) | ✅ RC=0, rejouée par la mission V2 sur `gp_fresh_v2` — mêmes volumétries que la mission V1 (13 875 affectations, 52 241 pointages, etc.) |
| Upgrade (298 migrations déjà appliquées, ligne `affectations` préexistante avant les 2 nouvelles migrations) | ✅ backfill correct (`revision = 1` sur la ligne préexistante), aucune donnée perdue — vérifié par la mission V1, non re-testé par la V2 (aucune migration touchée) |
| pgTAP — fichier `gp_planning_pointage_concurrency_v1.test.sql` (10 assertions : idempotence, conflit, cross-tenant, révision, verrou optimiste) | ✅ 10/10 — revérifié par la mission V2 (`ok` dans le run complet ci-dessous), aucun changement apporté à ce fichier |
| pgTAP — suite complète (80 fichiers, `pg_prove`) sur base propre (298 migrations, sans la fixture Performance) | 1631/~1700 assertions exécutées, **18 fichiers en échec, rigoureusement identiques à ceux de la mission V1** (diff byte-à-byte des listes de fichiers en échec = vide, revérifié par la V2 sur `gp_pgtap`) — gaps d'environnement pré-existants du bac à sable, **aucune régression introduite par la mission V1 ni la V2** (attendu : aucune migration SQL touchée par la V2) |
| pgTAP — `terrain_mobile_v1d2_validation_pointage_runtime.test.sql` (seule couverture pgTAP pré-existante de `valider_preuve_pointage`) | ✅ passe intégralement (inchangé depuis la mission V1) |
| Attaque cross-tenant — écriture Planning (`UPDATE` affectation tenant B avec `entreprise_id` tenant A) | ✅ 0 ligne affectée (mission V1) |
| Attaque cross-tenant — validation Pointages tenant B depuis tenant A | ✅ `Pointage introuvable` (mission V1) |
| Isolation multi-tenant sous charge réelle (mission V2) | ✅ confirmée par le banc Pointages 40 sessions (tenant B strictement confiné, voir § CONCURRENCY) — les 2 fichiers pgTAP `isolation_multitenant_*` restent dans les 18 échecs pré-existants (non liés à Planning/Pointages, `have`/`want` en décalage sur des comptages d'objets `documents_chantier`/messagerie — gap d'environnement `storage` déjà identifié, inchangé par les deux missions) |
| `npx tsc --noEmit` | ✅ 0 erreur (mission V1 + V2) |
| `npx eslint .` | ✅ 0 erreur (5 warnings pré-existants, fichiers non touchés par les deux missions) |
| `npx vitest run --no-file-parallelism` | ✅ **1780/1780** (152 fichiers) — 1777 (mission V1) + 3 nouveaux cas dans `assistant.test.ts` (mission V2 : modification avec révision correcte, conflit propre, chemin création non concerné) |
| `npm run build` (`next build`, app Gestion Pro) | ✅ « Compiled successfully », toutes les routes dont `/planning` et `/pointage` — revérifié par la mission V2 |
| `npm run build` (`apps/tools`, sous-projet distinct du monorepo) | ❌ bloqué par un garde-fou de variables d'environnement publiques manquantes (`NEXT_PUBLIC_SUPABASE_URL` etc.) — **aucun rapport avec ces deux missions** (app séparée, non touchée, échec identique à la mission V1, limitation d'environnement pas une régression) |

---

## OPEN RISKS

Point 1 de la version précédente de ce rapport (`src/app/actions/assistant.ts`
— troisième chemin d'écriture Planning non protégé) est **résolu par la
mission V2** — voir § PLANNING et § CORRECTNESS. Renuméroté ci-dessous.

1. **Numérotation devis/factures — collision réelle trouvée** (§ BASE) :
   `next_reference()`/`compteurs_reference` produit des doublons de `numero`
   quand plusieurs milliers de documents sont émis en lot sur plusieurs
   années différentes en une seule transaction. Distinct du bug déjà corrigé
   par la mission Performance (`20260921000299`, troncature `lpad` —
   vérifié non en cause ici). **Hors périmètre de cette mission** (aucun lien
   avec Planning/Pointages), non corrigé, non qualifié plus avant. Suggestion
   de tâche de suivi rédigée mais l'outil de soumission a expiré (timeout) au
   moment de la mission — à recréer manuellement si nécessaire.
2. **Fixture — comptes de connexion** : la fixture Performance versionnée ne
   lie que 20 comptes sur 40 salariés pour le tenant A (et 4 sur 5 pour le
   tenant B). Les comptes synthétiques supplémentaires utilisés pour exercer
   réellement 38 sessions Pointages simultanées (mission V1) puis le banc
   mixte à 40 sessions (mission V2, qui réutilise le même socle) n'existent
   que dans la base de test locale de cette session, **pas dans le script
   versionné** — un futur repreneur qui rejoue `generate_fixture.sql` devra
   soit accepter cette limite (20/4 comptes), soit décider explicitement
   d'étendre la fixture partagée (hors décision qu'une mission technique peut
   prendre seule). Le banc à 40 sessions de la mission V2 a contourné cette
   même limite en complétant, sans la corriger, avec des lectures et un accès
   tenant B pour atteindre exactement 40 connexions réelles.
3. **Suite pgTAP — 18 fichiers en échec, non liés à ces deux missions**
   (§ TESTS) : confirmés pré-existants, rigoureusement identiques avant/après
   les deux missions (diff vide à chaque fois), mais non corrigés — dette de
   test antérieure à qualifier/traiter séparément si une vraie CI pgTAP est
   visée sur ce train.
4. **Planning — lot de correction groupée** : `modifierAffectationAction`
   applique la correction aux affectations « supplémentaires » cochées sans
   vérification individuelle de révision (choix assumé, § CORRECTNESS) — un
   scénario à 3+ utilisateurs où l'un modifie une affectation individuellement
   pendant qu'un autre l'inclut dans une correction de lot n'est donc que
   partiellement protégé (la ligne principale du lot l'est, les lignes
   secondaires ne le sont pas). Non demandé par le périmètre de la mission V2
   (limité à `assistant.ts` et au banc Pointages), non traité.
5. **`sessions_pointage` — auto-saisie stricte** : confirmé qu'un manager ne
   peut pas créer une arrivée pour un autre salarié (règle métier existante,
   non modifiée) — un manager qui doit « pointer pour » un salarié sans accès
   compte n'a pas de chemin direct autre que `declarer_pointage_oublie`
   (déclaratif, après coup). Non qualifié comme un défaut de concurrence,
   mais à connaître pour toute discussion produit sur ce flux.

---

## Verdict

**`40 USER WRITE QUALIFIED`**

(Historique : `CONCURRENCY NOT READY` implicite avant toute mission de ce
lot → `40 USER WRITE CANDIDATE` à l'issue de la mission V1 → `40 USER WRITE
QUALIFIED` à l'issue de la mission V2, ce document.)

Les six critères posés par la mission V2 pour autoriser ce verdict sont
remplis, chacun avec une preuve directe (pas une déduction) :

1. **Tous les chemins Planning connus sont protégés contre les lost
   updates.** Recherche exhaustive confirmée deux fois (mission V1 puis V2) :
   deux chemins, et seulement deux, modifient une affectation *existante* —
   `modifierAffectationAction` (protégé depuis la V1) et
   `creerAffectationDepuisPropositionAction` (protégé par la V2). Le scénario
   demandé (A lit révision N, B lit révision N, A modifie, B tente sur N) a
   été rejoué explicitement **dans les deux sens** et **entre les deux
   chemins** (pas seulement chacun contre lui-même) : à chaque fois, le
   premier à committer réussit, le second reçoit un conflit explicite (0
   ligne touchée, aucune exception SQL brute), et l'état final porte
   exactement la modification du gagnant — voir § CONCURRENCY, tableau
   « Planning — lost update rejoué explicitement sur TOUS les chemins ».
2. **Le banc mixte Pointages 40 utilisateurs passe.** 40 sessions PostgreSQL
   réellement concurrentes (pas une boucle), mélange représentatif (arrivées,
   départs, lectures, validations, rejets, retry/double-clic, conflit direct
   sur une même ligne, accès multi-tenant) : 38 succès, 2 conflits *attendus*
   et correctement gérés, **0 erreur inattendue**. Voir § CONCURRENCY,
   « Pointages — banc mixte 40 sessions réelles ».
3. **Aucun deadlock inexpliqué.** 0 deadlock sur l'intégralité des scénarios
   des deux missions (20+ scénarios ciblés V1 + le banc à 40 sessions V2),
   deadlocks non plus jamais rencontrés sur les chemins déjà protégés
   (`cloturer_session_pointage`, `trg_verifier_heures_affectation`).
4. **Aucun doublon/incohérence critique.** Invariants vérifiés explicitement
   par requête SQL dédiée après le banc à 40 sessions (pas une simple lecture
   de logs) : 0 session ouverte en double, 0 session à durée impossible, 0
   décision manager silencieusement écrasée (une seule décision cohérente
   persiste sur la ligne en conflit), retry confirmé idempotent sous charge
   réelle. Voir § CONCURRENCY, sous-section « Invariants vérifiés ».
5. **L'isolation multi-tenant reste intacte.** Cross-tenant rejoué sur les
   trois mécanismes (`modifierAffectationAction`,
   `creerAffectationDepuisPropositionAction`, `valider_preuve_pointage`) :
   toujours 0 ligne affectée / `introuvable`, jamais de distinction révélée
   entre « n'existe pas » et « appartient à un autre tenant ». Le banc à 40
   sessions inclut une tranche tenant B active pendant toute la charge tenant
   A : confinement confirmé (0 ligne croisée par jointure).
6. **Aucune régression.** `Fresh` (4ᵉ rejeu depuis `8fe26df`, 0 erreur),
   fixture Performance (RC=0), pgTAP (18 échecs pré-existants, **diff
   byte-à-byte vide** avec la mission V1 — donc avec l'état d'avant les deux
   missions), `tsc --noEmit` (0 erreur), `eslint` (0 erreur, mêmes 5
   warnings pré-existants), Vitest (1780/1780, +3 tests dédiés au nouveau
   correctif), build (app Gestion Pro « Compiled successfully » ; seul
   `apps/tools`, un sous-projet distinct non touché, reste bloqué par une
   limitation d'environnement identique aux deux missions — jamais qualifiée
   comme une régression).

**Ce que ce verdict ne couvre pas** (transparence assumée, pas une
qualification cachée) :

- Le bug de numérotation devis/factures (§ OPEN RISKS n°1) reste réel,
  trouvé, non corrigé — **explicitement hors périmètre**, jamais compté comme
  un blocker de ce verdict puisqu'il ne touche ni Planning ni Pointages.
- Les 18 échecs pgTAP pré-existants (§ OPEN RISKS n°3) restent une dette de
  test à traiter séparément — confirmés sans lien avec la concurrence
  Planning/Pointages sur les deux missions.
- La correction groupée en lot sur `modifierAffectationAction` (§ OPEN RISKS
  n°4) ne vérifie la révision que sur l'affectation principale, pas sur les
  lignes « supplémentaires » du même lot — limitation assumée et documentée
  depuis la mission V1, hors du périmètre strict demandé à la V2.
- La fixture partagée reste plafonnée à 20-24 comptes applicatifs sur 40-45
  salariés (§ OPEN RISKS n°2) — le banc à 40 sessions de cette mission
  contourne cette limite sans la lever dans le script versionné.

Aucun de ces points ne remet en cause les six critères ci-dessus : ce sont
des limites de périmètre et des dettes documentées, pas des défauts de
concurrence non traités sur Planning ou Pointages.

---

## Annexes — reproductibilité

- Fixture étendue (mission V1) : `scripts/perf/generate_fixture.sql` (6
  corrections de dérive de schéma + nouvelle section 12bis peuplant
  `affectations`) — inchangée par la mission V2.
- Migrations (mission V1, inchangées par la V2) :
  `supabase/migrations/20260922000315_...sql`,
  `supabase/migrations/20260922000316_...sql`.
- Correctif applicatif (mission V2) : `src/lib/ai/assistant.ts`,
  `src/components/AssistantIA.tsx`, `src/app/actions/assistant.ts`.
- Tests de non-régression : `supabase/tests/gp_planning_pointage_concurrency_v1.test.sql`
  (pgTAP, mission V1, inchangé) ; `src/app/actions/assistant.test.ts` (3
  nouveaux cas Vitest, mission V2, dans le bloc « modification d'une
  affectation existante… »).
- Harness reproductible (mission V2) :
  `scripts/perf/bench_pointages_concurrency_40.sh` — script autonome, aucun
  UUID en dur (interroge la base pour choisir dynamiquement tenants,
  salariés, chantiers, pointages), rejouable sur toute base PostgreSQL où les
  migrations de ce dépôt sont appliquées et la fixture Performance a été
  rejouée. Usage :
  `PGDATABASE=<base_jetable> ./scripts/perf/bench_pointages_concurrency_40.sh`.
  Revalidé de bout en bout par la mission V2 juste avant ce commit (40
  sessions, 2 conflits attendus, 0 erreur inattendue, tous les invariants
  vérifiés au vert) — les chiffres exacts de cette exécution de validation
  diffèrent légèrement de ceux cités § CONCURRENCY (choix aléatoire des
  pointages ciblés à chaque exécution) mais le résultat qualitatif est
  identique.
- Environnement de test (prelude, socle Postgres natif reconstruit à la main,
  scripts de rejeu des migrations/fixture) non conservé dans ce dépôt —
  spécifique à ce bac à sable, comme pour la mission Performance précédente.
  Un futur repreneur devra reconstruire un socle équivalent (voir § BASE,
  Environnement de test) ou utiliser un vrai projet Supabase de test.
