/**
 * En-têtes de sécurité HTTP d'ELSATIA Colors.
 *
 * Colors est une application sœur autonome : elle ne réutilise pas les en-têtes
 * de Gestion Pro. La politique construite ici lui est propre, calquée sur ses
 * seuls besoins réels (aucun script tiers, aucun client Supabase navigateur,
 * aucune police distante, un service worker de même origine).
 *
 * Découpage des responsabilités :
 *  - `next.config.ts` émet les en-têtes **constants** sur `/:path*`, y compris
 *    les fichiers de `_next/static` ;
 *  - `src/proxy.ts` émet la **CSP**, qui dépend d'un nonce régénéré à chaque
 *    requête et ne peut donc pas être déclarée statiquement.
 */

export type EnTeteSecurite = { key: string; value: string };

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

/**
 * Origine d'une URL de configuration, réduite au schéma et à l'hôte.
 *
 * Une origine `http:` n'est retenue qu'en développement : la pile Supabase
 * locale écoute en clair sur `127.0.0.1`, mais autoriser du texte clair dans la
 * CSP de production reviendrait à documenter une rétrogradation.
 *
 * Tolère une URL portant un chemin (`…/rest/v1/`) : seule l'origine compte ici.
 */
export function origineAutorisee(
  valeur: string | undefined,
  estDeveloppement: boolean,
): string | null {
  if (!valeur) return null;
  let url: URL;
  try {
    url = new URL(valeur);
  } catch {
    return null;
  }
  if (url.protocol === "https:") return url.origin;
  if (url.protocol === "http:" && estDeveloppement) return url.origin;
  return null;
}

export type OptionsCsp = {
  /** Nonce émis pour cette requête, transmis aux scripts générés par Next. */
  nonce: string;
  estDeveloppement: boolean;
  /** `NEXT_PUBLIC_SUPABASE_URL` : sert d'origine d'images (URL signées Storage). */
  urlSupabase: string | undefined;
};

/**
 * Construit la CSP de Colors.
 *
 * Choix explicites, tous vérifiés sur le code de l'application :
 *
 * - `script-src 'self' 'nonce-…' 'strict-dynamic'` : c'est le seul verrou XSS
 *   qui compte. Next 16 injecte le nonce dans ses propres balises dès qu'il le
 *   lit sur la requête (voir `src/proxy.ts`). `'strict-dynamic'` laisse le
 *   bootstrap charger ses fragments sans énumérer de chemins.
 * - `'unsafe-eval'` **uniquement en développement** : React s'en sert pour
 *   reconstruire les piles d'erreur serveur. Jamais en production.
 * - `style-src 'self' 'unsafe-inline'` : exception assumée et documentée. Huit
 *   attributs `style` React subsistent (barre de niveau de la fiche seau,
 *   pastilles de teinte de l'inventaire, page `global-error`). Un nonce ne les
 *   couvre pas — un nonce ne s'applique qu'aux balises `<style>`, pas aux
 *   attributs — et `style-src-attr` n'est pas honoré par tous les navigateurs
 *   visés : la poser seule casserait ces affichages ailleurs que sur Chromium.
 *   Sa levée suppose de convertir ces attributs en classes ou en variables CSS,
 *   ce qui relève du lot d'interface, pas de la sécurité.
 * - `connect-src 'self' <supabase>` : Colors n'instancie aucun client Supabase
 *   navigateur (aucun `createBrowserClient` dans `src/`) ; le seul `fetch`
 *   client vise `/api/photos`. L'origine Supabase est déclarée parce qu'elle
 *   est le plan de données de l'application ; aucune origine `wss:` ne l'est,
 *   Colors n'ouvrant aucun canal Realtime.
 * - `img-src 'self' data: <supabase>` : les photos de seaux sont des URL
 *   signées servies par Supabase Storage (`createSignedUrl`, bucket
 *   `colors-seaux`), rendues par `next/image` en `unoptimized`. `blob:` n'est
 *   pas déclaré : aucun `createObjectURL` dans le code.
 * - `font-src 'self'` : `globals.css` ne déclare aucun `@font-face` ni aucune
 *   police distante, uniquement des familles système.
 * - `worker-src 'self'` : `sw-colors.js` est servi par l'application elle-même.
 * - `frame-src 'none'` : Colors n'intègre aucune iframe (ni Stripe, ni carte).
 */
export function construireCspColors({ nonce, estDeveloppement, urlSupabase }: OptionsCsp): string {
  const supabase = origineAutorisee(urlSupabase, estDeveloppement);

  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (estDeveloppement) scriptSrc.push("'unsafe-eval'");

  const imgSrc = ["'self'", "data:"];
  if (supabase) imgSrc.push(supabase);

  const connectSrc = ["'self'"];
  if (supabase) connectSrc.push(supabase);

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSrc.join(" ")}`,
    "font-src 'self'",
    `connect-src ${connectSrc.join(" ")}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(estDeveloppement ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/**
 * CSP des ressources publiques servies telles quelles : icônes, manifeste et
 * service worker.
 *
 * Elle **ne peut pas** porter le nonce de la page. L'en-tête `CSP` d'une
 * réponse gouverne le contexte d'exécution de cette réponse : appliqué à
 * `sw-colors.js`, un `script-src 'self' 'nonce-…' 'strict-dynamic'` neutralise
 * `'self'` — c'est le propre de `'strict-dynamic'` — et le service worker,
 * qui ne porte aucun nonce, refuse alors de démarrer (« An unknown error
 * occurred when fetching the script »). Vérifié en local avant correction.
 *
 * Cette politique reste néanmoins fermée : un `<script>` inline glissé dans une
 * SVG ouverte au premier plan n'a ni nonce ni `'unsafe-inline'`, donc ne
 * s'exécute pas. Le service worker n'appelle que sa propre origine.
 */
export const POLITIQUE_RESSOURCES_PUBLIQUES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * En-têtes constants, appliqués à toutes les réponses par `next.config.ts`.
 * La CSP n'y figure pas : elle porte un nonce et est émise par le proxy.
 */
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
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: POLITIQUE_PERMISSIONS },
  ];
}
