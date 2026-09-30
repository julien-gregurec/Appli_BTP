# ELSATIA — Per-App Commercial Suspension & Entitlement Enforcement V1

| | |
|---|---|
| Date | 2026-09-28 |
| Base | `claude/busy-darwin-tlpi3p` @ `d43e1c12` (verdict `ELSATIA BILLING LOCALLY QUALIFIED`, 361 migrations) — **non modifiée** |
| Branche | `claude/kind-tesla-0i0818` (repartie de la base) |
| Migrations | **362** (+1, additive) : `20260929000801_per_app_commercial_suspension_v1.sql` |
| Moteur | PostgreSQL 16.13 réel + pgTAP 1.3 (`scripts/local-postgres-bootstrap`, sans Docker), Node 22 / Vitest 4, Playwright 1.62 + Chromium 1194, passerelle Supabase locale du dépôt (RLS réelle sous le rôle du JWT), applications compilées (`next build` + `next start`) |
| Stripe | **Local / mock uniquement.** Aucun appel Stripe. Aucune Preview, aucune Production, aucun merge. |
| Décision appliquée | `DECISION_REQUIRED:BILLING-SUSPENSION-PAR-APPLICATION` (Billing V1 §12), tranchée par le propriétaire : **suspension commerciale = par application ; suspension plateforme / sécurité = globale, uniquement si explicitement déclenchée.** |

## 0. Verdict

```
ELSATIA PER-APP SUSPENSION LOCALLY QUALIFIED
```

Un incident commercial Gestion Pro (impayé, `past_due` / `unpaid`, annulation, essai expiré,
impayé signalé échu) **ne coupe plus que Gestion Pro**. Tools (organisation), Colors, Réserves
et le rôle Relevé suivent **leur propre** état commercial. Une suspension plateforme / sécurité
coupe **toutes** les applications de l'entreprise, mais seulement quand elle est **posée
explicitement** (rôle plateforme `total` + AAL2, motif obligatoire, journalisée) ; aucun
impayé, webhook ou cron ne la pose. La décision est prise **en base** (RLS, RPC, Storage), pas
seulement dans l'interface.

Preuves principales :

| Porte | Résultat | Contre-épreuve (prédicats V6 remis en place) |
|---|---|---|
| pgTAP `per_app_commercial_suspension_v1` (matrice 140 entreprises + 8 sections) | **2 925 / 2 925** | **206 échecs** (dans les deux sens) |
| Suites existantes adaptées (D-01, Réserves complète, Colors v16, Billing) | 99/99 · 183/183 · 94/94 · 190/190 | 42 · 5 · 13 · 20 échecs |
| pgTAP complet (154 fichiers) ×2 | **145/154, 7 578 ok** ×2 ; les 9 non propres = **exactement** la dette héritée de la base, 0 régression | — |
| Concurrence per-app (P1-P5, 16 lecteurs × 150 observations) ×2 | **27/27** ×2 | **23/27** (552 observations Tools/Colors/Réserves fermés à tort pendant le cycle GP) |
| Concurrence existante ×2 | billing 22/22, réabonnement 20/20, essai 7/7, ordre 15/15 | — |
| Upgrade 361 → 362 (comptes représentatifs) | **12/12** : 0 perte, gains = rapport d'impact = rapport de la migration, schéma = neuf | — |
| Vitest | GP 2 328 (+9), Tools 2 118, Réserves 186, Colors 431, Studio 291 : 0 échec | — |
| Playwright Colors (navigateur, pile locale) | **75/75** (73 + 2 nouveaux) | — |
| Playwright GP / Réserves (`per-app-suspension` nouveau + billing, réabonnement, GP ↔ Réserves, D-01) | **29/29 ×2** | — |
| DB verify | **31 contrôles** (nouveau 31), bloquants tous verts ; 31 **rouge** avant la migration | — |

---

## 1. Constat de départ (base `d43e1c12`)

`a_acces_application(entreprise, application)` — décision centrale de Tools, Colors, Réserves
et Relevé — exigeait `est_membre_actif(entreprise)`. Or `est_membre_actif` embarque l'état
commercial **de Gestion Pro** : `abonnement_statut ∉ {suspendu, annule}`, suspension programmée
pour impayé non échue, essai non expiré (B-4). Onze autres fonctions Réserves / Relevé et trois
policies l'appelaient directement ; `reserves_hote_ecriture_ouverte` (D-01) relisait
`abonnement_statut` et `suspension_prevue_at`.

Conséquence mesurée (matrice Billing V1 §20, contre-épreuve §13) : GP impayé ⇒ Tools organisation
redescendait en Free, Colors et Réserves fermés, invités Réserves gelés, alors que ces droits
sont matérialisés séparément (`acces_applications_entreprises`). Aucune colonne ne distinguait
une suspension de sécurité d'un impayé (`suspension_prevue_at` servait aux deux).

## 2. États

**Compte (entreprise)** — colonnes dédiées `entreprises.suspension_globale_at / _motif / _par` :

| État | Définition |
|---|---|
| `ACCOUNT_GLOBAL_ACTIVE` | `suspension_globale_at` nulle ou future |
| `ACCOUNT_GLOBAL_SUSPENDED` | `suspension_globale_at <= now()` |

**Application** — 7 états :

| État | Ouvert | Gestion Pro (dérivé de `entreprises`, aucune nouvelle source) | Autres applications (`acces_applications_entreprises.statut_commercial`) |
|---|---|---|---|
| `entitled` | ✅ | — | droit accordé (manuel, invitation, **toutes les lignes existantes à la migration**) |
| `trial` | ✅ jusqu'à `essai_fin` exclue | `essai` non expiré | Stripe `trialing` (date de fin obligatoire) |
| `active` | ✅ | `actif` (y compris impayé **signalé** dont l'échéance est future) | Stripe `active` |
| `past_due` | ❌ | — (Stripe `past_due` → `suspendu` localement) | Stripe `past_due` |
| `unpaid` | ❌ | impayé signalé **échu** (`suspension_prevue_at <= now()`) | Stripe `unpaid` |
| `cancelled` | ❌ | `annule` | Stripe `canceled`, `incomplete_expired` |
| `suspended` | ❌ | `suspendu`, **essai expiré** | Stripe `incomplete`, `paused`, essai d'application échu |

Fermé = suspension **immédiate**, sans délai de grâce : la décision Preview de GP (Billing V1
§7) est appliquée à l'identique aux autres applications. Une ligne retirée (`autorise = false`),
hors fenêtre `valide_du / valide_jusqu_au` ou d'une application inactive = **aucun droit**
(état `NULL`).

## 3. Décision d'accès (`20260929000801`)

```
est_membre_plateforme_actif(e) = session non révoquée
                                 ET ( support actif  OU  (membre actif ET compte non suspendu globalement) )
                                 — aucune condition commerciale

est_membre_actif(e)             = accès métier GESTION PRO (~150 policies GP, inchangées)
                                 = conditions commerciales GP d'avant (…703, à l'identique)
                                   + compte non suspendu globalement

a_acces_application(e, app)     = admin plateforme  OU
                                  ( est_membre_plateforme_actif(e)
                                    ET application_commercialement_ouverte(e, app)   ← état DE L'APPLICATION
                                    ET entitlement organisation ET habilitation personnelle )   ← inchangés

reserves_hote_ecriture_ouverte(h) = hôte non suspendu globalement ET Réserves de l'hôte ouvert   (D-01)
```

Fonctions converties (corps identiques, `est_membre_actif(` → `est_membre_plateforme_actif(`,
liste fermée ; la migration échoue si l'une ne contient plus la référence) :
`reserves_intervenant_courant`, `reserves_invitation_accepter`, `reserves_invitations_en_attente`,
`reserves_notifications_compteur`, `reserves_notifications_in_app`,
`reserves_notifications_marquer_lues`, `reserves_preferences_definir`, `reserves_preferences_lire`,
`reserves_rejoindre_intervention`, `tools_releve_contexte`, `tools_releve_role_courant`.
Policies : `reserves_annuaire_select`, `reserves_notifications_select`,
`acces_applications_entreprises_lecture` (les applications lisent leur propre ligne pour
expliquer un refus même quand GP est fermé).

**Ce qui reste volontairement lié à GP** (droit GP, pas droit de l'application) : pousser un
relevé vers GP (`sync-gp` → `a_permission`), lier un chantier / client GP à un relevé, importer
ou synchroniser un chantier GP dans Réserves (`a_permission`). Un GP fermé les refuse ; le reste
de l'application continue (pgTAP §R2).

Contrôle statique (pgTAP A12/A13) : **aucune** fonction ni policy `colors_*`, `reserves_*`,
`tools_*` ne lit encore `est_membre_actif`, `abonnement_statut` ou `suspension_prevue_at`.

## 4. Applications

| Application | Droit commercial | Cas « GP impayé » | Suspension globale | Preuve |
|---|---|---|---|---|
| **Gestion Pro** | `entreprises` (Stripe, essai, impayé) | ❌ métier ; chemin facturation admin ✅ | ❌ | pgTAP §X, §GP ; Playwright GP |
| **Tools** (organisation) | ligne `tools` | ✅ (palier Pro conservé) | ❌ (Free) | §X « palier Tools organisation » |
| **Tools** (personnel Free / Pro) | `entitlements_utilisateurs_elsatia` (utilisateur) | ✅ inchangé | ✅ inchangé (droit **personnel**, pas d'entreprise) | §X « Tools Pro PERSONNEL intact » |
| **Relevé Pro** | capacité `releve-metre` (personnelle, non commerciale) + rôle Relevé d'organisation | ✅ rôle et relevés ; ❌ `sync-gp` | ❌ rôle | §X « rôle Relevé », §R |
| **Colors** | ligne `colors` | ✅ | ❌ | §X ; Playwright Colors |
| **Réserves** | ligne `reserves` (payée, ou gratuite par invitation) | ✅ hôte et invité | ❌ ; invité d'un hôte suspendu : lecture seule | §X, §D |
| **Studio** | projet dédié, identité B + I1 (utilisateur) | ✅ aucun lien | voir §8 | §S ; chaîne dédiée |

## 5. Cas principal

| GP | Tools | Attendu | Mesuré |
|---|---|---|---|
| `past_due` / `unpaid` (Stripe) | payé (`active`) | GP bloqué, Tools accessible (Pro) | ✅ pgTAP « CAS PRINCIPAL » ; concurrence P1 ; Playwright GP |
| impayé signalé échu | payé | GP bloqué, Tools accessible | ✅ pgTAP « CAS PRINCIPAL (impayé signalé…) » |
| annulé | Colors / Réserves `entitled` | GP bloqué, autres ouverts | ✅ §X, §GP6 |

## 6. Suspension plateforme / sécurité

| Garantie | Preuve |
|---|---|
| Posée **uniquement** par `plateforme_suspendre_compte_global(e, motif)` : rôle `total` + AAL2, motif obligatoire, idempotente, journalisée (`historique_mutations_plateforme`, `suspension_globale`) ; levée par `plateforme_lever_suspension_globale` (journalisée) | pgTAP P1-P7 |
| Jamais déduite d'un impayé : `plateforme_signaler_impaye`, `appliquer_suspensions_impayes`, webhooks GP, webhook d'application, cron → colonne inchangée | P0, GP8, W24 ; concurrence P1 |
| Un admin tenant ne peut ni la poser ni la lever : ACL colonne (aucun `UPDATE`) **et** trigger `entreprises_proteger_suspension_globale` (vérifié ACL rouverte) | P1 |
| Coupe **toutes** les applications de l'entreprise, à la requête suivante, sans reconnexion ; levée idem | P4, P7 ; concurrence P4 ; Playwright GP / Colors |
| Cohérence inter-applications : aucune observation « mi-ouverte » pendant la bascule | concurrence P4 (2 400 observations, toutes « tout ouvert » ou « tout fermé ») |
| Programmée (future) : sans effet avant l'échéance | P8 |
| Motif jamais exposé au tenant (écran générique « Compte suspendu par ELSATIA », aucun bouton de paiement) | P5 ; Playwright GP |
| Accès support plateforme conservé (enquête), comme avant pour GP | par construction (`est_membre_plateforme_actif` : branche support, inchangée) ; **non testé isolément** dans ce lot |

Compatibilité : `suspension_prevue_at` reste **l'impayé manuel GP** (commercial). La ligne
« suspension plateforme échue » de la matrice Billing V1 désignait en réalité cette colonne ; elle
est renommée « impayé GP : suspension programmée échue » (§12).

## 7. Essai

- Un essai GP expiré ne supprime **aucun** droit indépendant : ni écriture, ni lecture fermée
  (pgTAP T1-T3, §X ; Playwright GP « essai GP expiré »). B-4 reste entier pour GP.
- Essai d'application (`trial` + `essai_fin`) : ouvert jusqu'à `essai_fin` exclue, fermé ensuite
  **pour cette application seule** (W12-W14) ; un essai sans date est refusé (W19, contrainte
  `acces_applications_essai_borne`).

## 8. Studio (B + I1)

Studio vit dans un projet Supabase **dédié** ; l'entrée passe par le pont I1
(`/identity/studio/handoff`), qui relit l'état du **compte utilisateur**
(`elsatia_identity_prepare_handoff` : `active` / `disabled` / `deleted`) et la politique Studio
(`studioEntitlement`, `STUDIO_ACCESS_MODE`). Aucun code ni aucune donnée Studio ne dépend d'une
entreprise, et aucune application ne dépend du droit Studio.

| Garantie | Preuve |
|---|---|
| Un état commercial GP (annulé, impayé) ou une suspension **d'entreprise** ne modifie pas le passage Studio | pgTAP §S (4 comptes : GP annulé / impayé × global actif / suspendu) |
| La suspension plateforme d'une **identité** (bannissement) coupe Studio | pgTAP S2 (`disabled`) ; cycle de vie I1 existant |
| Perte du droit Studio (`STUDIO_ACCESS_MODE`, liste) : coupe Studio seul — aucune autre décision ne lit ce droit | code (`studioEntitlement` n'est appelé que par le pont I1) ; Vitest identité |
| B + I1 non cassé | chaîne dédiée **14 migrations, 543 ok / 0** ; Vitest Studio **291/291** ; Vitest `packages/elsatia-identity` (racine) vert |

Limite : la « pile réelle deux projets » (GoTrue ×2, PostgREST ×2) n'est pas disponible dans ce
conteneur ; ses 70 tests réels sont **ignorés** (skip) et restent **NOT PROVEN ici** — aucun fichier
d'identité n'a été modifié.

## 9. Chemin facturation admin (application suspendue)

`etat_commercial_applications(entreprise)` (SECURITY DEFINER, lecture seule) : pour chaque
application, état commercial, ouverture, état global, fin d'essai, `peut_gerer`. Ouvert à tout
membre actif **même application fermée ou compte suspendu globalement** ; `peut_gerer` =
`gerer_parametres` ou support (même règle que `etat_reabonnement_entreprise`). Aucun identifiant
Stripe, aucun motif de sécurité, aucune donnée métier (pgTAP §B, B7 ; P5).

| Besoin | Admin | Membre | Accès métier |
|---|---|---|---|
| État par application | ✅ | ✅ (lecture) | ❌ (B3 GP, B4 Colors) |
| Paiement / Portail / réactivation GP | ✅ chemins existants (`etat_reabonnement_entreprise`, Portail, Checkout) | ❌ | ❌ |
| Paiement d'une autre application | ✅ `peut_gerer` ; flux Stripe par application = **mock** (§10) | ❌ | ❌ |
| Suspension globale | ✅ état visible, **aucun** bouton de paiement (un paiement ne lève pas une mesure de sécurité) | ✅ | ❌ |

Interface : `/abonnement-suspendu` affiche « Vos autres applications ELSATIA » avec l'état propre
de chacune (« la suspension de Gestion Pro ne les coupe pas »), et l'écran dédié « Compte
suspendu par ELSATIA » (`?motif=suspension_plateforme`, routé par `getContexteEntreprise` via
`contexte_abonnement_courant.suspension_globale`). Colors et Réserves expliquent un refus par
l'état commercial **de leur application** (`diagnostiquerRefusApplication`, paquet partagé
`@elsatia/application-access`).

## 10. Stripe (mock) : un webhook ne modifie que les droits concernés

| Flux | Écrit | N'écrit jamais | Preuve |
|---|---|---|---|
| GP (`synchroniser_abonnement_stripe_*`, `appliquer_evenement_facture_*`) — **inchangé** | `entreprises`, contrats, factures, journal d'ordre | `acces_applications_entreprises`, audit d'application, suspension globale | §GP : checkout → paid → failed → unpaid → paid → deleted → réabonnement, empreinte des lignes d'application **identique** octet pour octet (`updated_at` compris), 0 ligne d'audit |
| Application (`synchroniser_statut_commercial_application_service`, **nouveau**, `service_role` seul) | la ligne (entreprise, application) visée, son journal (`evenements_commerciaux_applications`), une ligne d'audit par décision appliquée | `entreprises`, autres applications ; refuse `gestion_pro` | §W : W2 (état GP identique), W17 |

Règles du webhook d'application, alignées sur GP : idempotence par `evenement_id` (W3, P5) ;
filigrane (événement antérieur = `perime`, W4) ; terminaison irréversible, appliquée même livrée en
retard, jamais rouverte par la même subscription (W7-W11, même règle que B-1) ; une autre
subscription vivante n'a pas autorité (W6) ; réabonnement par nouvelle subscription (W10) ;
droit créé seulement par un état ouvrant (W15-W16) ; tout refus motivé (W23).

## 11. Migration et comptes dont le comportement change

**Compatibilité** : toutes les lignes existantes reçoivent `statut_commercial = 'entitled'`,
aucune suspension globale n'est posée, `est_membre_actif` garde ses conditions GP d'avant.
**Aucune perte de droit** : la migration calcule l'accès de chaque ligne avant / après et
**échoue** si une seule perte apparaît. Les seuls changements sont des **gains** : une
application non GP autorisée, jusque-là fermée parce que GP est fermé, redevient accessible
(et les intervenants Réserves d'un hôte dans ce cas repassent en écriture).

Rapport :
- **avant** la migration, en lecture seule : `docs/runbooks/sql/ELSATIA_PER_APP_SUSPENSION_IMPACT_V1.sql`
  (liste + synthèse par motif de fermeture GP et application, utilisateurs habilités,
  intervenants Réserves concernés) ;
- **par** la migration : table `public.rapport_migration_suspension_par_app_v1` (lisible par la
  plateforme seulement), contrôlée par le DB verify 31.

Qualification d'upgrade (`scripts/qualification/per-app-suspension-upgrade.sh`, 12/12) sur une
base à 361 migrations portant 9 comptes représentatifs :

| Compte | GP | Droits | Avant | Après | Changement |
|---|---|---|---|---|---|
| U1 | suspendu | Tools, Colors, Réserves | ❌❌❌ | ✅✅✅ | gain ×3 |
| U2 | annulé | Réserves + 1 intervenant actif | ❌ ; intervenant en lecture seule | ✅ ; intervenant en écriture | gain (1 intervenant) |
| U3 | essai expiré | Colors | ❌ | ✅ | gain |
| U4 | impayé signalé échu | Tools | ❌ | ✅ | gain |
| U5 | actif | Tools, Colors | ✅✅ | ✅✅ | — |
| U6 | suspendu | Colors **retiré** | ❌ | ❌ | — |
| U7 | suspendu | Tools **échu** | ❌ | ❌ | — |
| U8 | impayé signalé, échéance future | Réserves | ✅ | ✅ | — |

Accès mesuré **réellement** par utilisateur (RLS) avant / après ; gains = rapport d'impact =
rapport de la migration ; schéma upgradé identique au neuf (`pg_dump -s`, ACL comprises) ;
rejouer la migration échoue proprement (colonne existante).

**Action propriétaire avant Preview/Production** (`DECISION_REQUIRED:PER-APP-MIGRATION-REVUE`) :
exécuter le rapport d'impact sur la base cible et revoir chaque ligne. Si une fermeture GP était
en réalité une mesure de sécurité, poser une suspension **globale** explicite après la migration.

## 12. Suites existantes modifiées (déclencheurs seulement, aucune règle affaiblie)

| Suite | Avant | Après | Nature |
|---|---|---|---|
| `reserves_host_suspension_policy_v1` (D-01) | hôte fermé via `abonnement_statut` / `suspension_prevue_at` | hôte fermé via **état Réserves** (`suspended`, `cancelled`) ou **suspension globale** ; +7.11 / 7.12 : un incident GP seul ne gèle plus l'invité | 97 → **99** assertions, toutes les assertions D-01 conservées |
| `reserves_full_local_qualification_v1` §8 | tenant suspendu via GP | via état Réserves / suspension globale ; +8.12b, +8.19b (GP seul : Réserves visible) | 181 → **183** |
| `colors_suspension_application_v16` §D | tenant suspendu / annulé / échu via GP | via état Colors / suspension globale ; +2 : GP seul ne coupe pas Colors | 92 → **94** |
| `billing_subscription_lifecycle_v1` §M | Tools / Colors / Réserves = accès GP | indépendants de GP dans les 10 états ; M9 / M10 renommés (c'était l'impayé manuel, pas une suspension plateforme) | 190 (inchangé en nombre) |
| Playwright `colors-suspension-session` | « tenant suspendu » via GP | via état Colors ; +2 tests (GP seul → Colors ouvert ; suspension globale → Colors fermé) | 10 → 12 |
| Playwright `reserves-host-suspension` | hôte suspendu par `PATCH entreprises` | hôte suspendu par le **webhook d'application** Réserves (clé serveur) | inchangé en nombre |

Sur la base **sans** la migration, chacune de ces suites échoue exactement sur ses assertions de
portée (§0, contre-épreuve).

## 13. Matrice (pgTAP §X) et contre-épreuve

2 états globaux × 7 états GP × 10 états d'application ; chaque application traverse les 10 états
sous chaque couple (global, GP), avec des combinaisons croisées différentes (Tools = s, Colors =
s+3, Réserves = s+7 mod 10) : **140 entreprises**, un admin (habilité partout, Tools Pro
personnel) et un membre (Tools, Colors ; pas Réserves). L'**oracle** est écrit dans le test
(tables `etats_gp`, `etats_app`), sans appeler les fonctions testées.

Mesures par entreprise (20) : GP métier admin / membre, permission métier, Tools admin / membre,
palier Tools organisation, Tools Pro **personnel**, rôle Relevé, Colors admin / membre, Réserves
admin / membre non habilité, appartenance plateforme, chemin facturation (admin gère / membre
voit), états commerciaux exposés GP / Tools / Colors / Réserves, ouverture Colors exposée = accès
réel, état global exposé.

Synthèse (la matrice complète est l'ensemble des 2 800 assertions nommées `X<k> [global gp tools colors reserves]`) :

| Global | GP | Tools / Colors / Réserves (état propre) | GP métier | Application |
|---|---|---|---|---|
| ACTIVE | ouvert (essai, actif, impayé à venir) | ouvert (entitled, trial, active) | ✅ | ✅ |
| ACTIVE | ouvert | fermé (past_due, unpaid, cancelled, suspended, essai échu) / absent / retiré | ✅ | ❌ |
| ACTIVE | fermé (essai expiré, impayé échu, suspendu, annulé) | ouvert | ❌ | **✅** (V6 : ❌) |
| ACTIVE | fermé | fermé / absent / retiré | ❌ | ❌ |
| SUSPENDED | tout état | tout état | ❌ | ❌ (Tools Pro personnel conservé) |
| tout | tout | tout | — | facturation : admin gère, membre voit ; Réserves membre non habilité : ❌ |

Contre-épreuve : les 4 prédicats V6 (`a_acces_application`, `reserves_hote_ecriture_ouverte`,
`reserves_intervenant_courant`, `tools_releve_role_courant`) remis sur la base finale → **206
échecs** : les 12 combinaisons « GP fermé, application ouverte » et les 15 « GP ouvert,
application fermée » par application (27 × 7 mesures), plus les cas nommés (cas principal, D2,
D3, D5, D6, GP3/4/6, W2, W12-W14, T1, R1, R3, A12).

## 14. Concurrence et navigateur

**Concurrence** (`scripts/qualification/per-app-suspension-concurrency.sh`, sessions PostgreSQL
réelles, lecteurs sous `authenticated` + JWT, une requête = un instantané des 4 accès) :

| Scénario | Invariant | Passe 1 | Passe 2 |
|---|---|---|---|
| P1 impayé → réactivation → annulation → réabonnement GP, chaque événement ×3 en parallèle, 16 lecteurs × 150 | Tools / Colors / Réserves **jamais** observés fermés (2 400 observations, GP observé fermé) ; lignes de droit identiques ; GP final rouvert ; aucune suspension globale | ✅ | ✅ |
| P2 Tools `past_due` / `active` / `canceled` ×4 en désordre, puis réabonnement ×4 | GP / Colors / Réserves jamais fermés ; Tools `cancelled` quel que soit l'ordre, puis réabonné une seule fois ; 1 décision par événement ; ligne GP intacte | ✅ | ✅ |
| P3 GP impayé + Colors `past_due` + Tools réabonné, simultanés, même entreprise | chaque application dans **son** état (GP ❌, Tools ✅, Colors ❌, Réserves ✅) | ✅ | ✅ |
| P4 suspension globale puis levée pendant 2 400 lectures | jamais de mélange ouvert / fermé ; suspension observée ; levée sans reconnexion | ✅ | ✅ |
| P5 même événement d'application ×16 | 1 `applique`, 15 `deja_traite`, 1 ligne d'audit | ✅ | ✅ |

**27/27 ×2**, aucune erreur ni interblocage. Sur les prédicats V6 : **23/27**.

**Navigateur** (Playwright 1.62, Chromium 1194, applications compilées, passerelle locale) :

| Spec | Prouve | Passe 1 | Passe 2 |
|---|---|---|---|
| `per-app-suspension` (**nouveau**, GP) | référence ; **cas principal** : GP impayé → `/abonnement-suspendu` avec « Vos autres applications ELSATIA » (3 × « Accès accordé ») et « Payer » pour l'admin, API : 0 chantier, GP ❌ / Tools ✅ / Colors ✅ / Réserves ✅, membre sans gestion ; Réserves `past_due` par le **webhook d'application** → seul Réserves ❌, GP ✅, puis réactivé ; **suspension globale** → écran « Compte suspendu par ELSATIA », motif non affiché, aucun bouton de paiement, 4 × ❌ par l'API, levée sans reconnexion ; essai GP expiré → apps indépendantes ✅ | 5/5 | 5/5 |
| `colors-suspension-session` (Colors) | + GP suspendu seul → inventaire et export Colors ouverts ; + suspension globale → Colors fermé ; « tenant suspendu » par l'état Colors → fermé, aucune écriture | 12/12 | (dans 75/75) |
| suite Colors complète | non-régression | **75/75** | — |
| `billing-lifecycle` | non-régression Billing V1 (B-4 écran + API, paiement échoué, B-1, réactivation) | 6/6 | 6/6 |
| `stripe-reabonnement` | non-régression réabonnement | 6/6 | 6/6 |
| `gp-reserves-integration` | non-régression GP ↔ Réserves | 5/5 | 5/5 |
| `reserves-host-suspension` (D-01) | hôte suspendu **par le webhook Réserves** : lecture conservée, écriture refusée (écran, RPC 403, `PATCH`, file hors ligne), rétablissement sans reconnexion ni nouvelle invitation | 7/7 | 7/7 |

GP et Réserves compilés (`next build` + `next start`), base `gpres_e2e` préparée à neuf avant
chaque passe (+ décor D-01), `ABONNEMENTS_PUBLICS_OUVERTS=true` et variables `STRIPE_*`
**factices** (aucun appel Stripe), plafond de connexion remis à zéro entre les specs (comme en
Billing V1). Non rejoués : specs Réserves V3–V6 et Tools Relevé (aucun code de ces écrans
modifié ; le diagnostic Réserves est couvert par Vitest).

## 15. Non-régression

| Domaine | Résultat |
|---|---|
| Billing lifecycle | pgTAP 190/190 ; harnais 22/22 ×2 ; Playwright billing + réabonnement 12/12 ×2 |
| Stripe (ordre, essai, réabonnement, closure, ACL webhook) | pgTAP 137/137, 82/82 + 24/24, 99/99, 44/44, 51/51 ; harnais 15/15, 7/7, 20/20 ×2 |
| Réserves D-01 | pgTAP 99/99 ; Playwright 7/7 ×2 |
| GP ↔ Réserves | pgTAP suites Réserves (8 fichiers) vertes ; Playwright 5/5 ×2 |
| Tools | pgTAP Tools / Relevé verts (hors `elsatia_tools_cloud_sync_entitlement_closure_v1`, dette héritée identique) ; Vitest 2 118 |
| Colors | pgTAP 94/94 (+ suites Colors vertes) ; Vitest 431 ; Playwright **75/75** |
| Studio identity | chaîne dédiée 543 ok ; Vitest Studio 291 ; identité (Vitest racine) verte ; pile réelle deux projets : NOT PROVEN ici (§8) |
| pgTAP complet | 145/154, 7 578 ok, ×2 ; 9 non propres = dette de la base (7 `studio_*` du projet partagé, `platform_stripe_state_attestation_r72`, `elsatia_tools_cloud_sync_entitlement_closure_v1`), mêmes compteurs qu'avant |
| Typecheck / lint | 0 erreur (4 applications) ; 15 avertissements préexistants, aucun dans les fichiers touchés |
| Vitest | GP 2 328 (2 319 + 9), Tools 2 118, Réserves 186, Colors 431 |
| Outillage | `verify:migrations` 362, `verify:train-expectations` (362, 31 contrôles, pack et runbook régénérés), `test:preview-pack` 29/29, `test:env-manifest` 67/67, `verify:env-manifest`, `verify:secrets` |
| DB verify | 31 contrôles ; 29 verts + 2 non bloquants propres à une base locale nue (URLs Preview, propriétaire plateforme) ; 31 rouge (et non en erreur) sur la base sans la migration |

## 16. Hors périmètre / décisions

| Code | Sujet |
|---|---|
| `DECISION_REQUIRED:PER-APP-MIGRATION-REVUE` | revue par le propriétaire du rapport d'impact sur la base cible (§11) |
| `DECISION_REQUIRED:PER-APP-FACTURATION-STRIPE` | produits / Prices Stripe par application (Colors, Réserves, Tools organisation) : **aucun** n'existe ; seul le webhook mock est livré, non branché à une route HTTP |
| `DECISION_REQUIRED:PER-APP-UI-PLATEFORME` | écrans plateforme pour poser / lever une suspension globale et changer un état commercial d'application (les RPC existent, rôle `total` / `facturation` + AAL2) |
| `DECISION_REQUIRED:PER-APP-OFFRES-GROUPEES` | si une offre GP doit un jour **inclure** une application, la modéliser explicitement (ligne `entitled` liée) — aucun lien implicite n'est recréé |
| Tools personnel | droit **utilisateur** : une suspension d'entreprise ne le coupe pas ; couper une personne = suspension d'identité (bannissement → Studio, sessions) |

**NOT PROVEN localement** : Stripe réel (Portail, factures, ordre réel de livraison), pile
d'identité deux projets (§8), GoTrue / Storage hébergés.

## 17. Fichiers

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20260929000801_per_app_commercial_suspension_v1.sql` | états, prédicats, conversions, `etat_commercial_applications`, webhook d'application, RPC plateforme, `contexte_abonnement_courant.suspension_globale`, rapport + garde « aucune perte » |
| `supabase/tests/per_app_commercial_suspension_v1.test.sql` | 2 925 assertions (§X, GP, W, P, T, D, R, S, B, A) |
| `supabase/tests/{reserves_host_suspension_policy_v1,reserves_full_local_qualification_v1,colors_suspension_application_v16,billing_subscription_lifecycle_v1}.test.sql` | déclencheurs per-app (§12) |
| `scripts/qualification/per-app-suspension-concurrency.sh` | concurrence P1-P5 |
| `scripts/qualification/per-app-suspension-upgrade.sh` | upgrade 361 → 362 |
| `docs/runbooks/sql/ELSATIA_PER_APP_SUSPENSION_IMPACT_V1.sql` | rapport d'impact pré-migration |
| `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` | contrôle 31 ; pack et runbook régénérés (362, 31 contrôles) |
| `packages/application-access/src/index.ts` (+ tests) | `diagnostiquerRefusApplication`, statuts commerciaux |
| `apps/colors/src/lib/acces-colors.ts`, `apps/reserves/src/lib/acces-reserves.ts` | diagnostic de refus par état de l'application |
| `src/lib/etat-commercial-applications.ts` (+ tests), `src/lib/entreprise.ts`, `src/app/abonnement-suspendu/page.tsx` | chemin facturation par application, routage de la suspension globale |
| `tests/e2e/per-app-suspension.spec.ts` (nouveau), `colors-suspension-session.spec.ts`, `reserves-host-suspension.spec.ts` | navigateur |

## 18. Reproduire

```bash
git checkout claude/kind-tesla-0i0818 && npm ci && for a in tools reserves colors studio; do npm ci --prefix apps/$a; done
pg_ctlcluster 16 main start; apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl postgresql-plpython3-16 python3-nacl

scripts/local-postgres-bootstrap/rebuild_db.sh pa                                    # 362/362
scripts/qualification/pgtap-run-v3.sh pa                                             # 145/154, 7 578 ok
scripts/qualification/pgtap-run-v3.sh pa 'per_app_commercial_suspension_v1.test.sql' # 2 925/2 925
createdb -T pa conc && for s in per-app-suspension billing-lifecycle stripe-resubscription stripe-trial stripe-ordering; do
  scripts/qualification/$s-concurrency.sh conc; done                                # 27 / 22 / 20 / 7 / 15
scripts/qualification/per-app-suspension-upgrade.sh upg pa                           # 12/12
apps/studio/scripts/dedicated-db-check.sh                                            # 543 ok
npm run typecheck && npm run lint && npm test && npm --prefix apps/studio run test
npm run verify:migrations && npm run verify:train-expectations && npm run test:preview-pack

# Navigateur : pile locale (passerelle + clés HS256 locales), cf. rapports Colors V2 §8 et GP ↔ Réserves §11
tests/e2e/colors-pile-locale/preparer-base.sh colors_e2e && npm --prefix apps/colors run build && npm run test:e2e:colors
tests/e2e/gp-reserves-pile-locale/preparer-base.sh gpres_e2e   # puis GP :3100, Réserves :3020
npx playwright test tests/e2e/per-app-suspension.spec.ts tests/e2e/billing-lifecycle.spec.ts \
  tests/e2e/stripe-reabonnement.spec.ts tests/e2e/gp-reserves-integration.spec.ts tests/e2e/reserves-host-suspension.spec.ts \
  --project=desktop-chromium --workers=1
```
