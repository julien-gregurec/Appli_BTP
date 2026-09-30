# ELSATIA — Canonical Train V8 : convergence post-V7 (V1)

| | |
|---|---|
| Date | 2026-09-30 |
| Base | `integration/elsatia-canonical-train-v7` @ `547f0b6f` (verdict `CANONICAL TRAIN V7 LOCALLY QUALIFIED` ; 359 migrations, dernière `20260928000701`), **non modifiée** |
| Branche | `claude/sleepy-cannon-6je2vo` (seule branche poussée ; à publier en `integration/elsatia-canonical-train-v8`, même commit, §17) |
| Migrations | **371**, dernière **`20260928000812`**. Projet partagé : +12 (10 migrations de lots renumérotées, 1 de convergence, 1 de performance). Projet Studio dédié : **23** (+2, renumérotées). Aucune migration V3 → V7 modifiée |
| Moteur | PostgreSQL 16 réel + pgTAP 1.3 (`scripts/local-postgres-bootstrap`, sans Docker) ; Node 22 ; Playwright 1.62.1 + Chromium 1194 ; GoTrue v2.196.0 et v2.192.0 compilés, PostgREST v12.2.3, storage-api v1.79.22 compilée, Redis local, FFmpeg + OpenCV 4.14 |
| Actions distantes | **Aucune.** Pas de Supabase hébergé, de Vercel, de Stripe réel ni de Production, et aucun merge vers `main`. |

## 0. Verdict

**`CANONICAL TRAIN V8 LOCALLY QUALIFIED`**

Les **7 lots** qualifiés après V7 sont intégrés, ainsi que **3 des 4 correctifs Performance** mesurés.
V3 à V7 n'ont pas été touchés : branches, migrations et rapports historiques restent tels quels.

Les migrations des lots sont renumérotées en un bloc strictement monotone `…0928 801` → `…0928 812`
(projet partagé), à la suite de `…0928 701`. Le projet Studio dédié reçoit `…0929 170000` et
`…0929 180000`, après `…0929 160000`.

La convergence a révélé **8 conflits sémantiques entre lots**, invisibles lot par lot. Chacun est
résolu selon la règle métier, avec une preuve rouge → vert (§4). Ils ont demandé une migration de
convergence (`…0811`) et l'adaptation d'outillage et de tests, **sans assouplir aucune règle**.

| Preuve | Résultat V8 |
|---|---|
| Base neuve | **371/371**, 0 erreur ; Studio dédié **23/23**, 0 table GP |
| Upgrade V7 → V8 (base V7 historisée depuis V3, données de l'ère V7) ×2 | 271 tables, **1 seul écart de lignes** (catalogue), **100/101 empreintes identiques** (catalogue), policies 639 → 658 (**0 supprimée**, 3 modifiées Per-App, 19 ajoutées), sonde RLS 1 836 cellules : **193 écarts, tous rattachés à une règle V8, 0 silencieux**, schéma + ACL = fresh, **47/47** contrôles métier |
| pgTAP (une base par fichier) | **163 fichiers, 154 propres, 8 059 ok**. Sur les 153 fichiers communs avec V7 (rejoué ici) : 150 identiques et 3 adaptés par Per-App (+2 assertions chacun, propres). **0 régression** ; 10 suites nouvelles, toutes propres |
| Studio dédié | `dedicated-db-check` **864 ok / 0** ; upgrade 21 → 23 identique au fresh ; **Studio Dedicated E2E 21/21**, canaris **5/5** |
| Applications | 5 × typecheck, lint, Vitest (GP 2 588, Tools 2 150, Réserves 226, Colors 431, Studio 343) et build ✅ ; worker **42/42** |
| Playwright | Relevé 2→9 + Atelier **107/107** · Réserves **59/59** · D-01 **7/7** · GP↔Réserves **5/5 ×3** · Billing + réabonnement + Per-App **17/17 ×2** · Colors **75/75** · Employés **15/15** (+ contre-épreuve) · Studio **21/21** |
| Billing / Per-App (concurrence réelle) ×2 | Per-App **27/27**, cycle **22/22**, réabonnement **20/20**, essai **7/7**, ordre **15/15** |
| Incident | `npm run incident:drill` **91/91 ×2** (15 scénarios) ; pgTAP mode sûr 131/131, orphelins Stripe 30/30, convergence 32/32 |
| Seeds | **ALL ACTIVE SEEDS QUALIFIED — 16/16 sur 371** ; `test:seeds` 48/48 |
| DB verify | **37 contrôles, GO local** (35 OK, 2 non bloquants avant l'étape propriétaire) ; **39/39** RPC service-role only |

Restent ouverts, sans masquage :
- les **4 blockers Performance** (B1 à B4, §5) ;
- le correctif Performance **C1**, refusé pour V8 (§5) ;
- les décisions propriétaire héritées des lots (§17) ;
- la fixture pilote en **essai échu** (§8, `DECISION_REQUIRED:V8-PILOTE-ESSAI-ECHU`).

---

## 1. Lots intégrés

| Lot | Branche | Tip | Base de la branche | Verdict d'origine | Intégration V8 |
|---|---|---|---|---|---|
| A. Billing lifecycle | `claude/busy-darwin-tlpi3p` | `d43e1c12` | V6 `9102ec80` | ELSATIA BILLING LOCALLY QUALIFIED | merge `--no-ff` `ee54aac`, 3 conflits (attendus générés, DB verify) |
| B. Per-App Suspension | `claude/kind-tesla-0i0818` | `58944da` | A `d43e1c12` | ELSATIA PER-APP SUSPENSION LOCALLY QUALIFIED | merge `e59672b` **après A** (dépendance réelle), 3 conflits (générés) |
| C. Security Red Team V2 | `claude/elsatia-v6-security-redteam-v2` | `8307d5b` | V6 | ELSATIA V6 SECURITY BLOCKERS FOUND → correctifs prouvés | merge `3465161`, 4 conflits (§3) ; F5 et F11 superseded |
| E. Employee Data Access | `claude/magical-ritchie-36kz4o` | `ed857a6` | V6 | ELSATIA EMPLOYEE DATA ACCESS LOCALLY QUALIFIED | merge `89fb3f5`, 3 conflits (générés, DB verify) |
| D. Incident Response & Safe Mode | `claude/serene-franklin-rgu054` | `a622c63` | V6 | ELSATIA INCIDENT RESPONSE LOCALLY QUALIFIED | merge `36b4bf5`, 6 conflits (§3) |
| F. Relevé & Métré Lot 8 | `claude/great-mendel-w9qt6c` | `0ec193e` | tip Lot 7 `62ebcb1c` (dans V7) | RELEVE METRE LOT 8 LOCALLY QUALIFIED | merge `ebda59a`, sans conflit |
| G. Relevé & Métré Lot 9 | `claude/compassionate-volta-cnbzjs` | `a622540` | F | RELEVE METRE LOT 9 LOCALLY QUALIFIED | merge `d1f14db`, sans conflit |
| Performance (sélection) | `claude/brave-carson-cj8ofz` | `48064a6` | V5 `f6399f15` | ELSATIA PERFORMANCE BLOCKERS FOUND | **pas de merge** : C2, C3, C4 portés dans un commit (`6ce4143`), C1 refusé (§5) |

Aucun correctif n'est dans un commit de merge. Les commits propres à V8 viennent ensuite, séparés :

| Commit | Objet |
|---|---|
| `725be13` | renumérotation (§6) |
| `6804f16` | migration de convergence `…0811` + pgTAP (§4.1-4.2) |
| `6ce4143` | Performance C2-C4 |
| `9be7c28` | harnais d'upgrade V7 → V8 |
| `543cc2a` | DB verify 34-37, RPC service-role only, manifeste, registre, pack/runbook |
| `8459cc8` | Studio dédié : motif de bascule (§4.4) |
| `c2891aa` | témoins REDTEAM-V2 sur la route fusionnée |
| `bf5701c` | drill d'incident S10 (§4.6) |
| `8ca1d8f` | banc Studio dédié × mode sûr (§4.5) |
| `6811f6e` | attendus du train + DB verify 4, 5, 22 (§4.7) |
| (ce rapport) | |

## 2. Ordre de convergence

Ordre suivi : **Billing → Per-App → Security V2 → Employés → Incident → Lot 8 → Lot 9 → Performance**
(ordre de la mission). Il n'a pas été changé, car deux dépendances réelles le confirment :

1. **Per-App après Billing.** La branche B contient le commit A. Sa migration redéfinit
   `est_membre_actif` / `est_membre_actif_reel` à partir du corps Billing `…0803` (essai expiré en base).
2. **Per-App (`…0804`) avant Incident (`…0807`)**, dans les commits **et** dans la numérotation :
   - la migration Incident renomme `reserves_invitation_accepter` en `…__brut` et pose une enveloppe gardée par-dessus ;
   - la migration Per-App convertit le corps de cette fonction (liste fermée, **échec si la référence
     `est_membre_actif(` a disparu**).
   - Dans l'ordre inverse, `…0804` échouerait. Preuve dans le bon ordre (pgTAP convergence §5) :
     `__brut` porte `est_membre_plateforme_actif`, l'enveloppe lui délègue.

Les Lots 8 et 9 sont placés **après** Incident, comme le demande la mission. Leurs tables ont donc
besoin de la migration de convergence (§4.1).

## 3. Conflits textuels et réconciliations

| Fichier | Lots | Résolution |
|---|---|---|
| `ELSATIA_PREVIEW_DB_VERIFY_V1.sql` | V7 (30 = Lot 7) ↔ A (30) ↔ B (31) ↔ E (30) | V7 conservé ; contrôles renumérotés **31** Billing, **32** Per-App, **33** Employés ; références `…0801-0806` ; bloc `attendu_train` régénéré |
| Pack Preview, runbook V3 | A, B, E, D (marqueurs générés) | côté V7, puis `sync:train-expectations` après convergence |
| `apps/reserves/src/app/auth/callback/route.ts`, `actions.ts` | V7 (`cheminInterneStrict` + origine **configurée**) ↔ C (`cheminInterneSur`, forme normalisée) | **double validation** : une destination n'est retenue que si les deux validateurs l'acceptent ; base de redirection V7 conservée. Preuve : 11 témoins REDTEAM-V2 ajoutés au test de la route (36/36). Contre-épreuve sur la route V7 seule : **4 échecs** (`/.//evil.com`, `/..//`, `/%2e//`, `/a/..//` → chemin `//evil.com`) |
| `src/lib/email.ts` | V7 (échappement bloc par bloc, lien http(s) échappé) ↔ C (F5) | **F5 superseded par V7** : corps V7 conservé, doublon `echapperHtml` retiré ; les témoins F5 restent dans `email.test.ts` (verts) |
| `apps/studio/supabase/migration-targets.json` | V7 post-H ↔ C ↔ D | union, puis renumérotation |
| `apps/studio/tests/read-only-policy.test.ts` | V7 post-H ↔ D | union des RPC de lecture |
| `config/env-manifest.json` | V7 (banc Studio) ↔ D (`scripts/incident/`) | union des exclusions de scan |
| `src/app/actions/rgpd.ts`, `signatures-documents.ts` | C (F9 : chemins Storage bornés au préfixe) ↔ E (lecture via `employes_fiche`) | fusion automatique **vérifiée** : les deux protections coexistent |

**Security V2, correctifs repris et superseded** :

| Finding | Statut V8 |
|---|---|
| F1 (jeton de session au tirage PDF) | intégré |
| F2/F3 (redirections Réserves) | intégré, fusion ci-dessus |
| F4 (tenant ↔ chantier Réserves) | intégré, `…0805` |
| F5 (HTML e-mail) | **déjà corrigé par V7** |
| F6 (validateur interne) | intégré |
| F7 (2 SECURITY DEFINER) | intégré, `…0805` |
| F8 (séquence d'identité Studio) | intégré, dédié `…0929 170000` |
| F9 (confused deputy Storage) | intégré |
| F10 (formule CSV) | intégré |
| F11 (essai expiré en base) | **superseded par Billing B-4** (`…0803`), non porté |

## 4. Conflits sémantiques (interactions entre lots)

| # | Interaction | Constat (preuve rouge) | Résolution | Preuve verte |
|---|---|---|---|---|
| 4.1 | **Incident × Relevé Lots 8-9** | Le mode sûr n'installe sa garde que sur les tables existantes à sa migration (« une migration qui crée une table DOIT rappeler `incident_installer_gardes()` »). Les Lots 8-9, qualifiés sans Incident, créent 4 tables : pgTAP `incident_safe_mode_v1` test 23 **have 4, want 0** ; ces tables restaient écrivables en lecture seule | migration de convergence **`…0811`** : réinstallation des gardes | pgTAP incident 131/131 ; `v8_convergence_incident_gardes_v1` **32/32** (sans `…0811` : **11 échecs**) ; DB verify 34 |
| 4.2 | **Incident × Per-App** | `incident_application_table` range toute table inconnue dans `gestion_pro`. Les tables de l'état commercial **par application** (`evenements_commerciaux_applications`, `rapport_migration_suspension_par_app_v1`) auraient été gelées par une lecture seule **GP seule**, bloquant la synchro Colors / Réserves / Tools, contraire à la règle Per-App | `…0811` : ces 2 tables rejoignent le **socle** (gelé par la portée globale uniquement), comme `acces_applications_entreprises`. `DECISION_REQUIRED:V8-INCIDENT-PERAPP-SOCLE` décidé ainsi | pgTAP convergence : gel GP → socle Per-App écrivable ; gel global → gelé |
| 4.3 | **Per-App × Incident** (`reserves_invitation_accepter`) | ordre de dépendance (§2) | numérotation `…0804` < `…0807` | pgTAP convergence §5 |
| 4.4 | **Incident (Studio) × Studio post-H (V7)** | le mode sûr Studio impose un **motif** pour toute bascule hors `read_write` ; la suite post-H et la spec E2E 06 basculaient sans motif (`dedicated-db-check` en échec) | règle **conservée** ; les deux fixtures fournissent un motif (comme le lot Incident l'a fait pour `studio_db_write_guard`) | dédié 864/0 ; E2E 21/21 |
| 4.5 | **Incident (Studio) × banc Studio dédié (V7)** | la garde C5 refusait `incident_etat_public` (anon) et `incident_worker_sante` non classées. Le cache applicatif du mode sûr (≤ 10 s, par conception) laissait les specs 07/08 écrire pendant le « retour read_write » → 503 | classes `incident_public_state` (**seule** fonction `anon_allowed`) et `incident_health_system` ; spec 00 : 23 migrations, 1 fonction anon **nommée** ; spec 06 : **assertion** de propagation ≤ 20 s du retour d'écriture | chaîne OK, canaris 5/5, 21/21 |
| 4.6 | **E-mail V7 × drill Incident** | garde `EMAIL_PREVIEW_ALLOWLIST` (fail-closed hors Production) : l'envoi était refusé avant d'atteindre le faux Brevo en panne (drill **87/89**) | le scénario S10 déclare son destinataire (comme une Preview réelle) et restaure l'environnement ; aucun code applicatif touché | **91/91 ×2** |
| 4.7 | **DB verify V3-V7 × lots** | `db-verify.mjs` complet, jamais rejoué par les lots : contrôle 4 (anon) refusait les 2 tables d'état **public** du mode sûr ; contrôle 5 exigeait un SELECT de **table** sur `employes` (lot E : droits de colonnes) ; contrôle 22 attendait 11 tables Relevé (15) | 4 : +2 tables, **lecture seule** ; 34 : motif / auteur / écriture fermés à anon ; 5 : `has_any_column_privilege` pour `employes` + colonne `nom` ; 22 : 15 | GO local ; base V7 : NO-GO propre sur les seuls contrôles V8 |
| 4.8 | **Per-App × D-01 (V5)** | hôte GP **suspendu** mais Réserves autorisé : en V7 l'invité était en lecture seule ; Per-App (décision propriétaire « suspension commerciale = par application ») rouvre l'écriture | règle Per-App appliquée (décision du lot, pas de V8) ; D-01 suit l'état **de Réserves** de l'hôte, et une suspension **globale** le fige toujours | upgrade P08 ; pgTAP D-01 99/99 ; Playwright D-01 7/7 |

Deux défauts **hérités** du lot Employés, sans rapport avec un autre lot :
- 3 variables de la recette locale ne figuraient pas au manifeste : déclarées outillage `e2e`, comme la pile Colors ;
- le décor pgTAP n'était pas classé dans le registre des seeds : classé `CI_ONLY` / `pgtap`, contournement de capacité déclaré.

## 5. Performance (`claude/brave-carson-cj8ofz`)

La branche part de V5 et n'a **pas** été fusionnée. Chaque correctif a été vérifié contre V8 :

| # | Correctif | Présent en V7/V8 ? | Toujours pertinent ? | Décision | Mesure avant → après (V8) |
|---|---|---|---|---|---|
| C1 | 11 fonctions d'aide RLS `sql` → `plpgsql` (plan en cache) | non | oui (coût par ligne) | **NON PORTÉ** | sur une copie V8, C1 tel quel fait échouer **562 assertions Per-App et 20 Billing** : ses corps sont extraits de **V5**, alors que `est_membre_actif`, `a_acces_application` et `reserves_intervenant_courant` ont été redéfinis depuis (Billing `…0803`, Per-App `…0804`). Le porter réintroduirait les règles d'accès V5 (modification de sécurité/RLS interdite) |
| C2 | totaux de devis recalculés **par instruction** | non (`lignes_devis`, `recalc_totaux_devis`, `trg_recalc_devis` identiques V5 → V8) | oui | **porté** : `…0812`, corps inchangé, pgTAP 12/12 ; DB verify 37 | 1 000 lignes, 3 passes : insert **~1 230 → ~45 ms**, update **~1 350 → ~37 ms**, delete **~290 → ~28 ms**, TTC identiques (`scripts/qualification/v8/perf_c2_devis_recalc_bench.sql`) |
| C3 | formulaire d'affectation du planning rendu à l'ouverture | non (`planning/page.tsx` identique V5 → V8) | oui | **porté** tel quel + Vitest `ModifierAffectationDiffere` (2/2) | mesuré sur la branche source (HTML 190 Mo → 4 Mo, jeu « gros ») ; **non remesuré en V8** (jeu volumétrique non rejoué, §16) |
| C4 | médias de conversation signés en un appel | non (page identique V5 → V8) | oui | **porté** tel quel (session utilisateur, policies Storage inchangées) | mesuré sur la branche source (80 vignettes, 0 appel à la route limitée) ; non remesuré en V8 |

Aucune policy, aucun grant ni aucune fonction d'accès n'a été modifié par les correctifs portés.

**Blockers ouverts, non masqués** :
- **B1** limite de connexion par IP (11ᵉ connexion en 10 min → 429 derrière une même box) : décision de sécurité requise ;
- **B2** troncature silencieuse à 1 000 lignes (`max_rows` PostgREST) sur `/pointage/gestion` ;
- **B3** mémoire du serveur Next (3,2 Go pour 25 utilisateurs sur le jeu moyen) ;
- **B4** édition de facture brouillon : `recalc_totaux_facture` non exécutable par `authenticated`. Toujours présent en V8 : `modifier_facture_brouillon` n'est touché par aucun lot.

## 6. Migrations

Dernière migration réelle de V7 : `20260928000701_tools_releve_metre_equipements_calques_v1`.
Dernière migration dédiée V7 : `20260929160000_studio_post_h_guard_rgpd`.

| Lot | Ancienne migration | Nouvelle migration | Projet cible | Raison du changement |
|---|---|---|---|---|
| A. Billing | `20260928000701_billing_lifecycle_cancel_terminal_v1` | **`20260928000801`** | partagé | `…0701` déjà occupé (Lot 7, V7) ; bloc V8 contigu après V7 |
| A. Billing | `20260928000702_billing_lifecycle_plans_catalogue_canonical_v1` | **`20260928000802`** | partagé | idem |
| A. Billing | `20260928000703_billing_lifecycle_trial_expiry_enforced_v1` | **`20260928000803`** | partagé | idem |
| B. Per-App | `20260929000801_per_app_commercial_suspension_v1` | **`20260928000804`** | partagé | bloc V8 ; **avant** Incident (§2) |
| C. Security V2 | `20260928000701_security_redteam_v2_hardening_v1` | **`20260928000805`** | partagé | collision `…0701` |
| E. Employés | `20260928000701_employes_donnees_personnelles_acces_v1` | **`20260928000806`** | partagé | collision `…0701` |
| D. Incident | `20260928000701_incident_safe_mode_v1` | **`20260928000807`** | partagé | collision `…0701` (renumérotation obligatoire) ; après Per-App |
| D. Incident | `20260928000702_stripe_webhook_reservations_orphelines_v1` | **`20260928000808`** | partagé | collision `…0702` |
| F. Lot 8 | `20260928001201_tools_releve_metre_metres_revetements_v1` | **`20260928000809`** | partagé | plage de branche « 12xx » hors train (convention V6/V7) |
| G. Lot 9 | `20260929001301_tools_releve_metre_quantitatifs_ouvrages_v1` | **`20260928000810`** | partagé | idem, après Lot 8 |
| V8 | — | **`20260928000811_v8_convergence_incident_gardes_v1`** | partagé | nouvelle : convergence §4.1-4.2 |
| Performance C2 | `20260928000402_devis_recalc_totaux_par_instruction_v1` (base V5) | **`20260928000812`** | partagé | `…0402` < V7 et déjà dans la plage V6 : portée en fin de bloc V8 |
| C. Security V2 | `20260928130000_studio_identity_handoff_seq_guard_v1` | **`20260929170000`** | **Studio dédié** | `130000` antérieur à la chaîne post-H V7 (`…0929 1x0000`) : monotonie |
| D. Incident | `20260928130000_studio_incident_control` | **`20260929180000`** | **Studio dédié** | collision avec C, antérieur à post-H |

Chaque migration renumérotée reçoit un en-tête « Train canonique V8 : numéro d'origine …, renuméroté … ».
Les **corps sont inchangés**.

- `git diff origin/integration/elsatia-canonical-train-v7 -- supabase/migrations apps/studio/supabase/migrations` : **14 ajouts, 0 modification**.
- `verify:migrations` : **371 valides** ; cibles : partagé 371 · Studio dédié 23 (9 copies gelées + 14 dédiées).
- Références alignées : tests, parité `releve-domain`, en-têtes pgTAP, routes webhook, runbooks incident, scripts de lot.
- Harnais du lot Per-App (`per-app-suspension-upgrade.sh`) adapté et rejoué : **12/12**.
- Base « avant » du lot Employés : ne retire plus que `…0806`, et non tout `…0701` (qui aurait retiré le Lot 7).
- Les rapports de lot gardent leurs numéros d'origine.

## 7. Base neuve et upgrade V7 → V8

**Base neuve** : `rebuild_db.sh v8_fresh` → **371/371**, 0 erreur (≈ 22 s). V7 rejoué dans les mêmes
conditions : 359/359.

**Upgrade** : nouveau harnais reproductible `scripts/qualification/upgrade-v7-v8.sh`.

1. Base V7 **avec historique**. Migrations V3 (340), jeu V3, puis compléments de chaque ère lus aux refs
   historiques V4 → V7, jusqu'à la migration V7 (359). Une lecture git en échec arrête désormais le
   chargement : l'ancien harnais chargeait silencieusement un fichier vide.
2. Données de l'ère V7, nouveau fichier `upgrade_v7_v8_seed_complement.sql` :
   - contrat enregistré au prix obsolète **Mini 69 €** ;
   - entreprise **GP suspendue** (past_due) avec **Colors** payé et 2 utilisateurs habilités ;
   - **données personnelles** des salariés (e-mail, téléphone, notes RH, numéro d'inscription, carte BTP) ;
   - **2 objets Lot 7** sur le plan « as built » (dont un lié à un mur) ;
   - intervenant Réserves du même tenant.

   Le jeu contient déjà : entreprise annulée, essai expiré, hôte D-01 suspendu et entreprise pilote.
   Il compte 52 utilisateurs et 271 tables.
3. Instantané, puis 12 migrations V8, puis instantané, puis comparaison. **Classement automatique de chaque écart**
   (`upgrade_v7_v8_classify.py` : un écart sans règle V8 = perte silencieuse = échec). Le schéma et les ACL
   sont comparés au fresh, puis viennent **47 contrôles métier** (pgTAP, transaction annulée).

Deux passes, résultats identiques :

| Contrôle | Résultat |
|---|---|
| Migrations V8 | 12/12, 0 erreur |
| Row counts (271 tables) | **1 écart** : `plans_abonnement` 13 → 16, **R-CATALOGUE** (une version active canonique pour Mini, Pro, Business ; Entreprise déjà à 599 €) ; 9 tables nouvelles, toutes RLS |
| Empreintes (101 tables, colonnes d'avant) | **100/101 identiques** ; `plans_abonnement` : anciennes versions **conservées et désactivées**, 1 version active par offre, grille 79/249/449/599 ×10 |
| Policies | 639 → 658 : **0 supprimée**. 3 modifiées, **liste fermée Per-App** : `acces_applications_entreprises_lecture`, `reserves_annuaire_select`, `reserves_notifications_select`. 19 ajoutées : tables nouvelles, `role_gestion_*` Employés, uploads du mode sûr |
| Sonde RLS réelle (51 utilisateurs × 36 tables) | **193 écarts / 1 836 cellules, 0 silencieux**. **179 R-BILLING-B4** : les 28 membres de l'entreprise pilote, en **essai échu** le 29/08, perdent les tables **Gestion Pro seulement** (B-4 : essai expiré fermé en base). **14 R-PERAPP-GAIN** : Colors B (GP suspendu) et hôte D-01 regagnent **leur** application, tracés dans `rapport_migration_suspension_par_app_v1`, 0 `perte_acces` |
| Droits de table | `employes` : SELECT de table → SELECT de colonnes (lot E) ; tables nouvelles : 14 |
| EXECUTE | 2 retraits voulus (F7) ; 0 fonction supprimée ; 82 nouvelles, dont 42 pour les applications (RPC Relevé, bascules plateforme, état public du mode sûr) |
| Schéma + ACL vs fresh V8 | **identiques** (33 650 lignes, 2 177 ACL) |
| DB verify sur la base upgradée | contrôles V8 31-37 ✅ ; seul écart : bucket `logos` public déjà présent dans le jeu historique **avant** upgrade (fixture V3), sans lien avec V8 |

**Contrôles métier 47/47** :

| Série | Ce qui est vérifié |
|---|---|
| B01-B08 (Billing) | grille canonique ; ancienne grille conservée ; **contrat 69 € intact** ; `invoice.paid` tardif sur une entreprise annulée en V7 → reste annulée (B-1) ; pilote en essai échu : GP fermé en base, appartenance plateforme conservée, 0 chantier par l'API |
| P01-P09 (Per-App) | 0 perte, gains tracés, lignes `entitled`, 0 suspension globale ; **GP past_due → Colors ouvert** ; pilote : Colors et Réserves ouverts, GP fermé ; D-01 selon Per-App ; réserves intactes |
| S01-S04 (Security V2) | 0 rattachement inter-tenant existant ; insertion inter-tenant → 42501 ; intervenant V7 conservé ; F7 |
| E01-E08 (Employés) | un ouvrier ne lit ni l'e-mail ni les notes d'un collègue par la table (42501) ; identité toujours lisible (embeds) ; fiche limitée à la sienne, sa note masquée ; le gestionnaire relit les notes et coordonnées **de l'ère V7 intactes** ; export filtré |
| I01-I06 (mode sûr) | 0 contrôle actif, état public vide, gardes sur toutes les tables V3 → V8, 12 services OPERATIONAL, **0 webhook historique orphelin** (rattrapage `finalise_at`), écriture GP normale |
| L01-L08 (Relevé) | plans figés V5 / V6 : **empreinte recalculée à l'identique** par le contenu V8 ; objets Lot 7 conservés ; métré Lot 8 et quantitatif Lot 9 calculés sur le plan V6/V7 ; plan figé relu figé ; autre tenant refusé |
| C01 | recalcul par instruction exact |
| X01-X03 | identité et Studio du projet partagé inertes |

## 8. Billing

| Scénario | Preuve V8 |
|---|---|
| Cycle de vie, ordre, annulation terminale (B-1), catalogue (B-2), Portail (B-3), essai en base (B-4), libellés (B-5) | pgTAP `billing_subscription_lifecycle_v1` **190/190** ; Vitest (offre facturée, libellés d'essai, synchronisation) dans GP 2 588 |
| Concurrence | `billing-lifecycle-concurrency.sh` **22/22 ×2** ; ordre **15/15 ×2** ; essai **7/7 ×2** |
| Réabonnement | pgTAP 99/99 ; concurrence **20/20 ×2** ; Playwright **6/6 ×2** |
| Per-App | pgTAP **2 925/2 925** ; concurrence **27/27 ×2** (lecteurs pendant les bascules, aucune observation « mi-ouverte ») ; upgrade Per-App **12/12** ; Playwright **5/5 ×2** |
| Parcours navigateur + API | `billing-lifecycle` **6/6 ×2** (écran **et** REST sous la session : essai expiré bloqué à l'écran et par l'API) |

`DECISION_REQUIRED:V8-PILOTE-ESSAI-ECHU` (nouveau, révélé par l'upgrade) :
- la fixture de production `seed_entreprise_pilote_btp.sql` crée l'entreprise pilote « en essai » avec `created_at = now() − 2 mois` ;
- l'essai initialisé sur 30 jours est donc **échu** ;
- depuis B-4 (`…0803`), les membres pilotes n'accèdent plus aux données Gestion Pro **par l'API**. L'interface les bloquait déjà en V7 ;
- Colors, Réserves et Tools du pilote restent ouverts (Per-App) ;
- seeds qualifiés 16/16 : les assertions du pilote ne testent pas l'accès membre.

Décision propriétaire avant le pilote externe :
- ou prolonger l'essai de la fixture (décision de facturation « pilote manuelle / offline » du pack),
- ou poser un état d'abonnement explicite.

Aucune donnée ni règle n'est modifiée ici (choix conservateur).

## 9. Security

Les témoins d'exploit de la red team V2 sont rejoués sur V8, et chaque correctif intégré reste fermé :

| Finding | Témoin rejoué | Résultat |
|---|---|---|
| F4, F7 | pgTAP `security_redteam_v2_hardening_v1` | **9/9** ; upgrade S01-S04 |
| F8 | pgTAP dédié `studio_identity_handoff_seq_guard` (chaîne dédiée) | ✅ |
| F2 / F3 | `redirection-sure.test.ts` + **11 témoins sur la route fusionnée** | 36/36 ; contre-épreuve V7 seule : 4 échecs (§3) |
| F1, F5, F6, F10 | Vitest `pdf/cookies`, `email`, `security/redirects`, `expenses/export` | dans GP 2 588, verts |
| F9 | `rgpd.ts` / `signatures-documents.ts` (préfixe tenant/employé) | fusion vérifiée (§3) |

Findings ouverts de la red team V2 (§7 de son rapport), inchangés :
- `entreprise_active_id` sans `WITH CHECK` ;
- contraintes `logo_url` / chemins Storage ;
- rate-limit de la route PDF de partage ;
- secret global de l'import paie.

Le scrubbing Sentry est partiellement couvert par le nettoyage Sentry de l'architecture e-mail V7.

## 10. Incident Response & mode sûr

| Exigence | Preuve V8 |
|---|---|
| Mode sûr SQL (contrôles, gardes, journal append-only, verrou de réconciliation Stripe) | pgTAP `incident_safe_mode_v1` **131/131** ; convergence **32/32** |
| Gardes | toute table public non exemptée gardée (V3 → V8, Lots 8-9 compris) : pgTAP, upgrade I03, DB verify 34 |
| Reprise des webhooks Stripe orphelins | pgTAP **30/30** ; Vitest des routes webhook (finalisation) ; upgrade I05 (historique rattrapé, 0 orphelin) |
| Santé | Vitest `incident/sante`, `proxy-mode-sur` ; drill S6-S13 (sondes publique et profonde) |
| RBAC `total` + AAL2 | pgTAP (admin client, support, lecture, facturation, AAL1, service_role, anon refusés) ; drill S1 |
| **Drill complet** `npm run incident:drill` | **91/91, deux passes**, sur une pile locale jetable : GoTrue v2.192.0, PostgREST, Storage, Redis, faux Stripe / Brevo, GP `next dev`. Scénarios S0-S14 : nominal, RBAC, lecture seule globale, coupure Réserves seule, liens / invitations / uploads, post-restauration sans droit rouvert avant réconciliation, Postgres / Auth / Storage / e-mail / Stripe / Redis indisponibles, webhook interrompu, worker Studio bloqué, audit trail 18/18 |
| Studio (projet dédié) | pgTAP dédié `studio_incident_control` ✅ ; E2E dédié 21/21 (§4.4-4.5) |

## 11. Données personnelles des salariés

| Exigence | Preuve V8 |
|---|---|
| Un ouvrier ne lit pas les champs sensibles d'un collègue | pgTAP **65/65** ; upgrade E01-E05 ; Playwright + **PostgREST réel** **15/15** |
| Chemin légitime du gestionnaire | E06-E07 (données V7 relues intactes) ; Playwright (fiche, modification, carte BTP, signature) |
| PostgREST | pile `employes-pile-locale` (vrai PostgREST v12 derrière le routeur). **Contre-épreuve** sur une base sans `…0806` : les 2 témoins `@avant` prouvent la fuite d'origine |
| Export RGPD filtré | `export_rgpd_section_autorisee`, pgTAP, E08, DB verify 33 |
| `employes_fiche` | vue `security_barrier` : ligne = membre actif ET (accès / gestion / soi) ; notes = gestion ; DB verify 33 |

## 12. Relevé & Métré

| Exigence | Preuve V8 |
|---|---|
| pgTAP Lots 2 → 9 | 66, 70, 74, 67, 40, 51, **67**, **84** : tous propres (Lots 2-7 identiques à V7) ; surface 32/32, fondation, capture, recovery, purge RGPD propres |
| Playwright Lots 2 → 9 + Atelier (une passe, pile réelle) | **107/107** en 14,3 min : 4 + 6 + 19 + 17 + 16 + 15 + **12** + **12** + Atelier 6. Lot 8 : métré serveur, revêtements, ajustements, cotations, exports CSV / GP / impression, versioning, sécurité, tablette, perf 50 / 200 / 500 pièces. Lot 9 : takeoff, formules fermées, ajustements, existant / dépose / neuf, synthèse, bibliothèque, anomalies, versioning, sécurité, tablette, perf 100 × 50 et 1 000 × 5 (5 000 lignes) |
| Vitest | Tools 2 150 ; `releve-domain` (parité SQL Lot 8 et Lot 9 **sur les migrations renumérotées**) dans GP |
| Plans existants | upgrade L01-L08 |
| DB verify | 22 (15 tables sous RLS), 30 (Lot 7), **35** (Lots 8-9) |

## 13. Applications

| App | typecheck | lint | Vitest | build |
|---|---|---|---|---|
| Gestion Pro (+ `releve-domain`, `email`, `incident-control`, `application-access`) | ✅ | ✅ (0 erreur, 15 avertissements comme V7) | ✅ **2 588**, 36 ignorés | ✅ |
| Tools | ✅ | ✅ | ✅ **2 150** | ✅ |
| Colors | ✅ | ✅ | ✅ **431** | ✅ |
| Réserves | ✅ | ✅ | ✅ **226** (dont 11 témoins REDTEAM-V2) | ✅ |
| Studio | ✅ (+ `typecheck:e2e-dedicated`) | ✅ | ✅ **343** | ✅ |
| Worker `studio-video` | ✅ | — | ✅ **42/42** (FFmpeg système + OpenCV 4.14 ; une 1ʳᵉ passe sans OpenCV, puis avec OpenCV 5.0 où `CascadeClassifier` a été déplacé, était invalide) | — |

Studio reste **OFF** pour la première Preview.

## 14. Playwright

Playwright 1.62.1 + Chromium 1194. Chaque pile tourne sur une base PostgreSQL 16 **neuve au train V8**
(371). Les piles sont lancées l'une après l'autre. Variables de recette : valeurs factices générées
pour la session, jamais écrites dans le dépôt.

| Recette | Pile | V7 | **V8** |
|---|---|---|---|
| Relevé Lots 2→9 + Atelier | `releve_e2e_stack.sh`, Tools `next dev --webpack` | 83 | ✅ **107/107** |
| Réserves (v3, v4 listes-PDF, v4 mobile, v5 hors ligne, v6 sécurité, v6 performance) | `reserves-pile-locale` + charge V6 + passerelle, Réserves compilé | 59 | ✅ **59/59** |
| D-01 | idem, base neuve distincte | 7 | ✅ **7/7** |
| GP ↔ Réserves | `gp-reserves-pile-locale`, GP compilé :3100 | 5/5 ×3 | ✅ **5/5 ×3** |
| Billing + réabonnement Stripe + **Per-App** | idem, base neuve par passe | 6/6 ×2 (réabonnement) | ✅ **17/17 ×2** (6 + 6 + 5) |
| Colors (+ mobile) | `colors-pile-locale`, nuancier de recette | 73 | ✅ **75/75** |
| **Employés** (ciblé) | `employes-pile-locale` (vrai PostgREST) | — | ✅ **15/15** ; contre-épreuve sans `…0806` : 2/2 `@avant` |
| Studio Dedicated E2E | `e2e-dedicated/run.sh` (PG ×2, GoTrue ×2, PostgREST ×2, storage-api, Redis, worker) | 21/21 | ✅ **21/21**, canaris **5/5** |

**Passes invalides, non comptées** (causes d'environnement ou de harnais ; aucun code applicatif modifié entre les passes) :

| Passe | Cause |
|---|---|
| Réserves | argument de filtre vide chargeant toutes les specs (même défaut que V7), puis invitation V3 à usage unique consommée → base reconstruite, chaîne complète dans l'ordre |
| Billing | Price IDs Stripe factices absents de l'environnement de recette (`configure` faux) → ajoutés |
| Colors | `COLORS_NUANCIER_FICHIER` omis |
| Build GP | artefact `.next/dev` corrompu laissé par le `next dev` du drill |
| Studio E2E | 1ʳᵉ et 2ᵉ passes : conflits réels §4.5, corrigés, puis passe complète verte |

## 15. Seeds

| Porte | Résultat V8 |
|---|---|
| `npm run test:seeds` | ✅ **48/48** : + complément V7 → V8 (`CI_ONLY`, `upgrade-harness`), + décor employés (`CI_ONLY`, `pgtap`) |
| `npm run verify:seeds` (base fraîche **371**, seul sur le cluster) | ✅ **`ALL ACTIVE SEEDS QUALIFIED — 16/16 seeds qualifiés sur 371 migrations`** |

## 16. Attendus du train (synchronisés après convergence complète)

| Élément | V7 | V8 |
|---|---|---|
| Migrations / dernière | 359 / `20260928000701` | **371 / `20260928000812`** (`sync:train-expectations`) |
| DB verify | 30 contrôles | **37** : 31 cycle commercial, 32 Per-App, 33 Employés, **34** mode sûr, **35** Relevé 8-9, **36** red team V2, **37** recalcul des devis ; 4, 5, 22 réalignés (§4.7) |
| DB verify local | GO | `db-verify.mjs --local-harness --before-owner` sur fresh V8 → **`GO : base Preview conforme.`** (préflight 21 / 0 bloquant, RLS, 19 buckets). Sur fresh V7 → **NO-GO explicite sur les seuls contrôles V8**, sans erreur SQL |
| Fonctions service-role only | 37 | **39** : + `synchroniser_statut_commercial_application_service` (webhook d'application Per-App) et `finaliser_evenement_webhook_stripe_service` (fin de webhook Stripe). Les moteurs internes Lots 8-9 (`…_calcul`) restent fermés à l'API (DB verify 35) sans être des RPC serveur |
| Buckets | 19 | **19** |
| Pack / runbook | ref V7 | ref V8 (`claude/sleepy-cannon-6je2vo`, à publier en `integration/elsatia-canonical-train-v8`), mode sûr, 39 RPC ; Studio OFF |

**Chiffres historiques** : les rapports V3, V4, V5, V6 et **V7** sont **inchangés** (340 / 352 / 355 / 358 / 359).
`test:preview-pack` (**31/31**) reçoit un test de plus :
- chiffres V7 figés (359, `…0701`, 30 contrôles, 37 RPC) ;
- aucun marqueur actif ;
- aucun rapport de train réécrit, celui-ci compris.

`upgrade_snapshot.py` n'ajoute ses tables V8 que sous `UPGRADE_SNAPSHOT_V8=1` : les harnais V3 → V7 rejouent exactement leurs chiffres.

Autres portes :

| Porte | Résultat |
|---|---|
| `verify:migrations` | ✅ 371 · dédié 23 |
| `verify:train-expectations` | ✅ |
| `test:migration-targets` | ✅ 7/7 |
| `test:preflight-preview` | ✅ 5/5 |
| Scripts Stripe (ordering, trial, resubscription) | ✅ |
| `verify:env-manifest` | ✅ (14 DECISION_REQUIRED, inchangé) |
| `test:env-manifest` | ✅ 67/67 |
| `verify:secrets` | ✅ |
| `test:smoke-email` | ✅ 13/13 |
| `test:dr-guard` | ✅ 10/10 |
| `test:incident-drill` | ✅ 6/6 |

## 17. DECISION_REQUIRED et limites

| ID | Nature | État | Effet |
|---|---|---|---|
| `DECISION_REQUIRED:V8-MIGRATION-RENUMBERING` | technique | **décidé (mission)** | bloc `…0801-0812` ; Studio dédié `…0929 170000/180000` |
| `DECISION_REQUIRED:V8-INCIDENT-PERAPP-SOCLE` | technique | **décidé (conservateur, règle Per-App)** | tables de l'état commercial par application au socle (§4.2) |
| `DECISION_REQUIRED:V8-STUDIO-MOTIF` | technique | **décidé (règle conservée)** | fixtures de test motivées ; aucune règle assouplie (§4.4) |
| `DECISION_REQUIRED:V8-INTEGRATION-BRANCH` | propriétaire | **ouvert** | publier `integration/elsatia-canonical-train-v8` au commit de `claude/sleepy-cannon-6je2vo` (cette mission ne pousse que sa branche désignée) |
| `DECISION_REQUIRED:V8-PILOTE-ESSAI-ECHU` | propriétaire / facturation | **ouvert** | §8 |
| `DECISION_REQUIRED:V8-PERF-C1` | technique | **ouvert** | re-dériver C1 sur les corps **V8** (Billing + Per-App), avec l'équivalence différentielle refaite contre V8 : jamais depuis V5 |
| Performance B1 (rate-limit IP), B2 (`max_rows` 1 000), B3 (mémoire Next), B4 (facture brouillon) | produit / technique | **ouverts, non masqués** | §5 |
| C3 / C4 en V8 | mesure | non remesurés sur jeu volumétrique | preuves de la branche source + Vitest ; à remesurer avec `scripts/perf/baseline-v1` |
| Billing : `CONTRATS-PRIX-69`, `ESSAI-PAR-SIREN`, `DESCENTE-PORTAIL`, TVA / identité vendeur | propriétaire | ouverts (hérités) | contrats 69 € **non modifiés** (upgrade B03) |
| Per-App : `MIGRATION-REVUE`, `FACTURATION-STRIPE`, `UI-PLATEFORME`, `OFFRES-GROUPEES` | propriétaire | ouverts (hérités) | revue du rapport d'impact sur la base cible avant Preview |
| Red team V2 §7 | produit / technique | ouverts (hérités) | §9 |
| E-mail A-1, A-3, A-8, A-9 ; fournisseur mail Studio | propriétaire | ouverts (hérités V7) | aucun envoi activé |
| RGPD contrats (durée, départ, photos) ; Studio (activation, hébergement) | juridique / propriétaire | ouverts (hérités) | fail-closed ; **Studio OFF** |
| DR V2 | mission séparée | non rejoué ici | le drill DR s'appuie sur le harnais d'upgrade du train courant ; à adapter à `upgrade-v7-v8.sh` (`DR2_UPGRADE_SCRIPT`, `DR2_METIER_*`) lors de la prochaine qualification DR |
| Stripe Test réel, Portail, Storage / GoTrue / e-mail hébergés | exécution distante | NOT PROVEN localement (hérité) | pack Preview |
| Harnais locaux concurrents | outillage | constat (hérité) | exécution séquentielle ; `pkill -f` sur un motif contenu dans la commande courante tue le shell appelant (utiliser les fichiers pid) |

## 18. Reproduire

```bash
git fetch --all --prune && git checkout claude/sleepy-cannon-6je2vo && npm ci
for a in tools colors reserves studio; do npm ci --prefix apps/$a; done; npm ci --prefix workers/studio-video
npm ci --prefix tests/e2e/colors-pile-locale
pg_ctlcluster 16 main start ; apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl postgresql-plpython3-16 python3-nacl ffmpeg

scripts/local-postgres-bootstrap/rebuild_db.sh v8_fresh                         # 371/371
scripts/qualification/pgtap-run-v3.sh v8_fresh                                  # 154/163 propres, 8 059 ok
scripts/qualification/upgrade-v7-v8.sh upg_v7_v8 v8_fresh                       # §7 : 0 écart silencieux, 47/47
apps/studio/scripts/dedicated-db-check.sh                                       # 23 migrations, 864 ok
scripts/qualification/v8/studio-dedicated-upgrade-v7-v8.sh                      # 21 → 23 identique
E2E_BIN=<gotrue v2.192.0, postgrest, storage-src> STUDIO_FFMPEG_PATH=/usr/bin/ffmpeg STUDIO_ANALYSIS_PYTHON=<python + opencv 4.x> \
  apps/studio/e2e-dedicated/run.sh                                              # 21/21, canaris 5/5
npm run incident:drill                                                          # 91/91
createdb -T v8_fresh conc && for s in per-app-suspension billing-lifecycle stripe-resubscription stripe-trial stripe-ordering; do
  scripts/qualification/$s-concurrency.sh conc; done                            # 27 / 22 / 20 / 7 / 15
cd supabase/tests && psql -d <copie de v8_fresh> -f ../../scripts/qualification/v8/perf_c2_devis_recalc_bench.sql   # C2
SEEDS_DR_PGPASSWORD=… node scripts/seeds/verify-seeds.mjs                       # 16/16 (seul sur le cluster)
npm run typecheck && npm run lint && npm test && npm --prefix apps/studio run test
npm run verify:migrations && npm run verify:train-expectations && npm run test:preview-pack && npm run test:seeds
ELSATIA_PREVIEW_DB_URL=postgresql://…@127.0.0.1/v8_fresh node scripts/preview/db-verify.mjs --local-harness --before-owner   # GO
# Playwright : §14 (piles releve_e2e_stack.sh, reserves-, gp-reserves-, colors-, employes-pile-locale)
```

## 19. Fichiers V8 (hors lots portés)

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20260928000801…0810_*.sql`, `apps/studio/supabase/migrations/20260929170000_*`, `…180000_*` | renommées (en-tête de renumérotation, corps inchangé) |
| `supabase/migrations/20260928000811_v8_convergence_incident_gardes_v1.sql`, `supabase/tests/v8_convergence_incident_gardes_v1.test.sql` | convergence mode sûr × lots |
| `supabase/migrations/20260928000812_devis_recalc_totaux_par_instruction_v1.sql`, `supabase/tests/devis_recalc_totaux_par_instruction_v1.test.sql`, `src/app/(app)/planning/page.tsx`, `src/components/ModifierAffectationDiffere.*`, `src/app/(app)/chantiers/[id]/documents/page.tsx`, `scripts/qualification/v8/perf_c2_devis_recalc_bench.sql` | Performance C2-C4 |
| `scripts/qualification/upgrade-v7-v8.sh`, `scripts/local-postgres-bootstrap/upgrade_v7_v8_{seed_complement,business_checks}.sql`, `upgrade_v7_v8_classify.py`, `upgrade_snapshot.py` | harnais d'upgrade V7 → V8 |
| `scripts/qualification/v8/studio-dedicated-upgrade-v7-v8.sh` | upgrade de la chaîne dédiée |
| `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` | contrôles 31-37, 4 / 5 / 22 réalignés, attendus régénérés |
| `scripts/preview/db-verify.mjs`, `preview-pack.test.mjs` | 39 RPC service-role only ; chiffres V7 figés |
| `apps/reserves/src/app/auth/callback/route.{ts,test.ts}`, `apps/reserves/src/app/actions.ts`, `src/lib/email.ts` | réconciliations Security V2 × V7 |
| `apps/studio/supabase/rpc-classification.json`, `apps/studio/e2e-dedicated/specs/{00,06}-*.spec.ts`, `apps/studio/supabase/tests/studio_post_h_guard_rgpd.test.sql` | Studio dédié × mode sûr |
| `scripts/incident/scenarios.mjs` | drill S10 × garde e-mail V7 |
| `config/env-manifest.json`, `docs/qualification/preview-pack/ENV_INVENTORY_PREVIEW_V1.generated.md`, `scripts/seeds/registry.mjs` | manifeste et registre (défauts hérités du lot E, complément V8) |
| `scripts/qualification/per-app-suspension-upgrade.sh`, `scripts/qualification/employes-donnees-personnelles-http.sh`, `tests/e2e/employes-pile-locale/preparer-base.sh`, références de tests et runbooks | outillage de lot aligné sur la numérotation V8 |
| `docs/qualification/ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md`, `docs/runbooks/ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md` | ref V8, attendus, mode sûr, Studio OFF |
