# Runbook — migrations GP V1 vers Production (préparation, non exécuté)

Version 2026-09-13. Issu de la recette preview (`ELSATIA_GP_V1_PREVIEW_VALIDATION_REPORT.md`, § 6, 7, 17).
**Rien de ce runbook n'a été joué sur Production.** Il décrit exactement ce qui a été fait sur la preview
et ce qui doit l'être en Production, avec le rôle réellement utilisé.

## 0. Rôle qui migre

`supabase db push --linked` (CLI 2.109) se connecte **sans mot de passe** via l'API de gestion avec un
rôle temporaire `cli_login_postgres`, membre de `postgres` (les objets créés appartiennent à `postgres`).
Ce rôle **n'a pas `extensions` dans son `search_path`** (`"$user", public`), contrairement à `postgres`
(`"$user", public, extensions`). Conséquence historique : la migration `20260908000276` échouait sur
`gin_trgm_ops` (classe d'opérateurs de `pg_trgm`, installé dans `extensions` sur Supabase).

**Corrigé dans le ledger** : la 276 résout désormais le schéma réel de `pg_trgm` (`pg_extension`) et
qualifie `gin_trgm_ops` explicitement (bloc `do $$ … execute format(… %I.gin_trgm_ops) …`). Preuve :
Fresh complet 1→290 sur Postgres nu, et cas Supabase simulé (pg_trgm dans `extensions`, 276 jouée par un
rôle sans `extensions` dans son `search_path`). **Le rôle `postgres` n'est donc plus nécessaire** ; `db push`
avec la CLI suffit. Si une autre migration échouait pour la même raison, la procédure de secours est :
`supabase db query --linked -f <fichier>` (exécuté par `postgres`, une transaction) puis
`supabase migration repair --linked --status applied <version>`.

## 1. Avant de migrer

1. `supabase link --project-ref exhvuzegsefmoguxoiak` (Production) — vérifier `supabase/.temp/project-ref`.
2. `supabase migration list --linked` : relever le ledger réel (Production attendue au 210 ; la preview
   était au 251 avec des trous : 200, 232, 236→240).
3. Calculer les versions en attente (fichiers locaux ∖ ledger distant) : `db push --dry-run --include-all`.
4. **Sauvegarde logique** : `db dump --linked -f schema.sql`, `--data-only --use-copy -f data.sql`,
   `--role-only -f roles.sql` (aucune sauvegarde physique n'existe sur les projets sans PITR).
5. **Répétition générale** : restaurer la sauvegarde dans un Postgres jetable
   (`public.ecr.aws/supabase/postgres:17.6.1.143`, harnais `ELSATIA-STACKS/train-v3-dbtest`), y compris
   `auth.users` (extraire le bloc COPY, insérer id/email), puis appliquer les versions en attente dans
   l'ordre de `db push`. Script de référence : `replay-preview4.sh` (scratchpad de la session, à
   recopier dans `ELSATIA-STACKS`).
6. **Dérives à chercher** (constatées sur la preview, à vérifier sur Production) :
   - `plateforme_admins.utilisateur_id` posé `NOT NULL` hors migration → la 266 échoue (NOT NULL vérifié
     avant ON CONFLICT) ; correction : `alter column utilisateur_id drop not null` (le ledger le déclare
     nullable) ;
   - postes orphelins (entreprise absente) → la 282 échoue ; correction : suppression des orphelins sans
     dépendance (utilisateurs, employés, permissions).
   Toute correction manuelle doit être autorisée explicitement par Julien et consignée.

## 2. Migrer

1. `db push --linked --include-all --yes` (les 7 versions sous le maximum distant exigent `--include-all`).
2. Si arrêt : la migration en cours est annulée (transaction), les précédentes restent appliquées ;
   corriger la cause, relancer (`db push` reprend aux versions manquantes).
3. Contrôles : `select count(*), max(version) from supabase_migrations.schema_migrations` = nombre de
   fichiers locaux ; surface de sécurité avant/après (privilèges DDL des rôles applicatifs = 0, SECURITY
   DEFINER exécutables par `anon` = la liste blanche du test `isolation_multitenant_surface`, sans
   `search_path` = 0) ; volumes (`devis`, `factures`, `lignes_devis`, `auth.users`) inchangés.

## 3. Après

- Drapeaux `GP_DEVIS_V2=1`, `GP_PLANNING_V2=1` sur l'environnement Production de Vercel au moment du
  déploiement applicatif (et pas avant : sans schéma v2 l'éditeur v2 n'a pas ses tables).
- `NEXT_PUBLIC_GP_PREVIEW_BADGE` **ne doit jamais** être posé en Production ; le code le refuse de toute
  façon (`badge-preview.ts` : `VERCEL_ENV=production` ou adresse `app.elsatia.fr`).
- PDF : le lanceur Chromium pose l'indice AL2023 si Vercel n'expose pas `VERCEL=1` (`generer.ts`).
- Backlog plateforme (hors GP V1) : coût ligne à ligne des politiques RLS (`est_membre_actif`, ≈ 1,8 ms/ligne).
