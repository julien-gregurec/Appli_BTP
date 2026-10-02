export type PorteeRateLimit = "ip" | "utilisateur" | "entreprise";
export type PolitiqueRateLimit = {
  cle: string;
  maximum: number;
  fenetreSecondes: number;
  portee: PorteeRateLimit;
};

type ContexteRateLimit = {
  utilisateurId?: string | null;
  entrepriseId?: string | null;
};

export type ClientRateLimit = {
  rpc: (nom: string, parametres: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

export type ResultatRateLimit =
  | { autorise: true }
  | { autorise: false; statut: 429 | 503; reessayerApres: number };

const estMutation = (methode: string) => !["GET", "HEAD", "OPTIONS"].includes(methode.toUpperCase());

export function politiquesRateLimitPour(chemin: string, methode: string, authentifie: boolean): PolitiqueRateLimit[] {
  const mutation = estMutation(methode);
  if (!authentifie && mutation) {
    // Plafond anti-flot uniquement : le vrai anti-bruteforce compte les ÉCHECS
    // par compte, compte+IP et IP dans loginAction (voir login-rate-limit.ts).
    // 10 POST/10 min par IP bloquait une agence entière derrière une même box.
    if (chemin === "/login") return [{ cle: "auth:login:ip-flot", maximum: 300, fenetreSecondes: 600, portee: "ip" }];
    if (chemin === "/signup") return [{ cle: "auth:signup", maximum: 5, fenetreSecondes: 3600, portee: "ip" }];
    if (chemin === "/mot-de-passe-oublie") return [{ cle: "auth:password-reset", maximum: 5, fenetreSecondes: 3600, portee: "ip" }];
    if (chemin === "/nouveau-mot-de-passe") return [{ cle: "auth:new-password", maximum: 5, fenetreSecondes: 3600, portee: "ip" }];
  }
  if (chemin.startsWith("/auth/")) return [{ cle: "auth:callback", maximum: 30, fenetreSecondes: 600, portee: "ip" }];
  if (chemin.startsWith("/api/cron/")) return [{ cle: "api:cron", maximum: 60, fenetreSecondes: 60, portee: "ip" }];
  if (chemin === "/api/paie/import") return [{ cle: "api:payroll-import", maximum: 30, fenetreSecondes: 300, portee: "ip" }];
  if (chemin.startsWith("/api/paiements-bancaires/powens/")) return [{ cle: "api:powens-callback", maximum: 60, fenetreSecondes: 60, portee: "ip" }];
  if (!authentifie && !(chemin.startsWith("/api/stripe/") || chemin.startsWith("/api/webhooks/"))) return [];
  if (chemin === "/api/referentiels/vehicules") return [{ cle: "reference:vehicles", maximum: 10, fenetreSecondes: 60, portee: authentifie ? "utilisateur" : "ip" }];
  if (chemin === "/api/assistant/chat") return [
    { cle: "ai:assistant:user", maximum: 20, fenetreSecondes: 60, portee: "utilisateur" },
    { cle: "ai:assistant:company", maximum: 100, fenetreSecondes: 3600, portee: "entreprise" },
  ];
  if (chemin.startsWith("/api/exports/")) return [{ cle: "api:exports", maximum: 10, fenetreSecondes: 60, portee: "utilisateur" }];
  if (chemin.includes("/upload")) return [{ cle: "api:uploads", maximum: 20, fenetreSecondes: 300, portee: "utilisateur" }];
  if (/\/(?:documents|pieces-jointes|photo|signature|carte-btp)(?:\/|$)/.test(chemin)) {
    return [{ cle: "api:signed-downloads", maximum: 60, fenetreSecondes: 60, portee: "utilisateur" }];
  }
  if (chemin.startsWith("/imprimer/")) return [{ cle: "pages:print", maximum: 30, fenetreSecondes: 60, portee: "utilisateur" }];
  if (chemin.startsWith("/api/stripe/") || chemin.startsWith("/api/webhooks/")) {
    return [{ cle: "api:webhooks", maximum: 300, fenetreSecondes: 60, portee: "ip" }];
  }
  if (authentifie && chemin.startsWith("/api/")) {
    return [{ cle: "api:authenticated", maximum: 120, fenetreSecondes: 60, portee: "utilisateur" }];
  }
  return [];
}

const IPV4 = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** Développe une IPv6 textuelle en 8 groupes hexadécimaux, ou null si invalide. */
function groupesIpv6(adresse: string): string[] | null {
  if (!/^[0-9a-f:.]+$/.test(adresse) || adresse.split("::").length > 2) return null;
  let texte = adresse;
  // IPv4 embarquée (::ffff:1.2.3.4) : convertie en deux groupes hexadécimaux.
  const ipv4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(texte)?.[1];
  if (ipv4) {
    if (!IPV4.test(ipv4)) return null;
    const [a, b, c, d] = ipv4.split(".").map(Number);
    texte = texte.slice(0, -ipv4.length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [gauche, droite] = texte.split("::");
  const partie = (valeur: string | undefined) => (valeur ? valeur.split(":") : []);
  const debut = partie(gauche);
  const fin = partie(droite);
  const manquants = 8 - debut.length - fin.length;
  if (droite === undefined ? manquants !== 0 : manquants < 1) return null;
  const groupes = [...debut, ...Array(Math.max(0, manquants)).fill("0"), ...fin];
  if (groupes.length !== 8 || groupes.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groupes.map((g) => g.replace(/^0+(?=.)/, ""));
}

/**
 * Normalise une adresse candidate en identité de rate limit, ou null si elle
 * n'est pas une IP. Une IPv6 est ramenée à son préfixe /64 : un seul abonné
 * dispose en général d'un /64 entier, compter par adresse lui donnerait un
 * budget quasi illimité. Une IPv4 mappée (::ffff:a.b.c.d) redevient IPv4.
 */
export function normaliserIpRateLimit(candidat: string | null | undefined): string | null {
  const adresse = candidat?.trim().toLowerCase().replace(/^\[|\](?::\d+)?$/g, "") ?? "";
  if (!adresse || adresse.length > 64) return null;
  if (IPV4.test(adresse)) return adresse;
  const groupes = groupesIpv6(adresse);
  if (!groupes) return null;
  if (groupes.slice(0, 6).join(":") === "0:0:0:0:0:ffff") {
    const haut = parseInt(groupes[6], 16);
    const bas = parseInt(groupes[7], 16);
    return `${haut >> 8}.${haut & 255}.${bas >> 8}.${bas & 255}`;
  }
  return `${groupes.slice(0, 4).join(":")}::/64`;
}

/**
 * Adresse IP du client pour le rate limiting — jamais un en-tête arbitraire.
 *
 * - Sur Vercel, `x-vercel-forwarded-for`, `x-real-ip` et `x-forwarded-for` sont
 *   (ré)écrits par la plateforme avec l'IP de la connexion : une valeur envoyée
 *   par le client est écrasée, pas concaténée.
 * - Hors Vercel (auto-hébergement derrière un proxy inverse), seul le DERNIER
 *   maillon de `x-forwarded-for` a été ajouté par notre proxy ; les maillons de
 *   gauche viennent du client et sont falsifiables. `x-real-ip` n'est retenu
 *   que s'il est posé par ce proxy (comportement nginx standard).
 *
 * Une valeur qui n'est pas une IP valide est ignorée.
 */
export function adresseIpClient(headers: Headers): string {
  const surVercel = Boolean(process.env.VERCEL);
  const premier = (valeur: string | null) => valeur?.split(",")[0];
  const dernier = (valeur: string | null) => valeur?.split(",").at(-1);
  const candidats = surVercel
    ? [premier(headers.get("x-vercel-forwarded-for")), headers.get("x-real-ip"), premier(headers.get("x-forwarded-for"))]
    : [headers.get("x-real-ip"), dernier(headers.get("x-forwarded-for"))];
  for (const candidat of candidats) {
    const ip = normaliserIpRateLimit(candidat);
    if (ip) return ip;
  }
  return "ip-indisponible";
}

export async function hmacSha256(valeur: string, secret: string) {
  const encodeur = new TextEncoder();
  const cle = await crypto.subtle.importKey(
    "raw",
    encodeur.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cle, encodeur.encode(valeur));
  return Array.from(new Uint8Array(signature), (octet) => octet.toString(16).padStart(2, "0")).join("");
}

function identifiantPour(portee: PorteeRateLimit, request: Request, contexte: ContexteRateLimit) {
  if (portee === "utilisateur") return contexte.utilisateurId ?? null;
  if (portee === "entreprise") return contexte.entrepriseId ?? null;
  return adresseIpClient(request.headers);
}

/** Clé HMAC des identités de rate limit ; null en production si absente (fail closed). */
export function secretRateLimit() {
  return process.env.RATE_LIMIT_HMAC_KEY
    || (process.env.NODE_ENV === "production" ? null : "developpement-local-uniquement");
}

export async function appliquerRateLimit(
  request: Request,
  client: ClientRateLimit,
  politiques: readonly PolitiqueRateLimit[],
  contexte: ContexteRateLimit = {},
): Promise<ResultatRateLimit> {
  if (!politiques.length) return { autorise: true };
  const secret = secretRateLimit();
  if (!secret) return { autorise: false, statut: 503, reessayerApres: 60 };

  for (const politique of politiques) {
    const identifiant = identifiantPour(politique.portee, request, contexte);
    // Une politique mal placée ne doit jamais se rabattre sur une identité
    // partagée : ce serait un déni de service entre utilisateurs.
    if (!identifiant) return { autorise: false, statut: 503, reessayerApres: 60 };
    const identifiantHash = await hmacSha256(`${politique.portee}:${identifiant}`, secret);
    const { data, error } = await client.rpc("consommer_rate_limit", {
      p_cle: politique.cle,
      p_identifiant_hash: identifiantHash,
      p_fenetre_secondes: politique.fenetreSecondes,
      p_maximum: politique.maximum,
    });
    if (error) return { autorise: false, statut: 503, reessayerApres: 60 };
    const ligne = (Array.isArray(data) ? data[0] : data) as { autorise?: boolean; reessayer_apres?: number } | null;
    if (!ligne?.autorise) {
      return { autorise: false, statut: 429, reessayerApres: Math.max(1, Number(ligne?.reessayer_apres) || 1) };
    }
  }
  return { autorise: true };
}
