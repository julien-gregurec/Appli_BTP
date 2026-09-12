# ELSATIA GP V1 métier — Lot A : audit, architecture, références internes

> Date : 2026-09-11 · Branche : `feat/gp-v1-metier-devis-planning-references-v1`
> Base : `516469d` (= lot devis v2 `feat/gp-devis-wysiwyg-catalogue-ouvrages-v1`, lui-même Train V3 `52d3282` + lot mobile `bb17c17`)
> Worktree : `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/gp-v1-metier`
> Aucune ligne de code modifiée, aucune migration écrite, aucun numéro de ledger réservé, aucun déploiement.

## 1. Synthèse

- **Le socle de calcul et de rendu est bon et se garde** : arithmétique décimale exacte (`src/lib/devis/montants.ts`, miroir de `numeric`), un seul moteur de présentation v2 (`construireVueDocument` → `paginer` → `DocumentA4`) pour aperçu, impression, PDF, portail et e-mail, ouvrages versionnés, coûts d'achat en tables séparées sous RLS.
- **Mais ce socle n'est pas au ledger** : 1 712 lignes de SQL proposé non numéroté (`supabase/proposed/gp-devis-wysiwyg-catalogue-ouvrages-v1.sql.proposed`), drapeau `GP_DEVIS_V2` éteint. Les clés `voir_couts_devis` / `gerer_couts_devis` sont lues à 16 endroits du code et absentes des 278 migrations. **Tout le lot V1 s'empile dessus** : son intégration au ledger est le prérequis n° 1 (« lot 0 »).
- **Le devis n'est pas un tableau** : les éditeurs v1 (`DevisEditor.tsx`, 688 l.) et v2 (`EditeurDevisV2.tsx`, 447 l.) empilent des cartes. Il manque les types titre, sous-titre, commentaire, sous-total, remise, ligne vide et saut de page. Il manque aussi la navigation cellule par cellule, la duplication, le glisser-déposer, l'annulation, l'autosauvegarde, la référence client et un journal du devis.
- **Le planning est à refaire, pas à retoucher** : une table journalière `affectations` (date + heures, sans horaires), une seule vue semaine, aucun glisser-déposer, **aucun contrôle de conflit dans l'interface**, aucune ressource matérielle datée, ni impression ni PDF. Mais douze fonctions SQL (pointage, paie, visibilité chantier, congés) lisent `affectations` : elle doit survivre.
- **Il n'y a aucune primitive d'interface transverse** : ni tooltip, ni panneau latéral, ni tableau, ni palette de commandes, et aucune dépendance glisser-déposer ou virtualisation. La barre contextuelle globale, la recherche globale et les « dernières actions » sont à créer de zéro.

**Verdict de la phase A : GO pour les lots B à H sous réserve des 4 décisions du § 9 et du lot 0.**

## 2. Existant par domaine

| Domaine | Existe aujourd'hui | À conserver | À refactorer | À créer |
|---|---|---|---|---|
| Éditeur devis | v1 cartes ; v2 cartes + aperçu A4, ↑/↓, Ctrl+K, Ctrl+S | réducteur pur `editeur-etat.ts`, `enregistrement-v2`, `brouillon-v2` | cartes v2 → grille | grille clavier, 10 types de lignes, duplication, copier/coller, glisser-déposer, annuler/rétablir, autosauvegarde, virtualisation |
| Types de lignes | seulement la *nature* (`main_oeuvre`, `fourniture`, `sous_traitance`, `deplacement`, `forfait`) + ouvrage + libre (v2) | la nature (colonne `type`) | — | colonne `type_ligne` distincte de la nature |
| Colonnes de ligne | désignation, description, qté, unité, PU, remise, TVA ; v2 : références instantanées, coût en table séparée | `lignes_devis_couts`, instantanés de références | — | coefficient, marge €/%, coût main-d'œuvre, famille, image, commentaire interne, colonnes masquables par droit |
| Calculs | `totauxDocument` exact (v2) ; `calcTotaux` flottant (v1) ; SQL `recalc_totaux_*` | `montants.ts` + tests (17), SQL de référence | retirer `calcTotaux` et le calcul de `DocumentImprimable` | sous-totaux, synthèse de rentabilité, reste à facturer |
| Ouvrages | bibliothèque versionnée, composants, pertes, arrondis, marge (proposé) | tout | `/ouvrages` = modèles de devis (collision de nom) | insertion depuis la grille, « développer » en lignes |
| Articles | 4 catalogues : `prestations_catalogue`, `articles_stock`, `tarifs_fournisseurs`, `modeles_devis` | `prestations_catalogue` (v2) comme bibliothèque de devis, `articles_stock` comme stock | lever `unique(entreprise_id, designation)` | familles/sous-familles, unités, image, favoris, contrôle de doublons étendu |
| Références | clients, chantiers : `reference_interne` unique ; fournisseurs `FRN`, commandes `CMD`, outils `OUT` ; articles v2 : interne/fabricant/code-barres sans unicité | `next_reference`, `compteurs_reference`, `normaliser_reference` | générateur résistant aux saisies manuelles | stratégie § 4 |
| Transformations | devis→facture, acompte, finale, avoir, situation, chantier, duplication ; commande→réception | RPC atomiques, garde anti-surfacturation, conversion corrigée (proposé) | acompte = copie de toutes les lignes au prorata | devis→commande fournisseur, avoir depuis la facture, « documents issus » sur la fiche devis |
| Statuts | 6 statuts, verrou `accepte` en base, verrou `envoye` proposé | tout | — | journal des statuts |
| Droits | postes + `a_permission` ; tout le devis sous `gerer_devis` | RLS restrictives, verrous `zz_*` | contrôles TS absents dans `changerStatutDevisAction`, `supprimerDevisAction`, `actions/planning.ts` | clés fines (§ 9 D4), modèles « commercial » et « poseur » |
| Historique | `journal_activite` : sans avant/après, lisible seulement avec `gerer_parametres`, aucun écran | journaux spécialisés existants | — | `historique_objets` append-only, écran par objet |
| PDF / e-mail | Chromium ; Brevo avec PDF joint et lien ; CC seulement dans le repli `mailto` ; message codé en dur | moteur v2 unique | — | CC/CCI Brevo, modèles de message, CGV et pièces jointes, journal d'envoi |
| Planning | `affectations` (jour + heures), vue semaine, formulaires HTML | RLS `gerer_planning`, verrou 24 h, notifications, congés → planning, `pointages.affectation_id` | page serveur monolithique, types en 3 copies | modèle horodaté § 5.4, 8 vues, glisser-déposer, conflits, ressources, impression |
| Ressources | `vehicules` (attribution ouverte), `outils` (catégorie levage) | ces tables comme référentiels | — | réservation datée de ressource |
| Barre contextuelle | rien | — | — | registre d'actions + panneau § 5.3 |
| Recherche globale | rien ; `pg_trgm` et `unaccent` installés (0247, 0276) | extensions | — | RPC `recherche_globale` + palette Ctrl+K |
| Dernières actions | rien (tableau de bord interroge les tables métier) | — | — | alimentées par `historique_objets` |
| Tests | Vitest 183 fichiers (**`.tsx` exclus**), pgTAP ~70, Playwright 18 specs, **aucun E2E devis ni planning** | tout | inclure `*.test.tsx` si des tests de composants sont ajoutés | 15 scénarios E2E du § 19 du prompt |

## 3. Défauts constatés pendant l'audit (non corrigés à ce stade)

| # | Défaut | Preuve | Traitement proposé |
|---|---|---|---|
| A1 | Clés `voir_couts_devis` / `gerer_couts_devis` absentes de la base, lues par le code | 0 migration, 16 fichiers `src` | lot 0 (SQL devis v2 au ledger) |
| A2 | `FactureEditor` affiche des totaux sans la remise globale | `src/components/FactureEditor.tsx:36` `calcTotaux(lignes, 0)` | lot D (calcul unique) |
| A3 | Changement de statut et suppression de devis sans contrôle de droit en TypeScript (RLS + proxy seulement) | `src/app/actions/devis.ts:176`, `:201` | lot D |
| A4 | Actions planning sans contrôle de droit en TypeScript | `src/app/actions/planning.ts` | lot F |
| A5 | Une référence saisie à la main n'avance pas le compteur : la génération suivante peut heurter l'unicité | `next_reference` (`…0001:108`) | lot A-bis (§ 4) |
| A6 | `a_permission` accorde toutes les clés à une session support côté SQL, alors que le TS la limite à un périmètre | `20260718000110:59` | **hors lot** : à confier à un lot sécurité |
| A7 | Supprimer un chantier ou un employé efface en cascade l'historique de planning | FK `affectations` ON DELETE CASCADE (`…0029:4-7`) | lot F (nouveau modèle sans cascade destructrice) |
| A8 | Tout membre actif lit tout le planning de l'entreprise | policy `membres affectations` (`…0011:24`) | à arbitrer au lot F (le planning personnel mobile en dépend) |
| A9 | Vitest n'exécute pas les `*.test.tsx` | `vitest.config.ts:30` | lot H |
| A10 | Commentaire faux dans le SQL proposé : `unaccent` serait absent, or il est installé depuis la 0276 | `.proposed:80-81` | lot 0 |

Rappel des P0 déjà confiés à d'autres branches (non traités ici) : prix d'achat `articles_stock` lisibles (`fix/stock-prix-confidentialite-colonnes-v1` @ `6f95da0`) ; flux `service_role` cassés par la 255, dont portail client et pièce jointe d'e-mail (`fix/document-partage-service-role-acl-v1` @ `aa430ce`, `fix/service-role-flux-acl-255-v1` @ `d41f835`).

## 4. Stratégie des références internes

### 4.1 Vocabulaire — une colonne, un sens

| Notion | Colonne | Porté par | Sens |
|---|---|---|---|
| Référence interne ELSATIA | `reference_interne` | clients, fournisseurs\*, chantiers, articles (catalogue et stock), ouvrages, prestations, matériel | identifiant métier de l'entreprise, stable, jamais un UUID |
| Numéro légal | `numero` | devis, factures, avoirs, commandes | séquence chronologique continue, attribuée à l'émission, **immuable** ; reste la référence du document |
| Référence d'affaire | `reference_interne` | devis, factures, commandes | référence de dossier libre (plusieurs devis d'une même affaire), non unique |
| Référence client | `reference_client` | devis, factures, commandes | référence du bon de commande ou du dossier chez le client, imprimée sur le PDF |
| Référence fabricant | `reference_fabricant` | articles, lignes (instantané) | déjà dans le SQL proposé |
| Référence fournisseur | voir D3 (§ 9) | articles, lignes (instantané) | référence ou code de l'article chez le distributeur |

\* Pour les fournisseurs, la colonne `reference` existante (`FRN-0001`) **est** la référence interne : elle est exposée sous ce nom, sans nouvelle colonne.

### 4.2 Règles

1. **Unicité par entreprise sur la forme normalisée** (`normaliser_reference`, IMMUTABLE, déjà en parité avec le TypeScript), en index unique **partiel** (`where reference_interne is not null and btrim(reference_interne) <> ''`) ; chaîne vide ramenée à NULL par déclencheur.
2. **Génération** : déclencheur « si vide » existant, préfixes par entité (ART, PRS, OUV, CLI, CHA, FRN, MAT) **paramétrables par entreprise** ; `next_reference` rendu sûr face aux saisies manuelles : on avance tant que la valeur produite existe déjà (défaut A5).
3. **Stabilité** : modifiable depuis l'interface, avec une entrée `historique_objets` (ancienne valeur, nouvelle valeur, auteur). Les lignes de devis, factures et commandes gardent l'**instantané** de la référence : renommer un article ne réécrit jamais un document émis.
4. **Recherche** : index trigrammes sur la forme normalisée ; la RPC `recherche_globale` classe « référence exacte » avant tout le reste.
5. **Imports** : clé de rapprochement choisie (déjà en v2 pour le catalogue), étendue aux clients et fournisseurs (référence interne puis SIRET, jamais le nom seul).
6. **Commandes** : `lignes_commande` reçoit `article_id` / `prestation_id` + instantané des références ; c'est ce qui rend possible devis → commande fournisseur.

### 4.3 Reprise des données (backfill)

- `articles_stock.reference_interne := reference` **seulement si** la forme normalisée est unique dans l'entreprise ; sinon NULL, avec la collision listée par `doublons_references_catalogue` (étendue à toutes les sources). Jamais de fusion automatique.
- Articles du catalogue et ouvrages sans référence : restent NULL (le générateur n'agit qu'à la création) ; un bouton « attribuer les références manquantes » est proposé par entreprise.
- `unique(entreprise_id, designation)` sur `prestations_catalogue` : remplacé par l'unicité sur la référence interne **seulement après** l'arbitrage D3. Aujourd'hui il empêche deux articles de même libellé.

## 5. Architecture cible

### 5.1 Principes transverses

- **Tout derrière drapeau, éteint par défaut** : `GP_DEVIS_V2` (existant) porte le devis ; `GP_PLANNING_V2` (nouveau) porte le planning ; la barre contextuelle s'affiche partout mais n'expose que des actions existantes. Drapeaux éteints = comportement actuel.
- **SQL en `.sql.proposed` non numéroté**, empilé sur celui du devis v2, rejouable, prouvé en base jetable clonée (jamais `db reset` sur la base locale de Julien).
- **Fonctions pures d'abord** (`src/lib/…`), testées sans base ni navigateur ; les composants ne font qu'afficher.
- **Droit vérifié trois fois** : l'interface grise l'action, l'action serveur refuse, la base refuse (RLS / RPC).

### 5.2 Devis en grille (lots C–D)

- **Modèle de ligne** : nouvelle colonne `type_ligne` (`article`, `ouvrage`, `libre`, `titre`, `sous_titre`, `commentaire`, `sous_total`, `remise`, `vide`, `saut_page`), distincte de la nature `type` conservée. Contrainte : les lignes non chiffrées ont quantité et prix nuls, donc `recalc_totaux_*` reste juste **sans modification**. Les sous-totaux sont **calculés**, jamais stockés comme montants. La remise en ligne est une ligne négative bornée.
- **Coût, coefficient, marge** : dans `lignes_devis_couts` (déjà sous RLS) ; `prix = coût × coefficient` ou prix saisi, puis marge € et % dérivées par `prix.ts`. La colonne n'arrive jamais au navigateur sans `voir_couts_devis`.
- **Grille** : composant `GrilleDevis` au-dessus du réducteur existant, avec l'état de sélection (cellule active) et un historique annuler/rétablir (piles bornées, pur, testé). Colonnes configurables et masquables, avec mémorisation par utilisateur. Virtualisation au-delà d'environ 150 lignes.
- **Clavier** : Tab / Maj+Tab entre cellules ; Entrée valide et crée la ligne suivante ; ↑ ↓ entre lignes ; Ctrl+D duplique ; Ctrl+↑ / Ctrl+↓ déplace ; Suppr supprime (avec annulation) ; Ctrl+C / Ctrl+V sur la sélection ; saisie dans la cellule Référence ou Désignation = recherche instantanée d'article ou d'ouvrage. Chaque raccourci est affiché dans l'infobulle de l'action.
- **Autosauvegarde** : enregistrement du brouillon après une pause de saisie via `enregistrer_devis_brouillon_v2` (clés de ligne stables), **avec verrou optimiste** (révision comparée) pour qu'un second onglet n'écrase pas le premier. Indicateur « Enregistré à … / Enregistrement… / Hors ligne ».
- **Mobile** : pas de grille ; liste de lignes en lecture, avec édition d'une ligne en plein écran et les actions principales.

### 5.3 Barre latérale contextuelle (lot E)

- **Registre pur** par entité : `actionsDevis(devis, droits, contexte) → Action[]`, où chaque action porte `id`, `libelle`, `groupe`, `raccourci`, `disponible`, `raison` (texte de l'infobulle quand l'action est indisponible) et sa cible (lien ou action serveur). Exemple : « Transformer en facture — disponible uniquement lorsque le devis est accepté ».
- Un seul composant `PanneauActions` : colonne à droite sur ordinateur, tiroir sur tablette, barre du bas + feuille sur mobile. Actions indisponibles en `aria-disabled`, et non `disabled`, pour que l'infobulle reste lisible au clavier et au lecteur d'écran.
- Registres à livrer : devis, client, facture, situation, commande, fournisseur, article, ouvrage, chantier, planning (événement), stock, salarié, GED, Réserves (liens vers l'application), DOE.
- Les registres sont testés unitairement : pour chaque statut × droit, la liste attendue et la raison de chaque indisponibilité.

### 5.4 Planning (lot F)

- **Nouveau modèle horodaté** (recommandation D1) :
  - `planning_evenements` étendue : table existante inutilisée, dont on vérifiera qu'elle est vide en Production par une requête en lecture seule avant d'écrire la migration. Colonnes : `debut`/`fin` en `timestamptz`, type (9 valeurs), statut, couleur, chantier, client, lot, notes.
  - `planning_affectations` : événement ↔ salarié ou ressource.
  - `planning_ressources` : véhicule, nacelle, machine, matériel, référençant `vehicules` / `outils` quand ils existent.
  - `equipes` et `equipes_membres`.
  - `disponibilites` : horaires types par salarié.
- **Compatibilité** : un déclencheur maintient `affectations` (jour + heures) pour chaque salarié affecté à un événement de type chantier ou activité. Les douze consommateurs SQL et le pointage continuent de fonctionner sans modification. L'ancien écran reste servi drapeau éteint.
- **Conflits** : contrainte `EXCLUDE` (`btree_gist`, `tstzrange`) pour une **ressource matérielle** déjà réservée, bloquante. Pour les salariés, RPC `conflits_planning(periode)` : chevauchement, hors disponibilité, surcharge au-delà du plafond journalier, congé approuvé. Ces conflits sont **signalés, pas bloquants**, car un chef d'équipe peut volontairement doubler un créneau.
- **Vues** : jour, semaine, mois, par salarié, par équipe, par chantier, par ressource, compacte. Une même grille « lignes = ressources × colonnes = temps » paramétrée par la vue, avec des blocs dont le contenu s'adapte à la largeur disponible.
- **Interactions** : pointeur natif (déplacer, redimensionner, dupliquer avec Alt, changer de ressource), création par glisser sur une zone vide, équivalents clavier, et impression/PDF par la chaîne Chromium existante.

### 5.5 Historique, recherche, dernières actions (lots E–G)

- `historique_objets` : ajout seul, avec `entreprise_id`, `ressource`, `ressource_id`, `action`, `utilisateur_id`, `avant`/`apres jsonb` et `sensible bool`. Lecture limitée par le droit de la ressource ; les champs sensibles (coûts, marges) ne sont visibles qu'avec `voir_couts_devis`. Écrit par les RPC et par des déclencheurs ciblés (statut, prix, référence, affectation planning), pas par un déclencheur générique sur toutes les tables.
- `recherche_globale(q, limite)` en SECURITY INVOKER (la RLS filtre) : références, clients, devis, factures, chantiers, fournisseurs, articles, ouvrages, adresses, téléphones, e-mails ; palette Ctrl+K globale. Dans la grille devis, la recherche d'article se fait dans la cellule et **Ctrl+K n'y est plus capté** par l'éditeur.
- Dernières actions : les dix derniers objets distincts touchés par l'utilisateur, lus dans `historique_objets`.

### 5.6 PDF et e-mail (lot G)

Le moteur v2 est conservé tel quel. On ajoute les références interne et client au PDF, les CGV d'entreprise en annexe du PDF, des modèles de message par type de document, CC/CCI via l'API Brevo, la jonction de pièces du devis (plafond de 8 Mo conservé) et une entrée d'historique par envoi et par génération de PDF. Pas d'éditeur de mise en page : l'architecture `document-modele` le prépare pour la V3.

## 6. Risques

| # | Risque | Parade |
|---|---|---|
| R1 | Le lot 0 (1 712 lignes de SQL proposé) n'est prouvé qu'en montée de version, pas en installation à neuf | Fresh + Upgrade sur base jetable avant tout SQL V1 empilé |
| R2 | Redéfinition des 12 consommateurs de `affectations` | ne pas les toucher : table conservée, alimentée par déclencheur |
| R3 | Nouvelles clés de droits : chaque poste existant et les 9 modèles doivent être rattrapés, sinon un gérant perd l'accès | rattrapage « quiconque a `gerer_devis` reçoit les nouvelles clés de devis », prouvé en pgTAP sur les 9 modèles |
| R4 | Autosauvegarde et suppression-réinsertion des lignes : liens `lignes_situations.ligne_devis_id` | autosauvegarde limitée aux brouillons (non liés) ; clés de ligne stables |
| R5 | Unicité des références sur des données réelles déjà en doublon | index partiel créé seulement après backfill non destructif ; collisions listées |
| R6 | Layout global (hors-ligne mobile, `@pilote`, `@responsive`) touché par la barre contextuelle | panneau injecté par page, pas dans `(app)/layout.tsx` ; E2E mobiles rejoués |
| R7 | Recette E2E impossible sous saturation du poste (constaté sur 4 lots) | fenêtre qualifiée par 5 relevés verts ; sinon réserve explicite dans le rapport, jamais « vert » supposé |
| R8 | Nouvelles dépendances NPM : lockfile modifié, `node_modules` à réinstaller | décision D2 ; versions épinglées |

## 7. Dépendances et prérequis

1. **Lot 0 : intégrer le SQL devis v2 au ledger** (numéro alloué depuis le train, jamais depuis cette branche), Fresh + Upgrade, pgTAP déplacé dans `supabase/tests`. Sans lui, rien de ce lot n'est activable.
2. Corrections `service_role` (portail client et pièce jointe d'e-mail) intégrées dans le même train : le lot G les suppose.
3. Correctif des prix d'achat du stock intégré : la colonne « prix d'achat » de la grille ne doit pas exister tant que la 189 laisse fuir `articles_stock`.

## 8. Ordre et estimation

Temps de travail estimé en exécution continue, hors attente machine. La recette E2E dépend de la disponibilité du poste (R7).

| Lot | Contenu | Durée | Dépend de |
|---|---|---|---|
| A | audit, architecture, références (ce rapport) | fait | — |
| A-bis | SQL proposé des références, générateur sûr, backfill, pgTAP | 2–3 h | D3 |
| B | articles et ouvrages : familles, unités, image, doublons, liaison fournisseur | 3–4 h | A-bis |
| C | grille devis : types de lignes, clavier, glisser-déposer, annuler, autosauvegarde, virtualisation, mobile | 6–8 h | B, D2 |
| D | calcul unique, rentabilité, droits fins, transformations, documents issus | 4–5 h | C, D4 |
| E | registre d'actions, panneau contextuel (15 entités), recherche globale, dernières actions | 4–6 h | D |
| F | planning : modèle, compatibilité `affectations`, 8 vues, interactions, conflits, impression | 8–10 h | E, D1, D2 |
| G | PDF, e-mail, historique | 3–4 h | E |
| H | E2E (15 scénarios), performance 10/100/500 lignes et centaines d'événements, non-régression, rapport | 4–6 h + fenêtre machine | tous |
| **Total** | | **≈ 34–46 h** | |

Chaque lot fait l'objet d'un commit séparé, testé et poussé sans force, pour que toute régression soit attribuable à un lot.

## 9. Décisions demandées avant le lot A-bis

| # | Question | Recommandation |
|---|---|---|
| D1 | Modèle du planning | nouveau modèle horodaté + `affectations` maintenue par déclencheur (§ 5.4) |
| D2 | Dépendances NPM | `@dnd-kit/core` + `@dnd-kit/sortable` (glisser-déposer accessible au clavier, lignes de devis) et `@tanstack/react-virtual` (500 lignes, centaines d'événements) ; planning en pointeur natif |
| D3 | Sens de « référence fournisseur » et « code article fournisseur » | à trancher : voir la question posée |
| D4 | Droits fins | nouvelles clés (`modifier_prix_vente`, `modifier_remise`, `supprimer_devis`, `transformer_devis`, `envoyer_devis`, `affecter_ressources`) accordées d'office à qui a déjà `gerer_devis` / `gerer_planning` (aucune perte de droit), et deux modèles de postes « Commercial » et « Poseur » |

**Tranchées par Julien le 2026-09-11 : les quatre recommandations sont retenues.** En particulier D3 :
« référence fournisseur » d'une fiche article = référence du **fabricant** (`reference_fabricant`) ;
« code article fournisseur » = code de l'article chez **un distributeur** (un par fournisseur).

## 10. Lot A-bis — références internes (livré)

### 10.1 Livrables

| Fichier | Rôle |
|---|---|
| `supabase/proposed/gp-v1-metier-references-internes.sql.proposed` | SQL proposé, non numéroté, à appliquer **après** celui du devis v2 |
| `supabase/proposed/gp-v1-metier-references-internes.pgtap.sql.proposed` | preuve pgTAP (69 assertions) |
| `src/lib/references.ts` (+ test) | formats par défaut, nettoyage, validation, aperçu, messages d'erreur ; parité des formats vérifiée contre le SQL |
| `src/lib/erreurs-utilisateur.ts`, `src/app/actions/prestations.ts`, `src/lib/devis/application-import-catalogue.ts` | un refus portant sur une référence produit un message exact sur tous les chemins |
| `src/components/PrestationForm.tsx` | texte d'aide aligné sur la règle d'unicité |

Commits : `e86a6d8`, `dfb9b10`, `4055fff` et le correctif des références sans valeur qui suit.

### 10.2 Ce que fait le SQL

1. **Paramètres par entreprise** (`references_parametres`) : préfixe, largeur, année, génération automatique. Par défaut : CLI-0001, CHA-AAAA-001, FRN-0001 (inchangés), ART-00001 et OUV-0001 (nouveaux).
2. **Générateur sûr** (`generer_reference_interne`) : n'attribue jamais une valeur déjà saisie à la main (défaut A5, **démontré** sur la base d'avant le correctif puis corrigé). Non appelable depuis le navigateur.
3. **Normalisation** : espaces retirés, vide = absent, sur toutes les références, documents compris.
4. **Unicité par entreprise sur la forme normalisée** : clients, chantiers, fournisseurs, catalogue, stock, ouvrages. Une nouvelle référence sans lettre ni chiffre est refusée ; les références historiques de ce type sont conservées et hors du périmètre de l'unicité.
5. **Reprise du stock** : la référence interne reprend le code article quand aucune autre fiche ne le porte sous forme normalisée ; sinon elle reste vide et le doublon est signalé, jamais tranché.
6. **Documents** : `reference_interne` (affaire) et `reference_client` sur devis et factures, `reference_fournisseur` (offre) sur les commandes ; non uniques, bornées, indexées.
7. **Codes distributeurs** (`catalogue_codes_fournisseurs`, D3) : un code par article et par distributeur, un distributeur principal ; **aucune colonne de prix** ; lecture selon le module (devis, stock ou achats), écriture selon `gerer_devis` / `gerer_stock`.
8. **Historique des objets** (`historique_objets`) : ajout seul, aucun droit d'écriture direct, lecture selon le module de l'objet, entrées sensibles réservées à `voir_couts_devis`. Alimenté ici par les changements de référence et de code distributeur ; les lots suivants y ajoutent statuts, prix, envois, planning.
9. **Doublons** : `doublons_references_catalogue` étendue (stock, ouvrages, codes distributeurs, collisions catalogue ↔ stock) et `doublons_references` (tiers compris).
10. **Attribution à la demande** (`attribuer_references_manquantes`) : rien n'est numéroté rétroactivement sans le geste explicite de l'entreprise ; chaque attribution est journalisée.

### 10.3 Écart assumé avec le lot devis v2

Le lot devis v2 avait choisi « aucune unicité » pour la référence interne du catalogue. La V1 l'exige
unique : la preuve pgTAP du devis v2 est adaptée **sur cette branche seulement**, en trois assertions,
avec la raison écrite en commentaire :
- le doublon toléré et signalé porte sur la référence fabricant, qui reste non unique ;
- la variante `BA13-200-H` remonte au rang 3 et non plus au rang 1 ;
- le code du stock devient la référence interne quand il est libre.

Elle passe 111/111. Si le lot devis v2 est intégré seul, sa preuve d'origine reste valable ; intégré
avec celui-ci, c'est la version de cette branche qui fait foi.

### 10.4 Résultats

| Contrôle | Résultat |
|---|---|
| SQL appliqué deux fois de suite (base jetable ledger 280 + devis v2) | 0 erreur : rejouable |
| pgTAP du lot | **69/69** |
| pgTAP du devis v2, adaptée | **111/111** |
| Suite pgTAP existante complète (`supabase/tests`, 70 fichiers) | 1 901 assertions vertes, **1 échec identique sur la base témoin sans le lot** (`reserves_v2_terrain_capture`, préexistant) : aucune différence |
| Montée de version avec données (doublons de stock, références sans valeur, saisie manuelle) | reprise correcte, doublons signalés, génération sûre |
| Montée de version refusée (clients ne différant que par la casse) | arrêt explicite, message et indication de correction, **rien d'appliqué** |
| Vitest (5 fichiers touchés) | 149/149, dont 18 pour `references.ts` |
| Typecheck du projet, lint des fichiers touchés | 0 erreur |

### 10.5 Contrôle préalable en Production (lecture seule)

À lancer avant d'appliquer la proposition : toute ligne renvoyée ferait échouer la migration (bloc 8).
L'expression reproduit `normaliser_reference`, absente de la Production.

```sql
with refs as (
  select 'clients' as t, entreprise_id, reference_interne as r from public.clients where reference_interne is not null
  union all select 'chantiers', entreprise_id, reference_interne from public.chantiers where reference_interne is not null
  union all select 'fournisseurs', entreprise_id, reference from public.fournisseurs
  union all select 'articles_stock', entreprise_id, reference from public.articles_stock
), normes as (
  select t, entreprise_id, r, regexp_replace(lower(translate(
           replace(replace(replace(replace(r, 'œ', 'oe'), 'Œ', 'OE'), 'æ', 'ae'), 'Æ', 'AE'),
           'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖòóôõöÙÚÛÜùúûüÝýÿ',
           'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYyy')), '[[:space:]._/\\-]+', '', 'g') as k
  from refs
)
select t, entreprise_id, k, array_agg(r) as valeurs
from normes where k <> '' and t <> 'articles_stock'
group by t, entreprise_id, k having count(*) > 1
order by t, entreprise_id;
```

Les doublons de `articles_stock` ne bloquent pas : ils restent sans référence interne et sont signalés.

### 10.6 Réserves

1. **Installation à neuf (Fresh) non rejouée**, comme pour le devis v2 : prouvé en montée de version seulement.
2. **Aucun écran** de paramétrage des références ni de saisie des codes distributeurs : c'est le lot B. La recherche d'article par code distributeur l'est aussi.
3. La **recopie** des références d'affaire et client du devis vers la facture relève de la refonte des transformations (lot D).
4. Le texte d'aide de la fiche article n'a pas été vu dans un navigateur : l'écran n'existe que drapeau `GP_DEVIS_V2` activé, et la base locale de développement est au ledger 265.
5. Défaut A6 (`a_permission` et session support) : hors lot, à confier à un lot sécurité.

### 10.7 Retour arrière

Tout est additif. Pour revenir en arrière :
- supprimer les déclencheurs `gp_*` et `a_gp_*`, les tables `references_parametres`, `catalogue_codes_fournisseurs` et `historique_objets`, les index `*_norm_uniq` et les contraintes `*_signifiante_check` ;
- rejouer les définitions d'origine de `trg_ref_client` / `trg_ref_chantier` (20260710000004), `trg_fournisseur_reference` (20260710000021) et `doublons_references_catalogue` (proposition devis v2).

Aucune donnée n'est supprimée. La reprise du stock ne fait que remplir `reference_interne`, qui était vide.

## 11. Lot B — bibliothèque d'articles et d'ouvrages (livré)

### 11.1 Livrables

| Fichier | Rôle |
|---|---|
| `supabase/proposed/gp-v1-metier-bibliotheque.sql.proposed` | SQL proposé, non numéroté, à appliquer **après** celui des références |
| `supabase/proposed/gp-v1-metier-bibliotheque.pgtap.sql.proposed` | preuve pgTAP (67 assertions) |
| `src/lib/catalogue/prix-article.ts`, `familles.ts`, `src/lib/historique.ts` (+ tests) | prix, coefficient et marges en décimal exact ; arbre et libellés des familles ; historique lisible |
| `src/lib/devis/recherche-articles.ts` (+ test) | codes distributeurs et famille dans le classement, en miroir du SQL |
| `src/lib/prestations-catalogue-v2*.ts`, `src/app/actions/catalogue-v2.ts`, `src/app/actions/prestations.ts` | lecture des champs, chargement de la fiche, actions serveur |
| `src/components/PrestationForm.tsx`, `src/components/prestations/*` | fiche article, bloc prix, compléments de fiche, liste du catalogue |
| `src/app/(app)/prestations/page.tsx`, `…/[id]/modifier/page.tsx`, `…/familles/page.tsx`, `…/doublons/page.tsx` | écrans |
| `src/components/parametres/*NumerotationReferences.tsx`, `src/app/(app)/parametres/page.tsx` | numérotation des références (lot A-bis rendu utilisable) |
| `src/components/devis/SelectionArticlesDialog.tsx` | code distributeur, famille et favori dans la sélection d'articles |
| `tests/banc/catalogue-v1/` | banc navigateur (vrais composants, données fictives) |

Commits : `56bc26e`, `a18cd51`, `d554368`, `767b0aa`, `8772a09` et ce rapport. Tout l'écran reste
derrière `GP_DEVIS_V2` : drapeau éteint, les écrans historiques du catalogue sont inchangés.

### 11.2 Ce que fait le lot

1. **Familles et sous-familles** : deux niveaux, communes au catalogue, au stock et aux ouvrages. Le nom est unique sous un même parent sur la forme normalisée, et le parent appartient à la même entreprise. Une famille qui range encore quelque chose ne se supprime pas, on l'archive.
2. **Catégorie texte = libellé dérivé** de la famille. Une catégorie importée est rattachée à la famille active de même libellé ; sinon elle reste un texte libre, et aucune famille n'est créée en silence. Renommer une famille met à jour les libellés.
3. **Reprise** : les catégories existantes deviennent des familles de premier niveau. La graphie retenue est la plus fréquente, puis celle qui n'est pas tout en minuscules. La reprise ne réécrit aucune catégorie et n'écrit rien au journal.
4. **Favoris** personnels, jamais partagés, qui passent en tête de la recherche à rang égal.
5. **Coefficient et mode de prix** (saisi ou calculé), rangés avec le prix d'achat sous `voir_couts_devis` / `gerer_couts_devis`. En mode calculé, le serveur **recalcule** le prix de vente. Sans droit sur les coûts, le prix saisi fait foi et les coûts enregistrés restent intacts.
6. **Images** dans un bucket privé, sous le dossier de l'entreprise (la base refuse tout autre chemin), servies par URL signée de 15 min. Elles ne sont **jamais supprimées**, parce qu'elles peuvent figurer sur un document émis.
7. **Recherche d'articles** : code distributeur aux rangs 2, 4 et 6 (comme la référence fabricant), famille au rang 7.
8. **Duplication** : copie nommée « (copie) » avec une nouvelle référence. Code-barres et codes distributeurs ne sont pas recopiés. Le coût n'est recopié qu'avec `gerer_couts_devis`. La duplication est journalisée avec sa source.
9. **Historique** :
   - catalogue : création, désignation, prix de vente, TVA, unité, nature, archivage, famille ;
   - ouvrages : nom, statut, famille, version ;
   - stock : désignation, prix de vente, état, famille ;
   - coûts : entrées **sensibles**, lisibles seulement avec `voir_couts_devis`.
10. **Écrans** :
    - fiche article : famille, notes internes, bloc prix avec marge en direct, image, codes distributeurs, historique, favori, duplication ;
    - liste : code distributeur, famille, favoris, filtres ;
    - pages Familles et Contrôle des doublons ;
    - Paramètres › Numérotation des références, avec attribution à la demande.

### 11.3 Résultats

| Contrôle | Résultat |
|---|---|
| SQL appliqué deux fois de suite (après devis v2 et références) | 0 erreur |
| pgTAP du lot | **67/67** |
| pgTAP des références / du devis v2 (adaptée) | 69/69 / 111/111, avec la recherche redéfinie |
| Suite pgTAP existante complète (70 fichiers) | 1 901 vertes, 1 échec **identique sur la base témoin** (`reserves_v2_terrain_capture`) : aucune différence |
| Montée de version avec données | voir détail ci-dessous |
| Vitest, modules touchés | 116/116 (8 fichiers) |
| Vitest, suite complète | voir détail ci-dessous |
| Typecheck du projet / lint des fichiers touchés | 0 / 0 |
| Banc navigateur (données fictives, aucune erreur de console) | voir détail ci-dessous |

**Montée de version avec données.** `Plâtrerie` et `platrerie` sont regroupées sous « Plâtrerie ». « carrelage », présent deux fois, l'emporte sur « Carrelage ». Les catégories vides ou sans valeur sont ignorées, les ouvrages sont rattachés, et le journal reste vide.

**Vitest, suite complète.** Deux passages :
- 1er passage : 2 293 réussis, 3 échecs (`xlsx.test.ts` et webhook Stripe Boutique ×2) ;
- 2e passage : 2 295 réussis, 1 échec (`xlsx.test.ts`).

Ces deux fichiers de test et le code qu'ils exercent sont identiques à `516469d`, et ils passent seuls (7/7). C'est une instabilité sous charge **préexistante**, déjà consignée par les lots précédents.

**Banc navigateur.**
- Le bloc prix s'affiche correctement dans ses trois états de droits.
- Coefficient 1,75 → prix de vente 21,88 €, marge 9,38 €, taux de marge 75,04 %, taux de marque 42,87 %.
- Un prix saisi sous le coût déclenche l'alerte.
- Les filtres famille et favoris fonctionnent.
- À 375 px, la page ne déborde pas.

### 11.4 Réserves

1. **Pas d'E2E réel ni de `next build`** : le worktree n'a aucun fichier d'environnement, et la base locale de développement est au ledger 265, à ne pas réinitialiser. Les pages serveur (fiche, familles, doublons, paramètres) ne sont vérifiées que par typecheck et lint ; les composants clients le sont sur banc.
2. **Famille** : aucun écran sur la fiche ouvrage ni sur le stock. La colonne et le rattachement par libellé existent en base.
3. **Codes distributeurs** : saisie seulement pour le catalogue des devis ; la table accepte aussi le stock.
4. **Images** limitées à 2 Mo (limite des Server Actions), alors que le bucket en accepte 5. Pas de miniature dans la liste, et pas encore d'image sur le PDF (lot G).
5. **Mode calculé** : le prix n'est recalculé que lorsqu'un gestionnaire des coûts enregistre l'article.
6. **Changement du distributeur principal** en deux écritures, sans transaction. L'index unique empêche deux principaux ; au pire, il reste un instant sans principal.
7. **Recherche d'ouvrages** : ni favoris ni famille dans son classement. À reprendre au lot C, avec l'insertion depuis la grille.

Recette : `.claude/launch.json` du dépôt principal a reçu une entrée de serveur statique le temps du banc,
retirée ensuite ; les modifications locales préexistantes de ce fichier ne sont pas touchées.

### 11.5 Retour arrière

Tout est additif. Pour revenir en arrière :
- supprimer les déclencheurs `gp_categorie_famille`, `gp_historique_catalogue`, `gp_historique_couts` et `catalogue_familles_*` ;
- supprimer les tables `catalogue_familles` et `catalogue_favoris`, les colonnes `famille_id`, `notes_internes`, `image_chemin`, `coefficient` et `mode_prix`, et les fonctions `dupliquer_prestation`, `libelle_famille` et `dossier_entreprise` ;
- rejouer `rechercher_articles_devis` depuis la proposition devis v2.

Les objets du bucket `catalogue-images` sont conservés. Côté code, retirer `GP_DEVIS_V2`.

## 12. Lot C — grille de devis ligne par ligne (livré)

### 12.1 Livrables

| Fichier | Rôle |
|---|---|
| `supabase/proposed/gp-v1-metier-grille-devis.sql.proposed` (+ `.pgtap`, 36 assertions) | types de lignes, coûts MO/coefficient, révision, en-tête, verrou, rendu, RPC, duplication, conversion |
| `src/lib/devis/types-ligne.ts`, `historique-edition.ts`, `colonnes-grille.ts`, `marge-ligne.ts` (+ tests) | 10 types de lignes et leurs règles, annuler/rétablir borné, colonnes selon droits, marge par ligne |
| `src/lib/devis/presentation.ts`, `pagination.ts`, `src/components/documents/DocumentA4.tsx` | sous-totaux calculés, base de remise de section, genres de lignes client, saut de page |
| `src/lib/devis/editeur-etat.ts` | insertion typée, duplication, déplacement libre, article depuis la cellule, coûts de ligne, remises recalculées, validation par type |
| `src/lib/devis/enregistrement-v2.ts`, `brouillon-v2.ts`, `rendu-source.ts`, `editeur-v2-serveur.ts`, `src/app/actions/devis-v2.ts` | aller-retour des nouveaux champs, révision, commerciaux |
| `src/components/devis/GrilleDevis.tsx` | la grille |
| `src/components/devis/EditeurDevisV2.tsx` | en-tête complet, barre d'outils, autosauvegarde, Ctrl+Z/Y, colonnes, saisie mobile, rentabilité |
| `package.json` | `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `@dnd-kit/utilities` 3.2.2, `@tanstack/react-virtual` 3.14.12 (D2) |

Commits : `81892a1` (SQL), `66648c8` (code) et le commit de ce rapport. Tout reste derrière `GP_DEVIS_V2`.

### 12.2 Ce que fait le lot

- **Dix types de lignes** : article, prestation libre, titre, sous-titre, commentaire, sous-total, remise, ligne vide, séparateur, saut de page. Règle tenue par la base **et** l'écran : une ligne non chiffrée porte 0 / 0 / 0 ; un sous-total est **calculé** (somme depuis le sous-total précédent), jamais enregistré comme montant ; une remise est un montant négatif à quantité 1, en % de sa section (recalculé à chaque changement, jamais réparti en silence sur plusieurs taux de TVA : signalé) ou fixe. `recalc_totaux_devis` reste inchangé et juste.
- **Grille** : cellules validées à la sortie ; Tab / Maj+Tab, Entrée (valide, descend, crée en bas), ↑ ↓, Ctrl+D, Ctrl+↑/↓, Ctrl+Suppr, Ctrl+C / Ctrl+V d'une ligne, Échap ; recherche d'article **depuis la cellule Désignation** (rangs du catalogue, insertion d'un ouvrage) ; glisser-déposer (pointeur et clavier) ; virtualisation au-delà de 150 lignes ; raccourcis dans les infobulles.
- **Colonnes** : référence, désignation, description, réf. fabricant, code distributeur, famille, fournisseur, quantité, unité, achat, MO, coefficient, marge €, marge %, PU, remise, TVA, total, commentaire interne. Les colonnes de coût **n'existent pas dans la page** sans `voir_couts_devis` ; modifiables selon `gerer_couts_devis`. Réglage par utilisateur (localStorage, lu avec indulgence).
- **En-tête** : référence d'affaire (interne, libre après émission), référence client (imprimée, figée après émission), commercial (salarié de l'entreprise, vérifié en base), date, validité, mode de règlement, conditions de paiement, remise globale, conditions, notes.
- **Autosauvegarde** 2 s après une pause, avec **verrou optimiste** : la révision lue est envoyée, un enregistrement sur une révision périmée est refusé (40001) — jamais d'écrasement silencieux ; hors ligne, les modifications restent à l'écran. Un nouveau devis reçoit son identifiant au premier enregistrement (adresse mise à jour sans navigation). Indicateur « Enregistré à hh:mm ».
- **Annuler / rétablir** (100 niveaux, Ctrl+Z / Ctrl+Y) ; un en-tête modifié compte pour une entrée à la sortie du champ.
- **Mobile** : liste des lignes, saisie d'une ligne en plein écran ; aucun débordement à 375 px.
- **Rentabilité** sous les totaux (coût, marge, taux de marque) pour qui voit les coûts.
- **Facture et duplication** recopient les types de lignes, la remise de section, le commentaire interne (jamais imprimé) et l'en-tête ; le rendu client ne reçoit jamais commentaire interne, code ni nom du distributeur.

### 12.3 Résultats

| Contrôle | Résultat |
|---|---|
| SQL appliqué deux fois de suite (après devis v2, références, bibliothèque) | 0 erreur |
| pgTAP du lot | **36/36** |
| pgTAP devis v2 / références / bibliothèque, rejouées après le SQL du lot | 111/111 · 69/69 · 67/67 |
| Vitest `src/lib/devis` + documents | 332/332 (dont 30 nouveaux : types, historique, colonnes, structure) |
| Typecheck du projet, lint des composants devis | 0 / 0 (1 avertissement préexistant) |
| Banc navigateur (vrai éditeur, actions simulées) | saisie clavier complète d'une ligne (12,5 × 1,6 → 20 €, total 800 €, marge 300 €), création de ligne par Tab en fin de grille, recherche depuis la cellule (« BA13 » → 3 articles classés, insertion au clavier avec références et prix d'achat), insertion sous-total (824 €) et remise 5 %, Ctrl+Z / Ctrl+Y, autosauvegarde à 2 s avec révision et adresse mise à jour, aucune erreur de console, mobile sans débordement |

### 12.4 Réserves

1. **Banc historique** `tests/banc/editeur-v2/editeur-v2.banc.spec.ts` : non rejoué ; ses sélecteurs visent les anciennes cartes de lignes et sont à adapter à la grille (lot H).
2. **Pas de recette réelle** (pile Supabase + Next, drapeau posé) — même situation que les lots précédents.
3. **Performance** à 100 / 500 lignes : virtualisation en place, mesure à faire au lot H.
4. Une remise en % insérée **après** un sous-total porte sur la section suivante (donc 0 tant qu'elle est vide) : conforme à la règle, à expliquer dans l'aide.
5. Recherche d'ouvrage depuis la cellule : ouvre le dialogue d'ouvrage existant (insertion après la ligne) ; les favoris et familles n'entrent pas encore dans le classement des ouvrages.
6. Défaut A5 corrigé au lot A-bis ; défaut A6 (`a_permission` et session support) toujours hors lot.

### 12.5 Retour arrière

Additif : supprimer les colonnes `type_ligne`, `remise_section_pct`, `commentaire_interne`, `*_instantane` (lignes), `cout_main_oeuvre_ht`, `coefficient` (coûts), `revision`, `mode_reglement`, `conditions_paiement`, `commercial_employe_id` (devis / factures) ; rejouer `enregistrer_devis_brouillon_v2`, `dupliquer_devis`, `creer_facture_depuis_devis`, `ligne_pour_rendu`, `verrouiller_devis_emis` et la politique du journal depuis la proposition devis v2. Côté code, retirer `GP_DEVIS_V2`.

## 13. État à ce jalon

| Lot | État |
|---|---|
| A audit / architecture / références | **terminé** |
| A-bis références internes | **terminé** |
| B bibliothèque articles et ouvrages | **terminé** |
| C grille de devis | **terminé** (réserves § 12.4) |
| D calcul unique, droits fins (D4), transformations, documents issus | non démarré |
| E barre contextuelle, recherche globale, dernières actions | non démarré |
| F planning | non démarré |
| G PDF, e-mail, historique | non démarré |
| H E2E, performance, non-régression, rapport final | non démarré |

Verdict provisoire : **GO SOUS CONDITIONS pour les lots livrés**, NO-GO V1 COMMERCIALISABLE tant que D à H ne sont pas faits et que le lot 0 (SQL devis v2 numéroté au ledger) n'est pas intégré.

## 14. Lot D — droits fins, calcul unique, transformations, documents issus (livré)

### 14.1 Livrables

| Fichier | Rôle |
|---|---|
| `supabase/proposed/gp-v1-metier-droits-transformations.sql.proposed` (+ `.pgtap`, 26 assertions) | six clés fines (D4), rattrapage, modèles Commercial et Poseur, droits tenus en base, historique des documents, documents issus |
| `src/lib/droits-devis.ts` (+ test) | miroir de `droit_fin` : clé accordée ou héritée du parent ; motifs lisibles pour les actions grisées |
| `src/app/actions/devis.ts`, `factures.ts`, `suite-metier.ts`, `chantiers.ts` | contrôles TypeScript avant la base : statut « envoyé », suppression, e-mail, facture, acompte, situation, chantier depuis devis |
| `src/lib/devis/editeur-v2-serveur.ts`, `colonnes-grille.ts`, `GrilleDevis.tsx`, `EditeurDevisV2.tsx` | prix de vente, remise de ligne, ligne de remise et remise globale suivent `modifier_prix_vente` / `modifier_remise` |
| `src/components/FactureEditor.tsx`, `factures/[id]/modifier/page.tsx` | défaut A2 corrigé : totaux exacts (`totauxDocument`), remise globale comprise ; plus de calcul flottant |
| `src/components/devis/DocumentsIssusDevis.tsx`, `devis/[id]/page.tsx` | « Documents issus de ce devis » (factures, acomptes, avoirs, situations, chantier) sous la RLS ; transformation grisée avec motif sans le droit |

### 14.2 Ce que fait le lot

- **Six clés** : `modifier_prix_vente`, `modifier_remise`, `supprimer_devis`, `transformer_devis`, `envoyer_devis` (Devis) et `affecter_ressources` (Planning, consommée au lot F).
- **Aucune perte de droit** : rattrapage des postes existants (ouvertes si le poste gère déjà les devis / le planning), ajout aux modèles qui gèrent les devis, et règle `droit_fin` : une clé non configurée est **héritée** du droit parent, une clé configurée à faux ferme. Un poste créé hors catalogue ne perd rien ; l'administrateur peut fermer finement.
- **Modèles** « Poseur » (terrain, aucun prix) et « Commercial » (clients, devis, prix de vente, remises, envoi, transformation ; ni coût, ni marge, ni comptabilité).
- **Tenue en base** : suppression (politique RLS restrictive) ; passage à « envoyé » (déclencheur) ; conversion en facture (RPC) ; prix et remises **dans la RPC d'enregistrement** : sans `modifier_prix_vente`, une ligne existante garde son prix, un article inséré prend le prix du catalogue, aucune ligne libre chiffrée ; sans `modifier_remise`, remise globale, remises de ligne et lignes de remise inchangées. Acompte, situation et chantier depuis le devis : contrôle TypeScript (les fonctions historiques ne sont pas redéfinies ici — réserve).
- **Historique** : création, statut et numéro des devis et factures dans `historique_objets`.
- **Documents issus** : la fiche devis liste ce qui en découle ; navigation devis → facture → paiements déjà présente côté facture.
- **Calcul unique** : `FactureEditor` passe sur `totauxDocument` avec la remise globale (défaut A2).

### 14.3 Résultats

| Contrôle | Résultat |
|---|---|
| SQL appliqué deux fois (après devis v2, références, bibliothèque, grille) | 0 erreur |
| pgTAP du lot | **26/26** (héritage, fermeture explicite, prix/remise refusés et acceptés, suppression sans effet, envoi refusé puis accepté, conversion refusée au comptable sans le droit, documents issus cloisonnés) |
| pgTAP devis v2 / grille, rejouées après | 111/111 · 36/36 |
| Vitest (`src/lib`, `src/components`) | 1 794 verts ; 1 échec `xlsx.test.ts` (préexistant, fichier identique à `516469d`, vert seul) |
| Typecheck du projet, lint des fichiers touchés | 0 / 0 |

### 14.4 Réserves

1. `creer_facture_avancee`, `creer_situation_travaux`, `creer_chantier_depuis_devis` : `transformer_devis` n'est vérifié qu'en TypeScript (redéfinir ces trois fonctions historiques est un lot à part).
2. Le prix des composants d'un **ouvrage** n'est pas soumis à `modifier_prix_vente` (le prix global de l'ouvrage passe par ses propres dialogues) — à étendre.
3. L'écran ne voit pas une clé configurée à **faux** (seules les clés accordées sont transmises) : un bouton peut rester actif et la base refuser avec un message clair. Le lot E lit les mêmes droits pour griser.

## 15. Lot E — barre latérale contextuelle, recherche globale, dernières actions (livré)

### 15.1 Livrables

| Fichier | Rôle |
|---|---|
| `src/lib/actions-contextuelles/registre.ts` (+ test, 10 cas) | registre PUR : devis (23 actions), client, facture, chantier, fournisseur, article, ouvrage, commande, stock, salarié, planning, situation — chaque action indisponible porte son motif |
| `src/components/actions/PanneauActions.tsx` (+ test de rendu) | colonne fixe à droite sur ordinateur, barre basse + feuille sur tablette et téléphone ; indisponible = visible, grisé, `aria-disabled`, motif en infobulle et au lecteur d'écran (jamais `disabled`) |
| Fiches devis, client, facture, chantier, fournisseur, salarié, commande, stock, article | panneau monté, actions serveur branchées (dupliquer, transformer en facture, annuler, supprimer, archiver…) |
| `supabase/proposed/gp-v1-metier-recherche-globale.sql.proposed` (+ pgTAP 13) | `recherche_globale` (référence, numéro, nom, désignation, adresse, téléphone, e-mail ; SECURITY INVOKER : la RLS filtre), `dernieres_actions`, création des tiers journalisée |
| `src/app/actions/recherche.ts`, `src/components/PaletteRecherche.tsx` | palette Ctrl+K partout (Ctrl+Maj+K dans l'éditeur de devis, qui garde Ctrl+K pour ses articles), ↑ ↓ Entrée Échap, dernières actions sans saisie |
| `src/components/DernieresActions.tsx`, tableau de bord | bloc « Dernières actions » (un clic rouvre l'objet) |
| `src/components/HistoriqueObjet.tsx` | historique par objet (devis, client, facture), sous la RLS de l'historique |

### 15.2 Résultats

| Contrôle | Résultat |
|---|---|
| SQL appliqué deux fois | 0 erreur |
| pgTAP du lot | **13/13** (référence normalisée au rang 1, numéro, téléphone sans espaces, e-mail, nom partiel, code stock, cloisonnement B, ouvrier sans accès : aucun client/devis/facture, conducteur : pas de facture ; dernières actions propres à l'utilisateur) |
| Vitest registre + panneau + historique | 21/21 |
| Typecheck du projet, lint des fichiers touchés | 0 / 0 |

### 15.3 Réserves

1. Panneau non monté sur la fiche **ouvrage** (structure de page non lue), sur les **situations** (liste unique) ni sur le **planning** (lot F) ; GED, Réserves et DOE sont des liens du panneau chantier (`/documents`, `#reserves`, `/doe`).
2. « Importer des lignes » et « Transformer en commande » sont annoncés indisponibles en V1 (motif explicite), pas cachés.
3. Le panneau fixe suppose une marge droite (`lg:pr-72`) posée page par page ; les pages non montées ne la portent pas.
4. Recette navigateur du panneau et de la palette non faite (rendu serveur testé) : à couvrir au lot H.

## 16. Lot F — planning refondu façon Batappli (livré)

Le planning historique (table journalière `affectations`, formulaire par cellule) reste rendu à
l'identique quand `GP_PLANNING_V2` est absent. Drapeau posé (`GP_PLANNING_V2=1`) **et** schéma
migré, `/planning` devient un planning horodaté, dense, manipulé directement, avec ressources,
conflits et barre latérale (décision D1 : nouveau modèle + `affectations` maintenue par déclencheur).

### 16.1 Livrables

| Fichier | Rôle |
|---|---|
| `supabase/proposed/gp-v1-metier-planning.sql.proposed` (525 l.) | `planning_evenements` (titre, type, statut, début/fin horodatés, journée entière, couleur, chantier, client, adresse, notes), `planning_ressources` (véhicule, nacelle, machine, matériel), `equipes` + `equipes_membres`, `planning_disponibilites`, `planning_affectations` (salarié, équipe ou ressource) ; **compatibilité** : `affectations` (jour + heures, `notes = 'PLN:<id>'`) réécrite par déclencheur à chaque changement d'évènement, d'affectation ou de membre d'équipe — les ~12 fonctions SQL historiques (paie, pointage, alertes) continuent de lire la même table ; ressource physique **bloquante** (deux évènements simultanés sur la même nacelle refusés, P0001) ; `conflits_planning` (salarié en double, ressource en double, congé, hors disponibilités, plus de 10 h) ; RPC `enregistrer_evenement_planning` / `supprimer_evenement_planning` (SECURITY DEFINER, membre actif et `gerer_planning` vérifiés explicitement, `affecter_ressources` pour les affectations, historique journalisé) ; RLS par entreprise, lecture pour `acces_planning`, écriture pour `gerer_planning` |
| `…planning.pgtap.sql.proposed` | 25 assertions |
| `src/lib/planning/modele.ts` (+ test, 12 cas) | module PUR : dates Paris sans bibliothèque, jours d'une vue, lignes (salarié, équipe, chantier, ressource), projection en **blocs** (chevauchements en colonnes en vue jour, empilement en vues à colonnes-jours), conflits calculés en direct (miroir de la base), `deplacer`, `redimensionner`, `changerLigne`, `dupliquer` |
| `src/lib/planning/serveur.ts`, `src/app/actions/planning-v2.ts` | chargement sous la RLS de l'utilisateur ; actions serveur qui revérifient drapeau, entreprise, droit, titre, type, statut, bornes avant la RPC |
| `src/components/planning/PlanningV2.tsx` (+ test de rendu, 6 cas) | **8 vues** : jour (salariés × heures, zoom 32–160 px/h), semaine, mois, par salarié, par équipe, par chantier, par ressource, compacte (liste dense) ; **glisser-déposer** au pointeur (déplacer dans le temps et d'une ligne à l'autre — changer de salarié, d'équipe, de chantier, de ressource), **étirer** la fin (vue jour), **Alt + glisser** = dupliquer, **glisser sur une zone vide** = créer (heure de début à 15 min près), clic = sélection (barre latérale), double clic / Entrée = détail ; clavier : ← → (15 min, Ctrl : 1 jour), ↑ ↓ (ligne), Ctrl+D, Suppr, Échap ; filtres type / chantier / recherche ; conflits sur les blocs (⚠, liseré) et récapitulés sous la grille ; dialogue d'édition avec salariés, équipes et ressources (lecture seule sans `affecter_ressources`) ; mise à jour optimiste puis rafraîchissement serveur, erreur de la base rendue et état restauré |
| `src/components/actions/PanneauActions.tsx` | prop `handlers` (gestionnaires navigateur) — le planning est le premier écran interactif à l'utiliser : Nouvel évènement, Modifier, Déplacer, Dupliquer, Affecter une équipe, Changer l'horaire, Ouvrir le chantier / le client / les documents, Imprimer, Historique, Supprimer — chaque action indisponible reste visible avec son motif |
| `src/app/(app)/planning/page.tsx` → `PlanningV2Page.tsx` | aiguillage par drapeau ; `?jour=AAAA-MM-JJ&vue=` (l'ancien `?semaine=` est accepté) |
| `src/app/(app)/planning/historique/page.tsx` | historique d'un évènement (création, modification, affectations, suppression) |
| `src/app/imprimer/planning/page.tsx`, `src/app/api/documents/planning/pdf/route.ts` | impression A4 paysage (grille sujets × jours ou liste chronologique, conflits) ; PDF par Chromium avec le cookie de l'appelant (moteur 2, format fixé par la page) |
| `tests/banc/planning-v2/` | banc navigateur (vrais composants, données fictives, actions doublées en mémoire) |
| `supabase/tests/correctif_isolation_devis_client.test.sql` | assertion « 5 policies sur devis » rendue tolérante à la policy restrictive de suppression du lot D (comptée à part) — vraie avant et après la migration |
| `src/app/actions/workflow-devis.test.ts` | permissions doublées ; cas ajouté : sans `transformer_devis` ni `gerer_devis`, refus avant tout appel RPC avec le motif |

### 16.2 Point délicat résolu : notifications

Le déclencheur historique `trg_notifications_affectations` notifie ligne par ligne ; une synchronisation
réécrit plusieurs lignes (salariés × jours) dans la **même transaction** et l'index
`notifications_evenement_unique` (utilisateur, type, ressource, `created_at`) refusait la seconde
(23505). Le lot redéfinit ce déclencheur avec son corps historique **inchangé** pour toute ligne
ordinaire et un seul ajout : les lignes `PLN:%` sont ignorées ; le planning v2 notifie alors **une fois
par salarié et par évènement** (ajouté, retiré, modifié, annulé), en `on conflict do nothing`.

### 16.3 Résultats

| Contrôle | Résultat |
|---|---|
| SQL appliqué deux fois sur `gpv1_jetable` | 0 erreur |
| pgTAP du lot | **25/25** (compatibilité : 1 évènement 8 h–12 h = 1 ligne `affectations` de 4 h ; équipe de deux sur deux jours = 4 lignes, 33 h ; retrait d'un membre = lignes retirées ; annulation = lignes retirées ; ressource en double refusée P0001 ; conflit salarié détecté ; `affecter_ressources` refusé 42501 ; ouvrier sans `gerer_planning` refusé ; cloisonnement B ; historique journalisé) |
| Suite pgTAP complète (70 fichiers) sur la base empilée A-bis → F | **1 901 ok / 1 échec** préexistant (`reserves_v2_terrain_capture`, identique sans le lot) |
| Vitest planning (modèle 12, composant 6) | 18/18 |
| Vitest projet | 2 360 verts ; `xlsx.test.ts` échoue sous la charge de la suite complète et passe seul (préexistant, § 14.3) |
| Typecheck du projet / lint du projet | 0 erreur / 0 erreur (6 avertissements préexistants) |
| Banc navigateur (Chromium du poste, 1 100 × 720) | vue semaine : une ligne par salarié, 7 colonnes, blocs empilés dans une case ; glisser « Dépannage » du mardi (Ali) au jeudi (Dan) → enregistrement `debut` +2 jours, affectation `s1` → `s4` ; Alt + glisser « Livraison » → nouvel évènement enregistré, l'original conservé (2 blocs) ; vue jour : glisser +2 h → 10:00–14:00 ; étirer +1 h → fin 18:00 ; glisser sur une zone vide 14 h → 16 h → dialogue « Nouvel évènement » 14:00–16:00, salarié de la ligne coché, enregistré avec le titre saisi, fermeture sans enregistrer = brouillon retiré ; clavier → +15 min, ↓ change de salarié ; vues équipe (« Hors équipe »), ressource (« Sans ressource »), chantier, compacte (11 lignes), mois (5 semaines) ; lecture seule : actions grisées avec le motif `gerer_planning` ; téléphone : agenda en colonne, feuille « Actions » en bas |

### 16.4 Réserves

1. `hors_disponibilite` en base repose sur le jour de **début** de l'évènement (un évènement à cheval sur deux jours n'est vérifié que sur le premier) ; le TypeScript fait de même.
2. Aucune récurrence (répéter chaque semaine) : hors périmètre V1, à noter comme demande.
3. Le PDF n'a pas été produit sur ce poste (Chromium serverless absent, comme pour les devis) : la page d'impression est rendue et testée, la route reprend le mécanisme des devis à l'identique.
4. L'impression en vue **mois** liste les jours du mois en colonnes (jusqu'à 31) : lisible en A4 paysage à 9 px, dense.
5. La page historique et la fiche d'un évènement supposent le schéma migré : sans le lot 0, `/planning` reste l'ancien écran.
