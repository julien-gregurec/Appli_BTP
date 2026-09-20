# Audit parcours « utilisateur Auth existant » : Colors / Tools / Réserves (lecture seule)

Base : V3 (ledger 278). Préfixes : `C`=apps/colors/src, `R`=apps/reserves/src, `T`=apps/tools/src, `M`=supabase/migrations, `PKG`=packages/application-access/src/index.ts. `M236p`=20260826000236_platform_support_uid_security_v1.sql ; `M236t`=20260830000236_elsatia_tools_r8_comptes_entitlements_sync.sql (deux fichiers n°236). `M234`/`M237`/`M266`… = fichiers 202608260002xx / 20260826000237_platform_aal2… / 20260906000266_platform_global_owner… ; `M268/269/270` = reserves_v1/v2/v3 ; `M238`=20260831000238_elsatia_tools_r10_publication_multientreprise.sql. « P » = prouvé par lecture ou exécution ; « I » = inféré.

Vocabulaire des cas : « droit org » = ligne `acces_applications_entreprises` (autorise + fenêtre) ; « rôle » = ligne `habilitations_applications_utilisateurs` ; les deux sont exigés par `a_acces_application` (M234:134-173, seule définition). `contexte_application_courant` (M234:210-245) ne renvoie une ligne que si `utilisateurs.entreprise_active_id` pointe une `utilisateurs_entreprises.statut='actif'`, ou pour un admin plateforme.

## Constats structurants
- **Proxy Colors/Réserves = simple rafraîchissement de session + CSP**, aucune protection, aucun redirect (C proxy.ts:27-67 ; R proxy.ts:15-56, `getUser()` l.64/49). Tools n'a **ni proxy, ni serveur** : SPA/PWA statique, supabase-js côté client (T lib/auth/client.ts:15-23).
- Garde réelle : `(colors)/layout.tsx:7` → `exigerShellColors` (C lib/acces-colors.ts:54-63) ; Réserves : layout (R (reserves)/layout.tsx:8) **plus** `exigerShellReserves` dans chaque page (R lib/acces-reserves.ts:66-76). Les server actions et routes API Réserves n'appellent **jamais** `exigerAccesApplication` (grep) : elles s'en remettent aux RPC (`reserves_role_courant` M268:333-348, `reserves_action_autorisee` M268:353-376).
- Décision de refus (Colors et Réserves, identique) : `a_acces_application` faux → lecture RLS de `acces_applications_entreprises` → org non autorisée = `/abonnement-requis`, sinon `/acces-refuse` (C:31-52 ; R:43-64).
- **Via le formulaire de login, les pages de refus ne sont presque jamais atteintes** : `connexionAction` signe la personne dehors (`signOut()`) et renvoie `/login?error=…` (C actions.ts:44-67 ; R actions.ts:68-108). Les pages ne s'affichent que pour une session établie autrement (callback, changement de droits en cours de session).
- `AccesApplicationRefuseError` (PKG:52-57) : attrapée **uniquement** dans C api/acces/route.ts:12-13 (403 JSON). Ailleurs non attrapée (voir P2-3).
- Aucun MFA/AAL2 dans les 3 apps (grep vide). `a_acces_application` accorde tout le catalogue à un admin plateforme sans condition AAL (M234:145-148 ; `est_plateforme_admin` M236p:65-73 : actif + identité active seulement).

## (a) Tableaux par app

### Colors (V3)
| # | Résultat | Détail |
|---|---|---|
| 1 Auth inconnu (pas de `utilisateurs`/membership actif) | Login : 303 → `/login?error=acces-colors` « Votre compte ELSATIA ne dispose pas d’un accès actif à Colors. » (actions.ts:47-49 ; messages-auth.ts:29). Session existante : 307 → `/acces-refuse?motif=appartenance` (contexte.ts:36-37), 200 « Votre organisation — Votre compte ELSATIA n’est rattaché à aucune organisation exploitable par Colors. » (messages-refus.ts:13 ; acces-refuse:29) | Pas de boucle (`lireContexteRefus`, contexte.ts:73-84). Tournure contradictoire « Votre organisation — … aucune organisation ». Bouton « Ouvrir le compte ELSATIA » (défaut `http://localhost:3000/abonnement`, acces-refuse:20) |
| 2 Sans entreprise | Identique à 1 (RPC vide) | Ne diffère que pour admin plateforme (contexte.ts:39) |
| 3 Membre, ni droit org ni rôle | Login : même message qu'en 1. Session : `/abonnement-requis` « ELSATIA Colors n’est pas activé / L’organisation **X** ne dispose pas actuellement d’un droit d’usage Colors actif. » (abonnement-requis:22-23) | Nom d'org affiché à son membre (acceptable). « Voir les produits ELSATIA » proposé à un non-admin |
| 4 Droit org OK, rôle absent | `/acces-refuse` : « **X** — Votre compte n’a pas d’habilitation Colors active. Contactez l’administrateur Colors de votre organisation. » (messages-refus.ts:17-18) | **Action impossible** : aucun outil org pour habiliter (`utilisateurs/page.tsx:2` = ComingSoon ; seule voie `plateforme_habiliter_utilisateur_application`, M237:999-1030 : admin `total` + AAL2) |
| 5 Rôle OK, droit org absent | `/abonnement-requis` (comme 3) | Message juste sur le fond |
| 6 Complet | 200 dashboard ; rôle via `applications_autorisees` (M234:176-205) ; sélecteur d'apps = seulement les apps autorisées (ApplicationSwitcher.tsx:8-13) | ~8 RPC/requête (P2). Admin plateforme sans entreprise : contenu **vide** (`if(!c.entrepriseId)return null`, dashboard/page.tsx:5, idem inventaire/depots/parametres) |
| 7 Suspendu | `est_membre_actif` faux (`20260714000075:50-67`) → RLS masque la ligne org (M234:257-258) → diagnostic « abonnement_requis » → `/abonnement-requis` « n’est pas activé » | Message inexact (rien sur la suspension). Couplage : statut abonnement GP bloque Colors |
| 8 Désactivé (`ue.statut='desactive'`) | Comme 1/2 (« aucune organisation exploitable ») | Non distingué. Ban Auth : signIn en erreur → « Identifiants incorrects. » (actions.ts:42, I) |
| 9 Invitation | **N'existe pas** dans Colors (aucune table/route). Une invitation GP (`utilisateurs_entreprises.statut='invite'`, `20260710000001:60`) est invisible = cas 1/2 | — |
| 10 Refresh/next/PWA | Cookies `sb-*` propres à l'origine (pas de SSO : 1 login par app, login/page.tsx:45). `?next=` sûr : `cheminInterneSur` (redirection-sure.ts:50-86 ; login:20 ; actions:38 ; callback:12). Deep link perdu : `redirect("/login")` sans `next` (contexte.ts:31). SW : réseau d'abord, seul `/login` + icônes précachés, repli `/login` hors-ligne (sw-colors.js:2,20) ; aucune donnée en cache | Proxy : copie d'en-têtes faite **avant** `setAll` (proxy.ts:45-49,58) → cookies rafraîchis non visibles des Server Components (P mécanisme : `request.cookies.set` mute `request.headers` ; effet réel I) |

API : `/api/acces` : non connecté 307 HTML (pas 401, contexte.ts:31), refusé 403 JSON. `/api/photos`, `/api/export/inventaire` : 307 HTML si non connecté ; `exigerAccesApplication` non attrapée → **500** ; org manquante 403 JSON (photos:11-15 ; export:10-12).

### Tools (V3 = 265 pour ce code)
Architecture : aucun contrôle serveur, tout dans `AccountProvider` (client). Compte facultatif (compte/page.tsx:4).
| # | Résultat |
|---|---|
| 1, 2 | Connexion OK (AccountProvider:95) puis `tools_lister_entreprises_autorisees` vide (M238:3-13) → statut « verified », message « Aucune entreprise autorisée pour Tools · mode Free » (AccountProvider:71). Pas de redirect ni code HTTP. Aucune fuite, aucune cause donnée |
| 3, 4, 5, 7, 8 | **Tous identiques** : liste vide car `a_acces_application(e.id,'tools')` exige droit org + rôle unique `tools_pro` (M236t:21) + membre actif (M238:11) → « mode Free ». Tools Free jamais bloqué |
| « Rôle + droit org, sans entitlement » | Free, message « Droits vérifiés · X » (AccountProvider:57) : « vérifié » alors que Free ; MonetizationPanel propose l'achat |
| 6 | Pro si `entitlements_utilisateurs_elsatia` actif (M236t:94-109 ; M266:372-436), via `tools_resoudre_entitlements_entreprise` (M238:28-38). Admin plateforme sans entreprise : liste vide → **Free** (branche `plateforme` M266:385 inatteignable) (I) |
| 9 | Aucune invitation |
| 10 | Pas de `next`. Récupération : `${origin}/compte?recovery=1` (AccountProvider:97) ; lien natif filtré par liste blanche (platform.ts:20-31) = pas d'open-redirect. Déconnexion `scope:"local"` (AccountProvider:96). Session dans stockage chiffré propre à l'origine (secure-storage.ts). Cache droits signé HMAC, grâce 7 j (entitlements.ts:4,62-76). SW met en cache toute GET same-origin OK, y compris `/compte?…code=` (sw-tools.js:26-30, P2) |
Free anonyme vs Pro : **aucune route n'exige de compte**. Verrous purement clients : `/projets` (`saved-projects`, ProjectsWorkspace:23), outils `access==='pro'` (CalculatorWorkspace:19 ; ProCalculatorWorkspace:30) → écran « verrouillé ». Le moteur Pro est livré au navigateur (I). Sync cloud : Pro + entreprise + `exigerAccesApplication` (AccountProvider:81) ; RLS `tools_projects` réalignée (M238:52-62).

### Réserves (V3 seule)
| # | Résultat | Détail |
|---|---|---|
| 1, 2, 8 | Login : signOut + « Votre compte ELSATIA ne dispose pas d’un accès actif à Réserves. » (actions.ts:71-73). Session : 307 → `/acces-refuse?motif=appartenance` « Votre compte ELSATIA n’est rattaché à aucune organisation active. » (contexte.ts:35-39 ; acces-refuse:21) | Page **non protégée par session**. Bouton « Voir mes invitations » → `/rejoindre` → `getContexteReserves` renvoie vers la même page : bouton mort (rebond au clic, pas de boucle auto). API : `resoudreIdentite` répond « anonyme » → 401 « Authentification requise » (identite.ts:50-52 ; mutations:66-68) → client affiche « Session expirée : reconnectez-vous » (synchronisation.ts:114-115,150-153) alors que la session est valide : file bloquée |
| 3, 5, 7 | `/abonnement-requis` 200 statique « Réserves n’est pas activé / ELSATIA Réserves n’est pas encore ouvert pour votre organisation. » + conseil intervenant (abonnement-requis:28-36) | Aucun nom d'org (plus sobre que Colors). Suspension présentée comme « pas encore ouvert » |
| 4 | `/acces-refuse` : « Votre organisation dispose de Réserves, mais votre compte n’y est pas encore habilité. » + « Demandez-la à l’administrateur » (acces-refuse:22-27) | Action réelle : `reserves_attribuer_role` (M269:508) via parametres/membres. Révèle à un membre que l'org a Réserves (ok) |
| 6 | 200 ; pas de sélecteur d'apps | — |
| 9 Invitation | **Deux mécanismes** (a) lien : `reserves_invitations` → `/invitation/[token]` publique (`reserves_invitation_consulter`, anon, M270:362-392 : organisation hôte, chantier, nom, expiration) → `accepterInvitationAction` (actions.ts:669-688) → `reserves_invitation_accepter` (M270:394-469). (b) désignation : `reserves_designer_entreprise_intervenante` (M268:893-935) crée le droit org, puis `/rejoindre` liste via `reserves_invitations_en_attente` (M269:780-790) → `reserves_rejoindre_intervention` (M268:937-970) | Invité non connecté : « Se connecter et rejoindre » → `/login?next=/invitation/…` ; `connexionAction` laisse passer `/invitation/*` sans droit (actions.ts:92) et redirige vers `/rejoindre[/id]` si (b) (l.98-101). Jeton inconnu/expiré/consommé = même écran (pas d'oracle). Invité (b) sans session valide : `/acces-refuse` (droit org déjà créé) avec bouton fonctionnel |
| 10 | `?next=` **non sûr** : `cheminSur` = `startsWith("/") && !startsWith("//")` (actions.ts:47-49 ; callback/route.ts:12). `/\evil.example` passe (P, exécuté : `new URL("/\\evil.example", origin)` → `https://evil.example`). `login/page.tsx:19-21` rend `?error=`/`?message=` bruts, `next` brut. Aucun reset mot de passe. SW : coquille `/hors-ligne` seule, API/imprimer jamais en cache (sw-reserves.js:113-131) ; cache lecture IndexedDB par identité, aucune expiration ni revalidation de droit (P) ; purge à la déconnexion (BoutonDeconnexion:42-49) |
API : anonyme → 401 JSON (offline/*, pdf:35) ; identité étrangère → refus/403 (mutations:111-122 ; photo:54-60) ; auth injoignable → 503 ; pdf sans droit → 404 « Chantier introuvable » via RPC ; cron 401 (cron:54-56). Aucune vérification de droit applicatif dans ces routes (RPC/RLS seuls).

## (b) Anomalies

**P0** (dépôt courant 265 uniquement, absent en V3)
- Colors 265 : `/acces-refuse` et `/abonnement-requis` appellent `getContexteColors()` (acces-refuse/page.tsx:9 ; abonnement-requis/page.tsx:9), qui redirige vers `/acces-refuse?motif=appartenance` (contexte.ts:34) pour un compte sans contexte = **auto-redirection infinie** (cas 1/2/8 avec session). Corrigé en V3 (`lireContexteRefus`, test acces-refuse.test.ts:64-75).

**P1**
1. **Open-redirect Réserves** : R actions.ts:47-54,85,92 ; R auth/callback/route.ts:12 (P, exécuté). Même faille en Colors 265 (callback/route.ts:12 ; actions.ts:22), corrigée en V3 Colors.
2. **`signOut()` global** après échec d'accès et à la déconnexion (C actions.ts:48,58,66,72 ; R actions.ts:72,82,107,113). Défaut supabase-js = scope `global` (auth-js GoTrueClient.ts:3986) : un essai sur Colors ou Réserves sans droit révoque les sessions de toutes les apps (I sur l'effet précis ; Tools utilise `local`, AccountProvider:96). Contredit le texte C login/page.tsx:45.
3. **Pas de chemin d'habilitation Colors/Tools pour un admin d'organisation** : messages « Contactez l'administrateur … de votre organisation » (messages-refus.ts:17-18) mais seule RPC = plateforme `total`+AAL2 (M237:999-1030). Réserves a son propre `reserves_attribuer_role`.
4. **Tools : Pro payé invisible** : Pro = 3 barrières indépendantes (droit org + rôle `tools_pro` + entitlement perso). Les routes de paiement n'écrivent aucun droit org/rôle (src/app/api/tools/monetization/** : 0 occurrence de `acces_applications`/`habilitations`). Acheteur sans accès org → Free et « Aucune entreprise autorisée » (AccountProvider:71). Une entreprise GP suspendue retire aussi le Pro personnel (`est_membre_actif`).
5. **Réserves : texte et erreurs bruts** : `?error=` rendu tel quel (login/page.tsx:19-20,32-33) et `error.message` PostgREST/PG placé dans l'URL (actions.ts:129,161,…). Colors a fermé cette classe (messages-auth.ts:1-8 ; journal-securite.ts). Injection de contenu crédible + fuite possible de schéma.
6. **`reserves_invitation_accepter`** : `on conflict do nothing` (M270:444,451) sur droit org/rôle : ligne existante `autorise=false` ou expirée = jeton consommé, message « Vous êtes rattaché à l’intervention. » (actions.ts:688) puis `/abonnement-requis`/`/acces-refuse`. Même schéma dans `reserves_rejoindre_intervention` (M268:926,957). De plus tout membre actif de l'org désignée peut s'auto-attribuer `reserves_intervenant` (M268:937-957).

**P2**
1. Suspension/annulation affichée « n'est pas activé » (Colors abonnement-requis:22 ; Réserves:30) ; couplage GP→Colors/Réserves/Tools (`est_membre_actif`).
2. Deep links perdus (`redirect("/login")` sans `next` : C contexte.ts:31 ; R contexte.ts:30) : les e-mails Réserves pointent `/reserves/{id}` (emails-reserves.ts:127). `/login` ignore `next` si session (C:16 ; R:17).
3. Erreurs : Colors n'a que `global-error.tsx` (texte « Colors est en cours de préparation pour votre entreprise », trompeur pour un refus) ; **Réserves n'a aucun error boundary** (page 500 Next par défaut, I) ; `exigerAccesApplication` non attrapée dans actions-metier.ts:33 et routes photos/export → 500.
4. Colors API : 307 HTML pour non connecté/sans org (pas 401/403).
5. Proxy Colors : cookies rafraîchis non transmis en aval (proxy.ts:45-49,58) ; Réserves correct (proxy.ts:29-34).
6. Réserves : bouton « Voir mes invitations » mort pour compte sans org (acces-refuse:30) ; API renvoie 401 « session expirée » au lieu d'un état « sans organisation » (identite.ts:50-52) ; file hors-ligne bloquée pour un compte désactivé ; cache IndexedDB lisible sans revalidation de droit.
7. Réserves : pas de « mot de passe oublié » ; existence d'un `intervenant_id` distinguable via deux messages d'erreur (M268:941-946).
8. Tools : verrous Pro uniquement clients ; message « Droits vérifiés » pour un compte Free ; `LockedProjects` dit « sans compte » alors qu'un droit est requis (ProjectsWorkspace:27) ; login = « Adresse ou mot de passe incorrect. » pour toute erreur, y compris réseau (AccountProvider:95) ; révocation traitée comme panne (throw l.54 attrapé l.58 → cache 7 j, cas de course seulement, I).
9. Repli `http://localhost:3000/abonnement` si `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL` absente (C/R acces-refuse:20, Shell.tsx:28). `accountCreation` = `https://app.elsatia.fr/signup` (T lib/site.ts:19), à confirmer.
10. Admin plateforme (julien@elsatia.fr) : bypass sans AAL2 (M234:145-148) ; sans membership actif Colors affiche des pages vides, Tools reste Free.
11. Migrations : deux fichiers portent le n° 236 et deux le n° 237 (`20260826000236_platform_support…` / `20260830000236_elsatia_tools_r8…`, idem 237), à confronter au ledger.

## (c) Fichiers/guards concernés
C : proxy.ts, lib/{contexte,acces-colors,redirection-sure,messages-*}.ts, app/actions*.ts, app/(colors)/layout.tsx, app/api/*, app/{login,acces-refuse,abonnement-requis,global-error}. R : proxy.ts, lib/{contexte,acces-reserves,offline/identite,offline/synchronisation}.ts, app/actions.ts, app/auth/callback, app/{login,acces-refuse,abonnement-requis,rejoindre,invitation}, app/api/offline/*. T : components/AccountProvider.tsx, lib/{access,entitlements}.ts, public/sw-tools.js. PKG : index.ts. SQL : M234 (a_acces_application, applications_autorisees, contexte_application_courant), `20260714000075` (est_membre_actif), M236t (tools_*), M236p (est_plateforme_admin), M238 (tools multi-entreprise), M237:999 (habilitation plateforme), M268/M269/M270 (Réserves), M266 (Tools superuser).

## (d) Correctifs triviaux et sûrs (non appliqués)
1. Réserves : remplacer `cheminSur` et le test du callback par `cheminInterneSur` (copier C lib/redirection-sure.ts) ; pages login : allowlist de codes comme C messages-auth.ts ; ne plus injecter `error.message` dans l'URL (codes fermés + journalisation serveur).
2. `signOut({ scope: "local" })` à la place de `signOut()` dans les échecs d'accès de `connexionAction` (Colors et Réserves) ; décider si la déconnexion volontaire doit rester globale.
3. Colors 265 : porter `lireContexteRefus` + pages terminales de V3 (lot indépendant).
4. Attraper `AccesApplicationRefuseError` : 403 JSON dans photos/export ; `redirect("/acces-refuse")` dans `contexteAction` ; ajouter `error.tsx`/`global-error.tsx` à Réserves.
5. Colors proxy : construire `enTetesRequete` **après** `setAll` ou passer `request` mis à jour (comme Réserves proxy.ts:29-34).
6. Réserves `resoudreIdentite` : distinguer « sans organisation » (403) de « anonyme » (401) ; libeller le message client en conséquence.
7. Messages de suspension : ajouter une décision `suspendu` dans `determiner*` (lecture d'un statut exposé par RPC) ; en attendant, reformuler « n'est pas activé » en « n'est pas actif pour votre organisation ».
8. `login` : préserver `next` lorsque la session existe (`redirect(cheminInterneSur(next))`).
9. SQL (à trancher avec la couche SQL, non trivial) : remplacer `do nothing` par une décision explicite dans `reserves_invitation_accepter` / `reserves_rejoindre_intervention` ; ajouter un chemin org-admin pour `colors`/`tools`, ou aligner les messages.
