# ELSATIA — Checklist opérateur cutover Production

> # ⚠ SUPERSEDED — NE PAS UTILISER SEUL LE JOUR J
>
> Ce document est **remplacé** par la source unique opératoire :
> **`docs/runbooks/ELSATIA_GP_CUTOVER_DAY_OF_RUNBOOK_V1.md`**.
> Il est **conservé comme historique** (lot `ELSATIA-GP-CUTOVER-DOCUMENTATION-CLOSURE-V1`,
> 2026-09-06). En cas de divergence, **le runbook du jour J fait foi**.
> Statut de chaque document : `docs/runbooks/INDEX_CUTOVER_GP_V1.md`.

Imprimable. Une ligne = une case à cocher, une heure, un opérateur, un résultat.
Détail complet de chaque étape : `docs/runbooks/ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md`
(§14–§26). Rollback détaillé : `docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md`.

**Cible applicative** : SHA app **`996be15c136f09d9977375e700462b503a1720c3`**, ledger visé
**263**. C'est le HEAD de la branche source canonique `feat/elsatia-commercial-canonical-r1-r2-r3-v1`
(lot `ELSATIA-GP-CUTOVER-RUNBOOK-AND-QA-REBASE-V1`, 2026-09-05 — remplace les cibles annoncées
successivement `c1930ab`/ledger 261, puis `a81f317`, `b371641` et `1d15289`).

**Chemin de déploiement — dans cet ordre, sans variante :**

1. `996be15` est **promu dans `release/commercialisation-v1`** (branche de release) ;
2. `release/commercialisation-v1` est déployée sur Vercel Production.

La **Production Branch Vercel reste `release/commercialisation-v1`** : sa configuration **n'est pas
modifiée** par le cutover. Ne jamais la basculer sur la branche `feat/…`, ni sur `main`.

**Preuves (attribution exacte, ne pas confondre)** : drill DB 263 (Fresh, Restore 210→263,
rollback 210→263→210, pgTAP 54/1154, drift ACL 0) exécuté au SHA `a81f317` — valable pour
`996be15`, arbre `supabase/migrations/` identique. QA applicative (Vitest 93/815 + Tools 20/107,
typecheck, lint, build, verify, audit) rejouée au SHA `996be15`. Détail : préflight §13.

**Date/heure réelles et noms à écrire à la main ci-dessous — rien n'est présupposé.**

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
| T-45 | **Gate P0-1** : baseline conforme (210), gap figé (**53**) | | | ☐ PASS ☐ FAIL | ☐ GO ☐ STOP |
| T-30 | **P0-3** démarré : PITR/snapshot + dump chiffré + Storage backup + manifestes | | | ☐ PASS ☐ FAIL | |
| T-15 | Test de restauration exécuté (base probe) | | | ☐ PASS ☐ FAIL | |
| T0 | **Gate P0-3** + **checklist GO-T0** complète (voir carte T0 ↓) | | | ☐ PASS ☐ FAIL | ☐ GO ☐ STOP |
| T0 | Application des migrations manquantes (ordre lexical) | | | ☐ PASS ☐ FAIL | |
| T+10 | Ledger = 263, `…255` + `…263` présentes, 2ᵉ `migration up` vide | | | ☐ PASS ☐ FAIL | |
| T+20 | pgTAP critique + smoke SQL sentinelles inchangées → **point de décision migration** | | | ☐ PASS ☐ FAIL | ☐ GO ☐ ROLLBACK |
| T+30 | Promotion `996be15` → `release/commercialisation-v1`, déploiement, puis login, `/abonnement`, dashboard, chantier, stock, pas de 5xx/boucle | | | ☐ PASS ☐ FAIL | |
| T+45 | **À EXÉCUTER PENDANT LE CUTOVER** (aucun de ces smokes n'a été exécuté à `996be15`) : MFA admin 1 + admin 2, multitenant A/B, Colors, Tools, Stripe TEST | | | ☐ PASS ☐ FAIL | |
| T+45 | **Carte P0 fenêtre — environnement** : A Ed25519, B réaffirmation des 3 flags, C smoke mode Stripe (voir carte P0 fenêtre ↓) | | | ☐ PASS ☐ FAIL | |
| T+60 | **Décision GO/NO-GO globale** (toutes cases PASS ci-dessus) | | | | ☐ GO — ouverture ☐ ROLLBACK |
| T+90 | Si GO : surveillance rapprochée. Si ROLLBACK : suivi procédure §26 | | | ☐ PASS ☐ FAIL | |
| T+120 | Fin de fenêtre : bilan écrit, gel levé ou plan de reprise | | | | |

---

## Carte P0-1 (à T-60, lecture seule, aucune valeur secrète imprimée)

☐ Ref Production confirmée (`exhvuzegsefmoguxoiak`)
☐ Ledger lu : `count = ____`  `max(version) = ____________`
☐ `…000255_acl_reconciliation_v1` **absente** (attendu)
☐ Gap vers 263 calculé : `____` migrations (attendu **53** si le ledger lu confirme la baseline à 210 — noter la valeur observée, ne pas supposer)
☐ Sentinelles (entreprises/utilisateurs/clients/chantiers/devis/factures) cohérentes avec le dernier snapshot DR connu
☐ Admins plateforme listés (email/rôle/actif/statut) — au moins 1 `total` actif
☐ État MFA des admins vérifié (facteurs enrôlés/vérifiés — pas de seed/QR/code lu ici)
☐ Aucune anomalie inattendue (schéma/rôle/extension)

**Un seul ☐ non coché → STOP, ne pas passer à T-30.**

## Carte T0 — GO/NO-GO migration (à T0, avant toute écriture)

☐ P0-1 PASS ☐ Gap figé ☐ P0-3 PASS (restauration prouvée) ☐ Responsable rollback (C) présent
☐ `git fetch origin` fait ; `origin/release/commercialisation-v1` = `fcdd4e7c` (SHA Production réel)
☐ Vérifié : `git merge-base --is-ancestor origin/release/commercialisation-v1 996be15` → **vrai** (promotion en fast-forward, jamais `--force`)
☐ ⚠ La branche **locale** `release/commercialisation-v1` peut être périmée (constatée à `8fe737e` le 2026-09-05, soit **3 commits en retard** sur `fcdd4e7c` — elle en est un ancêtre, pas une divergence, mais ce n'est pas la vérité déployée) — `git fetch origin` **obligatoire**, puis promouvoir depuis `origin`, jamais depuis un local non resynchronisé
☐ SHA app `996be15` promu dans `release/commercialisation-v1` et prêt à déployer
☐ Production Branch Vercel = `release/commercialisation-v1`, **inchangée** (**≠ `main`**, **≠ `feat/…`**)
☐ Variables Production présentes **par nom** (fiche §5 du préflight) ☐ `ABONNEMENTS_PUBLICS_OUVERTS=false`
☐ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` présente — **seule** clé publique lue, l'app jette sans elle. **Ne pas chercher `NEXT_PUBLIC_SUPABASE_ANON_KEY`** (non consommée au SHA `996be15`)
☐ `SUPABASE_PROJECT_REF=exhvuzegsefmoguxoiak` cohérent avec l'hôte de `NEXT_PUBLIC_SUPABASE_URL` ☐ `ELSATIA_SUPABASE_PROJECT_NAME=elsatia-production` (variables d'**ops**, pas des clés applicatives)
☐ `NEXT_PUBLIC_LEGAL_SIRET` renseignée (`850 559 873 00011` — **déjà provisionnée et vérifiée**)
☐ `NEXT_PUBLIC_LEGAL_TVA` : laisser **vide** tant que le régime n'est pas confirmé (repli neutre, P1-6)
☐ Webhook mode = TEST (`STRIPE_WEBHOOK_EXPECTED_MODE=test`, valeur lisible)
☐ Stripe mode clé : **non vérifiable ici** — reporté au smoke contrôlé T+45 (carte P0 fenêtre, item C)
☐ Aucun secret **obligatoire** manquant (les absences §5.3/§5.9/§5.10/§5.11/§5.12 sont normales)
☐ Variables Vercel Ed25519 provisionnées (registry DB = après T0, voir §18bis) ☐ Second admin MFA (E) joignable
☐ Aucun incident Production en cours (monitoring vérifié)

**Un seul ☐ non coché → NO-GO, ne pas migrer.**

---

## Carte P0 fenêtre — environnement (exactement 3 items)

> ⚠ **Variables Vercel de type `sensitive`.** 27 des 46 variables de `elsatia-production` sont de
> type `sensitive` : leur valeur est **irrécupérable**, y compris via `vercel env pull`. Cela couvre
> les vrais secrets **et** `FEATURE_AI_ENABLED`, `FEATURE_AI_DEVIS_ENABLED`,
> `FEATURE_RELANCES_AUTO_ENABLED`, `STRIPE_SECRET_KEY`, tous les `STRIPE_PRICE_*`, `SUPPORT_EMAIL`,
> `EMAIL_FROM_ADDRESS`.
> **Ne jamais prétendre les « vérifier » par lecture, et ne jamais afficher un secret pour
> contrôler.** Les seules actions légitimes : réaffirmation explicite, ou smoke de comportement.

**A — Provisionner les variables Ed25519** *(au plus tard à la carte T0 ; registry DB après)*

☐ `STRIPE_STATE_ATTESTATION_KEY_ID` provisionnée sur Vercel Production
☐ `STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64` provisionnée sur Vercel Production (**Vercel uniquement**, jamais dans doc/dump/log)
☐ Registry DB rempli **seulement après** confirmation de `…244`/`…245` au ledger (préflight §18bis)
☐ Fichier local de clé privée supprimé

**B — Réaffirmer explicitement les 3 flags non relisibles** *(réécrire, ne pas « vérifier »)*

☐ `FEATURE_AI_ENABLED=false`
☐ `FEATURE_AI_DEVIS_ENABLED=false`
☐ `FEATURE_RELANCES_AUTO_ENABLED=false`

**C — Confirmer le mode Stripe par smoke contrôlé** *(à T+45, préflight §23)*

☐ Observation 1 : session Checkout de recette → `livemode = false`
☐ Observation 2 : saga de remise attestée cohérente avec le registry `environment = 'test'`
☐ Mode conclu = `test`, les deux observations **concordantes**
☐ Aucune valeur de clé affichée, copiée ou journalisée

**Un seul ☐ non coché sur A, B ou C → NO-GO à T+60.** Aucune activation Stripe Live, en aucun cas.

---

Notes / incidents pendant la fenêtre :

_____________________________________________________________________________

_____________________________________________________________________________
