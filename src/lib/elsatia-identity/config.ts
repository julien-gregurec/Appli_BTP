import "server-only";
import {
  assertTrustedUrl,
  createIdentityIssuer,
  IdentityError,
  parseSigningKeys,
  studioEntitlement,
  type IdentityIssuer,
} from "@elsatia/identity";
import { destinationInterneSure } from "@/lib/security/redirects";

// Identité centrale ELSATIA → applications à projet Supabase dédié (Studio).
// Toute la configuration est serveur uniquement ; la clé privée n'est JAMAIS dans le dépôt :
//   ELSATIA_IDENTITY_ISSUER        https://<gp>/identity (propre à l'environnement)
//   ELSATIA_IDENTITY_SIGNING_KEYS  {"current":{JWK privé},"previous":{JWK},"previous_retire_at":"…"}
//   ELSATIA_STUDIO_EXCHANGE_URL    https://<studio>/auth/elsatia/exchange
//   ELSATIA_STUDIO_LIFECYCLE_URL   https://<studio>/api/elsatia/lifecycle
//   STUDIO_ACCESS_MODE             open | allowlist | closed (FAIL-CLOSED)
//   STUDIO_ACCESS_ALLOWLIST        adresses ou @domaines

let cache: { raw: string; issuer: IdentityIssuer } | null = null;

export function identityIssuer(): IdentityIssuer {
  const raw = `${process.env.ELSATIA_IDENTITY_ISSUER ?? ""}\u0000${process.env.ELSATIA_IDENTITY_SIGNING_KEYS ?? ""}`;
  if (cache?.raw === raw) return cache.issuer;
  const issuerUrl = process.env.ELSATIA_IDENTITY_ISSUER;
  if (!issuerUrl) throw new IdentityError("CONFIG_INVALID", { detail: "ELSATIA_IDENTITY_ISSUER absente" });
  const issuer = createIdentityIssuer({ issuer: issuerUrl, keys: parseSigningKeys(process.env.ELSATIA_IDENTITY_SIGNING_KEYS) });
  cache = { raw, issuer };
  return issuer;
}

export function identityJwks() {
  return parseSigningKeys(process.env.ELSATIA_IDENTITY_SIGNING_KEYS).jwks();
}

export function studioExchangeUrl(): URL {
  return assertTrustedUrl(process.env.ELSATIA_STUDIO_EXCHANGE_URL ?? "", "ELSATIA_STUDIO_EXCHANGE_URL");
}

export function lifecycleEndpoints(): Record<string, string> {
  const studio = process.env.ELSATIA_STUDIO_LIFECYCLE_URL;
  return studio ? { studio: assertTrustedUrl(studio, "ELSATIA_STUDIO_LIFECYCLE_URL").toString() } : {};
}

export function studioAccessDecision(email: string) {
  return studioEntitlement(email, { mode: process.env.STUDIO_ACCESS_MODE, allowlist: process.env.STUDIO_ACCESS_ALLOWLIST });
}

/** Seules les routes d'identité peuvent servir de retour après connexion GP (pas de redirection ouverte). */
export function destinationIdentiteApresConnexion(next: string | null | undefined): string | null {
  const sure = destinationInterneSure(next, "");
  return sure.startsWith("/identity/") ? sure : null;
}
