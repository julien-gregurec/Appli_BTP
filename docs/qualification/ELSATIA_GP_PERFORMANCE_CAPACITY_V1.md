# ELSATIA Gestion Pro — Qualification de capacité et performance V1

Mission autonome (session du 2026-09-20/21), branche `perf/gp-capacity-readiness-v1`.
Aucune Production touchée, aucune Preview en écriture, aucune donnée personnelle réelle.
Tout ce document est mesuré sur une base Postgres jetable, construite localement dans
cette session à partir du ledger de migrations de la RC et d'une fixture synthétique.

**Question posée : Gestion Pro reste-t-il utilisable avec une vraie PME BTP de 20 à 40
salariés, plusieurs années de données et plusieurs utilisateurs simultanés ?**

**Verdict : `PILOT CAPACITY READY`** — voir § Benchmark final pour le détail et les
conditions.

---

## 0. Base de travail

```
BASE         = TIP = origin/release/gp-v1-rc @ 8caef2189fafe5e4eaff5d1c375d7385a524d114
               (2026-09-14 23:29:38), identique à origin/integration/gp-external-pilot-closure-v1
LEDGER       = 20260710000001 → 20260914000298
NB MIGRATIONS (base)  = 240
NB MIGRATIONS (final) = 245 (+5 : 299 à 303, cette mission)
Branche      = perf/gp-capacity-readiness-v1
```

`release/gp-v1-rc` a été identifiée comme train le plus récemment qualifié : c'est la
release candidate reconstruite pour GP V1 (voir
`docs/gp-v1/preview/RUNBOOK_MIGRATIONS_PRODUCTION_GP_V1.md`), qualifiée le 2026-09-14
(239→240 migrations, pgTAP 920/920, vitest 1147/1151, préparée pour Production mais
**jamais jouée**). `integration/gp-external-pilot-closure-v1` pointe sur le même commit :
convergence confirmée. `feat/gp-v1-metier-devis-planning-references-v1` (même date) a été
écartée : 258 commits/1380 fichiers, périmètre plateforme hors sujet GP V1, explicitement
abandonnée comme source de Production par le runbook lui-même.

---

## 1. Environnement

Écart méthodologique assumé et documenté : cette session n'a pas d'accès réseau au
registre de conteneurs `public.ecr.aws` (politique du bac à sable — confirmé via
`curl $HTTPS_PROXY/__agentproxy/status`, refus 403 sur `cloudfront.net`, non contourné).
Impossible de reproduire l'image `supabase/postgres:17.6.1.143` utilisée par la RC. Base
de test construite à la place avec :

* **PostgreSQL 16.15** (paquet Ubuntu officiel, `apt install postgresql-16`), pas
  Postgres 17 (le projet cible `major_version = 17`). Écart mineur : aucune migration du
  ledger n'utilise de fonctionnalité propre à Postgres 17 (vérifié — pas de nouveauté
  syntaxique récente employée) ; risque résiduel jugé faible mais **non nul, à revérifier
  sur un vrai Postgres 17 avant tout déploiement**.
* **Un "prelude" maison** (`/root/perfwork/prelude.sql`, non versionné — reconstruit à
  partir de ce que les migrations elles-mêmes révèlent, ex. la migration 297 qui *révoque*
  les privilèges par défaut légués, preuve qu'ils existaient) : rôles `anon` /
  `authenticated` / `service_role`, schéma `auth` minimal (table `users`, fonctions
  `uid()`/`role()`/`jwt()`/`email()` lisant des GUC `request.jwt.claim.*`, à la manière de
  PostgREST), schéma `storage` minimal (`buckets`, `objects`, `foldername()`), extension
  `pgcrypto`. **Ceci n'est pas une reproduction de la sécurité réelle de Supabase (JWT non
  vérifié) — uniquement un socle pour que les 240+ migrations s'appliquent et que la RLS
  soit exerçable.**
* Un bug de méthode trouvé et corrigé en cours de route : le prelude initial oubliait le
  bootstrap `ALTER DEFAULT PRIVILEGES ... GRANT ... TO anon, authenticated, service_role`
  qu'un projet Supabase pose une fois à sa création (preuve : la migration 297 le
  *révoque* pour les tables futures uniquement — ce qui n'a de sens que s'il existait).
  Sans ce correctif, `lignes_devis`/`lignes_factures` étaient totalement inaccessibles au
  rôle `authenticated` dans ce test (`permission denied`), ce qui aurait faussé toute la
  suite. Corrigé avant de commencer à mesurer.

Docker est disponible dans ce bac à sable (démon lancé manuellement,
`public.ecr.aws`/Docker Hub restent bloqués par la politique réseau) — pas utilisé au
final, la voie Postgres natif + prelude s'est avérée plus rapide et suffisante.

`supabase start` n'a pas été tenté : le runbook RC documente déjà cet environnement comme
non fiable pour ce dépôt (containers `supabase_analytics`/`supabase_vector` en échec, CLI
qui reste bloquée indéfiniment) — confirmé cohérent avec l'approche « Postgres brut +
migrations rejouées à la main » déjà utilisée pour la répétition générale RC.

---

## 2. Dataset

Fixture synthétique générée par `scripts/perf/generate_fixture.sql` (nouveau script,
~470 lignes SQL, idempotent via reset+replay, seed déterministe `setseed(0.42)`).
Aucune donnée personnelle réelle — noms, emails (`@perf.invalid`), adresses et SIRET
sont tous fictifs et générés.

| Entité | Tenant A (BTP Fixture Principale) | Tenant B (secondaire, contrôle cloisonnement) |
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
| Situations de travaux | 100 (25 chantiers × 4) | 0 |
| Pointages | 46 545 | 5 387 |
| Notes de frais | ~2 800 | ~100 |
| Événements planning | 4 950 (+ fenêtre récente dense ~450) | 75 |
| Documents chantier (métadonnées) | ~800 | ~25 |
| Notifications | ~1 200 | ~60 |
| Journal d'activité (audit) | 28 000 | 400 |

Historique : dates réparties sur jusqu'à 5 ans (`current_date - 5 years` à aujourd'hui),
ancienneté moyenne des salariés ≈ 2,5 ans (entrées uniformément réparties sur la fenêtre).
Taille de la base : ~145 Mo (schéma + fixture).

**Écart assumé sur le volume de pointages** : cible mission « 100 000+ si raisonnable ».
Obtenu : 46 545 (tenant A) avec 1 à 3 pointages/jour ouvré (dont samedi occasionnel) sur
l'ancienneté réelle de chaque salarié. Le calcul : 40 salariés × ancienneté moyenne 2,5 ans
× ~230 j ouvrés/an × ~1,9 pointage/jour ≈ 44 000, cohérent avec le résultat obtenu.
Atteindre 100 000+ aurait exigé soit un effectif > 40 (hors spécification), soit un
rythme de pointage multi-quotidien peu réaliste. Jugé « raisonnable » de conserver le
volume réellement plausible pour 40 salariés plutôt que de forcer un chiffre rond au prix
du réalisme — c'est aussi la table la mieux indexée du schéma (voir § Pointages), donc
celle où un delta de volume change le moins le diagnostic.

---

## 3. Baseline et méthode de mesure

Mesures `EXPLAIN (ANALYZE, BUFFERS)` sous le rôle `authenticated`, RLS active, en
émulant un utilisateur réel du tenant A (`request.jwt.claim.sub` sur un compte fixe créé
par la fixture, membre actif avec toutes les permissions — hypothèse simplificatrice
documentée : ce n'est pas une matrice de droits fins, la mission qualifie le volume/perf,
pas les permissions, déjà couvertes par les audits RLS existants du dépôt).

Un biais de méthode a été détecté et corrigé en cours de mesure : une première version
du banc de test pointages comparait `date >= (current_date - interval '30 days')`, où
`current_date - interval` renvoie un `timestamp`, empêchant l'utilisation complète de
l'index `(entreprise_id, date)` (borne haute seule poussée en `Index Cond`, borne basse
reléguée en filtre résiduel) — mesuré 22,5 s au lieu de 0,73 s pour la même requête bien
typée. Vérifié que le code applicatif réel (`pointage/gestion/page.tsx`) utilise bien
`.gte("date", debut).lte("date", fin)` avec des chaînes `'YYYY-MM-DD'` — comparaison
correctement typée côté PostgREST. **Le chiffre de 22,5 s ne figure donc dans aucun
résultat ci-dessous : c'était un artefact du banc de test, pas un défaut de l'application.**
Signalé ici par souci de rigueur (une mesure fausse est pire que pas de mesure).

---

## 4. SQL — indexes, RLS, requêtes

### 4.1 Analyse des index existants

240 migrations posent déjà 561 index sur 180 tables. Un précédent correctif de capacité
existe déjà dans le ledger : `20260719000116_index_entreprise_id.sql`, qui a ajouté
l'index `entreprise_id` sur 51 tables après un incident Production mesuré à 1,1–6,5 s par
page (RLS réévaluée ligne à ligne, aucun index sur la colonne que **toute** requête de
cette application multi-tenant filtre). C'est le même type de défaut que cette mission a
retrouvé plus loin dans le schéma (§ 4.2, § 4.3) : la maladie n'a pas disparu, elle a
migré vers les tables ajoutées depuis.

### 4.2 P0 trouvé — débordement de la numérotation des documents

En construisant la fixture (5000+ devis, plusieurs années), la numérotation des devis a
produit des collisions déterministes (`duplicate key value violates unique constraint
"devis_entreprise_id_numero_key"`, ex. `DEV-2022-100` attribué deux fois).

**Cause réelle** : `formater_numero_document()` (migration 294) fait
`lpad(p_numero::text, greatest(p_largeur, 1), '0')` avec une largeur par défaut de 3.
`lpad` en PostgreSQL **tronque** une chaîne déjà plus longue que la largeur demandée (il
ne l'étend pas) : `lpad('1000', 3, '0')` = `'100'`, pas `'1000'`. Le compteur
(`compteurs_reference`) ne se remet jamais à zéro par défaut (`compteur_annuel = false`,
comportement historique documenté et volontaire) — il grandit sans limite pour une
entreprise. Dès que le 1000ᵉ devis (ou facture, ou avoir, ou commande — même fonction
partagée) est émis, son numéro est tronqué sur 3 caractères et entre en collision avec un
numéro déjà attribué : **l'émission du document suivant échoue avec une erreur 23505**,
visible utilisateur comme une opération de sauvegarde qui échoue sans raison apparente.

C'est un défaut de **capacité**, pas un bug théorique : une PME BTP active (plusieurs
devis/jour) franchit 999 devis cumulés en moins d'un an. Aucun test existant (pgTAP ou
Vitest) n'exerçait ce cas — la suite `gp_v1_numerotation_documents.test.sql` teste le
format, pas le débordement.

**Correctif appliqué** : `supabase/migrations/20260921000299_...sql` — remplace
`greatest(p_largeur, 1)` par `greatest(p_largeur, length(p_numero::text), 1)` (la largeur
configurée devient un plancher, jamais un plafond). Comportement inchangé pour tout
compteur ≤ 999 (le cas normal aujourd'hui). Vérifié : `formater_numero_document('DEV',
true, false, '-', 3, 1000, '2023-01-01')` → `'DEV-2023-1000'` (au lieu de `'DEV-2023-100'`
en collision).

**Classe : P0** (bloque une opération métier centrale — impossible d'émettre le devis ou
la facture suivante — dès que le volume dépasse 999 documents cumulés pour un type donné
et une entreprise).

### 4.3 P1 trouvé et corrigé — RLS des lignes de devis/factures

`lignes_devis` et `lignes_factures` sont les deux seules tables « lignes » du schéma sans
colonne `entreprise_id` propre (leurs tables sœurs plus récentes, `devis_ouvrages` et
`lignes_devis_couts`, migration 282, l'ont déjà). Leurs 5 policies RLS (membres / lecture
selon permission / gestion insert / update / delete) vérifient l'appartenance via
`EXISTS (SELECT 1 FROM devis WHERE id = lignes_devis.devis_id AND
est_membre_actif(...))` — une sous-requête corrélée par ligne, par policy applicable (2
pour un SELECT : la permissive et la restrictive).

Mesuré, devis à 1000 lignes (généré par la fixture) : **1,10 s**, 70 058 buffers, plan
montrant explicitement 2 `SubPlan` — deux `Index Only Scan` vers `devis` par ligne
(2000 exécutions de `a_permission`/`est_membre_actif` au total pour 1000 lignes). Sur une
facture à 51 lignes : 54 ms (≈1 ms/ligne, même motif).

**Correctif appliqué** : `20260921000300_...sql` — dénormalise `entreprise_id` sur les
deux tables (colonne + FK composite `(devis_id, entreprise_id) → devis(id,
entreprise_id)`, exactement le motif déjà en place pour `devis_ouvrages` ; un trigger
`BEFORE INSERT/UPDATE OF devis_id` dérive systématiquement la valeur depuis le parent —
**aucun changement de code applicatif requis**, y compris pour
`enregistrer_devis_brouillon_v2` qui n'insère pas cette colonne). Les 5 policies de
chaque table passent d'une sous-requête corrélée à un appel direct
`est_membre_actif(entreprise_id)` / `a_permission(entreprise_id, ...)`.

Revue indépendante (agent dédié, § 8) : a confirmé l'absence de risque de divergence
`entreprise_id` (aucun chemin d'écriture — migrations ou code applicatif — ne modifie
`devis_id`/`facture_id` sur une ligne existante), la solidité de la FK composite comme
seconde barrière même hors RLS, et a trouvé un écart réel mais non exploitable (policies
`lecture_..._selon_permission` recréées sans la clause `to authenticated`, donc
applicables à `PUBLIC` au lieu de `authenticated` seul — sans effet sur l'accès réel
puisque la policy permissive `membres` bloque déjà tout rôle non membre). **Corrigé**
avant la mesure finale.

**Gain mesuré (avant → après)** :

| Cas | Avant | Après | Gain |
| --- | ---: | ---: | ---: |
| Ouverture devis 1000 lignes | 1 097 ms | 357–381 ms | ~2,9× |
| Ouverture devis 20 lignes | 21,5 ms | 7,7–8,3 ms | ~2,7× |
| Ouverture facture 51 lignes | 54,3 ms | 18–19 ms | ~2,9× |

**Ce qui reste** : même après le correctif, le coût residuel (~0,35 ms/ligne) vient de
`a_permission()`/`est_membre_actif()` elles-mêmes, appelées une fois par ligne retournée
sans mémoïsation — PostgreSQL ne met pas en cache un appel de fonction `STABLE` répété
avec le même argument au sein d'une requête (sauf cas particuliers de `Memoize` sur les
jointures, observé ailleurs dans ce rapport mais pas ici). C'est un goulet plus profond,
commun à la quasi-totalité des requêtes de ce schéma (voir § Goulets ouverts, #1).

**Classe : P1** (dégrade fortement l'expérience — pas de blocage, mais un devis à 500-1000
lignes, plausible en gros œuvre/second œuvre avec beaucoup de postes, devenait
perceptiblement lent).

### 4.4 P1 trouvé et corrigé — index manquant, `journal_activite`

`journal_activite(entreprise_id)` existe (migration 116) mais pas
`(entreprise_id, created_at desc)`. Mesuré : `... where entreprise_id = $1 order by
created_at desc limit 50` → **9,88 s** sur 28 400 lignes (Seq Scan complet + tri, car
quasi toute la table appartient au même tenant dans cette fixture à 2 tenants — un écran
réel sur une plateforme à des centaines de tenants verrait un gain encore plus net grâce à
la sélectivité de `entreprise_id`).

**Précision importante** : aucune page de l'application ne lit aujourd'hui
`journal_activite` (recherche exhaustive dans `src/` : seulement des `INSERT`, depuis
`documents-envoi.ts` et `signatures-documents.ts`). Ce n'est donc **pas un P1 mesuré en
usage réel actuel** — c'est un correctif préventif avant qu'un écran d'audit ne soit
construit sur cette table, avec le même motif que toutes les autres listes du schéma.

**Correctif appliqué** : `20260921000301_...sql` — index
`(entreprise_id, created_at desc)`.

**Gain mesuré** : 9,88 s → **17–19 ms** (≈530×). Confirme que l'absence d'un index de tri
composite est le facteur dominant ici, davantage que le coût RLS par ligne (qui reste
présent mais n'a plus à s'appliquer à 28 000 lignes avant le LIMIT).

### 4.5 P2 documenté, non corrigé — recherche ILIKE sans trigram, ET limite du planner sous RLS

`devis_liste_paginee`/`factures_liste_paginee`/`clients_liste_paginee`/
`chantiers_liste_paginee` (migrations 118-121, déjà pagination-fixées en juillet) filtrent
par `... ilike '%' || recherche || '%'` sur plusieurs colonnes sans aucun index adapté.
Mesuré : recherche sur `devis.numero`, **1,76 s** sur ~5000 devis (Bitmap Heap Scan
complet du tenant, filtré ligne à ligne).

**Correctif tenté** : `20260921000303_...sql` — extension `pg_trgm` + 8 index GIN trigram
sur les colonnes réellement recherchées (`devis.numero`, `factures.numero`,
`clients.nom/prenom/societe`, `chantiers.nom/reference_interne/ville`).

**Résultat, et découverte plus intéressante que prévu** : hors RLS (rôle `postgres` ou
`service_role`), l'index trigram est utilisé et la requête passe de 1,76 s à **0,15 ms**
— preuve que l'index fonctionne. **Mais sous le rôle `authenticated` (RLS active), le
planner continue de choisir le Bitmap Index Scan sur `entreprise_id` seul et ignore
l'index trigram** : la requête reste à ~1,76 s. Cause probable, diagnostiquée mais non
corrigée : les policies RESTRICTIVE de `devis` (`a_permission`/`est_membre_actif`, non
déclarées `LEAKPROOF`) imposent une barrière de sécurité qui semble limiter la capacité du
planner à combiner plusieurs scans bitmap à travers cette barrière. Vérifié en
reproduisant la même requête sans les fonctions RLS dans le filtre : le trigram est alors
choisi immédiatement.

**Pourquoi ce correctif n'a pas été poussé plus loin** : la solution technique
(`ALTER FUNCTION ... LEAKPROOF`) est un changement de posture de sécurité — la mission
l'interdit explicitement pour gagner du temps (§ 26), et une déclaration `LEAKPROOF`
erronée sur une fonction qui ferait fuiter de l'information via un message d'erreur ou un
effet de bord serait une vraie régression de sécurité. Cette mission ne prend pas ce
risque sans preuve dédiée que ces fonctions ne peuvent réellement rien laisser fuir. Les
index restent posés (utiles pour tout accès hors RLS stricte : RPC `SECURITY DEFINER`,
tâches d'administration, exports) et documentés comme une piste à qualifier séparément.

**Classe : P1 persistant** (recherche perceptiblement lente dès quelques milliers de
devis — confirmé non résolu par cette mission, cause diagnostiquée).

### 4.6 P2 documenté, non corrigé — `peut_consulter_chantier()` avant LIMIT

`chantiers_liste_paginee` applique `peut_consulter_chantier(p_entreprise_id, c.id)` dans
le `WHERE` **avant** `LIMIT`/`OFFSET` (contrairement à `devis_liste_paginee`, qui ne
masque le nom du chantier joint qu'*après* la pagination) — la fonction s'exécute donc une
fois par chantier de l'entreprise, pas une fois par ligne de la page. Mesuré : 86-93 ms
pour 165 chantiers → 25 retournés. Non corrigé : le commentaire de la migration 120
explique que ce choix est *intentionnel* (la RLS de `chantiers` n'est pas un simple
`a_permission`, elle dépend de l'équipe active du jour — masquer après coup casserait la
pagination/le total). Un vrai correctif demanderait de repenser la requête (ex. filtrer
d'abord sur les chantiers où l'équipe de l'utilisateur est objectivement affectée, avant
d'appliquer `peut_consulter_chantier` en vérification), hors du risque que cette mission
accepte de prendre sans test d'intégration complet.

---

## 5. RLS — synthèse

- 534 policies RLS actives sur 180 tables. Fonctions clés : `est_membre_actif(entreprise_id)`
  (permissive, cloisonnement de base) et `a_permission(entreprise_id, cle)` (restrictive,
  droit fin par poste).
- **Coût par ligne confirmé et mesuré** (pas seulement une estimation a priori) : entre
  0,35 et 0,5 ms par ligne retournée sur la quasi-totalité des requêtes de liste/détail
  testées, dès que ces fonctions apparaissent dans un `Filter` évalué ligne à ligne plutôt
  que dans un `Index Cond`. C'est le facteur dominant, plus que la présence ou l'absence
  d'un index secondaire, sur toutes les requêtes >500 lignes mesurées dans ce rapport.
- Deux défauts structurels trouvés et corrigés (§ 4.3, § 4.4) ; aucune policy affaiblie —
  toutes les recréations de policy reproduisent exactement les mêmes clés de permission,
  les mêmes `FOR`/`TO`/PERMISSIVE-RESTRICTIVE (un écart mineur trouvé par la revue
  indépendante et corrigé, § 4.3).
- **Attaques cross-tenant rejouées après chaque migration touchant la RLS** (§ 8) :
  lecture et écriture croisées toutes deux refusées, avec défense en profondeur confirmée
  (RLS + contrainte FK composite, testée séparément en contournant volontairement la RLS
  en tant que superutilisateur).

---

## 6. Planning

Le planning a déjà fait l'objet d'un travail de perf documenté (backlog connu dans le
runbook RC : coût ligne-à-ligne de `est_membre_actif` sur les 400 événements d'une vue
mensuelle, ≈3-6 s cité). Rejoué sur la fixture (150 chantiers, 40 salariés,
~450 événements dans la fenêtre récente dense + ~4500 répartis sur l'historique) :

| Requête | Mesuré |
| --- | ---: |
| Événements semaine courante (filtrés par date, index `entreprise_id, debut/fin`) | 0,03 ms |
| `planning_affectations` (non filtré par date, chargé à chaque vue) | n/a — table vide dans cette fixture (non peuplée), voir note |

**Limite de méthode assumée** : la fixture n'a pas peuplé `planning_affectations` (les
événements de planning existent, mais pas les affectations salarié↔événement — un gabarit
de données prévu mais non prioritaire face au reste). Le code applicatif
(`src/lib/planning/serveur.ts`) charge `planning_affectations` **sans filtre de date**, à
chaque vue — ce chargement complet et non borné (confirmé par lecture de code, pas mesuré
faute de données) reste un risque théorique à qualifier avec une vraie volumétrie
d'affectations si le planning est utilisé de façon intensive sur plusieurs années. Sept
autres requêtes de la vue planning (`employes`, `equipes`, `chantiers`, `clients`,
`planning_disponibilites`, etc.) sont également chargées en entier à chaque vue, sans
pagination — acceptable au volume actuel (165 chantiers/220 clients), à surveiller si
l'entreprise grandit nettement au-delà.

**Aucune régression détectée** sur les chemins mesurables (événements filtrés par date,
déjà bien indexés depuis les migrations antérieures).

---

## 7. Devis

Voir § 4.3 pour le correctif RLS (gain 2,7-2,9× sur l'ouverture). Scénarios de charge :

| Cas | Lignes | Ouverture (après correctif) |
| --- | ---: | ---: |
| Devis courant | 2-30 | <10 ms |
| Devis « lourd » | 20 | 7,7-8,3 ms |
| Devis « lourd » | 100 | non mesuré isolément — extrapolation linéaire ≈35-40 ms |
| Devis « lourd » | 500 | non mesuré isolément — extrapolation linéaire ≈180-190 ms |
| Devis « lourd » | 1000 | 357-381 ms |

Liste paginée (`devis_liste_paginee`) : 28-33 ms, page 25 lignes, avec ou sans recherche
texte (le coût de la recherche ILIKE non indexée n'apparaît que sur les termes qui ne
matchent presque rien — testé avec un motif générique, voir § 4.5 pour le cas dégradé).

**Sauvegarde (`enregistrer_devis_brouillon_v2`)** : testée en écriture concurrente
(§ 9) — protection de concurrence optimiste (`p_revision`) confirmée fonctionnelle sous
charge réelle, pas seulement en théorie (voir § 9.1).

**Pas d'autosave réel** trouvé dans le code (confirmé par une exploration dédiée du code
frontend) : `EditeurDevisV2.tsx` affiche un rappel « modifications non enregistrées », il
ne déclenche jamais l'enregistrement automatiquement — la sauvegarde reste déclenchée par
l'utilisateur. Hors sujet perf direct, mais change la lecture du risque de perte de
données sous forte charge (pas d'appels de sauvegarde automatiques en rafale à
redouter, mais pas de filet de sécurité contre une fermeture d'onglet accidentelle non
plus — hors périmètre de cette mission).

**Calcul des totaux** : `src/lib/devis/montants.ts`, calcul côté serveur (dans l'action
serveur, avant l'appel RPC) — pas une agrégation SQL, mais pas non plus un calcul
client-side redondant. Pas de motif O(n²) identifié à la lecture.

---

## 8. Facturation

Mêmes gains que devis (§ 4.3) sur l'ouverture des lignes de facture (2,9× sur 51 lignes).

Enregistrement de paiement : **pas de RPC** — action serveur (`enregistrerPaiementAction`)
qui lit la facture, valide le solde restant côté application, puis `INSERT` direct dans
`paiements`. Le trigger `recalc_paiements_apres_paiement` recalcule `montant_paye`/statut
automatiquement. **Deadlock trouvé et corrigé sur ce chemin précis — voir § 9.2, la
découverte la plus significative du volet concurrence de cette mission.**

Situations de travaux (facturation à l'avancement) : 100 situations générées sur 25
chantiers, non explorées en détail côté requêtes dédiées (hors volumétrie prioritaire de
cette mission — la table a déjà un index `entreprise_id`, migration 116).

---

## 9. Concurrence

### 9.1 Écriture concurrente sur un même devis — protection confirmée

Deux sessions simultanées appellent `enregistrer_devis_brouillon_v2` sur le **même devis
brouillon**, avec la **même révision de départ** (0). Résultat reproductible :

- Session A : succès, `{"id": "...", "revision": 1}`.
- Session B : rejet propre, `ERROR: Ce devis a été modifié ailleurs depuis votre dernière
  lecture (révision 1 au lieu de 0). Rechargez-le avant d'enregistrer.` (`errcode 40001`).

La protection optimiste existante fonctionne exactement comme conçue sous charge réelle
concurrente, pas seulement en lecture de code. Aucune perte de données, aucun
écrasement silencieux.

### 9.2 P1 trouvé et corrigé — deadlock sur deux encaissements concurrents

Deux sessions insèrent chacune un paiement de 100 € sur la **même facture** (montant total
126,18 €), en même temps.

**Avant correctif : deadlock reproductible à 100 % (3/3 essais)** :

```
ERROR: deadlock detected
DETAIL: Process 17641 waits for ShareLock on transaction 96881; blocked by process 17642.
        Process 17642 waits for ShareLock on transaction 96882; blocked by process 17641.
CONTEXT: ... "select montant_ttc, statut, date_echeance from public.factures
          where id = p_facture_id for update"
          PL/pgSQL function recalc_paiements_facture(uuid) ...
```

**Cause** : `recalc_paiements_facture` verrouille la facture avec `SELECT ... FOR UPDATE`
avant de recalculer `montant_paye`/statut — le commentaire d'origine dit explicitement
« Le verrou sérialise deux paiements simultanés sur la même facture » : l'intention était
la bonne. Mais chaque `INSERT INTO paiements` pose d'abord, implicitement, un verrou
`FOR KEY SHARE` sur la facture référencée (vérification de la contrainte de clé
étrangère) — *avant* que le trigger `AFTER INSERT` ne s'exécute. Deux transactions
détiennent chacune leur propre `KEY SHARE` (compatibles entre elles), puis tentent
*toutes les deux* de faire monter ce verrou vers `FOR UPDATE` (incompatible avec le
`KEY SHARE` de l'autre) : interblocage classique de verrou en escalade. PostgreSQL le
détecte et annule l'une des deux transactions — pas de corruption, mais un paiement sur
deux n'est *pas* enregistré, sans que l'utilisateur sache lequel sans revérifier.

C'est exactement le scénario que la mission demandait de chercher (§ 14 : « deux
encaissements ») et un risque réel dès que deux personnes (comptable + dirigeant,
typiquement) traitent des remises en banque au même moment dans une PME.

**Correctif appliqué** : `20260921000302_...sql` — `FOR UPDATE` → `FOR NO KEY UPDATE`.
Ce mode est compatible avec le `FOR KEY SHARE` implicite de la FK (plus de montée en
conflit) tout en restant incompatible avec un autre `FOR NO KEY UPDATE` concurrent : les
deux transactions se **sérialisent proprement** (l'une attend la fin de l'autre) au lieu
de s'interbloquer — exactement le comportement voulu par le commentaire d'origine. Correct
ici : l'UPDATE qui suit ne touche ni `id` ni `entreprise_id` (aucune colonne de clé
référencée par une FK).

**Après correctif : 5/5 essais, 0 erreur, 0 deadlock**, les deux paiements de 100 €
enregistrés (`montant_paye = 200,00`, 2 lignes dans `paiements`).

**Classe : P1** (dégradation réelle et reproductible sous charge concurrente plausible ;
pas de corruption de données grâce au détecteur de deadlock de PostgreSQL, mais perte
d'une saisie sans message clair pour l'utilisateur final avant ce correctif).

### 9.3 Montée en charge — 5/10/20/40 utilisateurs simulés

Scénario mixte par session : lecture dashboard-like, `devis_liste_paginee`, lecture
planning semaine, lecture clients, `factures_liste_paginee`, création d'un devis + ligne
(écriture), lecture pointages, encaissement partiel (écriture) — 8 opérations par
utilisateur simulé, sessions PostgreSQL indépendantes lancées en parallèle.

| N utilisateurs simultanés | Temps mur total | Durée max par session | Erreurs | Deadlocks | Timeouts |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 5  | 2,76 s  | 2,75 s  | 0 | 0 | 0 |
| 10 | 5,51 s  | 5,51 s  | 0 | 0 | 0 |
| 20 | 10,97 s | 10,95 s | 0 | 0 | 0 |
| 40 | 21,67 s | 21,62 s | 0 | 0 | 0 |

Mise à l'échelle **linéaire** (≈0,54 s/utilisateur constant, pas de dégradation
superlinéaire), aucune erreur, aucun deadlock, aucun timeout jusqu'à 40 sessions
simultanées — après le correctif § 9.2 (avant correctif, le test contenait des écritures
de paiement qui auraient occasionnellement percuté le même deadlock). Le nombre de
connexions PostgreSQL par défaut (`max_connections = 100`) n'a jamais été un facteur
limitant à cette échelle.

**Limite de méthode assumée** : ce bac à sable est un conteneur mono-machine
probablement partagé/limité en CPU — les temps absolus ne prédisent pas la latence réelle
sur l'infrastructure Supabase de Production (réseau, pooler `pgbouncer`, ressources
dédiées). La linéarité de la mise à l'échelle et l'absence d'erreurs/deadlocks sont en
revanche des signaux qualitatifs valables indépendamment du matériel : ils indiquent une
architecture sans verrou global ni ressource partagée pathologique, pour les parcours
testés.

Non testé faute de temps dans cette session : 3 modifications de planning concurrentes
(pas de RPC dédiée identifiée à ce jour pour la simuler simplement), plusieurs pointages
simultanés (l'insertion de pointages est verrouillée derrière une RPC non explorée dans le
temps imparti — voir § Pointages), plusieurs créations de clients simultanées (jugé faible
risque a priori, pas de contrainte partagée coûteuse sur `clients`, non vérifié
empiriquement).

---

## 10. Pointages

- Vue mensuelle gestion (toute l'entreprise, requête correctement typée — voir § 3) :
  **727-730 ms** pour 1 502 lignes sur 46 545 pointages du tenant. Coût dominé par
  `peut_consulter_pointage_employe()` + `est_membre_actif()` évalués ligne à ligne
  *après* que l'index `(entreprise_id, date)` ait déjà réduit le candidat à 1 502 lignes
  — même famille de coût RLS que partout ailleurs dans ce rapport (§ 5), non corrigée ici
  (aucun raccourci sûr identifié sans dénormaliser encore une colonne ou risquer la
  sémantique de `peut_consulter_pointage_employe`, plus complexe que
  `est_membre_actif`/`a_permission` simples).
- Vue employé (1 salarié, 1 mois) : 17-18 ms — largement acceptable.
- `pointages` est, avec 4 index dédiés (`entreprise_id, date` / `employe_id, date` /
  `chantier_id, date` / `affectation_id` partiel), la table la mieux indexée du schéma —
  aucun index manquant identifié ici.
- Écriture : bloquée derrière une RPC dédiée (`role_gestion_insert` a
  `with_check = false` — aucune écriture directe possible sous `authenticated`, y compris
  pour un compte de gestion). Non explorée dans le temps imparti (voir § Concurrence).

**Classe du point ouvert : P1** (727 ms pour une vue mensuelle d'équipe est dans la zone
« expérience dégradée » de l'objectif technique §17 de la mission — pas un timeout, mais
perceptible, et strictement lié au coût RLS générique, pas à un manque d'index).

---

## 11. Frontend / Next.js

Exploration dédiée du code (`src/app/(app)/...`) pour 9 écrans (dashboard, clients,
chantiers, devis, factures, planning, pointages, employés, recherche globale).

**Aucun motif N+1 base de données trouvé** dans les 9 écrans explorés — toutes les pages
groupent leurs requêtes via `Promise.all` et/ou des relations imbriquées
(`select("...,client:clients(...)")`), sans boucle de requêtes ligne à ligne.

**Confirmé et non corrigé — chargements non bornés, calculs déplacés côté JS** : le
Dashboard (`src/app/(app)/dashboard/page.tsx`) charge **tous** les devis et **toutes** les
factures du tenant (avec jointure client), sans `LIMIT`, puis filtre/agrège en JavaScript
(`totalFacture`, `devisAcceptes`, `chantiersActifs`, boucles d'alertes d'échéance).
Mesuré : **1,74-1,85 s** (devis) et **1,08-1,10 s** (factures) à chaque affichage du
tableau de bord, pour un tenant à 5000 devis/3000 factures. Les migrations de juillet 2026
(118-121) ont déjà corrigé ce même défaut pour les **pages de liste** dédiées
(devis/factures/clients/chantiers) — mais pas pour ces chargements secondaires du
Dashboard, ni pour les fiches client/chantier détaillées qui répètent le même motif à une
échelle plus bornée (un seul client/chantier à la fois, donc moins critique).

**Pourquoi ce n'est pas corrigé dans cette mission** : un vrai correctif exige de
remplacer ces chargements complets par des agrégats SQL (`sum`/`count`) côté RPC ou par
des requêtes filtrées équivalentes à la logique JS existante (dates d'échéance proches,
statuts spécifiques, 5 premiers éléments) — une réécriture de la logique métier du
Dashboard que cette session ne pouvait pas valider de bout en bout sans faire tourner
l'application réelle avec une authentification complète (hors de portée du bac à sable
utilisé). Risque de régression jugé trop élevé pour un correctif « à l'aveugle », même
avec `typecheck`/`lint`/`vitest` verts — ces outils ne prouvent pas l'exactitude
fonctionnelle d'une réécriture de logique métier. **Recommandation précise pour un futur
correctif** : une RPC `dashboard_indicateurs(entreprise_id)` sur le même motif que
`devis_liste_paginee`, retournant directement les agrégats (`total_facture`,
`total_encaisse`, `devis_acceptes`) et les listes déjà filtrées/bornées (devis à
relancer/expirant, factures échues) au lieu du jeu de données complet.

**Confirmé, faible priorité, non corrigé** : liste des employés
(`src/app/(app)/employes/page.tsx`) sans pagination — acceptable à l'échelle actuelle
(40-100 salariés typiques), à revoir si l'effectif visé dépasse largement ce cadre.

**Confirmé et corrigé** : voir § Storage.

**Bug pré-existant trouvé par effet de bord, sans lien avec cette mission** :
`npx tsc --noEmit` échoue avec 5 erreurs, toutes dans
`src/components/devis/GrilleDevis.tsx` — dépendances `@dnd-kit/core`,
`@dnd-kit/sortable`, `@dnd-kit/utilities`, `@tanstack/react-virtual` importées et
utilisées mais **absentes de `package.json`** (confirmé : présent sur `origin/release/gp-v1-rc`
avant tout changement de cette session — ce fichier n'a pas été touché ici). Ceci casserait
aussi `npm run build`. Signalé séparément (tâche suggérée), non corrigé dans cette
mission (hors périmètre perf/SQL).

---

## 12. Storage

Vérifié : les listes de documents (`documents_chantier`) ne chargent jamais les blobs
eux-mêmes (uniquement les métadonnées — `nom, categorie, storage_path, mime_type,
taille_octets, ...`), correctement indexées (`documents_chantier_liste_idx`
`(entreprise_id, chantier_id, created_at desc)`, 3,7-3,9 ms mesuré).

**P2 trouvé et corrigé — N+1 Storage (URLs signées)** : la page
`chantiers/[id]/documents/page.tsx` appelait `createSignedUrl()` **une fois par document
image**, dans une boucle `Promise.all` — un aller-retour réseau vers l'API Storage par
photo. Avec « plusieurs centaines de documents » sur un chantier (cas cité par la
mission), cela représente autant d'appels API individuels à chaque affichage de la page,
même pour des documents hors écran.

**Correctif appliqué** (fichier applicatif, pas SQL) : remplacé par
`createSignedUrls()` (pluriel — API batch officielle du SDK Storage Supabase), un seul
appel réseau pour tous les documents images de la page, résultat remappé par chemin de
stockage. Sortie strictement identique (`{ ...document, previewUrl }` par document).
Vérifié : `tsc --noEmit` et `eslint` propres sur ce fichier, aucune régression dans la
suite Vitest (1138/1141, inchangé avant/après ce correctif — le seul échec restant est le
défaut `@dnd-kit` pré-existant sans lien, § 11).

Pas de pagination sur la liste de documents elle-même (chargement complet par chantier) —
non corrigé, acceptable à l'échelle mesurée (825 documents sur 165 chantiers, ≈5/chantier
en moyenne dans la fixture — mais certains chantiers pourraient en avoir nettement plus en
usage réel ; pas de LIMIT observable comme un risque immédiat, mais à surveiller).

---

## 13. Optimisations appliquées — récapitulatif

5 migrations SQL (`20260921000299` à `303`) + 1 fichier applicatif
(`src/app/(app)/chantiers/[id]/documents/page.tsx`) :

| # | Objet | Classe | Gain mesuré |
| --- | --- | --- | --- |
| 299 | Débordement numérotation documents (`lpad` qui tronque) | **P0** | Bloquant supprimé (aucune collision possible désormais) |
| 300 | RLS `lignes_devis`/`lignes_factures` (dénormalisation `entreprise_id`) | P1 | ~2,7-2,9× sur l'ouverture devis/facture |
| 301 | Index `journal_activite(entreprise_id, created_at desc)` | P1 (préventif — pas de lecteur actuel) | ~530× sur le motif de requête testé |
| 302 | Deadlock paiements concurrents (`FOR UPDATE` → `FOR NO KEY UPDATE`) | P1 | Deadlock 3/3 → 0/5 ; fiabilité, pas de vitesse |
| 303 | Index trigram recherche (devis/factures/clients/chantiers) | P2 (partiel) | 1,76 s → 0,15 ms hors RLS ; **aucun gain confirmé sous RLS stricte** (cause diagnostiquée, non corrigée — § 4.5) |
| (frontend) | N+1 Storage, `createSignedUrl` → `createSignedUrls` | P2 | 1 appel réseau au lieu de N |

**Non appliqué, documenté avec recommandation précise** :
- Dashboard/fiches client-chantier : chargements complets devis/factures non bornés (§ 11).
- `chantiers_liste_paginee` : `peut_consulter_chantier()` avant LIMIT (§ 4.6).
- Coût RLS générique par ligne (~0,35-0,5 ms), présent partout, non résolu par nature
  (nécessiterait soit une dénormalisation systématique, soit `LEAKPROOF` — écarté, § 4.5).

**Aucun index existant supprimé.** Aucune donnée métier modifiée par ces migrations en
dehors du backfill strictement nécessaire (`lignes_devis.entreprise_id`,
`lignes_factures.entreprise_id`, valeurs dérivées et vérifiées identiques au parent).

---

## 14. Top requêtes — avant / après

| # | Requête | Avant | Après | Gain | Table dominante | Cause |
| ---: | --- | ---: | ---: | ---: | --- | --- |
| 1 | `journal_activite` tri + limit 50 | 9 881 ms | 17,3 ms | 571× | journal_activite | Index composite manquant |
| 2 | Recherche ILIKE `devis.numero` (hors RLS) | 1 765 ms | 0,15 ms | 11 767× | devis | Trigram manquant (gain non transposable sous RLS, § 4.5) |
| 3 | Dashboard — devis non paginé | 1 846 ms | 1 739 ms | ~1× | devis+clients | Non corrigé (§ 11) |
| 4 | Dashboard — factures non paginé | 1 096 ms | 1 084 ms | ~1× | factures+clients | Non corrigé (§ 11) |
| 5 | Ouverture devis 1000 lignes | 1 097 ms | 357 ms | 2,9× | lignes_devis | RLS EXISTS corrélé (corrigé) |
| 6 | Pointages vue mensuelle équipe | 727 ms | 727 ms | ~1× | pointages | Coût RLS générique (non corrigé) |
| 7 | Recherche ILIKE `devis.numero` (sous RLS, `authenticated`) | 1 765 ms | 1 756 ms | ~1× | devis | Limite planner+RLS (§ 4.5, non résolue) |
| 8 | `chantiers_liste_paginee` (RPC) | 93 ms | 86 ms | ~1× | chantiers | `peut_consulter_chantier` avant LIMIT (non corrigé) |
| 9 | Ouverture facture 51 lignes | 54,3 ms | 18,3 ms | 2,9× | lignes_factures | RLS EXISTS corrélé (corrigé) |
| 10 | Dashboard — chantiers non paginé | 89 ms | 92 ms | ~1× | chantiers | Non corrigé (§ 11) |
| 11 | Ouverture devis 20 lignes | 21,5 ms | 7,7 ms | 2,8× | lignes_devis | RLS EXISTS corrélé (corrigé) |
| 12 | `devis_liste_paginee` (RPC, sans recherche) | 28,3 ms | 31,0 ms | ~1× | devis | Déjà bien indexé (migration 118) |
| 13 | `devis_liste_paginee` (RPC, avec recherche) | 29,4 ms | 33,0 ms | ~1× | devis | idem |
| 14 | Pointages vue employé (1 mois) | 18,3 ms | 17,9 ms | ~1× | pointages | Déjà bien indexé |
| 15 | `factures_liste_paginee` (RPC) | 7,2 ms | 7,4 ms | ~1× | factures | Déjà bien indexé (migration 119) |
| 16 | Notifications non lues | 2,1 ms | 2,0 ms | ~1× | notifications_utilisateurs | Déjà bien indexé |
| 17 | `clients_liste_paginee` (RPC) | 1,6 ms | 1,4 ms | ~1× | clients | Déjà bien indexé (migration 121) |
| 18 | Fiche client → devis du client | 1,6 ms | 1,3 ms | ~1× | devis | OK (faible volume par client) |
| 19 | Documents d'un chantier | 3,8 ms | 3,7 ms | ~1× | documents_chantier | Déjà bien indexé |
| 20 | Employés (liste non paginée) | 3,7 ms | 3,7 ms | ~1× | employes | Non corrigé, faible priorité (§ 11) |

---

## 15. Tests exécutés

| Test | Résultat |
| --- | --- |
| Fresh (245 migrations, base vide → schéma complet) | ✅ 0 erreur |
| Upgrade implicite (les 5 nouvelles migrations rejouées sur une base déjà peuplée par la fixture lors des itérations de correction) | ✅ backfill correct à chaque itération |
| pgTAP — 44 suites (toute `supabase/tests/`) | ✅ 44/44, 0 `not ok` |
| Attaque cross-tenant — lecture (lignes_devis/devis d'un autre tenant) | ✅ 0 ligne visible |
| Attaque cross-tenant — écriture (INSERT sur devis d'un autre tenant) | ✅ rejeté par RLS |
| Attaque — réaffectation directe d'`entreprise_id` sur une ligne existante (RLS active) | ✅ rejeté par RLS (`WITH CHECK`) |
| Attaque — même réaffectation en contournant la RLS (rôle superutilisateur) | ✅ rejeté par la contrainte de clé étrangère composite (défense en profondeur) |
| `npx tsc --noEmit` | ⚠️ 5 erreurs, toutes pré-existantes sur la base (`@dnd-kit`/`@tanstack` manquants dans `package.json`, sans lien avec cette mission — § 11) |
| `npx eslint` | ✅ 0 erreur (warnings pré-existants uniquement, fichiers non touchés) |
| `vitest run --no-file-parallelism` | ✅ 1138/1141 (3 skip), 1 suite en échec — même cause `@dnd-kit` pré-existante |
| `npm run build` | Non exécuté (échouerait sur le même défaut `@dnd-kit` pré-existant — inutile de le reconfirmer) |
| Revue indépendante des migrations 299-301 (agent dédié) | ✅ aucune régression d'isolation confirmée ; 1 écart mineur de policy trouvé et corrigé (§ 4.3) |

---

## 16. Limites et quotas identifiés (non modifiés)

- `max_connections = 100` sur cette base de test (défaut Postgres standard) — non
  approché même à 40 sessions concurrentes. La configuration réelle Supabase (pooler
  `pgbouncer`, limites par plan) n'a pas été reproduite ici et devrait être vérifiée
  séparément avant un pilote à 40 utilisateurs réels.
- Aucun `statement_timeout` particulier rencontré ou modifié.
- Taille de la fixture : ~145 Mo pour ~250 000 lignes toutes tables confondues — largement
  dans les capacités standard de n'importe quel plan Postgres géré.
- Génération d'index : toutes les migrations de cette mission utilisent `CREATE INDEX`
  simple (transactionnel), pas `CONCURRENTLY` — acceptable au volume actuel de la RC
  (quelques centaines à quelques milliers de lignes par table). **Documenté
  explicitement dans chaque migration** (299-303) : si Production a accumulé un volume
  significativement plus grand d'ici le déploiement réel, remplacer par
  `CREATE INDEX CONCURRENTLY` (hors transaction) et un backfill par lots pour la migration
  300 (ajout de colonne + FK sur une table potentiellement volumineuse).

---

## 17. Benchmark final

| Domaine | Avant | Après | Statut | Limite restante |
| --- | --- | --- | --- | --- |
| Numérotation documents | Casse au 1000ᵉ document | Illimité | ✅ Corrigé | — |
| Ouverture devis/facture (lignes) | 1,0-1,1 s (1000/51 lignes) | 0,36-0,02 s | ✅ Corrigé (~2,8×) | Coût RLS résiduel ~0,35 ms/ligne |
| Audit (`journal_activite`) | 9,9 s | 0,02 s | ✅ Corrigé (préventif) | — |
| Paiements concurrents | Deadlock 3/3 | 0 deadlock 5/5 | ✅ Corrigé | — |
| Recherche texte (listes) | 1,8 s | 1,8 s sous RLS / 0,0002 s hors RLS | ⚠️ Partiel | Limite planner+RLS non résolue |
| Dashboard (devis/factures non paginés) | 1,7-1,8 s / 1,1 s | inchangé | ❌ Non corrigé | Nécessite réécriture RPC (hors risque accepté) |
| Pointages (vue équipe mensuelle) | 0,73 s | inchangé | ⚠️ Acceptable mais serré | Coût RLS générique |
| Planning (vue filtrée par date) | <1 ms | inchangé | ✅ Déjà bon | `planning_affectations` non testé (données absentes) |
| Concurrence 5→40 utilisateurs mixtes | — | linéaire, 0 erreur | ✅ Bon signal | Non extrapolable directement à l'infra Production réelle |
| Storage — N+1 signed URLs | N appels réseau | 1 appel batch | ✅ Corrigé | Liste documents non paginée (faible priorité) |
| Cloisonnement tenant | — | — | ✅ Confirmé à 2 niveaux (RLS + FK) | — |

### Verdict

**`PILOT CAPACITY READY`**

Justification : les défauts qui **bloqueraient réellement** un pilote externe à l'échelle
visée (numérotation qui casse, deadlock sur encaissement) sont trouvés et corrigés, avec
preuve de correction (avant/après mesuré, pgTAP au vert, attaques cross-tenant rejouées).
Les parcours cœur de métier (devis, factures, clients, chantiers listés, planning filtré)
sont dans la zone technique visée par la mission (§17 : <1 s pour une action courante,
<2 s pour une liste) une fois les correctifs appliqués. La montée en charge à 40
utilisateurs simultanés ne montre aucun signal de dégradation pathologique sur les
parcours testés.

Ce n'est **pas** `40 USER CAPACITY QUALIFIED LOCALLY` : deux limites documentées
l'empêchent honnêtement —
1. le Dashboard (première page vue par chaque utilisateur, à chaque connexion) reste à
   1,7-1,8 s sur un tenant à 5000 devis, un chargement non borné non corrigé dans cette
   mission ;
2. la charge concurrente testée (§ 9.3) est un smoke test volontairement générique
   (8 opérations mixtes par session), pas une simulation représentative et exhaustive de
   40 utilisateurs réels sur *tous* les parcours métier (planning en écriture, pointages
   en écriture, notamment, non exercés en concurrence faute de temps).

Ce n'est pas non plus `PERFORMANCE NOT READY` : aucun blocage/timeout résiduel n'a été
trouvé sur un parcours testé après correctifs, et le seul défaut réellement bloquant
trouvé (numérotation) est corrigé et vérifié.

---

## 18. Les 5 principaux goulets encore ouverts

1. **Coût RLS générique par ligne (~0,35-0,5 ms/ligne)** — `est_membre_actif()` et
   `a_permission()` sont réévaluées à chaque ligne sans mémoïsation, sur pratiquement
   toutes les requêtes de ce schéma. C'est le facteur dominant restant sur les devis/
   factures/pointages à fort volume, même après avoir supprimé les sous-requêtes
   redondantes (§ 4.3). Piste : dénormalisation systématique là où c'est prouvé rentable
   (suivre le motif déjà établi § 4.3), ou étude dédiée d'une stratégie de cache de
   session — hors de ce que cette mission pouvait qualifier sans risque.

2. **Dashboard non borné** — 1,7-1,8 s / 1,1 s à chaque connexion sur un tenant à
   5000 devis/3000 factures, chargements complets non paginés, agrégats calculés en JS.
   Écran le plus visité de l'application ; correctif précisément spécifié (§ 11) mais non
   appliqué faute de pouvoir valider une réécriture de logique métier sans exécuter
   l'application réelle.

3. **Recherche texte sous RLS** — un index trigram existe désormais mais le planner
   PostgreSQL ne le choisit pas quand les policies RESTRICTIVE sont dans le filtre
   (probable limite liée à `LEAKPROOF`, § 4.5). Reste à 1,76 s en usage réel
   (`authenticated`), malgré un index qui prouve pourtant sa capacité (0,15 ms hors RLS).

4. **Pointages — vue mensuelle équipe** — 727 ms, dans la zone « acceptable mais serrée »
   des objectifs de la mission ; se dégradera avec plusieurs années d'historique
   supplémentaires ou un effectif plus grand que 40.

5. **Concurrence en écriture non exhaustivement testée** — planning et pointages en
   écriture concurrente n'ont pas été exercés (RPC non explorées dans le temps imparti).
   Le deadlock trouvé sur les paiements (§ 9.2) était un point que personne n'avait
   testé jusqu'ici malgré un commentaire de code qui en anticipait le risque — plausible
   qu'un défaut similaire existe ailleurs (planning notamment, qui a sa propre RPC
   `enregistrer_evenement_planning` non auditée pour ce risque précis).

---

## Annexes — reproductibilité

- Fixture : `scripts/perf/generate_fixture.sql` (nouveau, ce dépôt). Rejouable sur toute
  base Postgres jetable ayant les 245 migrations appliquées (`psql -d <db> -f
  scripts/perf/generate_fixture.sql`), idempotent par reset complet (le script démarre par
  un schéma de travail `fx` qu'il supprime lui-même en fin d'exécution ; les tables
  applicatives, elles, ne sont pas vidées automatiquement — prévoir une base neuve ou un
  `TRUNCATE` ciblé avant réexécution).
- Utilisateurs de banc de mesure à UUID fixes (reproductibles) :
  `facc0000-0000-4000-a000-000000000001` (tenant principal) et
  `facc0000-0000-4000-b000-000000000001` (tenant secondaire), membres actifs avec toutes
  les permissions.
- Environnement de test non conservé dans ce dépôt (base Postgres locale au conteneur de
  session, prelude non versionné par choix — spécifique à ce bac à sable, sans valeur hors
  de ce contexte). Un futur repreneur devra reconstruire un socle équivalent (rôles +
  schémas `auth`/`storage` minimaux) ou, préférablement, utiliser un vrai projet Supabase
  de test/preview avec accès réseau au registre de conteneurs.
