import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Empreinte HMAC-SHA256 avec un secret serveur, alignée sur Gestion Pro
// (`src/lib/security/rate-limit.ts`). L'identifiant en clair (id utilisateur)
// n'est jamais stocké ni transmis : seul le condensat part vers la RPC.
async function empreinteHmac(valeur: string, secret: string): Promise<string> {
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

function secretRateLimit(): string | null {
  return (
    process.env.RATE_LIMIT_HMAC_KEY
    || (process.env.NODE_ENV === "production" ? null : "developpement-local-uniquement")
  );
}

// Limite anti-bruteforce de la vérification du second facteur. Retourne true si
// la tentative est autorisée, false si la limite est atteinte, si le secret est
// absent en production ou si le compteur est indisponible (fail-closed). Le code
// TOTP n'est jamais transmis ici.
export async function tentativeMfaAutorisee(userId: string): Promise<boolean> {
  const secret = secretRateLimit();
  if (!secret) return false;
  try {
    const admin = createAdminClient();
    const identifiantHash = await empreinteHmac(`utilisateur:colors:mfa:${userId}`, secret);
    const { data, error } = await admin.rpc("consommer_rate_limit", {
      p_cle: "colors:mfa",
      p_identifiant_hash: identifiantHash,
      p_fenetre_secondes: 300,
      p_maximum: 5,
    });
    if (error) return false;
    const ligne = (Array.isArray(data) ? data[0] : data) as { autorise?: boolean } | null;
    return ligne?.autorise === true;
  } catch {
    return false;
  }
}
