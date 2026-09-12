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
