# ELSATIA — Canonical Train V9 : convergence post-V8 (V1)

| | |
|---|---|
| Date | 2026-10-02 |
| Base | `integration/elsatia-canonical-train-v8` @ `53b4bc76b1096acbd8a8a8dd7340b1a577f99307` (verdict `CANONICAL TRAIN V8 LOCALLY QUALIFIED`, 371 migrations, dernière `20260928000812`), **non modifiée** |
| Branche | `integration/elsatia-canonical-train-v9` (worktree local dédié), poussée sous la seule branche autorisée de la session `claude/compassionate-ptolemy-vu8vbx` (même commit, §13) |
| SHA final | le commit de ce rapport (dernier commit de code : `ffbd35b0`) — voir le message de livraison |
| Migrations | **384**, dernière **`20260930000901`** : V8 (371, intactes) + **13** migrations V9. Projet Studio dédié : **23**, inchangé |
| Moteur | PostgreSQL 16 réel + pgTAP 1.3 (`scripts/local-postgres-bootstrap`, sans Docker) ; Node 22.22 ; PostgREST v12.2.3 (binaire officiel, `db-max-rows = 1000`) ; GoTrue v2.196.0 (binaire officiel de la release, au lieu d'une compilation) ; Playwright 1.56.1 + Chromium 1194 ; Redis 7 |
| Actions distantes | **Aucune.** Ni Supabase hébergé, ni Vercel, ni Stripe réel, ni Preview, ni Production, ni merge vers `main`. V8 et ses branches n'ont pas été modifiées |

## 0. Verdict

**`CANONICAL TRAIN V9 LOCALLY QUALIFIED`**

V9 intègre les correctifs qualifiés après V8 qui ferment les **4 blockers Performance de V8** (B1 rate limit de
connexion, B2 troncature à 1 000 lignes, B3 mémoire Next, B4 facture brouillon), le **P0 de versionnement des clés
IBAN**, les agrégats financiers / TVA / trésorerie, la rentabilité, l'exactitude GP résiduelle au-delà de 1 000 lignes,
et le dernier résiduel ouvert de la red team V1 (RT-01).

| Preuve | Résultat V9 |
|---|---|
| Base neuve | **384/384**, 0 erreur |
| Ledger | **9/9** : 0 migration V8 modifiée / renommée / supprimée, préfixe V8 strict, 384 versions uniques et monotones, 13 versions V9 toutes postérieures à `…0928 000812`, ledger Supabase simulé : 13 en attente, `db push` sans `--include-all` |
| Upgrade V8 → V9, passe historique (base V3 → V8 réelle, 52 utilisateurs) | 280 tables : **0 écart de lignes**, **117/117 empreintes identiques**, policies 658 → 658 (**0 supprimée, 0 modifiée, 0 ajoutée**), sonde RLS réelle **2 499 cellules, 0 écart**, droits de table 486 → 486, EXECUTE **0 modifié, 0 retiré** ; schéma + ACL **= fresh** (35 940 lignes, 2 296 ACL) ; **les 47 contrôles métier V8 rejoués sur la base V9 : 47/47** |
| Upgrade V8 → V9, passe volumétrique (+ jeux 500 → 20 000 lignes, 76 utilisateurs) | **0 écart** de lignes, d'empreintes, de policies, de droits ; schéma + ACL = fresh ; **contrôles métier V9 30/30** |
| Droits nouveaux | 62 fonctions nouvelles, toutes classées : **44** RPC `authenticated` (43 SECURITY DEFINER à parité RLS prouvée, 1 SECURITY INVOKER), **12** `service_role` seul, **6** internes ; **0** exécutable par `anon` ; **aucun changement silencieux de droit** |
| pgTAP (une base par fichier) | **170 fichiers, 161 propres, 8 819 ok**. Les **163 fichiers communs avec V8** donnent **exactement** les résultats de V8 rejoué ici (154 propres, 8 059 ok, fichier par fichier). 7 suites nouvelles : **760/760** |
| DB verify (38 contrôles) | fresh V9 **GO** (36 OK, 2 non bloquants comme V8) ; contre-épreuve fresh V8 : NO-GO sur le **seul** contrôle 38 |
| Applications | typecheck, lint (0 erreur, 15 avertissements = V8), Vitest (**GP 2 777**, Tools 2 150, Réserves 226, Colors 431, Studio 343) et build **5/5** ✅ |
| Bancs PostgREST réels (max_rows = 1 000) | Finance **89/89**, GP résiduel **50/50** (5 volumes), pointages **5/5** volumes, rentabilité **4/4** (500 / 1 462 / 5 000), PDF Chromium **24/24** |
| Playwright | Finance **11/11** · GP résiduel **12/12** · pointages + facture brouillon **4/4** · rentabilité **5/5** · capacité pages lourdes / PDF **6/6** · pilote v2 + v3 **32/32** · Employés **15/15** — **85/85** |
| Recette pilote backend (GoTrue + PostgREST réels) | **V9 = V8** : 69 PASS, 1 FAIL (PE-04, identique V8), 1 MANUAL ; scénarios auth/RLS tous verts (geste de fixture, §9.4) |
| Seeds / incident | **ALL ACTIVE SEEDS QUALIFIED — 17/17 sur 384** ; drill d'incident **91/91** |
| Portes du train | `verify:migrations` 384 ✅, `verify:train-expectations` ✅, `verify:env-manifest` ✅, `test:seeds` 48/48, `test:preview-pack` 31/31, etc. (§9.6) |

Restent ouverts, sans masquage (§12) :
- l'onboarding « Se déconnecter / Retour à l'accueil » : **aucune branche n'existe** ;
- les résiduels Security V2 SEC-4 / SEC-5 / SEC-6 : **aucun correctif qualifié** ;
- les lots fonctionnels Relevé 10-11 et Export RGPD, qualifiés mais **non intégrés** (candidats V10) ;
- les décisions propriétaire héritées (essai échu de la fixture pilote, C1, Preview, etc.).

---

## 1. Inventaire (étape 1)

Les 199 références distantes non contenues dans V8 ont été énumérées (`git for-each-ref` + `merge-base`). Celles
antérieures au 28/09 relèvent des trains V5 → V7, qui les ont déjà classées ; ne sont détaillées ici que les branches
postérieures à V7 ou explicitement visées par la mission.

### 1.1 Postes de la mission

| Poste | Branche @ tip | Base réelle | Commits | Migrations ajoutées | Tests du lot | Qualification d'origine | Décision V9 |
|---|---|---|---|---|---|---|---|
| Convergence GP « data correctness » (contient les 3 lignes suivantes) | `claude/optimistic-hopper-0ytout` @ `f77966f2` | **V8** `53b4bc76` | 35 | `20260928000813-816`, `20260930000101/102/301`, `20260930000401-404` (11) | pgTAP 303 + lots, Vitest PostgREST 50, Playwright 12 | ELSATIA GP DATA CORRECTNESS COMPLETE | **intégré** (merge) |
| ↳ Agrégats financiers / TVA / trésorerie | `claude/confident-brown-sndsqb` @ `592fb321` | V8 | 11 | `20260928000813-816` | pgTAP 237, Vitest PostgREST 89, Playwright 11 | FINANCE AGGREGATES LOCALLY QUALIFIED | intégré via la convergence |
| ↳ Rentabilité | `claude/festive-turing-7zqcce` @ `442c3fca` | **V7** `547f0b6f` | 4 | `20260930000301` | pgTAP 60, intégration 4, Playwright 5 | RENTABILITE DATA CORRECTNESS LOCALLY QUALIFIED | intégré via la convergence (portée sur V8 par elle) |
| ↳ Pointages > 1 000 lignes + facture brouillon / permission | `claude/busy-ramanujan-cbyclu` @ `7797e8f7` | **V7** | 3 | `20260930000101`, `…000102` | pgTAP 43 + 34, intégration 5, Playwright 4 | DATA CORRECTNESS LOCALLY QUALIFIED | intégré via la convergence |
| Mémoire Next + pages lourdes / PDF | `claude/beautiful-albattani-gbd2h7` @ `89820bd4` | **V8** | 9 | aucune | Vitest (formateurs Intl, file PDF), Playwright 6 | ELSATIA GP CAPACITY LOCALLY QUALIFIED | **intégré** (merge, 3 conflits sémantiques §3) |
| ↳ Mémoire Next (diagnostic, correctif Intl) | `claude/nice-goodall-3fk873` @ `6b4ef990` | **V7** | 11 | aucune | harnais de mesure | ELSATIA MEMORY BASELINE ESTABLISHED | **superseded** : correctif Intl et harnais portés sur V8 par la branche capacité ; non fusionnée |
| Limite de connexion (B1) | `claude/gracious-curie-135pix` @ `2385345f` | **V7** | 1 | `20260930000101` (**collision**) | Vitest 26 + 82 + 48, pgTAP 8 (jamais exécuté par le lot) | ELSATIA LOGIN RATE LIMIT LOCALLY QUALIFIED | **porté** (cherry-pick sémantique, migration renumérotée `…0930 000901`) |
| Chiffrement IBAN / BIC (P0 `F-DR-BANK-KEY-VERSIONING`) | `claude/dazzling-turing-2q77nn` @ `2b7e3671` | **V8** | 1 | `20260930000813` | pgTAP 75, Vitest, `test:bank-keys` | ELSATIA BANKING ENCRYPTION LOCALLY QUALIFIED | **intégré** (merge) |
| Correctifs Security résiduels | `claude/ecstatic-fermat-bcqats` @ `375b35dd` (red team V1) | `main` `4d92ddbe` (pré-V3) | 1 | `20260928000184` (non portée, §4) | Vitest, pgTAP | testée rouge → vert par le lot ; jamais intégrée (inventoriée par V7) | **RT-01 porté** (2 points d'entrée), RT-02 à RT-05 déjà couverts en V8 (§4) |
| Security V2, findings ouverts §7 (SEC-4 `WITH CHECK` `entreprise_active_id`, SEC-5 rate limit PDF de partage, SEC-6 secret d'import de paie) | **aucune branche** | — | — | — | — | — | **non intégré** : `DECISION_REQUIRED:V9-SECURITY-V2-RESIDUELS` |
| Onboarding « Se déconnecter / Retour à l'accueil » | **aucune branche, aucun commit** (recherche par message, par diff `Se déconnecter` / `Retour à l'accueil` et par chemin `src/app/onboarding`) | — | — | — | — | — | **non intégré** : `DECISION_REQUIRED:V9-ONBOARDING-INTROUVABLE` (§12) |

### 1.2 Autres branches post-V8 inventoriées

| Branche @ tip | Base | Objet | Qualification | Décision V9 |
|---|---|---|---|---|
| `claude/beautiful-tesla-grj0pu` @ `9ac7fbfc` (contient `claude/blissful-thompson-ipjcxl` @ `14fe2a3d`, base Lot 9) | V8 | Relevé & Métré Lots 10 (estimation simplifiée) + 11 (handoff Tools → GP), migrations `20260930001401`, `…001501` | RELEVE METRE LOT 11 LOCALLY QUALIFIED | **non intégré** : lots **fonctionnels**, pas des correctifs ; candidats V10 (`DECISION_REQUIRED:V9-RELEVE-LOT10-11`). Leurs numéros restent postérieurs à toute migration V9 : aucune collision future |
| `claude/kind-mayer-w4wfy6` @ `040ca1e2` | **V6** `9102ec80` | Export RGPD / portabilité V1 (46 fichiers, migration `20260929000101`, export Studio inter-projets) | ELSATIA DATA EXPORT LOCALLY QUALIFIED | **non intégré** : fonctionnalité, base V6, à re-porter sur V8/V9 (règles Employés V8, Studio dédié) — `DECISION_REQUIRED:V9-RGPD-DATA-EXPORT` |
| `claude/modest-shannon-uhp2ic` @ `27f42417` | V8 | Pack opérateur Preview V8 (gardes d'écriture distante, sauvegarde, ledger, pilote) | ELSATIA V8 PREVIEW PACK READY | **non intégré** : outillage **Preview**, hors mission ; ses attendus visent V8 (371) — à rebaser sur V9 par une mission Preview |
| `claude/blissful-volta-eee359` @ `53c3f880` | V8 | Gate de commercialisation GP (rapport) | GATE NOT YET PASSED | non intégré (rapport sur V8) ; ses blockers B1-B4, IBAN, CHA-2, PLA-2, REN-2, FAC-2 sont fermés par V9 en local |
| `claude/adoring-planck-2us9x5` @ `35ff4910` | `main` | Preview hébergée V8 (rapport) | BLOCKED | non intégré (rapport de déploiement) |
| `claude/cool-gauss-wjvmd8` @ `64ddf593`, `claude/vigilant-fermi-tvd8jb` @ `73312fa4`, `claude/studio-preview-live-deploy-v2` @ `42a17059`, `claude/vibrant-allen-hkovku` @ `d83dbbd1`, `claude/charming-allen-k61cec` @ `561793c0` | V7 | Kit de déploiement Studio Preview | BLOCKED / PARTIALLY READY | **refusé** : `6b897275` **modifie 3 migrations historiques** du projet Studio dédié (`…0928 100000`, `…110000`, `…0929 160000`) — interdit ; outillage Preview hors mission (`DECISION_REQUIRED:V9-STUDIO-PREVIEW`) |
| `claude/gifted-cori-vv7scp`, `claude/wizardly-keller-3gz8nv`, `claude/zen-davinci-xn6m3m` | V5 / V6 | gate et packs Preview antérieurs | — | non intégrés (outillage / rapports, superseded) |
| `claude/brave-carson-cj8ofz` @ `48064a60` | V5 | Performance C1-C4 | — | déjà traité par V8 (C2-C4 portés, C1 refusé) ; `DECISION_REQUIRED:V8-PERF-C1` reste ouvert |

### 1.3 Collisions et chevauchements

| Type | Constat | Résolution |
|---|---|---|
| Collision de numéro | `20260930000101` : `pointages_gestion_totaux_mois_v1` (busy-ramanujan) **et** `rate_limit_consultation_connexion_v1` (gracious-curie) | la migration rate limit devient **`20260930000901`** (dernier lot intégré) |
| Doublons d'identité | `…0928 000813-816` présents dans confident-brown **et** optimistic-hopper ; `…0930 001401` dans blissful-thompson **et** beautiful-tesla | mêmes fichiers (la convergence contient le lot) ; Lots 10-11 non intégrés |
| Chevauchement fonctionnel | `/pointage/gestion` : Finance (mois entier jsonb) × Data Correctness (totaux en base + pagination) × Capacité (actions sans liaison, pagination en mémoire) | §3.3 |
| Chevauchement fonctionnel | `/dashboard` : Résiduel (alertes servies en base, bornées + compteurs) × Capacité (centre d'alertes paginé, lectures sans borne) | §3.2 |
| Chevauchement fonctionnel | `/planning` : Finance (RPC `planning_semaine`) × Capacité (rendu `PlanningSemaineVues`, action unique) | §3.1 |
| Chevauchement fonctionnel | Mémoire (V7) × Capacité (V8) : même correctif Intl | Capacité retenue (port déjà fait sur V8) |
| Chevauchement sécurité | Red team V1 RT-01..05 × Security V2 F2/F3/F6 (V8) | §4 |

## 2. Ordre de convergence et commits

Ordre : **Data Correctness (convergence V8) → Capacité → IBAN → rate limit (port) → RT-01**. Les trois premiers partent de
V8 ; la convergence Data Correctness contient déjà les lots Finance, Rentabilité et Pointages/Facture (fusionnés et
requalifiés sur V8 par elle), donc elle passe en premier. La capacité vient ensuite parce qu'elle modifie les mêmes
écrans (§3). Les lots V7 sont **portés**, pas fusionnés.

| Commit | Objet |
|---|---|
| `dde29f2e` | merge `--no-ff` `claude/optimistic-hopper-0ytout` @ `f77966f` (sans conflit) |
| `e868381d` | merge `claude/beautiful-albattani-gbd2h7` @ `89820bd` : 3 conflits résolus sémantiquement (§3), synthèses d'alertes, spec capacité alignée |
| `dea1ce21` | merge `claude/dazzling-turing-2q77nn` @ `2b7e367` : conflits limités aux attendus générés, régénérés |
| `8e1cb86b` | manifeste d'environnement : 11 variables héritées des lots (§5.3) |
| `2c586416` | port de `claude/gracious-curie-135pix` @ `2385345` (migration renumérotée) |
| `63efb6c4` | RT-01 résiduel (red team V1) |
| `00b6393f`, `ffbd35b0` | harnais d'upgrade V8 → V9, ledger, lint, registre des seeds (§5.3, §6) |
| (ce rapport) | |

Aucun correctif applicatif n'est caché dans un commit de merge en dehors des résolutions de conflit décrites §3.

## 3. Conflits sémantiques entre lots

Chaque lot était qualifié **seul** sur V8. Fusionnés, ils se contredisaient sur trois écrans. Règle appliquée : l'**exactitude
des données** (aucune valeur fausse ou tronquée) prime ; la **capacité** (poids HTML, actions liées, mémoire) est conservée
partout où elle ne la compromet pas.

### 3.1 `/planning`
- Data Correctness : affectations et pointages de la semaine par la RPC `planning_semaine` (complets), listes de choix par
  `gp_options_*`.
- Capacité : rendu `PlanningSemaineVues`, lots transmis une fois, action unique.
- **Résolution** : données de Data Correctness, index et rendu de Capacité. Les deux formes de clé de lot sont
  équivalentes (`JSON.stringify` rend `undefined` comme `null`).
- **Preuves** : Playwright finance « planning : heures planifiées (1 462 affectations) » ✅ ; capacité « planning :
  action unique, lots » et vue mobile ✅ ; pilote (chef de chantier) ✅.

### 3.2 `/dashboard` (centre d'alertes)
- Capacité lisait articles, véhicules, outils et commandes **sans borne** (`order("id")`), donc tronqués à 1 000
  lignes : c'est exactement le défaut F12 corrigé par le lot résiduel.
- Résiduel : `gp_alertes_stock` et `gp_alertes_parc`, filtrés et **comptés en base**, bornés à l'affichage, avec une
  alerte de synthèse « N autres ».
- **Résolution** :
  - `lib/alertes-operationnelles` lit désormais les sources servies en base (`lireSourceStock`, `lireSourceParc`,
    commandes datées et bornées) ;
  - `construireAlertes` produit les synthèses exactes (`stockSynthese`, `parcSynthese`) ;
  - la page **et** l'action de pagination appellent les mêmes lectures, ce qui rend l'ordre total stable d'une page à
    l'autre.
- **Preuves** :
  - Vitest « synthèses exactes servies en base » (nouveau) ;
  - Playwright capacité « résumé exact, première page, Afficher plus, ignorer puis rétablir » ✅ ;
  - capacité « poids borné » ✅ ;
  - résiduel « tableau de bord exact (20 000) » ✅.

### 3.3 `/pointage/gestion`
- Capacité lisait encore le **mois entier** (troncature B2) et paginait en mémoire.
- Data Correctness : totaux et compteurs en base, listes paginées en base.
- Capacité retirait les **actions liées** (`.bind`, 3 000 par page) et partageait les formateurs `Intl`, que la version Data
  Correctness rappelait encore à chaque appel.
- **Résolution** : structure de données de Data Correctness, avec `validerPointageFormAction` /
  `supprimerPointageFormAction` + champs cachés (`ChampsPointage`) et formateurs `Intl` au niveau du module.
- La spec Playwright capacité est alignée sur la pagination servie en base (pages de 50, `page_anciennes`).
  L'**assertion de fond est conservée** : aucune action liée `$ACTION_REF_` dans la page, validation par l'action unique.
- **Preuves** :
  - pointages 1 462 (totaux = base) ✅ ;
  - finance « pointage d'équipe (5 000) » ✅ ;
  - capacité « action unique, anciennes saisies paginées » ✅ ;
  - garde Vitest `formateurs-intl` : 0 emplacement « par appel ».

### 3.4 Interactions vérifiées sans conflit

| Interaction | Vérification |
|---|---|
| Mode sûr (V8 `…0807`) × tables nouvelles V9 | seules 2 tables nouvelles (registre des clés) ; la migration IBAN rappelle `incident_installer_gardes()` (règle V8 §4.1) ; contrôle I01 : 0 table non exemptée sans garde après upgrade |
| Mode sûr × rate limit | `rate_limits_applicatifs` est **exemptée** des gardes (infrastructure) : la lecture `consulter_rate_limit` et l'enregistrement d'échec restent possibles en lecture seule |
| Mode sûr × rotation des clés | la lecture seule bloque aussi la rotation : voulu (lot IBAN R7), contournement opérateur tracé existant |
| Billing B-4 / Per-App (V8) × agrégats V9 | `gp_exiger_membre` s'appuie sur `est_membre_actif` **V8** (accès GP par application, essai échu fermé) ; parité RLS prouvée par pgTAP (303 / 237 / 60 / 43) sur le train V9 |
| C2 (V8 `…0812`) × B4 | `modifier_facture_brouillon` ne rouvre pas `recalc_totaux_facture` ; recalcul par le trigger de lignes (contrôles D01-D07) |
| Employés (V8) × `gp_options_employes` | ne rend que prénom, nom, poste et statut : jamais les colonnes protégées par `employes_fiche` (pgTAP résiduel) ; recette Employés 15/15 |

## 4. Sécurité : résiduels red team V1 et Security V2

`claude/ecstatic-fermat-bcqats` (red team V1, base `main` pré-V3) n'avait jamais été intégrée. Chaque finding a été
re-vérifié **sur V8** avant tout portage (sa migration `…0184` réécrirait des policies que V8 a renforcées depuis, avec
`est_membre_actif_reel` : elle n'est **pas** portée telle quelle) :

| Finding | État en V8 | Décision V9 |
|---|---|---|
| RT-01 redirection ouverte `/\evil.com` | callbacks d'auth déjà protégés par `destinationInterneSure` (F2/F3/F6) ; **encore ouverte** sur `retourAutorise` (`/paiements-bancaires`) et sur l'import de pièces de paie (`/api/paie/documents/upload`) | **porté** : les deux points d'entrée passent par `destinationInterneSure`. Témoin RED (contrôles V8 recopiés : la destination sort de l'origine) puis GREEN (`redirections-residuelles-rt01.test.ts`, 3 tests) |
| RT-02 clause « tenant vide » | **écriture** déjà refusée par les policies RESTRICTIVE `role_gestion_*` (`a_permission`) sur `postes`, `permissions_poste` et `utilisateurs_entreprises` | non porté. Reste un résiduel de **lecture** des postes d'un tenant sans membre (faible) : `DECISION_REQUIRED:V9-RT02-LECTURE` |
| RT-03 origine des liens e-mail | aucune dérivation d'origine par en-tête dans `actions/auth.ts` V8 | sans objet |
| RT-04 `search_path` de `entreprise_sans_membres` | épinglé (`{search_path=public}`) | déjà corrigé |
| RT-05 RLS de `compteurs_reference` | activée | déjà corrigé |

Security V2 §7 (rapport V8 §9), toujours ouverts **sans branche qualifiée** :
- SEC-4 : `entreprise_active_id` sans `WITH CHECK` ;
- SEC-5 : rate limit de la route PDF de partage ;
- SEC-6 : secret global de l'import paie.

Aucun correctif n'est écrit ici : `DECISION_REQUIRED:V9-SECURITY-V2-RESIDUELS`.

## 5. Migrations et ledger

### 5.1 Migrations V9 (13, toutes postérieures à `20260928000812`)

| # | Migration | Lot | Numéro d'origine | Contenu |
|---|---|---|---|---|
| 372 | `20260928000813_finance_exports_agregats_exactitude_v1` | Finance | inchangé | exports comptables / TVA, trésorerie, totaux dépenses en base |
| 373 | `20260928000814_pointage_planning_lecture_complete_v1` | Finance | inchangé | `pointages_equipe_periode`, `planning_semaine` |
| 374 | `20260928000815_fiche_chantier_lecture_complete_v1` | Finance | inchangé | `chantier_donnees_chiffrees` |
| 375 | `20260928000816_journal_ia_consommation_exacte_v1` | Finance | inchangé | quota IA sommé en base (SECURITY INVOKER) |
| 376 | `20260930000101_pointages_gestion_totaux_mois_v1` | Pointages | inchangé | totaux, compteurs, anciennes saisies (B2) |
| 377 | `20260930000102_modifier_facture_brouillon_sans_recalc_direct_v1` | Facture | inchangé | B4 sans rouvrir `recalc_totaux_facture` |
| 378 | `20260930000301_rentabilite_agregats_chantiers_v1` | Rentabilité | inchangé | agrégats rentabilité, heures chantier |
| 379-382 | `20260930000401…404_*` | Résiduel | inchangés | fiches, pilotage, plateforme, sélecteurs, index de curseur, statistiques étendues |
| 383 | `20260930000813_banking_encryption_key_rotation_v1` | IBAN | inchangé | registre des clés, journal append-only, garde d'écriture, index aveugle versionné, RPC opérateur |
| 384 | **`20260930000901_rate_limit_consultation_connexion_v1`** | Rate limit | **`20260930000101`** | `consulter_rate_limit` (lecture sans consommer), service_role seul |

`DECISION_REQUIRED:V9-MIGRATION-RENUMBERING` (décidé, conservateur) :
- on conserve les numéros des lots, **uniques et déjà strictement postérieurs à V8**. Ils ont été requalifiés sur V8
  par leurs lots et par la convergence Data Correctness, aucune base ne les a reçus (Preview V8 jamais déployée), et
  leurs preuves gardent ainsi leurs références ;
- seule la **collision** est renumérotée, avec un en-tête « numéro d'origine », corps inchangé ;
- les rapports de lot gardent leurs numéros d'origine ;
- la numérotation n'est pas contiguë (`…0928 0813-816` puis `…0930`), mais elle est strictement monotone.

### 5.2 Ledger (`scripts/qualification/v9/ledger-check.sh`) : 9/9

| Contrôle | Résultat |
|---|---|
| Migrations V8 modifiées / renommées / supprimées (partagé + Studio dédié) | **0** (13 ajouts) |
| Préfixe : 371 premières versions V9 = versions V8, même ordre | ✅ |
| Doublons | 0 (384 uniques) |
| Ordre lexical = ordre d'application | ✅ |
| Versions V9 ≤ dernière V8 | 0 |
| Ledger Supabase simulé (base au train V8) : versions en attente | **13** = les versions V9, toutes > max(ledger) : `db push` sans `--include-all` |
| Trou (version du ledger absente des fichiers) | 0 |
| Ledger après push | 384 = fichiers |

### 5.3 Défauts hérités des lots, corrigés par la convergence

Ces défauts n'apparaissaient pas lot par lot (portes non rejouées) :

| Défaut | Correctif V9 |
|---|---|
| `verify:env-manifest` : **11 ERREURS** `ENV-UNKNOWN`, à cause des variables lues par la capacité (file PDF, banc mémoire) et par le banc Finance | variables déclarées (`PDF_CONCURRENCE`, `PDF_FILE_MAX`, `PDF_ATTENTE_MAX_MS`, `PDF_DUREE_MAX_MS`, `PDF_DELAI_FERMETURE_MS` pour Gestion Pro, défauts du code ; `PDF_CHROMIUM_EXECUTABLE`, `ANCIEN_MONTAGE`, `MEM_SAMPLER_DIR` et `FINANCE_BENCH_*` en outillage local) ; inventaire Preview régénéré ; 66 avertissements = V8 |
| lint racine : 4 erreurs `no-require-imports` dans `scripts/perf/memory/sampler.cjs` (CommonJS préchargé par `node -r`) | désactivation locale justifiée ; 0 erreur |
| `test:seeds` : 4 jeux de charge des lots non classés | `perf-memory-affectations` classé avec harnais (1 exécution, non idempotent : suppression puis recréation → historique et notifications) et **qualifié** ; `perf-pointages-mois`, `perf-rentabilite`, `perf-rentabilite-purge` produisent volontairement des anomalies synthétiques (documents engagés sans ligne, codes d'identification orphelins après rechargement) que les contrôles qualité du harnais refusent (constaté : `verify:seeds` 16/20 au 1er passage) : ils sont classés `CI_ONLY` **hors harnais**, couverture `banc-integration` (nouvelle, = tests d'intégration PostgREST réels qui les exécutent, §9.1) ; exemption « document engagé sans ligne » étendue au jeu rentabilité, bornée par une assertion |
| `PDF_CHROMIUM_EXECUTABLE` (GP) ≠ `PDF_CHROMIUM_EXECUTABLE_PATH` (Réserves) | déclaré tel quel en outillage local ; `DECISION_REQUIRED:V9-PDF-CHROMIUM-NOM` |

## 6. Fresh install et upgrade V8 → V9

**Base neuve** : `rebuild_db.sh v9_fresh` → **384/384**, 0 erreur (≈ 27 s).

**Upgrade** : nouveau harnais `scripts/qualification/upgrade-v8-v9.sh`, dérivé de `upgrade-v7-v8.sh`. Il fonctionne
en **deux passes**.

La sonde RLS réelle (chaque utilisateur × chaque table sous `authenticated`) est **infaisable** sur des tables de 20 000+
lignes : les policies y sont évaluées ligne à ligne, et une seule cellule a pris plus de 3 minutes. La sonde complète est
donc faite sur le jeu historique, et la volumétrie est contrôlée sans sonde.

1. **Base V7 historisée.**
   - Migrations V3 (340), jeu V3, puis compléments de chaque ère V4 → V7 lus aux refs historiques ;
   - ensuite le complément V7 → V8 et les 12 migrations V8 : base au train V8 (**371**) avec les données de l'ère V8 ;
   - la passe volumétrique ajoute : jeux Finance (F500 → F20000), GP résiduel (R500 → R20000) et
     `upgrade_v8_v9_seed_complement.sql` (factures **brouillon** de l'ère V8, IBAN chiffrés au **format v1** sans
     identifiant de clé, chiffré de démonstration illisible, compteurs de l'**ancienne** politique `auth:login`).
2. Instantané, puis **13 migrations V9** (0 erreur), puis instantané.
3. Comparaison, puis classement **sans tolérance** (`upgrade_v8_v9_classify.py`) : tout écart de lignes, d'empreinte, de
   RLS, de policy, de droit de table ou d'EXECUTE est une perte ou un changement de droit **silencieux** (échec), sauf
   les règles fermées :
   - R-V9-REGISTRE-CLES ;
   - R-V9-B4 ;
   - R-V9-RPC.
4. Schéma + ACL comparés au fresh V9.
5. Contrôles métier.

| Contrôle | Passe historique (`UPG_PASSE=historique`) | Passe volumétrique |
|---|---|---|
| Migrations V8 puis V9 | 12 puis 13, 0 erreur | idem |
| Row counts (280 tables d'avant) | **0 écart** | **0 écart** |
| Tables nouvelles | `cles_chiffrement_bancaire` (1 ligne : `k1` **active**), `journal_cles_chiffrement_bancaire` (0), toutes deux RLS, aucun droit d'API | idem |
| Empreintes (117 tables, colonnes d'avant) | **117/117** | **117/117** (tenants de 20 000 lignes compris) |
| RLS (drapeaux) | 0 table modifiée | 0 |
| Policies | 658 → 658 : **0 supprimée, 0 modifiée, 0 ajoutée** | idem |
| Sonde RLS réelle | **51 utilisateurs × 49 tables = 2 499 cellules, 0 écart** | sans sonde (voir plus haut) |
| Droits de table (anon / authenticated / service_role) | 486 → 486 | 486 → 486 |
| EXECUTE des fonctions existantes | **0 modifié, 0 supprimé** (`modifier_facture_brouillon` garde exactement ses droits V8) | idem |
| Fonctions nouvelles | 62 : 44 `authenticated` (43 DEFINER + `journal_ia_consommation` INVOKER), 12 `service_role` seul (`consulter_rate_limit`, RPC opérateur IBAN), 6 internes ; **0 `anon`** ; toutes à `search_path` figé et définies par une migration V9 | idem |
| Schéma + ACL vs fresh V9 | **identiques** (35 940 lignes, 2 296 ACL) | **identiques** |
| Contrôles métier | **47/47** : les contrôles V8 (Billing, Per-App, Security V2, Employés, mode sûr, Relevé, C2, identité) **rejoués sur la base V9** | **30/30** : contrôles V9 (ci-dessous) |
| Classement | ✅ aucun écart silencieux | ✅ aucun écart silencieux |

**Contrôles métier V9 30/30** (`upgrade_v8_v9_business_checks.sql`, transaction annulée) :

| Série | Ce qui est vérifié sur les données de l'ère V8 |
|---|---|
| I01-I02, S01-S02 | mode sûr : toute table non exemptée gardée (V9 comprises) ; 0 RPC V9 exécutable par anon ; B4 corrigé **sans** rouvrir `recalc_totaux_facture` |
| D01-D07 | facture brouillon de l'ère V8 modifiable (totaux 300 / 360 recalculés par trigger), brouillon vidé → 0, facture émise toujours verrouillée, ouvrier : brouillon invisible (RLS), `recalc_totaux_facture` toujours refusé |
| P01-P04, R01, F01, G01-G02 | exactitude au-delà de 1 000 lignes : totaux pointages et nombre (1 462) = vérité, heures rentabilité = vérité, export des ventes complet (1 462 > max_rows), fiche client = vérité (1 462 factures), tenant étranger refusé, ouvrier : **parité RLS** (rien de plus) |
| B01-B07 | IBAN : registre et inventaire refusés à authenticated, `k1` active, IBAN v1 sous `k1`, démo comptée illisible, **aucune donnée réécrite**, ligne v1 existante toujours modifiable, écriture sous clé inconnue refusée |
| L01-L04 | rate limit : `consulter_rate_limit` lit un compteur historique (7/10 → reste 3) **sans l'incrémenter**, service_role seul, compteurs conservés |

**Contre-épreuve** (base V8 + mêmes données) :
- `modifier_facture_brouillon` → `permission denied for function recalc_totaux_facture` : le **B4 est rouge en V8** ;
- les RPC V9 sont absentes ;
- DB verify : NO-GO sur le seul contrôle 38.

**DB verify** (`db-verify.mjs --local-harness --before-owner`) :

| Base | Résultat |
|---|---|
| fresh V9 | **GO**. 38 contrôles (36 OK, 2 non bloquants avant l'étape propriétaire, comme V8 : `url_preview`, propriétaire plateforme) ; 39/39 RPC service-role only ; préflight 21 / 0 bloquant |
| fresh V8 (contre-épreuve) | NO-GO sur le **seul** contrôle 38 (registre des clés absent) |
| bases upgradées | seul écart : bucket `logos` public, déjà présent dans le jeu historique **avant** upgrade (fixture V3). C'est le même constat que V8 §7, sans lien avec V9 |

## 7. pgTAP

`scripts/qualification/pgtap-run-v3.sh` : une base neuve par fichier. **V8 a été rejoué dans les mêmes conditions** pour
comparer fichier par fichier.

| | V8 (rejoué) | V9 |
|---|---|---|
| Fichiers | 163 | **170** |
| Propres | 154 | **161** |
| `ok` | 8 059 | **8 819** |
| Non propres | 9 : limites de banc connues (Studio ×7 sur le projet partagé, `platform_stripe_state_attestation_r72` sans pgsodium réel, `elsatia_tools_cloud_sync_entitlement_closure_v1`) | **les mêmes 9** |

Les 163 fichiers communs donnent les **mêmes** `ok` et le **même** statut, fichier par fichier : **0 régression**.
Suites nouvelles, toutes propres :

| Suite | Résultat |
|---|---|
| `gp_residuel_agregats_v1` | 303/303 |
| `finance_agregats_exactitude_v1` | 237/237 |
| `banking_encryption_key_rotation_v1` | 75/75 |
| `gp_rentabilite_agregats_v1` | 60/60 |
| `gp_pointages_totaux_mois_v1` | 43/43 |
| `gp_facture_brouillon_modification_v1` | 34/34 |
| `rate_limit_consultation_connexion` | **8/8** (premier passage : le lot l'avait écrit sans l'exécuter) |

## 8. Applications

| App | typecheck | lint | Vitest | build |
|---|---|---|---|---|
| Gestion Pro (+ packages) | ✅ | ✅ 0 erreur, 15 avertissements (= V8) | ✅ **2 777** réussis, 189 ignorés (36 `elsatia-identity` ignorés comme en V8 + **153 tests de banc des lots, tous exécutés à part**, §9.1) | ✅ |
| Tools | ✅ | ✅ | ✅ 2 150 | ✅ (`NEXT_PUBLIC_TOOLS_ENV=local`) |
| Réserves | ✅ | ✅ | ✅ 226 | ✅ (`ELSATIA_APPLICATION_ENV=local`) |
| Colors | ✅ | ✅ | ✅ 431 | ✅ |
| Studio | ✅ | ✅ | ✅ 343 | ✅ |

V9 ne modifie **aucun fichier** de `apps/`, `packages/` ou `workers/` (`git diff --stat 53b4bc7 -- apps packages workers` :
vide). Tools, Réserves, Colors et Studio sont rejoués en non-régression ; le worker `studio-video` n'est pas rejoué (non
impacté).

## 9. Tests de non-régression ciblés et Playwright

### 9.1 Bancs PostgREST réel (`db-max-rows = 1000`, jamais relevé)

| Banc | Résultat |
|---|---|
| Finance : 8 suites `*.postgrest.test.ts` (exports, trésorerie, dépenses, stock, notes de frais, pointages / planning, fiche chantier, quota IA) | **89/89** |
| GP résiduel : `gp-residuel.postgrest.test.ts` (RED rejoué puis GREEN, 500 / 1 000 / 1 462 / 5 000 / 20 000) | **50/50** |
| Pointages : `pointages-gestion.integration.test.ts` (5 volumes, historique faux puis corrigé exact) | **5/5** |
| Rentabilité : `rentabilite.integration.test.ts` (500 / 1 462 / 5 000, une base et un PostgREST par volume) | **4/4** |
| File PDF avec Chromium réel (`PDF_CHROMIUM_TESTS=1`) | **24/24** |

### 9.2 Playwright (Chromium 1194, GP `next build` + `next start`)

| Recette | Pile | Résultat |
|---|---|---|
| Finance (exports, TVA, trésorerie, stock, **pointage d'équipe**, **planning**) | `finance-pile-locale` (PostgREST réel, passerelle) | **11/11** |
| GP résiduel (fiches, chantier / DOE, paie, notes de frais, CRM, **tableau de bord**, profil ouvrier ; 5 000 et 20 000) | `gp-residuel-pile-locale` | **12/12** |
| Pointages > 1 000 + facture brouillon (création, modification, émise verrouillée, autre tenant) | pile pilote (GoTrue v2.196, PostgREST, proxy) | **4/4** |
| Rentabilité (5 000 pointages, fiche chantier, autre tenant) | pile pilote | **5/5** |
| Capacité pages lourdes / PDF (`E2E_CAPACITE=1` : centre d'alertes, poids, planning, vue mobile, `/pointage/gestion`, PDF) | pile pilote + fixture de capacité | **6/6** |
| Pilote v2 + v3 (connexion des 5 profils, chantiers, devis, factures, planning, pointage, paramètres, onboarding, DOE, paie, exports) | pile pilote | **32/32** |
| Employés (données personnelles, PostgREST réel) | `employes-pile-locale` | **15/15** |

Toutes ces recettes se connectent par le **nouveau** limiteur (B1).

### 9.3 Passes invalides, non comptées

| Passe | Cause | Traitement |
|---|---|---|
| Upgrade, 1ʳᵉ tentative | sonde RLS sur 20 000 lignes (> 3 min par cellule) | interrompue, harnais restructuré en deux passes (§6) |
| Classement, 1ʳᵉ lecture | défaut **du classeur** (booléen concaténé `true` lu comme `t`) | classeur corrigé, classement rejoué sur les mêmes instantanés |
| Pilote v2, 1ʳᵉ passe | 2 échecs : la recette rentabilité avait chargé 512 devis dans la même base | pile reconstruite → 32/32 |
| Pointages, 1ʳᵉ passe | PostgREST d'un run précédent encore servi (§9.4) | pile nettoyée → 4/4 |
| `verify:seeds`, 1ʳᵉ passe | 16/20 : les 4 jeux de charge nouvellement classés (§5.3) | classement corrigé → 17/17 |
| Drill d'incident, 1ʳᵉ passe | 88/91 : S12 seul, dépendances du worker `studio-video` (`ioredis`, `bullmq`) non installées dans le banc | `npm ci --prefix workers/studio-video` (comme le Reproduire V8) → 91/91 |
| Capacité, 1ʳᵉ passe | comptes de la fixture créés en SQL, inconnus de GoTrue (`instance_id`, `identities`, horodatages) | geste de banc documenté (mot de passe GoTrue) → 6/6 |

### 9.4 Recette pilote backend (`pilot_acceptance_v3.sh`)

Telle quelle, la recette échoue de façon identique sur V8 et V9 : 14 scénarios auth en échec, `a_permission` faux pour le
gérant. Les listes d'échecs sont identiques au caractère près.

Cause : la fixture pilote est en **essai échu par construction**, fermée en base depuis Billing B-4.

`DECISION_REQUIRED:V8-PILOTE-ESSAI-ECHU` est hérité. Pour exercer la recette, on avance avant les scénarios le geste de
fixture que le script applique lui-même à son étape 4 (abonnement actif). Ce geste reste dans une copie locale ; le
dépôt n'est pas modifié.

| | V8 | V9 |
|---|---|---|
| Scénarios auth / RLS (GoTrue réel, sessions expirées, bannies, révoquées, rôle changé, tenant suspendu) | tous verts | **tous verts** |
| 71 cas | 69 PASS / 1 FAIL (PE-04) / 1 MANUAL | **69 / 1 (PE-04, identique) / 1** |

Défaut de harnais préexistant, non corrigé dans le dépôt : `pkill -9 -f "$POSTGREST_DIR/postgrest"` ne tue pas un
PostgREST lancé en `./postgrest`. Un PostgREST d'un run précédent peut donc rester servi. Les comparaisons ci-dessus ont
été refaites après nettoyage par port, V8 puis V9.

### 9.5 Non rejoués (et pourquoi)

Les recettes suivantes ne sont pas rejouées : Relevé 2 → 9 + Atelier (107), Réserves (59), D-01, GP ↔ Réserves, Billing /
réabonnement / Per-App (17), Colors (75), Studio dédié E2E (21), concurrence Billing / Stripe / Per-App. Raisons :
- V9 ne touche **aucun** fichier de ces applications ni de leurs chemins (`stripe*`, `abonnement*`, accès par
  application, proxy, Réserves, Tools, Colors, Studio) ;
- les garanties en base sont re-prouvées : pgTAP identique fichier par fichier (Billing 190, Per-App 2 925, mode sûr
  131, Relevé…), contrôles métier V8 **47/47 sur la base V9** et sonde RLS 0 écart ;
- la connexion GP, seul chemin transverse modifié, est exercée par toutes les recettes du §9.2.

Le drill d'incident complet et `verify:seeds` sont rejoués (§9.6).

### 9.6 Portes du train

| Porte | Résultat |
|---|---|
| `verify:migrations` | ✅ 384 · Studio dédié 23 (9 copies gelées + 14 dédiées) |
| `verify:train-expectations` | ✅ (384 / `20260930000901` / 38 contrôles) |
| `test:migration-targets` · `test:preflight-preview` | ✅ 7/7 · 5/5 |
| `verify:secrets` · `verify:stripe-prices` | ✅ |
| `verify:env-manifest` · `test:env-manifest` | ✅ (14 DECISION_REQUIRED, inchangé) · 67/67 |
| `test:smoke-email` · `test:dr-guard` · `test:incident-drill` | ✅ 13/13 · 10/10 · 6/6 |
| `test:seeds` · `test:preview-pack` · `test:bank-keys` | ✅ 48/48 · 31/31 · ✅ |
| `verify:seeds` (exécution réelle sur base fraîche 384, seul sur le cluster) | ✅ **`ALL ACTIVE SEEDS QUALIFIED — 17/17 seeds qualifiés sur 384 migrations`** (V8 : 16/16 ; + `perf-memory-affectations`) |
| `npm run incident:drill` (pile jetable, GoTrue v2.192, PostgREST, Redis, faux Stripe / Brevo) | ✅ **91/91** (15 scénarios S0-S14, connexion GP par le nouveau limiteur comprise) |

## 10. Changements intégrés (liste exacte)

**Base de données** : les 13 migrations du §5.1. Elles ajoutent :
- 62 fonctions ;
- 2 tables (registre des clés bancaires, RLS, aucun droit d'API) ;
- 1 colonne (`coordonnees_bancaires.iban_hash_cle`) ;
- 2 triggers de garde ;
- des index de curseur et des statistiques étendues.

Elles ne modifient **aucune policy**, aucune fonction d'aide RLS et aucune donnée existante.

**Gestion Pro** (environ 45 écrans, `src/lib/fiches-agregats.ts`, `pilotage-agregats.ts`, `pointages-gestion.ts`,
`rentabilite.ts`, `alertes-operationnelles.ts`) :
- totaux, comptes et KPI calculés en base ;
- listes par curseur ;
- listes de choix complètes ;
- exports comptables et de paie servis en base ;
- `/pointage/gestion`, `/planning` et `/dashboard` fusionnés (§3) ;
- formateurs `Intl` partagés ;
- file PDF bornée (concurrence, délais, arrêt forcé, sans orphelin) ;
- diagnostic mémoire au démarrage ;
- édition de facture brouillon ;
- limiteur de connexion par échecs ;
- chiffrement bancaire versionné (`banking-keyring`, `banking-rotation`, nettoyage Sentry) ;
- outil opérateur `npm run bank-keys` ;
- RT-01.

**Outillage et preuves** :
- harnais d'upgrade V8 → V9 (deux passes) et ledger ;
- bancs des lots (finance, résiduel, perf, capacité, mémoire) ;
- registre des seeds ;
- manifeste d'environnement ;
- attendus du train (384 / 38 / 39).

Les rapports de lot sont conservés tels quels :
- `ELSATIA_FINANCE_AGGREGATES_DATA_CORRECTNESS_V1` ;
- `ELSATIA_RENTABILITE_DATA_CORRECTNESS_V1` ;
- `ELSATIA_GP_POINTAGES_FACTURE_FIX_V1` ;
- `ELSATIA_GP_RESIDUAL_DATA_CORRECTNESS_V1` ;
- `ELSATIA_GP_HEAVY_PAGES_PDF_CAPACITY_V1` ;
- `ELSATIA_BANKING_ENCRYPTION_KEY_ROTATION_V1` ;
- `ELSATIA_LOGIN_RATE_LIMIT_AGENCY_V1`.

Les rapports historiques V3 → V8 ne sont pas réécrits.

## 11. Régressions

**Aucune régression constatée** :
- pgTAP identique à V8 sur les 163 fichiers communs ;
- 0 écart d'upgrade ;
- Vitest des 5 applications verts ;
- recettes pilote V8 = V9 ;
- 85/85 Playwright.

La convergence a révélé **3 conflits sémantiques** (§3) et **4 défauts hérités des lots** (§5.3). Tous sont corrigés et
prouvés. Deux élargissements d'outillage, documentés et bornés : l'exemption du jeu de charge rentabilité au test
« document engagé sans ligne », et la couverture `banc-integration` pour 3 jeux de charge qui ne sont pas des seeds de
recette. Ils portent sur l'hygiène du registre des seeds, jamais sur une règle du produit.

## 12. Risques et DECISION_REQUIRED

| ID | Nature | État | Effet / action |
|---|---|---|---|
| `DECISION_REQUIRED:V9-MIGRATION-RENUMBERING` | technique | **décidé (conservateur)** | §5.1 : numéros des lots conservés, seule la collision renumérotée (`…0101` → `…0901`) |
| `DECISION_REQUIRED:V9-INTEGRATION-BRANCH` | propriétaire | **ouvert** | `integration/elsatia-canonical-train-v9` existe dans le worktree local ; la session ne pousse que `claude/compassionate-ptolemy-vu8vbx` (**même commit**). Publier `integration/elsatia-canonical-train-v9` à ce commit |
| `DECISION_REQUIRED:V9-ONBOARDING-INTROUVABLE` | produit | **ouvert** | aucune branche ni commit « Se déconnecter / Retour à l'accueil » pour l'onboarding. Constat : `src/app/onboarding/{page,besoins,demarrage}` n'offrent ni déconnexion ni retour, contrairement à `/en-attente` et `/abonnement-suspendu`. Une mission dédiée doit écrire et qualifier le correctif ; il n'est pas développé dans un train de convergence |
| `DECISION_REQUIRED:V9-SECURITY-V2-RESIDUELS` | sécurité | **ouvert** | SEC-4, SEC-5, SEC-6 sans correctif qualifié (§4) |
| `DECISION_REQUIRED:V9-RT02-LECTURE` | sécurité (faible) | **ouvert** | lecture des postes / permissions d'un tenant **sans membre** encore permise ; écriture fermée (§4) |
| `DECISION_REQUIRED:V9-RELEVE-LOT10-11` | produit | **ouvert** | lots fonctionnels qualifiés, candidats V10 (§1.2) |
| `DECISION_REQUIRED:V9-RGPD-DATA-EXPORT` | produit / RGPD | **ouvert** | lot V6 qualifié, à re-porter sur V9 (§1.2) |
| `DECISION_REQUIRED:V9-STUDIO-PREVIEW` | technique | **refusé en l'état** | le correctif Studio hébergé modifie des migrations historiques du projet dédié : à ré-écrire en **nouvelle** migration dédiée |
| `DECISION_REQUIRED:V9-PDF-CHROMIUM-NOM` | technique | ouvert | harmoniser `PDF_CHROMIUM_EXECUTABLE` (GP) et `PDF_CHROMIUM_EXECUTABLE_PATH` (Réserves) |
| B1 en hébergé (lot R-1, R-2) | exploitation | ouvert | pousser `…0930 000901` **avant** le code, sinon la connexion échoue (fail-closed). Vérifier le rate limit propre de Supabase Auth (il voit l'IP Vercel). `RATE_LIMIT_HMAC_KEY` obligatoire en production |
| B3 conditions d'exploitation (lot capacité §0.2) | exploitation | ouvert | `NODE_OPTIONS=--max-old-space-size` selon le conteneur ; `PDF_CONCURRENCE` cohérent (**pas de PDF sous 1 Go**) ; chauffe avant trafic. Latence résiduelle `/pointage/gestion` (policy RLS par ligne) réduite par les RPC V9, non remesurée en charge ici |
| IBAN (lot R1-R7) | exploitation / sécurité | ouvert | avant Preview / Production : `bank-keys register` + attestation (empreinte de `k1`, contrôle DB verify 38), `BANK_DATA_ENCRYPTION_KEYS`, `BANK_OAUTH_STATE_HMAC_KEY` ; étapes §5.0-§5.1 du lot **non prouvées en hébergé** |
| Pack Preview | Preview | ouvert | les attendus générés du pack et du runbook sont ceux de V9 (384 / 38). Leur texte désigne encore la ref V8 et le pack opérateur V8 (`modest-shannon`) n'est pas intégré : une mission Preview doit pointer le pack sur V9 (une ref V8 échouerait proprement à `verify:migrations`) |
| `DECISION_REQUIRED:V8-PILOTE-ESSAI-ECHU` | propriétaire / facturation | **ouvert (hérité, re-constaté)** | §9.4 |
| `DECISION_REQUIRED:V8-PERF-C1`, Billing / Per-App / e-mail / RGPD / Studio hérités de V8 | — | ouverts (hérités) | inchangés |
| Harnais `pilot_acceptance_v3.sh` (`pkill` sur `./postgrest`) | outillage | constat | §9.4 ; arrêter par port ou fichier pid |
| Plateforme ≥ 1 000 tenants, `COST` des fonctions de policy, garde serveur par permission sur accès direct par URL | performance (lot résiduel §11) | ouverts | non bloquants pour l'exactitude |
| Stripe Test réel, Portail, Storage / GoTrue / e-mail hébergés | exécution distante | NOT PROVEN localement (hérité) | — |

## 13. Reproduire

```bash
git fetch --all --prune && git worktree add -b integration/elsatia-canonical-train-v9 ../v9 claude/compassionate-ptolemy-vu8vbx
cd ../v9 && npm ci && for a in tools colors reserves studio; do npm ci --prefix apps/$a; done
(cd tests/e2e/colors-pile-locale && npm ci) && npm ci --prefix workers/studio-video
pg_ctlcluster 16 main start ; apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl postgresql-plpython3-16 python3-nacl redis-server

scripts/local-postgres-bootstrap/rebuild_db.sh v9_fresh                          # 384/384
scripts/qualification/v9/ledger-check.sh                                         # 9/9
scripts/qualification/pgtap-run-v3.sh v9_fresh                                   # 161/170 propres, 8 819 ok
UPG_PASSE=historique   scripts/qualification/upgrade-v8-v9.sh upg_a v9_fresh     # 0 écart, sonde 2 499 cellules, 47/47
UPG_PASSE=volumetrique scripts/qualification/upgrade-v8-v9.sh upg_b v9_fresh     # 0 écart, 30/30
ELSATIA_PREVIEW_DB_URL=postgresql://…@127.0.0.1/v9_fresh node scripts/preview/db-verify.mjs --local-harness --before-owner   # GO
npm run typecheck && npm run lint && npm test && (cd apps/studio && npm run typecheck && npm run lint && npm test)
npm run build && NEXT_PUBLIC_TOOLS_ENV=local npm --prefix apps/tools run build
ELSATIA_APPLICATION_ENV=local npm run build:reserves && ELSATIA_APPLICATION_ENV=local npm run build:colors
npm run verify:migrations && npm run verify:train-expectations && npm run verify:env-manifest && npm run test:seeds && npm run test:preview-pack
# Bancs PostgREST réels
scripts/qualification/finance-aggregates/postgrest-bench.sh fin_bench 3011 && set -a && . /tmp/finance-bench/env && set +a \
  && npx vitest run src/lib/*.postgrest.test.ts src/lib/*/*.postgrest.test.ts --exclude src/lib/gp-residuel.postgrest.test.ts   # 89/89
rebuild_db.sh gpres && psql -d gpres < scripts/qualification/gp-residual/seed.sql && scripts/perf/postgrest_local.sh gpres 3012 \
  && GP_RESIDUEL_URL=http://localhost:3012 GP_RESIDUEL_DB=gpres npx vitest run src/lib/gp-residuel.postgrest.test.ts           # 50/50
SEEDS_DR_PGPASSWORD=… node scripts/seeds/verify-seeds.mjs                        # 17/17
npm run incident:drill                                                          # 91/91
# Playwright : piles finance-pile-locale (fin_e2e, gp_e2e), employes-pile-locale, pile pilote (pilot_acceptance_v3.sh) — §9.2
```

## 14. Fichiers V9 (hors lots intégrés)

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20260930000901_rate_limit_consultation_connexion_v1.sql` | port B1, en-tête de renumérotation |
| `src/app/(app)/{planning,dashboard,pointage/gestion}/page.tsx`, `src/lib/alertes-operationnelles.{ts,test.ts}`, `tests/e2e/gp-heavy-pages-capacity.spec.ts` | résolutions sémantiques §3 |
| `src/app/actions/paiements-bancaires.ts`, `src/app/api/paie/documents/upload/route.ts`, `src/lib/security/redirections-residuelles-rt01.test.ts` | RT-01 |
| `config/env-manifest.json`, `docs/qualification/preview-pack/ENV_INVENTORY_PREVIEW_V1.generated.md`, `scripts/perf/memory/sampler.cjs`, `scripts/seeds/registry{,.test}.mjs` | défauts hérités §5.3 |
| `scripts/qualification/upgrade-v8-v9.sh`, `scripts/local-postgres-bootstrap/upgrade_v8_v9_{seed_complement,business_checks}.sql`, `upgrade_v8_v9_classify.py`, `upgrade_snapshot.py` | harnais d'upgrade (§6) |
| `scripts/qualification/v9/ledger-check.sh` | ledger (§5.2) |
| `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql`, pack et runbook Preview | attendus régénérés (384 / `20260930000901` / 38) |
