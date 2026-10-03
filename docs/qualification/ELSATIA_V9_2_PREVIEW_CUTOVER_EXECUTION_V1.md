# ELSATIA V9.2 — Preview : exécution du cutover 372 → 408 (V1, révisé post-cutover)

Date : 2026-10-03 (UTC). Cible unique : `pgvvpqyjziyapbbkydmc` (elsatia-preview).
**Aucune écriture en base depuis ce conteneur, aucun `db push`, aucun `--apply-preview`, aucun
`migration repair`, aucun déploiement, aucune Production, aucun Stripe Live, aucun Studio, aucune
Boutique, aucun Social.** Aucune valeur secrète n'est reproduite dans ce document.

> Révision : la première version de ce rapport (base à 372, cutover non appliqué) est **caduque**.
> Le cutover a été exécuté avec succès par l'opérateur depuis son poste, avec le script officiel.
> Ce document consigne l'état réel, le bug du pack opérateur découvert et corrigé, et les preuves
> post-cutover reconstituées en lecture seule.

```
CANONICAL_SHA=1a638855441a0f4bfeeb23e4c656c7b2c2fab38e
PROJECT_REF=pgvvpqyjziyapbbkydmc

BACKUP_PACK_VALIDATED=YES_OPERATOR_PROOF
BACKUP_AGE_AT_APPLY=< 12 h (application opérateur le 2026-10-03 au soir ; sauvegarde 19:18 UTC)

PRE_LEDGER=372
PRE_LAST_MIGRATION=20261002000813
PRE_PENDING=36

FINAL_DRY_RUN=PASS (opérateur)
FINAL_DRY_RUN_COUNT=36

MIGRATION_APPLY=PASS (opérateur, « Finished supabase db push. »)
MIGRATIONS_APPLIED_COUNT=36
FIRST_APPLIED=20261002000901
LAST_APPLIED=20261003001504

POST_LEDGER=408
POST_PENDING=0
LEDGER_DIVERGENCE=NO

POST_CUTOVER_CHECKS=PASS 14/14 (rejoués en lecture seule) ; DB_VERIFY=INCOMPLET (cf. § 3)

BANK_KEY_PRESENT=YES
BANK_K1_REGISTER=YES (contrôle 8 : k1 = 1)
BANK_K1_STATUS=ACTIVE (contrôle 8 : active = 1)
IBAN_K1_READY=YES_DB_PROOF (preview:v9:iban-k1 non rejoué : sortie bank-keys status non disponible ici)

CODE_DEPLOY_ALLOWED=false (seul motif : DB verify code 1, limite d'accès lecture seule)

GP_PREVIEW_DEPLOY=NOT_DEPLOYED (alias gp-preview-v8 → 53b4bc76, inchangé)
TOOLS_PREVIEW_DEPLOY=NOT_DEPLOYED (alias gp-preview-v8 absent, 404)
COLORS_PREVIEW_DEPLOY=NOT_DEPLOYED (alias gp-preview-v8 absent, 404)
RESERVES_PREVIEW_DEPLOY=NOT_DEPLOYED (alias gp-preview-v8 absent, 404)

AUTH_PREVIEW=READY (déclaration opérateur)
PUBLIC_SECRET_EXPOSURE=NO

FEATURE_AI_ENABLED=false (valeur lue)
FEATURE_AI_DEVIS_ENABLED=PRESENT_VALEUR_ILLISIBLE (sensitive) — inerte : exige aussi FEATURE_AI_ENABLED=true
FEATURE_RELANCES_AUTO_ENABLED=PRESENT_VALEUR_ILLISIBLE (sensitive) — inerte en Preview (cf. § 5)

SMOKE_GP=NOT_RUN (aucun déploiement 408 ; alias protégé par le SSO Vercel)
SMOKE_TOOLS=NOT_RUN
SMOKE_COLORS=NOT_RUN
SMOKE_RESERVES=NOT_RUN

PACK_BUG_FIXED=YES (9d98c827 point d'entrée ; b165d83e lecture seule par transaction explicite)

PREVIEW_DATABASE_CUTOVER=COMPLETE
PREVIEW_HOSTED_READINESS=NO

VERDICT=ELSATIA_V9_2_PREVIEW_CUTOVER_PARTIAL
```

**Verdict : `ELSATIA_V9_2_PREVIEW_CUTOVER_PARTIAL`.** La base est migrée et prouvée à 408, et k1 est
active. La porte de code reste fermée faute d'un DB verify complet : il exige une connexion
PostgreSQL privilégiée, absente de ce conteneur. Le code 408 n'est donc déployé sur aucune surface,
et la recette hébergée n'est pas faite.

---

## 1. Bug du pack opérateur : scripts Node muets en succès (CORRIGÉ)

### Symptômes signalés par l'opérateur

`cutover-report.json` absent, `ledger-apres.json` non conservé, `db-verify.txt` vide,
`v9-checks.txt` présent et `--verify-only` en sortie 0.

### Cause

`scripts/preview/lib/preview-guard.mjs` → `estPointEntree()` comparait :

- `fileURLToPath(import.meta.url)` : le chemin **physique** du module, liens symboliques résolus par le chargeur ESM ;
- `resolve(process.argv[1])` : le chemin **logique**, non résolu.

`v9-cutover.sh` calcule `REPO` avec un `pwd` **logique**, puis appelle `node "$REPO/scripts/…"`.
Dès que le dépôt est atteint par un lien symbolique, ou avec une casse différente sous APFS
(macOS), les deux chemins diffèrent. Chaque script du pack (`cutover-step`, `check-ledger-v9`,
`guard-preview-target`, `db-verify`, `code-deploy-gate`…) **n'exécute alors rien et sort en 0**.

Cela explique exactement les symptômes :

| Symptôme | Mécanisme |
|---|---|
| `cutover-report.json` absent | `report-set` ne fait rien |
| `ledger-apres.json` absent | `ledger-tag` ne fait rien, puis `rm -f` du brut |
| `db-verify.txt` vide | `db-verify.mjs` ne fait rien |
| `v9-checks.txt` présent | fichier produit par `psql`, pas par Node |
| `--verify-only` en sortie 0 | `check-ledger-v9` et `code-deploy-gate` muets en succès |

### Gravité

Le défaut est **fail-open**. Lors du cutover opérateur, la garde de cible, le contrôle du ledger,
le plan, le contrôle de sauvegarde et l'égalité dry-run/plan ont très probablement été **muets**.
La cible était néanmoins la bonne : le ledger Preview contient bien les 36 migrations, sans
divergence. Le `EXIT_CODE=0` du `--verify-only` opérateur **ne constitue pas une preuve** ; il est
remplacé par la reconstitution du § 2.

### Reproduction

Dans ce conteneur, `node <lien>/scripts/preview/v9/code-deploy-gate.mjs --report /inexistant`
sortait en `0` sans aucune sortie. Le même appel par le chemin physique donne
`CODE_DEPLOY_ALLOWED=false` en sortie 1.

### Correctif (commit `9d98c827`, branche `claude/hopeful-albattani-h8bgnb`)

- `estPointEntree` résout physiquement les deux chemins (`realpathSync.native`).
- `v9-cutover.sh` utilise `pwd -P` pour `REPO` et `OUT`, et **refuse** de continuer si le rapport
  n'existe pas après la première écriture. Un pack muet ne peut donc plus passer.
- Le test `preview-pack.test.mjs` lance la porte via un lien symbolique : elle doit s'exécuter et
  rester fermée. Ce test échoue sans le correctif et passe avec (33/33). `test:preview-v9` : 29/29.
  `eslint` et `verify:secrets` : verts.

### Hors périmètre, non modifié

D'autres scripts (`smoke-email-preview`, `train-expectations`, `seed-elsatia-preview-year`,
`fixtures/generate-fixtures`) utilisent le même motif de point d'entrée.

## 1 bis. Second défaut du pack : DB-READONLY sur le pooler Supabase (CORRIGÉ, b165d83e)

Diagnostic opérateur sur Mac (`--verify-only` réel, pack corrigé de 9d98c827) : avec
`PGOPTIONS='-c default_transaction_read_only=on'`, le pooler renvoie `off|off|170006`, donc
l'option de démarrage n'est pas appliquée. Avec `begin transaction read only;`, il renvoie
`on|170006`. db-verify s'arrêtait en `DB-READONLY` ; ce n'est pas un défaut de la base ni du cutover.

Correctif (`scripts/preview/db-verify.mjs`, `psql_ro` de `v9-cutover.sh`, runbook de sauvegarde) :

- chaque contrôle s'exécute dans une session ouverte par `begin transaction read only` ;
- un bloc `DO` vérifie `transaction_read_only = on`, sinon il lève `ELSATIA_READ_ONLY_NON_EFFECTIF` :
  arrêt immédiat, `DB-READONLY`, NO-GO ;
- le contrôle s'exécute dans cette même transaction, puis `rollback` ; aucun `commit` n'est émis ;
- les `begin`/`rollback` propres aux fichiers SQL officiels sont retirés, pour que tout reste dans
  la transaction vérifiée ;
- tout autre contrôle transactionnel ou méta-commande psql est refusé ;
- PGOPTIONS est conservé en défense en profondeur ; garde Preview et refus Production inchangés.

Validation :

- tests du pack : 39/39 (dont faux psql qui ignore PGOPTIONS) ; `test:preview-v9` : 29/29 ; eslint vert ;
- PostgreSQL 16 local, train complet (408 migrations), avec un psql qui supprime PGOPTIONS :
  l'ancien db-verify donne `✖ DB-READONLY`, le nouveau donne `GO` ; une écriture via `psql_ro` est
  refusée (`cannot execute CREATE TABLE in a read-only transaction`).

Diff par rapport à `1a638855` : `scripts/preview/` et `docs/` uniquement. Aucun code applicatif,
aucune migration.

## 2. Preuve post-cutover reconstituée (lecture seule)

Aucune connexion PostgreSQL n'est possible depuis ce conteneur. Un adaptateur `psql` local, hors
dépôt, rejoue **les fichiers SQL officiels inchangés** via l'endpoint
`database/query/read-only` de l'API de gestion Supabase :

- rôle `supabase_read_only_user` ;
- `transaction_read_only = on` ;
- Production refusée.

Le **vrai** `v9-cutover.sh --verify-only` a été exécuté au SHA `1a638855`, sur la branche
`integration/elsatia-canonical-train-v9.2`, depuis un worktree propre.

| Étape | Résultat |
|---|---|
| 1-3 git + train | ✓ (HEAD 1a638855, branche, worktree propre, TARGET_LEDGER = 408) |
| 4 garde de cible | `TARGET_PREVIEW_CONFIRMED` (pgvvpqyjziyapbbkydmc) |
| 12-13 ledger | `PREVIEW_LEDGER_V9_COMPLETE` — CURRENT = 408 = TARGET, dernière 20261003001504, PENDING = 0 ; 813 originale (fonction `original=true`, `non_original=false`) |
| 14 db-verify | connexion RO ✓ · registre 408/408 aligné ✓ · préflight sécurité 21 contrôles, 0 bloquant ✓ · RLS : 0 table sans RLS, 0 écriture anon, 1/19 bucket public ✓ · RPC service-only 39/39 ✓ · **`ELSATIA_PREVIEW_DB_VERIFY_V1.sql` : ✖ `permission denied for function incident_table_exemptee`** |
| 14 contrôles V9 | `V9_CHECKS_GO` 14/14 (les 14 contrôles annoncés par l'opérateur, tous ✓) |
| 15 porte | `CODE_DEPLOY_ALLOWED=false` — motif unique : `DB verify : code 1` |

Le rapport `cutover-report.json` est désormais bien écrit : `mode=verify`,
`sha_deploye=1a638855…`, `ledger_apres=PREVIEW_LEDGER_V9_COMPLETE`, `controles_v9.ok=true`,
`db_verify.code=1`, `verdict=NO_GO`. Il reste hors dépôt, comme le veut le pack.

### Pourquoi `ELSATIA_PREVIEW_DB_VERIFY_V1.sql` échoue ici

Le fichier appelle des fonctions dont l'EXECUTE est réservé à `postgres` ou `service_role` :

- `incident_table_exemptee` (ACL `{postgres=X/postgres}`) ;
- `cles_bancaires_inventaire`.

C'est la posture de sécurité attendue, pas un défaut de la base. J'ai tenté de neutraliser la
première fonction en l'inlinant ; l'exécution bute aussitôt sur la seconde. J'ai arrêté là plutôt
que de réécrire davantage le SQL officiel. **Choix conservateur** : la porte reste fermée et rien
n'est déployé.

## 3. Phase 6 — porte « code après base »

`CODE_DEPLOY_ALLOWED=false`. Conformément à la consigne « déployer seulement si
CODE_DEPLOY_ALLOWED=YES », **aucun déploiement** n'a été fait, que ce soit sur GP, Tools, Colors
ou Réserves. Studio, Social, Boutique et Production n'ont pas été touchés.

## 4. Surfaces Preview (relevé en lecture seule, API Vercel)

| Surface | Alias gp-preview-v8 | État |
|---|---|---|
| GP (`elsatia-preview`) | 302 SSO Vercel | `dpl_BEESm…` = `gp-preview-v8` @ `53b4bc76` (code antérieur à la V9.2, compatible avec la base 408 : fonctions remplacées à signature constante, objets nouveaux additifs) |
| Tools (`elsatia-tools-preview`) | 404, pas d'alias | dernier déploiement ERROR (`claude/elegant-fermi-s9ld1d`) |
| Colors (`elsatia-colors-preview`) | 404, pas d'alias | dernier déploiement ERROR (`claude/elegant-fermi-s9ld1d`) |
| Réserves (`elsatia-reserves`) | 404, pas d'alias | dernier déploiement CANCELED (`claude/sweet-goodall-jpcufd`) |

L'URL de branche `integration/elsatia-canonical-train-v9.2` du projet `elsatia-preview` sert déjà
`1a638855` (READY). Depuis le passage à 408, elle est cohérente avec la base, mais elle n'a pas
fait l'objet d'une recette.

## 5. Indicateurs IA et relances

| Variable | Constat | Pourquoi elle est inerte |
|---|---|---|
| `FEATURE_AI_ENABLED` | **`false`** (valeur lue via l'API Vercel) | — |
| `FEATURE_AI_DEVIS_ENABLED` | présente ; type *sensitive*, donc **valeur illisible par conception** | `iaDevisEstActive` et `iaEstActive` sont vérifiés à chaque couche (`src/lib/preview-features.ts`) ; avec `FEATURE_AI_ENABLED=false`, l'IA devis est éteinte quelle que soit sa valeur |
| `FEATURE_RELANCES_AUTO_ENABLED` | présente, *sensitive*, valeur illisible | l'envoi automatique ne passe que par `/api/cron/abonnements`, qui répond 503 sans `CRON_SECRET` ; `CRON_SECRET` est absente de la Preview GP, et Vercel ne déclenche pas les crons sur les déploiements Preview |

Rien n'a été activé ni modifié. Décision humaine : supprimer ces deux variables, ou les recréer
explicitement à `false` en type *encrypted* pour les rendre vérifiables.

## 6. Sécurité des bundles (PUBLIC_SECRET_EXPOSURE=NO)

- Build GP local du SHA canonique avec canaris injectés dans les secrets serveur : 0 canari,
  0 `service_role`, 0 clé Stripe ou privée, 0 ref Production dans `.next/static`.
- Variables Vercel des 4 projets : aucune variable `NEXT_PUBLIC_*` porteuse de secret.
- `verify:secrets` : 3 976 fichiers suivis, 0 secret.
- Limite : les bundles hébergés ne sont pas scannables (SSO GP ; aucun déploiement sur les 3 autres alias).

## 7. Suite

```
HUMAN_ACTIONS_REMAINING=
  1. Sur le poste opérateur, récupérer le correctif du pack (9d98c827) puis relancer
     v9-cutover.sh --verify-only depuis integration/elsatia-canonical-train-v9.2 avec
     ELSATIA_PREVIEW_DB_URL. db-verify s'exécutera réellement ; s'il est vert, la porte s'ouvre.
     Lancer depuis un chemin physique (pwd -P) tant que le correctif n'est pas fusionné dans le train.
  2. Porte ouverte → déployer 1a638855 sur l'alias gp-preview-v8 des 4 projets Preview
     (jamais --prod), puis recette hébergée (accès SSO Vercel ou bypass Preview).
  3. FEATURE_AI_DEVIS_ENABLED / FEATURE_RELANCES_AUTO_ENABLED : supprimer, ou recréer à false
     en type encrypted.
  4. Rejouer npm run preview:v9:iban-k1 avec la sortie de bank-keys status pour l'attestation formelle.
  5. Fusionner le correctif du pack dans le train canonique (scripts uniquement, aucun impact applicatif).
```
