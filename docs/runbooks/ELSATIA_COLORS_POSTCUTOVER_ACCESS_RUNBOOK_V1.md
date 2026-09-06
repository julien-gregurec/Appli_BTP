# ELSATIA-COLORS-POSTCUTOVER-ACCESS-RUNBOOK-V1

Procédure exécutable pour rendre `julien@elsatia.fr` opérationnel sur
`https://colors.elsatia.fr` **après** le cutover Gestion Pro vers le ledger 263.

| | |
|---|---|
| Date de rédaction | 2026-09-06 |
| Canon Colors | `integration/colors-predeploy-final-v1` — `77c6f4c9961c5e2f14e69b88ebb66f9128a1431d` |
| Cutover GP initial | `996be15c136f09d9977375e700462b503a1720c3` — ledger 263 |
| Hotfix pilote GP | `integration/gp-postcutover-pilot-hotfix-v1` — `7ba62c5315213bf21b9ed8553408fc678e943327` — ledger 263 |
| Projet Vercel Colors | `elsatia-colors`, Root Directory `apps/colors`, région `fra1` |
| Supabase Production | `exhvuzegsefmoguxoiak` |

> **Rien n'a été exécuté.** Aucune écriture Production, aucune migration, aucun
> déploiement, aucun secret lu ni affiché. Les signatures et corps de fonctions
> ci-dessous sont **relevés sur une base réelle au ledger 263**, pas reconstitués.

`7ba62c5` = `996be15` + 5 commits applicatifs, **263 migrations strictement
identiques** (diff de `supabase/migrations` vide). Le hotfix pilote n'ajoute ni
ne retire aucun objet de base : tout ce runbook vaut pour les deux SHA.

---

## 1. RPC exactes au ledger 263

Relevé `pg_get_function_arguments` / `pg_get_function_result` / `proacl`.

### 1.1 Octroi — organisation

```
public.plateforme_activer_application_entreprise(
  p_entreprise_id      uuid,
  p_application_code   text,
  p_valide_du          timestamptz default null,
  p_valide_jusqu_au    timestamptz default null,
  p_source             text        default null,
  p_reference_externe  text        default null
) returns boolean
```
- `security definer`, `volatile`
- Exécution : `authenticated` (révoquée de `public`, `anon`, `service_role`)
- Contrôles, dans cet ordre : `plateforme_exiger_role('total')` →
  `plateforme_exiger_session_aal2()` → entreprise existante → application existante
- Retour : `false` si l'état demandé est **déjà exactement en place** (idempotent),
  `true` si une ligne a été créée ou modifiée
- Journalise dans `historique_acces_applications`

> Attention : la migration `20260826000234` déclarait `returns void`. La **237** l'a
> redéfinie en `returns boolean` avec le garde AAL2. C'est la forme 263 qui fait foi.

### 1.2 Octroi — utilisateur

```
public.plateforme_habiliter_utilisateur_application(
  p_utilisateur_id    uuid,
  p_entreprise_id     uuid,
  p_application_code  text,
  p_role_code         text,
  p_valide_du         timestamptz default null,
  p_valide_jusqu_au   timestamptz default null
) returns boolean
```
- `security definer`, `volatile`, exécution `authenticated`
- Contrôles : `plateforme_exiger_role('total')` → `plateforme_exiger_session_aal2()` →
  **membre `actif`** de `utilisateurs_entreprises` (sinon `Utilisateur non membre actif
  de cette entreprise`) → rôle présent et `actif` dans `roles_applications_elsatia`
  (sinon `Rôle applicatif introuvable ou inactif`)
- Retour `false` si déjà exactement en place ; renseigne `attribue_par = auth.uid()`

### 1.3 Retraits (pour mémoire)

```
public.plateforme_desactiver_application_entreprise(p_entreprise_id uuid, p_application_code text) returns boolean
public.plateforme_retirer_habilitation_application(p_utilisateur_id uuid, p_entreprise_id uuid, p_application_code text) returns boolean
```

### 1.4 Lecture consommée par Colors

```
public.a_acces_application(p_entreprise_id uuid, p_application_code text) returns boolean
public.applications_autorisees(p_entreprise_id uuid)
  returns table(application_code text, nom text, role_code text,
                url_locale text, url_preview text, url_production text,
                icone text, est_admin_plateforme boolean)
public.contexte_application_courant()
  returns table(utilisateur_id uuid, prenom text, entreprise_id uuid,
                entreprise_nom text, est_admin_plateforme boolean)
```
Les trois : `security definer`, `stable`, exécution `authenticated` uniquement
(`public`, `anon` et `service_role` révoqués). Aucun contrôle AAL2 en lecture.

### 1.5 Garde AAL2

```
public.plateforme_exiger_session_aal2() returns void   -- exécution : propriétaire seul
  → si auth.uid() is null ou (auth.jwt() ->> 'aal') <> 'aal2'
    → exception « Authentification forte AAL2 requise »
```
Le contrôle porte sur le **jeton de la session courante**, pas sur l'enrôlement :
avoir un facteur MFA ne suffit pas, il faut avoir **relevé le défi dans la session**.

---

## 2. Contrat de l'admin opérateur

`plateforme_exiger_role('total')` s'appuie sur `plateforme_role_courant()`, qui exige
**simultanément** :

| Condition sur `public.plateforme_admins` | Valeur requise |
|---|---|
| `utilisateur_id` | `= auth.uid()` (l'email n'autorise plus rien depuis la 235) |
| `actif` | `true` |
| `statut_identite` | `'active'` |
| `role` | `'total'` |
| Session | `aal = aal2` dans le JWT |

**Opérateur retenu : `julien.gregurec@gmail.com`.** Après cutover, la 235 renseigne
son `utilisateur_id` par correspondance d'email exacte et lui laisse `actif = true` ;
la 236 le passe en `statut_identite = 'active'`. Il conserve donc le rôle `total`.

**`julien@elsatia.fr` ne peut pas être l'opérateur** : la migration
`20260826000236` force `actif = false` pour cette adresse, indépendamment de
l'existence du compte Auth. Le rendre admin exigerait `plateforme_rattacher_admin`
(auto-rattachement refusé par la base) puis `plateforme_activer_admin`, exécutées par
**un autre** admin `total` en AAL2 — hors périmètre, et **inutile** : la voie
organisation + habilitation suffit.

Aucun bypass SQL n'est employé ni recommandé.

---

## 3. Checklist compte `julien@elsatia.fr` (après cutover, avant octroi)

Aucun mot de passe, jeton, TOTP ni clé n'intervient.

- [ ] **Auth existe** — Dashboard Supabase → Authentication → Users → rechercher `julien@elsatia.fr`
- [ ] **Email confirmé** — colonne « Confirmed » renseignée
- [ ] **Non banni** — aucun `banned_until` actif
- [ ] **Noter l'UUID** du compte (nécessaire à l'étape 5, voir l'avertissement ci-dessous)
- [ ] **Entreprise cible identifiée** — celle qui portera l'abonnement Colors
- [ ] **Membership actif** — ligne `utilisateurs_entreprises` au statut `actif` pour ce couple
- [ ] **`utilisateurs.entreprise_active_id` = entreprise cible** — sinon
      `contexte_application_courant()` ne renvoie aucune ligne et Colors refuse la
      connexion avant même la question du droit

> **Avertissement d'exploitation.** L'écran d'habilitation liste les membres par
> `prénom`, `nom` et **UUID** — jamais par email (`plateforme_lire_entreprise_membres`
> n'expose pas l'adresse). Repérer la bonne ligne suppose donc de connaître à l'avance
> le prénom/nom ou l'UUID. Si un doute subsiste, une **lecture seule** dans le SQL
> Editor suffit à lever l'ambiguïté ; c'est une identification, pas un octroi :
> ```sql
> select id, email from auth.users where lower(email) = 'julien@elsatia.fr';
> ```

Si le compte Auth n'existe pas : le créer par le **parcours d'invitation normal de
Gestion Pro** (l'entreprise invite le collaborateur, la personne définit son mot de
passe elle-même). Ne jamais créer un compte à sa place ni saisir son mot de passe.

---

## 4. Activation de Colors pour l'entreprise — geste applicatif

**L'interface existe et couvre entièrement le besoin. Aucun SQL direct n'est requis.**

Chemin exact, sur `https://app.elsatia.fr`, connecté en `julien.gregurec@gmail.com` :

1. `/plateforme` — le layout `PlateformeLayout` appelle `exigerAal2Plateforme()` :
   - aucun facteur MFA enrôlé → redirection automatique vers
     `/parametres/securite?requis=plateforme&next=…` (enrôlement)
   - facteur présent mais session AAL1 → redirection vers `/mfa/challenge?next=…`
   - une fois le défi relevé, retour automatique sur `/plateforme`
2. Repérer la carte de l'entreprise cible
3. Bouton **« Gérer les applications »** → `/plateforme/entreprises/<entrepriseId>/applications`
4. Section **« Accès de l'entreprise »**, carte **ELSATIA Colors** (`colors`)
5. Laisser « Valide à partir de » et « Valide jusqu'au » **vides** (droit sans limite
   de fenêtre) sauf décision commerciale contraire
6. Bouton **« Activer l'application »**
7. Attendu : bandeau vert **« Application activée »**, pastille de la carte passée à **Active**

L'action serveur appelle `plateforme_activer_application_entreprise` avec
`p_source = "administration_elsatia"` et `p_reference_externe = null`.

> RPC équivalente, **documentée pour diagnostic seulement, à ne pas exécuter** :
> `select public.plateforme_activer_application_entreprise('<entrepriseId>', 'colors', null, null, 'administration_elsatia', null);`

---

## 5. Habilitation de `julien@elsatia.fr` — geste applicatif

Rôle attendu, présent et `actif` au catalogue 263 :
**`colors_admin_organisation`** — libellé d'interface « Administrateur ELSATIA Colors ».

(Les trois autres rôles Colors du catalogue, non retenus ici :
`colors_gestionnaire_stock`, `colors_utilisateur_depot`, `colors_consultation`.)

Sur le même écran `/plateforme/entreprises/<entrepriseId>/applications` :

1. Section **« Habilitations des utilisateurs »**
2. Déplier la ligne de `julien@elsatia.fr` (repérée par prénom/nom ou UUID, cf. §3)
3. Vérifier la pastille de statut du membre : elle doit indiquer **`actif`** — sinon le
   bouton d'habilitation est désactivé
4. Carte **ELSATIA Colors** → liste **« Rôle applicatif »** → choisir
   **« Administrateur ELSATIA Colors »**
5. Dates de validité laissées **vides**
6. Bouton **« Habiliter l'utilisateur »**
7. Attendu : bandeau vert **« Habilitation enregistrée »**, pastille passée à **Active**

> RPC équivalente, **documentée pour diagnostic seulement, à ne pas exécuter** :
> `select public.plateforme_habiliter_utilisateur_application('<utilisateurId>', '<entrepriseId>', 'colors', 'colors_admin_organisation', null, null);`

---

## 6. Déploiement Colors — procédure préparée (à ne pas exécuter dans ce lot)

Projet `elsatia-colors` · Root Directory `apps/colors` · canon `77c6f4c`.

Commande historique, **non exécutée ici** :

```
npx vercel deploy --prod --yes
```

### Contrôles préalables

- [ ] Worktree sur `77c6f4c9961c5e2f14e69b88ebb66f9128a1431d` — `git rev-parse HEAD` le confirme
- [ ] `git status --porcelain` **vide** (aucune modification non commitée)
- [ ] Répertoire courant = `apps/colors`, et projet Vercel **lié** (`.vercel/` est
      gitignoré : un worktree neuf n'est pas lié, il faut le lier avant, ce qui suppose
      une session Vercel interactive)
- [ ] Root Directory du projet confirmé à `apps/colors` dans les réglages Vercel —
      `apps/colors` **ne contient pas** de `vercel.json` ; le `vercel.json` de la racine
      appartient à Gestion Pro (crons `/api/cron/*` inexistants dans Colors) et ne doit
      pas être embarqué
- [ ] Variables Production présentes, **par nom uniquement, aucune valeur affichée** :
      `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
      `NEXT_PUBLIC_COLORS_URL`, `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL`,
      `SUPABASE_SERVICE_ROLE_KEY`, `ELSATIA_APPLICATION_ENV`
- [ ] `ELSATIA_APPLICATION_ENV` vaut bien `production` — sinon le sélecteur
      d'applications pointerait vers les URL **locales** du catalogue
- [ ] Quota de déploiement Vercel ouvert (à constater dans le Dashboard : non
      vérifiable hors interface)
- [ ] Domaine `colors.elsatia.fr` toujours rattaché au projet
- [ ] Qualité rejouée sur le canon : `npm test` **201/201**, `npm run typecheck`,
      `npm run lint`, `npm run build` (25 routes) — tous verts au 2026-09-06
- [ ] Aucun secret affiché en console pendant l'opération

---

## 7. Gabarit Supabase — vérification manuelle

Contrat **obligatoire**, inchangé, tel qu'il figure dans
`supabase/templates/reset_password.html` :

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
```

- [ ] Dashboard Supabase → projet `exhvuzegsefmoguxoiak` → Authentication → Emails →
      **Reset Password** : le lien doit porter **`{{ .SiteURL }}`**
- [ ] **`{{ .RedirectTo }}` doit être absent.** Il porte l'URL de callback complète,
      chaîne de requête comprise ; sa concaténation produit un lien malformé et casse le
      parcours des **deux** applications (mesuré et consigné le 2026-09-05)
- [ ] Si `.RedirectTo` est présent : le remplacer par `{{ .SiteURL }}` — c'est la seule
      intervention admise sur ce gabarit
- [ ] `SiteURL` reste `https://app.elsatia.fr`

Aucun gabarit n'est modifié par ce lot.

---

## 8. Relais Gestion Pro → Colors — matrice

| Élément | `996be15` | `7ba62c5` | `77c6f4c` (Colors) |
|---|---|---|---|
| `src/lib/auth-relais-colors.ts` | **NON** | **NON** | OUI |
| `src/lib/auth-relais-colors.test.ts` | **NON** | **NON** | OUI |
| `lienRelaisColors` dans `src/app/auth/confirm/page.tsx` | **NON** | **NON** | OUI |
| Bouton « Poursuivre sur ELSATIA Colors » | **NON** | **NON** | OUI |
| Lecture de `NEXT_PUBLIC_COLORS_URL` côté GP | **NON** | **NON** | OUI |
| Sélecteur d'applications GP → Colors (`ApplicationSwitcherGestionPro`, `multi-app.ts`) | OUI | OUI | — |

**Deux constats distincts, à ne pas confondre :**

- **Navigation** vers Colors depuis Gestion Pro : **présente** dans `7ba62c5`. Elle
  passe par `applications_autorisees` → `url_production` du catalogue
  (`https://colors.elsatia.fr`) et **ne dépend d'aucune variable d'environnement Colors**,
  seulement de `ELSATIA_APPLICATION_ENV = production` côté GP.
- **Relais de réinitialisation** : **absent** de `996be15` **et** de `7ba62c5`.

### Delta restant, identifié, non corrigé dans ce lot

Le relais provient d'un unique commit :

```
3870e1c  2026-09-05  feat(auth): relayer un lien de récupération vers ELSATIA Colors
  src/lib/auth-relais-colors.ts        +66
  src/lib/auth-relais-colors.test.ts   +64
  src/app/auth/confirm/page.tsx        +23
  src/app/auth/confirm/page.test.ts    +37
  → 4 fichiers, +190 lignes, 0 suppression
```

`src/app/auth/confirm/page.tsx` est **octet pour octet identique** entre `3870e1c^` et
`7ba62c5` : le report du commit sur la ligne de cutover s'appliquerait sans conflit. Il
exigerait en plus `NEXT_PUBLIC_COLORS_URL` sur le projet Vercel **Gestion Pro**.

**Rien n'est mergé ni cherry-pické dans ce lot.**

**Impact réel de l'absence** : dégradation d'expérience, pas d'impasse. Le gabarit étant
ancré sur `SiteURL`, une réinitialisation demandée depuis Colors atterrit sur Gestion Pro ;
le mot de passe du compte ELSATIA commun y est bien changé, et la personne se reconnecte
ensuite sur Colors. Le parcours aboutit, il ne se termine simplement pas sur Colors.

---

## 9. Smoke test post-cutover

À dérouler **après** §4, §5, §6 et §7, en navigation privée.

| # | Contrôle | Attendu |
|---|---|---|
| A | Ouvrir `https://colors.elsatia.fr/login` | 200, formulaire, lien « Mot de passe oublié ? » **présent** (absent = ancien build encore servi) |
| B | Connexion `julien@elsatia.fr` (mot de passe saisi par Julien seul) | Redirection vers `/dashboard` |
| C | Contexte entreprise | En-tête « Bonjour <prénom> », raison sociale de l'entreprise cible affichée |
| D | `a_acces_application` = `true` | `GET /api/acces` → `200 {"application":"colors","autorise":true}` |
| E | Rôle `colors_admin_organisation` | Navigation et actions d'administration Colors visibles (le rôle est résolu par `resoudreRoleColors`, un rôle non reconnu lève une erreur) |
| F | `/dashboard` accessible | 200, bandeau « Accès Colors vérifié côté serveur », 4 cartes de métriques |
| G | Rafraîchir `/dashboard` | Reste 200, aucune redirection |
| H | Déconnexion puis reconnexion | `/login?message=deconnexion` puis retour `/dashboard` |
| I | `/mot-de-passe-oublie` | 200 ; soumission → confirmation neutre « Si un compte ELSATIA correspond… » (jamais de réponse différenciée) |
| J | `/auth/confirm` | 200, GET **inerte** — le jeton n'est consommé qu'au clic explicite |
| K | Noindex | `<meta name="robots" content="noindex, nofollow">`, en-tête `X-Robots-Tag: noindex, nofollow`, `/robots.txt` → 200 `Disallow: /` |
| L | En-têtes de sécurité sur `/login` | CSP noncée présente et **nonce différent à chaque requête** ; `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP `same-origin`, HSTS `includeSubDomains; preload`, pas de `X-Powered-By` |
| M | Aucune boucle | `/`→`/dashboard` ; hors session `/dashboard`→`/login` ; jamais `/acces-refuse` renvoyant sur lui-même |
| N | Aucun 401/403 inattendu | Console navigateur sans erreur, aucune violation CSP, `/api/acces` en 200 |

Contrôle complémentaire recommandé : `/login?error=nimportequoi` **ne doit rien
afficher** (jeu de codes fermé). Si le texte arbitraire s'affiche, l'ancien build est
encore servi.

---

## 10. Échec et diagnostic

**Aucun rollback DB automatique.** Toutes les corrections ci-dessous sont des gestes
applicatifs ou des octrois, jamais une restauration de base.

| Symptôme | Cause la plus probable | Geste |
|---|---|---|
| Compte Auth absent | Invitation jamais aboutie | Réémettre l'invitation par le parcours normal GP. Ne jamais créer le compte à sa place |
| Entreprise absente / membre non `actif` | `utilisateurs_entreprises.statut ≠ 'actif'` | Réactiver le membre côté GP. Le bouton d'habilitation reste désactivé tant que le statut n'est pas `actif` |
| `entreprise_active_id` incohérent | Entreprise active ≠ entreprise habilitée | Faire basculer l'entreprise active depuis Gestion Pro. `contexte_application_courant()` ne renvoie rien sinon |
| Entitlement `false` malgré l'activation | Fenêtre `valide_du` / `valide_jusqu_au` mal saisie | Rouvrir l'écran, vider les deux dates, réactiver. Pastille « Planifiée » ou « Expirée » = fenêtre en cause |
| **« Activation impossible » / « Habilitation impossible »** | Message **générique** : l'action serveur n'expose pas l'exception SQL | Trois causes à écarter dans l'ordre : (1) session non AAL2 — ressortir et repasser par `/plateforme` pour relever le défi MFA ; (2) rôle ≠ `total` ou identité plateforme non `active` ; (3) entreprise/application/rôle introuvable |
| RPC refuse AAL2 | JWT sans `aal = aal2` | Se déconnecter, se reconnecter, relever le défi MFA, **refaire l'octroi dans la même session** |
| Colors renvoie `/acces-refuse` | Organisation autorisée mais **habilitation individuelle** manquante | Refaire §5 |
| Colors renvoie `/abonnement-requis` | **Organisation** non autorisée | Refaire §4 |
| Colors renvoie `/login?error=acces-colors` | Contexte canonique indisponible : ledger < 263, ou aucune appartenance active | Vérifier le ledger Production, puis §3 |
| E-mail de reset incorrect / lien mort | Gabarit basculé sur `{{ .RedirectTo }}` | Rétablir `{{ .SiteURL }}` — §7. Aucun autre changement |
| Ancien build encore servi | Déploiement non pris ou cache CDN | Contrôler `/robots.txt` (404 = ancien build) et l'absence d'en-têtes de sécurité. Redéployer ; ne jamais « corriger » côté DB |
| Rollback applicatif nécessaire | Régression Colors | Repromouvoir le déploiement Colors précédent depuis le Dashboard Vercel. **Sans toucher à la base** : les octrois §4/§5 restent valides et n'ont pas à être défaits |

---

## 11. Sécurité du runbook

Ce document ne contient et n'exige **aucun** mot de passe, jeton, code TOTP, clé de
service, cookie ni secret Vercel. Les variables d'environnement n'y figurent que **par
leur nom**. Les seules requêtes SQL citées sont soit des lectures d'identification, soit
des équivalents documentés pour diagnostic et explicitement marqués « à ne pas exécuter ».

---

## 12. Checklist opérateur

**Prérequis**
- [ ] Cutover Production 211 → 263 terminé et validé
- [ ] `julien.gregurec@gmail.com` : `actif = true`, `statut_identite = 'active'`, rôle `total`
- [ ] Facteur MFA enrôlé pour cet opérateur

**Compte cible** *(§3)*
- [ ] Auth `julien@elsatia.fr` existe · [ ] email confirmé · [ ] non banni
- [ ] UUID noté · [ ] entreprise cible identifiée
- [ ] membership `actif` · [ ] `entreprise_active_id` cohérent

**Octrois** *(§4 et §5)*
- [ ] Session AAL2 ouverte (défi MFA relevé)
- [ ] Colors activée pour l'entreprise — bandeau « Application activée »
- [ ] `julien@elsatia.fr` habilité `colors_admin_organisation` — bandeau « Habilitation enregistrée »

**Déploiement** *(§6)*
- [ ] SHA `77c6f4c` · [ ] worktree propre · [ ] projet lié, Root Directory `apps/colors`
- [ ] 6 variables présentes par nom · [ ] `ELSATIA_APPLICATION_ENV = production`
- [ ] quota Vercel ouvert · [ ] domaine rattaché
- [ ] déploiement effectué

**Gabarit** *(§7)*
- [ ] Reset Password porte `{{ .SiteURL }}` · [ ] `{{ .RedirectTo }}` absent

**Smoke** *(§9)*
- [ ] A [ ] B [ ] C [ ] D [ ] E [ ] F [ ] G [ ] H [ ] I [ ] J [ ] K [ ] L [ ] M [ ] N

**Optionnel — relais de reset** *(§8)*
- [ ] Décision prise sur le report de `3870e1c` sur la ligne GP
- [ ] Si reporté : `NEXT_PUBLIC_COLORS_URL` ajoutée au projet Vercel Gestion Pro
