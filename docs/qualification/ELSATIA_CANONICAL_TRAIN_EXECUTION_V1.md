# ELSATIA — Exécution du train canonique V1

**Mandat** : exécuter `docs/qualification/ELSATIA_CANONICAL_TRAIN_MERGE_PLAN_V1.md`
(verdict source `CANONICAL TRAIN MERGE PLAN READY`, branche `claude/loving-volta-2l3kda`).
Mission autonome : toute ambiguïté → `DECISION_REQUIRED` → choix conservateur → documenté → on continue.

**Interdits respectés** : aucun merge vers `main`, aucune Preview, aucune Production, aucune
réécriture d'historique. Seule la branche dédiée est poussée.

| | |
|---|---|
| Branche finale | `integration/elsatia-canonical-train-v1` |
| Tronc (T0) | `origin/claude/magical-mccarthy-sm9lwb` @ `f34f2263` (recommandé par le plan §1) |
| HEAD | voir `git log -1` de la branche (le commit qui ajoute ce rapport) ; dernier commit technique avant rapport : `415474f6` |
| Migrations | **328** (T0 : 321), `verify:migrations` vert |
| Environnement de gate | PostgreSQL 16.13 natif + pgTAP 1.3, GoTrue et PostgREST réels compilés/téléchargés localement, `next dev` + Playwright/Chromium, FFmpeg système. Pas de Docker, pas de Supabase CLI. |

---

## 1. Branches intégrées — ce qui a réellement été fait

Toutes les têtes citées par le plan ont été re-vérifiées le jour de l'exécution : **inchangées**.

| # | Chantier | Branche @ tête | Décision du plan | Exécution réelle | Commit(s) du train |
|---|---|---|---|---|---|
| 1 | Boutique Idempotency | `claude/magical-mccarthy-sm9lwb` @ `f34f2263` | MERGE (tronc) | Tronc T0 | base |
| 2 | Studio Worker V2 | `claude/zen-goodall-n3opdc` @ `afd39126` | MERGE | Merge `--no-ff`, 0 conflit, 0 migration | `e8050504` |
| 3 | Tools entitlement | `claude/quirky-wozniak-pacjtb` @ `f8a17b34` | SUPERSEDED | Vérifié ancêtre de HEAD | — |
| 4 | Preview closure | `claude/vibrant-carson-e4izd1` @ `6c53b8e3` | SUPERSEDED | Vérifié : 0 fichier absent, seul `package.json` diffère (le train y ajoute les scripts `pilot:*`) | — |
| 5 | Studio config (8a) | `claude/studio-runtime-config-wiring-v1` @ `faebd709` | SUPERSEDED | Vérifié ancêtre de HEAD | — |
| 6 | Pilot Acceptance V3 | `claude/loving-turing-aaopod` @ `4056c5f3` | CHERRY-PICK | Merge `--no-commit` + déduplication avant commit (voir §2) | `9fdeaa3c`, `ce398e70` |
| 6b | **Pilot Quick Wins** (hors plan, demandé par la mission) | `claude/brave-feynman-6ogvtq` @ `b2d4bc7b` | — | Merge propre, 0 conflit (branche fille de Pilot V3) | `02d2639e` |
| 7 | RGPD Purge V2 | `claude/brave-planck-bzsvda` @ `26112ced` | CHERRY-PICK + renum. | Merge `--no-commit`, 1 migration abandonnée, 1 renumérotée, 5 conflits résolus | `65297c0e` |
| 8 | Billing Security V3 | `claude/great-mayer-bzxad6` @ `3e2a8bea` | CHERRY-PICK + renum. | Merge `--no-commit`, 2 migrations renumérotées, 8 conflits résolus | `aeda9603` |
| 9 | GP Hardening Real DB | `claude/amazing-pascal-7lddkv` @ `d42df217` | MANUAL RECONCILIATION | **Aucune migration reprise** — preuve mécanique §4 ; tests, témoins et rapports repris | `174e5aae` |
| 10a | Studio auth — politique signup | `fix/studio-signup-closed-v1` @ `634651a0` | DO NOT MERGE | Non intégré | — |
| 10b | Studio post-H (7 migrations + ~61 fichiers) | `fix/studio-signup-closed-v1` @ `634651a0` | REQUIRES ARCHITECTURAL DECISION | **Isolé, non intégré** (§7) | — |

Pourquoi des merges `--no-commit` plutôt que des cherry-picks : le merge conserve la provenance
(ancêtres Git auditables) et, pour Pilot, rend le merge des Quick Wins trivial ; **la
déduplication/renumérotation est faite dans l'index avant le commit**, donc aucune migration en
double n'a jamais existé dans un commit du train. GP, lui, n'est **pas** mergé (interdit par le
plan) : son commit de train est un commit ordinaire qui cite la tête source.

Commits de convergence propres au train (après les STEPs) :

| Commit | Objet |
|---|---|
| `5b02a1f3` | Migration de convergence `20260923000346` (ACL PL-05, §3) |
| `344fa953` | `pilot-acceptance-v3.spec.ts` : 4 `require()` → imports ES (le lint racine échouait et masquait Tools/Reserves/Colors) |
| `cf75c96d` | Manifeste d'environnement aligné (18 erreurs → 0) |
| `ed3d4039` | PE-06 et CH-08 : corrections d'automatisation e2e |
| `415474f6` | NF-01 : corrections d'automatisation e2e |

---

## 2. Migrations — renumérotations, abandons, ajouts

### 2.1 Mapping de renumérotation (contenu SQL inchangé, octet pour octet)

| OLD | NEW | SOURCE_BRANCH | REASON | DEPENDENCY |
|---|---|---|---|---|
| `20260922000325_pl02_garde_fou_affectation_employe_actif` | `20260923000334` | `claude/loving-turing-aaopod` | Horodatage pris par `studio_signup_policy` du tronc | `20260922000328` (`taux_horaire`) |
| `20260729000185_purge_entreprise_architecture_v2` | `20260923000331` | `claude/brave-planck-bzsvda` | Horodatage pris par `isolation_multitenant_grants_et_definer` du tronc | `20260922000327` (purge V1 du tronc) |
| `20260922000184_verrouillage_colonnes_commerciales_entreprises` | `20260923000332` | `claude/great-mayer-bzxad6` | Horodatage pris par GP `184` (et hors ordre sur le tronc) | schéma `entreprises` |
| `20260922000185_horodatage_events_abonnement_et_delai_grace` | `20260923000333` | `claude/great-mayer-bzxad6` | Idem GP `185` | `…332` |

Les migrations Pilot Quick Wins `20260923000326` (CM-06) et `20260923000327` (PL-05) sont gardées
**à leur numéro d'origine** : aucune collision, et l'ordre `326 < 327 < 331 < … < 334` est valide
(pas de dépendance entre elles et les lots suivants). Renuméroter « uniquement le nécessaire ».

Les commentaires de migration qui citent l'ancien numéro (`…333` cite `20260922000184`, `…331`
cite `20260729000185` dans un message d'erreur) sont **laissés tels quels** : on ne modifie pas le
texte d'une migration renumérotée. Les références dans les tests, scripts, seeds et runbooks
opérationnels ont été mises à jour (`ce398e70`, `65297c0e`).

### 2.2 Abandons (déduplication vérifiée octet pour octet, `cmp`)

| Abandonnée | Identique à (déjà dans T0) |
|---|---|
| Pilot `20260922000323_securiser_taux_horaire_facture_employe` | `20260922000328` |
| Pilot `20260922000324_correctif_statut_avoir_emis_facture_origine` | `20260922000329` |
| RGPD `20260729000184_purge_entreprise_supprimee` | `20260922000327` |
| GP — les 18 | voir §4 |

### 2.3 Migration de convergence ajoutée

| Nouvelle | Raison |
|---|---|
| `20260923000346_convergence_acl_peut_consulter_affectation_employe` | PL-05 (`…327`, écrite sur la lignée Pilot) crée une fonction `SECURITY DEFINER` sans retirer `EXECUTE` à `PUBLIC`/`anon`. Les gates pgTAP du tronc `isolation_multitenant_surface` (test 8) et `security_remediation_anon_execute_revocation_v1` (test 4) échouaient. Même ACL que la jumelle `peut_consulter_pointage_employe`. Corps et policy inchangés. Numéro pris dans la plage réservée par le plan §3.4 (`346+`). |

---

## 3. Conflits résolus

### STEP 3 — Pilot Acceptance V3
`scripts/local-postgres-bootstrap/{README.md,pg_bootstrap.sql}` (add/add) : la version Pilot est un
**sur-ensemble strict** de celle du tronc (0 ligne supprimée) → reprise telle quelle (= l'union
demandée par le plan).

### STEP 4 — RGPD Purge V2
Le tronc portait **exactement** la V1 (`ea6a95b0`) pour 4 des 5 fichiers :
`scripts/purger-entreprise.mjs`, `src/lib/rgpd.ts`, `src/lib/rgpd.test.ts`,
`supabase/tests/purge_entreprise_supprimee.test.sql` → côté V2. `src/app/actions/rgpd.ts` : la V2
ne le modifiait pas depuis la V1 → côté tronc (qui l'a fait évoluer : `messageErreurUtilisateur`,
suppression Storage via client admin).

### STEP 5 — Billing Security V3 (point de convergence le plus dense)
| Fichier | Résolution |
|---|---|
| `.env.local.example` | Tronc (catalogue canonique V4, variables héritées Essentiel/Premium déjà présentes) + `STRIPE_PORTAL_CONFIGURATION_ID`. Doublons `COMPTE_SUP_*` créés par le merge retirés. `STRIPE_DELAI_GRACE_PAIEMENT_JOURS` **non repris** (non câblé, §6). |
| `docs/DECISIONS_TARIFICATION_NON_RECOMMANDEES.md` | Union : points 8 et 9 Billing repris ; point 2 réécrit pour dire exactement ce qui est porté. |
| `src/app/actions/plateforme.ts` | Tronc (saga de remise serveur) ; les écritures en mode prototype passent par `createAdminClient` (apport Billing, requis par `…332`). |
| `src/app/onboarding/besoins/page.tsx` | Tronc (tarif canonique « 2 mois offerts ») ; le calcul de remise Billing, devenu mort, retiré. |
| `src/app/api/cron/abonnements/route.ts` | Structure du tronc + appel `appliquer_suspensions_impayes` (Billing) dans `executerJobsHistoriques`. |
| `src/app/api/stripe/abonnement/webhook/route.ts` | Architecture du tronc (relecture Stripe, RPC de service, verrou remise) ; logique facture Billing portée : **3-D Secure ne suspend plus** ; **`invoice.paid` efface `impaye_signale_at`/`suspension_prevue_at`** (sinon le nouveau cron re-suspendrait un client qui a payé). `invoice.payment_failed` garde la suspension immédiate du tronc. |
| `route.test.ts`, `stripe-abonnement.test.ts` | Tronc + tests Billing du Portail Stripe + 3 nouveaux tests des règles facture portées. `src/test/fakeSupabaseAdmin.ts` (sans consommateur) retiré. |
| pgTAP `verrouillage_colonnes_commerciales_entreprises` | L'étape `service_role` efface le `sub` JWT de l'étape précédente (sinon le garde-fou du tronc `proteger_facturation_entreprise` refuse, à juste titre). 9/9. |

Vérification spécifique de `…332` (revoke `UPDATE` + liste de colonnes) sur le schéma du tronc :
la liste Billing est un **sous-ensemble strict** des 81 colonnes que le tronc accorde déjà, qui
retire exactement les colonnes commerciales (+ `abonnement_essai_debut`, colonne du tronc).
Aucune écriture applicative par client `authenticated` sur ces colonnes ne subsiste (`grep`).

---

## 4. STEP 6 — GP Hardening : réconciliation par preuve (le plan était obsolète sur ce point)

Le plan comptait « 10 migrations franchement nouvelles + 1 delta + 3 arbitrages ». **Preuve
mécanique contraire** : chaque migration GP a été appliquée sur un clone de la base du train
(après STEP 5), avec `pg_dump --schema-only` avant/après.

| Résultat | Migrations GP | Détail |
|---|---|---|
| **No-op strict** (schéma identique, hors jeton `\restrict`) | `185 186 187 188 190 191 192 193 194 197 200 201` | 12/18. Dont `190` : les policies `role_gestion_{insert,update,delete}` RESTRICTIVE sur `chantiers` **existent déjà** dans le tronc (le « delta » du plan est vide) ; `186` ≡ tronc `20260729000185` ; `201` ≡ tronc `20260729000187`. |
| **Régression si appliquée** | `184` | Remplace `plateforme_ajouter_admin`/`plateforme_retirer_admin` par une version **sans AAL2 ni exigence de rôle `total`** (le tronc `…314`+ est strictement plus sûr). |
| | `189` | `grant select, insert, update on public.entreprises to authenticated` : **ré-ouvre l'UPDATE table-large** et annulerait `…332` (colonnes commerciales). |
| | `196`, `199` | Retirent `relance_auto_exclue` des champs libres du verrou facture (régression de `20260922000304`). `196` est en outre une ancienne version de `20260822000222`. |
| | `198` | Retire le plafond « montant contractuel avenants compris » et le passage `avoir_emis` du tronc (`…306`, `…329`). |
| | `195` | Retire `chantier_id` du verrou devis accepté → **DECISION_REQUIRED** (§8). |

**Règle du plan appliquée** (« rejouer le test pgTAP de GP sur le tronc **sans** la migration GP :
vert → migration abandonnée ») : 14/16 tests GP verts sans leur migration ; les 2 autres :
`plateforme_admin_role_total_ferme_autopromotion` (fixture incompatible avec la contrainte
`plateforme_admins_actif_requiert_utilisateur_id` du tronc ; son test source
`gp_pilot_plateforme_admin_role_total` passe 6/6) et `verrou_devis_accepte_et_expiration_essai`
(échoue précisément sur l'assertion « chantier_id n'est pas verrouillé »).

Repris de GP : les 10 tests pgTAP nouveaux qui passent sans leur migration (**57/57**, en-tête
de provenance ajouté), les témoins `docs/qualification/witnesses/`, les rapports GP. Aucun
fichier `src/` (dérive de base, conformément au plan §STEP 6.6). Témoins rejoués sur le train :
`20` 11/11, `21` 6/6, `25` 6/6 ; `22` bloqué par la même contrainte `plateforme_admins` ; `23`/`24`
obtiennent un refus **plus précoce** (`permission denied`, ACL colonne du tronc) au lieu du
message de trigger attendu — l'écriture est bien refusée, seul le libellé diffère.

---

## 5. Gates

### 5.1 Base de données

| Gate | Résultat |
|---|---|
| G3 `verify:migrations` | ✅ 328 migrations valides, noms et horodatages uniques |
| G2 `verify:secrets` | ✅ 2 628 fichiers, aucun secret (2 exceptions nommées) |
| G7 Fresh DB | ✅ `rebuild_db.sh` : **328/328** migrations appliquées sur base vide (≈20 s) |
| G8 Upgrade DB | ✅ Base **à l'état T0 (321)** + fixture pilote complète (28 salariés, 7 chantiers, 300 affectations, 300 pointages, 7 factures…) puis rejeu des seules nouvelles migrations (`326 327 331 332 333 334`, puis `346`) : 0 erreur, **compteurs de données inchangés**, et **schéma après upgrade identique au schéma fresh** (`pg_dump -s`, seul le jeton `\restrict` diffère). Objets redéfinis : uniquement les fonctions de purge V1→V2 (voulu), + nouveaux triggers/policy/fonctions. |
| G9 pgTAP maximal | 117 fichiers exécutés jusqu'au bout ou jusqu'à l'erreur : **106 PASS**, **2 463 assertions ok / 23 not ok**. Détail ci-dessous. |

Échecs pgTAP :

| Fichier | Statut sur T0 seul | Cause |
|---|---|---|
| `purge_entreprise_architecture_v2` (8 not ok), `purge_entreprise_supprimee` (1 not ok) | n/a (tests RGPD) | **Défaut d'intégration réel RGPD × tronc**, §6 — DECISION_REQUIRED |
| `studio_analysis/editor/media_upload/project_management/render_engine/templates/timeline` (7) | ❌ identique | Fixtures bloquées par `studio_signup_policy` du tronc (« Inscription fermée ») — dette de tests du tronc |
| `platform_stripe_state_attestation_r72` (14 not ok) | ❌ identique | Stub `pgsodium` du bac à sable (signatures) |
| `elsatia_tools_cloud_sync_entitlement_closure_v1` | ❌ identique | `permission denied for table tools_projects` (privilèges par défaut Supabase non reproduits localement) |

**Aucune régression pgTAP introduite par le train** : les deux régressions détectées en cours de
route (`isolation_multitenant_surface`, `security_remediation_anon_execute_revocation_v1`) sont
corrigées par `…346`.

### 5.2 Applications (HEAD final)

| App | typecheck | lint | tests | build |
|---|---|---|---|---|
| Gestion Pro | ✅ | ✅ (0 erreur, 15 warnings préexistants) | ✅ 1 806/1 806 (154 fichiers) | ✅ `next build` complet |
| Tools | ✅ | ✅ | ✅ 1 992/1 992 | ✅ avec `NEXT_PUBLIC_TOOLS_ENV=local` * |
| Reserves | ✅ | ✅ | ✅ 178/178 | ✅ avec `ELSATIA_APPLICATION_ENV=local` * |
| Colors | ✅ | ✅ | ✅ 427/427 | ✅ avec `ELSATIA_APPLICATION_ENV=local` * |
| Studio (commandes explicites `npm --prefix apps/studio …`) | ✅ | ✅ | ✅ 260/260 | ✅ |

\* Les gardes de pré-build refusent volontairement un build sans variables publiques ; elles
indiquent elles-mêmes ce mode pour une recette locale. Sans variables, `npm run build` échoue
dans la partie Tools **après** un `next build` Gestion Pro complet — comportement voulu.

Note : avant `344fa953`, `npm run lint` échouait (4 erreurs dans le spec e2e Pilot) **et
n'exécutait donc jamais** le lint Tools/Reserves/Colors (chaîne `&&`).

### 5.3 Pilot

| Gate | Résultat |
|---|---|
| `npm run pilot:acceptance:v3` (GoTrue réel compilé, PostgREST réel, stockage simulé) | ✅ exit 0 ; scénarios Auth/RLS/session **tous PASS** ; runner backend **70 PASS / 1 MANUAL_EXPECTED / 0 FAIL** sur 71 |
| Playwright V2 + V3 (`next dev` + Chromium) | ✅ **32/32** (rejoués un par un, rate-limiter de connexion vidé entre deux — geste documenté par la V2) |
| pgTAP quick wins | ✅ CH-08 9/9, CM-06 11/11, PL-05 12/12, PL-02 9/9 |

Découvertes d'automatisation (aucune modification produit) :
- **`127.0.0.1` ≠ `localhost`** : `playwright.config.ts` vise `127.0.0.1:3100` par défaut ; Next 16
  en dev bloque les ressources `/_next/*` pour une autre origine → la page s'affiche mais **ne
  s'hydrate jamais** (aucune clé `__react*`, `useEffect` jamais exécuté). Toute interaction
  client échoue en silence. Il faut `E2E_BASE_URL=http://localhost:3100` (documenté dans
  `pilot_acceptance_v3.sh`).
- **PE-06** : en plus du point précédent, canvas hors viewport pour `page.mouse`. Le test défile
  et redessine jusqu'à mesurer de l'encre. **PASS**, signature persistée en base. Le verdict
  `AUTOMATION_FALSE_POSITIVE` du rapport Quick Wins est **confirmé en e2e**.
- **CH-08** : le produit répondait bien **HTTP 404** ; l'assertion ne regardait que le texte. **PASS**.
- **NF-01** : le symptôme V3 (redirection `/login`) **ne se reproduit pas** sur le train. Deux
  dérives du test : « Montant TTC » désormais requis, et soumission partie avant la fin de
  l'upload asynchrone. **PASS**.

#### Matrice des 143 contrôles mise à jour

```
                V3 (réf.)    Train canonique V1
PASS            125 (87 %)   130 (91 %)
FAIL             10 ( 7 %)     5 ( 3 %)
MANUAL_EXPECTED   5 ( 3 %)     5 ( 3 %)
REMOTE_ONLY       3 ( 2 %)     3 ( 2 %)
Total           143          143
```

Passés à PASS : **CH-08** (pgTAP + e2e), **CM-06** (pgTAP), **PL-05** (pgTAP + runner),
**PE-06** (e2e), **NF-01** (e2e). FAIL restants, non traités (hors périmètre quick wins) :
CH-09, FA-08, PL-03, PE-07, PT-08.

### 5.4 RGPD
Voir §6 : `purge_entreprise_architecture_v2` **18/26**, `purge_entreprise_supprimee` **19/20** sur
le train. Mêmes suites **26/26** avec le prototype de convergence (non appliqué).

### 5.5 Stripe / Boutique

| Gate | Résultat |
|---|---|
| Vitest Stripe/Boutique/abonnement/webhook/remise/capacité (24 fichiers) | ✅ 340/340 |
| pgTAP Stripe/Boutique/capacité (20 fichiers) | ✅ 20/20 verts (hors `r72`, stub pgsodium, identique sur T0) |
| Idempotence `boutique_finaliser_commande_payee` | ✅ 15/15 |
| **Concurrence réelle** (2 sessions psql simultanées, même commande) | ✅ la 2ᵉ session **bloque 2,4 s** jusqu'au commit de la 1ʳᵉ ; stock **10 → 7** (une seule décrémentation) ; **1** dépense fournisseur |
| Billing security (`verrouillage_colonnes_commerciales_entreprises`) | ✅ 9/9 |
| `verify:stripe-prices` | SKIP (pas de clé Stripe — non bloquant, attendu) |

### 5.6 Studio worker
`workers/studio-video` : typecheck ✅ ; tests avec le FFmpeg système (substitution temporaire
du binaire `ffmpeg-static`, restauré ensuite — méthode de la baseline V2) : **22 passed,
4 skipped**, `analysis.test.ts` en échec faute d'OpenCV (optionnel) — **identique à la baseline
V2**. Avec le binaire `ffmpeg-static` fourni : 3 échecs (`drawtext` absent), défaut connu et
déjà mitigé par le `Dockerfile`.

### 5.7 Env

| Gate | Résultat |
|---|---|
| `verify:env-manifest` | ✅ 0 erreur (18 avant `cf75c96d`), 14 DECISION_REQUIRED non bloquantes (préexistantes) |
| `test:env-manifest` | ✅ 58/58 |
| `test:preflight-preview` | ✅ 5/5 |
| `preflight:preview` | Rapport **NO-GO — 29 erreurs ENV** : aucune valeur réelle dans ce bac à sable (attendu, Preview hors mandat) |

---

## 6. Échec réel : RGPD Purge V2 × verrou de facture du tronc

**Constat** : sur le train, `purger_table_entreprise(<entreprise>, 'chantiers'|'devis')` renvoie
`ok=false, erreur='Cette facture a déjà été émise et ne peut plus être modifiée.'` dès qu'une
facture émise référence la ligne purgée. La V2 a été qualifiée sur une base `main` qui n'avait pas
le trigger `verrouiller_facture_emise` (`20260822000222`, tronc). La purge doit écrire
`factures.purge_snapshot` et laisser la FK passer `chantier_id`/`devis_origine_id` à `NULL` ; le
verrou refuse les deux.

**Preuve de cause** : le même test, trigger désactivé dans la transaction de test → 26/26.

**Mode d'échec** : sûr (aucune exception, aucune suppression partielle, résultat tracé), mais la
purge d'une entreprise ayant émis des factures **ne peut pas aboutir** sur le train.

**Pourquoi non corrigé** (choix conservateur) : c'est un arbitrage entre l'immutabilité des
factures émises et l'effacement RGPD, avec une portée juridique. Il n'est pas tranché
silencieusement dans une migration.

**Proposition prête (prototypée sur un clone, non committée)** :
1. `purger_table_entreprise` pose `set_config('elsatia.purge_en_cours','on', true)` juste avant
   `_snapshot_avant_purge` + `DELETE`, et le remet à `''` juste après.
2. `verrouiller_facture_emise` ignore **uniquement** `chantier_id`, `devis_origine_id` et
   `purge_snapshot` quand ce drapeau vaut `on` (toutes les autres colonnes restent verrouillées).

Mesuré sur le clone : `purge_entreprise_architecture_v2` **26/26**, `verrouiller_facture_emise`
6/6, `factures_relance_auto_exclue_verrou_v1` 20/20, `correctif_isolation_factures` 10/10. Reste
`purge_entreprise_supprimee` test 17 (F3), invariant statique trop strict sur ce schéma : il
signale la FK composite `factures_devis_origine_entreprise_fkey` (NO ACTION), alors que la FK
simple `factures_devis_origine_id_fkey` (SET NULL) sur la même colonne la neutralise en fin
d'instruction — la purge réelle de `devis` passe (test 12 vert). Le test devrait exclure ce cas.

---

## 7. Éléments volontairement exclus

| Élément | Raison |
|---|---|
| Lot Studio post-H (`fix/studio-signup-closed-v1` : 7 migrations `20260920*`–`20260921*`, ~61 fichiers `apps/studio`) | Décision d'architecture projet Supabase **partagé vs dédié** non tranchée (plan §7). Strictement additif, aucun autre lot n'en dépend : intégrable en un lot unique après décision. |
| `studio_signup_policy` de `fix/studio-signup-closed-v1` | DO NOT MERGE : le tronc porte une version délibérément différente (le hook Auth global refuserait les inscriptions des autres apps). |
| Les 18 migrations GP | 12 no-op, 6 régressions (§4). |
| 94 fichiers `src/` + `package*.json`, `.gitignore`, `next.config.ts` de GP | Dérive de base (plan §STEP 6.6-7). |
| Délai de grâce de paiement Billing V3 (`STRIPE_DELAI_GRACE_PAIEMENT_JOURS`) | Exige aussi de modifier la RPC `synchroniser_abonnement_stripe_service` (past_due → suspendu) du tronc ; en portant seulement la partie webhook, le réglage serait trompeur. |
| Garde « hors-ordre » par `abonnement_dernier_evenement_at` (Billing V3) | Supplantée : le tronc relit l'abonnement chez Stripe à chaque événement. La colonne (`…333`) est créée, sans effet. |
| `playwright.config.ts` (`baseURL` par défaut) | Non modifié (portée sur toutes les suites e2e) ; exigence `E2E_BASE_URL=http://localhost:3100` documentée. |

---

## 8. Décisions restantes

| ID | Question | Choix conservateur appliqué |
|---|---|---|
| `DECISION_REQUIRED:RGPD-PURGE-VS-FACTURE-EMISE` | La purge RGPD peut-elle délier (`SET NULL` + `purge_snapshot`) une facture émise ? | Verrou conservé ; purge en échec sûr ; proposition prête §6 |
| `DECISION_REQUIRED:DEVIS-ACCEPTE-CHANTIER-ID` (GP `195`) | Réassigner un devis **accepté** à un autre chantier doit-il être possible ? Le tronc (aligné sur la production) le **refuse en base**, alors que `associerDevisChantierAction` le propose : l'action échoue donc pour un devis accepté. | Verrou du tronc conservé |
| `DECISION_REQUIRED:BILLING-GRACE-PERIOD` | Durée de grâce avant suspension + portage dans la RPC de synchronisation | Suspension immédiate du tronc conservée |
| Studio Supabase partagé/dédié | cf. §7 | Lot isolé |
| CM-06 | La règle « supprimable seulement en brouillon/annulée » est désormais inviolable en base ; à reconfirmer côté métier (rapport Quick Wins §5.3) | Garde intégrée |
| Preview | Inventaire des projets Vercel/Supabase Preview réels (`DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY` du manifeste) | Hors mandat |

Dettes de tests du tronc révélées (non introduites par le train, non corrigées ici) : 7 suites
pgTAP Studio bloquées par la politique d'inscription, `r72` (pgsodium), Tools cloud sync
(privilèges locaux), témoins GP `22`–`24`.

---

## 9. Verdict

```
CANONICAL TRAIN LOCALLY QUALIFIED
```

- Les 11 lots demandés sont classés et traités : 3 intégrés par merge, 3 par merge avec
  déduplication/renumérotation, Pilot Quick Wins par merge, 3 SUPERSEDED vérifiés, GP réconcilié
  par preuve, Studio post-H isolé.
- Fresh DB 328/328, Upgrade DB représentatif avec données = schéma identique au fresh,
  `verify:migrations`/`verify:secrets`/`verify:env-manifest` verts.
- 5 applications : typecheck, lint, tests, build **verts** (Studio par commandes explicites).
- Pilot : backend 70/0, Auth/RLS tout vert, Playwright 32/32, matrice 125 → **130 PASS**.
- Stripe/Boutique : 340 Vitest, pgTAP verts, idempotence et **concurrence réelle** prouvées.
- Aucune régression pgTAP introduite par le train.

**Pourquoi pas `READY FOR PREVIEW EXECUTION`** : (1) la purge RGPD V2 ne peut pas aboutir pour une
entreprise ayant des factures émises tant que `RGPD-PURGE-VS-FACTURE-EMISE` n'est pas tranchée ;
(2) `preflight:preview` est NO-GO faute de valeurs d'environnement réelles ; (3) la suite pgTAP
n'est pas à 100 % (9 fichiers hérités du tronc, dépendants de l'environnement ou de fixtures).

**Pourquoi pas `BLOCKED`** : chacun de ces points échoue de façon sûre ou relève de
l'environnement ; aucun n'est une incohérence du train, et le correctif RGPD est prêt et mesuré.

**Prochaine action recommandée** : trancher `RGPD-PURGE-VS-FACTURE-EMISE`. Si la réponse est
« oui », appliquer la proposition §6 en `20260923000347` et ajuster l'invariant F3 : le train
passe alors G14 sans autre changement.
