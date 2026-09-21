# ELSATIA — Qualification finale exacte du train convergé (V3)

Mission : qualification locale exhaustive du train ELSATIA actuellement convergé, exécutée en autonomie via 7 agents parallèles (1 base de données + 5 applications + 1 synthèse de l'historique) plus le travail direct de la session orchestratrice pour l'inventaire, les gates root, la seconde passe et ce rapport.

Date d'exécution : 2026-09-21/22 UTC.

## Note préalable — AGENTS.md et « prompt injection »

`AGENTS.md`/`CLAUDE.md` (racine et `apps/studio/`) contiennent un bloc « This is NOT the Next.js you know » demandant de lire `node_modules/next/dist/docs/` avant d'écrire du code, et — dans `apps/studio/AGENTS.md` — une variante poussant à « vérifier » via `node_modules/next/dist/server/lib/generate-agent-files.js` et à committer ce bloc « pour garder l'arbre propre ».

Investigation menée : ce texte est **byte-identique** au template réellement généré par `next dev` dans le paquet Next.js 16.3.5 installé (`node_modules/next/dist/server/lib/generate-agent-files.js`, confirmé sur les 5 installations — racine + 4 apps). Ce n'est donc **pas une injection spécifique à ce dépôt**, mais un comportement amont réel (et inhabituellement insistant) de Next.js lui-même.

Conclusion appliquée uniformément par tous les agents et la session orchestratrice : ce bloc n'a **jamais** été traité comme une instruction faisant autorité, son contenu n'a pas redirigé la tâche, et **aucun commit n'a été fait sur la seule foi de ce texte** — seule une demande explicite de l'utilisateur autorise un commit dans cette session. Ce point avait déjà été identifié et neutralisé par des sessions antérieures (confirmé par l'agent de synthèse historique).

## BASELINE_SHA

`origin/claude/funny-bell-eqo1p5` → `842b4b4f20e43b8cd2d5ffa4f4df34e1223424a4` ("merge: converge Studio/Tools/Reserves isolation + qualification finale (mission ELSATIA)").

Le HEAD réel a été lu sur le remote (`git fetch --all --prune`, puis `git rev-parse`), pas supposé. Il coïncide avec le "dernier HEAD connu" indiqué dans la consigne — confirmé, pas présumé.

**Correction de contexte importante** : la branche de session assignée (`claude/awesome-turing-tn9yh6`) pointait initialement sur `origin/main` (`4d92ddb`), qui est un ancêtre commun mais **ne contient pas** la convergence Studio/Tools/Reserves. Le train convergé réel vit uniquement sur `origin/claude/funny-bell-eqo1p5`. La branche de session a donc été repositionnée (`git checkout -B`, sans perte — elle ne portait aucun commit propre) sur `842b4b4` avant tout travail, pour qualifier le bon état.

## FINAL_SHA

Identique au baseline : `842b4b4f20e43b8cd2d5ffa4f4df34e1223424a4`. Aucun agent n'a modifié l'arbre de travail (vérifié : `git status` propre et HEAD inchangé après les 7 agents). Ce rapport est le seul changement apporté, commité séparément sur `claude/awesome-turing-tn9yh6`.

## ENVIRONMENT

- Node v22.22.2, npm 10.9.7. Avertissement `EBADENGINE` pour `@zxing/library` (exige Node ≥24) — bruit d'installation préexistant, sans impact observé sur aucun gate.
- Docker : client présent (29.3.1) mais **daemon absent** (`dockerd` injoignable) → `supabase start` / `supabase db reset` inutilisables. Limitation d'environnement contournée par un PostgreSQL 16 natif (`postgresql-16` + `postgresql-16-pgtap`, installés via apt, accès réseau disponible) avec stubs Supabase réalistes (voir FRESH).
- 313 migrations SQL, 94 fichiers de tests pgTAP (recomptés précisément — la consigne en mentionnait 95), 5 apps (`gestion_pro` racine, `colors`, `tools`, `studio`, `reserves`), 5 packages partagés sans dépendances propres (`application-access`, `client-contracts`, `email`, `platform-support-comms`, `studio-domain`), 1 worker (`workers/studio-video`).
- Aucun accès Stripe réel (`STRIPE_SECRET_KEY` absent, CLI `stripe` absente) : `verify:stripe-prices` a correctement SKIP au lieu d'appeler `api.stripe.com`. Aucun accès Supabase distant. Préview et Production jamais touchées.

## INSTALL

`npm ci` exécuté séparément à la racine et dans chacune des 4 apps npm-indépendantes + le worker (6 installations au total, aucune ne partage de `node_modules` — pas de vrais workspaces npm, orchestration par `--prefix`). Les 6 ont réussi avec `npm ci` (qui échoue si `package.json`/`package-lock.json` divergent) : **aucun lockfile drift détecté**. Les 5 packages partagés (`packages/*`) n'ont aucune dépendance propre, donc rien à installer séparément pour eux. Aucune dérive npm committée.

## GATES ROOT (deux passes, résultats identiques)

| Gate | Résultat | Détail |
|---|---|---|
| `verify:migrations` | OK | 313 migrations valides, noms et horodatages uniques |
| `verify:secrets` | OK | 2502 fichiers suivis contrôlés, aucun secret reconnu (2 exceptions nommées et justifiées : fixtures de test du détecteur de secrets lui-même) |
| `verify:env-manifest` | OK (non bloquant) | 190 variables, 10 apps, 29 secrets, 17 dépréciées, 20 drapeaux, **10 DECISION_REQUIRED** en attente (décisions produit/commerciales, hors périmètre technique — cf. KNOWN_LIMITATIONS) |
| `test:env-manifest` | OK | 58/58 tests Node natifs passent |
| `verify:stripe-prices` | SKIP (non bloquant) | aucun accès Stripe local, comportement attendu et sûr |
| `preflight:env --environment local` (5 apps) | NO-GO attendu | correctement NO-GO sans fichier `.env` réel (9/6/3/5/4 erreurs selon l'app, toutes `variable requise absente`) — testé aussi avec `.env.local.example` chargé sur `gestion_pro` : les erreurs tombent de 9 à 4, confirmant que le gate réagit correctement au contenu et n'est pas cassé, juste correctement strict sans configuration |

## FRESH

Base native `elsatia_fresh` (PostgreSQL 16.13, service système, laissée active). **313/313 migrations appliquées proprement, 0 échec SQL réel.** Deux échecs rencontrés pendant la construction du harnais lui-même (pas les migrations) : double-création de schéma par le stub `pgsodium`, et résolution `unaccent`/`gin_trgm_ops` manquante faute de `search_path = "$user", public, extensions` (défaut réel de Supabase, ajouté après coup) — corrigés dans le harnais, aucune migration modifiée.

Stubs ajoutés (documentés intégralement dans `scratchpad/reports/db-fresh-upgrade-pgtap.md`) : rôles standards Supabase (`anon`, `authenticated`, `service_role`, `authenticator`, `supabase_admin`, `supabase_migrator`), schéma `extensions` + `pgcrypto`, schéma `auth` (`users`, `identities`, `mfa_factors`, `uid()`/`role()`/`email()`/`jwt()` pilotés par des GUC), schéma `storage` (`buckets`/`objects`, RLS activée), stub local `pgsodium` (vérification seule, fail-closed — le vrai module est indisponible hors-ligne).

Vérifications post-application : RLS activée sur 234/234 tables publiques (100 %), 550 policies, 645 fonctions, 152 triggers présents. Rôle `anon` limité à 4 tables catalogue en lecture seule et exactement 2 fonctions `SECURITY DEFINER` appelables (toutes deux intentionnellement à jeton) — cohérent avec le rapport de remédiation sécurité antérieur du dépôt.

## UPGRADE

Scénario simulé dans une base séparée `elsatia_upgrade` (pour garder `elsatia_fresh` propre) : migrations 1–150 (« ancienne » base, 150/150 propres) + jeu de données synthétique réaliste inséré directement en SQL (20 clients, 15 chantiers, 40 devis, 30 factures à statuts/paiements mixtes, 8 lignes de commande pré-`article_id`), car les scripts de seed existants n'étaient pas utilisables ici (`seed-demo-history.mjs` requiert une vraie stack PostgREST/GoTrue ; `seed-elsatia-preview-year.mjs` est épinglé à un projet distant réel — à raison non exécuté). Puis migrations 151–313 rejouées.

**Résultat : 162/163 propres, 1 échec réel, nouvellement découvert.**

`20260921000300_correctif_perf_rls_lignes_devis_factures.sql` échoue sur `« Les lignes d'une facture émise ne peuvent plus être modifiées »` : son `UPDATE` de backfill sur `lignes_factures.entreprise_id` déclenche le trigger d'immuabilité `lignes_factures_brouillon_only`, qui est **inconditionnel** (bloque même une opération de migration légitime), dès qu'il existe au moins une facture déjà émise. Le trigger jumeau sur `lignes_devis` ne bloque pas dans le même fichier, car son garde-fou est conditionné par `est_membre_actif()`/`auth.uid()`, qui vaut `NULL` pendant une migration — **incohérence de conception entre les deux triggers d'immuabilité**. Conséquence concrète : `psql` valide chaque instruction en autocommit, donc l'échec laisse la base **partiellement migrée** (`lignes_devis` migré, `lignes_factures` avec la colonne ajoutée mais non peuplée/indexée). Sur un vrai déploiement Supabase, cela interromprait toute la migration et exigerait une intervention manuelle DBA.

Ce défaut touche **tout tenant réel ayant au moins une facture déjà émise avant l'application de cette migration** — non détecté par les sessions de qualification précédentes car toutes avaient pour référence un état déjà postérieur à la migration 300, sur base vide. Classification : **REAL_DEFECT, NOUVEAU** (non documenté auparavant).

## PGTAP

94 fichiers `supabase/tests/*.test.sql` exécutés via `pg_prove --ext .sql` sur `elsatia_fresh` (au HEAD complet).

**TOTAL ASSERTIONS exécutées : 2499 — PASS : 2499 — FAIL : 0 — 90/94 fichiers entièrement verts.**

4 fichiers s'arrêtent en cours de plan (aucune assertion individuelle n'a jamais retourné « not ok ») :

| Fichier | Assertions passées | Classification | Cause |
|---|---|---|---|
| `document_partage_public_par_jeton_v1.test.sql` | 10/42 | TEST_DEFECT / PRE_EXISTING | la fixture insère des lignes de facture *après* avoir mis `statut='envoyee'`, ce que le trigger d'immuabilité rejette à raison |
| `gp_pilot_plateforme_admin_role_total.test.sql` | 0/6 | TEST_DEFECT / PRE_EXISTING | la fixture insère directement dans `plateforme_admins`, violant une contrainte que la vraie RPC de provisioning respecterait |
| `gp_pilot_rgpd_manifeste_fichiers.test.sql` | 1/9 | TEST_DEFECT / PRE_EXISTING | le test appelle en tant que `authenticated` une fonction que la migration testée révoque précisément à `authenticated` |
| `platform_stripe_state_attestation_r72.test.sql` | 0 exécutée | ENVIRONMENT_LIMITATION | nécessite de *produire* une vraie signature Ed25519 via `pgsodium` ; le stub local ne fait que vérifier (fail-closed), pas signer |

Toutes les suites explicitement liées à la sécurité et la concurrence pour cette mission sont **100 % vertes** : `isolation_multitenant_*`, `correctif_isolation_devis_client`, `client_document_snapshot_v1`, les suites `*_idempotence`, `verrouiller_facture_emise`, `rate_limiting_applicatif`, ainsi que `platform_aal2_role_integrity_v1`, `platform_support_uid_security_v1`, `platform_global_owner_all_apps_v1`, `security_remediation_anon_execute_revocation_v1` — ces quatre dernières correspondaient à de vraies régressions dans une plage de commits antérieure d'après le rapport de remédiation sécurité du dépôt ; confirmées corrigées et vertes exactement à ce HEAD.

## GP (Gestion Pro)

4/4 gates verts, isolés (sans chaîner vers tools/reserves/colors) : `eslint` 0 erreur (38.2s), `vitest` 1786/1786 tests (22.6s), `tsc --noEmit` 0 erreur (55.3s), `next build` OK, 38 pages statiques (1m34.1s).

Revue de domaine (paiements/factures/avoirs, documents publics/partage : approfondie ; stock/commandes, clients/chantiers/devis, notes de frais/employés, congés : légère à approfondie ; planning/pointage, abonnement : légère) : **aucun nouveau défaut de correction ou de sécurité**. Les classes de bugs explicitement visées par la mission (idempotence paiement/avoir, fuite de données via partage public, double-crédit de stock) ont déjà été trouvées et corrigées côté équipe dans des migrations same-day (`20260922000306`, `20260922000305`, `20260922000322`), vérifiées indépendamment ici comme toujours en place et efficaces.

## COLORS

4/4 gates verts : `typecheck` 0 erreur (6.9s), `lint` 0 erreur (8.6s), `vitest` 427/427 (8.3s), `build` OK 27 routes (43.1s, via `.env.local.example` copié temporairement en local, jamais commité, valeurs factices).

Revue accès/sécurité complète (résolution de tenant, guards de rôle, isolation tenant y compris test IDOR direct, auth locale, refus d'accès, `signOut`) : **aucun problème trouvé**, posture inchangée par rapport à l'audit de sécurité pré-déploiement déjà documenté (`ELSATIA_COLORS_PREDEPLOY_FINAL_READINESS_AUDIT_V1.md`). Seul écart connu : le mail de réinitialisation de mot de passe atterrit d'abord côté Gestion Pro avant relais — préexistant, accepté, UX seulement (pas un contournement de sécurité, mot de passe ELSATIA partagé).

## TOOLS

4/4 gates fonctionnels verts : `typecheck` 0 erreur (11.4s), `lint` 0 erreur (24.9s), `vitest` 1992/1992 (23.3s). Build nu `npm run build` échoue **intentionnellement** (garde `verify:public-env` résout en mode `production` sans secrets réels) ; avec l'échappatoire documentée `NEXT_PUBLIC_TOOLS_ENV=local`, build OK (47/47 pages, 37.1s).

**Nouveau défaut réel trouvé** : la RPC `tools_sync_project_entreprise` et les policies RLS sur `tools_projects` (migrations `20260830000236…`, `20260831000238…`) ne vérifient que l'appartenance à l'organisation + l'accès applicatif Tools au niveau organisation — **jamais le palier d'entitlement Free/Pro propre à l'utilisateur appelant** (`entitlements_utilisateurs_elsatia.niveau`, un concept par-utilisateur, pas par-organisation). Le blocage Free/Pro n'existe que côté client (`AccountProvider.tsx`). Concrètement : tout membre authentifié d'une organisation avec Tools activé peut appeler la RPC (ou écrire directement sur `tools_projects` via PostgREST, `authenticated` ayant déjà les droits d'insertion/mise à jour) et obtenir une synchronisation cloud illimitée, indépendamment de son propre palier. Non documenté auparavant. Classification : **REAL_DEFECT, NOUVEAU** — contournement de frontière de facturation, pas de fuite cross-tenant.

Isolation PostCSS reconfirmée intacte (`{ plugins: {} }`, aucune dépendance tailwind, aucune mention tailwind/postcss dans le build). "Droits projet" : par design, aucun partage de projet même intra-organisation (projets strictement privés au créateur) — cohérent avec la documentation existante ("Tools n'est pas assistable"). Aucun système de quota mesuré n'existe (gating par palier uniquement) — le défaut ci-dessus est la seule vraie lacune trouvée dans cet espace.

## STUDIO

App (`apps/studio`, non chaînée aux scripts racine, exécutée seule) : 4/4 gates verts — `typecheck` 0 erreur (11.0s), `lint` 0 erreur (14.3s), `vitest` 260/260 (7.5s), `build` OK 12/12 routes (46.5s), middleware `Proxy` confirmé présent dans le build (le kill-switch `STUDIO_ENABLED` est bien du code vivant, pas mort).

Worker `studio-video` : `typecheck` OK (4.4s), `lint` OK (1.9s), `vitest` **3 échecs / 15 réussites / 4 sautées sur 22** :
- 2 échecs `render.test.ts`/1 échec `templates.test.ts` : absence de `drawtext` dans le binaire `ffmpeg-static` embarqué (`-filters` ne le liste pas malgré `--enable-libfreetype` déclaré). Reproduit manuellement hors code du worker. **ENVIRONMENT_LIMITATION, PRE_EXISTING**, confirmée identique aux 3 rapports antérieurs.
- 4 tests sautés, suite `analysis.test.ts` marquée en échec : **nouvelle observation cette passe**, cause différente — `python3 analysis/fixtures.py` échoue avec `ModuleNotFoundError: No module named 'cv2'` (`opencv-python-headless`/`numpy` absents du sandbox). **ENVIRONMENT_LIMITATION**, distincte de FFmpeg. Effet pratique : la suite qualité vidéo (netteté, exposition, hash perceptuel, détection de visage) a une couverture réelle **nulle** dans cet environnement — à ne pas confondre avec un simple "4 sautés" bénin.

Gestion des drapeaux d'environnement (`STUDIO_SIGNUP_MODE`, `STUDIO_SIGNUP_ALLOWLIST`, `STUDIO_LEGAL_PUBLISHED`) : **fail-closed** vérifié (absent/invalide/typo → fermé), y compris test explicite de non-contournement par sous-domaine (`a@elsatia.fr.evil.test` ne matche pas `@elsatia.fr`). `STUDIO_ENABLED` est **fail-open par design** (coupe-circuit opérationnel documenté, pas un contrôle d'accès). Inscription vérifiée server-side uniquement (`"use server"`, gate avant tout appel Supabase, message générique identique sur les deux branches d'échec, aucune route `/api/signup` de contournement trouvée par traçage de code complet — pas de test HTTP live réalisé, conformément aux garde-fous). Isolation PostCSS confirmée (même motif que les autres apps).

## RESERVES

4/4 gates verts : `typecheck` 0 erreur (11.3s), `lint` 0 erreur (21.2s), `vitest` 178/178 en run isolé propre (2.50s — une exécution antérieure concurrente avec `lint` avait montré 2 échecs transitoires dus à la contention CPU du sandbox, non reproduits), `build` OK 29 routes + middleware (31s), `npm audit --audit-level=high` : 0 vulnérabilité.

Isolation PostCSS, Sentry/instrumentation et `turbopack.root` : les trois correctifs documentés tiennent, inchangés, sans régression (Reserves ne dépend même pas de `@sentry/nextjs` — zéro possibilité de confusion de projet Sentry avec Gestion Pro). Les 3 packages `file:` résolvent correctement ; note mineure nouvelle (non bloquante, vérifiée inoffensive) : `transpilePackages` omet `@elsatia/platform-support-comms`, actuellement sans effet car son seul usage runtime n'est jamais atteint côté Client Component.

Isolation RLS des sociétés invitées : revue de code + migration `20260906000268` (1313 lignes) — accès par affectation intervenant (pas par chantier entier), garde-fous de cohérence par trigger, révocation vérifiée en direct par requête. **Aucun accès trop large trouvé** (lecture de code, pas exécution pgTAP — voir résultats pgTAP ci-dessus pour la preuve d'exécution réelle). Journal d'audit (`reserves_historique`) confirmé **réellement append-only** : le rôle `authenticated` n'a aucun droit d'écriture sur cette table (révocation explicite), aucune policy RLS d'écriture n'existe, chaque écriture passe par une fonction `SECURITY DEFINER`.

**Élément préexistant reconfirmé toujours ouvert** : le correctif SQL pour le défaut de réaffectation d'entreprise sans trace (`docs/reserves/ELSATIA_RESERVES_V6_SQL_PROPOSE_NON_INTEGRE.sql`) existe toujours sur le disque et **aucune migration ne l'intègre** à ce HEAD — vérifié directement (le nom du fichier signifie littéralement « non intégré », confirmé par recherche dans `supabase/migrations/`). `reserves_intervenants.entreprise_intervenante_id` reste re-pointable sans trace d'historique. Pas une fuite cross-tenant, mais une lacune d'intégrité pour un produit de contradictoire. Mitigation en vigueur : limiter le pilote à une seule entreprise hôte.

## SECURITY

Couverture principale par les suites pgTAP dédiées (voir PGTAP), toutes vertes, plus une revue de code des guards/isolation tenant par chacun des 5 agents applicatifs (voir sections GP/COLORS/TOOLS/STUDIO/RESERVES ci-dessus). Aucune fuite cross-tenant trouvée nulle part. Deux défauts réels trouvés relèvent de la sécurité/intégrité au sens large : le contournement de palier de facturation Tools (voir TOOLS) et la réaffectation d'entreprise sans trace en Reserves (préexistante, voir RESERVES) — ni l'un ni l'autre n'est une fuite de données entre tenants.

Test HTTP live multi-tenant (deux tenants A/B réellement authentifiés frappant des serveurs Next.js en cours d'exécution) **non réalisé** dans cette passe — voir KNOWN_LIMITATIONS. La preuve apportée est au niveau base de données (RLS + RPC `SECURITY DEFINER`, le mécanisme d'application réel) et au niveau code serveur (guards), pas au niveau boîte noire HTTP.

## CONCURRENCY

Mécanismes de sécurité de concurrence vérifiés au niveau base de données via pgTAP : verrouillage de ligne (`for update`) sur les paiements, contraintes d'unicité empêchant les doubles avoirs, verrouillage de facture émise, exclusion de relance automatique sous verrou, limitation de débit applicative — **toutes ces suites sont vertes**, ce qui constitue la preuve réelle que les mécanismes anti-race-condition sont en place et fonctionnent, puisque pgTAP exerce ce code SQL directement.

Test de charge concurrente réelle (requêtes HTTP parallèles frappant des endpoints en direct) **non réalisé** — limitation de portée documentée, pas un oubli silencieux.

## PERFORMANCE

Fixture réaliste chargée (~200k lignes, `scripts/perf/generate_fixture.sql`, 7m13s de chargement). RPCs de listes (devis/factures/clients/chantiers paginés, indicateurs dashboard) mesurées en conditions RLS réelles, rôle `authenticated` : 1,5–42 ms, contre ~1,1 s documenté comme référence avant correctif dans l'en-tête de la migration 300 — le correctif de performance et les index trigram fonctionnent réellement, mesuré, pas supposé.

Anomalie réelle trouvée et racinée : `chantiers_liste_paginee` reste systématiquement à 119–162 ms (contre 1,5–42 ms pour les autres, alors que sa table est la plus petite), car elle appelle une fonction `SECURITY DEFINER` de vérification de droits (`peut_consulter_chantier`) une fois par ligne candidate avant `LIMIT`. Constat de priorité modérée, non creusé davantage (phase explicitement de priorité la plus basse de la mission).

## KNOWN_LIMITATIONS

- Docker absent → `supabase start`/`db reset` inutilisables ; contourné par PostgreSQL natif + stubs documentés (voir FRESH). Signature Ed25519 réelle (`pgsodium`) non produisible hors-ligne → 1 suite pgTAP non exécutable (`platform_stripe_state_attestation_r72`).
- Suite `analysis.test.ts` du worker studio-video : dépendances Python (`opencv-python-headless`) absentes → couverture qualité vidéo nulle dans cet environnement (nouvelle observation, pas testée avant ici).
- Tests HTTP live multi-tenant et tests de charge concurrente réelle non réalisés (preuve apportée au niveau DB/RLS/RPC et revue de code serveur, pas boîte noire réseau).
- Test physique iPhone jamais réalisé pour Reserves offline (préexistant, reconfirmé toujours non fait).
- Scénario E2E offline Reserves #3 historiquement instable sous contention machine (préexistant) — non ré-exécuté dans cette passe (aucun des 5 agents applicatifs n'a lancé les scripts E2E Playwright, hors périmètre du temps imparti ; seuls les gates unitaires/build ont été exécutés).
- 10 DECISION_REQUIRED restent ouvertes dans le manifeste d'environnement (modèles de prix Stripe modules/comptes supplémentaires/options IA, retrait des tarifs historiques, bloc stockage vendable ou non, `FEATURE_CRONS_ENABLED` fail-open vs fail-closed, valeur par défaut de l'inscription Studio) — ce sont des décisions produit/commerciales pour Julien, pas des défauts techniques ; non tranchées ici par choix conservateur (aucune n'a été résolue unilatéralement).
- Correctif SQL de traçabilité de réaffectation d'entreprise (Reserves) toujours non intégré (préexistant, reconfirmé).
- `transpilePackages` de Reserves omet un des 3 packages `file:` (actuellement sans effet, note de fragilité future).

## REMOTE_NOT_PROVEN

Rien de ce rapport ne constitue une preuve Preview ou Production. Non testés dans cette mission, par construction (interdiction explicite de toucher ces environnements) :
- Déploiement Preview réel (build/runtime Vercel, edge, cache) — seul le build local a été vérifié.
- Environnement Production réel.
- Stripe réel (Test ou Live) — toute vérification de prix a été SKIP faute d'accès, jamais simulée comme si elle avait réussi.
- Supabase hébergé distant (projet réel, GoTrue/PostgREST/Storage réels — seuls des stubs locaux ont tourné).
- Existence d'une entité légale, d'un fournisseur d'e-mail transactionnel réel, et des 4 blocages Production identifiés dans l'historique antérieur (aucun n'a été levé par cette mission, aucun ne relève d'ailleurs du technique).

## RELEASE_VERDICT

**TRAIN NOT QUALIFIED**

Justification : la quasi-totalité de la surface testée est saine et même remarquablement solide — 313/313 migrations fraîches propres, 2499/2499 assertions pgTAP réellement passées (0 échec réel), 20/20 gates de build/lint/test/typecheck verts sur les 5 apps (GP 1786 tests, Colors 427, Tools 1992, Studio 260, Reserves 178), isolation multi-tenant et sécurité applicative vérifiées sans faille à deux niveaux (DB + code serveur), performance mesurée et conforme aux corrections déjà documentées.

Mais deux défauts réels et nouvellement découverts sont, par nature, disqualifiants pour un verdict de qualification :

1. **Le chemin de mise à niveau (upgrade) casse sur des données réelles** : la migration `20260921000300` interrompt et laisse une base partiellement migrée dès qu'un tenant a au moins une facture déjà émise — exactement le cas de tout client réel existant. Une « qualification » de train de migrations qui ne peut pas migrer une base réelle sans intervention manuelle n'est pas qualifiée pour cet usage précis.
2. **Contournement de frontière de facturation dans Tools** : tout membre d'organisation peut obtenir une synchronisation cloud Pro illimitée sans palier payant, faute de vérification serveur — un défaut de sécurité/revenu concret, pas théorique.

Les deux sont précisément diagnostiqués, à cause racine identifiée, non spéculatifs — ce ne sont pas des limitations d'environnement déguisées. Une fois ces deux points corrigés (et re-vérifiés par un nouveau passage FRESH+UPGRADE+PGTAP et un gate Tools ciblé), le train redeviendrait un candidat très probable à **TRAIN LOCALLY QUALIFIED**, au vu de la qualité du reste des résultats. Aucune preuve Preview n'existe : le verdict **PREVIEW DEPLOYMENT CANDIDATE** est explicitement hors de portée ici, et **PREVIEW QUALIFIED** n'a jamais été et ne sera pas employé sans une vraie Preview.

---

## Annexes — rapports détaillés par agent

- `scratchpad/reports/db-fresh-upgrade-pgtap.md` (harnais complet, stubs SQL, classification pgTAP fichier par fichier, analyse upgrade)
- `scratchpad/reports/gp-qualification.md`
- `scratchpad/reports/colors-qualification.md`
- `scratchpad/reports/tools-qualification.md`
- `scratchpad/reports/studio-qualification.md`
- `scratchpad/reports/reserves-qualification.md`
- `scratchpad/reports/prior-qualification-digest.md` (synthèse de ~35-40 documents de qualification antérieurs)

Ces annexes résident dans le répertoire scratch de la session (non versionné) ; leur contenu intégral est résumé fidèlement dans les sections ci-dessus.
