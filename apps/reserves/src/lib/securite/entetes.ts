/**
 * En-têtes de sécurité d'ELSATIA Réserves.
 *
 * POURQUOI CE MODULE EXISTE.
 * Réserves n'émettait AUCUN en-tête de sécurité : ni politique de contenu, ni
 * `frame-ancestors`, ni `Referrer-Policy`, ni `nosniff`. Gestion Pro en émet depuis la
 * phase 3 (`src/lib/security/headers.ts`), et sa recette les vérifie. La même exigence
 * s'applique ici, et pour une raison plus aiguë : Réserves porte deux surfaces que
 * Gestion Pro n'a pas.
 *
 *   1. UN JETON D'INVITATION DANS L'URL. `/invitation/<jeton>` est une page publique dont
 *      le chemin EST le secret. Sans `Referrer-Policy`, ce chemin part dans l'en-tête
 *      `Referer` de chaque ressource tierce que la page chargerait.
 *   2. UN FORMULAIRE D'ACCEPTATION D'ACCÈS. « Rejoindre l'intervention » rattache une
 *      organisation à un chantier en un clic. Sans `frame-ancestors 'none'`, cette page
 *      est encadrable, donc détournable au clic.
 *
 * CHOIX PROPRES À RÉSERVES, par rapport à la politique de Gestion Pro :
 *   • `worker-src 'self'` — le service worker hors-ligne doit pouvoir s'enregistrer ;
 *   • `img-src` accepte `blob:` — les aperçus de photo avant envoi sont des blobs locaux,
 *     et les plans PDF rendus par pdf.js passent par un canvas puis un blob ;
 *   • pas de `frame-src` Stripe : Réserves n'encaisse rien ;
 *   • `connect-src` couvre Supabase (REST, Storage, Realtime) et rien d'autre.
 *
 * Le nonce suit le mécanisme éprouvé de Gestion Pro : il est posé sur les en-têtes de la
 * REQUÊTE, ce qui permet à Next.js de l'appliquer lui-même à ses scripts d'hydratation,
 * puis sur la réponse. Sans cela, `script-src 'self'` casserait l'hydratation React.
 */

export type EnteteSecurite = { cle: string; valeur: string };

function origineHttps(valeur?: string): string | null {
  if (!valeur) return null;
  try {
    const url = new URL(valeur);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Supabase en clair sur la BOUCLE LOCALE — développement et recette.
 *
 * Le discriminant est l'adresse, pas `NODE_ENV`. La première rédaction refusait cette
 * origine hors développement, ce qui paraissait plus strict et se révélait pire : la
 * recette exécute un build de PRODUCTION (`next start`) contre un Supabase local en
 * clair. La politique y refusait donc les URL signées, les photos du document imprimable
 * ne se chargeaient plus, et la recette ne pouvait plus valider le binaire réellement
 * déployé — on aurait gagné une règle et perdu la vérification.
 *
 * Nommer `http://127.0.0.1` n'affaiblit rien dans un environnement déployé : cette
 * origine y est inatteignable, et la règle ne s'applique qu'à ce que le navigateur
 * charge. La stricte exigence demeure là où elle protège : toute origine NON locale doit
 * être en `https:`.
 */
function origineLocale(valeur: string | undefined): string | null {
  if (!valeur) return null;
  try {
    const url = new URL(valeur);
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export function construireCsp({
  nonce,
  developpement,
  supabaseUrl,
  origineSecurisee,
}: {
  nonce: string;
  developpement: boolean;
  supabaseUrl?: string;
  /**
   * L'application est-elle SERVIE en https ?
   *
   * `upgrade-insecure-requests` n'a de sens que là. Sur une origine en clair, la
   * directive est au mieux inutile — et au pire destructrice : WebKit l'applique à la
   * lettre et tente d'atteindre `https://127.0.0.1:3025`, ce qui échoue en erreur TLS.
   * Toutes les ressources de la page disparaissent alors d'un coup, y compris le script
   * qui soumet le formulaire de connexion. Chromium, lui, exempte la boucle locale : la
   * panne est donc invisible sur le navigateur où l'on développe, et totale sur celui
   * qu'utilise le terrain. C'est exactement le genre d'écart qu'une recette multi-moteur
   * existe pour attraper.
   *
   * Le discriminant est donc l'origine réellement servie, jamais `NODE_ENV`.
   */
  origineSecurisee: boolean;
}): string {
  const supabase = origineHttps(supabaseUrl) ?? origineLocale(supabaseUrl);
  const supabaseWs = supabase?.replace(/^https:/, "wss:").replace(/^http:/, "ws:") ?? null;
  const connectSrc = ["'self'", supabase, supabaseWs].filter(Boolean).join(" ");

  // `'strict-dynamic'` laisse les scripts chargés PAR un script nonce-é s'exécuter :
  // c'est ce qui rend le découpage de bundles de Next compatible avec une CSP stricte.
  const scriptSrc = [
    "'self'", `'nonce-${nonce}'`, "'strict-dynamic'",
    developpement ? "'unsafe-eval'" : null,
  ].filter(Boolean).join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Exception assumée, identique à Gestion Pro : les composants React portent des
    // attributs `style`. Les scripts inline, eux, restent interdits.
    "style-src 'self' 'unsafe-inline'",
    // `blob:` : aperçu local d'une photo avant envoi, et rendu canvas d'un plan PDF.
    // `https:` : URL signées Supabase des photos et plans déjà déposés.
    //
    // L'origine Supabase est nommée EN PLUS du schéma `https:`, et ce n'est pas une
    // redondance : en recette, elle est en clair sur la boucle locale. Sans elle, les
    // photos du document imprimable ne se chargeaient pas — un `naturalWidth` à zéro,
    // c'est-à-dire un PDF de constat sans ses preuves, et rien dans les journaux serveur
    // pour le dire.
    `img-src 'self' data: blob: https:${supabase ? ` ${supabase}` : ""}`,
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "media-src 'self' blob:",
    // Le service worker hors-ligne, et lui seul.
    "worker-src 'self'",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(origineSecurisee ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/**
 * `origineSecurisee` : l'application est-elle servie en https ?
 *
 * HSTS n'est honoré par les navigateurs que sur un transport déjà sûr — l'émettre en
 * clair est ignoré, donc inutile, et surtout trompeur pour qui relit les en-têtes d'une
 * recette et croit la protection active. Le même discriminant que pour
 * `upgrade-insecure-requests`, pour qu'il n'y ait qu'une seule règle à retenir.
 */
export function entetesSecurite(origineSecurisee: boolean): EnteteSecurite[] {
  return [
    ...(origineSecurisee
      ? [{ cle: "Strict-Transport-Security", valeur: "max-age=63072000; includeSubDomains; preload" }]
      : []),
    { cle: "X-Content-Type-Options", valeur: "nosniff" },
    // `strict-origin-when-cross-origin` ne transmet que l'origine hors du site : le
    // chemin — donc le jeton d'invitation — ne sort jamais.
    { cle: "Referrer-Policy", valeur: "strict-origin-when-cross-origin" },
    { cle: "X-Frame-Options", valeur: "DENY" },
    { cle: "Cross-Origin-Opener-Policy", valeur: "same-origin" },
    { cle: "Cross-Origin-Resource-Policy", valeur: "same-origin" },
    // `camera=(self)` est indispensable : la capture de terrain ouvre l'appareil photo.
    // La géolocalisation n'est demandée nulle part, et reste donc fermée.
    {
      cle: "Permissions-Policy",
      valeur: "camera=(self), geolocation=(), microphone=(), payment=(), usb=()",
    },
  ];
}
