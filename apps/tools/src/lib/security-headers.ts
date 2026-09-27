/*
 * Politique de securite HTTP publique d'ELSATIA Tools.
 *
 * Ce module est pur : il ne lit pas `process.env` de lui-meme, il recoit les valeurs. Il est
 * consomme par `next.config.ts` (build web) et couvert par `security-headers.test.ts`.
 *
 * Perimetre : le build web (tools.elsatia.fr). Le build natif (`output: "export"`) ne peut pas
 * porter d'en-tetes HTTP — Next l'interdit — et le WebView Capacitor sert les fichiers depuis
 * son propre schema : `next.config.ts` n'installe donc ces en-tetes que hors build natif.
 */

export type SecurityHeader = { key: string; value: string };

export type SecurityHeadersOptions = {
  /** `NEXT_PUBLIC_SUPABASE_URL` : seule origine cloud autorisee pour le compte ELSATIA. */
  supabaseUrl?: string;
  /** `NEXT_PUBLIC_TOOLS_BILLING_API_URL` : origine de l'API d'abonnement (Stripe cote serveur). */
  billingApiUrl?: string;
  /** En developpement, HMR exige `unsafe-eval` et un websocket local. */
  isDevelopment?: boolean;
};

/*
 * Aucune de ces capacites n'est utilisee par Tools. `web-share`, `fullscreen` et le presse-papiers
 * sont volontairement absents : `navigator.share` alimente le partage d'export sur mobile.
 */
const DENIED_FEATURES = [
  "accelerometer",
  "autoplay",
  "browsing-topics",
  "camera",
  "display-capture",
  "encrypted-media",
  "geolocation",
  "gyroscope",
  "magnetometer",
  "microphone",
  "midi",
  "payment",
  "publickey-credentials-get",
  "screen-wake-lock",
  "serial",
  "usb",
  "xr-spatial-tracking",
] as const;

export const PERMISSIONS_POLICY = DENIED_FEATURES.map((feature) => `${feature}=()`).join(", ");

/** Reduit une URL a son origine exacte. Retourne `null` si la valeur n'est pas une URL http(s). */
export function toHttpOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Origine websocket equivalente : `https://x` -> `wss://x`. Supabase ouvre son realtime dessus. */
export function toWebSocketOrigin(origin: string): string {
  return origin.replace(/^http/, "ws");
}

/*
 * `connect-src` n'est jamais ouvert a `*` : seules l'origine propre et les origines cloud
 * effectivement appelees par le code (`auth/client.ts`, `monetization-client.ts`) sont listees.
 */
export function buildConnectSrc({ supabaseUrl, billingApiUrl, isDevelopment = false }: SecurityHeadersOptions = {}): string[] {
  const sources = ["'self'"];
  for (const value of [supabaseUrl, billingApiUrl]) {
    const origin = toHttpOrigin(value);
    if (!origin) continue;
    if (!sources.includes(origin)) sources.push(origin);
    const socket = toWebSocketOrigin(origin);
    if (!sources.includes(socket)) sources.push(socket);
  }
  if (isDevelopment) sources.push("ws://localhost:*", "http://localhost:*");
  return sources;
}

/**
 * CSP la plus stricte compatible avec Tools.
 *
 * `script-src` conserve `'unsafe-inline'` : le App Router serialise sa charge Flight dans des
 * balises `<script>` en ligne dont le contenu change a chaque page, et un nonce imposerait un
 * rendu dynamique — donc la perte du pre-rendu statique, du precache du service worker et de
 * l'export natif. `object-src 'none'`, `base-uri 'none'` et `frame-ancestors 'none'` ferment les
 * vecteurs qui rendent une injection inline reellement exploitable.
 *
 * `style-src` conserve `'unsafe-inline'` : 20 attributs `style` calcules (viewport Atelier, jauges)
 * et la vue d'impression `window.open` + `document.write` reposent dessus.
 */
export function buildContentSecurityPolicy(options: SecurityHeadersOptions = {}): string {
  const { isDevelopment = false } = options;
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["base-uri", ["'none'"]],
    ["object-src", ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    ["frame-src", ["'none'"]],
    ["form-action", ["'self'"]],
    ["script-src", isDevelopment ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"] : ["'self'", "'unsafe-inline'"]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    // `blob:` : conversion PNG (`exports/png.ts` charge le SVG dans une `Image`). `data:` : icones inline.
    ["img-src", ["'self'", "data:", "blob:"]],
    ["font-src", ["'self'"]],
    ["connect-src", buildConnectSrc(options)],
    // Le service worker `/sw-tools.js` est servi en meme origine ; aucun worker `blob:` n'existe.
    ["worker-src", ["'self'"]],
    ["manifest-src", ["'self'"]],
    ["media-src", ["'self'"]],
  ];
  const policy = directives.map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!isDevelopment) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

/**
 * En-tetes appliques a toutes les reponses du build web, y compris `/sw-tools.js`,
 * `/manifest.webmanifest`, `/robots.txt`, `/sitemap.xml` et les icones de `public/`.
 *
 * COOP `same-origin-allow-popups` et non `same-origin` : `exports/print.ts` ouvre une fenetre
 * d'impression et a besoin de conserver sa poignee, et `ExternalLink` ouvre les sites ELSATIA.
 * CORP `same-site` et non `same-origin` : les icones et l'image OG restent chargeables par
 * elsatia.fr, app.elsatia.fr et colors.elsatia.fr, mais par aucune origine tierce.
 */
export function buildSecurityHeaders(options: SecurityHeadersOptions = {}): SecurityHeader[] {
  return [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(options) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  ];
}
