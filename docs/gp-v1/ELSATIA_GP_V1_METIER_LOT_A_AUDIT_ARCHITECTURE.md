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
