# ELSATIA-GP-DEVIS-WYSIWYG-CATALOGUE-OUVRAGES-V1 — rapport de lot

> Date : 2026-09-11 · Branche : `feat/gp-devis-wysiwyg-catalogue-ouvrages-v1`
> SHA de départ : `bb17c17` · SHA final : `175de81` (code validé) ; ce rapport = commit suivant, sans modification de code
> Aucun déploiement, aucune fusion, aucun Stripe Live, aucun prix d'abonnement touché, aucune
> migration existante modifiée, aucun numéro de ledger réservé.

## 1. Verdict

**PRÊT À INTÉGRER SOUS CONDITIONS**

Le lot livre un éditeur de devis visuel complet (aperçu A4 réel pendant la saisie), un catalogue
à références distinctes avec recherche en sept niveaux et sélection multiple au clavier, une
bibliothèque d'ouvrages composés versionnée, quatre présentations client, la gestion du prix
global et des marges, des filigranes sur devis et factures, et le figement des documents émis —
le tout derrière un drapeau `GP_DEVIS_V2`, **éteint par défaut**.

Drapeau éteint, l'application se comporte exactement comme avant, à trois correctifs près, actifs
d'emblée parce qu'ils ne dépendent d'aucun schéma nouveau :

1. **Sécurité PDF** : le cookie de session n'est plus envoyé à toutes les origines chargées par
   la page imprimée (logo Supabase, URL signées) ;
2. **Logo** : changer de logo ne supprime plus l'ancien fichier, qui cassait le logo de toutes
   les factures déjà émises ;
3. **Test de surface** : `document_rendu_par_token` ajoutée à la liste blanche documentée du partage
   public (sans effet tant que la migration n'est pas appliquée).

L'**activation** (drapeau posé) exige la migration proposée, numérotée et appliquée : c'est la
première condition (§ 13).

## 2. Démarrage et canon retenu

| Contrôle | Constat |
|---|---|
| Dernier canon intégré | Train V3 `52d3282` (+ rapport `59e960a`), ledger 278 fichiers, n° max 280 |
| Branche GP la plus récente | `feat/gp-mobile-authenticated-pilot-closure-v1` @ `bb17c17` = `52d3282` + 25 commits mobiles, dont `b0df9a7` (phase L « partie pure ») |
| Base retenue | **`bb17c17`** : même schéma que le Train V3, et le rapport mobile désigne ce lot comme sa suite obligatoire (phase L) |
| Ledger global (toutes branches, locales et distantes) | n° max **281** (`20260909000281`, Colors, non fusionné) → aucun numéro réservé : SQL en `.sql.proposed` |
| Autres conversations | « Fondation mobile Gestion Pro » (inactive puis lot notes de frais dans SON worktree) ; aucun worktree partagé |
| Worktree | `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/gp-devis-wysiwyg-catalogue-ouvrages-v1` (node_modules clonés APFS, même lockfile) |
| Machine | charge 13–18 toute la journée, VM Docker 460–890 % (piles d'autres conversations, jamais arrêtées) → aucune nouvelle pile ; recette SQL dans une base jetable du conteneur de développement local ; recette navigateur sur banc hors application |

## 3. Audit de l'existant (phase A)

| Domaine | État avant le lot | Constat |
|---|---|---|
| `reference_interne` d'article | Absent | Seulement entreprises, clients, chantiers, employés ; `articles_stock.reference` UNIQUE = code article du stock |
| Référence fabricant | Partiel | `fiches_techniques_articles` seulement |
| Code-barres | Existant | `articles_stock`, unique par entreprise |
| Catalogue des devis | Partiel | `prestations_catalogue` sans référence, sans coût, suppression physique permise |
| Recherche / sélection multiple | Absent | `<select>` natif ; `recherche-articles.ts` testé mais branché nulle part |
| Ouvrages composés | Absent | l'écran « Ouvrages » = modèles de devis à plat + métrés (bêta masqué) |
| Lignes de devis | Partiel | aucune origine, aucun instantané, identifiants recréés à chaque enregistrement |
| Marges, coûts, prix global | Absent | — |
| Ventilation TVA | Absent | — |
| Rendu | Réutilisable | `DocumentImprimable` sert impression, PDF, portail, e-mail |
| Aperçu / pagination | Absent | pagination CSS seule, pas de numéro de page |
| Filigranes | Absent | — |
| Figement facture | Partiel | lignes et en-tête verrouillés ; `entreprise_snapshot` capturé par l'application seule ; logo figé par URL |
| Figement devis émis | Absent | aucun instantané entreprise ; devis `envoye` non verrouillé en base |
| Duplicata | Absent | — |
| Mandat expert-comptable | Absent | rôle générique `comptable` seulement |
| Import catalogue | Défaut | insertion simple, un doublon fait échouer 200 lignes, aucun statut par ligne |

## 4. Architecture retenue

- **Noyau pur** (`src/lib/devis/`), sans base ni navigateur, entièrement testé :
  `montants` (arithmétique décimale exacte, miroir de `numeric` / `round()` PostgreSQL),
  `recherche-articles` (7 niveaux), `ouvrages`, `prix`, `presentation`, `filigrane`,
  `document-modele`, `pagination`, `import-catalogue`, `export-catalogue`, `export-tva`,
  `rendu-source`, `enregistrement-v2`, `brouillon-v2`, `editeur-etat`.
- **Un seul moteur de présentation (v2)** : `construireVueDocument` → `paginer` → `DocumentA4`,
  consommé par l'aperçu de l'éditeur, l'impression, le PDF, le portail et la pièce jointe d'e-mail.
  Les coupures de page sont décidées par les données : l'aperçu et le PDF paginent à l'identique.
- **Documents historiques** : rendus par le moteur v1 (`DocumentImprimable`), inchangé — aucun
  devis ni aucune facture déjà émis ne change d'aspect.
- **Coûts d'achat dans des tables séparées** sous RLS (`voir_couts_devis` / `gerer_couts_devis`),
  jamais en colonne : la migration 189 a montré qu'un `GRANT` table rouvre une restriction de colonne.
- **Une erreur n'est pas une absence** : fonction SQL absente → moteur v1 ; toute autre erreur est
  remontée.

## 5. Modèle de données — SQL proposé

`supabase/proposed/gp-devis-wysiwyg-catalogue-ouvrages-v1.sql.proposed` (non numéroté, non appliqué
au ledger ; rejouable) et sa preuve `…pgtap.sql.proposed`. Remplace la proposition de la phase L
mobile (`devis-references-articles-selection-multiple.sql.proposed`), dont il corrige trois défauts
(`unaccent`/`pg_trgm` jamais créés, contraintes non rejouables, prix d'achat lu en SECURITY INVOKER).

| Objet | Rôle |
|---|---|
| `normaliser_reference(text)` | forme de comparaison IMMUTABLE sans extension, parité avec le TypeScript |
| `prestations_catalogue` + 6 colonnes | références interne / fabricant / code-barres distinctes, fabricant, fournisseur, catégorie ; archivage seul (`DELETE` retiré) |
| `articles_stock` + 2 colonnes | références distinctes ; `reference` intacte |
| `prestations_catalogue_couts` | prix d'achat du catalogue, sous permission |
| `ouvrages`, `ouvrages_versions`, `ouvrages_composants_couts` | bibliothèque ; versions IMMUABLES (droit ET déclencheur) ; coûts par version, reportés à la publication suivante |
| `devis_ouvrages`, `factures_ouvrages` | instance d'ouvrage dans un document : instantané complet SANS coût, mode de présentation |
| `lignes_devis` / `lignes_factures` + 16 colonnes | clé stable, rattachement à l'ouvrage, origine, instantané des références, paramètres de quantité, visibilités |
| `lignes_devis_couts` | coût par ligne, clé stable, sous permission |
| `devis_prix_journal` | journal des prix, ajout seul (coûts visibles seulement avec le droit) |
| `entreprises.filigranes_documents`, `seuil_taux_marque_pct` ; `devis/factures.filigrane`, `moteur_presentation`, `rendu_instantane`, `rendu_empreinte` | filigranes, moteur, instantané de rendu figé à l'émission (SHA-256) |
| `enregistrer_devis_brouillon_v2` | enregistrement atomique d'un brouillon v2, validation, journal |
| `rechercher_articles_devis`, `rechercher_ouvrages`, `doublons_references_catalogue` | recherches (cloisonnées, coûts selon droits) |
| `publier_version_ouvrage`, `changer_statut_ouvrage`, `reporter_couts_version_ouvrage` | bibliothèque |
| `document_rendu`, `document_rendu_par_token` | UNE source de rendu, connectée et publique (sans `service_role`) |
| Déclencheurs `zz_*` | capture du rendu et de l'identité émettrice à l'émission ; verrous du devis émis, de ses lignes, ouvrages et coûts ; ouvrages de facture émise |

**Défauts existants corrigés par le SQL proposé** : remise globale perdue à la conversion devis →
facture (facture plus chère que le devis) ; conversion sans `gerer_factures` ; devis `envoye` non
verrouillé ; `entreprise_snapshot` contournable ; remise de ligne non bornée (NOT VALID) ; éditeurs
historiques capables d'aplatir un devis ou une facture à ouvrages.

**Permissions ajoutées** : `voir_couts_devis` (conducteur, directeur, administration, gérant) et
`gerer_couts_devis` (directeur, administration, gérant). Le Comptable et l'expert-comptable ne les
reçoivent pas (choix conservateur, réversible par l'administrateur).

## 6. Fonctionnalités livrées (phases B à L)

- **B–C** : références distinctes, normalisation (casse, accents, ligatures, espaces, tirets,
  points), classement en 7 niveaux, doublons montrés jamais fusionnés ; sélection multiple au
  clavier (↓ ↑, Entrée → quantité, Entrée → recherche, Ctrl+Entrée), quantité / unité / prix /
  description par article, décision explicite pour un article déjà présent (additionner, nouvelle
  ligne, remplacer, annuler), archivé à confirmer, 44 px, plein écran mobile.
- **D–E** : ouvrages à composants (article, prestation, main-d'œuvre, location, matériel,
  sous-traitance, libre) avec coefficient, base (quantité principale ou autre composant), quantité
  fixe, saisie à l'insertion, perte, minimum, arrondi, condition, prix, TVA, visibilité, ordre ;
  insertion en une opération, modification sur l'instance, réapplication d'une nouvelle version au
  brouillon après comparaison.
- **F** : vues regroupée, semi-détaillée, éclatée, personnalisée ; aucun coût ni information interne
  sur une sortie client (garanti par le type et vérifié).
- **G** : coût, prix calculé, remise, prix retenu, marge, taux de marge et de marque ; prix global
  par ajustement, répartition ou remise, jamais réparti entre taux de TVA sans règle explicite ;
  avertissements (sous le coût, marge sous seuil, prix nul, TVA incohérente, composant sans prix).
- **H** : éditeur visuel, aperçu A4 réel (zoom, pages, plein écran, clic → saisie, débordement
  signalé), même rendu pour impression, PDF, portail, e-mail ; PDF refusé si une page déborde.
- **I** : filigranes aucun / logo / texte / combinés, préréglages, position, mosaïque, taille,
  rotation, couleur, opacité bornée, pages ; défaut et brouillon d'entreprise, réglage par document ;
  figés à l'émission ; duplicata du document figé.
- **J** : droits vérifiés dans chaque action et en base ; rôle comptable prouvé en pgTAP.
- **K** : import catalogue planifié ligne par ligne (8 statuts) ; exports catalogue et lignes de
  devis avec références et colonnes d'ouvrage ; export TVA corrigé. L'assistant d'import propose
  la clé de rapprochement (référence interne par défaut, fabricant, code-barres, aucune) ; le
  catalogue existant est lu par pages (un `max_rows` silencieux ferait recréer des doublons) ; un
  lot en échec est rejoué ligne à ligne pour n'en refuser que la ligne fautive ; les prix d'achat
  ne vont jamais dans `prestations_catalogue`. Routes `GET /api/exports/catalogue` et
  `GET /api/devis/[id]/lignes` (colonne de coût seulement avec `voir_couts_devis`).
- **L** : SQL proposé, prouvé en base jetable (§ 8).

## 7. Exemple de recette — PC-001 Plancher chauffant (données FICTIVES)

Fixture `src/lib/devis/fixtures/plancher-chauffant-fictif.ts` : coefficients, pertes,
conditionnements et prix **inventés**, sans valeur technique. Pour 120 m² et 44 ml de bande saisis :

| Composant | Calcul | Quantité |
|---|---|---|
| Bande périphérique | 44 saisis + 5 % = 46,2 → multiple sup. de 25 | 50 ml |
| Isolant | 120 × 1 + 5 % = 126 → multiple sup. de 10 | 130 m² |
| Tube | 120 × 6,5 = 780 + 3 % = 803,4 → multiple sup. de 100 | 900 ml |
| Agrafes | 900 ml de tube × 2 = 1 800 → multiple sup. de 250 | 2 000 u |
| Collecteur | option cochée par défaut | 1 u |
| Chape | 120 × 0,05 = 6 + 8 % = 6,48 → multiple le plus proche de 0,5 | 6,5 m³ |
| Main-d'œuvre | 120 × 0,35 | 42 h |
| Consommables (interne) | fixe | 1 forfait |
| Location mélangeur | inclus car 120 ≥ 80 | 1 j |
| Mise en chauffe | option non cochée | — |

Vente 8 360,00 € HT · coût 4 734,00 € · marge 3 626,00 € · taux de marge 76,59 % · taux de marque
43,37 %. Prix global ramené à 8 000 € : ligne « Ajustement du prix de l'ouvrage » −360,00 €, coûts
inchangés.

## 8. Résultats des tests

Sur SHA figé `175de81` (code validé) ; ce rapport = commit suivant, sans modification de code :

| Suite | Résultat |
|---|---|
| Suite unitaire complète du dépôt (vitest) | 1er passage (lint lancé en parallèle, charge 20) : 2 233 réussis, **1 échec** — `src/lib/xlsx.test.ts` dépasse 5 s (7,75 s) ; fichier non touché par le lot, identique à `bb17c17`, 1,5 s isolé. 2e passage, seul sur la machine : **2 234 réussis, 0 échec**, 3 ignorés (test Chromium sans exécutable), 183 fichiers. Aucun délai allongé, aucune relance automatique : l'échec est consigné tel quel |
| dont tests du lot (catalogue, ouvrages, devis, prix, présentation, factures/exports, PDF, rendu, éditeur, bibliothèque, paramètres) | 26 fichiers, **401/401** (Chromium réel activé pour « aperçu = PDF ») |
| Preuve « aperçu = PDF » sur Chromium réel | 3/3 : 70 lignes fictives → 5 pages, chaque page du PDF porte exactement les lignes du paginateur, « Page i / 5 », montants présents sous filigrane, débordement refusé |
| Recette navigateur (banc hors application, actions simulées) | 13/13 en une passe |
| pgTAP du lot (base jetable ledger 280 + SQL proposé) | 111/111 |
| pgTAP existants rejoués avec le SQL proposé (13 suites : snapshot client, verrou facture, isolations devis/factures/relances, workflow devis→chantier, pièces jointes, relances auto, isolation multi-entreprise ×3, terrain mobile, borne stock) | 231/231 |
| SQL proposé appliqué deux fois de suite | aucune erreur (rejouable) |
| Typecheck (`tsc --noEmit`) | 0 erreur (`tsc --noEmit`, projet entier) ; typecheck du build : 0 erreur |
| Lint (ESLint, 104 fichiers TS/TSX/MJS du lot) | 0 erreur, 0 avertissement |
| Build (`next build`, Next 16.2.12 Turbopack, sous `nice`) | vert : compilé en 4,6 min, TypeScript 115 s, 607 s au total, code 0 ; routes `/api/exports/catalogue`, `/api/devis/[id]/lignes`, `/ouvrages/bibliotheque/*` présentes |
| Secrets (motifs Stripe, JWT, clés privées, AWS, service_role, URL PostgreSQL) | 0 sur les lignes ajoutées |
| `git diff --check` | propre |

### Couverture des 43 tests exigés

| # | Exigence | Preuve |
|---|---|---|
| 1–2 | recherche exacte réf. interne / fabricant | unitaire, pgTAP D, banc |
| 3 | plusieurs articles de même référence | unitaire, pgTAP B/D, banc |
| 4 | classement | unitaire (7 niveaux), pgTAP D, banc |
| 5 | normalisation | unitaire, pgTAP A (parité) |
| 6 | isolation entre entreprises | unitaire, pgTAP C/D/J/L |
| 7–8 | sélection multiple, quantités différentes | unitaire, banc |
| 9 | article déjà présent | unitaire (4 décisions), banc |
| 10 | article archivé | unitaire, banc |
| 11 | permissions des prix d'achat | pgTAP C/D/N, rendu, banc |
| 12–15 | création, calcul, pertes/arrondis, modification d'un ouvrage | unitaire, pgTAP E |
| 16–18 | insertion complète, instantané, modification ultérieure du modèle | unitaire, pgTAP E/G, banc |
| 19–22 | vues regroupée, semi-détaillée, éclatée, personnalisée | unitaire, rendu, banc (19, 21) |
| 23–26 | prix global, coût conservé, avertissements, plusieurs TVA | unitaire, pgTAP F, banc (23) |
| 27–29 | aperçu A4, pagination, égalité aperçu/PDF | rendu, unitaire, Chromium réel |
| 30–33 | filigranes logo / texte / combiné, lisibilité | unitaire (WCAG), rendu, banc |
| 34–35 | figement de facture, duplicata | pgTAP I, unitaire (source) |
| 36–37 | portail client, pièce jointe e-mail | pgTAP J (rendu par jeton) ; branchement vérifié par typecheck — **pas d'E2E réel** |
| 38 | export comptable | unitaire (export TVA ventilé, remise, arrondi exact) ; exports catalogue et lignes de devis (unitaire, droits sur les coûts) |
| 39 | rôle expert-comptable | pgTAP N (rôle comptable) — mandat nominatif absent (préexistant) |
| 40–42 | responsive 375→1440, clavier, cibles tactiles | banc (6 largeurs, clavier, 44 px mesurés) |
| 43 | absence de fuite de données ou de secrets | unitaire, rendu, pgTAP (instantané sans coût), scan de secrets |

## 9. Responsive

Banc, 6 largeurs : aucun débordement horizontal ; onglets « Saisie / Aperçu » sous 1024 px ; deux
colonnes à partir de 1024 px ; boîte de sélection plein écran à 375 px, toutes les cibles ≥ 44 px.
Captures : `docs/devis/captures-v1/` (éditeur 375, 768, 1024, 1440 ; ouvrage éclaté ; sélection
multiple ; insertion d'ouvrage ; sélection mobile).

## 10. Permissions

| Action | Droit requis (application ET base) |
|---|---|
| Rechercher des articles / ouvrages | `acces_devis` (ou `acces_ouvrages` pour les ouvrages) |
| Enregistrer un brouillon v2 | `gerer_devis` ; coûts écrits seulement avec `gerer_couts_devis` |
| Voir prix d'achat, coûts, marges | `voir_couts_devis` (stock : `voir_prix_stock`) |
| Publier / archiver un ouvrage | `gerer_ouvrages` |
| Convertir devis → facture | `gerer_factures` (nouveau) |
| Filigranes et seuil de marge d'entreprise | `gerer_parametres` |
| Consulter un document | `acces_devis` / `acces_factures` ; public : jeton valide |
| Comptable (prouvé) | consulte la facture figée ; ne voit ni devis ni marges ; ne crée ni ne modifie de devis ; ne modifie ni ne supprime une facture émise ; ne publie pas d'ouvrage |

## 11. Défauts trouvés

Corrigés dans ce lot : fuite du cookie de session dans le PDF GP ; logo supprimé au changement ;
remise globale perdue à la conversion ; conversion sans `gerer_factures` ; devis envoyé non
verrouillé ; `entreprise_snapshot` contournable ; export TVA sans remise ni arrondi exact (sous
moteur v2) ; éditeurs historiques capables d'aplatir un document à ouvrages ; coûts effacés par une
publication sans droit ; course clavier (quantité tapée dans la recherche) ; contraste de l'onglet
sélectionné sur mobile.

Signalés hors périmètre, confiés à des sessions séparées (branches poussées, non fusionnées) :
- **P0** — prix d'achat `articles_stock` lisibles par tout membre depuis la 189 (probablement en
  Production) → `fix/stock-prix-confidentialite-colonnes-v1` ;
- **P0 à prouver** — portail client et pièce jointe d'e-mail probablement cassés par la 255
  (`service_role` révoqué) — le moteur v2 ne dépend pas de `service_role` ; reste à traiter ;
- verrou de facture face à `relance_auto_exclue` → `fix/factures-relance-auto-exclue-verrou-v1`
  @ `9cb47df` ;
- onze copies Finder « page 2.tsx » suivies par Git → `chore/remove-finder-duplicate-copies-v1`
  @ `d896ce0`.

## 12. Réserves

1. **Migration non numérotée** : à numéroter au moment de l'intégration (ledger global n° max 281).
   Prouvée en **montée de version** depuis 280 (base jetable) ; l'installation à neuf (Fresh) n'a pas
   été rejouée.
2. **Pas d'E2E sur pile réelle** (Supabase + Next + drapeau posé) : machine saturée par les piles
   d'autres conversations. Remplacée par : banc navigateur (actions simulées), pgTAP, rendu serveur,
   Chromium réel pour le PDF.
3. **Police du PDF serverless** : le Chromium embarqué n'a qu'Open Sans ; le dessin des caractères
   peut différer de l'aperçu, la pagination non (pilotée par les données, marge de 12 %) et un
   débordement bloque le PDF.
4. **Éditeur v2 sans** assistant IA, photos/vocal, création rapide de client/chantier (présents dans
   l'éditeur historique).
5. **Facture issue d'un devis à ouvrages** : non modifiable ligne à ligne dans cette version
   (refus explicite).
6. **Mandat expert-comptable** : absent du modèle (préexistant) ; seul le rôle est prouvé.
7. **Duplicata** : non journalisé.
8. Documents v1 : remise globale toujours non imprimée (préexistant) ; TTC hérité de la base
   (arrondi de la somme, écart d'un centime possible, documenté et testé).
9. Prix d'achat du catalogue non effaçable (pas de `DELETE`) ; coût d'un composant non retirable par
   omission (reporté).
10. **Import du catalogue v2** : routes et action non exécutées contre une base (logique pure
    testée seulement) ; pas de transaction entre un article créé et son coût (la ligne est alors
    signalée « refusée », article créé) ; champ `type` non importé (défaut `main_oeuvre`) ; deux
    nouvelles lignes de même désignation → la seconde est refusée par l'unicité existante ;
    numéros de ligne décalés si le fichier contient des lignes entièrement vides (signalé à
    l'écran) ; listes de colonnes `lignes_devis` / `devis_ouvrages` dupliquées entre
    `catalogue-base.ts` et `editeur-v2-serveur.ts`.
11. **Préexistant, non corrigé** : `importerDonneesAction` (import historique) ne vérifie aucun droit ;
    corps des Server Actions limité à 2 Mo (gros fichiers d'import).

## 13. Conditions

**Avant intégration (drapeau éteint)** : build vert (acquis) ; relecture ; intégration après (ou avec) le
lot mobile `bb17c17`.

**Avant activation (`GP_DEVIS_V2=1`)** :
1. numéroter la migration proposée après audit du ledger, l'appliquer, prouver Fresh ET Upgrade,
   déplacer la preuve pgTAP dans `supabase/tests` ;
2. E2E réel sur pile dédiée hors saturation (éditeur, PDF, portail, e-mail, export) ;
3. réserve 4 levée ou acceptée ;
4. décision sur les droits de coûts du Comptable ;
5. relecture juridique des mentions (bon pour accord, duplicata).

## 14. Rollback

- **Fonctionnel immédiat** : retirer `GP_DEVIS_V2` → chemin historique partout (aucune donnée
  touchée).
- **Code** : `git revert` de la fusion de la branche.
- **SQL (si appliqué)** : ajouts inertes drapeau éteint. Les seuls changements de comportement des
  chemins historiques sont les redéfinitions de `creer_facture_depuis_devis` (211),
  `recalc_totaux_facture` (006), `modifier_devis_brouillon` (013), `modifier_facture_brouillon`
  (017), `dupliquer_devis` (014), les verrous `zz_*`, le retrait de `DELETE` sur
  `prestations_catalogue` : les restaurer = rejouer la définition de la migration d'origine citée.
  Aucune suppression de données.

## 15. Fichiers modifiés

`git diff --name-status bb17c17..175de81` : 117 fichiers — 88 ajoutés, 29 modifiés, 0 supprimé (+ ce rapport).

### Ajoutés (88)

- `docs/devis/captures-v1/editeur-1024.png`
- `docs/devis/captures-v1/editeur-1440.png`
- `docs/devis/captures-v1/editeur-apercu-375.png`
- `docs/devis/captures-v1/editeur-apercu-768.png`
- `docs/devis/captures-v1/editeur-ouvrage-eclate-1440.png`
- `docs/devis/captures-v1/editeur-saisie-375.png`
- `docs/devis/captures-v1/editeur-saisie-768.png`
- `docs/devis/captures-v1/insertion-ouvrage-1440.png`
- `docs/devis/captures-v1/selection-mobile-375.png`
- `docs/devis/captures-v1/selection-multiple-1440.png`
- `src/app/(app)/ouvrages/bibliotheque/[id]/page.tsx`
- `src/app/(app)/ouvrages/bibliotheque/nouveau/page.tsx`
- `src/app/(app)/ouvrages/bibliotheque/page.tsx`
- `src/app/actions/devis-v2.ts`
- `src/app/api/devis/[id]/lignes/route.ts`
- `src/app/api/exports/catalogue/route.ts`
- `src/components/devis/ApercuDevisV2.tsx`
- `src/components/devis/EditeurDevisV2.test.ts`
- `src/components/devis/EditeurDevisV2.tsx`
- `src/components/devis/InsertionOuvrageDialog.tsx`
- `src/components/devis/PrixGlobalDialog.tsx`
- `src/components/devis/SelectionArticlesDialog.tsx`
- `src/components/documents/DocumentA4.test.ts`
- `src/components/documents/DocumentA4.tsx`
- `src/components/documents/FiligraneSelecteur.tsx`
- `src/components/ouvrages/BibliothequeInactive.tsx`
- `src/components/ouvrages/OuvrageEditeur.test.ts`
- `src/components/ouvrages/OuvrageEditeur.tsx`
- `src/components/parametres/FiligranesEntrepriseForm.tsx`
- `src/components/prestations/TableCataloguePrestations.tsx`
- `src/lib/devis/application-import-catalogue.test.ts`
- `src/lib/devis/application-import-catalogue.ts`
- `src/lib/devis/brouillon-v2.test.ts`
- `src/lib/devis/brouillon-v2.ts`
- `src/lib/devis/catalogue-base.test.ts`
- `src/lib/devis/catalogue-base.ts`
- `src/lib/devis/catalogue-serveur.ts`
- `src/lib/devis/document-modele.test.ts`
- `src/lib/devis/document-modele.ts`
- `src/lib/devis/editeur-etat.test.ts`
- `src/lib/devis/editeur-etat.ts`
- `src/lib/devis/editeur-v2-serveur.ts`
- `src/lib/devis/enregistrement-v2.ts`
- `src/lib/devis/export-catalogue.test.ts`
- `src/lib/devis/export-catalogue.ts`
- `src/lib/devis/export-tva.test.ts`
- `src/lib/devis/export-tva.ts`
- `src/lib/devis/exports-csv.test.ts`
- `src/lib/devis/exports-csv.ts`
- `src/lib/devis/filigrane.test.ts`
- `src/lib/devis/filigrane.ts`
- `src/lib/devis/fixtures/document-fictif.ts`
- `src/lib/devis/fixtures/plancher-chauffant-fictif.ts`
- `src/lib/devis/import-catalogue.test.ts`
- `src/lib/devis/import-catalogue.ts`
- `src/lib/devis/montants.test.ts`
- `src/lib/devis/montants.ts`
- `src/lib/devis/ouvrages.test.ts`
- `src/lib/devis/ouvrages.ts`
- `src/lib/devis/pagination.test.ts`
- `src/lib/devis/pagination.ts`
- `src/lib/devis/presentation.test.ts`
- `src/lib/devis/presentation.ts`
- `src/lib/devis/prix.test.ts`
- `src/lib/devis/prix.ts`
- `src/lib/devis/rendu-source.test.ts`
- `src/lib/devis/rendu-source.ts`
- `src/lib/devis/v2-serveur.ts`
- `src/lib/entreprise-devis-v2.test.ts`
- `src/lib/entreprise-devis-v2.ts`
- `src/lib/import/catalogue-v2.test.ts`
- `src/lib/import/catalogue-v2.ts`
- `src/lib/ouvrages/droits-bibliotheque.ts`
- `src/lib/ouvrages/editeur-ouvrage.test.ts`
- `src/lib/ouvrages/editeur-ouvrage.ts`
- `src/lib/pdf/apercu-pdf-egalite.test.ts`
- `src/lib/pdf/generer.test.ts`
- `src/lib/prestations-catalogue-v2-serveur.ts`
- `src/lib/prestations-catalogue-v2.test.ts`
- `src/lib/prestations-catalogue-v2.ts`
- `supabase/proposed/gp-devis-wysiwyg-catalogue-ouvrages-v1.pgtap.sql.proposed`
- `supabase/proposed/gp-devis-wysiwyg-catalogue-ouvrages-v1.sql.proposed`
- `tests/banc/editeur-v2/actions-simulees.ts`
- `tests/banc/editeur-v2/construire.mjs`
- `tests/banc/editeur-v2/editeur-v2.banc.spec.ts`
- `tests/banc/editeur-v2/entree.tsx`
- `tests/banc/editeur-v2/navigation-simulee.ts`
- `tests/banc/editeur-v2/playwright.banc.config.ts`

### Modifiés (29)

- `src/app/(app)/devis/[id]/modifier/page.tsx`
- `src/app/(app)/devis/[id]/page.tsx`
- `src/app/(app)/devis/nouveau/page.tsx`
- `src/app/(app)/factures/[id]/modifier/page.tsx`
- `src/app/(app)/factures/[id]/page.tsx`
- `src/app/(app)/ouvrages/page.tsx`
- `src/app/(app)/parametres/page.tsx`
- `src/app/(app)/prestations/[id]/modifier/page.tsx`
- `src/app/(app)/prestations/nouveau/page.tsx`
- `src/app/(app)/prestations/page.tsx`
- `src/app/actions/entreprise.ts`
- `src/app/actions/import.ts`
- `src/app/actions/prestations.ts`
- `src/app/api/documents/devis/[id]/pdf/route.ts`
- `src/app/api/documents/factures/[id]/pdf/route.ts`
- `src/app/api/documents/partage/[token]/pdf/route.ts`
- `src/app/api/exports/comptabilite/route.ts`
- `src/app/document/[token]/page.tsx`
- `src/app/imprimer/devis/[id]/page.tsx`
- `src/app/imprimer/factures/[id]/page.tsx`
- `src/app/imprimer/partage/[token]/page.tsx`
- `src/components/ImportWizard.tsx`
- `src/components/PrestationForm.tsx`
- `src/lib/csv.ts`
- `src/lib/devis/recherche-articles.test.ts`
- `src/lib/devis/recherche-articles.ts`
- `src/lib/documents-envoi.ts`
- `src/lib/pdf/generer.ts`
- `supabase/tests/isolation_multitenant_surface.test.sql`
