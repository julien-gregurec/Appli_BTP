# ELSATIA-COLORS-PRECOMMERCIAL-REALITY-AUDIT-V1

**Date :** 2026-09-05
**Périmètre :** `apps/colors` + `https://colors.elsatia.fr` (Production)
**Nature :** audit de lecture. Aucun code modifié, aucune écriture Production, aucune donnée compte touchée.

---

## 0. Résumé exécutif

Colors Production est aujourd'hui **un mur de connexion sans application derrière**.

Le socle multi-app dont dépend 100 % de l'application (`contexte_application_courant`,
`a_acces_application`, `applications_elsatia`, toutes les tables `colors_*`) vit dans les
migrations `…000234` et `…000246`–`…000249`. Le ledger Production est à **210** (dernière
migration `…000231`) selon la baseline du préflight cutover. **Aucun de ces objets n'existe
en Production.** Conséquence directe et vérifiée dans le code : toute authentification
réussie est immédiatement suivie d'un `signOut()` et d'un retour au formulaire.

Le code applicatif, lui, est de bonne facture : accès vérifié côté serveur sur chaque route,
RLS complète, isolation tenant sérieuse, mobile réellement traité. Ce n'est pas le code qui
bloque, c'est la base.

**Trois défauts réels et indépendants du cutover ont été trouvés, dont un exploitable
aujourd'hui en Production sans authentification** (redirection ouverte sur `/auth/callback`).

---

## 1. Repo / branche / SHA

| Élément | Valeur |
|---|---|
| Repo | `git@github.com:julien-gregurec/Appli_BTP.git` |
| Branche Colors canonique | `fix/elsatia-colors-standalone-build-v1` |
| SHA HEAD de cette branche | `3f20eaa` — *fix(colors): add global error boundary for missing multi-app contract* (2026-09-04 19:02) |
| Commit précédent | `2753f04` — *fix(colors): isolate standalone PostCSS configuration* (2026-08-29) |
| Base d'intégration | `00e383d` (PR #1, *feat(colors): integrate Colors v1.3 into canonical platform*) |
| `origin` aligné | oui (`origin/fix/elsatia-colors-standalone-build-v1` = `3f20eaa`) |
| Worktree principal | `/Users/juliengregurec/Projects/elsatia-main`, branche **`feature/tools-production-workflow`** @ `7b18d9b` |
| Merge-base avec le worktree courant | `fcdd4e7` (2026-08-26) |

**Point d'attention :** le worktree principal n'est **pas** sur la branche Colors. `apps/colors`
y existe mais dans une version antérieure (35 fichiers de différence, dont `actions-metier.ts`,
`api/photos`, `api/export`, `global-error.tsx`, `metier-colors.ts`, `permissions-colors.ts`).
Toute intervention Colors doit se faire depuis `fix/elsatia-colors-standalone-build-v1`,
jamais depuis `feature/tools-production-workflow`.

L'état historique annoncé dans la mission (`2753f04`, `3f20eaa`) est **confirmé exact**.

---

## 2. Build

| Vérification | Résultat |
|---|---|
| Build Production | **PASS** — `colors.elsatia.fr` sert un build Next.js 16.2.12 fonctionnel (buildId `GzutNZiMqaNTwt0WWJZRu`, Vercel région `fra1`) |
| Build local rejoué | **NON EXÉCUTÉ** — disque hôte plein (138 Mio libres sur 228 Gio, `npm ci` échoue en `ENOSPC`). Le partiel installé a été supprimé. |
| Typecheck / lint / tests locaux | **NON REJOUÉS** (même cause) |
| Tests unitaires | 13 fichiers `*.test.ts` (27 tests d'après le message de commit `3f20eaa`, non revérifiés) |

Le build est donc attesté **par le déploiement réel**, pas par une exécution locale de ma part.

---

## 3. Cartographie fonctionnelle

Stack : Next.js 16 App Router, `src/proxy.ts` (ex-middleware, renommage Next 16), Supabase SSR,
rendu 100 % serveur. Aucun client Supabase navigateur.

| Route | Fonction | Opérationnelle | Partielle | Placeholder | Dépendance | Priorité |
|---|---|:--:|:--:|:--:|---|---|
| `/` | Redirection → `/dashboard` | ✅ | | | — | — |
| `/login` | Connexion mot de passe | ⚠️ | ✅ | | RPC socle | **P0 / CUTOVER** |
| `/auth/callback` | Échange `code` → session | ⚠️ | | | jamais liée depuis l'UI | **P0 (redirection ouverte)** |
| `/acces-refuse` | Refus habilitation | | ✅ | | boucle possible (§6) | P1 |
| `/abonnement-requis` | Refus droit organisation | ✅ | | | — | — |
| `/dashboard` | 4 compteurs + liens rapides | ✅ | | | RPC `colors_statistiques` | CUTOVER |
| `/inventaire` | Liste, filtres, création seau, export CSV | | ✅ | | limite 60 non paginée | **P1** |
| `/inventaire/[id]` | Fiche, niveau, état, déplacement, photo, historique | ✅ | | | — | CUTOVER |
| `/ajout-photo` | 3 étapes explicatives, aucun upload | | ✅ | | OCR non câblé | P2 |
| `/depots` | Emplacements hiérarchiques | ✅ | | | — | CUTOVER |
| `/mouvements` | Historique 100 derniers | ✅ | | | pas de pagination | P2 |
| `/parametres` | Seuil de stock faible | ✅ | | | — | CUTOVER |
| `/nuanciers` | — | | | ✅ | aucune donnée fabricant | **Post-launch** |
| `/catalogues` | — | | | ✅ | modèle marques/gammes absent | **Post-launch** |
| `/imports` | — | | | ✅ | dépend du modèle métier | **Post-launch** |
| `/utilisateurs` | — | | | ✅ | portail habilitations à construire | **Post-launch** |
| `/api/acces` | Sonde d'accès serveur | ✅ | | | — | — |
| `/api/photos` | Upload photo validé (magic bytes) | ✅ | | | `SUPABASE_SERVICE_ROLE_KEY` | **P0 config** |
| `/api/export/inventaire` | Export CSV (anti-injection formule) | ✅ | | | limite 5000 | — |
| `/manifest.webmanifest`, `/sw-colors.js` | PWA | ✅ | | | — | — |

**Protection des routes vérifiée en direct (non authentifié) :** `/dashboard`, `/inventaire`,
`/depots`, `/mouvements`, `/nuanciers`, `/parametres`, `/utilisateurs`, `/acces-refuse`,
`/abonnement-requis`, `/api/acces`, `/api/export/inventaire` → **tous 307 → `/login`**. Aucune
fuite. `/manifest.webmanifest` et `/sw-colors.js` → 200 (attendu). 404 correct sur route inconnue.

Les 4 placeholders sont **honnêtes** : `ComingSoon` affiche « Structure préparée / Bientôt
disponible / Aucune fonctionnalité métier n'est simulée dans ce jalon », et la navigation les
marque d'une pastille `soon-dot`. Aucune fonction n'est simulée ni faussement promise.

---

## 4. Authentification

| Fonction | État | Constat |
|---|---|---|
| Connexion | **Câblée, non fonctionnelle en Production** | `signInWithPassword` puis `contexte_application_courant` → RPC absente → `signOut()` → `/login?error=…` |
| Inscription | **Absente (par conception)** | Compte ELSATIA commun, créé côté Gestion Pro |
| Déconnexion | ✅ | `deconnexionAction` → `signOut` → `/login?message=…` |
| Récupération mot de passe | **ABSENTE de l'UI** | Aucun lien « mot de passe oublié », aucun lien vers le portail compte sur `/login` |
| Callback auth | ⚠️ | Existe, **jamais liée depuis l'UI Colors**, et porteuse de la redirection ouverte (§9) |
| Gestion session | ✅ | `proxy.ts` rafraîchit les cookies, session isolée par domaine, aucun jeton lu depuis une autre origine |
| Compte utilisateur | Externalisé | `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL` (défaut `http://localhost:3000/abonnement`) |
| Erreurs auth | ⚠️ | Deux messages distincts : « Identifiants incorrects. » vs « …ne dispose pas d'un accès actif à Colors. » |

**Aucun compte Production n'a été touché.** Aucun identifiant saisi, aucune tentative de connexion.

**Chaîne d'autorisation (lue, correcte) :** session → `contexte_application_courant` →
`verifierAccesApplication` → `determinerAccesColors` (distingue *droit organisation absent* de
*habilitation individuelle absente*) → `exigerAccesApplication` au plus près de la route →
`resoudreRoleColors`. Chaque `action` serveur et chaque route API refait la chaîne complète.
C'est du travail propre, sans raccourci.

---

## 5. Multi-app

### INDÉPENDANT du cutover
- Build, routage, rendu, CSS, PWA, service worker, manifeste.
- Écran `/login` et sa mise en page.
- Toute la logique pure testée : `quantites`, `ral`, `recherche-colors`, `csv-colors`,
  `media-colors`, `permissions-colors`, `acces-colors-policy`, `selecteur-applications`.
- **Les 3 défauts de sécurité/UX du §9 et du §17** — corrigeables aujourd'hui, sans base.

### DÉPEND DU CUTOVER GESTION PRO (bloquant, total)
Migrations `…000234` (convergence multi-app) et `…000246`–`…000249` (cœur Colors).
Objets requis, **tous absents du ledger Production 210** :

| Objet | Migration |
|---|---|
| `contexte_application_courant`, `a_acces_application`, `applications_autorisees` | `…000234` |
| `applications_elsatia`, `acces_applications_entreprises`, `habilitations_applications_utilisateurs`, `roles_applications_elsatia` | `…000234` |
| `colors_seaux`, `colors_emplacements`, `colors_mouvements`, `colors_parametres`, `colors_analyses_ocr` | `…000246` |
| `colors_statistiques`, `colors_modifier_seau`, `colors_enregistrer_parametres`, colonne `recherche_text` | `…000247` |
| `colors_signaler_nettoyage_photo`, `colors_resoudre_nettoyage_photo`, politiques Storage `…_v12` | `…000248` |
| `colors_nettoyages_photos_seau` | `…000249` |
| Bucket privé `colors-seaux` (10 Mo, MIME liste blanche) | `…000246` |

Le commit `3f20eaa` documente lui-même le symptôme : *« Un login réussi avant le cutover
Gestion Pro (RPC `a_acces_application` absente en Production) fait échouer
`verifierAccesApplication()` avec un throw non intercepté »*. Le `global-error.tsx` ajouté est
un **cache-misère assumé**, pas un correctif.

### BLOQUÉ (ni maintenant, ni au cutover)
- `/nuanciers`, `/catalogues`, `/imports`, `/utilisateurs` : aucun modèle de données, aucune
  donnée fabricant. Ce sont des lots produit à part entière.
- **ELSATIA Tools n'est pas dans le catalogue `applications_elsatia`** (seuls `gestion_pro` et
  `colors` y sont insérés). Le sélecteur d'applications de Colors ne proposera donc jamais
  Tools tant qu'une ligne ne sera pas ajoutée.

Aucune architecture multi-app parallèle n'a été trouvée dans Colors : tout passe par
`@elsatia/application-access` et le catalogue central. **Conforme.**

---

## 6. Fonctions Colors — ce qui existe réellement

### Réellement implémenté
- **Seaux individualisés** : marque, produit, référence, teinte, HEX, 3 modes de quantité
  (volume / poids / pourcentage), `pourcentage_restant` colonne générée, 4 états
  (fermé/ouvert/vide/archivé), notes.
- **Emplacements hiérarchiques** : 8 types (dépôt, véhicule, chantier, atelier, zone, rack,
  étagère, autre), parent/enfant, unicité par entreprise.
- **Historique immuable** : 11 types de mouvements, `DELETE` révoqué sur la table pour
  `authenticated`, écriture uniquement par RPC `SECURITY DEFINER`.
- **Recherche serveur** : `ilike` sur colonne générée `recherche_text` + index GIN trigram.
- **Filtres** : état, emplacement, stock faible, sans photo, archivés.
- **Photos** : upload validé par **signature binaire** (magic bytes JPEG/PNG/WebP/HEIC/HEIF),
  10 Mo max, URL signée 300 s avec transformation 900×900, suivi de nettoyage persistant des
  anciennes photos non supprimées.
- **Export CSV** : BOM UTF-8, séparateur `;`, échappement anti-injection de formule (`=+-@`).
- **Paramètres** : seuil de stock faible par entreprise.
- **Permissions** : 5 rôles × 13 actions, matrice appliquée **deux fois** (UI + serveur), et
  une troisième fois en base par `colors_action_autorisee`.

### Présent en code mais NON câblé — à ne pas annoncer
- **Correspondance RAL** : `lib/ral.ts` (conversion Lab, distance ΔE, `ralLePlusProche`) est
  écrit et testé mais **appelé nulle part**. Les colonnes `ral_approxime`, `ral_distance`,
  `ral_confirme` ne sont jamais écrites ni affichées. Aucune palette RAL n'est livrée.
- **OCR d'étiquette** : `lib/ocr-colors.ts` n'est qu'une interface `FournisseurOcrColors` +
  une validation. **Aucune implémentation, aucun appel.** La table `colors_analyses_ocr` et sa
  RLS existent, jamais alimentées. `/ajout-photo` le dit explicitement : « Le contrat de
  fournisseur OCR est prêt, sans appel payant ni reconnaissance active dans ce jalon. »
- **`filtrerInventaire`** (`lib/recherche-colors.ts`) : filtrage client, remplacé par le
  filtrage serveur, jamais appelé. Code mort testé.

### Absent — ne rien promettre
Nuanciers fabricants · catalogues produits · imports · favoris · projets · associations
seau↔chantier · alertes/notifications (le seuil « prépare les alertes », aucun envoi n'est
activé — le texte de `/parametres` le dit) · portail d'habilitations.

---

## 7. UX

| Point | Constat |
|---|---|
| Boutons sans action | **Aucun.** Toutes les actions sont câblées ou masquées par permission. |
| Pages vides | **OUI, 5 routes** — voir défaut ci-dessous. |
| Placeholders | 4 routes, honnêtement libellées, pastille en navigation. |
| Liens morts | Risque de configuration : `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL` non défini ⇒ le lien « Compte et abonnements » pointe sur `http://localhost:3000/abonnement`. Idem `ELSATIA_APPLICATION_ENV` non défini ⇒ le sélecteur d'applications renvoie `http://localhost:3000` / `:3010`. **Non vérifiable de l'extérieur.** |
| Erreurs console | **Aucune** sur `/login` en Production (relevé direct). |
| États loading | Présents sur l'upload photo (`Envoi…`, bouton désactivé). Absents ailleurs (formulaires natifs, rendu serveur). |
| États empty | Présents et soignés : inventaire, dépôts, mouvements. |
| Erreurs réseau | `global-error.tsx` générique, sans détail technique. Correct. |
| Accessibilité | Bon niveau : piège de focus dans le tiroir mobile, `Escape`, `aria-modal`, `aria-expanded`, `aria-controls`, `role="status"` sur les flashs, cibles 44 px. |

### Défaut UX confirmé — page blanche pour l'administrateur plateforme
`contexte_application_courant` renvoie `entreprise_id = null` pour un admin plateforme sans
entreprise active, et `a_acces_application(null, 'colors')` renvoie **`true`** (branche
`est_plateforme_admin`). Le shell se rend donc normalement, mais `/dashboard`, `/inventaire`,
`/depots`, `/mouvements` et `/parametres` font tous `if (!c.entrepriseId) return null;` →
**zone de contenu entièrement vide**, sans titre ni message. Seul `/ajout-photo` s'affiche.

C'est précisément le parcours qu'empruntera l'opérateur au smoke test T+45 du cutover.

**Corollaire opérationnel :** un admin plateforme reçoit le rôle
`administrateur_plateforme_global`, qui dans la matrice Colors n'a que `voir_stock` et
`voir_fiche`. Il ne peut **ni créer un seau, ni créer un emplacement, ni modifier les
paramètres**. Une démonstration ou une recette Colors exige une habilitation
`colors_admin_organisation` réelle sur une entreprise réelle.

---

## 8. Mobile

Vérifié en direct sur `/login` (seule route atteignable sans session) :

| Largeur | Constat |
|---|---|
| **375 px** | ✅ Colonne unique, visuel décoratif masqué, champs 44 px, aucun débordement horizontal. |
| **430 px** | ✅ Identique, respiration correcte. |
| **768 px** | ⚠️ Bascule sur la mise en page deux colonnes ; la colonne formulaire devient étroite mais reste utilisable. |

**Analyse CSS du shell authentifié** (non vérifiable visuellement, faute d'accès) :
breakpoints à **1100 px** et **760 px** uniquement. À **768 px** la barre latérale fixe de
274 px reste affichée alors que `.filter-bar` est encore en `repeat(3,1fr)` et
`.inventory-grid` en `repeat(2,1fr)` → contenu comprimé sur ~470 px utiles. **Le breakpoint
760 px devrait être relevé à 900 px**, ou la latérale rendue rétractable en tablette.

Sous 760 px le travail est réel et complet : latérale masquée, tiroir `min(88vw, 330px)`,
toutes les grilles en colonne unique, boutons pleine largeur, cibles 44 px, `secure-pill`
et métadonnées secondaires masquées.

---

## 9. Offline / PWA / natif

| Élément | État réel |
|---|---|
| Manifeste | ✅ Servi et valide (`/manifest.webmanifest`, `start_url: /dashboard`, `display: standalone`, thème `#44264d`). |
| Icônes | ⚠️ **SVG uniquement** (`colors-icon.svg`, `colors-maskable.svg`, `sizes: "any"`). Android/Chrome exige au moins un PNG 192 et 512 pour une installation propre ; iOS ignore les `apple-touch-icon` SVG. **L'installation PWA sera dégradée.** |
| Service worker | ✅ Servi. Préfixe de cache `elsatia-colors-` isolé de Gestion Pro. Ne pré-cache que `/login` et les 2 icônes. Stratégie réseau-d'abord, repli cache, repli final `/login`. **Ne met en cache aucune réponse métier authentifiée** — correct et volontaire. |
| Offline réel | ❌ **Inexistant.** Hors ligne, l'utilisateur retombe sur `/login`. Aucune consultation d'inventaire, aucune file d'écriture différée. Pour une app « pensée pour les équipes qui travaillent sur le terrain », c'est un écart produit à assumer explicitement. |
| Capacitor | ❌ **Aucune trace** dans tout le dépôt. |
| iOS / Android | ❌ **Aucun dossier `ios/`, aucun dossier `android/`.** |

**À ne jamais annoncer : il n'existe aucun support natif iOS ou Android pour Colors.**
Le seul canal mobile est la PWA, elle-même dégradée par l'absence d'icônes PNG et sans
véritable mode hors ligne.

---

## 10. Sécurité

### Solide (vérifié)
- **Aucun secret exposé** : la page `/login` livrée en Production ne contient ni URL Supabase,
  ni clé anon, ni JWT. Le client Supabase est exclusivement serveur.
- **Isolation tenant** : RLS active sur les 5 tables `colors_*`, chaque politique passe par
  `colors_action_autorisee(entreprise_id, action)`. `DELETE` révoqué pour `authenticated`.
  Toutes les mutations passent par des RPC `SECURITY DEFINER` avec `search_path` figé.
- **Storage** : bucket `colors-seaux` **privé**, 10 Mo, liste blanche MIME. Les écritures
  directes au JWT utilisateur sont **fermées par politique restrictive** (`…_v12`) : seule la
  route serveur écrit, après inspection des octets — la signature binaire ne pouvant être
  validée dans une policy. Choix documenté et cohérent, il **justifie** l'usage de la clé
  service-role dans `/api/photos`.
- **Chemins Storage** cloisonnés `entreprise_id/seau_id/uuid.ext`, lecture par URL signée 300 s.
- **Export CSV** protégé contre l'injection de formule.
- **`next` non validé** → aucune ouverture sur `//` (testé : `//evil…` correctement neutralisé).
- **Erreurs de la base non propagées** dans `@elsatia/application-access` (testé côté paquet).

### Écarts réels

**S1 — Redirection ouverte sur `/auth/callback` — EXPLOITABLE EN PRODUCTION, SANS SESSION**

Le garde-fou `suivant.startsWith("/") && !suivant.startsWith("//")` ne couvre ni la barre
oblique inverse ni les caractères de contrôle. `new URL()` (WHATWG) normalise `\` en `/` pour
les schémas spéciaux et ignore les blancs de tête.

Vérifié en direct sur `https://colors.elsatia.fr` :

| `next` | `Location` renvoyée |
|---|---|
| `/%5Cevil.example.com` | **`https://evil.example.com/`** |
| `/%09/evil.example.com` | **`https://evil.example.com/`** |
| `//evil.example.com` | `https://colors.elsatia.fr/dashboard` (bloqué) |
| `/dashboard` | `https://colors.elsatia.fr/dashboard` (correct) |

Le **même validateur** est dupliqué dans `login/page.tsx` et `actions.ts` : la connexion par
mot de passe porte la même faille sur son `next`.
Impact : hameçonnage depuis un lien portant le domaine légitime `colors.elsatia.fr`.
Correctif : valider avec `new URL(suivant, origin)` et **exiger `url.origin === origin`**, en
un seul point partagé.

**S2 — Message d'erreur arbitraire injectable sur l'écran de connexion**

`/login` rend `searchParams.error` et `searchParams.message` tels quels. Vérifié en direct :
`…/login?error=Compte%20suspendu%20—%20appelez%20le%2001%2023%2045%2067%2089` affiche ce texte
au-dessus du champ mot de passe, sur le domaine légitime. React échappe le HTML : **pas de
XSS**. Mais combiné à S1, cela compose un hameçonnage crédible de bout en bout.
Correctif : n'accepter qu'un jeu fermé de codes de message.

**S3 — Messages techniques de la base renvoyés à l'utilisateur, via l'URL**

`actions-metier.ts` fait systématiquement `retour(path, error.message, "erreur")` : le texte
d'erreur PostgreSQL/PostgREST brut est placé **en query string** puis affiché. Il finit dans
l'historique du navigateur, les journaux Vercel et les référents. C'est l'inverse exact du
principe appliqué dans `@elsatia/application-access` (« ne propage pas les messages techniques
de la base », couvert par un test).
Correctif : messages métier fermés, détail technique journalisé côté serveur uniquement.

**S4 — Aucun en-tête de sécurité**

Relevé sur `/login` : seul `strict-transport-security` (posé par Vercel). **Absents :**
`Content-Security-Policy`, `X-Frame-Options` / `frame-ancestors`, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.
`apps/colors/next.config.ts` ne déclare aucun `headers()`. Gestion Pro, lui, dispose de
`src/lib/security/headers.ts` (complet, avec CSP à nonce et `frame-ancestors 'none'`).
Risque concret : **le formulaire de connexion Colors est encadrable** (clickjacking).

**S5 — Boucle de redirection possible sur `/acces-refuse`**

`contexte.ts` redirige vers `/acces-refuse?motif=appartenance` quand
`contexte_application_courant` ne renvoie aucune ligne ; or `/acces-refuse` appelle
lui-même `getContexteColors()`, qui reprend le même chemin → **`ERR_TOO_MANY_REDIRECTS`**.
Atteignable pour un utilisateur authentifié dont l'appartenance a été désactivée après
ouverture de session, ou via `/auth/callback` (qui, lui, ne rejoue pas le garde-fou de
`connexionAction`). Le paramètre `motif` est d'ailleurs passé mais jamais lu : les deux motifs
affichent le même texte.

**S6 — Oracle de mot de passe (mineur, assumé)**

« Identifiants incorrects. » vs « …ne dispose pas d'un accès actif à Colors. » permet de
confirmer un couple email/mot de passe valide même sans droit Colors. Le commentaire du code
assume ce choix (« une authentification valide ne doit jamais être présentée comme un échec de
mot de passe »). Arbitrage produit à conserver ou à trancher, pas un défaut.

### Configuration Production non vérifiable de l'extérieur — à contrôler avant ouverture
`SUPABASE_SERVICE_ROLE_KEY` (absent ⇒ upload photo en 503 « Stockage Colors indisponible »),
`ELSATIA_APPLICATION_ENV=production` (absent ⇒ sélecteur d'applications pointant sur
`localhost`), `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL`, `NEXT_PUBLIC_COLORS_URL`.
**`.env.example` de Colors ne documente ni `SUPABASE_SERVICE_ROLE_KEY` ni
`ELSATIA_APPLICATION_ENV`** — écart de documentation qui rend l'oubli probable.

---

## 11. Erreurs console

Aucune. Relevé direct sur `/login` en Production, aux trois largeurs testées.
Les routes authentifiées n'ont pas pu être instrumentées.

---

## 12. Classement

### P0 — avant toute ouverture à des utilisateurs

| # | Écart | Nature |
|---|---|---|
| **P0-1** | **S1 — redirection ouverte `/auth/callback` + `next` de connexion** | Sécurité, live, corrigeable seul |
| **P0-2** | Socle multi-app absent en Production : **personne ne peut franchir la connexion** | **DÉPEND CUTOVER GP** |
| **P0-3** | Aucun chemin de récupération de mot de passe ni lien vers le portail compte sur `/login` | UX bloquante |
| **P0-4** | Variables d'environnement Production à confirmer (`SUPABASE_SERVICE_ROLE_KEY`, `ELSATIA_APPLICATION_ENV`) | Configuration |
| **P0-5** | Habilitation `colors_admin_organisation` réelle à provisionner pour la recette (l'admin plateforme est en lecture seule) | Données / onboarding |

### P1 — rapide, réalisable maintenant

| # | Écart |
|---|---|
| **P1-1** | S4 — en-têtes de sécurité (réutiliser `headersSecurite`, hors CSP à nonce) |
| **P1-2** | S2 — message `error`/`message` de `/login` restreint à un jeu fermé |
| **P1-3** | S3 — cesser de renvoyer `error.message` de la base dans l'URL |
| **P1-4** | S5 — boucle `/acces-refuse` : ne plus appeler `getContexteColors()` depuis cette page |
| **P1-5** | Pages blanches pour l'admin plateforme sans entreprise : afficher un état explicite |
| **P1-6** | Inventaire plafonné à 60 seaux sans pagination ni indication — trompeur dès le 61ᵉ |
| **P1-7** | Icônes PNG 192/512 pour une installation PWA correcte |

### P2 — post-lancement

Breakpoint tablette 760 → 900 px · pagination des mouvements (100) et de l'export (5000) ·
`motif` de `/acces-refuse` exploité · code mort (`ral.ts`, `ocr-colors.ts`, `filtrerInventaire`)
à documenter ou retirer · `_` non échappé dans le motif `ilike` · `Link` de `next/link` utilisé
pour des URL externes dans `Shell.tsx` · arbitrage S6.

### DÉPEND CUTOVER GESTION PRO

Migrations `…000234` + `…000246`–`…000249` · bucket `colors-seaux` · catalogue
`applications_elsatia` · habilitations et droits organisation · sélecteur d'applications ·
**et donc l'intégralité des fonctions métier Colors**.

### À NE PAS DÉVELOPPER MAINTENANT

Nuanciers · catalogues produits · imports · portail utilisateurs/habilitations · OCR
(fournisseur payant) · correspondance RAL (palette à acquérir) · mode hors ligne réel ·
application native iOS/Android · SSO inter-domaines signé.

---

## 13. Quick wins proposés — lot séparé, NON codé

Corrections strictement locales, sans Supabase Production, sans migration, sans dépendance au
moteur Tools, sans dépendance au cutover. **Aucune n'a été écrite** : conformément à la
mission, rien n'est codé avant validation du présent rapport.

| Lot | Contenu | Fichiers | Risque |
|---|---|---|---|
| **QW-1** | Validateur `next` unique et strict (`url.origin === origin`) | `src/app/auth/callback/route.ts`, `src/app/actions.ts`, `src/app/login/page.tsx`, + nouveau `src/lib/redirection-sure.ts` + test | Très faible |
| **QW-2** | En-têtes de sécurité (`X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP) | `apps/colors/next.config.ts` | Très faible |
| **QW-3** | Messages `/login` restreints à un jeu fermé de codes | `src/app/login/page.tsx`, `src/app/actions.ts` | Très faible |
| **QW-4** | Lien « Mot de passe oublié / Gérer mon compte ELSATIA » sur `/login` | `src/app/login/page.tsx` | Nul |
| **QW-5** | Fin de la boucle `/acces-refuse` + exploitation de `motif` | `src/app/acces-refuse/page.tsx` | Faible |
| **QW-6** | Messages d'erreur métier fermés en remplacement de `error.message` | `src/app/actions-metier.ts` | Faible |
| **QW-7** | État explicite pour l'admin plateforme sans entreprise | 5 pages `(colors)/*` | Faible |
| **QW-8** | Icônes PNG 192/512 + entrées manifeste | `public/icons/`, `src/app/manifest.ts` | Nul |
| **QW-9** | `.env.example` complété (`SUPABASE_SERVICE_ROLE_KEY`, `ELSATIA_APPLICATION_ENV`) | `apps/colors/.env.example` | Nul |
| **QW-10** | Indicateur « 60 premiers seaux » + pagination simple | `src/lib/metier-colors.ts`, `(colors)/inventaire/page.tsx` | Moyen |

**Ordre recommandé :** QW-1 (aujourd'hui, isolément) → QW-2, QW-3, QW-4, QW-9 → QW-5, QW-6,
QW-7, QW-8 → QW-10.
Branche cible : `fix/elsatia-colors-standalone-build-v1`, jamais `feature/tools-production-workflow`.

Le lot QW-1 à QW-9 ne peut pas être validé de bout en bout tant que le cutover n'a pas eu lieu
(rien au-delà de `/login` n'est atteignable) : seuls QW-1 à QW-4 et QW-9 sont **vérifiables
aujourd'hui en Production**.

---

## 14. Réserves de l'audit

- Build, typecheck, lint et tests **non rejoués localement** : disque hôte saturé (§2).
- **Aucune route authentifiée observée** : sans habilitation Colors valide, et l'entrée de
  crédentiels étant hors de mon périmètre. Tout ce qui concerne le shell, l'inventaire, la
  fiche seau, les dépôts, les mouvements et les paramètres est **déduit du code et des
  migrations**, pas constaté à l'écran.
- **Variables d'environnement Production non lisibles** : les points P0-4 restent à confirmer
  par l'opérateur dans le projet Vercel Colors.
- **Ledger Production non relu en direct** : la baseline 210 provient du préflight cutover
  (`docs/runbooks/ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md`, §1 et §15, où elle est
  elle-même marquée « à reconfirmer en direct », P0-1 du cutover).
- **Correction d'une prémisse de la mission :** `https://elsatia.fr` **ne présente pas Colors**.
  Zéro occurrence du mot sur la page d'accueil ; la section « Nos solutions » annonce
  « ELSATIA Gestion Pro » comme *première solution* et « De nouvelles solutions arrivent
  bientôt ». Le pied de page ne référence que Gestion Pro. Le site vitrine est donc **plus
  prudent** que ce que supposait la mission — ce qui est cohérent avec l'état réel.

---

## 15. Verdict

**Colors n'est pas ouvrable à des utilisateurs aujourd'hui**, pour une raison unique et
structurelle : le socle multi-app n'existe pas en Production. Ce n'est pas un défaut de
Colors, c'est la dépendance connue et planifiée au cutover Gestion Pro.

Le code Colors est, lui, **sain et honnête** : chaîne d'autorisation vérifiée à trois niveaux,
RLS complète, isolation tenant sérieuse, mobile réellement traité, placeholders qui ne
simulent rien. Trois défauts réels et corrigeables ont été trouvés, dont **un exploitable dès
maintenant** (redirection ouverte) qui mérite d'être fermé sans attendre le cutover.

L'état réel est établi et le plan de fermeture est identifié.

- **Code modifié : NON**
- **Production modifiée : NON**

---

**ELSATIA-COLORS-PRECOMMERCIAL-REALITY-AUDIT-V1 VALIDÉ — ÉTAT RÉEL ET PLAN DE FERMETURE IDENTIFIÉS**
