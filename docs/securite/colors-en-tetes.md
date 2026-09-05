# ELSATIA Colors — en-têtes de sécurité et parcours d'authentification

Lot `ELSATIA-COLORS-SECURITY-P1-CLOSURE-V1`, branche `fix/colors-security-p1-closure-v1`,
base `5ea1d03`.

## 1. En-têtes émis

Déclarés dans `apps/colors/src/lib/security/en-tetes.ts` et appliqués à `/:path*`
par `apps/colors/next.config.ts`. Vérifiés sur un `next start` local (voir §4).

| En-tête | Valeur | Ferme |
| --- | --- | --- |
| `X-Frame-Options` | `DENY` | encadrement (navigateurs sans `frame-ancestors`) |
| `Content-Security-Policy` | `frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'` | clickjacking, `<base>` injectée, détournement de formulaire, greffons |
| `X-Content-Type-Options` | `nosniff` | reniflage de type MIME |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | fuite de chemin (les URL Colors portent des identifiants de seau) |
| `Permissions-Policy` | `camera=(self), geolocation=(), microphone=(), payment=(), usb=()` | capacités matérielles hors appareil photo |
| `Cross-Origin-Opener-Policy` | `same-origin` | manipulation par une fenêtre ouvrante |
| `Cross-Origin-Resource-Policy` | `same-origin` | intégration de nos réponses par un tiers |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` **(production seule)** | rétrogradation HTTP |

`poweredByHeader: false` était déjà présent et reste actif.

## 2. Ce qui n'est **pas** fait — CSP de confinement des scripts

La CSP posée ici est volontairement partielle. Les directives absentes ne sont
pas restreintes : elle ne bloque donc ni le bootstrap de Next, ni les styles en
ligne de React, ni les appels Supabase.

`src/lib/security/headers.ts` de Gestion Pro **ne peut pas être recopié** : son
`script-src` repose sur un nonce injecté par le middleware, mécanique que Colors
n'a pas. Un `script-src` sans nonce casserait le rendu.

Reste donc à traiter dans un lot dédié :

- injection d'un nonce par `apps/colors/src/proxy.ts` ;
- `default-src 'self'`, `script-src 'self' 'nonce-…' 'strict-dynamic'` ;
- `connect-src` restreint à l'origine Supabase et à son WebSocket ;
- `img-src` couvrant les URL signées de Supabase Storage (photos de seaux) ;
- sortie de `style-src 'unsafe-inline'`, qui suppose de retirer les attributs
  `style` (barres de niveau de la fiche seau, pastilles de teinte).

Un test verrouille l'absence de `script-src` / `style-src` / `default-src` tant
que ce lot n'est pas livré, pour qu'aucune directive ne soit ajoutée à moitié.

## 3. Prérequis de configuration — réinitialisation de mot de passe

Le code est livré ; deux réglages **hors dépôt** conditionnent son
fonctionnement réel et n'ont pas été touchés (aucune action Production) :

1. `NEXT_PUBLIC_COLORS_URL` doit porter l'origine publique de Colors sur
   l'environnement visé. Si elle est absente ou invalide, aucun e-mail n'est
   envoyé : l'écran affiche « réinitialisation momentanément indisponible »
   plutôt que d'émettre un lien vers un hôte non maîtrisé.
2. La liste blanche « Redirect URLs » du projet Supabase Auth doit contenir
   `<origine Colors>/auth/callback`. Sans cela, Supabase refuse le `redirectTo`
   et le lien reçu ne ramène pas sur Colors.

Le gabarit d'e-mail « Reset password » de Supabase est celui du projet, partagé
avec les autres applications ELSATIA : il n'a pas été modifié.

## 4. Vérification effectuée

`next start` local, en-têtes relevés sur `/login`, `/mot-de-passe-oublie`, `/`
(redirection 307) et `/icons/colors-icon.svg` : les huit en-têtes sont présents
sur les réponses dynamiques comme statiques, y compris les redirections.

Chaînes de redirection sans session, mesurées au `curl -L` : `/acces-refuse`,
`/abonnement-requis`, `/dashboard` et `/nouveau-mot-de-passe` aboutissent tous
en **un seul saut**, sans rebond.
