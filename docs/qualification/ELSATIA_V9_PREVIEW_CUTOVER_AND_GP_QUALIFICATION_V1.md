# ELSATIA — V9 Preview cutover 372 → 389 et qualification GP Preview (V1)

| | |
|---|---|
| Date | 2026-10-02 |
| SHA canonique | `6392131aa02cecc9991358915963068de8292d24` |
| Branche canonique | `integration/elsatia-canonical-train-v9-final` (**publiée par cette mission**, exactement à ce SHA) |
| Ce rapport | branche de session `claude/peaceful-rubin-qp492a` = SHA canonique + ce seul fichier (aucun code, aucune migration) |
| Supabase Preview visé | `pgvvpqyjziyapbbkydmc` (jamais `exhvuzegsefmoguxoiak`) |
| Vercel visé | `elsatia-preview` |

## 0. Verdict

**`V9_GP_PREVIEW_BLOCKED`**

La phase A (publication canonique) est **faite et prouvée**. Les phases B à G (lecture du ledger hébergé, backup, migration 372 → 389, déploiement, qualification hébergée) **n'ont pas pu démarrer** :

| Blocker | Preuve |
|---|---|
| `BLOCKER_NETWORK_EGRESS` (P0 d'exécution) | le proxy de sortie du conteneur répond `CONNECT … 403 Forbidden` pour `pgvvpqyjziyapbbkydmc.supabase.co`, `api.supabase.com`, `api.vercel.com` et `elsatia-preview-git-gp-preview-v8-julien-gregurec1.vercel.app` (politique réseau de l'environnement cloud) |
| `BLOCKER_REMOTE_CREDENTIALS` | aucune variable `SUPABASE_ACCESS_TOKEN`, mot de passe / URL de base Preview, ni `VERCEL_TOKEN` dans l'environnement ; CLI `supabase` et `vercel` absentes. Aucun secret n'a été recherché ailleurs ni inventé |
| Aucun mécanisme CI de déploiement | `.github/workflows/` (`ci`, `studio-*`) ne contient aucun job de migration Preview ni de déploiement Vercel : pas de chemin « prévu » alternatif |

Aucune hypothèse n'a été prise sur l'état hébergé : **rien n'a été appliqué**. Ce n'est pas un PARTIAL : aucun élément hébergé n'est qualifié.

## 1. SHA canonique et contenu (phase A)

| Contrôle | Résultat |
|---|---|
| `6392131a` présent sur origin | ✅ via `claude/compassionate-ptolemy-vu8vbx` (même SHA) |
| `integration/elsatia-canonical-train-v9-final` sur origin avant mission | absente → **publiée** : `git push origin 6392131…:refs/heads/integration/elsatia-canonical-train-v9-final` ; `ls-remote` = `6392131aa02cecc9991358915963068de8292d24`. Aucun force-push |
| Rapport `ELSATIA_CANONICAL_TRAIN_V9_FINAL_CONVERGENCE_V1.md` | présent au SHA, verdict `ELSATIA CANONICAL TRAIN V9 FINAL LOCALLY QUALIFIED` |
| Migrations | **389**, dernière `20261002001113_rate_limit_consultation_connexion_v1.sql` |
| Ascendance | `53b4bc76` (V8), `de50245a` (813 original), `0b862aa4` (Legal 901), `f9748802` (Security 1001), `2de34959` (Stripe 1002-1003), `b50979d4` : **tous ancêtres**. `23153716` : **non ancêtre** |
| Préfixe 372 | `git ls-tree` des 372 migrations de `de50245a` **identique blob pour blob** aux 372 premières de `6392131a` ; `git diff --name-status de50245a 6392131a -- supabase/migrations` : **17 ajouts, 0 modification, 0 suppression** |
| 813 | blob `d698cfda`, sha256 `c95e3ef3…` = **ORIGINAL**. La reconstruction `23153716` porte un 813 différent (blob `0393cb11`, sha256 `194d1d33…`) |

### Gates offline rejouées sur le SHA canonique (dans ce conteneur)

| Gate | Résultat |
|---|---|
| `verify:migrations` | 389 valides ; cibles : partagé 389, Studio dédié 23 |
| `verify:train-expectations` | 389 / `20261002001113` / DB verify 38 contrôles — attendus à jour |
| `verify:env-manifest` | 0 erreur ; 14 DECISION_REQUIRED en attente (non bloquantes, préexistantes) ; 12 constats ouverts (P0:1 P1:10 P2:1, cf. `ELSATIA_ENV_MANIFEST_AND_CI_V1.md`) |
| `test:env-manifest` | 67/67 |
| `test:migration-targets` | 7/7 |
| `test:preflight-preview` | 5/5 |
| `test:preview-pack` | 31/31 |
| `verify:secrets` | 3 622 fichiers, aucun secret |
| `verify:stripe-prices` | SKIP (aucun accès Stripe) |

### Branches à classer OBSOLETE / DO_NOT_DEPLOY (non supprimées)

| Branche | SHA | Raison |
|---|---|---|
| `integration/elsatia-canonical-train-v8-hotfix-813` | `23153716` | 813 reconstruit **différent** de l'original (sha256 `194d1d…` ≠ `c95e3e…`). **DO_NOT_DEPLOY** |
| `integration/elsatia-canonical-train-v9` | `a8c327cf` | 395 migrations (inclut Relevé 10-11 et RGPD `…1201-1203`, non retenus), ≠ SHA canonique. **DO_NOT_DEPLOY** |
| `claude/pensive-bohr-7oxgd8` | `a8c327cf` | même commit : train V9 concurrent non qualifié. **DO_NOT_DEPLOY** |
| train V9 `b50979d4` | — | renuméroté depuis ; ses numéros `2026092800081x` / `2026093000…` imposeraient `--include-all`. **DO_NOT_DEPLOY** (source historique seulement) |

Seule source déployable pour V9 : `integration/elsatia-canonical-train-v9-final` @ `6392131a`.

## 2. Garde Production

Aucune commande Supabase ou Vercel n'a été exécutée. Les seules requêtes réseau tentées sont des `curl` en lecture (health) vers des hôtes **Preview** (`pgvvpqyjziyapbbkydmc`, `elsatia-preview-*`) et vers les racines des API Supabase/Vercel, toutes refusées par le proxy. Aucune requête n'a ciblé `exhvuzegsefmoguxoiak`.

## 3. État Preview avant (phase B)

**NON RELEVÉ** — ni `PREVIEW_LEDGER_PREFIX_OK` ni `PREVIEW_LEDGER_DIVERGENCE` ne sont prouvés. L'hypothèse historique 372 / `…813` n'est **pas** utilisée comme preuve.

Côté dépôt, le préfixe attendu (372 versions, 813 original) est figé et vérifié blob pour blob (§1). Requêtes à exécuter dès l'accès (lecture seule, ref vérifié avant) :

```sql
select count(*), max(version) from supabase_migrations.schema_migrations;          -- attendu 372 / 20261002000813
select version, name from supabase_migrations.schema_migrations order by version;  -- comparer à ls supabase/migrations | head -372
select array_to_string(statements, E'\n') from supabase_migrations.schema_migrations
 where version = '20261002000813';                                                 -- comparer au contenu ORIGINAL (sha256 c95e3e…)
```

## 4. Backup (phase C)

NON FAIT (dépend de B).

## 5. Migrations appliquées (phase E)

**AUCUNE.**

## 6. État après

Inchangé (non relevé).

## 7. DB verify V9 sur Preview

NON EXÉCUTÉ. Rappel local (rapport V9 final) : fresh **GO**, 38 contrôles.

## 8. Environnement Vercel (phase D)

Comparaison hébergée impossible (pas d'accès Vercel). Comparaison **statique** du manifeste V9 contre le socle `de50245a` — variables nouvelles introduites par V9 qui concernent la Preview GP :

| Variable | Requise | Fonctionnalité | Sévérité si absente | Déploiement possible |
|---|---|---|---|---|
| `BANK_DATA_ENCRYPTION_KEY` (k1, existante) | oui si IBAN | chiffrement IBAN/BIC ; 1112 enregistre `k1` « active, empreinte à attester » | **BLOCKER_IBAN_KEY** pour le flux IBAN si absente ou non attestée | oui, flux IBAN non exposé |
| `BANK_DATA_ENCRYPTION_KEYS` | dès rotation k2 | trousseau | P2 | oui |
| `BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID` | si trousseau multi-clés | sélection de la clé active | P2 | oui |
| `BANK_DATA_ENCRYPTION_WRITE_FORMAT` | retour arrière seulement | format v1 | — | oui |
| `BANK_OAUTH_STATE_HMAC_KEY` | recommandé si paiements bancaires | state OAuth bancaire (sinon repli historique) | P2 | oui |
| `ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE`, `LEGAL_TVA_REGIME_CONFIRME` | **Live uniquement** | ouverture Stripe Live | doivent rester **absents / false** en Preview | oui |
| `PDF_CONCURRENCE`, `PDF_FILE_MAX`, `PDF_ATTENTE_MAX_MS`, `PDF_DUREE_MAX_MS`, `PDF_DELAI_FERMETURE_MS` | non (défauts) | capacité PDF | P3 | oui |

Existantes à vérifier (non vérifiables ici), statut `UNVERIFIED_REMOTE` : `STRIPE_WEBHOOK_SECRET` (endpoint Test `we_1Tziay0bT5C0WG2a4Ib2ncwB`), `CRON_SECRET`, `BREVO_API_KEY`, `STRIPE_SECRET_KEY` (**doit commencer par `sk_test_`**).

Prérequis d'ordre : la migration `20261002001113` (limiteur de connexion) **doit** être appliquée avant le déploiement du code V9 — garanti si la séquence E → F est respectée.

## 9. Routes

Non vérifiées (hôte Preview refusé par le proxy).

## 10. Tests navigateur / API

Non exécutés en hébergé. Rappel local : Playwright 85/85, recette pilote backend 69 PASS / 1 FAIL (PE-04) / 1 MANUAL.

## 11. Compte pilote

`pilote.karim.haddad@example.test` (PILOTE-BTP-V1, SARL Bati-Rhone Construction) : non utilisé ; aucun mot de passe demandé ni recherché. Le compte propriétaire plateforme n'a pas été utilisé.

## 12. Sécurité

Qualifiée **localement uniquement** (rapport V9 final : RLS, grants, 0 `anon`, Legal 45/45, Security 16/16, 813 14/14, Stripe 23/23). Rien d'hébergé.

## 13. Stripe Test

Aucune action. Aucun Live.

## 14. E-mail / cron

Non vérifiés.

## 15. Blockers et décisions

| ID | Sévérité | Effet |
|---|---|---|
| `BLOCKER_NETWORK_EGRESS` | P0 exécution | bloque B à G |
| `BLOCKER_REMOTE_CREDENTIALS` | P0 exécution | bloque B à G |
| `BLOCKER_IBAN_KEY` | conditionnel | à statuer après lecture de l'environnement Vercel (attestation de l'empreinte k1) |
| `DECISION_REQUIRED:OBSOLETE-BRANCH-CLEANUP` | P2 | suppression éventuelle des branches du §1 : laissée au propriétaire |
| 14 DECISION_REQUIRED du manifeste | préexistantes | non bloquantes pour la Preview |

## 16. Actions manuelles pour débloquer (dans l'ordre)

1. Environnement cloud → Network access : autoriser `api.supabase.com`, `pgvvpqyjziyapbbkydmc.supabase.co` (et le pooler eu-west-3 si connexion directe), `api.vercel.com`, `*.vercel.app` (https://code.claude.com/docs/en/cloud-environments#network-access).
2. Secrets d'environnement : `SUPABASE_ACCESS_TOKEN` (ou mot de passe de la base **Preview** uniquement) et `VERCEL_TOKEN` limité au projet `elsatia-preview`.
3. Relancer la mission depuis la phase B :
   - `git checkout integration/elsatia-canonical-train-v9-final` ;
   - `supabase link --project-ref pgvvpqyjziyapbbkydmc` (imprimer et vérifier le ref) ;
   - lecture du ledger (§3) ;
   - backup : `supabase db dump` (schéma), `--data-only`, `--role-only`, export des métadonnées et objets Storage, horodatage ;
   - `supabase db push --dry-run` : attendu **17** migrations en attente, **sans `--include-all`** ;
   - `supabase db push`, puis DB verify (38 contrôles) → GO ;
   - déploiement Vercel Preview au SHA `6392131a`, puis recette (§9-14).

## 17. Confirmation

**`PRODUCTION_UNTOUCHED`** — aucune commande, requête ou configuration n'a ciblé `exhvuzegsefmoguxoiak`. La Preview n'a pas non plus été modifiée. Aucun Stripe Live, aucun force-push, aucune suppression de branche, historique des migrations intact, `main` non promue.

**Verdict : `V9_GP_PREVIEW_BLOCKED`**
