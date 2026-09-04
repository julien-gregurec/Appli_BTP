# ELSATIA — Checklist opérateur cutover Production

Imprimable. Une ligne = une case à cocher, une heure, un opérateur, un résultat.
Détail complet de chaque étape : `docs/runbooks/ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md`
(§14–§26). Rollback détaillé : `docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md`.

**Cible** : branche `feat/elsatia-commercial-canonical-r1-r2-r3-v1`, SHA app `c1930ab366109a…`,
ledger visé **261**. **Date/heure réelles et noms à écrire à la main ci-dessous — rien n'est
présupposé.**

Date : ______________  Heure de début (UTC) : ______________

| Rôle | Nom | Joignable jusqu'à |
|---|---|---|
| A — Opérateur technique | | |
| B — Responsable GO/NO-GO | | |
| C — Responsable rollback | | |
| D — Observateur métier | | |
| E — Second admin `total` (MFA) | | |

---

## Déroulé

| T | Action | Heure réelle | Opérateur | Résultat | Décision |
|---|---|---|---|---|---|
| T-60 | Gel changements + rôles présents + accès rollback vérifiés (Vercel, PITR, volume DR) | | | ☐ PASS ☐ FAIL | |
| T-60 | **P0-1** exécuté : ledger Production lu, sentinelles, admins, MFA (voir carte P0-1 ↓) | | | ☐ PASS ☐ FAIL | |
| T-45 | **Gate P0-1** : baseline conforme, gap figé (☐ 50 ☐ 51) | | | ☐ PASS ☐ FAIL | ☐ GO ☐ STOP |
| T-30 | **P0-3** démarré : PITR/snapshot + dump chiffré + Storage backup + manifestes | | | ☐ PASS ☐ FAIL | |
| T-15 | Test de restauration exécuté (base probe) | | | ☐ PASS ☐ FAIL | |
| T0 | **Gate P0-3** + **checklist GO-T0** complète (voir carte T0 ↓) | | | ☐ PASS ☐ FAIL | ☐ GO ☐ STOP |
| T0 | Application des migrations manquantes (ordre lexical) | | | ☐ PASS ☐ FAIL | |
| T+10 | Ledger = 261, `…255` + `…263` présentes, 2ᵉ `migration up` vide | | | ☐ PASS ☐ FAIL | |
| T+20 | pgTAP critique + smoke SQL sentinelles inchangées → **point de décision migration** | | | ☐ PASS ☐ FAIL | ☐ GO ☐ ROLLBACK |
| T+30 | Déploiement app `c1930ab` + login, `/abonnement`, dashboard, chantier, stock, pas de 5xx/boucle | | | ☐ PASS ☐ FAIL | |
| T+45 | MFA admin 1 + admin 2, multitenant A/B, Colors, Tools, Stripe TEST | | | ☐ PASS ☐ FAIL | |
| T+60 | **Décision GO/NO-GO globale** (toutes cases PASS ci-dessus) | | | | ☐ GO — ouverture ☐ ROLLBACK |
| T+90 | Si GO : surveillance rapprochée. Si ROLLBACK : suivi procédure §26 | | | ☐ PASS ☐ FAIL | |
| T+120 | Fin de fenêtre : bilan écrit, gel levé ou plan de reprise | | | | |

---

## Carte P0-1 (à T-60, lecture seule, aucune valeur secrète imprimée)

☐ Ref Production confirmée (`exhvuzegsefmoguxoiak`)
☐ Ledger lu : `count = ____`  `max(version) = ____________`
☐ `…000255_acl_reconciliation_v1` **absente** (attendu)
☐ Gap vers 261 calculé : `____` migrations
☐ Sentinelles (entreprises/utilisateurs/clients/chantiers/devis/factures) cohérentes avec le dernier snapshot DR connu
☐ Admins plateforme listés (email/rôle/actif/statut) — au moins 1 `total` actif
☐ État MFA des admins vérifié (facteurs enrôlés/vérifiés — pas de seed/QR/code lu ici)
☐ Aucune anomalie inattendue (schéma/rôle/extension)

**Un seul ☐ non coché → STOP, ne pas passer à T-30.**

## Carte T0 — GO/NO-GO migration (à T0, avant toute écriture)

☐ P0-1 PASS ☐ Gap figé ☐ P0-3 PASS (restauration prouvée) ☐ Responsable rollback (C) présent
☐ SHA app `c1930ab` prêt à déployer ☐ Production Branch = branche canonique (**≠ `main`**)
☐ Variables Production présentes (fiche §5 du préflight) ☐ `ABONNEMENTS_PUBLICS_OUVERTS=false`
☐ Stripe mode = TEST ☐ Webhook mode = TEST ☐ Aucun secret manquant
☐ Registry Ed25519 cohérente (si attestation active) ☐ Second admin MFA (E) joignable
☐ Aucun incident Production en cours (monitoring vérifié)

**Un seul ☐ non coché → NO-GO, ne pas migrer.**

---

Notes / incidents pendant la fenêtre :

_____________________________________________________________________________

_____________________________________________________________________________
