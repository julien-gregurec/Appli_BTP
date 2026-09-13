# Runbook — mise en Production GP V1 (préparé, NON exécuté)

Version 2026-09-13 (session autonome). Issu de la recette preview
(`ELSATIA_GP_V1_PREVIEW_VALIDATION_REPORT.md`, § 6, 7, 17, 18, 21). **Rien de ce runbook n'a été joué sur
Production** ; il décrit ce qui a été fait sur la preview et ce qui doit l'être en Production, dans l'ordre,
avec le rôle réellement utilisé et les conditions d'arrêt.

Périmètre : ledger `20260710000001` → `20260913000291` (288 fichiers), branche
`feat/gp-v1-metier-devis-planning-references-v1`, projet Supabase Production `exhvuzegsefmoguxoiak`, projet
Vercel `elsatia-production` (branche de production `release/commercialisation-v1`).

## 1. Préchecks

1. Julien a validé visuellement Devis V2, Planning V2, le copier/coller et l'accès recette sur la preview ; il
   a autorisé explicitement la mise en Production (aucune étape ci-dessous ne se joue sans cet accord).
2. Branche fusionnée dans `release/commercialisation-v1` **sans force** ; HEAD local = distant ;
   `npm run verify:migrations` (288 valides), `npm run verify:secrets`, `git diff --check` verts ;
   `npx tsc --noEmit`, `npm run lint`, vitest complet, pgTAP complet (2 284 ok sur le Fresh) verts.
3. Rôle qui migre : `supabase link --project-ref exhvuzegsefmoguxoiak` puis `db push --linked` — la CLI se
   connecte via l'API de gestion avec le rôle temporaire `cli_login_postgres` (membre de `postgres`, objets
   créés par `postgres`). Son `search_path` ne contient pas `extensions` : c'est pourquoi la 276 a été
   qualifiée (`gin_trgm_ops` résolu par le schéma réel de `pg_trgm`), prouvée sur Fresh et sur un rôle sans
   `extensions`. **Le rôle `postgres` n'est plus nécessaire.** Vérifier `supabase/.temp/project-ref` avant
   toute écriture.
4. Fenêtre : hors heures ouvrées des clients ; responsable nommé ; canal de communication ouvert.

## 2. Sauvegarde

- Aucune sauvegarde physique n'existe sur les projets sans PITR (constaté sur la preview) : faire une
  **sauvegarde logique datée** avant toute écriture — `db dump --linked -f schema.sql`,
  `--data-only --use-copy -f data.sql`, `--role-only -f roles.sql` — et la conserver hors du dépôt.
- Relever les volumes de référence : `devis`, `factures`, `lignes_devis`, `planning_evenements`,
  `entreprises`, `auth.users`.

## 3. Comparaison des ledgers

- `supabase migration list --linked` ; Production attendue au `20260810000210` (dernier état connu).
- Versions en attente = fichiers locaux ∖ ledger distant ; `db push --linked --dry-run --include-all`
  doit lister exactement ces versions (les numéros inférieurs au maximum distant — 200, 232, 236→240 —
  exigent `--include-all`). Aucune version distante absente en local (sinon STOP : ledger inconnu).

## 4. Répétition générale (obligatoire, sur clone jetable)

1. Restaurer la sauvegarde logique dans un Postgres jetable (`public.ecr.aws/supabase/postgres:17.6.1.143`,
   harnais `ELSATIA-STACKS/train-v3-dbtest`), y compris `auth.users` (extraire le bloc COPY, insérer
   id / email) — script de référence : `replay-preview4.sh` de la session (à recopier dans le harnais).
2. Appliquer les versions en attente dans l'ordre de `db push`. Le résultat attendu, prouvé le
   2026-09-13 depuis 210, 280 et la sauvegarde preview : schéma **identique** au Fresh (pg_dump, hors jeton
   `\restrict`), volumes inchangés.
3. **Dérives à chercher** (constatées sur la preview, hors ledger) : `plateforme_admins.utilisateur_id`
   posé `NOT NULL` à la main (fait échouer la 266 : NOT NULL vérifié avant ON CONFLICT) ; postes
   orphelins (font échouer la 282) ; contrainte `plateforme_admins_actif_requiert_utilisateur_id` absente.
   Toute correction manuelle de schéma ou de données doit être autorisée explicitement et consignée.
4. pgTAP sur le clone migré (au minimum : suites `gp_*`, `isolation_multitenant_*`).

## 5. Migration

1. `db push --linked --include-all --yes`, rôle CLI (voir § 1.3). Chaque migration est une transaction :
   un arrêt laisse les précédentes appliquées ; corriger la cause puis relancer (reprise aux manquantes).
2. Contrôles immédiats : `count(*)` et `max(version)` de `supabase_migrations.schema_migrations` = 288 /
   `20260913000291` ; surface de sécurité — privilèges DDL des rôles applicatifs 0, SECURITY DEFINER
   exécutables par `anon` = exactement `document_commercial_par_token`, `document_rendu_par_token`,
   `reserves_invitation_consulter`, sans `search_path` 0 ; volumes inchangés ; `conflits_planning` en
   SECURITY DEFINER (290) ; déclencheurs `lignes_devis_source_meme_entreprise` et
   `devis_ouvrages_ouvrage_meme_entreprise` présents (291).

## 6. Drapeaux et déploiement applicatif

- Déployer l'application **après** la migration (l'éditeur v2 a besoin du schéma v2).
- Variables Production (Vercel) : `GP_DEVIS_V2=1`, `GP_PLANNING_V2=1`. **Jamais** `NEXT_PUBLIC_GP_PREVIEW_BADGE`
  ni `NEXT_PUBLIC_GP_DEMO_EMAIL` en Production ; le code les refuse de toute façon (`badge-preview.ts` :
  `VERCEL_ENV=production` ou adresse `app.elsatia.fr`).
- PDF : le lanceur Chromium pose l'indice AL2023 si Vercel n'expose pas `VERCEL=1` (`generer.ts`) ; PDF
  confirmé fonctionnel en Production par Julien avant ce lot, et sur la preview après correctif.

## 7. Smoke tests (compte réel, sans écriture métier)

Connexion, tableau de bord, `/devis` (liste), un devis existant en lecture, `/planning`, `/prestations`,
`/ouvrages/bibliotheque` (offre ≥ Pro), Télécharger PDF d'un devis existant.

## 8. Contrôles devis

Nouveau devis brouillon de test : ouvrage inséré, article Ctrl+K, ligne libre, titre, commentaire, remise,
sous-total ; copier/coller de la section dans le même devis (nouvelles clés) ; enregistrement ; lecture ;
aperçu A4 ; PDF ; suppression du devis de test.

## 9. Contrôles planning

Vue semaine par salarié, création d'un évènement, déplacement clavier (+15 min), conflit détecté, règle 24 h
refusée dans le dialogue avec son message, suppression de l'évènement de test.

## 10. PDF

Devis existant (moteur historique) et devis v2 (moteur 2, multi-pages) : 200, `application/pdf`, pages
cohérentes avec l'aperçu.

## 11. Conditions d'arrêt et retour arrière

- STOP avant migration si : ledger distant ≠ 210 attendu, versions distantes absentes en local, répétition
  générale rouge, sauvegarde absente.
- STOP pendant : une migration échoue → ne pas forcer ; analyser ; la cause connue (dérive) est corrigée
  avec accord explicite, sinon retour arrière.
- Retour arrière = restauration de la sauvegarde logique (schéma + données + rôles) dans le projet
  Production après arrêt de l'application ; les migrations ne prévoient pas de `down`. Les drapeaux
  applicatifs restent à 0 tant que la base n'est pas au 291.

## 12. Surveillance post-déploiement (48 h)

- Journaux Vercel : `[pdf]` (échecs Chromium), erreurs 5xx sur `/api/documents/**`, `/devis/**`, `/planning`.
- Supabase : temps de réponse de `contexte_abonnement_courant`, `conflits_planning`,
  `enregistrer_devis_brouillon_v2` ; verrous de révision (« modifié ailleurs ») ; erreurs 23514 des
  déclencheurs 291 (référence étrangère = tentative anormale).
- Métier : premiers devis v2 enregistrés, premiers PDF, planning semaine ; retours clients sur le
  copier/coller.
- Backlog plateforme connu (hors GP V1) : coût ligne à ligne des politiques RLS (`est_membre_actif`,
  ≈ 1,8 ms/ligne) — planning 400 évènements ≈ 3-6 s de rendu serveur.
