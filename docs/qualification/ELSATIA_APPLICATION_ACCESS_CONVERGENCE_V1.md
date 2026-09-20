# ELSATIA — Convergence d'accès inter-applications — V1

Date : 2026-09-20 · Branche de travail `fix/app-access-convergence-v1` (locale, **non poussée**) · **Rien déployé, ni Preview ni Production touchés, aucun prix ni plan modifié, Studio non refondu.**
Suite de l'audit `docs/audits/ELSATIA_APP_FIRST_ACCESS_AUDIT_V1.md` (mêmes identifiants de constats).

## 0. Résumé

| Sujet | Résultat |
| --- | --- |
| Base de travail | `fix/colors-shared-auth-access-night-v1` @ `d7d59c9e` = **Train V3 (`59e960a0`) + 30 commits** (Colors V1.5, compte partagé, correctifs Réserves du 2026-09-20). C'est la version la plus récente et la plus complète de Colors/Réserves/Tools qui contient V3 |
| P1 « open-redirect Réserves » | **Déjà corrigé à la base** (`96db69fc`, validateur identique à Colors, 37 tests). Non redoublé. J'ai ajouté les cas Réserves demandés et un test **au niveau de l'action** |
| P1 « logout global sur refus » | **Corrigé** (Colors + Réserves) et **prouvé sur un vrai GoTrue** : `scope:'local'` laisse GP/Réserves connectés, `signOut()` les coupe instantanément (§4) |
| P0 « Colors 265 boucle sur `/acces-refuse` » | Cause, commit correcteur et **port minimal en 5 fichiers** identifiés et testés sur une copie de Colors 265 (§3). **Ne jamais déployer Colors 265 tel quel** |
| Écart GP (`droit_acces=true` / `a_acces_application=false`) | Expliqué ligne à ligne : **deux modèles sans brique commune**. Convergence en 3 paliers, **palier 0 = observation seule** (§6). Rien codé côté GP |
| Contrat `decision_acces_application` | Livré en **contrat TypeScript testé** + **prototype SQL non numéroté validé 59/59** sur base jetable (279 migrations), invariant `autorise ⇔ a_acces_application` : 0 violation (§7) |
| API | 2 corrections triviales appliquées (Colors 403/503 JSON ; Réserves PDF 503 sur erreur RPC), helper commun prêt, reste documenté (§9) |
| Tools | Free jamais bloqué, contrat écrit. **2 P1 côté cloud** (RLS/RPC `tools_projects` sans entitlement) (§8) |
| Studio | Écart documenté ; signup fermé **contournable en un appel** (P1), correctif proposé, non appliqué (§10) |

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
| **Gestion Pro** | cookie SSR propre à l'origine ; proxy `getUser()`, `/login` sans `next` | `entreprise_active_id` + `utilisateurs_entreprises.statut` ; sans entreprise → `/onboarding` **(création ouverte à tout compte)** | abonnement / offre / `modules_entreprises` (+ socle d'essai). **`acces_applications_entreprises` jamais lue** | **permissions de poste** (`permissions_poste`). Habilitation `gestion_pro_*` **jamais lue** | **écran dédié** `/abonnement-suspendu` (seule app) | sans objet (GP ne déconnecte pas sur refus) ; déconnexion volontaire = `signOut()` **global** (à trancher, §11) | module non inclus (clé brute) ; refus de rôle **muet** (`?acces=refuse` non lu) ; `/en-attente` faux pour un compte désactivé | **hors modèle multi-app** — convergence par paliers (§6) |
| **Colors** | cookie SSR ; proxy = rafraîchissement seul ; garde au layout `exigerShellColors` | `contexte_application_courant` | `acces_applications_entreprises` via `a_acces_application` | `habilitations_applications_utilisateurs` | non distinguée : « n'est pas activé » | **oui — appliqué** (4 sites de refus) ; volontaire/mot de passe = global | codes fermés (login) ; `/acces-refuse`, `/abonnement-requis` (sans boucle en V3+) | **OK** ; API : 403/503 JSON **appliqués** ; motif fin dépend du contrat §7 |
| **Tools** | supabase-js **client** (aucun serveur) ; compte facultatif | facultative (`tools_lister_entreprises_autorisees`) pour le cloud | **par utilisateur** (`entitlements_utilisateurs_elsatia`), Free par défaut | `tools_pro` (habilitation d'organisation) pour le cloud seulement | coupe le cloud via `est_membre_actif` → Free | **déjà local** (`AccountProvider.tsx:96`) | unique : « mode Free » | **contrat particulier** (§8) ; **2 P1 cloud** |
| **Réserves** | cookie SSR ; proxy = rafraîchissement + CSP ; garde layout **et** par page | `contexte_application_courant` | `a_acces_application` (droit d'usage) | habilitation (`reserves_*`) + invitations (lien, désignation) | non distinguée (« pas encore ouvert ») | **oui — appliqué** (4 sites) ; volontaire = global | codes fermés ; `/acces-refuse` (action réelle : `reserves_attribuer_role`) | **OK** ; open-redirect fermé (base) ; API « anonyme ≈ sans organisation » (P2) |
| **Studio** | **Auth dédiée** prévue (`config.toml`) — README dit « partagée » (contradiction) | **workspace** (`studio_workspaces`), pas d'entreprise | **aucun à l'exécution** ; filtre à l'inscription seulement | `studio_workspace_members` (owner/admin/editor/viewer) | kill-switch global 503 ; `admission_open` | sans objet (aucun refus par droit d'app) | login générique ; invitation « indisponible » (sans oracle) | **isolé** ; raccord = lot séparé ; signup fermé contournable (P1) |

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

## 6. GP hors modèle multi-app

Analyse détaillée : `annexe-gp-ecart-modele.md`. **Aucun code GP modifié.**

**Pourquoi GP autorise alors que `a_acces_application` refuse** [LU, prouvé par l'audit précédent] — les deux décisions ne partagent **aucune brique** :

| Couche | `a_acces_application` | GP (proxy) |
| --- | --- | --- |
| Organisation | `est_membre_actif` (statut `actif` + abonnement ∉ {suspendu, annulé}) | `utilisateurs_entreprises.statut='actif'` + `entreprise.ts:172-203` |
| Abonnement / offre | `acces_applications_entreprises` (fenêtre) | `entreprises.abonnement_*`, `modules_entreprises`, socle d'essai |
| Habilitation / rôle | oui | **jamais** |
| Permission de poste | jamais | oui (`contexte_acces_proxy` : `ue × permissions_poste`, migration `…000117:52-65`) |

Le socle multi-app a été porté depuis Colors et « n'accorde aucun droit automatiquement » (`…000234:1-7`) ; **GP n'y a jamais été branché**. Aucun trigger/backfill ne crée d'habilitation `gestion_pro` (bootstrap, rejoindre par code, activer compte employé, Stripe, essai : **non** partout) ; seuls les RPC plateforme (`total` + AAL2) et Réserves écrivent ces tables.

**Conséquences** : (1) désactiver GP pour une organisation côté plateforme n'a **aucun effet** dans GP ; (2) exiger `a_acces_application` demain **coupe tous les membres actuels** (aucune habilitation, aucune ligne `gestion_pro`) ; (3) l'assistance ne peut pas ouvrir de session GP sans droit d'usage (`…000277:675-686`).

**Convergence proposée — 3 paliers, aucun n'est appliqué** :

| Palier | Contenu | Risque | Retour arrière |
| --- | --- | --- | --- |
| **0 — observation** | flag `ELSATIA_GP_ACCES_APP=observe` : le proxy appelle `a_acces_application` en parallèle (échantillonné, `try/catch`, RPC absente en Production ledger 210) et **journalise l'écart** sans rien changer | quasi nul | retirer la variable |
| **1 — backfill + triggers** | migration additive idempotente : `acces_applications_entreprises(gestion_pro, source='backfill_gp_socle')` pour les entreprises ≠ `annule` ; habilitation `gestion_pro_admin`/`_utilisateur` pour chaque membre `actif` ; triggers sur activation / poste / création d'entreprise. **Aucune colonne de prix ni de plan** (vérifié : ces tables n'en ont pas) ; ne jamais écrire `modules_entreprises`, `abonnement_offre`, `capacite_*` | moyen (effets visibles : sélecteur d'applications, compteurs d'annuaire) | suppression par `source`/`attribue_par is null` ; `drop trigger` |
| **2 — enforcement** | `…=enforce`, **seulement** si l'écart mesuré est nul 7 jours, avec exemptions : `PUBLIC_PATHS`, webhooks Stripe, crons, `paie/import`, Powens, portail `/document`, `/imprimer/partage`, `/api/tools/monetization/*`, sortie d'essai, onboarding, `/plateforme*`, comptes dépôt, sessions d'assistance | élevé | repasser à `observe` |

**Risques utilisateurs historiques** : tous les membres actuels perdraient l'accès au palier 2 sans palier 1 ; comptes dépôt/borne (`est_compte_depot_courant`) à classer ; entreprise repassant d'`annule` à actif à couvrir par trigger ; **Production au ledger 210** (tables absentes) → aucun palier 1/2 avant la migration de cutover. Migration : **numéro non réservé** (`NEXT_MIGRATION_AFTER_CONVERGED_TRAIN`). **Non trivial, hors petit lot** : fusion `contexte_acces_proxy` / `a_acces_application`, chemin d'habilitation par l'admin d'entreprise (aujourd'hui `total`+AAL2 seulement), rôle applicatif vs poste.

## 7. Contrat `decision_acces_application` (v1)

Livrables : `packages/application-access/src/decision-acces.ts` (+ test), `refus-api.ts`, `sql/decision_acces_application.sql.proposed` (**non numéroté, non dans `supabase/migrations`**), `docs/qualification/access-convergence-v1/decision-cases.sql` + `.results.txt`.

### 7.1 Signature
`decision_acces_application(p_application_code text, p_entreprise_id uuid default null) returns jsonb` — `security definer`, `stable`, `authenticated` seulement. `a_acces_application` **reste** (compat.) ; à terme `= (decision_acces_application(...)->>'decision') = 'autorise'`.

### 7.2 Retour (vue client)
```json
{ "version": 1, "decision": "abonnement_suspendu", "application_code": "colors",
  "role_code": null, "entreprise": { "id": "…", "nom": "…" } }
```
`role_code` : seulement si `autorise`. `entreprise` : seulement si l'appelant **possède une appartenance** (tout statut) à cette entreprise ; sinon `null`.

### 7.3 Décisions et **priorité d'évaluation** (la première qui s'applique gagne)

| # | Décision | Règle | HTTP | Écran cible |
| --- | --- | --- | --- | --- |
| 1 | `non_authentifie` | `auth.uid() is null` | 401 | login |
| 2 | `erreur_configuration` | application inconnue/inactive, statut de membre inconnu, entreprise introuvable | 500 | erreur technique |
| 3 | `autorise` (bypass) | administrateur plateforme actif, identité active, application active | 200 | application |
| 4 | `sans_organisation` | `entreprise_id` nul ou **aucune** appartenance | 403 | GP : onboarding ; ailleurs : compte ELSATIA |
| 5 | `invitation_en_attente` | membre `invite` | 403 | accepter l'invitation |
| 6 | `validation_en_attente` | membre `en_attente_validation` (rejoint par code) | 403 | attendre la validation |
| 7 | `utilisateur_desactive` | membre `desactive` | 403 | compte désactivé |
| 8 | `entreprise_inactive` | `abonnement_statut='annule'` (hors session d'assistance) | 423 | entreprise inactive |
| 9 | `abonnement_suspendu` | `suspendu` ou `suspension_prevue_at ≤ now()` (hors assistance) | 423 | suspendu (dédié) |
| 10 | `essai_expire` | droit d'usage hors fenêtre **et** `source='essai'` | 423 | essai expiré → offres |
| 11 | `application_non_incluse` | pas de droit d'usage, désactivé, ou hors fenêtre (hors essai) | 403 | abonnement / offres |
| 12 | `sans_habilitation` | aucune ligne d'habilitation pour cette application | 403 | accès refusé |
| 13 | `sans_role` | habilitation existante mais inopérante : `autorise=false`, hors fenêtre, rôle inactif | 403 | accès refusé |
| 14 | `autorise` | tout le reste, avec `role_code` | 200 | application |

**Pourquoi cet ordre** : (a) les états **personnels** (4-7) précèdent les états **d'entreprise** (8-10), sinon on révèle à un non-membre, ou à un membre en attente/désactivé, l'état commercial de l'entreprise — c'est le défaut P1-7 de l'audit ; (b) entreprise → droit d'usage → habilitation → rôle : du plus général au plus fin ; (c) `erreur_configuration` avant tout jugement métier (échec fermé).

**Décisions produites côté client, jamais par la base** : `indisponible` (RPC muette : 503, **jamais un refus, jamais une déconnexion**, réessayable) ; `refus_non_qualifie` (adaptateur transitoire d'un `false` de l'ancienne RPC).
Hors contrat, **volontairement** : les **permissions métier de poste** (couche 5, `permission_refusee`, restent à GP) et le **module non inclus** (grain fin GP).

### 7.4 Exposable au client / réservé aux logs et administrateurs

| Exposable (vue client) | Réservé aux logs serveur et administrateurs (`diagnostic_acces_application`, administrateur plateforme) |
| --- | --- |
| code de décision, application, **son propre** rôle, nom de l'entreprise **s'il en est membre** | statut d'abonnement brut, `suspension_prevue_at`, fenêtres de validité, `source` du droit, identifiants de lignes, `attribue_par`, autres appartenances, bypass utilisé, message d'erreur SQL |
| action suggérée (`regulariser_abonnement` seulement pour un administrateur de l'entreprise) | jamais de PII dans les logs applicatifs : décision + application + hash de l'utilisateur |

**Prouvé** : un compte sans appartenance qui pointe `entreprise_active_id` vers une entreprise suspendue tierce obtient `{"decision":"sans_organisation","entreprise":null}` — **aucune fuite**, contrairement à `contexte_abonnement_courant` (U1). Le noyau `_decision_acces_noyau` n'est appelable par aucun rôle applicatif ; le diagnostic est refusé à un non-administrateur (42501).

### 7.5 Validation exécutée (base jetable, 279 migrations, `decision-cases.results.txt`)
59 cas → **59 PASS** : les 7 situations demandées (sans organisation, sans entitlement, sans rôle, suspendu, autorisé, désactivé, invitation) × 4 applications, plus entreprise annulée, essai expiré, validation en attente, suspension prévue échue, habilitation hors fenêtre, application inconnue, absence de jeton, Julien tel que documenté (`en_attente` → `sans_organisation`). **Invariant `decision='autorise' ⇔ a_acces_application` : 0 violation.**
Côté TypeScript (`decision-acces.test.ts`, 40 tests) : matrice situation → écran / statut / déconnexion, invariants (seul `autorise` rend 200 ; aucune décision ne prescrit une déconnexion globale ; une panne n'est jamais `sans_organisation`), lecture **fail-closed** (`true`, objet vide, code inconnu, version ultérieure → `erreur_configuration`, jamais `autorise`).

### 7.6 Points ouverts du contrat
Session d'assistance et **comptes dépôt/borne** (non modélisés) ; **AAL2** du bypass administrateur plateforme (aujourd'hui aucune exigence — décision produit) ; `essai_expire` de **GP** (`abonnement_essai_fin`) hors périmètre tant que GP n'est pas branché ; exiger aussi `total` + AAL2 pour le diagnostic.

## 8. Tools — contrat particulier

| Situation | Comportement voulu | Réel |
| --- | --- | --- |
| Anonyme, sans compte, sans entreprise, sans habilitation, sans entitlement, entreprise suspendue | **Free** (`basic-calculation`, `basic-tracing`, `site-instructions`), **jamais bloqué** | conforme : `FREE_ACCESS` codé en dur, tout échec de résolution retombe sur Free |
| Entitlement `pro` actif (+ capacité) | Pro | conforme |
| Cloud (projets synchronisés) | entitlement **et** droit d'organisation **et** rôle `tools_pro` | **incomplet côté serveur** (ci-dessous) |

**Le moteur Pro tourne dans le navigateur** (composants importés statiquement, précachés par le service worker, exports/impression locaux) : la protection y est purement interface (`hasCapability()`), et le cache d'entitlement est signé avec une clé stockée au même endroit. Inévitable pour une SPA hors ligne ; **P2 assumé** (la valeur protégée est le cloud et la facturation).

**Ne pas transformer Tools en système bloqué** : le contrat commun (§7) s'y applique **uniquement** à la synchronisation cloud ; en cas de refus, Tools reste en Free et affiche la **cause** (sans organisation / sans habilitation / suspendue) au lieu du seul « mode Free ».

| P1 | Constat | Scénario | Correctif |
| --- | --- | --- | --- |
| **T-P1-a** | la RLS de `tools_projects` et la RPC `tools_sync_project_entreprise` (`20260831000238:49-62,73`) ne testent que `a_acces_application(org,'tools')` : ni l'entitlement utilisateur ni la capacité `saved-projects` ; `project_payload` non borné, aucun quota de lignes | un abonné résilie : l'interface repasse en Free, mais son JWT et son organisation gardent l'accès `tools` → `POST /rest/v1/tools_projects` (clé publique) **continue d'écrire du cloud sans droit Pro** | ajouter le test d'entitlement/capacité dans la RLS et la RPC + borne de taille et quota — **migration**, lot dédié |
| **T-P1-b** | l'achat Pro ne vérifie aucune entreprise ; la base exige un accès d'organisation, l'interface un accès + entitlement ; migration 277 déclare Tools `portee_donnees='compte'` alors que la RLS reste par entreprise | un particulier paie Tools Pro sans organisation activée : débité, reste Free | trancher `compte` vs `entreprise` (Q2) |

P2 : une exception de sync rétrograde un Pro sain en Free ; catalogue public appelant Stripe sans limite de débit ; achat réel impossible en l'état (clés de test, Apple SANDBOX, Google `sandbox`).

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

## 10. Studio — écart documenté, pas de refonte

- **Identité** : Auth **dédiée** (`config.toml:1-3`, contrat d'accès §1, Q-004) — le README/`.env.example` disent encore « partagée » : **à aligner** ; `deleteUser` supprimerait l'identité **commune** si l'Auth était partagée (P0 conditionnel).
- **Membership** : `studio_workspace_members` ; aucune notion d'entreprise ni de droit applicatif ELSATIA ; `EntitlementProvider.canSignUp` = interrupteur provisoire, **jamais appelé à l'exécution**.
- **Contrat multi-app final** : absent (ni émetteur ni vérificateur de jeton d'habilitation). **Raccord = lot séparé.**

**Signup fermé — contournable par un chemin évident (P1, non corrigé)** :
(a) `POST /auth/v1/signup` avec la clé publique crée un compte : `enable_signup=true` (`config.toml:181,226`), hook `before_user_created` commenté, garde seulement dans la server action (`actions.ts:69-70`) ; (b) ce compte peut ouvrir un workspace (`studio_create_workspace` accordée à `authenticated`, sans admission ; jusqu'à 20 espaces) et lancer des rendus (30/h) ; (c) invitation : pas de rejeu (jeton 32 octets haché, usage unique, adresse liée) — réserves : confirmation e-mail coupée sur l'hébergé, adresse invitée « squattable » ; (d) `STUDIO_SIGNUP_MODE` **ouvert par défaut** (`signup-gate.ts:4-5`) contre le contrat fail-closed.
**Correctif minimal recommandé (non appliqué)** : table `studio_signup_policy` (défaut `closed`) + `studio_signup_permitted(email)`, hook `before_user_created` fail-closed, même prédicat dans `studio_create_workspace`, adapter 5 fixtures E2E. `enable_signup=false` + clé service écarté (place le secret le plus fort dans le chemin d'inscription).

## 11. Matrice UX cible (textes non modifiés dans ce lot)

| Situation (décision) | Écran / destination | Actions proposées | GP | Colors / Réserves / Tools / Studio |
| --- | --- | --- | --- | --- |
| Non connecté (`non_authentifie`) | login, **`next` conservé** | se connecter | idem | idem |
| Sans organisation (`sans_organisation`) | message clair | GP : **onboarding** (créer/rejoindre) ; autres : ouvrir le compte ELSATIA | onboarding | **jamais** de « créer une entreprise » ; Tools : Free |
| Invitation en attente | écran d'invitation | accepter | ✓ | ✓ (Réserves : `/invitation`, `/rejoindre`) |
| Validation en attente | écran d'attente | attendre l'administrateur | remplace le faux « Demande envoyée » | idem |
| Compte désactivé | écran **spécifique** | contacter l'administrateur ; se déconnecter | remplace `/en-attente` | idem |
| Entreprise inactive/annulée | écran dédié | contacter l'administrateur | dédié | dédié |
| **Suspendu** | écran **dédié** commun | **Régulariser** pour un administrateur **seulement** ; sinon « Contactez votre administrateur » | garde `/abonnement-suspendu`, corrige le bouton non-admin | remplace « n'est pas activé » |
| Essai expiré | écran offres | choisir une offre (administrateur) | ✓ | ✓ |
| Application non incluse | **écran abonnement** | voir l'offre ; jamais la clé technique | remplace la clé brute `acces_devis` | ✓ |
| Sans habilitation / sans rôle | accès refusé | contacter l'administrateur — **seulement si un chemin d'habilitation existe** | à créer | Colors/Tools : à créer (P1-6) ; Réserves existe |
| Erreur technique (`indisponible` / `erreur_configuration`) | erreur technique + **réessayer** | réessayer ; **ne jamais** dire « pas d'entreprise » ni déconnecter | corrige P1-8 (erreur lue comme « pas d'entreprise ») | Colors/Réserves : déjà conforme au login (`91027209`) |

## 12. Corrections **réellement appliquées** (branche `fix/app-access-convergence-v1`)

| # | Changement | Fichiers | Tests |
| --- | --- | --- | --- |
| A1 | Logout **local** sur les refus d'accès (Colors, Réserves) | `apps/{colors,reserves}/src/app/actions.ts` | Colors `actions.test.ts` (+3 tests, 2 assertions renforcées), Réserves `actions.test.ts` (nouveau) |
| A2 | Cas Réserves du validateur de redirection + preuve au niveau de l'action | `apps/reserves/src/lib/redirection-sure.test.ts`, `app/actions.test.ts` | +5 validateur / 13 action |
| A3 | Colors API : refus/panne → 403/503 JSON | `apps/colors/src/app/api/{photos,export/inventaire,ocr}/route.ts`, `lib/refus-api-colors.ts` | 4 |
| A4 | Réserves PDF : erreur RPC → 503 | `apps/reserves/src/app/api/documents/chantier/[id]/pdf/route.ts` | (e2e existant, non rejouable ici) |
| A5 | Paquet partagé : `AccesApplicationIndisponibleError`, contrat de décision, helper de réponse d'API | `packages/application-access/src/{index,decision-acces,refus-api}.ts` | 40 |

## 13. Préparé, **non appliqué**

| Élément | Où | Condition d'usage |
| --- | --- | --- |
| Prototype SQL `decision_acces_application` + diagnostic | `packages/application-access/sql/decision_acces_application.sql.proposed` | numérotation au prochain train ; lot de raccordement des apps |
| Jeu d'essai SQL (59 cas) | `docs/qualification/access-convergence-v1/decision-cases.sql` | rejouable sur toute base V3+ |
| Port minimal du correctif de boucle Colors 265 | `…/colors-265-loop-fix-minimal.diff` | seulement si la 265 devait être déployée |
| Paliers GP 0/1/2 | §6 | décision Q1 |
| Correctif signup Studio, RLS Tools cloud, proxy GP 401 conditionnel | §8-§10 | lots dédiés |

## 14. P0 / P1 / P2 restants

**P0** — Colors 265 boucle (réf. **non retenue** ; conditionné au déploiement) · Studio `deleteUser` sur Auth partagée (conditionnel, à trancher avant Preview).
**P1** — modèles d'accès divergents (GP) · `/onboarding` ouvert à tout compte (GP) · aucun chemin d'habilitation par l'admin d'organisation (Colors/Tools) · suspension non distinguée et couplée entre apps (`est_membre_actif`) · U1 `entreprise_active_id` modifiable (déjà SEC-13 ; correctif 342 hors V3) · `/en-attente` faux pour un compte désactivé · erreur transitoire GP lue comme « pas d'entreprise » · **Tools cloud sans contrôle d'entitlement serveur (T-P1-a)** · **Tools Pro payé invisible (T-P1-b)** · Réserves `on conflict do nothing` consomme le jeton d'invitation · **Studio signup fermé contournable** et ouvert par défaut.
**P2** — liens profonds perdus au login (aucune app ne conserve `next`) · API GP en 307 · `AccesApplicationRefuseError` non rattrapée hors des 3 routes Colors corrigées · Réserves sans error boundary, API « anonyme ≈ sans organisation » · pas d'AAL2 sur le bypass administrateur plateforme · Tools : verrous Pro côté interface, message « Droits vérifiés » pour Free · trois copies du validateur de redirection · deux migrations `…236_*` et deux `…237_*`.

## 15. Décisions Julien restantes

1. **Q1** — GP doit-il exiger l'habilitation applicative (palier 2) ou le poste reste-t-il la seule porte ? *(bloque §6)*
2. **Q2** — Tools : Pro lié à une organisation, ou à l'entitlement personnel seul (`portee_donnees='compte'`) ? *(bloque T-P1-a/b)*
3. **Q3** — La suspension d'abonnement GP doit-elle couper Colors/Réserves/Tools ? *(couplage `est_membre_actif`)*
4. **Q4** — Seul GP crée des entreprises (onboarding) ?
5. **Q5** — Studio : Auth dédiée confirmée ? *(bloque suppression de compte et raccord)*
6. **Q6** — Déconnexion volontaire : globale (actuel) ou locale + « se déconnecter partout » ?
7. **Q7** — Bypass administrateur plateforme : exiger AAL2 dans la décision ?
8. **Q8** — Quels comptes (dépôt/borne, assistance) entrent dans le contrat de décision ?
9. Validation de la **priorité** du §7.3 (notamment `entreprise_inactive` vs `abonnement_suspendu`, et `essai_expire` réservé aux droits d'usage issus d'un essai).

## 16. Tests rejoués et limites

| Suite | Résultat |
| --- | --- |
| Colors (`apps/colors`) | **435 tests** (base 428 + 3 action + 4 helper) : 434 verts au passage complet ; le 435e (`nettoyage-photo.test.ts`, 5 s de délai dépassé sous charge, 3 suites lancées en parallèle sur volume externe) **20/20 rejoué seul**. `tsc --noEmit` **exit 0** |
| Réserves (`apps/reserves`) | **216/216** (base 198 + 13 action + 5 validateur), 16 fichiers. `tsc --noEmit` **exit 0** |
| `packages/application-access` | **45/45** (5 existants + 40 contrat). `tsc --strict` des 3 sources **exit 0** |
| SQL : matrice décision | **59/59 PASS**, invariant 0 violation |
| GoTrue réel : portée du logout | prouvé (§4) |
| Port minimal Colors 265 (copie) | `acces-refuse.test.ts` **13/13** |

**Limites** : voir §17 ; pas de pgTAP existants rejoués (la fonction proposée est additive, aucune migration modifiée) ; pas de test navigateur ; Production/Preview non observées ; le PDF Réserves ne se teste qu'en e2e (pile Supabase complète).

## 17. Non exécuté, à rejouer

- **ESLint** : lancé sur les fichiers modifiés de Colors, **non terminé** (bloqué en E/S sur le volume externe, 4 s de CPU en 16 min, tué) — **à rejouer** ; aucune erreur de lint n'a été observée, aucune n'est affirmée absente.
- **`next build`** : non lancé.
- **pgTAP existants** : non rejoués (aucune migration modifiée ; la fonction SQL proposée est hors `supabase/migrations`).
- **E2E Playwright** : non rejoués (piles Supabase complètes requises) — notamment le PDF Réserves (A4) et le parcours d'invitation.

## 18. Annexes

`access-convergence-v1/` : `annexe-gp-ecart-modele.md`, `annexe-tools-studio.md`, `annexe-api-inventaire.md`, `decision-cases.sql` / `.results.txt`, `logout-scopes.py` / `.out`, `colors-265-loop-fix-minimal.diff`. Audit amont : `docs/audits/ELSATIA_APP_FIRST_ACCESS_AUDIT_V1.md` + `first-access-audit-v1/` (le patch `first-access-fixes-v3.patch` de ce dossier est **remplacé** par cette branche).
