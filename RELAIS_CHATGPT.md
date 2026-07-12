# Relais pour ChatGPT — Plateforme BTP « LIRIA CONCEPT »

> Document de passation à jour au **12 juillet 2026**. À lire en entier avant toute modification.
> Il complète (et prime sur) l'ancien relais Claude collé dans la conversation.
> Copie synchronisée : `~/RELAIS_CHATGPT.md`. **À mettre à jour à CHAQUE modification.**

---

## 0A. MISE À JOUR CODEX — 12 juillet 2026 (ÉTAT AUTORITATIF)

Cette section **prime sur les mentions “à faire / migration à exécuter” plus bas**, conservées uniquement comme historique.

- **Migrations hébergées appliquées jusqu’à 37**, avec le trou volontaire `28` : `29 planning_hebdomadaire`, `30 acces_modules`, `31 membres_postes`, `32 logo_entreprise`, `33 pointage_preuves`, `34 stock_import_nuanciers`, `35 code_entreprise`, `36 plateforme_abonnements`, `37 depenses_actifs_documents`. La migration 28 n’existe plus dans `migrations/` : le script de coupure du prototype est rangé dans `supabase/production/sortie_mode_prototype.sql` et reste **NON APPLIQUÉ**.
- **Migration 36 passée et contrôlée** : colonne abonnement, propriétaire `julien.gregurec@gmail.com`, RPC de liste/modification et droit `authenticated` tous vérifiés `true`. `/plateforme` répond HTTP 200 et affiche LIRIA CONCEPT + les statuts.
- **Planning** : vue semaine visuelle, tâche = date + heures + chantier + plusieurs ouvriers, partage email/WhatsApp. Migration 29 et test multi-ouvriers réussis, données test supprimées.
- **Accès & rôles** : droits par module, rôles, affectation des comptes, suppression de rôle vide, navigation filtrée et routes protégées en auth réelle. Code d’entreprise + membre en attente + activation par poste appliqués.
- **Email/PDF** : fenêtre email devis/facture avec destinataire, CC multiples, objet/message, accès PDF et passage automatique au statut envoyé. SMTP + pièce jointe automatique reste dépendant d’un fournisseur externe.
- **Logo** : import entreprise sécurisé, logo LIRIA fourni déjà importé dans le bucket public dédié et utilisé par navigation/PDF.
- **Pointage terrain** : GPS, précision, photo privée obligatoire, carte, statut à vérifier, validation/rejet et commentaire.
- **Stock** : import atomique XLSX/CSV/PDF (catalogue ou inventaire), nuanciers, codes-barres, sélection de teinte et mouvement via douchette/saisie. Test Excel réel : article + quantité + mouvement + teinte validés puis nettoyés.
- **Flotte/outillage/dépenses** : véhicule assigné à un ouvrier, facture fournisseur liée à chantier + employé + véhicule ou outil, historique et total par actif, PDF/photo de facture dans stockage privé.
- **Listes intelligentes** : véhicule avec repli local + modèles vPIC officiels ; outillage avec suggestions BTP ; saisie libre toujours autorisée.
- **Suivi complet** : lire `SUIVI_BESOINS_METIER.md`.
- **Dépendances ajoutées** : `@excel.js/exceljs` et `unpdf`. Le fork Excel ne ramène pas la dépendance `uuid` vulnérable de l’ancien paquet `exceljs`. `npm audit` conserve seulement les 2 alertes modérées préexistantes liées à Next/PostCSS.
- **Validation finale verte** : `npm run lint`, `npx tsc --noEmit --incremental false`, `npx next build --webpack`, `git diff --check`. Build : 42 pages statiques générées, routes nouvelles `/plateforme`, `/stock/[id]`, `/api/referentiels/vehicules` incluses.
- **Sécurité production** : `supabase/production/sortie_mode_prototype.sql` a été complété avec toutes les RPC 30–37. Nouveau dry-run complet `BEGIN … ROLLBACK` réussi ; après rollback, fonction prototype présente, droit anon présent et 46 policies anon intactes. Ne pas l’appliquer tant que `DISABLE_EMAIL_LOGIN=true` et sans sauvegarde/validation explicite.

---

## 0. MISE À JOUR — reprise Claude, 12 juillet 2026 (fin de journée)

**⚡ L'APPLICATION EST EN PRODUCTION.**

- **URL prod : https://liria-concept-gestion-btp.vercel.app** (Vercel, équipe `julien-gregurec`, plan Hobby, projet unique `liria-concept-gestion-btp`).
- **GitHub** : `github.com/julien-gregurec/Appli_BTP`, désormais **privé** et **peuplé** (il était vide avant, d'où les échecs de déploiement initiaux). Branche `main`. Le dépôt local a un remote `gh` → push fonctionne via le trousseau macOS (osxkeychain). **Pour redéployer : `git push gh main`** (même un commit `--allow-empty`) → Vercel rebuild auto (~50 s, `next build`).
- **Variables d'env Vercel (projet)** : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, et **`DISABLE_EMAIL_LOGIN=true`**.
  - ⚠️ `DISABLE_EMAIL_LOGIN=true` en prod = **l'app s'ouvre sans connexion** (« Bonjour Prototype »), donc **accessible à quiconque a l'URL**. C'est un choix temporaire de l'utilisateur (test/démo). **À repasser à `false` + lancer le script de durcissement avant un vrai usage.** Après changement d'une variable Vercel, il faut **redéployer** (push) pour qu'elle prenne effet.
- **Changement de préréglage Vercel** : le framework doit être **Next.js** (piège : ne pas confondre avec « NestJS » ni laisser « Other »). Build Command / Output Directory = laisser **auto** (ne rien mettre).

**Correctif script de production (fait par Claude)** : `supabase/production/sortie_mode_prototype.sql` re-accordait `EXECUTE` à `authenticated` sur 15 RPC mais en **oubliait 6** pourtant appelées par l'app (`creer_poste_avec_permissions`, `enregistrer_permissions_poste`, `modifier_poste_membre`, `supprimer_poste_vide`, `importer_articles_stock`, `valider_preuve_pointage`). **Les 6 grants ont été ajoutés** — sans quoi la gestion des accès, l'import d'articles et la validation des pointages tombaient en « permission denied » après la coupure. Voir `PRODUCTION_CHECKLIST.md`.

**Ajout fonctionnel (Claude)** : bouton **« Envoyer par email »** sur les fiches devis ET facture (lien `mailto:` pré-rempli destinataire/objet/corps, helper `src/lib/email.ts`) — zéro dépendance. Grisé si le client n'a pas d'email.

**⚠️ ÉCART IDENTIFIÉ — gestion des comptes employés (À FAIRE, non commencé)** :
- Il **n'existe AUCUN moyen pour l'admin de créer/inviter le compte d'un employé.**
- `/parametres/acces` gère les **postes** + **permissions par module** + **affectation d'un poste à un membre déjà présent** — mais rien pour **ajouter un membre**.
- `/onboarding` ne fait que **créer une nouvelle entreprise** (le créateur devient Admin/Gérant) ; **pas d'option « rejoindre une entreprise existante »**, pas d'invitation.
- Conséquence : une entreprise n'a qu'**un seul compte** (l'admin). La section « Comptes et postes » reste vide de collègues.
- **Solution recommandée à construire** : invitation par email (table `invitations` : entreprise_id, email, poste_id, token, statut ; l'employé s'inscrit via le lien → rattachement auto à l'entreprise + poste). Alternative : code d'entreprise partagé. **Nécessite une migration SQL + UI.** En attente du choix de l'utilisateur (email vs code).

**NOUVELLE FONCTIONNALITÉ — Code d'entreprise + rattachement des employés (migration appliquée)** :
- Choix utilisateur : **code d'entreprise** (pour à terme facturer chaque entreprise/code). L'admin partage un code ; l'employé le saisit à l'inscription pour rejoindre l'entreprise ; il arrive **« en attente »** ; l'admin l'active en lui affectant un poste.
- **✅ Migration appliquée : `supabase/migrations/20260710000035_code_entreprise.sql`** — colonne `entreprises.code_adhesion` (unique, 8 car., trigger de génération + backfill), RPC `rejoindre_entreprise_par_code(text)` et activation par affectation d’un poste.
- Code applicatif (déjà en place) : `rejoindreEntrepriseAction` dans `src/app/actions/entreprise.ts` ; `getContexteEntreprise` (src/lib/entreprise.ts) redirige un membre non-actif vers **`/en-attente`** (nouvelle page) ; `/onboarding` propose « Créer » **ou** « Rejoindre avec un code » ; `/parametres/acces` **réécrit lisible** : affiche le **code d'entreprise** + liste les membres **en attente** (badge) que l'admin valide via « Valider » (= affecter un poste).
- ✅ **DÉPLOYÉ EN PROD (commit `988fc70`)** : migration 35 appliquée (LIRIA a le code `BW2HYQTA`), page `/parametres/acces` vérifiée en prod (affiche le code + « Comptes et postes »). Le **rattachement par code lui-même** ne s'active qu'en **auth réelle** (`DISABLE_EMAIL_LOGIN=false`) — à tester quand l'utilisateur réactivera le login.
- ⚠️ **Piège auth git rencontré** : une session avait mis un helper `credential.https://github.com.helper` = `!/tmp/gh_install/.../gh` dans `~/.gitconfig` (global) ; le binaire temporaire ayant été supprimé, `git push` échouait. **Corrigé** : `gh` réinstallé à un emplacement STABLE `~/.local/gh/bin/gh` (v2.96.0, compte `julien-gregurec`, token `gho_…` scope `repo`), et `git config --global credential."https://github.com".helper "!$HOME/.local/gh/bin/gh auth git-credential"`. Les push fonctionnent désormais.
- **DIRECTION SAAS validée** : l'utilisateur veut **vendre le logiciel à d'autres entreprises du BTP** (chaque code = client facturable). Feuille de route : Étape 0 codes entreprise (fait) · Étape 1 espace propriétaire plateforme (en cours, voir ci-dessous) · Étape 2 Stripe (abonnements/paiement — nécessite compte Stripe + tarifs + clés de l'utilisateur) · Étape 3 landing + inscription self-service. Super-admin identifié **par email**.

**ÉTAPE 1 — Espace propriétaire plateforme (migration appliquée et contrôlée)** :
- **✅ Migration appliquée : `20260710000036_plateforme_abonnements.sql`** — ajoute les statuts/échéance/note d’abonnement, le propriétaire et les RPC gardées. Vérification structurelle complète réussie.
- Code : `src/lib/plateforme.ts` (`estPlateformeAdmin()` → **true en mode prototype** pour démo, sinon RPC email) ; `src/app/actions/plateforme.ts` ; page **`/plateforme`** (liste des entreprises + stats + édition du statut d'abonnement par entreprise) ; lien **★ Plateforme** dans `Sidebar` (prop `plateformeAdmin`, calculé dans `(app)/layout.tsx`).
- En mode prototype la page requête `entreprises` directement (colonnes ajoutées par la migration) ; en auth réelle elle passe par la RPC gardée par email. **La restriction par email n'est effective qu'en auth réelle** ; en prototype (prod actuelle, public) l'écran est visible de tous — acceptable tant qu'il n'y a qu'une entreprise, à resserrer avant d'ouvrir le SaaS.
- Reste Étape 2 (Stripe) à faire ; nécessite les choix tarifaires et les clés du compte Stripe.

**État qualité au moment de la reprise** : `npx tsc --noEmit`, `npm run lint`, `npx next build --webpack` = **verts** (y compris après l'ajout du code d'entreprise). Modules live testés en prod (10 routes → HTTP 200).

**Note** : à ce stade le tableau de bord prod affiche « Total facturé 0,00 € » — à confirmer si l'utilisateur s'attend à retrouver des données de test (mêmes DB Supabase).

---

## 1. Projet & environnement

- **Dépôt local** : `/Users/juliengregurec/Documents/btp-platform`
- **Stack** : Next.js `16.2.10` (App Router, Turbopack par défaut en dev, dossier `src/`), React 19, TypeScript, Tailwind v4, `@supabase/ssr`.
- **Node via nvm** : binaire dans `/Users/juliengregurec/.nvm/versions/node/v24.18.0/bin` — **PAS dans le PATH par défaut**. Avant toute commande npm/npx en shell : `source "$HOME/.nvm/nvm.sh"`.
- **Pas de Docker ni de brew**. Pas de CLI Supabase globale et projet non lié ; le paquet `supabase` existe toutefois en devDependency et `npx supabase` est disponible localement.
- **⚠️ Lire `AGENTS.md`** à la racine : ce Next.js 16 a des ruptures d'API. Consulter `node_modules/next/dist/docs/` avant de coder. Points déjà gérés : `middleware` renommé `proxy` (`src/proxy.ts`), `cookies()` asynchrone, groupe de routes `src/app/(app)/` pour les pages authentifiées.

## 2. Supabase

- **Projet hébergé** : `https://uykukebthgmqtxlmkpnn.supabase.co` (organisation « Application julien »).
- **Clé publique** (format récent `sb_publishable_...`) dans `.env.local` (gitignored). Elle est faite pour être publique (protégée par RLS).
- **Entreprise unique en base** : `ENT-001`, id `cc90ee48-7c9a-4983-a143-0df72ca0c937`, nom **LIRIA CONCEPT**.

### Application des migrations — IMPORTANT
- Les fichiers `supabase/migrations/*.sql` sont appliqués **MANUELLEMENT** : copier/coller dans le **SQL Editor** de Supabase. **Aucun lien CLI**, aucune application automatique.
- Après une migration qui crée des tables : cliquer **« Run and enable RLS »** dans le popup.
- Le **cache de schéma PostgREST peut être en retard** : si l'app dit « Could not find the table … in schema cache », lancer `notify pgrst, 'reload schema';` (déjà ajouté en fin de chaque migration récente) ou redémarrer le projet.
- Relancer une migration déjà passée → erreur « relation already exists » = **inoffensif**, ça veut juste dire qu'elle est déjà appliquée.
- **Piège éditeur SQL** : toujours créer un **nouveau snippet vierge**, coller, vérifier visuellement la fin du fichier, puis exécuter (un onglet réutilisé a déjà mélangé deux requêtes).

## 3. Mode PROTOTYPE sans connexion (TEMPORAIRE — à retirer avant prod)

- `.env.local` contient `DISABLE_EMAIL_LOGIN=true`.
- `src/lib/auth-mode.ts` → `isEmailLoginDisabled()` pilote le mode.
- Quand actif : le `proxy` saute l'auth, `getContexteEntreprise()` appelle la RPC `dev_contexte_entreprise()` (migration 08) qui renvoie la 1ʳᵉ entreprise (LIRIA CONCEPT, ENT-001) comme utilisateur « Prototype », et la RLS est contournée par une policy `prototype acces anonyme` + des grants larges au rôle `anon`.
- **Conséquence** : l'app est utilisable en local **sans login**. Pour tester : lancer le serveur et naviguer, aucune authentification nécessaire. On peut aussi lire/écrire directement via l'API REST avec la clé publique.

## 4. État Git

- Le dépôt repose **presque entièrement sur des fichiers non suivis** depuis le commit initial. **NE PAS** lancer de reset/checkout/clean destructif.
- Repo GitHub distant `github.com/julien-gregurec/Appli_BTP` existe mais **vide** — l'utilisateur n'a **pas** voulu pousser (le garder local / éventuellement passer en privé d'abord). **Ne rien pousser sans demander.**

## 5. Modules fonctionnels (tous testés navigateur)

Menu latéral : Tableau de bord · Clients · Chantiers · Devis · Prestations · Factures · Commandes · Fournisseurs · Dépenses · Charges récurrentes · Planning · Employés · Pointage heures · Rentabilité · Trésorerie · Stock · Flotte automobile · Outillage · Dépôt · Inventaires · Exports comptables · Paramètres. Tous les modules affichés sont actifs.

- **Comptes & Entreprises** : entreprise, postes, permissions_poste, RLS, bootstrap admin, références auto `ENT-001`.
- **Clients & Chantiers** : fiches, contacts, types de chantier (auto-seedés), tâches, transferts, workflow statut chantier (12 statuts), références `CLI-0001` / `CHA-2026-001`. Recherche + filtres. Fiche client enrichie (total facturé/encaissé/reste dû, 5 derniers devis/factures). Fiche chantier enrichie (devis acceptés, facturé, encaissé, heures planifiées, compteur et accès au coffre documentaire). Bouton « Nouveau devis » présélectionne client **et** chantier.
- **Employés** : liste/création/fiche/modif/statut, références `EMP-0001`+, `taux_horaire` (facturé) vs `cout_horaire` (interne), FK `responsable_id` sur chantiers.
- **Planning (refonte)** : modèle **affectation** = chantier + employé + date + heures + tâche (fini début/fin). Récaps « heures par chantier » et « heures par ouvrier ». Table `affectations` (migration 11). L'ancienne table `planning_evenements` est **dormante** (non utilisée), `StatutPlanningSelect.tsx` supprimé.
- **Devis** : éditeur avec lignes dynamiques + calcul HT/TVA/TTC temps réel, statuts, numéro `DEV-2026-001` généré à l'envoi (pas sur brouillon), modification des brouillons (`/devis/[id]/modifier`), duplication, recherche/filtres. Insertion de prestations préenregistrées. **Création d'un client à la volée** depuis l'éditeur (bouton « + Nouveau client »).
- **Prestations préenregistrées** (catalogue) : `/prestations`, création/modif/activation, 5 prestations BTP seedées, insertion dans le devis, enregistrement rapide d'une ligne manuelle vers le catalogue.
- **Factures** : création depuis devis **accepté** (copie des lignes en snapshot figé), `date_echeance` auto depuis le délai de paiement client, statuts, paiements (avec contrôles : refus sur brouillon/annulée/avoir, refus si dépasse le reste dû), suppression de paiement vérifiée, modification des brouillons (`/factures/[id]/modifier`), recherche/filtres, indicateurs facturé/encaissé/reste. Numéro `FAC-2026-001`. **Statuts payée/partiellement payée pilotés automatiquement par les paiements** (triggers).
- **Impression / PDF** : routes `/imprimer/devis/[id]` et `/imprimer/factures/[id]` (layout dédié sans sidebar), composant `DocumentImprimable` (A4, style inline, en-tête entreprise + logo, client, lignes, totaux, mentions légales BTP — pénalités uniquement sur factures), composant `AutoPrint` qui déclenche `window.print()` → « Enregistrer au format PDF ». Boutons « Télécharger PDF » sur les fiches devis/facture.
- **Envoi par email (mailto)** : bouton « Envoyer par email » sur les fiches devis **et** facture → ouvre le client mail par défaut avec destinataire (email du client), objet et corps FR pré-remplis (montant TTC + rappel de joindre le PDF + signature entreprise). Helper `src/lib/email.ts` (`lienMailtoDocument`). Zéro dépendance / clé API. Bouton grisé si le client n'a pas d'email. (Envoi SMTP automatique avec PDF joint = évolution future si besoin, nécessiterait Resend/Nodemailer + clé.)
- **Commandes fournisseurs** (migration 21 appliquée et testée) : `/fournisseurs` (carnet + création + activer/désactiver), `/commandes` (liste), `/commandes/nouveau` (`CommandeEditor` : fournisseur avec **création inline**, chantier optionnel, dates, description, lignes qté×PU HT/TVA, total live), `/commandes/[id]` (détail, transitions SQL guardées, réception cumulative partielle/complète et suppression brouillon/annulée). Création en-tête+lignes atomique par RPC, totaux recalculés en base, liens fournisseur/chantier/commande isolés par entreprise. Nav active.
- **Photos & documents chantier** (migration 22 appliquée et testée) : `/chantiers/[id]/documents`, dépôt privé Supabase limité à 15 Mo, images/PDF/Word/Excel, 8 catégories métier, note, galerie avec aperçu image, téléchargement par URL signée 60 s et suppression confirmée. Métadonnées et objets Storage sont isolés par entreprise ; le mode prototype n’ouvre que le bucket dédié. La fiche chantier affiche le compteur et le lien direct.
- **Flotte automobile** (migration 23 appliquée et testée) : `/flotte`, création et fiche véhicule, immatriculation unique, marque/modèle/type/statut, kilométrage, échéances contrôle technique/assurance/entretien et historique des relevés. Le trigger verrouille le véhicule et interdit tout recul du kilométrage. Nav active.
- **Outillage** (migration 24 appliquée, auditée et testée) : `/outillage`, registre individuel avec référence `OUT-0001`, catégorie, marque/modèle/série, état, prix et vérification. Fiche avec affectation employé/chantier, retour, maintenance, remise en service, hors service et perte. Chaque transition est validée sous verrou et historisée par RPC ; les rôles applicatifs ne peuvent ni modifier ni supprimer directement un outil.
- **Dépôt & Inventaires** (migration 25 appliquée et testée) : `/depot` gère les zones physiques et l’emplacement normalisé des articles ; une zone « Dépôt principal » est seedée. `/inventaires` crée un instantané du stock global ou d’une zone, enregistre tous les comptages puis valide atomiquement les écarts en mouvements d’ajustement. Si le stock change pendant le comptage, la validation est refusée pour éviter une correction erronée.
- **Exports comptables CSV** : `/exports`, période configurable et trois téléchargements privés : journal des ventes, journal des règlements, détail + synthèse TVA par facture/taux. CSV UTF-8 BOM, séparateur `;`, décimales françaises, noms de fichiers explicites, avoirs négatifs et protection contre l’injection de formules. Les brouillons sans numéro sont exclus et chaque requête est filtrée par entreprise.
- **Dépenses fournisseurs & rentabilité réelle** (migration 26 appliquée, auditée et testée) : `/depenses` enregistre les factures d’achat avec fournisseur, chantier, commande optionnelle, catégorie, HT/TVA/TTC, échéance et règlements. Anti-doublon fournisseur+n° pièce, cohérence commande/fournisseur/chantier, surpaiement refusé sous verrou et statut payé automatique. Les dépenses HT non annulées sont déduites chantier par chantier dans `/rentabilite`, en plus du coût de main-d’œuvre.
- **Trésorerie prévisionnelle** : `/tresorerie`, encaissements et décaissements réalisés sur 30 jours, total à recevoir/à payer et projection hebdomadaire sur 13 semaines. Les factures/charges en retard sont ramenées en première semaine, les échéances au-delà de 90 jours sont exclues, et la variation cumulée est affichée en tableau et barres. La page précise qu’il s’agit d’une variation, pas d’un solde bancaire.
- **Charges récurrentes** (migration 27 appliquée et testée) : `/charges`, loyer/assurance/abonnement/location avec fournisseur, catégorie, chantier optionnel, périodicité mensuelle/trimestrielle/annuelle, HT/TVA et prochaine échéance. Les occurrences futures alimentent la trésorerie. La matérialisation atomique crée la dépense fournisseur réelle puis avance l’échéance, sans double comptage.
- **Tableau de bord** : CA facturé/encaissé/reste, devis acceptés/à suivre, chantiers actifs, prochaines affectations et **centre d’alertes opérationnelles consolidé**. Les alertes sont triées critique/à anticiper et couvrent factures, devis, livraisons fournisseurs, seuils de stock, contrôle technique/assurance/entretien flotte et vérifications outillage, avec lien direct vers l’objet à traiter.
- **Pointage heures** : `/pointage`, saisie heures normales/supp/pause/tâche/commentaire par employé+chantier+date, filtre mensuel, totaux, suppression confirmée (migration 18).
- **Rentabilité** : `/rentabilite`, agrège par chantier devis acceptés + factures HT + heures pointées, coût main-d'œuvre via `employes.cout_horaire`, marge estimée + taux. Précise que matériaux/sous-traitance/frais généraux ne sont pas encore déduits.
- **Stock** : `/stock`, articles (référence unique, unité, emplacement, seuil, prix achat HT), entrées/sorties chantier/ajustements, stock màj sous verrou par trigger (sortie > dispo refusée), synthèse valeur d'achat + alertes (migration 19).
- **Paramètres** : `/parametres`, modification identité/adresse/SIRET/assurances/pénalités/textes documents ; alimente les impressions.
- **Sécurité applicative** : les server actions (clients, employés, planning, prestations, chantiers, tâches, devis, factures) vérifient explicitement `entreprise_id` **en plus** de la RLS. Composant `ConfirmSubmitButton` pour les actions sensibles.

## 6. Migrations appliquées sur la base hébergée (01–27 et 29–37)

`01 comptes_entreprises` · `02 trigger_profil` · `03 bootstrap_entreprise` · `04 clients_chantiers` · `05 devis` · `06 factures` · `07 consolidation_financiere` · `08 mode_sans_connexion` · `09 planning` · `10 employes` · `11 affectations` · `12 prestations_catalogue` · `13 modification_devis_atomique` · `14 duplication_devis` · `15 creation_devis_atomique` · `16 delai_paiement_client` · `17 modification_facture_atomique` · `18 pointages` · `19 stock` · `20 synchro_statuts` · `21 commandes_fournisseurs` · `22 documents_chantier` · `23 flotte` · `24 outillage` · `25 depot_inventaires` · `26 depenses_fournisseurs` · `27 charges_recurrentes`.

Puis : `29 planning_hebdomadaire` · `30 acces_modules` · `31 membres_postes` · `32 logo_entreprise` · `33 pointage_preuves` · `34 stock_import_nuanciers` · `35 code_entreprise` · `36 plateforme_abonnements` · `37 depenses_actifs_documents`. Le numéro 28 est réservé au script manuel de production sorti du dossier automatique.

**Migration 20 appliquée et renforcée après audit** : recalcul paiements sérialisé sous verrou, paiements positifs, transfert ancien/nouveau document, préservation du statut en retard, cascade devis→chantier et facture finale/simple→chantier. Les acomptes, situations et avoirs ne clôturent jamais un chantier. Les liens document/chantier sont contraints à la même entreprise et les helpers `SECURITY DEFINER` internes sont interdits à `anon`/`authenticated`. Backfill confirmé : FAC-2026-001/002/003 sont `payee`, montants payés égaux au TTC ; `CHA-2026-001` est `facture`.

**Migration 21 appliquée et renforcée après audit** : références annuelles, contraintes de dates/TVA/quantités, FK composites d’isolation entreprise, création atomique commande+lignes, transitions SQL atomiques et réception partielle/complète. Test SQL transactionnel multi-TVA réussi (35 € HT, 5,50 € TVA, 40,50 € TTC), sur-réception refusée, réception partielle puis complète. Test navigateur réussi avec création fournisseur inline et commande `CMD-2026-001` à 36 € ; les données de test ont ensuite été supprimées et les compteurs de tables contrôlés à zéro. RPC métier accessibles, helpers internes non exécutables par `anon`.

**Migration 22 appliquée et testée** : table `documents_chantier`, bucket privé `chantier-documents`, limite 15 Mo et formats contrôlés. FK composite chantier/entreprise, RLS membres et policies Storage par premier dossier `entreprise_id`. Test réel réussi : ajout d’une pièce technique temporaire, affichage dans `/chantiers/[id]/documents`, téléchargement HTTP 307 vers une URL signée, puis suppression via l’interface avec compteur revenu à zéro.

**Migration 23 appliquée et testée** : tables `vehicules` et `releves_kilometrage`, FK composite et RLS. Test navigateur : utilitaire temporaire créé à 10 000 km, relevé à 10 150 km, compteur et historique mis à jour ; véhicule et relevé de test supprimés ensuite.

**Migration 24 appliquée, auditée et testée** : tables `outils` et `mouvements_outillage`, références automatiques, FK composites et RLS. RPC atomique pour les transitions d’affectation ; double affectation refusée. Test navigateur complet création → affectation à Julien → retour, puis test direct du verrou avec 4 événements d’historique avant nettoyage. Outil temporaire supprimé, aucun résidu. Audit privilèges confirmé : `anon UPDATE=false`, `anon DELETE=false`, RPC métier exécutable.

**Migration 25 appliquée et testée** : `zones_depot`, `inventaires`, `lignes_inventaire`, rattachement `zone_id` sur stock/outillage et deux RPC atomiques. Test réel : article temporaire initialisé à 10, inventaire `INV-2026-001` compté à 8, un ajustement moins créé et stock final 8 ; seconde validation refusée. Second test : mouvement concurrent pendant le comptage, validation refusée et brouillon préservé. Tous les articles, mouvements et inventaires temporaires ont été supprimés (compteurs 0/0).

**Migration 26 appliquée, auditée et testée** : `depenses_fournisseurs` et `reglements_fournisseurs`, FK composites, cohérence automatique avec la commande, statut de règlement recalculé et plafond TTC sous verrou. Test navigateur : pièce temporaire 100 € HT / 20 € TVA, paiement partiel 50 €, surpaiement 71 € refusé, solde 70 €, statut `payee` et coût chantier HT 100 €. `/rentabilite` est passé de 15 090 € à 14 990 € de marge pendant le test, puis revenu à zéro achat après nettoyage. Dépense et fournisseur temporaires supprimés (0/0). Audit privilèges : modification/suppression directe de l’en-tête interdites à `anon`.

**Migration 27 appliquée et auditée** : `charges_recurrentes`, lien vers `depenses_fournisseurs` et RPC `materialiser_charge_recurrente`. Audit SQL confirmé table/colonne/RPC/grant. Test navigateur : charge mensuelle 50 € HT + 10 € TVA, projection 90 jours à 180 €, matérialisation d’une dépense 60 €, échéance avancée du 12 juillet au 12 août et projection restée 180 € sans doublon. Dépense, charge et fournisseur temporaires supprimés (0/0/0).

**Script de production NON APPLIQUÉ** : `supabase/production/sortie_mode_prototype.sql` est volontairement hors des migrations automatiques. Il supprime toutes les policies `anon`, révoque tables/séquences/fonctions anonymes, verrouille les `SECURITY DEFINER`, réaccorde uniquement les helpers/RPC authentifiés et supprime `dev_contexte_entreprise`. Dry-run complet dans `BEGIN … ROLLBACK` réussi avec assertions : zéro policy anon, zéro lecture table anon, zéro `SECURITY DEFINER` anonyme, helper RLS et RPC métier authentifiés conservés. Rollback vérifié : `/dashboard` fonctionne encore comme Prototype.

**Préparation Auth production vérifiée sans exposer d’identité** : `ENT-001` a 1 membre actif et 1 poste ; profil public, compte Auth, entreprise active, email confirmé, mot de passe et ancienne connexion sont tous présents. Il reste à choisir l’hébergement/URL, sauvegarder puis autoriser explicitement le script manuel de sortie et `DISABLE_EMAIL_LOGIN=false`.

**RPC clés (SECURITY DEFINER)** : `dev_contexte_entreprise`, `creer_entreprise_bootstrap`, `creer_devis_brouillon`, `modifier_devis_brouillon` (approx.), `dupliquer_devis`, `creer_facture_depuis_devis(uuid,text)` (vérifie devis accepté + client + délai → `date_echeance`), `modifier_facture_brouillon`, recalculs totaux/paiements par triggers.

## 7. Rebranding LIRIA CONCEPT

- Entreprise `ENT-001` = **LIRIA CONCEPT**, adresse **9 rue du Maréchal Leclerc, 67860 Rhinau**, slogan **Concevoir • Aménager • Réaliser**, contact `06 50 93 11 87` / `liriaconcept@gmail.com`.
- **Charte** (dossier `~/Desktop/LIRIA CONCEPT/`) : bleu nuit `#0D1B2A`, or `#C9A24A`, anthracite `#1F2328`, blanc `#FFFFFF`. Reprise dans le PDF (en-tête, filet or, bandeau de tableau bleu nuit).
- **Logo** : `public/liria-concept-logo.png`, affiché dans la navigation et les PDF devis/factures.
- **Activité confirmée** (`LIRIA_CONCEPT_Dossier_Pro.pdf`) : agencement intérieur — cloisons amovibles, panneaux décoratifs, portes, vitrages, cabines sanitaires, sols stratifiés, fourniture + pose ; pros & particuliers. Statut envisagé : **Entreprise Individuelle au réel** (pas encore immatriculée). Tarifs : min 50 €/h, objectif 60 €/h.
- **⚠️ SIRET actuellement en base = `12345678900012` = valeur factice de test.** L'EI n'est pas encore créée. **NE PAS** reprendre le SIRET / capital / dénomination de l'ancienne structure `JULIEN GREGUREC MULTISERVICES` (SAS) présente dans les vieux PDF. À compléter avec les vraies infos légales une fois l'EI immatriculée (via `/parametres`).

## 8. Suivi des 5 retours utilisateur (batch du 11/07)

1. **Créer un client directement depuis le formulaire de devis** → **FAIT & testé (11/07)**. Bouton « + Nouveau client » dans `DevisEditor` → mini-formulaire (type, nom/prénom/société, tél, email, CP, ville) → « Créer et sélectionner » crée la fiche et la sélectionne automatiquement. Action JSON dédiée `creerClientRapideAction` (sans redirect) dans `src/app/actions/clients.ts`. Le garde-fou « il faut d'abord créer un client » de `devis/nouveau` a été retiré (on peut démarrer un devis sans aucun client existant).
2. **Refonte Planning (heures)** → **FAIT & testé** (migration 11).
3. **PDF téléchargeable devis/factures** → **FAIT & testé**. Envoi email = reporté (PDF d'abord).
4. **Synchro auto des statuts** → **FAIT, migration 20 appliquée et vérifiée**. FAC-002/003 corrigées en `payee`, cascade chantier active et durcie (voir §6).
5. **Lignes de prestation préenregistrées** → **FAIT** (module Prestations, migration 12).

## 9. Validations (état vert au 12/07/2026, après migrations 20-27)

```bash
source "$HOME/.nvm/nvm.sh"
cd ~/Documents/btp-platform
npm run lint                       # OK
npx tsc --noEmit --incremental false  # OK
npx next build --webpack           # OK (build de prod réussi)
git diff --check                   # OK (aucun conflit whitespace)
```

## 10. Lancer / tester en local

- Démarrer le serveur dev **sans bloquer sur le PATH** :
  ```bash
  cd /Users/juliengregurec/Documents/btp-platform && PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" npm run dev
  ```
  (Le fichier `~/.claude/launch.json` a une entrée `btp-platform-dev` pour l'outil de preview de Claude ; sous ChatGPT, lancer simplement `npm run dev`.)
- Un `next dev` fantôme peut rester bloqué (crash EPIPE) : `pkill -f "next dev"` puis `lsof -ti:3000,3003 | xargs kill -9`, puis relancer.
- **Astuce test des formulaires React contrôlés** : le remplissage champ par champ réinitialise parfois les refs. Fiable = un seul script JS qui utilise le setter natif `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set` + dispatch `input`/`change`, remplit tous les champs d'un coup, puis clique le submit.
- **Test PDF** : naviguer vers `/imprimer/devis/[id]` rend le document A4 ; `window.print()` ne bloque pas le rendu, on peut capturer/valider directement.

## 11. Reprise recommandée (ordre)

1. Retours utilisateur #1→#5 terminés, migrations 20-27 et modules opérationnels/financiers prioritaires livrés.
2. **Passage production préparé mais volontairement non activé** : lire `PRODUCTION_CHECKLIST.md`, choisir l’URL/hébergement et confirmer la bascule. Le script manuel de production coupe définitivement le prototype anonyme.
3. Évolution nécessitant un choix/secret externe : envoi email SMTP réel (Resend) avec PDF joint.
3. Quand l'EI LIRIA est immatriculée : renseigner SIRET / assurances réels dans `/parametres` (retirer le SIRET factice `12345678900012`).
4. Avant prod : **retirer le mode prototype** (migration 08 + `DISABLE_EMAIL_LOGIN`) et réactiver l'auth réelle + RLS stricte.

## 12. Fichiers clés

- `src/components/DevisEditor.tsx` · `src/components/CommandeEditor.tsx` · `src/components/DocumentImprimable.tsx` · `src/components/AutoPrint.tsx` · `src/components/ConfirmSubmitButton.tsx` · `src/components/StatutCommandeSelect.tsx` · `src/components/Sidebar.tsx`
- `src/app/actions/{devis,factures,clients,chantiers,employes,planning,prestations,commandes,documents,flotte,outillage,depot,inventaires,depenses,charges}.ts`
- `src/lib/{devis,factures,commandes,documents,outillage,email,chantier-statuts,entreprise,auth-mode}.ts`
- `src/app/imprimer/{devis,factures}/[id]/page.tsx`
- `src/app/api/exports/comptabilite/route.ts` · `src/lib/csv.ts` · `src/app/(app)/exports/page.tsx`
- `src/app/(app)/tresorerie/page.tsx` · `src/lib/tresorerie.ts`
- `PRODUCTION_CHECKLIST.md` · `supabase/production/sortie_mode_prototype.sql` (**prêt, testé en rollback, non appliqué et hors migrations automatiques**)
- `src/app/(app)/…` : dashboard, clients, chantiers, devis, factures, commandes, fournisseurs, planning, employes, pointage, rentabilite, stock, prestations, parametres
- `supabase/migrations/*` (27 fichiers, tous appliqués ; voir §6)

## 13. Historique de démonstration LIRIA — 12 juillet 2026

- La base Supabase a été enrichie sans suppression des données existantes pour simuler plusieurs mois d'activité.
- Totaux après remplissage : **8 clients, 9 chantiers, 8 employés, 12 devis, 8 factures, 12 affectations planning, 13 pointages, 10 prestations, 12 articles et 20 mouvements de stock, 3 zones de dépôt, 1 inventaire validé, 7 fournisseurs, 5 commandes, 3 véhicules, 9 outils, 6 dépenses fournisseurs et 3 charges récurrentes**.
- Les données ajoutées sont cohérentes entre modules : devis et factures rattachés aux clients/chantiers, paiements et statuts automatiques, temps par équipe, sorties de stock par chantier, véhicules/outils affectés et dépenses reliées aux actifs.
- Les coordonnées ajoutées sont fictives et utilisent `example.fr` pour empêcher tout envoi accidentel à de vraies personnes.
- Le script idempotent est `scripts/seed-demo-history.mjs`. Il a été exécuté deux fois avec des compteurs strictement identiques, donc sans doublon.
- Marqueur technique des données : `HISTORIQUE_DEMO_LIRIA_2026` et références `DEMO-*`. Les données originales ont été conservées.

## 14. Lot terrain, emails et imports — 12 juillet 2026

- **Migrations 38 et 39 appliquées dans Supabase** : `sessions_pointage` avec RPC de clôture atomique, puis historique des affectations véhicule avec RPC atomique.
- `/pointage` propose arrivée puis départ avec GPS. Depuis la migration 41, la photo et la saisie manuelle ont été retirées du nouveau parcours (voir §17).
- Les commandes fournisseur disposent maintenant d’un **bon de commande A4/PDF** (`/imprimer/commandes/[id]`) et du même dialogue email avec destinataire/CC que les devis/factures. Un email fournisseur absent est signalé.
- La fiche véhicule affiche l’ouvrier courant, l’historique d’affectation, les factures associées avec chantier et un résumé des travaux récents de l’ouvrier assigné.
- Un outil `hors_service` reste impossible à affecter côté RPC et apparaît explicitement indisponible dans la liste.
- Imports XLSX/CSV/PDF ajoutés à `/flotte` et `/outillage` via `src/lib/import-assets.ts`.
- Les équipes peuvent prendre une photo directement depuis `/chantiers/[id]/documents` et la classer avant/pendant/après travaux.
- Contrôles : migrations accessibles en anon prototype, 3 affectations véhicules reprises, lint/TypeScript/build Next webpack verts, routes et écrans testés localement.

## 15. Adaptation mobile complète — 12 juillet 2026

- Navigation remplacée sur téléphone par un en-tête compact et un menu latéral coulissant avec fond bloquant et fermeture au changement de page.
- Le contenu commence sous l’en-tête mobile ; la barre latérale bureau reste inchangée à partir de 768 px.
- Règles responsives centralisées dans le layout : marges réduites, grilles/cartes/formulaires empilés, colonnes étendues, boutons tactiles, modales limitées à la hauteur de l’écran et tableaux avec défilement horizontal interne.
- Tests réels avec viewport **390×844** puis **360×800** sur `/dashboard`, `/pointage`, `/devis`, `/devis/nouveau`, `/stock`, `/flotte` et `/commandes` : largeur document strictement égale au viewport, aucun débordement horizontal de page.
- Captures vérifiées : tableau de bord lisible en une colonne, cartes financières sans chevauchement, pointage arrivée/départ entièrement utilisable.

## 16. Permissions Consulter / Gérer — 12 juillet 2026

- **Migration 40 appliquée** : 12 droits `gerer_*` ajoutés en complément des droits `acces_*`, dont clients, chantiers, devis, factures, achats, planning, employés, pointage, stock, flotte, outillage et paramètres.
- Les descriptions `acces_*` indiquent maintenant clairement « Consulter ». La page `/parametres/acces` affiche des badges bleus **Consulter** et or **Gérer**.
- Les postes existants ont reçu les nouveaux droits de gestion correspondant à leurs accès afin de ne provoquer aucune régression. L’admin peut décocher seulement « Gérer » pour rendre un poste lecteur.
- L’enregistrement normalise les droits côté SQL : sélectionner « Gérer » force automatiquement le droit « Consulter » du même module.
- En authentification réelle, l’interface affiche un bandeau « Mode consultation », masque les formulaires/actions de modification et conserve les filtres de lecture.
- Le proxy bloque également toute requête POST d’un utilisateur sans droit `gerer_*`, avec redirection 303 vers la page consultée. Le masquage visuel n’est donc pas la seule protection.
- Les anciennes permissions détaillées clients/chantiers/employés restent en base pour compatibilité mais sont masquées de l’écran simplifié ; les contrôles spéciaux (`gerer_utilisateurs`, `valider_pointages`) restent visibles.

## 17. Pointage GPS simplifié — 12 juillet 2026

- **Migration 41 appliquée** : les photos d’arrivée/départ deviennent facultatives en base et la RPC de clôture accepte un pointage GPS sans photo.
- Le nouveau parcours est uniquement : **Employé + Chantier + GPS + horodatage automatique**. La tâche reste facultative.
- Arrivée et départ conservent chacun leurs coordonnées et leur précision GPS ; la pause est déduite et les heures sont calculées automatiquement.
- La saisie manuelle et la prise de photo ont été retirées de l’interface. Les anciennes saisies restent consultables dans un panneau d’archives pour ne perdre aucun historique.
- L’historique principal affiche clairement le chantier, la date, les heures d’arrivée et de départ, la durée et deux liens cartographiques GPS.

## 18. Comptes collaborateurs et carte BTP — 13 juillet 2026

- Le parcours collaborateur existe : création d’un compte individuel, choix « Rejoindre une entreprise », saisie du code entreprise, demande en attente, puis validation par l’administrateur avec affectation d’un poste dans `/parametres/acces`.
- Les droits du poste séparent **Consulter** et **Gérer** par module. Attention : tant que le mode prototype sans connexion reste actif, tous les visiteurs partagent encore le contexte administrateur ; la séparation individuelle sera effective après la bascule d’authentification décrite dans `PRODUCTION_CHECKLIST.md`.
- **Migration 42 appliquée** : chaque employé peut avoir une carte professionnelle BTP en PDF, PNG, JPG ou WebP (10 Mo maximum), avec numéro et date d’expiration facultatifs.
- Les fichiers sont dans le bucket privé `documents-employes`. Leur affichage passe par `/api/employes/[id]/carte-btp`, qui vérifie l’entreprise et génère un lien signé court ; aucune URL publique permanente n’est exposée.
- La fiche `/employes/[id]` permet d’importer/remplacer, présenter, télécharger ou supprimer la carte. Le rendu a été contrôlé sur mobile 360×800 sans débordement horizontal.

## 19. Affichage compact des postes — 13 juillet 2026

- Dans `/parametres/acces`, chaque poste est désormais replié par défaut pour éviter une page très longue.
- La ligne résumée indique le nombre de membres, de droits **Consulter** et de droits **Gérer**.
- « Afficher les droits » ouvre le détail complet ; « Réduire les droits » le referme. Les cases restent intactes pendant l’ouverture/fermeture et l’enregistrement se fait dans le panneau ouvert.
```
