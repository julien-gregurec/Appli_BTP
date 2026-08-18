# RENTABILITÉ-V1C — Prévisionnel + prévu/réalisé

Référence : `docs/commercial/RENTABILITE_V1_AUDIT_ELSATIA.md` (audit), `docs/commercial/RENTABILITE_V1B_CORRECTIONS_P0_ELSATIA.md` (P0 corrigés). Ce lot construit une chaîne prévisionnelle à partir des données déjà présentes dans ELSATIA — aucune donnée n'est inventée. Périmètre strict : ni Commandes fournisseurs V1, ni Avenants V1, ni Facturation BTP V2, ni refonte globale.

Branche : `claude/rentabilite-v1c-previsionnel` (depuis `7ee5a06`, RENTABILITÉ-V1B + ajout marge fiche chantier). Commit dédié : `feat(rentabilite): ajouter previsionnel et ecarts chantier`.

## 1. Ce qui est réellement disponible comme donnée prévisionnelle

Audit du schéma (pas d'hypothèse) :

| Donnée prévue | Source | Fiabilité |
|---|---|---|
| CA prévu | `devis.montant_ht` où `statut='accepte'`, agrégé par chantier — **déjà calculé** sous le nom `budgetHt` par RENTABILITÉ-V1B | Fiable |
| Heures prévues | `lignes_devis.quantite` où `type='main_oeuvre'` et `unite='h'` | Fiable, avec une limite (§3) |
| Coût main-d'œuvre prévu | **Aucune source** | Absent |
| Achats prévus (matériaux) | **Aucune source utilisable** — voir §2 | Absent |
| Sous-traitance prévue | `sous_traitants_chantiers.montant_previsionnel_ht` | Fiable |
| Marge prévue | Dépend des deux lignes « Absent » ci-dessus | Non calculable aujourd'hui |

Aucune migration n'a été nécessaire : toutes les données mobilisées existaient déjà, simplement jamais consommées côté rentabilité (déjà noté par l'audit V1 comme « présent, non consommé » pour `sous_traitants_chantiers`).

## 2. Pourquoi le coût de main-d'œuvre prévu et les achats prévus ne sont pas calculés

`lignes_devis` porte un **prix de vente au client** (`prix_unitaire_ht`), jamais un coût interne. Une ligne de devis de type `fourniture` à 6 500 € HT dit combien le client paiera pour les fournitures, pas combien elles coûteront réellement à l'entreprise (marge du fournisseur déjà incluse dans le prix vendu). De même, aucune ligne de devis n'est rattachée à un salarié ni à un coût horaire prévisionnel — impossible de convertir des heures de devis en euros de coût sans inventer un taux.

Réutiliser le prix de vente comme s'il s'agissait d'un coût, ou réutiliser le coût horaire *actuel* d'un salarié comme s'il s'agissait d'un coût *prévisionnel*, aurait mélangé chiffre d'affaires et coût — exactement le type d'erreur que RENTABILITÉ-V1B a corrigé pour le coût horaire réel. Ce lot ne le reproduit pas côté prévisionnel : ces deux postes restent explicitement `null`, jamais `0`, jamais une valeur approchée silencieuse.

**Conséquence directe** : la marge prévue (`margePrevue`) n'est actuellement **jamais calculée** dans ELSATIA — elle nécessiterait le coût MO prévu ET les achats prévus, tous deux absents. Le code est écrit pour se déclencher automatiquement si ces deux données deviennent un jour disponibles (aucune coupure en dur), mais aujourd'hui `margePrevue` et `tauxMargePrevu` valent toujours `null`. C'est un choix assumé : afficher une marge prévue partielle (ignorant silencieusement la MO et les achats) aurait été trompeur plutôt qu'utile.

## 3. Heures prévues — limite assumée

Une ligne de devis en `forfait` (prix global, sans détail d'heures) ne contribue à aucune heure prévue, même si elle correspond à du travail réel. Dans les données réelles observées (`ELSATIA — Recette Preview`), les lignes `main_oeuvre` sont systématiquement en `unite='h'` (35/35 lignes vérifiées) — la convention est fiable quand elle est utilisée, mais un devis entièrement en lignes forfaitaires n'aura aucune heure prévue calculée. Le tableau de bord signale ce cas (⚠ sur la ligne « Heures ») plutôt que d'afficher silencieusement 0.

## 4. Structure canonique

`src/lib/rentabilite.ts` expose désormais `calculerPrevuRealiseChantiers()`, construite **au-dessus** de `calculerRentabiliteChantiers()` (RENTABILITÉ-V1B, inchangée) — aucune seconde source de vérité pour le réalisé.

```
type EcartIndicateur = { prevu: number | null; realise: number; ecart: number | null; ecartPourcent: number | null };

PrevuRealiseChantier = RentabiliteChantier & {
  caPrevuHt, heuresPrevues, coutMainOeuvrePrevu, coutAchatsPrevu, coutSousTraitancePrevu,
  margePrevue, tauxMargePrevu,
  ecarts: { ca, heures, coutMainOeuvre, coutAchats, marge, tauxMarge }: EcartIndicateur,
};
```

- `ecart = realise - prevu`.
- `ecartPourcent = ecart / |prevu| * 100`, sauf si `prevu` est `null` ou `0` → `ecartPourcent = null` (jamais de `NaN`/`Infinity`, vérifié par test).
- Quand `prevu` est `null`, tout l'objet écart reste cohérent (`ecart: null`, `ecartPourcent: null`) plutôt que de fabriquer un chiffre.

Page `/rentabilite`, action `analyserRentabiliteIAAction` et outil copilote `rentabilite_chantiers` appellent tous cette même fonction — aucune divergence possible entre les trois écrans, par construction (RENTABILITÉ-V1B avait déjà éliminé structurellement ce risque ; ce lot l'étend au prévisionnel sans le réintroduire).

## 5. Interface

- **Page `/rentabilite`** : nouvelle section « Prévu / Réalisé (toute l'entreprise) », format tableau `Indicateur | Prévu | Réalisé | Écart`, sans refonte du reste de l'écran. CA et heures affichent de vrais chiffres ; coût MO, achats et marge affichent explicitement « Non renseigné » en colonne Prévu plutôt qu'un 0 trompeur.
- **Fiche chantier** (`/chantiers/[id]`) : nouvelle carte « Heures prévues (devis) » à côté des cartes marge/taux ajoutées après RENTABILITÉ-V1B, montrant le réalisé et l'écart.
- **IA** (analyse par chantier + copilote conversationnel) : reçoit les heures prévues et l'écart, avec instruction système explicite de ne jamais inventer un coût MO/achats/marge prévue absent.

## 6. Cas gérés

- Devis brouillon/refusé/expiré/annulé : jamais inclus (le filtre `statut='accepte'` de RENTABILITÉ-V1B s'applique identiquement aux lignes de devis, puisque `caPrevuHt` = `budgetHt`).
- Plusieurs devis acceptés sur un même chantier : agrégés (somme), comme `budgetHt` l'était déjà.
- Sous-traitance prévue : exclut les missions `annulee` (cohérent avec le traitement des dépenses/factures ailleurs dans la formule).
- Prévu = 0 ou absent : `ecartPourcent` reste `null`, jamais de division par zéro.
- Écart négatif (dérive favorable ou défavorable selon le signe) : géré sans cas particulier, testé explicitement.
- Cross-tenant : `lignes_devis` (via la policy existante sur `devis`) et `sous_traitants_chantiers` (RLS dédiée) sont des tables déjà protégées avant ce lot ; testé à nouveau par pgTAP pour confirmer qu'aucune régression n'a été introduite en les consommant depuis ce nouveau chemin.

## 7. Non traité, volontairement

- **Modification d'un devis après acceptation** : non auditée en détail dans ce lot (hors périmètre explicite). Risque connu et documenté par l'audit V1 (§14/§21) : sans concept d'avenant, un chantier fortement modifié après son devis initial verra son prévisionnel dériver du réel de façon non traçable. AVENANTS-V1 devra traiter ce point.
- **Commandes fournisseurs** comme source d'achats prévus/engagés : explicitement exclu de ce lot (futur COMMANDES-V1), conformément à la consigne.
- **Anti-surfacturation** : non retouché (le garde-fou partiel identifié par l'audit reste tel quel, classé Facturation BTP).
- **Wording « chantier en cours »** : aucun changement de formulation supplémentaire au-delà de l'affichage « Non renseigné » déjà présent — la distinction prévu/réalisé/à date reste implicite dans les libellés existants, jugée suffisante pour ce lot.

## 8. Tests

### Unitaires (`src/lib/rentabilite.test.ts`, 9 nouveaux tests, mock du client Supabase)
CA prévu = source déjà utilisée pour le réalisé ; heures prévues issues des lignes main-d'œuvre en heures uniquement (jamais du forfait) ; heures prévues `null` (pas 0) quand aucune ligne ne correspond ; coût MO prévu et achats prévus toujours `null` ; sous-traitance prévue depuis `sous_traitants_chantiers` ; marge prévue jamais calculée partiellement ; aucun `Infinity`/`NaN` quand `prevu=0` ; écart négatif géré sans erreur ; le réalisé reste strictement identique à `calculerRentabiliteChantiers`.

### Base de données (`supabase/tests/rentabilite_v1c_previsionnel.test.sql`, 8 assertions pgTAP)
Cross-tenant sur `lignes_devis` (via jointure `devis`) et `sous_traitants_chantiers` : admin A/B ne lisent que leurs propres lignes/missions ; rôle sans droit financier (ouvrier) n'en lit aucune.

### Dynamique — chantier fictif « Prévu Réalisé V1C »
Construit en Local (devis accepté 10 000 € HT : 100 h de MO facturées à l'heure + fourniture en forfait ; devis refusé 99 999 € avec 999 h fantômes, exclu ; réalisé : 120 h pointées, facturé 10 000 €, achats 3 500 €, sous-traitance réelle 1 200 €, sous-traitance prévue 1 000 €). Résultat de la **vraie fonction** `calculerPrevuRealiseChantiers` contre la **vraie base Postgres locale** :

| | Prévu | Réalisé | Écart |
|---|---:|---:|---:|
| CA | 10 000 € | 10 000 € | 0 € (0 %) |
| Heures | 100 h | 120 h | +20 h (+20 %) |
| Coût MO | Non renseigné | 2 400 € | — |
| Achats | Non renseigné | 3 500 € | — |
| Marge | Non renseigné | 2 900 € | — |
| Sous-traitance (info) | 1 000 € | 1 200 € | (non inclus dans la structure d'écarts, exposé en donnée brute) |

Conforme au chiffre près, y compris le comportement volontaire « non calculé » plutôt qu'une valeur fabriquée.

## 9. Qualité et déploiement

`npm run typecheck` (0 erreur), `npm run lint` (0 erreur, 3 avertissements `<img>` préexistants), `npm run test` (333/333), `npm run test:db` (365/365 assertions pgTAP), `npm run build` (réussi). Aucune migration nécessaire (aucune structure manquante). Aucune action Production. Déployé sur `elsatia-preview` ; chantier fictif reconstruit à l'identique dans « ELSATIA — Recette Preview » pour vérification visuelle humaine.

## 10. Reclassement des P1 de l'audit initial

| P1 initial | Statut après V1C |
|---|---|
| `budget_previsionnel` non synchronisé avec les devis | Non corrigé — `budget_previsionnel` reste un champ manuel distinct (décision : ne pas le supprimer ni le forcer à s'aligner sur le CA prévu par devis, ce sont deux usages différents constatés dans le code). CA prévu par devis est désormais exposé séparément (`caPrevuHt`). |
| Aucun concept d'avenant | Reste pour AVENANTS-V1 |
| `mouvements_stock` sans RLS par permission | Peut attendre après commercialisation |
| Garde-fou de surfacturation partiel | Reste pour Facturation BTP |
| Achats prévus/sous-traitance prévue/coût outillage jamais consommés | **Sous-traitance prévue : corrigé V1C** (`sous_traitants_chantiers` désormais consommé). Achats prévus (matériaux) et coût outillage : restent non consommés — aucune source de coût fiable (§2), reste pour un futur lot si une telle source est un jour créée. |
| Aucune comparaison prévu/réalisé pour la marge | **Corrigé V1C** pour CA et heures ; reste ouvert pour coût MO/achats/marge tant que ces coûts prévus n'existent pas |
| `coutNotesFrais` en TTC alors que le reste est en HT | Non corrigé — hors périmètre de ce lot |
