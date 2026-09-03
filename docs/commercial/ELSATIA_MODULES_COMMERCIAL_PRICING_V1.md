# ELSATIA — Modules Gestion Pro : modèle commercial & pricing (V1)

**Étude produit / pricing / bundles. Aucun code, aucun Stripe, aucune Production.**
Tous les montants ci-dessous sont des **propositions de travail** destinées à l'arbitrage de
Julien avant R4 (billing Stripe des modules). Rien n'est figé.

- Base : `feat/modules-a-la-carte-r3-v1` @ `553966ce80d8363d7cf67decb851616080980bbc` (inclut R1 + R3).
- Forfaits officiels (HT) : Mini 79 / 790 · Pro 249 / 2 490 · Business 449 / 4 490 · Entreprise 599 / 5 990. Annuel = 10 × mensuel.
- Personnes incluses : Mini 3 · Pro 15 · Business 30 · Entreprise 50.
- Capacité personnes supplémentaire (décidée) : Mini 15 €/pers./mois · Pro 12 · Business 9 · Entreprise 9.

---

## 1. Audit des inclusions R3 (`plans_inclus[]`)

| Module | Mini | Pro | Business | Entreprise | À la carte | Statut R3 |
|---|:--:|:--:|:--:|:--:|:--:|---|
| chantier | ✅ | ✅ | ✅ | ✅ | — (socle) | actif |
| ia | ✅ | ✅ | ✅ | ✅ | — (droit d'accès) | actif |
| pointage | — | ✅ | ✅ | ✅ | proposé Mini | actif |
| notes_frais | — | ✅ | ✅ | ✅ | proposé Mini | actif |
| vehicules | — | — | ✅ | ✅ | proposé Mini/Pro | actif |
| materiel | — | — | ✅ | ✅ | proposé Mini/Pro | actif |
| stock | — | — | ✅ | ✅ | proposé Mini/Pro | actif |
| rentabilite_avancee | — | — | ✅ | ✅ | proposé Pro | actif |
| planning_avance | — | — | — | — | à définir | bientôt |
| scan_ocr | — | — | — | — | conso | bientôt |
| maintenance | — | — | — | — | futur | bientôt |
| safety | — | — | — | — | proposé Mini/Pro | bientôt |
| forms | — | — | — | — | proposé Mini/Pro | bientôt |
| signature | — | — | — | — | conso | bientôt |
| connect | — | — | — | — | proposé Pro+ | bientôt |
| automations | — | — | — | — | proposé Pro+ | bientôt |
| facturation_electronique | — | — | — | — | futur | bientôt |
| stockage_supplementaire | — | — | — | — | capacité | interne |
| sauvegarde_renforcee | — | — | — | — | non | non_vendable |

**Cohérence** : les inclusions R3 reproduisent exactement la grille de permissions actuelle
(`OFFRES_TARIFAIRES.fonctionnalites` : SOCLE / TERRAIN / GESTION / PILOTAGE / AVANCE). Points à
challenger commercialement :
- `notes_frais` réservé à Pro+ : valeur faible, coût faible — candidat à l'inclusion partout ou à un prix Mini très bas.
- `vehicules` + `materiel` : deux modules distincts au catalogue alors que la valeur client est perçue comme un seul (« parc matériel »). Voir §10.
- `rentabilite_avancee` : l'inclusion Business+ est OK **à condition** que les indicateurs de marge de base restent dans Mini/Pro (c'est le cas : `acces_rentabilite` de base ≠ module « avancé »).

---

## 2. Principes de pricing

1. **Prix lisible** : un module = un prix mensuel fixe simple (pas de calcul par utilisateur pour les modules fonctionnels). Les fonctions à coût variable sont traitées à part (§30).
2. **Petit forfait + module possible** : Mini reste pleinement utilisable ; on n'oblige personne à monter de forfait pour une fonction précise.
3. **Cannibalisation maîtrisée** : le prix des modules sur les petits forfaits est volontairement plus élevé (même logique que la capacité : Mini 15 €/pers. vs Business 9). L'accumulation de ~3 modules ou ~10 personnes fait naturellement passer à Pro ; ~4-5 modules ou ~20 personnes à Business.
4. **Mini jamais sabordé** : le SOCLE (chantier, clients, devis, factures, planning de base, messagerie, tableau de bord, fiches employés, droit IA + 100 ops) est **intangible** et gratuit dans tous les forfaits.
5. **Business = vrai bundle** : quasi-totalité des modules courants inclus, prix plat, pas de surprise.
6. **Entreprise = gros besoins** : Business + modules avancés + quotas élevés + capacités spécifiques + accompagnement prioritaire.

**Gradient de prix recommandé** : Mini plein tarif · Pro ~80 % · Business inclus · Entreprise inclus.

---

## 3. Classification des modules

| Classe | Modules |
|---|---|
| **A — Essentiel** (jamais facturé séparément) | chantier ; + le SOCLE non listé comme module (clients, devis, factures, planning base, messagerie, dashboard, fiches employés) |
| **B — Module vendable** | pointage, notes_frais, stock, vehicules/materiel (→ « Matériel & véhicules »), safety, forms, planning_avance |
| **C — Consommation** | scan_ocr, signature, ia (droit + quota + crédits), facturation_electronique, (sms) |
| **D — Premium** (orienté Business/Entreprise, à la carte à partir de Pro) | rentabilite_avancee, connect, automations |
| **E — Futur** (non commercialisable maintenant) | maintenance, facturation_electronique, planning_avance (tant que le delta n'est pas spécifié) |
| **F — Interne** (pas un produit commercial) | stockage_supplementaire (= capacité), sauvegarde_renforcee (= infra) |

---

## 4. Chantier

- **Valeur client** : cœur du métier (chantiers, équipes, avancement, documents). Sans lui, l'app n'a pas de sens BTP.
- **Coût ELSATIA** : inclus dans le socle, aucun coût marginal externe.
- **Dépendances** : clients, devis, planning.
- **Mobile/offline** : oui (consultation + saisie terrain), déjà prévu `offline_requis=true`.
- **Décision** : **ESSENTIEL — inclus tous forfaits, non vendable à la carte.** Conforme à R3 (`plans_inclus` = toutes offres). Prix à la carte : 0.

---

## 5. Pointage

- **Valeur** : très forte au BTP (heures chantier, préparation paie, refacturation).
- **Coût** : faible (pas de coût externe).
- **Risque** : le vendre séparément peut être perçu comme « rançonner » une fonction attendue.
- **Analyse** : à 3 personnes, un forfait Mini + pointage à ~25 €/mois (104 €/mois total) reste très inférieur à Pro (249). À partir de ~8-10 personnes ou dès qu'un 2ᵉ module s'ajoute, Pro (pointage inclus) devient plus rationnel.
- **Décision proposée** : **inclus dès Pro** (conforme R3) ; **à la carte sur Mini à ~25 €/mois** (proposition). Alternative si Julien préfère la simplicité : pointage inclus dès Pro et **non** vendable sur Mini (Mini = pré-chantier / TPE sans suivi d'heures).

---

## 6. Planning avancé

- **Planning de base** (inclus partout) : vue semaine/mois, affectation d'équipes à des chantiers, glisser-déposer.
- **Planning avancé** (module payant) — à spécifier avant tout prix : multi-ressources (hommes + matériel + véhicules), contraintes (congés, habilitations, disponibilité), détection de conflits, vue capacité/charge, Gantt multi-chantiers, replanification automatique.
- **Règle** : ne pas re-vendre une fonction déjà incluse sous un nouveau nom. Tant que le delta n'est pas construit → **FUTUR**, statut `bientôt`, **aucun prix**.
- **Proposition à la livraison** : ~19 €/mois Mini, ~15 Pro, inclus Business+.

---

## 7. Stock

- **Périmètre** : articles, mouvements (entrée/sortie/transfert), inventaires, dépôts, borne dépôt (compte partagé), lien chantier. QR/code-barres : à confirmer côté app. Lien futur Market : transfert d'articles / commandes (Integration Core, hors périmètre pricing).
- **Valeur** : forte pour les entreprises qui gèrent un dépôt ; nulle pour une TPE sans stock.
- **Coût** : faible.
- **Décision proposée** : inclus **Business+** (conforme R3) ; **à la carte : Mini ~29 €/mois, Pro ~24 €/mois** (proposition). Le pack physique « borne + douchette » relève de la Boutique (§32), pas du module.

---

## 8. Scan / OCR

- **Coût variable réel** : OCR (fournisseur type Textract / Google Vision / Azure) + extraction structurée (souvent IA). Ordre de grandeur marché : ~0,001–0,003 €/page OCR brut, davantage avec extraction IA.
- **Modèle recommandé** : **abonnement module** (accès + moteur) **+ quota de pages inclus/mois** **+ consommation supplémentaire par page**.
- **Ne pas figer** le nombre de pages incluses ni le prix/page sans (a) le choix du fournisseur, (b) une mesure de la consommation réelle sur un panel.
- **Fourchette de travail** (non figée) : module ~15 €/mois + 100–200 pages incluses + ~0,05–0,10 €/page au-delà.
- **Statut** : `bientôt` tant que le fournisseur n'est pas choisi.

---

## 9. Notes de frais

- **Valeur** : confort (dépenses équipes, justificatifs, refacturation), pas différenciant fort.
- **Coût** : faible (stockage justificatifs + éventuel OCR ticket → renvoie à scan_ocr).
- **Décision proposée** : deux options pour Julien —
  - **(a)** inclus dès Pro (conforme R3) + à la carte Mini ~12 €/mois ;
  - **(b)** inclus **dans tous les forfaits** (y compris Mini) pour rendre Mini plus attractif et réserver l'upsell aux modules à plus forte valeur (stock, safety, forms).
  - Recommandation : **(b)** — le gain de simplicité et d'attractivité Mini dépasse le revenu marginal d'un module à 12 €.

---

## 10. Véhicules / Matériel

- **Constat** : R3 a deux codes (`vehicules`, `materiel`) mais la valeur perçue est « gérer mon parc » (outillage + engins + véhicules + entretien + affectations).
- **Décision proposée** : **B — un seul module commercial « Matériel & véhicules »** (les deux codes techniques R3 sont conservés mais facturés ensemble comme un seul produit). Simplifie la grille, réduit le risque de confusion, meilleure valeur perçue.
- **Ne modifie pas R3** (les codes restent) ; c'est un regroupement de présentation + de billing.
- **Prix proposé** : inclus Business+ ; à la carte Mini ~19 €/mois, Pro ~15 €/mois.

---

## 11. Maintenance

- **Positionnement futur** : plans de maintenance préventive, contrôles périodiques (VGP, CE), alertes d'échéance, coûts d'entretien, QR sur équipement. Très cohérent avec « Matériel & véhicules », les Labels et la Boutique (pièces).
- **Statut** : **FUTUR / `bientôt`**, aucun prix.
- **Proposition à la livraison** : ~19–29 €/mois, inclus dans le bundle Business+, à la carte Pro.

---

## 12. Safety

- **Analyse** :
  - TPE (1 équipe) : valeur modérée, obligation réglementaire allégée mais réelle (DUERP, causeries).
  - Entreprise multi-équipes : valeur forte (registres, incidents, plans de prévention, PPSPS).
- **Positionnement** : **module vendable à connotation premium** — inclus Business+, à la carte Mini ~24 €/mois, Pro ~19 €/mois.
- **Statut** : `bientôt` (parcours à finaliser).

---

## 13. Forms

- **Potentiel transversal fort** : formulaires personnalisés → PDF, inspections, réception de chantier, contrôles sécurité, états des lieux, check-lists inventaire. Peut alimenter safety, stock, chantier.
- **Prix proposé** : inclus Business+ ; à la carte Mini ~19 €/mois, Pro ~15 €/mois.
- **Statut** : `bientôt`.

---

## 14. Signature

- **Coût prestataire** : signature électronique conforme (eIDAS simple/avancée) via un tiers → typiquement ~0,5–2 € par signature selon volume et niveau.
- **Modèle recommandé** : **forfait module** (~9 €/mois, activation + suivi) **+ consommation par signature** (quota faible inclus, ex. 5/mois, puis à l'unité).
- **Ne pas figer** les tarifs avant contrat fournisseur.
- **Statut** : `bientôt`.

---

## 15. Connect

- **Périmètre** : portail externe (client / architecte / fournisseur / sous-traitant), partage de documents, échanges structurés, API.
- **Contrainte Integration Core** : les accès externes passent par des habilitations applicatives dédiées, **jamais** par un rôle Gestion Pro simplifié.
- **Décision proposée** : **à la carte à partir de Pro (~39 €/mois)**, **inclus Business et Entreprise**. Non proposé sur Mini (ou ~49 €/mois si demandé).
- **Statut** : `bientôt`.

---

## 16. Rentabilité avancée

- **Base (reste inclus partout)** : marge par chantier, coûts engagés vs budget, temps passé.
- **Avancé (module)** : prévisionnel de marge, analyse par inducteur de coût, scénarios, consolidation multi-chantiers, alertes de dérive, exports analytiques.
- **Règle** : ne retirer **aucun** indicateur fondamental des petits forfaits.
- **Prix proposé** : inclus Business+ ; à la carte **Pro ~29 €/mois** (pas sur Mini).

---

## 17. Facturation électronique

- **Enjeu** : réforme e-invoicing (PDP/PPF). Fonction stratégique mais dépendante d'un partenaire/PDP.
- **Modèle possible** : abonnement module + volume de factures émises/reçues (coût PDP à l'acte).
- **Décision** : **ne pas commercialiser avant intégration réelle** avec une PDP partenaire. Statut `bientôt`, aucun prix. Réserver le code et le wording.

---

## 18. Automations

- **Positionnement** : **premium — Business / Entreprise**. À la carte possible à partir de Pro.
- **Modèle** : module + quota d'exécutions/mois (scénarios, déclencheurs, actions), dépassement à l'exécution ou palier supérieur.
- **Prix proposé** : à la carte Pro ~29 €/mois (quota modéré) ; inclus Business (quota standard) ; Entreprise (quota élevé).
- **Statut** : `bientôt`.

---

## 19. IA

- **Existant** : droit d'accès IA (`acces_ia`, inclus tous forfaits via `plans_inclus`), quota mensuel inclus par plan (Mini 100 / Pro 500 / Business 1 500 / Entreprise 3 000 opérations), politique de quota (`ia_politique_quota ∈ {blocage, depassement_facture, achat_pack}`), crédits achetés (`ia_credits_achetes`), option « IA intensive » (déjà 79 €/mois dans `OPTIONS_TARIFAIRES`).
- **Décision** : **ne pas créer de second abonnement IA.** Le module `ia` reste un simple **droit d'accès** (déjà couvert). La monétisation IA passe uniquement par : quota inclus par plan + **packs de crédits** en dépassement + option « IA intensive » pour les gros consommateurs.
- **À figer** : le prix des packs de crédits (dépend du coût par opération réel — modèles + fournisseur).

---

## 20. Stockage supplémentaire

- **Classe** : **CAPACITÉ, pas module.** Exclu de la grille modules (statut `interne` en R3).
- **Modèle proposé** : blocs de **+50 Go / mois**. Le dépassement de quota est déjà facturé aujourd'hui à 0,5 €/Go (`calculerFacturationStockage`).
- **Coût infra** : faible (stockage objet ~0,02 €/Go/mois brut) → un bloc +50 Go à ~19–25 €/mois garde une marge large.
- **Statut** : **prix figable rapidement** (risque coût faible), après confirmation du coût infra réel et de la politique de rétention.

---

## 21. Sauvegarde renforcée

- **Rester NON VENDABLE** tant que le service n'existe pas.
- **À offrir réellement avant de pouvoir la vendre** :
  - rétention point-in-time > 7 jours (ex. 30 j),
  - copie chiffrée hors-région / hors-fournisseur,
  - RTO / RPO documentés et contractualisés,
  - restauration self-service (ou sous SLA) testée,
  - runbook de restauration éprouvé (cf. `docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md`).
- Tant que ces cinq points ne sont pas réunis : ne pas afficher, ne pas promettre.

---

## 22. Grille commerciale de travail (propositions — non figées)

Montants HT/mois. « incl » = inclus dans le forfait (0 supplément). « — » = non proposé à ce niveau. « conso » = tarif à l'usage en sus (voir §30).

| Module | Mini | Pro | Business | Entreprise | Inclus à partir de | Consommation |
|---|:--:|:--:|:--:|:--:|---|:--:|
| chantier | incl | incl | incl | incl | Mini | non |
| ia (droit d'accès) | incl | incl | incl | incl | Mini | oui (crédits) |
| notes_frais | incl *(reco §9b)* | incl | incl | incl | Mini | non |
| pointage | ~25 | incl | incl | incl | Pro | non |
| Matériel & véhicules | ~19 | ~15 | incl | incl | Business | non |
| stock | ~29 | ~24 | incl | incl | Business | non |
| forms | ~19 | ~15 | incl | incl | Business | non |
| safety | ~24 | ~19 | incl | incl | Business | non |
| rentabilite_avancee | — | ~29 | incl | incl | Business | non |
| connect | — | ~39 | incl | incl | Business | non |
| automations | — | ~29 | incl | incl | Business | oui (exécutions) |
| planning_avance *(futur)* | ~19 | ~15 | incl | incl | Business | non |
| scan_ocr *(futur)* | module ~15 + conso | idem | idem | module incl + conso | — | oui (pages) |
| signature *(futur)* | module ~9 + conso | idem | idem | idem | — | oui (signatures) |
| maintenance *(futur)* | à définir | à définir | incl | incl | Business | non |
| facturation_electronique *(futur)* | — | — | — | — | — | oui (factures) |

**Justification synthétique par prix** (valeur client / coût ELSATIA / niveau forfait / risque cannibalisation) :

| Module | Valeur client | Coût ELSATIA | Niveau | Risque cannibalisation |
|---|---|---|---|---|
| pointage | élevée (BTP) | faible | Pro | modéré — prix Mini haut (25) pousse à Pro dès 2ᵉ module |
| stock | élevée si dépôt | faible | Business | faible — Mini 29 reste << Pro |
| Matériel & véhicules | moyenne-élevée | faible | Business | faible |
| safety | forte multi-équipes | faible | Business | faible — premium |
| forms | transversale | faible | Business | faible |
| rentabilite_avancee | forte pilotage | faible | Business | faible — pas sur Mini |
| connect | forte (relation externe) | moyen (support) | Business | faible — Pro 39 pousse à Business dès 2 modules premium |
| automations | forte gain de temps | moyen (exécutions) | Business | modéré — quota limite l'abus |
| scan_ocr | forte (saisie) | **variable** | — | n/a — modèle conso |
| signature | forte (cycle de vente) | **variable** | — | n/a — modèle conso |

---

## 23. Cannibalisation — scénarios

**Mini + Stock + Pointage + Chantier + Notes de frais** (3 personnes) :
79 (Mini) + 29 (stock) + 25 (pointage) + 0 (chantier incl) + 0 (notes_frais incl reco) = **133 €/mois**.
→ vs **Pro 249** : Mini reste nettement moins cher à 3 personnes / 2 modules. **Objectif respecté** (pas de passage forcé).

**Pro + Stock + Matériel & véhicules + Safety + Forms + Rentabilité avancée** (15 personnes) :
249 + 24 + 15 + 19 + 15 + 29 = **351 €/mois**.
→ vs **Business 449** (tout inclus, 30 personnes) : Pro + 5 modules ≈ Business − 100, mais sans la marge de croissance à 30 personnes ni les quotas Business. **Point de bascule ≈ 4-5 modules ou ~20 personnes → Business recommandé.**

---

## 24. Cas petite entreprise (3 personnes)

Besoins : Stock + Scan/OCR + Signature.
- Mini : 79
- Stock à la carte Mini : 29
- Scan/OCR : module 15 + ~5 conso (usage léger)
- Signature : module 9 + ~5 conso
- **Total ≈ 142 €/mois** (dont ~10 de consommation variable).
- vs **Pro 249** (qui n'inclut ni scan ni signature → toujours + conso par-dessus).
→ L'entreprise **n'est pas poussée artificiellement vers Pro**. Objectif respecté.

---

## 25. Cas 10 personnes

| Configuration | Calcul | Total/mois |
|---|---|---|
| **Mini + capacité + modules** | 79 + 7×15 (capacité) + 25 (pointage) + 29 (stock) + 15 (Mat.&véh.) | **253 €** |
| **Pro + modules** | 249 + 24 (stock) + 15 (Mat.&véh.) — pointage & notes_frais inclus, 15 pers. incluses | **288 €** |

→ **Point de bascule ≈ 10-12 personnes avec 2-3 modules : Pro devient recommandé** (marge de croissance jusqu'à 15 personnes, quota IA 500 vs 100, meilleur support). À ajuster si Julien veut un basculement plus net (lever = capacité Mini à 15 €, déjà décidé).

---

## 26. Cas 20 personnes

| Configuration | Calcul | Total/mois |
|---|---|---|
| **Pro + capacité + modules** | 249 + 5×12 + 24 (stock) + 15 (Mat.&véh.) + 19 (safety) + 15 (forms) + 29 (rentab.) | **396 €** |
| **Business** (tout inclus, 30 pers.) | 449 | **449 €** |

→ Pro + 5 modules (396) frôle Business (449). **Business recommandé dès ~20 personnes + 4 modules**, pour le prix plat, la capacité 30 et les quotas. Bundle Business = vraie valeur.

---

## 27. Cas 40 personnes

| Configuration | Calcul | Total/mois |
|---|---|---|
| **Business + capacité** | 449 + 10×9 | **539 €** |
| **Entreprise** (50 pers. incluses) | 599 | **599 €** |

→ À 40 personnes, Business + capacité (539) reste sous Entreprise (599). **Le basculement Entreprise se justifie à ~45-50 personnes**, ou plus tôt si besoin de modules avancés (planning avancé, automations à quota élevé), d'accompagnement prioritaire ou de capacités spécifiques.

---

## 28. Bundles proposés

### Mini — « Démarrer »
SOCLE uniquement : chantier, clients, devis, factures, planning de base, messagerie, tableau de bord, fiches employés, **notes de frais** (reco §9b), droit IA + 100 opérations. 3 personnes incluses.

### Pro — « Pack métier standard »
Mini + **pointage** + IA 500 opérations. 15 personnes incluses.
*(À la carte : stock, Matériel & véhicules, safety, forms, rentabilité avancée, connect, automations.)*

### Business — « Tout le quotidien »
Pro + **stock + Matériel & véhicules + safety + forms + rentabilité avancée + connect + automations (quota standard)** + IA 1 500 opérations + maintenance (à la livraison). 30 personnes incluses.

### Entreprise — « Gros besoins & accompagnement »
Business + **planning avancé** (à la livraison) + automations quota élevé + IA 3 000 opérations + capacités spécifiques (stockage, connecteurs) + **accompagnement prioritaire**. 50 personnes incluses.

---

## 29. Sur mesure

- L'offre « Sur mesure » (`sur_mesure`, devis obligatoire) **n'a pas besoin d'être une 5ᵉ grille publique**.
- **Recommandation** : la retirer de la page publique `/tarifs` (garder Mini→Entreprise visibles) et la traiter comme **offre purement commerciale** (mention « Besoins spécifiques : nous contacter »). Entreprise couvre le public ; Sur mesure = négociation directe (volumétrie, intégrations, SLA, accompagnement).

---

## 30. Options consommées (catégorie séparée)

| Option | Modèle | Quota inclus | Dépassement | Prix figable ? |
|---|---|---|---|---|
| IA | droit inclus + quota/plan | 100 / 500 / 1 500 / 3 000 ops | packs de crédits **ou** « IA intensive » 79 €/mois | **non** — dépend du coût/opération réel |
| Scan / OCR | module + quota pages | ~100–200 pages/mois *(à mesurer)* | ~0,05–0,10 €/page *(à valider)* | **non** — coût fournisseur |
| Signature | module + quota | ~5 signatures/mois | à l'unité, ~1–3 € *(à valider)* | **non** — coût fournisseur eIDAS |
| SMS (notifications terrain) | à l'usage | 0 | ~0,08–0,12 €/SMS *(à valider)* | **non** — coût opérateur |
| Stockage | blocs +50 Go/mois | quota/plan | 0,5 €/Go (existant) ou bloc +50 Go ~19–25 € | **oui, rapidement** — coût infra faible |
| Facturation électronique | module + volume | à définir | coût PDP à l'acte | **non** — partenaire requis |

Règle : **ne jamais mélanger** une option consommée avec un module fixe sur la facture ni dans le catalogue. Ligne d'abonnement distincte, compteur mensuel visible sur `/abonnement`.

---

## 31. ELSATIA Services

Séparés des modules (déjà `SERVICES_MISE_EN_SERVICE`) :

| Service | Nature | Indicatif existant |
|---|---|---|
| Forfait de mise en service | ponctuel | 1 990 € |
| Installation simple | ponctuel | 490 € |
| Import données (employés, clients, fournisseurs) | ponctuel | 690 € |
| Configuration complète (≤ 40 employés) | ponctuel | 1 500 – 2 500 € |
| Formation | ponctuel / par session | à définir |
| Assistance premium | **récurrent** (option) | à définir |

**Affichage commercial** : un bloc « Services & accompagnement » distinct sur `/tarifs` et dans
l'onboarding, jamais dans la grille des modules. L'assistance premium est la seule ligne
récurrente (option d'abonnement), le reste est facturé à la commande (Stripe `mode=payment` /
`invoiceitems`, cf. audit R0 §28).

---

## 32. Boutique

- **Ne pas mélanger** module logiciel et produit physique. `boutique_*` reste séparé du billing SaaS.
- **Bundles commerciaux** possibles sans changement d'architecture : une ligne de commande
  boutique « Pack Stock » = borne/douchette (physique) + module `stock` (entitlement) +
  installation (service). À la validation de la commande, la boutique appelle
  `plateforme_definir_module_entreprise('stock', actif=true, origine='achat', source='stripe'|'systeme')`
  et crée une commande de service. Aucune fusion rigide boutique ↔ abonnement.

---

## 33. Modules futurs (applications autonomes — hors grille GP)

**Labels, Plans, Market ne sont PAS des modules Gestion Pro.** Ce sont des applications ELSATIA
autonomes sur le substrat multi-app (`applications_elsatia`, `acces_applications_entreprises`).
Elles auront leur propre tarification. Le lien avec Gestion Pro (transfert de plans, de stocks,
d'articles Market) passe par l'Integration Core (cf.
`ELSATIA_INTEGRATION_CORE_MARKET_READINESS_V1.md`), pas par la grille modules ci-dessus.
Ne pas les inscrire dans `modules_gestion_pro`.

---

## 34. Matrice multi-plateforme

| Module | Desktop | Tablette | Mobile | PWA | Android | iOS | Offline |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| chantier | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| pointage | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| stock | ✅ | ✅ | ✅ (borne) | ✅ | ✅ | ✅ | ✅ (borne + inventaire) |
| scan_ocr | ✅ | ✅ | ✅ (capture) | ✅ | ✅ | ✅ | ✅ (file d'attente) |
| forms | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| safety | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Matériel & véhicules | ✅ | ✅ | lecture + actions simples | ✅ | ✅ | ✅ | partiel |
| notes_frais | ✅ | ✅ | ✅ (photo ticket) | ✅ | ✅ | ✅ | partiel |
| rentabilite_avancee | ✅ | ✅ | lecture | ✅ | lecture | lecture | non |
| connect | ✅ | ✅ | lecture | ✅ | lecture | lecture | non |
| automations | ✅ | ✅ | lecture/config | ✅ | non | non | non (serveur) |
| planning_avance | ✅ | ✅ | lecture | ✅ | lecture | lecture | non |
| ia | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | non (en ligne) |

Règle ELSATIA : web desktop/tablette/mobile + PWA installable ; Android (Play) et iOS/iPadOS
(App Store) quand pertinent ; **offline + sync obligatoires** pour les modules terrain
(chantier, pointage, stock, scan_ocr, forms, safety).

---

## 35. Roadmap commerciale

### Disponible au lancement
chantier *(inclus)*, **pointage**, **notes_frais** *(inclus, reco)*, **stock**, **Matériel & véhicules**, **rentabilité avancée**, **ia** *(droit + quota)*.
→ Ce sont exactement les 8 modules « actifs » R3 (véhicules + matériel regroupés).

### À activer rapidement (dès parcours finalisés / fournisseurs choisis)
forms, safety, connect, automations, scan_ocr *(fournisseur OCR)*, signature *(fournisseur eIDAS)*, planning_avance *(spécification du delta)*, stockage_supplementaire *(productiser la capacité)*.

### Futur
maintenance, facturation_electronique *(PDP partenaire)*, sauvegarde_renforcee *(cinq prérequis §21)*.

**Règle** : le catalogue ne doit **jamais** afficher de prix ni de bouton d'achat pour un
module `statut_catalogue <> 'actif'` (comportement déjà en place côté UI R3 : « Bientôt
disponible » / « Nous contacter »).

---

## 36. Prix à figer avant R4

### Peuvent être figés maintenant (coût interne seul, risque faible)
- Inclusions de bundle Mini / Pro / Business / Entreprise (§28).
- Regroupement « Matériel & véhicules » (§10).
- À la carte : pointage Mini (~25), stock Mini/Pro (~29 / ~24), Matériel & véhicules Mini/Pro (~19 / ~15), safety Mini/Pro (~24 / ~19), forms Mini/Pro (~19 / ~15), rentabilité avancée Pro (~29), connect Pro (~39), automations Pro (~29).
- Bloc stockage +50 Go/mois (~19–25) — après confirmation coût infra.

### Nécessitent des coûts fournisseurs
- Scan/OCR : prix/page et quota inclus (fournisseur OCR).
- Signature : prix/signature et quota (fournisseur eIDAS).
- SMS : prix/SMS (opérateur).
- Facturation électronique : coût PDP à l'acte.
- Packs de crédits IA : coût réel par opération (modèles + fournisseur).

### Nécessitent une étude de marché
- Points de prix exacts des modules (disposition à payer sur un panel BTP).
- Opportunité de vendre `pointage` à la carte sur Mini (vs inclusion Pro seule).
- Delta de valeur `planning_avance` (avant tout prix).

### À ne pas fixer encore
- maintenance, facturation_electronique, sauvegarde_renforcee, planning_avance (prix module).

---

## 37. Décisions Julien avant R4 (10 max)

1. **Classification** : valider quels modules sont achetables sur tous forfaits (proposition : pointage, stock, Matériel & véhicules, safety, forms, notes_frais) et lesquels seulement à partir de Pro (rentabilité avancée, connect, automations).
2. **Véhicules + matériel** : un seul module commercial « Matériel & véhicules » (recommandé) ou deux modules distincts facturés séparément.
3. **Gradient de prix module** : prix unique tous forfaits, OU dégressif Mini plein / Pro réduit / Business inclus (recommandé — cohérent avec la capacité personnes).
4. **Notes de frais** : inclus dans tous les forfaits (recommandé §9b) ou réservé Pro+ avec vente Mini à ~12 €.
5. **Pointage sur Mini** : vendable à la carte (~25 €, recommandé) ou inclus uniquement à partir de Pro sans vente séparée.
6. **Bundles** : valider le contenu exact des 4 bundles (§28), notamment ce qui entre dans Business vs Entreprise.
7. **Prix « figables maintenant »** (§36-A) : les valider tels quels ou déclencher d'abord une étude marché courte.
8. **Fournisseurs** : choisir le prestataire OCR (scan) et le prestataire de signature eIDAS pour débloquer le pricing consommation.
9. **Facturation électronique** : décider de la PDP partenaire et du moment d'entrée au catalogue vendable.
10. **Sauvegarde renforcée** : définir le contenu minimal (rétention, hors-région, RTO/RPO, restore self-service, runbook) avant toute commercialisation, ou la retirer durablement du catalogue commercial.

---

## Risques

- **Cannibalisation trop lente** si les prix modules sont trop bas → Pro/Business jamais choisis. Lever : prix modules Mini élevés + quotas.
- **Mini saboté** si trop de fonctions basiques passent en module payant → churn TPE. Garde-fou : SOCLE intangible (§2.4).
- **`bientôt` vendu comme actif** → promesse non tenue. Garde-fou : UI R3 masque déjà prix/achat hors `actif`.
- **Marge négative sur la consommation** (OCR, signature, SMS) si pas de quota + dépassement calibrés sur le coût fournisseur réel.
- **Facture client illisible** : base + capacité + N modules + M consommations. Besoin d'un récap `/abonnement` clair (section Modules R3 + section Personnes actives R1 déjà en place).
- **Divergence `plans_inclus[]` (R3) ↔ grille commerciale finale** : à réconcilier dans une migration R4 avant l'ouverture du billing modules.
- **Confusion module / application** (Labels, Plans, Market) : ne pas les faire entrer dans `modules_gestion_pro`.

---

*Fin de l'étude. Aucune modification technique. Voir R4 pour le branchement Stripe des modules
et la réconciliation `plans_inclus` ↔ grille validée.*
