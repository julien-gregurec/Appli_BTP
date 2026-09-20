# Audit parcours « utilisateur Auth existant » — ELSATIA Studio (lecture seule)

Sources : export `scratchpad/studio/apps/studio` + `packages/studio-domain`. Les migrations de l'export sont des symlinks cassés ; le SQL a été lu via `git show 05c775d5:supabase/migrations/*studio*` (train `integration/studio-commercial-ready-v1`). Chemins `src/` = `apps/studio/src/`. **[P]** = prouvé par lecture, **[I]** = inféré.

## Constat structurant
- Studio n'a **aucun** branchement au modèle multi-app : grep `application-access|a_acces_application|entitlement` = seulement `src/lib/entitlement.ts` (interface `EntitlementProvider.canSignUp`, appelée uniquement à l'inscription, `src/app/actions.ts:69`), `actions.ts:15` et README. Aucune vérification d'accès à l'exécution [P].
- **Pas de notion d'entreprise** : unité = `studio_workspaces` (personal/professional) + `studio_workspace_members(role owner|admin|editor|viewer)`, `studio_my_role()` (SQL foundation:42-54). **Aucun trigger sur `auth.users`**, aucune table profil/quota par utilisateur [P] ; quotas = globaux/par workspace (`studio_render_limits`, `studio_media_limits`, S1 render_admission:5-17).
- **Auth partagé ou dédié : la doc se contredit.** Dédié : `supabase/config.toml:1-3`, contrat d'accès §1, décision Q-004. Partagé : `README.md:27` (« peut être celui de l'identité ELSATIA commune »), `.env.example:5`. Le cookie `elsatia-studio-auth` est propre à Studio, host-only (`src/lib/config.ts:16-19`) [P].

## (a) Tableau des 10 cas

| # | Cas | Trace et résultat |
|---|---|---|
| 1 | Auth connu GP/Colors, jamais venu | **Dédié (cible)** : compte absent du projet Studio. `login` → 303 `/login?error=` « Connexion impossible. Vérifiez vos identifiants et la confirmation de votre email. » (`notices.ts:7`, page 200). Action proposée : « Première visite ? Créer mon compte » (`login/page.tsx:71`) → `signup` (mode fermé : « Les inscriptions sont fermées : demandez une invitation à l’administrateur d’un espace Studio. », `notices.ts:37`). Cul-de-sac, pas de liste d'attente. **Partagé** : login OK → `/dashboard` → `redirect("/onboarding")` (`workspaces.ts:37`) → bouton → RPC `studio_create_workspace` (foundation:57-78) crée `studio_workspaces`+`studio_workspace_members`, **sans aucune barrière d'admission**. Rien n'est créé automatiquement, ni trigger : création paresseuse au clic, sur le projet pointé par `NEXT_PUBLIC_SUPABASE_URL`. |
| 2 | Connu, sans « entreprise » | Notion inexistante (texte assumé : « Aucune entreprise n’est nécessaire », `login/page.tsx:24`). Sans workspace : `/dashboard` → `/onboarding` (307, ou meta-refresh 200 car `dashboard/loading.tsx` existe [I], cf. docs Next `redirect.md:12`). |
| 3 | Membre sans droit applicatif | Équivalent : rôle `viewer`. UI en lecture seule ; API `403 « Lecture seule : opération refusée. »` (`media-service.ts:68-69`) ; SQL `studio_reserve_media` exige owner/admin/editor (render_admission:71). Hors membre : RLS masque tout → page `notFound()` 404 « Page ou espace inaccessible… » (`not-found.tsx`), API 404 « Projet inaccessible. » : pas de fuite (même réponse inexistant/interdit) [P]. |
| 4 | Entitlement présent, rôle absent | Pas d'entitlement. Analogue : membre retiré (`studio_set_member(...,null)`, foundation:112-113) : workspace invisible (RLS `studio_my_role(id) is not null`), `?workspace=<id>` → 404, sinon `/onboarding` « VOTRE PREMIÈRE ÉTAPE » qui crée un espace neuf. Aucun message « vous avez été retiré ». |
| 5 | Rôle présent, entitlement absent | **Impossible à exprimer** : l'accès n'est jamais révoqué au runtime (filtre uniquement à l'inscription). Retirer quelqu'un de l'allowlist/passer en `closed` ne change rien pour les comptes existants ; seuls leviers : ban Auth (hors code) ou `STUDIO_ENABLED=off`. Contrat d'accès §2 (lecture seule après `valid_until`) non implémenté. |
| 6 | Accès complet | `/dashboard` 200, `Shell`, membership relu (`workspaces.ts:39-48`, redondant : RLS l'impose déjà). Proxy = rafraîchissement seul (`proxy.ts:71`), toute décision est en page/RPC. Cache `private, no-store` (`proxy.ts:74-75`). |
| 7 | Suspendu | Pas d'état par utilisateur. (a) `STUDIO_ENABLED=off` → 503 HTML « Service temporairement indisponible… » ou JSON 503 `Retry-After: 300` sur tout, y compris `/auth/*`, `/s/*` (`proxy.ts:22-40`). (b) `studio_render_limits.admission_open=false` → 503 « La création de vidéos est temporairement suspendue. » ; limites → 429 (`render-refusal.ts:3-15`). (c) ban Auth : login = message générique ci-dessus ; session existante [I : valide jusqu'à `jwt_expiry` 3600 s]. |
| 8 | Supprimé (RGPD) | `deleteAccount` (`actions.ts:296-316`) : mot de passe revérifié, `studio_deletion_prepare/finish`, `auth.admin.deleteUser` (`account-deletion.ts:38`), puis `/login?notice=account-deleted` « Votre compte et vos espaces ont été supprimés. ». Session résiduelle : `getUser()` échoue non transitoire → `verifiedUser` = null → pages `redirect("/login")`, API 401 « Connexion requise. » (`media-service.ts:35`) [P ; libellé GoTrue I]. Tombstone `studio_account_deletions(subject_hash=sha256(uid))` : **jamais consulté** à l'inscription/connexion (ré-inscription libre avec nouvel UUID). |
| 9 | Invitation | `/invitations/[token]` (publique). Invalide/expirée/révoquée/utilisée/espace archivé → **une seule** page 200 « Invitation indisponible… invalide, expirée, révoquée ou déjà utilisée. » (`page.tsx:25-31`) : pas d'oracle. Pending non connecté : liens `login?next=`/`signup?next=` + « rouvrez ce lien ». Connecté : bouton → RPC `studio_accept_invitation` (invitations:77-95) ; e-mail différent → 42501 « Cette invitation est destinée à une autre adresse » (affiché via `?error=`, sans lien de déconnexion). Déjà membre : garde son rôle, invitation consommée. Mode fermé : `hasPendingInvitation` (RPC `studio_pending_invitation_for`, service_role) autorise l'inscription. |
| 10 | Refresh/reconnexion | Cookie httpOnly/Lax/Secure ; rotation refresh (config `reuse_interval=10`), proxy propage les cookies rafraîchis (`proxy.ts:57-61`). `next` : `safeStudioDestination` = liste blanche stricte `/dashboard|/settings|/onboarding|/invitations/<43>` (`studio-domain/src/index.ts:76-84`), URL absolue construite sur `studioOrigin()` : **pas d'open-redirect** [P]. `/auth/confirm?type=recovery` → `/reset-password` (`confirm/route.ts:16`), échec → `/login?error=Lien invalide ou expiré.` ; `/auth/confirm` **ignore `next`**. Gardes de page → `/login` sans `next` (`workspaces.ts:15`, `projects/[projectId]/page.tsx:35`) : perte du lien profond. |

Page vs API : pages = `redirect("/login")` (307 ou 200+meta-refresh sous `loading.tsx` [I]) ; API = JSON 401/403/404/503 (`media-service.ts`, `rest-status.ts`), POST refusé sans en-tête `Origin` exact (403). Inscription fermée : message unique, pas de file d'attente.

## (b) Anomalies

**P0 (conditionnel : si Auth partagé avec GP/Colors, cf. README:27)**
- `account-deletion.ts:38` `admin.auth.admin.deleteUser` supprime l'identité **commune** ; le texte dit « supprime votre compte Studio » (`settings/page.tsx:124-126`) et `STUDIO_STORAGE_SERVICE_KEY` (service_role) donnerait la main sur tout Auth (contredit `.env.example:4`). À lever avant toute Preview : Auth dédié obligatoire.

**P1**
1. Filtre d'inscription contournable : `registrationGate` n'est appelé que par la server action (`actions.ts:69`). `config.toml:181,226` `enable_signup=true` : `POST /auth/v1/signup` direct avec la clé publique, puis `studio_create_workspace` sans contrôle (foundation:57) [P côté code, I côté exploitation]. Aucun test E2E du mode fermé (grep tests).
2. Fail-open : `signup-gate.ts:4` défaut `open` (env absente ou faute de frappe = ouvert), contre le contrat « fail-closed » et Q-007.
3. Aucun entitlement runtime/pas de branchement plateforme : utilisateur non admis mais contournant #1 voit tout ; révocation impossible (cas 5).
4. Textes trompeurs pour un compte ELSATIA existant : `login/page.tsx:24`, `:35-37` (« utiliser votre compte ELSATIA existant »), `signup/page.tsx:64` alors que le compte n'existe pas côté Studio (Auth dédié).

**P2**
- Invitation : `?error=` affiché brut (`invitations/[token]/page.tsx:43`, hors `knownNotice`) → injection de texte/hameçonnage sur un token valide ; pas de déconnexion/lien dashboard depuis l'écran « autre adresse » ; après double envoi, message « déjà utilisée » alors que l'utilisateur est membre (lien vers `/login` qui affiche le formulaire à un connecté).
- Secret d'invitation dans l'URL : `actions.ts:263-265` (`&link=<url complète>`) → historique/logs ; `members/page.tsx:109-114` affiche un `link` forgeable.
- Confirmation d'e-mail : `templates/confirmation.html:3` (`{{ .SiteURL }}/auth/confirm`) et `confirm/route.ts:16` perdent `emailRedirectTo/next` → l'invité atterrit sur `/dashboard`→`/onboarding` (personal workspace créé) au lieu de l'invitation.
- Oracle d'invitation/allowlist : réponse `signup` différente (fermé vs « confirmation ») avant tout appel Auth, sans limitation (`actions.ts:69-70`).
- `reset-password/page.tsx:12-15` n'utilise pas `verifiedUser` : panne transitoire = « Lien invalide ou expiré. » ; `updatePassword` ne révoque pas les autres sessions.
- Suppression : `notices.ts:45` « Rien n’est perdu » faux après `prepare` (espaces déjà archivés, `deleted_at`, membres retirés : account-deletion.sql:81,100).
- `members/page.tsx:63` expose les UUID de tous les membres à un `viewer` (RLS `studio_members_read`) ; texte `:44-46` périmé (invitation e-mail existe).
- `/login` n'oriente pas un utilisateur déjà connecté.

## (c) Fichiers/guards
`src/proxy.ts` (kill-switch, refresh), `src/lib/workspaces.ts` (`getCurrentStudioUser`, `getActiveStudioWorkspace`), `src/lib/verified-user.ts`, `src/lib/media-service.ts` (`mediaContext`, `authorizeProject`), `src/lib/entitlement.ts`, `src/lib/signup-gate.ts`, `src/lib/invitations.ts`, `src/lib/account-deletion.ts`, `src/app/actions.ts`, `src/app/auth/{confirm,callback,recovery}/route.ts`, `src/app/invitations/[token]/page.tsx`. SQL : `studio_my_role`, `studio_create_workspace`, `studio_set_member`, `studio_{invite,accept,resolve,list,revoke}_invitation`, `studio_pending_invitation_for`, `studio_deletion_*`, `studio_request_render`, `studio_render_limits`. Policies : `studio_workspace_read`, `studio_members_read`, `studio_render_limits_read (using true)`.

## (d) Correctifs triviaux et sûrs (non appliqués)
1. `signup-gate.ts:4` : refuser tout ce qui n'est pas explicitement `open` (défaut `closed`) et l'exiger en Production ; ajouter un test E2E du mode fermé.
2. Aligner `README:27`/`.env.example:4-5` sur Auth dédié ; garde de démarrage refusant `deleteUser` si le projet n'est pas dédié.
3. Passer `next` (via `safeStudioDestination`) aux `redirect("/login")` des gardes et le lire dans `/auth/confirm`.
4. `invitations/[token]/page.tsx:43` : n'afficher que les messages d'une liste fermée ; ajouter lien Déconnexion/Dashboard.
5. Remplacer `&link=` par un cookie éphémère ou un retour d'action.
6. Reformuler `login/signup` et `notices.deleteFailed` ; `reset-password` via `verifiedUser`.
7. Non trivial (à cadrer) : désactiver `enable_signup` ou hook « before user created », et barrière d'admission dans `studio_create_workspace`, puis raccorder `platform-token`.
