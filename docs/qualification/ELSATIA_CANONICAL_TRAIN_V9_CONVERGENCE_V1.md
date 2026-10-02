# ELSATIA — Train canonique V9 : convergence post-V8 (V1)

| | |
|---|---|
| Date | 2026-10-02 |
| Base | `integration/elsatia-canonical-train-v8-hotfix-813-original` @ `de50245a` (= V8 `53b4bc76` + hotfix `20261002000813_plateforme_annuaire_lecture_pure`, 372 migrations), **non modifiée** |
| Branche | `integration/elsatia-canonical-train-v9` (même commit poussé sur la branche de session `claude/pensive-bohr-7oxgd8`) |
| Migrations | **395** (partagé), dernière **`20261002001203`** ; Studio dédié **24** (dernière `20261002100000`). Bloc V9 : **23 ajoutées après la 813, 0 modifiée, 0 antérieure à la 813** |
| Moteur | PostgreSQL 16 + pgTAP (`scripts/local-postgres-bootstrap`, sans Docker), Node 22 |
| Actions distantes | **Aucune.** Ni Supabase hébergé, ni Vercel, ni Stripe réel, ni Preview, ni Production, ni merge vers `main`. |
| Remplace | la version « V9 BLOCKED » de ce rapport (`claude/bold-allen-7mx7xz` @ `daebf3bf`), dont l'unique cause (813 introuvable) est levée |

## 0. Verdict

# ELSATIA CANONICAL TRAIN V9 LOCALLY QUALIFIED

La V9 part de la référence canonique **813 original** (`de50245a`) et intègre, dans l'ordre imposé :
Legal Consent (901), Security Residual V2 (1001), Stripe readiness ciblé (P1-P5, P7 : 1002-1003), les lots
post-V8 qualifiés (GP residual, capacité, rotation des clés, rate limit, Relevé Lots 10-11, docs / outillage)
et l'export RGPD **en dernier** (1201-1203). Aucune migration ≤ 813 n'est ajoutée après coup ; aucune migration
publiée n'est modifiée.

La convergence a révélé **deux défauts réels invisibles lot par lot**, corrigés avec preuve rouge → vert :
1. la migration RGPD (base V6) **écrasait** la version V8 de `exporter_donnees_entreprise` et réexposait NIR,
   IBAN, coût interne et notes RH dans l'export JSON (1203, §7) ;
2. la facture d'essai Stripe à 0 € faisait passer une entreprise en « actif » pendant l'essai (P7 reproduit, 1003).

Ainsi qu'un **résiduel de sécurité confirmé** (fuite en lecture des postes / permissions d'une entreprise sans
membre, 1001), deux redirections ouvertes résiduelles, et plusieurs dettes d'outillage héritées des lots
(manifeste d'env., lint, seeds, gate, DB verify).

| Preuve | Résultat V9 |
|---|---|
| Base neuve | **395/395**, 0 erreur ; Studio dédié **24/24** |
| Upgrade V8 + 813 → V9 (base historisée V3 → V8, données réalistes) | 23 migrations, 0 erreur ; checksums **101/101** ; sonde RLS **1 836 cellules, 0 écart** ; schéma + ACL **identiques au fresh** ; contrôles métier **18/18** ; Studio 23 → 24 identique au fresh |
| Ledger | registre CLI reconstitué **395/395**, dernière `20261002001203` ; bloc V9 = 23 ajouts > 813, 0 modification |
| pgTAP (une base par fichier) | **179 fichiers, 170 propres, 9 206 ok** ; les 9 non propres sont **exactement** ceux de la référence V8 + 813 (pgsodium r72, cloud_sync Tools, 7 suites Studio rejouées dans le projet dédié) ; Studio dédié **886 ok / 0** |
| DB verify (38 contrôles, banc local) | **GO** (`--before-owner`), 50/50 RPC service-role only |
| Concurrence réelle | Billing **22/22**, ordre Stripe **15/15**, essai **7/7**, réabonnement **20/20**, Per-App **27/27** |
| Drill d'incident (GoTrue réel, PostgREST, Storage, Redis, faux Stripe / Brevo) | **91/91 ×2** (bases 395 + Studio 24 construites par la passe complète ; 1ʳᵉ passe 88/91 : dépendances du worker non installées dans l'environnement, corrigé hors dépôt) |
| Applications | typecheck ✅ ; lint ✅ (0 erreur) ; Vitest GP **3 004**, Tools **2 162**, Réserves **226**, Colors **431**, Studio **347** ; builds GP, Tools, Réserves, Colors, Studio ✅ |
| Seeds | **20/20 seeds actifs qualifiés** sur 395 migrations (DR : sauvegarde / restauration, zéro perte, RLS intacte) ; `test:seeds` 48/48 |
| Dépôt | `verify:migrations`, `verify:secrets`, `verify:env-manifest` (+ 67/67), `verify:train-expectations`, `test:preview-pack` 31/31, `test:migration-targets` 7/7, `test:commercialization` 16/16 |

---

## 1. Références vérifiées sur origin (`git fetch --prune`, 364 branches)

| Élément | Branche | SHA constaté | Base | Décision |
|---|---|---|---|---|
| V8 | `integration/elsatia-canonical-train-v8` | `53b4bc76` | — | base |
| Hotfix 813 (original, de `4cd9bec4`) | `integration/elsatia-canonical-train-v8-hotfix-813-original` | `de50245a` | V8 | **base V9** (372, dernière `20261002000813`) |
| Hotfix 813 reconstruit | `integration/elsatia-canonical-train-v8-hotfix-813` | `23153716` | V8 | **obsolète — non utilisé** |
| Legal Consent | `claude/bold-allen-7mx7xz` | `d17177b4` (tip `daebf3bf` = ancien rapport V9 BLOCKED) | V8 | KEEP, merge de `d17177b4` |
| Stripe readiness | `claude/elegant-turing-b4ewbp` | `254a3703` (code `b9eb1bf`) | `main` | PORT sémantique ciblé (§5) |
| Résiduel sécurité | `claude/ecstatic-fermat-bcqats` | `375b35dd` | `main` | PORT sémantique (§4) ; `71c5291` (Security Residual V2) toujours **absent** du dépôt |
| GP residual data correctness | `claude/optimistic-hopper-0ytout` | `f77966f2` | V8 | KEEP |
| Capacité pages lourdes & PDF | `claude/beautiful-albattani-gbd2h7` | `89820bd4` | V8 | KEEP |
| Rotation des clés IBAN/BIC | `claude/dazzling-turing-2q77nn` | `2b7e3671` | V8 | KEEP |
| Rate limit de connexion | `claude/gracious-curie-135pix` | `2385345f` | V7 | KEEP |
| Relevé & Métré Lot 10 | `claude/fervent-bell-1tbhc5` | `b924ccf7` | V8 | KEEP (référence du Lot 10) |
| Relevé & Métré Lot 11 | `claude/beautiful-tesla-grj0pu` | `9ac7fbfc` | V8 | PORT : commits Lot 11 seuls, au-dessus du Lot 10 de fervent-bell |
| Export RGPD / portabilité | `claude/kind-mayer-w4wfy6` | `040ca1e2` | V6 | KEEP, **en dernier** |
| Docs / outillage | `blissful-volta` `53c3f880`, `modest-shannon` `27f42417`, `gifted-cori` `b7a534fa` | | V8 / V8 / V6 | KEEP |
| Studio Preview V4.1 | `claude/cool-gauss-wjvmd8` | `64ddf593` | V7 | **EXCLU** : réécrit 3 migrations Studio dédiées déjà publiées (`…0928100000`, `…0928110000`, `…0929160000`) — interdit ; à reprendre en lot dédié |

Déjà dans V8 (non dupliqués) : Relevé Lots 8-9, Billing lifecycle, Incident Response, Security Red Team V2,
suspension commerciale par application, correctifs Performance C2-C4. Non portés (DROP) : migration Stripe
`20261002000184` (doublon de `…0802`, numéro jamais réutilisé), `LIRIA_VENDEUR_*` / `LIRIA_TVA_*`, moteur de
synchronisation et catalogue Stripe concurrents, Lot 10 indépendant de beautiful-tesla, packs Preview historiques.

## 2. Ordre de convergence (premier parent de la branche)

| # | Étape | Commit(s) | Conflits |
|---|---|---|---|
| 1 | V8 + hotfix 813 original | base `de50245a` | — |
| 2 | Legal Consent | merge `0b862aa4` (`d17177b4`) | aucun ; 901 ne recoupe pas la 813 |
| 3 | Security Residual V2 (portage) | `f9748802` → `20261002001001` | — |
| 4 | Stripe readiness P1-P5 + qualification P7 | `2de34959` → `…1002`, `…1003` | — (écrit sur le code V8) |
| 5 | GP residual data correctness | merge `20f297d8` + renumérotation `6c7886f2` | attendus générés |
| 5 | Capacité pages lourdes & PDF | merge `a0be2262` | **3 conflits applicatifs** résolus sémantiquement (§6) |
| 5 | Rotation des clés bancaires | merge `3155ff28` + `f05d6c1f` | attendus générés |
| 5 | Rate limit de connexion | merge `d3ae63ad` + `e3a4a656` | attendus générés ; collision de version levée |
| 5 | Relevé Lot 10 | merge `b8e0786f` + `045081e8` | attendus générés |
| 5 | Relevé Lot 11 (port) | `32289b56` … `2e5c728a` + `fb5b5d7d` | import `ouvrages/page.tsx` |
| 5 | Docs / outillage | merges `5ef10f11`, `f7a2d6bc`, `7a8f77d2` + `dd8a4a4c` | pack Preview (docs), `package.json` |
| 6 | Convergence d'outillage | `a4770854` (manifeste d'env.), `e1c7308e` (lint) | — |
| 7 | **Export RGPD, en dernier** | merge `6a717ae9` + `75e0d390`, `bf89b175`, `79553fe2` | `proxy.ts`, cibles Studio, DB verify, pack |
| 8 | Qualification et outillage | `b5389a3f`, `35ba6a6c`, `0f2451d1`, `2e39855c`, `fb1f0826`, `43b768ea` | — |
| 9 | `sync:train-expectations` (une fois les migrations fixées) | `817c9149` (+ resync après contrôle 38) | — |

Aucun cherry-pick depuis une branche basée sur `main` : Stripe et sécurité sont **réécrits** sur le code V8.
Seuls les commits Lot 11 de beautiful-tesla (branche basée sur V8) sont repris par `cherry-pick -x`.

## 3. Migrations

Toutes les migrations candidates antérieures à la 813 sont renumérotées **après 901**, dans l'ordre relatif
d'origine ; corps inchangés, en-tête « Train canonique V9 : numéro d'origine … ». Références alignées
(code, tests, pgTAP, scripts) ; les rapports de lot gardent leurs numéros d'origine.

| Version V9 | Origine | Lot |
|---|---|---|
| `20261002000813` | inchangée (hébergée) | hotfix annuaire plateforme |
| `20261002000901` | inchangée | Legal Consent |
| `20261002001001` | nouvelle | Security Residual V2 (§4) |
| `20261002001002` | nouvelle | Stripe P1 (§5) |
| `20261002001003` | nouvelle | Stripe P7 (§5) |
| `20261002001101`-`1104` | `20260928000813`-`0816` | GP residual (finance, pointage/planning, fiche chantier, journal IA) |
| `20261002001105`-`1106` | `20260930000101`-`0102` | GP residual (pointages gestion, facture brouillon) |
| `20261002001107` | `20260930000301` | GP residual (rentabilité) |
| `20261002001108`-`1111` | `20260930000401`-`0404` | GP residual (fiches, pilotage, plateforme, sélecteurs) |
| `20261002001112` | `20260930000813` | rotation des clés bancaires |
| `20261002001113` | `20260930000101` (**collision** avec GP residual) | rate limit de connexion |
| `20261002001114`-`1115` | `20260930001401`-`1402` | Relevé Lot 10 |
| `20261002001116` | `20260930001501` | Relevé Lot 11 |
| `20261002001201` | `20260929000101` | export RGPD (en dernier) |
| `20261002001202` | nouvelle | export RGPD : catalogue complété (§7) |
| `20261002001203` | nouvelle | convergence export RGPD × Employés (§7) |
| Studio dédié `20261002100000` | `20260929100000` (**collision** avec `…_studio_render_admission`, antérieur à `…180000`) | export RGPD Studio |

Comparaison des redéfinitions : toute fonction redéfinie dans le bloc V9 part de sa dernière définition du
train (`synchroniser_abonnement_stripe_service` ← 507, `appliquer_evenement_facture_abonnement_service` ← 801,
`tools_releve_plan_figer` ← 810, `modifier_facture_brouillon` ← 255) — **sauf** `exporter_donnees_entreprise`
en 1201 (corps V3), corrigée par 1203. **Fonctions plateforme** : seule la 813 redéfinit
`plateforme_annuaire_entreprises` ; `plateforme_applications_compteurs` et `plateforme_postes_tarifs_entreprise`
(1110) sont nouvelles. Aucune collision avec 813 ni 901.

`verify:migrations` : **395 valides** ; cibles partagé 395 · Studio dédié 24 (9 copies gelées + 15 dédiées).

## 4. Security Residual V2 (`20261002001001`)

`71c5291` reste introuvable ; le résiduel identifié (`ecstatic-fermat` RT-02) est **reproduit avant correction**
sur la base cible V8 + 813 :

| Sonde (utilisateur authentifié étranger, entreprise créée par la plateforme sans membre) | V8 + 813 | V9 |
|---|---|---|
| lecture des postes / matrice de permissions | **10 postes / 903 lignes lus** (fuite réelle) | 0 / 0 |
| création / modification de poste ou de permission | refusée (policies RESTRICTIVE `role_gestion_*`, seconde barrière) | refusée |
| auto-rattachement (`utilisateurs_entreprises`) | refusé (même seconde barrière ; clause permissive ouverte) | refusé |

Correctif : les 5 policies gardent **exactement** leur prédicat V8 (`est_membre_actif` / `_reel`) sans la clause ;
la policy d'insertion devient « invitation par un membre actif ». Parcours légitimes (création atomique, adhésion
par code, invitation, plateforme) inchangés : SECURITY DEFINER. pgTAP `securite_residuel_entreprise_sans_membres_v1`
**16/16** (contre-épreuve sans 1001 : 3 échecs) ; `session_support_sans_persistance` aligné sur le nouveau nom.
RT-04 / RT-05 déjà couverts en V8. RT-01 résiduel : `/api/paie/documents/upload` et `paiements-bancaires`
gardaient un contrôle `startsWith("/")` contourné par `/\evil.com` (→ `https://evil.com`) : passage à
`destinationInterneSure` + Vitest `redirects-residuel-v9`.

## 5. Stripe readiness ciblé (P1-P5, qualification P7)

Portage selon `ELSATIA_STRIPE_READINESS_PORT_PLAN_V1` (décisions propriétaire 1-9), sur le code V8.

| Point | Mise en œuvre V9 | Preuve |
|---|---|---|
| **P1** prix contractuel / périodicité | `1002` : « même contrat » = même offre **et** même périodicité ; corps 507 sinon inchangé ; aucune écriture de données | pgTAP `stripe_readiness_v9` P1-1…P1-6 (mensuel → annuel = prix annuel de la version active ; annuel → mensuel ; offre et périodicité inchangées = prix historique) ; upgrade : contrats 69 € et Pro 199 € intacts |
| **P2** aucune facture finale Live sans prérequis | pied de facture du client Stripe limité aux champs **prouvés** d'`IDENTITE_VENDEUR` (mention « Stripe Test : sans valeur » hors Live) ; `invoice.created` brouillon en Live sans prérequis → `auto_advance=false` (échec = réservation annulée, Stripe re-livre) | Vitest webhook (4 cas), `stripe-readiness-v9` |
| **P3** verrou unique | `abonnementsPublicsOuverts()` reste l'unique verrou ; en Live : `ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE`, `LEGAL_TVA_REGIME_CONFIRME` (distinct du texte et de `STRIPE_AUTOMATIC_TAX_ENABLED`) et identité vendeur prouvée ; en Test : flag seul | Vitest ; **état actuel : Live fermé** (`adresse` = `DECISION_REQUIRED`) |
| **P4** API basil | échéance, période et annulation programmée lues sur `items[]` | Vitest (null avant P4) |
| **P5** rapprochement | `/api/cron/abonnements` (derrière `FEATURE_CRONS_ENABLED`) : relecture **lecture seule** (chaîne remise exclue), RPC ordonnée, identifiant `rapprochement:<sub>:<jour>`, jamais une entreprise `annule` | pgTAP P5-1…P5-4, Vitest |
| **P7** facture d'essai 0 € | **défaut reproduit** (contre-épreuve d'abord) : `invoice.paid` 0 € à t+1 s après la relecture `trialing` → `actif` pendant l'essai. Correctif minimal `1003` : `sans_effet` / `facture_essai_sans_montant`, trace de facture conservée | pgTAP P7-1…P7-7 ; `stripe_trial_synchronization_v1` test 69 aligné (V8 l'« appliquait ») |

Une seule source d'identité vendeur (`src/lib/identite-vendeur.ts`) ; aucun `LIRIA_*`. P6 (harnais Test Clock) hors
périmètre. Variables nouvelles déclarées au manifeste et aux gabarits `.env*`.

## 6. Autres lots : conflits et convergences

| # | Interaction | Constat | Résolution |
|---|---|---|---|
| 6.1 | Capacité × GP residual — tableau de bord | BA pagine le centre d'alertes ; OH calcule les sources en base, bornées, avec alertes « N autres … » | sources OH partagées par la 1ʳᵉ page **et** la pagination (`lireSourcesAlertes`) via `sourcesDepuisLectures` : même liste des deux côtés ; Vitest de convergence |
| 6.2 | idem — planning | semaine lue en base (OH) vs vues et lots transmis une fois (BA) | les deux ; clé de lot normalisée (`?? null`) |
| 6.3 | idem — pointage/gestion | deux paginations | données, totaux, compteurs et pagination OH (exacts) + formateurs hissés et action unique par type (BA) ; recette e2e capacité alignée (50 / page, paramètre `anciens`) |
| 6.4 | Lot 11 × Lot 10 | Lot 11 qualifié sur un Lot 10 en contrat 1.0.0 ; Lot 10 retenu = 1.1.0 | contrôle serveur GP (`1.x`) : contrat 1.1.0 généré par le domaine **RECEVABLE** (preuve SQL) ; test miroir ; résumé d'envoi rattaché à la constante du contrat |
| 6.5 | Lots post-V8 × manifeste d'env. | `verify:env-manifest` échouait **déjà sur les branches** (OH 3, BA 8, beautiful-tesla 1) | `PDF_*` déclarées ; bancs (`scripts/perf/`, `src/lib/test-support/`) exclus avec justification ; `GP_INACCESSIBLE` littéral ignoré |
| 6.6 | Capacité × lint | `sampler.cjs` (préchargement CommonJS) : 4 erreurs | désactivation ciblée justifiée |
| 6.7 | Gate de commercialisation (V6) × dépôt V7+ | sonde d'un chemin devenu répertoire (EISDIR) | fail-closed (absent) ; 16/16 |
| 6.8 | Seeds × lots | 5 scripts de données non classés ; purge « rentabilité » laissant **66 codes QR orphelins** | entrées CI_ONLY à harnais réel ; purge corrigée ; rejouabilité déclarée honnêtement |

## 7. Export RGPD (en dernier)

| Constat (qualification V9) | Résolution |
|---|---|
| Catalogue qualifié sur V6 : **19 tables `public` non classées** (V8 : Per-App, mode sûr, Relevé 8-9 ; V9 : Lot 10, clés bancaires, import Tools → GP) — pgTAP test 1 *have 19, want 0* | `1202` : classement selon les règles existantes (tenant → BUSINESS_DATA, journal → SHARED, technique → EXCLU) ; 89/89 |
| **Régression de sécurité** : 1201 redéfinit `exporter_donnees_entreprise` depuis le corps V3 et **écrase la version V8 du lot Employés (0806)** : l'export JSON d'un administrateur sans droit RH réexposait NIR, IBAN, coût interne, notes RH, numéros d'inscription (`employes_donnees_personnelles_acces_v1` : 6 échecs) — invisible au merge | `1203` : corps 0806 à l'identique + seul apport du lot RGPD (refus d'une session d'assistance) ; employés 65/65 ; pgTAP `v9_convergence_rgpd_export_employes_v1` 4/4 (contre-épreuve : 2 échecs) |
| Studio dédié : collision de version, test basculant Studio en lecture seule **sans motif** (mode sûr Studio V8) | renumérotation `20261002100000` ; règle conservée, la fixture fournit le motif (comme post-H en V8) |
| `proxy.ts` | union : `/dpa`, `/api/health` (V8/901) et `/api/cron/rgpd-export` |

## 8. Qualification

| Domaine | Preuves | Résultat |
|---|---|---|
| Base neuve | `rebuild_db.sh` | 395/395, 0 erreur |
| Upgrade V8 + 813 → V9 | `scripts/qualification/upgrade-v8-v9.sh` (base `upg_v8_v9` construite par `upgrade-v7-v8.sh` depuis `de50245a`) | 23/23 ; 1 écart de lignes : `storage.buckets` 20 → 21 (`rgpd-exports`, **privé**) ; 20 tables nouvelles (vides sauf catalogue RGPD, versions de documents légaux, politique d'export, clé bancaire active) ; checksums 101/101 ; policies 658 → 666 : **1 supprimée / 4 modifiées = exactement les 5 du correctif 1001**, 9 ajoutées (tables nouvelles + policy renommée) ; sonde RLS 1 836 cellules, **0 écart** ; 0 droit retiré ; 0 EXECUTE modifié ; 140 fonctions nouvelles dont 83 `authenticated`, **0 `anon`** ; schéma + ACL = fresh (38 519 lignes, 2 454 ACL) ; métier 18/18 |
| Ledger | `supabase_migrations.schema_migrations` reconstitué (format CLI) + DB verify | 395/395, aucune version manquante ou étrangère |
| pgTAP complet | `pgtap-run-v3.sh` sur fresh | 179 / 170 propres / 9 206 ok ; 9 non propres = référence V8 + 813 |
| RLS / grants | upgrade (sonde, droits), DB verify (RLS, anon, service-only), pgTAP isolation 56 + 24 + 10 | conformes |
| Security | `securite_residuel_entreprise_sans_membres_v1` 16/16 (contre-épreuve : 3 échecs) ; redirections (Vitest) ; red team V2 (DB verify 36) | ✅ |
| Legal Consent | `acceptations_documents_legaux_v1` 45/45 ; upgrade : 0 acceptation fabriquée ; DB verify 38 | ✅ |
| Billing / Stripe | lifecycle 190/190, ordre 137/137, essai 82/82, réabonnement 99/99, Per-App 2 925/2 925, orphelins 30/30, `stripe_readiness_v9` 23/23 ; concurrence 22 + 15 + 7 + 20 + 27 ; Vitest webhook 53/53, readiness, rapprochement, cron | ✅ |
| Relevé | Lot 10 67/67 + 53/53, Lot 11 76/76, domaine 437 Vitest (parité SQL ↔ TS), contrat 1.1.0 recevable (preuve SQL) | ✅ |
| Auth / Storage | drill : GoTrue réel (connexion, gel), Storage (gel, uploads, liens publics), RLS réelle 91/91 ×2 ; rate limit 8/8 ; DB verify buckets | ✅ |
| GP residual / capacité | `gp_residuel_agregats_v1` 303/303, `finance_agregats_exactitude_v1` 237/237, pointages 43/43, rentabilité 60/60, facture brouillon 34/34 ; Vitest de convergence du centre d'alertes | ✅ |
| Mode sûr | `incident_safe_mode_v1` 131/131, `v8_convergence_incident_gardes_v1` 32/32 ; toute table V9 gardée | ✅ |
| Export RGPD | 89/89 ; employés 65/65 ; convergence 4/4 ; Studio `studio_rgpd_export` 22/22 | ✅ |
| Typecheck / lint | racine + 4 apps ; Studio | ✅ (lint : 15 avertissements, 0 erreur) |
| Vitest complet | racine (dont packages) 3 004 ✓ / 198 ignorés (bancs non configurés) ; Tools 2 162 ; Réserves 226 ; Colors 431 ; Studio 347 | ✅ |
| Builds | GP (39/39 pages statiques), Tools (`NEXT_PUBLIC_TOOLS_ENV=local`), Réserves et Colors et Studio (`ELSATIA_APPLICATION_ENV=local`) | ✅ |
| `verify:migrations` / `verify:secrets` | 395 valides, cibles OK / 3 697 fichiers, aucun secret | ✅ |
| `sync:train-expectations` | exécuté une fois toutes les migrations fixées (395, dernière `…1203`), resynchronisé après l'ajout du contrôle 38 ; `verify:train-expectations` OK | ✅ |

## 9. Restent ouverts, sans masquage

- **Recettes navigateur (Playwright) non rejouées en V9** : Relevé 2→11, capacité pages lourdes, D-01,
  Billing navigateur, Colors, Employés, E2E Studio dédié. Deux specs ont été **adaptées sans exécution** à la
  convergence (`gp-heavy-pages-capacity` : pagination 50 / paramètre `anciens` ; `tools-releve-lot11-gp` :
  contrat 1.1.0 ; Studio `00-dedicated-chain` : 24 migrations). À rejouer avant toute Preview.
- **Worker Studio** : 9/42 tests échouent dans cet environnement (FFmpeg système : « Filter not found ») ; le
  worker est **inchangé depuis V8** (0 ligne de diff) — environnemental ; Studio reste OFF pour la Preview.
- **Préexistants hérités de V8** (identiques) : `platform_stripe_state_attestation_r72` (pgsodium réel requis),
  `elsatia_tools_cloud_sync_entitlement_closure_v1`, suites Studio dans le projet partagé (vertes dans le projet dédié).
- **Stripe** : le pied de facture n'est posé qu'à la **création** du client Stripe (les clients existants gardent le
  leur) ; P6 (rejeux automatisés du harnais Test Clock) hors périmètre ; le Live reste **fermé** tant que l'adresse
  vendeur, le régime de TVA et l'ouverture Live ne sont pas confirmés (comportement voulu).
- **Export RGPD** : les preuves d'acceptation CGU/CGV/DPA (`platform.acceptations_documents_legaux`, schéma
  `platform`) ne sont pas dans l'archive d'export (catalogue limité à `public`) — décision à prendre.
- **`claude/cool-gauss-wjvmd8`** exclu (réécriture de migrations Studio publiées) ; **gate de commercialisation**
  (gifted-cori) : son registre ancre les preuves CODE / DB sur le rapport V6 — à ré-ancrer sur ce rapport avant
  usage (artefacts du lot conservés tels quels).
- `71c5291` (Security Residual V2) et `c73adf98` (onboarding) restent **introuvables** : le résiduel connu est
  porté depuis `375b35dd` ; si `71c5291` contient d'autres points, ils restent à comparer.
- Les harnais locaux ont nécessité, **hors dépôt** : `postgresql-16-pgtap`, `postgresql-plpython3-16`, un mot de
  passe local pour `postgres` (DR), `supabase_auth_admin` superutilisateur (drill), `npm ci` du worker.

## 10. Backlog V9 conservé

- **V9-01** : les champs `datetime-local` sont interprétés selon le fuseau UTC du serveur au lieu du fuseau du navigateur.
- **V9-02** : impossible de vider une date d'habilitation dans Safari ; prévoir une option explicite « Sans date de fin ».

Décisions propriétaire toujours ouvertes (conditionnent le Live, pas le train) : régime de TVA
(`LEGAL_TVA_REGIME_CONFIRME`), publication de l'adresse vendeur (`IDENTITE_VENDEUR.adresse`), ouverture Live
(`ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE`), RNE, code APE.

## 11. Publication

`integration/elsatia-canonical-train-v9` poussée sur origin (création ; aucune branche existante modifiée),
ainsi que la branche de session `claude/pensive-bohr-7oxgd8` (même commit). **Aucun déploiement, aucune
Preview, aucune Production.**
