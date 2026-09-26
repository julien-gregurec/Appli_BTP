# ELSATIA — Post-Qualification Fix Convergence V1

Mission de convergence d'un train d'intégration à partir de 8 branches de
correctifs post-qualification, exécutée en autonomie sur
`integration/elsatia-post-qualification-fix-convergence-v1`.

```
INTEGRATION_BASE_SHA : f8a17b34af2d8220e3ecacae931c003ea4207a94  (tip de claude/quirky-wozniak-pacjtb au moment du fork)
COMMON_ANCESTOR_MAIN : 4d92ddbedccf8b2948f8b224739b622298b174c0  (= HEAD de main, inchangé pendant toute la mission)
FINAL_CODE_SHA       : 068a76c48449806f51dbe4ff00aa00149f6df634
MIGRATION_COUNT       : 320 (main en comptait 178 ; 320/320 rejouées avec succès sur base neuve — voir §5)
PGTAP                 : PARTIEL — voir §7 (1 défaut réel confirmé, majorité des fichiers bloqués par une limite d'environnement documentée)
TESTS (vitest, 5 apps) : 4 656/4 656 passés (GP 1799, Tools 1992, Reserves 178, Colors 427, Studio 260)
BUILDS (5 apps)        : 5/5 OK (GP, Tools, Colors, Reserves, Studio)
FRESH                  : OK — 320/320 migrations rejouées depuis zéro sur Postgres local jetable
UPGRADE (données réelles) : NON EXÉCUTÉ — aucun accès à des données de production réelles depuis ce bac à sable (voir §6)
```

**Verdict : POST-FIX TRAIN BLOCKED**

Raison en une phrase : un défaut fonctionnel réel et reproductible a été
confirmé par exécution (§7/§9), et deux des portes de qualification que la
mission rend obligatoires (UPGRADE avec données réelles, PGTAP complet) n'ont
pas pu être validées de bout en bout dans ce bac à sable. Le détail complet,
y compris tout ce qui a pu être exécuté et validé réellement, est ci-dessous.

---

## 0. FETCH — état réel du dépôt

`git fetch --all --prune` a résolu des dizaines de branches sur `origin`, y
compris les 8 branches nommées dans la mission — toutes existent :

- `claude/bold-cannon-qys1my`
- `claude/quirky-wozniak-pacjtb`
- `claude/sharp-dirac-wpa3oe`
- `claude/affectionate-heisenberg-gzh1sq`
- `claude/vibrant-carson-e4izd1`
- `claude/brave-brahmagupta-d54rpe`
- `claude/vigilant-fermat-p8jmep`
- `claude/funny-ramanujan-62d0yw`

**Constat structurel important, non anticipé par l'énoncé de mission** :
`main` n'a que 50 commits au total et son HEAD est identique au point de
divergence des 7 branches les plus grosses. Ces 7 branches ne sont pas des
petits correctifs isolés : chacune modifie ~2 170 fichiers (+310 à 313 k
lignes) et touche 135-138 fichiers de migration, contre 178 migrations sur
`main`. Elles partagent entre elles un historique de développement commun
très large (jusqu'à 570 commits chacune, 586 commits uniques au total en
union) et ne divergent réellement qu'à leur extrémité (1 à 3 migrations
propres à chacune). `main` est donc une base obsolète par rapport à ce qui a
réellement été développé ; ce train d'intégration part de la branche la plus
riche (`claude/quirky-wozniak-pacjtb`) plutôt que de `main`, en portant
ensuite uniquement les tranches réellement uniques de chaque autre branche.

`claude/funny-ramanujan-62d0yw` est différente : un seul commit, posé
directement sur `main` (pas sur l'historique partagé).

## 1. CLASSIFY

Classification au niveau fichier/fonctionnalité (une classification
commit-par-commit sur ~586 commits uniques n'aurait apporté aucun signal
supplémentaire : l'écrasante majorité de ces commits sont des itérations
partagées identiques entre branches — diagnostics temporaires posés puis
retirés, resserrement progressif de correctifs — déjà entièrement contenues
dans la base commune ci-dessus). Comparaison par diff de contenu (hash SHA-256
et diff ligne-à-ligne), pas par nom de fichier seul.

| Branche | Contenu unique réel | Classification |
|---|---|---|
| `claude/bold-cannon-qys1my` | Aucun — diff exact avec `quirky-wozniak-pacjtb` vide au-delà de ses 3 migrations propres, elles-mêmes absentes ici | **SUPERSEDED** (entièrement) par `quirky-wozniak-pacjtb` — non porté |
| `claude/affectionate-heisenberg-gzh1sq` | Ancêtre git direct de `quirky-wozniak-pacjtb` (`git merge-base --is-ancestor` confirmé) | **SUPERSEDED** (entièrement) — non porté |
| `claude/quirky-wozniak-pacjtb` | Sécurité (redteam v3, 3 RPC), Tools entitlement Free/Pro, Stripe Connect/Boutique webhook | **MUST_PORT** — porté (base de la branche d'intégration) |
| `claude/sharp-dirac-wpa3oe` | Studio signup policy (fermeture inscription, RLS/RPC) | **MUST_PORT** — porté |
| `claude/vibrant-carson-e4izd1` | Preview blockers closure (env-manifest, preflight-preview, runbooks, worker vidéo Studio) | **MUST_PORT** — porté |
| `claude/brave-brahmagupta-d54rpe` | Outillage DR (scripts/dr/*, runbook DR) | **MUST_PORT** — porté |
| `claude/vigilant-fermat-p8jmep` | Pilot acceptance (fixture seed/assert/cleanup, taux horaire facturé, statut avoir) | **MUST_PORT** (partiel) — voir ci-dessous |
| `claude/funny-ramanujan-62d0yw` | RGPD purge entreprise (infrastructure de purge à 30 jours) | **MUST_PORT** (partiel) — voir ci-dessous |

Cas **CONFLICTING / SUPERSEDED en interne à une branche** (détectés par diff
de contenu, pas par nom de fichier) :

- `claude/vigilant-fermat-p8jmep` contient ses propres copies de
  `src/app/api/stripe/webhook/route.ts`, du test redteam v3 et du test Tools
  entitlement. Diff de contenu : ce sont des **sous-ensembles stricts**
  (suppressions pures) des versions de `quirky-wozniak-pacjtb`. Classées
  **SUPERSEDED**, non portées — la version de `quirky-wozniak-pacjtb` reste
  seule dans la branche d'intégration.
- Le commit unique de `claude/funny-ramanujan-62d0yw` modifie
  `src/app/actions/rgpd.ts` en deux endroits : sa correction de fuite Storage
  au niveau employé (fonction `cheminsStorageEmployeAAnonymiser`) s'est
  révélée être un **doublon fonctionnel exact** d'un correctif déjà présent
  dans la base commune (`quirky-wozniak-pacjtb` supprime déjà les mêmes
  fichiers via `createAdminClient().storage...remove()`, avant même le
  cherry-pick). Classée **ALREADY_PRESENT**, non portée (aurait causé une
  double suppression silencieuse sinon). Sa seconde correction — l'
  infrastructure de purge au niveau entreprise (`purger_table_entreprise`
  etc.) — est réellement nouvelle et a été portée.

Aucun cas **DO_NOT_PORT** ni **DOC_ONLY** au sens strict n'a été identifié
parmi le contenu unique des 6 branches retenues : chaque tranche unique
correspond à un défaut réel documenté par son commit/sa migration.

## 2. MIGRATION COLLISIONS

| Timestamp d'origine | Branche(s) | Objet | Collision | Résolution |
|---|---|---|---|---|
| `20260922000323` | `quirky-wozniak-pacjtb` | `redteam_v3_authenticated_rpc_bypass_revocation` | avec 2 autres | conservé à 323 (sécurité, en tête de l'ordre de port) |
| `20260922000323` | `sharp-dirac-wpa3oe` | `studio_signup_policy` | avec 2 autres | renuméroté **325** |
| `20260922000323` | `vigilant-fermat-p8jmep` | `securiser_taux_horaire_facture_employe` | avec 2 autres | renuméroté **328** |
| `20260922000324` | `quirky-wozniak-pacjtb` | `stripe_connect_boutique_webhook_closure_v1` | avec 1 autre | renuméroté **326** |
| `20260922000324` | `vigilant-fermat-p8jmep` | `correctif_statut_avoir_emis_facture_origine` | avec 1 autre | renuméroté **329** |
| `20260922000325` | `quirky-wozniak-pacjtb` | `elsatia_tools_cloud_sync_entitlement_enforcement_v1` | aucune (mais réordonné) | renuméroté **324** (avant Studio/Stripe, ordre de mission) |
| `20260729000184` | `funny-ramanujan-62d0yw` | `purge_entreprise_supprimee` | avec la migration déjà existante `20260729000184_medias_devis_finalisation.sql` (présente dans la base commune) | renuméroté **20260922000327** |

Aucune migration différente n'a été écrasée : chaque collision a été résolue
par renumérotation pure (contenu SQL inchangé), jamais par suppression.
Séquence finale sans collision, `supabase/migrations/2026092200032{3..9}` :

```
323 redteam_v3_authenticated_rpc_bypass_revocation.sql        (sécurité)
324 elsatia_tools_cloud_sync_entitlement_enforcement_v1.sql    (entitlement)
325 studio_signup_policy.sql                                   (Studio)
326 stripe_connect_boutique_webhook_closure_v1.sql              (Stripe)
327 purge_entreprise_supprimee.sql                              (RGPD)
328 securiser_taux_horaire_facture_employe.sql                  (pilot)
329 correctif_statut_avoir_emis_facture_origine.sql             (pilot)
```

Vérifié après coup : `npm run verify:migrations` → *"320 migrations valides,
noms et horodatages uniques."* Aucun doublon de timestamp dans l'arbre final
(`ls supabase/migrations | sed -E 's/_.*$//' | sort | uniq -d` → vide).

Dépendances vérifiées par lecture directe des 7 migrations : chacune modifie
des objets disjoints (RPC de sécurité Stripe/Boutique, RLS `tools_projects`,
policy `studio_create_workspace`, grants `stripe_webhook_events`, colonne
`employes.taux_horaire`, statut `factures`). Aucune ne référence un objet créé
par une autre du même lot ; le réordonnancement était donc sûr.

## 3. PORT ORDER

Ordre appliqué, conforme à la mission (`security → upgrade → entitlement →
Studio → Stripe → RGPD → Preview → pilot → DR`) :

1. **security** + **upgrade** : hérités tels quels de la base
   `claude/quirky-wozniak-pacjtb` (le correctif de perf RLS « upgrade
   historique », `20260921000300_correctif_perf_rls_lignes_devis_factures.sql`,
   y est déjà présent — aucun portage séparé requis).
2. **entitlement** puis **Studio** puis **Stripe** : réordonnés/portés
   (§2).
3. **RGPD** : porté depuis `funny-ramanujan-62d0yw` (partiel, §1).
4. **Preview** : porté depuis `vibrant-carson-e4izd1`.
5. **pilot** : porté depuis `vigilant-fermat-p8jmep` (partiel, §1).
6. **DR docs/scripts** : porté depuis `brave-brahmagupta-d54rpe`.

## 4. MERGE

Branche dédiée : `integration/elsatia-post-qualification-fix-convergence-v1`,
créée depuis le tip de `claude/quirky-wozniak-pacjtb`. Sept commits de portage,
un commit de réordonnancement, un commit de correction (voir §5/§7 — bug
d'incompatibilité DR/migration trouvé et corrigé) :

```
cd8c40e chore(integration): renumber security-cluster migrations to convergence port order
a8dc4ae feat(studio): port closed-signup workspace hardening from claude/sharp-dirac-wpa3oe
5b21230 feat(rgpd): port entreprise-level purge infrastructure from claude/funny-ramanujan-62d0yw
365d31d feat(preview): port Preview deployment blockers closure from claude/vibrant-carson-e4izd1
1ba7392 feat(pilot): port external pilot acceptance fixes from claude/vigilant-fermat-p8jmep
1b47ec1 feat(dr): port disaster-recovery tooling from claude/brave-brahmagupta-d54rpe
068a76c fix(dr): update synthetic dataset seed for the taux_horaire schema change
```

Aucune fusion `git merge` en bloc n'a été utilisée : chaque tranche unique a
été portée fichier par fichier après diff de contenu vérifié (§1), avec
résolution manuelle des deux conflits réels rencontrés (le cherry-pick RGPD
sur `src/app/actions/rgpd.ts`, §1 ; l'incompatibilité de schéma DR, §7/§9).
C'est la garantie demandée par la mission (« AUCUNE fusion aveugle ») :
chaque ajout a été lu et vérifié individuellement, pas fusionné
automatiquement.

**Décision humaine déjà signalée dans les branches sources, non résolue ici**
(reportée telle quelle, pas tranchée par cette mission) : l'entrée
`DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION` du manifeste
d'environnement (portée depuis `vibrant-carson-e4izd1`) indique qu'un *autre*
correctif Studio-signup (branche `fix/studio-signup-closed-v1`, utilisant un
hook Auth `before_user_created`) suppose un projet Supabase dédié à Studio et
n'a jamais été porté nulle part, faute de cette décision. Ce n'est **pas** le
correctif RLS/RPC de `sharp-dirac-wpa3oe` effectivement porté ici (qui, par
construction, ne suppose pas de projet dédié — voir le commentaire de sa
propre migration). Les deux visent le même trou de sécurité par des voies
différentes ; un seul est dans ce train.

## 5. FRESH

**Exécuté réellement**, contrairement à ce que l'absence de Docker/Supabase
CLI dans ce bac à sable laissait présager : un serveur PostgreSQL 16 local
était installé mais arrêté (`service postgresql start`), et l'outillage DR
porté au §4 fournit exactement le mécanisme nécessaire (stubs Supabase minimal
+ rejeu de migrations).

```
sudo apt-get install -y postgresql-plpython3-16   # requis par 2 migrations, absent par défaut
sudo bash scripts/dr/00b_install_pgsodium_stub.sh
DR_PGDATABASE=elsatia_dr_drill bash scripts/dr/01_replay_migrations.sh --fresh
→ [dr] OK: 320/320 migrations appliquées en 26.96s sur 'elsatia_dr_drill'.
```

Résultat : **320/320**, zéro erreur. Preuve directe que la renumérotation du
§2 n'a cassé aucune dépendance et que l'arbre de migrations final est
applicable de bout en bout sur un Postgres neuf.

## 6. UPGRADE (données réelles)

**NON EXÉCUTÉ.** Ce bac à sable n'a et ne doit avoir accès à aucune donnée de
production réelle. Rejouer « l'upgrade historique avec vraies données »
exigerait soit un accès à un dump de production réel (hors périmètre et hors
autorisation de cette mission), soit de fabriquer de fausses données en les
faisant passer pour réelles — ce qui aurait rendu ce rapport mensonger. Cette
porte reste donc à exécuter par un humain disposant d'un accès légitime à un
dump de production (ou d'une copie anonymisée suffisamment fidèle), en
utilisant `scripts/dr/06_restore.sh` + le manifeste `04_manifest.sh` comme
mécanisme (disponible et vérifié fonctionnel au §5/§9, juste jamais alimenté
avec de vraies données ici).

## 7. PGTAP

`pg_prove` et l'extension `pgtap` (paquets Debian `postgresql-16-pgtap`)
installés et exécutés contre la base `elsatia_dr_drill` fraîchement migrée
(§5). Résultat brut : **Files=100, Tests=201, Result: FAIL**.

**Cause dominante, confirmée par lecture directe (pas supposée)** : la
fixture partagée `supabase/tests/fixtures/isolation_multitenant.inc`, utilisée
par la majorité des 100 fichiers de tests, insère dans `auth.users` avec une
colonne `instance_id` que le stub Supabase minimal de `scripts/dr/00_supabase_stubs.sql`
ne crée pas volontairement (son README l'indique explicitement : *« Supabase
Auth réel (hachage de mot de passe, JWT, providers, hooks) :
`00_supabase_stubs.sql` documente explicitement ce qu'il ne reproduit pas »*).
Ce stub a été conçu pour les drills DR (comptage/checksums, restauration), pas
pour faire tourner la suite pgTAP complète — écart d'infrastructure
préexistant à cette mission, pas introduit par elle. La reproduction fidèle
du schéma `auth.users` de Supabase (GoTrue) est hors périmètre d'une
correction ponctuelle ici : le risque de se tromper sur un schéma
partiellement deviné dépasse la valeur d'un pgTAP « vert » qui ne prouverait
rien de réel.

**Ce qui a pu tourner malgré cette limite, et son verdict** :

| Fichier | Tests exécutés / prévus | Échecs | Interprétation |
|---|---|---|---|
| `redteam_v3_authenticated_rpc_bypass_revocation.test.sql` | 7/13 | 0 | partiel, propre jusqu'à interruption |
| `security_remediation_anon_execute_revocation_v1.test.sql` | 4/7 | 0 | partiel, propre |
| `stripe_connect_boutique_webhook_closure_v1.test.sql` | 9/32 | 0 | partiel, propre |
| `renommage_elsatia_boutique.test.sql` | **18/18 (complet)** | **6** | **échec réel confirmé — voir ci-dessous** |

**Défaut réel confirmé, pas un artefact d'environnement** : les tests 16-18
de `renommage_elsatia_boutique.test.sql` montrent que **rejouer
`boutique_finaliser_commande_payee` une seconde fois** (rejeu idempotent d'un
webhook Stripe, scénario réel — Stripe re-livre ses événements) **échoue**
avec `42501: boutique_commandes: statut payee reserve au chemin serveur`,
levée par le déclencheur `boutique_commandes_paiement_serveur_seul()`.
Vérifié en isolant la cause : **ce même échec (6/18) existe déjà dans le
fichier de test original de `claude/quirky-wozniak-pacjtb` seule**, avant
tout portage — ce n'est donc pas une régression introduite par cette
convergence, mais un défaut préexistant dans une des branches sources,
fidèlement reproduit (ni introduit, ni corrigé) par ce train. Il se situe
précisément à l'intersection du correctif sécurité (redteam v3, le
déclencheur « chemin serveur seul ») et du correctif Stripe Boutique (la
fonction de finalisation), tous deux dans `quirky-wozniak-pacjtb` — exactement
le genre d'interaction qu'une fusion aveugle des 8 branches aurait pu
masquer, et qu'une exécution réelle a permis de repérer. **À corriger avant
tout déploiement** : `boutique_finaliser_commande_payee` doit être idempotente
sous ce nouveau déclencheur (ex. no-op si la commande est déjà `payee`,
avant l'UPDATE qui déclenche la garde).

**Bug distinct trouvé et corrigé pendant cette vérification** (pas dans
pgTAP mais dans l'outillage DR, révélé par l'exécution réelle du rejeu) :
`scripts/dr/03_seed_synthetic_dataset.sql` (porté depuis
`brave-brahmagupta-d54rpe`) insérait encore dans `employes.taux_horaire`,
colonne supprimée par la migration 328 (portée depuis `vigilant-fermat-p8jmep`)
— aucune des deux branches sources ne connaissait le changement de l'autre.
Corrigé dans le commit `068a76c` (§4), reseed vérifié fonctionnel.

## 8. APPS

Cinq apps (`gestion_pro` racine, `apps/tools`, `apps/colors`, `apps/reserves`,
`apps/studio`), toutes avec dépendances installées et vérifiées séparément
(Studio n'est pas câblée dans les scripts racine `lint`/`test`/`build`, testée
directement dans `apps/studio/`) :

| App | typecheck | lint | test (vitest) | build |
|---|---|---|---|---|
| Gestion Pro (racine) | OK | OK (0 erreur) | OK — 1799/1799 | OK |
| Tools | OK | OK | OK — 1992/1992 | OK (avec env local documenté, voir note) |
| Reserves | OK | OK | OK — 178/178 | OK (avec env local documenté) |
| Colors | OK | OK | OK — 427/427 | OK (avec env local documenté) |
| Studio | OK | OK | OK — 260/260 | OK (avec env local documenté) |

**Note sur les builds** : `apps/tools`, `apps/colors`, `apps/reserves` et
`apps/studio` ont un garde de build qui échoue volontairement sans variables
`NEXT_PUBLIC_*` réelles (empêche un build silencieusement cassé en
production). Buildés ici avec les valeurs de `.env.example`/`.env.preview.example`
de chaque app (`NEXT_PUBLIC_*_ENV=local`), documentées dans le dépôt pour cet
usage exact — pas des identifiants réels, pas une manière de contourner le
garde en production. Le build racine (`gestion_pro` + `apps/tools`) n'a pas eu
besoin de ces variables.

`lint` : 0 erreur, 6 avertissements préexistants (aucun dans le code porté ici
— `<img>` non optimisée, `window.location.assign`, export anonyme, variable
inutilisée dans un test e2e).

## 9. SECURITY

Rejoué dans la limite de ce qui ne dépend pas de la fixture Auth bloquée
(§7) :

- **cross-tenant / service-role ACL (RLS)** : vérifié **fonctionnellement**,
  pas seulement au niveau texte, via `scripts/dr/08_verify_rls_functional.sh`
  contre la base migrée + le jeu de données synthétique DR (§5, `03_seed_synthetic_dataset.sql`
  corrigé) :
  ```
  [dr] OK DR-TENANT-A: 3 client(s) visibles, tous du bon tenant, aucune fuite cross-tenant.
  [dr] OK DR-TENANT-B: 3 client(s) visibles, tous du bon tenant, aucune fuite cross-tenant.
  [dr] OK: le rôle anon (non authentifié) ne voit aucun client.
  [dr] OK: isolation RLS multi-tenant fonctionnellement intacte.
  ```
- **redteam v3 (3 RPC exploitables par authenticated)** : migration
  appliquée sans erreur (§5) ; 7/13 assertions pgTAP exécutées sans échec
  avant que la fixture Auth n'interrompe le fichier (§7) — validation
  partielle, pas complète.
- **Tools Free/Pro entitlement** : migration appliquée sans erreur ; pas
  d'exécution pgTAP au-delà (fichier `elsatia_tools_cloud_sync_entitlement_closure_v1.test.sql`
  entièrement bloqué par la fixture Auth, §7).
- **Studio workspace signup** : migration `studio_signup_policy` appliquée
  sans erreur ; ses tests dédiés (`studio_signup_policy.test.sql`,
  `studio_workspace_foundation.test.sql`) sont eux aussi bloqués par la même
  fixture. Voir la décision humaine en attente signalée au §4
  (`STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION`).
- **Stripe webhooks (Connect + Boutique)** : migration appliquée sans erreur ;
  9/32 assertions exécutées sans échec avant interruption par la fixture
  (§7) — **mais** le défaut réel du §7 (idempotence du rejeu de webhook)
  concerne précisément ce périmètre et doit être traité comme un résultat de
  sécurité/fiabilité négatif, pas comme « non testé ».

## 10. PILOT

Cycle complet exécuté réellement contre la base migrée (§5), avec
`supabase/production/{seed,assertions,cleanup}_entreprise_pilote_btp.sql`
(portés depuis `vigilant-fermat-p8jmep`) :

```
SEED    → SARL Bati-Rhone Construction : 28 employés, 8 clients, 7 chantiers,
          9 devis, 7 factures, 300 pointages, 300 affectations, etc.
ASSERT  → 15/15 contrôles quantitatifs OK, isolation tenant OK (0 fuite),
          répartition des 5 profils conforme, statuts devis/factures cohérents.
CLEANUP → "PILOTE-BTP-V1 nettoyée" (script destructif, exécuté avec
          confirmation explicite CONFIRM_DELETE_TEST_DATA=YES, sur la base
          jetable locale uniquement).
RESEED  → rejoué avec succès, 15/15 contrôles à nouveau OK.
```

## 11. ENV

Exécutés réellement, tous statiques (pas de dépendance base de données) :

- `npm run verify:migrations` → OK, 320 migrations, noms/horodatages
  uniques.
- `npm run verify:secrets` → OK, 2562 fichiers suivis contrôlés, aucun secret
  reconnu (2 exceptions nommées, préexistantes).
- `npm run verify:env-manifest` → OK, aucune erreur. 14 `DECISION_REQUIRED`
  en attente (non bloquantes par construction du script — ce sont des
  décisions produit/architecture pour Julien, listées telles quelles, y
  compris celle du §4 sur Studio).
- `npm run test:env-manifest` → OK, 58/58 tests.
- `npm run verify:stripe-prices` → SKIP non bloquant (pas de
  `STRIPE_SECRET_KEY` ni de CLI Stripe dans ce bac à sable — comportement
  voulu du script, pas un échec).

## 12. Ce qui n'a délibérément PAS été fait

- **Aucune donnée de production réelle** n'a été utilisée ou simulée nulle
  part dans cette mission (§6).
- **Aucun secret réel** (Stripe, Supabase hébergé) n'a été utilisé ; tous les
  builds/tests ont tourné avec les valeurs `.env.example` documentées dans le
  dépôt pour un usage local (§8).
- **Aucune fusion `git merge` en bloc** des 8 branches : chaque ajout a été
  lu, diffé au niveau contenu et porté individuellement (§1/§4).
- **Le stub Auth Postgres n'a pas été étoffé** pour faire passer pgTAP en
  entier (§7) : risque de faux-positifs plus élevé que la valeur d'un
  vert obtenu en devinant le schéma GoTrue réel.

---

## Verdict détaillé

**POST-FIX TRAIN BLOCKED**

Blocages concrets, par ordre de gravité :

1. **P1 confirmé par exécution réelle** (§7/§9) : `boutique_finaliser_commande_payee`
   n'est pas idempotente sous le nouveau déclencheur `boutique_commandes_paiement_serveur_seul()`
   — un rejeu de webhook Stripe (Connect ou Boutique) échoue au lieu d'être un
   no-op. Préexistant dans `claude/quirky-wozniak-pacjtb`, reproduit fidèlement
   ici, non corrigé (correction de logique métier hors mandat d'un travail de
   convergence/portage). **Doit être corrigé avant tout déploiement.**
2. **PGTAP incomplet** (§7) : 96/100 fichiers de test n'ont pas pu s'exécuter
   jusqu'au bout dans ce bac à sable, pour une raison d'infrastructure
   documentée et préexistante (stub Auth minimal), pas une raison liée au
   code porté. Cette porte doit être rejouée avec un environnement Supabase
   local complet (`supabase start`, hors de portée de ce bac à sable —
   `supabase` CLI absent, Docker absent) avant de pouvoir affirmer une
   qualification pgTAP complète.
3. **UPGRADE avec données réelles non exécuté** (§6), par construction (pas
   d'accès légitime à des données de production depuis cette mission).
4. **Décision produit en attente, non tranchée ici** (§4) : le choix
   projet-Supabase-dédié-ou-partagé pour Studio, qui détermine si le
   correctif signup RLS/RPC porté ici est la solution définitive ou une
   mesure intermédiaire.

Tout le reste (§5, §8, §10, §11, et la partie fonctionnelle du §9) a été
**exécuté réellement et est vert** : rejeu de migrations à 320/320, 5 apps
qui compilent/lintent/testent/buildent sans erreur (4 656 tests unitaires),
cycle pilote seed/assert/cleanup/reseed complet et cohérent, isolation RLS
cross-tenant fonctionnellement prouvée, et l'ensemble des vérifications
statiques d'environnement/secrets/migrations. Ce n'est donc pas un blocage
généralisé : une fois le point 1 corrigé et les points 2-4 rejoués avec les
moyens appropriés (environnement Supabase complet, accès aux données de
production, décision Studio), ce train est proche d'un statut
**LOCALLY QUALIFIED**.
