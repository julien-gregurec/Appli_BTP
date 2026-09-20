# ELSATIA — Convergence d'accès inter-applications — V1.1

Date : 2026-09-20 (V1) · **mise à jour 2026-09-21 : décisions D1/D2/D3 de Julien intégrées** · Branche de travail `fix/app-access-convergence-v1` (locale, **non poussée**) · **Rien déployé, ni Preview ni Production touchés, aucun prix ni plan modifié, Studio non refondu.**
Suite de l'audit `docs/audits/ELSATIA_APP_FIRST_ACCESS_AUDIT_V1.md` (mêmes identifiants de constats).

## 0. Résumé

| Sujet | Résultat |
| --- | --- |
| Base de travail | `fix/colors-shared-auth-access-night-v1` @ `d7d59c9e` = **Train V3 (`59e960a0`) + 30 commits** — la version la plus récente et la plus complète de Colors/Réserves/Tools qui contient V3 |
| **D1 — GP exige l'habilitation** | **Étapes 1 et 2 livrées, étape 3 NON activée.** Observation (`off` par défaut, `enforce` rétrogradé, aucun blocage, 68 tests de non-régression du proxy) ; backfill en fonctions SQL (5 `certain` / 12 `ambigu` sur le jeu d'essai, **0 non couvert** après, aucun prix ni plan touché) ; enforcement = checklist seulement (§6) |
| **D2 — Tools** | **P1 T-P1-a fermé en proposition** : projet d'organisation = membre `actif` + entitlement Pro (`saved-projects`) + droit projet, bornes de taille/quota, SQLSTATE stables ; Free jamais bloqué. Avant : Free et ex-abonné écrivaient dans le cloud ; **pas d'IDOR** inter-organisation (§8) |
| **D3 — suspension par application** | **Contrat figé** (`suspension_plateforme` ajouté, `entreprise_inactive` retiré, `abonnement_suspendu` = statut de CETTE application). Découplage prouvé : GP suspendu ⇒ Colors/Réserves/Tools autorisés **et leurs données visibles**, 0 régression sur 14×3×6×6 (§7, §7bis). **Limite : la suspension plateforme ne coupe pas encore les données GP** |
| Contrat `decision_acces_application` | v1 **figé** : 14 étapes de priorité, 66 + 103 pgTAP, 103 cas, invariant `autorise ⇔ a_acces_application` : 0 violation |
| Studio | **Signup fermé corrigé sur une branche isolée** `fix/studio-signup-closed-v1` @ `634651a0` ; prouvé sur GoTrue réel (avant 200 / après 403). **Le hook doit être réglé sur le projet hébergé** (§10) |
| P1 open-redirect Réserves / logout global / Colors 265 | inchangés (lot V1) : déjà corrigé à la base / corrigé et **prouvé sur GoTrue réel** / cause + port minimal, **ne jamais déployer la 265** (§3-§5) |
| Rejeu | vitest 258 + 435 + 216 + 108 ; pgTAP des 4 propositions appliquées **ensemble** + 19 fichiers existants rejoués (seul `r10` original échoue, par conception, version adaptée fournie) (§16) |

## 1. Base de travail et validation du patch précédent

| Réf. | SHA | Rôle |
| --- | --- | --- |
| Train V3 | `59e960a0` | référence multi-app (ledger 278) |
| **Base retenue** | `d7d59c9e` (`fix/colors-shared-auth-access-night-v1`, 30 commits devant V3) | Colors/Réserves/Tools les plus récents ; contient déjà `96db69fc` (redirections sûres Réserves) et `91027209` (codes de connexion fermés) |
| Branche courante du dépôt | `df58d813` (`feat/stripe-test-canonical-prices-p0-v1`, **gelée**, ledger 265) | non touchée ; sert de témoin du P0 Colors |
| Studio | `05c775d5` (`integration/studio-commercial-ready-v1`) | lu seulement |

**`first-access-fixes-v3.patch`, revalidé** : il s'applique **exactement** au tip V3 (`git apply --check` OK) mais **échoue** sur `d7d59c9e` (`apps/colors/src/app/actions.ts`, `apps/reserves/src/app/actions.ts` ont changé). Conformément à la consigne, il n'est **pas** appliqué. Ses deux volets sont traités ainsi :
- F1 (redirection sûre Réserves) : **déjà présent** à la base sous une forme équivalente (fichiers `redirection-sure.ts` identiques entre Colors et Réserves — `diff` vide) ; seuls des tests sont ajoutés.
- F2 (logout local) : **réappliqué à la main** sur les sites actuels, avec tests (§4).

## 2. Tableau demandé (base `d7d59c9e` + corrections de cette branche)

| Application | Auth | Organisation | Entitlement | Rôle | Suspension | Logout local | Motif affiché | État |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Gestion Pro** | cookie SSR propre à l'origine ; proxy `getUser()`, `/login` sans `next` | `entreprise_active_id` + `utilisateurs_entreprises.statut` ; sans entreprise → `/onboarding` **(création ouverte à tout compte)** | abonnement / offre / `modules_entreprises` (+ socle d'essai). **`acces_applications_entreprises` jamais lue** | **permissions de poste** (`permissions_poste`). Habilitation `gestion_pro_*` **jamais lue** | **écran dédié** `/abonnement-suspendu` (seule app) | sans objet (GP ne déconnecte pas sur refus) ; déconnexion volontaire = `signOut()` **global** (à trancher, §11) | module non inclus (clé brute) ; refus de rôle **muet** (`?acces=refuse` non lu) ; `/en-attente` faux pour un compte désactivé | **hors modèle multi-app → D1 : observation livrée, backfill préparé, enforcement non activé** (§6) |
| **Colors** | cookie SSR ; proxy = rafraîchissement seul ; garde au layout `exigerShellColors` | `contexte_application_courant` | `acces_applications_entreprises` via `a_acces_application` | `habilitations_applications_utilisateurs` | non distinguée : « n'est pas activé » | **oui — appliqué** (4 sites de refus) ; volontaire/mot de passe = global | codes fermés (login) ; `/acces-refuse`, `/abonnement-requis` (sans boucle en V3+) | **OK** ; API : 403/503 JSON **appliqués** ; motif fin dépend du contrat §7 |
| **Tools** | supabase-js **client** (aucun serveur) ; compte facultatif | facultative (`tools_lister_entreprises_autorisees`) pour le cloud | **par utilisateur** (`entitlements_utilisateurs_elsatia`), Free par défaut | `tools_pro` (habilitation d'organisation) pour le cloud seulement | coupe le cloud via `est_membre_actif` → Free | **déjà local** (`AccountProvider.tsx:96`) | unique : « mode Free » | **contrat particulier** (§8) ; RLS/RPC cloud durcies **en proposition** (D2) |
| **Réserves** | cookie SSR ; proxy = rafraîchissement + CSP ; garde layout **et** par page | `contexte_application_courant` | `a_acces_application` (droit d'usage) | habilitation (`reserves_*`) + invitations (lien, désignation) | non distinguée (« pas encore ouvert ») | **oui — appliqué** (4 sites) ; volontaire = global | codes fermés ; `/acces-refuse` (action réelle : `reserves_attribuer_role`) | **OK** ; open-redirect fermé (base) ; API « anonyme ≈ sans organisation » (P2) |
| **Studio** | **Auth dédiée** prévue (`config.toml`) — README dit « partagée » (contradiction) | **workspace** (`studio_workspaces`), pas d'entreprise | **aucun à l'exécution** ; filtre à l'inscription seulement | `studio_workspace_members` (owner/admin/editor/viewer) | kill-switch global 503 ; `admission_open` | sans objet (aucun refus par droit d'app) | login générique ; invitation « indisponible » (sans oracle) | **isolé** ; raccord = lot séparé ; signup fermé **corrigé sur branche isolée** (§10) |

## 3. Colors : la divergence 265 / V3 / base

**Constat** [LU + exécuté] : sur Colors 265 (`df58d813`), `/acces-refuse` et `/abonnement-requis` appellent `getContexteColors()` (`lib/contexte.ts:34,36`), qui redirige vers `/acces-refuse?motif=appartenance` pour un compte sans contexte : **la page se redirige elle-même**.

| Question | Réponse |
| --- | --- |
| Quel commit corrige ? | **`260523c0`** (2026-09-05, `fix(colors): close precommercial security p1 gaps`, branche `fix/colors-security-p1-closure-v1`, point **S5 « Boucle /acces-refuse »** : `lireContexteRefus()` lit le contexte sans jamais rediriger). C'est un commit **multi-sujets** (en-têtes, fuites SQL, récupération de mot de passe). La fonction est **reprise** dans `94236349` / `e9a6e6bc` (« rebaser Colors V1.4 sur le train », contenu non comparé octet à octet) : **présente dans V3 et dans la base retenue** (`git grep lireContexteRefus` sur `59e960a0` et `d7d59c9e` : 1 occurrence chacun ; 0 sur `df58d813`) |
| Fichiers de la correction | `apps/colors/src/lib/contexte.ts`, `lib/messages-refus.ts` (nouveau), `app/acces-refuse/page.tsx`, `app/abonnement-requis/page.tsx`, test `lib/acces-refuse.test.ts` |
| Un cherry-pick minimal est-il sûr ? | **Oui, mais pas `260523c0` en entier** (il **ne s'applique pas** à Colors 265 : `actions-metier.ts`, `FlashMessage.tsx`… absents). Le **port minimal en 5 fichiers** extrait de V3 (`docs/qualification/access-convergence-v1/colors-265-loop-fix-minimal.diff`, 321 lignes) : `git apply` **OK** sur Colors 265, module `messages-refus.ts` inclus (aucune dépendance manquante), `acces-refuse.test.ts` **13/13** sur une copie de Colors 265 |
| Quelle branche Colors est la référence ? | **`fix/colors-shared-auth-access-night-v1` @ `d7d59c9e`** (contient V3 + correctif + V1.5). Plutôt que de porter sur 265, **ne plus utiliser 265 comme branche de déploiement Colors** |
| Seconde correction concurrente ? | **Aucune créée.** Le diff minimal est un **filet de sécurité de repli**, à n'utiliser que si la branche 265 devait être déployée telle quelle |

**Garde-fou de déploiement recommandé** : ne pas déployer `apps/colors` depuis une réf. dont `lib/contexte.ts` ne contient pas `lireContexteRefus` (test d'existence : `git grep -c lireContexteRefus <ref> -- apps/colors/src/lib/contexte.ts` ≥ 1). Nota : la Production sert un Colors bien plus ancien (mémoire projet), non observé ici.

## 4. Logout local

**Comportement Supabase réel, prouvé** (`docs/qualification/access-convergence-v1/logout-scopes.py` / `.out`, GoTrue `v2.192.0` jetable sur Postgres Supabase 17.6, compte fictif, trois sessions = GP, Colors, Réserves) :

| Action | Session Colors | Session GP | Session Réserves |
| --- | --- | --- | --- |
| `POST /logout?scope=local` (session Colors) | jeton **403 `session_not_found`**, refresh **400** | `/user` **200**, refresh **200** | refresh **200** |
| `POST /logout?scope=global` (`signOut()` sans option, code **avant** correctif) | — | `/user` **403 `session_not_found`**, refresh **400 `refresh_token_not_found`** | refresh **400** |

`supabase.auth.signOut()` vaut `{ scope:'global' }` (`@supabase/auth-js` `GoTrueClient.ts:3986`). Avant correctif, **un refus d'accès dans Colors ou Réserves fermait immédiatement GP et l'autre application** — et le jeton d'accès cesse de marcher aussitôt (GoTrue valide la session), pas seulement au prochain rafraîchissement.

**Appliqué** (constante `PORTEE_DECONNEXION_REFUS_ACCES = { scope:'local' }`) — `apps/colors/src/app/actions.ts`, `apps/reserves/src/app/actions.ts`, 4 sites chacun dans `connexionAction` : contexte vide, décision négative, erreur du contexte, erreur de la décision.

| Situation | Portée | Pourquoi |
| --- | --- | --- |
| Refus d'accès à l'application courante | **local** | ne concerne pas les autres applications |
| Panne de la décision (`indisponible`) | **local** aujourd'hui (le code existant déconnecte) ; cible : **ne pas déconnecter** (contrat §7) | ce n'est pas un refus |
| Déconnexion **volontaire** | **global** (intentionnel, inchangé) | l'utilisateur ferme tout — Q6 |
| Changement / réinitialisation de mot de passe | **global** (inchangé, Colors `actions.ts`) | invalide les autres sessions |
| **Compromission** de compte, révocation d'urgence | **global**, `scope:'global'` explicite côté plateforme | à implémenter avec la fermeture de compte |
| **Suppression / fermeture** de compte (Studio `deleteUser`, RGPD) | **global** par nature | l'identité disparaît |
| Changement de sécurité (activation/retrait MFA, changement d'e-mail) | **global recommandé**, `others` ailleurs | à décider avec le lot MFA |
| Studio | aucun refus par droit d'app aujourd'hui | — |

Tests : Colors `actions.test.ts` (refus → `{scope:"local"}` sur 4 chemins, volontaire → **sans argument**, autorisé → jamais de `signOut`) ; Réserves `actions.test.ts` (nouveau, mêmes chemins + invitation en attente + lien `/invitation/*`).
**Limite** : la session créée par `signInWithPassword` juste avant le refus n'est pas révoquée côté serveur (refresh token orphelin, expire seul) : acceptable, préférable à la coupure des autres applications.

## 5. Réserves : `next`

Correctif à la base (`96db69fc`) : `cheminSur` et `/auth/callback` passent par `cheminInterneSur` (`apps/reserves/src/lib/redirection-sure.ts`, **identique octet pour octet** à Colors). Ajouts de cette branche :

| Entrée | Attendu | Couvert par |
| --- | --- | --- |
| `/dashboard`, `/reserve/123`, `/reserves/<uuid>`, `/invitation/<jeton>`, `/rejoindre/<uuid>`, `/messages` | accepté | `redirection-sure.test.ts` (+5) |
| `https://evil.example`, `//evil.example`, `/\evil.example` | refusé → `/dashboard` | tests existants **+ action** (`actions.test.ts`) |
| `/%5Cevil.example`, `/%255C…`, `/%09/…`, `/%0d%0a…`, `/%00//…`, `javascript:`, `data:` | refusé | tests existants (19 cas) |
| chaîne vide / `null` / tableau | repli sûr | tests existants + action |

GP a son propre validateur (`destinationInterneSure`, `src/lib/security/redirects.ts`) : **trois copies** du même principe. Convergence proposée : extraire dans `packages/application-access` (lot séparé, non trivial : trois signatures différentes).

## 6. Gestion Pro — D1 : habilitation `gestion_pro` exigée, en 3 étapes (observation et backfill livrés, **enforcement NON activé**)

**Décision D1 (Julien)** : GP exige une habilitation applicative ; le poste n'est plus la seule porte. Modèle cible : compte ELSATIA → organisation → membership actif → entitlement / habilitation `gestion_pro` → rôle / poste → permissions métier. **Jamais d'enforcement direct sur les utilisateurs existants.** Détail complet : `annexe-d1-gp-observation-backfill.md` ; analyse de l'écart d'origine : `annexe-gp-ecart-modele.md`.

**Rappel de l'écart** [LU + exécuté] : le proxy GP décide sur `contexte_acces_proxy` (`utilisateurs_entreprises × permissions_poste`) ; `a_acces_application` exige un droit d'usage d'organisation **et** une habilitation. Aucune brique commune ; aucun trigger/backfill ne crée d'habilitation `gestion_pro`. Donc un compte au poste valide mais sans habilitation passe le proxy (`droit_acces=true`) alors que la décision dit `false`.

| Étape | Statut | Contenu |
| --- | --- | --- |
| **1. Observation** | **livrée, `off` par défaut** | flag `ELSATIA_GP_ACCES_APP` = `off` (défaut, valeur inconnue comprise) \| `observe`. **`enforce` n'existe pas** : la valeur est reconnue puis **rétrogradée en `observe`** avec l'avertissement « enforcement non implémenté : qualification du backfill requise ». En `observe`, après la réponse (`after()`, valide dans un proxy Next 16), le proxy appelle `decision_acces_application('gestion_pro', entreprise)` (délai 400 ms, échantillon 1 %, exemptions : chemins publics/machine, compte dépôt, assistance, admin plateforme, `/onboarding`, `/abonnement*`, sortie d'essai…), compare à la décision GP actuelle et **journalise** une ligne JSON sans PII (identifiants hachés) : `gp_autorise_decision_refuse` (le cas bloquant), `gp_refuse_decision_autorise`, `concordant_*`, `decision_indisponible`. RPC absente (`42883`/`PGRST202`, Production ledger 210) : un seul avertissement, puis silence. **Ne bloque personne** : 68 tests prouvent que statut, destination, en-têtes et cookies du proxy sont **identiques** au mode `off` sur 11 scénarios × 6 comportements de la RPC |
| **2. Backfill** | **livré comme fonctions SQL, rien écrit à l'application** | `gp_backfill_rapport()` (certain / ambigu / exclu + raison), `gp_backfill_couverture()` (**critère de sortie**), `gp_backfill_appliquer(p_appliquer default false, p_entreprise_id)` (simulation par défaut, canari par organisation, insère **uniquement** les `certain`, `on conflict do nothing`, historisé, idempotent), `gp_backfill_retour_arriere()`. Exécutables par `postgres` seul (garde interne contre tout JWT applicatif). Règles durcies : tout doute = `ambigu` ; poste « Admin » sans `gerer_utilisateurs`, employé sorti/fermé, statut `pause`, `entreprise_active_id` incohérente, organisation suspendue/annulée, compte dépôt, geste plateforme `autorise=false` → **jamais backfillés** |
| **3. Enforcement** | **préparé en documentation seulement — aucun code actif** | checklist chiffrée (0 écart / 14 j en Préproduction, 0 / 7 j en Production, 0 `non_couvert`, revue humaine de 100 % des ambigus, trigger/RPC d'habilitation pour les nouveaux membres, habilitation par l'administrateur d'entreprise, retour arrière par flag ≤ 5 min), design (fusion dans `contexte_acces_proxy` plutôt qu'une RPC de plus sur le chemin critique), E2E par cas |

> **L'enforcement ne doit pas être fusionné sans preuve que le backfill couvre les utilisateurs existants.**

**Preuve du backfill** [EXÉCUTÉ, 73/73 pgTAP, base jetable] : fixtures historiques réalistes → **5 `certain`, 12 `ambigu`** (+ 6 `exclu`) ; couverture avant 0 couvert / 5 non couverts, **après 5 couverts / 0 non couvert / 12 ambigus** ; un `certain` passe de `application_non_incluse`/`sans_habilitation` à `autorise` ; **un ambigu sans poste reste `sans_habilitation` : l'enforcement le couperait** — d'où la revue humaine obligatoire. Hash avant/après de 13 tables (`entreprises`, `modules_entreprises`, `plans_abonnement`, postes, permissions, tarifs, capacité…) **identique** : aucun prix ni plan touché (un témoin négatif prouve que le hash détecte une modification).

**Fichiers** : `src/lib/acces-gp/{mode,comparaison,observation}.ts` (+ 4 fichiers de tests, **209 tests**), `src/lib/supabase/proxy.ts` (+20 lignes : import, amorçage, un `completer()`), `supabase/proposed/gp_backfill_habilitations_v1.sql.proposed`, `supabase/proposed/tests/gp_backfill_habilitations.test.sql`.

**Risques pour les utilisateurs historiques** : sans backfill un enforcement couperait **tous** les membres actuels ; après backfill les **ambigus** (12 sur 17 dans le jeu d'essai) restent coupés → la revue humaine bloque ; sans trigger ni RPC d'habilitation (D-9), chaque nouvel employé exigerait un geste ELSATIA ; le backfill fait apparaître GP dans le sélecteur d'applications, monte les compteurs d'annuaire, rend GP ciblable par l'assistance ; l'échantillon de 1 % peut mettre des jours à voir un cas rare (100 % en Préproduction) ; **Production au ledger 210** : ni ces tables ni la RPC — l'observation y reste muette, aucun backfill avant le cutover. Retour arrière : observation = retirer la variable ; backfill = `gp_backfill_retour_arriere()` (ne retire que ce qui n'a pas été retouché). **Reste DECISION_REQUIRED** : D-1 à D-12 de l'annexe D1 (backfiller les organisations suspendues ? rôle du compte dépôt ? poste « Admin » sans permission ? migration = fonctions seules ou backfill exécuté — défaut : fonctions seules ; indisponibilité de la RPC en enforcement, ouvert ou fermé — défaut : ouvert avec alerte).

## 7. Contrat `decision_acces_application` — **v1 FIGÉ** (2026-09-21)

Livrables : `packages/application-access/src/decision-acces.ts` (+ test, 44 tests), `refus-api.ts`, `sql/decision_acces_application.sql.proposed` (**non numéroté, hors `supabase/migrations`**), `supabase/proposed/per_application_status_and_platform_suspension_v1.sql.proposed` (prérequis), pgTAP `supabase/proposed/tests/decision_acces_application.test.sql` (66) et `per_application_status.test.sql` (103), jeu d'essai `docs/qualification/access-convergence-v1/decision-cases.sql` (103 cas). Détail D3 : `annexe-d3-suspension-par-application.md`.

**Changements par rapport à la première version** (décision D3) : `entreprise_inactive` **retiré** (couvert par `suspension_plateforme`, portée organisation) ; `suspension_plateforme` **ajouté** ; `abonnement_suspendu` = statut commercial de **CETTE application** (jamais celui d'une autre) ; `a_acces_application` est **réécrite** = « la décision est `autorise` pour l'utilisateur courant », signature/GRANT/REVOKE inchangés.

### 7.1 Signature
`decision_acces_application(p_application_code text, p_entreprise_id uuid default null) returns jsonb` — `security definer`, `stable`, `authenticated` seulement (`service_role` retiré). Noyau `_decision_acces_noyau(uid, entreprise, app)` inaccessible aux rôles applicatifs. Vue admin `diagnostic_acces_application(utilisateur, entreprise, app)` : administrateur plateforme uniquement (42501 sinon).

### 7.2 Retour (vue client)
```json
{ "version": 1, "decision": "abonnement_suspendu", "application_code": "colors",
  "role_code": null, "entreprise": { "id": "…", "nom": "…" } }
```
`role_code` : seulement si `autorise`. `entreprise` : seulement si l'appelant possède une appartenance (tout statut) ; sinon `null`.

### 7.3 Décisions et **priorité** (la première qui s'applique gagne)

| # | Décision | Règle | HTTP | Écran cible |
| --- | --- | --- | --- | --- |
| 1 | `non_authentifie` | `auth.uid() is null` | 401 | login |
| 2 | `erreur_configuration` | application inconnue/inactive, statut de membre inconnu (`pause`…), entreprise introuvable | 500 | erreur technique |
| 3 | **`suspension_plateforme`** | suspension GLOBALE explicite (sécurité plateforme) du **compte** ou de l'**organisation** — table dédiée, écrite par RPC `total` + AAL2 ; **prime sur tout, bypass administrateur compris** | 423 | suspension plateforme (contacter ELSATIA) |
| 4 | `autorise` (bypass) | administrateur plateforme actif, identité active, application active | 200 | application |
| 5 | `sans_organisation` | `entreprise_id` nul ou **aucune** appartenance | 403 | GP : onboarding ; ailleurs : compte ELSATIA |
| 6 | `invitation_en_attente` | membre `invite` | 403 | accepter l'invitation |
| 7 | `validation_en_attente` | membre `en_attente_validation` | 403 | attendre la validation |
| 8 | `utilisateur_desactive` | membre `desactive` | 403 | compte désactivé |
| 9 | **`abonnement_suspendu`** | **de CETTE application** : `gestion_pro` → `entreprises.abonnement_statut ∈ {suspendu, annule}` ou `suspension_prevue_at` échue ; toute autre application → `statut_commercial` de **sa** ligne d'entitlement d'organisation | 423 | suspendu (dédié) |
| 10 | `essai_expire` | droit d'usage hors fenêtre **et** `source='essai'` | 423 | essai expiré → offres |
| 11 | `application_non_incluse` | pas de droit d'usage, désactivé, ou hors fenêtre (hors essai) | 403 | abonnement / offres |
| 12 | `sans_habilitation` | aucune habilitation pour cette application | 403 | accès refusé |
| 13 | `sans_role` | habilitation inopérante : `autorise=false`, hors fenêtre, rôle inactif | 403 | accès refusé |
| 14 | `autorise` | tout le reste, avec `role_code` | 200 | application |

**Pourquoi cet ordre** : les états **personnels** (5-8) précèdent les états **d'entreprise** (9-10) — on ne révèle pas l'état commercial d'une entreprise à un non-membre, à un invité ou à un désactivé ; entreprise → droit d'usage → habilitation → rôle : du plus général au plus fin ; `erreur_configuration` avant tout jugement métier (échec fermé) ; la suspension plateforme prime sur le bypass administrateur car c'est **la seule** décision qui coupe tout le compte.
**Côté client uniquement** : `indisponible` (RPC muette : 503, jamais un refus, jamais une déconnexion) et `refus_non_qualifie` (adaptateur transitoire d'un `false`). **Hors contrat** : permissions métier de poste (couche 5, restent à GP) et module non inclus (grain fin GP).

### 7.4 Exposable au client / réservé aux logs et administrateurs

| Exposable (vue client) | Réservé aux logs serveur et administrateurs (`diagnostic_acces_application`) |
| --- | --- |
| code de décision, application, **son propre** rôle, nom de l'entreprise **s'il en est membre** ; jamais de nom pour `suspension_plateforme`, `sans_organisation`, `non_authentifie` | statut d'abonnement brut, `suspension_prevue_at`, `statut_commercial`, fenêtres de validité, `source`, identifiants de lignes, `attribue_par`, motif et auteur de la suspension plateforme, autres appartenances, bypass utilisé, message d'erreur SQL |
| action suggérée (`regulariser_abonnement` seulement pour un administrateur de l'entreprise) | logs applicatifs : décision + application + **hash** de l'utilisateur, jamais de PII |

### 7.5 Validation exécutée (base jetable, 279 migrations)
pgTAP : `decision_acces_application` **66/66**, `per_application_status` **103/103** ; jeu d'essai **103/103**, invariant `decision='autorise' ⇔ a_acces_application` **0 violation**, 0 décision hors contrat. **Différentiel contre l'ancienne `a_acces_application` (migration 234)** : 14 utilisateurs × 3 organisations × 6 applications × 6 états (GP annulé, suspension prévue échue, essai expiré…) → **0 refus nouveau, 0 autorisation nouvelle pour `gestion_pro`** ; seule différence = le découplage voulu (§7bis). ACL et signature identiques. TypeScript (`decision-acces.test.ts`, 44 tests) : matrice situation → écran / statut / déconnexion, invariants, lecture **fail-closed**, `PORTEE_SUSPENSION` (D3 encodé dans le contrat).

### 7.6 Points ouverts du contrat (`DECISION_REQUIRED`, défauts conservateurs appliqués)
`diagnostic` : administrateur actif seulement (ou `total` + AAL2 ?) · **AAL2 du bypass administrateur** (aucune exigence aujourd'hui) · statut d'appartenance `pause` → `erreur_configuration` (fail-closed) · ordre 10/11 (un droit `autorise=false` avec fenêtre d'essai échue reste `application_non_incluse`) · `annule` et `suspendu` hors GP = même code (distinction dans le diagnostic seulement) · session d'assistance et comptes dépôt/borne · `essai_expire` de GP (`abonnement_essai_fin`) hors périmètre tant que GP n'est pas branché.

## 7bis. D3 — suspension **par application** (le découplage)

**Décision D3** : `gestion_pro = suspended` ⇒ GP bloqué, Colors et Tools continuent ; chaque application a son propre entitlement/statut ; seule une suspension `platform_global_suspension` coupe tout le compte. **On ne réutilise pas un état de membership d'entreprise comme suspension commerciale d'une application.** Proposition : `supabase/proposed/per_application_status_and_platform_suspension_v1.sql.proposed`.

| Objet proposé | Rôle |
| --- | --- |
| `acces_applications_entreprises.statut_commercial` (`actif`/`suspendu`/`annule`, défaut `actif`) + `suspendu_depuis` | statut commercial **par application** ; lignes existantes inchangées (`actif`) ; **ignoré pour `gestion_pro`** (son statut reste `entreprises.abonnement_statut`) |
| `est_membre_organisation(uuid)` | appartenance active **sans** l'abonnement GP ; `est_membre_actif` reste **intact** (il protège les données GP : 142 policies) |
| table + `_suspension_plateforme_active()` + RPC `plateforme_suspendre_globalement` / `plateforme_lever_suspension_globale` | suspension plateforme explicite (compte ou organisation), `total` + AAL2, auto-suspension interdite, historisée |
| RPC `plateforme_definir_statut_application_entreprise` | suspendre/annuler/réactiver **une** application d'**une** organisation (mêmes gardes que `plateforme_desactiver_application_entreprise`) |
| `a_acces_application` réécrite (dans le fichier de décision) | Colors, Réserves (20 objets), Tools (4 fonctions + 3 policies), `applications_autorisees` cessent d'hériter de la suspension GP **en une seule réécriture** |

**Preuve** [EXÉCUTÉ] : GP suspendu, même utilisateur → **avant** `a_acces_application` faux partout et 0 seau / 0 chantier / 0 projet visibles ; **après** vrai pour Colors/Réserves/Tools et 1/1/1 ligne visible (RLS) ; GP refusé. Colors suspendu ⇒ seul Colors refusé. Suspension plateforme du compte ⇒ **tout** refusé, y compris les autres applications ; lever la suspension rétablit.

**Limites — à lire** :
1. **La suspension plateforme ne coupe pas encore les données GP** (`est_membre_actif` ne lit pas la table ; sonde : compte suspendu, décision `suspension_plateforme`, mais 5 lignes de `types_chantier` restent lisibles). Elle ne sera honorée par GP qu'à l'étape 3 de D1 ou par un correctif d'une ligne dans `est_membre_actif` — **sensible (142 policies, chemin chaud) → lot dédié avec mesure de charge**. `DECISION_REQUIRED`.
2. **11 objets Réserves** (9 fonctions, 2 policies) appellent encore `est_membre_actif` : un utilisateur « autorisé » à Réserves y perd certaines lectures quand GP est suspendu (ex. `reserves_preferences_lire` → 0 ligne). **Proposition prête et prouvée** (`supabase/proposed/reserves_decouple_gp_suspension_v1.sql.proposed`, `annexe-d3-reserves-residu.md`) : 11 objets découplés (`pg_get_functiondef` avant/après : seul le prédicat change ; signatures, `SECURITY DEFINER`, ACL identiques), pgTAP **30/30** (16/30 échouent sans la proposition), 12 pgTAP Réserves/isolation/ACL **identiques au témoin**. **La recommandation d'une ligne de l'annexe D3 était FAUSSE pour 3 objets d'invitation** (`reserves_invitation_accepter`, `reserves_rejoindre_intervention`, `reserves_invitations_en_attente`) : y exiger `a_acces_application` est circulaire (l'acceptation *crée* l'entitlement et l'habilitation ; variante rejouée : 8/30 échecs) → `est_membre_organisation` seule pour ceux-là. Trois objets (préférences, annuaire) deviennent **plus restrictifs** pour un membre sans habilitation Réserves.
3. Support et communications d'un client GP suspendu (`support_msg_select`, `support_marquer_lus_entreprise`, segment `expire`) restent couplés : un client GP suspendu ne lit plus les réponses du support, même s'il utilise Colors. `DECISION_REQUIRED` (non modifié).
4. `plateforme_activer_application_entreprise` ne lève pas une suspension commerciale (deux actes distincts) ; FK de la suspension globale en `ON DELETE CASCADE` (à arbitrer avec l'audit RGPD).

## 8. Tools — D2 : Free personnel, Pro personnel ou organisationnel, contrôles **côté serveur**

**Décision D2 (Julien)** : Tools Free reste personnel (jamais bloqué, aucune entreprise). Tools Pro peut être **personnel** (compte → entitlement Pro utilisateur) ou **organisationnel** (compte → Tools Pro → membership actif → droits sur le projet). Pour tout projet d'organisation, contrôle serveur/RPC/RLS. Proposition : `supabase/proposed/tools_projects_server_side_access_v1.sql.proposed` ; détail `annexe-d2-tools-serveur.md`.

**Ce qui passait AVANT** [EXÉCUTÉ, base témoin] :
- **Pas d'IDOR inter-utilisateur/inter-organisation** : la RLS impose `user_id = auth.uid()` ; lire ou modifier par identifiant d'autrui → 0 ligne ; la RPC avec le `local_id` d'autrui crée **sa propre** ligne. *(Le P1 de la session précédente était donc plus étroit que « connaître l'identifiant » : l'abus réel est ci-dessous.)*
- **Membre Free et ex-abonné** (entitlement expiré/révoqué, habilitation `tools_pro` gardée) : INSERT direct dans l'organisation **accepté**, RPC `tools_sync_project_entreprise` **`applied`**, RPC historique idem → **le P1 T-P1-a est confirmé**.
- **Aucune borne** : 60 Mo de `project_payload` stockés ; 1 500 projets d'un seul utilisateur acceptés.
- Refus en `P0001` sans code exploitable ; types mal formés en `22P02` brut.
- **Couplage D3** : GP suspendu ⇒ un Pro sain refusé (via `est_membre_actif`) — corrigé par §7bis.

**Ce qui est bloqué APRÈS** [EXÉCUTÉ] : un projet d'organisation n'est accessible (lecture **et** écriture) que si l'utilisateur est **membre `actif`** (lu directement, **sans** l'abonnement GP), détient un **entitlement Tools Pro actif avec la capacité `saved-projects`**, et passe la couche « droits sur le projet » (`a_acces_application(org,'tools')`, conservée par défaut) ; le créateur reste seul propriétaire. Free et ex-abonné : refus RLS, RPC en `42501` avec `hint` machine (`tools_pro_requis`, `tools_org_non_autorisee`…) ; **`tools_resoudre_entitlements()` rend toujours `free`** — jamais un blocage applicatif. Bornes par trigger (RPC **et** écriture directe) : payload > 256 Kio → `54000`, > 500 projets actifs par utilisateur et organisation → `53400`, plafond de 5 000 lignes (supprimées comprises) → `53400` ; rien n'est tronqué. Deux corrections au passage : une révision attendue `null` contournait la détection de conflit ; conversions ratées → `22023` explicite. Non-régression : les Pro membres ont exactement les mêmes résultats qu'avant.

| Fichier pgTAP | Résultat |
| --- | --- |
| `tools_projects_access.test.sql` (70 assertions : acteurs × opérations × projets, IDOR, ex-abonné puis renouvellement, Pro sans `saved-projects`, bornes, ACL) | **70/70** ; **sans la proposition : 26 `not ok`** (le test a des dents) |
| `elsatia_tools_r8` / `r9` | 28/28 · 26/26 (identiques au témoin) |
| `elsatia_tools_r10` **original** | **échec par conception** : il encode l'ancien comportement (le membre `…0002` écrit dans le cloud avec l'habilitation seule, sans entitlement) — exactement l'abus fermé |
| `elsatia_tools_r10.adapted.test.sql` (deux blocs de fixture ajoutés, rien d'autre) | **17/17** |

**Perdent l'accès cloud à l'application de la migration** : membres Free, ex-abonnés (y compris sans `saved-projects`), Pro sans habilitation `tools_pro` ; aucune ligne supprimée, elles réapparaissent au renouvellement. **Requêtes de diagnostic à jouer AVANT déploiement** : en pied du fichier `.sql.proposed`.

**Client** : aucune dégradation de Pro en Free n'est introduite (`push` avale l'erreur, `SyncService` l'attrape par projet). Limite : l'utilisateur ne sait jamais pourquoi. Diff minimal proposé, **non appliqué** (annexe §8) : un `CloudSyncError` classé par `code`/`hint` dans `sync.ts` ; `syncNow` ne rappelle `refresh()` que sur `pro_requis`/`org_non_autorisee`.

**DECISION_REQUIRED** (défauts conservateurs appliqués) : (1) l'habilitation `tools_pro` est-elle redondante avec l'entitlement Pro ? — *les deux sont exigées* ; (2) un gestionnaire d'accès peut-il lire/écrire les projets d'un créateur ? — *aucun partage n'existe : créateur seul* ; (3) projets Pro **personnels** sans organisation : **aucun stockage serveur n'existe** — *non créé* ; (4) lecture seule pour un ex-abonné ? — *aucun accès* ; (5) purge des projets supprimés — *aucune, plafond de lignes* ; (6) valeurs des bornes (256 Kio, 500, 5 000) — *défauts conservateurs, marge ×6 sur le pire projet valide* ; (7) `portee_donnees='compte'` (migration 277) contredit la RLS par organisation ; pas d'entitlement d'organisation ; (8) administrateurs plateforme non membres et sessions d'assistance perdent l'écriture cloud d'organisation (membership `actif` exigé).

## 9. API protégées

Inventaire complet : `annexe-api-inventaire.md`. **Cible** : 401 JSON (non authentifié) · 403 JSON + `code` (interdit) · 423 (abonnement/essai verrouillé) · 409 (conflit métier) · 503 (panne) · jamais 307 HTML ni 500 pour un refus prévisible.

| Application | État actuel | Verdict |
| --- | --- | --- |
| **GP** | le **proxy répond avant la route** : `/api/*` non connecté → 307 `/login` ; refus de droit → 307 `/abonnement/module-non-inclus` / `/dashboard?acces=refuse` ; ~20 routes via `getContexteEntreprise()` (`redirect()` depuis un handler → 307 HTML) ; 4 routes avalent le `NEXT_REDIRECT` dans un `catch` → 400 trompeur ; les 401 écrits dans les routes sont **inatteignables** | 307 HTML |
| **Colors** | proxy n'authentifie rien ; 307 depuis `getContexteColors()` ; `photos`, `export/inventaire`, `ocr` : `AccesApplicationRefuseError` non rattrapée → **500** | 307 + 500 |
| **Réserves** | JSON 401/403/404/409/503 ; « anonyme » et « sans organisation » confondus en 401 | OK, P2 |
| **Studio** | JSON 401/403/404/409/503 (`media-service.ts`, modèle) ; pas de `code` stable | OK |

**Corrigé dans ce lot (triviaux, sans régression large)** :
1. Colors `photos` / `export/inventaire` / `ocr` : `try/catch` → **403 JSON** `{erreur, code:"refus_non_qualifie"}` ou **503** `{code:"indisponible"}` + `Retry-After` (helper `lib/refus-api-colors.ts`, 4 tests). Les chaînes littérales `getContexteColors()` / `exigerAccesApplication(contexte, "colors")` restent **dans chaque route** (le test `securite-ecritures.test.ts` les cherche).
2. Réserves `documents/chantier/[id]/pdf` : une **erreur** de `reserves_export_entete` n'est plus un « Chantier introuvable » 404 mais un **503** ; la réponse vide (RLS) reste **404** (anti-énumération, asserté par un e2e).
3. `AccesApplicationIndisponibleError` (sous-classe de `Error`, **même message**) dans `packages/application-access` : une panne de décision n'est plus reconnaissable au texte.
4. Helper commun `reponseRefusApi(code, {champMessage})` (`packages/application-access/src/refus-api.ts`, sans dépendance Next), prêt à adopter.

**Documenté, non appliqué (non triviaux)** : proxy GP → 401 JSON sur `/api/*` **conditionné à `sec-fetch-mode !== "navigate"`** (un 401 systématique afficherait du JSON brut sur les liens `<a href="/api/…pdf">`, `rgpd/export`) ; `getContexteEntrepriseApi()` (suspendu → 423, sans entreprise → 403) sur ~20 routes, **sans** sortir l'appel du `try` des 4 routes qui avalent le redirect ; Colors sans redirection (`lireContexteRefus`) ; Réserves « sans organisation » → 403 + client hors-ligne (`synchronisation.ts`, sans test unitaire : serveur d'abord) ; routes `tools/monetization` hors `PUBLIC_PATHS` (à vérifier sur pile locale : surface publique à décider).

## 10. Studio — signup fermé corrigé sur une **branche isolée** (pas de refonte, pas de raccord plateforme)

Écart inchangé : Auth **dédiée** (`config.toml`) alors que README/`.env.example` disent « partagée » ; membership = `studio_workspace_members` ; aucun contrat multi-app ELSATIA (raccord = lot séparé).

**Isolation** : Studio n'est pas dans cette branche. Vérifié : le tip `integration/studio-commercial-ready-v1` est resté à `05c775d5` et aucune branche `*studio*` ne touche `signup-gate`, `config.toml` ni les migrations d'admission → **pas de collision aujourd'hui**. Le correctif vit sur **`fix/studio-signup-closed-v1` @ `634651a0`** (un commit depuis `05c775d5`, worktree `/Users/juliengregurec/Projects/.worktrees/studio-signup-closed-v1`, **non poussé**) ; diff exporté : `access-convergence-v1/studio-signup-closed.patch` ; détail `annexe-studio-signup.md`.

**Correctif** : table `studio_signup_policy` (défaut **`closed`**, ligne absente = fermé, aucun GRANT ni policy) ; `studio_signup_permitted(email)` = source unique (ouvert / fermé / liste d'autorisation ou `@domaine` / invitation en attente) ; **hook Auth `before_user_created`** (403 au message identique pour tous les refus) ; **même prédicat** dans `studio_create_workspace` (défense en profondeur) ; la server action appelle la même fonction ; `STUDIO_SIGNUP_MODE` absent ou inconnu → **fermé** (l'ancien défaut « open » disparaît). Fichiers (9) : migration `20260921070000_studio_signup_policy.sql`, `supabase/tests/studio_signup_policy.test.sql`, `signup-gate.ts`, `entitlement.ts`, `tests/signup-gate.test.ts`, `config.toml`, `scripts/local-test.mjs`, `README.md`.

**Preuves** [EXÉCUTÉ] : **GoTrue réel** (v2.192.0 sur Postgres Supabase vierge) — **avant** : `POST /auth/v1/signup` → **200, compte créé** malgré la politique `closed` ; **après**, hook actif : **403** en mode fermé (0 compte créé) et pour une adresse hors liste ; 200 pour une adresse listée, un `@domaine` listé, une invitation en attente ou le mode ouvert ; politique supprimée → 403 (fail-closed). pgTAP `studio_signup_policy` **35/35** ; vitest **9/9**, `tsc` exit 0, eslint propre. Les 15 pgTAP Studio existants passent **à l'identique du témoin** sur base en politique `open` ; **en politique `closed` ils échouent tous** (leurs fixtures créent des utilisateurs en SQL puis appellent `studio_create_workspace`) — **la CI pgTAP Studio devra ouvrir la politique de test explicitement**. E2E Playwright non joués (pile Supabase CLI bloquée sur ce poste).

**Limites** : `config.toml` n'est **pas** appliqué au projet hébergé — le hook doit y être réglé (Authentication › Hooks), sinon le contournement reste ouvert en production et seul `studio_create_workspace` tient ; le hook agit sur tout le projet Auth (réservé à un projet **dédié**) ; invitation « squattable » sans confirmation d'e-mail (`enable_confirmations = true` doit rester actif) ; un invité accepté peut créer ses espaces en mode fermé. **Conflits possibles** si le train Studio avance : `signup-gate.ts`, `entitlement.ts`, bloc hook de `config.toml`, `local-test.mjs`, l'horodatage `20260921070000` (à renuméroter), toute autre redéfinition de `studio_create_workspace` ; `ELSATIA_STUDIO_CATALOGUE_ACCESS_CONTRACT.md` cite encore `STUDIO_SIGNUP_MODE`. **DECISION_REQUIRED** : politique par défaut en production (*`closed`*), liste d'autorisation initiale (*vide*), invité créateur d'espaces (*oui*), qui règle le hook hébergé et quand (*aucune action distante*).

## 11. Matrice UX cible (textes non modifiés dans ce lot)

| Situation (décision) | Écran / destination | Actions proposées | GP | Colors / Réserves / Tools / Studio |
| --- | --- | --- | --- | --- |
| Non connecté (`non_authentifie`) | login, **`next` conservé** | se connecter | idem | idem |
| Sans organisation (`sans_organisation`) | message clair | GP : **onboarding** (créer/rejoindre) ; autres : ouvrir le compte ELSATIA | onboarding | **jamais** de « créer une entreprise » ; Tools : Free |
| Invitation en attente | écran d'invitation | accepter | ✓ | ✓ (Réserves : `/invitation`, `/rejoindre`) |
| Validation en attente | écran d'attente | attendre l'administrateur | remplace le faux « Demande envoyée » | idem |
| Compte désactivé | écran **spécifique** | contacter l'administrateur ; se déconnecter | remplace `/en-attente` | idem |
| **Suspension plateforme** (`suspension_plateforme`) | écran dédié « compte suspendu par ELSATIA » | contacter le support ELSATIA (aucun nom d'entreprise exposé) | dédié | dédié |
| **Suspendu** | écran **dédié** commun | **Régulariser** pour un administrateur **seulement** ; sinon « Contactez votre administrateur » | garde `/abonnement-suspendu`, corrige le bouton non-admin | remplace « n'est pas activé » |
| Essai expiré | écran offres | choisir une offre (administrateur) | ✓ | ✓ |
| Application non incluse | **écran abonnement** | voir l'offre ; jamais la clé technique | remplace la clé brute `acces_devis` | ✓ |
| Sans habilitation / sans rôle | accès refusé | contacter l'administrateur — **seulement si un chemin d'habilitation existe** | à créer | Colors/Tools : à créer (P1-6) ; Réserves existe |
| Erreur technique (`indisponible` / `erreur_configuration`) | erreur technique + **réessayer** | réessayer ; **ne jamais** dire « pas d'entreprise » ni déconnecter | corrige P1-8 (erreur lue comme « pas d'entreprise ») | Colors/Réserves : déjà conforme au login (`91027209`) |

## 12. Corrections **réellement appliquées** (branche `fix/app-access-convergence-v1`)

| # | Changement | Fichiers | Tests |
| --- | --- | --- | --- |
| A1 | Logout **local** sur les refus d'accès (Colors, Réserves) | `apps/{colors,reserves}/src/app/actions.ts` | Colors `actions.test.ts` (+3), Réserves `actions.test.ts` (13) |
| A2 | Cas Réserves du validateur de redirection + preuve au niveau de l'action | `apps/reserves/src/lib/redirection-sure.test.ts`, `app/actions.test.ts` | +5 / 13 |
| A3 | Colors API : refus/panne → 403/503 JSON | `apps/colors/src/app/api/{photos,export/inventaire,ocr}/route.ts`, `lib/refus-api-colors.ts` | 4 |
| A4 | Réserves PDF : erreur RPC → 503 | `apps/reserves/src/app/api/documents/chantier/[id]/pdf/route.ts` | (e2e non rejouable) |
| A5 | Paquet partagé : `AccesApplicationIndisponibleError`, **contrat de décision v1 figé** (`suspension_plateforme`, `PORTEE_SUSPENSION`), helper d'API | `packages/application-access/src/{index,decision-acces,refus-api}.ts` | 44 |
| **A6** | **D1 étape 1 — observation GP** (`off` par défaut ; `enforce` rétrogradé ; aucun blocage) | `src/lib/acces-gp/**`, `src/lib/supabase/proxy.ts` (+20 lignes) | 209 (dont 68 de non-régression du proxy) |

Le code ne change le comportement **d'aucun utilisateur** tant que `ELSATIA_GP_ACCES_APP` n'est pas `observe`, et même alors il ne bloque personne.

## 13. Préparé, **non appliqué** (SQL sous `supabase/proposed/`, sans numéro de migration)

| Élément | Où | Condition d'usage |
| --- | --- | --- |
| **D3** statut par application, suspension plateforme, `est_membre_organisation`, RPC d'écriture | `supabase/proposed/per_application_status_and_platform_suspension_v1.sql.proposed` | numérotation au prochain train ; **prérequis** de la décision |
| `decision_acces_application` + diagnostic + `a_acces_application` réécrite | `packages/application-access/sql/decision_acces_application.sql.proposed` | après le précédent |
| **D2** Tools : RLS/RPC `tools_projects` (membre actif + entitlement Pro + droit projet, bornes, SQLSTATE stables) | `supabase/proposed/tools_projects_server_side_access_v1.sql.proposed` (+ requêtes de diagnostic à jouer avant) | **détecter avant** les utilisateurs qui perdraient le cloud |
| **D1** backfill GP (rapport, couverture, appliquer, retour arrière) | `supabase/proposed/gp_backfill_habilitations_v1.sql.proposed` | **fonctions seules** ; exécution = geste séparé, canari par organisation, après revue des ambigus |
| D3 résidu Réserves (11 objets) | `supabase/proposed/reserves_decouple_gp_suspension_v1.sql.proposed` (+ pgTAP 30 assertions) | après la réécriture de `a_acces_application` ; **DECISION_REQUIRED** : rôle `reserves_intervenant` auto-octroyé, suspension plateforme sur les 3 flux d'invitation |
| pgTAP des propositions | `supabase/proposed/tests/*.test.sql` (dont `elsatia_tools_r10.adapted.test.sql`) | à substituer aux tests d'origine à la numérotation |
| Jeu d'essai SQL (103 cas) | `docs/qualification/access-convergence-v1/decision-cases.sql` | rejouable sur toute base V3+ |
| Signup Studio | branche `fix/studio-signup-closed-v1` @ `634651a0` + `studio-signup-closed.patch` | fusion dans le train Studio ; **hook à régler sur le projet hébergé** |
| Port minimal du correctif de boucle Colors 265 | `…/colors-265-loop-fix-minimal.diff` | seulement si la 265 devait être déployée |
| **D1 étape 3 — enforcement** | annexe D1 §3 (checklist, design, E2E) | **aucun code** ; jamais sans preuve de couverture du backfill |
| Diff client Tools (`CloudSyncError`), proxy GP 401 conditionnel, `getContexteEntrepriseApi()` | annexes D2 §8 / API | lots dédiés |

## 14. P0 / P1 / P2 restants

**P0** — Colors 265 boucle (réf. **non retenue** ; conditionné au déploiement) · Studio `deleteUser` sur Auth partagée (conditionnel ; Auth dédiée présumée — Q5).
**P1** — **GP n'exige pas encore l'habilitation** (D1 en cours : observation livrée, backfill préparé, enforcement volontairement absent) · **la suspension plateforme ne coupe pas les données GP** (`est_membre_actif`) · **couplage résiduel GP → 11 objets Réserves (proposition prête, non appliquée), support et communications** (§7bis) · `/onboarding` ouvert à tout compte (GP) · aucun chemin d'habilitation par l'administrateur d'organisation (Colors/Tools/GP — prérequis de l'enforcement) · U1 `entreprise_active_id` modifiable (SEC-13, correctif 342 hors V3) · `/en-attente` faux pour un compte désactivé · erreur transitoire GP lue comme « pas d'entreprise » · Tools Pro payé sans organisation invisible (T-P1-b, décision D2 : à traduire côté client) · Réserves `on conflict do nothing` consomme le jeton d'invitation · **Studio : hook `before_user_created` à régler sur le projet hébergé** (sinon contournement ouvert).
*Fermés dans ce lot (en proposition, à appliquer) : Tools cloud sans contrôle d'entitlement serveur (T-P1-a) ; suspension GP qui coupait Colors/Tools/Réserves ; signup fermé Studio contournable et ouvert par défaut.*
**P2** — liens profonds perdus au login · API GP en 307 · `AccesApplicationRefuseError` non rattrapée hors des 3 routes Colors corrigées · Réserves sans error boundary, API « anonyme ≈ sans organisation » · pas d'AAL2 sur le bypass administrateur · Tools : verrous Pro côté interface uniquement pour le local (inévitable), message « Droits vérifiés » pour Free · trois copies du validateur de redirection · deux migrations `…236_*` et deux `…237_*` · cascade de la suspension globale (RGPD).

## 15. Décisions Julien

**Tranchées le 2026-09-21** : **D1** (GP exige l'habilitation, en 3 étapes, enforcement jamais direct) → §6 · **D2** (Tools Free personnel ; Pro personnel ou organisationnel ; contrôles serveur) → §8 · **D3** (suspension par application ; seule la suspension plateforme coupe tout) → §7bis.

**Non bloquantes — défaut conservateur appliqué, à confirmer** (`DECISION_REQUIRED`) :

| # | Question | Défaut appliqué |
| --- | --- | --- |
| Q4 | Seul GP crée des entreprises (onboarding) ? | règle inscrite dans le contrat (`ecranPourDecision`), **aucun changement de GP** |
| Q5 | Studio : Auth dédiée confirmée ? | **dédiée présumée** (config) ; le correctif signup y est calé ; suppression de compte inchangée |
| Q6 | Déconnexion volontaire : globale ou locale + « se déconnecter partout » ? | **globale** (comportement actuel, inchangé) |
| Q7 | Bypass administrateur plateforme : exiger AAL2 dans la décision ? | **non exigé** (comportement actuel) ; visible dans le diagnostic ; la suspension plateforme prime |
| Q8 | Comptes dépôt/borne et sessions d'assistance dans le contrat ? | **exemptés** de l'observation GP ; `ambigu` au backfill ; assistance non modélisée |
| Q9 | Validation de la priorité §7.3 (`essai_expire` réservé aux droits issus d'un essai ; ordre 10/11) | priorité **figée telle quelle** (demande « figer le contrat ») ; ordre 10/11 inchangé |
| Q10 | 12 décisions D-1…D-12 du backfill (annexe D1 §4) et 8 décisions Tools (§8) | défauts listés dans les annexes ; **rien n'est appliqué** |
| Q11 | Faire honorer la suspension plateforme par les données GP (`est_membre_actif`) | **non modifié** (lot dédié + mesure de charge) |
| Q12 | Découpler support/communications d'un client GP suspendu | **non modifié** |

## 16. Tests rejoués

| Suite | Résultat |
| --- | --- |
| Vitest `packages/application-access` + `src/lib/acces-gp` | **258/258** (paquet 49 dont 44 de contrat ; observation GP 209 dont 68 de non-régression du proxy) |
| Vitest Colors | **435/435**, 39 fichiers |
| Vitest Réserves | **216/216**, 16 fichiers |
| Vitest Tools (`apps/tools`, 20 fichiers dont `access`, `entitlements`, `projects/sync`) | **108/108** (aucun changement client) |
| pgTAP **des 5 propositions**, appliquées **ensemble dans l'ordre** (statut par application → décision → Tools → backfill GP → résidu Réserves) sur une base neuve (279 migrations) | `decision_acces_application` **66/66** · `per_application_status` **103/103** (avec et sans la proposition Réserves : son assertion « résidu » suit l'état réel ; fixture complétée pour l'interaction avec D2) · `tools_projects_access` **70/70** · `gp_backfill_habilitations` **73/73** · `reserves_decouple_gp_suspension` **30/30** (16/30 sans la proposition) · `elsatia_tools_r10.adapted` **17/17** |
| pgTAP **existants** rejoués APRÈS les 5 propositions (base intégrée) | `elsatia_multi_app_convergence_v1` 27 · `platform_global_owner_all_apps_v1` 40 · `platform_support_isolation_audit_v1` 67 · `platform_aal2_role_integrity_v1` 80 · `platform_support_uid_security_v1` 38 · `platform_admin_uid_canonical_v1` 13 · `reserves_v1` 98 · `v2` 94 · `v3_collaboration` 148 · `v3_parcours` 41 · `v4` 14 · `v5` 18 · `colors_canonical_integration_v1` 8 · `colors_functional_core_v1` 46 · `colors_integrity_v11` 41 · `elsatia_tools_r8` 28 · `r9` 26 · `isolation_multitenant_{comportement,roles,surface}` 56 · 24 · 10 — **tous PASS** ; **seul `elsatia_tools_r10` original échoue, par conception** (§8) ; l'agent Réserves a en outre rejoué `platform_residual_acl_hardening_r74` (28) et `platform_write_surface_hardening_v1` (23), identiques au témoin |
| Différentiel `a_acces_application` ancienne/nouvelle | 14 × 3 × 6 × 6 états : 0 refus nouveau, 0 autorisation nouvelle pour `gestion_pro` |
| GoTrue réel — portée du logout | prouvé (§4) |
| GoTrue réel — signup Studio | avant 200 / après 403 (§10) |
| Studio (branche isolée) | vitest 9/9, pgTAP 35/35, `tsc` 0, eslint propre |
| Typecheck | `tsc --noEmit` **racine** (GP : `src/lib/acces-gp`, proxy, paquet) **exit 0** ; paquet en `--strict` **exit 0** ; Colors et Réserves : dernier `tsc` exit 0 (lot V1, aucun fichier d'application modifié depuis) |
| Lint | **ESLint exit 0, aucune alerte** sur tous les fichiers modifiés : racine (`src/lib/acces-gp`, `proxy.ts`, `packages/application-access/src`), Colors (7 fichiers), Réserves (4 fichiers) — le blocage d'E/S du lot V1 ne s'est pas reproduit |

## 17. Non exécuté, à rejouer

- **E2E Playwright** (piles Supabase complètes requises, CLI bloquée sur ce poste) : parcours GP en mode `observe`, PDF Réserves (A4), invitation Réserves, signup Studio de bout en bout.
- **`next build`** non lancé ; **pgTAP complets du dépôt** (`supabase/tests/*`, ≈ 100 fichiers) non rejoués en bloc — seuls les fichiers concernés (liste §16) l'ont été.
- **Aucune application des propositions SQL** à une base durable ; **Production et Preview jamais observées** ; l'observation GP n'a jamais tourné contre une vraie base (la RPC n'existe pas en Production, ledger 210).
- **Client Tools** : diff `CloudSyncError` non appliqué ni testé.

## 18. Annexes

`access-convergence-v1/` : `annexe-d1-gp-observation-backfill.md`, `annexe-d2-tools-serveur.md`, `annexe-d3-suspension-par-application.md`, `annexe-d3-reserves-residu.md`, `annexe-studio-signup.md`, `annexe-gp-ecart-modele.md`, `annexe-tools-studio.md`, `annexe-api-inventaire.md`, `decision-cases.sql` / `.results.txt`, `logout-scopes.py` / `.out`, `colors-265-loop-fix-minimal.diff`, `studio-signup-closed.patch`. SQL proposé : `supabase/proposed/` et `packages/application-access/sql/`. Audit amont : `docs/audits/ELSATIA_APP_FIRST_ACCESS_AUDIT_V1.md` + `first-access-audit-v1/` (le patch `first-access-fixes-v3.patch` est **remplacé** par cette branche).
