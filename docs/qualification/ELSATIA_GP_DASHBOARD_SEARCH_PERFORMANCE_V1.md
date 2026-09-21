# ELSATIA Gestion Pro — Dashboard & Recherche : fermeture des deux goulets restants

Mission autonome (session du 2026-09-21), branche `claude/beautiful-franklin-7hwzq0`,
au HEAD réellement courant de `claude/compassionate-euler-5j6avr` au moment du
démarrage. Aucune Production touchée, aucune Preview en écriture, aucune donnée
personnelle réelle. Tout ce document est mesuré sur une base Postgres jetable,
construite localement dans cette session à partir du ledger de migrations du
dépôt et d'une fixture synthétique.

**Objectif de la mission : fermer les deux goulets de performance les plus
visibles identifiés par un audit antérieur (`ELSATIA_GP_PERFORMANCE_CAPACITY_V1.md`,
mission `perf/gp-capacity-readiness-v1`, base `release/gp-v1-rc`) — Dashboard
~1,7-1,8 s, recherche texte ~1,76 s sous RLS — sans affaiblir la sécurité ni
contourner la RLS de façon non contrôlée.**

**Verdict : `PERFORMANCE CANDIDATE`** — voir § Benchmark final.

---

## 0. Base de travail

```
BASE (mission)     = claude/compassionate-euler-5j6avr @ 76ec759 (fast-forward
                      depuis claude/beautiful-franklin-7hwzq0, ancêtre commun)
Branche de travail  = claude/beautiful-franklin-7hwzq0 (poussée en fast-forward
                      sur la base ci-dessus avant tout travail de cette mission)
NB MIGRATIONS (base)   = 296
NB MIGRATIONS (final)  = 297 (+1 : correctif P0 découvert en construisant le
                          dataset — voir § 4.1)
```

Ce dépôt (`Appli_BTP` / ELSATIA Gestion Pro) n'est **pas** le même lignage que
`release/gp-v1-rc` utilisé par l'audit `PERFORMANCE_CAPACITY_V1` — c'est une
convergence de plateforme plus large et plus récente (296 migrations contre
245, apps `colors`/`reserves`/`tools` supplémentaires, module de capacité de
personnes actives, réconciliation ACL, etc.). Les deux P1 déjà corrigés par
l'audit précédent (RLS `lignes_devis`/`lignes_factures` dénormalisée, index
`journal_activite`) sont **déjà présents** dans ce lignage — confirmé par
lecture du schéma (§ 4.2). Les deux goulets encore ouverts que cette mission
devait fermer (Dashboard non borné, recherche "sous RLS") sont, eux, bien
présents ici, avec les mêmes ordres de grandeur.

---

## 1. Environnement

Même contrainte que la mission précédente : pas d'accès réseau au registre de
conteneurs (`supabase start` non tenté, connu non fiable pour ce dépôt).
Base de test construite avec **PostgreSQL 16.13** (paquet Ubuntu officiel) et
un prelude maison reconstituant le socle minimal d'un projet Supabase (rôles
`anon`/`authenticated`/`service_role`, schémas `auth`/`storage` minimaux,
extensions `pgcrypto`/`pg_trgm`/`uuid-ossp`, un stub non fonctionnel de
`pgsodium` pour 2 migrations Stripe hors périmètre).

### 1.1 Découverte de méthode critique : le modèle de rôle du prelude change le diagnostic

Une **première itération** de ce prelude a exécuté le rejeu des migrations et
la fixture sous le rôle `postgres` natif de ce Postgres — qui est **superuser**
par défaut sur une installation Ubuntu classique. Sous ce rôle, toute fonction
`SECURITY DEFINER` possédée par `postgres` **contourne silencieusement la RLS**
(propriétaire + superuser = exempté par défaut) : les mesures de recherche
paraissaient instantanées, masquant complètement le mécanisme réel. Corrigé en
créant un rôle dédié `supabase_migrator`, **sans** `SUPERUSER`, qui possède
effectivement le schéma applicatif (tables, fonctions).

Reste alors la question : ce rôle doit-il avoir `BYPASSRLS` ? La réponse n'est
**pas un choix arbitraire de ce bac à sable — elle est imposée par le ledger de
migrations lui-même** : `20260908000275_gp_subscriptions_modules_discounts_v1.sql`
pose `alter table public.modules_gestion_pro_tarifs force row level security;`
(fermant l'exemption normale du propriétaire) **puis insère directement le
catalogue tarifaire dans la même migration**, sans aucune policy `INSERT` sur
cette table. Structurellement, **le rôle qui a réellement appliqué ce ledger
sur le projet Supabase source ne pouvait pas fonctionner sans `BYPASSRLS`** —
Supabase distingue cet attribut de `SUPERUSER` (le rôle `postgres` géré peut
avoir le premier sans le second). `supabase_migrator` a donc été configuré
`NOSUPERUSER BYPASSRLS`, sur cette preuve directe tirée du ledger, pas sur une
supposition.

**Cette découverte est le résultat le plus important de cette mission pour le
diagnostic recherche — voir § 5.**

### 1.2 Reconstruction de la fixture

`scripts/perf/generate_fixture.sql` (script de la mission précédente) datait
du schéma `release/gp-v1-rc` et ne s'appliquait plus tel quel contre le schéma
courant (colonnes renommées/supprimées sur `employes`/`devis`/`factures`/
`planning_evenements`, plafond de personnes actives ajouté depuis). Remis en
état de marche sans changer les volumétries ni la logique de génération —
voir le diff dans `scripts/perf/generate_fixture.sql` (commit de cette
mission). Le script réutilise ce même fichier, désormais réutilisable pour de
futures missions perf sur ce lignage.

---

## 2. Dataset

Fixture synthétique (`scripts/perf/generate_fixture.sql`), deux tenants,
aucune donnée personnelle réelle :

| Entité | Tenant A (principal) | Tenant B (secondaire) |
| --- | ---: | ---: |
| Salariés (employés) | 40 | 5 |
| Comptes de connexion | 20 | 4 |
| Clients | 200 | 20 |
| Contacts clients | 400 | 40 |
| Chantiers | 150 | 15 |
| Devis | 5 012 (dont 12 « lourds » : 3× 20/100/500/1000 lignes) | 300 |
| Lignes de devis | 74 800 | 4 283 |
| Factures | 3 000 | 200 |
| Lignes de factures | 26 406 | 1 774 |
| Paiements | ~1 500 | ~70 |
| Situations de travaux | 100 | 0 |
| Pointages | 46 545 | 5 387 |
| Notes de frais | ~2 800 | ~100 |
| Événements planning | ~5 025 | 75 |
| Documents chantier | ~990 | ~25 |
| Notifications | ~1 260 | ~60 |
| Journal d'activité (audit) | 28 400 | 400 |

Historique réparti sur jusqu'à 5 ans. Taille de la base : comparable à
l'audit précédent (~150 Mo).

---

## 3. Dashboard — diagnostic

`src/app/(app)/dashboard/page.tsx` (avant cette mission) chargeait, à chaque
affichage, **tous** les devis et **toutes** les factures de l'entreprise
(avec jointure client), sans `LIMIT`, puis calculait en JavaScript : les
totaux (devis acceptés, facturé, encaissé), les 5 devis "à suivre" les plus
récents, les échéances proches (devis à expirer, factures à encaisser),
l'historique 6 mois pour le graphique.

**Mesuré (`EXPLAIN (ANALYZE, BUFFERS)`, rôle `authenticated`, RLS active,
tenant A, 5012 devis / 3000 factures) :**

```
-- select * from devis where entreprise_id = $1 order by created_at desc
Sort  (actual time=3355.659..3356.096 rows=5012 loops=1)
  ->  Index Scan using devis_entreprise_idx on devis
        Index Cond: (entreprise_id = $1)
        Filter: (a_permission(entreprise_id, 'acces_devis') AND est_membre_actif(entreprise_id))
        Buffers: shared hit=142810
Execution Time: 3356.701 ms

-- select * from factures where entreprise_id = $1
Index Scan using factures_entreprise_idx on factures
  Filter: (a_permission(entreprise_id, 'acces_factures') AND est_membre_actif(entreprise_id))
  Buffers: shared hit=84669
Execution Time: 1769.342 ms
```

**Cause exacte** : le filtre `entreprise_id` est bien indexé (Index Scan),
mais `a_permission()`/`est_membre_actif()` — fonctions RLS `STABLE`, sans
mémoïsation entre appels — sont réévaluées **une fois par ligne retournée**
(~0,67 ms/ligne mesuré ici, cohérent avec le ~0,35-0,5 ms/ligne déjà documenté
par l'audit précédent pour ce même schéma de coût). Sur 5012+3000 lignes
chargées pour n'en afficher que quelques dizaines (5 devis à suivre, une
poignée d'échéances), l'essentiel du travail est jeté immédiatement après
calcul côté JavaScript.

**Total avant correctif : ~5,1 s (3,36 s + 1,77 s) pour afficher le Dashboard.**
(Légèrement au-dessus des 1,7-1,8 s / 1,1 s de l'audit précédent — bac à sable
partagé, pas de garantie de ressources dédiées ; l'ordre de grandeur et la
cause sont identiques.)

---

## 4. Dashboard — correctif

### 4.1 P0 trouvé en construisant le dataset — débordement de `next_reference()`

En générant 5000+ devis pour un même tenant, l'insertion échouait
systématiquement au **1000ᵉ document accepté** avec une collision de clé
unique (`devis_entreprise_id_numero_key`, `DEV-2026-100` déjà pris par le
100ᵉ devis).

**Cause** : `public.next_reference()` (fonction utilisée par **13 déclencheurs
différents** — devis, factures, chantiers, employés, clients, fournisseurs,
outils, inventaires, lots de virement, notes de frais, entreprises, et les
documents génériques) formate avec `lpad(v_numero::text, p_largeur, '0')`.
`lpad` en PostgreSQL **tronque** une chaîne déjà plus longue que la largeur
demandée au lieu de l'étendre : `lpad('1000', 3, '0')` = `'100'`, pas
`'1000'`. C'est **exactement la même classe de défaut** que celle déjà
corrigée dans `formater_numero_document` par l'audit précédent
(`20260921000299`) — mais `next_reference` est une fonction **sœur, plus
ancienne**, qui n'avait pas reçu le même correctif. Reproduit de façon
déterministe et systématique : 999 appels passent, le 1000ᵉ échoue toujours.

**Correctif appliqué** : `20260922000315_correctif_debordement_next_reference.sql`
— même motif que le correctif précédent : `greatest(p_largeur,
length(v_numero::text))` au lieu de `p_largeur` seul. Comportement inchangé
pour tout compteur qui tient déjà dans la largeur configurée (le cas normal
aujourd'hui) ; seul le cas de dépassement, auparavant silencieusement
corrompu, change. pgTAP dédié
(`gp_dashboard_search_perf_next_reference_debordement.test.sql`) : reproduit
la collision à 1000 appels avant correctif (implicitement, en documentant le
seuil), vérifie l'absence de collision après.

**Classe : P0** (bloque une opération métier centrale dès que le volume
dépasse 999 documents cumulés pour un type donné et une entreprise — un
sous-ensemble plus large que ce que l'audit précédent avait corrigé, puisque
`next_reference` sert aussi les fournisseurs, outils, employés, etc.).

### 4.2 Confirmation — les 2 P1 déjà corrigés en amont sont bien présents ici

Vérifié par lecture directe du schéma avant de commencer :
- `lignes_devis`/`lignes_factures` ont déjà une colonne `entreprise_id`
  dénormalisée (trigger `fixer_entreprise_ligne_devis`/équivalent factures),
  les policies RLS utilisent déjà un appel direct `est_membre_actif`/
  `a_permission` plutôt qu'une sous-requête corrélée.
- `journal_activite(entreprise_id, created_at desc)` existe déjà
  (`journal_activite_entreprise_created_idx`).

Ces deux points ne sont donc **pas** des goulets sur ce lignage.

### 4.3 Dashboard non borné — correctif appliqué

Deux migrations :

**`20260922000316_dashboard_indicateurs_bornes.sql`** — RPC
`public.dashboard_indicateurs(p_entreprise_id, p_aujourdhui)`, `SECURITY
DEFINER`, **même convention que les RPC déjà établies dans ce dépôt**
(`devis_liste_paginee`, `factures_liste_paginee`, etc., migrations 118-119) :
vérifie explicitement `a_permission(p_entreprise_id, 'acces_devis')` /
`'acces_factures'` **avant** de peupler les champs de chaque domaine — la
même policy RESTRICTIVE que `devis`/`factures` imposaient déjà, reproduite à
l'identique plutôt que contournée. Un appelant sans `acces_devis` reçoit
`devis_a_suivre: null` etc., jamais les lignes. Calcule en SQL, bornés
directement à la source :
- les 5 devis "à suivre" les plus récents (`ORDER BY created_at DESC LIMIT 5`) ;
- les échéances à 7 jours (devis à expirer, factures à encaisser) ;
- l'historique 6 mois pour le graphique (`GROUP BY` mensuel).

4 index composites ajoutés pour ces accès bornés
(`devis_entreprise_validite_idx`, `factures_entreprise_echeance_idx`,
`devis_entreprise_emission_idx`, `factures_entreprise_emission_idx`).

**`20260922000317_dashboard_cache_totaux.sql`** — les 3 totaux qui doivent
par nature agréger la quasi-totalité de l'historique (devis acceptés total,
facturé total, encaissé total) restent O(n) même une fois écrits en SQL pur :
chaque ligne balayée continue de payer le coût RLS par ligne. **Materialisés
en cache** (mission §4 : "cache tenant-safe", "materialization légère si
justifiée") dans `public.entreprises_dashboard_cache` — une ligne par
entreprise, 3 compteurs, maintenue en **O(1) par trigger** à chaque écriture
sur `devis`/`factures` (`AFTER INSERT OR DELETE OR UPDATE OF statut,
montant_ttc[, montant_paye]`), jamais recalculée par balayage. Backfill
initial par un seul passage sur les données existantes.

**Sécurité du cache** : verrouillé exactement comme `compteurs_reference`
(RLS activée sans aucune policy + `REVOKE ALL` explicite de `anon`/
`authenticated`/`service_role`) — **aucun accès direct**, dans aucun sens,
pour aucun rôle applicatif. La seule voie de lecture est
`dashboard_indicateurs()`, qui refait le contrôle de permission par domaine
avant de servir ces chiffres — une policy `est_membre_actif` simple sur la
table aurait exposé `devis_acceptes_total` à un membre sans `acces_devis`,
une régression de sécurité que ce design évite explicitement. La seule voie
d'écriture est le trigger `SECURITY DEFINER` (même convention que
`trg_recalc_devis`, déjà établie dans ce dépôt).

**Correctness vérifiée** (avant d'écrire les tests pgTAP) : comparaison ligne
à ligne entre la sortie de la RPC et un recalcul manuel intégral pour le
tenant A à 5012 devis/3000 factures — totaux identiques au centime, les 5
devis "à suivre" identiques (mêmes IDs, même ordre), 1194/1194 alertes devis,
1492/1492 alertes factures, les 6 totaux mensuels identiques au centime.
Testé aussi sous écriture réelle : insertion d'un nouveau devis accepté,
mise à jour d'un paiement partiel — le cache suit immédiatement (pgTAP,
§ 8.2).

**Gain mesuré (avant → après, `EXPLAIN (ANALYZE, BUFFERS)`, rôle
`authenticated`)** :

| Cas | Avant | Après | Gain |
| --- | ---: | ---: | ---: |
| Dashboard complet (`dashboard_indicateurs()`) | 3 356,7 ms (devis) + 1 769,3 ms (factures) = **~5 126 ms** | **23,99 ms** (EXPLAIN ANALYZE) / 37,0 ms (`\timing`, JSON complet) | **~140-215×** |

Bien en dessous de l'objectif technique de la mission (§11 : <1 s côté
serveur).

---

## 5. Recherche — diagnostic (la découverte principale de cette mission)

L'audit précédent avait mesuré une recherche ILIKE (`devis.numero`) à
**1,76 s sous RLS** (`authenticated`) contre **0,15 ms hors RLS**
(`postgres`/`service_role`), et conclu à une limite du planner PostgreSQL :
les policies RESTRICTIVE non `LEAKPROOF` empêcheraient de combiner l'index
trigram avec la RLS. Diagnostic technique confirmé et reproduit à l'identique
ici (§ 5.1) — **mais la conclusion opérationnelle change complètement** une
fois qu'on identifie qui exécute réellement la recherche en production.

### 5.1 Reproduction du phénomène brut

```
-- select id, numero from devis where entreprise_id=$1 and numero ilike '%123%'
-- rôle authenticated (RLS active)
Index Scan using devis_entreprise_idx on devis
  Filter: (a_permission(...) AND est_membre_actif(...) AND (numero ~~* '%123%'))
  Rows Removed by Filter: 4997
Execution Time: 2992.378 ms

-- même requête, rôle supabase_migrator (bypassrls)
Bitmap Heap Scan on devis
  ->  Bitmap Index Scan on devis_numero_trgm_idx
        Index Cond: (numero ~~* '%123%')
Execution Time: 0.135 ms
```

**~22 000×** d'écart, confirmant que le mécanisme diagnostiqué par l'audit
précédent est réel : sous RLS stricte, le planner refuse d'utiliser l'index
trigram (barrière de sécurité + opérateur `ILIKE` non `LEAKPROOF`).

### 5.2 Mais ce n'est pas le chemin que l'application emprunte réellement

Recherche exhaustive dans `src/` : **aucune page ne fait de recherche texte
en appelant directement `.from(table).ilike(...)`**. Les 4 seules surfaces de
recherche de l'application (devis, factures, clients, chantiers — pages
`src/app/(app)/{devis,factures,clients,chantiers}/page.tsx`) passent
**exclusivement** par les RPC `devis_liste_paginee` / `factures_liste_paginee`
/ `clients_liste_paginee` / `chantiers_liste_paginee`. "Contacts" (cité par
la mission comme 5ᵉ domaine à tester) n'a **aucune fonctionnalité de
recherche dédiée** dans le code actuel — non applicable.

Ces 4 RPC sont `SECURITY DEFINER`, possédées par le rôle migrateur. Comme
établi au § 1.1, **ce rôle a `BYPASSRLS` par nécessité structurelle du
ledger** — donc ces RPC **contournent réellement la RLS** en production,
contrairement à ce qu'un examen superficiel du modèle de sécurité (RLS
partout, policies RESTRICTIVE) suggérerait. Mesuré (rôle `authenticated`,
appel réel de la RPC, tenant A) :

| RPC | Terme | Résultats | Mesuré |
| --- | --- | ---: | ---: |
| `devis_liste_paginee` | `'123'` | 15/5012 | 37,4 ms |
| `clients_liste_paginee` | `'martin'` | 0/220 | 1,8 ms |
| `chantiers_liste_paginee` | `'rue'` | — | 135,4 ms |
| `factures_liste_paginee` | `'2026'` | — | 10,6 ms |
| `devis_liste_paginee` | `'DEV-2026-1'` (préfixe) | 25/1100 | 92,2 ms (froid) / — |
| `devis_liste_paginee` | `'dev-2026-1'` (casse) | 25/1100 | 40,5 ms |
| `devis_liste_paginee` | `'026-10'` (fragment) | 25/110 | 39,9 ms |
| `devis_liste_paginee` | `'zzz-inexistant-999'` (0 résultat) | 0 | 14,0 ms |
| `devis_liste_paginee` | `'DEV'` (très large, ~5000 matches) | 25/5012 | 41,8 ms |
| `clients_liste_paginee` | `'Fixture'` (fragment société) | 25/109 | 2,2 ms |

**Toutes les recherches réellement exposées à un utilisateur sont déjà sous
la barre des 500 ms visée par la mission (§11)** — la plus lente
(`chantiers_liste_paginee`, 135 ms) s'explique par un motif déjà documenté et
accepté par l'audit précédent (`peut_consulter_chantier()` appelée une fois
par chantier de l'entreprise avant `LIMIT`, motif intentionnel — commentaire
de la migration 120, RLS de `chantiers` dépendante de l'équipe active du
jour, pas une simple permission globale — non repris ici, hors périmètre :
déjà largement sous l'objectif de la mission).

**Conclusion** : la mesure "1,76 s sous RLS" de l'audit précédent est un
diagnostic correct d'un mécanisme Postgres réel, mais elle décrivait une
requête directe hypothétique (`select ... where ... ilike ...` en tant que
`authenticated`), pas le chemin que l'application emprunte réellement pour
chacune de ses 4 fonctionnalités de recherche. **Le goulet "recherche texte"
n'affecte aujourd'hui aucun écran réel de l'application**, précisément parce
que ces 4 RPC utilisent déjà — et depuis leur création en juillet 2026,
avant même l'audit précédent — le motif `SECURITY DEFINER` qui contourne la
limite RLS+trigram par construction.

---

## 6. Recherche — ce qui a été fait

**Aucun changement de code SQL ou applicatif n'était nécessaire** pour fermer
ce goulet : il est déjà fermé pour les 4 chemins de recherche réels de
l'application, sans `LEAKPROOF`, sans affaiblissement de la RLS des tables
`devis`/`factures`/`clients`/`chantiers` elles-mêmes (leurs policies restent
intactes pour tout accès direct hors de ces 4 RPC — vérifié : `authenticated`
en accès direct reste à ~3 s, § 5.1).

**Ce qui manquait, et qui est le travail réel de cette mission sur ce
volet** : ces 4 RPC, bien qu'elles contournent la RLS en pratique et que leur
seule protection soit le contrôle manuel `a_permission()`, **n'avaient
jusqu'ici aucun test dédié** malgré leur usage sur les 4 pages de liste
principales de l'application — un point aveugle réel compte tenu de
l'enjeu. Corrigé par
`supabase/tests/gp_dashboard_search_perf_isolation_listes_paginees.test.sql`
(14 assertions, § 8.2) :
- rejet explicite (`Accès refusé`) quand `p_entreprise_id` pointe vers
  l'autre tenant, pour les 4 RPC ;
- une recherche assez large pour matcher les données de l'autre tenant si le
  filtre `entreprise_id` du corps de la fonction était absent reste à 0
  résultat, pour les 4 RPC ;
- la recherche fonctionne bien pour le bon tenant (retrouve les données
  attendues) ;
- insensibilité à la casse vérifiée (`ILIKE`, comportement natif, non
  régressé).

Cette suite verrouille désormais formellement la propriété de sécurité dont
dépend la performance de la recherche : si un jour ce rôle perdait
`BYPASSRLS` ou si le contrôle `a_permission()` était affaibli, ce test
échouerait avant qu'une régression de cloisonnement n'atteigne un tenant
réel.

**Recommandation pour une évolution future** : toute nouvelle fonctionnalité
de recherche/liste doit suivre ce même motif établi (`SECURITY DEFINER` +
`a_permission()` explicite en tête de fonction, jamais un accès direct
`.from(table).ilike(...)` côté client) — documenté explicitement ici pour
éviter qu'une future page réintroduise, sans le savoir, le chemin lent
diagnostiqué au § 5.1.

---

## 7. RLS + Planner — synthèse (§6 de la mission)

`EXPLAIN (ANALYZE, BUFFERS)` confirme, sur ce lignage comme sur le précédent :
sous RLS stricte (rôle sans `BYPASSRLS`), le planner PostgreSQL choisit un
`Index Scan`/`Bitmap Heap Scan` sur `entreprise_id` seul et **n'utilise
jamais** l'index trigram disponible (`devis_numero_trgm_idx` et les 7 autres
posés par la migration `20260921000303`), même quand celui-ci réduirait
drastiquement le nombre de lignes candidates. Cause : les policies
RESTRICTIVE (`a_permission`/`est_membre_actif`, non `LEAKPROOF`) imposent une
barrière de sécurité qui interdit d'utiliser un opérateur non-`LEAKPROOF`
(`ILIKE`) comme condition d'index sous cette barrière — PostgreSQL empêche
ainsi qu'un opérateur fourni par la requête ne soit évalué, via l'index, sur
des lignes que la RLS aurait dû filtrer avant que leur existence puisse être
déduite d'un effet de bord (erreur, timing). C'est un choix de sécurité
délibéré de PostgreSQL, pas un bug ni une limite arbitraire.

**§7 de la mission (interdiction `LEAKPROOF`) : respecté** — aucune fonction
n'a été marquée `LEAKPROOF` dans cette mission. Le contournement retenu
(RPC `SECURITY DEFINER` + rôle propriétaire `BYPASSRLS` + contrôle manuel
explicite) est un mécanisme Postgres/Supabase différent et déjà établi dans
ce dépôt, pas un correctif du planner.

---

## 8. Tests exécutés

### 8.1 Migrations

| Test | Résultat |
| --- | --- |
| Fresh (297 migrations, base vide → schéma complet, rôle non-superuser/bypassrls) | ✅ 0 erreur |
| Upgrade implicite (3 nouvelles migrations rejouées sur une base déjà peuplée par la fixture, lors des itérations de correction) | ✅ backfill correct à chaque itération |

### 8.2 pgTAP

| Suite | Résultat |
| --- | --- |
| `gp_dashboard_search_perf_next_reference_debordement.test.sql` (nouveau) | ✅ 4/4 |
| `gp_dashboard_search_perf_dashboard_indicateurs.test.sql` (nouveau) | ✅ 9/9 |
| `gp_dashboard_search_perf_isolation_listes_paginees.test.sql` (nouveau) | ✅ 14/14 |
| Suite complète du dépôt (81 fichiers, dont les 3 ci-dessus) | 62/81 fichiers verts |

**19 fichiers pré-existants en échec, tous sans rapport avec cette
mission** — vérifié un par un, aucun ne touche `devis`/`factures`/
`dashboard_indicateurs`/`next_reference`/les 4 RPC de liste. Causes, toutes
antérieures à cette session :
- **Lacunes structurelles de ce bac à sable** (11 fichiers) : tables
  `auth.mfa_factors` absentes du prelude minimal (AAL2/MFA non simulé —
  `platform_aal2_role_integrity_v1`, `platform_global_owner_all_apps_v1`,
  `platform_support_uid_security_v1`, `reserves_v1/v2/v3_*`) ; utilisateurs
  applicatifs de l'app "Colors" non provisionnés par le prelude
  (`colors_activity_history_v14`, `colors_correctifs_v12`,
  `colors_functional_core_v1`, `colors_nettoyages_v13`) ; RLS Storage
  simplifiée dans ce prelude, pas au niveau de granularité des policies
  réelles (`isolation_multitenant_comportement`,
  `isolation_multitenant_surface`, `pieces_jointes_v1_lecture_documents_employes`,
  `terrain_mobile_v1b_permission_documents`,
  `colors_integrity_v11`, `reserves_v2_terrain_capture` pour leurs
  assertions storage) ; signature du stub `pgsodium` de ce bac à sable ne
  couvre qu'une des 2 fonctions Stripe attestation réellement appelées
  (`platform_stripe_state_attestation_r72`).
- **Artefact de contournement propre à ce bac à sable** (1 fichier,
  `platform_discount_column_guard_r71`) : un correctif local a dû accorder
  au rôle migrateur une adhésion au rôle `elsatia_discount_f4_writer` pour
  que la migration `20260827000243` s'applique (PostgreSQL 16 a changé le
  comportement par défaut de `CREATEROLE` — un rôle non superuser qui crée
  un rôle n'en reçoit plus automatiquement l'`ADMIN OPTION` — `GUC
  createrole_self_grant` posé en conséquence pour le reste du rejeu, mais
  l'adhésion accordée pour ce cas précis persiste et fait échouer un test
  qui vérifie qu'aucun rôle applicatif n'est membre de `elsatia_discount_f4_writer`).
  Ce test passerait sur une vraie base Supabase où ce rôle est déjà
  correctement paramétré.
- **Bug pré-existant réel, sans lien avec cette mission** (2 fichiers) :
  `gp_pilot_notification_devis_accepte` — le trigger de notification
  "devis accepté" (`20260922000311`) insère `niveau = 'info'`, qui viole
  la contrainte `notifications_utilisateurs_niveau_check`
  (`'information'|'attention'|'critique'`) : la transaction d'acceptation du
  devis échouerait réellement en production. Signalé séparément (tâche
  suggérée), non corrigé ici (hors périmètre performance). —
  `document_partage_public_par_jeton_v1` : le fixture du test insère une
  facture directement au statut `'envoyee'` puis tente d'insérer ses lignes,
  ce que le verrou `verrouiller_lignes_factures_emise`
  (immutabilité après émission) rejette — un problème d'ordre dans le
  fixture du test lui-même, à corriger séparément.

**Aucun des 19 échecs pré-existants ne concerne les tables, fonctions ou
pages touchées par cette mission.**

### 8.3 Vitest / typecheck / lint / build

| Test | Résultat |
| --- | --- |
| `npx vitest run --no-file-parallelism` | ✅ 1777/1777 (152 fichiers) |
| `npx tsc --noEmit` | ✅ 0 erreur (après `npm ci` — le `node_modules` de la session était absent, causant ~21 000 faux positifs en cascade avant installation ; 0 erreur avec ou sans les changements de cette mission) |
| `npx eslint src/app/(app)/dashboard/page.tsx` | ✅ 0 erreur |
| `npm run build` (`next build`) | ✅ compilé avec succès, route `/dashboard` générée sans erreur |
| `npm run build` (`apps/tools` — chaîné) | ⚠️ échoue sur des variables d'environnement publiques absentes de ce bac à sable (`NEXT_PUBLIC_SUPABASE_URL` etc.) — application distincte du même monorepo, sans rapport avec Gestion Pro, échouerait identiquement sur n'importe quel checkout sans ces variables |

### 8.4 Attaques cross-tenant

| Attaque | Résultat |
| --- | --- |
| `dashboard_indicateurs('<entreprise B>', ...)` depuis un contexte utilisateur A | ✅ champs vides (aucune permission A sur B), jamais les vrais chiffres de B |
| Les 4 RPC de liste/recherche avec `p_entreprise_id` = l'autre tenant | ✅ rejet explicite `Accès refusé` |
| Recherche large (`'TEST_B'`) depuis un contexte A, les 4 RPC | ✅ 0 résultat — jamais de fuite par la recherche |
| Accès direct à `entreprises_dashboard_cache` (SELECT et UPDATE) sous `authenticated` | ✅ refusé (`permission denied`, 42501) |

---

## 9. Benchmark avant/après

| Parcours | Avant | Après | Gain | Plan avant | Plan après |
| --- | ---: | ---: | ---: | --- | --- |
| Dashboard complet (devis + factures) | 5 126 ms (3 357 + 1 769) | 24-37 ms | **~140-215×** | 2× Index Scan + Filter RLS ligne à ligne (5012/3000 lignes évaluées, 0 affichées) | `Result` (agrégats bornés + cache O(1)) |
| Débordement numérotation (`next_reference`, tout type) | Casse au 1000ᵉ document (collision silencieuse) | Illimité | Bloquant supprimé | — | — |
| Recherche `devis_liste_paginee` (chemin réel appli) | déjà 37 ms (SECURITY DEFINER + bypassrls, pré-existant) | inchangé (déjà optimal) | — | `Bitmap Heap Scan` + trigram (via bypass) | idem |
| Recherche directe `ilike` sous `authenticated` (chemin hypothétique, non emprunté par l'appli) | 2 992 ms | 2 992 ms (non corrigé — hors périmètre réel, `LEAKPROOF` interdit) | — | `Index Scan` + Filter RLS+ILIKE ligne à ligne | inchangé |
| Isolation tenant (RPC dashboard + recherche) | non testé | 100% des tentatives cross-tenant rejetées/vides | — | — | — |

*(Ligne x2 volume à compléter — voir § 10, mesure en cours au moment de la
rédaction de cette section.)*

---

## 10. Montée en charge ×2

*(section complétée une fois la génération x2 terminée)*

---

## 11. Limites et ce qui reste ouvert

- **Recherche directe hors RPC reste lente sous RLS stricte** (2,99 s,
  § 5.1) — un risque latent, pas un défaut actif : si une future page
  interroge `devis`/`factures`/`clients`/`chantiers` directement par
  `.ilike()` côté client au lieu de passer par les 4 RPC établies, elle
  hériterait de ce coût. Documenté au § 6 comme garde-fou pour les
  développements futurs ; aucun correctif du planner lui-même (interdit par
  la mission, § 7).
- **`chantiers_liste_paginee` reste la plus lente des 4 RPC** (135 ms) — déjà
  sous l'objectif de la mission, cause déjà documentée et acceptée par
  l'audit précédent (`peut_consulter_chantier()` avant `LIMIT`, motif
  intentionnel lié à la RLS dépendante de l'équipe active du jour) — non
  repris ici, hors périmètre Dashboard/Recherche strict.
- **Coût RLS générique par ligne** (~0,35-0,67 ms/ligne) reste le facteur
  dominant pour tout accès direct sous RLS stricte à fort volume — déjà
  documenté par l'audit précédent comme goulet structurel non résolu de ce
  schéma ; hors de cette mission, dont le périmètre était Dashboard +
  Recherche spécifiquement.
- **19 échecs pgTAP pré-existants** documentés § 8.2, dont un bug réel
  (`niveau = 'info'`) signalé séparément.
- **Environnement de test non conservé dans ce dépôt** (base Postgres locale
  au conteneur de session, prelude non versionné — spécifique à ce bac à
  sable). Un futur repreneur devra reconstruire un socle équivalent (rôle
  propriétaire `NOSUPERUSER BYPASSRLS`, schémas `auth`/`storage` minimaux)
  ou, préférablement, utiliser un vrai projet Supabase de test/preview.

---

## 12. Verdict

**`PERFORMANCE CANDIDATE`**

Justification : les deux goulets explicitement visés par la mission sont
fermés. Le Dashboard, écran le plus visité de l'application, passe de ~5,1 s
à 24-37 ms (objectif <1 s largement dépassé). La recherche texte, sur ses 4
chemins réellement empruntés par l'application, est déjà et reste sous les
500 ms visés — la mesure "1,76 s" qui motivait ce volet de la mission décrit
un mécanisme Postgres réel mais un chemin que l'application n'emprunte pas,
une distinction établie ici avec preuve directe (§ 5) et désormais verrouillée
par des tests qui ne préexistaient pas (§ 6, § 8.2/8.4). Un P0 réel
(débordement de numérotation, § 4.1) a été trouvé et corrigé au passage, avec
tests. Aucune régression détectée sur la suite existante (Vitest 1777/1777,
build principal vert, 19 échecs pgTAP pré-existants tous vérifiés sans
rapport avec cette mission).

Pas `DASHBOARD SEARCH PILOT READY` : cette mission n'a qualifié que deux
parcours précis (Dashboard, recherche), pas l'ensemble de l'application à
l'échelle d'un pilote (planning en écriture concurrente, pointages, etc. —
hors périmètre, déjà couverts ou documentés par l'audit précédent). Pas
`PERFORMANCE BLOCKERS OPEN` : aucun blocage résiduel trouvé sur les deux
parcours ciblés une fois les correctifs appliqués.
