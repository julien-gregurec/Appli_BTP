# ELSATIA — Hotfixes pilote post-cutover Gestion Pro (V1)

**Lot :** `ELSATIA-GP-POSTCUTOVER-PILOT-HOTFIX-RECONCILIATION-V1`
**Branche :** `integration/gp-postcutover-pilot-hotfix-v1`
**Date :** 2026-09-06
**Ledger migrations :** **263** (inchangé)

---

## 1. Ce que ce document tranche

Trois correctifs pilote applicatifs avaient été validés séparément au-dessus de la
cible de cutover. Deux d'entre eux étaient des branches **sœurs** : aucune ne
contenait l'autre, et aucune n'était donc déployable sans perdre le travail de
l'autre. Ce lot les réconcilie en **une seule branche** intégrable après cutover,
**sans migration** et **sans toucher à la cible technique du cutover**.

---

## 2. Commits de référence

| Rôle | SHA | Sujet |
| --- | --- | --- |
| **Cible de cutover (FIGÉE)** | `996be15c136f09d9977375e700462b503a1720c3` | `docs(ops): refresh cutover target to 1d15289` |
| Socle essai / capacité | `f34601a6fe070bf6af480bb27315d82bc838c0c4` | `fix(gp): restore trial access to core features` |
| Sortie d'essai (P1) | `1e943f74fcdcb2eb64a5a076e53711507492596a` | `fix(gp): improve trial expiry access and guidance` |
| Second admin plateforme (P1) | `a063f4f209bb22b73cbad40e8d2da2a339ec8733` | `feat(gp): expose platform second-admin controls` |
| **Résultat consolidé** | `3164262f77f1669ef62bc27858214480515d598f` | merge des deux branches sœurs |

> `996be15` **n'est pas modifié par ce lot** et reste la cible du cutover coordonné DB/application.

---

## 3. Topologie réelle (auditée, non supposée)

```
996be15  (cible cutover, ledger 263)
   │
   └── f34601a  socle essai / capacité
         ├── 1e943f7  sortie d'essai        ─┐  branches SŒURS
         └── a063f4f  second admin           ─┘  aucune ne contient l'autre
                     │
                     └── 3164262  integration/gp-postcutover-pilot-hotfix-v1
```

Merge-bases vérifiées :

- `merge-base(f34601a, 1e943f7)` = `f34601a` → 1e943f7 descend bien de f34601a
- `merge-base(f34601a, a063f4f)` = `f34601a` → a063f4f descend bien de f34601a
- `merge-base(1e943f7, a063f4f)` = `f34601a` → **divergence confirmée**
- `merge-base(996be15, f34601a)` = `996be15` → f34601a descend bien de la cible de cutover

---

## 4. Stratégie d'intégration retenue

**Deux merges `--no-ff` successifs depuis `f34601a`**, dans l'ordre :

1. `1e943f7` — sortie d'essai
2. `a063f4f` — second admin plateforme

**Justification.** L'audit des jeux de fichiers a montré une **intersection vide** :
aucun fichier n'est touché par les deux branches à la fois.

| Périmètre | Fichiers |
| --- | --- |
| Sortie d'essai uniquement | `src/app/(app)/layout.tsx`, `src/app/abonnement-suspendu/page.tsx`, `src/components/EssaiBanner.tsx`, `src/lib/acces-socle-essai.{ts,test.ts}`, `src/lib/entreprise.{ts,test.ts}` |
| Second admin uniquement | `docs/operations/PLATFORM_ADMIN_ACTIVATION_RUNBOOK.md`, `docs/organisation/ELSATIA_GP_PLATFORM_SECOND_ADMIN_OPERABILITY_V1.md`, `src/app/(app)/plateforme/page.tsx`, `src/app/actions/plateforme.ts`, `src/app/actions/plateforme-second-admin.test.ts`, `supabase/tests/platform_aal2_role_integrity_v1.test.sql` |
| **Communs** | **aucun** |

Aucun rebase, aucun reset, aucun cherry-pick : l'historique des deux lots validés
est conservé tel quel. **Zéro conflit**, y compris sur l'UI plateforme.

### Preuve d'intégration sans perte

Vérifié après merge, par différence de jeux de fichiers :

- `diff(1e943f7 → HEAD)` est **exactement** `diff(f34601a → a063f4f)`
- `diff(a063f4f → HEAD)` est **exactement** `diff(f34601a → 1e943f7)`
- les fichiers de chaque lot sont **octet pour octet identiques** à leur branche d'origine

Autrement dit : le merge n'a rien ajouté, rien retiré, rien réécrit.

---

## 5. Point d'attention — UI plateforme

`f34601a` avait déjà modifié `src/app/(app)/plateforme/page.tsx` et
`src/app/actions/plateforme.ts` (capacité additionnelle). `a063f4f` en **descend**,
donc sa version contient déjà ces modifications : les trois surfaces coexistent
dans le fichier consolidé.

Actions présentes simultanément dans `src/app/actions/plateforme.ts` :

- `definirCapacitePersonnesSupplementaireAction` *(capacité — f34601a)*
- `rattacherAdminPlateformeAction`, `activerAdminPlateformeAction`, `detacherAdminPlateformeAction` *(second admin — a063f4f)*

Interaction `layout.tsx` × `plateforme/page.tsx` auditée : les bandeaux d'essai
ajoutés au layout `(app)` sont **additifs** et neutralisés par
`ctx.accesSupportPlateforme`. Ils n'interfèrent donc pas avec la surface
administrateur plateforme.

---

## 6. Ledger de migrations — condition absolue tenue

- `supabase/migrations` : **aucun ajout, aucune modification** par ce lot.
- `npm run verify:migrations` → `263 migrations valides, noms et horodatages uniques.`

Le seul fichier SQL introduit est un test pgTAP
(`supabase/tests/platform_aal2_role_integrity_v1.test.sql`), qui n'est **pas** une
migration et n'entre pas dans le ledger.

---

## 7. Réserve DB — pgTAP non exécuté

**Statut : RESERVE DB À LEVER AVANT PROMOTION.**

L'exécution `npm run test:db` (`supabase test db`) n'a **pas** pu être lancée.

| Élément | État constaté |
| --- | --- |
| Supabase CLI | **disponible** — `2.109.1` (via `node_modules/.bin/supabase`) |
| Docker CLI | présent — `29.6.2` |
| Démon Docker | **injoignable** — `docker info` / `docker ps` sans réponse (processus Docker Desktop présents mais démon non servant) |
| Stack Supabase locale | **arrêtée** — ports `54321` et `54322` fermés |

Le blocage n'est donc plus le CLI (contrairement à la réserve initiale du lot
second admin) mais **le démon Docker**, sans lequel `supabase start` — et donc
`supabase test db` — ne peut pas démarrer.

**Aucun résultat pgTAP n'est revendiqué comme PASS.**

Validation statique effectuée sur le fichier de test :

- structure `begin; … no_plan(); … finish(); rollback;` → pas de risque d'écart de plan ;
- transaction annulée en fin de test → aucune écriture persistante ;
- couverture des cas de sécurité attendus : AAL1 refusé, AAL2 autorisé, rôle non
  total refusé, MFA de la cible absent, auto-révocation refusée, dernier total
  protégé, cloisonnement cross-tenant, utilisateur Auth absent, doublons.

**À lever avant promotion :** démarrer Docker, puis `npm run db:start && npm run test:db`.

---

## 8. Résultats de vérification (branche consolidée)

| Contrôle | Résultat |
| --- | --- |
| `verify:migrations` | ✅ 263 migrations valides |
| `verify:secrets` | ✅ 1312 fichiers contrôlés, aucun secret |
| `typecheck` (GP + Tools) | ✅ aucune erreur |
| Vitest GP | ✅ 95 fichiers / 949 tests |
| Vitest Tools | ✅ 20 fichiers / 107 tests |
| `lint` (GP + Tools) | ✅ 0 erreur (3 warnings `<img>` préexistants, fichiers non touchés) |
| `build` (GP + Tools) | ✅ succès |
| `git diff --check` | ✅ propre |
| pgTAP | ⚠️ **non exécuté — réserve DB** |

---

## 9. Procédure post-cutover

Cette branche **ne devient pas** la cible du cutover initial. Ordre imposé :

1. **Cutover coordonné DB/application sur `996be15` / ledger 263.**
2. **Validation Production** du cutover (contrôles nominaux du runbook de cutover).
3. **Levée de la réserve pgTAP** — Docker démarré, `npm run test:db` au vert.
4. **Promotion du hotfix pilote** depuis `integration/gp-postcutover-pilot-hotfix-v1`.
5. **Ouverture du premier pilote.**

La promotion à l'étape 4 est un **déploiement applicatif seul** : aucune migration
n'accompagne cette branche, le ledger reste à 263 de bout en bout.

---

## 10. Classement P0 / P1 / P2 pour le pilote

**P0 pilote (bloquant avant premier pilote) : 0.**

Les trois P0/P1 qui bloquaient le pilote sont désormais consolidés sur une seule
branche :

| Ancien classement | Objet | Statut |
| --- | --- | --- |
| P0 | Accès SOCLE refusé en essai (clients, devis, factures, employés, planning, messagerie) | ✅ clos — `f34601a` |
| P0 | Capacité pilote non ajustable sans SQL manuel | ✅ clos — `f34601a` |
| P1 | Sortie d'essai : aide, export RGPD, abonnement, préavis J-7/J-3/J-1 | ✅ clos — `1e943f7` |
| P1 | Second administrateur plateforme non opérable depuis l'UI | ✅ clos — `a063f4f` |

**P1 commercial (non bloquant pour le pilote) :**

- Réserve DB pgTAP à lever avant promotion (§7).
- Grille tarifaire site vitrine non réconciliée (69 vs 79) — hors périmètre de ce lot.
- Lot ELSATIA-UI-V2 (refonte visuelle avant commercialisation) — hors périmètre.

**P2 :** 3 warnings `@next/next/no-img-element` préexistants (boutique, signature employé).

---

## 11. Garanties de non-intervention

| Surface | Touchée par ce lot |
| --- | --- |
| `supabase/migrations` | **NON** |
| Supabase Production | **NON** |
| Stripe | **NON** |
| Production (déploiement) | **NON** |
| Cible de cutover `996be15` | **NON** |

Aucun deploy, aucun merge release n'a été effectué. Le travail est isolé dans un
worktree dédié et poussé sur une branche dédiée.
