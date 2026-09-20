# ELSATIA — Audit « premier accès d'un utilisateur existant à une application » — V1

Date : 2026-09-20 · Lecture seule sur le code · **Production non touchée** · aucun fichier suivi du dépôt modifié.
Compte de référence : `julien@elsatia.fr` (état modélisé, voir §2).

## 0. Périmètre, sources et niveau de preuve

| Sujet | Réf. lue | Pourquoi |
| --- | --- | --- |
| GP + Colors + Tools + Réserves (multi-app) | Train V3 `integration/elsatia-ecosystem-train-v3-commercial-platform-v1` @ `59e960a0` (ledger 278) | seule réf. contenant les 4 apps + `a_acces_application` complet |
| Colors, Tools, GP « courants » | branche courante `feat/stripe-test-canonical-prices-p0-v1` @ `df58d813` (ledger 265) | comparaison |
| Studio | `integration/studio-commercial-ready-v1` @ `05c775d5` | seule réf. contenant Studio |

**Autres produits.** *Drone/Scan* n'existe qu'au catalogue (`statut_produit='bientot'`, aucun code). *Boutique* est un module de GP. *Market* et *Contact/Card* : zéro code. Rien d'autre à auditer.

Trois niveaux de preuve, marqués dans le texte :
- **[EXÉCUTÉ]** joué pour de vrai : les 278 migrations V3 appliquées sur un Postgres jetable (image Supabase 17.6), puis les RPC appelées sous le rôle `authenticated` avec un JWT par compte. Détail : `first-access-audit-v1/scenarios-sql-v3.sql` + `.results.txt`. Conteneur supprimé après usage.
- **[LU]** prouvé par lecture du code (chemin:ligne dans les annexes).
- **[INFÉRÉ]** conséquence probable non rejouée.

**Ce qui n'a PAS été fait** : pas de navigateur ni de GoTrue réel (les messages cités sont ceux du code source, pas des captures) ; pas de test sur Production/Preview ; pas de vérification de la config Supabase hébergée (`enable_signup`, hooks) ; pas de rejeu du cas 10 (refresh) autrement que par lecture.

## 1. Tableau demandé (référence V3, sauf mention)

| App | Sans entreprise | Sans entitlement | Sans rôle | Suspendu | Autorisé | Boucle / erreur | Cohérent avec les autres |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Gestion Pro** | 307 `/onboarding` → 200 « Configurer votre accès » + formulaire **« Créer une nouvelle entreprise »** (proposé à tout compte, membre actif compris) | 307 `/abonnement/module-non-inclus` (200) : « Module optionnel non inclus », clé brute `acces_devis` affichée. **`a_acces_application` jamais appelée** | 307 `/dashboard?acces=refuse` : **aucun texte** (le paramètre n'est lu par personne) | **Écran dédié** `/abonnement-suspendu` (seule app) ; bouton « Régulariser » montré aux non-admins → refus | 200 `/dashboard` | Faux-boucle : essai expiré non-admin `abonnement-suspendu` ↔ `dashboard?acces=refuse` sans message. Erreur transitoire lue comme « pas d'entreprise » → `/onboarding`. `/api/*` : 307 HTML, jamais 401/403 | **Non** — modèle propre (poste + abonnement + modules) |
| **Colors** | login : `/login?error=…` « Votre compte ELSATIA ne dispose pas d'un accès actif à Colors » ; session : `/acces-refuse?motif=appartenance` | `/abonnement-requis` « ELSATIA Colors n'est pas activé » (+ nom de l'organisation) | `/acces-refuse` « Votre compte n'a pas d'habilitation Colors active. Contactez l'administrateur » — **action impossible** (aucun outil org) | Même écran que « sans entitlement » (« n'est pas activé ») : suspension **non distinguée** | 200 dashboard | **Branche courante (265) : redirection infinie** sur `/acces-refuse` (P0, corrigé en V3). `AccesApplicationRefuseError` non attrapée hors `/api/acces` → 500 | Oui avec Réserves (même décision), non avec GP/Tools/Studio |
| **Tools** | Pas de refus : mode **Free**, « Aucune entreprise autorisée pour Tools · mode Free » | Free (même message) | Free (même message) | Free (même message), cause jamais donnée | Pro si org + rôle `tools_pro` + entitlement perso (3 barrières indépendantes) | Aucun serveur, aucun 4xx. Verrous Pro **uniquement côté navigateur**. « Droits vérifiés » affiché à un compte Free | **Non** — n'échoue jamais ; modèle par utilisateur |
| **Réserves** | login : « …pas d'accès actif à Réserves » ; session : `/acces-refuse` (bouton « Voir mes invitations » **mort**) ; API : 401 « session expirée » (faux) | `/abonnement-requis` « pas encore ouvert pour votre organisation » (sans nom d'org) | `/acces-refuse` « …votre compte n'y est pas encore habilité » + **action réelle** (`reserves_attribuer_role`) | Même écran que « sans entitlement » | 200 | **Aucun error boundary**. **Open-redirect** `?next=/\evil.example` [EXÉCUTÉ]. `?error=` rendu brut | Oui avec Colors pour la décision ; détails divergents |
| **Studio** | Notion inexistante : compte Auth **dédié** → « Connexion impossible… » ; si Auth partagé → `/onboarding` crée un espace sans barrière | Aucun entitlement à l'exécution (seulement filtre à l'inscription, contournable) | Rôle `viewer` : API 403 ; non-membre : 404 (aucune fuite) | Pas d'état par utilisateur ; `STUDIO_ENABLED=off` → 503 global | 200 `/dashboard` | Pas de boucle. Lien profond perdu (`/login` sans `next`) | **Non** — modèle isolé, non branché au multi-app |

**Verdict transversal** : cinq apps, **quatre logiques d'accès différentes**. Un utilisateur valide sans droit voit, selon l'app, un formulaire de création d'entreprise (GP), un refus daté (Colors/Réserves), un mode dégradé silencieux (Tools) ou un écran d'onboarding (Studio).

## 2. La décision commune, exécutée [EXÉCUTÉ]

`a_acces_application(entreprise, app)` renvoie un **booléen nu**. Sur 13 comptes fictifs × 4 apps (V3 @ ledger 278) :

| # | État du compte | GP | Colors | Réserves | Tools (org) | Tools (perso) | Ce que l'app peut savoir |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Auth seul (profil créé par le trigger, aucune entreprise) | ✗ | ✗ | ✗ | ✗ | Free | rien : `contexte_application_courant` = 0 ligne |
| 1b | Auth **sans** ligne `utilisateurs` | ✗ | ✗ | ✗ | ✗ | Free | idem (GP → `/onboarding`, mais les RPC de création échouent sur FK : impasse [LU]) |
| 2 | Membre actif, entreprise sans droit d'usage | ✗ | ✗ | ✗ | ✗ | Free | contexte présent, décision `false` |
| 3 | Droit d'usage OK, **rôle absent** | ✗ | ✗ | ✗ | ✗ | Free | idem |
| 4 | **Rôle présent, droit d'usage absent** | ✗ | ✗ | ✗ | ✗ | Free | idem |
| 5 | Accès complet | ✓ | ✓ | ✓ | ✓ | Free (pas d'entitlement perso) | `applications_autorisees` = 4 apps |
| 6 | **Entreprise suspendue** (droits + rôles intacts) | ✗ | ✗ | ✗ | ✗ | Free | RLS masque la ligne d'usage (0 ligne visible) |
| 7 | Membre `desactive` (rôles intacts) | ✗ | ✗ | ✗ | ✗ | Free | `contexte_application_courant` = 0 ligne |
| 8 | Membre `invite` (rôles intacts) | ✗ | ✗ | ✗ | ✗ | Free | idem |
| 9 | Habilitation `autorise=false` | ✗ | ✗ | ✗ | ✗ | Free | contexte présent |
| 10 | Droit d'usage expiré (`valide_jusqu_au` passé) | ✗ | ✗ | ✗ | ✗ | Free | contexte présent |
| 11 | Admin plateforme actif | ✓ | ✓ | ✓ | ✓ | Free | contexte « Administration ELSATIA » ; **aucune exigence AAL2** |
| 12 | **Julien tel que documenté** : ligne `plateforme_admins` `en_attente`, inactive | ✗ | ✗ | ✗ | ✗ | Free | traité comme un compte ordinaire |

Conséquences prouvées :
1. Les états « suspendu », « désactivé », « invité », « sans rôle », « sans droit d'usage », « expiré » sont **indiscernables** pour la garde partagée. Colors/Réserves reconstituent la raison par une seconde lecture RLS ; or la RLS masque la ligne d'usage dès que l'entreprise est suspendue (`est_membre_actif` embarque le statut d'abonnement) → **suspension affichée « n'est pas activé »**.
2. Suspendre l'abonnement GP coupe **aussi** Colors, Réserves et Tools-organisation (couplage caché).
3. **GP est hors modèle** [EXÉCUTÉ] : un compte avec un poste portant `acces_devis` mais **aucune habilitation GP** obtient `contexte_acces_proxy.droit_acces = true` alors que `a_acces_application(gestion_pro) = false`. Inversement, un compte « complet » selon `a_acces_application` a `droit_acces = false` s'il n'a pas de permission de poste. Désactiver GP dans `acces_applications_entreprises` n'a aucun effet dans GP [LU].
4. Le mode par défaut Tools (Free) n'est jamais un refus ; l'entitlement Tools est **par utilisateur** (`entitlements_utilisateurs_elsatia`), les autres par organisation + rôle.

Autre preuve [EXÉCUTÉ] : un compte sans aucune appartenance peut faire `update utilisateurs set entreprise_active_id = <uuid d'une entreprise tierce>` (grant colonne + policy sans `WITH CHECK`), après quoi `contexte_abonnement_courant()` renvoie **nom, référence interne (`ENT-007`), statut d'abonnement, échéances, `impaye_message`** de cette entreprise. Nécessite de connaître l'UUID. **Déjà répertorié** : `ELSATIA_SECURITY_COMMERCIAL_READINESS_AUDIT_V1.md` U1/SEC-13 (corrigé par la migration 342 de la lignée GPCONV, absent de V3). Recoupé ici, pas nouveau.

## 3. Anomalies

### P0
- **P0-1 — Colors, branche courante (ledger 265) : redirection infinie.** `apps/colors/src/app/acces-refuse/page.tsx:9` et `abonnement-requis/page.tsx:9` appellent `getContexteColors()` qui, pour un compte sans contexte, fait `redirect("/acces-refuse?motif=appartenance")` (`apps/colors/src/lib/contexte.ts:34,36`) → la page se redirige elle-même. Atteignable dès qu'une session existe sans passer par le formulaire de login (dont la garde `connexionAction` déconnecte les comptes sans droit) : retour de `auth/callback`, qui n'exécute aucune vérification de droit avant de rediriger vers `/dashboard`, ou retrait de droit en cours de session. **Corrigé en V3** (`lireContexteRefus`, commit `94236349`). Ne pas déployer le Colors 265.
- Aucun P0 d'accès aux données : dans les 13 états testés, toute situation non autorisée renvoie bien `false` [EXÉCUTÉ].
- **P0 conditionnel Studio** : `deleteUser` de la suppression de compte supprimerait l'identité **commune** si l'Auth est partagé (README:27) alors que la config le dit dédié (`config.toml:1-3`). À trancher avant toute Preview.

### P1
| # | Anomalie | Preuve |
| --- | --- | --- |
| P1-1 | **Trois modèles d'accès incompatibles** (GP poste+abonnement ; Colors/Réserves org+rôle ; Tools perso ; Studio workspace). `a_acces_application` n'est jamais appelée par GP ni Studio | [LU] + [EXÉCUTÉ] §2.3 |
| P1-2 | **`/onboarding` (création d'entreprise, essai 30 j, Gérant) ouvert à tout compte authentifié** — y compris à un compte Colors/Tools venu d'une autre app, et à un membre déjà actif. `rejoindre_entreprise_par_code` / `activer_compte_employe` écrasent `entreprise_active_id` : un membre actif de A qui saisit un code B est bloqué en `/en-attente` sans retour possible | [LU] |
| P1-3 | **Open-redirect Réserves** : `cheminSur` = `startsWith("/") && !startsWith("//")` laisse passer `/\evil.example` (résolu vers `https://evil.example`). Idem callback. Même faille dans Colors 265 (corrigée en V3) | [EXÉCUTÉ] `new URL` |
| P1-4 | **`signOut()` global** (défaut supabase-js `scope:'global'`, vérifié `GoTrueClient.ts:3986`) sur chaque refus d'accès de Colors et Réserves, et à la déconnexion GP : un essai sur une app sans droit **révoque les refresh tokens de toutes les apps** du compte (effet exact non rejoué). Tools utilise `local` | [LU] + défaut vérifié |
| P1-5 | **Suspension non modélisée** : cf. §2.1-2.2. Colors/Réserves « n'est pas activé », Tools Free silencieux, GP écran dédié mais wording faux pour un non-admin | [EXÉCUTÉ] |
| P1-6 | **Messages promettant une action impossible** : Colors/Tools « contactez l'administrateur de votre organisation » alors que la seule RPC d'habilitation est réservée à l'admin plateforme `total` + AAL2 ; Réserves a la sienne | [LU] |
| P1-7 | **GP `/en-attente`** affiche « Demande envoyée » pour `desactive`, `invite`, `pause`, `en_attente_validation` (faux pour un compte désactivé). Et la suspension de l'entreprise est révélée avant le contrôle d'appartenance (`entreprise.ts:181-183` avant `:201-203`) | [LU] |
| P1-8 | **Erreur transitoire = « pas d'entreprise »** : `entreprise.ts:130-133,161` ignore `error` → un membre existant est envoyé vers le formulaire de création | [LU] |
| P1-9 | **Tools : Pro payé invisible** — Pro = droit org + rôle `tools_pro` + entitlement perso ; les routes de paiement n'écrivent ni droit org ni rôle | [LU] |
| P1-10 | **Réserves** : `?error=`/`?message=` rendus bruts + `error.message` PostgREST placé dans l'URL (Colors a fermé cette classe) ; `reserves_invitation_accepter` / `rejoindre_intervention` en `on conflict do nothing` : jeton consommé puis refus | [LU] |
| P1-11 | **Studio** : filtre d'inscription appelé seulement par la server action (`enable_signup=true` → contournable), défaut **ouvert** contre le contrat fail-closed ; aucun test E2E du mode fermé | [LU] |
| P1-12 | **U1** (voir §2, fin) : fuite de l'état d'abonnement d'une entreprise tierce par UUID | [EXÉCUTÉ], déjà SEC-13 |

### P2 (principaux ; liste complète dans les annexes)
- **Liens profonds perdus** partout : `redirect("/login")` sans `next` (GP, Colors, Réserves, Studio) ; `/login` ignore `next` si session existante. Les e-mails Réserves pointent `/reserves/{id}`.
- **API** : GP/Colors répondent 307 HTML aux appels `/api/*` non autorisés (jamais 401/403) ; `AccesApplicationRefuseError` non attrapée → 500 (Colors photos/export, Réserves `actions-metier`) ; Réserves API : « anonyme » et « sans organisation » confondus en 401 « Session expirée » → file hors-ligne bloquée à tort.
- **Erreurs** : Réserves n'a aucun `error.tsx`/`global-error.tsx` ; Colors n'a que `global-error` (« en cours de préparation », trompeur pour un refus).
- **Aucune app hors GP n'a de MFA/AAL2**, alors que l'admin plateforme bénéficie d'un bypass complet sans AAL2 dans `a_acces_application`.
- **Admin plateforme sans membership** : Colors affiche des pages **vides** ; Tools reste Free (branche `plateforme` inatteignable) ; GP lui donne un contexte neutre.
- Proxy Colors : en-têtes copiés avant `setAll` → cookies rafraîchis invisibles des Server Components [INFÉRÉ].
- GP `/parametres/securite` soumis à `acces_parametres` : un admin plateforme peut ne pas pouvoir s'enrôler en MFA ; `/api/documents/*` exige `acces_chantiers`.
- Studio : `?error=` brut sur la page d'invitation, secret d'invitation dans l'URL, tombstone de suppression jamais consulté à l'inscription, `README`/`.env.example` contredisent la config (Auth partagé vs dédié).
- Tools : `LockedProjects` dit « sans compte » alors qu'un droit est requis ; SW met en cache `/compte?…code=`.
- Deux migrations `…236_*` et deux `…237_*` : à confronter au ledger.
- Repli `http://localhost:3000/abonnement` si `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL` absente (Colors/Réserves).

## 4. Comportement cible proposé (sans refonte lourde)

Cible produit : **non connecté → login ; sans organisation → message clair ; sans entitlement → refus propre ; sans rôle → refus propre ; suspendu → écran dédié ; autorisé → application.**

1. **Une seule décision, avec motif.** Ajouter une RPC `decision_acces_application(p_entreprise_id, p_app) → {decision, role_code}` où `decision ∈ {autorise, sans_organisation, organisation_non_habilitee, sans_role, membre_desactive, invitation_en_attente, organisation_suspendue, organisation_expiree}`. `a_acces_application` en devient un `select decision='autorise'` (aucune rupture). Divulgation minimale : le nom de l'organisation uniquement à un membre actif.
2. **Une seule garde** dans `packages/application-access` (`exigerAccesApplication` + mapping standard) appelée par **toutes** les apps ; `AccesApplicationRefuseError` toujours attrapée.
3. **Écrans partagés** (mêmes textes, un composant) : `sans_organisation`, `refus (droit/rôle)`, `suspendu`, `invitation`. Le suspendu montre « Régulariser » **aux seuls admins** ; aux autres, « Contactez votre administrateur ».
4. **Sémantique HTTP** : pages = redirection ; API = 401 (non connecté) / 403 + `code` (refus). Plus de 307 sur `/api/*`.
5. **`next` conservé** (via une fonction unique `cheminInterneSur`, celle de Colors V3) et lu après login.
6. **Onboarding** : seul GP propose « Créer une entreprise ». Colors/Réserves/Tools renvoient vers le compte ELSATIA. Les rejoindre par code ne réaffectent jamais `entreprise_active_id` d'un membre actif.
7. **Déconnexion `scope:'local'`** sur refus d'accès ; globale seulement sur action explicite ou changement de mot de passe.
8. **GP** : appeler la décision partagée *en plus* des permissions de poste (le poste reste le détail fin ; l'habilitation devient la porte d'entrée, comme les autres apps).
9. **Tools** : conserver « Free par défaut » (c'est un choix produit) mais afficher la **cause** (sans organisation / sans habilitation / suspendue) et corriger « Droits vérifiés » pour Free.
10. **Studio** : brancher `platform-token`/décision partagée ; fail-closed ; Auth dédié tranché et documenté.

## 5. Fichiers, middleware et guards concernés

- **Garde partagée** : `packages/application-access/src/index.ts`.
- **GP** : `src/proxy.ts`, `src/lib/supabase/proxy.ts`, `routage-proxy.ts`, `module-permissions.ts`, `entreprise.ts`, `permissions.ts`, `acces-socle-essai.ts`, `src/app/(app)/layout.tsx`, `ModuleAccessBoundary.tsx`, `onboarding/*`, `en-attente`, `abonnement-suspendu`, `abonnement/module-non-inclus`, `actions/{auth,entreprise,abonnement}.ts`, `lib/security/redirects.ts`.
- **Colors** : `apps/colors/src/proxy.ts`, `lib/{contexte,acces-colors,redirection-sure,messages-*}.ts`, `app/actions.ts`, `app/(colors)/layout.tsx`, `app/{acces-refuse,abonnement-requis,login,global-error}`, `app/api/*`, `app/auth/callback`.
- **Réserves** : `apps/reserves/src/proxy.ts`, `lib/{contexte,acces-reserves}.ts`, `lib/offline/{identite,synchronisation}.ts`, `app/actions.ts`, `app/auth/callback/route.ts`, `app/{acces-refuse,abonnement-requis,rejoindre,invitation,login}`, `app/api/offline/*`.
- **Tools** : `apps/tools/src/components/AccountProvider.tsx`, `lib/{access,entitlements}.ts`, `public/sw-tools.js` (aucun proxy, aucun serveur).
- **Studio** : `apps/studio/src/{proxy.ts,lib/{workspaces,verified-user,media-service,entitlement,signup-gate,invitations,account-deletion}.ts,app/actions.ts,app/auth/*,app/invitations/[token]/page.tsx}`.
- **SQL** : `20260826000234` (`a_acces_application`, `applications_autorisees`, `contexte_application_courant`), `20260714000075` (`est_membre_actif` + statut d'abonnement), `20260826000237/239` (habilitation plateforme), `20260831000238` (Tools multi-entreprise), `20260906000266` (Tools superuser), `20260906000268/269/270` (Réserves), `20260719000117` (`contexte_acces_proxy`), `20260905000265` (`contexte_abonnement_courant`), `20260710000001/02/35` (`utilisateurs*`, trigger `handle_new_user`, rejoindre).

## 6. Corrections simples préparées (NON appliquées à une branche)

Patch : `docs/audits/first-access-audit-v1/first-access-fixes-v3.patch`, **contre l'arbre V3** (`apps/…`), réversible (`git apply -R --check` OK).

| # | Changement | Vérification |
| --- | --- | --- |
| F1 | Réserves : `cheminSur` et `auth/callback` utilisent `cheminInterneSur` (copie **à l'identique** de `apps/colors/src/lib/redirection-sure.ts`, test compris) | 37/37 tests de la fonction (Réserves) ; `/\evil.example` désormais refusé |
| F2 | Colors + Réserves : `signOut({ scope: "local" })` sur les **refus d'accès** de `connexionAction` (3 sites chacun). La déconnexion volontaire et le changement de mot de passe restent globaux | `tsc` non rejoué (pas de `node_modules` V3) ; API valide (`{scope}` de supabase-js) |

Suites Vitest V3 avec le patch : Colors 256/256 tests ; Réserves 182/182 tests (dont les 37 nouveaux). **2 fichiers Colors et 1 fichier Réserves échouent à l'import du paquet partagé, à l'identique SANS le patch** (mon `node_modules` pointait sur la version courante du paquet) : artefact d'environnement, non lié.

Non préparés car **non triviaux** (décision produit ou risque de régression) : P0-1 (reprendre `lireContexteRefus` de `94236349`, cherry-pick d'un lot plus large), P1-8 (jeter sur `error` casserait le cas « pas de ligne `utilisateurs` » qui renvoie aussi une erreur `PGRST116`), textes `/en-attente` et `?acces=refuse` (wording produit), `signOut` de GP (`auth.ts:99,118,130`, à arbitrer avec la déconnexion globale voulue), correctifs Studio (défaut fail-closed casse les E2E locaux sans variable d'env).

La branche courante est **gelée** (lot Stripe) et le working tree porte des modifications d'autres sessions : rien n'y a été touché.

## 7. Ordre de traitement suggéré

1. **Avant tout déploiement Colors** : vérifier que la version servie n'est pas la 265 (P0-1) ; reprendre `94236349`.
2. Appliquer F1 + F2 (mêmes branches que V3), puis fermer P1-3/P1-4.
3. Intégrer U1/342 au train retenu (P1-12) — déjà planifié dans l'audit sécurité.
4. Trancher le **modèle unique** (P1-1) : c'est la décision qui conditionne §4 ; sans elle, chaque app continue de diverger.
5. RPC `decision_acces_application` + écrans partagés + sémantique HTTP (§4.1-4.5) — un lot unique, testé avec la matrice SQL de ce dossier (`scenarios-sql-v3.sql`, réutilisable telle quelle).
6. P1-2/P1-7/P1-6 (onboarding, textes, chemin d'habilitation org).

## 8. Questions à trancher (Julien)

- Q1 — GP doit-il exiger l'habilitation applicative (`a_acces_application`) comme les autres apps, ou le poste reste-t-il la seule porte ?
- Q2 — Tools : garder « jamais de refus, Free par défaut » ? Le Pro doit-il dépendre d'une organisation, ou seulement de l'entitlement personnel ?
- Q3 — Suspension d'abonnement GP : doit-elle couper Colors/Réserves/Tools ? (couplage actuel non voulu à ma connaissance.)
- Q4 — Onboarding : seul GP crée des entreprises ?
- Q5 — Studio : Auth dédié confirmé ? (bloque la suppression de compte et le raccordement.)
- Q6 — La déconnexion volontaire d'une app doit-elle rester globale ?

## 9. Annexes (dossier `first-access-audit-v1/`)

`annexe-gp.md` · `annexe-colors-tools-reserves.md` · `annexe-studio.md` (10 cas × app, chemin:ligne) · `scenarios-sql-v3.sql` / `.results.txt` (matrice exécutée) · `first-access-fixes-v3.patch`.
Les annexes sont des sorties brutes de sous-analyses : les libellés de cas y suivent l'énoncé de la mission (1-10), pas la numérotation de la §2.
