# Audit lecture seule GP — premier accès d'un utilisateur Auth existant

Base : Train V3 (`scratchpad/v3`). Abréviations : `P`=src/lib/supabase/proxy.ts, `E`=src/lib/entreprise.ts, `M`=supabase/migrations. Tout est **prouvé par lecture** sauf mention « inféré ». Le dépôt courant (ledger 265) est identique sur ces chemins, sauf : pas de sortie d'essai (seul `/abonnement` exempté, E:188) et règle socle absente (P:165-175).

**Comparaison multi-app** : GP n'appelle **jamais** `a_acces_application` / `exigerAccesApplication`. `@elsatia/application-access` sert uniquement au sélecteur (`applications_autorisees`, multi-app-server.ts:11,84) et à `estCodeApplicationElsatia` (actions/multi-app.ts:25), en V3 comme en courant. Colors redirige vers `/acces-refuse` (apps/colors/src/lib/contexte.ts:37,39) ; GP n'a aucune page équivalente.

## (a) Les 10 cas

| # | Cas | Parcours réel | Message / HTTP | Verdict |
|---|---|---|---|---|
| 1 | Auth sans ligne `utilisateurs` | Le trigger `on_auth_user_created` crée la ligne pour tout `auth.users` (M/20260710000002:25-28) : cas quasi théorique. Si absente : `.single()` null (E:131) → 307 `/onboarding` (E:157). Les 3 RPC insèrent dans `utilisateurs_entreprises` (FK vers `utilisateurs`, M/20260710000001:57) : échec (inféré) | « Impossible de créer l’entreprise. Vérifiez les informations saisies. » (actions/entreprise.ts:62) ; « Numéro d’inscription invalide ou déjà utilisé. » (:102) ; « Ce code d’entreprise est invalide ou a expiré. » (:87). Aucun code n'insère dans `utilisateurs` (grep) | Impasse, message trompeur |
| 2 | Connu, sans entreprise | P:152-159 : `entreprise_id` null, aucun contrôle ; E:135-158 → 307 `/onboarding` → 200 « Configurer votre accès » (onboarding/page.tsx:22) | Formulaire « Créer une nouvelle entreprise… Vous deviendrez automatiquement Admin/Gérant avec tous les droits » (:74-75). `creer_entreprise_bootstrap` (M/20260718000104:116-131) sans aucun contrôle d'habilitation | Action proposée à quiconque, divergent de Colors. Aucune fuite |
| 3 | Membre sans droit applicatif | (a) statut ≠ `actif` → `/en-attente` (E:201-203). (b) `actif`, poste sans droits : `permissions=[]` (permissions.ts:53) → dashboard | (b) « Aucun module attribué — Un administrateur doit encore définir les accès de votre poste. » (dashboard/page.tsx:300). Route module : 307 `/dashboard?acces=refuse` (P:259-263) | (b) dashboard clair, mais refus de route **silencieux** |
| 4 | Abonnement OK, rôle absent | `contexte_acces_proxy` → `droit_acces=false` (M/20260719000117:53-64) → P:259-263 | 307 vers `/dashboard?acces=refuse` ; **aucun code ne lit `acces`** (dashboard/page.tsx:24 sans searchParams) | Atterrissage muet |
| 5 | Rôle OK, abonnement absent | Contrôle entitlement **avant** rôle (P:252-257) → 307 `/abonnement/module-non-inclus?module=acces_x` → 200. `suspendu`/`annule` → `/abonnement-suspendu` (E:181-183). Essai expiré → `?motif=essai_expire` (E:189) | « Module optionnel non inclus… Votre poste peut être autorisé… » + « Droit concerné : `acces_devis` » (module-non-inclus/page.tsx:29-37) | Clé brute affichée ; message faux pour qui n'a pas le rôle. `acces_applications_entreprises` **jamais consultée** : désactiver GP en plateforme (M/20260826000234:306-317) n'a aucun effet dans GP |
| 6 | Accès complet | login → `/dashboard` (auth.ts:82-83) ; P:226-270 passe ; layout 200 | — | OK |
| 7 | Suspendu | 307 `/abonnement-suspendu` (E:182 ; chemin public P:20, pas de boucle) | « Accès temporairement suspendu — Le règlement de l’abonnement n’a pas été confirmé… » (abonnement-suspendu/page.tsx:22), y compris pour `annule`. Bouton « Régulariser » montré aux non-admins → « Seul un administrateur peut gérer l’abonnement » (actions/abonnement.ts:392). Variante essai : boutons « Choisir une offre »/« Exporter mes données » → `/abonnement`, `/parametres/donnees` exigent `acces_parametres` → 307 `/dashboard?acces=refuse` → 307 retour `/abonnement-suspendu?motif=essai_expire` (aucun message, semble boucler) | Compréhensible pour l'admin, pas pour un membre |
| 8 | Désactivé | Employé `sorti`/`suspendu` ⇒ membership `desactive` (M/20260713000044:151-171). `utilisateurs.actif` n'existe pas (M/20260710000001:47-53). → E:201-203 → `/en-attente` | « Demande envoyée. Tu as bien rejoint l’entreprise… Tu pourras te connecter dès que ce sera fait. » (en-attente/page.tsx:10-13) : **faux** | Trompeur, seule sortie « Se déconnecter ». Ban Auth : `getUser` null → `/login` sans message |
| 9 | Invitation en attente | Employé : lien `/signup?numero=` (InvitationEmploye.tsx:35). Connecté → P:215-221 → `/dashboard` en **effaçant la query** → `/onboarding` sans pré-remplissage (onboarding/page.tsx:13). `activer_compte_employe` (M/20260713000044:110) : e-mail différent, poste absent, fiche sortie → même message générique. Code d'entreprise : `en_attente_validation` (M/20260710000035:50) → `/en-attente` | « Numéro d’inscription invalide ou déjà utilisé. » | Pas de fuite (bon), pas de guidage |
| 10 | Refresh/reconnexion | `getUser()` validé serveur (P:108-110) ; `cache()` par requête seulement (E:114) ; cookies sans `domain` (security/cookies.ts) = session propre à chaque app. Non connecté → `/login` sans `next` (P:112-116) ; login sans `next` (auth.ts:82-83) → toujours `/dashboard`. MFA AAL2 : `/plateforme` uniquement (P:126-142, mfa-server.ts:8-23) | 307 ; API : voir ci-dessous | Lien profond perdu |

**Open-redirect** : aucun. `destinationInterneSure` (security/redirects.ts:3-19) rejette `//`, `\`, contrôles, décode 3 fois puis re-parse ; utilisée en auth/callback/route.ts:7, auth.ts:196, mfa/challenge/page.tsx:12, mfa-server.ts:18, MfaChallengeForm.tsx:13. Relais Colors : origine de config (auth-relais-colors.ts:17-18).

**Page vs API** : pas de traitement API dans le proxy. Non connecté → 307 `/login` (P:112-116) même pour `/api/*`. Refus module/droit → 307 HTML, jamais 401/403 (P:256,263). `getContexteEntreprise()` appelle `redirect()` depuis les route handlers (E:125,157,182,189). Le 403 JSON de `/api/exports/comptabilite` n'est atteint que si le proxy laisse passer ; `/api/rgpd/export` renvoie 403 JSON (route.ts:21). Résultat incohérent.

## (b) Anomalies

**P0** : aucune faille d'accès prouvée (RLS non auditée ici).

**P1**
1. E:130-133,161 : `error` des requêtes `utilisateurs`/`contexte_abonnement_courant` ignoré. Une erreur transitoire renvoie un membre existant vers `/onboarding` et son formulaire « Créer une entreprise ».
2. onboarding/page.tsx (aucun garde) + P (aucune redirection) + `creer_entreprise_bootstrap` : `/onboarding` et la création restent ouverts à quiconque, membre actif compris. Création d'entreprise (essai 30 j, Gérant) sans habilitation GP, contrairement à Colors/Tools.
3. M/20260710000035:54 et M/20260713000044:135-137 : rejoindre/activer écrase `entreprise_active_id`. Un actif de A qui saisit un code B est bloqué en `/en-attente`. GP n'a pas de sélecteur d'entreprise (Tools en a un : M/20260831000238:15-26, même colonne partagée). Lock-out, impossible de revenir à A.
4. GP ignore `a_acces_application` (voir plus haut) : l'entitlement applicatif n'est pas appliqué.
5. en-attente/page.tsx:10-13 : message unique « Demande envoyée » pour `en_attente_validation`, `desactive`, `pause`, `invite`. Faux pour un compte désactivé.
6. `acces=refuse` / `lecture=seule` jamais lus (P:262,267 ; layout.tsx sans lecture) : refus silencieux. Le 303 « lecture seule » perd la saisie (formulaire/action).
7. E:181-183 avant E:201-203 : l'état suspendu ou d'essai expiré de l'entreprise est révélé à un membre en attente/désactivé/simple porteur du code (le code rend l'entreprise « active », M/20260710000035:54).

**P2**
- `contexte_abonnement_courant` (M/20260905000265:80-101) ne vérifie ni appartenance ni statut : nom, plan, `impaye_message` remontent dès que `entreprise_active_id` est posé. La policy `un utilisateur modifie son profil` (M/20260710000001:197) n'a ni `WITH CHECK` ni restriction de colonne (GRANT à vérifier côté ACL 255) : inféré, fuite possible avec un UUID connu.
- P:113-115 : la redirection `/login` conserve le `search` d'origine → `?error=`/`?message=` arbitraires affichés en bannière (login/page.tsx:30-35).
- P:115,139,211,220,256,263,268 : les redirections n'embarquent pas les cookies rafraîchis par `getUser` (inféré, écueil connu `@supabase/ssr`).
- auth.ts:99,118,130 : `signOut()` global (défaut supabase-js, inféré) : se déconnecter de GP invalide les sessions des autres apps.
- auth.ts:195 : confirmation d'e-mail → `/onboarding` même pour un membre existant ; `/signup` (auth-erreurs.ts:4) peut révéler l'existence d'un compte selon la config Supabase (inféré).
- `/parametres/securite` soumis à `acces_parametres` par le proxy (module-permissions.ts:5) alors que ModuleAccessBoundary.tsx:9-11 le déclare hors module : un admin plateforme membre sans `acces_parametres` ne peut pas s'enrôler en MFA, donc pas accéder à `/plateforme`.
- module-permissions.ts:3 : `/api/documents/*` (PDF devis/factures) exige `acces_chantiers` au lieu de `acces_devis`/`acces_factures`.
- module-non-inclus : « Comparer les offres » → `/abonnement` (bounce silencieux pour un non-admin) ; abonnement-suspendu accessible sans garde, tutoiement/vouvoiement mêlés.

## (c) Fichiers/guards
`src/proxy.ts`, `lib/supabase/{proxy,routage-proxy}.ts`, `lib/{module-permissions,entreprise,permissions,acces-socle-essai}.ts`, `(app)/layout.tsx`, `ModuleAccessBoundary.tsx`, `onboarding/*`, `en-attente`, `abonnement-suspendu`, `abonnement/module-non-inclus`, `actions/{auth,entreprise,abonnement}.ts`, `auth/{callback,confirm}`, `mfa/challenge`, `lib/security/redirects.ts`, `lib/auth/mfa-server.ts`.
SQL : tables `utilisateurs`, `utilisateurs_entreprises(statut,poste_id)`, `permissions_poste`, `entreprises(abonnement_*)`, `modules_entreprises`, `employes`, `acces_applications_entreprises`, `habilitations_applications_utilisateurs` ; RPC `contexte_acces_proxy`, `contexte_abonnement_courant`, `acces_module_pour_permission`, `est_plateforme_admin`, `est_acces_support_actif`, `creer_entreprise_bootstrap`, `rejoindre_entreprise_par_code`, `activer_compte_employe`, `applications_autorisees`, `a_acces_application` (non appelée par GP).

## (d) Correctifs triviaux et sûrs (non appliqués)
1. E:130-133 : lever une erreur si `error` est défini (au lieu de `/onboarding`).
2. `/onboarding` : rediriger vers `/dashboard` si `entreprise_active_id` et membership `actif` existent.
3. `en-attente` : lire `utilisateurs_entreprises.statut` et afficher un texte distinct (`desactive`, `pause`, `en_attente_validation`).
4. Dashboard : lire `?acces=refuse` et afficher « Vous n'avez pas accès à ce module. Contactez votre administrateur. »
5. Login : accepter `next` via `destinationInterneSure` ; proxy P:112-116 : positionner `next` au lieu de cloner la query.
6. Déplacer la vérification d'appartenance (E:195-203) avant la suspension (E:172-191).
7. `/parametres/securite` : exempter du contrôle `acces_parametres` dans le proxy.
8. Proxy : répondre 401/403 JSON sur `/api/*` au lieu du 307.
