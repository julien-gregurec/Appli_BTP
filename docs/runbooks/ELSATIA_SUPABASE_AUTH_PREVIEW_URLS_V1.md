# ELSATIA — Contrat Supabase Auth pour une vraie Preview (V1)

Ferme le blocker P0 « aucune URL Preview réelle n'est ni ne peut être autorisée dans Supabase
Auth depuis le dépôt » identifié par l'audit de préparation Preview (§1.2, §7 P0-2). Document de
lecture seule : **aucune écriture sur un projet Supabase distant n'a été faite pour le produire.**
Toute case marquée « manuel » reste une action à exécuter à la main, une fois, dans le tableau de
bord Supabase, par un opérateur humain.

## 0. Pourquoi ce n'est pas versionnable directement

`supabase/config.toml` → `[auth].site_url` et `additional_redirect_urls` ne s'appliquent qu'à
l'instance locale (`supabase start`). Pour un projet Supabase hébergé (Preview ou Production), ces
réglages se configurent exclusivement dans **Dashboard → Authentication → URL Configuration**
(ou l'API Management, hors du périmètre « aucune action distante » de cette mission). Ce document
est le contrat que cette configuration manuelle doit respecter, reconstruit par lecture du code
réel (pas de suppositions).

## 1. Topologie Supabase actuelle

- **Un seul projet Supabase partagé** sert Gestion Pro, Colors, Tools et Reserves
  (`supabase/config.toml` à la racine, `project_id = "btp-platform"` — nom de dev local, aucune
  référence de projet distant versionnée).
- **Studio n'a aucun répertoire `supabase/` propre dans ce train.** `DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION`
  (non tranchée, propriétaire Julien, voir `docs/qualification/ELSATIA_GP_CONVERGENCE_TRAIN_V1_REPORT.md`)
  décide si Studio rejoint le projet partagé ou reçoit son propre projet. **Les deux scénarios sont
  couverts ci-dessous (§3.6)** — ne pas trancher unilatéralement dans ce document.
- Aucun fournisseur OAuth (Google/GitHub/…) n'est câblé sur `supabase.auth.signInWithOAuth` dans
  les 5 apps : seuls mot de passe, lien de réinitialisation et confirmation d'e-mail transitent par
  Supabase Auth. (Les usages `google`/`provider` trouvés dans le dépôt concernent la facturation
  Google Play côté Tools, sans rapport avec Supabase Auth.)

## 2. Méthode de vérification

Pour chaque app, lecture directe du code source (pas de supposition) :

| App | Origine publique lue par le code | Route(s) Auth-facing | Preuve |
|---|---|---|---|
| Gestion Pro | `NEXT_PUBLIC_APP_URL` (`src/lib/brand.ts`) | `/auth/callback` (`exchangeCodeForSession`), page intermédiaire interne `/auth/confirm` | `src/lib/auth-redirects.ts`, `src/app/auth/callback/route.ts` |
| Colors | `NEXT_PUBLIC_COLORS_URL` (`apps/colors/src/lib/auth-redirects-colors.ts`) | `/auth/callback`, page intermédiaire interne `/auth/confirm` | `apps/colors/src/app/auth/callback/route.ts` |
| Tools | `window.location.origin` (résolu côté client, pas de variable d'origine dédiée pour Auth) | Pas de route `/auth/callback` : `resetPasswordForEmail` redirige **directement** vers `/compte?recovery=1` (flux implicite, session détectée côté client). Mobile natif (Capacitor) : schéma personnalisé `fr.elsatia.tools://auth/recovery` | `apps/tools/src/components/AccountProvider.tsx:97` |
| Reserves | `NEXT_PUBLIC_RESERVES_URL` (avec repli `http://localhost:3020` — voir alerte §5) | `/auth/callback` (`exchangeCodeForSession`) — route présente et fonctionnelle, mais aucun appel `resetPasswordForEmail`/`signUp` trouvé dans ce train : les comptes Reserves sont provisionnés par invitation applicative à jeton propre (`lib/invitations.ts`), **pas** par le mécanisme d'e-mail natif de Supabase Auth | `apps/reserves/src/app/auth/callback/route.ts`, `apps/reserves/src/lib/invitations.ts` |
| Studio | `NEXT_PUBLIC_STUDIO_URL`, validée (https ou localhost/127.0.0.1 uniquement, lève une erreur sinon — pas de repli silencieux) | `/auth/callback` (`emailRedirectTo` sur `signUp` sans porte, voir P1 signup) | `apps/studio/src/lib/config.ts:20` (`studioOrigin()`), `apps/studio/src/app/actions.ts:72` |

Le paramètre `next` porté par `/auth/callback?next=...` est toujours validé côté application
(`destinationInterneSure`/`cheminInterneSur`) avant réutilisation : ce n'est **pas** un vecteur
d'open-redirect, donc l'entrée à autoriser côté Supabase est l'URL de callback elle-même (origine +
chemin fixe), pas chaque valeur de `next`.

## 3. Contrat cible par environnement Preview

Hypothèse de nommage Preview (à ajuster si Julien a déjà un schéma d'alias Vercel réel — voir
`DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY` dans l'audit source) : un déploiement Preview Vercel
par app, domaine du type `<app>-preview.vercel.app` ou alias personnalisé. Remplacer
`<preview-host-app>` par l'hôte réel choisi au provisioning (§6 du runbook de déploiement).

### 3.1 Projet Supabase partagé (GP + Colors + Tools + Reserves)

| Champ Dashboard | Valeur à poser |
|---|---|
| Site URL | Choisir **une seule** origine « principale » parmi les 4 — recommandé : celle de Gestion Pro (`https://<preview-host-gp>`), car c'est la seule à porter un `.env.preview.example` aujourd'hui. Les autres apps restent fonctionnelles via `additional_redirect_urls`. |
| Additional Redirect URLs | `https://<preview-host-gp>/auth/callback`, `https://<preview-host-colors>/auth/callback`, `https://<preview-host-reserves>/auth/callback`, `https://<preview-host-tools>/compte?recovery=1` |
| Additional Redirect URLs — mobile Tools (si build Preview du wrapper natif testée) | `fr.elsatia.tools://auth/recovery` |

### 3.2 Gestion Pro

- `NEXT_PUBLIC_APP_URL=https://<preview-host-gp>` posé sur le déploiement Vercel Preview.
- Vérifier après déploiement : `GET https://<preview-host-gp>/auth/callback?code=test` répond (ne
  doit pas 404) et qu'aucune page ne révèle d'information sensible sans code valide.

### 3.3 Colors

- `NEXT_PUBLIC_COLORS_URL=https://<preview-host-colors>`.
- `urlCallbackReinitialisation()` renvoie `null` si la variable est absente/invalide (refus
  explicite, pas de repli dangereux) — donc un oubli de variable est visible immédiatement en test
  fonctionnel (aucun e-mail de réinitialisation n'est envoyé), pas seulement en audit statique.

### 3.4 Tools

- Pas de variable d'origine Auth dédiée : le navigateur résout `window.location.origin` au moment
  de l'appel, donc **l'URL réelle du déploiement Preview Tools doit être ajoutée telle quelle**
  (`https://<preview-host-tools>/compte?recovery=1`) — impossible à anticiper avant que le domaine
  Preview soit connu. À poser en dernier, une fois le domaine Preview effectivement assigné par
  Vercel.
- Si le wrapper natif (Capacitor Android/iOS) est inclus dans le périmètre de cette Preview,
  enregistrer aussi `fr.elsatia.tools://auth/recovery` (indépendant du domaine web).

### 3.5 Reserves

- `NEXT_PUBLIC_RESERVES_URL=https://<preview-host-reserves>` — **obligatoire à poser
  explicitement**, faute de quoi le code retombe silencieusement sur `http://localhost:3020`
  (`apps/reserves/src/lib/invitations.ts:31`, `apps/reserves/src/app/layout.tsx:6`), ce qui casse
  tout lien d'invitation généré depuis une Preview (voir P1 domaines, §5 ci-dessous).
- La route `/auth/callback` existe mais n'est déclenchée par aucun envoi d'e-mail Auth natif dans
  ce train (comptes provisionnés par invitation à jeton propre, hors Supabase Auth). L'ajouter à
  l'allow-list reste recommandé par prudence (défense en profondeur, coût nul), pas strictement
  bloquant pour les flux actuels de Reserves.

### 3.6 Studio — deux scénarios selon `DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION`

| Scénario | Configuration Auth |
|---|---|
| **A — Studio rejoint le projet partagé** (pas de décision d'architecture prise, solution la plus rapide) | Ajouter `https://<preview-host-studio>/auth/callback` aux Additional Redirect URLs du projet partagé (§3.1). **Attention** : l'inscription Studio est ouverte sans porte dans ce train (voir P1 signup, `ELSATIA_PREVIEW_BLOCKERS_CLOSURE_V1.md`) — n'importe quel compte créé sur ce projet partagé obtient un espace Studio. À ne pas activer en Preview publique tant que `DECISION_REQUIRED:STUDIO-SIGNUP-DEFAULT` n'est pas tranché. |
| **B — Studio reçoit un projet Supabase dédié** (aligné avec le correctif `fix/studio-signup-closed-v1` déjà écrit mais non porté) | Nouveau projet Supabase Preview, Site URL = `https://<preview-host-studio>`, Additional Redirect URLs = `https://<preview-host-studio>/auth/callback` uniquement. Porter alors le correctif de fermeture de l'inscription en même temps que ce choix d'architecture (les deux sont liés, cf. §1.5 de l'audit source). |

## 4. Ce que ce document ne fait pas

- Il ne crée, ne modifie ni n'interroge aucun projet Supabase réel.
- Il ne choisit pas les domaines Preview réels (dépend du provisioning Vercel, hors dépôt).
- Il ne tranche pas `DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION` ni
  `DECISION_REQUIRED:STUDIO-SIGNUP-DEFAULT` : option conservatrice retenue partout où la mission
  l'exige — ne pas exposer Studio publiquement en Preview tant que ces deux décisions ne sont pas
  prises par Julien.

## 5. Alerte — replis localhost dangereux détectés dans ce périmètre

- `apps/reserves/src/lib/invitations.ts:31` et `apps/reserves/src/app/layout.tsx:6` :
  `process.env.NEXT_PUBLIC_RESERVES_URL ?? "http://localhost:3020"`. Un oubli de variable en
  Preview ne fait **pas** échouer le build ni la fonctionnalité de façon visible : les liens
  d'invitation générés pointeraient silencieusement vers `localhost:3020`, inaccessibles à leurs
  destinataires. Documenté aussi dans la matrice domaines (P1, §7 de la mission).
- Par contraste, `Colors` (`urlCallbackReinitialisation`) et `Studio` (`studioOrigin()`) échouent
  **explicitement** (retour `null` / exception) en l'absence de variable — comportement plus sûr,
  à répliquer sur Reserves si une future itération corrige ce point (hors périmètre de cette
  mission : lecture/documentation uniquement, aucune modification de code applicatif décidée ici
  sans confirmation — voir le rapport de clôture pour la décision retenue).

---

*Document produit par lecture de dépôt uniquement. Aucun accès Supabase/Vercel réel, aucune
écriture distante.*
