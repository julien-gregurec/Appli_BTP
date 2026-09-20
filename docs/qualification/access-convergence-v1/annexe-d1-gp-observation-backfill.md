# Annexe D1 — Gestion Pro : observation, backfill, préparation de l'enforcement

Décision D1 (Julien) : Gestion Pro (GP) exige une habilitation applicative `gestion_pro`, mais **jamais d'enforcement direct sur les utilisateurs existants** : (1) observation, (2) backfill de cas PROUVÉS, (3) enforcement seulement après contrôle du backfill. Ce lot livre les étapes 1 et 2 et **prépare** l'étape 3 (documentation seule, aucun code actif).

Légende : [LU] lu dans le code · [EXÉCUTÉ] exécuté dans ce lot · [INFÉRÉ] déduit. Worktree `app-access-convergence-v1` (HEAD `8eb7da26` + modifications non commitées), rien commité, rien poussé, rien déployé.

> **L'enforcement ne doit pas être fusionné sans preuve que le backfill couvre les utilisateurs existants.**
> Aujourd'hui `enforce` n'existe pas : la valeur est reconnue puis rétrogradée en `observe` avec l'avertissement « enforcement non implémenté : qualification du backfill requise ».

---

## 1. Étape 1 — Observation (code, aucune décision modifiée)

### 1.1 Fichiers

| Fichier | Rôle |
| --- | --- |
| `src/lib/acces-gp/mode.ts` | lecture du flag `ELSATIA_GP_ACCES_APP` et de `ELSATIA_GP_ACCES_APP_ECHANTILLON` |
| `src/lib/acces-gp/comparaison.ts` | fonctions PURES : `comparerDecisionsGp`, `decisionGpActuelle`, `motifExemption` |
| `src/lib/acces-gp/observation.ts` | observateur (échantillonnage, délai, déduplication, journal, `after()`) |
| `src/lib/supabase/proxy.ts` | 3 insertions (import, amorçage, complément) — voir §1.4 |
| `*.test.ts` (4 fichiers) | 209 tests, dont la preuve de non-régression du proxy |

### 1.2 Flag

| Valeur de `ELSATIA_GP_ACCES_APP` | Effet |
| --- | --- |
| absente, vide, `off`, valeur inconnue | `off` : aucun calcul, aucun appel réseau, aucun journal (valeur inconnue : un avertissement de configuration par processus) |
| `observe` | observation active |
| `enforce` | **rétrogradée en `observe`** + avertissement unique par processus (« enforcement non implémenté : qualification du backfill requise ») |

Échantillon : `ELSATIA_GP_ACCES_APP_ECHANTILLON`, défaut **0,01**, borné à [0, 1] (absent/illisible → défaut, `0` = muet). Sel de hachage facultatif : `ELSATIA_GP_ACCES_APP_SEL`.

### 1.3 Ce que fait l'observation

Sur une requête **authentifiée d'un membre d'entreprise** (`ctx.entreprise_id` non nul), hors exemptions, dans l'échantillon : le proxy **planifie** l'appel de `decision_acces_application('gestion_pro', entreprise_id)` puis compare le code du contrat à la décision GP actuelle et journalise.

- **Décision GP actuelle** = `abonnement_statut ∈ {suspendu, annule}` → refus ; sinon module non inclus → refus ; sinon droit de poste (`ctx.droit_acces`) si le chemin est gardé ; sinon (chemin non gardé : `/dashboard`, `/aide`…) tout membre passe. `moduleInclus`/`abonnementStatut` ne sont connus que sur les chemins gardés et sont transmis par `completer()` (lus APRÈS la réponse, donc toujours complets).
- **Types** : `gp_autorise_decision_refuse` (le cas prouvé : poste OK, aucune habilitation ; gravité `bloquant_si_enforcement`, journalisé en `warn`) · `gp_refuse_decision_autorise` (`warn`, gravité `permissif`) · `concordant_autorise`, `concordant_refuse` (`info`) · `decision_indisponible` (RPC muette, expirée, réponse illisible, `non_authentifie`/`erreur_configuration` alors que le proxy vient de valider la session : jamais un refus).
- **Exemptions** (mêmes que le futur enforcement) : chemin public (`isPublic`), machine (webhooks Stripe, crons, `paie/import`, Powens, portail `/document`, `/imprimer/partage`, `/api/documents/partage`), `/onboarding`, `/en-attente`, `/abonnement*`, `/aide`, `/parametres/donnees`, `/api/rgpd/export`, `/plateforme*`, `/api/tools/monetization/*`, sans entreprise, compte dépôt, session d'assistance ; et, après réponse de la RPC, le bypass administrateur plateforme (`role_code = administrateur_plateforme_global`).
- **Journal** (une ligne JSON, `console.warn`/`console.info`) : `{evenement:"gp_acces_app_ecart", version:1, type, gravite, decision, gp, droit_requis, chemin, utilisateur, entreprise, echantillon, latence_ms}`. **Aucune PII** : identifiants = SHA-256(sel:id) tronqué à 12 hex ; `chemin` réduit à sa catégorie (`/devis/3f2c…/edit` → `/devis`) ; ni e-mail ni nom (testé : la ligne ne contient ni l'UUID, ni l'e-mail, ni l'identifiant de ressource).
- **Déduplication** : une ligne par (hash utilisateur, type) et par fenêtre de 10 min, en mémoire, bornée à 2 000 entrées (par instance serverless : quelques doublons possibles, acceptés).
- **Requête à la recherche** : `"evenement":"gp_acces_app_ecart"` ; écart bloquant = `"type":"gp_autorise_decision_refuse"`.

### 1.4 Ne bloque jamais — comment

Doc Next 16 lue (`node_modules/next/dist/docs/…/proxy.md`, `…/functions/after.md`) [LU] : `after()` est **utilisable dans un Proxy** ; `event.waitUntil` (NextFetchEvent) l'est aussi, mais `src/proxy.ts` n'a pas de paramètre `event` et n'est pas dans le périmètre. Choix : **`after()`** (import `next/server`), avec repli sur une promesse détachée à erreurs absorbées hors contexte de requête.

1. `observer()` est **synchrone**, retourne immédiatement et **ne lève jamais** (`try/catch` total, dépendances défaillantes testées) ; aucun `await` ajouté au chemin critique du proxy.
2. La RPC part **après** la réponse ; délai borné à **400 ms** (`AbortController` ; le signal est transmis à `supabase.rpc(...).abortSignal`), minuterie toujours nettoyée.
3. RPC absente (`42883` / `PGRST202` : Production au ledger < 234/280) → **un seul avertissement par processus**, puis silence et **aucun appel** pendant 10 min (re-test silencieux ensuite).
4. En `off` : coût = lecture d'une variable d'environnement.

**Preuve de non-régression** (`proxy-non-regression.test.ts`, 68 tests [EXÉCUTÉ]) : pour 11 scénarios réels du proxy (passe, `/dashboard?acces=refuse`, cul-de-sac « module non inclus », lecture seule 303, chemin non gardé, compte dépôt, assistance, sans entreprise, page publique connecté, `/login`, `/onboarding`) × 6 comportements de la RPC (`refus`, `autorise`, `lève`, `rejette`, `expire`, `absente`) : **statut, destination, en-têtes et cookies de la réponse sont identiques** au mode `off` ; l'appel RPC n'a pas eu lieu quand `updateSession` rend la main ; le nombre de tâches planifiées vaut 1 pour les requêtes éligibles et 0 pour les exemptées ; `enforce` donne la même réponse que `off`.

Limite [INFÉRÉ] : l'amorçage est placé APRÈS `contexte_acces_proxy` et la limite de débit, donc l'observation ne voit pas les requêtes rejetées avant (429/503), qui ne concernent pas la décision d'accès.

---

## 2. Étape 2 — Backfill (SQL proposé, non appliqué)

Fichiers : `supabase/proposed/gp_backfill_habilitations_v1.sql.proposed` (non numéroté, **ne crée que des fonctions, aucune écriture à l'application**) et `supabase/proposed/tests/gp_backfill_habilitations.test.sql` (73 tests).

### 2.1 Fonctions (exploitation seulement)

| Fonction | Rôle |
| --- | --- |
| `gp_backfill_rapport(p_entreprise_id default null)` | diagnostic lecture seule : une ligne par (organisation, membre) → `classe` certain/ambigu/exclu, `raison_code` stable, `raison` lisible, `role_propose`, `action_recommandee`, `couvert_effectif` |
| `gp_backfill_couverture(p_entreprise_id default null)` | couvert / non couvert / ambigu non tranché : **critère de sortie de l'étape 3** |
| `gp_backfill_appliquer(p_appliquer default false, p_entreprise_id default null)` | insère UNIQUEMENT les `certain` ; **simulation par défaut** ; filtre par organisation (canari) |
| `gp_backfill_retour_arriere(p_appliquer default false, p_entreprise_id default null)` | retire ce que le backfill a créé et que personne n'a retouché ; **simulation par défaut** |

ACL : `revoke all … from public, anon, authenticated, service_role` (seul `postgres`), plus une garde interne qui refuse tout JWT applicatif (`42501`), même si un `GRANT` était ajouté par erreur : un membre ne peut pas lister les autres organisations.

Export des ambigus/exclus : `\copy (select * from public.gp_backfill_rapport() where classe <> 'certain') to 'ambigus.csv' csv header` (colonnes stables : entreprise, utilisateur, statut, poste, raison, action recommandée).

### 2.2 Règles de classification (le premier motif applicable gagne ; tout doute = `ambigu`)

Règles de la mission, **durcies** sur les points marqués (+).

| Classe | Raison | Règle | Justification / durcissement |
| --- | --- | --- | --- |
| exclu | `admin_plateforme` | `plateforme_admins` actif, identité `active` | bypass déjà porté par la décision |
| exclu | `statut_invite` / `_en_attente_validation` / `_desactive` / `_pause`(+) | statut ≠ `actif` | `pause` existe en base (CHECK) et n'existe pas au contrat : revue humaine |
| exclu | `sans_profil` | `auth.users` sans profil | aucune appartenance possible |
| ambigu | `compte_depot` | poste avec `mode_compte_depot` autorisé | rôle applicatif non tranché (DECISION_REQUIRED) |
| ambigu | `organisation_annulee` / `organisation_suspendue` | statut, ou `suspension_prevue_at` échue | les droits se créeraient, le blocage reste porté par l'abonnement (DECISION_REQUIRED) |
| ambigu | `employe_ecarte`(+) | employé lié `sorti`/`suspendu`, anonymisé, `date_sortie` passée, compte applicatif `ferme`/`pause` | (+) au-delà de « sorti/suspendu » |
| ambigu | `sans_poste`, `poste_sans_permission` | pas de poste / aucune permission autorisée (hors `mode_compte_depot`) | aucune preuve d'usage de GP |
| ambigu | `abonnement_gp_non_prouve` | ni offre, ni essai daté, ni statut `actif` | voir constat §2.3 |
| ambigu | `entreprise_active_incoherente` | `utilisateurs.entreprise_active_id` nul ou sans appartenance `actif` | contexte proxy ambigu |
| ambigu | `poste_admin_par_nom_seulement`(+) | poste nommé admin/gérant SANS `gerer_utilisateurs` | (+) `peut_gerer_acces` accepte le nom ; on n'en fait PAS une preuve d'administrateur |
| ambigu | `organisation_sans_admin` | aucun candidat administrateur (`gerer_utilisateurs`) dans l'organisation | personne ne pourrait gérer les habilitations ensuite |
| ambigu | `droit_org_desactive_par_plateforme` / `habilitation_desactivee_par_plateforme`(+) | ligne existante `autorise=false` | (+) un geste plateforme explicite n'est **jamais** réactivé automatiquement |
| **certain** | `certain_admin` | membre `actif`, abonnement GP prouvé, poste avec `gerer_utilisateurs` | rôle `gestion_pro_admin` |
| **certain** | `certain_utilisateur` | membre `actif`, abonnement GP prouvé, poste avec ≥ 1 permission autorisée | rôle `gestion_pro_utilisateur` |

« Abonnement GP réel » = `abonnement_offre` non nul OU essai daté (en cours/terminé) OU statut `actif`. Organisation : droit d'usage `acces_applications_entreprises(gestion_pro, source='backfill_gp_habilitation_v1', autorise=true)` créé **seulement** pour une organisation ayant ≥ 1 membre `certain` ; `statut_commercial` prend sa valeur par défaut `actif` (compatible avec `per_application_status_and_platform_suspension_v1`).

### 2.3 Constats [EXÉCUTÉ]

- **Le critère « abonnement prouvé » est aujourd'hui toujours vrai** : un trigger (`initialiser_essai_entreprise`) date l'essai à la création et la contrainte `entreprises_essai_dates_coherentes` interdit des dates nulles. Le vrai discriminant est donc le poste avec permissions GP. La règle est conservée (défensive, lignes antérieures à la contrainte) et testée en levant la contrainte dans la transaction annulée.
- Le trigger `proteger_facturation_entreprise` empêche de toute façon un non-plateforme de modifier le prix contractuel.
- L'essai **terminé** sans offre est classé `certain` (règle de la mission) : le droit se crée, la sortie d'essai reste portée par GP (`entreprise.ts`).

### 2.4 Résultats (base jetable `dbc`, 279 migrations + prérequis + prototype de décision réécrit) [EXÉCUTÉ]

pgTAP **73/73 ok, 0 not ok, 0 erreur**, transaction annulée (0 entreprise restante). Fixtures HISTORIQUES et classification obtenue :

| Fixture | Résultat |
| --- | --- |
| E1 u01 admin prouvé | certain / `certain_admin` |
| E1 u02 poste simple ; u13 (habilitation plateforme préexistante) | certain / `certain_utilisateur` (u13 : jamais réécrit) |
| E1 u03 sans poste ; u04 poste vide ; u05 compte dépôt ; u09 employé sorti ; u11 `entreprise_active_id` nul ; u12 poste « Admin » sans permission ; u14 habilitation désactivée | ambigu (`sans_poste`, `poste_sans_permission`, `compte_depot`, `employe_ecarte`, `entreprise_active_incoherente`, `poste_admin_par_nom_seulement`, `habilitation_desactivee_par_plateforme`) |
| E1 u06 invité ; u07 désactivé ; u08 en attente ; u15 pause ; u10 admin plateforme | exclu |
| E2 suspendue ; E4 annulée | ambigu (`organisation_suspendue`, `organisation_annulee`) |
| E3 essai terminé (admin) | certain_admin |
| E5 sans admin ; E6 droit désactivé par plateforme ; E8 abonnement non prouvé | ambigu |
| E7 droit plateforme + admin sans habilitation | certain_admin |
| compte sans profil | exclu / `sans_profil` |

17 paires légitimes : **5 certains, 12 ambigus** (+ 6 exclus hors périmètre). Simulation : 2 droits d'usage + 4 habilitations, **rien écrit**. Application : 2 + 4 + 6 lignes d'historique ; ensemble des habilitations = les 4 nouveaux certains + les 2 gestes plateforme préexistants, **aucun ambigu/exclu** ; E2/E4/E5/E8 sans droit d'usage. Jamais d'écrasement (source `plateforme_test` d'E7, désactivation d'E6, rôle admin de u13, `autorise=false` de u14 intacts). 2e exécution : **0 ligne** (et 0 historique). Hash avant/après de 13 tables (entreprises, `modules_entreprises`, `plans_abonnement`, postes, permissions, membres, employés, utilisateurs, tarifs, capacité) **identique** ; témoin négatif : le même hash détecte une modification ; le code des fonctions qui écrivent ne référence aucun prix/plan/offre/module/capacité. Couverture : **avant** 0 couvert / 5 non couverts / 12 ambigus ; **après** 5 couverts / **0 non couvert** / 12 ambigus. Retour arrière : simulation puis application ne retirent que les lignes non retouchées (u02 modifiée conservée, E1 conservée tant qu'il reste des habilitations plateforme), historisé.

**Décision du contrat avant → après** (prototype `decision_acces_application` réécrit par l'autre agent, appliqué tel quel avec son prérequis `per_application_status_and_platform_suspension_v1`) : u02 `application_non_incluse` → `autorise` ; u70 `sans_habilitation` → `autorise` ; u30 (essai terminé) → `autorise` ; **u03 (ambigu, sans poste) reste `sans_habilitation`** : un enforcement le couperait.

### 2.5 Séquence d'exécution recommandée (jamais d'un bloc)

`rapport` → revue humaine des ambigus → `couverture` (avant) → `appliquer(false)` → `appliquer(true, <une organisation>)` (canari) → observation (§1) → `appliquer(true)` → `couverture` (après, 0 non couvert) → observation ≥ N jours. Production au ledger 210 : ces tables n'existent pas — rien avant le cutover.

---

## 3. Étape 3 — Préparation (AUCUN code actif)

### 3.1 Checklist de qualification avant tout enforcement

| # | Critère | Seuil chiffré | Preuve attendue |
| --- | --- | --- | --- |
| 1 | Écart d'observation nul en Préproduction | **0** `gp_autorise_decision_refuse` sur **14 jours consécutifs**, échantillon 100 %, ≥ 95 % des utilisateurs actifs vus au moins une fois | export des journaux (comptage par type, par jour) |
| 2 | Idem en Production en `observe` | 0 écart sur **7 jours** avant tout `enforce` Production | idem |
| 3 | Couverture expliquée | `gp_backfill_couverture()` : **0 `non_couvert`** ; `couvert` = 100 % des paires légitimes non ambiguës | sortie horodatée avant/après |
| 4 | Revue humaine des ambigus | **100 %** des lignes `ambigu` avec décision consignée (backfill ciblé / désactivation / exemption / correction de donnée), signée par Julien | CSV annoté versionné |
| 5 | Nouveaux membres couverts | trigger ou RPC d'habilitation (activation, changement de poste, création d'organisation) livré ; un membre créé APRÈS le backfill a une habilitation sans geste ELSATIA | pgTAP + E2E ; sinon chaque nouvel employé serait bloqué |
| 6 | Habilitation par l'administrateur d'entreprise | aujourd'hui seul un admin plateforme `total` + AAL2 habilite (…239) : RPC + écran `/parametres/acces` | E2E |
| 7 | Retour arrière par flag | `ELSATIA_GP_ACCES_APP=observe` restaure le comportement actuel ; délai mesuré ≤ 5 min (variable d'environnement = redéploiement ; flag en base = instantané, DECISION_REQUIRED) | procédure jouée en Préproduction |
| 8 | Exemptions listées et testées | toutes les exemptions du §1.3 + sortie d'essai | E2E §3.3 |
| 9 | Écran de refus dédié | `/acces-refuse` (message honnête, action `contacter_administrateur`), plus de `?acces=refuse` muet | E2E |
| 10 | Ledger | RPC `decision_acces_application` et prérequis présents sur l'environnement cible | contrôle `to_regprocedure` |

### 3.2 Design de l'enforcement (à NE PAS coder dans ce lot)

- **Où** : dans `updateSession`, APRÈS le routage compte dépôt et AVANT le bloc `droitRequis` (module non inclus, droit de poste), uniquement si `mode = enforce` ET requête éligible (mêmes exemptions que l'observation, pour ne pas enforcer ce qu'on n'a pas observé) ET `!acces_support`. Refus : 307 vers `/acces-refuse` (pages) ; 403 JSON `{error, decision}` (API, cf. `refus-api.ts`).
- **Coût** : l'observation paie un aller-retour hors chemin critique ; l'enforcement le paierait DANS le chemin critique. Recommandation : **fusionner la décision dans `contexte_acces_proxy`** (un seul aller-retour, comme l'a voulu la migration …117) plutôt qu'ajouter une RPC.
- **Indisponibilité** : `decision_acces_application` muette → **fail-open + alerte** (défaut conservateur pour des utilisateurs historiques ; DECISION_REQUIRED).
- **Ordre des refus** : les décisions `abonnement_suspendu`/`essai_expire` doivent renvoyer vers les écrans existants (`/abonnement-suspendu`, `/abonnement`), pas vers `/acces-refuse`.
- **Exemptions** : chemins publics, webhooks Stripe (3), crons (2), `/api/webhooks/notifications-push`, `paie/import`, Powens, portail `/document`, `/imprimer/partage`, `/api/documents/partage`, `/api/tools/monetization/*`, `/onboarding`, `/en-attente`, `/abonnement*`, `/aide`, `/parametres/donnees`, `/api/rgpd/export` (sortie d'essai), `/plateforme*`, comptes dépôt, sessions d'assistance, bypass administrateur plateforme.

### 3.3 Tests E2E attendus (un par cas)

| Cas | Attendu |
| --- | --- |
| membre habilité (rôle utilisateur / admin) | accès normal, aucune redirection |
| membre actif avec poste mais sans habilitation | `/acces-refuse` ; jamais de boucle de redirection |
| habilitation désactivée par la plateforme | refus ; réactivation par la plateforme → accès |
| compte dépôt | accès à `/stock`/`/depot` inchangé |
| session d'assistance | accès inchangé |
| essai expiré | `/abonnement`, `/aide`, `/parametres/donnees`, `/api/rgpd/export` restent ouverts |
| abonnement suspendu / annulé | écran d'abonnement existant (pas `/acces-refuse`) |
| administrateur plateforme | `/plateforme*` et bypass inchangés |
| public / portail / partage | ouverts sans session |
| webhooks Stripe, crons, Powens, `paie/import` | traités sans `auth.uid()` |
| `/api/tools/monetization/*` | Bearer/Apple/Google inchangés |
| nouveau membre créé après backfill | habilité sans geste ELSATIA (critère 5) |
| RPC de décision indisponible | fail-open + alerte, aucune déconnexion |
| retour `ELSATIA_GP_ACCES_APP=observe` | comportement actuel restauré |

---

## 4. DECISION_REQUIRED

| # | Question | Défaut conservateur appliqué |
| --- | --- | --- |
| D-1 | Backfiller les organisations suspendues/annulées ? | `ambigu`, rien créé |
| D-2 | Rôle applicatif du compte dépôt/borne | `ambigu`, exempté |
| D-3 | Poste nommé « Admin » sans `gerer_utilisateurs` : administrateur ? | `ambigu` (non prouvé) |
| D-4 | Organisation sans administrateur identifiable : qui désigner ? | `ambigu`, rien créé |
| D-5 | Essai terminé sans offre = usage prouvé ? | `certain` (règle de la mission) |
| D-6 | La migration exécute-t-elle le backfill ou seulement les fonctions ? | fonctions seules, exécution manuelle |
| D-7 | Rapport exposé à un administrateur plateforme (`total` + AAL2) ? | `postgres` seulement |
| D-8 | Indisponibilité de la décision en enforcement : ouvert ou fermé ? | ouvert + alerte |
| D-9 | Triggers d'activation/poste + RPC d'habilitation par l'admin d'entreprise | prérequis, non livrés |
| D-10 | Retour arrière instantané : flag en base plutôt que variable d'environnement ? | variable d'environnement |
| D-11 | Le rôle applicatif REMPLACE-t-il ou COMPLÈTE-t-il le poste ? | complète (le poste reste la source des droits fins) |
| D-12 | Seuils du §3.1 (14 j Préproduction, 7 j Production, ≥ 95 % des utilisateurs vus) | valeurs proposées |

## 5. Risques pour les utilisateurs historiques

1. **Sans le backfill, l'enforcement coupe tous les membres actuels** (aucune habilitation `gestion_pro` par défaut). Après backfill, les **ambigus** (12/17 dans le jeu d'essai) restent coupés : la revue humaine est bloquante.
2. **Membres futurs** : sans trigger/RPC (critère 5-6), chaque nouvel employé, chaque poste changé, exige un geste ELSATIA.
3. Effets visibles du backfill : GP apparaît dans le sélecteur d'applications, compteurs d'annuaire plateforme (`applications autorisées`, `utilisateurs habilités`) en hausse, l'assistance peut désormais cibler GP.
4. L'observation est échantillonnée (1 %) : un cas rare (un membre par entreprise) peut n'être vu qu'après des jours ; d'où 100 % en Préproduction.
5. Production au ledger 210 : aucune fonction ni table cible — observation muette (un avertissement) tant que la migration de cutover n'est pas jouée.

## 6. Rejouer

```bash
# Vitest (racine du worktree)
./node_modules/.bin/vitest run src/lib/acces-gp
# pgTAP (base jetable) : prérequis dans l'ordre, puis le test
psql … -f supabase/proposed/per_application_status_and_platform_suspension_v1.sql.proposed
psql … -f packages/application-access/sql/decision_acces_application.sql.proposed
psql … -f supabase/proposed/gp_backfill_habilitations_v1.sql.proposed
psql … -f supabase/proposed/tests/gp_backfill_habilitations.test.sql   # 1..73, 0 not ok
```
