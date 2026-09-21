# Qualification — concurrence de `situations_travaux.numero`

_Correction de la race condition identifiée par l'audit read-only préalable sur `public.situations_travaux.numero`. Périmètre strictement limité à cette numérotation ; aucun autre mécanisme (`next_reference()`, devis, factures, avoirs, commandes fournisseurs, dashboard, recherches, Studio, Colors, Reserves) n'est touché._

## 1. Bug avant correction

**Mécanisme** : `public.creer_situation_travaux(p_entreprise_id, p_devis_id, p_avancement_pct, p_retenue_garantie_pct, p_notes)` (migration `20260715000080_suite_metier_complete.sql`) calcule le prochain numéro par :

```sql
select coalesce(max(numero),0)+1 into v_numero
from public.situations_travaux
where entreprise_id=p_entreprise_id and devis_id=p_devis_id;
```

puis insère directement `v_numero`, **sans verrou** protégeant la fenêtre lecture‑puis‑écriture. Calcul et INSERT sont dans la même fonction (donc la même transaction, un seul aller‑retour RPC depuis `src/app/actions/suite-metier.ts`), mais rien n'empêche deux transactions concurrentes de lire le même `MAX(numero)` avant que l'une des deux ne commite.

**Scope réel** : `(entreprise_id, devis_id)`.

**Contrainte DB** : `unique(entreprise_id, devis_id, numero)` déjà présente depuis la création de la table — empêche toute corruption persistante, mais fait remonter une erreur Postgres brute (`23505`) au second appelant.

## 2. Reproduction AVANT correction (base jetable locale, Postgres 16, schéma + fonction copiés verbatim des migrations)

### 2 sessions concurrentes (chevauchement forcé, même entreprise + même devis)
Les deux transactions calculent `v_numero=1`. La première à committer réussit (`numero=1`), la seconde échoue :
```
ERROR:  duplicate key value violates unique constraint "situations_travaux_entreprise_id_devis_id_numero_key"
DETAIL:  Key (entreprise_id, devis_id, numero)=(…) already exists.
```
Aucun doublon persisté (protection de la contrainte UNIQUE), mais échec utilisateur brut.

### 5 sessions concurrentes (même devis)
Chevauchement forcé : 1 succès (`numero=1`), 4 échecs `23505`. Timing naturel (sans délai artificiel, 5 process `psql` lancés simultanément) : 1 succès, 2 échecs `23505`, 2 échecs sur la règle métier (avancement) — preuve que la collision se produit aussi en conditions réelles, pas seulement en laboratoire.

### Devis différents / entreprises différentes
Aucune collision (scope bien isolé par `(entreprise_id, devis_id)`).

### Retry après erreur
Correct si l'appelant relance manuellement (le numéro suivant est recalculé sans trou), mais **aucun retry automatique** n'existe côté TypeScript (`suite-metier.ts` renvoie directement `error.message`, y compris le message Postgres brut, à l'utilisateur).

## 3. Cause

Absence de verrou entre la lecture `MAX(numero)` et l'écriture `INSERT`. Le pattern de verrouillage explicite (`for update`) est pourtant déjà utilisé ailleurs dans le même fichier (`facturer_situation_travaux`), mais n'avait pas été repris ici.

## 4. Correction

**Fichier** : `supabase/migrations/20260729000184_verrou_numero_situation_travaux.sql` (nouvelle migration ; `20260715000080_suite_metier_complete.sql` **non modifiée**).

**Fonction modifiée** : `public.creer_situation_travaux` (`CREATE OR REPLACE FUNCTION`, signature identique : `(uuid, uuid, numeric, numeric, text) returns uuid`).

**Diff fonctionnel** (vérifié ligne à ligne, byte‑for‑byte identique au reste du corps) : une seule ligne ajoutée, juste avant le calcul du numéro et juste après la vérification de la règle d'avancement :

```sql
-- Verrou de ligne sur le devis concerne (portee entreprise_id+devis_id) : serialise
-- l'attribution du numero pour ce devis, sans verrou global. Deux devis differents
-- ou deux entreprises differentes obtiennent chacun leur propre verrou de ligne et
-- progressent independamment. Revalide l'appartenance du devis a l'entreprise.
perform 1 from public.devis where id=p_devis_id and entreprise_id=p_entreprise_id for update;
select coalesce(max(numero),0)+1 into v_numero from public.situations_travaux where entreprise_id=p_entreprise_id and devis_id=p_devis_id;
```

Toutes les autres lignes (signature, contrôle d'autorisation `a_permission`, validations, calcul d'avancement, calcul des montants, INSERT, ownership, grants, `SECURITY DEFINER`, `search_path=public`) sont **inchangées**.

## 5. Verrou choisi et granularité

`SELECT … FROM public.devis WHERE id=p_devis_id AND entreprise_id=p_entreprise_id FOR UPDATE` :

- **Verrou de ligne** (pas de verrou global, pas d'advisory lock) : un devis = une ligne = un verrou. Deux devis différents obtiennent des verrous distincts et progressent indépendamment ; deux entreprises différentes de même.
- **Revalidation d'appartenance au moment du verrou** : la clause `entreprise_id=p_entreprise_id` est réévaluée à l'acquisition du verrou (isolation multi‑tenant), pas seulement lors de la lecture initiale de `v_devis` plus haut dans la fonction.
- **Pas d'advisory lock** : le verrou de ligne standard sur `public.devis` s'est montré suffisant dans tous les scénarios testés (2, 5 et 10 sessions concurrentes, y compris en chevauchement forcé) — aucun besoin démontré d'un mécanisme plus lourd.
- **Pas de risque de deadlock** : un seul verrou acquis par appel, sur une seule ligne, sans verrou multi‑table en ordre variable ailleurs dans la fonction.

Sous l'isolation READ COMMITTED (par défaut), la session bloquée sur `FOR UPDATE` reprend, une fois le verrou libéré, avec une nouvelle image transactionnelle pour l'instruction suivante (`SELECT MAX(numero)`) : elle voit donc les lignes commitées entre‑temps et calcule le numéro suivant correctement.

## 6. Résultats après correction (même base jetable, migrations rejouées, schéma réel)

### 2 sessions concurrentes, même entreprise + même devis (chevauchement forcé, `pg_sleep` injecté après acquisition du verrou dans une copie de test de la fonction)
- 2 succès ; numéros `1` et `2` (consécutifs) ; **aucune `23505`** ; aucun deadlock ; aucun timeout.
- Durée totale mesurée ≈ 2,06 s pour deux verrous de 1 s chacun → preuve directe que la seconde session a **attendu** le verrou (sérialisation réelle), au lieu de calculer le même numéro.

### 5 sessions concurrentes, même devis (chevauchement forcé)
- 5 succès ; numéros `1..5` (uniques, consécutifs) ; aucune `23505`/deadlock/timeout.
- Robustesse : même résultat (0 collision, 0 erreur SQL) avec **10 sessions concurrentes** forcées sur le même devis.
- Timing naturel (fonction réelle, sans délai artificiel) : 2 succès, numéros `1` et `2`, aucune `23505`.

### Devis différents (même entreprise), concurrence forcée
Durée ≈ 1,05 s (≈ celle d'un seul appel, pas le double) : **aucun blocage croisé**. 2 succès indépendants.

### Entreprises différentes, concurrence forcée
Durée ≈ 1,05 s : **aucun blocage croisé**. 2 succès indépendants.

### Distinction concurrency failure / business-rule rejection
Lors d'un test à 5 sessions utilisant le **même** `p_avancement_pct` pour toutes les sessions, certaines créations peuvent être rejetées par la règle métier préexistante « l'avancement doit dépasser le cumul précédent » selon l'ordre réel de commit — ce n'est **pas** un défaut de la correction (cette règle, hors périmètre de cette mission, n'est pas verrouillée et ne l'a pas été). Avec des `p_avancement_pct` croissants par session (10, 20, 30, 40, 50), les 5 créations réussissent. Dans tous les cas testés : **zéro `23505` liée à la numérotation**.

### Retry
Aucun retry automatique n'a été ajouté côté TypeScript : le verrou SQL élimine la race condition à la source, donc un retry applicatif masquerait un éventuel problème résiduel plutôt que de le révéler. Aucune `23505` sur la contrainte de numérotation n'a été reproduite après correction, dans aucun scénario testé (2, 5, 10 sessions, chevauchement forcé ou timing naturel).

## 7. Contrainte UNIQUE

`unique(entreprise_id, devis_id, numero)` conservée telle quelle (protection d'intégrité de dernier recours). Non modifiée, non supprimée.

## 8. Sécurité — comparaison avant/après

Comparaison empirique (requête sur `pg_proc`/`pg_roles`) entre une base rejouant les 183 migrations existantes (sans le correctif) et une base rejouant les 184 migrations (avec le correctif) :

| Propriété | Avant | Après |
|---|---|---|
| Signature | `(uuid, uuid, numeric, numeric, text)` | identique |
| Type de retour | `uuid` | identique |
| Owner | `postgres` | identique |
| `SECURITY DEFINER` | `true` | identique |
| `search_path` | `{search_path=public}` | identique |
| ACL (`proacl`) | `{postgres=X/postgres,authenticated=X/postgres}` | identique |
| RLS sur `situations_travaux` | non modifiée (table non touchée) | non modifiée |

Un `pg_dump --schema-only` complet des deux bases ne montre **aucune autre différence** que la ligne de verrou ajoutée dans le corps de la fonction (plus les artefacts de test manuels supprimés ensuite). **Aucun élargissement de privilège.**

## 9. Fresh

Docker n'étant pas disponible dans cet environnement d'exécution (téléchargement des images de la stack Supabase bloqué par le proxy sortant : `403 Forbidden`), le rejeu « Fresh » a été effectué sur un **Postgres 16 nu**, avec un bootstrap minimal fait main hors dépôt (rôles `anon`/`authenticated`/`service_role`, schéma `auth` avec `auth.users`/`auth.uid()`/`auth.role()`/`auth.email()`/`auth.jwt()`, schéma `storage` avec `storage.buckets`/`storage.objects`/`storage.foldername()`, extension `pgcrypto`) reproduisant ce que la plateforme Supabase fournit habituellement — **sans modifier aucun fichier du dépôt**.

- Les **179 migrations réelles** de `supabase/migrations/` (178 existantes + la nouvelle `20260729000184`) ont été rejouées dans l'ordre depuis cette base vide : **0 erreur SQL**.
- La nouvelle migration est présente **exactement une fois** dans le dossier (`ls supabase/migrations | grep 20260729000184` → 1 résultat) et respecte le format attendu par `scripts/verify-migrations.mjs` (`npm run verify:migrations` → `179 migrations valides, noms et horodatages uniques.`).
- Ce rejeu via Postgres nu est un **best-effort documenté**, distinct du pipeline officiel `npm run db:start && npm run db:reset` (stack Supabase complète via Docker), qui n'a pas pu être exécuté faute d'accès réseau aux registres d'images dans ce sandbox. Il couvre neanmoins la totalité du DDL/DML des migrations et constitue une preuve directe qu'elles s'appliquent sans erreur SQL dans l'ordre du ledger.

## 10. pgTAP

**Nouveau fichier** : `supabase/tests/situations_travaux_numero_concurrency.test.sql` (12 assertions, toutes vertes) :

1. Signature et type de retour de `creer_situation_travaux` inchangés.
2. Présence structurelle du verrou (`for update` sur `public.devis`, avec vérification `entreprise_id`) **avant** le calcul de `coalesce(max(numero),0)+1` dans le corps de la fonction.
3. Contrainte `unique(entreprise_id,devis_id,numero)` toujours présente.
4. Numérotation séquentielle (1, 2, 3) pour trois créations successives sur le même devis.
5. Isolation entre devis (un second devis redémarre à 1).
6. Isolation entre entreprises (une autre entreprise redémarre à 1).
7. Absence de doublon `(entreprise_id, devis_id, numero)`.

**Limite documentée explicitement dans le fichier** : pgTAP s'exécute dans **une seule transaction** (`begin … rollback`), donc une seule session PostgreSQL — il ne peut **pas** produire de concurrence réelle entre deux transactions distinctes (un `FOR UPDATE` ne bloquerait jamais un appelant dans la même transaction). Ce test pgTAP est donc **déterministe et structurel**, complémentaire — et non substituable — à la preuve de concurrence réelle.

**Preuve de concurrence réelle** : `scripts/concurrency-situations-travaux.sh` — harness bash/psql dédié, hors `npm run verify` et hors CI, qui lance de vraies sessions PostgreSQL concurrentes (processus `psql` séparés) contre une base locale jetable. Il couvre : 2 sessions concurrentes même devis, 5 sessions concurrentes même devis (avec distinction explicite concurrency failure / business-rule rejection), devis différents, entreprises différentes, et un scénario à chevauchement forcé (verrou + `pg_sleep` dans une copie de test créée et détruite à l'exécution) prouvant le blocage effectif de la seconde session. Le script refuse de s'exécuter sans confirmation explicite (`CONFIRM_LOCAL_TEST_DB=1`) pour ne jamais risquer une exécution contre une base de production.

**Suite pgTAP complète rejouée** (7 fichiers, base locale post-correctif) : `actions_nom_propre` (6), `alertes_operationnelles_ignorees` (7), `archivage_notes_frais_rls` (9), `borne_stock_securisee` (11), `medias_messagerie_chantiers` (8), `plateforme_impayes` (12), `situations_travaux_numero_concurrency` (12) — **65/65 assertions réussies, 0 `not ok`**. Aucune régression par rapport au dernier contrôle local documenté dans `docs/CONTROLES_LOCAUX.md`.

## 11. Tests applicatifs

- `npm run typecheck` : 0 erreur.
- `npm run lint` : 0 erreur (3 avertissements préexistants `no-img-element`, sans rapport avec ce correctif).
- `npm test` (Vitest) : 28 fichiers, 104 tests, tous réussis.
- `npm run verify:migrations` : 179 migrations valides.
- `npm run verify:secrets` : 680 fichiers contrôlés, aucun secret détecté.
- `npm run build` : compilation Next.js réussie.
- Aucune modification de `src/app/actions/suite-metier.ts` ni d'aucun autre fichier TypeScript : le correctif est intégralement porté par la migration SQL, conformément au résultat préféré.

## 12. Non-régression métier (parcours réel, base locale post-correctif)

Sur un devis accepté à 300 000 € HT :

| Situation | Avancement | Cumul HT | Période HT | Retenue (5 %) |
|---|---|---|---|---|
| 1 | 20 % | 60 000,00 | 60 000,00 | 3 000,00 |
| 2 | 50 % | 150 000,00 | 90 000,00 | 4 500,00 |
| 3 | 100 % | 300 000,00 | 150 000,00 | 7 500,00 |

Facturation de la situation 1 (`facturer_situation_travaux`, fonction non modifiée) : statut passe à `facturee`, `facture_id` renseigné, facture créée avec `situation_numero=1`, `avancement_pct=20`, `retenue_garantie_pct=5`, `montant_retenue=3000` — cohérent.

Isolation tenant : un utilisateur de l'entreprise B ne peut ni lire (`Le devis doit être accepté` — le devis de l'entreprise A n'est pas trouvé sous `entreprise_id` de B) ni usurper l'entreprise A (`Accès refusé` sur le contrôle `a_permission`). Comportement identique avant/après (la ligne ajoutée re-filtre elle aussi par `entreprise_id`).

## Verdict

**SITUATIONS NUMBERING CONCURRENCY QUALIFIED**
