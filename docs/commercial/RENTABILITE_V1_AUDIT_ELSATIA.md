# RENTABILITÉ-V1 — Audit de bout en bout du chantier

Audit réalisé en lecture seule (sauf documentation), worktree `liria-codex`, branche `claude/rentabilite-v1-audit`, base `codex/c6b-corrections-premier-client` (commit `7fc8b8d` — inclut TARIFS-V2, ADMIN-V1, PROMO-V1, C6-B). Aucun code fonctionnel modifié. Aucune donnée Production touchée.

**Portée de cette version du document** : couvre l'intégralité de l'audit statique (code + schéma), sections 1 à 21 et 28 à 39 du cahier des charges. Les tests dynamiques sur chantier fictif (sections 22 à 27 — dérive main-d'œuvre/achats réelle, facturation partielle, suppression/correction en conditions réelles) **n'ont pas été exécutés dans cette passe** — voir « Limite explicite » en fin de document.

---

## 1. Architecture actuelle — vue d'ensemble

Le flux cible (`CLIENT → DEVIS → CHANTIER → BUDGET PRÉVU → PLANNING → POINTAGES → COÛT MO → ACHATS → AVENANTS → FACTURATION → PAIEMENT → RENTABILITÉ`) existe **partiellement et de façon asymétrique** :

- La chaîne **réalisé** (facturé − coûts réels pointés/achetés) est correctement construite et alimente un vrai calcul de marge.
- La chaîne **prévu** (budget, heures, coûts prévisionnels) est **fragmentaire** : un seul champ prévisionnel existe (`chantiers.budget_previsionnel`, saisie libre), jamais recoupé avec les devis ni utilisé dans aucun calcul de marge.
- Le calcul de marge lui-même est **dupliqué trois fois** dans le code, avec une divergence réelle entre l'une des trois versions et les deux autres (voir §18-19 — c'est le constat le plus important de cet audit, classé P0).

## 2. Cartographie des objets métier

| Objet | Table(s) | Lien chantier | Statut |
|---|---|---|---|
| Client | `clients` | `chantiers.client_id` (obligatoire) | Fonctionnel |
| Devis | `devis`, `lignes_devis` | `devis.chantier_id` (optionnel) | Fonctionnel |
| Chantier | `chantiers` | — | Fonctionnel |
| Budget prévisionnel | `chantiers.budget_previsionnel` | natif | **Partiel** (saisie manuelle, jamais synchronisée) |
| Planning | `affectations` (actif), `planning_evenements` (désactivé, non nettoyé), `equipes_chantiers` | natif | Fonctionnel (mais deux systèmes coexistent) |
| Pointages | `sessions_pointage` (brut GPS/photo) → `pointages` (agrégé + validation) | natif | Fonctionnel |
| Coût horaire salarié | `employes.cout_horaire` | — | **Partiel** (pas d'historique daté) |
| Achats/commandes | `commandes_fournisseurs`, `lignes_commande` | optionnel | Présent, lié, **non consommé en rentabilité** |
| Factures fournisseurs | `depenses_fournisseurs`, `reglements_fournisseurs` | optionnel | Fonctionnel et consommé |
| Charges récurrentes | `charges_recurrentes` | optionnel | Présent ; seule sa matérialisation compte |
| Notes de frais | `notes_frais` | optionnel | Fonctionnel et consommé |
| Sous-traitance (réel) | `depenses_fournisseurs` (catégorie `sous_traitance`) | oui | Fonctionnel et consommé |
| Sous-traitance (prévisionnel) | `sous_traitants_chantiers` | obligatoire | Présent, **non consommé en rentabilité** |
| Véhicules | `vehicules` | **absent** | Aucun coût, aucun lien chantier |
| Outillage | `outils`, `mouvements_outillage` | oui (affectation) | Lié, coût d'achat **non consommé** |
| Avenants / travaux supplémentaires | — | — | **Absent** (aucune table, aucun concept) |
| Factures clients | `factures`, `lignes_factures` | optionnel, cardinalité 1→N | Fonctionnel |
| Avoirs | `factures` (type `avoir`, montants négatifs) | via `facture_origine_id` | Fonctionnel |
| Paiements clients | `paiements` | via `facture_id` | Fonctionnel |
| Marge / rentabilité | calcul TypeScript pur, aucune colonne/vue stockée | — | Fonctionnel mais **dupliqué et divergent** |

## 3. Devis → chantier

- Le lien est `devis.chantier_id → chantiers.id` (nullable). **Il n'existe aucune colonne inverse** : un chantier ne référence jamais « son » devis. Un chantier doit exister avant qu'un devis puisse lui être rattaché.
- **Aucun montant du devis n'est recopié physiquement sur `chantiers`.** `budget_previsionnel` est une saisie manuelle indépendante (formulaire de création de chantier), jamais alimentée par trigger ou fonction depuis `devis.montant_ht/ttc`.
- Deux notions de « budget » coexistent sans lien mécanique :
  1. `chantiers.budget_previsionnel` (saisie libre, potentiellement absente ou obsolète) ;
  2. la somme des `devis.montant_ttc`/`montant_ht` où `statut='accepte'` (calculée à la volée, utilisée par le vrai calcul de rentabilité).
  C'est la **seconde** qui alimente réellement `budgetHt` dans les 3 implémentations du calcul de marge — `budget_previsionnel` n'est utilisé **que** pour l'affichage synthétique de la fiche chantier (`ChantierProgressCharts`), jamais dans un calcul financier.
- Cascade de statuts automatique existe (`trg_devis_sync_chantier`, `trg_facture_sync_chantier`) : un devis envoyé/accepté ou une facture émise fait avancer le statut du chantier, jamais reculer. **Mais aucun de ces triggers ne génère ou ne met à jour un chantier depuis un devis** — la création de chantier reste toujours une action manuelle séparée.
- Cardinalité réelle **1 chantier → N devis**, sans contrainte d'unicité. Correctement agrégée dans les 3 formules de marge (tous les devis acceptés d'un chantier sont sommés pour `budgetHt`).

## 4. Budget prévu du chantier

Un seul champ prévisionnel existe réellement en base : `chantiers.budget_previsionnel numeric` (nullable, saisie libre). **Il n'existe aucune colonne `heures_prevues`, `cout_prevu`, `marge_prevue`, `ca_prevu` ni équivalent sur `chantiers`** — recherche exhaustive dans les 178 migrations, confirmée négative.

Conséquence directe : **il n'existe aucune valeur de « coûts prévus » stockée ou calculée nulle part** (ni MO prévue en euros, ni achats prévus, ni sous-traitance prévue, ni marge prévue). Seul un CA prévisionnel existe réellement, sous deux formes non synchronisées (`budget_previsionnel` saisi à la main, ou la somme des devis acceptés calculée à la volée) — **aucune des deux n'est comparée à un coût prévisionnel**, car aucun coût prévisionnel n'est calculé.

## 5. Main-d'œuvre prévue

`affectations.heures` (table planning réellement utilisée) porte les heures planifiées par salarié/chantier/date. C'est une **quantité d'heures**, jamais convertie en **coût prévu** nulle part dans le code (aucune jointure `affectations → employes.cout_horaire` trouvée). ELSATIA sait donc distinguer :
- heures planifiées (`affectations.heures`, sommées à la volée) ;
- heures réellement pointées et validées (`pointages` filtré `verification_statut='valide'`).

Mais il n'existe **aucun coût de main-d'œuvre prévisionnel** (heures planifiées × coût horaire), seulement un coût réalisé (heures pointées × coût horaire).

## 6. Planning → chantier

Deux systèmes coexistent :
- `planning_evenements` : modèle agenda posé dès l'origine, **explicitement désabandonné côté UI** (commentaire de migration confirmant qu'il « reste en place mais n'est plus utilisé »). Table morte, jamais nettoyée.
- `affectations` : le vrai système utilisé, avec verrou anti-dépassement (24h/jour/employé), FK composites vers `chantiers`/`employes`, et lien optionnel `pointages.affectation_id → affectations.id`.
- `equipes_chantiers` : affectation d'équipe permanente (rôle, date début/fin), distincte du planning journalier.

Le planning alimente uniquement l'affichage « heures planifiées » (`totalHeures` sur la fiche chantier) — il n'alimente aucun coût prévisionnel ni charge financière.

## 7. Pointages réels

Flux confirmé : `sessions_pointage` (arrivée/départ GPS + photo horodatées) → clôture via RPC `cloturer_session_pointage()` → ligne `pointages` (heures normales/supplémentaires calculées, statut initial `verification_statut='a_verifier'`) → validation manuelle (`valider_preuve_pointage`) → `verification_statut='valide'`.

Mécanisme de correction : pas de champ « corrigé » binaire, mais un système de traçabilité (`origine_pointage` : `gps_complet`/`arrivee_oubliee`/`depart_oublie`/`regularisation_responsable`, plus `anomalie_niveau`/`anomalie_motif`) — plus riche qu'un simple flag, permet de distinguer les pointages réguliers des régularisations.

## 8. Coût horaire

Source de vérité : `employes.cout_horaire` (coût interne, distinct de `taux_horaire` qui est le tarif facturé au client — bien séparés dans le formulaire employé).

**Aucun historique daté n'existe.** C'est une valeur unique, modifiable en place par un simple `UPDATE`, sans table d'historique ni journal d'audit dédié. **Conséquence directe et non conforme à la règle de bon sens énoncée dans le périmètre de cet audit** (« un ancien pointage ne doit pas changer rétroactivement si le coût d'un salarié change ») : les trois calculs de rentabilité font une jointure **live** `pointages → employes(cout_horaire)`. Si le coût horaire d'un salarié est modifié aujourd'hui, **la rentabilité de tous les chantiers passés où il a pointé se recalcule rétroactivement avec le nouveau coût**, y compris pour des pointages de plusieurs mois. C'est un comportement structurel du modèle de données, pas un bug isolé — classé P0 (voir §39).

## 9. Coût réel main-d'œuvre

Formule confirmée (identique dans les 2 implémentations cohérentes) : `Σ (heures_normales + heures_supplementaires) × employe.cout_horaire`, sur les pointages `verification_statut='valide'` uniquement. Pas de règle spécifique heures de nuit/week-end trouvée dans le calcul de coût (les heures supplémentaires sont comptées au même taux horaire que les heures normales — pas de majoration appliquée dans la formule de rentabilité, à distinguer d'une éventuelle majoration en paie, module distinct non audité en détail ici).

**Incohérence confirmée** : la troisième implémentation (`src/lib/rentabilite.ts`, utilisée par le copilote IA conversationnel) **ne filtre pas** sur `verification_statut` — elle inclut aussi les pointages `sans_preuve`, `a_verifier` et `rejete` dans le coût de main-d'œuvre. Un pointage rejeté (donc explicitement invalidé par un responsable) est quand même compté comme un coût réel par le copilote IA.

## 10. Achats et dépenses chantier

Voir tableau §2. Point clé : **le coût réel chantier ne repose que sur les factures fournisseurs (`depenses_fournisseurs`), jamais sur les commandes elles-mêmes.** Une commande fournisseur confirmée mais pas encore facturée n'apparaît nulle part dans la rentabilité — il n'y a donc pas d'« engagé non facturé » visible, seulement du facturé.

## 11. Commandes fournisseurs

État réel (avant tout développement de Commandes V1) :
- Modèle complet et fonctionnel : `commandes_fournisseurs` + `lignes_commande`, statuts (`brouillon→envoyee→confirmee→recue_partiel/recue→annulee`), réception partielle trackée (`quantite_recue`), PDF d'impression existant (`src/app/imprimer/commandes/[id]/page.tsx`).
- Lien chantier : présent, optionnel.
- **Classement : Fonctionnel comme module de gestion d'achat, mais Présent-non-relié du point de vue rentabilité** — le montant de la commande n'entre dans aucun calcul de marge (seule la facture fournisseur qui en découle, via `depenses_fournisseurs.commande_id`, est comptée).

## 12. Factures fournisseurs

Fonctionnel et bien conçu : rapprochement commande↔facture via trigger (`trg_verifier_depense_fournisseur`, hérite `chantier_id` de la commande si absent sur la facture), statut payé/partiel/impayé recalculé automatiquement depuis `reglements_fournisseurs` (paiements multiples possibles), catégorisation (`materiaux/sous_traitance/location/transport/carburant/outillage/assurance/autre`) directement exploitée pour scinder `coutAchats`/`coutSousTraitance`.

Point d'attention (P2, pas P0) : le statut `litige` est **inclus** dans le coût réel au même titre que `payee`/`a_payer` (seul `annulee` est exclu) — une facture contestée compte donc comme un coût certain dans la marge.

## 13. Notes de frais

Fonctionnel, lien chantier optionnel (ajouté après coup par migration dédiée, pas natif à la création du module). Statuts inclus dans le coût réel : ensemble large (`valide`, `exporte_comptabilite`, `verrouille`, `archive`, `validee`, `remboursee`) — cohérent, exclut a priori les notes non validées/refusées.

**Incohérence HT/TTC repérée** : `coutNotesFrais` est sommé en **`montant_ttc`**, alors que tous les autres postes de coût de la même formule (`coutAchats`, `coutSousTraitance`) sont en **`montant_ht`**, et que `factureHt`/`budgetHt` sont également en HT. La marge résultante mélange donc HT et TTC sur ce poste précis — classé P1 (voir §39).

## 14. Avenants / travaux supplémentaires

**Confirmé absent, sans ambiguïté.** Aucune table, colonne, ni concept applicatif. Le seul chemin observable pour ajouter du montant à un chantier déjà en cours est de créer un **devis complètement séparé** (éventuellement via `dupliquer_devis()`, qui ne conserve aucun lien de parenté — pas de `devis_parent_id`), rattaché au même `chantier_id`. Un devis déjà accepté est immuable (`modifier_devis_brouillon()` refuse toute modification hors statut `brouillon`).

Ce second devis est correctement agrégé dans `budgetHt` (somme de tous les devis acceptés du chantier), donc l'**effet financier global** d'un « avenant informel » (un 2ᵉ devis) est bien pris en compte côté CA prévu — mais **rien dans l'UI ni le modèle ne l'expose comme un avenant** ; c'est un contournement, pas une fonctionnalité.

## 15. Facturation client

Fonctionnel et riche : types `simple/acompte/situation/finale/avoir`, facturation d'avancement complète (situations avec cumul, retenue de garantie, DGD), paiement en ligne Stripe côté client final (distinct de l'abonnement SaaS ELSATIA — bien vérifié, aucune confusion dans le code). Cardinalité confirmée N factures par chantier.

**Garde-fou de surfacturation partiel** : `creer_facture_avancee` vérifie `Σ factures.montant_ht (hors annulée) + nouveau ≤ devis.montant_ht`, mais le commentaire de la migration elle-même reconnaît que ce garde-fou **ignore le mécanisme indépendant `situations_travaux`**, qui a son propre plafond à 100 % sans connaître les acomptes/finales du même devis. Un devis peut donc être surfacturé en combinant les deux mécanismes — classé P1.

## 16. Montant facturé vs montant encaissé

Bien distingués en base (`factures.montant_ttc` vs `factures.montant_paye`, recalculé depuis `paiements`), mais **la rentabilité n'utilise que le facturé (`factureHt`), jamais l'encaissé**. C'est cohérent avec une logique de marge économique (comptabilité d'engagement), à condition que ce choix soit assumé et documenté — il ne l'est nulle part dans le code ni l'UI (aucune mention explicite « la marge se base sur le facturé, pas l'encaissé »).

## 17. Paiements

Table `paiements`, correctement distincte de :
- `abonnement_evenements`/`factures_abonnement` (facturation SaaS ELSATIA elle-même) ;
- `coordonnees_bancaires`/`bulletins_paie`/`connexions_bancaires`/`lots_virements` (module paie salariés, Powens).

Aucune confusion trouvée entre ces trois univers. Paiements partiels correctement gérés par agrégation.

## 18. Calcul de marge actuel — LE CONSTAT CENTRAL DE CET AUDIT

Trois implémentations TypeScript indépendantes, aucune fonction ni vue SQL :

| # | Fichier | Usage | Formule | Filtre pointages |
|---|---|---|---|---|
| A | `src/lib/rentabilite.ts` (`calculerRentabiliteChantiers`) | Copilote IA conversationnel (`src/lib/ai/copilote.ts`, outil `rentabilite_chantiers`) | `factureHt − coutMainOeuvre − coutAchats − coutSousTraitance` (4 postes) | **Aucun** — inclut tous statuts |
| B | `src/app/actions/rentabilite.ts` (`analyserRentabiliteIAAction`) | Bouton « Analyse IA » par chantier | `factureHt − coutMainOeuvre − coutAchats − coutSousTraitance − coutIndemnitesPaie − coutStock − coutNotesFrais` (7 postes) | `verification_statut='valide'` |
| C | `src/app/(app)/rentabilite/page.tsx` (inline) | Tableau de bord `/rentabilite` (écran principal vu par l'utilisateur) | Identique à B (7 postes) | `verification_statut='valide'` |

**B et C sont cohérentes entre elles mais C est une troisième copie intégrale de la même logique (mêmes 8 requêtes Supabase), pas une factorisation.** A est **structurellement différente** de B/C : elle omet 3 postes de coût (stock consommé, notes de frais, indemnités de paie) et n'exclut pas les pointages non validés/rejetés.

**Conséquence directe, vérifiable sans test dynamique** : pour un même chantier, au même instant, le copilote IA peut annoncer une marge **plus élevée** que celle affichée sur le tableau de bord `/rentabilite` ou renvoyée par l'analyse IA détaillée du même chantier — car il soustrait moins de coûts. Aucun commentaire, aucun test, aucune documentation ne signale cet écart comme intentionnel. C'est classé **P0**.

## 19. Source de vérité rentabilité

Entièrement calculée à la volée (aucune colonne stockée, aucun trigger de recalcul, aucune vue matérialisée — vérifié par recherche exhaustive de `CREATE TRIGGER`/`CREATE VIEW`/`CREATE FUNCTION` mentionnant marge/rentabilité dans les 178 migrations : zéro résultat côté SQL). Seule la RPC `couts_indemnites_paie_par_chantier` est une brique SQL, et elle vérifie elle-même la permission `acces_rentabilite` en base — c'est la seule barrière RLS-like sur l'ensemble du calcul.

## 20. Recalcul automatique

Conséquence directe du §19 : **puisque rien n'est stocké, tout se recalcule automatiquement à chaque chargement de page**, pour toute modification de devis/pointage/coût salarié/achat/facture. Il n'y a donc pas de risque de valeur « obsolète en cache » — mais il y a un coût de performance (voir §35) et surtout le risque de divergence entre les 3 implémentations (§18) qui persiste à chaque recalcul.

## 21. Matrice prévu / réalisé

| Indicateur | Prévu | Réalisé | Source | Recalcul automatique |
|---|---:|---:|---|---|
| CA | Σ devis acceptés (HT) — `budgetHt` | Σ factures non annulées (HT) — `factureHt` | `devis`/`factures` | Oui (à la volée) |
| Heures | Σ `affectations.heures` | Σ pointages validés | `affectations`/`pointages` | Oui |
| Main-d'œuvre (€) | **Aucune donnée** | Σ heures validées × coût horaire actuel | `pointages`×`employes` | Oui (mais rétroactif si coût change — §8) |
| Achats | **Aucune donnée** (commandes non consommées) | Σ `depenses_fournisseurs` (hors sous-traitance) | `depenses_fournisseurs` | Oui |
| Sous-traitance | `sous_traitants_chantiers.montant_previsionnel_ht` existe **mais n'est lu par aucun calcul** | Σ `depenses_fournisseurs` (catégorie sous-traitance) | idem | Oui |
| Marge | **Jamais calculée** (`budgetHt` n'entre dans aucune formule de marge) | `factureHt − coûts réels` (formule A ou B/C selon l'écran) | calcul TS dupliqué ×3 | Oui, mais divergent |

**Constat** : ELSATIA sait afficher un CA prévu (via les devis) et une marge réalisée, mais **ne calcule jamais d'écart prévu/réalisé** — ni en CA (le prévu et le réalisé sont juste deux nombres côte à côte, jamais soustraits), ni en coûts, ni en marge. Le tableau de bord `/rentabilite` n'affiche donc pas de notion de dérive.

## 22-27. Tests dynamiques sur chantier fictif

**Non exécutés dans cette passe.** Voir « Limite explicite » en fin de document. Les réponses structurelles à ces questions (recalcul automatique, agrégation multi-devis, exclusion des annulés/avoirs) sont néanmoins déjà connues avec un haut niveau de confiance par lecture de code (§18-21), la formule étant entièrement déterministe et sans état caché.

## 28. Cross-tenant

Vérifié sur les 3 implémentations : toutes filtrent explicitement par `entreprise_id` provenant de `getContexteEntreprise()` (résolu côté serveur depuis la session, jamais un paramètre client). Les policies RLS restrictives (`acces_devis`, `acces_factures`, `acces_achats`, `acces_chantiers`) sont elles-mêmes scopées par `entreprise_id`. La RPC indemnités reçoit `p_entreprise_id` côté serveur. **Aucun signe d'agrégation cross-tenant trouvé.**

## 29. Statuts métier

- `depenses_fournisseurs` : exclut seulement `annulee` — **inclut `litige`** dans le coût réel (voir §12, P2).
- `notes_frais` : ensemble large de statuts validés inclus, cohérent.
- `pointages` : formule A (copilote IA) inclut tout statut, y compris `rejete` (voir §9/§18, dans le P0).
- `factures` : `factureHt` exclut `annulee` (toutes formules) ; seule la formule A exclut explicitement `type='avoir'` en plus du statut — B/C ne filtrent que par statut, ce qui reste correct car un avoir a un statut/type dédié et des montants négatifs (pas un risque de double-comptage identifié, juste une différence de filtre entre A et B/C, à noter pour la cohérence à terme).

## 30. TVA

`factureHt`/`budgetHt`/`coutAchats`/`coutSousTraitance` sont cohéremment en **HT**. **Une exception réelle** : `coutNotesFrais` est en **TTC** (voir §13, classé P1). Pas d'autre mélange HT/TTC trouvé dans le calcul de marge.

## 31. Arrondis

Aucun contrôle spécifique d'arrondi trouvé dans le calcul de rentabilité (arithmétique flottante JavaScript standard, `Number(...)`). Les montants de factures/devis passent par des colonnes `numeric` côté Postgres (précis), mais l'agrégation finale se fait en JS. Risque faible mais réel de dérive de centimes sur de gros volumes — non testé en pratique dans cette passe (nécessiterait le test dynamique §22-27). Classé P2.

## 32. Multi-devis / multi-factures

Confirmé fonctionnel : `devis.chantier_id` sans contrainte unique (1→N), `factures.chantier_id` idem. Les 3 formules agrègent correctement tous les devis acceptés pour `budgetHt` et toutes les factures non annulées pour `factureHt`. Pas d'incohérence trouvée sur ce point précis.

## 33. Sous-traitance

Voir §2 et §11 — deux objets bien distincts : le coût réel (`depenses_fournisseurs` catégorie `sous_traitance`, consommé) et le prévisionnel/l'affectation de mission (`sous_traitants_chantiers.montant_previsionnel_ht`, jamais consommé). Le second alimente `revalidatePath("/rentabilite")` sans que la donnée soit effectivement lue par la page — code mort partiel.

## 34. Matériel

Conforme à la consigne de ne rien intégrer artificiellement : `vehicules` n'a aucun coût ni lien chantier (absent) ; `outils.prix_achat_ht` existe et le chantier d'affectation est tracé, mais ce coût n'est lu par aucun calcul de rentabilité (présent, non consommé — classé futur lot, P3).

## 35. Performance

Le calcul de `/rentabilite` (formule C) fait 8 requêtes Supabase en `Promise.all`, sans pagination ni agrégation SQL — tout est chargé en mémoire côté Next.js puis agrégé en JS pour **tous les chantiers de l'entreprise simultanément**. Avec un volume de pointages/dépenses important (plusieurs années d'historique, dizaines de chantiers), le temps de chargement de cette page risque de se dégrader. Pas d'optimisation prématurée recommandée à ce stade (base de données actuelle petite), mais le risque est réel à signaler pour un lot futur si le volume de données croît.

## 36. UX rentabilité

L'écran `/rentabilite` affiche clairement CA, chaque poste de coût, marge et taux par chantier, avec un bandeau d'alerte pour les pointages sans coût horaire renseigné (bon réflexe, évite un coût silencieusement sous-estimé — mais confirmé qu'il ne bloque rien, juste un avertissement). En l'absence de comparaison prévu/réalisé (§21), un dirigeant voit sa marge réalisée mais ne voit jamais s'il est en avance ou en retard par rapport à ce qu'il avait prévu à la signature du devis — c'est la lacune UX la plus importante, directement liée au P0/P1 du §18-21, pas un problème de mise en page.

## 37. Permissions — POINT DE SÉCURITÉ RÉEL

- Accès à `/rentabilite` : correctement protégé par middleware (`acces_rentabilite`).
- `employes.cout_horaire` masqué côté UI par les permissions `voir_cout_interne_employe`/`voir_taux_facture_employe` — **mais aucune policy RLS ne protège la colonne ni la table en lecture directe**. La seule policy sur `employes` (`"membres accedent aux employes"`) exige uniquement le statut de membre actif, sans aucune vérification de permission. **Un salarié terrain authentifié qui interroge directement l'API PostgREST (en contournant le front Next.js) peut lire le `cout_horaire` de tous ses collègues**, alors même que l'UI le lui masque. Classé **P0** — c'est une fuite de donnée salariale sensible, pas juste un défaut d'ergonomie.
- Même constat, sévérité moindre, sur `mouvements_stock` (aucune policy RESTRICTIVE par permission, contrairement à `devis`/`factures`/`depenses_fournisseurs`/`chantiers`/`pointages` qui sont correctement protégées).
- Les autres briques du calcul (`acces_devis`, `acces_factures`, `acces_achats`, `acces_rentabilite` pour les indemnités) sont correctement vérifiées en RLS.

## 38. Export

Aucun export PDF/CSV/Excel de la rentabilité n'existe. L'export comptable existant (`/exports`) ne mentionne ni marge, ni coût horaire, ni rentabilité. Pas de risque d'incohérence d'export — la fonctionnalité est simplement absente (classé P3, futur lot).

## 39. Classement final des écarts

### P0 — Bloquant commercialisation (calcul faux ou incohérent, ou fuite de donnée sensible)

1. **Trois implémentations de la formule de marge, dont une (copilote IA) structurellement divergente** — un même chantier peut afficher deux marges différentes selon l'écran consulté, sans documentation de cet écart (§18).
2. **`employes.cout_horaire` lisible par tout salarié authentifié via appel API direct**, sans aucune vérification de permission au niveau RLS — contourne le masquage UI (§37).
3. **Coût horaire sans historique daté** : modifier le coût d'un salarié aujourd'hui recalcule rétroactivement la rentabilité de tous les chantiers passés où il a pointé (§8).

### P1 — Important avant premier client (fonction essentielle partielle)

4. `chantiers.budget_previsionnel` jamais synchronisé avec les devis acceptés — deux notions de budget non reliées (§3-4).
5. Aucun concept d'avenant/travaux supplémentaires — contournement par devis séparé sans lien de parenté tracé (§14).
6. `mouvements_stock` sans policy RLS par permission — même famille de faille que le P0 n°2, sévérité moindre (§37).
7. Garde-fou de surfacturation partiel — ignore `situations_travaux`, un devis peut être surfacturé en combinant les deux mécanismes (§15).
8. Achats prévus/sous-traitance prévue/coût outillage : liés au chantier mais jamais consommés en rentabilité — seul le réalisé compte, aucun prévisionnel de coût n'existe (§10-11, §33-34).
9. Aucune comparaison prévu/réalisé pour la marge — `budgetHt` n'entre dans aucune des 3 formules (§21).
10. `coutNotesFrais` sommé en TTC alors que tous les autres postes sont en HT — mélange HT/TTC dans la marge (§13, §30).

### P2 — Amélioration post-lancement (non bloquant)

11. Trois implémentations distinctes (même là où B/C sont cohérentes) — dette technique, factorisation recommandée (§18).
12. Statut `litige` inclus dans le coût réel des factures fournisseurs (§12, §29).
13. Deux systèmes de planning coexistent, l'un mort non nettoyé (§6).
14. Aucun test automatisé sur les formules de rentabilité ni sur les RLS sensibles identifiées en P0/P1 (§37, section 42 ci-après).
15. Pas de contrôle d'arrondi spécifique, risque de dérive de centimes sur gros volume (§31).
16. Performance : agrégation en mémoire sans pagination, à surveiller si le volume de données croît (§35).

### P3 — Futur module (absent mais prévu plus tard, hors périmètre commercialisation immédiate)

17. Coût matériel/véhicules non imputé automatiquement à un chantier (§34).
18. Export rentabilité inexistant (§38).
19. Commandes fournisseurs non exploitées comme « achats engagés/prévus » (futur lot Commandes V1) (§11).

## Plan de correction recommandé (proposé, non implémenté dans ce lot)

Pour les 3 P0 :
1. Unifier le calcul de marge sur une seule fonction partagée (probablement `src/app/actions/rentabilite.ts` ou une nouvelle fonction commune importée par les 3 usages), formule à 7 postes, filtre `verification_statut='valide'` partout, y compris pour le copilote IA.
2. Ajouter une policy RLS restrictive sur `employes` conditionnée à une permission (`voir_cout_interne_employe` ou équivalent) pour le SELECT du `cout_horaire`, ou déplacer ce champ vers une vue/table séparée avec sa propre RLS. Nécessite d'étudier l'impact sur les jointures existantes (pointages, planning) qui n'ont besoin que du nom, pas du coût.
3. Décision produit à trancher (pas seulement technique) : soit accepter le recalcul rétroactif comme comportement voulu et le documenter explicitement, soit introduire une snapshot du coût horaire au moment du pointage (colonne `cout_horaire_snapshot` sur `pointages`, remplie à la clôture de session).

Ces corrections ne sont **pas implémentées** dans ce lot, conformément à la consigne (audit uniquement).

## Limite explicite de cette version de l'audit

Les tests dynamiques sur chantier fictif (sections 22 à 27 du cahier des charges — dérive main-d'œuvre/achats en conditions réelles, facturation partielle, avenant, suppression/correction, avec vérification visuelle de l'écran `/rentabilite` après chaque étape) **n'ont pas été exécutés** dans cette passe, pour livrer ce rapport dans un délai raisonnable après un audit déjà très large (4 explorations parallèles, 178 migrations et plusieurs dizaines de fichiers applicatifs couverts). Les réponses structurelles à ces scénarios sont déjà connues avec un haut niveau de confiance par lecture de code (le calcul étant entièrement déterministe, recalculé à la volée, sans état caché) — mais une vérification empirique en Local/Preview reste recommandée avant de considérer RENTABILITÉ-V1 totalement clos, en particulier pour confirmer les points 15 (arrondis) et 20 (recalcul réel observé) avec des chiffres concrets.
