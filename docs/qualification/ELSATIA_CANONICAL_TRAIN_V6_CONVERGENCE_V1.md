# ELSATIA — Canonical Train V6 : convergence post-V5 (V1)

| | |
|---|---|
| Date | 2026-09-28 |
| Base | `integration/elsatia-canonical-train-v5` @ `f6399f15` (verdict `CANONICAL TRAIN V5 LOCALLY QUALIFIED` ; 355 migrations, dernière `20260928000301`) — **non modifiée** |
| Branche | `integration/elsatia-canonical-train-v6` (poussée aussi sur la branche de travail `claude/compassionate-galileo-7wdvx5`, même commit) |
| Migrations | **358**, dernière **`20260928000601`** (+3 dans le projet partagé, dont 2 renumérotées et 1 propre à V6 ; aucune migration V5 modifiée) · projet Studio dédié **14** (+3) |
| Moteur | PostgreSQL 16 réel + pgTAP 1.3, amorce `scripts/local-postgres-bootstrap` (sans Docker) ; Node 22 ; Playwright 1.62.1 + Chromium 1194 ; GoTrue v2.196.0 / v2.192.0 compilés, PostgREST v12.2.3 |
| Actions distantes | **Aucune.** Aucune Preview, aucune Production, aucun merge vers `main`, V6 **non déployé**. |

## 0. Verdict

**`__VERDICT__`**

__RESUME__

---

## 1. Lots post-V5 intégrés

| Lot | Branche | Tip | Base de la branche | Verdict d'origine | Intégration V6 |
|---|---|---|---|---|---|
| A. Relevé & Métré Lot 6 | `claude/happy-euler-7vzpgz` | `d734f255` | `d8539d4a` (tip Lot 5, déjà dans V5) | RELEVE METRE LOT 6 LOCALLY QUALIFIED | merge `--no-ff` (6 commits), **sans conflit** (`111af96c`) |
| B. Studio DB Guards & RGPD Foundation | `claude/ecstatic-hawking-2hz6n8` | `fb7082c6` | `f762d613` (port Studio V3, déjà dans V5) | STUDIO DB GUARDS LOCALLY QUALIFIED | merge `--no-ff` (1 commit), **sans conflit** (`24d1a631`) |
| C. RGPD Contract Retention Parameterization V2 | `claude/sharp-knuth-aebwck` | `d01e25e7` | `b7fa9e2c` (tip V4, ancêtre de V5) | RGPD CONTRACT RETENTION TECHNICALLY READY FOR OWNER DECISION | merge `--no-ff` (1 commit), 3 conflits sur fichiers générés (§3) (`52ad7704`) |

Ordre : A → B → C (ordre de la mission), puis commits V6 propres : renumérotation (`f76babc4`),
surface de la pièce (`32d6905e`, §6), attendus du train (`cedd569c`), harnais d'upgrade (`e4f38ebd`),
seeds (`1b9b750d`), CI (`c306f5de`), rapport. Chaque base de branche est un ancêtre de V5 : **aucun
commit de V5 n'est rejoué ni réécrit**.

## 2. Classification par commit

| Commit | Lot | Statut | Note |
|---|---|---|---|
| `f57dfc73` validation serveur des ouvertures, lecture rapide du plan (migration 1001) + pgTAP | A | **NEW** | migration renumérotée `…0928 401` (§4) |
| `23cf9480` domaine des ouvertures, bandes épaisses raccordées (Engine B) | A | **NEW** | `packages/releve-domain`, `thick-strips` |
| `9eac8e98` géométrie bâtiment, ouvertures graphiques, jonctions dans l'éditeur | A | **NEW** | éditeur, SVG, fondation DXF, cibles photo dédoublonnées, lecture optimisée |
| `fa3bfe4d` recette Playwright Lot 6 + adaptation Lot 5 | A | **TEST_ONLY** | |
| `63dd7fb7`, `d734f255` rapport Lot 6 | A | **DOC_ONLY** | historique (numéro d'origine 1001), non réécrit |
| `fb7082c6` garde d'écriture centrale + fondation RGPD Studio | B | **NEW** (migrations dédiées, route, exécuteur, tests) + **TEST_ONLY** (fixtures `studio_{editor,render_engine,templates}` du projet partagé) + **DOC_ONLY** (rapport) | 3 migrations **du projet dédié** uniquement ; aucune migration partagée |
| `d01e25e7` paramétrage de la conservation des contrats (V2) | C | **NEW** (migration `…0928 000100` → **`…0928 501`**, pgTAP, contrôle 14 du DB verify, `purger-entreprise.mjs`, harnais) + **SUPERSEDED** (ses marqueurs `<!--train:…-->` du pack et du runbook, régénérés) + **DOC_ONLY** (décision propriétaire, rapport) | |
| `32d6905e` surface de la pièce synchronisée (V6) | V6 | **NEW** | décision produit §6 |

Aucun commit **IDENTICAL** (aucun lot n'était déjà contenu dans V5), aucun **CONFLICT** non résolu,
aucun **DO_NOT_PORT** (aucun lot ne touchait un rapport de train historique).

## 3. Conflits

| Fichier | Lots | Statut | Résolution |
|---|---|---|---|
| `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` | V5, C | **CONFLICT** (bloc `attendu_train` généré) | version V5 conservée puis régénérée ; **contrôle 14 V2 conservé** (aucune durée activée = seul état accepté) |
| `ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md`, `ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md` | V5, C | **CONFLICT** (marqueurs) | version V5 conservée puis régénérée (`sync:train-expectations`) ; ref V6 |

## 4. Migrations

Dernière migration **réelle** de V5 : `20260928000301_reserves_hote_suspendu_lecture_seule_v1`.

- `20260928000100` (C) est **antérieur** à `…0928 301` : appliqué après coup sur une base V5, il
  serait hors séquence → renuméroté ;
- `20260928001001` (A) est postérieur, mais porte un numéro de plage de branche (« 10xx réservée
  au Lot 6 ») : renuméroté pour former un bloc V6 contigu, dans l'ordre de la mission ;
- les 3 migrations Studio (B) appartiennent au **projet dédié** (`apps/studio/supabase/migrations`,
  cible contrôlée par `migration-targets.json`) : déjà postérieures à la dernière migration réelle de
  V5 (partagée `…0928 000301` et dédiée `20260927110000`), dans la convention horaire de ce projet,
  **conservées**.

| SOURCE | OLD_VERSION | V6_VERSION | DEPENDENCY | STATUS | REASON |
|---|---|---|---|---|---|
| `claude/happy-euler-7vzpgz` (Relevé Lot 6) | `20260928001001` | **`20260928000401`** | `…0928 101` (Lot 5 : `tools_releves_plans`, corps de `tools_releve_plan_enregistrer` redéfini à l'identique + contrôles ; corps V5 vérifié identique à celui de la branche Lot 5) | NEW, **RENUMÉROTÉE** | bloc V6 contigu après `…0928 301` |
| `claude/sharp-knuth-aebwck` (RGPD V2) | `20260928000100` | **`20260928000501`** | `…0926 502/504/506` (instantanés, politique, purge), `…0927 508` (dette résiduelle) | NEW, **RENUMÉROTÉE** | antérieure à la dernière migration V5 |
| V6 (surface pièce) | — | **`20260928000601`** | `…0927 701` (garde Lot 3 redéfinie à l'identique + exception), `…0928 101`, `…0928 401` | NEW | décision produit §6 |
| `claude/ecstatic-hawking-2hz6n8` (Studio, projet dédié) | `20260928100000`, `…110000`, `…120000` | **inchangées** | `20260926120000` (identité Studio), `20260927110000` (admission) | NEW, **CONSERVÉES** | projet dédié, déjà après V5 |

Redéfinitions croisées vérifiées : `tools_releve_plan_enregistrer` n'est redéfinie que par `…0928 101`
puis `…0928 401` ; `tools_releve_structure_garde` que par `…0927 701` puis `…0928 601` ; les fonctions
RGPD V2 ne sont redéfinies par aucune migration V5. Les trois migrations V6 touchent des objets
disjoints (hors ces deux chaînes voulues).

`git diff origin/integration/elsatia-canonical-train-v5 -- supabase/migrations apps/studio/supabase/migrations` :
**6 ajouts, 0 modification**. `npm run verify:migrations` : **358 valides** ; cibles : partagé 358 ·
Studio dédié 14 (9 copies gelées + 5 dédiées). Références alignées : `sql-parity.test.ts`, en-têtes pgTAP,
`purger-entreprise.mjs`, DB verify, `rgpd-contract-retention-v2.sh`. Rapports de lot : numéros d'origine.

## 5. Relevé & Métré Lot 6

Intégré tel que qualifié : murs épais (Engine B, bandes raccordées à l'épaisseur réelle), faces
intérieures / extérieures, jonctions **L / T / X** sans chevauchement ni surépaisseur, ouvertures
graphiques **porte / fenêtre / baie** posées au clic, contraintes au mur (glisser, redimensionner,
l'ouverture suit le mur déplacé / allongé / raccourci / pivoté), validations client **et serveur**
(largeur nulle, plus large que le mur, hors du mur, chevauchement, hauteur / allège incohérentes →
22023, lot atomique), attributs de menuiserie, export **SVG**, fondation **DXF** (écrite et testée, non
branchée), optimisations de performance (500 murs + 300 ouvertures), sélecteur de cible photo
dédoublonné (un mur par lignée), lecture du plan optimisée (`tools_releve_plan_elements`).

| Exigence | Preuve V6 |
|---|---|
| Lot 6 | pgTAP `lot6_geometrie_batiment` **40/40** ; Playwright Lot 6 **16/16** ; Vitest Tools 2 118, `releve-domain` (plan Lot 6, parité SQL) |
| Lots 2/3/4/5 préservés | pgTAP Relevé ×8 propres, identiques à V5 ; Playwright Lots 2/3/4/5 **46/46** |
| Plan V5 existant | upgrade §10 R01-R08 : plan figé V5 (empreinte vérifiable), ouverture « Lot 5 » valide, enrichie des attributs Lot 6, ouverture trop large refusée, photo sur mur conservée |
| Atelier | Playwright non-régression **6/6** |

## 6. Surface de la pièce — décision produit implémentée

**Implémentée sans affaiblir le Lot 3** (migration `20260928000601`, pgTAP
`elsatia_tools_releve_surface_piece_sync_v1` **32/32**).

| Règle de la décision | Mise en œuvre |
|---|---|
| Jamais d'écriture directe client | La garde Lot 3 `tools_releve_structure_garde` est redéfinie **à l'identique**, plus une exception étroite : une autorisation pour (transaction courante `txid`, pièce) dans `platform.tools_releve_surface_autorisations` — table RLS **sans aucun droit** pour anon / authenticated / service_role, déposée et retirée par la seule fonction de synchronisation (SECURITY DEFINER, **non exécutable** par l'application). Même autorisée, seules `surface_calculee_mm2` et `calcule_le` changent (volume réservé). Même motif que l'autorisation liée au txid du RGPD V2. pgTAP G1-G5 ; upgrade Y07 |
| Source = plan valide le plus récent | plan de **référence mesuré** de l'étage : le plus récent (numéro) **non supprimé**, figé ou non, **hors `projete`** ; surface **recalculée** depuis les points du contour (formule du lacet), jamais lue du client. pgTAP Y2-Y7, F1-F6 ; upgrade Y02, Y08 |
| Serveur uniquement | déclencheur `AFTER INSERT OR UPDATE OF contours, deleted_at` sur les plans (création dérivée, `tools_releve_plan_enregistrer`, suppression / restauration, cascade d'étage) |
| Audit | journal du relevé : entité `piece`, champs `calcule_le, surface_calculee_mm2`, détails `{source: plan, plan_id, plan_numero, plan_revision, plan_fige, avant_mm2, apres_mm2}` (+ ligne du journal générique) ; auteur = utilisateur qui a enregistré le plan. pgTAP Y5 ; upgrade Y04 |
| Version figée jamais modifiée | seule la ligne vivante de la pièce change ; plans figés, éléments et instantanés `tools_releves_versions` jamais écrits (pgTAP F4-F5, upgrade Y05-Y06, contenu + empreinte comparés) |
| Absence de plan ≠ effacement | pas de plan de référence, pas de contour pour la pièce, surface nulle, pièce ou relevé supprimé → **aucune écriture**, valeur existante conservée (pgTAP Y1, Y4, Y8-Y9, P1 ; upgrade Y03) |
| Protections Lot 3 | pgTAP Lot 3 **70/70** et Lots 2/4/5/6 inchangés ; RLS de lecture inchangée (P3-P4) ; idempotence (P5) |

Recette réelle : pendant la passe Playwright Lot 6 (§13), la détection de pièce a écrit
**10,83 m²** dans la fiche du Séjour, par le serveur (journal source plan), 0 autorisation résiduelle.

Décisions conservatrices prises (voir §16) : plan `projete` exclu de la source ; **aucune reprise
de données à l'upgrade** (les pièces V5 reçoivent leur surface au prochain enregistrement de
contour) ; volume non calculé. Effet de bord documenté : la synchronisation fait avancer la révision
de la pièce ; une fiche pièce ouverte avant l'enregistrement du plan signale donc un conflit à sa
prochaine sauvegarde automatique (comportement existant de l'autosave : réappliquer sa saisie, qui ne
peut pas toucher la surface).

## 7. Studio

Intégré : garde d'écriture centrale en base (`studio_guard.assert_write`, 24 tables), **22 RPC
authentifiées** protégées (lecture seule refusée en base, 42501), chemins système bornés (identity,
media, workers, rgpd_erasure), `service_role` sans écriture de table directe, gardes **Storage**
(upload lié à une réservation vivante, suppression des seuls objets non référencés), **fondation
d'effacement RGPD** (demande dans la transaction du cycle de vie, exécution `off` par défaut, aucune
durée inventée), route `/api/elsatia/erasure`, tests B+I1.

**Studio reste OFF pour la première Preview** : aucune migration Studio dans le projet partagé,
variables de la GP Preview inchangées (vides), `STUDIO_ACCESS_MODE=closed` inchangé, pack et runbook :
périmètre de première Preview inchangé (Studio, worker Studio, Boutique, Stripe Connect **OFF**).
DB verify 23 (identité inerte) toujours OK ; upgrade I01-I02.

## 8. RGPD contrats — paramétrage seul

Intégré **uniquement le paramétrage** (`20260928000501`) : durée, point(s) de départ (liste fermée de
7 règles, repli facultatif), choix explicite des photos, état effectif, instantanés figés, purge des
échus contrôlée, simulation propriétaire, rapports d'exploitation.

| Exigence | Preuve V6 |
|---|---|
| **Aucune durée activée** | DB verify **14** ; upgrade G02 (`duree_conservation` nulle) |
| **Aucun point de départ choisi** | DB verify **28** (nouveau) ; upgrade G02 (`regles_depart`, repli nuls) |
| **Aucun sort des photos choisi** | DB verify **28** ; upgrade G02 (`choix_photos_explicite = false`) |
| **Fail-closed** | état `duree_requise` (G01) ; purge des échus refusée, cause nommée (G04) ; ancien appel à 4 arguments n'active rien (G05 → `parametres_requis`) ; activation réservée au propriétaire (G06) ; pgTAP `rgpd_conservation_contrats_parametrage_v2` **102/102**, suites RGPD V3/V4 propres |
| Décision V3 conservée | upgrade G03 (`decision_ref` inchangée), checksums `platform.purge_politique_contrats*` identiques |

L'ancienne signature à 4 arguments de `platform.definir_politique_purge_contrats` est remplacée par
la signature à 6 arguments avec valeurs par défaut (appel à 4 arguments toujours accepté, G05) ; les
deux sont fermées à anon / authenticated / service_role. 2 RPC d'exploitation ajoutées à la liste
service-role only (§14).

## 9. Fresh DB

`scripts/local-postgres-bootstrap/rebuild_db.sh v6_fresh` : **358/358 migrations, 0 erreur**
(PostgreSQL 16 neuf, 23 s). V5 rejoué dans les mêmes conditions : 355/355. Projet Studio dédié :
**14/14** (`dedicated-db-check.sh`).

## 10. Upgrade V5 → V6

Harnais **nouveau et reproductible** : `scripts/qualification/upgrade-v5-v6.sh`.

1. Base V5 **avec historique** : migrations V3 (340) → jeu V3 (ref V3) + complément V3→V4 (ref V4)
   → 12 migrations V4 (352) → données de l'ère V4 (décor GP ↔ Réserves, décor D-01 et complément V4→V5
   de la ref V5 : Relevé Lots 2-4, hôte suspendu, factures Stripe) → 3 migrations V5 (355) ;
2. données de l'ère V5, nouveau `upgrade_v5_v6_seed_complement.sql` : plan 2D initial (adopte les
   murs V4) + 2 murs + ouverture « Lot 5 » + contour du Séjour, **plan figé**, plan **corrigé dérivé**,
   photo rattachée à un mur du plan, **réabonnement Stripe** (même client, ancienne subscription
   historisée) ;
3. instantané → **3 migrations V6** → instantané → comparaison ; schéma et ACL comparés au fresh V6 ;
4. **28 contrôles métier** pgTAP sur la base upgradée (transaction annulée).

Jeu : 52 utilisateurs, 269 tables. Instantané étendu (V6) : plans, réabonnement, webhooks Stripe,
identité / Studio du projet partagé, tables RGPD de `platform` (qualifiées par schéma) ; sonde RLS
étendue aux plans, pièces et versions.

| Contrôle | Résultat |
|---|---|
| Application des 3 migrations V6 | ✅ 0 erreur |
| Row counts (269 tables public/platform/auth/storage) | ✅ **0 écart** ; 2 tables nouvelles, vides (`platform.purge_autorisations_echeance`, `platform.tools_releve_surface_autorisations`) |
| Checksums (91 tables métier, colonnes V5) | ✅ **91/91 identiques** — dont GP (factures, devis, planning, pointage…), entitlements ×3, Colors, Réserves, **Relevé** ×11 (plans, pièces, éléments, médias, versions, journal…), **Stripe** (factures d'abonnement, ordre, essai, subscriptions remplacées, webhooks), identité, Studio partagé ×5, **RGPD** ×5 (`platform`) |
| États métier | ✅ `entreprises` identique (statuts d'abonnement, H suspendu, réabonnement) |
| RLS — flags | ✅ 0 table existante modifiée |
| Policies | ✅ 639 → 639 : **0 supprimée, 0 modifiée, 0 ajoutée** |
| RLS — sonde réelle (51 utilisateurs × 29 tables) | ✅ **0 écart / 1 479 cellules** |
| Grants | ✅ 0 retiré/modifié, 0 ajouté (les 2 tables nouvelles n'ont **aucun** droit d'API) |
| EXECUTE — fonctions existantes | ✅ 0 modifié ; 1 remplacée (signature à 4 arguments RGPD → 6 avec défauts, §8) ; 18 nouvelles dont 3 exécutables par l'app : `tools_releve_plan_elements` (authenticated seul, contrôle explicite des droits) et 2 validateurs purs `IMMUTABLE` non `SECURITY DEFINER` (authenticated / service_role, **pas anon**) |
| Entitlements | ✅ checksums identiques |
| Plans / ouvertures / photos | ✅ R01-R08 |
| Surface pièce | ✅ Y01-Y08 |
| RGPD | ✅ G01-G06 |
| Stripe / Réserves / identité | ✅ S01-S02, D01-D02, I01-I02 |
| Schéma upgradé vs fresh V6 (`pg_dump -s`, 30 517 lignes) + ACL (1 953) | ✅ **identiques** |
| **Contrôles métier** | ✅ **28/28** |

Studio (projet dédié) : la chaîne V5 (11) et la chaîne V6 (14) sont rejouées à froid ; les 3
migrations dédiées sont additives (aucune table non Studio, suites V5 inchangées, §14).

## 11. pgTAP complet

Une base neuve par fichier (`scripts/qualification/pgtap-run-v3.sh`), V5 et V6 dans les mêmes
conditions :

| | Fichiers | Propres | ok | not ok |
|---|---|---|---|---|
| V5 (355) | 149 | 140 | 4 281 | 14 |
| **V6 (358)** | **152** | **143** | **4 457** | **14** |

Comparaison fichier par fichier sur les 149 fichiers communs : **0 régression**.
- 3 suites nouvelles, **toutes propres** : `elsatia_tools_releve_metre_lot6_geometrie_batiment` **40/40**,
  `rgpd_conservation_contrats_parametrage_v2` **102/102**, `elsatia_tools_releve_surface_piece_sync_v1` **32/32** ;
- `rgpd_politique_contrats_conserver_minimise_v3` : 28/28 → **30/30** (2 assertions ajoutées par le lot C) ;
- `studio_editor`, `studio_render_engine`, `studio_templates` : non propres **comme en V5**, même
  cause (« Inscription fermée » sur le projet partagé) ; +2 lignes « transaction aborted » chacune,
  dues aux 2 `SET` de fixture ajoutés par le lot B après la première erreur — aucune assertion en moins ;
- les 9 fichiers non propres sont **exactement ceux de V5** : 7 suites Studio du projet partagé,
  `platform_stripe_state_attestation_r72` (pgsodium réel absent de l'amorce),
  `elsatia_tools_cloud_sync_entitlement_closure_v1` (erreurs d'amorce).

## 12. Applications

| App | typecheck | lint | Vitest | build |
|---|---|---|---|---|
| Gestion Pro (racine, + `releve-domain`, `elsatia-identity`) | ✅ | ✅ 0 erreur (15 avertissements, comme V5) | ✅ **2 300** passés, 36 ignorés (188 fichiers ; +4 ignorés = tests réels identité du lot B, exécutés §14) | ✅ `next build` |
| Tools | ✅ | ✅ | ✅ **2 118** (184 fichiers) | ✅ (`NEXT_PUBLIC_TOOLS_ENV=local`) |
| Colors | ✅ | ✅ | ✅ **431** (39) | ✅ (`ELSATIA_APPLICATION_ENV=local`) |
| Réserves | ✅ | ✅ | ✅ **186** (14) | ✅ (`ELSATIA_APPLICATION_ENV=local`) |
| Studio | ✅ | ✅ | ✅ **291** (19) | ✅ (route `/api/elsatia/erasure` construite) |

Autres portes : `verify:migrations` ✅ (358 · dédié 14) · `verify:train-expectations` ✅ ·
`test:preview-pack` ✅ **29/29** · `test:seeds` ✅ 48/48 · `test:migration-targets` ✅ 7/7 ·
`test:preflight-preview` ✅ 5/5 · `test:stripe-ordering-script` ✅ 5/5 · `test:stripe-trial-script` ✅
10/10 · `test:stripe-resubscription-script` ✅ 6/6 · `verify:env-manifest` ✅ (14 DECISION_REQUIRED non
bloquantes, inchangé) · `test:env-manifest` ✅ 67/67 · `verify:secrets` ✅.

## 13. Playwright

Playwright 1.62.1, Chromium 1194 (`executablePath` explicite). Chaque pile tourne sur une base
PostgreSQL 16 **neuve aux 358 migrations V6**, piles lancées **l'une après l'autre**. Aucune
modification de spec ni de harnais de recette.

__PLAYWRIGHT__

## 14. Chaîne dédiée Studio

| Contrôle | Résultat V6 |
|---|---|
| `apps/studio/scripts/dedicated-db-check.sh` (PG16 vierge, chaîne dédiée seule) | ✅ **14 migrations**, **0 table GP** ; pgTAP **543 ok, 0 échec** : garde d'écriture **63** (nouveau), admission 10, RGPD effacement **71** (nouveau), fondation 58, signup 14, analyse 45, éditeur 22, upload 40, gestion 105, rendu 45, templates 18, timeline 52 (V5 : 11 migrations, 409 ok, suites communes identiques) |
| Identité **B + I1** (`npx vitest run packages/elsatia-identity`, pile réelle « deux projets » : 2 clusters PG16, **GoTrue v2.192.0** ×2 compilé, **PostgREST v12.2.3** ×2) | ✅ **73/73, trois exécutions consécutives** (70 réels + 3 e2e contre l'application Studio `next build` + `next start`) : échange signé ES256, `jti` à usage unique, révocation, réessais, réconciliation, rotation, contournement RPC / clé service / lecture seule globale, RGPD de bout en bout |
| Isolation | ✅ aucune table non Studio dans le projet dédié (script + contrôle direct) ; sentinelle GP illisible depuis Studio (suite réelle) |
| Route RGPD sur l'app démarrée | ✅ sans secret → **401** ; avec secret → `{"mode":"off", …}` (exécution désactivée par défaut) |
| CI | ✅ nouveau job `studio-dedicated` (`ci.yml`) : PG16 + pgTAP, `dedicated-db-check.sh` (recommandation D6 du lot B) |

## 15. Seeds

| Porte | Résultat V6 |
|---|---|
| `npm run test:seeds` | ✅ **48/48** (registre complet : `upgrade_v5_v6_seed_complement.sql` classé CI_ONLY, couvert par `upgrade-harness`) |
| `npm run verify:seeds` (base fraîche **358**, seul, sans pile e2e) | ✅ **`ALL ACTIVE SEEDS QUALIFIED — 16/16 seeds qualifiés sur 358 migrations`** |

Tous les seeds ACTIVE restent qualifiés (Preview year, pilote, DR, 5 ans, Colors, Réserves, purge…).

## 16. Attendus du train, CI, runbooks

| Élément | V5 | V6 |
|---|---|---|
| Migrations / dernière | 355 / `20260928000301` | **358 / `20260928000601`** (générés, `sync:train-expectations`) |
| DB verify | 26 contrôles | **29** : + 27 Relevé Lot 6 (lecture RPC authentifiés seuls, contrôle des murs interne), + 28 RGPD V2 (aucun départ, aucun choix des photos), + 29 surface pièce (autorisation sans droit d'API, synchronisation non exécutable, déclencheur) ; 14 durci (aucune durée) ; lecture dynamique : sur V5 → **NO-GO explicite** sur 27-29, sans erreur de script |
| DB verify local | GO | `db-verify.mjs --local-harness --before-owner` sur fresh V6 → **`GO : base Preview conforme.`** (29 contrôles SQL, préflight 21 / 0 bloquant, RLS, 19 buckets, 37/37) |
| Fonctions service-role only | 35 | **37** (+ `purger_contrats_conserves_echus`, `rapport_echeances_contrats_conserves`) |
| Buckets | 19 | **19** (inchangé) |
| Manifeste d'environnement | | inchangé (aucune variable nouvelle ; celles de Studio restent hors Preview) |
| CI (`ci.yml`) | | + job `studio-dedicated` |
| Pack / runbook | ref V5 | ref **`integration/elsatia-canonical-train-v6`**, 37 RPC, périmètre de première Preview inchangé (**Studio OFF**) |

Chiffres historiques : les rapports V3, V4 et **V5** sont **inchangés** (340 / 352 / 355) ; garde
ajoutée à `test:preview-pack` : chiffres figés de V5 et absence de marqueur actif ; le générateur
n'écrit jamais dans un `ELSATIA_CANONICAL_TRAIN_*.md` (ce rapport compris).

## 17. Décisions et constats

| ID | Nature | État | Effet |
|---|---|---|---|
| `DECISION_REQUIRED:V6-MIGRATION-RENUMBERING` | technique | **décidé** (mission) | Relevé 6 → `…0928 401`, RGPD V2 → `…0928 501` ; Studio dédié conservé (projet distinct, déjà postérieur) |
| `DECISION_REQUIRED:V6-SURFACE-PLAN-PROJETE` | produit | **décidé (conservateur)** | un plan `projete` (travaux à venir) n'alimente pas la fiche pièce ; seuls `initial`, `corrige`, `as_built` |
| `DECISION_REQUIRED:V6-SURFACE-BACKFILL` | produit | **décidé (conservateur)** | aucune reprise à l'upgrade ; surface écrite au prochain enregistrement de contour |
| `DECISION_REQUIRED:V6-VOLUME-PIECE` | produit | ouvert | volume non calculé (colonne réservée) |
| `DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT` (A), point de départ (B), photos (C) | juridique | **ouvert** (`docs/legal/ELSATIA_RGPD_CONTRACT_RETENTION_OWNER_DECISION_V2.md`) | fail-closed, rien d'activé |
| Studio : décisions du lot B (délai d'effacement, activation, hébergement) | propriétaire | ouvert | Studio OFF |
| Harnais locaux concurrents | outillage | constat | rôles PostgreSQL globaux au cluster : le harnais des seeds laisse `supabase_auth_admin` sans login / autre mot de passe → la pile Relevé l'a refusé ; rôle réaligné localement (`login`, mot de passe local de la pile) avant la recette. Exécuter seeds et piles e2e **séquentiellement** (comme V5) |
| Stripe Test réel, Storage/GoTrue/e-mail réels, Portail Stripe réel | exécution distante | NOT PROVEN localement (hérité) | à prouver par le pack Preview |

## 18. Reproduire

```bash
git fetch --all --prune && git checkout integration/elsatia-canonical-train-v6 && npm ci
for a in tools colors reserves studio; do npm ci --prefix apps/$a; done
pg_ctlcluster 16 main start ; apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl postgresql-plpython3-16 python3-nacl

scripts/local-postgres-bootstrap/rebuild_db.sh v6_fresh                       # 358/358
scripts/qualification/pgtap-run-v3.sh v6_fresh                                # 143/152 propres (= V5 + 3)
scripts/qualification/upgrade-v5-v6.sh upg_v5_v6 v6_fresh                     # §10, contrôles métier 28/28
apps/studio/scripts/dedicated-db-check.sh                                     # 14 migrations, 543 ok
STACK_BIN=<gotrue v2.192.0 + postgrest v12> packages/elsatia-identity/scripts/local-stack.sh start
source /var/tmp/elsatia-stack/env.sh && npx vitest run packages/elsatia-identity   # 70 (+3 e2e avec STUDIO_APP_URL, E2E_SIGNING_KEYS, E2E_CRON_SECRET)
SEEDS_DR_PGPASSWORD=… node scripts/seeds/verify-seeds.mjs                     # §15 (seul, sans pile e2e)
npm run typecheck && npm run lint && npm test && npm --prefix apps/studio run test
npm run verify:migrations && npm run verify:train-expectations && npm run test:preview-pack && npm run test:seeds
ELSATIA_PREVIEW_DB_URL=postgresql://…@127.0.0.1/v6_fresh node scripts/preview/db-verify.mjs --local-harness --before-owner
```

## 19. Fichiers V6 (hors lots portés)

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20260928000{401,501}_*.sql` | renommées (en-tête de renumérotation, corps inchangé) |
| `supabase/migrations/20260928000601_tools_releve_surface_piece_sync_v1.sql`, `supabase/tests/elsatia_tools_releve_surface_piece_sync_v1.test.sql` | surface de la pièce (§6) |
| `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` | contrôles 27-29, CTE `politique_contrats_v2` |
| `scripts/preview/db-verify.mjs`, `preview-pack.test.mjs` | 37 RPC, chiffres V5 figés |
| `scripts/qualification/upgrade-v5-v6.sh`, `scripts/local-postgres-bootstrap/upgrade_v5_v6_{seed_complement,business_checks}.sql`, `upgrade_snapshot.py` | harnais d'upgrade V5 → V6 |
| `scripts/seeds/registry.mjs`, `registry.test.mjs` | complément V5 → V6 classé |
| `.github/workflows/ci.yml` | job `studio-dedicated` |
| `docs/qualification/ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md`, `docs/runbooks/ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md` | ref V6, attendus, 37 RPC |
| `packages/releve-domain/src/sql-parity.test.ts`, 3 suites pgTAP RGPD, `purger-entreprise.mjs`, `rgpd-contract-retention-v2.sh` | références de migration alignées |
