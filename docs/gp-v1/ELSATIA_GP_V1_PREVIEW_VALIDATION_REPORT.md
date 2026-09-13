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
