# ELSATIA — Canonical Train V5 : convergence post-V4 (V1)

| | |
|---|---|
| Date | 2026-09-28 |
| Base | `integration/elsatia-canonical-train-v4` @ `b7fa9e2c` (verdict `CANONICAL TRAIN V4 READY FOR REMOTE PREVIEW` ; 352 migrations, dernière `20260927100000`) — **non modifiée** |
| Branche | `integration/elsatia-canonical-train-v5` (poussée aussi sur la branche de travail `claude/busy-tesla-phxg8b`, même commit) |
| Migrations | **355**, dernière **`20260928000301`** (+3, toutes renumérotées §4 ; aucune migration V4 modifiée) |
| Moteur | PostgreSQL 16.13 réel + pgTAP 1.3, amorce `scripts/local-postgres-bootstrap` (sans Docker) ; Node 22 ; Playwright 1.62.1 + Chromium 1194 |
| Actions distantes | **Aucune.** Aucune Preview, aucune Production, aucun merge vers `main`, V5 **non déployé**. |

## 0. Verdict

**`CANONICAL TRAIN V5 LOCALLY QUALIFIED`**

Les 4 lots post-V4 sont intégrés sans toucher à V4 (branche, migrations et rapports historiques
inchangés). Les 3 migrations post-V4 sont renumérotées après la dernière migration réelle de V4 :
`…0928 101` (Relevé plan 2D), `…0928 201` (réabonnement Stripe), `…0928 301` (Réserves D-01). Base
neuve **355/355**, 0 erreur. **Upgrade V4 → V5 avec données réalistes** (base V4 construite depuis
V3) : 0 écart de lignes sur 267 tables, **76/76 empreintes métier identiques**, 0 policy supprimée
ou modifiée, sonde RLS **0 écart / 1 326 cellules**, grants et EXECUTE existants inchangés, schéma
et ACL identiques au fresh, **35/35 contrôles métier** (plan 2D sur un relevé V4, D-01 sur un hôte
suspendu avant l'upgrade avec rejeu hors-ligne, réabonnement sur une entreprise annulée).
pgTAP **140/149 propres, 0 régression** (les 146 fichiers communs donnent des résultats identiques à
V4, les 3 suites nouvelles sont propres). Les 5 applications passent typecheck, lint, Vitest et
build. **Playwright** : Relevé 2/3/4/5 + Atelier **52/52**, Réserves **59/59**, D-01 **7/7**,
GP ↔ Réserves **5/5 ×2**, Stripe réabonnement **6/6 ×2**, Colors **73/73**. Seeds :
**ALL ACTIVE SEEDS QUALIFIED, 16/16** sur 355 migrations. Attendus du train, DB verify (26
contrôles, GO local), CI et runbooks sont régénérés.

Comme en V4, ce qui reste relève de l'exécution distante (Stripe Test, Portail, Storage, GoTrue,
e-mail réels : NOT PROVEN localement). V5 n'est pas déployé.

---

## 1. Lots post-V4 intégrés

| Lot | Branche | Tip | Base de la branche | Verdict d'origine | Intégration V5 |
|---|---|---|---|---|---|
| A. Relevé & Métré Lot 5 | `claude/vibrant-darwin-b4gc9n` | `d8539d4a` | `004f0510` (tip Lot 4, déjà dans V4) | RELEVE METRE LOT 5 LOCALLY QUALIFIED | merge `--no-ff` (6 commits), **sans conflit** |
| B. Stripe Resubscription | `claude/quirky-volta-b64l62` | `87f47c82` | `6ec71eb5` (tip Stripe Trial, déjà dans V4) | STRIPE RESUBSCRIPTION LOCALLY QUALIFIED | merge `--no-ff` (1 commit) **après** Ordering (`…0927 506`) et Trial Sync (`…0927 507`), présents dans V4 |
| C. Seed Compatibility Hardening | `claude/adoring-hawking-yke3o0` | `72490e69` | `cc230de8` (tip RGPD dette, déjà dans V4) | ALL ACTIVE SEEDS QUALIFIED | merge `--no-ff` (4 commits), 7 conflits résolus (§3) |
| D. Réserves D-01 / host suspension | `claude/relaxed-carson-way87a` | `1069bb66` | `ef7443c0` (tip V3) | RESERVES SUSPENSION POLICY LOCALLY QUALIFIED | merge `--no-ff` (2 commits), 5 conflits résolus (§3) |

Ordre : A → B → C → D (ordre de la mission), puis commits V5 propres : renumérotation et attendus
(`379a20ea`), harnais d'upgrade (`4d78de27`), seeds (`d80882dd`), rapport. Chaque base de branche est
un ancêtre de V4 : **aucun commit de V4 n'est rejoué ni réécrit**.

## 2. Déduplication par commit

| Commit | Lot | Statut | Note |
|---|---|---|---|
| `bb2597bd` plan 2D par étage (migration 901) + pgTAP | A | **NEW** | migration renumérotée `…0928 101` (§4) |
| `074356eb` domaine plan 2D, extensions Engine B | A | **NEW** | `packages/releve-domain` (plan, parité SQL), géométrie Tools |
| `bdaa7341` éditeur de plan 2D | A | **NEW** | murs, accrochage, ouvertures, pièces fermées, cotes, repères photo, SVG |
| `43506e0e` recette Playwright Lot 5 + corrections | A | **NEW** (code) + **TEST_ONLY** (spec) | corrige aussi `use-viewport-gestures.ts` (Atelier) — non-régression prouvée §13 |
| `191a3fc1` non-régression Atelier après Lot 5 | A | **TEST_ONLY** | |
| `d8539d4a` rapport Lot 5 | A | **DOC_ONLY** | rapport historique, non réécrit (numéros d'origine) |
| `87f47c82` parcours de réabonnement (V1) | B | **NEW** | migration `…0927 508` → **`…0928 201`** ; ses retouches de `ELSATIA_CANONICAL_TRAIN_V3_FINAL_CONVERGENCE.md` (chiffres du train courant) → **DO_NOT_PORT** (rapport historique figé) ; retouches des marqueurs `<!--train:…-->` → **SUPERSEDED** (régénérés) |
| `56d3c6c1` compatibilité des seeds + harnais `verify:seeds` | C | **NEW** | **SUPERSEDES** les correctifs de seeds propres à V4 (§3.2) |
| `ee63cf1a` DR (mot de passe authenticator), code d'adhésion Réserves | C | **NEW** | |
| `c960264c`, `72490e69` rapport des seeds | C | **DOC_ONLY** | historique (342 migrations, `…507`) non réécrit |
| `9ad629f5` hôte suspendu → intervenant en lecture seule | D | **NEW** | migration `…0927 506` → **`…0928 301`**, garde étendue à `reserves_contacts` (§6) |
| `1069bb66` rapport D-01 | D | **DOC_ONLY** | sa retouche du rapport V3 → **DO_NOT_PORT** (figé) |

Aucun commit **IDENTICAL** (aucun lot n'était déjà contenu dans V4) ; aucun lot entier **SUPERSEDED**.

## 3. Conflits

### 3.1 Fichiers générés et historiques

| Fichier | Lots | Statut | Résolution |
|---|---|---|---|
| `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` | B, D | **CONFLICT** | contrôles V4 1-23 conservés ; B → contrôle **24**, D → **25** (11 tables, §6) ; **26** ajouté (plan 2D) ; contrôle 22 borné aux 11 tables Relevé V4 ; CTE régénérée |
| `ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md`, `ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md` | B, D | **CONFLICT** (marqueurs) | régénérés (`sync:train-expectations`), ref V5, 35 RPC |
| `ELSATIA_CANONICAL_TRAIN_V3_FINAL_CONVERGENCE.md` | B, D | **DO_NOT_PORT** | version V4 conservée (figée) |
| `scripts/preview/preview-pack.test.mjs` | B | **CONFLICT** | 33 (V4) + 2 (réabonnement) = **35** RPC service-role only |
| `.github/workflows/ci.yml`, `package.json` | B, C | **CONFLICT** | union : scripts Stripe (V4 + réabonnement) **et** `test:seeds` / `verify:seeds` + job CI `seeds` |
| `apps/reserves/src/app/(reserves)/chantiers/[id]/page.tsx` | V4 (GP ↔ Réserves), D | **CONFLICT** | union : contacts GP (V4) **et** bandeau lecture seule D-01 |

### 3.2 Seeds (lot C face aux correctifs V4)

V4 avait corrigé à sa manière le seed Preview (supabase-js + étapes de finalisation), le 5 ans, le
pilote et le DR. Le lot C, bâti en parallèle sur la même base RGPD, les réécrit plus complètement
(SQL déterministe via `supabase db query --linked`, plus de clé `service_role` refusée par l'ACL 255,
transitions métier, rejeu, reprise après interruption, harnais réel). Résolution : **version C
retenue** pour `seed-elsatia-preview-year.mjs` (+ test), `seed_entreprise_pilote_btp.sql`,
`seed_entreprise_test_5_ans.sql`, `03_seed_synthetic_dataset.sql` — la version V4 est **SUPERSEDED** —,
puis alignement V5 : références `…0927 507` (numéro de la dette RGPD **sur la branche C**) →
`…0927 508` (son numéro V4) dans les commentaires des 4 fichiers. `seed_juju_6_mois.sql` : correctif
V4 conservé, en-tête LEGACY du lot C mis à jour (le script compile de nouveau, mais sa cible n'existe
plus). Empreinte du seed Preview de `migration-prefixe-qr-els.test.ts` mise à jour (aucun préfixe QR
dans l'ancienne ni la nouvelle version).

## 4. Migrations

Dernière migration **réelle** de V4 : `20260927100000_elsatia_identity_broker`. Numéros historiques des
lots, tous bâtis sur V3 ou un ancêtre de V4 :

- `20260927000901` (A) est **antérieur** à `20260927100000` : appliqué après coup sur une base V4, il
  serait hors séquence ;
- `20260927000508` (B) **collisionne** avec `…0927 508` (dette RGPD, V4) ;
- `20260927000506` (D) **collisionne** avec `…0927 506` (ordre Stripe, V4).

Aucun numéro n'est donc conservé : les trois sont renumérotés **après** `20260927100000`, dans l'ordre
de la mission (contenu identique hors en-tête, sauf l'ajout D-01 §6).

| BRANCH | OLD_VERSION | V5_VERSION | DEPENDENCY | STATUS |
|---|---|---|---|---|
| `claude/vibrant-darwin-b4gc9n` (Relevé Lot 5) | `20260927000901` | **`20260928000101`** | `…0927 601-801` (Relevé Lots 2-4 : `tools_releves_*`, `tools_releve_creer_version` de `…602`, contrainte du journal de `…602`) | NEW, **RENUMÉROTÉE** (hors séquence) |
| `claude/quirky-volta-b64l62` (Stripe Resubscription) | `20260927000508` | **`20260928000201`** | `…0927 506` (contrat d'ordre, RPC facture), `…0927 507` (essai borné) | NEW, **RENUMÉROTÉE** (collision RGPD `…508`) |
| `claude/relaxed-carson-way87a` (Réserves D-01) | `20260927000506` | **`20260928000301`** | `…0906 268` (`reserves_acteur_courant`), `…0926 503` (gardes R-01..R-05), `…0927 402` (`reserves_contacts`, ajoutée à la garde) | NEW, **RENUMÉROTÉE** (collision Stripe `…506`) + garde étendue |
| `claude/adoring-hawking-yke3o0` (Seeds) | — | — | — | aucune migration |

Redéfinitions croisées vérifiées : `reserves_acteur_courant` n'est redéfinie que par `…0906 268` puis
`…0928 301` (aucune version V4 intermédiaire écrasée) ; `tools_releve_creer_version` par `…601`, `…602`
puis `…0928 101` (aucune redéfinition en `…701`/`…801`) ; les 3 fonctions de B sont nouvelles. Les trois
migrations V5 touchent des objets disjoints.

`git diff origin/integration/elsatia-canonical-train-v4 -- supabase/migrations` : **3 ajouts, 0
modification**. `npm run verify:migrations` : **355 valides**, noms et horodatages uniques ; cibles :
partagé 355 · Studio dédié 11 (inchangé).

Références alignées : `packages/releve-domain` (plan, mémoire, parité SQL), `supabase-plan-repository.ts`,
`suspension-hote.ts`, webhook Stripe (+ test), `stripe-resubscription-concurrency.sh`,
`stripe-reabonnement.spec.ts`, en-têtes des 3 suites pgTAP. Les rapports de lot (historiques)
gardent leurs numéros d'origine.

## 5. Relevé & Métré Lot 5

Intégré tel que qualifié : plan 2D par étage (`tools_releves_plans`), murs (création, longueur,
angle, glisser point/mur, redresser, aligner, fusionner, scinder), accrochage (extrémité,
vertical/horizontal, guides), **pièces fermées** (faces planaires, surface calculée par le serveur),
**ouvertures** (porte, fenêtre, baie, libre, portées par un mur — fondation), édition, **undo/redo**
(boutons et Ctrl+Z, restauration serveur), **corrections** (plan corrigé dérivé, lignée `origineId`),
**repères photo** (PhotoAnchor sur point du plan et sur mur), **versions** (plan figé immuable,
instantané de relevé incluant les plans), export **SVG**.

| Exigence | Preuve V5 |
|---|---|
| Lot 5 | pgTAP `lot5_plan_2d` **67/67** ; Playwright Lot 5 **17/17** ; Vitest Tools 2 078, `releve-domain` (plan, parité SQL) |
| Lots 2/3/4 préservés | pgTAP Relevé ×7 propres (358, identiques à V4) ; Playwright Lots 2/3/4 **29/29** |
| Relevé V4 existant | upgrade §10 : murs V4 **adoptés** par le plan initial, équipement non adopté, journal « plan », version V4 figée intacte, photos et objets Storage intacts |
| Atelier | Playwright non-régression **6/6** (tracé libre, pan, zoom, pincement, arches, rosaces) |
| Non commercial | DB verify 22 inchangé (borné aux 11 tables V4) + **26** (plan 2D : RLS, écriture par RPC seule, RPC fermées à `anon`) |

## 6. Réserves D-01 : hôte suspendu → intervenant externe en lecture seule

Intégré : `reserves_hote_ecriture_ouverte` (prédicat tenant non exposé), `reserves_acteur_courant`
refuse (42501, indice `RESERVES_HOTE_SUSPENDU`), trigger de garde **en base** sur les tables de l'hôte,
lecture strictement inchangée, bandeau et actions masquées côté app, routes hors-ligne avec motif.

**Adaptation V5** : la branche D, bâtie sur V3, gardait 10 tables. V4 a ajouté une table de l'hôte,
`reserves_contacts` (GP ↔ Réserves, `…0927 402`). Ses policies la réservent déjà aux membres de
l'hôte ; la garde y est posée **par cohérence de défense en profondeur** → **11 tables** (pgTAP 8.06
ajusté, **8.06b** ajouté ; DB verify 25 ; plan pgTAP 96 → 97). Le trigger laisse passer les membres de
l'hôte : la synchronisation GP → Réserves (écrite par un membre de l'hôte) n'est pas affectée —
`reserves_gp_integration_completion_v1` **106/106** sur V5.

| Exigence | Preuve V5 |
|---|---|
| Lecture conservée | pgTAP `reserves_host_suspension_policy_v1` **97/97** (§2 : même `session_id`, empreinte de toute la vue identique) ; upgrade §10 D02-D05 |
| Mutations bloquées **en base** | pgTAP §3-§4 ; upgrade D06-D11 (commentaire, acceptation, demande de levée refusés ; aucune écriture fantôme) |
| Session existante | pgTAP (`session_id` constant §1 → §9) ; upgrade : même session JWT avant/après ; Playwright D-01 **7/7** (un seul contexte navigateur) |
| Offline replay | pgTAP §5 ; upgrade **D07** : mutation hors-ligne appliquée **sur V4 avant la suspension**, rejouée après l'upgrade → refusée ; **D12** : hôte rétabli → rejeu idempotent (même conversation, non dupliqué) |
| Rétablissement | pgTAP §9 ; upgrade D13-D14 (écriture rendue sans reconnexion, intervenant inchangé) |

Seed : le décor e2e `prepare-reserves-suspension-hote.sql` consommait un numéro du compteur global
d'entreprises à chaque rejeu (`INSERT … ON CONFLICT DO NOTHING`, défaut corrigé partout ailleurs par
le lot C) : insertion des seules organisations absentes (V5), rejeu ×3 sans dérive (§7).

## 7. Seeds

Hardening complet du lot C intégré ; registre `scripts/seeds/registry.mjs` complété pour tout script
de données V4/V5 apparu depuis sa branche :

| Script | Origine | Classement V5 | Exécution |
|---|---|---|---|
| `scripts/e2e/prepare-reserves-suspension-hote.sql` | D | CI_ONLY, dans la chaîne `e2e-reserves` | ×3, sans dérive (après correctif §6) |
| `scripts/e2e/prepare-gp-reserves-integration.sql` | V4 (GP ↔ Réserves) | CI_ONLY, `e2e-gp-reserves` | ×1 (décor à usage unique : base reconstruite par sa pile ; déclaré `idempotent: false`) |
| `scripts/local-postgres-bootstrap/releve_e2e_seed.sql` | V4 (Relevé) | CI_ONLY, `e2e-releve` | ×1 (idem) |
| `upgrade_v3_v4_seed_complement.sql`, `upgrade_v4_v5_seed_complement.sql` | V4, V5 | CI_ONLY, couverture `upgrade-harness` | par `upgrade-v4-v5.sh` (§10) — ils écrivent l'état d'une base **antérieure**, jamais une base fraîche |

| Porte | Résultat V5 |
|---|---|
| `npm run test:seeds` | ✅ **48/48** (registre complet, aucun BROKEN/UNKNOWN, contournements déclarés) |
| `npm run verify:seeds` (base fraîche **355**) | ✅ **`ALL ACTIVE SEEDS QUALIFIED — 16/16 seeds qualifiés sur 355 migrations`** (run final complet, après correctifs ; un premier run avait signalé les 4 entrées de registre V5 corrigées ci-dessus, les 12 seeds du lot C étant déjà QUALIFIED) |
| Preview year | ✅ QUALIFIED : 3 runs, empreintes identiques, reprise après interruption |
| Pilot | ✅ QUALIFIED : 3 runs + nettoyage → reseed |
| DR | ✅ QUALIFIED : rejeu **355/355** migrations, seed synthétique, sauvegarde/restauration, 07/08 |
| 5 ans (+ tous onglets, suivi terrain) | ✅ QUALIFIED ×3 |
| Colors | ✅ QUALIFIED ×3 (`e2e-colors`) |
| Réserves | ✅ QUALIFIED ×3 (`e2e-reserves`, dont décor D-01) |

## 8. Stripe Resubscription

Intégré **après** Ordering et Trial Sync (V4) : la migration `…0928 201` ne modifie aucune signature
`…506`/`…507` ; la RPC facture v2 enveloppe le contrat 506 sous le même verrou de ligne.

| Exigence | Preuve V5 |
|---|---|
| Same customer | pgTAP `stripe_resubscription_flow_v1` **99/99** ; upgrade **S02** (autre client → 42501), **S04** |
| Aucun nouvel essai | pgTAP ; upgrade **S07** (fenêtre close, jamais prolongée) ; concurrence R5 |
| Portal first | Vitest `stripe-reabonnement` (parcours par statut : réactivable → Portail, jamais Checkout) ; Playwright **6/6 ×2** (annulé, résiliation programmée → Portail, échec, paiement requis, droits, retours Checkout) |
| Anti-double subscription | upgrade **S01** (courante active → refus) ; concurrence **R2** : 20 subscriptions différentes → **1** gagne, 19 × 42501 ; Vitest `stripe-checkout-exclusivite` |
| Old invoice isolation | upgrade **S08** (facture tardive de l'ancienne : `sans_effet`), **S09** (inconnue : `differe`), **S11** (anciennes factures V4 inchangées) ; concurrence R3 |
| Entitlements conditionnels | upgrade **S06**, **S10** (rattacher n'écrit aucun droit) ; concurrence R4 (droits rendus par `invoice.paid` seul) |
| Non-régression Ordering / Trial | pgTAP ordering **137/137**, trial **82/82**, checkout **24/24** ; concurrence ordering **15/15**, essai **7/7** |

Concurrence réelle sur V5 (`stripe-resubscription-concurrency.sh`, 20 sessions) : **20/20**.

## 9. Fresh DB

`scripts/local-postgres-bootstrap/rebuild_db.sh v5_fresh` : **355/355 migrations, 0 erreur**
(PostgreSQL 16.13 neuf, 19 s). V4 rejoué dans les mêmes conditions : 352/352.

## 10. Upgrade V4 → V5

Harnais **nouveau et reproductible** : `scripts/qualification/upgrade-v4-v5.sh`.

1. Base V4 **avec historique**, comme une base réelle : migrations V3 (340) → jeu V3 chargé avec les
   fichiers **de la ref V3** (fixtures RGPD, recette Réserves, pilote GP, Colors, compléments V1→V2,
   V2→V3) + complément V3→V4 de la ref V4 (Stripe, commandes écrites à leur statut) → 12 migrations
   V4 (352) ;
2. données de l'ère V4 : décor GP ↔ Réserves (ref V4), décor D-01 (hôte H / intervenant externe S),
   nouveau `upgrade_v4_v5_seed_complement.sql` : relevé Lots 2-4 (chantier, bâtiment, 2 étages, zone,
   pièces, 2 murs, équipement, 3 photos + 6 objets Storage, version figée), 2 réserves de H attribuées
   à S, S agit (acceptation, commentaire hors-ligne à clé d'origine), **puis H est suspendu** et S
   écrit encore (permis sur V4 : c'est l'état réel d'une base V4), 2 anciennes factures de la
   subscription terminée de « UPG4 annulé » ;
3. instantané → **3 migrations V5** → instantané → comparaison ; schéma et ACL comparés au fresh V5 ;
4. **35 contrôles métier** pgTAP sur la base upgradée (transaction annulée).

Jeu : 52 utilisateurs, 267 tables.

| Contrôle | Résultat |
|---|---|
| Application des 3 migrations V5 | ✅ 0 erreur |
| Row counts (267 tables public/platform/auth/storage) | ✅ **0 écart** ; 2 tables nouvelles, vides (`tools_releves_plans`, `stripe_subscriptions_remplacees`) |
| Checksums (76 tables métier, colonnes V4) | ✅ **76/76 identiques** — dont factures, devis, commandes, entitlements, Colors, Réserves (réserves, photos, messages, contacts, mutations), **Relevé** ×10 (éléments, médias, versions, journal…), **Stripe** (`factures_abonnement`, journaux d'ordre et d'essai, `abonnement_evenements`) |
| États métier | ✅ `entreprises` identique (statuts d'abonnement, essais, H suspendu) |
| RLS — flags | ✅ 0 table existante modifiée ; 2 tables nouvelles, toutes RLS |
| Policies | ✅ 637 → 639 : **0 supprimée, 0 modifiée**, 2 ajoutées (tables nouvelles) |
| RLS — sonde réelle (51 utilisateurs × 26 tables, `set local role authenticated`) | ✅ **0 écart / 1 326 cellules** |
| Grants | ✅ 0 retiré/modifié, 0 ajouté sur table existante ; 3 sur tables nouvelles |
| EXECUTE — fonctions existantes | ✅ 0 modifié, 0 supprimé ; 19 nouvelles dont 11 exécutables par l'app : 6 par `authenticated` seul (RPC plan 2D ×3, lecture seule D-01 ×2, état de reprise) et 5 aussi par `anon` : validateurs `tools_releve_plan_*` **`IMMUTABLE`, non `SECURITY DEFINER`**, sans accès aux tables (même cas que les 4 utilitaires de V4) |
| Entitlements | ✅ checksums identiques (`acces_applications_entreprises`, `entitlements_utilisateurs_elsatia`, `habilitations_applications_utilisateurs`) |
| Plans / photos | ✅ R01-R09 (plan 2D sur relevé V4, photos et Storage intacts) ; plans Réserves et GP inchangés (checksums) |
| Stripe | ✅ S01-S11 |
| Réserves | ✅ D01-D14 (+ D12b) |
| Schéma upgradé vs fresh V5 (`pg_dump -s`, 29 995 lignes) + ACL (1 929) | ✅ **identiques** |
| **Contrôles métier** | ✅ **35/35** |

## 11. pgTAP complet

Une base neuve par fichier (`scripts/qualification/pgtap-run-v3.sh`), V4 et V5 dans les mêmes conditions :

| | Fichiers | Propres | ok | not ok |
|---|---|---|---|---|
| V4 (352) | 146 | 137 | 4 018 | 14 |
| **V5 (355)** | **149** | **140** | **4 281** | **14** |

Comparaison fichier par fichier sur les 146 fichiers communs : **résultats identiques, 0 régression**.
3 suites nouvelles, **toutes propres** : `elsatia_tools_releve_metre_lot5_plan_2d` **67/67**,
`stripe_resubscription_flow_v1` **99/99**, `reserves_host_suspension_policy_v1` **97/97**.
Les 9 fichiers non propres sont **exactement ceux de V4** : 7 suites Studio du projet partagé
(« inscription fermée »), `platform_stripe_state_attestation_r72` (pgsodium réel absent de l'amorce),
`elsatia_tools_cloud_sync_entitlement_closure_v1` (erreurs d'amorce, 8/8 assertions exécutées ok).

## 12. Applications

| App | typecheck | lint | Vitest | build |
|---|---|---|---|---|
| Gestion Pro (racine, + paquets `releve-domain`, `elsatia-identity`) | ✅ | ✅ 0 erreur (15 avertissements, comme V4) | ✅ **2 290** passés, 32 ignorés (185 fichiers) | ✅ `next build` |
| Tools | ✅ | ✅ | ✅ **2 078** (182 fichiers) | ✅ (`NEXT_PUBLIC_TOOLS_ENV=local`, + service worker) |
| Colors | ✅ | ✅ | ✅ **431** (39) | ✅ (`ELSATIA_APPLICATION_ENV=local`) |
| Réserves | ✅ | ✅ | ✅ **186** (14) | ✅ (`ELSATIA_APPLICATION_ENV=local`) |
| Studio | ✅ | ✅ | ✅ **281** (18) | ✅ |

Autres portes : `verify:migrations` ✅ (355) · `verify:train-expectations` ✅ · `test:preview-pack` ✅
**28/28** · `test:seeds` ✅ 48/48 · `test:migration-targets` ✅ 7/7 · `test:preflight-preview` ✅ 5/5 ·
`test:stripe-ordering-script` ✅ 5/5 · `test:stripe-trial-script` ✅ 10/10 ·
`test:stripe-resubscription-script` ✅ 6/6 · `verify:env-manifest` ✅ (14 DECISION_REQUIRED non
bloquantes) · `test:env-manifest` ✅ 67/67 · `verify:secrets` ✅ · inventaire d'environnement
Preview inchangé.

Manifeste : `SEEDS_DR_PGPASSWORD` et `DR_PGPASSWORD` (harnais des seeds, lot C) n'étaient pas
déclarés → `verify:env-manifest` en erreur sur la fusion ; déclarés (outillage local/test, secrets,
application `e2e`).

## 13. Playwright

Playwright 1.62.1, Chromium 1194 (`executablePath` explicite), comme V4. Chaque pile tourne sur une
base PostgreSQL 16 **neuve aux 355 migrations V5**. Réserves et Gestion Pro sont compilés (`next
build` + `next start`) ; Tools tourne en `next dev --webpack`, comme dans les rapports Relevé. Aucune
modification de spec ni de harnais de recette. Les piles sont lancées **l'une après l'autre** (§16).

| Recette | Pile | Référence | **V5** |
|---|---|---|---|
| Relevé Lot 2 | `releve_e2e_stack.sh` : GoTrue v2.196.0 (compilé), PostgREST v12.2.3, mock Storage, seed pilote | 4 | ✅ 4/4 |
| Relevé Lot 3 | idem | 6 | ✅ 6/6 |
| Relevé Lot 4 (photos, annotations, Storage, @perf 200 photos) | idem | 19 | ✅ 19/19 |
| **Relevé Lot 5** (plan 2D : murs, accrochage, pièces, ouvertures, undo/redo, repères photo, conflit, versions, autre tenant, tablette, smartphone, perf 50-500 murs) | idem | 17 | ✅ **17/17** (aussi 17/17 lors d'une première passe isolée) |
| **Atelier** non-régression (tracé libre, pan, zoom, pincement, arches, rosaces) | idem | 6 | ✅ **6/6** |
| **Relevé + Atelier total** (une passe, base neuve) | | 52 | ✅ **52/52** (7,3 min) |
| **Réserves D-01** `reserves-host-suspension.spec.ts` (session existante, API 403, file hors-ligne refusée, rétablissement dans la même session) | `reserves-pile-locale/preparer-base.sh` (décor H/S inclus), passerelle, Réserves :3020 | 7 | ✅ **7/7** |
| Réserves V3 collaboration | idem + V6 charge + `amorcer-recette-v4.mjs` | 1 | ✅ 1/1 |
| Réserves V4 listes/PDF (PDF réel Chromium) | idem | 11 | ✅ 11/11 |
| Réserves V4 mobile hors ligne | idem | 6 | ✅ 6/6 |
| Réserves V5 hors ligne (`--grep-invert "rechargement hors ligne"`, comme V3/V4) | idem | 13 | ✅ 13/13 |
| Réserves V6 sécurité (cross tenant) | idem | 23 | ✅ 23/23 |
| Réserves V6 performance | idem | 5 | ✅ 5/5 |
| **Réserves total** | | 59 (+7 D-01) | ✅ **59/59** + D-01 **7/7** |
| GP ↔ Réserves `gp-reserves-integration.spec.ts` | `gp-reserves-pile-locale/preparer-base.sh`, passerelle, GP :3100, Réserves :3020 | 5/5 ×2 | ✅ **5/5 ×2** (20,6 s ; 18,8 s après remise à zéro de la base, comme en V4) |
| **Stripe réabonnement** `stripe-reabonnement.spec.ts` | pile GP ↔ Réserves, GP :3100, état Stripe projeté en base, clé factice | 6 | ✅ **6/6 ×2** |
| Colors (`colors` + `colors-mobile`) | `colors-pile-locale/preparer-base.sh`, nuancier de recette | 73/73 | ✅ **73/73** |

Variables de recette locales (jamais des secrets réels, aucune écrite dans le dépôt) : Gestion Pro
compilé exige `RATE_LIMIT_HMAC_KEY` en `next start` (sinon 503 fail-closed du limiteur, voulu) ; le
parcours de réabonnement exige un Stripe « configuré » (clé `sk_test_` factice, secret de webhook
factice, 8 `STRIPE_PRICE_*` factices, `ABONNEMENTS_PUBLICS_OUVERTS=true`) — la spec projette l'état
Stripe en base, aucun appel ne réussit ; Colors exige `COLORS_NUANCIER_FICHIER` =
`tests/e2e/fixtures/colors-nuancier-recette.json` et `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Des passages
lancés sans ces variables ont échoué sur ces seules causes (écran d'erreur / 503 au login, offres
masquées, nuancier absent) et ne sont pas comptés.

Premier passage Relevé Lots 2-4 **invalide, non compté** : lancé pendant `verify:seeds`, dont le
drill DR change le mot de passe du rôle global `authenticator` → PostgREST de la pile Relevé coupé
(« password authentication failed », `ECONNREFUSED :3001`), l'UI affichant « Aucune entreprise Tools
active ». Rejoué sur une pile neuve, seule : 52/52. Aucun code modifié entre les deux passes.

## 14. Attendus du train, CI, runbooks

| Élément | V4 | V5 |
|---|---|---|
| Migrations / dernière | 352 / `20260927100000` | **355 / `20260928000301`** (générés, `sync:train-expectations`) |
| DB verify | 23 contrôles | **26** : + 24 réabonnement Stripe, 25 D-01 (11 tables gardées, prédicat non exposé), 26 plan 2D ; 22 borné aux 11 tables Relevé V4 ; lecture dynamique : sur V4 → **NO-GO explicite** sur 24-26 et 2 RPC absentes, sans erreur de script |
| Buckets | 19 | **19** (inchangé : le plan 2D utilise `tools-releves`) |
| Fonctions service-role only | 33 | **35** (+ `relier_subscription_reabonnement_service`, `appliquer_evenement_facture_abonnement_v2_service`) |
| DB verify local | GO | `db-verify.mjs --local-harness --before-owner` sur fresh V5 → **`GO : base Preview conforme.`** (26 contrôles SQL, préflight sécurité 21 contrôles / 0 bloquant, RLS, 19 buckets, 35/35) |
| CI (`ci.yml`) | | union : `verify:train-expectations`, `test:preview-pack`, 3 scripts Stripe (dont réabonnement), **`test:seeds`** (sans base) et job **`seeds`** (harnais réel, PostgreSQL 16) |
| Pack / runbook | ref V4 | ref **`integration/elsatia-canonical-train-v5`**, 35 RPC, périmètre de première Preview inchangé (Studio, worker Studio, Boutique, Stripe Connect OFF) |

## 15. Chiffres historiques V4 (et V3)

Les rapports `ELSATIA_CANONICAL_TRAIN_V4_PREVIEW_CANDIDATE.md` et
`ELSATIA_CANONICAL_TRAIN_V3_FINAL_CONVERGENCE.md` sont **inchangés** (352 / `20260927100000` / 23 ;
340 / `20260926000505` / 17). Deux lots (B, D) réécrivaient le rapport V3 avec les chiffres de leur
train : **non portés**. Garde ajoutée : `train-expectations.mjs` n'écrit **jamais** dans un
`ELSATIA_CANONICAL_TRAIN_*.md` (même porteur d'un marqueur), et un test (`test:preview-pack`) vérifie
les chiffres figés de V4 et l'absence de marqueur actif dans les rapports V3/V4.

## 16. Décisions et constats

| ID | Nature | État | Effet |
|---|---|---|---|
| `DECISION_REQUIRED:V5-MIGRATION-RENUMBERING` | technique | **décidé** (mission) | 3 migrations renumérotées après `20260927100000`, ordre A → B → D ; contenu identique hors en-tête |
| `DECISION_REQUIRED:V5-D01-RESERVES-CONTACTS` | technique | **décidé** (conservateur) | garde D-01 posée aussi sur `reserves_contacts` (11 tables) ; sans effet sur les membres de l'hôte ni sur la synchro GP |
| `DECISION_REQUIRED:V5-SEEDS-PREVIEW-VERSION` | outillage | **décidé** | version du lot C (qualifiée par harnais réel) retenue face au correctif V4 du seed Preview |
| Harnais locaux concurrents | outillage | constat | les rôles PostgreSQL sont globaux au cluster : le drill DR du harnais des seeds change le mot de passe d'`authenticator` et coupe une pile PostgREST en cours (constaté ici) ; exécuter les piles e2e et `verify:seeds` **séquentiellement** |
| `DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT` | juridique | ouvert (hérité V4) | fail-closed, inchangé |
| Stripe Test réel, Storage/GoTrue/e-mail réels, Portail Stripe réel | exécution distante | NOT PROVEN localement (hérité) | à prouver par le pack Preview |

## 17. Reproduire

```bash
git fetch --all --prune && git checkout integration/elsatia-canonical-train-v5 && npm ci
for a in tools colors reserves studio; do npm ci --prefix apps/$a; done
pg_ctlcluster 16 main start ; apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl postgresql-plpython3-16 python3-nacl

scripts/local-postgres-bootstrap/rebuild_db.sh v5_fresh                      # 355/355
scripts/qualification/pgtap-run-v3.sh v5_fresh                               # 140/149 propres (= V4 + 3)
scripts/qualification/upgrade-v4-v5.sh upg_v4_v5 v5_fresh                    # §10, contrôles métier 35/35
scripts/qualification/stripe-resubscription-concurrency.sh <copie v5> 20     # 20/20
SEEDS_DR_PGPASSWORD=… node scripts/seeds/verify-seeds.mjs                    # §7 (seul, sans pile e2e)
npm run typecheck && npm run lint && npm test && npm --prefix apps/studio run test
npm run verify:migrations && npm run verify:train-expectations && npm run test:preview-pack && npm run test:seeds
ELSATIA_PREVIEW_DB_URL=postgresql://…@127.0.0.1/v5_fresh node scripts/preview/db-verify.mjs --local-harness --before-owner
```

## 18. Fichiers V5 (hors lots portés)

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20260928000{101,201,301}_*.sql` | renommées ; `…301` : + `reserves_contacts` |
| `supabase/tests/reserves_host_suspension_policy_v1.test.sql` | 8.06 (11 tables), 8.06b ; en-têtes des 3 suites |
| `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` | contrôles 24-26, 22 borné |
| `scripts/preview/train-expectations.mjs`, `preview-pack.test.mjs` | rapports historiques protégés, 35 RPC |
| `scripts/qualification/upgrade-v4-v5.sh`, `scripts/local-postgres-bootstrap/upgrade_v4_v5_{seed_complement,business_checks}.sql`, `upgrade_snapshot.py` | harnais d'upgrade V4 → V5 |
| `scripts/seeds/registry.mjs`, `registry.test.mjs`, `scripts/e2e/prepare-reserves-suspension-hote.sql` | seeds V4/V5 classés et exécutés ; décor D-01 rejouable |
| `config/env-manifest.json` | variables du harnais des seeds |
| `apps/reserves/src/app/(reserves)/chantiers/[id]/page.tsx` | union GP ↔ Réserves + D-01 |
| `docs/qualification/ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md`, `docs/runbooks/ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md` | ref V5, attendus |
| `src/lib/migration-prefixe-qr-els.test.ts`, `supabase/production/seed_juju_6_mois.sql`, 4 seeds (commentaires `…508`) | alignement |
