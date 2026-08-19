# AVENANTS-V1 — Checklist

Référence : `docs/commercial/AVENANTS_V1_AUDIT_ELSATIA.md` (audit) et `docs/commercial/AVENANTS_V1_IMPLEMENTATION_ELSATIA.md` (implémentation minimale, terminée et validée en Preview). Les sections ci-dessous tracent l'audit d'origine ; voir le document d'implémentation pour le détail de ce qui a été construit.

## Implémentation (AVENANTS-V1, terminée)

- [x] Modèle de données : table `avenants` + `lignes_avenants` dédiée (option C, sans polymorphisme sur `lignes_devis`).
- [x] Statuts et transitions minimales, immutabilité après acceptation (DB-lock, même principe que DEVIS-LOCK-V1).
- [x] Capture automatique (date + auteur) de l'acceptation.
- [x] Montant contractuel canonique (`montant_contractuel_devis`) intégré au plafond de facturation (acompte/finale/situations) et à RENTABILITÉ-V1C (budget/heures prévues).
- [x] Deux bugs découverts et corrigés pendant l'implémentation, avant tout déploiement : calcul de période des situations non robuste à un changement de montant contractuel en cours de route ; `facturer_situation_travaux` ignorait le montant déjà correctement ajusté.
- [x] UI minimale (fiche chantier, fiche devis, pages avenant), PDF réutilisant le gabarit existant.
- [x] 25 assertions pgTAP + 18 tests Vitest dédiés, suite complète verte (496 pgTAP / 360 Vitest).
- [x] Déployé et vérifié empiriquement sur Preview (migrations + scénario contractuel complet rejoué directement en base).
- [ ] Contrôle visuel navigateur sur Preview : **non effectué**, faute d'identifiants de connexion disponibles dans cette session — décision explicite de l'utilisateur de s'appuyer sur la vérification base de données + build à la place.

## Constat

- [x] Recherche exhaustive d'un concept d'avenant existant (`avenant`, `plus_value`, `moins_value`, `devis_parent`, `revision`, `version`, `ordre_de_service`, etc.) — aucun trouvé (§3).
- [x] Deux faux positifs identifiés et écartés : « avenant » RH (contrat de travail) et `factures.devis_origine_id` (lien facture→devis, pas devis→devis) (§3).
- [x] Confirmation : le seul contournement actuel est un second devis indépendant via `dupliquer_devis`, sans lien structurel (§4, §6).

## Faille découverte (hors périmètre avenants, mais conditionnante)

- [x] Vérification empirique en Local : un devis `accepte` reste modifiable en écriture directe (UPDATE/DELETE sur `devis`/`lignes_devis`) par un utilisateur `gerer_devis` légitime — le verrou `modifier_devis_brouillon` n'est appliqué qu'au niveau RPC, pas au niveau table/RLS (§8).
- [x] Classée **P1** — à corriger avant ou avec un futur lot AVENANTS-V1, pas un blocage de commercialisation immédiat (§38).
- [x] **Corrigée — DEVIS-LOCK-V1** (voir `docs/commercial/DEVIS_LOCK_V1_ELSATIA.md`) : deux triggers `BEFORE` sur `devis`/`lignes_devis` rendent un devis accepté réellement immuable au niveau base (montant, client, chantier, lignes, statut, remise, conditions), tout en laissant modifiables les champs non contractuels (notes internes, traçabilité d'envoi email). Duplication et facturation depuis un devis accepté verrouillé restent fonctionnelles. 28 assertions pgTAP + vérification empirique Local et Preview. La source de vérité contractuelle envisagée en §21 peut désormais s'appuyer sur un devis initial réellement figé.

## Points d'intégration audités

- [x] Cardinalité devis→chantier : un chantier peut avoir plusieurs devis, y compris plusieurs `accepte` (§7).
- [x] Impact sur le prévisionnel (RENTABILITÉ-V1C) : un second devis accepté est **déjà** correctement agrégé dans `caPrevuHt`/`heuresPrevues`, sans changement de code nécessaire (§13).
- [x] Garde-fou anti-surfacturation (`creer_facture_avancee`) lu intégralement : protège la somme acomptes/finales/situations sur **un seul devis**, mais `creer_situation_travaux` ne vérifie pas les acomptes/finales déjà facturés — gap résiduel documenté, non corrigé (§12).
- [x] Mécanisme d'acceptation devis audité : simple `update` de statut, aucune preuve capturée ; infrastructure de signature (`signatures_documents`) existe mais n'est câblée nulle part dans l'UI (§14).
- [x] Réutilisabilité du PDF devis pour un futur document Avenant confirmée (§15).
- [x] `situations_travaux` et base de calcul des acomptes : dépendance à `devis.montant_ht` seul, à étendre si avenants (§25-26).

## Cadrage proposé (non implémenté)

- [x] Trois options de modèle de données comparées (A: `devis_parent_id`, B: tables dédiées complètes, C: table `avenants` + réutilisation `lignes_devis`) — **recommandation : option C** (§20).
- [x] Numérotation, machine à états, types, champs de lignes, permissions, RLS proposés (§16-19, §28-29).
- [x] Source de vérité contractuelle définie (devis initial + avenants acceptés), avec précondition explicite sur la correction de la faille P1 (§21).
- [x] Règles de suppression/annulation, verrouillage post-acceptation proposés (§23, §34-35).
- [x] Scénario fictif 10 000€ + 2 000€ − 500€ = 11 500€ documenté conceptuellement, avec impact rentabilité et facturation attendu (§32).
- [x] Portée minimale recommandée pour un futur lot définie (§40).
- [x] Liste de tests futurs préparée, non écrite (§41).

## Non développé dans ce lot (rappel explicite)

- [x] Aucune table créée, aucune migration.
- [x] Aucun code applicatif modifié.
- [x] Aucune UI construite (onglet Avenants, dashboard).
- [x] Aucune action en Production.

## Décision

- [x] GO/NO-GO documenté : **GO pour commercialiser sans AVENANTS-V1**, sous réserve de documenter le contournement et de traiter la faille P1 séparément (§39).

## Livrables

- [x] `docs/commercial/AVENANTS_V1_AUDIT_ELSATIA.md` (41 sections numérotées, incluant la faille critique du §8).
- [x] `docs/commercial/AVENANTS_V1_CHECKLIST.md` (ce fichier).
- [ ] Commit dédié `docs(commercial): auditer avenants ELSATIA V1`.
