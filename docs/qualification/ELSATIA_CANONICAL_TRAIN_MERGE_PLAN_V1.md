# ELSATIA — Plan de convergence du train canonique V1

**Mission** : transformer le verdict `CANONICAL TRAIN REQUIRES DECISION` de
`docs/qualification/ELSATIA_BRANCH_CONVERGENCE_MAP_V1.md` en un **plan d'exécution**.

**Ce qui n'a PAS été fait, conformément au mandat** : aucun merge, aucun cherry-pick, aucune
modification de migration, aucune modification de code, aucun push sur une branche
d'intégration. Le seul écrit de cette mission est ce document (plus la copie du rapport de
cartographie source sur la branche de travail, pour que le plan soit lisible sans changer de
branche).

**Méthode** : `git fetch --all --prune` (269 branches distantes), puis, pour chaque branche,
comparaison factuelle des arbres (`git ls-tree`), des historiques (`git merge-base --is-ancestor`,
`git rev-list`), du contenu octet-pour-octet des migrations homonymes (`diff`), de leur contenu
SQL hors commentaires (`sed 's/--.*$//'`), et **simulation de fusion en lecture seule**
(`git merge-tree --write-tree`, qui calcule un arbre de fusion sans déplacer aucune référence
ni toucher l'arbre de travail).

**Horodatage** : 2026-09-23. Toutes les têtes citées ont été re-vérifiées à cette date et sont
**inchangées** par rapport à la cartographie du 2026-09-22.

---

## 0. Ce que la cartographie disait — et ce que la vérification a changé

La cartographie V1 concluait `CANONICAL TRAIN REQUIRES DECISION` en laissant 4 questions
ouvertes. Les vérifications de contenu menées ici en **tranchent trois mécaniquement** :

| Question ouverte de la cartographie V1 | Résultat vérifié ici | Conséquence |
|---|---|---|
| Pilot Acceptance V3 « a réécrit indépendamment » `taux_horaire` et `avoir_emis`, « contenu à differ » | **Faux : les deux fichiers sont octet-pour-octet identiques** à ceux du tronc (`323`≡`328`, `324`≡`329`) | Déduplication triviale, pas de réconciliation métier |
| RGPD Purge V2 « recoupe » la purge du tronc | **`20260729000184_purge_entreprise_supprimee.sql` (RGPD) est octet-pour-octet identique à `20260922000327_purge_entreprise_supprimee.sql` (tronc)** | RGPD n'apporte **qu'une seule** migration réellement nouvelle |
| Preview closure « SUPERSEDED (partiellement) — vérifier que le port est complet » | **Port complet vérifié** : 0 fichier présent dans la branche et absent du tronc ; les 6 livrables signature (`preflight-preview.mjs`, `.test.mjs`, 3 runbooks, rapport de clôture) sont octet-pour-octet identiques | `SUPERSEDED` sans réserve |
| Studio auth (`fix/studio-signup-closed-v1`) « contenu semble déjà partiellement porté » | **Les deux moitiés se séparent nettement** : le `studio_signup_policy.sql` du tronc est une **réécriture délibérée et mieux argumentée** (elle rejette explicitement le hook Auth de la branche source, incompatible avec le projet Supabase partagé multi-app) → superseded ; **mais 7 migrations Studio et ~61 fichiers `apps/studio/` de la branche source sont totalement absents du tronc** | Le chantier « auth » est tranché ; un **lot résiduel Studio post-H** est découvert (§7) |

Une **quatrième découverte** non anticipée : sur GP Hardening Real DB, 4 des 18 migrations sont
du SQL strictement identique à des migrations déjà présentes dans le tronc (simple report de
commentaires), 1 est un sur-ensemble d'une migration du tronc, et 3 traitent un sujet que le
tronc a déjà traité **avec un SQL différent**. Le périmètre réel de GP tombe de 18 à 10
migrations franchement nouvelles (§6).

---

## 1. Choix du tronc

Le point de départ candidat proposé par la mission est
`origin/integration/elsatia-post-qualification-fix-convergence-v1` (`3cfbcd70`).

**Recommandation : partir plutôt de `origin/claude/magical-mccarthy-sm9lwb` (`f34f2263`).**

Justification factuelle :

- Elle **contient** `integration/elsatia-post-qualification-fix-convergence-v1` (ancêtre direct
  vérifié) et n'en diverge que par **1 commit**, 1 fichier de migration.
- Ce commit unique **ferme le blocage n°1 du tronc**. Le rapport
  `ELSATIA_POST_QUALIFICATION_FIX_CONVERGENCE_V1.md` §Verdict énonce
  `POST-FIX TRAIN BLOCKED` avec pour premier blocage :
  *« `boutique_finaliser_commande_payee` n'est pas idempotente sous le nouveau déclencheur […]
  Doit être corrigé avant tout déploiement. »* — c'est exactement l'objet de
  `20260922000330_boutique_finaliser_commande_payee_concurrency_lock.sql`.
- Partir de `3cfbcd70` reviendrait à ré-appliquer ce même commit au STEP suivant : même arbre,
  un aller-retour de plus.

Le tronc retenu est donc désigné ci-après **`T0 = claude/magical-mccarthy-sm9lwb @ f34f2263`**
(313 + 8 = **321 migrations**, plus haut numéro : `20260922000330`).

Branche d'intégration à créer : **`integration/elsatia-canonical-train-v1`**, jamais rebasée,
un merge-commit par STEP (historique auditable, aucune réécriture d'historique d'autrui).

---

## 2. Décision par chantier

| # | Chantier | Branche | Tête | **DÉCISION** | Coût mesuré |
|---|---|---|---|---|---|
| 1 | Boutique Idempotency | `claude/magical-mccarthy-sm9lwb` | `f34f2263` | **MERGE** (devient `T0`, fast-forward depuis le candidat) | 0 conflit |
| 2 | Studio Worker V2 | `claude/zen-goodall-n3opdc` | `afd39126` | **MERGE** | **0 conflit** (simulation `merge-tree` propre), 0 migration |
| 3 | Tools entitlement | `claude/quirky-wozniak-pacjtb` | `f8a17b34` | **SUPERSEDED** — ancêtre de `T0` (vérifié) | — |
| 4 | Preview closure | `claude/vibrant-carson-e4izd1` | `6c53b8e3` | **SUPERSEDED** — port complet vérifié dans `T0` | — |
| 5 | Studio config (8a) | `claude/studio-runtime-config-wiring-v1` | `faebd709` | **SUPERSEDED** — racine de `T0` | — |
| 6 | Pilot Acceptance V3 | `claude/loving-turing-aaopod` | `4056c5f3` | **CHERRY-PICK** (2 migrations dédupliquées, 2 fichiers à réconcilier) | 2 conflits `add/add` |
| 7 | RGPD Purge V2 | `claude/brave-planck-bzsvda` | `26112ced` | **CHERRY-PICK + RENUMÉROTATION** (1 migration sur 2 seulement) | 5 conflits |
| 8 | Billing Security V3 | `claude/great-mayer-bzxad6` | `3e2a8bea` | **CHERRY-PICK + RENUMÉROTATION** | 8 conflits |
| 9 | GP Hardening Real DB | `claude/amazing-pascal-7lddkv` | `d42df217` | **REQUIRES MANUAL RECONCILIATION** | **50 conflits** ; 18 migrations → 10 nouvelles |
| 10a | Studio auth — politique signup (8b) | `fix/studio-signup-closed-v1` | `634651a0` | **DO NOT MERGE** — remplacée délibérément dans `T0` | — |
| 10b | Studio auth — lot fonctionnel post-H (découverte) | `fix/studio-signup-closed-v1` | `634651a0` | **REQUIRES ARCHITECTURAL DECISION** — hors train V1 (§7) | 7 migrations + ~61 fichiers absents de `T0` |

Aucun chantier n'est classé `DO NOT MERGE` pour cause de défaut : le seul `DO NOT MERGE` (10a)
l'est parce que `T0` porte déjà une version **meilleure** du même correctif.

---

## 3. Collisions de migrations — inventaire complet et résolution

`npm run verify:migrations` (`scripts/verify-migrations.mjs`) **refuse deux fichiers partageant
le même horodatage à 14 chiffres** (`${nom}: horodatage déjà utilisé par ${precedent}`, sortie
code 1). C'est le garde-fou mécanique du plan : **toute collision non résolue fait échouer ce
gate**, elle ne peut pas passer silencieusement. Aucune collision ci-dessous ne peut donc être
« oubliée ».

### 3.1 Collisions de numéro de version (7 vérifiées)

| Version | Ancienne version (fichier A / branche) | Nouvelle version (fichier B / branche) | Résolution proposée | Ordre logique |
|---|---|---|---|---|
| `20260729000184` | `medias_devis_finalisation.sql` — **déjà dans `T0`** | `purge_entreprise_supprimee.sql` — RGPD | **B abandonné** : contenu octet-pour-octet identique à `20260922000327` déjà dans `T0` | A conservé en place |
| `20260729000185` | `isolation_multitenant_grants_et_definer.sql` — **déjà dans `T0`** | `purge_entreprise_architecture_v2.sql` — RGPD | **B renuméroté → `20260923000331`** | après `20260922000327` (dont il dépend) |
| `20260922000184` | `plateforme_admin_role_total_ferme_autopromotion.sql` — GP | `verrouillage_colonnes_commerciales_entreprises.sql` — Billing | GP : réconciliation §6 ; Billing **renuméroté → `20260923000332`** | Billing avant GP |
| `20260922000185` | `ferme_contournement_paiement_boutique.sql` — GP | `horodatage_events_abonnement_et_delai_grace.sql` — Billing | GP : réconciliation §6 ; Billing **renuméroté → `20260923000333`** | après `…332` |
| `20260922000323` | `redteam_v3_authenticated_rpc_bypass_revocation.sql` — **déjà dans `T0`** | `securiser_taux_horaire_facture_employe.sql` — Pilot | **B abandonné** : identique octet-pour-octet à `20260922000328` déjà dans `T0` | A conservé |
| `20260922000324` | `elsatia_tools_cloud_sync_entitlement_enforcement_v1.sql` — **déjà dans `T0`** | `correctif_statut_avoir_emis_facture_origine.sql` — Pilot | **B abandonné** : identique octet-pour-octet à `20260922000329` déjà dans `T0` | A conservé |
| `20260922000325` | `studio_signup_policy.sql` — **déjà dans `T0`** | `pl02_garde_fou_affectation_employe_actif.sql` — Pilot | **B renuméroté → `20260923000334`** | après `…328` (schéma `taux_horaire`) |

### 3.2 Collisions de nom métier sans collision de numéro

| Nom métier | Version A | Version B | Verdict vérifié |
|---|---|---|---|
| `purge_entreprise_supprimee.sql` | RGPD `20260729000184` | `T0` `20260922000327` | **Octet-pour-octet identiques** → A abandonné |
| `securiser_taux_horaire_facture_employe.sql` | Pilot `20260922000323` | `T0` `20260922000328` | **Octet-pour-octet identiques** → A abandonné |
| `correctif_statut_avoir_emis_facture_origine.sql` | Pilot `20260922000324` | `T0` `20260922000329` | **Octet-pour-octet identiques** → A abandonné |
| `studio_signup_policy.sql` | `fix/studio-signup-closed-v1` `20260921070000` | `T0` `20260922000325` | **Contenus divergents et incompatibles** (hook Auth global vs RLS/RPC ciblés) → A **DO NOT MERGE**, voir §7 |
| `correctif_isolation_factures.sql` | GP `20260922000191` | `T0` `20260806000197` | **SQL identique hors commentaires** → A abandonné |
| `correctif_isolation_devis_client.sql` | GP `20260922000192` | `T0` `20260806000198` | **SQL identique hors commentaires** → A abandonné |
| `correctif_isolation_relances_impayes.sql` | GP `20260922000193` | `T0` `20260806000199` | **SQL identique hors commentaires** → A abandonné |
| `verrouiller_facture_emise.sql` | GP `20260922000196` | `T0` `20260822000222` | **SQL identique hors commentaires** → A abandonné |
| `correctif_rls_ecriture_chantiers.sql` | GP `20260922000190` | `T0` `20260806000196` | **A est un sur-ensemble de B** : A ajoute 6 énoncés (`role_gestion_insert`/`update`/`delete` RESTRICTIVE sur `public.chantiers`) **absents de tout le tronc** (vérifié sur les 321 migrations) → extraire le **delta seul** |

### 3.3 Recouvrements fonctionnels sans collision de nom (GP ↔ `T0`)

Trois migrations GP traitent un sujet que `T0` a **déjà traité avec un SQL différent**. Ce sont
les seuls points du plan qui exigent un arbitrage humain ligne à ligne :

| GP | Sujet | Ce que `T0` porte déjà | Nature du recouvrement |
|---|---|---|---|
| `20260922000184_plateforme_admin_role_total_ferme_autopromotion.sql` | auto-promotion admin plateforme | `20260922000314_gp_pilot_plateforme_admin_role_total.sql` | même sujet, deux rédactions |
| `20260922000185_ferme_contournement_paiement_boutique.sql` | contournement de paiement sur `boutique_finaliser_commande_payee` | `20260922000323_redteam_v3_authenticated_rpc_bypass_revocation.sql` (introduit `boutique_commandes_paiement_serveur_seul`), renforcé par `…326` et `…330` | **`T0` a probablement déjà fermé la faille par une autre voie** — à prouver avant d'écarter GP |
| `20260922000198_idempotence_paiement_et_avoir.sql` | `enregistrer_paiement_facture`, `creer_facture_avancee` | `20260922000306_gp_pilot_paiement_avoir_idempotence.sql` | même sujet, **SQL différent** → un `create or replace` GP appliqué après écraserait la version du tronc |

**Règle de résolution imposée** : pour ces trois, ne jamais appliquer la version GP « par-dessus »
sans diff. Soit la version `T0` couvre strictement le cas GP (prouvé par le test pgTAP de GP
rejoué sur `T0` **sans** la migration GP) → GP abandonnée ; soit elle ne le couvre pas → écrire
**une** migration de convergence qui part de l'état `T0` et ajoute le manque, numérotée en fin
de série.

### 3.4 Plan de renumérotation consolidé

`T0` s'arrête à `20260922000330`. La série `20260923000331+` est libre sur l'ensemble du corpus
(vérifié). Précédent interne : `T0` a déjà pratiqué cet exercice
(`cd8c40e5 chore(integration): renumber security-cluster migrations to convergence port order`).

| Nouveau numéro | Fichier | Origine | Dépend de |
|---|---|---|---|
| `20260923000331` | `purge_entreprise_architecture_v2.sql` | RGPD `20260729000185` | `20260922000327` (purge V1, déjà dans `T0`) |
| `20260923000332` | `verrouillage_colonnes_commerciales_entreprises.sql` | Billing `20260922000184` | schéma `entreprises` |
| `20260923000333` | `horodatage_events_abonnement_et_delai_grace.sql` | Billing `20260922000185` | `…332` |
| `20260923000334` | `pl02_garde_fou_affectation_employe_actif.sql` | Pilot `20260922000325` | `20260922000328` (`taux_horaire`) |
| `20260923000335` | `correctif_rls_ecriture_chantiers_role_gestion.sql` (**delta seul**, nouveau fichier) | GP `20260922000190` moins `T0` `20260806000196` | `20260806000196` |
| `20260923000336` → `20260923000345` | les 10 migrations GP franchement nouvelles, **dans l'ordre source** : `186_durcissement_privileges_socle`, `187_restreint_lecture_documents_sensibles`, `188_fiabilise_policy_lecture_documents_paie`, `189_grants_explicites_socle_comptes`, `194_fix_digest_search_path_audit_notes_frais`, `195_verrou_devis_accepte_et_expiration_essai`, `197_session_support_sans_persistance`, `199_gele_echeance_facture_post_emission`, `200_ferme_insert_direct_paiements`, `201_regression_grant_execute_est_membre_actif` | GP | ordre source strict (`186` pose les privilèges socle dont `189` dépend) |
| `20260923000346+` | réservé aux éventuelles migrations de convergence issues de §3.3 | — | fin de série |

**Contrainte d'ordre non négociable** : `201_regression_grant_execute_est_membre_actif` est, de
par son nom, un correctif de régression sur les `grant execute` posés par `186`/`189` — il doit
rester **après** eux. L'ordre source de GP est donc préservé tel quel, pas réordonné.

---

## 4. Ordre exact des opérations

Chaque STEP se termine par son gate local. **Un STEP dont le gate est rouge ne passe pas au
suivant** : on corrige sur place ou on s'arrête au dernier STEP vert (le train reste alors
cohérent et déployable, voir §8).

### STEP 1 — Créer la branche du train

```
git fetch --all --prune
git checkout -b integration/elsatia-canonical-train-v1 origin/claude/magical-mccarthy-sm9lwb
```

Gate : `npm run verify:migrations` → attendu `321 migrations valides`.
État : Boutique Idempotency + Tools entitlement + Preview closure + Studio config + post-fix
convergence sont acquis (chantiers 1, 3, 4, 5 et la base).

### STEP 2 — Studio Worker V2 (`MERGE`, sans conflit)

```
git merge --no-ff origin/claude/zen-goodall-n3opdc
```

Simulation `merge-tree` : **propre**, 0 conflit, 0 migration ajoutée (le chantier est
documentaire + tests worker). C'est le seul merge du plan qui ne demande aucune intervention.

Gate : `npm run verify:migrations` (321), `npm --prefix apps/studio run typecheck`,
`npm --prefix apps/studio run test` (attendu 260/260), `npm --prefix apps/studio run build`.

### STEP 3 — Pilot Acceptance V3 (`CHERRY-PICK`, déduplication de 2 migrations)

Ne **pas** faire `git merge origin/claude/loving-turing-aaopod` à l'aveugle : git ne verrait
aucun conflit sur `20260922000323/324` (noms de fichiers différents de ceux du tronc) et
**ajouterait silencieusement deux migrations dont le contenu est déjà appliqué** — double
exécution du même correctif, invisible en revue de diff.

Séquence :

1. Reporter les 14 commits propres à Pilot (`f6d4379e`, `1166c003`, `8132df84`, `e8a52cc7`,
   `c0ee33c1`, `f1ea491f`, `a51651ed`, `bc1d31c5`, `c2f0073b`, `42dfa5b9`, `e9051f73`,
   `749df80f`, `521b1444`, `4056c5f3`) **hors migrations** :
   `supabase/production/{seed,assertions,cleanup}_entreprise_pilote_btp.sql`,
   `scripts/local-postgres-bootstrap/pilot_acceptance_v3.sh`,
   `tests/e2e/pilot-acceptance-v3.spec.ts`,
   `docs/qualification/ELSATIA_PILOT_ACCEPTANCE_CLOSURE_V3.md`,
   `docs/qualification/pilote/ELSATIA_PILOT_ACCEPTANCE_TESTS_V1.md`.
2. **Ne pas reprendre** `20260922000323_securiser_taux_horaire_facture_employe.sql` ni
   `20260922000324_correctif_statut_avoir_emis_facture_origine.sql` (identiques à `…328`/`…329`
   déjà dans le tronc).
3. Reprendre `20260922000325_pl02_garde_fou_affectation_employe_actif.sql` **renuméroté
   `20260923000334`**.
4. Résoudre les 2 conflits `add/add` mesurés :
   `scripts/local-postgres-bootstrap/README.md` et
   `scripts/local-postgres-bootstrap/pg_bootstrap.sql` — **union des deux contenus** (les deux
   branches ont étendu le même bootstrap local pour des besoins différents, aucun n'invalide
   l'autre).

Gate : `npm run verify:migrations` (322), `npm run typecheck`, `npm run test`.

### STEP 4 — RGPD Purge V2 (`CHERRY-PICK` + renumérotation, 1 migration sur 2)

1. **Ne pas reprendre** `20260729000184_purge_entreprise_supprimee.sql` (identique à
   `20260922000327` déjà dans le tronc).
2. Reprendre `20260729000185_purge_entreprise_architecture_v2.sql` (665 lignes, F1→F8)
   **renuméroté `20260923000331`**.
3. Résoudre les 5 conflits mesurés : `scripts/purger-entreprise.mjs`,
   `src/app/actions/rgpd.ts`, `src/lib/rgpd.ts`, `src/lib/rgpd.test.ts`,
   `supabase/tests/purge_entreprise_supprimee.test.sql`.
   **Règle** : côté RGPD (V2) prioritaire sur la logique de purge — c'est la seule des deux
   versions dont les 8 défauts ont été fermés par exécution réelle ; côté tronc prioritaire sur
   les signatures partagées avec le reste de l'écosystème.
4. Reprendre les runbooks et `supabase/production/*` de la branche RGPD.

Gate : `npm run verify:migrations` (323), `npm run test`, plus les 46 assertions pgTAP RGPD
(`supabase/tests/purge_entreprise_*.test.sql`).

### STEP 5 — Billing Security V3 (`CHERRY-PICK` + renumérotation)

1. Reprendre les 2 migrations renumérotées `20260923000332` et `20260923000333`.
2. Résoudre les 8 conflits mesurés : `.env.local.example`,
   `docs/DECISIONS_TARIFICATION_NON_RECOMMANDEES.md`, `src/app/actions/plateforme.ts`,
   `src/app/api/cron/abonnements/route.ts`, `src/app/api/stripe/abonnement/webhook/route.ts`
   (+ son `.test.ts`), `src/app/onboarding/besoins/page.tsx`,
   `src/lib/stripe-abonnement.test.ts`.
   **Règle** : `.env.local.example` et le registre de décisions → **union** ; le webhook
   abonnement et `plateforme.ts` → côté Billing V3 pour la logique suspension/3-DS, côté tronc
   pour tout ce qui touche Connect/Boutique (déjà durci par `…323`/`…326`).
3. Reprendre `scripts/configurer-portail-stripe.mjs` et le rapport de clôture.

Gate : `npm run verify:migrations` (325), `npm run verify:stripe-prices`, `npm run test`,
`npm run typecheck`.

**Fin du bloc « déterministe ».** À l'issue du STEP 5, le train couvre **8 des 10 chantiers**
sans qu'aucune décision d'architecture n'ait été prise.

### STEP 6 — GP Hardening Real DB (`REQUIRES MANUAL RECONCILIATION`)

C'est le STEP lourd : **50 chemins en conflit** (72 fichiers `src/app`, 22 `src/lib` touchés par
GP sur une base `main` figée au 2026-07-29, contre ~570 commits d'évolution côté tronc). Un
`git merge` frontal ferait perdre deux mois d'évolution applicative.

**Interdit** : `git merge origin/claude/amazing-pascal-7lddkv`.

Séquence imposée :

1. **Écarter les 4 doublons SQL** (`191`, `192`, `193`, `196`) — SQL identique hors
   commentaires à `20260806000197/198/199` et `20260822000222` déjà dans le tronc.
2. **Extraire le delta de `190`** vers un nouveau fichier `20260923000335` ne contenant que les
   6 énoncés `role_gestion_*` RESTRICTIVE sur `public.chantiers` absents du tronc.
3. **Arbitrer les 3 recouvrements fonctionnels** de §3.3 (`184`↔`314`, `185`↔`323`,
   `198`↔`306`), chacun par la règle : rejouer le test pgTAP de GP sur le tronc **sans** la
   migration GP. Vert → migration GP abandonnée. Rouge → migration de convergence en
   `20260923000346+`, écrite à partir de l'état du tronc.
4. **Reprendre les 10 migrations franchement nouvelles** renumérotées `20260923000336` →
   `…345`, dans l'ordre source strict.
5. **Reprendre les 16 fichiers `supabase/tests/` de GP**, en écartant les 4 correspondant aux
   migrations abandonnées (`correctif_isolation_devis_client`, `correctif_isolation_relances_impayes`,
   `correctif_rls_ecriture_chantiers`, `verrouiller_facture_emise` — déjà en conflit mesuré).
6. **Ne PAS reprendre en bloc les 94 fichiers `src/`** de GP. Les reprendre **migration par
   migration**, en ne portant que le code applicatif exigé par une migration retenue à l'étape 4
   (typiquement : appels RPC dont la signature change). Tout le reste est de la dérive de base,
   pas du durcissement.
7. Ne **pas** reprendre `.gitignore`, `package.json`, `package-lock.json`, `next.config.ts` de GP
   (dérive de base).

Gate : `npm run verify:migrations` (≈335), `npm run typecheck`, `npm run lint`, `npm run test`,
suite pgTAP complète, **plus** le rejeu des témoins `docs/qualification/witnesses/*.sql` de GP.

### STEP 7 — Gel du train et bascule sur les gates de convergence

```
git tag elsatia-canonical-train-v1-rc
git push -u origin integration/elsatia-canonical-train-v1
```

Aucun merge au-delà de ce point tant que §5 n'est pas intégralement vert.

### STEP 8 — (hors train V1) Lot Studio post-H

Voir §7. **Ne pas exécuter** sans la décision d'architecture.

---

## 5. Gates à exécuter après convergence

Ordre imposé : les gates statiques d'abord (les moins chers, ils cadrent les suivants), la base
ensuite, l'applicatif enfin.

| # | Gate | Commande | Critère de succès | Point d'attention mesuré |
|---|---|---|---|---|
| G1 | **env manifest** | `npm run verify:env-manifest` && `npm run test:env-manifest` | 0 erreur | Studio config (8a) a retiré 4 variables du manifeste et en a câblé 4 : le manifeste doit rester cohérent après l'ajout des variables Billing V3 (`.env.local.example` en conflit au STEP 5) |
| G2 | **secrets** | `npm run verify:secrets` | 0 secret en clair | Billing V3 et GP ajoutent des scripts (`configurer-portail-stripe.mjs`, `scripts/dr/*`) : les rejouer sous `scripts/garde-scripts-production.mjs` |
| G3 | **migrations (collisions)** | `npm run verify:migrations` | « N migrations valides, noms et horodatages uniques » | **C'est le gate qui prouve §3.** Toute renumérotation ratée le fait échouer (code 1). N attendu ≈ 335 |
| G4 | **typecheck** | `npm run typecheck` | 0 erreur | Couvre racine + `apps/tools` + `apps/reserves` + `apps/colors`. **Ne couvre pas `apps/studio`** → ajouter `npm --prefix apps/studio run typecheck` |
| G5 | **lint** | `npm run lint` | 0 erreur | Même angle mort Studio → ajouter `npm --prefix apps/studio run lint` |
| G6 | **Vitest** | `npm run test` | Racine ≥ 1799/1799 (référence Boutique Idempotency) | + `npm --prefix apps/studio run test` (référence 260/260, Studio Worker V2) |
| G7 | **Fresh DB** | `supabase db reset` sur base vide | Les ~335 migrations s'appliquent dans l'ordre, sans erreur | **Le vrai test de §3.4** : c'est ici qu'un ordre de dépendance faux (ex. `201` avant `186`) casse |
| G8 | **Upgrade DB** | rejeu des seules migrations `20260923000331+` sur une base déjà à l'état `T0` | Aucune erreur, aucun `create or replace` n'écrase une définition plus récente | Cible les 3 recouvrements de §3.3 : c'est le scénario où GP `198` écraserait `T0` `306` |
| G9 | **pgTAP** | `supabase test db` | 100 % des fichiers exécutés **jusqu'au bout** | Le rapport post-fix documente **96/100 fichiers non exécutés** faute de `supabase`/Docker dans le bac à sable. **Ce gate ne peut pas être déclaré vert dans un environnement sans Supabase local complet** — c'est le blocage n°2 du tronc, il reste ouvert tant que l'environnement n'est pas fourni |
| G10 | **build** | `npm run build` && `npm run build:reserves` && `npm run build:colors` | 3 builds verts | **Studio absent de `npm run build`** → exécuter `npm --prefix apps/studio run build` séparément. Studio config (8a) était `PARTIALLY WIRED` à cause d'une fuite de `postcss.config.mjs` racine ; Studio Worker V2 déclare le build Studio vert — **à re-prouver sur le train** |
| G11 | **Studio worker** | tests réels du worker (26/26, rendus FFmpeg) + healthcheck | 26/26 | FFmpeg requis dans l'environnement de gate |
| G12 | **pilot fixture** | `scripts/local-postgres-bootstrap/pilot_acceptance_v3.sh` + `tests/e2e/pilot-acceptance-v3.spec.ts` | ≥ 125/143 (référence V3) et **aucune régression** sur les 125 PASS | Dépend du bootstrap local reconstruit par union au STEP 3 : si le merge des deux `pg_bootstrap.sql` est raté, ce gate le révèle |
| G13 | **Stripe** | `npm run verify:stripe-prices` + suite Boutique/Stripe (référence 89/89) + `route.test.ts` webhook abonnement | 89/89 + webhooks verts | Croise Billing V3 (abonnement), `T0` `…326` (Connect/Boutique) et `…330` (idempotence). **Point de convergence le plus dense du train** |
| G14 | **RGPD** | `supabase/tests/purge_entreprise_*.test.sql` (46 assertions) + dry-run/restauration/reprise de `scripts/purger-entreprise.mjs` | 46/46 + purge interrompue puis reprise sans perte | Valide que `20260923000331` s'applique bien **après** `20260922000327` |
| G15 | **preview preflight** | `npm run preflight:preview` && `npm run test:preflight-preview` | vert | Acquis via Preview closure (superseded dans `T0`), à re-prouver après l'ajout de Billing/GP |

**Gates supplémentaires recommandés, non présents dans `package.json`** :
- un `build:studio` / `typecheck:studio` / `lint:studio` / `test:studio` dans le `verify` racine,
  pour supprimer l'angle mort Studio constaté sur G4/G5/G6/G10 ;
- un contrôle qui refuse **deux migrations de même nom métier à horodatages différents**
  (`verify-migrations.mjs` ne détecte aujourd'hui que les horodatages dupliqués) : c'est
  exactement la classe de défaut qui a produit 5 des 9 collisions de §3.2.

---

## 6. Récapitulatif du périmètre réel de GP Hardening Real DB

| Catégorie | Nombre | Migrations | Traitement |
|---|---|---|---|
| SQL identique hors commentaires à une migration déjà dans `T0` | **4** | `191`, `192`, `193`, `196` | **DO NOT MERGE** |
| Sur-ensemble d'une migration de `T0` | **1** | `190` | extraire le delta → `20260923000335` |
| Même sujet que `T0`, SQL différent | **3** | `184`, `185`, `198` | **REQUIRES MANUAL RECONCILIATION** (§3.3) |
| Franchement absentes de `T0` | **10** | `186`, `187`, `188`, `189`, `194`, `195`, `197`, `199`, `200`, `201` | **CHERRY-PICK** renuméroté `…336`→`…345` |
| **Total** | **18** | | |

Le chantier GP passe donc de « 18 migrations et 145 fichiers » à « **10 migrations sûres, 1 delta,
3 arbitrages** » — c'est ce qui rend le STEP 6 exécutable plutôt qu'insoluble.

---

## 7. Le lot résiduel : Studio post-H (`REQUIRES ARCHITECTURAL DECISION`)

Découverte non anticipée par la cartographie V1, et **seule question du corpus qu'aucune règle
mécanique ne tranche**.

`fix/studio-signup-closed-v1` porte **7 migrations Studio totalement absentes du tronc** :

```
20260920010000_studio_render_admission.sql
20260920030000_studio_export_profiles.sql
20260920050000_studio_brand_kit.sql
20260920070000_studio_shares_watermark.sql
20260921010000_studio_audio_music.sql
20260921030000_studio_invitations.sql
20260921050000_studio_account_deletion.sql
```

plus ~61 fichiers applicatifs correspondants (`apps/studio/src/lib/{brand-kit,shares,invitations,
account-deletion,mailer,notices,observability,render-refusal,signup-gate}.ts`,
`apps/studio/src/app/{s/[token],invitations/[token],brand-kit,forgot-password,reset-password,
legal/[doc]}/…`, `apps/studio/scripts/rollback-post-h/*`), et ses propres scripts de
vérification de migration.

Faits vérifiés :

- Le tronc s'arrête à `20260913040000_studio_media_analysis.sql` : **il ignore l'intégralité du
  lot post-H**.
- Le tronc ne contient **aucune référence** à `brand_kit`, `studio_shares`, `studio_invitations`,
  `studio_account_deletion`, `studio_export_profiles`, `render_admission` ou `audio_music`
  (recherche sur `apps/studio` et `supabase`) : il n'y a **pas de référence pendante**, les deux
  états sont chacun cohérents.
- Les deux lignées ont **déplacé les migrations Studio** : `apps/studio/supabase/migrations/` sur
  la branche source, `supabase/migrations/` (racine, projet partagé) sur le tronc — **mêmes noms
  de fichiers, même contenu** pour les 8 migrations communes.

Ce déplacement **est** la décision d'architecture : il matérialise le choix
« projet Supabase partagé multi-app » contre « projet Supabase dédié à Studio ». C'est
littéralement le blocage n°4 du rapport post-fix convergence :

> *« Décision produit en attente, non tranchée ici : le choix projet-Supabase-dédié-ou-partagé
> pour Studio, qui détermine si le correctif signup RLS/RPC porté ici est la solution définitive
> ou une mesure intermédiaire. »*

Le même arbitrage explique le `DO NOT MERGE` sur `20260921070000_studio_signup_policy.sql` : la
version du tronc **refuse délibérément** le hook Auth `before_user_created` de la branche source,
au motif documenté dans son propre en-tête qu'un tel hook *« s'applique à TOUT le projet : il
refuserait aussi les inscriptions Gestion Pro/Colors/Tools/Réserves, qui sont déjà ouvertes par
design »*. Sur l'hypothèse « projet partagé », la branche source est **fonctionnellement
incorrecte** ; sur l'hypothèse « projet dédié », elle redevient la bonne réponse.

**Ce lot est exclu du train V1 — et il peut l'être sans dommage** : les 7 migrations et les
~61 fichiers sont strictement additifs (chemins neufs, horodatages `20260920`–`20260921` libres
dans la lignée du tronc), aucun des 9 autres chantiers n'en dépend, et le train reste cohérent
sans eux. Il sera intégrable en un lot unique **après** la décision, sans invalider aucun STEP
de §4.

---

## 8. Ce que le train ne ferme pas

Honnêteté sur les limites, à ne pas confondre avec des défauts du plan :

1. **G9 (pgTAP complet) est hors d'atteinte sans Supabase local complet.** Le blocage n°2 du
   rapport post-fix (96/100 fichiers non exécutés, `supabase` CLI et Docker absents) est un
   blocage **d'environnement**, que ce plan ne lève pas. Tant qu'il tient, le train ne peut pas
   être déclaré « qualifié pgTAP ».
2. **G8 (Upgrade avec données réelles) n'a jamais été exécuté** sur aucune branche du corpus.
3. Le train V1 **n'intègre pas** le lot Studio post-H (§7).
4. Les 10 FAIL résiduels de Pilot Acceptance V3 (dont 6 non-régressions connues : CH-09, FA-08,
   PE-07, PL-03, PL-05, PT-08) **restent ouverts** : le STEP 3 reporte le chantier tel qu'il est,
   il ne le corrige pas.
5. Le verdict Billing V3 est `BILLING SECURITY CLOSED / **COMMERCIAL DECISION REMAINS**` : le
   train ferme la sécurité, pas la décision tarifaire.
6. **Point d'arrêt sûr** : si le STEP 6 (GP) s'avère irréductible, le train **s'arrête au STEP 5**
   et reste cohérent, déployable et strictement supérieur à toute branche existante — il couvrira
   alors 8 des 10 chantiers. GP Hardening ferait l'objet d'un train V2 dédié.

---

## 9. Verdict

```
CANONICAL TRAIN MERGE PLAN READY
```

**Justification** :

- Les **10 chantiers demandés sont tous classés** : 2 `MERGE`, 3 `CHERRY-PICK`, 3 `SUPERSEDED`,
  1 `DO NOT MERGE`, 1 `REQUIRES MANUAL RECONCILIATION` — aucune catégorie « à étudier » ne
  subsiste.
- Les **7 collisions de numéro** et les **9 collisions de nom métier** sont toutes identifiées,
  toutes résolues nominativement (ancienne version → nouvelle version → ordre → dépendance,
  §3.4), et leur résolution est **vérifiable mécaniquement** par un gate qui existe déjà dans le
  dépôt (`npm run verify:migrations`, code de sortie 1 en cas d'horodatage dupliqué).
- L'ordre des opérations est **exécutable tel quel** : STEP 1 et 2 sans aucun conflit (simulation
  `merge-tree` propre), STEP 3 à 5 avec 15 conflits nominativement listés et une règle de
  résolution pour chacun, STEP 6 avec une procédure de réduction qui ramène GP de 18 migrations
  à 10 sûres + 1 delta + 3 arbitrages.
- Les **15 gates** sont ordonnés, chacun avec sa commande, son critère et son angle mort connu.
- La seule vraie question d'architecture du corpus — projet Supabase dédié ou partagé pour
  Studio — est **isolée hors du chemin critique** (§7) : son contenu est strictement additif,
  aucun des 9 autres chantiers n'en dépend, et le train V1 reste valide quelle que soit la
  réponse.

Le train **ne peut pas être exécuté par un merge automatique**, et ce plan ne le prétend pas :
il décrit 6 STEPs dont 2 sont mécaniques et 4 exigent une intervention humaine nommée, bornée et
outillée. C'est la différence entre « décision requise » et « plan prêt ».

**Prochaine action recommandée** : exécuter STEP 1 et STEP 2 (coût mesuré : 0 conflit) et
constater G3/G4/G6 verts — cela ferme le blocage n°1 du tronc et donne une base d'intégration
stable avant d'engager les STEPs à conflits.
