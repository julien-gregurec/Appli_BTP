# ELSATIA — Train canonique V8 : promotion et handoff opérateur Preview (V2)

| | |
|---|---|
| Date | 2026-10-01 |
| Référence technique officielle | **`integration/elsatia-canonical-train-v8` @ `53b4bc76b1096acbd8a8a8dd7340b1a577f99307`** (verdict `CANONICAL TRAIN V8 LOCALLY QUALIFIED`), publiée par cette mission |
| Branche de ce pack | `claude/modest-shannon-uhp2ic` = V8 `53b4bc7` + outillage Preview V8 (scripts `scripts/preview/*`, SQL de procédure, docs) ; **0 changement applicatif, 0 migration** (§1) |
| Train | **371 migrations**, dernière **`20260928000812`** ; DB verify **37 contrôles** ; **39** fonctions service-role only ; **16** seeds actifs ; 19 buckets ; Studio dédié 23 (hors Preview) |
| Cible | Supabase **`elsatia-preview`** (`pgvvpqyjziyapbbkydmc`) uniquement. Production (`exhvuzegsefmoguxoiak`, `elsatia-production`) refusée par code |
| Actions distantes de cette mission | **Aucune** écriture. **Aucune** lecture distante non plus : aucun identifiant Supabase, Vercel, Stripe, Brevo ou Redis dans la session. Seul geste distant : publication de la branche git `integration/elsatia-canonical-train-v8` |

## 0. Verdict

**`ELSATIA V8 PREVIEW PACK READY`**

Le pack est prêt à être exécuté par un opérateur disposant des identifiants Preview. « Ready » signifie :
- V8 est publiée comme référence officielle, au SHA exact ;
- tout l'outillage Preview est au niveau V8 (attendus générés : 371 / `20260928000812` / 37 / 39 / 19 / 16) ;
- toute écriture distante est désormais **verrouillée par code** derrière une garde (cible, nom du projet, ledger réel, train ≥ V8, sauvegarde complète < 6 h) ;
- la procédure complète a été **répétée de bout en bout sur le banc local** (base V7 avec ledger simulé → sauvegarde → autorisation → push simulé → post-push → DB verify GO → pilote A et B), et en dry-run hors réseau sur 6 états hébergés possibles ;
- typecheck, lint, Vitest, build (4 apps), seeds, attendus du train, DB verify et intégrité des migrations : verts (§13).

Ce verdict **ne prouve rien sur l'état hébergé**. Aucune preuve distante n'est revendiquée. Le GO Preview reste conditionné à l'exécution des §3 → §12 et à deux décisions propriétaire :

| Décision | Bloque | Défaut conservateur appliqué |
|---|---|---|
| `DECISION_REQUIRED_PILOT_SUBSCRIPTION` (§7) | la recette **pilote** Gestion Pro (pas le déploiement) | **aucune option appliquée** ; `--apply` refuse sans décision explicite |
| `DECISION_REQUIRED_PILOT_APPLICATIONS` (§7.5) | la recette pilote Colors / Réserves / Tools | GP seul pour le pilote ; aucun droit posé par script |

---

## 1. Canon officiel V8

| Contrôle | Résultat |
|---|---|
| `git fetch origin` | fait |
| `integration/elsatia-canonical-train-v8` existait ? | **non** |
| Création | `git push origin 53b4bc76b1096acbd8a8a8dd7340b1a577f99307:refs/heads/integration/elsatia-canonical-train-v8` |
| SHA relu après push | `53b4bc76b1096acbd8a8a8dd7340b1a577f99307` ✅ |
| `CANONICAL_V8_BRANCH_CONFLICT` | **non applicable** (branche absente, aucun force-push) |
| V7 | **non modifiée** (`integration/elsatia-canonical-train-v7` inchangée) ; V1 → V7 inchangées |
| `DECISION_REQUIRED:V8-INTEGRATION-BRANCH` (rapport V8 §17) | **fermé** : branche publiée au commit qualifié |

Chaque train publié est un **préfixe strict** de la liste V8 triée (vérifié sur les 8 branches
`integration/elsatia-canonical-train-v1..v8`) :

| Train | Migrations | Dernière |
|---|---|---|
| V1 | 328 | `20260923000346` |
| V2 | 335 | `20260923000400` |
| V3 | 340 | `20260926000505` |
| V4 | 352 | `20260927100000` |
| V5 | 355 | `20260928000301` |
| V6 | 358 | `20260928000601` |
| V7 | 359 | `20260928000701` |
| **V8** | **371** | **`20260928000812`** |

La ref de préparation périmée `claude/fervent-dirac-eez6pk` (321) est aussi un préfixe. Tout
upgrade d'un état publié vers V8 est donc **monotone** (aucune migration à insérer avant une
version déjà appliquée).

**Ref à utiliser par l'opérateur** : `claude/modest-shannon-uhp2ic` (outillage de ce pack). Elle
descend de `53b4bc7` et n'en diffère que par l'outillage :

```bash
git merge-base --is-ancestor 53b4bc76b1096acbd8a8a8dd7340b1a577f99307 HEAD && echo V8-OK
git diff --quiet 53b4bc7 HEAD -- supabase apps src workers packages public && echo APP-IDENTIQUE-V8
```

Le code déployé sur Vercel est celui de V8. `DECISION_REQUIRED:V8-PACK-V2-PROMOTION` (propriétaire) :
intégrer cet outillage dans une prochaine branche d'intégration. `integration/elsatia-canonical-train-v8`
reste figée à `53b4bc7` : ni force-push ni ajout.

## 2. Inventaire Preview : épinglages V4 → V7

| Zone | Constat | Action |
|---|---|---|
| Scripts Preview (`scripts/preview/*`) | nombres **calculés** depuis `supabase/migrations` et le SQL de vérification (`train-expectations.mjs`) ; 39 RPC dans `db-verify.mjs` | à jour V8, inchangé |
| Pack de qualification (`ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md`) | marqueurs générés à jour (371 / `…0812` / 37). La ref pointait vers `claude/sleepy-cannon-6je2vo` « à publier » ; §8 ligne 0 attendait `335 · … · 24 · 5 · 12` | **réaligné** sur `integration/elsatia-canonical-train-v8` @ `53b4bc7` ; ligne 0 → `371 · … · 31 · 5 · 13` |
| Runbook V3 | même ref « à publier » ; STEP 3-5 (sauvegarde schéma + données seulement, push sans garde) | ref réalignée ; STEP 3-5 **remplacés** par ce handoff (§3-§6). Restent périmés dans le runbook V3, qui est déjà « remplacé pour l'exécution » : `test:smoke-email 12/12` (réel **13/13**), « 11 contrôles bloquants » (réel **37** contrôles, dont 2 non bloquants) |
| Nombre de migrations / dernière migration | générés, `verify:train-expectations` ✅ | — |
| DB verify (`ELSATIA_PREVIEW_DB_VERIFY_V1.sql`) | 37 contrôles, bloc `attendu_train` = (371, `20260928000812`) | — |
| CI (`.github/workflows/ci.yml`) | aucun nombre épinglé : `verify:train-expectations`, seeds sur base fraîche du dépôt | — |
| Seeds (`scripts/seeds/registry.mjs`) | les compléments d'upgrade V5→V6, V6→V7, V7→V8 sont `CI_ONLY` (harnais d'upgrade) : **historique voulu** | — |
| Deployment checks (`preflight-preview`, `env-check`, `http-smoke`, `storage-smoke`) | 19 buckets (« train V4 » dans un libellé de test : constat toujours vrai en V8) | — |
| **DR V2** (`scripts/dr/v2/drill.sh`) | `DR2_UPGRADE_SCRIPT` par défaut = `upgrade-v6-v7.sh` : **épinglé V7** | **non modifié** : aucun drill DR rejoué sur V8. Avant la prochaine qualification DR, passer `DR2_UPGRADE_SCRIPT=scripts/qualification/upgrade-v7-v8.sh` + `DR2_METIER_*` (rapport V8 §17). La sauvegarde Preview de ce pack (§4) ne dépend pas du drill |
| Écriture distante | **aucune garde de train ni de sauvegarde** avant ce pack : `db push` reposait sur une lecture humaine du runbook | **ajoutée** : §3-§6 |

## 3. Préflight (opérateur, identifiants Preview)

Toutes les commandes : depuis la ref §1, shell **sans** variable Production (`VERCEL_ENV=production`
ou `ELSATIA_APPLICATION_ENV=production` ⇒ refus immédiat de tous les scripts du pack).

```bash
npm ci && for a in tools colors reserves; do npm ci --prefix apps/$a; done
npm run verify:migrations verify:train-expectations verify:secrets verify:env-manifest
npm run test:preview-pack test:preview-v8-gate test:preflight-preview test:smoke-email test:seeds
npm run typecheck && npm run lint && npm test

npx supabase login
npx supabase link --project-ref pgvvpqyjziyapbbkydmc
cat supabase/.temp/project-ref                                   # pgvvpqyjziyapbbkydmc, jamais exhvuzegsefmoguxoiak
npx supabase projects list -o json > ~/elsatia-preview/projects.json   # nom « elsatia-preview » exigé par la garde
export ELSATIA_PREVIEW_DB_URL='postgresql://postgres:…@db.pgvvpqyjziyapbbkydmc.supabase.co:5432/postgres'   # jamais affichée
psql "$ELSATIA_PREVIEW_DB_URL" -Atc "select name, installed_version from pg_available_extensions where name in ('pgsodium','pg_trgm','unaccent','pgcrypto')"
```

**Sortie** : portes locales vertes (§13). `pgsodium` est disponible. Le projet lié est la Preview.

Ce que la garde (`scripts/preview/lib/v8-gate.mjs`) **refuse par code**, avec code de sortie 2 :

| Cas | Refus |
|---|---|
| ref `exhvuzegsefmoguxoiak` (URL, ou attendue) | `référence Supabase PRODUCTION : refus` |
| projet nommé `elsatia-production`, ou contenant « production » | `Production, refus` |
| projet nommé autrement que `elsatia-preview` | `elsatia-preview attendu` |
| ref ≠ `pgvvpqyjziyapbbkydmc` | `mauvais project ref` |
| `VERCEL_ENV` / `ELSATIA_APPLICATION_ENV` = `production` | `environnement Production détecté` |
| dépôt < V8 (moins de 371 migrations, ou sans `20260928000812`) | `dépôt au train inférieur à V8` |
| ledger hébergé ≠ V8 au moment d'une procédure post-push | `train inférieur à V8 ou mauvais ledger` |
| projet lié par la CLI ≠ Preview | NO-GO (`npx supabase link` requis) |
| ledger lu depuis un fichier (dry-run) pour autoriser un push | `jamais accepté pour autoriser un push` |
| `--local-harness` sur une URL non locale | `n'accepte qu'une base locale` |

## 4. Sauvegarde (obligatoire avant toute migration Preview)

```bash
npm run preview:backup -- --out ~/elsatia-preview/backup-$(date -u +%Y%m%dT%H%M%SZ)
```

Opérations exclusivement en **lecture**, avec `pg_dump` et `psql` en session `default_transaction_read_only=on`. Le dossier :
- doit être **hors du dépôt**, sinon refus ;
- doit être **neuf**, sinon refus ;
- est créé en mode `0700`.

| Fichier | Contenu | Exigé |
|---|---|---|
| `db.dump` | base complète (`pg_dump --format=custom`) | ✅ |
| `ledger.txt` | `supabase_migrations.schema_migrations`, une version par ligne | ✅ |
| `auth.dump` | snapshot Auth (`pg_dump --data-only --schema=auth`) | ✅ |
| `storage-inventory.tsv` | buckets (id, public, limite), puis objets (bucket, nom, taille, date) | ✅ |
| `manifest.json` | ref, date UTC, empreinte sha256 du ledger, sha256 et taille de chaque fichier, compteurs (users, identities, buckets, objets) | ✅ |

Prérequis : `pg_dump` de version **≥ version du serveur** hébergé, sinon il refuse. Contrôler avec `psql -Atc 'show server_version'`.

**Le contenu des objets Storage n'est pas copié** : seul l'inventaire l'est, comme demandé. Une copie
des fichiers (`supabase storage cp -r ss:///<bucket> …` par bucket) relève de
`DECISION_REQUIRED:V8-STORAGE-CONTENT-BACKUP`. Défaut conservateur : aucune migration V8 ne touche
`storage.objects`. L'inventaire suffit donc pour **constater** l'absence de perte (§9).

La garde n'accepte la sauvegarde que si :
- elle a **moins de 6 h** ;
- elle vient du **même projet** ;
- elle porte **le même ledger** que celui relu au moment du push (une sauvegarde faite avant un changement de ledger est périmée) ;
- ses **4 fichiers** sont présents, non vides et **intacts** : sha256 recalculé sur disque ;
- ce n'est pas une sauvegarde de répétition locale (`simulation: true`).

## 5. Ledger : état hébergé réel, jamais supposé

```bash
npm run preview:v8-gate -- --plan
```

Le script **lit le ledger hébergé au moment de l'exécution**, en lecture seule, et classe l'état :

| Statut | Signification | Suite |
|---|---|---|
| `EN_RETARD` + train reconnu (V1 … V7) | préfixe exact du dépôt, upgrade monotone | §6 |
| `EN_RETARD` hors train publié (p. ex. 321) | préfixe exact, mais historique non publié | `DECISION_REQUIRED` : revue humaine, puis `--accept-off-train` |
| `VIERGE` | 0 migration | `DECISION_REQUIRED` (la Preview existante ne devrait pas l'être) : `--accept-off-train` après revue |
| `A_JOUR` | 371, dernière `…0812` | pas de push : §6.3 |
| `MAUVAIS_LEDGER` | version(s) distante(s) absente(s) du dépôt (autre lignée) | **NO-GO**, jamais contournable par option : `supabase migration repair` ou réinitialisation = décision propriétaire |
| `LEDGER_A_TROUS` | une migration du dépôt manque **avant** la dernière appliquée | **NO-GO**, jamais `db push --include-all` automatique |

Le plan affiche le **chemin Hosted → V8 segment par segment**. Exemples obtenus en dry-run (§10) :

| État hébergé | Chemin affiché |
|---|---|
| V7 (359) | V8 +12 (`…0801` → `…0812`) |
| V4 (352) | V5 +3 · V6 +3 · V7 +1 · V8 +12 = **19** |
| V1 (328) | V2 +7 · V3 +5 · V4 +12 · V5 +3 · V6 +3 · V7 +1 · V8 +12 = **43** |
| ref 321 | V1 +7 … V8 +12 = **50**, `DECISION_REQUIRED` hors train |

Chaque marche V3→V4 … V7→V8 a été qualifiée par son rapport de train (upgrade avec historique,
0 perte silencieuse). Un `db push` depuis un état ancien applique ces marches dans l'ordre, en un passage.

## 6. Migration Preview → V8

### 6.1 Autorisation

```bash
npm run preview:v8-gate -- --authorize-push \
  --projects-json ~/elsatia-preview/projects.json \
  --backup-dir ~/elsatia-preview/backup-<horodatage>
```

`GO` uniquement si **toutes** ces conditions tiennent :
- la ref et le nom du projet désignent la Preview ;
- le dépôt est au train V8 ;
- le ledger est compatible (§5) ;
- le projet lié par la CLI est la Preview ;
- la sauvegarde est valide (§4).

Le script n'écrit **jamais**. Il imprime les deux commandes que l'opérateur lance alors.

### 6.2 Push (opérateur, après GO uniquement)

```bash
npx supabase db push --linked --dry-run    # doit lister EXACTEMENT le nombre annoncé par la garde, dans l'ordre
npx supabase db push --linked
npm run preview:v8-gate -- --post-push     # exige 371/371, dernière 20260928000812
```

### 6.3 Vérification

```bash
npm run preview:db-verify -- --before-owner   # 37 contrôles ; 2 non bloquants avant propriétaire ; 39/39 RPC service-role only ; 19 buckets, 1 public
```

Puis STEP 7 du runbook V3 (propriétaire `total` + clé d'attestation). Ensuite :

```bash
npm run preview:db-verify                     # sans option : GO attendu
```

Revue obligatoire du rapport d'impact Per-App (`rapport_migration_suspension_par_app_v1`, migration
`…0804`) sur la base cible. C'est `DECISION_REQUIRED` Per-App `MIGRATION-REVUE`, hérité du rapport V8 §17.
Mode sûr : DB verify 34 exige **0 contrôle actif**.

## 7. Entreprise pilote — `DECISION_REQUIRED_PILOT_SUBSCRIPTION`

### 7.1 Constat (rapport V8 §8, reproduit ici)

- `supabase/production/seed_entreprise_pilote_btp.sql` crée `PILOTE-BTP-V1` avec `created_at = now() − 2 mois`.
- Le trigger `initialiser_essai_entreprise` fixe l'essai à `[created_at, created_at + 30]`. L'essai est donc **échu**.
- Depuis B-4 (`…0803`), `est_membre_actif` est faux pour les **28 membres** : Gestion Pro est fermé à l'écran **et** par l'API.

Répétition locale (base V7 + seed pilote, upgradée en V8) :

```
! [PILOTE] état — statut essai, essai 2026-07-30 → 2026-08-29 (ÉCHU), GP suspended, 28 membres actifs, Stripe non lié
sonde RLS (ouvrier pilote) : est_membre_actif=false | chantiers visibles = 0
```

### 7.2 Diagnostic (lecture seule, sans risque)

```bash
npm run preview:pilot -- --diagnose
```

### 7.3 Options : aucune n'est appliquée par défaut

| | A — prolonger explicitement l'essai | B — abonnement pilote explicite |
|---|---|---|
| Effet | nouvelle fenêtre d'essai `[aujourd'hui, --until]`, **≤ 30 jours** | `abonnement_statut = 'actif'`, `abonnement_echeance = --until` (≤ 366 j), facturation pilote **manuelle / offline** |
| Règles Billing | **inchangées** : la contrainte `entreprises_essai_dates_coherentes` (≤ 30 j) s'applique, B-4 reste actif. Écart **de données** à assumer : un 2ᵉ essai pour cette entreprise | **inchangées** : mêmes colonnes que la RPC plateforme `plateforme_modifier_abonnement` |
| Chemin | script gardé seulement : la console n'expose pas la prolongation d'essai | **préféré** : console `/plateforme` → abonnement → statut `actif`, échéance, note citant la décision. Rôle `total` ou `facturation` + AAL2, RPC existante. Alternative : script gardé |
| Rejeu du seed pilote | **survit** : le seed ne touche pas les dates d'essai | **annulé** : le seed remet `essai`, donc essai échu. Prouvé en répétition. Après tout rejeu du seed : `--diagnose`, puis ré-appliquer B |
| Stripe | refusé si l'entreprise est liée à Stripe | refusé si l'entreprise est liée à Stripe (l'état appartiendrait alors à Stripe Test) |
| Recommandation conservatrice | — | **B via la console** : chemin audité existant, aucun redémarrage d'essai, aucune donnée fabriquée. **La décision reste au propriétaire** |

### 7.4 Application (après décision écrite du propriétaire)

```bash
npm run preview:backup -- --out ~/elsatia-preview/backup-pilote-<horodatage>   # le ledger V8 a changé depuis §4
npm run preview:pilot -- --apply B --until 2027-03-31 \
  --decision DECISION_REQUIRED_PILOT_SUBSCRIPTION=B:<auteur>-<date> \
  --projects-json ~/elsatia-preview/projects.json \
  --backup-dir ~/elsatia-preview/backup-pilote-<horodatage>
npm run preview:pilot -- --diagnose
```

Gardes du script :
- `--apply` sans `A` / `B` est refusé ;
- une `--decision` absente, ou portant une autre option que celle demandée, est refusée ;
- A au-delà de 30 jours est refusé ;
- le nom du projet est vérifié, et le ledger hébergé doit être **exactement V8** ;
- une sauvegarde < 6 h du même ledger est exigée ;
- le projet lié par la CLI doit être la Preview ;
- l'entreprise ne doit pas être liée à Stripe.

Le SQL (`docs/runbooks/sql/ELSATIA_PILOT_SUBSCRIPTION_APPLY_V1.sql`) tourne en **une transaction** :
- il revérifie le ledger (371 / `…0812`) et la décision ;
- il verrouille **exactement une** entreprise `PILOTE-BTP-V1`, en statut `essai` ;
- il écrit les **données seulement** : aucune fonction, policy, contrainte ni grant ;
- il trace la décision dans `abonnement_note` ;
- il contrôle `etat_commercial_gestion_pro` (`trial` pour A, `active` pour B) et qu'aucune autre entreprise n'a bougé ;
- sinon `ROLLBACK`.

Répétition locale (bases jetables `sim_a`, `sim_b` copiées de la base upgradée) :

| Étape | A (`--until` J+20) | B (`--until` J+200) |
|---|---|---|
| application | `etat_gp=trial` ✅ | `etat_gp=active` ✅ |
| sonde RLS (ouvrier pilote) | `est_membre_actif=true`, 1 chantier visible | `est_membre_actif=true`, 1 chantier visible |
| rejeu | ré-applique la même fenêtre (≤ 30 j) | **refusé** : « statut actif inattendu », rien n'est modifié |
| rejeu du seed | essai conservé (`trial`) | revient à `essai` échu (`suspended`) |
| refus testés | sans option, sans décision, décision B pour A, 45 jours, sans `--projects-json`, sauvegarde d'avant le push (ledger changé) | idem |

### 7.5 `DECISION_REQUIRED_PILOT_APPLICATIONS`

Le seed pilote ne pose **aucun** droit d'application : 0 ligne `acces_applications_entreprises` et 0 habilitation. Le diagnostic affiche
`colors=aucun, reserves=aucun, tools=aucun`. Pour une recette pilote Colors / Réserves / Tools, le
propriétaire pose ces droits par la console `/plateforme`, rôle plateforme et AAL2. Aucun script de
ce pack ne les écrit. Défaut : **pilote = Gestion Pro seul**.

## 8. Périmètre de la première Preview

| App | Projet Vercel | Statut |
|---|---|---|
| Gestion Pro | `elsatia-preview` (racine) | **IN** |
| Tools | `apps/tools` | **IN** |
| Colors | `apps/colors` | **IN** |
| Réserves | `apps/reserves` | **IN** |
| Studio + worker Studio | — | **OUT** (pas de projet Vercel, pas de Redis, pas de §12 worker) |
| Boutique, Stripe Connect | — | **OUT** (`FEATURE_BOUTIQUE_ENABLED=false`) |

Builds locaux de ces 4 apps : ✅ (§13). Build de recette Tools / Réserves / Colors :
`NEXT_PUBLIC_TOOLS_ENV=local` / `ELSATIA_APPLICATION_ENV=local`. Sans ces variables, les gardes
de variables publiques **refusent** le build, comme prévu. Sur Vercel, ces variables sont les vraies
valeurs Preview (`ELSATIA_APPLICATION_ENV=preview`).

## 9. Auth et Storage

**Auth** (pack V1 §4.3, inchangé par V8) :
- Site URL = origine GP Preview ;
- Redirect URLs des 4 apps ;
- gabarits `supabase/templates/*` ;
- SMTP Brevo ;
- confirmations activées ;
- MFA TOTP ;
- **jamais** `supabase config push`.

Contrôle post-migration : V8 ne touche pas le schéma `auth`. Les `compteurs.auth_users` et
`compteurs.auth_identities` du manifeste d'avant push doivent être égaux à :

```bash
psql "$ELSATIA_PREVIEW_DB_URL" -Atc "select count(*) from auth.users; select count(*) from auth.identities"
```

**Storage** :

```bash
npm run preview:storage-smoke -- --env-file ~/elsatia-preview/gp.env            # 19/19 buckets, 1 public
npm run preview:storage-smoke -- --env-file ~/elsatia-preview/gp.env --write    # safe-run d'écriture (pack V1 §8 l.10)
```

Comparer ensuite le nombre d'objets par bucket avec `storage-inventory.tsv` de la sauvegarde. Attendu : **identique**, car aucune migration V8 ne touche `storage.objects`.

## 10. E-mails, Stripe Test, Redis, HTTP, Playwright

| Domaine | Commande / geste | Sortie attendue |
|---|---|---|
| **E-mails** | `node --env-file=~/elsatia-preview/gp.env scripts/smoke-email-preview.mjs --check`, puis `--brevo-sandbox`, `--brevo-send`, `--auth-recovery` (pack V1 §6) | E1, E3, E7, E9, E13 reçus. **V7+** : hors Production avérée, l'envoi n'atteint que `EMAIL_PREVIEW_ALLOWLIST`. La poser avec les adresses de recette possédées, sinon refus attendu (fail-closed) |
| **Stripe Test** | `npm run preview:stripe-verify -- --env-file ~/elsatia-preview/gp.env --gp-origin https://<gp>.vercel.app` ; `STRIPE_PRICES_VERIFY_STRICT=1 npm run verify:stripe-prices` ; parcours pack V1 §5.5 | GO. Clés `sk_test_`/`rk_test_` seules (une `sk_live_` ⇒ refus par code). **Aucun Stripe Live** |
| **Redis** | `npm run preview:redis-check` : **seulement** si Studio + worker entrent dans le périmètre | **hors première Preview** (Studio OFF) : non exécuté, non requis |
| **HTTP** | `VERCEL_AUTOMATION_BYPASS_SECRET=… npm run preview:http-smoke -- --gp … --tools … --colors … --reserves …` | GO ; crons GP 404 (`FEATURE_CRONS_ENABLED=false`) ; aucun `HTTP-RATE-LIMIT-DOWN` |
| **Env** | `vercel env pull --environment=preview` par projet, puis `npm run preview:env-check -- --dir ~/elsatia-preview --require gp,colors,tools,reserves` | GO |
| **Playwright** | voir ci-dessous | — |

**Playwright distant** : les specs de `tests/e2e/` préparent leurs données avec la clé de service
(`E2E_SUPABASE_URL`). Contre la Preview, ce sont donc des **écritures distantes**. Règle de ce pack :
- **après** le GO base (§6.3) ;
- **après** la décision pilote (§7) ;
- sur des comptes de recette dédiés uniquement ;
- `E2E_BASE_URL=https://<gp>.vercel.app` avec le bypass Vercel ;
- d'abord les surfaces publiques : `brand-visible`, `colors-surface-publique` (`E2E_APP=colors`), `responsive @responsive` ;
- puis `pilot-acceptance-v3` sur l'entreprise pilote.

La recette Playwright **complète** (rapport V8 §14 : 107 + 59 + 7 + 5×3 + 17×2 + 75 + 15) est
prouvée **localement** seulement. Sa réexécution distante reste **NOT PROVEN** tant qu'elle n'est pas faite.

## 11. Rollback

| Déclencheur | Rollback | Critère de retour |
|---|---|---|
| `db push` s'arrête sur une version | 1. Ne **pas** relancer. 2. `npm run preview:v8-gate -- --plan` : relever l'état réel (le CLI enregistre chaque migration réussie, la version en échec non). 3. `npm run preview:db-verify -- --allow-pending`. 4. État N-1 cohérent : **aucune app V8 déployée** (les apps V8 supposent 371) ; correction en avant, après analyse. 5. État incohérent : restaurer `db.dump` sur le projet réinitialisé (`pg_restore --clean --if-exists --no-owner -d "$ELSATIA_PREVIEW_DB_URL" db.dump`, décision propriétaire, Preview uniquement) ; le ledger revient avec la base (schéma `supabase_migrations` inclus dans le dump), `--plan` doit retrouver l'empreinte de `ledger.txt` | `--plan` identique à la sauvegarde (même empreinte de ledger) ; `db-verify` GO sur l'état cible |
| Auth incohérent après restauration | `pg_restore --data-only --schema=auth auth.dump` (sur auth vidé seulement) ; Dashboard Auth (URL, gabarits, SMTP) | compteurs = manifeste ; E1 + E3 reçus |
| Storage | aucune migration V8 n'écrit `storage.objects` : comparer à `storage-inventory.tsv`. Un objet manquant n'est **pas** restaurable depuis ce pack : contenu non copié, `DECISION_REQUIRED:V8-STORAGE-CONTENT-BACKUP` | inventaire identique |
| Pilote (A ou B) | données seulement : **B** → console `/plateforme`, retour à `essai` (ou rejeu du seed pilote, qui remet `essai`) ; **A** → aucune réversion automatique (l'ancienne fenêtre est échue). Ne pas fabriquer de dates | `--diagnose` conforme à la décision |
| Build / Auth / Stripe / déploiement | pack V1 §9 (alias Vercel précédent, endpoint Stripe **désactivé**, jamais supprimé) | pack V1 §9 |

Aucun rollback ne touche la Production. Aucun ne suppose de PITR (plan gratuit).

## 12. GO / NO-GO Preview V8

**GO Preview V8** si et seulement si tout ce qui suit est vrai, dans cet ordre :

1. §3 : portes locales vertes ; cible = `elsatia-preview` / `pgvvpqyjziyapbbkydmc` ; CLI liée à la Preview ;
2. §4 : sauvegarde complète < 6 h, même ledger (4 fichiers + manifeste) ;
3. §5 : ledger hébergé lu, ni `MAUVAIS_LEDGER` ni `LEDGER_A_TROUS` ; un hors-train exige une décision écrite ;
4. §6 : `--authorize-push` GO, `db push --dry-run` = nombre annoncé, `--post-push` 371/371, `db-verify` GO (37 contrôles, 39/39, 19 buckets, 0 contrôle de mode sûr actif) ;
5. §9 : compteurs Auth et inventaire Storage identiques à la sauvegarde ; Auth configurée ;
6. §10 : env-check, http-smoke, stripe-verify, e-mails obligatoires, storage-smoke : GO sur GP, Tools, Colors, Réserves ;
7. aucune clé live, aucun contact avec `exhvuzegsefmoguxoiak`, aucun `vercel --prod`, aucun merge `main`.

**GO pilote** : GO Preview, plus `DECISION_REQUIRED_PILOT_SUBSCRIPTION` décidée et appliquée (§7), `--diagnose` conforme, plus le périmètre applicatif du pilote décidé (§7.5).

**NO-GO immédiat** dans chacun de ces cas :
- un refus de garde (code 2) ;
- `MAUVAIS_LEDGER` ou `LEDGER_A_TROUS` ;
- une sauvegarde incomplète ;
- un écart Auth ou Storage ;
- un contrôle DB verify bloquant ;
- une clé live.

## 13. Vérifications de cette mission (banc local, sans réseau distant)

| Porte | Résultat |
|---|---|
| `npm run typecheck` (GP + Tools + Réserves + Colors) | ✅ |
| `npm run lint` (4 apps) ; `eslint scripts/preview/` | ✅ (0 erreur) |
| `npm test` (Vitest) | ✅ GP **2 588** (36 ignorés), Tools **2 150**, Réserves **226**, Colors **431** |
| Build GP (`npm run build`, sans variable) | ✅ |
| Builds Tools / Réserves / Colors | ✅ en mode recette (`NEXT_PUBLIC_TOOLS_ENV=local`, `ELSATIA_APPLICATION_ENV=local`). Sans variable : **refus attendu** des gardes de variables publiques (fail-closed, prouvé) |
| `verify:migrations` | ✅ 371 valides ; cibles : partagé 371 · Studio dédié 23 |
| `verify:train-expectations` | ✅ 371 / `20260928000812` / 37 |
| Intégrité : `git diff 53b4bc7 -- supabase apps src workers packages` | vide (0 migration, 0 code applicatif modifié) |
| Base fraîche `rebuild_db.sh v8_fresh` | ✅ **371/371**, 0 erreur |
| `test:preview-pack` | ✅ 31/31 |
| **`test:preview-v8-gate` (nouveau)** | ✅ **12/12** |
| `test:seeds` | ✅ 48/48 |
| `verify:seeds` (base fraîche 371) | ✅ **`ALL ACTIVE SEEDS QUALIFIED — 16/16 sur 371`** (§13.1) |
| `test:migration-targets` 7/7 · `test:preflight-preview` 5/5 · `test:smoke-email` 13/13 · `test:dr-guard` 10/10 · `test:incident-drill` 6/6 · scripts Stripe 5/10/6 | ✅ |
| `verify:env-manifest` (14 DECISION_REQUIRED, inchangé) · `test:env-manifest` 67/67 · `verify:secrets` · `verify:stripe-prices` | ✅ |
| DB verify sur base **V7 + pilote upgradée en V8** (répétition) | ✅ **GO** : 371/371, 37 contrôles (2 non bloquants avant propriétaire), préflight 2 anomalies attendues `--before-owner`, 39/39 RPC |

### 13.1 Seeds

`SEEDS_DR_PGPASSWORD=… node scripts/seeds/verify-seeds.mjs` :

| Passe | Résultat | Cause |
|---|---|---|
| 1 | `SEED BLOCKERS REMAIN — 15/16` : `dr-synthetic` en échec | **environnement** : extension `plpython3u` absente du conteneur (`00_supabase_stubs.sql:187`), paquet `postgresql-plpython3-16` non installé. C'est un prérequis déjà listé au rapport V8 §18. Aucun code modifié |
| 2 (après `apt-get install postgresql-plpython3-16`) | ✅ **`ALL ACTIVE SEEDS QUALIFIED — 16/16 seeds qualifiés sur 371 migrations (20260928000812_…)`** | — |

## 14. Dry-run de la procédure Preview

Aucun identifiant n'était présent. La procédure a donc été répétée **intégralement sur le banc
local** (PostgreSQL 16) avec `--local-harness` :
- localhost uniquement ;
- ref Preview **simulée** ;
- sorties marquées « simulation » ;
- sauvegardes marquées `simulation: true` et **refusées** pour une cible hébergée.

| # | Étape | Résultat |
|---|---|---|
| 1 | base « hébergée » simulée : chaîne V7 (359) depuis `integration/elsatia-canonical-train-v7` + ledger `supabase_migrations.schema_migrations` (359) + seed pilote | 359/359 |
| 2 | `--plan` | `EN_RETARD — 359, train V7` ; chemin `V8 +12 (…0801 → …0812)` |
| 3 | `--authorize-push` sans sauvegarde | REFUS (`--backup-dir requis`) |
| 4 | `preview:backup` | 4 fichiers + manifeste ✅ |
| 5 | refus : nom `elsatia-production` ; `VERCEL_ENV=production` ; URL Production ; mauvais ref ; dry-run utilisé pour autoriser ; CLI non liée | 6 × refus / NO-GO ✅ |
| 6 | `--authorize-push` complet | **GO**, 12 migrations annoncées |
| 7 | sauvegarde altérée (1 octet ajouté à `auth.dump`) | NO-GO « fichier modifié » ✅ |
| 8 | push simulé : 12 migrations V8 appliquées une par une + ledger | 12/12, 0 erreur |
| 9 | `--post-push` | 371/371 ✅ ; `--authorize-push` ensuite : « DÉJÀ V8 » |
| 10 | `db-verify --local-harness --before-owner` | **GO** |
| 11 | pilote : diagnostic, refus, A, B, rejeux, seed rejoué, sondes RLS | §7.4 |

Dry-run hors réseau (`--ledger-file`) sur d'autres états hébergés possibles :

| État | Résultat |
|---|---|
| V4 | `EN_RETARD`, 19 à appliquer |
| V1 | `EN_RETARD`, 43 à appliquer |
| ref 321 | `EN_RETARD` hors train, 50, `DECISION_REQUIRED` |
| V4 + 1 version étrangère | **NO-GO** `MAUVAIS_LEDGER` |
| V4 avec un trou | **NO-GO** `LEDGER_A_TROUS` |
| vierge | `VIERGE`, 371, `DECISION_REQUIRED` |

Ces résultats **ne disent rien** du ledger hébergé réel : le §5 le lit au moment de l'exécution.

## 15. Fichiers

| Fichier | Rôle |
|---|---|
| `scripts/preview/lib/v8-gate.mjs` | garde pure : train V8, identité projet, analyse du ledger, chemin Hosted → V8, sauvegarde, décision de push |
| `scripts/preview/v8-upgrade-gate.mjs` | CLI `--plan` / `--authorize-push` / `--post-push` (lecture seule, ne pousse jamais) |
| `scripts/preview/backup-preview.mjs` | sauvegarde obligatoire (base, ledger, Auth, inventaire Storage, manifeste) |
| `scripts/preview/pilot-subscription.mjs` | diagnostic pilote ; application gardée de `DECISION_REQUIRED_PILOT_SUBSCRIPTION` |
| `docs/runbooks/sql/ELSATIA_PILOT_SUBSCRIPTION_DIAGNOSTIC_V1.sql`, `…_APPLY_V1.sql` | SQL du pilote (diagnostic lecture seule ; application transactionnelle, données seulement) |
| `scripts/preview/v8-gate.test.mjs` | 12 tests hors réseau (`npm run test:preview-v8-gate`) |
| `package.json` | `preview:v8-gate`, `preview:backup`, `preview:pilot`, `test:preview-v8-gate` |
| `docs/qualification/ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md`, `docs/runbooks/ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md` | ref V8 publiée ; STEP 3-5 du runbook V3 renvoyés ici |

Rapports de train V3 → V8 : **non modifiés**.

## 16. DECISION_REQUIRED

| ID | État | Défaut appliqué |
|---|---|---|
| `DECISION_REQUIRED:V8-INTEGRATION-BRANCH` | **fermé** | branche publiée à `53b4bc7` |
| `CANONICAL_V8_BRANCH_CONFLICT` | non survenu | — |
| `DECISION_REQUIRED_PILOT_SUBSCRIPTION` (= `V8-PILOTE-ESSAI-ECHU`) | **ouvert, propriétaire** | rien appliqué ; recommandation B via la console |
| `DECISION_REQUIRED_PILOT_APPLICATIONS` | **ouvert, propriétaire** | pilote = GP seul |
| `DECISION_REQUIRED:V8-PACK-V2-PROMOTION` | ouvert | outillage sur `claude/modest-shannon-uhp2ic` ; `integration/…-v8` figée |
| `DECISION_REQUIRED:V8-STORAGE-CONTENT-BACKUP` | ouvert | inventaire seulement |
| Ledger hors train / vierge / étranger / à trous | conditionnel (§5) | NO-GO par défaut |
| DR V2 épinglé V6→V7 | ouvert (technique) | non modifié, non rejoué |
| Hérités du rapport V8 §17 : Perf B1-B4, C1 ; Billing (`CONTRATS-PRIX-69`, `ESSAI-PAR-SIREN`, …) ; Per-App (`MIGRATION-REVUE`, …) ; red team V2 §7 ; e-mail A-1/A-3/A-8/A-9 ; RGPD ; Studio | ouverts | inchangés |
| Preuves distantes (Supabase, Auth, Storage, e-mail, Stripe Test, HTTP, Playwright hébergés) | **NOT PROVEN** | à produire par §3 → §12 |

## 17. Interdits respectés

Aucune action sur la Production. Aucun Stripe Live. Aucun merge vers `main`. Aucune modification
de V7 (ni des trains antérieurs). Aucune écriture distante. Aucune preuve distante inventée.
