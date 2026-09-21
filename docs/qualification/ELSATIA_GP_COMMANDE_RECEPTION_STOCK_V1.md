# ELSATIA Gestion Pro — Réception commande fournisseur → stock, moteur transactionnel unique

Mission de correction ciblée, faisant suite à l'audit read-only ayant confirmé
le P0 `COMMANDE_STOCK_FLOW_WORKING = NO`. Périmètre strictement limité à la
réception de commande fournisseur et à sa répercussion sur le stock — aucune
refonte du modèle coût/marge devis, des impayés, des documents situations/
factures finales, ni de Studio/Reserves/notifications/pricing/performance.

**Verdict : `COMMANDE STOCK FLOW QUALIFIED`**

---

## 1. Ancien défaut

Trois voies distinctes modifiaient `lignes_commande.quantite_recue` et/ou
`commandes_fournisseurs.statut` sans jamais écrire dans
`public.mouvements_stock` — la table que le reste de l'application traite
comme la source de vérité du stock (`public.articles_stock.quantite_stock`
n'est modifiée que par le trigger `appliquer_mouvement_stock`, déclenché
uniquement à l'insertion d'un mouvement) :

1. **`/commandes/[id]` → « Réceptionner »** — `enregistrerReceptionCommandeAction`
   → RPC `enregistrer_reception_commande` → `enregistrer_reception_commande_interne`
   (corps original de `supabase/migrations/20260710000021_commandes_fournisseurs.sql:212-249`,
   renommé mais jamais réécrit par `20260713000043_permissions_rls_gestion.sql`) :
   un simple `update lignes_commande set quantite_recue = r.quantite_recue`.
   Aucune référence à `mouvements_stock` dans tout le corps de la fonction.
2. **`changer_statut_commande_interne(p_statut => 'recue')`** — bascule manuelle
   du statut : `update lignes_commande set quantite_recue = quantite where
   commande_id = ...`. Même défaut, par une troisième voie non documentée par
   l'audit initial mais relevant de la même cause racine (constatée pendant
   l'implémentation, voir §3).
3. **Le parcours parallèle `/stock/reception`** (`enregistrer_reception_lot` /
   `_borne`) créditait réellement le stock, mais par un mécanisme totalement
   déconnecté du premier : deux tableaux indépendants côté appelant
   (`p_lignes` = entrées de stock, `p_attributions` = rattachement à une
   ligne de commande), sans aucune garantie que les quantités correspondent,
   et sans la moindre protection contre le rejeu (un retry réseau ou un
   double clic insérait un second mouvement identique).

`lignes_commande` n'avait par ailleurs **aucune colonne `article_id`** —
confirmé sur ce HEAD par recherche exhaustive des `alter table` touchant
cette table dans les 308 migrations existantes avant ce correctif : aucune
n'en ajoute. Le rattachement à un article de stock ne pouvait donc se faire
que via le rapprochement texte fragile du scanner (`ReceptionScanner.tsx`).

## 2. Modèle retenu

**Une ligne de commande peut être reliée à un article de stock** via une
nouvelle colonne nullable `lignes_commande.article_id`, avec une **clé
étrangère composite** `(article_id, entreprise_id) → articles_stock(id,
entreprise_id)` : la base garantit qu'une ligne ne peut **jamais** référencer
un article d'une autre entreprise, indépendamment de tout contrôle
applicatif (vérifié empiriquement, §7). Nullable à dessein : une ligne de
sous-traitance ou de prestation de service n'a pas vocation à toucher le
stock.

**Un seul moteur transactionnel**, `public.appliquer_reception_ligne_commande`,
réceptionne une ligne vers une **quantité reçue cumulée cible** (pas un
delta) : verrouille la commande puis la ligne dans un ordre fixe, calcule
`delta = cible − quantite_recue actuelle`, met à jour `quantite_recue` et, si
`article_id` est renseigné et `delta ≠ 0`, insère un mouvement de stock
(`entree` si `delta > 0`, `sortie` — correction — si `delta < 0`) référençant
la ligne via une nouvelle colonne `mouvements_stock.ligne_commande_id`
(composite FK vers `lignes_commande(id, entreprise_id)`, même garantie
tenant). C'est ce contrat « cible cumulée, pas delta » qui rend un rejeu
exact idempotent par construction (§5), sans avoir besoin d'une clé pour ce
cas précis.

Les **trois anciennes voies convergent** vers ce moteur unique :
- `enregistrer_reception_commande_interne` boucle dessus, lignes triées par
  id, dans la même transaction.
- `changer_statut_commande_interne('recue')` boucle dessus pour chaque ligne
  encore incomplète, au lieu du update direct.
- `enregistrer_reception_lot` / `_borne` (scan) appellent le même moteur pour
  la part **rattachée à une commande** : le scan calcule la nouvelle cible
  (`least(quantite_commandee, quantite_recue_actuelle + quantite_scannee)`)
  sous verrou, puis délègue au moteur — qui peut aussi, à cette occasion,
  relier `article_id` à la ligne si elle ne l'était pas encore (réconciliation
  au moment du scan). Les entrées de stock **non rattachées à une commande**
  (réception libre au dépôt) restent des mouvements directs : ce n'est pas le
  flux commande→stock visé par ce correctif, et rien n'a été retiré.

Le statut de la commande est désormais recalculé partout par la même
fonction, `public.recomputer_statut_commande` (déjà existante, utilisée
auparavant seulement par le scan) — plus de logique de statut dupliquée entre
les trois entrées.

**Idempotence par clé explicite** pour les appels par lot
(`enregistrer_reception_commande`, `enregistrer_reception_lot[_borne]`) : un
nouveau paramètre optionnel `p_idempotency_key uuid`, et une nouvelle table
`public.receptions_idempotence(entreprise_id, idempotency_key unique,
resultat jsonb)`. Motif `insert … on conflict (entreprise_id, idempotency_key)
do update set idempotency_key = excluded.idempotency_key returning resultat` :
la première occurrence d'une clé traite normalement puis mémorise son
résultat ; toute occurrence suivante de la même clé (rejeu, retry, appel
concurrent) **attend** la fin du premier appel (verrou de ligne standard
Postgres sur `ON CONFLICT DO UPDATE`) puis reçoit directement le résultat
mémorisé, sans repasser par aucune écriture. Ce mécanisme est nécessaire (et
utilisé) côté scan, où l'événement physique (quantité scannée) est un delta,
pas une cible — la protection « cible cumulée » du moteur canonique ne suffit
pas seule à s'en prémunir. Côté écran commande, les deux mécanismes sont
disponibles (clé côté formulaire + idempotence par construction du moteur),
en défense en profondeur.

## 3. Schéma avant / après

| | Avant | Après |
|---|---|---|
| `lignes_commande.article_id` | absent | `uuid null`, FK composite `(article_id, entreprise_id) → articles_stock(id, entreprise_id)` |
| `mouvements_stock.ligne_commande_id` | absent | `uuid null`, FK composite `(ligne_commande_id, entreprise_id) → lignes_commande(id, entreprise_id)` |
| `receptions_idempotence` | n'existe pas | nouvelle table, RLS lecture-membres, aucune écriture directe accordée (uniquement via fonctions SECURITY DEFINER) |
| `enregistrer_reception_commande_interne` | `update` direct, aucun mouvement | boucle sur le moteur canonique |
| `changer_statut_commande_interne('recue')` | `update` direct, aucun mouvement | boucle sur le moteur canonique |
| `enregistrer_reception_lot[_borne]` | deux tableaux décorrélés, aucune idempotence | l'attribution passe par le moteur canonique ; clé d'idempotence de lot |

## 4. Migration

**`supabase/migrations/20260922000318_gp_reception_commande_stock_transactionnel_v1.sql`**
— strictement additive : deux `alter table … add column if not exists` +
deux contraintes FK composites protégées par `do $$ if not exists(...) $$`,
une nouvelle table, et des `create or replace function`. Trois fonctions
existantes changent de signature (ajout d'un paramètre `p_idempotency_key`
en position finale, valeur par défaut) : `enregistrer_reception_commande`,
`enregistrer_reception_commande_interne`, `enregistrer_reception_lot`,
`enregistrer_reception_lot_borne`. Postgres ne remplace **jamais** une
fonction d'arité différente — il crée une surcharge — donc chacune est
précédée d'un `drop function if exists (ancienne signature)` explicite dans
cette même migration, pour qu'aucune ancienne version bogué ne reste
appelable en parallèle (vérifié, §7). Aucune migration historique n'est
modifiée. Numéro `20260922000318`, premier disponible après
`20260922000317` sur le HEAD de départ (`e0a83ebbd430efb5217466f05be3c08f45ae4de5`).

## 5. Transaction et idempotence

Chaque appel de haut niveau (`enregistrer_reception_commande`,
`enregistrer_reception_lot[_borne]`) reste une seule fonction PL/pgSQL
`SECURITY DEFINER` : tout se passe dans **une seule transaction Postgres**,
atomique par construction — il n'y a jamais eu besoin d'un `BEGIN`/`COMMIT`
explicite ni de savepoints.

Testé et démontré par pgTAP (`supabase/tests/gp_reception_commande_stock_
transactionnel_v1.test.sql`, 65/65 assertions) :
- **Double clic / rejeu exact** (scénario 4) : la commande de la même cible
  cumulée deux fois de suite — y compris après passage au statut `recue` —
  ne crédite le stock qu'une fois (`ok 16-18`). Avant le correctif décrit en
  §7, ce rejeu levait à tort une exception au lieu d'être un no-op.
- **Retry avec clé d'idempotence** (scénario 5) : un second appel sous la
  même clé, avec une charge **différente** (9 au lieu de 5), ne retraite
  jamais — il renvoie le résultat mémorisé du premier appel (`ok 24-27`).
- **Convergence scan** : le scan crédite via le même moteur, relie l'article
  à la volée, et un rejeu sous la même clé ne double pas le mouvement
  (`ok 55-61`).

## 6. Concurrence — vraies sessions Postgres

Le fichier pgTAP ne peut pas tester la concurrence réelle (une seule
transaction). Quatre scénarios ont été exécutés avec **deux connexions
`psql` distinctes lancées en tâche de fond**, une session tenant le verrou de
ligne (acquis par son propre appel RPC) pendant un `pg_sleep(3)` avant de
committer, l'autre démarrant une seconde plus tard :

| Scénario | Résultat mesuré | État final |
|---|---|---|
| Même ligne, rejeu identique (cible 10 deux fois) | session B bloquée **2,07 s** (attente réelle du verrou, confirmée par timestamps `clock_timestamp()`), puis no-op | 1 mouvement, stock = 10, `quantite_recue` = 10 |
| Même ligne, cibles différentes (A=4 puis B=10) | session B bloquée **2,07 s**, recalcule son delta (10−4=6) sur l'état déjà committé par A | 2 mouvements (4 puis 6), stock = 10, aucune perte d'écriture |
| Deux lignes différentes (même entreprise, commandes distinctes) | session B **non bloquée** (0,067 s, alors que A dort encore 3 s) | les deux réceptions aboutissent indépendamment |
| Deux entreprises différentes | session B **non bloquée** (0,065 s) | aucun blocage croisé |

Aucun deadlock dans aucun scénario. L'ordre de verrouillage est fixé une
fois pour toutes **à l'intérieur** du moteur canonique (commande d'abord, en
lisant `commande_id` sans verrou puis en verrouillant `commandes_fournisseurs`,
puis `lignes_commande`) — tous les appelants (écran commande en boucle
multi-lignes, scan) en héritent automatiquement, ce qui exclut structurellement
l'inter-blocage entre deux appels multi-lignes concurrents sur la même
commande. Les verrous ne portent jamais sur une commande ou une entreprise
entière : seules les lignes ciblées sont verrouillées.

## 7. Rollback

pgTAP scénario 11 : un lot contenant une ligne valide et une ligne
étrangère (id inexistant) est rejeté (`Réception invalide ou ligne
étrangère`), et **la ligne par ailleurs valide** du même lot n'a rien reçu
(`quantite_recue` = 0, aucun mouvement, statut de la commande inchangé) —
tout ou rien, vérifié par assertion, pas par inspection visuelle.

Un vrai bug de conception a été trouvé et corrigé **pendant** l'écriture des
tests, avant tout commit : le garde « la commande doit être dans un statut
réceptionnable » était vérifié **avant** le calcul du delta. Résultat : un
rejeu exact d'une réception déjà complète (commande passée à `recue`)
levait à tort une exception au lieu d'être un no-op idempotent — un vrai
double clic tardif (après que le premier clic a déjà fait passer la
commande à `recue`) aurait donc affiché une erreur à l'utilisateur au lieu
de rester silencieusement sans effet. Corrigé en calculant le delta d'abord :
si `delta = 0`, retour immédiat, peu importe le statut de la commande ; le
garde de statut ne s'applique que lorsqu'une écriture réelle est sur le
point d'avoir lieu.

## 8. Isolation multi-tenant et sécurité

pgTAP scénarios 8, 9, FK :
- Un appel avec l'`entreprise_id` de E1 et l'id d'une commande appartenant à
  E2 échoue avec « Commande introuvable » (pas de fuite d'existence
  cross-tenant), et ne crédite rien (`ok 34-35`).
- Impossible de relier une ligne à un article d'une autre entreprise, que ce
  soit via le moteur (`appliquer_reception_ligne_commande`, `ok 37-38`) ou
  directement en base (contrainte FK composite, `23503`, `ok 65`).
- Un utilisateur sans la permission `gerer_achats` est rejeté (`Accès
  refusé`), sans écriture (`ok 39-40`).

Vérifié pour chaque fonction créée/modifiée (pgTAP `ok 42-53`, et testé
empiriquement en appelant les trois fonctions publiques en rôle `anon` sur
une base fraîche : `ERROR: permission denied for function …` dans les trois
cas) :

| Fonction | Owner | Security | search_path | anon | authenticated |
|---|---|---|---|---|---|
| `appliquer_reception_ligne_commande` (interne) | postgres | DEFINER | `public` (figé) | **refusé** | **refusé** (seul le wrapper public y accède) |
| `enregistrer_reception_commande` | postgres | DEFINER | `public` (figé) | **refusé** | accordé (contrôle `gerer_achats` interne) |
| `enregistrer_reception_lot` | postgres | DEFINER | `public` (figé) | **refusé** | accordé (contrôle `effectuer_entree_stock` interne) |
| `enregistrer_reception_lot_borne` | postgres | DEFINER | `public, extensions` (figé) | **refusé** | accordé (identité salarié + poste via `employe_borne_autorei`) |

Une seule signature de chaque fonction modifiée est présente en base après
la migration (`ok 51-53`) — l'ancienne version bogueuse (arité différente)
est explicitement supprimée, pas seulement masquée par une surcharge.

## 9. Parcours commande (`/commandes/[id]` → Réceptionner)

`ReceptionCommandeForm.tsx` génère une clé d'idempotence côté client une
seule fois par montage du formulaire (`useState(() => crypto.randomUUID())`),
transmise en champ caché ; `enregistrerReceptionCommandeAction`
(`src/app/actions/commandes.ts`) la lit et l'ajoute à l'appel RPC. Un double
clic avant navigation soumet deux fois la même clé ; un retry réseau du
navigateur aussi. Réception totale et réception partielle (répétée) passent
toutes deux par `enregistrer_reception_commande`, sans changement d'API côté
formulaire (les quantités restent des cibles cumulées, comme avant ce
correctif — seul le comportement serveur change).

## 10. Parcours scan (`/stock/reception`)

`ReceptionScanner.tsx` génère une clé d'idempotence par lot scanné
(`crypto.randomUUID()`), régénérée uniquement après succès (`setCleIdempotence`
après un retour `ok`) — un retry sur échec réel réutilise la même clé,
correctement. Les attributions envoyées incluent désormais `article_id`
(déjà connu du panier scanné), permettant au moteur de relier la ligne dès
ce premier scan si elle ne l'était pas déjà. Rien n'a été supprimé : les
entrées de stock libres (non rattachées à une commande) et la sortie de
stock (`enregistrer_sortie_lot[_borne]_v2`, hors périmètre de ce correctif
— aucune ligne de commande n'y est impliquée) sont inchangées.

## 11. Résultats des tests

- **pgTAP dédié** — `gp_reception_commande_stock_transactionnel_v1.test.sql` :
  **65/65** assertions, couvrant les 14 scénarios métier demandés, la
  convergence scan, et les contrôles de sécurité.
- **Suite pgTAP complète (91 fichiers)** — comparée à un baseline établi sur
  le HEAD de départ non modifié (308 migrations, avant ce correctif) :

  | | Baseline (avant) | Après ce correctif |
  |---|---|---|
  | Assertions `ok` | 2260 | 2325 (**+65**, exactement le nouveau fichier) |
  | Assertions `not ok` | 6 (2 fichiers, sans rapport avec commande/stock) | 6 (**mêmes 2 fichiers, mêmes échecs**) |
  | Fichiers en erreur d'exécution complète | 11 (`auth.mfa_factors` absent de l'image Postgres de test locale — limite d'environnement, sans rapport avec commande/stock) | **mêmes 11 fichiers**, aucun nouveau |

  Aucune régression : le diff des deux jeux de fichiers en échec est vide.
- **Fresh complet** — base reconstruite depuis zéro (image `supabase/postgres:
  15.8.1.060`), les 309 migrations (308 + la nouvelle) appliquées dans
  l'ordre sans erreur.
- **`npm run verify:migrations`** — 309 migrations valides, horodatages
  uniques.
- **`npm run verify:secrets`** — 2479 fichiers suivis contrôlés, aucun secret
  reconnu.
- **`npm run typecheck`** — 0 erreur (app racine + apps/tools + apps/reserves
  + apps/colors).
- **`npm run lint`** — 0 erreur, 6 avertissements préexistants sans rapport
  avec les fichiers modifiés par ce correctif.
- **`npm run test` (vitest)** — 1786 + 1992 + 154 + 427 = **4359 tests**,
  **377 fichiers**, tous passants (app racine + 3 sous-apps du monorepo).
- **`npm run build`** — l'app Gestion Pro (celle modifiée par ce correctif)
  compile et type-check avec succès (`✓ Compiled successfully`, 38 pages
  statiques générées, arbre de routes complet). Le build échoue ensuite dans
  la sous-app séparée `apps/tools` (produit distinct, jamais touché par ce
  correctif), faute de secrets de production (`NEXT_PUBLIC_SUPABASE_URL`,
  billing) non disponibles dans cet environnement de qualification — limite
  d'environnement documentée, pas une régression de code.

## 12. Fichiers modifiés

- `supabase/migrations/20260922000318_gp_reception_commande_stock_transactionnel_v1.sql` (nouveau)
- `supabase/tests/gp_reception_commande_stock_transactionnel_v1.test.sql` (nouveau)
- `src/app/actions/commandes.ts` (clé d'idempotence transmise à la RPC)
- `src/app/actions/reception.ts` (paramètre `idempotencyKey`, `article_id` dans `Attribution`)
- `src/components/ReceptionCommandeForm.tsx` (génération de la clé côté client)
- `src/components/ReceptionScanner.tsx` (génération/rotation de la clé, `article_id` dans les attributions)

## 13. Blockers restants

Aucun, pour le périmètre de ce correctif. Notes pour un travail ultérieur
(hors périmètre ici) :
- `receptions_idempotence` n'a pas de purge automatique — à prévoir si le
  volume de réceptions le justifie (hors périmètre : performance).
- La correction à la baisse d'une quantité déjà reçue (delta négatif) génère
  un mouvement `sortie` qui peut échouer si le stock a déjà été consommé
  ailleurs (« Stock insuffisant ») — comportement jugé sûr par défaut
  (empêche un état de stock incohérent) mais pourrait mériter un message
  d'erreur dédié côté UI si ce cas se présente en usage réel.
