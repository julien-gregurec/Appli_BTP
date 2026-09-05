/**
 * En-têtes de sécurité HTTP d'ELSATIA Colors.
 *
 * Colors est une application sœur autonome : elle ne réutilise pas les en-têtes
 * de Gestion Pro, dont la politique de contenu repose sur un nonce injecté par
 * le middleware. Colors n'a pas cette mécanique et une CSP `script-src`
 * recopiée telle quelle casserait le bootstrap de Next.
 *
 * La politique déclarée ici se limite donc aux directives qui ne dépendent
 * d'aucun nonce et qu'aucun code existant ne viole. La CSP de confinement des
 * scripts et des styles fait l'objet d'un lot dédié
 * (voir docs/securite/colors-en-tetes.md).
 */

export type EnTeteSecurite = { key: string; value: string };

/**
 * CSP volontairement partielle.
 *
 * Une directive absente n'est pas restreinte : ce jeu ne bloque donc ni les
 * scripts de Next, ni les styles en ligne de React, ni les appels Supabase.
 * Il ferme en revanche définitivement :
 *  - `frame-ancestors 'none'` : l'application ne peut plus être encadrée
 *    (clickjacking), y compris par un sous-domaine ELSATIA ;
 *  - `form-action 'self'` : aucun formulaire ne peut être détourné vers un
 *    hôte externe, y compris après injection d'un attribut `formaction` ;
 *  - `base-uri 'self'` : une balise `<base>` injectée ne peut plus réécrire
 *    la résolution des URL relatives ;
 *  - `object-src 'none'` : plus aucun greffon `<object>` / `<embed>`.
 */
export const POLITIQUE_CONTENU_COLORS = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/**
 * `frame-ancestors` n'est pas honoré par les navigateurs les plus anciens ;
 * `X-Frame-Options` reste donc émis en doublon défensif. Les deux disent la
 * même chose : Colors ne s'encadre pas.
 */
export const ANTI_ENCADREMENT = "DENY";

/**
 * Permissions-Policy minimale. `camera=(self)` est nécessaire : la fiche seau
 * propose un champ `<input type="file" capture="environment">` qui ouvre
 * l'appareil photo sur mobile. Les autres capacités sensibles sont refusées,
 * y compris à l'application elle-même.
 */
export const POLITIQUE_PERMISSIONS = [
  "camera=(self)",
  "geolocation=()",
  "microphone=()",
  "payment=()",
  "usb=()",
].join(", ");

export function headersSecuriteColors(estProduction: boolean): EnTeteSecurite[] {
  return [
    // HSTS uniquement hors développement : en local l'application est servie en
    // clair et un `max-age` épinglerait `localhost` en HTTPS dans le navigateur.
    ...(estProduction
      ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
      : []),
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: ANTI_ENCADREMENT },
    { key: "Content-Security-Policy", value: POLITIQUE_CONTENU_COLORS },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: POLITIQUE_PERMISSIONS },
  ];
}
