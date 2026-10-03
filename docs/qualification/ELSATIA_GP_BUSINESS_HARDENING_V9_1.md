BASE_SHA=24a0c2e993ec0836b492ea72f27ed7dc347a20fa
SOURCE_BRANCH=claude/loving-heisenberg-ygkjck (tête 401b84d — source sémantique uniquement, aucun cherry-pick, aucun git am)
MIGRATIONS_BEFORE=391
MIGRATIONS_AFTER=399
BUGS_REPRODUCED=17
BUGS_FIXED=17 (+3 défauts nouveaux trouvés et corrigés pendant la requalification)
P0_OPEN=0
P1_OPEN=3 (B10, B22, B23 — tous DECISION_REQUIRED, aucun correctif possible sans règle métier)

# ELSATIA — GP BUSINESS HARDENING V9.1 — portage sémantique des correctifs de la recette métier GP

| | |
|---|---|
| Base | `integration/elsatia-canonical-train-v9.1` @ `24a0c2e9` — SHA vérifié, 391 migrations, **non modifiée** |
| Source | `claude/loving-heisenberg-ygkjck` (verdict `GP_BUSINESS_ACCEPTANCE_PARTIAL`, rapport `ELSATIA_GP_END_TO_END_BUSINESS_ACCEPTANCE_V1.md`), bâtie sur `main` `4d92ddb` (178 migrations) : **877 commits derrière V9.1** |
| Candidat | `integration/elsatia-gp-business-hardening-v9-1` (création) |
| Migrations | 8 nouvelles, `20261003001401` → `20261003001408` (après `…1302`, hors plages réservées `1114-1116`, `1201-1203`, `1301-1302`) ; anciens numéros 184-193 **jamais** utilisés |
| Interdits respectés | aucune Preview, aucune Production, aucun Stripe (Test ou Live), aucun merge `main`, aucun secret réel ; `integration/elsatia-canonical-train-v9.1` intacte |
| Environnement | PostgreSQL 16 local (pas de démon Docker : `supabase start` impossible), bootstrap `scripts/local-postgres-bootstrap`, **PostgREST officiel 12.2.3**, passerelle auth/Storage locale du dépôt, Gestion Pro compilé (`next build` + `next start`), Chromium Playwright |

## 1. Méthode

1. **Inventaire avant écriture** (phase A) : 16 commits source, 10 migrations (184-193), 22 fichiers applicatifs, lus intégralement et confrontés à V9.1.
2. **Reproduction sur V9.1** (phase B/C) : base fraîche 391/391 ; chaque défaut sondé (a) en SQL sous le rôle `authenticated` avec JWT (comme PostgREST), (b) par un **témoin pgTAP rouge** (`supabase/tests/gp_business_hardening_v9_1.test.sql`, 43 assertions, attendus = règle correcte), (c) par le **vrai PostgREST** (42 sondes, `tests/e2e/gp-business-hardening-pile-locale/sondes-postgrest.mjs`).
3. **Port** uniquement de ce qui est encore reproductible, sur les définitions V9.1 exactes (`pg_get_functiondef` puis substitutions vérifiées), jamais sur le code source de la branche.
4. **Requalification** : pgTAP ciblé et complet, upgrade avec données, Vitest, typecheck, lint, build, `verify:*`, DB verify, PostgREST, Playwright 6 rôles, endurance concurrente.

Un défaut n'est déclaré « reproduit » qu'avec une preuve rouge sur V9.1 ; « non reproduit » qu'avec une preuve verte sur V9.1.

## 2. Tableau complet des défauts source

`REPRODUCED_V9_1` : OUI = preuve rouge sur V9.1 ; NON = preuve que V9.1 le corrige déjà. `PORT` : ce qui a été porté (DB = migration, UI = code applicatif).

| SOURCE_BUG | Gravité source | REPRODUCED_V9_1 | PORT | TEST | VERDICT |
|---|---|---|---|---|---|
| **B04** création/modification de chantier impossible (RLS) | P0 | **NON** — V9.1 a des politiques permissives `membres écrivent/modifient/suppriment les chantiers` | aucun (migration 185 inutile) | pgTAP #1, Playwright S2 | CLOS PAR V9.1 |
| **B01** grants implicites manquants (installation neuve) | P1 | **NON** — 13/16 tables déjà accordées explicitement à `authenticated` ; les 3 restantes (`contacts_clients` gelée, `chantier_transferts`, `support_messages` lue par RPC) n'ont aucun accès direct dans le code ; `est_membre_actif` / `entreprise_sans_membres` exécutables | **REFUSÉ (conflit)** : le `grant all … to service_role` source contredit la réconciliation ACL V9.1 (`…0255`) et le modèle « service_role par RPC `*_service` » | audit ACL (§6), PostgREST I01-I06, rebuild 391/399 sans droit implicite `authenticated` | CLOS PAR V9.1 — port rejeté |
| **B05** devis à montant négatif (quantité −2, remise 150 %) | P1 | **OUI** (base et écran) | UI : `erreurSaisieDevis` (quantité ≥ 0, remises 0-100 %, total ≥ 0) ; DB : remises bornées (`…1408`, NOT VALID) | pgTAP #42-43, Vitest `devis-saisie`, Playwright S3 | CORRIGÉ ; quantité négative en base : DECISION_REQUIRED |
| **B10** acomptes/avoirs/situations/relances en bêta | P1 (lacune produit) | n/a | aucun | — | **DECISION_REQUIRED** (P1 ouvert) |
| **B16** facture depuis devis ignore la remise globale | P1 | **OUI** — devis 5 648,96 € TTC → facture 5 823,67 € (+174,71 €) | DB `…1401` : remise combinée par ligne | pgTAP #2-5, PostgREST C15, Playwright S4, endurance (0 écart sur 12 devis aléatoires) | CORRIGÉ |
| **B17** double paiement | P1 | **OUI** pour un paiement partiel identique (V9.1 verrouille la facture mais le reste dû couvre le second envoi) | DB `…1402` : même paiement (montant, date, mode, référence) < 30 s refusé ; UI : garde B29 | pgTAP #7-10, PostgREST C10, Playwright S6 (réseau lent : **1 seule requête d'action**), endurance (24 paiements jumeaux → 12) | CORRIGÉ |
| **B19** facturation avancée ignore la remise globale | P1 (bêta) | **OUI** — acompte 30 % : 2 850 € HT au lieu de 2 764,50 € ; avoir 10 % : −950 au lieu de −921,50 | DB `…1401` | pgTAP #13-15 | CORRIGÉ |
| **B22** situation : acomptes non déduits, pas de plafond | P1 (bêta) | **Partiel** — V9.1 plafonne déjà « déjà facturé + période ≤ contractuel » ; 30 % d'acompte + 60 % de situation restent facturés pour 60 % d'avancement | aucun (règle de déduction) | sonde SQL (§4) | **DECISION_REQUIRED** (P1 ouvert) |
| **B23** retenue de garantie ni imprimée ni déduite | P1 (bêta) | OUI (montant calculé, non déduit du net) | aucun | sonde SQL | **DECISION_REQUIRED** (P1 ouvert) |
| **B24** facture émise annulable sans avoir | P1 | **OUI** (UI et API) ; **aggravant V9.1** : l'annulation rouvre ensuite la refacturation du devis (PostgREST C13 vert sur V9.1) | DB `…1403` (déclencheur) + UI (transitions) | pgTAP #11-12, PostgREST C08, Playwright S5 | CORRIGÉ |
| **B27** documents émis modifiables par l'API | P1 | **NON** — `verrouiller_facture_emise`, `verrouiller_devis_accepte`, `verrouiller_lignes_devis_accepte`, `lignes_factures_brouillon_only` | aucun (migration 191 inutile) | PostgREST C01-C07 (gérant et comptable) | CLOS PAR V9.1 |
| **B28** salarié lit coûts/taux des collègues | P1 | **Variante OUI** — `employes.cout_horaire/taux_horaire` n'existent plus (tables dédiées protégées), mais `pointages.cout_horaire_applique` reste lisible : chef d'équipe → coûts des collègues, salarié → son coût employeur | DB `…1407` : privilèges de colonne + RPC `pointages_couts_appliques` (modèle prix stock / employés) | pgTAP #30-39, PostgREST D01-D14, Playwright S12 | CORRIGÉ |
| **B34** refacturation illimitée d'un devis | P1 | **NON** en base (V9.1 : `FOR UPDATE` + `montant_facture_devis`) ; **OUI** côté écran (bouton toujours proposé) | UI : lien « Devis facturé : FAC-… » | pgTAP #6, PostgREST C13, Playwright S4, endurance (36 tentatives simultanées → 12) | CLOS PAR V9.1 + UX portée |
| **B02** client sans nom ni société | P2 | **OUI** (base et écran) | UI (création et modification) | Playwright S1 | CORRIGÉ (UI) ; contrainte en base : DECISION_REQUIRED (anonymisation RGPD des clients) |
| **B08** TVA non ventilée par taux | P2 | non sondé (mention à arbitrer) | aucun | — | DECISION_REQUIRED |
| **B12** pointages oubliés en double le même jour | P2 | **OUI** | DB `…1404` + **verrou transactionnel par salarié** (course trouvée en endurance, présente aussi dans le correctif source) | pgTAP #22-27, Playwright S8, endurance (24 déclarations jumelles → 12) | CORRIGÉ |
| **B13** validation des oubliés repliée, carte sans motif ; date ISO | P2 | OUI (constaté pendant la recette : `p.date` ISO dans « Anciennes saisies ») | aucun (non corrigé par la source) | — | OUVERT P2 (UX) |
| **B15** pointage désactivé par défaut (Ouvrier) | P2 | n/a | aucun | — | DECISION_REQUIRED (choix produit) |
| **B18** aucun passage automatique « en retard » | P2 | **NON** — bascule V9.1 (`…0350`) | aucun | suite pgTAP `fa08_bascule_factures_en_retard` | CLOS PAR V9.1 |
| **B20** encaissement au-delà du reste net d'avoir | P2 | **NON** — V9.1 refuse tout paiement sur une facture `avoir_emis` | aucun | PostgREST C19 | CLOS PAR V9.1 ; **sur-restriction** : le solde réellement dû après un avoir partiel n'est plus encaissable → DECISION_REQUIRED |
| **B21** avoir sans référence de la facture rectifiée | P2 | **OUI** | UI : chargeur partagé `documents-commerciaux.ts` + `DocumentImprimable` | Playwright S13 | CORRIGÉ (page publique par jeton : la RPC ne renvoie pas l'origine → P3 ouvert) |
| **B25** CA avec brouillons ; copilote sans avoirs ; alertes sur brouillons/avoirs | P2 | **OUI** — RPC rentabilité, « Total facturé », historique mensuel et cache du tableau de bord, copilote | DB `…1406` (+ recalcul du cache) ; copilote net d'avoirs | pgTAP #18-21 + 3 suites V9.1 réalignées, Playwright S10, Vitest | CORRIGÉ |
| **B29** double soumission systémique | P2 | **OUI** (aucune garde globale sur V9.1) | UI durcie (§7) | Vitest 10 cas, Playwright S6 | CORRIGÉ |
| **B30** échéance antérieure à l'émission | P2 | **OUI** (brouillon) ; émise : figée par V9.1 | UI (modification d'échéance et de brouillon) | Playwright S5 | CORRIGÉ (UI) |
| **B35** 48 h par jour sur plusieurs chantiers | P2 | **OUI** (27,5 h acceptées) | DB `…1404` (plafond 24 h hors rejetés, sérialisé) | pgTAP #24-26, endurance | CORRIGÉ |
| **B37** heures rejetées comptées | P2 | **OUI** — RPC `pointages_gestion_totaux_mois` (19 h au lieu de 7), page « Mon pointage », copilote ; planning et rentabilité V9.1 déjà « validés seulement » | DB `…1405` ; UI `heures-retenues.ts`, copilote | pgTAP #28-29, Vitest, Playwright S9 | CORRIGÉ |
| Accessibilité (libellés non associés, erreurs non annoncées) | P2 | non resondé | aucun | — | OUVERT P2 |
| **B03** logo contrôlé sur le MIME déclaré | P3 | non resondé | aucun (non corrigé par la source) | — | OUVERT P3 |
| **B06** dates ISO sur les documents | P3 | **OUI** | UI : `dateDocumentFr` | Vitest, Playwright S7 | CORRIGÉ |
| **B07** chantier fin < début | P3 | **OUI** (base et écran) | UI + DB `…1408` (NOT VALID) | pgTAP #41, Playwright S2 | CORRIGÉ |
| **B09** prospect non converti | P3 | non resondé | aucun | — | OUVERT P3 |
| **B14** 16:00 → 08:00 = poste de nuit | P3 | non resondé | aucun | — | À CONFIRMER (règle produit) |
| **B26** « terminé » sans date de fin réelle | P3 | non resondé | aucun | — | OUVERT P3 |
| **B31** budget prévisionnel négatif | P3 | **OUI** (base et écran) | UI + DB `…1408` (NOT VALID) | pgTAP #40, Playwright S2 | CORRIGÉ |
| **B32** hors ligne sans message | P3 | non resondé | aucun | — | OUVERT P3 |
| **B33** devis accepté non facturé supprimable par l'API | P3 | **NON** — `verrouiller_devis_accepte` | aucun | PostgREST C07b | CLOS PAR V9.1 |
| **B36** brouillons de facture non supprimables | P3 | non resondé | aucun | — | OUVERT P3 |
| PDF sans « page x/y », bouton à 768 px, fichier `outillage/[id]/page 2.tsx` | P3 | fichier copie toujours présent sur V9.1 | aucun | — | OUVERT P3 |

**Défauts nouveaux** (absents du rapport source, prouvés rouges puis corrigés) :

| ID | Défaut | Preuve | Correctif |
|---|---|---|---|
| N1 | Rentabilité V9.1 : une facture créditée (`avoir_emis`) était retirée du CA **et** son avoir déduit → CA négatif (facture 2 000 € + avoir −200 € = −200 €) | pgTAP #18-19 | `…1406` : CA = émis (brouillons et annulées exclus, factures créditées comprises) + avoirs émis |
| N2 | Situation de travaux avec remise globale : lignes regonflées de 1/(1−remise) (5 700 € pour une période de 5 529 €), facture de situation fausse | pgTAP #16-17 | `…1401` : répartition au poids de chaque ligne ; quantités dérivées au millionième |
| N3 | Pointage oublié : deux déclarations simultanées passent les contrôles (course) — aussi présente dans le correctif source | endurance : 5 doublons / 6 cycles | `…1404` : `pg_advisory_xact_lock` par salarié |

## 3. Phase C — protection des données financières (PostgREST réel)

`docs/qualification/gp-business-hardening-v9-1/postgrest-sondes-{v9_1,candidat}.jsonl` — **V9.1 : 32/42 conformes ; candidat : 42/42**.

| Sonde (jeton de l'utilisateur) | V9.1 | Candidat |
|---|---|---|
| TTC / numéro / lignes d'une facture émise (gérant, comptable), suppression facture émise | refus (déjà V9.1) | refus |
| Montant, prix, lignes, suppression d'un devis accepté (facturé ou non) | refus (déjà V9.1) | refus |
| Annulation directe d'une facture émise | **acceptée** | refus « émettez un avoir » |
| Refacturation du devis après cette annulation | **acceptée** | refus |
| Paiement partiel renvoyé (double clic) | (bloqué en cascade par l'annulation) | refus « double envoi » |
| Insertion directe dans `paiements` | refus 42501 | refus 42501 |
| Paiement > reste dû | refus | refus |
| Suppression d'un paiement (droit V9.1 conservé) puis recalcul statut/montant | — | accepté, `0.00|envoyee` |
| Paiement après avoir | refus | refus |
| Facture depuis devis remisé : TTC facture = TTC devis | **11 400,00 ≠ 11 058,00** | 11 058,00 = 11 058,00 |
| Écriture cross-tenant | 0 ligne | 0 ligne |

Toutes les protections financières sont en base (déclencheurs ou RPC `SECURITY DEFINER`) ; l'UI n'est qu'un confort.

## 4. Phase D — confidentialité salariés (B28, P1)

Reproduction précise sur V9.1 : salarié et chef **ne lisent plus** `employes_cout_horaire` / `employes_taux_facture` (0 ligne) ni les champs RH (`employes.email` : 42501) — V9.1 a déjà migré ces données. **Mais** `pointages.cout_horaire_applique` (coût figé à la validation, `…0206`) restait une colonne ordinaire : chef d'équipe 2 coûts de collègues, salarié son coût employeur (PostgREST D01, D03).

Correctif (`…1407`), modèle du projet (prix d'achat du stock `…0108`, employés `…0806`) : `authenticated` perd SELECT/INSERT/UPDATE sur cette seule colonne (privilèges de colonne ; toutes les lectures applicatives de `pointages` sont en colonnes explicites — vérifié) ; lecture légitime par `pointages_couts_appliques(entreprise, début, fin)` : membre actif ET (`voir_cout_interne_employe` OU `acces_rentabilite`), mêmes droits que `employes_cout_horaire`, période ≤ 366 j, fermée à `anon` et `service_role`.

| Accès | Avant | Après |
|---|---|---|
| Chef : coûts des collègues (API) | 2 lignes | 42501 |
| Salarié : son coût employeur (API) | 1 ligne | 42501 |
| Chef / salarié : heures et statuts des pointages | oui | oui (inchangé) |
| Gérant, comptable (`acces_rentabilite`) : coûts appliqués | table | RPC (2 lignes) |
| Gérant B → coûts de A | — | 42501 |
| Écrans du salarié (5) : aucun « 26,50 » / « 41,50 » | — | Playwright S12 ✅ |

## 5. Phase E — facturation simple, au centime

Devis D1 : 3 lignes, TVA 10/20/5,5 %, remises ligne 5 % et 2,5 %, remise globale 3 %. Calcul indépendant (HT ligne = q × PU × (1 − r) ; remise globale sur HT et TVA ; arrondi final) : **4 856,67 HT / 792,29 TVA / 5 648,96 TTC** = DB = écran (Playwright S3). Facture = devis au centime (S4, pgTAP, PostgREST, endurance sur 12 devis aléatoires à 0 / 3 / 5 / 7,5 % de remise globale), échéance = émission + 45 j, facture unique, double clic sur réseau lent (1 seule requête, 1 seul paiement), paiement partiel 1 000 € → `payee_partiel`, solde 4 648,96 € → `payee` (« entièrement réglée »), impression FR, avoir citant la facture, rentabilité (CA 4 856,67 hors brouillon de 1 000 €, main-d'œuvre 8 h × 26,50 = 212,00 €, UI = RPC), clôture.

## 6. Phase F — facturation avancée (bêta)

Corrigé (purement mathématique, aucune décision) : remise globale dans acompte/avoir/finale (B19) ; répartition de la période de situation et facture de situation (N2) ; quantités au millionième (au lieu du millième, qui pouvait écarter le document de plusieurs dizaines de centimes sur un PU élevé).

**DECISION_REQUIRED (non inventé)** :
- **B22** déduction des acomptes dans une situation (déduction ligne à ligne, ligne « acompte à déduire », ou plafond d'avancement) ;
- cumul des situations au-delà de l'avancement réel ;
- **B23** retenue de garantie : impression, déduction du net à payer, libération ;
- situation > 100 % (aujourd'hui refusée par V9.1 : `p_avancement_pct ≤ 100`) — à confirmer ;
- **B20 inverse** : après un avoir partiel, la facture passe `avoir_emis` et plus aucun paiement n'est accepté, même le solde réellement dû.

## 7. Phase G — pointages ; Phase H — double soumission

Pointages : live inchangé ; oubli (B12 doublon même jour/chantier, B35 plafond 24 h, sérialisés) ; correction par le responsable inchangée (régularisation) ; validation/rejet par l'UI chef (S9) ; **règle minimale sûre appliquée partout où un total est présenté comme temps travaillé** : un rejeté ne compte jamais (RPC totaux mois, « Mon pointage », copilote) ; planning, rentabilité, fiche chantier : déjà « validés seulement » sur V9.1. **PENDING vs VALIDATED** (« à vérifier » compté dans « Mon pointage » et « Total par employé », pas dans la rentabilité) : **DECISION_REQUIRED**, non tranché. Exports / paie : non modifiés (la paie lit les validés).

Garde de double soumission (`src/lib/garde-double-soumission.ts`, montée dans le layout authentifié) — audit du mécanisme source et durcissement :

| Cas | Source | Porté |
|---|---|---|
| Next 16.3.5 : action serveur = `fetch` global résolu à l'appel, en-tête `next-action` | supposé | **vérifié** dans `node_modules/next` |
| Double clic avant le départ de la requête (encodage asynchrone de Next) | fenêtre ouverte | fermée (marquage immédiat) |
| Formulaire simple, multi-actions, autres formulaires libres | ✅ | ✅ (tests) |
| Erreur serveur / réseau | libéré | libéré (test) |
| Requête bloquée | blocage tant que le fetch ne rend pas | libération ≤ 60 s (test) |
| Formulaire sans action (GET, navigation classique, upload natif) | jamais bloqué | jamais bloqué / retenu ≤ 1 s (test) |
| Action lancée hors formulaire plus tard | **bloquait le dernier formulaire soumis** | ne bloque rien (test) |
| Retour arrière (page restaurée du cache) | état conservé | réinitialisé (test) |
| Bouton avec confirmation annulée | pas de soumission | pas de soumission (inchangé) |
| Second clic légitime après réponse | ✅ | ✅ (Vitest + Playwright S6) |

## 8. Phase I — installation neuve, ACL

Docker indisponible : **aucune installation Supabase CLI réelle** possible (classé NOT_PROVEN, comme dans les missions V9). Équivalent prouvé : la base est rebâtie de zéro sur un PostgreSQL nu **sans aucun droit implicite** pour `anon`/`authenticated` (le bootstrap ne pose que des privilèges par défaut `service_role`, ensuite réconciliés par V9.1) : 391/391 et 399/399 migrations, application fonctionnelle de bout en bout (Playwright 13/13 sur cette base).

Diff ACL exhaustif V9.1 → candidat (`acl-diff-v9_1-candidat.txt` : tables, colonnes, séquences, fonctions, politiques) : seuls changements = privilèges de colonne de `pointages` (sans `cout_horaire_applique`, DELETE de table conservé), 2 fonctions nouvelles (`pointages_couts_appliques` : `authenticated` seul ; `trg_facture_emise_non_annulable` : propriétaire seul). **Aucun droit nouveau pour `anon`**, aucune politique RLS modifiée, aucune séquence touchée. `service_role` : flux `*_service` OK (I05), aucune lecture directe des tables (modèle V9.1, I06). Fonctions remplacées par `CREATE OR REPLACE` : ACL conservées.

## 9. Phase J — migrations

| # | Fichier | Contenu |
|---|---|---|
| 1401 | `gp_facturation_remise_globale_reportee_v1` | B16, B19, N2 |
| 1402 | `gp_paiement_double_envoi_v1` | B17 |
| 1403 | `gp_facture_emise_non_annulable_v1` | B24 |
| 1404 | `gp_pointage_oublie_doublon_plafond_v1` | B12, B35, N3 |
| 1405 | `gp_pointages_totaux_hors_rejetes_v1` | B37 |
| 1406 | `gp_chiffre_affaires_hors_brouillons_v1` | B25, N1 (+ recalcul idempotent du cache) |
| 1407 | `gp_pointages_cout_horaire_confidentiel_v1` | B28 |
| 1408 | `gp_saisie_garde_fous_base_v1` | B05 (remises), B07, B31 — contraintes NOT VALID |

`git diff --name-status 24a0c2e..HEAD -- supabase/migrations` : 8 × A, 0 M, 0 D. Plage `20261003001401+` : postérieure à `…1302`, aucune collision avec les plages réservées. Migrations source 184, 185, 188, 190, 191, 192 : **non portées** (inutiles ou en conflit sur V9.1).

## 10. Phase K — recette métier UI (Playwright, Chromium)

`tests/e2e/gp-business-hardening-v9-1.spec.ts` sur base vierge (`preparer-base.sh` : entreprise créée par `creer_entreprise_bootstrap`, postes prédéfinis) : **13/13**.

Comptes : gérant, conducteur de travaux, chef de chantier, salarié (Ouvrier), comptable, accès limité (clients + chantiers en consultation), plus un second tenant. Parcours : entreprise → salariés (comptes, coûts horaires) → client (S1) → chantier (S2) → devis (S3) → acceptation, facture (S4) → émission (S5) → paiements (S6) → impression (S7) → affectation d'équipe par l'écran chantier, pointage oublié (S8) → rejet / validation par le chef, totaux (S9) → rentabilité (S10) → clôture (S11) → matrice 16 écrans × 6 rôles (S12, `matrice-ecrans-roles.json`) → avoir imprimé (S13).

Matrice (✅ accès) — conforme à la configuration des postes et à la matrice de la recette source :

| Écran | Gérant | Conducteur | Chef | Salarié | Comptable | Limité |
|---|---|---|---|---|---|---|
| `/clients` | ✅ | ✅ | ✅ | ⛔ | ✅ | ✅ |
| `/devis`, `/factures` | ✅ | ✅ | ⛔ | ⛔ | ✅ | ⛔ |
| `/pointage` | ✅ | ⛔ | ✅ | ✅ | ✅ | ⛔ |
| `/pointage/gestion` | ✅ | ⛔ | ✅ | ⛔ | ⛔ | ⛔ |
| `/employes` | ✅ | ✅ | ✅ | ⛔ | ✅ | ⛔ |
| `/rentabilite`, `/tresorerie` | ✅ | ✅ | ⛔ | ⛔ | ✅ | ⛔ |
| `/exports` | ✅ | ⛔ | ⛔ | ⛔ | ✅ | ⛔ |
| `/parametres`, `/parametres/acces` | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| `/plateforme` | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |

Décor par SQL (documenté) : comptes et fiches salariés, un brouillon de facture (S10, pour prouver son exclusion), un avoir par la RPC (S13, module bêta masqué en V3).

## 11. Phase L — contrôles

| Contrôle | V9.1 (391) | Candidat (399) | Verdict |
|---|---|---|---|
| Base fraîche | 391/391 | **399/399** | ✅ |
| Upgrade V9.1 → candidat, base peuplée + données historiques invalides (`upgrade-v9-1-gp-business-hardening.sh`) | — | 8/8 migrations, données conservées, cache recalculé, NOT VALID tolère l'historique, facture annulée historique intacte, **schéma + ACL = candidat frais** (`pg_dump -s`), témoin 43/43 | ✅ |
| pgTAP ciblé (témoin) | **ROUGE** 12 ok / 23 not ok / 12 erreurs | **43/43** | ✅ |
| pgTAP ciblé (`gp_*`, `post_v9_*`, témoin) | — | 18 suites, 756 ok, 0 échec | ✅ |
| pgTAP complet (177 suites) | 167 propres, 9 004 ok | **168 propres, 9 035 ok** ; seule différence : le témoin ; 9 suites non propres **identiques** (pgsodium réel, Studio du projet partagé, Tools cloud sync) | ✅ |
| Suites V9.1 réalignées (règle B24/B25 changée volontairement) | — | `gp_dashboard_search_perf_dashboard_indicateurs` 13/13, `gp_rentabilite_agregats_v1` 60/60, `gp_facture_brouillon_modification_v1` 34/34 | ✅ |
| Vitest | 2 897 ✓ | **2 916 ✓**, 1 échec attendu (témoin SEC-6, identique), 193 ignorés | ✅ |
| Typecheck GP (`tsc --noEmit`) | 0 | 0 | ✅ |
| Lint GP | 0 erreur, 15 avertissements | 0 erreur, 15 avertissements identiques | ✅ |
| Build GP (`next build`) | — | exit 0 | ✅ |
| `verify:migrations` / `test:migration-targets` | 391 | 399 valides | ✅ |
| `verify:secrets` | — | 3 668 fichiers, aucun secret | ✅ |
| `verify:env-manifest` / `test:env-manifest` | OK | OK (3 variables de banc local déclarées) / 67/67 | ✅ |
| `verify:train-expectations` | — | attendus synchronisés (`sync:train-expectations`) : 399, dernière `…1408` | ✅ |
| DB verify (39 contrôles) | 37 ok ; KO : `url_preview`, propriétaire plateforme | 37 ok ; mêmes 2 KO (données hébergées) | ✅ |
| PostgREST réel (42 sondes C/D/I) | 32/42 | **42/42** | ✅ |
| Playwright recette métier | — | **13/13** | ✅ |
| Matrice permissions | — | 16 écrans × 6 rôles, attentes explicites ✅ | ✅ |
| Endurance courte concurrente (12 cycles, PostgREST) | — | 36 facturations simultanées → 12 ; 24 paiements jumeaux → 12 ; 24 pointages jumeaux → 12 ; plafond 24 h tenu ; **9 invariants, 0 écart** | ✅ |
| Safari / WebKit | — | binaire absent, `playwright install` proscrit | NOT_PROVEN |
| Supabase CLI réel (Docker) | — | démon absent | NOT_PROVEN |

## 12. Restes et décisions

| Reste | Classe |
|---|---|
| B10 (facturation avancée et relances en bêta dans l'offre V3) | **DECISION_REQUIRED — P1** |
| B22 déduction des acomptes / cumul des situations | **DECISION_REQUIRED — P1 (bêta)** |
| B23 retenue de garantie | **DECISION_REQUIRED — P1 (bêta)** |
| Paiement du solde après un avoir partiel impossible (B20 inverse) | DECISION_REQUIRED — P2 |
| PENDING vs VALIDATED dans les totaux d'heures | DECISION_REQUIRED |
| Quantité négative de devis en base (lignes de moins-value) ; client sans identité en base (anonymisation) ; liste des taux de TVA | DECISION_REQUIRED (UI corrigée) |
| Copilote : la règle « CA hors avoirs » documentée par V9.1 est remplacée par « émis net d'avoirs » (B25 source + N1) | conflit tranché pour la cohérence des trois écrans ; **à confirmer produit** |
| Messages de refus métier affichés en générique (« Impossible d'enregistrer ce pointage oublié. ») : politique V9.1 de non-exposition des messages SQL conservée | P3 UX |
| B13, accessibilité | P2 ouverts (non corrigés par la source) |
| B03, B09, B14, B26, B32, B36, PDF « page x/y », bouton 768 px, `outillage/[id]/page 2.tsx`, référence d'avoir sur la page publique par jeton | P3 ouverts |
| SEC-6 (import paie), pied de facture Stripe | inchangés depuis V9.1 (DECISION_REQUIRED) |
| Audit des données de production (B16, B34, B17/B20, B35) | requêtes du rapport source toujours valables, **non exécutées** (production hors périmètre) ; les factures émises historiques ne sont pas réécrites (immuables) |

Aucun P0 ouvert.

## 13. Reproduire

```bash
git fetch origin integration/elsatia-gp-business-hardening-v9-1 && git checkout integration/elsatia-gp-business-hardening-v9-1
npm ci && (cd tests/e2e/colors-pile-locale && npm ci)
git worktree add --detach /var/tmp/v91wt 24a0c2e993ec0836b492ea72f27ed7dc347a20fa
/var/tmp/v91wt/scripts/local-postgres-bootstrap/rebuild_db.sh v91_fresh          # 391/391
scripts/local-postgres-bootstrap/rebuild_db.sh v91_final                         # 399/399
scripts/qualification/pgtap-run-v3.sh v91_fresh gp_business_hardening_v9_1.test.sql   # ROUGE
scripts/qualification/pgtap-run-v3.sh v91_final gp_business_hardening_v9_1.test.sql   # 43/43
scripts/qualification/pgtap-run-v3.sh v91_final                                  # 168/177
scripts/qualification/upgrade-v9-1-gp-business-hardening.sh v91_fresh upg_v91 v91_final   # 0 écart
# PostgREST officiel 12.2.3 (POSTGREST_BIN), secret JWT local aléatoire
tests/e2e/gp-business-hardening-pile-locale/preparer-banc-postgrest.sh v91_final pr_final <mdp-local>
SONDE_URL=http://127.0.0.1:<port> SONDE_SECRET=<secret> SONDE_BASE=pr_final node tests/e2e/gp-business-hardening-pile-locale/sondes-postgrest.mjs
# Navigateur (variables des recettes V9 : PASSERELLE_SECRET_JWT, PASSERELLE_MDP_DB, clés HS256, RATE_LIMIT_HMAC_KEY,
# NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321, NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100, POSTGREST_BIN, PW_CHROME_PATH)
tests/e2e/gp-business-hardening-pile-locale/preparer-base.sh gpb_e2e v91_final
tests/e2e/finance-pile-locale/demarrer-pile.sh gpb_e2e /tmp/gpb-logs
npx next build && TZ=UTC npx next start -p 3100 -H 127.0.0.1 &
E2E_BASE_URL=http://127.0.0.1:3100 npx playwright test tests/e2e/gp-business-hardening-v9-1.spec.ts --project=desktop-chromium --workers=1   # 13/13
SONDE_URL=http://127.0.0.1:3001 SONDE_SECRET=$PASSERELLE_SECRET_JWT SONDE_BASE=gpb_e2e node tests/e2e/gp-business-hardening-pile-locale/endurance.mjs 12   # 0 écart
npx vitest run && npx tsc --noEmit --incremental false && npx eslint
npm run verify:migrations && npm run verify:secrets && npm run verify:env-manifest && npm run verify:train-expectations
```

Preuves archivées : `docs/qualification/gp-business-hardening-v9-1/` (témoin rouge/vert, sondes PostgREST V9.1/candidat, upgrade, ACL, DB verify, recette UI, matrice, endurance).

## 14. Verdict

# `GP_BUSINESS_HARDENING_V9_1_PARTIAL`

Tous les correctifs source encore reproductibles sur V9.1 (17) sont portés, renumérotés et requalifiés localement, sans régression (pgTAP complet, Vitest, typecheck, lint, build, upgrade avec données, PostgREST, Playwright 6 rôles, endurance concurrente), et 3 défauts nouveaux sont corrigés. Le verdict reste **PARTIAL**, option conservatrice : trois P1 (B10, B22, B23) ne peuvent être fermés sans règles métier (DECISION_REQUIRED), et l'installation Supabase CLI réelle ainsi que Safari/WebKit ne sont pas prouvées dans cet environnement (Docker et WebKit absents).
