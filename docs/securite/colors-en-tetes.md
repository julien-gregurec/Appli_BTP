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

Le code applicatif est en place et testé. **Deux réglages hors dépôt empêchent
aujourd'hui le parcours d'aboutir sur Colors en Production.** Ils demandent une
intervention humaine dans le Dashboard Supabase et n'ont pas été touchés.

### 4.1 Le gabarit d'e-mail est ancré sur `SiteURL`

`supabase/templates/reset_password.html`, appliqué en Production lors de la
phase P5 (voir `docs/organisation/REGISTRE_CENTRAL.md`), construit le lien avec :

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
```

`SiteURL` du projet Supabase Production vaut `https://app.elsatia.fr` (mesuré,
§4.3). Le gabarit est unique pour tout le projet : un utilisateur qui demande
une réinitialisation **depuis Colors** reçoit donc un lien vers Gestion Pro, sur
un chemin `/auth/confirm` que Colors ne possède pas. `redirectTo` n'intervient
pas dans la construction du lien avec ce gabarit.

### 4.2 Le `redirectTo` de Colors ne passe pas la liste blanche

`urlCallbackReinitialisation()` produit :

```
https://colors.elsatia.fr/auth/callback?next=%2Fnouveau-mot-de-passe
```

La liste blanche Production contient l'entrée **exacte**
`https://colors.elsatia.fr/auth/callback`, sans joker. GoTrue compare la chaîne
entière : la présence de la chaîne de requête suffit à faire échouer la
comparaison, et le repli est `SiteURL`. Mesuré, §4.3.

### 4.3 Mesures — liste blanche Auth Production

Sondage en lecture seule de `/auth/v1/verify` avec un jeton invalide : une URL
autorisée est reprise telle quelle dans `Location`, une URL refusée retombe sur
`SiteURL`. Aucune donnée écrite, aucun compte sollicité.

| `redirect_to` sondé | `Location` obtenu | Lecture |
| --- | --- | --- |
| `https://colors.elsatia.fr/auth/callback` | reprise telle quelle | **autorisée** |
| `https://colors.elsatia.fr/auth/callback?x=1` | `https://app.elsatia.fr` | refusée |
| `https://colors.elsatia.fr/auth/callback/` | `https://app.elsatia.fr` | refusée |
| `https://colors.elsatia.fr` | `https://app.elsatia.fr` | refusée |
| `https://sous-domaine-test.elsatia.fr/auth/callback` | `https://app.elsatia.fr` | refusée |
| `https://tools.elsatia.fr/auth/callback` | `https://app.elsatia.fr` | refusée |
| `https://app.elsatia.fr/nimporte-quoi?a=b` | reprise telle quelle | hôte de `SiteURL`, toujours autorisé |
| `https://exemple-non-autorise.invalid/auth/callback` | `https://app.elsatia.fr` | refusée (témoin) |

### 4.4 Actions humaines requises (non exécutées)

Dashboard Supabase, projet `elsatia-production` (`exhvuzegsefmoguxoiak`) :

1. **Authentication → URL Configuration → Redirect URLs** : *ajouter* — sans
   rien supprimer — `https://colors.elsatia.fr/auth/callback?next=%2Fnouveau-mot-de-passe`,
   ou l'entrée `https://colors.elsatia.fr/auth/callback**` qui couvre aussi les
   évolutions du paramètre. `https://tools.elsatia.fr/auth/callback` est absente
   également, si l'application Tools doit un jour ouvrir ce parcours.
2. **Authentication → Emails → Reset Password** : le gabarit unique du projet
   doit cesser d'ancrer le lien sur `SiteURL` pour que chaque application
   ramène l'utilisateur chez elle. C'est une décision de produit — gabarit
   pointant sur `{{ .RedirectTo }}`, ou renvoi assumé de la réinitialisation
   Colors vers le portail de compte commun — et non un correctif mécanique :
   elle n'a pas été tranchée ici.

Tant que le point 2 n'est pas tranché, la réinitialisation demandée depuis
Colors aboutit sur Gestion Pro. Le compte ELSATIA étant commun, le mot de passe
change bien ; le parcours, lui, n'est pas celui de Colors.

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
| `NEXT_PUBLIC_SUPABASE_URL` | `https://exhvuzegsefmoguxoiak.supabase.co/rest/v1/` — **suffixe anormal** | présente |

Deux points à traiter hors de ce lot :

1. **`NEXT_PUBLIC_SUPABASE_URL` porte `/rest/v1/`.** `@supabase/supabase-js`
   attend l'URL de projet et compose lui-même ses chemins : avec ce suffixe,
   l'authentification viserait `…/rest/v1/auth/v1` et les URL signées de
   Storage `…/rest/v1/storage/v1`. La valeur attendue est
   `https://exhvuzegsefmoguxoiak.supabase.co`. La CSP n'en est pas affectée —
   `origineAutorisee()` réduit la valeur à son origine — mais le reste de
   l'application l'est.
2. **`NEXT_PUBLIC_COLORS_URL` est absente en Preview.** Conséquence assumée par
   le code : `urlCallbackReinitialisation()` renvoie `null` et l'écran affiche
   « réinitialisation momentanément indisponible » plutôt que d'émettre un lien
   vers un hôte non maîtrisé. À définir avant toute recette Preview du parcours.

Aucune modification n'a été appliquée : la mission n'autorisait que la
vérification de `NEXT_PUBLIC_COLORS_URL`.
