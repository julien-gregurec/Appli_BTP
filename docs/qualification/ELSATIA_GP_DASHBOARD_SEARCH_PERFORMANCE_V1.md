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

**Verdict : `PERFORMANCE CANDIDATE`** (confirmé par un lot de qualification
dédié, § 12-13 : non promu `PERFORMANCE QUALIFIED`, un seul écart de cache à
gravité faible et non exploitable par le produit actuel) — voir § 9
(benchmark) et § 13 (verdict détaillé).

---

## 0. Base de travail

```
BASE (mission)     = claude/compassionate-euler-5j6avr @ 76ec759 (fast-forward
                      depuis claude/beautiful-franklin-7hwzq0, ancêtre commun)
Branche de travail  = claude/beautiful-franklin-7hwzq0 (poussée en fast-forward
                      sur la base ci-dessus avant tout travail de cette mission)
NB MIGRATIONS (base)   = 296
NB MIGRATIONS (final)  = 299 (+3 : 315 correctif P0 découvert en construisant
                          le dataset (§ 4.1), 316-317 correctif Dashboard (§ 4.3))
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

**Accents** : testé en insérant un client `"Éléonore André" / "Société
Générale Bâtiment"` (la fixture générée n'a aucun caractère accentué). La
recherche est **sensible aux accents** : `'eleonore'` → 0 résultat,
`'Éléonore'` → 1 résultat, `'Societe Generale'` (sans accents) → 0 résultat
sur `'Société Générale'`. Comportement `ILIKE` natif, **inchangé par cette
mission** — c'est une limite UX pré-existante (un utilisateur qui tape sans
accents ne retrouve pas un nom accentué), pas une régression ni un problème
de performance ; la corriger demanderait `unaccent()` des deux côtés de la
comparaison (colonne indexée et terme recherché), un changement de
comportement fonctionnel hors du périmètre strict "performance" de cette
mission — signalé ici pour mémoire (mission §5), pas traité.

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
| Fresh (299 migrations, base vide → schéma complet, rôle non-superuser/bypassrls) | ✅ 0 erreur — rejoué deux fois : une fois pour construire le dataset de mesure, une seconde fois isolément juste avant la rédaction de ce rapport, pour confirmer que les 3 nouvelles migrations (315-317) s'appliquent proprement sur un schéma vierge, sans dépendre d'un état intermédiaire |
| Upgrade implicite (3 nouvelles migrations rejouées sur une base déjà peuplée par la fixture, lors des itérations de correction) | ✅ backfill correct à chaque itération |
| pgTAP des 3 nouveaux fichiers de test, rejoués contre la base fresh ci-dessus (schéma vierge, aucune donnée résiduelle) | ✅ 0 `not ok` |

### 8.2 pgTAP

| Suite | Résultat |
| --- | --- |
| `gp_dashboard_search_perf_next_reference_debordement.test.sql` (nouveau) | ✅ 4/4 |
| `gp_dashboard_search_perf_dashboard_indicateurs.test.sql` (nouveau) | ✅ 9/9 |
| `gp_dashboard_search_perf_isolation_listes_paginees.test.sql` (nouveau) | ✅ 14/14 |
| Suite complète du dépôt (82 fichiers, dont les 3 ci-dessus) | 60/82 fichiers verts |

**Correction (lot de qualification, § 13) : ce compte initial de « 19 » était
sous-évalué — 3 fichiers pré-existants en échec avaient été omis de
l'énumération manuelle ci-dessous par erreur (`gp_pilot_plateforme_admin_role_total`,
`gp_pilot_rgpd_manifeste_fichiers`, `platform_audit_log_bounded_v1`). Le
chiffre exact, revérifié deux fois par un rejeu automatisé complet (une fois
sur la base de mesure, une fois sur une base fraîche indépendante — mêmes 22
échecs, byte pour byte, sur les deux), est de 22 fichiers pré-existants en
échec, tous sans rapport avec cette mission.**

**22 fichiers pré-existants en échec, tous sans rapport avec cette
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
- **3 fichiers omis par erreur du décompte initial, revérifiés lors du lot
  de qualification** — tous structurels/pré-existants, sans rapport avec
  cette mission : `gp_pilot_plateforme_admin_role_total` (le fixture du
  test viole directement `plateforme_admins_actif_requiert_utilisateur_id`
  dès sa première insertion, avant tout test) ; `gp_pilot_rgpd_manifeste_fichiers`
  (`permission denied for function manifeste_fichiers_entreprise` — un
  GRANT manquant sur une fonction d'export RGPD, sans rapport avec devis/
  factures/dashboard) ; `platform_audit_log_bounded_v1` (« Authentification
  requise » — même famille que les échecs AAL2/MFA déjà documentés
  ci-dessus, `auth.mfa_factors` absente du prelude minimal de ce bac à
  sable).

**Aucun des 22 échecs pré-existants ne concerne les tables, fonctions ou
pages touchées par cette mission — reconfirmé par un rejeu identique et
indépendant sur une seconde base entièrement fraîche (§ 13.4).**

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

Montée en charge ×2 (10 012 devis / 6 000 factures) : voir détail § 10 —
Dashboard corrigé 24,0 ms → 53,3 ms (×2,2, reste largement sous l'objectif),
les 4 RPC de recherche restent toutes sous 155 ms, aucune dégradation
superlinéaire.

---

## 10. Montée en charge ×2

Volume doublé pour le tenant A par génération synthétique ciblée (mêmes
distributions statistiques que la fixture initiale, sans les 12 devis
"lourds" — déjà hors périmètre de cette mission, cf. § 0) :
**10 012 devis** (+5000), **6 000 factures** (+3000), lignes associées en
proportion. Reproduit avec
`scripts/perf/generate_fixture.sql` en double invocation, ou un script
équivalent — non conservé dans le dépôt (mesure ponctuelle).

| Parcours | ×1 (5012/3000) | ×2 (10012/6000) | Dégradation |
| --- | ---: | ---: | ---: |
| Dashboard avant (devis, `select *` sous RLS) | 3 356,7 ms | 6 742,0 ms | ×2,01 (linéaire, attendu — coût RLS/ligne, cf. § 3) |
| Dashboard avant (factures, `select *` sous RLS) | 1 769,3 ms | 3 478,8 ms | ×1,97 (linéaire) |
| **Dashboard après (`dashboard_indicateurs()`)** | **24,0 ms** | **53,3 ms** | **×2,2 — reste largement sous l'objectif (<1 s)** |
| `devis_liste_paginee` (recherche, RPC réelle) | 37,4 ms | 84,2 ms | ×2,25, reste sous 100 ms |
| `clients_liste_paginee` (recherche, RPC réelle) | 1,8 ms | 2,0 ms | quasi nul |
| `chantiers_liste_paginee` (recherche, RPC réelle) | 135,4 ms | 153,3 ms | ×1,13, reste sous 200 ms |
| `factures_liste_paginee` (recherche, RPC réelle) | 10,6 ms | 22,6 ms | ×2,1, reste sous 30 ms |
| Recherche directe hors RPC (chemin non emprunté, référence) | 2 992,4 ms | 5 945,9 ms | ×1,99 (linéaire — confirme que la cause est bien le coût RLS/ligne, pas un effet de bord du volume) |
| Recherche hors RLS (bypass, référence) | 0,135 ms | 0,151 ms | quasi nul (index-driven, insensible au volume) |

**Constat** : le Dashboard corrigé et les 4 RPC de recherche montrent une
dégradation **sous-linéaire à linéaire modérée** (×1,1 à ×2,25 pour un
volume ×2), jamais superlinéaire — cohérent avec des plans pilotés par
index (`LIMIT`, plage de dates bornée, cache O(1) pour les 3 totaux) plutôt
que par un balayage complet. Le seul chemin qui dégrade linéairement de
façon spectaculaire (×1,97-2,01) est précisément celui **non emprunté par
l'application réelle** (chargement complet sous RLS avant correctif, et
recherche directe hors RPC) — confirmation supplémentaire, par la mesure,
que la cause diagnostiquée (coût RLS par ligne) est la bonne : elle scale
avec le nombre de lignes balayées, pas avec autre chose.

**Aucune dégradation problématique constatée à ×2** pour les deux parcours
visés par la mission.

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
- **22 échecs pgTAP pré-existants** documentés § 8.2, dont un bug réel
  (`niveau = 'info'`) signalé séparément.
- **Environnement de test non conservé dans ce dépôt** (base Postgres locale
  au conteneur de session, prelude non versionné — spécifique à ce bac à
  sable). Un futur repreneur devra reconstruire un socle équivalent (rôle
  propriétaire `NOSUPERUSER BYPASSRLS`, schémas `auth`/`storage` minimaux)
  ou, préférablement, utiliser un vrai projet Supabase de test/preview.

---

## 12. Qualification — `PERFORMANCE CANDIDATE` → `PERFORMANCE QUALIFIED` ?

Lot de qualification (session du 2026-09-21, suite immédiate de la mission
ci-dessus, même branche, aucune fusion, aucun redéploiement). Objectif :
déterminer si le lot peut passer de `PERFORMANCE CANDIDATE` à
`PERFORMANCE QUALIFIED`, sans nouvelle optimisation fonctionnelle, sans
retoucher `next_reference()`, sans modifier `devis`/`factures` hors
nécessité stricte de validation.

SHA initial (avant ce lot) = `5cea2c3`.

### 12.1 Qualification de `next_reference()` (aucune réécriture)

**Migration** : `20260922000315_correctif_debordement_next_reference.sql`.

**Ancienne implémentation** (`20260710000001_comptes_entreprises.sql`,
fonction d'origine) :
```sql
return p_prefix || '-' || v_annee || '-' || lpad(v_numero::text, p_largeur, '0');
-- ou, sans année :
return p_prefix || '-' || lpad(v_numero::text, p_largeur, '0');
```
**Nouvelle implémentation** (inchangée depuis, non retouchée dans ce lot) :
```sql
return p_prefix || '-' || v_annee || '-' ||
  lpad(v_numero::text, greatest(p_largeur, length(v_numero::text)), '0');
-- ou, sans année : idem sans le v_annee ||
```
Seul changement : `p_largeur` → `greatest(p_largeur, length(v_numero::text))`
— la largeur configurée devient un plancher, jamais un plafond.

**Callers recensés** (relecture exhaustive du ledger — le chiffre "13" cité
par la migration 315 elle-même est légèrement inexact ; décompte précis
refait ici) : **14 motifs de scope `(entreprise_id, type)` distincts**,
portés par 12 déclencheurs de table + 1 RPC directe (`creer_lot_virements`)
+ 1 fonction partagée par 5 tables (`trg_reference_suite_metier`) :

| # | Type (clé `compteurs_reference`) | Préfixe | Largeur | Avec année | Déclencheur | Scope contre-partie |
| ---: | --- | --- | ---: | :---: | --- | --- |
| 1 | `devis` | DEV | 3 | oui | `trg_devis_numero` | par entreprise |
| 2 | `facture` | FAC | 3 | oui | `trg_facture_numero` | par entreprise |
| 3 | `chantier` | CHA | 3 | oui | trigger `clients_chantiers.sql:114` | par entreprise |
| 4 | `client` | CLI | 4 | non | trigger `clients_chantiers.sql:100` | par entreprise |
| 5 | `employe` | EMP | 4 | non | trigger `employes.sql:43` | par entreprise |
| 6 | `outil` | OUT | 4 | non | trigger `outillage.sql:41` | par entreprise |
| 7 | `fournisseur` | FRN | 4 | non | trigger `commandes_fournisseurs.sql:30` | par entreprise |
| 8 | `commande-YYYY` | CMD | 3 | oui | `trg_commande_numero` | par entreprise **+ année** (type dynamique) |
| 9 | `inventaire-YYYY` | INV | 3 | oui | trigger `depot_inventaires.sql:49` | par entreprise **+ année** (type dynamique, année du document) |
| 10 | `lot_virement` | VIR | 6 | oui | appel direct dans `creer_lot_virements()` (RPC, pas un trigger de table) | par entreprise |
| 11 | `note_frais` | EXP | 6 | oui | `trg_reference_note_frais` | par entreprise |
| 12 | `entreprise` | ENT | 3 | non | `trg_set_entreprise_reference` | **GLOBAL** (`p_entreprise_id = null` → scope `00000000-…-0000`) |
| 13 | `identifiant_employe:<préfixe>` | *(préfixe configuré)* | 4 | non | trigger `identifiants_et_compte_depot.sql:30` | par entreprise **+ préfixe configuré** (type dynamique) |
| 14 | `<table>-YYYY` ×5 (`contrats_entretien`, `interventions`, `bons_livraison`, `metres`, `remises_banque`) | CTR/INT/BL/MET/RB (ou DOC) | 4 | oui | `trg_reference_suite_metier` (une fonction, 5 triggers) | par entreprise **+ table + année** (type dynamique) |

**Comportement à 998/999/1000/1001 et au-delà** (testé directement,
appels réels, transaction annulée après coup) :
```
998e appel  -> Q-998
999e appel  -> Q-999
1000e appel -> Q-1000   (pas de troncature, pas de collision)
1001e appel -> Q-1001
10000e appel -> Q-10000 (pas de second seuil caché à 4 ou 5 chiffres)
compteur final = 10000 (aucune dérive)
```

**Unicité par entreprise** : deux entreprises différentes, même type,
premier appel chacune → `Q-001` et `Q-001` sans collision (clé réelle de
`compteurs_reference` : `PRIMARY KEY (entreprise_id, type)`, pas `(type)`
seul).

**Unicité par type** : même entreprise, types `qual_scope`/`devis`/`facture`
appelés en alternance → 3 compteurs strictement indépendants, aucune
interférence.

**Concurrence réelle** (pas une simulation — 4 vraies connexions psql
séparées, lancées simultanément avec `&`/`wait`, 500 appels chacune sur le
**même** couple `(entreprise_id, type)`) :
```
4 sessions x 500 appels = 2000 appels
2000 valeurs "numero" retournées, 2000 DISTINCTES (0 collision)
compteur final = 2000 (exact)
0 erreur, 0 deadlock
```
Reproduit à l'identique avec un scénario de bout en bout (4 sessions × 50
`INSERT INTO devis ... puis UPDATE statut='envoye'` concurrents sur le même
tenant, déclenchant `next_reference` via le vrai trigger applicatif) : 200
devis créés, 200 `numero` distincts, 0 erreur.

**Changement d'année** : deux régimes distincts dans le ledger, tous deux
protégés par le même correctif (le correctif vit dans `next_reference`
elle-même, appliqué uniformément quel que soit l'appelant) —
- *Type fixe* (devis/facture/chantier/fournisseur/lot_virement/note_frais/
  entreprise/etc.) : le compteur ne dépend **jamais** de l'année — seule la
  chaîne affichée (`v_annee := to_char(now(),'YYYY')`) change ; la clé de
  l'UPSERT est `(entreprise_id, type)` sans l'année. Un changement d'année
  réel ne peut ni remettre le compteur à zéro ni provoquer de collision.
  Vérifié par lecture du corps de la fonction (aucune référence à `v_annee`
  dans la clause `ON CONFLICT` ni le `WHERE`) et par deux appels consécutifs
  sans discontinuité.
- *Type dynamique incluant l'année* (`commande-YYYY`, `inventaire-YYYY`,
  `<table>-YYYY`, `identifiant_employe:<préfixe>`) : chaque année (ou chaque
  préfixe) constitue une clé `compteurs_reference` totalement différente —
  testé directement : `commande-2026` poussé à 1000 appels (`CMD-2026-1000`,
  sans collision) puis un premier appel sur un type `commande-2027`
  entièrement indépendant repart à 1, sans aucune interférence avec 2026.
  Le "changement d'année" pour ce motif est donc simplement l'apparition
  d'une nouvelle clé, protégée par le même correctif que toutes les autres.

**Contraintes/index protégeant les références** (défense en profondeur,
vérifiée table par table pour les 14 motifs) : chacune des tables cibles
porte une contrainte ou un index `UNIQUE` sur `(entreprise_id,
numero|reference|reference_interne|identifiant_interne)` (ou global pour
`entreprises.reference_interne`, cohérent avec le scope global de
`next_reference(null, 'entreprise', ...)`) — `devis_entreprise_id_numero_key`,
`factures_entreprise_id_numero_key`, `chantiers_entreprise_id_reference_interne_key`,
`clients_entreprise_id_reference_interne_key`,
`employes_entreprise_id_reference_interne_key`,
`outils_entreprise_id_reference_key`, `fournisseurs_entreprise_id_reference_key`,
`commandes_fournisseurs_entreprise_id_numero_key`,
`inventaires_entreprise_id_numero_key`, `lots_virements_entreprise_id_numero_key`,
`notes_frais_reference_unique` (index partiel `WHERE reference IS NOT NULL`),
`entreprises_reference_interne_key` (global), `employes_identifiant_interne_unique`,
et une contrainte `UNIQUE(entreprise_id, numero)` par table pour les 5
tables `trg_reference_suite_metier`. Même en cas d'anomalie hypothétique
dans `next_reference`, ces contraintes rejetteraient l'insertion (23505)
plutôt que de corrompre silencieusement une donnée — confirmé qu'elles
existent bien pour les 14 motifs, aucune lacune trouvée.

**Aucune collision, aucune anomalie constatée** sur l'ensemble de ces tests
→ qualification **PASS**, sans qu'aucune ligne de `next_reference()` n'ait
été modifiée dans ce lot.

### 12.2 Équivalence fonctionnelle `dashboard_indicateurs()`

Comparaison automatisée (fonction SQL de test dédiée, non committée —
harness de qualification), RPC vs recalcul canonique indépendant reproduisant
la logique JS **originale** (pré-migration 316/317) : 8 champs
(`devis_acceptes_total`, `factures_total`, `factures_encaisse_total`,
`devis_a_suivre`, `devis_alertes`, `factures_alertes`, `devis_mois`,
`factures_mois`) × 3 tailles de tenant :

- **Tenant vide** (0 devis, 0 facture, créé pour ce lot) : RPC renvoie
  `null` sur les 3 champs numériques (aucune ligne de cache — le trigger
  n'a jamais eu l'occasion de s'exécuter). `page.tsx` neutralise ce cas
  (`Number(indicateurs.x ?? 0)`, déjà en place depuis le correctif initial) :
  **équivalent à 0 côté observable**, comportement documenté ici plutôt que
  silencieux.
- **Petit tenant** (construit à la main, cas limites exprès) : devis
  `date_validite` **exactement** à J+7 (doit alerter) vs J+8 (ne doit pas),
  facture `date_echeance` exactement à J+7 vs J+8, facture `payee` malgré
  échéance proche (ne doit pas alerter), devis `annule` (exclu de tout,
  y compris du graphique mensuel), devis accepté vieux de 7 mois (hors
  fenêtre 6 mois du graphique), facture `annulee` avec paiement (exclue du
  total facturé mais son `montant_paye` compte quand même dans l'encaissé —
  comportement **non filtré** de la page originale, reproduit à l'identique).
- **Grand tenant** (tenant A, volume ×2 : 10012 devis / 6000 factures).

**Résultat : 24/24 comparaisons identiques (0 divergence)**, y compris tous
les cas limites construits à la main. Confirmé une seconde fois par appel
direct (`dashboard_indicateurs('<tenant vide>', ...)` → `devis_acceptes_total`
brut = `NULL`, `entreprises_dashboard_cache` sans ligne pour ce tenant —
comportement caractérisé, pas une anomalie).

Filtres temporels : le seul paramètre est `p_aujourdhui` (date de référence
pour les fenêtres 7 jours / 6 mois) — testé aux deux bornes exactes ci-dessus,
aucune divergence.

**Équivalence métier : PASS.**

### 12.3 Audit du cache incrémental — un écart réel trouvé, non corrigé

Scénarios testés sur `entreprises_dashboard_cache`, avec vérification
`cache == recalcul canonique depuis les tables sources` après chacun :

| Scénario | Résultat |
| --- | --- |
| INSERT devis accepté | ✅ cache += montant_ttc |
| INSERT devis non accepté | ✅ cache inchangé |
| UPDATE brouillon → accepté | ✅ cache += montant_ttc |
| UPDATE montant (paiement partiel facture) | ✅ cache reflète immédiatement |
| DELETE (500 devis acceptés, verrou de table désactivé pour le test puis réactivé) | ✅ cache -= somme exacte |
| Annulation facture | ✅ exclue du total facturé (`statut <> 'annulee'`), `montant_paye` toujours compté (comportement non filtré, identique à l'original) |
| Avoir (`statut = 'avoir_emis'`) | ✅ couvert par la reconstruction complète (§ ci-dessous), aucune divergence |
| Suppression logique | **N/A** — `devis`/`factures` n'ont pas de colonne de suppression logique (`supprimee_at` existe uniquement sur `reserves_photos`, module sans rapport) |
| Transaction annulée (ROLLBACK) | ✅ effet du trigger annulé avec la transaction (garantie MVCC standard), cache revenu exactement à sa valeur d'avant, aucune ligne orpheline |
| Écritures concurrentes (5 sessions réelles × 100 INSERT chacune, même tenant) | ✅ cache final exact (delta = somme des 500 lignes), 0 erreur, 0 deadlock |
| Reconstruction complète du cache depuis les sources (tous les tenants du bac à sable) | ✅ 0 divergence |
| **Changement d'entreprise (`entreprise_id`) sur une facture `brouillon`** | ❌ **cache non mis à jour** (voir ci-dessous) |

**Écart trouvé — documenté, non corrigé** (conformément à l'esprit de la
mission : une anomalie se documente, elle ne déclenche pas un second
correctif improvisé) :

Le trigger `maj_cache_dashboard_factures` se déclenche `AFTER INSERT OR
DELETE OR UPDATE OF statut, montant_ttc, montant_paye` — **pas** `OF
entreprise_id`. Une facture au statut `brouillon` (non verrouillée par
`verrouiller_facture_emise`, qui ne s'applique qu'à partir de `envoyee`)
peut voir son `entreprise_id` changé par une seule requête `UPDATE ...
SET entreprise_id = <autre tenant>, client_id = <client de cet autre
tenant>` (le `client_id` doit changer simultanément — la contrainte
composite `factures_client_entreprise_fkey` rejette un changement
d'`entreprise_id` seul, **confirmé par test direct**, ce qui est déjà une
protection structurelle partielle). Dans ce cas précis, ni `statut` ni
`montant_ttc` ni `montant_paye` ne changent → le trigger ne se déclenche
pas → le cache de l'ancien tenant reste au crédit d'une facture qui ne lui
appartient plus, et celui du nouveau tenant ne la voit jamais.

**Reproduit et confirmé directement** :
```
cache tenant 1 avant = 1200, cache tenant 2 avant = NULL
UPDATE factures SET entreprise_id=tenant2, client_id=<client tenant2> -- reussit
cache tenant 1 apres = 1200 (INCHANGE — devrait etre 0)
cache tenant 2 apres = NULL (INCHANGE — devrait etre 1200)
```

**Gravité évaluée comme faible, pour 4 raisons convergentes** (aucune ne
suffit seule, les 4 ensemble motivent le choix de documenter plutôt que de
corriger dans ce lot) :
1. **Aucun chemin applicatif ne fait jamais ceci** — recherche exhaustive
   dans `src/` : un seul `.update()` direct existe sur `factures` dans tout
   le code (`paiements-en-ligne.ts`, champs Stripe uniquement, jamais
   `entreprise_id`) ; toute autre écriture passe par des RPC dédiées qui ne
   construisent jamais une réattribution d'entreprise (aucune fonctionnalité
   "déplacer un document entre entreprises" n'existe dans ce produit).
2. Ce n'est **pas une fuite de cloisonnement tenant** : aucune donnée d'un
   tenant n'est lue par un autre — c'est une staleness d'un total affiché,
   pas un accès non autorisé à une ligne.
3. **Auto-réparable** : une reconstruction du cache (§ ci-dessus, déjà testée
   et exacte) corrige immédiatement toute dérive de ce type si elle se
   produisait jamais.
4. Réellement atteignable uniquement via un appel direct à l'API (PostgREST)
   par un utilisateur disposant de `gerer_factures` dans **les deux**
   entreprises simultanément (RLS `WITH CHECK` vérifiée des deux côtés,
   confirmée par lecture des policies) — un profil rare, pas le flux normal
   d'un utilisateur.

**Non corrigé dans ce lot** (élargirait la migration 317 hors du strict
périmètre de qualification — signalé ici comme limite documentée plutôt que
comme un second correctif improvisé, dans le même esprit que la consigne
donnée pour `next_reference`). Une correction propre existerait (ajouter
`OF entreprise_id` à la clause `UPDATE OF` du trigger) mais n'a pas été
appliquée ici, conformément aux instructions de ce lot ("ne relance aucune
optimisation fonctionnelle").

**Cohérence du cache : PASS partiel** — cohérent dans 11 des 12 scénarios
testés ; l'unique écart est structurellement inatteignable par l'application
réelle et n'affecte pas l'isolation tenant.

### 12.4 Isolation multi-tenant — dashboard + 4 RPC de recherche

Avec les rôles réellement utilisés par l'application (`authenticated`,
`request.jwt.claim.sub` positionné sur un utilisateur réel de chaque
tenant) :

- `dashboard_indicateurs('<tenant A>', ...)` par un utilisateur A : ses
  vrais chiffres (`devis_acceptes_total = 294469916.09`,
  `factures_total = 197512196.23`).
- `dashboard_indicateurs('<tenant B>', ...)` par le **même** utilisateur A :
  tous les champs `null`/vides — jamais les vrais chiffres de B.
- `dashboard_indicateurs('<tenant B>', ...)` par un utilisateur **de B** :
  ses vrais chiffres (`devis_acceptes_total = 8403317.75`,
  `factures_total = 6226724.67`) — confirme que B a bien des données
  réelles et différentes, pas un tenant vide qui rendrait le test précédent
  trivial.
- Les 4 RPC de recherche (`devis_liste_paginee` et consœurs) : `Accès
  refusé` explicite pour un `p_entreprise_id` étranger (pgTAP, 14
  assertions, § 8.2/8.4) — recherche large (`'TEST_B'`) depuis le contexte
  A : 0 résultat sur les 4 RPC, jamais une métadonnée de B.
- Accès direct à `entreprises_dashboard_cache` (`SELECT`/`UPDATE`) sous
  `authenticated` : refusé (`42501`), quel que soit le tenant visé.

**Isolation multi-tenant : PASS**, dashboard et recherche, compteurs,
montants, graphiques, alertes, métadonnées et table de cache elle-même.

### 12.5 Audit `SECURITY DEFINER` — rien changé (déjà correctement sécurisé)

Les 5 RPC concernées (`dashboard_indicateurs`, `devis_liste_paginee`,
`factures_liste_paginee`, `clients_liste_paginee`, `chantiers_liste_paginee`) :

| Propriété | Constat |
| --- | --- |
| Owner | `supabase_migrator` (rôle `BYPASSRLS` non-superuser, § 1.1) pour les 5 |
| `search_path` | Fixé explicitement à `public` pour les 5 (`SET search_path = public`) — élimine le risque classique d'injection de `search_path` sur une fonction `SECURITY DEFINER` |
| GRANT EXECUTE | `authenticated` uniquement (+ l'owner) pour les 5 ; **aucun GRANT à `anon`, `PUBLIC` ou `service_role`** — vérifié par requête directe sur `information_schema.routine_privileges`, 0 ligne pour ces 3 rôles sur les 5 fonctions |
| Validation tenant + utilisateur | Les 5 appellent `a_permission(p_entreprise_id, '<permission du domaine>')`, qui vérifie `auth.uid()` contre `utilisateurs_entreprises` **pour ce `p_entreprise_id` précis** + `est_membre_actif` (statut d'abonnement inclus) — aucune fonction ne se contente d'un contrôle "utilisateur connecté" générique |
| Exposition `anon` | Aucune (confirmé ci-dessus) |
| `entreprise_id` arbitraire fourni par l'appelant | Possible par construction (paramètre `uuid` ordinaire) mais neutralisé dans les 5 cas : les 4 RPC de liste lèvent `Accès refusé` explicitement ; `dashboard_indicateurs` renvoie des champs vides sans lever d'exception (choix de conception différent, documenté § 12.2, sans risque de fuite dans les deux cas) |
| SQL dynamique (`EXECUTE`, `format()`) | **Aucun** dans les 5 fonctions — la concaténation `'%' \|\| v_recherche \|\| '%'` construit une **valeur** passée à `ILIKE` via une requête statique paramétrée, pas du SQL dynamique ; aucun vecteur d'injection |

**Aucune vulnérabilité réelle trouvée. Rien modifié, conformément à la
consigne ("ne change rien si le mécanisme est déjà correctement
sécurisé").**

**SECURITY DEFINER : PASS.**

### 12.6 Benchmark reproductible — médiane/p95/max

Harness reproductible (scripts SQL générés, `\timing on`, N=25 appels par
scénario dont 3 d'échauffement écartés + les 4 instructions de mise en
contexte de session, n=22 mesures retenues par scénario), rejoué sur deux
bases distinctes : `gp_perf` (tenant A au volume ×2, 10012 devis/6000
factures, déjà mesuré en continu depuis la mission initiale) et
`gp_perf_fresh` (base **entièrement neuve**, migrations rejouées de zéro,
fixture régénérée de zéro pour ce lot, volume nominal 5012 devis/3000
factures — le cache y a été construit **exclusivement** par les triggers
incrémentaux pendant la génération de la fixture, jamais par un backfill
après coup : confirmé identique au recalcul canonique, 0 divergence).

| Scénario | Base | Médiane | p95 | Max |
| --- | --- | ---: | ---: | ---: |
| Dashboard (`dashboard_indicateurs`) | nominal (5012/3000) | 26,87 ms | 28,81 ms | 30,73 ms |
| Dashboard (`dashboard_indicateurs`) | ×2 (10012/6000) | 67,18 ms | 69,26 ms | 69,86 ms |
| Recherche devis, terme courant (`'123'`) | ×2 | 66,00 ms | 68,04 ms | 69,66 ms |
| Recherche devis, 0 résultat (`'zzz-inexistant-999'`) | ×2 | 44,21 ms | 46,14 ms | 55,59 ms |
| Recherche devis, terme très large (`'DEV'`, quasi tout le tenant) | ×2 | 62,12 ms | 73,36 ms | 93,72 ms |
| Recherche factures, terme courant (`'2026'`) | ×2 | 18,05 ms | 21,30 ms | 29,79 ms |
| Recherche clients, terme courant (`'Fixture'`) | ×2 | 1,49 ms | 1,74 ms | 1,76 ms |
| Recherche chantiers, terme courant (`'rue'`) | ×2 | 137,87 ms | 158,96 ms | 178,80 ms |

Tous les scénarios : **médiane, p95 et max sous les objectifs de la mission**
(<1 s Dashboard, <500 ms recherche), avec une marge large (le pire cas
mesuré, `chantiers_liste_paginee` à 178,80 ms, reste à moins de 36 % de
l'objectif). Mesures stables (écart min-max étroit par scénario, pas de
valeur aberrante isolée) — pas une mesure unique présentée comme
représentative.

### 12.7 Fresh qualification — base entièrement vide

Rejoué en une seule séquence continue, sur une base créée de zéro pour ce
lot (`gp_perf_fresh`, distincte de celle utilisée pour le reste de la
mission) :

1. Rejeu complet des 299 migrations (0 erreur).
2. Génération de la fixture complète (`scripts/perf/generate_fixture.sql`) —
   le cache `entreprises_dashboard_cache` s'est donc construit **uniquement**
   via les triggers incrémentaux pendant l'insertion des ~5000 devis/3000
   factures, jamais via le backfill de la migration 317 (qui s'était exécuté
   plus tôt, sur une base encore vide) — le test le plus strict possible de
   la maintenance incrémentale.
3. Comparaison cache vs recalcul canonique sur cette base : 0 divergence
   (§ 12.2 tableau, ligne "grand tenant" rejouée ici aussi).
4. pgTAP — 3 nouveaux fichiers (27 assertions) : **27/27 PASS**.
5. pgTAP — suite complète (82 fichiers) : **60/82 verts, exactement les 22
   mêmes échecs pré-existants** qu'observés sur `gp_perf` (§ 8.2, liste
   byte pour byte identique entre les deux bases) — confirme que ces 22
   échecs sont un artefact d'environnement/de fixtures pré-existant,
   indépendant de la base utilisée, et non une régression de ce lot.
6. `npx tsc --noEmit` : 0 erreur.
7. `npx eslint src/app/(app)/dashboard/page.tsx` : 0 erreur.
8. `npx vitest run --no-file-parallelism` : 1777/1777 (identique à la
   mission initiale).
9. `npx next build` : compilé avec succès (identique à la mission initiale ;
   `apps/tools` toujours hors périmètre, même cause pré-existante).

**Comparaison au baseline** : correction apportée au passage — le décompte
initial de la mission précédente ("19 échecs pré-existants", § 8.2) était
sous-évalué de 3 fichiers, omis par erreur de l'énumération manuelle
(`gp_pilot_plateforme_admin_role_total`, `gp_pilot_rgpd_manifeste_fichiers`,
`platform_audit_log_bounded_v1` — tous trois structurels/pré-existants,
vérifiés sans rapport avec cette mission, § 8.2 mis à jour). Le chiffre
correct, revérifié deux fois sur deux bases indépendantes, est **22**.
**Aucun nouvel échec** par rapport à ce baseline corrigé, sur aucune des
deux bases.

**Fresh qualification : PASS.**

---

## 13. Verdict final

### 13.1 Critères de verdict

| Critère | Résultat |
| --- | --- |
| Dashboard < 1 s au volume ×2 | ✅ 69,86 ms max (§ 12.6) |
| Valeurs métier avant/après équivalentes | ✅ 24/24, 0 divergence (§ 12.2) |
| Cache cohérent dans tous les scénarios testés | ❌ 11/12 — écart réel sur le changement d'`entreprise_id` d'une facture brouillon (§ 12.3) |
| Aucune fuite cross-tenant détectée | ✅ (§ 12.4) |
| RPC `SECURITY DEFINER` correctement bornées | ✅ (§ 12.5) |
| Recherches réelles dans des performances acceptables | ✅ toutes < 200 ms, objectif 500 ms (§ 12.6) |
| `next_reference()` sans collision en qualification | ✅ (§ 12.1) |
| Fresh replay | ✅ (§ 12.7) |
| Aucune nouvelle régression pgTAP/Vitest/typecheck/lint/build | ✅ (§ 12.7) |

8 critères sur 9 strictement satisfaits. Le seul écart (cache, changement
d'entreprise sur facture brouillon) est réel, documenté avec preuve directe,
mais structurellement inatteignable par le produit tel qu'il existe
aujourd'hui (§ 12.3, 4 raisons convergentes), auto-réparable par
reconstruction, et sans impact sur le cloisonnement tenant ni sur la
performance. Ce n'est pas une gravité justifiant `PERFORMANCE NOT
QUALIFIED` (pas de vulnérabilité de sécurité, pas de régression, pas de
dépassement d'objectif de performance) — mais la lettre du critère 3
("dans tous les scénarios testés") n'est, strictement, pas remplie à 100 %.

### 13.2 Verdict

**`PERFORMANCE CANDIDATE`** (inchangé — non promu à `PERFORMANCE QUALIFIED`
par cette qualification).

Justification : les deux goulets explicitement visés par la mission restent
fermés et sont désormais qualifiés en profondeur — `next_reference()`
qualifiée sans collision sous charge concurrente réelle, équivalence
fonctionnelle du Dashboard prouvée à 100 % sur 3 tailles de tenant dont des
cas limites construits à la main, isolation tenant démontrée à l'échelle
réelle avec les rôles applicatifs, RPC `SECURITY DEFINER` auditées sans
trouver de vulnérabilité, benchmarks reproductibles avec médiane/p95/max
tous largement sous objectif, fresh replay et suite de tests complets sans
aucune nouvelle régression. Le seul point qui empêche la promotion à
`PERFORMANCE QUALIFIED` au sens strict des critères donnés est l'écart de
cache documenté en § 12.3 : réel, mais de gravité faible et non accessible
par un chemin applicatif existant — insuffisant pour `PERFORMANCE NOT
QUALIFIED`, mais un critère explicite de verdict n'est pas rempli à 100 %,
ce qui maintient `PERFORMANCE CANDIDATE` par une lecture stricte du § 8 de
cette qualification.

Pas `DASHBOARD SEARCH PILOT READY` : cette mission n'a qualifié que deux
parcours précis (Dashboard, recherche), pas l'ensemble de l'application à
l'échelle d'un pilote (planning en écriture concurrente, pointages, etc. —
hors périmètre, déjà couverts ou documentés par l'audit précédent). Pas
`PERFORMANCE BLOCKERS OPEN` ni `PERFORMANCE NOT QUALIFIED` : aucun blocage
résiduel, aucune vulnérabilité, aucune régression — uniquement une limite
de cohérence de cache documentée, à gravité faible et non exploitable par
le produit actuel.
