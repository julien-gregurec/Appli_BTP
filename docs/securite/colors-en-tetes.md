# ELSATIA Colors — en-têtes de sécurité et parcours d'authentification

Lot `ELSATIA-COLORS-AUTH-CALLBACK-AND-CSP-P1-V2`, branche
`fix/colors-auth-callback-csp-p1-v2`, base `260523c`.
Remplace la note du lot `ELSATIA-COLORS-SECURITY-P1-CLOSURE-V1`.

## 1. Où les en-têtes sont émis

| Source | Ce qu'elle émet | Portée |
| --- | --- | --- |
| `apps/colors/next.config.ts` → `headersSecuriteColors()` | les en-têtes **constants** | `/:path*`, y compris `_next/static` |
| `apps/colors/src/proxy.ts` | la **CSP**, qui porte un nonce régénéré à chaque requête | tout sauf `_next/static` et `_next/image` |

La CSP a quitté `next.config.ts` : deux en-têtes `Content-Security-Policy` sur
une même réponse font enforcer leur **intersection**, ce qui aurait bloqué les
scripts noncés. Un test verrouille son absence des en-têtes constants.

## 2. En-têtes constants

| En-tête | Valeur |
| --- | --- |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(self), geolocation=(), microphone=(), payment=(), usb=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` **(production seule)** |

`poweredByHeader: false` reste actif.

## 3. CSP des documents

```
default-src 'self';
script-src 'self' 'nonce-<128 bits>' 'strict-dynamic';   (+ 'unsafe-eval' en développement)
style-src 'self' 'unsafe-inline';
img-src 'self' data: <origine Supabase>;
font-src 'self';
connect-src 'self' <origine Supabase>;
worker-src 'self';
manifest-src 'self';
frame-src 'none';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests                                 (production seule)
```

Chaque directive répond à un besoin constaté dans le code, aucune n'a été
ajoutée « au cas où » :

- **`script-src` noncé.** Next 16 lit le nonce sur l'en-tête
  `Content-Security-Policy` **de la requête** — d'où sa recopie dans
  `NextResponse.next({ request: { headers } })` — et l'applique lui-même à ses
  balises `<script>` et à ses `<link rel="stylesheet">`. `'strict-dynamic'`
  laisse le bootstrap charger ses fragments sans énumérer de chemins. Aucun
  `'unsafe-inline'` : c'est le verrou XSS réel de l'application.
- **`'unsafe-eval'` en développement seulement.** React s'en sert pour
  reconstruire les piles d'erreur serveur. Absent en production, vérifié par test.
- **`connect-src` / `img-src`.** L'origine Supabase est déduite à chaud de
  `NEXT_PUBLIC_SUPABASE_URL`, réduite à son schéma et son hôte (la valeur
  Production porte un suffixe `/rest/v1/`, voir §6). Les photos de seaux sont
  des URL signées de `colors-seaux` rendues par `next/image` en `unoptimized`.
  Aucune origine `wss:` : Colors n'ouvre aucun canal Realtime. Aucun `blob:` :
  aucun `createObjectURL` dans `src/`. Une origine `http:` n'est retenue qu'en
  développement (pile Supabase locale en clair).
- **`font-src 'self'`.** `globals.css` ne déclare ni `@font-face` ni police
  distante, uniquement des familles système.

### `style-src 'unsafe-inline'` — exception assumée

Seule directive large, et la seule qui porte `'unsafe-inline'` (un test le
vérifie jeton par jeton). Elle est nécessaire à huit attributs `style` React :
barre de niveau de la fiche seau, pastilles de teinte de l'inventaire, page
`global-error`.

Un nonce ne les couvre pas : il s'applique aux balises `<style>`, jamais aux
attributs. La directive qui les viserait, `style-src-attr`, n'est pas honorée
par tous les navigateurs visés — la poser seule casserait ces affichages hors
Chromium. Sa levée suppose de convertir ces attributs en classes ou en
variables CSS : cela relève du lot d'interface, pas de la sécurité. Le risque
résiduel est une injection de style, jamais une exécution de script.

### CSP des ressources publiques

`/icons/*`, `/sw-colors.js`, `/manifest.webmanifest` et `/favicon.ico`
reçoivent une politique distincte, sans nonce :

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; connect-src 'self'; object-src 'none';
base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

**Pourquoi.** L'en-tête `CSP` d'une réponse gouverne le contexte d'exécution de
cette réponse. Appliquée à `sw-colors.js`, la politique des documents y aurait
neutralisé `'self'` — c'est le propre de `'strict-dynamic'` — et le service
worker, qui ne porte aucun nonce, aurait refusé de démarrer. Régression
constatée en local puis fermée par un test dédié.

Ces réponses ne déclenchent par ailleurs aucun rafraîchissement de session :
inutile d'ouvrir un client Supabase par icône servie.

### Rendu dynamique

Le nonce n'existe qu'à la requête : une page prérendue à la construction
n'en porte aucun et ses scripts seraient bloqués. `src/app/not-found.tsx` a été
ajoutée pour cette seule raison — la page 404 intégrée de Next était prérendue.
Après construction, seule `/manifest.webmanifest` reste statique : c'est du
JSON, il n'y a aucun script à noncer.

Aucune CSP `Report-Only` n'a été posée : la politique enforce ci-dessus a été
vérifiée sans violation sur un navigateur réel (§5), et aucun point de collecte
de rapports n'existe dans l'infrastructure ELSATIA — en simuler un n'aurait
rien apporté.

## 4. Réinitialisation de mot de passe — état réel

Le code applicatif de Colors est en place et testé. Deux réglages Supabase
Production ont été appliqués par l'exploitant après la première passe de ce
lot ; les mesures ci-dessous sont postérieures.

### 4.1 Liste blanche Auth — RÉSOLUE

Sondage en lecture seule de `/auth/v1/verify` avec un jeton invalide : une URL
autorisée est reprise telle quelle dans `Location`, une URL refusée retombe sur
`SiteURL`. Aucune donnée écrite, aucun compte sollicité.

| `redirect_to` sondé | `Location` obtenu | Lecture |
| --- | --- | --- |
| `https://colors.elsatia.fr/auth/callback?next=%2Fnouveau-mot-de-passe` | reprise telle quelle | **autorisée** (entrée ajoutée) |
| `https://colors.elsatia.fr/auth/callback` | reprise telle quelle | autorisée |
| `https://colors.elsatia.fr` | `https://app.elsatia.fr` | **refusée** |
| `https://exemple-non-autorise.invalid/x` | `https://app.elsatia.fr` | refusée (témoin) |

Le `redirectTo` que produit `urlCallbackReinitialisation()` passe désormais la
validation Supabase. `SiteURL` reste `https://app.elsatia.fr`.

### 4.2 Gabarit « Reset password » — RÉSOLUE, PRESCRIPTION SUPERSÉDÉE

Le gabarit unique du projet a été modifié en remplaçant `{{ .SiteURL }}` par
`{{ .RedirectTo }}` dans le lien. La ligne devient donc :

```
{{ .RedirectTo }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
```

`.RedirectTo` n'est pas une origine : c'est l'URL complète passée par
l'application, chaîne de requête comprise. La concaténation produit une URL
malformée pour **les deux** applications.

| Application | `redirectTo` envoyé | Lien composé |
| --- | --- | --- |
| Colors | `https://colors.elsatia.fr/auth/callback?next=%2Fnouveau-mot-de-passe` | `…/auth/callback?next=%2Fnouveau-mot-de-passe/auth/confirm?token_hash=…&type=recovery` |
| Gestion Pro | `https://app.elsatia.fr/auth/callback?next=%2Fnouveau-mot-de-passe` | idem sur `app.elsatia.fr` |

Le chemin réellement atteint est `/auth/callback`, sans paramètre `code`, et
`token_hash` se retrouve enfoui dans la valeur de `next`.

Effet mesuré en exécutant l'URL composée contre le code réel :

- **Colors** — `GET /auth/callback?next=%2Fnouveau-mot-de-passe/auth/confirm?token_hash=FAUX_JETON&type=recovery`
  répond `307` vers `/nouveau-mot-de-passe/auth/confirm?token_hash=FAUX_JETON`,
  route inexistante : 404, aucune session ouverte. `cheminInterneSur` fait son
  travail — la destination reste interne — mais la réinitialisation n'aboutit pas.
- **Gestion Pro** — `src/app/auth/callback/route.ts` exige un `code` et
  redirige sinon vers `/login?error=Lien de connexion invalide ou expiré.`
  Le parcours de réinitialisation de Gestion Pro, jusqu'ici fonctionnel, est
  donc cassé par cette modification.

> **Remplacé par `ELSATIA-COLORS-MULTIAPP-PASSWORD-RESET-FLOW-V1`.** La
> mesure ci-dessus reste valable et c'est elle qui a écarté `.RedirectTo` ; la
> conclusion qu'en tirait ce lot, elle, ne l'est plus. Voir
> [`reset-password-multiapp.md`](./reset-password-multiapp.md).

Le gabarit partagé conserve `{{ .SiteURL }}` :

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
```

**`{{ .RedirectTo }}` ne doit pas y être réintroduit**, sous aucune forme. La
mesure ci-dessus en donne la raison : `.RedirectTo` porte l'URL de callback
complète, chaîne de requête comprise, et sa concaténation casse le parcours des
deux applications. Aucun réglage de liste blanche ne change cela.

La provenance de la demande n'est donc pas portée par le lien — elle ne peut
l'être par aucun canal disponible avant `verifyOtp`. Le lot de réinitialisation
multi-application a retenu la seule donnée fiable qui reste, le **choix
explicite de la personne** : le lien atterrit sur `/auth/confirm` de Gestion
Pro, qui propose de poursuivre sur Colors et relaie le jeton **non consommé**
vers `/auth/confirm` de Colors, où `verifyOtp` s'exécute sur la bonne origine.

Ce que le présent document annonçait comme « lot distinct » est donc livré, mais
par une autre voie que celle esquissée ici :

| Élément | État réel |
| --- | --- |
| Gabarit | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` — **inchangé** |
| `SiteURL` | `https://app.elsatia.fr` — inchangé |
| Liste blanche | aucune entrée requise par le relais : `verifyOtp` n'engage aucun `redirect_to` |
| Code Colors | route `/auth/confirm` créée (page à clic explicite + `verifyOtp`, aucune destination paramétrable) |
| Code Gestion Pro | `urlCallbackReinitialisation()` **inchangée** ; un lien de relais s'ajoute sous le bouton « Confirmer » |

## 5. Vérifications effectuées

`next start` local (construction de production), en-têtes relevés au `curl` :

- `/login`, `/mot-de-passe-oublie`, `/nouveau-mot-de-passe`, `/auth/callback`,
  `/dashboard`, `/`, `/icons/colors-icon.svg`, `/manifest.webmanifest`,
  `/sw-colors.js`, `/route-inexistante` : **exactement un** en-tête
  `Content-Security-Policy` par réponse, plus les sept en-têtes constants.
- Nonce différent à chaque requête, effectivement recopié par Next sur les
  balises `<script>` et `<link rel="stylesheet">` du document.

Navigateur réel, sur la construction de production :

- `/login`, `/mot-de-passe-oublie`, `/nouveau-mot-de-passe`, 404 : **aucune
  violation CSP** (aucun message `Refused to…`), feuille de style appliquée
  (216 règles), React monté.
- Parcours « mot de passe oublié » soumis : la Server Action passe sous
  `form-action 'self'` et renvoie la confirmation neutre attendue, alors même
  que l'hôte Supabase configuré était injoignable — l'anti-énumération tient
  aussi sur échec technique.

**Anomalie hors périmètre, constatée et non corrigée** : l'enregistrement du
service worker échoue en local (`An unknown error occurred when fetching the
script`). Reproduit **à l'identique sur la base `260523c` non modifiée**, donc
antérieur à ce lot ; la CSP n'en est pas la cause.

## 6. Configuration Vercel Production — état constaté

Projet `elsatia-colors` (`julien-gregurec1`), lecture seule, aucune variable
créée ni modifiée.

| Variable | Production | Preview |
| --- | --- | --- |
| `NEXT_PUBLIC_COLORS_URL` | `https://colors.elsatia.fr` — **conforme** | **absente** |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://exhvuzegsefmoguxoiak.supabase.co` — **conforme** (le suffixe `/rest/v1/` relevé lors de la première passe a été retiré par l'exploitant) | présente |

Un point reste à traiter hors de ce lot :

1. **`NEXT_PUBLIC_COLORS_URL` est absente en Preview.** Conséquence assumée par
   le code : `urlCallbackReinitialisation()` renvoie `null` et l'écran affiche
   « réinitialisation momentanément indisponible » plutôt que d'émettre un lien
   vers un hôte non maîtrisé. À définir avant toute recette Preview du parcours.

Aucune modification n'a été appliquée : la mission n'autorisait que la
vérification de `NEXT_PUBLIC_COLORS_URL`.
