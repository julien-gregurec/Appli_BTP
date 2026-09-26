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

type ClientRateLimit = {
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
    if (chemin === "/login") return [{ cle: "auth:login", maximum: 10, fenetreSecondes: 600, portee: "ip" }];
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

function adresseIp(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || headers.get("x-real-ip")?.trim()
    || "ip-indisponible";
}

async function hmacSha256(valeur: string, secret: string) {
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
  return adresseIp(request.headers);
}

export async function appliquerRateLimit(
  request: Request,
  client: ClientRateLimit,
  politiques: readonly PolitiqueRateLimit[],
  contexte: ContexteRateLimit = {},
): Promise<ResultatRateLimit> {
  if (!politiques.length) return { autorise: true };
  const secret = process.env.RATE_LIMIT_HMAC_KEY
    || (process.env.NODE_ENV === "production" ? null : "developpement-local-uniquement");
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
