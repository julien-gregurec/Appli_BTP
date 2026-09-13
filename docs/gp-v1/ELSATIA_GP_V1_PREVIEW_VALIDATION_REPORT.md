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
