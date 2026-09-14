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

## 7. Migrations appliquées, seed chargé, environnement de recette (2026-09-13, 08:10 → 08:45)

| Élément | Valeur |
| --- | --- |
| Environnement | Vercel Preview du projet `elsatia-preview` (branche `feat/gp-v1-metier-devis-planning-references-v1`) + Supabase `elsatia-preview` (`pgvvpqyjziyapbbkydmc`) |
| URL de preview (alias stable de la branche) | https://elsatia-preview-git-feat-gp-v1-metier-d-467e36-julien-gregurec1.vercel.app |
| HEAD au moment de la recette | `8309d04` (devis) → `75da3be` (aperçu) → `d33b103` (dernier build) ; voir § 14 |
| Migrations preview | ledger **286 = 286 fichiers locaux**, dernière `20260912000289` ; 0 écart dans les deux sens. Deux corrections de dérive autorisées par Julien avant le push (§ 6 ; nullable confirmé, exactement 4 postes orphelins supprimés, 76 postes restants, 3 admins intacts). Push en trois temps : 31 migrations, puis la 276 seule (voir ci-dessous), puis 12. |
| Production | `exhvuzegsefmoguxoiak` : jamais liée, jamais interrogée, aucune migration |
| Drapeaux (Vercel, environnement Preview uniquement) | `GP_DEVIS_V2=1`, `GP_PLANNING_V2=1`, `NEXT_PUBLIC_GP_PREVIEW_BADGE=1` ; badge rendu en bas à gauche : « GP V1 PREVIEW · Devis V2 actif · Planning V2 actif » (`data-devis-v2="1"`, `data-planning-v2="1"`) |
| Compte de recette | `dirigeant.recette@elsatia-preview.invalid` (poste Dirigeant, 107 droits = tous sauf `mode_compte_depot`) ; second compte `conducteur.recette@elsatia-preview.invalid` (poste Conducteur, sans `voir_couts_devis`). Entreprise « ELSATIA Recette V2 », offre **Pro**, statut actif. Mot de passe transmis à Julien hors dépôt. |
| Seed | `docs/gp-v1/preview/seed-recette-gp-v1.sql` : 8 salariés, 4 clients, 4 chantiers, 5 familles, 12 articles (10 avec coût d'achat + coefficient), 2 ouvrages (cloison vitrée, cloison 72/48) avec coûts par composant, 1 équipe, 3 ressources, 10 évènements / 15 affectations. Perf : +32 salariés « Perf » et 400 évènements sur la semaine du 21/09 ; deux brouillons de 100 et 500 lignes. |
| Surface de sécurité (avant → après) | privilèges DDL des rôles applicatifs 0 → 0 ; SECURITY DEFINER exécutables par `anon` 1 → 3 (`document_commercial_par_token`, `document_rendu_par_token`, `reserves_invitation_consulter` = exactement la liste blanche du test `isolation_multitenant_surface`) ; sans `search_path` 0 → 0. |
| Données existantes | 10 entreprises, 26 comptes, 152 devis, 106 factures, 437 lignes : inchangés après les 44 migrations. |

**Incident de push (276).** `db push` s'est arrêté sur `20260908000276_platform_client_directory_index_v1` :
`operator class "gin_trgm_ops" does not exist`. Sur Supabase, `pg_trgm` vit dans le schéma `extensions` ; le
rôle de connexion temporaire de la CLI (`cli_login_postgres`) n'a pas `extensions` dans son `search_path`
(le rôle `postgres`, lui, l'a). La migration écrit `gin_trgm_ops` sans schéma. Résolution sans toucher au
fichier ni à la configuration de la base : la 276 a été exécutée inchangée via l'API de gestion (rôle
`postgres`, une transaction), ses 3 index et sa fonction vérifiés, puis inscrite au ledger par l'outil
officiel `supabase migration repair --status applied`. **À retenir pour Production** : le même incident se
produira avec `db push` ; la solution propre est de qualifier `extensions.gin_trgm_ops` dans la 276 (train), ou
de pousser avec le rôle `postgres`.

## 8. Devis V2 — validation visuelle (compte Dirigeant, 1440 × 900)

Recette conduite par script Playwright (Chromium) contre l'URL de preview : chaque action est réelle
(formulaire de connexion, clics, clavier), chaque capture est prise sur la page vivante.

**Devis de recette « DEVIS TEST V2 - VALIDATION VISUELLE »** (client Bureaux Nguyen Conseil, référence
d'affaire = titre ; il n'existe pas de champ « objet » distinct dans l'en-tête v2) :
`/devis/b3896aaa-d58c-46e9-a0f0-96636d596bb7` — 10 lignes : titre, titre « Aménagement bureaux », sous-titre
« Cloisons vitrées », **ouvrage** OUV-0001 Cloison vitrée toute hauteur (12 m², 3 composants, marge affichée
dans le dialogue 956,70 €), **article** ART-0002 Plaque BA13 hydrofuge (24 m² via la palette Ctrl+K), ligne
libre « Reprise de peinture », commentaire, **remise de section 5 %** (−245,40 €), sous-total, séparateur.
Totaux : HT 3 237,60 € puis 3 475,10 € après la modification clavier, marge HT 1 158,70 €, taux de marque 35,8 %.

**Colonnes (Dirigeant)** : `Type · Réf. · Désignation · Réf. fab. · Qté · U. · Achat HT · Coef. · Marge € · PU HT · Rem. % · TVA · Total HT`
(+ Description, Code distributeur, Famille, Fournisseur, Coût MO HT, Taux de marque, Commentaire interne au choix, dialogue
« Colonnes de la grille » — capture 33). **Conducteur** : `Type · Réf. · Désignation · Réf. fab. · Qté · U. · PU HT · Rem. % · TVA · Total HT`,
aucune colonne de coût, aucun bloc « Rentabilité » (capture 50) : le masquage suit les droits.

**Types de lignes** : les 10 types existent (« Insérer… » : Titre, Sous-titre, Commentaire, Sous-total, Remise, Ligne vide,
Séparateur, Saut de page ; boutons « Ligne libre », « Articles Ctrl+K », « Ouvrage »). Types enregistrés en base vérifiés
(`titre`, `sous_titre`, `libre`, `commentaire`, `remise`, `sous_total`, `separateur` ; lignes d'ouvrage `origine_ligne=ouvrage`, article
`origine_ligne=catalogue`). Défaut corrigé : la ligne issue de la palette était typée « Libre » (§ 14).

**Ergonomie** : ajout par bouton, par « + Ligne » et par Entrée en bas de grille ; recherche article Ctrl+K avec quantité au
clavier et Ctrl+Entrée ; Tab passe de Qté à Unité ; « Annuler » / « Rétablir » de la barre fonctionnent (Ctrl+Z est absorbé par
le champ actif : il annule la frappe du navigateur, pas l'étape — comme sur la pile locale) ; glisser-déposer par poignée et
« Espace puis flèches » (E2E 15/15 local, non rejoué ici) ; duplication / suppression / monter / descendre via la barre
latérale et les actions de ligne ; ouvrage repliable avec « Modifier l'ouvrage · Prix global… · Retirer » (capture 35).
**En-tête** : référence d'affaire, référence client, commercial, client, chantier, date, validité, mode et conditions de
règlement, remise globale, conditions, notes client, notes internes, filigrane (capture 36). Aperçu A4 réel à droite
(2 pages), impression `/imprimer/devis/<id>` conforme (capture 38).

**Constat d'ergonomie corrigé** : à 1440 px l'aperçu A4 prend la moitié de la largeur et la grille (14 colonnes) défilait
horizontalement dans 570 px. Bouton « Masquer l'aperçu » ajouté sur grand écran : la grille s'étend à 1 412 px et montre
les 14 colonnes (capture 39).

## 9. Planning V2 — validation visuelle

Semaine du 7 au 13 septembre (données du seed) puis semaine du 21 (perf). Vues **Jour / Semaine / Mois / Par salarié /
Par équipe / Par chantier / Par ressource** toutes rendues (captures 40, 44-*), plus la vue **Compacte** = liste dense
(jour, heures, évènement, type, chantier, salariés, statut, conflits — capture 45). Filtres : type (9 blocs sur 15 pour
« chantier »), chantier (liste des 4), recherche texte. Détail d'un évènement par double-clic (capture 42 : titre, type,
statut, jour, journée entière, début/fin, chantier, client, adresse, couleur, notes, affectations salariés / équipes /
ressources). Barre latérale contextuelle : Nouvel évènement, Modifier, Déplacer (glisser-déposer), Dupliquer (Alt +
glisser), Affecter une équipe, Changer l'horaire (étirer), Imprimer, Ouvrir le chantier / le client, Documents,
Historique, Supprimer (capture 51).

Manipulations prouvées **et relues en base** :
- glisser-déposer souris « Peinture bureaux » jeudi → **vendredi 11, 08:00-17:00**, affectation Emma conservée (captures 47-48) ;
- déplacement clavier flèche droite « Pose cloisons cuisine » → **08:15-12:15**, persistant après rechargement ;
- duplication Alt + glisser « Pose portes » → deux évènements (mercredi 9 et vendredi 11), Farid affecté aux deux (capture 49) ;
- étirement par la poignée en vue Jour « Perf 1-1 » 08:00-12:00 → **08:00-13:00** (capture 63) ;
- création avec **détection de conflit** : « Test conflit recette » vendredi 09:00-10:00 sur Emma → « 2 conflits à vérifier — Déjà affecté à « Peinture bureaux » », bloc marqué « 1 conflit » (capture 54) ;
- création d'un **congé** (type `conge`, Ali Poseur) rendu dans la grille (capture 55).

## 10. Works (bibliothèque d'ouvrages) sur l'offre Pro

Entreprise de recette en offre **Pro** : menu « Ouvrages, modèles et métrés » → « Bibliothèque d'ouvrages composés »
visible, 2 ouvrages listés (OUV-0001, OUV-0002 — capture 11), fiche accessible, insertion dans un devis fonctionnelle.
Aucun `entreprise_feature_flags`, aucun override de recette : la visibilité vient de `feature-catalogue.ts`
(`works` actif pour pro/business/entreprise/sur_mesure, jamais Mini).

## 11. Comparaison Batappli

**Devis**
| Critère | État |
| --- | --- |
| Grille ligne par ligne, toutes colonnes métier (réf. interne, désignation, description, unité, quantité, prix d'achat, coefficient, marge, PV HT, remise, TVA, total HT) | ✅ |
| Colonnes de coût masquées selon les droits | ✅ |
| Types de lignes : article, libre, titre, sous-titre, commentaire, sous-total, remise (%/fixe), vide, séparateur, saut de page | ✅ |
| Recherche article (Ctrl+K), ouvrage composé avec versions, coûts par composant | ✅ |
| Clavier : Tab / Entrée / flèches, annuler / rétablir | ✅ (Ctrl+Z pris par le champ actif ⚠️ mineur) |
| Drag & drop, duplication, suppression, réorganisation | ✅ (E2E local ; barre latérale sur preview) |
| Copier / coller de lignes | ⚠️ non présent en tant que tel (duplication oui) |
| Aperçu A4 fidèle au PDF, en-tête complet | ✅ |
| Grille pleine largeur | ✅ après correction (« Masquer l'aperçu ») ; par défaut l'aperçu prend la moitié ⚠️ à trancher |
| Fiche devis (lecture) : structure sans montant, ouvrage regroupé, remise, sous-total calculé | ✅ après correction `2e67d69` (capture 37) |
| PDF téléchargeable depuis la preview | ✅ après correction (§ 13-14 : indice de runtime AL2023 ; 502 avant) |

**Planning**
| Critère | État |
| --- | --- |
| Vue semaine par salarié, jour, mois, par équipe / chantier / ressource, densité compacte | ✅ |
| Glisser-déposer, modification, duplication (Alt), étirement, clavier | ✅ |
| Horaires, chantier, client, adresse, couleur, notes | ✅ |
| Absences / congés, conflits (salarié doublé, congé, disponibilités, surcharge) | ✅ |
| Filtres (type, chantier, recherche) | ✅ |
| Temps de réponse avec 400 évènements | ✅ 2,6-3,2 s après la migration 290 (§ 17) ; reste le coût RLS plateforme ⚠️ |
| Bouton de vue actif lisible au survol | ✅ après correction `2e67d69` |

## 12. Performance mesurée sur la preview (Vercel fra1 → Supabase eu-west-3, Chromium 1440 × 900)

| Page | TTFB | Hydratée | Détail |
| --- | --- | --- | --- |
| Devis 10 lignes (éditeur) | 0,7 s | 1,8 s | — |
| Devis 100 lignes | 0,03 s (cache) / 1,5 s | 2,6 s | 101 cellules DOM ; frappe → totaux **48 ms** |
| Devis 500 lignes | 1,5 s | 2,7 s | virtualisé : **30 cellules DOM** pour 500 lignes ; frappe → totaux **81 ms** ; défilement 0,4 s |
| Planning semaine, 16 évènements | 2,6 s | 3,6 s | 127 Ko |
| Planning semaine, **40 salariés / 400 évènements** | **6,5 s** | 7,9 s (blocs visibles) | 526 Ko, 400 blocs, 42 lignes ; déplacement clavier : réaction 0,5 s, enregistrement 9,4 s |
| Planning jour, 40 salariés (80 blocs) | 3,3 s | 4,3 s | — |
| Tableau de bord | 0,8 s | — | référence |

Diagnostic du planning : la RPC `conflits_planning` s'exécute sous les droits de l'appelant ; sous RLS,
`salaries_evenement()` est appelée pour chacun des 400 évènements et chaque table est filtrée ligne à ligne
par `est_membre_actif()` : **3 980 ms** mesurés en `authenticated` contre **45 ms** en `postgres`. La lecture
simple des 400 évènements sous RLS coûte 726 ms, celle des affectations 719 ms (≈ 1,8 ms par ligne : coût de
la politique `est_membre_actif(entreprise_id)`, préexistant et commun à toute la plateforme). Le rendu client
(virtualisation, glisser-déposer) reste fluide, comme sur le banc local (§ 18 du rapport métier).

## 13. Problèmes rencontrés

1. **PDF de devis : 502 sur la preview.** La page d'impression `/imprimer/devis/<id>` répond 200 avec le rendu
   v2 correct, mais `@sparticuz/chromium` 149 ne démarre pas sur la fonction Vercel (Node 24.x, AL2023) :
   `Failed to launch the browser process … /tmp/chromium: error while loading shared libraries: libnspr4.so`.
   Le lanceur, les versions (`@sparticuz/chromium` 149.0.0, `puppeteer-core` 25.6.0), `next.config`
   (`serverExternalPackages`, `outputFileTracingIncludes`) et la version Node (24.x) sont **identiques sur le
   projet Vercel de Production** : le défaut est très probablement préexistant et indépendant de GP V1
   (la branche ne modifie pas le lancement). L'archive `al2023.tar.br` contient bien `lib/libnspr4.so` ; la
   cause, journalisée côté serveur : **la fonction ne reçoit pas `VERCEL=1`** (`VERCEL=` vide, aucun
   `AWS_EXECUTION_ENV`) → `@sparticuz/chromium` se croit sur Amazon Linux 2, n'extrait pas ses bibliothèques
   AL2023 (`/tmp/al2023/lib/libnspr4.so=false`) et Chromium échoue. Vercel n'expose `VERCEL=1` à l'exécution
   que si « Automatically expose System Environment Variables » est coché sur le projet. **Corrigé** dans le
   lanceur (§ 14, `7f86053`) : PDF **200**, vrai PDF Chromium (Skia/PDF m149). Si Production n'a pas cette case
   cochée, ses PDF étaient dans le même état ; le correctif la couvre aussi.
2. **Planning 400 évènements en 6,5 s** (§ 12) — correctif SQL prêt, non appliqué (migration 290, § 14).
3. **Dialogue « Ouvrage » fermé par la première autosauvegarde** d'un nouveau devis (§ 14, corrigé).
4. **Ligne de la palette typée « Libre »** au lieu de « Article » (§ 14, corrigé).
5. **Grille étroite** à 1440 px (§ 14, corrigé par un bouton ; le défaut d'affichage reste à trancher).
6. **Fiche devis (lecture)** : rendu historique des lignes de structure (« Fourniture · 0 u · 0,00 € »),
   ouvrage éclaté en composants — à aligner sur la présentation v2 (non corrigé : hors barre de l'éditeur).
7. `db push` : incident `gin_trgm_ops` sur la 276 (§ 7) — à traiter dans le train avant Production.
8. Ctrl+Z dans une cellule active annule la frappe du navigateur, pas l'étape d'historique (bouton OK).

## 14. Corrections apportées (branche, poussées sans force, chacune typecheck + lint + vitest)

| Commit | Périmètre | Contenu | Preuve |
| --- | --- | --- | --- |
| `8309d04` | devis | `EditeurDevisV2` : la première autosauvegarde d'un nouveau devis gardait la route `/devis/nouveau` mais changeait l'URL en `/devis/<id>/modifier` par `replaceState` ; la prochaine action serveur faisait alors re-rendre la page « modifier » (arbre du routeur ≠ URL) et fermait le dialogue ouvert. L'identifiant voyage dans le fragment `#devis=<id>`, relu au rechargement. | reproduit 2 × avant, dialogue conservé après (diag C/D) ; 343 tests |
| `059d699`, `372ce47` | devis / PDF | route `/api/documents/devis/[id]/pdf` : la cause d'un échec est journalisée (`[pdf] …`) avec l'environnement Chromium ; le 502 n'est plus muet. | lint, tsc |
| `7f86053` | PDF | `generer.ts` : dans une fonction serverless (`/var/task`) sans aucun indice de runtime, pose `AWS_LAMBDA_JS_RUNTIME=nodejs<majeur>.x` avant l'import de `@sparticuz/chromium` → bibliothèques AL2023 extraites. | PDF preview 200 après build ; 20 tests `src/lib/pdf` |
| `8e37d2f` | tests | deux tests du catalogue lisaient le SQL proposé supprimé au lot 0 → migration 284. | 33 tests |
| `75da3be`, `d33b103` | devis | bouton « Masquer l'aperçu » (grand écran) : grille pleine largeur, 14 colonnes visibles ; colonne unique bornée pour que la grille défile dans son cadre. | capture 39 ; 7 tests composant |
| `b6229c4` | devis | ligne insérée depuis la palette d'articles : `typeLigne = "article"`. | 343 tests |
| `a086250` | planning (SQL) | **migration `20260913000290`** : `conflits_planning` en SECURITY DEFINER avec garde `est_membre_actif(p_entreprise_id)`, corps / signature / droits inchangés. **Non appliquée sur la preview** (autorisation demandée). | local : clone du ledger + 290, pgTAP planning 25/25, surface 10/10 ; `verify-migrations` 287 valides |
| `9d7dc99`, `3cfc650` | recette | seed de recette (dossier `docs/gp-v1/preview/`). | rejoué sur copie locale |

Aucune modification de Production, aucune fusion, aucun déploiement Production, aucun `--force`.

## 15. Points à valider par Julien

1. **PDF en Production** : vérifier sur app.elsatia.fr que « Télécharger PDF » fonctionne aujourd'hui. S'il échoue,
   le défaut est préexistant (projet Vercel sans exposition des variables système) et le correctif `7f86053` de
   cette branche le couvre ; l'autre remède est de cocher « Automatically expose System Environment Variables ».
2. **Autoriser** l'application de la migration 290 sur la preview (`db push`, 1 fichier) pour mesurer le gain.
3. **Aperçu A4 par défaut** : conserver l'aperçu ouvert par défaut (état actuel) ou ouvrir la grille pleine largeur
   par défaut, l'aperçu à la demande (plus proche de Batappli).
4. **Fiche devis en lecture** : aligner le rendu des lignes de structure et des ouvrages sur la présentation v2.
5. **Retirer le badge** `NEXT_PUBLIC_GP_PREVIEW_BADGE` de tout environnement promu.
6. **Compacte** : contraste du bouton actif.
7. Décision produit : copier / coller de lignes entre devis (absent ; duplication présente).

## 16. Gate avant livraison et verdict

| Contrôle | Résultat |
| --- | --- |
| Build | Vercel Preview `Ready` pour chaque commit (dernier `7f86053`, déploiement `elsatia-preview-5v2aa59k0`) |
| Typecheck | `tsc --noEmit` : 0 erreur |
| Lint | `npm run lint` : 0 erreur, 8 avertissements préexistants (`no-unused-vars`) |
| Tests unitaires | vitest 2 380 tests : 2 373 verts, 3 ignorés ; sous charge 4 échecs (stripe webhook ×2, surface remises legacy, xlsx) qui **passent tous rejoués seuls** — `xlsx.test.ts` est connu pour dépasser 5 s sous charge |
| Migrations | `verify-migrations` : 287 fichiers valides ; preview au ledger **290** (287 versions, § 17) ; pgTAP GP V1 : preuve du Fresh (§ 19 métier) + planning 25/25 et surface 10/10 avec la 290 |
| Devis V2 visible | ✅ éditeur ligne par ligne, badge « Devis V2 actif » |
| Planning V2 visible | ✅ badge « Planning V2 actif » |
| Works visible sur Pro | ✅ entreprise de recette en Pro, sans override |
| Overrides de recette | aucun (`entreprise_feature_flags` vide pour l'entreprise de recette) |
| Flags actifs | Preview uniquement |
| Migrations preview appliquées | 286/286 |
| Production intacte | ✅ (jamais liée, jamais interrogée, aucun déploiement) |
| PDF | ✅ 200 après `7f86053` |

**Verdict : PRÊT POUR VALIDATION UTILISATEUR.** Points encore ouverts après le § 17 : aperçu A4 par défaut
(décision produit), badge à retirer avant promotion, copier/coller de lignes (décision produit), incident
`db push` 276 à traiter dans le train, coût RLS plateforme (lot plateforme). PDF confirmé par Julien en Production.

Temps passé sur cette étape : 03:00 → 09:50 (sauvegarde, répétition générale, push en trois temps, seed,
recette scriptée devis + planning + perf, 7 correctifs, rapport).

## 17. Suite après retour de Julien (2026-09-13, 10:00 → 10:30)

Julien confirme que « Télécharger PDF » fonctionne en Production et demande de continuer.

- **Migration 290 appliquée sur la preview** (`db push`, 1 fichier, ledger 287 → dernière `20260913000290`) :
  `conflits_planning` sous RLS **3 980 ms → 192 ms** ; surface `anon` inchangée (3). Page planning
  40 salariés / 400 évènements : rendu serveur **6,5 s → 2,6-3,2 s**, blocs visibles 7,9 s → 3,9-4,9 s ;
  enregistrement d'un déplacement clavier 9,4 s → 3,8 s ; vue jour 40 salariés 3,3 s → 1,6 s.
  Le reste du temps est le coût ligne à ligne des politiques RLS (`est_membre_actif`, ≈ 1,8 ms/ligne),
  préexistant et commun à toute la plateforme : à traiter dans un lot plateforme, pas dans GP V1.
- **Fiche devis en lecture** (`2e67d69`) : moteur v2 seulement, module pur `lecture-lignes.ts` (3 tests) +
  composant serveur `LignesDevisLecture` : titres / sous-titres / commentaires / séparateurs / sauts de page
  sans montant, **ouvrage regroupé** au-dessus de ses composants (référence, quantité principale, total),
  remise avec sa règle (« 5 % de la section »), **sous-total calculé** depuis le précédent. L'affichage
  historique (drapeau éteint) est inchangé.
- **Planning** (`2e67d69`) : bouton de vue actif lisible au survol (« Compacte » paraissait grisé).
- Gate rejoué sur ces commits : lint 0 erreur, typecheck 0 erreur, tests ciblés verts, build Vercel Ready.

## 18. Décisions de Julien et préparation Production (2026-09-13, 10:35 → 11:30)

Décisions : (1) grille pleine largeur par défaut, aperçu A4 à la demande ; (2) copier/coller de lignes
entre devis : oui, après la validation visuelle finale ; (3) badge preview absent automatiquement de tout
environnement promu ; (4) migration 276 à qualifier avec le rôle réellement utilisé ; (5) coût RLS →
backlog plateforme. Traités ici : 1, 3, 4.

- **(1) Éditeur** (`c139ee2`) : `apercuVisible` à `false` par défaut sur grand écran ; bouton « Aperçu A4 »
  ouvre l'aperçu réel à côté de la grille, « Masquer l'aperçu » le referme. Mobile inchangé (onglets).
- **(3) Badge** (`c139ee2`) : module pur `badge-preview.ts` (7 tests) — visible seulement si
  `NEXT_PUBLIC_GP_PREVIEW_BADGE=1` **et** `VERCEL_ENV ≠ production` **et** `NEXT_PUBLIC_APP_URL` ≠
  `app.elsatia.fr`. Le projet Vercel `elsatia-production` ne porte ni cette variable ni les drapeaux GP.
- **(4) Migration 276** : `gin_trgm_ops` qualifié par le schéma réel de `pg_trgm` (lu dans `pg_extension`,
  bloc `do … execute format`), sans dépendre du `search_path` du rôle qui migre. Preuves en harnais :
  **A.** Fresh complet 1→290 sur Postgres nu (287 appliquées, 3 index, extension en `extensions`) ;
  **B.** cas Supabase (pg_trgm dans `extensions`), la 276 jouée par un rôle de connexion sans `extensions`
  dans son `search_path` puis `set role postgres`, comme la CLI — voir résultat ci-dessous.
  Runbook : `docs/gp-v1/preview/RUNBOOK_MIGRATIONS_PRODUCTION_GP_V1.md` (rôle utilisé, sauvegarde,
  répétition générale, dérives à chercher, contrôles). Rien n'a été joué sur Production.
  Résultat **B** : 273 migrations avant, **276 OK** jouée par `cli_login_test` (`search_path` = `"$user", public`,
  puis `set role postgres` comme la CLI), 14 migrations après, les 3 index sur `extensions.gin_trgm_ops`.
  Résultat **A** (Fresh 1→290 avec la 276 qualifiée) : voir le journal `preuve-276a.log` du scratchpad, reporté
  dans le message de livraison. La 247 (Colors) écrit déjà `extensions.gin_trgm_ops` en dur : elle passe avec
  ce rôle (preuve B l'a traversée). Preview : vérifié après build — badge présent sur la preview, grille
  1 150 px par défaut sans aperçu, bouton « Aperçu A4 » ouvre l'aperçu (captures 30, 30c).

## 19. Accès recette et période d'essai (2026-09-13, 11:45 → )

Constat de Julien : un compte sans entreprise arrive sur « Configurer votre accès » sans sortie. Lot traité
sur la branche, preview seule, Production intouchée.

**Page « Configurer votre accès »** (`ChangerDeCompte.tsx`) : en tête de page, adresse du compte connecté
et bouton **« Changer de compte »** (formulaire → `logoutAction` : `supabase.auth.signOut()` puis `/login`,
aucune donnée touchée ; un compte dépôt est renvoyé vers sa borne comme partout ailleurs). Pleine largeur
sur mobile, jamais dans un menu.

**Accès recette sur la preview** (`/login`) : encart « Environnement de preview — démo GP V1 » affiché
uniquement si `NEXT_PUBLIC_GP_DEMO_EMAIL` est posée **et** que le déploiement est une preview (même verrou
que le badge : drapeau + `VERCEL_ENV ≠ production` + adresse ≠ `app.elsatia.fr`). Le bouton « Ouvrir la démo
GP V1 » préremplit l'adresse du compte de recette et place le curseur sur le mot de passe. **Pas de connexion
automatique** : l'URL de preview est publique (aucune protection de déploiement Vercel), une connexion
sans mot de passe ouvrirait l'entreprise de recette à quiconque ; aucun mot de passe n'existe dans le code,
les variables ou le navigateur. Variable posée sur l'environnement Preview du projet `elsatia-preview`
seulement ; le projet `elsatia-production` ne porte aucune variable GP / démo (vérifié).

**Compte de recette** : `dirigeant.recette@elsatia-preview.invalid`, entreprise « ELSATIA Recette V2 »,
poste Dirigeant (107 droits, sans `mode_compte_depot`), offre **Pro**, statut **actif**, échéance
13/09/2027, aucun `entreprise_feature_flags`, entreprise active positionnée → tableau de bord direct.

**Période d'essai — source de vérité.** `getContexteEntreprise()` (serveur) → RPC
`contexte_abonnement_courant` → `entreprises.abonnement_statut`, `abonnement_essai_debut`,
`abonnement_essai_fin`. Fin effective = `finEssaiEffective` du socle (`abonnement_essai_fin`, à défaut
début + 30 jours). Aucune valeur du navigateur n'entre dans le calcul. Statut `actif` = abonnement actif
(rien à afficher) ; `essai` sans fenêtre calculable = rien à afficher (le socle considère l'essai en cours) ;
`suspendu` / `annule` = pris en charge par la redirection existante.

**Fuseau.** Convention produit = calendrier de Paris : l'essai couvre toute la journée `abonnement_essai_fin`
(date sans heure) ; « aujourd'hui » et le décompte sont des jours calendaires `Europe/Paris`, jamais UTC
(à 00:30 à Paris on est déjà au nouveau jour). Le blocage du socle (proxy) reste à `fin T23:59:59.999Z`,
soit 01:59 (été) / 00:59 (hiver) le lendemain à Paris : l'affichage annonce « terminée » avant que l'accès
ne soit coupé, jamais après. Module pur `src/lib/essai-statut.ts`, 16 tests (30 j, 8 j, 7 j, 3 j, 1 j, jour
de fin, expiré, abonnement actif, sans essai, employé, minuit Paris / UTC).

**Niveaux et libellés** : > 7 j « Période d'essai — N jours restants » (info discrète, pas de bandeau) ;
7 → 4 « Votre période d'essai se termine dans N jours. » (avertissement, bandeau) ; 3 → 2 (renforcé) ;
1 « Votre période d'essai se termine demain. » et 0 « Dernier jour de votre période d'essai. » (fort) ;
expiré « Votre période d'essai est terminée. » avec la date et « vos données sont conservées ». Détail
systématique : « Votre essai se termine le 25 septembre 2026. ».

**Emplacements** : carte du tableau de bord (toute la durée de l'essai), ligne compacte sous « Entreprise
active » dans la barre latérale (« Essai · 12 j restants »), bandeau dans toute l'application dès J-7 et à
l'expiration (jamais de modale bloquante). **CTA** « Choisir mon abonnement » → parcours `/abonnement`
existant, réservé aux profils qui peuvent souscrire (`gerer_utilisateurs` ou `gerer_parametres`, ou poste
sans restriction) ; un employé voit le décompte sans bouton et, à l'expiration, « Contactez votre
administrateur ». Les bandeaux historiques `EssaiPreavisBanner` / `EssaiExpireBanner` du layout sont
remplacés par le composant central ; le module `preavisEssai` du socle reste en place (proxy, tests).

**Résultats sur la preview** (script Playwright, build `fb4ee31` puis correctif de marge) :
| Vérification | Résultat |
| --- | --- |
| `/login` : encart démo présent, « Ouvrir la démo GP V1 » → `/login?demo=1`, adresse préremplie | ✅ (captures 70-71) |
| Compte sans entreprise → `/onboarding`, bouton « Changer de compte » visible desktop et mobile (390 px), clic → `/login`, 0 cookie de session, `/dashboard` renvoie vers `/login` | ✅ (captures 72-73) |
| Compte de recette Pro : `/dashboard` direct, entreprise « ELSATIA Recette V2 », aucun bandeau d'essai, `/devis/nouveau` = grille v2, `/planning` = planning v2 | ✅ |
| Essai J-30 / J-18 (Dirigeant) : carte + barre latérale, pas de bandeau, bouton d'abonnement | ✅ (captures 77, 75-J18) |
| J-7 : bandeau « … dans 7 jours. » niveau avertissement | ✅ (75-J7) |
| J-3 : niveau renforcé | ✅ (75-J3) |
| J-1 : « … se termine demain. » niveau fort | ✅ (75-J1) |
| J0 : « Dernier jour de votre période d'essai. », barre latérale « Essai · dernier jour » | ✅ (75-J0) |
| Expiré : redirection existante `/abonnement-suspendu?motif=essai_expire` — page explicite (« Votre essai gratuit est terminé », données conservées, Choisir une offre / Exporter / Support / Se déconnecter) ; le bandeau « terminée » du composant central couvre les pages restées ouvertes (`/abonnement`, `/aide`, `/parametres/donnees`) | ✅ (75-expire) |
| Employé (J-3) : bandeau, carte et barre latérale sans bouton d'abonnement ; expiré → même page de sortie | ✅ (78) |
| CTA « Choisir mon abonnement » → `/abonnement` (parcours existant, aucun Stripe ni pricing ajouté) | ✅ |
| Correctif après capture 74 : le bouton du bandeau passait sous le bouton flottant de recherche → marge droite réservée (`lg:pr-52`) | ✅ |
| Dates de la recette : `entreprises_essai_dates_coherentes` impose fin ∈ [début, début + 30] ; la recette déplace début et fin ensemble ; entreprise d'essai remise à J-5 | — |

Gate : lint 0 erreur (8 avertissements préexistants), typecheck 0 erreur, vitest 2 397 verts (3 échecs sous
charge — xlsx, webhook boutique — qui passent seuls), build Vercel Ready.

## 20. Session autonome (2026-09-13, 12:15 → ) — copier/coller inter-devis

**Baseline (phase 0)** : branche `feat/gp-v1-metier-devis-planning-references-v1`, HEAD `8dbcb4c` = distant,
arbre propre ; 287 migrations locales = 287 sur la preview (max `20260913000290`) ; Supabase preview et
Production `ACTIVE_HEALTHY` (Production jamais liée) ; Vercel Preview Ready, badge et encart démo en
ligne ; smoke : typecheck 0 erreur, lint 0 erreur (1 avertissement préexistant), 364 tests devis/planning verts.

### 20.1 Conception

- **Format** `elsatia/devis-lines-v1` (`src/lib/devis/presse-papier.ts`, module pur, 11 tests) :
  `{ format, version: 1, entrepriseId, copieLe, elements[] }` ; un élément est une ligne (sans clé, avec
  son origine : catalogue, références figées, coûts si autorisés) ou un ouvrage entier (instance sans
  clé ni ordre : composants, modèle instantané, options, saisies, mode de présentation ; auteur du
  modèle retiré). **Jamais** d'identifiant de ligne, de devis, de dates ni d'auteur.
- **Validation stricte** au collage (`lirePressePapier`) : format et version exacts, entreprise
  identique (sinon refus « autre entreprise », rien créé), bornes de texte, nombres finis, types de
  ligne connus, natures et modes d'ouvrage connus, listes blanches de clés d'origine ; un document
  corrompu ou tronqué est refusé ; un texte ordinaire est laissé au collage de texte.
- **Collage** (`collerElements`) : nouvelle clé pour chaque ligne et chaque ouvrage, origine recopiée
  sous la nouvelle clé, position après / avant / fin, puis `recalculerRemisesSection` ; les sous-totaux
  restent calculés à l'affichage (jamais recopiés) ; la remise de section garde sa règle (%) et est
  recalculée dans la section cible (prouvé : −82,40 € dans la source, −92,40 € dans la cible dont la
  section contient une ligne de plus).
- **Coûts** : retirés à la copie pour qui ne voit pas les coûts, retirés au collage si l'utilisateur ne
  les voit pas (presse-papier forgé) ; la base reste l'autorité (`enregistrer_devis_brouillon_v2`
  n'écrit `lignes_devis_couts` qu'avec `gerer_couts_devis`).
- **Inter-entreprises** : refusé côté client (marque d'entreprise) **et** côté base : migration
  `20260913000291` = deux déclencheurs BEFORE (`lignes_devis.source_id` selon `source_catalogue`,
  `devis_ouvrages.ouvrage_id`) qui refusent toute référence étrangère à l'entreprise du devis (pgTAP
  11/11 ; suites devis v2 36/36, 111/111, 26/26 et surface 10/10 inchangées). Appliquée sur la preview.
- **Atomicité, lot, concurrence** : inchangés et hérités — un collage est un changement d'état local ;
  l'enregistrement (autosauvegarde ou « Enregistrer et fermer ») envoie toutes les lignes en **une RPC**,
  **une transaction**, avec le **verrou de révision** (conflit explicite si le devis a changé ailleurs).
  Pas une requête par ligne.
- **Annuler** : le collage entre dans l'historique existant (Ctrl+Z / bouton) ; le retour « N lignes
  ajoutées au devis » propose « Annuler le collage ».

### 20.2 Interface

Grille : sélection par clic sur la poignée (Maj = plage depuis l'ancre, Ctrl/Cmd = ajouter), Ctrl+Maj+↑/↓
étend, Ctrl+A (hors champ texte) sélectionne tout, Échap vide ; lignes sélectionnées surlignées
(`aria-selected`, poignée ✓, compteur « N sélectionnées »). **Ctrl+C** copie les lignes sauf si du texte
est sélectionné dans le champ (la copie de texte garde la main) ; **Ctrl+V** dans un champ : lignes si le
presse-papier système est un presse-papier de lignes, texte sinon ; hors champ : lignes (presse-papier
système, sinon repli local partagé entre onglets). Barre d'outils : **Copier (N)**, **Coller**, position
« après la sélection / avant / à la fin ». Mobile : case par ligne + mêmes boutons. Retour : « 6 lignes
copiées », « 6 lignes ajoutées au devis », messages d'erreur explicites.

### 20.3 Qualification sur la preview (phase 2) — défaut trouvé, prouvé et corrigé

**Symptôme** (scripts Playwright sur la preview, compte Dirigeant) : dans le même devis, copier 8 lignes puis
coller fonctionne (copie 7 ms, collage 30 ms, 18 lignes rechargées, clés toutes distinctes, sous-total
recalculé). Vers un **nouveau** devis (« nouveau devis → titre → coller → Enregistrer et fermer »), la fiche
rouvrait avec le **titre seul** (devis `CLIPBOARD CIBLE B`, `DIAG COLLE 2/3`, bisect `BISECT …` : 1 ligne,
révision 1), alors que d'autres passes identiques gardaient les 11 lignes (`DIAG COLLE`, `4`, `5`, `6`).

**Fausse piste** (`cc8fcc3`) : le premier enregistrement d'un devis neuf réécrivait l'adresse
(`replaceState`) — supprimé (l'identifiant est retenu en mémoire, la fiche s'ouvre par navigation complète
à l'enregistrement explicite). Amélioration réelle (plus de resynchronisation du routeur), mais le défaut
persistait après déploiement (`CLIPBOARD CIBLE B` à 13:39 : 1 ligne).

**Cause prouvée** (journal des requêtes, `DIAG COLLE 6`) : la grille passait à 9 lignes puis **revenait à
1 ligne** quelques millisecondes après le collage, avant tout enregistrement. La cellule Désignation valide sa
saisie **120 ms après le blur** (pour qu'un clic dans sa liste de résultats survive), et cette validation
reconstruisait l'état depuis **l'état du rendu** (`modifierLigneLibre(etat, …)`) : un collage, une
duplication (Ctrl+D) ou une insertion survenus dans cette fenêtre étaient écrasés. Un script enchaîne
blur → poignée → position → Coller en moins de 120 ms ; un utilisateur rapide (blur puis Ctrl+V) aussi.

**Correctif** (`17f25a2`) : toutes les mises à jour de la grille et de l'éditeur sont des **fonctions de
l'état le plus récent** (`setEtat((courant) => …)`, historique inclus) ; le collage tire ses clés une fois
(retour et sélection immédiats) et les rejoue si l'état a bougé entre le rendu et l'application. Test de
banc ajouté (`presse-papier.banc.spec.ts`, « validation différée ») : **rouge sur le code précédent**
(3 lignes au lieu de 5), vert après ; les 4 autres tests du banc inchangés (copie 500 = 108 ms, collage
500 = 201 ms, 30 cellules DOM). Devis v2 : 357 tests vitest verts, typecheck 0, lint 0 erreur.

**Portée** : ce défaut préexistait au copier/coller (toute saisie suivie d'une action de grille dans les
120 ms), il explique aussi l'échec du Ctrl+D scripté de la phase 3 (rejoué après correctif, § 25).

## 21. Répétition générale des migrations (phase 9, 12:38 → 12:41, harnais `train-v3-dbtest`, Postgres nu 17.6)

| Scénario | Résultat |
| --- | --- |
| **Fresh** 1 → 291 (288 fichiers) | 288 appliquées, 615 fonctions `public`, schéma 23 825 lignes |
| **pgTAP complet sur le Fresh** | **79 fichiers, 2 284 ok, 0 not ok, 0 erreur** (dont 291 : 11/11) |
| **Upgrade depuis 210** (ancien état Production connu) | 193 puis 95 appliquées ; schéma **identique** au Fresh (seul le jeton aléatoire `\restrict` de pg_dump diffère) |
| **Upgrade depuis 280** (avant GP V1) | 277 puis 11 appliquées ; schéma **identique** au Fresh |
| **Upgrade depuis la sauvegarde preview réelle** (251 + 2 dérives corrigées) | 46 appliquées (dont 290, 291) ; devis 152 / factures 106 / lignes 437 / entreprises 10 inchangés ; schéma identique au Fresh **sauf deux dérives préexistantes de la preview** : contrainte `plateforme_admins_actif_requiert_utilisateur_id` absente sur la preview (posée par le ledger, présente sur Fresh et sur Production après migration), et `pointages_coordonnees_check` écrite avec un parenthésage différent (même règle) |
| Migration 276 (`gin_trgm_ops` qualifié) | traversée par les quatre chemins ; cas « rôle sans `extensions` » prouvé au § 18 |
| Migration 290 | index / RPC en SECURITY DEFINER : traversée ; performance mesurée sur la preview (192 ms sous RLS) |
| Migration 291 (nouvelle, presse-papier) | traversée par les quatre chemins ; appliquée sur la preview ; surface `anon` inchangée (3) |
| **Migrations 292 et 293** (phase 13, § 31) | Fresh 1 → 293 : **290 appliquées**, 615 fonctions, schéma 23 861 lignes ; pgTAP complet **81 fichiers, 2 313 ok, 0 not ok** (2 302 + les 11 du test 293 rejoué après correction de son prélude) ; Upgrade 291 → 293 : schéma **identique** au Fresh ; appliquées sur la preview (`db push`, ledger **290 = local, max `20260913000293`**) |

Aucune migration historique modifiée par ce lot (la 276 l'avait été au § 18 sur décision de Julien).

## 22. Planning V2 — durcissement (phase 6, preview, 12:45 → 13:10)

| Mesure | 40 salariés / 400 évènements (21-27/09) | 40 salariés / 1 000 évènements (5-11/10) |
| --- | --- | --- |
| Rendu serveur (TTFB) | 4,1 s (2,6-3,2 s lors du § 17 ; variance Vercel / charge du poste pendant la répétition générale) | 5,6 s |
| Blocs visibles | 6,1-6,7 s | 7,4 s (1,1 Mo transférés) ; vue jour 9,7 s (200 blocs) ; liste compacte 5,8 s |
| Déplacement clavier : réaction / enregistrement | 0,24 s / 5,7 s | 0,56 s / 7,8 s |
| Conflits (RPC sous RLS, § 17) | 192 ms | inclus dans le rendu |

1 000 évènements restent utilisables (rendu < 8 s, réaction < 0,6 s), sans être aussi fluides que 400 ; la
limite est le coût ligne à ligne des politiques RLS (backlog plateforme) et le poids du rendu serveur.

**Règle 24 h** (jour vierge, un salarié) : 8 h + 8 h + 7 h 59 acceptés (23 h 59), la minute suivante et
l'heure de trop refusées, **dans le dialogue** (jamais derrière la modale). Le message était le repli
générique « Impossible d'enregistrer cet évènement. » : corrigé (`ca9ec99`) — la règle de la base
« Un ouvrier ne peut pas dépasser 24 heures planifiées par jour » est rendue explicitement. Première
tentative sur un jour où le salarié portait déjà 8 h d'évènements de perf : refus dès 23 h 59, cohérent.

**Glisser-déposer** (semaine du 7/09, relu en base) : autre salarié ✅ (Ravalement : Emma → Dan, la
nacelle conservée), conflit ✅ (Formation → Emma, vendredi : « 3 conflits », bloc marqué), absence ✅
(Pose cloisons → jeudi, jour du congé d'Ali : « 1 conflit », détail « Déjà affecté à « Congé recette » »),
même jour autre horaire (vue jour) ✅ (Réunion 14 h → 16 h), autre jour ⚠️ : le bloc d'une heure
« Livraison plaques » (07:00-08:00, empilé sous un bloc de 9 h) n'a pas suivi le glisser scripté vers le
jeudi, alors que le même geste avait déplacé « Peinture bureaux » au § 9 ; à revérifier à la main.

**Clavier** : Tab atteint les blocs (`tabindex=0`, `role=button`) ; Entrée n'ouvrait pas le détail après un
clic (le glisser-déposer capturait le pointeur sans poser le focus) : corrigé (`ca9ec99`) — focus au
pointeur, Entrée ou Espace ouvre le détail, Échap le ferme.

## 23. Revue de sécurité (phase 14)

| Point | Constat |
| --- | --- |
| RLS / surface | Après les 288 migrations (preview) : privilèges DDL / TRUNCATE / TRIGGER / REFERENCES des rôles applicatifs = 0 ; fonctions SECURITY DEFINER exécutables par `anon` = exactement la liste blanche documentée (3 : partage public de document, rendu par jeton, invitation Réserves) ; SECURITY DEFINER sans `search_path` = 0 ; test `isolation_multitenant_surface` 10/10 sur Fresh et sur clone preview migré. |
| Coûts (prix d'achat, coût MO, coefficient, marge) | Absents du DOM du Conducteur (colonnes et bloc « Rentabilité » absents, § 8) ; l'enregistrement n'écrit `lignes_devis_couts` qu'avec `gerer_couts_devis` (RPC `enregistrer_devis_brouillon_v2`, base autoritaire) ; le presse-papier d'un profil sans `voir_couts_devis` ne contient aucun coût (copie) et un presse-papier forgé avec coûts est nettoyé au collage puis ignoré par la base. |
| Presse-papier | Format versionné, validation stricte (types, bornes, listes blanches), aucun identifiant technique, aucune donnée hors devis ; refus « autre entreprise » sans écriture ; document corrompu refusé. |
| Inter-entreprises (base) | Migration 291 : `lignes_devis.source_id` (prestation ou article de stock) et `devis_ouvrages.ouvrage_id` doivent appartenir à l'entreprise du devis (déclencheurs BEFORE, erreur 23514) — pgTAP 11/11. |
| RPC | Toutes les RPC GP V1 en SECURITY DEFINER vérifient `est_membre_actif` / `a_permission` et posent `search_path` ; `conflits_planning` (290) garde `est_membre_actif(p_entreprise_id)` ; `anon` et `service_role` révoqués. |
| Clé service | `SUPABASE_SERVICE_ROLE_KEY` n'apparaît que côté serveur (aucun fichier client) ; `npm run verify:secrets` : 1 958 fichiers, aucun secret (1 exception nommée). |
| Preview / démo | Badge et encart démo conditionnés par `NEXT_PUBLIC_GP_PREVIEW_BADGE=1` **et** déploiement non promu (`VERCEL_ENV ≠ production`, adresse ≠ `app.elsatia.fr`) — 12 tests ; le projet Vercel de Production ne porte aucune variable GP / démo ; pas de connexion automatique (URL de preview publique). |
| Routes protégées | Le proxy (`src/proxy.ts`) inchangé ; `/imprimer/devis/<id>` et `/api/documents/devis/<id>/pdf` exigent la session (cookie réémis à Chromium, vérification `getContexteEntreprise` + RLS). |
| Validation des charges utiles | Presse-papier : `lirePressePapier` (11 tests) ; enregistrement : RPC (types de lignes, bornes remise / TVA, structure sans montant, remise globale) ; planning : action serveur (titre, type, statut, fin > début) + règles de la base (24 h / jour). |

## 24. Preview — sécurité et drapeaux (phase 8)

| Variable | Projet Vercel `elsatia-preview` | Projet Vercel de Production |
| --- | --- | --- |
| `GP_DEVIS_V2`, `GP_PLANNING_V2` | posées (`1`) | **absentes** (vérifié au § 18 : aucune variable GP) |
| `NEXT_PUBLIC_GP_PREVIEW_BADGE` | `1` | absente ; refusée par le code si un jour posée (`badge-preview.ts`) |
| `NEXT_PUBLIC_GP_DEMO_EMAIL` | compte recette | absente ; l'encart démo suit le même verrou que le badge |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL` | preview (`pgvvpqyjziyapbbkydmc`) | Production (`exhvuzegsefmoguxoiak`), jamais lue par cette session |

- Le badge « PREVIEW » et l'encart « Accès démo » exigent **à la fois** le drapeau et un déploiement non
  promu (`VERCEL_ENV ≠ production`, adresse ≠ `app.elsatia.fr`) : 12 tests unitaires (`badge-preview.test.ts`),
  vérifiés en ligne sur la preview (badge visible, encart visible, `?demo=1` préremplit l'adresse seulement —
  **aucun mot de passe** dans le code, l'URL, le dépôt ou la page).
- Les drapeaux `GP_DEVIS_V2` / `GP_PLANNING_V2` sont lus **côté serveur** uniquement (pages et actions) :
  drapeau absent = comportement v1 inchangé (éditeur historique, planning historique), aucune route v2
  exposée. Production reste donc en v1 tant que les variables ne sont pas posées, même après fusion du code.
- Les comptes de recette (`*.recette@elsatia-preview.invalid`) n'existent que dans la base preview ; le seed
  (`docs/gp-v1/preview/seed-recette-gp-v1.sql`) est idempotent et refuse de s'exécuter hors de la preview
  (garde sur le project ref). Aucune donnée réelle : clients, devis et planning de recette sont synthétiques.
- Limiteur applicatif (`RATE_LIMIT_HMAC_KEY`) actif sur la preview comme en Production ; la pile E2E locale
  utilise une clé jetable.

## 25. Qualification Devis V2 après le presse-papier (phases 2-5 et 7, preview, build `17f25a2`)

Scripts Playwright `.recette-tmp/recette-clipboard.mjs`, `recette-phase3.mjs`, `recette-phase5*.mjs`,
`recette-essai.mjs` (hors dépôt), compte Dirigeant sauf mention ; devis de recette
`b3896aaa…` (12 lignes + 1 ouvrage, statut brouillon inchangé, révision 7).

| Cas | Résultat |
| --- | --- |
| 2.1 Même devis : sélection poignée + Maj, Ctrl+C, Ctrl+V après la dernière ligne | 8 lignes copiées (7 ms), collées (30 ms), 18 lignes rechargées, clés toutes distinctes en base, sous-total recalculé (§ 20) |
| 2.2 Autre devis (nouveau → titre → Coller à la fin → Enregistrer et fermer → recharger) | **après correctif** : 9 lignes à l'écran, **11 lignes + 1 ouvrage en base** (`73f570ac`, révision 1) ; avant correctif : titre seul (§ 20.3) |
| 2.2 bis : modifier B ne modifie pas A | A relu : lignes et quantité de la ligne 4 (24) inchangées ; B relu : 9 lignes |
| 2.3 Deux onglets (A copie 2 lignes, B colle : presse-papier système, repli local) | B passe de 9 à 11 lignes, « 2 lignes ajoutées au devis » |
| 2.5 Conducteur (sans `voir_couts_devis`) copie l'ouvrage et un article | presse-papier relu champ par champ : `prixAchatHt` **null** partout, aucune clé `coutMainOeuvreHt` ni coefficient de coût (origine nettoyée) ; les seuls `coefficient` présents sont les coefficients de **métré** des composants de l'ouvrage (1 / 1,2 / 0,8 : quantité par unité d'ouvrage, visibles de tous dans le dialogue Ouvrage), pas des coûts ; en-têtes de grille sans colonne de coût |
| 2.6 Presse-papier **forgé avec coûts** collé par le Conducteur puis enregistré (devis `cca3b5dd`) | « 2 lignes ajoutées », devis enregistré (4 lignes) ; **0 ligne dans `lignes_devis_couts`** pour ce devis (base autoritaire) |
| 2.7 Presse-papier d'une **autre entreprise** / document **corrompu** | preview : « Ce presse-papier vient d’une autre entreprise : collage refusé, rien n’a été créé. », 1 ligne inchangée ; document corrompu : aucune ligne créée (10 → 10), message vérifié sur le banc (« corrompu ») et refus prouvé par l'E2E 17 |
| 3.1 Clavier : Tab quantité → unité → prix d'achat, Entrée sur cellule chiffrée crée une ligne, ↑/↓, Ctrl+D, Ctrl+↓, Ctrl+Suppr, Échap | conformes ; Ctrl+D scripté dans les 120 ms suivant une saisie duplique la ligne avant sa validation (course corrigée `17f25a2`, cf. § 20.3 ; un humain n'atteint pas ce délai) |
| 3.4 Calculs limites | prix 999 999,99 × remise 100 % → 0,00 € ; remise 101 : la cellule garde « 101 », la base refuse (`lignes_devis_remise_ligne_check`, pgTAP) — à borner aussi dans la cellule (mineur, § 29) ; qté 0,001 → 1 000,00 € ; TVA 5,5 % → 55,00 € / TTC 1 055,00 € ; TVA 0 ; coefficient 1,5 sur 500 € → PV 750 000 (× qté), marge 250 €, taux de marque 33,3 % |
| 3.5 Conducteur — DOM / API / lecture / PDF | colonnes `Type, Réf., Désignation, Réf. fab., Qté, U., PU HT, Rem. %, TVA, Total HT` (aucun coût), bloc Rentabilité absent, fiche lecture sans coût (200), PDF 200 (54 Ko) |
| 4 Cohérence éditeur → lecture → A4 → PDF (devis de recette) | Total HT 4 662,60 € / TVA 932,52 € / TTC 5 595,12 € identiques dans l'éditeur, la fiche (titre, sous-titre, ouvrage OUV-0001 et ses 3 composants « ↳ », fournitures, commentaire, remise, sous-total) et l'impression |
| 4 PDF multi-pages | 100 lignes : 200, 264 Ko, **9 pages**, 1,9 s ; 500 lignes : 200, 1,18 Mo, **41 pages**, 2,7 s |
| 5 Transformation en facture (copie `aac0a700` : Dupliquer → envoyé → accepté → Transformer, confirmation acceptée) | facture `47ac5d61` créée en 1,8 s, **12 lignes identiques** (titres, composants de l'ouvrage, commentaire, remise, sous-total), HT 4 662,60 € / TTC 5 595,12 € = devis ; fiche du devis : « Documents issus de ce devis » + historique `envoye → accepte` |
| 7 Essai / onboarding (non-régression après tous les correctifs) | encart démo, `?demo=1` préremplit l'adresse seule, « Changer de compte » (déconnexion réelle, 0 cookie de session), compte Pro sans bandeau, Devis V2 et Planning V2 actifs ; niveaux J-30 (carte + latéral), J-18, J-7, J-3, J-1, J0 (bandeau), expiré → `/abonnement-suspendu?motif=essai_expire` ; employé sans CTA ; entreprise d'essai remise à J-5 |

Devis de test laissés sur la preview (repérables par leur référence d'affaire `DIAG COLLE *`, `BISECT *`,
`CLIPBOARD *`, `QUALIF PHASE 3`, copie `DEV-2026-001` + facture brouillon) : données synthétiques, sans effet
sur la recette ; supprimables depuis l'application.

## 26. Performance finale (phase 13)

| Mesure | 10-12 lignes | 100 lignes | 500 lignes |
| --- | --- | --- | --- |
| Éditeur : rendu serveur / hydraté (preview, § 12) | 0,7 s / 1,8 s | 1,5 s / 2,6 s (101 cellules DOM) | 1,5 s / 2,7 s (**30 cellules DOM**, virtualisé ; défilement 0,4 s) |
| Frappe → totaux recalculés (preview, § 12) | immédiat | 48 ms | 81 ms |
| Copier / coller (banc, `17f25a2`) | — | 69 ms / 102 ms | 108 ms / 201 ms |
| Copier / coller (preview, 8 lignes, RPC réelle) | 7 ms / 30 ms | — | — |
| Enregistrement (une RPC, une transaction) — **avant 292/293** | preview : autosauvegarde 1,3 s · explicite 2,7 s (11 lignes + ouvrage) | preview : 100 lignes OK (§ 12) ; **202 lignes : délai 8 s dépassé** | preview : 500 OK en ~10 s ; **1 000 lignes : délai dépassé, autosauvegarde en boucle** |
| Enregistrement — **après 292 + 293** (RPC seule, local Postgres 17, rollback) | — | 86 ms (500 lignes) | 87 ms (1 000 lignes) — § 31 pour la preview |
| PDF (preview) | 200 (§ 8) | 1,9 s, 264 Ko, 9 pages | 2,7 s, 1,18 Mo, 41 pages |

| Planning | 400 évènements | 1 000 évènements |
| --- | --- | --- |
| Ouverture (TTFB / blocs visibles) | 4,1 s / 6,1-6,7 s | 5,6 s / 7,4 s |
| Déplacement clavier (réaction / enregistrement) | 0,24 s / 5,7 s | 0,56 s / 7,8 s |
| Conflit (RPC 290 sous RLS) | 192 ms | inclus |

E2E complet (17 scénarios, pile locale, sans retry) : **1,3 min**. Limite connue : coût des politiques RLS
ligne à ligne sur le planning (backlog plateforme, décision de Julien § 18).

## 27. Gate de tests complet (phases 11-12, HEAD `59541ef`)

| Contrôle | Résultat |
| --- | --- |
| `npx tsc --noEmit` | 0 erreur |
| `npm run lint` | **0 erreur**, 19 avertissements : 12 dans `.recette-tmp/` (scripts de recette hors dépôt, ignorés par git mais parcourus par ESLint), 7 préexistants dans le dépôt (`<img>` boutique / signature, `useVirtualizer` incompatible avec le compilateur React, dépendance `identite` mobile, import inutilisé Réserves) — aucun introduit par ce lot |
| `npx vitest run` (complet) | **2 411 réussis, 1 échec, 3 ignorés / 202 fichiers** ; l'échec est `src/lib/xlsx.test.ts` (dépassement 9 s sous charge, connu § 13) — **vert rejoué seul (2/2)** |
| pgTAP complet (Fresh 293, harnais Postgres 17.6) | 81 fichiers, **2 313 ok, 0 not ok** (§ 21) |
| `next build` (Turbopack, environnement E2E : drapeaux V2 + badge) | exit 0, 0 erreur (deux fois : avant et après `17f25a2`) |
| `npm run verify:migrations` | 290 migrations valides, noms et horodatages uniques |
| `npm run verify:secrets` | 1 958 fichiers, aucun secret (1 exception nommée) |
| `git diff --check` | OK |
| **E2E complet** `tests/e2e/gp-v1-metier.spec.ts` (pile locale Kong 60321, base `gpv1_jetable`, build E2E) | **17/17, `--retries=0`, aucun `skip`**, rejoué trois fois : au 291 (1,3 min), au 293 (1,7 min) et après le durcissement de l'autosauvegarde (§ 32) : client, article, ouvrage, devis, 5 types de lignes, clavier + Ctrl+Z, marge, PDF journalisé, transformation en facture, planning (création, +15 min persistant, conflit), droits chef d'équipe, palette Ctrl+K, barre latérale, copier/coller même devis, copier/coller autre devis + presse-papier étranger refusé |
| Banc éditeur v2 (`presse-papier.banc.spec.ts`, `sauvegarde.banc.spec.ts`) | **7/7** : 5 tests presse-papier dont la course « validation différée » (rouge avant `17f25a2`), 2 tests d'autosauvegarde (brouillon invalide, refus simulé du serveur : une seule tentative) |
| Conteneurs analytics tiers | non arrêtés : la suite E2E est passée sans saturation (aucun état à restaurer) |

Corrections de tests de cette phase (pas de contournement du produit) : scénario 9 attend le statut rendu par
le serveur avant de recharger et remonte le motif `?error=` au lieu d'un délai muet ; scénarios 16-17
partent d'un brouillon obtenu par « Dupliquer » (le devis de la suite est accepté depuis le scénario 9).

## 28. Production readiness (phases 9-10, 14-16)

- **Répétition générale** (§ 21) : Fresh, Upgrade 210 → 291, Upgrade 280 → 291 et **clone de la sauvegarde
  preview réelle** → 291 donnent le même schéma ; pgTAP complet vert ; 276 et 290 traversées ; 291 nouvelle.
- **Dry-run sur clone de sauvegarde Production (phase 10)** : **non réalisable dans cette session** — aucune
  sauvegarde Production n'est accessible sans interroger le projet Production (`exhvuzegsefmoguxoiak`), ce
  qui est interdit. Le chemin équivalent a été joué depuis l'état Production connu (`20260810000210`, § 21)
  et depuis la sauvegarde preview ; le runbook (§ 4) impose ce dry-run sur la sauvegarde logique datée le
  jour J, avant toute écriture.
- **Migrations à appliquer en Production** : 97 versions en attente depuis 210 (dont 200, 232, 236-240 <
  maximum distant → `--include-all`), rôle CLI `cli_login_postgres` suffisant (276 qualifiée).
- **Sécurité** (§ 23) : RLS / SECURITY DEFINER / `anon` inchangés, coûts protégés en base, presse-papier
  validé et borné à l'entreprise (client + déclencheurs 291), aucune clé service côté client, aucun secret.
- **Drapeaux** (§ 24) : Production reste en v1 tant que `GP_DEVIS_V2` / `GP_PLANNING_V2` ne sont pas posés ;
  badge et démo impossibles en Production par construction.
- **Runbook** : `docs/gp-v1/preview/RUNBOOK_MIGRATIONS_PRODUCTION_GP_V1.md` (12 sections, mis à jour avec le
  gate final).

## 29. Risques restants

| Risque | Gravité | Traitement |
| --- | --- | --- |
| Coût RLS ligne à ligne : planning 400-1 000 évènements en 4-8 s de rendu serveur | moyen (confort) | backlog plateforme (décision Julien § 18) ; 290 a déjà divisé le temps par 2 ; l'enregistrement de devis en est sorti par la 293 (§ 31) |
| RPC d'enregistrement en SECURITY DEFINER (293) : la sécurité repose sur les gardes explicites de la fonction, plus sur les politiques RLS | faible | gardes prouvées par pgTAP (membre, devis, client, chantier, commercial ; `anon` / `service_role` révoqués) ; même modèle que `conflits_planning` (290) |
| Remise de ligne : la cellule accepte « 101 » (la base refuse `remise_ligne between 0 and 100`) | mineur | borner la cellule à 100 dans un lot ultérieur ; aucune donnée invalide ne peut être écrite |
| Collage / dialogue Ouvrage : `collerElements` et `onApplique` construisent leur résultat sur l'état du rendu (clés rejouées si l'état a bougé) — fenêtre théorique < 1 rendu | faible | couvert pour le collage par le rejeu des clés ; à surveiller |
| Test `xlsx.test.ts` sensible à la charge (9 s) | faible | vert seul ; à isoler en CI |
| Dérives de schéma constatées sur la preview (contrainte `plateforme_admins…` absente, `pointages_coordonnees_check`) | faible | absentes du Fresh et du chemin 210 → 291 ; à chercher sur Production lors du dry-run (runbook § 4) |
| Deux avertissements de compilation React (`useVirtualizer`) | nul | préexistant, bibliothèque tierce |

## 30. Preview finale (phase 17, alias de branche, build `17f25a2` puis `59541ef`, 14:24-14:40)

URL : `https://elsatia-preview-git-feat-gp-v1-metier-d-467e36-julien-gregurec1.vercel.app` (rejeu du script de
recette visuelle complet `recette-preview.mjs`, compte Dirigeant puis Conducteur, 1440 × 900).

| Point | Constat |
| --- | --- |
| Badge | « GP V1 PREVIEW · Devis V2 actif · Planning V2 actif » |
| Accès démo (`/login`, `?demo=1`) | encart présent, adresse préremplie, aucun mot de passe (§ 25 ligne 7) |
| Catalogue / bibliothèque d'ouvrages | 12 articles (familles, favoris), ouvrages actifs/archivés, 3,0 s / 4,5 s |
| Nouveau devis | 2,0 s ; boutons Annuler, Rétablir, Enregistrer et fermer, Saisie / Aperçu, Articles Ctrl+K, Ouvrage, Ligne libre, **Copier, Coller**, Colonnes…, Aperçu A4 ; Insérer… = Titre, Sous-titre, Commentaire, Sous-total, Remise, Ligne vide, Séparateur, Saut de page |
| Dialogue Ouvrage | recherche OUV-0001, composants avec quantité / coefficient / perte / PU, quantité principale 12, « Marge : 956,70 € » (Dirigeant), « Insérer tout l'ouvrage » → 4 lignes ; article Ctrl+K → 5 lignes ; remise de section 5 % ; 10 lignes au final |
| Colonnes Dirigeant | Type, Réf., Désignation, Réf. fab., Qté, U., **Achat HT, Coef., Marge €**, PU HT, Rem. %, TVA, Total HT ; totaux HT 3 237,60 € / TTC 3 885,12 € ; rentabilité (coût 2 078,90 €, marge 1 158,70 €, taux 35,8 %) |
| Clavier | Tab quantité → unité ; Ctrl+Z rétablit « 2 » |
| Enregistrement / fiche | « Enregistré à 14:24 » ; fiche brouillon avec panneau d'actions groupées et motifs (« Importer des lignes » annoncé V2) |
| Impression A4 / PDF | `/imprimer/devis/<id>` 200 (46 Ko, en-tête entreprise, DEVIS BROUILLON) ; PDF 200, `application/pdf`, 54 Ko, `%PDF-1.4` Chromium |
| Planning V2 | 3,9 s ; contrôles Jour / Semaine / Mois, Par salarié / équipe / chantier / ressource ; 17 blocs ; détail (titre, type, statut, jour, début, fin, chantier) ; déplacement clavier 08:30 → **08:45 persistant** après rechargement, conflit toujours signalé |
| Conducteur | en-têtes sans coût, bloc Rentabilité absent |
| Copier / coller | § 25 (2.1-2.7) sur ce même build |

## 31. Enregistrement des gros devis — diagnostic et correctifs (phase 13, migrations 292 et 293)

**Symptôme** (preview, script de perf du presse-papier) : coller 100 lignes dans le devis de 100 lignes
(202 lignes) ou 500 dans celui de 500 (1 000 lignes) puis attendre l'autosauvegarde : « Impossible
d'enregistrer ce devis », **jamais « Enregistré à »**, et l'autosauvegarde **réessaie en boucle** toutes les
12 s. Journaux Vercel : `enregistrerDevisV2Action { code: '57014', message: 'canceling statement due to
statement timeout' }` — la limite Supabase de 8 s pour le rôle `authenticated`. Un devis de 20 lignes
s'enregistrait déjà en 3,8 s.

**Diagnostic** (base locale Postgres 17, `explain analyze` avec temps des déclencheurs, puis `auto_explain`
sur les instructions internes de la RPC) :

| Cause | Mesure (500 lignes, local) | Correctif |
| --- | --- | --- |
| `recalc_devis_apres_ligne` (migration 5) : déclencheur **par ligne** qui relit toutes les lignes du devis — la RPC supprime puis réinsère toutes les lignes → coût quadratique | 407 ms sur 435 ms de l'insertion ; ×4 à 1 000 lignes | **292** : recalcul **par instruction** (tables de transition), une fois par devis touché, résultat identique — insertion 500 lignes 435 → 27 ms |
| RPC exécutée avec les droits de l'appelant : **politique RLS évaluée ligne à ligne** (`est_membre_actif`) sur la relecture des lignes (journal des prix) et sur chaque ligne insérée | journal 452 ms + insertion 448 ms sur 1,0-3,2 s (plans `auto_explain` : `Index Scan … Filter: EXISTS(SubPlan)` × 500) | **293** : RPC en **SECURITY DEFINER** (modèle 290) avec gardes explicites — membre actif, `gerer_devis`, devis / client / chantier / commercial de `p_entreprise_id` ; corps de la 286 inchangé ; `anon` / `service_role` révoqués, `search_path` figé |

**Résultat** (RPC seule, local, transaction annulée) : 500 lignes **2,3-3,2 s → 86 ms**, 1 000 lignes
**> 12 s → 87 ms**. **Preview après 293** (même script, action serveur complète Vercel → Supabase, rendu RSC
compris) : coller 500 lignes dans le devis de 500 → **1 000 lignes enregistrées en 4,1 s**, retour à 500 en
3,6 s, plus aucune erreur 57014 ; modification simple sur 500 lignes : « Enregistré à » en ~3 s. Preuves : pgTAP `gp_v1_devis_totaux_par_instruction` (13 assertions : déclencheurs,
insertion / modification / suppression groupées, instruction à vide, remise globale) et
`gp_v1_devis_v2_enregistrement_security_definer` (10 assertions : mode, `search_path`, privilèges, A enregistre,
B ne peut ni réécrire le devis de A, ni se faire passer pour A, ni viser un client de A ; devis de A intact).

**Hors périmètre, documenté** : les politiques RLS elles-mêmes ne sont pas touchées (backlog plateforme,
décision de Julien) ; l'autosauvegarde continue de réessayer après une erreur non liée à un conflit (à
revoir : repli explicite après N échecs).

## 32. Autosauvegarde — brouillon invalide et erreurs durables (phase 3/13)

**Constat 1** : le devis de recette « 100 lignes » (`797529fd`) ne s'enregistrait plus du tout — ni
autosauvegarde, ni requête — sans autre indication que « Modifications non enregistrées ». Cause : son
ouvrage « Cloison plaques de plâtre 72/48 » n'a plus aucun composant (données de recette), donc
`validerBrouillon` refuse le brouillon ; l'autosauvegarde abandonnait **en silence** (le motif n'apparaissait
qu'en cliquant « Enregistrer et fermer »). Un utilisateur pouvait croire son travail sauvegardé.

**Constat 2** : après une erreur du serveur (dépassement de délai 57014 avant 292/293), l'autosauvegarde
**réessayait toutes les 12 s** avec la même charge (535 Ko), indéfiniment.

**Correctif** (`EditeurDevisV2.tsx`) : le motif d'un brouillon invalide est affiché dans l'état
d'enregistrement (« Non enregistré — « Cloison … » : l'ouvrage n'a plus aucun composant. ») ; après une
erreur (serveur, invalide), **aucune nouvelle tentative automatique tant que rien ne change** ; la
modification suivante (saisie, annuler, rétablir, en-tête) efface l'erreur simple et relance le cycle ; un
conflit de révision exige toujours un rechargement (inchangé). Typecheck 0, lint 0, 357 tests devis verts,
banc et E2E rejoués (§ 27).

## 33. Synthèse de la session autonome (2026-09-13, 12:15 → 16:00)

| Commit | Objet |
| --- | --- |
| `1bc1f23` … `766d8fb` | presse-papier de lignes (module, grille, éditeur, banc, migration 291, E2E 16-17), rehearsal, planning, runbook |
| `cc8fcc3` | le premier enregistrement d'un devis neuf ne touche plus à l'adresse |
| `17f25a2` | **mises à jour de grille fonction de l'état le plus récent** (course de la validation différée) |
| `59541ef` | E2E 16-17 partent d'un brouillon dupliqué ; scénario 9 attend le statut serveur |
| `5cfcf1d` | **migration 292** : totaux de devis recalculés par instruction |
| `470b991` | **migration 293** : RPC d'enregistrement en SECURITY DEFINER avec gardes explicites |
| `d046b53` | autosauvegarde : motif d'un brouillon invalide affiché, plus de réessai automatique après erreur |

Preview : Supabase `pgvvpqyjziyapbbkydmc` au ledger **290 / `20260913000293`** ; Vercel alias de branche
reconstruit à chaque commit (dernier build : `d046b53`). **Production intouchée** : aucun lien, aucune
requête, aucune variable, aucun déploiement, aucun merge.

## 34. Durcissements finaux avant validation utilisateur (2026-09-13, 16:10 → )

### 34.1 Remises bornées (0 à 100 %) — `8054e92`

**Défaut** : la cellule de remise plafonnait en silence à 100 et, quand la valeur retenue ne changeait pas
(déjà 100), gardait le texte saisi « 101 » à l'écran ; un texte illisible restait affiché lui aussi.

**Correctif** : une seule fonction d'interprétation (`interpreterRemisePct`) pour toutes les saisies de
pourcentage — cellule de ligne, remise de section (« 12,5 % »), remise globale de l'en-tête, carte et dialogue
mobiles : 0 à 100 acceptés (virgule ou point, « % » toléré, vide = 0) ; au-delà de 100, négatif ou illisible :
**refus avec message** (« Remise « 101 » refusée : une remise ne peut pas dépasser 100 %. ») et **valeur
précédente rétablie**, au clavier comme au collage de texte. Le message paraît dans la zone de retour de
l'éditeur (`role=alert`). La validation serveur est inchangée (`validerBrouillon` avant envoi, bornes de la RPC et
contrainte `remise_ligne between 0 and 100` en base).

**Remise fixe** (ligne « Remise » avec un montant) : règle existante vérifiée — montant négatif, quantité 1,
sans plafond à 100 (une remise de 250 € sur une section de 2 000 € est légitime) ; un montant illisible est
refusé avec message. Aucun changement de règle métier.

**Cas limites** (banc `remise.banc.spec.ts` 2/2, unitaires 3 cas × 15 valeurs) :

| Saisie | Résultat |
| --- | --- |
| 0 · 0,01 · 50 · 99,99 · 100 | acceptées ; total HT 1 000 → 1 000,00 / 999,90 / 500,00 / 0,10 / 0,00 |
| 100,01 · 101 · 150 (collage) | refusées « ne peut pas dépasser 100 % », cellule et total rétablis (50 / 500,00) |
| −5 · −0,01 | refusées « ne peut pas être négative » |
| abc · 10a · « - » | refusées « n’est pas un pourcentage » |
| section « 150 % » / « 12,5 % » / « 250 » / « abc » | refusée / 1 750,00 / −250 € (fixe) / « n’est pas un montant » |
| remise globale « 101 » (frappe) | refusée, champ reste à 10, total 1 575,00 |

### 34.2 Données de recette — `2b9acb1`

Le devis « 100 lignes » portait un ouvrage sans composant (reste d'un script de diagnostic, référence
« DIAG A-… ») : brouillon invalide, message parasite. Sur la preview : ouvrage vide supprimé (1), devis renommés
« PERF 100 lignes » / « PERF 500 lignes ». Le seed du dépôt crée désormais ces deux devis de façon
reproductible (identifiants fixes, lignes générées, aucun ouvrage) et retire tout ouvrage sans composant de
l'entreprise de recette. Aucune règle métier assouplie : un ouvrage vide reste refusé.

### 34.3 Rejeu Devis V2 après correction (preview, build `2b9acb1` puis `8cea858`)

Script `recette-remise.mjs` (nouveau devis « REMISE BORNES ») : remise 100 → 0,00 € ; 50 → 500,00 € ; 100,01 /
101 / −5 / abc / **collage « 150 »** → refusés avec leur message, cellule et total rétablis ; remise de section
« 150 % » refusée, « 10 % » → 450,00 € ; sous-total inséré ; remise globale « 101 » refusée (champ à 10,
total 405,00 €) ; **effacer le champ = 0** (`8cea858`) ; ouvrage OUV-0001 inséré (4 lignes) ; enregistrement ;
fiche, impression A4 (200, remise et sous-total présents) et PDF (200, `application/pdf`, 41 Ko).

### 34.4 Non-régression copier/coller (preview, `recette-clipboard.mjs`)

Une ligne (mobile : « 1 ligne copiée ») ; plusieurs lignes (8 copiées / collées, 2 entre onglets) ; autre devis
(9 lignes, A inchangé) ; ouvrage (copié entier) ; **cross-tenant refusé** (« Ce presse-papier vient d’une autre
entreprise : collage refusé, rien n’a été créé. ») ; Conducteur sans coûts (`prixAchatHt` null, presse-papier
forgé collé sans coût, 0 ligne de coût en base) ; texte dans une cellule = collage de texte ; 10 / 100 / 500
lignes : copie 5 / 35 / 52 ms, collage 62 / 111 / 288 ms.

### 34.5 Gros devis (preview, après 292 / 293)

| Devis | Collage | Enregistrement après collage | Retour (Annuler le collage) |
| --- | --- | --- | --- |
| PERF 100 lignes → 200 | 129 ms | **2,9 s**, « Enregistré à » | 4,4 s |
| PERF 500 lignes → 1 000 | 409 ms | **4,0 s**, « Enregistré à » | 3,9 s |

Aucune erreur 57014, aucune boucle de réessai ; autosauvegarde et enregistrement explicite verts ; cohérent
avec les mesures du § 31 (4,1 s pour 1 000 lignes).

### 34.6 Planning — smoke (preview, `recette-phase6.mjs`, aucun développement)

400 évènements : blocs visibles en 6,0-6,2 s, déplacement clavier réaction 0,58 s / enregistrement 6,0 s ;
1 000 évènements : 7,1-7,9 s, réaction 0,9 s / enregistrement 10,9 s, vue jour 4,6 s. **Règle 24 h** : message
explicite « Ce salarié dépasserait 24 heures planifiées ce jour-là… » affiché dans le dialogue à chaque
dépassement (5 cas), sauvegarde refusée. Glisser-déposer scripté : « autre jour » suivi ; « autre salarié »
et le bloc « Réunion » non reproduits par le script (fragilité déjà notée au § 22) — laissé à la validation
manuelle de Julien (checklist § 35) ; le déplacement clavier persiste après rechargement (smoke).

### 34.7 Gate et preview finale

Typecheck 0 ; lint 0 erreur (7 avertissements préexistants dans le dépôt, le reste dans `.recette-tmp/` hors
dépôt) ; vitest complet 2 411 + 3 nouveaux verts (3 flakies connus `xlsx` / `stripe webhook` verts seuls) ;
banc 9/9 (remise 2, sauvegarde 2, presse-papier 5) — le banc historique `editeur-v2.banc.spec.ts` est rouge
depuis les décisions d'affichage antérieures (11/13 à `285983d` comme après, non compté dans le gate) ;
pgTAP inchangé (aucune migration nouvelle ; 2 313 ok au § 27) ; **E2E 17/17 sans retry** sur le code final
(deux passes ; une troisième passe lancée pendant le rebuild du banc, la relecture lint et les scripts preview a
vu le scénario 10 échouer une fois — bloc « E2E Pose » non trouvé sous charge —, verte au rejeu machine au repos) ;
`next build` 0 erreur ; verify:migrations 290 ; verify:secrets 1 964 fichiers ; `git diff --check` OK.
Preview (`8cea858`) : badge, encart démo sur `/login` (sans session), Devis V2, Planning V2, copier/coller,
remise > 100 refusée, devis de performance sans ouvrage vide et enregistrables.

## 35. Validation visuelle Julien — checklist

Preview : `https://elsatia-preview-git-feat-gp-v1-metier-d-467e36-julien-gregurec1.vercel.app` (badge « GP V1
PREVIEW »), compte `dirigeant.recette@elsatia-preview.invalid` (mot de passe transmis séparément) ; encart
« Accès démo » sur la page de connexion. Devis de recette : « DEVIS TEST V2 - VALIDATION VISUELLE » ; devis
« PERF 100 lignes » et « PERF 500 lignes » ; planning : semaine courante, semaine du 21/09 (400 évènements).
Chaque point est un **constat à cocher** ; l'esthétique (couleurs, densité, typographie) n'est pas tranchée
ici : noter ce qui gêne, sans obligation de justifier.

**Devis** (`/devis` → « DEVIS TEST V2 … » → Modifier)

- [ ] Grille pleine largeur par défaut ; « Aperçu A4 » ouvre l'aperçu à côté, « Masquer l'aperçu » le referme.
- [ ] Ordre des colonnes lisible pour un devis BTP (Type, Réf., Désignation, Réf. fab., Qté, U., Achat HT, Coef.,
      Marge €, PU HT, Rem. %, TVA, Total HT) ; « Colonnes… » permet de masquer / réordonner.
- [ ] Références internes visibles sur les articles (Réf.) et l'ouvrage (OUV-0001) ; recherche Ctrl+K par
      référence.
- [ ] Ouvrage : bouton « Ouvrage », recherche « OUV », « Insérer tout l'ouvrage » ; composants regroupés (↳),
      quantité principale, marge ; « Modifier » rouvre le dialogue.
- [ ] Copier/coller : clic sur la poignée ⋮⋮ (Maj pour une plage), Ctrl+C → « N lignes copiées », Ctrl+V →
      « N lignes ajoutées au devis », « Annuler le collage » ; collage dans un autre devis (nouveau devis →
      Coller) ; Ctrl+C / Ctrl+V dans une cellule reste du texte.
- [ ] Remise : cellule Rem. % accepte 0 à 100 ; « 101 » ou « -5 » → message rouge et valeur rétablie ; remise
      de section « 5 % » ou montant « 50 » ; remise globale de l'en-tête.
- [ ] Sous-total : « Insérer… → Sous-total » calcule la section ; se recalcule après collage / remise.
- [ ] Aperçu A4 : titres, sous-titres, ouvrage et composants, commentaire, remise, sous-total, totaux
      identiques à la grille.
- [ ] PDF : « Télécharger PDF » (fiche) → même contenu que l'aperçu, multi-pages sur « PERF 100 lignes ».
- [ ] Message d'erreur : brouillon invalide (ex. désignation vide) → « Non enregistré — … » sous les boutons ;
      « Enregistrer et fermer » affiche le motif ; après correction, « Enregistré à hh:mm ».

**Planning** (`/planning`)

- [ ] Vue semaine : jours, heures, blocs lisibles ; Jour / Semaine / Mois ; Par salarié / équipe / chantier.
- [ ] Lisibilité des blocs (titre, horaire, chantier, conflit signalé) sur 16 puis 400 évènements (semaine du
      21/09).
- [ ] Salariés : lignes par salarié, absences (congé) visibles, filtre.
- [ ] Évènements : « Nouvel évènement », détail (titre, type, statut, jour, début, fin, chantier), suppression.
- [ ] Drag & drop : déplacer un bloc vers un autre jour / salarié ; conflit ou absence signalés ; clavier :
      Tab → bloc, Entrée → détail, Ctrl+flèches → ± 15 min.
- [ ] Règle 24 h : un salarié ne peut pas dépasser 24 h planifiées par jour ; message explicite dans le dialogue.
- [ ] Vitesse perçue : semaine courante (< 4 s), semaine du 21/09 avec 400 évènements (4 à 7 s), réaction
      d'un déplacement (< 1 s) — noter si c'est acceptable pour l'usage quotidien.

**Décisions attendues de Julien** : validation ou remarques point par point ; autorisation explicite (ou non)
de la mise en Production selon le runbook ; choix esthétiques éventuels pour un lot ultérieur.

## 36. Refonte UX utilisateur Julien (2026-09-13, 17:30 → )

Verdict utilisateur de départ : **PAS OK** — produit fonctionnel, ergonomie trop éloignée de la logique
Batappli. Priorité : ergonomie métier, rapidité, souplesse, visuel du devis. Travail sur la branche,
le local et la preview uniquement ; Production intouchée.

### 36.1 Phase A — audit Batappli vs existant (synthèse)

| Sujet | Existant au départ | Écart | Décision |
| --- | --- | --- | --- |
| Édition du devis | grille cellule par cellule ; aperçu A4 à la demande | pas de vue « document » éditable, barre d'outils dispersée (3 boutons + `Insérer…`), aucun menu contextuel | modes Grille / Document, toolbar regroupée, menu de ligne |
| Client / chantier | sélecteurs alimentés par la base ; création inline seulement dans l'éditeur historique v1 | l'éditeur v2 obligeait Devis → Clients → Nouveau → retour | dialogues « + Client » / « + Chantier » |
| Unités | 7 valeurs (`u m² ml h forfait kg L`), saisie libre sans suggestion en grille | liste métier incomplète | 22 unités métier + saisie libre conservée |
| Remise de ligne | `Rem. %` en grille, net porté par « Total HT » seulement | pas de PU net visible | colonne « PU net » + net sous le PU sur l'A4 |
| Numérotation | `DEV-AAAA-NNN` codé en dur dans les déclencheurs ; références internes configurables (283) | préfixe obligatoire, aucun réglage documents | migration 294 + Paramètres > Numérotation |
| Texte | `text` brut, aucun formatage, aucune bibliothèque | gras / italique / couleur impossibles | format interne balisé à liste blanche (§ 36.7) |
| Navigation | pas d'en-tête partagé ; planning v2 et deux sous-pages Paramètres sans sortie ; aucune garde de saisie | perte silencieuse possible | `EnTetePage`, bouton Retour de l'éditeur, `GardeModifications` |
| Planning | panneau latéral fixe de 12 actions (`lg:pr-72`) | jugé lourd | menu contextuel + « Actions ▾ » + « Nouvel évènement » |
| Paramètres | 12 écrans ; devis : aucun défaut (validité, conditions, paiement, unité, TVA) ; pas de rappel | matrice § 36.11 | migration 295 + Paramètres > Devis |
| Compte de recette | 4 clients, 4 chantiers, 12 articles, 2 ouvrages, 8 salariés, 2 devis brouillon, 0 facture, abonnement 1 an | données insuffisantes | seed démo complète (§ 36.2) |

### 36.2 Phase B — compte de recette complet (`96ea433`)

Entreprise **ELSATIA Recette V2** (offre Pro, abonnement actif jusqu'au **31/01/2028**, compte
`dirigeant.recette@elsatia-preview.invalid` = Dirigeant, tous droits fonctionnels sauf mode compte dépôt),
bouton « Ouvrir la démo GP V1 » de la page de connexion → ce compte. Seed idempotent
`docs/gp-v1/preview/seed-recette-demo-complete.sql` (à jouer après le seed de base ; rejoué deux fois en
local, mêmes volumes ; appliqué sur la preview) : 16 clients (particuliers, professionnels, collectivité,
promoteur, syndic) avec 13 contacts, 12 chantiers (prospect → terminé), 6 fournisseurs / sous-traitants,
60 articles sur 10 familles avec coûts d'achat, 10 ouvrages composés avec coûts, 12 salariés et 2 équipes,
3 ressources, 9 devis démo (3 brouillons, 2 envoyés, 3 acceptés, 1 refusé ; titres, articles du catalogue,
remise de ligne, sous-totaux ; numérotés par la base), 3 factures issues des devis acceptés (brouillon,
envoyée, payée), 18 évènements sur la semaine courante.

### 36.3 Phase C — création client / chantier inline (`c8b90a5`)

« + Client » à côté du champ Client : type, raison sociale ou nom / prénom, adresse, code postal, ville,
téléphone, e-mail, SIRET et contact pour un professionnel ; création par l'action existante (statut
prospect, droit `gerer_clients`), affectation immédiate au brouillon, message « Client « … » créé et affecté
au devis ». « + Chantier » : client prérempli, adresse reprise du client, rattachement immédiat. Le
brouillon reste en mémoire : aucune navigation, rien de perdu. Banc `tiers-inline` (création, affectation,
préremplissage, refus du serveur).

### 36.4 Phase D — unités (`78e47ad`)

`src/lib/unites.ts` : unité, pièce, paire, ensemble, lot, m, ml, m², m³, litre, kg, g, tonne, heure, jour,
forfait, boîte, rouleau, palette, sac, plaque, panneau — suggestions (`datalist` avec libellés longs) dans la
cellule Unité de la grille et la carte mobile, saisie libre conservée (unité personnalisée stockée telle
quelle, colonne `text`). Les clés historiques sont inchangées ; les éditeurs v1 et le schéma IA lisent la
même liste. Aucune contrainte base n'existait ni n'est ajoutée (audit § 36.1).

### 36.5 Phase E — remise de ligne (`78e47ad`)

Colonne calculée **PU net** (prix unitaire après remise de ligne) entre Rem. % et TVA, visible par défaut ;
A4 / PDF : « remise −5 % → 95,00 € » sous le PU ; le total de ligne reste le net. Remise de section (« 5 % »
dans la cellule PU d'une ligne Remise) et remise fixe (montant) inchangées et distinctes de la remise globale
de l'en-tête. Remise en valeur par ligne : le modèle (`remise_ligne` en %) ne la porte pas ; non implémentée,
documentée.

### 36.6 Phase F — numérotation configurable, préfixe facultatif (`fa82faa`, migration 294)

Table `numerotation_documents` (devis, facture, avoir, commande) : préfixe **facultatif** (`DEV-2026-00125`
ou `00125`), année et mois facultatifs, séparateur `-` / `/` / aucun, largeur 1 à 8, remise à zéro annuelle.
Attribution toujours **en base**, à la première sortie du brouillon, par les mêmes déclencheurs, via un
compteur atomique par entreprise et par nature (`on conflict do update`) et `unique (entreprise_id,
numero)` : deux devis simultanés ne partagent jamais un numéro ; aucune renumérotation ; sans réglage,
format identique à l'historique (avoirs sur la séquence des factures sauf réglage propre). Fonction
d'aperçu du prochain numéro sans consommation (membres). Paramètres > Numérotation : préfixe, année, mois,
séparateur, chiffres, remise annuelle, aperçu immédiat, prochain numéro. pgTAP 25/25 ; miroir TS 4 tests.

### 36.7 Phase G — texte riche (`8785262`)

Format interne structuré et sûr (pas de HTML) : balises à liste blanche `[b] [i] [u] [h] [c=couleur]` dans les
colonnes `text` existantes ; tout le reste (balise inconnue, couleur hors palette, fermeture orpheline, HTML
saisi) reste du texte littéral, jamais un caractère perdu. Rendu = `<span>` React avec styles calculés →
**même formatage** dans l'éditeur (aperçu), la lecture, l'impression A4, le PDF (Chromium sur la même
page) et la pièce jointe e-mail ; pagination sur le texte brut. Palette : accent et couleur principale de
l'entreprise + rouge, vert, bleu, orange, gris (pas de HEX libre). Barre de formatage sur la sélection du
champ actif (désignation, description, texte des titres / commentaires, conditions, notes) : boutons ou
Ctrl+B / I / U, surlignage, couleur. Champs concernés : désignation (texte simple conservé si aucune
balise), description, titre, sous-titre, commentaire, conditions, notes client. Tests unitaires (parseur,
sûreté, bascule) et banc `texte-riche` (éditeur → A4, HTML rendu en texte).

### 36.8 Phase H — retour / quitter, modifications non enregistrées (`fac04f4`)

`EnTetePage` partagé (retour, titre, sous-titre, actions) ; bouton « ← Retour » dans l'éditeur ; sorties
ajoutées au planning et aux pages Sécurité / Mes données. `GardeModifications` : fermeture / rechargement
du navigateur → avertissement natif ; toute navigation interne (lien, barre latérale, bouton retour mobile,
bouton Retour) interceptée : **« Des modifications ne sont pas enregistrées. »** avec Enregistrer et quitter
/ Quitter sans enregistrer / Annuler. Banc `garde` (3 choix + interception d'un lien).

### 36.9 Phase I — barre d'outils devis et menu contextuel de ligne (`b830495`)

Toolbar : **Ajouter ▾** (ligne libre, article Ctrl+K, ouvrage, titre, sous-titre, commentaire, sous-total,
remise, ligne vide, séparateur, saut de page), Copier, Coller, Dupliquer, **Plus ▾** (position de collage,
colonnes), Grille / Document, Aperçu A4, PDF, Envoyer…, Enregistrer et fermer. Menu de ligne (clic droit,
bouton ⋯ près de la poignée, Maj+F10) : insérer au-dessus / en dessous, titre au-dessus, dupliquer, copier,
coller après, transformer en (tout type), supprimer. Menus natifs (`role=menu`, clavier), positionnés en
coordonnées de fenêtre. Banc `menu-ligne`.

### 36.10 Phase J — planning sans grand panneau (`ce36c8b`)

Panneau latéral retiré (pleine largeur). Clic = sélection, double clic = modifier, glisser = déplacer,
Alt+glisser = dupliquer (inchangés) ; clic droit / bouton ⋯ du bloc sélectionné / Maj+F10 → menu :
modifier, dupliquer, affecter une équipe ou un salarié, ouvrir le chantier, ouvrir le client, historique,
imprimer, supprimer (droits et motifs du registre existant). Barre : Aujourd'hui, ‹ ›, date, 8 vues,
recherche, filtres, zoom (jour), **Nouvel évènement**, **Actions ▾** (tactile), Imprimer, PDF. En-tête avec
retour « Tableau de bord ». Tests statiques adaptés.

### 36.11 Phase K — paramètres (`8b60070`, migration 295) et audit

| Réglage | Existe | Partiel | Absent | Recommandation / fait |
| --- | --- | --- | --- | --- |
| Numérotation des documents | — | — | ✗ → **fait** (294) | préfixe facultatif, année, mois, séparateur, largeur, remise annuelle |
| Préfixes | références internes (283) | | | + documents (294) |
| Unités | | liste figée | | liste métier + unité par défaut (295) |
| TVA | | ligne à ligne | | TVA par défaut des lignes (295) |
| Remises | remise globale / ligne / section par document | | défaut entreprise | non nécessaire (pas de remise « automatique ») |
| Devis (défauts) | | modèles de devis | validité, conditions, paiement | **fait** (295) |
| Factures (défauts) | | | ✗ | à traiter dans un lot factures (hors périmètre devis) |
| Conditions | par devis | | | conditions par défaut (295) |
| Validité devis | date manuelle | | | durée par défaut (295) |
| Paiement | par document / tiers | | | mode + conditions par défaut (295) |
| Mentions, texte légal (CGV), pied de page, en-tête | ✓ | | | conservés |
| Signatures | | bloc « Bon pour accord » imprimé d'office ; module e-signature « à venir » | | inchangé (lot dédié) |
| Affichage coûts / marges | permissions + seuil de marque | | | conservé (droits) |
| Références (impression) | ✓ | | | conservé |
| PDF (modèle), logo, couleurs, police, taille, descriptions, TVA par ligne, filigranes | ✓ | | | conservés |
| Colonnes | réglage local (navigateur) | ordre / largeur | | visibles / masquées par navigateur (inchangé) ; ordre et largeur : § 36.15 |
| Arrondis | | | ✗ (centime fixe) | non recommandé (règle comptable) |
| Devise | | | ✗ (EUR) | non recommandé en V1 |
| Formats de date | | | ✗ (JJ/MM/AAAA) | non recommandé en V1 |
| Modèle e-mail | ✓ | | | conservé |
| Pages / pagination | | | ✗ (A4 calculé) | non recommandé (pagination automatique fiable) |
| Affichage ouvrages / composants | par instance (4 modes) | défaut entreprise | | à étudier après validation |
| **Sauvegarde : rappel** | — | — | ✗ → **fait** (295) | activé / fréquence 2-5-10-15-30 / personnalisé, 10 min recommandé, surcharge personnelle |

Paramètres > Devis : validité (jours), unité et TVA par défaut des lignes, conditions, mode et conditions de
paiement — repris par tout nouveau devis (date de validité = émission + N, nouvelles lignes) ; section
**Sauvegarde** : rappel activé, fréquence, préférence personnelle (ce navigateur). Propres à l'entreprise
(RLS ; pgTAP 10/10).

**Rappel de sauvegarde** : bandeau non bloquant « Sauvegarder le devis ? — Des modifications ont été
apportées depuis la dernière sauvegarde. » avec Sauvegarder maintenant / Plus tard / Ne plus me le rappeler
pour ce devis. N'apparaît que si le devis est modifié et qu'aucune sauvegarde n'a réussi depuis la référence
(dernière sauvegarde réussie, dernier rappel ou « Plus tard ») ; compteur remis à zéro par toute sauvegarde
**réussie** (manuelle, autosauvegarde, « Sauvegarder maintenant »), jamais par un échec ; le rappel n'écrit
jamais (aucune double écriture ni conflit avec l'autosauvegarde technique, inchangée) ; la garde de
navigation reste prioritaire. Décision pure testée (8 cas : désactivé, 2/5/10/15/30 et personnalisé,
inchangé, modifié, réussite, échec, autosave, plusieurs modifications, « Plus tard », opt-out) ; banc
`rappel` (bandeau, échec/réussite, Plus tard, opt-out, mobile, deux onglets).

### 36.12 Phase L — modes Grille / Document (`dd26ee2`)

Grand écran : **Grille** (tableau rapide, aperçu A4 optionnel à côté) ou **Document** (le devis tel qu'il
sera imprimé, pleine largeur ; clic sur une ligne → fiche de la ligne, clic sur un ouvrage → son dialogue ;
toolbar disponible). Préférence mémorisée par navigateur ; défaut = Grille tant que Julien n'a pas tranché
(les deux à tester sur le compte de recette). Sous 1 024 px : onglets Saisie / Aperçu inchangés. Banc
`mode-document`.

### 36.13 Phase M — cohérence A4 / PDF

Un seul composant (`DocumentA4`) sert l'aperçu, l'impression, le PDF et l'e-mail : texte riche, PU net après
remise, unités, remises de section et globale y sont rendus à l'identique (E2E 47 : `font-weight:700` et
`text-decoration:underline` présents dans la page d'impression, PDF 200).

### 36.14 Checklist — chaque exigence du prompt de Julien

| # | Exigence Julien | Statut | Preuve |
| --- | --- | --- | --- |
| 1 | Devis = grille / feuille directement éditable (voir, modifier, ajouter, supprimer, déplacer, formater, unités, remises, prix, textes, sous-totaux, titres, commentaires, articles, ouvrages) sans quitter le visuel | ✅ | grille v2 + menu de ligne + Ajouter ▾ + barre de formatage ; banc `menu-ligne`, `texte-riche` ; E2E 47 |
| 2 | Vue principale proche du devis final, éditeur type document / tableur, colonnes selon droits | ✅ | mode Document (§ 36.12), colonnes sensibles retirées sans droit (§ 23) |
| 3 | Aperçu PDF / A4 immédiat, bascule grille ↔ document, pas de gros panneau latéral permanent | ✅ | boutons Grille / Document / Aperçu A4 ; aperçu masqué par défaut |
| 4 | Panneau latéral d'actions à revoir (menu contextuel, toolbar, clic droit, boutons dans la ligne, double clic) | ✅ devis et planning | § 36.9, § 36.10 ; fiches (client, chantier, facture…) : panneau conservé, § 36.15 |
| 5 | Création client depuis le devis (nom, adresse, téléphone, e-mail, SIRET, contact) → affecté | ✅ | § 36.3 ; banc `tiers-inline` ; E2E 47 |
| 6 | Création chantier depuis le devis, client prérempli, retour immédiat | ✅ | idem |
| 7 | Unités — liste complète, choix simple dans la cellule, unité personnalisée | ✅ | § 36.4 |
| 8 | Remise par ligne en %, calcul visible (PU, Rem. %, PU net), remise globale indépendante | ✅ (remise en valeur par ligne : non supportée par le modèle) | § 36.5 ; E2E 39 |
| 9 | Remise section / fixe / globale claires | ✅ | remise « 5 % » vs montant dans la cellule PU ; remise globale en-tête ; banc `remise` |
| 10 | Référence interne visible, préfixe NON obligatoire | ✅ | § 36.6 ; pgTAP (B sans préfixe) ; E2E 49 |
| 11 | Paramètres > Numérotation (devis, factures, avoirs, commandes ; préfixe, année, mois, séparateur, largeur, prochain numéro, aperçu) | ✅ | `/parametres/numerotation` |
| 12 | Numérotation sécurisée (unicité, audit, séquence, concurrence, backend autoritaire) | ✅ | compteur atomique + contrainte unique + déclencheurs ; pgTAP 25 |
| 13 | Mise en forme : gras, italique, souligné, couleur (+ surlignage) | ✅ (alignement, listes : non) | § 36.7 |
| 14 | Éditeur riche : format structuré sûr, pas de HTML arbitraire, sanitization | ✅ | balises à liste blanche, rendu en nœuds React, tests de sûreté |
| 15 | Champs : description, commentaire, titre, sous-titre, conditions, texte libre ; désignation étudiée | ✅ (désignation : texte simple si aucune balise) | § 36.7 |
| 16 | Formatage respecté en lecture, A4, PDF, impression, e-mail | ✅ | un seul composant de rendu ; E2E 47 (impression / PDF) |
| 17 | Couleurs raisonnables : palette + couleurs entreprise, HEX non ouvert | ✅ | palette de 7 (accent, principale, 5 standard) |
| 18 | Audit complet des paramètres (matrice) | ✅ | § 36.11 |
| 19 | Paramètres propres à l'entreprise | ✅ | tables par `entreprise_id`, RLS ; pgTAP |
| 20 | Retour / quitter sur toutes les pages métier | ✅ | § 36.8 (fiches déjà pourvues ; planning, paramètres, éditeur ajoutés) |
| 21 | Modifications non enregistrées : Enregistrer et quitter / Quitter sans enregistrer / Annuler | ✅ | banc `garde` ; E2E 47, 51 |
| 22 | Plus de comptes expirés / vides : compte de recette stable | ✅ | § 36.2 |
| 23 | Compte Julien : entreprise, plan Pro, actif ≥ fin 2027, Dirigeant, tous droits | ✅ | échéance 31/01/2028, dirigeant.recette |
| 24 | Données de démo (clients 10-20, chantiers 10+, contacts, articles 50+, ouvrages 10+, devis 4 états, factures, employés 10+, planning, fournisseurs, prestations, matériel) | ✅ (matériel = ressources planning ; table matériel inexistante) | § 36.2 |
| 25 | Aucune expiration, abonnement stable documenté | ✅ | seed + § 36.2 |
| 26 | Bouton démo → compte complet | ✅ | `/login` « Ouvrir la démo GP V1 » → dirigeant.recette |
| 27 | Planning : clic, double clic, drag, Alt+drag, clic droit / menu (modifier, dupliquer, affecter, supprimer, chantier, client, imprimer) | ✅ | § 36.10 ; E2E 48 |
| 28 | Planning : barre (aujourd'hui, ‹ ›, vues, filtres, nouvel évènement, imprimer), pas de panneau permanent | ✅ | idem |
| 29 | Toolbar devis cohérente, menus regroupés | ✅ | § 36.9 |
| 30 | Menu contextuel ligne (insérer au-dessus / dessous, dupliquer, copier, supprimer, transformer) | ✅ | banc `menu-ligne` |
| 31 | Colonnes (référence, désignation, description, unité, quantité, prix achat si autorisé, coefficient / marge, PV HT, remise, TVA, total HT), largeur | ✅ colonnes · ⚠ largeur fixe | § 36.15 |
| 32 | Personnalisation colonnes (afficher / masquer, ordre, largeur), coûts soumis aux droits | ⚠ afficher / masquer seulement (réglage navigateur) | § 36.15 |
| 33 | Mode « Document » (proche du PDF, édition dans la mise en page) sans casser la grille | ✅ | § 36.12 |
| 34 | Mode « Grille » conservé, préférence mémorisée par utilisateur | ✅ (par navigateur) | idem |
| 35 | Mode par défaut : les deux testés, pas de décision imposée | ✅ | défaut Grille, à trancher par Julien |
| 36 | Test création client inline (devis → client absent → créer → sélection auto → brouillon intact) | ✅ | banc `tiers-inline` ; E2E 47 |
| 37 | Test unités (éditeur, lecture, PDF, facture si transformation) | ✅ éditeur / lecture / PDF (m²) ; facture : lignes recopiées (§ 25) | E2E 47 |
| 38 | Test texte riche sur la phrase « Cloison vitrée bord à bord avec porte toute hauteur » (gras, souligné, italique, accent) → A4 / PDF | ✅ | E2E 47, banc `texte-riche` |
| 39 | Test remises 0, 5, 25, 100 | ✅ | E2E 39 (PU net 100 / 95 / 75 / 0, totaux) |
| 40 | Paramètres : implémenter les réglages raisonnables, pas de réglages fictifs | ✅ | 294, 295 |
| 41 | Navigation retour cohérente (composant partagé) | ✅ | `EnTetePage`, `GardeModifications` |
| 42 | Compte recette : seed idempotent, preview seulement | ✅ | § 36.2 |
| 43 | Aucune Production | ✅ | aucun lien ni déploiement |
| 44 | Session autonome longue, minutieuse | ✅ | phases A → O |
| 45 | Ordre de travail A → O | ✅ | sections 36.1 → 36.16 |
| 46 | Tests unitaires, SQL, E2E, non-régression | ✅ | § 36.16 |
| 47 | E2E devis (18 étapes) | ✅ | `tests/e2e/gp-v1-ux.spec.ts` scénario 47 |
| 48 | E2E planning (9 étapes) | ✅ | scénario 48 |
| 49 | E2E numérotation A / B | ✅ | scénario 49 |
| 50 | E2E texte riche (éditeur = lecture = A4 = PDF) | ✅ | scénario 47 (partie 11-15) |
| 51 | Mobile (devis, toolbar, client inline, retour, planning) | ✅ | scénario 51 ; banc `rappel` mobile |
| 52 | Performance 100 / 500 / 1 000 lignes, planning 400 | ✅ | § 36.17 (preview : 41 / 51 / 70 ms frappe → totaux ; planning 400 évts 5,8 s, 1 000 évts 7,8 s) |
| 53 | Documentation : section + checklist | ✅ | § 36 |
| 54 | Rapport final | ✅ | message de fin de session |
| — | Rappel de sauvegarde (nouvelle exigence) | ✅ | § 36.11 ; banc `rappel` ; 8 tests unitaires ; pgTAP 295 |

### 36.15 Écarts assumés et suites

- **Colonnes : ordre et largeur** non réglables (ordre canonique, largeurs fixes par colonne, réglage
  visible / masqué par navigateur) — lot suivant : préférences par utilisateur en base (ordre, largeur).
- **Remise en valeur par ligne** : le modèle porte un pourcentage ; une remise en euros se fait par une
  ligne « Remise » (montant) dans la section.
- **Alignement et listes** dans le texte riche : non couverts (gras, italique, souligné, surlignage, couleur
  livrés).
- **Panneau d'actions des fiches** (client, chantier, facture, fournisseur…) : conservé tel quel ; seuls le
  devis et le planning ont été revus — à étendre après validation si Julien le souhaite.
- **Banc historique `editeur-v2.banc.spec.ts`** : toujours rouge (11/13) pour des raisons antérieures
  (aperçu masqué par défaut, libellés) ; hors gate ; à réécrire.

### 36.16 Phase N — tests et non-régression (`5be19e3`, machine au repos)

| Contrôle | Résultat | Détail |
| --- | --- | --- |
| pgTAP, base **Fresh** au ledger 295 | 83 fichiers, **2 343 ok, 0 not ok** | harnais `train-v3-dbtest` ; upgrade 291 → 295 = schéma identique (8 lignes = jeton `\restrict` du dump) |
| Vitest complet | **2 433 réussis**, 3 ignorés, 4 délais dépassés sous charge | `xlsx`, `stripe webhook` ×2, `stripe-discount-legacy-surface` : dépassement des 5 s pendant que la gate E2E tournait ; rejoués 3 fois seuls et sur HEAD : **8/8 verts** — sans rapport avec le lot |
| Typecheck / lint | 0 erreur / 0 erreur (48 avertissements préexistants) | `tsc --noEmit`, `eslint` |
| `verify:migrations` / `verify:secrets` / `git diff --check` | 292 migrations valides · 1 996 fichiers, aucun secret · propre | — |
| Banc de l'éditeur (`tests/banc/editeur-v2`, `file://`, Chromium) | **18/18** en une passe, sans nouvel essai | garde, menu de ligne, mode document, presse-papier ×5, rappel ×4, remise ×2, sauvegarde ×2, texte riche, tiers inline |
| E2E pile jetable (`gp-v1-metier.spec.ts`) | **17/17** en une passe, sans nouvel essai | build `next build` E2E puis `next start`, Kong 60321, base `gpv1_jetable` (migrations 294/295 appliquées) |
| E2E UX (`gp-v1-ux.spec.ts`, nouveau) | **5/5** en une passe | 47 devis complet (client + chantier inline, titre, ouvrage, article m², remise 5 %, texte riche, sous-total, copier/coller, A4, Document, enregistrer, lecture, PDF, page d'impression, retour + garde) · 39 remises 0/5/25/100 (PU net 100/95/75/0, totaux 1 200/1 140/900/0) · 48 planning (nouvel évènement, double clic, glisser, Alt+glisser, menu contextuel, chantier, retour, imprimer, aucun `aside`) · 49 numérotation A « DEV-2026-… » / B « 00001 » consécutifs, uniques · 51 mobile 390 px |

**Défauts trouvés par la gate et corrigés** (`5be19e3`) :

1. **Bouton flottant « Rechercher Ctrl+K » sur « Enregistrer et fermer »** — depuis que le lien « ← Devis »
   est porté par l'éditeur, l'en-tête est remonté d'une ligne et le bouton flottant (`fixed`, haut droite,
   affiché dès `md`) recouvrait exactement le bouton d'enregistrement à 1 280 px : Playwright cliquait la
   recherche (scénario 4 en échec, `button` « visible, enabled » mais interceptée) — un utilisateur aussi.
   Correction : bouton masqué tant que l'éditeur est ouvert (`body[data-editeur-devis]`), entrée
   « Recherche globale… Ctrl+Maj+K » dans le menu Plus de l'éditeur.
2. **Mode consultation du planning** — `.lecture-seule` (pilote mobile, « Mode consultation ») masque tous
   les `button[type=button]` du `main` pour un utilisateur sans droit d'écriture : un chef d'équipe ne
   pouvait plus changer de jour ni de vue (‹ › Aujourd'hui, onglets) — défaut préexistant, révélé par le
   retrait du panneau. Correction : barres de navigation / filtres / menu Actions marquées
   `data-consultation` (boutons conservés, actions d'écriture grisées avec motif) ; « Nouvel évènement »
   reste visible, grisé et expliqué sans `gerer_planning` (principe des fiches, scénario 13).
3. **Recherche d'ouvrage E2E** : « a » ne correspond à aucun ouvrage de la pile (`normaliser_reference`
   n'indexe pas les lettres isolées) — le scénario cherche « Cloison ».
4. **Cellules calculées** (PU net, total HT) : exposées en `data-lecture="i:colonne"` (elles ne sont pas
   des cellules de saisie).
5. **Style sérialisé** : le rendu serveur écrit `font-weight:700`, le client `font-weight: 700` — les
   assertions du texte riche lisent le **style calculé** (`toHaveCSS`) et l'accent est vérifié comme couleur
   différente du texte courant (couleur d'entreprise variable).
6. Deux `getByLabel` ambigus (« Chantier » ⊂ options du type ; « Année » ⊂ « Repart à 1 chaque année »),
   `getByRole("status")` doublé par le badge preview.

**Environnement** : le poste portait deux conteneurs `supabase_analytics` (Logflare) à 210 % CPU chacun
(charge 12 ; scénario 2 à 47 s, connexions en délai, PDF 502 par dépassement des 30 s de navigation Chromium).
Arrêtés (`docker stop`, réversible) : charge 2,7, PDF 6-11 s, suite complète 1,8 min. À noter pour toute
recette locale : **vérifier `docker stats` avant d'imputer un délai à l'application.**

### 36.17 Phase O — preview finale (`0b607d1`, alias de branche, 2026-09-14 01:40, Chromium 1440 × 900 / iPhone 13)

Déploiement Vercel `elsatia-preview-a2l58bdvl` (Ready, sert `0b607d1`) ; base preview inchangée (ledger
`20260913000295`, seed complet du compte de recette). Script `.recette-tmp/recette-ux-finale.mjs` (hors
dépôt), journal et 17 captures dans `docs/gp-v1/preview/captures/ux/`.

| Écran | Constat | Capture |
| --- | --- | --- |
| Nouveau devis | bouton flottant « Rechercher » absent dans l'éditeur ; « ← Retour aux devis » ; Ajouter ▾ (libre, article, ouvrage, titre, sous-titre, commentaire, sous-total, remise, vide, séparateur, saut de page) ; Copier / Coller / Dupliquer / Plus ▾ ; Grille · Document ; Aperçu A4 | 01, 02, 04 |
| Ligne : remise 10 % sur 2 × 100 € | PU net **90,00 €**, total **180,00 €** ; menu contextuel (au-dessus, en dessous, titre au-dessus, dupliquer, copier, coller, transformer en …, supprimer) | 03 |
| Mode Document | grille masquée, document cliquable, totaux, barre de formatage | 05 |
| Retour avec modifications | « Sauvegarder avant de quitter ? » Annuler / Quitter sans enregistrer / Enregistrer et quitter → `/devis` | 06 |
| Paramètres > Devis / Numérotation / Paramètres | pages servies (4,3 s à froid / 2,2 s / 3,1 s) ; aperçus DEV-2026-001 → prochain DEV-2026-008, FAC-2026-003, CMD-2026-001 | 07, 08, 09 |
| Planning semaine (25 blocs) | sans panneau latéral ; « Nouvel évènement », « Actions · <évènement> ▾ », Imprimer, PDF ; clic droit = modifier, dupliquer, affecter, chantier, client, historique, imprimer, supprimer | 10, 11 |
| Mobile 390 px | Ajouter ▾ / retour / « + Client » présents ; planning : menu Actions, pas de panneau | 15, 16 |

**Performance mesurée (preview, réseau réel)** :

| Mesure | 100 lignes | 500 lignes | 1 000 lignes (1 001, nouveau devis) | Planning 400 évts (semaine 22/9) | Planning 1 000 évts (semaine 5/10) |
| --- | --- | --- | --- | --- | --- |
| TTFB / DOM / page utilisable | 1,7 s / 1,7 s / 2,9 s | 2,0 s / 2,0 s / 3,2 s | — | 4,3 s / 4,3 s / **5,8 s** (404 blocs, 532 Ko) | 5,6 s / 5,6 s / **7,8 s** (1 000 blocs, 1,1 Mo) |
| Cellules DOM (virtualisation) | 100 | **30** | **30** | — | — |
| Frappe → totaux | **41 ms** | **51 ms** | **70 ms** | — | — |
| Autosauvegarde après une modification | 2,9 s | 3,5 s | 3,7 s | — | — |
| Collage de 500 lignes (mémoire) | — | — | 80 ms puis 163 ms ; première sauvegarde des 1 001 lignes **3,9 s** | — | — |
| Bascule Grille → Document | 175 ms | 181 ms | — | — | — |

Le devis de 1 001 lignes (« PERF-1000-UX ») a été créé puis supprimé ; les devis de perf 100 et 500 lignes
existants sont conservés (une quantité modifiée à 7 sur la ligne 4 de chacun, sans incidence).

**Points relevés pour la validation visuelle** (non corrigés, décision Julien) :

- À 1 440 × 900, l'en-tête (références, client, dates, conditions, notes, filigrane) occupe tout l'écran :
  la barre d'outils et la grille arrivent sous le pli (capture 01). Piste : en-tête repliable ou réduit
  (client / chantier / dates), le reste dans un volet.
- Sur mobile, la bulle « Assistant » et le bouton d'aide flottants recouvrent par moments le bord droit
  du formulaire (bouton « + Client » selon le défilement, capture 15) — commun à toute l'application.
- Le bouton flottant « Rechercher Ctrl+K » reste affiché sur les autres écrans, en haut à droite, au-dessus
  d'une zone vide ; il n'est masqué que dans l'éditeur.

## 37. Polish UX final avant validation Julien (2026-09-14, session autonome)

Lot demandé par Julien après la refonte UX (§ 36) : « un dernier lot de polish UX objectif sans prendre de
décision esthétique à sa place ». Base `468f6db`. Aucune migration (aucun changement SQL cette session,
confirmé par `verify:migrations` = 292 migrations inchangées et pgTAP Fresh identique). Aucune décision
tranchée à la place de Julien : Grille/Document reste au choix, le mode par défaut n'a pas changé.

### 37.1 En-tête du devis repliable (exigences 1-4)

**Constat confirmé** : à 1440 × 900, l'en-tête occupait tout l'écran, la grille arrivait sous le pli
(mesuré à la capture 01 du § 36.17).

**Correctif** (`EditeurDevisV2.tsx`) : une barre TOUJOURS visible remplace la légende du bloc d'en-tête —
repliée, elle porte le résumé (référence, client, chantier, statut « Brouillon », total HT, total TTC,
indicateur de sauvegarde) et un bouton « Détails du devis ▾ » ; dépliée, le formulaire complet (client,
chantier, dates, commercial, validité, règlement, remise globale, conditions, notes, filigrane) reste
identique à avant. Le bouton « Enregistrer et fermer » et l'indicateur de sauvegarde vivent HORS de
l'en-tête (rangée du haut) : visibles dans les deux états, satisfaisant à eux seuls l'exigence 15.

Comportement automatique : un devis **nouveau** s'ouvre toujours développé, quelle que soit la préférence
mémorisée (jamais replié « de façon surprenante ») ; un devis **existant** respecte la préférence du
navigateur (`localStorage`, clé `gp.devis.entete.v1`, même mécanisme que le mode Grille/Document et le
rappel de sauvegarde déjà en place). Raccourci **Ctrl/Cmd+Maj+H** pour basculer, documenté au § 37.12.
Sur mobile et tablette (< 1024 px), le même mécanisme s'applique : à 768 px, l'en-tête replié laisse voir
la grille et le formulaire de saisie sans défiler (capture vérifiée). Aucun composant distinct créé pour
mobile — la demande « informations du devis ▾ en accordéon » est cette même barre, déjà responsive.

Vérifié en direct (navigateur, build de production) : nouveau devis développé ; ligne saisie (3 × 100 €) ;
repli → barre "Sans référence · UX Client · BROUILLON · HT 300,00 € · TTC 360,00 € · Enregistré à HH:MM" ;
Ctrl+Maj+H déplie puis replie ; enregistrement puis réouverture du devis → reste replié ; un AUTRE nouveau
devis reste développé malgré la préférence mémorisée. Couvert par le test E2E 60 (nouveau,
`tests/e2e/gp-v1-ux.spec.ts`), vert.

### 37.2 Grille / Document — aucun défaut tranché (exigences 5-6)

Les deux modes restent disponibles, mémorisés par navigateur (`gp.devis.mode.v1`, inchangé), instantanés
(bascule CSS, aucun remontage des composants : sélection, focus et défilement de la grille sont conservés
en changeant de mode — vérifié en manipulant une ligne, en basculant deux fois, puis en relisant sa
valeur). L'indicateur (paire de boutons contrastés, `aria-pressed`, groupe `aria-label="Mode de travail"`)
n'a pas été jugé ambigu à l'usage — aucun changement visuel apporté, conformément à la consigne de ne pas
trancher une préférence esthétique.

### 37.3 Mode Document — incohérence évidente corrigée (exigence 7)

**Défaut trouvé** : en mode Document, un bloc « Total HT / TVA / Total TTC » (celui de la grille)
s'affichait ENTRE la barre d'outils et le document A4 réel — qui affiche lui-même ses propres totaux, dans
son pied de tableau. Doublon pur, sans information supplémentaire, qui poussait le document (la vue
demandée par ce mode) plus bas. Corrigé : la section Totaux de la grille se masque désormais en mode
Document à partir de `lg:` (grand écran) ; elle reste visible sur mobile, où « Document » est un onglet
séparé (« Aperçu du document »), pas ce mode. Vérifié en direct : après bascule, le document A4 suit
immédiatement la barre de formatage, sans doublon. Aucun autre écart évident trouvé dans les marges, la
largeur A4 simulée, l'édition inline (clic sur une ligne du document → dialogue d'édition, inchangé), le
rendu des titres, sous-totaux, ouvrages et remises.

### 37.4 Mode Grille — polish (exigence 8)

Revue de la densité, l'alignement, la troncature, les info-bulles, la largeur des colonnes, le focus de
cellule, la ligne sélectionnée, le menu contextuel et les raccourcis (Ctrl+C/V/D, flèches, Échap, Ctrl+A) :
déjà conformes (héritage du lot précédent — sélection visible en bleu, menu contextuel avec motifs de
droits, cellules calculées désormais exposées en `data-lecture`). Aucune incohérence évidente trouvée ;
aucun changement.

### 37.5 Bulles flottantes — ne recouvrent plus rien (exigences 9-12)

**Défaut confirmé** : sur mobile, le bouton « Aide » (fixe, bas-droite) et la bulle « Assistant IA »
(fixe, au-dessus) restent à une position d'écran constante quelle que soit la page ; sur un formulaire
court (ex. le devis), ils coïncident en permanence avec un champ ou une action réelle (« + Client »,
constaté à la capture 15 du § 36.17) — pas seulement transitoirement au défilement.

**Correctif** : nouveau hook partagé `useZoneDense()` (`src/lib/ui-dense.ts`, compteur partagé pour des
zones denses imbriquées) posant `<body data-ui-dense="1">` tant qu'un composant dense est monté — câblé
sur l'éditeur de devis, l'éditeur de facture (`FactureEditor`), le planning (`PlanningV2`) et les deux
pages de réglages denses (Devis, Numérotation). Règle CSS (`mobile.css`, `@media max-width:767px`) :
les bulles marquées `.bulle-flottante` (Aide, lanceur de l'Assistant — pas le panneau ouvert, qui reste
utilisable) s'effacent tant que la zone dense est ouverte, et réapparaissent dès qu'on la quitte. L'aide
reste accessible autrement pendant ce temps : « Guide d'utilisation » dans le menu latéral (déjà présent),
sans changement nécessaire pour satisfaire l'exigence 12. Desktop non concerné (assez d'espace).

Vérifié en direct à 375 px : `data-ui-dense="1"` posé dans l'éditeur de devis et sur le planning,
`display:none` mesuré sur le bouton Aide ; sur la liste des devis (page non dense), `data-ui-dense` absent
et le bouton repasse en `display:flex`.

### 37.6 Zone de sécurité mobile (exigence 11)

Les deux bulles et le panneau ouvert de l'Assistant respectent désormais `env(safe-area-inset-bottom)` et
`env(safe-area-inset-right)` (même motif que `MobileBack`, qui les avait déjà). Le clavier virtuel n'est
pas testable en environnement automatisé sans IME réel ; les zones fixes n'ayant pas de comportement
spécifique au clavier (pas de `position:fixed` ancrée à une saisie), aucun changement supplémentaire jugé
nécessaire sans preuve d'un défaut réel.

### 37.7 Toolbar devis — revue finale (exigences 13-16)

Actions principales (Ajouter, Copier, Coller, Dupliquer, Aperçu A4, PDF, Envoyer) et secondaires (Plus ▾ :
position de collage, colonnes, recherche globale) inchangées — déjà correctement réparties. Testé à
1440, 1280 et 1024 px : la barre tient sur une ligne jusqu'à 1280 px inclus ; à 1024 px elle se répartit
sur deux lignes (`flex-wrap`), sans qu'aucune action sorte de l'écran. « Enregistrer et fermer » reste
hors de l'en-tête repliable, donc toujours visible et lisible (§ 37.1). Le rappel de sauvegarde (bandeau
ambre) n'a pas été déplacé : il s'affiche sous la barre de formatage, jamais derrière une modale (les
dialogues de l'éditeur sont natifs, au-dessus de tout) ni superposé à un message d'erreur (canaux distincts
— `erreur` en haut, rappel dans le flux).

### 37.8 Création client / chantier inline — audit (exigences 17-18)

Focus initial (`autoFocus`), validation (nom/raison sociale requis, message clair), erreurs serveur
affichées en `role="alert"`, bouton Annuler, sélection automatique du tiers créé dans le devis (`onCree`
met à jour `client_id`/`chantier_id` sans navigation), chantier préremplant l'adresse du client : déjà
conformes (lot précédent). Aucune perte de saisie du devis pendant l'échange (le brouillon reste en
mémoire). Aucun changement.

### 37.9 Unités (exigence 19)

22 unités métier, déjà accessibles par une recherche native (`<input list>` / `<datalist>`, filtrage au
fil de la frappe dans le navigateur) dans la grille et dans les réglages par défaut. Pas de menu déroulant
à défilement pénible. Aucun changement nécessaire.

### 37.10 Texte riche (exigences 20-22)

Gras/italique/souligné/surligné/couleur déjà couverts sur désignation (titre, sous-titre, commentaire,
article, ligne libre), description et conditions ; Ctrl/Cmd+B/I/U déjà actifs, limités aux champs marqués
`data-texte-riche`, sans conflit avec les raccourcis de la grille (vérifié par lecture du code : le
gestionnaire ignore tout champ non marqué). **Nouveauté de cette session** : avertissement de contraste
(`CouleurDocumentChamp.tsx`) sur les couleurs de marque (« Couleur principale », « Couleur d'accent » —
utilisées entre autres par `[c=accent]`/`[c=principale]` dans les devis) — calcul du contraste WCAG contre
un fond blanc, avertissement sous le sélecteur si le résultat est inférieur à 1,5:1. Vérifié en direct :
`#fefefe` déclenche l'avertissement, la couleur par défaut de l'application (`#c9a24a`, contraste ≈ 2,4:1)
n'en déclenche pas.

### 37.11 Navigation retour et modifications non enregistrées (exigences 23-24)

Audit des 8 zones nommées (Devis, Facture, Client, Chantier, Planning, Paramètres, Ouvrages, Articles) :
chaque fiche/formulaire porte un lien « ← Retour » ou « Fermer » cohérent (`grep` sur `src/app/(app)`,
aucune fiche des 8 zones sans ce lien). **Défaut trouvé** : l'éditeur de facture (`FactureEditor.tsx`)
n'avait AUCUNE garde de modifications non enregistrées — un clic sur « ← Facture » ou un lien de la barre
latérale perdait la saisie en silence, sans le moindre avertissement. Corrigé : réutilisation du composant
`GardeModifications` déjà éprouvé sur l'éditeur de devis (aucun nouveau design), `sale` dérivé par
comparaison à l'état initial (pas de drapeau à poser sur chaque champ). Vérifié en direct : modification →
clic sur « ← Facture » → dialogue « Sauvegarder avant de quitter ? » (Annuler / Quitter sans enregistrer /
Enregistrer et quitter).

**Défaut PRÉEXISTANT découvert en testant ce correctif** (§ 37.16, à faire valider par Julien) :
l'enregistrement d'une facture existante échoue actuellement avec « Impossible de créer cette facture »
— reproduit à l'identique via le bouton « Enregistrer les modifications » d'origine, donc indépendant de
la garde ajoutée. Cause exacte identifiée : `permission denied for function recalc_totaux_facture`
(journal serveur). La migration `20260902000255_acl_reconciliation_v1.sql` révoque `EXECUTE` sur
`public.recalc_totaux_facture` pour `authenticated` et `service_role` ; la migration
`20260912000282_gp_devis_v2_catalogue_ouvrages.sql` (ce train) la redéfinit (`create or replace`, ce qui
ne réattribue PAS les privilèges) et l'appelle depuis un déclencheur qui s'exécute avec les privilèges de
l'appelant. C'est très exactement la classe de défaut déjà répertoriée dans la mémoire de session
« service_role après la 255 » (12 flux cassés, correctifs déjà poussés sur deux branches jumelles) :
`recalc_totaux_facture` n'y figurait apparemment pas encore. **Aucune migration ajoutée dans ce lot** pour
rester majoritairement UX (consigne explicite) — le correctif (un `GRANT EXECUTE` ciblé, dans le même
esprit que les 12 flux déjà traités) est à faire dans le train de migrations, pas en polish UX isolé.

### 37.12 Aide clavier (exigence 3, documentation)

Raccourcis actifs dans l'éditeur de devis, tous déjà implémentés (sauf Ctrl+Maj+H, nouveau) : Ctrl+S
(enregistrer), Ctrl+Z / Ctrl+Y (annuler/rétablir), Ctrl+K (catalogue d'articles), Ctrl+Maj+K (recherche
globale, cédée par la palette dans l'éditeur), **Ctrl/Cmd+Maj+H (replier/déplier l'en-tête, nouveau)**,
Ctrl/Cmd+B/I/U dans un champ de texte riche. Non documentés avant cette session dans l'aide utilisateur ;
ajout recommandé dans une prochaine itération de la FAQ (`src/components/FaqAide.tsx`) — non fait ce tour
pour rester dans le périmètre code demandé (« ne code que ce qui est raisonnable dans ce lot »).

### 37.13 Planning — polish contextuel (exigences 25-29)

**État sans sélection** : déjà propre — pas de grand panneau vide (le panneau latéral permanent a été
retiré au lot précédent) ; le bouton « Actions » affiche un menu désactivé avec « Aucun évènement
sélectionné », expliqué par son `title`. Aucun changement.

**Découvrabilité** (défaut trouvé) : rien n'indiquait qu'un évènement se glisse (déplacer), s'Alt+glisse
(dupliquer) ou s'étire (durée) avant de l'avoir sélectionné une première fois. Ajout d'un bouton « ⓘ »
dans la barre d'outils (uniquement pour les postes avec droit d'écriture), avec l'explication complète en
info-bulle native, focusable au clavier.

**Toolbar** : Aujourd'hui / précédent / suivant / vues / filtres / Nouvel évènement / Imprimer déjà
responsive (`flex-wrap`), vérifié à 1440 et 375 px.

**Consultation** (défaut confirmé) : le mode `.lecture-seule` (support plateforme / pilote mobile)
masquait TOUS les `button[type=button]` du `main`, y compris la navigation du planning (‹ › Aujourd'hui,
onglets de vue) pour un chef d'équipe sans droit d'écriture — corrigé la session précédente
(`data-consultation`), reconfirmé fonctionnel ici (scénario E2E 13 vert).

**Glisser simulé Playwright** (nouveauté de cette session) : le scénario 48 glissait déjà un évènement
dans le temps (même salarié) et Alt-glissait pour dupliquer, avec un delta de pixels calé sur un
commentaire de code (« 64 px par heure »). **Ajouté** : un glisser vers un AUTRE salarié, dont la
destination est déterminée par la ligne DOM réelle (`[role=row][data-ligne]`) plutôt que par un pixel
absolu — robuste à un changement de densité ou de hauteur de ligne. Les séquences « conflit » et « 24 h »
restent couvertes par d'autres scénarios (E2E 12 : détection de conflit par création directe ; E2E 11 :
persistance après rechargement) ; non dupliquées en glisser pour limiter le risque de fragilité, cohérent
avec la consigne de préférer une API plus stable quand le pixel-perfect n'apporte rien de plus.

### 37.14 Paramètres — organisation et réglages futurs (exigences 32-34)

Pages Devis (Général : validité, unité, TVA par défaut, conditions, mode de règlement ; Sauvegarde :
rappel entreprise + préférence personnelle) et Numérotation (par type de document) restent deux pages
distinctes (elles l'étaient déjà, pour ne pas dupliquer un même réglage à deux endroits) — **ajout** d'un
lien croisé dans chacune (« Numérotation des documents (préfixe, format des numéros) → » /
« ← Valeurs par défaut des devis et rappel de sauvegarde ») pour qu'elles se découvrent mutuellement, sans
fusionner deux pages qui fonctionnaient bien séparément.

Inventaire des réglages « futurs » suggérés par le prompt, vérifié un à un dans le code — **la plupart
existent déjà** (à ne pas re-proposer à Julien comme manquants) : modèles de PDF (6 gabarits, déjà
choisissables), couleurs d'entreprise (déjà réglables, avertissement de contraste ajouté ce tour),
conditions par défaut (déjà réglables), pied de page / mentions légales (`texte_pied_page`, déjà réglable ;
les mentions légales elles-mêmes sont calculées depuis les infos légales de l'entreprise, pas un champ
libre). **Réellement absents** : l'ORDRE des colonnes de la grille (seule la visibilité se règle
aujourd'hui — écart déjà noté au § 36.15) et un arrondi PAR DÉFAUT au niveau devis (l'arrondi existe déjà
par composant d'ouvrage, `arrondi.mode`, mais pas de valeur par défaut entreprise). Non codés ce tour
(réglages non demandés explicitement, consigne de ne pas ajouter de dizaines de réglages).

### 37.15 Compte et données de démonstration (exigences 30-31)

`dirigeant.recette@elsatia-preview.invalid` reste actif (`abonnement_statut = 'actif'`) — vérifié via le
code (`statutEssai()`, `src/lib/essai-statut.ts` : le statut « actif » court-circuite entièrement la
lecture de `abonnement_essai_fin`, qui peut donc être n'importe quelle date passée ou proche sans risquer
la moindre redirection vers `/abonnement-suspendu`) : **le compte ne peut pas expirer par accident**, la
date d'essai affichée en base (2026-10-13) est sans effet tant que le statut reste « actif ». Données
(preview, requête en lecture seule) : 16 clients, 12 chantiers, 60 articles, 10 ouvrages, 51 devis
(4 statuts distincts), 4 factures, 1431 évènements de planning ; 0 ouvrage sans composant, 0 client sans
nom. Volumes en hausse par rapport au dernier relevé (accumulation des recettes successives) — sans
incohérence détectée ; seed toujours idempotent (script inchangé).

### 37.16 Tests (exigence 38)

| Contrôle | Résultat |
| --- | --- |
| pgTAP, Fresh 1→292 (aucune migration touchée) | 83 fichiers, **2 343 ok, 0 not ok** — identique au relevé § 36.16 |
| Vitest complet | **2 434 réussis**, 3 ignorés, 3 délais dépassés sous charge (xlsx, webhook Stripe ×2) — rejoués seuls : 7/7 verts, sans rapport avec ce lot |
| E2E principale (`gp-v1-metier.spec.ts`) | **17/17** en une passe |
| E2E UX (`gp-v1-ux.spec.ts`, + scénario 60 nouveau) | **6/6** en une passe |
| Banc de l'éditeur | **18/18** |
| Lint | 0 erreur, 48 avertissements préexistants (un faux positif du bundle du banc, généré et jamais commité, exclu du lint — § 37.17) |
| Typecheck, build production | 0 erreur |
| `verify:migrations` / `verify:secrets` / `git diff --check` | 292 migrations inchangées · aucun secret · propre |

### 37.17 Défaut d'outillage corrigé en cours de route

Le bundle esbuild du banc de l'éditeur (`tests/banc/editeur-v2/dist/`, généré par `construire.mjs`,
gitignoré depuis la session précédente) n'était pas exclu du lint : une reconstruction a produit un motif
de code React minifié que `react-hooks/rules-of-hooks` interprète à tort comme un appel de Hook
conditionnel (14 erreurs). Le bundle n'est ni du code source ni exécuté par l'application — rejoué par
Playwright dans une page `file://` du banc. Exclu explicitement (`eslint.config.mjs`), au même titre que
`test-results/` et `playwright-report/`.

### 37.18 Benchmark visuel (exigence 35)

Capturé en direct (navigateur de session, build de production) à 1440 × 900, 1280 × 800, 1024 × 800 (rupture
`lg`) et 375 × 812 (mobile) sur l'éditeur de devis, avant/après repli de l'en-tête, en mode Document, et
sur le planning (bureau et mobile). Constat central confirmé aux quatre tailles : la grille (ou le
formulaire d'ajout) est visible sans défilement dès l'en-tête replié, y compris à 375 px. Pas de
débordement horizontal mesuré à aucune des quatre tailles (toolbar et grille).
