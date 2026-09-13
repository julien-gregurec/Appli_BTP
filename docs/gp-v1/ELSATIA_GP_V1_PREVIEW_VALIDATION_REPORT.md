# ELSATIA Gestion Pro — Preview Devis V2 / Planning V2 — rapport de validation

Objectif : mettre à disposition de Julien une version PREVIEW réellement testable (Devis V2 + Planning V2
actifs, migrations 282→289 appliquées sur la base de preview seulement, données de test contrôlées), puis
vérifier visuellement l'accès aux nouvelles versions. **Aucune action sur la Production.**

## 1. État de départ (vérifié le 2026-09-13)

| Élément | Constat |
|---|---|
| Branche | `feat/gp-v1-metier-devis-planning-references-v1` |
| HEAD | `00145af` (badge preview) sur `3d314bd` (lot 0) ; distant synchronisé, arbre propre |
| Migrations | ledger local 286 fichiers, dont `20260912000282` → `20260912000289` (GP V1) ; `verify:migrations` OK |
| Drapeaux | `GP_DEVIS_V2` / `GP_PLANNING_V2` lus par `devisV2Actif()` / `planningV2Actif()` (`=== "1"`) ; documentés à 0 dans `.env.example` |
| Vercel (équipe `julien-gregurec1`) | projets `elsatia-production` (app.elsatia.fr, Production Branch `release/commercialisation-v1`), **`elsatia-preview`** (`elsatia-preview.vercel.app`, environnement Preview complet : Supabase, Stripe test, drapeaux `FEATURE_*`), `elsatia-site`, `elsatia-colors`, `elsatia-tools`, `liria-concept-gestion-btp` (ancien) |
| Supabase (org `grbjohkkuhexoanqgogu`) | `elsatia-production` (`exhvuzegsefmoguxoiak`, ACTIVE_HEALTHY, **non touché**) ; **`elsatia-preview` (`pgvvpqyjziyapbbkydmc`) : INACTIVE (projet en pause)** → `elsatia-preview.vercel.app/login` répond 500 |
| Méthode de déploiement | Vercel CLI 59 (`npx vercel`), authentifiée `julien-gregurec` ; le worktree est lié (`vercel link`, `.vercel/` ignoré par git) au projet `elsatia-preview` |
| Outillage | Supabase CLI 2.109.1 fonctionnelle (liste des projets OK) mais sans sous-commande de restauration ; `psql`/`pg_dump` via les conteneurs Docker locaux si une URL de connexion est fournie |

## 2. Ce qui a été fait sans la base preview

1. **Drapeaux posés sur l'environnement Preview Vercel uniquement** : `GP_DEVIS_V2=1`, `GP_PLANNING_V2=1`
   (`vercel env add … preview`). Production intacte (aucune variable ajoutée hors Preview).
2. **Indicateur de version** : `src/components/BadgePreview.tsx`, monté dans le layout applicatif, rendu
   seulement si `NEXT_PUBLIC_GP_PREVIEW_BADGE=1` (posé sur Preview uniquement). Il affiche l'état **runtime**
   des deux drapeaux tels que le serveur les lit (« GP V1 PREVIEW · Devis V2 actif · Planning V2 actif ») :
   c'est la preuve demandée au § 4 du cahier. À retirer de l'environnement avant toute promotion.
3. **Déploiement Preview Vercel** de la branche sur `elsatia-preview` (voir § 3 pour l'URL et le résultat).

## 3. Déploiement Preview

| Élément | Valeur |
|---|---|
| Projet Vercel | `elsatia-preview` (lié aussi à GitHub `julien-gregurec/Appli_BTP` : chaque push de la branche déclenche un build Preview) |
| Déploiement | `dpl_6DJekWb9hGppxuk6AbNTo1aQCfzQ`, commit `9b0f…` (vercel.json) sur `00145af` — **Ready** |
| URL | https://elsatia-preview-lmpv4loji-julien-gregurec1.vercel.app (Preview ; l'alias `elsatia-preview.vercel.app` suit le dernier déploiement de la branche Production du projet preview, à confirmer) |
| Variables Preview posées | `GP_DEVIS_V2=1`, `GP_PLANNING_V2=1`, `NEXT_PUBLIC_GP_PREVIEW_BADGE=1` (Preview seulement) |
| Première tentative | échec : le script racine `build` enchaîne `apps/tools`, dont les dépendances ne sont pas installées sur Vercel (`Module not found @capacitor/app`, `jspdf`) — corrigé par `vercel.json` → `buildCommand: next build` (l'application seule ; `apps/tools` a son propre projet Vercel). Commit dédié, documenté. |
| État constaté | `/login` répond 200 ; **toute page authentifiée dépend de la base Supabase preview, encore en pause** → la validation fonctionnelle attend le § 4 |

## 4. Points qui nécessitent Julien

1. **Réactiver le projet Supabase `elsatia-preview`** (dashboard Supabase → projet `elsatia-preview` →
   « Restore project »). Réversible (re-pause possible), aucune donnée touchée. Ni la CLI ni l'agent ne
   peuvent le faire (la lecture du jeton d'accès du trousseau a été refusée par la politique de sécurité de
   la session).
2. **Accès à la base preview pour appliquer les migrations** : soit le mot de passe de la base du projet
   preview (Dashboard → Settings → Database → « Reset database password » si perdu ; il n'est utilisé nulle
   part ailleurs), à fournir dans l'environnement du poste sous `SUPABASE_DB_PASSWORD` ; soit lancer
   soi-même, une fois le projet réactivé :

   ```bash
   cd /Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/gp-v1-metier && node_modules/.bin/supabase link --project-ref pgvvpqyjziyapbbkydmc
   ```
   ```bash
   cd /Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/gp-v1-metier && node_modules/.bin/supabase migration list --linked
   ```
   ```bash
   cd /Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/gp-v1-metier && node_modules/.bin/supabase db push --linked
   ```
   `db push` applique **toutes** les migrations manquantes de la preview (si elle est en retard sur 280, les
   intermédiaires sont indispensables à cette branche), puis 282→289. La Production n'est jamais liée.

## 5. Reprise après le message « projet restauré » (2026-09-13, 00:30 → 01:10)

**Constat.** L'API Supabase (`supabase projects list`) renvoie toujours `elsatia-preview … INACTIVE` et le
point de santé `https://pgvvpqyjziyapbbkydmc.supabase.co/auth/v1/health` ne répond pas (code 000), relevés
toutes les 40 s pendant 40 minutes (dernier relevé 01:09:12). `supabase link --project-ref pgvvpqyjziyapbbkydmc`
répond « project is paused ». La restauration n'est donc pas effective côté Supabase, ou n'a pas été lancée
sur ce projet. Rien n'a été fait sur Production (`exhvuzegsefmoguxoiak`, jamais lié, jamais interrogé).

**Fait pendant l'attente, sans la base.**
- Jeu de données de recette `docs/gp-v1/preview/seed-recette-gp-v1.sql` (commit `9d7dc99`, poussé) :
  entreprise « ELSATIA Recette V2 » sur l'offre **Pro**, compte Dirigeant `dirigeant.recette@elsatia-preview.invalid`
  avec tous les droits sauf `mode_compte_depot` (107 clés), compte Conducteur sans coûts, 8 salariés, 4 clients,
  4 chantiers, 5 familles, 12 articles (références internes, fabricants, coûts d'achat et coefficients sur 10),
  1 équipe, 3 ressources, 10 évènements sur la semaine courante avec 15 affectations. Le mot de passe est passé
  par variable psql (`-v mdp=…`), jamais dans le fichier. Rejouable (`on conflict do nothing`).
  Prouvé sur une copie locale du ledger 289 (`gpv1_seedtest`, créée puis détruite) : COMMIT, rejeu sans erreur.
- Runbook `preview-db.sh` (scratchpad) avec garde-fou : refuse tout projet lié autre que `pgvvpqyjziyapbbkydmc`.
  Étapes prévues dans l'ordre demandé : `link` → `ledger` (`migration list --linked`) → `backup`
  (`db dump` schéma + données + rôles, horodatés) → `dryrun` → `push` (seules les migrations absentes de
  l'historique distant, donc 282→289 si la preview est au 280) → `seed` → `verify`.

**Ce qu'il manque pour continuer (Julien).**
1. Le projet doit être réellement ACTIVE : Dashboard → https://supabase.com/dashboard/project/pgvvpqyjziyapbbkydmc →
   « Restore project » (ou vérifier qu'une restauration est en cours ; elle peut prendre plusieurs minutes).
2. Le **mot de passe de la base preview** (Settings → Database → « Reset database password » si inconnu) :
   `link`, `migration list`, `db dump` et `db push` en ont besoin. Seule `db query` (Management API) s'en passe.
   Ce mot de passe concerne la preview uniquement ; il ne sera ni commité ni écrit dans un rapport.

## 6. Base preview active — ledger, sauvegarde, répétition générale (2026-09-13, 03:00 → 04:10)

**Projet.** `elsatia-preview` (`pgvvpqyjziyapbbkydmc`) `ACTIVE_HEALTHY` à 03:05 ; CLI liée (`supabase link`,
sans mot de passe : la CLI utilise son rôle de connexion via l'API de gestion, `db push --dry-run` s'est connecté).
Production (`exhvuzegsefmoguxoiak`) : jamais liée, jamais interrogée.

**Ledger preview.** 242 versions appliquées, min `20260710000001`, max `20260901000251`. Le ledger local
(286 fichiers) contient **44 versions absentes de la preview**, aucune version preview absente en local
(pas de collision inverse) :
- 7 sous le maximum distant (à pousser avec `--include-all`) : `20260815000200` (réconciliation pré-tarifs v2),
  `20260825000232` (préflight signature, documenté no-op sur preview), `20260830000236`…`20260901000240`
  (Tools R8→R10 + réconciliation AAL2) ; aucun objet commun avec 241→251 déjà en place ;
- 29 du train (`252`→`280`) ; 8 GP V1 (`282`→`289`).
Données existantes : 10 entreprises, 26 comptes, 152 devis, 106 factures, 0 évènement planning.

**Sauvegarde logique (avant toute écriture).** `supabase db dump --linked` ×3, horodatées `20260913-031435`
dans le scratchpad de session : schéma 1,2 Mo, données (201 blocs COPY, `auth` inclus), rôles. Aucune
sauvegarde physique n'existe côté Supabase pour ce projet (`backups list` : vide, PITR désactivé).

**Répétition générale sur la sauvegarde réelle.** Sauvegarde restaurée dans un Postgres jetable
(`public.ecr.aws/supabase/postgres:17.6.1.143`), puis les 44 migrations dans l'ordre exact de `db push`.
Deux dérives propres à la preview bloquent :
1. `plateforme_admins.utilisateur_id` porte un **NOT NULL posé hors migration** (l'en-tête de la 235 le
   signale : « déjà présent, hors migration, jamais commité, sur Preview »). Le ledger le déclare nullable et la
   contrainte `statut_coherent_check` (236) exige NULL pour `en_attente`. La 266 insère
   `julien@elsatia.fr … utilisateur_id null on conflict (email) do nothing` : PostgreSQL vérifie NOT NULL
   avant l'arbitrage ON CONFLICT → **échec certain de la 266 sur la preview** (reproduit deux fois).
2. **4 postes orphelins** « Compte dépôt » (entreprises `d1…0099`, `fb…0099`, `fb…0097`, `1e…0099` absentes
   malgré la FK ON DELETE CASCADE ; 0 utilisateur, 0 employé, 0 permission) : la 282 pose deux permissions
   sur chaque poste → violation FK → **échec certain de la 282**.
   La preview compte d'autres orphelins (`categories_notes_frais` 44, `compteurs_reference` 30,
   `types_chantier` 20…) qui ne gênent aucune des 44 migrations (répétition passée).
Avec ces deux corrections (`docs/gp-v1/preview/preview-derive-avant-migrations.sql`, 2 ordres SQL,
preview uniquement) : **44/44 migrations appliquées**, devis 152 / factures 106 / lignes 437 inchangés,
8 fonctions v2 présentes, propriétaire plateforme désigné. Les pgTAP GP V1 ne sont pas exploitables sur cette
copie (fixtures Storage : buckets non restaurés dans le conteneur nu) ; leur preuve reste celle du Fresh
(§ 19 du rapport métier, 2 273/0).

**Surface de sécurité preview, relevé AVANT** (à comparer après push) : privilèges DDL des rôles applicatifs
0 ; fonctions SECURITY DEFINER exécutables par `anon` 1 (partage public documenté) ; sans `search_path` 0.

**Point d'arrêt.** L'exécution des deux ordres de dérive sur la preview a été refusée deux fois par le
classificateur de permissions de l'outil (écriture de schéma + suppression sur une base distante).
Rien n'a été écrit sur la preview. Reprise possible dès que Julien exécute ce fichier dans l'éditeur SQL
du projet preview, ou autorise l'action.
