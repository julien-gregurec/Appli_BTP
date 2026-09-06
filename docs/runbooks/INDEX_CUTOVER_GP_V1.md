# ELSATIA — Index des documents du cutover Gestion Pro

**Lot :** `ELSATIA-GP-CUTOVER-DOCUMENTATION-CLOSURE-V1` — 2026-09-06

Ce fichier dit **quel document fait foi**. Il existe parce que plusieurs versions de la cible du
cutover ont été annoncées successivement et que des copies périmées subsistent dans d'autres
branches. **Aucun document n'a été supprimé.**

---

## 1. Quelle version fait foi

| Rang | Document | Statut | Usage |
|---|---|---|---|
| **1** | `ELSATIA_GP_CUTOVER_DAY_OF_RUNBOOK_V1.md` | **FAIT FOI — source unique opératoire** | **Le seul document à suivre le jour J.** En cas de divergence avec n'importe quel autre document, c'est lui qui prime. |
| 2 | `ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md` (v1.5) | **EN VIGUEUR — référence détaillée** | Détail de chaque étape, fiche variables, preuves d'exécution §13. **Non opératoire seul.** |
| 3 | `ELSATIA_PRODUCTION_ROLLBACK_V1.md` | **EN VIGUEUR — référence détaillée** | Procédure de rollback, stratégies A/B/C, matrice de scénarios. |
| 4 | `ELSATIA_ED25519_ATTESTATION_PROVISIONING_V1.md` | **EN VIGUEUR — référence détaillée** | Formats, commandes et ordre exact du provisioning Ed25519. |
| 5 | `ELSATIA_RELEASE_GOVERNANCE_V1.md` | **EN VIGUEUR** | Gouvernance des branches, Production Branch, rulesets. |
| 6 | `ELSATIA_PRODUCTION_CUTOVER_OPERATOR_CHECKLIST_V1.md` | **SUPERSEDED** par le rang 1 | Conservé comme historique. Ne pas utiliser seul le jour J. |

---

## 2. Valeurs canoniques — toute autre valeur est périmée

```
CUTOVER TARGET:
996be15c136f09d9977375e700462b503a1720c3

LEDGER:
210 → 263

MIGRATIONS:
53

POINT OF NO RETURN:
20260902000255_acl_reconciliation_v1

PRODUCTION BRANCH:
release/commercialisation-v1

HOTFIX AFTER VALIDATION:
7ba62c5315213bf21b9ed8553408fc678e943327
```

### Valeurs périmées — ne jamais les utiliser comme consigne

| Valeur périmée | Où elle apparaît légitimement | Valeur canonique |
|---|---|---|
| SHA `c1930ab`, `a81f317`, `b371641`, `1d15289` | documents historiques, pour expliquer la **filiation** de la cible | **`996be15`** |
| Ledger 253, 261 | historique des cibles successives | **263** |
| Gap **50**, **51** | ancienne cible ledger 261 | **53** |
| Baseline 211 | ancienne hypothèse du runbook V1 | **210** (dernière version `…000231`) |

`a81f317` a un statut particulier et **légitime** : c'est le SHA d'exécution réel du drill DB
(Fresh 263, Restore 210→263, rollback, drift ACL). Il reste opposable pour `996be15` car l'arbre
`supabase/migrations/` y est identique au bit près. Ce n'est **pas** une cible de déploiement.

---

## 3. Où se trouvent les documents à jour

| Branche | Contenu documentaire | Remarque |
|---|---|---|
| `docs/gp-cutover-documentation-closure-v1` | **documentation finale** (ce lot) | branche de référence |
| `docs/gp-cutover-env-doc-delta-closure-v1` (`35d2d2b`) | préflight v1.5 + checklist + rollback | poussée sur `origin` le 2026-09-06 |
| `docs/gp-cutover-runbook-qa-rebase-v1` (`aabe612`) | préflight v1.4 | déjà sur `origin` |
| `docs/gp-cutover-documentation-closure-on-hotfix-v1` | documentation finale **rebasée sur `7ba62c`** | à reprendre lors de la promotion du hotfix |

⚠ **Toutes les autres branches — y compris la branche canonique `feat/elsatia-commercial-canonical-r1-r2-r3-v1`
au SHA cible `996be15`, et la branche de hotfix `integration/gp-postcutover-pilot-hotfix-v1` au
SHA `7ba62c` — portent encore une checklist opérateur périmée qui annonce `1d15289` comme cible
applicative.** Ce n'est pas un défaut de la cible technique : `996be15` est un commit
documentation-only assis au-dessus de `1d15289`, l'arbre applicatif est identique. Mais un
opérateur qui imprimerait la checklist depuis ces branches lirait **le mauvais SHA contractuel**.

**Conséquence pratique : n'imprimer aucun document cutover depuis une autre branche que celles du
tableau ci-dessus.**

---

## 4. Contrôle automatique

```bash
node scripts/verify-cutover-docs.mjs
```

Script **strictement en lecture seule** : il ne touche ni Git, ni la base, ni le réseau. Il
vérifie que les valeurs canoniques ci-dessus sont bien celles écrites dans le runbook du jour J,
et qu'aucune valeur périmée n'a resurgi dans une section opératoire.
