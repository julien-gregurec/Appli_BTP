# ELSATIA Tools — Relevé & Métré — Lot 10 — Estimation simplifiée V1

**Date** : 2026-10-02
**Branche** : `claude/fervent-bell-1tbhc5` (worktree dédié)
**Base** : `integration/elsatia-canonical-train-v8` @ `53b4bc76` (*CANONICAL TRAIN V8 LOCALLY QUALIFIED*), dernière branche qualifiée Relevé/Métré qui comprend le Lot 9 (`d1f14db7 merge(v8): Relevé & Métré Lot 9`).
**Nature** : rapport autonome. Tout ce qui est affirmé ici a été exécuté dans cette session, sauf mention contraire.
**Frontière produit** : TOOLS = relevé + plan + métrés + quantitatifs + **estimation simplifiée**. GESTION PRO = chiffrage complet, devis, marges, commandes, commercial.
**Hors périmètre** : devis, numérotation de devis, conditions commerciales, acompte, TVA, marge, remise, signature client, facture, commande. Aucune PR, aucun merge, **aucun déploiement**.

---

## 0. Verdict

> **RELEVE METRE LOT 10 LOCALLY QUALIFIED**

Chaque ouvrage du quantitatif (Lot 9) peut recevoir un **prix HT facultatif**, éventuellement un **coefficient**. Le **serveur** calcule les montants (moteur SQL pur, arithmétique entière, au centime). La quantité utilisée est la quantité **retenue** du Lot 9, pertes comprises. **La perte n'est jamais recomptée.**

L'estimation donne des sous-totaux par ouvrage, lot, pièce, zone, étage, bâtiment et chantier, ainsi que le total général HT. Elle se sépare par état : existant, dépose, neuf, déplacé. Les coefficients sont facultatifs, à trois niveaux :

- ouvrage ;
- lot ;
- général.

La règle de priorité est explicite : **le plus précis l'emporte, sans cumul**. Toute correction de montant est motivée, auditée et devient **obsolète** si la quantité change. Le contrat Tools → Gestion Pro **`elsatia.tools.estimation` 1.1.0** transporte :

- les ouvrages ;
- les quantités ;
- les prix ;
- les hypothèses et les coefficients ;
- les métadonnées de source.

**Gestion Pro reste libre de rechiffrer.**

Qualification locale : PostgreSQL 16 avec les **373** vraies migrations et la vraie RLS, vrai GoTrue, vrai PostgREST, vrai Chromium (`next dev`). **Tablette : MOBILE EMULATED ONLY.**

### Chiffres clés (exécutés sur HEAD)

| Contrôle | Résultat |
|---|---|
| Install fraîche | **373 / 373** migrations (`rebuild_db.sh lot10_fresh`) |
| pgTAP Lot 10 | **67 / 67** (1401) + **53 / 53** (1402) |
| pgTAP Relevé Lots 2 → 9 + mode sûr + V8 (base de travail) | **929 / 929** + 53. Avant 1402 : **2 échecs V8** (§2) |
| pgTAP suite complète (base neuve) | **165 fichiers, 8 193 tests**. **Mêmes 9 fichiers en échec, mêmes compteurs** que la base V8 de référence reconstruite dans la session (163 fichiers, 8 073 tests) : +120 tests Lot 10 (67 + 53), tous verts (§13) |
| Parité moteur SQL ↔ TS | P1 : 40 cas (1401), **inchangée**. P2 : **40 cas / 392 lignes** (coefficients, obsolescence sur quantité), vérifiée par Vitest ET pgTAP |
| Vitest `packages/releve-domain` | **427 / 427** (+2 ignorés opt-in : parités étendues) |
| Vitest racine | **2 682 / 2 682** (206 fichiers ; 38 ignorés préexistants) |
| Vitest `apps/tools` | **2 156 / 2 156** (188 fichiers) |
| `tsc --noEmit` racine et `apps/tools`, ESLint `apps/tools` | 0 erreur, 0 avertissement |
| Playwright Lot 10 `tools-releve-lot10.spec.ts` | **11 / 11**, deux passages complets verts |
| Playwright non-régression Lots 2 → 9 + Atelier | **107 / 107** (fichier par fichier ; Lots 2 et 3 sur pile neuve) |
| Builds Tools web / natif (Capacitor) / Gestion Pro | OK ; `/releves/estimation` statique (web et export natif) |
| `verify:migrations` / `verify:train-expectations` | OK (373, dernière `20260930001402`, attendus synchronisés) |

## 1. Base, branche et décision de départ

L'historique contenait déjà **deux implémentations du Lot 10**, jamais intégrées à un train :

- `claude/blissful-thompson-ipjcxl`, posée sur le Lot 9 isolé ;
- `claude/beautiful-tesla-grj0pu`, portée sur V8, suivie d'un Lot 11 (import GP).

**DECISION_REQUIRED D1 (choix conservateur retenu)** : partir de la dernière branche qualifiée comprenant le Lot 9, soit le **train V8**. J'ai ensuite **repris les 5 commits Lot 10 déjà portés sur V8** (`443151a2..2dea8f0b`, cherry-pick sans conflit) au lieu de tout réécrire. Le Lot 11 n'est pas repris : il est hors périmètre et touche Gestion Pro au-delà du contrat d'échange. Ces commits ont été audités contre le cahier des charges de cette mission ; les écarts sont comblés par la migration **1402** (§3 à §8).

| Commit | Objet |
|---|---|
| `0354305a` | migration 1401 (prix, moteur, corrections, gel) + pgTAP (repris) |
| `514cd45f` | domaine miroir, CSV, contrat GP 1.0.0 (repris) |
| `ccf684df` | vue `/releves/estimation` (reprise) |
| `1b4976bc` | recette Playwright (reprise) |
| `bd085126` | rapport d'origine, remplacé par celui-ci |
| `3725a724` | **migration 1402** : coefficients, hypothèses, valeur source, obsolescence sur quantité, garde mode sûr + pgTAP |
| `b9d425ac` | domaine : miroir 1402, parité P2, filtre par état, CSV, **contrat GP 1.1.0** |
| `1b786846` | vue : coefficients et hypothèses, filtre de travaux, provenance, motif d'obsolescence |
| `0dc3a656` | attendus du train (373 / `20260930001402`) |
| `8194355b` | recette Playwright du complément |

## 2. Défaut trouvé et corrigé : mode sûr V8

Sur V8, toute table créée après la migration Incident doit porter la garde d'écriture `incident_garde_ecriture`. La migration 1401 n'appelait pas `incident_installer_gardes()`. Ses 3 tables restaient donc **écrivables en mode lecture seule** :

- `tools_releves_estimation_prix` ;
- `tools_releves_bibliotheque_prix` ;
- `tools_releves_estimation_ajustements`.

**Preuve** (base de travail, avant 1402) : `incident_safe_mode_v1` n° 23 et `v8_convergence_incident_gardes_v1` n° 1 échouent (*have 3, want 0*). La migration 1402 rappelle la fonction. Les deux tests repassent, et le pgTAP 1402 (G1–G4) prouve PT503 sur les 4 tables du Lot 10.

## 3. Prix simples (§1 de la mission)

- **Prix unitaire HT facultatif** par ouvrage. La saisie rapide « PU global » donne une composante typée. Le prix structuré est facultatif aussi : matériau, main d'œuvre (heures × taux), forfait, autre.
- **Unité** : celle de l'ouvrage du Lot 9, inchangée.
- **Coefficient facultatif** sur le prix de l'ouvrage (0,01 – 10, 4 décimales). Champ vide = hérité (§5).
- **Perte** : jamais recomptée. Le moteur utilise la quantité retenue du Lot 9 ; la clé `pertePourcent` est refusée dans un prix.
- **Montant calculé par le serveur**. Le client n'envoie que des prix ; aucun montant ne circule du client vers le serveur (test du dépôt Tools).

## 4. Estimation (§2)

- Sous-totaux exacts par **ouvrage, lot, pièce, zone, étage, bâtiment, chantier** (sélecteur « Sous-totaux par »), plus le **total général HT**.
- Arrondi au centime « moitié loin de zéro » par composante et par ligne ; sous-totaux = sommes de lignes. **Aucun écart d'arrondi.** Vitest le vérifie : la somme des groupes égale le total, pour les 7 niveaux.
- **Calculs décimaux exacts** (Vitest), là où un calcul en flottants se tromperait :

| Calcul | Résultat exact | En flottants |
|---|---|---|
| 1 × 1,005 € | 1,01 € | 1,00 € |
| 2,675 × 1 € | 2,68 € | — |
| 0,333 × 0,3333 € × 1,0001 | 0,11 € | — |
| 10 lignes à 0,10 € | 1,00 € | — |
| 90 000 × 1 000 000 € × 10 | 900 000 000 000,00 € | — |

## 5. Coefficients (§3)

| Niveau | Où | Stockage |
|---|---|---|
| Ouvrage | formulaire de prix (champ vide = hérité) | dans le prix de l'ouvrage |
| Lot | panneau « Coefficients et hypothèses » | `tools_releves_estimation_parametres.donnees.coefficientsLots` (≤ 50 lots) |
| Général | idem | `…coefficientGeneral` |

**Priorité** (pure, `tools_releve_estimation_prix_effectifs` ↔ `prixEffectifs`) : **coefficient de l'ouvrage > coefficient de son lot > coefficient général > 1, JAMAIS cumulés.** Un coefficient 1 saisi sur l'ouvrage prime et neutralise le lot et le général.

Exemple réel (pgTAP F4, Playwright) avec un général de 1,1, une Peinture à 1,2 et une Plâtrerie à 1,5 :

| Ouvrage | Coefficient appliqué | Montant |
|---|---|---|
| Peinture 20 m² × 10 € | lot 1,2 | **240,00 €** |
| Cloison 10 m² × 20 € (coefficient 1 saisi) | ouvrage 1 | **200,00 €** |
| Divers 2 u × 50 € | général 1,1 | **110,00 €** |

Sans cumul : lot 1,2 et général 1,05 sur 2 m² × 10 € donnent **24,00 €**, pas 25,20 € (Vitest, pgTAP R4).

Le moteur d'estimation reçoit des **prix effectifs** : son arithmétique est inchangée. Le lot d'un ouvrage est calculé comme au Lot 9 (lot saisi, sinon lot de la catégorie). Le miroir SQL `tools_releve_ouvrage_lot` est vérifié sur les 19 catégories et sur les blancs Unicode retirés par `trim()`.

- Ce n'est **ni une marge ni une remise** : l'écran l'écrit.
- Le contrat refuse `marge`, `remise`, `tva`, `acompte`, `conditionsCommerciales` et `numeroDevis` (pgTAP C2, Vitest).
- Aucun moteur de marge ni de devis.

## 6. Traçabilité (§4)

| Exigence | Réalisation |
|---|---|
| Valeur source | `valeur_source` figée **par le serveur** à la correction : quantité, unité, PU, montant automatique, coefficient appliqué et sa provenance |
| Valeur calculée | montant automatique courant de la ligne, toujours affiché à côté du retenu |
| Override | montant retenu (≥ 0, 2 décimales) ; une nouvelle correction retire la précédente (tracé) |
| Motif obligatoire | raison ≥ 3 caractères (serveur et écran) |
| Auteur / date | `auth.uid()`, horodatage serveur ; journal avant / après (prix, paramètres, corrections) |
| **Stale si la quantité change** | correction **obsolète** dès que la quantité de sa ligne diffère de la quantité source, **même si le montant automatique ne change pas** (ouvrage sans prix, ligne devenue non calculable). Motif `quantite` (prioritaire) ou `montant` |

Le montant retenu n'est **jamais remplacé en silence**. Exemple réel (pgTAP A6, Playwright) :

1. Une évacuation **sans prix** est corrigée à 40 €.
2. Sa quantité passe de 5 u à 6 u.
3. Résultat : anomalie `estimation_obsolete` / `quantite_modifiee`, écran « à revoir : quantité 5 u → 6 u depuis la correction », le retenu reste à 40 €.

Si l'on change ensuite le coefficient général, la correction de « divers » devient obsolète avec le motif montant (110,00 → 120,00, pgTAP A7).

Le moteur est **rétro-compatible** : une correction sans `quantiteSource` (antérieure à 1402) produit une sortie octet pour octet identique au 1401 (pgTAP S7). La parité P1 est inchangée.

## 7. États (§5)

Les états du Lot 9 sont conservés : **existant, à déposer, neuf, déplacé**.

- **Tuiles** : Dépose, Neuf, Déplacement, Travaux sur existant, Total projet.
- **Filtre « Travaux »** :
  - Tout ;
  - Travaux (créer + déposer + déplacer) ;
  - À créer ;
  - À déposer ;
  - À déplacer ;
  - Existant.
- **Effet du filtre** : il agit sur les sous-totaux, le total de la sélection et l'export CSV (`filtrerParEtats`, Vitest, Playwright).

## 8. Pas de devis (§6)

| Interdit | Garantie |
|---|---|
| numérotation de devis, facture, commande, signature | aucune table, colonne ni fonction `tools_releve*` correspondante (pgTAP S6) ; refus dans les contrats de prix, de paramètres et de transfert GP |
| conditions commerciales, acompte, escompte, échéancier | clés refusées (paramètres : `cle` ; contrat GP : `validateEstimationGpPayload`) |
| TVA (complexe ou non), TTC | estimation **HT** uniquement ; clés refusées |
| marge, remise commerciale | clés refusées ; le coefficient est documenté comme n'étant ni l'une ni l'autre |
| écran | aucun « devis n° », « facture n° », « bon de commande », « TTC », « signature » (Playwright, test Sécurité) |

## 9. Transfert Gestion Pro (§7) — contrat `elsatia.tools.estimation` **1.1.0**

Évolution **mineure et additive** : tout contrat 1.0.x reste recevable (Vitest). Contenu :

| Section | Contenu |
|---|---|
| `quantitatif` | ouvrages et quantités : contrat `elsatia.tools.quantitatif` 1.0.0 imbriqué, inchangé, sans prix |
| `prix` | prix simplifiés saisis : composantes, `coefficient` **appliqué**, `coefficientSaisi`, `coefficientSource`, PU avec coefficient, forfait, origine |
| `hypotheses` (**1.1**) | `priorite` (ouvrage, lot, général), règle en clair, par plan : coefficient général, coefficients par lot, texte d'hypothèses, révision, date, auteur |
| `lignes[].correction` (**1.1**) | raison, auteur, date, montant automatique d'alors, `quantiteSource`, `obsolete`, `motifObsolescence` |
| `source` (**1.1**) | `application: elsatia-tools`, `module: releve-metre`, `exporteLe`, relevé, état, plans (numéro, gel), moteurs |
| `perimetre` | `decideParGestionPro` (prix de vente, marge, remise, TVA, devis final) et **`gestionProLibreDeRechiffrer: true`** |
| `totaux`, `etatsProjetes` | total, par état, par type, par lot, heures, écart des corrections, `correctionsObsoletes` |
| `idempotencyKey` | couvre les quantités, les montants retenus **et les hypothèses** : une hypothèse modifiée donne une nouvelle version côté GP |

**Côté Gestion Pro** : aucun code GP modifié. Le validateur du contrat (domaine partagé) accepte toute version 1.x. **DECISION_REQUIRED D7** : l'import GP du Lot 11 (branche `beautiful-tesla`, non intégré) accepte déjà `1.x`. Aucune nouvelle clé 1.1 ne contient un mot de sa liste noire SQL, donc un payload 1.1.0 lui reste recevable ; ce point est vérifié par lecture, pas exécuté (Lot 11 hors base).

## 10. UX terrain / tablette (§8) — `/releves/estimation`

- **Cartes repliables**, aucune `<table>`, aucun débordement horizontal à 820 × 1180 (Playwright, deux tests). Cibles ≥ 40 px.
- **Panneau « Coefficients et hypothèses »** :
  - règle de priorité affichée ;
  - lots proposés : ceux des ouvrages présents ;
  - erreurs de saisie avec le même message que le serveur ;
  - lecture seule pour la consultation ;
  - révision optimiste (PT409, rien n'est écrasé).
- **Carte d'ouvrage** :
  - PU affiché avec le coefficient réellement appliqué ;
  - badge « × 1,2 (lot) » ou « × 1,1 (général) ».
- **Ligne corrigée** : montant automatique à côté, motif d'obsolescence en clair.
- **Impression / PDF navigateur** : le panneau des hypothèses est imprimé.

## 11. Exports

- **CSV** (Excel FR), qui suit le filtre de travaux. Les colonnes ajoutées sont en **fin de ligne**, les colonnes existantes restent inchangées :
  - coefficient appliqué ;
  - origine du coefficient ;
  - quantité source de la correction ;
  - correction obsolète (motif).
- **JSON** : contrat GP 1.1.0.
- **Impression** : inchangée.

## 12. Tests (§9)

| Exigence | Preuve |
|---|---|
| Calculs décimaux exacts | Vitest « calculs décimaux EXACTS » ; parités P1 et P2 (SQL = TS au centime) |
| Grands volumes | Vitest 1 000 / 5 000 / **20 000 lignes** avec coefficients et corrections : sous-totaux = total, contrat GP valide. Playwright 100 / 1 000 / 5 000 lignes sur pile réelle (ci-dessous) |
| Overrides | pgTAP A1–A7 (+ Lot 10 A1–A10), Vitest traçabilité, Playwright corrections |
| Stale | pgTAP A6–A7, Vitest (quantité, sans prix, non calculable, montant), Playwright (quantité 5 → 6 u) |
| Plans figés / dérivés | pgTAP V1–V4 : paramètres figés au gel ; changement ultérieur sans effet sur le figé ; dérivé recalculé avec les paramètres courants, corrections non copiées. Lot 10 V1–V9 |
| Exports | Vitest CSV / GP ; Playwright CSV filtré, JSON 1.1.0, impression |
| Contrat GP | Vitest 1.1.0 (hypothèses, prix, valeur source, idempotence, interdits, rétro-compatibilité 1.0) ; Playwright JSON réel |
| Sécurité | pgTAP T1–T5 (consultation, autre tenant, anonyme), G1–G4 (mode sûr) ; Playwright (autre tenant 42501, acompte 22023, PT409) |

**Playwright, pile réelle** :

- `tools-releve-lot10.spec.ts` : **11 / 11**, deux passages.
- Non-régression, exécution fichier par fichier :

| Fichier | Résultat |
|---|---|
| Lot 2 | **4 / 4** |
| Lot 3 | **6 / 6** (pile neuve) |
| Lot 4 | **19 / 19** |
| Lot 5 | **17 / 17** |
| Lot 6 | **16 / 16** |
| Lot 7 | **15 / 15** |
| Lot 8 | **12 / 12** |
| Lot 9 | **12 / 12** |
| Atelier | **6 / 6** |

Écarts observés sur une pile **réutilisée** (comptes de recette ayant accumulé plusieurs dizaines de relevés, dont des relevés de 5 000 lignes) :

- un enchaînement de tous les fichiers dans une seule commande a échoué une fois à la **connexion** (Lot 4) ;
- le Lot 3 « recherche et filtres de la liste » a échoué une fois.

Sur une **pile neuve**, Lot 3 : 6 / 6 et Lot 2 : 4 / 4. Lot 4 relancé seul sur la pile réutilisée : 19 / 19. Ces deux échecs viennent de l'environnement de recette, pas du Lot 10, qui ne touche ni la liste des relevés ni la connexion.

**Performances (pile réelle, `next dev`, second passage, ms)** :

| Lignes | Calcul RPC | Édition prix RPC | Recalcul | Vue complète | Édition à l'écran | Sous-totaux | CSV | JSON |
|---|---|---|---|---|---|---|---|---|
| 100 | 49 | 13 | 49 | 2 005 | 207 | 97 | 52 | 261 |
| 1 000 | 295 | 13 | 294 | 2 385 | 937 | 124 | 84 | 497 |
| 5 000 | 1 399 | 14 | 1 307 | 5 161 | 1 923 | 270 | 270 | 1 101 |

Enregistrer les coefficients recalcule **tous les plans non figés du relevé**. Dans la recette, le relevé contient aussi les plans de 100, 1 000 et 5 000 lignes : **4,1 s**. Le domaine seul traite 20 000 lignes avec coefficients et contrat GP en environ 1,5 s (Vitest).

## 13. Suite pgTAP complète

| Base | Fichiers | Tests | Fichiers en échec |
|---|---|---|---|
| V8 de référence `53b4bc76` (371 migrations) | 163 | 8 073 | 9 |
| **Lot 10** (373 migrations) | **165** | **8 193** | **les mêmes 9, mêmes compteurs** (diff vide, hors largeur de colonne) |

Les 9 échecs sont les limites connues du banc local, identiques sur la référence :

- Studio ×7 : schéma du projet dédié absent du projet partagé ;
- `platform_stripe_state_attestation_r72` : pgsodium simulé ;
- `elsatia_tools_cloud_sync_entitlement_closure_v1`.

Sur la base de travail, **avant** la migration 1402, `incident_safe_mode_v1` et `v8_convergence_incident_gardes_v1` échouaient aussi à cause du Lot 10 (§2). Ils sont verts après.

## 14. DECISION_REQUIRED (choix conservateurs retenus, la mission ne devant pas s'arrêter)

| # | Sujet | Choix |
|---|---|---|
| D1 | Point de départ | train V8 qualifié + reprise des commits Lot 10 déjà portés sur V8, audités ; Lot 11 non repris |
| D2 | Où vivent les prix | couche séparée (tables dédiées, 1401) ; le Lot 9 reste sans prix, ses tests sont inchangés |
| D3 | Portée des coefficients général / lot | **par relevé** (chantier) : un seul réglage terrain pour tous les étages. **Figés avec chaque plan au gel**, si bien qu'un plan figé ne change jamais |
| D4 | Priorité | **substitution** (le plus précis l'emporte), **jamais de cumul** : lisible sur le terrain, aucun effet d'empilement assimilable à une marge |
| D5 | Coefficient 1 sur l'ouvrage | prime (neutralise lot et général) ; champ vide = hérité ; les prix existants sans coefficient deviennent « hérités », donc identiques tant qu'aucun coefficient de relevé n'est posé |
| D6 | Perte | toujours celle du Lot 9, incluse dans la quantité retenue ; jamais dans un prix ni dans un coefficient |
| D7 | Contrat GP | mineure **1.1.0** additive ; aucun code GP modifié ; compatibilité avec l'import Lot 11 vérifiée par lecture seulement |
| D8 | Obsolescence | sur quantité **ou** montant ; motif « quantité » prioritaire ; corrections antérieures à 1402 : règle du 1401 (montant seul) |
| D9 | Hypothèses | texte libre ≤ 2 000 caractères, transmis à GP ; inclus dans la clé d'idempotence |
| D10 | Filtre de travaux | état local de la vue (non persisté dans l'URL) ; l'export JSON GP reste **complet** (GP reçoit tout), seul le CSV suit le filtre |
| D11 | Mode sûr | garde posée par 1402 sur les tables 1401 (correctif additif, aucune migration existante modifiée) |
| D12 | Attendus du train | synchronisés (373 / `20260930001402`) : documents générés seulement |

## 15. Limites réelles

| Sujet | État |
|---|---|
| Appareils physiques, Safari / WebKit iOS | **non testés** (MOBILE EMULATED ONLY) |
| Import côté Gestion Pro | non construit ici (Lot 11 distinct) ; contrat 1.1.0 préparé, validé, non transmis |
| Recalcul après changement de coefficient | relit tous les plans du relevé : 4,1 s avec un plan de 5 000 lignes dans le relevé (`next dev`) |
| Faux positif théorique du contrôle GP | une hypothèse saisie contenant une chaîne entre guillemets suivie de « : » et d'un mot interdit pourrait être prise pour une clé par l'expression régulière (préexistant, déjà vrai pour les raisons de correction) |
| Performances | mesurées en `next dev`, pile locale ; à remesurer en build de production / Preview |

## 16. Commandes rejouables

```text
scripts/local-postgres-bootstrap/rebuild_db.sh lot10_fresh                                  → 373 migrations
cd supabase/tests && pg_prove -d lot10_fresh elsatia_tools_releve_metre_lot10*.test.sql      → 67 + 53
node scripts/releve/estimation-parite-coefficients.mjs <base> 40 20261002                  → jeu P2 (fixture)
npx vitest run ; (apps/tools) npx vitest run ; npx tsc --noEmit ; (apps/tools) npx tsc --noEmit && npm run lint
npm run verify:migrations ; npm run verify:train-expectations
scripts/local-postgres-bootstrap/releve_e2e_stack.sh + (apps/tools) next dev --webpack -p 3020
  + npx playwright test tests/e2e/tools-releve-lot10.spec.ts --project=desktop-chromium           → 11/11 (×2)
  + npx playwright test tests/e2e/tools-releve-lot<N>.spec.ts --project=desktop-chromium (N = 2…9) + atelier
```
