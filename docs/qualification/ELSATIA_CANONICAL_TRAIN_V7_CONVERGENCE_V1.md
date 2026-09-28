# ELSATIA — Canonical Train V7 : convergence post-V6 (V1)

| | |
|---|---|
| Date | 2026-09-28 |
| Base | `integration/elsatia-canonical-train-v6` @ `9102ec80` (verdict `CANONICAL TRAIN V6 LOCALLY QUALIFIED` ; 358 migrations, dernière `20260928000601`), **non modifiée** |
| Branche | `integration/elsatia-canonical-train-v7` (poussée aussi sur la branche de travail `claude/fervent-curie-v8zov4`, même commit) |
| Migrations | **359**, dernière **`20260928000701`** (+1 dans le projet partagé, renumérotée ; aucune migration V6 modifiée) · projet Studio dédié **21** (+7) |
| Moteur | PostgreSQL 16 réel + pgTAP 1.3, amorce `scripts/local-postgres-bootstrap` (sans Docker) ; Node 22 ; Playwright 1.62.1 + Chromium 1194 ; GoTrue v2.196.0 / v2.192.0 compilés, PostgREST v12.2.3, storage-api v1.79.22 compilé |
| Actions distantes | **Aucune.** Aucun Supabase hébergé, aucun Vercel, aucun Stripe réel, aucune Production, aucun merge vers `main`, V7 **non déployé**. |

## 0. Verdict

**`CANONICAL TRAIN V7 LOCALLY QUALIFIED`**

Les 5 lots post-V6 sont intégrés sans toucher à V3, V4, V5 ni V6 (branches, migrations et rapports
historiques inchangés). Une seule migration partagée nouvelle (Relevé Lot 7), renumérotée
`…0928 1101` → **`…0928 701`**, juste après la dernière migration réelle de V6. Les 7 migrations Studio
post-H restent dans le **projet dédié**. Base neuve **359/359**, 0 erreur.

**Upgrade V6 → V7 avec données réalistes** (base V6 construite depuis V3, données de l'ère V6) :
- 0 écart de lignes sur 271 tables, **91/91 empreintes métier identiques** ;
- policies 639 → 639 (0 supprimée, modifiée ou ajoutée) ; sonde RLS **0 écart sur 1 479 cellules** ;
- grants inchangés ; schéma et ACL identiques au fresh ; **31/31 contrôles métier**.

Autres preuves :
- **pgTAP** : **144/153 propres, 0 régression**. Les 152 fichiers communs donnent des résultats identiques à V6 ; la suite Lot 7 passe 51/51.
- **Applications** : les 5 passent typecheck, lint, Vitest et build ; le worker Studio passe 42/42.
- **Playwright** :

  | Recette | Résultat |
  |---|---|
  | Relevé Lots 2→7 + Atelier | **83/83** |
  | Réserves | **59/59** |
  | D-01 | **7/7** |
  | GP ↔ Réserves | **5/5 ×3** |
  | Stripe réabonnement | **6/6 ×2** |
  | Colors | **73/73** |
  | Studio Dedicated E2E | **21/21**, 5/5 canaris |

- **Chaîne Studio dédiée** : 21 migrations, 0 table GP, **829 pgTAP** ; upgrade de la chaîne 14 → 21 : schéma identique au fresh.
- **DR sur V7** : `npm run dr:verify -- --db-only` passe **32/32**, avec les 4 catastrophes, une comparaison stricte à 0 écart et les smokes → `ELSATIA DR LOCALLY QUALIFIED`. `--backup` : sauvegarde vérifiée. Auth DR (vrai GoTrue) : **12/12**. Storage DR : `STORAGE_NOT_PROVEN` dans ce conteneur (§15).
- **Seeds** : **ALL ACTIVE SEEDS QUALIFIED, 16/16** sur 359.
- **DB verify** : **30 contrôles, GO local**.
- **Studio** reste **OFF** pour la première Preview.
- **E-mail** : aucune adresse de support ni aucun fournisseur activé.

---

## 1. Lots post-V6 intégrés

| Lot | Branche | Tip | Base de la branche (ancêtre de V6) | Verdict d'origine | Intégration V7 |
|---|---|---|---|---|---|
| A. Relevé & Métré Lot 7 | `claude/nifty-edison-mevolm` | `62ebcb1c` | `d734f255` (tip Lot 6) | RELEVE METRE LOT 7 LOCALLY QUALIFIED | merge `--no-ff` (5 commits), sans conflit (`e8f0e998`) |
| B. Studio post-H | `claude/modest-pasteur-izfaqm` | `b91084fc` | `fb7082c6` (Studio DB guards) | STUDIO POST-H LOCALLY QUALIFIED | merge `--no-ff` (1 commit), sans conflit (`38f24ca4`) |
| C. Studio Dedicated E2E | `claude/jolly-volta-doejq2` | `a8c09c5a` | `b91084fc` (= B) | STUDIO DEDICATED E2E LOCALLY QUALIFIED | merge `--no-ff` (6 commits propres), sans conflit (`baef9b68`) |
| D. Transactional Email Architecture | `claude/practical-ritchie-yvsg3f` | `98de5d39` | `f6399f15` (tip V5) | ELSATIA EMAIL ACTIONS REQUIRED | merge `--no-ff` (1 commit, technique seule), sans conflit (`fffd1b40`) |
| E. Disaster Recovery V2 | `claude/determined-rubin-zdzpmy` | `7249ca86` | `f6399f15` (tip V5) | ELSATIA DR LOCALLY QUALIFIED | merge `--no-ff` (4 commits), 2 conflits (§3) (`ddaed06c`) |

Ordre : A → B → C → D → E (ordre de la mission). Viennent ensuite les commits propres à V7, **en commits
séparés** (aucun correctif dans les commits de merge) :
1. renumérotation (`80f0ad34`) ;
2. harnais d'upgrade (`4b2a9529`) ;
3. attendus du train, DB verify, manifeste et seeds (`4c4a347d`) ;
4. DR adapté (`898183e4`) ;
5. rapport.

Aucun commit de V6 n'est rejoué ni réécrit.

**Lot D, e-mail.** Seuls les changements techniques du commit `98de5d39` sont intégrés :
- garde Preview ;
- origines par application ;
- gabarit ;
- journal masqué ;
- nettoyage Sentry ;
- tests.

Aucune décision de son rapport (A-1 à A-9) n'est tranchée (§17).

### Performance baseline (mission §2)

Aucune branche d'`origin` ne porte le verdict `ELSATIA PERFORMANCE BASELINE ESTABLISHED`, que ce soit au
démarrage ou en fin de mission.

| Branche | Constat | Classement |
|---|---|---|
| `claude/brave-carson-cj8ofz` @ `ebc79ec4` | « perf(baseline-v1) : bancs de mesure, correctifs RLS/devis/planning et résultats bruts (**étape**) » | non qualifiée → candidate **V7.1 / V8** après verdict, **non intégrée** |
| `perf/gp-capacity-readiness-v1` @ `1669e5cd` (2026-09-20) | antérieure à V3, sans verdict baseline | hors périmètre |

Autres branches apparues pendant la mission, **inventoriées seulement** (hors mission, candidates V7.1 / V8) :

| Branche | Tip | Objet |
|---|---|---|
| `claude/great-mendel-w9qt6c` | `0ec193e3` | Relevé Lot 8, « LOCALLY QUALIFIED » |
| `claude/elsatia-v6-security-redteam-v2` | `8307d5be` | red team V2 sur V6 |
| `claude/ecstatic-fermat-bcqats` | `375b35dd` | red team V1 |
| `claude/busy-darwin-tlpi3p` | `d43e1c12` | billing B-1…B-5 |
| `claude/gifted-cori-vv7scp` | `b7a534fa` | gate de commercialisation |

## 2. Classification par commit

| Commit | Lot | Statut | Note |
|---|---|---|---|
| `d5161f4a` objets de plan, catégories, verrou, corbeille (migration 1101) + pgTAP | A | **NEW** | migration renumérotée `…0928 701` (§4) |
| `f88f6b4b`, `5cb8dc83` domaine et éditeur Lot 7 (calques, groupes, liaison au mur, SVG, DXF) | A | **NEW** | `packages/releve-domain`, `apps/tools` |
| `225fa673` recette Playwright Lot 7 | A | **TEST_ONLY** | |
| `62ebcb1c` rapport Lot 7 | A | **DOC_ONLY** | historique (numéro d'origine 1101), non réécrit |
| `b91084fc` lot post-H sur la fondation dédiée | B | **NEW** | 7 migrations **du projet dédié**, aucune partagée |
| `cb9904fb` … `a7a72c96` banc E2E dédié, CI `studio-dedicated-e2e.yml`, canaris | C | **TEST_ONLY** + **NEW** (`Notice`, CI) | |
| `a8c09c5a` rapport | C | **DOC_ONLY** | |
| `98de5d39` architecture e-mail | D | **NEW** (technique) + **DOC_ONLY** (rapport, décisions ouvertes) | |
| `16bbaa5e`, `adaec6b3` outillage DR V2 | E | **NEW** | adapté à V7 (§15) |
| `b58d9037`, `7249ca86` rapports DR | E | **DOC_ONLY** | historiques, non réécrits |

Classement : aucun commit **IDENTICAL**, aucun **DO_NOT_PORT**, aucun **CONFLICT** non résolu.

## 3. Conflits et réconciliations

| Fichier | Lots | Statut | Résolution |
|---|---|---|---|
| `config/env-manifest.json` | B/C (4 variables Studio : `STUDIO_MAIL_PROVIDER`, `STUDIO_MAIL_FROM`, `STUDIO_RESEND_API_KEY`, `STUDIO_LEGAL_TEXT_VERSION`) + D (e-mail) ↔ E (9 variables `DR_*`) | **CONFLICT** (ajouts concurrents en fin de liste) | **union** ; 227 (V6) + 5 + 9 = **241** variables, 0 doublon |
| `scripts/seeds/registry.test.mjs` | V6 (`upgrade-harness` étendu à V5 → V6) ↔ E (`dr-v2-drill`) | **CONFLICT** (même ligne) | union des deux couvertures, commentaire fusionné (+ V6 → V7) |
| `scripts/seeds/registry.mjs` | E (8 seeds DR V2) | fusion automatique | + complément V6 → V7 classé `CI_ONLY` / `upgrade-harness` |
| `.github/workflows/ci.yml` | V6 (job `studio-dedicated`) ↔ E (étape `test:dr-guard`) | fusion automatique, vérifiée | les deux conservés ; le drill (Docker / GoTrue) **n'est pas** lancé en CI |
| `.github/workflows/studio-dedicated-e2e.yml` | C | nouveau fichier | conservé ; coexiste avec le job `studio-dedicated` de V6 (celui-ci tourne à chaque CI, l'E2E sur chemins Studio) |
| Manifeste : **scan** | C | **défaut hérité** | `verify:env-manifest` **échouait déjà sur la branche C** (16 erreurs : banc et workflow lisent `E2E_*`, `ELSATIA_CENTRAL_URL`, `STUDIO_DB_URL`…) ; résolu sans déclarer de variable applicative : `apps/studio/e2e-dedicated/` et `.github/workflows/studio-dedicated-e2e.yml` ajoutés aux `exclude_paths` avec justification, précédent `packages/elsatia-identity/tests/`. Vert : 14 DECISION_REQUIRED, comme V6 |
| `ENV_INVENTORY_PREVIEW_V1.generated.md` | B | généré | régénéré (Studio 23 → 27 variables, hors Preview) |
| Packages partagés, `tsconfig.json`, `packages/email` | D (+ `@elsatia/email` dans `tsconfig` racine et Réserves) | fusion automatique | typecheck des 5 apps ✅ |
| Pack Preview, runbook | V7 | marqueurs régénérés + ref V7 | `sync:train-expectations` ; Studio OFF |

## 4. Migrations

Dernière migration **réelle** de V6 : `20260928000601_tools_releve_surface_piece_sync_v1`.

| Source | Ancien numéro | Nouveau numéro | Projet cible | Raison |
|---|---|---|---|---|
| `claude/nifty-edison-mevolm` (Relevé Lot 7) | `20260928001101` | **`20260928000701`** | **partagé** (`supabase/migrations`) | bloc V7 contigu juste après `…0928 601` (convention V6 : le numéro de plage de branche « 11xx » n'entre pas dans le train) ; en-tête de renumérotation, **corps inchangé** |
| `claude/modest-pasteur-izfaqm` (Studio post-H) | `20260929100000` … `20260929160000` (7) | **inchangés** | **Studio dédié** (`apps/studio/supabase/migrations`) | chaîne indépendante ; déjà postérieures à la dernière dédiée de V6 (`20260928120000`) ; cibles contrôlées par `migration-targets.json` |
| C, D, E | — | — | — | aucune migration |

Redéfinitions croisées vérifiées :
- le Lot 7 redéfinit `tools_releve_element_donnees_valides` (dernière : `…0927 801`), `tools_releve_plan_contenu` et `tools_releve_plan_creer` (dernière : `…0928 101`), ainsi que `tools_releve_plan_enregistrer` (dernière : `…0928 401`, corps Lot 6 **identique** à celui de sa branche `1001`, diff limité à l'en-tête) ;
- la contrainte `tools_releves_elements_plan_type` est redéfinie ;
- aucune de ces fonctions n'est touchée par `…0928 501` / `…0928 601` (qui redéfinit seulement `tools_releve_structure_garde`).

`git diff origin/integration/elsatia-canonical-train-v6 -- supabase/migrations apps/studio/supabase/migrations`
donne **8 ajouts et 0 modification**. `npm run verify:migrations` donne **359 valides** ; cibles : partagé 359 · Studio
dédié 21 (9 copies gelées + 12 dédiées). Références alignées : `plan-lot7.test.ts`, en-tête pgTAP Lot 7,
`equipement.ts`. Rapport de lot : numéro d'origine.

## 5. Relevé & Métré Lot 7

Intégré tel que qualifié :
- **objets de plan** : mobilier, sanitaire, cuisine, CVC, électricité, sécurité, rangement, technique ; **38 objets** au catalogue ;
- **calques** et groupes ;
- **objets muraux** liés au mur (suivent le mur, refus serveur d'un mur absent ou supprimé sans détacher) ;
- **verrou** client + serveur, **corbeille** (suppression douce, restauration) ;
- **plans figés** immuables (RPC et écriture directe → 42501), plans dérivés (copie, lignée) ;
- **états projetés** (existant / à déposer / nouveau / déplacé) ;
- export **SVG** et **DXF** (calques, objets masqués exclus) ;
- préparation **impression A3**.

| Exigence | Preuve V7 |
|---|---|
| Lot 7 | pgTAP `lot7_equipements_calques` **51/51** ; Playwright Lot 7 **15/15** (desktop, tablette, sécurité, versions, export, perf 50 → 1 000 objets) ; Vitest Tools 2 136, `releve-domain` |
| Lot 6 et surface serveur (V6) | pgTAP Lot 6 40/40, surface 32/32 (identiques à V6) ; Playwright Lot 6 **16/16** ; upgrade L13 (surface synchronisée par le RPC Lot 7), L16 (plan projeté exclu), Y01-Y02 |
| Lots 2 → 5 sans régression | pgTAP Relevé identiques à V6 ; Playwright Lots 2/3/4/5 **4 + 6 + 19 + 17** |
| Atelier | Playwright **6/6** |
| Plans V5 / V6 existants | upgrade L01-L03, L18-L19 : empreintes des plans figés V5 et V6 **recalculées à l'identique** par le contenu Lot 7 (clé `equipements` absente sans objet), versions intactes ; L04 : équipement Lot 2 hors plan toujours valide |

## 6. E-mail transactionnel

| Protection | État V7 | Preuve |
|---|---|---|
| `EMAIL_PREVIEW_ALLOWLIST` | hors Production, un destinataire absent de la liste bloque l'envoi (fail-closed) | `packages/email/src/brevo.ts`, `destinataires.ts`, tests `gabarit-livraison.test.ts` |
| `ELSATIA_APPLICATION_ENV` | environnement explicite | `packages/email/src/environnement.ts` ; builds Réserves / Colors / Studio en `local` |
| URL par application | une origine par application | `applications.ts`, tests |
| Pas de repli localhost hors local/test | Preview : HTTPS obligatoire, jamais localhost ; le code lève | `applications.ts`, `liens-securite.test.ts` |
| Pas d'open redirect | callback Réserves borné | `apps/reserves/src/app/auth/callback/route.test.ts` |
| Pas d'e-mail destinataire ni de token dans les journaux / Sentry | `masquerPourJournal` (paramètres `token`, `code`, `jeton`… masqués) ; `sentry-nettoyage.ts` branché sur les 3 configs Sentry | `journal.ts`, `sentry-nettoyage.test.ts` |
| Adresse de support | **non activée** : `SUPPORT_EMAIL` vide dans les gabarits Preview/local, placeholder `example.com` seulement, aucune valeur par défaut dans le code | manifeste, `.env*.example` |
| Mailer Studio (post-H) | fournisseur **absent par défaut** : aucun envoi, lien affiché à l'admin ; mailpit sur 127.0.0.1 seulement ; aucun destinataire journalisé | `apps/studio/src/lib/mailer.ts` ; Studio OFF |

Portes : `test:smoke-email` 13/13 ; Vitest GP 2 399 (inclut `packages/email`).

## 7. Studio

Tout ce qui suit est conservé :
- identité **B + I1** ;
- projet Supabase **dédié** ;
- aucun mot de passe Studio ;
- signup public fermé ;
- `studio_guard` ;
- fondation RGPD ;
- **post-H** : admission de rendu, profils d'export, brand kit, partages et filigrane, musique, invitations, garde post-H + RGPD ;
- Playwright dédié ;
- worker ;
- **Storage réel local** (storage-api v1.79.22 compilée).

| Contrôle | Résultat V7 |
|---|---|
| `dedicated-db-check.sh` (PG16 vierge, chaîne dédiée seule) | ✅ **21 migrations**, **0 table GP**, pgTAP **829 ok, 0 échec** (V6 : 14 / 543) dont post-H : admission 21, export 33, brand kit 44, partages 37, musique 37, invitations 31, garde post-H + RGPD 83 |
| Upgrade chaîne dédiée V6 (14) → V7 (21) | ✅ 7 migrations appliquées sur la chaîne V6 ; schéma + ACL **identiques** au fresh 21 ; 14 migrations V6 inchangées |
| **Studio Dedicated E2E** (`e2e-dedicated/run.sh` : PG ×2, GoTrue v2.192.0 ×2, PostgREST ×2, **storage-api réelle**, Redis, worker, Studio `next start`, identité centrale sans table GP) | ✅ garde de chaîne : 21/21 dans l'ordre, 18 tables `studio_*`, 75 fonctions classées, anon 0 ; **canaris K1-K5 5/5** ; Playwright **21/21** (4,9 min) |
| Isolation projet partagé | ✅ upgrade I01-I03 : identité inerte, aucune écriture anon Studio, **aucune table post-H** dans le projet partagé |
| App Studio | typecheck (+ `e2e-dedicated`), lint, Vitest **339**, build ✅ ; worker **42/42** |

**Studio reste OFF pour la première Preview** :
- aucune migration Studio dans le projet partagé ;
- variables de la GP Preview inchangées ;
- `STUDIO_ACCESS_MODE=closed` inchangé ;
- pack et runbook : périmètre de première Preview inchangé (Studio, worker Studio, Boutique, Stripe Connect **OFF**).

## 8. RGPD

| Exigence | Preuve V7 |
|---|---|
| Contrats V2 : aucune durée, aucun départ, aucun choix des photos (fail-closed) | DB verify 14 et 28 ✅ ; upgrade G01-G03 |
| Suites RGPD partagées | pgTAP identiques à V6 (toutes propres) |
| Studio : effacement RGPD | pgTAP dédié 71 + post-H 83 ; E2E 07-rgpd 3/3 (mode `off` : rien exécuté ; `awaiting_decision` ; effacement complet puis rejeu idempotent) |
| DR : purge interrompue | Disaster 3 : reprise sur place et restauration + rejeu convergent (§15) |

## 9. Fresh DB

`scripts/local-postgres-bootstrap/rebuild_db.sh v7_fresh` : **359/359 migrations, 0 erreur** (PostgreSQL 16
neuf, 26 s). V6 rejoué dans les mêmes conditions : 358/358. Projet Studio dédié : **21/21**.

## 10. DB verify et attendus du train

| Élément | V6 | V7 |
|---|---|---|
| Migrations / dernière | 358 / `20260928000601` | **359 / `20260928000701`** (générés, `sync:train-expectations`) |
| DB verify | 29 contrôles | **30** : + 30 Relevé Lot 7 (voir ci-dessous) |
| DB verify local | GO | `db-verify.mjs --local-harness --before-owner` sur fresh V7 → **`GO : base Preview conforme.`** (30 contrôles SQL, préflight 21 / 0 bloquant, RLS, 19 buckets, 37/37) ; sur fresh V6 → **NO-GO explicite sur le seul contrôle 30**, sans erreur de script |
| Fonctions service-role only | 37 | **37** (Lot 7 : aucune ; 3 fonctions nouvelles, aucune pour anon : corbeille `SECURITY DEFINER` authentifiés seuls, 2 contrôles purs `IMMUTABLE` authenticated / service_role) |
| Buckets | 19 | **19** |
| Pack / runbook | ref V6 | ref **`integration/elsatia-canonical-train-v7`**, Studio post-H intégré au seul projet dédié, Studio OFF |

Détail du contrôle 30 :
- équipements admis dans un plan ;
- corbeille `SECURITY DEFINER` réservée aux authentifiés ;
- contrôles d'objet fermés à anon ;
- lecture dynamique.

**Chiffres historiques.** Les rapports V3, V4, V5 et **V6** sont **inchangés** (340 / 352 / 355 / 358). La garde
`test:preview-pack` (30/30) reçoit un nouveau test : chiffres V6 figés (358, `…0928 601`, 29 contrôles), aucun
marqueur actif, et le générateur ne réécrit **aucun** `ELSATIA_CANONICAL_TRAIN_*.md` (ce rapport compris).

## 11. Upgrade V6 → V7

Harnais **nouveau et reproductible** : `scripts/qualification/upgrade-v6-v7.sh`.

1. **Base V6 avec historique.**
   - migrations V3 (340) → jeu V3 + complément V3→V4 → migrations V4 (352) ;
   - données de l'ère V4 → migrations V5 (355) ;
   - données de l'ère V5 (`upgrade_v5_v6_seed_complement.sql` lu depuis la ref V6) → **3 migrations V6 (358)**.
2. **Données de l'ère V6**, nouveau fichier `upgrade_v6_v7_seed_complement.sql` :
   - plan corrigé V5 enrichi des attributs de menuiserie Lot 6 ;
   - contour ré-enregistré → surface synchronisée par le serveur ;
   - plan corrigé **figé** « Corrigé V6 » ;
   - plan **as built** dérivé ;
   - équipement **Lot 2 hors plan**.
3. Instantané → **1 migration V7** → instantané → comparaison ; schéma et ACL comparés au fresh V7.
4. **31 contrôles métier** pgTAP sur la base upgradée (transaction annulée).

Jeu : 52 utilisateurs, 271 tables.

| Contrôle | Résultat |
|---|---|
| Application de la migration V7 | ✅ 0 erreur |
| Row counts (271 tables public / platform / auth / storage) | ✅ **0 écart**, 0 table nouvelle |
| Checksums (91 tables métier) | ✅ **91/91 identiques**. Couverture : GP, entitlements, Colors, Réserves, **Relevé** (plans, pièces, éléments, versions, journal), **Stripe**, identité, Studio partagé, **RGPD** |
| États métier | ✅ `entreprises` identique |
| RLS (flags) | ✅ 0 table modifiée |
| Policies | ✅ 639 → 639 : **0 supprimée, 0 modifiée, 0 ajoutée** |
| Sonde RLS réelle (51 utilisateurs) | ✅ **0 écart / 1 479 cellules** |
| Grants | ✅ 0 retiré / modifié / ajouté |
| EXECUTE, fonctions existantes | ✅ 0 modifié, 0 supprimée |
| EXECUTE, fonctions nouvelles (3) | voir la ligne « Fonctions service-role only » du §10 |
| Schéma upgradé vs fresh V7 (`pg_dump -s`, 30 681 lignes) + ACL (1 961) | ✅ **identiques** |
| Contrôles métier | ✅ **31/31** : L01-L19 (Relevé Lot 7), Y01-Y02 (surface), G01-G03 (RGPD), S01-S02 (Stripe), D01-D02 (Réserves D-01), I01-I03 (identité / Studio) |

## 12. pgTAP

Une base neuve par fichier (`scripts/qualification/pgtap-run-v3.sh`), V6 et V7 dans les mêmes conditions :

| | Fichiers | Propres | ok | not ok |
|---|---|---|---|---|
| V6 (358) | 152 | 143 | 4 457 | 14 |
| **V7 (359)** | **153** | **144** | **4 508** | **14** |

**Comparaison fichier par fichier sur les 152 fichiers communs : 0 différence** (plan, ok, not ok,
erreurs identiques). Cela couvre le projet partagé, Relevé, RGPD, Stripe, Réserves et Studio partagé.
- 1 suite nouvelle, propre : `elsatia_tools_releve_metre_lot7_equipements_calques` **51/51**.
- E-mail : aucune suite DB (le lot D n'a pas de migration).
- Les 9 fichiers non propres sont **exactement ceux de V6 (et de V5)** :

| Fichier | Cause |
|---|---|
| `studio_analysis`, `studio_editor`, `studio_media_upload`, `studio_project_management`, `studio_render_engine`, `studio_templates`, `studio_timeline` | suites Studio **du projet partagé** : « Inscription fermée » ; toutes propres sur la chaîne dédiée (§7) |
| `platform_stripe_state_attestation_r72` | pgsodium réel absent de l'amorce |
| `elsatia_tools_cloud_sync_entitlement_closure_v1` | erreurs d'amorce |

Chaîne Studio dédiée : 829/829 (§7).

## 13. Applications

| App | typecheck | lint | Vitest | build |
|---|---|---|---|---|
| Gestion Pro (racine + `releve-domain`, `elsatia-identity`, `email`) | ✅ | ✅ | ✅ **2 399** passés, 36 ignorés (193 fichiers) | ✅ `next build` |
| Tools | ✅ | ✅ | ✅ **2 136** (185 fichiers) | ✅ (`NEXT_PUBLIC_TOOLS_ENV=local`) |
| Colors | ✅ | ✅ | ✅ **431** | ✅ (`ELSATIA_APPLICATION_ENV=local`) |
| Réserves | ✅ | ✅ | ✅ **197** | ✅ (`ELSATIA_APPLICATION_ENV=local`) |
| Studio | ✅ (+ `typecheck:e2e-dedicated`) | ✅ | ✅ **339** | ✅ |
| Worker `studio-video` | ✅ | — | ✅ **42/42** (FFmpeg système avec drawtext + OpenCV, comme la CI) | — |

**Passes invalides, non comptées** (causes d'environnement, aucun code modifié entre les passes) :
- Tools : un premier passage avait 4 timeouts à 5 s sur des tests de rendu d'image, lancé en parallèle du drill DR et des builds ; rejoué seul : 2 136/2 136.
- Worker : un premier passage a été lancé avant l'installation de FFmpeg / OpenCV.

Autres portes :

| Porte | Résultat |
|---|---|
| `verify:migrations` | ✅ (359 · dédié 21) |
| `verify:train-expectations` | ✅ |
| `test:preview-pack` | ✅ **30/30** |
| `test:seeds` | ✅ 48/48 |
| `test:migration-targets` | ✅ 7/7 |
| `test:preflight-preview` | ✅ 5/5 |
| `test:stripe-ordering-script` | ✅ |
| `test:stripe-trial-script` | ✅ |
| `test:stripe-resubscription-script` | ✅ 6/6 |
| `verify:env-manifest` | ✅ (14 DECISION_REQUIRED non bloquantes, inchangé) |
| `test:env-manifest` | ✅ 67/67 |
| `verify:secrets` | ✅ |
| `test:smoke-email` | ✅ 13/13 |
| `test:dr-guard` | ✅ 10/10 |

## 14. Playwright

Playwright 1.62.1, Chromium 1194. Chaque pile tourne sur une base PostgreSQL 16 **neuve aux 359 migrations
V7**. Les piles sont lancées **l'une après l'autre**. Aucune spec ni aucun harnais de recette n'a été modifié.

| Recette | Pile | Référence V6 | **V7** |
|---|---|---|---|
| Relevé Lots 2 / 3 / 4 / 5 / 6 / **7** + Atelier (une passe) | `releve_e2e_stack.sh` : GoTrue v2.196.0, PostgREST v12.2.3, mock Storage ; Tools `next dev --webpack` :3020 | 68 | ✅ **83/83** (4 + 6 + 19 + 17 + 16 + **15** + 6 ; 10,2 min) |
| Réserves V3 / V4 listes-PDF / V4 mobile / V5 hors ligne (`--grep-invert "rechargement hors ligne"`) / V6 sécurité / V6 performance | `reserves-pile-locale/preparer-base.sh` + charge V6 + passerelle + `amorcer-recette-v4.mjs`, Réserves compilé :3020 | 59 | ✅ **59/59** (1 + 11 + 6 + 13 + 23 + 5) |
| **Réserves D-01** | idem, base neuve distincte | 7 | ✅ **7/7** |
| GP ↔ Réserves | `gp-reserves-pile-locale/preparer-base.sh`, passerelle, GP :3100, Réserves :3020 | 5/5 ×3 | ✅ **5/5 ×3** (19,9 s ; 18,8 s ; 18,4 s ; base remise à zéro avant chaque passe) |
| Stripe réabonnement | pile GP ↔ Réserves, état Stripe projeté en base, clé `sk_test_` factice | 6/6 ×2 | ✅ **6/6 ×2** (7,1 s ×2) |
| Colors (`colors` + `colors-mobile`) | `colors-pile-locale/preparer-base.sh`, nuancier de recette | 73 | ✅ **73/73** (1,1 min) |
| **Studio Dedicated E2E** | §7 | 21 (branche C) | ✅ **21/21** + canaris 5/5 |

Variables de recette locales : valeurs factices générées pour la session, aucune écrite dans le dépôt.

**Passes invalides, non comptées :**

| Passe | Cause |
|---|---|
| Relevé | `supabase_auth_admin` laissé par le harnais des seeds avec un autre mot de passe (constat V6) → rôle réaligné localement avant la pile |
| Réserves | 1ʳᵉ passe : erreur de harnais (argument de filtre vide chargeant toutes les specs) ; 2ᵉ passe : invitation V3 à usage unique déjà consommée par l'ordre du premier essai → base reconstruite, passe complète dans l'ordre V6 |
| GP ↔ Réserves | second passage sans remise à zéro de la base (la spec n'est pas rejouable, comme en V4 / V5) |
| Colors | `E2E_DATABASE_URL` omise pour la spec de suspension |

## 15. Disaster Recovery sur V7

**Adaptation nécessaire** (`898183e4`). Le drill V2 construisait son jeu avec `upgrade-v4-v5.sh`. Ce script
**refuse une base au-delà de V5** (« attendu 3 migrations V5 ») et ses contrôles métier supposent un état V5
(aucun plan 2D : 2/35 puis erreurs sur une base V7). Le drill construit donc désormais son jeu avec le
harnais du train courant (`upgrade-v6-v7.sh`), et les contrôles métier après restauration sont ceux de V7
(31). Le tout est paramétrable (`DR2_UPGRADE_SCRIPT`, `DR2_METIER_SQL`, `DR2_METIER_N`). Le complément DR
et les 16 smokes passent sans modification sur le jeu V7.

| Commande | Résultat V7 |
|---|---|
| `npm run dr:verify -- --db-only` | ✅ **32/32 → `ELSATIA DR LOCALLY QUALIFIED`** (détail ci-dessous) |
| `npm run dr:verify -- --backup <B0>` | ✅ `BACKUP VERIFIED — restaurable à l'identique` (restauration de test 3,6 s, vérification 31,8 s) |
| `auth_drill.sh` (vrai GoTrue v2.196.0) | ✅ **12/12** `AUTH_LIMITS_MEASURED` : régressions attendues mesurées ; révocation globale et rotation du secret efficaces |
| `storage_drill.sh` | ⚠️ **`STORAGE_NOT_PROVEN`** dans ce conteneur (détail ci-dessous) |
| Gardes | ✅ `test:dr-guard` 10/10 (CI) ; F-1..F-5 dans le drill |

Détail du drill base (`--db-only`) :
- **backup** complet + manifeste + SHA-256 (TOC 5 332) ;
- **vérification** par restauration de test stricte ;
- **D1** suppressions : restauration à **0 écart**, RPO mesuré, contrôles métier V7 31/31, smokes 16/16 ;
- **D2** migration cassée : régressions détectées puis restaurées ;
- **D3** purge RGPD interrompue : reprise sur place et restauration + rejeu convergent, idempotence ;
- **D4** corruption Stripe : garde anti-réouverture, rejeu, doublons, événement périmé, 19 entreprises = vérité ;
- **5 échecs attendus** (sauvegarde altérée, écrasement sans `--force`, base hors préfixe, Production, cible distante).

Mesures : backup 47,9 s (pg_dump 0,6 s), restaurations 3-6 s.

Pourquoi Storage n'est pas prouvé ici :
- le démon Docker a pu être démarré, mais l'image `supabase/storage-api:v1.25.7` est inaccessible : Docker Hub renvoie **429** et le CDN du miroir ECR est refusé par la politique réseau ;
- le drill Storage exige cette image (aucun faux succès).

Storage réel local reste prouvé par le banc Studio dédié (storage-api compilée). Le drill Storage a été
qualifié sur la branche E avec Docker. Porter le drill vers le binaire source (v1.79.22 : variables et
arborescence différentes) est une suite possible (§17).

Non rejoué, par choix de coût :
- les 4 catastrophes sur Storage et Auth réunis (Auth est rejoué seul) ;
- le drill complet en CI (Docker / GoTrue indisponibles en CI) : la CI exécute la garde (`test:dr-guard`).

## 16. Seeds

| Porte | Résultat V7 |
|---|---|
| `npm run test:seeds` | ✅ **48/48** : registre complet, avec `upgrade_v6_v7_seed_complement.sql` (classé `CI_ONLY`, `upgrade-harness`) et les 8 seeds DR V2 (`ACTIVE`, `dr-v2-drill`) |
| `npm run verify:seeds` (base fraîche **359**, seul sur le cluster) | ✅ **`ALL ACTIVE SEEDS QUALIFIED — 16/16 seeds qualifiés sur 359 migrations`** |

## 17. DECISION_REQUIRED et limites

| ID | Nature | État | Effet |
|---|---|---|---|
| `DECISION_REQUIRED:V7-MIGRATION-RENUMBERING` | technique | **décidé (mission)** | Relevé Lot 7 → `…0928 701` ; Studio dédié conservé (projet distinct) |
| `DECISION_REQUIRED:V7-ENV-SCAN-STUDIO-E2E` | technique | **décidé (conservateur)** | banc et workflow Studio dédiés exclus du scan (outillage jetable) plutôt que de déclarer des variables de banc comme variables applicatives ; à revoir si le banc devient déployé |
| `DECISION_REQUIRED:V7-DR-HARNESS` | technique | **décidé** | drill DR sur le harnais du train courant (V6 → V7), paramétrable |
| E-mail A-1 : routage Auth / reset **multi-app** | produit / architecture | **ouvert** | aucun changement de routage |
| E-mail A-3 : **`SUPPORT_EMAIL`** (`support@` ou `contact@elsatia.fr`), SPF / DKIM | configuration | **ouvert** | aucune adresse activée |
| E-mail A-8 : **fournisseurs / sous-traitants** (SMTP Studio, DPA Brevo API + SMTP, secours) | juridique | **ouvert** | aucun choix |
| `DECISION_REQUIRED:V7-STUDIO-MAIL-PROVIDER` | produit / juridique | **ouvert** | le lot post-H prévoit `resend` pour Studio, et **rien n'est activé** : sans `STUDIO_MAIL_PROVIDER`, aucun envoi. Avant toute activation Studio, décider le fournisseur (A-8) et **aligner le mailer Studio sur la garde `EMAIL_PREVIEW_ALLOWLIST`** de `@elsatia/email` (le mailer Studio ne l'applique pas aujourd'hui) |
| E-mail A-9 : `RESERVES-URL-FAIL-CLOSED` | décision | ouvert | le repli localhost hors local/test est déjà retiré (le code lève) |
| RGPD contrats (durée, départ, photos) | juridique | ouvert (hérité V6) | fail-closed |
| Studio : délai d'effacement, activation, hébergement | propriétaire | ouvert (hérité) | **Studio OFF** |
| `V6-VOLUME-PIECE` | produit | ouvert (hérité) | volume non calculé |
| Performance baseline | mission parallèle | non qualifiée à ce jour | `claude/brave-carson-cj8ofz` = candidate V7.1 / V8 après verdict |
| Storage DR avec vraie storage-api | environnement | `STORAGE_NOT_PROVEN` ici (§15) | à rejouer sur un poste avec Docker, ou porter le drill vers storage-api compilée |
| Stripe Test réel, Storage / GoTrue / e-mail hébergés, Portail Stripe | exécution distante | NOT PROVEN localement (hérité) | à prouver par le pack Preview |
| Harnais locaux concurrents | outillage | constat (hérité) | seeds, DR et piles e2e partagent les rôles globaux du cluster : exécution **séquentielle** ; sortie DR dans un dossier traversable par `postgres` |

## 18. Reproduire

```bash
git fetch --all --prune && git checkout integration/elsatia-canonical-train-v7 && npm ci
for a in tools colors reserves studio; do npm ci --prefix apps/$a; done; npm ci --prefix workers/studio-video
pg_ctlcluster 16 main start ; apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl postgresql-plpython3-16 python3-nacl ffmpeg

scripts/local-postgres-bootstrap/rebuild_db.sh v7_fresh                         # 359/359
scripts/qualification/pgtap-run-v3.sh v7_fresh                                  # 144/153 propres (= V6 + 1)
scripts/qualification/upgrade-v6-v7.sh upg_v6_v7 v7_fresh                       # §11, contrôles métier 31/31
apps/studio/scripts/dedicated-db-check.sh                                       # 21 migrations, 829 ok
E2E_BIN=<gotrue v2.192.0, postgrest, storage-src> STUDIO_FFMPEG_PATH=/usr/bin/ffmpeg apps/studio/e2e-dedicated/run.sh   # 21/21
npm run dr:verify -- --db-only                                                  # 32/32 (réutilise upg_v6_v7)
SEEDS_DR_PGPASSWORD=… node scripts/seeds/verify-seeds.mjs                       # §16 (seul, sans pile e2e)
npm run typecheck && npm run lint && npm test && npm --prefix apps/studio run test
npm run verify:migrations && npm run verify:train-expectations && npm run test:preview-pack && npm run test:seeds
ELSATIA_PREVIEW_DB_URL=postgresql://…@127.0.0.1/v7_fresh node scripts/preview/db-verify.mjs --local-harness --before-owner
```

## 19. Fichiers V7 (hors lots portés)

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20260928000701_tools_releve_metre_equipements_calques_v1.sql` | renommée (en-tête de renumérotation, corps inchangé) |
| `packages/releve-domain/src/{plan-lot7.test.ts,equipement.ts}`, en-tête pgTAP Lot 7 | références de migration alignées |
| `scripts/qualification/upgrade-v6-v7.sh`, `scripts/local-postgres-bootstrap/upgrade_v6_v7_{seed_complement,business_checks}.sql` | harnais d'upgrade V6 → V7 |
| `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` | contrôle 30, attendus régénérés |
| `scripts/preview/preview-pack.test.mjs` | chiffres V6 figés, 37 RPC (V7 inchangé) |
| `docs/qualification/ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md`, `docs/runbooks/ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md` | ref V7, attendus, Studio OFF |
| `docs/qualification/preview-pack/ENV_INVENTORY_PREVIEW_V1.generated.md` | régénéré |
| `config/env-manifest.json` | union B/C/D/E ; exclusions de scan du banc Studio dédié |
| `scripts/seeds/registry.mjs`, `registry.test.mjs` | complément V6 → V7, couverture `dr-v2-drill` |
| `scripts/dr/v2/drill.sh`, `scripts/dr/v2/README.md` | DR adapté au train V7 |
